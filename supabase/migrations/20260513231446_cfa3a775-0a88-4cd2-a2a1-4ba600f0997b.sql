
DROP VIEW IF EXISTS public.account_balances;

CREATE VIEW public.account_balances
WITH (security_invoker=on) AS
SELECT
  a.id AS account_id,
  a.user_id,
  a.name,
  a.type,
  a.archived,
  a.starting_balance,
  a.starting_balance
    + COALESCE(SUM(CASE WHEN t.kind = 'income'  THEN t.amount ELSE 0 END), 0)
    - COALESCE(SUM(CASE WHEN t.kind = 'expense' THEN t.amount ELSE 0 END), 0)
    AS balance
FROM public.accounts a
LEFT JOIN public.transactions t ON t.account_id = a.id
GROUP BY a.id;
