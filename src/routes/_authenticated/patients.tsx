// Layout de /patients - apenas renderiza filhos (index + $id).
import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("/_authenticated/patients")({
  component: () => <Outlet />,
});
