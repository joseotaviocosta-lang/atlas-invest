import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application/application.module';
import { AiController } from './ai.controller';
import { ExplainPortfolioWithAiUseCase } from '../../application/ai/explain-portfolio-with-ai.use-case';
import { CreateAiConversationUseCase } from '../../application/ai/create-ai-conversation.use-case';
import { ListAiConversationsUseCase } from '../../application/ai/list-ai-conversations.use-case';
import { GetAiConversationUseCase } from '../../application/ai/get-ai-conversation.use-case';
import { SendAiConversationMessageUseCase } from '../../application/ai/send-ai-conversation-message.use-case';
import { StreamAiConversationMessageUseCase } from '../../application/ai/stream-ai-conversation-message.use-case';
import { AI_PROVIDER_TOKEN, OpenAiProvider } from '../../infrastructure/ai/openai-ai.provider';
import {
  AI_TELEMETRY_SINK_TOKEN,
  LoggingAiTelemetrySink,
} from '../../infrastructure/ai/ai-telemetry.sink';
import { FakeAiProvider } from '@atlas/ai-engine';

@Module({
  imports: [ApplicationModule],
  controllers: [AiController],
  providers: [
    ExplainPortfolioWithAiUseCase,
    CreateAiConversationUseCase,
    ListAiConversationsUseCase,
    GetAiConversationUseCase,
    SendAiConversationMessageUseCase,
    StreamAiConversationMessageUseCase,
    {
      provide: AI_TELEMETRY_SINK_TOKEN,
      useClass: LoggingAiTelemetrySink,
    },
    {
      provide: AI_PROVIDER_TOKEN,
      useFactory: () => {
        if (process.env.OPENAI_API_KEY) {
          return new OpenAiProvider();
        }
        if (process.env.NODE_ENV === 'production') {
          throw new Error(
            'Security invariant violated: OPENAI_API_KEY must be configured in production. Fallback to FakeAiProvider is strictly prohibited in production.',
          );
        }
        return new FakeAiProvider();
      },
    },
  ],
  exports: [
    ExplainPortfolioWithAiUseCase,
    CreateAiConversationUseCase,
    ListAiConversationsUseCase,
    GetAiConversationUseCase,
    SendAiConversationMessageUseCase,
    StreamAiConversationMessageUseCase,
    AI_PROVIDER_TOKEN,
    AI_TELEMETRY_SINK_TOKEN,
  ],
})
export class AiModule {}
