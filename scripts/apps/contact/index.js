// Contact 应用逻辑（从 main.js 渐进拆出）

function createAiChatMessage(role, content, { pending = false, time = null, timeLabel = '' } = {}) {
  const phoneTimeMeta = Number.isFinite(time)
    ? { time, timeLabel: String(timeLabel || '').trim() }
    : (typeof getPhoneDisplayMessageTimeMeta === 'function' ? getPhoneDisplayMessageTimeMeta() : null);
  const normalizedTime = Number.isFinite(phoneTimeMeta?.time) ? phoneTimeMeta.time : Date.now();
  const normalizedTimeLabel = String(timeLabel || '').trim()
    || String(phoneTimeMeta?.timeLabel || '').trim()
    || (typeof formatDateTimeLabel === 'function' ? formatDateTimeLabel(normalizedTime) : '');
  return {
    id: `ai_msg_${normalizedTime}_${Math.random().toString(36).slice(2, 8)}`,
    role: role === 'user' ? 'user' : 'assistant',
    content: String(content || '').trim(),
    time: normalizedTime,
    timeLabel: normalizedTimeLabel,
    pending: role === 'user' ? Boolean(pending) : false
  };
}

function getSelectedAiContact() {
  if (selectedAiContactIndex < 0 || selectedAiContactIndex >= aiContacts.length) {
    return null;
  }
  return aiContacts[selectedAiContactIndex];
}

function getCurrentAiContact() {
  if (currentAiContactIndex < 0 || currentAiContactIndex >= aiContacts.length) {
    return null;
  }
  return aiContacts[currentAiContactIndex];
}

function getAiActiveContactHistory(contactId) {
  return Array.isArray(aiChatHistoryMap[contactId]) ? aiChatHistoryMap[contactId] : [];
}

function getAiSummarizedContactHistory(contactId) {
  return Array.isArray(aiSummarizedChatHistoryMap?.[contactId]) ? aiSummarizedChatHistoryMap[contactId] : [];
}

function getAiContactHistory(contactId, { includeSummarized = true } = {}) {
  const activeHistory = getAiActiveContactHistory(contactId);
  if (!includeSummarized) {
    return activeHistory;
  }
  const summarizedHistory = getAiSummarizedContactHistory(contactId);
  if (!summarizedHistory.length) {
    return activeHistory;
  }
  if (!activeHistory.length) {
    return summarizedHistory;
  }
  const mergedMessages = [...summarizedHistory, ...activeHistory];
  const messageMap = new Map();
  mergedMessages.forEach((message, index) => {
    const messageKey = String(message?.id || '').trim() || `${contactId}_${Number.isFinite(message?.time) ? message.time : Date.now()}_${index}`;
    messageMap.set(messageKey, message);
  });
  return Array.from(messageMap.values()).sort((leftMessage, rightMessage) => {
    const leftTime = Number.isFinite(leftMessage?.time) ? leftMessage.time : 0;
    const rightTime = Number.isFinite(rightMessage?.time) ? rightMessage.time : 0;
    return leftTime - rightTime;
  });
}

function appendAiChatMessage(contactId, message) {
  const normalizedTime = Number.isFinite(message?.time) ? message.time : Date.now();
  const nextMessage = {
    ...message,
    content: String(message?.content || '').trim(),
    time: normalizedTime,
    timeLabel: String(message?.timeLabel || '').trim() || (typeof formatDateTimeLabel === 'function' ? formatDateTimeLabel(normalizedTime) : ''),
    pending: message?.role === 'user' ? Boolean(message?.pending) : false
  };
  if (!nextMessage.content) return null;
  aiChatHistoryMap[contactId] = [...getAiActiveContactHistory(contactId), nextMessage].slice(-80);
  saveAiChatHistoryMap();
  syncBleachPhoneChatsVariable();
  return nextMessage;
}

