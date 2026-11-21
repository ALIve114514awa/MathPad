import assert from 'node:assert/strict';
import test from 'node:test';
import { compileFormula } from '../src/ui/expression.mjs';
import { pythonToFormula } from '../src/ui/python-expression.mjs';

const compile = source => compileFormula(pythonToFormula(source));
test('Python arithmetic preserves exponent associativity, unary signs and explicit multiplication', () => {
  for (const [python, math] of [
    ['-x**2', '-x^2'], ['(-x)**2', '(-x)^2'], ['2**-x', '2^(-x)'],
    ['2**3**2', '2^(3^2)'], ['pow(x, 3) + 2*x', 'x^3+2*x'],
    ['lambda x: x**2 - 1/(x+1)', 'x^2-1/(x+1)'], ['y = x**2', 'y=x^2'],
    ['1e-3*x + 1_000.5', '1*10^(-3)*x+1000.5'],
  ]) assert.deepEqual(compile(python), compileFormula(math), python);
  for (const source of ['2x', '2(x+1)', '1 2', 'x(x+1)', '01+x']) assert.throws(() => compile(source), source);
});
test('Python math functions keep natural logarithms and argument-first bases distinct from keyboard syntax', () => {
  for (const [python, math] of [
    ['log(x)', 'ln(x)'], ['log(x, 2)', 'log(2,x)'], ['log(x, 10)', 'log(10,x)'],
    ['log2(x)', 'log(2,x)'], ['log10(x)', 'lg(x)'],
    ['sin(x) + cos(x) + tan(x)', 'sin(x)+cos(x)+tan(x)'],
    ['sqrt(x) + abs(x) + fabs(x)', 'sqrt(x)+abs(x)+abs(x)'],
    ['asin(x)+acos(x)+atan(x)', 'asin(x)+acos(x)+atan(x)'],
    ['exp(x)+pow(x,2)+pi+e+tau', 'exp(x)+x^2+pi+e+2*pi'],
    ['math.log(x, 2)', 'log(2,x)'], ['math . sin(x)+math.pi', 'sin(x)+pi'],
  ]) assert.deepEqual(compile(python), compileFormula(math), python);
});
test('Python equality plots supported conics and retains the implicit-equation domain restrictions', () => {
  assert.deepEqual(compile('x**2/25 + y**2/9 == 1'), compileFormula('x^2/25+y^2/9=1'));
  assert.equal(compile('y == x**2').kind, 'function');
  assert.equal(compile('x == 3').kind, 'equation');
  assert.throws(() => compile('x**2+y**2=1'), /使用 ==/);
  assert.throws(() => compile('2/x**2+4/y**2 == 3'), /含变量分母/);
  assert.throws(() => compile('x**3+y**2 == 1'), /绘图范围/);
});
test('unsupported Python operations, arbitrary code and malformed calls never enter the plotting engine', () => {
  assert.throws(() => compile('x^2'), /乘方使用 \*\*/);
  for (const source of [
    'import math', 'def f(x): return x', '__import__("os").system("echo test")',
    'open("example.txt")', 'math.__dict__', 'np.sin(x)', 'math.abs(x)',
    'x//2', 'x%2', '[x*x for x in range(3)]', 'x if x>0 else -x',
    'math.log()', 'math.sin(x,2)', 'pow(x,2,3)', 'math.pi()', 'x**', '1e999',
    'lambda y: y**2', 'lambda x: x+y', 'y = y+1', 'x==y==1', '', 'x'.repeat(351),
  ]) assert.throws(() => compile(source), source);
});
