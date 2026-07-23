// Login fechado: o único administrador é cadastrado previamente no Supabase.
import { createFileRoute, useNavigate, useRouterState, Link, Outlet } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth")({
  ssr: false,
  head: () => ({ meta: [{ title: "Entrar - Aplicação de Questionários" }] }),
  component: AuthPage,
});

function AuthPage() {
  const pathname = useRouterState({ select: (state) => state.location.pathname });

  // auth.reset.tsx e auth.update-password.tsx são rotas filhas desta rota.
  // Elas precisam do Outlet; o login só deve aparecer exatamente em /auth.
  if (pathname !== "/auth" && pathname !== "/auth/") return <Outlet />;

  return <LoginPage />;
}

function LoginPage() {
  const navigate = useNavigate();

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data.user) navigate({ to: "/groups" });
    });
  }, [navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <Link to="/" className="text-sm font-semibold">Aplicação de Questionários</Link>
          <p className="mt-1 text-xs text-muted-foreground">Acesso da aluna responsável pela aplicação.</p>
        </div>

        <div className="rounded-xl border border-border bg-card p-6 shadow-xs">
          <h1 className="text-lg font-semibold">Entrar no painel</h1>
          <p className="mt-1 text-sm text-muted-foreground">Use as credenciais do administrador.</p>
          <div className="mt-6"><SignInForm /></div>
        </div>
      </div>
    </div>
  );
}

function SignInForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Bem-vindo(a).");
    navigate({ to: "/groups" });
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      <div>
        <Label htmlFor="email">Email</Label>
        <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
      </div>
      <div>
        <div className="flex items-baseline justify-between">
          <Label htmlFor="pw">Senha</Label>
          <Link to="/auth/reset" className="text-xs text-muted-foreground hover:text-foreground">Esqueci a senha</Link>
        </div>
        <Input id="pw" type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? "Entrando…" : "Entrar"}
      </Button>
    </form>
  );
}
