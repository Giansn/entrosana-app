# Kontoführung im Hub — Leitlinien und Abgleich

Stand 2026-09-10. Was anerkannte Leitlinien zu Konten, Anmeldung, Rollen und Löschung verlangen, was der Hub
heute tut, und was als Nächstes ansteht. Quellen am Ende.

## 1. Die Leitlinien in einem Absatz je Quelle

**NIST SP 800-63B-4 (2025).** E-Mail gilt nicht als Kanal für einen zweiten Faktor; Bestätigungs- und
Wiederherstellungscodes per Mail sind ausdrücklich erlaubt. Sitzungen brauchen eine feste Obergrenze, die nicht
über 30 Tagen liegen soll. Für privilegierte Zugänge sind phishing-resistente Authentifikatoren (Passkeys, FIDO2)
der Massstab.

**OWASP Authentication und Forgot Password Cheat Sheets.** Antworten dürfen nicht verraten, ob eine Adresse
bekannt ist; Drosseln je Adresse und je Herkunft; Token aus einem kryptografischen Zufallsgenerator mit mindestens
128 Bit, einmal gültig, kurz gültig (Empfehlung 15 Minuten), nach Gebrauch sofort ungültig.

**revDSG und DSGVO.** Das Schweizer Recht kennt keine feste Altersgrenze, sondern die Urteilsfähigkeit; Faustregel
ab 13 Jahren. Die DSGVO setzt für Dienste an Kinder auf Einwilligungsbasis 16 Jahre (Mitgliedstaaten 13 bis 16).
Auskunft und Löschung innert 30 Tagen; Datenminimierung; Löschfristen benennen.

**educa.ch und privatim.** Sobald eine Schule Schülerinnen- und Schülerdaten auf eine Plattform gibt, braucht es
Auftragsbearbeitung, Datenminimierung und geklärte Speicherorte (Merkblatt Cloud Computing im Schulbereich;
Leitfaden Datensicherheit des LCH). Ohne Schülerdaten entfällt das meiste; dann zählt, dass die Plattform es auch
sagt.

**WCAG 2.2, Erfolgskriterium 3.3.8.** Anmelden darf keinen kognitiven Test verlangen: kein Passwort-Merken, kein
CAPTCHA. Ein Anmeldelink per Mail erfüllt das. Formulare brauchen Beschriftungen, Tastaturbedienung und Autofill.

**Praxis der Branche.** Anmeldelinks 10 bis 30 Minuten gültig; eine Geräteliste mit «überall abmelden»; ein
Hinweis per Mail, wenn ein neues Gerät sich anmeldet; Export vor der Löschung; erneute Bestätigung vor
irreversiblen Handlungen.

## 2. Abgleich mit dem Hub

