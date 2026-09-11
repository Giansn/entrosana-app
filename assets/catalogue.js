/* Der Katalog beider Abteilungen: Modules und Tools. Eine Datei, nicht acht
   Seiten — die Kartenwand und jede Unterseite lesen von hier, und ein neuer
   Eintrag ist ein Eintrag hier plus eine Zeile in serve.mjs.

   Die Schritte stehen weiterhin in seeds.js. Ein Eintrag verweist nur über
   "seed" darauf, damit jede Checkliste genau einmal existiert.

   "draft": true heisst, der Text stammt nicht von euch. Die Seite sagt das
   dann auch, statt ihn als Zusage auszugeben. */
window.__catalogue = {

 "modules": {
  "title": "Modules",
  // Ein Gleis, weil alle drei denselben Zustand haben: gebaut wird auf Anfrage.
  // Die Gebietsnamen sind die von entrosana.com/modules, die Absaetze auch.
  "tracks": [
   {"id":"available", "name":"Available now", "short":"self-implementation"},
   {"id":"onrequest", "name":"On request",    "short":"on request"},
   {"id":"contributed", "name":"Contributed", "short":"contributed"}
  ],
  "list": [
   {
    "slug":"your-value-system",
    "by":"Gianluca Kühne",
    "track":"available",
    "area":"social",
    "updated":"2026-09-09",
    "state":"development",
    "title":"Value System",
    "who":"social · 9 slides + 2-page worksheet · English and German",
    "lede":"Whre do values originate from and how do they change? ",
    "meta":"still in development · open to build on it",
    "about":"It works through why the weight of a value shifts with age, time of day, place and company, why so much of a value system sits below awareness, and the question underneath both: are we led by our value system, or do we build it. Maslow's hierarchy and the World Economic Forum's system-value framework appear as reference models, not as answers.",
    "note":"It closes with an exercise rather than a summary. Learners build a character, invented or real, and map its complete value system including the parts the character is not aware of. Discussion prompts and thinking pauses are written into the slides, so a teacher can run it without preparation from us.",
    "facts":[
     ["Area","Social"],
     ["What you get","9 slides and a 2-page worksheet"],
     ["Languages","English and German"],
     ["What you need from us","Nothing. No account, no request"],
     ["Reference models","Maslow's hierarchy, the World Economic Forum's system-value framework"],
     ["Preparation","None: the prompts and pauses are written into the slides"]
    ],
    "downloads":[
     {"lang":"English", "files":[["Slides","https://entrosana.com/wp-content/uploads/2026/08/value-system-slides-en.pdf"],
                                 ["Worksheet","https://entrosana.com/wp-content/uploads/2026/08/value-system-worksheet-en.pdf"]]},
     {"lang":"Deutsch", "files":[["Folien","https://entrosana.com/wp-content/uploads/2026/08/value-system-slides-de.pdf"],
                                 ["Arbeitsblatt","https://entrosana.com/wp-content/uploads/2026/08/value-system-worksheet-de.pdf"]]}
    ],
    "gets":[
     "A session a teacher can run without preparation from us",
     "The same material in English and German",
     "Yours to adapt: read it, run it with your class, change it"
    ]
   },
   {
    "slug":"social",
    "seed":"modules/000",
    "track":"onrequest",
    "area":"social",
    "title":"Social",
    "who":"social work driven · social skills · community building",
    "lede":"How we create values, talk, decide, and live together or alone, including how to read the influences around us. But also the other way around: how do we influence our surroundings? We can help to move learning towards a process that puts relations into perspective.",
    "meta":"on request",
    "about":"Composed by contributors who do this work: social workers, and practitioners who teach. Scoped and built on request, so the depth matches the class instead of a catalogue.",
    "facts":[
     ["Scope","Scoped and built on request, matched to the age and size of the group"],
     ["Who composes it","Contributors: social workers, nature pedagogy, and engineers who teach"],
     ["How it starts","A school or a homeschooling family asks; we scope a priced proposal"],
     ["What stays visible","The plan, the materials, and what was delivered — to learners, parents and teachers"],
     ["Curriculum references","Checked against the source, not trusted"],
     ["Cost","A priced proposal, per module"]
    ],
    "gets":[
     "The module delivered with its full record",
     "No catalogue lock-in: modules are built, adapted and retired as classes actually need them",
     "An audit record that answers the parents who chose the school"
    ]
   },
   {
    "slug":"nature-based",
    "seed":"modules/001",
    "track":"onrequest",
    "area":"nature-based",
    "title":"Nature-based",
    "who":"nature driven · ecology · outdoor learning  · elements ",
    "lede":"Out of the classroom and into the forest, with experiences that revitalize mind and body.\nLearning where the physical boundaries of nature and of ourselves can be found in a healthy way. Adventures, science and gardening are examples for nature driven learning.",
    "meta":"on request",
    "about":"Composed by nature, humans and contributors with a background with wildlife, crafting, science and art. ",
    "facts":[
     ["Scope","Scoped and built on request, matched to the age and size of the group"],
     ["Who composes it","Contributors: social workers, nature pedagogy, and engineers who teach"],
     ["How it starts","A school or a homeschooling family asks; we scope a priced proposal"],
     ["What stays visible","The plan, the materials, and what was delivered — to learners, parents and teachers"],
     ["Curriculum references","Checked against the source, not trusted"],
     ["Cost","A priced proposal, per module"]
    ],
    "gets":[
     "The module delivered with its full record",
     "No catalogue lock-in: modules are built, adapted and retired as classes actually need them",
     "An audit record that answers the parents who chose the school"
    ]
   },
   {
    "slug":"technical",
    "seed":"modules/002",
    "track":"onrequest",
    "area":"technical",
    "title":"Technical",
    "who":"code · computing · data features  · digital tools ",
    "lede":"How software, data and machines actually work, and how they can be used productively. Taught in different depths and from different approaches. Always with the question in mind: how can I learn with the technology? Instead of replacing learning with technology.",
    "meta":"on request",
    "about":"Composed by engineers who teach and scoped to practical needs. ",
    "facts":[
     ["Scope","Scoped and built on request, matched to the age and size of the group"],
     ["Who composes it","Contributors: social workers, nature pedagogy, and engineers who teach"],
     ["How it starts","A school or a homeschooling family asks; we scope a priced proposal"],
     ["What stays visible","The plan, the materials, and what was delivered — to learners, parents and teachers"],
     ["Curriculum references","Checked against the source, not trusted. The Lehrplan 21 citation tool is in development"],
     ["Cost","A priced proposal, per module"]
    ],
    "gets":[
     "The module delivered with its full record",
     "No catalogue lock-in: modules are built, adapted and retired as classes actually need them",
     "An audit record that answers the parents who chose the school"
    ]
   },
   {
    "slug":"dedicated-or-unified-gpu-memory-setup-and-use-cases",
    "track":"contributed",
    "state":"development",
    "by":"SYGNIF",
    "title":"Dedicated or unified GPU memory: setup and use cases",
    "who":"technical · contributed",
    "lede":"- Name the thing you want to build or teach: An 11-slide deck in entrosana's light layout on the difference between a dedicated GPU (its own VRAM, reached over PCIe) and unified memory (CPU and GPU sh",
    "meta":"contributed · text by the contributor",
    "about":"- Name the thing you want to build or teach: An 11-slide deck in entrosana's light layout on the difference between a dedicated GPU (its own VRAM, reached over PCIe) and unified memory (CPU and GPU share one pool): what each looks like in a machine, the two numbers that decide (capacity and bandwidth, with published figures), the setup each one demands, where each one wins, a three-question rule of thumb, and five questions a school or small team should answer before buying.\n- Say who it is for: People who run models on their own machines or decide what to buy for a school, a practice or a small team; secondary II informatics as a reading; no prior knowledge of GPU architecture.\n- Link what already exists: The Hub's own setup (training rented on dedicated GPUs, small models served locally); manufacturer specifications for the bandwidth chart (M4 Max 546 GB/s, M2 Ultra 800 GB/s, RTX 4090 1008 GB/s, RTX 5090 1792 GB/s, H100 SXM 3350 GB/s).\n- State what you need from the Hub: One reader who runs models on unified memory and one who runs a dedicated card, to say where the rule of thumb fails; a decision on whether the tokens-per-second ceiling should stay in the deck.\n- Agree how it gets reviewed: Against the rules on /contribute: every number traceable to a specification, every claim testable on a real machine, no black box. The deck stays a draft until two readers have run it against their hardware.\n- Submit to the Hub: Slides as PPTX (editable) and PDF, English; a German version and a one-page worksheet follow after the first review. Published under the name SYGNIF, with the record of its making.",
    "facts":[
     ["Area","technical"],
     ["Contributed by","SYGNIF"],
     ["Status","admitted; text as submitted, not yet edited"],
     ["Record trail","not verified"]
    ],
    "downloads":[
     {"lang":"Files", "files":[["Slides (PPTX, editable)","https://entrosana.com/wp-content/uploads/2026/09/sygnif-gpu-memory-en.pptx"],["Slides (PDF)","https://entrosana.com/wp-content/uploads/2026/09/sygnif-gpu-memory-en.pdf"]]}
    ],
    "area":"technical",
    "updated":"2026-09-09"
   },
   {
    "slug":"the-record-trail-making-a-story-checkable-by-hand",
    "track":"contributed",
    "state":"development",
    "by":"SYGNIF",
    "title":"The record trail: making a story checkable by hand",
    "who":"technical · contributed",
    "lede":"- Name the thing you want to build or teach: A 90-minute lesson in which a class builds a record trail on paper.",
    "meta":"contributed · text by the contributor",
    "about":"- Name the thing you want to build or teach: A 90-minute lesson in which a class builds a record trail on paper. Each step is written down and sealed against the previous one with a short hash; a tampered line is found by recomputing, not by trusting. It ends at the Hub's own trail on entrosana.app/records, so learners see the same idea running in software they can inspect.\n- Say who it is for: Cycle 3 (grades 7 to 9) and secondary II. Lehrplan 21 «Medien und Informatik», MI.2.3 (data: structure, security) and MI.1.4 (read and judge media). Teachers without an informatics background; no software in the first hour.\n- Link what already exists: entrosana.app/records and «Verify chain» in the Hub's rail; the receipt on entrosana.com/hub; SHA-256 as the Hub uses it, simplified for paper to a letter sum modulo 97.\n- State what you need from the Hub: one teacher to run the first version with a real class and send back the slide they had to change; one reader for the German worksheet.\n- Agree how it gets reviewed: against the rules on /contribute. Does the lesson do what it says, meaning the class finds the tampered line without the teacher pointing at it? Is every sentence about hashes correct? Is nothing in it a black box? The files stay drafts until a class has run them.\n- Submit to the Hub: slides (9), worksheet (2 pages), teacher notes (1 page), English and German, delivered as drafts within two weeks of admission. Published under the name SYGNIF, with the record of its making.",
    "facts":[
     ["Area","technical"],
     ["Contributed by","SYGNIF"],
     ["Format","a 90-minute lesson, on paper"],
     ["Record trail","not verified"]
    ],
    "area":"technical",
    "updated":"2026-09-09"
   }
  ]
 },

  "tools": {
  "title": "Tools",
  // Die Trennung ist der Kern der Seite: was läuft, und was eine Checkliste
  // ist. Deshalb zwei Wände statt eines Filters — sie darf nicht wegklickbar
  // sein.
  "tracks": [
   {"id":"running",   "name":"What actually runs",           "short":"tool"},
   {"id":"checklist", "name":"Checklists you can start from", "short":"checklist"}
  ],
  "list": [
   {
    "slug":"lehrplan21-citation",
    "track":"running",
    "state":"running",
    "title":"Lehrplan 21:  citation and navigation",
    "lede":"Resolves a competence code to its exact wording, and checks a finished document against the curriculum.",
    "meta":"published",
    "about":"Two things go wrong routinely when the Lehrplan 21 is quoted: the competency code is misremembered, and the wording is paraphrased and then presented as a quotation. Both are invisible in the finished text. The tool looks up the exact competency and the exact wording of each level, and writes the citation the way the official Zitierhilfe asks for it, permalink included.",
    "note":"The other direction works too: hand «pruefe» a .docx or .md file and it checks every code and every quotation in it against the curriculum, then reports the ones that do not hold. Over MCP a model does this while it writes, instead of a person doing it afterwards.",
    "facts":[
     ["What it reads","be.lehrplan.ch, Bern cantonal edition"],
     ["Built with","Python 3.7 or newer, standard library only"],
     ["Dependencies","None — no SDK, no virtual environment"],
     ["How it is used","On the command line, and as an MCP server for language models"],
     ["Curriculum content","None is shipped: the index is built on your own machine on first use, about 474 pages in roughly eight minutes. Afterwards it works offline"],
     ["Licence","AGPL-3.0, full text in the repository"]
    ],
    "repo":"https://github.com/entrosana/hub/tree/main/lp21-mcp"
   },
   {
    "slug":"lehrplan21-stand-in",
    "track":"running",
    "state":"running",
    "title":"Lehrplan 21 data interface: stand-in",
    "lede":"Lets the import be built before access to the official interface is granted.",
    "meta":"until the official interface opens",
    "about":"A stand-in for the official data interface, with fixed test data and an acceptance script that says plainly whether the import still matches.",
    "facts":[
     ["What it replaces","The official Lehrplan 21 data interface"],
     ["Test data","Fixed, kept with the code"],
     ["Acceptance","A script that reports match or mismatch"],
     ["How it is used","On e14, as a script beside the import it measures"]
    ],
    "note":"Access to the official interface has been requested. The stand-in stays afterwards, as the thing the real interface is measured against."
   },
   {
    "slug":"auditable-back-office",
    "seed":"tools/000",
    "track":"checklist",
    "title":"Set up an auditable back-office",
    "lede":"Hand one routine to a machine without losing the trail behind it.",
    "meta":"",
    "facts":[
     ["Who it is for","Administrative responsibilities and process efficiency"],
     ["What it leaves","A sealed record for every step you tick"]
    ]
   },
   {
    "slug":"payroll-run",
    "seed":"tools/001",
    "track":"checklist",
    "title":"Prepare a payroll run",
    "lede":"The month closed in a fixed order, including the people who joined or left mid-month.",
    "meta":"",
    "facts":[
     ["Who it is for","Payroll runs, contracts, and attestations"],
     ["What it leaves","A sealed record for every step you tick"]
    ]
   },
   {
    "slug":"second-opinion",
    "seed":"tools/002",
    "track":"checklist",
    "title":"Ask for a second opinion",
    "lede":"A question put in a way that the answer can be checked afterwards.",
    "meta":"",
    "facts":[
     ["Who it is for","Second opinions that show their work"],
     ["What it leaves","A sealed record for every step you tick"]
    ]
   }
  ]
 },

 "contribute": {
  "title": "Contribute",
  "tracks": [
   {"id":"start", "name":"Checklists", "short":"checklist"}
  ],
  "list": [
    {
     "slug":"docs-in-plain-language",
     "seed":"hub/001",
     "track":"start",
     "title":"Docs in plain language, in several languages",
     "lede":"Six pages at docs.entrosana.app, first in plain English, then in German, French and Italian.",
     "meta":"",
     "about":"The docs explain the Hub to people who have never seen it. Every sentence that needs a second read is a sentence to rewrite, and every language a teacher reads in is a language the docs should speak. The checklist goes from reading as a newcomer to a published language switch.",
     "facts":[
      ["Who it is for", "Anyone who reads and writes plainly, in one of the languages"],
      ["What it leaves", "Rewritten pages in the docs, one language at a time"],
      ["Where it goes", "docs.entrosana.app, edited in the console; questions to info@entrosana.com"]
     ]
    },
    {
     "slug":"translate-the-website",
     "seed":"hub/002",
     "track":"start",
     "title":"Translate the website text",
     "lede":"Seven pages of entrosana.com, from a clear English source into German, French and Italian.",
     "meta":"",
     "about":"The website is the door to the Hub, and it opens only in English. The checklist fixes the source first, keeps the terms the Hub uses, and sets up language pages a visitor can switch between.",
     "facts":[
      ["Who it is for", "Translators who know schools and can keep a term stable"],
      ["What it leaves", "Language pages on entrosana.com with the same structure as the English ones"],
      ["Where it goes", "entrosana.com, edited in the site console; questions to info@entrosana.com"]
     ]
    },
    {
     "slug":"work-out-the-requests",
     "seed":"hub/003",
     "track":"start",
     "title":"Work out the requests",
     "lede":"Every request that reached the Hub gets an answer, a decision or a proposal.",
     "meta":"",
     "about":"Requests arrive through the form on the Hub and wait in the console: for a module, a track, a tool, a service, a report or a contribution. The checklist sorts them, answers the quick ones within a week, turns the good ones into proposals and keeps the list at zero.",
     "facts":[
      ["Who it is for", "The team, and anyone who answers mail for the Hub"],
      ["What it leaves", "Answered requests, marked handled, and proposals where one belonged"],
      ["Where it goes", "The Hub console; answers from info@entrosana.com"]
     ]
    }
  ]
 }
};
