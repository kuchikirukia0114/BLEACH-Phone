// Chars / 情报应用逻辑

const charsParserConfig = {
  payloadTag: 'chars_json',
  requiredTopLevelKeys: ['characters'],
  requiredCharacterKeys: ['name', 'appearance', 'state', 'detail'],
  optionalCharacterKeys: ['id', 'type']
};

const BLEACH_PHONE_CHARS_VARIABLE_KEY = 'bleach_phone_chars_json';
const CHARS_STATUS_AUTO_CLEAR_MS = 2400;

let isBleachPhoneCharsVariableEventsBound = false;
let isCharsAutoGenerateEventsBound = false;
let charsStatusAutoClearTimer = null;
let charsAutoGenerateLastHandledKeys = {
  assistant: '',
  user: ''
};

let charsEnvironmentEntries = [
  {
    id: 'desk-lihua',
    name: '同桌李华',
    type: 'normal',
    appearance: '洗得很干净的蓝白秋季校服。',
    state: '正趴在桌子上，用红笔疯狂批改英语试卷。',
    detail: '她的手肘底下压着一张写着你名字的纸条。'
  },
  {
    id: 'mutant-scavenger',
    name: '变异拾荒者',
    type: 'danger',
    appearance: '破烂发黑的雨衣，戴着破洞防毒面具。',
    state: '正蹲在角落翻找垃圾，喉咙发出呼噜声。',
    detail: '他的右手已经变异成了类似螳螂的刀刃。'
  },
  {
    id: 'stray-orange-cat',
    name: '流浪橘猫',
    type: 'normal',
    appearance: '脏兮兮的橘色皮毛，尾巴秃了一块。',
    state: '四脚朝天躺在花坛边晒太阳，打着哈欠。',
    detail: '它的脖子上挂着一枚纯金的戒指。'
  }
];

let selectedCharsCharacterIndex = charsEnvironmentEntries.length ? 0 : -1;
let activeCharsCharacterIndex = -1;
let charsListScrollTop = 0;

function escapeCharsText(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getCharsStatusMarkup() {
  if (!charsGenerationStatusMessage) return '';
  const isLoading = charsRequestStatus === 'loading';
  return `<div class="items-status-banner${isLoading ? ' is-loading' : ''}">${escapeCharsText(charsGenerationStatusMessage)}</div>`;
}

function clearCharsGenerationStatusAutoTimer() {
  if (!charsStatusAutoClearTimer) return;
  clearTimeout(charsStatusAutoClearTimer);
  charsStatusAutoClearTimer = null;
}

function setCharsGenerationStatus(message = '', status = charsRequestStatus, { autoClear = false } = {}) {
  clearCharsGenerationStatusAutoTimer();
  charsGenerationStatusMessage = String(message || '').trim();
  charsRequestStatus = status || 'idle';
  if (!charsGenerationStatusMessage || !autoClear) return;
  charsStatusAutoClearTimer = setTimeout(() => {
    charsStatusAutoClearTimer = null;
    charsGenerationStatusMessage = '';
    if (currentAppKey === 'chars') {
      renderActiveCharsWindow();
    }
  }, CHARS_STATUS_AUTO_CLEAR_MS);
}

function getCharsEntries() {
  return Array.isArray(charsEnvironmentEntries) ? charsEnvironmentEntries : [];
}

function getCharsSafeIndex(index = selectedCharsCharacterIndex) {
  const entries = getCharsEntries();
  if (!entries.length) return -1;
  const parsedIndex = Number(index);
  if (!Number.isInteger(parsedIndex)) return 0;
  return Math.min(Math.max(parsedIndex, 0), entries.length - 1);
}

function getCurrentBleachPhoneCharsChatId() {
  const ctx = typeof getSillyTavernContext === 'function' ? getSillyTavernContext() : null;
  return typeof ctx?.getCurrentChatId === 'function'
    ? (ctx.getCurrentChatId() || '')
    : String(ctx?.chatId || '');
}

async function getBleachPhoneCharsVariableValue({ expectedChatId = '' } = {}) {
  const stApi = typeof getSTAPI === 'function' ? getSTAPI() : null;
  if (typeof stApi?.variables?.get !== 'function') return null;

  const currentChatId = getCurrentBleachPhoneCharsChatId();
  if (!currentChatId || (expectedChatId && currentChatId !== expectedChatId)) return null;

  try {
    const result = await stApi.variables.get({ name: BLEACH_PHONE_CHARS_VARIABLE_KEY, scope: 'local' });
    return result?.value ?? null;
  } catch (error) {
    console.warn('[情报变量] chars_json 读取失败', error);
    return null;
  }
}

async function syncBleachPhoneCharsVariableValue(rawValue, { expectedChatId = '' } = {}) {
  const stApi = typeof getSTAPI === 'function' ? getSTAPI() : null;
  if (typeof stApi?.variables?.set !== 'function') return false;

  const currentChatId = getCurrentBleachPhoneCharsChatId();
  if (!currentChatId || (expectedChatId && currentChatId !== expectedChatId)) {
    return false;
  }

  try {
    const result = await stApi.variables.set({
      name: BLEACH_PHONE_CHARS_VARIABLE_KEY,
      scope: 'local',
      value: typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue || {}, null, 2)
    });
    return result?.ok !== false;
  } catch (error) {
    console.warn('[情报变量] chars_json 同步失败', error);
    return false;
  }
}

