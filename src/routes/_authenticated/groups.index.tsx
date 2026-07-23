import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogTrigger, DialogDescription } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Users, Link as LinkIcon, Copy, BarChart3 } from "lucide-react";
import { toast } from "sonner";
import {
  listGroupCampaigns,
  createGroupCampaign,
  listGroupEligibleInstruments,
  toggleGroupCampaign,
  deleteGroupCampaign,
} from "@/lib/group-campaigns.functions";
import { DEFAULT_TCLE } from "@/lib/default-tcle";

export const Route = createFileRoute("/_authenticated/groups/")({
  head: () => ({ meta: [{ title: "Campanhas de aplicação - Questionários" }] }),
  component: GroupsPage,
});

function GroupsPage() {
  const listFn = useServerFn(listGroupCampaigns);
  const campaigns = useQuery({ queryKey: ["group-campaigns"], queryFn: () => listFn() });
  const qc = useQueryClient();
  const toggleFn = useServerFn(toggleGroupCampaign);
  const deleteFn = useServerFn(deleteGroupCampaign);

  const toggle = useMutation({
    mutationFn: (v: { campaign_id: string; is_active: boolean }) => toggleFn({ data: v }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["group-campaigns"] }),
  });
  const del = useMutation({
    mutationFn: (id: string) => deleteFn({ data: { campaign_id: id } }),
    onSuccess: () => { qc.invalidateQueries({ queryKey: ["group-campaigns"] }); toast.success("Campanha removida."); },
  });

  return (
    <AppShell title="Campanhas de aplicação" action={<CreateDialog />}>
      <div className="mb-6">
        <p className="text-sm text-muted-foreground">
          Crie uma campanha para um grupo e envie um link único para que os participantes aceitem o termo e respondam aos questionários.
          As respostas ficam organizadas para análise acadêmica.
        </p>
      </div>

      {campaigns.isLoading && <div className="space-y-3">{[0,1,2].map((i) => <Skeleton key={i} className="h-24 w-full" />)}</div>}
      {campaigns.isError && (
        <Alert variant="destructive">Não foi possível carregar as campanhas: {(campaigns.error as Error).message}</Alert>
      )}
      {campaigns.data?.length === 0 && (
        <div className="rounded-lg border border-dashed border-border bg-background p-10 text-center">
          <Users className="mx-auto h-10 w-10 text-muted-foreground" />
          <h2 className="mt-3 text-base font-medium">Nenhuma campanha criada ainda</h2>
          <p className="mt-1 text-sm text-muted-foreground">Comece criando uma campanha para aplicar os questionários ao seu grupo.</p>
        </div>
      )}

      <ul className="grid gap-3">
        {(campaigns.data ?? []).map((c) => (
          <li key={c.id} className="rounded-lg border border-border bg-background p-4">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h3 className="truncate text-base font-medium">{c.title}</h3>
                  <span className="rounded-full border border-border bg-surface-2 px-2 py-0.5 text-[11px] text-muted-foreground">
                    {c.instruments?.length ? `${c.instruments.length} instrumentos` : c.instrument?.code}
                  </span>
                </div>
                {c.description && <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{c.description}</p>}
                {c.instruments?.length > 0 && (
                  <p className="mt-2 text-xs text-muted-foreground">
                    {c.instruments.map((instrument) => instrument.code).join(" • ")}
                  </p>
                )}
                <p className="mt-2 text-xs text-muted-foreground">
                  {c.response_count} {c.response_count === 1 ? "resposta" : "respostas"} · criado {new Date(c.created_at).toLocaleDateString("pt-BR")}
                  {!c.is_active && " · encerrada"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Switch
                  checked={c.is_active}
                  onCheckedChange={(v) => toggle.mutate({ campaign_id: c.id, is_active: v })}
                  aria-label="Ativa"
                />
                <Button asChild variant="outline" size="sm">
                  <Link to="/groups/$id" params={{ id: c.id }}>
                    <BarChart3 className="mr-2 h-4 w-4" /> Resultados
                  </Link>
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    if (confirm("Remover esta campanha e todas as respostas?")) del.mutate(c.id);
                  }}
                >
                  Remover
                </Button>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </AppShell>
  );
}

function CreateDialog() {
  const [open, setOpen] = useState(false);
  const [step, setStep] = useState<"form" | "success">("form");
  const [createdLink, setCreatedLink] = useState<string | null>(null);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [selectedInstrumentIds, setSelectedInstrumentIds] = useState<string[]>([]);
  const [consentTitle, setConsentTitle] = useState("Termo de Consentimento Livre e Esclarecido");
  const [consentBody, setConsentBody] = useState(DEFAULT_TCLE);

  const listInstFn = useServerFn(listGroupEligibleInstruments);
  const createFn = useServerFn(createGroupCampaign);
  const qc = useQueryClient();

  const instruments = useQuery({
    queryKey: ["group-eligible-instruments"],
    queryFn: () => listInstFn(),
    enabled: open,
  });

  const create = useMutation({
    mutationFn: () => createFn({
      data: {
        instrument_ids: selectedInstrumentIds,
        title: title.trim(),
        description: description.trim(),
        consent_title: consentTitle.trim(),
        consent_body: consentBody.trim(),
      },
    }),
    onSuccess: (res) => {
      qc.invalidateQueries({ queryKey: ["group-campaigns"] });
      const url = `${window.location.origin}/g/${res.token}`;
      try { localStorage.setItem(`group-token:${res.id}`, res.token); } catch { /* ignore */ }
      setCreatedLink(url);
      setStep("success");
      toast.success("Campanha criada e link gerado!");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function reset() {
    setStep("form");
    setCreatedLink(null);
    setTitle(""); setDescription(""); setSelectedInstrumentIds([]);
    setConsentTitle("Termo de Consentimento Livre e Esclarecido");
    setConsentBody(DEFAULT_TCLE);
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        <Button size="sm"><Plus className="mr-2 h-4 w-4" /> Nova campanha</Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        {step === "form" ? (
          <>
            <DialogHeader>
              <DialogTitle>Nova campanha de aplicação</DialogTitle>
              <DialogDescription>
                Escolha um instrumento e gere um link para o seu grupo responder após aceitar o termo de participação.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-2">
              <div className="space-y-2">
                <Label htmlFor="title">Título *</Label>
                <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} placeholder="Ex.: Triagem de ansiedade - turma 2026" />
              </div>
              <div className="space-y-2">
                <Label htmlFor="desc">Descrição para o participante</Label>
                <Textarea id="desc" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} />
              </div>
              <div className="space-y-2">
                <Label>Instrumentos *</Label>
                <div className="rounded-md border border-border bg-background p-3">
                  {instruments.isLoading && <Skeleton className="h-20 w-full" />}
                  {instruments.isError && (
                    <p className="text-sm text-destructive">Não foi possível carregar os instrumentos: {(instruments.error as Error).message}</p>
                  )}
                  {(instruments.data ?? []).length === 0 && (
                    !instruments.isLoading && !instruments.isError && <p className="text-sm text-muted-foreground">Nenhum instrumento disponível para campanhas em grupo no momento.</p>
                  )}
                  <div className="grid gap-2 sm:grid-cols-2">
                    {(instruments.data ?? []).map((instrument) => {
                      const checked = selectedInstrumentIds.includes(instrument.id);
                      return (
                        <label key={instrument.id} className="flex cursor-pointer items-start gap-2 rounded-md border border-border p-2 text-sm">
                          <Checkbox
                            checked={checked}
                            onCheckedChange={(value) => {
                              setSelectedInstrumentIds((prev) => value === true ? Array.from(new Set([...prev, instrument.id])) : prev.filter((id) => id !== instrument.id));
                            }}
                          />
                          <span>
                            <span className="font-medium">{instrument.code}</span>
                            <span className="mt-0.5 block text-xs text-muted-foreground">{instrument.name}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">Selecione um ou mais instrumentos. Apenas triagens curtas são elegíveis para modo grupo.</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ct">Título do TCLE</Label>
                <Input id="ct" value={consentTitle} onChange={(e) => setConsentTitle(e.target.value)} maxLength={200} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cb">Termo de Consentimento Livre e Esclarecido *</Label>
                <Textarea id="cb" rows={10} value={consentBody} onChange={(e) => setConsentBody(e.target.value)} maxLength={20000} />
                <p className="text-xs text-muted-foreground">Este texto é exibido ao respondente antes das perguntas. Personalize conforme seu contexto de pesquisa.</p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
              <Button
                disabled={!title.trim() || selectedInstrumentIds.length === 0 || consentBody.trim().length < 20 || create.isPending}
                onClick={() => create.mutate()}
              >
                {create.isPending ? "Gerando…" : "Gerar link"}
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Link gerado</DialogTitle>
              <DialogDescription>Compartilhe este link com os participantes. Ele é reutilizável enquanto a campanha estiver ativa.</DialogDescription>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="rounded-md border border-border bg-surface-2 p-3">
                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                  <LinkIcon className="h-3.5 w-3.5" /> Link público
                </div>
                <p className="mt-1 break-all font-mono text-sm">{createdLink}</p>
              </div>
              <Button
                variant="outline"
                onClick={async () => {
                  await navigator.clipboard.writeText(createdLink ?? "");
                  toast.success("Link copiado.");
                }}
              >
                <Copy className="mr-2 h-4 w-4" /> Copiar
              </Button>
            </div>
            <DialogFooter>
              <Button onClick={() => setOpen(false)}>Fechar</Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
