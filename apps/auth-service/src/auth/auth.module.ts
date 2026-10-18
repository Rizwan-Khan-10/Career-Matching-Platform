import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { MailQueueService } from '../mail/mail-queue.service'
import { SettingsModule } from '../settings/settings.module';

@Module({
  imports: [PassportModule, JwtModule.register({}), SettingsModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, MailQueueService],
})
export class AuthModule { }