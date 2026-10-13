import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AdminService {
  constructor(private prisma: PrismaService) { }

  listApplicants() { return this.prisma.applicantProfile.findMany({ take: 500 }); }
  listCompanies() { return this.prisma.companyProfile.findMany({ take: 500 }); }
}