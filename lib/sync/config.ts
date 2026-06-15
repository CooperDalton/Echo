import * as FileSystem from 'expo-file-system/legacy';

import type { EchoSyncConfig } from '@/lib/sync/types';

const CONFIG_FILE = `${FileSystem.documentDirectory ?? ''}echo-config-v1.json`;

type PartialConfig = Partial<EchoSyncConfig>;

function trimEnv(value: string | undefined): string | null {
  if (!value) return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function createDeviceId(): string {
  return `device-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function defaultConfig(): EchoSyncConfig {
  return {
    apiBaseUrl: trimEnv(process.env.EXPO_PUBLIC_ECHO_API_URL),
    deviceId: createDeviceId(),
    syncEnabled: true,
    aiCategorizationEnabled: true,
  };
}

function normalizeConfig(input: PartialConfig | null | undefined): EchoSyncConfig {
  const defaults = defaultConfig();

  return {
    apiBaseUrl:
      typeof input?.apiBaseUrl === 'string' ? input.apiBaseUrl.trim() || null : defaults.apiBaseUrl,
    deviceId:
      typeof input?.deviceId === 'string' && input.deviceId.trim().length > 0
        ? input.deviceId.trim()
        : defaults.deviceId,
    syncEnabled: typeof input?.syncEnabled === 'boolean' ? input.syncEnabled : defaults.syncEnabled,
    aiCategorizationEnabled:
      typeof input?.aiCategorizationEnabled === 'boolean'
        ? input.aiCategorizationEnabled
        : defaults.aiCategorizationEnabled,
  };
}

export function isSyncConfigured(config: EchoSyncConfig): boolean {
  return Boolean(config.syncEnabled && config.apiBaseUrl && config.deviceId);
}

export function syncPendingReason(config: EchoSyncConfig): string | null {
  if (!config.syncEnabled) return 'Sync is disabled on this device.';
  if (!config.apiBaseUrl) return 'Set EXPO_PUBLIC_ECHO_API_URL to reach your backend.';
  return null;
}

export async function loadSyncConfig(): Promise<EchoSyncConfig> {
  const defaults = defaultConfig();
  if (!CONFIG_FILE) return defaults;

  try {
    const info = await FileSystem.getInfoAsync(CONFIG_FILE);
    if (!info.exists) {
      await saveSyncConfig(defaults);
      return defaults;
    }

    const raw = await FileSystem.readAsStringAsync(CONFIG_FILE);
    const parsed = JSON.parse(raw) as PartialConfig;
    const normalized = normalizeConfig(parsed);
    await saveSyncConfig(normalized);
    return normalized;
  } catch {
    return defaults;
  }
}

export async function saveSyncConfig(config: EchoSyncConfig): Promise<void> {
  if (!CONFIG_FILE) return;

  try {
    await FileSystem.writeAsStringAsync(CONFIG_FILE, JSON.stringify(config, null, 2));
  } catch {
    // Keep runtime config even when persistence fails.
  }
}
