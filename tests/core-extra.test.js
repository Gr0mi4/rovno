const {test}=require('node:test');
const assert=require('node:assert/strict');
const {Calculator,convert}=require('../app/src/main/assets/core.js');

function enter(keys) {
  const calculator=new Calculator();
  for (const key of keys) calculator.press(key);
  return calculator;
}

test('equals preserves all 15 accepted digits, including monetary decimals',()=>{
  for (const input of ['123456789012345','999999999999999','1234567890123.45']) {
    const calculator=enter(input);
    const before=calculator.value;
    assert.equal(before,Number(input),'the original input must be represented correctly');
    calculator.press('=');
    assert.equal(calculator.value,before,`${input} must not change merely by pressing equals`);
  }
});

test('the sixteenth digit is ignored without modifying the accepted amount',()=>{
  const calculator=enter('123456789012345');
  calculator.press('6');
  assert.equal(calculator.expression,'123456789012345');
  assert.equal(calculator.value,123456789012345);
});

test('setValue preserves the 15-digit amount when selecting a currency',()=>{
  const calculator=new Calculator();
  for(const value of [123456789012345,1234567890123.45,-1234567890123.45]) {
    calculator.setValue(value);
    assert.equal(calculator.value,value,'selecting a row must not change its amount');
    calculator.press('4');
    assert.equal(calculator.value,4,'the first new digit replaces the selected amount');
  }
});

test('plus-minus starts a negative right operand after each binary operator',()=>{
  for (const [operator,want] of [['+',98],['-',102],['*',-200],['/',-50]]) {
    const calculator=enter(['1','0','0',operator,'+/-','2','=']);
    assert.equal(calculator.error,null);
    assert.equal(calculator.value,want,`100 ${operator} (-2)`);
  }
});

test('a percent discount can change sign and continue through equals',()=>{
  const calculator=enter(['2','0','0','-','1','0','%']);
  assert.equal(calculator.value,180);
  calculator.press('+/-');
  assert.equal(calculator.value,220);
  calculator.press('+/-');
  assert.equal(calculator.value,180);
  calculator.press('=');
  for(const key of ['+','1','0','%','=']) calculator.press(key);
  assert.equal(calculator.value,198);
});

test('currency-selection round trips preserve ordinary amounts below one cent',()=>{
  const rates={USD:1,PLN:3.7296754,EUR:0.86196148,BYN:3.04144488,RUB:83.96027179};
  for(const from of Object.keys(rates)) for(const to of Object.keys(rates)) {
    const original=12345.67;
    const calculator=new Calculator();
    calculator.setValue(convert(original,from,to,rates));
    calculator.setValue(convert(calculator.value,to,from,rates));
    assert.ok(Math.abs(calculator.value-original)<0.000001,`${from} -> ${to} -> ${from}`);
  }
});
