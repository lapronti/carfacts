const {cmd,configured,reply}=require('./_analytics');
const {session}=require('./_admin-security');
const crypto=require('node:crypto');
const auditKey='cf:admin:audit';
const iso=()=>new Date().toISOString();
async function audit(action,detail=''){try{await cmd('LPUSH',auditKey,JSON.stringify({date:iso(),action,detail}));await cmd('LTRIM',auditKey,0,199);await cmd('EXPIRE',auditKey,86400*90)}catch{}}
async function check(url){const start=Date.now();try{const r=await fetch(url,{signal:AbortSignal.timeout(6500),headers:{Accept:'application/json'}});return {state:r.ok?'ok':'error',http:r.status,ms:Date.now()-start}}catch{return {state:'error',ms:Date.now()-start}}}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!configured())return reply(res,503,{error:'Admin niet geconfigureerd'});
 try{if(!await session(req))return reply(res,401,{error:'Login met 2FA vereist'})}catch{return reply(res,503,{error:'Authenticatie niet beschikbaar'})}
 if(req.method==='POST'){
  const origin=req.headers.origin;try{if(!origin||new URL(origin).host!==req.headers.host)return reply(res,403,{error:'Ongeldige herkomst'})}catch{return reply(res,403,{error:'Ongeldige herkomst'})}
  if(req.body?.action!=='delete_bug'||!/^[-a-f0-9]{36}$/.test(String(req.body.id||'')))return reply(res,400,{error:'Ongeldige actie'});
  try{const all=await cmd('LRANGE','cf:bugs',0,499)||[];const found=all.find(v=>{try{return JSON.parse(v).id===req.body.id}catch{return false}});if(!found)return reply(res,404,{error:'Melding niet gevonden'});await cmd('LREM','cf:bugs',1,found);await audit('bug_deleted',req.body.id);return reply(res,200,{ok:true})}catch{return reply(res,503,{error:'Verwijderen mislukt'})}
 }
 if(req.method!=='GET')return reply(res,405,{error:'Method not allowed'});
 const action=String(req.query.action||'overview');
 if(action==='health'){
  const [rdw,storage]=await Promise.all([check('https://opendata.rdw.nl/resource/m9d7-ebf2.json?%24limit=1'),cmd('PING').then(x=>({state:x==='PONG'?'ok':'error'})).catch(()=>({state:'error'}))]);
  return reply(res,200,{checkedAt:iso(),rdw,storage,valuation:{state:'not_connected',label:'Geen VWE-waarderingskoppeling bevestigd'},payments:{state:'not_connected',label:'Geen betaalprovider bevestigd'}});
 }
 if(action!=='overview')return reply(res,400,{error:'Ongeldige actie'});
 try{
  const [bugs,events]=await Promise.all([cmd('LRANGE','cf:bugs',0,499),cmd('LRANGE',auditKey,0,49)]);
  const parsed=(events||[]).map(v=>{try{return JSON.parse(v)}catch{return null}}).filter(Boolean);
  return reply(res,200,{bugs:{stored:(bugs||[]).length,shown:Math.min((bugs||[]).length,100)},audit:parsed,costs:{rdw:{mode:'public_open_data',unitCostEur:0},vwe:{mode:'not_connected',unitCostEur:null,requests:null,totalEur:null},totalEur:null,notice:'Geen kostenadministratie of VWE-facturatie gekoppeld. € 0 geldt alleen voor RDW Open Data, niet voor hosting.'},revenue:{status:'not_connected',payments:null,grossEur:null,netEur:null,notice:'Geen betalingsregistratie gekoppeld; omzet niet vastgesteld.'}});
 }catch{return reply(res,503,{error:'Operationele gegevens niet beschikbaar'})}
};
