// Music / 音乐应用逻辑（从 main.js 渐进拆出）

function getMusicEntryLabel(entry) {
  if (!entry) return '未命名曲目';
  const label = (entry.name || entry.url || '').trim();
  return label || '未命名曲目';
}

function getMusicEntryCoverUrl(entry) {
  if (!entry) return '';
  return (entry.coverUrl || '').trim();
}

function getSelectedMusicEntry() {
  if (selectedMusicListIndex < 0 || selectedMusicListIndex >= musicEntries.length) {
    return null;
  }
  return musicEntries[selectedMusicListIndex];
}

function getMusicPlaybackModeLabel() {
  return musicPlaybackMode === 'random' ? '随机' : '顺序';
}

function getMusicPlaybackStatusLabel() {
  if (musicPlaybackStatus === 'playing') return '播放中';
  if (musicPlaybackStatus === 'paused') return '暂停';
  if (musicPlaybackStatus === 'loading') return '载入中';
  if (musicPlaybackStatus === 'error') return '载入失败';
  return '待机';
}

function focusMusicEditorInput() {
  requestAnimationFrame(() => {
    const nameInput = document.getElementById('music-name-input');
    const urlInput = document.getElementById('music-url-input');
    const coverInput = document.getElementById('music-cover-url-input');
    if (nameInput) {
      nameInput.value = pendingMusicName;
    }
    if (urlInput) {
      urlInput.value = pendingMusicUrl;
    }
    if (coverInput) {
      coverInput.value = pendingMusicCoverUrl;
    }
    if (nameInput && !pendingMusicName) {
      nameInput.focus();
      nameInput.setSelectionRange(nameInput.value.length, nameInput.value.length);
      return;
    }
    if (urlInput && !pendingMusicUrl) {
      urlInput.focus();
      urlInput.setSelectionRange(urlInput.value.length, urlInput.value.length);
      return;
    }
    if (coverInput) {
      coverInput.focus();
      coverInput.setSelectionRange(coverInput.value.length, coverInput.value.length);
    }
  });
}

function saveMusicEntry(name, url, coverUrl) {
  const normalizedName = (name || '').trim();
  const normalizedUrl = (url || '').trim();
  const normalizedCoverUrl = (coverUrl || '').trim();
  if (!normalizedUrl) return false;

  let nextEntries = musicEntries.slice();
  const previousEntry = editingMusicIndex >= 0 ? nextEntries[editingMusicIndex] : null;
  const nextEntry = {
    name: normalizedName,
    url: normalizedUrl,
    coverUrl: normalizedCoverUrl
  };

  if (editingMusicIndex >= 0 && nextEntries[editingMusicIndex]) {
    nextEntries[editingMusicIndex] = nextEntry;
  } else {
    nextEntries.push(nextEntry);
    if (nextEntries.length > 20) {
      nextEntries = nextEntries.slice(-20);
    }
  }

  musicEntries = normalizeMusicEntries(nextEntries);
  selectedMusicListIndex = editingMusicIndex >= 0
    ? Math.min(editingMusicIndex, musicEntries.length - 1)
    : Math.max(0, musicEntries.length - 1);
  saveMusicEntries();
  markCurrentDataAsDefaultPreset('music');

  if (previousEntry && currentMusicTrackUrl === previousEntry.url) {
    currentMusicTrackUrl = normalizedUrl;
    currentMusicTrackIndex = selectedMusicListIndex;
  }

  pendingMusicName = '';
  pendingMusicUrl = '';
  pendingMusicCoverUrl = '';
  editingMusicIndex = -1;
  return true;
}

