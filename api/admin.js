const {cmd,configured,session,reply}=require('./_admin-security');
module.exports=async(req,res)=>{
 if(!configured())return reply(res,503,{error:'Admin is niet geconfigureerd'});
 if(req.method!=='GET')return reply(res,405,{error:'Method not allowed'});
 try{if(!await session(req))return reply(res,401,{error:'Login met 2FA vereist'});}catch{return reply(res,503,{error:'Authenticatie niet beschikbaar'})}
 const days=Math.min(90,Math.max(1,Number(req.query.days)||30));const totals={};const daily=[];
 try{for(let i=days-1;i>=0;i--){const d=new Date();d.setUTCHours(12,0,0,0);d.setUTCDate(d.getUTCDate()-i);const day=d.toISOString().slice(0,10);const values=await cmd('HGETALL','cf:stats:'+day);let obj={};if(Array.isArray(values)){for(let j=0;j<values.length;j+=2)obj[values[j]]=Number(values[j+1])||0}else if(values&&typeof values==='object'){for(const [k,v] of Object.entries(values))obj[k]=Number(v)||0}for(const [k,v] of Object.entries(obj))totals[k]=(totals[k]||0)+v;daily.push({day,events:Object.values(obj).reduce((a,b)=>a+b,0)})}return reply(res,200,{days,totals,daily})}catch{return reply(res,503,{error:'Statistieken tijdelijk niet beschikbaar'})}
};
