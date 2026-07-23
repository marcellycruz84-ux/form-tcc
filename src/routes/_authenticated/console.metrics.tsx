import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminMetrics } from "@/lib/instruments.functions";
import { Skeleton } from "@/components/ui/skeleton";
import { LineChart, Line, BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";

export const Route = createFileRoute("/_authenticated/console/metrics")({
  component: MetricsView,
});

function MetricsView() {
  const fn = useServerFn(adminMetrics);
  const m = useQuery({ queryKey: ["admin-metrics"], queryFn: () => fn() });

  if (m.isLoading) return <Skeleton className="h-64" />;
  if (!m.data) return null;

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card label="Profissionais" value={m.data.totals.professionals} />
        <Card label="Novos (30d)" value={m.data.totals.new_professionals_30d} />
        <Card label="Avaliações (30d)" value={m.data.totals.assessments_30d} />
        <Card label="Concluídas (30d)" value={m.data.totals.completed_30d} />
      </div>

      <section className="rounded-lg border border-border bg-background p-5">
        <h2 className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
          Cadastros de profissionais - últimos 30 dias
        </h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={m.data.timeseries} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <Line type="monotone" dataKey="signups" stroke="#4b5563" strokeWidth={2} dot={{ r: 2 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className="rounded-lg border border-border bg-background p-5">
        <h2 className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">
          Avaliações geradas por dia - últimos 30 dias
        </h2>
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={m.data.timeseries} margin={{ top: 8, right: 12, bottom: 0, left: -12 }}>
              <CartesianGrid stroke="var(--border)" strokeDasharray="3 3" vertical={false} />
              <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
              />
              <Bar dataKey="assessments" fill="#6b7280" />
              <Bar dataKey="completed" fill="#111827" />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </section>
    </div>
  );
}

function Card({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background p-5">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}
