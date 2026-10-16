(async()=>{
 const page=location.pathname.startsWith('/parts')?'parts':location.pathname.startsWith('/pro')?'pro':'home';
 try{
  const response=await fetch('/api/site-content',{credentials:'same-origin'});
  if(!response.ok)return;
  const data=await response.json(),content=data.pages?.[page];
  if(!content)return;
  const main=document.querySelector('main')||document.querySelector('.container')||document.body;
  const section=document.createElement('section');
  section.className='cf-cms-content';
  section.setAttribute('aria-label','Aanvullende informatie');
  if(content.title){const h=document.createElement('h2');h.textContent=content.title;section.append(h)}
  if(content.intro){const p=document.createElement('p');p.className='cf-cms-intro';p.textContent=content.intro;section.append(p)}
  for(const block of content.blocks||[]){
   if(!block.visible)continue;
   const article=document.createElement('article');article.className='cf-cms-block cf-cms-'+block.type;
   const h=document.createElement('h3');h.textContent=block.heading;
   const p=document.createElement('p');p.textContent=block.body;
   article.append(h,p);section.append(article);
  }
  if(section.childElementCount)main.append(section);
 }catch{/* website remains available if CMS is unavailable */}
})();