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
import type { Json } from "@/integrations/supabase/types";

export const Route = createFileRoute("/_authenticated/groups/$id")({
  head: () => ({ meta: [{ title: "Resultados da campanha" }] }),
  component: GroupResultsPage,
});

function totalScore(computed: Json): string {
  if (!computed || typeof computed !== "object" || Array.isArray(computed)) return "-";
  const total = computed.total;
  return typeof total === "number" ? total.toFixed(2).replace(".00", "") : "-";
}

function numericTotal(computed: Json): number | null {
  if (!computed || typeof computed !== "object" || Array.isArray(computed)) return null;
  return typeof computed.total === "number" ? computed.total : null;
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
    return <AppShell title={<Skeleton className="h-7 w-72" />} backTo="/groups"><Skeleton className="h-80 w-full" /></AppShell>;
  }

  if (query.isError || !query.data) {
    return (
      <AppShell title="Resultados da campanha" backTo="/groups">
        <Alert variant="destructive">{(query.error as Error | null)?.message ?? "Campanha não encontrada."}</Alert>
      </AppShell>
    );
  }

  const { campaign, responses } = query.data;
  const instrumentById = new Map(campaign.instruments.map((instrument) => [instrument.id, instrument]));
  const scoreCharts = campaign.instruments.map((instrument) => {
    const scores = responses
      .filter((response) => response.instrument_id === instrument.id)
      .map((response) => numericTotal(response.computed))
      .filter((score): score is number => score !== null);
    const counts = new Map<number, number>();
    for (const score of scores) counts.set(score, (counts.get(score) ?? 0) + 1);
    return {
      ...instrument,
      average: scores.length ? scores.reduce((sum, score) => sum + score, 0) / scores.length : 0,
      data: Array.from(counts.entries()).sort(([a], [b]) => a - b).map(([score, count]) => ({ score, count })),
    };
  });

  async function downloadCharts() {
    const container = chartsRef.current;
    if (!container) return;
    const svgNodes = Array.from(container.querySelectorAll("svg"));
    if (svgNodes.length === 0) return;

    const width = Math.max(900, container.scrollWidth);
    const chartHeight = 360;
    const canvas = document.createElement("canvas");
    canvas.width = width * 2;
    canvas.height = chartHeight * svgNodes.length * 2;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.scale(2, 2);
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, width, chartHeight * svgNodes.length);

    for (let index = 0; index < svgNodes.length; index += 1) {
      const svg = svgNodes[index].cloneNode(true) as SVGElement;
      svg.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      svg.setAttribute("width", String(width));
      svg.setAttribute("height", String(chartHeight));
      const blob = new Blob([new XMLSerializer().serializeToString(svg)], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const image = new Image();
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("Não foi possível gerar o gráfico."));
        image.src = url;
      });
      context.drawImage(image, 0, index * chartHeight, width, chartHeight);
      URL.revokeObjectURL(url);
    }

    const link = document.createElement("a");
    link.download = `graficos-${campaign.title.toLowerCase().replace(/[^a-z0-9]+/gi, "-").replace(/^-|-$/g, "") || "campanha"}.png`;
    link.href = canvas.toDataURL("image/png");
    link.click();
  }

  return (
    <AppShell
      title={`Resultados: ${campaign.title}`}
      backTo="/groups"
      action={<Button size="sm" variant="outline" onClick={() => void downloadCharts()} disabled={scoreCharts.every((chart) => chart.data.length === 0)}><Download className="mr-2 h-4 w-4" /> Baixar gráficos</Button>}
    >
      <div className="space-y-6">
        <div className="grid gap-4 sm:grid-cols-2">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Respostas registradas</CardTitle>
              <Users className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{responses.length}</div></CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Instrumentos</CardTitle>
              <BarChart3 className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent><div className="text-2xl font-bold">{campaign.instruments.length}</div></CardContent>
          </Card>
        </div>

        <div ref={chartsRef} className="space-y-4">
          {scoreCharts.map((chart) => chart.data.length > 0 && (
            <Card key={chart.id}>
              <CardHeader>
                <CardTitle className="text-base">{chart.code} - distribuição dos escores</CardTitle>
                <p className="text-sm text-muted-foreground">{chart.data.reduce((sum, point) => sum + point.count, 0)} respostas · média {chart.average.toFixed(2)}</p>
              </CardHeader>
              <CardContent><div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chart.data} margin={{ top: 10, right: 16, left: -8, bottom: 20 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} />
                    <XAxis dataKey="score" label={{ value: "Escore", position: "insideBottom", offset: -10 }} />
                    <YAxis allowDecimals={false} />
                    <Tooltip formatter={(value) => [value, "Participantes"]} labelFormatter={(value) => `Escore: ${value}`} />
                    <Bar dataKey="count" name="Participantes" fill="#334155" />
                  </BarChart>
                </ResponsiveContainer>
              </div></CardContent>
            </Card>
          ))}
        </div>

        <Card>
          <CardHeader><CardTitle className="text-base">Participantes</CardTitle></CardHeader>
          <CardContent>
            {responses.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nenhuma resposta recebida ainda.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-border text-xs text-muted-foreground">
                    <tr><th className="py-2 pr-4">Nome</th><th className="py-2 pr-4">Período</th><th className="py-2 pr-4">Instrumento</th><th className="py-2 pr-4">Escore</th><th className="py-2">Enviado em</th></tr>
                  </thead>
                  <tbody>
                    {responses.map((response) => (
                      <tr key={response.id} className="border-b border-border last:border-0">
                        <td className="py-3 pr-4 font-medium">{response.respondent_name}</td>
                        <td className="py-3 pr-4">{response.academic_period || "Não informado"}</td>
                        <td className="py-3 pr-4">{response.instrument_id ? instrumentById.get(response.instrument_id)?.code ?? "-" : "-"}</td>
                        <td className="py-3 pr-4">{totalScore(response.computed)}</td>
                        <td className="py-3 whitespace-nowrap">{new Date(response.submitted_at).toLocaleString("pt-BR")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </AppShell>
  );
}
