import { createFileRoute, redirect } from "@tanstack/react-router";

// Compatibilidade com favoritos antigos: o acesso administrativo começa nas campanhas.
export const Route = createFileRoute("/_authenticated/dashboard")({
  beforeLoad: () => {
    throw redirect({ to: "/groups" });
  },
});
