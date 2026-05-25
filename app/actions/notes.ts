'use server';

/**
 * Server Action: Notes
 *
 * Multi-layer defense pattern:
 *   Layer 1: Supabase RLS restricts SELECT / UPDATE / DELETE to auth.uid() = owner_id
 *   Layer 2: This server action re-validates "requester is the owner" on the
 *            application layer before any mutation, regardless of RLS.
 *   Layer 3: AI-generated authorization logic is always human-reviewed before merge.
 *
 * Why both layers?
 *   RLS alone protects against "tenant A reads tenant B's rows" at the DB level,
 *   but a server action receives noteId from the client. If a future change weakens
 *   the RLS policy by accident (e.g. a typo in WHERE clause), the application-layer
 *   re-check still blocks unauthorized mutation. Defense in depth.
 *
 *   This pattern is informed by a real incident in my work at deilight, where
 *   an AI-suggested RLS policy looked logically correct but did not account for
 *   how Supabase's auth.uid() behaves inside server actions. Since then, I treat
 *   authorization as a place where AI-generated code MUST be reviewed by hand
 *   against the primary source (Supabase docs).
 */

import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { revalidatePath } from 'next/cache';

type Result = { ok: true } | { ok: false; reason: string };

async function getSupabase() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll: () => cookieStore.getAll(),
        setAll: (toSet) =>
          toSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          ),
      },
    }
  );
}

/**
 * Update a note. Multi-layer defense:
 *   1. Get the authenticated user from the session.
 *   2. Re-check ownership on the application layer (do NOT rely on RLS alone).
 *   3. Issue the UPDATE; RLS will still filter by auth.uid() = owner_id.
 *
 * On unauthorized access we deliberately return NOT_FOUND instead of
 * FORBIDDEN to avoid leaking existence of resources to other users.
 */
export async function updateNote(
  noteId: string,
  patch: { title?: string; body?: string }
): Promise<Result> {
  const supabase = await getSupabase();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, reason: 'NOT_AUTHENTICATED' };

  // Layer 2: application-layer ownership re-check.
  const { data: existing, error: fetchErr } = await supabase
    .from('notes')
    .select('owner_id')
    .eq('id', noteId)
    .maybeSingle();

  if (fetchErr) return { ok: false, reason: 'FETCH_FAILED' };
  if (!existing) return { ok: false, reason: 'NOT_FOUND' };
  if (existing.owner_id !== user.id) {
    return { ok: false, reason: 'NOT_FOUND' };
  }

  // Layer 1 (RLS) is implicit: it filters by auth.uid() = owner_id.
  const { error: updateErr } = await supabase
    .from('notes')
    .update(patch)
    .eq('id', noteId);

  if (updateErr) return { ok: false, reason: 'UPDATE_FAILED' };

  revalidatePath('/notes');
  return { ok: true };
}
