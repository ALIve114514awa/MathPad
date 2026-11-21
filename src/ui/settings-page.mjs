const $ = id => document.getElementById(id);
const numeric = new Set(['retractDelay', 'sidebarWidth', 'lessonWidth', 'lineWidth', 'lessonDuration']);

function readLegacyWidths() {
  try {
    return {
      sidebarWidth: Math.round(Number(localStorage.getItem('mathpad.sidebarWidth'))),
      lessonWidth: Math.round(Number(localStorage.getItem('mathpad.lessonWidth'))),
    };
  } catch { return {}; }
}

export function initializeSettings(onChange) {
  const bridge = window.mathPadSettings;
  const controls = Array.from(document.querySelectorAll('[data-setting]'));
  const error = $('settings-error');
  const status = $('settings-status');
  let values;

  function showError(message) {
    error.textContent = message;
    error.hidden = !message;
  }

  function render() {
    if (!values) return;
    for (const control of controls) {
      const value = values[control.dataset.setting];
      if (control.type === 'checkbox') control.checked = value;
      else control.value = String(value);
    }
    document.querySelector('[data-setting="retractDelay"]').disabled = !values.retractBall;
  }

  function apply(next) {
    const previous = values;
    values = next;
    render();
    onChange(next, previous);
  }

  async function perform(action, message) {
    showError('');
    status.textContent = '';
    try {
      const result = await action();
      if (result.error) throw new Error(result.error);
      status.textContent = message;
      return true;
    } catch (error) {
      render();
      showError(error.message || '设置未能保存。');
      return false;
    }
  }

  const update = patch => perform(() => bridge.update(patch), '已保存。');
  for (const control of controls) {
    control.onchange = () => {
      const key = control.dataset.setting;
      if (!control.validity.valid || (control.type === 'number' && !control.value)) {
        render();
        showError(`请输入 ${control.min} 至 ${control.max} 之间的整数。`);
        return;
      }
      const value = control.type === 'checkbox' ? control.checked : numeric.has(key) ? Number(control.value) : control.value;
      void update({ [key]: value });
    };
  }
  $('reset-settings').onclick = () => {
    if (window.confirm('将所有设置恢复为默认值？当前工作台内容会保留。')) {
      void perform(bridge.reset, '已恢复默认设置。');
    }
  };
  $('reset-ball-position').onclick = () => { void perform(bridge.resetBallPosition, '悬浮球已回到左侧中间。'); };
  bridge.onChange(apply);
  bridge.onError(showError);

  return {
    get values() { return values; },
    update,
    async load() {
      try {
        const result = await bridge.load(readLegacyWidths());
        if (!values) apply(result.values);
        showError(result.error || '');
        $('open-settings').disabled = false;
      } catch (error) {
        showError(`无法加载设置：${error.message}`);
      }
    },
  };
}
