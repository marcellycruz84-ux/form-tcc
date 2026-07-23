// Layout do Admin Console - verifica role admin no cliente e renderiza subrotas.
import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { myRoles } from "@/lib/audit.functions";
import { ShieldAlert, Users, Ticket, Wrench, BarChart3 } from "lucide-react";

export const Route = createFileRoute("/_authenticated/console")({
  head: () => ({
    meta: [
      { title: "Console admin - Psicoclínica" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: ConsoleLayout,
});

const TABS = [
  { to: "/console/subscribers" as const, label: "Assinantes", icon: Users },
  { to: "/console/tickets" as const, label: "Tickets", icon: Ticket },
  { to: "/console/instruments" as const, label: "Instrumentos", icon: Wrench },
  { to: "/console/metrics" as const, label: "Métricas", icon: BarChart3 },
];

function ConsoleLayout() {
  const getRolesFn = useServerFn(myRoles);
  const roles = useQuery({ queryKey: ["my-roles"], queryFn: () => getRolesFn(), staleTime: 60_000 });
  const isAdmin = (roles.data?.roles ?? []).includes("admin");
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (roles.isLoading) {
    return <AppShell title="Console"><p className="text-sm text-muted-foreground">Verificando permissões…</p></AppShell>;
  }
  if (!isAdmin) {
    return (
      <AppShell title="Console">
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-destructive" aria-hidden="true" />
          <h2 className="mt-3 text-lg font-medium">Acesso restrito</h2>
          <p className="mt-2 text-sm text-muted-foreground">
            Somente administradores podem acessar esta área.
          </p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title="Console admin">
      <nav aria-label="Seções do console" className="mb-6 flex flex-wrap gap-1 border-b border-border">
        {TABS.map((t) => {
          const active = pathname === t.to || pathname.startsWith(t.to + "/");
          return (
            <Link
              key={t.to}
              to={t.to}
              className={`flex items-center gap-2 border-b-2 px-4 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                active
                  ? "border-foreground text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground"
              }`}
              aria-current={active ? "page" : undefined}
            >
              <t.icon className="h-4 w-4" aria-hidden="true" /> {t.label}
            </Link>
          );
        })}
      </nav>
      <Outlet />
    </AppShell>
  );
}