function deleteMusicEntry(index) {
  if (index < 0 || index >= musicEntries.length) return;

  const [removedEntry] = musicEntries.splice(index, 1);
  saveMusicEntries();
  markCurrentDataAsDefaultPreset('music');

  if (removedEntry && currentMusicTrackUrl === removedEntry.url) {
    currentMusicTrackIndex = -1;
    currentMusicTrackUrl = '';
    musicPlaybackStatus = 'idle';
    musicShouldAutoplay = false;
  } else if (currentMusicTrackIndex > index) {
    currentMusicTrackIndex -= 1;
  }

  if (!musicEntries.length) {
    selectedMusicListIndex = -1;
  } else if (selectedMusicListIndex > index) {
    selectedMusicListIndex -= 1;
  } else if (selectedMusicListIndex >= musicEntries.length) {
    selectedMusicListIndex = musicEntries.length - 1;
  }

  if (currentAppKey === 'music') {
    if (recordsView === 'musicPlayer' && !currentMusicTrackUrl) {
      openRecordsMusic();
      return;
    }
    renderAppWindow('music');
  }
}

function getRandomMusicTrackIndex(excludeIndex = currentMusicTrackIndex) {
  if (!musicEntries.length) return -1;
  if (musicEntries.length === 1) return 0;

  let nextIndex = excludeIndex;
  while (nextIndex === excludeIndex) {
    nextIndex = Math.floor(Math.random() * musicEntries.length);
  }
  return nextIndex;
}

function getNextMusicTrackIndex(step = 1) {
  if (!musicEntries.length) return -1;
  if (musicPlaybackMode === 'random') {
    return getRandomMusicTrackIndex();
  }
  const baseIndex = currentMusicTrackIndex >= 0
    ? currentMusicTrackIndex
    : (selectedMusicListIndex >= 0 ? selectedMusicListIndex : 0);
  const total = musicEntries.length;
  return (baseIndex + step + total) % total;
}

function updateMusicPlayerSoftkeys() {
  if (currentAppKey === 'music' && recordsView === 'musicPlayer' && isAppWindowOpen()) {
    setAppSoftkeys(getMusicPlaybackModeLabel(), musicPlaybackStatus === 'playing' ? '暂停' : '播放', '返回');
  }
}

function getMusicModeButtonMarkup() {
  if (musicPlaybackMode === 'random') {
    return `
      <svg viewBox="-1 -1 26 26" aria-hidden="true">
        <path d="M4 7h3.5c1.1 0 2.1 0.5 2.8 1.3L16 17h4"></path>
        <path d="M17 14l3 3-3 3"></path>
        <path d="M4 17h3.5c1.1 0 2.1-0.5 2.8-1.3L16 7h4"></path>
        <path d="M17 4l3 3-3 3"></path>
      </svg>
    `;
  }
  return `
    <svg viewBox="2 2 20 20" aria-hidden="true">
      <g fill="none" stroke="currentColor">
        <path d="M7 8h8.7a2.3 2.3 0 0 1 2.3 2.3V12"></path>
        <path d="M17 16H8.3A2.3 2.3 0 0 1 6 13.7V12"></path>
      </g>
      <polygon points="7.4,6 7.4,10 4,8" fill="currentColor" stroke="none"></polygon>
      <polygon points="16.6,14 20,16 16.6,18" fill="currentColor" stroke="none"></polygon>
    </svg>
  `;
}

function getMusicPlayButtonMarkup() {
  if (musicPlaybackStatus === 'playing') {
    return `
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <rect x="7" y="5" width="3.5" height="14" fill="currentColor" stroke="none"></rect>
        <rect x="13.5" y="5" width="3.5" height="14" fill="currentColor" stroke="none"></rect>
      </svg>
    `;
  }
  return `
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M9 5v14l10-7z" fill="currentColor" stroke="none"></path>
    </svg>
  `;
}

function shouldMusicPlayerTitleMarquee(text) {
  return String(text || '').length > 11;
}

