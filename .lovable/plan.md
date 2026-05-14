# Transfers / Umschuldungen abbilden

## Ist-Zustand

- `transactions.kind` kennt nur `income` und `expense`.
- `account_balances` und `monthly_summary` summieren strikt nach `kind`.
- `is_liquid` schließt Clearing-Konten zwar aus dem Cashflow aus, löst aber das Umschuldungsproblem nicht: Kredit → Giro → Kreditkarte führt über das **liquide** Girokonto und würde dort fälschlich als Einkommen + Ausgabe gezählt.

Ergebnis: Eine Umschuldung verzerrt aktuell sowohl Cashflow/Gewinn als auch — bei zwischengeschaltetem Girokonto — den Tagessaldo.

## Lösung: echter Transfer-Typ

### 1. Schema

- Enum `transaction_kind` um Wert `transfer` erweitern.
- Neue Spalte `transactions.transfer_to_account_id uuid` (Zielkonto bei Transfers, sonst NULL).
- Check-Trigger: bei `kind='transfer'` muss `transfer_to_account_id` gesetzt sein und ungleich `account_id`; bei den anderen Typen muss es NULL sein. Kategorie ist optional.
- View `account_balances` anpassen: Transfers reduzieren `account_id` (Quelle) um `amount` und erhöhen `transfer_to_account_id` (Ziel) um `amount`.
- View `monthly_summary` anpassen: `kind='transfer'` komplett ausschließen (kein Einkommen, keine Ausgabe, kein Net).

### 2. Eine Buchung statt zwei

Eine Umschuldung wird als **eine** Transfer-Zeile gespeichert (Quelle → Ziel, ein Betrag, ein Datum). Damit ist Wiederherstellen/Bearbeiten/Löschen atomar und es entstehen keine "Geister"-Einkommen mehr.

Drei-Stationen-Fall (Kredit → Giro → Karte) wird als **zwei aufeinanderfolgende Transfers** abgebildet:
1. Transfer Kredit → Giro
2. Transfer Giro → Karte

Beide sind cashflow-neutral, das Girokonto-Saldo bleibt am Ende identisch, Kreditkarte wird getilgt, neuer Kredit baut Schuld auf. Net Worth bleibt im Moment der Umschuldung unverändert.

### 3. UI in `transactions.tsx`

- Im Transaktions-Dialog dritter Typ-Tab **„Umbuchung"** neben Einnahme/Ausgabe.
- Bei Auswahl Transfer:
  - Felder: Von-Konto, Auf-Konto, Betrag, Datum, Notiz.
  - Kategorie und „Verknüpftes Konto" ausgeblendet.
  - Beide Konten müssen unterschiedlich sein.
- Tabelle: Transfer-Zeilen mit Pfeil-Badge `Quelle → Ziel`, Betrag neutral (kein +/−, keine rot/grün-Farbe).
- Filter „Einnahmen / Ausgaben / Alle" um „Umbuchungen" ergänzen.

### 4. Dashboard (`dashboard.tsx`)

- Cashflow-, Einkommen-, Ausgaben- und Kategorie-Charts: Transfers herausfiltern (`t.kind !== 'transfer'`).
- Konto-Salden / Net Worth: kommen aus `account_balances` und stimmen automatisch, da das View Transfers berücksichtigt.
- Restschuld-Berechnung der Kreditkonten: Transfer auf ein Loan-Konto verringert dessen Restschuld (Tilgung), Transfer von einem Loan-Konto erhöht sie (Kreditaufnahme).

### 5. Recurring & Bulk Edit

- `recurring_rules` bleibt unverändert (kein Bedarf für wiederkehrende Transfers jetzt).
- Bulk-Edit-Dialog: Transfer-Zeilen werden ausgeschlossen oder die Felder Konto/Verknüpftes Konto/Kategorie/Zinsen/Anyfin sind dort no-op.

## Technische Details

```sql
ALTER TYPE transaction_kind ADD VALUE 'transfer';
ALTER TABLE transactions ADD COLUMN transfer_to_account_id uuid;

-- Validierungs-Trigger statt CHECK (auth-/zeitneutral, aber konsistent)
CREATE FUNCTION validate_transaction() RETURNS trigger ...
  IF NEW.kind = 'transfer' AND (NEW.transfer_to_account_id IS NULL
       OR NEW.transfer_to_account_id = NEW.account_id) THEN RAISE ...
  IF NEW.kind <> 'transfer' AND NEW.transfer_to_account_id IS NOT NULL THEN RAISE ...

-- account_balances: zusätzliche UNION-Zweige für Transfers
--   Quelle: -amount, Ziel: +amount
-- monthly_summary: WHERE kind IN ('income','expense')
```

## Frage vor Umsetzung

Reicht dir **eine Transfer-Zeile** pro Umbuchung (mein Vorschlag), oder möchtest du lieber **zwei verknüpfte Buchungen** (eine Ausgabe + eine Einnahme mit gemeinsamer `transfer_group_id`)? Variante 1 ist sauberer und ich würde sie empfehlen.