function removeAiChatMessages(contactId, messageIds = []) {
  const normalizedMessageIds = Array.from(new Set((Array.isArray(messageIds) ? messageIds : [messageIds]).map((messageId) => String(messageId || '').trim()).filter(Boolean)));
  if (!contactId || !normalizedMessageIds.length) {
    return { removedActive: 0, removedSummarized: 0 };
  }
  const messageIdSet = new Set(normalizedMessageIds);
  const previousActiveHistory = getAiActiveContactHistory(contactId);
  const nextActiveHistory = previousActiveHistory.filter((message) => !messageIdSet.has(String(message?.id || '').trim()));
  const previousSummarizedHistory = getAiSummarizedContactHistory(contactId);
  const nextSummarizedHistory = previousSummarizedHistory.filter((message) => !messageIdSet.has(String(message?.id || '').trim()));
  const removedActive = previousActiveHistory.length - nextActiveHistory.length;
  const removedSummarized = previousSummarizedHistory.length - nextSummarizedHistory.length;
  if (removedActive > 0) {
    aiChatHistoryMap[contactId] = nextActiveHistory;
    saveAiChatHistoryMap();
    syncBleachPhoneChatsVariable();
  }
  if (removedSummarized > 0) {
    aiSummarizedChatHistoryMap[contactId] = nextSummarizedHistory;
    const currentChatId = typeof getCurrentSTChatId === 'function' ? getCurrentSTChatId() : '';
    if (currentChatId && typeof syncBleachPhoneSummarizedChatsRuntimeVariable === 'function') {
      syncBleachPhoneSummarizedChatsRuntimeVariable({ expectedChatId: currentChatId });
    }
  }
  selectedAiChatMessageIds = selectedAiChatMessageIds.filter((messageId) => !messageIdSet.has(String(messageId || '').trim()));
  return { removedActive, removedSummarized };
}

function toggleAiChatMessageSelection(messageId = '') {
  const normalizedMessageId = String(messageId || '').trim();
  if (!normalizedMessageId) return selectedAiChatMessageIds;
  const selectedMessageIdSet = new Set(selectedAiChatMessageIds);
  if (selectedMessageIdSet.has(normalizedMessageId)) {
    selectedMessageIdSet.delete(normalizedMessageId);
  } else {
    selectedMessageIdSet.add(normalizedMessageId);
  }
  selectedAiChatMessageIds = Array.from(selectedMessageIdSet);
  renderActiveAiAppWindow();
  return selectedAiChatMessageIds;
}

function deleteSelectedAiChatMessage() {
  const contact = getCurrentAiContact();
  const messageIds = selectedAiChatMessageIds.map((messageId) => String(messageId || '').trim()).filter(Boolean);
  if (!contact || !messageIds.length) return false;
  const availableMessageIdSet = new Set(getAiContactHistory(contact.id).map((message) => String(message?.id || '').trim()).filter(Boolean));
  const validMessageIds = messageIds.filter((messageId) => availableMessageIdSet.has(messageId));
  if (!validMessageIds.length) {
    selectedAiChatMessageIds = [];
    renderActiveAiAppWindow();
    return false;
  }
  removeAiChatMessages(contact.id, validMessageIds);
  aiChatErrorMessage = '';
  renderActiveAiAppWindow();
  return true;
}

function getAiContactPreview(contact) {
  const history = contact ? getAiContactHistory(contact.id) : [];
  const lastMessage = history[history.length - 1];
  if (!lastMessage) return '未开始对话';
  const prefix = lastMessage.role === 'user'
    ? (lastMessage.pending ? '我(待)：' : '我：')
    : 'TA：';
  return `${prefix}${lastMessage.content.replace(/\s+/g, ' ').trim()}`;
}

function getAiContactPromptPreview(contact) {
  const prompt = String(contact?.prompt || '').replace(/\s+/g, ' ').trim();
  return prompt || '未设置提示词';
}

