// Notificação do paciente (E5). O provedor externo será definido pelo cliente;
// esta função mantém o contrato e registra o envio em audit_logs para rastreio.
// Quando o provedor for definido (Resend, SendGrid ou SMTP), o `sender`
// abaixo é o único ponto que precisa ser trocado.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const sendSchema = z.object({
  assessment_id: z.string().uuid(),
  email: z.string().email(),
  link: z.string().url(),
});

type Sender = (input: { to: string; subject: string; html: string }) => Promise<{ ok: boolean; provider: string; error?: string }>;

// Sender stub: registra intenção e devolve `ok: true` sem enviar de fato.
// Substituir por uma integração real de email mantendo a mesma
// assinatura.
const sender: Sender = async ({ to }) => {
  console.log("[notify] TODO integrar provedor de email - destinatário:", to);
  return { ok: true, provider: "stub" };
};

export const notifyPatientLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => sendSchema.parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: a, error } = await supabase
      .from("assessments")
      .select("id, expires_at, instrument:instruments(name)")
      .eq("id", data.assessment_id)
      .single();
    if (error || !a) throw new Error("Avaliação não encontrada.");

    const subject = `Sua avaliação - ${a.instrument?.name ?? "Instrumento clínico"}`;
    const html = `
      <p>Olá,</p>
      <p>Seu profissional preparou uma avaliação para você responder. O link é pessoal e expira em ${new Date(a.expires_at).toLocaleString("pt-BR")}.</p>
      <p><a href="${data.link}">${data.link}</a></p>
      <p>Este link não deve ser compartilhado.</p>
    `.trim();

    const result = await sender({ to: data.email, subject, html });

    await writeAudit(supabase, userId, "assessment.create", "assessment", a.id, {
      notification: {
        channel: "email",
        provider: result.provider,
        ok: result.ok,
        recipient_domain: data.email.split("@")[1] ?? "",
      },
    });

    if (!result.ok) throw new Error(result.error ?? "Falha ao enviar email.");
    return { ok: true, provider: result.provider };
  });
