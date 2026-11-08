const functions = {
  sqrt: [1, 'sqrt'], nroot: [2, 'nroot'], abs: [1, 'abs'], exp: [1, 'exp'],
  ln: [1, 'ln'], lg: [1, 'lg'], log: [[1, 2], 'log'],
  sin: [1, 'sin'], cos: [1, 'cos'], tan: [1, 'tan'],
  asin: [1, 'asin'], acos: [1, 'acos'], atan: [1, 'atan'],
};

const tokenPattern = /\d+(?:\.\d*)?|\.\d+|nroot|sqrt|abs|exp|log|ln|lg|asin|acos|atan|sin|cos|tan|pi|[xyπeℯ+*/^(),-]/gy;
const superscript = '⁰¹²³⁴⁵⁶⁷⁸⁹';

export function normalizeFormula(text) {
  let openAbsolute = false;
  const normalized = text
    .replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+/g, (match) => `^(${Array.from(match, (char) => char === '⁻' ? '-' : superscript.indexOf(char)).join('')})`)
    .normalize('NFKC')
    .replace(/[−–]/g, '-').replace(/[×·⋅\u2062]/g, '*').replace(/÷/g, '/')
    .replace(/[\u2061\u2063]/g, '').replace(/\s/g, '').replace(/√(?=\()/g, 'sqrt')
    .replace(/\|/g, () => (openAbsolute = !openAbsolute) ? 'abs(' : ')');
  if (openAbsolute) throw new Error('请补全绝对值的竖线。');
  return normalized;
}

function parse(input) {
  const tokens = [];
  tokenPattern.lastIndex = 0;
  while (tokenPattern.lastIndex < input.length) {
    const index = tokenPattern.lastIndex;
    const match = tokenPattern.exec(input);
    if (!match) throw new Error(`暂不支持「${input.slice(index, index + 12)}」。请检查变量和函数名称。`);
    tokens.push(match[0]);
  }

  let index = 0;
  const peek = () => tokens[index];
  const take = () => tokens[index++];

  function expect(token) {
    if (peek() !== token) throw new Error(`公式缺少「${token}」。`);
    take();
  }

  function atom() {
    const token = take();
    if (token === '(') {
      const expression = sum();
      expect(')');
      return expression;
    }
    if (Object.hasOwn(functions, token)) {
      expect('(');
      const args = [sum()];
      while (peek() === ',') {
        take();
        args.push(sum());
      }
      expect(')');
      const [arity, name] = functions[token];
      if (![arity].flat().includes(args.length)) throw new Error(`${token} 的参数数量有误。`);
      return { call: name === 'log' && args.length === 1 ? 'lg' : name, args };
    }
    if (token && /^[\d.]/.test(token) && Number.isFinite(Number(token))) return { number: token };
    if (token === 'x' || token === 'y') return { variable: token };
    if (['π', 'pi', 'e', 'ℯ'].includes(token)) return { constant: token === 'pi' || token === 'π' ? 'π' : 'ℯ' };
    throw new Error('公式不完整。请检查括号和运算符。');
  }

  function unary() {
    if (peek() === '+' || peek() === '-') return { sign: take(), child: unary() };
    const base = atom();
    if (peek() !== '^') return base;
    take();
    return { op: '^', left: base, right: unary() };
  }

  function product() {
    let left = unary();
    while (peek()) {
      const next = peek();
      if (next === '*' || next === '/') {
        left = { op: take(), left, right: unary() };
      } else if (next === '(' || /^[a-zπℯ]$/.test(next) || next === 'pi' || Object.hasOwn(functions, next)) {
        left = { op: '*', left, right: unary() };
      } else break;
    }
    return left;
  }

  function sum() {
    let left = product();
    while (peek() === '+' || peek() === '-') left = { op: take(), left, right: product() };
    return left;
  }

  const result = sum();
  if (index !== tokens.length) throw new Error(`请检查「${peek()}」前后的运算符或括号。`);
  return result;
}

function usesY(node) {
  if (node.variable) return node.variable === 'y';
  if (node.args) return node.args.some(usesY);
  if (node.child) return usesY(node.child);
  return node.op ? usesY(node.left) || usesY(node.right) : false;
}

function degree(node) {
  if (node.variable) return 1;
  if (node.child) return degree(node.child);
  if (node.args) return node.args.every((arg) => degree(arg) === 0) ? 0 : Infinity;
  if (!node.op) return 0;
  const left = degree(node.left);
  const right = degree(node.right);
  if (left === 0 && right === 0) return 0;
  if (node.op === '+' || node.op === '-') return Math.max(left, right);
  if (node.op === '*') return left + right;
  if (node.op === '/') return right === 0 ? left : Infinity;
  const exponent = Number(node.right.number);
  return Number.isSafeInteger(exponent) && exponent >= 0 ? (exponent === 0 ? 0 : left * exponent) : Infinity;
}

function emit(node) {
  if (node.op) return `(${emit(node.left)}${node.op}${emit(node.right)})`;
  if (node.child) return `(${node.sign}${emit(node.child)})`;
  if (node.args) return `${node.call}(${node.args.map(emit).join(',')})`;
  return node.variable ?? node.number ?? node.constant;
}

export function compileFormula(text) {
  if (text.length > 350) throw new Error('公式过长，请分成多条曲线输入。');
  const normalized = normalizeFormula(text);
  if (!normalized) throw new Error('请输入公式。');
  const parts = normalized.split('=');
  if (parts.length > 2) throw new Error('每次请输入一个函数或方程。');
  const right = parse(parts.at(-1));
  const functionName = /^[a-z][a-z\d]*\(x\)$/.test(parts[0]);
  if (parts.length === 1 || (parts[0] === 'y' && !usesY(right)) || functionName) {
    if (usesY(right)) throw new Error('请写成 y=f(x)，或输入含 x、y 的二次方程。');
    return { kind: 'function', polynomial: Number.isFinite(degree(right)), expression: emit(right) };
  }
  const left = parse(parts[0]);
  const maxDegree = Math.max(degree(left), degree(right));
  if (!maxDegree || maxDegree > 2) throw new Error('请写成 y=f(x)，或输入含 x、y 的二次方程。');
  return { kind: 'equation', polynomial: true, expression: `${emit(left)}=${emit(right)}` };
}
