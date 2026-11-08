import { compileFormula } from './expression.mjs';
import { readMathML } from './mathml.mjs';
import { availableProperties, createGraph } from './graph.mjs';

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
let mode = 'hand';
let hand;
let handState = 'idle';
let handTimer;
let handGeneration = 0;
let draftVersion = 0;

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
      reject(new Error('无法连接组件服务。'));
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
  const { clientWidth, clientHeight } = graphHost;
  if (graph && clientWidth > 0 && clientHeight > 0) graph.resize(clientWidth, clientHeight);
}

async function loadGraph() {
  $('graph-state').dataset.state = 'loading';
  $('graph-state').textContent = '正在加载绘图组件…';
  $('graph-message-title').textContent = '正在准备坐标系';
  $('graph-message-detail').textContent = '正在连接 GeoGebra。';
  $('retry-graph').hidden = true;
  const target = document.createElement('div');
  graphHost.replaceChildren(target);
  try {
    await loadScript('https://www.geogebra.org/apps/deployggb.js');
    graph = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('绘图组件加载超时。')), 60000);
      try {
        const applet = new window.GGBApplet({
          appName: 'classic', language: 'en', perspective: 'G', preventFocus: true,
          width: Math.max(100, graphHost.clientWidth), height: Math.max(100, graphHost.clientHeight),
          showToolBar: false, showMenuBar: false, showAlgebraInput: false,
          showResetIcon: false, showZoomButtons: true, showFullscreenButton: false,
          enableRightClick: false, enableShiftDragZoom: true, allowStyleBar: false,
          appletOnLoad: (api) => {
            clearTimeout(timer);
            if (!target.isConnected) return;
            try { resolve(createGraph(api)); } catch (error) { reject(error); }
          },
        }, true);
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
  } catch (error) {
    graph = undefined;
    target.remove();
    console.warn('GeoGebra load failed', error);
    $('graph-state').dataset.state = 'error';
    $('graph-state').textContent = '绘图组件不可用';
    $('graph-message-title').textContent = '无法加载坐标系';
    $('graph-message-detail').textContent = '请检查网络连接，然后重新加载。';
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
  $('hand-area').hidden = mode !== 'hand';
  $('formula-label').textContent = mode === 'hand' ? '识别结果（可修改）' : '输入公式';
  if (mode === 'hand' && !hand) createHand();
  if (mode === 'keyboard') input.focus();
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

function addCurveRow(curve) {
  const row = document.createElement('li');
  row.className = 'curve-row';
  row.dataset.visible = 'true';
  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
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

  const visibility = document.createElement('button');
  visibility.type = 'button';
  visibility.textContent = '隐藏';
  visibility.onclick = () => {
    curve.visible = !curve.visible;
    graph.show(curve.name, curve.visible);
    row.dataset.visible = String(curve.visible);
    visibility.textContent = curve.visible ? '隐藏' : '显示';
    refreshResultVisibility();
  };

  const remove = document.createElement('button');
  remove.type = 'button';
  remove.textContent = '删除';
  remove.onclick = () => {
    for (const [key, result] of results) {
      if (result.sources.includes(curve.name)) removeResult(key);
    }
    graph.remove(curve.name);
    curves.delete(curve.name);
    selected.delete(curve.name);
    row.remove();
    updateCount();
    selectionChanged();
    renderResults();
  };
  row.append(checkbox, formula, visibility, remove);
  $('curves').append(row);
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
      results.set(key, { ...result, title, sources: sources.map(({ name }) => name) });
      refreshResultVisibility();
    }
    showText($('analysis-message'), result.items.length ? '' : emptyMessage(result.range));
    renderResults();
  } catch (error) {
    showText($('analysis-message'), error.message || '计算失败，请检查所选曲线。');
  }
}

$('open-formula').onclick = () => {
  input.value = '';
  showText($('formula-error'), '');
  dialog.showModal();
  setMode('hand');
};
function closeFormula() {
  ++handGeneration;
  clearTimeout(handTimer);
  hand = undefined;
  handState = 'idle';
  handCanvas.replaceChildren();
  dialog.close();
}
$('dismiss-formula').onclick = $('cancel-formula').onclick = closeFormula;
dialog.oncancel = (event) => {
  event.preventDefault();
  closeFormula();
};
$('mode-hand').onclick = () => setMode('hand');
$('mode-keyboard').onclick = () => setMode('keyboard');
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
    input.setRangeText(button.dataset.symbol, input.selectionStart, input.selectionEnd, 'end');
    const caret = input.selectionEnd + Number(button.dataset.caret ?? 0);
    input.setSelectionRange(caret, caret);
    input.focus();
    input.dispatchEvent(new Event('input'));
  };
}
$('formula-form').onsubmit = (event) => {
  event.preventDefault();
  if (submit.disabled) return;
  const text = input.value.trim();
  try {
    const color = colors[colorIndex % colors.length];
    const curve = { ...graph.plot(compileFormula(text), color), text, color, visible: true };
    colorIndex++;
    curves.set(curve.name, curve);
    addCurveRow(curve);
    closeFormula();
  } catch (error) {
    showText($('formula-error'), error.message || '未能绘图。');
    input.focus();
  }
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
$('retry-graph').onclick = loadGraph;
new ResizeObserver(resizeGraph).observe(graphHost);
loadGraph();
