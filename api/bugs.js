const crypto=require('node:crypto');
const {cmd,configured,reply}=require('./_analytics');
const {session}=require('./_admin-security');
const clean=(v,max)=>String(v||'').trim().slice(0,max);
const allowed=new Set(['/','/parts/','/pro/']);
const key='cf:bugs';
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!configured())return reply(res,503,{error:'Meldingen tijdelijk niet beschikbaar'});
 if(req.method==='GET'){
  try{if(!await session(req))return reply(res,401,{error:'Inloggen vereist'});
   const items=await cmd('LRANGE',key,0,99);
   const parsed=(items||[]).map(v=>JSON.parse(v));const statuses=parsed.length?await cmd('MGET',...parsed.map(v=>'cf:bug:status:'+v.id)):[];return reply(res,200,{items:parsed.map((v,i)=>({...v,status:statuses?.[i]||'nieuw'}))});
  }catch{return reply(res,503,{error:'Meldingen niet beschikbaar'})}
 }
 if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'});
 const origin=req.headers.origin;
 try{if(!origin||new URL(origin).host!==req.headers.host)return reply(res,403,{error:'Ongeldige herkomst'})}catch{return reply(res,403,{error:'Ongeldige herkomst'})}
 const b=req.body||{};
 if(b.website)return reply(res,200,{ok:true});
 const page=clean(b.page,100),category=clean(b.category,60),description=clean(b.description,2000),email=clean(b.email,200);
 if(!allowed.has(page)||!['Foutmelding','Verkeerde voertuiggegevens','Onderdelen zoeken','Overig'].includes(category)||description.length<12||description.length>2000||email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))return reply(res,400,{error:'Controleer je invoer'});
 const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
 const rate='cf:bug:rate:'+crypto.createHash('sha256').update(ip+(process.env.CARFACTS_ADMIN_SECRET||'')).digest('hex');
 try{
  const count=Number(await cmd('INCR',rate));if(count===1)await cmd('EXPIRE',rate,3600);
  if(count>5)return reply(res,429,{error:'Je hebt te veel meldingen verstuurd. Probeer het later opnieuw'});
  const item={id:crypto.randomUUID(),date:new Date().toISOString(),page,category,description,email};
  await cmd('LPUSH',key,JSON.stringify(item));await cmd('LTRIM',key,0,499);
  // Optional transactional email. No API key means reports are stored only in admin.
  if(process.env.RESEND_API_KEY&&process.env.CARFACTS_BUG_FROM&&process.env.CARFACTS_BUG_TO){
   try{await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.CARFACTS_BUG_FROM,to:[process.env.CARFACTS_BUG_TO],subject:'Carfacts foutmelding: '+category,text:['Pagina: '+page,'Categorie: '+category,'Melding: '+description,'Contact: '+(email||'Niet opgegeven'),'Datum: '+item.date].join('\n')})})}catch{}
  }
  return reply(res,200,{ok:true});
 }catch{return reply(res,503,{error:'Opslaan mislukt. Probeer het later opnieuw'})}
};
