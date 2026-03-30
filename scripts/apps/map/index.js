// Map / 地图应用逻辑（Gemini 参考稿移植版）

const mapRangeEntries = [
  { label: '10m', radius: 10 },
  { label: '100m', radius: 100 },
  { label: '1km', radius: 1000 },
  { label: '10km', radius: 10000 }
];

const mapParserConfig = {
  payloadTag: 'map_json',
  requiredTopLevelKeys: ['points'],
  requiredPointKeys: ['x', 'y', 'name', 'range'],
  optionalPointKeys: ['id', 'category', 'desc', 'color']
};

const BLEACH_PHONE_MAP_VARIABLE_KEY = typeof BLEACH_PHONE_MAP_VARIABLE_NAME === 'string' && BLEACH_PHONE_MAP_VARIABLE_NAME.trim()
  ? BLEACH_PHONE_MAP_VARIABLE_NAME.trim()
  : 'bleach_phone_map_json';
const MAP_STATUS_AUTO_CLEAR_MS = 2400;

// 注意：AI 模块中已经声明了 BLEACH_PHONE_MAP_VARIABLE_NAME；
// 这里避免再次用 const 同名声明，防止经典 script 标签环境下发生全局词法变量重复声明，导致整个地图脚本加载失败。

const mapDemoPointEntries = [
  { id: 101, x: 1.2, y: 2.5, name: '闪光碎片', color: '#aaaaaa', range: '10m', category: '物品', desc: '路边闪闪发光的小碎片，收集起来或许能换取点券。' },
  { id: 102, x: -2.5, y: -1.8, name: '黑崎一护', color: '#f39c12', range: '10m', category: '人物', desc: '穿着校服的橙发少年，似乎正在感知附近的灵压。' },
  { id: 103, x: 3.8, y: -3.2, name: '自动贩卖机', color: '#3498db', range: '10m', category: '物品', desc: '可以购买到名为“波子汽水”的恢复道具。' },
  { id: 104, x: -0.8, y: 4.1, name: '墙上涂鸦', color: '#9b59b6', range: '10m', category: '事件', desc: '杂乱无章的涂鸦，但在灵觉状态下能看到指向巷底的箭头。' },
  { id: 105, x: 4.5, y: 0.5, name: '遗失的魂币', color: '#f1c40f', range: '10m', category: '物品', desc: '一枚刻着骷髅图案的硬币，散发着微弱的蓝色光芒。' },
  { id: 201, x: 35, y: 42, name: '24H便利店', color: '#2ecc71', range: '100m', category: '地点', desc: '全天候营业的店铺，门口贴着“冰激凌半价”的告示。' },
  { id: 202, x: -30, y: -38, name: '废弃小巷', color: '#7f8c8d', range: '100m', category: '地点', desc: '堆满杂物的巷子，是低级虚最喜欢的藏身之处。' },
  { id: 203, x: 12, y: -25, name: '朽木露琪亚', color: '#2c3e50', range: '100m', category: '人物', desc: '正拿着传令神机记录灵灾数据的死神少女。' },
  { id: 204, x: -42, y: 18, name: '石田雨龙', color: '#3498db', range: '100m', category: '人物', desc: '正在调整眼镜的冷酷少年，指间似乎有蓝色灵子在汇聚。' },
  { id: 205, x: 48, y: -15, name: '药妆店', color: '#e74c3c', range: '100m', category: '地点', desc: '售卖各种现世药物，店长正在门口派发传单。' },
  { id: 206, x: -18, y: 32, name: '灵感长椅', color: '#95a5a6', range: '100m', category: '地点', desc: '传说坐在这个长椅上的人会更容易觉醒灵力。' },
  { id: 301, x: -250, y: 380, name: '中央公园', color: '#2ecc71', range: '1km', category: '地点', desc: '空座町最大的公园，中心喷泉处经常有整灵聚集。' },
  { id: 302, x: 420, y: -320, name: '虚群活跃区', color: '#e74c3c', range: '1km', category: '事件', desc: '【警告】该区域监测到持续的撕裂反应，强力虚正在进入现世！' },
  { id: 303, x: 180, y: 220, name: '空座第一高中', color: '#f1c40f', range: '1km', category: '地点', desc: '当地知名的学校，放学后的走廊里经常能听到奇怪的动静。' },
  { id: 304, x: -410, y: -440, name: '浦原商店', color: '#16a085', range: '1km', category: '地点', desc: '地下的秘密基地，提供所有死神所需的先进补给。' },
  { id: 305, x: 320, y: 110, name: '灵压异动点', color: '#c0392b', range: '1km', category: '事件', desc: '监测到未注册的高级灵压，疑为大虚级个体出没。' },
  { id: 306, x: -120, y: -210, name: '茶渡泰虎', color: '#d35400', range: '1km', category: '人物', desc: '高大魁梧的少年，正安静地走在路上保护着一个鹦鹉笼。' },
  { id: 401, x: 2800, y: -2100, name: '中央车站', color: '#34495e', range: '10km', category: '地点', desc: '现代化的交通枢纽，电车轨道交错延伸至远方城市。' },
  { id: 402, x: -4200, y: 3200, name: '穿界门信标', color: '#ecf0f1', range: '10km', category: '地点', desc: '通往尸魂界的逻辑锚点，非授权人员无法靠近。' },
  { id: 403, x: 3800, y: 4100, name: '西北荒山', color: '#27ae60', range: '10km', category: '地点', desc: '人烟稀少的山区，常年笼罩在浓重的灵压薄雾中。' },
  { id: 404, x: -1800, y: -4600, name: '临海工业港', color: '#95a5a6', range: '10km', category: '地点', desc: '巨大的集装箱堆场，夜晚是虚和死神交战的常客。' },
  { id: 405, x: 4900, y: 2500, name: '灵子高塔', color: '#8e44ad', range: '10km', category: '地点', desc: '旧时代的遗迹，高耸入云，其顶端似乎连接着断界。' }
];

