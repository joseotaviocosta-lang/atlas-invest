import { Injectable } from '@nestjs/common';
import { logger } from '@atlas/logger';
import { AiExecutionTelemetryV1 } from '@atlas/ai-engine';

export const AI_TELEMETRY_SINK_TOKEN = Symbol('AI_TELEMETRY_SINK_TOKEN');

export interface AiTelemetrySink {
  record(telemetry: AiExecutionTelemetryV1): void | Promise<void>;
}

/**
 * Concrete Logging AI Telemetry Sink (Phase 3V, ADR-204, ADR-205).
 * Dispatches structured, privacy-safe telemetry events through the central Atlas Logger.
 *
 * Invariants:
 * - Emits canonical structured log events: AI_EXECUTION_COMPLETED or AI_EXECUTION_FAILED.
 * - Zero raw prompts, zero raw grounding facts, zero rendered answer text, zero PII.
 * - Fail-open: any exception encountered during emission is isolated and does not break user answers.
 */
@Injectable()
export class LoggingAiTelemetrySink implements AiTelemetrySink {
  record(telemetry: AiExecutionTelemetryV1): void {
    try {
      const isSuccess = telemetry.status === 'ANSWERED' || telemetry.status === 'UNSUPPORTED';
      const eventName = isSuccess ? 'AI_EXECUTION_COMPLETED' : 'AI_EXECUTION_FAILED';

      const payload = {
        requestId: telemetry.requestId,
        operation: telemetry.operation,
        deliveryMode: telemetry.deliveryMode,
        intent: telemetry.intent,
        status: telemetry.status,
        provider: telemetry.provider,
        model: telemetry.model,
        totalMs: telemetry.durations.totalMs,
        providerMs: telemetry.durations.providerMs,
        inputTokens: telemetry.usage.inputTokens,
        outputTokens: telemetry.usage.outputTokens,
        totalTokens: telemetry.usage.totalTokens,
        usageSource: telemetry.usage.source,
        groundingCallCount: telemetry.counts.groundingCallCount,
        providerCallCount: telemetry.counts.providerCallCount,
        claimCount: telemetry.counts.claimCount,
        evidenceCount: telemetry.counts.evidenceCount,
        streamEventCount: telemetry.counts.streamEventCount,
        errorCode: telemetry.errorCode,
        retryable: telemetry.retryable,
      };

      if (isSuccess) {
        logger.info(eventName, payload);
      } else {
        logger.warn(eventName, payload);
      }
    } catch {
      // Fail-open guarantee: sink failure MUST NEVER throw or affect caller
    }
  }
}
