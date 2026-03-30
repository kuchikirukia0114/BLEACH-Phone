// News / 新闻应用逻辑（从 main.js 渐进拆出）

const newsParserConfig = {
  payloadTag: 'news_json',
  requiredTopLevelKeys: ['news'],
  requiredNewsKeys: ['title', 'source', 'time', 'body'],
  optionalNewsKeys: ['id']
};

const BLEACH_PHONE_NEWS_VARIABLE_KEY = 'bleach_phone_news_json';
const NEWS_STATUS_AUTO_CLEAR_MS = 2400;

let isBleachPhoneNewsVariableEventsBound = false;
let isNewsAutoGenerateEventsBound = false;
let newsStatusAutoClearTimer = null;
let newsAutoGenerateLastHandledKeys = {
  assistant: '',
  user: ''
};

function getNewsStatusMarkup() {
  if (!newsGenerationStatusMessage) return '';
  const isLoading = newsRequestStatus === 'loading';
  return `<div class="items-status-banner${isLoading ? ' is-loading' : ''}">${escapeHtml(newsGenerationStatusMessage)}</div>`;
}

function clearNewsGenerationStatusAutoTimer() {
  if (!newsStatusAutoClearTimer) return;
  clearTimeout(newsStatusAutoClearTimer);
  newsStatusAutoClearTimer = null;
}

function setNewsGenerationStatus(message = '', status = newsRequestStatus, { autoClear = false } = {}) {
  clearNewsGenerationStatusAutoTimer();
  newsGenerationStatusMessage = String(message || '').trim();
  newsRequestStatus = status || 'idle';
  if (!newsGenerationStatusMessage || !autoClear) return;
  newsStatusAutoClearTimer = setTimeout(() => {
    newsStatusAutoClearTimer = null;
    newsGenerationStatusMessage = '';
    if (currentAppKey === 'news') {
      renderActiveNewsWindow();
    }
  }, NEWS_STATUS_AUTO_CLEAR_MS);
}

function getCurrentBleachPhoneNewsChatId() {
  const ctx = typeof getSillyTavernContext === 'function' ? getSillyTavernContext() : null;
  return typeof ctx?.getCurrentChatId === 'function'
    ? (ctx.getCurrentChatId() || '')
    : String(ctx?.chatId || '');
}

async function getBleachPhoneNewsVariableValue({ expectedChatId = '' } = {}) {
  const stApi = typeof getSTAPI === 'function' ? getSTAPI() : null;
  if (typeof stApi?.variables?.get !== 'function') return null;

  const currentChatId = getCurrentBleachPhoneNewsChatId();
  if (!currentChatId || (expectedChatId && currentChatId !== expectedChatId)) return null;

  try {
    const result = await stApi.variables.get({ name: BLEACH_PHONE_NEWS_VARIABLE_KEY, scope: 'local' });
    return result?.value ?? null;
  } catch (error) {
    console.warn('[新闻变量] news_json 读取失败', error);
    return null;
  }
}

async function syncBleachPhoneNewsVariableValue(rawValue, { expectedChatId = '' } = {}) {
  const stApi = typeof getSTAPI === 'function' ? getSTAPI() : null;
  if (typeof stApi?.variables?.set !== 'function') return false;

  const currentChatId = getCurrentBleachPhoneNewsChatId();
  if (!currentChatId || (expectedChatId && currentChatId !== expectedChatId)) {
    return false;
  }

  try {
    const result = await stApi.variables.set({
      name: BLEACH_PHONE_NEWS_VARIABLE_KEY,
      scope: 'local',
      value: typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue || {}, null, 2)
    });
    return result?.ok !== false;
  } catch (error) {
    console.warn('[新闻变量] news_json 同步失败', error);
    return false;
  }
}

async function syncBleachPhoneNewsVariableFromParsedResult(parsedResult, options = {}) {
  if (!parsedResult || typeof parsedResult !== 'object') return false;
  const payloadText = String(parsedResult.candidate || '').trim();
  const fallbackPayload = parsedResult.parsed && typeof parsedResult.parsed === 'object'
    ? JSON.stringify(parsedResult.parsed, null, 2)
    : '';
  const variableValue = payloadText || fallbackPayload;
  if (!variableValue) return false;
  return syncBleachPhoneNewsVariableValue(variableValue, options);
}

