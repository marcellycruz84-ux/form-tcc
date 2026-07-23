// CMS de instrumentos - formulário único com seções (metadados, domínios, questões, opções, regra, cutoffs).
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { adminCreateInstrument } from "@/lib/instruments.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/_authenticated/console/instruments")({
  component: InstrumentCMS,
});

type Domain = { code: string; name: string };
type Question = { text: string; ordinal: number; is_inverted: boolean; domain_code: string };
type Option = { label: string; ordinal: number; weight: number };
type Cutoff = { classification: string; min_score: number; max_score: number; message: string; domain_code: string };

function InstrumentCMS() {
  const qc = useQueryClient();
  const createFn = useServerFn(adminCreateInstrument);

  const [code, setCode] = useState("");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [instructions, setInstructions] = useState("");
  const [estMin, setEstMin] = useState<string>("");
  const [domains, setDomains] = useState<Domain[]>([]);
  const [questions, setQuestions] = useState<Question[]>([
    { text: "", ordinal: 1, is_inverted: false, domain_code: "" },
  ]);
  const [options, setOptions] = useState<Option[]>([
    { label: "Nunca", ordinal: 0, weight: 0 },
    { label: "Sempre", ordinal: 1, weight: 3 },
  ]);
  const [aggregation, setAggregation] = useState<"SUM" | "MEAN" | "SUM_BY_DOMAIN">("SUM");
  const [minValue, setMinValue] = useState<string>("0");
  const [maxValue, setMaxValue] = useState<string>("0");
  const [cutoffs, setCutoffs] = useState<Cutoff[]>([]);

  const mut = useMutation({
    mutationFn: () =>
      createFn({
        data: {
          code,
          name,
          description,
          instructions,
          estimated_minutes: estMin ? Number(estMin) : null,
          domains,
          questions: questions.map((q) => ({
            text: q.text,
            ordinal: q.ordinal,
            is_inverted: q.is_inverted,
            domain_code: q.domain_code || undefined,
          })),
          options,
          rule: { aggregation, min_value: Number(minValue), max_value: Number(maxValue) },
          cutoffs: cutoffs.map((c) => ({
            classification: c.classification,
            min_score: c.min_score,
            max_score: c.max_score,
            message: c.message,
            domain_code: c.domain_code || undefined,
          })),
        },
      }),
    onSuccess: () => {
      toast.success("Instrumento criado e disponibilizado a todos os profissionais.");
      qc.invalidateQueries({ queryKey: ["library-instruments"] });
      qc.invalidateQueries({ queryKey: ["instruments"] });
      // Reset
      setCode(""); setName(""); setDescription(""); setInstructions(""); setEstMin("");
      setDomains([]); setQuestions([{ text: "", ordinal: 1, is_inverted: false, domain_code: "" }]);
      setOptions([{ label: "Nunca", ordinal: 0, weight: 0 }, { label: "Sempre", ordinal: 1, weight: 3 }]);
      setAggregation("SUM"); setMinValue("0"); setMaxValue("0"); setCutoffs([]);
    },
    onError: (e) => toast.error((e as Error).message),
  });

  return (
    <form
      className="space-y-8"
      onSubmit={(e) => { e.preventDefault(); mut.mutate(); }}
    >
      <Section title="1. Metadados">
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Código *"><Input value={code} onChange={(e) => setCode(e.target.value)} placeholder="PHQ-9" required maxLength={20} /></Field>
          <Field label="Nome *"><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Patient Health Questionnaire" required maxLength={120} /></Field>
          <Field label="Tempo estimado (min)"><Input type="number" min={1} max={240} value={estMin} onChange={(e) => setEstMin(e.target.value)} /></Field>
        </div>
        <Field label="Descrição"><Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} /></Field>
        <Field label="Instruções ao paciente"><Textarea rows={3} value={instructions} onChange={(e) => setInstructions(e.target.value)} maxLength={4000} /></Field>
      </Section>

      <Section title="2. Domínios (opcional)">
        <p className="mb-3 text-xs text-muted-foreground">Use domínios se o instrumento tiver subescalas.</p>
        {domains.map((d, i) => (
          <div key={i} className="mb-2 flex gap-2">
            <Input placeholder="Código" value={d.code} onChange={(e) => updateAt(domains, setDomains, i, { code: e.target.value })} className="max-w-[120px]" />
            <Input placeholder="Nome" value={d.name} onChange={(e) => updateAt(domains, setDomains, i, { name: e.target.value })} />
            <Button type="button" variant="ghost" size="icon" onClick={() => removeAt(domains, setDomains, i)} aria-label="Remover"><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setDomains([...domains, { code: "", name: "" }])}>
          <Plus className="mr-1 h-4 w-4" /> Adicionar domínio
        </Button>
      </Section>

      <Section title="3. Questões">
        {questions.map((q, i) => (
          <div key={i} className="mb-3 rounded border border-border p-3">
            <div className="mb-2 flex items-center gap-2">
              <span className="text-xs text-muted-foreground">#{q.ordinal}</span>
              <label className="flex items-center gap-1.5 text-xs">
                <Checkbox
                  checked={q.is_inverted}
                  onCheckedChange={(v) => updateAt(questions, setQuestions, i, { is_inverted: !!v })}
                />
                Pontuação invertida
              </label>
              {domains.length > 0 && (
                <select
                  className="ml-auto rounded border border-input bg-background px-2 py-1 text-xs"
                  value={q.domain_code}
                  onChange={(e) => updateAt(questions, setQuestions, i, { domain_code: e.target.value })}
                >
                  <option value="">Sem domínio</option>
                  {domains.filter((d) => d.code).map((d) => <option key={d.code} value={d.code}>{d.name || d.code}</option>)}
                </select>
              )}
              <Button type="button" variant="ghost" size="icon" onClick={() => removeAt(questions, setQuestions, i)} aria-label="Remover"><Trash2 className="h-4 w-4" /></Button>
            </div>
            <Textarea
              rows={2}
              value={q.text}
              onChange={(e) => updateAt(questions, setQuestions, i, { text: e.target.value })}
              placeholder="Enunciado da pergunta"
              maxLength={500}
              required
            />
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() =>
            setQuestions([
              ...questions,
              { text: "", ordinal: questions.length + 1, is_inverted: false, domain_code: "" },
            ])
          }
        >
          <Plus className="mr-1 h-4 w-4" /> Adicionar questão
        </Button>
      </Section>

      <Section title="4. Opções de resposta (globais)">
        <p className="mb-3 text-xs text-muted-foreground">Estas opções aparecem em todas as questões.</p>
        {options.map((o, i) => (
          <div key={i} className="mb-2 flex gap-2">
            <Input placeholder="Rótulo" value={o.label} onChange={(e) => updateAt(options, setOptions, i, { label: e.target.value })} />
            <Input type="number" placeholder="Ordem" className="max-w-[100px]" value={o.ordinal} onChange={(e) => updateAt(options, setOptions, i, { ordinal: Number(e.target.value) })} />
            <Input type="number" step="any" placeholder="Peso" className="max-w-[100px]" value={o.weight} onChange={(e) => updateAt(options, setOptions, i, { weight: Number(e.target.value) })} />
            <Button type="button" variant="ghost" size="icon" onClick={() => removeAt(options, setOptions, i)} aria-label="Remover"><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setOptions([...options, { label: "", ordinal: options.length, weight: 0 }])}>
          <Plus className="mr-1 h-4 w-4" /> Adicionar opção
        </Button>
      </Section>

      <Section title="5. Regra de cálculo">
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Agregação">
            <Select value={aggregation} onValueChange={(v) => setAggregation(v as typeof aggregation)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="SUM">Soma</SelectItem>
                <SelectItem value="MEAN">Média</SelectItem>
                <SelectItem value="SUM_BY_DOMAIN">Soma por domínio</SelectItem>
              </SelectContent>
            </Select>
          </Field>
          <Field label="Escore mínimo"><Input type="number" step="any" value={minValue} onChange={(e) => setMinValue(e.target.value)} /></Field>
          <Field label="Escore máximo"><Input type="number" step="any" value={maxValue} onChange={(e) => setMaxValue(e.target.value)} /></Field>
        </div>
      </Section>

      <Section title="6. Cortes (classificações)">
        {cutoffs.map((c, i) => (
          <div key={i} className="mb-3 rounded border border-border p-3">
            <div className="grid gap-2 sm:grid-cols-4">
              <Input placeholder="Classificação" value={c.classification} onChange={(e) => updateAt(cutoffs, setCutoffs, i, { classification: e.target.value })} />
              <Input type="number" step="any" placeholder="De" value={c.min_score} onChange={(e) => updateAt(cutoffs, setCutoffs, i, { min_score: Number(e.target.value) })} />
              <Input type="number" step="any" placeholder="Até" value={c.max_score} onChange={(e) => updateAt(cutoffs, setCutoffs, i, { max_score: Number(e.target.value) })} />
              {domains.length > 0 ? (
                <select
                  className="rounded border border-input bg-background px-2 py-1 text-sm"
                  value={c.domain_code}
                  onChange={(e) => updateAt(cutoffs, setCutoffs, i, { domain_code: e.target.value })}
                >
                  <option value="">Global</option>
                  {domains.filter((d) => d.code).map((d) => <option key={d.code} value={d.code}>{d.name || d.code}</option>)}
                </select>
              ) : <div />}
            </div>
            <Textarea
              className="mt-2"
              rows={2}
              placeholder="Mensagem clínica"
              value={c.message}
              onChange={(e) => updateAt(cutoffs, setCutoffs, i, { message: e.target.value })}
              maxLength={500}
            />
            <Button type="button" variant="ghost" size="sm" onClick={() => removeAt(cutoffs, setCutoffs, i)}>
              <Trash2 className="mr-1 h-4 w-4" /> Remover
            </Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={() => setCutoffs([...cutoffs, { classification: "", min_score: 0, max_score: 0, message: "", domain_code: "" }])}>
          <Plus className="mr-1 h-4 w-4" /> Adicionar corte
        </Button>
      </Section>

      <div className="flex justify-end border-t border-border pt-4">
        <Button type="submit" disabled={mut.isPending}>
          {mut.isPending ? "Salvando…" : "Criar instrumento"}
        </Button>
      </div>
    </form>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-background p-5">
      <h2 className="mb-4 text-sm font-semibold">{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      {children}
    </div>
  );
}

function updateAt<T>(arr: T[], set: (v: T[]) => void, i: number, patch: Partial<T>) {
  const next = arr.slice();
  next[i] = { ...next[i], ...patch };
  set(next);
}

function removeAt<T>(arr: T[], set: (v: T[]) => void, i: number) {
  set(arr.filter((_, idx) => idx !== i));
}
