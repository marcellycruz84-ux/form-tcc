// Server functions do painel de auditoria (admin).
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAudit } from "@/lib/audit";
import { z } from "zod";

const listSchema = z.object({
  action: z.string().optional(),
  resource_type: z.string().optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.number().int().min(0).default(0),
  page_size: z.number().int().min(10).max(200).default(50),
});

async function requireAdmin(supabase: import("@supabase/supabase-js").SupabaseClient, userId: string) {
  const { data, error } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Acesso restrito a administradores.");
}

export const listAuditLogs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => listSchema.parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);

    let q = supabase
      .from("audit_logs")
      .select("id, actor_user_id, action, resource_type, resource_id, metadata, created_at", { count: "exact" })
      .order("created_at", { ascending: false });

    if (data.action) q = q.eq("action", data.action);
    if (data.resource_type) q = q.eq("resource_type", data.resource_type);
    if (data.from) q = q.gte("created_at", data.from);
    if (data.to) q = q.lte("created_at", data.to);

    const from = data.page * data.page_size;
    const to = from + data.page_size - 1;
    q = q.range(from, to);

    const { data: rows, count, error } = await q;
    if (error) throw new Error(error.message);

    await writeAudit(supabase, userId, "admin.audit_view", "audit_logs", "list", {
      filters: { action: data.action, resource_type: data.resource_type },
      page: data.page,
    });

    return { rows: rows ?? [], total: count ?? 0, page: data.page, page_size: data.page_size };
  });

export const auditFacets = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    await requireAdmin(supabase, userId);
    const { data, error } = await supabase
      .from("audit_logs")
      .select("action, resource_type")
      .limit(1000);
    if (error) throw new Error(error.message);
    const actions = Array.from(new Set((data ?? []).map((r) => r.action))).sort();
    const resources = Array.from(new Set((data ?? []).map((r) => r.resource_type))).sort();
    return { actions, resources };
  });

export const myRoles = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data } = await supabase.from("user_roles").select("role").eq("user_id", userId);
    return { roles: (data ?? []).map((r) => r.role as string) };
  });
