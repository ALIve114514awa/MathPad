import { compileFormula } from './expression.mjs';
import { pythonToFormula } from './python-expression.mjs';
import { readMathML } from './mathml.mjs';
import { availableProperties, createGraph } from './graph.mjs';
import { initializeCalculator } from './calculator.mjs';
import { initializeDerivativeLesson } from './derivative-lesson.mjs';
import { initializeSidebarResize } from './sidebar-resize.mjs';

const $ = (id) => document.getElementById(id);
const colors = [[34, 92, 212], [175, 65, 36], [17, 124, 91], [130, 64, 166], [165, 110, 10], [11, 112, 144]];
const curves = new Map();
const results = new Map();
const selected = new Set();
const scripts = new Map();
const dialog = $('formula-dialog');
const input = $('formula-text');
const submit = $('submit-formula');
const graphHost = $('graph');
const handCanvas = $('hand-canvas');

let graph;
let colorIndex = 0;
let mode = 'keyboard';
let hand;
let handState = 'idle';
let handTimer;
let handGeneration = 0;
let draftVersion = 0;
let derivativeCurves = [];
let pendingDerivative;
let resizeFrame;
let editingName;
const lesson = initializeDerivativeLesson(setCurveVisibility);

function showText(element, text) {
  element.textContent = text;
  element.hidden = !text;
}

function loadScript(url) {
  if (scripts.has(url)) return scripts.get(url);
  const promise = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    function failed() {
      clearTimeout(timer);
      script.remove();
      scripts.delete(url);
      reject(new Error(url.startsWith('/') ? '本地组件文件不可用。' : '无法连接组件服务。'));
    }
    const timer = setTimeout(failed, 16000);
    script.onload = () => { clearTimeout(timer); resolve(); };
    script.onerror = failed;
    script.src = url;
    document.head.append(script);
  });
  scripts.set(url, promise);
  return promise;
}

function resizeGraph() {
  if (resizeFrame !== undefined) return;
  resizeFrame = requestAnimationFrame(() => {
    resizeFrame = undefined;
    const { clientWidth, clientHeight } = graphHost;
    if (graph && clientWidth > 0 && clientHeight > 0) graph.resize(clientWidth, clientHeight);
  });
}

async function loadGraph() {
  $('graph-state').dataset.state = 'loading';
  $('graph-state').textContent = '正在加载绘图组件…';
  $('graph-message-title').textContent = '正在准备坐标系';
  $('graph-message-detail').textContent = '正在加载本地绘图资源。';
  $('retry-graph').hidden = true;
  const target = document.createElement('div');
  target.className = 'graph-mount';
  graphHost.replaceChildren(target);
  try {
    await loadScript('/geogebra/deployggb.js');
    graph = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('绘图组件加载超时。')), 60000);
      try {
        const applet = new window.GGBApplet({
          appName: 'classic', language: 'en', perspective: 'G', preventFocus: true,
          width: Math.max(100, graphHost.clientWidth), height: Math.max(100, graphHost.clientHeight),
          showToolBar: false, showMenuBar: false, showAlgebraInput: false,
          showResetIcon: false, showZoomButtons: true, showFullscreenButton: false,
          enableRightClick: false, enableShiftDragZoom: true, allowStyleBar: false,
          disableAutoScale: true, scale: 1,
          appletOnLoad: (api) => {
            clearTimeout(timer);
            if (!target.isConnected) return;
            try { resolve(createGraph(api)); } catch (error) { reject(error); }
          },
        }, true);
        applet.setHTML5Codebase(new URL('/geogebra/HTML5/5.0/web3d/', window.location.href).href);
        applet.inject(target);
      } catch (error) {
        clearTimeout(timer);
        reject(error);
      }
    });
    $('graph-message').hidden = true;
    $('graph-state').dataset.state = 'ready';
    $('graph-state').textContent = '绘图组件已就绪';
    $('reset-view').disabled = false;
    resizeGraph();
    graph.resetView();
    if (pendingDerivative) synchronizeDerivative(pendingDerivative);
  } catch (error) {
    graph = undefined;
    target.remove();
    console.warn('GeoGebra load failed', error);
    $('graph-state').dataset.state = 'error';
    $('graph-state').textContent = '绘图组件不可用';
    $('graph-message-title').textContent = '无法加载坐标系';
    $('graph-message-detail').textContent = '请确认程序已完整解压，然后重新加载；仍无法使用时请重新解压完整运行包。';
    $('retry-graph').hidden = false;
  }
  updateSubmit();
}