function renderActiveNewsWindow() {
  if (currentAppKey === 'news') {
    renderAppWindow('news');
  }
}

function normalizeNewsParagraphs(body) {
  if (Array.isArray(body)) {
    return body
      .map((paragraph) => String(paragraph || '').trim())
      .filter(Boolean);
  }
  const singleParagraph = String(body || '').trim();
  return singleParagraph ? [singleParagraph] : [];
}

function normalizeNewsEntry(entry, index = 0) {
  if (!entry || typeof entry !== 'object') return null;
  const title = String(entry.title || '').trim();
  const source = String(entry.source || '').trim();
  const time = String(entry.time || '').trim();
  const body = normalizeNewsParagraphs(entry.body);
  const id = String(entry.id || `news-${index + 1}`).trim() || `news-${index + 1}`;
  if (!title || !source || !time || !body.length) {
    return null;
  }
  return { id, title, source, time, body };
}

function clearNewsData({ render = true } = {}) {
  newsEntries = [];
  selectedNewsIndex = -1;
  newsListScrollTop = 0;
  newsDetailScrollTop = 0;
  if (newsView === 'detail') {
    newsView = 'list';
  }
  if (render && currentAppKey === 'news') {
    renderActiveNewsWindow();
  }
  return true;
}

async function loadBleachPhoneNewsVariableToRuntime({ render = true, clearOnMissing = false } = {}) {
  const rawValue = await getBleachPhoneNewsVariableValue();
  if (rawValue == null || String(rawValue).trim() === '') {
    if (clearOnMissing) {
      clearNewsData({ render });
      setNewsGenerationStatus('当前聊天暂无新闻数据', 'idle', { autoClear: true });
      return true;
    }
    return false;
  }
  try {
    const parsedResult = parseNewsAiResponse(String(rawValue));
    setNewsGenerationStatus('已从聊天变量恢复新闻', 'success', { autoClear: true });
    return loadNewsData(parsedResult.news, { render });
  } catch (error) {
    console.warn('[新闻变量] news_json 恢复失败', error);
    if (clearOnMissing) {
      clearNewsData({ render });
      setNewsGenerationStatus('当前聊天新闻数据无效', 'error');
      return true;
    }
    return false;
  }
}

function bindBleachPhoneNewsVariableEvents() {
  if (isBleachPhoneNewsVariableEventsBound) return true;
  const ctx = typeof getSillyTavernContext === 'function' ? getSillyTavernContext() : null;
  if (typeof ctx?.eventSource?.on !== 'function') return false;

  const handleChatChanged = async () => {
    await loadBleachPhoneNewsVariableToRuntime({ clearOnMissing: true, render: false });
    if (currentAppKey === 'news') {
      renderActiveNewsWindow();
    }
  };

  const chatChangedEvent = ctx?.eventTypes?.CHAT_CHANGED || 'chat_id_changed';
  ctx.eventSource.on(chatChangedEvent, handleChatChanged);
  if (ctx?.eventTypes?.CHAT_LOADED) {
    ctx.eventSource.on(ctx.eventTypes.CHAT_LOADED, handleChatChanged);
  }
  isBleachPhoneNewsVariableEventsBound = true;
  return true;
}

function getNewsSettingsEntries() {
  return [
    { key: 'api', label: 'API' },
    { key: 'preset', label: '新闻预设' },
    { key: 'autoGenerate', label: '自动生成' }
  ];
}

function getNewsApiBindingProfiles() {
  const settings = normalizeAiSettings(aiSettings);
  return Array.isArray(settings.apiProfiles) ? settings.apiProfiles : [];
}

function getNewsPresetEntries() {
  const settings = normalizeAiSettings(aiSettings);
  return Array.isArray(settings.presetEntries) ? settings.presetEntries : [];
}

function getSelectedNewsPresetEntry(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  const targetPresetId = resolveSelectedAiPresetId(settings.selectedNewsPresetId || settings.selectedPresetId, settings.presetEntries);
  return getAiPresetEntryById(targetPresetId, settings) || settings.presetEntries?.[0] || null;
}

