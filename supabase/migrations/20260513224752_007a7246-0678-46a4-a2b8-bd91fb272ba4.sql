
-- Enums
create type public.account_type as enum ('checking', 'savings', 'credit_card', 'loan');
create type public.category_kind as enum ('income', 'expense');
create type public.transaction_kind as enum ('income', 'expense');

-- Profiles
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  created_at timestamptz not null default now()
);
alter table public.profiles enable row level security;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

-- Accounts
create table public.accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  type public.account_type not null default 'checking',
  starting_balance numeric(14,2) not null default 0,
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.accounts enable row level security;
create policy "accounts_all_own" on public.accounts for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.accounts(user_id);

-- Categories
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  kind public.category_kind not null,
  color text not null default '#64748b',
  icon text not null default '💸',
  archived boolean not null default false,
  created_at timestamptz not null default now()
);
alter table public.categories enable row level security;
create policy "categories_all_own" on public.categories for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.categories(user_id);

-- Transactions
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.accounts(id) on delete cascade,
  category_id uuid references public.categories(id) on delete set null,
  kind public.transaction_kind not null,
  amount numeric(14,2) not null check (amount >= 0),
  occurred_on date not null default current_date,
  note text,
  created_at timestamptz not null default now()
);
alter table public.transactions enable row level security;
create policy "transactions_all_own" on public.transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
create index on public.transactions(user_id);
create index on public.transactions(account_id);
create index on public.transactions(occurred_on);

-- Views
create or replace view public.account_balances
with (security_invoker = true)
as
select
  a.id as account_id,
  a.user_id,
  a.name,
  a.type,
  a.archived,
  a.starting_balance
    + coalesce(sum(t.amount) filter (where t.kind = 'income'), 0)
    - coalesce(sum(t.amount) filter (where t.kind = 'expense'), 0) as balance
from public.accounts a
left join public.transactions t on t.account_id = a.id
group by a.id;

create or replace view public.monthly_summary
with (security_invoker = true)
as
select
  user_id,
  date_trunc('month', occurred_on)::date as month,
  coalesce(sum(amount) filter (where kind = 'income'), 0) as income,
  coalesce(sum(amount) filter (where kind = 'expense'), 0) as expense,
  coalesce(sum(amount) filter (where kind = 'income'), 0)
    - coalesce(sum(amount) filter (where kind = 'expense'), 0) as net
from public.transactions
group by user_id, date_trunc('month', occurred_on);

-- Profile auto-create on signup
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'display_name', new.email));

  -- Seed default categories
  insert into public.categories (user_id, name, kind, color, icon) values
    (new.id, 'Gehalt', 'income', '#10b981', '💼'),
    (new.id, 'Sonstige Einnahmen', 'income', '#22c55e', '💰'),
    (new.id, 'Lebensmittel', 'expense', '#f59e0b', '🛒'),
    (new.id, 'Wohnen', 'expense', '#ef4444', '🏠'),
    (new.id, 'Abonnements', 'expense', '#8b5cf6', '📺'),
    (new.id, 'Transport', 'expense', '#3b82f6', '🚗'),
    (new.id, 'Sonstiges', 'expense', '#64748b', '💸');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
