import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";

export type Account = {
  id: string;
  name: string;
  type: "checking" | "savings" | "credit_card" | "loan";
  starting_balance: number;
  archived: boolean;
};

export type AccountBalance = Account & { balance: number };

export type Category = {
  id: string;
  name: string;
  kind: "income" | "expense";
  color: string;
  icon: string;
  archived: boolean;
};

export type Transaction = {
  id: string;
  account_id: string;
  category_id: string | null;
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
        .select("id,name,type,starting_balance,archived")
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []).map((a) => ({ ...a, starting_balance: Number(a.starting_balance) }));
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
        .select("account_id,name,type,archived,starting_balance,balance");
      if (error) throw error;
      return (data ?? []).map((r: any) => ({
        id: r.account_id,
        name: r.name,
        type: r.type,
        archived: r.archived,
        starting_balance: Number(r.starting_balance),
        balance: Number(r.balance),
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
        .select("id,name,kind,color,icon,archived")
        .order("name");
      if (error) throw error;
      return data ?? [];
    },
  });
}

export function useTransactions(filters?: { accountId?: string; categoryId?: string; from?: string; to?: string }) {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["transactions", filters],
    queryFn: async (): Promise<Transaction[]> => {
      let q = supabase
        .from("transactions")
        .select("id,account_id,category_id,kind,amount,occurred_on,note,created_at")
        .order("occurred_on", { ascending: false })
        .order("created_at", { ascending: false });
      if (filters?.accountId) q = q.eq("account_id", filters.accountId);
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
