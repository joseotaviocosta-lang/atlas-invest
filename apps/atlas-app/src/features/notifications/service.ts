import type {
  LocalNotification,
  NotificationPermissionState,
  NotificationService,
} from './types';
import { stringToNumericId } from './engine';

function isTauriEnvironment(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(
    (window as unknown as { __TAURI_INTERNALS__?: unknown }).__TAURI_INTERNALS__ ||
    (window as unknown as { __TAURI__?: unknown }).__TAURI__
  );
}

/**
 * In-memory notification service for testing, headless runners, and fallbacks.
 */
export class MemoryNotificationService implements NotificationService {
  private permissionState: NotificationPermissionState = 'default';
  public sentNotifications: LocalNotification[] = [];
  public scheduledNotifications: LocalNotification[] = [];

  isSupported(): boolean {
    return true;
  }

  setMockPermission(state: NotificationPermissionState): void {
    this.permissionState = state;
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    if (this.permissionState === 'default' || this.permissionState === 'prompt') {
      this.permissionState = 'granted';
    }
    return this.permissionState;
  }

  async getPermissionState(): Promise<NotificationPermissionState> {
    return this.permissionState;
  }

  async send(notification: LocalNotification): Promise<boolean> {
    if (this.permissionState === 'denied') {
      return false;
    }
    this.sentNotifications.push({ ...notification });
    return true;
  }

  async schedule(notification: LocalNotification): Promise<boolean> {
    if (this.permissionState === 'denied') {
      return false;
    }
    this.scheduledNotifications.push({ ...notification });
    return true;
  }

  async cancel(id: string): Promise<void> {
    this.scheduledNotifications = this.scheduledNotifications.filter((n) => n.id !== id);
  }

  async cancelAll(): Promise<void> {
    this.scheduledNotifications = [];
  }

  clear(): void {
    this.sentNotifications = [];
    this.scheduledNotifications = [];
  }
}

/**
 * Native Tauri 2 Notification Service.
 * Leverages @tauri-apps/plugin-notification on Windows and Android.
 */
export class TauriNotificationService implements NotificationService {
  private channelsCreated = false;
  private onActionUnlisten: (() => void) | null = null;
  private actionCallback: ((deepLink?: string) => void) | null = null;

  isSupported(): boolean {
    return isTauriEnvironment();
  }

  onNotificationAction(cb: (deepLink?: string) => void): void {
    this.actionCallback = cb;
  }

  private async ensureChannels(): Promise<void> {
    if (this.channelsCreated) return;
    try {
      const { createChannel, Importance, Visibility } = await import(
        '@tauri-apps/plugin-notification'
      );

      // Create Android Notification Channels with Privacy Protection
      await createChannel({
        id: 'fiscal-reminders',
        name: 'Lembretes Fiscais e DARF',
        description: 'Notificações de obrigações tributárias e prazos de apuração',
        importance: Importance.Default,
        visibility: Visibility.Private,
      });

      await createChannel({
        id: 'reconciliation-reviews',
        name: 'Conciliação e Importação',
        description: 'Notificações de revisão de divergências e sincronização',
        importance: Importance.Default,
        visibility: Visibility.Private,
      });

      this.channelsCreated = true;
    } catch {
      // Ignored if desktop (Windows) where channels are not applicable
      this.channelsCreated = true;
    }
  }

  private async setupActionListener(): Promise<void> {
    if (this.onActionUnlisten) return;
    try {
      const { onAction } = await import('@tauri-apps/plugin-notification');
      const unlisten = await onAction((event) => {
        const extra = event.notification?.extra as Record<string, unknown> | undefined;
        const deepLink = extra?.deepLink as string | undefined;
        if (deepLink && this.actionCallback) {
          this.actionCallback(deepLink);
        }
      });
      this.onActionUnlisten = () => {
        void unlisten.unregister();
      };
    } catch {
      // Ignore if listener cannot be bound
    }
  }

  async requestPermission(): Promise<NotificationPermissionState> {
    try {
      const { requestPermission } = await import('@tauri-apps/plugin-notification');
      const state = await requestPermission();
      if (state === 'granted') {
        await this.ensureChannels();
        await this.setupActionListener();
        return 'granted';
      }
      if (state === 'denied') return 'denied';
      return 'default';
    } catch {
      return 'denied';
    }
  }

  async getPermissionState(): Promise<NotificationPermissionState> {
    try {
      const { isPermissionGranted } = await import('@tauri-apps/plugin-notification');
      const granted = await isPermissionGranted();
      return granted ? 'granted' : 'default';
    } catch {
      return 'default';
    }
  }

  async send(notification: LocalNotification): Promise<boolean> {
    try {
      const { sendNotification, isPermissionGranted, Visibility } = await import(
        '@tauri-apps/plugin-notification'
      );

      const hasPermission = await isPermissionGranted();
      if (!hasPermission) {
        return false;
      }

      await this.ensureChannels();
      await this.setupActionListener();

      const numericId = notification.numericId ?? stringToNumericId(notification.id);
      const channelId =
        notification.category === 'RECONCILIATION_REVIEW'
          ? 'reconciliation-reviews'
          : 'fiscal-reminders';

      sendNotification({
        id: numericId,
        channelId,
        title: notification.title,
        body: notification.body,
        visibility: Visibility.Private, // Hide details from lock screen
        extra: {
          deepLink: notification.deepLink,
          category: notification.category,
          notificationId: notification.id,
        },
      });

      return true;
    } catch {
      return false;
    }
  }

  async schedule(notification: LocalNotification): Promise<boolean> {
    // OS scheduled notification fallback to direct send when due
    return this.send(notification);
  }

  async cancel(id: string): Promise<void> {
    try {
      const { cancel } = await import('@tauri-apps/plugin-notification');
      const numericId = stringToNumericId(id);
      await cancel([numericId]);
    } catch {
      // Ignore
    }
  }

  async cancelAll(): Promise<void> {
    try {
      const { cancelAll } = await import('@tauri-apps/plugin-notification');
      await cancelAll();
    } catch {
      // Ignore
    }
  }
}

// Global service instance
let currentService: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!currentService) {
    if (isTauriEnvironment()) {
      currentService = new TauriNotificationService();
    } else {
      currentService = new MemoryNotificationService();
    }
  }
  return currentService;
}

export function setCustomNotificationService(service: NotificationService | null): void {
  currentService = service;
}
