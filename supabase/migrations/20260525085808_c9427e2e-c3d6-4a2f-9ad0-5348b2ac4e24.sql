
CREATE TABLE public.category_keywords (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  category_id UUID NOT NULL REFERENCES public.categories(id) ON DELETE CASCADE,
  keyword TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_category_keywords_user ON public.category_keywords(user_id);
CREATE UNIQUE INDEX uq_category_keywords_user_kw_cat ON public.category_keywords(user_id, lower(keyword), category_id);

ALTER TABLE public.category_keywords ENABLE ROW LEVEL SECURITY;

CREATE POLICY "category_keywords_all_own" ON public.category_keywords
  FOR ALL USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
