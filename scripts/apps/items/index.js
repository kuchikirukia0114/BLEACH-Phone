// Items / 物品应用逻辑

const itemsParserConfig = {
  payloadTag: 'items_json',
  requiredTopLevelKeys: ['items'],
  requiredItemKeys: ['name', 'desc'],
  optionalItemKeys: ['id']
};

const BLEACH_PHONE_ITEMS_VARIABLE_KEY = 'bleach_phone_items_json';
const ITEMS_STATUS_AUTO_CLEAR_MS = 2400;

let isBleachPhoneItemsVariableEventsBound = false;
let isItemsAutoGenerateEventsBound = false;
let itemsStatusAutoClearTimer = null;
let itemsAutoGenerateLastHandledKeys = {
  assistant: '',
  user: ''
};

let itemEntries = [
  {
    id: 'mint-candy',
    name: '薄荷润喉糖',
    desc: '便利店随处可见的润喉糖。能带来瞬间的清凉感，适合在长时间说话或感到困倦时含上一颗。'
  },
  {
    id: 'left-earbud',
    name: '无线耳机（左耳）',
    desc: '仅剩左耳的降噪耳机。右耳那只在上周挤地铁时遗失了，现在只能勉强听个响。'
  },
  {
    id: 'half-water',
    name: '半瓶矿泉水',
    desc: '昨天下午开会时喝剩下的。虽然没过期，但总觉得现在喝已经没有灵魂了。'
  },
  {
    id: 'power-bank',
    name: '备用充电宝',
    desc: '本以为满电带出门能带来安全感，结果掏出来发现上次用完根本没充电。'
  },
  {
    id: 'supermarket-receipt',
    name: '超市小票',
    desc: '揉成一团的购物凭证。上面记录着昨晚买了泡面、火腿肠和一瓶快乐水。'
  },
  {
    id: 'folding-umbrella',
    name: '折叠雨伞',
    desc: '一把黑色晴雨伞。每次带它出门都不下雨，不带它出门的时候准被淋成落汤鸡。'
  },
  {
    id: 'unknown-key',
    name: '不知名钥匙',
    desc: '在抽屉角落找到的钥匙。既打不开家门，也打不开信箱，完全想不起来它是干嘛用的。'
  }
];

function escapeItemsText(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getItemsStatusMarkup() {
  if (!itemsGenerationStatusMessage) return '';
  const isLoading = itemsRequestStatus === 'loading';
  return `<div class="items-status-banner${isLoading ? ' is-loading' : ''}">${escapeItemsText(itemsGenerationStatusMessage)}</div>`;
}

function clearItemsGenerationStatusAutoTimer() {
  if (!itemsStatusAutoClearTimer) return;
  clearTimeout(itemsStatusAutoClearTimer);
  itemsStatusAutoClearTimer = null;
}

function setItemsGenerationStatus(message = '', status = itemsRequestStatus, { autoClear = false } = {}) {
  clearItemsGenerationStatusAutoTimer();
  itemsGenerationStatusMessage = String(message || '').trim();
  itemsRequestStatus = status || 'idle';
  if (!itemsGenerationStatusMessage || !autoClear) return;
  itemsStatusAutoClearTimer = setTimeout(() => {
    itemsStatusAutoClearTimer = null;
    itemsGenerationStatusMessage = '';
    if (currentAppKey === 'items') {
      renderActiveItemsWindow();
    }
  }, ITEMS_STATUS_AUTO_CLEAR_MS);
}

function getCurrentBleachPhoneItemsChatId() {
  const ctx = typeof getSillyTavernContext === 'function' ? getSillyTavernContext() : null;
  return typeof ctx?.getCurrentChatId === 'function'
    ? (ctx.getCurrentChatId() || '')
    : String(ctx?.chatId || '');
}

async function getBleachPhoneItemsVariableValue({ expectedChatId = '' } = {}) {
  const stApi = typeof getSTAPI === 'function' ? getSTAPI() : null;
  if (typeof stApi?.variables?.get !== 'function') return null;

  const currentChatId = getCurrentBleachPhoneItemsChatId();
  if (!currentChatId || (expectedChatId && currentChatId !== expectedChatId)) return null;

  try {
    const result = await stApi.variables.get({ name: BLEACH_PHONE_ITEMS_VARIABLE_KEY, scope: 'local' });
    return result?.value ?? null;
  } catch (error) {
    console.warn('[物品变量] items_json 读取失败', error);
    return null;
  }
}

async function syncBleachPhoneItemsVariableValue(rawValue, { expectedChatId = '' } = {}) {
  const stApi = typeof getSTAPI === 'function' ? getSTAPI() : null;
  if (typeof stApi?.variables?.set !== 'function') return false;

  const currentChatId = getCurrentBleachPhoneItemsChatId();
  if (!currentChatId || (expectedChatId && currentChatId !== expectedChatId)) {
    return false;
  }

  try {
    const result = await stApi.variables.set({
      name: BLEACH_PHONE_ITEMS_VARIABLE_KEY,
      scope: 'local',
      value: typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue || {}, null, 2)
    });
    return result?.ok !== false;
  } catch (error) {
    console.warn('[物品变量] items_json 同步失败', error);
    return false;
  }
}

