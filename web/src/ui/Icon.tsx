// An icon, by ROLE. The pack decides the drawing; a role the active pack does not define is shown as a
// visible fallback with the role in its title, never as a silent blank (DS0 icon contract, rule 3).
import { useStore } from "../store";

export function Icon({ role, size = 20, className }: { role: string; size?: number; className?: string }) {
  const { packs, settings, t } = useStore();
  const pack = packs.icons.find((p) => p.id === settings.iconPack) ?? packs.icons[0];
  const known = pack?.roles.includes(role);
  if (!known) {
    return (
      <svg className={`icon icon-missing ${className ?? ""}`} width={size} height={size} viewBox="0 0 24 24" role="img"
        aria-label={t("missing.icon", { role })}>
        <title>{t("missing.icon", { role })}</title>
        <rect x="3.5" y="3.5" width="17" height="17" />
        <path d="M8 12h8" />
      </svg>
    );
  }
  return (
    <svg className={`icon ${className ?? ""}`} width={size} height={size} aria-hidden="true" focusable="false">
      <use href={`#i-${role}`} />
    </svg>
  );
}
