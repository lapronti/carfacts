'use strict';
/** Full handler integration exercised with synthetic responses only. */
const {test}=require('node:test');
const assert=require('node:assert/strict');
const Module=require('node:module');
const path=require('node:path');

async function runCase({
 auth=[200],vehicle=[200],vehicleJSON={make:{name:'Volkswagen'},model:{name:'Caddy'}},
 authPayloads, dataset='advanced'
}={}){
 const originalEnv={...process.env};
 const originalLoad=Module._load;
 const originalFetch=global.fetch;
 const entry=path.resolve(__dirname,'../../api/vwe-vehicle.js');
 const actualFetches=[];
 const telemetry=[];
 let authCount=0,vehicleCount=0;
 process.env.VERCEL_ENV='preview';
 process.env.VWE_CLIENT_ID='fake-id';
 process.env.VWE_CLIENT_SECRET='fake-secret';
 process.env.VWE_SCOPE='fake-scope';
 process.env.VWE_GRANT_TYPE='client_credentials';
 process.env.VWE_BASE_URL='https://acceptatie-interdata-rest.vwe.nl';
 try{
  Module._load=function(name,parent,isMain){
   if(parent?.filename===entry){
    if(name==='./_admin-security')return {configured:()=>true,session:async()=>true};
    if(name==='./_vwe-monitor')return {record:async event=>{telemetry.push(event);return true}};
    if(name==='./_vwe-traffic')return {
     submit:(plate,kind,fn)=>({coalesced:false,promise:Promise.resolve().then(fn)}),
     noteUpstream:()=>{}
    };
   }
   return originalLoad.apply(this,arguments);
  };
  delete require.cache[require.resolve(entry)];
  const handler=require(entry);
  global.fetch=async url=>{
   actualFetches.push(String(url));
   if(String(url).includes('/authenticate/token')){
    const status=auth[Math.min(authCount++,auth.length-1)];
    return {ok:status===200,status,json:async()=>authPayloads?.[authCount-1]??{
     access_token:'synthetic-access-'+authCount,expires_in:3600
    }};
   }
   const status=vehicle[Math.min(vehicleCount++,vehicle.length-1)];
   return {ok:status===200,status,json:async()=>vehicleJSON};
  };
  const response={
   setHeader(){},
   status(n){this.http=n;return this},
   json(value){this.payload=value;return value}
  };
  await handler({method:'GET',query:{licensePlate:'VDZ39P',dataset}},response);
  return {status:response.http,body:response.payload,authCount,vehicleCount,
   telemetry,calls:actualFetches};
 }finally{
  Module._load=originalLoad;
  global.fetch=originalFetch;
  delete require.cache[require.resolve(entry)];
  for(const key of Object.keys(process.env))if(!(key in originalEnv))delete process.env[key];
  Object.assign(process.env,originalEnv);
 }
}

test('valid VWE response passes Zod and does not leak credentials',async()=>{
 const r=await runCase();
 assert.equal(r.status,200);
 assert.equal(r.body.dataStatus,'received');
 assert.equal(r.vehicleCount,1);
 assert.equal(r.telemetry.length,1);
 assert.equal(r.body.vehicle.make.name,'Volkswagen');
 assert.equal(JSON.stringify(r.body).includes('synthetic-access'),false);
});

test('malformed VWE object returns safe 502 with validation stage',async()=>{
 const r=await runCase({vehicleJSON:{make:[{name:'not an object'}]}});
 assert.equal(r.status,502);
 assert.equal(r.body.code,'VWE_INVALID_DATA');
 assert.equal(r.body.stage,'validation');
 assert.equal(JSON.stringify(r.body).includes('not an object'),false);
 assert.equal(r.vehicleCount,1);
});

test('expired token refreshes once then retries a read-only vehicle request',async()=>{
 const r=await runCase({auth:[200,200],vehicle:[401,200]});
 assert.equal(r.status,200);
 assert.equal(r.authCount,2);
 assert.equal(r.vehicleCount,2);
 assert.equal(r.body.diagnostics.tokenRefreshed,true);
});

test('temporary 502 retries at most once',async()=>{
 const r=await runCase({vehicle:[502,200]});
 assert.equal(r.status,200);
 assert.equal(r.vehicleCount,2);
 assert.equal(r.body.diagnostics.attempts,2);
});

test('403 is never automatically retried',async()=>{
 const r=await runCase({vehicle:[403]});
 assert.equal(r.status,403);
 assert.equal(r.vehicleCount,1);
 assert.equal(r.body.code,'VWE_UPSTREAM_403');
});

test('invalid OAuth token is rejected without sending vehicle requests',async()=>{
 const r=await runCase({authPayloads:[{access_token:{bad:'token'}}]});
 assert.equal(r.status,502);
 assert.equal(r.body.code,'VWE_AUTH_TOKEN_INVALID');
 assert.equal(r.vehicleCount,0);
});

test('successful but empty inspection response stays empty, not missing history',async()=>{
 const r=await runCase({dataset:'inspections',vehicleJSON:{inspections:[]}});
 assert.equal(r.status,200);
 assert.equal(r.body.dataStatus,'empty');
});
