// Read-only protocol probe based on the recorded site's own frontend.
// Creates a fresh encrypted session; never creates orders or transfers funds.
import {randomBytes,createHash,createCipheriv,createDecipheriv,publicEncrypt,constants} from 'node:crypto';
import {mkdir,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {normalize} from './normalize-api.mjs';
import {formatQuotes} from './format.mjs';

export function encrypt(data,secret){
  const iv=randomBytes(16),key=createHash('sha256').update(secret).digest();
  const cipher=createCipheriv('aes-256-cbc',key,iv);
  const ct=Buffer.concat([cipher.update(JSON.stringify(data),'utf8'),cipher.final()]).toString('base64');
  return Buffer.from(JSON.stringify({ct,iv:iv.toString('hex')})).toString('base64');
}
export function decrypt(sign,secret){
  const envelope=JSON.parse(Buffer.from(sign,'base64').toString());
  const decipher=createDecipheriv('aes-256-cbc',createHash('sha256').update(secret).digest(),Buffer.from(envelope.iv,'hex'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.ct,'base64')),decipher.final()]).toString());
}

async function main(){
  let email=process.env.PROMO_EMAIL,password=process.env.PROMO_PASSWORD;
  delete process.env.PROMO_EMAIL;delete process.env.PROMO_PASSWORD;
  if(!email||!password) throw new Error('Provide temporary PROMO_EMAIL and PROMO_PASSWORD environment variables.');
  const root=path.dirname(fileURLToPath(import.meta.url));
  const out=path.join(root,'captures','api-'+new Date().toISOString().replaceAll(':','-'));
  await mkdir(out,{recursive:true});
  const secret=randomBytes(16).toString('hex');
  let encryptionToken='',token='';
  const trace=[],details=[],errors=[];
  const save=(name,data)=>writeFile(path.join(out,name),JSON.stringify(data,null,2));
  async function request(endpoint,data={},method='GET',encrypted=true){
    if(!['getkey','setkey','user/login','index/list','goods/detail','recharge/config'].includes(endpoint)) throw new Error('Endpoint outside read-only probe allowlist');
    const url=new URL('https://api.promoscard.org/api/'+endpoint);
    const payload=encrypted?{sign:encrypt(data,secret)}:data;
    if(method==='GET') for(const [k,v] of Object.entries(payload)) url.searchParams.set(k,v);
    const headers={'Content-Type':'application/json',Accept:'application/json','Accept-Language':'en',Platform:'pc'};
    if(encryptionToken) headers['X-Encryption-Token']=encryptionToken;
    if(token) headers.Authorization='Bearer '+token;
    const response=await fetch(url,{method,headers,body:method==='POST'?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(30000)});
    trace.push({endpoint,method,httpStatus:response.status,at:new Date().toISOString()});
    if(!response.ok) throw new Error(`${endpoint}: HTTP ${response.status}`);
    const body=await response.json();
    const result=body.sign?decrypt(body.sign,secret):body;
    if(result.code!==undefined && Number(result.code)!==200) throw new Error(`${endpoint}: code ${result.code}`);
    return result;
  }
  try{
    const key=await request('getkey',{},'GET',false);
    if(!key.success||!key.publicKey) throw new Error('RSA public key unavailable');
    const sign=publicEncrypt({key:key.publicKey,padding:constants.RSA_PKCS1_PADDING},Buffer.from(secret)).toString('base64');
    const exchange=await request('setkey',{sign},'POST',false);
    if(!exchange.success||!exchange.token) throw new Error('Key exchange failed');
    encryptionToken=exchange.token;
    const login=await request('user/login',{email,password},'POST');
    email=null;password=null;
    token=login.data?.token;
    if(!token) throw new Error('Login did not return a token');
    console.log('API login succeeded. Reading iTunes catalog.');
    const catalog=await request('index/list',{type:1});
    const brands=catalog.data?.goods_list;
    if(!Array.isArray(brands)) throw new Error('Unexpected catalog schema');
    const apple=brands.filter(b=>[1,3].includes(Number(b.id)));
    if(apple.length!==2) throw new Error('Both iTunes catalog brands were not found');
    await save('catalog.json',apple.map(b=>({...b,goods:b.goods.map(({recent_orders,...g})=>g)})));
    for(const brand of apple){
      if(!Array.isArray(brand.goods)) throw new Error('Missing goods array');
      for(const item of brand.goods){
        try{
          const response=await request('goods/detail',{goods_id:item.goods_id});
          if(!response.data) throw new Error('Missing goods detail');
          // Remove unrelated customers' purchase-history records from the research export.
          const {recent_orders,...detail}=response.data;
          const {recent_orders:unused,...catalogItem}=item;
          details.push({goodsId:item.goods_id,brandId:brand.id,type:Number(brand.id)===1?'Recharge':item.is_misc_card?'Split':'Whole',catalog:catalogItem,detail});
          console.log('Detail',item.goods_id,'collected; total',details.length);
          await save('goods-details.json',details);
        }catch(e){errors.push({goodsId:item.goods_id,error:e.message});}
        await new Promise(r=>setTimeout(r,300));
      }
    }
    // Read twice in the same session to test reuse without another login.
    const again=await request('index/list',{type:1});
    const normalized=normalize(details);
    errors.push(...normalized.errors);
    await save('normalized.json',normalized);
    await writeFile(path.join(out,'output.txt'),formatQuotes(normalized.accounts,[...new Set(normalized.accounts.map(r=>r.country))]));
    await save('summary.json',{status:errors.length?'partial':'complete',catalogCount:apple.reduce((n,b)=>n+b.goods.length,0),detailCount:details.length,sameSessionSecondRead:again.code===200,accountOptions:normalized.accounts.length,rechargeQuotes:normalized.recharge.length,customProducts:normalized.custom.length,errors});
  }catch(e){errors.push({error:e.message});await save('summary.json',{status:'failed',detailCount:details.length,errors});process.exitCode=1;}
  finally{await save('requests.json',trace);console.log('API output:',out);if(errors.length){console.error(JSON.stringify(errors));process.exitCode=1;}}
}
if(process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
