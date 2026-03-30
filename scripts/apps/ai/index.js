// AI 应用逻辑（从 main.js 渐进拆出）

function escapeRegExp(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractTagContentWithTag(text, tagName) {
  const normalizedTag = String(tagName || '').trim();
  if (!normalizedTag) return '';
  const regex = new RegExp(`(<${escapeRegExp(normalizedTag)}>[\\s\\S]*?<\/${escapeRegExp(normalizedTag)}>)`, 'gi');
  const matches = [];
  let match;
  while ((match = regex.exec(String(text || ''))) !== null) {
    matches.push(String(match[1] || '').trim());
  }
  return matches.join('\n\n');
}

function getSTAPI() {
  try { if (window.ST_API) return window.ST_API; } catch (error) {}
  try { if (window.parent && window.parent !== window && window.parent.ST_API) return window.parent.ST_API; } catch (error) {}
  try { if (window.top && window.top !== window && window.top.ST_API) return window.top.ST_API; } catch (error) {}
  return null;
}

function getSillyTavernContext() {
  try { if (window.SillyTavern?.getContext) return window.SillyTavern.getContext(); } catch (error) {}
  try { if (window.parent && window.parent !== window && window.parent.SillyTavern?.getContext) return window.parent.SillyTavern.getContext(); } catch (error) {}
  try { if (window.top && window.top !== window && window.top.SillyTavern?.getContext) return window.top.SillyTavern.getContext(); } catch (error) {}
  return null;
}

const BLEACH_PHONE_CHATS_VARIABLE_NAME = 'bleach_phone_chats';
const BLEACH_PHONE_CHATS_SUMMARIZED_VARIABLE_NAME = 'bleach_phone_chats_summarized';
const BLEACH_PHONE_MAP_VARIABLE_NAME = 'bleach_phone_map_json';
const BLEACH_PHONE_ITEMS_VARIABLE_NAME = 'bleach_phone_items_json';
const BLEACH_PHONE_NEWS_VARIABLE_NAME = 'bleach_phone_news_json';
const BLEACH_PHONE_NEWS_INFO_SCOPE = 'news_json';
const BLEACH_PHONE_CHARS_VARIABLE_NAME = 'bleach_phone_chars_json';
const BLEACH_PHONE_PRESET_WEATHER_VARIABLE_NAME = 'bleach_phone_weather_json';
const BLEACH_PHONE_PRESET_DATETIME_VARIABLE_NAME = 'bleach_phone_datetime';
const BLEACH_PHONE_MAP_INFO_SOURCE_ID = '__map_info__';
const BLEACH_PHONE_ITEMS_INFO_SOURCE_ID = '__items_current_block__';
const BLEACH_PHONE_NEWS_INFO_SOURCE_ID = '__news_current_block__';
const BLEACH_PHONE_CHARS_INFO_SOURCE_ID = '__chars_current_block__';
const BLEACH_PHONE_DATETIME_INFO_SOURCE_ID = '__datetime_current_block__';
const BLEACH_PHONE_WEATHER_INFO_SOURCE_ID = '__weather_current_block__';
const BLEACH_PHONE_ST_USER_INFO_SOURCE_ID = '__st_user_info__';
let isBleachPhoneChatsVariableEventsBound = false;
let isBleachPhoneChatGenerationEventsBound = false;
let aiReplyChatScheduledTimers = [];
let hasLoggedAiWorldBookCompatDiagnostics = false;

function isAiPresetWorkspaceActive() {
  return currentAppKey === 'settings'
    || (currentAppKey === 'data' && typeof isAiPresetDataCategory === 'function' && isAiPresetDataCategory(currentDataCategoryKey));
}

function renderActiveAiPresetWorkspace() {
  if (!isAiPresetWorkspaceActive()) return;
  renderAppWindow(currentAppKey === 'data' ? 'data' : 'settings');
}

function getCurrentSTChatId() {
  const ctx = getSillyTavernContext();
  return typeof ctx?.getCurrentChatId === 'function' ? ctx.getCurrentChatId() : ctx?.chatId;
}

function clearAiReplyChatScheduledTimers() {
  aiReplyChatScheduledTimers.forEach((timerId) => clearTimeout(timerId));
  aiReplyChatScheduledTimers = [];
}

function getAiContactExternalId(contactOrId) {
  const contact = typeof contactOrId === 'object' && contactOrId
    ? contactOrId
    : aiContacts.find((entry) => entry.id === contactOrId) || null;
  if (!contact) return 0;
  const externalId = Number.parseInt(String(contact.externalId ?? ''), 10);
  if (Number.isFinite(externalId) && externalId > 0) return externalId;
  const fallbackIndex = aiContacts.findIndex((entry) => entry.id === contact.id);
  return fallbackIndex >= 0 ? fallbackIndex + 1 : 0;
}

function getAiContactByExternalId(externalId) {
  const targetExternalId = Number.parseInt(String(externalId ?? ''), 10);
  if (!Number.isFinite(targetExternalId) || targetExternalId <= 0) return null;
  return aiContacts.find((contact) => getAiContactExternalId(contact) === targetExternalId) || null;
}

function getAiContactExportLabel(contact, fallbackIndex = 0) {
  return {
    contact_id: getAiContactExternalId(contact) || fallbackIndex + 1,
    contact_name: contact?.name || `联系人 ${fallbackIndex + 1}`
  };
}

function getAiChatMessageExportTime(message, fallbackTime = Date.now()) {
  return Number.isFinite(Number(message?.time)) ? Number(message.time) : fallbackTime;
}

function getAiChatMessageExportTimeLabel(message, fallbackTime = getAiChatMessageExportTime(message)) {
  const rawTimeLabel = typeof message?.time_label === 'string'
    ? message.time_label.trim()
    : (typeof message?.timeLabel === 'string' ? message.timeLabel.trim() : '');
  return rawTimeLabel || (typeof formatDateTimeLabel === 'function' ? formatDateTimeLabel(fallbackTime) : '');
}

function getBleachPhoneChatEntryContent(message, fallbackKey = '') {
  if (!message) return '';
  if (typeof message === 'string') return message.trim();
  if (typeof message?.text === 'string' && message.text.trim()) return message.text.trim();
  if (typeof message?.content === 'string' && message.content.trim()) return message.content.trim();
  if (fallbackKey && typeof message?.[fallbackKey] === 'string' && message[fallbackKey].trim()) return message[fallbackKey].trim();
  return '';
}

function buildBleachPhoneChatsNormalizedValue(historyMap = aiChatHistoryMap, { includePending = true } = {}) {
  const contacts = aiContacts.map((contact, index) => {
    const messages = Array.isArray(historyMap?.[contact.id]) ? historyMap[contact.id] : [];
    if (!messages.length) return null;
    const chat = [];
    const pendingUserMessages = [];
    messages.forEach((message) => {
      const content = String(message?.content || '').trim();
      if (!content) return;
      const messageTime = getAiChatMessageExportTime(message);
      const messageTimeLabel = getAiChatMessageExportTimeLabel(message, messageTime);
      if (message?.role === 'user') {
        if (message?.pending) {
          if (!includePending) return;
          pendingUserMessages.push({
            user: content,
            text: content,
            time: messageTime,
            time_label: messageTimeLabel
          });
          return;
        }
        chat.push({
          role: 'user',
          user: content,
          text: content,
          time: messageTime,
          time_label: messageTimeLabel
        });
        return;
      }
      chat.push({
        role: 'assistant',
        contact: content,
        text: content,
        time: messageTime,
        time_label: messageTimeLabel
      });
    });
    if (!chat.length && !pendingUserMessages.length) return null;
    return {
      contact_id: getAiContactExternalId(contact) || index + 1,
      contact_name: contact.name || `联系人 ${index + 1}`,
      chat,
      pending_user_messages: pendingUserMessages
    };
  }).filter(Boolean);
  return {
    version: 3,
    updated_at: Date.now(),
    contacts
  };
}

function stringifyBleachPhoneChatsNormalizedValue(normalizedValue = {}) {
  return JSON.stringify({
    version: Number.isFinite(normalizedValue?.version) ? normalizedValue.version : 3,
    updated_at: Number.isFinite(normalizedValue?.updated_at) ? normalizedValue.updated_at : Date.now(),
    contacts: Array.isArray(normalizedValue?.contacts) ? normalizedValue.contacts : []
  }, null, 2);
}

function buildBleachPhoneMinimalMessageValue(message, { fallbackRole = 'assistant', includeRole = true, fallbackTime = Date.now() } = {}) {
  const normalizedFallbackRole = fallbackRole === 'user' ? 'user' : 'assistant';
  const normalizedRole = String(message?.role || '').trim().toLowerCase();
  const inferredRole = normalizedRole === 'user'
    ? 'user'
    : ((normalizedRole === 'assistant' || normalizedRole === 'contact')
      ? 'assistant'
      : ((typeof message?.user === 'string' && message.user.trim()) ? 'user' : ((typeof message?.contact === 'string' && message.contact.trim()) ? 'assistant' : normalizedFallbackRole)));
  const content = getBleachPhoneChatEntryContent(message, inferredRole === 'user' ? 'user' : 'contact');
  if (!content) return null;
  const time = getAiChatMessageExportTime(message, fallbackTime);
  const timeLabel = getAiChatMessageExportTimeLabel(message, time);
  return {
    ...(includeRole ? { role: inferredRole } : {}),
    text: content,
    time,
    time_label: timeLabel
  };
}

function buildBleachPhoneMinimalContactValue(entry, { includePending = true } = {}) {
  const baseTime = Date.now();
  const chat = Array.isArray(entry?.chat)
    ? entry.chat.map((message, index) => buildBleachPhoneMinimalMessageValue(message, {
      fallbackRole: 'assistant',
      includeRole: true,
      fallbackTime: baseTime + index
    })).filter(Boolean)
    : [];
  const pendingUserMessages = includePending && Array.isArray(entry?.pending_user_messages)
    ? entry.pending_user_messages.map((message, index) => buildBleachPhoneMinimalMessageValue(message, {
      fallbackRole: 'user',
      includeRole: false,
      fallbackTime: baseTime + chat.length + index
    })).filter(Boolean)
    : [];
  if (!chat.length && !pendingUserMessages.length) {
    return null;
  }
  return {
    ...(entry?.contact_id ? { contact_id: entry.contact_id } : {}),
    ...(entry?.contact_name ? { contact_name: entry.contact_name } : {}),
    ...(chat.length ? { chat } : {}),
    ...(includePending && pendingUserMessages.length ? { pending_user_messages: pendingUserMessages } : {})
  };
}

function buildBleachPhoneMinimalChatsValue(rawValue, { includePending = true } = {}) {
  const normalizedValue = normalizeBleachPhoneChatsVariableValue(rawValue);
  return {
    contacts: normalizedValue.contacts.map((entry) => buildBleachPhoneMinimalContactValue(entry, { includePending })).filter(Boolean)
  };
}

function stringifyBleachPhoneMinimalChatsValue(rawValue, options = {}) {
  return JSON.stringify(buildBleachPhoneMinimalChatsValue(rawValue, options), null, 2);
}

function buildBleachPhoneChatsMinimalValue(rawValue) {
  return buildBleachPhoneMinimalChatsValue(rawValue, { includePending: true });
}

function stringifyBleachPhoneChatsMinimalValue(rawValue) {
  return stringifyBleachPhoneMinimalChatsValue(rawValue, { includePending: true });
}

function buildBleachPhoneSummarizedChatsMinimalValue(rawValue) {
  return buildBleachPhoneMinimalChatsValue(rawValue, { includePending: false });
}

function stringifyBleachPhoneSummarizedChatsMinimalValue(rawValue) {
  return stringifyBleachPhoneMinimalChatsValue(rawValue, { includePending: false });
}

function buildBleachPhoneChatsVariableValue(historyMap = aiChatHistoryMap, options = {}) {
  return stringifyBleachPhoneChatsMinimalValue(buildBleachPhoneChatsNormalizedValue(historyMap, options));
}

function normalizeBleachPhoneChatsVariableValue(rawValue) {
  let parsedValue = rawValue;
  if (typeof rawValue === 'string') {
    try {
      parsedValue = rawValue.trim() ? JSON.parse(rawValue) : {};
    } catch (error) {
      parsedValue = {};
    }
  }
  const contacts = Array.isArray(parsedValue?.contacts) ? parsedValue.contacts : [];
  return {
    version: Number.isFinite(parsedValue?.version) ? parsedValue.version : 3,
    updated_at: Number.isFinite(parsedValue?.updated_at) ? parsedValue.updated_at : Date.now(),
    contacts: contacts.map((entry, index) => ({
      contact_id: Number.isFinite(Number(entry?.contact_id)) ? Math.max(1, Number(entry.contact_id)) : 0,
      contact_name: typeof entry?.contact_name === 'string' ? entry.contact_name.trim() : '',
      contact_index: Number.isFinite(entry?.contact_index) ? entry.contact_index : index,
      chat: Array.isArray(entry?.chat) ? entry.chat : [],
      pending_user_messages: Array.isArray(entry?.pending_user_messages) ? entry.pending_user_messages : []
    })).filter((entry) => entry.contact_id || entry.contact_name || entry.chat.length || entry.pending_user_messages.length)
  };
}

function getBleachPhoneChatsContactMergeKey(entry, fallbackIndex = 0) {
  const contactId = Number.isFinite(Number(entry?.contact_id)) ? Math.max(1, Number(entry.contact_id)) : 0;
  const contactName = String(entry?.contact_name || '').trim();
  if (contactId > 0) return `id:${contactId}`;
  if (contactName) return `name:${contactName}`;
  return `index:${fallbackIndex}`;
}

function mergeBleachPhoneChatsNormalizedValues(baseValue, appendedValue) {
  const mergedBase = normalizeBleachPhoneChatsVariableValue(baseValue);
  const mergedAppend = normalizeBleachPhoneChatsVariableValue(appendedValue);
  const mergedEntries = [];
  const mergedEntryMap = new Map();

  const appendEntries = (entries = []) => {
    entries.forEach((entry, index) => {
      const mergeKey = getBleachPhoneChatsContactMergeKey(entry, index + mergedEntries.length);
      const existingEntry = mergedEntryMap.get(mergeKey);
      if (!existingEntry) {
        const nextEntry = {
          contact_id: Number.isFinite(Number(entry?.contact_id)) ? Math.max(1, Number(entry.contact_id)) : 0,
          contact_name: typeof entry?.contact_name === 'string' ? entry.contact_name.trim() : '',
          contact_index: Number.isFinite(entry?.contact_index) ? entry.contact_index : mergedEntries.length,
          chat: Array.isArray(entry?.chat) ? [...entry.chat] : [],
          pending_user_messages: Array.isArray(entry?.pending_user_messages) ? [...entry.pending_user_messages] : []
        };
        mergedEntries.push(nextEntry);
        mergedEntryMap.set(mergeKey, nextEntry);
        return;
      }
      existingEntry.contact_id = existingEntry.contact_id || (Number.isFinite(Number(entry?.contact_id)) ? Math.max(1, Number(entry.contact_id)) : 0);
      existingEntry.contact_name = existingEntry.contact_name || (typeof entry?.contact_name === 'string' ? entry.contact_name.trim() : '');
      if (Array.isArray(entry?.chat) && entry.chat.length) {
        existingEntry.chat.push(...entry.chat);
      }
      if (Array.isArray(entry?.pending_user_messages) && entry.pending_user_messages.length) {
        existingEntry.pending_user_messages.push(...entry.pending_user_messages);
      }
    });
  };

  appendEntries(mergedBase.contacts);
  appendEntries(mergedAppend.contacts);

  return {
    version: Math.max(mergedBase.version || 3, mergedAppend.version || 3, 3),
    updated_at: Date.now(),
    contacts: mergedEntries.filter((entry) => entry.contact_id || entry.contact_name || entry.chat.length || entry.pending_user_messages.length)
  };
}

function buildAiChatRuntimeStateFromBleachPhoneValue(rawValue) {
  const normalizedValue = normalizeBleachPhoneChatsVariableValue(rawValue);
  const nextContacts = [...aiContacts];
  const contactsByExternalId = new Map(nextContacts.map((contact) => [getAiContactExternalId(contact), contact]));
  const contactsByName = new Map(nextContacts.map((contact) => [String(contact?.name || '').trim(), contact]));
  const nextHistoryMap = {};

  normalizedValue.contacts.forEach((entry, index) => {
    const contactName = entry.contact_name || `联系人 ${index + 1}`;
    let contact = entry.contact_id ? contactsByExternalId.get(entry.contact_id) || null : null;
    if (!contact && contactName) {
      contact = contactsByName.get(contactName) || null;
    }
    if (!contact) {
      contact = {
        id: createAiContactId(index),
        externalId: entry.contact_id || getNextAiContactExternalId(nextContacts),
        name: contactName,
        prompt: '',
        createdAt: Date.now()
      };
      nextContacts.push(contact);
      contactsByExternalId.set(getAiContactExternalId(contact), contact);
      contactsByName.set(contact.name, contact);
    } else {
      const targetIndex = nextContacts.findIndex((item) => item.id === contact.id);
      if (targetIndex >= 0) {
        nextContacts[targetIndex] = {
          ...nextContacts[targetIndex],
          externalId: entry.contact_id || nextContacts[targetIndex].externalId,
          name: contactName || nextContacts[targetIndex].name
        };
        contact = nextContacts[targetIndex];
        contactsByExternalId.set(getAiContactExternalId(contact), contact);
        contactsByName.set(contact.name, contact);
      }
    }

    const chatMessages = entry.chat
      .map((message, messageIndex) => {
        if (!message || typeof message !== 'object') return null;
        const fallbackTime = Date.now() + messageIndex;
        const normalizedTime = getAiChatMessageExportTime(message, fallbackTime);
        const normalizedTimeLabel = getAiChatMessageExportTimeLabel(message, normalizedTime);
        const normalizedRole = String(message?.role || '').trim().toLowerCase();
        const userContent = typeof message?.user === 'string' && message.user.trim()
          ? message.user.trim()
          : (normalizedRole === 'user' ? getBleachPhoneChatEntryContent(message) : '');
        if (normalizedRole === 'user' || userContent) {
          if (!userContent) return null;
          return {
            id: `${contact.id}_chat_user_${messageIndex}_${Math.random().toString(36).slice(2, 8)}`,
            role: 'user',
            content: userContent,
            time: normalizedTime,
            timeLabel: normalizedTimeLabel,
            pending: false
          };
        }
        const contactContent = typeof message?.contact === 'string' && message.contact.trim()
          ? message.contact.trim()
          : ((normalizedRole === 'assistant' || normalizedRole === 'contact') ? getBleachPhoneChatEntryContent(message) : '');
        if (!contactContent) return null;
        return {
          id: `${contact.id}_chat_contact_${messageIndex}_${Math.random().toString(36).slice(2, 8)}`,
          role: 'assistant',
          content: contactContent,
          time: normalizedTime,
          timeLabel: normalizedTimeLabel,
          pending: false
        };
      })
      .filter(Boolean);

    const pendingMessages = entry.pending_user_messages
      .map((content, pendingIndex) => {
        const normalizedContent = getBleachPhoneChatEntryContent(content, 'user');
        if (!normalizedContent) return null;
        const fallbackTime = Date.now() + chatMessages.length + pendingIndex;
        const normalizedTime = getAiChatMessageExportTime(content, fallbackTime);
        const normalizedTimeLabel = getAiChatMessageExportTimeLabel(content, normalizedTime);
        return {
          id: `${contact.id}_pending_user_${pendingIndex}_${Math.random().toString(36).slice(2, 8)}`,
          role: 'user',
          content: normalizedContent,
          time: normalizedTime,
          timeLabel: normalizedTimeLabel,
          pending: true
        };
      })
      .filter(Boolean);

    nextHistoryMap[contact.id] = [...chatMessages, ...pendingMessages].slice(-80);
  });

  return {
    contacts: normalizeAiContacts(nextContacts),
    historyMap: normalizeAiChatHistoryMap(nextHistoryMap)
  };
}

function applyBleachPhoneChatsVariableValue(rawValue, { render = true, persist = true } = {}) {
  const nextRuntimeState = buildAiChatRuntimeStateFromBleachPhoneValue(rawValue);
  aiContacts = nextRuntimeState.contacts;
  aiChatHistoryMap = nextRuntimeState.historyMap;
  if (persist) {
    saveAiContacts();
    saveAiChatHistoryMap();
  }
  selectedAiContactIndex = aiContacts.length ? Math.min(Math.max(selectedAiContactIndex, 0), aiContacts.length - 1) : -1;
  currentAiContactIndex = currentAiContactIndex >= 0 && aiContacts.length
    ? Math.min(currentAiContactIndex, aiContacts.length - 1)
    : -1;
  if (contactView === 'chat' && currentAiContactIndex < 0) {
    contactView = 'list';
  }
  if (render && (currentAppKey === 'settings' || currentAppKey === 'contact' || currentAppKey === 'sms')) {
    renderAppWindow(currentAppKey);
  }
  return true;
}

async function loadBleachPhoneChatsVariableToRuntime({ render = true, persist = true, clearOnMissing = true } = {}) {
  const stApi = getSTAPI();
  if (typeof stApi?.variables?.get !== 'function') return false;
  const ctx = getSillyTavernContext();
  const currentChatId = typeof ctx?.getCurrentChatId === 'function' ? ctx.getCurrentChatId() : ctx?.chatId;
  if (!currentChatId) return false;
  try {
    const result = await stApi.variables.get({ name: BLEACH_PHONE_CHATS_VARIABLE_NAME, scope: 'local' });
    const rawValue = result?.value;
    if (rawValue === undefined || rawValue === null || rawValue === '') {
      if (clearOnMissing) {
        aiChatHistoryMap = {};
        if (persist) saveAiChatHistoryMap();
        if (render && (currentAppKey === 'settings' || currentAppKey === 'contact' || currentAppKey === 'sms')) {
          renderAppWindow(currentAppKey);
        }
      }
      return false;
    }
    return applyBleachPhoneChatsVariableValue(rawValue, { render, persist });
  } catch (error) {
    console.warn('[短信变量] 读取聊天变量失败', error);
    return false;
  }
}

async function loadBleachPhoneSummarizedChatsVariableToRuntime({ persistContacts = true } = {}) {
  const rawValue = await getBleachPhoneSummarizedChatsVariableValue();
  if (rawValue === undefined || rawValue === null || rawValue === '') {
    aiSummarizedChatHistoryMap = {};
    return false;
  }
  const nextRuntimeState = buildAiChatRuntimeStateFromBleachPhoneValue(rawValue);
  if (persistContacts) {
    aiContacts = nextRuntimeState.contacts;
    saveAiContacts();
  } else {
    aiContacts = nextRuntimeState.contacts;
  }
  aiSummarizedChatHistoryMap = nextRuntimeState.historyMap;
  return true;
}

function bindBleachPhoneChatsVariableEvents() {
  if (isBleachPhoneChatsVariableEventsBound) return true;
  const ctx = getSillyTavernContext();
  if (typeof ctx?.eventSource?.on !== 'function') return false;
  const handleChatChanged = async () => {
    isStGenerationRunning = false;
    await loadBleachPhoneChatsVariableToRuntime({ clearOnMissing: true, render: false, persist: true });
    await loadBleachPhoneSummarizedChatsVariableToRuntime({ persistContacts: true });
    if (currentAppKey === 'settings' || currentAppKey === 'contact' || currentAppKey === 'sms') {
      renderAppWindow(currentAppKey);
    }
  };
  const chatChangedEvent = ctx?.eventTypes?.CHAT_CHANGED || 'chat_id_changed';
  ctx.eventSource.on(chatChangedEvent, handleChatChanged);
  if (ctx?.eventTypes?.CHAT_LOADED) {
    ctx.eventSource.on(ctx.eventTypes.CHAT_LOADED, handleChatChanged);
  }
  isBleachPhoneChatsVariableEventsBound = true;
  return true;
}

function bindBleachPhoneChatGenerationEvents() {
  if (isBleachPhoneChatGenerationEventsBound) return true;
  const ctx = getSillyTavernContext();
  if (typeof ctx?.eventSource?.on !== 'function') return false;
  const startedEvent = ctx?.eventTypes?.GENERATION_STARTED || 'generation_started';
  const stoppedEvent = ctx?.eventTypes?.GENERATION_STOPPED || 'generation_stopped';
  const endedEvent = ctx?.eventTypes?.GENERATION_ENDED || 'generation_ended';
  const handleStarted = () => {
    isStGenerationRunning = true;
  };
  const handleStopped = () => {
    isStGenerationRunning = false;
  };
  ctx.eventSource.on(startedEvent, handleStarted);
  ctx.eventSource.on(stoppedEvent, handleStopped);
  ctx.eventSource.on(endedEvent, handleStopped);
  isBleachPhoneChatGenerationEventsBound = true;
  return true;
}

async function syncBleachPhoneChatsVariableValue(rawValue, { expectedChatId = '' } = {}) {
  const stApi = getSTAPI();
  if (typeof stApi?.variables?.set !== 'function') return false;
  const ctx = getSillyTavernContext();
  const currentChatId = typeof ctx?.getCurrentChatId === 'function' ? ctx.getCurrentChatId() : ctx?.chatId;
  if (!currentChatId || (expectedChatId && currentChatId !== expectedChatId)) return false;
  try {
    const result = await stApi.variables.set({
      name: BLEACH_PHONE_CHATS_VARIABLE_NAME,
      scope: 'local',
      value: typeof rawValue === 'string'
        ? rawValue
        : (rawValue ? stringifyBleachPhoneChatsMinimalValue(rawValue) : buildBleachPhoneChatsVariableValue())
    });
    return result?.ok !== false;
  } catch (error) {
    console.warn('[短信变量] 未总结聊天变量同步失败', error);
    return false;
  }
}

async function syncBleachPhoneChatsVariable() {
  return syncBleachPhoneChatsVariableValue(buildBleachPhoneChatsVariableValue());
}

async function getBleachPhoneSummarizedChatsVariableValue({ expectedChatId = '' } = {}) {
  const stApi = getSTAPI();
  if (typeof stApi?.variables?.get !== 'function') return null;
  const ctx = getSillyTavernContext();
  const currentChatId = typeof ctx?.getCurrentChatId === 'function' ? ctx.getCurrentChatId() : ctx?.chatId;
  if (!currentChatId || (expectedChatId && currentChatId !== expectedChatId)) return null;
  try {
    const result = await stApi.variables.get({ name: BLEACH_PHONE_CHATS_SUMMARIZED_VARIABLE_NAME, scope: 'local' });
    return result?.value ?? null;
  } catch (error) {
    console.warn('[短信变量] 已总结聊天变量读取失败', error);
    return null;
  }
}

async function syncBleachPhoneSummarizedChatsVariable(rawValue, { expectedChatId = '' } = {}) {
  const stApi = getSTAPI();
  if (typeof stApi?.variables?.set !== 'function') return false;
  const ctx = getSillyTavernContext();
  const currentChatId = typeof ctx?.getCurrentChatId === 'function' ? ctx.getCurrentChatId() : ctx?.chatId;
  if (!currentChatId || (expectedChatId && currentChatId !== expectedChatId)) return false;
  try {
    const result = await stApi.variables.set({
      name: BLEACH_PHONE_CHATS_SUMMARIZED_VARIABLE_NAME,
      scope: 'local',
      value: typeof rawValue === 'string' ? rawValue : stringifyBleachPhoneSummarizedChatsMinimalValue(rawValue)
    });
    return result?.ok !== false;
  } catch (error) {
    console.warn('[短信变量] 已总结聊天变量同步失败', error);
    return false;
  }
}

function buildBleachPhoneSummarizedChatsRuntimeValue(historyMap = aiSummarizedChatHistoryMap) {
  return buildBleachPhoneChatsNormalizedValue(historyMap, { includePending: false });
}

async function syncBleachPhoneSummarizedChatsRuntimeVariable({ expectedChatId = '' } = {}) {
  return syncBleachPhoneSummarizedChatsVariable(buildBleachPhoneSummarizedChatsRuntimeValue(), { expectedChatId });
}

function getTextFromSTMessage(message) {
  if (!message) return '';
  if (typeof message.content === 'string') return message.content.trim();
  if (Array.isArray(message.content)) {
    return message.content.map((part) => typeof part === 'string' ? part : part?.text || '').join('').trim();
  }
  if (Array.isArray(message.parts)) {
    return message.parts.map((part) => part?.text || '').join('').trim();
  }
  if (typeof message.mes === 'string') return message.mes.trim();
  return '';
}

function extractTaggedInnerContents(text, tagName) {
  const normalizedTag = String(tagName || '').trim();
  if (!normalizedTag) return [];
  const regex = new RegExp(`<${escapeRegExp(normalizedTag)}>([\\s\\S]*?)<\/${escapeRegExp(normalizedTag)}>`, 'gi');
  const matches = [];
  let match;
  while ((match = regex.exec(String(text || ''))) !== null) {
    matches.push(String(match[1] || '').trim());
  }
  return matches;
}

function unwrapXmlCdataText(text) {
  const trimmedText = String(text || '').trim();
  const cdataMatch = trimmedText.match(/^<!\[CDATA\[([\s\S]*?)\]\]>$/i);
  return cdataMatch ? String(cdataMatch[1] || '').trim() : trimmedText;
}

function normalizeAiReplyChatPayload(rawPayload) {
  let parsedPayload = rawPayload;
  if (typeof rawPayload === 'string') {
    const jsonText = unwrapXmlCdataText(rawPayload);
    if (!jsonText) return [];
    try {
      parsedPayload = JSON.parse(jsonText);
    } catch (error) {
      console.warn('[短信解析] <chat> JSON 解析失败', error);
      return [];
    }
  }
  const contactEntries = Array.isArray(parsedPayload)
    ? parsedPayload
    : (Array.isArray(parsedPayload?.contacts) ? parsedPayload.contacts : []);
  return contactEntries.map((entry, index) => ({
    contact_id: Number.isFinite(Number(entry?.contact_id)) ? Math.max(1, Number(entry.contact_id)) : 0,
    contact_id_raw: typeof entry?.contact_id === 'string' ? entry.contact_id.trim() : '',
    contact_name: typeof entry?.contact_name === 'string' ? entry.contact_name.trim() : '',
    messages: Array.isArray(entry?.messages)
      ? entry.messages.map((message) => ({
        text: typeof message?.text === 'string'
          ? message.text.trim()
          : (typeof message?.content === 'string' ? message.content.trim() : ''),
        delay: Number.isFinite(Number(message?.delay)) ? Math.max(0, Number(message.delay)) : 0
      })).filter((message) => message.text)
      : [],
    entry_index: index
  })).filter((entry) => entry.messages.length);
}

function stripTaggedContents(text, tagName) {
  const normalizedTag = String(tagName || '').trim();
  if (!normalizedTag) return String(text || '').trim();
  const regex = new RegExp(`<${escapeRegExp(normalizedTag)}>[\\s\\S]*?<\/${escapeRegExp(normalizedTag)}>`, 'gi');
  return String(text || '').replace(regex, '').trim();
}

function findAiContactForReplyChatEntry(entry, fallbackContact = null) {
  const contactExternalId = Number.parseInt(String(entry?.contact_id ?? ''), 10);
  const contactIdRaw = String(entry?.contact_id_raw || '').trim();
  const contactName = String(entry?.contact_name || '').trim();
  if (Number.isFinite(contactExternalId) && contactExternalId > 0) {
    const matchedByExternalId = getAiContactByExternalId(contactExternalId);
    if (matchedByExternalId) return matchedByExternalId;
  }
  if (contactIdRaw && !/^\d+$/.test(contactIdRaw)) {
    const matchedById = aiContacts.find((contact) => contact.id === contactIdRaw) || null;
    if (matchedById) return matchedById;
  }
  if (contactName) {
    const matchedByName = aiContacts.find((contact) => String(contact?.name || '').trim() === contactName) || null;
    if (matchedByName) return matchedByName;
  }
  return fallbackContact || null;
}

function ensureAiContactForReplyChatEntry(entry, fallbackContact = null) {
  const existingContact = findAiContactForReplyChatEntry(entry, fallbackContact);
  if (existingContact) return existingContact;
  const nextContact = {
    id: !/^\d+$/.test(String(entry?.contact_id_raw || '').trim()) && String(entry?.contact_id_raw || '').trim()
      ? String(entry.contact_id_raw).trim()
      : createAiContactId(aiContacts.length),
    externalId: Number.isFinite(Number(entry?.contact_id)) && Number(entry.contact_id) > 0
      ? Number(entry.contact_id)
      : getNextAiContactExternalId(aiContacts),
    name: String(entry?.contact_name || '').trim() || `联系人 ${aiContacts.length + 1}`,
    prompt: '',
    createdAt: Date.now()
  };
  aiContacts = normalizeAiContacts([...aiContacts, nextContact]);
  saveAiContacts();
  return aiContacts.find((contact) => contact.id === nextContact.id)
    || aiContacts.find((contact) => getAiContactExternalId(contact) === nextContact.externalId)
    || aiContacts.find((contact) => contact.name === nextContact.name)
    || null;
}

function appendAiReplyChatContactMessage(entry, message, { chatId, fallbackContact = null } = {}) {
  const activeChatId = getCurrentSTChatId();
  if (chatId && activeChatId && chatId !== activeChatId) return false;
  const contact = ensureAiContactForReplyChatEntry(entry, fallbackContact);
  if (!contact) return false;
  const appendedMessage = appendAiChatMessage(contact.id, createAiChatMessage('assistant', message.text));
  if (!appendedMessage) return false;
  if (contactView === 'chat' && getCurrentAiContact()?.id === contact.id) {
    aiChatShouldScrollBottom = true;
  }
  if (currentAppKey === 'contact' || currentAppKey === 'sms') {
    renderActiveAiAppWindow();
  }
  return true;
}

function applyAiReplyChatPayload(entries, { chatId, fallbackContact = null } = {}) {
  let appendedCount = 0;
  entries.forEach((entry) => {
    entry.messages.forEach((message) => {
      const delayMs = Math.max(0, Number(message?.delay) || 0) * 1000;
      if (delayMs <= 0) {
        if (appendAiReplyChatContactMessage(entry, message, { chatId, fallbackContact })) {
          appendedCount += 1;
        }
        return;
      }
      const timerId = setTimeout(() => {
        aiReplyChatScheduledTimers = aiReplyChatScheduledTimers.filter((activeTimerId) => activeTimerId !== timerId);
        appendAiReplyChatContactMessage(entry, message, { chatId, fallbackContact });
      }, delayMs);
      aiReplyChatScheduledTimers.push(timerId);
      appendedCount += 1;
    });
  });
  return appendedCount;
}

function parseAiReplyChatResponse(replyText, fallbackContact = null, { chatId } = {}) {
  const normalizedReplyText = String(replyText || '').trim();
  if (!normalizedReplyText) {
    return { plainText: '', appendedCount: 0, hasChatPayload: false };
  }
  const chatPayloadTexts = extractTaggedInnerContents(normalizedReplyText, 'chat');
  if (!chatPayloadTexts.length) {
    return { plainText: normalizedReplyText, appendedCount: 0, hasChatPayload: false };
  }
  const payloadEntries = chatPayloadTexts.flatMap((payloadText) => normalizeAiReplyChatPayload(payloadText));
  return {
    plainText: stripTaggedContents(normalizedReplyText, 'chat'),
    appendedCount: payloadEntries.length
      ? applyAiReplyChatPayload(payloadEntries, { chatId, fallbackContact })
      : 0,
    hasChatPayload: true
  };
}

function normalizeSTMainChatMessages(rawMessages) {
  if (!Array.isArray(rawMessages)) return [];
  return rawMessages.map((message) => {
    const rawRole = String(message?.role || '').trim().toLowerCase();
    const isUserMessage = rawRole === 'user' || message?.is_user === true;
    const isAssistantMessage = rawRole === 'assistant' || rawRole === 'model' || message?.is_user === false;
    const role = isUserMessage ? 'user' : (isAssistantMessage ? 'assistant' : '');
    return {
      role,
      content: getTextFromSTMessage(message)
    };
  }).filter((message) => (message.role === 'user' || message.role === 'assistant') && message.content);
}

async function getSTMainChatMessages() {
  const stApi = getSTAPI();
  if (stApi?.chatHistory?.list) {
    try {
      const result = await stApi.chatHistory.list({ format: 'openai' });
      return normalizeSTMainChatMessages(result?.messages || []);
    } catch (error) {
      console.warn('[主聊天] ST_API.chatHistory.list 读取失败，改用 SillyTavern.getContext().chat', error);
    }
  }
  const ctx = getSillyTavernContext();
  return normalizeSTMainChatMessages(ctx?.chat || []);
}

function getAiMainChatSummary() {
  const isDefault = pendingAiMainChatContextN === '10'
    && pendingAiMainChatUserN === ''
    && !pendingAiMainChatXmlRules.some((rule) => String(rule?.tag || '').trim() || String(rule?.n || '').trim());
  return isDefault ? '默认' : '已设';
}

async function buildAiMainChatHistoryMessages(settingsSource = aiSettings) {
  const historyMessages = await getSTMainChatMessages();
  if (!historyMessages.length) return [];
  const settings = normalizeAiSettings(settingsSource);
  const validRules = normalizeAiMainChatRules(settings.mainChatXmlRules).filter((rule) => rule.tag);
  const userNStr = settings.mainChatUserN;
  const assistantMessages = historyMessages.map((message, index) => ({ index, message })).filter((item) => item.message.role !== 'user');
  const userMessages = historyMessages.map((message, index) => ({ index, message })).filter((item) => item.message.role === 'user');
  const assistantInRange = {};
  const userInRange = {};
  if (validRules.length) {
    for (const rule of validRules) {
      const nStr = String(rule.n || '').trim();
      if (nStr === '0') continue;
      let startIndex = 0;
      let endIndex = assistantMessages.length;
      if (nStr !== '') {
        const n = parseInt(nStr, 10) || 0;
        if (n <= 0) continue;
        if (rule.mode === 'exclude') {
          startIndex = 0;
          endIndex = Math.max(0, assistantMessages.length - n);
        } else {
          startIndex = Math.max(0, assistantMessages.length - n);
          endIndex = assistantMessages.length;
        }
      }
      for (let i = startIndex; i < endIndex; i += 1) {
        const item = assistantMessages[i];
        if (!assistantInRange[item.index]) assistantInRange[item.index] = [];
        assistantInRange[item.index].push(rule.tag);
      }
    }
  } else {
    const aiRangeStr = settings.mainChatContextN;
    let startIndex = 0;
    let endIndex = assistantMessages.length;
    if (aiRangeStr === '0') {
      startIndex = 0;
      endIndex = 0;
    } else if (aiRangeStr !== '') {
      const n = parseInt(aiRangeStr, 10) || 0;
      startIndex = Math.max(0, assistantMessages.length - n);
      endIndex = assistantMessages.length;
    }
    for (let i = startIndex; i < endIndex; i += 1) {
      const item = assistantMessages[i];
      assistantInRange[item.index] = ['__full__'];
    }
  }
  if (userNStr !== '0') {
    let startIndex = 0;
    let endIndex = userMessages.length;
    if (userNStr !== '') {
      const n = parseInt(userNStr, 10) || 0;
      if (n > 0) {
        startIndex = Math.max(0, userMessages.length - n);
        endIndex = userMessages.length;
      }
    }
    for (let i = startIndex; i < endIndex; i += 1) {
      userInRange[userMessages[i].index] = true;
    }
  }
  const result = [];
  for (let i = 0; i < historyMessages.length; i += 1) {
    const message = historyMessages[i];
    if (message.role === 'user') {
      if (userInRange[i]) {
        result.push({ role: 'user', content: message.content });
      }
      continue;
    }
    if (!assistantInRange[i]) continue;
    const parts = assistantInRange[i]
      .map((tag) => tag === '__full__' ? message.content : extractTagContentWithTag(message.content, tag))
      .filter(Boolean);
    if (parts.length) {
      result.push({ role: 'assistant', content: parts.join('\n\n') });
    }
  }
  return result;
}

async function refreshAiMainChatPreview() {
  aiMainChatPreviewStatus = '读取中…';
  aiMainChatPreviewText = '';
  if (currentAppKey === 'settings' && settingsView === 'aiMainChatPreview') {
    renderAppWindow('settings');
  }
  try {
    const messages = await buildAiMainChatHistoryMessages({
      ...aiSettings,
      mainChatContextN: pendingAiMainChatContextN,
      mainChatUserN: pendingAiMainChatUserN,
      mainChatXmlRules: pendingAiMainChatXmlRules
    });
    aiMainChatPreviewText = messages.map((message) => `${message.role === 'user' ? '用户' : 'AI'}：${message.content}`).join('\n\n');
    aiMainChatPreviewStatus = `已读取 ${messages.length} 条`;
  } catch (error) {
    aiMainChatPreviewText = '';
    aiMainChatPreviewStatus = '读取失败';
    console.error('[主聊天] 读取失败', error);
  }
  if (currentAppKey === 'settings' && settingsView === 'aiMainChatPreview') {
    renderAppWindow('settings');
  }
}

function shouldAiModelMarquee(text) {
  return String(text || '').trim().length > 8;
}

function getAiModelDisplayMarkup(text, fallback = '未设') {
  const label = String(text || '').trim() || fallback;
  const isMarquee = shouldAiModelMarquee(label);
  return {
    className: `setting-row-value ${isMarquee ? 'is-marquee' : ''}`,
    style: `--network-marquee-gap:24px; --network-marquee-shift:${Math.max(label.length * 6.5 + 24, 0)}px;`,
    html: isMarquee
      ? `<span class="setting-row-value-track"><span class="setting-row-value-copy">${escapeHtml(label)}</span><span class="setting-row-value-gap" aria-hidden="true"></span><span class="setting-row-value-copy" aria-hidden="true">${escapeHtml(label)}</span></span>`
      : `<span class="setting-row-value-copy">${escapeHtml(label)}</span>`
  };
}

function focusAiSettingsInput() {
  requestAnimationFrame(() => {
    const input = document.getElementById('ai-settings-name-input') || document.getElementById('ai-settings-url-input');
    input?.focus();
    input?.select?.();
  });
}

function focusAiSystemPromptInput() {
  requestAnimationFrame(() => {
    const input = document.getElementById('ai-system-prompt-input');
    input?.focus();
    input?.setSelectionRange?.(input.value.length, input.value.length);
  });
}

function focusAiMainChatInput() {
  requestAnimationFrame(() => {
    const input = document.getElementById('ai-mainchat-context-n-input');
    input?.focus();
    input?.select?.();
  });
}

function focusAiParamInput() {
  requestAnimationFrame(() => {
    const input = document.getElementById('ai-params-temperature-input');
    input?.focus();
    input?.select?.();
  });
}

function hasFetchedAiModels() {
  return aiConfigConnectionState === 'success' && Array.isArray(getSelectedAiApiProfile(aiSettings)?.modelCache) && getSelectedAiApiProfile(aiSettings).modelCache.length > 0;
}

function openAiModelList() {
  if (!hasFetchedAiModels()) {
    openAiModelEditor();
    return;
  }
  const selectedProfile = getSelectedAiApiProfile(aiSettings);
  const modelCache = Array.isArray(selectedProfile?.modelCache) ? selectedProfile.modelCache : [];
  const currentModel = pendingAiModel || selectedProfile?.model || '';
  selectedAiModelIndex = modelCache.length
    ? Math.max(0, modelCache.indexOf(currentModel) >= 0 ? modelCache.indexOf(currentModel) : 0)
    : -1;
  settingsView = 'aiModelList';
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
}

function openAiModelEditor() {
  settingsView = 'aiModelEditor';
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
}

function closeAiModelList() {
  settingsView = 'aiConfig';
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
}

function closeAiModelEditor() {
  settingsView = 'aiConfig';
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
}

function openAiMainChatConfig() {
  const nextSettings = normalizeAiSettings(aiSettings);
  pendingAiMainChatContextN = nextSettings.mainChatContextN;
  pendingAiMainChatUserN = nextSettings.mainChatUserN;
  pendingAiMainChatXmlRules = normalizeAiMainChatRules(nextSettings.mainChatXmlRules);
  settingsView = 'aiMainChat';
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
}

function openAiMainChatRules() {
  settingsView = 'aiMainChatRules';
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
}

function closeAiMainChatRules() {
  settingsView = 'aiMainChat';
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
}

function openAiMainChatPreview() {
  settingsView = 'aiMainChatPreview';
  aiMainChatPreviewStatus = '';
  aiMainChatPreviewText = '';
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
  refreshAiMainChatPreview();
}

function closeAiMainChatPreview() {
  settingsView = 'aiMainChat';
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
}

function closeAiMainChatConfig() {
  settingsView = 'list';
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
}

function openAiParamConfig() {
  settingsView = 'aiParamConfig';
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
}

function closeAiParamConfig() {
  settingsView = 'aiConfig';
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
}

function focusAiModelInput() {
  requestAnimationFrame(() => {
    const input = document.getElementById('ai-model-manual-input');
    input?.focus();
    input?.select?.();
  });
}

function syncAiConfigConnectionState() {
  const selectedProfile = getSelectedAiApiProfile(aiSettings);
  aiConfigConnectionState = Array.isArray(selectedProfile?.modelCache) && selectedProfile.modelCache.length ? 'success' : 'idle';
}

function openNewAiApiProfileDraft() {
  pendingAiApiProfileId = '';
  pendingAiApiName = '';
  pendingAiUrl = '';
  pendingAiKey = '';
  pendingAiModel = '';
  pendingAiTemperature = '';
  pendingAiTopP = '';
  aiConfigConnectionState = 'idle';
  aiConfigStatusMessage = '新建API';
  settingsView = 'aiConfig';
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
}

function selectAiApiProfile(profileId, { openEditor = false, persist = true } = {}) {
  const currentSettings = normalizeAiSettings(aiSettings);
  const selectedProfile = getAiProfileById(profileId, currentSettings);
  if (!selectedProfile) return;
  aiSettings = normalizeAiSettings({
    ...currentSettings,
    selectedApiProfileId: selectedProfile.id,
  });
  setPendingAiSettings(aiSettings);
  syncAiConfigConnectionState();
  if (openEditor) {
    aiConfigStatusMessage = `${selectedProfile.name || '默认'}`;
  } else if (persist) {
    aiConfigStatusMessage = `已选中 ${selectedProfile.name || '默认'}`;
  }
  if (persist) {
    persistAiSettings(aiSettings);
  }
  if (openEditor) {
    settingsView = 'aiConfig';
  }
  if (currentAppKey === 'settings' && ['aiConfig', 'aiConfigList'].includes(settingsView)) {
    renderAppWindow('settings');
  }
}

function openAiConfigEditor(profileId = aiSettings?.selectedApiProfileId || '') {
  if (profileId) {
    selectAiApiProfile(profileId, { openEditor: true });
    return;
  }
  openNewAiApiProfileDraft();
}

function deleteAiApiProfile(profileId) {
  const currentSettings = normalizeAiSettings(aiSettings);
  const nextProfiles = currentSettings.apiProfiles.filter((profile) => profile.id !== profileId);
  if (nextProfiles.length === currentSettings.apiProfiles.length) return;
  aiSettings = normalizeAiSettings({
    ...currentSettings,
    apiProfiles: nextProfiles,
    selectedApiProfileId: currentSettings.selectedApiProfileId === profileId ? '' : currentSettings.selectedApiProfileId,
  });
  setPendingAiSettings(aiSettings);
  aiApiProfileListScrollTop = 0;
  syncAiConfigConnectionState();
  aiConfigStatusMessage = nextProfiles.length ? '已删除API' : 'API列表已清空';
  persistAiSettings(aiSettings);
  if (currentAppKey === 'settings' && ['aiConfig', 'aiConfigList'].includes(settingsView)) {
    renderAppWindow('settings');
  }
}

function bindAiApiProfile(bindingKey, profileId = '') {
  const key = String(bindingKey || '').trim();
  if (!key) return false;
  const currentSettings = normalizeAiSettings(aiSettings);
  const nextProfileId = typeof profileId === 'string' ? profileId.trim() : '';
  if (nextProfileId && !getAiProfileById(nextProfileId, currentSettings)) {
    return false;
  }
  aiSettings = normalizeAiSettings({
    ...currentSettings,
    apiBindings: {
      ...currentSettings.apiBindings,
      [key]: nextProfileId
    }
  });
  setPendingAiSettings(aiSettings);
  syncAiConfigConnectionState();
  persistAiSettings(aiSettings);
  return true;
}

function toggleAiApiBinding(bindingKey) {
  const key = String(bindingKey || '').trim();
  if (!key) return;
  if (!pendingAiApiProfileId) {
    aiConfigConnectionState = 'error';
    aiConfigStatusMessage = '请先保存当前API';
    if (currentAppKey === 'settings' && settingsView === 'aiConfig') {
      renderAppWindow('settings');
    }
    return;
  }
  const currentSettings = normalizeAiSettings(aiSettings);
  const targetProfile = getAiProfileById(pendingAiApiProfileId, currentSettings);
  if (!targetProfile) {
    aiConfigConnectionState = 'error';
    aiConfigStatusMessage = '当前API不存在';
    if (currentAppKey === 'settings' && settingsView === 'aiConfig') {
      renderAppWindow('settings');
    }
    return;
  }
  const willClearBinding = key !== 'default' && currentSettings.apiBindings?.[key] === targetProfile.id;
  if (!bindAiApiProfile(key, willClearBinding ? '' : targetProfile.id)) {
    aiConfigConnectionState = 'error';
    aiConfigStatusMessage = '绑定失败';
    if (currentAppKey === 'settings' && settingsView === 'aiConfig') {
      renderAppWindow('settings');
    }
    return;
  }
  const bindingLabel = aiApiBindingOptions.find((option) => option.key === key)?.label || '功能';
  aiConfigStatusMessage = willClearBinding ? `${bindingLabel}改为跟随默认` : `${bindingLabel}已绑定到 ${targetProfile.name}`;
  if (currentAppKey === 'settings' && settingsView === 'aiConfig') {
    renderAppWindow('settings');
  }
}

function openAiConfig() {
  setPendingAiSettings(aiSettings);
  syncAiConfigConnectionState();
  aiConfigStatusMessage = '';
  settingsView = 'aiConfigList';
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
}

function closeAiConfig() {
  if (settingsView === 'aiConfig') {
    settingsView = 'aiConfigList';
  } else {
    settingsView = 'list';
  }
  aiConfigStatusMessage = '';
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
}

function getAiPresetEntries() {
  return normalizeAiPresetEntries(pendingAiPresetEntries, aiSettings);
}

function getCurrentAiPresetEntry() {
  return getAiPresetEntryById(currentAiPresetId, { presetEntries: pendingAiPresetEntries });
}

function syncAiPresetSelection() {
  pendingAiPresetEntries = getAiPresetEntries();
  currentAiPresetId = resolveSelectedAiPresetId(currentAiPresetId, pendingAiPresetEntries);
  const currentPreset = getCurrentAiPresetEntry();
  pendingAiPresetName = currentPreset?.name || '';
  pendingAiPresetBlocks = normalizeAiPresetBlocks(currentPreset?.blocks || []);
  selectedAiPresetListIndex = pendingAiPresetEntries.length
    ? Math.max(0, pendingAiPresetEntries.findIndex((entry) => entry.id === currentAiPresetId))
    : -1;
  selectedAiPresetBlockIndex = pendingAiPresetBlocks.length
    ? Math.min(Math.max(selectedAiPresetBlockIndex, 0), pendingAiPresetBlocks.length - 1)
    : -1;
}

function syncCurrentAiPresetBlocksToEntries() {
  const presetEntries = getAiPresetEntries();
  const targetIndex = presetEntries.findIndex((entry) => entry.id === currentAiPresetId);
  if (targetIndex < 0) {
    pendingAiPresetEntries = presetEntries;
    return false;
  }
  presetEntries[targetIndex] = normalizeAiPresetEntry({
    ...presetEntries[targetIndex],
    name: pendingAiPresetName,
    blocks: pendingAiPresetBlocks
  }, targetIndex);
  pendingAiPresetEntries = presetEntries;
  currentAiPresetId = presetEntries[targetIndex].id;
  pendingAiPresetName = presetEntries[targetIndex].name;
  pendingAiPresetBlocks = presetEntries[targetIndex].blocks;
  selectedAiPresetListIndex = targetIndex;
  return true;
}

function saveAiPresetEntries() {
  syncAiPresetSelection();
  saveAiSettings({
    presetEntries: pendingAiPresetEntries,
    selectedPresetId: currentAiPresetId,
    presetBlocks: pendingAiPresetBlocks
  });
  return pendingAiPresetEntries;
}

function syncAiPresetBlockSelection() {
  syncAiPresetSelection();
  selectedAiPresetBlockIndex = pendingAiPresetBlocks.length
    ? Math.min(Math.max(selectedAiPresetBlockIndex, 0), pendingAiPresetBlocks.length - 1)
    : -1;
}

function isAiPresetMessageBlock(block) {
  return ['system', 'user', 'assistant'].includes(String(block?.role || '').trim());
}

function resetAiPresetBlockDraftState() {
  editingAiPresetBlockIndex = -1;
  pendingAiPresetBlockDraft = null;
  pendingAiPresetInfoSourceRoleMap = {};
}

function replaceAiPresetBlockFromDraft(blockDraft, index = editingAiPresetBlockIndex) {
  const targetIndex = Number(index);
  const blocks = normalizeAiPresetBlocks(pendingAiPresetBlocks);
  if (!Number.isFinite(targetIndex) || targetIndex < 0 || targetIndex >= blocks.length) return false;
  const currentBlock = blocks[targetIndex];
  blocks[targetIndex] = normalizeAiPresetBlock({
    ...currentBlock,
    ...blockDraft,
    id: currentBlock.id
  }, targetIndex);
  pendingAiPresetBlocks = blocks;
  selectedAiPresetBlockIndex = targetIndex;
  saveAiPresetBlocks();
  resetAiPresetBlockDraftState();
  settingsView = currentAppKey === 'data' ? '' : 'aiPromptEditor';
  renderActiveAiPresetWorkspace();
  return true;
}

function cancelAiPresetBlockDraft() {
  const nextView = editingAiPresetBlockIndex >= 0
    ? (currentAppKey === 'data' ? '' : 'aiPromptEditor')
    : 'aiPromptAddType';
  resetAiPresetBlockDraftState();
  settingsView = nextView;
  renderActiveAiPresetWorkspace();
}

function isAiPresetSlotBlock(block) {
  return ['_context', '_info', '_worldinfo'].includes(String(block?.role || '').trim());
}

function createAiPresetBlock(role = 'user') {
  const safeRole = ['system', 'user', 'assistant', '_context', '_info', '_worldinfo'].includes(String(role || '').trim())
    ? String(role || '').trim()
    : 'user';
  const defaultNameMap = {
    system: '系统块',
    user: '用户块',
    assistant: '助手块',
    _context: '上下文槽',
    _info: '信息槽',
    _worldinfo: '世界书槽'
  };
  return normalizeAiPresetBlock({
    role: safeRole,
    name: defaultNameMap[safeRole] || '消息块',
    text: ''
  }, pendingAiPresetBlocks.length);
}

function createAiPresetEntry(name = '') {
  const presetEntries = getAiPresetEntries();
  return normalizeAiPresetEntry({
    name: String(name || '').trim() || `预设 ${presetEntries.length + 1}`,
    blocks: [createAiPresetBlock('system')]
  }, presetEntries.length);
}

function getAiPresetAddTypeOptions() {
  return [
    { key: 'message', label: '消息块', subline: '可编辑名称、角色、内容' },
    { key: 'context', label: '上下文槽', subline: '直接添加主聊天上下文' },
    { key: 'info', label: '信息槽', subline: '先选择信息来源' },
    { key: 'worldinfo', label: '世界书槽', subline: '先选择世界书' }
  ];
}

function getAiPendingTargetsFromHistory() {
  return dedupeAiContacts(aiContacts).map((contact) => {
    const messages = getAiActiveContactHistory(contact.id)
      .filter((message) => message?.role === 'user' && message?.pending)
      .map((message) => {
        const normalizedTime = Number.isFinite(message?.time) ? message.time : Date.now();
        return {
          id: message.id,
          content: String(message.content || '').trim(),
          time: normalizedTime,
          timeLabel: String(message?.timeLabel || '').trim() || (typeof formatDateTimeLabel === 'function' ? formatDateTimeLabel(normalizedTime) : '')
        };
      })
      .filter((message) => message.content);
    if (!messages.length) return null;
    return { contact, messages };
  }).filter(Boolean);
}

function getAiPresetInfoSources() {
  const allHistoryCount = Object.values(aiChatHistoryMap || {}).reduce((count, messages) => count + (
    Array.isArray(messages)
      ? messages.filter((message) => !(message?.role === 'user' && message?.pending)).length
      : 0
  ), 0);
  const pendingTargets = getAiPendingTargetsFromHistory();
  const pendingMessageCount = pendingTargets.reduce((count, target) => count + target.messages.length, 0);
  return [
    {
      id: BLEACH_PHONE_MAP_INFO_SOURCE_ID,
      name: '地图信息',
      subtitle: '当前 map_json'
    },
    {
      id: BLEACH_PHONE_ITEMS_INFO_SOURCE_ID,
      name: '物品信息',
      subtitle: '当前 items_json'
    },
    {
      id: BLEACH_PHONE_NEWS_INFO_SOURCE_ID,
      name: '新闻信息',
      subtitle: '当前 news_json'
    },
    {
      id: BLEACH_PHONE_CHARS_INFO_SOURCE_ID,
      name: '情报信息',
      subtitle: '当前 chars_json'
    },
    {
      id: BLEACH_PHONE_DATETIME_INFO_SOURCE_ID,
      name: '时间信息',
      subtitle: '当前 bleach_phone_datetime'
    },
    {
      id: BLEACH_PHONE_WEATHER_INFO_SOURCE_ID,
      name: '天气信息',
      subtitle: '当前 weather_json'
    },
    {
      id: BLEACH_PHONE_ST_USER_INFO_SOURCE_ID,
      name: '酒馆用户信息',
      subtitle: '当前 user 名字与 persona 信息'
    },
    {
      id: '__sms_chat_history__',
      name: '短信聊天历史',
      subtitle: allHistoryCount ? `${allHistoryCount}条未总结` : '暂无未总结'
    },
    {
      id: '__role_info__',
      name: '角色信息',
      subtitle: '待回复联系人'
    },
    {
      id: '__pending_user_messages__',
      name: '待发送消息',
      subtitle: pendingMessageCount ? `${pendingMessageCount}条待发送` : '暂无待发送'
    }
  ];
}

function isAiPresetSmsChatHistorySource(sourceId, sourceScope = '') {
  const normalizedId = String(sourceId || '').trim();
  const normalizedScope = String(sourceScope || '').trim();
  return normalizedId === '__sms_chat_history__'
    || normalizedId === '__current_contact__'
    || normalizedScope === 'current_contact'
    || normalizedScope === 'sms_chat_history';
}

function isAiPresetPendingUserMessagesSource(sourceId, sourceScope = '') {
  const normalizedId = String(sourceId || '').trim();
  const normalizedScope = String(sourceScope || '').trim();
  return normalizedId === '__pending_user_messages__'
    || normalizedScope === 'pending_user_messages';
}

function isAiPresetMapInfoSource(sourceId, sourceScope = '') {
  const normalizedId = String(sourceId || '').trim();
  const normalizedScope = String(sourceScope || '').trim();
  return normalizedId === BLEACH_PHONE_MAP_INFO_SOURCE_ID
    || normalizedScope === 'map_json';
}

function isAiPresetItemsInfoSource(sourceId, sourceScope = '') {
  const normalizedId = String(sourceId || '').trim();
  const normalizedScope = String(sourceScope || '').trim();
  return normalizedId === BLEACH_PHONE_ITEMS_INFO_SOURCE_ID
    || normalizedScope === 'items_json';
}

function isAiPresetNewsInfoSource(sourceId, sourceScope = '') {
  const normalizedId = String(sourceId || '').trim();
  const normalizedScope = String(sourceScope || '').trim();
  return normalizedId === BLEACH_PHONE_NEWS_INFO_SOURCE_ID
    || normalizedScope === BLEACH_PHONE_NEWS_INFO_SCOPE;
}

function isAiPresetCharsInfoSource(sourceId, sourceScope = '') {
  const normalizedId = String(sourceId || '').trim();
  const normalizedScope = String(sourceScope || '').trim();
  return normalizedId === BLEACH_PHONE_CHARS_INFO_SOURCE_ID
    || normalizedScope === 'chars_json';
}

function isAiPresetDateTimeInfoSource(sourceId, sourceScope = '') {
  const normalizedId = String(sourceId || '').trim();
  const normalizedScope = String(sourceScope || '').trim();
  return normalizedId === BLEACH_PHONE_DATETIME_INFO_SOURCE_ID
    || normalizedScope === 'phone_datetime';
}

function isAiPresetWeatherInfoSource(sourceId, sourceScope = '') {
  const normalizedId = String(sourceId || '').trim();
  const normalizedScope = String(sourceScope || '').trim();
  return normalizedId === BLEACH_PHONE_WEATHER_INFO_SOURCE_ID
    || normalizedScope === 'weather_json';
}

function isAiPresetStUserInfoSource(sourceId, sourceScope = '') {
  const normalizedId = String(sourceId || '').trim();
  const normalizedScope = String(sourceScope || '').trim();
  return normalizedId === BLEACH_PHONE_ST_USER_INFO_SOURCE_ID
    || normalizedScope === 'st_user_info';
}

function getAiPresetInfoSourceScope(sourceId = '', sourceScope = '') {
  const normalizedScope = String(sourceScope || '').trim();
  if (normalizedScope) return normalizedScope;
  if (isAiPresetMapInfoSource(sourceId)) return 'map_json';
  if (isAiPresetItemsInfoSource(sourceId)) return 'items_json';
  if (isAiPresetNewsInfoSource(sourceId)) return BLEACH_PHONE_NEWS_INFO_SCOPE;
  if (isAiPresetCharsInfoSource(sourceId)) return 'chars_json';
  if (isAiPresetDateTimeInfoSource(sourceId)) return 'phone_datetime';
  if (isAiPresetWeatherInfoSource(sourceId)) return 'weather_json';
  if (isAiPresetStUserInfoSource(sourceId)) return 'st_user_info';
  if (isAiPresetSmsChatHistorySource(sourceId)) return 'sms_chat_history';
  if (isAiPresetPendingUserMessagesSource(sourceId)) return 'pending_user_messages';
  return '';
}

function getAiPresetInfoDefaultMessageRole(sourceId = '', sourceScope = '') {
  return isAiPresetPendingUserMessagesSource(sourceId, sourceScope) ? 'user' : 'system';
}

function getAiPresetInfoMessageRole(block = null) {
  const explicitRole = String(block?.messageRole || '').trim();
  if (['system', 'user', 'assistant'].includes(explicitRole)) {
    return explicitRole;
  }
  return getAiPresetInfoDefaultMessageRole(block?.sourceId, block?.sourceScope);
}

function getAiPresetInfoMessageRoleLabel(block = null) {
  const role = getAiPresetInfoMessageRole(block);
  if (role === 'user') return 'user';
  if (role === 'assistant') return 'assistant';
  return 'system';
}

function getAiPresetInfoPickerDraft(block = null, index = 0) {
  return normalizeAiPresetBlock({
    ...(block || {}),
    role: '_info',
    name: String(block?.name || '').trim() || '信息槽',
    text: '',
    messageRole: getAiPresetInfoMessageRole(block)
  }, index);
}

function getAiPresetInfoPickerRoleMap(sources = [], block = null) {
  const nextMap = Object.fromEntries((Array.isArray(sources) ? sources : []).map((source) => [
    source.id,
    getAiPresetInfoDefaultMessageRole(source.id, getAiPresetInfoSourceScope(source.id))
  ]));
  if (block?.sourceId) {
    nextMap[String(block.sourceId).trim()] = getAiPresetInfoMessageRole(block);
  }
  return nextMap;
}

function getAiPresetInfoSourceMessageRole(sourceId = '') {
  const normalizedSourceId = String(sourceId || '').trim();
  const mappedRole = String(pendingAiPresetInfoSourceRoleMap?.[normalizedSourceId] || '').trim();
  if (['system', 'user', 'assistant'].includes(mappedRole)) {
    return mappedRole;
  }
  return getAiPresetInfoDefaultMessageRole(normalizedSourceId);
}

function getAiPresetCurrentJsonSlotText(variableName = '', label = '信息槽') {
  const normalizedVariableName = String(variableName || '').trim();
  if (!normalizedVariableName) return '';
  try {
    const ctx = getSillyTavernContext();
    const variableReader = ctx?.variables?.local?.get;
    if (typeof variableReader === 'function') {
      const rawValue = variableReader(normalizedVariableName);
      if (rawValue == null || rawValue === '') return '';
      return typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue, null, 2);
    }
  } catch (error) {
    console.warn(`[预设] ${label}读取失败`, error);
  }
  return '';
}

