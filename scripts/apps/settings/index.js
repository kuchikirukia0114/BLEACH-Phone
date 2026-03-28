// Settings 应用逻辑（从 main.js 渐进拆出）

function applyTheme(themeName) {
  currentTheme = themeName;
  selectedThemeIndex = Math.max(0, themeOptionsOrder.indexOf(themeName));
  pendingThemeIndex = selectedThemeIndex;

  saveThemePreference(currentTheme);

  document.body.classList.remove(...Object.values(themeModules));
  document.body.classList.add(themeModules[themeName] || themeModules.black);
  updateSettingsSelection();
}

function applyFontSize(sizeKey) {
  const fontScaleMap = {
    small: 1,
    medium: 1.12,
    large: 1.2,
    xlarge: 1.3
  };
  currentFontSizeKey = sizeKey;
  pendingFontSizeKey = sizeKey;

  saveFontSizePreference(currentFontSizeKey);

  document.body.style.setProperty('--ui-font-scale', String(fontScaleMap[sizeKey] || fontScaleMap.small));
  updateSettingsSelection();
}

function getScreenSaverEntryLabel(entry) {
  if (!entry) return '默认屏保';
  const label = (entry.name || entry.url || '').trim();
  return label || '默认屏保';
}

function getSelectedScreenSaverEntry() {
  if (selectedScreenSaverListIndex < 0 || selectedScreenSaverListIndex >= screenSaverEntries.length) {
    return null;
  }
  return screenSaverEntries[selectedScreenSaverListIndex];
}

function setScreenSaverVisual(url) {
  const screenSaver = document.getElementById('screen-saver');
  const screenSaverImage = document.getElementById('screen-saver-image');
  const lidOpenButton = document.getElementById('lid-open-button');
  const lidOpenThumb = document.getElementById('lid-open-thumb');
  currentScreenSaverImageUrl = (url || '').trim();

  if (!screenSaver || !screenSaverImage || !lidOpenButton || !lidOpenThumb) return;

  lidOpenButton.classList.remove('has-image');

  if (currentScreenSaverImageUrl) {
    screenSaver.classList.remove('has-custom-image');
    screenSaverImage.src = currentScreenSaverImageUrl;
    lidOpenThumb.src = currentScreenSaverImageUrl;
  } else {
    screenSaverImage.removeAttribute('src');
    lidOpenThumb.removeAttribute('src');
    screenSaver.classList.remove('has-custom-image');
  }
}

function pickRandomScreenSaverIndex() {
  if (!screenSaverEntries.length) return -1;
  if (screenSaverEntries.length === 1) return 0;

  let nextIndex = currentScreenSaverEntryIndex;
  while (nextIndex === currentScreenSaverEntryIndex) {
    nextIndex = Math.floor(Math.random() * screenSaverEntries.length);
  }
  return nextIndex;
}

function prepareRandomScreenSaver() {
  if (!screenSaverEntries.length) {
    currentScreenSaverEntryIndex = -1;
    setScreenSaverVisual('');
    return;
  }

  currentScreenSaverEntryIndex = pickRandomScreenSaverIndex();
  const entry = screenSaverEntries[currentScreenSaverEntryIndex];
  setScreenSaverVisual(entry?.url || '');
}

function saveScreenSaverEntry(name, url) {
  const normalizedName = (name || '').trim();
  const normalizedUrl = (url || '').trim();
  if (!normalizedUrl) return false;

  let nextEntries = screenSaverEntries.slice();
  const nextEntry = {
    name: normalizedName,
    url: normalizedUrl
  };

  if (editingScreenSaverIndex >= 0 && nextEntries[editingScreenSaverIndex]) {
    nextEntries[editingScreenSaverIndex] = nextEntry;
  } else {
    nextEntries.push(nextEntry);
    if (nextEntries.length > 10) {
      nextEntries = nextEntries.slice(-10);
    }
  }

  screenSaverEntries = normalizeScreenSaverEntries(nextEntries);
  selectedScreenSaverListIndex = editingScreenSaverIndex >= 0
    ? Math.min(editingScreenSaverIndex, screenSaverEntries.length - 1)
    : Math.max(0, screenSaverEntries.length - 1);
  saveScreenSaverEntries();
  pendingScreenSaverName = '';
  pendingScreenSaverImageUrl = '';
  editingScreenSaverIndex = -1;
  return true;
}