async function syncBleachPhoneCharsVariableFromParsedResult(parsedResult, options = {}) {
  if (!parsedResult || typeof parsedResult !== 'object') return false;
  const payloadText = String(parsedResult.candidate || '').trim();
  const fallbackPayload = parsedResult.parsed && typeof parsedResult.parsed === 'object'
    ? JSON.stringify(parsedResult.parsed, null, 2)
    : '';
  const variableValue = payloadText || fallbackPayload;
  if (!variableValue) return false;
  return syncBleachPhoneCharsVariableValue(variableValue, options);
}

function renderActiveCharsWindow() {
  if (currentAppKey === 'chars') {
    renderAppWindow('chars');
  }
}

function normalizeCharsLineText(value) {
  if (Array.isArray(value)) {
    return value
      .map((part) => String(part || '').trim())
      .filter(Boolean)
      .join(' ');
  }
  return String(value || '').trim();
}

function normalizeCharsEntry(entry, index = 0) {
  if (!entry || typeof entry !== 'object') return null;
  const name = normalizeCharsLineText(entry.name);
  const appearance = normalizeCharsLineText(entry.appearance);
  const state = normalizeCharsLineText(entry.state);
  const detail = normalizeCharsLineText(entry.detail);
  const id = String(entry.id || `chars-entry-${index + 1}`).trim() || `chars-entry-${index + 1}`;
  const type = String(entry.type || 'normal').trim() || 'normal';
  if (!name || !appearance || !state || !detail) return null;
  return { id, type, name, appearance, state, detail };
}

function parseCharsAiResponse(rawText = '') {
  const sourceText = String(rawText || '').trim();
  if (!sourceText) {
    throw new Error('情报返回内容为空');
  }

  const taggedPayload = typeof extractTagContentWithTag === 'function'
    ? extractTagContentWithTag(sourceText, charsParserConfig.payloadTag)
    : '';
  if (!taggedPayload) {
    throw new Error(`未找到 <${charsParserConfig.payloadTag}> 标签`);
  }

  const payloadText = taggedPayload
    .replace(new RegExp(`^<${charsParserConfig.payloadTag}>|</${charsParserConfig.payloadTag}>$`, 'gi'), '')
    .trim();
  if (!payloadText) {
    throw new Error('chars_json 标签内容为空');
  }

  let parsedPayload;
  try {
    parsedPayload = JSON.parse(payloadText);
  } catch (error) {
    throw new Error(`chars_json 不是有效 JSON：${error?.message || '解析失败'}`);
  }

  if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
    throw new Error('chars_json 顶层必须是对象');
  }

  for (const key of charsParserConfig.requiredTopLevelKeys) {
    if (!(key in parsedPayload)) {
      throw new Error(`chars_json 缺少顶层字段：${key}`);
    }
  }

  if (!Array.isArray(parsedPayload.characters)) {
    throw new Error('chars_json.characters 必须是数组');
  }

  const characters = parsedPayload.characters
    .map((entry, index) => normalizeCharsEntry(entry, index))
    .filter(Boolean);
  if (!characters.length) {
    throw new Error(`情报列表为空，且每个条目必须包含字段：${charsParserConfig.requiredCharacterKeys.join(', ')}`);
  }

  return {
    characters,
    raw: sourceText,
    parsed: parsedPayload,
    candidate: payloadText
  };
}

function loadCharsData(entries, { render = true } = {}) {
  const normalizedEntries = Array.isArray(entries)
    ? entries.map((entry, index) => normalizeCharsEntry(entry, index)).filter(Boolean)
    : [];
  if (!normalizedEntries.length) return false;
  charsEnvironmentEntries = normalizedEntries;
  selectedCharsCharacterIndex = Math.min(Math.max(selectedCharsCharacterIndex, 0), charsEnvironmentEntries.length - 1);
  activeCharsCharacterIndex = -1;
  charsListScrollTop = 0;
  if (render && currentAppKey === 'chars') {
    renderActiveCharsWindow();
  }
  return true;
}