function getMusicPlayerTitleMarkup(text) {
  const title = String(text || '').trim() || '未命名曲目';
  const isMarquee = shouldMusicPlayerTitleMarquee(title);
  return {
    className: `music-player-title ${isMarquee ? 'is-marquee' : ''}`,
    style: `--music-title-gap:30px; --music-title-shift:${Math.max(title.length * 6.5 + 30, 0)}px;`,
    html: isMarquee
      ? `<span class="music-player-title-track"><span class="music-player-title-copy">${escapeHtml(title)}</span><span class="music-player-title-gap" aria-hidden="true"></span><span class="music-player-title-copy" aria-hidden="true">${escapeHtml(title)}</span></span>`
      : `<span class="music-player-title-copy">${escapeHtml(title)}</span>`
  };
}

function getMusicDefaultDiscMarkup(hasCover = false) {
  if (currentTheme === 'white') {
    return `
      <svg class="music-player-disc-art" viewBox="0 0 100 100" aria-hidden="true">
        <defs>
          <linearGradient id="music-disc-soft-glint" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stop-color="#ffffff" stop-opacity="0"></stop>
            <stop offset="35%" stop-color="#ffffff" stop-opacity="0.1"></stop>
            <stop offset="50%" stop-color="#ffffff" stop-opacity="0.6"></stop>
            <stop offset="65%" stop-color="#ffffff" stop-opacity="0.1"></stop>
            <stop offset="100%" stop-color="#ffffff" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        <circle cx="50" cy="50" r="45" fill="#FAF1EB" stroke="#966857" stroke-width="2.5"></circle>
        <circle cx="50" cy="50" r="37" fill="none" stroke="#D1B2A5" stroke-width="1.5" opacity="0.8"></circle>
        <circle cx="50" cy="50" r="28" fill="none" stroke="#D1B2A5" stroke-width="1.5" opacity="0.8"></circle>
        <circle cx="50" cy="50" r="44" fill="url(#music-disc-soft-glint)"></circle>
        <circle cx="50" cy="50" r="44" fill="url(#music-disc-soft-glint)" transform="rotate(90 50 50)" opacity="0.5"></circle>
        ${hasCover ? '' : `
          <circle cx="50" cy="50" r="18" fill="#EEDFD6" stroke="#A87B6A" stroke-width="1.55"></circle>
          <circle cx="50" cy="50" r="4" fill="#FFFDF8" stroke="#A87B6A" stroke-width="1.2"></circle>
        `}
      </svg>
    `;
  }

  return `
    <svg class="music-player-disc-art" viewBox="0 0 100 100" aria-hidden="true">
      <defs>
        <filter id="music-disc-red-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="1.25" result="blur"></feGaussianBlur>
          <feMerge>
            <feMergeNode in="blur"></feMergeNode>
            <feMergeNode in="SourceGraphic"></feMergeNode>
          </feMerge>
        </filter>
        <linearGradient id="music-disc-red-shine" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#ff0000" stop-opacity="0"></stop>
          <stop offset="30%" stop-color="#ff0000" stop-opacity="0.04"></stop>
          <stop offset="50%" stop-color="#ffffff" stop-opacity="0.18"></stop>
          <stop offset="70%" stop-color="#ff0000" stop-opacity="0.04"></stop>
          <stop offset="100%" stop-color="#ff0000" stop-opacity="0"></stop>
        </linearGradient>
      </defs>
      <circle cx="50" cy="50" r="45" fill="#0a0000" stroke="#ff0033" stroke-width="2" stroke-opacity="0.78" filter="url(#music-disc-red-glow)"></circle>
      <circle cx="50" cy="50" r="38" fill="none" stroke="#660000" stroke-width="0.5"></circle>
      <circle cx="50" cy="50" r="32" fill="none" stroke="#990000" stroke-width="0.5"></circle>
      <circle cx="50" cy="50" r="26" fill="none" stroke="#660000" stroke-width="0.5"></circle>
      <circle cx="50" cy="50" r="44" fill="url(#music-disc-red-shine)" opacity="0.76"></circle>
      <circle cx="50" cy="50" r="44" fill="url(#music-disc-red-shine)" transform="rotate(90 50 50)" opacity="0.22"></circle>
      ${hasCover ? '' : `
        <circle cx="50" cy="50" r="16" fill="#1a0000" stroke="#ff0000" stroke-width="1.5" filter="url(#music-disc-red-glow)"></circle>
        <circle cx="50" cy="50" r="3.5" fill="#000000" stroke="#440000" stroke-width="1"></circle>
      `}
    </svg>
  `;
}

