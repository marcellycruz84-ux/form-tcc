import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { listPatients } from "@/lib/patients.functions";
import { Plus, Search, Users } from "lucide-react";
import { EmptyBlock, ErrorBlock, SkeletonList } from "@/components/state";
import { PatientDialog } from "@/components/patient-dialog";

export const Route = createFileRoute("/_authenticated/patients/")({
  head: () => ({ meta: [{ title: "Respondentes - Aplicação de Questionários" }] }),
  component: PatientsPage,
});

function PatientsPage() {
  const listFn = useServerFn(listPatients);
  const [query, setQuery] = useState("");
  const patients = useQuery({ queryKey: ["patients"], queryFn: () => listFn() });

  const filtered = (patients.data ?? []).filter((p) => {
    if (!query) return true;
    const q = query.toLowerCase();
    return p.full_name.toLowerCase().includes(q) || p.cpf_masked.includes(q);
  });

  return (
    <AppShell
      title="Respondentes"
      action={
        <PatientDialog
          trigger={<Button size="sm"><Plus className="mr-1 h-4 w-4" aria-hidden="true" /> Novo respondente</Button>}
        />
      }
    >
      <div className="mb-4 flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 focus-within:ring-2 focus-within:ring-ring">
        <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <label htmlFor="patient-search" className="sr-only">Buscar respondentes</label>
        <input
          id="patient-search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar por nome ou CPF"
          className="flex-1 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>

      <div className="overflow-hidden rounded-lg border border-border bg-background">
        {patients.isLoading && <SkeletonList rows={5} />}
        {patients.isError && (
          <div className="p-6">
            <ErrorBlock error={patients.error} onRetry={() => patients.refetch()} />
          </div>
        )}
        {!patients.isLoading && !patients.isError && filtered.length === 0 && (
          <EmptyBlock
            icon={Users}
            title={query ? "Nenhum respondente encontrado" : "Nenhum respondente cadastrado"}
            description={query ? "Ajuste o filtro ou cadastre um novo respondente." : "Use o botão \"Novo respondente\" acima."}
          />
        )}
        {filtered.length > 0 && (
          <ul className="divide-y divide-border">
            {filtered.map((p) => (
              <li key={p.id}>
                <Link
                  to="/patients/$id"
                  params={{ id: p.id }}
                  className="flex min-h-14 items-center justify-between gap-3 px-5 py-4 text-sm hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
                >
                  <div className="min-w-0">
                    <p className="truncate font-medium">{p.full_name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {p.cpf_masked || "CPF não informado"}{p.email ? ` · ${p.email}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {new Date(p.created_at).toLocaleDateString("pt-BR")}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </AppShell>
  );
}
