// Applying packs to the document. This is the ONLY place that touches a theme stylesheet, a font
// file or an icon sprite; components ask for a role or a token and never for a file (R46).
import { useEffect } from "react";
import { useStore, type FontPack, type IconPack, type Palette, type ThemePack } from "./store";

export function applyTheme(theme: ThemePack | undefined) {
  const html = document.documentElement;
  if (!theme) return;
  html.dataset.theme = theme.id;
  const link = (document.getElementById("theme-pack") as HTMLLinkElement | null) ?? document.createElement("link");
  link.id = "theme-pack";
  link.rel = "stylesheet";
  if (link.getAttribute("href") !== theme.url) link.href = theme.url;
  if (!link.isConnected) document.head.append(link);
  // The system bar follows the theme's own background once its stylesheet is in (the static value covers the first paint).
  link.addEventListener("load", () => {
    const bg = getComputedStyle(html).getPropertyValue("--bg").trim();
    if (bg) document.querySelector('meta[name="theme-color"]')?.setAttribute("content", bg);
  }, { once: true });
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16)).join(",");

/** A palette is two colours; they reach the theme as custom properties (--p1, --p2 and their rgb triplets), so adding one
 *  is data in the theme's manifest and no stylesheet changes. A theme without palettes gets nothing set. */
export function applyPalette(theme: ThemePack | undefined, id: string) {
  const html = document.documentElement;
  const palette: Palette | undefined = theme?.palettes?.find((p) => p.id === id) ?? theme?.palettes?.[0];
  for (const v of ["--p1", "--p2", "--p1r", "--p2r"]) html.style.removeProperty(v);
  if (!palette) { delete html.dataset.pal; return; }
  html.dataset.pal = palette.id;
  html.style.setProperty("--p1", palette.p1); html.style.setProperty("--p1r", rgb(palette.p1));
  html.style.setProperty("--p2", palette.p2); html.style.setProperty("--p2r", rgb(palette.p2));
}

/** Standard Google subset ranges. A face that names its subset only downloads when a page uses a character in that range,
 *  so the Latin-extended file (Polish, Czech, ...) is not fetched for plain English text. */
export const SUBSET_RANGE: Record<"latin" | "latin-ext", string> = {
  "latin": "U+0000-00FF,U+0131,U+0152-0153,U+02BB-02BC,U+02C6,U+02DA,U+02DC,U+0304,U+0308,U+0329,U+2000-206F,U+20AC,U+2122,U+2191,U+2193,U+2212,U+2215,U+FEFF,U+FFFD",
  "latin-ext": "U+0100-02BA,U+02BD-02C5,U+02C7-02CC,U+02CE-02D7,U+02DD-02FF,U+0304,U+0308,U+0329,U+1D00-1DBF,U+1E00-1E9F,U+1EF2-1EFF,U+2020,U+20A0-20AB,U+20AD-20C0,U+2113,U+2C60-2C7F,U+A720-A7FF",
};

/** The @font-face rules of a font pack, as one stylesheet text. */
export function fontFaceCss(pack: FontPack): string {
  return pack.faces.filter((face) => face.url).map((face) =>
    `@font-face{font-family:${JSON.stringify(face.family)};font-style:${face.style};font-weight:${face.weight};font-display:swap;src:url(${face.url}) format("woff2")${face.subset ? `;unicode-range:${SUBSET_RANGE[face.subset]}` : ""}}`,
  ).join("\n");
}

export function applyFonts(pack: FontPack | undefined) {
  if (!pack) return;
  const html = document.documentElement;
  const { families: f, fallbacks: fb } = pack;
  html.style.setProperty("--f-display", `${JSON.stringify(f.display)},${fb.display}`);
  html.style.setProperty("--f-body", `${JSON.stringify(f.body)},${fb.body}`);
  html.style.setProperty("--f-mono", `${JSON.stringify(f.mono)},${fb.mono}`);
  let style = document.getElementById("font-pack") as HTMLStyleElement | null;
  if (!style) { style = document.createElement("style"); style.id = "font-pack"; document.head.append(style); }
  style.textContent = fontFaceCss(pack);
}

export function applyMotion(mode: "full" | "off") {
  document.documentElement.dataset.motion = mode;
}

/** Load the icon pack once and keep it in the document as a hidden sprite; every Icon is a <use>. */
export function loadSprite(pack: IconPack): Promise<string> {
  const holder = document.getElementById("icon-pack");
  if (holder?.dataset.pack === pack.id) return Promise.resolve(pack.id);
  return fetch(pack.url).then((r) => r.text()).then((svg) => {
    const host = holder ?? document.createElement("div");
    host.id = "icon-pack";
    host.dataset.pack = pack.id;
    host.setAttribute("aria-hidden", "true");
    host.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    host.innerHTML = svg;
    if (!host.isConnected) document.body.prepend(host);
    return pack.id;
  });
}

/** Wires settings to the document: theme, fonts, motion, language, text size. */
export function useApplyPacks() {
  const { settings, packs } = useStore();
  const theme = packs.themes.find((p) => p.id === settings.theme);
  const fonts = packs.fonts.find((p) => p.id === settings.fontPack);
  const icons = packs.icons.find((p) => p.id === settings.iconPack);

  useEffect(() => { applyTheme(theme); }, [theme]);
  useEffect(() => { applyPalette(theme, settings.palette); }, [theme, settings.palette]);
  useEffect(() => { applyFonts(fonts); }, [fonts]);
  useEffect(() => { applyMotion(settings.motion); }, [settings.motion]);
  useEffect(() => { if (icons) void loadSprite(icons); }, [icons]);
  useEffect(() => {
    document.documentElement.lang = settings.language;
    document.documentElement.style.fontSize = `${16 * settings.textScale}px`;
  }, [settings.language, settings.textScale]);
}
