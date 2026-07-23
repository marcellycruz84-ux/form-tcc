// Estados padronizados de loading / vazio / erro para as telas autenticadas.
import type { ReactNode } from "react";
import { AlertTriangle, Inbox, Loader2 } from "lucide-react";

export function LoadingBlock({ label = "Carregando…" }: { label?: string }) {
  return (
    <div
      role="status"
      aria-live="polite"
      className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground"
    >
      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyBlock({
  title,
  description,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  icon?: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="flex flex-col items-center gap-3 p-10 text-center">
      <Icon className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {description && <p className="mt-1 text-xs text-muted-foreground">{description}</p>}
      </div>
      {action}
    </div>
  );
}

export function ErrorBlock({
  title = "Não foi possível carregar",
  error,
  onRetry,
}: {
  title?: string;
  error?: unknown;
  onRetry?: () => void;
}) {
  const message = error instanceof Error ? error.message : typeof error === "string" ? error : undefined;
  return (
    <div
      role="alert"
      className="flex flex-col items-center gap-3 rounded-lg border border-destructive/40 bg-destructive/5 p-8 text-center"
    >
      <AlertTriangle className="h-6 w-6 text-destructive" aria-hidden="true" />
      <div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {message && <p className="mt-1 text-xs text-muted-foreground">{message}</p>}
      </div>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="rounded-md border border-border bg-background px-3 py-2 text-xs font-medium hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          Tentar novamente
        </button>
      )}
    </div>
  );
}

export function SkeletonRow({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} aria-hidden="true" />;
}

export function SkeletonList({ rows = 5 }: { rows?: number }) {
  return (
    <div role="status" aria-live="polite" aria-label="Carregando lista" className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center justify-between gap-4 px-5 py-4">
          <div className="flex-1 space-y-2">
            <SkeletonRow className="h-4 w-1/3" />
            <SkeletonRow className="h-3 w-1/4" />
          </div>
          <SkeletonRow className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}
