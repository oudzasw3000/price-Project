import http from 'node:http';
import {hostingConfig,authorized} from './hosting.mjs';
const hosting=hostingConfig();
import {BitkubRate} from './bitkub.mjs';
const marketRate=new BitkubRate();
import {readFile,readdir,mkdir} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {PromosClient} from './api-client.mjs';
import {loadVault,saveVault,atomicWrite} from './vault.mjs';
import {validateSettings,resolveUsdtRate} from './model.mjs';
import {normalize} from '../normalize-api.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const local=path.resolve(process.env.DATA_DIR||process.env.RAILWAY_VOLUME_MOUNT_PATH||path.join(root,'.local')),vaultFile=path.join(local,process.env.VAULT_KEY?'account.aes':'account.dpapi');
await mkdir(local,{recursive:true});
let vault={},vaultError='';try{vault=await loadVault(vaultFile);}catch{vaultError='อ่านบัญชีที่บันทึกไว้ไม่ได้ กรุณาเข้าสู่ระบบใหม่';}
const bootEmail=process.env.PROMO_EMAIL,bootPassword=process.env.PROMO_PASSWORD;
delete process.env.PROMO_EMAIL;delete process.env.PROMO_PASSWORD;
if(bootEmail&&bootPassword){vault.credentials={email:bootEmail,password:bootPassword};vault.remember=true;}
let settings={fx:0,purchaseFee:0.251,markup:2,fee:0,interval:0};
try{settings=validateSettings(JSON.parse(await readFile(path.join(local,'settings.json'),'utf8')));}catch{}
let snapshot=null;try{snapshot=JSON.parse(await readFile(path.join(local,'snapshot.json'),'utf8'));}catch{}
if(!snapshot){
  const dirs=(await readdir(path.join(root,'captures')).catch(()=>[])).filter(x=>x.startsWith('api-')).sort().reverse();
  for(const dir of dirs){try{
    const details=JSON.parse(await readFile(path.join(root,'captures',dir,'goods-details.json'),'utf8'));
    const normalized=normalize(details);if(normalized.errors.length)continue;
    snapshot={...normalized,products:details.length,types:counts(details),updatedAt:null,imported:true,usdPerUsdt:null};break;
  }catch{}}
}
function counts(ds){return Object.fromEntries(['Whole','Split','Recharge'].map(t=>[t,ds.filter(x=>x.type===t).length]));}
let job={running:false,current:0,total:0,message:'พร้อมอัปเดต',error:vaultError},controller=null,timer=null,nextRun=null;
const client=new PromosClient({session:vault.session||{},credentials:vault.credentials||{},persist:async()=>{
  await saveVault(vaultFile,{remember:vault.remember!==false,session:client.session,credentials:vault.remember===false?{}:client.credentials});
}});
if(bootEmail&&bootPassword)await client.persist();
function publicState(){const market=marketRate.state();return {settings:{...settings,fx:market.usable?market.price:0},market,snapshot,job,nextRun,account:{email:client.credentials.email||vault.email||'',configured:!!client.credentials.password||!!client.session.token,hasSession:!!client.session.token,remember:vault.remember!==false}};}
function schedule(){clearTimeout(timer);timer=null;nextRun=null;if(settings.interval>0){nextRun=new Date(Date.now()+settings.interval*60000).toISOString();timer=setTimeout(()=>{if(!job.running)void sync();},settings.interval*60000);timer.unref();}}
async function sync(){
  if(job.running)return;
  clearTimeout(timer);nextRun=null;controller=new AbortController();
  job={running:true,current:0,total:0,message:'กำลังเชื่อมต่อบัญชี',error:''};
  try{
    const catalog=await client.get('index/list',{type:1});
    const brands=catalog.data?.goods_list?.filter(b=>[1,3,4,5].includes(Number(b.id)));
    if(!Array.isArray(brands)||![1,3,4,5].every(id=>brands.some(b=>Number(b.id)===id))||brands.some(b=>!Array.isArray(b.goods)))throw new Error('โครงสร้างรายการสินค้าไม่ครบ');
    const items=brands.flatMap(b=>b.goods.map(g=>({brandId:b.id,item:g})));
    if(!items.length)throw new Error('บริการส่งรายการสินค้าว่าง จึงเก็บข้อมูลเดิมไว้');
    job.total=items.length;const details=[];
    for(const {brandId,item}of items){
      if(controller.signal.aborted)throw new Error('หยุดการอัปเดตแล้ว ข้อมูลรอบเดิมยังอยู่');
      job.message='กำลังอ่าน '+item.name;
      const response=await client.get('goods/detail',{goods_id:item.goods_id});
      if(!response.data)throw new Error('รายละเอียดสินค้าไม่ครบ: '+item.goods_id);
      const {recent_orders,...detail}=response.data;const {recent_orders:unused,...clean}=item;
      details.push({goodsId:item.goods_id,brandId,type:Number(brandId)!==3?'Recharge':item.is_misc_card?'Split':'Whole',catalog:clean,detail});
      job.current++;await new Promise(r=>setTimeout(r,220));
    }
    if(controller.signal.aborted)throw new Error('หยุดการอัปเดตแล้ว ข้อมูลรอบเดิมยังอยู่');
    let usdPerUsdt=null,rateWarning='';
    try{usdPerUsdt=resolveUsdtRate(await client.get('recharge/config'));if(!usdPerUsdt)rateWarning='ยังยืนยันเรต USDT ไม่ได้ จะแสดงต้นทุน USD และงดคำนวณบาท';}catch{rateWarning='อ่านเรต USDT ไม่สำเร็จ จะแสดงต้นทุน USD และงดคำนวณบาท';}
    const normalized=normalize(details);if(normalized.errors.length)throw new Error('แปลงข้อมูลสินค้าไม่ครบ จึงเก็บข้อมูลรอบเดิมไว้');
    const next={...normalized,products:details.length,types:counts(details),updatedAt:new Date().toISOString(),imported:false,usdPerUsdt,rateWarning};
    await atomicWrite(path.join(local,'snapshot.json'),JSON.stringify(next));snapshot=next;
    job.message='อัปเดตครบ '+details.length+' รายการ';
  }catch(e){job.error=e.message;job.message='อัปเดตไม่สำเร็จ';}
  finally{job.running=false;controller=null;schedule();}
}
const {port,origin}=hosting;
const files={'/':['index.html','text/html; charset=utf-8'],'/app.js':['app.js','text/javascript; charset=utf-8'],'/style.css':['style.css','text/css; charset=utf-8']};
async function body(req){let text='';for await(const chunk of req){text+=chunk;if(text.length>16000)throw new Error('Request too large');}return JSON.parse(text||'{}');}
function send(res,status,data){res.writeHead(status,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store'});res.end(JSON.stringify(data));}
const server=http.createServer(async(req,res)=>{
  res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; form-action 'self'");
  if(req.method==='GET'&&req.url==='/healthz'){send(res,200,{ok:true});return;}
  if(!hosting.hosts.includes(req.headers.host)){send(res,403,{error:'Invalid host'});return;}
  if(!authorized(req.headers.authorization)){res.setHeader('WWW-Authenticate','Basic realm="Gamestation Rate", charset="UTF-8"');send(res,401,{error:'Authentication required'});return;}
  try{
    const url=new URL(req.url,origin),route=url.pathname;
    if(req.method==='GET'&&route==='/api/state'){send(res,200,publicState());return;}
    if(req.method==='POST'){
      if(!hosting.origins.includes(req.headers.origin)||!req.headers['content-type']?.startsWith('application/json')){send(res,403,{error:'Invalid origin'});return;}
      const input=await body(req);
      if(route==='/api/sync'){if(job.running){send(res,409,{error:'กำลังอัปเดตอยู่'});return;}void sync();send(res,202,{ok:true});return;}
      if(route==='/api/stop'){controller?.abort();job.message='กำลังหยุดหลังคำขอปัจจุบัน';send(res,200,{ok:true});return;}
      if(route==='/api/settings'){settings=validateSettings(input);await atomicWrite(path.join(local,'settings.json'),JSON.stringify(settings));if(!job.running)schedule();send(res,200,{ok:true});return;}
      if(route==='/api/account'){
        if(job.running){send(res,409,{error:'หยุดการอัปเดตก่อนเปลี่ยนบัญชี'});return;}
        if(typeof input.email!=='string'||typeof input.password!=='string'||!input.email.trim()||!input.password)throw new Error('กรอกอีเมลและรหัสผ่าน');
        client.credentials={email:input.email.trim(),password:input.password};client.session={};vault.remember=!!input.remember;
        // Do not persist a different account's previous successful quote as if it belonged to this account.
        snapshot=null;await atomicWrite(path.join(local,'snapshot.json'),'null');
        await client.persist();void sync();send(res,202,{ok:true});return;
      }
      send(res,404,{error:'Not found'});return;
    }
    if(req.method==='GET'&&files[route]){const [name,mime]=files[route];res.writeHead(200,{'Content-Type':mime,'Cache-Control':'no-store'});res.end(await readFile(path.join(root,'app','public',name)));return;}
    send(res,404,{error:'Not found'});
  }catch(e){send(res,400,{error:e.message});}
});
server.on('error',e=>{console.error(e.code==='EADDRINUSE'?'โปรแกรมเปิดอยู่แล้วที่ '+origin:e.message);process.exitCode=1;});
server.listen(port,hosting.host,()=>{console.log('Gamestation Rate: '+origin);void marketRate.refresh();setInterval(()=>void marketRate.refresh(),30000).unref();schedule();if(process.env.PROMO_AUTO_SYNC==='1')void sync();});