function formatMusicTime(seconds) {
  const safeSeconds = Number.isFinite(seconds) && seconds > 0 ? Math.floor(seconds) : 0;
  const minutes = Math.floor(safeSeconds / 60);
  const remainder = safeSeconds % 60;
  return `${String(minutes).padStart(2, '0')}:${String(remainder).padStart(2, '0')}`;
}

function getMusicPlaybackMetrics() {
  const audioEl = document.getElementById('music-player-audio');
  const rawDuration = Number.isFinite(audioEl?.duration) ? audioEl.duration : 0;
  const rawCurrentTime = Number.isFinite(audioEl?.currentTime) ? audioEl.currentTime : 0;
  const duration = rawDuration > 0 ? rawDuration : 0;
  const currentTime = Math.min(Math.max(rawCurrentTime, 0), duration || rawCurrentTime || 0);
  const progress = duration > 0 ? (currentTime / duration) * 100 : 0;
  return {
    audioEl,
    currentTime,
    duration,
    progress
  };
}

function seekMusicPlaybackByRatio(ratio) {
  const { audioEl, duration } = getMusicPlaybackMetrics();
  if (!audioEl || !duration) return false;
  const nextRatio = Math.min(1, Math.max(0, ratio));
  audioEl.currentTime = duration * nextRatio;
  updateMusicPlayerUI();
  return true;
}

function getMusicPlaybackRatioFromClientX(clientX, progressButton = document.getElementById('music-player-progress-button')) {
  if (!progressButton || !Number.isFinite(clientX)) return null;
  const rect = progressButton.getBoundingClientRect();
  if (!rect.width) return null;
  return Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
}

function seekMusicPlaybackFromClientX(clientX, progressButton = document.getElementById('music-player-progress-button')) {
  const ratio = getMusicPlaybackRatioFromClientX(clientX, progressButton);
  if (ratio == null) return false;
  return seekMusicPlaybackByRatio(ratio);
}

function updateMusicPlayerUI() {
  const entry = musicEntries[currentMusicTrackIndex] || null;
  const titleEl = document.getElementById('music-player-title');
  const progressFillEl = document.getElementById('music-player-progress-fill');
  const currentTimeEl = document.getElementById('music-player-current-time');
  const durationEl = document.getElementById('music-player-duration');
  const modeButton = document.getElementById('music-control-mode');
  const playButton = document.getElementById('music-control-play');
  const coverEl = document.getElementById('music-player-cover');
  const coverImageEl = document.getElementById('music-player-cover-image');
  const discEl = document.getElementById('music-player-disc');
  const title = getMusicEntryLabel(entry);
  const coverUrl = getMusicEntryCoverUrl(entry);
  const titleMarkup = getMusicPlayerTitleMarkup(title);
  const { currentTime, duration, progress } = getMusicPlaybackMetrics();
  const previewCurrentTime = isMusicProgressDragging && pendingMusicProgressRatio != null && duration > 0
    ? duration * pendingMusicProgressRatio
    : currentTime;
  const previewProgress = isMusicProgressDragging && pendingMusicProgressRatio != null
    ? pendingMusicProgressRatio * 100
    : progress;

  if (titleEl) {
    const nextTitleState = `${titleMarkup.className}__${titleMarkup.style}__${title}`;
    if (titleEl.dataset.titleState !== nextTitleState) {
      titleEl.className = titleMarkup.className;
      titleEl.setAttribute('style', titleMarkup.style);
      titleEl.innerHTML = titleMarkup.html;
      titleEl.dataset.titleState = nextTitleState;
    }
  }
  if (progressFillEl) {
    progressFillEl.style.width = `${previewProgress}%`;
  }
  if (currentTimeEl) {
    currentTimeEl.textContent = formatMusicTime(previewCurrentTime);
  }
  if (durationEl) {
    durationEl.textContent = formatMusicTime(duration);
  }
  if (coverEl) {
    coverEl.classList.toggle('has-image', Boolean(coverUrl));
  }
  if (coverImageEl) {
    coverImageEl.style.backgroundImage = coverUrl ? `url("${coverUrl.replace(/(["\\])/g, '\\$1')}")` : 'none';
  }
  if (discEl) {
    discEl.classList.toggle('is-spinning', musicPlaybackStatus === 'playing');
  }
  if (modeButton) {
    modeButton.innerHTML = getMusicModeButtonMarkup();
    modeButton.classList.remove('is-active');
  }
  if (playButton) {
    playButton.innerHTML = getMusicPlayButtonMarkup();
  }
  updateMusicPlayerSoftkeys();
}

