// Report a problem (R8): builds a plain text report of this install, shows ALL of it, and lets the person
// copy or save it. Nothing is sent anywhere; they decide where it goes. No chats, notes or keys are included.
import { useState } from "react";
import { useStore } from "../store";

export function ReportProblem() {
  const { t, settings } = useStore();
  const [note, setNote] = useState("");
  const [report, setReport] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const build = async () => {
    const [version, detect, hw, engines] = await Promise.all([
      fetch("/api/version").then((r) => r.json()).catch(() => ({})),
      fetch("/api/detect").then((r) => r.json()).catch(() => ({ engines: [] })),
      fetch("/api/hardware").then((r) => r.json()).catch(() => ({})),
      fetch("/api/engines").then((r) => r.json()).catch(() => ({ engines: [] })),
    ]) as [{ version?: string; build?: string }, { engines: { id: string; found: boolean; probe: { ok: boolean; version: string | null } }[] }, { machine?: Record<string, unknown> }, { engines: { id: string; health: { ok: boolean; detail: string | null } }[] }];
    setReport([
      `CaesarOS ${version.version ?? "?"} (build ${version.build ?? "?"})`,
      `Browser: ${navigator.userAgent}`,
      `Settings: theme=${settings.theme} language=${settings.language} motion=${settings.motion} engine=${settings.engine} brain=${settings.brain.location}`,
      `Machine: ${JSON.stringify(hw.machine ?? {})}`,
      "Tools found: " + detect.engines.map((e) => `${e.id}=${e.found ? (e.probe.ok ? `ok ${e.probe.version ?? ""}` : "not answering") : "absent"}`).join(", "),
      "Chat engines: " + engines.engines.map((e) => `${e.id}=${e.health.ok ? "ok" : e.health.detail ?? "down"}`).join(", "),
      "",
      "What happened:",
      note || "(describe it here)",
    ].join("\n"));
  };
  const copy = async () => { try { await navigator.clipboard.writeText(report ?? ""); setCopied(true); } catch { setCopied(false); } };
  const save = () => { const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([report ?? ""], { type: "text/plain" })); a.download = "caesaros-report.txt"; a.click(); URL.revokeObjectURL(a.href); };

  return (
    <>
      <p className="hint">{t("report.help")}</p>
      <textarea className="text-input" rows={3} value={note} aria-label={t("report.note")} placeholder={t("report.note")} onChange={(e) => setNote(e.target.value)} style={{ height: "auto", padding: "var(--sp3)" }} />
      <button className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => void build()}>{t("report.build")}</button>
      {report && (
        <>
          <textarea className="text-input mono small" rows={10} value={report} onChange={(e) => setReport(e.target.value)} aria-label={t("report.title")} style={{ height: "auto", padding: "var(--sp3)", textTransform: "none" }} />
          <div style={{ display: "flex", gap: "var(--sp3)", flexWrap: "wrap" }}>
            <button className="btn btn-secondary" style={{ minHeight: 44 }} onClick={() => void copy()}>{copied ? t("gw.copied") : t("report.copy")}</button>
            <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={save}>{t("report.save")}</button>
          </div>
          <p className="hint small">{t("report.safe")}</p>
        </>
      )}
    </>
  );
}
