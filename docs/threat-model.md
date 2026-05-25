# Threat Model

This document describes the attacker assumptions and the threats that the multi-layer defense pattern in this repository is designed to address.

## Attacker Model

We assume an attacker who:

1. Has a valid authenticated session for some user account (call them Eve). Eve is a legitimate user of the system, not an external attacker.
2. Can call any server action exposed by this app with arbitrary arguments (including arbitrary `noteId` values).
3. Cannot directly query the Supabase database — they can only go through the Next.js server actions or the public REST API exposed by Supabase (which RLS protects).
4. May know the IDs of resources owned by other users (e.g. through a leaked URL, a bug bounty report, or a guessable UUID scheme). We do not rely on ID secrecy for security.

## Threats

| ID | Threat | Defense layer | Mechanism |
|----|--------|---------------|-----------|
| T1 | Eve calls `updateNote(victimNoteId, ...)` to modify a note she does not own | Layer 1 (RLS) + Layer 2 (app re-check) | The RLS UPDATE policy filters on `auth.uid() = owner_id`. Before the UPDATE fires, the server action re-checks ownership and returns `NOT_FOUND`. |
| T2 | Eve calls a future endpoint with a `{ ownerId: eveId }` patch to steal a note | Layer 1 (RLS `WITH CHECK`) | The RLS UPDATE policy uses `WITH CHECK (auth.uid() = owner_id)`, which blocks rewriting `owner_id`. (The current server action does not expose this field; this is belt and braces.) |
| T3 | Eve enumerates note IDs to learn which exist | Application-layer error normalization | The server action returns `NOT_FOUND` for both "does not exist" and "exists but not owned by you" to avoid existence leaks. |
| T4 | A future migration accidentally weakens the RLS policy | Layer 2 (app re-check) | Even if Layer 1 weakens, the application-layer ownership re-check still blocks the write. |
| T5 | An unauthenticated caller hits a server action | Authentication gate | The server action returns `NOT_AUTHENTICATED` early if `supabase.auth.getUser()` yields no user. |
| T6 | An AI-suggested RLS policy silently misuses `auth.uid()` in server-action context | Process (Layer 3) | All authorization changes (RLS migrations, server actions) require human review against Supabase primary docs before merge. |

## Non-Goals

- We do not defend against compromised user credentials. If Eve has the victim's session token, she is the victim from the system's point of view.
- We do not defend against the misuse of Supabase service-role keys. Service-role keys bypass RLS by design and must never be exposed to the browser.
- We do not defend against side-channel timing attacks on RLS evaluation.

## Lessons Carried From a Real Incident

This pattern is informed by an incident in my work at deilight:

- An AI-suggested RLS policy looked logically correct on paper, but the expression interacted with `auth.uid()` in a way I had not fully understood when first reading the suggestion.
- Once I caught the discrepancy by reading the Supabase primary docs, I rewrote the policy by hand and added an application-layer re-check as a belt-and-braces measure.
- The rule I carry from this: **authorization code is the place where AI output must be verified against the primary source**, and the application layer must never trust the database layer alone.
