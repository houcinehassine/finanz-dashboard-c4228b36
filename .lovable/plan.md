## Ziel
Mehrere zusammenhängende Verbesserungen über die ganze App. Ich teile das in 6 Blöcke auf, die ich nacheinander umsetze. Du kannst alles bestätigen oder Blöcke streichen/priorisieren.

---

### Block 1 — Datenbank-Erweiterungen (Migration)

Nötig für mehrere folgende Features:

- Neue Spalte `purpose TEXT` auf `transactions` (Verwendungszweck, optional).
- Neue Tabelle `import_rules` mit RLS (`auth.uid() = user_id`):
  - `name`, `active`, `priority` (Reihenfolge)
  - `condition_field` (`note` | `purpose` | `amount` | `kind`)
  - `condition_op` (`contains` | `equals` | `gt` | `lt` | `eq`)
  - `condition_value` (TEXT, intern geparst)
  - `action_category_id` (uuid, nullable)
  - `action_kind` (`income` | `expense` | `transfer`, nullable)
  - `action_loan_account_id` (uuid, nullable)

---

### Block 2 — Spalte „Verwendungszweck" & neue Verknüpfungs-Spalte

- `purpose` in Transaktions-Dialog (manuell anlegen/bearbeiten) und CSV-Import-Mapping.
- Neue Tabellen-Spalte „Verwendungszweck" in:
  - Konto-Detailseite Buchungsliste
  - Seite „Alle Transaktionen"
- Neue Spalte „Verknüpfung" in der Buchungstabelle der Konto-Detailseite:
  - Umbuchung: „Aus: X / Ein: Y"
  - Einnahme/Ausgabe ohne Kredit: nur Konto
  - Mit Kredit/Darlehen: „Konto: X / Kredit (bzw. Darlehen): Y"
  - Alle Kontonamen sind Links zur jeweiligen Konto-Detailseite.

---

### Block 3 — „Alle Transaktionen" + Toolbar überall

- „Alle Transaktionen" zeigt wirklich alle Buchungen (kein Konto-Filter standardmäßig; bestehende Filter bleiben optional).
- Toolbar (Suche + CSV-Export + CSV-Import) auch auf „Alle Transaktionen", oberhalb der Liste.
- Auf der Konto-Seite Toolbar wie schon vorhanden lassen.
- CSV-Import-Dialog erweitern (siehe Block 4).

---

### Block 4 — CSV-Import: Konto-/Kreditauswahl, Auto-Kategorien, globale Sichtbarkeit

- Schritt „Spalten zuordnen": Felder **Konto** und **Kredit/Darlehen** kommen NICHT aus CSV-Spalten, sondern aus Dropdowns mit den bestehenden Konten des Nutzers.
  - Auf Konto-Detailseite: Konto vorausgewählt = aktuelles Konto (änderbar).
  - Auf „Alle Transaktionen": Pflicht-Auswahl eines Zielkontos.
- Unbekannte Kategorie im CSV → automatisch neu anlegen (kind heuristisch oder `expense` als Default).
- Importierte Buchungen erscheinen automatisch in „Alle Transaktionen" (technisch schon der Fall, weil dort ohne Filter gelesen wird — wird durch Block 3 garantiert).
- Vor dem Insert: aktive Regeln aus Block 6 anwenden.

---

### Block 5 — Mehrfachauswahl auf Konto-Detailseite

- Checkbox pro Zeile + „Alle auswählen"-Header-Checkbox.
- Action-Bar erscheint bei ≥ 1 Auswahl: „Löschen" + „Bearbeiten".
- Bulk-Bearbeiten: Dialog erlaubt Setzen von Kategorie / Typ / Konto / Kredit-Verknüpfung (nur ausgewählte Felder werden überschrieben).
- Bulk-Löschen: Bestätigungsdialog, dann Supabase `.in('id', [...])`.

---

### Block 6 — Regel-System in Einstellungen

- Neuer Tab/Bereich „Regeln" in `settings.tsx`.
- CRUD-UI: Liste, Hinzufügen, Bearbeiten, Löschen, Aktivieren/Deaktivieren, Reihenfolge per Priority.
- Regel-Engine (`src/lib/rules.ts`):
  - `applyRules(tx, rules, categories)` gibt mutiertes Transaktions-Objekt zurück.
  - Erste passende Regel pro Aktion gewinnt; mehrere Regeln (Kategorie + Typ) kombinierbar.
- Eingebunden im CSV-Import vor dem Bulk-Insert.
- Button „Regeln auf bestehende Buchungen anwenden" — läuft client-seitig in Batches mit Fortschrittsanzeige.

---

### Block 7 — Dynamische Graph-Aggregation

- Neuer Helper `src/lib/aggregate.ts`:
  - Input: Datenpunkte mit Datum + Zeitraum (`from`, `to`).
  - Wählt Bucket-Granularität automatisch nach Spannweite:
    - ≤ 7 Tage → täglich
    - ≤ 31 Tage → ~5-Tage / wöchentlich
    - ≤ 93 Tage → wöchentlich
    - ≤ 186 Tage → 2-wöchentlich
    - ≤ 366 Tage → monatlich
    - ≤ 3 J → quartalsweise
    - ≤ 5 J → halbjährlich
    - sonst → jährlich
  - Aggregiert Einnahmen/Ausgaben/Saldo entsprechend.
- Wird in Konto-Saldo-Verlauf-Graph und Dashboard-Charts genutzt; X-Achsen-Labels werden vom Bucket-Format geliefert.

---

## Technische Notizen

- Migration zuerst (separater Tool-Call, du musst sie freigeben). Danach Code.
- Alle neuen Queries / Mutationen über bestehenden `supabase`-Browser-Client (RLS sorgt für Sicherheit).
- Bulk-Edit & Regel-Anwendung verwenden `supabase.from('transactions').update(...).in('id', [...])`.
- Neue Tabelle `import_rules` bekommt RLS-Policy `auth.uid() = user_id` analog zu `recurring_rules`.

## Vorschlag zur Reihenfolge

1. Block 1 (Migration) — Freigabe nötig.
2. Block 2 + 3 (Spalten, „Alle Transaktionen", Toolbar) in einem Rutsch.
3. Block 4 (Import-Erweiterungen).
4. Block 5 (Mehrfachauswahl).
5. Block 6 (Regel-System).
6. Block 7 (Graph-Aggregation).

## Fragen vor Start

1. **Standard-Typ für Auto-Kategorien beim Import**: immer `expense`, oder anhand des Betrags (negativ → expense, sonst → income)?
2. **Regel-Reihenfolge**: erste passende Regel gewinnt pro Aktionsfeld (Empfehlung), oder alle anwenden und letzte gewinnt?
3. Soll ich wirklich alles auf einmal liefern, oder lieber in 2 Schritten (z.B. Blöcke 1–4 jetzt, 5–7 danach)? Letzteres macht Review/Test deutlich einfacher.