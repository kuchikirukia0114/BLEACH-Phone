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
let isBleachPhoneChatsVariableEventsBound = false;
let aiReplyChatScheduledTimers = [];

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

function buildBleachPhoneChatsVariableValue() {
  const contacts = aiContacts.map((contact, index) => {
    const messages = Array.isArray(aiChatHistoryMap?.[contact.id]) ? aiChatHistoryMap[contact.id] : [];
    if (!messages.length) return null;
    return {
      contact_id: getAiContactExternalId(contact) || index + 1,
      internal_contact_id: contact.id,
      contact_index: index,
      contact_name: contact.name || `联系人 ${index + 1}`,
      messages: messages
        .map((message, messageIndex) => ({
          id: typeof message?.id === 'string' && message.id.trim() ? message.id.trim() : `${contact.id}_${Number.isFinite(message?.time) ? message.time : Date.now()}_${messageIndex}`,
          role: message?.role === 'user' ? 'user' : 'contact',
          content: String(message?.content || '').trim(),
          time: Number.isFinite(message?.time) ? message.time : Date.now(),
          pending: Boolean(message?.pending && message?.role === 'user')
        }))
        .filter((message) => message.content)
    };
  }).filter(Boolean);
  return JSON.stringify({
    version: 1,
    updated_at: Date.now(),
    contacts
  }, null, 2);
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
    version: Number.isFinite(parsedValue?.version) ? parsedValue.version : 1,
    updated_at: Number.isFinite(parsedValue?.updated_at) ? parsedValue.updated_at : Date.now(),
    contacts: contacts.map((entry, index) => ({
      contact_id: Number.isFinite(Number(entry?.contact_id)) ? Math.max(1, Number(entry.contact_id)) : 0,
      internal_contact_id: typeof entry?.internal_contact_id === 'string' && entry.internal_contact_id.trim()
        ? entry.internal_contact_id.trim()
        : (typeof entry?.contact_id === 'string' && !/^\d+$/.test(entry.contact_id.trim()) ? entry.contact_id.trim() : ''),
      contact_index: Number.isFinite(entry?.contact_index) ? entry.contact_index : index,
      contact_name: typeof entry?.contact_name === 'string' ? entry.contact_name.trim() : '',
      messages: Array.isArray(entry?.messages) ? entry.messages : []
    })).filter((entry) => entry.contact_id || entry.internal_contact_id || entry.contact_name || entry.messages.length)
  };
}

function applyBleachPhoneChatsVariableValue(rawValue, { render = true, persist = true } = {}) {
  const normalizedValue = normalizeBleachPhoneChatsVariableValue(rawValue);
  const nextContacts = [...aiContacts];
  const contactsById = new Map(nextContacts.map((contact) => [contact.id, contact]));
  const contactsByExternalId = new Map(nextContacts.map((contact) => [getAiContactExternalId(contact), contact]));
  const contactsByName = new Map(nextContacts.map((contact) => [String(contact?.name || '').trim(), contact]));
  const nextHistoryMap = {};

  normalizedValue.contacts.forEach((entry, index) => {
    const contactName = entry.contact_name || `联系人 ${index + 1}`;
    let contact = entry.internal_contact_id ? contactsById.get(entry.internal_contact_id) || null : null;
    if (!contact && entry.contact_id) {
      contact = contactsByExternalId.get(entry.contact_id) || null;
    }
    if (!contact && contactName) {
      contact = contactsByName.get(contactName) || null;
    }
    if (!contact) {
      contact = {
        id: entry.internal_contact_id || createAiContactId(index),
        externalId: entry.contact_id || getNextAiContactExternalId(nextContacts),
        name: contactName,
        prompt: '',
        createdAt: Date.now()
      };
      nextContacts.push(contact);
      contactsById.set(contact.id, contact);
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
        contactsById.set(contact.id, contact);
        contactsByExternalId.set(getAiContactExternalId(contact), contact);
        contactsByName.set(contact.name, contact);
      }
    }

    nextHistoryMap[contact.id] = entry.messages
      .map((message, messageIndex) => ({
        id: typeof message?.id === 'string' && message.id.trim() ? message.id.trim() : `${contact.id}_${Number.isFinite(message?.time) ? message.time : Date.now()}_${messageIndex}`,
        role: message?.role === 'user' ? 'user' : 'assistant',
        content: typeof message?.content === 'string' ? message.content : '',
        time: Number.isFinite(message?.time) ? message.time : Date.now() + messageIndex,
        pending: Boolean(message?.pending && message?.role === 'user')
      }))
      .filter((message) => message.content.trim())
      .slice(-80);
  });

  aiContacts = normalizeAiContacts(nextContacts);
  aiChatHistoryMap = normalizeAiChatHistoryMap(nextHistoryMap);
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
    const result = await stApi.variables.get({ name: BLEACH_PHONE_CHATS_VARIABLE_NAME });
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

