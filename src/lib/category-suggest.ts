import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import type { Category } from "@/lib/queries";

export type KeywordSource = "user" | "learned" | "default";

export type CategoryKeyword = {
  id: string;
  user_id: string;
  category_id: string;
  keyword: string;
  source?: KeywordSource;
};

// Default keyword seeds mapped by category NAME (matched case-insensitively
// against the user's existing categories). Used to seed on first open.
export const DEFAULT_KEYWORDS: Record<string, string[]> = {
  Einkaufen: ["rewe", "aldi", "lidl", "penny", "edeka", "netto", "kaufland"],
  Restaurant: ["mcdonalds", "burger king", "kfc", "subway", "pizza", "restaurant", "café", "cafe", "bistro"],
  Abonnements: ["netflix", "spotify", "amazon prime", "disney", "dazn"],
  Subscription: ["netflix", "spotify", "amazon prime", "disney", "dazn"],
  Tanken: ["tankstelle", "shell", "bp", "aral", "esso", "jet"],
  Gesundheit: ["apotheke", "arzt", "krankenhaus", "aok", "tkk", "barmer"],
  Bildung: ["uni", "universität", "studium", "semesterticket", "mensa", "vhs"],
  Tabak: ["tabak", "tabac", "zigaretten"],
  Drogerie: ["dm", "rossmann", "müller", "drogerie"],
  Wohnen: ["miete", "nebenkosten", "strom", "gas", "wasser"],
  Miete: ["miete", "nebenkosten"],
  Transport: ["bahn", " db ", "mvv", "bvg", "bus", "flugzeug", "ryanair"],
};

export function useCategoryKeywords() {
  const { user } = useAuth();
  return useQuery({
    enabled: !!user,
    queryKey: ["category_keywords"],
    queryFn: async (): Promise<CategoryKeyword[]> => {
      const { data, error } = await supabase
        .from("category_keywords" as any)
        .select("*")
        .order("keyword", { ascending: true });
      if (error) throw error;
      return (data ?? []) as any;
    },
  });
}

/**
 * Suggest a category_id based on description + purpose using a keyword list.
 * Order of preference: learned > user > default. Within a source, longer
 * keywords win (more specific match).
 */
export function suggestCategory(
  description: string | null | undefined,
  purpose: string | null | undefined,
  keywords: CategoryKeyword[],
): string | null {
  const hay = `${description ?? ""} ${purpose ?? ""}`.toLowerCase();
  if (!hay.trim()) return null;
  const sourceRank = (s?: KeywordSource) => (s === "learned" ? 3 : s === "user" ? 2 : 1);
  let best: { catId: string; len: number; rank: number } | null = null;
  for (const kw of keywords) {
    const needle = kw.keyword.trim().toLowerCase();
    if (!needle) continue;
    if (hay.includes(needle)) {
      const rank = sourceRank(kw.source);
      if (!best || rank > best.rank || (rank === best.rank && needle.length > best.len)) {
        best = { catId: kw.category_id, len: needle.length, rank };
      }
    }
  }
  return best?.catId ?? null;
}

/**
 * Build default keyword rows by matching DEFAULT_KEYWORDS names to existing categories.
 */
export function buildDefaultKeywordRows(
  userId: string,
  categories: Category[],
): Array<{ user_id: string; category_id: string; keyword: string; source: KeywordSource }> {
  const byName = new Map<string, Category>();
  for (const c of categories) byName.set(c.name.toLowerCase(), c);
  const rows: Array<{ user_id: string; category_id: string; keyword: string; source: KeywordSource }> = [];
  const seen = new Set<string>();
  for (const [name, kws] of Object.entries(DEFAULT_KEYWORDS)) {
    const cat = byName.get(name.toLowerCase());
    if (!cat) continue;
    for (const kw of kws) {
      const key = `${cat.id}|${kw.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({ user_id: userId, category_id: cat.id, keyword: kw, source: "default" });
    }
  }
  return rows;
}

/**
 * Derive a usable keyword from a transaction description/purpose.
 * Picks the longest alphabetic token (>=3 chars). Fallback: trimmed full text.
 */
export function deriveKeyword(description?: string | null, purpose?: string | null): string | null {
  const base = (description ?? purpose ?? "").trim();
  if (!base) return null;
  const tokens = base.toLowerCase().match(/[a-zäöüß][a-zäöüß0-9&.\-]{2,}/gi) ?? [];
  if (tokens.length === 0) return base.slice(0, 60).toLowerCase();
  // longest token wins (more distinctive)
  tokens.sort((a, b) => b.length - a.length);
  return tokens[0] ?? null;
}
