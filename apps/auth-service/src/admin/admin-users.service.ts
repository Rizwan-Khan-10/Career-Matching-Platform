import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SessionStore } from '../sessions/session-store.service';
import { UserServiceClient } from '../clients/user-service.client';

@Injectable()
export class AdminUsersService {
  constructor(
    private prisma: PrismaService,
    private sessions: SessionStore,
    private userService: UserServiceClient,
  ) {}

  async setActive(actorId: string, userId: string, active: boolean) {
    if (actorId === userId) throw new ForbiddenException('You cannot change the status of your own account');
    await this.requireUser(userId);

    await this.prisma.user.update({ where: { id: userId }, data: { isActive: active } });
    // refresh() also checks isActive, so even if this fails the account cannot renew its tokens.
    if (!active) await this.sessions.revokeAll(userId);

    await this.userService.audit({
      actorId,
      action: active ? 'user.activated' : 'user.deactivated',
      target: userId,
    });
    return { id: userId, isActive: active };
  }

  async remove(actorId: string, userId: string) {
    if (actorId === userId) throw new ForbiddenException('You cannot delete your own account');
    const user = await this.requireUser(userId);

    await this.prisma.user.delete({ where: { id: userId } });
    await this.sessions.revokeAll(userId);

    await this.userService.audit({ actorId, action: 'user.deleted', target: userId, meta: { role: user.role } });
    return { deleted: true };
  }

  private async requireUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }
}