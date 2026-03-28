// Radio / 新闻应用逻辑（从 main.js 渐进拆出）

const radioParserConfig = {
  payloadTag: 'radio_json',
  requiredTopLevelKeys: ['news'],
  requiredNewsKeys: ['title', 'source', 'time', 'body'],
  optionalNewsKeys: ['id']
};

const BLEACH_PHONE_RADIO_VARIABLE_KEY = 'bleach_phone_radio_json';
const RADIO_STATUS_AUTO_CLEAR_MS = 2400;

let isBleachPhoneRadioVariableEventsBound = false;
let isRadioAutoGenerateEventsBound = false;
let radioStatusAutoClearTimer = null;
let radioAutoGenerateLastHandledKeys = {
  assistant: '',
  user: ''
};

function getRadioStatusMarkup() {
  if (!radioGenerationStatusMessage) return '';
  const isLoading = radioRequestStatus === 'loading';
  return `<div class="items-status-banner${isLoading ? ' is-loading' : ''}">${escapeHtml(radioGenerationStatusMessage)}</div>`;
}

function clearRadioGenerationStatusAutoTimer() {
  if (!radioStatusAutoClearTimer) return;
  clearTimeout(radioStatusAutoClearTimer);
  radioStatusAutoClearTimer = null;
}

function setRadioGenerationStatus(message = '', status = radioRequestStatus, { autoClear = false } = {}) {
  clearRadioGenerationStatusAutoTimer();
  radioGenerationStatusMessage = String(message || '').trim();
  radioRequestStatus = status || 'idle';
  if (!radioGenerationStatusMessage || !autoClear) return;
  radioStatusAutoClearTimer = setTimeout(() => {
    radioStatusAutoClearTimer = null;
    radioGenerationStatusMessage = '';
    if (currentAppKey === 'radio') {
      renderActiveRadioWindow();
    }
  }, RADIO_STATUS_AUTO_CLEAR_MS);
}

function getCurrentBleachPhoneRadioChatId() {
  const ctx = typeof getSillyTavernContext === 'function' ? getSillyTavernContext() : null;
  return typeof ctx?.getCurrentChatId === 'function'
    ? (ctx.getCurrentChatId() || '')
    : String(ctx?.chatId || '');
}

async function getBleachPhoneRadioVariableValue({ expectedChatId = '' } = {}) {
  const stApi = typeof getSTAPI === 'function' ? getSTAPI() : null;
  if (typeof stApi?.variables?.get !== 'function') return null;

  const currentChatId = getCurrentBleachPhoneRadioChatId();
  if (!currentChatId || (expectedChatId && currentChatId !== expectedChatId)) return null;

  try {
    const result = await stApi.variables.get({ name: BLEACH_PHONE_RADIO_VARIABLE_KEY, scope: 'local' });
    return result?.value ?? null;
  } catch (error) {
    console.warn('[广播变量] radio_json 读取失败', error);
    return null;
  }
}

async function syncBleachPhoneRadioVariableValue(rawValue, { expectedChatId = '' } = {}) {
  const stApi = typeof getSTAPI === 'function' ? getSTAPI() : null;
  if (typeof stApi?.variables?.set !== 'function') return false;

  const currentChatId = getCurrentBleachPhoneRadioChatId();
  if (!currentChatId || (expectedChatId && currentChatId !== expectedChatId)) {
    return false;
  }

  try {
    const result = await stApi.variables.set({
      name: BLEACH_PHONE_RADIO_VARIABLE_KEY,
      scope: 'local',
      value: typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue || {}, null, 2)
    });
    return result?.ok !== false;
  } catch (error) {
    console.warn('[广播变量] radio_json 同步失败', error);
    return false;
  }
}

async function syncBleachPhoneRadioVariableFromParsedResult(parsedResult, options = {}) {
  if (!parsedResult || typeof parsedResult !== 'object') return false;
  const payloadText = String(parsedResult.candidate || '').trim();
  const fallbackPayload = parsedResult.parsed && typeof parsedResult.parsed === 'object'
    ? JSON.stringify(parsedResult.parsed, null, 2)
    : '';
  const variableValue = payloadText || fallbackPayload;
  if (!variableValue) return false;
  return syncBleachPhoneRadioVariableValue(variableValue, options);
}

