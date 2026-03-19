// Network / 视频应用逻辑（从 main.js 渐进拆出）

function getNetworkVideoEntryLabel(entry) {
  if (!entry) return '未命名视频';
  const label = (entry.name || entry.url || '').trim();
  return label || '未命名视频';
}

function getSelectedNetworkVideoEntry() {
  if (selectedNetworkVideoListIndex < 0 || selectedNetworkVideoListIndex >= networkVideoEntries.length) {
    return null;
  }
  return networkVideoEntries[selectedNetworkVideoListIndex];
}

function focusNetworkVideoEditorInput() {
  requestAnimationFrame(() => {
    const nameInput = document.getElementById('network-video-name-input');
    const urlInput = document.getElementById('network-video-url-editor');
    if (nameInput) {
      nameInput.value = pendingNetworkVideoName;
    }
    if (!urlInput) return;
    urlInput.value = pendingNetworkVideoUrl;
    if (nameInput && !pendingNetworkVideoName) {
      nameInput.focus();
      nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);
      return;
    }
    urlInput.focus();
    urlInput.setSelectionRange(urlInput.value.length, urlInput.value.length);
  });
}

function saveNetworkVideoEntry(name, url) {
  const normalizedName = (name || '').trim();
  const normalizedUrl = (url || '').trim();
  if (!normalizedUrl) return false;

  let nextEntries = networkVideoEntries.slice();
  const previousEntry = editingNetworkVideoIndex >= 0 ? nextEntries[editingNetworkVideoIndex] : null;
  const nextEntry = {
    name: normalizedName,
    url: normalizedUrl
  };

  if (editingNetworkVideoIndex >= 0 && nextEntries[editingNetworkVideoIndex]) {
    nextEntries[editingNetworkVideoIndex] = nextEntry;
  } else {
    nextEntries.push(nextEntry);
    if (nextEntries.length > 10) {
      nextEntries = nextEntries.slice(-10);
    }
  }

  networkVideoEntries = normalizeNetworkVideoEntries(nextEntries);
  selectedNetworkVideoListIndex = editingNetworkVideoIndex >= 0
    ? Math.min(editingNetworkVideoIndex, networkVideoEntries.length - 1)
    : Math.max(0, networkVideoEntries.length - 1);
  saveNetworkVideoEntries();
  markCurrentDataAsDefaultPreset('records');

  if (previousEntry && currentNetworkVideoUrl === previousEntry.url) {
    currentNetworkVideoUrl = normalizedUrl;
    pendingNetworkVideoUrl = normalizedUrl;
    saveNetworkVideoUrl(normalizedUrl);
  }

  pendingNetworkVideoName = '';
  pendingNetworkVideoUrl = currentNetworkVideoUrl;
  editingNetworkVideoIndex = -1;
  return true;
}

function deleteNetworkVideoEntry(index) {
  if (index < 0 || index >= networkVideoEntries.length) return;

  const [removedEntry] = networkVideoEntries.splice(index, 1);
  saveNetworkVideoEntries();
  markCurrentDataAsDefaultPreset('records');

  if (removedEntry && currentNetworkVideoUrl === removedEntry.url) {
    currentNetworkVideoUrl = '';
    pendingNetworkVideoUrl = '';
    pendingNetworkVideoName = '';
    isNetworkVideoPlaybackReady = false;
    isNetworkFullscreen = false;
    resetNetworkFullscreenPhoneState();
    saveNetworkVideoUrl('');
  }

  if (!networkVideoEntries.length) {
    selectedNetworkVideoListIndex = -1;
  } else if (selectedNetworkVideoListIndex > index) {
    selectedNetworkVideoListIndex -= 1;
  } else if (selectedNetworkVideoListIndex >= networkVideoEntries.length) {
    selectedNetworkVideoListIndex = networkVideoEntries.length - 1;
  }

  if (currentAppKey === 'records') {
    renderAppWindow('records');
  }
}

