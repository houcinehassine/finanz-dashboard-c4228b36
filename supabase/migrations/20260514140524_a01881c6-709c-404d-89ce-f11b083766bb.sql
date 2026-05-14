DROP VIEW IF EXISTS public.account_balances;
CREATE VIEW public.account_balances
WITH (security_invoker = true)
AS
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
     a.starting_balance
       + COALESCE((SELECT SUM(CASE WHEN t.kind = 'income'::transaction_kind THEN t.amount ELSE 0 END
                              - CASE WHEN t.kind = 'expense'::transaction_kind THEN t.amount ELSE 0 END)
                   FROM public.transactions t WHERE t.account_id = a.id), 0)
       + COALESCE((SELECT SUM(CASE WHEN t.kind = 'expense'::transaction_kind THEN t.amount ELSE 0 END
                              - CASE WHEN t.kind = 'income'::transaction_kind THEN t.amount ELSE 0 END)
                   FROM public.transactions t WHERE t.loan_account_id = a.id), 0)
       AS balance
FROM public.accounts a;