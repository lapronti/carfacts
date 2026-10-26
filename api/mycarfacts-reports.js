'use strict';
/* Placeholder only: no report generation, paid VWE lookups or user-controlled entitlements.
 * When a future report backend is approved, it must write metadata only on behalf
 * of a server-verified purchase and enforce the same user ownership invariant.
 */
const p=require('./_mycarfacts');
const {onlyPreview,authorized,reply,cmd,userReportsKey,safeObjectEntries}=p;
module.exports=async(req,res)=>{
 if(!onlyPreview(req,res))return;
 if(req.method!=='GET')return reply(res,405,{error:'PRO-rapporten zijn nog niet geactiveerd'});
 const user=await authorized(req,res);if(!user)return;
 try{
  const stored=await cmd('HGETALL',userReportsKey(user.uid));
  const reports=safeObjectEntries(stored,40).filter(x=>
   x&&typeof x==='object'&&typeof x.id==='string'&&typeof x.title==='string'
  ).map(x=>({
   id:x.id.slice(0,80),title:x.title.slice(0,120),
   createdAt:String(x.createdAt||''),status:String(x.status||'in_voorbereiding')
  }));
  return reply(res,200,{
   enabled:false,purchasesEnabled:false,reports,
   message:'PRO-rapporten en betalingen zijn nog niet beschikbaar. Er worden geen betaalde voertuigaanvragen gedaan.'
  });
 }catch{return reply(res,503,{error:'Rapportoverzicht tijdelijk niet beschikbaar'})}
};
