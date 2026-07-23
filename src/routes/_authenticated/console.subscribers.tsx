import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminListSubscribers } from "@/lib/instruments.functions";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export const Route = createFileRoute("/_authenticated/console/subscribers")({
  component: SubscribersView,
});

function SubscribersView() {
  const listFn = useServerFn(adminListSubscribers);
  const [q, setQ] = useState("");
  const subs = useQuery({ queryKey: ["admin-subscribers"], queryFn: () => listFn() });

  const filtered = (subs.data ?? []).filter((s) =>
    q ? (s.full_name ?? "").toLowerCase().includes(q.toLowerCase()) : true,
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3">
        <Input
          placeholder="Buscar por nome…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          className="max-w-sm"
        />
        <p className="text-xs text-muted-foreground">
          {subs.data ? `${filtered.length} de ${subs.data.length}` : "…"}
        </p>
      </div>
      <div className="overflow-hidden rounded-lg border border-border bg-background">
        {subs.isLoading && <Skeleton className="h-40" />}
        {subs.data && (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-border text-left text-xs uppercase tracking-wide text-muted-foreground">
                <th className="px-4 py-2">Nome</th>
                <th className="px-4 py-2">CRP</th>
                <th className="px-4 py-2">Pacientes</th>
                <th className="px-4 py-2">Papéis</th>
                <th className="px-4 py-2">Cadastro</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((s) => (
                <tr key={s.id} className="border-b border-border/60">
                  <td className="px-4 py-3 font-medium">{s.full_name || "-"}</td>
                  <td className="px-4 py-3 text-muted-foreground">{s.credential || "-"}</td>
                  <td className="px-4 py-3">{s.patients}</td>
                  <td className="px-4 py-3">
                    <div className="flex flex-wrap gap-1">
                      {s.roles.map((r) => (
                        <span key={r} className="rounded-full bg-muted px-2 py-0.5 text-[11px]">
                          {r}
                        </span>
                      ))}
                    </div>
                  </td>
                  <td className="px-4 py-3 text-xs text-muted-foreground">
                    {new Date(s.created_at).toLocaleDateString("pt-BR")}
                  </td>
                </tr>
              ))}
              {filtered.length === 0 && (
                <tr>
                  <td colSpan={5} className="p-8 text-center text-sm text-muted-foreground">
                    Nenhum profissional encontrado.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
