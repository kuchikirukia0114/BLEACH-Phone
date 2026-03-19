// Data 应用逻辑

const DATA_DEFAULT_PRESET_ID = '__default__';

function normalizeDataCategoryKey(categoryKey = 'records') {
  if (categoryKey === 'music') return 'music';
  if (categoryKey === 'preset') return 'preset';
  return 'records';
}

function isAiPresetDataCategory(categoryKey = currentDataCategoryKey) {
  return normalizeDataCategoryKey(categoryKey) === 'preset';
}

function getDataCategoryLabel(categoryKey) {
  const safeCategoryKey = normalizeDataCategoryKey(categoryKey);
  if (safeCategoryKey === 'music') return '音乐';
  if (safeCategoryKey === 'preset') return '预设';
  return '影音';
}

function getCurrentDataItems(categoryKey = currentDataCategoryKey) {
  const safeCategoryKey = normalizeDataCategoryKey(categoryKey);
  if (safeCategoryKey === 'preset') return [];
  return safeCategoryKey === 'music'
    ? normalizeMusicEntries(musicEntries)
    : normalizeNetworkVideoEntries(networkVideoEntries);
}

function getDataPresetEntries(categoryKey = currentDataCategoryKey) {
  const safeCategoryKey = normalizeDataCategoryKey(categoryKey);
  if (safeCategoryKey === 'preset') {
    return [];
  }
  const presets = dataPresets && typeof dataPresets === 'object' ? dataPresets : {};
  return Array.isArray(presets[safeCategoryKey]) ? presets[safeCategoryKey] : [];
}

function getDefaultDataPreset(categoryKey = currentDataCategoryKey) {
  const safeCategoryKey = normalizeDataCategoryKey(categoryKey);
  return {
    id: DATA_DEFAULT_PRESET_ID,
    name: '默认',
    items: getCurrentDataItems(safeCategoryKey),
    createdAt: 0
  };
}

function getAllDataPresetEntries(categoryKey = currentDataCategoryKey) {
  const safeCategoryKey = normalizeDataCategoryKey(categoryKey);
  if (safeCategoryKey === 'preset') {
    return getAiPresetEntries();
  }
  return [getDefaultDataPreset(safeCategoryKey), ...getDataPresetEntries(safeCategoryKey)];
}

function getActiveDataPresetId(categoryKey = currentDataCategoryKey) {
  const safeCategoryKey = normalizeDataCategoryKey(categoryKey);
  if (safeCategoryKey === 'preset') {
    return '';
  }
  const nextIds = dataActivePresetIds && typeof dataActivePresetIds === 'object' ? dataActivePresetIds : {};
  return typeof nextIds[safeCategoryKey] === 'string' && nextIds[safeCategoryKey].trim()
    ? nextIds[safeCategoryKey].trim()
    : DATA_DEFAULT_PRESET_ID;
}

function setActiveDataPresetId(categoryKey = currentDataCategoryKey, presetId = DATA_DEFAULT_PRESET_ID) {
  const safeCategoryKey = normalizeDataCategoryKey(categoryKey);
  if (safeCategoryKey === 'preset') {
    return dataActivePresetIds;
  }
  const nextPresetId = typeof presetId === 'string' && presetId.trim() ? presetId.trim() : DATA_DEFAULT_PRESET_ID;
  dataActivePresetIds = normalizeDataActivePresetIds({
    ...dataActivePresetIds,
    [safeCategoryKey]: nextPresetId
  });
  saveDataActivePresetIds();
  return dataActivePresetIds;
}

function markCurrentDataAsDefaultPreset(categoryKey = currentDataCategoryKey) {
  const safeCategoryKey = normalizeDataCategoryKey(categoryKey);
  if (safeCategoryKey === 'preset') return;
  setActiveDataPresetId(safeCategoryKey, DATA_DEFAULT_PRESET_ID);
  if (currentAppKey === 'data' && currentDataCategoryKey === safeCategoryKey) {
    renderAppWindow('data');
  }
}

