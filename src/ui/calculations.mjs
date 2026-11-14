import { normalizeFormula, parseExpression } from './expression.mjs';

function toCAS(node) {
  if (node.op) return `(${toCAS(node.left)}${node.op}${toCAS(node.right)})`;
  if (node.child) return `(${node.sign}${toCAS(node.child)})`;
  if (node.args) {
    const args = node.args.map(toCAS);
    if (node.call === 'ln') return `log(${args[0]})`;
    if (node.call === 'lg') return `(log(${args[0]})/log(10))`;
    if (node.call === 'log') return `(log(${args[1]})/log(${args[0]}))`;
    if (node.call === 'exp') return `(e^(${args[0]}))`;
    if (node.call === 'nroot') return `((${args[0]})^(1/(${args[1]})))`;
    return `${node.call === 'sgn' ? 'sign' : node.call}(${args.join(',')})`;
  }
  return node.variable ?? node.number ?? (node.constant === 'π' ? 'pi' : 'e');
}

function visit(node, callback) {
  callback(node);
  if (node.child) visit(node.child, callback);
  if (node.op) { visit(node.left, callback); visit(node.right, callback); }
  if (node.args) for (const argument of node.args) visit(argument, callback);
}

const ruleNames = {
  '+': '和的求导法则', '-': '差的求导法则', '*': '积的求导法则 (uv)′ = u′v + uv′',
  '/': '商的求导法则 (u/v)′ = (u′v − uv′)/v²', '^': '幂函数或指数函数法则，复合时应用链式法则',
  sqrt: '根式求导，复合时乘以内层导数', nroot: '将根式写成幂，再应用链式法则',
  sin: '(sin u)′ = cos(u) · u′', cos: '(cos u)′ = −sin(u) · u′', tan: '(tan u)′ = u′/cos²(u)',
  ln: '(ln u)′ = u′/u', lg: '(lg u)′ = u′/(u ln 10)', log: '换底公式与复合函数求导',
  exp: '(e^u)′ = e^u · u′', abs: '绝对值分段求导，内层为零时需单独讨论',
  asin: '反正弦函数与链式法则', acos: '反余弦函数与链式法则', atan: '反正切函数与链式法则',
};

