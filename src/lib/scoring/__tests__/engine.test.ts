// Testes unitários do motor de escoragem - GAD-7, PHQ-9 e WHOQOL-BREF.
import { describe, it, expect } from "vitest";
import { computeScore, type EngineInstrument, type AnswerInput } from "../engine";

// ---------- Helpers ----------

/** Constrói um instrumento genérico do tipo SUM (GAD-7 / PHQ-9). */
function buildLikertSumInstrument(opts: {
  id: string;
  code: string;
  n_questions: number;
  min: number;
  max: number;
  cutoffs: Array<{ min: number; max: number; classification: string; message: string }>;
  invert?: number[]; // ordinais invertidos
}): EngineInstrument {
  const questions = Array.from({ length: opts.n_questions }, (_, i) => ({
    id: `q${i + 1}`,
    ordinal: i + 1,
    is_inverted: (opts.invert ?? []).includes(i + 1),
    domain_id: null as string | null,
  }));
  const options = Array.from({ length: opts.max - opts.min + 1 }, (_, i) => ({
    id: `o${opts.min + i}`,
    ordinal: opts.min + i,
    weight: opts.min + i,
  }));
  return {
    id: opts.id,
    code: opts.code,
    questions,
    options,
    rule: { aggregation: "SUM", min_value: opts.min, max_value: opts.max, transform: null },
    cutoffs: opts.cutoffs.map((c) => ({
      min_score: c.min,
      max_score: c.max,
      classification: c.classification,
      message: c.message,
      domain_id: null,
    })),
  };
}

/** Todas as respostas apontando para o mesmo ordinal. */
function answersUniform(inst: EngineInstrument, weight: number): AnswerInput[] {
  const opt = inst.options.find((o) => o.weight === weight)!;
  return inst.questions.map((q) => ({ question_id: q.id, option_id: opt.id }));
}

// ---------- GAD-7 ----------

describe("GAD-7 (SUM 0..3, 7 itens)", () => {
  const inst = buildLikertSumInstrument({
    id: "gad7",
    code: "GAD-7",
    n_questions: 7,
    min: 0,
    max: 3,
    cutoffs: [
      { min: 0, max: 4, classification: "Mínima", message: "" },
      { min: 5, max: 9, classification: "Leve", message: "" },
      { min: 10, max: 14, classification: "Moderada", message: "" },
      { min: 15, max: 21, classification: "Grave", message: "" },
    ],
  });

  it("pontuação mínima (todas 0) = 0 → Mínima", () => {
    const r = computeScore(inst, answersUniform(inst, 0));
    expect(r.computed.total).toBe(0);
    expect(r.cutoff_hits[0]?.classification).toBe("Mínima");
    expect(r.answered).toBe(7);
    expect(r.total_questions).toBe(7);
  });

  it("pontuação máxima (todas 3) = 21 → Grave", () => {
    const r = computeScore(inst, answersUniform(inst, 3));
    expect(r.computed.total).toBe(21);
    expect(r.cutoff_hits[0]?.classification).toBe("Grave");
  });

  it("faixa Moderada (10)", () => {
    // 3+2+2+1+1+1+0 = 10
    const wanted = [3, 2, 2, 1, 1, 1, 0];
    const answers: AnswerInput[] = inst.questions.map((q, i) => ({
      question_id: q.id,
      option_id: inst.options.find((o) => o.weight === wanted[i])!.id,
    }));
    const r = computeScore(inst, answers);
    expect(r.computed.total).toBe(10);
    expect(r.cutoff_hits[0]?.classification).toBe("Moderada");
  });

  it("não emite flag PHQ-9", () => {
    const r = computeScore(inst, answersUniform(inst, 3));
    expect(r.flags).toEqual([]);
  });

  it("não inclui uma questão funcional adicional no total oficial", () => {
    const withImpact = {
      ...inst,
      questions: [...inst.questions, { id: "q8", ordinal: 8, is_inverted: false, domain_id: null }],
    };
    const r = computeScore(withImpact, answersUniform(withImpact, 3));
    expect(r.computed.total).toBe(21);
    expect(r.raw_scores["8"]).toBe(3);
  });
});

// ---------- PHQ-9 ----------

