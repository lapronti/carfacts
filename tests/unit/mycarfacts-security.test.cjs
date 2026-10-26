'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const path=require('node:path');
const BASE=path.resolve(__dirname,'../../api');
const COOKIE_NAME='cf_portal=';
const HOST='test.car-facts.nl';

async function createHarness(){
 const originalLoad=Module._load,originalEnv={...process.env};
 const redis=new Map(),hashes=new Map(),mails=[],network=[];
 const redisCall=async(name,...args)=>{
  const key=String(args[0]);
  if(name==='GET')return redis.get(key)??null;
  if(name==='SET'){redis.set(key,args[1]);return 'OK'}
  if(name==='DEL'){const present=redis.delete(key);const hashPresent=hashes.delete(key);return Number(present||hashPresent)}
  if(name==='GETDEL'){const value=redis.get(key)??null;redis.delete(key);return value}
  if(name==='INCR'){const n=Number(redis.get(key)||0)+1;redis.set(key,String(n));return n}
  if(name==='EXPIRE')return 1;
  if(name==='HSET'){
   if(!hashes.has(key))hashes.set(key,new Map());
   hashes.get(key).set(args[1],args[2]);return 1;
  }
  if(name==='HGET')return hashes.get(key)?.get(args[1])??null;
  if(name==='HGETALL'){
   const out=[];for(const [field,value] of hashes.get(key)||[])out.push(field,value);
   return out;
  }
  if(name==='HEXISTS')return Number(hashes.get(key)?.has(args[1])||false);
  if(name==='HLEN')return hashes.get(key)?.size||0;
  if(name==='HDEL')return Number(hashes.get(key)?.delete(args[1])||false);
  throw Error('Unexpected Redis command '+name);
 };
 const fakeMailer={createTransport:()=>({
  async sendMail(mail){mails.push(mail);return {messageId:'synthetic'}},
  close(){}
 })};
 process.env.VERCEL_ENV='preview';
 process.env.CARFACTS_PORTAL_SECRET='synthetic-portal-secret-very-long-test-only';
 process.env.KV_REST_API_URL='https://offline.invalid';
 process.env.KV_REST_API_TOKEN='synthetic-not-real';
 process.env.SMTP_HOST='offline.invalid';
 process.env.SMTP_PORT='465';
 process.env.MAIL_USER='carfacts@example.test';
 process.env.MAIL_PASSWORD='synthetic';
 Module._load=function(name,parent,isMain){
  if(name==='nodemailer'&&parent?.filename===path.resolve(BASE,'_mycarfacts.js'))return fakeMailer;
  if(name==='./_analytics'&&parent?.filename===path.resolve(BASE,'_mycarfacts.js'))
   return {cmd:redisCall};
  return originalLoad.apply(this,arguments);
 };
 for(const file of ['_mycarfacts','mycarfacts-auth','mycarfacts-vehicles','mycarfacts-reports'])
  delete require.cache[require.resolve(path.resolve(BASE,file+'.js'))];
 const auth=require(path.resolve(BASE,'mycarfacts-auth.js'));
 const vehicles=require(path.resolve(BASE,'mycarfacts-vehicles.js'));
 const reports=require(path.resolve(BASE,'mycarfacts-reports.js'));
 async function req(handler,method='GET',body={},cookie='',origin='https://'+HOST){
  const headers={host:HOST,origin};
  if(cookie)headers.cookie=cookie;
  const res={
   headers:{},
   setHeader(k,v){this.headers[k]=v},
   status(n){this.statusCode=n;return this},
   json(data){this.data=data;return data}
  };
  await handler({method,headers,body,socket:{remoteAddress:'127.0.0.1'}},res);
  return res;
 }
 async function login(email){
  const request=await req(auth,'POST',{action:'request_code',email});
  assert.equal(request.statusCode,200,JSON.stringify(request.data));
  const mail=mails.at(-1);
  const code=mail.text.match(/:\s*(\d{6})/)[1];
  const verified=await req(auth,'POST',{action:'verify_code',email,code});
  assert.equal(verified.statusCode,200,JSON.stringify(verified.data));
  return verified.headers['Set-Cookie'].split(';')[0];
 }
 function restore(){
  Module._load=originalLoad;
  for(const file of ['_mycarfacts','mycarfacts-auth','mycarfacts-vehicles','mycarfacts-reports'])
   delete require.cache[require.resolve(path.resolve(BASE,file+'.js'))];
  for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];
  Object.assign(process.env,originalEnv);
 }
 return {auth,vehicles,reports,req,login,restore,redis,hashes,mails,network};
}

test('preview portal blocks public vehicle access and cross-origin posts',async()=>{
 const h=await createHarness();
 try{
  assert.equal((await h.req(h.vehicles)).statusCode,401);
  const foreign=await h.req(h.auth,'POST',{action:'request_code',email:'first@example.test'},'', 'https://other.example.test');
  assert.equal(foreign.statusCode,403);
  assert.equal(h.mails.length,0);
  assert.equal((await h.req(h.reports,'POST',{})).statusCode,405);
 }finally{h.restore()}
});

