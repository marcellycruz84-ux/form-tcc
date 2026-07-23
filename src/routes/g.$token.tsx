// Fluxo público do respondente para campanhas de grupo.
import { createFileRoute } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useMemo, useState } from "react";
import { getGroupCampaignByToken, submitGroupResponse } from "@/lib/group-campaigns.functions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { CheckCircle2, ClipboardList, ShieldCheck } from "lucide-react";
import { toast } from "sonner";

export const Route = createFileRoute("/g/$token")({
  ssr: false,
  head: () => ({ meta: [
    { title: "Pesquisa em grupo - Psicoclínica" },
    { name: "robots", content: "noindex, nofollow" },
  ]}),
  component: GroupFlow,
});

type Option = { id: string; ordinal: number; label: string; weight: number; question_id: string | null };
type Question = { id: string; ordinal: number; text: string; is_inverted: boolean };
type PublicInstrument = { id: string; code: string; name: string; description: string | null; instructions: string | null; questions: Question[]; options: Option[] };

function GroupFlow() {
  const { token } = Route.useParams();
  const loadFn = useServerFn(getGroupCampaignByToken);
  const q = useQuery({
    queryKey: ["group-token", token],
    queryFn: () => loadFn({ data: { token } }),
    retry: false,
  });

  if (q.isLoading) return <Shell><p className="text-sm text-muted-foreground">Carregando…</p></Shell>;
  if (q.isError) return <Shell><p className="text-sm text-destructive">{(q.error as Error).message}</p></Shell>;
  if (!q.data) return null;
  return <Active token={token} data={q.data} />;
}

