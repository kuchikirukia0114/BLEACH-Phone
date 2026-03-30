// Weather / 天气应用逻辑

const weatherParserConfig = {
  payloadTag: 'weather_json',
  requiredTopLevelKeys: ['entries'],
  requiredEntryKeys: ['key'],
  optionalEntryKeys: ['desc', 'temp', 'current_temp', 'humidity', 'wind']
};

const BLEACH_PHONE_WEATHER_VARIABLE_KEY = 'bleach_phone_weather_json';
const WEATHER_STATUS_AUTO_CLEAR_MS = 2400;

let isBleachPhoneWeatherVariableEventsBound = false;
let isWeatherAutoGenerateEventsBound = false;
let weatherStatusAutoClearTimer = null;
let weatherAutoGenerateLastHandledKeys = {
  assistant: '',
  user: ''
};

function escapeWeatherText(value = '') {
  if (typeof escapeHtml === 'function') {
    return escapeHtml(String(value == null ? '' : value));
  }
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/\"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderActiveWeatherWindow() {
  if (currentAppKey === 'weather') {
    renderAppWindow('weather');
  }
}

function getWeatherAppBody() {
  if (typeof currentAppKey !== 'undefined' && currentAppKey !== 'weather') {
    return null;
  }
  return document.getElementById('app-window-body');
}

function getWeatherSvgMarkup(key) {
  const iconMap = window.BLEACH_PHONE_WEATHER_ICON_MAP;
  if (!iconMap || typeof iconMap !== 'object') {
    return '';
  }
  return String(iconMap[key] || '');
}

function getWeatherCatalogEntries() {
  return Array.isArray(window.BLEACH_PHONE_WEATHER_ENTRIES) ? window.BLEACH_PHONE_WEATHER_ENTRIES : [];
}

function getWeatherCatalogEntryByKey(key = '') {
  const safeKey = String(key || '').trim();
  if (!safeKey) return null;
  return getWeatherCatalogEntries().find((entry) => String(entry?.key || '').trim() === safeKey) || null;
}

function buildWeatherDefaultParams(tempText) {
  const baseTemp = Number.parseInt(String(tempText || '').split('°')[0], 10) || 20;
  return {
    currentTemp: `${baseTemp + Math.floor(Math.random() * 3)}°C`,
    humidity: `${Math.floor(Math.random() * 40) + 40}%`,
    wind: `${Math.floor(Math.random() * 5) + 1}级`
  };
}

function normalizeWeatherParamValue(value, fallback = '') {
  const text = String(value == null ? '' : value).trim();
  return text || String(fallback || '').trim();
}

function resolveWeatherEntryKey(entry, { date = null } = {}) {
  if (!entry || typeof entry !== 'object') return '';

  const explicitKey = String(entry.key || '').trim();
  if (explicitKey && getWeatherSvgMarkup(explicitKey)) {
    return explicitKey;
  }

  const descText = String(entry.desc ?? entry.text ?? entry.label ?? '').trim();
  if (!descText) return '';

  const detectedBaseKey = detectWeatherBaseKeyFromText(descText);
  if (!detectedBaseKey) return '';

  const resolvedDate = date instanceof Date && !Number.isNaN(date.getTime())
    ? new Date(date.getTime())
    : getWeatherTimeSourceDate();
  const displayKey = resolveWeatherDisplayKeyByTime(detectedBaseKey, { date: resolvedDate });
  if (displayKey && getWeatherSvgMarkup(displayKey)) {
    return displayKey;
  }

  return getWeatherSvgMarkup(detectedBaseKey) ? detectedBaseKey : '';
}

function normalizeWeatherEntry(entry, index = 0, { allowCatalogFallback = true, timeMeta = null } = {}) {
  if (!entry || typeof entry !== 'object') return null;
  const resolvedDate = timeMeta?.sourceDate instanceof Date && !Number.isNaN(timeMeta.sourceDate.getTime())
    ? new Date(timeMeta.sourceDate.getTime())
    : null;
  const key = resolveWeatherEntryKey(entry, { date: resolvedDate });
  if (!key) return null;

  const catalogEntry = allowCatalogFallback ? getWeatherCatalogEntryByKey(key) : null;
  const desc = String(entry.desc ?? catalogEntry?.desc ?? '').trim();
  const temp = String(entry.temp ?? catalogEntry?.temp ?? '').trim();
  const color = String(catalogEntry?.color ?? 'var(--weather-sun)').trim() || 'var(--weather-sun)';
  if (!desc || !temp) return null;

  const derivedParams = buildWeatherDefaultParams(temp);
  const currentTemp = normalizeWeatherParamValue(entry.current_temp ?? entry.currentTemp, derivedParams.currentTemp);
  const humidity = normalizeWeatherParamValue(entry.humidity ?? entry.hum, derivedParams.humidity);
  const wind = normalizeWeatherParamValue(entry.wind, derivedParams.wind);

  return {
    id: String(entry.id || `weather-entry-${index + 1}`).trim() || `weather-entry-${index + 1}`,
    key,
    desc,
    temp,
    color,
    currentTemp,
    humidity,
    wind
  };
}

function getWeatherDefaultEntries() {
  return getWeatherCatalogEntries()
    .map((entry, index) => normalizeWeatherEntry(entry, index, { allowCatalogFallback: false }))
    .filter(Boolean);
}

let weatherRuntimeEntries = getWeatherDefaultEntries();
let currentWeatherIndex = weatherRuntimeEntries.length ? 0 : -1;

function getWeatherEntries() {
  return Array.isArray(weatherRuntimeEntries) ? weatherRuntimeEntries : [];
}

function getWeatherSafeIndex(index = currentWeatherIndex) {
  const entries = getWeatherEntries();
  if (!entries.length) return -1;
  const parsedIndex = Number(index);
  if (!Number.isInteger(parsedIndex)) return 0;
  return Math.min(Math.max(parsedIndex, 0), entries.length - 1);
}

function getCurrentWeatherEntry() {
  const safeIndex = getWeatherSafeIndex();
  return safeIndex >= 0 ? getWeatherEntries()[safeIndex] : null;
}

