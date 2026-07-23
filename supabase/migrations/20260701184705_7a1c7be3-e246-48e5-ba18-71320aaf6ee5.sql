
-- ============================================================
-- Instrumentos psicométricos oficiais (idempotente)
-- Fontes:
--   GAD-7:      Spitzer et al. 2006; validação PT-BR Moreno et al. (HCPA, 2016)
--   PHQ-9:      Kroenke, Spitzer & Williams 2001; validação PT-BR Santos et al. (2013) / Osório et al. (2009)
--   WHOQOL-BREF: WHOQOL Group / OMS 1998; validação PT-BR Fleck et al. (Rev. Saúde Pública, 2000)
-- ============================================================

-- Limpa versões anteriores (cascata remove domains/questions/options/rules/cutoffs)
DELETE FROM public.instruments WHERE code IN ('GAD-7', 'PHQ-9', 'WHOQOL-BREF');

-- ============================================================
-- GAD-7
-- ============================================================
WITH ins AS (
  INSERT INTO public.instruments (code, name, description, instructions)
  VALUES (
    'GAD-7',
    'Escala de Transtorno de Ansiedade Generalizada (GAD-7)',
    'Instrumento de rastreio de sintomas de ansiedade generalizada. Spitzer et al., 2006. Validação PT-BR: Moreno et al., Revista HCPA, 2016.',
    'Nas últimas 2 semanas, com que frequência você foi incomodado(a) pelos problemas abaixo?'
  )
  RETURNING id
),
q AS (
  INSERT INTO public.questions (instrument_id, ordinal, text, is_inverted)
  SELECT ins.id, ord, txt, false
  FROM ins, (VALUES
    (1, 'Sentir-se nervoso(a), ansioso(a) ou muito tenso(a).'),
    (2, 'Não ser capaz de impedir ou de controlar as preocupações.'),
    (3, 'Preocupar-se muito com diversas coisas.'),
    (4, 'Dificuldade para relaxar.'),
    (5, 'Ficar tão agitado(a) que se torna difícil permanecer parado(a).'),
    (6, 'Ficar facilmente aborrecido(a) ou irritado(a).'),
    (7, 'Sentir medo como se algo horrível fosse acontecer.')
  ) AS t(ord, txt)
  RETURNING id
),
o AS (
  INSERT INTO public.options (instrument_id, question_id, ordinal, label, weight)
  SELECT ins.id, NULL, ord, label, w
  FROM ins, (VALUES
    (1, 'Nenhuma vez', 0),
    (2, 'Vários dias', 1),
    (3, 'Mais da metade dos dias', 2),
    (4, 'Quase todos os dias', 3)
  ) AS t(ord, label, w)
  RETURNING id
),
r AS (
  INSERT INTO public.scoring_rules (instrument_id, aggregation, min_value, max_value, transform)
  SELECT ins.id, 'SUM', 0, 3, NULL FROM ins
  RETURNING id
)
INSERT INTO public.cutoffs (instrument_id, domain_id, min_score, max_score, classification, message)
SELECT ins.id, NULL, mn, mx, cls, msg
FROM ins, (VALUES
  (0,  4,  'Ansiedade mínima',   'Sintomas de ansiedade em nível mínimo.'),
  (5,  9,  'Ansiedade leve',     'Sintomas de ansiedade em nível leve.'),
  (10, 14, 'Ansiedade moderada', 'Sintomas de ansiedade em nível moderado; avaliação clínica recomendada.'),
  (15, 21, 'Ansiedade grave',    'Sintomas de ansiedade em nível grave; avaliação clínica indicada.')
) AS t(mn, mx, cls, msg);