function openNetworkVideoList() {
  recordsView = 'videoList';
  isNetworkFullscreen = false;
  resetNetworkFullscreenPhoneState();
  pendingNetworkVideoName = '';
  pendingNetworkVideoUrl = currentNetworkVideoUrl;
  editingNetworkVideoIndex = -1;
  selectedNetworkVideoListIndex = networkVideoEntries.length
    ? Math.min(Math.max(selectedNetworkVideoListIndex, 0), networkVideoEntries.length - 1)
    : -1;
  renderAppWindow('records');
}

function closeNetworkVideoList() {
  closeApp();
}

function openNetworkVideoEditor(index = -1) {
  recordsView = 'videoEditor';
  isNetworkFullscreen = false;
  resetNetworkFullscreenPhoneState();
  editingNetworkVideoIndex = index;

  if (editingNetworkVideoIndex >= 0 && networkVideoEntries[editingNetworkVideoIndex]) {
    pendingNetworkVideoName = networkVideoEntries[editingNetworkVideoIndex].name || '';
    pendingNetworkVideoUrl = networkVideoEntries[editingNetworkVideoIndex].url || '';
  } else {
    pendingNetworkVideoName = '';
    pendingNetworkVideoUrl = '';
    editingNetworkVideoIndex = -1;
  }

  renderAppWindow('records');
}

function closeNetworkVideoEditor() {
  recordsView = 'videoList';
  pendingNetworkVideoName = '';
  pendingNetworkVideoUrl = currentNetworkVideoUrl;
  editingNetworkVideoIndex = -1;
  selectedNetworkVideoListIndex = networkVideoEntries.length
    ? Math.min(Math.max(selectedNetworkVideoListIndex, 0), networkVideoEntries.length - 1)
    : -1;
  renderAppWindow('records');
}

function openNetworkVideoPlayer(entry = getSelectedNetworkVideoEntry()) {
  recordsView = 'videoPlayer';
  isNetworkFullscreen = false;
  const resolvedEntry = Number.isInteger(entry)
    ? (networkVideoEntries[entry] || null)
    : entry;
  const targetUrl = typeof resolvedEntry === 'string' ? resolvedEntry.trim() : String(resolvedEntry?.url || '').trim();
  pendingNetworkVideoName = typeof resolvedEntry === 'string' ? '' : (resolvedEntry?.name || '');
  editingNetworkVideoIndex = -1;
  if (Number.isInteger(entry)) {
    selectedNetworkVideoListIndex = entry;
  }

  if (targetUrl) {
    loadNetworkVideoUrl(targetUrl);
    return;
  }

  pendingNetworkVideoUrl = currentNetworkVideoUrl;
  renderAppWindow('records');
}

function isDirectPlayableVideoUrl(url) {
  return /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url);
}

function clearNetworkFullscreenTimers() {
  networkFullscreenTimers.forEach((timerId) => clearTimeout(timerId));
  networkFullscreenTimers = [];
}

function resetNetworkFullscreenPhoneState() {
  clearNetworkFullscreenTimers();
  isNetworkProgressDragging = false;
  pendingNetworkProgressRatio = null;
  const phone = document.getElementById('phone');
  if (!phone) {
    updateNetworkLandscapeProgressUI();
    return;
  }
  phone.classList.remove('network-cinema', 'network-cinema-yflip', 'network-cinema-back-open', 'network-cinema-closed', 'network-cinema-landscape');
  updateNetworkLandscapeProgressUI();
}

function startNetworkFullscreenPhoneSequence() {
  const phone = document.getElementById('phone');
  if (!phone || isClosed) return;

  resetNetworkFullscreenPhoneState();
  phone.classList.add('network-cinema');

  requestAnimationFrame(() => {
    phone.classList.add('network-cinema-yflip');
  });

  networkFullscreenTimers.push(setTimeout(() => {
    phone.classList.add('network-cinema-closed');
  }, 780));

  networkFullscreenTimers.push(setTimeout(() => {
    phone.classList.add('network-cinema-landscape');
  }, 1620));
}

