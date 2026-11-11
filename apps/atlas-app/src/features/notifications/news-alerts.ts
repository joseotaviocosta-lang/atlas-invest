import type {
  PortfolioNewsAlertCandidateDto,
  PortfolioNewsInboxResponseDto,
} from '../portfolio/types';
import type {
  LocalNotification,
  MaterialNewsAlertThreshold,
  NotificationPreferences,
  NotificationService,
} from './types';
import { stringToNumericId } from './engine';
import { getNotificationService } from './service';
import { notificationCenter } from './notification-center';

export type ClientNewsAlertDeliveryStatus =
  | 'DELIVERED'
  | 'NOTIFICATIONS_PERMISSION_DENIED'
  | 'NOTIFICATIONS_UNSUPPORTED'
  | 'NOTIFICATIONS_UNAVAILABLE'
  | 'DELIVERY_FAILED'
  | 'DISABLED'
  | 'NO_ELIGIBLE_EVENTS';

export type ClientNewsAlertType =
  | 'CRITICAL_NEW'
  | 'CRITICAL_UPDATE'
  | 'MATERIAL_NEW'
  | 'MATERIAL_UPDATE'
  | 'MATERIAL_BATCH_SUMMARY';

export interface ClientNewsAlertPayload {
  kind: 'SINGLE' | 'BATCH';
  type: ClientNewsAlertType;
  title: string;
  body: string;
  deepLink: string;
  severity: 'HIGH' | 'NORMAL';
  coveredEventKeys: Array<{
    canonicalEventId: string;
    eventVersionFingerprint: string;
  }>;
  candidates: PortfolioNewsAlertCandidateDto[];
}

export interface ClientNewsAlertDeliveryResult {
  status: ClientNewsAlertDeliveryStatus;
  reason?: string;
}

export interface ClientNewsAlertNotifier {
  notifyMaterialNews(payload: ClientNewsAlertPayload): Promise<ClientNewsAlertDeliveryResult>;
}

export interface NewsAlertCoordinatorPorts {
  claimPendingAlerts(
    portfolioId: string,
    items: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>,
  ): Promise<Array<{ canonicalEventId: string; eventVersionFingerprint: string }>>;
  confirmAlertsDelivered(
    portfolioId: string,
    items: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>,
  ): Promise<void>;
  releaseAlertsClaim(
    portfolioId: string,
    items: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>,
  ): Promise<void>;
  suppressBaseline(
    portfolioId: string,
    items: Array<{ canonicalEventId: string; eventVersionFingerprint: string }>,
  ): Promise<void>;
}

export interface NewsAlertProcessingDiagnostics {
  eligibleAlerts: number;
  deliveredAlerts: number;
  suppressedAlreadyDelivered: number;
  suppressedByMateriality: number;
  notificationStatus: ClientNewsAlertDeliveryStatus;
}

const portfolioMutexTail = new Map<string, Promise<unknown>>();

/**
 * Serializes alert evaluation per portfolio within the Desktop runtime to prevent race conditions
 * across overlapping fetches/refreshes.
 */
export function withPortfolioNewsAlertMutex<T>(
  portfolioId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const prev = portfolioMutexTail.get(portfolioId) ?? Promise.resolve();
  const next = prev.catch(() => undefined).then(fn);
  const tail = next.then(
    () => undefined,
    () => undefined,
  );
  portfolioMutexTail.set(portfolioId, tail);
  void tail.finally(() => {
    if (portfolioMutexTail.get(portfolioId) === tail) {
      portfolioMutexTail.delete(portfolioId);
    }
  });
  return next;
}

function isCandidateMaterialityEligible(
  materiality: PortfolioNewsAlertCandidateDto['materiality'],
  threshold: MaterialNewsAlertThreshold,
): boolean {
  if (threshold === 'CRITICAL_ONLY') return materiality === 'CRITICAL';
  if (threshold === 'HIGH_AND_CRITICAL') return materiality === 'CRITICAL' || materiality === 'HIGH';
  return materiality === 'CRITICAL' || materiality === 'HIGH' || materiality === 'MEDIUM';
}

