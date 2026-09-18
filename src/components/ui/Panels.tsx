export function SyntheticDataNotice() {
  return (
    <p className="rounded-sm border border-border bg-accent-soft px-3 py-2 text-xs text-accent">
      DEMO DATA — Synthetic patient records generated for demonstration. No real patient information.
    </p>
  );
}

export function EmptyPanel({ title, body }: { title: string; body: string }) {
  return (
    <div className="rounded-md border border-dashed border-border bg-surface p-10 text-center">
      <p className="text-sm font-medium">{title}</p>
      <p className="mt-1 text-sm text-muted">{body}</p>
    </div>
  );
}

export function ErrorPanel({ message }: { message: string }) {
  return (
    <div role="alert" className="rounded-md border border-danger/30 bg-danger-soft p-4 text-sm text-danger">
      {message}
    </div>
  );
}

export function LoadingPanel({ label }: { label: string }) {
  return (
    <div className="rounded-md border border-border bg-surface p-10 text-center text-sm text-muted" aria-live="polite">
      {label}
    </div>
  );
}
