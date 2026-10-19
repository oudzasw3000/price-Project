export function validateSettings(value){
  value={purchaseFee:0.251,markup:2,...value};
  const result={};
  for(const [key,min,max]of [['fx',0,1000],['purchaseFee',0,100],['markup',0,1000],['fee',0,100000],['interval',0,1440]]){
    const n=Number(value[key]);if(!Number.isFinite(n)||n<min||n>max)throw new Error('ค่าตั้งค่าไม่ถูกต้อง: '+key);result[key]=n;
  }
  if(result.interval>0&&result.interval<5)throw new Error('รอบอัตโนมัติขั้นต่ำ 5 นาที');
  for(const key of ['countryMarkups','productMarkups','categoryCountryMarkups']){
    const map=value[key]??{};
    if(!map||typeof map!=='object'||Array.isArray(map))throw new Error('Invalid '+key);
    result[key]={};
    for(const [id,n] of Object.entries(map)){
      if(!(key==='countryMarkups'?/^[A-Z]{2,8}$/:key==='categoryCountryMarkups'?/^(itunes|xbox|razer):[A-Z]{2,8}$/:/^[0-9]+$/).test(id)||typeof n!=='number'||!Number.isFinite(n)||n<0||n>1000)throw new Error('Invalid '+key);
      result[key][id]=n;
    }
  }
  return result;
}
export function resolveUsdtRate(config){
  if(!Array.isArray(config?.data))return null;
  const rows=config.data.filter(x=>String(x.currency).toUpperCase()==='USDT');
  const rates=rows.map(x=>Number(x.price)).filter(x=>Number.isFinite(x)&&x>0);
  return rates.length&&rates.every(x=>x===rates[0])?rates[0]:null;
}
