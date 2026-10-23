const {session,configured}=require('./_admin-security');
const {record}=require('./_vwe-monitor');
const traffic=require('./_vwe-traffic');

// Isolated VWE acceptance environment; never make RDW requests or store vehicle data.
let cachedToken=null,tokenExpiry=0,pendingAuth=null;
const ENDPOINTS=Object.freeze({
 advanced:'/rdw/vehicle/advanced',
 inspections:'/rdw/mot/inspections',
 repairs:'/rdw/mot/repairs',
 emission:'/rdw/emission'
});
const RETRYABLE=new Set([502,503,504]);
const WAIT_MS=220,AUTH_TIMEOUT_MS=8000,VEHICLE_TIMEOUT_MS=9000;
const elapsed=t=>Date.now()-t;
const details=metrics=>({attempts:metrics.attempts,tokenRefreshed:metrics.tokenRefreshes>0});
function explainUpstream(status,stage){
 if(status===400)return 'VWE accepteert de parameters voor dit endpoint niet';
 if(status===401)return stage==='authentication'?'VWE weigert de authenticatiegegevens':'VWE heeft het toegangstoken geweigerd';
 if(status===403)return 'Geen toestemming voor deze VWE-dataset';
 if(status===404)return 'VWE kon de gevraagde bron of het kenteken niet vinden; dit bevestigt geen ontbrekende voertuighistorie';
 if(status===429)return 'De VWE-aanvraaglimiet is bereikt';
 if(status>=500)return 'VWE geeft tijdelijk een serverfout';
 return 'VWE heeft de voertuigaanvraag afgewezen';
}
function clearRejectedToken(token){if(cachedToken===token){cachedToken=null;tokenExpiry=0}}
async function getAccessToken(base){
 if(cachedToken&&Date.now()<tokenExpiry)return {ok:true,access_token:cachedToken};
 if(pendingAuth)return pendingAuth;
 pendingAuth=(async()=>{
  const form=new URLSearchParams({
   grant_type:process.env.VWE_GRANT_TYPE,client_id:process.env.VWE_CLIENT_ID,
   client_secret:process.env.VWE_CLIENT_SECRET,scope:process.env.VWE_SCOPE
  });
  const response=await fetch(new URL('/authenticate/token',base),{
   method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},
   body:form,signal:AbortSignal.timeout(AUTH_TIMEOUT_MS)
  });
  const json=await response.json().catch(()=>({}));
  if(!response.ok){traffic.noteUpstream(response.status);return {ok:false,status:response.status,code:'VWE_AUTH_REJECTED'}}
  if(!json.access_token)return {ok:false,status:response.status,code:'VWE_AUTH_TOKEN_MISSING'};
  cachedToken=json.access_token;
  const seconds=Number(json.expires_in)||0;
  tokenExpiry=Date.now()+Math.max(0,Math.min(seconds,3600)-60)*1000;
  return {ok:true,access_token:cachedToken};
 })();
 try{return await pendingAuth}finally{pendingAuth=null}
}
async function refreshRejectedToken(base,rejected){
 if(cachedToken&&cachedToken!==rejected&&Date.now()<tokenExpiry)return {ok:true,access_token:cachedToken};
 clearRejectedToken(rejected);
 return getAccessToken(base);
}
function output(http,data,metrics){return {http,data:{...data,diagnostics:{...details(metrics),...data.diagnostics}},metrics}}
async function retrieveVehicle(plate,dataset,base){
 const metrics={attempts:0,tokenRefreshes:0};
 let stage='authentication';
 try{
  let token=await getAccessToken(base);
  if(!token.ok)return output(token.status===429?503:502,{
   error:token.code==='VWE_AUTH_TOKEN_MISSING'?'VWE heeft geen bruikbaar toegangstoken teruggegeven':explainUpstream(token.status,'authentication'),
   code:token.code,stage,upstreamStatus:token.status,dataset
  },metrics);
  stage='vehicle';
  const endpoint=new URL(ENDPOINTS[dataset],base);
  endpoint.searchParams.set('licensePlate',plate);
  for(let attempt=1;attempt<=2;attempt++){
   metrics.attempts=attempt;
   const response=await fetch(endpoint,{
    method:'GET',headers:{Authorization:'Bearer '+token.access_token,Accept:'application/json'},
    signal:AbortSignal.timeout(VEHICLE_TIMEOUT_MS)
   });
   if(response.status===401&&attempt===1){
    stage='authentication';metrics.tokenRefreshes++;
    token=await refreshRejectedToken(base,token.access_token);
    if(!token.ok)return output(token.status===429?503:502,{
     error:explainUpstream(token.status,'authentication'),
     code:token.code,stage,upstreamStatus:token.status,dataset
    },metrics);
    stage='vehicle';continue;
   }
   if(!response.ok)traffic.noteUpstream(response.status);
   if(RETRYABLE.has(response.status)&&attempt===1){
    await new Promise(resolve=>setTimeout(resolve,WAIT_MS));
    continue;
   }
   if(response.status===401)clearRejectedToken(token.access_token);
   if(!response.ok){
    const http=response.status===403?403:response.status===429?503:response.status===404?404:502;
    return output(http,{
     error:explainUpstream(response.status,'vehicle'),code:'VWE_UPSTREAM_'+response.status,
     stage:'vehicle',upstreamStatus:response.status,dataset
    },metrics);
   }
   const vehicle=await response.json().catch(()=>null);
   if(vehicle===null)return output(502,{
    error:'VWE heeft geen geldig JSON-antwoord teruggegeven',code:'VWE_INVALID_RESPONSE',
    stage:'vehicle',dataset
   },metrics);
   const empty=dataset==='inspections'
    ?!(Array.isArray(vehicle)?vehicle.some(Boolean):
       ['inspections','data','results','items'].some(key=>Array.isArray(vehicle?.[key])&&vehicle[key].length>0))
    :Array.isArray(vehicle)?vehicle.length===0:
     vehicle&&typeof vehicle==='object'?Object.keys(vehicle).length===0:false;
   return output(200,{
    licensePlate:plate,source:'VWE acceptatie',dataset,vehicle,
    dataStatus:empty?'empty':'received'
   },metrics);
  }
 }catch(err){
  const timedOut=err?.name==='TimeoutError'||err?.name==='AbortError';
  console.warn('VWE preview error',{stage,category:timedOut?'TIMEOUT':'NETWORK_OR_PARSE'});
  return output(timedOut?504:502,{
   error:timedOut?'VWE reageert niet op tijd':'VWE kan momenteel niet worden bereikt',
   code:timedOut?'VWE_TIMEOUT':'VWE_NETWORK_ERROR',stage,dataset
  },metrics);
 }
 return output(502,{error:'VWE-aanvraag niet voltooid',code:'VWE_UNEXPECTED_STATE',stage:'vehicle',dataset},metrics);
}
async function finish(res,http,data,metric,startedAt,dataset,coalesced=false){
 const diagnostics={...(data.diagnostics||{}),coalesced,durationMs:elapsed(startedAt)};
 const body={...data,diagnostics};
 // A shared response is counted as a user request, but not as a second upstream call.
 await record({
  dataset,ok:http===200,status:http,stage:body.stage||'vehicle',code:body.code||'',
  upstreamStatus:body.upstreamStatus??null,durationMs:diagnostics.durationMs,
  attempts:coalesced?0:metric.attempts||0,
  tokenRefreshes:coalesced?0:metric.tokenRefreshes||0,coalesced,
  dataStatus:http===200?body.dataStatus||null:null
 });
 return res.status(http).json(body);
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
 const startedAt=Date.now(),metrics={attempts:0,tokenRefreshes:0};
 const keys=['VWE_CLIENT_ID','VWE_CLIENT_SECRET','VWE_SCOPE','VWE_GRANT_TYPE','VWE_BASE_URL'];
 if(keys.some(key=>!process.env[key]))return finish(res,503,{
  error:'VWE-configuratie ontbreekt',code:'VWE_NOT_CONFIGURED',stage:'configuration'
 },metrics,startedAt,dataset);
 let base;
 try{
  base=new URL(process.env.VWE_BASE_URL);
  if(base.origin!=='https://acceptatie-interdata-rest.vwe.nl')return finish(res,400,{
   error:'Ongeldige VWE-omgeving',code:'VWE_INVALID_ENV',stage:'configuration'
  },metrics,startedAt,dataset);
 }catch{return finish(res,400,{error:'Ongeldige VWE-omgeving',code:'VWE_INVALID_ENV',stage:'configuration'},metrics,startedAt,dataset)}
 const scheduled=traffic.submit(plate,dataset,()=>retrieveVehicle(plate,dataset,base));
 try{
  const result=await scheduled.promise;
  return finish(res,result.http,result.data,result.metrics||metrics,startedAt,dataset,scheduled.coalesced);
 }catch{
  return finish(res,502,{
   error:'Voertuigaanvraag tijdelijk niet beschikbaar',code:'VWE_INTERNAL_ERROR',stage:'traffic'
  },metrics,startedAt,dataset,scheduled.coalesced);
 }
};
