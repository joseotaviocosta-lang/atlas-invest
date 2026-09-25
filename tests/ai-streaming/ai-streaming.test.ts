import { describe, it, expect } from 'vitest';
import {
  STREAM_SCHEMA_VERSION,
  STREAM_PROGRESS_STAGES,
  STREAM_EVENT_TYPES,
  CANONICAL_PROGRESS_MESSAGES,
  GroundedAiStreamEmitter,
  formatSseEvent,
  parseSseStream,
  GroundedAiStreamEventV1,
  FakeAiProvider,
  GroundedClaimInput,
  GroundedFinancialFact,
  validateGroundedClaims,
  renderValidatedClaims,
} from '@atlas/ai-engine';

describe('AI Engine: Grounded AI Streaming & Resilient Delivery (Phase 3U)', () => {
  describe('Contracts & Schema Constants', () => {
    it('declares frozen STREAM_SCHEMA_VERSION = "1"', () => {
      expect(STREAM_SCHEMA_VERSION).toBe('1');
    });

    it('declares exactly 5 canonical progress stages', () => {
      expect(STREAM_PROGRESS_STAGES).toEqual([
        'CLASSIFYING',
        'GROUNDING',
        'GENERATING',
        'VALIDATING',
        'RENDERING',
      ]);
    });

    it('declares exactly 4 canonical stream event types', () => {
      expect(STREAM_EVENT_TYPES).toEqual(['STARTED', 'PROGRESS', 'FINAL', 'ERROR']);
    });

    it('provides user-facing Portuguese canonical messages for all stages without financial values', () => {
      for (const stage of STREAM_PROGRESS_STAGES) {
        const msg = CANONICAL_PROGRESS_MESSAGES[stage];
        expect(msg).toBeDefined();
        expect(typeof msg).toBe('string');
        expect(msg.length).toBeGreaterThan(5);
        // INVARIANT ADR-200: Progress stage messages must NOT contain numbers/floats/financial values
        expect(msg).not.toMatch(/\d+\.?\d*/);
        expect(msg).not.toMatch(/R\$|BRL|USD|%/);
      }
    });
  });

  describe('Pure SSE Serialization and Parsing (formatSseEvent & parseSseStream)', () => {
    it('serializes events into exact SSE wire format (event: <type>\\ndata: <json>\\n\\n)', () => {
      const event: GroundedAiStreamEventV1 = {
        schemaVersion: '1',
        type: 'STARTED',
        sequence: 1,
        timestamp: '2026-09-25T14:00:00.000Z',
        data: {
          conversationId: 'conv-123',
          portfolioId: 'port-456',
        },
      };

      const formatted = formatSseEvent(event);
      expect(formatted).toBe(
        `event: STARTED\ndata: ${JSON.stringify(event)}\n\n`,
      );
    });

    it('parses raw SSE chunks back into typed stream events', () => {
      const event1: GroundedAiStreamEventV1 = {
        schemaVersion: '1',
        type: 'STARTED',
        sequence: 1,
        timestamp: '2026-09-25T14:00:00.000Z',
        data: { conversationId: 'c1', portfolioId: 'p1' },
      };
      const event2: GroundedAiStreamEventV1 = {
        schemaVersion: '1',
        type: 'PROGRESS',
        sequence: 2,
        timestamp: '2026-09-25T14:00:01.000Z',
        data: {
          stage: 'CLASSIFYING',
          message: 'Analisando sua pergunta...',
        },
      };

      const raw = formatSseEvent(event1) + formatSseEvent(event2);
      const parsed = parseSseStream(raw);

      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toEqual(event1);
      expect(parsed[1]).toEqual(event2);
    });

    it('handles incomplete or empty chunks safely without throwing', () => {
      expect(parseSseStream('')).toEqual([]);
      expect(parseSseStream('   \n\n  ')).toEqual([]);
      expect(parseSseStream('event: UNKNOWN\ndata: not-valid-json\n\n')).toEqual([]);
    });
  });

  describe('GroundedAiStreamEmitter Invariants', () => {
    it('enforces monotonic sequence starting at 1 with strictly consecutive increments', () => {
      const emitted: GroundedAiStreamEventV1[] = [];
      const emitter = new GroundedAiStreamEmitter((chunk) => {
        const parsed = parseSseStream(chunk);
        if (parsed[0]) emitted.push(parsed[0]);
      });

      emitter.emitStarted('c1');
      emitter.emitProgress('CLASSIFYING');
      emitter.emitProgress('GROUNDING');
      emitter.emitProgress('GENERATING');
      emitter.emitProgress('VALIDATING');
      emitter.emitProgress('RENDERING');
      emitter.emitFinal({
        messageId: 'm1',
        conversationId: 'c1',
        turnIndex: 1,
        status: 'ANSWERED',
        intent: 'EXPLAIN_PERFORMANCE',
        answer: 'Sua rentabilidade acumulada foi de 12%.',
        evidence: [],
        claims: [],
        limitations: [],
      });

      expect(emitted).toHaveLength(7);
      expect(emitted.map((e) => e.sequence)).toEqual([1, 2, 3, 4, 5, 6, 7]);
      expect(emitted.map((e) => e.type)).toEqual([
        'STARTED',
        'PROGRESS',
        'PROGRESS',
        'PROGRESS',
        'PROGRESS',
        'PROGRESS',
        'FINAL',
      ]);
      expect(emitter.sequence).toBe(7);
      expect(emitter.completed).toBe(true);
    });

    it('strictly bounds maximum event count to <= 8 events per message stream', () => {
      const emitted: GroundedAiStreamEventV1[] = [];
      const emitter = new GroundedAiStreamEmitter((chunk) => {
        const parsed = parseSseStream(chunk);
        if (parsed[0]) emitted.push(parsed[0]);
      });

      emitter.emitStarted('c1'); // 1
      emitter.emitProgress('CLASSIFYING'); // 2
      emitter.emitProgress('GROUNDING'); // 3
      emitter.emitProgress('GENERATING'); // 4
      emitter.emitProgress('VALIDATING'); // 5
      emitter.emitProgress('RENDERING'); // 6
      emitter.emitFinal({
        messageId: 'm1',
        conversationId: 'c1',
        turnIndex: 1,
        status: 'ANSWERED',
        intent: 'EXPLAIN_PERFORMANCE',
        answer: 'Resultado',
        evidence: [],
        claims: [],
        limitations: [],
      }); // 7

      expect(emitted.length).toBeLessThanOrEqual(8);
      expect(emitted.length).toBe(7);
    });

    it('enforces terminal event locking (FINAL cannot be followed by any event)', () => {
      const emitted: GroundedAiStreamEventV1[] = [];
      const emitter = new GroundedAiStreamEmitter((chunk) => {
        const parsed = parseSseStream(chunk);
        if (parsed[0]) emitted.push(parsed[0]);
      });

      emitter.emitStarted('c1');
      emitter.emitFinal({
        messageId: 'm1',
        conversationId: 'c1',
        turnIndex: 1,
        status: 'ANSWERED',
        intent: 'EXPLAIN_PERFORMANCE',
        answer: 'Final answer',
        evidence: [],
        claims: [],
        limitations: [],
      });

      expect(() => emitter.emitProgress('RENDERING')).toThrow(
        /terminal event has already been emitted/,
      );
      expect(() => emitter.emitError('AI.INTERNAL', 'Another error')).toThrow(
        /terminal event has already been emitted/,
      );
      expect(emitted).toHaveLength(2);
    });

    it('enforces terminal event locking (ERROR cannot be followed by any event)', () => {
      const emitted: GroundedAiStreamEventV1[] = [];
      const emitter = new GroundedAiStreamEmitter((chunk) => {
        const parsed = parseSseStream(chunk);
        if (parsed[0]) emitted.push(parsed[0]);
      });

      emitter.emitStarted('c1');
      emitter.emitProgress('CLASSIFYING');
      emitter.emitError('AI.PROVIDER_TIMEOUT', 'O provedor demorou demais.');

      expect(() => emitter.emitProgress('GROUNDING')).toThrow(
        /terminal event has already been emitted/,
      );
      expect(() =>
        emitter.emitFinal({
          messageId: 'm1',
          conversationId: 'c1',
          turnIndex: 1,
          status: 'ANSWERED',
          intent: 'EXPLAIN_PERFORMANCE',
          answer: 'Test',
          evidence: [],
          claims: [],
          limitations: [],
        }),
      ).toThrow(/terminal event has already been emitted/);
      expect(emitted).toHaveLength(3);
    });

    it('ensures PROGRESS events NEVER contain financial authority or numbers (ADR-200)', () => {
      const emitted: GroundedAiStreamEventV1[] = [];
      const emitter = new GroundedAiStreamEmitter((chunk) => {
        const parsed = parseSseStream(chunk);
        if (parsed[0]) emitted.push(parsed[0]);
      });

      emitter.emitStarted('c1');
      for (const stage of STREAM_PROGRESS_STAGES) {
        emitter.emitProgress(stage);
      }

      const progressEvents = emitted.filter((e) => e.type === 'PROGRESS');
      for (const pe of progressEvents) {
        if (pe.type === 'PROGRESS') {
          // Verify stage payload
          expect(STREAM_PROGRESS_STAGES).toContain(pe.data.stage);
          // Zero numbers or financial strings
          expect(pe.data.message).not.toMatch(/\d/);
          expect(pe.data.message).not.toMatch(/R\$|BRL|USD|%/);
        }
      }
    });
  });

  describe('Server-Side Buffering & Claim Validation Before Delivery (ADR-200)', () => {
    it('buffers provider output and validates canonical facts before emitting FINAL', () => {
      // Canonical grounding fact
      const fact: GroundedFinancialFact = {
        factId: 'BRL.PERFORMANCE.TWR',
        category: 'PERFORMANCE',
        scope: 'BRL',
        metric: 'TWR',
        value: '12.50',
        unit: 'PERCENTAGE',
        nature: 'PERIOD',
        status: 'AVAILABLE',
        source: {
          contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
          path: 'performance.twr',
        },
      };

      // Raw unvalidated model response using structured segments
      const unvalidatedClaims: GroundedClaimInput[] = [
        {
          claimId: 'claim-1',
          type: 'FACTUAL_METRIC',
          factIds: ['BRL.PERFORMANCE.TWR'],
          segments: [
            { type: 'TEXT', text: 'A rentabilidade apurada foi de ' },
            { type: 'FACT_VALUE', factId: 'BRL.PERFORMANCE.TWR' },
            { type: 'TEXT', text: '.' },
          ],
        },
      ];

      // Validate claims strictly against server grounding facts
      const validation = validateGroundedClaims(unvalidatedClaims, { facts: [fact] });
      expect(validation.valid).toBe(true);

      // Render canonical value from validated claims
      const renderedAnswer = renderValidatedClaims(validation.validatedClaims);

      // Verify the rendered answer has the EXACT canonical server value
      expect(renderedAnswer).toBe('A rentabilidade apurada foi de 12,50%.');
      expect(renderedAnswer).not.toContain('18.00');

      // Now emit via stream
      const emitted: GroundedAiStreamEventV1[] = [];
      const emitter = new GroundedAiStreamEmitter((chunk) => {
        const parsed = parseSseStream(chunk);
        if (parsed[0]) emitted.push(parsed[0]);
      });

      emitter.emitStarted('c1');
      emitter.emitProgress('GENERATING');
      emitter.emitProgress('VALIDATING');
      emitter.emitProgress('RENDERING');
      emitter.emitFinal({
        messageId: 'm1',
        conversationId: 'c1',
        turnIndex: 1,
        status: 'ANSWERED',
        intent: 'EXPLAIN_PERFORMANCE',
        answer: renderedAnswer,
        evidence: [
          {
            factId: fact.factId,
            category: fact.category,
            scope: fact.scope,
            metric: fact.metric,
            value: fact.value,
            unit: fact.unit,
            nature: fact.nature,
            status: fact.status,
          },
        ],
        claims: validation.validatedClaims,
        limitations: [],
      });

      const finalEvent = emitted.find((e) => e.type === 'FINAL');
      expect(finalEvent).toBeDefined();
      if (finalEvent && finalEvent.type === 'FINAL') {
        expect(finalEvent.data.answer).toBe(
          'A rentabilidade apurada foi de 12,50%.',
        );
        expect(finalEvent.data.claims).toHaveLength(1);
        expect(finalEvent.data.claims[0]!.renderedText).toBe(
          'A rentabilidade apurada foi de 12,50%.',
        );
      }
    });

    it('rejects hallucinated citedFactId and prevents emitting corrupted FINAL', () => {
      const fact: GroundedFinancialFact = {
        factId: 'BRL.PERFORMANCE.TWR',
        category: 'PERFORMANCE',
        scope: 'BRL',
        metric: 'TWR',
        value: '12.50',
        unit: 'PERCENTAGE',
        nature: 'PERIOD',
        status: 'AVAILABLE',
        source: {
          contract: 'PORTFOLIO_INTELLIGENCE_SUMMARY_V1',
          path: 'performance.twr',
        },
      };

      const invalidClaims: GroundedClaimInput[] = [
        {
          claimId: 'claim-2',
          type: 'FACTUAL_METRIC',
          factIds: ['BRL.NON_EXISTENT.FACT'],
          segments: [
            { type: 'TEXT', text: 'Fato inexistente ' },
            { type: 'FACT_VALUE', factId: 'BRL.NON_EXISTENT.FACT' },
            { type: 'TEXT', text: '.' },
          ],
        },
      ];

      const validation = validateGroundedClaims(invalidClaims, { facts: [fact] });
      expect(validation.valid).toBe(false);
      expect(validation.invalidReasons[0]).toMatch(/UNKNOWN_FACT_ID/);

      const emitted: GroundedAiStreamEventV1[] = [];
      const emitter = new GroundedAiStreamEmitter((chunk) => {
        const parsed = parseSseStream(chunk);
        if (parsed[0]) emitted.push(parsed[0]);
      });

      emitter.emitStarted('c1');
      emitter.emitProgress('VALIDATING');
      emitter.emitError(
        'AI.VALIDATION_FAILED',
        'A resposta gerada continha referências inválidas e foi bloqueada.',
      );

      expect(emitted).toHaveLength(3);
      expect(emitted[2]!.type).toBe('ERROR');
      expect(emitted.some((e) => e.type === 'FINAL')).toBe(false);
    });
  });

  describe('FakeAiProvider Signal & Abort Resiliency', () => {
    it('supports signal abort in FakeAiProvider', async () => {
      const provider = new FakeAiProvider({
        scenario: 'SUCCESS_ANSWER',
        delayMs: 100,
      });

      const controller = new AbortController();
      // abort immediately
      controller.abort();

      await expect(
        provider.complete(
          {
            systemPrompt: 'System',
            userPrompt: 'Prompt',
          },
          { signal: controller.signal },
        ),
      ).rejects.toThrow(/aborted/i);
    });

    it('aborts mid-flight when delayMs is active', async () => {
      const provider = new FakeAiProvider({
        scenario: 'SUCCESS_ANSWER',
        delayMs: 200,
      });

      const controller = new AbortController();
      setTimeout(() => controller.abort(), 20);

      await expect(
        provider.complete(
          {
            systemPrompt: 'System',
            userPrompt: 'Prompt',
          },
          { signal: controller.signal },
        ),
      ).rejects.toThrow(/aborted/i);
    });
  });
});
