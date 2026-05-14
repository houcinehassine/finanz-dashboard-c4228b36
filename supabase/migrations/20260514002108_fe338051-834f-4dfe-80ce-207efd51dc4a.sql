
ALTER TABLE public.categories
  ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false;

UPDATE public.categories SET is_system = true;

CREATE OR REPLACE FUNCTION public.handle_new_user()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email));

  insert into public.categories (user_id, name, kind, color, icon, is_system) values
    (new.id, 'Lohn',            'income',  '#10b981', '💼', true),
    (new.id, 'Abonnement',      'expense', '#22c55e', '📺', true),
    (new.id, 'Allgemein',       'expense', '#94a3b8', '🧾', true),
    (new.id, 'Freizeit',        'expense', '#f59e0b', '🎉', true),
    (new.id, 'Geschenke',       'expense', '#a855f7', '🎁', true),
    (new.id, 'Gesundheit',      'expense', '#ef4444', '⚕️', true),
    (new.id, 'Kredit',          'expense', '#ec4899', '🏦', true),
    (new.id, 'Lebensmittel',    'expense', '#16a34a', '🛒', true),
    (new.id, 'Leihen privat',   'expense', '#f472b6', '🤝', true),
    (new.id, 'Miete',           'expense', '#8b5cf6', '🏠', true),
    (new.id, 'Nebenkosten',     'expense', '#f97316', '💡', true),
    (new.id, 'Raten',           'expense', '#fb923c', '💳', true),
    (new.id, 'Rundfunkbeitrag', 'expense', '#7c3aed', '📡', true),
    (new.id, 'Sonstiges',       'expense', '#64748b', '💸', true),
    (new.id, 'Sparen',          'expense', '#10b981', '🐖', true),
    (new.id, 'Transport',       'expense', '#3b82f6', '🚗', true),
    (new.id, 'Versicherung',    'expense', '#06b6d4', '🛡️', true);
  return new;
end;
$function$;
