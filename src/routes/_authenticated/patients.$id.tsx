import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { getPatient } from "@/lib/patients.functions";
import { createAssessment, listAssessmentsByPatient, listInstruments, cancelAssessment } from "@/lib/assessments.functions";
import { exportPatientData, anonymizePatient, hardDeletePatient } from "@/lib/lgpd.functions";
import { notifyPatientLink } from "@/lib/notify.functions";
import { toast } from "sonner";
import { AlertTriangle, Copy, Plus, Download, UserX, Trash2, Send, Pencil, Ban, StickyNote, ClipboardList, ArrowLeft } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, CartesianGrid } from "recharts";
import { PatientDialog } from "@/components/patient-dialog";
import { Checkbox } from "@/components/ui/checkbox";

export const Route = createFileRoute("/_authenticated/patients/$id")({
  head: () => ({ meta: [{ title: "Respondente - Aplicação de Questionários" }] }),
  component: PatientDetail,
});

type AssessmentRow = {
  id: string;
  status: string;
  created_at: string;
  expires_at: string;
  consumed_at: string | null;
  instrument: { code: string; name: string } | null;
  result: { computed: unknown; cutoff_hits: unknown; flags: unknown } | null;
};

function PatientDetail() {
  const { id } = Route.useParams();
  const getPatientFn = useServerFn(getPatient);
  const listFn = useServerFn(listAssessmentsByPatient);

  const patient = useQuery({ queryKey: ["patient", id], queryFn: () => getPatientFn({ data: { patient_id: id } }) });
  const assessments = useQuery({
    queryKey: ["patient-assessments", id],
    queryFn: () => listFn({ data: { patient_id: id } }) as Promise<AssessmentRow[]>,
  });

  const completed = (assessments.data ?? []).filter((a) => a.status === "completed" && a.result);

  return (
    <AppShell
      title={patient.data?.full_name ?? "Respondente"}
      action={
        <div className="flex flex-wrap items-center justify-end gap-2">
          {patient.data && (
            <PatientDialog
              existing={{
                id,
                full_name: patient.data.full_name,
                cpf: patient.data.cpf,
                email: patient.data.email,
                phone: patient.data.phone,
                gender: patient.data.gender ?? "",
                notes: patient.data.notes ?? "",
                birth_year: patient.data.birth_year,
              }}
              trigger={
                <Button size="sm" variant="outline">
                  <Pencil className="h-4 w-4 sm:mr-1" aria-hidden="true" />
                  <span className="hidden sm:inline">Editar</span>
                  <span className="sr-only sm:hidden">Editar respondente</span>
                </Button>
              }
            />
          )}
          <NewAssessmentDialog patientId={id} patientEmail={patient.data?.email ?? ""} />
        </div>
      }
    >
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Visão geral</TabsTrigger>
          <TabsTrigger value="history">Histórico ({completed.length})</TabsTrigger>
          <TabsTrigger value="lgpd">LGPD</TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="mt-6">
          {patient.data && (
            <div className="grid gap-4 lg:grid-cols-3">
              <section className="rounded-lg border border-border bg-background p-5 lg:col-span-1">
                <h2 className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">Dados cadastrais</h2>
                <dl className="space-y-2 text-sm">
                  <Row k="CPF" v={patient.data.cpf ? patient.data.cpf.replace(/^(\d{3})(\d{3})(\d{3})(\d{2})$/, "$1.$2.$3-$4") : "-"} />
                  <Row k="Email" v={patient.data.email || "-"} />
                  <Row k="Telefone" v={patient.data.phone || "-"} />
                  <Row k="Nascimento" v={patient.data.birth_year ? String(patient.data.birth_year) : "-"} />
                  <Row k="Gênero" v={patient.data.gender || "-"} />
                </dl>
                {patient.data.notes && (
                  <div className="mt-5 border-t border-border pt-4">
                    <p className="mb-2 flex items-center gap-1.5 text-xs uppercase tracking-wide text-muted-foreground">
                      <StickyNote className="h-3.5 w-3.5" aria-hidden="true" /> Anotações
                    </p>
                    <p className="whitespace-pre-wrap text-sm text-foreground/90">{patient.data.notes}</p>
                  </div>
                )}
              </section>

              <section className="rounded-lg border border-border bg-background p-5 lg:col-span-2">
                <h2 className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">Avaliações recentes</h2>
                {(assessments.data ?? []).length === 0 ? (
                  <p className="py-8 text-center text-sm text-muted-foreground">Nenhuma avaliação criada.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {(assessments.data ?? []).slice(0, 6).map((a) => (
                      <AssessmentRowItem key={a.id} a={a} patientId={id} />
                    ))}
                  </ul>
                )}
              </section>
            </div>
          )}
        </TabsContent>

        <TabsContent value="history" className="mt-6">
          <HistoryTab items={completed} allItems={assessments.data ?? []} patientId={id} />
        </TabsContent>

        <TabsContent value="lgpd" className="mt-6">
          <LgpdTab patientId={id} patientName={patient.data?.full_name ?? "Respondente"} />
        </TabsContent>
      </Tabs>
    </AppShell>
  );
}

