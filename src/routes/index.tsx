import { createFileRoute } from "@tanstack/react-router";
import { TangentApp } from "@/components/tangent/tangent-app";

export const Route = createFileRoute("/")({
  component: TangentApp,
});
