/* Carfacts Admin: passive preview-only VWE diagnostics. Does not call VWE itself. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const names={advanced:'Voertuigidentiteit',inspections:'APK-keuringshistorie',repairs:'APK-reparaties (test)',emission:'Milieu & transmissie'};
 const make=(tag,klass,text)=>{const el=document.createElement(tag);if(klass)el.className=klass;if(text!==undefined)el.textContent=String(text);return el};
 const asDate=value=>{
  if(!value)return 'Nog niet gemeten';
  const d=new Date(value);
  return Number.isNaN(d.getTime())?'Datum onbekend':d.toLocaleString('nl-NL');
 };
 const fmt=value=>value===null||value===undefined?'—':Number(value).toLocaleString('nl-NL');
 const statusText=e=>{
  if(!e)return 'Nog geen metingen';
  if(e.outcome==='success')return 'Laatste aanvraag succesvol';
  if(e.stage==='authentication')return 'Authenticatie bij VWE mislukt';
  if(e.stage==='configuration')return 'Configuratiefout';
  if(e.code==='VWE_TIMEOUT')return 'Time-out';
  return 'Laatste aanvraag mislukt';
 };
 const detailText=e=>{
  if(!e)return 'Nog geen aanvraag geregistreerd';
  const upstream=e.upstreamStatus?' · VWE HTTP '+e.upstreamStatus:'';
  const attempts=e.attempts>1?' · '+e.attempts+' pogingen':'';
  const renewed=e.tokenRefreshes>0?' · token vernieuwd':'';
  return 'Carfacts HTTP '+(e.status??'—')+upstream+' · '+(e.code||'Geen foutcode')+attempts+renewed;
 };
 function cardFor(item){
  const last=item.lastEvent;
  const card=make('article','vwe-status-card '+(!last?'vwe-unknown':last.outcome==='success'?'vwe-ok':'vwe-problem'));
  const top=make('div','vwe-card-heading');
  top.append(make('strong','',names[item.dataset]||item.dataset));
  top.append(make('span','vwe-card-state',!last?'Nog niet gemeten':last.outcome==='success'?'Succes':'Fout'));
  card.append(top,make('div','vwe-card-summary',statusText(last)));
  const metrics=make('dl','vwe-card-metrics');
  const add=(label,value)=>{metrics.append(make('dt','',label),make('dd','',value))};
  add('Laatste aanvraag',asDate(last?.at));
  add('Laatste succes',asDate(item.lastSuccess?.at));
  add('Laatste fout',asDate(item.lastFailure?.at));
  add('Reactietijd (laatste)',last?.durationMs===null||last?.durationMs===undefined?'—':fmt(last.durationMs)+' ms');
  add('Gemiddelde (steekproef)',item.avgDurationMs===null?'—':fmt(item.avgDurationMs)+' ms');
  add('Sucessen / fouten',fmt(item.success)+' / '+fmt(item.errors));
  add('Herhaalpogingen / tokenvernieuwingen',fmt(item.retried)+' / '+fmt(item.refreshed));
  card.append(metrics);
  card.append(make('p','vwe-card-detail',detailText(last)));
  return card;
 }
 function render(data){
  const cards=$('vweApiCards'),list=$('vweApiRecent');
  cards.replaceChildren();list.replaceChildren();
  for(const item of data.datasets||[])cards.append(cardFor(item));
  if(!data.datasets?.some(x=>x.observed||x.lastSuccess||x.lastFailure)){
   cards.append(make('p','vwe-no-data','Nog geen VWE-aanvragen geregistreerd sinds deze monitoring is ingeschakeld. Dit zegt niets over de beschikbaarheid van VWE.'));
  }
  if(!(data.recent||[]).length){list.append(make('p','vwe-no-data','Nog geen gebeurtenissen opgeslagen.'));return}
  const table=make('table','vwe-status-table');
  const head=make('thead'),tr=make('tr');
  ['Moment','Dataset','Resultaat','Fase','Carfacts HTTP','VWE HTTP','Duur','Pogingen'].forEach(name=>tr.append(make('th','',name)));
  head.append(tr);table.append(head);
  const body=make('tbody');
  for(const e of data.recent){
   const row=make('tr');
   [
    asDate(e.at),names[e.dataset]||e.dataset,e.outcome==='success'?'Succes':'Fout',
    e.stage||'—',e.status??'—',e.upstreamStatus??'—',
    e.durationMs===null||e.durationMs===undefined?'—':e.durationMs+' ms',
    e.attempts??'—'
   ].forEach(value=>row.append(make('td','',value)));
   body.append(row);
  }
  table.append(body);list.append(table);
 }
 let inFlight=false;
 async function refresh(){
  if(inFlight)return;
  const status=$('vweApiFeedback'),button=$('vweApiRefresh');
  if(!status||!button)return;
  inFlight=true;button.disabled=true;status.textContent='Passieve VWE-metingen ophalen…';
  try{
   const response=await fetch('/api/admin-operations?action=vwe_status',{
    credentials:'same-origin',cache:'no-store',headers:{Accept:'application/json'}
   });
   const data=await response.json().catch(()=>({}));
   if(!response.ok)throw Error(data.error||'VWE-statusgegevens niet beschikbaar');
   render(data);
   status.textContent='Status bijgewerkt: '+asDate(data.measuredAt)+'. Alleen eerder geregistreerde aanvragen.';
   $('vweApiNotice').textContent=data.notice||'Er wordt geen live VWE-aanvraag uitgevoerd.';
  }catch(error){status.textContent='Status ophalen mislukt: '+(error.message||'Onbekende fout')}
  finally{inFlight=false;button.disabled=false}
 }
 document.querySelector('#adminNav [data-target="vwe"]')?.addEventListener('click',refresh);
 $('vweApiRefresh')?.addEventListener('click',refresh);
})();
