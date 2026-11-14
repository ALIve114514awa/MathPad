importScripts('/nerdamer.js');
const calculator = import('./calculations.mjs').then(({ createCalculator }) => createCalculator(self.nerdamer));
self.onmessage = async ({ data }) => {
  try {
    const engine = await calculator;
    if (!['derivative', 'sequence'].includes(data.kind)) throw new Error('未知的计算类型。');
    self.postMessage({ result: engine[data.kind](data.input) });
  } catch (error) {
    self.postMessage({ error: error.message || '暂不能计算此表达式，请检查输入。' });
  }
};
