(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.RovnoCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const CURRENCIES = [
    ['PLN','Польский злотый','zł'],['USD','Доллар США','$'],['EUR','Евро','€'],
    ['BYN','Белорусский рубль','Br'],['RUB','Российский рубль','₽'],
    ['GBP','Британский фунт','£'],['UAH','Украинская гривна','₴'],['CZK','Чешская крона','Kč'],
    ['CHF','Швейцарский франк','Fr'],['GEL','Грузинский лари','₾'],['TRY','Турецкая лира','₺'],
    ['KZT','Казахстанский тенге','₸'],['CNY','Китайский юань','¥'],['JPY','Японская иена','¥'],
    ['AED','Дирхам ОАЭ','د.إ'],['AMD','Армянский драм','֏'],['AUD','Австралийский доллар','A$'],
    ['CAD','Канадский доллар','C$'],['SEK','Шведская крона','kr'],['NOK','Норвежская крона','kr'],
    ['DKK','Датская крона','kr'],['HUF','Венгерский форинт','Ft'],['RON','Румынский лей','lei'],
    ['BRL','Бразильский реал','R$'],['ILS','Израильский шекель','₪'],['INR','Индийская рупия','₹'],
    ['KRW','Южнокорейская вона','₩'],['MDL','Молдавский лей','L'],['MXN','Мексиканское песо','MX$'],
    ['NZD','Новозеландский доллар','NZ$'],['RSD','Сербский динар','дин'],['SGD','Сингапурский доллар','S$'],
    ['THB','Таиландский бат','฿'],['VND','Вьетнамский донг','₫'],['ZAR','Южноафриканский рэнд','R']
  ].map(([code,name,symbol]) => ({code,name,symbol}));
  const DEFAULT_CODES = ['PLN','USD','EUR','BYN','RUB'];
  const ZERO_DECIMAL = new Set(['BIF','CLP','DJF','GNF','ISK','JPY','KMF','KRW','PYG','RWF','UGX','UYI','VND','VUV','XAF','XOF','XPF']);
  const THREE_DECIMAL = new Set(['BHD','IQD','JOD','KWD','LYD','OMR','TND']);
  const clean = x => Object.is(x,-0) ? 0 : x;
  function finite(x) {
    if (!Number.isFinite(x) || Math.abs(x) > 1e18) throw new Error('Слишком большое число');
    return clean(x);
  }
  function fractionDigits(code) {
    if (ZERO_DECIMAL.has(code)) return 0;
    if (THREE_DECIMAL.has(code)) return 3;
    return 2;
  }
  function adaptiveFractionDigits(value, code) {
    const base = fractionDigits(code);
    if (!Number.isFinite(value) || value === 0) return base;
    const abs = Math.abs(value);
    if (base > 0 && abs >= Math.pow(10, -base)) return base;
    if (base === 0 && abs >= 1) return 0;
    let digits = Math.max(base, 2);
    while (digits < 8 && abs < Math.pow(10, -digits)) digits++;
    return Math.min(digits, 8);
  }
  function endsWithAdditivePercent(expression) {
    return /[+-]\d+(?:\.\d+)?%$/.test(expression);
  }
  function evaluate(input) {
    if (typeof input !== 'string' || input.length > 256) throw new Error('Слишком длинное выражение');
    const text = input.replace(/,/g,'.').replace(/×/g,'*').replace(/÷/g,'/').replace(/−/g,'-').replace(/\s/g,'');
    let pos = 0;
    function atom() {
      let sign=1;
      while (text[pos] === '+' || text[pos] === '-') { if(text[pos++] === '-') sign *= -1; }
      let value;
      if (text[pos] === '(') {
        pos++; value = sum().value;
        if(text[pos++] !== ')') throw new Error('Проверьте выражение');
      } else {
        const m = text.slice(pos).match(/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i);
        if (!m) throw new Error('Введите число');
        pos += m[0].length; value=Number(m[0]);
      }
      value *= sign;
      let percent=false;
      while(text[pos] === '%') { pos++; value /= 100; percent=true; }
      return {value:finite(value),percent};
    }
    function product() {
      let left=atom();
      while(text[pos] === '*' || text[pos] === '/') {
        const op=text[pos++], right=atom();
        if(op === '/' && right.value === 0) throw new Error('На ноль делить нельзя');
        left={value:finite(op === '*' ? left.value * right.value : left.value / right.value), percent:false};
      }
      return left;
    }
    function sum() {
      let left=product();
      while(text[pos] === '+' || text[pos] === '-') {
        const op=text[pos++], right=product();
        const value=right.percent ? left.value*right.value : right.value;
        left={value:finite(op === '+' ? left.value+value : left.value-value),percent:false};
      }
      return left;
    }
    if (!text) return 0;
    const result=sum().value;
    if(pos !== text.length) throw new Error('Проверьте выражение');
    return finite(result);
  }
  function convert(amount,from,to,rates) {
    if (!Number.isFinite(amount)) throw new Error('Введите число');
    if (from === to) return clean(amount);
    if (!hasRate(from, rates) || !hasRate(to, rates)) throw new Error('Нет курса для этой валюты');
    return finite(amount / rates[from] * rates[to]);
  }
  function hasRate(code, rates) {
    return !!(rates && Number.isFinite(rates[code]) && rates[code] > 0);
  }
  function format(value,maxFraction=2) {
    if(!Number.isFinite(value)) return '—';
    const digits=Math.max(0,Math.min(10,maxFraction));
    const minDigits = digits === 0 ? 0 : (digits >= 2 ? 2 : 0);
    return new Intl.NumberFormat('ru-RU', {
      minimumFractionDigits: minDigits,
      maximumFractionDigits: digits
    }).format(clean(value));
  }
  function formatAmount(value, code, options) {
    if (!Number.isFinite(value)) return '—';
    const active = options && options.active;
    const forCopy = options && options.forCopy;
    if (active && options && options.rawExpression && /^-?\d+(?:[.,]\d*)?$/.test(options.rawExpression)) {
      const parts = String(options.rawExpression).replace(',', '.').split('.');
      const integer = Number(parts[0]);
      const grouped = Object.is(integer, -0) ? '−0' : format(integer, 0);
      return grouped + (parts.length > 1 ? ',' + parts[1] : '');
    }
    const digits = forCopy
      ? Math.max(adaptiveFractionDigits(value, code), fractionDigits(code) === 0 ? 4 : fractionDigits(code))
      : (active ? Math.max(adaptiveFractionDigits(value, code), 2) : adaptiveFractionDigits(value, code));
    return format(value, digits);
  }
  function copyText(value, code) {
    return formatAmount(value, code, { forCopy: true }).replace(/[\s\u00a0\u202f]/g, '');
  }
  function numberText(value) {
    const text=String(Number(finite(value).toPrecision(15)));
    const scientific=text.match(/^(-?)(\d+)(?:\.(\d+))?e([+-]?\d+)$/i);
    if(!scientific) return text;
    const digits=scientific[2]+(scientific[3]||'');
    const point=scientific[2].length+Number(scientific[4]);
    if(point < -230) return text;
    return scientific[1]+(point<=0 ? '0.'+'0'.repeat(-point)+digits
      : point>=digits.length ? digits+'0'.repeat(point-digits.length)
      : digits.slice(0,point)+'.'+digits.slice(point));
  }
  class Calculator {
    constructor(expression='0') { this.expression=typeof expression === 'string' && expression.length<=256 ? expression : '0'; this.resetNext=false; this.explicitError=null; }
    setValue(value) { this.expression=numberText(value); this.resetNext=true; this.explicitError=null; return this.state(); }
    get value() { return this.state().value; }
    get error() { return this.state().error; }
    state() {
      try {
        let preview=this.expression.replace(/[+*/-]+$/,'');
        if(!preview) preview='0';
        return {expression:this.expression,value:evaluate(preview),error:this.explicitError};
      } catch(e) { return {expression:this.expression,value:null,error:e.message}; }
    }
    press(key) {
      key=({',':'.','×':'*','÷':'/','−':'-','±':'+/-','⌫':'BACK','C':'AC'}[key] || key);
      this.explicitError=null;
      if(key === 'AC') {this.expression='0';this.resetNext=false;return this.state();}
      if(key === '=') {
        try { this.expression=numberText(evaluate(this.expression));this.resetNext=true; }
        catch(e) {this.explicitError=e.message;}
        return this.state();
      }
      if(key === 'BACK') {this.expression=this.expression.slice(0,-1)||'0';this.resetNext=false;return this.state();}
      if(key === '+/-') {
        const m=this.expression.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?%?$/i);
        if(m) {
          const i=m.index, prefix=this.expression.slice(0,i);
          const unary=prefix.endsWith('-') && (prefix.length===1 || /[+*/(-]$/.test(prefix.slice(0,-1)));
          this.expression=unary ? prefix.slice(0,-1)+m[0] : prefix+'-'+m[0];
        } else if(/[+*/-]$/.test(this.expression)) {
          const trailing=this.expression.match(/[+*/-]+$/)[0];
          this.expression=trailing.length>1 && trailing.endsWith('-') ? this.expression.slice(0,-1) : this.expression+'-';
        }
        this.resetNext=false;return this.state();
      }
      if(['+','-','*','/'].includes(key)) {
        if (endsWithAdditivePercent(this.expression)) {
          try { this.expression = numberText(evaluate(this.expression)); }
          catch(e) { this.explicitError = e.message; return this.state(); }
        }
        this.expression=this.expression.replace(/[+*/-]+$/,'') || '0';
        this.expression+=key;this.resetNext=false;return this.state();
      }
      if(key === '%') {
        if(/[\d.)]$/.test(this.expression)) this.expression+='%';
        this.resetNext=false;return this.state();
      }
      if(!/^[0-9.]$/.test(key)) return this.state();
      if(this.resetNext) {this.expression='0';this.resetNext=false;}
      if(this.expression.endsWith('%')) return this.state();
      const last=this.expression.match(/(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i);
      if(last && /e/i.test(last[0])) return this.state();
      if(key === '.' && last && last[0].includes('.')) return this.state();
      if(last && last[0].replace(/\D/g,'').length>=15) return this.state();
      if(this.expression.length>=240) return this.state();
      if(key === '.' && !last) this.expression+='0.';
      else if(last && last[0]==='0' && key !== '.' && !last[0].includes('.')) this.expression=this.expression.slice(0,last.index)+key;
      else this.expression+=key;
      return this.state();
    }
  }
  return {
    CURRENCIES, DEFAULT_CODES, Calculator, evaluate, format, convert, formatAmount, copyText,
    hasRate, fractionDigits, adaptiveFractionDigits, endsWithAdditivePercent
  };
});