function startNetworkRestorePhoneSequence() {
  const phone = document.getElementById('phone');
  if (!phone) {
    isNetworkFullscreen = false;
    syncNetworkVideoPlayerView({ focusInput: true });
    return;
  }

  clearNetworkFullscreenTimers();
  phone.classList.add('network-cinema');
  phone.classList.remove('network-cinema-landscape');

  networkFullscreenTimers.push(setTimeout(() => {
    phone.classList.add('network-cinema-back-open');
    phone.classList.remove('network-cinema-closed');
  }, 860));

  networkFullscreenTimers.push(setTimeout(() => {
    phone.classList.remove('network-cinema-back-open');
  }, 1760));

  networkFullscreenTimers.push(setTimeout(() => {
    phone.classList.remove('network-cinema-yflip');
  }, 1840));

  networkFullscreenTimers.push(setTimeout(() => {
    isNetworkFullscreen = false;
    syncNetworkVideoPlayerView({ focusInput: true });
  }, 2680));
}

function loadNetworkVideoUrl(url = pendingNetworkVideoUrl) {
  const normalizedUrl = String(url || '').trim();
  pendingNetworkVideoUrl = normalizedUrl;
  currentNetworkVideoUrl = normalizedUrl;
  isNetworkVideoPlaybackReady = false;
  isNetworkProgressDragging = false;
  pendingNetworkProgressRatio = null;
  if (!normalizedUrl) {
    isNetworkFullscreen = false;
  }
  saveNetworkVideoUrl(normalizedUrl);
  if (currentAppKey === 'records') {
    renderAppWindow('records');
  }
}

function getNetworkPlaybackMetrics() {
  const videoEl = document.getElementById('network-player-video');
  const rawDuration = Number.isFinite(videoEl?.duration) ? videoEl.duration : 0;
  const rawCurrentTime = Number.isFinite(videoEl?.currentTime) ? videoEl.currentTime : 0;
  const duration = rawDuration > 0 ? rawDuration : 0;
  const currentTime = Math.min(Math.max(rawCurrentTime, 0), duration || rawCurrentTime || 0);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  return {
    videoEl,
    currentTime,
    duration,
    progress,
  };
}