function clearCharsData({ render = true } = {}) {
  charsEnvironmentEntries = [];
  selectedCharsCharacterIndex = -1;
  activeCharsCharacterIndex = -1;
  charsListScrollTop = 0;
  if (render && currentAppKey === 'chars') {
    renderActiveCharsWindow();
  }
  return true;
}

async function loadBleachPhoneCharsVariableToRuntime({ render = true, clearOnMissing = false } = {}) {
  const rawValue = await getBleachPhoneCharsVariableValue();
  if (rawValue == null || String(rawValue).trim() === '') {
    if (clearOnMissing) {
      clearCharsData({ render });
      setCharsGenerationStatus('当前聊天暂无情报数据', 'idle', { autoClear: true });
      return true;
    }
    return false;
  }
  try {
    const parsedResult = parseCharsAiResponse(String(rawValue));
    setCharsGenerationStatus('已从聊天变量恢复情报', 'success', { autoClear: true });
    return loadCharsData(parsedResult.characters, { render });
  } catch (error) {
    console.warn('[情报变量] chars_json 恢复失败', error);
    if (clearOnMissing) {
      clearCharsData({ render });
      setCharsGenerationStatus('当前聊天情报数据无效', 'error');
      return true;
    }
    return false;
  }
}

function bindBleachPhoneCharsVariableEvents() {
  if (isBleachPhoneCharsVariableEventsBound) return true;
  const ctx = typeof getSillyTavernContext === 'function' ? getSillyTavernContext() : null;
  if (typeof ctx?.eventSource?.on !== 'function') return false;

  const handleChatChanged = async () => {
    await loadBleachPhoneCharsVariableToRuntime({ clearOnMissing: true, render: false });
    if (currentAppKey === 'chars') {
      renderActiveCharsWindow();
    }
  };

  const chatChangedEvent = ctx?.eventTypes?.CHAT_CHANGED || 'chat_id_changed';
  ctx.eventSource.on(chatChangedEvent, handleChatChanged);
  if (ctx?.eventTypes?.CHAT_LOADED) {
    ctx.eventSource.on(ctx.eventTypes.CHAT_LOADED, handleChatChanged);
  }
  isBleachPhoneCharsVariableEventsBound = true;
  return true;
}

function getCharsSettingsEntries() {
  return [
    { key: 'api', label: 'API' },
    { key: 'preset', label: '情报预设' },
    { key: 'autoGenerate', label: '自动生成' }
  ];
}

function getCharsApiBindingProfiles() {
  const settings = normalizeAiSettings(aiSettings);
  return Array.isArray(settings.apiProfiles) ? settings.apiProfiles : [];
}

function getCharsPresetEntries() {
  const settings = normalizeAiSettings(aiSettings);
  return Array.isArray(settings.presetEntries) ? settings.presetEntries : [];
}

function getSelectedCharsPresetEntry(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  const targetPresetId = resolveSelectedAiPresetId(settings.selectedCharsPresetId || settings.selectedPresetId, settings.presetEntries);
  return getAiPresetEntryById(targetPresetId, settings) || settings.presetEntries?.[0] || null;
}

function syncCharsPresetSelection() {
  const presets = getCharsPresetEntries();
  currentCharsPresetId = resolveSelectedAiPresetId(normalizeAiSettings(aiSettings).selectedCharsPresetId || currentCharsPresetId || currentAiPresetId, presets);
  const currentIndex = presets.findIndex((preset) => preset.id === currentCharsPresetId);
  selectedCharsPresetIndex = presets.length
    ? Math.min(Math.max(selectedCharsPresetIndex >= 0 ? selectedCharsPresetIndex : (currentIndex >= 0 ? currentIndex : 0), 0), presets.length - 1)
    : -1;
}

function setCharsSelectedPreset(presetId) {
  const settings = normalizeAiSettings(aiSettings);
  const nextPresetId = resolveSelectedAiPresetId(presetId, settings.presetEntries);
  aiSettings = normalizeAiSettings({
    ...settings,
    selectedCharsPresetId: nextPresetId
  });
  currentCharsPresetId = aiSettings.selectedCharsPresetId;
  persistAiSettings(aiSettings);
  return currentCharsPresetId;
}

function syncCharsApiBindingSelection() {
  const profiles = getCharsApiBindingProfiles();
  const currentBindingId = getAiBindingProfileId('chars', aiSettings);
  const currentIndex = profiles.findIndex((profile) => profile.id === currentBindingId);
  selectedCharsApiProfileIndex = profiles.length
    ? Math.min(Math.max(selectedCharsApiProfileIndex >= 0 ? selectedCharsApiProfileIndex : (currentIndex >= 0 ? currentIndex : 0), 0), profiles.length - 1)
    : -1;
}

function getCharsSelectedBindingName() {
  return getAiBindingProfileName('chars', aiSettings) || '未设';
}

