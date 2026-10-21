import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SessionStore } from '../sessions/session-store.service';
import { UserServiceClient } from '../clients/user-service.client';

@Injectable()
export class AdminUsersService {
  constructor(
    private prisma: PrismaService,
    private sessions: SessionStore,
    private userService: UserServiceClient,
  ) { }

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

  /** For a user who lost their phone AND their recovery codes. Signs them out everywhere. */
  async resetTwoFactor(actorId: string, userId: string) {
    if (actorId === userId) throw new ForbiddenException('Use your own security settings to change two-factor');

    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, role: true, twoFactorEnabled: true },
    });
    if (!user) throw new NotFoundException('User not found');
    if (!user.twoFactorEnabled) throw new BadRequestException('This user has not turned on two-factor');

    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id: userId }, data: { twoFactorEnabled: false, twoFactorSecret: null } }),
      this.prisma.recoveryCode.deleteMany({ where: { userId } }),
    ]);
    await this.sessions.revokeAll(userId);

    await this.userService.audit({ actorId, action: 'user.2fa_reset', target: userId, meta: { role: user.role } });
    return { id: userId, twoFactorEnabled: false };
  }

  /** Required before "admins must use 2FA" can be switched on: otherwise the admin saving it would lock themselves out. */
  async assertHasTwoFactor(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { twoFactorEnabled: true } });
    if (!user?.twoFactorEnabled) {
      throw new BadRequestException(
        'Turn on two-factor for your own account first (Security in the top bar), then you can require it for all admins.',
      );
    }
  }

  /** Admins who have no 2FA must log in again, and the login then sends them through setup. */
  async revokeAdminSessionsWithoutTwoFactor() {
    const admins = await this.prisma.user.findMany({
      where: { role: 'ADMIN', twoFactorEnabled: false },
      select: { id: true },
    });
    for (const admin of admins) await this.sessions.revokeAll(admin.id);
  }
}