function buildSinglePayload(candidate: PortfolioNewsAlertCandidateDto): ClientNewsAlertPayload {
  const isCritical = candidate.materiality === 'CRITICAL';
  const isUpdated = candidate.state === 'UPDATED';
  const provenanceLine =
    candidate.official && candidate.officialSourceLabel
      ? `\nFonte oficial: ${candidate.officialSourceLabel}`
      : '';

  if (isCritical) {
    const detail = isUpdated
      ? `Atualização importante — ${candidate.ticker}\n${candidate.materialityReason || candidate.headline}`
      : `${candidate.ticker}\n${candidate.materialityReason || candidate.headline}`;
    return {
      kind: 'SINGLE',
      type: isUpdated ? 'CRITICAL_UPDATE' : 'CRITICAL_NEW',
      title: 'Atlas Invest — Evento crítico',
      body: `${detail}${provenanceLine}`,
      deepLink: '/today',
      severity: 'HIGH',
      coveredEventKeys: [
        {
          canonicalEventId: candidate.canonicalEventId,
          eventVersionFingerprint: candidate.eventVersionFingerprint,
        },
      ],
      candidates: [candidate],
    };
  }

  return {
    kind: 'SINGLE',
    type: isUpdated ? 'MATERIAL_UPDATE' : 'MATERIAL_NEW',
    title: 'Atlas Invest',
    body: isUpdated
      ? `Atualização importante — ${candidate.ticker}\n${candidate.headline}${provenanceLine}`
      : `${candidate.ticker} — Nova notícia de alta relevância\n${candidate.headline}${provenanceLine}`,
    deepLink: '/today',
    severity: 'HIGH',
    coveredEventKeys: [
      {
        canonicalEventId: candidate.canonicalEventId,
        eventVersionFingerprint: candidate.eventVersionFingerprint,
      },
    ],
    candidates: [candidate],
  };
}

export function buildClientMaterialNewsAlertPayloads(
  candidates: ReadonlyArray<PortfolioNewsAlertCandidateDto>,
): ClientNewsAlertPayload[] {
  if (candidates.length === 0) return [];

  const critical = candidates.filter((c) => c.materiality === 'CRITICAL');
  const nonCritical = candidates.filter((c) => c.materiality !== 'CRITICAL');
  const payloads: ClientNewsAlertPayload[] = [];

  for (const crit of critical) {
    payloads.push(buildSinglePayload(crit));
  }

  if (nonCritical.length === 0) return payloads;

  if (nonCritical.length <= 3) {
    for (const item of nonCritical) {
      payloads.push(buildSinglePayload(item));
    }
    return payloads;
  }

  const uniqueTickers = Array.from(new Set(nonCritical.map((c) => c.ticker)));
  const previewTickers = uniqueTickers.slice(0, 3);
  const remaining = Math.max(0, nonCritical.length - previewTickers.length);
  const tickerLine =
    remaining > 0
      ? `${previewTickers.join(', ')} e mais ${remaining}.`
      : `${previewTickers.join(', ')}.`;

  payloads.push({
    kind: 'BATCH',
    type: 'MATERIAL_BATCH_SUMMARY',
    title: 'Atlas Invest',
    body: `${nonCritical.length} novas notícias relevantes na sua carteira.\n${tickerLine}`,
    deepLink: '/today',
    severity: 'HIGH',
    coveredEventKeys: nonCritical.map((c) => ({
      canonicalEventId: c.canonicalEventId,
      eventVersionFingerprint: c.eventVersionFingerprint,
    })),
    candidates: [...nonCritical],
  });

  return payloads;
}

/**
 * Adapter bridging @atlas/app NotificationService (Tauri or Memory in tests)
 * to the APP-16N delivery contract.
 */
export class DesktopServiceNewsAlertNotifier implements ClientNewsAlertNotifier {
  constructor(private readonly serviceProvider: () => NotificationService = getNotificationService) {}

  async notifyMaterialNews(payload: ClientNewsAlertPayload): Promise<ClientNewsAlertDeliveryResult> {
    const service = this.serviceProvider();
    if (!service.isSupported()) {
      return {
        status: 'NOTIFICATIONS_UNAVAILABLE',
        reason: 'Notifications not supported on this environment',
      };
    }

    const perm = await service.getPermissionState();
    if (perm !== 'granted') {
      return {
        status: 'NOTIFICATIONS_PERMISSION_DENIED',
        reason: `OS notification permission state is '${perm}'`,
      };
    }

    const identity =
      payload.kind === 'BATCH'
        ? `news_batch_${payload.coveredEventKeys.map((k) => k.eventVersionFingerprint.slice(0, 8)).join('_')}`
        : `news_${payload.coveredEventKeys[0]!.canonicalEventId}_${payload.coveredEventKeys[0]!.eventVersionFingerprint.slice(0, 12)}`;

    const notification: LocalNotification = {
      id: identity,
      numericId: stringToNumericId(identity),
      title: payload.title,
      body: payload.body,
      category: 'MATERIAL_NEWS',
      severity: payload.severity,
      deepLink: payload.deepLink,
      createdAt: Date.now(),
    };

    try {
      const ok = await service.send(notification);
      if (!ok) {
        return {
          status: 'DELIVERY_FAILED',
          reason: 'Notification service returned false',
        };
      }
      return { status: 'DELIVERED' };
    } catch (error) {
      return {
        status: 'DELIVERY_FAILED',
        reason: error instanceof Error ? error.message : 'Notification dispatch error',
      };
    }
  }
}

