/* Carfacts preview roadmap: readable VWE presentation, report and maintenance guidance. Parts search lives at /parts/. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const snapshot={advanced:null,emission:null,inspections:null,repairs:null,plate:'',results:null};
 const sourceLabel='VWE-acceptatiegegevens (testomgeving)';
 const section=(tag,className,textValue)=>{const el=document.createElement(tag);if(className)el.className=className;if(textValue!==undefined)el.textContent=String(textValue);return el};
 const value=v=>v===undefined||v===null||v===''?'Niet beschikbaar':String(v);
 const prettyDate=v=>v&&/^\d{4}-\d{2}-\d{2}/.test(String(v))?String(v).slice(0,10).split('-').reverse().join('-'):value(v);
 const first=data=>Array.isArray(data)?(data[0]||{}):data&&typeof data==='object'?data:{};
 const cleanNumber=n=>Number.isFinite(Number(n))?Number(n).toLocaleString('nl-NL'):'Niet beschikbaar';
 const has=v=>v!==null&&v!==undefined&&v!=='';
 const brandModel=v=>[v?.make?.name,v?.model?.name?.replace(/\s+MODIFIED\s+PARTITION\s+WALL\s*$/i,'')].filter(Boolean).join(' ');
 const safeText=v=>typeof v==='string'&&v.length<260&&!/^[\s]*[\[{]/.test(v)?v.trim():'';

 function addField(container,label,content){
  if(!has(content))return;
  const item=section('div','field'),key=section('span','',label),val=section('strong','',content);
  item.append(key,val);container.append(item);
 }
 function group(container,name,entries){
  const valid=entries.filter(([key,v])=>has(v));
  if(!valid.length)return;
  container.append(section('h4','field-group',name));
  valid.forEach(([key,v])=>addField(container,key,v));
 }
 function buildIdentity(data){
  const v=first(data),container=document.querySelector('#advanced .fields');
  if(!container)return;
  container.replaceChildren();
  const name=typeof window.vehicleDisplayNames==='function'?window.vehicleDisplayNames(v.make?.name,v.model?.name):{brand:v.make?.name,model:v.model?.name,original:v.model?.name,normalized:false};
  group(container,'Identiteit',[
   ['Merk',name.brand],['Model',name.model],
   ['Voertuigtype',v.vehicleType?.description],
   ['Registratieomschrijving (VWE)',name.normalized?name.original:null]
  ]);
  group(container,'Registratie en APK',[
   ['Eerste toelating',has(v.firstAdmissionDate)?prettyDate(v.firstAdmissionDate):null],
   ['Eerste registratie',has(v.firstRegistrationDate)?prettyDate(v.firstRegistrationDate):null],
   ['APK geldig tot',has(v.motExpirationDate)?prettyDate(v.motExpirationDate):null],
   ['Verzekerd',typeof v.hasInsurance==='boolean'?(v.hasInsurance?'Ja':'Nee'):null]
  ]);
  const power=Number(v.power);
  group(container,'Motor en specificaties',[
   ['Motorcode',v.engineCode],
   ['Cilinderinhoud',has(v.engineCapacity)?cleanNumber(v.engineCapacity)+' cc':null],
   ['Vermogen',has(v.power)&&Number.isFinite(power)?cleanNumber(power)+' kW · '+Math.round(power*1.3596216173)+' pk':null],
   ['Brandstof',Array.isArray(v.fuels)?v.fuels.map(x=>x.description).filter(Boolean).join(', '):null],
   ['Deuren',v.numberOfDoors],['Zitplaatsen',v.numberOfSeats]
  ]);
  group(container,'Afmetingen, massa en fiscaal',[
   ['Wielbasis',has(v.wheelbase)?v.wheelbase+' cm':null],
   ['Leeggewicht',has(v.curbWeight)?cleanNumber(v.curbWeight)+' kg':null],
   ['Toegestane maximummassa',has(v.maximumMass)?cleanNumber(v.maximumMass)+' kg':null],
   ['Laadvermogen',has(v.maximumLoad)?cleanNumber(v.maximumLoad)+' kg':null],
   ['Catalogusprijs',has(v.listPrice)?'€ '+cleanNumber(v.listPrice):null],
   ['Bruto BPM',has(v.bpmGross)?'€ '+cleanNumber(v.bpmGross):null]
  ]);
  const hint=$('registration-insight');
  if(hint){
   hint.textContent='';
   const admitted=String(v.firstAdmissionDate||'').slice(0,10),registered=String(v.firstRegistrationDate||'').slice(0,10);
   const diff=(Date.parse(registered+'T00:00:00Z')-Date.parse(admitted+'T00:00:00Z'))/86400000;
   if(Number.isFinite(diff)&&diff>30){
    hint.textContent='Tussen de twee geregistreerde datums zit '+Math.round(diff)+' dagen. Dit bewijst op zichzelf geen import; de betekenis van de registratiedatums moet bij de bron worden gecontroleerd.';
   }else{
    hint.textContent='Registratiedatums zijn brongegevens. Het land van herkomst wordt zonder afzonderlijke bron niet vastgesteld.';
   }
  }
  const fields=['make','model','firstAdmissionDate','motExpirationDate','engineCode','fuels'];
  const present=fields.filter(key=>key==='make'?has(v.make?.name):key==='model'?has(v.model?.name):key==='fuels'?Array.isArray(v.fuels)&&v.fuels.length>0:has(v[key])).length;
  const badge=$('quality-completeness');
  if(badge)badge.textContent='Identiteit: '+present+' van '+fields.length+' basisvelden';
  const modelBadge=$('model-source');if(modelBadge)modelBadge.textContent=brandModel(v)||'Voertuiggegevens opgehaald';
 }
 function renderEuroMark(target,rawValue){
  if(!target)return;
  const value=String(rawValue??'').trim();
  const matched=value.match(/(?:^|[^0-9])([0-6])(?=[^0-9]|$)/);
  if(!matched){target.textContent=value||'Niet beschikbaar';return}
  const klass=matched[1];
  const wrapper=section('span','euro-mark');
  const disc=section('span','euro-mark-disc',klass);
  disc.setAttribute('role','img');
  disc.setAttribute('aria-label','Emissieklasse Euro '+klass);
  const label=section('span','euro-mark-text','Euro '+klass);
  wrapper.append(disc,label);
  target.replaceChildren(wrapper);
 }
 function buildEmission(data){
  const v=first(data),container=document.querySelector('#technical .fields');
  if(!container)return;
  container.replaceChildren();
  group(container,'Milieu en aandrijving',[
   ['Euroklasse',v.euroClass],['Energielabel',v.energyLabel],['Bijtelling',v.taxAddition]
  ]);
  group(container,'Transmissie',[
   ['Versnellingsbak',v.gearbox?.description],
   ['Aantal versnellingen',v.gearbox?.numberOfGears]
  ]);
  group(container,'Geluid en toerental',[
   ['Geluid stationair',has(v.noiseLevel?.idle)?v.noiseLevel.idle+' dB':null],
   ['Geluid tijdens rijden',has(v.noiseLevel?.driving)?v.noiseLevel.driving+' dB':null],
   ['Stationair toerental',v.noiseLevel?.idleAtRpm]
  ]);
  // The inline VWE renderer writes the text first; this renders the same badge
  // after the grouped fields have been refreshed.
  const euroField=[...container.querySelectorAll('.field')].find(item=>item.querySelector('span')?.textContent==='Euroklasse');
  renderEuroMark(euroField?.querySelector('strong'),v.euroClass);
  renderEuroMark($('stat-euro'),v.euroClass);
 }
 function recordsFrom(data,type){
  if(Array.isArray(data))return data;
  if(!data||typeof data!=='object')return [];
  const keys=type==='inspections'?['inspections','data','results','items']:['repairs','data','results','items'];
  for(const key of keys)if(Array.isArray(data[key]))return data[key];
  return [];
 }
 function descriptions(item){
  const raw=item?.defects??item?.observations??item?.findings;
  let array=[];
  if(Array.isArray(raw))array=raw;
  else if(raw&&typeof raw==='object')array=[raw];
  else if(typeof raw==='string'){
   try{const parsed=JSON.parse(raw);if(Array.isArray(parsed))array=parsed;else if(parsed&&typeof parsed==='object')array=[parsed];else array=[raw]}catch(e){array=[raw]}
  }
  const items=array.map(entry=>typeof entry==='string'?safeText(entry):safeText(entry?.description||entry?.repairDescription||'')).filter(Boolean);
  if(items.length)return [...new Set(items)];
  const other=safeText(item?.description||item?.result);
  return other?[other]:[];
 }
 function buildInspections(data){
  const entries=recordsFrom(data,'inspections').slice(0,100).map((entry,i)=>({entry,i})).sort((a,b)=>{
    const left=Date.parse(a.entry.inspectionDate||a.entry.date||'')||0;
    const right=Date.parse(b.entry.inspectionDate||b.entry.date||'')||0;
    return right-left||a.i-b.i;
  });
  const rows=document.querySelector('#history .rows');
  if(!rows)return;
  rows.replaceChildren();rows.classList.add('inspections-timeline');
  const countField=document.querySelector('#history .fields');
  if(countField){countField.replaceChildren();addField(countField,'Gevonden APK-registraties',entries.length)}
  if(!entries.length){rows.append(section('p','inspection-empty','Er zijn geen keuringsregistraties gevonden in de beschikbare VWE-respons. Dit is geen bewijs dat er nooit een APK-keuring is uitgevoerd.'));return}
  entries.forEach(({entry},i)=>{
   const card=section('article','inspection-event');
   const top=section('div','inspection-top');
   const title=section('strong','',prettyDate(entry.inspectionDate||entry.date||entry.repairDate));
   const list=descriptions(entry);
   const badge=section('span','inspection-count'+(list.length?' has-findings':''),list.length?list.length+' aandachtspunt'+(list.length===1?'':'en'):'Geen punten vermeld');
   top.append(title,badge);card.append(top);
   if(list.length){const ul=section('ul');list.forEach(text=>ul.append(section('li','',text)));card.append(ul)}
   else card.append(section('div','inspection-empty','In deze registratie zijn geen gebreken omschreven. De keuringsuitslag is hiermee niet bevestigd.'));
   rows.append(card);
  });
 }
 function toolbar(){
  const anchor=$('message');if(!anchor)return;
  const box=section('div','vehicle-toolbar');
  const left=section('div','toolbar-copy');
  left.append(section('strong','','Voertuigrapport'));
  left.append(section('div','','Download via de afdrukfunctie als PDF. Geen accountgegevens of externe PDF-dienst nodig.'));
  const button=section('button','','Rapport opslaan als PDF');
  button.type='button';button.id='print-report-button';button.disabled=true;
  button.addEventListener('click',printReport);
  box.append(left,button);anchor.insertAdjacentElement('afterend',box);
  const quality=section('div','quality-strip');quality.id='quality-overview';
  const source=section('span','quality-chip','Bron: VWE-acceptatie');source.id='model-source-chip';
  const filled=section('span','quality-chip pending','Nog geen voertuig geladen');filled.id='quality-completeness';
  const model=section('span','quality-chip pending','Kenteken nog niet opgehaald');model.id='model-source';
  quality.append(source,filled,model);box.insertAdjacentElement('afterend',quality);
  const hint=section('div','registration-insight','Registratiedatums zijn nog niet opgehaald.');hint.id='registration-insight';
  const identity=$('advanced');if(identity)identity.append(hint);
 }
 function navLink(before,href,label){
  const nav=document.querySelector('.nav'),ref=nav?.querySelector('a[href="'+before+'"]');
  if(!nav||!ref)return;
  const a=section('a','',label);a.setAttribute('href',href);nav.insertBefore(a,ref);
 }
 function maintenanceModule(){
  const future=$('future');if(!future)return;
  const wrapper=section('section','utility-section');wrapper.id='maintenance';
  wrapper.innerHTML='<div class="utility-header"><div><div class="utility-eyebrow">Fase 3 · Onderhoud</div><h2>Indicatieve onderhoudscheck</h2></div><span class="tag">Advies, geen onderhoudshistorie</span></div><div class="utility-panel"><p>Vul de actuele kilometerstand in voor algemene aandachtspunten. Dit is geen fabrieksadvies, diagnose of registratie van uitgevoerde beurten.</p><div class="utility-grid"><label for="mileage-input">Kilometerstand<input id="mileage-input" type="number" min="0" max="2000000" step="1" inputmode="numeric" placeholder="Bijv. 150000"></label><div><button id="maintenance-button" type="button">Toon aandachtspunten</button></div></div><div id="maintenance-message" class="utility-note" role="status">Er worden geen onderhoudsintervallen of vervangingen aangenomen zonder fabrikant- of onderhoudsgegevens.</div><div id="maintenance-results" class="advice-list"></div></div>';
  future.parentNode.insertBefore(wrapper,future);
  $('maintenance-button').addEventListener('click',renderMaintenance);
 }
 function renderMaintenance(){
  const kmText=$('mileage-input')?.value||'',km=Number(kmText),message=$('maintenance-message'),box=$('maintenance-results');box.replaceChildren();
  if(!kmText||!Number.isSafeInteger(km)||km<0||km>2000000){message.textContent='Vul een geldige kilometerstand tussen 0 en 2.000.000 in.';return}
  const vehicle=first(snapshot.advanced),year=String(vehicle.firstAdmissionDate||'').slice(0,4);
  const age=/^\d{4}$/.test(year)?new Date().getFullYear()-Number(year):null;
  const notes=[
   ['Motorolie en filters','Controleer de vervaldatum en kilometergrens volgens het onderhoudsschema van de fabrikant; er zijn geen uitgevoerde beurten bevestigd.'],
   ['Distributie en aandrijving','Controleer met motorcode en onderhoudsboekje welke distributieconstructie en eventuele vervangingsinterval gelden. Niet iedere motor heeft dezelfde eisen.'],
   ['Remvloeistof, remmen en banden','Controleer de laatste vervanging van remvloeistof en laat remmen en banden beoordelen op slijtage en ouderdom.'],
   ['Transmissie en koelcircuit','Controleer versnellingsbaktype, onderhoudsvoorschriften en eventuele onderhoudsregistraties.']
  ];
  if(km>=150000)notes.unshift(['Hogere kilometerstand','Bij een ingevoerde kilometerstand van '+cleanNumber(km)+' km is extra aandacht voor slijtage aan ophanging, lekkages en aandrijving zinvol. Dit betekent niet dat onderdelen vervangen moeten worden.']);
  if(Number.isFinite(age)&&age>=8)notes.push(['Leeftijd van het voertuig','Het voertuig is ongeveer '+age+' jaar oud op basis van de eerste toelating. Controleer leeftijdsafhankelijke onderhoudspunten volgens het fabrieksschema.']);
  message.textContent='Indicatie op basis van door jou ingevoerde '+cleanNumber(km)+' km'+(Number.isFinite(age)?' en de eerste toelatingsdatum':'')+'. Geen werkplaats- of onderhoudshistorie beschikbaar.';
  notes.forEach(([heading,description])=>{const item=section('div','advice-item');item.append(section('strong','',heading),section('p','',description));box.append(item)});
 }
 function preparePremium(){
  document.querySelectorAll('#future .buy').forEach(button=>{
   button.disabled=true;
   button.textContent='Binnenkort beschikbaar';
   button.title='Deze dienst is nog niet aangesloten; er wordt niets in rekening gebracht.';
   button.removeAttribute('data-price');
  });
  const note=document.querySelector('#future .purchase-note');
  if(note)note.textContent='Voorbereide premiumdiensten. Genoemde tarieven zijn uitsluitend prijsvoorstellen; bestellen en betalen zijn niet mogelijk totdat dataleveranciers, gebruiksrechten en betaalverwerking zijn aangesloten.';
  const h=document.querySelector('#repairs .panel-head h3');
  if(h)h.textContent='04 · Status aanvullende APK-gegevens';
  const d=document.querySelector('#repairs .panel-head .small');
  if(d)d.textContent='Niet bevestigd als reparatie- of onderhoudshistorie';
 }
 function printReport(){
  if(!snapshot.advanced&&!snapshot.inspections)return;
  let report=$('print-report');
  if(!report){report=section('article');report.id='print-report';document.body.append(report)}
  report.replaceChildren();
  report.append(section('h1','','CARFACTS · Voertuigrapport'));
  const intro=section('p','print-intro','Kenteken: '+(snapshot.plate||'Niet opgegeven')+' · '+new Date().toLocaleDateString('nl-NL')+' · '+sourceLabel);
  report.append(intro);
  const addSection=(title,fields)=>{
   if(!fields.length)return;
   report.append(section('h2','',title));
   const items=section('div','print-data');
   fields.forEach(([label,val])=>{if(!has(val))return;const item=section('div','print-field');item.append(section('b','',label),section('span','',val));items.append(item)});
   report.append(items);
  };
  if(snapshot.advanced){
   const v=first(snapshot.advanced);
   addSection('Voertuig en registratie',[
    ['Merk',v.make?.name],['Modelomschrijving',v.model?.name],['Voertuigtype',v.vehicleType?.description],
    ['Eerste toelating',has(v.firstAdmissionDate)?prettyDate(v.firstAdmissionDate):null],
    ['Eerste registratie',has(v.firstRegistrationDate)?prettyDate(v.firstRegistrationDate):null],
    ['APK geldig tot',has(v.motExpirationDate)?prettyDate(v.motExpirationDate):null],
    ['Motorcode',v.engineCode],['Brandstof',Array.isArray(v.fuels)?v.fuels.map(x=>x.description).join(', '):null],
    ['Cilinderinhoud',has(v.engineCapacity)?v.engineCapacity+' cc':null],
    ['Vermogen',has(v.power)?v.power+' kW / '+Math.round(Number(v.power)*1.3596216173)+' pk':null],
    ['Wielbasis',has(v.wheelbase)?v.wheelbase+' cm':null]
   ]);
  }
  if(snapshot.emission){
   const v=first(snapshot.emission);
   addSection('Milieu en transmissie',[['Euroklasse',v.euroClass],['Transmissie',v.gearbox?.description],['Aantal versnellingen',v.gearbox?.numberOfGears]]);
  }
  if(snapshot.inspections){
   report.append(section('h2','','APK-keuringshistorie'));
   const entries=recordsFrom(snapshot.inspections,'inspections').slice(0,100).sort((a,b)=>(Date.parse(b.inspectionDate||b.date||'')||0)-(Date.parse(a.inspectionDate||a.date||'')||0));
   if(!entries.length)report.append(section('p','','Geen keuringsregistraties beschikbaar in de VWE-respons.'));
   entries.forEach(item=>{
    const event=section('div','print-event');event.append(section('b','',prettyDate(item.inspectionDate||item.date)));
    const found=descriptions(item);if(found.length){const ul=section('ul');found.forEach(d=>ul.append(section('li','',d)));event.append(ul)}
    else event.append(section('p','','Geen gebreken omschreven; keuringsuitslag niet bevestigd.'));
    report.append(event);
   });
  }
  const mileage=$('mileage-input')?.value;
  if(mileage&&$('maintenance-results')?.children.length){
   report.append(section('h2','','Onderhoudsaandachtspunten (indicatief, geen onderhoudshistorie)'));
   report.append(section('p','','Door gebruiker ingevoerde kilometerstand: '+cleanNumber(mileage)+' km.'));
   document.querySelectorAll('#maintenance-results .advice-item').forEach(item=>{
    report.append(section('p','',item.innerText||item.textContent));
   });
  }
  report.append(section('p','print-disclaimer','Bron: VWE-acceptatie, geen productierapport. Alleen werkelijk ontvangen gegevens worden getoond. Niet beschikbare gegevens betekenen niet dat gebeurtenissen niet hebben plaatsgevonden. APK-opmerkingen zijn geen bewijs van uitgevoerd herstel. Kilometerstand voor onderhoudsadvies is door de gebruiker ingevoerd. Dit document is geen koopadvies of officiële RDW-verklaring.'));
  report.append(section('p','print-footer','Carfacts · test.car-facts.nl · Rapport gegenereerd in de browser. Kies in het afdrukvenster ‘Opslaan als PDF’.'));
  window.print();
 }
 function addModules(){
  toolbar();maintenanceModule();preparePremium();
  navLink('#future','#maintenance','⚒  Onderhoudscheck');
 }
 window.addEventListener('carfacts:search-start',event=>{
  snapshot.advanced=snapshot.emission=snapshot.inspections=snapshot.repairs=null;
  snapshot.plate=String(event.detail?.plate||'');snapshot.results=null;
  const button=$('print-report-button');if(button)button.disabled=true;
  const summary=$('quality-completeness');if(summary)summary.textContent='Voertuiggegevens worden opgehaald…';
  const current=$('model-source');if(current)current.textContent='Zoeken naar voertuig…';
  const verified=$('model-source-chip');if(verified)verified.textContent='Bron: VWE-acceptatie · wachten op gegevens';
  const origin=$('registration-insight');if(origin)origin.textContent='Registratiedatums worden opgehaald…';
  const box=$('maintenance-results');if(box)box.replaceChildren();
  const note=$('maintenance-message');if(note)note.textContent='Vul na de voertuigopvraag een actuele kilometerstand in.';
 });
 window.addEventListener('carfacts:dataset',event=>{
  const {type,data}=event.detail||{};if(!['advanced','emission','inspections','repairs'].includes(type))return;
  snapshot[type]=data;
  if(type==='advanced')buildIdentity(data);
  if(type==='emission')buildEmission(data);
  if(type==='inspections')buildInspections(data);
  const button=$('print-report-button');if(button)button.disabled=!(snapshot.advanced||snapshot.inspections);
 });
 window.addEventListener('carfacts:search-end',event=>{
  snapshot.results=event.detail?.results||null;
  const completed=Object.values(snapshot.results||{}).filter(item=>item?.ok).length;
  const summary=$('model-source-chip');
  if(summary)summary.textContent='Bron: VWE-acceptatie · '+completed+'/3 bevestigde modules ontvangen';
  const when=$('quality-completeness');if(when&&!snapshot.advanced)when.textContent='Voertuigidentiteit niet beschikbaar';
  const error=Object.entries(snapshot.results||{}).filter(([type,record])=>!record.ok);
  if(error.length){
   const messages=[];
   if(error.some(([type,record])=>/401|login|sessie/i.test(record.error||'')))messages.push('Log opnieuw in via Admin.');
   if(error.some(([type,record])=>/403|toegang/i.test(record.error||'')))messages.push('Voor bepaalde datasets ontbreekt VWE-toegang.');
   if(error.some(([type,record])=>/502|bereikbaar|tijdelijk/i.test(record.error||'')))messages.push('Een bron is tijdelijk niet bereikbaar; overige gegevens blijven bruikbaar.');
   const out=$('message');if(out&&messages.length)out.textContent+=' '+[...new Set(messages)].join(' ');
  }
 });
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',addModules,{once:true});else addModules();
})();
