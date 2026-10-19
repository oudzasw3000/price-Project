import {formatSaleRate,productSalesText} from './sales-text.js';
const $=id=>document.getElementById(id),nf=new Intl.NumberFormat('en-US',{maximumFractionDigits:2});
let state,tab='accounts',page=0,initialized=false,lastSnapshot='',toast='';const pageSize=30;
const names={US:'สหรัฐอเมริกา',UK:'สหราชอาณาจักร',DE:'เยอรมนี',FR:'ฝรั่งเศส',IT:'อิตาลี',ES:'สเปน',GR:'กรีซ',AU:'ออสเตรเลีย',CA:'แคนาดา',JP:'ญี่ปุ่น',TW:'ไต้หวัน',CH:'สวิตเซอร์แลนด์',MX:'เม็กซิโก',TR:'ตุรกี',DK:'เดนมาร์ก',NZ:'นิวซีแลนด์',SE:'สวีเดน',NO:'นอร์เวย์',BR:'บราซิล',NL:'เนเธอร์แลนด์',BE:'เบลเยียม',AT:'ออสเตรีย',PT:'โปรตุเกส',IE:'ไอร์แลนด์',FI:'ฟินแลนด์'};
const aliases={AU:'aud',CA:'cad',TW:'twd',CH:'chf',MX:'mxn',TR:'try',NO:'nok'};
function money(row){return Number(row.paymentUsd)/((row.usdPerUsdt??state.snapshot?.usdPerUsdt)||1)}
function markupFor(row){const age=({'1-5':'1+','5-9':'5+','9+':'9+'})[row.age];if((row.category||'itunes')==='itunes'&&['Whole','Split'].includes(row.type)&&age){const specific=state.settings.itunesAgeMarkups?.[row.country+':'+age];if(specific!==undefined)return specific;}return state.settings.categoryCountryMarkups?.[(row.category||'itunes')+':'+row.country]??((row.category||'itunes')==='itunes'?state.settings.countryMarkups?.[row.country]:undefined)??state.settings.markup}
function sell(row){return state.settings.fx>0&&(row.usdPerUsdt??state.snapshot?.usdPerUsdt)>0?money(row)*state.settings.fx*(1+(state.settings.purchaseFee??0.251)/100)*(1+markupFor(row)/100)+state.settings.fee:null}
function renderEffectiveFx(){
 const base=Number(state?.settings.fx),raw=$('purchaseFee').value,pct=Number(raw);
 if(!(base>0)){ $('effective-fx').textContent='รอเรท Bitkub';$('effective-fx-detail').textContent='';return; }
 if(raw===''||!Number.isFinite(pct)||pct<0||pct>100){$('effective-fx').textContent='กรอกค่าเผื่อ 0–100%';$('effective-fx-detail').textContent='';return;}
 const added=base*pct/100;
 $('effective-fx').textContent=(base+added).toFixed(6)+' บาท / USDT';
 $('effective-fx-detail').textContent=base.toFixed(2)+' + '+pct+'% = เพิ่ม '+added.toFixed(6)+' บาท / USDT'+(pct!==state.settings.purchaseFee?' · ตัวอย่าง ยังไม่ได้บันทึก':' · ใช้คำนวณราคาขายแล้ว');
}
function currency(row){return (row?.usdPerUsdt??state.snapshot?.usdPerUsdt)>0?'USDT':'USD'}
function cell(row,value,cls){const td=document.createElement('td');td.textContent=value;if(cls)td.className=cls;row.append(td);return td;}
async function post(url,data={}){const r=await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});const body=await r.json();if(!r.ok)throw new Error(body.error);return body;}
function error(e){toast=e.message;$('notice').textContent=toast;}
function fillSelect(id,values,label){const el=$(id),old=el.value;el.replaceChildren();for(const [value,text]of values){const o=document.createElement('option');o.value=value;o.textContent=label?label(value,text):text;el.append(o);}if([...el.options].some(x=>x.value===old))el.value=old;}
function render(){
 const snap=state.snapshot;const accounts=snap?.accounts||[],recharge=snap?.recharge||[];const countries=[...new Set([...accounts,...recharge].map(x=>x.country))].sort();
 $('products').textContent=snap?.products??'—';$('types').textContent=snap?`Whole ${snap.types.Whole} · Split ${snap.types.Split} · เติม ${snap.types.Recharge} · บัตร ${snap.types.Card||0}`:'iTunes ทุกประเภท';
 $('stock').textContent=snap?nf.format(accounts.filter(x=>x.age!=='0-1').reduce((sum,x)=>sum+x.stock,0)):'—';$('countries').textContent=snap?countries.length:'—';
 $('updated').textContent=snap?.updatedAt?new Date(snap.updatedAt).toLocaleTimeString('th-TH',{hour:'2-digit',minute:'2-digit',second:'2-digit'}):snap?'ข้อมูลที่บันทึกไว้':'ยังไม่มีข้อมูล';
 $('progress').textContent=state.job.running?`${state.job.message} ${state.job.current}/${state.job.total||'…'}`:state.job.message;
 $('sync').disabled=state.job.running;$('sync').textContent=state.job.running?'กำลังอัปเดต…':'↻ อัปเดตข้อมูล';$('stop').hidden=!state.job.running;
 $('notice').textContent=toast||state.job.error||(snap?.imported?'กำลังแสดงข้อมูลจากการทดสอบก่อนหน้า กดอัปเดตเพื่อดึงข้อมูลใหม่':'')||snap?.rateWarning||(!state.account.configured?'เชื่อมต่อบัญชีเพื่อเริ่มดึงข้อมูล':'');
 $('rate').textContent=snap?.usdPerUsdt?'ต้นทุนแปลงเป็น USDT ตามเรตของแต่ละแหล่งข้อมูล':'ยังไม่ยืนยันเรต USDT · แสดงต้นทุน USD';
 if(!initialized){for(const key of ['fx','purchaseFee','markup','fee','interval'])$(key).value=state.settings[key]|| (key==='fx'?'':0);draftAges={...state.settings.itunesAgeMarkups};draftCountries={...state.settings.categoryCountryMarkups};for(const [c,n]of Object.entries(state.settings.countryMarkups||{}))draftCountries['itunes:'+c]??=n;renderMarkupOptions();initialized=true;}
 for(const id of ['source-filter','sales-source'])fillSelect(id,[['','ทุกแหล่งข้อมูล'],...(snap?.sources||[]).map(x=>[x.id,x.name+' ('+x.id+')'])]);
 const key=JSON.stringify([snap?.updatedAt,snap?.products]);if(lastSnapshot!==key){lastSnapshot=key;renderMarkupOptions();fillSelect('country',[['','ทุกประเทศ'],...countries.map(c=>[c,`${c} · ${names[c]||c}`])]);fillSelect('custom-product',(snap?.custom||[]).map((x,i)=>({x,i})).filter(({x})=>x.type==='Recharge'&&(!$('category').value||(x.category||'itunes')===$('category').value)).map(({x,i})=>[String(i),x.label]));}
 $('fx').value=state.settings.fx||'';renderEffectiveFx();const market=state.market;$('market-rate').textContent=market?.usable?`Bitkub ${market.price} บาท · รวมค่าเผื่อ ${(market.price*(1+state.settings.purchaseFee/100)).toFixed(6)} บาท/USDT${market.error?' · '+market.error:''}`:(market?.error||'กำลังดึงเรท Bitkub')+' · รอเรทใหม่ก่อนคำนวณราคาขาย';
 $('source-list').textContent=(snap?.sources||[]).map(x=>x.id+' · '+x.name+' · '+(x.usable?'พร้อมใช้งาน':'ยังไม่มีข้อมูล / หมดอายุ')).join('\n');
 renderTable();renderSales();renderCustom();renderMarkupOptions();
}
function filtered(){let rows=tab==='recharge'?(state.snapshot?.recharge||[]):(state.snapshot?.accounts||[]);const query=$('search').value.toLowerCase();return rows.filter(x=>(!$('source-filter').value||x.sourceId===$('source-filter').value)&&(!$('category').value||(x.category||'itunes')===$('category').value)&&(!query||`${x.label} ${x.country} ${names[x.country]||''}`.toLowerCase().includes(query))&&(!$('country').value||x.country===$('country').value)&&(tab==='recharge'||((!$('type').value||x.type===$('type').value)&&(!$('stockOnly').checked||x.stock>0)&&($('age').value==='eligible'?x.age!=='0-1':!$('age').value||x.age===$('age').value))));}
function rechargeGroups(rows){
 const groups=new Map();
 for(const row of rows){
  const cost=money(row)/row.denomination;
  const sale=sell(row)===null?null:formatSaleRate(sell(row)/row.denomination);
  const key=JSON.stringify([row.sourceId,row.category||'itunes',row.country,row.channel,sale??cost.toFixed(4)]);
  if(!groups.has(key))groups.set(key,{...row,unitCost:cost,unitSale:sale,costs:new Set(),queues:new Set()});
  groups.get(key).queues.add(Number(row.queueAmount));groups.get(key).costs.add(cost);
 }
 return [...groups.values()];
}
function renderRechargeTable(){
 const rows=rechargeGroups(filtered());page=Math.max(0,Math.min(page,Math.ceil(rows.length/pageSize)-1));$('count').textContent=rows.length+' เรทเติม';
 const head=document.createElement('tr');for(const title of ['สินค้า / ประเทศ','ช่องทาง','ต้นทุน / หน่วย','ต้นทุนบาท / หน่วย','กำไรที่บวก (%)','ขายบาท / หน่วย','ยอดรอคิว']){const th=document.createElement('th');th.textContent=title;head.append(th);}$('thead').replaceChildren(head);$('tbody').replaceChildren();
 for(const x of rows.slice(page*pageSize,(page+1)*pageSize)){
  const tr=document.createElement('tr');cell(tr,(x.category||'itunes').toUpperCase()+' · '+x.country+' · '+(names[x.country]||x.country));cell(tr,(x.sourceId||'')+' · '+x.channel);const costs=[...x.costs].map(Number);cell(tr,(Math.min(...costs)===Math.max(...costs)?Math.min(...costs).toFixed(4):Math.min(...costs).toFixed(4)+'–'+Math.max(...costs).toFixed(4))+' '+currency(x),'money');const effectiveFx=state.settings.fx*(1+(state.settings.purchaseFee??0.251)/100);const thbCosts=costs.map(c=>c*effectiveFx);cell(tr,state.settings.fx>0&&(x.usdPerUsdt??state.snapshot?.usdPerUsdt)>0?(Math.min(...thbCosts).toFixed(4)===Math.max(...thbCosts).toFixed(4)?Math.min(...thbCosts).toFixed(4):Math.min(...thbCosts).toFixed(4)+'–'+Math.max(...thbCosts).toFixed(4)):'—');cell(tr,String(markupFor(x))+'%');cell(tr,x.unitSale??'—');cell(tr,[...x.queues].map(q=>nf.format(q)).join(' / '));$('tbody').append(tr);
 }
 if(!rows.length){const tr=document.createElement('tr');cell(tr,'ไม่มีรายการตามตัวกรองนี้').colSpan=7;$('tbody').append(tr);}
 $('page-info').textContent=rows.length?`${page*pageSize+1}–${Math.min((page+1)*pageSize,rows.length)} จาก ${rows.length} เรทเติม`:'ไม่มีข้อมูล';$('prev').disabled=page===0;$('next').disabled=(page+1)*pageSize>=rows.length;
}
function renderTable(){if(!state)return;if(tab==='recharge'){renderRechargeTable();return;}const recharge=false;const rows=filtered();page=Math.max(0,Math.min(page,Math.ceil(rows.length/pageSize)-1));$('count').textContent=rows.length+' ตัวเลือก';
 const head=document.createElement('tr');for(const name of ['ประเทศ / สินค้า',recharge?'ยอดเติม':'ยอดบัญชี',recharge?'ช่องทาง':'อายุจริง',recharge?'ยอดรอคิว':'สต็อก',`ต้นทุน ${currency()}`,'ต้นทุนบาท / หน่วย','กำไรที่บวก (%)','ขายบาท / หน่วย','ขายรวม / บาท']){const th=document.createElement('th');th.textContent=name;head.append(th);}$('thead').replaceChildren(head);$('tbody').replaceChildren();
 for(const x of rows.slice(page*pageSize,(page+1)*pageSize)){const tr=document.createElement('tr');const first=cell(tr,`${x.country} · ${names[x.country]||x.country}`);const sub=document.createElement('small');sub.textContent=(x.category||'itunes').toUpperCase()+' · '+(x.sourceId||'')+' · '+x.type+' · '+x.label;first.append(sub);cell(tr,nf.format(x.denomination)+' '+x.currencySymbol);cell(tr,recharge?x.channel:x.type==='Card'?'บัตร':x.age+(x.age==='9+'?'':' วัน'));cell(tr,nf.format(recharge?x.queueAmount:x.stock),!recharge&&x.stock?'positive':'');cell(tr,nf.format(money(x))+' '+currency(x),'money');const unitCost=state.settings.fx>0&&(x.usdPerUsdt??state.snapshot?.usdPerUsdt)>0?money(x)*state.settings.fx*(1+(state.settings.purchaseFee??0.251)/100)/x.denomination:null;cell(tr,unitCost===null?'—':unitCost.toFixed(4));cell(tr,String(markupFor(x))+'%');cell(tr,sell(x)===null?'—':(Math.ceil((sell(x)/x.denomination-1e-10)*10000)/10000).toFixed(4));cell(tr,sell(x)===null?'—':nf.format(Math.ceil(sell(x)*100)/100));$('tbody').append(tr);}
 if(!rows.length){const tr=document.createElement('tr'),td=cell(tr,'ไม่มีรายการตามตัวกรองนี้');td.colSpan=9;$('tbody').append(tr);}
 $('page-info').textContent=rows.length?`${page*pageSize+1}–${Math.min((page+1)*pageSize,rows.length)} จาก ${rows.length} ตัวเลือก`:'ไม่มีข้อมูล';$('prev').disabled=page===0;$('next').disabled=(page+1)*pageSize>=rows.length;
}
function renderSales(){
 const ready=!!state.snapshot&&state.settings.fx>0&&state.snapshot.usdPerUsdt>0;
 $('copy').disabled=!ready;
 $('sales').placeholder=!state.snapshot?'อัปเดตข้อมูลสินค้าก่อน':!(state.settings.fx>0)?'กำลังรอเรทใหม่จาก Bitkub เพื่อสร้างข้อความขายเป็นบาท':'ยังยืนยันเรต USDT จากระบบไม่ได้ กรุณาอัปเดตข้อมูลอีกครั้ง';
 if(!ready){$('sales').value='';return;}
 const selected=$('sales-category').value;
 try{const source=$('sales-source').value;const snap=source?{...state.snapshot,accounts:state.snapshot.accounts.filter(x=>x.sourceId===source),recharge:state.snapshot.recharge.filter(x=>x.sourceId===source)}:state.snapshot;$('sales').value=productSalesText(snap,selected,x=>{const price=sell(x);if(price===null)throw new Error('Waiting for source exchange rate');return price/x.denomination;});}catch(e){$('sales').value='';$('copy').disabled=true;$('copy').title=e.message;}
}

