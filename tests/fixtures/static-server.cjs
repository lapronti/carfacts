'use strict';
/** Offline-only server. Every /api/* endpoint is disabled by design. */
const http=require('node:http');
const fs=require('node:fs/promises');
const path=require('node:path');
const ROOT=path.resolve(__dirname,'../..');
const PORT=Number(process.env.CARFACTS_E2E_PORT||4179);
const mimetypes={
 '.html':'text/html; charset=utf-8',
 '.css':'text/css; charset=utf-8',
 '.js':'text/javascript; charset=utf-8',
 '.json':'application/json; charset=utf-8',
 '.svg':'image/svg+xml',
 '.png':'image/png',
 '.ico':'image/x-icon'
};
http.createServer(async(req,res)=>{
 const url=new URL(req.url||'/', 'http://127.0.0.1');
 const pathname=decodeURIComponent(url.pathname);
 if(pathname.startsWith('/api/')){
  res.writeHead(503,{'content-type':'application/json','cache-control':'no-store'});
  res.end(JSON.stringify({error:'Testmodus: alle echte API-verzoeken geblokkeerd'}));
  return;
 }
 if(/(^|\/)(\.|node_modules|tests|src)(\/|$)/.test(pathname)){
  res.writeHead(404);res.end('Not found');return;
 }
 const file=path.resolve(ROOT,'.'+(pathname.endsWith('/')?pathname+'index.html':pathname));
 if(!file.startsWith(ROOT+path.sep)){
  res.writeHead(403);res.end('Forbidden');return;
 }
 try{
  const data=await fs.readFile(file);
  res.writeHead(200,{'content-type':mimetypes[path.extname(file)]||'application/octet-stream',
   'cache-control':'no-store','x-content-type-options':'nosniff'});
  res.end(data);
 }catch{
  res.writeHead(404);res.end('Not found');
 }
}).listen(PORT,'127.0.0.1',()=>console.log('Carfacts offline E2E server on 127.0.0.1:'+PORT));
