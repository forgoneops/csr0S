// Weather for a city the owner types: only the city name goes out, to the public Open-Meteo service (no account, no key),
// and only when he presses Look up. Nothing is stored and no location is read from the device.
import type { Context, Hono } from "hono";

const CODES: Record<number, string> = { 0: "Clear", 1: "Mostly clear", 2: "Partly cloudy", 3: "Overcast", 45: "Fog", 48: "Rime fog", 51: "Light drizzle", 53: "Drizzle", 55: "Heavy drizzle", 61: "Light rain", 63: "Rain", 65: "Heavy rain", 71: "Light snow", 73: "Snow", 75: "Heavy snow", 80: "Rain showers", 81: "Rain showers", 82: "Violent showers", 95: "Thunderstorm", 96: "Thunderstorm, hail", 99: "Thunderstorm, hail" };
export const describe = (code: number) => CODES[code] ?? "Unsettled";

export type Weather = { place: string; now: { temp: number; wind: number; sky: string }; days: { date: string; min: number; max: number; sky: string }[] };

/** The two Open-Meteo answers as one small shape. Null when the answers are not what we expect. */
export function shape(place: string, f: any): Weather | null {
  const c = f?.current, d = f?.daily;
  if (!c || !d || !Array.isArray(d.time) || typeof c.temperature_2m !== "number") return null;
  return { place, now: { temp: c.temperature_2m, wind: c.wind_speed_10m ?? 0, sky: describe(c.weather_code) }, days: d.time.map((t: string, i: number) => ({ date: t, min: d.temperature_2m_min[i], max: d.temperature_2m_max[i], sky: describe(d.weather_code[i]) })) };
}

async function get(url: string): Promise<any> { const r = await fetch(url, { signal: AbortSignal.timeout(8000) }); if (!r.ok) throw new Error(String(r.status)); return r.json(); }

export async function lookup(city: string): Promise<Weather | null> {
  const g = await get(`https://geocoding-api.open-meteo.com/v1/search?count=1&name=${encodeURIComponent(city)}`);
  const hit = g?.results?.[0]; if (!hit) return null;
  const f = await get(`https://api.open-meteo.com/v1/forecast?latitude=${hit.latitude}&longitude=${hit.longitude}&current=temperature_2m,weather_code,wind_speed_10m&daily=temperature_2m_max,temperature_2m_min,weather_code&timezone=auto&forecast_days=3`);
  return shape([hit.name, hit.country].filter(Boolean).join(", "), f);
}

export const weatherApi = (app: Hono, isOperator: (c: Context) => boolean) => app.get("/api/weather", async (c: Context) => {
  if (!isOperator(c)) return c.json({ error: "operator_only" }, 403);
  const city = (c.req.query("city") ?? "").trim().slice(0, 80);
  if (!city) return c.json({ error: "city_required" }, 400);
  try { const w = await lookup(city); return w ? c.json(w) : c.json({ error: "not_found" }, 404); } catch { return c.json({ error: "service_unreachable" }, 502); }
});
