// 本地存储与数据规范化（从 main.js 渐进拆出）

const storageKeys = {
  theme: 'bleach.theme',
  fontSize: 'bleach.fontSize',
  screenSaverImageUrl: 'bleach.screenSaverImageUrl',
  screenSaverWallpapers: 'bleach.screenSaverWallpapers',
  networkVideoUrl: 'bleach.networkVideoUrl',
  networkVideoEntries: 'bleach.networkVideoEntries',
  musicEntries: 'bleach.musicEntries',
  dataPresets: 'bleach.dataPresets',
  dataActivePresetIds: 'bleach.dataActivePresetIds',
  aiSettings: 'bleach.aiSettings',
  aiContacts: 'bleach.aiContacts',
  aiChatHistory: 'bleach.aiChatHistory'
};

const indexedDbConfig = {
  name: 'bleach_phone_db',
  version: 1,
  storeName: 'kv'
};

const indexedDbAiKeys = {
  settings: 'aiSettings',
  contacts: 'aiContacts',
  chatHistory: 'aiChatHistory'
};

let bleachPhoneDbPromise = null;
let bleachPhoneAiPersistenceQueue = Promise.resolve();

function isBleachPhoneIndexedDbAvailable() {
  return typeof indexedDB !== 'undefined' && indexedDB != null;
}

function openBleachPhoneDb() {
  if (bleachPhoneDbPromise) {
    return bleachPhoneDbPromise;
  }
  if (!isBleachPhoneIndexedDbAvailable()) {
    bleachPhoneDbPromise = Promise.resolve(null);
    return bleachPhoneDbPromise;
  }

  bleachPhoneDbPromise = new Promise((resolve) => {
    try {
      const request = indexedDB.open(indexedDbConfig.name, indexedDbConfig.version);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(indexedDbConfig.storeName)) {
          db.createObjectStore(indexedDbConfig.storeName, { keyPath: 'key' });
        }
      };
      request.onsuccess = () => {
        resolve(request.result);
      };
      request.onerror = () => {
        console.warn('[BLEACH-Phone] IndexedDB 打开失败，回退到 localStorage');
        resolve(null);
      };
      request.onblocked = () => {
        console.warn('[BLEACH-Phone] IndexedDB 被阻塞，回退到 localStorage');
        resolve(null);
      };
    } catch (error) {
      console.warn('[BLEACH-Phone] IndexedDB 初始化异常，回退到 localStorage', error);
      resolve(null);
    }
  });

  return bleachPhoneDbPromise;
}

async function readBleachPhoneDbEntry(key) {
  const db = await openBleachPhoneDb();
  if (!db) {
    return { exists: false, value: null };
  }

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(indexedDbConfig.storeName, 'readonly');
      const store = transaction.objectStore(indexedDbConfig.storeName);
      const request = store.get(String(key || '').trim());
      request.onsuccess = () => {
        if (!request.result) {
          resolve({ exists: false, value: null });
          return;
        }
        resolve({ exists: true, value: request.result.value });
      };
      request.onerror = () => {
        resolve({ exists: false, value: null });
      };
    } catch (error) {
      resolve({ exists: false, value: null });
    }
  });
}

async function writeBleachPhoneDbValue(key, value) {
  const db = await openBleachPhoneDb();
  if (!db) {
    return false;
  }

  return new Promise((resolve) => {
    try {
      const transaction = db.transaction(indexedDbConfig.storeName, 'readwrite');
      transaction.oncomplete = () => resolve(true);
      transaction.onerror = () => resolve(false);
      transaction.onabort = () => resolve(false);
      transaction.objectStore(indexedDbConfig.storeName).put({
        key: String(key || '').trim(),
        value,
        updatedAt: Date.now()
      });
    } catch (error) {
      resolve(false);
    }
  });
}

function queueBleachPhoneAiPersistence(task) {
  bleachPhoneAiPersistenceQueue = bleachPhoneAiPersistenceQueue
    .then(() => task())
    .catch(() => {});
  return bleachPhoneAiPersistenceQueue;
}

function queueBleachPhoneAiStoreValue(key, value, fallbackWriter = null) {
  return queueBleachPhoneAiPersistence(async () => {
    const isSaved = await writeBleachPhoneDbValue(key, value);
    if (!isSaved && typeof fallbackWriter === 'function') {
      fallbackWriter(value);
    }
  });
}

function getStoredTheme() {
  try {
    const storedTheme = localStorage.getItem(storageKeys.theme);
    return themeOptionsOrder.includes(storedTheme) ? storedTheme : 'white';
  } catch (error) {
    return 'white';
  }
}

function getStoredFontSize() {
  try {
    const storedFontSize = localStorage.getItem(storageKeys.fontSize);
    return fontSizeOptionsOrder.includes(storedFontSize) ? storedFontSize : 'small';
  } catch (error) {
    return 'small';
  }
}

function getStoredNetworkVideoUrl() {
  try {
    return (localStorage.getItem(storageKeys.networkVideoUrl) || '').trim();
  } catch (error) {
    return '';
  }
}

function saveNetworkVideoUrl(url) {
  try {
    if (url) {
      localStorage.setItem(storageKeys.networkVideoUrl, url);
    } else {
      localStorage.removeItem(storageKeys.networkVideoUrl);
    }
  } catch (error) {
    // 忽略存储失败，保留当前会话内效果
  }
}

function normalizeNetworkVideoEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => ({
      name: typeof entry?.name === 'string' ? entry.name.trim() : '',
      url: typeof entry?.url === 'string' ? entry.url.trim() : ''
    }))
    .filter((entry) => entry.url)
    .slice(-10);
}

function saveNetworkVideoEntries() {
  try {
    if (networkVideoEntries.length) {
      localStorage.setItem(storageKeys.networkVideoEntries, JSON.stringify(networkVideoEntries));
    } else {
      localStorage.removeItem(storageKeys.networkVideoEntries);
    }
  } catch (error) {
    // 忽略存储失败，保留当前会话内效果
  }
}

function getStoredNetworkVideoEntries() {
  try {
    const storedEntries = localStorage.getItem(storageKeys.networkVideoEntries);
    if (storedEntries) {
      return normalizeNetworkVideoEntries(JSON.parse(storedEntries));
    }

    const legacyUrl = getStoredNetworkVideoUrl();
    return legacyUrl ? [{ name: '', url: legacyUrl }] : [];
  } catch (error) {
    return [];
  }
}

function normalizeMusicEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => ({
      name: typeof entry?.name === 'string' ? entry.name.trim() : '',
      url: typeof entry?.url === 'string' ? entry.url.trim() : '',
      coverUrl: typeof entry?.coverUrl === 'string' ? entry.coverUrl.trim() : ''
    }))
    .filter((entry) => entry.url)
    .slice(-20);
}

function saveMusicEntries() {
  try {
    if (musicEntries.length) {
      localStorage.setItem(storageKeys.musicEntries, JSON.stringify(musicEntries));
    } else {
      localStorage.removeItem(storageKeys.musicEntries);
    }
  } catch (error) {
    // 忽略存储失败，保留当前会话内效果
  }
}

function getStoredMusicEntries() {
  try {
    const storedEntries = localStorage.getItem(storageKeys.musicEntries);
    if (storedEntries) {
      return normalizeMusicEntries(JSON.parse(storedEntries));
    }
    return [];
  } catch (error) {
    return [];
  }
}

function createDataPresetId(categoryKey = 'records', index = 0) {
  const safeCategoryKey = categoryKey === 'music' ? 'music' : 'records';
  return `data_preset_${safeCategoryKey}_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
}

function getDataPresetDefaultName(categoryKey = 'records', index = 0) {
  return `${categoryKey === 'music' ? '音乐' : '影音'}预设 ${index + 1}`;
}

function normalizeDataPresetItems(items, categoryKey = 'records') {
  return categoryKey === 'music'
    ? normalizeMusicEntries(items)
    : normalizeNetworkVideoEntries(items);
}

function normalizeDataPresetEntry(entry, categoryKey = 'records', index = 0) {
  const safeCategoryKey = categoryKey === 'music' ? 'music' : 'records';
  const nextEntry = entry && typeof entry === 'object' ? entry : {};
  return {
    id: typeof nextEntry.id === 'string' && nextEntry.id.trim() ? nextEntry.id.trim() : createDataPresetId(safeCategoryKey, index),
    name: typeof nextEntry.name === 'string' && nextEntry.name.trim() ? nextEntry.name.trim() : getDataPresetDefaultName(safeCategoryKey, index),
    items: normalizeDataPresetItems(nextEntry.items, safeCategoryKey),
    createdAt: Number.isFinite(nextEntry.createdAt) ? nextEntry.createdAt : Date.now() + index
  };
}

function normalizeDataPresetList(entries, categoryKey = 'records') {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry, index) => normalizeDataPresetEntry(entry, categoryKey, index))
    .slice(0, 50);
}

function normalizeDataPresets(data) {
  const source = data && typeof data === 'object' ? data : {};
  return {
    records: normalizeDataPresetList(source.records, 'records'),
    music: normalizeDataPresetList(source.music, 'music')
  };
}

function saveDataPresets() {
  dataPresets = normalizeDataPresets(dataPresets);
  try {
    localStorage.setItem(storageKeys.dataPresets, JSON.stringify(dataPresets));
  } catch (error) {
    // 忽略存储失败，保留当前会话内效果
  }
  return dataPresets;
}

function getStoredDataPresets() {
  try {
    return normalizeDataPresets(JSON.parse(localStorage.getItem(storageKeys.dataPresets) || '{}'));
  } catch (error) {
    return normalizeDataPresets();
  }
}

function normalizeDataActivePresetIds(data) {
  const source = data && typeof data === 'object' ? data : {};
  return {
    records: typeof source.records === 'string' && source.records.trim() ? source.records.trim() : '__default__',
    music: typeof source.music === 'string' && source.music.trim() ? source.music.trim() : '__default__'
  };
}

function saveDataActivePresetIds() {
  dataActivePresetIds = normalizeDataActivePresetIds(dataActivePresetIds);
  try {
    localStorage.setItem(storageKeys.dataActivePresetIds, JSON.stringify(dataActivePresetIds));
  } catch (error) {
    // 忽略存储失败，保留当前会话内效果
  }
  return dataActivePresetIds;
}

function getStoredDataActivePresetIds() {
  try {
    return normalizeDataActivePresetIds(JSON.parse(localStorage.getItem(storageKeys.dataActivePresetIds) || '{}'));
  } catch (error) {
    return normalizeDataActivePresetIds();
  }
}

function clampAiNumberSetting(value, min, max) {
  if (value === '' || value == null) return '';
  const nextValue = Number(value);
  if (!Number.isFinite(nextValue)) return '';
  return String(Math.min(max, Math.max(min, nextValue)));
}

function clampAiIntegerSetting(value, min, max, fallback = '') {
  if (value === '' || value == null) return fallback;
  const nextValue = parseInt(String(value).trim(), 10);
  if (!Number.isFinite(nextValue)) return fallback;
  return String(Math.min(max, Math.max(min, nextValue)));
}

function normalizeAiMainChatRules(rules) {
  if (!Array.isArray(rules)) return [];
  return rules
    .map((rule) => ({
      tag: typeof rule?.tag === 'string' ? rule.tag.trim() : '',
      mode: rule?.mode === 'exclude' ? 'exclude' : 'recent',
      n: rule?.n === '' || rule?.n == null ? '' : clampAiIntegerSetting(rule.n, 0, 99, '')
    }))
    .slice(0, 20);
}

function normalizeAiPresetBlock(block, index = 0) {
  const rawRole = typeof block?.role === 'string' ? block.role.trim() : '';
  const normalizedRole = rawRole === '_subchat' ? '_info' : rawRole;
  const role = ['system', 'user', 'assistant', '_context', '_info', '_worldinfo'].includes(normalizedRole)
    ? normalizedRole
    : 'system';
  const sourceId = typeof block?.sourceId === 'string' ? block.sourceId.trim().slice(0, 80) : '';
  const sourceName = typeof block?.sourceName === 'string' ? block.sourceName.trim().slice(0, 48) : '';
  const sourceScope = typeof block?.sourceScope === 'string' ? block.sourceScope.trim().slice(0, 24) : '';
  const explicitMessageRole = typeof block?.messageRole === 'string' ? block.messageRole.trim() : '';
  const messageRole = ['system', 'user', 'assistant'].includes(explicitMessageRole)
    ? explicitMessageRole
    : (role === '_info'
      ? ((sourceId === '__pending_user_messages__' || sourceScope === 'pending_user_messages') ? 'user' : 'system')
      : '');
  return {
    id: typeof block?.id === 'string' && block.id.trim() ? block.id.trim() : `ai_preset_block_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
    role,
    messageRole,
    name: typeof block?.name === 'string' ? block.name.trim().slice(0, 32) : '',
    text: role.startsWith('_') ? '' : String(block?.text || ''),
    sourceId,
    sourceName,
    sourceScope
  };
}

