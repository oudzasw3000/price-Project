const aliases={AU:'aud',CA:'cad',TW:'twd',CH:'chf',MX:'mxn',TR:'try',NO:'nok'};
export function itunesSalesText(accounts,unitPriceFor){
  accounts=accounts.filter(x=>(x.category||'itunes')==='itunes');
  const countries=[...new Set(accounts.map(x=>x.country))],lines=['- itunes -','ราคาขาย: บาทต่อหน่วยยอดบัญชี',''];
  for(const c of countries){
    const rows=accounts.filter(x=>x.country===c&&x.age!=='0-1'&&x.stock>0);
    for(const age of ['1+','5+','9+']){
      const group=rows.filter(x=>x.age===({'1+':'1-5','5+':'5-9','9+':'9+'})[age]);
      for(const x of group){
        const price=unitPriceFor(x);if(!Number.isFinite(price)||price<0)throw new Error('Invalid sale price');
        const rate=(Math.ceil((price-1e-10)*100)/100).toFixed(2);
        lines.push(`itunes ${aliases[c]||c.toLowerCase()} ${age} ${rate} : ${x.denomination}*${x.stock}`);
      }
      if(!group.length)lines.push(`itunes ${aliases[c]||c.toLowerCase()} ${age} :`);
    }
    lines.push('');
  }
  return lines.join('\n');
}