async function syncBleachPhoneItemsVariableFromParsedResult(parsedResult, options = {}) {
  if (!parsedResult || typeof parsedResult !== 'object') return false;
  const payloadText = String(parsedResult.candidate || '').trim();
  const fallbackPayload = parsedResult.parsed && typeof parsedResult.parsed === 'object'
    ? JSON.stringify(parsedResult.parsed, null, 2)
    : '';
  const variableValue = payloadText || fallbackPayload;
  if (!variableValue) return false;
  return syncBleachPhoneItemsVariableValue(variableValue, options);
}

function renderActiveItemsWindow() {
  if (currentAppKey === 'items') {
    renderAppWindow('items');
  }
}

function bindBleachPhoneItemsVariableEvents() {
  if (isBleachPhoneItemsVariableEventsBound) return true;
  const ctx = typeof getSillyTavernContext === 'function' ? getSillyTavernContext() : null;
  if (typeof ctx?.eventSource?.on !== 'function') return false;

  const handleChatScopedRefresh = async () => {
    await loadBleachPhoneItemsVariableToRuntime({ clearOnMissing: true, render: false });
    if (currentAppKey === 'items') {
      renderActiveItemsWindow();
    }
  };

  if (!bindBleachPhoneChatScopedRefreshEvents(ctx, handleChatScopedRefresh, { logPrefix: '[物品变量]' })) {
    return false;
  }
  isBleachPhoneItemsVariableEventsBound = true;
  return true;
}

function getItemsAutoGenerateTriggerLabel(trigger = 'assistant') {
  return getBleachPhoneAutoGenerateTriggerLabel(trigger);
}

function getItemsAutoGenerateSummary(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  return getBleachPhoneAutoGenerateSummary({
    enabled: settings.itemsAutoGenerateEnabled,
    trigger: settings.itemsAutoGenerateTrigger,
    interval: settings.itemsAutoGenerateInterval || '1'
  });
}

function getItemsAutoGenerateEntries(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  return getBleachPhoneAutoGenerateEntries({
    enabled: settings.itemsAutoGenerateEnabled,
    trigger: settings.itemsAutoGenerateTrigger,
    interval: settings.itemsAutoGenerateInterval || '1'
  });
}

function updateItemsAutoGenerateSettings(patch = {}) {
  const settings = normalizeAiSettings(aiSettings);
  aiSettings = normalizeAiSettings({
    ...settings,
    ...patch
  });
  persistAiSettings(aiSettings);
  return aiSettings;
}

function getItemsSettingsEntries() {
  return [
    { key: 'api', label: 'API' },
    { key: 'preset', label: '物品预设' },
    { key: 'autoGenerate', label: '自动生成' }
  ];
}

function getItemsApiBindingProfiles() {
  const settings = normalizeAiSettings(aiSettings);
  return Array.isArray(settings.apiProfiles) ? settings.apiProfiles : [];
}

function getItemsPresetEntries() {
  const settings = normalizeAiSettings(aiSettings);
  return Array.isArray(settings.presetEntries) ? settings.presetEntries : [];
}

function getSelectedItemsPresetEntry(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  const targetPresetId = resolveSelectedAiPresetId(settings.selectedItemsPresetId || settings.selectedPresetId, settings.presetEntries);
  return getAiPresetEntryById(targetPresetId, settings) || settings.presetEntries?.[0] || null;
}

function syncItemsPresetSelection() {
  const presets = getItemsPresetEntries();
  currentItemsPresetId = resolveSelectedAiPresetId(normalizeAiSettings(aiSettings).selectedItemsPresetId || currentItemsPresetId || currentAiPresetId, presets);
  const currentIndex = presets.findIndex((preset) => preset.id === currentItemsPresetId);
  selectedItemsPresetIndex = presets.length
    ? Math.min(
      Math.max(
        selectedItemsPresetIndex >= 0 ? selectedItemsPresetIndex : (currentIndex >= 0 ? currentIndex : 0),
        0
      ),
      presets.length - 1
    )
    : -1;
}

function setItemsSelectedPreset(presetId) {
  const settings = normalizeAiSettings(aiSettings);
  const nextPresetId = resolveSelectedAiPresetId(presetId, settings.presetEntries);
  aiSettings = normalizeAiSettings({
    ...settings,
    selectedItemsPresetId: nextPresetId
  });
  currentItemsPresetId = aiSettings.selectedItemsPresetId;
  persistAiSettings(aiSettings);
  return currentItemsPresetId;
}

