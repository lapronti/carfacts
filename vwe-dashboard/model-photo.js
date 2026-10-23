/* Carfacts · resilient, model-matched vehicle photography.
   Wikimedia Commons images are credited with links to source and licence;
   Wikipedia page image is used only as a clearly labelled last-resort model reference.
   No plate, VIN, personal data or vehicle API credential is sent to Wikimedia. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const TTL=30*60*1000,MAX_RESULTS=16,SEARCH_TIMEOUT=5500;
 const cache=new Map();
 let sequence=0;
 const controllers=new Set();
 let current=[],position=0,currentBrand='',currentModel='',lastSource='',fallbackAttempted=false;
 const badWords=['people','person','crowd','driver','woman','man standing','man sitting','family portrait','police','ambulance','fire engine','fire truck','emergency','taxi','rally','race car','racing','drifting','crash','wreck','accident','accidental','burnt','driving','moving car','highway','motorway','traffic','in motion','rolling shot','test drive','road test','drift','interior','dashboard','engine bay','engine compartment','toy car','diecast','die cast','scale model','miniature','lego','video','screenshot','game screenshot','car crash','motor show','motorshow','auto show','car show','salon de'];
 const goodWords=[['studio',45],['showroom',45],['press',36],['official',28],['catalog',28],['brochure',27],['stationary',23],['parked',18],['parking',12],['display',16],['exterior',13],['front',10],['three quarter',10],['side view',9],['front view',10],['museum',12]];
 const normalize=value=>String(value||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
  .replace(/[^a-z0-9]+/g,' ').trim().replace(/\s+/g,' ');
 const brandAliases={
  volkswagen:['Volkswagen','VW'],
  'mercedes benz':['Mercedes-Benz','Mercedes'],
  mercedes:['Mercedes','Mercedes-Benz'],
  skoda:['Skoda','Škoda'],
  citroen:['Citroen','Citroën'],
  alfa_romeo:['Alfa Romeo','Alfa-Romeo'],
  'land rover':['Land Rover'],
  vauxhall:['Vauxhall','Opel'],
  opel:['Opel','Vauxhall'],
  seat:['SEAT'],
  bmw:['BMW'],
  peugeot:['Peugeot']
 };
 const stripDescriptors=value=>String(value||'').replace(/\bmodified\s+partition\s+wall\b/gi,' ')
  .replace(/\bpartition\s+wall\b/gi,' ').replace(/\b(?:modified|swb|lwb|partition)\b/gi,' ')
  .replace(/\s+/g,' ').trim();
 const aliases=make=>{
  const key=normalize(make),list=brandAliases[key]||brandAliases[key.replace(/\s/g,'_')]||[make];
  return [...new Set(list.map(x=>String(x).trim()).filter(Boolean))];
 };
 const coreOf=model=>{
  const words=normalize(stripDescriptors(model)).split(' ').filter(Boolean);
  if(!words.length)return '';
  // "Model 3" and "ID.4" need their identifying number; "3 Series" needs 3.
  if(['model','series','serie','classe','class','id'].includes(words[0])&&words[1])
   return words.slice(0,2).join(' ');
  if(/^\d$/.test(words[0])&&words[1])return words.slice(0,2).join(' ');
  return words[0];
 };
 const contains=(text,token)=>(' '+text+' ').includes(' '+token+' ');
 const allWords=(text,phrase)=>phrase.split(' ').every(word=>contains(text,word));
 const isImage=url=>{
  try{return new URL(url).protocol==='https:'&&new URL(url).hostname==='upload.wikimedia.org'}catch{return false}
 };
 const fileUrl=title=>'https://commons.wikimedia.org/wiki/'+encodeURIComponent(String(title||'').replace(/ /g,'_'));
 function candidate(page,make,model){
  const image=page.imageinfo?.[0]||{};
  const url=String(image.thumburl||image.url||'');
  const filename=String(page.title||'').replace(/^File:/i,'').replace(/\.[^.]+$/,'');
  const text=normalize(filename),base=coreOf(model);
  if(!isImage(url)||!['image/jpeg','image/png','image/webp'].includes(image.mime))return null;
  if(!base||!allWords(text,base))return null;
  const alternatives=aliases(make).map(normalize);
  if(!alternatives.some(alias=>allWords(text,alias)))return null;
  if(badWords.some(bad=>allWords(text,bad)))return null;
  if(image.width&&image.height&&image.width<image.height*.77)return null;
  let score=65;
  for(const [word,points] of goodWords)if(allWords(text,word))score+=points;
  if(normalize(model)!==base){
   const extra=normalize(model).split(' ').slice(1).filter(w=>w.length>1||/^\d+$/.test(w));
   if(extra.length&&extra.every(w=>contains(text,w)))score+=18;
  }
  if(/(^|\s)(street|road|autobahn)(\s|$)/.test(text))score-=22;
  if(image.width&&image.height&&image.width/image.height>=1.2)score+=8;
  if(/(^|\s)(\d{4})(\s|$)/.test(text))score+=2;
  return {title:page.title,url,pageUrl:String(image.descriptionurl||fileUrl(page.title)),score,kind:'commons'};
 }
 const state=()=>({
  figure:$('vehicle-photo'),img:$('vehicle-photo-img'),caption:$('vehicle-photo-caption'),
  placeholder:$('vehicle-photo-placeholder'),next:$('vehicle-photo-next'),credit:$('vehicle-photo-credit')
 });
 function reset(){
  sequence++;
  for(const ctl of controllers)ctl.abort();
  controllers.clear();
  current=[];position=0;lastSource='';fallbackAttempted=false;
  const p=state();
  if(p.img){p.img.onload=null;p.img.onerror=null;p.img.hidden=true;p.img.removeAttribute('src')}
  if(p.figure)p.figure.hidden=true;
  if(p.placeholder)p.placeholder.hidden=false;
  if(p.next)p.next.hidden=true;
  if(p.credit){p.credit.hidden=true;p.credit.removeAttribute('href')}
 }
 async function requestJSON(url){
  const controller=new AbortController();controllers.add(controller);
  const timeout=setTimeout(()=>controller.abort(),SEARCH_TIMEOUT);
  try{
   const response=await fetch(url,{credentials:'omit',signal:controller.signal,headers:{Accept:'application/json'}});
   if(!response.ok)throw Error('HTTP '+response.status);
   return await response.json();
  }finally{clearTimeout(timeout);controllers.delete(controller)}
 }
 const searchUrl=query=>'https://commons.wikimedia.org/w/api.php?'+new URLSearchParams({
  action:'query',generator:'search',gsrsearch:query,gsrnamespace:'6',gsrlimit:'45',
  prop:'imageinfo',iiprop:'url|mime|size',iiurlwidth:'640',format:'json',origin:'*'
 }).toString();
 function queriesFor(make,model){
  const cleaned=stripDescriptors(model),base=coreOf(cleaned);
  const alternatives=aliases(make);
  const first=[];
  // Try model + both official brand and common abbreviation, e.g. Volkswagen / VW.
  for(const brand of alternatives.slice(0,2))first.push([brand,cleaned].join(' '));
  const fallback=[];
  for(const brand of alternatives.slice(0,2))fallback.push([brand,base].join(' '));
  // A broad search may be dominated by irrelevant files; targeted queries surface
  // additional stationary / official shots without lowering the model-match rule.
  fallback.push(alternatives[0]+' '+base+' showroom');
  if(alternatives[1])fallback.push(alternatives[1]+' '+base+' parked');
  const unique=items=>items.filter((q,i,list)=>q.trim()&&list.findIndex(other=>normalize(other)===normalize(q))===i);
  const primary=unique(first);
  return {first:primary,fallback:unique(fallback).filter(q=>!primary.some(existing=>normalize(existing)===normalize(q)))};
 }
 async function commonsSearch(make,model,queries,requestId){
  const batches=queriesFor(make,model);
  const pool=new Map(),used=new Set();
  const search=async (query)=>{
   if(used.has(query))return;used.add(query);
   try{
    const result=await requestJSON(searchUrl(query));
    if(requestId!==sequence)return;
    for(const page of Object.values(result.query?.pages||{})){
     const photo=candidate(page,make,model);
     if(photo&&!pool.has(photo.title))pool.set(photo.title,photo);
    }
   }catch(e){/* One failed Commons query must not prevent other searches. */}
  };
  await Promise.all(batches.first.map(search));
  if(pool.size<5&&requestId===sequence)await Promise.all(batches.fallback.map(search));
  return [...pool.values()].sort((a,b)=>b.score-a.score).slice(0,MAX_RESULTS);
 }
 async function wikipediaFallback(make,model,requestId){
  const core=coreOf(model),brand=aliases(make)[0];
  if(!core||!brand)return [];
  // Only accept the correctly titled model article. A page for a different car is rejected.
  const title=brand+' '+core;
  const url='https://en.wikipedia.org/w/api.php?'+new URLSearchParams({
   action:'query',titles:title,redirects:'1',prop:'pageimages|info',
   piprop:'thumbnail|name',pithumbsize:'640',inprop:'url',format:'json',origin:'*'
  }).toString();
  try{
   const result=await requestJSON(url);
   if(requestId!==sequence)return [];
   const pages=Object.values(result.query?.pages||{});
   const page=pages.find(p=>p.pageimage&&p.thumbnail?.source&&p.fullurl&&!p.missing);
   if(!page)return [];
   const pageTitle=normalize(page.title);
   if(!allWords(pageTitle,core)||!aliases(make).some(x=>allWords(pageTitle,normalize(x))))return [];
   const imageUrl=String(page.thumbnail.source);
   if(!isImage(imageUrl)||!/\.(?:jpe?g|png|webp)$/i.test(page.pageimage))return [];
   const imgTitle='File:'+page.pageimage;
   const bad=normalize(page.pageimage);
   if(badWords.some(x=>allWords(bad,x)))return [];
   return [{title:imgTitle,url:imageUrl,pageUrl:fileUrl(imgTitle),score:15,kind:'wikipedia'}];
  }catch{return []}
 }
 function sourceView(photo,requestId){
  if(requestId!==sequence)return;
  const p=state();if(!p.credit)return;
  p.credit.href=photo.pageUrl;p.credit.hidden=false;
  p.credit.textContent='Wikimedia Commons · bron en licentie ↗';
  if(photo.kind==='wikipedia')p.credit.textContent='Wikipedia / Wikimedia Commons · bron en licentie ↗';
  if(photo.kind==='wikipedia')return;
  const url='https://commons.wikimedia.org/w/api.php?'+new URLSearchParams({
   action:'query',prop:'imageinfo',titles:photo.title,format:'json',
   iiprop:'extmetadata',iiextmetadatafilter:'LicenseShortName|LicenseUrl|Artist',
   origin:'*'
  }).toString();
  // Credits are loaded after the image. A slow metadata API never prevents display.
  requestJSON(url).then(json=>{
   if(requestId!==sequence||lastSource!==photo.title)return;
   const pages=Object.values(json.query?.pages||{});
   const meta=pages[0]?.imageinfo?.[0]?.extmetadata||{};
   const licence=String(meta.LicenseShortName?.value||'').replace(/<[^>]*>/g,'').trim();
   const creator=String(meta.Artist?.value||'').replace(/<[^>]*>/g,'').replace(/\s+/g,' ').trim();
   const shortCreator=creator&&creator.length<55?creator:'Wikimedia Commons';
   p.credit.textContent='Foto: '+shortCreator+(licence?' · '+licence:'')+' · bron ↗';
  }).catch(()=>{});
 }
 function showAt(start,requestId){
  const p=state();if(!p.img||!p.caption||!p.figure||requestId!==sequence)return;
  if(start>=current.length){
   if(!fallbackAttempted){
    fallbackAttempted=true;
    if(p.placeholder){p.placeholder.hidden=false;p.placeholder.textContent='Alternatieve fotobron controleren…'}
    wikipediaFallback(currentBrand,currentModel,requestId).then(more=>{
     if(requestId!==sequence)return;
     const available=more.filter(candidate=>!current.some(photo=>photo.title===candidate.title));
     if(available.length){current.push(...available);showAt(start,requestId);return}
     showAt(start,requestId);
    }).catch(()=>{if(requestId===sequence)showAt(start,requestId)});
    return;
   }
   p.img.hidden=true;if(p.placeholder){p.placeholder.hidden=false;p.placeholder.textContent='Geen geschikte foto geladen.'}
   p.caption.textContent='Voor dit model kon geen passende afbeelding worden geladen. Er wordt geen willekeurig voertuig getoond.';
   if(p.next)p.next.hidden=true;if(p.credit)p.credit.hidden=true;
   return;
  }
  position=start;
  const photo=current[position];
  p.img.hidden=true;if(p.placeholder){p.placeholder.hidden=false;p.placeholder.textContent='Foto laden…'}
  if(p.next)p.next.hidden=true;
  if(p.credit)p.credit.hidden=true;
  p.img.onload=()=>{
   if(requestId!==sequence||current[position]!==photo)return;
   p.img.hidden=false;if(p.placeholder)p.placeholder.hidden=true;
   p.figure.hidden=false;
   p.caption.textContent='Voorbeeldfoto '+(position+1)+'/'+current.length+
    ' · '+currentBrand+' '+currentModel+
    ' · uitvoering, bouwjaar en kleur kunnen afwijken.';
   if(p.next)p.next.hidden=current.length<2;
   lastSource=photo.title;
   sourceView(photo,requestId);
  };
  p.img.onerror=()=>{
   if(requestId!==sequence||current[position]!==photo)return;
   showAt(position+1,requestId);
  };
  p.img.alt='Stilstaande voorbeeldfoto van '+currentBrand+' '+currentModel+' (uitvoering kan afwijken)';
  p.img.src=photo.url;
 }
 async function load(make,model){
  reset();
  const requestId=sequence,p=state();
  const brand=String(make||'').trim(),cleanModel=stripDescriptors(model);
  if(!brand||!cleanModel)return;
  currentBrand=brand;currentModel=cleanModel;
  if(p.figure)p.figure.hidden=false;
  if(p.placeholder){p.placeholder.hidden=false;p.placeholder.textContent='Modelfoto zoeken…'}
  if(p.caption)p.caption.textContent='We zoeken passende voertuigfoto’s zonder verkeers- of racescènes.';
  if(p.next)p.next.onclick=()=>{if(current.length>1)showAt((position+1)%current.length,sequence)};
  const cacheKey=normalize(brand)+'|'+normalize(cleanModel);
  const cacheHit=cache.get(cacheKey);
  try{
   if(cacheHit&&Date.now()-cacheHit.at<(cacheHit.items.length?TTL:120000))current=cacheHit.items;
   else {
    current=await commonsSearch(brand,cleanModel,null,requestId);
    if(requestId!==sequence)return;
    if(!current.length){fallbackAttempted=true;current=await wikipediaFallback(brand,cleanModel,requestId)}
    if(requestId!==sequence)return;
    cache.set(cacheKey,{at:Date.now(),items:current});
    if(cache.size>60)cache.delete(cache.keys().next().value);
   }
   if(requestId!==sequence)return;
   if(!current.length){
    if(p.placeholder)p.placeholder.textContent='Geen passende foto gevonden.';
    if(p.caption)p.caption.textContent='Er is geen voldoende herkenbare modelfoto gevonden. Probeer later opnieuw; er wordt geen ander merk of model getoond.';
    return;
   }
   showAt(0,requestId);
  }catch{
   if(requestId===sequence){
    if(p.placeholder)p.placeholder.textContent='Modelfoto tijdelijk niet beschikbaar.';
    if(p.caption)p.caption.textContent='De externe fotobron is niet bereikbaar. Voertuiggegevens blijven beschikbaar.';
   }
  }
 }
 window.CarfactsModelPhoto={load,reset};
})();
