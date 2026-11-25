// The model's reasoning, folded under its answer. Closed by default: the answer is what the person came for, the
// reasoning is there when they want it. A button with aria-expanded, never a native details element.
import { useState } from "react";
import { useStore } from "../store";
import { Icon } from "../ui/Icon";

export function ThinkingBlock({ text, live }: { text: string; live: boolean }) {
  const { t } = useStore();
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  return (
    <div className={`think ${open ? "open" : ""} ${live ? "live" : ""}`}>
      <button className="think-head" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
        <Icon role={open ? "chevron-down" : "chevron-right"} size={16} />
        <span className="mono">{live ? t("chat.thinking.live") : t("chat.thinking")}</span>
        <span className="mono think-count">{t("chat.thinking.words", { n: text.trim().split(/\s+/).length })}</span>
      </button>
      {open && <p className="think-body">{text}</p>}
    </div>
  );
}
