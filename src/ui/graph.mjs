const functions = [['Root', '零点'], ['Extremum', '局部极值']];
const conics = [['Focus', '焦点'], ['Center', '中心'], ['Vertex', '顶点']];
const propertyTypes = {
  function: functions,
  circle: [['Center', '圆心']],
  ellipse: conics,
  hyperbola: [...conics, ['Asymptote', '渐近线']],
  parabola: [['Focus', '焦点'], ['Vertex', '顶点'], ['Directrix', '准线']],
  line: [],
};

export function availableProperties(type) {
  return propertyTypes[type] ?? [];
}

export function createGraph(api) {
  let nextId = 1;

  function view() {
    const properties = api.getViewProperties(1);
    return typeof properties === 'string' ? JSON.parse(properties) : properties;
  }

  function visibleRange() {
    const { xMin, width, invXscale } = view();
    const xMax = xMin + width * invXscale;
    if (!Number.isFinite(xMin) || !Number.isFinite(xMax) || xMin >= xMax) {
      throw new Error('无法读取坐标系范围，请重置视图后再试。');
    }
    return [xMin, xMax];
  }

  function run(command, keep) {
    const before = new Set(api.getAllObjectNames());
    try {
      api.evalCommandGetLabels(command);
      return api.getAllObjectNames().filter((name) => {
        if (before.has(name)) return false;
        if (api.isDefined(name) && keep(name, api.getObjectType(name))) return true;
        api.deleteObject(name);
        return false;
      });
    } catch (error) {
      for (const name of api.getAllObjectNames()) {
        if (!before.has(name)) api.deleteObject(name);
      }
      throw error;
    }
  }

  function collect(command, range) {
    const points = [];
    const names = run(command, (name, type) => {
      if (type === 'line') return true;
      if (type !== 'point') return false;
      const x = api.getXcoord(name);
      const y = api.getYcoord(name);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return false;
      if (points.some(([a, b]) => Math.abs(a - x) < 1e-9 && Math.abs(b - y) < 1e-9)) return false;
      points.push([x, y]);
      return true;
    });
    const items = names.map((name) => {
      api.setColor(name, 80, 59, 147);
      api.setLabelVisible(name, true);
      if (api.getObjectType(name) === 'line') api.setLineStyle(name, 1);
      const value = api.getObjectType(name) === 'point'
        ? `(${[api.getXcoord(name), api.getYcoord(name)].map((coordinate) => Number(coordinate.toFixed(6))).join(', ')})`
        : api.getValueString(name);
      return { name, value: value.startsWith(`${name}:`) ? value.slice(name.length + 1).trimStart() : value };
    });
    return { items, range };
  }

  api.setRounding('6');
  api.setErrorDialogsActive(false);
  return {
    resetView() {
      const { width, height } = view();
      const scale = Math.max(14 / width, 10 / height);
      api.setCoordSystem(-scale * width / 2, scale * width / 2, -scale * height / 2, scale * height / 2);
    },
    resize(width, height) { api.setSize(Math.round(width), Math.round(height)); api.recalculateEnvironments(); },
    clear() {
      api.setRepaintingActive(false);
      try { for (const name of api.getAllObjectNames()) if (api.exists(name)) api.deleteObject(name); nextId = 1; }
      finally { api.setRepaintingActive(true); }
      this.resetView();
    },
    plot(formula, rgb) {
      const name = `mp${nextId++}`;
      const command = formula.kind === 'function' ? `${name}(x)=${formula.expression}` : `${name}:${formula.expression}`;
      const plotted = run(command, (object, type) => object === name && Object.hasOwn(propertyTypes, type));
      if (plotted.length !== 1) throw new Error('未能绘图。请检查公式是否定义了一条有效曲线。');
      api.setColor(name, ...rgb);
      api.setLineThickness(name, 4);
      api.setLabelVisible(name, false);
      return { name, type: api.getObjectType(name), ...formula };
    },
    intersect(a, b) {
      const numerical = !a.polynomial || !b.polynomial;
      if (numerical && (a.kind !== 'function' || b.kind !== 'function')) {
        throw new Error('一般函数与圆锥曲线的组合暂不支持自动求交。');
      }
      const range = numerical ? visibleRange() : undefined;
      if (a.kind === b.kind && a.expression === b.expression) return { items: [], range };
      return collect(`Intersect(${[a.name, b.name, ...(range ?? [])].join(',')})`, range);
    },
    analyze(curve, command) {
      if (!availableProperties(curve.type).some(([name]) => command === name)) {
        throw new Error('该曲线不支持此项计算。');
      }
      const interval = curve.kind === 'function' && !curve.polynomial;
      const range = interval ? visibleRange() : undefined;
      if (interval && command === 'Root') command = 'Roots';
      return collect(`${command}(${[curve.name, ...(range ?? [])].join(',')})`, range);
    },
    remove(name) { api.deleteObject(name); },
    show(name, visible) { api.setVisible(name, visible); },
    teach(derivative, onMove) {
      // Uppercase labels make coordinate pairs points rather than vectors in GeoGebra.
      const prefix = `Lesson${nextId++}`;
      const names = {};
      let changing = false;
      let observedX = NaN;
      function create(key, definition) {
        const name = `${prefix}${key}`;
        if (!api.evalCommand(`${name}${definition.startsWith(':') ? '' : '='}${definition}`) || !api.exists(name)) {
          console.warn('Derivative construction failed:', name, definition, api.getAllObjectNames().filter((item) => item.startsWith(prefix)));
          throw new Error('无法建立导数演示，请重新计算后再试。');
        }
        names[key] = name;
        api.setFixed(name, true, false);
        api.setLabelVisible(name, false);
        return name;
      }
      function dispose() {
        if (names.p) api.unregisterObjectUpdateListener(names.p);
        for (const name of Object.values(names).reverse()) if (api.exists(name)) api.deleteObject(name);
        if (api.exists(derivative.name)) api.setVisible(derivative.name, derivative.visible);
      }
      try {
        const p = create('p', 'Point(xAxis)');
        const k = create('k', '1');
        const a = create('a', '(0,0)');
        const b = create('b', '(1,1)');
        const c = create('c', '(1,0)');
        create('d', '(0,1)');
        for (const key of ['a', 'b', 'c', 'd']) api.setFixed(names[key], false, false);
        create('t', `:y=${k}*(x-x(${p}))+y(${a})`);
        create('s', `Line(${a},${b})`);
        create('dx', `Segment(${a},${c})`); create('dy', `Segment(${c},${b})`);
        api.setFixed(p, false, true);
        for (const [key, caption, color] of [
          ['p', 'a', [34, 92, 212]], ['a', 'A', [34, 92, 212]],
          ['b', 'B', [130, 64, 166]], ['d', 'f′(a)', [199, 104, 19]],
        ]) {
          api.setCaption(names[key], caption); api.setLabelStyle(names[key], 3);
          api.setPointSize(names[key], key === 'p' ? 6 : 5); api.setColor(names[key], ...color);
          api.setLayer(names[key], key === 'p' ? 7 : 6);
        }
        for (const key of ['s', 'dx', 'dy']) { api.setColor(names[key], 130, 64, 166); api.setLineStyle(names[key], 1); api.setLineThickness(names[key], 3); }
        api.setColor(names.t, 17, 124, 91); api.setLineThickness(names.t, 4);
        api.registerObjectUpdateListener(p, () => {
          const x = api.getXcoord(p);
          if (!changing && Number.isFinite(x) && Math.abs(x - observedX) > 1e-9) { observedX = x; onMove(x); }
        });
        return {
          focus(state) {
            if (!state?.pointValid) return;
            const { width, height } = view();
            const values = [0, state.y, state.nextY, state.slope].filter(Number.isFinite);
            const low = Math.min(...values), high = Math.max(...values);
            const margin = Math.max(.8, (high - low) * .15);
            const scale = Math.max(6 / width, (high - low + 2 * margin) / height);
            const cx = state.a + state.h / 2, cy = (low + high) / 2;
            api.setCoordSystem(cx - width * scale / 2, cx + width * scale / 2, cy - height * scale / 2, cy + height * scale / 2);
          },
          update(state, { tangent = true, derivativeVisible = true, visible = true } = {}) {
            changing = true;
            api.setRepaintingActive(false);
            try {
              observedX = state.a;
              if (Math.abs(api.getXcoord(p) - state.a) > 1e-10) api.setCoords(p, state.a, 0);
              if (state.pointValid) api.setCoords(a, state.a, state.y);
              if (state.secantValid) { api.setCoords(b, state.a + state.h, state.nextY); api.setCoords(c, state.a + state.h, state.y); }
              if (state.tangentValid) api.setCoords(names.d, state.a, state.slope);
              api.setValue(k, state.tangentValid ? state.slope : 0);
              const shown = { p: visible, a: visible && state.pointValid, b: visible && state.secantValid,
                d: visible && derivativeVisible && state.tangentValid, t: visible && tangent && state.tangentValid,
                s: visible && state.secantValid, dx: visible && state.secantValid, dy: visible && state.secantValid };
              for (const [key, name] of Object.entries(names)) {
                api.setVisible(name, Boolean(shown[key]));
                if (['p', 'a', 'b', 'd'].includes(key)) api.setLabelVisible(name, Boolean(shown[key]));
              }
              api.setVisible(derivative.name, derivativeVisible && derivative.visible);
            } finally { api.setRepaintingActive(true); changing = false; }
          },
          dispose,
        };
      } catch (error) { dispose(); throw error; }
    },
  };
}