function bindBleachPhoneChatsVariableEvents() {
  if (isBleachPhoneChatsVariableEventsBound) return true;
  const ctx = getSillyTavernContext();
  if (typeof ctx?.eventSource?.on !== 'function') return false;
  const handleChatChanged = () => {
    loadBleachPhoneChatsVariableToRuntime({ clearOnMissing: true, render: true, persist: true });
  };
  const chatChangedEvent = ctx?.eventTypes?.CHAT_CHANGED || 'chat_id_changed';
  ctx.eventSource.on(chatChangedEvent, handleChatChanged);
  if (ctx?.eventTypes?.CHAT_LOADED) {
    ctx.eventSource.on(ctx.eventTypes.CHAT_LOADED, handleChatChanged);
  }
  isBleachPhoneChatsVariableEventsBound = true;
  return true;
}

async function syncBleachPhoneChatsVariable() {
  const stApi = getSTAPI();
  if (typeof stApi?.variables?.set !== 'function') return false;
  const ctx = getSillyTavernContext();
  const currentChatId = typeof ctx?.getCurrentChatId === 'function' ? ctx.getCurrentChatId() : ctx?.chatId;
  if (!currentChatId) return false;
  try {
    await stApi.variables.set({
      name: BLEACH_PHONE_CHATS_VARIABLE_NAME,
      value: buildBleachPhoneChatsVariableValue()
    });
    return true;
  } catch (error) {
    console.warn('[短信变量] 未总结聊天变量同步失败', error);
    return false;
  }
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
    const rawRole = String(message?.role || '').toLowerCase();
    const role = rawRole === 'user' || message?.is_user ? 'user' : (rawRole === 'assistant' || rawRole === 'model' ? 'assistant' : '');
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
  pendingAiFrequencyPenalty = '';
  pendingAiPresencePenalty = '';
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
    const messages = getAiContactHistory(contact.id)
      .filter((message) => message?.role === 'user' && message?.pending)
      .map((message) => ({
        id: message.id,
        content: String(message.content || '').trim(),
        time: Number.isFinite(message?.time) ? message.time : Date.now()
      }))
      .filter((message) => message.content);
    if (!messages.length) return null;
    return { contact, messages };
  }).filter(Boolean);
}