let selectedMapPointId = '';
let isMapAutoGenerateEventsBound = false;
let mapStatusAutoClearTimer = null;
let mapAutoGenerateLastHandledKeys = {
  assistant: '',
  user: ''
};

function escapeMapText(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function getMapCategoryBadgeClass(category = '') {
  const normalizedCategory = String(category || '').trim();
  switch (normalizedCategory) {
    case '人物':
      return 'is-person';
    case '事件':
      return 'is-event';
    case '地点':
      return 'is-location';
    case '物品':
      return 'is-item';
    default:
      return 'is-other';
  }
}

function getMapStatusMarkup() {
  if (!mapGenerationStatusMessage) return '';
  const isLoading = mapRequestStatus === 'loading';
  return `
    <div class="map-status-banner${isLoading ? ' is-loading' : ''}">${escapeMapText(mapGenerationStatusMessage)}</div>
  `;
}

function clearMapGenerationStatusAutoTimer() {
  if (!mapStatusAutoClearTimer) return;
  clearTimeout(mapStatusAutoClearTimer);
  mapStatusAutoClearTimer = null;
}

function setMapGenerationStatus(message = '', status = mapRequestStatus, { autoClear = false } = {}) {
  clearMapGenerationStatusAutoTimer();
  mapGenerationStatusMessage = String(message || '').trim();
  mapRequestStatus = status || 'idle';
  if (!mapGenerationStatusMessage || !autoClear) return;
  mapStatusAutoClearTimer = setTimeout(() => {
    mapStatusAutoClearTimer = null;
    mapGenerationStatusMessage = '';
    if (currentAppKey === 'map') {
      renderActiveMapWindow();
    }
  }, MAP_STATUS_AUTO_CLEAR_MS);
}

function getCurrentBleachPhoneMapChatId() {
  const ctx = typeof getSillyTavernContext === 'function' ? getSillyTavernContext() : null;
  return typeof ctx?.getCurrentChatId === 'function'
    ? (ctx.getCurrentChatId() || '')
    : String(ctx?.chatId || '');
}

async function getBleachPhoneMapVariableValue({ expectedChatId = '' } = {}) {
  const stApi = typeof getSTAPI === 'function' ? getSTAPI() : null;
  if (typeof stApi?.variables?.get !== 'function') return null;

  const currentChatId = getCurrentBleachPhoneMapChatId();
  if (!currentChatId || (expectedChatId && currentChatId !== expectedChatId)) {
    return null;
  }

  try {
    const result = await stApi.variables.get({ name: BLEACH_PHONE_MAP_VARIABLE_KEY, scope: 'local' });
    return result?.value ?? null;
  } catch (error) {
    console.warn('[地图变量] map_json 读取失败', error);
    return null;
  }
}

async function syncBleachPhoneMapVariableValue(rawValue, { expectedChatId = '' } = {}) {
  const stApi = typeof getSTAPI === 'function' ? getSTAPI() : null;
  if (typeof stApi?.variables?.set !== 'function') return false;

  const currentChatId = getCurrentBleachPhoneMapChatId();
  if (!currentChatId || (expectedChatId && currentChatId !== expectedChatId)) {
    return false;
  }

  try {
    const result = await stApi.variables.set({
      name: BLEACH_PHONE_MAP_VARIABLE_KEY,
      scope: 'local',
      value: typeof rawValue === 'string'
        ? rawValue
        : JSON.stringify(rawValue || {}, null, 2)
    });
    return result?.ok !== false;
  } catch (error) {
    console.warn('[地图变量] map_json 同步失败', error);
    return false;
  }
}

async function syncBleachPhoneMapVariableFromParsedResult(parsedResult, options = {}) {
  if (!parsedResult || typeof parsedResult !== 'object') return false;
  const payloadText = String(parsedResult.candidate || '').trim();
  const fallbackPayload = parsedResult.parsed && typeof parsedResult.parsed === 'object'
    ? JSON.stringify(parsedResult.parsed, null, 2)
    : '';
  const variableValue = payloadText || fallbackPayload;
  if (!variableValue) return false;
  return syncBleachPhoneMapVariableValue(variableValue, options);
}

function renderActiveMapWindow() {
  if (currentAppKey === 'map') {
    renderAppWindow('map');
  }
}

function clearMapData({ render = true } = {}) {
  bleachMap.loadData([]);
  bleachMap.updatePlayerPosition(0, 0);
  selectedMapPointId = '';
  if (render && currentAppKey === 'map') {
    renderActiveMapWindow();
  }
  return true;
}

async function loadBleachPhoneMapVariableToRuntime({ render = true, clearOnMissing = false } = {}) {
  const rawValue = await getBleachPhoneMapVariableValue();
  if (rawValue == null || String(rawValue).trim() === '') {
    if (clearOnMissing) {
      clearMapData({ render });
      setMapGenerationStatus('当前聊天暂无地图数据', 'idle', { autoClear: true });
      return true;
    }
    return false;
  }
  try {
    const parsedResult = parseMapAiResponse(String(rawValue));
    bleachMap.loadData(parsedResult.points);
    if (parsedResult.player) {
      bleachMap.updatePlayerPosition(parsedResult.player.x, parsedResult.player.y);
    } else {
      bleachMap.updatePlayerPosition(0, 0);
    }
    setMapGenerationStatus('已从聊天变量恢复地图', 'success', { autoClear: true });
    if (render && currentAppKey === 'map') {
      renderActiveMapWindow();
    }
    return true;
  } catch (error) {
    console.warn('[地图变量] map_json 恢复失败', error);
    if (clearOnMissing) {
      clearMapData({ render });
      setMapGenerationStatus('当前聊天地图数据无效', 'error');
      return true;
    }
    return false;
  }
}

function pickMapPlayerPosition(player = null) {
  if (!player || typeof player !== 'object') {
    return null;
  }

  const x = Number(player.x);
  const y = Number(player.y);
  if (!Number.isFinite(x) || !Number.isFinite(y)) {
    return null;
  }

  return { x, y };
}

function normalizeMapRangeLabel(rangeValue = '') {
  const rawRange = String(rangeValue || '').trim();
  if (!rawRange) return '';

  const normalizedRange = rawRange.toLowerCase().replace(/\s+/g, '');
  const exactMatch = mapRangeEntries.find((entry) => String(entry.label || '').trim().toLowerCase() === normalizedRange);
  if (exactMatch) return exactMatch.label;

  const unitMatch = normalizedRange.match(/^(-?\d+(?:\.\d+)?)(km|m)$/i);
  if (unitMatch) {
    const amount = Number(unitMatch[1]);
    const unit = String(unitMatch[2] || '').toLowerCase();
    const radius = unit === 'km' ? amount * 1000 : amount;
    const matchedEntry = mapRangeEntries.find((entry) => Math.abs(Number(entry.radius) - radius) < 1e-6);
    if (matchedEntry) return matchedEntry.label;
  }

  const numericValue = Number(normalizedRange);
  if (Number.isFinite(numericValue)) {
    const matchedEntry = mapRangeEntries.find((entry) => Math.abs(Number(entry.radius) - numericValue) < 1e-6);
    if (matchedEntry) return matchedEntry.label;
  }

  return rawRange;
}

function normalizeMapPoint(point, index = 0) {
  if (!point || typeof point !== 'object') return null;

  const x = Number(point.x);
  const y = Number(point.y);
  const name = String(point.name || '').trim();
  const range = normalizeMapRangeLabel(point.range);
  const id = String(point.id || `map-point-${index + 1}`).trim() || `map-point-${index + 1}`;
  const category = String(point.category || '').trim() || '未知';
  const desc = String(point.desc || '').trim() || '暂无详细描述信息。';
  const color = typeof point.color === 'string' ? point.color.trim() : '';

  if (!Number.isFinite(x) || !Number.isFinite(y) || !name || !range) {
    return null;
  }

  return {
    id,
    x,
    y,
    name,
    range,
    category,
    desc,
    color
  };
}

function parseMapAiResponse(rawText = '') {
  const sourceText = String(rawText || '').trim();
  if (!sourceText) {
    throw new Error('地图返回内容为空');
  }

  const taggedPayload = typeof extractTagContentWithTag === 'function'
    ? extractTagContentWithTag(sourceText, mapParserConfig.payloadTag)
    : '';
  if (!taggedPayload) {
    throw new Error(`未找到 <${mapParserConfig.payloadTag}> 标签`);
  }

  const payloadText = taggedPayload
    .replace(new RegExp(`^<${mapParserConfig.payloadTag}>|</${mapParserConfig.payloadTag}>$`, 'gi'), '')
    .trim();
  if (!payloadText) {
    throw new Error('map_json 标签内容为空');
  }

  let parsedPayload;
  try {
    parsedPayload = JSON.parse(payloadText);
  } catch (error) {
    throw new Error(`map_json 不是有效 JSON：${error?.message || '解析失败'}`);
  }

  if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
    throw new Error('map_json 顶层必须是对象');
  }

  for (const key of mapParserConfig.requiredTopLevelKeys) {
    if (!(key in parsedPayload)) {
      throw new Error(`map_json 缺少顶层字段：${key}`);
    }
  }

  if (!Array.isArray(parsedPayload.points)) {
    throw new Error('map_json.points 必须是数组');
  }

  const points = parsedPayload.points.map((point, index) => normalizeMapPoint(point, index)).filter(Boolean);
  if (!points.length) {
    throw new Error(`地图点位为空，且每个点位必须包含字段：${mapParserConfig.requiredPointKeys.join(', ')}`);
  }

  return {
    points,
    player: pickMapPlayerPosition(parsedPayload.player),
    raw: sourceText,
    parsed: parsedPayload,
    candidate: payloadText
  };
}

