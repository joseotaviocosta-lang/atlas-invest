import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application/application.module';
import { AiController } from './ai.controller';
import { ExplainPortfolioWithAiUseCase } from '../../application/ai/explain-portfolio-with-ai.use-case';
import { AI_PROVIDER_TOKEN, OpenAiProvider } from '../../infrastructure/ai/openai-ai.provider';
import { FakeAiProvider } from '@atlas/ai-engine';

@Module({
  imports: [ApplicationModule],
  controllers: [AiController],
  providers: [
    ExplainPortfolioWithAiUseCase,
    {
      provide: AI_PROVIDER_TOKEN,
      useFactory: () => {
        if (process.env.OPENAI_API_KEY) {
          return new OpenAiProvider();
        }
        return new FakeAiProvider();
      },
    },
  ],
  exports: [ExplainPortfolioWithAiUseCase, AI_PROVIDER_TOKEN],
})
export class AiModule {}
