import test from 'node:test';
import assert from 'node:assert/strict';
import {encrypt,decrypt} from './api-probe.mjs';
import {calculatePrice,normalize} from './normalize-api.mjs';
test('encrypted envelope handles Unicode and fresh IVs',()=>{
  const secret='00112233445566778899aabbccddeeff';
  const data={goods_id:123,note:'ราคา',nested:[1,null,true]};
  const a=encrypt(data,secret),b=encrypt(data,secret);
  assert.notEqual(a,b);assert.deepEqual(decrypt(a,secret),data);
  assert.throws(()=>decrypt(a,'wrong key'));
});
test('quote follows frontend amount / exchange / premium formula',()=>{
  assert.equal(calculatePrice(500,6.26118,6.66,0.003),'471.47');
  assert.equal(calculatePrice(500,6.26118,6.66,0.008),'473.82');
  assert.throws(()=>calculatePrice(500,6,0,0));
});
test('recharge queue is not stock and custom constraints survive',()=>{
  const r=normalize([{goodsId:1,type:'Recharge',catalog:{},detail:{name:'Apple (UK)',symbol:'£',amounts:[500],cn_rate:6.26118,config_rate:6.66,channel_level:{level_2:1000,level_3:0,level_4:0,level_5:0},brand_levels:{level_2:0,level_3:0.003,level_4:0.008,level_5:0.015},is_custom:true,min_amount:10,max_amount:1000,multiple_role:5}}]);
  assert.equal(r.recharge.length,4);assert.equal(r.recharge[0].stock,null);assert.equal(r.recharge[0].queueAmount,1000);assert.equal(r.custom[0].multiple,5);assert.equal(r.errors.length,0);
});
