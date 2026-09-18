import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { StorageService } from '../storage/storage.service';

@Injectable()
export class ResumeService {
  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private storage: StorageService,
  ) {}

  async upload(applicantId: string, file: Express.Multer.File) {
    const fileUrl = await this.storage.uploadResume(applicantId, file);
    const resume = await this.prisma.resume.create({
      data: { applicantId, fileUrl, status: 'pending' },
    });

    await this.redis.client.xadd(
      'resume.uploaded',
      '*',
      'data',
      JSON.stringify({ resumeId: resume.id, applicantId, fileUrl }),
    );

    return resume;
  }

  async getByApplicant(applicantId: string) {
    return this.prisma.resume.findMany({ where: { applicantId }, orderBy: { createdAt: 'desc' } });
  }
}