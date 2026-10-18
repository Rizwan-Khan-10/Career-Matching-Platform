import { Controller, Get, NotFoundException, Param, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InternalKeyGuard } from './internal-key.guard';

// service-to-service only (chat-service names conversations, job-service checks approval). Never expose /internal/* through Nginx.
@Controller('internal/companies')
@UseGuards(InternalKeyGuard)
export class InternalCompaniesController {
  constructor(private prisma: PrismaService) { }

  @Get(':userId/name')
  async name(@Param('userId') userId: string) {
    const company = await this.prisma.companyProfile.findUnique({ where: { userId } });
    if (!company) throw new NotFoundException('Company not found');
    return { name: company.name };
  }

  @Get(':userId/status')
  async status(@Param('userId') userId: string) {
    const company = await this.prisma.companyProfile.findUnique({ where: { userId } });
    if (!company) throw new NotFoundException('Company not found');
    return { status: company.status };
  }
}