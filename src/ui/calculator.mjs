import { compileFormula } from './expression.mjs';

const $ = (id) => document.getElementById(id);

export function initializeCalculator(plot) {
  const jobs = new Map();
  function workspace(id) {
    for (const button of document.querySelectorAll('[data-workspace]')) {
      const active = button.dataset.workspace === id;
      button.setAttribute('aria-pressed', String(active));
      $(button.dataset.workspace).hidden = !active;
    }
  }
  for (const button of document.querySelectorAll('[data-workspace]')) button.onclick = () => workspace(button.dataset.workspace);

  function math(element, text, fallback) {
    if (window.katex) window.katex.render(text, element, { throwOnError: false, trust: false, maxExpand: 500 });
    else element.textContent = fallback ?? text;
  }

  function render(kind, result) {
    const output = $(`${kind}-output`);
    output.replaceChildren();
    for (const formula of result.formulas) {
      const card = document.createElement('section');
      card.className = 'formula-card';
      const label = document.createElement('h3'); label.textContent = formula.label;
      const value = document.createElement('div'); value.className = 'formula-math'; value.dataset.expression = formula.expression;
      math(value, formula.tex, formula.expression);
      card.append(label, value);
      if (formula.approximate && formula.approximate !== formula.expression) {
        const approximation = document.createElement('small'); approximation.textContent = `数值近似 ≈ ${formula.approximate}`; card.append(approximation);
      }
      output.append(card);
    }
    if (result.plots?.length) {
      const actions = document.createElement('div'); actions.className = 'calculation-plots';
      for (const option of result.plots) {
        const button = document.createElement('button'); button.type = 'button'; button.textContent = option.label;
        try { compileFormula(option.formula); } catch {
          button.disabled = true; button.title = '此结果含未赋值参数或暂不支持的绘图结构，可修改为具体表达式后绘图。';
        }
        button.onclick = () => {
          try { plot(option.formula); workspace('graph-workspace'); }
          catch (error) { $(`${kind}-status`).textContent = error.message; }
        };
        actions.append(button);
      }
      output.append(actions);
    }
    if (result.steps.length) {
      const heading = document.createElement('h2'); heading.textContent = '计算步骤'; output.append(heading);
      const steps = document.createElement('ol'); steps.className = 'calculation-steps';
      for (const step of result.steps) {
        const item = document.createElement('li'); item.append(document.createTextNode(step.text));
        const formula = document.createElement('div'); formula.className = 'formula-math'; math(formula, step.tex); item.append(formula); steps.append(item);
      }
      output.append(steps);
    }
    if (result.terms?.length) {
      const table = document.createElement('table'); table.className = 'terms-table';
      const header = table.createTHead().insertRow();
      for (const label of ['n', 'aₙ（精确值）']) { const cell = document.createElement('th'); cell.textContent = label; header.append(cell); }
      const body = table.createTBody();
      for (const term of result.terms) { const row = body.insertRow(); row.insertCell().textContent = term.n; math(row.insertCell(), term.tex, term.value); }
      output.append(table);
    }
    for (const notice of result.notices) { const paragraph = document.createElement('p'); paragraph.className = 'calculation-notice'; paragraph.textContent = notice; output.append(paragraph); }
  }

  function finish(kind) {
    const job = jobs.get(kind);
    if (job) { clearTimeout(job.timer); job.worker.terminate(); jobs.delete(kind); }
    $(`${kind}-form`).querySelector('[type="submit"]').disabled = false;
    document.querySelector(`[data-cancel-calculation="${kind}"]`).hidden = true;
  }
  function calculate(kind) {
    finish(kind);
    const input = Object.fromEntries(new FormData($(`${kind}-form`)));
    const status = $(`${kind}-status`);
    status.textContent = '正在进行符号计算…';
    $(`${kind}-form`).querySelector('[type="submit"]').disabled = true;
    document.querySelector(`[data-cancel-calculation="${kind}"]`).hidden = false;
    const worker = new Worker('/calculation-worker.js');
    const timer = setTimeout(() => { finish(kind); status.textContent = '本次计算超过 10 秒，已停止。请简化表达式或减少项数后重试。'; }, 10000);
    jobs.set(kind, { worker, timer });
    worker.onmessage = ({ data }) => {
      finish(kind);
      status.textContent = data.error ? `计算未完成：${data.error}` : '';
      if (data.result) render(kind, data.result);
    };
    worker.onerror = () => { finish(kind); status.textContent = '无法启动本地计算组件，请重新打开程序后重试。'; };
    worker.postMessage({ kind, input });
  }
  for (const kind of ['sequence', 'derivative']) {
    $(`${kind}-form`).onsubmit = (event) => { event.preventDefault(); calculate(kind); };
    document.querySelector(`[data-cancel-calculation="${kind}"]`).onclick = () => { finish(kind); $(`${kind}-status`).textContent = '本次计算已取消。'; };
  }
  function sequenceMode() {
    for (const field of document.querySelectorAll('[data-sequence-modes]')) field.hidden = !field.dataset.sequenceModes.split(' ').includes($('sequence-mode').value);
  }
  $('sequence-mode').onchange = sequenceMode;
  const sequenceExamples = {
    squares: { mode: 'general', term: 'n^2', count: 10 }, telescope: { mode: 'general', term: '1/(n*(n+1))', count: 10 },
    weighted: { mode: 'general', term: 'n*2^n', count: 10 }, recurrence: { mode: 'recurrence', first: '1', multiplier: '2', increment: '1', count: 10 },
  };
  const derivativeExamples = {
    chain: { formula: 'sin(x^2)', point: '1', order: 1 }, quotient: { formula: 'ln(x)/x', point: 'e', order: 1 },
    power: { formula: 'x^x', point: '1', order: 1 }, parameter: { formula: 'a*x^3+b*x+c', point: '', order: 1 },
  };
  for (const [kind, examples] of [['sequence', sequenceExamples], ['derivative', derivativeExamples]]) {
    for (const button of document.querySelectorAll(`[data-${kind}-example]`)) button.onclick = () => {
      finish(kind);
      const example = examples[button.dataset[`${kind}Example`]];
      for (const [name, value] of Object.entries(example)) $(`${kind}-form`).elements.namedItem(name).value = value;
      if (kind === 'sequence') sequenceMode();
      $(`${kind}-status`).textContent = '已填入示例，点击计算查看结果。';
    };
  }
}