function deleteScreenSaverEntry(index) {
  if (index < 0 || index >= screenSaverEntries.length) return;

  screenSaverEntries.splice(index, 1);
  saveScreenSaverEntries();

  if (currentScreenSaverEntryIndex === index) {
    currentScreenSaverEntryIndex = -1;
    setScreenSaverVisual('');
  } else if (currentScreenSaverEntryIndex > index) {
    currentScreenSaverEntryIndex -= 1;
  }

  if (!screenSaverEntries.length) {
    selectedScreenSaverListIndex = -1;
  } else if (selectedScreenSaverListIndex > index) {
    selectedScreenSaverListIndex -= 1;
  } else if (selectedScreenSaverListIndex >= screenSaverEntries.length) {
    selectedScreenSaverListIndex = screenSaverEntries.length - 1;
  }

  updateTime();
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
}

function handleScreenSaverImageLoad() {
  const screenSaver = document.getElementById('screen-saver');
  const screenSaverImage = document.getElementById('screen-saver-image');
  const lidOpenButton = document.getElementById('lid-open-button');
  if (!screenSaver || !screenSaverImage || !lidOpenButton || !screenSaverImage.getAttribute('src')) return;
  screenSaver.classList.add('has-custom-image');
  lidOpenButton.classList.add('has-image');
}

function handleScreenSaverImageError() {
  const screenSaver = document.getElementById('screen-saver');
  const screenSaverImage = document.getElementById('screen-saver-image');
  const lidOpenButton = document.getElementById('lid-open-button');
  const lidOpenThumb = document.getElementById('lid-open-thumb');

  if (currentScreenSaverEntryIndex >= 0 && currentScreenSaverEntryIndex < screenSaverEntries.length) {
    screenSaverEntries.splice(currentScreenSaverEntryIndex, 1);
    saveScreenSaverEntries();
  }

  currentScreenSaverEntryIndex = -1;
  currentScreenSaverImageUrl = '';

  if (screenSaverImage) {
    screenSaverImage.removeAttribute('src');
  }
  if (lidOpenThumb) {
    lidOpenThumb.removeAttribute('src');
  }
  if (screenSaver) {
    screenSaver.classList.remove('has-custom-image');
  }
  if (lidOpenButton) {
    lidOpenButton.classList.remove('has-image');
  }
  if (selectedScreenSaverListIndex >= screenSaverEntries.length) {
    selectedScreenSaverListIndex = screenSaverEntries.length ? screenSaverEntries.length - 1 : -1;
  }
  updateTime();
  if (currentAppKey === 'settings') {
    renderAppWindow('settings');
  }
}

function setAppSoftkeys(left, center, right) {
  document.getElementById('app-softkey-left').textContent = left;
  document.getElementById('app-softkey-center').textContent = center;
  document.getElementById('app-softkey-right').textContent = right;
}

function focusScreenSaverInput() {
  requestAnimationFrame(() => {
    const nameInput = document.getElementById('screensaver-name-input');
    const urlInput = document.getElementById('screensaver-url-input');
    if (nameInput) {
      nameInput.value = pendingScreenSaverName;
    }
    if (!urlInput) return;
    urlInput.value = pendingScreenSaverImageUrl;
    if (nameInput && !pendingScreenSaverName) {
      nameInput.focus();
      nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);
      return;
    }
    urlInput.focus();
    urlInput.setSelectionRange(urlInput.value.length, urlInput.value.length);
  });
}

function openScreenSaverList() {
  settingsView = 'screensaverList';
  editingScreenSaverIndex = -1;
  pendingScreenSaverName = '';
  pendingScreenSaverImageUrl = '';
  selectedScreenSaverListIndex = screenSaverEntries.length
    ? Math.min(Math.max(selectedScreenSaverListIndex, 0), screenSaverEntries.length - 1)
    : -1;
  renderAppWindow('settings');
}

function closeScreenSaverList() {
  settingsView = 'list';
  selectedScreenSaverListIndex = screenSaverEntries.length ? 0 : -1;
  renderAppWindow('settings');
}

