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
    resize(width, height) { api.setSize(width, height); },
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
  };
}
