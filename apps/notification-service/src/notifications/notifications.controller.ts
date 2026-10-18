import { Controller, Get, Param, ParseUUIDPipe, Patch, Query, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { ListNotificationsDto } from './dto/list-notifications.dto';
import { NotificationsApiService } from './notifications-api.service';

/** Contract §5.3 (nginx `/notifications/` -> :3006). Any role; own rows only. */
@ApiTags('notifications')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationsController {
  constructor(private api: NotificationsApiService) { }

  @Get()
  list(@Req() req: AuthenticatedRequest, @Query() query: ListNotificationsDto) {
    return this.api.list(req.user.userId, {
      limit: query.limit,
      cursor: query.cursor,
      unread: query.unread === '1' || query.unread === 'true',
    });
  }

  @Get('unread-count')
  unreadCount(@Req() req: AuthenticatedRequest) {
    return this.api.unreadCount(req.user.userId);
  }

  @Patch('read-all')
  readAll(@Req() req: AuthenticatedRequest) {
    return this.api.markAllRead(req.user.userId);
  }

  @Patch(':id/read')
  read(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.api.markRead(req.user.userId, id);
  }
}