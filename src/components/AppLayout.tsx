import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { LayoutDashboard, ArrowLeftRight, Wallet, Settings, LogOut, Repeat, Sun, Moon, Languages } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { usePreferences, type DictKey } from "@/lib/preferences";

const nav: { to: string; labelKey: DictKey; icon: typeof LayoutDashboard }[] = [
  { to: "/dashboard", labelKey: "nav_dashboard", icon: LayoutDashboard },
  { to: "/transactions", labelKey: "nav_transactions", icon: ArrowLeftRight },
  { to: "/recurring", labelKey: "nav_recurring", icon: Repeat },
  { to: "/accounts", labelKey: "nav_accounts", icon: Wallet },
  { to: "/settings", labelKey: "nav_settings", icon: Settings },
];

export function AppLayout({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const navigate = useNavigate();
  const { theme, toggleTheme, lang, setLang, t } = usePreferences();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login", replace: true });
  };

  return (
    <div className="min-h-screen bg-muted/20">
      {/* Top nav */}
      <header className="sticky top-0 z-20 border-b bg-card">
        <div className="flex h-14 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <span className="font-semibold">{t("appName")}</span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setLang(lang === "de" ? "en" : "de")}
              title={t("settings_language")}
            >
              <Languages className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">{lang.toUpperCase()}</span>
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={toggleTheme}
              title={theme === "dark" ? t("theme_light") : t("theme_dark")}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </Button>
            <Button variant="ghost" size="sm" onClick={handleLogout}>
              <LogOut className="h-4 w-4 md:mr-2" />
              <span className="hidden md:inline">{t("logout")}</span>
            </Button>
          </div>
        </div>
        <nav className="hidden border-t md:flex md:items-center md:justify-center md:gap-1 md:px-4 md:py-2">
          {nav.map((item) => {
            const active = loc.pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                className={cn(
                  "flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors",
                  active
                    ? "bg-primary text-primary-foreground"
                    : "text-muted-foreground hover:bg-muted hover:text-foreground",
                )}
              >
                <item.icon className="h-4 w-4" />
                {t(item.labelKey)}
              </Link>
            );
          })}
        </nav>
      </header>

      {/* Content */}
      <main className="pb-24 md:pb-8">
        <div className="mx-auto max-w-6xl p-4 md:p-6">{children}</div>
      </main>

      {/* Mobile bottom nav */}
      <nav className="fixed bottom-0 left-0 right-0 z-10 grid grid-cols-5 border-t bg-card md:hidden">
        {nav.map((item) => {
          const active = loc.pathname.startsWith(item.to);
          return (
            <Link
              key={item.to}
              to={item.to}
              className={cn(
                "flex flex-col items-center justify-center gap-1 py-2 text-[10px]",
                active ? "text-primary" : "text-muted-foreground",
              )}
            >
              <item.icon className="h-5 w-5" />
              {t(item.labelKey)}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
