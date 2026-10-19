export function parseProduct(text) {
  const m = text.match(/\((\w+)\)\s*balance\s*\[?(\d+)\]?\s*Stock:\s*(\d+)/);
  if (!m) throw new Error('Unrecognized product: ' + text);
  return { country:m[1], denomination:Number(m[2]), listStock:Number(m[3]) };
}
export function parseAge(text) {
  const m=text.match(/(0-1|1-5|5-9|9\+)\s*days?\s*Stock\s*(\d+)/);
  if (!m) throw new Error('Unrecognized age: ' + text);
  return { age:m[1], stock:Number(m[2]) };
}
export function payment(text) {
  const m=text.match(/Payment Amount\s*\$\s*([\d,]+\.\d{2})/);
  if (!m) throw new Error('Payment Amount unavailable');
  return m[1].replaceAll(',', '');
}
const aliases={AU:'aud',CA:'cad',TW:'twd',CH:'chf',MX:'mxn',TR:'try',NO:'nok'};
export function formatQuotes(rows,countries,usdPerUsdt=null) {
  const lines=['- itunes -',''];
  for(const country of countries){
    const name=aliases[country] ?? country.toLowerCase();
    const available=rows.filter(r=>r.country===country && r.age!=='0-1' && r.stock>0);
    for(const r of available){
      const cost=usdPerUsdt ? (Number(r.paymentUsd)/usdPerUsdt).toFixed(2)+' USDT/บัญชี' : '$'+r.paymentUsd+'/บัญชี';
      lines.push(`itunes ${name} ${r.age==='9+'?'9+':'1+'} : ${r.denomination}*${r.stock} | ต้นทุน ${cost}`);
    }
    if(!available.some(r=>r.age!=='9+')) lines.push(`itunes ${name} 1+ :`);
    if(!available.some(r=>r.age==='9+'))lines.push(`itunes ${name} 9+ :`);lines.push('');
  }
  return lines.join('\n');
}
