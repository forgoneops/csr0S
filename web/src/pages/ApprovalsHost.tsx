// The approvals host. An approval is a card with APPROVE and NOT NOW. An approval tied to a conversation shows only in
// that conversation and is answered with that conversation's id, so a card from one chat cannot be answered as another.
// Nothing waiting renders nothing: no empty box. Answered cards stay as one quiet line in the conversation they belong to.
import { useCallback, useEffect, useState } from "react";
import { useStore } from "../store";
import { Icon } from "../ui/Icon";

export type Approval = { id: string; title: string; detail?: string; sessionId?: string };
type Settled = Approval & { decision: "approved" | "denied"; at: number };

export function useApprovals() {
  const { t } = useStore();
  const [pending, setPending] = useState<Approval[]>([]);
  const [record, setRecord] = useState<Settled[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [p, r] = await Promise.all([fetch("/api/approvals", { headers: { accept: "application/json" } }), fetch("/api/approvals/record", { headers: { accept: "application/json" } })]);
      if (p.ok) { const body = await p.json() as { pending?: Approval[] }; setPending(Array.isArray(body.pending) ? body.pending : []); }
      if (r.ok) { const body = await r.json() as { settled?: Settled[] }; setRecord(Array.isArray(body.settled) ? body.settled : []); }
    } catch { /* the next tick asks again; a failed read shows nothing, not a fake list */ }
  }, []);

  useEffect(() => {
    void load();
    const timer = setInterval(load, 4_000);
    return () => clearInterval(timer);
  }, [load]);

  const answer = async (a: Approval, decision: "approved" | "denied", sessionId: string | null) => {
    setBusy(a.id); setProblem(null);
    try {
      const r = await fetch(`/api/approvals/${encodeURIComponent(a.id)}/decision`, {
        method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ decision, sessionId: sessionId ?? undefined }),
      });
      if (!r.ok) setProblem(r.status === 409 ? t("approvals.wrong-session") : t("approvals.failed"));
    } catch { setProblem(t("approvals.failed")); }
    finally { setBusy(null); await load(); }
  };
  return { pending, record, busy, problem, answer };
}

/** One approval card. In a conversation it answers with that conversation's id; on Home an approval tied to a chat opens that chat instead. */
export function ApprovalCard({ a, sessionId, busy, onAnswer, onOpen }: {
  a: Approval; sessionId: string | null; busy: boolean;
  onAnswer: (d: "approved" | "denied") => void; onOpen?: () => void;
}) {
  const { t } = useStore();
  const away = !!a.sessionId && a.sessionId !== sessionId;      // tied to another conversation: answered there
  return (
    <li id={`approval-${a.id}`} className="approval-card">
      <div className="approval-top"><Icon role="alert" size={16} /><span className="mono small approval-scope">{a.sessionId ? t("approvals.this-chat") : t("approvals.system")}</span></div>
      <span className="row-title">{a.title}</span>
      {a.detail ? <span className="hint small">{a.detail}</span> : null}
      <div className="row-actions">
        {away ? (
          <button className="btn btn-secondary" onClick={onOpen}>{t("approvals.open-chat")} <Icon role="chevron-right" size={16} /></button>
        ) : (
          <>
            <button className="btn btn-secondary" disabled={busy} onClick={() => onAnswer("approved")}><Icon role="check" size={16} /> {t("approvals.approve")}</button>
            <button className="btn btn-quiet" disabled={busy} onClick={() => onAnswer("denied")}>{t("approvals.deny")}</button>
          </>
        )}
      </div>
    </li>
  );
}

/** The cards that belong in a conversation, at the end of its thread, plus one quiet line per answer given there. */
export function ApprovalsHost({ sessionId }: { sessionId: string | null }) {
  const { t } = useStore();
  const { pending, record, busy, problem, answer } = useApprovals();
  const mine = pending.filter((a) => !a.sessionId || a.sessionId === sessionId);
  const done = record.filter((r) => sessionId && r.sessionId === sessionId).slice(0, 3);
  if (mine.length === 0 && done.length === 0) return null;
  return (
    <section className="approvals-inline" aria-label={t("approvals.title")}>
      {done.length > 0 && (
        <ul className="approval-done">
          {done.map((r) => <li key={r.id} className={`mono small done-${r.decision}`}><Icon role={r.decision === "approved" ? "check" : "close"} size={14} /> {t(r.decision === "approved" ? "approvals.was-approved" : "approvals.was-denied")} · {r.title}</li>)}
        </ul>
      )}
      {mine.length > 0 && (
        <div className="approvals-strip frame"><div className="in">
          <div className="approvals-head"><span className="mono">{t("approvals.title")}</span><span className="state">{t("approvals.count", { n: mine.length })}</span></div>
          <ul className="approvals-list">
            {mine.map((a) => <ApprovalCard key={a.id} a={a} sessionId={sessionId} busy={busy === a.id} onAnswer={(d) => void answer(a, d, sessionId)} />)}
          </ul>
          {problem ? <p className="chat-error small" role="alert">{problem}</p> : null}
        </div></div>
      )}
    </section>
  );
}
