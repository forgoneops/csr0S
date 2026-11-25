// Renders the tree from markdown.ts. No innerHTML anywhere: text is escaped by React.
import { Fragment, useMemo, useState } from "react";
import { parseMarkdown, type Block, type Inline } from "./markdown";
import { useStore } from "../store";
import { Icon } from "./Icon";

function Inlines({ nodes }: { nodes: Inline[] }) {
  return <>{nodes.map((n, i) => {
    if (n.t === "text") return <Fragment key={i}>{n.v}</Fragment>;
    if (n.t === "code") return <code key={i} className="md-code">{n.v}</code>;
    if (n.t === "strong") return <strong key={i}><Inlines nodes={n.c} /></strong>;
    if (n.t === "em") return <em key={i}><Inlines nodes={n.c} /></em>;
    return <a key={i} href={n.href} target="_blank" rel="noopener noreferrer nofollow"><Inlines nodes={n.c} /></a>;
  })}</>;
}

function CodeBlock({ lang, v }: { lang: string; v: string }) {
  const { t } = useStore();
  const [done, setDone] = useState(false);
  const copy = async () => { try { await navigator.clipboard.writeText(v); setDone(true); setTimeout(() => setDone(false), 1500); } catch { /* clipboard refused: nothing to do */ } };
  return (
    <figure className="md-fence">
      <figcaption className="md-fence-head">
        <span className="mono small">{lang || t("md.code")}</span>
        <button className="btn btn-quiet" style={{ minHeight: 44 }} onClick={() => void copy()} aria-label={t("md.copy")}>
          <Icon role={done ? "check" : "copy"} size={15} /> {done ? t("md.copied") : t("md.copy")}
        </button>
      </figcaption>
      <pre tabIndex={0}><code>{v}</code></pre>
    </figure>
  );
}

function Blocks({ blocks }: { blocks: Block[] }) {
  return <>{blocks.map((b, i) => {
    if (b.t === "p") return <p key={i}><Inlines nodes={b.c} /></p>;
    if (b.t === "h") return <p key={i} className={`md-h md-h${Math.min(b.level, 4)}`}><Inlines nodes={b.c} /></p>;
    if (b.t === "code") return <CodeBlock key={i} lang={b.lang} v={b.v} />;
    if (b.t === "hr") return <hr key={i} />;
    if (b.t === "quote") return <blockquote key={i}><Blocks blocks={b.c} /></blockquote>;
    if (b.t === "table") {
      const al = (k: number) => ({ textAlign: ({ l: "left", c: "center", r: "right" } as const)[b.align[k] ?? "l"] ?? "left" });
      return (
        <div key={i} className="md-table" tabIndex={0}>
          <table>
            <thead><tr>{b.head.map((h, k) => <th key={k} scope="col" style={al(k)}><Inlines nodes={h} /></th>)}</tr></thead>
            <tbody>{b.rows.map((r, j) => <tr key={j}>{r.map((c, k) => <td key={k} style={al(k)}><Inlines nodes={c} /></td>)}</tr>)}</tbody>
          </table>
        </div>
      );
    }
    const Tag = b.t;
    return <Tag key={i}>{b.items.map((it, j) => <li key={j}><Inlines nodes={it.c} />{it.sub.length > 0 && <Blocks blocks={it.sub} />}</li>)}</Tag>;
  })}</>;
}

export function Markdown({ text }: { text: string }) {
  const blocks = useMemo(() => parseMarkdown(text), [text]);
  return <div className="md"><Blocks blocks={blocks} /></div>;
}