test('email one-time verification is consumed once and sets a scoped HttpOnly cookie',async()=>{
 const h=await createHarness();
 try{
  const email='first@example.test';
  const request=await h.req(h.auth,'POST',{action:'request_code',email});
  assert.equal(request.statusCode,200);
  assert.equal(h.mails.length,1);
  const code=h.mails[0].text.match(/:\s*(\d{6})/)[1];
  assert.equal((await h.req(h.auth,'POST',{action:'verify_code',email,code:'000000'===code?'111111':'000000'})).statusCode,401);
  const verified=await h.req(h.auth,'POST',{action:'verify_code',email,code});
  assert.equal(verified.statusCode,200);
  assert.match(verified.headers['Set-Cookie'],/HttpOnly/);
  assert.match(verified.headers['Set-Cookie'],/Secure/);
  assert.match(verified.headers['Set-Cookie'],/SameSite=Strict/);
  assert.match(verified.headers['Set-Cookie'],/Path=\/api\/mycarfacts/);
  assert.equal(verified.headers['Set-Cookie'].includes(email),false);
  const cookie=verified.headers['Set-Cookie'].split(';')[0];
  assert.match(cookie,/^cf_portal=[a-f0-9]{64}$/);
  assert.equal((await h.req(h.auth,'POST',{action:'verify_code',email,code})).statusCode,401);
  const status=await h.req(h.auth,'GET',{},cookie);
  assert.equal(status.data.loggedIn,true);
  assert.equal(status.data.email,email);
 }finally{h.restore()}
});

test('two customers have independent vehicle storage and cannot delete each other',async()=>{
 const h=await createHarness();
 try{
  const a=await h.login('alice@example.test'),b=await h.login('bob@example.test');
  assert.equal((await h.req(h.vehicles,'POST',{
   action:'save',plate:'VDZ-39-P',make:'Volkswagen',model:'Caddy',label:'Mijn bestelwagen'
  },a)).statusCode,200);
  const own=await h.req(h.vehicles,'GET',{},a);
  const other=await h.req(h.vehicles,'GET',{},b);
  assert.equal(own.data.vehicles.length,1);
  assert.equal(own.data.vehicles[0].plate,'VDZ39P');
  assert.equal(other.data.vehicles.length,0);
  await h.req(h.vehicles,'POST',{action:'delete',plate:'VDZ39P'},b);
  assert.equal((await h.req(h.vehicles,'GET',{},a)).data.vehicles.length,1);
  assert.equal((await h.req(h.vehicles,'GET',{},b)).data.vehicles.length,0);
  const payloads=[...h.hashes.values()].flatMap(map=>[...map.values()]);
  assert.equal(payloads.some(x=>String(x).includes('maintenanceHistory')),false);
 }finally{h.restore()}
});

test('vehicle inputs are validated, and data deletion revokes only own account session',async()=>{
 const h=await createHarness();
 try{
  const a=await h.login('one@example.test'),b=await h.login('two@example.test');
  assert.equal((await h.req(h.vehicles,'POST',{action:'save',plate:'@@'},a)).statusCode,400);
  assert.equal((await h.req(h.vehicles,'POST',{action:'save',plate:'AB1234',label:'x'.repeat(200)},a)).statusCode,400);
  assert.equal((await h.req(h.vehicles,'POST',{action:'save',plate:'AB1234',label:'Een auto'},a)).statusCode,200);
  assert.equal((await h.req(h.vehicles,'POST',{action:'save',plate:'AB5678',label:'Andere auto'},b)).statusCode,200);
  const cleared=await h.req(h.vehicles,'POST',{action:'delete_account_data'},a);
  assert.equal(cleared.statusCode,200);
  assert.match(cleared.headers['Set-Cookie'],/Max-Age=0/);
  assert.equal((await h.req(h.vehicles,'GET',{},a)).statusCode,401);
  assert.equal((await h.req(h.vehicles,'GET',{},b)).data.vehicles.length,1);
 }finally{h.restore()}
});

test('customer cannot create paid reports or call VWE from portal',async()=>{
 const h=await createHarness();
 try{
  const cookie=await h.login('report@example.test');
  const overview=await h.req(h.reports,'GET',{},cookie);
  assert.equal(overview.statusCode,200);
  assert.equal(overview.data.enabled,false);
  assert.equal(overview.data.purchasesEnabled,false);
  assert.deepEqual(overview.data.reports,[]);
  assert.equal((await h.req(h.reports,'POST',{action:'purchase'},cookie)).statusCode,405);
  assert.equal(h.network.length,0);
 }finally{h.restore()}
});

test('five email-code requests trigger tenant rate limit',async()=>{
 const h=await createHarness();
 try{
  const email='limited@example.test';
  for(let i=0;i<4;i++)assert.equal((await h.req(h.auth,'POST',{action:'request_code',email})).statusCode,200);
  assert.equal((await h.req(h.auth,'POST',{action:'request_code',email})).statusCode,429);
  assert.equal(h.mails.length,4);
 }finally{h.restore()}
});

test('production environment blocks every customer API route',async()=>{
 const h=await createHarness();
 try{
  process.env.VERCEL_ENV='production';
  assert.equal((await h.req(h.auth,'GET')).statusCode,404);
  assert.equal((await h.req(h.vehicles,'GET')).statusCode,404);
  assert.equal((await h.req(h.reports,'GET')).statusCode,404);
 }finally{h.restore()}
});
