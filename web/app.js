(() => {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const STORAGE_KEY = 'curio-v04-saved';
  const state = { articles: [], history: [], cursor: -1, used: new Set(), mode: 'browse', saved: readSaved(), banner: '' };
  let currentImageToken = 0;
  let touchY = 0, touchX = 0, wheelAt = 0;

  function readSaved() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(raw) ? new Set(raw.filter(x => typeof x === 'string')) : new Set();
    } catch { return new Set(); }
  }
  function persistSaved() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...state.saved])); }
    catch { /* 隐私模式可能限制本地存储，阅读仍可继续 */ }
  }
  function rand(list) { return list[Math.floor(Math.random() * list.length)]; }
  function idOf(a) { return a.id || a.url; }
  function status(message) { $('statusLine').textContent = message || ''; }
  function inPool() {
    return state.mode === 'saved' ? state.articles.filter(a => state.saved.has(idOf(a))) : state.articles;
  }
  function pickNext() {
    const pool = inPool();
    if (!pool.length) return null;
    let candidates = pool.filter(a => !state.used.has(idOf(a)));
    if (!candidates.length) {
      // 没有“未读任务”，翻完后再混洗。不要连续显示刚才的文章。
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
  function showPlaceholder(title, description) {
    $('topic').textContent = '拾趣';
    $('date').textContent = '';
    $('title').textContent = title;
    $('summary').textContent = description;
    $('source').textContent = '';
    $('originalToggle').hidden = true;
    $('originalTitle').hidden = true;
    $('openButton').removeAttribute('href');
    $('saveButton').disabled = true;
    $('backButton').disabled = state.cursor < 1;
    setCover('');
  }
  function setCover(url) {
    const img = $('cover');
    const current = ++currentImageToken;
    img.hidden = true;
    img.removeAttribute('src');
    $('illustration').hidden = false;
    if (!/^https?:\/\//i.test(url || '')) return;
    img.onload = () => {
      if (current !== currentImageToken) return;
      img.hidden = false; $('illustration').hidden = true;
    };
    img.onerror = () => {
      if (current !== currentImageToken) return;
      img.hidden = true; $('illustration').hidden = false;
    };
    img.src = url;
  }
  function render() {
    const a = state.history[state.cursor];
    if (!a) {
      const emptySaved = state.mode === 'saved';
      showPlaceholder(emptySaved ? '这里还没有收藏' : '下一页会是什么？', emptySaved ? '看到喜欢的文章时，点击 ☆ 收藏。这里只留你主动保存的内容，没有未读数量。' : '还没有读到文章。请检查 GitHub Actions 是否成功更新了数据。');
      return;
    }
    $('topic').textContent = a.topic || '偶然发现';
    $('date').textContent = a.date || '';
    $('title').textContent = a.editor_title || a.title;
    $('summary').textContent = a.summary || '这篇文章没有摘要，可以打开原文。';
    $('source').textContent = '选自 ' + (a.source || '未知来源');
    $('originalTitle').hidden = true;
    $('originalTitle').textContent = a.title || '';
    $('originalToggle').textContent = '查看原标题';
    $('originalToggle').hidden = !(a.editor_title && a.editor_title !== a.title);
    if (/^https?:\/\//i.test(a.url || '')) $('openButton').href = a.url;
    else $('openButton').removeAttribute('href');
    const saved = state.saved.has(idOf(a));
    $('saveButton').disabled = false;
    $('saveButton').textContent = saved ? '★' : '☆';
    $('saveButton').classList.toggle('saved', saved);
    $('saveButton').setAttribute('aria-pressed', String(saved));
    $('saveButton').setAttribute('aria-label', saved ? '取消收藏' : '收藏这篇文章');
    $('backButton').disabled = state.cursor <= 0;
    setCover(a.image || '');
  }
  function next() {
    if (state.cursor + 1 < state.history.length) {
      state.cursor++;
      render();
      return;
    }
    const picked = pickNext();
    if (!picked) {
      if (state.mode === 'saved') showPlaceholder('这里还没有收藏', '看到喜欢的文章时，点击 ☆ 收藏。');
      else showPlaceholder('暂无可读文章', '稍后重试，或者检查更新任务是否成功。');
      return;
    }
    state.history.push(picked);
    state.used.add(idOf(picked));
    state.cursor = state.history.length - 1;
    status(state.banner);
    render();
  }
  function previous() {
    if (state.cursor > 0) { state.cursor--; render(); }
  }
  function mode(value) {
    if (state.mode === value) return;
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
    const a = state.history[state.cursor];
    if (!a) return;
    const key = idOf(a);
    if (state.saved.has(key)) state.saved.delete(key); else state.saved.add(key);
    persistSaved();
    if (state.mode === 'saved' && !state.saved.has(key)) {
      state.history = state.history.filter(item => state.saved.has(idOf(item)));
      state.cursor = Math.min(state.cursor, state.history.length - 1);
      if (state.cursor < 0) { render(); return; }
    }
    render();
  }
  async function load() {
    state.banner = '';
    status('正在获取文章……');
    try {
      const response = await fetch('./data/articles.json?t=' + Date.now(), {cache:'no-store'});
      if (!response.ok) throw Error('文章数据无法加载（HTTP ' + response.status + '）');
      const payload = await response.json();
      if (!Array.isArray(payload.articles)) throw Error('文章数据格式错误');
      state.articles = payload.articles.filter(a => a && a.title && a.url);
      state.cursor = -1; state.history = []; state.used.clear();
      if (!state.articles.length) {
        render(); status('当前文章库为空，请在 GitHub Actions 手动运行发布任务。'); return;
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
  $('reloadButton').addEventListener('click', load);
  $('originalToggle').addEventListener('click', () => {
    const box = $('originalTitle'); box.hidden = !box.hidden;
    $('originalToggle').textContent = box.hidden ? '查看原标题' : '收起原标题';
  });
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('button,a,input,textarea')) return;
    if (['ArrowDown','ArrowRight','PageDown',' '].includes(e.key)) { e.preventDefault(); next(); }
    if (['ArrowUp','ArrowLeft','PageUp'].includes(e.key)) { e.preventDefault(); previous(); }
  });
  const card = $('readerCard');
  card.addEventListener('touchstart', (e) => {
    if (e.touches.length === 1) { touchY = e.touches[0].clientY; touchX = e.touches[0].clientX; }
  }, {passive:true});
  card.addEventListener('touchend', (e) => {
    if (!e.changedTouches.length) return;
    if (e.target.closest('button,a')) return;
    const dy = e.changedTouches[0].clientY - touchY, dx = e.changedTouches[0].clientX - touchX;
    if (Math.abs(dy) > 70 && Math.abs(dy) > Math.abs(dx) * 1.4) { if (dy < 0) next(); else previous(); }
  }, {passive:true});
  card.addEventListener('wheel', (e) => {
    if (window.innerWidth < 850 || Math.abs(e.deltaY) < 35 || Date.now() - wheelAt < 800) return;
    wheelAt = Date.now(); if (e.deltaY > 0) next(); else previous();
  }, {passive:true});
  load();
})();
