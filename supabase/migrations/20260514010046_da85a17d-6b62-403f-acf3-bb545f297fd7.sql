
-- Update system categories to include emoji icons
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  INSERT INTO public.categories (user_id, name, kind, color, icon, is_system) VALUES
    (NEW.id, 'Gehalt',              'income',  '#10b981', '💰', true),
    (NEW.id, 'Gewinn',              'income',  '#22c55e', '📈', true),
    (NEW.id, 'Leon (Leihen Privat)','income',  '#06b6d4', '🤝', true),
    (NEW.id, 'Leon (Leihen Privat)','expense', '#06b6d4', '🤝', true),
    (NEW.id, 'Kredit',              'income',  '#6366f1', '🏦', true),
    (NEW.id, 'Kredit',              'expense', '#6366f1', '🏦', true),
    (NEW.id, 'Steuern',             'income',  '#a855f7', '🧾', true),
    (NEW.id, 'Steuern',             'expense', '#a855f7', '🧾', true),
    (NEW.id, 'Miete',               'expense', '#ef4444', '🏠', true),
    (NEW.id, 'Versicherung',        'expense', '#f97316', '🛡️', true),
    (NEW.id, 'Allgemein',           'expense', '#64748b', '🧩', true),
    (NEW.id, 'Raten',               'expense', '#eab308', '💳', true),
    (NEW.id, 'Subscription',        'expense', '#ec4899', '🔁', true);
  RETURN NEW;
END;
$$;

-- Backfill: set icons on existing system categories by name
UPDATE public.categories SET icon = '💰'  WHERE is_system AND name = 'Gehalt';
UPDATE public.categories SET icon = '📈'  WHERE is_system AND name = 'Gewinn';
UPDATE public.categories SET icon = '🤝'  WHERE is_system AND name = 'Leon (Leihen Privat)';
UPDATE public.categories SET icon = '🏦'  WHERE is_system AND name = 'Kredit';
UPDATE public.categories SET icon = '🧾'  WHERE is_system AND name = 'Steuern';
UPDATE public.categories SET icon = '🏠'  WHERE is_system AND name = 'Miete';
UPDATE public.categories SET icon = '🛡️' WHERE is_system AND name = 'Versicherung';
UPDATE public.categories SET icon = '🧩'  WHERE is_system AND name = 'Allgemein';
UPDATE public.categories SET icon = '💳'  WHERE is_system AND name = 'Raten';
UPDATE public.categories SET icon = '🔁'  WHERE is_system AND name = 'Subscription';
