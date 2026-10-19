import {randomBytes,publicEncrypt,constants} from 'node:crypto';
import {encrypt,decrypt} from '../api-probe.mjs';
const allowed=new Set(['getkey','setkey','user/login','index/list','goods/detail','recharge/config']);
export class ApiError extends Error { constructor(message,code){super(message);this.code=code;} }
export class PromosClient {
  constructor({session={},credentials={},persist=async()=>{},fetcher=fetch,delay=ms=>new Promise(r=>setTimeout(r,ms))}={}){Object.assign(this,{session,credentials,persist,fetcher,delay});}
  async raw(endpoint,data={},method='GET',encrypted=true){
    if(!allowed.has(endpoint))throw new Error('Endpoint is not allowed');
    const url=new URL('https://api.promoscard.org/api/'+endpoint);
    const payload=encrypted?{sign:encrypt(data,this.session.secret)}:data;
    if(method==='GET')for(const [k,v]of Object.entries(payload))url.searchParams.set(k,v);
    const headers={'Content-Type':'application/json',Accept:'application/json','Accept-Language':'en',Platform:'pc'};
    if(this.session.token)headers.Authorization='Bearer '+this.session.token;
    if(this.session.encryptionToken)headers['X-Encryption-Token']=this.session.encryptionToken;
    const res=await this.fetcher(url,{method,headers,body:method==='POST'?JSON.stringify(payload):undefined,signal:AbortSignal.timeout(25000)});
    if(!res.ok)throw new ApiError('บริการตอบกลับ HTTP '+res.status,res.status);
    let body;try{body=await res.json();}catch{throw new ApiError('บริการส่งข้อมูลที่อ่านไม่ได้','BAD_RESPONSE');}
    if(body.sign){try{body=decrypt(body.sign,this.session.secret);}catch{throw new ApiError('อ่านข้อมูลเข้ารหัสไม่สำเร็จ','DECRYPT');}}
    if(body.code!==undefined&&Number(body.code)!==200)throw new ApiError('บริการตอบกลับรหัส '+body.code,Number(body.code));
    return body;
  }
  async handshake(){
    this.session.secret=randomBytes(16).toString('hex');this.session.encryptionToken='';
    const key=await this.raw('getkey',{},'GET',false);
    if(!key.success||!key.publicKey)throw new Error('รับกุญแจจากบริการไม่สำเร็จ');
    const sign=publicEncrypt({key:key.publicKey,padding:constants.RSA_PKCS1_PADDING},Buffer.from(this.session.secret)).toString('base64');
    const exchange=await this.raw('setkey',{sign},'POST',false);
    if(!exchange.success||!exchange.token)throw new Error('สร้างเซสชันเข้ารหัสไม่สำเร็จ');
    this.session.encryptionToken=exchange.token;
  }
  async login(){
    if(!this.credentials.email||!this.credentials.password)throw new ApiError('กรุณาตั้งค่าบัญชีเพื่อเชื่อมต่อ','LOGIN_REQUIRED');
    this.session={};await this.handshake();
    const result=await this.raw('user/login',this.credentials,'POST');
    if(!result.data?.token)throw new ApiError('เข้าสู่ระบบไม่สำเร็จ กรุณาตรวจสอบบัญชี','LOGIN_REQUIRED');
    this.session.token=result.data.token;this.session.createdAt=new Date().toISOString();
    await this.persist();
  }
  async get(endpoint,data={}){
    if(!this.session.token||!this.session.secret||!this.session.encryptionToken)await this.login();
    let recovered=false;
    for(let attempt=0;attempt<3;attempt++){
      try{return await this.raw(endpoint,data);}
      catch(e){
        if([401,-1,-2].includes(e.code)){
          if(recovered)throw e;recovered=true;
          // A fresh login reconstructs both authentication and encryption state once.
          await this.login();continue;
        }
        if(e.code===429)throw new ApiError('บริการจำกัดคำขอ กรุณารอสักครู่ก่อนอัปเดตอีกครั้ง',429);
        if((e.code>=500||e.name==='TimeoutError'||e.name==='TypeError')&&attempt<2){await this.delay(800*(attempt+1));continue;}
        throw e;
      }
    }
    throw new Error('เชื่อมต่อบริการไม่สำเร็จ');
  }
}