| Punkt | Leitlinie | Hub heute | Stand |
|---|---|---|---|
| Passwortlos per Mail-Link | WCAG 3.3.8; NIST: Mail als Bestätigung erlaubt | Anmeldung nur per Link, kein Passwort, kein CAPTCHA (Honigtopf) | erfüllt |
| Token | OWASP: CSPRNG ≥ 128 Bit, einmal, gehasht | 32 Byte aus `randomBytes`, SHA-256 in der Datenbank, `used` nach Gebrauch | erfüllt |
| Gültigkeit Anmeldelink | OWASP 15 min, Praxis 10 bis 30 | 20 Minuten seit 2026-09-10; Bestätigungen zu Vorschlägen 60 Minuten | erfüllt |
| Einladungslink | Bestätigung, keine Sitzung | 7 Tage, einmal, legt ein Sammler-Konto an | erfüllt |
| Sitzung | NIST ≤ 30 Tage | 30 Tage je Gerät, Marke gehasht; SYGNIF 365 Tage als Dienstkonto | erfüllt |
| Kontoaufzählung | einheitliche Antwort | `POST /api/verify/request` antwortet immer 202 | erfüllt |
| Drossel | je Adresse und Herkunft | 5/h je Adresse, 5/h je IP, 60 Mails/h gesamt | erfüllt; Schulen hinter einer Adresse sind ein offener Entscheid |
| Geräte | Liste und «überall abmelden» | Block «Devices» auf /me: Liste mit Datum, einzeln abmelden, überall sonst, überall inklusive diesem Gerät (2026-09-10) | erfüllt |
| Hinweis bei neuer Anmeldung | Praxis | Mail an die Adresse des Kontos bei jeder Anmeldung eines bestehenden Kontos, mit Zeit, grober Herkunft und dem Weg zum Abmelden (2026-09-10) | erfüllt |
| Erneute Bestätigung vor Löschung | Praxis, NIST-Sinn | Löschung und Wechsel der Namensnennung verlangen eine Marke jünger als 15 Minuten; die Seite verschickt auf Knopfdruck den frischen Link (2026-09-10) | erfüllt |
| Rollen | kleinste Rechte, nachvollziehbar | collector/contributor/reviewer/owner, Vergabe nur auf dem Server, jede Vergabe in der Kette | erfüllt |
| Vier Augen bei Veröffentlichung | Praxis für Redaktionen | `FOUR_EYES=strict` vorhanden, aus; Annahme und Veröffentlichung in einem Schritt auf Wunsch des Eigentümers | bewusst |
| Export und Löschung | Art. 25 und 32 DSG, Art. 15/17/20 DSGVO | Selbstbedienung, sofort; Kette behält Zeilen ohne Namen; Module wahlweise unter dem Namen | erfüllt |
| Löschung des Eigentümers | — | alle Konten löschen sich selbst, auch Prüfende; nur der Eigentümer nicht (2026-09-10) | bewusst |
| Fristen | benennen und einhalten | unbestätigt 7 d, Marken 30 d, Anfragen 180 d, Einladungen 180 d, Sicherungen ohne Frist | teils |
| Minderjährige | Urteilsfähigkeit ab etwa 13; DSGVO 16 | Häkchen bei der Registrierung «13 oder älter, oder Lehrperson/Elternteil für jüngere Lernende», vom Dienst verlangt, nichts gespeichert; Sätze auf /contribute (2026-09-10) | erfüllt |
| Schulen | Auftragsbearbeitung nur bei Schülerdaten | keine Schülerkonten vorgesehen, kein Profiling, Server in der Schweiz; kein Hinweis «Für Schulen» | teils |
| Barrierefreiheit der Anmeldung | Labels, Tastatur, Autofill | Labels, Tastatur, `autocomplete="email"` und `inputmode="email"` am Anmeldefeld | erfüllt |
| Verhaltensregeln | eine Seite, die man verlinken kann | drei Sätze unter «The rules, short» auf /contribute | teils |

Stand 2026-09-10 nach den Empfehlungen 1 bis 5: siebzehn Punkte erfüllt oder bewusst so, drei teils (Fristen der Sicherungen, Hinweis für Schulen, Seite mit den Regeln), keiner offen.

## 3. Empfehlungen, gereiht

**Zuerst (klein, je unter einer Stunde) — umgesetzt am 2026-09-10.**
1. Anmeldelink auf 20 Minuten kürzen; der Einladungslink bleibt bei 7 Tagen.
2. Mail bei jeder Anmeldung eines neuen Geräts an die Adresse des Kontos: Zeit, grobe Herkunft, Weg zum Abmelden.
3. «Überall abmelden» auf /me, dazu die Liste der Geräte mit Datum und Abmelden je Zeile.
4. Vor der Löschung einen frischen Link verlangen statt nur des Dialogs; gleiches vor dem Wechsel der Namensnennung.
5. Bei der Registrierung ein Satz mit Häkchen: «Ich bin 13 oder älter; jüngere Lernende bringt eine Lehrperson oder ein Elternteil ein.»

