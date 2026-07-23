// Relatório em PDF (client-side via @react-pdf/renderer) - uso acadêmico.
// Reaproveita a lógica visual dos gráficos B2/B3 desenhando via primitivas SVG
// próprias do react-pdf (Path/Rect/Line/Polygon) - não usa <canvas>.
import { Document, Page, Text, View, StyleSheet, Svg, Rect, Line, Polygon, G, Path, Circle } from "@react-pdf/renderer";

export interface LaudoData {
  patient_name: string;
  instrument_code: string;
  instrument_name: string;
  created_at: string;
  status: string;
  total?: number;
  total_max?: number;
  classification?: string;
  message?: string;
  cutoffs: Array<{ min_score: number; max_score: number; classification: string; message: string; domain_id: string | null }>;
  domains: Array<{ id: string; code: string; name: string }>;
  by_domain?: Record<string, number>;
  flags: string[];
  professional_name: string;
  professional_credential: string;
  is_whoqol: boolean;
}

const palette = ["#0f766e", "#0369a1", "#7c3aed", "#c2410c", "#a16207"];

const styles = StyleSheet.create({
  page: { padding: 36, fontSize: 10, fontFamily: "Helvetica", color: "#111" },
  h1: { fontSize: 16, fontWeight: 700, marginBottom: 2 },
  h2: { fontSize: 11, fontWeight: 700, marginTop: 14, marginBottom: 6, textTransform: "uppercase", letterSpacing: 1, color: "#374151" },
  small: { fontSize: 9, color: "#4b5563" },
  meta: { flexDirection: "row", marginTop: 12, gap: 24 },
  metaBlock: { flex: 1 },
  metaLabel: { fontSize: 8, color: "#6b7280", textTransform: "uppercase", letterSpacing: 1 },
  metaValue: { fontSize: 11, marginTop: 2 },
  score: { fontSize: 28, fontWeight: 700 },
  scoreLabel: { fontSize: 9, color: "#4b5563" },
  hr: { borderBottom: 1, borderBottomColor: "#e5e7eb", marginVertical: 10 },
  card: { border: 1, borderColor: "#e5e7eb", borderRadius: 4, padding: 12, marginTop: 8 },
  alert: { border: 1, borderColor: "#dc2626", backgroundColor: "#fef2f2", borderRadius: 4, padding: 10, marginTop: 8 },
  alertTitle: { fontSize: 10, fontWeight: 700, color: "#dc2626", marginBottom: 3 },
  tableHeader: { flexDirection: "row", borderBottom: 1, borderBottomColor: "#e5e7eb", paddingBottom: 4, marginTop: 6 },
  tableRow: { flexDirection: "row", paddingVertical: 4, borderBottom: 0.5, borderBottomColor: "#f3f4f6" },
  th: { fontSize: 9, fontWeight: 700, color: "#374151" },
  td: { fontSize: 9 },
  footer: { position: "absolute", bottom: 30, left: 36, right: 36, borderTop: 1, borderTopColor: "#e5e7eb", paddingTop: 8 },
  footerText: { fontSize: 8, color: "#6b7280", lineHeight: 1.4 },
});