function openScreenSaverEditor(index = -1) {
  settingsView = 'screensaverEditor';
  editingScreenSaverIndex = index;

  if (editingScreenSaverIndex >= 0 && screenSaverEntries[editingScreenSaverIndex]) {
    pendingScreenSaverName = screenSaverEntries[editingScreenSaverIndex].name || '';
    pendingScreenSaverImageUrl = screenSaverEntries[editingScreenSaverIndex].url || '';
  } else {
    pendingScreenSaverName = '';
    pendingScreenSaverImageUrl = '';
    editingScreenSaverIndex = -1;
  }

  renderAppWindow('settings');
}

function closeScreenSaverEditor() {
  settingsView = 'screensaverList';
  pendingScreenSaverName = '';
  pendingScreenSaverImageUrl = '';
  editingScreenSaverIndex = -1;
  selectedScreenSaverListIndex = screenSaverEntries.length
    ? Math.min(Math.max(selectedScreenSaverListIndex, 0), screenSaverEntries.length - 1)
    : -1;
  renderAppWindow('settings');
}

function getThemeLabel(themeName) {
  return themeName === 'black' ? '天锁斩月' : '袖白雪';
}

function getFontSizeLabel(sizeKey) {
  if (sizeKey === 'medium') return '中';
  if (sizeKey === 'large') return '大';
  if (sizeKey === 'xlarge') return '特大';
  return '小';
}

function getScreenSaverLabel() {
  return screenSaverEntries.length ? `${screenSaverEntries.length}条` : '默认';
}

function getAiConfigSummaryLabel() {
  const selectedProfile = getSelectedAiApiProfile(aiSettings);
  if (!selectedProfile) return '未设';
  return selectedProfile.name || selectedProfile.model || '未设';
}

function updateSettingsSelection() {
  const rows = Array.from(document.querySelectorAll('.setting-row'));
  let selectedRow = null;
  rows.forEach((row, index) => {
    const isSelected = index === selectedSettingsIndex;
    row.classList.toggle('is-selected', isSelected);
    if (isSelected) selectedRow = row;
  });
  requestAnimationFrame(() => {
    selectedRow?.scrollIntoView?.({ block: 'nearest' });
  });
}

