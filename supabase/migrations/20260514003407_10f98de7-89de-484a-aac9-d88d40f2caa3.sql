ALTER TABLE public.transactions
  ADD COLUMN loan_account_id UUID REFERENCES public.accounts(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_transactions_loan_account ON public.transactions(loan_account_id);