function renderActiveRadioWindow() {
  if (currentAppKey === 'radio') {
    renderAppWindow('radio');
  }
}

function normalizeRadioNewsParagraphs(body) {
  if (Array.isArray(body)) {
    return body
      .map((paragraph) => String(paragraph || '').trim())
      .filter(Boolean);
  }
  const singleParagraph = String(body || '').trim();
  return singleParagraph ? [singleParagraph] : [];
}

function normalizeRadioNewsEntry(entry, index = 0) {
  if (!entry || typeof entry !== 'object') return null;
  const title = String(entry.title || '').trim();
  const source = String(entry.source || '').trim();
  const time = String(entry.time || '').trim();
  const body = normalizeRadioNewsParagraphs(entry.body);
  const id = String(entry.id || `radio-news-${index + 1}`).trim() || `radio-news-${index + 1}`;
  if (!title || !source || !time || !body.length) {
    return null;
  }
  return { id, title, source, time, body };
}

function clearRadioData({ render = true } = {}) {
  radioNewsEntries = [];
  selectedRadioNewsIndex = -1;
  radioListScrollTop = 0;
  radioDetailScrollTop = 0;
  if (radioView === 'detail') {
    radioView = 'list';
  }
  if (render && currentAppKey === 'radio') {
    renderActiveRadioWindow();
  }
  return true;
}

async function loadBleachPhoneRadioVariableToRuntime({ render = true, clearOnMissing = false } = {}) {
  const rawValue = await getBleachPhoneRadioVariableValue();
  if (rawValue == null || String(rawValue).trim() === '') {
    if (clearOnMissing) {
      clearRadioData({ render });
      setRadioGenerationStatus('当前聊天暂无广播数据', 'idle', { autoClear: true });
      return true;
    }
    return false;
  }
  try {
    const parsedResult = parseRadioAiResponse(String(rawValue));
    setRadioGenerationStatus('已从聊天变量恢复广播', 'success', { autoClear: true });
    return loadRadioData(parsedResult.news, { render });
  } catch (error) {
    console.warn('[广播变量] radio_json 恢复失败', error);
    if (clearOnMissing) {
      clearRadioData({ render });
      setRadioGenerationStatus('当前聊天广播数据无效', 'error');
      return true;
    }
    return false;
  }
}

function bindBleachPhoneRadioVariableEvents() {
  if (isBleachPhoneRadioVariableEventsBound) return true;
  const ctx = typeof getSillyTavernContext === 'function' ? getSillyTavernContext() : null;
  if (typeof ctx?.eventSource?.on !== 'function') return false;

  const handleChatChanged = async () => {
    await loadBleachPhoneRadioVariableToRuntime({ clearOnMissing: true, render: false });
    if (currentAppKey === 'radio') {
      renderActiveRadioWindow();
    }
  };

  const chatChangedEvent = ctx?.eventTypes?.CHAT_CHANGED || 'chat_id_changed';
  ctx.eventSource.on(chatChangedEvent, handleChatChanged);
  if (ctx?.eventTypes?.CHAT_LOADED) {
    ctx.eventSource.on(ctx.eventTypes.CHAT_LOADED, handleChatChanged);
  }
  isBleachPhoneRadioVariableEventsBound = true;
  return true;
}

function getRadioSettingsEntries() {
  return [
    { key: 'api', label: 'API' },
    { key: 'preset', label: '广播预设' },
    { key: 'autoGenerate', label: '自动生成' }
  ];
}

function getRadioApiBindingProfiles() {
  const settings = normalizeAiSettings(aiSettings);
  return Array.isArray(settings.apiProfiles) ? settings.apiProfiles : [];
}

function getRadioPresetEntries() {
  const settings = normalizeAiSettings(aiSettings);
  return Array.isArray(settings.presetEntries) ? settings.presetEntries : [];
}

function getSelectedRadioPresetEntry(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  const targetPresetId = resolveSelectedAiPresetId(settings.selectedRadioPresetId || settings.selectedPresetId, settings.presetEntries);
  return getAiPresetEntryById(targetPresetId, settings) || settings.presetEntries?.[0] || null;
}

