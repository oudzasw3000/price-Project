import test from 'node:test';import assert from 'node:assert/strict';import {salesResponse} from './app/sales-api.mjs';import {validateSettings} from './app/model.mjs';import {newDb} from 'pg-mem';import {SettingsStore} from './app/settings-store.mjs';import {readFile} from 'node:fs/promises';import {runInNewContext} from 'node:vm';import {productSalesText} from './app/public/sales-text.js';
const settings={fx:33,purchaseFee:.251,markup:2,fee:0,interval:0,categoryCountryMarkups:{'itunes:US':4},itunesAgeMarkups:{'US:9+':6}};
const market={usable:true,price:33};
const accounts=['itunes','xbox','razer','mycard'].map(category=>({category,country:'US',type:category==='itunes'?'Whole':'Card',age:category==='itunes'?'9+':undefined,stock:3,denomination:500,paymentUsd:400,sourceId:'a'}));
const recharge=accounts.map(x=>({...x,type:'Recharge',age:undefined,channel:'standard',stock:null}));
const snapshot={accounts,recharge,updatedAt:'2026-10-20T00:00:00Z',usdPerUsdt:1};
test('all product routes isolate fulfillment; legacy US iTunes text remains byte-identical',()=>{
 for(const product of ['itunes','xbox','razer','mycard']){
  const stock=salesResponse(snapshot,settings,market,product,undefined,'stock').text;
  const topup=salesResponse(snapshot,settings,market,product,undefined,'recharge').text;
  assert.match(stock,/500\*3/);assert.doesNotMatch(stock,/standard/);assert.match(topup,/standard/);assert.doesNotMatch(topup,/500\*3/);
 }
 assert.equal(salesResponse(snapshot,settings,market,'itunes').text,salesResponse(snapshot,settings,market,'itunes',undefined,'stock').text);
 assert.equal(salesResponse(snapshot,settings,market,'itunes-recharge').text,salesResponse(snapshot,settings,market,'itunes',undefined,'recharge').text);
 assert.match(salesResponse(snapshot,settings,market).text,/itunes us 9\+/);
 assert.throws(()=>salesResponse({...snapshot,recharge:[]},settings,market,'xbox',undefined,'recharge'));
 assert.equal(snapshot.accounts.length,4);assert.equal(snapshot.recharge.length,4);
});
test('fulfillment markup isolates prices, preserves zero and age overrides, matches frontend',async()=>{
 const next={...settings,fulfillmentMarkups:{'xbox:US:stock':10,'xbox:US:recharge':0,'itunes:US:stock':20}};
 assert.equal(salesResponse(snapshot,next,market,'itunes').text,salesResponse(snapshot,settings,market,'itunes').text);
 assert.notEqual(salesResponse(snapshot,next,market,'xbox',undefined,'stock').text,salesResponse(snapshot,settings,market,'xbox',undefined,'stock').text);
 const source=await readFile('app/public/app.js','utf8');const context={state:{settings:next,snapshot}};
 runInNewContext(source.slice(source.indexOf('function money('),source.indexOf('function currency(')),context);
 assert.equal(context.markupFor(accounts[1]),10);assert.equal(context.markupFor(recharge[1]),0);assert.equal(context.markupFor(accounts[0]),6);
 for(const product of ['itunes','xbox','razer','mycard'])for(const kind of ['stock','recharge'])assert.equal(salesResponse(snapshot,next,market,product,undefined,kind).text,productSalesText(snapshot,product,x=>context.sell(x)/x.denomination,kind));
});
test('new markup settings survive database reload and legacy settings need no migration',async()=>{
 const {Pool}=newDb({noAstCoverageCheck:true}).adapters.createPg();const pool=new Pool();
 try{const store=new SettingsStore({pool,file:'nonexistent-settings.json'});await store.load();const next={...settings,fulfillmentMarkups:{'mycard:TW:stock':5,'mycard:TW:recharge':0}};await store.save(next);const restored=new SettingsStore({pool,file:'nonexistent-settings.json'});assert.deepEqual((await restored.load()).fulfillmentMarkups,next.fulfillmentMarkups);
 assert.deepEqual(validateSettings(settings).fulfillmentMarkups,{});assert.throws(()=>validateSettings({...settings,fulfillmentMarkups:{'xbox:US:bad':5}}));
 }finally{await pool.end();}
});