const WEATHER_NIGHT_START_HOUR = 18;
const WEATHER_NIGHT_END_HOUR = 6;
const WEATHER_NIGHT_KEY_MAP = {
  sunny: 'nightSunny',
  cloudy: 'nightCloudy',
  overcast: 'nightOvercast',
  drizzle: 'nightRain',
  lightRain: 'nightRain',
  moderateRain: 'nightRain',
  heavyRain: 'nightHeavyRain',
  rainstorm: 'nightHeavyRain',
  lightSnow: 'nightSnow',
  moderateSnow: 'nightSnow',
  heavySnow: 'nightSnow',
  blizzard: 'nightSnow'
};
const WEATHER_BASE_KEY_MAP = Object.entries(WEATHER_NIGHT_KEY_MAP).reduce((result, [dayKey, nightKey]) => {
  result[nightKey] = dayKey;
  return result;
}, {});
const WEATHER_TEXT_DETECTION_RULES = [
  { baseKey: 'typhoon', aliases: ['台风'] },
  { baseKey: 'tornado', aliases: ['龙卷风'] },
  { baseKey: 'sandstorm', aliases: ['沙尘暴'] },
  { baseKey: 'strongThunderShower', aliases: ['强雷阵雨'] },
  { baseKey: 'thunderShower', aliases: ['雷阵雨'] },
  { baseKey: 'lightning', aliases: ['雷暴', '闪电'] },
  { baseKey: 'rainstorm', aliases: ['暴雨'] },
  { baseKey: 'storm', aliases: ['暴风雨'] },
  { baseKey: 'heavyRain', aliases: ['大雨'] },
  { baseKey: 'moderateRain', aliases: ['中雨'] },
  { baseKey: 'lightRain', aliases: ['小雨'] },
  { baseKey: 'drizzle', aliases: ['细雨', '毛毛雨'] },
  { baseKey: 'sleet', aliases: ['雨夹雪'] },
  { baseKey: 'freezingRain', aliases: ['冻雨'] },
  { baseKey: 'hail', aliases: ['冰雹'] },
  { baseKey: 'blizzard', aliases: ['暴雪'] },
  { baseKey: 'heavySnow', aliases: ['大雪'] },
  { baseKey: 'moderateSnow', aliases: ['中雪'] },
  { baseKey: 'lightSnow', aliases: ['小雪'] },
  { baseKey: 'mist', aliases: ['薄雾'] },
  { baseKey: 'fog', aliases: ['大雾', '浓雾', '雾'] },
  { baseKey: 'haze', aliases: ['霾'] },
  { baseKey: 'dust', aliases: ['扬沙'] },
  { baseKey: 'sand', aliases: ['沙尘'] },
  { baseKey: 'wind', aliases: ['大风', '强风', '狂风'] },
  { baseKey: 'sunny', aliases: ['晴朗', '晴天', '放晴', '晴'] },
  { baseKey: 'cloudy', aliases: ['多云'] },
  { baseKey: 'overcast', aliases: ['阴天', '阴沉', '转阴', '阴'] },
  { baseKey: 'lightRain', aliases: ['下雨', '有雨', '雨天', '雨'] },
  { baseKey: 'lightSnow', aliases: ['下雪', '有雪', '雪天', '雪'] }
];

const WEATHER_WEEKDAY_LABELS = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];

let currentWeatherDetectedBaseKey = '';
let currentWeatherTimeBucket = '';
let weatherRuntimeTimeMeta = {
  date: '',
  weekday: '',
  time: '',
  sourceDate: null,
  isPresetTime: false
};

function getWeatherSafeDate(value, fallback = Date.now()) {
  const fallbackDate = fallback instanceof Date ? new Date(fallback.getTime()) : new Date(fallback);
  const safeFallback = Number.isNaN(fallbackDate.getTime()) ? new Date() : fallbackDate;
  const nextDate = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(nextDate.getTime()) ? safeFallback : nextDate;
}

function formatWeatherDateText(date = Date.now()) {
  const safeDate = getWeatherSafeDate(date);
  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getDate()).padStart(2, '0');
  return `${year}.${month}.${day}`;
}

function formatWeatherTimeText(date = Date.now()) {
  const safeDate = getWeatherSafeDate(date);
  const hours = String(safeDate.getHours()).padStart(2, '0');
  const minutes = String(safeDate.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function getWeatherWeekdayLabel(date = Date.now()) {
  const safeDate = getWeatherSafeDate(date);
  return WEATHER_WEEKDAY_LABELS[safeDate.getDay()] || '';
}

function getWeatherLocalTimeMeta(date = null) {
  const localDate = date != null
    ? getWeatherSafeDate(date)
    : getWeatherSafeDate(typeof getPhoneDisplayTimeValue === 'function' ? getPhoneDisplayTimeValue() : new Date());
  return {
    date: formatWeatherDateText(localDate),
    weekday: getWeatherWeekdayLabel(localDate),
    time: formatWeatherTimeText(localDate),
    sourceDate: localDate,
    isPresetTime: false
  };
}

function parseWeatherDateParts(dateText = '') {
  const normalizedText = String(dateText || '').trim();
  if (!normalizedText) return null;
  const sanitizedText = normalizedText.replace(/[年月]/g, '-').replace(/[日号]/g, '');
  const match = sanitizedText.match(/(\d{4})\D+(\d{1,2})\D+(\d{1,2})/);
  if (!match) return null;
  const year = Number.parseInt(match[1], 10);
  const month = Number.parseInt(match[2], 10);
  const day = Number.parseInt(match[3], 10);
  if (!Number.isFinite(year) || !Number.isFinite(month) || !Number.isFinite(day)) return null;
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  return { year, month, day };
}

function parseWeatherTimeParts(timeText = '') {
  const normalizedText = String(timeText || '').trim().replace(/：/g, ':');
  if (!normalizedText) return null;
  const match = normalizedText.match(/(\d{1,2})\D+(\d{1,2})(?:\D+(\d{1,2}))?/);
  if (!match) return null;
  const hours = Number.parseInt(match[1], 10);
  const minutes = Number.parseInt(match[2], 10);
  const seconds = Number.parseInt(match[3] || '0', 10);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes) || !Number.isFinite(seconds)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59 || seconds < 0 || seconds > 59) return null;
  return { hours, minutes, seconds };
}

function resolveWeatherTimeMeta(timeSource = null, { fallbackToLocal = false } = {}) {
  const normalizedTimeSource = timeSource && typeof timeSource === 'object' && !Array.isArray(timeSource)
    ? String(timeSource.time_source ?? timeSource.timeSource ?? '').trim().toLowerCase()
    : '';

  if (timeSource && typeof timeSource === 'object' && !Array.isArray(timeSource)) {
    const sourceDate = timeSource.sourceDate instanceof Date && !Number.isNaN(timeSource.sourceDate.getTime())
      ? new Date(timeSource.sourceDate.getTime())
      : null;
    if (sourceDate) {
      return {
        date: String(timeSource.date || formatWeatherDateText(sourceDate)).trim(),
        weekday: String(timeSource.weekday || getWeatherWeekdayLabel(sourceDate)).trim(),
        time: String(timeSource.time || formatWeatherTimeText(sourceDate)).trim(),
        sourceDate,
        isPresetTime: typeof timeSource.isPresetTime === 'boolean'
          ? timeSource.isPresetTime
          : (normalizedTimeSource ? normalizedTimeSource !== 'local' && Boolean(String(timeSource.time || '').trim()) : Boolean(String(timeSource.time || '').trim()))
      };
    }
  }

  const localTimeMeta = getWeatherLocalTimeMeta();
  const rawDate = String(timeSource?.date || '').trim();
  const rawWeekday = String(timeSource?.weekday || '').trim();
  const rawTime = String(timeSource?.time || '').trim();
  const hasTimeFields = Boolean(rawDate || rawWeekday || rawTime);
  if (!hasTimeFields) {
    return fallbackToLocal
      ? localTimeMeta
      : {
        date: '',
        weekday: '',
        time: '',
        sourceDate: null,
        isPresetTime: false
      };
  }

  const sourceDate = new Date(localTimeMeta.sourceDate.getTime());
  const parsedDateParts = parseWeatherDateParts(rawDate);
  if (parsedDateParts) {
    sourceDate.setFullYear(parsedDateParts.year, parsedDateParts.month - 1, parsedDateParts.day);
  }
  const parsedTimeParts = parseWeatherTimeParts(rawTime);
  if (parsedTimeParts) {
    sourceDate.setHours(parsedTimeParts.hours, parsedTimeParts.minutes, parsedTimeParts.seconds, 0);
  }

  return {
    date: rawDate || formatWeatherDateText(sourceDate),
    weekday: rawWeekday || getWeatherWeekdayLabel(sourceDate),
    time: rawTime || formatWeatherTimeText(sourceDate),
    sourceDate,
    isPresetTime: normalizedTimeSource
      ? (normalizedTimeSource !== 'local' && Boolean(rawTime))
      : Boolean(rawTime)
  };
}

