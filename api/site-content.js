const {cmd,configured,reply}=require('./_analytics');
const {session}=require('./_admin-security');
const crypto=require('node:crypto');
const DRAFT='cf:cms:draft:v1',LIVE='cf:cms:live:v1',HISTORY='cf:cms:history:v1';
const PAGES=['home','parts','pro'];
const defaults=()=>({revision:0,pages:Object.fromEntries(PAGES.map(p=>[p,{title:'',intro:'',blocks:[]}]))});
const cleanText=(v,max)=>typeof v==='string'?v.trim().slice(0,max):'';
function normalize(raw){
 const result=defaults();
 for(const page of PAGES){
  const x=raw?.pages?.[page]||{};
  if(!Array.isArray(x.blocks)||x.blocks.length>12)throw Error('Maximaal 12 blokken per pagina');
  const ids=new Set();
  result.pages[page]={title:cleanText(x.title,100),intro:cleanText(x.intro,350),blocks:x.blocks.map(b=>{
   const id=String(b?.id||'');
   if(!/^[a-z0-9-]{8,50}$/.test(id)||ids.has(id))throw Error('Ongeldig of dubbel blok-ID');
   ids.add(id);
   if(!['info','notice','faq'].includes(b.type))throw Error('Ongeldig bloktype');
   return {id,type:b.type,heading:cleanText(b.heading,90),body:cleanText(b.body,1200),visible:b.visible===true};
  })};
 }
 return result;
}
async function read(key){const raw=await cmd('GET',key);return raw?JSON.parse(raw):null}
async function auth(req,res){try{if(!await session(req)){reply(res,401,{error:'2FA vereist'});return false}}catch{reply(res,503,{error:'Sessiecontrole niet beschikbaar'});return false}return true}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!configured())return reply(res,503,{error:'Opslag niet beschikbaar'});
 if(req.method==='GET'){
  try{
   if(req.query?.mode==='admin'){
    if(!await auth(req,res))return;
    const live=await read(LIVE)||defaults(),draft=await read(DRAFT)||live;
    return reply(res,200,{live,draft});
   }
   const live=await read(LIVE)||defaults();
   return reply(res,200,{pages:live.pages,revision:live.revision});
  }catch{return reply(res,503,{error:'Websitebeheer niet beschikbaar'})}
 }
 if(req.method!=='POST')return reply(res,405,{error:'Methode niet toegestaan'});
 if(!await auth(req,res))return;
 try{const origin=req.headers.origin;if(!origin||new URL(origin).host!==req.headers.host)return reply(res,403,{error:'Ongeldige herkomst'})}catch{return reply(res,403,{error:'Ongeldige herkomst'})}
 const action=req.body?.action;
 if(!['save','publish','rollback'].includes(action))return reply(res,400,{error:'Ongeldige actie'});
 try{
  const live=await read(LIVE)||defaults();
  if(action==='save'){
   const draft=normalize(req.body?.content);
   draft.baseRevision=live.revision;
   draft.savedAt=new Date().toISOString();
   await cmd('SET',DRAFT,JSON.stringify(draft));
   return reply(res,200,{ok:true,draft});
  }
  const expected=Number(req.body?.expectedRevision);
  if(!Number.isSafeInteger(expected)||expected!==live.revision)return reply(res,409,{error:'De website is ondertussen gewijzigd. Herlaad de beheeromgeving.'});
  if(action==='publish'){
   const draft=await read(DRAFT);
   if(!draft)return reply(res,400,{error:'Sla eerst een concept op'});
   if(draft.baseRevision!==live.revision)return reply(res,409,{error:'Concept is verouderd. Sla het opnieuw op.'});
   const published={...normalize(draft),revision:live.revision+1,publishedAt:new Date().toISOString()};
   await cmd('LPUSH',HISTORY,JSON.stringify(live));
   await cmd('LTRIM',HISTORY,0,19);
   await cmd('SET',LIVE,JSON.stringify(published));
   await cmd('DEL',DRAFT);
   return reply(res,200,{ok:true,live:published});
  }
  const previous=await cmd('LINDEX',HISTORY,0);
  if(!previous)return reply(res,400,{error:'Geen vorige versie beschikbaar'});
  const restored={...normalize(JSON.parse(previous)),revision:live.revision+1,publishedAt:new Date().toISOString()};
  await cmd('LPUSH',HISTORY,JSON.stringify(live));await cmd('LTRIM',HISTORY,0,19);
  await cmd('SET',LIVE,JSON.stringify(restored));await cmd('DEL',DRAFT);
  return reply(res,200,{ok:true,live:restored});
 }catch(e){return reply(res,503,{error:e.message==='Maximaal 12 blokken per pagina'||e.message.startsWith('Ongeldig')?e.message:'Opslaan mislukt'})}
};
