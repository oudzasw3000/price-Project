import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {itunesSalesText} from './public/sales-text.js';
const digest=value=>createHash('sha256').update(value).digest('hex');
export class SalesKeyStore{
  constructor(pool){this.pool=pool;}
  async load(){await this.pool.query('CREATE TABLE IF NOT EXISTS gamestation_sales_key (id SMALLINT PRIMARY KEY CHECK (id = 1), token_hash TEXT NOT NULL)');}
  async rotate(){
    const key=randomBytes(32).toString('hex');
    await this.pool.query('INSERT INTO gamestation_sales_key (id,token_hash) VALUES (1,$1) ON CONFLICT (id) DO UPDATE SET token_hash=EXCLUDED.token_hash',[digest(key)]);
    return key;
  }
  async authorized(header){
    if(!/^Bearer [a-f0-9]{64}$/.test(header||''))return false;
    const {rows}=await this.pool.query('SELECT token_hash FROM gamestation_sales_key WHERE id=1');
    return !!rows[0]&&timingSafeEqual(Buffer.from(digest(header.slice(7)),'hex'),Buffer.from(rows[0].token_hash,'hex'));
  }
}
export function salesResponse(snapshot,settings,market){
  if(!snapshot?.updatedAt||!Array.isArray(snapshot.accounts)||!market?.usable||!(market.price>0)||!(snapshot.usdPerUsdt>0))throw new Error('Sales data or exchange rate is not ready');
  return {text:itunesSalesText(snapshot.accounts,row=>{
    const age=({'1-5':'1+','5-9':'5+','9+':'9+'})[row.age];
    const markup=(['Whole','Split'].includes(row.type)&&age?settings.itunesAgeMarkups?.[row.country+':'+age]:undefined)??settings.categoryCountryMarkups?.['itunes:'+row.country]??settings.countryMarkups?.[row.country]??settings.markup;
    return (Number(row.paymentUsd)/snapshot.usdPerUsdt*market.price*(1+(settings.purchaseFee??0.251)/100)*(1+markup/100)+settings.fee)/row.denomination;
  })};
}
