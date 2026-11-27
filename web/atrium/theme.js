/* Theme: "caesaros" or "neutral", saved in localStorage "caesaros-theme". Loaded in <head> so the first paint is right. */
(function () {
  const key = 'caesaros-theme', root = document.documentElement;
  function set(t, once) {
    t = t === 'neutral' ? 'neutral' : 'caesaros';
    root.dataset.theme = t;
    if (!once) try { localStorage.setItem(key, t); } catch (_) {}
    try { NS.opt.th = t === 'neutral' ? 'Neutral' : 'CaesarOS'; } catch (_) {}
  }
  let saved = 'caesaros';
  try { saved = localStorage.getItem(key) === 'neutral' ? 'neutral' : 'caesaros'; } catch (_) {}
  const url = new URLSearchParams(location.search).get('theme');   // ?theme=neutral|caesaros: this page load only, nothing saved
  if (url === 'neutral' || url === 'caesaros') set(url, true); else set(saved);
  window.caesarosTheme = { set, toggle: () => set(root.dataset.theme === 'neutral' ? 'caesaros' : 'neutral') };
})();
