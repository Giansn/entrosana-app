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
   {"id":"onrequest", "name":"On request", "short":"on request"}
  ],
  "list": [
   {
    "slug":"social",
    "seed":"modules/000",
    "track":"onrequest",
    "title":"Social",
    "who":"social work driven · social skills · community building",
    "lede":"How we create values, talk, decide, and live together or alone, including how to read the media, the machines and influences around us.",
    "meta":"on request",
    "about":"Composed by experts who do this work — social workers, and practitioners who teach. Scoped and built on request, so the depth matches the class instead of a catalogue.",
    "facts":[
     ["Scope","Scoped and built on request, matched to the age and size of the class"],
     ["Who composes it","Experts: social workers, nature pedagogy, and engineers who teach"],
     ["How it starts","A school asks; we scope a priced proposal"],
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
    "title":"Nature-based",
    "who":"nature driven · ecology · outdoor learning",
    "lede":"Out of the classroom and into the forest, with experiences that revitalize mind and body.",
    "meta":"on request",
    "about":"Learning where the physical boundaries of nature and of a person actually are. Composed by people from nature pedagogy, and scoped to the class that goes out.",
    "facts":[
     ["Scope","Scoped and built on request, matched to the age and size of the class"],
     ["Who composes it","Experts: social workers, nature pedagogy, and engineers who teach"],
     ["How it starts","A school asks; we scope a priced proposal"],
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
    "title":"Technical",
    "who":"code · computing · data features",
    "lede":"How software, data and machines actually work, and how they can be used productively.",
    "meta":"on request",
    "about":"Taught in different depths and from different approaches. Composed by engineers who teach, and scoped to the class rather than to a catalogue.",
    "facts":[
     ["Scope","Scoped and built on request, matched to the age and size of the class"],
     ["Who composes it","Experts: social workers, nature pedagogy, and engineers who teach"],
     ["How it starts","A school asks; we scope a priced proposal"],
     ["What stays visible","The plan, the materials, and what was delivered — to learners, parents and teachers"],
     ["Curriculum references","Checked against the source, not trusted. The Lehrplan 21 citation tool is in development"],
     ["Cost","A priced proposal, per module"]
    ],
    "gets":[
     "The module delivered with its full record",
     "No catalogue lock-in: modules are built, adapted and retired as classes actually need them",
     "An audit record that answers the parents who chose the school"
    ]
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
    "title":"Lehrplan 21 — citation and navigation",
    "lede":"Resolves a competence code to its exact wording, from a local index you can check.",
    "meta":"not published yet",
    "about":"Builds a local index of be.lehrplan.ch and answers from it, so a citation can be checked against the source instead of being trusted. Python, standard library only, no dependencies.",
    "facts":[
     ["What it reads","be.lehrplan.ch, Bern cantonal edition"],
     ["Built with","Python, standard library only"],
     ["Dependencies","None"],
     ["Status","Running on e14"]
    ],
    "note":"Not published yet. Once it is on GitHub it becomes reachable as an MCP tool, so an assistant can cite the curriculum without a human copying text across."
   },
   {
    "slug":"lehrplan21-stand-in",
    "track":"running",
    "state":"running",
    "title":"Lehrplan 21 data interface — stand-in",
    "lede":"Lets the import be built before access to the official interface is granted.",
    "meta":"until the official interface opens",
    "about":"A stand-in for the official data interface, with fixed test data and an acceptance script that says plainly whether the import still matches.",
    "facts":[
     ["What it replaces","The official Lehrplan 21 data interface"],
     ["Test data","Fixed, kept with the code"],
     ["Acceptance","A script that reports match or mismatch"],
     ["Status","Running on e14"]
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
     ["What it leaves","A sealed record for every step you tick"],
     ["Where it lives","On this device, until you say otherwise"]
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
     ["What it leaves","A sealed record for every step you tick"],
     ["Where it lives","On this device, until you say otherwise"]
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
     ["What it leaves","A sealed record for every step you tick"],
     ["Where it lives","On this device, until you say otherwise"]
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
    "slug":"propose-a-track",
    "seed":"contribute/000",
    "track":"start",
    "title":"Propose a track",
    "lede":"Something you want to build or teach, described well enough to be answered.",
    "meta":"",
    "about":"A track is a subject the Hub does not cover yet, brought by someone who can cover it. The proposal is short on purpose: what it is, who it is for, what exists already, and what you need from us.",
    "facts":[
     ["Who it is for","Anyone with a subject and a group in mind"],
     ["What it leaves","A sealed record of the proposal and the answer"],
     ["Where it goes","info@entrosana.com, or entrosana.com/request-access"]
    ]
   },
   {
    "slug":"review-someones-work",
    "seed":"contribute/001",
    "track":"start",
    "title":"Review someone else's work",
    "lede":"Read it against what it claims, and name the case that breaks it.",
    "meta":"",
    "about":"The most useful contribution to this project is a careful reader. A review that names one broken case is worth more than an approval, and it counts as a contribution in its own right.",
    "facts":[
     ["Who it is for","Anyone, no account needed"],
     ["What it leaves","Your copy of the review, sealed as you write it"],
     ["Where it goes","To the author, and to us if the Hub asked for it"]
    ]
   },
   {
    "slug":"ask-for-runway",
    "seed":"contribute/002",
    "track":"start",
    "title":"Ask for runway",
    "lede":"Work that needs time, machines, or a person who knows the subject.",
    "meta":"",
    "about":"Runway follows review, not the other way round: show what already got read, say what the work needs and for how long, and name what happens if the answer is no.",
    "facts":[
     ["Who it is for","Contributors with something already reviewed"],
     ["What it leaves","A written request with its trail attached"],
     ["Where it goes","info@entrosana.com"]
    ]
   }
  ]
 }
};