function formatNetworkTime(seconds) {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function seekNetworkPlaybackByRatio(ratio) {
  const { videoEl, duration } = getNetworkPlaybackMetrics();
  if (!videoEl || !duration) return false;
  const nextRatio = Math.min(1, Math.max(0, ratio));
  videoEl.currentTime = duration * nextRatio;
  updateNetworkLandscapeProgressUI();
  return true;
}

function getNetworkPlaybackRatioFromClientX(clientX, progressButton) {
  const resolvedProgressButton = progressButton || document.getElementById(
    isNetworkFullscreen ? 'network-landscape-progress-button' : 'network-portrait-progress-button'
  );
  if (!resolvedProgressButton || !Number.isFinite(clientX)) return null;
  const trackEl = resolvedProgressButton.querySelector('.network-landscape-progress-track, .network-portrait-progress-track');
  const rect = (trackEl || resolvedProgressButton).getBoundingClientRect();
  if (!rect.width) return null;
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
}

function seekNetworkPlaybackFromClientX(clientX, progressButton) {
  const ratio = getNetworkPlaybackRatioFromClientX(clientX, progressButton);
  if (ratio == null) return false;
  return seekNetworkPlaybackByRatio(ratio);
}

function getNetworkVideoToggleButtonMarkup(isPaused) {
  return isPaused
    ? '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6.8l8.8 5.2L8 17.2z"></path></svg>'
    : '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="6.5" width="3.5" height="11" rx="0.8"></rect><rect x="13.5" y="6.5" width="3.5" height="11" rx="0.8"></rect></svg>';
}

function updateNetworkLandscapeProgressUI() {
  const landscapeWrapEl = document.getElementById('network-landscape-progress');
  const landscapeFillEl = document.getElementById('network-landscape-progress-fill');
  const landscapeThumbEl = document.getElementById('network-landscape-progress-thumb');
  const landscapeCurrentTimeEl = document.getElementById('network-landscape-current-time');
  const landscapeDurationEl = document.getElementById('network-landscape-duration');
  const landscapeToggleButtonEl = document.getElementById('network-landscape-toggle-button');
  const portraitWrapEl = document.getElementById('network-portrait-progress');
  const portraitFillEl = document.getElementById('network-portrait-progress-fill');
  const portraitThumbEl = document.getElementById('network-portrait-progress-thumb');
  const portraitCurrentTimeEl = document.getElementById('network-portrait-current-time');
  const portraitDurationEl = document.getElementById('network-portrait-duration');
  const portraitToggleButtonEl = document.getElementById('network-portrait-toggle-button');
  const isDirectVideoVisible = currentAppKey === 'records'
    && recordsView === 'videoPlayer'
    && isDirectPlayableVideoUrl(currentNetworkVideoUrl);
  const isLandscapeVisible = isDirectVideoVisible && isNetworkFullscreen;
  const isPortraitVisible = isDirectVideoVisible && !isNetworkFullscreen;
  const { videoEl, currentTime, duration, progress } = getNetworkPlaybackMetrics();
  const previewCurrentTime = isNetworkProgressDragging && pendingNetworkProgressRatio != null && duration > 0
    ? duration * pendingNetworkProgressRatio
    : currentTime;
  const previewProgress = isNetworkProgressDragging && pendingNetworkProgressRatio != null
    ? pendingNetworkProgressRatio * 100
    : progress;
  const isPaused = !videoEl || videoEl.paused || videoEl.ended;

  landscapeWrapEl?.classList.toggle('is-visible', isLandscapeVisible);
  portraitWrapEl?.classList.toggle('is-visible', isPortraitVisible);
  if (landscapeFillEl) {
    landscapeFillEl.style.height = `${previewProgress}%`;
  }
  if (landscapeThumbEl) {
    landscapeThumbEl.style.top = `${previewProgress}%`;
  }
  if (portraitFillEl) {
    portraitFillEl.style.width = `${previewProgress}%`;
  }
  if (portraitThumbEl) {
    portraitThumbEl.style.left = `${previewProgress}%`;
  }
  if (landscapeCurrentTimeEl) {
    landscapeCurrentTimeEl.textContent = formatNetworkTime(previewCurrentTime);
  }
  if (portraitCurrentTimeEl) {
    portraitCurrentTimeEl.textContent = formatNetworkTime(previewCurrentTime);
  }
  if (landscapeDurationEl) {
    landscapeDurationEl.textContent = formatNetworkTime(duration);
  }
  if (portraitDurationEl) {
    portraitDurationEl.textContent = formatNetworkTime(duration);
  }
  if (landscapeToggleButtonEl) {
    landscapeToggleButtonEl.innerHTML = getNetworkVideoToggleButtonMarkup(isPaused);
  }
  if (portraitToggleButtonEl) {
    portraitToggleButtonEl.innerHTML = getNetworkVideoToggleButtonMarkup(isPaused);
  }
}

function bindNetworkVideoPlayback(videoEl) {
  isNetworkVideoPlaybackReady = false;
  isNetworkProgressDragging = false;
  pendingNetworkProgressRatio = null;
  if (!videoEl) {
    updateNetworkLandscapeProgressUI();
    return;
  }

  const markReady = () => {
    isNetworkVideoPlaybackReady = true;
    updateNetworkLandscapeProgressUI();
  };
  const markNotReady = () => {
    isNetworkVideoPlaybackReady = false;
    isNetworkProgressDragging = false;
    pendingNetworkProgressRatio = null;
    updateNetworkLandscapeProgressUI();
  };

  if (videoEl.readyState >= 2 && !videoEl.error) {
    markReady();
  }

  videoEl.addEventListener('loadeddata', markReady);
  videoEl.addEventListener('canplay', markReady);
  videoEl.addEventListener('playing', markReady);
  videoEl.addEventListener('pause', updateNetworkLandscapeProgressUI);
  videoEl.addEventListener('loadedmetadata', updateNetworkLandscapeProgressUI);
  videoEl.addEventListener('durationchange', updateNetworkLandscapeProgressUI);
  videoEl.addEventListener('timeupdate', updateNetworkLandscapeProgressUI);
  videoEl.addEventListener('seeked', updateNetworkLandscapeProgressUI);
  videoEl.addEventListener('ended', updateNetworkLandscapeProgressUI);
  videoEl.addEventListener('error', markNotReady);
  videoEl.addEventListener('emptied', markNotReady);
  updateNetworkLandscapeProgressUI();
}

function toggleNetworkVideoPlayback() {
  const videoEl = document.getElementById('network-player-video');
  if (!videoEl || !isNetworkVideoPlaybackReady || !isDirectPlayableVideoUrl(currentNetworkVideoUrl)) {
    return false;
  }

  if (videoEl.paused || videoEl.ended) {
    videoEl.play().catch(() => {});
  } else {
    videoEl.pause();
  }
  return true;
}

function syncNetworkVideoPlayerView({ focusInput = false, rebindPlayback = false } = {}) {
  if (currentAppKey !== 'records' || recordsView !== 'videoPlayer' || !isAppWindowOpen()) return;
  setAppSoftkeys(isNetworkFullscreen ? '退出' : '横屏', '载入', '返回');
  if (rebindPlayback) {
    bindNetworkVideoPlayback(document.getElementById('network-player-video'));
  }
  updateNetworkFullscreenLayout();
  if (!isNetworkFullscreen && focusInput) {
    focusNetworkVideoInput();
  }
}

function updateNetworkFullscreenLayout() {
  const appWindow = document.getElementById('app-window');
  const networkPlayer = document.getElementById('network-player');
  const networkStage = document.getElementById('network-player-stage');
  const phone = document.getElementById('phone');
  const isActive = currentAppKey === 'records' && recordsView === 'videoPlayer' && isAppWindowOpen() && isNetworkFullscreen && Boolean(currentNetworkVideoUrl);

  if (appWindow) {
    appWindow.classList.toggle('network-landscape', isActive);
  }
  if (networkPlayer) {
    networkPlayer.classList.toggle('is-landscape', isActive);
  }
  if (networkStage) {
    networkStage.classList.toggle('is-landscape', isActive);
    const rect = networkStage.getBoundingClientRect();
    const scale = rect.width && rect.height ? rect.height / rect.width : 1;
    networkStage.style.setProperty('--network-landscape-scale', `${scale}`);
  }

  if (isActive) {
    if (phone && !phone.classList.contains('network-cinema')) {
      startNetworkFullscreenPhoneSequence();
    }
  } else {
    resetNetworkFullscreenPhoneState();
  }

  const videoEl = document.getElementById('network-player-video');
  if (isActive && videoEl) {
    videoEl.play().catch(() => {});
  }
  updateNetworkLandscapeProgressUI();
}

function toggleNetworkFullscreen(force) {
  if (currentAppKey !== 'records' || recordsView !== 'videoPlayer' || !isAppWindowOpen()) return;
  if (!currentNetworkVideoUrl) return;

  const nextState = typeof force === 'boolean' ? force : !isNetworkFullscreen;

  if (nextState) {
    isNetworkFullscreen = true;
    syncNetworkVideoPlayerView();
    return;
  }

  if (!isNetworkFullscreen && !document.getElementById('phone')?.classList.contains('network-cinema')) return;
  startNetworkRestorePhoneSequence();
}

function focusNetworkVideoInput() {
  requestAnimationFrame(() => {
    const input = document.getElementById('network-video-url-input');
    if (!input) return;
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);
  });
}