function getAiPresetMapInfoSlotText() {
  return getAiPresetCurrentJsonSlotText(BLEACH_PHONE_MAP_VARIABLE_NAME, '地图当前块');
}

function getAiPresetItemsInfoSlotText() {
  return getAiPresetCurrentJsonSlotText(BLEACH_PHONE_ITEMS_VARIABLE_NAME, '物品当前块');
}

function getAiPresetNewsInfoSlotText() {
  return getAiPresetCurrentJsonSlotText(BLEACH_PHONE_NEWS_VARIABLE_NAME, '新闻当前块');
}

function getAiPresetCharsInfoSlotText() {
  return getAiPresetCurrentJsonSlotText(BLEACH_PHONE_CHARS_VARIABLE_NAME, 'chars当前块');
}

function getAiPresetDateTimeInfoSlotText() {
  try {
    const ctx = getSillyTavernContext();
    const variableReader = ctx?.variables?.local?.get;
    if (typeof variableReader !== 'function') return '';
    const rawValue = variableReader(BLEACH_PHONE_PRESET_DATETIME_VARIABLE_NAME);
    if (rawValue == null || rawValue === '') return '';

    let payload = rawValue;
    if (typeof rawValue === 'string') {
      const trimmedValue = rawValue.trim();
      try {
        payload = JSON.parse(trimmedValue);
      } catch (error) {
        return '';
      }
    }

    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return '';
    }

    const source = String(payload.source ?? payload.time_source ?? payload.timeSource ?? '').trim().toLowerCase();
    if (source === 'system') {
      return '';
    }

    return JSON.stringify(payload, null, 2);
  } catch (error) {
    console.warn('[预设] 时间当前块读取失败', error);
    return '';
  }
}