function HistoryTab({ items, allItems, patientId }: { items: AssessmentRow[]; allItems: AssessmentRow[]; patientId: string }) {
  // Séries por instrumento (uma linha por code)
  const series = useMemo(() => {
    const byCode: Record<string, Array<{ ts: number; date: string; value: number }>> = {};
    for (const a of items) {
      const code = a.instrument?.code ?? "?";
      const total = (a.result as { computed?: { total?: number } } | null)?.computed?.total;
      if (typeof total !== "number") continue;
      (byCode[code] ||= []).push({
        ts: new Date(a.created_at).getTime(),
        date: new Date(a.created_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }),
        value: total,
      });
    }
    for (const arr of Object.values(byCode)) arr.sort((a, b) => a.ts - b.ts);
    return byCode;
  }, [items]);

  const codes = Object.keys(series);
  // Merge por data para o LineChart
  const merged = useMemo(() => {
    type Row = { ts: number; date: string } & Record<string, number | string>;
    const allDates = new Map<number, Row>();
    for (const [code, arr] of Object.entries(series)) {
      for (const p of arr) {
        const row: Row = allDates.get(p.ts) ?? ({ ts: p.ts, date: p.date } as Row);
        row[code] = p.value;
        allDates.set(p.ts, row);
      }
    }
    return Array.from(allDates.values()).sort((a, b) => a.ts - b.ts);
  }, [series]);

  const palette = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-border bg-background p-5">
        <h2 className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
          Evolução dos escores {codes.length > 0 && <span className="normal-case text-foreground/60">- {codes.join(", ")}</span>}
        </h2>
        {codes.length === 0 ? (
          <p className="py-10 text-center text-sm text-muted-foreground">
            Nenhuma avaliação concluída ainda para gerar o gráfico.
          </p>
        ) : (
          <div className="h-64" aria-label="Gráfico de linha da evolução dos escores">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={merged} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
                <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                <YAxis tick={{ fontSize: 12, fill: "var(--muted-foreground)" }} />
                <Tooltip
                  contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                {codes.map((code, i) => (
                  <Line
                    key={code}
                    type="monotone"
                    dataKey={code}
                    stroke={palette[i % palette.length]}
                    strokeWidth={2}
                    dot={{ r: 3 }}
                    connectNulls
                  />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className="rounded-lg border border-border bg-background">
        <h2 className="border-b border-border px-5 py-3 text-xs uppercase tracking-wide text-muted-foreground">
          Todas as avaliações
        </h2>
        {allItems.length === 0 ? (
          <p className="p-10 text-center text-sm text-muted-foreground">Nenhuma avaliação criada.</p>
        ) : (
          <ul className="divide-y divide-border">
            {allItems.map((a) => <AssessmentRowItem key={a.id} a={a} patientId={patientId} />)}
          </ul>
        )}
      </section>
    </div>
  );
}

function AssessmentRowItem({ a, patientId }: { a: AssessmentRow; patientId: string }) {
  const qc = useQueryClient();
  const cancelFn = useServerFn(cancelAssessment);
  const cancelMut = useMutation({
    mutationFn: () => cancelFn({ data: { assessment_id: a.id } }),
    onSuccess: () => {
      toast.success("Avaliação cancelada. O link do respondente foi invalidado.");
      qc.invalidateQueries({ queryKey: ["patient-assessments", patientId] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const flags = (a.result?.flags as string[] | undefined) ?? [];
  const cutoffHits = (a.result?.cutoff_hits as Array<{ classification: string }> | undefined) ?? [];
  const total = (a.result as { computed?: { total?: number } } | null)?.computed?.total;
  const canCancel = a.status === "pending" || a.status === "in_progress";

  return (
    <li className="flex flex-wrap items-center justify-between gap-3 px-5 py-4 text-sm">
      <div className="min-w-0">
        <p className="truncate font-medium">{a.instrument?.name}</p>
        <p className="text-xs text-muted-foreground">
          {new Date(a.created_at).toLocaleString("pt-BR")} · <span className="uppercase">{a.status}</span>
          {cutoffHits[0] && <> · {cutoffHits[0].classification}</>}
          {typeof total === "number" && <> · escore {Number.isInteger(total) ? total : total.toFixed(1)}</>}
        </p>
      </div>
      <div className="flex items-center gap-3">
        {flags.length > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full border border-destructive/40 bg-destructive/5 px-2 py-1 text-xs font-medium text-destructive">
            <AlertTriangle className="h-3 w-3" aria-hidden="true" /> alerta
          </span>
        )}
        {canCancel && (
          <button
            type="button"
            onClick={() => {
              if (confirm("Cancelar esta avaliação? O link enviado ao respondente será invalidado.")) cancelMut.mutate();
            }}
            disabled={cancelMut.isPending}
            className="inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground hover:text-destructive focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            aria-label={`Cancelar avaliação ${a.instrument?.name ?? ""}`}
          >
            <Ban className="h-3 w-3" aria-hidden="true" /> {cancelMut.isPending ? "…" : "Cancelar"}
          </button>
        )}
        <Link to="/assessments/$id" params={{ id: a.id }} className="text-xs text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm">
          Ver
        </Link>
      </div>
    </li>
  );
}

function Row({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between gap-4 text-sm">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="text-right font-medium">{v}</dd>
    </div>
  );
}

type IssuedLink = { id: string; url: string; expires_at: string; code: string; name: string };

function NewAssessmentDialog({ patientId, patientEmail }: { patientId: string; patientEmail: string }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [issued, setIssued] = useState<IssuedLink[] | null>(null);
  const [emailTo, setEmailTo] = useState("");
  const [creating, setCreating] = useState(false);
  const listInstFn = useServerFn(listInstruments);
  const createFn = useServerFn(createAssessment);
  const notifyFn = useServerFn(notifyPatientLink);
  const qc = useQueryClient();

  const instruments = useQuery({ queryKey: ["instruments"], queryFn: () => listInstFn(), enabled: open });

  function toggle(code: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code); else next.add(code);
      return next;
    });
  }

  async function emitAll() {
    if (selected.size === 0) return;
    setCreating(true);
    const results: IssuedLink[] = [];
    const errors: string[] = [];
    try {
      for (const code of selected) {
        try {
          const r = await createFn({ data: { patient_id: patientId, instrument_code: code, ttl_hours: 48 } });
          const meta = (instruments.data ?? []).find((i) => i.code === code);
          results.push({
            id: r.id,
            url: `${window.location.origin}/a/${r.token}`,
            expires_at: r.expires_at,
            code,
            name: meta?.name ?? code,
          });
        } catch (e) {
          errors.push(`${code}: ${(e as Error).message}`);
        }
      }
      if (results.length > 0) {
        setIssued(results);
        setEmailTo(patientEmail);
        qc.invalidateQueries({ queryKey: ["patient-assessments", patientId] });
        qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
        toast.success(`${results.length} ${results.length === 1 ? "link gerado" : "links gerados"}.`);
      }
      if (errors.length > 0) toast.error(errors.join(" · "));
    } finally {
      setCreating(false);
    }
  }

  const sendMut = useMutation({
    mutationFn: async () => {
      if (!issued) throw new Error("Sem links.");
      const results = await Promise.allSettled(
        issued.map((i) => notifyFn({ data: { assessment_id: i.id, email: emailTo, link: i.url } })),
      );
      const ok = results.filter((r) => r.status === "fulfilled").length;
      const fail = results.length - ok;
      return { ok, fail, provider: (results.find((r) => r.status === "fulfilled") as PromiseFulfilledResult<{ provider: string }> | undefined)?.value.provider };
    },
    onSuccess: (r) => {
      if (r.fail === 0) {
        toast.success(r.provider === "stub" ? `${r.ok} envios registrados (configure o provedor em notify.functions.ts).` : `${r.ok} emails enviados.`);
      } else {
        toast.error(`${r.ok} enviados, ${r.fail} falharam.`);
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function copyAll() {
    if (!issued) return;
    const text = issued.map((i) => `${i.name}: ${i.url}`).join("\n");
    navigator.clipboard.writeText(text);
    toast.success("Todos os links copiados");
  }

  function reset() { setIssued(null); setEmailTo(""); setSelected(new Set()); setOpen(false); }
  function backToSelect() { setIssued(null); setSelected(new Set()); }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) reset(); else setOpen(true); }}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus className="h-4 w-4 sm:mr-1" aria-hidden="true" />
          <span className="hidden sm:inline">Nova avaliação</span>
          <span className="sr-only sm:hidden">Nova avaliação</span>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90dvh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto sm:w-full">
        <DialogHeader>
          <DialogTitle>{issued ? "Links gerados" : "Selecionar instrumentos"}</DialogTitle>
          <DialogDescription>
            {issued
              ? "Envie os links ao respondente. Cada link é único e expira em 48 h."
              : "Marque um ou mais instrumentos. Um link separado será gerado para cada teste."}
          </DialogDescription>
        </DialogHeader>

        {!issued ? (
          <div className="space-y-3">
            <ul className="space-y-2" role="group" aria-label="Instrumentos disponíveis">
              {(instruments.data ?? []).map((i) => {
                const checked = selected.has(i.code);
                return (
                  <li key={i.id}>
                    <label
                      className={`flex cursor-pointer items-start gap-3 rounded-md border p-3 text-sm transition-colors hover:bg-accent focus-within:ring-2 focus-within:ring-ring ${
                        checked ? "border-foreground/40 bg-accent/50" : "border-border bg-background"
                      }`}
                    >
                      <Checkbox
                        checked={checked}
                        onCheckedChange={() => toggle(i.code)}
                        aria-label={`Selecionar ${i.name}`}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="flex items-center gap-2 font-medium">
                          <ClipboardList className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                          {i.name}
                          <span className="rounded-sm bg-muted px-1.5 py-0.5 font-mono text-[10px] uppercase text-muted-foreground">{i.code}</span>
                        </p>
                        {i.description && <p className="mt-0.5 text-xs text-muted-foreground">{i.description}</p>}
                      </div>
                    </label>
                  </li>
                );
              })}
              {instruments.isLoading && <li className="text-sm text-muted-foreground">Carregando…</li>}
              {!instruments.isLoading && (instruments.data ?? []).length === 0 && (
                <li className="text-sm text-muted-foreground">Nenhum instrumento cadastrado.</li>
              )}
            </ul>
            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="ghost" onClick={reset}>Cancelar</Button>
              <Button type="button" onClick={emitAll} disabled={selected.size === 0 || creating}>
                {creating
                  ? "Gerando…"
                  : selected.size === 0
                    ? "Emitir link"
                    : `Emitir ${selected.size} ${selected.size === 1 ? "link" : "links"}`}
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <div className="space-y-4">
            <ul className="space-y-2">
              {issued.map((i) => (
                <li key={i.id} className="rounded-md border border-border bg-background p-3">
                  <div className="mb-2 flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{i.name}</p>
                      <p className="text-xs text-muted-foreground">Expira em {new Date(i.expires_at).toLocaleString("pt-BR")}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 rounded-md border border-border bg-surface-2 p-2">
                    <code className="min-w-0 flex-1 truncate text-[11px]">{i.url}</code>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => { navigator.clipboard.writeText(i.url); toast.success(`Link ${i.name} copiado`); }}
                      aria-label={`Copiar link ${i.name}`}
                    >
                      <Copy className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                </li>
              ))}
            </ul>

            {issued.length > 1 && (
              <Button type="button" variant="outline" size="sm" onClick={copyAll} className="w-full sm:w-auto">
                <Copy className="mr-2 h-4 w-4" aria-hidden="true" /> Copiar todos os links
              </Button>
            )}

            <div className="space-y-2 rounded-md border border-border p-3">
              <label htmlFor="notify-email" className="text-xs text-muted-foreground">
                Enviar {issued.length === 1 ? "o link" : "todos os links"} por email
              </label>
              <div className="flex flex-col gap-2 sm:flex-row">
                <Input id="notify-email" type="email" placeholder="respondente@email.com" value={emailTo} onChange={(e) => setEmailTo(e.target.value)} />
                <Button size="sm" variant="outline" onClick={() => sendMut.mutate()} disabled={!emailTo || sendMut.isPending}>
                  <Send className="mr-1 h-4 w-4" aria-hidden="true" /> {sendMut.isPending ? "Enviando…" : "Enviar"}
                </Button>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-2">
              <Button type="button" variant="ghost" onClick={backToSelect}>
                <ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" /> Gerar mais
              </Button>
              <Button type="button" onClick={reset}>Fechar</Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function LgpdTab({ patientId, patientName }: { patientId: string; patientName: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const exportFn = useServerFn(exportPatientData);
  const anonFn = useServerFn(anonymizePatient);
  const deleteFn = useServerFn(hardDeletePatient);

  const exportMut = useMutation({
    mutationFn: async () => exportFn({ data: { patient_id: patientId } }),
    onSuccess: (payload) => {
      const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `dados-respondente-${patientId.slice(0, 8)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Exportação concluída");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const anonMut = useMutation({
    mutationFn: async () => anonFn({ data: { patient_id: patientId } }),
    onSuccess: () => {
      toast.success("Respondente anonimizado. Escores preservados.");
      qc.invalidateQueries({ queryKey: ["patient", patientId] });
      qc.invalidateQueries({ queryKey: ["patients"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const [confirmDelete, setConfirmDelete] = useState(false);
  const [confirmText, setConfirmText] = useState("");
  const [confirmChecked, setConfirmChecked] = useState(false);
  const deleteMut = useMutation({
    mutationFn: async () => deleteFn({ data: { patient_id: patientId, confirmation: "EXCLUIR DEFINITIVAMENTE" } }),
    onSuccess: () => {
      toast.success("Respondente excluído definitivamente.");
      qc.invalidateQueries({ queryKey: ["patients"] });
      navigate({ to: "/patients" });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <div className="space-y-4">
      <Card
        title="Exportar dados do titular"
        desc="Empacota avaliações, respostas, resultados e consentimentos em JSON para entrega ao respondente (art. 18 LGPD)."
      >
        <Button size="sm" variant="outline" onClick={() => exportMut.mutate()} disabled={exportMut.isPending}>
          <Download className="mr-2 h-4 w-4" /> {exportMut.isPending ? "Preparando…" : "Baixar JSON"}
        </Button>
      </Card>

      <Card
        title="Anonimizar respondente"
        desc="Remove identificadores pessoais (nome, CPF, contato, anotações) mas preserva os escores agregados para a análise do trabalho."
      >
        <Button size="sm" variant="outline" onClick={() => {
          if (confirm("Confirma anonimização deste paciente? Esta ação é irreversível.")) anonMut.mutate();
        }} disabled={anonMut.isPending}>
          <UserX className="mr-2 h-4 w-4" /> {anonMut.isPending ? "Aplicando…" : "Anonimizar"}
        </Button>
      </Card>

      <Card
        title="Direito ao esquecimento"
        desc="Exclusão definitiva do respondente e de todos os dados vinculados (avaliações, respostas, consentimentos). Não pode ser desfeita."
      >
        <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
          <DialogTrigger asChild>
            <Button size="sm" variant="destructive"><Trash2 className="mr-2 h-4 w-4" /> Excluir definitivamente</Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Excluir {patientName}?</DialogTitle>
              <DialogDescription>
                Esta ação apaga permanentemente todos os dados do respondente, incluindo avaliações e consentimentos.
                Um evento de auditoria será gravado antes da exclusão. Não é possível reverter.
              </DialogDescription>
            </DialogHeader>
            <label className="flex items-start gap-2 rounded-md border border-border bg-surface-2 p-3 text-sm">
              <input type="checkbox" checked={confirmChecked} onChange={(e) => setConfirmChecked(e.target.checked)} className="mt-0.5" />
              <span>Entendo que esta ação é irreversível e que o titular solicitou a exclusão.</span>
            </label>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">
                Para confirmar, digite: <code className="font-mono">EXCLUIR DEFINITIVAMENTE</code>
              </label>
              <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} placeholder="EXCLUIR DEFINITIVAMENTE" />
            </div>
            <DialogFooter>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
              <Button
                variant="destructive"
                disabled={!confirmChecked || confirmText !== "EXCLUIR DEFINITIVAMENTE" || deleteMut.isPending}
                onClick={() => deleteMut.mutate()}
              >
                {deleteMut.isPending ? "Excluindo…" : "Confirmar exclusão"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Card>
    </div>
  );
}

function Card({ title, desc, children }: { title: string; desc: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-background p-5">
      <h3 className="text-sm font-medium">{title}</h3>
      <p className="mt-1 mb-4 max-w-2xl text-sm text-muted-foreground">{desc}</p>
      {children}
    </section>
  );
}

