function shouldStatusBarContactNameMarquee(text) {
  return String(text || '').trim().length > 7;
}

function buildStatusBarContactNameMarkup(text) {
  const label = String(text || '').trim() || '短信';
  if (!shouldStatusBarContactNameMarquee(label)) {
    return escapeHtml(label);
  }
  return `<span class="status-name-track" style="--status-name-gap:26px; --status-name-gap-half:13px;"><span class="status-name-copy">${escapeHtml(label)}</span><span class="status-name-gap" aria-hidden="true"></span><span class="status-name-copy" aria-hidden="true">${escapeHtml(label)}</span></span>`;
}

function updateRealtimeStatusBar(timeText) {
  const realtimeEl = document.getElementById('realtime');
  if (!realtimeEl) return;
  const isSmsChatView = currentAppKey === 'sms' && contactView === 'chat';
  if (!isSmsChatView) {
    if (realtimeEl.dataset.mode !== 'time' || realtimeEl.textContent !== timeText) {
      realtimeEl.className = 'time';
      realtimeEl.textContent = timeText;
      realtimeEl.dataset.mode = 'time';
      realtimeEl.dataset.label = '';
      realtimeEl.dataset.waiting = '0';
      realtimeEl.dataset.summarizing = '0';
      realtimeEl.dataset.actionable = '0';
      realtimeEl.title = '';
    }
    return;
  }

  const contactName = String(getCurrentAiContact?.()?.name || '短信').trim() || '短信';
  const isWaiting = aiChatRequestStatus === 'loading';
  const isSummarizing = smsSummaryRequestStatus === 'loading';
  const isMarquee = shouldStatusBarContactNameMarquee(contactName);
  const nextClassName = `time is-contact-name is-actionable${isMarquee ? ' is-marquee' : ''}${isWaiting ? ' is-waiting' : ''}${isSummarizing ? ' is-summarizing' : ''}`;
  if (
    realtimeEl.dataset.mode === 'contact-name'
    && realtimeEl.dataset.label === contactName
    && realtimeEl.dataset.waiting === (isWaiting ? '1' : '0')
    && realtimeEl.dataset.summarizing === (isSummarizing ? '1' : '0')
    && realtimeEl.className === nextClassName
  ) {
    return;
  }
  realtimeEl.className = nextClassName;
  realtimeEl.innerHTML = buildStatusBarContactNameMarkup(contactName);
  realtimeEl.dataset.mode = 'contact-name';
  realtimeEl.dataset.label = contactName;
  realtimeEl.dataset.waiting = isWaiting ? '1' : '0';
  realtimeEl.dataset.summarizing = isSummarizing ? '1' : '0';
  realtimeEl.dataset.actionable = '1';
  realtimeEl.title = '点击总结短信聊天';
}

function formatDateTimeLabel(value = Date.now()) {
  const parsedDate = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  const safeDate = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const year = safeDate.getFullYear();
  const month = String(safeDate.getMonth() + 1).padStart(2, '0');
  const day = String(safeDate.getDate()).padStart(2, '0');
  const hours = String(safeDate.getHours()).padStart(2, '0');
  const minutes = String(safeDate.getMinutes()).padStart(2, '0');
  return `${year}.${month}.${day} ${hours}:${minutes}`;
}

function getPhoneDisplayTimeValue() {
  return phoneDisplayTime instanceof Date && !Number.isNaN(phoneDisplayTime.getTime())
    ? new Date(phoneDisplayTime.getTime())
    : new Date();
}

function getPhoneDisplayTimestamp() {
  return getPhoneDisplayTimeValue().getTime();
}

function getPhoneDisplayTimeLabel() {
  return formatDateTimeLabel(getPhoneDisplayTimeValue());
}

function getPhoneDisplayMessageTimeMeta(value = getPhoneDisplayTimeValue()) {
  const now = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  const safeNow = Number.isNaN(now.getTime()) ? getPhoneDisplayTimeValue() : now;
  return {
    time: safeNow.getTime(),
    timeLabel: formatDateTimeLabel(safeNow)
  };
}

function setPhoneDisplayTime(value, { render = true } = {}) {
  if (value == null || value === '') {
    phoneDisplayTime = null;
  } else if (value instanceof Date && !Number.isNaN(value.getTime())) {
    phoneDisplayTime = new Date(value.getTime());
  } else {
    const nextDate = new Date(value);
    if (Number.isNaN(nextDate.getTime())) {
      return false;
    }
    phoneDisplayTime = nextDate;
  }

  if (render) {
    updateTime();
  }
  return true;
}

function resetPhoneDisplayTime(options) {
  return setPhoneDisplayTime(null, options);
}

function formatPhoneDisplayTime(now = getPhoneDisplayTimeValue()) {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const hours = String(now.getHours()).padStart(2, '0');
  const minutes = String(now.getMinutes()).padStart(2, '0');
  return {
    now,
    year,
    month,
    day,
    hours,
    minutes,
    timeStr: `${hours}:${minutes}`,
    dateStr: `${year}.${month}.${day}`
  };
}

function getPhoneDisplayTimeContext() {
  const formatted = formatPhoneDisplayTime();
  return {
    ...formatted,
    isCustom: phoneDisplayTime instanceof Date && !Number.isNaN(phoneDisplayTime.getTime())
  };
}

function getPhoneDisplayDateTimeLabel() {
  return getPhoneDisplayTimeLabel();
}

function updateTime() {
  const { timeStr, dateStr } = formatPhoneDisplayTime();
  updateRealtimeStatusBar(timeStr);
  document.getElementById('screen-saver-time').textContent = timeStr;
  document.getElementById('screen-saver-date').textContent = dateStr;
  if (!isAlerting) {
    const currentEntry = screenSaverEntries[currentScreenSaverEntryIndex] || null;
    document.getElementById('outer-time').textContent = isScreenSaverActive
      ? getScreenSaverEntryLabel(currentEntry)
      : timeStr;
  }
}

function handleRealtimeStatusBarClick(event) {
  event?.stopPropagation?.();
  if (currentAppKey !== 'sms' || contactView !== 'chat') return;
  if (typeof triggerSmsChatSummaryFromStatusBar === 'function') {
    triggerSmsChatSummaryFromStatusBar();
  }
}

const appData = {
  weather: {
    title: '天气',
    kicker: 'FORECAST',
    main: '阴云聚集',
    sub: '空座町上空灵子浓度偏高，西侧风压稳定。',
    list: [['温度', '11°C'], ['风向', 'NW-3'], ['降雨率', '68%']]
  },
  intel: {
    title: '情报',
    kicker: 'NEWS FLASH',
    main: '现世监测更新',
    sub: '十二番队传回最新观测，夜间异常波动增加。',
    list: [['频道', '尸魂界'], ['等级', 'B-CLASS'], ['时间', '22:40']]
  },
  contact: {
    title: '联络',
    kicker: 'CONTACT',
    main: '可用线路 03',
    sub: '浦原商店、技术开发局、代理死神专线可接入。',
    list: [['浦原', '在线'], ['技术局', '待机'], ['代理线', '保密']]
  },
  music: {
    title: '音乐',
    kicker: 'MUSIC',
    main: '旋律已装载',
    sub: '便携播放器已待机，可快速进入曲目与播放界面。',
    list: [['模式', '播放'], ['曲库', '本地'], ['状态', '待机']]
  },
  sms: {
    title: '短信',
    kicker: 'MESSAGE',
    main: '短讯收发待命',
    sub: '现世联络短信通道已待机，可查看和整理传讯记录。',
    list: [['收件箱', '03'], ['草稿', '01'], ['状态', '待机']]
  },
  items: {
    title: '道具',
    kicker: 'INVENTORY',
    main: '装备槽已整理',
    sub: '义骸通行证、灵压感测器与回复剂已装入携行包。',
    list: [['感测器', '01'], ['回复剂', '02'], ['代行证', 'OK']]
  },
  shinigami: {
    title: '死神',
    kicker: 'PROFILE',
    main: '灵压状态稳定',
    sub: '斩魄刀同步率良好，当前灵压输出维持在安全范围。',
    list: [['阶级', '代理'], ['同步率', '87%'], ['灵压', '稳定']]
  },
  records: {
    title: '影音',
    kicker: 'MEDIA',
    main: '影音载入已就绪',
    sub: '可输入在线视频页面或直链地址，进入小屏播放与横屏观影。',
    list: [['模式', '播放'], ['来源', 'URL'], ['状态', '待命']]
  },
  settings: {
    title: '设定',
    kicker: 'THEME MENU',
    main: '外观主题',
    sub: '可在黑红死神机与白米色女生机之间切换。',
    list: [['主题 A', '黑红死神'], ['主题 B', '白米女生'], ['应用', '即时切换']]
  },
  map: {
    title: '地图',
    kicker: 'SECTOR MAP',
    main: '监测区 #13',
    sub: '南街区灵压光点稀疏，异常源位于河岸附近。',
    list: [['区域', '空座町'], ['坐标', '13-B'], ['风险', '中']]
  },
  radio: {
    title: '新闻区',
    kicker: 'NEWS FEED',
    main: '短波播报接通',
    sub: '正在接收尸魂界新闻简报与紧急通知。',
    list: [['频段', '88.4'], ['信号', '良好'], ['内容', '播送中']]
  },
  data: {
    title: '数据',
    kicker: 'DATA CARD',
    main: '数据读写就绪',
    sub: '可导入或导出影音与音乐列表 JSON。',
    list: [['影音', 'JSON'], ['音乐', 'JSON'], ['模式', '导入/导出']]
  }
};

const radioNewsEntries = [
  {
    title: '现世监测局发布夜间灵压波动预警',
    source: '尸魂界即时台',
    time: '22:14',
    body: [
      '技术开发局确认，空座町北部在今晚二十二时后出现连续灵压脉冲，峰值高于本周平均值。',
      '监测员表示，波动并未形成失控裂隙，但已接近需要代理死神到场确认的警戒线。',
      '如无新的异动，预警将在凌晨前转为观察状态。'
    ]
  },
  {
    title: '十二番队完成便携通信终端第二轮调校',
    source: '研发频道',
    time: '21:03',
    body: [
      '本次调校重点优化了外屏显示、待机唤醒和翻盖结构的同步响应。',
      '研发人员称，新固件能让终端在切换屏保与主界面时保持更稳定的显示节奏。',
      '下一步将继续测试长时间运行下的按键反馈与本地储存可靠性。'
    ]
  },
  {
    title: '浦原商店临时补货：灵压感测器重新开放申领',
    source: '商店通告',
    time: '19:47',
    body: [
      '因近期异常反应增多，浦原商店向代理死神开放一批便携式灵压感测器。',
      '本批次设备已预装快速识别模式，能在短时间内标记附近高密度目标。',
      '需要补领者请于明日上午前往后门登记，数量有限，优先发放给一线使用者。'
    ]
  },
  {
    title: '西区巡逻报告：河岸附近出现短时高密度集结',
    source: '巡逻简报',
    time: '18:25',
    body: [
      '西区巡逻员回报，河岸附近在傍晚时段出现数次高密度灵子聚集现象。',
      '目标停留时间很短，尚未与现世居民发生直接接触，但轨迹显示其活动范围正在扩大。',
      '监控建议提高该片区巡逻频率，并保留夜间录像记录以便进一步比对。'
    ]
  },
  {
    title: '紧急播报：代理线路将于零点前进行短时维护',
    source: '系统公告',
    time: '17:08',
    body: [
      '通信枢纽将于今日二十三时四十至二十三时五十五进行线路切换维护。',
      '维护期间，代理线路可能出现接入延迟、文字推送缓慢或外屏状态短暂不同步。',
      '如需发送紧急报告，请优先使用本地记录功能并在维护结束后重新同步。'
    ]
  }
];

function openRecordsMenu() {
  recordsView = 'videoList';
  isNetworkFullscreen = false;
  resetNetworkFullscreenPhoneState();
  pendingNetworkVideoName = '';
  pendingNetworkVideoUrl = currentNetworkVideoUrl;
  editingNetworkVideoIndex = -1;
  renderAppWindow('records');
}

function getMenuItems() {
  return Array.from(document.querySelectorAll('.grid-item'));
}

function setScreenSaverActive(active) {
  isScreenSaverActive = active;
  if (active) {
    prepareRandomScreenSaver();
  }
  const screenSaver = document.getElementById('screen-saver');
  if (screenSaver) {
    screenSaver.classList.toggle('active', active);
  }
  updateTime();
}

function showScreenSaver() {
  closeApp();
  setScreenSaverActive(true);
}

function hideScreenSaver() {
  setScreenSaverActive(false);
}

function selectMenuItemByApp(appKey) {
  const items = getMenuItems();
  const nextIndex = items.findIndex((item) => item.dataset.app === appKey);
  if (nextIndex >= 0) {
    selectedMenuIndex = nextIndex;
    updateMenuSelection();
  }
}

function openMenuShortcut(shortcutKey) {
  if (isClosed || isAlerting) return;

  const shortcutIndex = Number(shortcutKey) - 1;
  if (!Number.isInteger(shortcutIndex) || shortcutIndex < 0) return;

  const item = getMenuItems()[shortcutIndex];
  if (!item) return;

  selectedMenuIndex = shortcutIndex;
  updateMenuSelection();
  openApp(item.dataset.app);
}

