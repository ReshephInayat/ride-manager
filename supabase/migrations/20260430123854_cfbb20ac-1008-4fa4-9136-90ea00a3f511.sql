-- Backfill dedupe_key for any existing rides that lack it
UPDATE public.rides SET updated_at = updated_at WHERE dedupe_key IS NULL;

-- Drop the existing unique index so we can replace it with a real constraint
DROP INDEX IF EXISTS public.rides_user_dedupe_uniq;

-- Make sure dedupe_key is always populated (trigger guarantees it on write)
-- Add a true UNIQUE constraint (PostgREST onConflict needs a constraint, not just an index)
ALTER TABLE public.rides
  ADD CONSTRAINT rides_user_dedupe_unique UNIQUE (user_id, dedupe_key);