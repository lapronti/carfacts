/* Carfacts preview: curated NL active emission-zone selector, last verified 22 October 2026. */
/* Sources: opwegnaarzes.nl/bedrijven/waar-komen-de-ze-zones and milieuzones.nl/en/node/400459. */
(()=>{'use strict';
 const checkedOn='22 oktober 2026';
 const SOURCES={
  ze:'https://www.opwegnaarzes.nl/bedrijven/waar-komen-de-ze-zones',
  access:'https://www.opwegnaarzes.nl/bedrijven/toegangsregels',
  mz:'https://www.milieuzones.nl/en/node/400459',
  rules:'https://www.milieuzones.nl/personen-en-bestelautos',
  rdw:'https://www.rdw.nl/ontheffing-zero-emissie/aanvragen/ontheffing-voor-buitenlands-voertuig'
 };
 // z: active zero-emission zone; p: diesel passenger-car minimum; t: truck minimum; b: diesel-bus minimum.
 const locations=[
  {name:'Amersfoort',province:'Utrecht',z:1},
  {name:'Amsterdam',province:'Noord-Holland',z:1,p:5,t:6,b:6},
  {name:'Arnhem',province:'Gelderland',z:1,p:5,b:6},
  {name:'Assen',province:'Drenthe',z:1},
  {name:'Breda',province:'Noord-Brabant',t:6},
  {name:'Delft',province:'Zuid-Holland',z:1,t:6},
  {name:'Den Haag',province:'Zuid-Holland',z:1,p:4,b:6,coast:1},
  {name:'Eindhoven',province:'Noord-Brabant',z:1,b:6},
  {name:'Enschede',province:'Overijssel',z:1},
  {name:'Gouda',province:'Zuid-Holland',z:1},
  {name:'Groningen',province:'Groningen',z:1},
  {name:'Haarlem',province:'Noord-Holland',z:1},
  {name:"'s-Hertogenbosch",province:'Noord-Brabant',z:1},
  {name:'Leiden',province:'Zuid-Holland',z:1},
  {name:'Maastricht',province:'Limburg',z:1,t:6},
  {name:'Nijmegen',province:'Gelderland',z:1},
  {name:'Rijswijk',province:'Zuid-Holland',t:6,b:6},
  {name:'Rotterdam',province:'Zuid-Holland',z:1,t:6,maasvlakte:1},
  {name:'Schiphol (Haarlemmermeer)',province:'Noord-Holland',z:1,airport:1},
  {name:'Tilburg',province:'Noord-Brabant',z:1},
  {name:'Utrecht',province:'Utrecht',z:1,p:5,b:6},
  {name:'Zwolle',province:'Overijssel',z:1}
 ];
 const $=id=>document.getElementById(id);
 const vehicle={identity:null,emission:null};
 const el=(tag,klass,content)=>{const n=document.createElement(tag);if(klass)n.className=klass;if(content!==undefined)n.textContent=String(content);return n};
 const provinces=[...new Set(locations.map(x=>x.province))].sort((a,b)=>a.localeCompare(b,'nl'));
 const lookup=()=>locations.find(x=>x.name===$('zone-city')?.value);
 const normalizeEmissions=v=>{
  const raw=String(v||'');
  const hit=raw.match(/(?:euro(?:klasse)?\s*)?(\d)(?:[a-z]|\b)/i);
  return hit?Number(hit[1]):null;
 };
 const profile=()=>{
  const v=Array.isArray(vehicle.identity)?vehicle.identity[0]||{}:vehicle.identity||{};
  const e=Array.isArray(vehicle.emission)?vehicle.emission[0]||{}:vehicle.emission||{};
  const sourceType=[v.vehicleType?.description,v.vehicleType?.code,v.vehicleCategory?.description,v.vehicleCategory?.code,v.category?.description,v.category?.code].filter(Boolean).join(' ').toLowerCase();
  let category='';
  if(/autobus|touringcar|busvervoer|(^|\W)m[23](\W|$)/.test(sourceType))category='bus';
  else if(/vracht|truck|zware bedrijfsauto|(^|\W)n[23](\W|$)/.test(sourceType))category='truck';
  else if(/bestel|lichte bedrijfs|(^|\W)n1(\W|$)/.test(sourceType))category='van';
  else if(/personen|(^|\W)m1(\W|$)/.test(sourceType))category='car';
  else if(/bedrijfsauto|bedrijfswagen/.test(sourceType)){
   const mass=Number(v.maximumMass||0);
   if(mass>0&&mass<=3500)category='van';
  }
  const selected=$('zone-vehicle-category')?.value||'';
  if(selected)category=selected;
  const fuels=Array.isArray(v.fuels)?v.fuels.map(x=>String(x?.description||x?.name||'').toLowerCase()).filter(Boolean):[];
  const electric=fuels.length>0&&fuels.every(f=>/elektr|electric|waterstof|hydrogen/.test(f));
  const diesel=fuels.some(f=>/diesel/.test(f));
  const date=String(v.firstAdmissionDate||'').slice(0,10);
  return {category,sourceType,fuels,electric,diesel,det:/^\d{4}-\d{2}-\d{2}$/.test(date)?date:'',euro:normalizeEmissions(e.euroClass),hasIdentity:!!vehicle.identity,hasEmission:!!vehicle.emission,manual:!!selected};
 };
 const categoryNames={car:'personenauto',van:'bestelauto',truck:'vrachtauto',bus:'autobus'};
 const labelType=x=>[x.z?'Zero-emissiezone':null,x.p?'Dieselpersonenauto':null,x.t?'Vrachtwagenmilieuzone':null,x.b?'Busmilieuzone':null].filter(Boolean).join(' · ');
 const message=(headline,description,tone='neutral')=>({headline,description,tone});
 function classicAssessment(zone,klass,minimum,extra=''){
  if(!zone[klass])return message('Niet van toepassing','Voor deze voertuigcategorie is hier geen klassieke dieselmilieuzone opgenomen. Andere lokale verkeersregels kunnen gelden.');
  if(minimum===null)return message('Nog niet te beoordelen','De emissieklasse ontbreekt. Haal de VWE-gegevens op en controleer de officiële kentekencheck.','warn');
  return minimum>=zone[klass]
   ?message('Waarschijnlijk toegestaan','De geregistreerde Euroklasse '+minimum+' voldoet aan de grens van emissieklasse '+zone[klass]+'. '+extra+'Vrijstellingen, ontheffingen en precieze grenzen zijn niet automatisch gecontroleerd.','good')
   :message('Waarschijnlijk geen toegang','Dieselvoertuigen in deze categorie moeten minimaal emissieklasse '+zone[klass]+' hebben. '+extra+'Een ontheffing of uitzondering kan van toepassing zijn.','bad');
 }
 function evaluate(zone,vehicleInfo){
  const p=vehicleInfo,category=p.category;
  if(!category)return message('Selecteer het voertuigtype','Het type voertuig is nog niet betrouwbaar vastgesteld. Kies hierboven de categorie of haal de voertuiggegevens op.','warn');
  if(category==='car'){
   if(!zone.p)return message('Geen milieuzone voor personenauto’s','Deze locatie heeft wel een actieve zone, maar de weergegeven zero-emissiezone geldt alleen voor bestel- en vrachtauto’s. Controleer eventuele andere verkeersbeperkingen.');
   if(!p.hasIdentity||!p.hasEmission)return message('Kentekencheck nodig','Haal eerst de voertuig- en emissiegegevens op om een indicatie voor de dieselpersonenauto te krijgen.','warn');
   if(!p.diesel)return message('Deze dieselmilieuzone geldt niet voor deze brandstof','De klassieke milieuzone beperkt dieselpersonenauto’s. Controleer de exacte brandstof en overige verkeersregels.','good');
   if(zone.coast){
    if(p.euro===null)return message('Emissieklasse ontbreekt','Den Haag heeft meerdere zones; controleer de eisen voor het centrum en de kuststrook.','warn');
    if(p.euro>=5)return message('Waarschijnlijk toegestaan','Euro '+p.euro+' voldoet aan de bekende normen voor de groene en blauwe milieuzone. Controleer het precieze gebied.','good');
    return message('Verschillende normen per gebied','Den Haag heeft een groene milieuzone (minimaal klasse 4) en een blauwe zone aan de kust (minimaal klasse 5). Controleer de exacte bestemming.','warn');
   }
   return classicAssessment(zone,'p',p.euro);
  }
  if(category==='van'){
   if(!zone.z)return message('Geen zero-emissiezone voor bestelauto’s','Deze locatie heeft een actieve zone voor andere voertuigtypen. Een klassieke vrachtwagen- of busmilieuzone geldt niet automatisch voor bestelauto’s.');
   if(!p.hasIdentity||!p.hasEmission)return message('Kentekencheck nodig','De overgangsregeling hangt af van voertuigtype, Euroklasse en datum eerste toelating. Haal het kenteken op om die gegevens te beoordelen.','warn');
   if(p.electric)return message('Waarschijnlijk toegestaan','Een volledig elektrisch of waterstof-aangedreven bestelvoertuig valt in beginsel binnen de ZE-toegangsregels. Controleer eventuele lokale voorwaarden.','good');
   if(!p.det||p.euro===null)return message('Onvoldoende gegevens','Voor een bestelauto met verbrandingsmotor zijn de Euroklasse en datum eerste toelating nodig. Gebruik de officiële ZE-kentekencheck.','warn');
   if(p.det>='2025-01-01')return message('Doorgaans geen toegang','Nieuwe niet-emissievrije bestelauto’s met datum eerste toelating vanaf 1 januari 2025 hebben in beginsel geen toegang tot de ZE-zone, tenzij een uitzondering of ontheffing geldt.','bad');
   if(p.euro<=4)return message('Doorgaans geen toegang','Bestelauto’s met Euroklasse 4 of lager vallen buiten de algemene ZE-overgangsregeling. Een ontheffing kan uitzonderlijk mogelijk zijn.','bad');
   if(p.euro===5)return message('Tijdelijk toegang mogelijk','Voor Euro 5-bestelauto’s van vóór 2025 geldt de overgangsregeling tot 1 januari 2027. Controleer de officiële registratie en eventuele lokale voorwaarden.','warn');
   if(p.euro>=6)return message('Toegang via overgangsregeling mogelijk','Voor Euro 6-bestelauto’s van vóór 2025 geldt volgens de RDW momenteel toegang tot 1 januari 2028. Verlenging tot 2029 is aangekondigd maar nog niet definitief vastgesteld. Controleer de officiële kentekencheck.','good');
   return message('Toegang niet vastgesteld','Gebruik de officiële ZE-kentekencheck.','warn');
  }
  if(category==='truck'){
   if(zone.z){
    if(p.hasIdentity&&p.electric)return message('Waarschijnlijk toegestaan','Uitstootvrije vrachtauto’s zijn in beginsel welkom in de zero-emissiezone. Controleer de voertuigregistratie.','good');
    return message('Overgangsregeling voor vrachtauto’s controleren','De toegang hangt af van onder meer Euroklasse, type vrachtauto, gewicht en datum eerste toelating. Carfacts kan die uitzonderingen nog niet volledig automatisch beoordelen.','warn');
   }
   if(!zone.t)return message('Geen vrachtwagenmilieuzone bekend','Volgens de beschikbare lijst geldt hier geen klassieke vrachtwagenmilieuzone of ZE-zone. Controleer de verkeersborden.');
   if(!p.hasIdentity||!p.hasEmission)return message('Vrachtwagengegevens nodig','Haal voertuig- en emissiegegevens op voor een voorlopige beoordeling.','warn');
   if(!p.diesel)return message('Dieselmilieuzone niet van toepassing','Voor niet-dieselvrachtauto’s gelden andere regels. Controleer het zonegebied.','good');
   return classicAssessment(zone,'t',p.euro);
  }
  if(category==='bus'){
   if(!zone.b)return message('Geen busmilieuzone bekend','De actieve zone in deze plaats geldt volgens de geraadpleegde lijst niet voor autobussen. Controleer andere verkeersbeperkingen.');
   if(!p.hasIdentity||!p.hasEmission)return message('Busgegevens nodig','Haal voertuig- en emissiegegevens op voor de voorlopige beoordeling.','warn');
   if(!p.diesel)return message('Dieselmilieuzone niet van toepassing','De busmilieuzone richt zich op dieselautobussen. Controleer de overige verkeersregels.','good');
   return classicAssessment(zone,'b',p.euro);
  }
  return message('Nog niet te beoordelen','Selecteer eerst voertuigcategorie en stad.','warn');
 }
 function render(){
  const city=$('zone-city'),region=$('zone-province'),out=$('zone-result'),info=$('zone-list-info');
  if(!city||!region||!out)return;
  const zone=lookup();
  const choices=locations.filter(x=>x.province===region.value);
  if(info)info.textContent=region.value
    ?choices.length+' actieve zone'+(choices.length===1?'':'locaties')+' in '+region.value+' · Stand '+checkedOn
    :locations.length+' actieve zonelocaties · '+provinces.length+' provincies · Stand '+checkedOn;
  const zLink=$('zone-source-ze'),mLink=$('zone-source-mz'),detail=$('zone-active-type');
  if(zLink)zLink.hidden=!zone?.z;
  if(mLink)mLink.hidden=!(zone&&(zone.p||zone.t||zone.b));
  if(detail)detail.textContent=zone?labelType(zone):'Kies eerst een provincie en een plaats';
  out.replaceChildren();
  if(!zone){const p=el('p','zone-placeholder',region.value?'Kies nu een stad met een actieve zone.':'Kies een provincie om alleen plaatsen met een actieve milieuzone of zero-emissiezone te zien.');out.append(p);return}
  const p=profile(),assessment=evaluate(zone,p);
  out.className='zone-result zone-'+assessment.tone;
  const heading=el('strong','zone-result-head',assessment.headline);
  const desc=el('p','',assessment.description);
  const ident=el('div','zone-identification',p.category?(categoryNames[p.category]+(p.manual?' · handmatig gekozen':' · herkend uit VWE')):'Voertuigcategorie onbekend');
  if(p.euro!==null)ident.textContent+=' · Euro '+p.euro;
  if(p.det)ident.textContent+=' · DET '+p.det.split('-').reverse().join('-');
  out.append(heading,desc,ident);
  if(zone.airport)out.append(el('p','zone-special','Let op: deze ZE-zone betreft Schiphol-Centrum, niet heel Haarlemmermeer.'));
  if(zone.maasvlakte)out.append(el('p','zone-special','Rotterdam heeft daarnaast een afzonderlijke vrachtwagenmilieuzone op de Maasvlakte.'));
  if(zone.coast)out.append(el('p','zone-special','Den Haag heeft gebiedsafhankelijke milieuzoneregels, waaronder de kuststrook.'));
  out.append(el('p','zone-disclaimer','Dit is een indicatie, geen officiële ontheffing of toelatingsgarantie. Controleer de zonegrenzen, verkeersborden, vrijstellingen en actuele regelgeving.'));
 }
 function fillCities(){
  const region=$('zone-province'),select=$('zone-city');if(!region||!select)return;
  select.replaceChildren();
  const prompt=el('option','','Kies een plaats');prompt.value='';select.append(prompt);
  const options=locations.filter(item=>item.province===region.value).sort((a,b)=>a.name.localeCompare(b.name,'nl'));
  options.forEach(item=>{const option=el('option','',item.name);option.value=item.name;select.append(option)});
  select.disabled=!options.length;select.value='';render();
 }
 function init(){
  const stats=$('stats');if(!stats||$('zone-check'))return;
  const container=el('section','zone-checker');container.id='zone-check';
  const title=el('div','zone-heading');
  const heading=el('div');heading.append(el('div','zone-kicker','Milieuzones Nederland'),el('h2','','Check toegang per regio'));
  const subtitle=el('p','zone-summary','Selecteer een provincie en een plaats. Alleen officieel als actief vermelde zoneplaatsen zijn opgenomen.');
  title.append(heading,subtitle);
  const controls=el('div','zone-controls');
  function selectField(id,labelText,prompt){
   const label=el('label','zone-field'),description=el('span','',labelText),sel=el('select');sel.id=id;sel.name=id;
   const option=el('option','',prompt);option.value='';sel.append(option);label.append(description,sel);controls.append(label);return sel;
  }
  const province=selectField('zone-province','Provincie','Kies provincie');
  provinces.forEach(name=>{const option=el('option','',name);option.value=name;province.append(option)});
  const city=selectField('zone-city','Plaats met actieve zone','Kies eerst provincie');city.disabled=true;
  const vehicleField=selectField('zone-vehicle-category','Voertuigcategorie','Automatisch (VWE)');
  [{value:'car',text:'Personenauto'},{value:'van',text:'Bestelauto'},{value:'truck',text:'Vrachtauto'},{value:'bus',text:'Autobus'}].forEach(({value,text})=>{const option=el('option','',text);option.value=value;vehicleField.append(option)});
  const types=el('div','zone-type-line','Kies eerst een provincie en een plaats');types.id='zone-active-type';
  const result=el('div','zone-result zone-neutral');result.id='zone-result';result.setAttribute('role','status');result.setAttribute('aria-live','polite');
  const bottom=el('div','zone-bottom');
  const count=el('span','zone-list-info');count.id='zone-list-info';
  const sources=el('div','zone-source-links');
  const ze=el('a','','Officieel ZE-overzicht ↗');ze.id='zone-source-ze';ze.href=SOURCES.ze;ze.target='_blank';ze.rel='noopener noreferrer';ze.hidden=true;
  const mz=el('a','','Officiële milieuzonekaart ↗');mz.id='zone-source-mz';mz.href=SOURCES.mz;mz.target='_blank';mz.rel='noopener noreferrer';mz.hidden=true;
  const rules=el('a','','Toegangsregels en overgangstermijnen ↗');rules.href=SOURCES.access;rules.target='_blank';rules.rel='noopener noreferrer';
  sources.append(ze,mz,rules);bottom.append(count,sources);
  container.append(title,controls,types,result,bottom);
  stats.insertAdjacentElement('afterend',container);
  province.addEventListener('change',fillCities);
  city.addEventListener('change',render);
  vehicleField.addEventListener('change',render);
  window.addEventListener('carfacts:search-start',()=>{vehicle.identity=null;vehicle.emission=null;render()});
  window.addEventListener('carfacts:dataset',ev=>{
   if(ev.detail?.type==='advanced')vehicle.identity=ev.detail.data;
   if(ev.detail?.type==='emission')vehicle.emission=ev.detail.data;
   if(ev.detail?.type==='advanced'||ev.detail?.type==='emission')render();
  });
  render();
 }
 if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
 else init();
})();