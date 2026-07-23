import { createFileRoute } from "@tanstack/react-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminListRequests, adminUpdateRequest } from "@/lib/instruments.functions";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/console/tickets")({
  component: TicketsBoard,
});

type TicketStatus = "pending" | "in_review" | "delivered" | "rejected";
type Ticket = {
  id: string;
  professional_id: string;
  professional_name: string;
  instrument_name: string;
  reference: string;
  purpose: string;
  status: TicketStatus;
  admin_notes: string;
  created_at: string;
};

const COLUMNS: Array<{ status: TicketStatus; label: string }> = [
  { status: "pending", label: "Pendente" },
  { status: "in_review", label: "Em análise" },
  { status: "delivered", label: "Disponibilizado" },
  { status: "rejected", label: "Rejeitado" },
];

function TicketsBoard() {
  const listFn = useServerFn(adminListRequests);
  const tickets = useQuery({ queryKey: ["admin-requests"], queryFn: () => listFn() });

  return (
    <div className="space-y-4">
      {tickets.isLoading && <Skeleton className="h-64" />}
      {tickets.data && (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {COLUMNS.map((col) => {
            const items = (tickets.data as Ticket[]).filter((t) => t.status === col.status);
            return (
              <section key={col.status} className="rounded-lg border border-border bg-muted/30 p-3">
                <header className="mb-3 flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {col.label}
                  </h2>
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs">
                    {items.length}
                  </span>
                </header>
                <ul className="space-y-2">
                  {items.map((t) => (
                    <TicketCard key={t.id} ticket={t} />
                  ))}
                  {items.length === 0 && (
                    <li className="rounded border border-dashed border-border p-4 text-center text-xs text-muted-foreground">
                      Vazio
                    </li>
                  )}
                </ul>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  const qc = useQueryClient();
  const updateFn = useServerFn(adminUpdateRequest);
  const [notes, setNotes] = useState(ticket.admin_notes);
  const [expanded, setExpanded] = useState(false);

  const mut = useMutation({
    mutationFn: (patch: { status?: TicketStatus; admin_notes?: string }) =>
      updateFn({ data: { id: ticket.id, status: patch.status ?? ticket.status, admin_notes: patch.admin_notes } }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-requests"] });
      toast.success("Ticket atualizado");
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <li className="rounded-md border border-border bg-background p-3">
      <p className="text-sm font-medium">{ticket.instrument_name}</p>
      <p className="mt-1 text-xs text-muted-foreground">por {ticket.professional_name}</p>
      {ticket.reference && (
        <p className="mt-1 text-xs text-muted-foreground">Ref.: {ticket.reference}</p>
      )}
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="mt-2 text-xs text-muted-foreground underline underline-offset-4 hover:text-foreground"
      >
        {expanded ? "Recolher" : "Ver detalhes"}
      </button>
      {expanded && (
        <div className="mt-3 space-y-3 border-t border-border pt-3">
          <p className="text-sm">{ticket.purpose}</p>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Status</label>
            <Select
              value={ticket.status}
              onValueChange={(v) => mut.mutate({ status: v as TicketStatus })}
            >
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {COLUMNS.map((c) => (
                  <SelectItem key={c.status} value={c.status}>{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <label className="mb-1 block text-xs text-muted-foreground">Nota ao profissional</label>
            <Textarea
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Resposta ou motivo…"
            />
            <Button
              size="sm"
              variant="outline"
              className="mt-2"
              onClick={() => mut.mutate({ admin_notes: notes })}
              disabled={mut.isPending || notes === ticket.admin_notes}
            >
              Salvar nota
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Criado em {new Date(ticket.created_at).toLocaleString("pt-BR")}
          </p>
        </div>
      )}
    </li>
  );
}
