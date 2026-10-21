import { Body, Controller, Get, Ip, Post, Req, UseGuards } from '@nestjs/common';
import { AuthService } from './auth.service';
import { SettingsService } from '../settings/settings.service';
import { SignupDto } from './dto/signup.dto';
import { LoginDto } from './dto/login.dto';
import { RefreshDto } from './dto/refresh.dto';
import { ForgotPasswordDto } from './dto/forgot-password.dto';
import { ResetPasswordDto } from './dto/reset-password.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { AuthenticatedRequest } from './types/authenticated-request';
import { RateLimitService } from './rate-limit.service';

const SIGNUP_LIMIT = {
  max: Number(process.env.SIGNUP_RATE_MAX || 20),
  windowSeconds: 60 * 60,
} as const;

@Controller('auth')
export class AuthController {
  constructor(
    private authService: AuthService,
    private settingsService: SettingsService,
    private rateLimit: RateLimitService,
  ) { }

  // Public: lets the signup page adapt to the current mode.
  @Get('registration-mode')
  registrationMode() {
    return this.settingsService.getRegistrationMode();
  }

  @Post('signup')
  async signup(@Body() dto: SignupDto, @Ip() ip: string) {
    await this.rateLimit.assert(
      'signup',
      ip,
      SIGNUP_LIMIT.max,
      SIGNUP_LIMIT.windowSeconds,
      'Too many sign-up attempts from this network. Please try again later.',
    );
    return this.authService.signup(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto, @Ip() ip: string) {
    return this.authService.login(dto, ip);
  }

  @Post('refresh')
  refresh(@Body() dto: RefreshDto) {
    return this.authService.refresh(dto.refreshToken);
  }

  @UseGuards(JwtAuthGuard)
  @Post('logout')
  logout(@Req() req: AuthenticatedRequest) {
    return this.authService.logout(req.user.userId, req.user.sessionId);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(dto.resetToken, dto.newPassword);
  }
}