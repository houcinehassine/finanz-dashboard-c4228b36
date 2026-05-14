
UPDATE public.transactions SET category_id = NULL
WHERE category_id IN (SELECT id FROM public.categories WHERE is_system = true);

UPDATE public.recurring_rules SET category_id = NULL
WHERE category_id IN (SELECT id FROM public.categories WHERE is_system = true);

DELETE FROM public.categories WHERE is_system = true;

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, display_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1)))
  ON CONFLICT (id) DO NOTHING;

  INSERT INTO public.categories (user_id, name, kind, color, icon, is_system) VALUES
    (NEW.id, 'Gehalt',  'income'::category_kind, '#10b981', '', true),
    (NEW.id, 'Gewinn',  'income'::category_kind, '#22c55e', '', true),
    (NEW.id, 'Leon (Leihen Privat)', 'income'::category_kind,  '#06b6d4', '', true),
    (NEW.id, 'Leon (Leihen Privat)', 'expense'::category_kind, '#06b6d4', '', true),
    (NEW.id, 'Kredit',  'income'::category_kind,  '#6366f1', '', true),
    (NEW.id, 'Kredit',  'expense'::category_kind, '#6366f1', '', true),
    (NEW.id, 'Steuern', 'income'::category_kind,  '#a855f7', '', true),
    (NEW.id, 'Steuern', 'expense'::category_kind, '#a855f7', '', true),
    (NEW.id, 'Miete',         'expense'::category_kind, '#ef4444', '', true),
    (NEW.id, 'Versicherung',  'expense'::category_kind, '#f97316', '', true),
    (NEW.id, 'Allgemein',     'expense'::category_kind, '#64748b', '', true),
    (NEW.id, 'Raten',         'expense'::category_kind, '#eab308', '', true),
    (NEW.id, 'Subscription',  'expense'::category_kind, '#ec4899', '', true);

  RETURN NEW;
END;
$$;

INSERT INTO public.categories (user_id, name, kind, color, icon, is_system)
SELECT u.id, v.name, v.kind::category_kind, v.color, '', true
FROM auth.users u
CROSS JOIN (VALUES
  ('Gehalt','income','#10b981'),
  ('Gewinn','income','#22c55e'),
  ('Leon (Leihen Privat)','income','#06b6d4'),
  ('Leon (Leihen Privat)','expense','#06b6d4'),
  ('Kredit','income','#6366f1'),
  ('Kredit','expense','#6366f1'),
  ('Steuern','income','#a855f7'),
  ('Steuern','expense','#a855f7'),
  ('Miete','expense','#ef4444'),
  ('Versicherung','expense','#f97316'),
  ('Allgemein','expense','#64748b'),
  ('Raten','expense','#eab308'),
  ('Subscription','expense','#ec4899')
) AS v(name, kind, color);
