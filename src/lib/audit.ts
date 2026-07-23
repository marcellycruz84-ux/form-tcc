// Helper de auditoria. Falhas de audit NUNCA quebram a operação principal;
// apenas registram em console para investigação posterior.
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

type AuditAction =
  | "patient.create"
  | "patient.update"
  | "patient.soft_delete"
  | "patient.read"
  | "patient.export"
  | "patient.anonymize"
  | "patient.hard_delete"
  | "assessment.create"
  | "assessment.cancel"
  | "assessment.submit"
  | "assessment.read"
  | "assessment.result_view"
  | "admin.audit_view"
  | "public.rate_limit_exceeded";

type Client = SupabaseClient<Database>;

export async function writeAudit(
  supabase: Client,
  actor_user_id: string | null,
  action: AuditAction,
  resource_type: string,
  resource_id: string,
  metadata: Record<string, unknown> = {},
) {
  try {
    const { error } = await supabase.from("audit_logs").insert({
      actor_user_id,
      action,
      resource_type,
      resource_id,
      metadata: metadata as never,
    });
    if (error) console.warn("[audit] insert failed", { action, resource_id, error: error.message });
  } catch (e) {
    console.warn("[audit] threw", { action, resource_id, e });
  }
}
