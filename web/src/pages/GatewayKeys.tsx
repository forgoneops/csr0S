// The local gateway card: the address other apps on this machine use, the keys that may call it, and a
// copy-ready example. A key is shown once, right after it is made; only its hash is kept.
import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store";

type Token = { name: string; at?: number };

export function GatewayKeys() {
  const { t } = useStore();
  const [list, setList] = useState<Token[] | null>(null);
  const [name, setName] = useState("");
  const [fresh, setFresh] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const load = useCallback(async () => setList(await (await fetch("/api/tokens")).json() as Token[]), []);
  useEffect(() => { void load(); }, [load]);
  const base = `http://127.0.0.1:${location.port || "4410"}/v1`;

  const make = async () => {
    setErr(null);
    const r = await fetch("/api/tokens", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ name }) });
    const j = await r.json() as { token?: string; error?: string };
    if (!r.ok || !j.token) { setErr(j.error ?? t("gw.fail")); return; }
    setFresh(j.token); setName(""); await load();
  };
  const revoke = async (n: string) => { await fetch(`/api/tokens/${encodeURIComponent(n)}`, { method: "DELETE" }); setFresh(null); await load(); };
  const example = `curl ${base}/chat/completions \\\n  -H "Authorization: Bearer ${fresh ?? "cae_..."}" \\\n  -H "Content-Type: application/json" \\\n  -d '{"model":"claude/default","messages":[{"role":"user","content":"Hello"}]}'`;
  const copy = async () => { try { await navigator.clipboard.writeText(example); setCopied(true); } catch { setCopied(false); } };

  return (
    <>
      <p className="hint">{t("gw.help")}</p>
      <p className="mono small meta">{t("gw.address")} <code>{base}</code></p>
      {list && list.length > 0 && (
        <ul className="rows">
          {list.map((k) => (
            <li key={k.name} className="row-card frame"><div className="in"><div className="row-main">
              <div className="row-text"><h3>{k.name}</h3></div>
              <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => void revoke(k.name)}>{t("gw.revoke")}</button>
            </div></div></li>
          ))}
        </ul>
      )}
      <div className="field-row">
        <label className="field-label mono" htmlFor="gw-name">{t("gw.name")}</label>
        <input id="gw-name" className="text-input" value={name} spellCheck={false} placeholder="my-editor" onChange={(e) => setName(e.target.value.toLowerCase())} />
        <button className="btn btn-secondary" style={{ minHeight: 44 }} disabled={name.length < 2} onClick={() => void make()}>{t("gw.make")}</button>
      </div>
      {err && <p className="mono small meta" role="alert">{err}</p>}
      {fresh && <p className="mono small meta" role="status">{t("gw.once")} <code>{fresh}</code></p>}
      <pre className="md-fence mono small" tabIndex={0} style={{ textTransform: "none", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{example}</pre>
      <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => void copy()}>{copied ? t("gw.copied") : t("gw.copy")}</button>
      <p className="hint small">{t("gw.safe")}</p>
    </>
  );
}