function updateMenuSelection() {
  const items = getMenuItems();
  let selectedItem = null;
  items.forEach((item, index) => {
    const isSelected = index === selectedMenuIndex;
    item.classList.toggle('is-selected', isSelected);
    if (isSelected) {
      selectedItem = item;
    }
  });
  requestAnimationFrame(() => {
    selectedItem?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  });
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}


function renderRecordsMenuContent() {
  const entries = [
    { key: 'video', label: '视频', value: networkVideoEntries.length ? `${networkVideoEntries.length}条` : '空列表' }
  ];

  return `
    <div class="settings-list">
      ${entries.map((entry, index) => `
        <button class="setting-row records-menu-item ${selectedRecordsIndex === index ? 'is-selected' : ''}" data-records-index="${index}" data-records-key="${entry.key}" type="button">
          <span class="setting-row-label">${entry.label}</span>
          <span class="setting-row-value-wrap">
            <span class="setting-row-value">${entry.value}</span>
            <span class="setting-row-arrow">›</span>
          </span>
        </button>
      `).join('')}
    </div>
  `;
}

function renderRecordsContent() {
  if (recordsView === 'videoList') {
    return renderNetworkVideoListContent();
  }
  if (recordsView === 'videoEditor') {
    return renderNetworkVideoEditorContent();
  }
  if (recordsView === 'videoPlayer') {
    return renderNetworkContent();
  }
  return renderRecordsMenuContent();
}


function moveRecordsSelection(direction) {
  if (recordsView === 'menu') {
    if (direction === 'up') {
      selectedRecordsIndex = Math.max(0, selectedRecordsIndex - 1);
      renderAppWindow('records');
      return;
    }
    if (direction === 'down') {
      selectedRecordsIndex = Math.min(recordsMenuOrder.length - 1, selectedRecordsIndex + 1);
      renderAppWindow('records');
    }
    return;
  }

  if (recordsView === 'videoList') {
    if (!networkVideoEntries.length) return;
    const videoList = document.getElementById('network-video-saved-list');
    if (videoList) {
      networkVideoListScrollTop = videoList.scrollTop;
    }
    if (direction === 'up') {
      selectedNetworkVideoListIndex = Math.max(0, selectedNetworkVideoListIndex - 1);
      renderAppWindow('records');
      return;
    }
    if (direction === 'down') {
      selectedNetworkVideoListIndex = Math.min(networkVideoEntries.length - 1, selectedNetworkVideoListIndex + 1);
      renderAppWindow('records');
    }
  }
}

function moveMenuSelection(direction) {
  const items = getMenuItems();
  if (!items.length) return;

  let row = Math.floor(selectedMenuIndex / menuColumns);
  let col = selectedMenuIndex % menuColumns;
  const maxRow = Math.floor((items.length - 1) / menuColumns);

  if (direction === 'up') row = Math.max(0, row - 1);
  if (direction === 'down') row = Math.min(maxRow, row + 1);
  if (direction === 'left') col = Math.max(0, col - 1);
  if (direction === 'right') col = Math.min(menuColumns - 1, col + 1);

  selectedMenuIndex = Math.min(items.length - 1, row * menuColumns + col);
  updateMenuSelection();
}


function isAppWindowOpen() {
  return document.getElementById('app-window').classList.contains('open');
}

