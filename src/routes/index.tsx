import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { BRAND } from "@/lib/branding";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: `${BRAND.name}` },
      { name: "description", content: BRAND.description },
      { property: "og:title", content: BRAND.name },
      { property: "og:description", content: BRAND.description },
      { property: "og:url", content: "/" },
    ],
    links: [{ rel: "canonical", href: "/" }],
  }),
  component: Landing,
});

const INSTRUMENTS = [
  {
    code: "GAD-7",
    name: "Escala de Transtorno de Ansiedade Generalizada",
    origin: "Spitzer, Kroenke, Williams & Löwe (2006).",
    validation: "Validação em português: Moreno et al., Revista HCPA, 2016.",
    purpose:
      "Rastreio de sintomas de ansiedade generalizada nas últimas duas semanas. Sete itens, escala 0–3, escore total 0–21.",
  },
  {
    code: "PHQ-9",
    name: "Patient Health Questionnaire",
    origin: "Kroenke, Spitzer & Williams (2001).",
    validation:
      "Validação em português: Santos et al., Cad. Saúde Pública, 2013; Osório et al., 2009.",
    purpose:
      "Rastreio e monitoramento de sintomas depressivos. Nove itens, escala 0–3, escore total 0–27, com item específico de ideação suicida.",
  },
  {
    code: "WHOQOL-BREF",
    name: "Avaliação de Qualidade de Vida - versão breve (OMS)",
    origin: "The WHOQOL Group / Organização Mundial da Saúde (1998).",
    validation: "Validação em português: Fleck et al., Rev. Saúde Pública, 2000.",
    purpose:
      "Avaliação de qualidade de vida em quatro domínios (Físico, Psicológico, Relações Sociais e Meio Ambiente). 26 itens, escala 1–5, escores transformados para 0–100.",
  },
];

function Landing() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-5">
          <Link to="/" className="text-sm font-semibold tracking-tight">
            {BRAND.shortName}
          </Link>
          <Link
            to="/auth"
            className="text-sm text-muted-foreground hover:text-foreground"
          >
            Acessar sistema
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-6 pt-16 pb-12">
        <h1 className="text-3xl font-semibold tracking-tight sm:text-4xl">
          Aplicação de questionários para o seu trabalho acadêmico
        </h1>
        <p className="mt-5 text-sm leading-relaxed text-muted-foreground">
          Ferramenta acadêmica para a aluna criar campanhas, enviar links para um grupo,
          coletar as respostas e visualizar os resultados dos questionários GAD-7,
          PHQ-9 e WHOQOL-BREF com apoio de consentimento e organização para análise.
        </p>
        <div className="mt-8">
          <Button asChild size="sm">
            <Link to="/auth">Acessar sistema</Link>
          </Button>
        </div>
      </main>

      <section className="mx-auto max-w-3xl px-6 pb-12">
        <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Instrumentos disponíveis
        </h2>
        <ul className="mt-4 divide-y divide-border rounded-lg border border-border bg-surface">
          {INSTRUMENTS.map((i) => (
            <li key={i.code} className="p-5">
              <p className="text-sm font-semibold">
                {i.code} - {i.name}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">{i.origin}</p>
              <p className="text-xs text-muted-foreground">{i.validation}</p>
              <p className="mt-2 text-sm leading-relaxed">{i.purpose}</p>
            </li>
          ))}
        </ul>
      </section>

      <section className="mx-auto max-w-3xl px-6 pb-16">
        <h2 className="text-sm font-medium uppercase tracking-widest text-muted-foreground">
          Conformidade e cuidados
        </h2>
        <ul className="mt-4 space-y-2 text-sm leading-relaxed text-muted-foreground">
          <li>
            Tratamento de dados pessoais conforme a Lei Geral de Proteção de
            Dados Pessoais - Lei nº&nbsp;13.709/2018 (LGPD), com base legal no
            consentimento livre e esclarecido do respondente.
          </li>
          <li>
            Cada respondente aceita um Termo de Consentimento Livre e
            Esclarecido (TCLE) antes de iniciar; sem aceite, nenhum dado é
            registrado.
          </li>
          <li>
            Os resultados individuais são visíveis apenas ao aluno responsável
            pela aplicação; agregações servem exclusivamente ao trabalho.
          </li>
          <li>
            Dados identificáveis do respondente armazenados sob criptografia
            AES-256-GCM em nível de aplicação.
          </li>
        </ul>
      </section>

      <footer className="border-t border-border">
        <div className="mx-auto max-w-5xl px-6 py-6 text-xs text-muted-foreground">
          {BRAND.legalNotice}
        </div>
      </footer>
    </div>
  );
}
