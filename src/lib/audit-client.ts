// Server fn simples para registrar auditoria a partir de ações do cliente
// (ex.: download de laudo PDF, exportações locais).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const schema = z.object({
  assessment_id: z.string().uuid(),
  kind: z.enum(["pdf_download"]),
});

export const writeAuditClientAction = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => schema.parse(d))
  .handler(async ({ data, context }) => {
    await writeAudit(context.supabase, context.userId, "assessment.result_view", "assessment", data.assessment_id, {
      client_action: data.kind,
    });
    return { ok: true };
  });
