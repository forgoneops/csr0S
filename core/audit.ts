// The audit ledger: what a private read or a refused read happened, and when. It never holds the data
// itself, only the claim about it. A private read that cannot be recorded is not served (503).
import { db } from "./db";

db.exec(`
  CREATE TABLE IF NOT EXISTS audit (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    at INTEGER NOT NULL,
    source TEXT NOT NULL,
    actor TEXT NOT NULL,
    subject_kind TEXT NOT NULL,
    subject_id TEXT NOT NULL,
    confidence TEXT NOT NULL,
    claim TEXT NOT NULL,
    ref TEXT
  );
`);

export type AuditRow = {
  source: "tool" | "ui" | "module";
  actor: string;
  subjectKind: string;
  subjectId: string;
  confidence: "seen" | "blocked" | "done";
  claim: string;
  ref?: string;
};

const insert = db.query("INSERT INTO audit (at, source, actor, subject_kind, subject_id, confidence, claim, ref) VALUES (?, ?, ?, ?, ?, ?, ?, ?)");

/** Write one row. Throws if the ledger cannot be written, so the caller can refuse to serve data. */
export function record(row: AuditRow) {
  insert.run(Date.now(), row.source, row.actor, row.subjectKind, row.subjectId, row.confidence, row.claim, row.ref ?? null);
}

/** Write one row, never throwing: for refusals, where the data is not served anyway. */
export function tryRecord(row: AuditRow) {
  try { record(row); } catch { /* a refusal is not worth failing over */ }
}

export function recent(limit = 50) {
  return db.query<{ at: number; actor: string; subject_kind: string; confidence: string; claim: string }, [number]>(
    "SELECT at, actor, subject_kind, confidence, claim FROM audit ORDER BY id DESC LIMIT ?",
  ).all(limit);
}