function getAiPresetWeatherInfoSlotText() {
  return getAiPresetCurrentJsonSlotText(BLEACH_PHONE_PRESET_WEATHER_VARIABLE_NAME, '天气当前块');
}

function normalizeAiPresetMacroResult(result = '', template = '') {
  const normalizedResult = String(result || '').trim();
  const normalizedTemplate = String(template || '').trim();
  if (!normalizedResult) return '';
  if (normalizedTemplate && normalizedResult === normalizedTemplate) return '';
  if (/\{\{[^{}]+\}\}/.test(normalizedResult)) return '';
  return normalizedResult;
}

function getAiPresetExpandedMacroText(template = '') {
  const normalizedTemplate = String(template || '').trim();
  if (!normalizedTemplate) return '';
  try {
    const ctx = getSillyTavernContext();
    if (typeof ctx?.substituteParamsExtended === 'function') {
      const result = normalizeAiPresetMacroResult(ctx.substituteParamsExtended(normalizedTemplate), normalizedTemplate);
      if (result) return result;
    }
    if (typeof ctx?.substituteParams === 'function') {
      const result = normalizeAiPresetMacroResult(ctx.substituteParams(normalizedTemplate), normalizedTemplate);
      if (result) return result;
    }
  } catch (error) {
    console.warn('[预设] 宏展开失败', error);
  }
  return '';
}