function renderCustom(){const x=state?.snapshot?.custom?.[Number($('custom-product').value)];if(!x){$('custom-result').textContent='ยังไม่มีข้อมูล';return;}const amount=Number($('custom-amount').value),min=Number(x.minAmount),max=Number(x.maxAmount),multiple=Number(x.multiple);const hint=`ยอด ${nf.format(min)}–${nf.format(max)}${multiple>0?' · เพิ่มทีละ '+multiple:''}`;if(!amount){$('custom-result').textContent=hint;return;}if(amount<min||amount>max||(multiple>0&&Math.abs(amount/multiple-Math.round(amount/multiple))>1e-7)){$('custom-result').textContent=hint+' · ยอดไม่อยู่ในเงื่อนไข';return;}const cost=(amount*Number(x.cnRate)/Number(x.configRate)*(1+Number(x.premiums[$('custom-level').value]))).toFixed(2),row={...x,paymentUsd:cost};$('custom-result').textContent=`ต้นทุน ${nf.format(money(row))} ${currency(row)}${sell(row)===null?'':' · ราคาขาย '+nf.format(Math.ceil(sell(row)*100)/100)+' บาท'}`;}
function changeTab(next){tab=next;page=0;const titles={accounts:'บัญชีพร้อมยอด',recharge:'เติมบัญชี',sales:'ข้อความขาย',setting:'Setting'};$('title').textContent=titles[tab];$('count').hidden=tab==='setting';$('section-title').textContent=tab==='setting'?'กำไรตามสินค้าและประเทศ':tab==='recharge'?'ยอดเติมและช่องทาง · ยอดรอคิวไม่ใช่สต็อก':tab==='sales'?'ข้อความพร้อมคัดลอก':'รายการบัญชี';document.querySelectorAll('nav button').forEach(b=>b.classList.toggle('active',b.dataset.tab===tab));$('sales-view').hidden=tab!=='sales';$('setting-view').hidden=tab!=='setting';$('settings-panel').hidden=tab!=='setting';document.querySelector('.workspace').classList.toggle('setting-mode',tab==='setting');$('table-view').hidden=['sales','setting'].includes(tab);$('filters').hidden=['sales','setting'].includes(tab);$('custom-view').hidden=tab!=='recharge';for(const id of ['type','age'])$(id).hidden=tab!=='accounts';$('stockOnly').parentElement.hidden=tab!=='accounts';renderTable();}
document.querySelectorAll('nav button').forEach(b=>b.onclick=()=>changeTab(b.dataset.tab));for(const id of ['search','country','category','type','age','stockOnly','source-filter'])$(id).addEventListener('input',()=>{page=0;lastSnapshot='';render();});$('prev').onclick=()=>{page--;renderTable();};$('next').onclick=()=>{page++;renderTable();};for(const id of ['custom-product','custom-amount','custom-level'])$(id).addEventListener('input',renderCustom);
function openLogin(){$('email').value=state?.account.email||'';$('login').showModal();}
 $('account').onclick=openLogin;$('close-login').onclick=()=>$('login').close();$('sync').onclick=async()=>{if(!state.account.configured){openLogin();return;}try{toast='';await post('/api/sync');await refresh();}catch(e){error(e);}};$('stop').onclick=async()=>{try{await post('/api/stop');await refresh();}catch(e){error(e);}};
 $('settings').onsubmit=async e=>{e.preventDefault();try{await post('/api/settings',{...Object.fromEntries(['fx','purchaseFee','markup','fee','interval'].map(k=>[k,Number($(k).value)])),countryMarkups:{},productMarkups:{},categoryCountryMarkups:draftCountries,itunesAgeMarkups:draftAges});toast='';await refresh();$('setting-status').textContent='บันทึกการตั้งค่าแล้ว';}catch(err){error(err);}};
 $('login-form').onsubmit=async e=>{e.preventDefault();try{await post('/api/account',{email:$('email').value,password:$('password').value,remember:$('remember').checked});$('password').value='';$('login').close();toast='';await refresh();}catch(err){$('login-error').textContent=err.message;}};
 $('copy').onclick=async()=>{try{await navigator.clipboard.writeText($('sales').value);$('copy').textContent='คัดลอกแล้ว';setTimeout(()=>$('copy').textContent='คัดลอกข้อความขาย',1800);}catch{$('sales').select();toast='เลือกข้อความไว้แล้ว กด Ctrl+C เพื่อคัดลอก';render();}};
