(function () {
  'use strict';

  var POLL_MS = 700;
  var POLL_MAX = 40;
  var REASONS = ['unreachable', 'refused', 'timeout', 'dns', 'http_status', 'bad_url',
    'not_selected', 'core_missing', 'core_failed', 'core_timeout', 'none'];

  var strings = { en: {}, pl: {} };
  var lang = (navigator.language || '').toLowerCase().indexOf('pl') === 0 ? 'pl' : 'en';
  var state = null;
  var pendingId = null;      // row picked in the page, not yet connected
  var busy = false;
  var pollCount = 0;
  var pollTimer = null;
  var stillChecking = false;
  var errors = { picker: '', add: '', offline: '' };  // raw messages, translated at render
  var langTouched = false;   // set by the EN | PL switch, which then outranks state.locale

  var bridge = window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;

  function $(id) { return document.getElementById(id); }

  function t(key, vars) {
    var s = (strings[lang] && strings[lang][key]) || (strings.en && strings.en[key]) || key;
    if (vars) {
      Object.keys(vars).forEach(function (k) { s = s.split('{' + k + '}').join(vars[k]); });
    }
    return s;
  }

  function msgText(raw) {
    var m = String(raw == null ? '' : raw).trim();
    return REASONS.indexOf(m) >= 0 ? t('reason.' + m) : m;
  }

  function setText(id, text) { $(id).textContent = text; }

  function show(id, on) { $(id).hidden = !on; }

  function showError(id, raw) {
    var el = $(id);
    el.textContent = raw ? msgText(raw) : '';
    el.hidden = !raw;
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) { n.className = cls; }
    if (text != null) { n.textContent = text; }
    return n;
  }

  // The built-in entry carries a canonical English name in the shell config; the page shows it
  // in the reader's language, remote gateways keep the name the person typed.
  function displayName(g) {
    return g && g.kind === 'local' && g.builtin ? t('gateway.thisDevice') : (g && g.name) || '?';
  }

  function gatewayById(id) {
    var list = (state && state.gateways) || [];
    for (var i = 0; i < list.length; i++) { if (list[i].id === id) { return list[i]; } }
    return null;
  }

  // ---- commands -----------------------------------------------------------

  function call(cmd, args) {
    if (!bridge) { return Promise.reject(t('bridge.missing')); }
    return Promise.resolve(bridge(cmd, args)).then(function (r) { return r; });
  }

  function apply(next) {
    state = next;
    if (state.locale === 'en' || state.locale === 'pl') {
      if (!langTouched) { lang = state.locale; }
    }
    if (!state.gateways.some(function (g) { return g.id === pendingId; })) {
      pendingId = state.selected_id;
    }
    render();
    schedulePoll();
  }

  function run(cmd, args, errSlot) {
    if (busy) { return Promise.resolve(); }
    busy = true;
    errors[errSlot] = '';
    pollCount = 0;
    stillChecking = false;
    render();
    return call(cmd, args).then(function (next) {
      busy = false;
      apply(next);
      return next;
    }, function (err) {
      busy = false;
      errors[errSlot] = String(err && err.message ? err.message : err);
      render();
    });
  }

  function schedulePoll() {
    clearTimeout(pollTimer);
    if (!state || state.status.kind !== 'checking') { pollCount = 0; stillChecking = false; return; }
    if (pollCount >= POLL_MAX) { stillChecking = true; render(); return; }
    pollTimer = setTimeout(function () {
      pollCount += 1;
      call('get_shell_state').then(apply, function (err) {
        errors.picker = String(err && err.message ? err.message : err);
        stillChecking = true;
        render();
      });
    }, POLL_MS);
  }

  // ---- rendering ----------------------------------------------------------

  function renderStatic() {
    document.documentElement.lang = lang;
    setText('brand', t('app.name'));
    setText('picker-title', t('picker.title'));
    setText('picker-lede', t('picker.lede'));
    setText('picker-empty', t('picker.empty'));
    setText('add-title', t('picker.addTitle'));
    setText('add-name-label', t('picker.addName'));
    setText('add-address-label', t('picker.addAddress'));
    setText('offline-title', t('offline.title'));
    setText('offline-kept', t('offline.kept'));
    setText('offline-retry', t('offline.retry'));
    setText('offline-change', t('offline.change'));
    setText('offline-quit', t('offline.quit'));
    setText('still-retry', t('offline.retry'));
    ['en', 'pl'].forEach(function (l) {
      $('lang-' + l).setAttribute('aria-pressed', String(lang === l));
    });
  }

  function renderBridge() {
    var missing = !bridge;
    var b = $('bridge');
    b.hidden = !missing;
    if (missing) { b.textContent = t('bridge.missing'); }
  }

  function renderStatus() {
    var s = state && state.status;
    var box = $('status');
    var on = !!s && (s.kind === 'checking' || s.kind === 'online');
    box.hidden = !on;
    if (!s) { return; }
    // Rendered even while hidden, so a language switch never leaves stale text behind.
    var online = s.kind === 'online';
    var spin = $('spinner');
    spin.classList.toggle('off', stillChecking && !online);
    if (online) {
      setText('status-text', t('status.online', { name: s.gateway_name || '' }));
    } else if (stillChecking) {
      setText('status-text', t('status.stillChecking'));
    } else {
      setText('status-text', t('status.checking'));
    }
    $('still-retry').hidden = !(stillChecking && !online);
    $('still-retry').disabled = busy;
  }

  function fact(dl, label, value) {
    dl.appendChild(el('dt', null, label));
    dl.appendChild(el('dd', null, value));
  }

  function renderOffline() {
    var s = state && state.status;
    var on = !!s && s.kind === 'offline';
    $('offline').hidden = !on;
    if (!s) { return; }
    // Rendered even while hidden, so a language switch never leaves stale text behind.
    setText('offline-gone', t('offline.gone', { name: displayName(gatewayById(s.gateway_id)), address: s.address || '?' }));
    var reason = REASONS.indexOf(s.reason) >= 0 ? s.reason : 'none';
    setText('offline-reason', t('reason.' + reason));
    var dl = $('offline-facts');
    dl.textContent = '';
    if (s.detail) { fact(dl, t('offline.detail'), s.detail); }
    if (s.reason === 'http_status' && s.http_status != null) {
      fact(dl, t('offline.httpStatus'), String(s.http_status));
    }
    dl.appendChild(el('dt', null, t('offline.core')));
    dl.appendChild(el('dd', null, s.core_started ? t('offline.coreStarted') : t('offline.coreNotStarted')));
    ['offline-retry', 'offline-change', 'offline-quit'].forEach(function (id) { $(id).disabled = busy; });
    if (busy) { setText('offline-retry', t('action.working')); }
    showError('offline-error', errors.offline);
  }

  function renderList() {
    var ul = $('gateways');
    var focusId = document.activeElement && document.activeElement.getAttribute &&
      document.activeElement.getAttribute('data-pick');
    ul.textContent = '';
    var list = state ? state.gateways.slice() : [];
    list.sort(function (a, b) { return (a.kind === 'local' ? 0 : 1) - (b.kind === 'local' ? 0 : 1); });
    show('picker-empty', !!state && list.length === 0);
    list.forEach(function (g) {
      var picked = g.id === pendingId;
      var li = el('li', 'gw');
      li.setAttribute('data-selected', String(picked));
      var pick = el('button', 'gw-pick');
      pick.type = 'button';
      pick.setAttribute('data-pick', g.id);
      pick.setAttribute('aria-pressed', String(picked));
      pick.appendChild(el('span', 'gw-name', displayName(g)));
      pick.appendChild(el('span', 'gw-addr', g.address));
      var meta = [g.kind === 'local' ? t('gateway.local') : t('gateway.remote')];
      if (g.builtin) { meta.push(t('gateway.builtin')); }
      if (picked) { meta.push(t('gateway.selected')); }
      pick.appendChild(el('span', 'gw-meta', meta.join(' · ')));
      pick.disabled = busy;
      pick.addEventListener('click', function () {
        pendingId = g.id;
        renderList();
        renderConnect();
      });
      li.appendChild(pick);
      if (g.kind === 'remote' && !g.builtin) {
        var rm = el('button', 'gw-remove', t('picker.remove'));
        rm.type = 'button';
        rm.setAttribute('aria-label', t('picker.remove') + ': ' + g.name);
        rm.disabled = busy;
        rm.addEventListener('click', function () { run('remove_gateway', { id: g.id }, 'picker'); });
        li.appendChild(rm);
      }
      ul.appendChild(li);
    });
    if (focusId) {
      var again = ul.querySelector('[data-pick]');
      var all = ul.querySelectorAll('[data-pick]');
      for (var i = 0; i < all.length; i++) {
        if (all[i].getAttribute('data-pick') === focusId) { again = all[i]; }
      }
      if (again) { again.focus(); }
    }
  }

  function renderConnect() {
    var b = $('connect');
    b.textContent = busy ? t('action.working') : t('picker.connect');
    b.disabled = busy || !pendingId;
  }

  function renderAdd() {
    var b = $('add-submit');
    b.textContent = busy ? t('action.working') : t('picker.add');
    b.disabled = busy;
    showError('add-error', errors.add);
    showError('picker-error', errors.picker);
  }

  function render() {
    renderStatic();
    renderBridge();
    renderStatus();
    renderOffline();
    renderList();
    renderConnect();
    renderAdd();
  }

  // ---- events -------------------------------------------------------------

  function bind() {
    ['en', 'pl'].forEach(function (l) {
      $('lang-' + l).addEventListener('click', function () {
        lang = l;
        langTouched = true;
        render();
      });
    });
    $('connect').addEventListener('click', function () {
      if (pendingId) { run('select_gateway', { id: pendingId }, 'picker'); }
    });
    $('offline-retry').addEventListener('click', function () { run('retry_gateway', undefined, 'offline'); });
    $('still-retry').addEventListener('click', function () { run('retry_gateway', undefined, 'picker'); });
    $('offline-quit').addEventListener('click', function () {
      call('quit_app').then(null, function (err) {
        errors.offline = String(err && err.message ? err.message : err);
        render();
      });
    });
    $('offline-change').addEventListener('click', function () {
      var h = $('picker-title');
      h.scrollIntoView({ block: 'start' });
      h.focus();
    });
    $('add-form').addEventListener('submit', function (ev) {
      ev.preventDefault();
      var name = $('add-name').value.trim();
      var address = $('add-address').value.trim();
      if (!name || !address || busy) { return; }
      run('add_gateway', { name: name, address: address }, 'add').then(function (next) {
        if (errors.add || !next) { return; }
        $('add-name').value = '';
        $('add-address').value = '';
        // Pick the entry that was just added so Connect is one click away.
        var added = next.gateways.filter(function (g) {
          return g.kind === 'remote' && g.name === name;
        }).pop();
        if (added) { pendingId = added.id; render(); }
      });
    });
  }

  function loadStrings() {
    return fetch('strings.json').then(function (r) { return r.json(); }).then(function (d) {
      strings = d;
    }).catch(function () {
      strings = { en: { 'bridge.missing': 'Shell bridge unavailable.' }, pl: {} };
    });
  }

  function start() {
    bind();
    loadStrings().then(function () {
      render();
      if (!bridge) { return; }
      call('get_shell_state').then(apply, function (err) {
        errors.picker = String(err && err.message ? err.message : err);
        render();
      });
    });
  }

  start();
})();
