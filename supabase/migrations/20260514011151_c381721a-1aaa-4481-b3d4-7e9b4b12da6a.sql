
ALTER TABLE public.accounts ADD COLUMN IF NOT EXISTS icon TEXT NOT NULL DEFAULT '🏦';

UPDATE public.accounts SET icon = '🏦' WHERE icon = '' OR icon IS NULL OR (type IN ('checking','savings') AND icon = '🏦');
UPDATE public.accounts SET icon = '💳' WHERE type = 'credit_card' AND icon = '🏦';
UPDATE public.accounts SET icon = '🏛️' WHERE type = 'loan' AND icon = '🏦';
UPDATE public.accounts SET icon = '💰' WHERE type = 'savings' AND icon = '🏦';
