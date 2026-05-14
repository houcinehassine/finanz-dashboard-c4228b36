
CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email));

  insert into public.categories (user_id, name, kind, color, icon) values
    (new.id, 'Lohn',            'income',  '#10b981', '💼'),
    (new.id, 'Abonnement',      'expense', '#22c55e', '📺'),
    (new.id, 'Allgemein',       'expense', '#94a3b8', '🧾'),
    (new.id, 'Freizeit',        'expense', '#f59e0b', '🎉'),
    (new.id, 'Geschenke',       'expense', '#a855f7', '🎁'),
    (new.id, 'Gesundheit',      'expense', '#ef4444', '⚕️'),
    (new.id, 'Kredit',          'expense', '#ec4899', '🏦'),
    (new.id, 'Lebensmittel',    'expense', '#16a34a', '🛒'),
    (new.id, 'Leihen privat',   'expense', '#f472b6', '🤝'),
    (new.id, 'Miete',           'expense', '#8b5cf6', '🏠'),
    (new.id, 'Nebenkosten',     'expense', '#f97316', '💡'),
    (new.id, 'Raten',           'expense', '#fb923c', '💳'),
    (new.id, 'Rundfunkbeitrag', 'expense', '#7c3aed', '📡'),
    (new.id, 'Sonstiges',       'expense', '#64748b', '💸'),
    (new.id, 'Sparen',          'expense', '#10b981', '🐖'),
    (new.id, 'Transport',       'expense', '#3b82f6', '🚗'),
    (new.id, 'Versicherung',    'expense', '#06b6d4', '🛡️');
  return new;
end;
$function$;

WITH defaults(name, kind, color, icon) AS (
  VALUES
    ('Lohn',            'income'::category_kind,  '#10b981', '💼'),
    ('Abonnement',      'expense'::category_kind, '#22c55e', '📺'),
    ('Allgemein',       'expense'::category_kind, '#94a3b8', '🧾'),
    ('Freizeit',        'expense'::category_kind, '#f59e0b', '🎉'),
    ('Geschenke',       'expense'::category_kind, '#a855f7', '🎁'),
    ('Gesundheit',      'expense'::category_kind, '#ef4444', '⚕️'),
    ('Kredit',          'expense'::category_kind, '#ec4899', '🏦'),
    ('Lebensmittel',    'expense'::category_kind, '#16a34a', '🛒'),
    ('Leihen privat',   'expense'::category_kind, '#f472b6', '🤝'),
    ('Miete',           'expense'::category_kind, '#8b5cf6', '🏠'),
    ('Nebenkosten',     'expense'::category_kind, '#f97316', '💡'),
    ('Raten',           'expense'::category_kind, '#fb923c', '💳'),
    ('Rundfunkbeitrag', 'expense'::category_kind, '#7c3aed', '📡'),
    ('Sonstiges',       'expense'::category_kind, '#64748b', '💸'),
    ('Sparen',          'expense'::category_kind, '#10b981', '🐖'),
    ('Transport',       'expense'::category_kind, '#3b82f6', '🚗'),
    ('Versicherung',    'expense'::category_kind, '#06b6d4', '🛡️')
)
INSERT INTO public.categories (user_id, name, kind, color, icon)
SELECT u.id, d.name, d.kind, d.color, d.icon
FROM auth.users u
CROSS JOIN defaults d
WHERE NOT EXISTS (
  SELECT 1 FROM public.categories c WHERE c.user_id = u.id AND c.name = d.name
);
