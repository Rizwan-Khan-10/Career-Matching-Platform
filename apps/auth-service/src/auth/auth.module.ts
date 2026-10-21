import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { LoginLockService } from './login-lock.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SettingsModule } from '../settings/settings.module';
import { MailModule } from '../mail/mail.module';
import { SessionModule } from '../sessions/session.module';
import { RateLimitService } from './rate-limit.service';

@Module({
  imports: [PassportModule, JwtModule.register({}), SettingsModule, MailModule, SessionModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy, LoginLockService, RateLimitService],
})
export class AuthModule { }