function confirmCurrentSelection() {
  if (isClosed || isAlerting || isScreenSaverActive) return;

  if (isAppWindowOpen()) {
    if (currentAppKey === 'settings') {
      if (settingsView === 'screensaverEditor') {
        const nameInput = document.getElementById('screensaver-name-input');
        const urlInput = document.getElementById('screensaver-url-input');
        if (nameInput) {
          pendingScreenSaverName = nameInput.value;
        }
        if (urlInput) {
          pendingScreenSaverImageUrl = urlInput.value;
        }
        if (saveScreenSaverEntry(pendingScreenSaverName, pendingScreenSaverImageUrl)) {
          closeScreenSaverEditor();
        }
        return;
      }

      if (settingsView === 'screensaverList') {
        if (getSelectedScreenSaverEntry()) {
          openScreenSaverEditor(selectedScreenSaverListIndex);
        } else {
          openScreenSaverEditor();
        }
        return;
      }

      if (settingsView === 'aiPromptList') {
        if (selectedAiPresetListIndex >= 0) {
          openAiPresetConfig(currentAiPresetId);
        }
        return;
      }

      if (settingsView === 'aiPromptOverviewList') {
        const presetEntries = getAiPresetEntries();
        const targetPreset = presetEntries[selectedAiPresetListIndex] || null;
        if (targetPreset) {
          openAiPresetTotalContentPreview(targetPreset, { returnView: 'aiPromptOverviewList' });
        }
        return;
      }

      if (settingsView === 'aiPromptAddType') {
        confirmAiPresetAddTypeSelection();
        return;
      }

      if (settingsView === 'aiPromptMessageBlockEditor') {
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

      if (settingsView === 'aiPromptContextBlockEditor') {
        saveAiPresetContextBlock();
        return;
      }

      if (settingsView === 'aiPromptInfoSourcePicker') {
        confirmAiPresetInfoSourceSelection();
        return;
      }

      if (settingsView === 'aiPromptWorldBookPicker') {
        confirmAiPresetWorldBookSelection();
        return;
      }

      if (settingsView === 'aiPromptEditor') {
        const presetNameInput = document.getElementById('ai-preset-name-input');
        if (presetNameInput) pendingAiPresetName = presetNameInput.value;
        saveCurrentAiPreset();
        return;
      }

      if (settingsView === 'aiPromptBlockPreview') {
        return;
      }

      if (settingsView === 'aiMainChat') {
        const contextInput = document.getElementById('ai-mainchat-context-n-input');
        const userNInput = document.getElementById('ai-mainchat-user-n-input');
        if (contextInput) pendingAiMainChatContextN = contextInput.value;
        if (userNInput) pendingAiMainChatUserN = userNInput.value;
        saveAiSettings();
        aiConfigStatusMessage = '已保存';
        settingsView = 'list';
        renderAppWindow('settings');
        return;
      }

      if (settingsView === 'aiMainChatRules') {
        saveAiSettings();
        aiConfigStatusMessage = '已保存';
        closeAiMainChatRules();
        return;
      }

      if (settingsView === 'aiModelEditor') {
        const modelInput = document.getElementById('ai-model-manual-input');
        if (modelInput) pendingAiModel = modelInput.value;
        closeAiModelEditor();
        return;
      }

      if (settingsView === 'aiModelList') {
        const selectedModel = getSelectedAiModel();
        if (selectedModel) {
          pendingAiModel = selectedModel;
        }
        closeAiModelList();
        return;
      }

      if (settingsView === 'aiParamConfig') {
        const temperatureInput = document.getElementById('ai-params-temperature-input');
        const frequencyPenaltyInput = document.getElementById('ai-params-frequency-penalty-input');
        const presencePenaltyInput = document.getElementById('ai-params-presence-penalty-input');
        const topPInput = document.getElementById('ai-params-top-p-input');
        if (temperatureInput) pendingAiTemperature = temperatureInput.value;
        if (frequencyPenaltyInput) pendingAiFrequencyPenalty = frequencyPenaltyInput.value;
        if (presencePenaltyInput) pendingAiPresencePenalty = presencePenaltyInput.value;
        if (topPInput) pendingAiTopP = topPInput.value;
        saveAiSettings();
        aiConfigStatusMessage = '已保存';
        closeAiParamConfig();
        return;
      }

      if (settingsView === 'aiConfigList') {
        if (aiSettings?.selectedApiProfileId) {
          openAiConfigEditor(aiSettings.selectedApiProfileId);
        } else {
          openNewAiApiProfileDraft();
        }
        return;
      }

      if (settingsView === 'aiConfig') {
        const nameInput = document.getElementById('ai-settings-name-input');
        const urlInput = document.getElementById('ai-settings-url-input');
        const keyInput = document.getElementById('ai-settings-key-input');
        if (nameInput) pendingAiApiName = nameInput.value;
        if (urlInput) pendingAiUrl = urlInput.value;
        if (keyInput) pendingAiKey = keyInput.value;
        saveAiSettings();
        aiConfigStatusMessage = '已保存';
        renderAppWindow('settings');
        return;
      }

      if (settingsRowOrder[selectedSettingsIndex] === 'theme') {
        applyTheme(themeOptionsOrder[pendingThemeIndex]);
        renderAppWindow('settings');
      }
      if (settingsRowOrder[selectedSettingsIndex] === 'fontSize') {
        applyFontSize(pendingFontSizeKey);
        renderAppWindow('settings');
      }
      if (settingsRowOrder[selectedSettingsIndex] === 'screensaver') {
        openScreenSaverList();
      }
      if (settingsRowOrder[selectedSettingsIndex] === 'aiPrompt') {
        openAiSystemPromptEditor();
      }
      if (settingsRowOrder[selectedSettingsIndex] === 'aiPromptOverview') {
        openAiPromptOverviewList();
      }
      if (settingsRowOrder[selectedSettingsIndex] === 'aiMainChat') {
        openAiMainChatConfig();
      }
      if (settingsRowOrder[selectedSettingsIndex] === 'aiConfig') {
        openAiConfig();
      }
      return;
    }

    if (currentAppKey === 'contact') {
      if (contactView === 'list') {
        if (selectedAiContactIndex >= 0) {
          openAiContactEditor(selectedAiContactIndex);
        } else {
          openAiContactEditor();
        }
        return;
      }

      if (contactView === 'editor') {
        const nameInput = document.getElementById('ai-contact-name-input');
        const promptInput = document.getElementById('ai-contact-prompt-input');
        if (nameInput) {
          pendingAiContactName = nameInput.value;
        }
        if (promptInput) {
          pendingAiContactPrompt = promptInput.value;
        }
        saveAiContact(pendingAiContactName, pendingAiContactPrompt);
        return;
      }
    }

    if (currentAppKey === 'sms') {
      if (contactView === 'smsSettings') {
        openSmsSettingsSelection();
        return;
      }

      if (contactView === 'smsApiBinding') {
        bindSmsApiProfileSelection();
        return;
      }

      if (contactView === 'smsPreset') {
        bindSmsPresetSelection();
        return;
      }

      if (contactView === 'smsChatHistory') {
        return;
      }

      if (contactView === 'list') {
        if (selectedAiContactIndex >= 0) {
          openAiContactChat(selectedAiContactIndex);
        }
        return;
      }

      if (contactView === 'chat') {
        queueAiChatMessage();
        return;
      }
    }

    if (currentAppKey === 'data') {
      confirmDataSelection();
      return;
    }

    if (currentAppKey === 'music') {
      if (recordsView === 'musicList') {
        if (selectedMusicListIndex >= 0) {
          openMusicPlayer(selectedMusicListIndex, true);
        } else {
          openMusicEditor();
        }
        return;
      }

      if (recordsView === 'musicEditor') {
        const nameInput = document.getElementById('music-name-input');
        const urlInput = document.getElementById('music-url-input');
        const coverInput = document.getElementById('music-cover-url-input');
        if (nameInput) {
          pendingMusicName = nameInput.value;
        }
        if (urlInput) {
          pendingMusicUrl = urlInput.value;
        }
        if (coverInput) {
          pendingMusicCoverUrl = coverInput.value;
        }
        if (saveMusicEntry(pendingMusicName, pendingMusicUrl, pendingMusicCoverUrl)) {
          closeMusicEditor();
        }
        return;
      }

      if (recordsView === 'musicPlayer') {
        if (!toggleMusicPlayback()) {
          openRecordsMusic();
        }
        return;
      }
    }

    if (currentAppKey === 'radio') {
      if (radioView === 'list') {
        openRadioNewsDetail(selectedRadioNewsIndex);
      }
      return;
    }
    if (currentAppKey === 'records') {
      if (recordsView === 'menu') {
        openNetworkVideoList();
        return;
      }

      if (recordsView === 'videoList') {
        const selectedEntry = getSelectedNetworkVideoEntry();
        if (selectedEntry) {
          openNetworkVideoPlayer(selectedEntry);
        } else {
          openNetworkVideoEditor();
        }
        return;
      }

      if (recordsView === 'videoEditor') {
        const nameInput = document.getElementById('network-video-name-input');
        const urlInput = document.getElementById('network-video-url-editor');
        if (nameInput) {
          pendingNetworkVideoName = nameInput.value;
        }
        if (urlInput) {
          pendingNetworkVideoUrl = urlInput.value;
        }
        if (saveNetworkVideoEntry(pendingNetworkVideoName, pendingNetworkVideoUrl)) {
          closeNetworkVideoEditor();
        }
        return;
      }

      if (recordsView === 'videoPlayer') {
        const pendingUrl = pendingNetworkVideoUrl.trim();
        if (pendingUrl && pendingUrl !== currentNetworkVideoUrl) {
          loadNetworkVideoUrl(pendingUrl);
          return;
        }
        if (toggleNetworkVideoPlayback()) {
          return;
        }
        loadNetworkVideoUrl();
      }
      return;
    }
    return;
  }

  const item = getMenuItems()[selectedMenuIndex];
  if (item) {
    openApp(item.dataset.app);
  }
}


function renderAppWindow(appKey) {
  const app = appData[appKey];
  if (!app) return;

  currentAppKey = appKey;
  document.getElementById('app-window')?.classList.toggle('sms-chat-compact', appKey === 'sms' && contactView === 'chat');
  let appTitle = app.title;
  if (appKey === 'settings') {
    if (settingsView === 'aiPromptList') {
      appTitle = '预设';
    } else if (settingsView === 'aiPromptOverviewList') {
      appTitle = '提示词总览';
    } else if (settingsView === 'aiPromptAddType') {
      appTitle = '选择块类型';
    } else if (settingsView === 'aiPromptMessageBlockEditor') {
      appTitle = '消息块';
    } else if (settingsView === 'aiPromptContextBlockEditor') {
      appTitle = '上下文槽';
    } else if (settingsView === 'aiPromptInfoSourcePicker') {
      appTitle = '选择信息来源';
    } else if (settingsView === 'aiPromptWorldBookPicker') {
      appTitle = '选择世界书';
    } else if (settingsView === 'aiPromptBlockPreview') {
      appTitle = aiPresetPreviewTitle || '块预览';
    } else if (settingsView === 'aiPromptEditor') {
      appTitle = pendingAiPresetName || '预设配置';
    } else if (settingsView === 'aiMainChatPreview') {
      appTitle = '预览上下文';
    } else if (settingsView === 'aiMainChatRules') {
      appTitle = 'XML规则';
    } else if (settingsView === 'aiMainChat') {
      appTitle = '主聊天';
    } else if (settingsView === 'aiModelEditor') {
      appTitle = '模型';
    } else if (settingsView === 'aiModelList') {
      appTitle = '模型';
    } else if (settingsView === 'aiParamConfig') {
      appTitle = '参数配置';
    } else if (settingsView === 'aiConfigList' || settingsView === 'aiConfig') {
      appTitle = 'API配置';
    } else if (settingsView !== 'list') {
      appTitle = '屏保';
    }
  } else if (appKey === 'contact') {
    if (contactView === 'editor') {
      appTitle = editingAiContactIndex >= 0 ? '编辑联系人' : '新增联系人';
    }
  } else if (appKey === 'sms') {
    if (contactView === 'smsSettings') {
      appTitle = '短信设置';
    } else if (contactView === 'smsApiBinding') {
      appTitle = 'API';
    } else if (contactView === 'smsPreset') {
      appTitle = '聊天预设';
    } else if (contactView === 'smsSummaryPreset') {
      appTitle = '总结预设';
    } else if (contactView === 'smsChatHistory') {
      appTitle = '聊天记录';
    } else if (contactView === 'chat') {
      appTitle = getCurrentAiContact()?.name || '短信';
    }
  } else if (appKey === 'music') {
    if (recordsView === 'musicEditor') {
      appTitle = editingMusicIndex >= 0 ? '编辑音乐' : '新增音乐';
    } else if (recordsView === 'musicPlayer') {
      appTitle = '音乐播放器';
    }
  } else if (appKey === 'radio' && radioView === 'detail') {
    appTitle = '新闻正文';
  } else if (appKey === 'data') {
    if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptAddType') {
      appTitle = '选择块类型';
    } else if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptMessageBlockEditor') {
      appTitle = '消息块';
    } else if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptContextBlockEditor') {
      appTitle = '上下文槽';
    } else if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptInfoSourcePicker') {
      appTitle = '选择信息来源';
    } else if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptWorldBookPicker') {
      appTitle = '选择世界书';
    } else if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptBlockPreview') {
      appTitle = aiPresetPreviewTitle || '块预览';
    } else if (dataView === 'presetList') {
      appTitle = getDataCategoryLabel(currentDataCategoryKey);
    } else if (dataView === 'presetDetail') {
      appTitle = getCurrentDataPreset()?.name || (isAiPresetDataCategory(currentDataCategoryKey) ? '预设' : `${getDataCategoryLabel(currentDataCategoryKey)}预设`);
    } else if (dataView === 'presetEditor') {
      appTitle = '编辑预设';
    }
  } else if (appKey === 'records') {
    if (recordsView === 'videoList') {
      appTitle = '视频';
    } else if (recordsView === 'videoEditor') {
      appTitle = editingNetworkVideoIndex >= 0 ? '编辑视频' : '新增视频';
    } else if (recordsView === 'videoPlayer') {
      appTitle = '视频播放器';
    }
  }
  document.getElementById('app-window-title').textContent = appTitle;
  updateTime();

  if (appKey === 'settings') {
    const appWindowBody = document.getElementById('app-window-body');
    appWindowBody.innerHTML = renderSettingsContent();
    appWindowBody.classList.toggle('is-scrollable', !['screensaverList', 'aiModelList', 'aiConfigList', 'aiPromptList', 'aiPromptOverviewList', 'aiPromptAddType', 'aiPromptContextBlockEditor', 'aiPromptInfoSourcePicker', 'aiPromptWorldBookPicker', 'aiPromptBlockPreview'].includes(settingsView));

    if (settingsView === 'aiPromptList') {
      setAppSoftkeys('新建', '进入', '返回');
      requestAnimationFrame(() => {
        const presetList = document.getElementById('ai-preset-name-list');
        const selectedItem = presetList?.querySelector('.ai-preset-name-item.is-selected');
        if (!presetList) return;
        presetList.scrollTop = aiPresetListScrollTop;
        selectedItem?.scrollIntoView({ block: 'nearest' });
        presetList.addEventListener('scroll', () => {
          aiPresetListScrollTop = presetList.scrollTop;
        }, { passive: true });
      });
    } else if (settingsView === 'aiPromptOverviewList') {
      setAppSoftkeys('', '查看', '返回');
      requestAnimationFrame(() => {
        const presetList = document.getElementById('ai-preset-overview-list');
        const selectedItem = presetList?.querySelector('.ai-preset-name-item.is-selected');
        if (!presetList) return;
        presetList.scrollTop = aiPresetListScrollTop;
        selectedItem?.scrollIntoView({ block: 'nearest' });
        presetList.addEventListener('scroll', () => {
          aiPresetListScrollTop = presetList.scrollTop;
        }, { passive: true });
      });
    } else if (settingsView === 'aiPromptAddType') {
      setAppSoftkeys('', '选择', '返回');
      requestAnimationFrame(() => {
        document.querySelector('.ai-preset-picker-item.is-selected')?.scrollIntoView({ block: 'nearest' });
      });
    } else if (settingsView === 'aiPromptMessageBlockEditor') {
      setAppSoftkeys('', editingAiPresetBlockIndex >= 0 ? '保存' : '添加', '返回');
    } else if (settingsView === 'aiPromptContextBlockEditor') {
      setAppSoftkeys('查看', editingAiPresetBlockIndex >= 0 ? '保存' : '添加', '返回');
    } else if (settingsView === 'aiPromptInfoSourcePicker') {
      setAppSoftkeys('查看', '选择', '返回');
      requestAnimationFrame(() => {
        document.querySelector('.ai-preset-picker-item.is-selected')?.scrollIntoView({ block: 'nearest' });
      });
    } else if (settingsView === 'aiPromptWorldBookPicker') {
      setAppSoftkeys('查看', '选择', '返回');
      requestAnimationFrame(() => {
        document.querySelector('.ai-preset-picker-item.is-selected')?.scrollIntoView({ block: 'nearest' });
      });
    } else if (settingsView === 'aiPromptBlockPreview') {
      setAppSoftkeys('', '', '返回');
    } else if (settingsView === 'aiPromptEditor') {
      setAppSoftkeys('添加', '保存', '返回');
      requestAnimationFrame(() => {
        document.querySelector('.ai-preset-block-item.is-selected')?.scrollIntoView({ block: 'nearest' });
      });
    } else if (settingsView === 'aiMainChatPreview') {
      setAppSoftkeys('刷新', '', '返回');
    } else if (settingsView === 'aiMainChatRules') {
      setAppSoftkeys('新增', '保存', '返回');
      focusAiMainChatInput();
    } else if (settingsView === 'aiMainChat') {
      setAppSoftkeys('', '保存', '返回');
      focusAiMainChatInput();
    } else if (settingsView === 'aiModelEditor') {
      setAppSoftkeys('', '保存', '返回');
      focusAiModelInput();
    } else if (settingsView === 'aiModelList') {
      setAppSoftkeys('', '选择', '返回');
      requestAnimationFrame(() => {
        const modelList = document.getElementById('ai-model-list');
        const selectedItem = modelList?.querySelector('.screensaver-saved-item.is-selected');
        if (!modelList) return;
        modelList.scrollTop = aiModelListScrollTop;
        selectedItem?.scrollIntoView({ block: 'nearest' });
        modelList.addEventListener('scroll', () => {
          aiModelListScrollTop = modelList.scrollTop;
        }, { passive: true });
      });
    } else if (settingsView === 'aiParamConfig') {
      setAppSoftkeys('', '保存', '返回');
      focusAiParamInput();
    } else if (settingsView === 'aiConfigList') {
      setAppSoftkeys('新增', '编辑', '返回');
      requestAnimationFrame(() => {
        const apiProfileList = document.getElementById('ai-api-profile-list');
        const selectedItem = apiProfileList?.querySelector('.ai-api-profile-item.is-selected');
        if (!apiProfileList) return;
        apiProfileList.scrollTop = aiApiProfileListScrollTop;
        selectedItem?.scrollIntoView({ block: 'nearest' });
        apiProfileList.addEventListener('scroll', () => {
          aiApiProfileListScrollTop = apiProfileList.scrollTop;
        }, { passive: true });
      });
    } else if (settingsView === 'aiConfig') {
      setAppSoftkeys('连接', '保存', '返回');
      focusAiSettingsInput();
    } else if (settingsView === 'screensaverList') {
      setAppSoftkeys('新增', '编辑', '返回');
    } else if (settingsView === 'screensaverEditor') {
      setAppSoftkeys('返回', '保存', '关闭');
      focusScreenSaverInput();
    } else {
      setAppSoftkeys('返回', '确定', '关闭');
      updateSettingsSelection();
    }

    if (settingsView === 'list') {
      updateSettingsSelection();
    }
    return;
  }

  if (appKey === 'contact') {
    document.getElementById('app-window-body').classList.remove('is-scrollable');
    document.getElementById('app-window-body').innerHTML = renderContactContent();

    if (contactView === 'list') {
      setAppSoftkeys('新增', aiContacts.length ? '编辑' : '新增', '返回');
      requestAnimationFrame(() => {
        const contactList = document.getElementById('ai-contact-list');
        const selectedItem = contactList?.querySelector('.contact-saved-item.is-selected');
        if (!contactList) return;
        contactList.scrollTop = aiContactListScrollTop;
        selectedItem?.scrollIntoView({ block: 'nearest' });
        contactList.addEventListener('scroll', () => {
          aiContactListScrollTop = contactList.scrollTop;
        }, { passive: true });
      });
      return;
    }

    if (contactView === 'editor') {
      setAppSoftkeys('', '保存', '返回');
      focusAiContactEditorInput();
      return;
    }

    setAppSoftkeys('新增', aiContacts.length ? '编辑' : '新增', '返回');
    return;
  }

  if (appKey === 'sms') {
    document.getElementById('app-window-body').classList.remove('is-scrollable');
    document.getElementById('app-window-body').innerHTML = renderSmsContent();

    if (contactView === 'smsSettings') {
      setAppSoftkeys('', '进入', '返回');
      requestAnimationFrame(() => {
        const settingsList = document.getElementById('sms-settings-list');
        const selectedItem = settingsList?.querySelector('.sms-settings-item.is-selected');
        if (!settingsList) return;
        settingsList.scrollTop = smsSettingsListScrollTop;
        selectedItem?.scrollIntoView({ block: 'nearest' });
        settingsList.addEventListener('scroll', () => {
          smsSettingsListScrollTop = settingsList.scrollTop;
        }, { passive: true });
      });
      return;
    }

    if (contactView === 'smsApiBinding') {
      setAppSoftkeys('', '绑定', '返回');
      requestAnimationFrame(() => {
        const profileList = document.getElementById('sms-api-profile-list');
        const selectedItem = profileList?.querySelector('.sms-api-profile-item.is-selected');
        if (!profileList) return;
        profileList.scrollTop = smsApiProfileListScrollTop;
        selectedItem?.scrollIntoView({ block: 'nearest' });
        profileList.addEventListener('scroll', () => {
          smsApiProfileListScrollTop = profileList.scrollTop;
        }, { passive: true });
      });
      return;
    }

    if (contactView === 'smsPreset') {
      setAppSoftkeys('', '选择', '返回');
      requestAnimationFrame(() => {
        const presetList = document.getElementById('sms-preset-list');
        const selectedItem = presetList?.querySelector('.sms-preset-item.is-selected');
        if (!presetList) return;
        presetList.scrollTop = smsPresetListScrollTop;
        selectedItem?.scrollIntoView({ block: 'nearest' });
        presetList.addEventListener('scroll', () => {
          smsPresetListScrollTop = presetList.scrollTop;
        }, { passive: true });
      });
      return;
    }

    if (contactView === 'smsSummaryPreset') {
      setAppSoftkeys('', '选择', '返回');
      requestAnimationFrame(() => {
        const presetList = document.getElementById('sms-summary-preset-list');
        const selectedItem = presetList?.querySelector('.sms-preset-item.is-selected');
        if (!presetList) return;
        presetList.scrollTop = smsSummaryPresetListScrollTop;
        selectedItem?.scrollIntoView({ block: 'nearest' });
        presetList.addEventListener('scroll', () => {
          smsSummaryPresetListScrollTop = presetList.scrollTop;
        }, { passive: true });
      });
      return;
    }

    if (contactView === 'smsChatHistory') {
      setAppSoftkeys('', '', '返回');
      return;
    }

    if (contactView === 'list') {
      setAppSoftkeys('设置', '进入', '返回');
      requestAnimationFrame(() => {
        const contactList = document.getElementById('ai-contact-list');
        const selectedItem = contactList?.querySelector('.contact-saved-item.is-selected');
        if (!contactList) return;
        contactList.scrollTop = aiContactListScrollTop;
        selectedItem?.scrollIntoView({ block: 'nearest' });
        contactList.addEventListener('scroll', () => {
          aiContactListScrollTop = contactList.scrollTop;
        }, { passive: true });
      });
      return;
    }

    if (contactView === 'chat') {
      setAppSoftkeys(aiChatRequestStatus === 'loading' ? '等待' : '发送', '发出', '返回');
      requestAnimationFrame(() => {
        const chatList = document.getElementById('ai-contact-chat-list');
        if (!chatList) {
          focusAiChatInput();
          return;
        }
        if (aiChatShouldScrollBottom) {
          chatList.scrollTop = chatList.scrollHeight;
          aiChatScrollTop = chatList.scrollTop;
          aiChatShouldScrollBottom = false;
        } else {
          chatList.scrollTop = aiChatScrollTop;
        }
        chatList.addEventListener('scroll', () => {
          aiChatScrollTop = chatList.scrollTop;
        }, { passive: true });
        syncAiChatInputHeight();
        focusAiChatInput();
      });
      return;
    }

    setAppSoftkeys('设置', '进入', '返回');
    return;
  }

  if (appKey === 'radio') {
    document.getElementById('app-window-body').classList.remove('is-scrollable');
    document.getElementById('app-window-body').innerHTML = renderRadioContent();
    requestAnimationFrame(() => {
      if (radioView === 'detail') {
        const detailBody = document.getElementById('radio-news-detail-body');
        if (!detailBody) return;
        detailBody.scrollTop = radioDetailScrollTop;
        detailBody.addEventListener('scroll', () => {
          radioDetailScrollTop = detailBody.scrollTop;
        }, { passive: true });
        return;
      }

      const radioList = document.getElementById('radio-news-list');
      const selectedItem = radioList?.querySelector('.radio-news-item.is-selected');
      if (!radioList || !selectedItem) return;
      radioList.scrollTop = radioListScrollTop;
      selectedItem.scrollIntoView({ block: 'nearest' });
      radioList.addEventListener('scroll', () => {
        radioListScrollTop = radioList.scrollTop;
      }, { passive: true });
    });
    return;
  }

  if (appKey === 'data') {
    const appWindowBody = document.getElementById('app-window-body');
    appWindowBody.innerHTML = renderDataContent();
    appWindowBody.classList.toggle('is-scrollable', Boolean(isAiPresetDataCategory(currentDataCategoryKey) && settingsView && !['aiPromptAddType', 'aiPromptInfoSourcePicker', 'aiPromptWorldBookPicker', 'aiPromptBlockPreview'].includes(settingsView)));

    if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptAddType') {
      setAppSoftkeys('', '选择', '返回');
      requestAnimationFrame(() => {
        document.querySelector('.ai-preset-picker-item.is-selected')?.scrollIntoView({ block: 'nearest' });
      });
      return;
    }

    if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptMessageBlockEditor') {
      setAppSoftkeys('', editingAiPresetBlockIndex >= 0 ? '保存' : '添加', '返回');
      return;
    }

    if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptContextBlockEditor') {
      setAppSoftkeys('查看', editingAiPresetBlockIndex >= 0 ? '保存' : '添加', '返回');
      return;
    }

    if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptInfoSourcePicker') {
      setAppSoftkeys('查看', '选择', '返回');
      requestAnimationFrame(() => {
        document.querySelector('.ai-preset-picker-item.is-selected')?.scrollIntoView({ block: 'nearest' });
      });
      return;
    }

    if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptWorldBookPicker') {
      setAppSoftkeys('查看', '选择', '返回');
      requestAnimationFrame(() => {
        document.querySelector('.ai-preset-picker-item.is-selected')?.scrollIntoView({ block: 'nearest' });
      });
      return;
    }

    if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptBlockPreview') {
      setAppSoftkeys('', '', '返回');
      return;
    }

    if (dataView === 'presetEditor') {
      setAppSoftkeys('', '保存', '返回');
      focusDataPresetEditorInput();
      return;
    }

    if (dataView === 'presetDetail') {
      setAppSoftkeys('导出', isAiPresetDataCategory(currentDataCategoryKey) ? '编辑' : '编辑', '返回');
      requestAnimationFrame(() => {
        const entryList = document.getElementById('data-entry-list');
        const selectedItem = isAiPresetDataCategory(currentDataCategoryKey) ? entryList?.querySelector('.ai-preset-block-item.is-selected') : null;
        if (!entryList) return;
        entryList.scrollTop = dataDetailScrollTop;
        selectedItem?.scrollIntoView({ block: 'nearest' });
        entryList.addEventListener('scroll', () => {
          dataDetailScrollTop = entryList.scrollTop;
        }, { passive: true });
      });
      return;
    }

    if (dataView === 'presetList') {
      setAppSoftkeys('导入', isAiPresetDataCategory(currentDataCategoryKey) ? '查看' : '应用', '返回');
      requestAnimationFrame(() => {
        const presetList = document.getElementById('data-preset-list');
        const selectedItem = presetList?.querySelector('.data-preset-item.is-selected');
        if (!presetList) return;
        presetList.scrollTop = dataPresetListScrollTop;
        selectedItem?.scrollIntoView({ block: 'nearest' });
        presetList.addEventListener('scroll', () => {
          dataPresetListScrollTop = presetList.scrollTop;
        }, { passive: true });
      });
      return;
    }

    appWindowBody.classList.remove('is-scrollable');
    setAppSoftkeys('', '进入', '返回');
    requestAnimationFrame(() => {
      const categoryList = document.getElementById('data-category-list');
      const selectedItem = categoryList?.querySelector('.data-category-item.is-selected');
      if (!categoryList) return;
      selectedItem?.scrollIntoView({ block: 'nearest' });
    });
    return;
  }

  if (appKey === 'music') {
    document.getElementById('app-window-body').classList.remove('is-scrollable');
    document.getElementById('app-window-body').innerHTML = renderMusicContent();

    if (recordsView === 'musicList') {
      setAppSoftkeys('新增', '播放', '返回');
      requestAnimationFrame(() => {
        const musicList = document.getElementById('music-saved-list');
        const selectedItem = musicList?.querySelector('.music-saved-item.is-selected');
        if (!musicList) return;
        musicList.scrollTop = musicListScrollTop;
        selectedItem?.scrollIntoView({ block: 'nearest' });
        musicList.addEventListener('scroll', () => {
          musicListScrollTop = musicList.scrollTop;
        }, { passive: true });
      });
      return;
    }

    if (recordsView === 'musicEditor') {
      setAppSoftkeys('返回', '保存', '关闭');
      focusMusicEditorInput();
      return;
    }

    if (recordsView === 'musicPlayer') {
      setAppSoftkeys(getMusicPlaybackModeLabel(), musicPlaybackStatus === 'playing' ? '暂停' : '播放', '返回');
      requestAnimationFrame(() => {
        bindMusicPlayer(document.getElementById('music-player-audio'));
        updateMusicPlayerUI();
      });
      return;
    }

    setAppSoftkeys('新增', '播放', '返回');
    return;
  }

  if (appKey === 'records') {
    document.getElementById('app-window-body').classList.remove('is-scrollable');
    document.getElementById('app-window-body').innerHTML = renderRecordsContent();

    if (recordsView === 'videoList') {
      setAppSoftkeys('新增', '播放', '返回');
      requestAnimationFrame(() => {
        const videoList = document.getElementById('network-video-saved-list');
        const selectedItem = videoList?.querySelector('.network-video-saved-item.is-selected');
        if (!videoList) return;
        videoList.scrollTop = networkVideoListScrollTop;
        selectedItem?.scrollIntoView({ block: 'nearest' });
        videoList.addEventListener('scroll', () => {
          networkVideoListScrollTop = videoList.scrollTop;
        }, { passive: true });
      });
      return;
    }

    if (recordsView === 'videoEditor') {
      setAppSoftkeys('返回', '保存', '关闭');
      focusNetworkVideoEditorInput();
      return;
    }

    if (recordsView === 'videoPlayer') {
      requestAnimationFrame(() => {
        syncNetworkVideoPlayerView({ rebindPlayback: true, focusInput: !isNetworkFullscreen });
      });
      return;
    }

    setAppSoftkeys('返回', '进入', '关闭');
    return;
  }

  setAppSoftkeys('返回', '选择', '关闭');
  document.getElementById('app-window-body').innerHTML = `

    <div class="app-screen-box">
      <div class="app-kicker">${app.kicker}</div>
      <div class="app-mainline">${app.main}</div>
      <div class="app-subline">${app.sub}</div>
    </div>
    <ul class="app-list">
      ${app.list.map(([label, value]) => `<li><span>${label}</span><span>${value}</span></li>`).join('')}
    </ul>
  `;
}

