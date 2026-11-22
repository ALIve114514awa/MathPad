import { lessonLineColors } from './graph.mjs';

const roles = ['原函数 f(x)', '一阶导函数 f′(x)', '二阶导函数 f″(x)', '三阶导函数 f‴(x)', '四阶导函数 f⁽⁴⁾(x)'];
const lines = [
  { key: 'tangent', label: '切线', undefinedText: '此处切线未定义' },
  { key: 'secant', label: '割线', undefinedText: '当前割线未定义' },
];

function number(value) {
  return String(Number(value.toPrecision(7))).replaceAll('-', '−');
}

function difference(variable, value) {
  if (value === 0) return variable;
  return `${variable} ${value < 0 ? '+' : '−'} ${number(Math.abs(value))}`;
}

function equation(a, y, slope) {
  if (slope === 0) return `y = ${number(y)}`;
  const factor = slope === 1 ? '' : slope === -1 ? '−' : number(slope);
  const x = a === 0 ? `${factor}x` : `${factor}(${difference('x', a)})`;
  return `${difference('y', y)} = ${x}`;
}

function textRow(tag, color, label) {
  const row = document.createElement(tag);
  row.className = 'derivative-text-row';
  const dot = document.createElement('span');
  dot.className = 'curve-color';
  dot.style.backgroundColor = `rgb(${color.join(',')})`;
  const formula = document.createElement('span');
  formula.className = 'curve-formula';
  const title = document.createElement('small');
  title.textContent = label;
  const value = document.createElement('span');
  formula.append(title, value);
  row.append(dot, formula);
  return { row, formula, value };
}

export function initializeDerivativeGroup(preview) {
  let group;
  let lineState;
  let placement = 'both';
  function clear() {
    if (!group) return;
    for (const { item, position } of group.children) position.replaceWith(item);
    for (const label of group.labels) label.remove();
    group.item.classList.remove('derivative-group');
    group.branch.remove();
    preview.replaceChildren();
    preview.hidden = true;
    group = undefined;
  }

  function updateLines(state) {
    lineState = state;
    if (!group) return;
    for (const { key, undefinedText, displays } of group.lines) {
      const line = state?.[key];
      for (const { row, value, note } of displays) {
        row.hidden = !line;
        if (!line) continue;
        row.dataset.unavailable = String(!line.valid);
        row.dataset.hiddenOnPlot = String(line.valid && !line.visible);
        value.textContent = line.valid ? equation(state.a, state.y, line.slope) : undefinedText;
        const notes = [];
        if (line.valid && !(line.slope === 0 ? [state.y] : [state.a, state.y, line.slope]).every(Number.isSafeInteger)) {
          notes.push('数值近似');
        }
        if (line.valid && !line.visible) notes.push('图上已隐藏');
        note.textContent = notes.join(' · ');
        note.hidden = !notes.length;
      }
    }
  }

  return {
    mount(source, derivatives, order) {
      clear();
      const branches = [document.createElement('ul'), document.createElement('ul')];
      for (const branch of branches) branch.className = 'derivative-branch';
      const [branch, previewBranch] = branches;
      const members = [source, ...derivatives];
      const rows = members.map(({ name }) => document.querySelector(`.curve-row[data-name="${name}"]`));
      const sourceItem = rows[0].parentElement;
      const children = [];
      const labels = members.map((curve, index) => {
        const label = roles[index === 2 ? order : index];
        const row = rows[index];
        const item = row.parentElement;
        const badge = document.createElement('small');
        badge.className = 'curve-role';
        badge.textContent = label;
        row.prepend(badge);
        const mirror = textRow(index ? 'li' : 'div', curve.color, label);
        mirror.value.textContent = curve.text;
        if (index) {
          // Keep each row's original position for when it returns to the flat list.
          const position = document.createComment('derivative row');
          item.before(position);
          branch.append(item);
          children.push({ item, position });
          previewBranch.append(mirror.row);
        } else {
          preview.append(mirror.row, previewBranch);
        }
        return badge;
      });
      sourceItem.classList.add('derivative-group');
      sourceItem.append(branch);
      const lineRows = lines.map((line) => ({
        ...line,
        displays: branches.map((target) => {
          const display = textRow('li', lessonLineColors[line.key], line.label);
          display.row.dataset.lessonLine = line.key;
          const note = document.createElement('small');
          display.formula.append(note);
          target.append(display.row);
          return { ...display, note };
        }),
      }));
      group = { source, item: sourceItem, branch, labels, children, members, lines: lineRows };
      preview.hidden = placement === 'list';
      updateLines(lineState);
    },
    clear, updateLines,
    setPlacement(value) {
      placement = value;
      preview.hidden = !group || placement === 'list';
    },
    get sourceName() { return group?.source.name; },
    owns(name) { return group?.members.some((curve) => curve.name === name) ?? false; },
  };
}
