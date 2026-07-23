> **⚠️ LEGADO (posicionamento clínico).** Este documento reflete a fase original do projeto (plataforma para psicólogos). O sistema foi reposicionado para uso acadêmico por um aluno; a copy atual da UI está em `docs/COMO_USAR.md`. Mantido como histórico técnico.

# Plataforma Clínica de Avaliação Psicométrica - Status de Implementação

> Documento vivo. Reflete o estado do sistema ao final da **Fase 1 do MVP**.
> Data: julho/2026.

---

## 1. Identificação

| Item | Valor |
|---|---|
| Nome oficial | Plataforma Clínica de Avaliação Psicométrica |
| Constante central | `src/lib/branding.ts` (`BRAND.name`, `BRAND.shortName`, `BRAND.description`) |
| Marco atual | MVP Fase 1 - auth, pacientes, motor, GAD-7 / PHQ-9 / WHOQOL-BREF (metadados) |
| Público | Psicólogas(os) inscritas(os) no CRP - Resolução CFP nº 11/2018 |
| Base legal LGPD | Art. 11, I (consentimento específico do titular para dados de saúde) |

---

## 2. Stack técnica

| Camada | Tecnologia |
|---|---|
| Framework | TanStack Start v1 (React 19, Vite 7) |
| Runtime servidor | Cloudflare Workers (edge) via TanStack Server Functions |
| Backend | Supabase externo (Postgres + Auth) e servidor TanStack Start |
| Estilo | Tailwind v4 (oklch, tokens semânticos) |
| Componentes | shadcn/ui |
| Estado servidor | TanStack Query |
| Validação | Zod |
| Cripto | Node `crypto` (AES-256-GCM, HMAC-SHA256, SHA-256) |
| Testes lógica pura | Motor de escore isolado em `src/lib/scoring/engine.ts` (pronto para unit tests) |

---

## 3. Segurança e conformidade

### Ativo ✅

- **PII do paciente** cifrada em repouso com **AES-256-GCM** via `src/lib/crypto.server.ts`. Chave: secret `PII_ENCRYPTION_KEY`.
- **Busca determinística por CPF** via `HMAC-SHA256(cpf, CPF_HASH_PEPPER)` - nunca expõe o CPF.
- **Tokens de acesso do paciente** gerados com `randomBytes(32)` e persistidos como **SHA-256**. O link só carrega o token bruto; o banco só vê o hash.
- **Expiração + single-use**: `assessments.expires_at` e `assessments.consumed_at` fecham o link após envio final.
- **RLS por profissional** em `patients`, `assessments`, `answers`, `assessment_results`, `lgpd_consents`, `audit_logs`. Nenhum profissional enxerga dados de outro.
- **Consentimento LGPD** obrigatório antes da aplicação; grava `ip_hash`, `user_agent`, `terms_version` e `accepted_at`.
- **`user_roles` em tabela separada** com função `SECURITY DEFINER` `has_role()` - sem privilege escalation.
- **Soft delete** em `patients` (`deleted_at`) e coluna `anonymized_at` reservada para anonimização.
- **Cabeçalho `robots: noindex,nofollow`** no root - sistema não é indexado.

### Pendente ⏳

- Rate limiting em `/api/public/*` (autosave/submit) - hoje sem throttling.
- Fluxo administrativo de **anonimização** e **direito ao esquecimento** (server fn existe apenas como stub conceitual).
- Escrita real em `audit_logs` a partir de todas as ações sensíveis (hoje apenas SELECT/RLS pronta).
- 2FA no login profissional.
- Rotação programada da `PII_ENCRYPTION_KEY` (envelope key ainda não implementado).

---

## 4. Modelo de dados

Todas as tabelas ficam em `public`, com RLS habilitada e GRANTs explícitos.

| Tabela | Finalidade | RLS |
|---|---|---|
| `profiles` | Nome e credencial do profissional | Dono lê/edita o próprio |
| `user_roles` | Papéis (`admin`, `professional`) | Dono lê o próprio; escrita só via trigger/admin |
| `patients` | Ficha do avaliando com PII cifrada + `cpf_hash` + `birth_year`/`gender` (não sensíveis) | Profissional acessa apenas os seus |
| `instruments` | Metadados do teste (código, nome, instruções) | Leitura pública (anon+auth) |
| `domains` | Subescalas por instrumento (WHOQOL 4 domínios) | Leitura pública |
| `questions` | Enunciado de item, `ordinal`, `is_inverted`, `domain_id` | Leitura pública |
| `options` | Alternativas Likert com `weight` numérico | Leitura pública |
| `scoring_rules` | 1:1 com instrumento; `aggregation`, `min/max`, `transform` JSONB | Leitura pública |
| `cutoffs` | Faixas de classificação (total ou por domínio) | Leitura pública |
| `assessments` | Aplicação vinculada a paciente + instrumento; `status`, `access_token_hash`, `expires_at`, `consumed_at` | Profissional dono |
| `answers` | Resposta por questão com `weight_snapshot` (imutável) | Profissional dono via join |
| `assessment_results` | `raw_scores`, `computed`, `cutoff_hits`, `flags` (JSONB) | Profissional dono via join |
| `lgpd_consents` | `ip_hash`, `user_agent`, `terms_version` | Profissional dono via join |
| `audit_logs` | `actor_user_id`, `action`, `resource_type`, `resource_id`, `metadata` | Dono lê os próprios |

