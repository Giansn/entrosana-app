/* Die Checklisten, aus denen ein Projekt entsteht. Eine Kopie je Besucher;
   geändert wird hier, nicht in den Kopien.

   Jede Liste endet mit dem Schritt, der sie aus dem Browser herausführt: an
   wen sie in der eigenen Organisation geht, und wie entrosana erreichbar ist
   (info@entrosana.com oder das Formular auf entrosana.app/request).

   Abschnitt «hub» (2026-09-10): die drei Vorhaben des Hubs selbst, die jedes Brett
   einmal vorgeschlagen bekommt (app.js ensureStarter); steht zuerst, damit der Dialog
   «New project» sie zuerst zeigt. Die Karten auf /contribute zeigen seit 2026-09-10 hub/001–003.
   Ohne diesen Schritt bleibt eine Checkliste eine Übung. */
window.__seeds = {
 "hub/001": {
  "section": "hub",
  "title": "Docs in plain language, in several languages",
  "who": "docs.entrosana.app: six pages, first plain English, then German, French and Italian",
  "steps": [
   {
    "t": "Read the six pages as a newcomer",
    "n": "Getting started, Accounts, Contribute, Services, API, Privacy.",
    "i": "Open docs.entrosana.app and read each page once, fast. Note every sentence you had to read twice and every word a teacher would not know. One note per page on this card."
   },
   {
    "t": "Rewrite the hard sentences in plain English",
    "n": "One idea per sentence; a gloss for every term.",
    "i": "Edit the Markdown in the console under Docs. The change is live at once. Keep the facts; the privacy page must keep matching the statement on entrosana.com."
   },
   {
    "t": "Decide the languages and the order",
    "n": "German (Swiss orthography) first, then French and Italian.",
    "i": "Decide who reviews each language and whether the English page stays the source of truth. Write the decision into the journal on entrosana.app/me."
   },
   {
    "t": "Translate Getting started and Accounts into German",
    "n": "The two pages every newcomer reads.",
    "i": "Keep the headings, so the «On this page» line works. Swiss orthography: ss instead of the Eszett, umlauts as they are."
   },
   {
    "t": "Translate Contribute, Services, API and Privacy",
    "n": "Privacy must match entrosana.com/privacy/de where it states a rule.",
    "i": "The API page keeps its calls and field names in English; only the prose changes."
   },
   {
    "t": "Add the language switch to the docs",
    "n": "One folder per language, a switch in the rail.",
    "i": "docs-site/de/… next to the English files; the renderer takes the language from the path; the rail gets a line with the languages. Ask for it on entrosana.app/request as kind «service» if you do not build it yourself."
   },
   {
    "t": "Have a native reader check each language",
    "n": "A teacher or a learner reads one page aloud.",
    "i": "What makes the reader stumble gets changed, not explained."
   },
   {
    "t": "Publish and tell the Hub",
    "n": "Link the languages from the rail footer; a journal entry on /me.",
    "i": "Mark the journal entry public, so contributors see it on your profile."
   }
  ]
 },
 "hub/002": {
  "section": "hub",
  "title": "Translate the website text",
  "who": "entrosana.com: Home, Service, Hub, Modules, Contribute, Imprint, Privacy",
  "steps": [
   {
    "t": "List the pages and their word counts",
    "n": "Seven pages; the site console shows every text.",
    "i": "Home, Service, Hub, Modules, Contribute, Imprint, Privacy (English; German privacy exists). Note the word count per page on this card; it sets the order of work."
   },
   {
    "t": "Fix the English source first",
    "n": "A sentence that is unclear in English is unclear in every language.",
    "i": "Read each page aloud; shorten what does not survive it. The site's text editor keeps the markup; only text between tags changes."
   },
   {
    "t": "Choose the languages and the order",
    "n": "German (Swiss) first, then French and Italian.",
    "i": "Decide whether entrosana.com stays English-first with language pages, or becomes German-first. Write it into the journal."
   },
   {
    "t": "Translate Home and Service",
    "n": "The two pages every visitor sees.",
    "i": "Keep the number of text blocks; the editor refuses saves that change the structure. Terms used in the Hub (collector, contributor, module, track) get one German equivalent each and keep it."
   },
   {
    "t": "Translate Hub, Modules and Contribute",
    "n": "Same terms as on entrosana.app; the Contribute button links to entrosana.app/contribute.",
    "i": "Where the page names a Hub feature, use the word the Hub shows in its interface until the Hub is translated too."
   },
   {
    "t": "Privacy and Imprint",
    "n": "The German privacy page exists at /privacy/de/; align its wording with the Hub docs.",
    "i": "Legal wording stays as in the statement; a translation promises nothing new."
   },
   {
    "t": "Set up the language pages in WordPress",
    "n": "Child pages per language, hreflang links, a switch in the header.",
    "i": "Page ids and the publishing route are in the console notes; the text API refuses structural changes, the eval-file route does not."
   },
   {
    "t": "Review with a native reader and publish",
    "n": "One page read aloud per language before it goes live.",
    "i": "Publish language by language; note the date in the privacy statement if its wording changed."
   }
  ]
 },
 "hub/003": {
  "section": "hub",
  "title": "Work out the requests",
  "who": "the request inbox: module, track, tool, service, report, contribute, other",
  "steps": [
   {
    "t": "Open the requests in the console",
    "n": "The console lists every open request with kind, sender and text.",
    "i": "Requests older than 180 days are purged automatically; what is still there deserves an answer."
   },
   {
    "t": "Sort them",
    "n": "Answer now · needs a decision · belongs to a module's contributors · spam.",
    "i": "Write the sort into the card note; the console has a «handled» mark per request."
   },
   {
    "t": "Answer the quick ones",
    "n": "From info@entrosana.com within a week; mark handled.",
    "i": "A request for a tool or a service that exists gets the link; one that does not gets a plain no with the reason, or a date."
   },
   {
    "t": "Turn module and track requests into proposals",
    "n": "Ask the sender to file it on entrosana.app/contribute/submit, or file it with consent under their name.",
    "i": "A proposal is published under a name; the sender must agree to that in writing."
   },
   {
    "t": "Forward reports to the module's contributors",
    "n": "Reports arrive at sygnif@; the module page names the contributors.",
    "i": "Decide with the contributors, answer the reporter, note the decision in the record trail through the console."
   },
   {
    "t": "Keep the list at zero every Friday",
    "n": "A recurring check; new requests wait at most a week.",
    "i": "Set a due date on this card each week, or make it a journal habit."
   }
  ]
 },
 "tools/000": {
  "section": "tools",
  "title": "Set up an auditable back-office",
  "who": "for administrative responsibilities and process efficiency",
  "steps": [
   {
    "t": "Describe the process you want to hand over",
    "n": "In your own words, the way you would explain it to a new colleague."
   },
   {
    "t": "Pick the first routine",
    "n": "One only: bookings, a payroll run, or document filing."
   },
   {
    "t": "Define what a correct result looks like",
    "n": "Written down before the first run, not after it."
   },
   {
    "t": "Decide who reviews, and when",
    "n": "A named person and a point in the process where they look."
   },
   {
    "t": "Run it once by hand and keep the record",
    "n": "The manual run is the reference the machine is measured against."
   },
   {
    "t": "Name who owns it once it runs",
    "n": "One person in your organisation and a deputy. A routine without an owner drifts back to where it came from."
   },
   {
    "t": "Send the checklist to entrosana",
    "n": "Export the trail and mail it to info@entrosana.com, or use the form on entrosana.com/request-access. The answer comes from a person, not a queue."
   }
  ]
 },
 "tools/001": {
  "section": "tools",
  "title": "Prepare a payroll run",
  "who": "for payroll runs, contracts, and attestations",
  "steps": [
   {
    "t": "List everyone the run covers",
    "n": "Including the ones who joined or left mid-month."
   },
   {
    "t": "Collect what changed since last month",
    "n": "Hours, absences, one-off payments."
   },
   {
    "t": "Name the source for every figure",
    "n": "A figure without a source cannot be checked."
   },
   {
    "t": "Agree who signs the run off",
    "n": "One person, before the payment date."
   },
   {
    "t": "Agree the correction path before you pay",
    "n": "Who is told, and by when, if a figure turns out wrong afterwards."
   },
   {
    "t": "Tell the people it covers where to ask",
    "n": "One address inside your organisation, printed on the statement itself."
   }
  ]
 },
 "tools/002": {
  "section": "tools",
  "title": "Ask for a second opinion",
  "who": "for second opinions that show their work",
  "steps": [
   {
    "t": "State the decision you already lean towards",
    "n": "So the review can disagree with something concrete."
   },
   {
    "t": "Write down what would change your mind",
    "n": "Before you read the answer."
   },
   {
    "t": "Attach the numbers the decision rests on",
    "n": "With their source."
   },
   {
    "t": "Choose who gives the opinion",
    "n": "Someone in your organisation who was not part of the decision — or entrosana at info@entrosana.com."
   },
   {
    "t": "Set the date the answer is due",
    "n": "A review without a date arrives after the decision."
   },
   {
    "t": "Record what the review actually said",
    "n": "Including the parts you did not follow."
   }
  ]
 },
 "modules/000": {
  "section": "modules",
  "title": "Plan a module for your group",
  "who": "social work driven · social skills · community building",
  "steps": [
   {
    "t": "Choose the area",
    "n": "Social, nature-based or technical, or say which parts of each."
   },
   {
    "t": "Describe the group",
    "n": "Age, size, and anything that changes how the day has to run."
   },
   {
    "t": "Say what they should be able to do afterwards",
    "n": "One sentence. It decides everything else in the plan."
   },
   {
    "t": "Fix the place and what it needs",
    "n": "Room or forest, travel, materials, and who supplies them."
   },
   {
    "t": "Set the dates and the person leading",
    "n": "A named lead, so the module has someone answerable for it."
   },
   {
    "t": "Get a written yes inside your school",
    "n": "From the Schulleitung, or whoever holds the budget. A yes in the corridor is not one."
   },
   {
    "t": "Send the plan to entrosana",
    "n": "info@entrosana.com, or the form on entrosana.com/request-access. Say the age group, the dates, and what you want us to bring."
   }
  ]
 },
 "modules/001": {
  "section": "modules",
  "title": "Take a group outdoors",
  "who": "nature driven · ecology · outdoor learning",
  "steps": [
   {
    "t": "Pick the place and walk it first",
    "n": "Once, before the group ever sees it."
   },
   {
    "t": "Write down the weather you would cancel in",
    "n": "Decided in advance, not on the morning."
   },
   {
    "t": "Check the ratio and the insurance",
    "n": "Adults per child as your canton asks for, and who is covered on the way there and back."
   },
   {
    "t": "List what each person carries",
    "n": "Short enough that a parent can read it in one go."
   },
   {
    "t": "Name who holds the first-aid kit",
    "n": "A person, not a rucksack."
   },
   {
    "t": "Write to the parents and set a date for the reply",
    "n": "One page, one address to answer to, one date after which you follow up by phone."
   },
   {
    "t": "Agree the call chain for the day",
    "n": "Who rings whom, in which order, with the school number on paper as well as in a phone."
   }
  ]
 },
 "modules/002": {
  "section": "modules",
  "title": "Teach how a machine actually works",
  "who": "code · computing · data features",
  "steps": [
   {
    "t": "Choose one machine the group already uses",
    "n": "The one in their pocket usually works."
   },
   {
    "t": "Find the point where it decides something",
    "n": "That point is the lesson."
   },
   {
    "t": "Agree the device rules with your school",
    "n": "What may be used in the room, and what happens to the data on it. That is settled with the person responsible for IT, not in the lesson."
   },
   {
    "t": "Make the decision visible without code",
    "n": "Paper, cards, a whiteboard."
   },
   {
    "t": "Let them change the input and watch it turn",
    "n": "The turn is what they remember."
   },
   {
    "t": "Ask entrosana for the material",
    "n": "info@entrosana.com — say the age group and how long you have. It comes back as something you can repeat without us."
   }
  ]
 }
};
