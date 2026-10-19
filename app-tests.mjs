import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {PromosClient,ApiError} from './app/api-client.mjs';
import {saveVault,loadVault} from './app/vault.mjs';
import {validateSettings,resolveUsdtRate} from './app/model.mjs';
const session={token:'test',secret:'test',encryptionToken:'test'};
test('restored session is reused and expiration triggers one login',async()=>{
 const c=new PromosClient({session:{...session}});let logins=0,calls=0;c.login=async()=>{logins++;};c.raw=async()=>{calls++;if(calls===1)throw new ApiError('expired',401);return {code:200};};
 assert.equal((await c.get('index/list')).code,200);assert.equal(logins,1);assert.equal(calls,2);
 c.raw=async()=>{throw new ApiError('expired',401);};await assert.rejects(c.get('index/list'));assert.equal(logins,2);
});
test('network retries are bounded; rate limiting never loops or logs in',async()=>{
 const c=new PromosClient({session:{...session},delay:async()=>{}});let calls=0;c.raw=async()=>{calls++;throw new ApiError('server',503);};await assert.rejects(c.get('index/list'));assert.equal(calls,3);
 calls=0;c.raw=async()=>{calls++;throw new ApiError('limited',429);};await assert.rejects(c.get('index/list'));assert.equal(calls,1);
});
test('settings reject aggressive polling and invalid money; ambiguous USDT is unknown',()=>{
 assert.throws(()=>validateSettings({fx:34,markup:1,fee:0,interval:1}));assert.throws(()=>validateSettings({fx:-1,markup:1,fee:0,interval:5}));
 assert.equal(resolveUsdtRate({data:[{currency:'USDT',price:1},{currency:'USDT',price:2}]}),null);
 assert.equal(resolveUsdtRate({data:[{currency:'USDT',price:1}]}),1);
});
test('Windows vault roundtrips without plaintext storage',{skip:process.platform!=='win32'},async()=>{
 const dir=await mkdtemp(path.join(os.tmpdir(),'promo-vault-test-'));try{const f=path.join(dir,'account');const data={session:{token:'secret-test-token'},credentials:{password:'test-password'}};await saveVault(f,data);assert.deepEqual(await loadVault(f),data);assert.ok(!(await readFile(f,'utf8')).includes('secret-test-token'));}finally{await rm(dir,{recursive:true,force:true});}
});

test('sale pricing applies acquisition allowance once and divides by account balance',async()=>{
 const {runInNewContext}=await import('node:vm');
 const source=await readFile(new URL('./app/public/app.js',import.meta.url),'utf8');
 const functions=source.slice(source.indexOf('function money('),source.indexOf('function currency('));
 const context={state:{settings:{fx:33.5,purchaseFee:0.251,markup:2,fee:0},snapshot:{usdPerUsdt:1}}};
 runInNewContext(functions,context);
 for(const denomination of [501,506]){
  const row={paymentUsd:400,denomination,stock:87};
  assert.ok(Math.abs(context.sell(row)/denomination-(400*33.584085/denomination*1.02))<1e-10);
 }
 context.state.settings.markup=0;assert.ok(Math.abs(context.sell({paymentUsd:400})-13433.634)<1e-8);
 context.state.snapshot.usdPerUsdt=null;assert.equal(context.sell({paymentUsd:400}),null);
 assert.equal(validateSettings({fx:33.5,fee:0,interval:0}).markup,2);
 assert.equal(validateSettings({fx:33.5,fee:0,interval:0}).purchaseFee,0.251);
 assert.throws(()=>validateSettings({fx:33.5,fee:0,interval:0,purchaseFee:-1}));
});

test('Bitkub uses buy-side ask and expires stale quotes after failed refresh',async()=>{
 const {BitkubRate,parseAsk}=await import('./app/bitkub.mjs');
 assert.equal(parseAsk([{symbol:'USDT_THB',last:'30',lowest_ask:'33.53'}]),33.53);
 for(const data of [[],[{symbol:'BTC_THB',lowest_ask:33}],[{symbol:'USDT_THB',lowest_ask:0}]])assert.throws(()=>parseAsk(data));
 let now=1000,fail=false;const rate=new BitkubRate(async()=>{if(fail)throw new Error('offline');return {ok:true,json:async()=>[{symbol:'USDT_THB',lowest_ask:33.53}]};},()=>now);
 await rate.refresh();assert.equal(rate.state().usable,true);fail=true;await rate.refresh();assert.ok(rate.state().error);now+=90001;assert.equal(rate.state().usable,false);fail=false;await rate.refresh();assert.equal(rate.state().usable,true);
});

