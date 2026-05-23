import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type ConditionField = "note" | "purpose" | "amount" | "kind" | "category" | "account";
export type ConditionOp = "contains" | "starts_with" | "equals" | "gt" | "lt" | "eq";
export type ActionKind = "income" | "expense" | "transfer";
export type Logic = "AND" | "OR";

export type RuleCondition = {
  field: ConditionField;
  op: ConditionOp;
  value: string;
};

export type ImportRule = {
  id: string;
  user_id: string;
  name: string;
  active: boolean;
  priority: number;
  logic: Logic;
  conditions: RuleCondition[];
  // legacy single-condition fields (kept for back-compat with older rows)
  condition_field: ConditionField | null;
  condition_op: ConditionOp | null;
  condition_value: string | null;
  action_note: string | null;
  action_category_id: string | null;
  action_kind: ActionKind | null;
  action_account_id: string | null;
  action_transfer_to_account_id: string | null;
  action_loan_account_id: string | null;
};

export function useImportRules() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["import_rules"],
    queryFn: async (): Promise<ImportRule[]> => {
      const { data, error } = await supabase
        .from("import_rules" as any)
        .select("*")
        .order("priority", { ascending: true });
      if (error) throw error;
      return ((data ?? []) as any[]).map(normalizeRule);
    },
  });
}

// Make sure every row has a `conditions[]` array — migrate legacy single-condition rows.
export function normalizeRule(r: any): ImportRule {
  const conds: RuleCondition[] = Array.isArray(r.conditions) && r.conditions.length > 0
    ? r.conditions
    : (r.condition_field && r.condition_op && r.condition_value != null
        ? [{ field: r.condition_field, op: r.condition_op, value: r.condition_value }]
        : []);
  return {
    ...r,
    logic: (r.logic as Logic) ?? "AND",
    conditions: conds,
  };
}

// The "shape" a rule operates on.
export type RuleTarget = {
  note?: string | null;
  purpose?: string | null;
  amount?: number;
  kind?: ActionKind;
  category_id?: string | null;
  account_id?: string | null;
  loan_account_id?: string | null;
  transfer_to_account_id?: string | null;
};

function matchOne(c: RuleCondition, t: RuleTarget): boolean {
  const v = c.value ?? "";
  let target: string | number | null | undefined;
  switch (c.field) {
    case "note": target = (t.note ?? "").toString(); break;
    case "purpose": target = (t.purpose ?? "").toString(); break;
    case "amount": target = typeof t.amount === "number" ? t.amount : NaN; break;
    case "kind": target = t.kind ?? ""; break;
    case "category": target = t.category_id ?? ""; break;
    case "account": target = t.account_id ?? ""; break;
  }
  switch (c.op) {
    case "contains": return String(target).toLowerCase().includes(v.toLowerCase());
    case "starts_with": return String(target).toLowerCase().startsWith(v.toLowerCase());
    case "equals": return String(target).toLowerCase() === v.toLowerCase();
    case "eq": return Number(target) === Number(v);
    case "gt": return Number(target) > Number(v);
    case "lt": return Number(target) < Number(v);
  }
  return false;
}

export function matchesRule(rule: ImportRule, t: RuleTarget): boolean {
  if (!rule.conditions || rule.conditions.length === 0) return false;
  const logic = rule.logic ?? "AND";
  return logic === "OR"
    ? rule.conditions.some((c) => matchOne(c, t))
    : rule.conditions.every((c) => matchOne(c, t));
}

// Apply rules in priority order. First matching rule per action field wins.
export function applyRules<T extends RuleTarget>(tx: T, rules: ImportRule[]): T {
  const out: any = { ...tx };
  const set = { note: false, category: false, kind: false, account: false, transfer_to: false, loan: false };
  const sorted = [...rules].filter((r) => r.active).sort((a, b) => a.priority - b.priority);
  for (const r of sorted) {
    if (!matchesRule(r, out)) continue;
    if (!set.note && r.action_note) { out.note = r.action_note; set.note = true; }
    if (!set.category && r.action_category_id) { out.category_id = r.action_category_id; set.category = true; }
    if (!set.kind && r.action_kind) { out.kind = r.action_kind; set.kind = true; }
    if (!set.account && r.action_account_id) { out.account_id = r.action_account_id; set.account = true; }
    if (!set.transfer_to && r.action_transfer_to_account_id) { out.transfer_to_account_id = r.action_transfer_to_account_id; set.transfer_to = true; }
    if (!set.loan && r.action_loan_account_id) { out.loan_account_id = r.action_loan_account_id; set.loan = true; }
  }
  return out;
}
