import assert from 'node:assert/strict';
import test from 'node:test';
import { compileFormula } from '../src/ui/expression.mjs';

test('compiles handwritten and typed notation through the same plot grammar', () => {
  assert.deepEqual(compileFormula('y = x²'), { kind: 'function', polynomial: true, expression: '(x^2)' });
  assert.deepEqual(compileFormula('f(x) = ((1)/(2))x−3'), {
    kind: 'function', polynomial: true, expression: '(((1/2)*x)-3)',
  });
  assert.deepEqual(compileFormula('y=−x²+2x'), {
    kind: 'function', polynomial: true, expression: '((-(x^2))+(2*x))',
  });
  assert.equal(compileFormula('g(x) = |x-1| + log(2,x) + sqrt(x)').polynomial, false);
  assert.equal(compileFormula('y=sin(2πx)').expression, 'sin(((2*π)*x))');
});

test('keeps both variables and the equality in conics', () => {
  assert.deepEqual(compileFormula('x^2/25+y²/9=1'), {
    kind: 'equation', polynomial: true, expression: '(((x^2)/25)+((y^2)/9))=1',
  });
  assert.equal(compileFormula('y² = 4x').kind, 'equation');
  assert.equal(compileFormula('x=3').kind, 'equation');
  assert.equal(compileFormula('y=1/(x-1)').polynomial, false);
});

test('rejects malformed formulas, arbitrary commands and unsupported variables', () => {
  for (const invalid of ['x^', 'y=sin()', 'y=|x', 'y=x=3', 'y=a*x+b', 'Delete(mp1)', 'x^3+y^2=0']) {
    assert.throws(() => compileFormula(invalid), invalid);
  }
});
