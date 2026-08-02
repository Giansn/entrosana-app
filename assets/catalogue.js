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
  "tracks": [
   {"id":"social",    "name":"Social"},
   {"id":"nature",    "name":"Nature"},
   {"id":"technical", "name":"Technical"}
  ],
  "list": [
   {
    "slug":"plan-a-module",
    "seed":"modules/000",
    "track":"social",
    "title":"Plan a module for your group",
    "lede":"A module built around the group you actually have, not the one a curriculum assumes.",
    "meta":"half day to 3 sessions",
    "draft":true,
    "about":"The planning happens with you, not for you. We start from what the group can do today and what it should be able to do afterwards, and everything else — place, materials, dates — follows from that one sentence.",
    "facts":[
     ["Who it is for","Any age group; works from about 8 upwards"],
     ["Group size","One class, up to 24"],
     ["Format","Half a day to three sessions"],
     ["Place","Your rooms"],
     ["Who leads it","One named lead from entrosana, with your teacher"],
     ["Cost","Scoped on request"]
    ],
    "gets":[
     "A written plan the school can hand to a substitute",
     "One named person answerable for the module",
     "A record of every decision, sealed as it is made"
    ]
   },
   {
    "slug":"take-a-group-outdoors",
    "seed":"modules/001",
    "track":"nature",
    "title":"Take a group outdoors",
    "lede":"A day outside that is prepared well enough to be boring for the adults.",
    "meta":"one day",
    "draft":true,
    "about":"The place is walked once before the group ever sees it. Weather limits, kit lists and who carries the first-aid kit are settled in advance, in writing, so the morning holds no decisions.",
    "facts":[
     ["Who it is for","Primary and lower secondary"],
     ["Group size","One class, up to 24"],
     ["Format","One day, or a series of afternoons"],
     ["Place","Forest, field or water within reach of the school"],
     ["Who leads it","One lead from entrosana, plus your staff"],
     ["Cost","Scoped on request"]
    ],
    "gets":[
     "A route that somebody has actually walked",
     "A parent letter that fits on one page",
     "Cancellation criteria decided before the day, not on it"
    ]
   },
   {
    "slug":"how-a-machine-works",
    "seed":"modules/002",
    "track":"technical",
    "title":"Teach how a machine actually works",
    "lede":"One machine the group already carries, taken apart to the point where it decides something.",
    "meta":"2 to 4 lessons",
    "draft":true,
    "about":"No code is written. The decision a machine makes is laid out on paper and cards until the group can change an input and watch the outcome turn. What they remember is the turn.",
    "facts":[
     ["Who it is for","From about 10 upwards"],
     ["Group size","One class, up to 24"],
     ["Format","Two to four lessons"],
     ["Place","Your rooms; no computer room needed"],
     ["Who leads it","One lead from entrosana"],
     ["Cost","Scoped on request"]
    ],
    "gets":[
     "A lesson that runs without devices if the network is down",
     "Material your staff can repeat next year on their own",
     "A vocabulary for talking about machine decisions with parents"
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
 }
};