function getWeatherRuntimeEntryByKey(key = '') {
  const safeKey = String(key || '').trim();
  if (!safeKey) return null;
  return getWeatherEntries().find((entry) => String(entry?.key || '').trim() === safeKey) || null;
}

function getWeatherEntryByKey(key = '') {
  const safeKey = String(key || '').trim();
  if (!safeKey) return null;
  return getWeatherRuntimeEntryByKey(safeKey)
    || normalizeWeatherEntry(getWeatherCatalogEntryByKey(safeKey), 0, { allowCatalogFallback: false });
}

function getWeatherCurrentTimeMeta({ fallbackToLocal = true } = {}) {
  return resolveWeatherTimeMeta(weatherRuntimeTimeMeta, { fallbackToLocal });
}

function getWeatherTimeSourceDate() {
  const runtimeTimeMeta = getWeatherCurrentTimeMeta({ fallbackToLocal: true });
  if (runtimeTimeMeta.isPresetTime && runtimeTimeMeta.sourceDate) {
    return new Date(runtimeTimeMeta.sourceDate.getTime());
  }
  return getWeatherLocalTimeMeta().sourceDate;
}

function getWeatherTimeBucket(date = getWeatherTimeSourceDate()) {
  const safeDate = getWeatherSafeDate(date);
  const hour = safeDate.getHours();
  return hour >= WEATHER_NIGHT_START_HOUR || hour < WEATHER_NIGHT_END_HOUR ? 'night' : 'day';
}

function isWeatherNightTime(date = getWeatherTimeSourceDate()) {
  return getWeatherTimeBucket(date) === 'night';
}

function normalizeWeatherDetectedBaseKey(key = '') {
  const safeKey = String(key || '').trim();
  return WEATHER_BASE_KEY_MAP[safeKey] || safeKey;
}

function resolveWeatherDisplayKeyByTime(key = '', { date = getWeatherTimeSourceDate() } = {}) {
  const baseKey = normalizeWeatherDetectedBaseKey(key);
  if (!baseKey) return '';
  return isWeatherNightTime(date) ? (WEATHER_NIGHT_KEY_MAP[baseKey] || baseKey) : baseKey;
}

function getLatestWeatherAssistantText() {
  const ctx = typeof getSillyTavernContext === 'function' ? getSillyTavernContext() : null;
  const rawMessages = Array.isArray(ctx?.chat) ? ctx.chat : [];
  for (let index = rawMessages.length - 1; index >= 0; index -= 1) {
    const message = rawMessages[index];
    const rawRole = String(message?.role || '').trim().toLowerCase();
    const isAssistantMessage = rawRole === 'assistant'
      || rawRole === 'model'
      || message?.is_user === false;
    if (!isAssistantMessage) continue;
    const text = typeof getTextFromSTMessage === 'function'
      ? getTextFromSTMessage(message)
      : String(message?.content || message?.mes || '').trim();
    if (text) return text;
  }
  return '';
}

function detectWeatherBaseKeyFromText(text = '') {
  const sourceText = String(text || '').trim();
  if (!sourceText) return '';
  const matchedRule = WEATHER_TEXT_DETECTION_RULES.find((rule) =>
    Array.isArray(rule.aliases) && rule.aliases.some((alias) => sourceText.includes(alias))
  );
  return matchedRule?.baseKey || '';
}

function serializeWeatherEntryForVariable(entry) {
  if (!entry || typeof entry !== 'object') return null;
  return {
    key: entry.key,
    desc: entry.desc,
    temp: entry.temp,
    current_temp: entry.currentTemp,
    humidity: entry.humidity,
    wind: entry.wind
  };
}

function buildWeatherVariablePayload(entries, { timeMeta = null, basePayload = null } = {}) {
  const normalizedEntries = Array.isArray(entries)
    ? entries.map((entry) => serializeWeatherEntryForVariable(entry)).filter(Boolean)
    : [];
  if (!normalizedEntries.length) return null;

  const payload = basePayload && typeof basePayload === 'object' && !Array.isArray(basePayload)
    ? { ...basePayload }
    : {};
  const resolvedTimeMeta = resolveWeatherTimeMeta(timeMeta || weatherRuntimeTimeMeta, { fallbackToLocal: true });
  const localTimeMeta = getWeatherLocalTimeMeta();
  const persistedTimeMeta = resolvedTimeMeta.isPresetTime
    ? resolvedTimeMeta
    : {
      date: resolvedTimeMeta.date || localTimeMeta.date,
      weekday: resolvedTimeMeta.weekday || localTimeMeta.weekday,
      time: localTimeMeta.time,
      sourceDate: localTimeMeta.sourceDate,
      isPresetTime: false
    };

  delete payload.weathers;
  delete payload.timeSource;
  payload.entries = normalizedEntries;
  payload.date = persistedTimeMeta.date;
  payload.weekday = persistedTimeMeta.weekday;
  payload.time = persistedTimeMeta.time;
  payload.time_source = resolvedTimeMeta.isPresetTime ? 'preset' : 'local';
  return payload;
}

function buildWeatherVariablePayloadFromEntry(entry, { timeMeta = null } = {}) {
  if (!entry) return null;
  return buildWeatherVariablePayload([entry], { timeMeta });
}

function buildWeatherVariablePayloadFromParsedResult(parsedResult) {
  if (!parsedResult || typeof parsedResult !== 'object') return null;
  return buildWeatherVariablePayload(parsedResult.entries, {
    timeMeta: parsedResult.timeMeta,
    basePayload: parsedResult.parsed
  });
}

async function syncWeatherTimeToPhoneDisplay({ render = true, persist = false, expectedChatId = '', resetOnNonPreset = false } = {}) {
  if (typeof syncPhoneDisplayTimeWithWeatherTimeMeta !== 'function') return false;
  return syncPhoneDisplayTimeWithWeatherTimeMeta(
    getWeatherCurrentTimeMeta({ fallbackToLocal: true }),
    { render, persist, expectedChatId, resetOnNonPreset }
  );
}

function applyWeatherDetectedBaseKeyToRuntime(baseKey, { render = true } = {}) {
  const normalizedBaseKey = normalizeWeatherDetectedBaseKey(baseKey);
  if (!normalizedBaseKey) return null;

  currentWeatherDetectedBaseKey = normalizedBaseKey;
  currentWeatherTimeBucket = getWeatherTimeBucket();

  const displayKey = resolveWeatherDisplayKeyByTime(normalizedBaseKey);
  const targetEntry = getWeatherEntryByKey(displayKey) || getWeatherEntryByKey(normalizedBaseKey);
  if (!targetEntry) return null;

  const runtimeEntries = getWeatherEntries();
  const runtimeIndex = runtimeEntries.findIndex((entry) => String(entry?.key || '').trim() === String(targetEntry.key || '').trim());
  if (runtimeIndex >= 0) {
    currentWeatherIndex = runtimeIndex;
  } else {
    weatherRuntimeEntries = [targetEntry];
    currentWeatherIndex = 0;
  }

  if (render && currentAppKey === 'weather' && weatherView === 'list') {
    renderActiveWeatherWindow();
  }

  return getCurrentWeatherEntry() || targetEntry;
}

