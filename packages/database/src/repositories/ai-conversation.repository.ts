import { PrismaClient, Prisma } from '@prisma/client';
import {
  IAiConversationRepository,
  AiConversationRecord,
  AiConversationMessageRecord,
  CreateAiConversationData,
  CreateAiConversationMessageData,
} from './interfaces';
import { getPrismaClient } from '../client';

export class AiConversationRepository implements IAiConversationRepository {
  constructor(private readonly prisma: PrismaClient = getPrismaClient()) {}

  async createConversation(data: CreateAiConversationData): Promise<AiConversationRecord> {
    const raw = await this.prisma.aiConversation.create({
      data: {
        userId: data.userId,
        portfolioId: data.portfolioId,
        title: data.title ?? null,
      },
    });

    return {
      id: raw.id,
      userId: raw.userId,
      portfolioId: raw.portfolioId,
      title: raw.title,
      archivedAt: raw.archivedAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  async findConversationById(
    id: string,
    portfolioId: string,
    userId: string,
  ): Promise<AiConversationRecord | null> {
    const raw = await this.prisma.aiConversation.findFirst({
      where: {
        id,
        portfolioId,
        userId,
      },
    });

    if (!raw) return null;

    return {
      id: raw.id,
      userId: raw.userId,
      portfolioId: raw.portfolioId,
      title: raw.title,
      archivedAt: raw.archivedAt,
      createdAt: raw.createdAt,
      updatedAt: raw.updatedAt,
    };
  }

  async listConversations(
    portfolioId: string,
    userId: string,
    options?: { limit?: number; cursor?: string; includeArchived?: boolean },
  ): Promise<{ items: AiConversationRecord[]; nextCursor?: string; hasMore: boolean }> {
    const limit = options?.limit ?? 20;
    const where: Prisma.AiConversationWhereInput = {
      portfolioId,
      userId,
    };

    if (!options?.includeArchived) {
      where.archivedAt = null;
    }

    const items = await this.prisma.aiConversation.findMany({
      where,
      orderBy: { updatedAt: 'desc' },
      take: limit + 1,
      ...(options?.cursor
        ? {
            skip: 1,
            cursor: { id: options.cursor },
          }
        : {}),
    });

    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? resultItems[resultItems.length - 1]?.id : undefined;

    return {
      items: resultItems.map((raw) => ({
        id: raw.id,
        userId: raw.userId,
        portfolioId: raw.portfolioId,
        title: raw.title,
        archivedAt: raw.archivedAt,
        createdAt: raw.createdAt,
        updatedAt: raw.updatedAt,
      })),
      nextCursor,
      hasMore,
    };
  }

  async archiveConversation(id: string, portfolioId: string, userId: string): Promise<boolean> {
    const existing = await this.findConversationById(id, portfolioId, userId);
    if (!existing) return false;

    await this.prisma.aiConversation.update({
      where: { id },
      data: { archivedAt: new Date() },
    });
    return true;
  }

  async listMessages(
    conversationId: string,
    options?: { limit?: number; cursor?: string; order?: 'asc' | 'desc' },
  ): Promise<{ items: AiConversationMessageRecord[]; nextCursor?: string; hasMore: boolean }> {
    const limit = options?.limit ?? 50;
    const order = options?.order ?? 'asc';

    const items = await this.prisma.aiConversationMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: order },
      take: limit + 1,
      ...(options?.cursor
        ? {
            skip: 1,
            cursor: { id: options.cursor },
          }
        : {}),
    });

    const hasMore = items.length > limit;
    const resultItems = hasMore ? items.slice(0, limit) : items;
    const nextCursor = hasMore ? resultItems[resultItems.length - 1]?.id : undefined;

