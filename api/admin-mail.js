const {session,configured,reply,cmd}=require('./_admin-security');
const LOG_KEY='cf:admin:mail:diagnostics';
async function recordMailEvent(status,details={}){const event={at:new Date().toISOString(),status,...details};console.info('carfacts-mail-diagnostic',JSON.stringify(event));try{await cmd('LPUSH',LOG_KEY,JSON.stringify(event));await cmd('LTRIM',LOG_KEY,0,99);await cmd('EXPIRE',LOG_KEY,86400*14)}catch{console.warn('carfacts-mail-diagnostic-store-unavailable')}}
const {ImapFlow}=require('imapflow');
const {simpleParser}=require('mailparser');
const nodemailer=require('nodemailer');
const MAX_BODY=100000;
const settings=()=>({host:process.env.IMAP_HOST,port:Number(process.env.IMAP_PORT||993),secure:true,auth:{user:process.env.MAIL_USER,pass:process.env.MAIL_PASSWORD},logger:false,connectionTimeout:12000,greetingTimeout:12000,socketTimeout:20000});
function checkOrigin(req){try{return new URL(req.headers.origin).host===req.headers.host}catch{return false}}
async function withInbox(fn){const client=new ImapFlow(settings());let stage='connect';try{await client.connect();stage='select_inbox';const lock=await client.getMailboxLock('INBOX');try{stage='read_inbox';return await fn(client)}finally{lock.release()}}catch(e){e.mailStage=stage;throw e}finally{await client.logout().catch(()=>{})}}
module.exports=async(req,res)=>{
 res.setHeader('Cache-Control','no-store');
 if(!['GET','POST'].includes(req.method))return reply(res,405,{error:'Methode niet toegestaan'});
 if(!configured())return reply(res,503,{error:'Admin niet geconfigureerd'});
 if(!await session(req))return reply(res,401,{error:'Inloggen met 2FA vereist'});
 if(req.method==='POST'&&!checkOrigin(req))return reply(res,403,{error:'Ongeldige herkomst'});
 if(['IMAP_HOST','MAIL_USER','MAIL_PASSWORD'].some(k=>!process.env[k]))return reply(res,503,{error:'Mailboxinstellingen ontbreken'});
 try{
  if(req.method==='GET'&&req.query?.action==='diagnostics'){const raw=await cmd('LRANGE',LOG_KEY,0,29);return reply(res,200,{events:(raw||[]).map(s=>{try{return JSON.parse(s)}catch{return null}}).filter(Boolean)});}
  if(req.method==='GET'){
   const uid=Number(req.query?.uid);
   if(req.query?.uid!==undefined){
    if(!Number.isSafeInteger(uid)||uid<1)return reply(res,400,{error:'Ongeldig berichtnummer'});
    const data=await withInbox(async client=>{const m=await client.fetchOne(uid,{source:true},{uid:true});if(!m)return null;const parsed=await simpleParser(m.source);return {uid,subject:parsed.subject||'(geen onderwerp)',from:parsed.from?.text||'',replyTo:parsed.replyTo?.value?.[0]?.address||parsed.from?.value?.[0]?.address||'',date:parsed.date?.toISOString()||'',text:String(parsed.text||'').slice(0,MAX_BODY),attachments:(parsed.attachments||[]).map(a=>({name:a.filename||'bijlage',size:a.size}))}});
    return data?reply(res,200,{message:data}):reply(res,404,{error:'Bericht niet gevonden'});
   }
   const messages=await withInbox(async client=>{const uids=await client.search({all:true},{uid:true});const selected=uids.slice(-30).reverse();const result=[];for(const uid of selected){const m=await client.fetchOne(uid,{envelope:true,flags:true},{uid:true});if(m)result.push({uid,subject:m.envelope?.subject||'(geen onderwerp)',from:m.envelope?.from?.[0]?.address||'',date:m.envelope?.date?.toISOString()||'',unread:!m.flags?.has('\\Seen')})}return result});
   await recordMailEvent('inbox_read_ok',{count:messages.length});return reply(res,200,{messages});
  }
  if(req.body?.action!=='reply')return reply(res,400,{error:'Onbekende actie'});
  const uid=Number(req.body.uid),body=String(req.body.text||'').trim();
  if(!Number.isSafeInteger(uid)||uid<1||!body||body.length>20000)return reply(res,400,{error:'Ongeldig bericht of antwoord'});
  const original=await withInbox(async client=>{const m=await client.fetchOne(uid,{source:true},{uid:true});return m?simpleParser(m.source):null});
  if(!original)return reply(res,404,{error:'Origineel bericht niet gevonden'});
  const to=original.replyTo?.value?.[0]?.address||original.from?.value?.[0]?.address;
  if(!to||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to))return reply(res,400,{error:'Geen geldig antwoordadres'});
  if(!process.env.SMTP_HOST)return reply(res,503,{error:'SMTP niet geconfigureerd'});
  const transport=nodemailer.createTransport({host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT||465),secure:Number(process.env.SMTP_PORT||465)===465,auth:{user:process.env.MAIL_USER,pass:process.env.MAIL_PASSWORD},connectionTimeout:12000});
  await transport.sendMail({from:process.env.MAIL_USER,to,subject:/^re:/i.test(original.subject||'')?original.subject:'Re: '+(original.subject||'(geen onderwerp)'),text:body,inReplyTo:original.messageId||undefined,references:original.messageId?[...(original.references||[]),original.messageId]:undefined});
  await recordMailEvent('reply_sent_ok');return reply(res,200,{ok:true});
 }catch(e){const code=String(e?.code||'').toUpperCase();const msg=String(e?.message||'').toLowerCase();let reason='Mailserver reageert niet zoals verwacht';if(/auth|login|credential|password|authentication|invalid credentials|authenticate/.test(msg)||['EAUTH','AUTHENTICATIONFAILED'].includes(code))reason='Aanmelding geweigerd: controleer mailboxgebruikersnaam en wachtwoord';else if(['ETIMEDOUT','ESOCKET','ECONNREFUSED','ENOTFOUND','EAI_AGAIN','ECONNRESET'].includes(code)||/timeout|connect|socket|certificate|tls/.test(msg))reason='Verbindingsprobleem met de IMAP-mailserver';else if(e?.mailStage==='connect'&&String(e?.responseStatus||'').toUpperCase()==='NO')reason='IMAP-server weigert de aanmelding. Controleer mailboxwachtwoord en IMAP-toegang bij Site.eu';else if(/mailbox|folder|inbox|select/.test(msg))reason='De map INBOX kon niet worden geopend';else if(/certificate|ssl|tls|handshake/.test(msg))reason='TLS-beveiligingsfout';await recordMailEvent('mail_error',{code:code||'UNKNOWN',type:String(e?.name||'Error').slice(0,50),reason,stage:e?.mailStage||'unknown',responseStatus:String(e?.responseStatus||'').slice(0,40),detail:String(e?.message||'').slice(0,180).replace(/(pass(word)?|token|secret)\s*[:=]\s*\S+/gi,'[redacted]')});return reply(res,502,{error:reason,code:code||'MAIL_ERROR'})}
};
