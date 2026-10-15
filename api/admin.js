const crypto=require('node:crypto');
const {cmd,configured,authed,cookie,reply,password}=require('./_analytics');
module.exports=async(req,res)=>{
 if(!configured())return reply(res,503,{error:'Admin is not configured'});
 if(req.method==='POST'){
  const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
  const lock='cf:admin:attempts:'+crypto.createHash('sha256').update(ip+process.env.CARFACTS_ADMIN_SECRET).digest('hex');
  try{if(Number(await cmd('GET',lock))>=8)return reply(res,429,{error:'Te veel pogingen. Probeer over 15 minuten opnieuw.'})}catch{return reply(res,503,{error:'Inloggen tijdelijk niet beschikbaar'})}
  const supplied=String(req.body?.password||'').slice(0,1024);
  const a=crypto.createHash('sha256').update(supplied).digest(),b=crypto.createHash('sha256').update(password).digest();
  if(!crypto.timingSafeEqual(a,b)){try{await cmd('INCR',lock);await cmd('EXPIRE',lock,900)}catch{}return reply(res,401,{error:'Onjuist wachtwoord'})}
  try{await cmd('DEL',lock)}catch{}
  res.setHeader('Set-Cookie',cookie());return reply(res,200,{ok:true});
 }
 if(req.method!=='GET')return reply(res,405,{error:'Method not allowed'});
 if(!authed(req))return reply(res,401,{error:'Login vereist'});
 const days=Math.min(90,Math.max(1,Number(req.query.days)||30));const totals={};const daily=[];
 try{for(let i=days-1;i>=0;i--){const d=new Date();d.setUTCHours(12,0,0,0);d.setUTCDate(d.getUTCDate()-i);const day=d.toISOString().slice(0,10);const values=await cmd('HGETALL','cf:stats:'+day);let obj={};if(Array.isArray(values)){for(let j=0;j<values.length;j+=2)obj[values[j]]=Number(values[j+1])||0}else if(values&&typeof values==='object'){for(const [k,v] of Object.entries(values))obj[k]=Number(v)||0}for(const [k,v] of Object.entries(obj))totals[k]=(totals[k]||0)+v;daily.push({day,events:Object.values(obj).reduce((a,b)=>a+b,0)})}return reply(res,200,{days,totals,daily})}catch{return reply(res,503,{error:'Statistieken tijdelijk niet beschikbaar'})}
};
