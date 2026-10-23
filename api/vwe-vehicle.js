const {session,configured}=require('./_admin-security');
const {record}=require('./_vwe-monitor');

// Only VWE acceptance requests. Never expose or persist OAuth credentials or vehicle data.
let cachedToken=null,tokenExpiry=0,pendingAuth=null;
const ENDPOINTS=Object.freeze({
 advanced:'/rdw/vehicle/advanced',
 inspections:'/rdw/mot/inspections',
 repairs:'/rdw/mot/repairs',
 emission:'/rdw/emission'
});
const RETRYABLE=new Set([502,503,504]);
const WAIT_MS=220;
const AUTH_TIMEOUT_MS=8000;
const VEHICLE_TIMEOUT_MS=9000;

function explainUpstream(status,stage){
 if(status===400)return 'VWE accepteert de parameters voor dit endpoint niet';
 if(status===401)return stage==='authentication'?'VWE weigert de authenticatiegegevens':'VWE heeft het toegangstoken geweigerd';
 if(status===403)return 'Geen toegang tot dit VWE-product';
 if(status===404)return 'VWE-endpoint of kenteken niet gevonden';
 if(status===429)return 'VWE heeft de aanvraaglimiet bereikt';
 if(status>=500)return 'De VWE-server geeft tijdelijk een fout';
 return stage==='authentication'?'VWE-authenticatie mislukt':'VWE heeft de voertuigaanvraag afgewezen';
}
function clearTokenIfCurrent(value){
 if(cachedToken===value){cachedToken=null;tokenExpiry=0}
}
async function getAccessToken(base){
 if(cachedToken&&Date.now()<tokenExpiry)return {ok:true,access_token:cachedToken};
 if(pendingAuth)return pendingAuth;
 pendingAuth=(async()=>{
  const form=new URLSearchParams({
   grant_type:process.env.VWE_GRANT_TYPE,
   client_id:process.env.VWE_CLIENT_ID,
   client_secret:process.env.VWE_CLIENT_SECRET,
   scope:process.env.VWE_SCOPE
  });
  const response=await fetch(new URL('/authenticate/token',base),{
   method:'POST',
   headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:form,signal:AbortSignal.timeout(AUTH_TIMEOUT_MS)
  });
  const token=await response.json().catch(()=>({}));
  if(!response.ok)return {ok:false,status:response.status,code:'VWE_AUTH_REJECTED'};
  if(!token.access_token)return {ok:false,status:response.status,code:'VWE_AUTH_TOKEN_MISSING'};
  cachedToken=token.access_token;
  const seconds=Number(token.expires_in)||0;
  tokenExpiry=Date.now()+Math.max(0,Math.min(seconds,3600)-60)*1000;
  return {ok:true,access_token:cachedToken};
 })();
 try{return await pendingAuth}finally{pendingAuth=null}
}
async function refreshRejectedToken(base,rejected){
 // Another request may have already refreshed the shared token.
 if(cachedToken&&cachedToken!==rejected&&Date.now()<tokenExpiry)return {ok:true,access_token:cachedToken};
 clearTokenIfCurrent(rejected);
 return getAccessToken(base);
}
const elapsed=start=>Date.now()-start;
async function finish(res,code,payload,metrics){
 // Passive, best-effort telemetry; storage failure never masks a vehicle result.
 await record({
  ...metrics,ok:code===200,status:code,
  stage:payload.stage||'vehicle',code:payload.code||'',
  upstreamStatus:payload.upstreamStatus||null,
  durationMs:elapsed(metrics.startedAt)
 });
 return res.status(code).json(payload);
}

