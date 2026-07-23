// Página de nova senha (usuário chega aqui via link do email).
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/update-password")({
  ssr: false,
  head: () => ({ meta: [{ title: "Nova senha - Aplicação de Questionários" }] }),
  component: UpdatePasswordPage,
});

function UpdatePasswordPage() {
  const [status, setStatus] = useState<"checking" | "ready" | "invalid">("checking");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  useEffect(() => {
    let active = true;
    const hashError = new URLSearchParams(window.location.hash.slice(1)).get("error_description");
    if (hashError) {
      setStatus("invalid");
      return;
    }

    const sub = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      if ((event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") && session) setStatus("ready");
    });

    supabase.auth.getSession().then(({ data, error }) => {
      if (!active) return;
      setStatus(!error && data.session ? "ready" : "invalid");
    });

    return () => {
      active = false;
      sub.data.subscription.unsubscribe();
    };
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password.length < 8) { toast.error("A senha deve ter pelo menos 8 caracteres."); return; }
    if (password !== confirm) { toast.error("As senhas não conferem."); return; }
    setLoading(true);
    const { error } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Senha atualizada.");
    await supabase.auth.signOut();
    navigate({ to: "/auth" });
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xs">
        <h1 className="text-lg font-semibold">Definir nova senha</h1>
        {status === "checking" ? (
          <p className="mt-4 text-sm text-muted-foreground">Validando o link de recuperação…</p>
        ) : status === "invalid" ? (
          <div className="mt-4 space-y-4">
            <p className="text-sm text-muted-foreground">
              Este link é inválido ou expirou. Solicite um novo link de recuperação.
            </p>
            <Button asChild className="w-full"><Link to="/auth/reset">Solicitar novo link</Link></Button>
            <p className="text-center text-xs text-muted-foreground">
              <Link to="/auth" className="hover:text-foreground">Voltar ao login</Link>
            </p>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <div>
              <Label htmlFor="pw">Nova senha (mín. 8)</Label>
              <Input id="pw" type="password" required minLength={8} autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} />
              <p className="mt-1 text-xs text-muted-foreground">Senhas vazadas em incidentes públicos são recusadas.</p>
            </div>
            <div>
              <Label htmlFor="pw2">Confirmar senha</Label>
              <Input id="pw2" type="password" required minLength={8} autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Salvando…" : "Salvar nova senha"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">Após salvar, entre novamente com a nova senha.</p>
          </form>
        )}
      </div>
    </div>
  );
}
