const {configured,session,reply}=require('./_admin-security');
module.exports=async function adminMail(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='GET')return reply(res,405,{error:'Methode niet toegestaan'});
 if(!configured())return reply(res,503,{error:'Adminbeveiliging niet geconfigureerd'});
 try{
  if(!await session(req))return reply(res,401,{error:'Inloggen met 2FA vereist'});
  const required=['IMAP_HOST','IMAP_PORT','SMTP_HOST','SMTP_PORT','MAIL_USER','MAIL_PASSWORD'];
  const missing=required.filter(key=>!process.env[key]);
  if(missing.length)return reply(res,200,{ready:false,message:'Mailboxinstellingen ontbreken: '+missing.join(', ')+'. Er is nog geen IMAP/SMTP-verbinding gemaakt.'});
  return reply(res,200,{ready:false,message:'Mailboxinstellingen aanwezig. Berichten ophalen en beantwoorden is nog niet geactiveerd; IMAP/SMTP-connectiviteit moet eerst veilig worden getest.'});
 }catch{return reply(res,503,{error:'Mailboxcontrole tijdelijk niet beschikbaar'});}
};
