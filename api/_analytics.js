const crypto=require('node:crypto');
const redisUrl=process.env.KV_REST_API_URL||process.env.UPSTASH_REDIS_REST_URL;
const redisToken=process.env.KV_REST_API_TOKEN||process.env.UPSTASH_REDIS_REST_TOKEN;
const secret=process.env.CARFACTS_ADMIN_SECRET;
const password=process.env.CARFACTS_ADMIN_PASSWORD;
const configured=()=>!!(redisUrl&&redisToken&&secret&&password);
async function cmd(...args){const r=await fetch(redisUrl.replace(/\/$/,'')+'/pipeline',{method:'POST',headers:{Authorization:'Bearer '+redisToken,'Content-Type':'application/json'},body:JSON.stringify([args])});if(!r.ok)throw Error('Storage unavailable');const j=await r.json();if(j[0]?.error)throw Error('Storage failed');return j[0]?.result;}
function sign(s){return crypto.createHmac('sha256',secret).update(s).digest('hex')}
function authed(req){if(!configured())return false;const raw=(req.headers.cookie||'').match(/(?:^|; )cf_admin=([^;]+)/)?.[1];if(!raw)return false;const [exp,mac]=decodeURIComponent(raw).split('.');if(!/^\d{10,13}$/.test(exp)||Number(exp)<Date.now())return false;const expected=sign(exp);return mac?.length===expected.length&&crypto.timingSafeEqual(Buffer.from(mac),Buffer.from(expected))}
function cookie(){const exp=String(Date.now()+8*60*60*1000);return 'cf_admin='+exp+'.'+sign(exp)+'; HttpOnly; Secure; SameSite=Strict; Path=/api/admin; Max-Age=28800'}
function reply(res,status,data){res.setHeader('Cache-Control','no-store');return res.status(status).json(data)}
module.exports={cmd,configured,authed,cookie,reply,password};
