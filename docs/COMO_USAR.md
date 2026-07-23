# Como usar - Guia do aluno responsável

> Uso acadêmico. Ferramenta para aplicar GAD-7, PHQ-9 e WHOQOL-BREF em respondentes convidados no contexto da disciplina.
> Base legal: consentimento livre e esclarecido (LGPD).

---

## 1. Primeiro acesso

1. Crie sua conta em **Criar conta** (senhas com mínimo de 8 caracteres; senhas vazadas no HIBP são bloqueadas).
2. Confirme o email se o provedor solicitar.
3. Em **Meu perfil**, preencha nome completo e, se quiser, curso/turma. Esses dados aparecem no cabeçalho do relatório em PDF.

## 2. Cadastro de respondente

**Respondentes → Novo respondente.** Nome completo é obrigatório; CPF, ano de nascimento, gênero, email e telefone são opcionais. Todos os campos identificáveis são cifrados em repouso com AES-256-GCM.

## 3. Aplicar um questionário

1. Abra a ficha do respondente e clique em **Nova avaliação**.
2. Escolha um dos três questionários disponíveis (**GAD-7**, **PHQ-9**, **WHOQOL-BREF**).
3. Copie o link único gerado e envie ao respondente pelo canal que preferir, ou envie por email pelo próprio sistema.
4. O respondente aceita o TCLE + LGPD e responde. O link é consumido após o envio.

## 4. Ver resultados

Na tela do resultado você vê escore total, classificação, cut-offs (GAD-7/PHQ-9) e radar por domínio (WHOQOL-BREF). O botão **Baixar relatório** gera um PDF com seu nome, curso, escore, tabela de referências e a nota de uso acadêmico.

## 5. Item sensível (PHQ-9 Q9)

Se o respondente marcar o item 9 do PHQ-9 (ideação suicida) como positivo, o sistema exibe um alerta. **Não é um diagnóstico** - sirva-se dele como sinal para conversar com o respondente e encaminhá-lo a apoio profissional se necessário.

## 6. Direitos do respondente (LGPD)

Na aba **LGPD** da ficha você pode exportar todos os dados em JSON, anonimizar (preserva os escores para o trabalho, apaga a PII) ou excluir definitivamente com dupla confirmação.

## 7. Boas práticas

- Nunca compartilhe o link do respondente em canais públicos.
- Anonimize os respondentes ao final do trabalho.
- O sistema não emite laudo clínico e não substitui avaliação profissional.
