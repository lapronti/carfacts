// Preview-only authenticated discovery of published VWE OpenAPI paths.
// Reads documentation only; does not invoke vehicle-data endpoints.
const {session,configured}=require('./_admin-security');
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(process.env.VERCEL_ENV!=='preview')return res.status(404).json({error:'Alleen testomgeving'});
 if(req.method!=='GET')return res.status(405).json({error:'Methode niet toegestaan'});
 if(!configured()||!await session(req))return res.status(401).json({error:'Admin-login vereist'});
 const base='https://acceptatie-interdata-rest.vwe.nl';
 const paths=['/swagger/v1/swagger.json','/openapi/v1.json','/openapi/swagger.json','/swagger.json','/openapi/openapi.json'];
 const errors=[];
 for(const path of paths){try{
  const r=await fetch(base+path,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(7000)});
  if(!r.ok){errors.push(path+': HTTP '+r.status);continue}
  const json=await r.json();if(!json.paths||typeof json.paths!=='object'){errors.push(path+': geen OpenAPI paths');continue}
  const endpoints=Object.entries(json.paths).flatMap(([p,methods])=>Object.entries(methods).filter(([method])=>['get','post'].includes(method)).map(([method,def])=>({method:method.toUpperCase(),path:p,summary:def.summary||def.description?.slice(0,120)||'',tags:def.tags||[],parameters:(def.parameters||[]).map(x=>x.name).filter(Boolean)})));
  const relevant=endpoints.filter(e=>/autotelex|atl|taxat|waard|schade|damage|service|onderhoud|histor|mileage|kilometer|mot|emission|vehicle/i.test([e.path,e.summary,...e.tags].join(' ')));
  return res.status(200).json({source:'VWE OpenAPI documentatie',documentationPath:path,total:endpoints.length,relevant,disclaimer:'Documentatie bewijst geen toegangsrecht of kosteloosheid per endpoint. Er zijn geen voertuigdata-aanvragen uitgevoerd.'});
 }catch(e){errors.push(path+': niet leesbaar')}}
 return res.status(200).json({source:'VWE OpenAPI documentatie',available:false,errors,knownTested:['/rdw/vehicle/advanced','/rdw/mot/inspections','/rdw/emission'],unverified:['/rdw/mot/repairs','Autotelex','schadehistorie','onderhoudshistorie','waardebepaling'],disclaimer:'OpenAPI-catalogus kon niet automatisch worden gelezen; er zijn geen voertuigdata-aanvragen uitgevoerd.'});
};