function openApp(appKey) {
  if (isClosed || isAlerting) return;
  if (appKey === 'settings') {
    selectedSettingsIndex = 0;
    pendingThemeIndex = selectedThemeIndex;
    pendingFontSizeKey = currentFontSizeKey;
    pendingScreenSaverName = '';
    pendingScreenSaverImageUrl = '';
    editingScreenSaverIndex = -1;
    selectedScreenSaverListIndex = screenSaverEntries.length ? 0 : -1;
    selectedAiModelIndex = -1;
    aiModelListScrollTop = 0;
    aiApiProfileListScrollTop = 0;
    aiPresetListScrollTop = 0;
    editingAiPresetBlockIndex = -1;
    selectedAiPresetAddTypeIndex = 0;
    selectedAiPresetInfoSourceIndex = -1;
    selectedAiPresetWorldBookIndex = -1;
    pendingAiPresetBlockDraft = null;
    aiPresetWorldBookOptions = [];
    aiPresetWorldBookStatus = '';
    settingsView = 'list';
    aiConfigStatusMessage = '';
    aiConfigConnectionState = 'idle';
    setPendingAiSettings(aiSettings);
  }
  if (appKey === 'contact') {
    contactView = 'list';
    editingAiContactIndex = -1;
    pendingAiContactName = '';
    pendingAiContactPrompt = '';
    pendingAiChatInput = '';
    selectedAiContactIndex = aiContacts.length ? Math.min(Math.max(selectedAiContactIndex, 0), aiContacts.length - 1) : -1;
    currentAiContactIndex = -1;
    aiContactListScrollTop = 0;
    aiChatScrollTop = 0;
    aiChatShouldScrollBottom = false;
    aiChatErrorMessage = '';
  }
  if (appKey === 'sms') {
    contactView = 'list';
    editingAiContactIndex = -1;
    pendingAiContactName = '';
    pendingAiContactPrompt = '';
    pendingAiChatInput = '';
    selectedAiContactIndex = aiContacts.length ? Math.min(Math.max(selectedAiContactIndex, 0), aiContacts.length - 1) : -1;
    currentAiContactIndex = -1;
    aiContactListScrollTop = 0;
    aiChatScrollTop = 0;
    aiChatShouldScrollBottom = false;
    aiChatErrorMessage = '';
    selectedSmsSettingsIndex = 0;
    smsSettingsListScrollTop = 0;
    currentSmsPresetId = normalizeAiSettings(aiSettings).selectedSmsPresetId || '';
    currentSmsSummaryPresetId = normalizeAiSettings(aiSettings).selectedSmsSummaryPresetId || currentSmsPresetId || '';
    selectedSmsPresetIndex = -1;
    selectedSmsSummaryPresetIndex = -1;
    smsPresetListScrollTop = 0;
    smsSummaryPresetListScrollTop = 0;
    selectedSmsApiProfileIndex = -1;
    smsApiProfileListScrollTop = 0;
    smsApiBindingReturnView = 'list';
  }
  if (appKey === 'data') {
    dataView = 'categoryList';
    selectedDataCategoryIndex = 0;
    currentDataCategoryKey = 'records';
    currentDataPresetId = '';
    editingDataPresetId = '';
    pendingDataPresetName = '';
    pendingDataPresetItemsJson = '';
    dataPresetListScrollTop = 0;
    dataDetailScrollTop = 0;
    dataStatusMessage = '';
  }
  if (appKey === 'music') {
    recordsView = 'musicList';
    pendingMusicName = '';
    pendingMusicUrl = '';
    pendingMusicCoverUrl = '';
    editingMusicIndex = -1;
    selectedMusicListIndex = musicEntries.length ? 0 : -1;
    musicListScrollTop = 0;
    currentMusicTrackIndex = -1;
    currentMusicTrackUrl = '';
    musicPlaybackStatus = 'idle';
    musicShouldAutoplay = false;
  }
  if (appKey === 'records') {
    recordsView = 'videoList';
    selectedRecordsIndex = 0;
    pendingNetworkVideoName = '';
    pendingNetworkVideoUrl = currentNetworkVideoUrl;
    editingNetworkVideoIndex = -1;
    selectedNetworkVideoListIndex = networkVideoEntries.length ? 0 : -1;
    networkVideoListScrollTop = 0;
    isNetworkVideoPlaybackReady = false;
    isNetworkFullscreen = false;
  }
  if (appKey === 'radio') {
    radioView = 'list';
    radioListScrollTop = 0;
    radioDetailScrollTop = 0;
    selectedRadioNewsIndex = Math.min(selectedRadioNewsIndex, Math.max(radioNewsEntries.length - 1, 0));
  }
  hideScreenSaver();
  renderAppWindow(appKey);
  document.getElementById('app-window').classList.add('open');
}

