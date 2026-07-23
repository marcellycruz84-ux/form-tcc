import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { getMyProfile, updateMyProfile } from "@/lib/profile.functions";

export const Route = createFileRoute("/_authenticated/settings")({
  head: () => ({ meta: [{ title: "Meu perfil" }] }),
  component: SettingsPage,
});

function SettingsPage() {
  const qc = useQueryClient();
  const getFn = useServerFn(getMyProfile);
  const updateFn = useServerFn(updateMyProfile);
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => getFn() });

  const [fullName, setFullName] = useState("");
  const [credential, setCredential] = useState("");

  useEffect(() => {
    if (profile.data) {
      setFullName(profile.data.full_name ?? "");
      setCredential(profile.data.credential ?? "");
    }
  }, [profile.data]);

  const save = useMutation({
    mutationFn: () => updateFn({ data: { full_name: fullName, credential } }),
    onSuccess: () => {
      toast.success("Perfil atualizado");
      qc.invalidateQueries({ queryKey: ["my-profile"] });
    },
    onError: (err: unknown) => toast.error(err instanceof Error ? err.message : "Falha ao salvar"),
  });

  return (
    <AppShell title="Meu perfil">
      <div className="max-w-xl space-y-6">
        <p className="text-sm text-muted-foreground">
          Esses dados aparecem no cabeçalho do sistema e no relatório em PDF gerado a partir dos questionários.
        </p>

        <form
          className="space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            save.mutate();
          }}
        >
          <div className="space-y-2">
            <Label htmlFor="full_name">Nome completo</Label>
            <Input
              id="full_name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ex.: Maria Silva"
              required
              minLength={2}
              maxLength={120}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="credential">Curso / turma</Label>
            <Input
              id="credential"
              value={credential}
              onChange={(e) => setCredential(e.target.value)}
              placeholder="Ex.: Psicologia - 6º período"
              maxLength={80}
            />
            <p className="text-xs text-muted-foreground">
              Opcional. Aparece no cabeçalho do relatório em PDF como identificação do responsável pela aplicação.
            </p>
          </div>

          <Button type="submit" disabled={save.isPending || profile.isLoading}>
            {save.isPending ? "Salvando…" : "Salvar alterações"}
          </Button>
        </form>
      </div>
    </AppShell>
  );
}
