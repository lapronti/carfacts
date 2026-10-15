const {cmd,configured,reply}=require('./_analytics');
const types=new Set(['page_view','plate_search','parts_search','outbound_click','pro_interest']);
const pages=new Set(['/','/parts/','/pro/']);
const sources=new Set(['ebay','onderdelenlijn','schadeautos','marktplaats','rrr','kleinanzeigen','allegro','eurostock','other']);
module.exports=async(req,res)=>{
 if(req.method!=='POST')return reply(res,405,{error:'Method not allowed'});
 if(!configured())return reply(res,503,{error:'Analytics not configured'});
 const origin=req.headers.origin;const host=req.headers.host;
 if(origin){try{if(new URL(origin).host!==host)return reply(res,403,{error:'Forbidden'})}catch{return reply(res,403,{error:'Forbidden'})}}
 const b=req.body||{};if(!types.has(b.type))return reply(res,400,{error:'Invalid event'});
 const date=new Date().toISOString().slice(0,10);const key='cf:stats:'+date;let field=b.type;
 if(b.type==='page_view'){if(!pages.has(b.page))return reply(res,400,{error:'Invalid page'});field+=':'+b.page}
 if(b.type==='plate_search'){const plate=String(b.plate||'').toUpperCase().replace(/[^A-Z0-9]/g,'');if(!/^[A-Z0-9]{5,8}$/.test(plate))return reply(res,400,{error:'Invalid plate'});field+=':'+plate}
 if(b.type==='outbound_click'){if(!sources.has(b.source))return reply(res,400,{error:'Invalid source'});field+=':'+b.source}
 if(b.type==='parts_search'){field+=':total'}
 if(b.type==='pro_interest'){field+=':total'}
 try{await cmd('HINCRBY',key,field,1);await cmd('EXPIRE',key,86400*100);return reply(res,200,{ok:true})}catch{return reply(res,503,{error:'Storage unavailable'})}
};
