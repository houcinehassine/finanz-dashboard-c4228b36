import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Theme = "light" | "dark";
export type Lang = "de" | "en";

const dict = {
  de: {
    appName: "Finanzmanager",
    logout: "Abmelden",
    nav_dashboard: "Dashboard",
    nav_transactions: "Transaktionen",
    nav_recurring: "Wiederkehrend",
    nav_accounts: "Konten",
    nav_settings: "Einstellungen",
    theme_light: "Hell",
    theme_dark: "Dunkel",
    lang_de: "Deutsch",
    lang_en: "Englisch",
    settings_appearance: "Darstellung",
    settings_language: "Sprache",
    settings_theme: "Modus",
  },
  en: {
    appName: "Finance Manager",
    logout: "Sign out",
    nav_dashboard: "Dashboard",
    nav_transactions: "Transactions",
    nav_recurring: "Recurring",
    nav_accounts: "Accounts",
    nav_settings: "Settings",
    theme_light: "Light",
    theme_dark: "Dark",
    lang_de: "German",
    lang_en: "English",
    settings_appearance: "Appearance",
    settings_language: "Language",
    settings_theme: "Mode",
  },
} as const;

export type DictKey = keyof typeof dict["de"];

type Ctx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  toggleTheme: () => void;
  lang: Lang;
  setLang: (l: Lang) => void;
  t: (k: DictKey) => string;
};

const PreferencesContext = createContext<Ctx | null>(null);

function readInitial<T extends string>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  const v = window.localStorage.getItem(key);
  return (v as T) || fallback;
}

export function PreferencesProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => readInitial<Theme>("pref:theme", "light"));
  const [lang, setLangState] = useState<Lang>(() => readInitial<Lang>("pref:lang", "de"));

  useEffect(() => {
    const root = document.documentElement;
    root.classList.toggle("dark", theme === "dark");
    window.localStorage.setItem("pref:theme", theme);
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
    window.localStorage.setItem("pref:lang", lang);
  }, [lang]);

  const value: Ctx = {
    theme,
    setTheme: setThemeState,
    toggleTheme: () => setThemeState((t) => (t === "dark" ? "light" : "dark")),
    lang,
    setLang: setLangState,
    t: (k) => dict[lang][k] ?? dict.de[k] ?? k,
  };

  return <PreferencesContext.Provider value={value}>{children}</PreferencesContext.Provider>;
}

export function usePreferences() {
  const ctx = useContext(PreferencesContext);
  if (!ctx) throw new Error("usePreferences must be used inside PreferencesProvider");
  return ctx;
}
