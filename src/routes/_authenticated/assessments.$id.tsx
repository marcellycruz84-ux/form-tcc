import { createFileRoute, Link } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { AppShell } from "@/components/app-shell";
import { getAssessment, markAlertReviewed } from "@/lib/assessments.functions";
import { getMyProfile } from "@/lib/profile.functions";
import { writeAuditClientAction } from "@/lib/audit-client";
import { AlertTriangle, ArrowLeft, CheckCheck, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer } from "recharts";
import { pdf } from "@react-pdf/renderer";
import { LaudoPDF } from "@/lib/pdf/LaudoPDF";

export const Route = createFileRoute("/_authenticated/assessments/$id")({
  head: () => ({ meta: [{ title: "Resultado - Aplicação de Questionários" }] }),
  component: AssessmentDetail,
});

type Rule = { aggregation: string; min_value: number; max_value: number; transform: unknown } | null;
type Cutoff = { min_score: number; max_score: number; classification: string; message: string; domain_id: string | null };
type Domain = { id: string; code: string; name: string };
type CutoffHit = { scope?: "total" | "domain"; domain_id?: string; classification: string; message: string; score: number };

function AssessmentDetail() {
  const { id } = Route.useParams();
  const fn = useServerFn(getAssessment);
  const markFn = useServerFn(markAlertReviewed);
  const profileFn = useServerFn(getMyProfile);
  const auditFn = useServerFn(writeAuditClientAction);
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["assessment", id], queryFn: () => fn({ data: { assessment_id: id } }) });
  const profile = useQuery({ queryKey: ["my-profile"], queryFn: () => profileFn(), staleTime: 60_000 });

  const mark = useMutation({
    mutationFn: () => markFn({ data: { assessment_id: id } }),
    onSuccess: () => {
      toast.success("Item marcado como revisado");
      qc.invalidateQueries({ queryKey: ["assessment", id] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
    },
    onError: (e) => toast.error((e as Error).message),
  });

  const a = q.data;
  const result = a?.result as
    | { computed: unknown; cutoff_hits: unknown; flags: unknown; reviewed_at: string | null; reviewed_by: string | null }
    | null
    | undefined;
  const flags = ((result?.flags as string[] | undefined) ?? []);
  const cutoffHits = ((result?.cutoff_hits as CutoffHit[] | undefined) ?? []);
  const computed = (result?.computed as { total?: number; by_domain?: Record<string, number> } | undefined) ?? {};
  const total = computed.total;
  const totalHit = cutoffHits.find((h) => h.scope !== "domain") ?? cutoffHits[0];
  const rule = (a?.rule as Rule) ?? null;
  const cutoffs = ((a?.cutoffs as Cutoff[] | undefined) ?? []);
  const domains = ((a?.domains as Domain[] | undefined) ?? []);
  const isWhoqol = a?.instrument?.code === "WHOQOL-BREF";
  const domainMax = computed.by_domain ? Object.keys(computed.by_domain).length * (rule?.max_value ?? 5) : 0;

  // Máximo do escore total para SUM (não-WHOQOL) - soma o max de cada cutoff cobrindo a faixa.
  const totalMax = cutoffs.filter((c) => c.domain_id === null).reduce((m, c) => Math.max(m, c.max_score), 0);

  async function downloadLaudo() {
    if (!a || !result) return;
    try {
      const blob = await pdf(
        <LaudoPDF
          data={{
            patient_name: a.patient_name,
            instrument_code: a.instrument?.code ?? "",
            instrument_name: a.instrument?.name ?? "",
            created_at: a.created_at,
            status: a.status,
            total,
            total_max: totalMax || undefined,
            classification: totalHit?.classification,
            message: totalHit?.message,
            cutoffs,
            domains,
            by_domain: computed.by_domain,
            flags,
            professional_name: profile.data?.full_name ?? "",
            professional_credential: profile.data?.credential ?? "",
            is_whoqol: isWhoqol,
          }}
        />,
      ).toBlob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      const dateStr = new Date(a.created_at).toISOString().slice(0, 10);
      link.download = `relatorio-${(a.instrument?.code ?? "avaliacao").toLowerCase()}-${dateStr}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      await auditFn({ data: { assessment_id: id, kind: "pdf_download" } });
      toast.success("Relatório gerado.");
    } catch (e) {
      toast.error((e as Error).message);
    }
  }

  return (
    <AppShell
      title={a?.instrument?.name ?? "Avaliação"}
      action={
        <div className="flex items-center gap-2">
          {result && (
            <Button size="sm" onClick={downloadLaudo}>
              <Download className="mr-1 h-4 w-4" aria-hidden="true" /> Baixar relatório
            </Button>
          )}
          {a?.patient_id && (
            <Button asChild variant="ghost" size="sm">
              <Link to="/patients/$id" params={{ id: a.patient_id }}><ArrowLeft className="mr-1 h-4 w-4" aria-hidden="true" /> Respondente</Link>
            </Button>
          )}
        </div>
      }
    >
      {q.isLoading && <p className="text-sm text-muted-foreground">Carregando…</p>}
      {q.isError && <p role="alert" className="text-sm text-destructive">{(q.error as Error).message}</p>}
      {a && (
        <div className="space-y-6">
          {/* Cabeçalho: paciente, instrumento, data, status */}
          <header className="rounded-lg border border-border bg-background p-6">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Respondente</p>
                <p className="mt-1 text-lg font-semibold">{a.patient_name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Instrumento</p>
                <p className="mt-1 text-lg font-semibold">{a.instrument?.code} - {a.instrument?.name}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Data</p>
                <p className="mt-1 text-sm">{new Date(a.created_at).toLocaleString("pt-BR")}</p>
              </div>
              <div>
                <p className="text-xs uppercase tracking-wide text-muted-foreground">Status</p>
                <p className="mt-1 text-sm capitalize">{a.status.replace("_", " ")}</p>
              </div>
            </div>
          </header>

          {result ? (
            <>
              {flags.length > 0 && (
                <div
                  role="alert"
                  className="flex flex-col gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-5 sm:flex-row sm:items-start"
                >
                  <AlertTriangle className="mt-0.5 h-5 w-5 text-destructive" aria-hidden="true" />
                  <div className="flex-1">
                    <p className="text-sm font-semibold text-destructive">Item sensível</p>
                    <ul className="mt-1 space-y-0.5 text-sm">
                      {flags.map((f) => <li key={f}>{formatFlag(f)}</li>)}
                    </ul>
                    {result.reviewed_at && (
                      <p className="mt-2 text-xs text-muted-foreground">
                        Revisado em {new Date(result.reviewed_at).toLocaleString("pt-BR")}
                      </p>
                    )}
                  </div>
                  {!result.reviewed_at && (
                    <Button size="sm" onClick={() => mark.mutate()} disabled={mark.isPending}>
                      <CheckCheck className="mr-1 h-4 w-4" aria-hidden="true" />
                      {mark.isPending ? "Marcando…" : "Marcar como revisado"}
                    </Button>
                  )}
                </div>
              )}

              {/* Escore total + classificação + mensagem */}
              {typeof total === "number" && (
                <section className="rounded-lg border border-border bg-background p-6">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground">Pontuação total</p>
                  <div className="mt-1 flex items-baseline gap-3">
                    <p className="text-4xl font-semibold tracking-tight">{formatScore(total)}</p>
                    {rule && (
                      <p className="text-sm text-muted-foreground">
                        de {isWhoqol ? "0–100 por domínio" : `${rule.min_value * (a.instrument?.code === "GAD-7" ? 7 : a.instrument?.code === "PHQ-9" ? 9 : 1)}–${rule.max_value * (a.instrument?.code === "GAD-7" ? 7 : a.instrument?.code === "PHQ-9" ? 9 : 1)}`}
                      </p>
                    )}
                  </div>
                  {totalHit && (
                    <>
                      <p className="mt-3 text-base font-medium">{totalHit.classification}</p>
                      <p className="mt-1 text-sm text-muted-foreground">{totalHit.message}</p>
                    </>
                  )}

                  {/* B2 - barra de faixa com cut-offs (só para SUM total) */}
                  {!isWhoqol && rule && cutoffs.filter((c) => c.domain_id === null).length > 0 && (
                    <CutoffBar
                      total={total}
                      cutoffs={cutoffs.filter((c) => c.domain_id === null)}
                      max={cutoffs.filter((c) => c.domain_id === null).reduce((m, c) => Math.max(m, c.max_score), 0)}
                      instrumentCode={a.instrument?.code ?? ""}
                    />
                  )}
                </section>
              )}

              {/* B1 - breakdown por domínio (WHOQOL) + B3 - radar */}
              {computed.by_domain && domains.length > 0 && (
                <section className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-border bg-background p-6">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Domínios</p>
                    <ul className="mt-3 space-y-3">
                      {domains.map((d) => {
                        const v = computed.by_domain?.[d.id];
                        const hit = cutoffHits.find((h) => h.scope === "domain" && h.domain_id === d.id);
                        return (
                          <li key={d.id}>
                            <div className="mb-1 flex items-baseline justify-between text-sm">
                              <span className="font-medium">{d.name}</span>
                              <span className="tabular-nums">{v !== undefined ? formatScore(v) : "-"}</span>
                            </div>
                            <div className="h-2 overflow-hidden rounded-full bg-surface-2">
                              <div
                                className="h-full rounded-full bg-foreground/80"
                                style={{ width: `${Math.max(0, Math.min(100, v ?? 0))}%` }}
                                aria-hidden="true"
                              />
                            </div>
                            {hit && <p className="mt-1 text-xs text-muted-foreground">{hit.classification} - {hit.message}</p>}
                          </li>
                        );
                      })}
                    </ul>
                  </div>

                  <div className="rounded-lg border border-border bg-background p-6">
                    <p className="text-xs uppercase tracking-wide text-muted-foreground">Perfil</p>
                    <div className="mt-2 h-64" aria-label="Gráfico radar dos domínios">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart
                          data={domains.map((d) => ({
                            domain: d.name,
                            score: Math.round(computed.by_domain?.[d.id] ?? 0),
                          }))}
                        >
                          <PolarGrid stroke="var(--border)" />
                          <PolarAngleAxis dataKey="domain" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
                          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} />
                          <Radar dataKey="score" stroke="var(--chart-1)" fill="var(--chart-1)" fillOpacity={0.3} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                </section>
              )}
            </>
          ) : (
            <p className="rounded-lg border border-border bg-background p-6 text-sm text-muted-foreground">
              Aguardando o respondente concluir o questionário.
            </p>
          )}
        </div>
      )}
      {/* domainMax existe para satisfazer TS quando não usado em UI mas mantém intenção */}
      <span className="hidden" aria-hidden="true">{domainMax}</span>
    </AppShell>
  );
}

function formatScore(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

function formatFlag(f: string): string {
  if (f === "phq9_q9_positive") return "PHQ-9 item 9 (ideação suicida) marcado. Recomenda-se conversar com o respondente e, se necessário, encaminhá-lo a apoio profissional.";
  return f;
}

/** B2 - barra horizontal SVG com marcadores de cut-off. */
function CutoffBar({
  total,
  cutoffs,
  max,
  instrumentCode,
}: {
  total: number;
  cutoffs: Cutoff[];
  max: number;
  instrumentCode: string;
}) {
  const sorted = [...cutoffs].sort((a, b) => a.min_score - b.min_score);
  const width = 100; // percent
  const clampedPct = Math.max(0, Math.min(100, (total / max) * 100));

  const paletteVar = ["--chart-1", "--chart-2", "--chart-3", "--chart-4", "--chart-5"];
  return (
    <div className="mt-6" aria-label={`Faixa de escore ${instrumentCode}: ${total} de ${max}`}>
      <svg viewBox="0 0 100 18" width="100%" height="42" role="img">
        <title>{`Escore ${instrumentCode}: ${total} de ${max}`}</title>
        {sorted.map((c, i) => {
          const x = (c.min_score / max) * width;
          const w = ((c.max_score - c.min_score + 1) / max) * width;
          return (
            <g key={i}>
              <rect
                x={x}
                y={4}
                width={w}
                height={6}
                fill={`var(${paletteVar[i % paletteVar.length]})`}
                fillOpacity={0.35}
              />
            </g>
          );
        })}
        {/* Marcador do escore */}
        <line x1={clampedPct} x2={clampedPct} y1={2} y2={12} stroke="var(--foreground)" strokeWidth={0.8} />
        <polygon
          points={`${clampedPct - 1.2},14 ${clampedPct + 1.2},14 ${clampedPct},11.5`}
          fill="var(--foreground)"
        />
      </svg>
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {sorted.map((c, i) => (
          <span key={i} className="inline-flex items-center gap-1">
            <span
              className="inline-block h-2 w-2 rounded-sm"
              style={{ background: `var(${paletteVar[i % paletteVar.length]})`, opacity: 0.6 }}
              aria-hidden="true"
            />
            {c.classification} ({c.min_score}–{c.max_score})
          </span>
        ))}
      </div>
    </div>
  );
}
