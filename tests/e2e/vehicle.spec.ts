import {test,expect,type Page} from '@playwright/test';

const fakePng=Buffer.from(
 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+bQaQAAAAASUVORK5CYII=',
 'base64'
);

type Scenario={
 advanced?:Record<string,unknown>;
 emission?:Record<string,unknown>;
 inspections?:unknown;
 failAdvanced?:boolean;
};
const defaultScenario:Scenario={
 advanced:{
  make:{name:'Volkswagen'},model:{name:'Caddy'},
  engineCode:'DFSD',vehicleType:{description:'Bedrijfsauto'},
  firstAdmissionDate:'2020-01-22',fuels:[{description:'Diesel'}]
 },
 emission:{euroClass:'Euro 6',energyLabel:'B'},
 inspections:{inspections:[]}
};
async function mockExternal(page:Page,config:Scenario=defaultScenario){
 const calls:string[]=[];
 await page.route('**/*',async route=>{
  const request=route.request();
  const url=new URL(request.url());
  if(url.hostname==='upload.wikimedia.org'||url.pathname.includes('/Special:Redirect/file/')){
   await route.fulfill({status:200,contentType:'image/png',body:fakePng});
   return;
  }
  if(url.hostname==='127.0.0.1'&&url.port==='4179'){
   if(url.pathname==='/api/vwe-vehicle'){
    const dataset=url.searchParams.get('dataset')||'advanced';
    calls.push(dataset);
    if(dataset==='advanced'&&config.failAdvanced){
     await route.fulfill({status:502,contentType:'application/json',
      body:JSON.stringify({error:'VWE-authenticatie mislukt',code:'VWE_AUTH_REJECTED',stage:'authentication',upstreamStatus:401})});
     return;
    }
    const vehicle=dataset==='advanced'?config.advanced:dataset==='emission'?config.emission:config.inspections;
    const empty=dataset==='inspections';
    await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
     licensePlate:'TEST123',source:'VWE acceptatie',dataset,
     vehicle:vehicle??{},dataStatus:empty?'empty':'received',
     diagnostics:{attempts:1,tokenRefreshed:false}
    })});
    return;
   }
   if(url.pathname.startsWith('/api/')){
    await route.fulfill({status:401,contentType:'application/json',
     body:JSON.stringify({error:'Offline tests: no live APIs'})});
    return;
   }
   await route.continue();
   return;
  }
  // ALL external traffic is blocked, including direct Wikimedia APIs.
  await route.abort('blockedbyclient');
 });
 return calls;
}
async function lookUp(page:Page,plate='VDZ39P'){
 await page.locator('#plate').fill(plate);
 await page.locator('#submit').click();
}

test('vehicle request uses only 3 mocked datasets and displays valid data',async({page})=>{
 const calls=await mockExternal(page);
 await page.goto('/');
 await lookUp(page);
 await expect(page.locator('#counter')).toContainText('3 / 3');
 await expect(page.locator('#stat-model')).toContainText('Volkswagen Caddy');
 await expect(page.locator('#stat-engine')).toContainText('DFSD');
 await expect(page.locator('#stat-euro')).toContainText('Euro 6');
 await expect(page.locator('#history .status')).toContainText('geen APK-registraties');
 expect(calls.sort()).toEqual(['advanced','emission','inspections']);
});

test('early 2020 Caddy shows a Caddy IV photo, not a Caddy V',async({page})=>{
 await mockExternal(page);
 await page.goto('/');
 await lookUp(page);
 await expect(page.locator('#counter')).toContainText('3 / 3');
 const photo=page.locator('#vehicle-photo-img');
 await expect(photo).toHaveAttribute('src',/2018_Volkswagen_Caddy/);
 await expect(page.locator('#vehicle-photo-caption')).toContainText('Caddy IV');
 await expect(page.locator('#vehicle-photo-credit')).toContainText('CC BY-SA');
});

test('authorization failure skips remaining datasets',async({page})=>{
 const calls=await mockExternal(page,{...defaultScenario,failAdvanced:true});
 await page.goto('/');
 await lookUp(page);
 await expect(page.locator('#message')).toContainText('overgeslagen');
 await expect(page.locator('#technical .status')).toContainText('Niet opgevraagd');
 expect(calls).toEqual(['advanced']);
});

test('repeat search within 30 seconds reuses current results',async({page})=>{
 const calls=await mockExternal(page);
 await page.goto('/');
 await lookUp(page);
 await expect(page.locator('#counter')).toContainText('3 / 3');
 await lookUp(page);
 await expect(page.locator('#message')).toContainText('30 seconden');
 expect(calls).toHaveLength(3);
});

test('ambiguous Polo transition year does not display a wrong-generation photo',async({page})=>{
 const calls=await mockExternal(page,{
  ...defaultScenario,
  advanced:{
   make:{name:'Volkswagen'},model:{name:'Polo'},
   firstAdmissionDate:'2017-05-05',vehicleType:{description:'Personenauto'}
  }
 });
 await page.goto('/');
 await lookUp(page,'AB12CD');
 await expect(page.locator('#counter')).toContainText('3 / 3');
 await expect(page.locator('#vehicle-photo-caption')).toContainText('overgangsperiode');
 await expect(page.locator('#vehicle-photo-img')).toBeHidden();
 expect(calls).toHaveLength(3);
});