function updateSubmit() {
  const waiting = mode === 'hand' && (handState === 'pending' || handState === 'error');
  submit.disabled = !graph || !input.value.trim() || waiting;
  submit.title = graph ? '' : '绘图组件尚未就绪。';
}

function handStatus(state, message) {
  handState = state;
  $('hand-status').textContent = message;
  $('retry-hand').hidden = state !== 'error';
  $('clear-hand').disabled = !hand;
  updateSubmit();
}

async function createHand() {
  const generation = ++handGeneration;
  let recognitionVersion = draftVersion;
  clearTimeout(handTimer);
  hand = undefined;
  handCanvas.replaceChildren();
  handStatus('loading', '正在加载手写组件…');
  try {
    await loadScript('https://www.wiris.net/demo/hand/hand.js');
    if (generation !== handGeneration || !dialog.open || mode !== 'hand') return;
    const instance = window.com.wiris.js.JsHand.newInstance();
    hand = instance;
    const current = () => hand === instance && dialog.open;

    function pending() {
      recognitionVersion = draftVersion;
      clearTimeout(handTimer);
      handStatus('pending', '正在识别手写公式…');
      handTimer = setTimeout(() => {
        if (current()) handStatus('error', '识别超时，请重试或改用键盘。');
      }, 12000);
    }

    instance.addHandListener({
      strokesChanged: () => { if (current()) pending(); },
      contentChanged: () => {
        if (!current()) return;
        clearTimeout(handTimer);
        try {
          const mathml = instance.getMathML();
          const recognized = mathml ? readMathML(mathml).trim() : '';
          if (mode === 'hand' && recognitionVersion === draftVersion) input.value = recognized;
          handStatus('ready', recognized ? '识别完成，可检查或修改下面的公式。' : '在上方手写公式。');
        } catch (error) {
          handStatus('error', `${error.message} 可切换到键盘输入。`);
        }
      },
      recognitionError: () => {
        if (!current()) return;
        clearTimeout(handTimer);
        handStatus('error', '手写识别失败，请重试或改用键盘。');
      },
    });
    instance.insertInto(handCanvas);
    handStatus('ready', '用鼠标或触控笔在上方书写。');
  } catch (error) {
    if (generation === handGeneration && dialog.open) {
      hand = undefined;
      console.warn('MathType Hand load failed', error);
      handStatus('error', '无法加载手写组件，请重试或改用键盘。');
    }
  }
}

function setMode(next) {
  mode = next;
  $('mode-hand').setAttribute('aria-pressed', String(mode === 'hand'));
  $('mode-keyboard').setAttribute('aria-pressed', String(mode === 'keyboard'));
  $('mode-python').setAttribute('aria-pressed', String(mode === 'python'));
  $('hand-area').hidden = mode !== 'hand';
  $('python-reference').hidden = mode !== 'python';
  $('formula-label').textContent = mode === 'hand' ? '识别结果（可修改）' : mode === 'python' ? 'Python 数学表达式' : '输入公式';
  input.placeholder = mode === 'python' ? '例如 x**2 + math.sin(x) 或 lambda x: x**2' : '例如 y=x^2 或 x^2/25+y^2/9=1';
  input.dataset.syntax = mode;
  if (mode === 'python') input.setAttribute('aria-describedby', 'python-reference');
  else input.removeAttribute('aria-describedby');
  showText($('formula-error'), '');
  if (mode === 'hand' && !hand) createHand();
  if (mode !== 'hand') input.focus();
  updateSubmit();
}

function selectionChanged() {
  const [name] = selected;
  const property = $('property');
  const entries = selected.size === 1 ? availableProperties(curves.get(name).type) : [];
  property.replaceChildren(new Option('曲线特性', ''), ...entries.map(([command, label]) => new Option(label, command)));
  property.disabled = entries.length === 0;
  $('analyze').disabled = true;
  $('intersect').disabled = selected.size !== 2;
  $('differentiate-selected').disabled = selected.size !== 1 || curves.get(name).kind !== 'function';
  showText($('analysis-message'), '');
}

function refreshResultVisibility() {
  for (const result of results.values()) {
    const visible = result.sources.every((name) => curves.get(name).visible);
    for (const item of result.items) graph.show(item.name, visible);
  }
}

