import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type ConditionField = "note" | "purpose" | "amount" | "kind";
export type ConditionOp = "contains" | "equals" | "gt" | "lt" | "eq";
export type ActionKind = "income" | "expense" | "transfer";

export type ImportRule = {
  id: string;
  user_id: string;
  name: string;
  active: boolean;
  priority: number;
  condition_field: ConditionField;
  condition_op: ConditionOp;
  condition_value: string;
  action_category_id: string | null;
  action_kind: ActionKind | null;
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
      return (data ?? []) as any;
    },
  });
}

// The "shape" a rule operates on. Use whatever subset is available.
export type RuleTarget = {
  note?: string | null;
  purpose?: string | null;
  amount?: number;
  kind?: ActionKind;
  category_id?: string | null;
  loan_account_id?: string | null;
};

function matches(rule: ImportRule, t: RuleTarget): boolean {
  const f = rule.condition_field;
  const op = rule.condition_op;
  const v = rule.condition_value;
  let target: string | number | null | undefined;
  if (f === "note") target = (t.note ?? "").toString();
  else if (f === "purpose") target = (t.purpose ?? "").toString();
  else if (f === "amount") target = typeof t.amount === "number" ? t.amount : NaN;
  else if (f === "kind") target = t.kind ?? "";
  if (op === "contains") return String(target).toLowerCase().includes(v.toLowerCase());
  if (op === "equals") return String(target).toLowerCase() === v.toLowerCase();
  if (op === "eq") return Number(target) === Number(v);
  if (op === "gt") return Number(target) > Number(v);
  if (op === "lt") return Number(target) < Number(v);
  return false;
}

// Apply rules in priority order. First matching rule per action field wins.
export function applyRules<T extends RuleTarget>(tx: T, rules: ImportRule[]): T {
  const out: any = { ...tx };
  const set = { category: false, kind: false, loan: false };
  const sorted = [...rules].filter((r) => r.active).sort((a, b) => a.priority - b.priority);
  for (const r of sorted) {
    if (!matches(r, out)) continue;
    if (!set.category && r.action_category_id) {
      out.category_id = r.action_category_id;
      set.category = true;
    }
    if (!set.kind && r.action_kind) {
      out.kind = r.action_kind;
      set.kind = true;
    }
    if (!set.loan && r.action_loan_account_id) {
      out.loan_account_id = r.action_loan_account_id;
      set.loan = true;
    }
    if (set.category && set.kind && set.loan) break;
  }
  return out;
}
