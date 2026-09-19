import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('internal/companies')
export class InternalController {
  constructor(private prisma: PrismaService) {}

  @Get(':userId/name')
  async getName(@Param('userId') userId: string) {
    const company = await this.prisma.companyProfile.findUnique({ where: { userId } });
    if (!company) throw new NotFoundException();
    return { name: company.name };
  }
}