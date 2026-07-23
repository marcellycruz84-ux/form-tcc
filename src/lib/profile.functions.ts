// Server functions - perfil do profissional autenticado.
import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

const profileInputSchema = z.object({
  full_name: z.string().trim().min(2, "Informe o nome completo").max(120),
  credential: z
    .string()
    .trim()
    .max(40)
    .optional()
    .transform((v) => (v && v.length > 0 ? v : null)),
});

export const getMyProfile = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data, error } = await supabase
      .from("profiles")
      .select("id, full_name, credential, created_at, updated_at")
      .eq("id", userId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data ?? { id: userId, full_name: "", credential: null, created_at: null, updated_at: null };
  });

export const updateMyProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) => profileInputSchema.parse(d))
  .handler(async ({ context, data }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("profiles")
      .update({ full_name: data.full_name, credential: data.credential })
      .eq("id", userId);
    if (error) throw new Error(error.message);
    return { ok: true as const };
  });