function syncRadioPresetSelection() {
  const presets = getRadioPresetEntries();
  currentRadioPresetId = resolveSelectedAiPresetId(normalizeAiSettings(aiSettings).selectedRadioPresetId || currentRadioPresetId || currentAiPresetId, presets);
  const currentIndex = presets.findIndex((preset) => preset.id === currentRadioPresetId);
  selectedRadioPresetIndex = presets.length
    ? Math.min(Math.max(selectedRadioPresetIndex >= 0 ? selectedRadioPresetIndex : (currentIndex >= 0 ? currentIndex : 0), 0), presets.length - 1)
    : -1;
}

function setRadioSelectedPreset(presetId) {
  const settings = normalizeAiSettings(aiSettings);
  const nextPresetId = resolveSelectedAiPresetId(presetId, settings.presetEntries);
  aiSettings = normalizeAiSettings({
    ...settings,
    selectedRadioPresetId: nextPresetId
  });
  currentRadioPresetId = aiSettings.selectedRadioPresetId;
  persistAiSettings(aiSettings);
  return currentRadioPresetId;
}

function syncRadioApiBindingSelection() {
  const profiles = getRadioApiBindingProfiles();
  const currentBindingId = getAiBindingProfileId('radio', aiSettings);
  const currentIndex = profiles.findIndex((profile) => profile.id === currentBindingId);
  selectedRadioApiProfileIndex = profiles.length
    ? Math.min(Math.max(selectedRadioApiProfileIndex >= 0 ? selectedRadioApiProfileIndex : (currentIndex >= 0 ? currentIndex : 0), 0), profiles.length - 1)
    : -1;
}

function getRadioSelectedBindingName() {
  return getAiBindingProfileName('radio', aiSettings) || '未设';
}

function getRadioAutoGenerateSummary(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  return getBleachPhoneAutoGenerateSummary({
    enabled: settings.radioAutoGenerateEnabled,
    trigger: settings.radioAutoGenerateTrigger,
    interval: settings.radioAutoGenerateInterval || '1'
  });
}

function getRadioAutoGenerateEntries(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  return getBleachPhoneAutoGenerateEntries({
    enabled: settings.radioAutoGenerateEnabled,
    trigger: settings.radioAutoGenerateTrigger,
    interval: settings.radioAutoGenerateInterval || '1'
  });
}

function updateRadioAutoGenerateSettings(patch = {}) {
  const settings = normalizeAiSettings(aiSettings);
  aiSettings = normalizeAiSettings({
    ...settings,
    ...patch
  });
  persistAiSettings(aiSettings);
  return aiSettings;
}

function openRadioSettings() {
  radioView = 'settings';
  selectedRadioSettingsIndex = Math.min(Math.max(selectedRadioSettingsIndex, 0), Math.max(getRadioSettingsEntries().length - 1, 0));
  renderAppWindow('radio');
}

function closeRadioSettings() {
  radioView = 'list';
  renderAppWindow('radio');
}

function openRadioApiBindingList() {
  radioView = 'apiBinding';
  syncRadioApiBindingSelection();
  renderAppWindow('radio');
}

function closeRadioApiBindingList() {
  radioView = 'settings';
  renderAppWindow('radio');
}

function openRadioPresetList() {
  radioView = 'preset';
  syncRadioPresetSelection();
  renderAppWindow('radio');
}

function closeRadioPresetList() {
  radioView = 'settings';
  renderAppWindow('radio');
}

function openRadioAutoGenerateList() {
  radioView = 'autoGenerate';
  selectedRadioAutoGenerateIndex = Math.min(Math.max(selectedRadioAutoGenerateIndex, 0), Math.max(getRadioAutoGenerateEntries().length - 1, 0));
  renderAppWindow('radio');
}

function closeRadioAutoGenerateList() {
  radioView = 'settings';
  renderAppWindow('radio');
}

function openRadioSettingsSelection() {
  const targetEntry = getRadioSettingsEntries()[selectedRadioSettingsIndex] || getRadioSettingsEntries()[0];
  if (!targetEntry) return;
  if (targetEntry.key === 'api') {
    openRadioApiBindingList();
    return;
  }
  if (targetEntry.key === 'preset') {
    openRadioPresetList();
    return;
  }
  openRadioAutoGenerateList();
}

