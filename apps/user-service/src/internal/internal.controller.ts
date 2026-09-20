import { Controller, Post, Body, ConflictException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateProfileDto } from './dto/create-profile.dto';

@Controller('internal/profiles')
export class InternalController {
  constructor(private prisma: PrismaService) { }

  @Post()
  async createProfile(@Body() dto: CreateProfileDto) {
    if (dto.role === 'APPLICANT') {
      const existing = await this.prisma.applicantProfile.findUnique({ where: { userId: dto.userId } });
      if (existing) throw new ConflictException('Profile already exists');
      return this.prisma.applicantProfile.create({
        data: { userId: dto.userId, name: null },
      });
    }

    if (dto.role === 'COMPANY') {
      const existing = await this.prisma.companyProfile.findUnique({ where: { userId: dto.userId } });
      if (existing) throw new ConflictException('Profile already exists');
      return this.prisma.companyProfile.create({
        data: { userId: dto.userId, name: null },
      });
    }

    throw new BadRequestException('Invalid role');
  }
}