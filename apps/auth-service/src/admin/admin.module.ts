import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { MailModule } from '../mail/mail.module';
import { SessionModule } from '../sessions/session.module';
import { UserServiceClient } from '../clients/user-service.client';
import { AdminController } from './admin.controller';
import { AdminUsersService } from './admin-users.service';
import { UserImportService } from './user-import.service';

@Module({
  imports: [SettingsModule, MailModule, SessionModule],
  controllers: [AdminController],
  providers: [UserServiceClient, UserImportService, AdminUsersService],
})
export class AdminModule {}