function syncItemsApiBindingSelection() {
  const profiles = getItemsApiBindingProfiles();
  const currentBindingId = getAiBindingProfileId('items', aiSettings);
  const currentIndex = profiles.findIndex((profile) => profile.id === currentBindingId);
  selectedItemsApiProfileIndex = profiles.length
    ? Math.min(
      Math.max(
        selectedItemsApiProfileIndex >= 0 ? selectedItemsApiProfileIndex : (currentIndex >= 0 ? currentIndex : 0),
        0
      ),
      profiles.length - 1
    )
    : -1;
}

function getItemsSelectedBindingName() {
  return getAiBindingProfileName('items', aiSettings) || '未设';
}

function openItemsSettings() {
  itemsView = 'settings';
  selectedItemsSettingsIndex = Math.min(Math.max(selectedItemsSettingsIndex, 0), Math.max(getItemsSettingsEntries().length - 1, 0));
  renderActiveItemsWindow();
}

function closeItemsSettings() {
  itemsView = 'list';
  renderActiveItemsWindow();
}

function openItemsApiBindingList() {
  itemsView = 'apiBinding';
  syncItemsApiBindingSelection();
  renderActiveItemsWindow();
}

function closeItemsApiBindingList() {
  itemsView = 'settings';
  renderActiveItemsWindow();
}

function openItemsPresetList() {
  itemsView = 'preset';
  syncItemsPresetSelection();
  renderActiveItemsWindow();
}

function closeItemsPresetList() {
  itemsView = 'settings';
  renderActiveItemsWindow();
}

function openItemsAutoGenerateList() {
  itemsView = 'autoGenerate';
  selectedItemsAutoGenerateIndex = Math.min(Math.max(selectedItemsAutoGenerateIndex, 0), Math.max(getItemsAutoGenerateEntries().length - 1, 0));
  renderActiveItemsWindow();
}

function closeItemsAutoGenerateList() {
  itemsView = 'settings';
  renderActiveItemsWindow();
}

function openItemsSettingsSelection() {
  const targetEntry = getItemsSettingsEntries()[selectedItemsSettingsIndex] || getItemsSettingsEntries()[0];
  if (!targetEntry) return;
  if (targetEntry.key === 'api') {
    openItemsApiBindingList();
    return;
  }
  if (targetEntry.key === 'preset') {
    openItemsPresetList();
    return;
  }
  openItemsAutoGenerateList();
}

function bindItemsApiProfileSelection() {
  const profiles = getItemsApiBindingProfiles();
  const targetProfile = profiles[selectedItemsApiProfileIndex] || null;
  if (!targetProfile) return false;
  if (!bindAiApiProfile('items', targetProfile.id)) return false;
  closeItemsApiBindingList();
  return true;
}

function bindItemsPresetSelection() {
  const presets = getItemsPresetEntries();
  const targetPreset = presets[selectedItemsPresetIndex] || null;
  if (!targetPreset) return false;
  setItemsSelectedPreset(targetPreset.id);
  closeItemsPresetList();
  return true;
}

function confirmItemsAutoGenerateSelection() {
  const entries = getItemsAutoGenerateEntries();
  const targetEntry = entries[selectedItemsAutoGenerateIndex] || entries[0] || null;
  if (!targetEntry) return false;

  const settings = normalizeAiSettings(aiSettings);
  if (targetEntry.key === 'enabled') {
    updateItemsAutoGenerateSettings({ itemsAutoGenerateEnabled: !settings.itemsAutoGenerateEnabled });
    renderActiveItemsWindow();
    return true;
  }

  if (targetEntry.key === 'trigger') {
    updateItemsAutoGenerateSettings({
      itemsAutoGenerateTrigger: settings.itemsAutoGenerateTrigger === 'user' ? 'assistant' : 'user'
    });
    renderActiveItemsWindow();
    return true;
  }

  const currentInterval = Number.parseInt(String(settings.itemsAutoGenerateInterval || '1'), 10);
  const safeCurrentInterval = Number.isFinite(currentInterval) && currentInterval > 0 ? currentInterval : 1;
  updateItemsAutoGenerateSettings({
    itemsAutoGenerateInterval: String(Math.min(99, safeCurrentInterval + 1))
  });
  renderActiveItemsWindow();
  return true;
}

function adjustItemsAutoGenerateInterval(step = 1) {
  const settings = normalizeAiSettings(aiSettings);
  const currentInterval = Number.parseInt(String(settings.itemsAutoGenerateInterval || '1'), 10);
  const safeCurrentInterval = Number.isFinite(currentInterval) && currentInterval > 0 ? currentInterval : 1;
  const nextInterval = Math.min(99, Math.max(1, safeCurrentInterval + step));
  if (nextInterval === safeCurrentInterval) return false;
  updateItemsAutoGenerateSettings({ itemsAutoGenerateInterval: String(nextInterval) });
  renderActiveItemsWindow();
  return true;
}

