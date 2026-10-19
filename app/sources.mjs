import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
export const PRODUCTS=['itunes','xbox','razer','mycard'];
const hash=v=>createHash('sha256').update(v).digest('hex');
export function validateFeed(input,now=Date.now()){
 if(!input||!Array.isArray(input.items)||input.items.length>2000)throw new Error('items must be an array with at most 2000 rows');
 const expiry=Date.parse(input.expiresAt);
 if(!Number.isFinite(expiry)||expiry<=now||expiry>now+86400000)throw new Error('expiresAt must be in the next 24 hours');
 const ids=new Set();
 const items=input.items.map(x=>{
  if(!x||typeof x.id!=='string'||!/^[-a-zA-Z0-9_:.]{1,100}$/.test(x.id)||ids.has(x.id))throw new Error('Invalid or duplicate item id');ids.add(x.id);
  if(!PRODUCTS.includes(x.product)||!['account','recharge','card'].includes(x.kind)||! /^[A-Z]{2,8}$/.test(x.country||''))throw new Error('Invalid product, kind or country');
  if(x.kind==='account'&&x.product!=='itunes')throw new Error('Account inventory currently supports iTunes only; other products use recharge rates');
  for(const key of ['denomination','costUsdt'])if(typeof x[key]!=='number'||!Number.isFinite(x[key])||x[key]<=0||x[key]>1e9)throw new Error('Invalid '+key);
  if(x.kind==='account'&&(!['0-1','1-5','5-9','9+'].includes(x.age)||!Number.isSafeInteger(x.stock)||x.stock<0))throw new Error('Invalid account age or stock');
  if(x.kind==='card'&&x.product==='itunes')throw new Error('Use account with age for iTunes inventory');
  if(x.kind==='card'&&(!Number.isSafeInteger(x.stock)||x.stock<0))throw new Error('Invalid card stock');
  if(x.kind==='recharge'&&(typeof x.channel!=='string'||!x.channel.trim()||x.channel.length>80||/[\r\n\x00-\x1f]/.test(x.channel)))throw new Error('Invalid channel');
  if(typeof x.label!=='string'||!x.label.trim()||x.label.length>160||/[\r\n\x00-\x1f]/.test(x.label))throw new Error('Invalid label');
  return {id:x.id,category:x.product,country:x.country,type:x.kind==='account'?'Whole':x.kind==='card'?'Card':'Recharge',label:x.label,denomination:x.denomination,paymentUsd:x.costUsdt,usdPerUsdt:1,currencySymbol:x.country,age:x.kind==='account'?x.age:undefined,stock:x.kind!=='recharge'?x.stock:null,channel:x.kind==='recharge'?x.channel:undefined,queueAmount:0};
 });
 return {items,expiresAt:new Date(expiry).toISOString(),updatedAt:new Date(now).toISOString()};
}
export class SourceStore{
 constructor(pool){this.pool=pool;}
 async load(){await this.pool.query('CREATE TABLE IF NOT EXISTS gamestation_sources (id TEXT PRIMARY KEY, name TEXT NOT NULL, token_hash TEXT NOT NULL, feed JSONB)');}
 async list(){const {rows}=await this.pool.query('SELECT id,name,feed FROM gamestation_sources ORDER BY id');return rows;}
 async create(id,name){
  if(!/^[a-z][a-z0-9-]{1,39}$/.test(id||'')||id==='promo'||typeof name!=='string'||!name.trim()||name.length>80)throw new Error('Invalid source id or name');
  const key=randomBytes(32).toString('hex');await this.pool.query('INSERT INTO gamestation_sources (id,name,token_hash) VALUES ($1,$2,$3)',[id,name,hash(key)]);return {id,key};
 }
 async rotate(id){const key=randomBytes(32).toString('hex');const r=await this.pool.query('UPDATE gamestation_sources SET token_hash=$1 WHERE id=$2',[hash(key),id]);if(!r.rowCount)throw new Error('Unknown source');return {id,key};}
 async authorized(id,header){if(!/^Bearer [a-f0-9]{64}$/.test(header||''))return false;const {rows}=await this.pool.query('SELECT token_hash FROM gamestation_sources WHERE id=$1',[id]);return !!rows[0]&&timingSafeEqual(Buffer.from(hash(header.slice(7)),'hex'),Buffer.from(rows[0].token_hash,'hex'));}
 async replace(id,input){const feed=validateFeed(input);const r=await this.pool.query('UPDATE gamestation_sources SET feed=$1::jsonb WHERE id=$2',[JSON.stringify(feed),id]);if(!r.rowCount)throw new Error('Unknown source');return {ok:true,items:feed.items.length,expiresAt:feed.expiresAt};}
}
// Each adapter supplies a snapshot with source identity and its own conversion rate.
export function combineSources(promo,sources,now=Date.now()){
 const result={accounts:[],recharge:[],custom:[],products:0,types:{Whole:0,Split:0,Recharge:0,Card:0},updatedAt:null,usdPerUsdt:1,sources:[]};
 if(promo){
  result.sources.push({id:'promo',name:'Primary supplier',updatedAt:promo.updatedAt,usable:!!promo.usdPerUsdt});
  for(const type of ['accounts','recharge','custom'])result[type].push(...(promo[type]||[]).map(x=>({...x,sourceId:'promo',usdPerUsdt:promo.usdPerUsdt??0})));
  result.products=promo.products||0;result.updatedAt=promo.updatedAt;result.rateWarning=promo.rateWarning;result.imported=promo.imported;
 }
 for(const source of sources){
  const f=source.feed,usable=!!f&&Date.parse(f.expiresAt)>now;
  result.sources.push({id:source.id,name:source.name,updatedAt:f?.updatedAt,expiresAt:f?.expiresAt,usable});
  if(!usable)continue;
  for(const x of f.items)result[x.type==='Recharge'?'recharge':'accounts'].push({...x,sourceId:source.id});
  result.products+=f.items.length;if(!result.updatedAt||f.updatedAt>result.updatedAt)result.updatedAt=f.updatedAt;
 }
 for(const x of [...result.accounts,...result.recharge])result.types[x.type]++;
 return result;
}
