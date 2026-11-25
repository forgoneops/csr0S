/* Theme: "caesaros" or "neutral", saved in localStorage "caesaros-theme". Loaded in <head> so the first paint is right. */
(function () {
  const key = 'caesaros-theme', root = document.documentElement;
  function set(t) {
    t = t === 'neutral' ? 'neutral' : 'caesaros';
    root.dataset.theme = t;
    try { localStorage.setItem(key, t); } catch (_) {}
    try { NS.opt.th = t === 'neutral' ? 'Neutral' : 'CaesarOS'; } catch (_) {}
  }
  let saved = 'caesaros';
  try { saved = localStorage.getItem(key) === 'neutral' ? 'neutral' : 'caesaros'; } catch (_) {}
  set(saved);
  window.caesarosTheme = { set, toggle: () => set(root.dataset.theme === 'neutral' ? 'caesaros' : 'neutral') };
})();
