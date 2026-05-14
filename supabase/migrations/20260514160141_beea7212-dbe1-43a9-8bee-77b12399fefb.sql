
ALTER TYPE public.account_type ADD VALUE IF NOT EXISTS 'clearing';

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS is_liquid boolean NOT NULL DEFAULT true;

ALTER TABLE public.accounts
  ADD COLUMN IF NOT EXISTS linked_loan_account_id uuid NULL;

DROP VIEW IF EXISTS public.account_balances;
DROP VIEW IF EXISTS public.monthly_summary;

CREATE VIEW public.account_balances AS
SELECT
  a.id AS account_id,
  a.user_id,
  a.name,
  a.type,
  a.archived,
  a.icon,
  a.starting_balance,
  a.credit_limit,
  a.loan_principal,
  a.loan_interest_rate,
  a.loan_term_months,
  a.loan_due_on,
  a.is_liquid,
  a.linked_loan_account_id,
  a.starting_balance
    + COALESCE((SELECT sum(
        CASE WHEN t.kind = 'income'::transaction_kind  THEN t.amount ELSE 0 END
      - CASE WHEN t.kind = 'expense'::transaction_kind THEN t.amount ELSE 0 END)
      FROM public.transactions t WHERE t.account_id = a.id), 0)
    + COALESCE((SELECT sum(
        CASE WHEN t.kind = 'expense'::transaction_kind THEN t.amount ELSE 0 END
      - CASE WHEN t.kind = 'income'::transaction_kind  THEN t.amount ELSE 0 END)
      FROM public.transactions t WHERE t.loan_account_id = a.id), 0) AS balance
FROM public.accounts a;

CREATE VIEW public.monthly_summary AS
SELECT
  t.user_id,
  date_trunc('month', t.occurred_on::timestamptz)::date AS month,
  COALESCE(sum(t.amount) FILTER (WHERE t.kind = 'income'::transaction_kind), 0)  AS income,
  COALESCE(sum(t.amount) FILTER (WHERE t.kind = 'expense'::transaction_kind), 0) AS expense,
  COALESCE(sum(t.amount) FILTER (WHERE t.kind = 'income'::transaction_kind), 0)
    - COALESCE(sum(t.amount) FILTER (WHERE t.kind = 'expense'::transaction_kind), 0) AS net
FROM public.transactions t
JOIN public.accounts a ON a.id = t.account_id
WHERE a.is_liquid = true
GROUP BY t.user_id, date_trunc('month', t.occurred_on::timestamptz);
