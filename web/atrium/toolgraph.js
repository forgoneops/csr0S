(() => {
  const state = { data: null, error: '', loading: false, enabled: false };
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  async function syncEnabled() {
    try {
      const response = await fetch('/api/plugins/all');
      const modules = response.ok ? await response.json() : [];
      const mod = modules.find(item => item.id === 'toolgraph');
      state.enabled = !!(mod?.enabled && mod?.running);
      if (state.enabled) OGS.mods.add('Tool graph'); else OGS.mods.delete('Tool graph');
    } catch { state.enabled = false; OGS.mods.delete('Tool graph'); }
  }
  async function load() {
    state.loading = true; state.error = '';
    try {
      const response = await fetch('/api/p/toolgraph');
      const json = await response.json().catch(() => ({}));
      if (!response.ok) throw Error(json.error || 'Toolgraph data is unavailable. Check that the module is on.');
      state.data = json;
    } catch (error) { state.error = error.message || 'Toolgraph data is unavailable.'; }
    state.loading = false;
  }
  function view() {
    const enabled = OGS.mods.has('Tool graph');
    if (enabled !== state.enabled) { state.enabled = enabled; state.data = null; state.error = ''; if (enabled) void load().then(render); }
    if (!state.enabled) return `<main class="nx-view enter toolgraph-view">${typeof ARTHEAD === 'function' ? ARTHEAD('Tool graph', 'tools') : ''}<header class="nx-phead"><h2>TOOL GRAPH</h2><span class="label">System</span></header><p class="tg-disabled" role="status">Tool graph is off. Enable it in Settings → Optional modules.</p></main>`;
    if (!state.data && !state.error) { if (!state.loading) void load().then(render); return `<main class="nx-view enter toolgraph-view" aria-busy="true"><header class="nx-phead"><h2>TOOL GRAPH</h2><span class="label">System telemetry</span></header><p role="status" class="tg-loading">Loading tool activity…</p><div class="tg-skeleton" aria-hidden="true"><i></i><i></i><i></i></div></main>`; }
    const data = state.data || { tools: [], hottestPath: null, totals: {} };
    const max = Math.max(1, ...data.tools.map(row => row.totalMs));
    const table = data.tools.length ? `<div class="tg-table-wrap"><table><caption>Tool calls and measured latency</caption><thead><tr><th scope="col">Tool</th><th scope="col">Calls</th><th scope="col">Errors</th><th scope="col">Average</th><th scope="col">Total</th></tr></thead><tbody>${data.tools.map(row => `<tr><th scope="row">${esc(row.tool)}<span class="tg-bar" aria-hidden="true"><i style="width:${Math.max(2, row.totalMs / max * 100)}%"></i></span></th><td data-label="Calls">${row.calls}</td><td data-label="Errors" class="${row.errors ? 'tg-errors' : ''}">${row.errors}</td><td data-label="Average">${row.averageMs === null ? 'Not measured' : `${esc(row.averageMs)} ms`}</td><td data-label="Total">${esc(row.totalMs)} ms</td></tr>`).join('')}</tbody></table></div>` : `<p class="tg-empty">No tool calls are recorded in assistant replies yet.</p>`;
    const hot = data.hottestPath ? `<section class="tg-hot"><span class="label">HOTTEST PATH</span><h3>${esc(data.hottestPath.agent)} · ${esc(data.hottestPath.totalMs)} ms</h3><ol>${data.hottestPath.chain.map((name, i) => `<li><span>${i + 1}</span>${esc(name)}</li>`).join('')}</ol></section>` : `<section class="tg-hot"><span class="label">HOTTEST PATH</span><p>No measured path yet.</p></section>`;
    return `<main class="nx-view enter toolgraph-view"><header class="tg-head"><div><div class="nx-phead"><h2>TOOL GRAPH</h2><span class="label">System telemetry</span></div><p>Calls, latency and errors across recent tool-enabled assistant replies.</p></div><button type="button" class="tg-refresh" data-tg-refresh ${state.loading ? 'disabled' : ''}>${state.loading ? 'Refreshing…' : 'Refresh'}</button></header>${state.error ? `<p class="tg-error" role="alert">${esc(state.error)}</p>` : ''}<section class="tg-totals" aria-label="Activity summary"><div><span>Calls</span><b>${esc(data.totals?.calls ?? 0)}</b></div><div><span>Errors</span><b>${esc(data.totals?.errors ?? 0)}</b></div><div><span>Replies</span><b>${esc(data.totals?.runs ?? 0)}</b></div></section>${hot}<section class="tg-tools"><h3>Per tool</h3>${table}</section><p class="tg-note">Read-only summary. Prompts, outputs and file paths are not shown.</p></main>`;
  }
  function render() { if (typeof S !== 'undefined') { const tab = S.tabs[S.act]; if (tab?.k === 'app' && tab.id === 'Tool graph') window.render?.(); } }
  register({ id: 'toolgraph', views: { 'Tool graph': view } });
  void syncEnabled().then(render);
  document.addEventListener('click', async event => {
    const button = event.target.closest('[data-tg-refresh]');
    if (!button) return;
    event.preventDefault(); event.stopPropagation();
    await load(); render();
  }, true);
})();
