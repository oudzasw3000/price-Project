import {readFile,writeFile} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {formatQuotes} from './format.mjs';
const levels=['level_2','level_3','level_4','level_5'];
const ages=['0-1','1-5','5-9','9+'];
const channels=['Std','Bronze','Silver','Gold'];
export function calculatePrice(amount,cnRate,configRate,markup,quantity=1){
  const numbers=[amount,cnRate,configRate,markup,quantity].map(Number);
  if(numbers.some(n=>!Number.isFinite(n))||numbers[2]<=0||numbers[0]<=0||numbers[1]<=0||numbers[4]<=0) throw new Error('Invalid quote inputs');
  return (numbers[0]*numbers[4]*(numbers[1]/numbers[2])*(1+numbers[3])).toFixed(2);
}
export function normalize(details){
  const accounts=[],recharge=[],custom=[],errors=[];
  for(const item of details){
    try{
      const d=item.detail,rawCountry=d.name.match(/\((\w+)\)/)?.[1],country=({USA:'US',CAD:'CA'})[rawCountry]||rawCountry;
      if(!country||!Array.isArray(d.amounts)||(!d.channel_level&&item.type!=='Recharge')||!d.brand_levels) throw new Error('Missing country/amount/channel schema');
      const base={category:({4:'razer',5:'xbox'})[item.brandId]||'itunes',goodsId:item.goodsId,type:item.type,country,label:d.name,currencySymbol:d.symbol};
      for(const amount of d.amounts){
        for(let i=0;i<levels.length;i++){
          const level=levels[i],raw=d.channel_level?.[level] ?? (item.type==='Recharge'?0:undefined),premium=d.brand_levels[level];
          if(raw===undefined||premium===undefined) throw new Error('Missing level '+level);
          const common={...base,denomination:Number(amount),level,premium:Number(premium),paymentUsd:calculatePrice(amount,d.cn_rate,d.config_rate,premium),quantity:1};
          if(item.type==='Recharge') recharge.push({...common,channel:channels[i],queueAmount:Number(raw),stock:null});
          else accounts.push({...common,age:ages[i],stock:Math.floor(Math.max(0,Number(raw))),listStock:item.catalog.stock});
        }
      }
      if(d.is_custom)custom.push({...base,minAmount:d.min_amount,maxAmount:d.max_amount,multiple:d.multiple_role,cnRate:d.cn_rate,configRate:d.config_rate,premiums:d.brand_levels});
    }catch(e){errors.push({goodsId:item.goodsId,error:e.message});}
  }
  return {accounts,recharge,custom,errors};
}
async function main(){
  const folder=process.argv[2];if(!folder)throw new Error('Pass an API capture folder');
  const details=JSON.parse(await readFile(path.join(folder,'goods-details.json'),'utf8'));
  const result=normalize(details);
  await writeFile(path.join(folder,'normalized.json'),JSON.stringify(result,null,2));
  // Currency conversion is intentionally not inferred from an old observation.
  await writeFile(path.join(folder,'output.txt'),formatQuotes(result.accounts,[...new Set(result.accounts.map(x=>x.country))]));
  console.log(JSON.stringify({products:details.length,accountOptions:result.accounts.length,rechargeQuotes:result.recharge.length,customProducts:result.custom.length,errors:result.errors}));
  if(result.errors.length)process.exitCode=1;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) await main();