describe("PHQ-9 (SUM 0..3, 9 itens)", () => {
  const inst = buildLikertSumInstrument({
    id: "phq9",
    code: "PHQ-9",
    n_questions: 9,
    min: 0,
    max: 3,
    cutoffs: [
      { min: 0, max: 4, classification: "Mínima", message: "" },
      { min: 5, max: 9, classification: "Leve", message: "" },
      { min: 10, max: 14, classification: "Moderada", message: "" },
      { min: 15, max: 19, classification: "Moderadamente grave", message: "" },
      { min: 20, max: 27, classification: "Grave", message: "" },
    ],
  });

  it("Q9 > 0 emite flag de ideação suicida", () => {
    const answers: AnswerInput[] = inst.questions.map((q) => ({
      question_id: q.id,
      option_id: inst.options.find((o) => o.weight === (q.ordinal === 9 ? 1 : 0))!.id,
    }));
    const r = computeScore(inst, answers);
    expect(r.flags).toContain("phq9_q9_positive");
    expect(r.computed.total).toBe(1);
  });

  it("Q9 == 0 não emite flag mesmo com escore alto", () => {
    const answers: AnswerInput[] = inst.questions.map((q) => ({
      question_id: q.id,
      option_id: inst.options.find((o) => o.weight === (q.ordinal === 9 ? 0 : 3))!.id,
    }));
    const r = computeScore(inst, answers);
    expect(r.flags).not.toContain("phq9_q9_positive");
    expect(r.computed.total).toBe(24); // 8 itens * 3
    expect(r.cutoff_hits[0]?.classification).toBe("Grave");
  });

  it("todas máximas → 27 (Grave) + flag", () => {
    const r = computeScore(inst, answersUniform(inst, 3));
    expect(r.computed.total).toBe(27);
    expect(r.flags).toContain("phq9_q9_positive");
  });

  it("não inclui uma questão funcional adicional no total oficial", () => {
    const withImpact = {
      ...inst,
      questions: [
        ...inst.questions,
        { id: "q10", ordinal: 10, is_inverted: false, domain_id: null },
      ],
    };
    const r = computeScore(withImpact, answersUniform(withImpact, 3));
    expect(r.computed.total).toBe(27);
    expect(r.raw_scores["10"]).toBe(3);
  });
});

// ---------- WHOQOL-BREF ----------

describe("WHOQOL-BREF (SUM_BY_DOMAIN 1..5, transform 0-100)", () => {
  // Cria 26 itens, 4 domínios simulados. Para o teste do transform,
  // basta um domínio com N itens; usamos 7 (equivalente ao domínio Físico).
  const DOM = "dom-fisico";
  const inst: EngineInstrument = {
    id: "whoqol",
    code: "WHOQOL-BREF",
    questions: [
      // 7 itens do domínio físico (ordinais 3, 4, 10, 15, 16, 17, 18 no manual).
      // Q3 e Q4 são invertidos.
      { id: "q3", ordinal: 3, is_inverted: true, domain_id: DOM },
      { id: "q4", ordinal: 4, is_inverted: true, domain_id: DOM },
      { id: "q10", ordinal: 10, is_inverted: false, domain_id: DOM },
      { id: "q15", ordinal: 15, is_inverted: false, domain_id: DOM },
      { id: "q16", ordinal: 16, is_inverted: false, domain_id: DOM },
      { id: "q17", ordinal: 17, is_inverted: false, domain_id: DOM },
      { id: "q18", ordinal: 18, is_inverted: false, domain_id: DOM },
    ],
    options: Array.from({ length: 5 }, (_, i) => ({
      id: `o${i + 1}`,
      ordinal: i + 1,
      weight: i + 1,
    })),
    rule: {
      aggregation: "SUM_BY_DOMAIN",
      min_value: 1,
      max_value: 5,
      transform: { kind: "whoqol_0_100" },
    },
    cutoffs: [],
  };

  const optByW = (w: number) => inst.options.find((o) => o.weight === w)!.id;

  it("inversão: Q3=1 vira 5 no raw_scores", () => {
    const answers: AnswerInput[] = [
      { question_id: "q3", option_id: optByW(1) },
      { question_id: "q4", option_id: optByW(1) },
      { question_id: "q10", option_id: optByW(5) },
      { question_id: "q15", option_id: optByW(5) },
      { question_id: "q16", option_id: optByW(5) },
      { question_id: "q17", option_id: optByW(5) },
      { question_id: "q18", option_id: optByW(5) },
    ];
    const r = computeScore(inst, answers);
    // Todos aplicados = 5 → média = 5 → (5-1)/4*100 = 100
    expect(r.raw_scores["3"]).toBe(5);
    expect(r.raw_scores["4"]).toBe(5);
    expect(r.computed.by_domain?.[DOM]).toBeCloseTo(100, 5);
  });

  it("todas respostas = 1 (após inversão fica pior/melhor por item) → média=? escala 0-100", () => {
    // Q3, Q4 invertidos: 1 → 5. Demais 5 respostas = 1. Média = (5+5+1+1+1+1+1)/7 = 15/7 ≈ 2.1428
    // Transform: (2.1428 - 1) / 4 * 100 ≈ 28.571
    const answers: AnswerInput[] = inst.questions.map((q) => ({
      question_id: q.id,
      option_id: optByW(1),
    }));
    const r = computeScore(inst, answers);
    expect(r.computed.by_domain?.[DOM]).toBeCloseTo(28.5714, 3);
  });

  it("todas respostas = 3 → média 3 → 50 na escala 0-100 (independe de inversão simétrica)", () => {
    const answers: AnswerInput[] = inst.questions.map((q) => ({
      question_id: q.id,
      option_id: optByW(3),
    }));
    const r = computeScore(inst, answers);
    // Inversão simétrica em torno de 3: 6-3 = 3. Todos ficam 3.
    expect(r.computed.by_domain?.[DOM]).toBeCloseTo(50, 5);
  });

  it("total_questions e answered contabilizam corretamente", () => {
    const answers: AnswerInput[] = inst.questions.slice(0, 3).map((q) => ({
      question_id: q.id,
      option_id: optByW(3),
    }));
    const r = computeScore(inst, answers);
    expect(r.total_questions).toBe(7);
    expect(r.answered).toBe(3);
  });
});