function getItemsAutoGenerateRuntimeSettings(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  const interval = Number.parseInt(String(settings.itemsAutoGenerateInterval || '1'), 10);
  return {
    enabled: Boolean(settings.itemsAutoGenerateEnabled),
    trigger: String(settings.itemsAutoGenerateTrigger || '').trim() === 'user' ? 'user' : 'assistant',
    interval: Number.isFinite(interval) && interval > 0 ? interval : 1
  };
}

function getItemsAutoGenerateChatMessages() {
  const ctx = typeof getSillyTavernContext === 'function' ? getSillyTavernContext() : null;
  const rawMessages = Array.isArray(ctx?.chat) ? ctx.chat : [];
  if (typeof normalizeSTMainChatMessages === 'function') {
    return normalizeSTMainChatMessages(rawMessages);
  }
  return rawMessages.map((message) => {
    const rawRole = String(message?.role || '').trim().toLowerCase();
    const role = rawRole === 'user' || message?.is_user
      ? 'user'
      : ((rawRole === 'assistant' || rawRole === 'model' || message?.is_user === false) ? 'assistant' : '');
    const content = typeof getTextFromSTMessage === 'function'
      ? getTextFromSTMessage(message)
      : String(message?.content || message?.mes || '').trim();
    return { role, content };
  }).filter((message) => (message.role === 'user' || message.role === 'assistant') && message.content);
}

function resetItemsAutoGenerateHandledKeys() {
  itemsAutoGenerateLastHandledKeys = {
    assistant: '',
    user: ''
  };
}

function buildItemsAutoGenerateHandledKey(triggerType, chatId, floorCount, content = '') {
  return [
    String(chatId || '').trim(),
    String(triggerType || '').trim(),
    String(floorCount || 0),
    String(content || '').trim().slice(0, 240)
  ].join('::');
}

async function handleItemsAutoGenerateChatEvent(triggerType = 'assistant') {
  const normalizedTrigger = String(triggerType || '').trim() === 'user' ? 'user' : 'assistant';
  const runtimeSettings = getItemsAutoGenerateRuntimeSettings(aiSettings);
  if (!runtimeSettings.enabled || runtimeSettings.trigger !== normalizedTrigger) {
    return false;
  }

  const activeChatId = typeof getCurrentSTChatId === 'function'
    ? String(getCurrentSTChatId() || '').trim()
    : String(getCurrentBleachPhoneItemsChatId() || '').trim();
  if (!activeChatId) {
    return false;
  }

  const chatMessages = getItemsAutoGenerateChatMessages();
  if (!chatMessages.length) {
    return false;
  }

  const targetMessages = chatMessages.filter((message) => message.role === normalizedTrigger && String(message.content || '').trim());
  const floorCount = targetMessages.length;
  if (!floorCount || floorCount % runtimeSettings.interval !== 0) {
    return false;
  }

  const latestMessage = targetMessages[targetMessages.length - 1] || null;
  const handledKey = buildItemsAutoGenerateHandledKey(normalizedTrigger, activeChatId, floorCount, latestMessage?.content || '');
  if (itemsAutoGenerateLastHandledKeys[normalizedTrigger] === handledKey) {
    return false;
  }
  itemsAutoGenerateLastHandledKeys[normalizedTrigger] = handledKey;

  try {
    return await generateItemsDataFromApi();
  } catch (error) {
    console.error(`[物品自动生成] ${normalizedTrigger === 'user' ? '用户' : 'AI'}消息触发失败`, error);
    return false;
  }
}

function bindItemsAutoGenerateEvents() {
  if (isItemsAutoGenerateEventsBound) return true;
  const ctx = typeof getSillyTavernContext === 'function' ? getSillyTavernContext() : null;
  if (typeof ctx?.eventSource?.on !== 'function') return false;

  const messageReceivedEvent = ctx?.eventTypes?.MESSAGE_RECEIVED || 'message_received';
  const messageSentEvent = ctx?.eventTypes?.MESSAGE_SENT || 'message_sent';
  const chatChangedEvent = ctx?.eventTypes?.CHAT_CHANGED || 'chat_id_changed';
  const handleAssistantMessage = () => {
    Promise.resolve().then(() => handleItemsAutoGenerateChatEvent('assistant')).catch((error) => {
      console.error('[物品自动生成] AI消息事件处理失败', error);
    });
  };
  const handleUserMessage = () => {
    Promise.resolve().then(() => handleItemsAutoGenerateChatEvent('user')).catch((error) => {
      console.error('[物品自动生成] 用户消息事件处理失败', error);
    });
  };
  const handleChatChanged = () => {
    resetItemsAutoGenerateHandledKeys();
  };

  ctx.eventSource.on(messageReceivedEvent, handleAssistantMessage);
  ctx.eventSource.on(messageSentEvent, handleUserMessage);
  ctx.eventSource.on(chatChangedEvent, handleChatChanged);
  if (ctx?.eventTypes?.CHAT_LOADED) {
    ctx.eventSource.on(ctx.eventTypes.CHAT_LOADED, handleChatChanged);
  }
  isItemsAutoGenerateEventsBound = true;
  return true;
}

