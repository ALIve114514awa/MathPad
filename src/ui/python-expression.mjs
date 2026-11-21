import { emitExpression } from './expression.mjs';

// Parse a mathematical subset of Python. No Python/JavaScript code is evaluated.
const tokensPattern = /\s+|(?:\d(?:_?\d)*(?:\.(?:\d(?:_?\d)*)?)?|\.\d(?:_?\d)*)(?:[eE][+-]?\d(?:_?\d)*)?|[A-Za-z_][A-Za-z_0-9]*|\*\*|==|[+*/(),.=\-]/gy;
const unaryCalls = new Set(['sqrt', 'sin', 'cos', 'tan', 'asin', 'acos', 'atan', 'exp']);
const call = (name, ...args) => ({ call: name, args });
const binary = (op, left, right) => ({ op, left, right });
const number = value => ({ number: String(value) });
const usesY = node => node.variable === 'y' || Boolean(node.child && usesY(node.child)) || Boolean(node.args?.some(usesY)) || Boolean(node.op && (usesY(node.left) || usesY(node.right)));

function numericLiteral(token) {
  const value = token.replaceAll('_', '');
  if (!Number.isFinite(Number(value))) throw new Error('数值常量过大，请使用有限的实数。');
  if (/^0\d+$/.test(value) && /[1-9]/.test(value)) throw new Error('Python 整数不能有多余的前导零。');
  const [mantissa, exponent] = value.toLowerCase().split('e');
  if (exponent === undefined) return number(mantissa);
  const signedExponent = exponent.startsWith('-') ? { sign: '-', child: number(exponent.slice(1)) } : number(exponent.replace(/^\+/, ''));
  return binary('*', number(mantissa), binary('^', number(10), signedExponent));
}

export function pythonToFormula(source) {
  if (typeof source !== 'string' || source.length > 350) throw new Error('Python 表达式请控制在 350 个字符以内。');
  let text = source.trim();
  if (!text) throw new Error('请输入 Python 数学表达式。');
  const lambda = /^lambda\b/.test(text);
  if (lambda) {
    const match = /^lambda\s+x\s*:\s*([\s\S]+)$/.exec(text);
    if (!match) throw new Error('匿名函数请写成 lambda x: 表达式。');
    text = match[1];
  }
  if (text.includes('^')) throw new Error('Python 中乘方使用 **；^ 是按位异或，请改成例如 x**2。');
  if (text.includes('//') || text.includes('%')) throw new Error('当前 Python 数学输入暂不支持 // 整除或 % 取余，请使用下方列出的运算。');
  const tokens = [];
  tokensPattern.lastIndex = 0;
  while (tokensPattern.lastIndex < text.length) {
    const position = tokensPattern.lastIndex;
    const match = tokensPattern.exec(text);
    if (!match) throw new Error(`无法读取「${text.slice(position, position + 12)}」。当前支持下方说明中的 Python 数学写法。`);
    if (!/^\s+$/.test(match[0])) tokens.push(match[0]);
  }
  let index = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];
  function expect(expected) {
    if (take() !== expected) throw new Error(`Python 表达式缺少「${expected}」，请检查括号和参数。`);
  }
  function atom() {
    let token = take();
    if (token === '(') { const node = sum(); expect(')'); return node; }
    if (token && /^[\d.]/.test(token)) return numericLiteral(token);
    if (token === 'x' || token === 'y') return { variable: token };
    const qualified = token === 'math';
    if (qualified) { expect('.'); token = take(); }
    if (token === 'pi') return { constant: 'π' };
    if (token === 'e') return { constant: 'ℯ' };
    if (token === 'tau') return binary('*', number(2), { constant: 'π' });
    const supported = unaryCalls.has(token) || ['abs', 'fabs', 'log', 'log2', 'log10', 'pow'].includes(token);
    if (!supported || (qualified && token === 'abs')) {
      throw new Error(`暂不支持名称「${qualified ? 'math.' : ''}${token ?? ''}」。请使用下方列出的数学函数；绝对值用 abs(x) 或 fabs(x)。`);
    }
    expect('(');
    const args = [];
    if (peek() !== ')') {
      args.push(sum());
      while (peek() === ',') { take(); if (peek() === ')') break; args.push(sum()); }
    }
    expect(')');
    const allowed = token === 'pow' ? [2] : token === 'log' ? [1, 2] : [1];
    if (!allowed.includes(args.length)) throw new Error(`${token} 需要 ${allowed.join(' 或 ')} 个参数。`);
    if (token === 'pow') return binary('^', args[0], args[1]);
    if (token === 'abs' || token === 'fabs') return call('abs', args[0]);
    if (token === 'log') return args.length === 1 ? call('ln', args[0]) : call('log', args[1], args[0]);
    if (token === 'log10') return call('lg', args[0]);
    if (token === 'log2') return call('log', number(2), args[0]);
    return call(token, args[0]);
  }
  function unary() {
    if (peek() === '+' || peek() === '-') return { sign: take(), child: unary() };
    const base = atom();
    if (peek() !== '**') return base;
    take();
    return binary('^', base, unary());
  }
  function product() {
    let node = unary();
    while (peek() === '*' || peek() === '/') node = binary(take(), node, unary());
    return node;
  }
  function sum() {
    let node = product();
    while (peek() === '+' || peek() === '-') node = binary(take(), node, product());
    return node;
  }
  const left = sum();
  if (lambda && usesY(left)) throw new Error('lambda x: 的表达式只能使用自变量 x。');
  let formula = emitExpression(left);
  if (peek() === '=' || peek() === '==') {
    if (lambda) throw new Error('lambda x: 后面只填写函数表达式。');
    const operator = take();
    if (operator === '=' && left.variable !== 'y') throw new Error('Python 模式的方程请使用 ==，例如 x**2+y**2 == 1。');
    const right = sum();
    if (operator === '=' && usesY(right)) throw new Error('y = 后面只填写关于 x 的函数；隐式方程请使用 ==。');
    formula += `=${emitExpression(right)}`;
  }
  if (index !== tokens.length) throw new Error(`请检查「${peek()}」前后的语法；乘法要写 *，每次只输入一个表达式或 == 方程。`);
  return formula;
}
