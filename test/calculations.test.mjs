import assert from 'node:assert/strict';
import test from 'node:test';
import cas from 'nerdamer';
import { createCalculator } from '../src/ui/calculations.mjs';

const calculator = createCalculator(cas);
const equal = (actual, expected) => assert.ok(cas(actual).eq(expected), `${actual} should equal ${expected}`);
const value = (result, label) => result.formulas.find((item) => item.label === label)?.expression;

test('sequence formulas preserve exact fractions and handle equal-ratio and recurrence boundary cases', () => {
  const arithmetic = calculator.sequence({ mode: 'arithmetic', first: '2', step: '3', count: 10 });
  equal(value(arithmetic, '第 10 项'), '29'); equal(value(arithmetic, '前 10 项和'), '155');
  const geometric = calculator.sequence({ mode: 'geometric', first: '1', ratio: '1/2', count: 3 });
  equal(value(geometric, '第 3 项'), '1/4'); equal(value(geometric, '前 3 项和'), '7/4');
  equal(value(calculator.sequence({ mode: 'geometric', first: 'sqrt(2)', ratio: '1', count: 4 }), '前 4 项和'), '4*sqrt(2)');
  equal(value(calculator.sequence({ mode: 'recurrence', first: '1', multiplier: '2', increment: '1', count: 10 }), '第 10 项'), '1023');
  equal(value(calculator.sequence({ mode: 'recurrence', first: '5', multiplier: '0', increment: '3', count: 1 }), '前 1 项和'), '5');
  equal(value(calculator.sequence({ mode: 'recurrence', first: '5', multiplier: '0', increment: '3', count: 4 }), '前 4 项和'), '14');
});

test('symbolic sums cover polynomial, telescoping, and weighted geometric examples', () => {
  for (const [term, count, sum] of [['n^2', 10, '385'], ['1/(n*(n+1))', 10, '10/11'], ['n*2^n', 10, '18434']]) {
    const result = calculator.sequence({ mode: 'general', term, count });
    equal(value(result, `前 ${count} 项和`), sum);
    assert.doesNotMatch(value(result, '前 n 项和 Sₙ ='), /sum\(/);
  }
});

test('differentiation covers composite, quotient, variable power, parameters and higher orders', () => {
  for (const [formula, expected] of [['sin(x^2)', '2*x*cos(x^2)'], ['ln(x)/x', '(1-log(x))/x^2'], ['x^x', 'x^x*(1+log(x))'], ['log(2,x)', '1/(x*log(2))'], ['a*x^3+b*x+c', '3*a*x^2+b'], ['sqrt(x)', '1/(2*sqrt(x))'], ['exp(2*x)', '2*e^(2*x)'], ['2^x', '2^x*log(2)'], ['atan(x)', '1/(1+x^2)']]) {
    const result = calculator.derivative({ formula });
    equal(value(result, '一阶导函数 f′(x)'), expected);
    assert.ok(result.steps.length > 0);
  }
  const higher = calculator.derivative({ formula: 'x^3-3*x', order: 2, point: '2' });
  equal(value(higher, '2 阶导函数'), '6*x');
  equal(value(higher, 'x₀ = 2 时的 2 阶导数'), '12');
  equal(value(higher, '切线方程 y ='), '9*x-16');
});

test('point calculations respect original holes, logarithm domain and absolute-value boundaries', () => {
  for (const [formula, point] of [['x/x', '0'], ['ln(x)', '-1'], ['abs(x)', '0'], ['tan(x)', 'pi/2'], ['sqrt(x)', '0']]) {
    const result = calculator.derivative({ formula, point });
    assert.ok(result.notices.some((notice) => notice.includes('未给出该点')), formula);
    assert.ok(value(result, '一阶导函数 f′(x)'));
    assert.equal(result.formulas.some((item) => item.label === '切线方程 y ='), false);
  }
});

test('commands, unknown variables and unbounded counts do not enter the symbolic engine', () => {
  for (const formula of ['x:4', 'diff(x,x)', 'x;2', 'y^2']) assert.throws(() => calculator.derivative({ formula }));
  for (const count of [0, -1, 1.5, 1001]) assert.throws(() => calculator.sequence({ mode: 'arithmetic', count }));
  assert.throws(() => calculator.sequence({ mode: 'general', term: '(n-2)/(n-2)', count: 3 }), /第 2 项/);
  const trigonometric = calculator.sequence({ mode: 'general', term: 'sin(n)', count: 3 });
  assert.match(value(trigonometric, '前 3 项和'), /sin\(1\)/);
});