export async function processPortfolioNewsAlerts(params: {
  portfolioId: string;
  userId?: string | null;
  inbox: PortfolioNewsInboxResponseDto;
  preferences: NotificationPreferences;
  ports?: NewsAlertCoordinatorPorts;
  notifier?: ClientNewsAlertNotifier;
  recordInNotificationCenter?: boolean;
}): Promise<NewsAlertProcessingDiagnostics> {
  const {
    portfolioId,
    userId,
    inbox,
    preferences,
    ports,
    notifier = new DesktopServiceNewsAlertNotifier(),
    recordInNotificationCenter = true,
  } = params;

  return withPortfolioNewsAlertMutex(portfolioId, async () => {
    const rawCandidates = inbox.alertsMeta?.eligibleEvents ?? [];
    const threshold: MaterialNewsAlertThreshold = preferences.materialNewsThreshold ?? 'HIGH_AND_CRITICAL';

    const byThreshold: PortfolioNewsAlertCandidateDto[] = [];
    let suppressedByMateriality = 0;

    for (const c of rawCandidates) {
      if (isCandidateMaterialityEligible(c.materiality, threshold)) {
        byThreshold.push(c);
      } else {
        suppressedByMateriality++;
      }
    }

    // Never retroactively fire for versions observed before alerts were turned ON
    const activatedAtMs = preferences.materialNewsAlertsActivatedAt
      ? Date.parse(preferences.materialNewsAlertsActivatedAt)
      : NaN;

    const eventLookup = new Map(
      inbox.events.map((ev) => [ev.canonicalEventId || ev.id, ev]),
    );

    const eligibleAfterActivation: PortfolioNewsAlertCandidateDto[] = [];
    let suppressedAlreadyDelivered = 0;

    for (const cand of byThreshold) {
      if (Number.isFinite(activatedAtMs)) {
        const ev = eventLookup.get(cand.canonicalEventId);
        const versionIso =
          cand.state === 'NEW'
            ? (ev?.firstSeenAt ?? cand.publishedAt)
            : (ev?.lastObservedAt ?? ev?.firstSeenAt ?? cand.publishedAt);
        const versionMs = Date.parse(versionIso);
        if (Number.isFinite(versionMs) && versionMs <= activatedAtMs) {
          suppressedAlreadyDelivered++;
          continue;
        }
      }
      eligibleAfterActivation.push(cand);
    }

    const suppressedMetrics = inbox.events.filter(
      (e) =>
        (e.state === 'NEW' || e.state === 'UPDATED') &&
        !isCandidateMaterialityEligible(e.materiality ?? 'MEDIUM', threshold),
    ).length;

    const totalSuppressedByMateriality = Math.max(suppressedByMateriality, suppressedMetrics);

    if (eligibleAfterActivation.length === 0) {
      return {
        eligibleAlerts: 0,
        deliveredAlerts: 0,
        suppressedAlreadyDelivered,
        suppressedByMateriality: totalSuppressedByMateriality,
        notificationStatus: 'NO_ELIGIBLE_EVENTS',
      };
    }

    if (!preferences.enabled || !preferences.materialNewsAlerts) {
      if (ports) {
        try {
          await ports.suppressBaseline(
            portfolioId,
            eligibleAfterActivation.map((c) => ({
              canonicalEventId: c.canonicalEventId,
              eventVersionFingerprint: c.eventVersionFingerprint,
            })),
          );
        } catch {
          // Non-fatal: alerts stay disabled and inbox remains intact
        }
      }

      return {
        eligibleAlerts: eligibleAfterActivation.length,
        deliveredAlerts: 0,
        suppressedAlreadyDelivered,
        suppressedByMateriality: totalSuppressedByMateriality,
        notificationStatus: 'DISABLED',
      };
    }

    // Fail-closed pre-flight check before claiming in Postgres when using default OS service
    if (!params.notifier && !getNotificationService().isSupported()) {
      return {
        eligibleAlerts: eligibleAfterActivation.length,
        deliveredAlerts: 0,
        suppressedAlreadyDelivered,
        suppressedByMateriality: totalSuppressedByMateriality,
        notificationStatus: 'NOTIFICATIONS_UNAVAILABLE',
      };
    }

    let claimedCandidates = eligibleAfterActivation;
    if (ports) {
      const claimed = await ports.claimPendingAlerts(
        portfolioId,
        eligibleAfterActivation.map((c) => ({
          canonicalEventId: c.canonicalEventId,
          eventVersionFingerprint: c.eventVersionFingerprint,
        })),
      );
      const claimedSet = new Set(
        claimed.map((k) => `${k.canonicalEventId}::${k.eventVersionFingerprint}`),
      );
      claimedCandidates = eligibleAfterActivation.filter((c) =>
        claimedSet.has(`${c.canonicalEventId}::${c.eventVersionFingerprint}`),
      );
      suppressedAlreadyDelivered += eligibleAfterActivation.length - claimedCandidates.length;

      if (claimedCandidates.length === 0) {
        return {
          eligibleAlerts: 0,
          deliveredAlerts: 0,
          suppressedAlreadyDelivered,
          suppressedByMateriality: totalSuppressedByMateriality,
          notificationStatus: 'NO_ELIGIBLE_EVENTS',
        };
      }
    }

    const payloads = buildClientMaterialNewsAlertPayloads(claimedCandidates);
    const deliveredKeys: Array<{ canonicalEventId: string; eventVersionFingerprint: string }> = [];
    const failedKeys: Array<{ canonicalEventId: string; eventVersionFingerprint: string }> = [];
    let finalStatus: ClientNewsAlertDeliveryStatus = 'DELIVERY_FAILED';

    for (let i = 0; i < payloads.length; i++) {
      const payload = payloads[i]!;
      let res: ClientNewsAlertDeliveryResult;
      try {
        res = await notifier.notifyMaterialNews(payload);
      } catch (err) {
        res = {
          status: 'DELIVERY_FAILED',
          reason: err instanceof Error ? err.message : 'Notification dispatch threw error',
        };
      }

      if (res.status === 'DELIVERED') {
        deliveredKeys.push(...payload.coveredEventKeys);
        finalStatus = 'DELIVERED';

        if (recordInNotificationCenter && userId) {
          const histId =
            payload.kind === 'BATCH'
              ? `news_batch_${payload.coveredEventKeys.map((k) => k.eventVersionFingerprint.slice(0, 8)).join('_')}`
              : `news_${payload.coveredEventKeys[0]!.canonicalEventId}_${payload.coveredEventKeys[0]!.eventVersionFingerprint.slice(0, 12)}`;
          notificationCenter.addNotification(userId, {
            id: histId,
            title: payload.title,
            body: payload.body,
            category: 'MATERIAL_NEWS',
            severity: payload.severity,
            deepLink: payload.deepLink,
            createdAt: Date.now(),
          });
        }
      } else {
        failedKeys.push(...payload.coveredEventKeys);
        if (deliveredKeys.length === 0) {
          finalStatus = res.status;
        }
        if (
          res.status === 'NOTIFICATIONS_PERMISSION_DENIED' ||
          res.status === 'NOTIFICATIONS_UNSUPPORTED' ||
          res.status === 'NOTIFICATIONS_UNAVAILABLE'
        ) {
          for (let j = i + 1; j < payloads.length; j++) {
            failedKeys.push(...payloads[j]!.coveredEventKeys);
          }
          break;
        }
      }
    }

    if (ports) {
      if (deliveredKeys.length > 0) {
        await ports.confirmAlertsDelivered(portfolioId, deliveredKeys);
      }
      if (failedKeys.length > 0) {
        await ports.releaseAlertsClaim(portfolioId, failedKeys);
      }
    }

    const diagnostics: NewsAlertProcessingDiagnostics = {
      eligibleAlerts: claimedCandidates.length,
      deliveredAlerts: deliveredKeys.length,
      suppressedAlreadyDelivered,
      suppressedByMateriality: totalSuppressedByMateriality,
      notificationStatus: deliveredKeys.length > 0 ? 'DELIVERED' : finalStatus,
    };

    if (typeof import.meta !== 'undefined' && import.meta.env?.DEV) {
      console.info('[APP-16N][NewsAlerts]', diagnostics);
    }

    return diagnostics;
  });
}
