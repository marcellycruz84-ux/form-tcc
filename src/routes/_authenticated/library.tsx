import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { BookOpen, Clock, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  listLibraryInstruments,
  toggleInstrument,
  createInstrumentRequest,
  listMyInstrumentRequests,
} from "@/lib/instruments.functions";

export const Route = createFileRoute("/_authenticated/library")({
  head: () => ({ meta: [{ title: "Biblioteca de testes - Psicoclínica" }] }),
  component: LibraryPage,
});

const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente",
  in_review: "Em análise",
  delivered: "Disponibilizado",
  rejected: "Rejeitado",
};

function LibraryPage() {
  const listFn = useServerFn(listLibraryInstruments);
  const listReqFn = useServerFn(listMyInstrumentRequests);
  const instruments = useQuery({ queryKey: ["library-instruments"], queryFn: () => listFn() });
  const requests = useQuery({ queryKey: ["my-instrument-requests"], queryFn: () => listReqFn() });

  return (
    <AppShell title="Biblioteca de testes" action={<RequestDialog />}>
      <Tabs defaultValue="catalog">
        <TabsList>
          <TabsTrigger value="catalog">Catálogo</TabsTrigger>
          <TabsTrigger value="requests">
            Minhas solicitações {requests.data ? `(${requests.data.length})` : ""}
          </TabsTrigger>
        </TabsList>

        <TabsContent value="catalog" className="mt-6">
          <p className="mb-5 max-w-2xl text-sm text-muted-foreground">
            Ative apenas os instrumentos que você aplica. Somente os testes ativados aparecerão ao
            criar uma nova avaliação.
          </p>
          {instruments.isLoading && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => (
                <Skeleton key={i} className="h-44 w-full" />
              ))}
            </div>
          )}
          {instruments.isError && (
            <div className="rounded-lg border border-destructive/20 bg-destructive/5 p-5 text-sm text-destructive">
              {(instruments.error as Error).message || "Não foi possível carregar a biblioteca."}
            </div>
          )}
          {instruments.data && instruments.data.length === 0 && (
            <div className="rounded-lg border border-border bg-background p-10 text-center">
              <BookOpen className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
              <p className="mt-3 text-sm text-muted-foreground">
                Nenhum instrumento disponível ainda. Solicite um novo teste ao administrador.
              </p>
            </div>
          )}
          {instruments.data && instruments.data.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {instruments.data.map((inst) => (
                <InstrumentCard key={inst.id} instrument={inst} />
              ))}
            </div>
          )}
          <div className="mt-8 flex justify-center border-t border-border pt-6">
            <RequestDialog
              trigger={
                <button
                  type="button"
                  className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm"
                >
                  Não encontrou o teste que precisa? Solicite aqui.
                </button>
              }
            />
          </div>
        </TabsContent>

        <TabsContent value="requests" className="mt-6">
          {requests.isLoading && <Skeleton className="h-32 w-full" />}
          {requests.data && requests.data.length === 0 && (
            <div className="rounded-lg border border-border bg-background p-10 text-center">
              <p className="text-sm text-muted-foreground">
                Você ainda não solicitou nenhum instrumento.
              </p>
            </div>
          )}
          {requests.data && requests.data.length > 0 && (
            <ul className="divide-y divide-border rounded-lg border border-border bg-background">
              {requests.data.map((r) => (
                <li key={r.id} className="flex flex-wrap items-start justify-between gap-3 p-4">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium">{r.instrument_name}</p>
                    {r.reference && (
                      <p className="text-xs text-muted-foreground">Ref.: {r.reference}</p>
                    )}
                    <p className="mt-1 text-sm text-foreground/90">{r.purpose}</p>
                    {r.admin_notes && (
                      <p className="mt-2 rounded border border-border bg-muted/40 p-2 text-xs">
                        <span className="font-medium">Resposta:</span> {r.admin_notes}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-muted-foreground">
                      {new Date(r.created_at).toLocaleString("pt-BR")}
                    </p>
                  </div>
                  <StatusBadge status={r.status} />
                </li>
              ))}
            </ul>
          )}
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function InstrumentCard({
  instrument,
}: {
  instrument: {
    id: string;
    code: string;
    name: string;
    description: string;
    estimated_minutes: number | null;
    is_active: boolean;
    domains: Array<{ id: string; name: string }>;
  };
}) {
  const qc = useQueryClient();
  const toggleFn = useServerFn(toggleInstrument);
  const [optimistic, setOptimistic] = useState(instrument.is_active);
  const mut = useMutation({
    mutationFn: (next: boolean) =>
      toggleFn({ data: { instrument_id: instrument.id, is_active: next } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["library-instruments"] });
      qc.invalidateQueries({ queryKey: ["instruments"] });
      toast.success(optimistic ? "Instrumento ativado" : "Instrumento desativado");
    },
    onError: (e) => {
      setOptimistic(instrument.is_active);
      toast.error((e as Error).message);
    },
  });

  return (
    <article className="flex flex-col rounded-lg border border-border bg-background p-5">
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold leading-tight">{instrument.name}</h3>
        <span className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">
          {instrument.code}
        </span>
      </div>
      {instrument.description && (
        <p className="mb-3 line-clamp-3 text-sm text-muted-foreground">{instrument.description}</p>
      )}
      {instrument.estimated_minutes && (
        <p className="mb-3 flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="h-3 w-3" aria-hidden="true" /> ~{instrument.estimated_minutes} min
        </p>
      )}
      {instrument.domains.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1">
          {instrument.domains.map((d) => (
            <span
              key={d.id}
              className="rounded-full bg-muted px-2 py-0.5 text-[11px] text-muted-foreground"
            >
              {d.name}
            </span>
          ))}
        </div>
      )}
      <div className="mt-auto flex items-center justify-between border-t border-border pt-3">
        <Label htmlFor={`toggle-${instrument.id}`} className="cursor-pointer text-sm">
          {optimistic ? "Ativo" : "Inativo"}
        </Label>
        <Switch
          id={`toggle-${instrument.id}`}
          checked={optimistic}
          disabled={mut.isPending}
          onCheckedChange={(next) => {
            setOptimistic(next);
            mut.mutate(next);
          }}
        />
      </div>
    </article>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: "bg-muted text-muted-foreground",
    in_review: "bg-muted text-foreground",
    delivered: "border border-foreground/20 bg-background text-foreground",
    rejected: "bg-destructive/10 text-destructive",
  };
  return (
    <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium ${styles[status] ?? styles.pending}`}>
      {STATUS_LABEL[status] ?? status}
    </span>
  );
}

function RequestDialog({ trigger }: { trigger?: React.ReactNode } = {}) {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [reference, setReference] = useState("");
  const [purpose, setPurpose] = useState("");
  const qc = useQueryClient();
  const createFn = useServerFn(createInstrumentRequest);
  const mut = useMutation({
    mutationFn: () =>
      createFn({ data: { instrument_name: name, reference, purpose } }),
    onSuccess: () => {
      toast.success("Solicitação enviada. Você receberá uma resposta em breve.");
      qc.invalidateQueries({ queryKey: ["my-instrument-requests"] });
      setName("");
      setReference("");
      setPurpose("");
      setOpen(false);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {trigger ?? (
          <Button size="sm" variant="outline">
            <Plus className="h-4 w-4 sm:mr-1" aria-hidden="true" />
            <span className="hidden sm:inline">Solicitar teste</span>
            <span className="sr-only sm:hidden">Solicitar teste</span>
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-md sm:w-full">
        <DialogHeader>
          <DialogTitle>Solicitar novo instrumento</DialogTitle>
          <DialogDescription>
            Descreva o teste que gostaria de aplicar. A equipe avalia cada solicitação.
          </DialogDescription>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            mut.mutate();
          }}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="req-name">Nome do instrumento *</Label>
            <Input
              id="req-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Ex.: BDI-II - Inventário de Depressão de Beck"
              required
              minLength={2}
              maxLength={120}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="req-ref">Referência ou autor</Label>
            <Input
              id="req-ref"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
              placeholder="Ex.: Beck, A.T. (1996)"
              maxLength={200}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="req-purpose">Finalidade na sua prática clínica *</Label>
            <Textarea
              id="req-purpose"
              value={purpose}
              onChange={(e) => setPurpose(e.target.value)}
              rows={4}
              minLength={10}
              maxLength={2000}
              placeholder="Ex.: Uso rotineiramente para triagem inicial de depressão em adultos."
              required
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? "Enviando…" : "Enviar solicitação"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