function getAiPresetStUserInfoSlotText() {
  const ctx = getSillyTavernContext();
  const userName = String(ctx?.name1 || '').trim() || 'user';
  const userInfo = [
    ctx?.personaDescription,
    ctx?.persona,
    ctx?.chatMetadata?.persona_description,
    ctx?.chatMetadata?.personaDescription,
    ctx?.chatMetadata?.persona,
    getAiPresetExpandedMacroText('{{persona}}'),
    getAiPresetExpandedMacroText('{{persona_description}}')
  ].map((value) => String(value || '').trim()).find(Boolean) || '';
  return JSON.stringify({
    user_name: userName,
    user_inf: userInfo
  }, null, 2);
}

function logAiWorldBookCompatibilityDiagnostics({ force = false, phase = '' } = {}) {
  const stApi = getSTAPI();
  const ctx = getSillyTavernContext();
  const diagnostics = {
    phase: String(phase || '').trim() || 'worldbook',
    hasSTApiWorldBookList: typeof stApi?.worldBook?.list === 'function',
    hasSTApiWorldBookGet: typeof stApi?.worldBook?.get === 'function',
    hasCtxLoadWorldInfo: typeof ctx?.loadWorldInfo === 'function'
  };
  if (!hasLoggedAiWorldBookCompatDiagnostics || force) {
    console.info('[世界书兼容诊断]', diagnostics);
    hasLoggedAiWorldBookCompatDiagnostics = true;
  }
  return diagnostics;
}

function getAiLegacyBoundWorldBookName(scope = '') {
  const ctx = getSillyTavernContext();
  const normalizedScope = String(scope || '').trim().toLowerCase();
  if (normalizedScope === 'chat') {
    return String(ctx?.chatMetadata?.world_info || ctx?.chatMetadata?.worldInfo || '').trim();
  }
  if (normalizedScope === 'character') {
    const characterId = Number.parseInt(String(ctx?.characterId ?? ''), 10);
    const character = Array.isArray(ctx?.characters) && Number.isInteger(characterId) && characterId >= 0
      ? ctx.characters[characterId] || null
      : null;
    return String(
      character?.data?.extensions?.world
      || character?.extensions?.world
      || character?.worldBook?.name
      || ''
    ).trim();
  }
  return '';
}

