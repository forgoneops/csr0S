import { expect, test } from "bun:test";
import { describe as sky, shape } from "../core/weather";

test("the forecast answer becomes one small shape, and a strange answer becomes null", () => {
  const w = shape("Oslo, Norway", { current: { temperature_2m: 1.9, weather_code: 3, wind_speed_10m: 13 }, daily: { time: ["2026-11-23"], temperature_2m_min: [-1], temperature_2m_max: [3], weather_code: [61] } });
  expect(w).toEqual({ place: "Oslo, Norway", now: { temp: 1.9, wind: 13, sky: "Overcast" }, days: [{ date: "2026-11-23", min: -1, max: 3, sky: "Light rain" }] });
  expect(shape("x", {})).toBeNull(); expect(shape("x", null)).toBeNull();
  expect(sky(12345)).toBe("Unsettled");
});
