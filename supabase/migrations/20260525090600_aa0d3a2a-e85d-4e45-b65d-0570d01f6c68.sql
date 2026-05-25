ALTER TABLE public.category_keywords
  ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'user';

CREATE UNIQUE INDEX IF NOT EXISTS category_keywords_unique_user_kw_cat
  ON public.category_keywords (user_id, lower(keyword), category_id);