// Attachments in the composer: images and plain-text files, picked with the button, dropped on the thread or pasted.
// The limits match the core's (core/attachments.ts); the core checks again. Each file shows a preview before it is sent.
import { useCallback, useEffect, useRef, useState } from "react";
import { useStore } from "../store";
import { Icon } from "../ui/Icon";

export type Picked = { id: string; name: string; kind: "image" | "text"; mime: string; size: number; data: string; preview: string };
export type AttachmentMeta = { name: string; kind: "image" | "text"; mime: string; size: number };

export const LIMITS = { files: 4, image: 8 * 1024 * 1024, text: 1024 * 1024, total: 16 * 1024 * 1024 };
const IMAGE = /^image\/(png|jpeg|webp|gif)$/;
const TEXT_EXT = /\.(txt|md|markdown|csv|tsv|json|jsonl|yaml|yml|toml|xml|html|css|js|ts|tsx|jsx|py|rs|go|java|c|h|cpp|sh|sql|log|ini|conf)$/i;
export const ACCEPT = "image/png,image/jpeg,image/webp,image/gif,text/*,.md,.json,.csv,.yaml,.yml,.log,.py,.ts,.tsx,.js,.rs,.go,.sh,.sql";

export const sizeText = (n: number) => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);

const toBase64 = (f: File) => new Promise<string>((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(",")[1] ?? "");
  r.onerror = () => rej(r.error);
  r.readAsDataURL(f);
});

export function useAttachments() {
  const { t } = useStore();
  const [files, setFiles] = useState<Picked[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const urls = useRef<string[]>([]);
  useEffect(() => () => { urls.current.forEach(URL.revokeObjectURL); }, []);

  const add = useCallback(async (list: FileList | File[]) => {
    setProblem(null);
    const incoming = [...list];
    let have = files.length, total = files.reduce((n, f) => n + f.size, 0);
    const next: Picked[] = [];
    for (const f of incoming) {
      if (have >= LIMITS.files) { setProblem(t("attach.too-many", { n: LIMITS.files })); break; }
      const image = IMAGE.test(f.type), text = !image && (f.type.startsWith("text/") || f.type === "application/json" || TEXT_EXT.test(f.name));
      if (!image && !text) { setProblem(t("attach.unsupported", { name: f.name })); continue; }
      if (f.size > (image ? LIMITS.image : LIMITS.text)) { setProblem(t("attach.too-large", { name: f.name, max: sizeText(image ? LIMITS.image : LIMITS.text) })); continue; }
      if (total + f.size > LIMITS.total) { setProblem(t("attach.total")); break; }
      try {
        if (image) {
          const url = URL.createObjectURL(f); urls.current.push(url);
          next.push({ id: crypto.randomUUID(), name: f.name || "image", kind: "image", mime: f.type, size: f.size, data: await toBase64(f), preview: url });
        } else {
          const body = await f.text();
          if (body.includes("\u0000")) { setProblem(t("attach.unsupported", { name: f.name })); continue; }
          next.push({ id: crypto.randomUUID(), name: f.name, kind: "text", mime: f.type || "text/plain", size: f.size, data: body, preview: body.trim().slice(0, 90) });
        }
        have++; total += f.size;
      } catch { setProblem(t("attach.unreadable", { name: f.name })); }
    }
    if (next.length) setFiles((cur) => [...cur, ...next]);
  }, [files, t]);

  const remove = (id: string) => { setFiles((cur) => cur.filter((f) => f.id !== id)); setProblem(null); };
  const clear = () => setFiles([]);
  /** What the turn request carries: no preview, only what the core needs. */
  const payload = () => files.map(({ name, mime, data }) => ({ name, mime, data }));
  return { files, problem, add, remove, clear, payload };
}

export function AttachButton({ onPick, disabled }: { onPick: (l: FileList) => void; disabled?: boolean }) {
  const { t } = useStore();
  const input = useRef<HTMLInputElement | null>(null);
  return (
    <>
      <button className="btn btn-quiet" disabled={disabled} onClick={() => input.current?.click()} title={t("attach.help")}>
        <Icon role="attach" size={16} /> {t("attach.button")}
      </button>
      <input ref={input} type="file" multiple accept={ACCEPT} hidden aria-hidden="true" tabIndex={-1}
        onChange={(e) => { if (e.target.files?.length) onPick(e.target.files); e.target.value = ""; }} />
    </>
  );
}

export function AttachTray({ files, problem, onRemove }: { files: Picked[]; problem: string | null; onRemove: (id: string) => void }) {
  const { t } = useStore();
  if (!files.length && !problem) return null;
  return (
    <div className="attach-tray">
      {files.length > 0 && (
        <ul className="attach-list">
          {files.map((f) => (
            <li key={f.id} className="attach-chip">
              {f.kind === "image" ? <img src={f.preview} alt="" className="attach-thumb" /> : <span className="attach-doc"><Icon role="attach" size={18} /></span>}
              <span className="attach-text">
                <span className="attach-name">{f.name}</span>
                <span className="mono small attach-meta">{sizeText(f.size)}</span>
                {f.kind === "text" && f.preview ? <span className="hint small attach-peek">{f.preview}</span> : null}
              </span>
              <button className="icon-btn" aria-label={`${t("attach.remove")}: ${f.name}`} onClick={() => onRemove(f.id)}><Icon role="close" size={16} /></button>
            </li>
          ))}
        </ul>
      )}
      {problem ? <p className="chat-error small" role="alert">{problem}</p> : null}
    </div>
  );
}

export function SentFiles({ items }: { items: AttachmentMeta[] }) {
  if (!items.length) return null;
  return (
    <ul className="attach-sent">
      {items.map((a, i) => <li key={i} className="chip"><Icon role="attach" size={14} /><span className="mono small">{a.name} · {sizeText(a.size)}</span></li>)}
    </ul>
  );
}
