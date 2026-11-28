// Fish Audio as a second voice engine next to Piper. Voices are offered as "fish:<id>:<lang>" (Fish speaks both, so each is listed for pl and en); a sentence goes to Fish only when one of these is chosen.
// The key lives in data/keys/fish.key (Settings > Service keys). Only the sentence to be spoken is sent. Format and request shape follow Fish's /v1/tts as used by Agentic OS.
export type FishVoice = { id: string; lang: string; label: string };
export const TONES = ["calm", "happy", "excited", "confident", "empathetic", "curious", "surprised", "satisfied"] as const;
// Public voices from Fish's library (the same four Agentic OS ships). Cloned voices of your own are added by id later; a clone of a person needs that person's consent.
const CAST = [{ id: "80d5909c6f50429f93e48f8b488f0650", name: "Caesar" }, { id: "14129c3e320149449d6bada6862f7338", name: "Jarvis" }, { id: "bb0f42af4d93488fa8749dfc81995085", name: "Atlas" }, { id: "f8dfe9c83081432386f143e2fe9767ef", name: "Raven" }, { id: "e0e2468ce2d746c1b20a4414435f6f48", name: "Sage" }];

export const fishVoices = (): FishVoice[] => ["pl", "en"].flatMap((lang) => CAST.map((v) => ({ id: `fish:${v.id}:${lang}`, lang, label: `${v.name} · Fish (${lang.toUpperCase()})` })));
export const isFish = (voice?: string): voice is string => !!voice && /^fish:[a-f0-9]{16,64}:(pl|en)$/i.test(voice);

export async function fishSpeak(key: string, text: string, voice: string, tone?: string, post: typeof fetch = fetch): Promise<Uint8Array> {
  if (!isFish(voice)) throw new Error("no such voice");
  const t = text.trim(); if (!t || t.length > 600) throw new Error("send one sentence, up to 600 characters");
  const body = { text: ((TONES as readonly string[]).includes(tone ?? "") ? `(${tone}) ` : "") + t, reference_id: voice.split(":")[1], format: "wav", latency: "balanced" };
  const r = await post("https://api.fish.audio/v1/tts", { method: "POST", headers: { authorization: `Bearer ${key}`, "content-type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(30_000) });
  if (r.status === 401 || r.status === 402 || r.status === 403) throw new Error("Fish refused the key (or the account is out of credit)");
  if (!r.ok) throw new Error(`Fish answered ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

type Tts = { available(): boolean; voices(): { id: string; lang: string; label: string }[]; speak(text: string, voice?: string): Promise<Buffer>; shutdown(): void };
/** The Piper engine plus Fish: same interface, so the reader and the agent voices work with either. `getKey` is read per call, so a key set in Settings counts at once. */
export function withFish<T extends Tts>(piper: T, getKey: () => string | null, post: typeof fetch = fetch): T {
  return {
    ...piper,
    available: () => piper.available() || !!getKey(),
    voices: () => [...piper.voices(), ...(getKey() ? fishVoices() : [])],
    speak: async (text: string, voice?: string): Promise<Buffer> => {
      if (!isFish(voice)) return piper.speak(text, voice);
      const k = getKey(); if (!k) throw new Error("no Fish key: add it in Settings, Service keys");
      return Buffer.from(await fishSpeak(k, text, voice, undefined, post));
    },
  };
}