function bindMusicPlayer(audioEl) {
  if (!audioEl) {
    musicPlaybackStatus = 'idle';
    updateMusicPlayerUI();
    return;
  }

  audioEl.addEventListener('playing', () => {
    musicPlaybackStatus = 'playing';
    updateMusicPlayerUI();
  });
  audioEl.addEventListener('pause', () => {
    if (musicPlaybackStatus !== 'error') {
      musicPlaybackStatus = 'paused';
      updateMusicPlayerUI();
    }
  });
  audioEl.addEventListener('waiting', () => {
    musicPlaybackStatus = 'loading';
    updateMusicPlayerUI();
  });
  audioEl.addEventListener('loadedmetadata', updateMusicPlayerUI);
  audioEl.addEventListener('durationchange', updateMusicPlayerUI);
  audioEl.addEventListener('timeupdate', updateMusicPlayerUI);
  audioEl.addEventListener('seeked', updateMusicPlayerUI);
  audioEl.addEventListener('error', () => {
    musicPlaybackStatus = 'error';
    musicShouldAutoplay = false;
    updateMusicPlayerUI();
  });
  audioEl.addEventListener('ended', () => {
    stepMusicTrack(1);
  });

  if (!currentMusicTrackUrl) {
    musicPlaybackStatus = 'idle';
    updateMusicPlayerUI();
    return;
  }

  if (musicShouldAutoplay) {
    musicPlaybackStatus = 'loading';
    updateMusicPlayerUI();
    const playPromise = audioEl.play();
    musicShouldAutoplay = false;
    if (playPromise?.catch) {
      playPromise.catch(() => {
        musicPlaybackStatus = 'paused';
        updateMusicPlayerUI();
      });
    }
    return;
  }

  musicPlaybackStatus = audioEl.paused ? 'paused' : 'playing';
  updateMusicPlayerUI();
}

function toggleMusicPlayback() {
  const audioEl = document.getElementById('music-player-audio');
  if (!audioEl || !currentMusicTrackUrl) return false;

  if (audioEl.paused || audioEl.ended) {
    musicPlaybackStatus = 'loading';
    updateMusicPlayerUI();
    audioEl.play().catch(() => {
      musicPlaybackStatus = 'paused';
      updateMusicPlayerUI();
    });
  } else {
    audioEl.pause();
  }
  return true;
}

function toggleMusicPlaybackMode() {
  musicPlaybackMode = musicPlaybackMode === 'random' ? 'sequence' : 'random';
  updateMusicPlayerUI();
}

function stepMusicTrack(step = 1) {
  const nextIndex = getNextMusicTrackIndex(step);
  if (nextIndex < 0) return false;
  openMusicPlayer(nextIndex, true);
  return true;
}

