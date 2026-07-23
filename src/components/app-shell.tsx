import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { ArrowLeft, LogOut, Settings as SettingsIcon, BarChart3 } from "lucide-react";
import type { ReactNode } from "react";
import { BRAND } from "@/lib/branding";
import { getMyProfile } from "@/lib/profile.functions";
import { myRoles } from "@/lib/audit.functions";

interface AppShellProps { children: ReactNode; title?: ReactNode; action?: ReactNode; backTo?: string; }

export function AppShell({ children, title, action, backTo }: AppShellProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const getProfileFn = useServerFn(getMyProfile);
  const getRolesFn = useServerFn(myRoles);
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => getProfileFn(), staleTime: 60_000 });
  const roles = useQuery({ queryKey: ["my-roles"], queryFn: () => getRolesFn(), staleTime: 300_000 });

  async function onSignOut() {
    await queryClient.cancelQueries();
    queryClient.clear();
    await supabase.auth.signOut();
    navigate({ to: "/auth", replace: true });
  }

  // Uso acadêmico: menu enxuto e voltado à aplicação de questionários em grupo.
  void roles;
  const navItems: Array<{ to: "/groups" | "/settings"; label: string; icon: typeof BarChart3 }> = [
    { to: "/groups", label: "Campanhas", icon: BarChart3 },
    { to: "/settings", label: "Meu perfil", icon: SettingsIcon },
  ];

  const displayName = profile.data?.full_name?.trim() || "Aluna";
  const displayCred = profile.data?.credential?.trim();

  return (
    <div className="min-h-screen bg-surface">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-sm focus:text-background"
      >
        Pular para o conteúdo
      </a>
      <aside
        aria-label="Navegação principal"
        className="fixed inset-y-0 left-0 hidden w-56 flex-col border-r border-border bg-background p-4 md:flex"
      >
        <Link to="/groups" className="mb-8 block px-2 text-sm font-semibold leading-tight">{BRAND.shortName}</Link>
        <nav className="flex-1 space-y-1" aria-label="Seções">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <Link
                key={item.to}
                to={item.to}
                aria-current={active ? "page" : undefined}
                className={`flex items-center gap-2 rounded-md px-3 py-2 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
                  active ? "bg-accent text-foreground" : "text-muted-foreground hover:bg-accent hover:text-foreground"
                }`}
              >
                <item.icon className="h-4 w-4" aria-hidden="true" /> {item.label}
              </Link>
            );
          })}
        </nav>
        <Button variant="ghost" size="sm" onClick={onSignOut} className="justify-start text-muted-foreground">
          <LogOut className="mr-2 h-4 w-4" aria-hidden="true" /> Sair
        </Button>
      </aside>

      <div className="md:pl-56">
        <header className="border-b border-border bg-background">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4">
            <div className="flex min-w-0 items-center gap-2">
              {backTo && <Button asChild variant="ghost" size="icon" className="-ml-2"><Link to={backTo}><ArrowLeft className="h-4 w-4" /></Link></Button>}
              <h1 className="min-w-0 truncate text-base font-medium">
                {title}
              </h1>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <Link
                to="/settings"
                aria-label={`Perfil de ${displayName}${displayCred ? `, ${displayCred}` : ", curso/turma não informado"}`}
                className="hidden text-right text-xs leading-tight text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-md sm:block"
              >
                <div className="font-medium text-foreground">{displayName}</div>
                {displayCred ? <div>{displayCred}</div> : <div className="italic">adicionar curso</div>}
              </Link>
              <div className="shrink-0">{action}</div>
            </div>
          </div>
        </header>
        <main
          id="main-content"
          tabIndex={-1}
          className="mx-auto max-w-6xl px-4 py-6 pb-24 sm:px-6 sm:py-8 md:pb-8"
        >
          {children}
        </main>
      </div>

      {/* Navegação mobile (bottom bar) - visível abaixo de md */}
      <nav
        aria-label="Navegação principal (mobile)"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-border bg-background md:hidden"
      >
        <ul className="mx-auto flex max-w-lg items-stretch justify-around">
          {navItems.map((item) => {
            const active = pathname.startsWith(item.to);
            return (
              <li key={item.to} className="flex-1">
                <Link
                  to={item.to}
                  aria-current={active ? "page" : undefined}
                  aria-label={item.label}
                  className={`flex min-h-14 flex-col items-center justify-center gap-1 px-2 py-2 text-[11px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring ${
                    active ? "text-foreground" : "text-muted-foreground"
                  }`}
                >
                  <item.icon className="h-5 w-5" aria-hidden="true" />
                  <span className="truncate">{item.label}</span>
                </Link>
              </li>
            );
          })}
          <li className="flex-1">
            <button
              type="button"
              onClick={onSignOut}
              aria-label="Sair"
              className="flex min-h-14 w-full flex-col items-center justify-center gap-1 px-2 py-2 text-[11px] font-medium text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
            >
              <LogOut className="h-5 w-5" aria-hidden="true" />
              <span>Sair</span>
            </button>
          </li>
        </ul>
      </nav>
    </div>
  );
}
