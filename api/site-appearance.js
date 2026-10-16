const {cmd,configured,reply}=require('./_analytics');
const {session}=require('./_admin-security');
const KEY='cf:site:appearance:v1';
const THEMES=['professional','midnight','minimal','slate','classic','contrast','halloween','blackfriday','sinterklaas','christmas'];
const SECTIONS=['summarySectionV5','purchaseAssistantCard','valuationEntry','carfactsIntelligence','vehicleDetailsV5','importBpmSection','apkDetailsV5','carfactsMarket'];
const defaults={theme:'professional',sections:Object.fromEntries(SECTIONS.map(k=>[k,true]))};
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET'&&req.method!=='POST')return reply(res,405,{error:'Methode niet toegestaan'});
 if(!configured())return reply(res,503,{error:'Opslag niet geconfigureerd'});
 if(req.method==='POST'){
  try{if(!await session(req))return reply(res,401,{error:'2FA vereist'})}catch{return reply(res,503,{error:'Sessiecontrole mislukt'})}
  const origin=req.headers.origin;
  try{if(!origin||new URL(origin).host!==req.headers.host)return reply(res,403,{error:'Ongeldige herkomst'})}catch{return reply(res,403,{error:'Ongeldige herkomst'})}
  const theme=req.body?.theme;
  if(typeof theme!=='string'||!THEMES.includes(theme))return reply(res,400,{error:'Ongeldig thema'});
  const raw=req.body?.sections;
  if(!raw||typeof raw!=='object'||Array.isArray(raw))return reply(res,400,{error:'Ongeldige secties'});
  if(Object.keys(raw).some(k=>!SECTIONS.includes(k))||SECTIONS.some(k=>typeof raw[k]!=='boolean'))return reply(res,400,{error:'Ongeldige sectie-instellingen'});
  try{await cmd('SET',KEY,JSON.stringify({theme,sections:Object.fromEntries(SECTIONS.map(k=>[k,raw[k]]))}));return reply(res,200,{ok:true})}catch{return reply(res,503,{error:'Opslaan mislukt'})}
 }
 try{const raw=await cmd('GET',KEY);const parsed=raw?JSON.parse(raw):{};return reply(res,200,{theme:THEMES.includes(parsed.theme)?parsed.theme:defaults.theme,sections:Object.fromEntries(SECTIONS.map(k=>[k,typeof parsed.sections?.[k]==='boolean'?parsed.sections[k]:true]))})}catch{return reply(res,503,{error:'Instellingen niet bereikbaar'})}
};