function openRecordsMusic() {
  recordsView = 'musicList';
  isNetworkFullscreen = false;
  resetNetworkFullscreenPhoneState();
  pendingMusicName = '';
  pendingMusicUrl = '';
  pendingMusicCoverUrl = '';
  editingMusicIndex = -1;
  selectedMusicListIndex = musicEntries.length
    ? Math.min(Math.max(selectedMusicListIndex, 0), musicEntries.length - 1)
    : -1;
  renderAppWindow('music');
}

function openMusicEditor(index = -1) {
  recordsView = 'musicEditor';
  editingMusicIndex = index;
  if (editingMusicIndex >= 0 && musicEntries[editingMusicIndex]) {
    pendingMusicName = musicEntries[editingMusicIndex].name || '';
    pendingMusicUrl = musicEntries[editingMusicIndex].url || '';
    pendingMusicCoverUrl = musicEntries[editingMusicIndex].coverUrl || '';
  } else {
    pendingMusicName = '';
    pendingMusicUrl = '';
    pendingMusicCoverUrl = '';
    editingMusicIndex = -1;
  }
  renderAppWindow('music');
}

function closeMusicEditor() {
  recordsView = 'musicList';
  pendingMusicName = '';
  pendingMusicUrl = '';
  pendingMusicCoverUrl = '';
  editingMusicIndex = -1;
  selectedMusicListIndex = musicEntries.length
    ? Math.min(Math.max(selectedMusicListIndex, 0), musicEntries.length - 1)
    : -1;
  renderAppWindow('music');
}

function openMusicPlayer(index = selectedMusicListIndex, autoplay = true) {
  if (index < 0 || index >= musicEntries.length) return;
  currentMusicTrackIndex = index;
  currentMusicTrackUrl = musicEntries[index].url;
  selectedMusicListIndex = index;
  musicShouldAutoplay = autoplay;
  musicPlaybackStatus = currentMusicTrackUrl ? (autoplay ? 'loading' : 'paused') : 'idle';
  recordsView = 'musicPlayer';
  renderAppWindow('music');
}

function renderRecordsMusicContent() {
  return `
    <div class="screensaver-saved-list" id="music-saved-list">
      ${musicEntries.map((entry, index) => {
        const entryLabel = getMusicEntryLabel(entry);
        const isMarquee = selectedMusicListIndex === index && entryLabel.length > 10;
        return `
        <div class="screensaver-saved-item media-saved-item music-saved-item ${selectedMusicListIndex === index ? 'is-selected' : ''}" data-music-index="${index}">
          <div class="screensaver-saved-main">
            <span class="screensaver-saved-name ${isMarquee ? 'is-marquee' : ''}" style="--network-marquee-gap:28px; --network-marquee-shift:${Math.max(entryLabel.length * 6.5 + 28, 0)}px;">${isMarquee ? `<span class="screensaver-saved-name-track"><span class="screensaver-saved-name-copy">${escapeHtml(entryLabel)}</span><span class="screensaver-saved-name-gap" aria-hidden="true"></span><span class="screensaver-saved-name-copy" aria-hidden="true">${escapeHtml(entryLabel)}</span></span>` : escapeHtml(entryLabel)}</span>
            <span class="screensaver-saved-url">${escapeHtml(entry.url)}</span>
          </div>
          <button class="screensaver-delete-button" data-music-delete-index="${index}" type="button">×</button>
        </div>
      `;}).join('')}
    </div>
  `;
}

function renderMusicContent() {
  if (recordsView === 'musicEditor') {
    return renderMusicEditorContent();
  }
  if (recordsView === 'musicPlayer') {
    return renderMusicPlayerContent();
  }
  return renderRecordsMusicContent();
}

