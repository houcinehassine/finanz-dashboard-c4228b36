-- Frequency enum
CREATE TYPE public.recurring_frequency AS ENUM ('monthly', 'quarterly', 'yearly');

-- Recurring rules table
CREATE TABLE public.recurring_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  account_id UUID NOT NULL,
  category_id UUID,
  kind public.transaction_kind NOT NULL DEFAULT 'expense',
  amount NUMERIC NOT NULL CHECK (amount >= 0),
  note TEXT,
  frequency public.recurring_frequency NOT NULL,
  start_on DATE NOT NULL DEFAULT CURRENT_DATE,
  next_due_on DATE NOT NULL,
  last_booked_on DATE,
  active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.recurring_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "recurring_rules_all_own" ON public.recurring_rules
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE INDEX idx_recurring_rules_user_due ON public.recurring_rules(user_id, next_due_on) WHERE active;

-- Helper: advance a date by frequency
CREATE OR REPLACE FUNCTION public.advance_date(d DATE, f public.recurring_frequency)
RETURNS DATE
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE f
    WHEN 'monthly' THEN d + INTERVAL '1 month'
    WHEN 'quarterly' THEN d + INTERVAL '3 months'
    WHEN 'yearly' THEN d + INTERVAL '1 year'
  END::DATE
$$;

-- Process due recurring rules for the calling user
CREATE OR REPLACE FUNCTION public.process_due_recurring()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      INSERT INTO public.transactions (user_id, account_id, category_id, kind, amount, occurred_on, note)
      VALUES (r.user_id, r.account_id, r.category_id, r.kind, r.amount, due,
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
$$;