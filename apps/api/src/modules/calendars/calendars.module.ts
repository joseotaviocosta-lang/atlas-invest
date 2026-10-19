import { Module } from '@nestjs/common';
import { DatabaseModule } from '../../database/database.module';
import {
  UpdateCalendarDataUseCase,
  GetCalendarCoverageUseCase,
  CalendarResolutionService,
} from '../../application/calendar';
import { CalendarsController } from './calendars.controller';

@Module({
  imports: [DatabaseModule],
  controllers: [CalendarsController],
  providers: [UpdateCalendarDataUseCase, GetCalendarCoverageUseCase, CalendarResolutionService],
  exports: [UpdateCalendarDataUseCase, GetCalendarCoverageUseCase, CalendarResolutionService],
})
export class CalendarsModule {}