function getCurrentDataPreset() {
  return getAllDataPresetEntries(currentDataCategoryKey).find((preset) => preset.id === currentDataPresetId) || null;
}

function syncCurrentDataPresetSelection() {
  const presets = getAllDataPresetEntries(currentDataCategoryKey);
  if (!presets.length) {
    currentDataPresetId = isAiPresetDataCategory(currentDataCategoryKey) ? '' : DATA_DEFAULT_PRESET_ID;
    return;
  }
  const currentPreset = presets.find((preset) => preset.id === currentDataPresetId);
  if (!currentPreset) {
    currentDataPresetId = isAiPresetDataCategory(currentDataCategoryKey)
      ? (presets[0]?.id || '')
      : getActiveDataPresetId(currentDataCategoryKey);
  }
  if (!presets.some((preset) => preset.id === currentDataPresetId)) {
    currentDataPresetId = presets[0].id;
  }
}

function getDataImportPayloadName(payload, fallbackName = '') {
  const explicitName = String(payload?.name || payload?.title || '').trim();
  if (explicitName) return explicitName;
  const normalizedFallback = String(fallbackName || '').trim().replace(/\.json$/i, '');
  if (normalizedFallback) return normalizedFallback;
  return isAiPresetDataCategory(currentDataCategoryKey)
    ? '预设'
    : `${getDataCategoryLabel(currentDataCategoryKey)}预设`;
}

function focusDataPresetEditorInput() {
  requestAnimationFrame(() => {
    const nameInput = document.getElementById('data-preset-name-input');
    const itemsInput = document.getElementById('data-preset-items-input');
    if (nameInput) {
      nameInput.value = pendingDataPresetName;
    }
    if (itemsInput) {
      itemsInput.value = pendingDataPresetItemsJson;
    }
    if (nameInput && !pendingDataPresetName) {
      nameInput.focus();
      nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);
      return;
    }
    itemsInput?.focus();
    itemsInput?.setSelectionRange?.(itemsInput.value.length, itemsInput.value.length);
  });
}

function openDataPresetList(categoryKey = dataCategoryOrder[selectedDataCategoryIndex] || 'records') {
  currentDataCategoryKey = normalizeDataCategoryKey(categoryKey);
  dataView = 'presetList';
  settingsView = '';
  currentDataPresetId = isAiPresetDataCategory(currentDataCategoryKey)
    ? (getAllDataPresetEntries(currentDataCategoryKey)[0]?.id || '')
    : getActiveDataPresetId(currentDataCategoryKey);
  dataPresetListScrollTop = 0;
  dataDetailScrollTop = 0;
  editingDataPresetId = '';
  pendingDataPresetName = '';
  pendingDataPresetItemsJson = '';
  syncCurrentDataPresetSelection();
  renderAppWindow('data');
}

function closeDataPresetList() {
  dataView = 'categoryList';
  settingsView = '';
  currentDataPresetId = '';
  dataPresetListScrollTop = 0;
  dataDetailScrollTop = 0;
  editingDataPresetId = '';
  pendingDataPresetName = '';
  pendingDataPresetItemsJson = '';
  renderAppWindow('data');
}

function syncDataAiPresetDetailState(presetId = currentDataPresetId) {
  const presetEntries = getAiPresetEntries();
  const targetPreset = getAiPresetEntryById(presetId, { presetEntries }) || presetEntries[0] || null;
  if (!targetPreset) return null;
  currentAiPresetId = targetPreset.id;
  pendingAiPresetEntries = presetEntries;
  pendingAiPresetName = targetPreset.name || '';
  pendingAiPresetBlocks = normalizeAiPresetBlocks(targetPreset.blocks);
  selectedAiPresetListIndex = Math.max(0, presetEntries.findIndex((entry) => entry.id === targetPreset.id));
  selectedAiPresetBlockIndex = pendingAiPresetBlocks.length
    ? Math.min(Math.max(selectedAiPresetBlockIndex, 0), pendingAiPresetBlocks.length - 1)
    : -1;
  resetAiPresetBlockDraftState();
  return targetPreset;
}

