'use strict';
/* Carfacts customer portal (preview only).
 * Independent of administrator login: no admin cookies or credentials are accepted.
 * Email and license plates may be personal data: never log them or send them to
 * external vehicle providers here. Tenant keys are keyed hashes, not plain email.
 */
const crypto=require('node:crypto');
const {cmd}=require('./_analytics');
const {z}=require('zod');

const PREFIX='cf:portal:v1';
const SESSION_SECONDS=14*86400,OTP_SECONDS=600;
const emailSchema=z.string().trim().toLowerCase().email().max(254);
const codeSchema=z.string().regex(/^\d{6}$/);
const vehicleSchema=z.object({
 plate:z.string().trim().transform(x=>x.replace(/[^a-z0-9]/gi,'').toUpperCase())
  .pipe(z.string().regex(/^[A-Z0-9]{4,8}$/)),
 make:z.string().trim().max(70).default(''),
 model:z.string().trim().max(100).default(''),
 label:z.string().trim().max(80).default('')
}).strict();

const secret=()=>process.env.CARFACTS_PORTAL_SECRET||process.env.CARFACTS_ADMIN_SECRET||'';
const storageReady=()=>!!((process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL)
 &&(process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN)&&secret().length>=24);
const mailReady=()=>!!(process.env.SMTP_HOST&&process.env.MAIL_USER&&process.env.MAIL_PASSWORD);
const portalReady=()=>storageReady()&&mailReady();
function digest(purpose,value){
 // Domain-separated HMAC ensures this portal cannot forge the existing admin session.
 return crypto.createHmac('sha256',secret()).update(PREFIX+'|'+purpose+'|'+String(value)).digest('hex');
}
const userKey=email=>digest('user',email);
const cookieName='cf_portal';
function cookieFrom(req){
 const headers=String(req.headers?.cookie||'');
 const matched=headers.match(/(?:^|;\s*)cf_portal=([a-f0-9]{64})(?:;|$)/);
 return matched?.[1]||null;
}
const cookie=value=>cookieName+'='+value+'; HttpOnly; Secure; SameSite=Strict; Path=/api/mycarfacts; Max-Age='+SESSION_SECONDS;
const clearCookie=()=>cookieName+'=; HttpOnly; Secure; SameSite=Strict; Path=/api/mycarfacts; Max-Age=0';
function reply(res,http,payload){
 res.setHeader('Cache-Control','no-store, max-age=0');
 res.setHeader('Pragma','no-cache');
 res.setHeader('X-Content-Type-Options','nosniff');
 return res.status(http).json(payload);
}
function onlyPreview(req,res){
 if(process.env.VERCEL_ENV!=='preview'){
  reply(res,404,{error:'Niet beschikbaar'});
  return false;
 }
 return true;
}
function validOrigin(req){
 // All writes require browser same-origin evidence; no cross-origin credentials.
 try{
  const origin=req.headers.origin;
  const host=req.headers.host;
  const u=new URL(origin);
  return u.protocol==='https:'&&u.host===host;
 }catch{return false}
}
async function rateLimit(purpose,identity,max,ttl){
 const key=PREFIX+':ratelimit:'+digest(purpose,identity);
 const attempts=Number(await cmd('INCR',key));
 if(attempts===1)await cmd('EXPIRE',key,ttl);
 return attempts<=max;
}
async function sendCode(email,code){
 const nodemailer=require('nodemailer');
 const port=Number(process.env.SMTP_PORT||465);
 if(![465,587].includes(port))throw Error('SMTP_CONFIGURATION');
 const transport=nodemailer.createTransport({
  host:process.env.SMTP_HOST,port,
  secure:port===465,requireTLS:port===587,
  auth:{user:process.env.MAIL_USER,pass:process.env.MAIL_PASSWORD},
  connectionTimeout:7000,greetingTimeout:7000,socketTimeout:9000
 });
 try{
  await transport.sendMail({
   from:process.env.CARFACTS_PORTAL_MAIL_FROM||process.env.MAIL_USER,
   to:email,subject:'Jouw inlogcode voor Mijn Carfacts',
   text:'Je eenmalige inlogcode voor Mijn Carfacts is: '+code+
    '\n\nDeze code is 10 minuten geldig. Heb je geen code aangevraagd? Negeer dit bericht.',
   html:undefined
  });
 }finally{transport.close()}
}
async function session(req){
 if(!storageReady())return null;
 const raw=cookieFrom(req);
 if(!raw)return null;
 const encoded=await cmd('GET',PREFIX+':session:'+digest('session',raw));
 if(!encoded)return null;
 try{
  const record=JSON.parse(encoded);
  if(!emailSchema.safeParse(record.email).success)return null;
  if(record.uid!==userKey(record.email))return null;
  return {email:record.email,uid:record.uid};
 }catch{return null}
}
async function issueSession(res,email){
 const raw=crypto.randomBytes(32).toString('hex');
 const key=PREFIX+':session:'+digest('session',raw);
 const uid=userKey(email);
 await cmd('SET',key,JSON.stringify({email,uid}),'EX',SESSION_SECONDS);
 await cmd('SADD',sessionIndexKey(uid),digest('session',raw));
 await cmd('EXPIRE',sessionIndexKey(uid),SESSION_SECONDS);
 res.setHeader('Set-Cookie',cookie(raw));
}
async function revoke(req,res){
 const raw=cookieFrom(req);
 if(raw){
  const current=await session(req);
  const hash=digest('session',raw);
  await cmd('DEL',PREFIX+':session:'+hash);
  if(current)await cmd('SREM',sessionIndexKey(current.uid),hash);
 }
 res.setHeader('Set-Cookie',clearCookie());
}
const sessionIndexKey=uid=>PREFIX+':session-index:'+uid;
const userVehiclesKey=uid=>PREFIX+':vehicles:'+uid;
const userReportsKey=uid=>PREFIX+':reports:'+uid;
function redisPairs(value){
 if(Array.isArray(value)){
  const pairs=[];for(let i=0;i+1<value.length;i+=2)pairs.push([value[i],value[i+1]]);
  return pairs;
 }
 if(value&&typeof value==='object')return Object.entries(value);
 return [];
}
function safeObjectEntries(value,limit=25){
 return redisPairs(value).slice(0,limit).map(([,json])=>{
  try{return JSON.parse(json)}catch{return null}
 }).filter(Boolean);
}
function publicSession(record){
 return {loggedIn:!!record,email:record?.email||null};
}
async function authorized(req,res){
 try{
  if(!storageReady()){reply(res,503,{error:'Klantenportaal nog niet geconfigureerd'});return null}
  const user=await session(req);
  if(!user){reply(res,401,{error:'Log in bij Mijn Carfacts'});return null}
  return user;
 }catch{
  reply(res,503,{error:'Sessiecontrole tijdelijk niet beschikbaar'});
  return null;
 }
}
module.exports={
 PREFIX,OTP_SECONDS,SESSION_SECONDS,emailSchema,codeSchema,vehicleSchema,
 digest,userKey,cookieFrom,storageReady,mailReady,portalReady,
 onlyPreview,validOrigin,rateLimit,sendCode,session,issueSession,revoke,
 reply,publicSession,authorized,redisPairs,safeObjectEntries,
 userVehiclesKey,userReportsKey,sessionIndexKey,cmd
};