function moveSettingsSelection(direction) {
  if (settingsView === 'screensaverList') {
    if (!screenSaverEntries.length) return;
    if (direction === 'up') {
      selectedScreenSaverListIndex = Math.max(0, selectedScreenSaverListIndex - 1);
      renderAppWindow('settings');
      return;
    }
    if (direction === 'down') {
      selectedScreenSaverListIndex = Math.min(screenSaverEntries.length - 1, selectedScreenSaverListIndex + 1);
      renderAppWindow('settings');
    }
    return;
  }

  if (settingsView === 'aiModelList') {
    const modelCache = Array.isArray(getSelectedAiApiProfile(aiSettings)?.modelCache) ? getSelectedAiApiProfile(aiSettings).modelCache : [];
    if (!modelCache.length) return;
    if (direction === 'up') {
      selectedAiModelIndex = Math.max(0, selectedAiModelIndex - 1);
      renderAppWindow('settings');
      return;
    }
    if (direction === 'down') {
      selectedAiModelIndex = Math.min(modelCache.length - 1, selectedAiModelIndex + 1);
      renderAppWindow('settings');
    }
    return;
  }

  if (settingsView === 'aiMainChatPreview') {
    const preview = document.getElementById('ai-mainchat-preview-output');
    const body = document.getElementById('app-window-body');
    const step = 26;
    const pageStep = Math.max(50, (body?.clientHeight || 0) - 32);
    if (preview && preview.scrollHeight > preview.clientHeight) {
      if (direction === 'up') preview.scrollTop = Math.max(0, preview.scrollTop - step);
      if (direction === 'down') preview.scrollTop = Math.min(preview.scrollHeight, preview.scrollTop + step);
      if (direction === 'left') preview.scrollTop = Math.max(0, preview.scrollTop - pageStep);
      if (direction === 'right') preview.scrollTop = Math.min(preview.scrollHeight, preview.scrollTop + pageStep);
      return;
    }
    if (body) {
      if (direction === 'up') body.scrollTop = Math.max(0, body.scrollTop - step);
      if (direction === 'down') body.scrollTop = Math.min(body.scrollHeight, body.scrollTop + step);
      if (direction === 'left') body.scrollTop = Math.max(0, body.scrollTop - pageStep);
      if (direction === 'right') body.scrollTop = Math.min(body.scrollHeight, body.scrollTop + pageStep);
    }
    return;
  }

  if (settingsView === 'aiConfigList') {
    const profiles = Array.isArray(aiSettings?.apiProfiles) ? aiSettings.apiProfiles : [];
    if (!profiles.length) return;
    const currentIndex = Math.max(0, profiles.findIndex((profile) => profile.id === aiSettings?.selectedApiProfileId));
    if (direction === 'up') {
      selectAiApiProfile(profiles[Math.max(0, currentIndex - 1)].id, { persist: false });
      return;
    }
    if (direction === 'down') {
      selectAiApiProfile(profiles[Math.min(profiles.length - 1, currentIndex + 1)].id, { persist: false });
      return;
    }
    return;
  }

  if (settingsView === 'aiPromptList' || settingsView === 'aiPromptOverviewList') {
    const presetEntries = getAiPresetEntries();
    if (!presetEntries.length) return;
    if (direction === 'up') {
      selectedAiPresetListIndex = Math.max(0, selectedAiPresetListIndex - 1);
      currentAiPresetId = presetEntries[selectedAiPresetListIndex].id;
      renderAppWindow('settings');
      return;
    }
    if (direction === 'down') {
      selectedAiPresetListIndex = Math.min(presetEntries.length - 1, selectedAiPresetListIndex + 1);
      currentAiPresetId = presetEntries[selectedAiPresetListIndex].id;
      renderAppWindow('settings');
      return;
    }
    return;
  }

  if (settingsView === 'aiPromptAddType') {
    const options = getAiPresetAddTypeOptions();
    if (!options.length) return;
    if (direction === 'up') {
      selectedAiPresetAddTypeIndex = Math.max(0, selectedAiPresetAddTypeIndex - 1);
      renderAppWindow('settings');
      return;
    }
    if (direction === 'down') {
      selectedAiPresetAddTypeIndex = Math.min(options.length - 1, selectedAiPresetAddTypeIndex + 1);
      renderAppWindow('settings');
      return;
    }
    return;
  }

  if (settingsView === 'aiPromptInfoSourcePicker') {
    const sources = getAiPresetInfoSources();
    if (!sources.length) return;
    if (direction === 'up') {
      selectedAiPresetInfoSourceIndex = Math.max(0, selectedAiPresetInfoSourceIndex - 1);
      renderAppWindow('settings');
      return;
    }
    if (direction === 'down') {
      selectedAiPresetInfoSourceIndex = Math.min(sources.length - 1, selectedAiPresetInfoSourceIndex + 1);
      renderAppWindow('settings');
      return;
    }
    if (direction === 'left') {
      cycleAiPresetInfoMessageRole(-1, selectedAiPresetInfoSourceIndex);
      return;
    }
    if (direction === 'right') {
      cycleAiPresetInfoMessageRole(1, selectedAiPresetInfoSourceIndex);
      return;
    }
    return;
  }

  if (settingsView === 'aiPromptWorldBookPicker') {
    if (!aiPresetWorldBookOptions.length) return;
    if (direction === 'up') {
      selectedAiPresetWorldBookIndex = Math.max(0, selectedAiPresetWorldBookIndex - 1);
      renderAppWindow('settings');
      return;
    }
    if (direction === 'down') {
      selectedAiPresetWorldBookIndex = Math.min(aiPresetWorldBookOptions.length - 1, selectedAiPresetWorldBookIndex + 1);
      renderAppWindow('settings');
      return;
    }
    return;
  }

  if (settingsView === 'aiPromptMessageBlockEditor') {
    if (direction === 'left') {
      cycleAiPresetDraftRole(-1);
      return;
    }
    if (direction === 'right') {
      cycleAiPresetDraftRole(1);
      return;
    }
  }

  if (settingsView === 'aiPromptEditor') {
    syncAiPresetBlockSelection();
    if (!pendingAiPresetBlocks.length) return;
    if (direction === 'up') {
      selectedAiPresetBlockIndex = Math.max(0, selectedAiPresetBlockIndex - 1);
      renderAppWindow('settings');
      return;
    }
    if (direction === 'down') {
      selectedAiPresetBlockIndex = Math.min(pendingAiPresetBlocks.length - 1, selectedAiPresetBlockIndex + 1);
      renderAppWindow('settings');
      return;
    }
    if (direction === 'left') {
      moveAiPresetBlock(selectedAiPresetBlockIndex, -1);
      return;
    }
    if (direction === 'right') {
      moveAiPresetBlock(selectedAiPresetBlockIndex, 1);
      return;
    }
    return;
  }

  if (settingsView !== 'list') {
    const body = document.getElementById('app-window-body');
    if (!body) return;
    const step = 26;
    const pageStep = Math.max(50, body.clientHeight - 32);
    if (direction === 'up') body.scrollTop = Math.max(0, body.scrollTop - step);
    if (direction === 'down') body.scrollTop = Math.min(body.scrollHeight, body.scrollTop + step);
    if (direction === 'left') body.scrollTop = Math.max(0, body.scrollTop - pageStep);
    if (direction === 'right') body.scrollTop = Math.min(body.scrollHeight, body.scrollTop + pageStep);
    return;
  }

  if (direction === 'up') {
    selectedSettingsIndex = Math.max(0, selectedSettingsIndex - 1);
    updateSettingsSelection();
    return;
  }

  if (direction === 'down') {
    selectedSettingsIndex = Math.min(settingsRowOrder.length - 1, selectedSettingsIndex + 1);
    updateSettingsSelection();
    return;
  }

  if (direction === 'left' || direction === 'right') {
    const selectedRowKey = settingsRowOrder[selectedSettingsIndex];

    if (selectedRowKey === 'theme') {
      if (direction === 'left') {
        pendingThemeIndex = (pendingThemeIndex - 1 + themeOptionsOrder.length) % themeOptionsOrder.length;
      }
      if (direction === 'right') {
        pendingThemeIndex = (pendingThemeIndex + 1) % themeOptionsOrder.length;
      }
      renderAppWindow('settings');
      return;
    }

    if (selectedRowKey === 'fontSize') {
      const currentIndex = fontSizeOptionsOrder.indexOf(pendingFontSizeKey);
      const nextIndex = direction === 'left'
        ? (currentIndex - 1 + fontSizeOptionsOrder.length) % fontSizeOptionsOrder.length
        : (currentIndex + 1) % fontSizeOptionsOrder.length;
      pendingFontSizeKey = fontSizeOptionsOrder[nextIndex];
      renderAppWindow('settings');
      return;
    }
  }

  updateSettingsSelection();
}