export function LaudoPDF({ data }: { data: LaudoData }) {
  return (
    <Document title={`Relatório ${data.instrument_code}`}>
      <Page size="A4" style={styles.page}>
        {/* Cabeçalho */}
        <View>
          <Text style={styles.h1}>{data.professional_name || "Aluno(a) responsável"}</Text>
          <Text style={styles.small}>
            {data.professional_credential || "Curso/turma não informado"} · Emitido em {new Date().toLocaleString("pt-BR")}
          </Text>
        </View>

        <View style={styles.hr} />

        <View>
          <Text style={styles.h1}>Relatório - {data.instrument_name}</Text>
          <Text style={styles.small}>{data.instrument_code}</Text>
        </View>

        <View style={styles.meta}>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Respondente</Text>
            <Text style={styles.metaValue}>{data.patient_name}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Data da aplicação</Text>
            <Text style={styles.metaValue}>{new Date(data.created_at).toLocaleString("pt-BR")}</Text>
          </View>
          <View style={styles.metaBlock}>
            <Text style={styles.metaLabel}>Status</Text>
            <Text style={styles.metaValue}>{data.status}</Text>
          </View>
        </View>

        {data.flags.length > 0 && (
          <View style={styles.alert}>
            <Text style={styles.alertTitle}>Item sensível</Text>
            {data.flags.map((f) => (
              <Text key={f} style={{ fontSize: 9 }}>
                {f === "phq9_q9_positive"
                  ? "PHQ-9 item 9 (ideação suicida) marcado - recomenda-se conversar com o respondente e, se necessário, encaminhá-lo a apoio profissional."
                  : f}
              </Text>
            ))}
          </View>
        )}

        {/* Escore total (SUM) */}
        {typeof data.total === "number" && !data.is_whoqol && (
          <View style={styles.card}>
            <Text style={styles.scoreLabel}>Pontuação total</Text>
            <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
              <Text style={styles.score}>{formatScore(data.total)}</Text>
              {data.total_max !== undefined && <Text style={styles.small}>de {data.total_max}</Text>}
            </View>
            {data.classification && <Text style={{ fontSize: 11, marginTop: 4, fontWeight: 700 }}>{data.classification}</Text>}
            {data.message && <Text style={{ ...styles.small, marginTop: 2 }}>{data.message}</Text>}

            {/* D2 - barra de cut-offs (SVG puro dentro do PDF) */}
            <CutoffBarPDF total={data.total} cutoffs={data.cutoffs.filter((c) => c.domain_id === null)} />
          </View>
        )}

        {/* Domínios (WHOQOL) - tabela + radar */}
        {data.by_domain && data.domains.length > 0 && (
          <>
            <Text style={styles.h2}>Domínios</Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <View style={{ flex: 1 }}>
                <View style={styles.tableHeader}>
                  <Text style={[styles.th, { flex: 3 }]}>Domínio</Text>
                  <Text style={[styles.th, { flex: 1, textAlign: "right" }]}>Escore</Text>
                </View>
                {data.domains.map((d) => (
                  <View key={d.id} style={styles.tableRow}>
                    <Text style={[styles.td, { flex: 3 }]}>{d.name}</Text>
                    <Text style={[styles.td, { flex: 1, textAlign: "right" }]}>
                      {data.by_domain?.[d.id] !== undefined ? formatScore(data.by_domain[d.id]) : "-"}
                    </Text>
                  </View>
                ))}
              </View>
              <View style={{ width: 200 }}>
                <RadarPDF
                  values={data.domains.map((d) => ({ label: d.name, value: data.by_domain?.[d.id] ?? 0 }))}
                />
              </View>
            </View>
          </>
        )}

        {/* Cut-offs */}
        {data.cutoffs.filter((c) => c.domain_id === null).length > 0 && (
          <>
            <Text style={styles.h2}>Referências de classificação</Text>
            <View style={styles.tableHeader}>
              <Text style={[styles.th, { flex: 1 }]}>Faixa</Text>
              <Text style={[styles.th, { flex: 2 }]}>Classificação</Text>
              <Text style={[styles.th, { flex: 4 }]}>Interpretação</Text>
            </View>
            {data.cutoffs
              .filter((c) => c.domain_id === null)
              .sort((a, b) => a.min_score - b.min_score)
              .map((c, i) => (
                <View key={i} style={styles.tableRow}>
                  <Text style={[styles.td, { flex: 1 }]}>{c.min_score}–{c.max_score}</Text>
                  <Text style={[styles.td, { flex: 2 }]}>{c.classification}</Text>
                  <Text style={[styles.td, { flex: 4 }]}>{c.message}</Text>
                </View>
              ))}
          </>
        )}

        <View style={styles.footer} fixed>
          <Text style={styles.footerText}>
            Documento gerado para fins de atividade acadêmica a partir de instrumento padronizado. Não substitui avaliação profissional nem estabelece diagnóstico.
            Os dados do respondente são tratados sob a LGPD (Lei 13.709/2018), com base no consentimento livre e esclarecido registrado antes da coleta.
          </Text>
          <Text
            style={{ ...styles.footerText, marginTop: 4, textAlign: "right" }}
            render={({ pageNumber, totalPages }) => `${data.professional_name || "Aluno(a) responsável"} - página ${pageNumber} de ${totalPages}`}
            fixed
          />
        </View>
      </Page>
    </Document>
  );
}

