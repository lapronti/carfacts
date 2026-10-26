'use strict';
const {test}=require('node:test');
const assert=require('node:assert/strict');
const {validateToken,validateVehicle}=require('../../api/_vwe-validation');

test('OAuth token must be a nonempty string',()=>{
 assert.equal(validateToken({access_token:'synthetic-token',expires_in:3600}).ok,true);
 assert.equal(validateToken({access_token:''}).code,'VWE_AUTH_TOKEN_INVALID');
 assert.equal(validateToken({access_token:{secret:'DO NOT LEAK'}}).code,'VWE_AUTH_TOKEN_INVALID');
 assert.equal(validateToken({}).ok,false);
});

test('representative VWE vehicle preserves future unknown fields',()=>{
 const source={make:{name:'Volkswagen'},model:{name:'Caddy'},engineCode:'DFSD',firstAdmissionDate:'2020-01-22',newOptionalField:{future:true}};
 const v=validateVehicle('advanced',source);
 assert.equal(v.ok,true);
 assert.equal(v.dataStatus,'received');
 assert.deepEqual(v.data.newOptionalField,{future:true});
});

test('malformed known fields fail before reaching browser rendering',()=>{
 assert.equal(validateVehicle('advanced',{make:[{name:'Volkswagen'}]}).code,'VWE_INVALID_DATA');
 assert.equal(validateVehicle('advanced',{fuels:'Diesel'}).code,'VWE_INVALID_DATA');
 assert.equal(validateVehicle('emission',{euroClass:{html:'bad'}}).code,'VWE_INVALID_DATA');
 assert.equal(validateVehicle('advanced',null).code,'VWE_INVALID_RESPONSE');
 assert.equal(validateVehicle('advanced','<html>bad gateway</html>').code,'VWE_INVALID_DATA');
});

test('empty datasets remain separate from transport errors',()=>{
 assert.equal(validateVehicle('inspections',{inspections:[]}).dataStatus,'empty');
 assert.equal(validateVehicle('inspections',[]).dataStatus,'empty');
 assert.equal(validateVehicle('inspections',{inspections:[{inspectionDate:'2025-01-01'}]}).dataStatus,'received');
 assert.equal(validateVehicle('emission',{}).dataStatus,'empty');
 assert.equal(validateVehicle('repairs',{repairs:[]}).dataStatus,'empty');
});

test('invalid top-level response and excessive history are rejected',()=>{
 assert.equal(validateVehicle('inspections',true).code,'VWE_INVALID_DATA');
 assert.equal(validateVehicle('unknown',{}).code,'UNKNOWN_DATASET');
 assert.equal(validateVehicle('repairs',Array(2001).fill(null)).code,'VWE_INVALID_DATA');
});