    return {
      items: resultItems.map((raw) => ({
        id: raw.id,
        conversationId: raw.conversationId,
        role: raw.role as 'USER' | 'ASSISTANT',
        content: raw.content,
        status: raw.status as 'ANSWERED' | 'UNSUPPORTED' | 'PROVIDER_ERROR',
        intent: raw.intent,
        evidenceSnapshot: raw.evidenceSnapshot,
        limitations: raw.limitations,
        provider: raw.provider,
        model: raw.model,
        providerRequestId: raw.providerRequestId,
        createdAt: raw.createdAt,
      })),
      nextCursor,
      hasMore,
    };
  }

  async appendMessage(
    conversationId: string,
    data: CreateAiConversationMessageData,
  ): Promise<AiConversationMessageRecord> {
    const raw = await this.prisma.aiConversationMessage.create({
      data: {
        conversationId,
        role: data.role,
        content: data.content,
        status: data.status ?? 'ANSWERED',
        intent: data.intent ?? null,
        evidenceSnapshot: (data.evidenceSnapshot as Prisma.InputJsonValue) ?? Prisma.JsonNull,
        limitations: data.limitations ?? [],
        provider: data.provider ?? null,
        model: data.model ?? null,
        providerRequestId: data.providerRequestId ?? null,
      },
    });

    // Touch updatedAt on conversation
    await this.prisma.aiConversation.update({
      where: { id: conversationId },
      data: { updatedAt: new Date() },
    });

    return {
      id: raw.id,
      conversationId: raw.conversationId,
      role: raw.role as 'USER' | 'ASSISTANT',
      content: raw.content,
      status: raw.status as 'ANSWERED' | 'UNSUPPORTED' | 'PROVIDER_ERROR',
      intent: raw.intent,
      evidenceSnapshot: raw.evidenceSnapshot,
      limitations: raw.limitations,
      provider: raw.provider,
      model: raw.model,
      providerRequestId: raw.providerRequestId,
      createdAt: raw.createdAt,
    };
  }

  async appendTurn(
    conversationId: string,
    userMessage: { content: string },
    assistantMessage: {
      content: string;
      status?: 'ANSWERED' | 'UNSUPPORTED' | 'PROVIDER_ERROR';
      intent?: string | null;
      evidenceSnapshot?: unknown | null;
      limitations?: string[];
      provider?: string | null;
      model?: string | null;
      providerRequestId?: string | null;
    },
  ): Promise<{
    userMessage: AiConversationMessageRecord;
    assistantMessage: AiConversationMessageRecord;
  }> {
    return this.prisma.$transaction(async (tx) => {
      const uRaw = await tx.aiConversationMessage.create({
        data: {
          conversationId,
          role: 'USER',
          content: userMessage.content,
          status: 'ANSWERED',
        },
      });

      const aRaw = await tx.aiConversationMessage.create({
        data: {
          conversationId,
          role: 'ASSISTANT',
          content: assistantMessage.content,
          status: assistantMessage.status ?? 'ANSWERED',
          intent: assistantMessage.intent ?? null,
          evidenceSnapshot:
            (assistantMessage.evidenceSnapshot as Prisma.InputJsonValue) ?? Prisma.JsonNull,
          limitations: assistantMessage.limitations ?? [],
          provider: assistantMessage.provider ?? null,
          model: assistantMessage.model ?? null,
          providerRequestId: assistantMessage.providerRequestId ?? null,
        },
      });

      // Update conversation title if first message and title is empty
      const conv = await tx.aiConversation.findUnique({
        where: { id: conversationId },
        select: { title: true },
      });

      const updateData: Prisma.AiConversationUpdateInput = { updatedAt: new Date() };
      if (!conv?.title) {
        updateData.title = userMessage.content.slice(0, 100).trim();
      }

      await tx.aiConversation.update({
        where: { id: conversationId },
        data: updateData,
      });

      return {
        userMessage: {
          id: uRaw.id,
          conversationId: uRaw.conversationId,
          role: 'USER',
          content: uRaw.content,
          status: 'ANSWERED',
          intent: null,
          evidenceSnapshot: null,
          limitations: [],
          provider: null,
          model: null,
          providerRequestId: null,
          createdAt: uRaw.createdAt,
        },
        assistantMessage: {
          id: aRaw.id,
          conversationId: aRaw.conversationId,
          role: 'ASSISTANT',
          content: aRaw.content,
          status: aRaw.status as 'ANSWERED' | 'UNSUPPORTED' | 'PROVIDER_ERROR',
          intent: aRaw.intent,
          evidenceSnapshot: aRaw.evidenceSnapshot,
          limitations: aRaw.limitations,
          provider: aRaw.provider,
          model: aRaw.model,
          providerRequestId: aRaw.providerRequestId,
          createdAt: aRaw.createdAt,
        },
      };
    });
  }
}
