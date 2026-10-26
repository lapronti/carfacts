'use strict';
/**
 * Carfacts 2.0 — permissive but safe validation of VWE acceptance responses.
 * Unknown fields are preserved. Declared fields must have compatible types.
 * Raw upstream payloads are never written into diagnostic logs.
 */
const {z}=require('zod');
const label=z.union([z.string(),z.number(),z.null()]);
const named=z.object({name:label.optional(),description:label.optional(),code:label.optional()}).passthrough();
const reference=z.union([named,z.string(),z.null()]);
const fuel=z.union([named,z.string(),z.null()]);
const list=z.array(z.unknown()).max(2000);
const advanced=z.object({
 make:reference.optional(),
 model:reference.optional(),
 vehicleType:reference.optional(),
 engineCode:label.optional(),
 firstAdmissionDate:label.optional(),
 maximumMass:label.optional(),
 fuels:z.array(fuel).max(30).optional()
}).passthrough();
const emission=z.object({
 euroClass:label.optional(),
 energyLabel:label.optional(),
 gearbox:z.union([named,z.null(),z.string()]).optional(),
 noiseLevel:z.union([named,z.null()]).optional()
}).passthrough();
const history=z.union([
 list,
 z.object({
  inspections:list.optional(),repairs:list.optional(),
  data:list.optional(),results:list.optional(),items:list.optional()
 }).passthrough()
]);
const datasets=Object.freeze({advanced,emission,inspections:history,repairs:history});
const tokenSchema=z.object({
 access_token:z.string().min(1).max(8192),
 expires_in:z.union([z.number(),z.string()]).optional()
}).passthrough();

function validateToken(value){
 const parsed=tokenSchema.safeParse(value);
 return parsed.success?{ok:true,data:parsed.data}:{ok:false,code:'VWE_AUTH_TOKEN_INVALID'};
}
function validateVehicle(dataset,value){
 const schema=datasets[dataset];
 if(!schema)return {ok:false,code:'UNKNOWN_DATASET'};
 if(value===null||value===undefined)return {ok:false,code:'VWE_INVALID_RESPONSE'};
 const parsed=schema.safeParse(value);
 if(!parsed.success)return {ok:false,code:'VWE_INVALID_DATA'};
 const data=parsed.data;
 const records=Array.isArray(data)?data:
  ['inspections','repairs','data','results','items']
   .map(key=>data[key]).find(Array.isArray);
 const empty=dataset==='inspections'||dataset==='repairs'
  ?!records||records.length===0
  :Array.isArray(data)?data.length===0:Object.keys(data).length===0;
 return {ok:true,data,dataStatus:empty?'empty':'received'};
}
module.exports={validateToken,validateVehicle};
