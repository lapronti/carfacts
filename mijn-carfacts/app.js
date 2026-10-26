/* Mijn Carfacts 2.0 — no tokens, emails or vehicle records in localStorage.
   Cookies are HttpOnly + Secure and scoped to the customer API, not Admin.
   This page performs no VWE or paid product requests. */
(()=>{
 'use strict';
 const $=id=>document.getElementById(id);
 const ui={
  global:$('global-message'),auth:$('auth-section'),account:$('account-section'),
  request:$('request-form'),verify:$('verify-form'),loginMessage:$('login-message'),
  code:$('login-code'),email:$('email'),signedInEmail:$('signed-in-email'),
  count:$('vehicle-count'),reportCount:$('report-count'),limit:$('limit-info'),
  garageMessage:$('garage-message'),vehicleForm:$('vehicle-form'),
  list:$('vehicles-list'),reports:$('reports-list')
 };
 let pendingEmail='',signedIn=false;
 function message(node,text,error=false){
  if(!node)return;
  node.textContent=text;
  node.classList.toggle('error',error);
  node.classList.toggle('success',!error&&node!==ui.global&&!!text);
 }
 async function api(path,body){
  const options={method:body?'POST':'GET',credentials:'same-origin',
   headers:{Accept:'application/json'},cache:'no-store'};
  if(body){
   options.headers['Content-Type']='application/json';
   options.body=JSON.stringify(body);
  }
  const response=await fetch('/api/mycarfacts-'+path,options);
  const json=await response.json().catch(()=>({}));
  if(!response.ok)throw new Error(json.error||'Verzoek mislukt ('+response.status+')');
  return json;
 }
 function busy(button,on){
  if(button)button.disabled=!!on;
 }
 function displayAccount(email){
  signedIn=true;
  ui.auth.hidden=true;
  ui.account.hidden=false;
  ui.signedInEmail.textContent=email||'Ingelogd';
  message(ui.global,'Je account is veilig geopend. Alleen jouw opgeslagen gegevens zijn zichtbaar.');
 }
 function displayLogin(available,reason=''){
  signedIn=false;
  ui.auth.hidden=false;
  ui.account.hidden=true;
  ui.request.hidden=false;
  ui.verify.hidden=true;
  ui.code.value='';
  pendingEmail='';
  const submit=$('request-button');
  submit.disabled=!available;
  if(!available){
   message(ui.loginMessage,reason||'E-mailinloggen is nog niet ingeschakeld in deze testomgeving.',true);
   message(ui.global,'De interface is beschikbaar, maar aanmelden is nog niet geconfigureerd.',true);
  }else{
   message(ui.global,'Gebruik je e-mailadres om eenmalig veilig in te loggen.');
   message(ui.loginMessage,'');
  }
 }
 function makeElement(tag,className,text){
  const el=document.createElement(tag);
  if(className)el.className=className;
  if(text!==undefined)el.textContent=String(text);
  return el;
 }
 function dateLabel(value){
  const dt=new Date(value||'');
  return Number.isNaN(dt.valueOf())?'Onbekend':new Intl.DateTimeFormat('nl-NL',{day:'numeric',month:'short',year:'numeric'}).format(dt);
 }
 function showVehicles(vehicles,limit=25){
  const list=Array.isArray(vehicles)?vehicles:[];
  ui.count.textContent=String(list.length);
  ui.limit.textContent=list.length+' / '+limit;
  ui.list.replaceChildren();
  if(!list.length){
   ui.list.append(makeElement('p','empty','Nog geen voertuigen bewaard. Voeg je eerste kenteken hierboven toe.'));
   return;
  }
  for(const vehicle of list){
   const row=makeElement('article','vehicle-item');
   row.append(makeElement('span','plate-tag',vehicle.plate));
   const details=makeElement('div','vehicle-info');
   const title=[vehicle.make||'',vehicle.model||''].filter(Boolean).join(' ');
   details.append(makeElement('strong','',vehicle.label||title||'Bewaard voertuig'));
   details.append(makeElement('small','',[
    vehicle.label&&title?title:'', 'Bewaard op '+dateLabel(vehicle.savedAt)
   ].filter(Boolean).join(' · ')));
   row.append(details);
   const button=makeElement('button','remove','Verwijderen');
   button.type='button';
   button.setAttribute('aria-label','Verwijder '+vehicle.plate);
   button.addEventListener('click',async()=>{
    if(!window.confirm('Wil je kenteken '+vehicle.plate+' uit Mijn Carfacts verwijderen?'))return;
    busy(button,true);
    try{
     await api('vehicles',{action:'delete',plate:vehicle.plate});
     message(ui.garageMessage,'Het voertuig is verwijderd.');
     await loadVehicles();
    }catch(e){
     message(ui.garageMessage,e.message,true);
    }finally{busy(button,false)}
   });
   row.append(button);
   ui.list.append(row);
  }
 }
 async function loadVehicles(){
  const data=await api('vehicles');
  showVehicles(data.vehicles,data.limit);
 }
 async function loadReports(){
  const data=await api('reports');
  const list=Array.isArray(data.reports)?data.reports:[];
  ui.reportCount.textContent=String(list.length);
  if(!list.length)return;
  ui.reports.replaceChildren();
  for(const item of list){
   const row=makeElement('article','report-feature');
   row.append(makeElement('span','report-icon','▤'));
   const texts=makeElement('div','');
   texts.append(makeElement('strong','',item.title));
   texts.append(makeElement('span','',dateLabel(item.createdAt)));
   row.append(texts);
   row.append(makeElement('span','report-flag',item.status||'In voorbereiding'));
   ui.reports.append(row);
  }
 }
 async function loadAccount(){
  const results=await Promise.allSettled([loadVehicles(),loadReports()]);
  if(results[0].status==='rejected')message(ui.garageMessage,results[0].reason?.message||'Voertuigen ophalen mislukt',true);
  if(results[1].status==='rejected')message(ui.global,'Je account is geopend, maar het rapportoverzicht is tijdelijk niet beschikbaar.',true);
 }
 ui.request.addEventListener('submit',async event=>{
  event.preventDefault();
  const email=ui.email.value.trim().toLowerCase();
  const button=$('request-button');
  busy(button,true);
  message(ui.loginMessage,'Een inlogcode aanvragen…');
  try{
   const data=await api('auth',{action:'request_code',email});
   pendingEmail=email;
   ui.request.hidden=true;
   ui.verify.hidden=false;
   message(ui.loginMessage,data.message||'Controleer je e-mail.');
   ui.code.focus();
  }catch(e){message(ui.loginMessage,e.message,true)}
  finally{busy(button,false)}
 });
 ui.verify.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!pendingEmail){message(ui.loginMessage,'Vraag eerst een nieuwe code aan.',true);return}
  const button=$('verify-button');
  busy(button,true);
  try{
   const data=await api('auth',{action:'verify_code',email:pendingEmail,code:ui.code.value.trim()});
   if(!data.loggedIn)throw new Error('Inloggen is niet bevestigd');
   ui.code.value='';
   displayAccount(data.email);
   await loadAccount();
  }catch(e){message(ui.loginMessage,e.message,true)}
  finally{busy(button,false)}
 });
 $('back-to-email').addEventListener('click',()=>{
  ui.verify.hidden=true;ui.request.hidden=false;
  ui.code.value='';pendingEmail='';
  message(ui.loginMessage,'Vul je e-mailadres in om een nieuwe code te ontvangen.');
 });
 $('logout-button').addEventListener('click',async()=>{
  const button=$('logout-button');busy(button,true);
  try{
   await api('auth',{action:'logout'});
   displayLogin(true);
  }catch(e){message(ui.global,e.message,true)}
  finally{busy(button,false)}
 });
 ui.vehicleForm.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!signedIn)return;
  const button=$('save-vehicle');busy(button,true);
  const payload={
   action:'save',
   plate:$('vehicle-plate').value,
   label:$('vehicle-label').value,
   make:$('vehicle-make').value,
   model:$('vehicle-model').value
  };
  try{
   await api('vehicles',payload);
   ui.vehicleForm.reset();
   await loadVehicles();
   message(ui.garageMessage,'Kenteken opgeslagen in jouw account.');
  }catch(e){message(ui.garageMessage,e.message,true)}
  finally{busy(button,false)}
 });
 $('delete-data-button').addEventListener('click',async()=>{
  if(!window.confirm('Weet je zeker dat je alle bewaarde voertuigen en rapportgegevens wilt wissen en uitloggen? Dit kan niet ongedaan worden gemaakt.'))return;
  const button=$('delete-data-button');busy(button,true);
  try{
   await api('vehicles',{action:'delete_account_data'});
   displayLogin(true);
   message(ui.global,'Alle bewaarde accountgegevens zijn verwijderd en je bent afgemeld.');
  }catch(e){message(ui.global,e.message,true)}
  finally{busy(button,false)}
 });
 (async()=>{
  try{
   const data=await api('auth');
   if(data.loggedIn){
    displayAccount(data.email);
    await loadAccount();
   }else displayLogin(!!data.enabled,data.reason);
  }catch{
   displayLogin(false,'Accountstatus is niet bereikbaar. Probeer later opnieuw.');
  }
 })();
})();
