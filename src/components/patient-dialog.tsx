// Dialog reutilizável para criar OU editar respondente, com anotações.
import { useEffect, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter, DialogDescription,
} from "@/components/ui/dialog";
import { upsertPatient } from "@/lib/patients.functions";
import { patientInputSchema, type PatientInput } from "@/lib/schemas";
import { toast } from "sonner";

type Existing = {
  id: string;
  full_name?: string;
  cpf?: string;
  email?: string;
  phone?: string;
  gender?: string;
  notes?: string;
  birth_year?: number | null;
};

const empty: PatientInput = {
  full_name: "", cpf: "", email: "", phone: "", gender: "", notes: "", birth_year: null,
};

export function PatientDialog({
  trigger,
  existing,
  onSaved,
}: {
  trigger: React.ReactNode;
  existing?: Existing;
  onSaved?: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [values, setValues] = useState<PatientInput>(empty);
  const upsert = useServerFn(upsertPatient);
  const qc = useQueryClient();
  const isEdit = !!existing?.id;

  useEffect(() => {
    if (!open) return;
    setValues(existing ? {
      full_name: existing.full_name ?? "",
      cpf: existing.cpf ?? "",
      email: existing.email ?? "",
      phone: existing.phone ?? "",
      gender: existing.gender ?? "",
      notes: existing.notes ?? "",
      birth_year: existing.birth_year ?? null,
    } : empty);
  }, [open, existing]);

  const mut = useMutation({
    mutationFn: async (input: PatientInput) =>
      upsert({ data: isEdit ? { patient_id: existing!.id, input } : { input } }),
    onSuccess: (r) => {
      toast.success(isEdit ? "Respondente atualizado." : "Respondente cadastrado.");
      qc.invalidateQueries({ queryKey: ["patients"] });
      qc.invalidateQueries({ queryKey: ["dashboard-stats"] });
      if (isEdit) qc.invalidateQueries({ queryKey: ["patient", existing!.id] });
      setOpen(false);
      onSaved?.(r.id);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = patientInputSchema.safeParse(values);
    if (!parsed.success) { toast.error(parsed.error.issues[0].message); return; }
    mut.mutate(parsed.data);
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[90dvh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar respondente" : "Novo respondente"}</DialogTitle>
          <DialogDescription>
            Dados pessoais são cifrados em repouso. CPF é opcional e indexado por HMAC.
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          <Field htmlFor="pname" label="Nome completo">
            <Input id="pname" required value={values.full_name} onChange={(e) => setValues((v) => ({ ...v, full_name: e.target.value }))} />
          </Field>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field htmlFor="pcpf" label="CPF">
              <Input id="pcpf" value={values.cpf} onChange={(e) => setValues((v) => ({ ...v, cpf: e.target.value }))} placeholder="000.000.000-00" />
            </Field>
            <Field htmlFor="pyear" label="Ano de nascimento">
              <Input id="pyear" type="number" value={values.birth_year ?? ""} onChange={(e) => setValues((v) => ({ ...v, birth_year: e.target.value ? Number(e.target.value) : null }))} />
            </Field>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field htmlFor="pemail" label="Email">
              <Input id="pemail" type="email" value={values.email} onChange={(e) => setValues((v) => ({ ...v, email: e.target.value }))} />
            </Field>
            <Field htmlFor="pphone" label="Telefone">
              <Input id="pphone" value={values.phone} onChange={(e) => setValues((v) => ({ ...v, phone: e.target.value }))} />
            </Field>
          </div>
          <Field htmlFor="pgender" label="Gênero">
            <Input id="pgender" value={values.gender} onChange={(e) => setValues((v) => ({ ...v, gender: e.target.value }))} />
          </Field>
          <Field htmlFor="pnotes" label="Anotações (privadas, cifradas)">
            <Textarea
              id="pnotes"
              rows={4}
              maxLength={4000}
              value={values.notes}
              onChange={(e) => setValues((v) => ({ ...v, notes: e.target.value }))}
              placeholder="Ex.: contexto do respondente, observações da aplicação."
            />
          </Field>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>Cancelar</Button>
            <Button type="submit" disabled={mut.isPending}>
              {mut.isPending ? "Salvando…" : isEdit ? "Salvar alterações" : "Cadastrar respondente"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, htmlFor, children }: { label: string; htmlFor?: string; children: React.ReactNode }) {
  return (
    <div>
      <Label htmlFor={htmlFor} className="mb-1 block text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
