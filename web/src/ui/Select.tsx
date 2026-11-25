// CAESAR Select: a combobox button with a listbox, instead of the browser's own control. Keyboard per the ARIA
// authoring practices (arrows, Home/End, Enter and Space, Escape, type-ahead), 44 px options, closes on an outside press.
import { useEffect, useId, useRef, useState } from "react";
import { Icon } from "./Icon";
import { onKey, typeahead, type Option } from "./select-logic";

export function Select({ value, options, onChange, label, disabled, id }: {
  value: string; options: Option[]; onChange: (id: string) => void; label: string; disabled?: boolean; id?: string;
}) {
  const auto = useId();
  const listId = `${auto}-list`;
  const [open, setOpen] = useState(false);
  const selected = Math.max(0, options.findIndex((o) => o.id === value));
  const [active, setActive] = useState(selected);
  const root = useRef<HTMLDivElement | null>(null);
  const typed = useRef({ text: "", at: 0 });

  useEffect(() => { if (open) setActive(selected); }, [open, selected]);
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => { if (!root.current?.contains(e.target as Node)) setOpen(false); };
    addEventListener("pointerdown", away);
    return () => removeEventListener("pointerdown", away);
  }, [open]);
  useEffect(() => { if (open) document.getElementById(`${auto}-opt-${active}`)?.scrollIntoView({ block: "nearest" }); }, [open, active, auto]);

  const choose = (i: number) => { const o = options[i]; if (o && o.id !== value) onChange(o.id); setOpen(false); };

  const keydown = (e: React.KeyboardEvent) => {
    const r = onKey(e.key, open, active, options.length);
    if (r) {
      if (r.preventDefault) e.preventDefault();
      if (r.commit) choose(active);
      if (r.active !== undefined) setActive(r.active);
      if (r.open !== undefined) setOpen(r.open);
      return;
    }
    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {                 // type-ahead, buffer resets after a second
      const now = performance.now();
      typed.current = { text: (now - typed.current.at > 1000 ? "" : typed.current.text) + e.key, at: now };
      const i = typeahead(options, open ? active : selected, typed.current.text);
      if (open) setActive(i); else choose(i);
    }
  };

  return (
    <div className="select" ref={root}>
      <button id={id} type="button" role="combobox" className="select-btn" aria-label={label} aria-haspopup="listbox" aria-expanded={open}
        aria-controls={listId} aria-activedescendant={open ? `${auto}-opt-${active}` : undefined} disabled={disabled}
        onClick={() => setOpen((o) => !o)} onKeyDown={keydown}>
        <span className="select-value">{options[selected]?.label ?? ""}</span>
        <Icon role="chevron-down" size={15} />
      </button>
      {open && (
        <ul id={listId} role="listbox" aria-label={label} className="select-list">
          {options.map((o, i) => (
            <li key={o.id} id={`${auto}-opt-${i}`} role="option" aria-selected={o.id === value} className={`select-opt ${i === active ? "active" : ""}`}
              onPointerEnter={() => setActive(i)} onPointerDown={(e) => { e.preventDefault(); choose(i); }}>
              <span>{o.label}</span>{o.id === value && <Icon role="check" size={15} />}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