function removeResult(key) {
  const result = results.get(key);
  if (!result) return;
  for (const item of result.items) graph.remove(item.name);
  results.delete(key);
}

function renderResults() {
  $('results').replaceChildren(...Array.from(results.values(), (result) => {
    const row = document.createElement('li');
    const title = document.createElement('strong');
    title.textContent = result.title;
    row.append(title);
    if (result.range) {
      const scope = document.createElement('small');
      scope.textContent = `数值近似 · x ∈ [${result.range.map((x) => Number(x.toPrecision(4))).join(', ')}]`;
      row.append(scope);
    }
    for (const item of result.items) {
      const value = document.createElement('span');
      value.textContent = `${item.name}  ${item.value}`;
      row.append(value);
    }
    return row;
  }).reverse());
}

function addCurveRow(curve, previousRow) {
  const row = document.createElement('li');
  row.className = 'curve-row';
  row.dataset.name = curve.name;
  row.dataset.syntax = curve.inputMode || 'keyboard';
  row.dataset.visible = String(curve.visible);
  row.dataset.selected = String(selected.has(curve.name));
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = selected.has(curve.name);
  checkbox.setAttribute('aria-label', `选择 ${curve.text}`);
  checkbox.onchange = () => {
    if (checkbox.checked) selected.add(curve.name);
    else selected.delete(curve.name);
    row.dataset.selected = String(checkbox.checked);
    selectionChanged();
  };

  const formula = document.createElement('span');
  formula.className = 'curve-formula';
  formula.title = curve.text;
  const dot = document.createElement('span');
  dot.className = 'curve-color';
  dot.style.backgroundColor = `rgb(${curve.color.join(',')})`;
  formula.append(dot, curve.text);

  const edit = document.createElement('button');
  edit.type = 'button'; edit.dataset.edit = ''; edit.textContent = '编辑';
  edit.setAttribute('aria-label', `编辑 ${curve.text}`);
  edit.onclick = () => openFormula(curve);

  const visibility = document.createElement('button');
  visibility.type = 'button';
  visibility.dataset.visibility = '';
  visibility.textContent = curve.visible ? '隐藏' : '显示';
  visibility.onclick = () => {
    setCurveVisibility(curve, !curve.visible);
  };

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = '删除';
  remove.onclick = () => {
    removeCurve(curve.name);
  };
  row.append(checkbox, formula, edit, visibility, remove);
  if (previousRow) previousRow.replaceWith(row);
  else $('curves').append(row);
  updateCount();
}

function updateCount() {
  $('curve-count').textContent = curves.size;
  $('empty-curves').hidden = curves.size > 0;
}

function calculate(command, sources, title, evaluate, emptyMessage) {
  const key = [command, ...sources.map(({ name }) => name).sort()].join(':');
  try {
    const result = evaluate();
    removeResult(key);
    if (result.items.length) {
      results.set(key, { ...result, command, title, sources: sources.map(({ name }) => name) });
      refreshResultVisibility();
    }
    showText($('analysis-message'), result.items.length ? '' : emptyMessage(result.range));
    renderResults();
  } catch (error) {
    showText($('analysis-message'), error.message || '计算失败，请检查所选曲线。');
  }
}

