ALTER TABLE public.transactions
  ADD COLUMN IF NOT EXISTS interest_amount numeric,
  ADD COLUMN IF NOT EXISTS is_anyfin boolean NOT NULL DEFAULT false;