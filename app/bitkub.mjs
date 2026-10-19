export function parseAsk(data){
  const row=Array.isArray(data)?data.find(x=>x.symbol==='USDT_THB'):null;
  const price=Number(row?.lowest_ask);
  if(!Number.isFinite(price)||price<=0||price>1000)throw new Error('Bitkub ส่งเรท USDT ไม่ถูกต้อง');
  return price;
}
export class BitkubRate{
  constructor(fetcher=fetch,clock=Date.now){this.fetcher=fetcher;this.clock=clock;this.price=null;this.updatedAt=null;this.error='';this.running=false;}
  async refresh(){
    if(this.running)return;
    this.running=true;
    try{
      const response=await this.fetcher('https://api.bitkub.com/api/v3/market/ticker?sym=usdt_thb',{signal:AbortSignal.timeout(10000)});
      if(!response.ok)throw new Error('Bitkub HTTP '+response.status);
      this.price=parseAsk(await response.json());this.updatedAt=this.clock();this.error='';
    }catch{this.error='ดึงเรท Bitkub ไม่สำเร็จ กำลังลองใหม่';}
    finally{this.running=false;}
  }
  state(){return {source:'Bitkub',price:this.price,updatedAt:this.updatedAt,error:this.error,usable:this.updatedAt!==null&&this.clock()-this.updatedAt<90000};}
}
