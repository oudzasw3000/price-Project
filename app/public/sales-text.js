const aliases={AU:'aud',CA:'cad',TW:'twd',CH:'chf',MX:'mxn',TR:'try',NO:'nok'};
export function formatSaleRate(price){
  if(!Number.isFinite(price)||price<0)throw new Error('Invalid sale price');
  if(price===0)return '0.000';
  const exponent=Number(price.toExponential().split('e')[1]);
  const step=10**(exponent-3),scaled=price/step;
  const rounded=Math.ceil(scaled-Number.EPSILON*Math.abs(scaled)*4)*step;
  return rounded.toLocaleString('en-US',{useGrouping:false,minimumSignificantDigits:4,maximumSignificantDigits:4});
}
export function itunesSalesText(accounts,unitPriceFor){
  accounts=accounts.filter(x=>(x.category||'itunes')==='itunes');
  const countries=[...new Set(accounts.map(x=>x.country))],lines=['- itunes -','ราคาขาย: บาทต่อหน่วยยอดบัญชี',''];
  for(const c of countries){
    const rows=accounts.filter(x=>x.country===c&&x.age!=='0-1'&&x.stock>0);
    for(const age of ['1+','5+','9+']){
      const group=rows.filter(x=>x.age===({'1+':'1-5','5+':'5-9','9+':'9+'})[age]);
      for(const x of group){
        const price=unitPriceFor(x);if(!Number.isFinite(price)||price<0)throw new Error('Invalid sale price');
        const rate=formatSaleRate(price);
        lines.push(`itunes ${aliases[c]||c.toLowerCase()} ${age} ${rate} : ${x.denomination}*${x.stock}`);
      }
      if(!group.length)lines.push(`itunes ${aliases[c]||c.toLowerCase()} ${age} :`);
    }
    lines.push('');
  }
  return lines.join('\n');
}

export function productSalesText(snapshot,product,unitPriceFor,kind){
 if(product==='itunes'&&kind!=='recharge')return itunesSalesText(snapshot.accounts||[],unitPriceFor);
 const category=product==='itunes-recharge'?'itunes':product;
 if(kind==='stock'){const lines=['- '+category+' มีของแล้ว -','ราคาขาย: บาทต่อหน่วยยอดบัตร',''];for(const x of (snapshot.accounts||[]).filter(x=>x.category===category&&x.stock>0))lines.push(category+' '+x.country.toLowerCase()+' '+formatSaleRate(unitPriceFor(x))+' : '+x.denomination+'*'+x.stock);if(lines.length===3)lines.push('ยังไม่มีสินค้า');return lines.join('\n');}
 const lines=['- '+category+' เติมบัญชี -','ราคาเติม: บาทต่อหน่วยยอดเติม',''];
 const quotes=new Set();
 for(const x of (snapshot.recharge||[]).filter(x=>(x.category||'itunes')===category))quotes.add(category+' '+x.country.toLowerCase()+' '+x.channel+' '+formatSaleRate(unitPriceFor(x)));
 lines.push(...quotes);
 const cards=kind==='recharge'||product==='itunes-recharge'?[]:(snapshot.accounts||[]).filter(x=>x.category===category&&x.type==='Card'&&x.stock>0);
 if(cards.length){lines.push('','- '+category+' บัตร -','ราคาขาย: บาทต่อหน่วยยอดบัตร');for(const x of cards)lines.push(category+' '+x.country.toLowerCase()+' '+formatSaleRate(unitPriceFor(x))+' : '+x.denomination+'*'+x.stock);}
 if(!quotes.size&&!cards.length)lines.push('ยังไม่มีข้อมูล กรุณาอัปเดตข้อมูล');return lines.join('\n');
}
