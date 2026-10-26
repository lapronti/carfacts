'use strict';
const crypto=require('node:crypto');
const portal=require('./_mycarfacts');
const {
 PREFIX,OTP_SECONDS,emailSchema,codeSchema,userKey,digest,
 storageReady,portalReady,allowedEmail,missingSettings,validOrigin,rateLimit,sendCode,session,
 issueSession,revoke,reply,onlyPreview,publicSession,cmd
}=portal;
const genericMessage='Als het e-mailadres bereikbaar is, ontvang je een inlogcode.';
const attemptSource=req=>{
 const origin=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown');
 return origin.split(',')[0].trim().slice(0,100);
};
const otpKey=email=>PREFIX+':otp:'+userKey(email);
const otpHash=(email,code)=>digest('otp',email+'|'+code);
module.exports=async(req,res)=>{
 if(!onlyPreview(req,res))return;
 res.setHeader('Cache-Control','no-store');
 if(req.method==='GET'){
  if(!storageReady())return reply(res,200,{
   enabled:false,loggedIn:false,reason:'Beveiligde klantenopslag is nog niet geconfigureerd.'
  });
  try{
   const account=await session(req);
   return reply(res,200,{
    enabled:portalReady(),
    ...publicSession(account),
    ...(!portalReady()?{
     reason:missingSettings().some(name=>name.startsWith('SMTP_')||name.startsWith('MAIL_'))
      ?'De aparte e-mailinstellingen ontbreken nog in Vercel Preview. Bekijk alvast de voorbeeldmodus.'
      :'Het testaccount is nog niet volledig geconfigureerd. Bekijk voorlopig de voorbeeldmodus.'
    }:{})
   });
  }catch{return reply(res,503,{error:'Accountstatus tijdelijk niet beschikbaar'})}
 }
 if(req.method!=='POST')return reply(res,405,{error:'Methode niet toegestaan'});
 if(!validOrigin(req))return reply(res,403,{error:'Ongeldige herkomst'});
 if(!storageReady())return reply(res,503,{error:'Klantenportaal nog niet geconfigureerd'});
 const action=String(req.body?.action||'');
 if(action==='logout'){
  try{await revoke(req,res);return reply(res,200,{ok:true,loggedIn:false})}
  catch{return reply(res,503,{error:'Afmelden is tijdelijk niet beschikbaar'})}
 }
 if(!['request_code','verify_code'].includes(action))
  return reply(res,400,{error:'Onbekende actie'});
 const parsed=emailSchema.safeParse(req.body?.email);
 if(!parsed.success)return reply(res,400,{error:'Vul een geldig e-mailadres in'});
 const email=parsed.data;
 try{
  if(!portalReady())return reply(res,503,{error:'E-mailinloggen is nog niet geconfigureerd'});
  // Preview-only allowlist. Do not expose whether an address is approved.
  if(!allowedEmail(email))return action==='request_code'
   ?reply(res,200,{ok:true,message:genericMessage,validMinutes:10})
   :reply(res,401,{error:'Code onjuist of verlopen'});
  if(action==='request_code'){
   if(!await rateLimit('otp-email',email,4,3600)
     ||!await rateLimit('otp-ip',attemptSource(req),20,3600))
    return reply(res,429,{error:'Er zijn te veel inlogpogingen. Probeer het later opnieuw.'});
   const code=String(crypto.randomInt(0,1000000)).padStart(6,'0');
   await cmd('SET',otpKey(email),otpHash(email,code),'EX',OTP_SECONDS);
   try{await sendCode(email,code)}
   catch{
    await cmd('DEL',otpKey(email)).catch(()=>{});
    return reply(res,503,{error:'Inlogcode verzenden lukt momenteel niet'});
   }
   return reply(res,200,{ok:true,message:genericMessage,validMinutes:10});
  }
  const validCode=codeSchema.safeParse(String(req.body?.code||'').trim());
  if(!validCode.success)return reply(res,400,{error:'Vul de zescijferige code in'});
  if(!await rateLimit('otp-verify-email',email,6,OTP_SECONDS)
    ||!await rateLimit('otp-verify-ip',attemptSource(req),40,OTP_SECONDS))
   return reply(res,429,{error:'Te veel verificatiepogingen. Vraag later een nieuwe code aan.'});
  const expected=String(await cmd('GET',otpKey(email))||'');
  const actual=otpHash(email,validCode.data);
  if(expected.length!==actual.length||
      !crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(actual)))
   return reply(res,401,{error:'Code onjuist of verlopen'});
  // Atomic consume: two simultaneous confirmations can never use one OTP twice.
  const claimed=await cmd('GETDEL',otpKey(email));
  if(claimed!==expected)return reply(res,401,{error:'Code onjuist of al gebruikt'});
  await issueSession(res,email);
  return reply(res,200,{ok:true,loggedIn:true,email});
 }catch{
  return reply(res,503,{error:'Inloggen tijdelijk niet beschikbaar'});
 }
};
