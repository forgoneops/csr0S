/* The guided tour with the chibi Caesar (plan 8.8): a first-run companion that points at the real controls, in English and Polish, on desktop and
   phone. Skip any time (Esc too), come back to it from Settings > Help or the palette. A step with a target spotlights it when it is on screen;
   a step without one (or whose target is not visible, as in Simple mode or on a phone) is just the chibi talking. The card never blocks the page.
   Steps are shipped text in both languages, so the card is marked data-no-i18n and the translator never touches it. Behaviour ported from the old
   line's tour; the wording and the targets are the Atrium's own. */
(() => {
  if (typeof document === 'undefined' || !document.body || typeof MutationObserver === 'undefined') return;     // the module-registry test loads scripts in a stub
  const KEY = 'caesaros-tour';
  // [selectors that may hold the target, English title, English text, Polish title, Polish text]
  const STEPS = [
    ['', "Hi, I'm Caesar (the small one)", "I'll show you around in about two minutes: what you can do here and how it hangs together. Skip any time, and I'm back under Settings > Help whenever you want the tour again.", 'Cześć, tu Caesar (ten mały)', 'Oprowadzę cię w dwie minuty: co tu możesz zrobić i jak to wszystko się łączy. Możesz pominąć w każdej chwili, a ja wracam w Ustawieniach > Pomoc, kiedy zechcesz powtórzyć przewodnik.'],
    ['', 'What CaesarOS is', 'A control room for AI agents. Chats, a Brain of notes, a Board, a terminal and your crew live in one place, on your machine. Nothing leaves it without your yes.', 'Czym jest CaesarOS', 'Pokój dowodzenia dla agentów AI. Czaty, Brain z notatkami, Board, terminal i twoja załoga są w jednym miejscu, na twoim komputerze. Nic go nie opuszcza bez twojego tak.'],
    ['#rail', 'Your menu', 'Apps and conversations are here. On a phone it is the bar at the bottom.', 'Twoje menu', 'Tu są aplikacje i rozmowy. Na telefonie to pasek na dole.'],
    ['.shell-search', 'Find anything', 'Type a few letters (or press Ctrl K) to jump to an app, a note, a conversation or an action. The fastest way around.', 'Znajdź cokolwiek', 'Wpisz kilka liter (albo naciśnij Ctrl K), żeby przeskoczyć do aplikacji, notatki, rozmowy lub akcji. Najszybszy sposób poruszania się.'],
    ['.dock-toggle,.dock-grab', 'Talk to Caesar', 'The chat button opens a conversation from anywhere. Ask in your own words; short and concrete works best. Type @ for a crew member and / for commands.', 'Rozmowa z Caesarem', 'Przycisk czatu otwiera rozmowę z każdego miejsca. Pytaj własnymi słowami; krótko i konkretnie działa najlepiej. Wpisz @, żeby wybrać członka załogi, i / po polecenia.'],
    ['[data-app="Memory"]', 'Brain and notes', 'Your notes are plain files. Link them with [[Name]] and see the map and the tree. The more you write down, the better your agents know you.', 'Brain i notatki', 'Twoje notatki to zwykłe pliki. Łącz je przez [[Nazwa]] i oglądaj mapę oraz drzewo. Im więcej zapiszesz, tym lepiej agenci cię znają.'],
    ['[data-app="Board"]', 'The Board', 'A plan as cards. A card moves from To do to Done, and the drift list tells you when the plan and reality have come apart.', 'Board', 'Plan jako karty. Karta wędruje z Do zrobienia do Gotowe, a lista rozjazdów mówi, kiedy plan i rzeczywistość się rozeszły.'],
    ['[data-route-toggle]', 'Cloud or Local', 'Local only keeps every answer on this machine. Switch it whenever the topic is private.', 'Chmura albo Lokalnie', 'Tryb Lokalnie zostawia każdą odpowiedź na tym komputerze. Włącz go, gdy temat jest prywatny.'],
    ['.live-bar', 'What is running', 'The bar at the bottom shows turns running and what waits for your yes. Stop everything is one tap away.', 'Co działa', 'Pasek na dole pokazuje tury w toku i to, co czeka na twoje tak. Zatrzymanie wszystkiego jest o jedno dotknięcie dalej.'],
    ['[data-nx="term"]', 'The terminal', 'A real shell at the bottom. Hide it and it keeps running; End closes it and you can undo for ten seconds.', 'Terminal', 'Prawdziwa powłoka na dole. Ukryj ją, a będzie działać dalej; Zakończ zamyka ją i możesz cofnąć przez dziesięć sekund.'],
    ['', 'You stay in charge', 'Agents cannot post, send, buy or delete without asking. Local only, the approval cards and the ledger are yours. If something looks odd, press Stop.', 'To ty decydujesz', 'Agenci nie opublikują, nie wyślą, nie kupią ani nie usuną niczego bez pytania. Tryb Lokalnie, karty zatwierdzeń i dziennik są twoje. Jeśli coś wygląda dziwnie, naciśnij Stop.'],
    ['[data-app="Settings"]', 'Settings and sync', 'Look, language, engines, backup, and Devices: pair your phone and press Sync now to keep notes, tasks and chats in step.', 'Ustawienia i synchronizacja', 'Wygląd, język, silniki, kopie zapasowe i Urządzenia: sparuj telefon i naciśnij Synchronizuj teraz, żeby notatki, zadania i czaty były spójne.'],
    ['', "That's it for now", 'Start with one small thing you want done and tell Caesar. If you get lost, press Search and type what you want.', 'To na razie wszystko', 'Zacznij od jednej drobnej rzeczy i powiedz o niej Caesarowi. Jak się zgubisz, naciśnij Szukaj i wpisz, czego chcesz.'],
  ];
  const WORDS = { en: { skip: 'Skip', next: 'Next', back: 'Back', done: 'Done', of: (n, m) => `Step ${n} of ${m}`, aria: 'Guided tour' }, pl: { skip: 'Pomiń', next: 'Dalej', back: 'Wstecz', done: 'Gotowe', of: (n, m) => `Krok ${n} z ${m}`, aria: 'Przewodnik' } };
  let i = 0, host = null, timer = 0;
  const lang = () => (document.documentElement.lang === 'pl' ? 'pl' : 'en');
  const seen = () => { try { return localStorage.getItem(KEY) === 'done'; } catch { return true; } };
  const mark = () => { try { localStorage.setItem(KEY, 'done'); } catch { /* private window: it just shows again next time */ } };
  const visible = el => { if (!el) return false; const r = el.getBoundingClientRect(); return r.width > 4 && r.height > 4 && r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth; };
  const targetOf = sel => { for (const s of sel.split(',')) { if (!s) continue; const el = document.querySelector(s.trim()); if (visible(el)) return el; } return null; };

  function paint() {
    if (!host) return;
    const w = WORDS[lang()], s = STEPS[i], pl = lang() === 'pl', last = i === STEPS.length - 1, el = s[0] ? targetOf(s[0]) : null;
    const hl = host.querySelector('.tour-hl');
    if (el) { const r = el.getBoundingClientRect(); Object.assign(hl.style, { display: 'block', left: r.left - 6 + 'px', top: r.top - 6 + 'px', width: r.width + 12 + 'px', height: r.height + 12 + 'px' }); } else hl.style.display = 'none';
    host.querySelector('.tour-title').textContent = pl ? s[3] : s[1]; host.querySelector('.tour-text').textContent = pl ? s[4] : s[2];
    host.querySelector('.tour-step').textContent = w.of(i + 1, STEPS.length);
    host.querySelector('.tour-dots').innerHTML = STEPS.map((_, k) => `<i class="${k === i ? 'on' : k < i ? 'was' : ''}"></i>`).join('');
    const back = host.querySelector('[data-tour="back"]'), next = host.querySelector('[data-tour="next"]'), skip = host.querySelector('[data-tour="skip"]');
    back.textContent = w.back; back.hidden = i === 0; next.textContent = last ? w.done : w.next; skip.textContent = w.skip; skip.hidden = last;
    host.setAttribute('aria-label', w.aria);
  }
  function close() { clearInterval(timer); if (host) host.remove(); host = null; document.removeEventListener('keydown', keys, true); mark(); }
  function go(d) { i += d; if (i < 0) i = 0; if (i >= STEPS.length) return close(); paint(); const n = host && host.querySelector('[data-tour="next"]'); if (n) n.focus({ preventScroll: true }); }
  function keys(e) {
    if (!host) return;
    if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    else if (e.target && /^(INPUT|TEXTAREA)$/.test(e.target.tagName)) return;
    else if (e.key === 'ArrowRight') { e.preventDefault(); go(1); } else if (e.key === 'ArrowLeft') { e.preventDefault(); go(-1); }
  }
  function start(from = 0) {
    if (host) close();
    i = from; host = document.createElement('div'); host.id = 'tour'; host.setAttribute('role', 'dialog'); host.setAttribute('data-no-i18n', '');
    host.innerHTML = `<div class="tour-hl" aria-hidden="true"></div><div class="tour-card"><div class="su-chibi tour-chibi" aria-hidden="true"><img src="art/caesaros-chibi-guide.webp" alt="" width="132" height="132" decoding="async"></div>
      <div class="tour-body"><span class="label tour-step" aria-live="polite"></span><h3 class="tour-title"></h3><p class="tour-text"></p><div class="tour-dots" aria-hidden="true"></div>
      <div class="tour-acts"><button type="button" class="nt-b" data-tour="back"></button><button type="button" class="nt-b go" data-tour="next"></button><button type="button" class="nt-b" data-tour="skip"></button></div></div></div>`;
    document.body.appendChild(host); paint(); host.querySelector('[data-tour="next"]').focus({ preventScroll: true });
    host.addEventListener('click', e => { const b = e.target.closest('[data-tour]'); if (!b) return; if (b.dataset.tour === 'next') go(1); else if (b.dataset.tour === 'back') go(-1); else close(); });
    document.addEventListener('keydown', keys, true); timer = setInterval(paint, 600); addEventListener('resize', paint);
  }
  window.xTour = { start, seen };
  // first run: once, after the setup is finished, never in an automated browser (it would stand over every test) and never with ?notour
  let tries = 0;
  const auto = () => {
    if (seen() || navigator.webdriver || /[?&](notour|noboot|hud)\b/.test(location.search)) return;
    const s = window.SETTINGS;
    if (s && s.setupDone) { if (document.querySelector('.nx-body')) setTimeout(() => { if (!seen() && !host) start(); }, 1200); return; }
    if (++tries < 20) setTimeout(auto, 800);
  };
  setTimeout(auto, 1500);
})();