async function refresh(){const r=await fetch('/api/state');if(!r.ok)throw new Error('ติดต่อโปรแกรมไม่ได้');state=await r.json();render();}
let draftCountries={},draftAges={};
function markupRows(){return [...(state.snapshot?.accounts||[]),...(state.snapshot?.recharge||[]),...(state.snapshot?.custom||[])];}
let settingTableKey='';
function renderMarkupOptions(){
 const keys=[...new Set([...markupRows().map(x=>(x.category||'itunes')+':'+x.country),...Object.keys(draftCountries),...Object.keys(draftAges).map(k=>'itunes:'+k.split(':')[0])])].sort();
 const stamp=JSON.stringify([keys,state.settings.categoryCountryMarkups,state.settings.countryMarkups,state.settings.itunesAgeMarkups,state.settings.markup]);
 if(stamp===settingTableKey)return;settingTableKey=stamp;
 $('setting-rows').replaceChildren();
 for(const key of keys){
  const [category,country]=key.split(':');const tr=document.createElement('tr');
  cell(tr,({itunes:'iTunes',xbox:'Xbox',razer:'Razer',mycard:'MyCard'})[category]||category);cell(tr,country+' · '+(names[country]||country));
  const saved=state.settings.categoryCountryMarkups?.[key]??(category==='itunes'?state.settings.countryMarkups?.[country]:undefined);
  const base=saved??state.settings.markup;cell(tr,base+'%');
  const checks=[];
  function addInput(map,id,stored,label,fallback){
   const td=cell(tr,'');const input=document.createElement('input');input.type='number';input.min='0';input.max='1000';input.step='any';input.setAttribute('form','settings');input.setAttribute('aria-label',label);input.placeholder='ใช้ '+fallback+'%';input.value=map[id]??'';td.append(input);
   const note=document.createElement('small');note.textContent='บันทึก: '+(stored??fallback)+'%'+(stored===undefined?' (ตามค่าพื้นฐาน)':'');td.append(note);
   checks.push(()=>map[id]!==stored);
   input.oninput=()=>{if(input.value==='')delete map[id];else map[id]=Number(input.value);update();$('setting-status').textContent='มีการแก้ไข กดบันทึกการตั้งค่าทั้งหมด';};
  }
  addInput(draftCountries,key,saved,'กำไร '+category+' '+country,state.settings.markup);
  for(const age of ['1+','5+','9+']){
   if(category==='itunes')addInput(draftAges,country+':'+age,state.settings.itunesAgeMarkups?.[country+':'+age],'กำไร iTunes '+country+' '+age,base);
   else cell(tr,'—');
  }
  const status=cell(tr,'');function update(){status.textContent=checks.some(check=>check())?'ยังไม่บันทึก':'บันทึกแล้ว';}update();
  $('setting-rows').append(tr);
 }
}
$('sales-category').onchange=renderSales;$('sales-source').onchange=renderSales;
$('purchaseFee').addEventListener('input',renderEffectiveFx);
async function poll(){try{await refresh();}catch(e){error(e);}setTimeout(poll,state?.job.running?1200:4000);}poll();