async function applyWeatherDetectedBaseKey(baseKey, { render = true, persist = false, expectedChatId = '' } = {}) {
  const targetEntry = applyWeatherDetectedBaseKeyToRuntime(baseKey, { render });
  if (!targetEntry) return false;
  if (!persist) return true;
  const variableSynced = await syncBleachPhoneWeatherVariableValue(
    buildWeatherVariablePayloadFromEntry(targetEntry, { timeMeta: getWeatherCurrentTimeMeta({ fallbackToLocal: true }) }),
    { expectedChatId }
  );
  await syncWeatherTimeToPhoneDisplay({ render: false, persist: true, expectedChatId, resetOnNonPreset: true });
  return variableSynced;
}

async function syncWeatherByLatestAiText({ render = true, persist = true, expectedChatId = '' } = {}) {
  const sourceText = getLatestWeatherAssistantText();
  if (!sourceText) return false;
  const baseKey = detectWeatherBaseKeyFromText(sourceText);
  if (!baseKey) return false;
  return applyWeatherDetectedBaseKey(baseKey, { render, persist, expectedChatId });
}

function handleWeatherTimeBucketChange() {
  const nextBucket = getWeatherTimeBucket();
  if (nextBucket === currentWeatherTimeBucket) {
    return false;
  }

  currentWeatherTimeBucket = nextBucket;
  if (!currentWeatherDetectedBaseKey) {
    currentWeatherDetectedBaseKey = normalizeWeatherDetectedBaseKey(getCurrentWeatherEntry()?.key || '');
  }
  if (!currentWeatherDetectedBaseKey) {
    return false;
  }

  applyWeatherDetectedBaseKeyToRuntime(currentWeatherDetectedBaseKey, {
    render: currentAppKey === 'weather' && weatherView === 'list'
  });
  return true;
}


function getWeatherStatusMarkup() {
  if (!weatherGenerationStatusMessage) return '';
  const isLoading = weatherRequestStatus === 'loading';
  return `<div class="weather-status-banner${isLoading ? ' is-loading' : ''}">${escapeWeatherText(weatherGenerationStatusMessage)}</div>`;
}

function clearWeatherGenerationStatusAutoTimer() {
  if (!weatherStatusAutoClearTimer) return;
  clearTimeout(weatherStatusAutoClearTimer);
  weatherStatusAutoClearTimer = null;
}

function setWeatherGenerationStatus(message = '', status = weatherRequestStatus, { autoClear = false } = {}) {
  clearWeatherGenerationStatusAutoTimer();
  weatherGenerationStatusMessage = String(message || '').trim();
  weatherRequestStatus = status || 'idle';
  if (!weatherGenerationStatusMessage || !autoClear) return;
  weatherStatusAutoClearTimer = setTimeout(() => {
    weatherStatusAutoClearTimer = null;
    weatherGenerationStatusMessage = '';
    if (currentAppKey === 'weather') {
      renderActiveWeatherWindow();
    }
  }, WEATHER_STATUS_AUTO_CLEAR_MS);
}

function getCurrentBleachPhoneWeatherChatId() {
  const ctx = typeof getSillyTavernContext === 'function' ? getSillyTavernContext() : null;
  return typeof ctx?.getCurrentChatId === 'function'
    ? (ctx.getCurrentChatId() || '')
    : String(ctx?.chatId || '');
}

async function getBleachPhoneWeatherVariableValue({ expectedChatId = '' } = {}) {
  const stApi = typeof getSTAPI === 'function' ? getSTAPI() : null;
  if (typeof stApi?.variables?.get !== 'function') return null;

  const currentChatId = getCurrentBleachPhoneWeatherChatId();
  if (!currentChatId || (expectedChatId && currentChatId !== expectedChatId)) return null;

  try {
    const result = await stApi.variables.get({ name: BLEACH_PHONE_WEATHER_VARIABLE_KEY, scope: 'local' });
    return result?.value ?? null;
  } catch (error) {
    console.warn('[天气变量] weather_json 读取失败', error);
    return null;
  }
}

async function syncBleachPhoneWeatherVariableValue(rawValue, { expectedChatId = '' } = {}) {
  const stApi = typeof getSTAPI === 'function' ? getSTAPI() : null;
  if (typeof stApi?.variables?.set !== 'function') return false;

  const currentChatId = getCurrentBleachPhoneWeatherChatId();
  if (!currentChatId || (expectedChatId && currentChatId !== expectedChatId)) {
    return false;
  }

  try {
    const result = await stApi.variables.set({
      name: BLEACH_PHONE_WEATHER_VARIABLE_KEY,
      scope: 'local',
      value: typeof rawValue === 'string' ? rawValue : JSON.stringify(rawValue || {}, null, 2)
    });
    return result?.ok !== false;
  } catch (error) {
    console.warn('[天气变量] weather_json 同步失败', error);
    return false;
  }
}

async function syncBleachPhoneWeatherVariableFromParsedResult(parsedResult, options = {}) {
  if (!parsedResult || typeof parsedResult !== 'object') return false;
  const variablePayload = buildWeatherVariablePayloadFromParsedResult(parsedResult);
  if (!variablePayload) return false;
  return syncBleachPhoneWeatherVariableValue(variablePayload, options);
}

function restoreDefaultWeatherData({ render = true } = {}) {
  weatherRuntimeEntries = getWeatherDefaultEntries();
  currentWeatherIndex = weatherRuntimeEntries.length ? 0 : -1;
  weatherRuntimeTimeMeta = getWeatherLocalTimeMeta();
  currentWeatherDetectedBaseKey = normalizeWeatherDetectedBaseKey(getCurrentWeatherEntry()?.key || '');
  currentWeatherTimeBucket = getWeatherTimeBucket();
  if (currentWeatherDetectedBaseKey) {
    applyWeatherDetectedBaseKeyToRuntime(currentWeatherDetectedBaseKey, { render: false });
  }
  Promise.resolve(syncWeatherTimeToPhoneDisplay({ render: false, persist: true, resetOnNonPreset: true })).catch((error) => {
    console.error('[天气时间] 重置手机显示时间失败', error);
  });
  if (render && currentAppKey === 'weather') {
    renderActiveWeatherWindow();
  }
  return weatherRuntimeEntries.length > 0;
}

function extractWeatherPayloadText(sourceText = '') {
  const normalizedText = String(sourceText || '').trim();
  if (!normalizedText) return '';
  const taggedPayload = typeof extractTagContentWithTag === 'function'
    ? extractTagContentWithTag(normalizedText, weatherParserConfig.payloadTag)
    : '';
  if (!taggedPayload) {
    return normalizedText;
  }
  return taggedPayload
    .replace(new RegExp(`^<${weatherParserConfig.payloadTag}>|</${weatherParserConfig.payloadTag}>$`, 'gi'), '')
    .trim();
}

function parseWeatherAiResponse(rawText = '') {
  const sourceText = String(rawText || '').trim();
  if (!sourceText) {
    throw new Error('天气返回内容为空');
  }

  const payloadText = extractWeatherPayloadText(sourceText);
  if (!payloadText) {
    throw new Error('weather_json 标签内容为空');
  }

  let parsedPayload;
  try {
    parsedPayload = JSON.parse(payloadText);
  } catch (error) {
    throw new Error(`weather_json 不是有效 JSON：${error?.message || '解析失败'}`);
  }

  if (!parsedPayload || typeof parsedPayload !== 'object' || Array.isArray(parsedPayload)) {
    throw new Error('weather_json 顶层必须是对象');
  }

  const rawEntries = Array.isArray(parsedPayload.entries)
    ? parsedPayload.entries
    : (Array.isArray(parsedPayload.weathers) ? parsedPayload.weathers : null);
  if (!rawEntries) {
    throw new Error('weather_json.entries 必须是数组');
  }

  const timeMeta = resolveWeatherTimeMeta(parsedPayload, { fallbackToLocal: true });
  const entries = rawEntries
    .map((entry, index) => normalizeWeatherEntry(entry, index, { timeMeta }))
    .filter(Boolean);
  if (!entries.length) {
    throw new Error('天气列表为空；每个条目至少需要提供可识别的天气信息：key，或可用于推断的 desc');
  }

  return {
    entries,
    raw: sourceText,
    parsed: parsedPayload,
    candidate: payloadText,
    timeMeta
  };
}