function openDataPresetDetail(presetId = currentDataPresetId) {
  const presets = getAllDataPresetEntries(currentDataCategoryKey);
  const preset = presets.find((entry) => entry.id === presetId) || presets[0] || null;
  if (!preset) return;
  currentDataPresetId = preset.id;
  if (isAiPresetDataCategory(currentDataCategoryKey)) {
    if (!syncDataAiPresetDetailState(currentDataPresetId)) return;
    settingsView = '';
  }
  dataView = 'presetDetail';
  dataDetailScrollTop = 0;
  renderAppWindow('data');
}

function closeDataPresetDetail() {
  dataView = 'presetList';
  dataDetailScrollTop = 0;
  settingsView = '';
  renderAppWindow('data');
}

function openDataPresetEditor(presetId = currentDataPresetId) {
  const preset = getAllDataPresetEntries(currentDataCategoryKey).find((entry) => entry.id === presetId) || null;
  if (!preset) return;
  editingDataPresetId = preset.id;
  pendingDataPresetName = preset.name || '';
  pendingDataPresetItemsJson = JSON.stringify(preset.items || [], null, 2);
  dataView = 'presetEditor';
  renderAppWindow('data');
}

function closeDataPresetEditor() {
  editingDataPresetId = '';
  pendingDataPresetName = '';
  pendingDataPresetItemsJson = '';
  dataView = 'presetDetail';
  renderAppWindow('data');
}

function applyDataPreset(preset = getCurrentDataPreset()) {
  if (!preset || isAiPresetDataCategory(currentDataCategoryKey)) return false;
  if (currentDataCategoryKey === 'music') {
    musicEntries = normalizeMusicEntries(preset.items);
    selectedMusicListIndex = musicEntries.length ? 0 : -1;
    musicListScrollTop = 0;
    saveMusicEntries();
  } else {
    networkVideoEntries = normalizeNetworkVideoEntries(preset.items);
    selectedNetworkVideoListIndex = networkVideoEntries.length ? 0 : -1;
    networkVideoListScrollTop = 0;
    saveNetworkVideoEntries();
  }
  setActiveDataPresetId(currentDataCategoryKey, preset.id || DATA_DEFAULT_PRESET_ID);
  dataStatusMessage = `已应用 ${preset.name || '预设'}`;
  renderAppWindow('data');
  return true;
}

function buildDataPresetExportPayload(preset = getCurrentDataPreset()) {
  if (!preset) return null;
  const safeCategoryKey = currentDataCategoryKey === 'music' ? 'music' : 'records';
  return {
    type: 'bleach-phone-data',
    version: 1,
    category: safeCategoryKey,
    name: preset.name || `${getDataCategoryLabel(safeCategoryKey)}预设`,
    exportedAt: new Date().toISOString(),
    [safeCategoryKey]: (preset.items || []).map((entry) => {
      if (safeCategoryKey === 'music') {
        const nextEntry = {
          name: String(entry?.name || '').trim(),
          url: String(entry?.url || '').trim()
        };
        const image = String(entry?.coverUrl || entry?.image || '').trim();
        if (image) {
          nextEntry.image = image;
        }
        return nextEntry;
      }
      return {
        name: String(entry?.name || '').trim(),
        url: String(entry?.url || '').trim()
      };
    })
  };
}

function buildAiPresetExportPayload(preset = getCurrentDataPreset()) {
  if (!preset) return null;
  return {
    type: 'bleach-phone-ai-preset',
    version: 1,
    name: preset.name || '预设',
    exportedAt: new Date().toISOString(),
    preset: {
      name: preset.name || '预设',
      blocks: normalizeAiPresetBlocks(preset.blocks)
    }
  };
}

