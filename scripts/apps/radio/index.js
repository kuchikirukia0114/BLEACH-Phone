// Radio / 新闻应用逻辑（从 main.js 渐进拆出）

function getSelectedRadioNews() {
  return radioNewsEntries[selectedRadioNewsIndex] || radioNewsEntries[0] || null;
}

function openRadioNewsDetail(index = selectedRadioNewsIndex) {
  if (!radioNewsEntries.length) return;
  selectedRadioNewsIndex = Math.min(Math.max(index, 0), radioNewsEntries.length - 1);
  radioView = 'detail';
  radioDetailScrollTop = 0;
  renderAppWindow('radio');
}

function closeRadioNewsDetail() {
  if (radioView !== 'detail') return;
  radioView = 'list';
  radioDetailScrollTop = 0;
  renderAppWindow('radio');
}

function moveRadioSelection(direction) {
  if (!radioNewsEntries.length) return;

  if (radioView === 'list') {
    const radioList = document.getElementById('radio-news-list');
    if (radioList) {
      radioListScrollTop = radioList.scrollTop;
    }
    if (direction === 'up') {
      selectedRadioNewsIndex = Math.max(0, selectedRadioNewsIndex - 1);
      renderAppWindow('radio');
      return;
    }
    if (direction === 'down') {
      selectedRadioNewsIndex = Math.min(radioNewsEntries.length - 1, selectedRadioNewsIndex + 1);
      renderAppWindow('radio');
    }
    return;
  }

  const detailBody = document.getElementById('radio-news-detail-body');
  if (!detailBody) return;

  const lineStep = 22;
  const pageStep = Math.max(72, detailBody.clientHeight - 36);
  if (direction === 'up') detailBody.scrollTop -= lineStep;
  if (direction === 'down') detailBody.scrollTop += lineStep;
  if (direction === 'left') detailBody.scrollTop -= pageStep;
  if (direction === 'right') detailBody.scrollTop += pageStep;
  radioDetailScrollTop = detailBody.scrollTop;
}

function renderRadioContent() {
  if (radioView === 'detail') {
    const entry = getSelectedRadioNews();
    if (!entry) {
      return '<div class="radio-news-detail-body">暂无新闻。</div>';
    }

    return `
      <div class="radio-news-detail">
        <div class="radio-news-detail-body" id="radio-news-detail-body">
          <div class="radio-news-detail-title">${escapeHtml(entry.title)}</div>
          <div class="radio-news-detail-meta">${escapeHtml(entry.source)} · ${escapeHtml(entry.time)}</div>
          ${entry.body.map((paragraph) => `<p>${escapeHtml(paragraph)}</p>`).join('')}
        </div>
      </div>
    `;
  }

  return `
    <div class="radio-news-list" id="radio-news-list">
      ${radioNewsEntries.map((entry, index) => `
        <div class="radio-news-item ${selectedRadioNewsIndex === index ? 'is-selected' : ''}" data-radio-news-index="${index}">
          <div class="radio-news-title">${escapeHtml(entry.title)}</div>
        </div>
      `).join('')}
    </div>
  `;
}