$('admin-form').onsubmit=async e=>{e.preventDefault();try{await post('/api/admin',{currentPassword:$('admin-current').value,username:$('admin-name').value,password:$('admin-password').value});$('admin-current').value='';$('admin-password').value='';$('admin-status').textContent='บันทึกแล้ว เมื่อระบบถามให้เข้าสู่ระบบด้วยบัญชีใหม่';}catch(err){$('admin-status').textContent=err.message;}};

$('sales-api-key').onclick=async()=>{if(!confirm('สร้าง API key ใหม่? คีย์เดิมจะใช้ไม่ได้'))return;try{const result=await post('/api/sales-key');$('sales-api-token').value=result.key;$('sales-api-status').textContent='คัดลอกคีย์เก็บไว้ แสดงเฉพาะครั้งนี้ ใช้อ่านข้อความขายเท่านั้น';}catch(err){$('sales-api-status').textContent=err.message;}};
$('sales-api-url').textContent=location.origin+'/api/sales/itunes';

$('sales-api-copy').onclick=async()=>{try{if(!$('sales-api-token').value)throw new Error('สร้างคีย์ก่อน หรือใช้คีย์ที่คุณเก็บไว้');await navigator.clipboard.writeText($('sales-api-token').value);$('sales-api-status').textContent='คัดลอกคีย์แล้ว';}catch(err){$('sales-api-status').textContent=err.message;}};

$('source-form').onsubmit=async e=>{e.preventDefault();try{const r=await post('/api/sources',{id:$('source-id').value,name:$('source-name').value});$('source-token').value=r.key;$('source-status').textContent='PUT '+location.origin+'/api/sources/'+r.id+'/inventory';await refresh();}catch(e){$('source-status').textContent=e.message;}};
$('source-rotate').onclick=async()=>{if(!confirm('เปลี่ยนคีย์แหล่งข้อมูลนี้? คีย์เดิมจะใช้ไม่ได้'))return;try{const r=await post('/api/sources/rotate',{id:$('source-id').value});$('source-token').value=r.key;$('source-status').textContent='เปลี่ยนคีย์แล้ว กรุณาคัดลอกเก็บไว้';}catch(e){$('source-status').textContent=e.message;}};
$('source-copy').onclick=async()=>{try{if(!$('source-token').value)throw new Error('สร้างคีย์ก่อน');await navigator.clipboard.writeText($('source-token').value);$('source-status').textContent='คัดลอกคีย์แล้ว';}catch(e){$('source-status').textContent=e.message;}};
