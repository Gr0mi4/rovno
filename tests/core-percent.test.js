const {test}=require('node:test');
const assert=require('node:assert/strict');
const {evaluate,Calculator,formatAmount,copyText,hasRate,fractionDigits}=require('../app/src/main/assets/core.js');
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<=Math.max(1e-10,Math.abs(expected)*1e-12),`${actual} != ${expected}`);

test('additive percent materializes before multiply or divide',()=>{
  const calculator=new Calculator();
  for(const key of ['1','0','0','+','1','0','%','*','2','=']) calculator.press(key);
  assert.equal(calculator.value,220);
  const discount=new Calculator();
  for(const key of ['2','0','0','-','1','5','%','/','2','=']) discount.press(key);
  assert.equal(discount.value,85);
});

test('multiplicative percent stays attached to the product operand',()=>{
  near(evaluate('200*15%'),30);
  const calculator=new Calculator();
  for(const key of ['2','0','0','*','1','5','%','+','5','=']) calculator.press(key);
  assert.equal(calculator.value,35);
});

test('formatAmount shows small converted values with useful precision',()=>{
  const tiny=1/24500;
  assert.notEqual(formatAmount(tiny,'USD'),'0,00');
  assert.match(formatAmount(tiny,'USD'),/0,0+\d/);
  assert.equal(formatAmount(1234.5,'EUR').replace(/[\u00a0\u202f]/g,' '),'1 234,50');
});

test('copyText preserves meaningful digits for zero-decimal currencies',()=>{
  const text=copyText(0.0042,'JPY');
  assert.ok(text.includes('0,004') || text.includes('0.004'));
});

test('hasRate and fractionDigits helpers',()=>{
  const rates={USD:1,PLN:4,EUR:0.9};
  assert.equal(hasRate('PLN',rates),true);
  assert.equal(hasRate('GBP',rates),false);
  assert.equal(fractionDigits('JPY'),0);
  assert.equal(fractionDigits('KWD'),3);
  assert.equal(fractionDigits('PLN'),2);
});
