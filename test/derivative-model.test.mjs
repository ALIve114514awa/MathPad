import test from 'node:test';
import assert from 'node:assert/strict';
import { createDerivativeModel } from '../src/ui/derivative-model.mjs';

test('secants approach the first derivative from both sides while preserving slope signs', () => {
  const model = createDerivativeModel('x^2', '2*x');
  const coarse = model.at(1, 1), fine = model.at(1, 0.001), left = model.at(1, -0.001);
  assert.equal(coarse.secant, 3); assert.equal(coarse.slope, 2);
  assert.ok(Math.abs(fine.secant - 2) < 0.002);
  assert.ok(Math.abs(left.secant - 2) < 0.002);
  assert.ok(model.at(-1, 0.1).slope < 0);
  assert.equal(createDerivativeModel('x^3', '3*x^2').at(0, 0.1).slope, 0);
});

test('teaching does not invent tangents at holes, corners, poles or infinite slopes', () => {
  for (const [source, derivative, point] of [
    ['x/x', '0', 0], ['abs(x)', 'sgn(x)', 0], ['ln(x)', '1/x', -1],
    ['sqrt(x)', '1/(2*sqrt(x))', 0], ['tan(x)', '1/cos(x)^2', Math.PI / 2],
  ]) assert.equal(createDerivativeModel(source, derivative).at(point, 0.1).tangentValid, false, source);
  const corner = createDerivativeModel('abs(x)', 'sgn(x)').at(0, 0.1);
  assert.equal(corner.sides.at(-1).left, -1); assert.equal(corner.sides.at(-1).right, 1);
  const partial = createDerivativeModel('ln(x)', '1/x').at(0.1, -1);
  assert.equal(partial.tangentValid, true); assert.equal(partial.secantValid, false);
  assert.throws(() => createDerivativeModel('a*x', 'a'));
  assert.throws(() => createDerivativeModel('x', '1').at(0, 0));
});