function bindRadioApiProfileSelection() {
  const profiles = getRadioApiBindingProfiles();
  const targetProfile = profiles[selectedRadioApiProfileIndex] || null;
  if (!targetProfile) return false;
  if (!bindAiApiProfile('radio', targetProfile.id)) return false;
  closeRadioApiBindingList();
  return true;
}

function bindRadioPresetSelection() {
  const presets = getRadioPresetEntries();
  const targetPreset = presets[selectedRadioPresetIndex] || null;
  if (!targetPreset) return false;
  setRadioSelectedPreset(targetPreset.id);
  closeRadioPresetList();
  return true;
}

function confirmRadioAutoGenerateSelection() {
  const entries = getRadioAutoGenerateEntries();
  const targetEntry = entries[selectedRadioAutoGenerateIndex] || entries[0] || null;
  if (!targetEntry) return false;

  const settings = normalizeAiSettings(aiSettings);
  if (targetEntry.key === 'enabled') {
    updateRadioAutoGenerateSettings({ radioAutoGenerateEnabled: !settings.radioAutoGenerateEnabled });
    renderAppWindow('radio');
    return true;
  }
  if (targetEntry.key === 'trigger') {
    updateRadioAutoGenerateSettings({
      radioAutoGenerateTrigger: settings.radioAutoGenerateTrigger === 'user' ? 'assistant' : 'user'
    });
    renderAppWindow('radio');
    return true;
  }
  const currentInterval = Number.parseInt(String(settings.radioAutoGenerateInterval || '1'), 10);
  const safeCurrentInterval = Number.isFinite(currentInterval) && currentInterval > 0 ? currentInterval : 1;
  updateRadioAutoGenerateSettings({ radioAutoGenerateInterval: String(Math.min(99, safeCurrentInterval + 1)) });
  renderAppWindow('radio');
  return true;
}

function adjustRadioAutoGenerateInterval(step = 1) {
  const settings = normalizeAiSettings(aiSettings);
  const currentInterval = Number.parseInt(String(settings.radioAutoGenerateInterval || '1'), 10);
  const safeCurrentInterval = Number.isFinite(currentInterval) && currentInterval > 0 ? currentInterval : 1;
  const nextInterval = Math.min(99, Math.max(1, safeCurrentInterval + step));
  if (nextInterval === safeCurrentInterval) return false;
  updateRadioAutoGenerateSettings({ radioAutoGenerateInterval: String(nextInterval) });
  renderAppWindow('radio');
  return true;
}

function parseRadioAiResponse(rawText = '') {
  const sourceText = String(rawText || '').trim();
  if (!sourceText) {
    throw new Error('广播返回内容为空');
  }

  const taggedPayload = typeof extractTagContentWithTag === 'function'
    ? extractTagContentWithTag(sourceText, radioParserConfig.payloadTag)
    : '';
  if (!taggedPayload) {
    throw new Error(`未找到 <${radioParserConfig.payloadTag}> 标签`);
  }

  const payloadText = taggedPayload
    .replace(new RegExp(`^<${radioParserConfig.payloadTag}>|</${radioParserConfig.payloadTag}>$`, 'gi'), '')
    .trim();
  if (!payloadText) {
    throw new Error('radio_json 标签内容为空');
  }

  let parsedPayload;
  try {
    parsedPayload = JSON.parse(payloadText);
  } catch (error) {
    throw new Error(`radio_json 不是有效 JSON：${error?.message || '解析失败'}`);
  }

  if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
    throw new Error('radio_json 顶层必须是对象');
  }

  for (const key of radioParserConfig.requiredTopLevelKeys) {
    if (!(key in parsedPayload)) {
      throw new Error(`radio_json 缺少顶层字段：${key}`);
    }
  }

  if (!Array.isArray(parsedPayload.news)) {
    throw new Error('radio_json.news 必须是数组');
  }

  const news = parsedPayload.news.map((entry, index) => normalizeRadioNewsEntry(entry, index)).filter(Boolean);
  if (!news.length) {
    throw new Error(`广播列表为空，且每个条目必须包含字段：${radioParserConfig.requiredNewsKeys.join(', ')}`);
  }

  return {
    news,
    raw: sourceText,
    parsed: parsedPayload,
    candidate: payloadText
  };
}

