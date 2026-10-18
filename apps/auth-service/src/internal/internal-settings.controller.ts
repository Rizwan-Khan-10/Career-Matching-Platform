import { Controller, Get, UseGuards } from '@nestjs/common';
import { SettingsService } from '../settings/settings.service';
import { InternalKeyGuard } from './internal-key.guard';

// Service-to-service only (job-service reads jobApprovalRequired). Never exposed through Nginx.
@Controller('internal/settings')
@UseGuards(InternalKeyGuard)
export class InternalSettingsController {
  constructor(private settings: SettingsService) {}

  @Get()
  getSettings() {
    return this.settings.getAll();
  }
}