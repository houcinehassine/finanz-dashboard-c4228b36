## Ziel

Web-App auf Deutsch für persönliche Finanzen. Ledger-Architektur: jede Transaktion ist ein Income oder Expense, alle Salden werden dynamisch berechnet. v1 als MVP, weitere Module folgen.

## Stack

- TanStack Start + React + Tailwind + shadcn/ui (responsive, mobile-first)
- Lovable Cloud (Postgres + Auth) — Hinweis: kein lokales SQLite/PocketBase möglich
- Auth: Email+Passwort und Google
- Charts: Recharts
- State: TanStack Query + Zustand (für Cross-View Updates)

## Scope v1 (MVP)

**Module enthalten:**
1. Auth (Email/Passwort + Google), Profil, geschützte Routen
2. Bankkonten verwalten (anlegen/bearbeiten/löschen, Typ, Startsaldo)
3. Kategorien-Manager (CRUD, Farbe, Emoji-Icon, Typ income/expense)
4. Transaktionen: Einnahmen + einmalige Ausgaben (CRUD, Konto, Kategorie, Betrag, Datum, Notiz)
5. Dashboard mit Kerncharts:
   - Konto-Kacheln mit Live-Salden
   - Monatsübersicht: Einnahmen vs. Ausgaben (Balken)
   - Ausgaben-Kategorien (Tortendiagramm)
   - Monatlicher Netto-Saldo
6. Transaktionsliste mit Filter (Konto, Kategorie, Zeitraum)
7. Deutsche UI

**Nicht in v1 (Folge-Iterationen):**
- Wiederkehrende Ausgaben + Scheduler/Trigger-Button
- Kreditkarten als Entität (Limit/Auslastung Gauge)
- Kredite (TF Bank, Anyfin) inkl. Restschuld-Berechnung & Verlaufschart
- CSV-Import aus Notion
- Jahresberichte / Mehrjahres-Liniendiagramme
- i18n EN-Umschalter
- 2FA

## Datenmodell (Lovable Cloud / Postgres)

```text
profiles(id, email, display_name)
accounts(id, user_id, name, type, starting_balance, archived, created_at)
  type ∈ {checking, savings, credit_card, loan}
categories(id, user_id, name, kind, color, icon, archived)
  kind ∈ {income, expense}
transactions(id, user_id, account_id, category_id, kind, amount, occurred_on, note, created_at)
  kind ∈ {income, expense}
```

- RLS auf allen Tabellen: Nutzer sieht/ändert nur eigene Datensätze
- View `account_balances`: `starting_balance + Σincome − Σexpense` pro Konto
- View `monthly_summary`: pro user/Monat Income, Expense, Net

## Berechnungslogik

- Saldo = Startsaldo + Summe(Einnahmen) − Summe(Ausgaben), berechnet via SQL-View
- Bei jeder Transaktions-Mutation: TanStack Query `invalidateQueries` → Konto-Kacheln und Charts aktualisieren sich sofort
- Server Functions (`createServerFn` mit `requireSupabaseAuth`) für alle Reads/Writes

## Seiten

- `/login`, `/signup`, `/reset-password`
- `/_authenticated/dashboard` — Charts + Kontostand-Kacheln
- `/_authenticated/transactions` — Liste, Filter, Neu-anlegen-Modal
- `/_authenticated/accounts` — CRUD
- `/_authenticated/categories` — CRUD mit Farbe/Emoji
- `/_authenticated/settings` — Profil, Logout

## Technische Hinweise

- DB-Migration via Lovable Cloud Migration
- Profile-Trigger bei Signup (`handle_new_user`)
- Google OAuth über Lovable Cloud Auth Provider
- Recharts für alle Visualisierungen
- Mobile-first Layout, Sidebar wird auf mobil zur Bottom-Nav

## Hinweis zur Datenspeicherung

Du hattest „lokal/self-hosted" gewünscht — Lovable kann nur gegen Lovable Cloud (gehostete Postgres) bauen. Daten sind durch Row-Level-Security pro Nutzer isoliert. Ein späterer Export via CSV ist möglich, falls du auf eine eigene Instanz migrieren willst.

## Nach v1

Sobald MVP läuft, in dieser Reihenfolge nachziehen: Recurring + Scheduler → Kredite → Kreditkarten → CSV-Import → Jahresberichte → EN-Übersetzung.