---

## 5. Motor de cálculo (`src/lib/scoring/engine.ts`)

Puro TypeScript, sem I/O, testável isoladamente.

### Agregações suportadas

| Kind | Semântica | Usado por |
|---|---|---|
| `SUM` | Soma dos pesos aplicados (após inversão) | GAD-7, PHQ-9 |
| `MEAN` | Média dos itens respondidos | (reservado) |
| `SUM_BY_DOMAIN` | Média por `domain_id`, opcionalmente transformada | WHOQOL-BREF |

### Transformações

- `whoqol_0_100`: `((média − 1) / 4) × 100` - sintaxe SPSS oficial da OMS.

### Regras clínicas embutidas

- **PHQ-9 Q9 > 0** → flag `phq9_q9_positive` no resultado. Consumida pelo dashboard como "Alertas clínicos".

### Inversão de item

`weight_aplicado = max − weight + min` quando `question.is_inverted = true`. Usado em WHOQOL-BREF Q3, Q4, Q26.

### Contrato de saída (`ScoreResult`)

```ts
{
  raw_scores: Record<ordinal, number>,
  computed: { total?: number; by_domain?: Record<domain_id, number> },
  cutoff_hits: Array<{ scope, domain_id?, classification, message, score }>,
  flags: string[],
  answered: number,
  total_questions: number,
}
```

---

## 6. Instrumentos oficiais carregados

Populados via migração idempotente `supabase/migrations/…_official_instruments.sql`.

| Instrumento | Itens | Escala | Cut-offs | Itens invertidos | Fonte |
|---|---|---|---|---|---|
| GAD-7 | 7 | 0–3 (Likert 4 pontos) | 0–4 mínima · 5–9 leve · 10–14 moderada · 15–21 grave | - | Spitzer et al., 2006; PT-BR: Moreno et al., HCPA, 2016 |
| PHQ-9 | 9 | 0–3 (Likert 4 pontos) | 0–4 · 5–9 · 10–14 · 15–19 · 20–27 | - (flag Q9 > 0) | Kroenke, Spitzer & Williams, 2001; PT-BR: Santos et al., 2013 |
| WHOQOL-BREF | 26 (Q1, Q2 gerais + 24 em 4 domínios) | 1–5 (4 conjuntos de âncoras Likert) | Não há cut-off diagnóstico; escores 0–100 por domínio | Q3, Q4, Q26 | WHOQOL Group/OMS, 1998; PT-BR: Fleck et al., 2000 |

Enunciados literais e âncoras Likert oficiais estão no SQL, com comentários citando a fonte.

---

## 7. Fluxos implementados

### Profissional

1. Login fechado por email e senha via Supabase Auth. O administrador é cadastrado previamente; novos cadastros devem permanecer desativados.
2. Cadastro de paciente com validação Zod, cifra AES-GCM e HMAC de CPF.
3. Listagem de pacientes (busca via `cpf_hash`).
4. Criação de avaliação → gera token bruto, retorna URL `/a/<token>` para copiar.
5. Dashboard com contadores reais: pacientes, pendentes, concluídas, alertas.

### Paciente (link público)

1. Abre `/a/$token` → valida hash e expiração.
2. Consentimento LGPD explícito (`accepted_at`, `ip_hash`, `user_agent`).
3. Responde item a item; cada resposta persiste em `answers` (autosave).
4. Envio final: motor computa `assessment_results`, marca `consumed_at`, status = `completed`, link some.

---

## 8. Rotas

