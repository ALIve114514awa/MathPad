import { compileFormula } from './expression.mjs';

const $ = (id) => document.getElementById(id);

export function initializeCalculator(plot, { onDerivative = () => {}, onEdit = () => {}, onWorkspace = () => {} } = {}) {
  const jobs = new Map();
  let derivativeSource;
  function workspace(id) {
    for (const button of document.querySelectorAll('[data-workspace]')) {
      const active = button.dataset.workspace === id;
      button.setAttribute('aria-pressed', String(active));
      $(button.dataset.workspace).hidden = !active;
    }
    onWorkspace(id);
  }
  for (const button of document.querySelectorAll('[data-workspace]')) button.onclick = () => workspace(button.dataset.workspace);
  function panel(id) {
    workspace('graph-workspace');
    for (const button of document.querySelectorAll('[data-panel]')) {
      const active = button.dataset.panel === id;
      button.setAttribute('aria-pressed', String(active));
      $(button.dataset.panel).hidden = !active;
    }
  }
  for (const button of document.querySelectorAll('[data-panel]')) button.onclick = () => panel(button.dataset.panel);

  function math(element, text, fallback) {
    if (window.katex) window.katex.render(text, element, { throwOnError: false, trust: false, maxExpand: 500 });
    else element.textContent = fallback ?? text;
  }

  function render(kind, result, sourceName) {
    const output = $(`${kind}-output`);
    output.dataset.stale = 'false';
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
    if (kind === 'derivative') {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = '重新同步图像';
      button.onclick = () => {
        if (output.dataset.stale === 'true') { $('derivative-status').textContent = '输入已修改，请先计算再同步。'; return; }
        onDerivative(result, sourceName);
      };
      output.append(button);
    } else if (result.plots?.length) {
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
    if (job) { clearTimeout(job.timer); job.worker.onmessage = job.worker.onerror = null; job.worker.terminate(); jobs.delete(kind); }
    $(`${kind}-form`).querySelector('[type="submit"]').disabled = false;
    document.querySelector(`[data-cancel-calculation="${kind}"]`).hidden = true;
  }
  function calculate(kind) {
    finish(kind);
    const input = Object.fromEntries(new FormData($(`${kind}-form`)));
    if (kind === 'derivative' && derivativeSource?.formula !== input.formula) derivativeSource = undefined;
    const sourceName = kind === 'derivative' ? derivativeSource?.name : undefined;
    const status = $(`${kind}-status`);
    $(`${kind}-output`).dataset.stale = 'true';
    status.textContent = '正在进行符号计算…';
    status.dataset.state = 'loading';
    $(`${kind}-form`).querySelector('[type="submit"]').disabled = true;
    document.querySelector(`[data-cancel-calculation="${kind}"]`).hidden = false;
    const worker = new Worker('/calculation-worker.js');
    const timer = setTimeout(() => { finish(kind); status.textContent = '本次计算超过 10 秒，已停止。请简化表达式或减少项数后重试。'; }, 10000);
    jobs.set(kind, { worker, timer });
    worker.onmessage = ({ data }) => {
      if (jobs.get(kind)?.worker !== worker) return;
      finish(kind);
      status.textContent = data.error ? `计算未完成：${data.error}` : '';
      status.dataset.state = data.error ? 'error' : 'ready';
      if (data.result) {
        render(kind, data.result, sourceName);
        if (kind === 'derivative') onDerivative(data.result, sourceName);
      }
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
  $('derivative-form').addEventListener('input', (event) => {
    if (event.target.name === 'formula') derivativeSource = undefined;
    finish('derivative'); onEdit();
    $('derivative-output').dataset.stale = 'true';
    $('derivative-status').textContent = '输入已修改，点击计算同步公式和图像。';
    $('derivative-status').dataset.state = 'stale';
  });
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
      if (kind === 'derivative') {
        derivativeSource = undefined;
        onEdit(); $('derivative-output').dataset.stale = 'true';
      }
    };
  }
  const lessons = {
    quadratic: { formula: 'x^2', point: '1', order: 1 },
    stationary: { formula: 'x^3', point: '0', order: 1 },
    corner: { formula: 'abs(x)', point: '0', order: 1 },
  };
  function derive(input, sourceName) {
    panel('derivative-workspace');
    derivativeSource = sourceName ? { name: sourceName, formula: input.formula } : undefined;
    for (const [name, value] of Object.entries(input)) $('derivative-form').elements.namedItem(name).value = value;
    onEdit(); calculate('derivative');
  }
  for (const button of document.querySelectorAll('[data-lesson-example]')) button.onclick = () => derive(lessons[button.dataset.lessonExample]);
  function reset() {
    derivativeSource = undefined;
    for (const kind of ['sequence', 'derivative']) {
      finish(kind);
      const form = $(`${kind}-form`); form.reset();
      for (const field of form.querySelectorAll('input')) field.value = '';
      $(`${kind}-output`).replaceChildren(); $(`${kind}-output`).dataset.stale = 'false';
      $(`${kind}-status`).textContent = ''; $(`${kind}-status`).dataset.state = '';
    }
    sequenceMode();
  }
  function invalidateDerivative(formula, previousName, replacementName) {
    if (derivativeSource?.name === previousName) {
      derivativeSource = replacementName ? { name: replacementName, formula } : undefined;
    }
    finish('derivative'); onEdit();
    if (formula !== undefined) $('derivative-form').elements.namedItem('formula').value = formula;
    $('derivative-output').dataset.stale = 'true';
    $('derivative-status').textContent = '教学曲线已修改或删除，请重新计算以更新演示。';
    $('derivative-status').dataset.state = 'stale';
  }
  function suspendDerivative() {
    const active = jobs.has('derivative'); finish('derivative');
    if (active) { $('derivative-status').textContent = '本次计算已停止，可先编辑曲线。'; $('derivative-status').dataset.state = 'stale'; }
  }
  return {
    derive, reset, invalidateDerivative, suspendDerivative, workspace,
    referencesDerivativeSource(name) { return name === derivativeSource?.name; },
  };
}