function getMapAutoGenerateTriggerLabel(trigger = 'assistant') {
  return getBleachPhoneAutoGenerateTriggerLabel(trigger);
}

function getMapAutoGenerateSummary(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  return getBleachPhoneAutoGenerateSummary({
    enabled: settings.mapAutoGenerateEnabled,
    trigger: settings.mapAutoGenerateTrigger,
    interval: settings.mapAutoGenerateInterval || '1'
  });
}

function getMapAutoGenerateEntries(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  return getBleachPhoneAutoGenerateEntries({
    enabled: settings.mapAutoGenerateEnabled,
    trigger: settings.mapAutoGenerateTrigger,
    interval: settings.mapAutoGenerateInterval || '1'
  });
}

function updateMapAutoGenerateSettings(patch = {}) {
  const settings = normalizeAiSettings(aiSettings);
  aiSettings = normalizeAiSettings({
    ...settings,
    ...patch
  });
  persistAiSettings(aiSettings);
  return aiSettings;
}

function getMapSettingsEntries() {
  return [
    { key: 'api', label: 'API' },
    { key: 'preset', label: '地图预设' },
    { key: 'autoGenerate', label: '自动生成' }
  ];
}

function getMapApiBindingProfiles() {
  const settings = normalizeAiSettings(aiSettings);
  return Array.isArray(settings.apiProfiles) ? settings.apiProfiles : [];
}

function getMapPresetEntries() {
  const settings = normalizeAiSettings(aiSettings);
  return Array.isArray(settings.presetEntries) ? settings.presetEntries : [];
}

