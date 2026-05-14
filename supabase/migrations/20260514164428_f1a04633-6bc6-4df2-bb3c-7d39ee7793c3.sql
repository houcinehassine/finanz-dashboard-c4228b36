
ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS transfer_to_account_id uuid NULL;

CREATE OR REPLACE FUNCTION public.validate_transaction()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.kind = 'transfer'::transaction_kind THEN
    IF NEW.transfer_to_account_id IS NULL THEN
      RAISE EXCEPTION 'transfer_to_account_id is required for transfers';
    END IF;
    IF NEW.transfer_to_account_id = NEW.account_id THEN
      RAISE EXCEPTION 'transfer source and destination must differ';
    END IF;
  ELSE
    IF NEW.transfer_to_account_id IS NOT NULL THEN
      RAISE EXCEPTION 'transfer_to_account_id must be NULL for non-transfer transactions';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_transaction_trg ON public.transactions;
CREATE TRIGGER validate_transaction_trg
  BEFORE INSERT OR UPDATE ON public.transactions
  FOR EACH ROW EXECUTE FUNCTION public.validate_transaction();

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
      - CASE WHEN t.kind = 'expense'::transaction_kind THEN t.amount ELSE 0 END
      - CASE WHEN t.kind = 'transfer'::transaction_kind THEN t.amount ELSE 0 END)
      FROM public.transactions t WHERE t.account_id = a.id), 0)
    + COALESCE((SELECT sum(
        CASE WHEN t.kind = 'expense'::transaction_kind THEN t.amount ELSE 0 END
      - CASE WHEN t.kind = 'income'::transaction_kind  THEN t.amount ELSE 0 END)
      FROM public.transactions t WHERE t.loan_account_id = a.id), 0)
    + COALESCE((SELECT sum(t.amount)
      FROM public.transactions t
      WHERE t.kind = 'transfer'::transaction_kind AND t.transfer_to_account_id = a.id), 0)
    AS balance
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
  AND t.kind <> 'transfer'::transaction_kind
GROUP BY t.user_id, date_trunc('month', t.occurred_on::timestamptz);
