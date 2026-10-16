const {cmd}=require('./_analytics');
const crypto=require('node:crypto');
const base='https://api.mollie.com/v2/payments/';
function enabled(){return process.env.MOLLIE_TEST_ENABLED==='true'&&/^test_[A-Za-z0-9]+$/.test(process.env.MOLLIE_API_KEY||'')}
function price(){const n=Number(process.env.MOLLIE_PRO_PRICE_CENTS||495);return Number.isInteger(n)&&n>=100&&n<=10000?n:495}
async function payment(id,opts={}){if(!/^tr_[A-Za-z0-9]+$/.test(id))throw Error('Invalid payment');const r=await fetch(base+encodeURIComponent(id),{headers:{Authorization:'Bearer '+process.env.MOLLIE_API_KEY},...opts});if(!r.ok)throw Error('Mollie payment unavailable');return r.json()}
function token(){return crypto.randomBytes(24).toString('hex')}
async function record(order,data){await cmd('SET','cf:mollie:order:'+order,JSON.stringify(data),'EX',86400*30)}
async function read(order){const v=await cmd('GET','cf:mollie:order:'+order);return v?JSON.parse(v):null}
module.exports={enabled,price,payment,token,record,read};