function getSelectedMapPresetEntry(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  const targetPresetId = resolveSelectedAiPresetId(settings.selectedMapPresetId || settings.selectedPresetId, settings.presetEntries);
  return getAiPresetEntryById(targetPresetId, settings) || settings.presetEntries?.[0] || null;
}

function syncMapPresetSelection() {
  const presets = getMapPresetEntries();
  currentMapPresetId = resolveSelectedAiPresetId(normalizeAiSettings(aiSettings).selectedMapPresetId || currentMapPresetId || currentAiPresetId, presets);
  const currentIndex = presets.findIndex((preset) => preset.id === currentMapPresetId);
  selectedMapPresetIndex = presets.length
    ? Math.min(
      Math.max(
        selectedMapPresetIndex >= 0 ? selectedMapPresetIndex : (currentIndex >= 0 ? currentIndex : 0),
        0
      ),
      presets.length - 1
    )
    : -1;
}

function setMapSelectedPreset(presetId) {
  const settings = normalizeAiSettings(aiSettings);
  const nextPresetId = resolveSelectedAiPresetId(presetId, settings.presetEntries);
  aiSettings = normalizeAiSettings({
    ...settings,
    selectedMapPresetId: nextPresetId
  });
  currentMapPresetId = aiSettings.selectedMapPresetId;
  persistAiSettings(aiSettings);
  return currentMapPresetId;
}

function syncMapApiBindingSelection() {
  const profiles = getMapApiBindingProfiles();
  const currentBindingId = getAiBindingProfileId('map', aiSettings);
  const currentIndex = profiles.findIndex((profile) => profile.id === currentBindingId);
  selectedMapApiProfileIndex = profiles.length
    ? Math.min(
      Math.max(
        selectedMapApiProfileIndex >= 0 ? selectedMapApiProfileIndex : (currentIndex >= 0 ? currentIndex : 0),
        0
      ),
      profiles.length - 1
    )
    : -1;
}

function getMapSelectedBindingName() {
  return getAiBindingProfileName('map', aiSettings) || '未设';
}

function openMapSettings() {
  mapView = 'settings';
  selectedMapSettingsIndex = Math.min(Math.max(selectedMapSettingsIndex, 0), Math.max(getMapSettingsEntries().length - 1, 0));
  renderActiveMapWindow();
}

function closeMapSettings() {
  mapView = 'map';
  renderActiveMapWindow();
}

function openMapApiBindingList() {
  mapView = 'apiBinding';
  syncMapApiBindingSelection();
  renderActiveMapWindow();
}

function closeMapApiBindingList() {
  mapView = 'settings';
  renderActiveMapWindow();
}

function openMapPresetList() {
  mapView = 'preset';
  syncMapPresetSelection();
  renderActiveMapWindow();
}

function closeMapPresetList() {
  mapView = 'settings';
  renderActiveMapWindow();
}

function openMapAutoGenerateList() {
  mapView = 'autoGenerate';
  selectedMapAutoGenerateIndex = Math.min(Math.max(selectedMapAutoGenerateIndex, 0), Math.max(getMapAutoGenerateEntries().length - 1, 0));
  renderActiveMapWindow();
}

function closeMapAutoGenerateList() {
  mapView = 'settings';
  renderActiveMapWindow();
}

function openMapSettingsSelection() {
  const targetEntry = getMapSettingsEntries()[selectedMapSettingsIndex] || getMapSettingsEntries()[0];
  if (!targetEntry) return;
  if (targetEntry.key === 'api') {
    openMapApiBindingList();
    return;
  }
  if (targetEntry.key === 'preset') {
    openMapPresetList();
    return;
  }
  openMapAutoGenerateList();
}

function bindMapApiProfileSelection() {
  const profiles = getMapApiBindingProfiles();
  const targetProfile = profiles[selectedMapApiProfileIndex] || null;
  if (!targetProfile) return false;
  if (!bindAiApiProfile('map', targetProfile.id)) return false;
  closeMapApiBindingList();
  return true;
}

function bindMapPresetSelection() {
  const presets = getMapPresetEntries();
  const targetPreset = presets[selectedMapPresetIndex] || null;
  if (!targetPreset) return false;
  setMapSelectedPreset(targetPreset.id);
  closeMapPresetList();
  return true;
}

function confirmMapAutoGenerateSelection() {
  const entries = getMapAutoGenerateEntries();
  const targetEntry = entries[selectedMapAutoGenerateIndex] || entries[0] || null;
  if (!targetEntry) return false;

  const settings = normalizeAiSettings(aiSettings);
  if (targetEntry.key === 'enabled') {
    updateMapAutoGenerateSettings({ mapAutoGenerateEnabled: !settings.mapAutoGenerateEnabled });
    renderActiveMapWindow();
    return true;
  }

  if (targetEntry.key === 'trigger') {
    updateMapAutoGenerateSettings({
      mapAutoGenerateTrigger: settings.mapAutoGenerateTrigger === 'user' ? 'assistant' : 'user'
    });
    renderActiveMapWindow();
    return true;
  }

  const currentInterval = Number.parseInt(String(settings.mapAutoGenerateInterval || '1'), 10);
  const safeCurrentInterval = Number.isFinite(currentInterval) && currentInterval > 0 ? currentInterval : 1;
  updateMapAutoGenerateSettings({
    mapAutoGenerateInterval: String(Math.min(99, safeCurrentInterval + 1))
  });
  renderActiveMapWindow();
  return true;
}

