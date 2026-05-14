ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS loan_due_on date;

DROP VIEW IF EXISTS public.account_balances;
CREATE VIEW public.account_balances AS
SELECT a.id AS account_id,
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
     a.starting_balance + COALESCE(sum(
         CASE WHEN t.kind = 'income'::transaction_kind THEN t.amount ELSE 0::numeric END), 0::numeric)
       - COALESCE(sum(
         CASE WHEN t.kind = 'expense'::transaction_kind THEN t.amount ELSE 0::numeric END), 0::numeric) AS balance
FROM public.accounts a
LEFT JOIN public.transactions t ON t.account_id = a.id
GROUP BY a.id;