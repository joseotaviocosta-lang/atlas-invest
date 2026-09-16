import { Controller, Get, Post, Body, Param, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiParam, ApiBody } from '@nestjs/swagger';
import {
  CreateInstitutionUseCase,
  GetInstitutionUseCase,
  ListInstitutionsUseCase,
} from '../../application/institutions';
import {
  CreateInstitutionDto,
  CreateInstitutionSwaggerDto,
  InstitutionInputSchema,
} from './dto/create-institution.dto';
import { ZodValidationPipe, UUIDParamPipe } from '../../common/pipes';

@ApiTags('Institutions')
@Controller('api/v1/institutions')
export class InstitutionsController {
  constructor(
    @Inject(CreateInstitutionUseCase)
    private readonly createInstitutionUseCase: CreateInstitutionUseCase,
    @Inject(GetInstitutionUseCase)
    private readonly getInstitutionUseCase: GetInstitutionUseCase,
    @Inject(ListInstitutionsUseCase)
    private readonly listInstitutionsUseCase: ListInstitutionsUseCase,
  ) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Register a financial institution' })
  @ApiBody({ type: CreateInstitutionSwaggerDto })
  @ApiResponse({ status: 201, description: 'Institution created successfully' })
  @ApiResponse({ status: 400, description: 'Validation failed' })
  async create(@Body(new ZodValidationPipe(InstitutionInputSchema)) dto: CreateInstitutionDto) {
    const institution = await this.createInstitutionUseCase.execute(dto);
    return {
      data: institution.toJSON(),
    };
  }

  @Get(':institutionId')
  @ApiOperation({ summary: 'Get a financial institution by ID' })
  @ApiParam({ name: 'institutionId', description: 'UUID of the institution' })
  @ApiResponse({ status: 200, description: 'Institution found' })
  @ApiResponse({ status: 404, description: 'Institution not found' })
  async getById(@Param('institutionId', UUIDParamPipe) institutionId: string) {
    const institution = await this.getInstitutionUseCase.execute(institutionId);
    return {
      data: institution.toJSON(),
    };
  }

  @Get()
  @ApiOperation({ summary: 'List all financial institutions' })
  @ApiResponse({ status: 200, description: 'List of institutions' })
  async list() {
    const institutions = await this.listInstitutionsUseCase.execute();
    return {
      data: institutions.map((i) => i.toJSON()),
    };
  }
}