-- ============================================================
-- PHQ-9
-- ============================================================
WITH ins AS (
  INSERT INTO public.instruments (code, name, description, instructions)
  VALUES (
    'PHQ-9',
    'Patient Health Questionnaire (PHQ-9)',
    'Instrumento de rastreio e monitoramento de sintomas depressivos. Kroenke, Spitzer & Williams, 2001. Validação PT-BR: Santos et al., Cad. Saúde Pública, 2013; Osório et al., 2009.',
    'Nas últimas 2 semanas, com que frequência você foi incomodado(a) por qualquer um dos problemas abaixo?'
  )
  RETURNING id
),
q AS (
  INSERT INTO public.questions (instrument_id, ordinal, text, is_inverted)
  SELECT ins.id, ord, txt, false
  FROM ins, (VALUES
    (1, 'Pouco interesse ou pouco prazer em fazer as coisas.'),
    (2, 'Se sentir para baixo, deprimido(a) ou sem perspectiva.'),
    (3, 'Dificuldade para pegar no sono ou permanecer dormindo, ou dormir mais do que de costume.'),
    (4, 'Se sentir cansado(a) ou com pouca energia.'),
    (5, 'Falta de apetite ou comendo demais.'),
    (6, 'Se sentir mal consigo mesmo(a) - ou achar que você é um fracasso ou que decepcionou sua família ou você mesmo(a).'),
    (7, 'Dificuldade para se concentrar nas coisas, como ler o jornal ou ver televisão.'),
    (8, 'Lentidão para se movimentar ou falar, a ponto das outras pessoas perceberem - ou o oposto, estar tão agitado(a) ou irrequieto(a) que você fica andando de um lado para o outro muito mais do que de costume.'),
    (9, 'Pensar em se ferir de alguma maneira ou que seria melhor estar morto(a).')
  ) AS t(ord, txt)
  RETURNING id
),
o AS (
  INSERT INTO public.options (instrument_id, question_id, ordinal, label, weight)
  SELECT ins.id, NULL, ord, label, w
  FROM ins, (VALUES
    (1, 'Nenhuma vez', 0),
    (2, 'Vários dias', 1),
    (3, 'Mais da metade dos dias', 2),
    (4, 'Quase todos os dias', 3)
  ) AS t(ord, label, w)
  RETURNING id
),
r AS (
  INSERT INTO public.scoring_rules (instrument_id, aggregation, min_value, max_value, transform)
  SELECT ins.id, 'SUM', 0, 3, NULL FROM ins
  RETURNING id
)
INSERT INTO public.cutoffs (instrument_id, domain_id, min_score, max_score, classification, message)
SELECT ins.id, NULL, mn, mx, cls, msg
FROM ins, (VALUES
  (0,  4,  'Sintomas mínimos',              'Sintomas depressivos em nível mínimo.'),
  (5,  9,  'Depressão leve',                'Sintomas depressivos em nível leve.'),
  (10, 14, 'Depressão moderada',            'Sintomas depressivos em nível moderado.'),
  (15, 19, 'Depressão moderadamente grave', 'Sintomas depressivos em nível moderadamente grave; avaliação clínica indicada.'),
  (20, 27, 'Depressão grave',               'Sintomas depressivos em nível grave; avaliação clínica imediata indicada.')
) AS t(mn, mx, cls, msg);

-- ============================================================
-- WHOQOL-BREF (26 itens, 4 domínios; itens invertidos: 3, 4, 26)
-- Escores por domínio transformados para 0–100 (SPSS syntax OMS).
-- Q1 e Q2 são itens gerais (auto-avaliação global de QV e saúde) e não
-- integram os quatro domínios do escore transformado.
-- ============================================================
DO $whoqol$
DECLARE
  v_inst UUID;
  v_d1 UUID; -- Físico
  v_d2 UUID; -- Psicológico
  v_d3 UUID; -- Relações Sociais
  v_d4 UUID; -- Meio Ambiente