function exportCurrentDataPreset() {
  const preset = getCurrentDataPreset();
  if (!preset) return false;
  try {
    const payload = isAiPresetDataCategory(currentDataCategoryKey)
      ? buildAiPresetExportPayload(preset)
      : buildDataPresetExportPayload(preset);
    const downloadBaseName = String(preset.name || (isAiPresetDataCategory(currentDataCategoryKey) ? 'ai-preset' : 'data-preset')).trim() || 'preset';
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${downloadBaseName}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    dataStatusMessage = `已导出 ${preset.name || '预设'}`;
    renderAppWindow('data');
    return true;
  } catch (error) {
    dataStatusMessage = '导出失败';
    console.error('[数据] 导出失败', error);
    renderAppWindow('data');
    return false;
  }
}

function getImportedDataItems(payload, categoryKey = currentDataCategoryKey) {
  const safeCategoryKey = categoryKey === 'music' ? 'music' : 'records';
  if (Array.isArray(payload)) {
    return payload;
  }
  const aliasKeys = safeCategoryKey === 'music'
    ? ['music', 'musicEntries']
    : ['records', 'videos', 'networkVideoEntries'];
  for (const key of aliasKeys) {
    if (Array.isArray(payload?.[key])) {
      return payload[key];
    }
  }
  return null;
}

function normalizeImportedDataItems(entries, categoryKey = currentDataCategoryKey) {
  const safeCategoryKey = categoryKey === 'music' ? 'music' : 'records';
  if (safeCategoryKey === 'music') {
    return normalizeMusicEntries((Array.isArray(entries) ? entries : []).map((entry) => ({
      name: typeof entry?.name === 'string' ? entry.name : '',
      url: typeof entry?.url === 'string' ? entry.url : '',
      coverUrl: typeof entry?.image === 'string'
        ? entry.image
        : (typeof entry?.coverUrl === 'string' ? entry.coverUrl : '')
    })));
  }
  return normalizeNetworkVideoEntries((Array.isArray(entries) ? entries : []).map((entry) => ({
    name: typeof entry?.name === 'string' ? entry.name : '',
    url: typeof entry?.url === 'string' ? entry.url : ''
  })));
}

function saveImportedDataPreset(payload, fallbackName = '') {
  const rawItems = getImportedDataItems(payload, currentDataCategoryKey);
  if (!rawItems) {
    throw new Error('JSON 格式不正确');
  }
  const items = normalizeImportedDataItems(rawItems, currentDataCategoryKey);
  const presetList = getDataPresetEntries(currentDataCategoryKey).slice();
  const nextPreset = normalizeDataPresetEntry({
    name: getDataImportPayloadName(payload, fallbackName),
    items,
    createdAt: Date.now()
  }, currentDataCategoryKey, presetList.length);
  presetList.push(nextPreset);
  dataPresets = normalizeDataPresets({
    ...dataPresets,
    [currentDataCategoryKey]: presetList
  });
  saveDataPresets();
  currentDataPresetId = nextPreset.id;
  dataStatusMessage = `已导入 ${nextPreset.name}`;
  return nextPreset;
}

function deleteDataPreset(presetId = currentDataPresetId) {
  const targetPresetId = String(presetId || '').trim();
  if (!targetPresetId || targetPresetId === DATA_DEFAULT_PRESET_ID) {
    return false;
  }

  const presetList = getDataPresetEntries(currentDataCategoryKey).slice();
  const targetIndex = presetList.findIndex((preset) => preset.id === targetPresetId);
  if (targetIndex < 0) {
    return false;
  }

  const [removedPreset] = presetList.splice(targetIndex, 1);
  dataPresets = normalizeDataPresets({
    ...dataPresets,
    [currentDataCategoryKey]: presetList
  });
  saveDataPresets();

  if (getActiveDataPresetId(currentDataCategoryKey) === targetPresetId) {
    setActiveDataPresetId(currentDataCategoryKey, DATA_DEFAULT_PRESET_ID);
  }

  if (currentDataPresetId === targetPresetId) {
    currentDataPresetId = presetList[targetIndex]?.id || presetList[targetIndex - 1]?.id || DATA_DEFAULT_PRESET_ID;
  }

  syncCurrentDataPresetSelection();
  dataStatusMessage = `已删除 ${removedPreset?.name || '预设'}`;

  if (currentAppKey === 'data') {
    renderAppWindow('data');
  }
  return true;
}

