import { registerPushToken, unregisterPushToken } from "@/services/notifications/pushTokenService";

/**
 * Compatibility layer requested by mobile migration tasks.
 * Delegates to the existing notifications push token service.
 */
export async function registerForPushNotificationsAsync(): Promise<string | null> {
  return registerPushToken();
}

export { unregisterPushToken };