function loadWeatherData(entries, { render = true, timeMeta = null } = {}) {
  const resolvedTimeMeta = resolveWeatherTimeMeta(timeMeta, { fallbackToLocal: true });
  const normalizedEntries = Array.isArray(entries)
    ? entries.map((entry, index) => normalizeWeatherEntry(entry, index, { timeMeta: resolvedTimeMeta })).filter(Boolean)
    : [];
  if (!normalizedEntries.length) return false;
  weatherRuntimeEntries = normalizedEntries;
  currentWeatherIndex = Math.min(Math.max(currentWeatherIndex, 0), weatherRuntimeEntries.length - 1);
  weatherRuntimeTimeMeta = resolvedTimeMeta;
  currentWeatherDetectedBaseKey = normalizeWeatherDetectedBaseKey(getCurrentWeatherEntry()?.key || '');
  currentWeatherTimeBucket = getWeatherTimeBucket();
  if (currentWeatherDetectedBaseKey) {
    applyWeatherDetectedBaseKeyToRuntime(currentWeatherDetectedBaseKey, { render: false });
  }
  Promise.resolve(syncWeatherTimeToPhoneDisplay({ render: false, persist: true, resetOnNonPreset: true })).catch((error) => {
    console.error('[天气时间] 同步手机显示时间失败', error);
  });
  if (render && currentAppKey === 'weather') {
    renderActiveWeatherWindow();
  }
  return true;
}

async function loadBleachPhoneWeatherVariableToRuntime({ render = true, clearOnMissing = false } = {}) {
  const rawValue = await getBleachPhoneWeatherVariableValue();
  if (rawValue == null || String(rawValue).trim() === '') {
    if (clearOnMissing) {
 restoreDefaultWeatherData({ render });
      setWeatherGenerationStatus('当前聊天暂无天气数据', 'idle', { autoClear: true });
      return true;
    }
    return false;
  }
  try {
    const parsedResult = parseWeatherAiResponse(String(rawValue));
    setWeatherGenerationStatus('已从聊天变量恢复天气', 'success', { autoClear: true });
    return loadWeatherData(parsedResult.entries, { render, timeMeta: parsedResult.timeMeta });
  } catch (error) {
    console.warn('[天气变量] weather_json 恢复失败', error);
    if (clearOnMissing) {
      restoreDefaultWeatherData({ render });
      setWeatherGenerationStatus('当前聊天天气数据无效', 'error');
      return true;
    }
    return false;
  }
}

function bindBleachPhoneWeatherVariableEvents() {
  if (isBleachPhoneWeatherVariableEventsBound) return true;
  const ctx = typeof getSillyTavernContext === 'function' ? getSillyTavernContext() : null;
  if (typeof ctx?.eventSource?.on !== 'function') return false;

  const handleChatScopedRefresh = async () => {
    resetWeatherAutoGenerateHandledKeys();
    await loadBleachPhoneWeatherVariableToRuntime({ clearOnMissing: true, render: false });
    await syncWeatherByLatestAiText({ render: false, persist: false });
    if (currentAppKey === 'weather') {
      renderActiveWeatherWindow();
    }
  };

  if (!bindBleachPhoneChatScopedRefreshEvents(ctx, handleChatScopedRefresh, { logPrefix: '[天气变量]' })) {
    return false;
  }
  isBleachPhoneWeatherVariableEventsBound = true;
  return true;
}

function getWeatherSelectedBindingName() {
  return getAiBindingProfileName('weather', aiSettings) || '未设';
}

function getWeatherSettingsEntries() {
  return [
    { key: 'api', label: 'API' },
    { key: 'preset', label: '天气预设' },
    { key: 'autoGenerate', label: '自动生成' }
  ];
}

function getWeatherApiBindingProfiles() {
  const settings = normalizeAiSettings(aiSettings);
  return Array.isArray(settings.apiProfiles) ? settings.apiProfiles : [];
}

function getWeatherPresetEntries() {
  const settings = normalizeAiSettings(aiSettings);
  return Array.isArray(settings.presetEntries) ? settings.presetEntries : [];
}

function getSelectedWeatherPresetEntry(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  const targetPresetId = resolveSelectedAiPresetId(settings.selectedWeatherPresetId || settings.selectedPresetId, settings.presetEntries);
  return getAiPresetEntryById(targetPresetId, settings) || settings.presetEntries?.[0] || null;
}

function syncWeatherPresetSelection() {
  const presets = getWeatherPresetEntries();
  currentWeatherPresetId = resolveSelectedAiPresetId(
    normalizeAiSettings(aiSettings).selectedWeatherPresetId || currentWeatherPresetId || currentAiPresetId,
    presets
  );
  const currentIndex = presets.findIndex((preset) => preset.id === currentWeatherPresetId);
  selectedWeatherPresetIndex = presets.length
    ? Math.min(
      Math.max(
        selectedWeatherPresetIndex >= 0 ? selectedWeatherPresetIndex : (currentIndex >= 0 ? currentIndex : 0),
        0
      ),
      presets.length - 1
    )
    : -1;
}

function setWeatherSelectedPreset(presetId) {
  const settings = normalizeAiSettings(aiSettings);
  const nextPresetId = resolveSelectedAiPresetId(presetId, settings.presetEntries);
  aiSettings = normalizeAiSettings({
    ...settings,
    selectedWeatherPresetId: nextPresetId
  });
  currentWeatherPresetId = aiSettings.selectedWeatherPresetId;
  persistAiSettings(aiSettings);
  return currentWeatherPresetId;
}

function syncWeatherApiBindingSelection() {
  const profiles = getWeatherApiBindingProfiles();
  const currentBindingId = getAiBindingProfileId('weather', aiSettings);
  const currentIndex = profiles.findIndex((profile) => profile.id === currentBindingId);
  selectedWeatherApiProfileIndex = profiles.length
    ? Math.min(
      Math.max(
        selectedWeatherApiProfileIndex >= 0 ? selectedWeatherApiProfileIndex : (currentIndex >= 0 ? currentIndex : 0),
        0
      ),
      profiles.length - 1
    )
    : -1;
}

function getWeatherAutoGenerateSummary(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  return getBleachPhoneAutoGenerateSummary({
    enabled: settings.weatherAutoGenerateEnabled,
    trigger: settings.weatherAutoGenerateTrigger,
    interval: settings.weatherAutoGenerateInterval || '1'
  });
}

function getWeatherAutoGenerateEntries(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  return getBleachPhoneAutoGenerateEntries({
    enabled: settings.weatherAutoGenerateEnabled,
    trigger: settings.weatherAutoGenerateTrigger,
    interval: settings.weatherAutoGenerateInterval || '1'
  });
}

function updateWeatherAutoGenerateSettings(patch = {}) {
  const settings = normalizeAiSettings(aiSettings);
  aiSettings = normalizeAiSettings({
    ...settings,
    ...patch
  });
  persistAiSettings(aiSettings);
  return aiSettings;
}

