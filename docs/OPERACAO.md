> **⚠️ LEGADO (posicionamento clínico).** Este documento reflete a fase original do projeto (plataforma para psicólogos). O sistema foi reposicionado para uso acadêmico por um aluno; a copy atual da UI está em `docs/COMO_USAR.md`. Mantido como histórico técnico.

# Operação - Psicoclínica

Guia operacional para o profissional/administrador do sistema.

## Retenção de dados

| Tipo de registro | Retenção padrão | Base |
|---|---|---|
| Prontuários eletrônicos (pacientes, avaliações, respostas, resultados) | 20 anos após o último atendimento | Res. CFP 001/2009 art. 15 e Res. CFP 06/2019 |
| Consentimentos LGPD | Enquanto durar o vínculo + 5 anos | LGPD art. 16 |
| Logs de auditoria (`audit_logs`) | 5 anos | LGPD art. 16 e boa prática de forense |
| `rate_limits` (bucket interno) | 24 h (gc automático) | Operacional |
| Backups completos | 30 dias corridos | Operacional |

Descarte após retenção deve ser feito via:
1. `hardDeletePatient` (dupla confirmação) para dados pessoais;
2. Job de expurgo em `audit_logs` (a implementar quando volume justificar).

## Backup

O provedor do banco Supabase deve executar backup periódico da base Postgres em janela
de retenção rolante de 30 dias. Para restaurar em ponto no tempo (PITR):
1. Acessar o painel Cloud → Backups;
2. Selecionar timestamp e disparar restore em projeto de contingência;
3. Validar integridade rodando `bunx vitest run` e conferindo `assessments`
   recentes antes de trocar o DNS.

Backup adicional recomendado (semanal, off-cloud):
- `pg_dump --schema-only` do schema `public` para versionamento de estrutura;
- Export CSV das tabelas `patients` (colunas cifradas), `assessments`,
  `assessment_results` para bucket S3 privado do escritório clínico.
- **Nunca** exportar `PII_ENCRYPTION_KEY` ou `CPF_HASH_PEPPER` no mesmo
  destino do dump.

## Chave de criptografia de PII

`PII_ENCRYPTION_KEY` é o segredo simétrico que protege
`patients.pii_encrypted`, `patients.notes_encrypted` e campos derivados. Sem
ela, os dados são irrecuperáveis.

### Custódia
- Armazenada como secret do ambiente do servidor (`PII_ENCRYPTION_KEY`).
- Cópia de emergência sob custódia dupla (dois responsáveis clínicos), em
  cofre físico ou gerenciador de segredos corporativo (1Password/Bitwarden
  Business com auditoria).
- **Não** versionar em Git, planilhas, drives compartilhados ou mensageria.

### Rotação anual (ou após incidente)
A rotação exige rewrap dos registros e é planejada com janela de manutenção:

1. Gerar nova chave `NEW_PII_ENCRYPTION_KEY` (openssl rand 32 bytes,
   base64url).
2. Adicionar como Secret **sem remover a antiga** (`PII_ENCRYPTION_KEY_V2`).
3. Deploy da função `rewrapPII` (a implementar) que:
   - Percorre `patients` em lotes;
   - Decifra com `PII_ENCRYPTION_KEY`, cifra com `PII_ENCRYPTION_KEY_V2`;
   - Grava `pii_encrypted` novo e marca `pii_key_version = 2` (nova coluna).
4. Após 100 % migrado e validado, promover `PII_ENCRYPTION_KEY_V2` → chave
   ativa (renomear no client de crypto).
5. Manter a antiga por 30 dias em cofre para reversão emergencial; depois,
   destruir de forma segura (registro no diário de operações).
6. Registrar todo o processo em `audit_logs` com ação
   `admin.pii_key_rotation`.

### Rotação de `CPF_HASH_PEPPER`
Invalida a busca por CPF (índice `idx_patients_cpf_hash`). Só rotacionar em
incidente confirmado. Procedimento: gerar novo pepper, rehash de todos os
`cpf_hash` em lote, publicar simultaneamente. Auditar.

## Expiração de links de avaliação

Job automático `expire-stale-assessments` (pg_cron, `*/5 * * * *`) marca
avaliações como `expired` quando `expires_at < now()` e `consumed_at IS NULL`.

Monitoramento:
```sql
SELECT status, count(*) FROM assessments
WHERE created_at > now() - interval '30 days'
GROUP BY status;

SELECT * FROM cron.job_run_details
WHERE jobid = (SELECT jobid FROM cron.job WHERE jobname = 'expire-stale-assessments')
ORDER BY start_time DESC LIMIT 10;
```

## Envio de email ao paciente

Contrato do server fn `notifyPatientLink` já implementado (registra audit
sempre). O provedor real deve ser plugado no `sender` de
`src/lib/notify.functions.ts`. Opções recomendadas:
- **Resend, SendGrid ou SMTP** - configurar domínio e credenciais para
  transacional confiável.
- **Resend / SendGrid** - se o cliente já usa infra própria.

Registrar no plano: quem vai fornecer o domínio remetente e o SPF/DKIM
correspondente.

## Rotinas de manutenção

| Frequência | Rotina | Responsável |
|---|---|---|
| Diário | Verificar `cron.job_run_details` sem falha | Admin |
| Semanal | Revisar `audit_logs` com filtro `public.rate_limit_exceeded` | Admin |
| Mensal | Conferir tamanho do backup, testar restore em staging | Ops |
| Trimestral | Revisar consentimentos LGPD com > 2 anos | DPO |
| Anual | Rotação de `PII_ENCRYPTION_KEY` | DPO + Admin |
| Anual | Auditoria externa de acesso e permissões | Comitê clínico |

## Resposta a incidente

1. **Isolar**: revogar sessões via `supabase.auth.admin.signOut` de todos os
   usuários afetados; girar segredos suspeitos.
2. **Auditar**: exportar `audit_logs` do intervalo do incidente.
3. **Comunicar**: notificar titulares afetados em até 72 h (LGPD art. 48).
4. **Documentar**: relatório interno + registro na ANPD se aplicável.
