import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useRef } from "react";
import { AppShell } from "@/components/app-shell";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { BarChart3, Download, Users } from "lucide-react";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { getGroupCampaignDetails } from "@/lib/group-campaigns.functions";

export const Route = createFileRoute("/_authenticated/groups/$id")({
  head: () => ({ meta: [{ title: "Resultados da campanha" }] }),
  component: GroupResultsPage,
});

type OfficialAnalysis = {
  code: string;
  total?: number;
  maximum?: number;
  classification?: string | null;
  interpretation?: string;
  q9?: number;
  depressive_screen?: boolean;
  general_quality_of_life?: number;
  health_satisfaction?: number;
  domains?: Array<{ name: string; score_4_20: number; score_0_100: number }>;
};

function formatClinicalNumber(value: number | undefined): string {
  if (value === undefined) return "Não disponível";
  return Number.isInteger(value)
    ? String(value)
    : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "").replace(".", ",");
}

function GroupResultsPage() {
  const { id } = Route.useParams();
  const getResultsFn = useServerFn(getGroupCampaignDetails);
  const chartsRef = useRef<HTMLDivElement>(null);
  const query = useQuery({
    queryKey: ["group-campaign-results", id],
    queryFn: () => getResultsFn({ data: { campaign_id: id } }),
  });

  if (query.isLoading) {
    return (
      <AppShell title={<Skeleton className="h-7 w-72" />} backTo="/groups">
        <Skeleton className="h-80 w-full" />
      </AppShell>
    );
  }

  if (query.isError || !query.data) {
    return (
      <AppShell title="Resultados da campanha" backTo="/groups">
        <Alert variant="destructive">
          {(query.error as Error | null)?.message ?? "Campanha não encontrada."}
        </Alert>
      </AppShell>
    );
  }

  const { campaign, responses } = query.data;
  const participantMap = new Map<
    string,
    { name: string; period: string; responses: typeof responses }
  >();
  for (const response of responses) {
    const key = `${response.respondent_name.trim().toLocaleLowerCase("pt-BR")}|${response.academic_period.trim().toLocaleLowerCase("pt-BR")}`;
    const participant = participantMap.get(key) ?? {
      name: response.respondent_name,
      period: response.academic_period,
      responses: [],
    };
    participant.responses.push(response);
    participantMap.set(key, participant);
  }
  const participants = Array.from(participantMap.values());
  const generalCharts = campaign.instruments.map((instrument) => {
    const analyses = responses
      .filter((response) => response.instrument_id === instrument.id)
      .map((response) => response.official_analysis as OfficialAnalysis | null)
      .filter((analysis): analysis is OfficialAnalysis => Boolean(analysis));
    if (instrument.code === "WHOQOL-BREF") {
      const domainNames = analyses
        .flatMap((analysis) => analysis.domains ?? [])
        .map((domain) => domain.name);
      const uniqueDomains = Array.from(new Set(domainNames));
      const average = (values: number[]) =>
        values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
      return {
        ...instrument,
        kind: "domains" as const,
        responses: analyses.length,
        q1Average: average(
          analyses
            .map((analysis) => analysis.general_quality_of_life)
            .filter((value): value is number => value !== undefined),
        ),
        q2Average: average(
          analyses
            .map((analysis) => analysis.health_satisfaction)
            .filter((value): value is number => value !== undefined),
        ),
        data: uniqueDomains.map((name) => ({
          label: name,
          value: average(
            analyses
              .flatMap((analysis) => analysis.domains ?? [])
              .filter((domain) => domain.name === name)
              .map((domain) => domain.score_0_100),
          ),
          count: analyses.length,
        })),
      };
    }
    const officialOrder =
      instrument.code === "GAD-7"
        ? ["Ansiedade mínima", "Ansiedade leve", "Ansiedade moderada", "Ansiedade grave"]
        : [
            "Sintomas mínimos",
            "Depressão leve",
            "Depressão moderada",
            "Depressão moderadamente grave",
            "Depressão grave",
          ];
    const counts = new Map<string, number>();
    for (const analysis of analyses) {
      if (analysis.classification)
        counts.set(analysis.classification, (counts.get(analysis.classification) ?? 0) + 1);
    }
    return {
      ...instrument,
      kind: "classification" as const,
      responses: analyses.length,
      q1Average: 0,
      q2Average: 0,
      data: officialOrder.map((label) => {
        const count = counts.get(label) ?? 0;
        return { label, count, value: analyses.length ? (count / analyses.length) * 100 : 0 };
      }),
    };
  });

  async function downloadCharts() {
    const container = chartsRef.current;
    if (!container) return;
    const svgNodes = Array.from(container.querySelectorAll("svg"));
    if (svgNodes.length === 0) return;
    const exportedCharts = generalCharts.filter((chart) => chart.responses > 0);
    const width = 1400;
    const margin = 80;
    const headerHeight = 230;
    const sectionHeight = 570;
    const footerHeight = 110;
    const chartWidth = width - margin * 2;
    const chartHeight = 380;
    const height = headerHeight + sectionHeight * exportedCharts.length + footerHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = height * 2;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(2, 2);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, height);

    context.fillStyle = "#111827";
    context.font = "600 18px Arial, sans-serif";
    context.fillText("MINDFUL ASSESSMENTS", margin, 58);
    context.fillStyle = "#6b7280";
    context.font = "14px Arial, sans-serif";
    context.fillText("Relatório gráfico consolidado", margin, 88);
    context.fillStyle = "#111827";
    context.font = "700 32px Arial, sans-serif";
    context.fillText(campaign.title, margin, 140, chartWidth);
    context.fillStyle = "#6b7280";
    context.font = "14px Arial, sans-serif";
    context.fillText(
      `${participants.length} ${participants.length === 1 ? "participante" : "participantes"} · ${exportedCharts.length} ${exportedCharts.length === 1 ? "instrumento analisado" : "instrumentos analisados"}`,
      margin,
      178,
    );
    context.textAlign = "right";
    context.fillText(`Emitido em ${new Date().toLocaleString("pt-BR")}`, width - margin, 58);
    context.textAlign = "left";
    context.strokeStyle = "#d1d5db";
    context.lineWidth = 1;
    context.beginPath();
    context.moveTo(margin, 205);
    context.lineTo(width - margin, 205);
    context.stroke();

    for (let index = 0; index < svgNodes.length; index += 1) {
      const chart = exportedCharts[index];
      if (!chart) continue;
      const sectionTop = headerHeight + index * sectionHeight;
      context.fillStyle = "#111827";
      context.font = "700 22px Arial, sans-serif";
      context.fillText(`${chart.code} · ${chart.name}`, margin, sectionTop + 38, chartWidth);
      context.fillStyle = "#4b5563";
      context.font = "14px Arial, sans-serif";
      const indicator =
        chart.kind === "domains"
          ? "Perfil médio dos domínios oficiais do WHOQOL-BREF na escala de 0 a 100"
          : "Distribuição percentual dos participantes por classificação oficial";
      context.fillText(
        `${indicator} · ${chart.responses} respostas válidas`,
        margin,
        sectionTop + 68,
        chartWidth,
      );
      if (chart.kind === "domains") {
        context.fillStyle = "#111827";
        context.font = "600 14px Arial, sans-serif";
        context.fillText(
          `Qualidade de vida geral (Q1): ${formatClinicalNumber(chart.q1Average)}/5     Satisfação com a saúde (Q2): ${formatClinicalNumber(chart.q2Average)}/5`,
          margin,
          sectionTop + 96,
          chartWidth,
        );
      }

      const svg = svgNodes[index].cloneNode(true) as SVGElement;
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svg.setAttribute("width", String(chartWidth));
      svg.setAttribute("height", String(chartHeight));
      svg.style.background = "#ffffff";
      const blob = new Blob([new XMLSerializer().serializeToString(svg)], {
        type: "image/svg+xml;charset=utf-8",
      });
      const url = URL.createObjectURL(blob);
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Não foi possível gerar o gráfico."));
        image.src = url;
      });
      context.drawImage(image, margin, sectionTop + 115, chartWidth, chartHeight);
      URL.revokeObjectURL(url);

      context.strokeStyle = "#e5e7eb";
      context.beginPath();
      context.moveTo(margin, sectionTop + sectionHeight - 28);
      context.lineTo(width - margin, sectionTop + sectionHeight - 28);
      context.stroke();
    }

    context.fillStyle = "#6b7280";
    context.font = "13px Arial, sans-serif";
    context.fillText(
      "Resultados de rastreio e acompanhamento. Os instrumentos são analisados separadamente e não constituem diagnóstico automático.",
      margin,
      height - 62,
      chartWidth,
    );
    context.fillText(
      "GAD-7 e PHQ-9: proporções por classificação oficial. WHOQOL-BREF: médias descritivas dos domínios oficiais.",
      margin,
      height - 36,
      chartWidth,
    );

    const link = document.createElement("a");
    link.download = `relatorio-grafico-${
      campaign.title
        .toLowerCase()
        .replace(/[^a-z0-9]+/gi, "-")
        .replace(/^-|-$/g, "") || "campanha"
    }.png`;
    link.href = canvas.toDataURL("image/png", 1);
    link.click();
  }

  return (
    <AppShell
      title={`Resultados: ${campaign.title}`}
      backTo="/groups"
      action={
        <Button
          size="sm"
          variant="outline"
          onClick={() => void downloadCharts()}
          disabled={generalCharts.every((chart) => chart.responses === 0)}
        >
          <Download className="mr-2 h-4 w-4" /> Baixar relatório gráfico
        </Button>
      }
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Respostas registradas</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{responses.length}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Instrumentos</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{campaign.instruments.length}</div>
            </CardContent>
          </Card>
        </div>

        <div ref={chartsRef} className="space-y-4">
          {generalCharts.map(
            (chart) =>
              chart.responses > 0 && (
                <Card key={chart.id}>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {chart.code} -{" "}
                      {chart.kind === "domains"
                        ? "perfil geral por domínio"
                        : "classificações oficiais da campanha"}
                    </CardTitle>
                    <p className="text-sm text-muted-foreground">
                      {chart.responses}{" "}
                      {chart.responses === 1 ? "resposta válida" : "respostas válidas"}
                    </p>
                    {chart.kind === "domains" && (
                      <div className="grid gap-2 pt-2 sm:grid-cols-2">
                        <ResultField
                          label="Média Q1 - qualidade de vida geral"
                          value={`${formatClinicalNumber(chart.q1Average)}/5`}
                        />
                        <ResultField
                          label="Média Q2 - satisfação com a saúde"
                          value={`${formatClinicalNumber(chart.q2Average)}/5`}
                        />
                      </div>
                    )}
                  </CardHeader>
                  <CardContent>
                    <div className="h-72">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart
                          data={chart.data}
                          layout="vertical"
                          margin={{ top: 10, right: 24, left: 16, bottom: 10 }}
                        >
                          <CartesianGrid strokeDasharray="3 3" vertical={false} />
                          <XAxis type="number" domain={[0, 100]} unit="%" />
                          <YAxis
                            type="category"
                            dataKey="label"
                            width={180}
                            tick={{ fontSize: 11 }}
                          />
                          <Tooltip
                            formatter={(value, _name, item) =>
                              chart.kind === "domains"
                                ? [
                                    `${Number(value).toFixed(2).replace(".", ",")}/100`,
                                    "Média oficial",
                                  ]
                                : [
                                    `${Number(value).toFixed(1).replace(".", ",")}% (${item.payload.count} participantes)`,
                                    "Proporção",
                                  ]
                            }
                          />
                          <Bar
                            dataKey="value"
                            name={chart.kind === "domains" ? "Média do domínio" : "Participantes"}
                            fill="#334155"
                          />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              ),
          )}
        </div>

        <section>
          <div className="mb-3">
            <h2 className="text-lg font-semibold">Resultados clínicos por participante</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Cada instrumento é calculado separadamente. Não existe soma geral entre os testes.
            </p>
          </div>
          {responses.length === 0 ? (
            <div className="rounded-lg border border-border bg-background p-6 text-sm text-muted-foreground">
              Nenhuma resposta recebida ainda.
            </div>
          ) : (
            <div className="space-y-4">
              {participants.map((participant) => (
                <article
                  key={`${participant.name}-${participant.period}`}
                  className="rounded-lg border border-border bg-background"
                >
                  <header className="border-b border-border px-5 py-4">
                    <h3 className="font-semibold">{participant.name}</h3>
                    <p className="text-sm text-muted-foreground">
                      {participant.period || "Período não informado"}
                    </p>
                  </header>
                  <div className="divide-y divide-border">
                    {campaign.instruments.map((instrument) => {
                      const response = participant.responses.find(
                        (item) => item.instrument_id === instrument.id,
                      );
                      return (
                        <div key={instrument.id} className="p-5">
                          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                            <div>
                              <h4 className="font-semibold">{instrument.code}</h4>
                              <p className="text-xs text-muted-foreground">{instrument.name}</p>
                            </div>
                            {response && (
                              <time className="text-xs text-muted-foreground">
                                {new Date(response.submitted_at).toLocaleString("pt-BR")}
                              </time>
                            )}
                          </div>
                          {response ? (
                            <ClinicalResult
                              analysis={response.official_analysis as OfficialAnalysis | null}
                            />
                          ) : (
                            <p className="text-sm text-muted-foreground">
                              Este instrumento não foi respondido.
                            </p>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}

function ClinicalResult({ analysis }: { analysis: OfficialAnalysis | null }) {
  if (!analysis)
    return (
      <p className="text-sm text-muted-foreground">
        Cálculo oficial indisponível para este registro.
      </p>
    );
  if (analysis.code === "WHOQOL-BREF") {
    return (
      <div className="space-y-3 text-sm">
        <div className="grid gap-3 sm:grid-cols-2">
          <ResultField
            label="Qualidade de vida geral (Q1)"
            value={`${formatClinicalNumber(analysis.general_quality_of_life)}/5`}
          />
          <ResultField
            label="Satisfação com a saúde (Q2)"
            value={`${formatClinicalNumber(analysis.health_satisfaction)}/5`}
          />
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead className="text-xs text-muted-foreground">
              <tr>
                <th className="py-2 pr-4">Domínio</th>
                <th className="py-2 pr-4">Escala 4–20</th>
                <th className="py-2">Escala 0–100</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {analysis.domains?.map((domain) => (
                <tr key={domain.name}>
                  <td className="py-2 pr-4 font-medium">{domain.name}</td>
                  <td className="py-2 pr-4">{formatClinicalNumber(domain.score_4_20)}</td>
                  <td className="py-2">{formatClinicalNumber(domain.score_0_100)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs leading-5 text-muted-foreground">{analysis.interpretation}</p>
      </div>
    );
  }
  return (
    <div className="space-y-3 text-sm">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        <ResultField
          label="Pontuação oficial"
          value={`${formatClinicalNumber(analysis.total)}/${analysis.maximum}`}
        />
        <ResultField label="Classificação" value={analysis.classification ?? "Não classificado"} />
        {analysis.code === "PHQ-9" && (
          <ResultField
            label="Possível episódio depressivo"
            value={
              analysis.depressive_screen
                ? "Critérios sintomáticos presentes"
                : "Critérios sintomáticos não atingidos"
            }
          />
        )}
      </div>
      {analysis.code === "PHQ-9" && (
        <div
          className={`rounded-md border p-3 ${analysis.q9 && analysis.q9 > 0 ? "border-destructive/40 bg-destructive/5" : "border-border bg-surface-2"}`}
        >
          <p className="font-medium">Questão 9: {analysis.q9 ?? 0}</p>
          <p className="mt-1 text-xs leading-5 text-muted-foreground">{analysis.interpretation}</p>
        </div>
      )}
      {analysis.code === "GAD-7" && (
        <p className="text-xs leading-5 text-muted-foreground">{analysis.interpretation}</p>
      )}
    </div>
  );
}

function ResultField({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-border bg-surface-2 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 font-semibold">{value}</p>
    </div>
  );
}