function renderSettingsContent() {
  if (settingsView === 'aiPromptList') {
    return renderAiPresetListContent();
  }

  if (settingsView === 'aiPromptOverviewList') {
    return renderAiPresetOverviewListContent();
  }

  if (settingsView === 'aiPromptAddType') {
    return renderAiPresetAddTypePickerContent();
  }

  if (settingsView === 'aiPromptMessageBlockEditor') {
    return renderAiPresetMessageBlockEditorContent();
  }

  if (settingsView === 'aiPromptContextBlockEditor') {
    return renderAiPresetContextBlockEditorContent();
  }

  if (settingsView === 'aiPromptInfoSourcePicker') {
    return renderAiPresetInfoSourcePickerContent();
  }

  if (settingsView === 'aiPromptWorldBookPicker') {
    return renderAiPresetWorldBookPickerContent();
  }

  if (settingsView === 'aiPromptBlockPreview') {
    return renderAiPresetPreviewContent();
  }

  if (settingsView === 'aiPromptEditor') {
    return renderAiPresetEditorContent();
  }

  if (settingsView === 'aiModelEditor') {
    return `
      <div class="settings-editor">
        <input class="settings-editor-field" id="ai-model-manual-input" type="text" maxlength="120" spellcheck="false" value="${escapeHtml(pendingAiModel)}" placeholder="模型">
      </div>
    `;
  }

  if (settingsView === 'aiMainChatPreview') {
    return `
      <div class="settings-editor">
        <div class="ai-mainchat-preview" id="ai-mainchat-preview-output">${escapeHtml(aiMainChatPreviewText || '')}</div>
      </div>
      <div class="app-microline ai-mainchat-preview-status">${escapeHtml(aiMainChatPreviewStatus || '仅读取酒馆主聊天中的 AI / 用户消息')}</div>
    `;
  }

  if (settingsView === 'aiMainChatRules') {
    const rulesHtml = pendingAiMainChatXmlRules.length
      ? pendingAiMainChatXmlRules.map((rule, index) => `
          <div class="ai-mainchat-rule">
            <div class="ai-mainchat-rule-top">
              <input class="settings-editor-field ai-mainchat-rule-tag" data-ai-mainchat-rule-tag-index="${index}" type="text" maxlength="24" spellcheck="false" value="${escapeHtml(rule.tag)}" placeholder="标签名">
              <button class="screensaver-delete-button ai-mainchat-rule-delete" data-ai-mainchat-rule-delete-index="${index}" type="button">×</button>
            </div>
            <div class="ai-mainchat-rule-bottom">
              <button class="ai-mainchat-rule-mode-button ${aiMainChatModeFlashIndex === index ? 'is-flash' : ''}" data-ai-mainchat-rule-mode-toggle-index="${index}" type="button">${rule.mode === 'exclude' ? '排除最近N楼' : '最近N楼'}</button>
              <input class="settings-editor-field ai-mainchat-rule-n" data-ai-mainchat-rule-n-index="${index}" type="number" min="0" max="99" step="1" inputmode="numeric" spellcheck="false" value="${escapeHtml(rule.n)}" placeholder="N">
            </div>
          </div>
        `).join('')
      : '<div class="app-subline">无规则，AI消息将按原文读取</div>';
    return `
      <div class="ai-mainchat-rules" id="ai-mainchat-rules">${rulesHtml}</div>
    `;
  }

  if (settingsView === 'aiMainChat') {
    return `
      <div class="settings-editor">
        <div class="app-subline">最近AI消息范围</div>
        <input class="settings-editor-field" id="ai-mainchat-context-n-input" type="number" min="0" max="99" step="1" inputmode="numeric" spellcheck="false" value="${escapeHtml(pendingAiMainChatContextN)}" placeholder="最近AI消息范围">
        <div class="app-microline">空=全部，0=不读取，数字=最近N条AI消息</div>
        <div class="app-subline">最近用户消息范围</div>
        <input class="settings-editor-field" id="ai-mainchat-user-n-input" type="number" min="0" max="99" step="1" inputmode="numeric" spellcheck="false" value="${escapeHtml(pendingAiMainChatUserN)}" placeholder="最近用户消息范围">
        <div class="app-microline">空=全部，0=不发送，数字=最近N条用户消息</div>
      </div>
      <div class="settings-list">
        <button class="setting-row" id="ai-mainchat-rules-open" type="button">
          <span class="setting-row-label">XML规则</span>
          <span class="setting-row-value-wrap">
            <span class="setting-row-value">${pendingAiMainChatXmlRules.length ? `${pendingAiMainChatXmlRules.length}项` : '空'}</span>
            <span class="setting-row-arrow">›</span>
          </span>
        </button>
        <button class="setting-row" id="ai-mainchat-preview-open" type="button">
          <span class="setting-row-label">预览上下文</span>
          <span class="setting-row-value-wrap">
            <span class="setting-row-value">查看</span>
            <span class="setting-row-arrow">›</span>
          </span>
        </button>
      </div>
    `;
  }

  if (settingsView === 'aiParamConfig') {
    return `
      <div class="settings-editor">
        <div class="app-subline">仅支持 Temperature / Top P</div>
        <input class="settings-editor-field" id="ai-params-temperature-input" type="number" min="0" max="2" step="0.1" inputmode="decimal" spellcheck="false" value="${escapeHtml(pendingAiTemperature)}" placeholder="温度 0-2">
        <input class="settings-editor-field" id="ai-params-top-p-input" type="number" min="0" max="1" step="0.1" inputmode="decimal" spellcheck="false" value="${escapeHtml(pendingAiTopP)}" placeholder="Top P 0-1">
      </div>
    `;
  }

  if (settingsView === 'aiModelList') {
    const modelCache = Array.isArray(getSelectedAiApiProfile(aiSettings)?.modelCache) ? getSelectedAiApiProfile(aiSettings).modelCache : [];
    const modelListHtml = modelCache.map((model, index) => {
      const modelText = String(model || '').trim();
      const isMarquee = selectedAiModelIndex === index && shouldAiModelMarquee(modelText);
      return `
        <div class="screensaver-saved-item ${selectedAiModelIndex === index ? 'is-selected' : ''}" data-ai-model-index="${index}">
          <div class="screensaver-saved-main">
            <span class="screensaver-saved-name ${isMarquee ? 'is-marquee' : ''}" style="--network-marquee-gap:28px; --network-marquee-shift:${Math.max(modelText.length * 6.5 + 28, 0)}px;">${isMarquee ? `<span class="screensaver-saved-name-track"><span class="screensaver-saved-name-copy">${escapeHtml(modelText)}</span><span class="screensaver-saved-name-gap" aria-hidden="true"></span><span class="screensaver-saved-name-copy" aria-hidden="true">${escapeHtml(modelText)}</span></span>` : escapeHtml(modelText)}</span>
          </div>
        </div>
      `;
    }).join('');
    return modelCache.length
      ? `<div class="screensaver-saved-list" id="ai-model-list">${modelListHtml}</div>`
      : `
        <div class="app-screen-box">
          <div class="app-mainline">暂无模型</div>
          <div class="app-subline">请先连接，或返回手动输入。</div>
        </div>
      `;
  }

  if (settingsView === 'aiConfigList') {
    const savedProfiles = Array.isArray(aiSettings?.apiProfiles) ? aiSettings.apiProfiles : [];
    const selectedProfileId = aiSettings?.selectedApiProfileId || '';
    const profileListHtml = savedProfiles.length
      ? savedProfiles.map((profile) => {
          const subtitle = [profile.model || '未设模型', getAiApiHostLabel(profile.url) || profile.url || '未设端点']
            .filter(Boolean)
            .join(' · ');
          return `
            <div class="screensaver-saved-item ai-api-profile-item ${selectedProfileId === profile.id ? 'is-selected' : ''}" data-ai-api-profile-id="${profile.id}">
              <div class="screensaver-saved-main">
                <span class="screensaver-saved-name">${escapeHtml(profile.name || '默认')}</span>
                <span class="screensaver-saved-url">${escapeHtml(subtitle)}</span>
              </div>
              <button class="screensaver-delete-button" data-ai-api-delete-id="${profile.id}" type="button">×</button>
            </div>
          `;
        }).join('')
      : '<div class="app-subline ai-api-empty">暂无已保存 API，可先新增一个。</div>';
    return `
      <div class="app-mainline">${escapeHtml(aiConfigStatusMessage || 'API 列表')}</div>
      <div class="settings-list">
        <button class="setting-row" id="ai-api-create" type="button">
          <span class="setting-row-label">新增API连接</span>
          <span class="setting-row-value-wrap">
            <span class="setting-row-value">新建</span>
            <span class="setting-row-arrow">＋</span>
          </span>
        </button>
      </div>
      <div class="screensaver-saved-list ai-api-profile-list" id="ai-api-profile-list">${profileListHtml}</div>
    `;
  }

  if (settingsView === 'aiConfig') {
    const modelDisplay = getAiModelDisplayMarkup(pendingAiModel || '', '未设');
    const modelRowStateClass = aiConfigConnectionState === 'success'
      ? 'is-ready'
      : aiConfigConnectionState === 'error'
        ? 'is-error'
        : '';
    return `
      <div class="app-mainline">${escapeHtml(aiConfigStatusMessage || ((pendingAiApiName || '').trim() || '默认'))}</div>
      <div class="settings-editor">
        <input class="settings-editor-field ai-config-field" id="ai-settings-name-input" type="text" maxlength="32" spellcheck="false" value="${escapeHtml(pendingAiApiName)}" placeholder="默认">
        <input class="settings-editor-field ai-config-field" id="ai-settings-url-input" type="text" spellcheck="false" value="${escapeHtml(pendingAiUrl)}" placeholder="自定义端点">
        <input class="settings-editor-field ai-config-field" id="ai-settings-key-input" type="password" spellcheck="false" value="${escapeHtml(pendingAiKey)}" placeholder="API Key">
      </div>
      <div class="settings-list">
        <button class="setting-row ${modelRowStateClass}" id="ai-model-open" type="button">
          <span class="setting-row-label">模型</span>
          <span class="setting-row-value-wrap">
            <span class="${modelDisplay.className}" style="${modelDisplay.style}">${modelDisplay.html}</span>
            <span class="setting-row-arrow">›</span>
          </span>
        </button>
        <button class="setting-row" id="ai-params-open" type="button">
          <span class="setting-row-label">参数配置</span>
          <span class="setting-row-value-wrap">
            <span class="setting-row-value">已设</span>
            <span class="setting-row-arrow">›</span>
          </span>
        </button>
      </div>
    `;
  }

  if (settingsView === 'screensaverEditor') {
    return `
      <div class="settings-editor">
        <input class="settings-editor-field" id="screensaver-name-input" type="text" maxlength="24" spellcheck="false" placeholder="壁纸名字">
        <textarea class="settings-editor-input" id="screensaver-url-input" spellcheck="false" placeholder="图片 URL"></textarea>
      </div>
    `;
  }

  if (settingsView === 'screensaverList') {
    const savedEntriesHtml = screenSaverEntries.map((entry, index) => `
      <div class="screensaver-saved-item ${selectedScreenSaverListIndex === index ? 'is-selected' : ''}" data-screensaver-index="${index}">
        <div class="screensaver-saved-main">
          <span class="screensaver-saved-name">${escapeHtml(getScreenSaverEntryLabel(entry))}</span>
          <span class="screensaver-saved-url">${escapeHtml(entry.url)}</span>
        </div>
        <button class="screensaver-delete-button" data-screensaver-delete-index="${index}" type="button">×</button>
      </div>
    `).join('');

    return `
      <div class="screensaver-saved-list">${savedEntriesHtml}</div>
    `;
  }

  return `
    <div class="settings-list">
      <button class="setting-row ${selectedSettingsIndex === 0 ? 'is-selected' : ''}" data-setting="theme" type="button">
        <span class="setting-row-label">主题</span>
        <span class="setting-row-value-wrap">
          <span class="setting-row-value">${getThemeLabel(themeOptionsOrder[pendingThemeIndex])}</span>
          <span class="setting-row-arrow">›</span>
        </span>
      </button>
      <button class="setting-row ${selectedSettingsIndex === 1 ? 'is-selected' : ''}" data-setting="fontSize" type="button">
        <span class="setting-row-label">字号</span>
        <span class="setting-row-value-wrap">
          <span class="setting-row-value">${getFontSizeLabel(pendingFontSizeKey)}</span>
          <span class="setting-row-arrow">›</span>
        </span>
      </button>
      <button class="setting-row ${selectedSettingsIndex === 2 ? 'is-selected' : ''}" data-setting="screensaver" type="button">
        <span class="setting-row-label">屏保</span>
        <span class="setting-row-value-wrap">
          <span class="setting-row-value">${getScreenSaverLabel()}</span>
          <span class="setting-row-arrow">›</span>
        </span>
      </button>
      <button class="setting-row ${selectedSettingsIndex === 3 ? 'is-selected' : ''}" data-setting="aiPrompt" type="button">
        <span class="setting-row-label">预设</span>
        <span class="setting-row-value-wrap">
          <span class="setting-row-value">${getAiPresetSummaryLabel()}</span>
          <span class="setting-row-arrow">›</span>
        </span>
      </button>
      <button class="setting-row ${selectedSettingsIndex === 4 ? 'is-selected' : ''}" data-setting="aiPromptOverview" type="button">
        <span class="setting-row-label">提示词总览</span>
        <span class="setting-row-value-wrap">
          <span class="setting-row-value">${getAiPresetSummaryLabel()}</span>
          <span class="setting-row-arrow">›</span>
        </span>
      </button>
      <button class="setting-row ${selectedSettingsIndex === 5 ? 'is-selected' : ''}" data-setting="aiMainChat" type="button">
        <span class="setting-row-label">主聊天</span>
        <span class="setting-row-value-wrap">
          <span class="setting-row-value">${getAiMainChatSummary()}</span>
          <span class="setting-row-arrow">›</span>
        </span>
      </button>
      <button class="setting-row ${selectedSettingsIndex === 6 ? 'is-selected' : ''}" data-setting="aiConfig" type="button">
        <span class="setting-row-label">API配置</span>
        <span class="setting-row-value-wrap">
          <span class="setting-row-value">${escapeHtml(getAiConfigSummaryLabel())}</span>
          <span class="setting-row-arrow">›</span>
        </span>
      </button>
    </div>
  `;
}