function adjustMapAutoGenerateInterval(step = 1) {
  const settings = normalizeAiSettings(aiSettings);
  const currentInterval = Number.parseInt(String(settings.mapAutoGenerateInterval || '1'), 10);
  const safeCurrentInterval = Number.isFinite(currentInterval) && currentInterval > 0 ? currentInterval : 1;
  const nextInterval = Math.min(99, Math.max(1, safeCurrentInterval + step));
  if (nextInterval === safeCurrentInterval) return false;
  updateMapAutoGenerateSettings({ mapAutoGenerateInterval: String(nextInterval) });
  renderActiveMapWindow();
  return true;
}

function getMapAutoGenerateRuntimeSettings(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  const interval = Number.parseInt(String(settings.mapAutoGenerateInterval || '1'), 10);
  return {
    enabled: Boolean(settings.mapAutoGenerateEnabled),
    trigger: String(settings.mapAutoGenerateTrigger || '').trim() === 'user' ? 'user' : 'assistant',
    interval: Number.isFinite(interval) && interval > 0 ? interval : 1
  };
}

function getMapAutoGenerateChatMessages() {
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

function resetMapAutoGenerateHandledKeys() {
  mapAutoGenerateLastHandledKeys = {
    assistant: '',
    user: ''
  };
}

function buildMapAutoGenerateHandledKey(triggerType, chatId, floorCount, content = '') {
  return [
    String(chatId || '').trim(),
    String(triggerType || '').trim(),
    String(floorCount || 0),
    String(content || '').trim().slice(0, 240)
  ].join('::');
}

async function handleMapAutoGenerateChatEvent(triggerType = 'assistant') {
  const normalizedTrigger = String(triggerType || '').trim() === 'user' ? 'user' : 'assistant';
  const runtimeSettings = getMapAutoGenerateRuntimeSettings(aiSettings);
  if (!runtimeSettings.enabled || runtimeSettings.trigger !== normalizedTrigger) {
    return false;
  }

  const activeChatId = typeof getCurrentSTChatId === 'function'
    ? String(getCurrentSTChatId() || '').trim()
    : String(getCurrentBleachPhoneMapChatId() || '').trim();
  if (!activeChatId) {
    return false;
  }

  const chatMessages = getMapAutoGenerateChatMessages();
  if (!chatMessages.length) {
    return false;
  }

  const targetMessages = chatMessages.filter((message) => message.role === normalizedTrigger && String(message.content || '').trim());
  const floorCount = targetMessages.length;
  if (!floorCount || floorCount % runtimeSettings.interval !== 0) {
    return false;
  }

  const latestMessage = targetMessages[targetMessages.length - 1] || null;
  const handledKey = buildMapAutoGenerateHandledKey(normalizedTrigger, activeChatId, floorCount, latestMessage?.content || '');
  if (mapAutoGenerateLastHandledKeys[normalizedTrigger] === handledKey) {
    return false;
  }
  mapAutoGenerateLastHandledKeys[normalizedTrigger] = handledKey;

  try {
    return await generateMapDataFromApi();
  } catch (error) {
    console.error(`[地图自动生成] ${normalizedTrigger === 'user' ? '用户' : 'AI'}消息触发失败`, error);
    return false;
  }
}

function bindMapAutoGenerateEvents() {
  if (isMapAutoGenerateEventsBound) return true;
  const ctx = typeof getSillyTavernContext === 'function' ? getSillyTavernContext() : null;
  if (typeof ctx?.eventSource?.on !== 'function') return false;

  const messageReceivedEvent = ctx?.eventTypes?.MESSAGE_RECEIVED || 'message_received';
  const messageSentEvent = ctx?.eventTypes?.MESSAGE_SENT || 'message_sent';
  const chatChangedEvent = ctx?.eventTypes?.CHAT_CHANGED || 'chat_id_changed';
  const handleAssistantMessage = () => {
    Promise.resolve().then(() => handleMapAutoGenerateChatEvent('assistant')).catch((error) => {
      console.error('[地图自动生成] AI消息事件处理失败', error);
    });
  };
  const handleUserMessage = () => {
    Promise.resolve().then(() => handleMapAutoGenerateChatEvent('user')).catch((error) => {
      console.error('[地图自动生成] 用户消息事件处理失败', error);
    });
  };
  const handleChatChanged = async () => {
    resetMapAutoGenerateHandledKeys();
    await loadBleachPhoneMapVariableToRuntime({ clearOnMissing: true, render: false });
    if (currentAppKey === 'map') {
      renderActiveMapWindow();
    }
  };

  ctx.eventSource.on(messageReceivedEvent, handleAssistantMessage);
  ctx.eventSource.on(messageSentEvent, handleUserMessage);
  ctx.eventSource.on(chatChangedEvent, handleChatChanged);
  if (ctx?.eventTypes?.CHAT_LOADED) {
    ctx.eventSource.on(ctx.eventTypes.CHAT_LOADED, handleChatChanged);
  }
  isMapAutoGenerateEventsBound = true;
  return true;
}

function isMapPrimaryView() {
  return mapView === 'map';
}

async function buildMapGenerationMessages() {
  const presetEntry = getSelectedMapPresetEntry(aiSettings);
  if (!presetEntry?.blocks?.length) {
    throw createSilentAiChatError('地图生成未配置地图预设');
  }
  const messages = await buildAiMessagesFromPreset(null, '', presetEntry, { pendingTargets: [] });
  const normalizedMessages = Array.isArray(messages)
    ? messages.filter((message) => String(message?.content || '').trim())
    : [];
  if (!normalizedMessages.length) {
    throw createSilentAiChatError('地图预设内容为空');
  }
  return normalizedMessages;
}

async function requestAiMapReply() {
  const settings = getAiRuntimeSettings('map', aiSettings);
  if (!settings.url) throw createSilentAiChatError('地图生成未绑定 API');
  if (!settings.key) throw createSilentAiChatError('地图生成未配置 API Key');
  if (!settings.model) throw createSilentAiChatError('地图生成未配置模型');

  const body = {
    model: settings.model,
    messages: await buildMapGenerationMessages(),
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

async function generateMapDataFromApi() {
  if (mapRequestStatus === 'loading') {
    return false;
  }

  const expectedChatId = getCurrentBleachPhoneMapChatId();
  setMapGenerationStatus('地图生成中…', 'loading');
  renderActiveMapWindow();
  let aiReplyText = '';
  try {
    aiReplyText = await requestAiMapReply();
    const parsedResult = parseMapAiResponse(aiReplyText);
    bleachMap.loadData(parsedResult.points);
    if (parsedResult.player) {
      bleachMap.updatePlayerPosition(parsedResult.player.x, parsedResult.player.y);
    }
    const variableSynced = await syncBleachPhoneMapVariableFromParsedResult(parsedResult, { expectedChatId });
    if (!variableSynced) {
      console.warn('[地图变量] map_json 未写入酒馆变量', { variableName: BLEACH_PHONE_MAP_VARIABLE_KEY });
    }
    setMapGenerationStatus(`地图已更新 · ${parsedResult.points.length} 个点位${variableSynced ? '' : ' · 变量未同步'}`, 'success', { autoClear: true });
    renderActiveMapWindow();
    return true;
  } catch (error) {
    const message = error?.silent
      ? String(error.message || '').trim()
      : `生成失败：${String(error?.message || '未知错误').trim() || '未知错误'}`;
    setMapGenerationStatus(message, 'error');
    console.error('[地图] 生成失败', error);
    if (aiReplyText) {
      console.error('[地图] AI 原始回复内容：\n' + aiReplyText);
    }
    renderActiveMapWindow();
    return false;
  }
}

async function triggerMapGenerationFromSoftkey() {
  return generateMapDataFromApi();
}

class BleachMap {
  constructor() {
    this.container = null;
    this.viewportContent = null;
    this.viewportContainer = null;
    this.gridLayer = null;
    this.descPanel = null;
    this.playerPos = { x: 0, y: 0 };
    this.points = mapDemoPointEntries.map((point, index) => normalizeMapPoint(point, index)).filter(Boolean);
    this.ranges = mapRangeEntries.slice();
    this.currentRangeIndex = 1;
    this.handleWindowResizeBound = this.handleWindowResize.bind(this);
    window.addEventListener('resize', this.handleWindowResizeBound);
  }

  mount(container) {
    if (!(container instanceof HTMLElement)) return;

    this.container = container;
    this.initDOM();

    const selectedPoint = this.getSelectedPoint();
    if (selectedPoint) {
      this.showDescription(selectedPoint);
    } else {
      this.showEmptyDescription();
    }

    this.render();
  }

  initDOM() {
    if (!this.container) return;

    this.container.innerHTML = `
      <div class="map-viewport-wrapper">
        <div class="map-viewport">
          <div class="map-grid-layer"></div>
          <div class="map-viewport-content"></div>
          <div class="map-player-marker"></div>
        </div>
      </div>
      <div class="map-description-panel" id="map-desc-panel"></div>
    `;

    this.viewportContent = this.container.querySelector('.map-viewport-content');
    this.viewportContainer = this.container.querySelector('.map-viewport');
    this.gridLayer = this.container.querySelector('.map-grid-layer');
    this.descPanel = this.container.querySelector('#map-desc-panel');
  }

  handleWindowResize() {
    if (currentAppKey !== 'map' || !isMapPrimaryView()) return;
    this.render();
  }

  getCurrentRange() {
    return this.ranges[this.currentRangeIndex] || this.ranges[0] || { label: '100m', radius: 100 };
  }

  getCurrentRangeLabel() {
    return this.getCurrentRange().label;
  }

  getSelectedPoint() {
    if (!selectedMapPointId) return null;
    return this.points.find((point) => String(point.id) === String(selectedMapPointId)) || null;
  }

  getCurrentRangePoints() {
    const currentRangeLabel = this.getCurrentRangeLabel();
    return this.points.filter((point) => point.range === currentRangeLabel);
  }

  selectCurrentRangePoint(step = 1) {
    const normalizedStep = step < 0 ? -1 : 1;
    const hasSelectedPoint = Boolean(String(selectedMapPointId || '').trim());
    if (!hasSelectedPoint) return false;

    const currentRangePoints = this.getCurrentRangePoints();
    if (!currentRangePoints.length) return false;

    const currentIndex = currentRangePoints.findIndex((point) => String(point.id) === String(selectedMapPointId));
    const nextIndex = currentIndex >= 0
      ? (currentIndex + normalizedStep + currentRangePoints.length) % currentRangePoints.length
      : (normalizedStep > 0 ? 0 : currentRangePoints.length - 1);
    const nextPoint = currentRangePoints[nextIndex] || null;
    if (!nextPoint) return false;

    this.showDescription(nextPoint);
    this.render();
    return true;
  }

  resolvePointColor(point) {
    return String(
      point.color
      || 'var(--accent)'
    ).trim() || 'var(--accent)';
  }

  showEmptyDescription() {
    if (!this.descPanel) return;
    this.descPanel.innerHTML = `
      <div class="map-description-content-wrapper">
        <div class="desc-empty">点击地图上的点位查看详情</div>
      </div>
    `;
  }

  showDescription(point) {
    if (!point || !this.descPanel) return;

    selectedMapPointId = String(point.id || '');
    const categoryText = String(point.category || '未知').trim() || '未知';
    const categoryClass = getMapCategoryBadgeClass(categoryText);
    this.descPanel.innerHTML = `
      <div class="map-description-content-wrapper">
        <div class="desc-header">
          <span class="desc-title">${escapeMapText(point.name)}</span>
          <span class="desc-category ${categoryClass}">${escapeMapText(categoryText)}</span>
        </div>
        <div class="desc-content">${escapeMapText(point.desc || '暂无详细描述信息。')}</div>
      </div>
    `;
  }

  loadData(jsonData) {
    try {
      const nextData = typeof jsonData === 'string' ? JSON.parse(jsonData) : jsonData;
      this.points = Array.isArray(nextData)
        ? nextData.map((point, index) => normalizeMapPoint(point, index)).filter(Boolean)
        : [];

      const selectedPoint = this.getSelectedPoint();
      if (!selectedPoint) {
        selectedMapPointId = '';
      }

      if (this.container) {
        if (selectedPoint) {
          this.showDescription(selectedPoint);
        } else {
          this.showEmptyDescription();
        }
        this.render();
      }
      return true;
    } catch (error) {
      console.error('地图数据解析失败:', error);
      return false;
    }
  }

  updatePlayerPosition(x, y) {
    const nextX = Number(x);
    const nextY = Number(y);
    this.playerPos = {
      x: Number.isFinite(nextX) ? nextX : 0,
      y: Number.isFinite(nextY) ? nextY : 0
    };
    this.render();
  }

  zoom(direction) {
    const nextIndex = this.currentRangeIndex + direction;
    if (nextIndex < 0 || nextIndex >= this.ranges.length) {
      return false;
    }

    this.currentRangeIndex = nextIndex;
    this.render();
    if (typeof updateTime === 'function') {
      updateTime();
    }
    return true;
  }

  cycleRange(step = 1) {
    if (!this.ranges.length) return;

    const total = this.ranges.length;
    const nextIndex = (this.currentRangeIndex + step + total) % total;
    this.currentRangeIndex = nextIndex;
    this.render();
    if (typeof updateTime === 'function') {
      updateTime();
    }
  }

  render() {
    if (!this.container || !this.viewportContainer || !this.viewportContent || !this.gridLayer) return;

    const viewWidth = this.viewportContainer.clientWidth || this.viewportContainer.getBoundingClientRect().width;
    if (!viewWidth) return;

    const range = this.getCurrentRange();
    const safePadding = 12;
    const usableWidth = Math.max(viewWidth - safePadding * 2, 1);
    const rangeRadius = Number(range.radius);
    const safeRangeRadius = Number.isFinite(rangeRadius) && rangeRadius > 0 ? rangeRadius : 100;
    const visibleDiameter = safeRangeRadius * 2;
    const scale = usableWidth / visibleDiameter;
    const pxPerGrid = usableWidth / 10;

    this.gridLayer.style.backgroundSize = `${pxPerGrid}px ${pxPerGrid}px`;

    const offsetX = -this.playerPos.x * scale;
    const offsetY = this.playerPos.y * scale;
    this.gridLayer.style.backgroundPosition = `calc(50% + ${offsetX}px) calc(50% + ${offsetY}px)`;

    this.viewportContent.innerHTML = '';

    const currentRangePoints = this.getCurrentRangePoints();
    currentRangePoints.forEach((point) => {
      const dx = point.x - this.playerPos.x;
      const dy = point.y - this.playerPos.y;
      const px = dx * scale;
      const py = -dy * scale;
      const color = this.resolvePointColor(point);
      const isSelected = String(point.id) === String(selectedMapPointId);

      const pointElement = document.createElement('div');
      pointElement.className = `map-point${isSelected ? ' is-selected' : ''}`;
      pointElement.style.left = `${px}px`;
      pointElement.style.top = `${py}px`;
      pointElement.innerHTML = `
        <div class="map-point-icon" style="--map-point-color: ${escapeMapText(color)};"></div>
        <div class="map-point-label">${escapeMapText(point.name)}</div>
      `;
      pointElement.addEventListener('click', (event) => {
        event.stopPropagation();
        this.showDescription(point);
        this.render();
      });

      this.viewportContent.appendChild(pointElement);
    });
  }
}

const bleachMap = new BleachMap();

function renderMapSettingsView() {
  const entries = getMapSettingsEntries();
  return `
    ${getMapStatusMarkup()}
    <div class="contact-saved-list" id="map-settings-list">
      ${entries.map((entry, index) => {
        const previewText = entry.key === 'api'
          ? getMapSelectedBindingName()
          : (entry.key === 'preset'
            ? (getSelectedMapPresetEntry(aiSettings)?.name || '未设')
            : getMapAutoGenerateSummary(aiSettings));
        return `
          <div class="contact-saved-item map-settings-item ${selectedMapSettingsIndex === index ? 'is-selected' : ''}" data-map-settings-index="${index}" data-map-settings-key="${entry.key}">
            <div class="contact-saved-main">
              <span class="contact-saved-name">${escapeMapText(entry.label)}</span>
              <span class="contact-saved-preview">${escapeMapText(previewText)}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderMapApiBindingView() {
  const profiles = getMapApiBindingProfiles();
  if (!profiles.length) {
    return `${getMapStatusMarkup()}<div class="sms-settings-empty-view">暂无 API 配置</div>`;
  }

  const currentBindingId = getAiBindingProfileId('map', aiSettings);
  return `
    ${getMapStatusMarkup()}
    <div class="contact-saved-list" id="map-api-profile-list">
      ${profiles.map((profile, index) => `
        <div class="contact-saved-item map-api-profile-item ${selectedMapApiProfileIndex === index ? 'is-selected' : ''}" data-map-api-profile-index="${index}">
          <div class="contact-saved-main">
            <span class="contact-saved-name">${escapeMapText(profile.name || '默认')}</span>
            <span class="contact-saved-preview">${currentBindingId === profile.id ? '当前使用' : escapeMapText(getAiApiHostLabel(profile.url) || '未设端点')}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderMapPresetView() {
  const presets = getMapPresetEntries();
  if (!presets.length) {
    return `${getMapStatusMarkup()}<div class="sms-settings-empty-view">暂无预设</div>`;
  }

  return `
    ${getMapStatusMarkup()}
    <div class="contact-saved-list" id="map-preset-list">
      ${presets.map((preset, index) => `
        <div class="contact-saved-item map-preset-item ${selectedMapPresetIndex === index ? 'is-selected' : ''}" data-map-preset-index="${index}">
          <div class="contact-saved-main">
            <span class="contact-saved-name">${escapeMapText(preset.name || `预设 ${index + 1}`)}</span>
            <span class="contact-saved-preview">${currentMapPresetId === preset.id ? '当前使用' : `${Array.isArray(preset.blocks) ? preset.blocks.length : 0} 个块`}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderMapAutoGenerateView() {
  return renderBleachPhoneAutoGenerateSettingsView({
    statusMarkup: getMapStatusMarkup(),
    listId: 'map-auto-generate-list',
    itemClassName: 'map-auto-generate-item',
    selectedIndex: selectedMapAutoGenerateIndex,
    entries: getMapAutoGenerateEntries(),
    escapeText: escapeMapText,
    dataIndexAttr: 'data-map-auto-generate-index',
    dataKeyAttr: 'data-map-auto-generate-key'
  });
}

function renderMapMainView() {
  return '<div class="map-app-shell" id="map-app-shell"></div>';
}

function renderMapContent() {
  if (mapView === 'settings') {
    return renderMapSettingsView();
  }

  if (mapView === 'apiBinding') {
    return renderMapApiBindingView();
  }

  if (mapView === 'preset') {
    return renderMapPresetView();
  }

  if (mapView === 'autoGenerate') {
    return renderMapAutoGenerateView();
  }

  return renderMapMainView();
}

function mountMapApp() {
  if (!isMapPrimaryView()) return;
  const container = document.getElementById('map-app-shell');
  if (!container) return;
  bleachMap.mount(container);
}

function getMapCurrentRangeLabel() {
  return bleachMap.getCurrentRangeLabel();
}

function cycleMapRange() {
  bleachMap.cycleRange(1);
}

function zoomMapRange(direction) {
  return bleachMap.zoom(direction);
}

function moveMapSelection(direction) {
  if (mapView === 'settings') {
    const entries = getMapSettingsEntries();
    const settingsList = document.getElementById('map-settings-list');
    if (settingsList) {
      mapSettingsListScrollTop = settingsList.scrollTop;
    }
    if (!entries.length) return;
    if (direction === 'up') {
      selectedMapSettingsIndex = Math.max(0, selectedMapSettingsIndex - 1);
      renderActiveMapWindow();
      return;
    }
    if (direction === 'down') {
      selectedMapSettingsIndex = Math.min(entries.length - 1, selectedMapSettingsIndex + 1);
      renderActiveMapWindow();
    }
    return;
  }

  if (mapView === 'apiBinding') {
    const profiles = getMapApiBindingProfiles();
    const profileList = document.getElementById('map-api-profile-list');
    if (profileList) {
      mapApiProfileListScrollTop = profileList.scrollTop;
    }
    if (!profiles.length) return;
    if (direction === 'up') {
      selectedMapApiProfileIndex = Math.max(0, selectedMapApiProfileIndex - 1);
      renderActiveMapWindow();
      return;
    }
    if (direction === 'down') {
      selectedMapApiProfileIndex = Math.min(profiles.length - 1, selectedMapApiProfileIndex + 1);
      renderActiveMapWindow();
    }
    return;
  }

  if (mapView === 'preset') {
    const presets = getMapPresetEntries();
    const presetList = document.getElementById('map-preset-list');
    if (presetList) {
      mapPresetListScrollTop = presetList.scrollTop;
    }
    if (!presets.length) return;
    if (direction === 'up') {
      selectedMapPresetIndex = Math.max(0, selectedMapPresetIndex - 1);
      renderActiveMapWindow();
      return;
    }
    if (direction === 'down') {
      selectedMapPresetIndex = Math.min(presets.length - 1, selectedMapPresetIndex + 1);
      renderActiveMapWindow();
    }
    return;
  }

  if (mapView === 'autoGenerate') {
    const entries = getMapAutoGenerateEntries();
    const autoGenerateList = document.getElementById('map-auto-generate-list');
    if (autoGenerateList) {
      mapAutoGenerateListScrollTop = autoGenerateList.scrollTop;
    }
    if (!entries.length) return;
    if (direction === 'up') {
      selectedMapAutoGenerateIndex = Math.max(0, selectedMapAutoGenerateIndex - 1);
      renderActiveMapWindow();
      return;
    }
    if (direction === 'down') {
      selectedMapAutoGenerateIndex = Math.min(entries.length - 1, selectedMapAutoGenerateIndex + 1);
      renderActiveMapWindow();
      return;
    }
    if (selectedMapAutoGenerateIndex === 2) {
      if (direction === 'left') {
        adjustMapAutoGenerateInterval(-1);
        return;
      }
      if (direction === 'right') {
        adjustMapAutoGenerateInterval(1);
      }
    }
    return;
  }

  if (direction === 'up') {
    bleachMap.selectCurrentRangePoint(-1);
    return;
  }
  if (direction === 'down') {
    bleachMap.selectCurrentRangePoint(1);
    return;
  }
  if (direction === 'left') {
    zoomMapRange(-1);
    return;
  }
  if (direction === 'right') {
    zoomMapRange(1);
  }
}

function loadMapData(jsonData) {
  return bleachMap.loadData(jsonData);
}

function updateMapPlayerPosition(x, y) {
  bleachMap.updatePlayerPosition(x, y);
}