function syncNewsPresetSelection() {
  const presets = getNewsPresetEntries();
  currentNewsPresetId = resolveSelectedAiPresetId(normalizeAiSettings(aiSettings).selectedNewsPresetId || currentNewsPresetId || currentAiPresetId, presets);
  const currentIndex = presets.findIndex((preset) => preset.id === currentNewsPresetId);
  selectedNewsPresetIndex = presets.length
    ? Math.min(Math.max(selectedNewsPresetIndex >= 0 ? selectedNewsPresetIndex : (currentIndex >= 0 ? currentIndex : 0), 0), presets.length - 1)
    : -1;
}

function setNewsSelectedPreset(presetId) {
  const settings = normalizeAiSettings(aiSettings);
  const nextPresetId = resolveSelectedAiPresetId(presetId, settings.presetEntries);
  aiSettings = normalizeAiSettings({
    ...settings,
    selectedNewsPresetId: nextPresetId
  });
  currentNewsPresetId = aiSettings.selectedNewsPresetId;
  persistAiSettings(aiSettings);
  return currentNewsPresetId;
}

function syncNewsApiBindingSelection() {
  const profiles = getNewsApiBindingProfiles();
  const currentBindingId = getAiBindingProfileId('news', aiSettings);
  const currentIndex = profiles.findIndex((profile) => profile.id === currentBindingId);
  selectedNewsApiProfileIndex = profiles.length
    ? Math.min(Math.max(selectedNewsApiProfileIndex >= 0 ? selectedNewsApiProfileIndex : (currentIndex >= 0 ? currentIndex : 0), 0), profiles.length - 1)
    : -1;
}

function getNewsSelectedBindingName() {
  return getAiBindingProfileName('news', aiSettings) || '未设';
}

function getNewsAutoGenerateSummary(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  return getBleachPhoneAutoGenerateSummary({
    enabled: settings.newsAutoGenerateEnabled,
    trigger: settings.newsAutoGenerateTrigger,
    interval: settings.newsAutoGenerateInterval || '1'
  });
}

function getNewsAutoGenerateEntries(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  return getBleachPhoneAutoGenerateEntries({
    enabled: settings.newsAutoGenerateEnabled,
    trigger: settings.newsAutoGenerateTrigger,
    interval: settings.newsAutoGenerateInterval || '1'
  });
}

function updateNewsAutoGenerateSettings(patch = {}) {
  const settings = normalizeAiSettings(aiSettings);
  aiSettings = normalizeAiSettings({
    ...settings,
    ...patch
  });
  persistAiSettings(aiSettings);
  return aiSettings;
}

function openNewsSettings() {
  newsView = 'settings';
  selectedNewsSettingsIndex = Math.min(Math.max(selectedNewsSettingsIndex, 0), Math.max(getNewsSettingsEntries().length - 1, 0));
  renderAppWindow('news');
}

function closeNewsSettings() {
  newsView = 'list';
  renderAppWindow('news');
}

function openNewsApiBindingList() {
  newsView = 'apiBinding';
  syncNewsApiBindingSelection();
  renderAppWindow('news');
}

function closeNewsApiBindingList() {
  newsView = 'settings';
  renderAppWindow('news');
}

function openNewsPresetList() {
  newsView = 'preset';
  syncNewsPresetSelection();
  renderAppWindow('news');
}

function closeNewsPresetList() {
  newsView = 'settings';
  renderAppWindow('news');
}

function openNewsAutoGenerateList() {
  newsView = 'autoGenerate';
  selectedNewsAutoGenerateIndex = Math.min(Math.max(selectedNewsAutoGenerateIndex, 0), Math.max(getNewsAutoGenerateEntries().length - 1, 0));
  renderAppWindow('news');
}

function closeNewsAutoGenerateList() {
  newsView = 'settings';
  renderAppWindow('news');
}

function openNewsSettingsSelection() {
  const targetEntry = getNewsSettingsEntries()[selectedNewsSettingsIndex] || getNewsSettingsEntries()[0];
  if (!targetEntry) return;
  if (targetEntry.key === 'api') {
    openNewsApiBindingList();
    return;
  }
  if (targetEntry.key === 'preset') {
    openNewsPresetList();
    return;
  }
  openNewsAutoGenerateList();
}

