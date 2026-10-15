const {cmd,configured}=require('./_analytics');
const crypto=require('node:crypto');
const healthKey='cf:monitor:history';
async function probe(url){const started=Date.now();try{const r=await fetch(url,{signal:AbortSignal.timeout(7000),headers:{Accept:'application/json'}});const raw=await r.json().catch(()=>null);return {ok:r.ok&&Array.isArray(raw),http:r.status,ms:Date.now()-started,data:Array.isArray(raw)?raw:null}}catch{return {ok:false,ms:Date.now()-started,data:null}}}
async function inspect(){
 const rdw=await probe('https://opendata.rdw.nl/resource/m9d7-ebf2.json?%24limit=5');
 let redis=false;try{redis=await cmd('PING')==='PONG'}catch{}
 const rows=rdw.data||[];
 const quality={sample:rows.length,missingBrand:rows.filter(x=>!x.merk).length,missingModel:rows.filter(x=>!x.handelsbenaming).length,missingFuel:null,notice:'Kleine steekproef van het RDW-basisregister; brandstofgegevens komen uit een andere RDW-dataset. Geen volledige kwaliteitsmeting.'};
 return {date:new Date().toISOString(),rdw:{ok:rdw.ok,ms:rdw.ms,http:rdw.http},redis:{ok:redis},quality,healthy:rdw.ok&&redis};
}
async function save(snapshot){await cmd('LPUSH',healthKey,JSON.stringify(snapshot));await cmd('LTRIM',healthKey,0,167);await cmd('EXPIRE',healthKey,86400*30)}
async function send(subject,body){if(!process.env.RESEND_API_KEY||!process.env.CARFACTS_ALERT_FROM||!process.env.CARFACTS_ALERT_TO)return false;const r=await fetch('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+process.env.RESEND_API_KEY,'Content-Type':'application/json'},body:JSON.stringify({from:process.env.CARFACTS_ALERT_FROM,to:[process.env.CARFACTS_ALERT_TO],subject,text:body}),signal:AbortSignal.timeout(7000)});if(!r.ok)throw Error('E-mail verzenden mislukt');return true}
async function daily(){const state=await inspect();await save(state);const previous=await cmd('GET','cf:monitor:last_state');await cmd('SET','cf:monitor:last_state',state.healthy?'ok':'error','EX',86400*30);if(!state.healthy&&previous!=='error'){await send('Carfacts: controle geeft storing aan','RDW: '+state.rdw.ok+'; Redis: '+state.redis.ok+'; tijd: '+state.date)}return state}
function aggregate(rows){const out={};for(const v of rows||[]){if(Array.isArray(v)){for(let i=0;i<v.length;i+=2)out[v[i]]=(out[v[i]]||0)+Number(v[i+1]||0)}else if(v&&typeof v==='object'){for(const [k,n] of Object.entries(v))out[k]=(out[k]||0)+Number(n||0)}}return out}
async function week(){const days=[];for(let i=1;i<=7;i++){const d=new Date();d.setUTCHours(12,0,0,0);d.setUTCDate(d.getUTCDate()-i);days.push(await cmd('HGETALL','cf:stats:'+d.toISOString().slice(0,10)))}const totals=aggregate(days);const sum=p=>Object.entries(totals).filter(([k])=>k.startsWith(p)).reduce((a,[,v])=>a+v,0);const data={date:new Date().toISOString(),plateChecks:sum('plate_search:'),pageViews:sum('page_view:'),partsSearches:sum('parts_search:'),proInterest:sum('pro_interest:')};await cmd('SET','cf:monitor:last_week',JSON.stringify(data),'EX',86400*45);await send('Carfacts weekrapport','Afgelopen 7 volledige UTC-dagen:\nKentekenchecks: '+data.plateChecks+'\nPaginaweergaven: '+data.pageViews+'\nOnderdelenzoekopdrachten: '+data.partsSearches+'\nPRO-interesse: '+data.proInterest+'\nAlleen opt-in analytics; geen omzetgegevens.');return data}
module.exports={inspect,save,send,daily,week};
