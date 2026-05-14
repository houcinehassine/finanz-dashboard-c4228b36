export const fmtEUR = (n: number) =>
  new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(n);

export const fmtDate = (d: string | Date) =>
  new Intl.DateTimeFormat("de-DE", { dateStyle: "medium" }).format(new Date(d));

export const fmtMonth = (d: string | Date) =>
  new Intl.DateTimeFormat("de-DE", { year: "numeric", month: "short" }).format(new Date(d));

export const accountTypeLabel: Record<string, string> = {
  checking: "Girokonto",
  savings: "Sparkonto",
  credit_card: "Kreditkarte",
  loan: "Kredit",
  darlehen: "Darlehen",
};
