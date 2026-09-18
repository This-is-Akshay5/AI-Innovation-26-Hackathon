const TONES = {
  success: "bg-success-soft text-success border-success/30",
  warning: "bg-warning-soft text-warning border-warning/30",
  danger: "bg-danger-soft text-danger border-danger/30",
  neutral: "bg-accent-soft text-accent border-accent/30",
  muted: "bg-black/[0.03] text-muted border-border",
} as const;

export function StatusBadge({
  tone,
  children,
}: {
  tone: keyof typeof TONES;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-sm border px-2 py-0.5 text-xs font-medium ${TONES[tone]}`}
    >
      {children}
    </span>
  );
}

export function permissionTone(status: string): keyof typeof TONES {
  switch (status) {
    case "active":
    case "approved":
      return "success";
    case "requested":
      return "warning";
    case "expired":
    case "denied":
    case "revoked":
      return "danger";
    default:
      return "muted";
  }
}

export function integrityTone(status: string): keyof typeof TONES {
  switch (status) {
    case "verified":
      return "success";
    case "pending":
      return "warning";
    case "mismatch":
      return "danger";
    default:
      return "muted";
  }
}
