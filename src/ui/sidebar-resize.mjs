export function initializeSidebarResize() {
  const workspace = document.getElementById('graph-workspace');
  const lesson = document.getElementById('derivative-teaching');
  const sides = [
    { id: 'input-sidebar', handle: 'sidebar-resizer', key: 'mathpad.sidebarWidth', css: '--sidebar-width', min: 220, max: 640, defaultWidth: 300, direction: 1 },
    { id: 'derivative-teaching', handle: 'lesson-resizer', key: 'mathpad.lessonWidth', css: '--lesson-width', min: 220, max: 480, defaultWidth: 280, direction: -1 },
  ].map((side) => {
    let preferred = side.defaultWidth;
    try { const saved = Number(localStorage.getItem(side.key)); if (saved >= side.min && saved <= side.max) preferred = saved; } catch {}
    return { ...side, preferred, element: document.getElementById(side.id), separator: document.getElementById(side.handle) };
  });
  const clamp = (value, min, max) => Math.round(Math.max(min, Math.min(max, value)));
  const paired = () => !lesson.hidden && window.matchMedia('(min-width: 821px)').matches;
  function widths() {
    const values = sides.map(side => clamp(side.preferred, side.min, side.max));
    if (paired()) {
      const available = Math.max(440, workspace.clientWidth - 340);
      const excess = values[0] + values[1] - available;
      if (excess > 0) {
        const room = values[0] + values[1] - 440;
        values[0] -= Math.round(excess * (values[0] - 220) / room);
        values[1] = available - values[0];
      }
    } else values[0] = clamp(values[0], 220, Math.max(220, workspace.clientWidth - 300));
    return values;
  }
  function maximum(index, values) {
    return Math.max(sides[index].min, Math.min(sides[index].max,
      workspace.clientWidth - (paired() ? values[1 - index] + 340 : 300)));
  }
  function apply() {
    if (workspace.clientWidth <= 0) return;
    const values = widths();
    sides.forEach((side, index) => {
      workspace.style.setProperty(side.css, `${values[index]}px`);
      side.separator.setAttribute('aria-valuemin', side.min);
      side.separator.setAttribute('aria-valuemax', maximum(index, values));
      side.separator.setAttribute('aria-valuenow', values[index]);
      side.separator.setAttribute('aria-valuetext', `${values[index]} 像素`);
    });
  }
  for (const [index, side] of sides.entries()) {
    let drag;
    const save = () => { try { localStorage.setItem(side.key, String(side.preferred)); } catch {} };
    function finish() { if (!drag) return; drag = undefined; document.body.classList.remove('resizing-sidebar'); save(); }
    side.separator.onpointerdown = (event) => {
      if (event.button !== 0) return;
      event.preventDefault(); side.separator.focus();
      drag = { x: event.clientX, width: side.element.getBoundingClientRect().width };
      side.separator.setPointerCapture(event.pointerId); document.body.classList.add('resizing-sidebar');
    };
    side.separator.onpointermove = (event) => {
      if (!drag) return;
      side.preferred = clamp(drag.width + side.direction * (event.clientX - drag.x), side.min, maximum(index, widths())); apply();
    };
    side.separator.onpointerup = side.separator.onpointercancel = side.separator.onlostpointercapture = finish;
    side.separator.ondblclick = () => { side.preferred = side.defaultWidth; apply(); save(); };
    side.separator.onkeydown = (event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home'].includes(event.key)) return;
      event.preventDefault();
      side.preferred = event.key === 'Home' ? side.defaultWidth : clamp(Number(side.separator.getAttribute('aria-valuenow')) + side.direction * (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 40 : 16), side.min, maximum(index, widths()));
      apply(); save();
    };
  }
  new ResizeObserver(apply).observe(workspace);
  new MutationObserver(apply).observe(lesson, { attributes: true, attributeFilter: ['hidden'] });
  apply();
}
