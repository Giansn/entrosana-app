# Record trail

The Hub keeps two chains of records. One is yours, in your browser; one is the Hub's, on the server. Both are hash chains: every entry carries the hash of the one before, so nothing can be altered or removed without the chain showing it.

## Your trail, in the browser

Everything you do on the board is an entry: a card moved, a step done, a project opened. **All records** and **Today** in the rail list them; **Verify chain** recomputes the hashes and tells you whether the chain holds; **Export trail** gives you the whole thing as JSON. Nothing of it reaches the Hub unless you attach it to a proposal.

## The Hub's chain, on the server

Every step the Hub takes is a line: a sign-in link requested, an address confirmed, a proposal received, a decision, a publication, a role granted, a service added, a file uploaded. Each line holds the time, the kind, the account number of who did it, the resource, and a short text. It holds no names, no addresses and no content, only what happened.

`GET /api/audit/verify` recomputes the whole chain and answers whether it holds and how long it is. Anyone may call it.

## Why it is kept for good

The chain is what proves that the history of a module was not rewritten: who proposed it, who decided, who published, and when. It is the one thing the Hub keeps without a deletion date, and the privacy statement says so.

## What erasure leaves

When an account is erased, its lines stay in the chain with the account number, but the number no longer points at a name or an address. If the person chose to keep their name on a published module, the name stays on the module, not in the chain.
