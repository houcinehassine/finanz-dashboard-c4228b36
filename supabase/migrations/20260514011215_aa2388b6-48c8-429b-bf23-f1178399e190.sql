
DROP VIEW IF EXISTS public.account_balances;
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
  a.starting_balance
    + COALESCE(SUM(CASE WHEN t.kind = 'income' THEN t.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount ELSE 0 END), 0) AS balance
FROM public.accounts a
LEFT JOIN public.transactions t ON t.account_id = a.id
GROUP BY a.id;