function closeApp() {
  settingsView = 'list';
  selectedAiModelIndex = -1;
  aiModelListScrollTop = 0;
  aiApiProfileListScrollTop = 0;
  aiConfigStatusMessage = '';
  aiConfigConnectionState = 'idle';
  recordsView = 'videoList';
  selectedRecordsIndex = 0;
  contactView = 'list';
  editingAiContactIndex = -1;
  pendingAiContactName = '';
  pendingAiContactPrompt = '';
  pendingAiChatInput = '';
  aiChatErrorMessage = '';
  aiContactListScrollTop = 0;
  aiChatScrollTop = 0;
  aiChatShouldScrollBottom = false;
  pendingAiPresetName = '';
  currentAiPresetId = '';
  selectedAiPresetListIndex = -1;
  aiPresetListScrollTop = 0;
  pendingAiPresetBlocks = [];
  selectedAiPresetBlockIndex = -1;
  editingAiPresetBlockIndex = -1;
  selectedAiPresetAddTypeIndex = 0;
  selectedAiPresetInfoSourceIndex = -1;
  selectedAiPresetWorldBookIndex = -1;
  pendingAiPresetBlockDraft = null;
  aiPresetWorldBookOptions = [];
  aiPresetWorldBookStatus = '';
  selectedSmsSettingsIndex = 0;
  smsSettingsListScrollTop = 0;
  currentSmsPresetId = '';
  currentSmsSummaryPresetId = '';
  selectedSmsPresetIndex = -1;
  selectedSmsSummaryPresetIndex = -1;
  smsPresetListScrollTop = 0;
  smsSummaryPresetListScrollTop = 0;
  selectedSmsApiProfileIndex = -1;
  smsApiProfileListScrollTop = 0;
  smsApiBindingReturnView = 'list';
  radioView = 'list';
  radioListScrollTop = 0;
  radioDetailScrollTop = 0;
  dataView = 'categoryList';
  selectedDataCategoryIndex = 0;
  currentDataCategoryKey = 'records';
  currentDataPresetId = '';
  editingDataPresetId = '';
  pendingDataPresetName = '';
  pendingDataPresetItemsJson = '';
  dataPresetListScrollTop = 0;
  dataDetailScrollTop = 0;
  dataStatusMessage = '';
  isNetworkVideoPlaybackReady = false;
  isNetworkFullscreen = false;
  resetNetworkFullscreenPhoneState();
  pendingMusicName = '';
  pendingMusicUrl = '';
  pendingMusicCoverUrl = '';
  editingMusicIndex = -1;
  selectedMusicListIndex = musicEntries.length ? 0 : -1;
  musicListScrollTop = 0;
  currentMusicTrackIndex = -1;
  currentMusicTrackUrl = '';
  musicPlaybackStatus = 'idle';
  musicShouldAutoplay = false;
  pendingNetworkVideoName = '';
  pendingNetworkVideoUrl = currentNetworkVideoUrl;
  editingNetworkVideoIndex = -1;
  selectedNetworkVideoListIndex = networkVideoEntries.length ? 0 : -1;
  networkVideoListScrollTop = 0;
  pendingScreenSaverName = '';
  pendingScreenSaverImageUrl = '';
  editingScreenSaverIndex = -1;
  selectedScreenSaverListIndex = screenSaverEntries.length ? 0 : -1;
  currentAppKey = null;
  document.getElementById('app-window').classList.remove('open');
  updateTime();
  updateMenuSelection();
}

function togglePhoneFlip(event) {
  setPhoneClosed(!isClosed);
}

function setPhoneClosed(closed) {
  const phone = document.getElementById('phone');
  isClosed = closed;

  if (isClosed) {
    phone.classList.add('is-closed');
    closeApp();
    setScreenSaverActive(true);
  } else {
    phone.classList.remove('is-closed');
  }
}

function openPhone(event) {
  if (event) {
    event.stopPropagation();
  }
  if (!isClosed) return;
  setPhoneClosed(false);
}

function closePhone(event) {
  if (event) {
    event.stopPropagation();
  }
  if (isClosed) return;
  setPhoneClosed(true);
}

function toggleAlert() {
  if (isClosed) return;

  const outerDisplay = document.getElementById('outer-time');
  isAlerting = !isAlerting;

  if (isAlerting) {
    closeApp();
    outerDisplay.classList.add('alert');
    outerDisplay.textContent = 'WARNING';
  } else {
    outerDisplay.classList.remove('alert');
    updateTime();
  }
}

function getDpadDirection(event, pad) {
  const rect = pad.getBoundingClientRect();
  const pointX = event.touches ? event.touches[0].clientX : event.clientX;
  const pointY = event.touches ? event.touches[0].clientY : event.clientY;
  const x = pointX - rect.left - rect.width / 2;
  const y = pointY - rect.top - rect.height / 2;

  return Math.abs(x) > Math.abs(y)
    ? (x > 0 ? 'right' : 'left')
    : (y > 0 ? 'down' : 'up');
}

function clearDpadState(pad) {
  if (!pad) return;
  pad.classList.remove('is-pressed-up', 'is-pressed-right', 'is-pressed-down', 'is-pressed-left');
}

function pressDpad(event) {
  if (event) event.stopPropagation();
  if (isClosed || isScreenSaverActive || event.target.closest('.d-pad-center')) return;

  const pad = event?.currentTarget || document.getElementById('dpad');
  if (!pad) return;

  const direction = getDpadDirection(event, pad);
  clearDpadState(pad);
  pad.classList.add(`is-pressed-${direction}`);

  if (isAppWindowOpen()) {
    if (currentAppKey === 'settings') {
      moveSettingsSelection(direction);
    } else if (currentAppKey === 'contact' || currentAppKey === 'sms') {
      moveContactSelection(direction);
    } else if (currentAppKey === 'data') {
      moveDataSelection(direction);
    } else if (currentAppKey === 'music') {
      moveMusicSelection(direction);
    } else if (currentAppKey === 'records') {
      moveRecordsSelection(direction);
    } else if (currentAppKey === 'radio') {
      moveRadioSelection(direction);
    }
    return;
  }

  moveMenuSelection(direction);
}

function pressDpadCenter(event) {
  event.stopPropagation();
  if (isClosed) return;

  const button = event.currentTarget;
  button.classList.add('is-pressed');
  setTimeout(() => button.classList.remove('is-pressed'), 120);
  confirmCurrentSelection();
}

function releaseDpad() {
  clearDpadState(document.getElementById('dpad'));
}

function handleSideButtonPress(event) {
  event.stopPropagation();
  const button = event.currentTarget;
  button.classList.add('is-pressed');
  setTimeout(() => button.classList.remove('is-pressed'), 120);

  if (isClosed || isAlerting) return;

  const action = button.dataset.action;

  if (action === 'confirm-menu') {
    if (isScreenSaverActive) {
      hideScreenSaver();
      updateMenuSelection();
      return;
    }
    if (currentAppKey === 'music' && isAppWindowOpen()) {
      if (recordsView === 'musicList') {
        openMusicEditor();
        return;
      }
      if (recordsView === 'musicPlayer') {
        toggleMusicPlaybackMode();
        return;
      }
    }
    if (currentAppKey === 'records' && isAppWindowOpen()) {
      if (recordsView === 'videoList') {
        openNetworkVideoEditor();
        return;
      }
      if (recordsView === 'videoPlayer') {
        if (!currentNetworkVideoUrl && pendingNetworkVideoUrl.trim()) {
          loadNetworkVideoUrl(pendingNetworkVideoUrl);
        }
        toggleNetworkFullscreen();
        return;
      }
    }
    if (currentAppKey === 'contact' && isAppWindowOpen()) {
      if (contactView === 'list') {
        openAiContactEditor();
        return;
      }
      if (contactView === 'editor') {
        return;
      }
    }
    if (currentAppKey === 'sms' && isAppWindowOpen()) {
      if (contactView === 'list') {
        openSmsSettings();
        return;
      }
      if (contactView === 'chat') {
        if (selectedAiChatMessageIds.length) {
          deleteSelectedAiChatMessage();
          return;
        }
        sendAiChatMessage();
        return;
      }
      if (contactView === 'smsSettings' || contactView === 'smsApiBinding' || contactView === 'smsPreset' || contactView === 'smsSummaryPreset' || contactView === 'smsChatHistory') {
        return;
      }
    }
    if (currentAppKey === 'data' && isAppWindowOpen()) {
      if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptContextBlockEditor') {
        openAiPresetContextPreview();
        return;
      }
      if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptInfoSourcePicker') {
        openAiPresetInfoSourcePreview();
        return;
      }
      if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptWorldBookPicker') {
        openAiPresetWorldBookPreview();
        return;
      }
      if (dataView === 'presetList') {
        openDataImportPicker();
        return;
      }
      if (dataView === 'presetDetail') {
        exportCurrentDataPreset();
        return;
      }
      if (dataView === 'presetEditor' || dataView === 'categoryList') {
        return;
      }
    }
    if (currentAppKey === 'settings' && settingsView === 'screensaverList') {
      openScreenSaverEditor();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptList') {
      createAiPresetAndOpen();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptOverviewList') {
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptAddType') {
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptMessageBlockEditor') {
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptContextBlockEditor') {
      openAiPresetContextPreview();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptInfoSourcePicker') {
      openAiPresetInfoSourcePreview();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptOverviewList') {
      const presetEntries = getAiPresetEntries();
      const targetPreset = presetEntries[selectedAiPresetListIndex] || null;
      if (targetPreset) {
        openAiPresetTotalContentPreview(targetPreset, { returnView: 'aiPromptOverviewList' });
      }
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptWorldBookPicker') {
      openAiPresetWorldBookPreview();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptBlockPreview') {
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptEditor') {
      openAiPresetAddTypePicker();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiMainChatRules') {
      pendingAiMainChatXmlRules.push({ tag: '', mode: 'recent', n: '' });
      renderAppWindow('settings');
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiMainChatPreview') {
      refreshAiMainChatPreview();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiConfigList') {
      openNewAiApiProfileDraft();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiConfig') {
      fetchAiModels();
      return;
    }
    confirmCurrentSelection();
    return;
  }

  if (action === 'back-cancel') {
    if (currentAppKey === 'settings' && settingsView === 'screensaverEditor') {
      closeScreenSaverEditor();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'screensaverList') {
      closeScreenSaverList();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptMessageBlockEditor') {
      cancelAiPresetBlockDraft();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptContextBlockEditor') {
      cancelAiPresetBlockDraft();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptInfoSourcePicker') {
      cancelAiPresetBlockDraft();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptWorldBookPicker') {
      cancelAiPresetBlockDraft();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptBlockPreview') {
      closeAiPresetBlockPreview();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptAddType') {
      settingsView = 'aiPromptEditor';
      renderAppWindow('settings');
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptEditor') {
      closeAiPresetConfig();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptOverviewList') {
      settingsView = 'list';
      renderAppWindow('settings');
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptList') {
      closeAiSystemPromptEditor();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiMainChatPreview') {
      closeAiMainChatPreview();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiMainChatRules') {
      closeAiMainChatRules();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiMainChat') {
      closeAiMainChatConfig();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiModelEditor') {
      closeAiModelEditor();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiModelList') {
      closeAiModelList();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiParamConfig') {
      closeAiParamConfig();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiConfigList') {
      closeAiConfig();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiConfig') {
      closeAiConfig();
      return;
    }
    if (currentAppKey === 'contact') {
      if (contactView === 'editor') {
        closeAiContactEditor();
        return;
      }
    }
    if (currentAppKey === 'sms') {
      if (contactView === 'smsApiBinding') {
        closeSmsApiBindingList();
        return;
      }
      if (contactView === 'smsPreset' || contactView === 'smsSummaryPreset' || contactView === 'smsChatHistory') {
        closeSmsSettingsPlaceholder();
        return;
      }
      if (contactView === 'smsSettings') {
        closeSmsSettings();
        return;
      }
      if (contactView === 'chat') {
        openAiContactList();
        return;
      }
      if (contactView === 'list') {
        closeApp();
        return;
      }
    }
    if (currentAppKey === 'data') {
      if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptMessageBlockEditor') {
        cancelAiPresetBlockDraft();
        return;
      }
      if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptContextBlockEditor') {
        cancelAiPresetBlockDraft();
        return;
      }
      if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptInfoSourcePicker') {
        cancelAiPresetBlockDraft();
        return;
      }
      if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptWorldBookPicker') {
        cancelAiPresetBlockDraft();
        return;
      }
      if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptAddType') {
        settingsView = '';
        renderAppWindow('data');
        return;
      }
      if (isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptBlockPreview') {
        closeAiPresetBlockPreview();
        return;
      }
      if (dataView === 'presetEditor') {
        closeDataPresetEditor();
        return;
      }
      if (dataView === 'presetDetail') {
        closeDataPresetDetail();
        return;
      }
      if (dataView === 'presetList') {
        closeDataPresetList();
        return;
      }
      closeApp();
      return;
    }
    if (currentAppKey === 'music') {
      if (recordsView === 'musicEditor') {
        closeMusicEditor();
        return;
      }
      if (recordsView === 'musicPlayer') {
        openRecordsMusic();
        return;
      }
      if (recordsView === 'musicList') {
        closeApp();
        return;
      }
    }
    if (currentAppKey === 'records') {
      if (isNetworkFullscreen) {
        toggleNetworkFullscreen(false);
        return;
      }
      if (recordsView === 'videoEditor') {
        closeNetworkVideoEditor();
        return;
      }
      if (recordsView === 'videoPlayer') {
        openNetworkVideoList();
        return;
      }
      if (recordsView === 'videoList') {
        closeApp();
        return;
      }
    }
    if (currentAppKey === 'radio' && radioView === 'detail') {
      closeRadioNewsDetail();
      return;
    }
    if (isAppWindowOpen()) {
      closeApp();
    }
    return;
  }

  if (action === 'open-contact') {
    selectMenuItemByApp('contact');
    openApp('contact');
    return;
  }

  if (action === 'go-screensaver') {
    if (isScreenSaverActive) {
      closePhone();
      return;
    }
    showScreenSaver();
  }
}