function getAiPresetInfoSources() {
  const allHistoryCount = Object.values(aiChatHistoryMap || {}).reduce((count, messages) => count + (Array.isArray(messages) ? messages.length : 0), 0);
  const pendingTargets = getAiPendingTargetsFromHistory();
  const pendingMessageCount = pendingTargets.reduce((count, target) => count + target.messages.length, 0);
  return [
    {
      id: '__sms_chat_history__',
      name: '短信聊天历史',
      subtitle: allHistoryCount ? `完整发送 · ${allHistoryCount}条未总结记录` : '完整发送 · 暂无记录'
    },
    {
      id: '__role_info__',
      name: '角色信息',
      subtitle: '用户已发出且联系人未回复时触发'
    },
    {
      id: '__pending_user_messages__',
      name: '待发送消息',
      subtitle: pendingMessageCount ? `当前待发送 ${pendingMessageCount} 条` : '当前无待发送消息'
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

async function loadAiPresetWorldBookOptions() {
  aiPresetWorldBookStatus = '读取中...';
  aiPresetWorldBookOptions = [];
  if (currentAppKey === 'settings') renderAppWindow('settings');
  try {
    const stApi = getSTAPI();
    if (!stApi?.worldBook?.list) {
      aiPresetWorldBookStatus = '当前环境不支持';
      if (currentAppKey === 'settings') renderAppWindow('settings');
      return [];
    }
    const result = await stApi.worldBook.list();
    const nextOptions = Array.isArray(result?.worldBooks)
      ? result.worldBooks
        .map((book, index) => ({
          id: typeof book?.name === 'string' ? `${book.scope || 'global'}:${book.name}` : `book_${index}`,
          name: String(book?.name || '').trim(),
          scope: String(book?.scope || 'global').trim() || 'global',
          ownerId: String(book?.ownerId || '').trim()
        }))
        .filter((book) => book.name)
      : [];
    aiPresetWorldBookOptions = nextOptions;
    aiPresetWorldBookStatus = nextOptions.length ? '' : '暂无世界书';
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
  pendingAiPresetBlockDraft = null;
  settingsView = 'aiPromptInfoSourcePicker';
  renderActiveAiPresetWorkspace();
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
  editingAiPresetBlockIndex = targetBlock ? targetIndex : -1;
  const matchedIndex = targetBlock
    ? aiPresetWorldBookOptions.findIndex((source) => source.id === targetBlock.sourceId || (source.name === targetBlock.sourceName && source.scope === targetBlock.sourceScope))
    : -1;
  selectedAiPresetWorldBookIndex = aiPresetWorldBookOptions.length
    ? (matchedIndex >= 0
      ? matchedIndex
      : Math.min(Math.max(selectedAiPresetWorldBookIndex, 0), aiPresetWorldBookOptions.length - 1))
    : -1;
  pendingAiPresetBlockDraft = null;
  settingsView = 'aiPromptWorldBookPicker';
  renderActiveAiPresetWorkspace();
  loadAiPresetWorldBookOptions();
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
    name: `信息槽 · ${source.name}`,
    text: '',
    sourceId: source.id,
    sourceName: source.name,
    sourceScope: isAiPresetSmsChatHistorySource(source.id)
      ? 'sms_chat_history'
      : (isAiPresetPendingUserMessagesSource(source.id) ? 'pending_user_messages' : '')
  };
  if (editingAiPresetBlockIndex >= 0) {
    replaceAiPresetBlockFromDraft(nextBlock, editingAiPresetBlockIndex);
    return;
  }
  addAiPresetBlockFromDraft(nextBlock);
}

function confirmAiPresetWorldBookSelection() {
  if (!aiPresetWorldBookOptions.length || selectedAiPresetWorldBookIndex < 0) return;
  const source = aiPresetWorldBookOptions[Math.min(selectedAiPresetWorldBookIndex, aiPresetWorldBookOptions.length - 1)];
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
  if (role === '_info') return String(block?.sourceName || '').trim() || '信息';
  if (role === '_worldinfo') return String(block?.sourceName || '').trim() || '世界书';
  if (block?.name) return block.name;
  return `消息块 ${index + 1}`;
}

function getAiPresetBlockSubtitle(block) {
  const role = String(block?.role || '').trim();
  if (role === 'system') return 'system';
  if (role === 'assistant') return 'assistant';
  if (role === 'user') return 'user';
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
  return `
    <div class="screensaver-saved-list ai-preset-name-list" id="ai-preset-overview-list">
      ${presetEntries.map((entry, index) => `
        <div class="screensaver-saved-item ai-preset-name-item ${selectedAiPresetListIndex === index ? 'is-selected' : ''}" data-ai-preset-overview-index="${index}" data-ai-preset-id="${entry.id}">
          <div class="screensaver-saved-main">
            <span class="screensaver-saved-name">${escapeHtml(entry.name)}</span>
            <span class="screensaver-saved-url">${escapeHtml(entry.id === smsPresetId ? '短信' : (Array.isArray(entry.blocks) ? `${entry.blocks.length} 个块` : '0 个块'))}</span>
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
          <div class="screensaver-saved-main">
            <span class="screensaver-saved-name">${escapeHtml(source.name)}</span>
            <span class="screensaver-saved-url">${escapeHtml(source.subtitle)}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderAiPresetWorldBookPickerContent() {
  if (aiPresetWorldBookStatus && !aiPresetWorldBookOptions.length) {
    return `<div class="app-subline ai-preset-empty-line">${escapeHtml(aiPresetWorldBookStatus)}</div>`;
  }
  if (!aiPresetWorldBookOptions.length) {
    return '<div class="app-subline ai-preset-empty-line">暂无世界书</div>';
  }
  return `
    <div class="screensaver-saved-list ai-preset-picker-list" id="ai-preset-worldbook-list">
      ${aiPresetWorldBookOptions.map((source, index) => `
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
      aiPresetPreviewStatus = aiPresetPreviewText ? '已展开信息槽内容' : '暂无内容';
    } else if (role === '_worldinfo') {
      aiPresetPreviewText = await getAiPresetWorldInfoSlotText(targetBlock) || '暂无内容';
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
    sourceScope: isAiPresetSmsChatHistorySource(source.id)
      ? 'sms_chat_history'
      : (isAiPresetPendingUserMessagesSource(source.id) ? 'pending_user_messages' : '')
  }, source.name || '信息来源预览', 'aiPromptInfoSourcePicker');
}

async function openAiPresetWorldBookPreview() {
  const source = aiPresetWorldBookOptions[selectedAiPresetWorldBookIndex] || null;
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
  const history = getAiContactHistory(contact.id);
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
        return content ? { user: content } : null;
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
    messages_history: getAiContactHistory(contact.id)
      .map((message) => {
        const speakerName = message.role === 'user' ? 'user' : (contact?.name || `联系人 ${index + 1}`);
        const content = String(message.content || '').trim();
        return content ? { [speakerName]: content } : null;
      })
      .filter(Boolean)
  })).filter((entry) => entry.messages_history.length);
}