function bindNewsApiProfileSelection() {
  const profiles = getNewsApiBindingProfiles();
  const targetProfile = profiles[selectedNewsApiProfileIndex] || null;
  if (!targetProfile) return false;
  if (!bindAiApiProfile('news', targetProfile.id)) return false;
  closeNewsApiBindingList();
  return true;
}

function bindNewsPresetSelection() {
  const presets = getNewsPresetEntries();
  const targetPreset = presets[selectedNewsPresetIndex] || null;
  if (!targetPreset) return false;
  setNewsSelectedPreset(targetPreset.id);
  closeNewsPresetList();
  return true;
}

function confirmNewsAutoGenerateSelection() {
  const entries = getNewsAutoGenerateEntries();
  const targetEntry = entries[selectedNewsAutoGenerateIndex] || entries[0] || null;
  if (!targetEntry) return false;

  const settings = normalizeAiSettings(aiSettings);
  if (targetEntry.key === 'enabled') {
    updateNewsAutoGenerateSettings({ newsAutoGenerateEnabled: !settings.newsAutoGenerateEnabled });
    renderAppWindow('news');
    return true;
  }
  if (targetEntry.key === 'trigger') {
    updateNewsAutoGenerateSettings({
      newsAutoGenerateTrigger: settings.newsAutoGenerateTrigger === 'user' ? 'assistant' : 'user'
    });
    renderAppWindow('news');
    return true;
  }
  const currentInterval = Number.parseInt(String(settings.newsAutoGenerateInterval || '1'), 10);
  const safeCurrentInterval = Number.isFinite(currentInterval) && currentInterval > 0 ? currentInterval : 1;
  updateNewsAutoGenerateSettings({ newsAutoGenerateInterval: String(Math.min(99, safeCurrentInterval + 1)) });
  renderAppWindow('news');
  return true;
}

function adjustNewsAutoGenerateInterval(step = 1) {
  const settings = normalizeAiSettings(aiSettings);
  const currentInterval = Number.parseInt(String(settings.newsAutoGenerateInterval || '1'), 10);
  const safeCurrentInterval = Number.isFinite(currentInterval) && currentInterval > 0 ? currentInterval : 1;
  const nextInterval = Math.min(99, Math.max(1, safeCurrentInterval + step));
  if (nextInterval === safeCurrentInterval) return false;
  updateNewsAutoGenerateSettings({ newsAutoGenerateInterval: String(nextInterval) });
  renderAppWindow('news');
  return true;
}


function parseNewsAiResponse(rawText = '') {
  const sourceText = String(rawText || '').trim();
  if (!sourceText) {
    throw new Error('新闻返回内容为空');
  }

  const taggedPayload = typeof extractTagContentWithTag === 'function'
    ? extractTagContentWithTag(sourceText, newsParserConfig.payloadTag)
    : '';
  if (!taggedPayload) {
    throw new Error(`未找到 <${newsParserConfig.payloadTag}> 标签`);
  }

  const payloadText = taggedPayload
    .replace(new RegExp(`^<${escapeRegExp(newsParserConfig.payloadTag)}>|</${escapeRegExp(newsParserConfig.payloadTag)}>$`, 'gi'), '')
    .trim();
  if (!payloadText) {
    throw new Error('news_json 标签内容为空');
  }

  let parsedPayload;
  try {
    parsedPayload = JSON.parse(payloadText);
  } catch (error) {
    throw new Error(`news_json 不是有效 JSON：${error?.message || '解析失败'}`);
  }

  if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
    throw new Error('news_json 顶层必须是对象');
  }

  for (const key of newsParserConfig.requiredTopLevelKeys) {
    if (!(key in parsedPayload)) {
      throw new Error(`news_json 缺少顶层字段：${key}`);
    }
  }

  if (!Array.isArray(parsedPayload.news)) {
    throw new Error('news_json.news 必须是数组');
  }

  const news = parsedPayload.news.map((entry, index) => normalizeNewsEntry(entry, index)).filter(Boolean);
  if (!news.length) {
    throw new Error(`新闻列表为空，且每个条目必须包含字段：${newsParserConfig.requiredNewsKeys.join(', ')}`);
  }

  return {
    news,
    raw: sourceText,
    parsed: parsedPayload,
    candidate: payloadText
  };
}

