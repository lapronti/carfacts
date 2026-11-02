import {test,expect,type Page} from '@playwright/test';

async function mockSources(page:Page){
 const calls:string[]=[];
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='127.0.0.1'||url.port!=='4179')return route.abort('blockedbyclient');
  if(url.pathname==='/api/ebay-search'){
   const q=url.searchParams.get('q')||'';
   calls.push(q);
   return route.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify({items:[{
     title:'VW origineel onderdeel '+q,
     url:'https://www.ebay.de/itm/example',
     image:'',price:'34.95',currency:'EUR',
     condition:'Used',seller:'tester',
     uploadedAt:'2026-10-01T10:00:00Z'
    }],total:1,page:0,hasMore:false})});
  }
  if(url.pathname.startsWith('/api/')){
   return route.fulfill({status:503,contentType:'application/json',
    body:JSON.stringify({error:'Offline API mock: external services disabled'})});
  }
  return route.continue();
 });
 return calls;
}
test('OEM lookup uses part number, not a guessed number plate, and renders results',async({page})=>{
 const calls=await mockSources(page);
 await page.setViewportSize({width:1440,height:900});
 await page.goto('/parts/');
 const input=page.locator('#modeSearch');
 await expect(input).toBeVisible();
 const box=await input.boundingBox();
 expect(box?.width||0).toBeGreaterThan(235);
 await input.fill('2G1857004N2G');
 await page.locator('#partsSearchSubmit').click();
 await expect(page.locator('#resultsHeading')).toContainText('2G1857004N2G');
 await expect(page.locator('#results .ebay-result').first()).toContainText('2G1857004N2G');
 expect(calls.length).toBeGreaterThan(0);
 expect(calls.every(x=>x==='2G1857004N2G')).toBe(true);
 await expect(page.locator('#vehicleLookupStatus')).not.toContainText('RDW');
});
test('part lookup opens useful external supplier links even if eBay is unavailable',async({page})=>{
 const calls=await mockSources(page);
 await page.goto('/parts/');
 await page.locator('#modeSearch').fill('2G1857004N2G');
 await page.locator('#partsSearchSubmit').click();
 const link=page.locator('.result:not(.ebay-result) a.link-btn').first();
 await expect(link).toBeVisible();
 await expect(link).toHaveAttribute('href',/2G1857004N2G/i);
 expect(calls.length).toBeGreaterThan(0);
});
test('form remains usable on small desktop and phone without clipped controls',async({page})=>{
 await mockSources(page);
 for(const width of [1024,768,390]){
  await page.setViewportSize({width,height:820});
  await page.goto('/parts/');
  const sidebar=page.locator('.parts-sidebar');
  const input=page.locator('#modeSearch');
  const submit=page.locator('#partsSearchSubmit');
  const s=await sidebar.boundingBox(),i=await input.boundingBox(),b=await submit.boundingBox();
  expect(s?.width||0).toBeGreaterThan(240);
  expect(i?.width||0).toBeGreaterThan(210);
  expect(b?.width||0).toBeGreaterThan(210);
  expect(i!.x).toBeGreaterThanOrEqual(s!.x-1);
  expect(i!.x+i!.width).toBeLessThanOrEqual(s!.x+s!.width+2);
  await expect(page.locator('#legacySearchFields')).toBeHidden();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+2)).toBe(true);
 }
});
test('switching between engine and OEM modes updates label and query without stale fields',async({page})=>{
 const calls=await mockSources(page);
 await page.goto('/parts/');
 await page.locator('[data-mode="engine"]').click();
 await expect(page.locator('label[for="modeSearch"]')).toContainText('motorcode');
 await page.locator('#modeSearch').fill('DFSD');
 await page.locator('#partsSearchSubmit').click();
 await expect(page.locator('#resultsHeading')).toContainText('DFSD');
 await page.locator('[data-mode="part"]').click();
 await expect(page.locator('label[for="modeSearch"]')).toContainText('onderdeelnummer');
 await page.locator('#modeSearch').fill('04E906023AG');
 await page.locator('#partsSearchSubmit').click();
 await expect(page.locator('#resultsHeading')).toContainText('04E906023AG');
 expect(calls.some(x=>x==='04E906023AG')).toBe(true);
});