BEGIN
  INSERT INTO public.instruments (code, name, description, instructions)
  VALUES (
    'WHOQOL-BREF',
    'Instrumento Abreviado de Avaliação de Qualidade de Vida (WHOQOL-BREF)',
    'Avaliação da qualidade de vida em quatro domínios. WHOQOL Group / OMS, 1998. Validação PT-BR: Fleck et al., Rev. Saúde Pública, 2000. Escores por domínio transformados para 0–100 conforme sintaxe oficial.',
    'Este questionário é sobre como você se sente a respeito de sua qualidade de vida, saúde e outras áreas de sua vida. Por favor, responda a todas as questões. Se não tiver certeza sobre a resposta, escolha a alternativa que lhe parece mais apropriada. Tenha em mente seus valores, aspirações, prazeres e preocupações, pensando nas duas últimas semanas.'
  ) RETURNING id INTO v_inst;

  INSERT INTO public.domains (instrument_id, code, name) VALUES
    (v_inst, 'D1', 'Domínio Físico'),
    (v_inst, 'D2', 'Domínio Psicológico'),
    (v_inst, 'D3', 'Relações Sociais'),
    (v_inst, 'D4', 'Meio Ambiente');

  SELECT id INTO v_d1 FROM public.domains WHERE instrument_id = v_inst AND code = 'D1';
  SELECT id INTO v_d2 FROM public.domains WHERE instrument_id = v_inst AND code = 'D2';
  SELECT id INTO v_d3 FROM public.domains WHERE instrument_id = v_inst AND code = 'D3';
  SELECT id INTO v_d4 FROM public.domains WHERE instrument_id = v_inst AND code = 'D4';

  -- Questões (ordinal, texto, domínio, invertida, tipo_escala)
  -- Tipos de escala Likert 1–5 (Fleck 2000):
  --   AVAL = avaliação (muito ruim → muito boa)                       [Q1]
  --   SAT  = satisfação (muito insatisfeito → muito satisfeito)       [Q2, Q16-Q25]
  --   INT  = intensidade (nada → extremamente)                         [Q3, Q4, Q5, Q6, Q7, Q8, Q9, Q10, Q11, Q12, Q13, Q14, Q15]
  --   FREQ = frequência (nunca → sempre)                               [Q26]
  INSERT INTO public.questions (instrument_id, domain_id, ordinal, text, is_inverted)
  VALUES
    (v_inst, NULL, 1,  'Como você avaliaria sua qualidade de vida?', false),
    (v_inst, NULL, 2,  'Quão satisfeito(a) você está com a sua saúde?', false),
    (v_inst, v_d1, 3,  'Em que medida você acha que sua dor (física) impede você de fazer o que você precisa?', true),
    (v_inst, v_d1, 4,  'O quanto você precisa de algum tratamento médico para levar sua vida diária?', true),
    (v_inst, v_d2, 5,  'O quanto você aproveita a vida?', false),
    (v_inst, v_d2, 6,  'Em que medida você acha que a sua vida tem sentido?', false),
    (v_inst, v_d2, 7,  'O quanto você consegue se concentrar?', false),
    (v_inst, v_d4, 8,  'Quão seguro(a) você se sente em sua vida diária?', false),
    (v_inst, v_d4, 9,  'Quão saudável é o seu ambiente físico (clima, barulho, poluição, atrativos)?', false),
    (v_inst, v_d1, 10, 'Você tem energia suficiente para seu dia-a-dia?', false),
    (v_inst, v_d2, 11, 'Você é capaz de aceitar sua aparência física?', false),
    (v_inst, v_d4, 12, 'Você tem dinheiro suficiente para satisfazer suas necessidades?', false),
    (v_inst, v_d4, 13, 'Quão disponíveis para você estão as informações que precisa no seu dia-a-dia?', false),
    (v_inst, v_d4, 14, 'Em que medida você tem oportunidades de atividade de lazer?', false),
    (v_inst, v_d1, 15, 'Quão bem você é capaz de se locomover?', false),
    (v_inst, v_d1, 16, 'Quão satisfeito(a) você está com o seu sono?', false),
    (v_inst, v_d1, 17, 'Quão satisfeito(a) você está com sua capacidade de desempenhar as atividades do seu dia-a-dia?', false),
    (v_inst, v_d1, 18, 'Quão satisfeito(a) você está com sua capacidade para o trabalho?', false),
    (v_inst, v_d2, 19, 'Quão satisfeito(a) você está consigo mesmo(a)?', false),
    (v_inst, v_d3, 20, 'Quão satisfeito(a) você está com suas relações pessoais (amigos, parentes, conhecidos, colegas)?', false),
    (v_inst, v_d3, 21, 'Quão satisfeito(a) você está com sua vida sexual?', false),
    (v_inst, v_d3, 22, 'Quão satisfeito(a) você está com o apoio que você recebe de seus amigos?', false),
    (v_inst, v_d4, 23, 'Quão satisfeito(a) você está com as condições do local onde mora?', false),
    (v_inst, v_d4, 24, 'Quão satisfeito(a) você está com o seu acesso aos serviços de saúde?', false),
    (v_inst, v_d4, 25, 'Quão satisfeito(a) você está com o seu meio de transporte?', false),
    (v_inst, v_d2, 26, 'Com que frequência você tem sentimentos negativos tais como mau humor, desespero, ansiedade, depressão?', true);

  -- Opções por questão (labels específicos por tipo de escala, pesos 1–5)
  -- Q1 - AVAL
  INSERT INTO public.options (instrument_id, question_id, ordinal, label, weight)
  SELECT v_inst, q.id, ord, label, w
  FROM public.questions q, (VALUES
    (1, 'Muito ruim', 1),
    (2, 'Ruim', 2),
    (3, 'Nem ruim nem boa', 3),
    (4, 'Boa', 4),
    (5, 'Muito boa', 5)
  ) AS t(ord, label, w)
  WHERE q.instrument_id = v_inst AND q.ordinal = 1;

  -- Q2, Q16-Q25 - SAT
  INSERT INTO public.options (instrument_id, question_id, ordinal, label, weight)
  SELECT v_inst, q.id, ord, label, w
  FROM public.questions q, (VALUES
    (1, 'Muito insatisfeito(a)', 1),
    (2, 'Insatisfeito(a)', 2),
    (3, 'Nem satisfeito(a) nem insatisfeito(a)', 3),
    (4, 'Satisfeito(a)', 4),
    (5, 'Muito satisfeito(a)', 5)
  ) AS t(ord, label, w)
  WHERE q.instrument_id = v_inst AND q.ordinal IN (2,16,17,18,19,20,21,22,23,24,25);

  -- Q3, Q4, Q5, Q6, Q7, Q8, Q9, Q10, Q11, Q12, Q13, Q14, Q15 - INT
  INSERT INTO public.options (instrument_id, question_id, ordinal, label, weight)
  SELECT v_inst, q.id, ord, label, w
  FROM public.questions q, (VALUES
    (1, 'Nada', 1),
    (2, 'Muito pouco', 2),
    (3, 'Mais ou menos', 3),
    (4, 'Bastante', 4),
    (5, 'Extremamente', 5)
  ) AS t(ord, label, w)
  WHERE q.instrument_id = v_inst AND q.ordinal IN (3,4,5,6,7,8,9,10,11,12,13,14,15);

  -- Q26 - FREQ
  INSERT INTO public.options (instrument_id, question_id, ordinal, label, weight)
  SELECT v_inst, q.id, ord, label, w
  FROM public.questions q, (VALUES
    (1, 'Nunca', 1),
    (2, 'Algumas vezes', 2),
    (3, 'Frequentemente', 3),
    (4, 'Muito frequentemente', 4),
    (5, 'Sempre', 5)
  ) AS t(ord, label, w)
  WHERE q.instrument_id = v_inst AND q.ordinal = 26;

  -- Regra de escore: soma por domínio com transformação para 0-100 (sintaxe SPSS OMS)
  INSERT INTO public.scoring_rules (instrument_id, aggregation, min_value, max_value, transform)
  VALUES (v_inst, 'SUM_BY_DOMAIN', 1, 5, '{"kind":"whoqol_0_100"}'::jsonb);

  -- WHOQOL-BREF não define pontos de corte diagnósticos. Não inserimos cutoffs.
END;
$whoqol$;
