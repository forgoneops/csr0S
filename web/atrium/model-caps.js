/* What an installed Ollama model can do, shown as icon and word in the chat's model menu and on the Models page.
   The facts come from /api/models/info (Ollama's own answer); a model it says nothing about gets no marks. */
(() => {
  const CAPS = { vision: ['eye', 'Images'], tools: ['tools', 'Tools'], thinking: ['sparkle', 'Reasons'], embedding: ['search', 'Embeddings'] };
  const C_ = { by: new Map(), at: 0, loading: false };
  async function load() {
    if (C_.loading || Date.now() - C_.at < 60000) return;
    C_.loading = true;
    try {
      const r = await fetch('/api/models/info'); const list = r.ok ? await r.json() : [];
      const next = new Map(list.map(m => [m.name, m.capabilities]));
      if (JSON.stringify([...next]) !== JSON.stringify([...C_.by])) { C_.by = next; render(); }
    } catch { /* no marks until Ollama answers */ }
    C_.loading = false; C_.at = Date.now();
  }
  const marks = name => {
    const m = (C_.by.get(name) || []).filter(c => CAPS[c]).map(c => `<span class="gx-cap" title="${CAPS[c][1]}">${I(CAPS[c][0], 14)}<span>${CAPS[c][1]}</span></span>`).join('');
    return m && `<span class="gx gx-caps">${m}</span>`;
  };
  window.xCaps = name => { setTimeout(load, 0); return marks(name); };
  if (typeof HTMLElement === 'undefined' || !(document.body instanceof HTMLElement)) return;   // test stubs

  const unesc = s => s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&amp;/g, '&');
  const _chatView = chatView;
  chatView = function (id) {
    const v = _chatView(id);
    if (!v.includes('<span>Ollama · ')) return v;      // only Ollama says what its models can do
    setTimeout(load, 0);
    return v.replace(/(data-model-pick="([^"]*)">[^<]*)(<\/button>)/g, (_, head, name, tail) => head + marks(unesc(name)) + tail);
  };
})();
