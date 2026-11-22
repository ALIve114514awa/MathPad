import { createDerivativeModel } from './derivative-model.mjs';

const $ = (id) => document.getElementById(id);
const number = (value) => Number.isFinite(value) ? Number(value.toPrecision(7)).toString() : '未定义';

export function initializeDerivativeLesson(onVisibility, getDuration, onLines) {
  let model, scene, source, derived, frame, sign = 1, a = 1, lastState;
  const host = $('derivative-teaching');
  function pause() {
    cancelAnimationFrame(frame); frame = undefined;
    $('lesson-play').textContent = '播放 h → 0';
    $('lesson-play').setAttribute('aria-pressed', 'false');
  }
  function refresh() {
    if (!model) return;
    try {
      const h = sign * 10 ** Number($('lesson-h').value);
      const state = model.at(a, h); lastState = state;
      $('lesson-show-derivative').checked = derived.visible;
      $('lesson-a').value = number(a);
      const slider = $('lesson-a-slider');
      slider.min = Math.min(-5, Math.floor(a - 1)); slider.max = Math.max(5, Math.ceil(a + 1)); slider.value = a;
      $('lesson-h-value').textContent = number(h);
      $('lesson-direction').textContent = sign === 1 ? '从右侧趋近' : '从左侧趋近';
      const fields = [
        ['f(a)', state.y], ['Δx', h], ['Δy', state.deltaY], ['割线斜率 Δy/Δx', state.secant], ['一阶导数 f′(a)', state.slope],
      ];
      $('lesson-readout').replaceChildren(...fields.map(([label, value]) => {
        const field = document.createElement('span'); field.textContent = `${label} ≈ ${number(value)}`; return field;
      }));
      $('lesson-notice').textContent = state.notice;
      $('lesson-notice').dataset.invalid = String(!state.tangentValid || !state.secantValid);
      $('lesson-table').tBodies[0].replaceChildren(...state.sides.map((item) => {
        const row = document.createElement('tr');
        for (const value of [item.step, item.left, item.right]) { const cell = document.createElement('td'); cell.textContent = number(value); row.append(cell); }
        return row;
      }));
      host.dataset.a = a; host.dataset.h = h;
      host.dataset.slope = number(state.slope); host.dataset.secant = number(state.secant);
      const tangent = $('lesson-show-tangent').checked;
      scene.update(state, {
        tangent,
        derivativeVisible: $('lesson-show-derivative').checked,
        visible: source.visible,
      });
      onLines({
        a: state.a, y: state.y,
        tangent: { slope: state.slope, valid: state.tangentValid, visible: source.visible && tangent },
        secant: { slope: state.secant, valid: state.secantValid, visible: source.visible },
      });
    } catch (error) {
      pause(); onLines(undefined);
      $('lesson-notice').textContent = error.message; $('lesson-notice').dataset.invalid = 'true';
    }
  }
  function clear() {
    pause(); scene?.dispose(); model = scene = source = derived = undefined;
    lastState = undefined;
    for (const key of ['a', 'h', 'slope', 'secant']) delete host.dataset[key];
    host.hidden = true;
    onLines(undefined);
  }
  $('lesson-a').oninput = () => {
    const value = Number($('lesson-a').value);
    if ($('lesson-a').value.trim() && Number.isFinite(value)) { pause(); a = value; refresh(); }
  };
  $('lesson-a-slider').oninput = () => { pause(); a = Number($('lesson-a-slider').value); refresh(); };
  $('lesson-h').oninput = () => { pause(); refresh(); };
  $('lesson-direction').onclick = () => { pause(); sign *= -1; refresh(); };
  $('lesson-show-tangent').onchange = refresh;
  $('lesson-show-derivative').onchange = () => { if (derived) onVisibility(derived, $('lesson-show-derivative').checked); };
  $('lesson-clear').onclick = clear;
  $('lesson-focus').onclick = () => scene?.focus(lastState);
  $('lesson-play').onclick = () => {
    if (!model) return;
    if (frame !== undefined) return pause();
    const begin = performance.now();
    const duration = getDuration();
    const start = Math.max(0, Number($('lesson-h').value));
    let previous = 0;
    $('lesson-play').textContent = '暂停演示'; $('lesson-play').setAttribute('aria-pressed', 'true');
    function animate(time) {
      const progress = Math.min(1, (time - begin) / duration);
      if (time - previous > 45 || progress === 1) {
        $('lesson-h').value = start + (-3 - start) * progress; refresh(); previous = time;
      }
      if (progress < 1 && model) frame = requestAnimationFrame(animate);
      else pause();
    }
    frame = requestAnimationFrame(animate);
  };
  document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
  $('lesson-definition-math').textContent = 'f′(a) = lim[h→0] (f(a+h)−f(a))/h，h≠0';
  window.katex?.render("f'(a)=\\lim_{h\\to0}\\frac{f(a+h)-f(a)}{h},\\quad h\\ne0", $('lesson-definition-math'), { throwOnError: false, trust: false });
  return {
    start(graph, original, derivative, teaching) {
      const nextModel = createDerivativeModel(teaching.source, teaching.derivative);
      clear(); source = original; derived = derivative; model = nextModel;
      a = Number.isFinite(teaching.point) ? teaching.point : 0;
      sign = 1; $('lesson-h').value = 0;
      $('lesson-show-tangent').checked = $('lesson-show-derivative').checked = true;
      scene = graph.teach(derivative, (x) => { pause(); a = x; refresh(); });
      host.hidden = false;
      host.querySelector('.legend-source').style.color = `rgb(${source.color.join(',')})`;
      $('lesson-question').textContent = teaching.source === 'x^3'
        ? '观察 a=0：切线水平，函数在两侧仍继续上升。导数为零一定是极值吗？'
        : teaching.source === 'abs(x)'
          ? '观察 a=0 的左右差商：它们是否趋于同一个值？此处能画出唯一切线吗？'
          : '先猜切线向上还是向下。让 B 靠近 A，比较割线斜率与 f′(a)；移动 a，观察导函数上的对应点。';
      refresh();
      const currentScene = scene;
      requestAnimationFrame(() => requestAnimationFrame(() => { if (scene === currentScene) scene.focus(lastState); }));
    },
    refresh, pause, clear,
  };
}
