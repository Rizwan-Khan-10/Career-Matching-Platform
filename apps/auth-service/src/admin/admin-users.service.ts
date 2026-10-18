import { ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { RedisService } from '../redis/redis.service';
import { UserServiceClient } from '../clients/user-service.client';

@Injectable()
export class AdminUsersService {
  private readonly logger = new Logger(AdminUsersService.name);

  constructor(
    private prisma: PrismaService,
    private redis: RedisService,
    private userService: UserServiceClient,
  ) {}

  async setActive(actorId: string, userId: string, active: boolean) {
    if (actorId === userId) throw new ForbiddenException('You cannot change the status of your own account');
    await this.requireUser(userId);

    await this.prisma.user.update({ where: { id: userId }, data: { isActive: active } });
    if (!active) await this.dropRefreshTokens(userId);

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
    await this.dropRefreshTokens(userId);

    await this.userService.audit({ actorId, action: 'user.deleted', target: userId, meta: { role: user.role } });
    return { deleted: true };
  }

  private async requireUser(userId: string) {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true } });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  /** Single place that ends a user's sessions (task 1.4 will extend it for per-device sessions). */
  private async dropRefreshTokens(userId: string): Promise<void> {
    try {
      await this.redis.client.del(`refresh:${userId}`);
    } catch (err) {
      // Safe to continue: refresh() also checks isActive, so a disabled account cannot renew anyway.
      this.logger.warn(`could not delete refresh token of ${userId}: ${(err as Error).message}`);
    }
  }
}