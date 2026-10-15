const crypto=require('node:crypto');
const {cmd,configured,password,reply}=require('./_analytics');
const KEY=crypto.createHash('sha256').update(process.env.CARFACTS_ADMIN_SECRET||'').digest();
const cookieName='cf_admin_v2';
const hash=v=>crypto.createHmac('sha256',KEY).update(v).digest('hex');
const equal=(a,b)=>{const x=Buffer.from(hash(String(a))),y=Buffer.from(hash(String(b)));return crypto.timingSafeEqual(x,y)};
const secureCookie=(value,maxAge)=>cookieName+'='+value+'; Path=/api/; HttpOnly; Secure; SameSite=Strict; Max-Age='+maxAge;
function seal(value){const iv=crypto.randomBytes(12),c=crypto.createCipheriv('aes-256-gcm',KEY,iv);const enc=Buffer.concat([c.update(value,'utf8'),c.final()]);return Buffer.concat([iv,c.getAuthTag(),enc]).toString('base64url')}
function unseal(value){const b=Buffer.from(value,'base64url'),d=crypto.createDecipheriv('aes-256-gcm',KEY,b.subarray(0,12));d.setAuthTag(b.subarray(12,28));return Buffer.concat([d.update(b.subarray(28)),d.final()]).toString('utf8')}
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32(b){let bits=0,n=0,out='';for(const x of b){n=(n<<8)|x;bits+=8;while(bits>=5){out+=alphabet[(n>>>(bits-=5))&31]}}return bits?out+alphabet[(n<<(5-bits))&31]:out}
function from32(s){let n=0,bits=0,out=[];for(const c of s){const v=alphabet.indexOf(c);if(v<0)throw Error('Invalid secret');n=(n<<5)|v;bits+=5;if(bits>=8){out.push((n>>>(bits-=8))&255)}}return Buffer.from(out)}
function otp(secret,step){const b=Buffer.alloc(8);b.writeBigUInt64BE(BigInt(step));const h=crypto.createHmac('sha1',from32(secret)).update(b).digest();const offset=h[h.length-1]&15;return String((h.readUInt32BE(offset)&0x7fffffff)%1000000).padStart(6,'0')}
function verify(secret,code){if(!/^\d{6}$/.test(String(code)))return false;const now=Math.floor(Date.now()/30000);for(let i=-1;i<=1;i++)if(equal(otp(secret,now+i),code))return true;return false}
async function session(req){if(!configured())return null;const raw=(req.headers.cookie||'').match(/(?:^|; )cf_admin_v2=([^;]+)/)?.[1];if(!raw||!/^[a-f0-9]{64}$/.test(raw))return null;const id=hash(raw);const data=await cmd('GET','cf:session:'+id);if(!data)return null;const item=JSON.parse(data);if(item.absolute<Date.now())return null;return {id,item}}
async function issue(res){const token=crypto.randomBytes(32).toString('hex');const absolute=Date.now()+90*86400000;await cmd('SET','cf:session:'+hash(token),JSON.stringify({absolute,created:Date.now()}),'EX',30*86400);res.setHeader('Set-Cookie',secureCookie(token,30*86400))}
async function refresh(req,res){const s=await session(req);if(!s)return false;const max=Math.min(30*86400,Math.floor((s.item.absolute-Date.now())/1000));if(max<=0)return false;await cmd('EXPIRE','cf:session:'+s.id,max);const raw=(req.headers.cookie||'').match(/(?:^|; )cf_admin_v2=([^;]+)/)?.[1];res.setHeader('Set-Cookie',secureCookie(raw,max));return true}
async function revokeAll(){const n=await cmd('SMEMBERS','cf:session:index');if(Array.isArray(n)){for(const id of n)await cmd('DEL','cf:session:'+id)}await cmd('DEL','cf:session:index')}
async function issueIndexed(res){const token=crypto.randomBytes(32).toString('hex');const id=hash(token);const absolute=Date.now()+90*86400000;await cmd('SET','cf:session:'+id,JSON.stringify({absolute,created:Date.now()}),'EX',30*86400);await cmd('SADD','cf:session:index',id);res.setHeader('Set-Cookie',secureCookie(token,30*86400))}
module.exports={cmd,configured,password,reply,hash,equal,seal,unseal,base32,verify,session,refresh,revokeAll,issueIndexed,secureCookie};
