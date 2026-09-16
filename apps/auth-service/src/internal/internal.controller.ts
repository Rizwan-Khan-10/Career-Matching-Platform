import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Controller('internal/users')
export class InternalController {
  constructor(private prisma: PrismaService) {}

  @Get(':id/email')
  async getEmail(@Param('id') id: string) {
    const user = await this.prisma.user.findUnique({ where: { id }, select: { email: true } });
    if (!user) throw new NotFoundException();
    return user;
  }
}