**Dann (mittel).**
6. Seite /guidelines mit den Regeln in einem Text (Entwurf unter 4), verlinkt von /contribute, /me und der Registrierung.
7. Absatz «Für Schulen» auf /contribute oder in der Datenschutzerklärung: keine Schülerkonten, keine Schülerdaten, Bearbeitungsverzeichnis auf Anfrage.
8. Ruhende Konten: nach 24 Monaten ohne Anmeldung ein Hinweis, nach weiteren 3 Monaten Löschung wie die Selbstlöschung; steht dann in der Erklärung.
9. Frist für Sicherungen festlegen (offener Entscheid seit 2026-09-09).
10. Zweiter Eigentümer oder Wiederherstellungsweg für das Eigentümerkonto, falls das Postfach verloren geht.

**Später.**
11. Passkeys als zweiter, phishing-resistenter Weg für Team-Konten (NIST für privilegierte Rollen).
12. Vier-Augen-Regel einschalten, sobald mehr als eine Person prüft.

## 4. Entwurf der Leitlinien-Seite (englisch, wie der Hub)

**Who may register.** Anyone with an e-mail address. Registration is one mail; no password. You must be 13 or
older to hold an account; younger learners take part through a teacher or a parent, who holds the account.

**Names and profiles.** A name is needed before you propose or contribute; it is the name your work is published
under. Your profile is public: name, organisation, role, the one line, website, languages, picture and the journal
entries you mark public. Your e-mail address is never public.

**What you publish.** Everything in the Hub is AGPL-3.0; what you send in is published under it, under your name.
No commercial or religious intent, no personal data of children, nothing you do not hold the rights to.

**Review.** Proposals are read against what they claim. You get a plain yes, no or not yet, with the reason, by mail.
Admit and publish is one step. The team may take a module back or withdraw a role, always with the reason in the
chain.

**Conduct.** Disagree with the work, not with the person. Reports about a module go to sygnif@entrosana.com through
the report form; the team answers.

**Accounts and data.** Sign-in links last 20 minutes, a device stays signed in for 30 days, unconfirmed addresses
are deleted after 7 days, requests and unanswered invitations after 180 days. Export or erase your data any time on
your account page; a module stays under your name only if you say so.

## 5. Quellen

- NIST SP 800-63B-4, Digital Identity Guidelines: Authentication and Authenticator Management (2025),
  https://pages.nist.gov/800-63-4/sp800-63b.html
- OWASP Authentication Cheat Sheet,
  https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html; Forgot Password Cheat Sheet,
  https://cheatsheetseries.owasp.org/cheatsheets/Forgot_Password_Cheat_Sheet.html
- Urteilsfähigkeit und Einwilligung Minderjähriger nach DSG, Onlinekommentar zu Art. 6 Abs. 6 und 7 DSG,
  https://onlinekommentar.ch/de/kommentare/art6abs6und7; Datenschutz bei Kindern und Jugendlichen,
  https://datenschutz.law/ratgeber/datenschutz-bei-kindern-und-jugendlichen
- Educa, Rahmenbedingungen zu Schule und Datenschutz, https://educa.ch/de/rahmenbedingungen-zu-schule-und-datenschutz;
  LCH, Leitfaden Datensicherheit für Lehrpersonen und Schulleitungen,
  https://www.lch.ch/fileadmin/user_upload_lch/Orientierung/Leitfaeden/Leitfaden_Datensicherheit_Web_DEF.pdf
- WCAG 2.2, SC 3.3.8 Accessible Authentication (Minimum), Erläuterung bei Auth0,
  https://auth0.com/blog/an-accessible-guide-to-wcag-3-3-8-authentication-without-frustration/
- Praxis zu Magic Links und Sitzungen: https://guptadeepak.com/mastering-magic-link-security-a-deep-dive-for-developers/,
  https://www.descope.com/learn/post/magic-links
