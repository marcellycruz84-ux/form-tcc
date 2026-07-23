export function normalizeInstrumentSelection(input: string | string[] | null | undefined): string[] {
  const values = Array.isArray(input)
    ? input
    : typeof input === "string"
      ? input.split(",")
      : [];

  const normalized = values
    .map((value) => value?.trim())
    .filter((value): value is string => Boolean(value));

  const unique = Array.from(new Set(normalized));
  if (unique.length === 0) {
    throw new Error("Selecione pelo menos um instrumento para a campanha.");
  }

  return unique;
}

export function buildInstrumentResponseDistribution(
  responses: Array<{ instrument_id?: string | null }> | undefined,
  instruments: Array<{ id: string; code: string; name: string }> | undefined,
) {
  const instrumentLookup = new Map((instruments ?? []).map((instrument) => [instrument.id, instrument]));
  const counts = new Map<string, number>();

  for (const response of responses ?? []) {
    const instrument = response.instrument_id ? instrumentLookup.get(response.instrument_id) : undefined;
    const label = instrument
      ? `${instrument.code} · ${instrument.name}`
      : "Instrumento não identificado";
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return Array.from(counts.entries()).map(([label, count]) => ({ label, count }));
}

export function getCampaignInstrumentSummary(campaign: {
  instruments?: Array<{ id?: string; code: string; name: string }> | null;
  instrument?: { code: string; name: string } | null;
}) {
  const instruments = campaign.instruments ?? [];

  if (instruments.length > 0) {
    return {
      badgeLabel: instruments.length > 1 ? `${instruments.length} instrumentos` : instruments[0].code,
      summaryLabel: instruments.length > 1
        ? instruments.map((instrument) => instrument.code).join(" \u2022 ")
        : `${instruments[0].code} \u00B7 ${instruments[0].name}`,
    };
  }

  if (campaign.instrument) {
    return {
      badgeLabel: campaign.instrument.code,
      summaryLabel: `${campaign.instrument.code} \u00B7 ${campaign.instrument.name}`,
    };
  }

  return {
    badgeLabel: "Instrumento",
    summaryLabel: "Instrumento nao identificado",
  };
}