function formatScore(v: number): string {
  return Number.isInteger(v) ? String(v) : v.toFixed(1);
}

/** D2 - barra horizontal SVG dos cut-offs (dentro do PDF). */
function CutoffBarPDF({ total, cutoffs }: { total: number; cutoffs: LaudoData["cutoffs"] }) {
  if (cutoffs.length === 0) return null;
  const sorted = [...cutoffs].sort((a, b) => a.min_score - b.min_score);
  const max = sorted.reduce((m, c) => Math.max(m, c.max_score), 0);
  if (max === 0) return null;
  const width = 500;
  const height = 26;
  const markerX = Math.max(0, Math.min(width, (total / max) * width));

  return (
    <View style={{ marginTop: 10 }}>
      <Svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
        {sorted.map((c, i) => {
          const x = (c.min_score / max) * width;
          const w = ((c.max_score - c.min_score + 1) / max) * width;
          return (
            <G key={i}>
              <Rect x={x} y={6} width={w} height={10} fill={palette[i % palette.length]} fillOpacity={0.35} />
            </G>
          );
        })}
        <Line x1={markerX} x2={markerX} y1={2} y2={20} stroke="#111" strokeWidth={1.2} />
        <Polygon points={`${markerX - 3},22 ${markerX + 3},22 ${markerX},18`} fill="#111" />
      </Svg>
      <View style={{ flexDirection: "row", flexWrap: "wrap", marginTop: 4, gap: 8 }}>
        {sorted.map((c, i) => (
          <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
            <View style={{ width: 6, height: 6, borderRadius: 1, backgroundColor: palette[i % palette.length], opacity: 0.7 }} />
            <Text style={{ fontSize: 8, color: "#374151" }}>{c.classification} ({c.min_score}–{c.max_score})</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

/** D2 - radar SVG dos domínios (escala 0–100). */
function RadarPDF({ values }: { values: Array<{ label: string; value: number }> }) {
  const size = 180;
  const cx = size / 2;
  const cy = size / 2;
  const r = 60;
  const n = values.length;
  if (n < 3) return null;

  const angleFor = (i: number) => -Math.PI / 2 + (2 * Math.PI * i) / n;
  const point = (value: number, i: number) => {
    const ratio = Math.max(0, Math.min(1, value / 100));
    return [cx + Math.cos(angleFor(i)) * r * ratio, cy + Math.sin(angleFor(i)) * r * ratio];
  };

  // Rings
  const rings = [0.25, 0.5, 0.75, 1];
  const dataPath = values
    .map((v, i) => {
      const [x, y] = point(v.value, i);
      return `${i === 0 ? "M" : "L"} ${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ") + " Z";

  return (
    <Svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      {rings.map((k, i) => (
        <Circle key={i} cx={cx} cy={cy} r={r * k} stroke="#e5e7eb" strokeWidth={0.5} fill="none" />
      ))}
      {values.map((_, i) => {
        const [x, y] = [cx + Math.cos(angleFor(i)) * r, cy + Math.sin(angleFor(i)) * r];
        return <Line key={i} x1={cx} y1={cy} x2={x} y2={y} stroke="#e5e7eb" strokeWidth={0.5} />;
      })}
      <Path d={dataPath} stroke="#0369a1" strokeWidth={1.2} fill="#0369a1" fillOpacity={0.25} />
      {values.map((v, i) => {
        const [x, y] = point(v.value, i);
        return <Circle key={`p-${i}`} cx={x} cy={y} r={1.6} fill="#0369a1" />;
      })}
    </Svg>
  );
}
