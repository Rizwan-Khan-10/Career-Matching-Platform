import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './strategies/jwt.strategy';
import { SettingsModule } from '../settings/settings.module';
import { MailModule } from '../mail/mail.module';

@Module({
  imports: [PassportModule, JwtModule.register({}), SettingsModule, MailModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule { }