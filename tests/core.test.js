const {test}=require('node:test');
const assert=require('node:assert/strict');
const {evaluate,convert,format,Calculator}=require('../app/src/main/assets/core.js');
const near=(actual,expected)=>assert.ok(Math.abs(actual-expected)<=Math.max(1e-10,Math.abs(expected)*1e-12),`${actual} != ${expected}`);
test('basic arithmetic and precedence, decimal comma, unary negatives',()=>{
  for(const [input,want] of [['2+3*4',14],['100/4-7',18],['0,1+0,2',0.3],['-5*-2',10],['50+-10',40],['50--10',60],['(2+3)*4',20],['1e-7*10',0.000001]]) near(evaluate(input),want);
});
test('calculator percentages use familiar discount/tip semantics',()=>{
  for(const [input,want] of [['100+10%',110],['200-15%',170],['200*15%',30],['200/50%',400],['25%',0.25],['100+10%+10%',121]]) near(evaluate(input),want);
});
test('invalid arithmetic does not produce a misleading result',()=>{
  for(const input of ['1/0','0/0','1+','NaN','Infinity','2**4','1;alert(1)','1e99','(1+2']) assert.throws(()=>evaluate(input),input);
});
test('cross rates use a common base without intermediate rounding',()=>{
  const rates={USD:1,PLN:3.73,EUR:0.86,BYN:3.04,RUB:84};
  near(convert(100,'USD','PLN',rates),373);
  near(convert(100,'PLN','BYN',rates),100/3.73*3.04);
  for(const from of Object.keys(rates)) for(const to of Object.keys(rates)) near(convert(convert(123.456789,from,to,rates),to,from,rates),123.456789);
  assert.throws(()=>convert(1,'USD','ABC',rates));
  assert.throws(()=>convert(1,'USD','PLN',{USD:0,PLN:3}));
  assert.throws(()=>convert(NaN,'USD','USD',rates));
  assert.equal(convert(20,'PLN','PLN',null),20);
});
test('keypad edits, operator replacement and new input after equals',()=>{
  const c=new Calculator();
  for(const key of ['1','2','.','5','+','*','2','=']) c.press(key);
  assert.equal(c.value,25); c.press('3'); assert.equal(c.value,3);
  c.press('BACK');assert.equal(c.value,0);
  c.press(',');c.press(',');c.press('5');assert.equal(c.value,0.5);
  c.press('AC');assert.equal(c.expression,'0');
});
test('plus-minus toggles the last operand including after an operator',()=>{
  const c=new Calculator('100+20');c.press('+/-');assert.equal(c.value,80);
  c.press('+/-');assert.equal(c.value,120);
  c.press('AC');c.press('5');c.press('+/-');assert.equal(c.value,-5);
  c.press('+/-');assert.equal(c.value,5);
  c.press('+');c.press('+/-');c.press('2');assert.equal(c.value,3);
});
test('incomplete expression previews previous operand; equals reports error',()=>{
  const c=new Calculator('125+');assert.equal(c.value,125);assert.equal(c.error,null);
  assert.ok(c.press('=').error);assert.equal(c.expression,'125+');c.press('2');assert.equal(c.value,127);
  const d=new Calculator('10/0');assert.equal(d.value,null);assert.match(d.error,/ноль/);d.press('BACK');d.press('2');assert.equal(d.value,5);
});
test('setValue keeps precision for currency switching and next digit replaces amount',()=>{
  const c=new Calculator();c.setValue(123.456789012);near(c.value,123.456789012);c.press('4');assert.equal(c.value,4);
  c.setValue(0.0000001);near(c.value,1e-7);c.press('*');c.press('1');c.press('0');near(c.value,1e-6);
});
test('formatted display is localized with grouping and two decimals',()=>{
  assert.equal(format(1234.5).replace(/[\u00a0\u202f]/g,' '),'1 234,50');
  assert.equal(format(null),'—');assert.equal(format(-0),'0,00');
});
