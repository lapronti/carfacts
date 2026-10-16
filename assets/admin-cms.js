(()=>{
 const $=id=>document.getElementById(id);
 const pageNames={home:'Homepage',parts:'Onderdelenzoeker',pro:'Carfacts PRO'};
 let live=null,draft=null,page='home',dirty=false;
 const status=message=>{$('cmsStatus').textContent=message};
 const clone=x=>JSON.parse(JSON.stringify(x));
 const empty=()=>({title:'',intro:'',blocks:[]});
 const uuid=()=>('block-'+(crypto.randomUUID?crypto.randomUUID():Date.now().toString(36)+'-'+Math.random().toString(36).slice(2)));
 const textField=(label,value,max,change,multi=false)=>{
  const wrapper=document.createElement('label');wrapper.className='cms-field';
  const span=document.createElement('span');span.textContent=label;
  const el=document.createElement(multi?'textarea':'input');if(!multi)el.type='text';el.maxLength=max;el.value=value||'';if(multi)el.rows=3;
  el.addEventListener('input',()=>{change(el.value);dirty=true;status('Niet-opgeslagen wijzigingen')});
  wrapper.append(span,el);return wrapper;
 };
 function render(){
  const root=$('cmsEditor');root.replaceChildren();const data=draft.pages[page]||(draft.pages[page]=empty());
  root.append(textField('Sectietitel (optioneel)',data.title,100,v=>data.title=v));
  root.append(textField('Introductie (optioneel)',data.intro,350,v=>data.intro=v,true));
  for(const block of data.blocks){
   const card=document.createElement('div');card.className='cms-edit-block';
   const head=document.createElement('div');head.className='cms-edit-head';
   const select=document.createElement('select');
   for(const [value,label]of [['info','Informatie'],['notice','Melding'],['faq','Veelgestelde vraag']])select.add(new Option(label,value));
   select.value=block.type;select.addEventListener('change',()=>{block.type=select.value;dirty=true;status('Niet-opgeslagen wijzigingen')});
   const visibility=document.createElement('label');const check=document.createElement('input');check.type='checkbox';check.checked=block.visible;check.addEventListener('change',()=>{block.visible=check.checked;dirty=true;status('Niet-opgeslagen wijzigingen')});visibility.append(check,document.createTextNode(' Zichtbaar'));
   const del=document.createElement('button');del.type='button';del.textContent='Verwijderen';del.addEventListener('click',()=>{if(!confirm('Dit informatieblok verwijderen uit het concept?'))return;data.blocks=data.blocks.filter(b=>b.id!==block.id);dirty=true;render();status('Blok verwijderd uit concept')});
   const up=document.createElement('button');up.type='button';up.textContent='↑';up.title='Omhoog';up.addEventListener('click',()=>move(block.id,-1));
   const down=document.createElement('button');down.type='button';down.textContent='↓';down.title='Omlaag';down.addEventListener('click',()=>move(block.id,1));
   head.append(select,visibility,up,down,del);card.append(head,textField('Kop',block.heading,90,v=>block.heading=v),textField('Tekst',block.body,1200,v=>block.body=v,true));root.append(card);
  }
  renderPreview();
 }
 function move(id,direction){const arr=draft.pages[page].blocks,i=arr.findIndex(b=>b.id===id),j=i+direction;if(j<0||j>=arr.length)return;[arr[i],arr[j]]=[arr[j],arr[i]];dirty=true;render();status('Volgorde aangepast')}
 function renderPreview(){
  const root=$('cmsPreview');root.replaceChildren();const d=draft.pages[page];
  if(d.title){const h=document.createElement('h3');h.textContent=d.title;root.append(h)}
  if(d.intro){const p=document.createElement('p');p.textContent=d.intro;root.append(p)}
  for(const b of d.blocks){if(!b.visible)continue;const el=document.createElement('div');el.className='cms-preview-card';const h=document.createElement('strong');h.textContent=b.heading;const p=document.createElement('p');p.textContent=b.body;el.append(h,p);root.append(el)}
  if(!root.childElementCount)root.textContent='Geen zichtbare informatieblokken op deze pagina.';
 }
 async function request(action,content){
  const body={action,expectedRevision:live.revision,content};
  const r=await fetch('/api/site-content',{method:'POST',credentials:'same-origin',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
  const j=await r.json();if(!r.ok)throw Error(j.error||'Opslaan mislukt');return j;
 }
 async function load(){
  const r=await fetch('/api/site-content?mode=admin',{credentials:'same-origin'}),j=await r.json();if(!r.ok)throw Error(j.error||'Kan beheer niet laden');
  live=j.live;draft=clone(j.draft);dirty=false;render();status('Live versie '+live.revision+' · concept geladen');
 }
 $('cmsPage').addEventListener('change',e=>{page=e.target.value;render()});
 $('cmsAdd').addEventListener('click',()=>{const blocks=draft.pages[page].blocks;if(blocks.length>=12){status('Maximaal 12 blokken per pagina');return}blocks.push({id:uuid(),type:'info',heading:'Nieuw informatieblok',body:'',visible:true});dirty=true;render();status('Nieuw blok toegevoegd aan concept')});
 $('cmsPreviewButton').addEventListener('click',()=>{renderPreview();$('cmsPreview').scrollIntoView({behavior:'smooth',block:'nearest'})});
 $('cmsSave').addEventListener('click',async()=>{try{const j=await request('save',draft);draft=j.draft;dirty=false;status('Concept opgeslagen. Nog niet gepubliceerd.')}catch(e){status(e.message)}});
 $('cmsPublish').addEventListener('click',async()=>{if(dirty){status('Sla eerst je concept op voordat je publiceert.');return}if(!confirm('Concept publiceren voor alle websitebezoekers?'))return;try{const j=await request('publish');live=j.live;draft=clone(live);render();status('Gepubliceerd als versie '+live.revision)}catch(e){status(e.message)}});
 $('cmsRollback').addEventListener('click',async()=>{if(!confirm('Vorige gepubliceerde versie herstellen?'))return;try{const j=await request('rollback');live=j.live;draft=clone(live);dirty=false;render();status('Vorige inhoud hersteld als versie '+live.revision)}catch(e){status(e.message)}});
 window.cfLoadCms=async()=>{try{await load()}catch(e){status(e.message)}};
})();