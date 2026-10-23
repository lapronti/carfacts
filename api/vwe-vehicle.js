const {session,configured}=require('./_admin-security');

// An OAuth token can be reused inside a warm preview function.
// Neither the access token nor request-specific vehicle data is persisted.
let cachedToken=null;
let tokenExpiry=0;
let pendingAuth=null;

const ENDPOINTS=Object.freeze({
 advanced:'/rdw/vehicle/advanced',
 inspections:'/rdw/mot/inspections',
 repairs:'/rdw/mot/repairs',
 emission:'/rdw/emission'
});

const explainUpstream=(status,stage)=>{
 if(status===400)return 'VWE accepteert de parameters voor dit endpoint niet';
 if(status===401)return stage==='authentication'?'VWE weigert de authenticatiegegevens':'VWE heeft de sessie niet geaccepteerd';
 if(status===403)return stage==='authentication'?'VWE-authenticatie heeft onvoldoende rechten':'Geen toegang tot dit VWE-product';
 if(status===404)return 'VWE-endpoint of kenteken niet gevonden';
 if(status===429)return 'VWE heeft de aanvraaglimiet bereikt';
 if(status>=500)return 'De VWE-server geeft tijdelijk een fout';
 return stage==='authentication'?'VWE-authenticatie mislukt':'VWE heeft de voertuigaanvraag afgewezen';
};

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
   body:form,
   signal:AbortSignal.timeout(12000)
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

module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 res.setHeader('Content-Type','application/json');
 if(process.env.VERCEL_ENV!=='preview')return res.status(404).json({error:'Niet beschikbaar'});
 if(req.method!=='GET')return res.status(405).json({error:'Methode niet toegestaan'});
 if(!configured()||!await session(req))return res.status(401).json({error:'Admin-login vereist',code:'ADMIN_LOGIN_REQUIRED',stage:'session'});
 const plate=String(req.query.licensePlate||'').replace(/[^a-zA-Z0-9]/g,'').toUpperCase();
 if(!/^[A-Z0-9]{4,8}$/.test(plate))return res.status(400).json({error:'Ongeldig kenteken',code:'INVALID_PLATE',stage:'validation'});
 const dataset=String(req.query.dataset||'advanced');
 if(!Object.prototype.hasOwnProperty.call(ENDPOINTS,dataset))return res.status(400).json({error:'Onbekende VWE-testfunctie',code:'UNKNOWN_DATASET',stage:'validation'});
 const keys=['VWE_CLIENT_ID','VWE_CLIENT_SECRET','VWE_SCOPE','VWE_GRANT_TYPE','VWE_BASE_URL'];
 if(keys.some(key=>!process.env[key]))return res.status(503).json({error:'VWE-configuratie ontbreekt',code:'VWE_NOT_CONFIGURED',stage:'configuration'});
 let stage='configuration';
 try{
  const base=new URL(process.env.VWE_BASE_URL);
  if(base.origin!=='https://acceptatie-interdata-rest.vwe.nl')return res.status(400).json({error:'Ongeldige VWE-omgeving',code:'VWE_INVALID_ENV',stage:'configuration'});
  stage='authentication';
  const token=await getAccessToken(base);
  if(!token.ok){
   return res.status(token.status===429?503:502).json({
    error:token.code==='VWE_AUTH_TOKEN_MISSING'?'VWE heeft geen bruikbaar toegangstoken teruggegeven':explainUpstream(token.status,'authentication'),
    code:token.code,
    stage,
    upstreamStatus:token.status
   });
  }
  stage='vehicle';
  const endpoint=new URL(ENDPOINTS[dataset],base);
  endpoint.searchParams.set('licensePlate',plate);
  const response=await fetch(endpoint,{
   headers:{Authorization:'Bearer '+token.access_token,Accept:'application/json'},
   signal:AbortSignal.timeout(12000)
  });
  if(response.status===401){cachedToken=null;tokenExpiry=0}
  if(!response.ok){
   const responseCode=response.status===403?403:response.status===429?503:502;
   return res.status(responseCode).json({
    error:explainUpstream(response.status,'vehicle'),
    code:'VWE_UPSTREAM_'+response.status,
    stage,
    upstreamStatus:response.status,
    dataset
   });
  }
  const data=await response.json().catch(()=>null);
  if(data===null)return res.status(502).json({error:'VWE heeft geen geldig JSON-antwoord teruggegeven',code:'VWE_INVALID_RESPONSE',stage,dataset});
  return res.status(200).json({licensePlate:plate,source:'VWE acceptatie',dataset,vehicle:data});
 }catch(err){
  const timedOut=err?.name==='TimeoutError'||err?.name==='AbortError';
  // Report only technical categories; never log credentials, token, plate or raw upstream body.
  console.warn('VWE preview request failed',{stage,category:timedOut?'TIMEOUT':'NETWORK_OR_PARSE'});
  return res.status(timedOut?504:502).json({
   error:timedOut?'VWE reageert niet op tijd':'VWE kan momenteel niet worden bereikt',
   code:timedOut?'VWE_TIMEOUT':'VWE_NETWORK_ERROR',
   stage
  });
 }
};