module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type','application/json');
 if(process.env.VERCEL_ENV!=='preview')return res.status(404).json({error:'Niet beschikbaar'});
 if(req.method!=='GET')return res.status(405).json({error:'Methode niet toegestaan'});
 try{if(!configured()||!await session(req))return res.status(401).json({error:'Admin-login vereist',code:'ADMIN_LOGIN_REQUIRED',stage:'session'})}
 catch{return res.status(503).json({error:'Admin-authenticatie tijdelijk niet beschikbaar',code:'ADMIN_SESSION_ERROR',stage:'session'})}
 const plate=String(req.query.licensePlate||'').replace(/[^a-zA-Z0-9]/g,'').toUpperCase();
 if(!/^[A-Z0-9]{4,8}$/.test(plate))return res.status(400).json({error:'Ongeldig kenteken',code:'INVALID_PLATE',stage:'validation'});
 const dataset=String(req.query.dataset||'advanced');
 if(!Object.prototype.hasOwnProperty.call(ENDPOINTS,dataset))return res.status(400).json({error:'Onbekende VWE-testfunctie',code:'UNKNOWN_DATASET',stage:'validation'});
 const metrics={dataset,startedAt:Date.now(),attempts:0,tokenRefreshes:0};
 const keys=['VWE_CLIENT_ID','VWE_CLIENT_SECRET','VWE_SCOPE','VWE_GRANT_TYPE','VWE_BASE_URL'];
 if(keys.some(key=>!process.env[key]))return finish(res,503,{error:'VWE-configuratie ontbreekt',code:'VWE_NOT_CONFIGURED',stage:'configuration'},metrics);
 let stage='configuration';
 try{
  const base=new URL(process.env.VWE_BASE_URL);
  if(base.origin!=='https://acceptatie-interdata-rest.vwe.nl')
   return finish(res,400,{error:'Ongeldige VWE-omgeving',code:'VWE_INVALID_ENV',stage:'configuration'},metrics);
  stage='authentication';
  let token=await getAccessToken(base);
  if(!token.ok)return finish(res,token.status===429?503:502,{
   error:token.code==='VWE_AUTH_TOKEN_MISSING'?'VWE heeft geen bruikbaar toegangstoken teruggegeven':explainUpstream(token.status,'authentication'),
   code:token.code,stage,upstreamStatus:token.status
  },metrics);
  stage='vehicle';
  const endpoint=new URL(ENDPOINTS[dataset],base);
  endpoint.searchParams.set('licensePlate',plate);
  // Max 2 vehicle GETs: one original + one retry, regardless of the trigger.
  // Never retry 400/403/404/429 or uncertain network failures (risk of extra charges).
  for(let attempt=1;attempt<=2;attempt++){
   metrics.attempts=attempt;
   const response=await fetch(endpoint,{
    method:'GET',
    headers:{Authorization:'Bearer '+token.access_token,Accept:'application/json'},
    signal:AbortSignal.timeout(VEHICLE_TIMEOUT_MS)
   });
   if(response.status===401&&attempt===1){
    stage='authentication';
    token=await refreshRejectedToken(base,token.access_token);
    metrics.tokenRefreshes++;
    if(!token.ok)return finish(res,token.status===429?503:502,{
     error:explainUpstream(token.status,'authentication'),code:token.code,stage,
     upstreamStatus:token.status,dataset
    },metrics);
    stage='vehicle';
    continue;
   }
   if(RETRYABLE.has(response.status)&&attempt===1){
    await new Promise(resolve=>setTimeout(resolve,WAIT_MS));
    continue;
   }
   if(response.status===401)clearTokenIfCurrent(token.access_token);
   if(!response.ok){
    const upstreamStatus=response.status;
    return finish(res,upstreamStatus===403?403:upstreamStatus===429?503:502,{
     error:explainUpstream(upstreamStatus,'vehicle'),
     code:'VWE_UPSTREAM_'+upstreamStatus,
     stage:'vehicle',upstreamStatus,dataset,
     diagnostics:{attempts:metrics.attempts,tokenRefreshed:metrics.tokenRefreshes>0}
    },metrics);
   }
   const data=await response.json().catch(()=>null);
   if(data===null)return finish(res,502,{
    error:'VWE heeft geen geldig JSON-antwoord teruggegeven',
    code:'VWE_INVALID_RESPONSE',stage:'vehicle',dataset,
    diagnostics:{attempts:metrics.attempts,tokenRefreshed:metrics.tokenRefreshes>0}
   },metrics);
   return finish(res,200,{
    licensePlate:plate,source:'VWE acceptatie',dataset,vehicle:data,
    diagnostics:{attempts:metrics.attempts,tokenRefreshed:metrics.tokenRefreshes>0,durationMs:elapsed(metrics.startedAt)}
   },metrics);
  }
 }catch(err){
  const timedOut=err?.name==='TimeoutError'||err?.name==='AbortError';
  // Never log tokens, passwords, plates, detailed upstream URLs or response bodies.
  console.warn('VWE preview error',{stage,category:timedOut?'TIMEOUT':'NETWORK_OR_PARSE'});
  return finish(res,timedOut?504:502,{
   error:timedOut?'VWE reageert niet op tijd':'VWE kan momenteel niet worden bereikt',
   code:timedOut?'VWE_TIMEOUT':'VWE_NETWORK_ERROR',stage,dataset,
   diagnostics:{attempts:metrics.attempts,tokenRefreshed:metrics.tokenRefreshes>0}
  },metrics);
 }
 return finish(res,502,{error:'VWE-aanvraag niet voltooid',code:'VWE_UNEXPECTED_STATE',stage:'vehicle',dataset},metrics);
};
