> **⚠️ LEGADO (posicionamento clínico).** Este documento reflete a fase original do projeto (plataforma para psicólogos). O sistema foi reposicionado para uso acadêmico por um aluno; a copy atual da UI está em `docs/COMO_USAR.md`. Mantido como histórico técnico.

# Roadmap em microfases

Cada microfase é pequena, entregável isoladamente e verificável (build passa, fluxo funciona ponta a ponta). Sequência pensada para reduzir risco: primeiro fecha os gaps do que já existe, depois adiciona superfícies clínicas, depois camadas de conformidade e por fim polimento.

Legenda de esforço: **S** (~1 rodada), **M** (2–3 rodadas), **L** (>3 rodadas).

---

## Bloco A - Fechamento da Fase 1

- **A1. Perfil do profissional (S)** - rota `_authenticated/settings.tsx` para editar `profiles.full_name` e `profiles.credential` (CRP). Alimenta o cabeçalho do AppShell e o rodapé do futuro laudo.
- **A2. Validação de completude no submit (S)** - `submitAssessment` rejeita quando `answers.count < questions.count`. UI do paciente bloqueia "Enviar" enquanto houver questão pendente e mostra contador `x/n`.
- **A3. Testes unitários do motor (S)** - `src/lib/scoring/__tests__/engine.test.ts` cobrindo GAD-7 (limites 0/21), PHQ-9 (flag Q9), WHOQOL-BREF (inversão Q3/Q4/Q26 + transform 0–100 com fixtures oficiais da OMS).
- **A4. Auditoria automática (S)** - helper `writeAudit(action, resource_type, resource_id, metadata)` disparado em: criação de paciente, criação de avaliação, submit, soft-delete, leitura de resultado.

## Bloco B - Superfície clínica

- **B1. Tela de resultado enriquecida (M)** - `assessments.$id.tsx` mostra paciente, instrumento, data, escore, classificação, mensagem, breakdown por domínio (WHOQOL), realce de flags. Sem gráficos ainda.
- **B2. Gráfico de faixa (S)** - barra horizontal SVG puro com marcadores de cut-off (GAD-7/PHQ-9).
- **B3. Radar de domínios WHOQOL (S)** - Recharts `RadarChart` com os 4 domínios em escala 0–100.
- **B4. Histórico do paciente (M)** - aba "Histórico" em `patients.$id.tsx` com `LineChart` dos escores totais por instrumento ao longo do tempo + tabela de avaliações concluídas.
- **B5. Revisão de alertas clínicos (S)** - ação "Marcar como revisado" para flag PHQ-9 Q9 > 0. Colunas `assessment_results.reviewed_at` e `reviewed_by`. Dashboard conta só alertas não revisados. Auditado.

## Bloco C - LGPD e conformidade

- **C1. Rate limiting em `/api/public/*` (S)** - endpoints públicos migrados para server route com limite por token+IP (janela deslizante em memória + tabela `rate_limits` de fallback).
- **C2. Exportação de dados do titular (S)** - server fn autenticada empacota avaliações, respostas e consentimentos do paciente em JSON para download.
- **C3. Anonimização (S)** - `anonymizePatient` substitui `pii_encrypted` por marcador `ANONYMIZED`, zera `cpf_hash`, seta `anonymized_at`. Preserva escores. Auditado.
- **C4. Direito ao esquecimento (S)** - hard delete controlado, dupla confirmação, evento em `audit_logs` gravado antes do delete (com hash do id).
- **C5. Painel de auditoria (M)** - rota `_authenticated/audit.tsx` restrita a `admin`, com filtros por ação/recurso/período e paginação.

## Bloco D - Emissão de laudo

- **D1. Componente base (S)** - `bun add @react-pdf/renderer` + `LaudoPDF` com cabeçalho (profissional + CRP), avaliando, data, instrumento, escore, classificação, tabela de cut-offs, rodapé de sigilo.
- **D2. Gráfico embutido no PDF (S)** - reaproveita SVG dos gráficos B2/B3 dentro do PDF (evita canvas).
- **D3. Ação "Baixar laudo" (S)** - botão em `assessments.$id.tsx` que gera o PDF client-side e faz download `laudo-<instrumento>-<data>.pdf`. Registrado em audit.

## Bloco E - Robustez e operação

- **E1. Login com Google (S)** - ativar Google OAuth via `configure_social_auth` + botão em `/auth`. Redirect_uri = `${origin}/auth`.
- **E2. Reset de senha (S)** - páginas `/auth/reset` e `/auth/update-password`.
- **E3. HIBP na senha (S)** - ativar `password_hibp_enabled` via `configure_auth`.
- **E4. Expiração automática (S)** - cron/trigger marca `status='expired'` quando `expires_at < now()` e `consumed_at IS NULL`.
- **E5. E-mail com link ao paciente (M)** - server fn dispara e-mail via provider externo (a definir); registra envio em audit.
- **E6. Backup / retenção (S)** - `docs/OPERACAO.md` com política de retenção, backup do Cloud e plano de rotação da `PII_ENCRYPTION_KEY`.

## Bloco F - Polimento e release

- **F1. Estados vazios, loading, erros consistentes (S)** - skeletons e mensagens padronizadas em todas as telas autenticadas.
- **F2. Acessibilidade (S)** - foco visível, ARIA labels nos radios do paciente, contraste revisado.
- **F3. Responsividade (S)** - QA mobile do fluxo do paciente (touch targets, viewport <400px).
- **F4. Documentação final (S)** - atualiza `docs/STATUS.md`, cria `docs/COMO_USAR.md` (profissional) e `docs/OPERACAO.md` (ops).
- **F5. Publicação (S)** - publish + smoke test ponta a ponta (paciente → link → responder → resultado → laudo).

---

## Ordem sugerida

```
A1 → A2 → A3 → A4
B1 → B2 → B3 → B4 → B5
C1 → C2 → C3 → C4 → C5
D1 → D2 → D3
E1 → E2 → E3 → E4 → E5 → E6
F1 → F2 → F3 → F4 → F5
```

Blocos B, C, D e E podem ser paralelizados depois que A estiver fechado.

## Modo de operação

- 1 mensagem do usuário ("bora A1") = 1 entrega + verificação = próxima só com OK.
- Decisões pendentes (ex.: provider de e-mail em E5) param a microfase e pedem confirmação antes de implementar.

## Fora do roadmap

- Multi-tenant/clínica com equipes.
- 2FA.
- App móvel nativo.
- Marketplace de instrumentos pagos.
