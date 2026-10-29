import {test,expect,type Page} from '@playwright/test';

/** Parts tests are isolated: no VWE, RDW, live eBay, or paid requests. */
async function mockParts(page:Page){
 const ebayQueries:string[]=[];
 const rdwQueries:string[]=[];
 const external:string[]=[];
 await page.route('**/*',async route=>{
  const url=new URL(route.request().url());
  if(url.hostname!=='127.0.0.1'||url.port!=='4179'){
   external.push(url.hostname);
   return route.abort('blockedbyclient');
  }
  if(url.pathname==='/api/ebay-search'){
   ebayQueries.push(url.searchParams.get('q')||'');
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
    items:[{title:'OEM '+url.searchParams.get('q')+' — onderdeel',
     url:'https://www.ebay.com/itm/123456789',price:'42.95',currency:'EUR',
     condition:'Gebruikt',seller:'Testleverancier'}],
    hasMore:false
   })});
  }
  if(url.pathname==='/api/rdw'){
   rdwQueries.push(url.searchParams.get('kenteken')||'');
   return route.fulfill({status:200,contentType:'application/json',
    body:JSON.stringify([{merk:'VOLKSWAGEN',handelsbenaming:'CADDY'}])});
  }
  if(url.pathname.startsWith('/api/')){
   return route.fulfill({status:503,contentType:'application/json',
    body:JSON.stringify({error:'Offline fixture: geen externe service'})});
  }
  return route.continue();
 });
 return {ebayQueries,rdwQueries,external};
}
async function search(page:Page,query:string,mode='part'){
 if(mode!=='part')await page.locator('.parts-search-tabs button[data-mode="'+mode+'"]').click();
 await page.locator('#modeSearch').fill(query);
 await page.locator('#partsSearchSubmit').click();
}

test('OEM/onderdeelnummer search works without plate lookups',async({page})=>{
 const m=await mockParts(page);
 await page.goto('/parts/');
 await expect(page.locator('#legacySearchFields')).toBeHidden();
 await page.locator('#scope').selectOption('NL');
 await search(page,'2G1857004N2G');
 await expect(page.locator('#resultsHeading')).toContainText('2G1857004N2G');
 await expect(page.locator('.result:not(.ebay-result)')).not.toHaveCount(0);
 await expect(page.locator('.ebay-result').first()).toContainText('2G1857004N2G');
 expect(m.rdwQueries).toHaveLength(0);
 expect(m.ebayQueries).toEqual(['2G1857004N2G']);
 expect(m.external).toEqual([]);
});

test('OEM code resembling a Dutch plate is never silently sent to RDW',async({page})=>{
 const m=await mockParts(page);
 await page.goto('/parts/');
 await page.locator('#scope').selectOption('NL');
 await search(page,'AB12CD');
 await expect(page.locator('#resultsHeading')).toContainText('AB12CD');
 expect(m.rdwQueries).toEqual([]);
 expect(m.ebayQueries).toEqual(['AB12CD']);
});

test('motorcode and versnellingsbakcode searches use the chosen code',async({page})=>{
 const m=await mockParts(page);
 await page.goto('/parts/');
 await page.locator('#scope').selectOption('NL');
 await search(page,'DFSD','engine');
 await expect(page.locator('#resultsHeading')).toContainText('DFSD');
 await search(page,'SWS','gearbox');
 await expect(page.locator('#resultsHeading')).toContainText('SWS');
 expect(m.rdwQueries).toHaveLength(0);
 expect(m.ebayQueries).toEqual(['DFSD','SWS']);
});

test('number plate search makes a lookup only in kenteken mode',async({page})=>{
 const m=await mockParts(page);
 await page.goto('/parts/');
 await page.locator('#scope').selectOption('NL');
 await search(page,'VDZ-39-P','plate');
 await expect(page.locator('#resultsHeading')).toContainText('VOLKSWAGEN CADDY');
 expect(m.rdwQueries).toEqual(['VDZ39P']);
 expect(m.ebayQueries).toEqual(['VOLKSWAGEN CADDY auto onderdelen']);
});

test('VIN mode rejects invalid codes before making network requests',async({page})=>{
 const m=await mockParts(page);
 await page.goto('/parts/');
 await search(page,'short','vin');
 await expect(page.locator('#status')).toContainText('17 tekens');
 expect(m.rdwQueries).toHaveLength(0);
 expect(m.ebayQueries).toHaveLength(0);
});

test('sort change also works in OEM mode, without a silent empty query',async({page})=>{
 const m=await mockParts(page);
 await page.goto('/parts/');
 await page.locator('#scope').selectOption('NL');
 await search(page,'04E906023AG');
 await expect(page.locator('#resultsHeading')).toContainText('04E906023AG');
 await page.locator('#sortResults').selectOption('newest');
 await expect.poll(()=>m.ebayQueries.length).toBe(2);
 expect(m.ebayQueries.every(q=>q==='04E906023AG')).toBe(true);
});

test('search and result columns never overlap at laptop widths',async({page})=>{
 await mockParts(page);
 await page.setViewportSize({width:1280,height:820});
 await page.goto('/parts/');
 const sidebar=await page.locator('.parts-sidebar').boundingBox();
 const results=await page.locator('.results-section').boundingBox();
 const input=await page.locator('#modeSearch').boundingBox();
 const action=await page.locator('#partsSearchSubmit').boundingBox();
 expect(sidebar&&results&&input&&action).toBeTruthy();
 if(!sidebar||!results||!input||!action)return;
 expect(results.x).toBeGreaterThanOrEqual(sidebar.x+sidebar.width-2);
 expect(sidebar.width).toBeGreaterThan(200);
 expect(input.width).toBeGreaterThan(170);
 expect(action.x+action.width).toBeLessThanOrEqual(sidebar.x+sidebar.width+1);
 await expect(page.locator('#legacySearchFields')).toBeHidden();
});

test('responsive parts search keeps input and submit visible on mobile',async({page})=>{
 await mockParts(page);
 await page.setViewportSize({width:390,height:844});
 await page.goto('/parts/');
 const input=await page.locator('#modeSearch').boundingBox();
 const submit=await page.locator('#partsSearchSubmit').boundingBox();
 const sidebar=await page.locator('.parts-sidebar').boundingBox();
 expect(input&&submit&&sidebar).toBeTruthy();
 if(!input||!submit||!sidebar)return;
 expect(input.width).toBeGreaterThan(180);
 expect(submit.width).toBeGreaterThan(180);
 expect(input.x+input.width).toBeLessThanOrEqual(390);
 expect(submit.x+submit.width).toBeLessThanOrEqual(390);
 await expect(page.locator('#legacySearchFields')).toBeHidden();
});
