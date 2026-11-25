// The SMTP side of sending, on nodemailer.
import nodemailer from "nodemailer";
import type { Transport } from "./mail-sender";
const loopback = (h: string) => h === "127.0.0.1" || h === "localhost" || h === "::1";
export const smtpTransport: Transport = async (a, pass, raw, env) => {
  const t = nodemailer.createTransport({ host: a.smtp.host, port: a.smtp.port, secure: a.smtp.secure, requireTLS: !!a.smtp.starttls, auth: { user: a.user, pass }, tls: { rejectUnauthorized: !(a.allowSelfSigned && loopback(a.smtp.host)) }, connectionTimeout: 20_000, socketTimeout: 60_000 });
  try { const r = await t.sendMail({ envelope: { from: env.from, to: env.to }, raw }); return { accepted: r.accepted.map(String), rejected: r.rejected.map(String), response: String(r.response ?? "") }; } finally { t.close(); }
};