document.querySelectorAll('.grid-item').forEach((item, index) => {
  item.addEventListener('click', () => {
    selectedMenuIndex = index;
    updateMenuSelection();
    openApp(item.dataset.app);
  });
});

document.querySelectorAll('.keypad .button').forEach((button) => {
  button.addEventListener('click', (event) => {
    const shortcutKey = button.dataset.keypad;
    if (!shortcutKey) return;
    event.stopPropagation();

    if (shortcutKey === '#') {
      closePhone();
      return;
    }

    if (!/^[1-9]$/.test(shortcutKey)) return;
    openMenuShortcut(shortcutKey);
  });
});

document.getElementById('lid-open-button').addEventListener('click', openPhone);

const speakerEl = document.querySelector('.speaker');
if (speakerEl) {
  speakerEl.addEventListener('click', (event) => {
    if (currentAppKey === 'records' && isNetworkFullscreen) {
      event.stopPropagation();
      toggleNetworkFullscreen(false);
    }
  });
}

document.getElementById('realtime')?.addEventListener('click', handleRealtimeStatusBarClick);

const dpad = document.getElementById('dpad');
dpad.addEventListener('mousedown', pressDpad);
dpad.addEventListener('touchstart', pressDpad, { passive: true });
dpad.addEventListener('mouseup', releaseDpad);
dpad.addEventListener('mouseleave', releaseDpad);
dpad.addEventListener('touchend', releaseDpad);
dpad.addEventListener('touchcancel', releaseDpad);

document.querySelectorAll('.side-oval-button').forEach((button) => {
  button.addEventListener('click', handleSideButtonPress);
});

function handleSoftkeyClick(event) {
  event.stopPropagation();

  const softkey = event.currentTarget;
  if (!softkey || !softkey.textContent.trim() || isClosed) {
    return;
  }

  if (softkey.id === 'app-softkey-left') {
    document.getElementById('side-button-top-left')?.click();
    return;
  }

  if (softkey.id === 'app-softkey-center') {
    document.querySelector('.d-pad-center')?.click();
    return;
  }

  if (softkey.id === 'app-softkey-right') {
    document.getElementById('side-button-top-right')?.click();
  }
}

document.querySelectorAll('.app-softkey').forEach((softkey) => {
  softkey.addEventListener('click', handleSoftkeyClick);
});

