import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Inject,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiTags,
  ApiOperation,
  ApiResponse,
  ApiParam,
  ApiQuery,
  ApiBearerAuth,
  ApiBody,
} from '@nestjs/swagger';
import { LocalDate } from '@atlas/domain';
import {
  UpdateCalendarDataUseCase,
  GetCalendarCoverageUseCase,
  CalendarResolutionService,
} from '../../application/calendar';

export class UpdateCalendarDto {
  from!: string;
  to!: string;
}

@ApiTags('Calendars')
@ApiBearerAuth()
@Controller('api/v1/calendars')
export class CalendarsController {
  constructor(
    @Inject(UpdateCalendarDataUseCase)
    private readonly updateCalendarDataUseCase: UpdateCalendarDataUseCase,
    @Inject(GetCalendarCoverageUseCase)
    private readonly getCalendarCoverageUseCase: GetCalendarCoverageUseCase,
    @Inject(CalendarResolutionService)
    private readonly calendarResolutionService: CalendarResolutionService,
  ) {}

  @Get(':calendarType/coverage')
  @ApiOperation({
    summary: 'Get persisted official calendar coverage (e.g. B3, BANKING_BR)',
  })
  @ApiParam({
    name: 'calendarType',
    description: 'Calendar type: B3 or BANKING_BR',
    example: 'B3',
  })
  @ApiResponse({ status: 200, description: 'Calendar coverage details' })
  @ApiResponse({ status: 400, description: 'Unsupported calendar type' })
  async getCoverage(@Param('calendarType') calendarType: string) {
    const data = await this.getCalendarCoverageUseCase.execute(calendarType);
    return { data };
  }

  @Post(':calendarType/update')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Generate and persist official calendar trading/business days and closures',
  })
  @ApiParam({
    name: 'calendarType',
    description: 'Calendar type: B3 or BANKING_BR',
    example: 'B3',
  })
  @ApiBody({ type: UpdateCalendarDto })
  @ApiResponse({ status: 200, description: 'Calendar ingestion receipt' })
  @ApiResponse({ status: 400, description: 'Unsupported calendar type or invalid date range' })
  async updateCalendar(
    @Param('calendarType') calendarType: string,
    @Body() body: UpdateCalendarDto,
  ) {
    const data = await this.updateCalendarDataUseCase.execute({
      calendarType,
      from: body.from,
      to: body.to,
    });
    return { data };
  }

  @Get(':calendarType/resolve')
  @ApiOperation({
    summary:
      'Classify an observation status for a specific date (CLOSED_DAY vs DATA_GAP vs PRESENT vs NOT_PUBLISHED_YET)',
  })
  @ApiParam({
    name: 'calendarType',
    description: 'Calendar type: B3 or BANKING_BR',
    example: 'B3',
  })
  @ApiQuery({
    name: 'date',
    description: 'Date to check in YYYY-MM-DD format',
    example: '2026-01-01',
  })
  @ApiQuery({
    name: 'hasData',
    description: 'Whether data exists for this date (boolean)',
    example: false,
    required: false,
  })
  @ApiResponse({ status: 200, description: 'Resolution classification' })
  async resolve(
    @Param('calendarType') calendarType: string,
    @Query('date') date: string,
    @Query('hasData') hasData?: string,
  ) {
    const hasDataBool = hasData === 'true' || hasData === '1';
    const targetDate = LocalDate.from(date);
    const now = new Date();
    const asOfDate = LocalDate.fromParts(
      now.getUTCFullYear(),
      now.getUTCMonth() + 1,
      now.getUTCDate(),
    );
    const calType = calendarType.trim().toUpperCase() as 'B3_TRADING' | 'BANKING';
    const data = await this.calendarResolutionService.classifyObservation({
      seriesId: 'GENERIC',
      date: targetDate,
      asOfDate,
      hasData: hasDataBool,
      calendarType: calType,
    });
    return { data };
  }
}
