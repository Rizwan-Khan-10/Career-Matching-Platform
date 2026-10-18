import { Controller, Get, Param, NotFoundException, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InternalKeyGuard } from './internal-key.guard';

@Controller('internal/users')
@UseGuards(InternalKeyGuard)
export class InternalController {
  constructor(private prisma: PrismaService) {}

  @Get(':id/email')
  async getEmail(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { email: true } });
    if (!user) throw new NotFoundException();
    return user;
  }
}