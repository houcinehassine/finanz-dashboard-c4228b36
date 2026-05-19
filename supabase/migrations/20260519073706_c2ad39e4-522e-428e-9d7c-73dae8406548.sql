-- Block 1: purpose column + import_rules table

ALTER TABLE public.transactions ADD COLUMN IF NOT EXISTS purpose TEXT;

CREATE TABLE IF NOT EXISTS public.import_rules (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  active BOOLEAN NOT NULL DEFAULT true,
  priority INTEGER NOT NULL DEFAULT 100,
  condition_field TEXT NOT NULL CHECK (condition_field IN ('note','purpose','amount','kind')),
  condition_op TEXT NOT NULL CHECK (condition_op IN ('contains','equals','gt','lt','eq')),
  condition_value TEXT NOT NULL,
  action_category_id UUID,
  action_kind TEXT CHECK (action_kind IN ('income','expense','transfer')),
  action_loan_account_id UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.import_rules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS import_rules_all_own ON public.import_rules;
CREATE POLICY import_rules_all_own ON public.import_rules
  FOR ALL TO public
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE INDEX IF NOT EXISTS import_rules_user_priority_idx
  ON public.import_rules (user_id, priority);