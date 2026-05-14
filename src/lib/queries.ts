import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type Account = {
  id: string;
  name: string;
  type: "checking" | "savings" | "credit_card" | "loan" | "darlehen" | "clearing";
  starting_balance: number;
  archived: boolean;
  icon: string;
  credit_limit: number | null;
  loan_principal: number | null;
  loan_interest_rate: number | null;
  loan_term_months: number | null;
  loan_due_on: string | null;
  is_liquid: boolean;
  linked_loan_account_id: string | null;
};

export type AccountBalance = Account & { balance: number };

export type Category = {
  id: string;
  name: string;
  kind: "income" | "expense";
  color: string;
  icon: string;
  archived: boolean;
  is_system: boolean;
};

export type Transaction = {
  id: string;
  account_id: string;
  category_id: string | null;
  loan_account_id: string | null;
  kind: "income" | "expense";
  amount: number;
  occurred_on: string;
  note: string | null;
  created_at: string;
};

export function useAccounts() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["accounts"],
    queryFn: async (): Promise<Account[]> => {
      const { data, error } = await supabase
        .from("accounts")
        .select("id,name,type,starting_balance,archived,icon,credit_limit,loan_principal,loan_interest_rate,loan_term_months,loan_due_on")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((a: any) => ({
        ...a,
        starting_balance: Number(a.starting_balance),
        credit_limit: a.credit_limit != null ? Number(a.credit_limit) : null,
        loan_principal: a.loan_principal != null ? Number(a.loan_principal) : null,
        loan_interest_rate: a.loan_interest_rate != null ? Number(a.loan_interest_rate) : null,
        loan_term_months: a.loan_term_months != null ? Number(a.loan_term_months) : null,
        loan_due_on: a.loan_due_on ?? null,
      }));
    },
  });
}

export function useAccountBalances() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["account_balances"],
    queryFn: async (): Promise<AccountBalance[]> => {
      const { data, error } = await supabase
        .from("account_balances")
        .select("account_id,name,type,archived,icon,starting_balance,balance,credit_limit,loan_principal,loan_interest_rate,loan_term_months,loan_due_on");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.account_id,
        name: r.name,
        type: r.type,
        archived: r.archived,
        icon: r.icon ?? '🏦',
        starting_balance: Number(r.starting_balance),
        balance: Number(r.balance),
        credit_limit: r.credit_limit != null ? Number(r.credit_limit) : null,
        loan_principal: r.loan_principal != null ? Number(r.loan_principal) : null,
        loan_interest_rate: r.loan_interest_rate != null ? Number(r.loan_interest_rate) : null,
        loan_term_months: r.loan_term_months != null ? Number(r.loan_term_months) : null,
        loan_due_on: r.loan_due_on ?? null,
      }));
    },
  });
}

export function useCategories() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["categories"],
    queryFn: async (): Promise<Category[]> => {
      const { data, error } = await supabase
        .from("categories")
        .select("id,name,kind,color,icon,archived,is_system")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTransactions(filters?: { accountId?: string; loanAccountId?: string; anyAccountId?: string; categoryId?: string; from?: string; to?: string }) {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["transactions", filters],
    queryFn: async (): Promise<Transaction[]> => {
      let q = supabase
        .from("transactions")
        .select("id,account_id,category_id,loan_account_id,kind,amount,occurred_on,note,created_at")
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false });
      if (filters?.accountId) q = q.eq("account_id", filters.accountId);
      if (filters?.loanAccountId) q = q.eq("loan_account_id", filters.loanAccountId);
      if (filters?.anyAccountId) q = q.or(`account_id.eq.${filters.anyAccountId},loan_account_id.eq.${filters.anyAccountId}`);
      if (filters?.categoryId) q = q.eq("category_id", filters.categoryId);
      if (filters?.from) q = q.gte("occurred_on", filters.from);
      if (filters?.to) q = q.lte("occurred_on", filters.to);
      const { data, error } = await q;
      if (error) throw error;
      return (data ?? []).map((t) => ({ ...t, amount: Number(t.amount) })) as Transaction[];
    },
  });
}

export function useMonthlySummary() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["monthly_summary"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("monthly_summary")
        .select("month,income,expense,net")
        .order("month", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        month: r.month as string,
        income: Number(r.income),
        expense: Number(r.expense),
        net: Number(r.net),
      }));
    },
  });
}