function resolveAiLegacyWorldBookName(name = '', scope = '') {
  const normalizedName = String(name || '').trim();
  const normalizedScope = String(scope || '').trim().toLowerCase();
  if (normalizedScope === 'chat' || normalizedName === 'Current Chat') {
    return getAiLegacyBoundWorldBookName('chat');
  }
  if (normalizedScope === 'character' || normalizedName === 'Current Character') {
    return getAiLegacyBoundWorldBookName('character');
  }
  return normalizedName;
}

function normalizeAiCompatWorldBookResult(rawResult, { fallbackName = '', fallbackScope = 'global' } = {}) {
  if (!rawResult || typeof rawResult !== 'object') return null;
  const directBook = rawResult?.worldBook && typeof rawResult.worldBook === 'object'
    ? rawResult.worldBook
    : (Array.isArray(rawResult?.entries) ? rawResult : null);
  if (!directBook) return null;
  const entries = Array.isArray(directBook.entries) ? directBook.entries : [];
  return {
    worldBook: {
      ...directBook,
      name: String(directBook.name || rawResult?.name || fallbackName || '').trim() || String(fallbackName || '').trim(),
      entries
    },
    scope: String(rawResult?.scope || fallbackScope || 'global').trim() || 'global'
  };
}

function getAiCompatLegacyWorldBookOptions() {
  const ctx = getSillyTavernContext();
  const options = [];
  const seenIds = new Set();
  const appendOption = (name, scope, ownerId = '') => {
    const normalizedName = String(name || '').trim();
    const normalizedScope = String(scope || 'global').trim() || 'global';
    const normalizedOwnerId = String(ownerId || '').trim();
    if (!normalizedName) return;
    const optionId = `${normalizedScope}:${normalizedName}`;
    if (seenIds.has(optionId)) return;
    seenIds.add(optionId);
    options.push({
      id: optionId,
      name: normalizedName,
      scope: normalizedScope,
      ownerId: normalizedOwnerId
    });
  };

  appendOption(
    getAiLegacyBoundWorldBookName('chat'),
    'chat',
    typeof ctx?.getCurrentChatId === 'function' ? (ctx.getCurrentChatId() || '') : String(ctx?.chatId || '')
  );
  appendOption(
    getAiLegacyBoundWorldBookName('character'),
    'character',
    String(ctx?.characterId ?? '')
  );
  return options;
}

async function getAiCompatWorldBook(name = '', { scope = '' } = {}) {
  const normalizedName = String(name || '').trim();
  const normalizedScope = String(scope || '').trim().toLowerCase();
  const stApi = getSTAPI();
  if (typeof stApi?.worldBook?.get === 'function') {
    return stApi.worldBook.get({ name: normalizedName, scope: normalizedScope || undefined });
  }

  logAiWorldBookCompatibilityDiagnostics({ phase: 'getAiCompatWorldBook' });

  const ctx = getSillyTavernContext();
  if (typeof ctx?.loadWorldInfo !== 'function') {
    return null;
  }

  const resolvedName = resolveAiLegacyWorldBookName(normalizedName, normalizedScope);
  if (!resolvedName) {
    return null;
  }

  const attemptFactories = [
    () => ctx.loadWorldInfo(resolvedName),
    () => ctx.loadWorldInfo({ name: resolvedName, scope: normalizedScope || undefined }),
    () => ctx.loadWorldInfo(resolvedName, normalizedScope || undefined)
  ];

  for (const createAttempt of attemptFactories) {
    try {
      const rawResult = await createAttempt();
      const normalizedResult = normalizeAiCompatWorldBookResult(rawResult, {
        fallbackName: resolvedName,
        fallbackScope: normalizedScope || 'global'
      });
      if (normalizedResult) {
        return normalizedResult;
      }
    } catch (error) {}
  }
  return null;
}

async function loadAiPresetWorldBookOptions() {
  logAiWorldBookCompatibilityDiagnostics({ phase: 'loadAiPresetWorldBookOptions' });
  aiPresetWorldBookStatus = '读取中...';
  aiPresetWorldBookOptions = [];
  if (currentAppKey === 'settings') renderAppWindow('settings');
  try {
    const stApi = getSTAPI();
    let nextOptions = [];
    if (typeof stApi?.worldBook?.list === 'function') {
      const result = await stApi.worldBook.list();
      nextOptions = Array.isArray(result?.worldBooks)
        ? result.worldBooks
          .map((book, index) => ({
            id: typeof book?.name === 'string' ? `${book.scope || 'global'}:${book.name}` : `book_${index}`,
            name: String(book?.name || '').trim(),
            scope: String(book?.scope || 'global').trim() || 'global',
            ownerId: String(book?.ownerId || '').trim()
          }))
          .filter((book) => book.name)
        : [];
      aiPresetWorldBookStatus = nextOptions.length ? '' : '暂无世界书';
    } else {
      nextOptions = getAiCompatLegacyWorldBookOptions();
      aiPresetWorldBookStatus = nextOptions.length
        ? '当前环境缺少 worldBook.list；仅显示当前角色/当前聊天已绑定世界书'
        : '当前环境缺少 worldBook.list；请升级 SillyTavern 以获取完整世界书列表';
    }
    aiPresetWorldBookOptions = nextOptions;
    const editingBlock = editingAiPresetBlockIndex >= 0
      ? normalizeAiPresetBlocks(pendingAiPresetBlocks)[editingAiPresetBlockIndex] || null
      : null;
    const matchedWorldBookIndex = String(editingBlock?.role || '').trim() === '_worldinfo'
      ? nextOptions.findIndex((book) => book.id === editingBlock.sourceId || (book.name === editingBlock.sourceName && book.scope === editingBlock.sourceScope))
      : -1;
    selectedAiPresetWorldBookIndex = nextOptions.length
      ? (matchedWorldBookIndex >= 0
        ? matchedWorldBookIndex
        : Math.min(Math.max(selectedAiPresetWorldBookIndex, 0), nextOptions.length - 1))
      : -1;
    if (currentAppKey === 'settings') renderAppWindow('settings');
    return nextOptions;
  } catch (error) {
    console.warn('[预设] 读取世界书失败', error);
    aiPresetWorldBookStatus = '读取失败';
    aiPresetWorldBookOptions = [];
    selectedAiPresetWorldBookIndex = -1;
    if (currentAppKey === 'settings') renderAppWindow('settings');
    return [];
  }
}

function openAiPresetAddTypePicker() {
  resetAiPresetBlockDraftState();
  selectedAiPresetAddTypeIndex = Math.min(Math.max(selectedAiPresetAddTypeIndex, 0), getAiPresetAddTypeOptions().length - 1);
  settingsView = 'aiPromptAddType';
  renderActiveAiPresetWorkspace();
}

function openAiPresetMessageBlockEditor(blockIndex = -1) {
  const targetIndex = Number(blockIndex);
  const blocks = normalizeAiPresetBlocks(pendingAiPresetBlocks);
  const targetBlock = Number.isFinite(targetIndex)
    && targetIndex >= 0
    && targetIndex < blocks.length
    && isAiPresetMessageBlock(blocks[targetIndex])
      ? blocks[targetIndex]
      : null;
  editingAiPresetBlockIndex = targetBlock ? targetIndex : -1;
  pendingAiPresetBlockDraft = targetBlock
    ? normalizeAiPresetBlock(targetBlock, targetIndex)
    : createAiPresetBlock('user');
  settingsView = 'aiPromptMessageBlockEditor';
  renderActiveAiPresetWorkspace();
}

function openAiPresetContextBlockEditor(blockIndex = -1) {
  const targetIndex = Number(blockIndex);
  const blocks = normalizeAiPresetBlocks(pendingAiPresetBlocks);
  const targetBlock = Number.isFinite(targetIndex)
    && targetIndex >= 0
    && targetIndex < blocks.length
    && String(blocks[targetIndex]?.role || '').trim() === '_context'
      ? blocks[targetIndex]
      : null;
  editingAiPresetBlockIndex = targetBlock ? targetIndex : -1;
  pendingAiPresetBlockDraft = targetBlock
    ? normalizeAiPresetBlock(targetBlock, targetIndex)
    : createAiPresetBlock('_context');
  settingsView = 'aiPromptContextBlockEditor';
  renderActiveAiPresetWorkspace();
}

function openAiPresetInfoSourcePicker(blockIndex = -1) {
  const sources = getAiPresetInfoSources();
  const targetIndex = Number(blockIndex);
  const blocks = normalizeAiPresetBlocks(pendingAiPresetBlocks);
  const targetBlock = Number.isFinite(targetIndex)
    && targetIndex >= 0
    && targetIndex < blocks.length
    && String(blocks[targetIndex]?.role || '').trim() === '_info'
      ? blocks[targetIndex]
      : null;
  editingAiPresetBlockIndex = targetBlock ? targetIndex : -1;
  const matchedIndex = targetBlock
    ? sources.findIndex((source) => source.id === targetBlock.sourceId)
    : -1;
  selectedAiPresetInfoSourceIndex = sources.length
    ? (matchedIndex >= 0
      ? matchedIndex
      : Math.min(Math.max(selectedAiPresetInfoSourceIndex, 0), sources.length - 1))
    : -1;
  pendingAiPresetInfoSourceRoleMap = getAiPresetInfoPickerRoleMap(sources, targetBlock);
  pendingAiPresetBlockDraft = getAiPresetInfoPickerDraft(targetBlock, targetBlock ? targetIndex : pendingAiPresetBlocks.length);
  settingsView = 'aiPromptInfoSourcePicker';
  renderActiveAiPresetWorkspace();
}

function getAiPresetConfiguredWorldBookOptions(settingsSource = aiSettings) {
  return getAiWorldBookSettingsEntries(settingsSource).map((entry, index) => ({
    id: String(entry?.id || '').trim() || `configured_worldbook_${index}`,
    name: String(entry?.name || '').trim(),
    scope: String(entry?.scope || 'global').trim() || 'global',
    ownerId: String(entry?.ownerId || '').trim()
  })).filter((entry) => entry.name);
}

function getAiPresetWorldBookPickerOptions() {
  return settingsView === 'worldBookPicker'
    ? aiPresetWorldBookOptions
    : getAiPresetConfiguredWorldBookOptions(aiSettings);
}

function openAiPresetWorldBookPicker(blockIndex = -1) {
  const targetIndex = Number(blockIndex);
  const blocks = normalizeAiPresetBlocks(pendingAiPresetBlocks);
  const targetBlock = Number.isFinite(targetIndex)
    && targetIndex >= 0
    && targetIndex < blocks.length
    && String(blocks[targetIndex]?.role || '').trim() === '_worldinfo'
      ? blocks[targetIndex]
      : null;
  const options = getAiPresetConfiguredWorldBookOptions(aiSettings);
  editingAiPresetBlockIndex = targetBlock ? targetIndex : -1;
  const matchedIndex = targetBlock
    ? options.findIndex((source) => source.id === targetBlock.sourceId || (source.name === targetBlock.sourceName && source.scope === targetBlock.sourceScope))
    : -1;
  selectedAiPresetWorldBookIndex = options.length
    ? (matchedIndex >= 0
      ? matchedIndex
      : Math.min(Math.max(selectedAiPresetWorldBookIndex, 0), options.length - 1))
    : -1;
  pendingAiPresetBlockDraft = null;
  settingsView = 'aiPromptWorldBookPicker';
  renderActiveAiPresetWorkspace();
}

function openAiPresetBlockEditor(index) {
  const targetIndex = Number(index);
  const blocks = normalizeAiPresetBlocks(pendingAiPresetBlocks);
  if (!Number.isFinite(targetIndex) || targetIndex < 0 || targetIndex >= blocks.length) return false;
  const targetBlock = blocks[targetIndex];
  selectedAiPresetBlockIndex = targetIndex;
  if (isAiPresetMessageBlock(targetBlock)) {
    openAiPresetMessageBlockEditor(targetIndex);
    return true;
  }
  if (String(targetBlock?.role || '').trim() === '_context') {
    openAiPresetContextBlockEditor(targetIndex);
    return true;
  }
  if (String(targetBlock?.role || '').trim() === '_info') {
    openAiPresetInfoSourcePicker(targetIndex);
    return true;
  }
  if (String(targetBlock?.role || '').trim() === '_worldinfo') {
    openAiPresetWorldBookPicker(targetIndex);
    return true;
  }
  if (isAiPresetWorkspaceActive()) renderActiveAiPresetWorkspace();
  return false;
}

function addAiPresetBlockFromDraft(blockDraft) {
  const nextBlock = normalizeAiPresetBlock(blockDraft, pendingAiPresetBlocks.length);
  pendingAiPresetBlocks = [...normalizeAiPresetBlocks(pendingAiPresetBlocks), nextBlock];
  selectedAiPresetBlockIndex = pendingAiPresetBlocks.length - 1;
  saveAiPresetBlocks();
  resetAiPresetBlockDraftState();
  settingsView = currentAppKey === 'data' ? '' : 'aiPromptEditor';
  renderActiveAiPresetWorkspace();
}

function confirmAiPresetAddTypeSelection() {
  const targetOption = getAiPresetAddTypeOptions()[selectedAiPresetAddTypeIndex] || null;
  if (!targetOption) return;
  if (targetOption.key === 'message') {
    openAiPresetMessageBlockEditor();
    return;
  }
  if (targetOption.key === 'context') {
    openAiPresetContextBlockEditor();
    return;
  }
  if (targetOption.key === 'info') {
    openAiPresetInfoSourcePicker();
    return;
  }
  if (targetOption.key === 'worldinfo') {
    openAiPresetWorldBookPicker();
  }
}

function saveAiPresetDraftMessageBlock() {
  const targetIndex = editingAiPresetBlockIndex >= 0 ? editingAiPresetBlockIndex : pendingAiPresetBlocks.length;
  const draft = normalizeAiPresetBlock({
    ...pendingAiPresetBlockDraft,
    role: ['system', 'user', 'assistant'].includes(String(pendingAiPresetBlockDraft?.role || '').trim())
      ? String(pendingAiPresetBlockDraft.role).trim()
      : 'user',
    name: pendingAiPresetBlockDraft?.name || '',
    text: pendingAiPresetBlockDraft?.text || ''
  }, targetIndex);
  if (editingAiPresetBlockIndex >= 0) {
    replaceAiPresetBlockFromDraft(draft, editingAiPresetBlockIndex);
    return;
  }
  addAiPresetBlockFromDraft(draft);
}

function saveAiPresetContextBlock() {
  const targetIndex = editingAiPresetBlockIndex >= 0 ? editingAiPresetBlockIndex : pendingAiPresetBlocks.length;
  const draft = normalizeAiPresetBlock({
    ...pendingAiPresetBlockDraft,
    role: '_context',
    name: pendingAiPresetBlockDraft?.name || '上下文槽',
    text: ''
  }, targetIndex);
  if (editingAiPresetBlockIndex >= 0) {
    replaceAiPresetBlockFromDraft(draft, editingAiPresetBlockIndex);
    return;
  }
  addAiPresetBlockFromDraft(draft);
}

function confirmAiPresetInfoSourceSelection() {
  const sources = getAiPresetInfoSources();
  if (!sources.length || selectedAiPresetInfoSourceIndex < 0) return;
  const source = sources[Math.min(selectedAiPresetInfoSourceIndex, sources.length - 1)];
  const nextBlock = {
    role: '_info',
    messageRole: getAiPresetInfoSourceMessageRole(source.id),
    name: `信息槽 · ${source.name}`,
    text: '',
    sourceId: source.id,
    sourceName: source.name,
    sourceScope: getAiPresetInfoSourceScope(source.id)
  };
  if (editingAiPresetBlockIndex >= 0) {
    replaceAiPresetBlockFromDraft(nextBlock, editingAiPresetBlockIndex);
    return;
  }
  addAiPresetBlockFromDraft(nextBlock);
}

function cycleAiPresetInfoMessageRole(step = 1, sourceIndex = null) {
  const roleOptions = ['system', 'user', 'assistant'];
  const normalizedSourceIndex = Number(sourceIndex);
  if (!Number.isFinite(normalizedSourceIndex)) {
    return;
  }
  const sources = getAiPresetInfoSources();
  if (!sources.length || normalizedSourceIndex < 0 || normalizedSourceIndex >= sources.length) {
    return;
  }
  selectedAiPresetInfoSourceIndex = normalizedSourceIndex;
  const source = sources[normalizedSourceIndex];
  const currentRole = getAiPresetInfoSourceMessageRole(source.id);
  const currentIndex = Math.max(0, roleOptions.indexOf(currentRole));
  const nextIndex = (currentIndex + step + roleOptions.length) % roleOptions.length;
  pendingAiPresetInfoSourceRoleMap = {
    ...(pendingAiPresetInfoSourceRoleMap || {}),
    [source.id]: roleOptions[nextIndex]
  };
  if (pendingAiPresetBlockDraft && String(pendingAiPresetBlockDraft?.sourceId || '').trim() === String(source.id || '').trim()) {
    pendingAiPresetBlockDraft = getAiPresetInfoPickerDraft({
      ...pendingAiPresetBlockDraft,
      messageRole: roleOptions[nextIndex]
    }, editingAiPresetBlockIndex >= 0 ? editingAiPresetBlockIndex : pendingAiPresetBlocks.length);
  }
  if (isAiPresetWorkspaceActive() && settingsView === 'aiPromptInfoSourcePicker') {
    renderActiveAiPresetWorkspace();
  }
}

