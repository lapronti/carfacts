// VWE-only adapter for the cloned Carfacts preview homepage. No RDW fallback.
const {session,configured}=require('./_admin-security');
const date=v=>v?String(v).slice(0,10).replace(/-/g,''):undefined;
const str=v=>v==null?undefined:String(v);
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');res.setHeader('Content-Type','application/json');
 if(process.env.VERCEL_ENV!=='preview')return res.status(404).json({error:'Alleen testomgeving'});
 if(req.method!=='GET')return res.status(405).json({error:'Methode niet toegestaan'});
 if(!configured()||!await session(req))return res.status(401).json({error:'Log eerst in via Carfacts Admin op dit Preview-adres'});
 const plate=String(req.query.kenteken||'').replace(/[^A-Z0-9]/gi,'').toUpperCase();
 if(!/^[A-Z0-9]{4,8}$/.test(plate))return res.status(400).json({error:'Ongeldig kenteken'});
 const required=['VWE_CLIENT_ID','VWE_CLIENT_SECRET','VWE_SCOPE','VWE_GRANT_TYPE','VWE_BASE_URL'];
 if(required.some(k=>!process.env[k]))return res.status(503).json({error:'VWE configuratie ontbreekt'});
 try{
 const base=new URL(process.env.VWE_BASE_URL);
 if(base.origin!=='https://acceptatie-interdata-rest.vwe.nl')return res.status(400).json({error:'Ongeldige VWE-omgeving'});
 const auth=await fetch(new URL('/authenticate/token',base),{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded'},body:new URLSearchParams({grant_type:process.env.VWE_GRANT_TYPE,client_id:process.env.VWE_CLIENT_ID,client_secret:process.env.VWE_CLIENT_SECRET,scope:process.env.VWE_SCOPE}),signal:AbortSignal.timeout(12000)});
 const token=await auth.json().catch(()=>({}));
 if(!auth.ok||!token.access_token)return res.status(502).json({error:'VWE-authenticatie mislukt',status:auth.status});
 const endpoint=new URL('/rdw/vehicle/advanced',base);endpoint.searchParams.set('licensePlate',plate);
 const response=await fetch(endpoint,{headers:{Authorization:'Bearer '+token.access_token,Accept:'application/json'},signal:AbortSignal.timeout(12000)});
 if(!response.ok)return res.status(response.status===404?200:502).json(response.status===404?[]:{error:'VWE voertuigopvraag mislukt',status:response.status});
 const v=await response.json();if(!v||typeof v!=='object'||Array.isArray(v))return res.status(200).json([]);
 const fuel=Array.isArray(v.fuels)?v.fuels.map(x=>x.description).filter(Boolean).join(', '):undefined;
 const x={
 kenteken:plate,merk:v.make?.name,handelsbenaming:v.model?.name,
 datum_eerste_toelating:date(v.firstAdmissionDate),datum_eerste_tenaamstelling_in_nederland:date(v.firstRegistrationDate),
 vervaldatum_apk:date(v.motExpirationDate),datum_tenaamstelling:date(v.registrationDate),
 datum_eerste_afgifte_nederland:date(v.issueDate),
 eerste_kleur:v.colors?.[0]?.description,tweede_kleur:v.colors?.[1]?.description,
 brandstof:fuel,voertuigsoort:v.vehicleType?.description,inrichting:v.construction?.description,
 aantal_zitplaatsen:str(v.numberOfSeats),aantal_deuren:str(v.numberOfDoors),aantal_wielen:str(v.numberOfWheels),
 wielbasis:str(v.wheelbase),lengte:str(v.dimensions?.length),breedte:str(v.dimensions?.width),hoogte_voertuig:str(v.dimensions?.height),
 aantal_cilinders:str(v.numberOfCylinders),cilinderinhoud:str(v.engineCapacity),vermogen:str(v.power),
 emissieklasse:v.emissionCode,maximum_constructiesnelheid:str(v.maximumConstructionSpeed),
 massa_ledig_voertuig:str(v.grossWeight),massa_rijklaar:str(v.curbWeight),
 laadvermogen:str(v.maximumLoad),toegestane_maximum_massa_voertuig:str(v.maximumMass),
 maximum_massa_trekken_ongeremd:str(v.towingCapacity?.unbraked),
 maximum_massa_trekken_geremd:str(v.towingCapacity?.braked??v.towingCapacity?.centerAxleBraked),
 catalogusprijs:str(v.listPrice),bruto_bpm:str(v.bpmGross),
 wam_verzekerd:v.hasInsurance==null?undefined:v.hasInsurance?'Ja':'Nee',
 motorcode:v.engineCode,gegevensbron:'VWE Interdata (acceptatie)'
 };
 return res.status(200).json([x]);
 }catch(e){return res.status(502).json({error:'VWE tijdelijk niet bereikbaar'})}
};