function openFormula(curve) {
  if (dialog.open) return;
  editingName = curve?.name;
  input.value = curve?.text || '';
  draftVersion++;
  $('formula-title').textContent = curve ? '编辑曲线' : '新增一条曲线';
  submit.textContent = curve ? '保存修改并绘图' : '插入并绘图';
  if (curve && derivativeCurves.some((item) => item.name === curve.name)) { calculator.suspendDerivative(); lesson.pause(); }
  showText($('formula-error'), '');
  dialog.showModal();
  setMode(curve?.inputMode === 'python' ? 'python' : curve ? 'keyboard' : 'hand');
  if (curve) input.focus();
}
$('open-formula').onclick = () => openFormula();
function closeFormula() {
  mode = 'keyboard';
  ++handGeneration;
  clearTimeout(handTimer);
  hand = undefined;
  handState = 'idle';
  handCanvas.replaceChildren();
  dialog.close();
  editingName = undefined;
  $('formula-title').textContent = '新增一条曲线';
  submit.textContent = '插入并绘图';
}
$('dismiss-formula').onclick = $('cancel-formula').onclick = closeFormula;
dialog.oncancel = (event) => {
  event.preventDefault();
  closeFormula();
};
$('mode-hand').onclick = () => setMode('hand');
$('mode-keyboard').onclick = () => setMode('keyboard');
$('mode-python').onclick = () => setMode('python');
for (const button of document.querySelectorAll('[data-python-example]')) {
  button.onclick = () => {
    input.value = button.dataset.pythonExample;
    input.dispatchEvent(new Event('input'));
    input.focus();
  };
}
$('clear-hand').onclick = () => {
  input.value = '';
  createHand();
};
$('retry-hand').onclick = () => {
  if (!hand) return createHand();
  try { hand.setStrokes(hand.getStrokes()); } catch { createHand(); }
};
input.oninput = () => {
  draftVersion++;
  showText($('formula-error'), '');
  updateSubmit();
};
for (const button of document.querySelectorAll('[data-symbol]')) {
  button.onclick = () => {
    const symbol = mode === 'python' ? button.dataset.pythonSymbol || button.dataset.symbol : button.dataset.symbol;
    input.setRangeText(symbol, input.selectionStart, input.selectionEnd, 'end');
    const caret = input.selectionEnd + Number(button.dataset.caret ?? 0);
    input.setSelectionRange(caret, caret);
    input.focus();
    input.dispatchEvent(new Event('input'));
  };
}
function plotFormula() {
  if (submit.disabled) return;
  const text = input.value.trim();
  try {
    const inputMode = mode === 'python' ? 'python' : 'keyboard';
    if (editingName) editExpression(editingName, text, inputMode);
    else addExpression(text, undefined, inputMode);
    closeFormula();
  } catch (error) {
    showText($('formula-error'), error.message || '未能绘图。');
    input.focus();
  }
}
function addExpression(text, colorOverride, inputMode = 'keyboard') {
  if (!graph) throw new Error('绘图组件尚未就绪，请等待坐标系加载完成后再试。');
  const color = colorOverride || colors[colorIndex % colors.length];
  const formula = inputMode === 'python' ? pythonToFormula(text) : text;
  const curve = { ...graph.plot(compileFormula(formula), color), text, formula, inputMode, color, visible: true };
  colorIndex++;
  curves.set(curve.name, curve);
  addCurveRow(curve);
  return curve;
}
function editExpression(name, text, inputMode = 'keyboard') {
  const previous = curves.get(name);
  if (!previous) throw new Error('原曲线已被删除或替换，请重新选择需要编辑的曲线。');
  // Plot and validate first so an invalid edit never destroys the existing curve.
  const formula = inputMode === 'python' ? pythonToFormula(text) : text;
  const replacement = { ...graph.plot(compileFormula(formula), previous.color), text, formula, inputMode, color: previous.color, visible: previous.visible };
  graph.show(replacement.name, replacement.visible);
  const previousRow = document.querySelector(`.curve-row[data-name="${name}"]`);
  const associated = Array.from(results.entries()).filter(([, result]) => result.sources.includes(name));
  const isTeachingSource = derivativeCurves[0]?.name === name;
  if (derivativeCurves.some((curve) => curve.name === name)) {
    lesson.clear(); pendingDerivative = undefined;
    calculator.invalidateDerivative(isTeachingSource && replacement.kind === 'function' ? replacement.formula : undefined);
  }
  for (const [key] of associated) removeResult(key);
  graph.remove(name);
  const entries = Array.from(curves, ([key, curve]) => key === name ? [replacement.name, replacement] : [key, curve]);
  curves.clear(); for (const [key, curve] of entries) curves.set(key, curve);
  if (selected.delete(name)) selected.add(replacement.name);
  derivativeCurves = derivativeCurves.map((curve) => curve.name === name ? replacement : curve);
  addCurveRow(replacement, previousRow); selectionChanged();
  for (const [, result] of associated) {
    const sources = result.sources.map((source) => curves.get(source === name ? replacement.name : source));
    if (result.command === 'Intersect') {
      const [a, b] = sources;
      calculate('Intersect', sources, `交点 · ${a.text} 与 ${b.text}`, () => graph.intersect(a, b),
        (range) => range ? '修改后，当前横轴区间内未找到交点。' : '修改后未找到离散交点。');
    } else {
      const property = availableProperties(sources[0].type).find(([command]) => command === result.command);
      if (property) calculate(result.command, sources, `${property[1]} · ${sources[0].text}`,
        () => graph.analyze(sources[0], result.command), () => '修改后的曲线未找到此项结果。');
      else showText($('analysis-message'), '修改后的曲线类型不支持原分析操作，原结果已清除。');
    }
  }
  renderResults();
}
function setCurveVisibility(curve, visible) {
  curve.visible = visible; graph.show(curve.name, visible);
  const row = document.querySelector(`.curve-row[data-name="${curve.name}"]`);
  if (row) { row.dataset.visible = String(visible); row.querySelector('[data-visibility]').textContent = visible ? '隐藏' : '显示'; }
  refreshResultVisibility(); lesson.refresh();
}
function removeCurve(name) {
  if (!curves.has(name)) return;
  if (lesson.owns(name)) lesson.clear();
  for (const [key, result] of results) if (result.sources.includes(name)) removeResult(key);
  graph.remove(name); curves.delete(name); selected.delete(name);
  document.querySelector(`.curve-row[data-name="${name}"]`)?.remove();
  updateCount(); selectionChanged(); renderResults();
}
function synchronizeDerivative(result) {
  pendingDerivative = result;
  if (!graph) { $('derivative-status').textContent = '导数已算出，坐标系就绪后自动同步。'; return; }
  const created = [];
  try {
    const teaching = result.teaching;
    // Validate both formulas before changing any existing construction.
    compileFormula(teaching.source); compileFormula(teaching.derivative);
    created.push(addExpression(teaching.source, [34, 92, 212]));
    created.push(addExpression(teaching.derivative, [199, 104, 19]));
    if (teaching.order > 1) created.push(addExpression(result.plots[1].formula, [130, 64, 166]));
    lesson.start(graph, created[0], created[1], teaching);
    for (const curve of derivativeCurves) removeCurve(curve.name);
    derivativeCurves = created;
    $('derivative-status').textContent = teaching.order > 1 ? '已同步原函数、一阶导函数和所选高阶导函数；切线与变化率演示始终使用一阶导数。' : '原函数与一阶导函数已同步到右侧坐标系。';
    pendingDerivative = undefined;
    $('derivative-status').dataset.state = 'ready';
  } catch (error) {
    for (const curve of created) removeCurve(curve.name);
    lesson.clear(); pendingDerivative = undefined;
    $('derivative-status').textContent = `公式结果已保留，暂不能同步教学图像：${error.message} 含参数时请先换成具体数值。`;
    $('derivative-status').dataset.state = 'error';
  }
}
$('formula-form').onsubmit = (event) => {
  event.preventDefault();
  plotFormula();
};
$('property').onchange = () => { $('analyze').disabled = !$('property').value; };
$('analyze').onclick = () => {
  const [name] = selected;
  const curve = curves.get(name);
  const property = $('property');
  calculate(property.value, [curve], `${property.selectedOptions[0].text} · ${curve.text}`,
    () => graph.analyze(curve, property.value), (range) => range ? '当前横轴区间内未找到结果。' : '未找到有效结果。');
};
$('intersect').onclick = () => {
  const [a, b] = Array.from(selected, (name) => curves.get(name));
  calculate('Intersect', [a, b], `交点 · ${a.text} 与 ${b.text}`, () => graph.intersect(a, b),
    (range) => range ? '当前横轴区间内未找到交点。' : '未找到离散交点。');
};
$('reset-view').onclick = () => graph.resetView();
$('clear-all').onclick = () => {
  pendingDerivative = undefined;
  calculator.reset(); lesson.clear(); closeFormula();
  graph?.clear();
  curves.clear(); results.clear(); selected.clear(); derivativeCurves = []; colorIndex = 0;
  $('curves').replaceChildren(); $('results').replaceChildren();
  input.value = ''; draftVersion++;
  showText($('formula-error'), ''); showText($('analysis-message'), '');
  updateCount(); selectionChanged(); updateSubmit();
};
$('retry-graph').onclick = loadGraph;
$('differentiate-selected').onclick = () => {
  const curve = curves.get(selected.values().next().value);
  if (curve?.kind === 'function') calculator.derive({ formula: curve.formula || curve.text, point: '1', order: 1 });
};
new ResizeObserver(resizeGraph).observe(graphHost);
window.addEventListener('resize', resizeGraph);
initializeSidebarResize();
const calculator = initializeCalculator(addExpression, {
  onDerivative: synchronizeDerivative,
  onEdit: () => { pendingDerivative = undefined; lesson.clear(); },
  onWorkspace: (id) => { if (id !== 'graph-workspace') lesson.pause(); },
});
loadGraph();
