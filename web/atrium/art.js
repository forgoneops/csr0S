/* Art wiring: one minimal animated scene header per page, connector logos, and art for loading, empty and error states.
   The scene() function and its flicker live in index.html; this file only decides WHICH art a page gets.
   Colour: the art is tinted from the palette tokens (--p1/--p2) in og.css, never a baked hue. */
const ARTSCENES = new Set('atrium-hero board brain chat dream evidence fleet folders forge goals grill health herdr hermes-marketplace hermes-mirror ideas lair lectio library mail media meetings missions news offer-boards praetorium rations reels scheduling scriptorium skills social studio terminal tools updates usage venatio watchers weather webtools'.split(' '));
const ARTMAP = {
  Start: 'atrium-hero', 'Start here': 'atrium-hero', Home: 'atrium-hero', 'Mobile app': 'atrium-hero', Chat: 'chat', Crew: 'lair', 'Grill me': 'grill', Social: 'social',
  Board: 'board', 'Daily review': 'dream', Goals: 'goals', Mail: 'mail', Schedule: 'scheduling', Watchers: 'herdr', Weather: 'weather',
  Memory: 'brain', Notes: 'scriptorium', Search: 'brain', Meetings: 'meetings', Folders: 'folders', Reading: 'lectio', Library: 'library', 'Media Gallery': 'media', Editor: 'scriptorium', News: 'news',
  Missions: 'missions', Builds: 'forge', 'Horde desk': 'fleet', Command: 'praetorium', Business: 'usage', Evidence: 'evidence', Ideas: 'ideas', 'Tool graph': 'tools',
  'Image Studio': 'studio', Reels: 'reels', 'Web tools': 'webtools', 'Offer Boards': 'offer-boards', Leads: 'venatio', Mirror: 'hermes-mirror',
  Vault: 'library', Clipboard: 'folders', Devices: 'fleet', Integrations: 'hermes-marketplace', Models: 'forge', Engines: 'forge', Gateway: 'herdr', Marketplace: 'hermes-marketplace',
  Usage: 'rations', Cost: 'usage', Fleet: 'fleet', Health: 'health', Skills: 'skills', Terminal: 'terminal', Notifications: 'watchers', Updates: 'updates', Settings: 'forge', Computer: 'terminal'
};
/** The scene header for a page; `sc` is the page's own choice and wins when it names a real scene. The flicker varies per page, not per scene. */
function ARTHEAD(name, sc, h = 96) {
  const s = ARTSCENES.has(sc) ? sc : ARTMAP[name];
  if (!s || typeof scene !== 'function') return '';
  const i = [...String(name)].reduce((a, c) => a + c.charCodeAt(0), 0);
  return scene(s, h).replace(/--fx:[^;]*;--d:[^;]*;/, `--fx:${12 + (i * 7) % 70}%;--d:${(3.6 + (i % 9) * 0.6).toFixed(2)}s;`);
}
const ARTCONN = { Google: 'gmail', Obsidian: 'obsidian', Notion: 'notion', Linear: 'linear', GitHub: 'github', Spotify: 'spotify', Figma: 'figma', Trello: 'trello', Airtable: 'airtable', Dropbox: 'dropbox', Stripe: 'stripe', PayPal: 'paypal', Shopify: 'shopify', Zapier: 'zapier', YouTube: 'youtube', Ollama: 'ollama', Nextcloud: 'nextcloud', 'Home Assistant': 'homeassistant', Proton: 'protonmail', Wise: 'wise' };
/** A square connector logo tinted by the palette (mask, so no baked colour); empty when there is no logo for the name. */
const ARTLOGO = n => (ARTCONN[n] ? `<i class="ax-logo" aria-hidden="true" style="--m:url(art/connectors/${ARTCONN[n]}.svg)"></i>` : '');
/** Art for a state card: kind is loading, empty or error. Pixel-square art, tinted, with the text beside it. */
const ARTSTATE = (kind, title, text = '') => {
  const img = { loading: 'brain-gargoyle-ember', empty: 'colony-throne-wide-ember', error: 'brain-gargoyle-ember' }[kind] || 'brain-gargoyle-ember';
  const e = typeof OGE === 'function' ? OGE : String;
  return `<div class="og-card ax-state ${kind}" role="${kind === 'error' ? 'alert' : 'status'}"><span class="ax-art" aria-hidden="true" style="--m:url(art/${img}.webp)"></span><div><h4>${e(title)}</h4>${text ? `<p>${e(text)}</p>` : ''}</div></div>`;
};