function getWeatherAutoGenerateRuntimeSettings(settingsSource = aiSettings) {
  const settings = normalizeAiSettings(settingsSource);
  const interval = Number.parseInt(String(settings.weatherAutoGenerateInterval || '1'), 10);
  return {
    enabled: Boolean(settings.weatherAutoGenerateEnabled),
    trigger: String(settings.weatherAutoGenerateTrigger || '').trim() === 'user' ? 'user' : 'assistant',
    interval: Number.isFinite(interval) && interval > 0 ? interval : 1
  };
}

function getWeatherAutoGenerateChatMessages() {
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

function resetWeatherAutoGenerateHandledKeys() {
  weatherAutoGenerateLastHandledKeys = {
    assistant: '',
    user: ''
  };
}

function buildWeatherAutoGenerateHandledKey(triggerType, chatId, floorCount, content = '') {
  return [
    String(chatId || '').trim(),
    String(triggerType || '').trim(),
    String(floorCount || 0),
    String(content || '').trim().slice(0, 240)
  ].join('::');
}

function openWeatherSettings() {
  weatherView = 'settings';
  selectedWeatherSettingsIndex = Math.min(Math.max(selectedWeatherSettingsIndex, 0), Math.max(getWeatherSettingsEntries().length - 1, 0));
  renderActiveWeatherWindow();
}

function closeWeatherSettings() {
  weatherView = 'list';
  renderActiveWeatherWindow();
}

function openWeatherApiBindingList() {
  weatherView = 'apiBinding';
  syncWeatherApiBindingSelection();
  renderActiveWeatherWindow();
}

function closeWeatherApiBindingList() {
  weatherView = 'settings';
  renderActiveWeatherWindow();
}

function openWeatherPresetList() {
  weatherView = 'preset';
  syncWeatherPresetSelection();
  renderActiveWeatherWindow();
}

function closeWeatherPresetList() {
  weatherView = 'settings';
  renderActiveWeatherWindow();
}

function openWeatherAutoGenerateList() {
  weatherView = 'autoGenerate';
  selectedWeatherAutoGenerateIndex = Math.min(Math.max(selectedWeatherAutoGenerateIndex, 0), Math.max(getWeatherAutoGenerateEntries().length - 1, 0));
  renderActiveWeatherWindow();
}

function closeWeatherAutoGenerateList() {
  weatherView = 'settings';
  renderActiveWeatherWindow();
}

function openWeatherSettingsSelection() {
  const targetEntry = getWeatherSettingsEntries()[selectedWeatherSettingsIndex] || getWeatherSettingsEntries()[0];
  if (!targetEntry) return;
  if (targetEntry.key === 'api') {
    openWeatherApiBindingList();
    return;
  }
  if (targetEntry.key === 'preset') {
    openWeatherPresetList();
    return;
  }
  openWeatherAutoGenerateList();
}

function bindWeatherApiProfileSelection() {
  const profiles = getWeatherApiBindingProfiles();
  const targetProfile = profiles[selectedWeatherApiProfileIndex] || null;
  if (!targetProfile) return false;
  if (!bindAiApiProfile('weather', targetProfile.id)) return false;
  closeWeatherApiBindingList();
  return true;
}

function bindWeatherPresetSelection() {
  const presets = getWeatherPresetEntries();
  const targetPreset = presets[selectedWeatherPresetIndex] || null;
  if (!targetPreset) return false;
  setWeatherSelectedPreset(targetPreset.id);
  closeWeatherPresetList();
  return true;
}

function confirmWeatherAutoGenerateSelection() {
  const entries = getWeatherAutoGenerateEntries();
  const targetEntry = entries[selectedWeatherAutoGenerateIndex] || entries[0] || null;
  if (!targetEntry) return false;

  const settings = normalizeAiSettings(aiSettings);
  if (targetEntry.key === 'enabled') {
    updateWeatherAutoGenerateSettings({ weatherAutoGenerateEnabled: !settings.weatherAutoGenerateEnabled });
    renderActiveWeatherWindow();
    return true;
  }

  if (targetEntry.key === 'trigger') {
    updateWeatherAutoGenerateSettings({
      weatherAutoGenerateTrigger: settings.weatherAutoGenerateTrigger === 'user' ? 'assistant' : 'user'
    });
    renderActiveWeatherWindow();
    return true;
  }

  const currentInterval = Number.parseInt(String(settings.weatherAutoGenerateInterval || '1'), 10);
  const safeCurrentInterval = Number.isFinite(currentInterval) && currentInterval > 0 ? currentInterval : 1;
  updateWeatherAutoGenerateSettings({
    weatherAutoGenerateInterval: String(Math.min(99, safeCurrentInterval + 1))
  });
  renderActiveWeatherWindow();
  return true;
}

function adjustWeatherAutoGenerateInterval(step = 1) {
  const settings = normalizeAiSettings(aiSettings);
  const currentInterval = Number.parseInt(String(settings.weatherAutoGenerateInterval || '1'), 10);
  const safeCurrentInterval = Number.isFinite(currentInterval) && currentInterval > 0 ? currentInterval : 1;
  const nextInterval = Math.min(99, Math.max(1, safeCurrentInterval + step));
  if (nextInterval === safeCurrentInterval) return false;
  updateWeatherAutoGenerateSettings({ weatherAutoGenerateInterval: String(nextInterval) });
  renderActiveWeatherWindow();
  return true;
}

function loadWeatherEntryToDom(weather, root = getWeatherAppBody()) {
  if (!root || !weather) return false;
  const weatherIconMarkup = getWeatherSvgMarkup(weather.key);
  root.querySelectorAll('.weather-icon').forEach((element) => {
    element.innerHTML = weatherIconMarkup;
    element.style.color = weather.color;
    element.setAttribute('aria-label', weather.desc);
  });
  root.querySelectorAll('.weather-desc').forEach((element) => {
    element.textContent = weather.desc;
  });
  root.querySelectorAll('.weather-temp').forEach((element) => {
    element.textContent = weather.temp;
  });
  root.querySelectorAll('#param-current-temp').forEach((element) => {
    element.textContent = weather.currentTemp;
  });
  root.querySelectorAll('#param-hum').forEach((element) => {
    element.textContent = weather.humidity;
  });
  root.querySelectorAll('#param-wind').forEach((element) => {
    element.textContent = weather.wind;
  });
  return true;
}

function updateWeatherView(root = getWeatherAppBody()) {
  if (weatherView !== 'list') {
    return;
  }
  const weather = getCurrentWeatherEntry();
  if (!weather) {
    return;
  }
  loadWeatherEntryToDom(weather, root);
}

function cycleWeatherDisplay() {
  return false;
}

function resetWeatherViewState() {
  currentWeatherIndex = getWeatherSafeIndex();
  if (currentWeatherIndex < 0 && getWeatherEntries().length) {
    currentWeatherIndex = 0;
  }
  currentWeatherTimeBucket = getWeatherTimeBucket();
  if (!currentWeatherDetectedBaseKey) {
    currentWeatherDetectedBaseKey = normalizeWeatherDetectedBaseKey(getCurrentWeatherEntry()?.key || '');
  }
  if (currentWeatherDetectedBaseKey) {
    applyWeatherDetectedBaseKeyToRuntime(currentWeatherDetectedBaseKey, { render: false });
  }
}

function syncWeatherViewState() {
  const root = getWeatherAppBody();
  if (!root || weatherView !== 'list') {
    return;
  }
  updateWeatherView(root);
}

async function buildWeatherGenerationMessages() {
  const presetEntry = getSelectedWeatherPresetEntry(aiSettings);
  if (!presetEntry?.blocks?.length) {
    throw createSilentAiChatError('天气生成未配置天气预设');
  }
  const messages = await buildAiMessagesFromPreset(null, '', presetEntry, { pendingTargets: [] });
  const normalizedMessages = Array.isArray(messages)
    ? messages.filter((message) => String(message?.content || '').trim())
    : [];
  if (!normalizedMessages.length) {
    throw createSilentAiChatError('天气预设内容为空');
  }
  return normalizedMessages;
}

async function requestAiWeatherReply() {
  const settings = getAiRuntimeSettings('weather', aiSettings);
  if (!settings.url) throw createSilentAiChatError('天气生成未绑定 API');
  if (!settings.key) throw createSilentAiChatError('天气生成未配置 API Key');
  if (!settings.model) throw createSilentAiChatError('天气生成未配置模型');

  const body = {
    model: settings.model,
    messages: await buildWeatherGenerationMessages(),
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

async function generateWeatherDataFromApi() {
  if (weatherRequestStatus === 'loading') {
    return false;
  }

  const expectedChatId = getCurrentBleachPhoneWeatherChatId();
  setWeatherGenerationStatus('天气生成中…', 'loading');
  renderActiveWeatherWindow();
  let aiReplyText = '';
  try {
    aiReplyText = await requestAiWeatherReply();
    const parsedResult = parseWeatherAiResponse(aiReplyText);
    loadWeatherData(parsedResult.entries, { render: false, timeMeta: parsedResult.timeMeta });
    await syncWeatherByLatestAiText({ render: false, persist: false, expectedChatId });
    const variableSynced = await syncBleachPhoneWeatherVariableFromParsedResult(parsedResult, { expectedChatId });
    if (!variableSynced) {
      console.warn('[天气变量] weather_json 未写入酒馆变量', { variableName: BLEACH_PHONE_WEATHER_VARIABLE_KEY });
    }
    setWeatherGenerationStatus(`天气已更新 · ${parsedResult.entries.length} 项${variableSynced ? '' : ' · 变量未同步'}`, 'success', { autoClear: true });
    renderActiveWeatherWindow();
    return true;
  } catch (error) {
    const message = error?.silent
      ? String(error.message || '').trim()
      : `生成失败：${String(error?.message || '未知错误').trim() || '未知错误'}`;
    setWeatherGenerationStatus(message, 'error');
    console.error('[天气] 生成失败', error);
    if (aiReplyText) {
      console.error('[天气] AI 原始回复内容：\n' + aiReplyText);
    }
    renderActiveWeatherWindow();
    return false;
  }
}

async function triggerWeatherGenerationFromSoftkey() {
  return generateWeatherDataFromApi();
}

async function handleWeatherAutoGenerateChatEvent(triggerType = 'assistant') {
  const normalizedTrigger = String(triggerType || '').trim() === 'user' ? 'user' : 'assistant';
  const runtimeSettings = getWeatherAutoGenerateRuntimeSettings(aiSettings);
  if (!runtimeSettings.enabled || runtimeSettings.trigger !== normalizedTrigger) {
    return false;
  }

  const activeChatId = typeof getCurrentSTChatId === 'function'
    ? String(getCurrentSTChatId() || '').trim()
    : String(getCurrentBleachPhoneWeatherChatId() || '').trim();
  if (!activeChatId) {
    return false;
  }

  const chatMessages = getWeatherAutoGenerateChatMessages();
  if (!chatMessages.length) {
    return false;
  }

  const targetMessages = chatMessages.filter((message) => message.role === normalizedTrigger && String(message.content || '').trim());
  const floorCount = targetMessages.length;
  if (!floorCount || floorCount % runtimeSettings.interval !== 0) {
    return false;
  }

  const latestMessage = targetMessages[targetMessages.length - 1] || null;
  const handledKey = buildWeatherAutoGenerateHandledKey(normalizedTrigger, activeChatId, floorCount, latestMessage?.content || '');
  if (weatherAutoGenerateLastHandledKeys[normalizedTrigger] === handledKey) {
    return false;
  }
  weatherAutoGenerateLastHandledKeys[normalizedTrigger] = handledKey;

  try {
    return await generateWeatherDataFromApi();
  } catch (error) {
    console.error(`[天气自动生成] ${normalizedTrigger === 'user' ? '用户' : 'AI'}消息触发失败`, error);
    return false;
  }
}

function bindWeatherAutoGenerateEvents() {
  if (isWeatherAutoGenerateEventsBound) return true;
  const ctx = typeof getSillyTavernContext === 'function' ? getSillyTavernContext() : null;
  if (typeof ctx?.eventSource?.on !== 'function') return false;

  const messageReceivedEvent = ctx?.eventTypes?.MESSAGE_RECEIVED || 'message_received';
  const messageSentEvent = ctx?.eventTypes?.MESSAGE_SENT || 'message_sent';
  const chatChangedEvent = ctx?.eventTypes?.CHAT_CHANGED || 'chat_id_changed';
  const handleAssistantMessage = () => {
    Promise.resolve()
      .then(() => syncWeatherByLatestAiText({ render: true, persist: true }))
      .catch((error) => {
        console.error('[天气识别] AI消息天气检测失败', error);
      })
      .finally(() => {
        Promise.resolve().then(() => handleWeatherAutoGenerateChatEvent('assistant')).catch((error) => {
          console.error('[天气自动生成] AI消息事件处理失败', error);
        });
      });
  };
  const handleUserMessage = () => {
    Promise.resolve().then(() => handleWeatherAutoGenerateChatEvent('user')).catch((error) => {
      console.error('[天气自动生成] 用户消息事件处理失败', error);
    });
  };
  const handleChatChanged = async () => {
    resetWeatherAutoGenerateHandledKeys();
    await syncWeatherByLatestAiText({ render: false, persist: false });
    if (currentAppKey === 'weather') {
      renderActiveWeatherWindow();
    }
  };

  ctx.eventSource.on(messageReceivedEvent, handleAssistantMessage);
  ctx.eventSource.on(messageSentEvent, handleUserMessage);
  ctx.eventSource.on(chatChangedEvent, handleChatChanged);
  if (ctx?.eventTypes?.CHAT_LOADED) {
    ctx.eventSource.on(ctx.eventTypes.CHAT_LOADED, handleChatChanged);
  }
  isWeatherAutoGenerateEventsBound = true;
  return true;
}

function renderWeatherSettingsView() {
  const entries = getWeatherSettingsEntries();
  return `
    ${getWeatherStatusMarkup()}
    <div class="contact-saved-list" id="weather-settings-list">
      ${entries.map((entry, index) => {
        const previewText = entry.key === 'api'
          ? getWeatherSelectedBindingName()
          : (entry.key === 'preset'
            ? (getSelectedWeatherPresetEntry(aiSettings)?.name || '未设')
            : getWeatherAutoGenerateSummary(aiSettings));
        return `
          <div class="contact-saved-item weather-settings-item ${selectedWeatherSettingsIndex === index ? 'is-selected' : ''}" data-weather-settings-index="${index}" data-weather-settings-key="${escapeWeatherText(entry.key)}">
            <div class="contact-saved-main">
              <span class="contact-saved-name">${escapeWeatherText(entry.label)}</span>
              <span class="contact-saved-preview">${escapeWeatherText(previewText)}</span>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;
}

function renderWeatherApiBindingView() {
  const profiles = getWeatherApiBindingProfiles();
  if (!profiles.length) {
    return `${getWeatherStatusMarkup()}<div class="sms-settings-empty-view">暂无 API 配置</div>`;
  }

  const currentBindingId = getAiBindingProfileId('weather', aiSettings);
  return `
    ${getWeatherStatusMarkup()}
    <div class="contact-saved-list" id="weather-api-profile-list">
      ${profiles.map((profile, index) => `
        <div class="contact-saved-item weather-api-profile-item ${selectedWeatherApiProfileIndex === index ? 'is-selected' : ''}" data-weather-api-profile-index="${index}">
          <div class="contact-saved-main">
            <span class="contact-saved-name">${escapeWeatherText(profile.name || '默认')}</span>
            <span class="contact-saved-preview">${currentBindingId === profile.id ? '当前使用' : escapeWeatherText(getAiApiHostLabel(profile.url) || '未设端点')}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderWeatherPresetView() {
  const presets = getWeatherPresetEntries();
  if (!presets.length) {
    return `${getWeatherStatusMarkup()}<div class="sms-settings-empty-view">暂无预设</div>`;
  }

  return `
    ${getWeatherStatusMarkup()}
    <div class="contact-saved-list" id="weather-preset-list">
      ${presets.map((preset, index) => `
        <div class="contact-saved-item weather-preset-item ${selectedWeatherPresetIndex === index ? 'is-selected' : ''}" data-weather-preset-index="${index}">
          <div class="contact-saved-main">
            <span class="contact-saved-name">${escapeWeatherText(preset.name || `预设 ${index + 1}`)}</span>
            <span class="contact-saved-preview">${currentWeatherPresetId === preset.id ? '当前使用' : `${Array.isArray(preset.blocks) ? preset.blocks.length : 0} 个块`}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;
}

function renderWeatherAutoGenerateView() {
  return renderBleachPhoneAutoGenerateSettingsView({
    statusMarkup: getWeatherStatusMarkup(),
    listId: 'weather-auto-generate-list',
    itemClassName: 'weather-auto-generate-item',
    selectedIndex: selectedWeatherAutoGenerateIndex,
    entries: getWeatherAutoGenerateEntries(),
    escapeText: escapeWeatherText,
    dataIndexAttr: 'data-weather-auto-generate-index',
    dataKeyAttr: 'data-weather-auto-generate-key'
  });
}

function renderWeatherMainView() {
  const weather = getCurrentWeatherEntry();
  if (!weather) {
    return `
      <div class="weather-app-shell">
        ${getWeatherStatusMarkup()}
        <div class="sms-settings-empty-view">暂无天气数据</div>
      </div>
    `;
  }
  return `
    <div class="weather-app-shell">
      ${getWeatherStatusMarkup()}
      <div class="home-screen">
        <div class="weather-module">
          <div class="weather-icon" aria-label="${escapeWeatherText(weather.desc)}" role="img">${getWeatherSvgMarkup(weather.key)}</div>
          <div class="weather-info">
            <span class="weather-desc">${escapeWeatherText(weather.desc)}</span>
            <span class="weather-temp">${escapeWeatherText(weather.temp)}</span>
          </div>
        </div>
        <div class="weather-params">
          <div class="param-item">
            <span class="param-label">温度</span>
            <span class="param-value" id="param-current-temp">${escapeWeatherText(weather.currentTemp)}</span>
          </div>
          <div class="param-item">
            <span class="param-label">湿度</span>
            <span class="param-value" id="param-hum">${escapeWeatherText(weather.humidity)}</span>
          </div>
          <div class="param-item">
            <span class="param-label">风力</span>
            <span class="param-value" id="param-wind">${escapeWeatherText(weather.wind)}</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderWeatherContent() {
  if (weatherView === 'settings') {
    return renderWeatherSettingsView();
  }

  if (weatherView === 'apiBinding') {
    return renderWeatherApiBindingView();
  }

  if (weatherView === 'preset') {
    return renderWeatherPresetView();
  }

  if (weatherView === 'autoGenerate') {
    return renderWeatherAutoGenerateView();
  }

  return renderWeatherMainView();
}

function moveWeatherSelection(direction) {
  if (weatherView === 'settings') {
    const entries = getWeatherSettingsEntries();
    const settingsList = document.getElementById('weather-settings-list');
    if (settingsList) {
      weatherSettingsListScrollTop = settingsList.scrollTop;
    }
    if (!entries.length) return;
    if (direction === 'up') {
      selectedWeatherSettingsIndex = Math.max(0, selectedWeatherSettingsIndex - 1);
      renderActiveWeatherWindow();
      return;
    }
    if (direction === 'down') {
      selectedWeatherSettingsIndex = Math.min(entries.length - 1, selectedWeatherSettingsIndex + 1);
      renderActiveWeatherWindow();
    }
    return;
  }

  if (weatherView === 'apiBinding') {
    const profiles = getWeatherApiBindingProfiles();
    const profileList = document.getElementById('weather-api-profile-list');
    if (profileList) {
      weatherApiProfileListScrollTop = profileList.scrollTop;
    }
    if (!profiles.length) return;
    if (direction === 'up') {
      selectedWeatherApiProfileIndex = Math.max(0, selectedWeatherApiProfileIndex - 1);
      renderActiveWeatherWindow();
      return;
    }
    if (direction === 'down') {
      selectedWeatherApiProfileIndex = Math.min(profiles.length - 1, selectedWeatherApiProfileIndex + 1);
      renderActiveWeatherWindow();
    }
    return;
  }

  if (weatherView === 'preset') {
    const presets = getWeatherPresetEntries();
    const presetList = document.getElementById('weather-preset-list');
    if (presetList) {
      weatherPresetListScrollTop = presetList.scrollTop;
    }
    if (!presets.length) return;
    if (direction === 'up') {
      selectedWeatherPresetIndex = Math.max(0, selectedWeatherPresetIndex - 1);
      renderActiveWeatherWindow();
      return;
    }
    if (direction === 'down') {
      selectedWeatherPresetIndex = Math.min(presets.length - 1, selectedWeatherPresetIndex + 1);
      renderActiveWeatherWindow();
    }
    return;
  }

  if (weatherView === 'autoGenerate') {
    const entries = getWeatherAutoGenerateEntries();
    const autoGenerateList = document.getElementById('weather-auto-generate-list');
    if (autoGenerateList) {
      weatherAutoGenerateListScrollTop = autoGenerateList.scrollTop;
    }
    if (!entries.length) return;
    if (direction === 'up') {
      selectedWeatherAutoGenerateIndex = Math.max(0, selectedWeatherAutoGenerateIndex - 1);
      renderActiveWeatherWindow();
      return;
    }
    if (direction === 'down') {
      selectedWeatherAutoGenerateIndex = Math.min(entries.length - 1, selectedWeatherAutoGenerateIndex + 1);
      renderActiveWeatherWindow();
      return;
    }
    if (selectedWeatherAutoGenerateIndex === 2) {
      if (direction === 'left') {
        adjustWeatherAutoGenerateInterval(-1);
        return;
      }
      if (direction === 'right') {
        adjustWeatherAutoGenerateInterval(1);
      }
    }
    return;
  }

  if (direction === 'left') {
    cycleWeatherDisplay(-1);
    return;
  }
  if (direction === 'right') {
    cycleWeatherDisplay(1);
  }
}