| Path | Arquivo | Auth | Propósito |
|---|---|---|---|
| `/` | `src/routes/index.tsx` | pública | Landing oficial |
| `/auth` | `src/routes/auth.tsx` | pública | Login / cadastro |
| `/_authenticated/*` | `src/routes/_authenticated/route.tsx` | gate | Layout protegido (`ssr:false`) |
| `/dashboard` | `_authenticated/dashboard.tsx` | ✔ | Painel clínico |
| `/patients` | `_authenticated/patients.tsx` | ✔ | Lista + novo paciente |
| `/patients/$id` | `_authenticated/patients.$id.tsx` | ✔ | Detalhe + novas avaliações |
| `/assessments/$id` | `_authenticated/assessments.$id.tsx` | ✔ | Resultado da avaliação |
| `/a/$token` | `src/routes/a.$token.tsx` | pública c/ token | Fluxo do paciente |
| `/sitemap.xml` | `src/routes/sitemap[.]xml.ts` | pública | Sitemap |

---

## 9. Server Functions

### `src/lib/patients.functions.ts`

| Nome | Método | Entrada | Middleware |
|---|---|---|---|
| `listPatients` | GET | - | `requireSupabaseAuth` |
| `getPatient` | GET | `{ patient_id }` | `requireSupabaseAuth` |
| `upsertPatient` | POST | `PatientInput` (Zod) | `requireSupabaseAuth` |
| `softDeletePatient` | POST | `{ patient_id }` | `requireSupabaseAuth` |
| `searchPatientByCPF` | POST | `{ cpf }` | `requireSupabaseAuth` |

### `src/lib/assessments.functions.ts`

| Nome | Método | Entrada | Middleware |
|---|---|---|---|
| `listInstruments` | GET | - | `requireSupabaseAuth` |
| `createAssessment` | POST | `{ patient_id, instrument_id }` | `requireSupabaseAuth` |
| `listAssessmentsByPatient` | POST | `{ patient_id }` | `requireSupabaseAuth` |
| `getAssessment` | POST | `{ assessment_id }` | `requireSupabaseAuth` |
| `dashboardStats` | GET | - | `requireSupabaseAuth` |
| `getAssessmentByToken` | POST | `{ token }` | pública |
| `savePatientAnswer` | POST | `{ token, question_id, option_id }` | pública |
| `submitAssessment` | POST | `{ token }` | pública |

Middleware de bearer: `attachSupabaseAuth` em `src/start.ts`.

---

## 10. UI / Design System

- Paleta 100% neutra (grayscale oklch) definida em `src/styles.css` via `@theme`.
- Tokens: `background`, `foreground`, `surface`, `border`, `muted-foreground`, `primary`, `accent`.
- Sem cores vibrantes. Alertas por peso tipográfico + ícone (`lucide-react`).
- Fonte: Inter (via `rsms.me/inter`).
- Sombras `xs`, raio `md`. Sem gradientes.
- Componentes shadcn utilizados: `Button`, `Input`, `Label`, `Sonner (toast)`.
- `AppShell` com sidebar fixa (desktop) + header.

---

## 11. Checklist - Fase 1 (pronto)

- [x] Auth email/senha com criação automática de `profiles` e `user_roles`
- [x] RLS ativa em todas as tabelas com dados do usuário
- [x] Criptografia AES-256-GCM de PII + HMAC de CPF
- [x] CRUD de pacientes
- [x] Cadastro/leitura de instrumentos (metadados)
- [x] GAD-7, PHQ-9, WHOQOL-BREF oficiais em PT-BR
- [x] Geração de link único de avaliação (token bruto + hash)
- [x] Fluxo público do paciente com consentimento LGPD
- [x] Autosave por questão
- [x] Motor puro TS: SUM / MEAN / SUM_BY_DOMAIN + inversão + `whoqol_0_100`
- [x] Persistência de `assessment_results` (raw, computed, cutoffs, flags)
- [x] Flag clínica PHQ-9 Q9 > 0
- [x] Dashboard com contadores reais
- [x] Landing e head oficiais, sem copy de marketing
- [x] `noindex, nofollow` no site inteiro
- [x] Migrações versionadas com GRANTs explícitos

---

## 12. Backlog - Fase 2

- [ ] Validação end-to-end do PHQ-9 e do WHOQOL-BREF na UI do paciente (o motor já suporta; falta QA visual e testes de aceitação)
- [ ] Tela de detalhe da avaliação com breakdown por domínio (WHOQOL) e barra de faixa (GAD-7/PHQ-9)
- [ ] Histórico comparativo por paciente (linha temporal com Recharts)
- [ ] Radar de domínios WHOQOL-BREF
- [ ] Ação "revisar alerta clínico" para flag PHQ-9 Q9 > 0 (com registro em `audit_logs`)
- [ ] Filtros e ordenação na lista de pacientes
- [ ] Tela `Ajustes → Perfil` para o profissional editar nome + CRP (`profiles.credential`)
- [ ] Testes unitários do motor (`engine.test.ts` com fixtures oficiais)
- [ ] Testes de integração das server functions públicas

