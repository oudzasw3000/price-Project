import test from 'node:test';import assert from 'node:assert/strict';import {newDb} from 'pg-mem';
import {SourceStore,validateFeed,combineSources} from './app/sources.mjs';
import {SalesKeyStore,salesResponse} from './app/sales-api.mjs';
import {readFile} from 'node:fs/promises';import {runInNewContext} from 'node:vm';
const now=Date.now();
const row={id:'xbox-us',product:'xbox',kind:'recharge',country:'US',label:'Xbox US',channel:'standard',denomination:100,costUsdt:80};
const feed=items=>({expiresAt:new Date(now+3600000).toISOString(),items});
test('external feeds validate whole snapshots, expiration, identities and untrusted sales text',()=>{
 assert.equal(validateFeed(feed([row]),now).items[0].paymentUsd,80);
 for(const input of [feed([row,row]),feed([{...row,costUsdt:-1}]),feed([{...row,channel:'a\nb'}]),feed([{...row,product:'unknown'}]),feed([{...row,kind:'account'}]),{...feed([]),expiresAt:new Date(now-1).toISOString()},{...feed([]),expiresAt:new Date(now+86400001).toISOString()}])assert.throws(()=>validateFeed(input,now));
 assert.equal(validateFeed(feed([]),now).items.length,0);
});
test('source write keys are isolated, hashed, persistent and revocable; invalid updates retain inventory',async()=>{
 const {Pool}=newDb({noAstCoverageCheck:true}).adapters.createPg();const pool=new Pool();
 try{
 const store=new SourceStore(pool);await store.load();const a=await store.create('supplier-a','A'),b=await store.create('supplier-b','B');
 assert.equal(await store.authorized(a.id,'Bearer '+a.key),true);assert.equal(await store.authorized(b.id,'Bearer '+a.key),false);
 const readKeys=new SalesKeyStore(pool);await readKeys.load();const readKey=await readKeys.rotate();assert.equal(await store.authorized(a.id,'Bearer '+readKey),false);assert.equal(await readKeys.authorized('Bearer '+a.key),false);
 await store.replace(a.id,feed([row]));await assert.rejects(store.replace(a.id,feed([{...row,costUsdt:0}])));
 const restored=new SourceStore(pool);await restored.load();assert.equal((await restored.list())[0].feed.items.length,1);
 assert.notEqual((await pool.query('SELECT token_hash FROM gamestation_sources WHERE id=$1',[a.id])).rows[0].token_hash,a.key);
 const rotated=await restored.rotate(a.id);assert.equal(await store.authorized(a.id,'Bearer '+a.key),false);assert.equal(await store.authorized(a.id,'Bearer '+rotated.key),true);
 await restored.replace(a.id,feed([]));assert.deepEqual((await restored.list())[0].feed.items,[]);
 }finally{await pool.end();}
});
test('multiple sources retain identity and independent exchange rates; expired feeds disappear',async()=>{
 const promo={updatedAt:new Date(now).toISOString(),usdPerUsdt:2,accounts:[],recharge:[{category:'xbox',country:'US',type:'Recharge',channel:'standard',denomination:100,paymentUsd:160}],custom:[],products:1};
 const sources=[{id:'supplier-a',name:'A',feed:validateFeed(feed([row,{...row,id:'mycard-tw',product:'mycard',country:'TW'}]),now)}];
 const snapshot=combineSources(promo,sources,now);assert.equal(snapshot.recharge.length,3);assert.equal(snapshot.recharge[0].sourceId,'promo');assert.equal(snapshot.recharge[1].sourceId,'supplier-a');
 const settings={markup:2,purchaseFee:.251,fee:0,fx:33,categoryCountryMarkups:{'mycard:TW':5}};
 const market={usable:true,price:33};const xbox=salesResponse(snapshot,settings,market,'xbox');assert.equal(xbox.text.split('\n').filter(x=>x.startsWith('xbox us')).length,1);
 assert.match(salesResponse(snapshot,settings,market,'mycard').text,/mycard tw standard/);
 assert.throws(()=>salesResponse(snapshot,settings,market,'mycard','promo'));
 const expired=combineSources(promo,sources,now+3600001);assert.equal(expired.recharge.length,1);assert.equal(expired.sources[1].usable,false);
 assert.throws(()=>salesResponse(expired,settings,market,'mycard'));
 const source=await readFile(new URL('./app/public/app.js',import.meta.url),'utf8');const context={state:{settings,snapshot}};runInNewContext(source.slice(source.indexOf('function money('),source.indexOf('function currency(')),context);
 assert.equal(context.money(snapshot.recharge[0]),context.money(snapshot.recharge[1]));assert.equal(context.sell(snapshot.recharge[0]),context.sell(snapshot.recharge[1]));
 const withoutPromo=combineSources(null,sources,now);assert.match(salesResponse(withoutPromo,settings,market,'xbox').text,/xbox us/);
 const noRate=combineSources({...promo,usdPerUsdt:null},sources,now);assert.throws(()=>salesResponse(noRate,settings,market,'xbox'));assert.match(salesResponse(noRate,settings,market,'xbox','supplier-a').text,/xbox us/);
});
test('external cards expose denomination and stock with country markup and four-digit prices',()=>{
 const f=validateFeed(feed([{...row,id:'mc-card',kind:'card',product:'mycard',country:'TW',denomination:1000,costUsdt:28,stock:12}]),now);
 const snapshot=combineSources(null,[{id:'cards',name:'Cards',feed:f}],now);
 assert.equal(snapshot.accounts[0].type,'Card');
 const result=salesResponse(snapshot,{markup:2,purchaseFee:0,fee:0},{usable:true,price:33},'mycard');
 assert.match(result.text,/mycard tw 0\.9425 : 1000\*12/);
});
