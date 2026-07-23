import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listAuditLogs, auditFacets } from "@/lib/audit.functions";
import { ChevronLeft, ChevronRight, ShieldAlert } from "lucide-react";
import { EmptyBlock, LoadingBlock } from "@/components/state";

export const Route = createFileRoute("/_authenticated/audit")({
  head: () => ({ meta: [
    { title: "Auditoria - Psicoclínica" },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: AuditPanel,
});

function AuditPanel() {
  const listFn = useServerFn(listAuditLogs);
  const facetsFn = useServerFn(auditFacets);
  const [action, setAction] = useState<string>("");
  const [resource, setResource] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [page, setPage] = useState(0);
  const pageSize = 50;

  const facets = useQuery({
    queryKey: ["audit-facets"],
    queryFn: () => facetsFn(),
    retry: false,
  });

  const q = useQuery({
    queryKey: ["audit-logs", action, resource, from, to, page],
    queryFn: () => listFn({ data: {
      action: action || undefined,
      resource_type: resource || undefined,
      from: from ? new Date(from).toISOString() : undefined,
      to: to ? new Date(to + "T23:59:59").toISOString() : undefined,
      page,
      page_size: pageSize,
    }}),
    retry: false,
  });

  if (q.isError) {
    return (
      <AppShell title="Auditoria">
        <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center">
          <ShieldAlert className="mx-auto h-8 w-8 text-destructive" />
          <h2 className="mt-3 text-lg font-medium">Acesso restrito</h2>
          <p className="mt-2 text-sm text-muted-foreground">{(q.error as Error).message}</p>
        </div>
      </AppShell>
    );
  }

  const totalPages = q.data ? Math.max(1, Math.ceil(q.data.total / pageSize)) : 1;

  return (
    <AppShell title="Auditoria">
      <div className="space-y-6">
        <section className="rounded-lg border border-border bg-background p-5">
          <h2 className="mb-3 text-xs uppercase tracking-wide text-muted-foreground">Filtros</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <FilterSelect label="Ação" value={action} onChange={(v) => { setAction(v); setPage(0); }} options={facets.data?.actions ?? []} />
            <FilterSelect label="Recurso" value={resource} onChange={(v) => { setResource(v); setPage(0); }} options={facets.data?.resources ?? []} />
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">De</label>
              <Input type="date" value={from} onChange={(e) => { setFrom(e.target.value); setPage(0); }} />
            </div>
            <div>
              <label className="mb-1 block text-xs text-muted-foreground">Até</label>
              <Input type="date" value={to} onChange={(e) => { setTo(e.target.value); setPage(0); }} />
            </div>
          </div>
        </section>

        <section className="rounded-lg border border-border bg-background">
          <div className="flex items-center justify-between border-b border-border px-5 py-3">
            <h2 className="text-xs uppercase tracking-wide text-muted-foreground">
              {q.isLoading ? "Carregando…" : `${q.data?.total ?? 0} eventos`}
            </h2>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Button variant="ghost" size="sm" disabled={page === 0} onClick={() => setPage((p) => Math.max(0, p - 1))}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span>{page + 1} / {totalPages}</span>
              <Button variant="ghost" size="sm" disabled={page + 1 >= totalPages} onClick={() => setPage((p) => p + 1)}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                  <th className="px-5 py-2">Data</th>
                  <th className="px-5 py-2">Ação</th>
                  <th className="px-5 py-2">Recurso</th>
                  <th className="px-5 py-2">ID</th>
                  <th className="px-5 py-2">Ator</th>
                  <th className="px-5 py-2">Metadata</th>
                </tr>
              </thead>
              <tbody>
                {q.isLoading && (
                  <tr><td colSpan={6}><LoadingBlock label="Carregando eventos…" /></td></tr>
                )}
                {!q.isLoading && (q.data?.rows ?? []).map((r) => (
                  <tr key={r.id} className="border-b border-border/60 align-top">
                    <td className="px-5 py-2 text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                    <td className="px-5 py-2 font-mono text-xs">{r.action}</td>
                    <td className="px-5 py-2 text-xs">{r.resource_type}</td>
                    <td className="px-5 py-2 font-mono text-xs text-muted-foreground">{r.resource_id?.slice(0, 8) ?? "-"}</td>
                    <td className="px-5 py-2 font-mono text-xs text-muted-foreground">{r.actor_user_id?.slice(0, 8) ?? "sistema"}</td>
                    <td className="px-5 py-2">
                      <pre className="max-w-md overflow-hidden text-ellipsis whitespace-pre-wrap text-xs text-muted-foreground">
                        {r.metadata ? JSON.stringify(r.metadata, null, 0) : ""}
                      </pre>
                    </td>
                  </tr>
                ))}
                {!q.isLoading && q.data?.rows.length === 0 && (
                  <tr><td colSpan={6}>
                    <EmptyBlock title="Nenhum evento no filtro" description="Ajuste ação, recurso ou período." />
                  </td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AppShell>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: string[] }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-muted-foreground">{label}</label>
      <Select value={value || "__all"} onValueChange={(v) => onChange(v === "__all" ? "" : v)}>
        <SelectTrigger><SelectValue placeholder="Todos" /></SelectTrigger>
        <SelectContent>
          <SelectItem value="__all">Todos</SelectItem>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}
