import { parseExpression, normalizeFormula } from './expression.mjs';

function fraction(node) {
  if (node.number && Number.isInteger(Number(node.number))) return [Number(node.number), 1];
  if (node.child) {
    const part = fraction(node.child);
    return part && [part[0] * (node.sign === '-' ? -1 : 1), part[1]];
  }
  if (node.op === '/') {
    const a = fraction(node.left), b = fraction(node.right);
    if (a && b && b[0]) return [a[0] * b[1], a[1] * b[0]];
  }
}

function evaluate(node, x) {
  if (node.number) return Number(node.number);
  if (node.variable) return x;
  if (node.constant) return node.constant === 'π' ? Math.PI : Math.E;
  if (node.child) return (node.sign === '-' ? -1 : 1) * evaluate(node.child, x);
  if (node.op) {
    const a = evaluate(node.left, x), b = evaluate(node.right, x);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return NaN;
    if (node.op === '+') return a + b;
    if (node.op === '-') return a - b;
    if (node.op === '*') return a * b;
    if (node.op === '/') return b === 0 ? NaN : a / b;
    if (a === 0 && b <= 0) return NaN;
    if (a < 0 && !Number.isInteger(b)) {
      const ratio = fraction(node.right);
      if (!ratio) return NaN;
      let [p, q] = ratio;
      const gcd = (u, v) => v ? gcd(v, u % v) : Math.abs(u);
      const divisor = gcd(p, q); p /= divisor; q /= divisor;
      if (Math.abs(q) % 2 !== 1) return NaN;
      return (Math.abs(p) % 2 ? -1 : 1) * Math.pow(-a, b);
    }
    return Math.pow(a, b);
  }
  const args = node.args.map((part) => evaluate(part, x));
  if (!args.every(Number.isFinite)) return NaN;
  const [a, b] = args;
  switch (node.call) {
    case 'ln': return a > 0 ? Math.log(a) : NaN;
    case 'lg': return a > 0 ? Math.log10(a) : NaN;
    case 'log': return a > 0 && a !== 1 && b > 0 ? Math.log(b) / Math.log(a) : NaN;
    case 'tan': return Math.abs(Math.cos(a)) < 1e-12 ? NaN : Math.tan(a);
    case 'nroot': return Number.isInteger(b) && b !== 0 && (a >= 0 || Math.abs(b) % 2 === 1) ? (a < 0 ? -1 : 1) * Math.pow(Math.abs(a), 1 / b) : NaN;
    case 'sgn': return Math.sign(a);
    default: return Math[node.call](a);
  }
}

function boundary(node, x) {
  if (['abs', 'sgn'].includes(node.call) && evaluate(node.args[0], x) === 0) return true;
  return Boolean((node.args && node.args.some((part) => boundary(part, x))) ||
    (node.child && boundary(node.child, x)) || (node.op && (boundary(node.left, x) || boundary(node.right, x))));
}

export function createDerivativeModel(formula, derivative) {
  const normalized = normalizeFormula(formula).replace(/^(?:y|[a-z]\(x\))=/, '');
  const source = parseExpression(normalized);
  const derived = parseExpression(derivative);
  const value = (x) => evaluate(source, x);
  const quotient = (a, h) => {
    const y = value(a), next = value(a + h);
    return h && Number.isFinite(y) && Number.isFinite(next) ? (next - y) / h : NaN;
  };
  return {
    at(a, h) {
      if (!Number.isFinite(a) || Math.abs(a) > 10000 || !Number.isFinite(h) || h === 0) throw new Error('取点须在 −10000 到 10000 之间，h 须为非零有限数。');
      const y = value(a), nextY = value(a + h), rawSlope = evaluate(derived, a);
      const pointValid = Number.isFinite(y), atBoundary = boundary(source, a);
      const tangentValid = pointValid && Number.isFinite(rawSlope) && !atBoundary;
      const secant = quotient(a, h);
      let notice;
      if (!pointValid) notice = 'a 不在原函数的实数定义域内，此处不显示取点和切线。';
      else if (atBoundary) notice = '此点在绝对值或符号函数分界处，请比较左右差商并按定义判断；不自动给出该点切线。';
      else if (!tangentValid) notice = '此处没有有限的一阶导数，不能显示有限斜率的切线。';
      else if (rawSlope > 1e-10) notice = '瞬时变化率为正：切线向右上方倾斜。';
      else if (rawSlope < -1e-10) notice = '瞬时变化率为负：切线向右下方倾斜。';
      else notice = '切线水平，但导数为零不一定是极值点。';
      if (pointValid && !Number.isFinite(secant)) notice += ' a+h 不在定义域内，请调整 h 或趋近方向。';
      return {
        a, h, y, nextY, deltaY: nextY - y, secant,
        slope: tangentValid ? rawSlope : NaN, pointValid, tangentValid,
        secantValid: Number.isFinite(secant), notice,
        sides: [0.5, 0.1, 0.01, 0.001].map((step) => ({ step, left: quotient(a, -step), right: quotient(a, step) })),
      };
    },
  };
}
