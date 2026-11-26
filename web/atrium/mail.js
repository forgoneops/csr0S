/* Mail (Tabellae): your own mail client on /api/mail (core/mail.ts). You add the account yourself, here: server, user and an app password.
   The password goes to a protected file on this machine and is never shown again. Mail is pulled into a local store (headers and text),
   searchable offline. Sending is only ever your click on Send, after a review of exactly what goes out. Nothing here talks to a model, and
   the text of a mail and its senders are the person's data: every one of them is marked data-no-i18n. HTML mail is shown as text. */
(() => {
  const M = { accts: null, acc: null, msgs: [], sel: null, text: '', q: '', unread: false, tab: 'inbox', drafts: null, d: null, plan: null, msg: '', busy: '', open: false, f: { imapSec: 'ssl', smtpSec: 'ssl' }, help: null, rm: false, more: false };
  const api = async (method, url, body) => {
    try { const r = await fetch(url, { method, headers: body ? { 'content-type': 'application/json' } : undefined, body: body ? JSON.stringify(body) : undefined }); return { ok: r.ok, status: r.status, data: await r.json().catch(() => null) }; }
    catch { return { ok: false, status: 0, data: null }; }
  };
  const onScreen = () => !!$('.ml');
  const val = id => { const el = document.getElementById(id); return el ? el.value : ''; };
  const dt = ms => { const d = new Date(ms), t = new Date(); return d.toDateString() === t.toDateString() ? d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString([], { day: 'numeric', month: 'short' }); };
  const who = a => (a && (a.name || a.address)) || '';
  const sec = s => s === 'ssl' ? { secure: true } : s === 'tls' ? { secure: false, starttls: true } : { secure: false };
  const un = s => (s === 'ssl' ? 'SSL' : s === 'tls' ? 'STARTTLS' : 'None (this computer only)');

  async function loadAccounts() { const r = await api('GET', '/api/mail/accounts'); M.accts = r.ok && Array.isArray(r.data) ? r.data : []; if (!M.acc || !M.accts.some(a => a.id === M.acc)) M.acc = M.accts[0] ? M.accts[0].id : null; if (M.acc) await loadList(); else if (onScreen()) render(); }
  async function loadUnread() { if (!M.acc) return; const r = await api('GET', '/api/mail/folders?account=' + encodeURIComponent(M.acc)); const f = r.ok && Array.isArray(r.data) ? r.data.find(x => x.path === 'INBOX') : null; M.un = f ? f.unread : 0; }
  async function loadList(more) {
    const p = new URLSearchParams({ account: M.acc, folder: 'INBOX', limit: '50' }); if (M.q.trim()) p.set('q', M.q.trim()); if (M.unread) p.set('unread', '1'); if (more && M.msgs.length) p.set('before', String(M.msgs[M.msgs.length - 1].date));
    const r = await api('GET', '/api/mail/messages?' + p); const l = r.ok && Array.isArray(r.data) ? r.data : [];
    M.msgs = more ? M.msgs.concat(l) : l; M.more = l.length === 50; await loadUnread(); if (onScreen()) render();
  }
  async function loadDrafts() { const r = await api('GET', '/api/mail/drafts?account=' + encodeURIComponent(M.acc || '')); M.drafts = r.ok && Array.isArray(r.data) ? r.data : []; if (onScreen()) render(); }
  async function openMsg(id) {
    const r = await api('GET', '/api/mail/messages/' + id); if (!r.ok) return; M.sel = r.data; M.text = r.data.text || ''; M.open = true; M.plan = null; M.d = null; M.tab = 'inbox'; M.msg = '';
    if (!r.data.seen) { void api('POST', `/api/mail/messages/${id}/seen`, { seen: true }); const m = M.msgs.find(x => x.id === id); if (m) m.seen = true; M.sel.seen = true; }
    render();
  }
  async function sync() { M.busy = 'sync'; M.msg = ''; render(); const r = await api('POST', `/api/mail/accounts/${M.acc}/sync`); M.busy = ''; M.msg = r.ok ? `${r.data.added} new, ${r.data.removed} gone.${r.data.errors && r.data.errors.length ? ' ' + r.data.errors[0] : ''}` : (r.data && r.data.error) || 'The sync did not finish.'; await loadAccounts(); }
  const form = () => ({ address: val('ml-addr').trim(), user: val('ml-user').trim(), password: val('ml-pass'), label: val('ml-label').trim(), fromName: val('ml-name').trim(),
    imap: { host: val('ml-ih').trim(), port: +val('ml-ip') || 993, ...sec(M.f.imapSec) }, smtp: { host: val('ml-sh').trim(), port: +val('ml-sp') || 465, ...sec(M.f.smtpSec) } });
  async function suggest() {
    const a = val('ml-addr').trim(); if (!/@.+\./.test(a)) return; const r = await api('GET', '/api/mail/preset?address=' + encodeURIComponent(a)); if (!r.ok || !r.data || r.data.error) return;
    const s = r.data; M.help = s; M.f.imapSec = s.imap.secure ? 'ssl' : 'tls'; M.f.smtpSec = s.smtp.secure ? 'ssl' : 'tls';
    M.f.fill = { ih: s.imap.host, ip: s.imap.port, sh: s.smtp.host, sp: s.smtp.port }; render();
  }
  async function testConn() { const f = form(); M.busy = 'test'; M.msg = ''; render(); const r = await api('POST', '/api/mail/test', { address: f.address, user: f.user, password: f.password, imap: f.imap }); M.busy = ''; M.msg = r.data && r.data.ok ? `Connected. ${r.data.folders} folders found.` : (r.data && r.data.error) || 'Could not test the connection.'; render(); }
  async function addAccount() { const f = form(); M.busy = 'add'; M.msg = ''; render(); const r = await api('POST', '/api/mail/accounts', f); M.busy = ''; if (!r.ok) { M.msg = (r.data && r.data.error) || 'The account was not added.'; return render(); } M.f = { imapSec: 'ssl', smtpSec: 'ssl' }; M.help = null; M.adding = false; M.acc = r.data.id; await loadAccounts(); void sync(); }
  async function removeAccount() { const r = await api('DELETE', '/api/mail/accounts/' + M.acc); M.rm = false; M.msg = r.ok ? '' : (r.data && r.data.error) || 'Could not remove it.'; M.sel = null; M.msgs = []; M.acc = null; await loadAccounts(); }
  async function flag(read) { if (!M.sel) return; await api('POST', `/api/mail/messages/${M.sel.id}/seen`, { seen: read }); M.sel.seen = read; const m = M.msgs.find(x => x.id === M.sel.id); if (m) m.seen = read; render(); }
  const draftBody = () => ({ account: M.acc, to: val('ml-to'), cc: val('ml-cc'), subject: val('ml-sub'), text: val('ml-body') });
  async function fromMsg(kind) { const r = await api('POST', '/api/mail/drafts/from/' + M.sel.id, { kind }); if (!r.ok) { M.msg = (r.data && r.data.error) || 'Could not start the reply.'; return render(); } M.d = r.data; M.plan = null; M.msg = ''; M.open = true; render(); }
  async function saveDraft() { const b = draftBody(), r = M.d && M.d.id ? await api('PUT', '/api/mail/drafts/' + M.d.id, b) : await api('POST', '/api/mail/drafts', b); if (!r.ok) { M.msg = (r.data && r.data.error) || 'The draft was not saved.'; render(); return null; } M.d = r.data; M.msg = 'Draft saved on this computer.'; M.drafts = null; return r.data; }
  async function review() { const d = await saveDraft(); if (!d) return; const r = await api('POST', `/api/mail/drafts/${d.id}/prepare`); if (!r.ok) { M.msg = (r.data && r.data.error) || 'It cannot be sent yet.'; return render(); } M.plan = r.data; M.msg = ''; render(); }
  async function send() { const p = M.plan; M.busy = 'send'; render(); const r = await api('POST', '/api/mail/send', { sendId: p.sendId, hash: p.hash }); M.busy = '';
    if (!r.ok) { M.msg = (r.data && r.data.error) || 'The message was not sent.'; M.plan = null; return render(); }
    M.msg = `Sent to ${r.data.accepted.length} ${r.data.accepted.length === 1 ? 'recipient' : 'recipients'}. Delivery to the inbox is not confirmed.`; M.plan = null; M.d = null; M.drafts = null; M.open = false; render(); }
  async function cancelPlan() { if (M.plan) await api('POST', '/api/mail/send/cancel', { sendId: M.plan.sendId }); M.plan = null; render(); }
  async function delDraft(id) { await api('DELETE', '/api/mail/drafts/' + id); if (M.d && M.d.id === id) M.d = null; M.drafts = null; render(); }

  const field = (id, label, value = '', type = 'text', extra = '') => `<label class="ml-f"><span class="label">${label}</span><input class="og-input" id="${id}" type="${type}" value="${esc(value)}" autocomplete="off" ${extra}></label>`;
  const secBtns = (k, cur) => `<div class="ml-seg" role="group" aria-label="Connection security">${['ssl', 'tls', 'none'].map(s => `<button type="button" class="nt-b${cur === s ? ' go' : ''}" data-ml="${k}:${s}" aria-pressed="${cur === s}"><span>${un(s)}</span></button>`).join('')}</div>`;

  /** The messenger post: a rider route with a seal at each end. The unread count is the real one from the local store; the rider moves only while a sync runs and only when Motion is on. */
  const post = (a, add) => `<div class="ml-post${M.busy === 'sync' ? ' ride' : ''}" role="status"><span class="ml-seal" aria-hidden="true">${I('mail', 18)}</span><i class="ml-route" aria-hidden="true"><b></b></i><span class="ml-seal" aria-hidden="true">${I('inbox', 18)}</span>
    <span class="ml-ptxt" data-no-i18n>${add ? 'No post route yet. Add an account to open one.' : `<b>${M.un || 0}</b> unread \u00b7 ${a.lastSync ? 'synced ' + esc(dt(a.lastSync)) : 'not synced yet'}`}</span></div>`;
  function addForm() {
    const fl = M.f.fill || {}, h = M.help;
    return `<section class="ml-add panel"><h3>Add your mail account</h3>
      <p class="ml-note">You type the details here yourself. The app password is kept in a protected file on this computer and is never shown again; Caesar and its agents never see it and cannot send mail.</p>
      ${h ? `<div class="ml-help" data-no-i18n><b>${esc(h.label)}</b><p>${esc(h.note || '')}</p>${h.help ? `<ol>${h.help.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol>` : ''}</div>` : ''}
      ${field('ml-addr', 'Email address', val('ml-addr'), 'email', 'placeholder="you@example.com"')}
      <div class="ml-row">${field('ml-ih', 'IMAP server', fl.ih || val('ml-ih'))}${field('ml-ip', 'Port', String(fl.ip || val('ml-ip') || 993), 'number')}${secBtns('isec', M.f.imapSec)}</div>
      <div class="ml-row">${field('ml-sh', 'SMTP server', fl.sh || val('ml-sh'))}${field('ml-sp', 'Port', String(fl.sp || val('ml-sp') || 465), 'number')}${secBtns('ssec', M.f.smtpSec)}</div>
      <div class="ml-row">${field('ml-user', 'Username (if not the address)', val('ml-user'))}${field('ml-pass', 'App password', val('ml-pass'), 'password')}</div>
      <div class="ml-row">${field('ml-label', 'Name for this account', val('ml-label'))}${field('ml-name', 'Your name on sent mail', val('ml-name'))}</div>
      ${M.msg ? `<p class="nt-msg" role="status" data-no-i18n>${esc(M.msg)}</p>` : ''}
      <div class="nt-acts"><button class="nt-b" data-ml="test" ${M.busy ? 'disabled' : ''}><span>${M.busy === 'test' ? 'Testing…' : 'Test the connection'}</span></button><button class="nt-b go" data-ml="add" ${M.busy ? 'disabled' : ''}><span>${M.busy === 'add' ? 'Adding…' : 'Add account'}</span></button>${M.accts && M.accts.length ? '<button class="nt-b" data-ml="addx"><span>Cancel</span></button>' : ''}</div></section>`;
  }
  const row = m => `<button class="nt-note ml-msg${M.sel && M.sel.id === m.id ? ' on' : ''}${m.seen ? '' : ' unread'}" data-ml-msg="${m.id}"><b data-no-i18n>${esc(who(m.from))}</b><span class="ml-sub" data-no-i18n>${esc(m.subject || '(no subject)')}</span><small data-no-i18n>${esc(m.snippet)}</small><time data-no-i18n>${esc(dt(m.date))}</time></button>`;
  function reader() {
    if (M.plan) { const p = M.plan.plan; return `<section class="nt-ed panel ml-read"><h3>Review before sending</h3><p class="ml-note">This is exactly what will go out. Nothing is sent until you press Send.</p>
      <dl class="ml-plan" data-no-i18n><dt>From</dt><dd>${esc(p.from)}</dd><dt>To</dt><dd>${esc(p.to.join(', '))}</dd>${p.cc.length ? `<dt>Cc</dt><dd>${esc(p.cc.join(', '))}</dd>` : ''}${p.bcc.length ? `<dt>Bcc</dt><dd>${esc(p.bcc.join(', '))}</dd>` : ''}<dt>Subject</dt><dd>${esc(p.subject)}</dd></dl>
      <pre class="ml-text" data-no-i18n>${esc(p.preview)}</pre>${p.warnings.length ? `<ul class="ml-warn" data-no-i18n>${p.warnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>` : ''}
      <div class="nt-acts"><button class="nt-b go" data-ml="send" ${M.busy ? 'disabled' : ''}><span>${M.busy === 'send' ? 'Sending\u2026' : 'Send'}</span></button><button class="nt-b" data-ml="cancelplan"><span>Back to the draft</span></button></div></section>`; }
    if (M.d) return `<section class="nt-ed panel ml-read"><div class="nt-bar"><button class="nt-b nt-backbtn" data-ml="back">${I('chevron-right', 16)}<span>Back</span></button><h3 class="nt-name">${M.d.id ? 'Draft' : 'New message'}</h3></div>
      ${field('ml-to', 'To', (M.d.to || []).map(a => a.address).join(', '))}${field('ml-cc', 'Cc', (M.d.cc || []).map(a => a.address).join(', '))}${field('ml-sub', 'Subject', M.d.subject || '')}
      <textarea id="ml-body" class="nt-text ml-body" aria-label="Message" placeholder="Write your message" data-no-i18n>${esc(M.d.text || '')}</textarea><p class="ml-note ml-count" id="ml-count" data-no-i18n>${(M.d.text || '').length} characters</p>${M.msg ? `<p class="nt-msg" role="status">${esc(M.msg)}</p>` : ''}
      <div class="nt-acts ml-sticky"><button class="nt-b go" data-ml="review"><span>Review and send</span></button><button class="nt-b" data-ml="save"><span>Save draft</span></button>${M.d.id ? '<button class="nt-b" data-ml="deldraft"><span>Delete draft</span></button>' : ''}</div></section>`;
    if (!M.sel) return `<section class="nt-ed panel ml-read"><p class="nt-empty">${M.msg ? esc(M.msg) : 'Select a message, or write a new one.'}</p></section>`;
    const m = M.sel;
    return `<section class="nt-ed panel ml-read"><div class="nt-bar"><button class="nt-b nt-backbtn" data-ml="back">${I('chevron-right', 16)}<span>Back</span></button><h3 class="nt-name ml-title" data-no-i18n>${esc(m.subject || '(no subject)')}</h3></div>
      <p class="ml-meta" data-no-i18n>${esc(who(m.from))} &lt;${esc(m.from.address)}&gt; \u00b7 ${esc(new Date(m.date).toLocaleString())}<br>To: ${esc((m.to || []).map(a => a.address).join(', '))}</p>
      <pre class="ml-text" data-no-i18n>${esc(M.text)}</pre>${M.msg ? `<p class="nt-msg" role="status">${esc(M.msg)}</p>` : ''}
      <div class="nt-acts"><button class="nt-b go" data-ml="reply"><span>Reply</span></button><button class="nt-b" data-ml="replyAll"><span>Reply all</span></button><button class="nt-b" data-ml="forward"><span>Forward</span></button><button class="nt-b" data-ml="${m.seen ? 'unread' : 'read'}"><span>${m.seen ? 'Mark unread' : 'Mark read'}</span></button></div></section>`;
  }
  function mailView() {
    if (M.accts === null) { void loadAccounts(); return `<div class="nx-view enter ml">${nsHead('Mail', 'Your own mail client, searchable offline.', 'Tabellae')}<div class="og-wrap">${ARTSKEL(3, 'Loading')}</div></div>`; }
    if (!M.accts.length || M.adding) return `<div class="nx-view enter ml">${nsHead('Mail', 'Your own mail client, searchable offline.', 'Tabellae')}<div class="og-wrap">${post(null, true)}${addForm()}</div></div>`;
    const a = M.accts.find(x => x.id === M.acc) || M.accts[0], last = a.lastSync ? `Synced ${dt(a.lastSync)}` : 'Not synced yet';
    if (M.tab === 'drafts' && !M.drafts) void loadDrafts();
    const list = M.tab === 'drafts' ? (M.drafts || []).map(d => `<button class="nt-note ml-msg${M.d && M.d.id === d.id ? ' on' : ''}" data-ml-draft="${esc(d.id)}"><b data-no-i18n>${esc((d.to || []).map(x => x.address).join(', ') || '(no recipient)')}</b><span class="ml-sub" data-no-i18n>${esc(d.subject || '(no subject)')}</span></button>`).join('') || '<p class="nt-empty">No drafts.</p>'
      : M.msgs.map(row).join('') + (M.more ? '<button class="nt-b" data-ml="more"><span>Older</span></button>' : '') || `<p class="nt-empty">${M.q || M.unread ? 'No mail matches.' : 'No mail yet. Press Sync.'}</p>`;
    return `<div class="nx-view enter ml">${nsHead('Mail', 'Your own mail client, searchable offline.', 'Tabellae')}
      ${post(a)}<div class="nt-wrap${M.open ? ' nt-open' : ''}"><aside class="nt-list panel">
        <div class="ml-acct"><span class="label" data-no-i18n>${esc(a.label || a.address)}</span>${M.accts.length > 1 ? M.accts.map(x => `<button class="nt-tag${x.id === a.id ? ' on' : ''}" data-ml-acc="${esc(x.id)}" data-no-i18n>${esc(x.label || x.address)}</button>`).join('') : ''}</div>
        <div class="ml-seg" role="group" aria-label="Mail view"><button class="nt-b${M.tab === 'inbox' ? ' go' : ''}" data-ml="inbox" aria-pressed="${M.tab === 'inbox'}"><span>Inbox</span></button><button class="nt-b${M.tab === 'drafts' ? ' go' : ''}" data-ml="drafts" aria-pressed="${M.tab === 'drafts'}"><span>Drafts</span></button></div>
        <input class="og-input" id="ml-q" type="search" placeholder="Search mail" aria-label="Search mail" value="${esc(M.q)}" autocomplete="off">
        <div class="nt-acts"><button class="nt-b go" data-ml="compose"><span>New message</span></button><button class="nt-b" data-ml="sync" ${M.busy ? 'disabled' : ''}><span>${M.busy === 'sync' ? 'Syncing\u2026' : 'Sync'}</span></button><button class="nt-b" data-ml="unread" aria-pressed="${M.unread}"><span>${M.unread ? 'Showing unread' : 'Unread only'}</span></button></div>
        <p class="ml-note" role="status">${last}${M.msg && M.tab === 'inbox' && !M.d ? ' \u00b7 ' + esc(M.msg) : ''}</p>
        <div class="nt-lb ml-list">${list}</div>
        <div class="ml-foot">${M.rm ? `<p class="ml-note">Forget the password and the local copy of this account. Mail on the provider's server is untouched.</p><div class="nt-acts"><button class="nt-b go" data-ml="rmgo"><span>Remove</span></button><button class="nt-b" data-ml="rmno"><span>Keep</span></button></div>` : `<button class="nt-b" data-ml="rm"><span>Remove account</span></button><button class="nt-b" data-ml="addx"><span>Add another account</span></button>`}</div>
      </aside>${reader()}</div></div>`;
  }
  register({ id: 'mail', views: { Mail: mailView }, owns: ['Mail'] });

  document.addEventListener('click', e => {
    const mb = e.target.closest('[data-ml-msg]'), dr = e.target.closest('[data-ml-draft]'), ac = e.target.closest('[data-ml-acc]'), b = e.target.closest('[data-ml]');
    if (mb) { e.preventDefault(); e.stopPropagation(); void openMsg(+mb.dataset.mlMsg); return; }
    if (dr) { e.preventDefault(); e.stopPropagation(); const d = (M.drafts || []).find(x => x.id === dr.dataset.mlDraft); if (d) { M.d = d; M.sel = null; M.plan = null; M.msg = ''; M.open = true; render(); } return; }
    if (ac) { e.preventDefault(); e.stopPropagation(); M.acc = ac.dataset.mlAcc; M.sel = null; void loadList(); return; }
    if (!b) return; e.preventDefault(); e.stopPropagation();
    const [k, v] = b.dataset.ml.split(':');
    if (k === 'isec') { M.f.imapSec = v; M.f.fill = { ...(M.f.fill || {}), ih: val('ml-ih'), ip: val('ml-ip'), sh: val('ml-sh'), sp: val('ml-sp') }; render(); }
    else if (k === 'ssec') { M.f.smtpSec = v; M.f.fill = { ...(M.f.fill || {}), ih: val('ml-ih'), ip: val('ml-ip'), sh: val('ml-sh'), sp: val('ml-sp') }; render(); }
    else if (k === 'test') void testConn(); else if (k === 'add') void addAccount(); else if (k === 'addx') { M.adding = !M.adding; M.msg = ''; render(); }
    else if (k === 'sync') void sync(); else if (k === 'more') void loadList(true);
    else if (k === 'unread' && !M.sel) { M.unread = !M.unread; void loadList(); } else if (k === 'unread') void flag(false); else if (k === 'read') void flag(true);
    else if (k === 'inbox') { M.tab = 'inbox'; M.d = null; M.plan = null; render(); } else if (k === 'drafts') { M.tab = 'drafts'; M.drafts = null; M.sel = null; M.d = null; M.plan = null; render(); }
    else if (k === 'compose') { M.d = { to: [], cc: [], subject: '', text: '' }; M.sel = null; M.plan = null; M.msg = ''; M.open = true; render(); }
    else if (k === 'reply' || k === 'replyAll' || k === 'forward') void fromMsg(k);
    else if (k === 'save') void saveDraft().then(() => render()); else if (k === 'review') void review(); else if (k === 'send') void send(); else if (k === 'cancelplan') void cancelPlan();
    else if (k === 'deldraft') void delDraft(M.d.id); else if (k === 'back') { M.open = false; M.plan = null; render(); }
    else if (k === 'rm') { M.rm = true; render(); } else if (k === 'rmno') { M.rm = false; render(); } else if (k === 'rmgo') void removeAccount();
  }, true);
  let t = 0;
  document.addEventListener('input', e => {
    if (!e.target) return;
    if (e.target.id === 'ml-body') { const c = document.getElementById('ml-count'); if (c) c.textContent = e.target.value.length + ' characters'; }
    if (e.target.id === 'ml-q') { M.q = e.target.value; clearTimeout(t); t = setTimeout(() => void loadList(), 300); }
  });
  document.addEventListener('keydown', e => { if (e.target && e.target.id === 'ml-body' && (e.ctrlKey || e.metaKey) && e.key === 'Enter') { e.preventDefault(); void review(); } });
  document.addEventListener('change', e => { if (e.target && e.target.id === 'ml-addr') void suggest(); });
})();