export function createCalculator(cas) {
  const expression = (text, variables = []) => toCAS(parseExpression(text, variables));
  const exact = (text) => cas(text).text();
  const tex = (text) => cas(text).toTeX();
  const entry = (label, text) => ({ label, expression: exact(text), tex: tex(text) });
  const approx = (text) => {
    const number = Number(cas(text).evaluate().text());
    return Number.isFinite(number) ? Number(number.toPrecision(12)).toString() : undefined;
  };
  const integer = (value) => {
    const count = Number(value);
    if (!Number.isInteger(count) || count < 1 || count > 1000) throw new Error('项数 N 请输入 1 到 1000 的整数。');
    return count;
  };

  function derivative({ formula, order = 1, point = '' }) {
    order = Number(order);
    if (!Number.isInteger(order) || order < 1 || order > 4) throw new Error('求导阶数请选择 1 到 4 阶。');
    const normalized = normalizeFormula(formula).replace(/^(?:y|[a-z]\(x\))=/, '');
    const ast = parseExpression(normalized, ['x', 'a', 'b', 'c', 'k', 'm', 'n', 'p', 'q', 'r']);
    const source = toCAS(ast);
    const output = { title: '导函数与导数', formulas: [entry('原函数 f(x)', source)], steps: [], notices: [], plots: [] };
    const seen = new Set();
    visit(ast, (node) => {
      const rule = ruleNames[node.op ?? node.call];
      const body = toCAS(node);
      if (!rule || !/\bx\b/.test(body) || seen.has(body) || output.steps.length >= 10) return;
      seen.add(body);
      const result = cas.diff(body, 'x').text();
      output.steps.push({ text: rule, tex: `\\frac{d}{dx}\\left(${tex(body)}\\right)=${tex(result)}` });
    });
    let derived = source;
    for (let index = 1; index <= order; index++) {
      derived = cas.diff(derived, 'x').text();
      if (/\bdiff\(/.test(derived)) throw new Error('此表达式暂不能给出显式导函数，请简化后再试。');
      output.formulas.push(entry(index === 1 ? '一阶导函数 f′(x)' : `${index} 阶导函数`, derived));
    }
    const graphFormula = (text) => text.replace(/\blog\(/g, 'ln(').replace(/\bsign\(/g, 'sgn(').replace(/\bpi\b/g, 'π');
    output.plots.push({ label: '绘制原函数', formula: graphFormula(source) });
    output.plots.push({ label: '绘制导函数', formula: graphFormula(derived) });
    output.notices.push('公式在原函数的实数可导区间成立。a、b、c、k、m、n、p、q、r 视为常数；三角函数使用弧度。');
    if (point.trim()) {
      const x0 = expression(point);
      const withPoint = (body) => cas(body).sub('x', x0);
      const hasParameters = cas(source).variables().some((variable) => variable !== 'x');
      try {
        visit(ast, (node) => {
          const value = (part) => Number(withPoint(toCAS(part)).evaluate().text());
          const zero = (part) => withPoint(toCAS(part)).eq(0);
          if (node.op === '/' && zero(node.right)) throw new Error('原式的分母为零');
          if (node.op === '^' && zero(node.left) && value(node.right) <= 0) throw new Error('原式包含未定义的幂');
          if ((node.call === 'abs' || node.call === 'sgn') && zero(node.args[0])) throw new Error('此点位于绝对值或符号函数的分界，需用导数定义单独判断');
          if (['ln', 'lg', 'log'].includes(node.call)) {
            if (value(node.args.at(-1)) <= 0) throw new Error('对数真数须大于零');
            if (node.call === 'log' && (value(node.args[0]) <= 0 || withPoint(toCAS(node.args[0])).eq(1))) throw new Error('对数底数须大于零且不等于一');
          }
          if (node.call === 'sqrt' && value(node.args[0]) < 0) throw new Error('偶次根式在此点没有实数值');
          if (node.call === 'tan' && withPoint(`cos(${toCAS(node.args[0])})`).eq(0)) throw new Error('正切函数在此点没有定义');
        });
        const y0 = withPoint(source).text();
        const slope = withPoint(cas.diff(source, 'x').text()).text();
        const value = withPoint(derived).text();
        for (const item of [y0, slope, value]) {
          if (/\b(?:NaN|Infinity|undefined|i)\b|∞/.test(item)) throw new Error('该点没有有限的实数导数，或不在原函数定义域内');
        }
        output.formulas.push({ ...entry(`x₀ = ${exact(x0)} 时的 ${order} 阶导数`, value), approximate: approx(value) });
        const tangent = exact(`(${slope})*(x-(${x0}))+(${y0})`);
        output.formulas.push(entry('切线方程 y =', tangent));
        output.steps.push({ text: '先求导，再代入 x₀；切线使用一阶导数作为斜率。', tex: `y-f(x_0)=f'(x_0)(x-x_0)` });
        output.plots.push({ label: '绘制切线', formula: graphFormula(tangent) });
        if (hasParameters) output.notices.push('点值含参数，需同时满足原函数定义域和该点可导的条件。');
      } catch (error) {
        output.notices.push(`未给出该点的导数与切线：${error.message}。导函数结果已保留。`);
      }
    }
    return output;
  }

  function sequence({ mode, first = '1', step = '1', ratio = '2', multiplier = '2', increment = '1', term = 'n^2', count = 10 }) {
    const total = integer(count);
    const output = { title: '数列与前 N 项和', formulas: [], steps: [], notices: [], terms: [], plots: [] };
    let general;
    let sum;
    let at;
    if (mode === 'arithmetic') {
      const a = expression(first); const d = expression(step);
      general = exact(`(${a})+(n-1)*(${d})`);
      sum = exact(`n*(2*(${a})+(n-1)*(${d}))/2`);
      output.steps.push({ text: '等差数列：相邻两项的差恒为 d。', tex: 'a_n=a_1+(n-1)d' }, { text: '首尾配对，得到前 n 项和。', tex: 'S_n=\\frac{n(a_1+a_n)}2' });
    } else if (mode === 'geometric') {
      const a = expression(first); const q = expression(ratio);
      if (cas(q).eq(0) || cas(a).eq(0)) throw new Error('等比模式的首项、公比须非零；含零项的情形可用一阶递推模式。');
      general = exact(`(${a})*(${q})^(n-1)`);
      sum = cas(q).eq(1) ? exact(`n*(${a})`) : exact(`(${a})*(1-(${q})^n)/(1-(${q}))`);
      output.steps.push({ text: '等比数列：相邻两项的比恒为 q。', tex: 'a_n=a_1q^{n-1}' }, { text: cas(q).eq(1) ? 'q = 1 时各项相等，直接累加。' : '两式相减（错位相减），消去中间项。', tex: cas(q).eq(1) ? 'S_n=na_1' : '(1-q)S_n=a_1(1-q^n)' });
    } else if (mode === 'recurrence') {
      const a = expression(first); const p = expression(multiplier); const q = expression(increment);
      if (cas(p).eq(0)) {
        at = (n) => n === 1 ? exact(a) : exact(q);
        sum = exact(`(${a})+(n-1)*(${q})`);
        output.notices.push('p = 0：首项为 a₁，从第二项起恒为 q。');
      } else if (cas(p).eq(1)) {
        general = exact(`(${a})+(n-1)*(${q})`);
        sum = exact(`n*(2*(${a})+(n-1)*(${q}))/2`);
        output.steps.push({ text: 'p = 1，递推式化为公差为 q 的等差数列。', tex: 'a_{n+1}-a_n=q' });
      } else {
        const center = exact(`(${q})/(1-(${p}))`);
        general = exact(`((${a})-(${center}))*(${p})^(n-1)+(${center})`);
        sum = exact(`((${a})-(${center}))*(1-(${p})^n)/(1-(${p}))+n*(${center})`);
        output.steps.push({ text: '求不动点 L = q/(1−p)，将递推式平移为等比数列。', tex: `L=${tex(center)},\\quad a_{n+1}-L=p(a_n-L)` }, { text: '先求 aₙ−L 的通项，再加回 L；求和时也分成两部分。', tex: 'a_n=(a_1-L)p^{n-1}+L' });
      }
    } else if (mode === 'general') {
      const normalized = normalizeFormula(term).replace(/^(?:a\(n\)|a_n)=/, '');
      const ast = parseExpression(normalized, ['n']);
      const restrictions = [];
      visit(ast, (node) => { if (node.op === '/' || node.op === '^' || ['ln', 'lg', 'log', 'sqrt', 'tan', 'asin', 'acos'].includes(node.call)) restrictions.push(node); });
      for (let n = 1; n <= total; n++) {
        const at = (node) => cas(toCAS(node)).sub('n', String(n));
        for (const node of restrictions) {
          if ((node.op === '/' && at(node.right).eq(0)) || (node.op === '^' && at(node.left).eq(0) && Number(at(node.right).evaluate().text()) <= 0)) throw new Error(`第 ${n} 项在原通项中未定义，请检查分母或幂。`);
          const evaluated = at(node).text();
          if (/\b(?:NaN|Infinity|undefined|i)\b|∞/.test(evaluated)) throw new Error(`第 ${n} 项没有定义为实数。`);
        }
      }
      general = toCAS(ast);
      const summand = cas(general).sub('n', 'k').text();
      sum = cas.sum(cas(summand), cas('k'), cas('1'), cas('n')).text();
      output.steps.push({ text: '将通项中的下标换成 k，再从第 1 项累加到第 n 项。', tex: `S_n=\\sum_{k=1}^{n}\\left(${tex(summand)}\\right)` });
      if (/\bsum\(/.test(sum)) {
        visit(parseExpression(normalized, ['n']), (node) => {
          if (!/\bsum\(/.test(sum) || node.op !== '^' || /\bn\b/.test(toCAS(node.left)) || !/\bn\b/.test(toCAS(node.right))) return;
          const q = toCAS(node.left);
          if (cas(q).eq(0) || cas(q).eq(1)) return;
          const coefficient = cas(`(${general})/((${q})^n)`);
          if (!cas.diff(coefficient, 'n', 2).eq(0)) return;
          const a = cas.diff(coefficient, 'n').text();
          const b = coefficient.sub('n', '0').text();
          sum = exact(`(${a})*(${q})*(1-(n+1)*(${q})^n+n*(${q})^(n+1))/(1-(${q}))^2+(${b})*(${q})*(1-(${q})^n)/(1-(${q}))`);
          output.steps.push({ text: '通项是一次式乘等比项，应用错位相减的加权等比求和公式。', tex: '\\sum_{k=1}^{n} kq^k=\\frac{q[1-(n+1)q^n+nq^{n+1}]}{(1-q)^2},\\quad q\\ne1' });
        });
      }
      if (/\bsum\(/.test(sum)) output.notices.push('此通项暂未化出闭式 Sₙ；仍会计算指定 N 的精确前 N 项和。');
    } else throw new Error('请选择一种数列模式。');

    if (general) output.formulas.push(entry('通项 aₙ =', general));
    if (sum) output.formulas.push(entry('前 n 项和 Sₙ =', sum));
    at ??= (n) => cas(general).sub('n', String(n)).text();
    const nth = at(total);
    let finiteSum = sum && !/\bsum\(/.test(sum) ? cas(sum).sub('n', String(total)).text() : undefined;
    if (!finiteSum) {
      if (total > 100) throw new Error('此通项暂未得到闭式。直接精确累加最多 100 项，请减少 N 后重试。');
      finiteSum = '0';
      for (let n = 1; n <= total; n++) finiteSum = exact(`(${finiteSum})+(${at(n)})`);
    }
    for (const value of [nth, finiteSum]) {
      if (/\b(?:NaN|Infinity|undefined|i)\b|∞/.test(value)) throw new Error('指定项或求和区间内存在未定义的实数项，请检查通项和 N。');
    }
    output.formulas.push({ ...entry(`第 ${total} 项`, nth), approximate: approx(nth) });
    output.formulas.push({ ...entry(`前 ${total} 项和`, finiteSum), approximate: approx(finiteSum) });
    for (let n = 1; n <= Math.min(total, 12); n++) output.terms.push({ n, value: at(n), tex: tex(at(n)) });
    output.notices.push(`n 从 1 开始，N = ${total}。预览显示前 ${Math.min(total, 12)} 项；分式、根式等保留精确形式。`);
    return output;
  }

  return { derivative, sequence };
}
