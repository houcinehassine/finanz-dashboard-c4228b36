ALTER TABLE public.import_rules
  ADD COLUMN IF NOT EXISTS conditions JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS logic TEXT NOT NULL DEFAULT 'AND',
  ADD COLUMN IF NOT EXISTS action_note TEXT,
  ADD COLUMN IF NOT EXISTS action_account_id UUID,
  ADD COLUMN IF NOT EXISTS action_transfer_to_account_id UUID;

ALTER TABLE public.import_rules
  ALTER COLUMN condition_field DROP NOT NULL,
  ALTER COLUMN condition_op DROP NOT NULL,
  ALTER COLUMN condition_value DROP NOT NULL;