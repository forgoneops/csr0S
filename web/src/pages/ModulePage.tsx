// A page a module asked for, but whose interface this build does not bundle. It says exactly that and
// keeps the server route address visible, so nobody wonders whether the module is broken (R45).
import { useState } from "react";
import { useStore } from "../store";
import { Icon } from "../ui/Icon";

export function ModulePage({ path, name }: { path: string; name: string }) {
  const { t, modules, go } = useStore();
  const [probe, setProbe] = useState<string | null>(null);
  const owner = modules.find((m) => m.nav.some((n) => path === n.path || path.startsWith(n.path + "/")));

  const check = async () => {
    if (!owner) return;
    try {
      const r = await fetch(`/api/p/${owner.id}`);
      setProbe(`${r.status} ${r.statusText}`);
    } catch (e) { setProbe((e as Error).message); }
  };

  return (
    <div className="page">
      <section className="empty-plate frame">
        <div className="in">
          <span className="proto-role" aria-hidden="true"><Icon role="skills" size={28} /></span>
          <h2 className="display">{t("modules.page.missing.title", { name })}</h2>
          <p>{t("modules.page.missing.body", { id: owner?.id ?? "?" })}</p>
          {owner && (
            <div className="row-actions">
              <button className="btn btn-secondary" onClick={check}>{t("common.retry")}</button>
              {probe && <span className="mono small">/api/p/{owner.id}/ → {probe}</span>}
            </div>
          )}
          <button className="btn btn-quiet" onClick={() => go("/modules")}>{t("nav.modules")} <Icon role="chevron-right" size={16} /></button>
        </div>
      </section>
    </div>
  );
}