function getAiPresetInfoSlotText(block, activeContact = null, { pendingTargets = [] } = {}) {
  const sourceId = String(block?.sourceId || '').trim();
  const sourceScope = String(block?.sourceScope || '').trim();
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

async function getAiPresetWorldInfoSlotText(block) {
  const sourceName = String(block?.sourceName || '').trim();
  if (!sourceName) return '';
  const stApi = getSTAPI();
  if (typeof stApi?.worldBook?.get !== 'function') return '';
  try {
    const result = await stApi.worldBook.get({
      name: sourceName,
      scope: String(block?.sourceScope || '').trim() || undefined
    });
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
          role: isAiPresetPendingUserMessagesSource(block?.sourceId, block?.sourceScope) ? 'user' : 'system',
          content
        });
      }
      continue;
    }
    if (role === '_worldinfo') {
      const content = await getAiPresetWorldInfoSlotText(block);
      if (content) messages.push({ role: 'system', content });
    }
  }
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
  const frequencyPenalty = Number(settings.frequencyPenalty);
  const presencePenalty = Number(settings.presencePenalty);
  const topP = Number(settings.topP);
  if (settings.temperature !== '' && Number.isFinite(temperature)) {
    body.temperature = temperature;
  }
  if (settings.frequencyPenalty !== '' && Number.isFinite(frequencyPenalty)) {
    body.frequency_penalty = frequencyPenalty;
  }
  if (settings.presencePenalty !== '' && Number.isFinite(presencePenalty)) {
    body.presence_penalty = presencePenalty;
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