function getAiPresetImportSource(payload) {
  if (payload?.preset && typeof payload.preset === 'object') {
    return payload.preset;
  }
  return payload && typeof payload === 'object' ? payload : null;
}

function saveImportedAiPreset(payload, fallbackName = '') {
  const source = getAiPresetImportSource(payload);
  const blocks = Array.isArray(source?.blocks)
    ? source.blocks
    : (Array.isArray(payload?.presetBlocks) ? payload.presetBlocks : null);
  if (!blocks) {
    throw new Error('JSON 格式不正确');
  }
  const currentSettings = normalizeAiSettings(aiSettings);
  const presetEntries = normalizeAiPresetEntries(currentSettings.presetEntries, currentSettings);
  if (presetEntries.length >= 20) {
    throw new Error('预设已满');
  }
  const nextPreset = normalizeAiPresetEntry({
    name: getDataImportPayloadName(source || payload, fallbackName),
    blocks: normalizeAiPresetBlocks(blocks)
  }, presetEntries.length);
  aiSettings = normalizeAiSettings({
    ...currentSettings,
    presetEntries: [...presetEntries, nextPreset],
    selectedPresetId: currentSettings.selectedPresetId,
    selectedSmsPresetId: currentSettings.selectedSmsPresetId
  });
  setPendingAiSettings(aiSettings);
  persistAiSettings(aiSettings);
  currentDataPresetId = nextPreset.id;
  dataStatusMessage = `已导入 ${nextPreset.name}`;
  return nextPreset;
}

async function importDataPresetFile(file) {
  if (!file) return false;
  try {
    const text = await file.text();
    const payload = JSON.parse(text);
    if (isAiPresetDataCategory(currentDataCategoryKey)) {
      saveImportedAiPreset(payload, file.name);
    } else {
      saveImportedDataPreset(payload, file.name);
    }
    dataView = 'presetList';
    renderAppWindow('data');
    return true;
  } catch (error) {
    dataStatusMessage = error?.message || '导入失败';
    console.error('[数据] 导入失败', error);
    renderAppWindow('data');
    return false;
  }
}

function openDataImportPicker() {
  const input = document.createElement('input');
  input.type = 'file';
  input.accept = '.json,application/json';
  input.style.display = 'none';
  input.addEventListener('change', () => {
    const [file] = Array.from(input.files || []);
    importDataPresetFile(file);
    input.remove();
  }, { once: true });
  document.body.appendChild(input);
  input.click();
}

function saveDataPresetEditor() {
  const parsedItems = JSON.parse(String(pendingDataPresetItemsJson || '[]'));
  if (!Array.isArray(parsedItems)) {
    throw new Error('条目内容必须是 JSON 数组');
  }
  const normalizedItems = normalizeImportedDataItems(parsedItems, currentDataCategoryKey);

  if (editingDataPresetId === DATA_DEFAULT_PRESET_ID) {
    if (currentDataCategoryKey === 'music') {
      musicEntries = normalizedItems;
      selectedMusicListIndex = musicEntries.length ? 0 : -1;
      musicListScrollTop = 0;
      saveMusicEntries();
    } else {
      networkVideoEntries = normalizedItems;
      selectedNetworkVideoListIndex = networkVideoEntries.length ? 0 : -1;
      networkVideoListScrollTop = 0;
      saveNetworkVideoEntries();
    }
    setActiveDataPresetId(currentDataCategoryKey, DATA_DEFAULT_PRESET_ID);
    currentDataPresetId = DATA_DEFAULT_PRESET_ID;
    dataStatusMessage = '已保存 默认';
    closeDataPresetEditor();
    return true;
  }

  const presetList = getDataPresetEntries(currentDataCategoryKey).slice();
  const targetIndex = presetList.findIndex((preset) => preset.id === editingDataPresetId);
  if (targetIndex < 0) return false;
  const nextPreset = normalizeDataPresetEntry({
    ...presetList[targetIndex],
    name: String(pendingDataPresetName || '').trim(),
    items: normalizedItems
  }, currentDataCategoryKey, targetIndex);
  presetList[targetIndex] = nextPreset;
  dataPresets = normalizeDataPresets({
    ...dataPresets,
    [currentDataCategoryKey]: presetList
  });
  saveDataPresets();
  currentDataPresetId = nextPreset.id;
  if (getActiveDataPresetId(currentDataCategoryKey) === nextPreset.id) {
    applyDataPreset(nextPreset);
  }
  dataStatusMessage = `已保存 ${nextPreset.name}`;
  closeDataPresetEditor();
  return true;
}

