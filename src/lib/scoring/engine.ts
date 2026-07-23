// Pure, metadata-driven scoring engine. Runs on server (canonical) and client (preview).

export type AggregationKind = "SUM" | "MEAN" | "SUM_BY_DOMAIN";

export interface EngineQuestion {
  id: string;
  ordinal: number;
  is_inverted: boolean;
  domain_id: string | null;
}
export interface EngineOption {
  id: string;
  ordinal: number;
  weight: number;
}
export interface EngineCutoff {
  min_score: number;
  max_score: number;
  classification: string;
  message: string;
  domain_id?: string | null;
}
export interface EngineRule {
  aggregation: AggregationKind;
  min_value: number;
  max_value: number;
  transform?: { kind: "whoqol_0_100" } | { kind: "multiply"; factor: number } | null;
}
export interface EngineInstrument {
  id: string;
  code: string;
  questions: EngineQuestion[];
  options: EngineOption[]; // standardized (question_id null); per-question extension possible
  rule: EngineRule;
  cutoffs: EngineCutoff[];
}

export interface AnswerInput {
  question_id: string;
  option_id: string;
}

export interface ScoreResult {
  raw_scores: Record<string, number>; // per question ordinal → applied weight (post-inversion)
  computed: { total?: number; by_domain?: Record<string, number> };
  cutoff_hits: Array<{
    scope: "total" | "domain";
    domain_id?: string;
    classification: string;
    message: string;
    score: number;
  }>;
  flags: string[];
  answered: number;
  total_questions: number;
}

function applyInversion(weight: number, isInverted: boolean, min: number, max: number): number {
  if (!isInverted) return weight;
  return max - weight + min;
}

export function computeScore(inst: EngineInstrument, answers: AnswerInput[]): ScoreResult {
  const qById = new Map(inst.questions.map((q) => [q.id, q]));
  const optById = new Map(inst.options.map((o) => [o.id, o]));

  const raw_scores: Record<string, number> = {};
  const perDomain: Record<string, number[]> = {};
  const flags: string[] = [];

  let total = 0;

  for (const a of answers) {
    const q = qById.get(a.question_id);
    const o = optById.get(a.option_id);
    if (!q || !o) continue;
    const applied = applyInversion(
      o.weight,
      q.is_inverted,
      inst.rule.min_value,
      inst.rule.max_value,
    );
    raw_scores[q.ordinal] = applied;
    const isOfficialGadItem = inst.code !== "GAD-7" || q.ordinal <= 7;
    const isOfficialPhqItem = inst.code !== "PHQ-9" || q.ordinal <= 9;
    if (isOfficialGadItem && isOfficialPhqItem) total += applied;
    if (q.domain_id) {
      (perDomain[q.domain_id] ||= []).push(applied);
    }
    // PHQ-9 Q9 (item de ideação suicida) - flag
    if (inst.code === "PHQ-9" && q.ordinal === 9 && o.weight > 0) {
      flags.push("phq9_q9_positive");
    }
  }

  const computed: ScoreResult["computed"] = {};
  const cutoff_hits: ScoreResult["cutoff_hits"] = [];

  if (inst.rule.aggregation === "SUM") {
    computed.total = total;
    for (const c of inst.cutoffs) {
      if (total >= c.min_score && total <= c.max_score) {
        cutoff_hits.push({
          scope: "total",
          classification: c.classification,
          message: c.message,
          score: total,
        });
      }
    }
  } else if (inst.rule.aggregation === "MEAN") {
    const n = Object.keys(raw_scores).length;
    const mean = n > 0 ? total / n : 0;
    computed.total = mean;
    for (const c of inst.cutoffs) {
      if (mean >= c.min_score && mean <= c.max_score) {
        cutoff_hits.push({
          scope: "total",
          classification: c.classification,
          message: c.message,
          score: mean,
        });
      }
    }
  } else if (inst.rule.aggregation === "SUM_BY_DOMAIN") {
    const by: Record<string, number> = {};
    for (const [domainId, scores] of Object.entries(perDomain)) {
      let value: number;
      if (inst.rule.transform?.kind === "whoqol_0_100") {
        // média × 4 → transforma para escala 0-100 conforme manual WHOQOL-BREF
        const mean = scores.reduce((s, x) => s + x, 0) / scores.length;
        value = ((mean - 1) / 4) * 100;
      } else if (inst.rule.transform?.kind === "multiply") {
        value = scores.reduce((s, x) => s + x, 0) * inst.rule.transform.factor;
      } else {
        value = scores.reduce((s, x) => s + x, 0);
      }
      by[domainId] = value;
      for (const c of inst.cutoffs.filter((x) => x.domain_id === domainId)) {
        if (value >= c.min_score && value <= c.max_score) {
          cutoff_hits.push({
            scope: "domain",
            domain_id: domainId,
            classification: c.classification,
            message: c.message,
            score: value,
          });
        }
      }
    }
    computed.by_domain = by;
  }

  return {
    raw_scores,
    computed,
    cutoff_hits,
    flags,
    answered: Object.keys(raw_scores).length,
    total_questions: inst.questions.length,
  };
}