function moveMusicSelection(direction) {
  if (recordsView === 'musicList') {
    if (!musicEntries.length) return;
    const musicList = document.getElementById('music-saved-list');
    if (musicList) {
      musicListScrollTop = musicList.scrollTop;
    }
    if (direction === 'up') {
      selectedMusicListIndex = Math.max(0, selectedMusicListIndex - 1);
      renderAppWindow('music');
      return;
    }
    if (direction === 'down') {
      selectedMusicListIndex = Math.min(musicEntries.length - 1, selectedMusicListIndex + 1);
      renderAppWindow('music');
    }
    return;
  }

  if (recordsView === 'musicPlayer') {
    if (direction === 'left') {
      stepMusicTrack(-1);
      return;
    }
    if (direction === 'right') {
      stepMusicTrack(1);
      return;
    }
    if (direction === 'up' || direction === 'down') {
      toggleMusicPlaybackMode();
    }
  }
}

function renderMusicEditorContent() {
  return `
    <div class="settings-editor">
      <input class="settings-editor-field" id="music-name-input" type="text" maxlength="24" spellcheck="false" placeholder="音乐名字">
      <textarea class="settings-editor-input" id="music-url-input" spellcheck="false" placeholder="音频直链 URL"></textarea>
      <input class="settings-editor-field" id="music-cover-url-input" type="url" spellcheck="false" placeholder="封面 URL（可选）">
    </div>
  `;
}

function renderMusicPlayerContent() {
  const entry = musicEntries[currentMusicTrackIndex] || null;
  const coverUrl = getMusicEntryCoverUrl(entry);
  const titleMarkup = getMusicPlayerTitleMarkup(getMusicEntryLabel(entry));
  const discSpinDuration = currentTheme === 'white' ? '4.5s' : '4s';
  return `
    <div class="music-player" id="music-player">
      <audio class="music-player-audio" id="music-player-audio" preload="metadata" src="${escapeHtml(currentMusicTrackUrl)}"></audio>
      <div class="music-player-header">
        <div class="${titleMarkup.className}" id="music-player-title" style="${titleMarkup.style}">${titleMarkup.html}</div>
      </div>
      <div class="music-player-stage">
        <div class="music-player-hero">
          <div class="music-player-disc ${musicPlaybackStatus === 'playing' ? 'is-spinning' : ''}" id="music-player-disc" style="--music-disc-spin-duration:${discSpinDuration};">
            ${getMusicDefaultDiscMarkup(Boolean(coverUrl))}
            ${coverUrl ? '<div class="music-player-cover has-image" id="music-player-cover"><div class="music-player-cover-image" id="music-player-cover-image"></div></div>' : ''}
          </div>
        </div>
      </div>
      <div class="music-player-progress">
        <button class="music-player-progress-button" id="music-player-progress-button" type="button" aria-label="调整播放进度">
          <span class="music-player-progress-track"><span class="music-player-progress-fill" id="music-player-progress-fill"></span></span>
        </button>
        <div class="music-player-time">
          <span id="music-player-current-time">00:00</span>
          <span id="music-player-duration">00:00</span>
        </div>
      </div>
      <div class="music-player-controls">
        <button class="music-control-button" id="music-control-mode" data-music-control="mode" type="button" aria-label="播放模式">${getMusicModeButtonMarkup()}</button>
        <button class="music-control-button" id="music-control-prev" data-music-control="prev" type="button" aria-label="上一首">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 6v12"></path><path d="M18 6 10 12l8 6z" fill="currentColor" stroke="none"></path></svg>
        </button>
        <button class="music-control-button primary" id="music-control-play" data-music-control="play" type="button" aria-label="播放或暂停">${getMusicPlayButtonMarkup()}</button>
        <button class="music-control-button" id="music-control-next" data-music-control="next" type="button" aria-label="下一首">
          <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M16 6v12"></path><path d="M6 6 14 12l-8 6z" fill="currentColor" stroke="none"></path></svg>
        </button>
      </div>
    </div>
  `;
}