function confirmAiPresetWorldBookSelection() {
  const options = getAiPresetConfiguredWorldBookOptions(aiSettings);
  if (!options.length || selectedAiPresetWorldBookIndex < 0) return;
  const source = options[Math.min(selectedAiPresetWorldBookIndex, options.length - 1)];
  const nextBlock = {
    role: '_worldinfo',
    name: `世界书槽 · ${source.name}`,
    text: '',
    sourceId: source.id,
    sourceName: source.name,
    sourceScope: source.scope
  };
  if (editingAiPresetBlockIndex >= 0) {
    replaceAiPresetBlockFromDraft(nextBlock, editingAiPresetBlockIndex);
    return;
  }
  addAiPresetBlockFromDraft(nextBlock);
}

function cycleAiPresetDraftRole(step = 1) {
  const roleOptions = ['system', 'user', 'assistant'];
  const currentRole = String(pendingAiPresetBlockDraft?.role || 'user').trim();
  const currentIndex = Math.max(0, roleOptions.indexOf(currentRole));
  const nextIndex = (currentIndex + step + roleOptions.length) % roleOptions.length;
  pendingAiPresetBlockDraft = normalizeAiPresetBlock({
    ...pendingAiPresetBlockDraft,
    role: roleOptions[nextIndex]
  }, 0);
  if (isAiPresetWorkspaceActive() && settingsView === 'aiPromptMessageBlockEditor') {
    renderActiveAiPresetWorkspace();
  }
}

function getAiPresetBlockDisplayName(block, index = 0) {
  const role = String(block?.role || '').trim();
  if (role === '_context') return '主聊天';
  if (role === '_info') {
    const sourceId = String(block?.sourceId || '').trim();
    const matchedSource = getAiPresetInfoSources().find((source) => String(source?.id || '').trim() === sourceId);
    return String(matchedSource?.name || block?.sourceName || '').trim() || '信息';
  }
  if (role === '_worldinfo') return String(block?.sourceName || '').trim() || '世界书';
  if (block?.name) return block.name;
  return `消息块 ${index + 1}`;
}

function getAiPresetBlockSubtitle(block) {
  const role = String(block?.role || '').trim();
  if (role === 'system') return 'system';
  if (role === 'assistant') return 'assistant';
  if (role === 'user') return 'user';
  if (role === '_info') return getAiPresetInfoMessageRoleLabel(block);
  return '';
}

function selectAiPresetListItem(index) {
  const presetEntries = getAiPresetEntries();
  if (!presetEntries.length) {
    selectedAiPresetListIndex = -1;
    return;
  }
  selectedAiPresetListIndex = Math.min(Math.max(Number(index) || 0, 0), presetEntries.length - 1);
  currentAiPresetId = presetEntries[selectedAiPresetListIndex].id;
  if (currentAppKey === 'settings' && settingsView === 'aiPromptList') {
    renderAppWindow('settings');
  }
}

function openAiPresetConfig(presetId = currentAiPresetId) {
  const presetEntries = getAiPresetEntries();
  const targetPreset = getAiPresetEntryById(presetId, { presetEntries }) || presetEntries[0] || null;
  if (!targetPreset) return;
  currentAiPresetId = targetPreset.id;
  pendingAiPresetEntries = presetEntries;
  pendingAiPresetName = targetPreset.name || '';
  pendingAiPresetBlocks = normalizeAiPresetBlocks(targetPreset.blocks);
  selectedAiPresetListIndex = Math.max(0, presetEntries.findIndex((entry) => entry.id === targetPreset.id));
  selectedAiPresetBlockIndex = pendingAiPresetBlocks.length
    ? Math.min(Math.max(selectedAiPresetBlockIndex, 0), pendingAiPresetBlocks.length - 1)
    : -1;
  resetAiPresetBlockDraftState();
  settingsView = 'aiPromptEditor';
  renderActiveAiPresetWorkspace();
}

function closeAiPresetConfig() {
  syncAiPresetSelection();
  settingsView = 'aiPromptList';
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
}

function createAiPresetAndOpen() {
  const presetEntries = [...getAiPresetEntries(), createAiPresetEntry()];
  pendingAiPresetEntries = presetEntries;
  currentAiPresetId = presetEntries[presetEntries.length - 1].id;
  saveAiPresetEntries();
  openAiPresetConfig(currentAiPresetId);
}

function deleteAiPreset(presetId = currentAiPresetId) {
  const targetPresetId = String(presetId || '').trim();
  const presetEntries = getAiPresetEntries();
  if (presetEntries.length <= 1 || !targetPresetId) return false;
  const targetIndex = presetEntries.findIndex((entry) => entry.id === targetPresetId);
  if (targetIndex < 0) return false;
  const nextEntries = presetEntries.filter((entry) => entry.id !== targetPresetId);
  const fallbackPreset = nextEntries[Math.min(targetIndex, nextEntries.length - 1)] || nextEntries[0] || null;
  pendingAiPresetEntries = nextEntries;
  currentAiPresetId = fallbackPreset?.id || '';
  pendingAiPresetName = fallbackPreset?.name || '';
  pendingAiPresetBlocks = normalizeAiPresetBlocks(fallbackPreset?.blocks || []);
  selectedAiPresetListIndex = fallbackPreset ? nextEntries.findIndex((entry) => entry.id === fallbackPreset.id) : -1;
  selectedAiPresetBlockIndex = pendingAiPresetBlocks.length
    ? Math.min(Math.max(selectedAiPresetBlockIndex, 0), pendingAiPresetBlocks.length - 1)
    : -1;
  resetAiPresetBlockDraftState();
  saveAiPresetEntries();
  if (isAiPresetWorkspaceActive() && settingsView === 'aiPromptList') {
    renderActiveAiPresetWorkspace();
  }
  return true;
}

function saveCurrentAiPreset() {
  if (!syncCurrentAiPresetBlocksToEntries()) return false;
  saveAiPresetEntries();
  if (isAiPresetWorkspaceActive() && (settingsView === 'aiPromptEditor' || currentAppKey === 'data')) {
    renderActiveAiPresetWorkspace();
  }
  return true;
}

function saveAiPresetBlocks() {
  syncCurrentAiPresetBlocksToEntries();
  saveAiPresetEntries();
  return pendingAiPresetBlocks;
}

function selectAiPresetBlock(index) {
  if (!pendingAiPresetBlocks.length) {
    selectedAiPresetBlockIndex = -1;
  } else {
    selectedAiPresetBlockIndex = Math.min(Math.max(Number(index) || 0, 0), pendingAiPresetBlocks.length - 1);
  }
  if (isAiPresetWorkspaceActive() && (settingsView === 'aiPromptEditor' || currentAppKey === 'data')) {
    renderActiveAiPresetWorkspace();
  }
}

function addAiPresetBlock(role = 'user') {
  pendingAiPresetBlocks = [...normalizeAiPresetBlocks(pendingAiPresetBlocks), createAiPresetBlock(role)];
  selectedAiPresetBlockIndex = pendingAiPresetBlocks.length - 1;
  saveAiPresetBlocks();
  if (currentAppKey === 'settings' && settingsView === 'aiPromptEditor') {
    renderAppWindow('settings');
  }
}

function moveAiPresetBlock(index, step) {
  const sourceIndex = Number(index);
  const offset = Number(step);
  if (!Number.isFinite(sourceIndex) || !Number.isFinite(offset)) return false;
  const blocks = normalizeAiPresetBlocks(pendingAiPresetBlocks);
  const targetIndex = sourceIndex + offset;
  if (sourceIndex < 0 || sourceIndex >= blocks.length || targetIndex < 0 || targetIndex >= blocks.length) {
    return false;
  }
  const [movedBlock] = blocks.splice(sourceIndex, 1);
  blocks.splice(targetIndex, 0, movedBlock);
  pendingAiPresetBlocks = blocks;
  selectedAiPresetBlockIndex = targetIndex;
  saveAiPresetBlocks();
  if (currentAppKey === 'settings' && settingsView === 'aiPromptEditor') {
    renderAppWindow('settings');
  }
  return true;
}

function deleteAiPresetBlock(index) {
  const targetIndex = Number(index);
  if (!Number.isFinite(targetIndex)) return false;
  const blocks = normalizeAiPresetBlocks(pendingAiPresetBlocks);
  if (targetIndex < 0 || targetIndex >= blocks.length) return false;
  blocks.splice(targetIndex, 1);
  pendingAiPresetBlocks = blocks;
  selectedAiPresetBlockIndex = blocks.length ? Math.min(targetIndex, blocks.length - 1) : -1;
  saveAiPresetBlocks();
  if (currentAppKey === 'settings' && settingsView === 'aiPromptEditor') {
    renderAppWindow('settings');
  }
  return true;
}

function getAiPresetSummaryLabel() {
  return pendingAiPresetEntries.length ? `${pendingAiPresetEntries.length}项` : '空';
}

function renderAiPresetListContent() {
  const presetEntries = getAiPresetEntries();
  if (!presetEntries.length) {
    return '<div class="app-subline ai-preset-empty-line">暂无预设</div>';
  }
  const canDeletePreset = presetEntries.length > 1;
  return `
    <div class="screensaver-saved-list ai-preset-name-list" id="ai-preset-name-list">
      ${presetEntries.map((entry, index) => `
        <div class="screensaver-saved-item ai-preset-name-item ${selectedAiPresetListIndex === index ? 'is-selected' : ''}" data-ai-preset-list-index="${index}" data-ai-preset-id="${entry.id}">
          <div class="screensaver-saved-main">
            <span class="screensaver-saved-name">${escapeHtml(entry.name)}</span>
          </div>
          ${canDeletePreset ? `<button class="screensaver-delete-button ai-preset-name-delete-button" data-ai-preset-list-delete-id="${entry.id}" type="button">×</button>` : ''}
        </div>
      `).join('')}
    </div>
  `;
}

