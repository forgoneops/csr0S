import { useState } from "react";
import { useStore } from "../store";
import { Icon } from "../ui/Icon";

/** A module this build leaves out: visible, marked, never a dead click (R9). Tapping it says why, in words. */
export function LockedRow({ label }: { label: string }) {
  const { t } = useStore();
  const [say, setSay] = useState(false);
  return (
    <li>
      <button className="row locked" aria-expanded={say} onClick={() => setSay((v) => !v)}>
        <span className="row-icon"><Icon role="lock" size={19} /></span>
        <span className="row-text"><span className="row-title">{label}</span><span className="row-sub mono">{say ? t("locked.why") : t("locked.reason")}</span></span>
      </button>
    </li>
  );
}

