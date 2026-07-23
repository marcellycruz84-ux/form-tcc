import { describe, expect, it } from "vitest";
import { getCampaignInstrumentSummary, normalizeInstrumentSelection } from "../group-campaigns.utils";

describe("normalizeInstrumentSelection", () => {
  it("aceita uma lista de ids e remove duplicados", () => {
    expect(normalizeInstrumentSelection(["a", "b", "a"])).toEqual(["a", "b"]);
  });

  it("aceita um único id em formato string", () => {
    expect(normalizeInstrumentSelection("a")).toEqual(["a"]);
  });

  it("rejeita entradas vazias", () => {
    expect(() => normalizeInstrumentSelection([])).toThrow(/pelo menos um instrumento/i);
    expect(() => normalizeInstrumentSelection(" ")).toThrow(/pelo menos um instrumento/i);
  });
});

describe("getCampaignInstrumentSummary", () => {
  it("prioriza a lista de instrumentos vinculados à campanha quando existem vários", () => {
    expect(getCampaignInstrumentSummary({
      instruments: [
        { id: "1", code: "GAD-7", name: "Ansiedade" },
        { id: "2", code: "PHQ-9", name: "Depressão" },
      ],
      instrument: { code: "OLD", name: "Antigo" },
    })).toEqual({
      badgeLabel: "2 instrumentos",
      summaryLabel: "GAD-7 • PHQ-9",
    });
  });

  it("faz fallback para o instrumento principal quando a campanha tem apenas um", () => {
    expect(getCampaignInstrumentSummary({
      instrument: { code: "GAD-7", name: "Ansiedade" },
    })).toEqual({
      badgeLabel: "GAD-7",
      summaryLabel: "GAD-7 · Ansiedade",
    });
  });
});
