// Solicitação de reset de senha por email.
import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export const Route = createFileRoute("/auth/reset")({
  ssr: false,
  head: () => ({ meta: [{ title: "Recuperar senha - Aplicação de Questionários" }] }),
  component: ResetPage,
});

function ResetPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/auth/update-password`,
    });
    setLoading(false);
    if (error) { toast.error(error.message); return; }
    setSent(true);
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-surface px-4">
      <div className="w-full max-w-sm rounded-xl border border-border bg-card p-6 shadow-xs">
        <h1 className="text-lg font-semibold">Recuperar senha</h1>
        {sent ? (
          <div className="mt-4 space-y-3 text-sm text-muted-foreground">
            <p>Se houver uma conta com este email, enviamos um link para redefinir sua senha.</p>
            <p>Confira também a caixa de spam.</p>
            <Button asChild variant="ghost" size="sm"><Link to="/auth">Voltar ao login</Link></Button>
          </div>
        ) : (
          <form onSubmit={onSubmit} className="mt-4 space-y-4">
            <div>
              <Label htmlFor="email">Email cadastrado</Label>
              <Input id="email" type="email" required autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
            </div>
            <Button type="submit" className="w-full" disabled={loading}>
              {loading ? "Enviando…" : "Enviar link de recuperação"}
            </Button>
            <p className="text-center text-xs text-muted-foreground">
              <Link to="/auth" className="hover:text-foreground">Voltar ao login</Link>
            </p>
          </form>
        )}
      </div>
    </div>
  );
}
