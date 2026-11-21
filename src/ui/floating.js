const ball = document.getElementById('floating-ball');
let pointer;
ball.addEventListener('pointerdown', event => {
  if (event.button !== 0 || pointer !== undefined) return;
  event.preventDefault(); pointer = event.pointerId;
  ball.setPointerCapture(pointer); ball.classList.add('pressed');
  window.mathPadFloating.down();
});
ball.addEventListener('pointerup', event => {
  if (event.pointerId !== pointer) return;
  pointer = undefined; ball.classList.remove('pressed');
  window.mathPadFloating.up();
});
function cancel() {
  if (pointer === undefined) return;
  pointer = undefined; ball.classList.remove('pressed'); window.mathPadFloating.cancel();
}
ball.addEventListener('pointercancel', cancel);
ball.addEventListener('lostpointercapture', cancel);
ball.addEventListener('click', event => {
  if (event.detail === 0) { window.mathPadFloating.down(); window.mathPadFloating.up(); }
});
ball.addEventListener('contextmenu', event => { event.preventDefault(); cancel(); window.mathPadFloating.menu(); });
window.mathPadFloating.onDrag(dragging => ball.classList.toggle('dragging', dragging));
window.mathPadFloating.onPresentation(state => {
  ball.dataset.edge = state.edge;
  ball.dataset.offset = String(state.offset);
  ball.dataset.retracted = String(state.retracted);
  ball.title = state.autoRetract ? 'Math Pad · 贴边后自动收起，靠近展开；点击打开，右键菜单' : 'Math Pad · 拖动移动，贴边吸附；点击打开，右键菜单';
  ball.setAttribute('aria-label', state.autoRetract ? '打开 Math Pad。拖动可移动，贴边后自动收起。' : '打开 Math Pad。拖动可移动，贴边吸附。');
  ball.style.transform = `translate(${state.x}px, ${state.y}px)`;
  const opacity = String(1 - state.offset / 32);
  for (const label of ball.children) label.style.opacity = opacity;
});