function confirmDataSelection() {
  if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptMessageBlockEditor') {
    const blockNameInput = document.getElementById('ai-preset-block-name-input');
    const blockTextInput = document.getElementById('ai-preset-block-text-input');
    pendingAiPresetBlockDraft = {
      ...(pendingAiPresetBlockDraft || {}),
      name: blockNameInput?.value || '',
      text: blockTextInput?.value || ''
    };
    saveAiPresetDraftMessageBlock();
    return;
  }
  if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptContextBlockEditor') {
    saveAiPresetContextBlock();
    return;
  }
  if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptInfoSourcePicker') {
    confirmAiPresetInfoSourceSelection();
    return;
  }
  if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptWorldBookPicker') {
    confirmAiPresetWorldBookSelection();
    return;
  }
  if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptAddType') {
    confirmAiPresetAddTypeSelection();
    return;
  }
  if (dataView === 'presetDetail') {
    if (isAiPresetDataCategory(currentDataCategoryKey)) {
      openAiPresetBlockEditor(selectedAiPresetBlockIndex);
      return;
    }
    openDataPresetEditor();
    return;
  }
  if (dataView === 'presetEditor') {
    try {
      saveDataPresetEditor();
    } catch (error) {
      dataStatusMessage = error?.message || '保存失败';
      renderAppWindow('data');
    }
    return;
  }
  if (dataView === 'presetList') {
    if (isAiPresetDataCategory(currentDataCategoryKey)) {
      openDataPresetDetail(currentDataPresetId);
      return;
    }
    applyDataPreset();
    return;
  }
  openDataPresetList(dataCategoryOrder[selectedDataCategoryIndex] || 'records');
}