test('country markup applies to every denomination and ignores legacy per-item overrides',async()=>{
 const {runInNewContext}=await import('node:vm');const source=await readFile(new URL('./app/public/app.js',import.meta.url),'utf8');
 const settings=validateSettings({fx:33.5,markup:2,fee:0,interval:0,countryMarkups:{US:3,MX:0},productMarkups:{123:0}});
 assert.deepEqual(validateSettings(JSON.parse(JSON.stringify(settings))),settings);
 const context={state:{settings}};runInNewContext(source.slice(source.indexOf('function markupFor('),source.indexOf('function sell(')),context);
 assert.equal(context.markupFor({country:'UK',goodsId:456}),2);assert.equal(context.markupFor({country:'US',goodsId:456}),3);assert.equal(context.markupFor({country:'US',goodsId:123}),3);for(const denomination of [9900,10000,10100])assert.equal(context.markupFor({country:'MX',goodsId:denomination,denomination}),0);
 assert.throws(()=>validateSettings({...settings,countryMarkups:{US:-1}}));
});

test('category-country markups keep Xbox and Razer independent of iTunes',async()=>{
 const {runInNewContext}=await import('node:vm');const source=await readFile(new URL('./app/public/app.js',import.meta.url),'utf8');const settings=validateSettings({fx:33,fee:0,interval:0,countryMarkups:{US:3},categoryCountryMarkups:{'xbox:US':5,'razer:US':0}});const context={state:{settings}};runInNewContext(source.slice(source.indexOf('function markupFor('),source.indexOf('function sell(')),context);assert.equal(context.markupFor({category:'xbox',country:'US'}),5);assert.equal(context.markupFor({category:'razer',country:'US'}),0);assert.equal(context.markupFor({category:'itunes',country:'US'}),3);assert.equal(context.markupFor({category:'xbox',country:'CA'}),2);
 const {normalize}=await import('./normalize-api.mjs');for(const brandId of [4,5]){const n=normalize([{goodsId:81,brandId,type:'Recharge',detail:{name:'Test (USA)',symbol:'$',amounts:[200],cn_rate:5,config_rate:6,is_custom:true,min_amount:10,max_amount:1000,brand_levels:{level_2:0,level_3:0.003,level_4:0.008,level_5:0.015}}}]);assert.equal(n.errors.length,0);assert.equal(n.recharge[0].country,'US');assert.equal(n.recharge[0].category,brandId===4?'razer':'xbox');assert.equal(n.accounts.length,0);assert.equal(n.custom[0].category,n.recharge[0].category);}
});
test('iTunes age overrides apply to Whole and Split, preserve zero, and leave recharge unchanged',async()=>{
 const {runInNewContext}=await import('node:vm');const source=await readFile(new URL('./app/public/app.js',import.meta.url),'utf8');
 const settings=validateSettings({fx:30,markup:2,fee:0,interval:0,categoryCountryMarkups:{'itunes:US':4},itunesAgeMarkups:{'US:1+':1,'US:5+':0,'US:9+':9}});
 const context={state:{settings,snapshot:{usdPerUsdt:1}}};runInNewContext(source.slice(source.indexOf('function money('),source.indexOf('function currency(')),context);
 for(const type of ['Whole','Split'])for(const [age,percent] of [['1-5',1],['5-9',0],['9+',9]]){
  const row={category:'itunes',country:'US',type,age,paymentUsd:100,denomination:500};assert.equal(context.markupFor(row),percent);assert.ok(Math.abs(context.sell(row)-100*30*1.00251*(1+percent/100))<1e-8);
 }
 assert.equal(context.markupFor({country:'US',category:'itunes',type:'Recharge',age:'9+'}),4);
 assert.equal(context.markupFor({country:'US',category:'xbox',type:'Recharge',age:'9+'}),2);
 delete settings.itunesAgeMarkups['US:9+'];assert.equal(context.markupFor({country:'US',type:'Whole',age:'9+'}),4);
 assert.equal(context.markupFor({country:'CA',type:'Whole',age:'9+'}),2);
 assert.deepEqual(validateSettings(JSON.parse(JSON.stringify(settings))).itunesAgeMarkups,settings.itunesAgeMarkups);
 for(const map of [{'US:2+':3},{'US:1+':-1},{'US:9+':'3'},{'US:5+':1001}])assert.throws(()=>validateSettings({...settings,itunesAgeMarkups:map}));
});