function normalizeAiPresetBlocks(blocks) {
  if (!Array.isArray(blocks)) return [];
  return blocks
    .map((block, index) => normalizeAiPresetBlock(block, index))
    .slice(0, 60);
}

function normalizeAiPresetEntry(entry, index = 0) {
  const blocks = normalizeAiPresetBlocks(entry?.blocks);
  return {
    id: typeof entry?.id === 'string' && entry.id.trim() ? entry.id.trim() : `ai_preset_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`,
    name: typeof entry?.name === 'string' && entry.name.trim() ? entry.name.trim().slice(0, 24) : `预设 ${index + 1}`,
    blocks
  };
}

function normalizeAiPresetEntries(entries, legacySettings = {}) {
  if (Array.isArray(entries) && entries.length) {
    return entries
      .map((entry, index) => normalizeAiPresetEntry(entry, index))
      .slice(0, 20);
  }

  const legacyPresetBlocks = normalizeAiPresetBlocks(legacySettings.presetBlocks);
  const legacySystemPrompt = typeof legacySettings.systemPrompt === 'string' ? legacySettings.systemPrompt.trim() : '';
  const migratedBlocks = legacySystemPrompt
    ? [
      normalizeAiPresetBlock({ role: 'system', name: '系统块', text: legacySystemPrompt }, 0),
      ...legacyPresetBlocks
    ]
    : legacyPresetBlocks;

  return migratedBlocks.length
    ? [normalizeAiPresetEntry({ name: '默认', blocks: migratedBlocks }, 0)]
    : [];
}

function resolveSelectedAiPresetId(presetId, presetEntries) {
  const validPresetIds = new Set((presetEntries || []).map((entry) => entry.id));
  const targetPresetId = typeof presetId === 'string' ? presetId.trim() : '';
  if (validPresetIds.has(targetPresetId)) return targetPresetId;
  return presetEntries?.[0]?.id || '';
}

function getAiPresetEntryById(presetId, settingsSource = aiSettings) {
  const settings = settingsSource && settingsSource.presetEntries ? settingsSource : normalizeAiSettings(settingsSource);
  const targetPresetId = typeof presetId === 'string' ? presetId.trim() : '';
  if (!targetPresetId) return null;
  return (Array.isArray(settings.presetEntries) ? settings.presetEntries : []).find((entry) => entry.id === targetPresetId) || null;
}

function normalizeAiEndpoint(endpoint) {
  const normalizedEndpoint = String(endpoint || '').trim().replace(/\/+$/, '');
  if (!normalizedEndpoint) return '';
  if (/\/chat\/completions$/i.test(normalizedEndpoint)) return normalizedEndpoint;
  return `${normalizedEndpoint}/chat/completions`;
}

function getAiModelsEndpoint(endpoint) {
  const normalizedEndpoint = normalizeAiEndpoint(endpoint);
  if (!normalizedEndpoint) return '';
  return normalizedEndpoint.replace(/\/chat\/completions$/i, '/models');
}