function formatAiChatTime(timestamp) {
  const date = new Date(Number.isFinite(timestamp) ? timestamp : Date.now());
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function focusAiContactEditorInput() {
  requestAnimationFrame(() => {
    const input = document.getElementById('ai-contact-name-input');
    input?.focus();
    input?.select?.();
  });
}

function syncAiChatInputHeight() {
  const input = document.getElementById('ai-contact-chat-input');
  if (!input) return;
  input.style.height = 'auto';
  const computedStyle = window.getComputedStyle(input);
  const lineHeight = Number.parseFloat(computedStyle.lineHeight) || 16;
  const verticalPadding = (Number.parseFloat(computedStyle.paddingTop) || 0) + (Number.parseFloat(computedStyle.paddingBottom) || 0);
  const borderSize = (Number.parseFloat(computedStyle.borderTopWidth) || 0) + (Number.parseFloat(computedStyle.borderBottomWidth) || 0);
  const singleLineHeight = lineHeight + verticalPadding + borderSize;
  const maxHeight = Math.round(lineHeight * 2 + verticalPadding + borderSize);
  const targetHeight = Math.min(input.scrollHeight, maxHeight);
  input.style.height = `${Math.max(targetHeight, singleLineHeight)}px`;
  input.style.overflowY = 'hidden';
}

function focusAiChatInput() {
  requestAnimationFrame(() => {
    const input = document.getElementById('ai-contact-chat-input');
    if (!input) return;
    syncAiChatInputHeight();
    input.focus();
    input.setSelectionRange?.(input.value.length, input.value.length);
  });
}

function renderActiveAiAppWindow() {
  if (currentAppKey === 'contact' || currentAppKey === 'sms') {
    renderAppWindow(currentAppKey);
  }
}

// ===== 短信：设置项 / API 绑定 / 预设选择 =====
function getSmsSettingsEntries() {
  return [
    { key: 'api', label: 'API' },
    { key: 'chatPreset', label: '聊天预设' },
    { key: 'summaryPreset', label: '总结预设' },
    { key: 'chatHistory', label: '聊天记录' }
  ];
}

function getSmsApiBindingProfiles() {
  const settings = normalizeAiSettings(aiSettings);
  return Array.isArray(settings.apiProfiles) ? settings.apiProfiles : [];
}

function getSmsPresetEntries() {
  const settings = normalizeAiSettings(aiSettings);
  return Array.isArray(settings.presetEntries) ? settings.presetEntries : [];
}

function syncSmsPresetSelection() {
  const presets = getSmsPresetEntries();
  currentSmsPresetId = resolveSelectedAiPresetId(normalizeAiSettings(aiSettings).selectedSmsPresetId || currentSmsPresetId, presets);
  const currentIndex = presets.findIndex((preset) => preset.id === currentSmsPresetId);
  selectedSmsPresetIndex = presets.length
    ? Math.min(
      Math.max(
        selectedSmsPresetIndex >= 0 ? selectedSmsPresetIndex : (currentIndex >= 0 ? currentIndex : 0),
        0
      ),
      presets.length - 1
    )
    : -1;
}

function syncSmsSummaryPresetSelection() {
  const presets = getSmsPresetEntries();
  currentSmsSummaryPresetId = resolveSelectedAiPresetId(normalizeAiSettings(aiSettings).selectedSmsSummaryPresetId || currentSmsSummaryPresetId || currentSmsPresetId, presets);
  const currentIndex = presets.findIndex((preset) => preset.id === currentSmsSummaryPresetId);
  selectedSmsSummaryPresetIndex = presets.length
    ? Math.min(
      Math.max(
        selectedSmsSummaryPresetIndex >= 0 ? selectedSmsSummaryPresetIndex : (currentIndex >= 0 ? currentIndex : 0),
        0
      ),
      presets.length - 1
    )
    : -1;
}

function setSmsSelectedPreset(presetId) {
  const settings = normalizeAiSettings(aiSettings);
  const nextPresetId = resolveSelectedAiPresetId(presetId, settings.presetEntries);
  aiSettings = normalizeAiSettings({
    ...settings,
    selectedSmsPresetId: nextPresetId
  });
  currentSmsPresetId = aiSettings.selectedSmsPresetId;
  persistAiSettings(aiSettings);
  return currentSmsPresetId;
}

function setSmsSelectedSummaryPreset(presetId) {
  const settings = normalizeAiSettings(aiSettings);
  const nextPresetId = resolveSelectedAiPresetId(presetId, settings.presetEntries);
  aiSettings = normalizeAiSettings({
    ...settings,
    selectedSmsSummaryPresetId: nextPresetId
  });
  currentSmsSummaryPresetId = aiSettings.selectedSmsSummaryPresetId;
  persistAiSettings(aiSettings);
  return currentSmsSummaryPresetId;
}

function syncSmsApiBindingSelection() {
  const profiles = getSmsApiBindingProfiles();
  const currentBindingId = getAiBindingProfileId('contactChat', aiSettings);
  const currentIndex = profiles.findIndex((profile) => profile.id === currentBindingId);
  selectedSmsApiProfileIndex = profiles.length
    ? Math.min(
      Math.max(
        selectedSmsApiProfileIndex >= 0 ? selectedSmsApiProfileIndex : (currentIndex >= 0 ? currentIndex : 0),
        0
      ),
      profiles.length - 1
    )
    : -1;
}

// ===== 短信：设置页导航与绑定动作 =====
function openSmsSettings() {
  smsApiBindingReturnView = contactView === 'chat' ? 'chat' : 'list';
  contactView = 'smsSettings';
  renderActiveAiAppWindow();
}

function closeSmsSettings() {
  contactView = smsApiBindingReturnView === 'chat' && currentAiContactIndex >= 0 ? 'chat' : 'list';
  smsApiBindingReturnView = 'list';
  renderActiveAiAppWindow();
}

function openSmsApiBindingList() {
  contactView = 'smsApiBinding';
  syncSmsApiBindingSelection();
  renderActiveAiAppWindow();
}

function closeSmsApiBindingList() {
  contactView = 'smsSettings';
  renderActiveAiAppWindow();
}

function openSmsSettingsPlaceholder(viewKey) {
  contactView = viewKey === 'smsChatHistory'
    ? 'smsChatHistory'
    : (viewKey === 'smsSummaryPreset' ? 'smsSummaryPreset' : 'smsPreset');
  if (contactView === 'smsPreset') {
    syncSmsPresetSelection();
  }
  if (contactView === 'smsSummaryPreset') {
    syncSmsSummaryPresetSelection();
  }
  renderActiveAiAppWindow();
}

function closeSmsSettingsPlaceholder() {
  contactView = 'smsSettings';
  renderActiveAiAppWindow();
}

function openSmsSettingsSelection() {
  const targetEntry = getSmsSettingsEntries()[selectedSmsSettingsIndex] || getSmsSettingsEntries()[0];
  if (!targetEntry) return;
  if (targetEntry.key === 'api') {
    openSmsApiBindingList();
    return;
  }
  if (targetEntry.key === 'chatHistory') {
    openSmsSettingsPlaceholder('smsChatHistory');
    return;
  }
  if (targetEntry.key === 'summaryPreset') {
    openSmsSettingsPlaceholder('smsSummaryPreset');
    return;
  }
  openSmsSettingsPlaceholder('smsPreset');
}

function bindSmsApiProfileSelection() {
  const profiles = getSmsApiBindingProfiles();
  const targetProfile = profiles[selectedSmsApiProfileIndex] || null;
  if (!targetProfile) return false;
  if (!bindAiApiProfile('contactChat', targetProfile.id)) return false;
  closeSmsApiBindingList();
  return true;
}

function bindSmsPresetSelection() {
  const presets = getSmsPresetEntries();
  const targetPreset = presets[selectedSmsPresetIndex] || null;
  if (!targetPreset) return false;
  setSmsSelectedPreset(targetPreset.id);
  closeSmsSettingsPlaceholder();
  return true;
}

function bindSmsSummaryPresetSelection() {
  const presets = getSmsPresetEntries();
  const targetPreset = presets[selectedSmsSummaryPresetIndex] || null;
  if (!targetPreset) return false;
  setSmsSelectedSummaryPreset(targetPreset.id);
  closeSmsSettingsPlaceholder();
  return true;
}

function openAiContactList() {
  contactView = 'list';
  aiChatErrorMessage = '';
  selectedAiContactIndex = aiContacts.length ? Math.min(Math.max(selectedAiContactIndex, 0), aiContacts.length - 1) : -1;
  renderActiveAiAppWindow();
}

function openAiContactEditor(index = -1) {
  const entry = index >= 0 ? aiContacts[index] : null;
  editingAiContactIndex = entry ? index : -1;
  pendingAiContactName = entry?.name || '';
  pendingAiContactPrompt = entry?.prompt || '';
  aiChatErrorMessage = '';
  contactView = 'editor';
  renderActiveAiAppWindow();
}

function closeAiContactEditor() {
  editingAiContactIndex = -1;
  pendingAiContactName = '';
  pendingAiContactPrompt = '';
  openAiContactList();
}

function saveAiContact(name, prompt) {
  const normalizedName = String(name || '').trim();
  const normalizedPrompt = String(prompt || '');
  if (!normalizedName) return false;
  const nextContacts = [...aiContacts];
  if (editingAiContactIndex >= 0 && editingAiContactIndex < nextContacts.length) {
    nextContacts[editingAiContactIndex] = {
      ...nextContacts[editingAiContactIndex],
      name: normalizedName,
      prompt: normalizedPrompt
    };
    selectedAiContactIndex = editingAiContactIndex;
  } else {
    nextContacts.push({
      id: createAiContactId(nextContacts.length),
      externalId: getNextAiContactExternalId(nextContacts),
      name: normalizedName,
      prompt: normalizedPrompt,
      createdAt: Date.now()
    });
    selectedAiContactIndex = nextContacts.length - 1;
  }
  aiContacts = nextContacts;
  saveAiContacts();
  syncBleachPhoneChatsVariable();
  pendingAiContactName = '';
  pendingAiContactPrompt = '';
  editingAiContactIndex = -1;
  contactView = 'list';
  renderActiveAiAppWindow();
  return true;
}

function deleteAiContact(index) {
  if (index < 0 || index >= aiContacts.length) return;
  const removedContact = aiContacts[index];
  aiContacts = aiContacts.filter((_, entryIndex) => entryIndex !== index);
  saveAiContacts();
  if (removedContact?.id) {
    delete aiChatHistoryMap[removedContact.id];
    delete aiSummarizedChatHistoryMap[removedContact.id];
    saveAiChatHistoryMap();
    syncBleachPhoneChatsVariable();
    const currentChatId = typeof getCurrentSTChatId === 'function' ? getCurrentSTChatId() : '';
    if (currentChatId && typeof syncBleachPhoneSummarizedChatsRuntimeVariable === 'function') {
      syncBleachPhoneSummarizedChatsRuntimeVariable({ expectedChatId: currentChatId });
    }
  }
  if (currentAiContactIndex === index) {
    currentAiContactIndex = -1;
    pendingAiChatInput = '';
    aiChatErrorMessage = '';
    aiChatRequestStatus = 'idle';
    contactView = 'list';
  } else if (currentAiContactIndex > index) {
    currentAiContactIndex -= 1;
  }
  if (selectedAiContactIndex === index) {
    selectedAiContactIndex = aiContacts.length ? Math.min(index, aiContacts.length - 1) : -1;
  } else if (selectedAiContactIndex > index) {
    selectedAiContactIndex -= 1;
  } else if (selectedAiContactIndex >= aiContacts.length) {
    selectedAiContactIndex = aiContacts.length ? aiContacts.length - 1 : -1;
  }
  renderActiveAiAppWindow();
}

// ===== 短信：聊天会话与发送 =====
function openAiContactChat(index = selectedAiContactIndex) {
  if (index < 0 || index >= aiContacts.length) return;
  currentAiContactIndex = index;
  selectedAiContactIndex = index;
  contactView = 'chat';
  pendingAiChatInput = '';
  aiChatErrorMessage = '';
  selectedAiChatMessageIds = [];
  aiChatShouldScrollBottom = true;
  renderActiveAiAppWindow();
}

function getPendingAiContactMessages(contactId) {
  return getAiActiveContactHistory(contactId).filter((message) => message.role === 'user' && message.pending);
}

function getPendingAiChatTargets() {
  return aiContacts.map((contact) => {
    const messages = getPendingAiContactMessages(contact.id);
    if (!messages.length) return null;
    return { contact, messages };
  }).filter(Boolean);
}

function markAiChatTargetsPending(targets, pending = false) {
  const targetIdsByContact = new Map(targets.map((target) => [
    target.contact.id,
    new Set(target.messages.map((message) => message.id))
  ]));
  let didChange = false;
  aiChatHistoryMap = Object.fromEntries(Object.entries(aiChatHistoryMap).map(([contactId, messages]) => {
    const targetIds = targetIdsByContact.get(contactId);
    if (!targetIds) return [contactId, messages];
    return [contactId, (Array.isArray(messages) ? messages : []).map((message) => {
      if (!targetIds.has(message.id) || message.role !== 'user') return message;
      didChange = true;
      return {
        ...message,
        pending: Boolean(pending)
      };
    })];
  }));
  if (didChange) {
    saveAiChatHistoryMap();
    syncBleachPhoneChatsVariable();
  }
  return didChange;
}

function queueAiChatMessage() {
  const contact = getCurrentAiContact();
  const userText = String(pendingAiChatInput || '').trim();
  if (!contact || !userText) return false;
  aiChatErrorMessage = '';
  pendingAiChatInput = '';
  appendAiChatMessage(contact.id, createAiChatMessage('user', userText, { pending: true }));
  aiChatShouldScrollBottom = true;
  renderActiveAiAppWindow();
  return true;
}

async function sendAiChatMessage() {
  if (aiChatRequestStatus === 'loading') return false;
  const currentContact = getCurrentAiContact();
  const pendingTargets = getPendingAiChatTargets();
  if (!pendingTargets.length) {
    aiChatErrorMessage = '';
    return false;
  }
  aiChatErrorMessage = '';
  aiChatRequestStatus = 'loading';
  aiChatShouldScrollBottom = true;
  renderActiveAiAppWindow();
  try {
    const reply = await requestAiChatReply(currentContact || pendingTargets[0].contact, '', {
      pendingTargets,
      activeContacts: pendingTargets.map((target) => target.contact)
    });
    const plainTextTarget = pendingTargets.length === 1
      ? pendingTargets[0].contact
      : (currentContact && aiContacts.some((item) => item.id === currentContact.id) ? currentContact : null);
    const parsedReply = parseAiReplyChatResponse(reply, plainTextTarget, { chatId: getCurrentSTChatId() });
    if (parsedReply.plainText && plainTextTarget && aiContacts.some((item) => item.id === plainTextTarget.id)) {
      appendAiChatMessage(plainTextTarget.id, createAiChatMessage('assistant', parsedReply.plainText));
    }
    markAiChatTargetsPending(pendingTargets, false);
    aiChatRequestStatus = 'idle';
    aiChatShouldScrollBottom = true;
    renderActiveAiAppWindow();
    return Boolean(parsedReply.plainText || parsedReply.appendedCount || parsedReply.hasChatPayload);
  } catch (error) {
    aiChatRequestStatus = 'idle';
    if (error?.silent) {
      aiChatErrorMessage = '';
    } else {
      aiChatErrorMessage = '发送失败';
      console.error('[短信] 发送失败', error);
    }
    renderActiveAiAppWindow();
    return false;
  }
}

function moveContactSelection(direction) {
  if (contactView === 'list') {
    if (!aiContacts.length) return;
    const contactList = document.getElementById('ai-contact-list');
    if (contactList) {
      aiContactListScrollTop = contactList.scrollTop;
    }
    if (direction === 'up') {
      selectedAiContactIndex = Math.max(0, selectedAiContactIndex - 1);
      renderActiveAiAppWindow();
      return;
    }
    if (direction === 'down') {
      selectedAiContactIndex = Math.min(aiContacts.length - 1, selectedAiContactIndex + 1);
      renderActiveAiAppWindow();
    }
    return;
  }

  if (contactView === 'smsSettings') {
    const settingsList = document.getElementById('sms-settings-list');
    if (settingsList) {
      smsSettingsListScrollTop = settingsList.scrollTop;
    }
    const entries = getSmsSettingsEntries();
    if (!entries.length) return;
    if (direction === 'up') {
      selectedSmsSettingsIndex = Math.max(0, selectedSmsSettingsIndex - 1);
      renderActiveAiAppWindow();
      return;
    }
    if (direction === 'down') {
      selectedSmsSettingsIndex = Math.min(entries.length - 1, selectedSmsSettingsIndex + 1);
      renderActiveAiAppWindow();
    }
    return;
  }

  if (contactView === 'smsApiBinding') {
    const profiles = getSmsApiBindingProfiles();
    const profileList = document.getElementById('sms-api-profile-list');
    if (profileList) {
      smsApiProfileListScrollTop = profileList.scrollTop;
    }
    if (!profiles.length) return;
    if (direction === 'up') {
      selectedSmsApiProfileIndex = Math.max(0, selectedSmsApiProfileIndex - 1);
      renderActiveAiAppWindow();
      return;
    }
    if (direction === 'down') {
      selectedSmsApiProfileIndex = Math.min(profiles.length - 1, selectedSmsApiProfileIndex + 1);
      renderActiveAiAppWindow();
    }
    return;
  }

  if (contactView === 'smsPreset') {
    const presets = getSmsPresetEntries();
    const presetList = document.getElementById('sms-preset-list');
    if (presetList) {
      smsPresetListScrollTop = presetList.scrollTop;
    }
    if (!presets.length) return;
    if (direction === 'up') {
      selectedSmsPresetIndex = Math.max(0, selectedSmsPresetIndex - 1);
      renderActiveAiAppWindow();
      return;
    }
    if (direction === 'down') {
      selectedSmsPresetIndex = Math.min(presets.length - 1, selectedSmsPresetIndex + 1);
      renderActiveAiAppWindow();
    }
    return;
  }

  if (contactView === 'smsSummaryPreset') {
    const presets = getSmsPresetEntries();
    const presetList = document.getElementById('sms-summary-preset-list');
    if (presetList) {
      smsSummaryPresetListScrollTop = presetList.scrollTop;
    }
    if (!presets.length) return;
    if (direction === 'up') {
      selectedSmsSummaryPresetIndex = Math.max(0, selectedSmsSummaryPresetIndex - 1);
      renderActiveAiAppWindow();
      return;
    }
    if (direction === 'down') {
      selectedSmsSummaryPresetIndex = Math.min(presets.length - 1, selectedSmsSummaryPresetIndex + 1);
      renderActiveAiAppWindow();
    }
    return;
  }

  if (contactView === 'chat') {
    const chatList = document.getElementById('ai-contact-chat-list');
    if (!chatList) return;
    const step = 22;
    const pageStep = Math.max(44, chatList.clientHeight - 36);
    if (direction === 'up') {
      chatList.scrollTop = Math.max(0, chatList.scrollTop - step);
    }
    if (direction === 'down') {
      chatList.scrollTop = Math.min(chatList.scrollHeight, chatList.scrollTop + step);
    }
    if (direction === 'left') {
      chatList.scrollTop = Math.max(0, chatList.scrollTop - pageStep);
    }
    if (direction === 'right') {
      chatList.scrollTop = Math.min(chatList.scrollHeight, chatList.scrollTop + pageStep);
    }
    aiChatScrollTop = chatList.scrollTop;
  }
}

function renderContactContent() {
  if (contactView === 'editor') {
    return `
      <div class="settings-editor contact-editor-form">
        <input class="settings-editor-field" id="ai-contact-name-input" type="text" maxlength="24" spellcheck="false" value="${escapeHtml(pendingAiContactName)}" placeholder="联系人名称">
        <textarea class="settings-editor-input" id="ai-contact-prompt-input" spellcheck="false" placeholder="角色 Prompt">${escapeHtml(pendingAiContactPrompt)}</textarea>
      </div>
    `;
  }

  if (!aiContacts.length) {
    return '<div class="app-subline">暂无联系人，使用左侧键新增联系人。</div>';
  }

  return `
    <div class="contact-saved-list" id="ai-contact-list">
      ${aiContacts.map((contact, index) => `
        <div class="contact-saved-item ${selectedAiContactIndex === index ? 'is-selected' : ''}" data-ai-contact-index="${index}">
          <div class="contact-saved-main">
            <span class="contact-saved-name">${escapeHtml(contact.name)}</span>
          </div>
          <button class="contact-delete-button" data-ai-contact-delete-index="${index}" type="button">×</button>
        </div>
      `).join('')}
    </div>
  `;
}

// ===== 短信：界面渲染 =====
function renderSmsSettingsView() {
  const entries = getSmsSettingsEntries();
  return `
    <div class="contact-saved-list" id="sms-settings-list">
      ${entries.map((entry, index) => `
        <div class="contact-saved-item sms-settings-item ${selectedSmsSettingsIndex === index ? 'is-selected' : ''}" data-sms-settings-index="${index}" data-sms-settings-key="${entry.key}">
          <div class="contact-saved-main">
            <span class="contact-saved-name">${escapeHtml(entry.label)}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSmsApiBindingView() {
  const profiles = getSmsApiBindingProfiles();
  return `
    <div class="contact-saved-list" id="sms-api-profile-list">
      ${profiles.map((profile, index) => `
        <div class="contact-saved-item sms-api-profile-item ${selectedSmsApiProfileIndex === index ? 'is-selected' : ''}" data-sms-api-profile-index="${index}">
          <div class="contact-saved-main">
            <span class="contact-saved-name">${escapeHtml(profile.name || '默认')}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSmsPresetView() {
  const presets = getSmsPresetEntries();
  if (!presets.length) {
    return '<div class="sms-settings-empty-view">暂无预设</div>';
  }
  return `
    <div class="contact-saved-list" id="sms-preset-list">
      ${presets.map((preset, index) => `
        <div class="contact-saved-item sms-preset-item ${selectedSmsPresetIndex === index ? 'is-selected' : ''}" data-sms-preset-index="${index}">
          <div class="contact-saved-main">
            <span class="contact-saved-name">${escapeHtml(preset.name || `预设 ${index + 1}`)}</span>
            <span class="contact-saved-preview">${currentSmsPresetId === preset.id ? '当前使用' : `${Array.isArray(preset.blocks) ? preset.blocks.length : 0} 个块`}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSmsSummaryPresetView() {
  const presets = getSmsPresetEntries();
  if (!presets.length) {
    return '<div class="sms-settings-empty-view">暂无预设</div>';
  }
  return `
    <div class="contact-saved-list" id="sms-summary-preset-list">
      ${presets.map((preset, index) => `
        <div class="contact-saved-item sms-preset-item ${selectedSmsSummaryPresetIndex === index ? 'is-selected' : ''}" data-sms-summary-preset-index="${index}">
          <div class="contact-saved-main">
            <span class="contact-saved-name">${escapeHtml(preset.name || `预设 ${index + 1}`)}</span>
            <span class="contact-saved-preview">${currentSmsSummaryPresetId === preset.id ? '当前使用' : `${Array.isArray(preset.blocks) ? preset.blocks.length : 0} 个块`}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSmsChatHistoryView() {
  return '<div class="sms-settings-empty-view"></div>';
}

function renderSmsChatMessages() {
  const contact = getCurrentAiContact();
  const history = contact ? getAiContactHistory(contact.id) : [];
  const summarizedMessageIds = new Set((contact ? getAiSummarizedContactHistory(contact.id) : []).map((message) => String(message?.id || '').trim()).filter(Boolean));
  const historyHtml = history.map((message) => {
    const isSummarized = summarizedMessageIds.has(String(message?.id || '').trim());
    return `
      <div class="contact-chat-row ${message.role === 'user' ? 'is-user' : 'is-assistant'}">
        <div class="contact-chat-bubble ${selectedAiChatMessageIds.includes(message.id) ? 'is-selected' : ''}${isSummarized ? ' is-summarized' : ''}" data-ai-chat-message-id="${escapeHtml(message.id)}"><span class="contact-chat-text">${escapeHtml(message.content)}</span></div>
      </div>
    `;
  }).join('');
  const loadingHtml = aiChatRequestStatus === 'loading'
    ? `
      <div class="contact-chat-row is-assistant is-loading">
        <div class="contact-chat-bubble"><span class="contact-chat-text">…</span></div>
      </div>
    `
    : '';
  const summaryLoadingHtml = smsSummaryRequestStatus === 'loading' && contact && (!smsSummaryTargetContactId || smsSummaryTargetContactId === contact.id)
    ? `
      <div class="contact-chat-row is-assistant is-loading">
        <div class="contact-chat-bubble"><span class="contact-chat-text">总结中...</span></div>
      </div>
    `
    : '';

  return `
    <div id="ai-contact-chat-list" class="contact-chat-list">
      ${historyHtml}
      ${loadingHtml}
      ${summaryLoadingHtml}
    </div>
  `;
}

function renderSmsChatComposer() {
  return `
    <div class="contact-chat-compose">
      ${aiChatErrorMessage ? `<div class="contact-chat-status">${escapeHtml(aiChatErrorMessage)}</div>` : ''}
      <textarea class="contact-chat-input" id="ai-contact-chat-input" rows="1" maxlength="240" spellcheck="false">${escapeHtml(pendingAiChatInput)}</textarea>
    </div>
  `;
}

function renderSmsChatView() {
  return `
    <div class="contact-chat">
      ${renderSmsChatMessages()}
      ${renderSmsChatComposer()}
    </div>
  `;
}

function renderSmsContactListView() {
  if (!aiContacts.length) {
    return '<div class="app-subline">暂无联系人</div>';
  }

  return `
    <div class="contact-saved-list" id="ai-contact-list">
      ${aiContacts.map((contact, index) => `
        <div class="contact-saved-item ${selectedAiContactIndex === index ? 'is-selected' : ''}" data-ai-contact-index="${index}">
          <div class="contact-saved-main">
            <span class="contact-saved-name">${escapeHtml(contact.name)}</span>
            <span class="contact-saved-preview">${escapeHtml(getAiContactPreview(contact))}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderSmsContent() {
  if (contactView === 'smsSettings') {
    return renderSmsSettingsView();
  }

  if (contactView === 'smsApiBinding') {
    return renderSmsApiBindingView();
  }

  if (contactView === 'smsPreset') {
    return renderSmsPresetView();
  }

  if (contactView === 'smsSummaryPreset') {
    return renderSmsSummaryPresetView();
  }

  if (contactView === 'smsChatHistory') {
    return renderSmsChatHistoryView();
  }

  if (contactView === 'chat') {
    return renderSmsChatView();
  }

  return renderSmsContactListView();
}


