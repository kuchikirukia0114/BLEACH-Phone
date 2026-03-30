// Shared app helpers / 通用应用辅助函数

const BLEACH_PHONE_AUTO_GENERATE_MICROLINE = '楼层间隔 1 = 每次触发；确认可切换开关/时机；在“楼层间隔”上可连续递增，左右方向可微调。';

function getBleachPhoneSafeEscapeText(escapeText) {
  if (typeof escapeText === 'function') {
    return escapeText;
  }
  if (typeof escapeHtml === 'function') {
    return escapeHtml;
  }
  return (value) => String(value == null ? '' : value);
}

function renderBleachPhoneSettingRowsView({
  statusMarkup = '',
  listId = '',
  itemClassName = '',
  selectedIndex = 0,
  entries = [],
  escapeText = null,
  dataIndexAttr = 'data-setting-index',
  dataKeyAttr = 'data-setting-key',
  valueArrowResolver = null,
  microlineText = ''
} = {}) {
  const safeEscapeText = getBleachPhoneSafeEscapeText(escapeText);
  const rowsMarkup = (Array.isArray(entries) ? entries : []).map((entry, index) => {
    const key = String(entry?.key || '').trim();
    const label = safeEscapeText(entry?.label || '');
    const value = safeEscapeText(entry?.value || '');
    const arrowText = typeof valueArrowResolver === 'function' ? String(valueArrowResolver(entry, index) || '').trim() : '';
    const rowClassName = ['setting-row', itemClassName, selectedIndex === index ? 'is-selected' : '']
      .filter(Boolean)
      .join(' ');
    const valueMarkup = arrowText
      ? `<span class="setting-row-value-wrap"><span class="setting-row-value">${value}</span><span class="setting-row-arrow">${safeEscapeText(arrowText)}</span></span>`
      : `<span class="setting-row-value">${value}</span>`;
    return `
      <button class="${rowClassName}" ${dataIndexAttr}="${index}" ${dataKeyAttr}="${safeEscapeText(key)}" type="button">
        <span class="setting-row-label">${label}</span>
        ${valueMarkup}
      </button>
    `;
  }).join('');
  const microlineMarkup = String(microlineText || '').trim()
    ? `<div class="app-microline">${safeEscapeText(microlineText)}</div>`
    : '';

  return `
    ${statusMarkup}
    <div class="settings-list" id="${safeEscapeText(listId)}">
      ${rowsMarkup}
    </div>
    ${microlineMarkup}
  `;
}

function bindBleachPhoneChatScopedRefreshEvents(ctx, onRefresh, { logPrefix = '[BLEACH-Phone]' } = {}) {
  if (typeof onRefresh !== 'function' || typeof ctx?.eventSource?.on !== 'function') {
    return false;
  }

  let isRefreshPending = false;
  const scheduleRefresh = () => {
    if (isRefreshPending) return;
    isRefreshPending = true;
    Promise.resolve()
      .then(() => onRefresh())
      .catch((error) => {
        console.error(`${String(logPrefix || '[BLEACH-Phone]')} 聊天作用域刷新失败`, error);
      })
      .finally(() => {
        isRefreshPending = false;
      });
  };

  const eventNames = [
    ctx?.eventTypes?.APP_READY || 'app_ready',
    ctx?.eventTypes?.CHAT_CHANGED || 'chat_id_changed',
    ctx?.eventTypes?.CHAT_LOADED || 'chatLoaded',
    ctx?.eventTypes?.CHAT_CREATED || 'chat_created',
    ctx?.eventTypes?.GROUP_CHAT_CREATED || 'group_chat_created',
    ctx?.eventTypes?.CHARACTER_FIRST_MESSAGE_SELECTED || 'character_first_message_selected'
  ].filter(Boolean);

  Array.from(new Set(eventNames)).forEach((eventName) => {
    ctx.eventSource.on(eventName, scheduleRefresh);
  });
  return true;
}

function getBleachPhoneAutoGenerateTriggerLabel(trigger = 'assistant') {
  return String(trigger || '').trim() === 'user' ? '用户消息后' : 'AI消息后';
}

function getBleachPhoneAutoGenerateSummary({ enabled = false, trigger = 'assistant', interval = '1' } = {}) {
  if (!enabled) return '关闭';
  const triggerLabel = getBleachPhoneAutoGenerateTriggerLabel(trigger);
  const intervalLabel = `${interval || '1'}层`;
  return `${triggerLabel} · 每${intervalLabel}`;
}

function getBleachPhoneAutoGenerateEntries({ enabled = false, trigger = 'assistant', interval = '1' } = {}) {
  return [
    {
      key: 'enabled',
      label: '功能开关',
      value: enabled ? '开启' : '关闭'
    },
    {
      key: 'trigger',
      label: '触发时机',
      value: getBleachPhoneAutoGenerateTriggerLabel(trigger)
    },
    {
      key: 'interval',
      label: '楼层间隔',
      value: `${interval || '1'}楼`
    }
  ];
}

function renderBleachPhoneAutoGenerateSettingsView({
  statusMarkup = '',
  listId = '',
  itemClassName = '',
  selectedIndex = 0,
  entries = [],
  escapeText = null,
  dataIndexAttr = 'data-auto-generate-index',
  dataKeyAttr = 'data-auto-generate-key',
  microlineText = BLEACH_PHONE_AUTO_GENERATE_MICROLINE
} = {}) {
  return renderBleachPhoneSettingRowsView({
    statusMarkup,
    listId,
    itemClassName,
    selectedIndex,
    entries,
    escapeText,
    dataIndexAttr,
    dataKeyAttr,
    microlineText,
    valueArrowResolver: (entry) => String(entry?.key || '').trim() === 'interval' ? '⇆' : '›'
  });
}
