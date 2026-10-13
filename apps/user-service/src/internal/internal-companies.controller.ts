import { Controller, Get, NotFoundException, Param } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

// service-to-service only (chat-service names conversations with it). Never expose /internal/* through Nginx.
@Controller('internal/companies')
export class InternalCompaniesController {
  constructor(private prisma: PrismaService) { }

  @Get(':userId/name')
  async name(@Param('userId') userId: string) {
    const company = await this.prisma.companyProfile.findUnique({ where: { userId } });
    if (!company) throw new NotFoundException('Company not found');
    return { name: company.name };
  }
}