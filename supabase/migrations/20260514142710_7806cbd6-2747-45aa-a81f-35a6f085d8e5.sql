
ALTER TABLE public.recurring_rules
  ADD COLUMN IF NOT EXISTS name TEXT,
  ADD COLUMN IF NOT EXISTS day_of_month INTEGER CHECK (day_of_month BETWEEN 1 AND 28),
  ADD COLUMN IF NOT EXISTS end_on DATE;

-- Backfill name from note where missing
UPDATE public.recurring_rules SET name = COALESCE(NULLIF(note, ''), 'Buchung') WHERE name IS NULL;

-- Update process_due_recurring to honor end_on
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
      AND (end_on IS NULL OR next_due_on <= end_on)
    FOR UPDATE
  LOOP
    due := r.next_due_on;
    WHILE due <= CURRENT_DATE AND (r.end_on IS NULL OR due <= r.end_on) LOOP
      INSERT INTO public.transactions (user_id, account_id, category_id, loan_account_id, kind, amount, occurred_on, note)
      VALUES (r.user_id, r.account_id, r.category_id, r.loan_account_id, r.kind, r.amount, due,
              COALESCE(r.name, r.note, '') );
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

-- New: book one occurrence now for a single rule
CREATE OR REPLACE FUNCTION public.book_recurring_now(rule_id UUID)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  uid UUID := auth.uid();
  r RECORD;
  new_tx_id UUID;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Not authenticated'; END IF;

  SELECT * INTO r FROM public.recurring_rules WHERE id = rule_id AND user_id = uid FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Rule not found'; END IF;

  INSERT INTO public.transactions (user_id, account_id, category_id, loan_account_id, kind, amount, occurred_on, note)
  VALUES (r.user_id, r.account_id, r.category_id, r.loan_account_id, r.kind, r.amount, CURRENT_DATE,
          COALESCE(r.name, r.note, ''))
  RETURNING id INTO new_tx_id;

  UPDATE public.recurring_rules
    SET next_due_on = public.advance_date(GREATEST(r.next_due_on, CURRENT_DATE), r.frequency),
        last_booked_on = CURRENT_DATE
    WHERE id = r.id;

  RETURN new_tx_id;
END;
$function$;