---

## 13. Backlog - Fase 3

- [ ] Emissão de laudo em PDF com `@react-pdf/renderer` (cabeçalho profissional, dados do avaliando, tabela de cut-offs, gráficos embutidos, assinatura)
- [ ] Painel de **auditoria** (leitura filtrada de `audit_logs`, exportação CSV)
- [ ] Portal LGPD:
  - [ ] Exportação de dados do titular
  - [ ] Anonimização (`anonymized_at` + reescrita de PII para null cifrado)
  - [ ] Direito ao esquecimento (hard delete controlado)
- [ ] Rate limiting em `/api/public/*` (submit / autosave / open)
- [ ] Notificações por e-mail ao paciente com o link (via provedor externo)
- [ ] Retenção configurável e job de expiração automática de avaliações não iniciadas

---

## 14. Gaps e riscos conhecidos

- Não há UI para gerenciamento de papéis (`admin` só pode ser promovido via SQL).
- Não há multi-tenant (clínicas com vários profissionais compartilhando pacientes).
- Não há reset de senha implementado na UI (fluxo padrão do provider está habilitado, mas sem página customizada).
- Sem 2FA.
- Nenhum sistema de backup declarado - apoia-se no backup gerenciado do banco.
- O motor não valida "resposta obrigatória em todas as questões" antes de calcular - hoje resultado parcial é computado se `submitAssessment` for chamado sem todas as respostas. Corrigir na Fase 2 junto com a UI.
- `audit_logs` não recebe INSERTs automáticos ainda; RLS de leitura pronta mas a instrumentação nos handlers está pendente.

---

## 15. Como adicionar um novo instrumento

Nenhuma alteração de código é necessária para instrumentos que se encaixam nas agregações existentes.

1. Escrever migração inserindo:
   - `instruments` (code único, nome, instruções, fonte na descrição)
   - `domains` (se aplicável)
   - `questions` com `ordinal`, `text`, `is_inverted`, `domain_id`
   - `options` (por instrumento ou por questão)
   - `scoring_rules` com `aggregation` + `transform` opcional
   - `cutoffs` (por total ou por domínio)
2. Rodar via ferramenta de migração.
3. O instrumento aparece automaticamente em `listInstruments` e no fluxo do paciente.
4. Para regras de flag específicas (como Q9 do PHQ-9), estender `engine.ts` com uma verificação nova referenciando `inst.code`.

---

## 16. Fechamento do MVP - Blocos A→F (julho/2026)

A Fase 1 foi concluída com a execução dos blocos:

- **A. Núcleo clínico** - perfil profissional, validação de completude no submit, testes unitários do motor (11/11 verdes), helper `writeAudit` em todas as ações sensíveis.
- **B. Superfície clínica** - tela de resultado enriquecida, `CutoffBar` SVG, `RadarChart` WHOQOL, histórico do paciente (LineChart + tabela), revisão de alerta clínico com `assessment_results.reviewed_at/by`.
- **C. LGPD & Compliance** - rate limit deslizante em `/api/public/*` (memória + `rate_limits`), exportação/anonimização/esquecimento auditados, painel `_authenticated/audit.tsx` restrito a admin.
- **D. Emissão de laudo** - `@react-pdf/renderer` com `LaudoPDF`, gráficos SVG embutidos (`CutoffBarPDF`, `RadarPDF`), botão "Baixar laudo" com auditoria client-side.
- **E. Robustez & Operações** - OAuth Google, HIBP, reset de senha (`/auth/reset` + `/auth/update-password`), expiração automática via `pg_cron` (`expire_stale_assessments`), envio opcional de link por email, `docs/OPERACAO.md`.
- **F. Polimento** - estados padronizados (`src/components/state.tsx`: `LoadingBlock`, `EmptyBlock`, `ErrorBlock`, `SkeletonList`), navegação mobile no `AppShell` (bottom bar), touch targets ≥ 44px no fluxo do paciente, ARIA labels reforçadas nos radios, `min-h-dvh` no shell público, contraste revisado com tokens semânticos.

### Documentação da Fase 1

- `docs/STATUS.md` - este documento (arquitetura + status).
- `docs/COMO_USAR.md` - guia para o profissional (fluxo ponta a ponta).
- `docs/OPERACAO.md` - guia operacional (chaves, retenção, backup, rotação).
- `docs/ROADMAP.md` - planos de continuidade.

_Fim do documento._
