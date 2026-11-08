export function readMathML(source) {
  if (!source || source.length > 25000 || /<!DOCTYPE/i.test(source)) throw new Error('识别结果为空或过长。');
  const document = new DOMParser().parseFromString(source, 'application/xml');
  const root = document.documentElement;
  if (root.localName !== 'math' || document.getElementsByTagName('parsererror').length) {
    throw new Error('无法读取手写识别结果。');
  }
  return translate(root);
}

function translate(node) {
  const children = Array.from(node.children);
  const values = () => children.map(translate);
  switch (node.localName) {
    case 'math': case 'mrow': case 'mstyle': case 'mpadded':
      return translateRow(children);
    case 'semantics':
      return children.length ? translate(children[0]) : '';
    case 'mi': case 'mn': case 'mo': case 'mtext':
      return node.textContent.trim();
    case 'mspace':
      return '';
    case 'mfrac': {
      const [numerator, denominator] = values();
      return `((${numerator})/(${denominator}))`;
    }
    case 'msup': {
      const [base, exponent] = values();
      return `(${base})^(${exponent})`;
    }
    case 'msqrt':
      return `sqrt(${translateRow(children)})`;
    case 'mroot': {
      const [base, exponent] = values();
      return `nroot(${base},${exponent})`;
    }
    case 'mfenced': {
      const open = node.getAttribute('open') ?? '(';
      const close = node.getAttribute('close') ?? ')';
      const separator = node.getAttribute('separators') ?? ',';
      const body = children.some((child) => child.localName === 'mo')
        ? translateRow(children) : values().join(separator[0] ?? '');
      if (open === '|' && close === '|') return `abs(${body})`;
      if ('([{'.includes(open) && ')]}'.includes(close)) return `(${body})`;
      throw new Error('请检查识别结果中的括号。');
    }
    default:
      throw new Error(`暂不支持手写结果中的 ${node.localName}。`);
  }
}

function translateRow(children) {
  const parts = [];
  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    if (child.localName === 'msub' && child.children[0]?.textContent === 'log' && children[i + 1]?.localName === 'mfenced') {
      const base = translate(child.children[1]);
      const argument = translate(children[++i]);
      parts.push(`log(${base},${argument})`);
    } else {
      parts.push(translate(child));
    }
  }
  return parts.join('');
}
