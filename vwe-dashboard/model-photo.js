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
 let current=[],position=0,currentBrand='',currentModel='',currentGeneration='',lastSource='',fallbackAttempted=false;
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

 /* Manufacturer-verified Polo generations; first admission is an estimate, not a
    certified model code. Transition years are left ambiguous, not guessed. */
 const POLO_GENERATIONS=Object.freeze([
  {start:2002,end:2008,category:'Volkswagen Polo IV',family:4,phase:'all',label:'Polo IV (2001–2009)'},
  {start:2010,end:2013,category:'Volkswagen Polo V (2009)',family:5,phase:'pre',label:'Polo V (2009–2014)'},
  {start:2015,end:2016,category:'Volkswagen Polo V (2014)',family:5,phase:'facelift',label:'Polo V facelift (2014–2017)'},
  {start:2018,end:2020,category:'Volkswagen Polo VI',family:6,phase:'pre',label:'Polo VI (2017–2021)'},
  {start:2022,end:2027,category:'Volkswagen Polo VI (2021)',family:6,phase:'facelift',label:'Polo VI facelift (vanaf 2021)'}
 ]);
 const vwBrand=value=>['volkswagen','vw'].includes(normalize(value));
 function generationPlan(make,model,firstAdmissionDate){
  if(!vwBrand(make)||coreOf(model)!=='polo')return null;
  const admitted=String(firstAdmissionDate||'').trim();
  const year=/^\d{4}(?:-|$)/.test(admitted)?Number(admitted.slice(0,4)):
   /^\d{8}$/.test(admitted)?Number(admitted.slice(0,4)):null;
  const generation=POLO_GENERATIONS.find(entry=>year>=entry.start&&year<=entry.end);
  if(generation)return {...generation,year};
  return {uncertain:true,year,
   explanation:year===2009||year===2014||year===2017||year===2021
    ?'De datum eerste toelating valt in een overgangsjaar van de Polo. De precieze generatie is niet bevestigd.'
    :'De datum eerste toelating ontbreekt of valt buiten de gecontroleerde Polo-generaties.'};
 }
 function generationCode(context){
  const text=normalize(context);
  if(/\bpolo\s+(?:mk\s*)?(?:vi|6)\b/.test(text)||/\bpolo\s+(?:aw|ae)\b/.test(text))return 6;
  if(/\bpolo\s+(?:mk\s*)?(?:v|5)\b/.test(text)||/\bpolo\s+(?:6r|6c)\b/.test(text))return 5;
  if(/\bpolo\s+(?:mk\s*)?(?:iv|4)\b/.test(text)||/\bpolo\s+(?:9n3?|9n)\b/.test(text))return 4;
  return null;
 }
 function generationPhoto(page,make,model,plan){
  const info=page.imageinfo?.[0]||{},url=String(info.thumburl||info.url||'');
  if(!isImage(url)||!['image/jpeg','image/png','image/webp'].includes(info.mime))return null;
  const filename=String(page.title||'').replace(/^File:/i,'').replace(/\.[^.]+$/,'');
  const title=normalize(filename),full=pageContext(page);
  if(!contains(title,'polo')||isUnsuitable(full))return null;
  if(info.width&&info.height&&info.width<info.height*.77)return null;
  const familyEvidence=[
   generationCode(title),
   ...(page.categories||[]).map(cat=>generationCode(String(cat.title||'')))
  ].filter(Boolean);
  if(familyEvidence.some(family=>family!==plan.family))return null;
  const categoryMatches=(page.categories||[]).some(cat=>
   normalize(String(cat.title||'').replace(/^Category:/i,''))===normalize(plan.category));
  // No category evidence means no verified generation. Filenames alone are insufficient.
  if(!categoryMatches)return null;
  if(plan.phase==='pre'){
   const contradicts=plan.family===6?/\b202[1-9]\b|\b(?:facelift|fl)\b/:
    /\b201[4-9]\b|\b(?:facelift|fl)\b/;
   if(contradicts.test(title))return null;
  }
  let score=110;
  for(const [word,points] of goodWords)if(allWords(title,word))score+=points;
  if(/\b(?:front|frontview|frontal|frontansicht|vorne)\b/.test(title))score+=24;
  if(/\b(?:rear|back|heck|hinten)\b/.test(title))score-=20;
  if(info.width&&info.height&&info.width/info.height>1.2)score+=8;
  return {title:page.title,url,pageUrl:String(info.descriptionurl||fileUrl(page.title)),
   score,kind:'commons',generation:plan.label};
 }
 // These files were individually checked on Wikimedia Commons (category and licence).
 // A known correct gallery must still work when Wikimedia's search/category API
 // is unavailable or returns incomplete categories.
 const VERIFIED_POLO_PHOTOS=Object.freeze({
  'Volkswagen Polo VI (2021)':Object.freeze([
   {
    title:'File:2024 Volkswagen Polo Life front.jpg',
    url:'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/2024_Volkswagen_Polo_Life_front.jpg/960px-2024_Volkswagen_Polo_Life_front.jpg',
    pageUrl:'https://commons.wikimedia.org/wiki/File:2024_Volkswagen_Polo_Life_front.jpg',
    artist:'LuvsMG481',license:'CC BY-SA 4.0',score:240,kind:'curated'
   },
   {
    title:'File:Volkswagen Polo VI (2021) IMG 5730.jpg',
    url:'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c7/Volkswagen_Polo_VI_%282021%29_IMG_5730.jpg/960px-Volkswagen_Polo_VI_%282021%29_IMG_5730.jpg',
    pageUrl:'https://commons.wikimedia.org/wiki/File:Volkswagen_Polo_VI_(2021)_IMG_5730.jpg',
    artist:'Alexander Migl',license:'CC BY-SA 4.0',score:200,kind:'curated'
   },
   {
    title:'File:Volkswagen Polo VI (2021) IMG 5322.jpg',
    url:'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7d/Volkswagen_Polo_VI_%282021%29_IMG_5322.jpg/960px-Volkswagen_Polo_VI_%282021%29_IMG_5322.jpg',
    pageUrl:'https://commons.wikimedia.org/wiki/File:Volkswagen_Polo_VI_(2021)_IMG_5322.jpg',
    artist:'Alexander Migl',license:'CC BY-SA 4.0',score:190,kind:'curated'
   }
  ])
 });
 function verifiedGenerationPhotos(plan){
  return (VERIFIED_POLO_PHOTOS[plan.category]||[]).map(item=>({...item,generation:plan.label}));
 }
 const categoryUrl=category=>'https://commons.wikimedia.org/w/api.php?'+new URLSearchParams({
  action:'query',generator:'categorymembers',gcmtitle:'Category:'+category,
  gcmnamespace:'6',gcmlimit:'150',prop:'imageinfo|categories',cllimit:'max',
  iiprop:'url|mime|size',iiurlwidth:'640',format:'json',origin:'*'
 }).toString();
 async function generationSearch(make,model,plan,requestId){
  const verified=verifiedGenerationPhotos(plan);
  // Prefer the previously reviewed and correctly categorised images. No external
  // Commons API call is necessary when two verified photo alternatives exist.
  if(verified.length>=2)return verified;
  const found=new Map(verified.map(photo=>[photo.title,photo]));
  const collect=(data,fromExactCategory=false)=>{
   for(const page of Object.values(data.query?.pages||{})){
    // A direct categorymembers response itself proves membership. Wikimedia
    // can omit categories[] on these pages due to API limits or incomplete props.
    const decorated=fromExactCategory
     ?{...page,categories:[...(page.categories||[]),{title:'Category:'+plan.category}]}
     :page;
    const photo=generationPhoto(decorated,make,model,plan);
    if(photo)found.set(photo.title,photo);
   }
  };
  try{collect(await requestJSON(categoryUrl(plan.category)),true)}catch{}
  if(requestId!==sequence)return [];
  if(found.size<5){
   const names={4:'IV',5:'V',6:'VI'};
   const term='Volkswagen Polo '+names[plan.family]+(plan.phase==='facelift'?' facelift':'');
   try{collect(await requestJSON(searchUrl(term)))}catch{}
  }
  if(requestId!==sequence)return [];
  return [...found.values()].sort((a,b)=>b.score-a.score).slice(0,MAX_RESULTS);
 }
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
  current=[];position=0;lastSource='';currentGeneration='';fallbackAttempted=false;
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
  if(photo.kind==='curated'){
   p.credit.textContent='Foto: '+photo.artist+' · '+photo.license+' · bron ↗';
   return;
  }
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
   if(!currentGeneration&&!fallbackAttempted&&!dismissed.size){
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
    (currentGeneration?' · '+currentGeneration+' (indicatie op eerste toelating)':'')+
    ' · uitvoering en kleur kunnen afwijken.';
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
 async function load(make,model,firstAdmissionDate){
  reset();
  const requestId=sequence,p=state();
  const brand=String(make||'').trim(),cleanModel=stripDescriptors(model);
  if(!brand||!cleanModel)return;
  currentBrand=brand;currentModel=cleanModel;
  const plan=generationPlan(brand,cleanModel,firstAdmissionDate);
  currentGeneration=plan&&!plan.uncertain?plan.label:'';
  if(p.figure)p.figure.hidden=false;
  if(plan?.uncertain){
   if(p.placeholder){p.placeholder.hidden=false;p.placeholder.textContent='Generatie nog niet te bepalen'}
   if(p.caption)p.caption.textContent=plan.explanation+' Daarom tonen we geen mogelijk verkeerde modelfoto.';
   return;
  }
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
  const cacheKey=normalize(brand)+'|'+normalize(cleanModel)+'|'+(plan?.category||'');
  const cacheHit=cache.get(cacheKey);
  try{
   if(cacheHit&&Date.now()-cacheHit.at<(cacheHit.items.length?TTL:120000))current=cacheHit.items;
   else {
    current=plan
     ?await generationSearch(brand,cleanModel,plan,requestId)
     :await commonsSearch(brand,cleanModel,null,requestId);
    if(requestId!==sequence)return;
    if(!current.length&&!plan){fallbackAttempted=true;current=await wikipediaFallback(brand,cleanModel,requestId)}
    if(requestId!==sequence)return;
    cache.set(cacheKey,{at:Date.now(),items:current});
    if(cache.size>60)cache.delete(cache.keys().next().value);
   }
   if(requestId!==sequence)return;
   if(!current.length){
    if(p.placeholder)p.placeholder.textContent=plan?'Geen bevestigde generatiefoto beschikbaar':'Geen passende foto gevonden.';
    if(p.caption)p.caption.textContent=plan?'Er is geen foto gevonden die bij '+plan.label+' als generatie bevestigd kon worden. We tonen daarom geen ouder of nieuwer model.':'Er is geen voldoende herkenbare modelfoto gevonden. Probeer later opnieuw; er wordt geen ander merk of model getoond.';
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