function renderNetworkContent() {
  const hasUrl = Boolean(currentNetworkVideoUrl);
  const isDirectVideo = hasUrl && isDirectPlayableVideoUrl(currentNetworkVideoUrl);
  const mediaHtml = !hasUrl
    ? '<div class="network-player-placeholder">输入网页视频 URL 后按“载入”即可显示。</div>'
    : isDirectVideo
      ? `<video class="network-player-video" id="network-player-video" playsinline webkit-playsinline disablePictureInPicture disableRemotePlayback controlsList="nofullscreen noremoteplayback nodownload" src="${escapeHtml(currentNetworkVideoUrl)}"></video>`
      : `<div class="network-frame-shell"><iframe class="network-player-frame" src="${escapeHtml(currentNetworkVideoUrl)}" allow="autoplay; fullscreen; picture-in-picture" referrerpolicy="no-referrer-when-downgrade"></iframe></div>`;
  const portraitProgressHtml = isDirectVideo
    ? `
        <div class="network-portrait-progress ${!isNetworkFullscreen ? 'is-visible' : ''}" id="network-portrait-progress">
          <button class="network-portrait-toggle-button" id="network-portrait-toggle-button" type="button" aria-label="播放或暂停"></button>
          <div class="network-portrait-progress-row">
            <span class="network-portrait-time" id="network-portrait-current-time">00:00</span>
            <button class="network-portrait-progress-button" id="network-portrait-progress-button" type="button" aria-label="调整视频进度">
              <span class="network-portrait-progress-track">
                <span class="network-portrait-progress-fill" id="network-portrait-progress-fill"></span>
                <span class="network-portrait-progress-thumb" id="network-portrait-progress-thumb"></span>
              </span>
            </button>
            <span class="network-portrait-time" id="network-portrait-duration">00:00</span>
          </div>
        </div>
      `
    : '';
  const landscapeProgressHtml = isDirectVideo
    ? `
        <div class="network-landscape-progress ${isNetworkFullscreen ? 'is-visible' : ''}" id="network-landscape-progress">
          <button class="network-landscape-toggle-button" id="network-landscape-toggle-button" type="button" aria-label="播放或暂停"></button>
          <span class="network-landscape-time top" id="network-landscape-current-time">00:00</span>
          <button class="network-landscape-progress-button" id="network-landscape-progress-button" type="button" aria-label="调整视频进度">
            <span class="network-landscape-progress-track">
              <span class="network-landscape-progress-fill" id="network-landscape-progress-fill"></span>
              <span class="network-landscape-progress-thumb" id="network-landscape-progress-thumb"></span>
            </span>
          </button>
          <span class="network-landscape-time bottom" id="network-landscape-duration">00:00</span>
        </div>
      `
    : '';

  return `
    <div class="network-player ${hasUrl && isNetworkFullscreen ? 'is-landscape' : ''}" id="network-player">
      <div class="network-player-toolbar">
        <input class="network-url-input" id="network-video-url-input" type="url" spellcheck="false" placeholder="输入网页视频或直链 URL" value="${escapeHtml(pendingNetworkVideoUrl)}">
        <button class="network-load-button" id="network-load-button" type="button">载入</button>
      </div>
      <div class="network-player-stage ${hasUrl && !isDirectVideo ? 'is-webpage' : ''} ${hasUrl && isNetworkFullscreen ? 'is-landscape' : ''}" id="network-player-stage">
        ${mediaHtml}
        ${portraitProgressHtml}
        ${landscapeProgressHtml}
      </div>
    </div>
  `;
}