document.getElementById('app-window').addEventListener('click', (event) => {
  const networkLoadButton = event.target.closest('#network-load-button');
  if (networkLoadButton && currentAppKey === 'records' && recordsView === 'videoPlayer') {
    loadNetworkVideoUrl();
    event.stopPropagation();
    return;
  }

  const recordsMenuItem = event.target.closest('.records-menu-item');
  if (recordsMenuItem && currentAppKey === 'records' && recordsView === 'menu') {
    selectedRecordsIndex = Number(recordsMenuItem.dataset.recordsIndex);
    confirmCurrentSelection();
    event.stopPropagation();
    return;
  }

  const musicControlButton = event.target.closest('[data-music-control]');
  if (musicControlButton && currentAppKey === 'music' && recordsView === 'musicPlayer') {
    const action = musicControlButton.dataset.musicControl;
    if (action === 'mode') toggleMusicPlaybackMode();
    if (action === 'prev') stepMusicTrack(-1);
    if (action === 'play') toggleMusicPlayback();
    if (action === 'next') stepMusicTrack(1);
    event.stopPropagation();
    return;
  }

  const musicProgressButton = event.target.closest('#music-player-progress-button');
  if (musicProgressButton && currentAppKey === 'music' && recordsView === 'musicPlayer') {
    seekMusicPlaybackFromClientX(event.clientX, musicProgressButton);
    event.stopPropagation();
    return;
  }

  const musicDeleteButton = event.target.closest('[data-music-delete-index]');
  if (musicDeleteButton && currentAppKey === 'music' && recordsView === 'musicList') {
    deleteMusicEntry(Number(musicDeleteButton.dataset.musicDeleteIndex));
    event.stopPropagation();
    return;
  }

  const musicSavedItem = event.target.closest('.music-saved-item');
  if (musicSavedItem && currentAppKey === 'music' && recordsView === 'musicList') {
    selectedMusicListIndex = Number(musicSavedItem.dataset.musicIndex);
    openMusicPlayer(selectedMusicListIndex, true);
    event.stopPropagation();
    return;
  }

  const networkVideoDeleteButton = event.target.closest('[data-network-video-delete-index]');
  if (networkVideoDeleteButton && currentAppKey === 'records' && recordsView === 'videoList') {
    deleteNetworkVideoEntry(Number(networkVideoDeleteButton.dataset.networkVideoDeleteIndex));
    event.stopPropagation();
    return;
  }

  const networkVideoSavedItem = event.target.closest('.network-video-saved-item');
  if (networkVideoSavedItem && currentAppKey === 'records' && recordsView === 'videoList') {
    selectedNetworkVideoListIndex = Number(networkVideoSavedItem.dataset.networkVideoIndex);
    openNetworkVideoPlayer(selectedNetworkVideoListIndex);
    event.stopPropagation();
    return;
  }

  const networkToggleButton = event.target.closest('#network-landscape-toggle-button, #network-portrait-toggle-button');
  if (networkToggleButton && currentAppKey === 'records' && recordsView === 'videoPlayer') {
    toggleNetworkVideoPlayback();
    event.stopPropagation();
    return;
  }

  const networkProgressButton = event.target.closest('#network-landscape-progress-button, #network-portrait-progress-button');
  if (networkProgressButton && currentAppKey === 'records' && recordsView === 'videoPlayer') {
    seekNetworkPlaybackFromClientX(event.clientX, networkProgressButton);
    event.stopPropagation();
    return;
  }

  const dataCategoryItem = event.target.closest('[data-data-category]');
  if (dataCategoryItem && currentAppKey === 'data' && dataView === 'categoryList') {
    const nextIndex = dataCategoryOrder.indexOf(dataCategoryItem.dataset.dataCategory);
    if (nextIndex >= 0) {
      selectedDataCategoryIndex = nextIndex;
      openDataPresetList(dataCategoryItem.dataset.dataCategory);
    }
    event.stopPropagation();
    return;
  }

  const dataPresetDeleteButton = event.target.closest('[data-data-preset-delete-id]');
  if (dataPresetDeleteButton && currentAppKey === 'data' && dataView === 'presetList') {
    deleteDataPreset(dataPresetDeleteButton.dataset.dataPresetDeleteId);
    event.stopPropagation();
    return;
  }

  const dataPresetItem = event.target.closest('[data-data-preset-id]');
  if (dataPresetItem && currentAppKey === 'data' && dataView === 'presetList') {
    currentDataPresetId = dataPresetItem.dataset.dataPresetId || '';
    openDataPresetDetail(currentDataPresetId);
    event.stopPropagation();
    return;
  }

  const aiPresetListDeleteButton = event.target.closest('[data-ai-preset-list-delete-id]');
  if (aiPresetListDeleteButton && currentAppKey === 'settings' && settingsView === 'aiPromptList') {
    deleteAiPreset(aiPresetListDeleteButton.dataset.aiPresetListDeleteId);
    event.stopPropagation();
    return;
  }

  const aiPresetListItem = event.target.closest('[data-ai-preset-list-index]');
  if (aiPresetListItem && currentAppKey === 'settings' && settingsView === 'aiPromptList') {
    selectedAiPresetListIndex = Number(aiPresetListItem.dataset.aiPresetListIndex);
    currentAiPresetId = aiPresetListItem.dataset.aiPresetId || currentAiPresetId;
    openAiPresetConfig(currentAiPresetId);
    event.stopPropagation();
    return;
  }

  const aiPresetOverviewItem = event.target.closest('[data-ai-preset-overview-index]');
  if (aiPresetOverviewItem && currentAppKey === 'settings' && settingsView === 'aiPromptOverviewList') {
    selectedAiPresetListIndex = Number(aiPresetOverviewItem.dataset.aiPresetOverviewIndex);
    currentAiPresetId = aiPresetOverviewItem.dataset.aiPresetId || currentAiPresetId;
    const presetEntries = getAiPresetEntries();
    const targetPreset = presetEntries[selectedAiPresetListIndex] || null;
    if (targetPreset) {
      openAiPresetTotalContentPreview(targetPreset, { returnView: 'aiPromptOverviewList' });
    }
    event.stopPropagation();
    return;
  }

  const aiPresetAddTypeItem = event.target.closest('[data-ai-preset-add-type-index]');
  if (aiPresetAddTypeItem && ['settings', 'data'].includes(currentAppKey) && settingsView === 'aiPromptAddType') {
    selectedAiPresetAddTypeIndex = Number(aiPresetAddTypeItem.dataset.aiPresetAddTypeIndex);
    confirmAiPresetAddTypeSelection();
    event.stopPropagation();
    return;
  }

  const aiPresetInfoSourceItem = event.target.closest('[data-ai-preset-info-source-index]');
  if (aiPresetInfoSourceItem && ['settings', 'data'].includes(currentAppKey) && settingsView === 'aiPromptInfoSourcePicker') {
    selectedAiPresetInfoSourceIndex = Number(aiPresetInfoSourceItem.dataset.aiPresetInfoSourceIndex);
    confirmAiPresetInfoSourceSelection();
    event.stopPropagation();
    return;
  }

  const aiPresetWorldBookItem = event.target.closest('[data-ai-preset-worldbook-index]');
  if (aiPresetWorldBookItem && ['settings', 'data'].includes(currentAppKey) && settingsView === 'aiPromptWorldBookPicker') {
    selectedAiPresetWorldBookIndex = Number(aiPresetWorldBookItem.dataset.aiPresetWorldbookIndex);
    confirmAiPresetWorldBookSelection();
    event.stopPropagation();
    return;
  }

  const aiPresetRoleToggleButton = event.target.closest('#ai-preset-block-role-toggle');
  if (aiPresetRoleToggleButton && ['settings', 'data'].includes(currentAppKey) && settingsView === 'aiPromptMessageBlockEditor') {
    cycleAiPresetDraftRole(1);
    event.stopPropagation();
    return;
  }

  const aiChatMessageBubble = event.target.closest('[data-ai-chat-message-id]');
  if (aiChatMessageBubble && currentAppKey === 'sms' && contactView === 'chat') {
    toggleAiChatMessageSelection(aiChatMessageBubble.dataset.aiChatMessageId);
    event.stopPropagation();
    return;
  }

  const aiPresetMoveButton = event.target.closest('[data-ai-preset-move-index]');
  if (aiPresetMoveButton && currentAppKey === 'settings' && settingsView === 'aiPromptEditor') {
    moveAiPresetBlock(aiPresetMoveButton.dataset.aiPresetMoveIndex, aiPresetMoveButton.dataset.aiPresetMoveDirection);
    event.stopPropagation();
    return;
  }

  const aiPresetDeleteButton = event.target.closest('[data-ai-preset-delete-index]');
  if (aiPresetDeleteButton && currentAppKey === 'settings' && settingsView === 'aiPromptEditor') {
    deleteAiPresetBlock(aiPresetDeleteButton.dataset.aiPresetDeleteIndex);
    event.stopPropagation();
    return;
  }

  const aiPresetBlockItem = event.target.closest('[data-ai-preset-block-index]');
  if (aiPresetBlockItem && currentAppKey === 'settings' && settingsView === 'aiPromptEditor') {
    openAiPresetBlockEditor(aiPresetBlockItem.dataset.aiPresetBlockIndex);
    event.stopPropagation();
    return;
  }
  if (aiPresetBlockItem && currentAppKey === 'data' && dataView === 'presetDetail' && isAiPresetDataCategory(currentDataCategoryKey) && !settingsView) {
    openAiPresetBlockEditor(aiPresetBlockItem.dataset.aiPresetBlockIndex);
    event.stopPropagation();
    return;
  }

  const aiContactDeleteButton = event.target.closest('[data-ai-contact-delete-index]');
  if (aiContactDeleteButton && currentAppKey === 'contact' && contactView === 'list') {
    deleteAiContact(Number(aiContactDeleteButton.dataset.aiContactDeleteIndex));
    event.stopPropagation();
    return;
  }

  const smsSettingsItem = event.target.closest('[data-sms-settings-index]');
  if (smsSettingsItem && currentAppKey === 'sms' && contactView === 'smsSettings') {
    selectedSmsSettingsIndex = Number(smsSettingsItem.dataset.smsSettingsIndex);
    openSmsSettingsSelection();
    event.stopPropagation();
    return;
  }

  const smsApiProfileItem = event.target.closest('[data-sms-api-profile-index]');
  if (smsApiProfileItem && currentAppKey === 'sms' && contactView === 'smsApiBinding') {
    selectedSmsApiProfileIndex = Number(smsApiProfileItem.dataset.smsApiProfileIndex);
    bindSmsApiProfileSelection();
    event.stopPropagation();
    return;
  }

  const smsPresetItem = event.target.closest('[data-sms-preset-index]');
  if (smsPresetItem && currentAppKey === 'sms' && contactView === 'smsPreset') {
    selectedSmsPresetIndex = Number(smsPresetItem.dataset.smsPresetIndex);
    bindSmsPresetSelection();
    event.stopPropagation();
    return;
  }

  const smsSummaryPresetItem = event.target.closest('[data-sms-summary-preset-index]');
  if (smsSummaryPresetItem && currentAppKey === 'sms' && contactView === 'smsSummaryPreset') {
    selectedSmsSummaryPresetIndex = Number(smsSummaryPresetItem.dataset.smsSummaryPresetIndex);
    bindSmsSummaryPresetSelection();
    event.stopPropagation();
    return;
  }

  const aiContactItem = event.target.closest('.contact-saved-item');
  if (aiContactItem && currentAppKey === 'contact' && contactView === 'list') {
    selectedAiContactIndex = Number(aiContactItem.dataset.aiContactIndex);
    openAiContactEditor(selectedAiContactIndex);
    event.stopPropagation();
    return;
  }
  if (aiContactItem && currentAppKey === 'sms' && contactView === 'list') {
    selectedAiContactIndex = Number(aiContactItem.dataset.aiContactIndex);
    openAiContactChat(selectedAiContactIndex);
    event.stopPropagation();
    return;
  }

  const radioNewsItem = event.target.closest('.radio-news-item');
  if (radioNewsItem && currentAppKey === 'radio') {
    selectedRadioNewsIndex = Number(radioNewsItem.dataset.radioNewsIndex);
    openRadioNewsDetail(selectedRadioNewsIndex);
    event.stopPropagation();
    return;
  }

  const aiApiCreateButton = event.target.closest('#ai-api-create');
  if (aiApiCreateButton && currentAppKey === 'settings' && settingsView === 'aiConfigList') {
    openNewAiApiProfileDraft();
    event.stopPropagation();
    return;
  }

  const aiApiDeleteButton = event.target.closest('[data-ai-api-delete-id]');
  if (aiApiDeleteButton && currentAppKey === 'settings' && settingsView === 'aiConfigList') {
    deleteAiApiProfile(aiApiDeleteButton.dataset.aiApiDeleteId);
    event.stopPropagation();
    return;
  }

  const aiApiProfileItem = event.target.closest('[data-ai-api-profile-id]');
  if (aiApiProfileItem && currentAppKey === 'settings' && settingsView === 'aiConfigList') {
    openAiConfigEditor(aiApiProfileItem.dataset.aiApiProfileId);
    event.stopPropagation();
    return;
  }

  const aiApiBindingButton = event.target.closest('[data-ai-api-binding-key]');
  if (aiApiBindingButton && currentAppKey === 'settings' && settingsView === 'aiConfig') {
    toggleAiApiBinding(aiApiBindingButton.dataset.aiApiBindingKey);
    event.stopPropagation();
    return;
  }

  const aiModelOpenButton = event.target.closest('#ai-model-open');
  if (aiModelOpenButton && currentAppKey === 'settings' && settingsView === 'aiConfig') {
    if (hasFetchedAiModels()) {
      openAiModelList();
    } else {
      openAiModelEditor();
    }
    event.stopPropagation();
    return;
  }

  const aiParamsOpenButton = event.target.closest('#ai-params-open');
  if (aiParamsOpenButton && currentAppKey === 'settings' && settingsView === 'aiConfig') {
    openAiParamConfig();
    event.stopPropagation();
    return;
  }

  const aiMainChatRulesOpenButton = event.target.closest('#ai-mainchat-rules-open');
  if (aiMainChatRulesOpenButton && currentAppKey === 'settings' && settingsView === 'aiMainChat') {
    openAiMainChatRules();
    event.stopPropagation();
    return;
  }

  const aiMainChatPreviewOpenButton = event.target.closest('#ai-mainchat-preview-open');
  if (aiMainChatPreviewOpenButton && currentAppKey === 'settings' && settingsView === 'aiMainChat') {
    openAiMainChatPreview();
    event.stopPropagation();
    return;
  }

  const aiMainChatRuleDeleteButton = event.target.closest('[data-ai-mainchat-rule-delete-index]');
  if (aiMainChatRuleDeleteButton && currentAppKey === 'settings' && settingsView === 'aiMainChatRules') {
    pendingAiMainChatXmlRules.splice(Number(aiMainChatRuleDeleteButton.dataset.aiMainchatRuleDeleteIndex), 1);
    renderAppWindow('settings');
    event.stopPropagation();
    return;
  }

  const aiMainChatRuleModeToggleButton = event.target.closest('[data-ai-mainchat-rule-mode-toggle-index]');
  if (aiMainChatRuleModeToggleButton && currentAppKey === 'settings' && settingsView === 'aiMainChatRules') {
    const ruleIndex = Number(aiMainChatRuleModeToggleButton.dataset.aiMainchatRuleModeToggleIndex);
    if (pendingAiMainChatXmlRules[ruleIndex]) {
      pendingAiMainChatXmlRules[ruleIndex].mode = pendingAiMainChatXmlRules[ruleIndex].mode === 'exclude' ? 'recent' : 'exclude';
      flashAiMainChatRuleMode(ruleIndex);
    }
    event.stopPropagation();
    return;
  }

  const aiModelItem = event.target.closest('[data-ai-model-index]');
  if (aiModelItem && currentAppKey === 'settings' && settingsView === 'aiModelList') {
    selectedAiModelIndex = Number(aiModelItem.dataset.aiModelIndex);
    const selectedModel = getSelectedAiModel();
    if (selectedModel) {
      pendingAiModel = selectedModel;
    }
    closeAiModelList();
    event.stopPropagation();
    return;
  }

  const settingRow = event.target.closest('.setting-row');
  if (settingRow && currentAppKey === 'settings' && settingsView === 'list') {
    selectedSettingsIndex = settingsRowOrder.indexOf(settingRow.dataset.setting);
    updateSettingsSelection();
    if (settingRow.dataset.setting === 'screensaver') {
      openScreenSaverList();
    }
    if (settingRow.dataset.setting === 'aiPrompt') {
      openAiSystemPromptEditor();
    }
    if (settingRow.dataset.setting === 'aiPromptOverview') {
      openAiPromptOverviewList();
    }
    if (settingRow.dataset.setting === 'aiMainChat') {
      openAiMainChatConfig();
    }
    if (settingRow.dataset.setting === 'aiConfig') {
      openAiConfig();
    }
    event.stopPropagation();
    return;
  }

  const deleteButton = event.target.closest('.screensaver-delete-button');
  if (deleteButton && currentAppKey === 'settings' && settingsView === 'screensaverList') {
    deleteScreenSaverEntry(Number(deleteButton.dataset.screensaverDeleteIndex));
    event.stopPropagation();
    return;
  }

  const savedItem = event.target.closest('.screensaver-saved-item');
  if (savedItem && currentAppKey === 'settings' && settingsView === 'screensaverList') {
    selectedScreenSaverListIndex = Number(savedItem.dataset.screensaverIndex);
    renderAppWindow('settings');
    event.stopPropagation();
    return;
  }
});

document.getElementById('app-window').addEventListener('pointerdown', (event) => {
  const musicProgressButton = event.target.closest('#music-player-progress-button');
  if (musicProgressButton && currentAppKey === 'music' && recordsView === 'musicPlayer') {
    isMusicProgressDragging = true;
    pendingMusicProgressRatio = getMusicPlaybackRatioFromClientX(event.clientX, musicProgressButton);
    if (musicProgressButton.setPointerCapture && event.pointerId != null) {
      musicProgressButton.setPointerCapture(event.pointerId);
    }
    updateMusicPlayerUI();
    event.preventDefault();
    event.stopPropagation();
    return;
  }

  const networkProgressButton = event.target.closest('#network-landscape-progress-button, #network-portrait-progress-button');
  if (networkProgressButton && currentAppKey === 'records' && recordsView === 'videoPlayer') {
    isNetworkProgressDragging = true;
    pendingNetworkProgressRatio = getNetworkPlaybackRatioFromClientX(event.clientX, networkProgressButton);
    if (networkProgressButton.setPointerCapture && event.pointerId != null) {
      networkProgressButton.setPointerCapture(event.pointerId);
    }
    updateNetworkLandscapeProgressUI();
    event.preventDefault();
    event.stopPropagation();
  }
});

document.addEventListener('pointermove', (event) => {
  if (isMusicProgressDragging && currentAppKey === 'music' && recordsView === 'musicPlayer') {
    pendingMusicProgressRatio = getMusicPlaybackRatioFromClientX(event.clientX);
    updateMusicPlayerUI();
    event.preventDefault();
    return;
  }

  if (isNetworkProgressDragging && currentAppKey === 'records' && recordsView === 'videoPlayer') {
    pendingNetworkProgressRatio = getNetworkPlaybackRatioFromClientX(event.clientX);
    updateNetworkLandscapeProgressUI();
    event.preventDefault();
  }
});

document.addEventListener('pointerup', (event) => {
  if (isMusicProgressDragging) {
    const nextRatio = getMusicPlaybackRatioFromClientX(event.clientX);
    isMusicProgressDragging = false;
    pendingMusicProgressRatio = null;
    if (nextRatio != null) {
      seekMusicPlaybackByRatio(nextRatio);
    } else {
      updateMusicPlayerUI();
    }
    return;
  }

  if (isNetworkProgressDragging) {
    const nextRatio = getNetworkPlaybackRatioFromClientX(event.clientX);
    isNetworkProgressDragging = false;
    pendingNetworkProgressRatio = null;
    if (nextRatio != null) {
      seekNetworkPlaybackByRatio(nextRatio);
    } else {
      updateNetworkLandscapeProgressUI();
    }
  }
});

document.addEventListener('pointercancel', () => {
  isMusicProgressDragging = false;
  pendingMusicProgressRatio = null;
  updateMusicPlayerUI();
  isNetworkProgressDragging = false;
  pendingNetworkProgressRatio = null;
  updateNetworkLandscapeProgressUI();
});


