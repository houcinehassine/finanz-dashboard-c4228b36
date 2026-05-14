ALTER TABLE public.recurring_rules
  ADD COLUMN loan_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_recurring_rules_loan_account ON public.recurring_rules(loan_account_id);

CREATE OR REPLACE FUNCTION public.process_due_recurring()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  r RECORD;
  created_count INTEGER := 0;
  due DATE;
BEGIN
  IF uid IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  FOR r IN
    SELECT * FROM public.recurring_rules
    WHERE user_id = uid AND active = true AND next_due_on <= CURRENT_DATE
    FOR UPDATE
  LOOP
    due := r.next_due_on;
    WHILE due <= CURRENT_DATE LOOP
      INSERT INTO public.transactions (user_id, account_id, category_id, loan_account_id, kind, amount, occurred_on, note)
      VALUES (r.user_id, r.account_id, r.category_id, r.loan_account_id, r.kind, r.amount, due,
              COALESCE(r.note, '') || ' (auto)');
      created_count := created_count + 1;
      due := public.advance_date(due, r.frequency);
    END LOOP;

    UPDATE public.recurring_rules
      SET next_due_on = due, last_booked_on = CURRENT_DATE
      WHERE id = r.id;
  END LOOP;

  RETURN created_count;
END;
$function$;