function getItemsSafeIndex(index = selectedItemIndex) {
  if (!itemEntries.length) return -1;
  const parsedIndex = Number(index);
  if (!Number.isInteger(parsedIndex)) return 0;
  return Math.min(Math.max(parsedIndex, 0), itemEntries.length - 1);
}

function getSelectedItemEntry() {
  const safeIndex = getItemsSafeIndex();
  return safeIndex >= 0 ? itemEntries[safeIndex] : null;
}

function normalizeItemEntry(entry, index = 0) {
  if (!entry || typeof entry !== 'object') return null;
  const name = String(entry.name || '').trim();
  const desc = String(entry.desc || '').trim();
  const id = String(entry.id || `item-entry-${index + 1}`).trim() || `item-entry-${index + 1}`;
  if (!name || !desc) return null;
  return { id, name, desc };
}

function parseItemsAiResponse(rawText = '') {
  const sourceText = String(rawText || '').trim();
  if (!sourceText) {
    throw new Error('物品返回内容为空');
  }

  const taggedPayload = typeof extractTagContentWithTag === 'function'
    ? extractTagContentWithTag(sourceText, itemsParserConfig.payloadTag)
    : '';
  const payloadText = taggedPayload
    ? taggedPayload
      .replace(new RegExp(`^<${itemsParserConfig.payloadTag}>|</${itemsParserConfig.payloadTag}>$`, 'gi'), '')
      .trim()
    : sourceText;
  if (!payloadText) {
    throw new Error('items_json 不是有效 JSON：内容为空');
  }

  let parsedPayload;
  try {
    parsedPayload = JSON.parse(payloadText);
  } catch (error) {
    throw new Error(`items_json 不是有效 JSON：${error?.message || '解析失败'}`);
  }

  if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
    throw new Error('items_json 缺少顶层字段：items（顶层需为对象）');
  }

  for (const key of itemsParserConfig.requiredTopLevelKeys) {
    if (!(key in parsedPayload)) {
      throw new Error(`items_json 缺少顶层字段：${key}`);
    }
  }

  if (!Array.isArray(parsedPayload.items)) {
    throw new Error('items_json 缺少顶层字段或字段格式错误：items（需为数组）');
  }

  const items = parsedPayload.items.map((entry, index) => normalizeItemEntry(entry, index)).filter(Boolean);
  if (!items.length) {
    throw new Error(`物品列表为空；每个条目至少需要包含字段：${itemsParserConfig.requiredItemKeys.join(', ')}`);
  }

  return {
    items,
    raw: sourceText,
    parsed: parsedPayload,
    candidate: payloadText
  };
}

function loadItemsData(entries, { render = true } = {}) {
  const normalizedEntries = Array.isArray(entries)
    ? entries.map((entry, index) => normalizeItemEntry(entry, index)).filter(Boolean)
    : [];
  if (!normalizedEntries.length) return false;
  itemEntries = normalizedEntries;
  selectedItemIndex = Math.min(Math.max(selectedItemIndex, 0), itemEntries.length - 1);
  itemsListScrollTop = 0;
  itemsDetailScrollTop = 0;
  if (render && currentAppKey === 'items' && itemsView === 'list') {
    renderActiveItemsWindow();
  }
  return true;
}

function clearItemsData({ render = true } = {}) {
  itemEntries = [];
  selectedItemIndex = -1;
  itemsListScrollTop = 0;
  itemsDetailScrollTop = 0;
  if (render && currentAppKey === 'items' && itemsView === 'list') {
    renderActiveItemsWindow();
  }
  return true;
}

async function loadBleachPhoneItemsVariableToRuntime({ render = true, clearOnMissing = false } = {}) {
  const rawValue = await getBleachPhoneItemsVariableValue();
  if (rawValue == null || String(rawValue).trim() === '') {
    if (clearOnMissing) {
      clearItemsData({ render });
      setItemsGenerationStatus('当前聊天暂无物品数据', 'idle', { autoClear: true });
      return true;
    }
    return false;
  }
  try {
    const parsedResult = parseItemsAiResponse(String(rawValue));
    setItemsGenerationStatus('已从聊天变量恢复物品', 'success', { autoClear: true });
    return loadItemsData(parsedResult.items, { render });
  } catch (error) {
    console.warn('[物品变量] items_json 恢复失败', error);
    if (clearOnMissing) {
      clearItemsData({ render });
      setItemsGenerationStatus('当前聊天物品数据无效', 'error');
      return true;
    }
    return false;
  }
}