function renderAiPresetOverviewListContent() {
  const presetEntries = getAiPresetEntries();
  if (!presetEntries.length) {
    return '<div class="app-subline ai-preset-empty-line">暂无预设</div>';
  }
  const smsPresetId = getSmsSelectedPresetEntry(aiSettings)?.id || currentSmsPresetId || '';
  const smsSummaryPresetId = getSmsSelectedSummaryPresetEntry(aiSettings)?.id || currentSmsSummaryPresetId || '';
  return `
    <div class="screensaver-saved-list ai-preset-name-list" id="ai-preset-overview-list">
      ${presetEntries.map((entry, index) => `
        <div class="screensaver-saved-item ai-preset-name-item ${selectedAiPresetListIndex === index ? 'is-selected' : ''}" data-ai-preset-overview-index="${index}" data-ai-preset-id="${entry.id}">
          <div class="screensaver-saved-main">
            <span class="screensaver-saved-name">${escapeHtml(entry.name)}</span>
            <span class="screensaver-saved-url">${escapeHtml(entry.id === smsPresetId ? '聊天' : (entry.id === smsSummaryPresetId ? '总结' : (Array.isArray(entry.blocks) ? `${entry.blocks.length} 个块` : '0 个块')))}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderAiPresetAddTypePickerContent() {
  const options = getAiPresetAddTypeOptions();
  return `
    <div class="screensaver-saved-list ai-preset-picker-list" id="ai-preset-add-type-list">
      ${options.map((option, index) => `
        <div class="screensaver-saved-item ai-preset-picker-item ${selectedAiPresetAddTypeIndex === index ? 'is-selected' : ''}" data-ai-preset-add-type-index="${index}">
          <div class="screensaver-saved-main">
            <span class="screensaver-saved-name">${escapeHtml(option.label)}</span>
            <span class="screensaver-saved-url">${escapeHtml(option.subline)}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderAiPresetMessageBlockEditorContent() {
  const draft = normalizeAiPresetBlock({ ...(pendingAiPresetBlockDraft || {}), role: pendingAiPresetBlockDraft?.role || 'user' }, 0);
  return `
    <div class="ai-preset-editor">
      <div class="settings-editor ai-preset-message-editor">
        <input class="settings-editor-field" id="ai-preset-block-name-input" type="text" maxlength="32" spellcheck="false" value="${escapeHtml(draft.name || '')}" placeholder="块名称">
        <button class="setting-row ai-preset-role-button" id="ai-preset-block-role-toggle" type="button">
          <span class="setting-row-label">角色</span>
          <span class="setting-row-value-wrap">
            <span class="setting-row-value">${escapeHtml(draft.role)}</span>
            <span class="setting-row-arrow">⇆</span>
          </span>
        </button>
        <textarea class="settings-editor-input ai-preset-message-textarea" id="ai-preset-block-text-input" spellcheck="false" placeholder="内容">${escapeHtml(draft.text || '')}</textarea>
      </div>
    </div>
  `;
}

function renderAiPresetContextBlockEditorContent() {
  return `
    <div class="ai-preset-editor">
      <div class="settings-list">
        <button class="setting-row" type="button" disabled>
          <span class="setting-row-label">当前规则</span>
          <span class="setting-row-value-wrap">
            <span class="setting-row-value">${escapeHtml(getAiMainChatSummary())}</span>
          </span>
        </button>
      </div>
      <div class="app-microline">左软键可查看展开后的具体内容。</div>
    </div>
  `;
}

function renderAiPresetInfoSourcePickerContent() {
  const sources = getAiPresetInfoSources();
  if (!sources.length) {
    return '<div class="app-subline ai-preset-empty-line">暂无信息来源</div>';
  }
  return `
    <div class="screensaver-saved-list ai-preset-picker-list" id="ai-preset-info-source-list">
      ${sources.map((source, index) => `
        <div class="screensaver-saved-item ai-preset-picker-item ${selectedAiPresetInfoSourceIndex === index ? 'is-selected' : ''}" data-ai-preset-info-source-index="${index}">
          <div class="screensaver-saved-main ai-preset-picker-main">
            <span class="screensaver-saved-name">${escapeHtml(source.name)}</span>
            <span class="screensaver-saved-url">${escapeHtml(source.subtitle)}</span>
          </div>
          <button class="ai-preset-info-role-button" type="button" data-ai-preset-info-role-index="${index}">
            <span class="setting-row-value-wrap">
              <span class="setting-row-value">${escapeHtml(getAiPresetInfoMessageRoleLabel({ messageRole: getAiPresetInfoSourceMessageRole(source.id) }))}</span>
              <span class="setting-row-arrow">⇆</span>
            </span>
          </button>
        </div>
      `).join('')}
    </div>
  `;
}

function renderAiPresetWorldBookPickerContent() {
  const options = getAiPresetWorldBookPickerOptions();
  if (settingsView === 'worldBookPicker' && aiPresetWorldBookStatus && !options.length) {
    return `<div class="app-subline ai-preset-empty-line">${escapeHtml(aiPresetWorldBookStatus)}</div>`;
  }
  if (!options.length) {
    return `<div class="app-subline ai-preset-empty-line">${escapeHtml(settingsView === 'worldBookPicker' ? '暂无世界书' : '请先在设置/世界书中添加世界书')}</div>`;
  }
  return `
    <div class="screensaver-saved-list ai-preset-picker-list" id="ai-preset-worldbook-list">
      ${options.map((source, index) => `
        <div class="screensaver-saved-item ai-preset-picker-item ${selectedAiPresetWorldBookIndex === index ? 'is-selected' : ''}" data-ai-preset-worldbook-index="${index}">
          <div class="screensaver-saved-main">
            <span class="screensaver-saved-name">${escapeHtml(source.name)}</span>
            <span class="screensaver-saved-url">${escapeHtml(source.scope === 'chat' ? '聊天绑定' : source.scope === 'character' ? '角色绑定' : '全局世界书')}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderAiPresetPreviewContent() {
  return `
    <div class="ai-preset-preview">
      <div class="ai-mainchat-preview" id="ai-preset-preview-output">${escapeHtml(aiPresetPreviewText || '')}</div>
      <div class="app-microline ai-mainchat-preview-status">${escapeHtml(aiPresetPreviewStatus || '')}</div>
    </div>
  `;
}

function renderAiPresetEditorContent() {
  const blocks = normalizeAiPresetBlocks(pendingAiPresetBlocks);
  const blocksHtml = blocks.length
    ? blocks.map((block, index) => {
      const canMoveUp = index > 0;
      const canMoveDown = index < blocks.length - 1;
      const subtitle = getAiPresetBlockSubtitle(block);
      return `
        <div class="screensaver-saved-item ai-preset-block-item ${selectedAiPresetBlockIndex === index ? 'is-selected' : ''} ${isAiPresetSlotBlock(block) ? 'is-slot' : ''}" data-ai-preset-block-index="${index}">
          <div class="screensaver-saved-main ai-preset-block-main">
            <span class="screensaver-saved-name">${escapeHtml(getAiPresetBlockDisplayName(block, index))}</span>
            ${subtitle ? `<span class="screensaver-saved-url ai-preset-block-role">${escapeHtml(subtitle)}</span>` : ''}
          </div>
          <div class="ai-preset-block-actions">
            <button class="ai-preset-block-move-button" data-ai-preset-move-index="${index}" data-ai-preset-move-direction="-1" type="button" ${canMoveUp ? '' : 'disabled'}>↑</button>
            <button class="ai-preset-block-move-button" data-ai-preset-move-index="${index}" data-ai-preset-move-direction="1" type="button" ${canMoveDown ? '' : 'disabled'}>↓</button>
            <button class="screensaver-delete-button ai-preset-block-delete-button" data-ai-preset-delete-index="${index}" type="button">×</button>
          </div>
        </div>
      `;
    }).join('')
    : '<div class="app-subline ai-preset-empty-line">暂无块</div>';

  return `
    <div class="ai-preset-editor">
      <div class="settings-editor ai-preset-name-editor">
        <input class="settings-editor-field" id="ai-preset-name-input" type="text" maxlength="24" spellcheck="false" value="${escapeHtml(pendingAiPresetName)}" placeholder="预设名称">
      </div>
      <div class="screensaver-saved-list ai-preset-block-list" id="ai-preset-block-list">${blocksHtml}</div>
    </div>
  `;
}

function openAiSystemPromptEditor() {
  settingsView = 'aiPromptList';
  syncAiPresetSelection();
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
}

function openAiPromptOverviewList() {
  settingsView = 'aiPromptOverviewList';
  syncAiPresetSelection();
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
}

function getSelectedAiModel() {
  const modelCache = Array.isArray(getSelectedAiApiProfile(aiSettings)?.modelCache) ? getSelectedAiApiProfile(aiSettings).modelCache : [];
  if (selectedAiModelIndex < 0 || selectedAiModelIndex >= modelCache.length) return '';
  return modelCache[selectedAiModelIndex] || '';
}

function closeAiSystemPromptEditor() {
  settingsView = settingsView === 'aiPromptEditor' ? 'aiPromptList' : 'list';
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
}

function getSmsSelectedPresetEntry(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  const targetPresetId = resolveSelectedAiPresetId(settings.selectedSmsPresetId || settings.selectedPresetId, settings.presetEntries);
  return getAiPresetEntryById(targetPresetId, settings) || settings.presetEntries?.[0] || null;
}

function getSmsSelectedSummaryPresetEntry(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  const targetPresetId = resolveSelectedAiPresetId(settings.selectedSmsSummaryPresetId || settings.selectedSmsPresetId || settings.selectedPresetId, settings.presetEntries);
  return getAiPresetEntryById(targetPresetId, settings) || settings.presetEntries?.[0] || null;
}

async function openAiPresetPreviewWithBlock(targetBlock, title = '', returnView = 'aiPromptEditor') {
  if (!targetBlock) return false;
  aiPresetPreviewTitle = title || '块预览';
  aiPresetPreviewStatus = '读取中…';
  aiPresetPreviewText = '';
  aiPresetPreviewReturnView = returnView || 'aiPromptEditor';
  settingsView = 'aiPromptBlockPreview';
  renderActiveAiPresetWorkspace();
  try {
    const role = String(targetBlock?.role || '').trim();
    if (role === '_context') {
      const contextMessages = await buildAiMainChatHistoryMessages();
      aiPresetPreviewText = contextMessages.map((message) => `${message.role === 'user' ? '用户' : 'AI'}：${message.content}`).join('\n\n') || '暂无内容';
      aiPresetPreviewStatus = contextMessages.length ? `共 ${contextMessages.length} 条` : '暂无内容';
    } else if (role === '_info') {
      aiPresetPreviewText = getAiPresetInfoSlotText(targetBlock, getCurrentAiContact()) || '暂无内容';
      aiPresetPreviewStatus = aiPresetPreviewText ? `已展开信息槽内容 · ${getAiPresetInfoMessageRoleLabel(targetBlock)}` : '暂无内容';
    } else if (role === '_worldinfo') {
      const pendingTargets = getAiPendingTargetsFromHistory();
      aiPresetPreviewText = await getAiPresetWorldInfoSlotText(targetBlock, getCurrentAiContact(), { pendingTargets }) || '暂无内容';
      aiPresetPreviewStatus = aiPresetPreviewText ? '已展开世界书内容' : '暂无内容';
    } else {
      aiPresetPreviewText = String(targetBlock?.text || '').trim() || '暂无内容';
      aiPresetPreviewStatus = aiPresetPreviewText ? '已展开消息块内容' : '暂无内容';
    }
  } catch (error) {
    aiPresetPreviewText = '';
    aiPresetPreviewStatus = '读取失败';
    console.warn('[预设] 块预览读取失败', error);
  }
  if (isAiPresetWorkspaceActive() && settingsView === 'aiPromptBlockPreview') renderActiveAiPresetWorkspace();
  return true;
}

async function openAiPresetBlockPreview(index = selectedAiPresetBlockIndex) {
  const targetIndex = Number(index);
  const blocks = normalizeAiPresetBlocks(pendingAiPresetBlocks);
  if (!Number.isFinite(targetIndex) || targetIndex < 0 || targetIndex >= blocks.length) return false;
  const targetBlock = blocks[targetIndex];
  return openAiPresetPreviewWithBlock(targetBlock, getAiPresetBlockDisplayName(targetBlock, targetIndex) || '块预览', 'aiPromptEditor');
}

async function openAiPresetTotalContentPreview(presetEntry = null, { returnView = 'aiPromptEditor' } = {}) {
  const sourcePreset = presetEntry
    ? normalizeAiPresetEntry(presetEntry, 0)
    : normalizeAiPresetEntry({
      id: currentAiPresetId,
      name: pendingAiPresetName,
      blocks: pendingAiPresetBlocks
    }, 0);
  aiPresetPreviewTitle = `${sourcePreset.name || '预设'}总览`;
  aiPresetPreviewStatus = '读取中…';
  aiPresetPreviewText = '';
  aiPresetPreviewReturnView = returnView || 'aiPromptEditor';
  settingsView = 'aiPromptBlockPreview';
  renderActiveAiPresetWorkspace();
  try {
    const pendingTargets = getAiPendingTargetsFromHistory();
    const previewContact = pendingTargets[0]?.contact || getCurrentAiContact() || aiContacts[0] || null;
    const messages = await buildAiMessagesFromPreset(previewContact, '', sourcePreset, { pendingTargets });
    aiPresetPreviewText = JSON.stringify(messages, null, 2);
    aiPresetPreviewStatus = `共 ${messages.length} 条消息 · 待发送联系人 ${pendingTargets.length} 个`;
  } catch (error) {
    aiPresetPreviewText = '';
    aiPresetPreviewStatus = '读取失败';
    console.warn('[预设] 总发送内容预览读取失败', error);
  }
  if (isAiPresetWorkspaceActive() && settingsView === 'aiPromptBlockPreview') renderActiveAiPresetWorkspace();
  return true;
}

async function openAiPresetContextPreview() {
  const draft = normalizeAiPresetBlock({
    ...(pendingAiPresetBlockDraft || {}),
    role: '_context',
    name: pendingAiPresetBlockDraft?.name || '上下文槽',
    text: ''
  }, editingAiPresetBlockIndex >= 0 ? editingAiPresetBlockIndex : 0);
  return openAiPresetPreviewWithBlock(draft, '主聊天', 'aiPromptContextBlockEditor');
}

async function openAiPresetInfoSourcePreview() {
  const sources = getAiPresetInfoSources();
  if (!sources.length || selectedAiPresetInfoSourceIndex < 0) return false;
  const source = sources[Math.min(selectedAiPresetInfoSourceIndex, sources.length - 1)] || null;
  if (!source) return false;
  return openAiPresetPreviewWithBlock({
    role: '_info',
    sourceId: source.id,
    sourceName: source.name,
    sourceScope: getAiPresetInfoSourceScope(source.id)
  }, source.name || '信息来源预览', 'aiPromptInfoSourcePicker');
}

async function openAiPresetWorldBookPreview() {
  const options = getAiPresetWorldBookPickerOptions();
  const source = options[selectedAiPresetWorldBookIndex] || null;
  if (!source) return false;
  return openAiPresetPreviewWithBlock({
    role: '_worldinfo',
    sourceId: source.id,
    sourceName: source.name,
    sourceScope: source.scope
  }, source.name || '世界书预览', 'aiPromptWorldBookPicker');
}

function closeAiPresetBlockPreview() {
  settingsView = aiPresetPreviewReturnView || 'aiPromptEditor';
  if (currentAppKey === 'data' && settingsView === 'aiPromptEditor') {
    settingsView = '';
  }
  renderActiveAiPresetWorkspace();
}

function dedupeAiContacts(contacts = []) {
  const seenIds = new Set();
  return contacts.filter((contact) => {
    if (!contact?.id || seenIds.has(contact.id)) return false;
    seenIds.add(contact.id);
    return true;
  });
}

function hasAiContactAwaitingReply(contact) {
  if (!contact?.id) return false;
  const history = getAiActiveContactHistory(contact.id);
  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index];
    const content = String(message?.content || '').trim();
    if (!content) continue;
    return message.role === 'user';
  }
  return false;
}

function getTriggeredAiContacts({ pendingTargets = [], activeContact = null } = {}) {
  const pendingContacts = Array.isArray(pendingTargets)
    ? pendingTargets.map((target) => target?.contact).filter(Boolean)
    : [];
  const awaitingReplyContacts = aiContacts.filter((contact) => hasAiContactAwaitingReply(contact));
  const rawContacts = pendingContacts.length
    ? [...pendingContacts, ...awaitingReplyContacts]
    : awaitingReplyContacts;
  if (!rawContacts.length && activeContact && hasAiContactAwaitingReply(activeContact)) {
    return [activeContact];
  }
  return dedupeAiContacts(rawContacts);
}

function getAiRoleInfoEntries(contacts = []) {
  return contacts.map((contact, index) => ({
    contact_id: getAiContactExternalId(contact) || index + 1,
    contact_name: contact?.name || `联系人 ${index + 1}`,
    contact_inf: String(contact?.prompt || '').trim()
  })).filter((entry) => entry.contact_name || entry.contact_inf);
}

function buildAiPendingTargetsPayload(pendingTargets = []) {
  const targetEntries = Array.isArray(pendingTargets) && pendingTargets.length
    ? pendingTargets
    : getAiPendingTargetsFromHistory();
  return targetEntries.map((target, index) => ({
    contact_id: getAiContactExternalId(target?.contact) || index + 1,
    contact_name: target?.contact?.name || `联系人 ${index + 1}`,
    messages: Array.isArray(target?.messages)
      ? target.messages.map((message) => {
        const content = String(message?.content || '').trim();
        if (!content) return null;
        return {
          speaker: 'user',
          text: content,
          time_label: getAiChatMessageExportTimeLabel(message)
        };
      }).filter(Boolean)
      : []
  })).filter((entry) => entry.messages.length);
}

function hasAiPresetPendingUserMessagesInfoBlock(blocks = []) {
  return normalizeAiPresetBlocks(blocks).some((block) => {
    if (String(block?.role || '').trim() !== '_info') return false;
    return isAiPresetPendingUserMessagesSource(block?.sourceId, block?.sourceScope);
  });
}

function getAiSmsHistoryEntries(contacts = []) {
  return contacts.map((contact, index) => ({
    contact_id: getAiContactExternalId(contact) || index + 1,
    contact_name: contact?.name || `联系人 ${index + 1}`,
    messages_history: getAiActiveContactHistory(contact.id)
      .filter((message) => !(message?.role === 'user' && message?.pending))
      .map((message) => {
        const speakerName = message.role === 'user' ? 'user' : (contact?.name || `联系人 ${index + 1}`);
        const content = String(message.content || '').trim();
        if (!content) return null;
        return {
          speaker: speakerName,
          text: content,
          time_label: getAiChatMessageExportTimeLabel(message)
        };
      })
      .filter(Boolean)
  })).filter((entry) => entry.messages_history.length);
}

function getAiPresetInfoSlotText(block, activeContact = null, { pendingTargets = [] } = {}) {
  const sourceId = String(block?.sourceId || '').trim();
  const sourceScope = getAiPresetInfoSourceScope(sourceId, block?.sourceScope);
  if (isAiPresetMapInfoSource(sourceId, sourceScope)) {
    return getAiPresetMapInfoSlotText();
  }
  if (isAiPresetItemsInfoSource(sourceId, sourceScope)) {
    return getAiPresetItemsInfoSlotText();
  }
  if (isAiPresetNewsInfoSource(sourceId, sourceScope)) {
    return getAiPresetNewsInfoSlotText();
  }
  if (isAiPresetCharsInfoSource(sourceId, sourceScope)) {
    return getAiPresetCharsInfoSlotText();
  }
  if (isAiPresetDateTimeInfoSource(sourceId, sourceScope)) {
    return getAiPresetDateTimeInfoSlotText();
  }
  if (isAiPresetWeatherInfoSource(sourceId, sourceScope)) {
    return getAiPresetWeatherInfoSlotText();
  }
  if (isAiPresetStUserInfoSource(sourceId, sourceScope)) {
    return getAiPresetStUserInfoSlotText();
  }
  if (isAiPresetSmsChatHistorySource(sourceId, sourceScope)) {
    const smsHistoryEntries = getAiSmsHistoryEntries(dedupeAiContacts(aiContacts));
    return smsHistoryEntries.length ? JSON.stringify(smsHistoryEntries, null, 2) : '[]';
  }
  if (isAiPresetPendingUserMessagesSource(sourceId, sourceScope)) {
    const pendingPayload = buildAiPendingTargetsPayload(pendingTargets);
    return JSON.stringify({ pending_user_messages: pendingPayload }, null, 2);
  }
  if (sourceId === '__role_info__') {
    const triggeredContacts = getTriggeredAiContacts({ pendingTargets, activeContact });
    const roleInfoEntries = getAiRoleInfoEntries(triggeredContacts);
    return roleInfoEntries.length ? JSON.stringify(roleInfoEntries, null, 2) : '[]';
  }
  const targetContact = aiContacts.find((contact) => contact.id === sourceId) || activeContact || null;
  if (!targetContact) return '';
  const roleInfoEntry = getAiRoleInfoEntries([targetContact])[0] || null;
  return roleInfoEntry ? JSON.stringify([roleInfoEntry], null, 2) : '[]';
}

async function getAiPresetWorldInfoSlotText(block, activeContact = null, { pendingTargets = [] } = {}) {
  const sourceId = String(block?.sourceId || '').trim();
  const sourceName = String(block?.sourceName || '').trim();
  const sourceScope = String(block?.sourceScope || '').trim();
  const configuredEntries = getAiWorldBookSettingsEntries(aiSettings);
  const configuredEntry = configuredEntries.find((entry) => String(entry?.id || '').trim() === sourceId)
    || configuredEntries.find((entry) => String(entry?.name || '').trim() === sourceName && String(entry?.scope || '').trim() === sourceScope)
    || null;
  if (configuredEntry) {
    return buildAiWorldBookTriggerMessage(configuredEntry, activeContact, { pendingTargets });
  }
  if (!sourceName) return '';
  try {
    const result = await getAiCompatWorldBook(sourceName, {
      scope: sourceScope || undefined
    });
    if (!result?.worldBook) return '';
    const entries = Array.isArray(result?.worldBook?.entries) ? result.worldBook.entries : [];
    const enabledEntries = entries.filter((entry) => entry?.enabled !== false && String(entry?.content || '').trim());
    if (!enabledEntries.length) return '';
    return [`世界书：${result?.worldBook?.name || sourceName}`, ...enabledEntries.map((entry) => {
      const entryName = String(entry?.name || '').trim();
      const entryContent = String(entry?.content || '').trim();
      return entryName ? `${entryName}：${entryContent}` : entryContent;
    })].filter(Boolean).join('\n');
  } catch (error) {
    console.warn('[短信预设] 读取世界书失败', error);
    return '';
  }
}

function getAiWorldBookSettingsEntries(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  return Array.isArray(settings.worldBookEntries) ? settings.worldBookEntries : [];
}

function getAiWorldBookEntryKeywords(entry = null) {
  if (!entry || typeof entry !== 'object') return [];
  return [
    ...(Array.isArray(entry.key) ? entry.key : []),
    ...(Array.isArray(entry.secondaryKey) ? entry.secondaryKey : [])
  ]
    .map((keyword) => String(keyword || '').trim().toLowerCase())
    .filter(Boolean);
}

function isAiWorldBookKeywordMatched(contextText = '', keyword = '') {
  const normalizedContext = String(contextText || '').trim().toLowerCase();
  const normalizedKeyword = String(keyword || '').trim().toLowerCase();
  if (!normalizedContext || !normalizedKeyword) return false;
  return normalizedContext.includes(normalizedKeyword);
}

function getAiWorldBookInfoBindingText(binding = null, activeContact = null, { pendingTargets = [] } = {}) {
  const sourceId = String(binding?.sourceId || '').trim();
  if (!sourceId) return '';
  return getAiPresetInfoSlotText({
    sourceId,
    sourceScope: String(binding?.sourceScope || '').trim()
  }, activeContact, { pendingTargets });
}

async function buildAiWorldBookTriggerMessage(entry = null, activeContact = null, { pendingTargets = [] } = {}) {
  if (!entry?.name) return '';
  const contextParts = [];
  try {
    const mainChatMessages = await buildAiMainChatHistoryMessages({
      ...aiSettings,
      mainChatContextN: entry?.mainChatContextN === '' || entry?.mainChatContextN == null ? '10' : String(entry.mainChatContextN),
      mainChatUserN: entry?.mainChatUserN === '' || entry?.mainChatUserN == null ? '' : String(entry.mainChatUserN),
      mainChatXmlRules: normalizeAiMainChatRules(entry?.mainChatXmlRules)
    });
    if (mainChatMessages.length) {
      contextParts.push(mainChatMessages.map((message) => String(message?.content || '').trim()).filter(Boolean).join('\n\n'));
    }
  } catch (error) {
    console.warn('[世界书触发] 读取主聊天上下文失败', error);
  }
  const infoBindings = Array.isArray(entry?.infoSourceBindings) ? entry.infoSourceBindings : [];
  for (const binding of infoBindings) {
    const content = getAiWorldBookInfoBindingText(binding, activeContact, { pendingTargets });
    if (content) {
      contextParts.push(content);
    }
  }
  const contextText = contextParts.filter(Boolean).join('\n\n').trim();
  if (!contextText) return '';
  try {
    const result = await getAiCompatWorldBook(String(entry.name || '').trim(), {
      scope: String(entry.scope || '').trim() || undefined
    });
    if (!result?.worldBook) return '';
    const worldBookEntries = Array.isArray(result?.worldBook?.entries) ? result.worldBook.entries : [];
    const matchedEntries = worldBookEntries
      .filter((worldBookEntry) => worldBookEntry?.enabled !== false && String(worldBookEntry?.content || '').trim())
      .filter((worldBookEntry) => getAiWorldBookEntryKeywords(worldBookEntry).some((keyword) => isAiWorldBookKeywordMatched(contextText, keyword)))
      .slice(0, 20);
    if (!matchedEntries.length) return '';
    return [
      `世界书触发：${result?.worldBook?.name || entry.name}`,
      ...matchedEntries.map((worldBookEntry) => {
        const entryName = String(worldBookEntry?.name || '').trim();
        const entryContent = String(worldBookEntry?.content || '').trim();
        return entryName ? `${entryName}：${entryContent}` : entryContent;
      })
    ].filter(Boolean).join('\n');
  } catch (error) {
    console.warn('[世界书触发] 读取世界书失败', error);
    return '';
  }
}

async function buildAiMessagesFromPreset(contact, userText, presetEntry, { pendingTargets = [] } = {}) {
  const blocks = normalizeAiPresetBlocks(presetEntry?.blocks || []);
  const messages = [];
  for (const block of blocks) {
    const role = String(block?.role || '').trim();
    if (['system', 'user', 'assistant'].includes(role)) {
      const content = String(block?.text || '').trim();
      if (content) messages.push({ role, content });
      continue;
    }
    if (role === '_context') {
      const contextMessages = await buildAiMainChatHistoryMessages();
      const content = contextMessages.map((message) => `${message.role === 'user' ? '主聊天用户' : '主聊天AI'}：${message.content}`).join('\n\n').trim();
      if (content) messages.push({ role: 'system', content });
      continue;
    }
    if (role === '_info') {
      const content = getAiPresetInfoSlotText(block, contact, { pendingTargets });
      if (content) {
        messages.push({
          role: getAiPresetInfoMessageRole(block),
          content
        });
      }
      continue;
    }
    if (role === '_worldinfo') {
      const content = await getAiPresetWorldInfoSlotText(block, contact, { pendingTargets });
      if (content) messages.push({ role: 'system', content });
    }
  }
  // 世界书内容仅在预设显式插入“世界书槽”时注入，避免设置中的世界书被全局追加到提示词末尾。
  const pendingPayload = buildAiPendingTargetsPayload(pendingTargets);
  const finalUserContent = userText.trim() || (
    pendingPayload.length && !hasAiPresetPendingUserMessagesInfoBlock(blocks)
      ? JSON.stringify({ pending_user_messages: pendingPayload }, null, 2)
      : ''
  );
  if (finalUserContent) {
    messages.push({ role: 'user', content: finalUserContent });
  }
  return messages;
}

async function fetchAiModels() {
  const modelsEndpoint = getAiModelsEndpoint(pendingAiUrl);
  const apiKey = pendingAiKey.trim();
  if (!modelsEndpoint) {
    aiConfigConnectionState = 'error';
    aiConfigStatusMessage = '连接失败(查看控制台)';
    console.error('[AI配置] 请先填写自定义端点');
    if (currentAppKey === 'settings') renderAppWindow('settings');
    return false;
  }
  if (!apiKey) {
    aiConfigConnectionState = 'error';
    aiConfigStatusMessage = '连接失败(查看控制台)';
    console.error('[AI配置] 请先填写 API Key');
    if (currentAppKey === 'settings') renderAppWindow('settings');
    return false;
  }
  aiConfigConnectionState = 'idle';
  aiConfigStatusMessage = '正在拉取模型…';
  if (currentAppKey === 'settings') renderAppWindow('settings');
  try {
    const response = await fetch(modelsEndpoint, {
      headers: {
        Authorization: `Bearer ${apiKey}`
      }
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(data?.error?.message || `拉取失败 (${response.status})`);
    }
    const models = Array.isArray(data?.data)
      ? data.data.map((item) => String(item?.id || '').trim()).filter(Boolean)
      : [];
    if (!models.length) {
      throw new Error('未获取到模型列表');
    }
    const nextModel = pendingAiModel && models.includes(pendingAiModel) ? pendingAiModel : models[0];
    saveAiSettings({
      model: nextModel,
      modelCache: models
    });

    aiConfigConnectionState = 'success';
    aiConfigStatusMessage = '连接成功';
    if (currentAppKey === 'settings') renderAppWindow('settings');
    return true;
  } catch (error) {
    aiConfigConnectionState = 'error';
    aiConfigStatusMessage = '连接失败(查看控制台)';
    console.error('[AI配置] 模型拉取失败', error);
    if (currentAppKey === 'settings') renderAppWindow('settings');
    return false;
  }
}

async function buildAiChatMessages(contact, userText, { pendingTargets = [] } = {}) {
  if (currentAppKey === 'sms') {
    const smsPresetEntry = getSmsSelectedPresetEntry(aiSettings);
    if (smsPresetEntry?.blocks?.length) {
      return buildAiMessagesFromPreset(contact, userText, smsPresetEntry, { pendingTargets });
    }
  }
  const settings = normalizeAiSettings(aiSettings);
  const systemParts = [settings.systemPrompt, contact?.prompt]
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const historyMessages = await buildAiMainChatHistoryMessages();
  const pendingPayload = buildAiPendingTargetsPayload(pendingTargets);
  return [
    ...(
      systemParts.length
        ? [{ role: 'system', content: systemParts.join('\n\n') }]
        : []
    ),
    ...historyMessages,
    {
      role: 'user',
      content: pendingPayload.length
        ? JSON.stringify({ pending_user_messages: pendingPayload }, null, 2)
        : userText.trim()
    }
  ];
}

function createSilentAiChatError(message = '') {
  const error = new Error(String(message || '').trim() || '短信发送已取消');
  error.silent = true;
  return error;
}

async function requestAiChatReply(contact, userText, { pendingTargets = [] } = {}) {
  const settings = getAiRuntimeSettings('contactChat', aiSettings);
  if (!settings.url) throw createSilentAiChatError('短信发送未绑定 API');
  if (!settings.key) throw createSilentAiChatError('短信发送未配置 API Key');
  if (!settings.model) throw createSilentAiChatError('短信发送未配置模型');
  const body = {
    model: settings.model,
    messages: await buildAiChatMessages(contact, userText, { pendingTargets }),
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

function getAiArchivableChatHistoryMap(historyMap = aiChatHistoryMap) {
  const normalizedHistoryMap = normalizeAiChatHistoryMap(historyMap);
  return Object.fromEntries(Object.entries(normalizedHistoryMap)
    .map(([contactId, messages]) => [
      contactId,
      (Array.isArray(messages) ? messages : []).filter((message) => !message?.pending)
    ])
    .filter(([, messages]) => messages.length));
}

function hasAiArchivableChatHistory(historyMap = aiChatHistoryMap) {
  return Object.values(getAiArchivableChatHistoryMap(historyMap)).some((messages) => Array.isArray(messages) && messages.length);
}

function removeArchivedMessagesFromAiChatHistory(snapshotHistoryMap, sourceHistoryMap = aiChatHistoryMap) {
  const normalizedSourceMap = normalizeAiChatHistoryMap(sourceHistoryMap);
  const archivedIdsByContact = new Map(Object.entries(snapshotHistoryMap || {}).map(([contactId, messages]) => [
    contactId,
    new Set((Array.isArray(messages) ? messages : []).map((message) => String(message?.id || '').trim()).filter(Boolean))
  ]));
  return Object.fromEntries(Object.entries(normalizedSourceMap)
    .map(([contactId, messages]) => {
      const archivedIds = archivedIdsByContact.get(contactId);
      if (!archivedIds || !archivedIds.size) {
        return [contactId, messages];
      }
      return [
        contactId,
        (Array.isArray(messages) ? messages : []).filter((message) => !archivedIds.has(String(message?.id || '').trim()))
      ];
    })
    .filter(([, messages]) => Array.isArray(messages) && messages.length));
}

function appendSmsSummaryIntoMessageContent(existingContent, summaryText) {
  const normalizedSummaryText = String(summaryText || '').trim();
  if (!normalizedSummaryText) return String(existingContent || '').trim();
  const normalizedContent = String(existingContent || '').trim();
  if (!normalizedContent) return normalizedSummaryText;
  return `${normalizedContent}\n\n${normalizedSummaryText}`.trim();
}

function isAssistantLikeSTMessage(message) {
  const rawRole = String(message?.role || '').trim().toLowerCase();
  if (rawRole === 'assistant' || rawRole === 'model') return true;
  if (rawRole === 'user' || rawRole === 'system') return false;
  return message?.is_user === false;
}

function getRawStChatMessagesForSmsSummary() {
  const ctx = getSillyTavernContext();
  return Array.isArray(ctx?.chat) ? ctx.chat : [];
}

function isExplicitlyStreamingStChatMessage(message = null) {
  if (!message || typeof message !== 'object') return false;
  const candidateObjects = [message, message?.extra].filter((item) => item && typeof item === 'object');
  return candidateObjects.some((item) => {
    if (item.streaming === true || item.isStreaming === true || item.is_streaming === true) {
      return true;
    }
    const hasGenStarted = item.gen_started != null || item.genStarted != null;
    const hasGenFinished = item.gen_finished != null || item.genFinished != null;
    return hasGenStarted && !hasGenFinished;
  });
}

async function getStChatMessagesForSmsSummary() {
  const stApi = getSTAPI();
  if (stApi?.chatHistory?.list) {
    try {
      const result = await stApi.chatHistory.list({ format: 'openai' });
      return Array.isArray(result?.messages) ? result.messages : [];
    } catch (error) {
      console.warn('[短信总结] 读取酒馆聊天楼层失败，改用上下文回退', error);
    }
  }
  return getRawStChatMessagesForSmsSummary();
}

async function getSmsSummaryTargetMessageInfo() {
  const messages = await getStChatMessagesForSmsSummary();
  const assistantIndexes = messages.reduce((indexes, message, index) => {
    if (isAssistantLikeSTMessage(message)) {
      indexes.push(index);
    }
    return indexes;
  }, []);
  if (!assistantIndexes.length) {
    return { index: -1, message: null };
  }
  const latestAssistantIndex = assistantIndexes[assistantIndexes.length - 1];
  const latestAssistantMessage = messages[latestAssistantIndex] || null;
  const latestAssistantRawMessage = getRawStChatMessagesForSmsSummary()[latestAssistantIndex] || null;
  const shouldFallbackToPreviousAssistant = assistantIndexes.length > 1
    && isStGenerationRunning
    && (isExplicitlyStreamingStChatMessage(latestAssistantMessage) || isExplicitlyStreamingStChatMessage(latestAssistantRawMessage));
  const targetIndex = shouldFallbackToPreviousAssistant
    ? assistantIndexes[assistantIndexes.length - 2]
    : latestAssistantIndex;
  return {
    index: targetIndex,
    message: messages[targetIndex] || null
  };
}

async function writeSmsSummaryToStMessageFloor(summaryText, { chatId = '' } = {}) {
  const normalizedSummaryText = String(summaryText || '').trim();
  if (!normalizedSummaryText) return false;
  const activeChatId = getCurrentSTChatId();
  if (chatId && activeChatId && chatId !== activeChatId) return false;
  const stApi = getSTAPI();
  if (!stApi?.chatHistory) return false;
  const targetInfo = await getSmsSummaryTargetMessageInfo();
  if (Number.isFinite(targetInfo.index) && targetInfo.index >= 0 && typeof stApi.chatHistory.update === 'function') {
    const nextContent = appendSmsSummaryIntoMessageContent(getTextFromSTMessage(targetInfo.message), normalizedSummaryText);
    await stApi.chatHistory.update({
      index: targetInfo.index,
      content: nextContent
    });
    return true;
  }
  if (typeof stApi.chatHistory.create === 'function') {
    await stApi.chatHistory.create({
      role: 'model',
      content: normalizedSummaryText
    });
    return true;
  }
  return false;
}

async function archiveSmsChatHistorySnapshot(snapshotHistoryMap, { chatId = '' } = {}) {
  const normalizedSnapshotValue = buildBleachPhoneChatsNormalizedValue(snapshotHistoryMap, { includePending: false });
  if (!Array.isArray(normalizedSnapshotValue.contacts) || !normalizedSnapshotValue.contacts.length) {
    return true;
  }
  const currentArchivedRawValue = await getBleachPhoneSummarizedChatsVariableValue({ expectedChatId: chatId });
  const mergedArchivedValue = mergeBleachPhoneChatsNormalizedValues(currentArchivedRawValue, normalizedSnapshotValue);
  const didSyncSummarizedVariable = await syncBleachPhoneSummarizedChatsVariable(mergedArchivedValue, { expectedChatId: chatId });
  if (didSyncSummarizedVariable) {
    const archivedRuntimeState = buildAiChatRuntimeStateFromBleachPhoneValue(mergedArchivedValue);
    aiContacts = archivedRuntimeState.contacts;
    aiSummarizedChatHistoryMap = archivedRuntimeState.historyMap;
  }
  return didSyncSummarizedVariable;
}

async function buildAiSmsSummaryMessages(contact = null) {
  const summaryPresetEntry = getSmsSelectedSummaryPresetEntry(aiSettings);
  if (!summaryPresetEntry?.blocks?.length) {
    throw createSilentAiChatError('短信总结未配置总结预设');
  }
  const messages = await buildAiMessagesFromPreset(contact, '', summaryPresetEntry, { pendingTargets: [] });
  const normalizedMessages = Array.isArray(messages)
    ? messages.filter((message) => String(message?.content || '').trim())
    : [];
  if (!normalizedMessages.length) {
    throw createSilentAiChatError('短信总结预设内容为空');
  }
  return normalizedMessages;
}

async function requestAiSmsSummaryReply(contact = null) {
  const settings = getAiRuntimeSettings('contactChat', aiSettings);
  if (!settings.url) throw createSilentAiChatError('短信总结未绑定 API');
  if (!settings.key) throw createSilentAiChatError('短信总结未配置 API Key');
  if (!settings.model) throw createSilentAiChatError('短信总结未配置模型');
  const body = {
    model: settings.model,
    messages: await buildAiSmsSummaryMessages(contact),
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

async function triggerSmsChatSummaryFromStatusBar() {
  if (currentAppKey !== 'sms' || contactView !== 'chat') return false;
  if (smsSummaryRequestStatus === 'loading' || aiChatRequestStatus === 'loading') return false;
  if (!hasAiArchivableChatHistory(aiChatHistoryMap)) {
    aiChatErrorMessage = '暂无可总结聊天';
    renderActiveAiAppWindow();
    return false;
  }
  const summaryChatId = getCurrentSTChatId();
  if (!summaryChatId) return false;
  const currentContact = getCurrentAiContact();
  const snapshotHistoryMap = getAiArchivableChatHistoryMap(aiChatHistoryMap);
  smsSummaryRequestStatus = 'loading';
  smsSummaryTargetContactId = currentContact?.id || '';
  aiChatErrorMessage = '';
  aiChatShouldScrollBottom = true;
  renderActiveAiAppWindow();
  try {
    const summaryReply = await requestAiSmsSummaryReply(currentContact);
    const didWriteSummary = await writeSmsSummaryToStMessageFloor(summaryReply, { chatId: summaryChatId });
    if (!didWriteSummary) {
      throw new Error('短信总结写入酒馆楼层失败');
    }
    const didArchive = await archiveSmsChatHistorySnapshot(snapshotHistoryMap, { chatId: summaryChatId });
    if (!didArchive) {
      throw new Error('短信总结归档失败');
    }
    const nextActiveHistoryMap = removeArchivedMessagesFromAiChatHistory(snapshotHistoryMap, aiChatHistoryMap);
    const didSyncActiveVariable = await syncBleachPhoneChatsVariableValue(buildBleachPhoneChatsVariableValue(nextActiveHistoryMap), { expectedChatId: summaryChatId });
    if (!didSyncActiveVariable) {
      throw new Error('短信总结清理未总结变量失败');
    }
    const committedActiveHistoryMap = typeof saveAiChatHistoryMapValue === 'function'
      ? saveAiChatHistoryMapValue(nextActiveHistoryMap)
      : normalizeAiChatHistoryMap(nextActiveHistoryMap);
    aiChatHistoryMap = committedActiveHistoryMap;
    smsSummaryRequestStatus = 'idle';
    smsSummaryTargetContactId = '';
    aiChatShouldScrollBottom = true;
    renderActiveAiAppWindow();
    return true;
  } catch (error) {
    smsSummaryRequestStatus = 'idle';
    smsSummaryTargetContactId = '';
    aiChatErrorMessage = error?.silent ? String(error.message || '').trim() : '总结失败';
    console.error('[短信总结] 执行失败', error);
    renderActiveAiAppWindow();
    return false;
  }
}

function flashAiMainChatRuleMode(index) {
  aiMainChatModeFlashIndex = index;
  if (aiMainChatModeFlashTimer) {
    clearTimeout(aiMainChatModeFlashTimer);
  }
  if (currentAppKey === 'settings' && settingsView === 'aiMainChatRules') {
    renderAppWindow('settings');
  }
  aiMainChatModeFlashTimer = setTimeout(() => {
    aiMainChatModeFlashIndex = -1;
    aiMainChatModeFlashTimer = null;
    if (currentAppKey === 'settings' && settingsView === 'aiMainChatRules') {
      renderAppWindow('settings');
    }
  }, 180);
}


