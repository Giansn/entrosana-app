// policy.mjs — wer darf was. Alles, was nicht aufgeführt ist, ist verweigert.
// Die Tabelle steht in docs/contributions.md; dieses Modul ist ihre Umsetzung.
export const ACTIONS = ["submit", "read", "withdraw", "decide", "publish", "grant"];
export const OPEN = new Set(["received", "confirmed", "reviewing"]);

const BY_ROLE = {
  reviewer: new Set(["submit", "read", "decide", "publish"]),
  owner:    new Set(["submit", "read", "withdraw", "decide", "publish", "grant"]),
};

// actor: null (anonym) oder { id, roles: Set }.
// resource: null oder { kind: "contribution", actor_id, status }.
export function can(actor, action, resource = null) {
  if (!ACTIONS.includes(action)) return false;
  if (action === "submit") return true;                       // anonym eingeschlossen
  if (!actor || !actor.id) return false;
  const roles = actor.roles instanceof Set ? actor.roles : new Set(actor.roles || []);
  if (roles.has("owner") && BY_ROLE.owner.has(action)) return true;
  if (roles.has("reviewer") && BY_ROLE.reviewer.has(action)) return true;
  // Einreichende: nur der eigene Beitrag, zurückziehen nur solange er offen ist.
  if (resource && resource.kind === "contribution" && resource.actor_id === actor.id) {
    if (action === "read") return true;
    if (action === "withdraw") return OPEN.has(resource.status);
  }
  return false;
}

export function rolesOf(db, actorId) {
  return new Set(db.prepare("SELECT role FROM roles WHERE actor_id = ?").all(actorId).map(r => r.role));
}