function moveDataSelection(direction) {
  if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptBlockPreview') {
    const preview = document.getElementById('ai-preset-preview-output');
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

  if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptInfoSourcePicker') {
    const sources = getAiPresetInfoSources();
    if (!sources.length) return;
    if (direction === 'up') selectedAiPresetInfoSourceIndex = Math.max(0, selectedAiPresetInfoSourceIndex - 1);
    if (direction === 'down') selectedAiPresetInfoSourceIndex = Math.min(sources.length - 1, selectedAiPresetInfoSourceIndex + 1);
    renderAppWindow('data');
    return;
  }

  if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptWorldBookPicker') {
    if (!aiPresetWorldBookOptions.length) return;
    if (direction === 'up') selectedAiPresetWorldBookIndex = Math.max(0, selectedAiPresetWorldBookIndex - 1);
    if (direction === 'down') selectedAiPresetWorldBookIndex = Math.min(aiPresetWorldBookOptions.length - 1, selectedAiPresetWorldBookIndex + 1);
    renderAppWindow('data');
    return;
  }

  if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptAddType') {
    const options = getAiPresetAddTypeOptions();
    if (!options.length) return;
    if (direction === 'up') selectedAiPresetAddTypeIndex = Math.max(0, selectedAiPresetAddTypeIndex - 1);
    if (direction === 'down') selectedAiPresetAddTypeIndex = Math.min(options.length - 1, selectedAiPresetAddTypeIndex + 1);
    renderAppWindow('data');
    return;
  }

  if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptMessageBlockEditor') {
    if (direction === 'left') cycleAiPresetDraftRole(-1);
    if (direction === 'right') cycleAiPresetDraftRole(1);
    return;
  }

  if (dataView === 'presetDetail') {
    const detailList = document.getElementById('data-entry-list');
    if (!detailList) return;
    if (isAiPresetDataCategory(currentDataCategoryKey) && !settingsView) {
      const blocks = normalizeAiPresetBlocks(pendingAiPresetBlocks);
      if (!blocks.length) return;
      if (direction === 'up') {
        selectedAiPresetBlockIndex = Math.max(0, selectedAiPresetBlockIndex - 1);
        renderAppWindow('data');
        return;
      }
      if (direction === 'down') {
        selectedAiPresetBlockIndex = Math.min(blocks.length - 1, selectedAiPresetBlockIndex + 1);
        renderAppWindow('data');
        return;
      }
    }
    const step = 22;
    const pageStep = Math.max(44, detailList.clientHeight - 36);
    if (direction === 'up') detailList.scrollTop = Math.max(0, detailList.scrollTop - step);
    if (direction === 'down') detailList.scrollTop = Math.min(detailList.scrollHeight, detailList.scrollTop + step);
    if (direction === 'left') detailList.scrollTop = Math.max(0, detailList.scrollTop - pageStep);
    if (direction === 'right') detailList.scrollTop = Math.min(detailList.scrollHeight, detailList.scrollTop + pageStep);
    dataDetailScrollTop = detailList.scrollTop;
    return;
  }

  if (dataView === 'presetList') {
    const presets = getAllDataPresetEntries(currentDataCategoryKey);
    if (!presets.length) return;
    const presetList = document.getElementById('data-preset-list');
    if (presetList) {
      dataPresetListScrollTop = presetList.scrollTop;
    }
    const currentIndex = Math.max(0, presets.findIndex((preset) => preset.id === currentDataPresetId));
    if (direction === 'up') {
      currentDataPresetId = presets[Math.max(0, currentIndex - 1)].id;
      renderAppWindow('data');
      return;
    }
    if (direction === 'down') {
      currentDataPresetId = presets[Math.min(presets.length - 1, currentIndex + 1)].id;
      renderAppWindow('data');
    }
    return;
  }

  if (direction === 'up') {
    selectedDataCategoryIndex = Math.max(0, selectedDataCategoryIndex - 1);
    renderAppWindow('data');
    return;
  }
  if (direction === 'down') {
    selectedDataCategoryIndex = Math.min(dataCategoryOrder.length - 1, selectedDataCategoryIndex + 1);
    renderAppWindow('data');
  }
}