function loadRadioData(entries, { render = true } = {}) {
  const normalizedEntries = Array.isArray(entries)
    ? entries.map((entry, index) => normalizeRadioNewsEntry(entry, index)).filter(Boolean)
    : [];
  if (!normalizedEntries.length) return false;
  radioNewsEntries = normalizedEntries;
  selectedRadioNewsIndex = Math.min(Math.max(selectedRadioNewsIndex, 0), radioNewsEntries.length - 1);
  radioListScrollTop = 0;
  radioDetailScrollTop = 0;
  if (render && currentAppKey === 'radio') {
    renderActiveRadioWindow();
  }
  return true;
}

function getRadioAutoGenerateRuntimeSettings(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  const interval = Number.parseInt(String(settings.radioAutoGenerateInterval || '1'), 10);
  return {
    enabled: Boolean(settings.radioAutoGenerateEnabled),
    trigger: String(settings.radioAutoGenerateTrigger || '').trim() === 'user' ? 'user' : 'assistant',
    interval: Number.isFinite(interval) && interval > 0 ? interval : 1
  };
}

function getRadioAutoGenerateChatMessages() {
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

function resetRadioAutoGenerateHandledKeys() {
  radioAutoGenerateLastHandledKeys = {
    assistant: '',
    user: ''
  };
}

function buildRadioAutoGenerateHandledKey(triggerType, chatId, floorCount, content = '') {
  return [
    String(chatId || '').trim(),
    String(triggerType || '').trim(),
    String(floorCount || 0),
    String(content || '').trim().slice(0, 240)
  ].join('::');
}

async function buildRadioGenerationMessages() {
  const presetEntry = getSelectedRadioPresetEntry(aiSettings);
  if (!presetEntry?.blocks?.length) {
    throw createSilentAiChatError('广播生成未配置广播预设');
  }
  const messages = await buildAiMessagesFromPreset(null, '', presetEntry, { pendingTargets: [] });
  const normalizedMessages = Array.isArray(messages)
    ? messages.filter((message) => String(message?.content || '').trim())
    : [];
  if (!normalizedMessages.length) {
    throw createSilentAiChatError('广播预设内容为空');
  }
  return normalizedMessages;
}

async function requestAiRadioReply() {
  const settings = getAiRuntimeSettings('radio', aiSettings);
  if (!settings.url) throw createSilentAiChatError('广播生成未绑定 API');
  if (!settings.key) throw createSilentAiChatError('广播生成未配置 API Key');
  if (!settings.model) throw createSilentAiChatError('广播生成未配置模型');

  const body = {
    model: settings.model,
    messages: await buildRadioGenerationMessages(),
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

async function generateRadioDataFromApi() {
  if (radioRequestStatus === 'loading') {
    return false;
  }

  const expectedChatId = getCurrentBleachPhoneRadioChatId();
  setRadioGenerationStatus('广播生成中…', 'loading');
  renderActiveRadioWindow();
  try {
    const replyText = await requestAiRadioReply();
    const parsedResult = parseRadioAiResponse(replyText);
    loadRadioData(parsedResult.news, { render: false });
    const variableSynced = await syncBleachPhoneRadioVariableFromParsedResult(parsedResult, { expectedChatId });
    if (!variableSynced) {
      console.warn('[广播变量] radio_json 未写入酒馆变量', { variableName: BLEACH_PHONE_RADIO_VARIABLE_KEY });
    }
    setRadioGenerationStatus(`广播已更新 · ${parsedResult.news.length} 条${variableSynced ? '' : ' · 变量未同步'}`, 'success', { autoClear: true });
    renderActiveRadioWindow();
    return true;
  } catch (error) {
    const message = error?.silent
      ? String(error.message || '').trim()
      : `生成失败：${String(error?.message || '未知错误').trim() || '未知错误'}`;
    setRadioGenerationStatus(message, 'error');
    console.error('[广播] 生成失败', error);
    renderActiveRadioWindow();
    return false;
  }
}

async function handleRadioAutoGenerateChatEvent(triggerType = 'assistant') {
  const normalizedTrigger = String(triggerType || '').trim() === 'user' ? 'user' : 'assistant';
  const runtimeSettings = getRadioAutoGenerateRuntimeSettings(aiSettings);
  if (!runtimeSettings.enabled || runtimeSettings.trigger !== normalizedTrigger) {
    return false;
  }

  const activeChatId = typeof getCurrentSTChatId === 'function'
    ? String(getCurrentSTChatId() || '').trim()
    : String(getCurrentBleachPhoneRadioChatId() || '').trim();
  if (!activeChatId) {
    return false;
  }

  const chatMessages = getRadioAutoGenerateChatMessages();
  if (!chatMessages.length) {
    return false;
  }

  const targetMessages = chatMessages.filter((message) => message.role === normalizedTrigger && String(message.content || '').trim());
  const floorCount = targetMessages.length;
  if (!floorCount || floorCount % runtimeSettings.interval !== 0) {
    return false;
  }

  const latestMessage = targetMessages[targetMessages.length - 1] || null;
  const handledKey = buildRadioAutoGenerateHandledKey(normalizedTrigger, activeChatId, floorCount, latestMessage?.content || '');
  if (radioAutoGenerateLastHandledKeys[normalizedTrigger] === handledKey) {
    return false;
  }
  radioAutoGenerateLastHandledKeys[normalizedTrigger] = handledKey;

  try {
    return await generateRadioDataFromApi();
  } catch (error) {
    console.error(`[广播自动生成] ${normalizedTrigger === 'user' ? '用户' : 'AI'}消息触发失败`, error);
    return false;
  }
}

function bindRadioAutoGenerateEvents() {
  if (isRadioAutoGenerateEventsBound) return true;
  const ctx = typeof getSillyTavernContext === 'function' ? getSillyTavernContext() : null;
  if (typeof ctx?.eventSource?.on !== 'function') return false;

  const messageReceivedEvent = ctx?.eventTypes?.MESSAGE_RECEIVED || 'message_received';
  const messageSentEvent = ctx?.eventTypes?.MESSAGE_SENT || 'message_sent';
  const chatChangedEvent = ctx?.eventTypes?.CHAT_CHANGED || 'chat_id_changed';
  const handleAssistantMessage = () => {
    Promise.resolve().then(() => handleRadioAutoGenerateChatEvent('assistant')).catch((error) => {
      console.error('[广播自动生成] AI消息事件处理失败', error);
    });
  };
  const handleUserMessage = () => {
    Promise.resolve().then(() => handleRadioAutoGenerateChatEvent('user')).catch((error) => {
      console.error('[广播自动生成] 用户消息事件处理失败', error);
    });
  };
  const handleChatChanged = () => {
    resetRadioAutoGenerateHandledKeys();
  };

  ctx.eventSource.on(messageReceivedEvent, handleAssistantMessage);
  ctx.eventSource.on(messageSentEvent, handleUserMessage);
  ctx.eventSource.on(chatChangedEvent, handleChatChanged);
  if (ctx?.eventTypes?.CHAT_LOADED) {
    ctx.eventSource.on(ctx.eventTypes.CHAT_LOADED, handleChatChanged);
  }
  isRadioAutoGenerateEventsBound = true;
  return true;
}

async function triggerRadioGenerationFromSoftkey() {
  return generateRadioDataFromApi();
}

function renderRadioSettingsView() {
  const entries = getRadioSettingsEntries();
  return `
    ${getRadioStatusMarkup()}
    <div class="contact-saved-list" id="radio-settings-list">
      ${entries.map((entry, index) => {
        const previewText = entry.key === 'api'
          ? getRadioSelectedBindingName()
          : (entry.key === 'preset'
            ? (getSelectedRadioPresetEntry(aiSettings)?.name || '未设')
            : getRadioAutoGenerateSummary(aiSettings));
        return `
          <div class="contact-saved-item radio-settings-item ${selectedRadioSettingsIndex === index ? 'is-selected' : ''}" data-radio-settings-index="${index}" data-radio-settings-key="${entry.key}">
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

function renderRadioApiBindingView() {
  const profiles = getRadioApiBindingProfiles();
  if (!profiles.length) {
    return `${getRadioStatusMarkup()}<div class="sms-settings-empty-view">暂无 API 配置</div>`;
  }
  const currentBindingId = getAiBindingProfileId('radio', aiSettings);
  return `
    ${getRadioStatusMarkup()}
    <div class="contact-saved-list" id="radio-api-profile-list">
      ${profiles.map((profile, index) => `
        <div class="contact-saved-item radio-api-profile-item ${selectedRadioApiProfileIndex === index ? 'is-selected' : ''}" data-radio-api-profile-index="${index}">
          <div class="contact-saved-main">
            <span class="contact-saved-name">${escapeHtml(profile.name || '默认')}</span>
            <span class="contact-saved-preview">${currentBindingId === profile.id ? '当前使用' : escapeHtml(getAiApiHostLabel(profile.url) || '未设端点')}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderRadioPresetView() {
  const presets = getRadioPresetEntries();
  if (!presets.length) {
    return `${getRadioStatusMarkup()}<div class="sms-settings-empty-view">暂无预设</div>`;
  }
  return `
    ${getRadioStatusMarkup()}
    <div class="contact-saved-list" id="radio-preset-list">
      ${presets.map((preset, index) => `
        <div class="contact-saved-item radio-preset-item ${selectedRadioPresetIndex === index ? 'is-selected' : ''}" data-radio-preset-index="${index}">
          <div class="contact-saved-main">
            <span class="contact-saved-name">${escapeHtml(preset.name || `预设 ${index + 1}`)}</span>
            <span class="contact-saved-preview">${currentRadioPresetId === preset.id ? '当前使用' : `${Array.isArray(preset.blocks) ? preset.blocks.length : 0} 个块`}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderRadioAutoGenerateView() {
  return renderBleachPhoneAutoGenerateSettingsView({
    statusMarkup: getRadioStatusMarkup(),
    listId: 'radio-auto-generate-list',
    itemClassName: 'radio-auto-generate-item',
    selectedIndex: selectedRadioAutoGenerateIndex,
    entries: getRadioAutoGenerateEntries(),
    escapeText: escapeHtml,
    dataIndexAttr: 'data-radio-auto-generate-index',
    dataKeyAttr: 'data-radio-auto-generate-key'
  });
}

function getSelectedRadioNews() {
  return radioNewsEntries[selectedRadioNewsIndex] || radioNewsEntries[0] || null;
}

function getRadioNewsEntriesCount() {
  return Array.isArray(radioNewsEntries) ? radioNewsEntries.length : 0;
}

function openRadioNewsDetail(index = selectedRadioNewsIndex) {
  if (!getRadioNewsEntriesCount()) return;
  selectedRadioNewsIndex = Math.min(Math.max(index, 0), getRadioNewsEntriesCount() - 1);
  radioView = 'detail';
  radioDetailScrollTop = 0;
  renderAppWindow('radio');
}

function closeRadioNewsDetail() {
  if (radioView !== 'detail') return;
  radioView = 'list';
  radioDetailScrollTop = 0;
  renderAppWindow('radio');
}

function moveRadioSelection(direction) {
  if (radioView === 'settings') {
    const entries = getRadioSettingsEntries();
    const settingsList = document.getElementById('radio-settings-list');
    if (settingsList) {
      radioSettingsListScrollTop = settingsList.scrollTop;
    }
    if (!entries.length) return;
    if (direction === 'up') {
      selectedRadioSettingsIndex = Math.max(0, selectedRadioSettingsIndex - 1);
      renderAppWindow('radio');
      return;
    }
    if (direction === 'down') {
      selectedRadioSettingsIndex = Math.min(entries.length - 1, selectedRadioSettingsIndex + 1);
      renderAppWindow('radio');
    }
    return;
  }

  if (radioView === 'apiBinding') {
    const profiles = getRadioApiBindingProfiles();
    const profileList = document.getElementById('radio-api-profile-list');
    if (profileList) {
      radioApiProfileListScrollTop = profileList.scrollTop;
    }
    if (!profiles.length) return;
    if (direction === 'up') {
      selectedRadioApiProfileIndex = Math.max(0, selectedRadioApiProfileIndex - 1);
      renderAppWindow('radio');
      return;
    }
    if (direction === 'down') {
      selectedRadioApiProfileIndex = Math.min(profiles.length - 1, selectedRadioApiProfileIndex + 1);
      renderAppWindow('radio');
    }
    return;
  }

  if (radioView === 'preset') {
    const presets = getRadioPresetEntries();
    const presetList = document.getElementById('radio-preset-list');
    if (presetList) {
      radioPresetListScrollTop = presetList.scrollTop;
    }
    if (!presets.length) return;
    if (direction === 'up') {
      selectedRadioPresetIndex = Math.max(0, selectedRadioPresetIndex - 1);
      renderAppWindow('radio');
      return;
    }
    if (direction === 'down') {
      selectedRadioPresetIndex = Math.min(presets.length - 1, selectedRadioPresetIndex + 1);
      renderAppWindow('radio');
    }
    return;
  }

  if (radioView === 'autoGenerate') {
    const entries = getRadioAutoGenerateEntries();
    const autoGenerateList = document.getElementById('radio-auto-generate-list');
    if (autoGenerateList) {
      radioAutoGenerateListScrollTop = autoGenerateList.scrollTop;
    }
    if (!entries.length) return;
    if (direction === 'left') {
      const targetEntry = entries[selectedRadioAutoGenerateIndex] || null;
      if (targetEntry?.key === 'interval') {
        adjustRadioAutoGenerateInterval(-1);
      }
      return;
    }
    if (direction === 'right') {
      const targetEntry = entries[selectedRadioAutoGenerateIndex] || null;
      if (targetEntry?.key === 'interval') {
        adjustRadioAutoGenerateInterval(1);
      }
      return;
    }
    if (direction === 'up') {
      selectedRadioAutoGenerateIndex = Math.max(0, selectedRadioAutoGenerateIndex - 1);
      renderAppWindow('radio');
      return;
    }
    if (direction === 'down') {
      selectedRadioAutoGenerateIndex = Math.min(entries.length - 1, selectedRadioAutoGenerateIndex + 1);
      renderAppWindow('radio');
    }
    return;
  }

  if (!getRadioNewsEntriesCount()) return;

  if (radioView === 'list') {
    const radioList = document.getElementById('radio-news-list');
    if (radioList) {
      radioListScrollTop = radioList.scrollTop;
    }
    if (direction === 'up') {
      selectedRadioNewsIndex = Math.max(0, selectedRadioNewsIndex - 1);
      renderAppWindow('radio');
      return;
    }
    if (direction === 'down') {
      selectedRadioNewsIndex = Math.min(getRadioNewsEntriesCount() - 1, selectedRadioNewsIndex + 1);
      renderAppWindow('radio');
    }
    return;
  }

  const detailBody = document.getElementById('radio-news-detail-body');
  if (!detailBody) return;

  const lineStep = 22;
  const pageStep = Math.max(72, detailBody.clientHeight - 36);
  if (direction === 'up') detailBody.scrollTop -= lineStep;
  if (direction === 'down') detailBody.scrollTop += lineStep;
  if (direction === 'left') detailBody.scrollTop -= pageStep;
  if (direction === 'right') detailBody.scrollTop += pageStep;
  radioDetailScrollTop = detailBody.scrollTop;
}

function renderRadioContent() {
  if (radioView === 'settings') {
    return renderRadioSettingsView();
  }
  if (radioView === 'apiBinding') {
    return renderRadioApiBindingView();
  }
  if (radioView === 'preset') {
    return renderRadioPresetView();
  }
  if (radioView === 'autoGenerate') {
    return renderRadioAutoGenerateView();
  }
  if (radioView === 'detail') {
    const entry = getSelectedRadioNews();
    if (!entry) {
      return '<div class="radio-news-detail-body">暂无新闻。</div>';
    }

    return `
      <div class="radio-news-detail">
        <div class="radio-news-detail-body" id="radio-news-detail-body">
          <div class="radio-news-detail-title">${escapeHtml(entry.title)}</div>
          <div class="radio-news-detail-meta">${escapeHtml(entry.source)} · ${escapeHtml(entry.time)}</div>
          ${entry.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
        </div>
      </div>
    `;
  }

  return `
    <div class="radio-news-list" id="radio-news-list">
      ${radioNewsEntries.map((entry, index) => `
        <div class="radio-news-item ${selectedRadioNewsIndex === index ? 'is-selected' : ''}" data-radio-news-index="${index}">
          <div class="radio-news-title">${escapeHtml(entry.title)}</div>
        </div>
      `).join('')}
    </div>
  `;
}


