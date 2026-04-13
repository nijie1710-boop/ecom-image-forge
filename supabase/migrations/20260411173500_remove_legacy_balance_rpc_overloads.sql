-- PostgREST cannot disambiguate overloaded RPC functions reliably.
-- Keep only the numeric signatures used by the Edge Functions.

DROP FUNCTION IF EXISTS public.add_balance(uuid, integer, text, text);
DROP FUNCTION IF EXISTS public.deduct_balance(uuid, integer, text, text);

NOTIFY pgrst, 'reload schema';
