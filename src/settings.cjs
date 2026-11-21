const fs = require('node:fs');
const path = require('node:path');

const defaults = Object.freeze({
  openAtStartup: false,
  closeAction: 'tray',
  panelTopmost: 'temporary',
  showBall: true,
  retractBall: true,
  retractDelay: 800,
  inputMode: 'hand',
  handHeight: 'standard',
  sidebarWidth: 300,
  lessonWidth: 280,
  showAxes: true,
  showGrid: true,
  lineWidth: 4,
  lessonDuration: 3500,
});

const options = {
  closeAction: ['tray', 'quit'],
  panelTopmost: ['temporary', 'always', 'never'],
  retractDelay: [500, 800, 1500],
  inputMode: ['hand', 'keyboard', 'python'],
  handHeight: ['standard', 'tall'],
  lineWidth: [2, 4, 6],
  lessonDuration: [7000, 3500, 1750],
};
const widths = { sidebarWidth: 640, lessonWidth: 480 };
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

function valid(key, value) {
  if (!Object.hasOwn(defaults, key)) return false;
  if (Object.hasOwn(options, key)) return options[key].includes(value);
  if (Object.hasOwn(widths, key)) return Number.isInteger(value) && value >= 220 && value <= widths[key];
  return typeof value === 'boolean';
}

function writeJson(filename, data) {
  const temporary = `${filename}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(filename), { recursive: true });
    fs.writeFileSync(temporary, JSON.stringify(data, null, 2) + '\n', 'utf8');
    fs.renameSync(temporary, filename);
  } catch (error) {
    try { fs.unlinkSync(temporary); } catch {}
    throw error;
  }
}

function loadFloatingPosition(directory) {
  try { return JSON.parse(fs.readFileSync(path.join(directory, 'floating-window.json'), 'utf8')); }
  catch { return undefined; }
}

function createSettings(directory, legacyFloating) {
  const filename = path.join(directory, 'settings.json');
  let saved = {};
  let readError = '';
  try {
    const data = JSON.parse(fs.readFileSync(filename, 'utf8'));
    if (!record(data) || data.version !== 1) throw new Error('unsupported settings format');
    saved = Object.fromEntries(Object.entries(data).filter(([key, value]) => valid(key, value)));
  } catch (error) {
    if (error.code !== 'ENOENT') readError = '无法读取设置文件，已使用默认设置。';
  }
  if (!Object.hasOwn(saved, 'showBall') && [1, 2].includes(legacyFloating?.version)
      && typeof legacyFloating.visible === 'boolean') {
    saved.showBall = legacyFloating.visible;
  }

  function commit(patch) {
    const next = { ...saved, ...patch };
    writeJson(filename, { version: 1, ...next });
    saved = next;
    readError = '';
  }

  return {
    get values() { return { ...defaults, ...saved }; },
    get readError() { return readError; },
    migrateWidths(legacy) {
      if (readError || !record(legacy)) return;
      const patch = Object.fromEntries(Object.keys(widths)
        .filter(key => !Object.hasOwn(saved, key) && valid(key, legacy[key]))
        .map(key => [key, legacy[key]]));
      if (Object.keys(patch).length) commit(patch);
    },
    update(patch) {
      if (!record(patch) || Object.entries(patch).some(([key, value]) => !valid(key, value))) {
        throw new Error('设置值无效。');
      }
      commit(patch);
    },
    reset() { commit(defaults); },
  };
}

module.exports = { createSettings, loadFloatingPosition, writeJson };