async function buildItemsGenerationMessages() {
  const presetEntry = getSelectedItemsPresetEntry(aiSettings);
  if (!presetEntry?.blocks?.length) {
    throw createSilentAiChatError('物品生成未配置物品预设');
  }
  const messages = await buildAiMessagesFromPreset(null, '', presetEntry, { pendingTargets: [] });
  const normalizedMessages = Array.isArray(messages)
    ? messages.filter((message) => String(message?.content || '').trim())
    : [];
  if (!normalizedMessages.length) {
    throw createSilentAiChatError('物品预设内容为空');
  }
  return normalizedMessages;
}

async function requestAiItemsReply() {
  const settings = getAiRuntimeSettings('items', aiSettings);
  if (!settings.url) throw createSilentAiChatError('物品生成未绑定 API');
  if (!settings.key) throw createSilentAiChatError('物品生成未配置 API Key');
  if (!settings.model) throw createSilentAiChatError('物品生成未配置模型');

  const body = {
    model: settings.model,
    messages: await buildItemsGenerationMessages(),
    stream: false
  };

  const temperature = Number(settings.temperature);
  const topP = Number(settings.topP);
  if (settings.temperature !== '' && Number.isFinite(temperature)) {
    body.temperature = temperature;
  }
  if (settings.topP !== '' && Number.isFinite(topP)) {
    body.top_p = topP;
  }

  const response = await fetch(settings.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${settings.key}`
    },
    body: JSON.stringify(body)
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data?.error?.message || `请求失败 (${response.status})`);
  }

  const rawContent = data?.choices?.[0]?.message?.content;
  const reply = Array.isArray(rawContent)
    ? rawContent.map((part) => typeof part === 'string' ? part : part?.text || '').join('')
    : String(rawContent || '');
  if (!reply.trim()) {
    throw new Error('返回内容为空');
  }
  return reply.trim();
}

async function generateItemsDataFromApi() {
  if (itemsRequestStatus === 'loading') {
    return false;
  }

  const expectedChatId = getCurrentBleachPhoneItemsChatId();
  setItemsGenerationStatus('物品生成中…', 'loading');
  renderActiveItemsWindow();
  let aiReplyText = '';
  try {
    aiReplyText = await requestAiItemsReply();
    const parsedResult = parseItemsAiResponse(aiReplyText);
    loadItemsData(parsedResult.items, { render: false });
    const variableSynced = await syncBleachPhoneItemsVariableFromParsedResult(parsedResult, { expectedChatId });
    if (!variableSynced) {
      console.warn('[物品变量] items_json 未写入酒馆变量', { variableName: BLEACH_PHONE_ITEMS_VARIABLE_KEY });
    }
    setItemsGenerationStatus(`物品已更新 · ${parsedResult.items.length} 项${variableSynced ? '' : ' · 变量未同步'}`, 'success', { autoClear: true });
    renderActiveItemsWindow();
    return true;
  } catch (error) {
    const message = error?.silent
      ? String(error.message || '').trim()
      : `生成失败：${String(error?.message || '未知错误').trim() || '未知错误'}`;
    setItemsGenerationStatus(message, 'error');
    console.error('[物品] 生成失败', error);
    if (aiReplyText) {
      console.error('[物品] AI 原始回复内容：\n' + aiReplyText);
    }
    renderActiveItemsWindow();
    return false;
  }
}

async function triggerItemsGenerationFromSoftkey() {
  return generateItemsDataFromApi();
}

function applyItemsSelectionToDom({ resetDetailScroll = false, preserveListScroll = true } = {}) {
  const listEl = document.getElementById('items-list');
  const descEl = document.getElementById('items-desc-panel');
  if (!listEl || !descEl) return false;

  const selectedItem = getSelectedItemEntry();
  const titleEl = document.querySelector('.items-name');
  if (titleEl) {
    titleEl.textContent = selectedItem?.name || '暂无物品';
  }

  descEl.textContent = selectedItem?.desc || '当前没有可显示的物品说明。';
  if (resetDetailScroll) {
    itemsDetailScrollTop = 0;
  }
  descEl.scrollTop = itemsDetailScrollTop;

  const entries = Array.from(listEl.querySelectorAll('.items-list-entry'));
  entries.forEach((entry, index) => {
    entry.classList.toggle('is-active', index === selectedItemIndex);
  });

  if (preserveListScroll) {
    listEl.scrollTop = itemsListScrollTop;
  }
  const selectedEntry = listEl.querySelector('.items-list-entry.is-active');
  selectedEntry?.scrollIntoView({ block: 'nearest' });
  return true;
}

function updateItemsSelection(index, { render = true, listOnly = false, resetDetailScroll = false } = {}) {
  const safeIndex = getItemsSafeIndex(index);
  if (safeIndex < 0) {
    selectedItemIndex = -1;
    return false;
  }
  if (safeIndex === selectedItemIndex && !render) {
    return true;
  }
  selectedItemIndex = safeIndex;
  if (render && currentAppKey === 'items') {
    if (listOnly && typeof applyItemsSelectionToDom === 'function' && applyItemsSelectionToDom({ resetDetailScroll })) {
      return true;
    }
    renderAppWindow('items');
  }
  return true;
}

function renderItemsSettingsView() {
  const entries = getItemsSettingsEntries();
  return `
    ${getItemsStatusMarkup()}
    <div class="contact-saved-list" id="items-settings-list">
      ${entries.map((entry, index) => {
        const previewText = entry.key === 'api'
          ? getItemsSelectedBindingName()
          : (entry.key === 'preset'
            ? (getSelectedItemsPresetEntry(aiSettings)?.name || '未设')
            : getItemsAutoGenerateSummary(aiSettings));
        return `
          <div class="contact-saved-item items-settings-item ${selectedItemsSettingsIndex === index ? 'is-selected' : ''}" data-items-settings-index="${index}" data-items-settings-key="${entry.key}">
            <div class="contact-saved-main">
              <span class="contact-saved-name">${escapeHtml(entry.label)}</span>
              <span class="contact-saved-preview">${escapeHtml(previewText)}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderItemsApiBindingView() {
  const profiles = getItemsApiBindingProfiles();
  if (!profiles.length) {
    return `${getItemsStatusMarkup()}<div class="sms-settings-empty-view">暂无 API 配置</div>`;
  }

  const currentBindingId = getAiBindingProfileId('items', aiSettings);
  return `
    ${getItemsStatusMarkup()}
    <div class="contact-saved-list" id="items-api-profile-list">
      ${profiles.map((profile, index) => `
        <div class="contact-saved-item items-api-profile-item ${selectedItemsApiProfileIndex === index ? 'is-selected' : ''}" data-items-api-profile-index="${index}">
          <div class="contact-saved-main">
            <span class="contact-saved-name">${escapeHtml(profile.name || '默认')}</span>
            <span class="contact-saved-preview">${currentBindingId === profile.id ? '当前使用' : escapeHtml(getAiApiHostLabel(profile.url) || '未设端点')}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderItemsAutoGenerateView() {
  return renderBleachPhoneAutoGenerateSettingsView({
    statusMarkup: getItemsStatusMarkup(),
    listId: 'items-auto-generate-list',
    itemClassName: 'items-auto-generate-item',
    selectedIndex: selectedItemsAutoGenerateIndex,
    entries: getItemsAutoGenerateEntries(),
    escapeText: escapeItemsText,
    dataIndexAttr: 'data-items-auto-generate-index',
    dataKeyAttr: 'data-items-auto-generate-key'
  });
}

function renderItemsPresetView() {
  const presets = getItemsPresetEntries();
  if (!presets.length) {
    return `${getItemsStatusMarkup()}<div class="sms-settings-empty-view">暂无预设</div>`;
  }

  return `
    ${getItemsStatusMarkup()}
    <div class="contact-saved-list" id="items-preset-list">
      ${presets.map((preset, index) => `
        <div class="contact-saved-item items-preset-item ${selectedItemsPresetIndex === index ? 'is-selected' : ''}" data-items-preset-index="${index}">
          <div class="contact-saved-main">
            <span class="contact-saved-name">${escapeHtml(preset.name || `预设 ${index + 1}`)}</span>
            <span class="contact-saved-preview">${currentItemsPresetId === preset.id ? '当前使用' : `${Array.isArray(preset.blocks) ? preset.blocks.length : 0} 个块`}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderItemsListView() {
  const selectedItem = getSelectedItemEntry();
  const title = selectedItem?.name || '暂无物品';
  const desc = selectedItem?.desc || '当前没有可显示的物品说明。';

  return `
    <div class="items-app-shell">
      ${getItemsStatusMarkup()}
      <section class="items-detail-card" aria-label="物品详情">
        <div class="items-detail-header">
          <div class="items-title-area">
            <div class="items-name">${escapeHtml(title)}</div>
          </div>
        </div>
        <div class="items-desc" id="items-desc-panel">${escapeHtml(desc)}</div>
      </section>

      <ul class="items-list" id="items-list" aria-label="物品列表">
        ${itemEntries.map((item, index) => `
          <li class="items-list-entry ${selectedItemIndex === index ? 'is-active' : ''}" data-item-index="${index}">
            <span class="items-list-name">${escapeHtml(item.name)}</span>
          </li>
        `).join('')}
      </ul>
    </div>
  `;
}

function renderItemsContent() {
  if (itemsView === 'settings') {
    return renderItemsSettingsView();
  }
  if (itemsView === 'apiBinding') {
    return renderItemsApiBindingView();
  }
  if (itemsView === 'preset') {
    return renderItemsPresetView();
  }
  if (itemsView === 'autoGenerate') {
    return renderItemsAutoGenerateView();
  }
  return renderItemsListView();
}

function moveItemsSelection(direction) {
  if (itemsView === 'settings') {
    const entries = getItemsSettingsEntries();
    const settingsList = document.getElementById('items-settings-list');
    if (settingsList) {
      itemsSettingsListScrollTop = settingsList.scrollTop;
    }
    if (!entries.length) return;
    if (direction === 'up') {
      selectedItemsSettingsIndex = Math.max(0, selectedItemsSettingsIndex - 1);
      renderActiveItemsWindow();
      return;
    }
    if (direction === 'down') {
      selectedItemsSettingsIndex = Math.min(entries.length - 1, selectedItemsSettingsIndex + 1);
      renderActiveItemsWindow();
    }
    return;
  }

  if (itemsView === 'apiBinding') {
    const profiles = getItemsApiBindingProfiles();
    const profileList = document.getElementById('items-api-profile-list');
    if (profileList) {
      itemsApiProfileListScrollTop = profileList.scrollTop;
    }
    if (!profiles.length) return;
    if (direction === 'up') {
      selectedItemsApiProfileIndex = Math.max(0, selectedItemsApiProfileIndex - 1);
      renderActiveItemsWindow();
      return;
    }
    if (direction === 'down') {
      selectedItemsApiProfileIndex = Math.min(profiles.length - 1, selectedItemsApiProfileIndex + 1);
      renderActiveItemsWindow();
    }
    return;
  }

  if (itemsView === 'preset') {
    const presets = getItemsPresetEntries();
    const presetList = document.getElementById('items-preset-list');
    if (presetList) {
      itemsPresetListScrollTop = presetList.scrollTop;
    }
    if (!presets.length) return;
    if (direction === 'up') {
      selectedItemsPresetIndex = Math.max(0, selectedItemsPresetIndex - 1);
      renderActiveItemsWindow();
      return;
    }
    if (direction === 'down') {
      selectedItemsPresetIndex = Math.min(presets.length - 1, selectedItemsPresetIndex + 1);
      renderActiveItemsWindow();
    }
    return;
  }

  if (itemsView === 'autoGenerate') {
    const entries = getItemsAutoGenerateEntries();
    const autoGenerateList = document.getElementById('items-auto-generate-list');
    if (autoGenerateList) {
      itemsAutoGenerateListScrollTop = autoGenerateList.scrollTop;
    }
    if (!entries.length) return;
    if (direction === 'left') {
      const targetEntry = entries[selectedItemsAutoGenerateIndex] || null;
      if (targetEntry?.key === 'interval') {
        adjustItemsAutoGenerateInterval(-1);
      }
      return;
    }
    if (direction === 'right') {
      const targetEntry = entries[selectedItemsAutoGenerateIndex] || null;
      if (targetEntry?.key === 'interval') {
        adjustItemsAutoGenerateInterval(1);
      }
      return;
    }
    if (direction === 'up') {
      selectedItemsAutoGenerateIndex = Math.max(0, selectedItemsAutoGenerateIndex - 1);
      renderActiveItemsWindow();
      return;
    }
    if (direction === 'down') {
      selectedItemsAutoGenerateIndex = Math.min(entries.length - 1, selectedItemsAutoGenerateIndex + 1);
      renderActiveItemsWindow();
    }
    return;
  }

  if (!itemEntries.length) return;

  const listEl = document.getElementById('items-list');
  const descEl = document.getElementById('items-desc-panel');

  if (direction === 'left' && descEl) {
    const pageStep = Math.max(36, descEl.clientHeight - 20);
    descEl.scrollTop -= pageStep;
    itemsDetailScrollTop = descEl.scrollTop;
    return;
  }

  if (direction === 'right' && descEl) {
    const pageStep = Math.max(36, descEl.clientHeight - 20);
    descEl.scrollTop += pageStep;
    itemsDetailScrollTop = descEl.scrollTop;
    return;
  }

  if (listEl) {
    itemsListScrollTop = listEl.scrollTop;
  }

  if (direction === 'up') {
    updateItemsSelection(selectedItemIndex - 1, { listOnly: true, resetDetailScroll: true });
    return;
  }

  if (direction === 'down') {
    updateItemsSelection(selectedItemIndex + 1, { listOnly: true, resetDetailScroll: true });
  }
}

function syncItemsViewState() {
  if (itemsView !== 'list') return;

  const listEl = document.getElementById('items-list');
  const descEl = document.getElementById('items-desc-panel');
  if (!listEl || !descEl) return;

  applyItemsSelectionToDom({ preserveListScroll: true });

  if (!listEl.dataset.boundScroll) {
    listEl.addEventListener('scroll', () => {
      itemsListScrollTop = listEl.scrollTop;
    }, { passive: true });
    listEl.dataset.boundScroll = '1';
  }

  if (!descEl.dataset.boundScroll) {
    descEl.addEventListener('scroll', () => {
      itemsDetailScrollTop = descEl.scrollTop;
    }, { passive: true });
    descEl.dataset.boundScroll = '1';
  }
}
