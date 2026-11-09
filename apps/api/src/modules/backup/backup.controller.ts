import { Controller, Get, Post, HttpCode, HttpStatus, Inject } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { BackupService, BackupStatusResponse } from './backup.service';

@ApiTags('Backup')
@ApiBearerAuth()
@Controller('api/v1/backups')
export class BackupController {
  constructor(
    @Inject(BackupService)
    private readonly backupService: BackupService,
  ) {}

  @Get('status')
  @ApiOperation({ summary: 'Get local database backup status, recent files, and retention policy' })
  @ApiResponse({ status: 200, description: 'Backup status retrieved successfully' })
  async getStatus(): Promise<{ data: BackupStatusResponse }> {
    const data = await this.backupService.getStatus();
    return { data };
  }

  @Post('create')
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Trigger a manual verified database backup with checksum verification' })
  @ApiResponse({ status: 201, description: 'Backup created and verified successfully' })
  async createBackup() {
    const data = await this.backupService.createBackup();
    return { data };
  }
}