function renderNetworkVideoListContent() {
  return `
    <div class="screensaver-saved-list" id="network-video-saved-list">
      ${networkVideoEntries.map((entry, index) => {
        const entryLabel = getNetworkVideoEntryLabel(entry);
        const isMarquee = selectedNetworkVideoListIndex === index && entryLabel.length > 10;
        return `
        <div class="screensaver-saved-item media-saved-item network-video-saved-item ${selectedNetworkVideoListIndex === index ? 'is-selected' : ''}" data-network-video-index="${index}">
          <div class="screensaver-saved-main">
            <span class="screensaver-saved-name ${isMarquee ? 'is-marquee' : ''}" style="--network-marquee-gap:28px; --network-marquee-shift:${Math.max(entryLabel.length * 6.5 + 28, 0)}px;">${isMarquee ? `<span class="screensaver-saved-name-track"><span class="screensaver-saved-name-copy">${escapeHtml(entryLabel)}</span><span class="screensaver-saved-name-gap" aria-hidden="true"></span><span class="screensaver-saved-name-copy" aria-hidden="true">${escapeHtml(entryLabel)}</span></span>` : escapeHtml(entryLabel)}</span>
            <span class="screensaver-saved-url">${escapeHtml(entry.url)}</span>
          </div>
          <button class="screensaver-delete-button" data-network-video-delete-index="${index}" type="button">×</button>
        </div>
      `;}).join('')}
    </div>
  `;
}

function renderNetworkVideoEditorContent() {
  return `
    <div class="settings-editor">
      <input class="settings-editor-field" id="network-video-name-input" type="text" maxlength="24" spellcheck="false" placeholder="视频名字">
      <textarea class="settings-editor-input" id="network-video-url-editor" spellcheck="false" placeholder="视频或网页 URL"></textarea>
    </div>
  `;
}


