/* Preview-only request coordination; in-memory per warm serverless instance.
   Limits bursts, coalesces identical in-flight GETs, and backs off after upstream overload.
   Never persists license plates or responses, and does not contact VWE by itself. */
const crypto=require('node:crypto');
const activeRequests=new Map();
const queue=[];
const MAX_QUEUE=12;
let running=0;
let slowUntil=0;
let rateLimitUntil=0;
const now=()=>Date.now();
const keyFor=(plate,dataset)=>crypto.createHash('sha256').update(dataset+'|'+plate).digest('hex');
const limit=()=>now()<slowUntil?1:2;
function status(){
 return {running,queued:queue.length,activeKeys:activeRequests.size,
  concurrencyLimit:limit(),slowMode:now()<slowUntil,rateLimited:now()<rateLimitUntil};
}
function noteUpstream(status){
 if(status===429){rateLimitUntil=Math.max(rateLimitUntil,now()+15000);slowUntil=Math.max(slowUntil,now()+45000);pump()}
 else if([502,503,504].includes(status)){slowUntil=Math.max(slowUntil,now()+45000)}
}
function pump(){
 if(now()<rateLimitUntil){
  // Drop queued work after VWE announces an upstream 429, even if it was queued earlier.
  while(queue.length){
   const queued=queue.shift();
   queued.resolve({http:503,data:{error:'VWE-aanvragen tijdelijk afgeremd na limietmelding',code:'VWE_BACKOFF',stage:'traffic',upstreamStatus:429},metrics:{attempts:0,tokenRefreshes:0}});
  }
  return;
 }
 while(running<limit()&&queue.length){
  const job=queue.shift();running++;
  Promise.resolve().then(job.fn).then(job.resolve,job.reject).finally(()=>{
   running--;pump();
  });
 }
}
function submit(plate,dataset,fn){
 const key=keyFor(plate,dataset);
 const existing=activeRequests.get(key);
 if(existing)return {coalesced:true,promise:existing};
 if(now()<rateLimitUntil)return {coalesced:false,blocked:true,
  promise:Promise.resolve({http:503,data:{error:'VWE-aanvragen tijdelijk afgeremd na limietmelding',code:'VWE_BACKOFF',stage:'traffic',upstreamStatus:429}})};
 if(queue.length>=MAX_QUEUE)return {coalesced:false,blocked:true,
  promise:Promise.resolve({http:503,data:{error:'Te veel gelijktijdige testaanvragen; probeer later opnieuw',code:'VWE_QUEUE_FULL',stage:'traffic'}})};
 const promise=new Promise((resolve,reject)=>{queue.push({fn,resolve,reject});pump()});
 activeRequests.set(key,promise);
 // Removal is triggered after settlement but does not create an unhandled rejection.
 promise.then(()=>activeRequests.delete(key),()=>activeRequests.delete(key));
 return {coalesced:false,promise};
}
module.exports={submit,noteUpstream,status};
