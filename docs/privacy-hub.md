# Datenschutz für den Hub — Entwurf für entrosana.com/privacy

Stand 2026-09-08. Entwurf in der Sprache der Seite (Englisch), zum Einfügen
in die bestehende Datenschutzseite unter einem eigenen Zwischentitel. Die
Zahlen stammen aus dem Code (`api/server.mjs`, `api/maintenance.mjs`,
`tools/rotate-logs.sh`) und den Timern in `~/.config/systemd/user/`; ändert
sich dort etwas, ist hier nachzuziehen. Was rechtlich fehlt (Verantwortliche
Stelle, Rechtsgrundlage nach DSG/DSGVO), ergänzt der Eigentümer.

---

## The Hub (entrosana.app)

Most of entrosana.app works without sending us anything. Your project file,
records and the record trail live in your browser's local storage and leave
it only when you choose to download or submit them.

**What we store when you submit a proposal.** Your name, your e-mail address,
the title, area and summary you wrote, the links to files you listed, and —
if you chose to attach it — the part of your record trail that belongs to the
project (the record texts and their hashes; hashes of other projects only).
We also store the time of each step (received, confirmed, reviewed, decided,
published) and who on the team took it.

**Why.** To read the proposal, ask you questions, decide on it, and — if it
is admitted and published — to credit you by name under the module, as the
licence on /modules requires. Your address is used only to confirm that it is
yours and to tell you what happened to your proposal. Replies go to
sygnif@entrosana.com and are read by people.

**How long.** A proposal that is never confirmed is deleted after 7 days,
together with the address that came with it. A confirmed proposal stays until
it is decided and, if published, for as long as the module is in the
catalogue. Access keys expire after 30 days, sign-in links after 20 minutes, confirmation links for proposals after 1 hour.
The server's request log, which contains your IP address, is kept for 14 days.
A chain of hashes that records each step (without names or addresses) is kept
permanently; it is how we prove the history of a module was not rewritten.

**Where.** On our own server in Switzerland. Encrypted backups are written
nightly to storage we control. Traffic to entrosana.app passes through
Cloudflare, which terminates TLS at its edge and sees the requests in
transit; Cloudflare does not receive the stored data.

**Your choices, without asking us.** Under /contribute/status, using the
link from your confirmation mail, you can withdraw a pending proposal, delete
it entirely, download everything we hold about you (JSON), decide whether a
published module keeps your name or not, and erase your account. Erasing
removes your address and name; published modules stay only where you asked
them to, otherwise they leave the catalogue with you.

**Mail.** Confirmation and decision mails are sent from our mail account via
Proton Mail's servers. We send no newsletters and pass no addresses on.

**Contact.** sygnif@entrosana.com.
