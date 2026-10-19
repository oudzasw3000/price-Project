import test from 'node:test';import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';import {runInNewContext} from 'node:vm';import {newDb} from 'pg-mem';
import {SalesKeyStore,salesResponse} from './app/sales-api.mjs';import {itunesSalesText} from './app/public/sales-text.js';
test('API text equals frontend copy text with age overrides, blanks, and country separation',async()=>{
 const settings={fx:33.5,purchaseFee:.251,markup:2,fee:0,categoryCountryMarkups:{'itunes:US':4},itunesAgeMarkups:{'US:1+':1,'US:5+':0,'US:9+':9}};
 const accounts=['1-5','5-9','9+'].map((age,i)=>({category:'itunes',country:'US',type:i===1?'Split':'Whole',age,paymentUsd:400,denomination:500,stock:2}));
 accounts.push({...accounts[0],country:'DE',stock:0},{...accounts[0],country:'FR'},{...accounts[0],country:'US',age:'0-1',denomination:100});
 const snapshot={updatedAt:'2026-10-19T00:00:00Z',usdPerUsdt:1,accounts};const source=await readFile(new URL('./app/public/app.js',import.meta.url),'utf8');const context={state:{settings,snapshot}};
 runInNewContext(source.slice(source.indexOf('function money('),source.indexOf('function currency(')),context);
 const response=salesResponse(snapshot,settings,{usable:true,price:settings.fx});
 assert.deepEqual(Object.keys(response),['text']);assert.equal(response.text,itunesSalesText(accounts,row=>context.sell(row)/row.denomination));
 assert.match(response.text,/itunes de 1\+ :\nitunes de 5\+ :\nitunes de 9\+ :/);assert.match(response.text,/itunes fr 1\+/);assert.doesNotMatch(response.text,/100\*2/);
 assert.equal(JSON.parse(JSON.stringify(response)).text,response.text);
 for(const market of [{usable:false,price:33},{usable:true,price:0}])assert.throws(()=>salesResponse(snapshot,settings,market));
 assert.throws(()=>salesResponse({...snapshot,usdPerUsdt:null},settings,{usable:true,price:33}));
 assert.throws(()=>salesResponse(null,settings,{usable:true,price:33}));
});
test('sales keys persist as hashes, reject admin Basic auth, and revoke previous key on rotation',async()=>{
 const {Pool}=newDb({noAstCoverageCheck:true}).adapters.createPg();const pool=new Pool();
 try{const keys=new SalesKeyStore(pool);await keys.load();assert.equal(await keys.authorized('Bearer '+'a'.repeat(64)),false);
 const first=await keys.rotate();assert.equal(await keys.authorized('Bearer '+first),true);assert.equal(await keys.authorized('Basic '+first),false);assert.equal(await keys.authorized(undefined),false);
 assert.notEqual((await pool.query('SELECT token_hash FROM gamestation_sales_key')).rows[0].token_hash,first);
 const restored=new SalesKeyStore(pool);await restored.load();assert.equal(await restored.authorized('Bearer '+first),true);
 const second=await restored.rotate();assert.equal(await keys.authorized('Bearer '+first),false);assert.equal(await keys.authorized('Bearer '+second),true);
 }finally{await pool.end();}
});