function getCharsAutoGenerateSummary(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  return getBleachPhoneAutoGenerateSummary({
    enabled: settings.charsAutoGenerateEnabled,
    trigger: settings.charsAutoGenerateTrigger,
    interval: settings.charsAutoGenerateInterval || '1'
  });
}

function getCharsAutoGenerateEntries(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  return getBleachPhoneAutoGenerateEntries({
    enabled: settings.charsAutoGenerateEnabled,
    trigger: settings.charsAutoGenerateTrigger,
    interval: settings.charsAutoGenerateInterval || '1'
  });
}

function updateCharsAutoGenerateSettings(patch = {}) {
  const settings = normalizeAiSettings(aiSettings);
  aiSettings = normalizeAiSettings({
    ...settings,
    ...patch
  });
  persistAiSettings(aiSettings);
  return aiSettings;
}

function getCharsAutoGenerateRuntimeSettings(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  const interval = Number.parseInt(String(settings.charsAutoGenerateInterval || '1'), 10);
  return {
    enabled: Boolean(settings.charsAutoGenerateEnabled),
    trigger: String(settings.charsAutoGenerateTrigger || '').trim() === 'user' ? 'user' : 'assistant',
    interval: Number.isFinite(interval) && interval > 0 ? interval : 1
  };
}

