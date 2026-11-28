(() => {
  const cards = [['day', 'Today', 'What you will finish before the day ends.'], ['week', 'This week', 'Choose the next outcome.'], ['month', 'This month', 'Give the bigger task a deadline.'], ['quarter', 'This quarter', 'The outcome you are working towards.']];
  const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const request = async (path = '/', method = 'GET', data) => { const res = await fetch('/api/p/goals' + (path === '/' ? '' : path), {   // the route has no trailing slash
     method, headers: {'content-type':'application/json'}, body: data === undefined ? undefined : JSON.stringify(data) }); const json = await res.json().catch(() => ({})); if (!res.ok) throw new Error(json.error || 'Goals are unavailable.'); return json; };
  async function page() {
    const root = document.createElement('div'); root.className = 'nx-view enter goals-view';
    root.innerHTML = (typeof ARTHEAD === 'function' ? ARTHEAD('Goals', 'goals') : '') + '<div class="nx-phead"><h2>GOALS</h2><span class="label">Proposita</span></div><p class="goals-lead">Plan the outcomes that matter, from today to this quarter.</p><div class="goals-content">Loading goals…</div>';
    const host = root.querySelector('.goals-content');
    const render = async () => {
      try {
        const data = await request();
        const rows = cards.map(([h, title, hint]) => { const goals = data.goals.filter(g => g.horizon === h && data.today >= g.start && data.today <= g.end), done = goals.filter(g => g.status === 'done').length;
          return `<section class="goals-card"><header><div><span class="label">${title}</span><p>${hint}</p></div><b>${done} / ${goals.length}</b></header><div class="goals-progress"><i style="width:${goals.length ? done / goals.length * 100 : 0}%"></i></div><ul>${goals.map(g => `<li class="${g.status === 'done' ? 'done' : ''}"><button type="button" class="goals-tick" data-i18n-own data-tick="${esc(g.id)}" aria-label="${g.status === 'done' ? 'Reopen' : 'Complete'} ${esc(g.title)}" aria-pressed="${g.status === 'done'}">${g.status === 'done' ? '✓' : ''}</button><button type="button" class="goals-name" data-no-i18n data-edit="${esc(g.id)}">${esc(g.title)}</button><button type="button" class="goals-remove" data-i18n-own data-remove="${esc(g.id)}" aria-label="Remove ${esc(g.title)}">×</button></li>`).join('')}</ul><form data-add="${h}"><input name="title" maxlength="200" aria-label="New ${title.toLowerCase()} goal" placeholder="Add an outcome" required><button type="submit">Add</button></form>${data.streaks[h] ? `<small class="goals-streak">${data.streaks[h]} complete period${data.streaks[h] === 1 ? '' : 's'} in a row</small>` : ''}</section>`;
        }).join('');
        const old = data.goals.filter(g => data.today > g.end).length;
        host.innerHTML = `${data.carriable ? '<button class="goals-carry" type="button">Carry unfinished goals forward</button>' : ''}<div class="goals-grid">${rows}</div>${old ? `<div class="goals-history">${ARTFOLD('Past goals (' + old + ')', `<ul>${data.goals.filter(g => data.today > g.end).slice().reverse().map(g => `<li><span data-no-i18n>${esc(g.title)}</span><small>${g.status === 'done' ? 'Done' : 'Not done'} · ${g.start} — ${g.end}</small></li>`).join('')}</ul>`)}</div>` : ''}`;
        host.querySelectorAll('[data-tick]').forEach(b => b.onclick = async () => { const g = data.goals.find(x => x.id === b.dataset.tick); await request('/' + encodeURIComponent(g.id), 'POST', {status:g.status === 'done' ? 'active' : 'done'}); await render(); });
        host.querySelectorAll('[data-remove]').forEach(b => b.onclick = async () => { await request('/' + encodeURIComponent(b.dataset.remove), 'DELETE'); await render(); });
        host.querySelectorAll('[data-edit]').forEach(b => b.onclick = async () => { const g = data.goals.find(x => x.id === b.dataset.edit), title = await askText('Goal title', g.title); if (title === null) return; const notes = await askText('Notes', g.notes || ''); if (notes === null) return; await request('/' + encodeURIComponent(g.id), 'POST', {title, notes}); await render(); });
        host.querySelectorAll('form[data-add]').forEach(f => f.onsubmit = async e => { e.preventDefault(); const title = new FormData(f).get('title'); await request('/', 'POST', {horizon:f.dataset.add,title}); await render(); });
        host.querySelector('.goals-carry')?.addEventListener('click', async () => { await request('/carry','POST'); await render(); });
      } catch (err) { host.innerHTML = `<p class="goals-error" role="alert">${esc(err.message)}</p>`; }
    };
    await render(); return root.outerHTML;
  }
  OGS.mods.delete('Goals');
  fetch('/api/plugins/all').then(r => r.ok ? r.json() : []).then(modules => { const m = modules.find(x => x.id === 'goals'); if (m?.running) OGS.mods.add('Goals'); else OGS.mods.delete('Goals'); if (typeof render === 'function') render(); }).catch(() => {});
  register({ id: 'goals', views: { Goals: () => { const el = document.createElement('div'); el.className='nx-view enter goals-view'; el.innerHTML=`<div class="goals-content">${ARTSKEL(3, 'Loading goals')}</div>`; requestAnimationFrame(() => { const host=document.querySelector('.goals-view .goals-content'); if(host) void paint(host); }); return el.outerHTML; } } });
  async function paint(host) { try { await request(); const snapshot = await page(); const parsed = new DOMParser().parseFromString(snapshot, 'text/html'); const replacement = parsed.body.querySelector('.goals-content'); if(host.isConnected && replacement) host.innerHTML = replacement.innerHTML; } catch (e) { if(host.isConnected) host.textContent = e.message; } }
  if (!window.__goalsEvents) {
    window.__goalsEvents = true;
    document.addEventListener('click', async e => {
      const host = e.target.closest('.goals-view')?.querySelector('.goals-content'); if (!host) return;
      const tick = e.target.closest('[data-tick]'), remove = e.target.closest('[data-remove]'), carry = e.target.closest('.goals-carry'), edit = e.target.closest('[data-edit]');
      try {
        if (tick) { const g = await request(); const item = g.goals.find(x => x.id === tick.dataset.tick); await request('/' + encodeURIComponent(item.id), 'POST', {status:item.status === 'done' ? 'active' : 'done'}); }
        else if (remove) await request('/' + encodeURIComponent(remove.dataset.remove), 'DELETE');
        else if (carry) await request('/carry','POST');
        else if (edit) { const current = await request(), g = current.goals.find(x => x.id === edit.dataset.edit), title = await askText('Goal title', g.title); if (title === null) return; const notes = await askText('Notes', g.notes || ''); if (notes === null) return; await request('/' + encodeURIComponent(g.id), 'POST', {title,notes}); }
        else return;
        await paint(host);
      } catch (err) { host.textContent = err.message; }
    }, true);
    document.addEventListener('submit', async e => { const form=e.target.closest('.goals-view form[data-add]'); if (!form) return; e.preventDefault(); const host=form.closest('.goals-view').querySelector('.goals-content'); try { await request('/', 'POST', {horizon:form.dataset.add,title:new FormData(form).get('title')}); await paint(host); } catch(err) { host.textContent=err.message; } }, true);
  }
  window.goalsModule = { render: page };
})();
