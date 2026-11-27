/* The guided tour with the chibi Caesar (plan 8.8): a first-run companion that opens the real pages and points at the real controls, in English and
   Polish, on desktop and phone. Skip any time (Esc too), come back to it from Settings > Help or the palette. A step whose module is off points at
   that module's switch in Choose your tools; a target that cannot be found just leaves the chibi talking, so no step can trap anyone. The card never
   blocks the page and moves out of its target's way. Steps are shipped text in both languages, so the card is marked data-no-i18n and the translator
   never touches it. Behaviour ported from the old line's tour; the wording and the targets are the Atrium's own.
   tests/atrium-tour.test.ts walks every step in a real browser, so a renamed target fails there. */
(() => {
  if (typeof document === 'undefined' || !document.body || typeof MutationObserver === 'undefined') return;     // the module-registry test loads scripts in a stub
  const KEY = 'caesaros-tour';
  // [selectors that may hold the target (the first visible match wins), English title, English text, Polish title, Polish text,
  //  { page: the app the step opens ('home' is the Home workspace), mod: the optional module that page needs }]
  const STEPS = [
    ['.atrium-brand', "Hi, I'm Caesar (the small one)", "A short walk through CaesarOS. Skip any time with the button or Esc. To see it again, open Settings > Help.", 'Cześć, tu Caesar (ten mały)', 'Krótki spacer po CaesarOS. Możesz go pominąć w każdej chwili przyciskiem albo klawiszem Esc. Wrócisz do niego w Ustawieniach > Pomoc.', { page: 'home' }],
    ['.ph-head, .at-hero-copy', 'Home', 'Your starting page. It holds widgets such as Today, Quick capture, recent conversations and recent notes.', 'Strona główna', 'Twoja strona startowa. Są tu widżety, na przykład dzisiejszy przegląd, szybka notatka, ostatnie rozmowy i ostatnie notatki.', { page: 'home' }],
    ['.ph-ws, .ws-tabs', 'Six workspaces', 'Home, Planning, Knowledge, Business, System and Crew. Each one has its own board of widgets. Pick one to switch.', 'Sześć przestrzeni', 'Strona główna, Planowanie, Wiedza, Biznes, System i Załoga. Każda ma własną tablicę widżetów. Wybierz, żeby przełączyć.', { page: 'home' }],
    ['[data-nx="b-apps"], .ns-side', 'Your menu', 'Pages open from this menu, and More shows the other groups. On a phone, press Apps to open it.', 'Twoje menu', 'Z tego menu otwierasz strony, a Więcej pokazuje pozostałe grupy. Na telefonie naciśnij Aplikacje, żeby je otworzyć.', { page: 'home' }],
    ['.shell-search', 'Find anything', 'This button, or Ctrl K, opens search. Type to find pages, conversations, notes, board cards, documents and events.', 'Znajdź cokolwiek', 'Ten przycisk albo Ctrl K otwiera wyszukiwarkę. Pisz, żeby znaleźć strony, rozmowy, notatki, karty z tablicy, dokumenty i wydarzenia.', { page: 'home' }],
    ['.cdk-launch', 'Talk to Caesar', 'The Ask button, or Ctrl J, opens a small chat over any page. It keeps one conversation, and you can open it in a tab. Answers need a signed-in tool or a local model.', 'Rozmowa z Caesarem', 'Przycisk Pytaj albo Ctrl J otwiera mały czat nad każdą stroną. Trzyma jedną rozmowę, którą możesz otworzyć w karcie. Do odpowiedzi potrzebne jest zalogowane narzędzie albo model lokalny.', { page: 'home' }],
    ['[data-route-toggle]', 'Cloud or Local', 'Local keeps answers on this computer or your own network. Cloud also allows cloud engines.', 'Chmura albo Lokalnie', 'Tryb lokalny zostawia odpowiedzi na tym komputerze albo w twojej sieci. Tryb chmury dopuszcza też silniki w chmurze.', { page: 'home' }],
    ['.su-modules > h3', 'Choose your tools', 'These switches on the Start page turn optional tools on and off. Many start off, so turn on what you need.', 'Wybierz narzędzia', 'Te przełączniki na stronie Start włączają i wyłączają dodatkowe narzędzia. Wiele z nich jest na początku wyłączonych, więc włącz to, czego potrzebujesz.', { page: 'Start' }],
    ['#sk-q', 'Skills map', 'The skills found on this computer, as a map, a tree or cards. The page is read only. With no skills yet, it says so.', 'Mapa umiejętności', 'Umiejętności znalezione na tym komputerze jako mapa, drzewo albo karty. Strona służy tylko do odczytu. Jeśli nie ma jeszcze żadnych, powie o tym.', { page: 'Skills', mod: 'Skills' }],
    ['.lx-halls', 'Library', 'Keeps your documents on this computer, in three halls: Books, Documents and Presentations.', 'Biblioteka', 'Trzyma twoje dokumenty na tym komputerze, w trzech salach: książki, dokumenty i prezentacje.', { page: 'Library', mod: 'Library' }],
    ['.nt-acts', 'Brain: your notes', 'Notes are Markdown files on this computer. Link them with [[Name]] and add #tags. Map shows the links. Recall searches what you saved.', 'Brain: twoje notatki', 'Notatki to pliki Markdown na tym komputerze. Łącz je przez [[Nazwa]] i dodawaj #tagi. Mapa pokazuje połączenia, a Przywołaj przeszukuje to, co zapisane.', { page: 'Memory' }],
    ['#gw-root > .og-sec', 'Gateway', 'Other apps on this computer can use your engines through one address, each with its own key. Here you can also open CaesarOS from another device. On a new install, only this device can open it.', 'Gateway', 'Inne aplikacje na tym komputerze mogą używać twoich silników przez jeden adres, każda z własnym kluczem. Tu możesz też otworzyć CaesarOS z innego urządzenia. Po instalacji może go otworzyć tylko to urządzenie.', { page: 'Gateway' }],
    ['[data-st="open:help"]', 'Help lives here', 'Open Help in Settings to play this tour again, read the short guide or see the keyboard shortcuts.', 'Tu jest pomoc', 'Otwórz Pomoc w Ustawieniach, żeby powtórzyć przewodnik, przeczytać krótki opis albo zobaczyć skróty klawiszowe.', { page: 'Settings' }],
  ];
  // what a step says and points at when its module is switched off
  const offStep = (s) => [`label:has([data-su-module="${s[5].mod}"])`, s[1], `${s[5].mod} is switched off. This switch turns it on. You can leave it off and press Next.`, s[3], `Ten moduł (${s[3]}) jest wyłączony. Włączysz go tym przełącznikiem. Możesz też zostawić go wyłączonym i nacisnąć Dalej.`, { page: 'Start' }];
  const WORDS = { en: { skip: 'Skip', next: 'Next', back: 'Back', done: 'Done', of: (n, m) => `Step ${n} of ${m}`, aria: 'Guided tour' }, pl: { skip: 'Pomiń', next: 'Dalej', back: 'Wstecz', done: 'Gotowe', of: (n, m) => `Krok ${n} z ${m}`, aria: 'Przewodnik' } };
  let i = 0, host = null, timer = 0, cur = STEPS[0], shown = null, opener = null;
  const lang = () => (document.documentElement.lang === 'pl' ? 'pl' : 'en');
  const seen = () => { try { return localStorage.getItem(KEY) === 'done'; } catch { return true; } };
  const mark = () => { try { localStorage.setItem(KEY, 'done'); } catch { /* private window: it just shows again next time */ } };
  // laid out and not parked off to the side (a closed phone drawer); it may still need a vertical scroll
  const usable = el => { const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.right > 0 && r.left < innerWidth && getComputedStyle(el).visibility !== 'hidden'; };
  const targetOf = sel => { for (const s of sel.split(',')) { const el = [...document.querySelectorAll(s.trim())].find(usable); if (el) return el; } return null; };
  // scroll only the page's own scroller: scrollIntoView also shifts the clipped shell and pushes the top bar away
  function bring(el) {
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      if (p.scrollHeight <= p.clientHeight + 1 || !/auto|scroll/.test(getComputedStyle(p).overflowY)) continue;
      const r = el.getBoundingClientRect(), box = p.getBoundingClientRect();
      if (r.top < box.top || r.bottom > box.top + box.height / 3) p.scrollTop += r.top - box.top - 24;
      return;
    }
  }
  // the card keeps its corner unless that covers the target; then it takes the first corner that does not
  function place(card, r) {
    const spots = [{}, { top: '8px', bottom: 'auto' }, { left: '12px', right: 'auto' }, { top: '8px', bottom: 'auto', left: '12px', right: 'auto' }];
    for (const spot of spots) {
      Object.assign(card.style, { top: '', bottom: '', left: '', right: '' }, spot);
      const c = card.getBoundingClientRect();
      if (!r || c.right <= r.left - 6 || c.left >= r.right + 6 || c.bottom <= r.top - 6 || c.top >= r.bottom + 6) return;
    }
  }
  const set = (el, text) => { if (el.textContent !== text) el.textContent = text; };   // unchanged text must not be announced again

  function paint() {
    if (!host) return;
    const w = WORDS[lang()], s = cur, pl = lang() === 'pl', last = i === STEPS.length - 1, q = sel => host.querySelector(sel);
    set(q('.tour-title'), pl ? s[3] : s[1]); set(q('.tour-text'), pl ? s[4] : s[2]); set(q('.tour-step'), w.of(i + 1, STEPS.length));
    const dots = STEPS.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'was' : ''}"></i>`).join('');
    if (q('.tour-dots').dataset.tourDots !== String(i)) { q('.tour-dots').dataset.tourDots = i; q('.tour-dots').innerHTML = dots; }
    const back = q('[data-tour="back"]');
    set(back, w.back); back.hidden = i === 0; set(q('[data-tour="next"]'), last ? w.done : w.next); set(q('[data-tour="skip"]'), w.skip);
    host.setAttribute('aria-label', w.aria);
    const el = targetOf(s[0]), hl = q('.tour-hl');
    if (el && el !== shown) { shown = el; bring(el); }
    const r = el && el.getBoundingClientRect();
    if (r) Object.assign(hl.style, { display: 'block', left: r.left - 6 + 'px', top: r.top - 6 + 'px', width: r.width + 12 + 'px', height: r.height + 12 + 'px' }); else hl.style.display = 'none';
    host.dataset.tourHit = el ? s[0] : '';
    place(q('.tour-card'), r);
    // a page render can drop focus to the body; a person who clicked into the page keeps their place
    if (document.activeElement === document.body) q('[data-tour="next"]').focus({ preventScroll: true });
  }
  // open the step's page the way the menu does; a module that is off is never opened, its switch is shown instead
  function enter() {
    const s = STEPS[i];
    cur = s[5].mod && !ogEnabled(s[5].mod) ? offStep(s) : s;
    const page = cur[5].page, tab = S.tabs[S.act];
    closeRail();
    if (page === 'home') { if (!tab || tab.k !== 'ws' || S.ws !== 0) { open_({ k: 'ws' }); S.ws = 0; render(); } }
    else if (!tab || tab.id !== page) { open_({ k: 'app', id: page }); render(); }
    shown = null; host.dataset.tourAt = i; host.dataset.tourOn = page; paint();
    host.querySelector('[data-tour="next"]').focus({ preventScroll: true });
  }
  function close() {
    if (!host) return;
    clearInterval(timer); host.remove(); host = null; document.removeEventListener('keydown', keys, true); removeEventListener('resize', paint); mark();
    if (opener && opener.isConnected) opener.focus({ preventScroll: true });
  }
  function go(d) {
    if (i + d >= STEPS.length) { close(); open_({ k: 'ws' }); render(); return; }
    i = Math.max(0, i + d); enter();
  }
  function keys(e) {
    if (!host) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.target !== document.body && !host.contains(e.target)) return;      // the person is working in the page
    else if (e.key === 'Tab') { e.preventDefault(); const b = [...host.querySelectorAll('button:not([hidden])')]; b[(b.indexOf(document.activeElement) + (e.shiftKey ? b.length - 1 : 1)) % b.length].focus(); }
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  }
  function start(from = 0) {
    close();
    opener = document.activeElement;
    i = from; host = document.createElement('div'); host.id = 'tour'; host.setAttribute('role', 'dialog'); host.setAttribute('aria-describedby', 'tour-text'); host.setAttribute('data-no-i18n', '');
    host.innerHTML = `<div class="tour-hl" aria-hidden="true"></div><div class="tour-card"><div class="su-chibi tour-chibi" aria-hidden="true"><img src="art/caesaros-chibi-guide.webp" alt="" width="132" height="132" decoding="async"></div>
      <div class="tour-body"><div class="tour-say" aria-live="polite"><span class="label tour-step"></span><h3 class="tour-title"></h3><p class="tour-text" id="tour-text"></p></div><div class="tour-dots" aria-hidden="true"></div>
      <div class="tour-acts"><button type="button" class="nt-b" data-tour="back"></button><button type="button" class="nt-b go" data-tour="next"></button><button type="button" class="nt-b" data-tour="skip"></button></div></div></div>`;
    document.body.appendChild(host);
    host.addEventListener('click', e => { const b = e.target.closest('[data-tour]'); if (!b) return; if (b.dataset.tour === 'next') go(1); else if (b.dataset.tour === 'back') go(-1); else close(); });
    document.addEventListener('keydown', keys, true); timer = setInterval(paint, 300); addEventListener('resize', paint);
    enter();
  }
  window.xTour = { start, seen, steps: STEPS };
  // first run: once, after the setup is finished, never in an automated browser (it would stand over every test) and never with ?notour
  let tries = 0;
  const auto = () => {
    if (seen() || navigator.webdriver || /[?&](notour|noboot|hud)\b/.test(location.search)) return;
    const s = window.SETTINGS;
    if (s && s.setupDone) { if (document.querySelector('.nx-body')) setTimeout(() => { if (!seen() && !host) start(); }, 1200); return; }
    if (++tries < 20) setTimeout(auto, 800);
  };
  setTimeout(auto, 1500);
  // the first run usually spends longer on Start than auto() waits, so Finish starts the tour too
  document.addEventListener('click', e => {
    if (e.target.closest && e.target.closest('[data-su="finish"]') && !seen() && !navigator.webdriver && !/[?&](notour|noboot|hud)\b/.test(location.search)) setTimeout(() => { if (!seen() && !host) start(); }, 1200);
  }, true);
})();
