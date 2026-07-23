// Fluxo do paciente - acesso público por token.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState, useMemo } from "react";
import { getAssessmentByToken, savePatientAnswer, submitAssessment } from "@/lib/assessments.functions";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { CheckCircle2, ShieldCheck } from "lucide-react";

export const Route = createFileRoute("/a/$token")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Questionário - Aplicação de Questionários" },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: PatientFlow,
});

type Option = { id: string; ordinal: number; label: string; weight: number; question_id: string | null };
type Question = { id: string; ordinal: number; text: string; is_inverted: boolean };

function PatientFlow() {
  const { token } = Route.useParams();
  const loadFn = useServerFn(getAssessmentByToken);
  const q = useQuery({
    queryKey: ["assessment-token", token],
    queryFn: () => loadFn({ data: { token } }),
    retry: false,
  });

  if (q.isLoading) return <FullShell><p className="text-sm text-muted-foreground">Carregando…</p></FullShell>;
  if (q.isError) return <FullShell><p className="text-sm text-destructive">{(q.error as Error).message}</p></FullShell>;
  if (!q.data) return null;
  return <ActiveFlow token={token} data={q.data} />;
}

function ActiveFlow({ token, data }: { token: string; data: Awaited<ReturnType<typeof getAssessmentByToken>> }) {
  const [step, setStep] = useState<"consent" | "questions" | "review" | "done">("consent");
  const [answers, setAnswers] = useState<Record<string, string>>(() => {
    const seed: Record<string, string> = {};
    for (const a of data.existing_answers) seed[a.question_id] = a.option_id;
    return seed;
  });
  const saveFn = useServerFn(savePatientAnswer);
  const submitFn = useServerFn(submitAssessment);
  const qc = useQueryClient();

  const questions = data.questions as Question[];
  const options = data.options as Option[];

  const perQuestion = useMemo(() => {
    // Standardized options (question_id null) apply to all
    const std = options.filter((o) => o.question_id === null);
    const map = new Map<string, Option[]>();
    for (const q of questions) {
      const specific = options.filter((o) => o.question_id === q.id);
      map.set(q.id, specific.length > 0 ? specific : std);
    }
    return map;
  }, [questions, options]);

  async function setAnswer(question_id: string, option_id: string) {
    setAnswers((prev) => ({ ...prev, [question_id]: option_id }));
    try {
      await saveFn({ data: { token, question_id, option_id } });
    } catch (e) {
      toast.error("Falha ao salvar resposta. Verifique sua conexão.");
      console.error(e);
    }
  }

  const missing = questions.filter((q) => !answers[q.id]);

  const submit = useMutation({
    mutationFn: async () => submitFn({
      data: { token, consent: { accepted: true as const, terms_version: "v1" }, user_agent: navigator.userAgent.slice(0, 500) },
    }),
    onSuccess: () => { setStep("done"); qc.invalidateQueries(); },
    onError: (e) => toast.error((e as Error).message),
  });

  if (step === "done") {
    return (
      <FullShell>
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-foreground" />
          <h1 className="mt-4 text-xl font-semibold">Avaliação enviada</h1>
          <p className="mt-2 text-sm text-muted-foreground">Obrigado. Suas respostas foram registradas.</p>
        </div>
      </FullShell>
    );
  }

  if (step === "consent") return <ConsentStep instrument={data.instrument} onAccept={() => setStep("questions")} />;

  if (step === "review") {
    return (
      <FullShell wide>
        <h1 className="text-xl font-semibold">Revisão</h1>
        <p className="mt-1 text-sm text-muted-foreground">Confirme suas respostas antes de enviar.</p>
        {missing.length > 0 && (
          <div role="status" aria-live="polite" className="mt-4 rounded-md border border-border bg-surface-2 p-4 text-sm">
            Faltam {missing.length} questões. <button className="underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring rounded-sm" onClick={() => setStep("questions")}>Voltar e responder</button>.
          </div>
        )}
        <ol className="mt-6 space-y-3 text-sm">
          {questions.map((q) => {
            const opt = options.find((o) => o.id === answers[q.id]);
            return (
              <li key={q.id} className="flex justify-between gap-3 border-b border-border pb-3">
                <span className="text-muted-foreground">{q.ordinal}. {q.text}</span>
                <span className="text-right font-medium">{opt?.label ?? "-"}</span>
              </li>
            );
          })}
        </ol>
        <div className="mt-8 flex justify-between">
          <Button variant="ghost" onClick={() => setStep("questions")}>Voltar</Button>
          <Button onClick={() => submit.mutate()} disabled={missing.length > 0 || submit.isPending}>
            {submit.isPending ? "Enviando…" : "Enviar avaliação"}
          </Button>
        </div>
      </FullShell>
    );
  }

  return (
    <FullShell wide>
      <a
        href="#questionario"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-foreground focus:px-3 focus:py-2 focus:text-sm focus:text-background"
      >
        Pular para o questionário
      </a>
      <header className="mb-6">
        <p className="text-xs uppercase tracking-widest text-muted-foreground">{data.instrument.code}</p>
        <h1 className="mt-1 text-2xl font-semibold tracking-tight">{data.instrument.name}</h1>
        {data.instrument.instructions && (
          <p className="mt-3 text-sm text-muted-foreground">{data.instrument.instructions}</p>
        )}
        <div className="mt-5">
          <div
            className="h-2 w-full overflow-hidden rounded-full bg-surface-2"
            role="progressbar"
            aria-valuenow={Object.keys(answers).length}
            aria-valuemin={0}
            aria-valuemax={questions.length}
            aria-label={`Progresso: ${Object.keys(answers).length} de ${questions.length} respondidas`}
          >
            <div
              className="h-full rounded-full bg-foreground transition-[width] duration-300"
              style={{ width: `${(Object.keys(answers).length / Math.max(1, questions.length)) * 100}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground" aria-live="polite" aria-atomic="true">
            {Object.keys(answers).length} de {questions.length} respondidas
          </p>
        </div>
      </header>

      <ol id="questionario" className="space-y-6">
        {questions.map((q) => {
          const opts = perQuestion.get(q.id) ?? [];
          const selected = answers[q.id];
          const groupId = `q-${q.ordinal}`;
          return (
            <li key={q.id}>
              <fieldset
                className="rounded-lg border border-border bg-background p-5"
                aria-describedby={`${groupId}-hint`}
              >
                <legend className="text-sm font-medium">
                  <span className="mr-2 text-muted-foreground">{q.ordinal}.</span>
                  {q.text}
                </legend>
                <p id={`${groupId}-hint`} className="sr-only">
                  Escolha uma alternativa. Use Tab para navegar e Espaço ou Enter para selecionar.
                </p>
                <div
                  role="radiogroup"
                  aria-label={`Alternativas para a questão ${q.ordinal}`}
                  className="mt-3 grid gap-2 sm:grid-cols-2"
                >
                  {opts.map((o) => {
                    const isSelected = selected === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        role="radio"
                        aria-checked={isSelected}
                        aria-label={`${o.label} - alternativa ${o.ordinal + 1} de ${opts.length}`}
                        tabIndex={isSelected || (!selected && o.ordinal === opts[0]?.ordinal) ? 0 : -1}
                        onClick={() => setAnswer(q.id, o.id)}
                        onKeyDown={(e) => {
                          if (e.key === " " || e.key === "Enter") {
                            e.preventDefault();
                            setAnswer(q.id, o.id);
                          }
                          if (e.key === "ArrowRight" || e.key === "ArrowDown") {
                            e.preventDefault();
                            const next = opts[(opts.findIndex((x) => x.id === o.id) + 1) % opts.length];
                            setAnswer(q.id, next.id);
                          }
                          if (e.key === "ArrowLeft" || e.key === "ArrowUp") {
                            e.preventDefault();
                            const idx = opts.findIndex((x) => x.id === o.id);
                            const prev = opts[(idx - 1 + opts.length) % opts.length];
                            setAnswer(q.id, prev.id);
                          }
                        }}
                        className={`flex min-h-11 items-center rounded-md border px-3 py-2 text-left text-sm leading-snug transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background ${
                          isSelected
                            ? "border-foreground bg-surface-2 font-medium"
                            : "border-border bg-background hover:bg-accent"
                        }`}
                      >
                        {o.label}
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            </li>
          );
        })}
      </ol>

      <div className="mt-8 flex items-center justify-end">
        <Button onClick={() => setStep("review")}>Revisar respostas</Button>
      </div>
    </FullShell>
  );
}

function ConsentStep({ instrument, onAccept }: { instrument: { name: string; description: string }; onAccept: () => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <FullShell>
      <div className="mb-4 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
        <ShieldCheck className="h-4 w-4" /> Termo de consentimento (LGPD)
      </div>
      <h1 className="text-xl font-semibold tracking-tight">Antes de começar</h1>
      <p className="mt-3 text-sm text-muted-foreground">
        Você está prestes a responder ao instrumento <strong className="text-foreground">{instrument.name}</strong>.
        Suas respostas serão enviadas de forma segura ao aluno responsável pela aplicação,
        ficarão armazenadas com criptografia e serão usadas exclusivamente para o trabalho
        acadêmico descrito na disciplina.
      </p>
      <ul className="mt-4 space-y-2 text-sm text-muted-foreground">
        <li>• Você pode interromper a qualquer momento - o link atual deixa de valer após o envio.</li>
        <li>• Não coletamos identificadores adicionais além dos cadastrados pelo aluno responsável.</li>
        <li>• Registraremos data/hora e um identificador anonimizado do dispositivo para fins de auditoria.</li>
      </ul>
      <label className="mt-6 flex items-start gap-3 rounded-md border border-border bg-surface-2 p-4 text-sm">
        <Checkbox checked={checked} onCheckedChange={(v) => setChecked(v === true)} />
        <span>Li e concordo com o tratamento dos meus dados conforme descrito acima.</span>
      </label>
      <div className="mt-6 flex justify-end">
        <Button disabled={!checked} onClick={onAccept}>Começar avaliação</Button>
      </div>
    </FullShell>
  );
}

function FullShell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-dvh bg-surface px-3 py-6 sm:px-4 sm:py-10">
      <div className={`mx-auto ${wide ? "max-w-2xl" : "max-w-lg"} rounded-xl border border-border bg-background p-5 shadow-xs sm:p-8`}>
        {children}
      </div>
    </div>
  );
}
