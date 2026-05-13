
ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS credit_limit NUMERIC,
  ADD COLUMN IF NOT EXISTS loan_principal NUMERIC,
  ADD COLUMN IF NOT EXISTS loan_interest_rate NUMERIC,
  ADD COLUMN IF NOT EXISTS loan_term_months INTEGER;

DROP VIEW IF EXISTS public.account_balances;

CREATE VIEW public.account_balances
WITH (security_invoker = on) AS
SELECT
  a.id AS account_id,
  a.user_id,
  a.name,
  a.type,
  a.archived,
  a.starting_balance,
  a.credit_limit,
  a.loan_principal,
  a.loan_interest_rate,
  a.loan_term_months,
  a.starting_balance
    + COALESCE((SELECT SUM(amount) FROM public.transactions t
                 WHERE t.account_id = a.id AND t.kind = 'income'), 0)
    - COALESCE((SELECT SUM(amount) FROM public.transactions t
                 WHERE t.account_id = a.id AND t.kind = 'expense'), 0)
    AS balance
FROM public.accounts a;
