import { Module } from '@nestjs/common';
import { ApplicationModule } from '../../application';
import { AssetsController } from './assets.controller';

@Module({
  imports: [ApplicationModule],
  controllers: [AssetsController],
})
export class AssetsModule {}
