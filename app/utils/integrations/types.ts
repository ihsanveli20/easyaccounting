export type IntegrationProviderKey =
  | "odoo"
  | "nes"
  | "turmob"
  | "bank"
  | "whatsapp_business"
  | "email";

export type IntegrationConnectionStatus =
  | "connected"
  | "pending"
  | "error"
  | "syncing"
  | "disabled";

export type SyncDirection = "pull" | "push" | "bidirectional";

export type SyncJobStatus =
  | "pending"
  | "processing"
  | "success"
  | "partial"
  | "failed"
  | "cancelled";

export interface ProviderFieldSchema {
  key: string;
  label: string;
  type: "text" | "url" | "password" | "number" | "select";
  isSecret: boolean;
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
}

export interface IntegrationProviderDefinition {
  key: IntegrationProviderKey;
  name: string;
  shortDesc: string;
  category: "erp" | "einvoice" | "accounting" | "banking" | "messaging";
  authMethod: string;
  supportsDirectApi: boolean;
  supportsTwoWaySync: boolean;
  supportsWebhooks: boolean;
  apiCapabilityNote: string;
  supportedDataTypes: string[];
  fields: ProviderFieldSchema[];
}

export interface IntegrationConnectionState {
  provider_key: IntegrationProviderKey;
  display_name: string;
  status: IntegrationConnectionStatus;
  auto_sync_enabled: boolean;
  sync_interval_minutes: number;
  sync_direction: SyncDirection;
  public_config: Record<string, string>;
  has_secrets: Record<string, boolean>; // masked presence flags, never raw secret values!
  last_sync_at: string | null;
  last_error_at: string | null;
  last_error_message: string | null;
  synced_record_count: number;
  error_record_count: number;
  updated_at: string;
}

export interface ExternalIdMappingRecord {
  id: string;
  provider_key: IntegrationProviderKey;
  entity_type: "product" | "contact" | "invoice" | "payment" | "stock" | "order";
  local_id: string;
  external_id: string;
  external_code?: string | null;
  match_method: string;
  match_status: "matched" | "pending_approval" | "conflict";
  synced_at: string;
}

export interface IntegrationSyncJobRecord {
  id: string;
  provider_key: IntegrationProviderKey;
  direction: SyncDirection;
  entity_types: string[];
  status: SyncJobStatus;
  started_at: string;
  finished_at?: string | null;
  total_count: number;
  success_count: number;
  error_count: number;
  skipped_count: number;
  error_summary?: string | null;
  triggered_by?: string | null;
}

export interface IntegrationLogRecord {
  id: string;
  provider_key: IntegrationProviderKey;
  level: "info" | "warn" | "error";
  action: string;
  message: string;
  record_ref?: string | null;
  created_at: string;
}

export interface IntegrationErrorQueueItem {
  id: string;
  provider_key: IntegrationProviderKey;
  entity_type: string;
  record_ref?: string | null;
  error_type: string;
  error_message: string;
  retry_count: number;
  next_retry_at?: string | null;
  resolved: boolean;
  created_at: string;
}

export interface AdapterTestResult {
  ok: boolean;
  message: string;
  details?: string;
}

export interface AdapterSyncResult {
  status: SyncJobStatus;
  totalCount: number;
  successCount: number;
  errorCount: number;
  skippedCount: number;
  message: string;
  mappings?: Array<Omit<ExternalIdMappingRecord, "id" | "synced_at">>;
  errors?: Array<{ entityType: string; recordRef: string; errorType: string; message: string }>;
}

export interface IntegrationAdapter {
  key: IntegrationProviderKey;
  testConnection: (
    publicConfig: Record<string, string>,
    secrets: Record<string, string>
  ) => Promise<AdapterTestResult>;
  syncData?: (
    publicConfig: Record<string, string>,
    secrets: Record<string, string>,
    options: { direction: SyncDirection; entityTypes: string[] }
  ) => Promise<AdapterSyncResult>;
}