function loadNewsData(entries, { render = true } = {}) {
  const normalizedEntries = Array.isArray(entries)
    ? entries.map((entry, index) => normalizeNewsEntry(entry, index)).filter(Boolean)
    : [];
  if (!normalizedEntries.length) return false;
  newsEntries = normalizedEntries;
  selectedNewsIndex = Math.min(Math.max(selectedNewsIndex, 0), newsEntries.length - 1);
  newsListScrollTop = 0;
  newsDetailScrollTop = 0;
  if (render && currentAppKey === 'news') {
    renderActiveNewsWindow();
  }
  return true;
}

function getNewsAutoGenerateRuntimeSettings(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  const interval = Number.parseInt(String(settings.newsAutoGenerateInterval || '1'), 10);
  return {
    enabled: Boolean(settings.newsAutoGenerateEnabled),
    trigger: String(settings.newsAutoGenerateTrigger || '').trim() === 'user' ? 'user' : 'assistant',
    interval: Number.isFinite(interval) && interval > 0 ? interval : 1
  };
}

function getNewsAutoGenerateChatMessages() {
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

function resetNewsAutoGenerateHandledKeys() {
  newsAutoGenerateLastHandledKeys = {
    assistant: '',
    user: ''
  };
}

function buildNewsAutoGenerateHandledKey(triggerType, chatId, floorCount, content = '') {
  return [
    String(chatId || '').trim(),
    String(triggerType || '').trim(),
    String(floorCount || 0),
    String(content || '').trim().slice(0, 240)
  ].join('::');
}

async function buildNewsGenerationMessages() {
  const presetEntry = getSelectedNewsPresetEntry(aiSettings);
  if (!presetEntry?.blocks?.length) {
    throw createSilentAiChatError('新闻生成未配置新闻预设');
  }
  const messages = await buildAiMessagesFromPreset(null, '', presetEntry, { pendingTargets: [] });
  const normalizedMessages = Array.isArray(messages)
    ? messages.filter((message) => String(message?.content || '').trim())
    : [];
  if (!normalizedMessages.length) {
    throw createSilentAiChatError('新闻预设内容为空');
  }
  return normalizedMessages;
}

async function requestAiNewsReply() {
  const settings = getAiRuntimeSettings('news', aiSettings);
  if (!settings.url) throw createSilentAiChatError('新闻生成未绑定 API');
  if (!settings.key) throw createSilentAiChatError('新闻生成未配置 API Key');
  if (!settings.model) throw createSilentAiChatError('新闻生成未配置模型');

  const body = {
    model: settings.model,
    messages: await buildNewsGenerationMessages(),
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

async function generateNewsDataFromApi() {
  if (newsRequestStatus === 'loading') {
    return false;
  }

  const expectedChatId = getCurrentBleachPhoneNewsChatId();
  setNewsGenerationStatus('新闻生成中…', 'loading');
  renderActiveNewsWindow();
  let aiReplyText = '';
  try {
    aiReplyText = await requestAiNewsReply();
    const parsedResult = parseNewsAiResponse(aiReplyText);
    loadNewsData(parsedResult.news, { render: false });
    const variableSynced = await syncBleachPhoneNewsVariableFromParsedResult(parsedResult, { expectedChatId });
    if (!variableSynced) {
      console.warn('[新闻变量] news_json 未写入酒馆变量', { variableName: BLEACH_PHONE_NEWS_VARIABLE_KEY });
    }
    setNewsGenerationStatus(`新闻已更新 · ${parsedResult.news.length} 条${variableSynced ? '' : ' · 变量未同步'}`, 'success', { autoClear: true });
    renderActiveNewsWindow();
    return true;
  } catch (error) {
    const message = error?.silent
      ? String(error.message || '').trim()
      : `生成失败：${String(error?.message || '未知错误').trim() || '未知错误'}`;
    setNewsGenerationStatus(message, 'error');
    console.error('[新闻] 生成失败', error);
    if (aiReplyText) {
      console.error('[新闻] AI 原始回复内容：\n' + aiReplyText);
    }
    renderActiveNewsWindow();
    return false;
  }
}

async function handleNewsAutoGenerateChatEvent(triggerType = 'assistant') {
  const normalizedTrigger = String(triggerType || '').trim() === 'user' ? 'user' : 'assistant';
  const runtimeSettings = getNewsAutoGenerateRuntimeSettings(aiSettings);
  if (!runtimeSettings.enabled || runtimeSettings.trigger !== normalizedTrigger) {
    return false;
  }

  const activeChatId = typeof getCurrentSTChatId === 'function'
    ? String(getCurrentSTChatId() || '').trim()
    : String(getCurrentBleachPhoneNewsChatId() || '').trim();
  if (!activeChatId) {
    return false;
  }

  const chatMessages = getNewsAutoGenerateChatMessages();
  if (!chatMessages.length) {
    return false;
  }

  const targetMessages = chatMessages.filter((message) => message.role === normalizedTrigger && String(message.content || '').trim());
  const floorCount = targetMessages.length;
  if (!floorCount || floorCount % runtimeSettings.interval !== 0) {
    return false;
  }

  const latestMessage = targetMessages[targetMessages.length - 1] || null;
  const handledKey = buildNewsAutoGenerateHandledKey(normalizedTrigger, activeChatId, floorCount, latestMessage?.content || '');
  if (newsAutoGenerateLastHandledKeys[normalizedTrigger] === handledKey) {
    return false;
  }
  newsAutoGenerateLastHandledKeys[normalizedTrigger] = handledKey;

  try {
    return await generateNewsDataFromApi();
  } catch (error) {
    console.error(`[新闻自动生成] ${normalizedTrigger === 'user' ? '用户' : 'AI'}消息触发失败`, error);
    return false;
  }
}

function bindNewsAutoGenerateEvents() {
  if (isNewsAutoGenerateEventsBound) return true;
  const ctx = typeof getSillyTavernContext === 'function' ? getSillyTavernContext() : null;
  if (typeof ctx?.eventSource?.on !== 'function') return false;

  const messageReceivedEvent = ctx?.eventTypes?.MESSAGE_RECEIVED || 'message_received';
  const messageSentEvent = ctx?.eventTypes?.MESSAGE_SENT || 'message_sent';
  const chatChangedEvent = ctx?.eventTypes?.CHAT_CHANGED || 'chat_id_changed';
  const handleAssistantMessage = () => {
    Promise.resolve().then(() => handleNewsAutoGenerateChatEvent('assistant')).catch((error) => {
      console.error('[新闻自动生成] AI消息事件处理失败', error);
    });
  };
  const handleUserMessage = () => {
    Promise.resolve().then(() => handleNewsAutoGenerateChatEvent('user')).catch((error) => {
      console.error('[新闻自动生成] 用户消息事件处理失败', error);
    });
  };
  const handleChatChanged = () => {
    resetNewsAutoGenerateHandledKeys();
  };

  ctx.eventSource.on(messageReceivedEvent, handleAssistantMessage);
  ctx.eventSource.on(messageSentEvent, handleUserMessage);
  ctx.eventSource.on(chatChangedEvent, handleChatChanged);
  if (ctx?.eventTypes?.CHAT_LOADED) {
    ctx.eventSource.on(ctx.eventTypes.CHAT_LOADED, handleChatChanged);
  }
  isNewsAutoGenerateEventsBound = true;
  return true;
}

async function triggerNewsGenerationFromSoftkey() {
  return generateNewsDataFromApi();
}

function renderNewsSettingsView() {
  const entries = getNewsSettingsEntries();
  return `
    ${getNewsStatusMarkup()}
    <div class="contact-saved-list" id="news-settings-list">
      ${entries.map((entry, index) => {
        const previewText = entry.key === 'api'
          ? getNewsSelectedBindingName()
          : (entry.key === 'preset'
            ? (getSelectedNewsPresetEntry(aiSettings)?.name || '未设')
            : getNewsAutoGenerateSummary(aiSettings));
        return `
          <div class="contact-saved-item news-settings-item ${selectedNewsSettingsIndex === index ? 'is-selected' : ''}" data-news-settings-index="${index}" data-news-settings-key="${entry.key}">
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

function renderNewsApiBindingView() {
  const profiles = getNewsApiBindingProfiles();
  if (!profiles.length) {
    return `${getNewsStatusMarkup()}<div class="sms-settings-empty-view">暂无 API 配置</div>`;
  }
  const currentBindingId = getAiBindingProfileId('news', aiSettings);
  return `
    ${getNewsStatusMarkup()}
    <div class="contact-saved-list" id="news-api-profile-list">
      ${profiles.map((profile, index) => `
        <div class="contact-saved-item news-api-profile-item ${selectedNewsApiProfileIndex === index ? 'is-selected' : ''}" data-news-api-profile-index="${index}">
          <div class="contact-saved-main">
            <span class="contact-saved-name">${escapeHtml(profile.name || '默认')}</span>
            <span class="contact-saved-preview">${currentBindingId === profile.id ? '当前使用' : escapeHtml(getAiApiHostLabel(profile.url) || '未设端点')}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderNewsPresetView() {
  const presets = getNewsPresetEntries();
  if (!presets.length) {
    return `${getNewsStatusMarkup()}<div class="sms-settings-empty-view">暂无预设</div>`;
  }
  return `
    ${getNewsStatusMarkup()}
    <div class="contact-saved-list" id="news-preset-list">
      ${presets.map((preset, index) => `
        <div class="contact-saved-item news-preset-item ${selectedNewsPresetIndex === index ? 'is-selected' : ''}" data-news-preset-index="${index}">
          <div class="contact-saved-main">
            <span class="contact-saved-name">${escapeHtml(preset.name || `预设 ${index + 1}`)}</span>
            <span class="contact-saved-preview">${currentNewsPresetId === preset.id ? '当前使用' : `${Array.isArray(preset.blocks) ? preset.blocks.length : 0} 个块`}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderNewsAutoGenerateView() {
  return renderBleachPhoneAutoGenerateSettingsView({
    statusMarkup: getNewsStatusMarkup(),
    listId: 'news-auto-generate-list',
    itemClassName: 'news-auto-generate-item',
    selectedIndex: selectedNewsAutoGenerateIndex,
    entries: getNewsAutoGenerateEntries(),
    escapeText: escapeHtml,
    dataIndexAttr: 'data-news-auto-generate-index',
    dataKeyAttr: 'data-news-auto-generate-key'
  });
}

function getSelectedNews() {
  return newsEntries[selectedNewsIndex] || newsEntries[0] || null;
}

function getNewsEntriesCount() {
  return Array.isArray(newsEntries) ? newsEntries.length : 0;
}

function openNewsDetail(index = selectedNewsIndex) {
  if (!getNewsEntriesCount()) return;
  selectedNewsIndex = Math.min(Math.max(index, 0), getNewsEntriesCount() - 1);
  newsView = 'detail';
  newsDetailScrollTop = 0;
  renderAppWindow('news');
}

function closeNewsDetail() {
  if (newsView !== 'detail') return;
  newsView = 'list';
  newsDetailScrollTop = 0;
  renderAppWindow('news');
}

function moveNewsSelection(direction) {
  if (newsView === 'settings') {
    const entries = getNewsSettingsEntries();
    const settingsList = document.getElementById('news-settings-list');
    if (settingsList) {
      newsSettingsListScrollTop = settingsList.scrollTop;
    }
    if (!entries.length) return;
    if (direction === 'up') {
      selectedNewsSettingsIndex = Math.max(0, selectedNewsSettingsIndex - 1);
      renderAppWindow('news');
      return;
    }
    if (direction === 'down') {
      selectedNewsSettingsIndex = Math.min(entries.length - 1, selectedNewsSettingsIndex + 1);
      renderAppWindow('news');
    }
    return;
  }

  if (newsView === 'apiBinding') {
    const profiles = getNewsApiBindingProfiles();
    const profileList = document.getElementById('news-api-profile-list');
    if (profileList) {
      newsApiProfileListScrollTop = profileList.scrollTop;
    }
    if (!profiles.length) return;
    if (direction === 'up') {
      selectedNewsApiProfileIndex = Math.max(0, selectedNewsApiProfileIndex - 1);
      renderAppWindow('news');
      return;
    }
    if (direction === 'down') {
      selectedNewsApiProfileIndex = Math.min(profiles.length - 1, selectedNewsApiProfileIndex + 1);
      renderAppWindow('news');
    }
    return;
  }

  if (newsView === 'preset') {
    const presets = getNewsPresetEntries();
    const presetList = document.getElementById('news-preset-list');
    if (presetList) {
      newsPresetListScrollTop = presetList.scrollTop;
    }
    if (!presets.length) return;
    if (direction === 'up') {
      selectedNewsPresetIndex = Math.max(0, selectedNewsPresetIndex - 1);
      renderAppWindow('news');
      return;
    }
    if (direction === 'down') {
      selectedNewsPresetIndex = Math.min(presets.length - 1, selectedNewsPresetIndex + 1);
      renderAppWindow('news');
    }
    return;
  }

  if (newsView === 'autoGenerate') {
    const entries = getNewsAutoGenerateEntries();
    const autoGenerateList = document.getElementById('news-auto-generate-list');
    if (autoGenerateList) {
      newsAutoGenerateListScrollTop = autoGenerateList.scrollTop;
    }
    if (!entries.length) return;
    if (direction === 'left') {
      const targetEntry = entries[selectedNewsAutoGenerateIndex] || null;
      if (targetEntry?.key === 'interval') {
        adjustNewsAutoGenerateInterval(-1);
      }
      return;
    }
    if (direction === 'right') {
      const targetEntry = entries[selectedNewsAutoGenerateIndex] || null;
      if (targetEntry?.key === 'interval') {
        adjustNewsAutoGenerateInterval(1);
      }
      return;
    }
    if (direction === 'up') {
      selectedNewsAutoGenerateIndex = Math.max(0, selectedNewsAutoGenerateIndex - 1);
      renderAppWindow('news');
      return;
    }
    if (direction === 'down') {
      selectedNewsAutoGenerateIndex = Math.min(entries.length - 1, selectedNewsAutoGenerateIndex + 1);
      renderAppWindow('news');
    }
    return;
  }

  if (!getNewsEntriesCount()) return;

  if (newsView === 'list') {
    const newsList = document.getElementById('news-list');
    if (newsList) {
      newsListScrollTop = newsList.scrollTop;
    }
    if (direction === 'up') {
      selectedNewsIndex = Math.max(0, selectedNewsIndex - 1);
      renderAppWindow('news');
      return;
    }
    if (direction === 'down') {
      selectedNewsIndex = Math.min(getNewsEntriesCount() - 1, selectedNewsIndex + 1);
      renderAppWindow('news');
    }
    return;
  }

  const detailBody = document.getElementById('news-detail-body');
  if (!detailBody) return;

  const lineStep = 22;
  const pageStep = Math.max(72, detailBody.clientHeight - 36);
  if (direction === 'up') detailBody.scrollTop -= lineStep;
  if (direction === 'down') detailBody.scrollTop += lineStep;
  if (direction === 'left') detailBody.scrollTop -= pageStep;
  if (direction === 'right') detailBody.scrollTop += pageStep;
  newsDetailScrollTop = detailBody.scrollTop;
}

function renderNewsContent() {
  if (newsView === 'settings') {
    return renderNewsSettingsView();
  }
  if (newsView === 'apiBinding') {
    return renderNewsApiBindingView();
  }
  if (newsView === 'preset') {
    return renderNewsPresetView();
  }
  if (newsView === 'autoGenerate') {
    return renderNewsAutoGenerateView();
  }
  if (newsView === 'detail') {
    const entry = getSelectedNews();
    if (!entry) {
      return '<div class="news-detail-body">暂无新闻。</div>';
    }

    return `
      <div class="news-detail">
        <div class="news-detail-body" id="news-detail-body">
          <div class="news-detail-title">${escapeHtml(entry.title)}</div>
          <div class="news-detail-meta">${escapeHtml(entry.source)} · ${escapeHtml(entry.time)}</div>
          ${entry.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
        </div>
      </div>
    `;
  }

  return `
    <div class="news-list" id="news-list">
      ${newsEntries.map((entry, index) => `
        <div class="news-item ${selectedNewsIndex === index ? 'is-selected' : ''}" data-news-index="${index}">
          <div class="news-title">${escapeHtml(entry.title)}</div>
        </div>
      `).join('')}
    </div>
  `;
}


