const crypto=require('node:crypto');
const a=require('./_admin-security');
const {cmd,configured,password,reply,hash,equal,seal,unseal,base32,verify,session,refresh,revokeAll,issueIndexed,secureCookie}=a;
const pendingKey=t=>'cf:admin:pending:'+hash(t);
const getIp=req=>String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0].trim();
const attemptKey=req=>'cf:admin:attempts:'+hash(getIp(req));
const generic='Onjuiste gegevens of code';
async function audit(action){try{await cmd('LPUSH','cf:admin:audit',JSON.stringify({date:new Date().toISOString(),action}));await cmd('LTRIM','cf:admin:audit',0,199);await cmd('EXPIRE','cf:admin:audit',86400*90)}catch{}}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!configured())return reply(res,503,{error:'Admin is niet geconfigureerd'});
 if(req.method!=='POST'&&req.method!=='GET')return reply(res,405,{error:'Method not allowed'});
 if(req.method==='POST'){
  const origin=req.headers.origin;
  if(!origin||new URL(origin).host!==req.headers.host)return reply(res,403,{error:'Ongeldige herkomst'});
 }
 const b=req.body||{},action=b.action||'status';
 try{
 if(req.method==='GET'||action==='status'){
  const s=await session(req);return reply(res,200,{loggedIn:!!s,configured2FA:!!(await cmd('GET','cf:admin:totp'))});
 }
 if(action==='logout'){
  const s=await session(req);if(s)await cmd('DEL','cf:session:'+s.id);
  res.setHeader('Set-Cookie',secureCookie('',0));await audit('logout');return reply(res,200,{ok:true});
 }
 if(action==='logout_all'){
  if(!await session(req))return reply(res,401,{error:'Login vereist'});
  await revokeAll();await audit('logout_all');res.setHeader('Set-Cookie',secureCookie('',0));return reply(res,200,{ok:true});
 }
 if(action==='refresh'){
  if(!await refresh(req,res))return reply(res,401,{error:'Login verlopen'});return reply(res,200,{ok:true});
 }
 const lock=attemptKey(req);
 if(Number(await cmd('GET',lock))>=8)return reply(res,429,{error:'Te veel pogingen. Probeer het over 15 minuten opnieuw'});
 if(action==='password'){
  const pass=String(b.password||'').slice(0,1024);
  if(!equal(pass,password)){await cmd('INCR',lock);await cmd('EXPIRE',lock,900);await audit('login_failed');return reply(res,401,{error:generic})}
  const token=crypto.randomBytes(32).toString('hex');await cmd('SET',pendingKey(token),'password','EX',300);
  return reply(res,200,{pending:token,needsSetup:!(await cmd('GET','cf:admin:totp'))});
 }
 const pending=String(b.pending||'');if(!/^[a-f0-9]{64}$/.test(pending)||!await cmd('GET',pendingKey(pending)))return reply(res,401,{error:'Log opnieuw in met je wachtwoord'});
 if(action==='setup'){
  if(await cmd('GET','cf:admin:totp'))return reply(res,403,{error:'2FA is al ingesteld'});
  let secret=await cmd('GET','cf:admin:setup:'+hash(pending));
  if(!secret){secret=base32(crypto.randomBytes(20));await cmd('SET','cf:admin:setup:'+hash(pending),seal(secret),'EX',300)}
  else secret=unseal(secret);
  return reply(res,200,{secret,uri:'otpauth://totp/Carfacts%20Admin:beheerder?secret='+secret+'&issuer=Carfacts%20Admin&algorithm=SHA1&digits=6&period=30'});
 }
 if(action==='confirm_setup'){
  if(await cmd('GET','cf:admin:totp'))return reply(res,403,{error:'2FA is al ingesteld'});
  const encrypted=await cmd('GET','cf:admin:setup:'+hash(pending));if(!encrypted)return reply(res,400,{error:'Start de koppeling opnieuw'});
  if(!verify(unseal(encrypted),b.code)){await cmd('INCR',lock);await cmd('EXPIRE',lock,900);return reply(res,401,{error:generic})}
  // SET NX prevents competing first-time enrollments.
  const created=await cmd('SET','cf:admin:totp',encrypted,'NX');
  if(created!=='OK')return reply(res,409,{error:'2FA is al ingesteld'});
  const codes=Array.from({length:8},()=>crypto.randomBytes(6).toString('hex').toUpperCase());
  for(const code of codes)await cmd('SADD','cf:admin:recovery',hash(code));
  await cmd('DEL',pendingKey(pending));await cmd('DEL','cf:admin:setup:'+hash(pending));await cmd('DEL',lock);
  await issueIndexed(res);await audit('2fa_enabled');return reply(res,200,{ok:true,recoveryCodes:codes});
 }
 if(action==='verify'){
  const encrypted=await cmd('GET','cf:admin:totp');if(!encrypted)return reply(res,409,{error:'Stel eerst 2FA in'});
  const code=String(b.code||'').replace(/\s|-/g,'').toUpperCase();
  let valid=verify(unseal(encrypted),code);
  if(!valid&&/^[A-F0-9]{12}$/.test(code)){const used=await cmd('SREM','cf:admin:recovery',hash(code));valid=used===1}
  if(!valid){await cmd('INCR',lock);await cmd('EXPIRE',lock,900);return reply(res,401,{error:generic})}
  await cmd('DEL',pendingKey(pending));await cmd('DEL',lock);await issueIndexed(res);await audit('login_success');return reply(res,200,{ok:true});
 }
 return reply(res,400,{error:'Onbekende actie'});
 }catch(e){return reply(res,503,{error:'Authenticatie tijdelijk niet beschikbaar'})}
};