function getCharsAutoGenerateChatMessages() {
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

function resetCharsAutoGenerateHandledKeys() {
  charsAutoGenerateLastHandledKeys = {
    assistant: '',
    user: ''
  };
}

function buildCharsAutoGenerateHandledKey(triggerType, chatId, floorCount, content = '') {
  return [
    String(chatId || '').trim(),
    String(triggerType || '').trim(),
    String(floorCount || 0),
    String(content || '').trim().slice(0, 240)
  ].join('::');
}

async function buildCharsGenerationMessages() {
  const presetEntry = getSelectedCharsPresetEntry(aiSettings);
  if (!presetEntry?.blocks?.length) {
    throw createSilentAiChatError('情报生成未配置情报预设');
  }
  const messages = await buildAiMessagesFromPreset(null, '', presetEntry, { pendingTargets: [] });
  const normalizedMessages = Array.isArray(messages)
    ? messages.filter((message) => String(message?.content || '').trim())
    : [];
  if (!normalizedMessages.length) {
    throw createSilentAiChatError('情报预设内容为空');
  }
  return normalizedMessages;
}

async function requestAiCharsReply() {
  const settings = getAiRuntimeSettings('chars', aiSettings);
  if (!settings.url) throw createSilentAiChatError('情报生成未绑定 API');
  if (!settings.key) throw createSilentAiChatError('情报生成未配置 API Key');
  if (!settings.model) throw createSilentAiChatError('情报生成未配置模型');

  const body = {
    model: settings.model,
    messages: await buildCharsGenerationMessages(),
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

async function generateCharsDataFromApi() {
  if (charsRequestStatus === 'loading') {
    return false;
  }

  const expectedChatId = getCurrentBleachPhoneCharsChatId();
  setCharsGenerationStatus('情报生成中…', 'loading');
  renderActiveCharsWindow();
  let aiReplyText = '';
  try {
    aiReplyText = await requestAiCharsReply();
    const parsedResult = parseCharsAiResponse(aiReplyText);
    loadCharsData(parsedResult.characters, { render: false });
    const variableSynced = await syncBleachPhoneCharsVariableFromParsedResult(parsedResult, { expectedChatId });
    if (!variableSynced) {
      console.warn('[情报变量] chars_json 未写入酒馆变量', { variableName: BLEACH_PHONE_CHARS_VARIABLE_KEY });
    }
    setCharsGenerationStatus(`情报已更新 · ${parsedResult.characters.length} 名${variableSynced ? '' : ' · 变量未同步'}`, 'success', { autoClear: true });
    renderActiveCharsWindow();
    return true;
  } catch (error) {
    const message = error?.silent
      ? String(error.message || '').trim()
      : `生成失败：${String(error?.message || '未知错误').trim() || '未知错误'}`;
    setCharsGenerationStatus(message, 'error');
    console.error('[情报] 生成失败', error);
    if (aiReplyText) {
      console.error('[情报] AI 原始回复内容：\n' + aiReplyText);
    }
    renderActiveCharsWindow();
    return false;
  }
}

async function handleCharsAutoGenerateChatEvent(triggerType = 'assistant') {
  const normalizedTrigger = String(triggerType || '').trim() === 'user' ? 'user' : 'assistant';
  const runtimeSettings = getCharsAutoGenerateRuntimeSettings(aiSettings);
  if (!runtimeSettings.enabled || runtimeSettings.trigger !== normalizedTrigger) {
    return false;
  }

  const activeChatId = typeof getCurrentSTChatId === 'function'
    ? String(getCurrentSTChatId() || '').trim()
    : String(getCurrentBleachPhoneCharsChatId() || '').trim();
  if (!activeChatId) {
    return false;
  }

  const chatMessages = getCharsAutoGenerateChatMessages();
  if (!chatMessages.length) {
    return false;
  }

  const targetMessages = chatMessages.filter((message) => message.role === normalizedTrigger && String(message.content || '').trim());
  const floorCount = targetMessages.length;
  if (!floorCount || floorCount % runtimeSettings.interval !== 0) {
    return false;
  }

  const latestMessage = targetMessages[targetMessages.length - 1] || null;
  const handledKey = buildCharsAutoGenerateHandledKey(normalizedTrigger, activeChatId, floorCount, latestMessage?.content || '');
  if (charsAutoGenerateLastHandledKeys[normalizedTrigger] === handledKey) {
    return false;
  }
  charsAutoGenerateLastHandledKeys[normalizedTrigger] = handledKey;

  try {
    return await generateCharsDataFromApi();
  } catch (error) {
    console.error(`[情报自动生成] ${normalizedTrigger === 'user' ? '用户' : 'AI'}消息触发失败`, error);
    return false;
  }
}

function bindCharsAutoGenerateEvents() {
  if (isCharsAutoGenerateEventsBound) return true;
  const ctx = typeof getSillyTavernContext === 'function' ? getSillyTavernContext() : null;
  if (typeof ctx?.eventSource?.on !== 'function') return false;

  const messageReceivedEvent = ctx?.eventTypes?.MESSAGE_RECEIVED || 'message_received';
  const messageSentEvent = ctx?.eventTypes?.MESSAGE_SENT || 'message_sent';
  const chatChangedEvent = ctx?.eventTypes?.CHAT_CHANGED || 'chat_id_changed';
  const handleAssistantMessage = () => {
    Promise.resolve().then(() => handleCharsAutoGenerateChatEvent('assistant')).catch((error) => {
      console.error('[情报自动生成] AI消息事件处理失败', error);
    });
  };
  const handleUserMessage = () => {
    Promise.resolve().then(() => handleCharsAutoGenerateChatEvent('user')).catch((error) => {
      console.error('[情报自动生成] 用户消息事件处理失败', error);
    });
  };
  const handleChatChanged = () => {
    resetCharsAutoGenerateHandledKeys();
  };

  ctx.eventSource.on(messageReceivedEvent, handleAssistantMessage);
  ctx.eventSource.on(messageSentEvent, handleUserMessage);
  ctx.eventSource.on(chatChangedEvent, handleChatChanged);
  if (ctx?.eventTypes?.CHAT_LOADED) {
    ctx.eventSource.on(ctx.eventTypes.CHAT_LOADED, handleChatChanged);
  }
  isCharsAutoGenerateEventsBound = true;
  return true;
}

async function triggerCharsGenerationFromSoftkey() {
  return generateCharsDataFromApi();
}

function resetCharsViewState() {
  const entries = getCharsEntries();
  charsView = 'list';
  selectedCharsCharacterIndex = entries.length ? 0 : -1;
  activeCharsCharacterIndex = -1;
  charsListScrollTop = 0;
  selectedCharsSettingsIndex = 0;
  charsSettingsListScrollTop = 0;
  selectedCharsApiProfileIndex = -1;
  charsApiProfileListScrollTop = 0;
  currentCharsPresetId = normalizeAiSettings(aiSettings).selectedCharsPresetId || normalizeAiSettings(aiSettings).selectedPresetId || '';
  selectedCharsPresetIndex = -1;
  charsPresetListScrollTop = 0;
  selectedCharsAutoGenerateIndex = 0;
  charsAutoGenerateListScrollTop = 0;
}

function openCharsSettings() {
  charsView = 'settings';
  selectedCharsSettingsIndex = Math.min(Math.max(selectedCharsSettingsIndex, 0), Math.max(getCharsSettingsEntries().length - 1, 0));
  renderActiveCharsWindow();
}

function closeCharsSettings() {
  charsView = 'list';
  renderActiveCharsWindow();
}

function openCharsApiBindingList() {
  charsView = 'apiBinding';
  syncCharsApiBindingSelection();
  renderActiveCharsWindow();
}

function closeCharsApiBindingList() {
  charsView = 'settings';
  renderActiveCharsWindow();
}

function openCharsPresetList() {
  charsView = 'preset';
  syncCharsPresetSelection();
  renderActiveCharsWindow();
}

function closeCharsPresetList() {
  charsView = 'settings';
  renderActiveCharsWindow();
}

function openCharsAutoGenerateList() {
  charsView = 'autoGenerate';
  selectedCharsAutoGenerateIndex = Math.min(Math.max(selectedCharsAutoGenerateIndex, 0), Math.max(getCharsAutoGenerateEntries().length - 1, 0));
  renderActiveCharsWindow();
}

function closeCharsAutoGenerateList() {
  charsView = 'settings';
  renderActiveCharsWindow();
}

function openCharsSettingsSelection() {
  const targetEntry = getCharsSettingsEntries()[selectedCharsSettingsIndex] || getCharsSettingsEntries()[0];
  if (!targetEntry) return;
  if (targetEntry.key === 'api') {
    openCharsApiBindingList();
    return;
  }
  if (targetEntry.key === 'preset') {
    openCharsPresetList();
    return;
  }
  openCharsAutoGenerateList();
}

function bindCharsApiProfileSelection() {
  const profiles = getCharsApiBindingProfiles();
  const targetProfile = profiles[selectedCharsApiProfileIndex] || null;
  if (!targetProfile) return false;
  if (!bindAiApiProfile('chars', targetProfile.id)) return false;
  closeCharsApiBindingList();
  return true;
}

function bindCharsPresetSelection() {
  const presets = getCharsPresetEntries();
  const targetPreset = presets[selectedCharsPresetIndex] || null;
  if (!targetPreset) return false;
  setCharsSelectedPreset(targetPreset.id);
  closeCharsPresetList();
  return true;
}

function confirmCharsAutoGenerateSelection() {
  const entries = getCharsAutoGenerateEntries();
  const targetEntry = entries[selectedCharsAutoGenerateIndex] || entries[0] || null;
  if (!targetEntry) return false;

  const settings = normalizeAiSettings(aiSettings);
  if (targetEntry.key === 'enabled') {
    updateCharsAutoGenerateSettings({ charsAutoGenerateEnabled: !settings.charsAutoGenerateEnabled });
    renderActiveCharsWindow();
    return true;
  }
  if (targetEntry.key === 'trigger') {
    updateCharsAutoGenerateSettings({
      charsAutoGenerateTrigger: settings.charsAutoGenerateTrigger === 'user' ? 'assistant' : 'user'
    });
    renderActiveCharsWindow();
    return true;
  }

  const currentInterval = Number.parseInt(String(settings.charsAutoGenerateInterval || '1'), 10);
  const safeCurrentInterval = Number.isFinite(currentInterval) && currentInterval > 0 ? currentInterval : 1;
  updateCharsAutoGenerateSettings({ charsAutoGenerateInterval: String(Math.min(99, safeCurrentInterval + 1)) });
  renderActiveCharsWindow();
  return true;
}

function adjustCharsAutoGenerateInterval(step = 1) {
  const settings = normalizeAiSettings(aiSettings);
  const currentInterval = Number.parseInt(String(settings.charsAutoGenerateInterval || '1'), 10);
  const safeCurrentInterval = Number.isFinite(currentInterval) && currentInterval > 0 ? currentInterval : 1;
  const nextInterval = Math.min(99, Math.max(1, safeCurrentInterval + step));
  if (nextInterval === safeCurrentInterval) return false;
  updateCharsAutoGenerateSettings({ charsAutoGenerateInterval: String(nextInterval) });
  renderActiveCharsWindow();
  return true;
}

function renderCharsSettingsView() {
  const entries = getCharsSettingsEntries();
  return `
    ${getCharsStatusMarkup()}
    <div class="contact-saved-list" id="chars-settings-list">
      ${entries.map((entry, index) => {
        const previewText = entry.key === 'api'
          ? getCharsSelectedBindingName()
          : (entry.key === 'preset'
            ? (getSelectedCharsPresetEntry(aiSettings)?.name || '未设')
            : getCharsAutoGenerateSummary(aiSettings));
        return `
          <div class="contact-saved-item chars-settings-item ${selectedCharsSettingsIndex === index ? 'is-selected' : ''}" data-chars-settings-index="${index}" data-chars-settings-key="${entry.key}">
            <div class="contact-saved-main">
              <span class="contact-saved-name">${escapeCharsText(entry.label)}</span>
              <span class="contact-saved-preview">${escapeCharsText(previewText)}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderCharsApiBindingView() {
  const profiles = getCharsApiBindingProfiles();
  if (!profiles.length) {
    return `${getCharsStatusMarkup()}<div class="sms-settings-empty-view">暂无 API 配置</div>`;
  }
  const currentBindingId = getAiBindingProfileId('chars', aiSettings);
  return `
    ${getCharsStatusMarkup()}
    <div class="contact-saved-list" id="chars-api-profile-list">
      ${profiles.map((profile, index) => `
        <div class="contact-saved-item chars-api-profile-item ${selectedCharsApiProfileIndex === index ? 'is-selected' : ''}" data-chars-api-profile-index="${index}">
          <div class="contact-saved-main">
            <span class="contact-saved-name">${escapeCharsText(profile.name || '默认')}</span>
            <span class="contact-saved-preview">${currentBindingId === profile.id ? '当前使用' : escapeCharsText(getAiApiHostLabel(profile.url) || '未设端点')}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderCharsPresetView() {
  const presets = getCharsPresetEntries();
  if (!presets.length) {
    return `${getCharsStatusMarkup()}<div class="sms-settings-empty-view">暂无预设</div>`;
  }
  return `
    ${getCharsStatusMarkup()}
    <div class="contact-saved-list" id="chars-preset-list">
      ${presets.map((preset, index) => `
        <div class="contact-saved-item chars-preset-item ${selectedCharsPresetIndex === index ? 'is-selected' : ''}" data-chars-preset-index="${index}">
          <div class="contact-saved-main">
            <span class="contact-saved-name">${escapeCharsText(preset.name || `预设 ${index + 1}`)}</span>
            <span class="contact-saved-preview">${currentCharsPresetId === preset.id ? '当前使用' : `${Array.isArray(preset.blocks) ? preset.blocks.length : 0} 个块`}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderCharsAutoGenerateView() {
  return renderBleachPhoneAutoGenerateSettingsView({
    statusMarkup: getCharsStatusMarkup(),
    listId: 'chars-auto-generate-list',
    itemClassName: 'chars-auto-generate-item',
    selectedIndex: selectedCharsAutoGenerateIndex,
    entries: getCharsAutoGenerateEntries(),
    escapeText: escapeCharsText,
    dataIndexAttr: 'data-chars-auto-generate-index',
    dataKeyAttr: 'data-chars-auto-generate-key'
  });
}

function renderCharsListView() {
  const entries = getCharsEntries();
  const cardsMarkup = entries.length
    ? entries.map((entry, index) => {
      const isSelected = index === selectedCharsCharacterIndex;
      const isActive = index === activeCharsCharacterIndex;
      return `
        <div class="char-card${isSelected ? ' is-selected' : ''}${isActive ? ' active' : ''}" data-chars-index="${index}" id="chars-card-${index}" onclick="handleCharsCharacterCardClick(${index})">
          <div class="char-name">
            <span>${escapeCharsText(entry.name)}</span>
            <span class="toggle-icon" id="chars-icon-${index}">＋</span>
          </div>
          <div class="char-details">
            <div class="info-row">
              <span class="label">外观：</span>
              <span class="text">${escapeCharsText(entry.appearance)}</span>
            </div>
            <div class="info-row">
              <span class="label">状态：</span>
              <span class="text">${escapeCharsText(entry.state)}</span>
            </div>
            <div class="info-row detail-row">
              <span class="label">细节：</span>
              <span class="text">${escapeCharsText(entry.detail)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('')
    : '<div class="sms-settings-empty-view">暂无角色情报</div>';

  return `
    <section class="chars-app-shell" aria-label="情报应用">
      ${getCharsStatusMarkup()}
      <div class="content-area" id="chars-character-list">
        ${cardsMarkup}
      </div>
    </section>
  `;
}

function renderCharsContent() {
  if (charsView === 'settings') {
    return renderCharsSettingsView();
  }
  if (charsView === 'apiBinding') {
    return renderCharsApiBindingView();
  }
  if (charsView === 'preset') {
    return renderCharsPresetView();
  }
  if (charsView === 'autoGenerate') {
    return renderCharsAutoGenerateView();
  }
  return renderCharsListView();
}

function syncCharsViewState() {
  if (charsView !== 'list') return;
  const list = document.getElementById('chars-character-list');
  if (!list) return;

  list.scrollTop = charsListScrollTop;
  if (!list.dataset.boundScroll) {
    list.addEventListener('scroll', () => {
      charsListScrollTop = list.scrollTop;
    }, { passive: true });
    list.dataset.boundScroll = '1';
  }
}

function updateCharsCardStates({ scrollSelectedIntoView = false } = {}) {
  const list = document.getElementById('chars-character-list');
  if (!list) {
    renderActiveCharsWindow();
    return;
  }

  const currentScrollTop = list.scrollTop;
  const cards = list.querySelectorAll('.char-card');
  cards.forEach((card) => {
    const cardIndex = Number(card.dataset.charsIndex);
    card.classList.toggle('is-selected', cardIndex === selectedCharsCharacterIndex);
    card.classList.toggle('active', cardIndex === activeCharsCharacterIndex);
  });

  if (scrollSelectedIntoView) {
    const selectedCard = list.querySelector(`.char-card[data-chars-index="${selectedCharsCharacterIndex}"]`);
    selectedCard?.scrollIntoView({ block: 'nearest' });
    charsListScrollTop = list.scrollTop;
    return;
  }

  list.scrollTop = currentScrollTop;
  charsListScrollTop = list.scrollTop;
}

function handleCharsCharacterCardClick(index) {
  const entries = getCharsEntries();
  if (!entries.length || index < 0 || index >= entries.length) return;
  const list = document.getElementById('chars-character-list');
  if (list) {
    charsListScrollTop = list.scrollTop;
  }
  selectedCharsCharacterIndex = index;
  activeCharsCharacterIndex = activeCharsCharacterIndex === index ? -1 : index;
  updateCharsCardStates();
}

function confirmCharsSelection() {
  if (selectedCharsCharacterIndex < 0) return;
  handleCharsCharacterCardClick(selectedCharsCharacterIndex);
}

function moveCharsSelection(direction) {
  if (charsView === 'settings') {
    const entries = getCharsSettingsEntries();
    const settingsList = document.getElementById('chars-settings-list');
    if (settingsList) {
      charsSettingsListScrollTop = settingsList.scrollTop;
    }
    if (!entries.length) return;
    if (direction === 'up') {
      selectedCharsSettingsIndex = Math.max(0, selectedCharsSettingsIndex - 1);
      renderActiveCharsWindow();
      return;
    }
    if (direction === 'down') {
      selectedCharsSettingsIndex = Math.min(entries.length - 1, selectedCharsSettingsIndex + 1);
      renderActiveCharsWindow();
    }
    return;
  }

  if (charsView === 'apiBinding') {
    const profiles = getCharsApiBindingProfiles();
    const profileList = document.getElementById('chars-api-profile-list');
    if (profileList) {
      charsApiProfileListScrollTop = profileList.scrollTop;
    }
    if (!profiles.length) return;
    if (direction === 'up') {
      selectedCharsApiProfileIndex = Math.max(0, selectedCharsApiProfileIndex - 1);
      renderActiveCharsWindow();
      return;
    }
    if (direction === 'down') {
      selectedCharsApiProfileIndex = Math.min(profiles.length - 1, selectedCharsApiProfileIndex + 1);
      renderActiveCharsWindow();
    }
    return;
  }

  if (charsView === 'preset') {
    const presets = getCharsPresetEntries();
    const presetList = document.getElementById('chars-preset-list');
    if (presetList) {
      charsPresetListScrollTop = presetList.scrollTop;
    }
    if (!presets.length) return;
    if (direction === 'up') {
      selectedCharsPresetIndex = Math.max(0, selectedCharsPresetIndex - 1);
      renderActiveCharsWindow();
      return;
    }
    if (direction === 'down') {
      selectedCharsPresetIndex = Math.min(presets.length - 1, selectedCharsPresetIndex + 1);
      renderActiveCharsWindow();
    }
    return;
  }

  if (charsView === 'autoGenerate') {
    const entries = getCharsAutoGenerateEntries();
    const autoGenerateList = document.getElementById('chars-auto-generate-list');
    if (autoGenerateList) {
      charsAutoGenerateListScrollTop = autoGenerateList.scrollTop;
    }
    if (!entries.length) return;
    if (direction === 'left') {
      const targetEntry = entries[selectedCharsAutoGenerateIndex] || null;
      if (targetEntry?.key === 'interval') {
        adjustCharsAutoGenerateInterval(-1);
      }
      return;
    }
    if (direction === 'right') {
      const targetEntry = entries[selectedCharsAutoGenerateIndex] || null;
      if (targetEntry?.key === 'interval') {
        adjustCharsAutoGenerateInterval(1);
      }
      return;
    }
    if (direction === 'up') {
      selectedCharsAutoGenerateIndex = Math.max(0, selectedCharsAutoGenerateIndex - 1);
      renderActiveCharsWindow();
      return;
    }
    if (direction === 'down') {
      selectedCharsAutoGenerateIndex = Math.min(entries.length - 1, selectedCharsAutoGenerateIndex + 1);
      renderActiveCharsWindow();
    }
    return;
  }

  const entries = getCharsEntries();
  if (!entries.length) return;

  let nextIndex = selectedCharsCharacterIndex >= 0 ? selectedCharsCharacterIndex : 0;
  if (direction === 'up') {
    nextIndex = Math.max(0, nextIndex - 1);
  } else if (direction === 'down') {
    nextIndex = Math.min(entries.length - 1, nextIndex + 1);
  } else {
    return;
  }

  if (nextIndex === selectedCharsCharacterIndex) return;
  selectedCharsCharacterIndex = nextIndex;
  updateCharsCardStates({ scrollSelectedIntoView: true });
}
