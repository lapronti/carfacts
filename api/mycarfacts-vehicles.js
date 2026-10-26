'use strict';
/* Saved vehicle bookmarks only: never stores VWE payload, VIN, ownership or reports. */
const p=require('./_mycarfacts');
const {vehicleSchema,onlyPreview,validOrigin,authorized,reply,cmd,redisPairs,
 safeObjectEntries,userVehiclesKey,userReportsKey,sessionIndexKey,PREFIX,revoke}=p;
const MAX_VEHICLES=25;
async function listVehicles(uid){
 const rows=await cmd('HGETALL',userVehiclesKey(uid));
 return safeObjectEntries(rows,MAX_VEHICLES+5)
  .filter(item=>item&&typeof item.plate==='string'&&/^[A-Z0-9]{4,8}$/.test(item.plate))
  .sort((a,b)=>String(b.savedAt||'').localeCompare(String(a.savedAt||'')))
  .slice(0,MAX_VEHICLES);
}
module.exports=async(req,res)=>{
 if(!onlyPreview(req,res))return;
 if(!['GET','POST'].includes(req.method))return reply(res,405,{error:'Methode niet toegestaan'});
 if(req.method==='POST'&&!validOrigin(req))return reply(res,403,{error:'Ongeldige herkomst'});
 const user=await authorized(req,res);if(!user)return;
 try{
  if(req.method==='GET')return reply(res,200,{
   vehicles:await listVehicles(user.uid),limit:MAX_VEHICLES,
   notice:'Bewaarde kentekens zijn eigen notities; geen eigendoms- of voertuighistoriebewijs.'
  });
  const action=String(req.body?.action||'');
  if(action==='save'){
   const result=vehicleSchema.safeParse({
    plate:req.body?.plate,make:req.body?.make??'',
    model:req.body?.model??'',label:req.body?.label??''
   });
   if(!result.success)return reply(res,400,{error:'Controleer kenteken en omschrijving'});
   const data=result.data,key=userVehiclesKey(user.uid);
   const exists=await cmd('HEXISTS',key,data.plate);
   if(!Number(exists)){
    const count=Number(await cmd('HLEN',key));
    if(count>=MAX_VEHICLES)return reply(res,409,{error:'Je kunt maximaal 25 voertuigen bewaren'});
   }
   const existingRaw=await cmd('HGET',key,data.plate);
   let existing=null;try{existing=JSON.parse(existingRaw)}catch{}
   const entry={...data,savedAt:existing?.savedAt||new Date().toISOString(),
    updatedAt:new Date().toISOString()};
   await cmd('HSET',key,data.plate,JSON.stringify(entry));
   return reply(res,200,{ok:true,vehicle:entry});
  }
  if(action==='delete'){
   const plate=String(req.body?.plate||'').replace(/[^a-z0-9]/gi,'').toUpperCase();
   if(!/^[A-Z0-9]{4,8}$/.test(plate))return reply(res,400,{error:'Ongeldig kenteken'});
   await cmd('HDEL',userVehiclesKey(user.uid),plate);
   return reply(res,200,{ok:true});
  }
  if(action==='delete_account_data'){
   await cmd('DEL',userVehiclesKey(user.uid));
   await cmd('DEL',userReportsKey(user.uid));
   await cmd('DEL',PREFIX+':otp:'+user.uid);
   const active=await cmd('SMEMBERS',sessionIndexKey(user.uid));
   const sessionKeys=(Array.isArray(active)?active:[])
    .filter(hashed=>typeof hashed==='string'&&/^[a-f0-9]{64}$/.test(hashed))
    .map(hashed=>PREFIX+':session:'+hashed);
   // One Redis DEL can revoke a batch of sessions without one request per device.
   for(let index=0;index<sessionKeys.length;index+=100)
    await cmd('DEL',...sessionKeys.slice(index,index+100));
   await cmd('DEL',sessionIndexKey(user.uid));
   // Cookie clear is intentionally independent of the now-revoked server session.
   res.setHeader('Set-Cookie','cf_portal=; HttpOnly; Secure; SameSite=Strict; Path=/api/mycarfacts; Max-Age=0');
   return reply(res,200,{ok:true,loggedIn:false,message:'Alle bewaarde gegevens verwijderd en sessies afgemeld'});
  }
  return reply(res,400,{error:'Onbekende actie'});
 }catch{
  return reply(res,503,{error:'Bewaarde voertuigen tijdelijk niet beschikbaar'});
 }
};
