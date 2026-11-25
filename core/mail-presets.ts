// A provider's mail settings from an address: well-known presets first, then an honest guess. The connection test confirms either.
export type Endpoint = { host: string; port: number; secure: boolean; starttls?: boolean };
export type Help = { steps: string[]; link?: { label: string; url: string } };
export type Suggestion = { source: "preset" | "autoconfig" | "guess"; label: string; imap: Endpoint; smtp: Endpoint; note: string; selfSigned?: boolean; savesSent?: boolean; help?: Help };

const SSL = (host: string, port = 993): Endpoint => ({ host, port, secure: true });
const TLS = (host: string, port: number): Endpoint => ({ host, port, secure: false, starttls: true });
const P = (label: string, imap: Endpoint, smtp: Endpoint, note = "", selfSigned = false, savesSent = false): Suggestion => ({ source: "preset", label, imap, smtp, note, selfSigned, savesSent });

const PRESETS: Record<string, Suggestion> = {
  "gmail.com": P("Gmail", SSL("imap.gmail.com"), SSL("smtp.gmail.com", 465), "Use an app password (Google account, 2-step verification on). Your normal password will not work.", false, true),
  "icloud.com": P("iCloud Mail", SSL("imap.mail.me.com"), TLS("smtp.mail.me.com", 587), "Use an app-specific password from your Apple ID settings."),
  "fastmail.com": P("Fastmail", SSL("imap.fastmail.com"), SSL("smtp.fastmail.com", 465), "Use an app password from Fastmail's settings."),
  "yahoo.com": P("Yahoo Mail", SSL("imap.mail.yahoo.com"), SSL("smtp.mail.yahoo.com", 465), "Use an app password from your Yahoo account security page."),
  "outlook.com": P("Outlook.com", SSL("outlook.office365.com"), TLS("smtp-mail.outlook.com", 587), "Microsoft personal accounts have been moving to OAuth-only IMAP, which this client does not support yet. If the test fails with an authentication error, that is why."),
  "proton.me": P("Proton Mail (through Proton Bridge)", TLS("127.0.0.1", 1143), TLS("127.0.0.1", 1025), "Needs Proton Bridge running on this machine, signed in. Use the Bridge's own username and password (shown in Bridge), not your Proton password.", true, true),
  "wp.pl": P("WP Poczta", SSL("imap.wp.pl"), SSL("smtp.wp.pl", 465), "Enable IMAP in the WP Poczta settings first."),
  "o2.pl": P("o2 Poczta", SSL("poczta.o2.pl"), SSL("poczta.o2.pl", 465), "Enable IMAP in the o2 Poczta settings first."),
  "interia.pl": P("Interia Poczta", SSL("poczta.interia.pl"), SSL("poczta.interia.pl", 465), "Enable IMAP in the Interia settings first."),
  "onet.pl": P("Onet Poczta", SSL("imap.poczta.onet.pl"), SSL("smtp.poczta.onet.pl", 465), "Enable IMAP in the Onet settings first."),
};
/** what a person has to do at the provider before the password works: short, numbered, with the page to open */
const HELP: Record<string, Help> = {
  "gmail.com": { steps: ["Turn on 2-step verification for your Google account (skip if it is already on).", "Open the app passwords page and create one named CAESAR.", "Paste the 16-letter password below. Your normal Google password will not work."], link: { label: "Open Google app passwords", url: "https://myaccount.google.com/apppasswords" } },
  "icloud.com": { steps: ["Sign in at account.apple.com and open Sign-In and Security.", "Create an app-specific password named CAESAR.", "Paste it below."], link: { label: "Open Apple ID settings", url: "https://account.apple.com/account/manage" } },
  "fastmail.com": { steps: ["In Fastmail open Settings, then Privacy and Security, then App passwords.", "Create one for Mail (IMAP/SMTP) and paste it below."], link: { label: "Open Fastmail app passwords", url: "https://app.fastmail.com/settings/security/apps" } },
  "yahoo.com": { steps: ["Open your Yahoo account security page.", "Generate an app password named CAESAR and paste it below."], link: { label: "Open Yahoo security", url: "https://login.yahoo.com/account/security" } },
  "proton.me": { steps: ["Install Proton Mail Bridge on this machine and sign in to it once.", "Keep Bridge running and reachable from the machine CAESAR runs on. If CAESAR is on a server, that needs the SSH tunnel described in tools/proton/README.md.", "Copy the username and password that Bridge shows (they are not your Proton login) and paste them below."], link: { label: "Get Proton Mail Bridge", url: "https://proton.me/mail/bridge" } },
};
const ALIAS: Record<string, string> = { "googlemail.com": "gmail.com", "me.com": "icloud.com", "mac.com": "icloud.com", "hotmail.com": "outlook.com", "live.com": "outlook.com", "msn.com": "outlook.com", "protonmail.com": "proton.me", "pm.me": "proton.me", "protonmail.ch": "proton.me", "ymail.com": "yahoo.com", "fastmail.fm": "fastmail.com" };

export const domainOf = (address: string): string | null => { const m = address.trim().toLowerCase().match(/^[^\s@]+@([a-z0-9.-]+\.[a-z]{2,})$/); return m ? m[1] : null; };
export function preset(address: string): Suggestion | null { const d = domainOf(address); if (!d) return null; const k = ALIAS[d] ?? d, p = PRESETS[k]; return p ? { ...p, help: HELP[k] } : null; }

/** the plain guess: imap.<domain> and smtp.<domain> over SSL, which many providers use. Flagged as a guess. */
export function guess(address: string): Suggestion | null {
  const d = domainOf(address); if (!d) return null;
  return { source: "guess", label: d, imap: SSL(`imap.${d}`), smtp: SSL(`smtp.${d}`, 465), note: "A guess from the domain. Run the connection test; if it fails, ask your provider for the IMAP and SMTP server names." };
}

/** What to fill in for an address: a known provider, else a plain guess. The connection test is what confirms it. No network lookup is made here. */
export const suggest = (address: string): Suggestion | null => preset(address) ?? guess(address);
