import { Body, Controller, Post, UseGuards } from '@nestjs/common';
import { AuditService } from '../audit/audit.service';
import { CreateAuditDto } from '../audit/dto/create-audit.dto';
import { InternalKeyGuard } from './internal-key.guard';

// Service-to-service only (auth-service writes admin actions here). Never exposed through Nginx.
@Controller('internal/audit')
@UseGuards(InternalKeyGuard)
export class InternalAuditController {
    constructor(private audit: AuditService) { }

    @Post()
    async create(@Body() dto: CreateAuditDto) {
        const row = await this.audit.record(dto);
        return { id: row.id };
    }
}