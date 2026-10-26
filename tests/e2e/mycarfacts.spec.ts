import {test,expect,type Page} from '@playwright/test';

/* Fully offline: every /api/ route is mocked and all third-party hosts blocked.
   These tests do not send email, access Redis, ask VWE or take payments. */
async function portalMock(page:Page,opts:{enabled?:boolean}={}){
 let signedIn=false;
 const vehicles:Array<Record<string,string>>=[];
 const requests:string[]=[];
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='127.0.0.1'||url.port!=='4179'){
   requests.push('BLOCKED_EXTERNAL:'+url.hostname);
   return route.abort('blockedbyclient');
  }
  if(!url.pathname.startsWith('/api/'))return route.continue();
  requests.push(url.pathname);
  const payload=route.request().method()==='POST'
   ?JSON.parse(route.request().postData()||'{}'):{};
  const response=(body:unknown,status=200)=>route.fulfill({
   status,contentType:'application/json',body:JSON.stringify(body)
  });
  if(url.pathname==='/api/mycarfacts-auth'){
   if(route.request().method()==='GET')return response({
    enabled:opts.enabled!==false,loggedIn:signedIn,
    email:signedIn?'tester@voorbeeld.nl':null,
    reason:opts.enabled===false?'Preview-e-mail is nog niet geconfigureerd':undefined
   });
   if(payload.action==='request_code')return response({ok:true,
    message:'Als het e-mailadres bereikbaar is, ontvang je een inlogcode.'});
   if(payload.action==='verify_code'){
    if(payload.code!=='123456')return response({error:'Code onjuist of verlopen'},401);
    signedIn=true;return response({ok:true,loggedIn:true,email:'tester@voorbeeld.nl'});
   }
   if(payload.action==='logout'){signedIn=false;return response({ok:true,loggedIn:false})}
  }
  if(url.pathname==='/api/mycarfacts-vehicles'){
   if(!signedIn)return response({error:'Log in'},401);
   if(route.request().method()==='GET')return response({vehicles,limit:25});
   if(payload.action==='save'){
    const plate=String(payload.plate).toUpperCase().replace(/[^A-Z0-9]/g,'');
    const existing=vehicles.find(x=>x.plate===plate);
    const entry={plate,label:payload.label,make:payload.make,model:payload.model,
     savedAt:'2026-10-26T08:00:00.000Z',updatedAt:'2026-10-26T08:00:00.000Z'};
    if(existing)Object.assign(existing,entry);else vehicles.push(entry);
    return response({ok:true,vehicle:entry});
   }
   if(payload.action==='delete'){
    const index=vehicles.findIndex(v=>v.plate===payload.plate);
    if(index>=0)vehicles.splice(index,1);
    return response({ok:true});
   }
   if(payload.action==='delete_account_data'){
    vehicles.length=0;signedIn=false;
    return response({ok:true,loggedIn:false});
   }
  }
  if(url.pathname==='/api/mycarfacts-reports'){
   if(!signedIn)return response({error:'Log in'},401);
   return response({enabled:false,purchasesEnabled:false,reports:[],
    message:'PRO nog niet beschikbaar'});
  }
  return response({error:'Offline test: outside portal API'},503);
 });
 return {requests,vehicles};
}
async function login(page:Page){
 await page.goto('/mijn-carfacts/');
 await expect(page.locator('#auth-section')).toBeVisible();
 await page.locator('#email').fill('tester@voorbeeld.nl');
 await page.locator('#request-button').click();
 await expect(page.locator('#verify-form')).toBeVisible();
 await page.locator('#login-code').fill('123456');
 await page.locator('#verify-button').click();
 await expect(page.locator('#account-section')).toBeVisible();
}

