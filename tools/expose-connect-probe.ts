// Use the app's own expose.connect() against the real VPS (defaultRunner runs real socat/systemd over SSH).
// Same function the Atrium UI calls — proving the in-app feature, not an ad-hoc shell tunnel.
import { createExpose } from "../core/expose.ts";

const host = process.env.VPS_HOST ?? "ubuntu@invalid";
const port = Number(process.env.EXPOSE_PORT || 4479);
const expose = createExpose();
const before = await expose.status();
console.log("STATUS_BEFORE", JSON.stringify({ host: before.host, sshOk: before.sshOk, socat: before.socatInstalled, localAddr: before.localAddr }, null, 2));
if (before.steps.length) console.log("STEPS_BEFORE", before.steps.map(s => `${s.ok ? "ok" : "NO"} ${s.label}: ${s.detail}`).join("\n"));

const r = await expose.connect({ host, port });
if ("error" in r) { console.error("CONNECT_ERROR", JSON.stringify(r)); process.exit(1); }
console.log("CONNECT_STEPS\n" + r.steps.map(s => `${s.ok ? "ok" : "NO"} ${s.label}: ${s.detail}`).join("\n"));

const after = await expose.status();
console.log("STATUS_AFTER", JSON.stringify({ host: after.host, sshOk: after.sshOk, socat: after.socatInstalled, unit: after.unitActive, listening: after.listening, health: after.health }, null, 2));