function renderDataCategoryList() {
  return `
    <div class="screensaver-saved-list" id="data-category-list">
      ${dataCategoryOrder.map((categoryKey, index) => `
        <div class="screensaver-saved-item data-category-item ${selectedDataCategoryIndex === index ? 'is-selected' : ''}" data-data-category="${categoryKey}">
          <div class="screensaver-saved-main">
            <span class="screensaver-saved-name">${getDataCategoryLabel(categoryKey)}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderDataPresetList() {
  const presets = getAllDataPresetEntries(currentDataCategoryKey);
  if (!presets.length) {
    return '<div class="app-subline data-empty-line">暂无预设</div>';
  }
  const isAiPresetCategory = isAiPresetDataCategory(currentDataCategoryKey);
  const activePresetId = getActiveDataPresetId(currentDataCategoryKey);
  return `
    <div class="screensaver-saved-list" id="data-preset-list">
      ${presets.map((preset) => {
        const canDelete = !isAiPresetCategory && preset.id !== DATA_DEFAULT_PRESET_ID;
        const subtitle = isAiPresetCategory
          ? `${Array.isArray(preset.blocks) ? preset.blocks.length : 0} 个块`
          : '';
        return `
        <div class="screensaver-saved-item data-preset-item ${currentDataPresetId === preset.id ? 'is-selected' : ''} ${!isAiPresetCategory && activePresetId === preset.id ? 'is-active' : ''}" data-data-preset-id="${preset.id}">
          <div class="screensaver-saved-main">
            <span class="screensaver-saved-name">${escapeHtml(preset.name)}</span>
            ${subtitle ? `<span class="screensaver-saved-url">${escapeHtml(subtitle)}</span>` : ''}
          </div>
          ${canDelete ? `<button class="screensaver-delete-button data-preset-delete-button" data-data-preset-delete-id="${preset.id}" type="button" aria-label="删除预设">×</button>` : ''}
        </div>
      `;}).join('')}
    </div>
  `;
}

function renderDataPresetDetail() {
  const preset = getCurrentDataPreset();
  if (!preset) {
    return '<div class="app-subline data-empty-line">暂无预设</div>';
  }
  if (isAiPresetDataCategory(currentDataCategoryKey)) {
    const blocks = normalizeAiPresetBlocks(pendingAiPresetBlocks);
    const blocksHtml = blocks.length
      ? blocks.map((block, index) => {
        const subtitle = getAiPresetBlockSubtitle(block);
        return `
          <div class="screensaver-saved-item data-entry-item ai-preset-block-item ${selectedAiPresetBlockIndex === index ? 'is-selected' : ''} ${isAiPresetSlotBlock(block) ? 'is-slot' : ''}" data-ai-preset-block-index="${index}">
            <div class="screensaver-saved-main ai-preset-block-main">
              <span class="screensaver-saved-name">${escapeHtml(getAiPresetBlockDisplayName(block, index))}</span>
              ${subtitle ? `<span class="screensaver-saved-url ai-preset-block-role">${escapeHtml(subtitle)}</span>` : ''}
            </div>
          </div>
        `;
      }).join('')
      : '<div class="app-subline data-empty-line">暂无块</div>';
    return `<div class="screensaver-saved-list data-entry-list" id="data-entry-list">${blocksHtml}</div>`;
  }
  const itemsHtml = (preset.items || []).length
    ? preset.items.map((entry) => `
        <div class="screensaver-saved-item data-entry-item">
          <div class="screensaver-saved-main">
            <span class="screensaver-saved-name">${escapeHtml(entry.name || (currentDataCategoryKey === 'music' ? '未命名音乐' : '未命名影音'))}</span>
            <span class="screensaver-saved-url">${escapeHtml(entry.url || '')}</span>
            ${currentDataCategoryKey === 'music' && String(entry.coverUrl || '').trim() ? `<span class="data-entry-extra">${escapeHtml(entry.coverUrl)}</span>` : ''}
          </div>
        </div>
      `).join('')
    : '<div class="app-subline data-empty-line">暂无条目</div>';
  return `<div class="screensaver-saved-list data-entry-list" id="data-entry-list">${itemsHtml}</div>`;
}

function renderDataPresetEditor() {
  return `
    <div class="settings-editor data-preset-editor">
      <input class="settings-editor-field" id="data-preset-name-input" type="text" maxlength="40" spellcheck="false" placeholder="预设名称">
      <textarea class="settings-editor-input data-preset-items-input" id="data-preset-items-input" spellcheck="false" placeholder="JSON 数组"></textarea>
    </div>
  `;
}

function renderDataContent() {
  if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView && settingsView !== 'list') {
    return renderSettingsContent();
  }
  if (dataView === 'presetEditor') {
    return renderDataPresetEditor();
  }
  if (dataView === 'presetDetail') {
    return renderDataPresetDetail();
  }
  if (dataView === 'presetList') {
    return renderDataPresetList();
  }
  return renderDataCategoryList();
}
