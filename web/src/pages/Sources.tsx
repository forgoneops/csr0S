// The passages a reply was given from the person's own knowledge, numbered as the model cites them. Folded, closed by default.
import { useState } from "react";
import { useStore } from "../store";
import { Icon } from "../ui/Icon";

export type Source = { n: number; docId: string; name: string; passage: string };

export function Sources({ items }: { items: Source[] }) {
  const { t } = useStore();
  const [open, setOpen] = useState(false);
  return (
    <div className={`think sources ${open ? "open" : ""}`}>
      <button className="think-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon role={open ? "chevron-down" : "chevron-right"} size={16} />
        <span className="mono">{t("chat.sources")}</span>
        <span className="mono think-count">{items.length}</span>
      </button>
      {open && (
        <ol className="source-list">
          {items.map((x) => (
            <li key={x.n}><span className="mono small">[{x.n}] {x.name}</span><span className="hint small">{x.passage}</span></li>
          ))}
        </ol>
      )}
    </div>
  );
}
