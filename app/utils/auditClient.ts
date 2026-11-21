export function logSystemAudit(params: {
  user_id?: string | null;
  user_name: string;
  action: "CREATE" | "UPDATE" | "DELETE" | "CANCEL" | "APPROVE" | "SYNC";
  module: string;
  entity_type: string;
  entity_id?: string | null;
  record_label: string;
  details?: string | null;
}): void {
  if (typeof window === "undefined") return;
  fetch("/api/audit-logs", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  }).catch(() => {
    // fire-and-forget
  });
}

