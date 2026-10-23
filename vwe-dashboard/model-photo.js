/* Carfacts · resilient, model-matched vehicle photography.
   Wikimedia Commons images are screened for normal production cars (not race, tuned, sponsor-wrapped or concept vehicles) and credited with links to source and licence;
   Wikipedia page image is used only as a clearly labelled last-resort model reference.
   No plate, VIN, personal data or vehicle API credential is sent to Wikimedia. */
(function(){
 'use strict';
 const $=id=>document.getElementById(id);
 const TTL=30*60*1000,MAX_RESULTS=16,SEARCH_TIMEOUT=5500;
 const cache=new Map();
 const dismissed=new Set();
 let sequence=0;
 const controllers=new Set();
 let current=[],position=0,currentBrand='',currentModel='',lastSource='',fallbackAttempted=false;
 // Negative evidence comes from filename AND Wikimedia Commons category names.
 // Prefer no photo over a rally car, exhibition concept, heavily modified car or sponsorship livery.
 const badWords=[
  'people','person','crowd','driver','woman','man standing','man sitting','family portrait',
  'police','ambulance','fire engine','fire truck','emergency','taxi','military',
  'rally','rallye','wrc','wrx rally','racing','racecar','race car','race cars','racing car','race track',
  'motorsport','motor sport','motorsports','circuit racing','touring car racing',
  'raceway','trackday','track day','rallycross','autocross','hillclimb','hill climb',
  'drag racing','drifting','drift','formula racing','gt3','gt4','tcr','btcc','dtm','fia',
  'red bull','redbull','castrol rally','monster energy','motul racing','sponsored',
  'sponsor','sponsors','sponsorship','race livery','livery','liveries','vinyl wrap',
  'wrapped car','car wrap','decals','sticker bomb','stickers','advertising vehicle',
  'tuned','tuning','customized','customised','custom build','custom body',
  'bodykit','body kit','widebody','wide body','lowered car','stanced','modified',
  'concept car','concept vehicle','prototype','showcar','show car','exhibition prototype',
  'motorshow','motor show','auto show','car show','car exhibition','car expo',
  'geneva motor show','frankfurt motor show','international motor show','salon de',
  'crash','wreck','accident','accidental','burnt','driving','moving car','highway',
  'motorway','traffic','in motion','rolling shot','test drive','road test',
  'interior','dashboard','engine bay','engine compartment','toy car','diecast',
  'die cast','scale model','miniature','lego','video','screenshot','game screenshot'
 ];
 // Composite category names often contain WRC / race / motorsport even if filename is generic.
 const badPatterns=[
  /\b(?:wrc|wtcc|wtcr|btcc|dtm|tcr|gt3|gt4|fia|rally|rallye|racing|racecar|motorsport|hillclimb)\b/,
  /\b(?:red\s?bull|monster\s?energy|livery|decals|sponsor(?:ed|ship)?|motorshow|tuning|bodykit|widebody)\b/,
  /\b(?:r\s+wrc|rally\s+car|race\s+car|race\s+track|racing\s+team)\b/
 ];
 const goodWords=[['studio',48],['showroom',38],['press',42],['official',38],['catalog',37],['brochure',37],['stock',44],['production',30],['standard',42],['original',22],['unmodified',42],['stationary',32],['parked',28],['parking',17],['exterior',25],['front',12],['three quarter',16],['side view',14],['front view',15],['dealership',26],['manufacturer',36]];
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
 const isUnsuitable=text=>badWords.some(word=>allWords(text,word))||badPatterns.some(pattern=>pattern.test(text));
 const pageContext=page=>{
  const categories=Array.isArray(page?.categories)?page.categories.map(cat=>String(cat?.title||'')).join(' '):'';
  return normalize(String(page?.title||'')+' '+categories);
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
  if(isUnsuitable(pageContext(page)))return null;
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
  placeholder:$('vehicle-photo-placeholder'),next:$('vehicle-photo-next'),report:$('vehicle-photo-report'),credit:$('vehicle-photo-credit')
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
  if(p.report)p.report.hidden=true;
  dismissed.clear();
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
  prop:'imageinfo|categories',cllimit:'max',iiprop:'url|mime|size',iiurlwidth:'640',format:'json',origin:'*'
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
   if(isUnsuitable(bad))return [];
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
   if(!fallbackAttempted&&!dismissed.size){
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
   p.img.hidden=true;if(p.placeholder){p.placeholder.hidden=false;p.placeholder.textContent='Geen geschikte standaardfoto beschikbaar.'}
   p.caption.textContent='Voor dit model kon geen passende afbeelding worden geladen. Er wordt geen willekeurig voertuig getoond.';
   if(p.next)p.next.hidden=true;if(p.credit)p.credit.hidden=true;
   return;
  }
  while(start<current.length&&dismissed.has(current[start].title))start++;
  if(start>=current.length){if(p.placeholder){p.placeholder.hidden=false;p.placeholder.textContent='Geen andere passende standaardfoto beschikbaar.'}p.img.hidden=true;if(p.next)p.next.hidden=true;if(p.report)p.report.hidden=true;if(p.credit)p.credit.hidden=true;return}
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
   if(p.next)p.next.hidden=current.filter(x=>!dismissed.has(x.title)).length<2;
   if(p.report)p.report.hidden=false;
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
  if(p.next)p.next.onclick=()=>{const available=current.filter(x=>!dismissed.has(x.title));if(available.length>1){const next=available.findIndex(x=>x.title===current[position]?.title);const nextPhoto=available[(next+1)%available.length];showAt(current.findIndex(x=>x.title===nextPhoto.title),sequence)}};
  if(p.report)p.report.onclick=()=>{
   const rejected=current[position];if(!rejected)return;
   dismissed.add(rejected.title);
   const next=current.findIndex(x=>!dismissed.has(x.title));
   if(next>=0)showAt(next,sequence);
   else{
    p.img.hidden=true;if(p.placeholder){p.placeholder.hidden=false;p.placeholder.textContent='Geen andere passende standaardfoto beschikbaar.'}
    if(p.caption)p.caption.textContent='De vorige foto is verborgen. Er is geen andere geschikte modelfoto beschikbaar.';
    if(p.next)p.next.hidden=true;if(p.report)p.report.hidden=true;if(p.credit)p.credit.hidden=true;
   }
  };
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