function createAiApiProfileId(index = 0) {
  return `ai_api_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
}

function getAiApiHostLabel(endpoint) {
  try {
    const url = new URL(normalizeAiEndpoint(endpoint));
    return String(url.host || '').replace(/^api\./i, '').trim();
  } catch (error) {
    return '';
  }
}

function getAiApiDefaultName(profile, index = 0) {
  const explicitName = typeof profile?.name === 'string' ? profile.name.trim() : '';
  if (explicitName) return explicitName;
  return '默认';
}

function normalizeAiModelCache(modelCache) {
  return Array.isArray(modelCache)
    ? modelCache.map((item) => String(item || '').trim()).filter(Boolean).slice(0, 200)
    : [];
}

function normalizeAiApiProfile(profile, index = 0) {
  const nextProfile = profile && typeof profile === 'object' ? profile : {};
  return {
    id: typeof nextProfile.id === 'string' && nextProfile.id.trim() ? nextProfile.id.trim() : createAiApiProfileId(index),
    name: getAiApiDefaultName(nextProfile, index),
    url: normalizeAiEndpoint(nextProfile.url),
    key: typeof nextProfile.key === 'string' ? nextProfile.key.trim() : '',
    model: typeof nextProfile.model === 'string' ? nextProfile.model.trim() : '',
    temperature: clampAiNumberSetting(nextProfile.temperature, 0, 2),
    topP: clampAiNumberSetting(nextProfile.topP, 0, 1),
    modelCache: normalizeAiModelCache(nextProfile.modelCache)
  };
}

function isAiApiProfileMeaningful(profile) {
  if (!profile || typeof profile !== 'object') return false;
  return Boolean(
    String(profile.url || '').trim()
    || String(profile.key || '').trim()
    || String(profile.model || '').trim()
    || (Array.isArray(profile.modelCache) && profile.modelCache.length)
  );
}

function normalizeAiApiProfiles(profiles, legacySettings = {}) {
  if (Array.isArray(profiles) && profiles.length) {
    return profiles
      .map((profile, index) => normalizeAiApiProfile(profile, index))
      .filter((profile) => isAiApiProfileMeaningful(profile))
      .slice(0, 20);
  }

  const legacyProfile = normalizeAiApiProfile({
    name: '默认API',
    url: legacySettings.url,
    key: legacySettings.key,
    model: legacySettings.model,
    temperature: legacySettings.temperature,
    topP: legacySettings.topP,
    modelCache: legacySettings.modelCache
  }, 0);

  return isAiApiProfileMeaningful(legacyProfile) ? [legacyProfile] : [];
}

function normalizeAiApiBindings(bindings, profiles, selectedApiProfileId = '') {
  const nextBindings = bindings && typeof bindings === 'object' ? bindings : {};
  const validProfileIds = new Set((profiles || []).map((profile) => profile.id));
  const normalizedBindings = {};

  for (const option of aiApiBindingOptions) {
    const nextId = typeof nextBindings[option.key] === 'string' ? nextBindings[option.key].trim() : '';
    normalizedBindings[option.key] = validProfileIds.has(nextId) ? nextId : '';
  }

  if (!normalizedBindings.default && profiles?.length) {
    normalizedBindings.default = validProfileIds.has(selectedApiProfileId) ? selectedApiProfileId : profiles[0].id;
  }

  return normalizedBindings;
}

function resolveSelectedAiApiProfileId(profileId, profiles, apiBindings = {}) {
  const validProfileIds = new Set((profiles || []).map((profile) => profile.id));
  const requestedId = typeof profileId === 'string' ? profileId.trim() : '';
  if (validProfileIds.has(requestedId)) return requestedId;
  const defaultBindingId = typeof apiBindings.default === 'string' ? apiBindings.default.trim() : '';
  if (validProfileIds.has(defaultBindingId)) return defaultBindingId;
  return profiles?.[0]?.id || '';
}

function getAiProfileById(profileId, settingsSource = aiSettings) {
  const settings = settingsSource && settingsSource.apiProfiles ? settingsSource : normalizeAiSettings(settingsSource);
  const targetId = typeof profileId === 'string' ? profileId.trim() : '';
  if (!targetId) return null;
  return (Array.isArray(settings.apiProfiles) ? settings.apiProfiles : []).find((profile) => profile.id === targetId) || null;
}

function getSelectedAiApiProfile(settingsSource = aiSettings) {
  const settings = settingsSource && settingsSource.apiProfiles ? settingsSource : normalizeAiSettings(settingsSource);
  return getAiProfileById(settings.selectedApiProfileId, settings);
}

function getAiBindingProfileId(bindingKey = 'default', settingsSource = aiSettings) {
  const settings = settingsSource && settingsSource.apiProfiles ? settingsSource : normalizeAiSettings(settingsSource);
  const key = String(bindingKey || 'default').trim() || 'default';
  const specificBindingId = typeof settings.apiBindings?.[key] === 'string' ? settings.apiBindings[key].trim() : '';
  if (specificBindingId) return specificBindingId;
  const defaultBindingId = typeof settings.apiBindings?.default === 'string' ? settings.apiBindings.default.trim() : '';
  if (defaultBindingId) return defaultBindingId;
  return settings.selectedApiProfileId || '';
}

function getAiBindingProfile(bindingKey = 'default', settingsSource = aiSettings) {
  const settings = settingsSource && settingsSource.apiProfiles ? settingsSource : normalizeAiSettings(settingsSource);
  return getAiProfileById(getAiBindingProfileId(bindingKey, settings), settings);
}

function getAiBindingProfileName(bindingKey = 'default', settingsSource = aiSettings) {
  const profile = getAiBindingProfile(bindingKey, settingsSource);
  if (profile?.name) return profile.name;
  return bindingKey === 'default' ? '未设' : '跟随默认';
}

function getAiRuntimeSettings(bindingKey = 'default', settingsSource = aiSettings) {
  const settings = settingsSource && settingsSource.apiProfiles ? settingsSource : normalizeAiSettings(settingsSource);
  const profile = getAiBindingProfile(bindingKey, settings) || getSelectedAiApiProfile(settings);
  return {
    ...settings,
    url: profile?.url || '',
    key: profile?.key || '',
    model: profile?.model || '',
    temperature: profile?.temperature || '',
    topP: profile?.topP || '',
    modelCache: normalizeAiModelCache(profile?.modelCache)
  };
}

function getNextAiApiProfileName(settingsSource = aiSettings) {
  const settings = settingsSource && settingsSource.apiProfiles ? settingsSource : normalizeAiSettings(settingsSource);
  return (Array.isArray(settings.apiProfiles) && settings.apiProfiles.length) ? `API ${settings.apiProfiles.length + 1}` : '默认';
}

function createAiWorldBookSelectionId(index = 0) {
  return `worldbook_selection_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
}

