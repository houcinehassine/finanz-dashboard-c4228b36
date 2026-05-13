ALTER FUNCTION public.advance_date(DATE, public.recurring_frequency) SET search_path = public;

REVOKE EXECUTE ON FUNCTION public.process_due_recurring() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.process_due_recurring() TO authenticated;

REVOKE EXECUTE ON FUNCTION public.advance_date(DATE, public.recurring_frequency) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.advance_date(DATE, public.recurring_frequency) TO authenticated;