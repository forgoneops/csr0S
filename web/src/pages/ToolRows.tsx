// Tool calls in a reply: one call is one row, folded, with its state, its time and, when the call needed a yes, a
// link to that approval. The rows read what the engine reported; nothing here runs a tool.
import { useState } from "react";
import { useStore } from "../store";
import { Icon } from "../ui/Icon";

export type ToolCall = { id: string; name: string; status: "running" | "waiting" | "ok" | "error"; input?: string; output?: string; ms?: number; approvalId?: string };

const took = (ms: number) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);

function Row({ c }: { c: ToolCall }) {
  const { t } = useStore();
  const [open, setOpen] = useState(false);
  return (
    <li className={`tool tool-${c.status}`}>
      <button className="tool-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon role={open ? "chevron-down" : "chevron-right"} size={16} />
        <span className="tool-name mono">{c.name}</span>
        <span className={`tool-state mono tool-state-${c.status}`}>{t(`chat.tool.${c.status}`)}</span>
        {c.ms !== undefined && <span className="tool-ms mono">{took(c.ms)}</span>}
      </button>
      {c.status === "waiting" && c.approvalId && (
        <a className="tool-link mono" href={`#approval-${c.approvalId}`}>{t("chat.tool.approval")}</a>
      )}
      {open && (
        <div className="tool-body">
          {c.input !== undefined && <><span className="mono small">{t("chat.tool.input")}</span><pre tabIndex={0}>{c.input}</pre></>}
          {c.output !== undefined && <><span className="mono small">{t("chat.tool.output")}</span><pre tabIndex={0}>{c.output}</pre></>}
          {c.input === undefined && c.output === undefined && <p className="hint small">{t("chat.tool.nothing")}</p>}
        </div>
      )}
    </li>
  );
}

export function ToolRows({ calls }: { calls: ToolCall[] }) {
  if (calls.length === 0) return null;
  return <ul className="tools" aria-label="Tools">{calls.map((c) => <Row key={c.id} c={c} />)}</ul>;
}
