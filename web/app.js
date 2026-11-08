(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  // 与 v0.4 / v0.5 共用收藏键：升级后不丢失收藏。
  const STORAGE_KEY = 'curio-v04-saved';
  const state = {
    articles: [], history: [], cursor: -1, used: new Set(),
    mode: 'browse', saved: readSaved(), banner: '', readerOpen: false,
  };
  let currentImageToken = 0;
  let touchY = 0, touchX = 0, wheelAt = 0;
  let readerReturnFocus = null;
  let readerHistoryEntry = false;

  function readSaved() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(raw) ? new Set(raw.filter(x => typeof x === 'string')) : new Set();
    } catch { return new Set(); }
  }
  function persistSaved() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.saved])); }
    catch { /* 私密浏览模式可能限制本地存储，阅读仍可继续 */ }
  }
  function rand(list) { return list[Math.floor(Math.random() * list.length)]; }
  function idOf(a) { return a.id || a.url; }
  function current() { return state.history[state.cursor] || null; }
  function displayTitle(a) { return a.editor_title || a.translated_title || a.title; }
  function status(message) { $('statusLine').textContent = message || ''; }
  function inPool() {
    return state.mode === 'saved' ? state.articles.filter(a => state.saved.has(idOf(a))) : state.articles;
  }
  function isSafeArticleUrl(url) { return /^https?:\/\/[^\s]+$/i.test(url || ''); }
  function canShowLicensedText(a) {
    return a && a.reuse_allowed === true && typeof a.licensed_body === 'string' &&
      a.licensed_body.trim().length > 0 && typeof a.license === 'string' && a.license.trim().length > 0;
  }
  function pickNext() {
    const pool = inPool();
    if (!pool.length) return null;
    let candidates = pool.filter(a => !state.used.has(idOf(a)));
    if (!candidates.length) {
      // 翻完就重新洗牌，不制造「未读任务」。
      const recent = new Set(state.history.slice(-Math.min(8, pool.length - 1)).map(idOf));
      candidates = pool.filter(a => !recent.has(idOf(a)));
      state.used.clear();
      if (!candidates.length) candidates = pool;
    }
    const last = state.history.slice(-8);
    const newsSeen = last.filter(a => a.lane === 'news').length;
    const wantNews = newsSeen < 2 && Math.random() < .18;
    const wanted = wantNews ? 'news' : 'discovery';
    const target = candidates.filter(a => (a.lane || 'discovery') === wanted);
    if (target.length) candidates = target;
    const recentPublishers = new Set(last.slice(-2).map(a => a.publisher || a.source));
    const distinct = candidates.filter(a => !recentPublishers.has(a.publisher || a.source));
    if (distinct.length) candidates = distinct;
    const recentTopics = new Set(last.slice(-2).map(a => a.topic));
    const varied = candidates.filter(a => !recentTopics.has(a.topic));
    if (varied.length) candidates = varied;
    const publishers = [...new Set(candidates.map(a => a.publisher || a.source))];
    const chosen = rand(publishers);
    return rand(candidates.filter(a => (a.publisher || a.source) === chosen));
  }
  function setCover(url, article = null) {
    const visual = $('visual');
    const topic = (article && article.topic) || '不同的世界';
    const hash = [...topic].reduce((v, ch) => (v * 31 + ch.codePointAt(0)) % 997, 0);
    visual.dataset.tone = String(hash % 5);
    $('fallbackTopic').textContent = topic;
    document.querySelector('.fallback-mark').textContent = [...topic][0] || '拾';
    visual.classList.toggle('visual-empty', !isSafeArticleUrl(url));
    const img = $('cover');
    const currentToken = ++currentImageToken;
    img.hidden = true;
    img.removeAttribute('src');
    $('illustration').hidden = false;
    if (!isSafeArticleUrl(url)) return;
    img.onload = () => {
      if (currentToken !== currentImageToken) return;
      img.hidden = false;
      visual.classList.remove('visual-empty');
      $('illustration').hidden = true;
      $('fallbackVisual').hidden = true;
    };
    img.onerror = () => {
      if (currentToken !== currentImageToken) return;
      img.hidden = true;
      visual.classList.add('visual-empty');
      $('fallbackVisual').hidden = false;
      $('illustration').hidden = false;
    };
    $('fallbackVisual').hidden = false;
    img.src = url;
  }
  function showPlaceholder(title, description) {
    $('topic').textContent = '拾趣';
    $('date').textContent = '';
    $('title').textContent = title;
    $('summary').textContent = description;
    $('source').textContent = '';
    $('originalToggle').hidden = true;
    $('originalTitle').hidden = true;
    $('translationNote').hidden = true;
    $('readButton').disabled = true;
    $('saveButton').disabled = true;
    $('backButton').disabled = state.cursor < 1;
    setCover('');
  }
  function setSavedButton(button, saved) {
    button.setAttribute('aria-pressed', String(saved));
    button.classList.toggle('saved', saved);
    if (button.id === 'saveButton') {
      button.textContent = saved ? '★' : '☆';
      button.setAttribute('aria-label', saved ? '取消收藏' : '收藏这篇文章');
    } else {
      button.textContent = saved ? '★ 已收藏' : '☆ 收藏';
    }
  }
  function render() {
    const a = current();
    if (!a) {
      showPlaceholder(state.mode === 'saved' ? '这里还没有收藏' : '下一页会是什么？',
        state.mode === 'saved' ? '看到喜欢的文章时，点击 ☆ 收藏。这里只留下你主动保存的内容。' :
          '还没有读到文章。请检查 GitHub Actions 是否成功更新了数据。');
      return;
    }
    $('topic').textContent = a.topic || '偶然发现';
    $('date').textContent = a.date || '';
    $('title').textContent = displayTitle(a);
    $('summary').textContent = a.summary || '这篇文章暂时没有导读，可打开媒体原文。';
    $('source').textContent = '选自 ' + (a.source || '未知来源');
    const hasTranslation = ['machine', 'partial'].includes(a.translation_status);
    const hasEditedTitle = Boolean(displayTitle(a) && displayTitle(a) !== a.title);
    const hasOriginalSummary = Boolean(hasTranslation && a.original_summary);
    $('translationNote').hidden = !hasTranslation;
    $('translationNote').textContent = hasTranslation ? '机器翻译 · 可展开核对原文' : '';
    $('originalTitle').hidden = true;
    $('originalTitleText').textContent = '原标题：' + (a.title || '');
    $('originalSummaryText').textContent = hasOriginalSummary ? '原始摘要：' + a.original_summary : '';
    $('originalSummaryText').hidden = !hasOriginalSummary;
    $('originalToggle').textContent = hasTranslation ? '查看英文标题与摘要' : '查看原标题';
    $('originalToggle').hidden = !(hasEditedTitle || hasOriginalSummary);
    $('readButton').disabled = false;
    $('readButton').textContent = canShowLicensedText(a) ? '阅读文章' : '阅读导读';
    $('saveButton').disabled = false;
    setSavedButton($('saveButton'), state.saved.has(idOf(a)));
    $('backButton').disabled = state.cursor <= 0;
    setCover(a.image || '', a);
  }
  function next() {
    if (state.readerOpen) return;
    if (state.cursor + 1 < state.history.length) { state.cursor++; render(); return; }
    const picked = pickNext();
    if (!picked) {
      showPlaceholder(state.mode === 'saved' ? '这里还没有收藏' : '暂无可读文章',
        state.mode === 'saved' ? '看到喜欢的文章时，点击 ☆ 收藏。' : '稍后重试，或者检查更新任务是否成功。');
      return;
    }
    state.history.push(picked);
    state.used.add(idOf(picked));
    state.cursor = state.history.length - 1;
    status(state.banner);
    render();
  }
  function previous() {
    if (state.readerOpen) return;
    if (state.cursor > 0) { state.cursor--; render(); }
  }
  function mode(value) {
    if (state.mode === value || state.readerOpen) return;
    state.mode = value;
    state.cursor = -1;
    state.history = [];
    state.used.clear();
    for (const item of ['browse', 'saved']) {
      const button = $(item + 'Mode');
      button.classList.toggle('selected', value === item);
      button.setAttribute('aria-pressed', String(value === item));
    }
    if (inPool().length) next(); else render();
  }
  function toggleSave() {
    const a = current();
    if (!a) return;
    const key = idOf(a);
    if (state.saved.has(key)) state.saved.delete(key); else state.saved.add(key);
    persistSaved();
    // 收藏视图允许先阅读当前页，返回时再刷新收藏列表。
    if (!state.readerOpen && state.mode === 'saved' && !state.saved.has(key)) {
      state.history = state.history.filter(item => state.saved.has(idOf(item)));
      state.cursor = Math.min(state.cursor, state.history.length - 1);
    }
    render();
    if (state.readerOpen) setSavedButton($('readingSaveButton'), state.saved.has(key));
  }

  function openReader() {
    const a = current();
    if (!a || state.readerOpen) return;
    readerReturnFocus = document.activeElement;
    $('readingTopic').textContent = a.topic || '偶然发现';
    $('readingTitle').textContent = displayTitle(a);
    $('readingByline').textContent = [a.source || '未知来源', a.date || ''].filter(Boolean).join(' · ');
    const isFull = canShowLicensedText(a);
    $('readingType').textContent = isFull ? '站内全文 · 已标注使用许可' : '订阅源导读';
    const text = isFull ? a.licensed_body : (a.summary || '这篇文章暂时没有可用导读。');
    const body = $('readingBody');
    body.replaceChildren();
    // 一律使用 textContent，避免把 RSS/数据中的 HTML 当作页面代码执行。
    for (const chunk of text.split(/\n\s*\n/).filter(x => x.trim())) {
      const p = document.createElement('p');
      p.textContent = chunk.trim();
      body.appendChild(p);
    }
    if (!body.childElementCount) {
      const p = document.createElement('p');
      p.textContent = '该文章暂无可读内容。'; body.appendChild(p);
    }
    const hasDifferentTitle = Boolean(displayTitle(a) && displayTitle(a) !== a.title);
    const hasOriginalSummary = Boolean(a.original_summary && a.original_summary !== a.summary);
    const showOriginal = hasDifferentTitle || hasOriginalSummary;
    $('readerOriginalToggle').hidden = !showOriginal;
    $('readerOriginalToggle').textContent = '查看原文信息';
    $('readingOriginal').hidden = true;
    $('readingOriginalTitle').textContent = '原标题：' + (a.title || '');
    $('readingOriginalSummary').textContent = hasOriginalSummary ? '原始摘要：' + a.original_summary : '';
    $('readingOriginalSummary').hidden = !hasOriginalSummary;
    $('readingDisclaimer').textContent = isFull ?
      ('正文使用许可：' + a.license + '。请以原文与许可条款为准。') :
      '这里展示的是媒体订阅源提供的导读，并非完整文章。需要继续阅读时，可前往媒体原文；外部网站的广告与弹窗不受拾趣控制。';
    if (isSafeArticleUrl(a.url)) $('readerOpenLink').href = a.url;
    else $('readerOpenLink').removeAttribute('href');
    setSavedButton($('readingSaveButton'), state.saved.has(idOf(a)));
    $('readingOverlay').hidden = false;
    $('readingOverlay').scrollTop = 0;
    document.body.classList.add('reader-open');
    $('.site-shell');
    document.querySelector('.site-shell').setAttribute('aria-hidden', 'true');
    state.readerOpen = true;
    // 浏览器「返回」先退出阅读层，而不是直接离开拾趣。
    try {
      history.pushState({curioReading:true}, '', window.location.href);
      readerHistoryEntry = true;
    } catch { readerHistoryEntry = false; }
    $('closeReader').focus();
  }
  function hideReader() {
    if (!state.readerOpen) return;
    $('readingOverlay').hidden = true;
    document.body.classList.remove('reader-open');
    document.querySelector('.site-shell').removeAttribute('aria-hidden');
    state.readerOpen = false;
    if (state.mode === 'saved' && current() && !state.saved.has(idOf(current()))) {
      state.history = state.history.filter(a => state.saved.has(idOf(a)));
      state.cursor = Math.min(state.cursor, state.history.length - 1);
      render();
    }
    if (readerReturnFocus && readerReturnFocus.isConnected && !readerReturnFocus.disabled) readerReturnFocus.focus();
    else $('nextButton').focus();
  }
  function closeReader() {
    if (!state.readerOpen) return;
    hideReader();
    if (readerHistoryEntry) {
      readerHistoryEntry = false;
      history.back();
    }
  }
  async function load() {
    if (state.readerOpen) return;
    state.banner = '';
    status('正在获取文章……');
    try {
      const response = await fetch('./data/articles.json?t=' + Date.now(), {cache:'no-store'});
      if (!response.ok) throw Error('文章数据无法加载（HTTP ' + response.status + '）');
      const payload = await response.json();
      if (!Array.isArray(payload.articles)) throw Error('文章数据格式错误');
      // 保持 v0.5 的中文优先策略。
      state.articles = payload.articles.filter(a => a && a.title && a.url &&
        (a.display_language === 'zh' || /[\u3400-\u9fff]/.test(displayTitle(a))));
      state.cursor = -1; state.history = []; state.used.clear();
      if (!state.articles.length) {
        render(); status('暂无可用中文文章，请在 GitHub Actions 检查翻译和发布结果。'); return;
      }
      next();
      if (payload.sources_ok === 0) state.banner = '当前为项目内置的示例文章，首次在线抓取成功后会自动替换。';
      else if (payload.sources_ok < payload.sources_total) state.banner = '部分媒体订阅源暂时不可用，其他文章仍可正常阅读。';
      status(state.banner);
    } catch (error) {
      state.articles = []; state.cursor = -1; state.history = []; render();
      status('加载失败：' + error.message + '。请在 http(s) 网页打开，不要直接双击 HTML。');
    }
  }

  $('browseMode').addEventListener('click', () => mode('browse'));
  $('savedMode').addEventListener('click', () => mode('saved'));
  $('nextButton').addEventListener('click', next);
  $('backButton').addEventListener('click', previous);
  $('saveButton').addEventListener('click', toggleSave);
  $('readingSaveButton').addEventListener('click', toggleSave);
  $('readButton').addEventListener('click', openReader);
  $('closeReader').addEventListener('click', closeReader);
  $('reloadButton').addEventListener('click', load);
  $('readerOriginalToggle').addEventListener('click', () => {
    const box = $('readingOriginal'); box.hidden = !box.hidden;
    $('readerOriginalToggle').textContent = box.hidden ? '查看原文信息' : '收起原文信息';
  });
  $('originalToggle').addEventListener('click', () => {
    const box = $('originalTitle'); box.hidden = !box.hidden;
    const a = current();
    const label = ['machine','partial'].includes(a && a.translation_status) ? '查看英文标题与摘要' : '查看原标题';
    $('originalToggle').textContent = box.hidden ? label : '收起原文信息';
  });
  window.addEventListener('popstate', () => {
    if (state.readerOpen) hideReader();
    readerHistoryEntry = false;
  });
  document.addEventListener('keydown', (e) => {
    if (state.readerOpen) {
      if (e.key === 'Escape') { e.preventDefault(); closeReader(); }
      // 避免焦点跳出弹出的站内阅读层。
      if (e.key === 'Tab') {
        const focusables = [...$('readingOverlay').querySelectorAll('button:not([disabled]):not([hidden]),a[href]:not([hidden])')].filter(el => el.offsetParent !== null);
        if (!focusables.length) return;
        const first = focusables[0], last = focusables[focusables.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
      }
      return;
    }
    if (e.target.closest('button,a,input,textarea')) return;
    if (['ArrowDown','ArrowRight','PageDown',' '].includes(e.key)) { e.preventDefault(); next(); }
    if (['ArrowUp','ArrowLeft','PageUp'].includes(e.key)) { e.preventDefault(); previous(); }
  });
  const card = $('readerCard');
  card.addEventListener('touchstart', (e) => {
    if (state.readerOpen) return;
    if (e.touches.length === 1) { touchY = e.touches[0].clientY; touchX = e.touches[0].clientX; }
  }, {passive:true});
  card.addEventListener('touchend', (e) => {
    if (state.readerOpen || !e.changedTouches.length) return;
    if (e.target.closest('button,a')) return;
    const dy = e.changedTouches[0].clientY - touchY, dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(dx) * 1.4) {
      if (dy < 0) next(); else previous();
    }
  }, {passive:true});
  card.addEventListener('wheel', (e) => {
    if (state.readerOpen || window.innerWidth < 760 || Math.abs(e.deltaY) < 35 || Date.now() - wheelAt < 800) return;
    wheelAt = Date.now(); if (e.deltaY > 0) next(); else previous();
  }, {passive:true});
  load();
})();
