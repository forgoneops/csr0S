/* The keyboard shortcut sheet: one catalogue of every binding in the Atrium, opened with ? or from Settings > Help.
   tests/shortcuts.test.ts holds the catalogue against the key handling in the sources: add, change or remove a
   binding and the suite fails until this list says the same. */
(() => {
  // [group title, [[id, keys, what it does]]]; in keys, "+" is held together, " / " is either one
  const KEYS = [
    ['Everywhere', [
      ['sheet', '?', 'Show or hide this sheet (outside text fields)'],
      ['palette', 'Ctrl+K / ⌘+K', 'Find anything'],
      ['dock', 'Ctrl+J / ⌘+J', 'Quick ask: open or minimise'],
      ['terminal', 'Ctrl+`', 'Show or hide the terminal'],
      ['pin', 'Ctrl+B', 'Keep the left menu open'],
      ['tab', 'Alt+1 to 9', 'Switch to that open tab'],
      ['workspace', 'Alt+1 / Alt+2', 'First workspace / next workspace'],
      ['close', 'Esc', 'Close menus and pop-ups'],
    ]],
    ['Find anything and dialogs', [
      ['palette-move', '↑ / ↓', 'Move through results'],
      ['palette-run', 'Enter', 'Run the selected result'],
      ['palette-trap', 'Tab / Shift+Tab', 'Move around inside the open dialog (Esc closes it)'],
    ]],
    ['Chat message box', [
      ['send', 'Enter', 'Send'],
      ['newline', 'Shift+Enter', 'New line'],
      ['recall', '↑ / ↓', 'Bring back what you sent in this conversation'],
      ['suggest', '↑ / ↓, Enter / Tab, Esc', 'Suggestion list: move, pick, close'],
    ]],
    ['Quick ask window', [
      ['dock-send', 'Enter', 'Send (Shift+Enter for a new line)'],
      ['dock-close', 'Esc', 'Minimise'],
      ['dock-size', '↑ ↓ ← →', 'Resize from a focused edge (Shift for bigger steps)'],
    ]],
    ['Voice', [
      ['talk', 'Alt+Space', 'Hold to talk, release to send'],
      ['voice-mode', 'Alt+V', 'Voice mode on or off'],
      ['voice-cancel', 'Esc', 'Cancel the recording'],
    ]],
    ['Brain', [
      ['note-save', 'Ctrl+S / ⌘+S', 'Save the open note'],
      ['note-node', 'Enter / Space', 'Open the focused point on the map'],
      ['note-find', 'Enter', 'Find in the map: jump to a match'],
      ['map-view', '↑ ↓ ← →, Plus / Minus, 0', 'Focused map: move, zoom, fit'],
    ]],
    ['Library', [
      ['shelf', '← / →, Enter', 'Focused shelf: choose a deck, open it'],
      ['pages', '← / →, Page Up / Page Down', 'Turn pages'],
      ['lib-close', 'Esc', 'Skip the opening, leave presentation, close'],
    ]],
    ['Schedule, mail and media', [
      ['cal-day', '↑ ↓ ← →', 'Calendar: from a focused day, move by a day or a week'],
      ['date-pick', '↑ ↓ ← → PgUp PgDn Esc', 'Date picker: move by a day or a week, by a month, or close it'],
      ['mail-review', 'Ctrl+Enter / ⌘+Enter', 'Letter text: review before sending'],
      ['media-view', '← / →, Esc', 'Media viewer: previous, next, close'],
    ]],
    ['Other screens', [
      ['bell-close', 'Esc', 'Notifications panel: close'],
      ['crew-close', 'Esc', 'Crew: close the open sheet'],
      ['search-enter', 'Enter', 'Search page: run the search'],
      ['switch', 'Enter / Space', 'Flip the focused switch'],
      ['skill-close', 'Esc', 'Skills: close the open skill'],
      ['tools-close', 'Esc', 'Close the tool picker'],
      ['hall', 'Esc, Tab', 'Hall of Fame card: close, move inside it'],
      ['hall-move', '← / →, Home / End', 'Hall of Fame: from a focused keeper, previous or next, first or last'],
      ['tour', '← / →, Esc, Tab', 'Guided tour: back, next, skip, move on the card'],
      ['hud', 'Enter, Esc', 'Heads-up window: send, close'],
    ]],
  ];
  window.xKeys = { list: KEYS };
  if (typeof document === 'undefined' || !document.body || typeof MutationObserver === 'undefined') return;   // the module-registry test loads scripts in a stub

  const cap = k => `<kbd>${esc(k)}</kbd>`;
  const combo = s => s.split(', ').map(g => g.split(' / ').map(c => c.split('+').map(cap).join('+')).join(' / ')).join(', ');
  let dlg = null;
  function build() {
    dlg = document.createElement('dialog'); dlg.className = 'keys-dlg'; dlg.setAttribute('aria-labelledby', 'keys-title');
    dlg.innerHTML = `<div class="keys-box"><header><h2 id="keys-title">Keyboard shortcuts</h2><button type="button" class="su-btn" data-keys-close autofocus>Close</button></header>
      <div class="keys-body" tabindex="0" role="region" aria-label="Shortcut list">${KEYS.map(([g, rows]) => `<section><h3>${esc(g)}</h3><dl>${rows.map(([, k, what]) => `<div><dt>${combo(k)}</dt><dd>${esc(what)}</dd></div>`).join('')}</dl></section>`).join('')}</div></div>`;
    // keys pressed inside the sheet stay here; Esc is the dialog's own close and still works
    dlg.addEventListener('keydown', e => { e.stopPropagation(); if (e.key === '?') { e.preventDefault(); dlg.close(); } });
    dlg.addEventListener('click', e => { if (e.target === dlg || e.target.closest('[data-keys-close]')) dlg.close(); });
    document.body.appendChild(dlg);
  }
  const open = () => { if (!dlg) build(); if (!dlg.open) dlg.showModal(); };
  window.xKeys.open = open;
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('[data-keys-open]')) open(); });
  document.addEventListener('keydown', e => {
    if (e.key !== '?' || e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return;
    if (e.target.closest && e.target.closest('input,textarea,select,[contenteditable]:not([contenteditable="false"])')) return;
    e.preventDefault(); open();
  });
})();
