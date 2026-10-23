/* Preview-only, privacy-minimized passive VWE request monitoring.
 * Never stores plates, credentials, tokens, response bodies or raw upstream URLs.
 * No monitoring request may trigger a VWE call.
 */
const PREFIX='cf:vwe:preview:';
const DATASETS=['advanced','inspections','repairs','emission'];
const REST_URL=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL;
const REST_TOKEN=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
const RETAIN_SECONDS=7*86400;
function safeInt(n,max){const x=Number(n);return Number.isFinite(x)?Math.min(max,Math.max(0,Math.round(x))):null}
function normalize(input){
 const dataset=String(input.dataset||'');
 if(!DATASETS.includes(dataset))return null;
 const now=new Date().toISOString();
 return {
  at:now,
  dataset,
  outcome:input.ok===true?'success':'error',
  stage:['authentication','configuration','vehicle'].includes(input.stage)?input.stage:'vehicle',
  status:safeInt(input.status,599),
  upstreamStatus:safeInt(input.upstreamStatus,599),
  code:String(input.code||'').slice(0,60).replace(/[^A-Z0-9_]/g,''),
  durationMs:safeInt(input.durationMs,120000),
  attempts:safeInt(input.attempts,2),
  tokenRefreshes:safeInt(input.tokenRefreshes,1)
 };
}
async function record(event){
 if(process.env.VERCEL_ENV!=='preview'||!REST_URL||!REST_TOKEN)return false;
 const entry=normalize(event);
 if(!entry)return false;
 const data=JSON.stringify(entry);
 const list=PREFIX+'recent',last=PREFIX+'last:'+entry.dataset+':'+entry.outcome;
 const operations=[
  ['LPUSH',list,data],
  ['LTRIM',list,'0','199'],
  ['EXPIRE',list,String(RETAIN_SECONDS)],
  ['SET',last,data,'EX',String(RETAIN_SECONDS)]
 ];
 try{
  const response=await fetch(REST_URL.replace(/\/$/,'')+'/pipeline',{
   method:'POST',
   headers:{Authorization:'Bearer '+REST_TOKEN,'Content-Type':'application/json'},
   body:JSON.stringify(operations),
   signal:AbortSignal.timeout(1800)
  });
  if(!response.ok)return false;
  const result=await response.json();
  return Array.isArray(result)&&result.every(item=>!item?.error);
 }catch{return false}
}
module.exports={record,DATASETS,PREFIX,RETAIN_SECONDS};