function Active({ token, data }: { token: string; data: Awaited<ReturnType<typeof getGroupCampaignByToken>> }) {
  const [step, setStep] = useState<"identify" | "questions" | "done">("identify");
  const [name, setName] = useState("");
  const [academicPeriod, setAcademicPeriod] = useState("");
  const [tcle, setTcle] = useState(false);
  const [lgpd, setLgpd] = useState(false);
  const [instrumentIndex, setInstrumentIndex] = useState(0);
  const [answersByInstrument, setAnswersByInstrument] = useState<Record<string, Record<string, string>>>({});

  const submitFn = useServerFn(submitGroupResponse);
  const instruments = (data.instruments ?? []) as PublicInstrument[];
  const currentInstrument = instruments[instrumentIndex];
  const totalQuestions = instruments.reduce((total, instrument) => total + instrument.questions.length, 0);

  const questions = currentInstrument?.questions ?? [];
  const options = currentInstrument?.options ?? [];

  const perQuestion = useMemo(() => {
    const std = options.filter((o) => o.question_id === null);
    const map = new Map<string, Option[]>();
    for (const q of questions) {
      const specific = options.filter((o) => o.question_id === q.id);
      map.set(q.id, specific.length > 0 ? specific : std);
    }
    return map;
  }, [questions, options]);

  const selectedAnswers = currentInstrument ? (answersByInstrument[currentInstrument.id] ?? {}) : {};
  const missing = questions.filter((qq) => !selectedAnswers[qq.id]);

  const submit = useMutation({
    mutationFn: async () => submitFn({
      data: {
        token,
        respondent_name: name.trim(),
        academic_period: academicPeriod.trim(),
        consent: { tcle_accepted: true as const, lgpd_accepted: true as const },
        instrument_id: currentInstrument.id,
        answers: questions.map((qq) => ({ question_id: qq.id, option_id: selectedAnswers[qq.id] })),
        user_agent: navigator.userAgent.slice(0, 500),
      },
    }),
    onSuccess: () => {
      if (currentInstrument && instrumentIndex < instruments.length - 1) {
        setInstrumentIndex((prev) => prev + 1);
      } else {
        setStep("done");
      }
    },
    onError: (e) => toast.error((e as Error).message),
  });

  if (step === "done") {
    return (
      <Shell>
        <div className="text-center">
          <CheckCircle2 className="mx-auto h-10 w-10 text-foreground" />
          <h1 className="mt-4 text-xl font-semibold">Respostas registradas</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            {instruments.length > 1
              ? `Obrigado por participar. Todas as ${instruments.length} etapas da pesquisa foram registradas.`
              : "Obrigado por participar da pesquisa."}
          </p>
        </div>
      </Shell>
    );
  }

  if (step === "identify") {
    const canProceed = name.trim().length >= 3 && academicPeriod.trim().length >= 1 && tcle && lgpd;
    return (
      <Shell wide>
        <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
          <ShieldCheck className="h-4 w-4" /> Consentimento
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">{data.campaign.title}</h1>
        {data.campaign.description && (
          <p className="mt-2 text-sm text-muted-foreground">{data.campaign.description}</p>
        )}

        <div className="mt-5 grid gap-3 sm:grid-cols-3">
          <SummaryItem label="Questionarios" value={String(instruments.length)} />
          <SummaryItem label="Questoes" value={String(totalQuestions)} />
          <SummaryItem label="Fluxo" value={instruments.length > 1 ? "Sequencial" : "Unico"} />
        </div>

        <section className="mt-6 rounded-lg border border-border bg-surface-2 p-5">
          <h2 className="text-sm font-semibold">{data.campaign.consent_title}</h2>
          <div className="mt-3 max-h-72 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
            {data.campaign.consent_body}
          </div>
        </section>

        <div className="mt-6 space-y-2">
          <Label htmlFor="respondent-name">Nome completo *</Label>
          <Input
            id="respondent-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={160}
            placeholder="Como você gostaria de ser identificado(a)"
          />
        </div>

        <div className="mt-4 space-y-2">
          <Label htmlFor="academic-period">Período atual na faculdade *</Label>
          <Input
            id="academic-period"
            value={academicPeriod}
            onChange={(e) => setAcademicPeriod(e.target.value)}
            maxLength={50}
            placeholder="Ex.: 5º período"
          />
        </div>

        <div className="mt-6 rounded-md border border-border bg-surface-2 p-4 text-sm text-muted-foreground">
          Sua participação é voluntária. As respostas serão tratadas de forma confidencial, usadas apenas para fins acadêmicos e analisadas de maneira agregada.
        </div>

        <label className="mt-6 flex items-start gap-3 rounded-md border border-border bg-background p-4 text-sm">
          <Checkbox checked={tcle} onCheckedChange={(v) => setTcle(v === true)} />
          <span>Li e concordo com o <strong className="text-foreground">Termo de Consentimento Livre e Esclarecido</strong> acima.</span>
        </label>

        <label className="mt-3 flex items-start gap-3 rounded-md border border-border bg-background p-4 text-sm">
          <Checkbox checked={lgpd} onCheckedChange={(v) => setLgpd(v === true)} />
          <span>
            Concordo com o tratamento dos meus dados nos termos da <strong className="text-foreground">Lei Geral de Proteção de Dados (LGPD)</strong>,
            para fins acadêmicos e de agregação estatística, com sigilo garantido.
          </span>
        </label>

        <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-muted-foreground">
            {instruments.length > 1 ? `Você responderá a ${instruments.length} questionários neste fluxo.` : "Você responderá a este questionário."}
          </p>
          <Button disabled={!canProceed} onClick={() => setStep("questions")}>Começar</Button>
        </div>
      </Shell>
    );
  }

  if (!currentInstrument) return null;

  return (
    <Shell wide>
      <header className="mb-6">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground">
              <ClipboardList className="h-4 w-4" />
              {currentInstrument.code}
            </p>
            <h1 className="mt-1 text-2xl font-semibold tracking-tight">{currentInstrument.name}</h1>
          </div>
          {instruments.length > 1 && (
            <span className="rounded-full border border-border bg-surface-2 px-2.5 py-1 text-xs text-muted-foreground">
              Questionário {instrumentIndex + 1} de {instruments.length}
            </span>
          )}
        </div>
        {currentInstrument.instructions && (
          <p className="mt-3 text-sm text-muted-foreground">{currentInstrument.instructions}</p>
        )}
        <div className="mt-5">
          <div className="h-2 w-full overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-foreground transition-[width] duration-300"
              style={{ width: `${(Object.keys(selectedAnswers).length / Math.max(1, questions.length)) * 100}%` }}
            />
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            {Object.keys(selectedAnswers).length} de {questions.length} respondidas nesta etapa
          </p>
        </div>
      </header>

      <ol className="space-y-6">
        {questions.map((qq) => {
          const opts = perQuestion.get(qq.id) ?? [];
          return (
            <li key={qq.id}>
              <fieldset className="rounded-lg border border-border bg-background p-5">
                <legend className="text-sm font-medium">
                  <span className="mr-2 text-muted-foreground">{qq.ordinal}.</span>
                  {qq.text}
                </legend>
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {opts.map((o) => {
                    const isSelected = selectedAnswers[qq.id] === o.id;
                    return (
                      <button
                        key={o.id}
                        type="button"
                        onClick={() => setAnswersByInstrument((p) => ({
                          ...p,
                          [currentInstrument.id]: {
                            ...(p[currentInstrument.id] ?? {}),
                            [qq.id]: o.id,
                          },
                        }))}
                        className={`flex min-h-11 items-center rounded-md border px-3 py-2 text-left text-sm transition-colors ${
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

      <div className="mt-8 flex items-center justify-between">
        <p className="text-xs text-muted-foreground">
          {missing.length > 0 ? `Faltam ${missing.length} questões.` : "Todas as questões respondidas."}
        </p>
        <Button onClick={() => submit.mutate()} disabled={missing.length > 0 || submit.isPending}>
          {submit.isPending ? "Enviando…" : "Enviar resposta"}
        </Button>
      </div>
    </Shell>
  );
}

function Shell({ children, wide = false }: { children: React.ReactNode; wide?: boolean }) {
  return (
    <div className="min-h-dvh bg-surface px-3 py-6 sm:px-4 sm:py-10">
      <div className={`mx-auto ${wide ? "max-w-2xl" : "max-w-lg"} rounded-xl border border-border bg-background p-5 shadow-xs sm:p-8`}>
        {children}
      </div>
    </div>
  );
}

function SummaryItem({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <p className="text-xs uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-lg font-semibold">{value}</p>
    </div>
  );
}
