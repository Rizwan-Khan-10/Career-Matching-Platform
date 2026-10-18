import { Controller, Get, Param, NotFoundException, UseGuards } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InternalKeyGuard } from '../common/internal-key.guard';

/** Service-to-service only (nginx blocks /internal from outside); every handler needs `x-internal-key`. */
@UseGuards(InternalKeyGuard)
@Controller('internal/roles')
export class InternalController {
    constructor(private prisma: PrismaService) { }

    @Get(':id')
    async getRole(@Param('id') id: string) {
        const role = await this.prisma.jobRole.findUnique({
            where: { id },
            include: { jobPosting: true },
        });
        if (!role) throw new NotFoundException();
        return { id: role.id, title: role.title, companyId: role.jobPosting.companyId, requirements: role.requirements };
    }
}
