import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminUsersService } from './admin-users.service';

function build(user: { id: string; role: string } | null = { id: 'u2', role: 'APPLICANT' }) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue({}),
      delete: vi.fn().mockResolvedValue({}),
    },
  };
  const redis = { client: { del: vi.fn().mockResolvedValue(1) } };
  const userService = { audit: vi.fn().mockResolvedValue(undefined) };
  const service = new AdminUsersService(prisma as any, redis as any, userService as any);
  return { service, prisma, redis, userService };
}

describe('AdminUsersService.setActive', () => {
  it('deactivates the user, deletes the refresh token and audits', async () => {
    const { service, prisma, redis, userService } = build();
    const result = await service.setActive('admin-1', 'u2', false);

    expect(result).toEqual({ id: 'u2', isActive: false });
    expect(prisma.user.update).toHaveBeenCalledWith({ where: { id: 'u2' }, data: { isActive: false } });
    expect(redis.client.del).toHaveBeenCalledWith('refresh:u2');
    expect(userService.audit).toHaveBeenCalledWith({ actorId: 'admin-1', action: 'user.deactivated', target: 'u2' });
  });

  it('reactivates without touching refresh tokens', async () => {
    const { service, redis } = build();
    const result = await service.setActive('admin-1', 'u2', true);
    expect(result).toEqual({ id: 'u2', isActive: true });
    expect(redis.client.del).not.toHaveBeenCalled();
  });

  it('still deactivates when Redis is down', async () => {
    const { service, redis } = build();
    redis.client.del.mockRejectedValue(new Error('down'));
    await expect(service.setActive('admin-1', 'u2', false)).resolves.toEqual({ id: 'u2', isActive: false });
  });

  it('returns 404 for an unknown user', async () => {
    const { service } = build(null);
    await expect(service.setActive('admin-1', 'nope', false)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('does not let an admin change their own status', async () => {
    const { service, prisma } = build();
    await expect(service.setActive('admin-1', 'admin-1', false)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.update).not.toHaveBeenCalled();
  });
});

describe('AdminUsersService.remove', () => {
  it('deletes the user and the refresh token, then audits', async () => {
    const { service, prisma, redis, userService } = build();
    await expect(service.remove('admin-1', 'u2')).resolves.toEqual({ deleted: true });
    expect(prisma.user.delete).toHaveBeenCalledWith({ where: { id: 'u2' } });
    expect(redis.client.del).toHaveBeenCalledWith('refresh:u2');
    expect(userService.audit).toHaveBeenCalledWith({
      actorId: 'admin-1', action: 'user.deleted', target: 'u2', meta: { role: 'APPLICANT' },
    });
  });

  it('returns 404 for an unknown user and blocks self-delete', async () => {
    await expect(build(null).service.remove('admin-1', 'nope')).rejects.toBeInstanceOf(NotFoundException);
    await expect(build().service.remove('admin-1', 'admin-1')).rejects.toBeInstanceOf(ForbiddenException);
  });
});