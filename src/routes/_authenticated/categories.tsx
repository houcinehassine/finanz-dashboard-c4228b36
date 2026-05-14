import { createFileRoute } from "@tanstack/react-router";
import { CategoriesManager } from "@/components/CategoriesManager";

export const Route = createFileRoute("/_authenticated/categories")({
  component: CategoriesPage,
});

function CategoriesPage() {
  return (
    <div className="space-y-6">
      <div>
        <div className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Einstellungen</div>
        <h1 className="text-3xl font-bold">Kategorien</h1>
      </div>
      <CategoriesManager />
    </div>
  );
}
