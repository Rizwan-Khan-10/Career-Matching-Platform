import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Patch, Post, Put, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { SettingsService } from '../settings/settings.service';
import { UpdateSettingsDto } from '../settings/dto/update-settings.dto';
import { UserServiceClient } from '../clients/user-service.client';
import { UserImportService } from './user-import.service';
import { AdminUsersService } from './admin-users.service';
import { ImportUsersDto } from './dto/import-users.dto';
import { SetActiveDto } from './dto/set-active.dto';

@Controller('auth/admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('ADMIN')
export class AdminController {
  constructor(
    private settings: SettingsService,
    private userImport: UserImportService,
    private users: AdminUsersService,
    private userService: UserServiceClient,
  ) { }

  @Get('settings')
  getSettings() {
    return this.settings.getAll();
  }

  @Put('settings')
  async updateSettings(@Req() req: AuthenticatedRequest, @Body() dto: UpdateSettingsDto) {
    const updated = await this.settings.update(dto);
    await this.userService.audit({
      actorId: req.user.userId,
      action: 'settings.updated',
      target: 'settings',
      meta: { ...updated },
    });
    return updated;
  }

  @Post('users/import')
  importUsers(@Req() req: AuthenticatedRequest, @Body() dto: ImportUsersDto) {
    return this.userImport.importUsers(req.user.userId, dto.users);
  }

  @Patch('users/:id/active')
  setActive(
    @Req() req: AuthenticatedRequest,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: SetActiveDto,
  ) {
    return this.users.setActive(req.user.userId, id, dto.active);
  }

  @Post('users/:id/2fa/reset')
  resetTwoFactor(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.resetTwoFactor(req.user.userId, id);
  }

  @Delete('users/:id')
  remove(@Req() req: AuthenticatedRequest, @Param('id', ParseUUIDPipe) id: string) {
    return this.users.remove(req.user.userId, id);
  }
}