function createAiWorldBookInfoBindingId(index = 0) {
  return `worldbook_info_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeAiWorldBookInfoBindings(bindings) {
  if (!Array.isArray(bindings)) return [];
  return bindings
    .map((binding, index) => ({
      id: typeof binding?.id === 'string' && binding.id.trim() ? binding.id.trim() : createAiWorldBookInfoBindingId(index),
      sourceId: typeof binding?.sourceId === 'string' ? binding.sourceId.trim() : '',
      sourceName: typeof binding?.sourceName === 'string' ? binding.sourceName.trim() : '',
      sourceScope: typeof binding?.sourceScope === 'string' ? binding.sourceScope.trim() : ''
    }))
    .filter((binding) => binding.sourceId || binding.sourceName)
    .slice(0, 50);
}

function normalizeAiWorldBookEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry, index) => ({
      id: typeof entry?.id === 'string' && entry.id.trim() ? entry.id.trim() : createAiWorldBookSelectionId(index),
      sourceId: typeof entry?.sourceId === 'string' && entry.sourceId.trim()
        ? entry.sourceId.trim()
        : `${typeof entry?.scope === 'string' && entry.scope.trim() ? entry.scope.trim() : 'global'}:${typeof entry?.name === 'string' ? entry.name.trim() : ''}`,
      name: typeof entry?.name === 'string' ? entry.name.trim() : '',
      scope: typeof entry?.scope === 'string' && entry.scope.trim() ? entry.scope.trim() : 'global',
      ownerId: typeof entry?.ownerId === 'string' ? entry.ownerId.trim() : '',
      mainChatContextN: entry?.mainChatContextN === '' || entry?.mainChatContextN == null ? '10' : clampAiIntegerSetting(entry.mainChatContextN, 0, 99, '10'),
      mainChatUserN: entry?.mainChatUserN === '' || entry?.mainChatUserN == null ? '' : clampAiIntegerSetting(entry.mainChatUserN, 0, 99, ''),
      mainChatXmlRules: normalizeAiMainChatRules(entry?.mainChatXmlRules),
      infoSourceBindings: normalizeAiWorldBookInfoBindings(entry?.infoSourceBindings)
    }))
    .filter((entry) => entry.name)
    .slice(0, 100);
}

function normalizeAiSettings(settings) {
  const nextSettings = settings && typeof settings === 'object' ? settings : {};
  const apiProfiles = normalizeAiApiProfiles(nextSettings.apiProfiles, nextSettings);
  const initialBindings = normalizeAiApiBindings(nextSettings.apiBindings, apiProfiles, nextSettings.selectedApiProfileId);
  const selectedApiProfileId = resolveSelectedAiApiProfileId(nextSettings.selectedApiProfileId, apiProfiles, initialBindings);
  const apiBindings = normalizeAiApiBindings(nextSettings.apiBindings, apiProfiles, selectedApiProfileId);
  const selectedApiProfile = getAiProfileById(selectedApiProfileId, { apiProfiles, selectedApiProfileId, apiBindings }) || null;
  const presetEntries = normalizeAiPresetEntries(nextSettings.presetEntries, nextSettings);
  const selectedPresetId = resolveSelectedAiPresetId(nextSettings.selectedPresetId, presetEntries);
  const selectedSmsPresetId = resolveSelectedAiPresetId(nextSettings.selectedSmsPresetId || selectedPresetId, presetEntries);
  const selectedSmsSummaryPresetId = resolveSelectedAiPresetId(nextSettings.selectedSmsSummaryPresetId || selectedSmsPresetId || selectedPresetId, presetEntries);
  const selectedMapPresetId = resolveSelectedAiPresetId(nextSettings.selectedMapPresetId || selectedPresetId, presetEntries);
  const selectedWeatherPresetId = resolveSelectedAiPresetId(nextSettings.selectedWeatherPresetId || selectedPresetId, presetEntries);
  const selectedItemsPresetId = resolveSelectedAiPresetId(nextSettings.selectedItemsPresetId || selectedPresetId, presetEntries);
  const selectedNewsPresetId = resolveSelectedAiPresetId(nextSettings.selectedNewsPresetId || selectedPresetId, presetEntries);
  const selectedCharsPresetId = resolveSelectedAiPresetId(nextSettings.selectedCharsPresetId || selectedPresetId, presetEntries);
  const worldBookEntries = normalizeAiWorldBookEntries(nextSettings.worldBookEntries);
  const selectedPreset = getAiPresetEntryById(selectedPresetId, { presetEntries }) || null;
  const mapAutoGenerateEnabled = Boolean(nextSettings.mapAutoGenerateEnabled);
  const mapAutoGenerateTrigger = ['assistant', 'user'].includes(String(nextSettings.mapAutoGenerateTrigger || '').trim())
    ? String(nextSettings.mapAutoGenerateTrigger).trim()
    : 'assistant';
  const mapAutoGenerateInterval = clampAiIntegerSetting(nextSettings.mapAutoGenerateInterval, 1, 99, '1');
  const weatherAutoGenerateEnabled = Boolean(nextSettings.weatherAutoGenerateEnabled);
  const weatherAutoGenerateTrigger = ['assistant', 'user'].includes(String(nextSettings.weatherAutoGenerateTrigger || '').trim())
    ? String(nextSettings.weatherAutoGenerateTrigger).trim()
    : 'assistant';
  const weatherAutoGenerateInterval = clampAiIntegerSetting(nextSettings.weatherAutoGenerateInterval, 1, 99, '1');
  const itemsAutoGenerateEnabled = Boolean(nextSettings.itemsAutoGenerateEnabled);
  const itemsAutoGenerateTrigger = ['assistant', 'user'].includes(String(nextSettings.itemsAutoGenerateTrigger || '').trim())
    ? String(nextSettings.itemsAutoGenerateTrigger).trim()
    : 'assistant';
  const itemsAutoGenerateInterval = clampAiIntegerSetting(nextSettings.itemsAutoGenerateInterval, 1, 99, '1');
  const newsAutoGenerateEnabled = Boolean(nextSettings.newsAutoGenerateEnabled);
  const newsAutoGenerateTrigger = ['assistant', 'user'].includes(String(nextSettings.newsAutoGenerateTrigger || '').trim())
    ? String(nextSettings.newsAutoGenerateTrigger).trim()
    : 'assistant';
  const newsAutoGenerateInterval = clampAiIntegerSetting(nextSettings.newsAutoGenerateInterval, 1, 99, '1');
  const charsAutoGenerateEnabled = Boolean(nextSettings.charsAutoGenerateEnabled);
  const charsAutoGenerateTrigger = ['assistant', 'user'].includes(String(nextSettings.charsAutoGenerateTrigger || '').trim())
    ? String(nextSettings.charsAutoGenerateTrigger).trim()
    : 'assistant';
  const charsAutoGenerateInterval = clampAiIntegerSetting(nextSettings.charsAutoGenerateInterval, 1, 99, '1');

  return {
    apiProfiles,
    apiBindings,
    selectedApiProfileId,
    selectedPresetId,
    selectedSmsPresetId,
    selectedSmsSummaryPresetId,
    selectedMapPresetId,
    selectedWeatherPresetId,
    selectedItemsPresetId,
    selectedNewsPresetId,
    selectedCharsPresetId,
    worldBookEntries,
    mapAutoGenerateEnabled,
    mapAutoGenerateTrigger,
    mapAutoGenerateInterval,
    weatherAutoGenerateEnabled,
    weatherAutoGenerateTrigger,
    weatherAutoGenerateInterval,
    itemsAutoGenerateEnabled,
    itemsAutoGenerateTrigger,
    itemsAutoGenerateInterval,
    newsAutoGenerateEnabled,
    newsAutoGenerateTrigger,
    newsAutoGenerateInterval,
    charsAutoGenerateEnabled,
    charsAutoGenerateTrigger,
    charsAutoGenerateInterval,
    presetEntries,
    url: selectedApiProfile?.url || '',
    key: selectedApiProfile?.key || '',
    model: selectedApiProfile?.model || '',
    temperature: selectedApiProfile?.temperature || '',
    topP: selectedApiProfile?.topP || '',
    mainChatContextN: nextSettings.mainChatContextN === '' || nextSettings.mainChatContextN == null
      ? ''
      : clampAiIntegerSetting(nextSettings.mainChatContextN, 0, 99, '10'),
    mainChatUserN: nextSettings.mainChatUserN === '' || nextSettings.mainChatUserN == null ? '' : clampAiIntegerSetting(nextSettings.mainChatUserN, 0, 99, ''),
    mainChatXmlRules: normalizeAiMainChatRules(nextSettings.mainChatXmlRules),
    systemPrompt: typeof nextSettings.systemPrompt === 'string' ? nextSettings.systemPrompt : '',
    presetBlocks: normalizeAiPresetBlocks(selectedPreset?.blocks ?? nextSettings.presetBlocks),
    modelCache: normalizeAiModelCache(selectedApiProfile?.modelCache)
  };
}

function persistAiSettingsToLocalStorage(settings) {
  try {
    localStorage.setItem(storageKeys.aiSettings, JSON.stringify(normalizeAiSettings(settings)));
  } catch (error) {
    // 忽略存储失败，保留当前会话内效果
  }
}

function getStoredAiSettingsFromLocalStorage() {
  try {
    return normalizeAiSettings(JSON.parse(localStorage.getItem(storageKeys.aiSettings) || '{}'));
  } catch (error) {
    return normalizeAiSettings();
  }
}

async function getStoredAiSettings() {
  const storedEntry = await readBleachPhoneDbEntry(indexedDbAiKeys.settings);
  if (storedEntry.exists) {
    return normalizeAiSettings(storedEntry.value);
  }
  const fallbackSettings = getStoredAiSettingsFromLocalStorage();
  queueBleachPhoneAiStoreValue(indexedDbAiKeys.settings, fallbackSettings, persistAiSettingsToLocalStorage);
  return fallbackSettings;
}

function buildPendingAiApiProfile(currentSettings = aiSettings, overrides = {}) {
  const settings = currentSettings && currentSettings.apiProfiles ? currentSettings : normalizeAiSettings(currentSettings);
  const currentProfile = getAiProfileById(pendingAiApiProfileId || settings.selectedApiProfileId, settings);
  return normalizeAiApiProfile({
    ...currentProfile,
    ...overrides,
    id: overrides.id ?? pendingAiApiProfileId ?? currentProfile?.id,
    name: overrides.name ?? pendingAiApiName,
    url: overrides.url ?? pendingAiUrl,
    key: overrides.key ?? pendingAiKey,
    model: overrides.model ?? pendingAiModel,
    temperature: overrides.temperature ?? pendingAiTemperature,
    topP: overrides.topP ?? pendingAiTopP,
    modelCache: overrides.modelCache ?? currentProfile?.modelCache ?? []
  }, Array.isArray(settings.apiProfiles) ? settings.apiProfiles.length : 0);
}

function saveAiSettings(overrides = {}) {
  const currentSettings = normalizeAiSettings(aiSettings);
  const editingProfileId = typeof (overrides.id ?? pendingAiApiProfileId ?? currentSettings.selectedApiProfileId) === 'string'
    ? (overrides.id ?? pendingAiApiProfileId ?? currentSettings.selectedApiProfileId).trim()
    : '';
  const currentProfile = getAiProfileById(editingProfileId, currentSettings);
  const nextProfile = buildPendingAiApiProfile(currentSettings, overrides);
  const nextProfiles = currentSettings.apiProfiles.filter((profile) => profile.id !== currentProfile?.id);
  const nextUrl = nextProfile.url;
  const nextKey = nextProfile.key;
  const preservedModelCache = currentProfile && currentProfile.url === nextUrl && currentProfile.key === nextKey
    ? currentProfile.modelCache
    : [];
  const finalizedProfile = normalizeAiApiProfile({
    ...nextProfile,
    modelCache: overrides.modelCache ?? preservedModelCache
  }, nextProfiles.length);

  if (isAiApiProfileMeaningful(finalizedProfile)) {
    nextProfiles.push(finalizedProfile);
  }

  aiSettings = normalizeAiSettings({
    apiProfiles: nextProfiles,
    apiBindings: currentSettings.apiBindings,
    selectedApiProfileId: isAiApiProfileMeaningful(finalizedProfile) ? finalizedProfile.id : currentSettings.selectedApiProfileId,
    selectedPresetId: overrides.selectedPresetId ?? currentAiPresetId,
    selectedSmsPresetId: overrides.selectedSmsPresetId ?? currentSmsPresetId ?? currentSettings.selectedSmsPresetId,
    selectedSmsSummaryPresetId: overrides.selectedSmsSummaryPresetId ?? currentSmsSummaryPresetId ?? currentSettings.selectedSmsSummaryPresetId,
    selectedMapPresetId: overrides.selectedMapPresetId ?? currentMapPresetId ?? currentSettings.selectedMapPresetId,
    selectedWeatherPresetId: overrides.selectedWeatherPresetId ?? currentWeatherPresetId ?? currentSettings.selectedWeatherPresetId,
    selectedItemsPresetId: overrides.selectedItemsPresetId ?? currentItemsPresetId ?? currentSettings.selectedItemsPresetId,
    selectedNewsPresetId: overrides.selectedNewsPresetId ?? currentNewsPresetId ?? currentSettings.selectedNewsPresetId,
    selectedCharsPresetId: overrides.selectedCharsPresetId ?? currentCharsPresetId ?? currentSettings.selectedCharsPresetId,
    worldBookEntries: overrides.worldBookEntries ?? currentSettings.worldBookEntries,
    mapAutoGenerateEnabled: overrides.mapAutoGenerateEnabled ?? currentSettings.mapAutoGenerateEnabled,
    mapAutoGenerateTrigger: overrides.mapAutoGenerateTrigger ?? currentSettings.mapAutoGenerateTrigger,
    mapAutoGenerateInterval: overrides.mapAutoGenerateInterval ?? currentSettings.mapAutoGenerateInterval,
    weatherAutoGenerateEnabled: overrides.weatherAutoGenerateEnabled ?? currentSettings.weatherAutoGenerateEnabled,
    weatherAutoGenerateTrigger: overrides.weatherAutoGenerateTrigger ?? currentSettings.weatherAutoGenerateTrigger,
    weatherAutoGenerateInterval: overrides.weatherAutoGenerateInterval ?? currentSettings.weatherAutoGenerateInterval,
    itemsAutoGenerateEnabled: overrides.itemsAutoGenerateEnabled ?? currentSettings.itemsAutoGenerateEnabled,
    itemsAutoGenerateTrigger: overrides.itemsAutoGenerateTrigger ?? currentSettings.itemsAutoGenerateTrigger,
    itemsAutoGenerateInterval: overrides.itemsAutoGenerateInterval ?? currentSettings.itemsAutoGenerateInterval,
    newsAutoGenerateEnabled: overrides.newsAutoGenerateEnabled ?? currentSettings.newsAutoGenerateEnabled,
    newsAutoGenerateTrigger: overrides.newsAutoGenerateTrigger ?? currentSettings.newsAutoGenerateTrigger,
    newsAutoGenerateInterval: overrides.newsAutoGenerateInterval ?? currentSettings.newsAutoGenerateInterval,
    charsAutoGenerateEnabled: overrides.charsAutoGenerateEnabled ?? currentSettings.charsAutoGenerateEnabled,
    charsAutoGenerateTrigger: overrides.charsAutoGenerateTrigger ?? currentSettings.charsAutoGenerateTrigger,
    charsAutoGenerateInterval: overrides.charsAutoGenerateInterval ?? currentSettings.charsAutoGenerateInterval,
    presetEntries: overrides.presetEntries ?? pendingAiPresetEntries,
    mainChatContextN: pendingAiMainChatContextN,
    mainChatUserN: pendingAiMainChatUserN,
    mainChatXmlRules: pendingAiMainChatXmlRules,
    systemPrompt: pendingAiSystemPrompt,
    presetBlocks: overrides.presetBlocks ?? pendingAiPresetBlocks
  });

  setPendingAiSettings(aiSettings);
  persistAiSettings(aiSettings);
  return aiSettings;
}

function setPendingAiSettings(settings = aiSettings) {
  const nextSettings = normalizeAiSettings(settings);
  const selectedProfile = getSelectedAiApiProfile(nextSettings);
  pendingAiApiProfileId = selectedProfile?.id || '';
  pendingAiApiName = selectedProfile?.name || getNextAiApiProfileName(nextSettings);
  pendingAiUrl = selectedProfile?.url || '';
  pendingAiKey = selectedProfile?.key || '';
  pendingAiModel = selectedProfile?.model || '';
  pendingAiTemperature = selectedProfile?.temperature || '';
  pendingAiTopP = selectedProfile?.topP || '';
  pendingAiMainChatContextN = nextSettings.mainChatContextN;
  pendingAiMainChatUserN = nextSettings.mainChatUserN;
  pendingAiMainChatXmlRules = normalizeAiMainChatRules(nextSettings.mainChatXmlRules);
  pendingAiSystemPrompt = nextSettings.systemPrompt;
  pendingAiPresetEntries = normalizeAiPresetEntries(nextSettings.presetEntries, nextSettings);
  currentAiPresetId = resolveSelectedAiPresetId(nextSettings.selectedPresetId, pendingAiPresetEntries);
  currentSmsPresetId = resolveSelectedAiPresetId(nextSettings.selectedSmsPresetId || currentAiPresetId, pendingAiPresetEntries);
  currentSmsSummaryPresetId = resolveSelectedAiPresetId(nextSettings.selectedSmsSummaryPresetId || currentSmsPresetId || currentAiPresetId, pendingAiPresetEntries);
  currentMapPresetId = resolveSelectedAiPresetId(nextSettings.selectedMapPresetId || currentAiPresetId, pendingAiPresetEntries);
  currentWeatherPresetId = resolveSelectedAiPresetId(nextSettings.selectedWeatherPresetId || currentAiPresetId, pendingAiPresetEntries);
  currentItemsPresetId = resolveSelectedAiPresetId(nextSettings.selectedItemsPresetId || currentAiPresetId, pendingAiPresetEntries);
  currentNewsPresetId = resolveSelectedAiPresetId(nextSettings.selectedNewsPresetId || currentAiPresetId, pendingAiPresetEntries);
  currentCharsPresetId = resolveSelectedAiPresetId(nextSettings.selectedCharsPresetId || currentAiPresetId, pendingAiPresetEntries);
  pendingAiPresetName = getAiPresetEntryById(currentAiPresetId, { presetEntries: pendingAiPresetEntries })?.name || '';
  pendingAiPresetBlocks = normalizeAiPresetBlocks(getAiPresetEntryById(currentAiPresetId, { presetEntries: pendingAiPresetEntries })?.blocks || nextSettings.presetBlocks);
  selectedAiPresetListIndex = pendingAiPresetEntries.length
    ? Math.max(0, pendingAiPresetEntries.findIndex((entry) => entry.id === currentAiPresetId))
    : -1;
  selectedAiPresetBlockIndex = pendingAiPresetBlocks.length
    ? Math.min(Math.max(selectedAiPresetBlockIndex, 0), pendingAiPresetBlocks.length - 1)
    : -1;
}

function createAiContactId(index = 0) {
  return `contact_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 8)}`;
}

function getNextAiContactExternalId(entries = aiContacts) {
  const usedIds = new Set(
    (Array.isArray(entries) ? entries : [])
      .map((entry) => Number.parseInt(String(entry?.externalId ?? ''), 10))
      .filter((id) => Number.isFinite(id) && id > 0)
  );
  let nextId = 1;
  while (usedIds.has(nextId)) {
    nextId += 1;
  }
  return nextId;
}

function normalizeAiContacts(entries) {
  if (!Array.isArray(entries)) return [];
  const usedExternalIds = new Set();
  return entries
    .map((entry, index) => {
      let externalId = Number.parseInt(String(entry?.externalId ?? ''), 10);
      if (!Number.isFinite(externalId) || externalId <= 0 || usedExternalIds.has(externalId)) {
        externalId = 1;
        while (usedExternalIds.has(externalId)) {
          externalId += 1;
        }
      }
      usedExternalIds.add(externalId);
      return {
        id: typeof entry?.id === 'string' && entry.id.trim() ? entry.id.trim() : createAiContactId(index),
        externalId,
        name: typeof entry?.name === 'string' ? entry.name.trim() : '',
        prompt: typeof entry?.prompt === 'string' ? entry.prompt : '',
        createdAt: Number.isFinite(entry?.createdAt) ? entry.createdAt : Date.now() + index
      };
    })
    .filter((entry) => entry.name)
    .slice(0, 50);
}

function persistAiContactsToLocalStorage(entries) {
  try {
    localStorage.setItem(storageKeys.aiContacts, JSON.stringify(normalizeAiContacts(entries)));
  } catch (error) {
    // 忽略存储失败，保留当前会话内效果
  }
}

function getStoredAiContactsFromLocalStorage() {
  try {
    return normalizeAiContacts(JSON.parse(localStorage.getItem(storageKeys.aiContacts) || '[]'));
  } catch (error) {
    return [];
  }
}

async function getStoredAiContacts() {
  const storedEntry = await readBleachPhoneDbEntry(indexedDbAiKeys.contacts);
  if (storedEntry.exists) {
    return normalizeAiContacts(storedEntry.value);
  }
  const fallbackContacts = getStoredAiContactsFromLocalStorage();
  queueBleachPhoneAiStoreValue(indexedDbAiKeys.contacts, fallbackContacts, persistAiContactsToLocalStorage);
  return fallbackContacts;
}

function saveAiContacts() {
  aiContacts = normalizeAiContacts(aiContacts);
  queueBleachPhoneAiStoreValue(indexedDbAiKeys.contacts, aiContacts, persistAiContactsToLocalStorage);
  return aiContacts;
}

function normalizeAiChatHistoryMap(historyMap) {
  const nextMap = historyMap && typeof historyMap === 'object' ? historyMap : {};
  return Object.fromEntries(Object.entries(nextMap).map(([contactId, messages]) => [
    contactId,
    Array.isArray(messages)
      ? messages
        .map((message, index) => {
          const normalizedTime = Number.isFinite(message?.time) ? message.time : Date.now() + index;
          return {
            id: typeof message?.id === 'string' && message.id.trim() ? message.id.trim() : `${contactId}_${normalizedTime}_${index}`,
            role: message?.role === 'user' ? 'user' : 'assistant',
            content: typeof message?.content === 'string' ? message.content : '',
            time: normalizedTime,
            timeLabel: typeof message?.timeLabel === 'string' && message.timeLabel.trim()
              ? message.timeLabel.trim()
              : (typeof formatDateTimeLabel === 'function' ? formatDateTimeLabel(normalizedTime) : ''),
            pending: Boolean(message?.pending && message?.role === 'user')
          };
        })
        .filter((message) => message.content.trim())
        .slice(-80)
      : []
  ]));
}

function persistAiChatHistoryMapToLocalStorage(historyMap) {
  try {
    localStorage.setItem(storageKeys.aiChatHistory, JSON.stringify(normalizeAiChatHistoryMap(historyMap)));
  } catch (error) {
    // 忽略存储失败，保留当前会话内效果
  }
}

function getStoredAiChatHistoryMapFromLocalStorage() {
  try {
    return normalizeAiChatHistoryMap(JSON.parse(localStorage.getItem(storageKeys.aiChatHistory) || '{}'));
  } catch (error) {
    return {};
  }
}

async function getStoredAiChatHistoryMap() {
  const storedEntry = await readBleachPhoneDbEntry(indexedDbAiKeys.chatHistory);
  if (storedEntry.exists) {
    return normalizeAiChatHistoryMap(storedEntry.value);
  }
  const fallbackHistoryMap = getStoredAiChatHistoryMapFromLocalStorage();
  queueBleachPhoneAiStoreValue(indexedDbAiKeys.chatHistory, fallbackHistoryMap, persistAiChatHistoryMapToLocalStorage);
  return fallbackHistoryMap;
}

function saveAiChatHistoryMapValue(historyMap) {
  const normalizedHistoryMap = normalizeAiChatHistoryMap(historyMap);
  persistAiChatHistoryMapToLocalStorage(normalizedHistoryMap);
  queueBleachPhoneAiStoreValue(indexedDbAiKeys.chatHistory, normalizedHistoryMap, persistAiChatHistoryMapToLocalStorage);
  return normalizedHistoryMap;
}

function saveAiChatHistoryMap() {
  aiChatHistoryMap = saveAiChatHistoryMapValue(aiChatHistoryMap);
  return aiChatHistoryMap;
}

function saveThemePreference(themeName) {
  try {
    localStorage.setItem(storageKeys.theme, themeName);
  } catch (error) {
    // 忽略存储不可用的情况，保留当前会话内效果
  }
}

function saveFontSizePreference(sizeKey) {
  try {
    localStorage.setItem(storageKeys.fontSize, sizeKey);
  } catch (error) {
    // 忽略存储不可用的情况，保留当前会话内效果
  }
}

function normalizeScreenSaverEntries(entries) {
  if (!Array.isArray(entries)) return [];
  return entries
    .map((entry) => ({
      name: typeof entry?.name === 'string' ? entry.name.trim() : '',
      url: typeof entry?.url === 'string' ? entry.url.trim() : ''
    }))
    .filter((entry) => entry.url)
    .slice(0, 10);
}

function saveScreenSaverEntries() {
  try {
    if (screenSaverEntries.length) {
      localStorage.setItem(storageKeys.screenSaverWallpapers, JSON.stringify(screenSaverEntries));
    } else {
      localStorage.removeItem(storageKeys.screenSaverWallpapers);
    }
    localStorage.removeItem(storageKeys.screenSaverImageUrl);
  } catch (error) {
    // 忽略存储不可用的情况，保留当前会话内效果
  }
}

function getStoredScreenSaverEntries() {
  try {
    const storedEntries = localStorage.getItem(storageKeys.screenSaverWallpapers);
    if (storedEntries) {
      return normalizeScreenSaverEntries(JSON.parse(storedEntries));
    }

    const legacyUrl = localStorage.getItem(storageKeys.screenSaverImageUrl) || '';
    return legacyUrl.trim() ? [{ name: '', url: legacyUrl.trim() }] : [];
  } catch (error) {
    return [];
  }
}

function persistAiSettings(settings) {
  const normalizedSettings = normalizeAiSettings(settings);
  queueBleachPhoneAiStoreValue(indexedDbAiKeys.settings, normalizedSettings, persistAiSettingsToLocalStorage);
}

async function hydrateAiPersistentData() {
  const [storedAiSettings, storedAiContacts, storedAiChatHistoryMap] = await Promise.all([
    getStoredAiSettings(),
    getStoredAiContacts(),
    getStoredAiChatHistoryMap()
  ]);

  return {
    aiSettings: normalizeAiSettings(storedAiSettings),
    aiContacts: normalizeAiContacts(storedAiContacts),
    aiChatHistoryMap: normalizeAiChatHistoryMap(storedAiChatHistoryMap)
  };
}
