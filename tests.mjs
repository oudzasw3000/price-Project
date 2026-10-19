import test from 'node:test';
import assert from 'node:assert/strict';
import {parseProduct,parseAge,payment,formatQuotes} from './format.mjs';
test('whole and split product labels',()=>{
  assert.equal(parseProduct('🇬🇧 (UK) balance [500]Stock: 90').denomination,500);
  assert.equal(parseProduct('🇲🇽 (MX) balance 9900Stock: 15').country,'MX');
});
test('age stock and payment parsing',()=>{
  assert.deepEqual(parseAge(' +0.8% 5-9 daysStock 27'),{age:'5-9',stock:27});
  assert.equal(payment('Payment Amount\n$1,234.56\nConfirm'),'1234.56');
  assert.throws(()=>payment('Loading'));
});
test('different costs remain separate 1+ rows; 9+ placeholder stays; no timestamp',()=>{
  const rows=[{country:'UK',age:'1-5',denomination:500,stock:63,paymentUsd:'471.47'},{country:'UK',age:'5-9',denomination:500,stock:27,paymentUsd:'473.82'},{country:'UK',age:'0-1',denomination:500,stock:3,paymentUsd:'470.00'}];
  const output=formatQuotes(rows,['UK','DE'],1);
  assert.match(output,/500\*63.*471.47/); assert.match(output,/500\*27.*473.82/);
  assert.ok(!output.includes('500*90'));assert.ok(!output.includes('470.00'));
  assert.match(output,/itunes uk 9\+ :/); assert.match(output,/itunes de 1\+ :\nitunes de 9\+ :/);
});