test('first-time customer can log in, save a vehicle and see empty PRO archive',async({page})=>{
 const mock=await portalMock(page);
 await login(page);
 await expect(page.locator('#signed-in-email')).toContainText('tester@voorbeeld.nl');
 await expect(page.locator('#report-count')).toHaveText('0');
 await expect(page.getByText('PRO is nog niet geactiveerd.')).toBeVisible();
 await page.locator('#vehicle-plate').fill('VDZ-39-P');
 await page.locator('#vehicle-label').fill('Mijn bestelwagen');
 await page.locator('#vehicle-make').fill('Volkswagen');
 await page.locator('#vehicle-model').fill('Caddy');
 await page.locator('#save-vehicle').click();
 await expect(page.locator('#vehicle-count')).toHaveText('1');
 await expect(page.locator('.vehicle-item')).toContainText('VDZ39P');
 await expect(page.locator('.vehicle-item')).toContainText('Mijn bestelwagen');
 expect(mock.requests.some(x=>x.includes('/api/vwe'))).toBe(false);
 expect(mock.requests.some(x=>x.startsWith('BLOCKED_EXTERNAL'))).toBe(false);
});

test('logged-in customer can remove a vehicle and log out',async({page})=>{
 await portalMock(page);
 page.on('dialog',dialog=>dialog.accept());
 await login(page);
 await page.locator('#vehicle-plate').fill('AB-12-CD');
 await page.locator('#save-vehicle').click();
 await expect(page.locator('#vehicle-count')).toHaveText('1');
 await page.locator('.vehicle-item .remove').click();
 await expect(page.locator('#vehicle-count')).toHaveText('0');
 await page.locator('#logout-button').click();
 await expect(page.locator('#auth-section')).toBeVisible();
 await expect(page.locator('#account-section')).toBeHidden();
});

test('no preview SMTP shows a disabled login instead of pretending it is active',async({page})=>{
 await portalMock(page,{enabled:false});
 await page.goto('/mijn-carfacts/');
 await expect(page.locator('#request-button')).toBeDisabled();
 await expect(page.locator('#login-message')).toContainText('Preview-e-mail is nog niet geconfigureerd');
 await expect(page.locator('#account-section')).toBeHidden();
});

test('user-provided vehicle name is printed as text, not executed as HTML',async({page})=>{
 await portalMock(page);
 await login(page);
 await page.locator('#vehicle-plate').fill('AB123C');
 await page.locator('#vehicle-label').fill('<img src=x onerror=alert(1)>');
 await page.locator('#save-vehicle').click();
 await expect(page.locator('.vehicle-info strong')).toHaveText('<img src=x onerror=alert(1)>');
 await expect(page.locator('.vehicle-item img')).toHaveCount(0);
});

test('mobile layout shows functional navigation and garage form',async({page})=>{
 await page.setViewportSize({width:390,height:844});
 await portalMock(page);
 await login(page);
 await expect(page.locator('nav[aria-label="Mijn Carfacts navigatie"]')).toBeVisible();
 await expect(page.locator('#vehicle-plate')).toBeVisible();
 await expect(page.locator('#save-vehicle')).toBeVisible();
});


test('preview demo shows clearly fictional vehicles without requiring an account or writes',async({page})=>{
 const mock=await portalMock(page,{enabled:false});
 await page.goto('/mijn-carfacts/');
 await expect(page.locator('#request-button')).toBeDisabled();
 await page.locator('#demo-button').click();
 await expect(page.locator('#account-section')).toBeVisible();
 await expect(page.locator('#signed-in-email')).toContainText('fictieve gegevens');
 await expect(page.locator('#vehicle-count')).toHaveText('2');
 await expect(page.locator('#save-vehicle')).toBeDisabled();
 await expect(page.locator('#delete-data-button')).toBeDisabled();
 await expect(page.locator('.vehicle-item .remove').first()).toBeDisabled();
 expect(mock.vehicles).toHaveLength(0);
 expect(mock.requests).not.toContain('/api/mycarfacts-vehicles');
 await page.locator('#logout-button').click();
 await expect(page.locator('#auth-section')).toBeVisible();
 await expect(page.locator('#request-button')).toBeDisabled();
});