document.getElementById('app-window').addEventListener('input', (event) => {
  if (event.target.id === 'network-video-url-input' || event.target.id === 'network-video-url-editor') {
    pendingNetworkVideoUrl = event.target.value;
  }
  if (event.target.id === 'network-video-name-input') {
    pendingNetworkVideoName = event.target.value;
  }
  if (event.target.id === 'music-name-input') {
    pendingMusicName = event.target.value;
  }
  if (event.target.id === 'music-url-input') {
    pendingMusicUrl = event.target.value;
  }
  if (event.target.id === 'music-cover-url-input') {
    pendingMusicCoverUrl = event.target.value;
  }
  if (event.target.id === 'screensaver-name-input') {
    pendingScreenSaverName = event.target.value;
  }
  if (event.target.id === 'screensaver-url-input') {
    pendingScreenSaverImageUrl = event.target.value;
  }
  if (event.target.id === 'ai-settings-name-input') {
    pendingAiApiName = event.target.value;
  }
  if (event.target.id === 'ai-settings-url-input') {
    pendingAiUrl = event.target.value;
    aiConfigConnectionState = 'idle';
  }
  if (event.target.id === 'ai-settings-key-input') {
    pendingAiKey = event.target.value;
    aiConfigConnectionState = 'idle';
  }
  if (event.target.id === 'ai-mainchat-context-n-input') {
    pendingAiMainChatContextN = event.target.value;
  }
  if (event.target.id === 'ai-mainchat-user-n-input') {
    pendingAiMainChatUserN = event.target.value;
  }
  const aiMainChatRuleTagInput = event.target.closest('[data-ai-mainchat-rule-tag-index]');
  if (aiMainChatRuleTagInput) {
    pendingAiMainChatXmlRules[Number(aiMainChatRuleTagInput.dataset.aiMainchatRuleTagIndex)].tag = aiMainChatRuleTagInput.value;
  }
  const aiMainChatRuleNInput = event.target.closest('[data-ai-mainchat-rule-n-index]');
  if (aiMainChatRuleNInput) {
    pendingAiMainChatXmlRules[Number(aiMainChatRuleNInput.dataset.aiMainchatRuleNIndex)].n = aiMainChatRuleNInput.value;
  }
  if (event.target.id === 'ai-params-temperature-input') {
    pendingAiTemperature = event.target.value;
  }
  if (event.target.id === 'ai-params-frequency-penalty-input') {
    pendingAiFrequencyPenalty = event.target.value;
  }
  if (event.target.id === 'ai-params-presence-penalty-input') {
    pendingAiPresencePenalty = event.target.value;
  }
  if (event.target.id === 'ai-params-top-p-input') {
    pendingAiTopP = event.target.value;
  }
  if (event.target.id === 'ai-system-prompt-input') {
    pendingAiSystemPrompt = event.target.value;
  }
  if (event.target.id === 'ai-preset-name-input') {
    pendingAiPresetName = event.target.value;
  }
  if (event.target.id === 'ai-preset-block-name-input') {
    pendingAiPresetBlockDraft = {
      ...(pendingAiPresetBlockDraft || {}),
      name: event.target.value
    };
  }
  if (event.target.id === 'ai-preset-block-text-input') {
    pendingAiPresetBlockDraft = {
      ...(pendingAiPresetBlockDraft || {}),
      text: event.target.value
    };
  }
  if (event.target.id === 'ai-model-manual-input') {
    pendingAiModel = event.target.value;
  }
  if (event.target.id === 'ai-contact-name-input') {
    pendingAiContactName = event.target.value;
  }
  if (event.target.id === 'ai-contact-prompt-input') {
    pendingAiContactPrompt = event.target.value;
  }
  if (event.target.id === 'ai-contact-chat-input') {
    pendingAiChatInput = event.target.value;
    syncAiChatInputHeight();
  }
  if (event.target.id === 'data-preset-name-input') {
    pendingDataPresetName = event.target.value;
  }
  if (event.target.id === 'data-preset-items-input') {
    pendingDataPresetItemsJson = event.target.value;
  }
});

document.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    if (currentAppKey === 'records') {
      if (document.activeElement?.id === 'network-video-url-input') {
        loadNetworkVideoUrl(document.activeElement.value);
        return;
      }
      if (recordsView === 'videoEditor' && ['network-video-name-input', 'network-video-url-editor'].includes(document.activeElement?.id || '')) {
        confirmCurrentSelection();
        return;
      }
    }
    if (currentAppKey === 'music') {
      if (recordsView === 'musicEditor' && ['music-name-input', 'music-url-input', 'music-cover-url-input'].includes(document.activeElement?.id || '')) {
        confirmCurrentSelection();
        return;
      }
    }
    if (currentAppKey === 'settings' && ['aiConfigList', 'aiConfig', 'aiMainChat', 'aiMainChatRules', 'aiModelEditor', 'aiParamConfig'].includes(settingsView)) {
      confirmCurrentSelection();
      return;
    }
    if (currentAppKey === 'contact') {
      if (contactView === 'editor' && document.activeElement?.id === 'ai-contact-name-input') {
        confirmCurrentSelection();
        return;
      }
    }
    if (currentAppKey === 'sms') {
      if (contactView === 'chat' && document.activeElement?.id === 'ai-contact-chat-input') {
        confirmCurrentSelection();
        return;
      }
      if (contactView === 'chat' && selectedAiChatMessageIds.length) {
        deleteSelectedAiChatMessage();
        return;
      }
    }
    if (currentAppKey === 'data') {
      if (dataView === 'presetEditor' && ['data-preset-name-input', 'data-preset-items-input'].includes(document.activeElement?.id || '')) {
        confirmCurrentSelection();
        return;
      }
    }
  }
  if (event.key === 'Escape') {
    if (currentAppKey === 'data' && isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptMessageBlockEditor') {
      cancelAiPresetBlockDraft();
      return;
    }
    if (currentAppKey === 'data' && isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptContextBlockEditor') {
      cancelAiPresetBlockDraft();
      return;
    }
    if (currentAppKey === 'data' && isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptInfoSourcePicker') {
      cancelAiPresetBlockDraft();
      return;
    }
    if (currentAppKey === 'data' && isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptWorldBookPicker') {
      cancelAiPresetBlockDraft();
      return;
    }
    if (currentAppKey === 'data' && isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptAddType') {
      settingsView = '';
      renderAppWindow('data');
      return;
    }
    if (currentAppKey === 'data' && isAiPresetDataCategory(currentDataCategoryKey) && settingsView === 'aiPromptBlockPreview') {
      closeAiPresetBlockPreview();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'screensaverEditor') {
      closeScreenSaverEditor();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'screensaverList') {
      closeScreenSaverList();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptMessageBlockEditor') {
      settingsView = 'aiPromptAddType';
      renderAppWindow('settings');
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptContextBlockEditor') {
      cancelAiPresetBlockDraft();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptInfoSourcePicker') {
      settingsView = 'aiPromptAddType';
      renderAppWindow('settings');
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptWorldBookPicker') {
      settingsView = 'aiPromptAddType';
      renderAppWindow('settings');
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptBlockPreview') {
      closeAiPresetBlockPreview();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptAddType') {
      settingsView = 'aiPromptEditor';
      renderAppWindow('settings');
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptEditor') {
      closeAiPresetConfig();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptOverviewList') {
      settingsView = 'list';
      renderAppWindow('settings');
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiPromptList') {
      closeAiSystemPromptEditor();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiMainChatPreview') {
      closeAiMainChatPreview();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiMainChatRules') {
      closeAiMainChatRules();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiMainChat') {
      closeAiMainChatConfig();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiModelEditor') {
      closeAiModelEditor();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiModelList') {
      closeAiModelList();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiParamConfig') {
      closeAiParamConfig();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiConfigList') {
      closeAiConfig();
      return;
    }
    if (currentAppKey === 'settings' && settingsView === 'aiConfig') {
      closeAiConfig();
      return;
    }
    if (currentAppKey === 'contact') {
      if (contactView === 'editor') {
        closeAiContactEditor();
        return;
      }
    }
    if (currentAppKey === 'sms') {
      if (contactView === 'smsApiBinding') {
        closeSmsApiBindingList();
        return;
      }
      if (contactView === 'smsPreset' || contactView === 'smsSummaryPreset' || contactView === 'smsChatHistory') {
        closeSmsSettingsPlaceholder();
        return;
      }
      if (contactView === 'smsSettings') {
        closeSmsSettings();
        return;
      }
      if (contactView === 'chat') {
        openAiContactList();
        return;
      }
      if (contactView === 'list') {
        closeApp();
        return;
      }
    }
    if (currentAppKey === 'data') {
      if (dataView === 'presetEditor') {
        closeDataPresetEditor();
        return;
      }
      if (dataView === 'presetDetail') {
        closeDataPresetDetail();
        return;
      }
      if (dataView === 'presetList') {
        closeDataPresetList();
        return;
      }
      closeApp();
      return;
    }
    if (currentAppKey === 'music') {
      if (recordsView === 'musicEditor') {
        closeMusicEditor();
        return;
      }
      if (recordsView === 'musicPlayer') {
        openRecordsMusic();
        return;
      }
      if (recordsView === 'musicList') {
        closeApp();
        return;
      }
    }
    if (currentAppKey === 'records') {
      if (isNetworkFullscreen) {
        toggleNetworkFullscreen(false);
        return;
      }
      if (recordsView === 'videoEditor') {
        closeNetworkVideoEditor();
        return;
      }
      if (recordsView === 'videoPlayer') {
        openNetworkVideoList();
        return;
      }
      if (recordsView === 'videoList') {
        closeApp();
        return;
      }
    }
    if (currentAppKey === 'radio' && radioView === 'detail') {
      closeRadioNewsDetail();
      return;
    }
    closeApp();
  }
});



const screenSaverImageEl = document.getElementById('screen-saver-image');
if (screenSaverImageEl) {
  screenSaverImageEl.addEventListener('load', handleScreenSaverImageLoad);
  screenSaverImageEl.addEventListener('error', handleScreenSaverImageError);
}

currentTheme = getStoredTheme();
currentFontSizeKey = getStoredFontSize();
currentNetworkVideoUrl = getStoredNetworkVideoUrl();
networkVideoEntries = getStoredNetworkVideoEntries();
musicEntries = getStoredMusicEntries();
dataPresets = getStoredDataPresets();
dataActivePresetIds = getStoredDataActivePresetIds();
aiSettings = getStoredAiSettingsFromLocalStorage();
setPendingAiSettings(aiSettings);
aiContacts = getStoredAiContactsFromLocalStorage();
aiChatHistoryMap = getStoredAiChatHistoryMapFromLocalStorage();
pendingMusicName = '';
pendingMusicUrl = '';
pendingMusicCoverUrl = '';
pendingNetworkVideoName = '';
pendingNetworkVideoUrl = currentNetworkVideoUrl;
pendingFontSizeKey = currentFontSizeKey;
screenSaverEntries = getStoredScreenSaverEntries();
pendingScreenSaverName = '';
pendingScreenSaverImageUrl = '';
selectedMusicListIndex = musicEntries.length ? 0 : -1;
selectedNetworkVideoListIndex = networkVideoEntries.length ? 0 : -1;
selectedScreenSaverListIndex = screenSaverEntries.length ? 0 : -1;
selectedAiContactIndex = aiContacts.length ? 0 : -1;
applyTheme(currentTheme);
applyFontSize(currentFontSizeKey);

async function bootstrapAiPersistentData() {
  bindBleachPhoneChatsVariableEvents();
  bindBleachPhoneChatGenerationEvents();
  try {
    const hydratedState = await hydrateAiPersistentData();
    aiSettings = hydratedState.aiSettings;
    setPendingAiSettings(aiSettings);
    aiContacts = hydratedState.aiContacts;
    aiChatHistoryMap = hydratedState.aiChatHistoryMap;
    const loadedFromChatVariable = await loadBleachPhoneChatsVariableToRuntime({ render: false, persist: true, clearOnMissing: false });
    if (!loadedFromChatVariable) {
      syncBleachPhoneChatsVariable();
    }
    await loadBleachPhoneSummarizedChatsVariableToRuntime({ persistContacts: true });
    selectedAiContactIndex = aiContacts.length ? Math.min(Math.max(selectedAiContactIndex, 0), aiContacts.length - 1) : -1;
    currentAiContactIndex = currentAiContactIndex >= 0 && aiContacts.length
      ? Math.min(currentAiContactIndex, aiContacts.length - 1)
      : -1;
    if (contactView === 'chat' && currentAiContactIndex < 0) {
      contactView = 'list';
    }
    if (currentAppKey === 'settings' || currentAppKey === 'contact' || currentAppKey === 'sms') {
      renderAppWindow(currentAppKey);
    }
  } catch (error) {
    console.warn('[BLEACH-Phone] AI 数据载入失败，继续使用 localStorage 回退数据', error);
  }
}

function fitPhoneToViewport() {
  const phoneEl = document.getElementById('phone');
  if (!phoneEl) return;

  document.documentElement.style.setProperty('--embedded-phone-scale', '1');

  const bodyStyle = window.getComputedStyle(document.body);
  const paddingX = (parseFloat(bodyStyle.paddingLeft) || 0) + (parseFloat(bodyStyle.paddingRight) || 0);
  const paddingY = (parseFloat(bodyStyle.paddingTop) || 0) + (parseFloat(bodyStyle.paddingBottom) || 0);
  const margin = 4;
  const rect = phoneEl.getBoundingClientRect();
  const availableWidth = Math.max(1, window.innerWidth - paddingX - margin * 2);
  const availableHeight = Math.max(1, window.innerHeight - paddingY - margin * 2);
  const scale = Math.min(availableWidth / rect.width, availableHeight / rect.height);

  document.documentElement.style.setProperty('--embedded-phone-scale', String(scale));
  window.scrollTo(0, 0);
}

window.addEventListener('resize', fitPhoneToViewport);
updateMenuSelection();
setInterval(updateTime, 1000);
updateTime();
fitPhoneToViewport();
bootstrapAiPersistentData();

