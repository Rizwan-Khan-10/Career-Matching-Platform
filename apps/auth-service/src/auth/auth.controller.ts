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
import { TwoFactorService } from './two-factor/two-factor.service';
import { EnableTwoFactorDto } from './dto/enable-two-factor.dto';
import { TwoFactorConfirmDto } from './dto/two-factor-confirm.dto';
import { VerifyTwoFactorDto } from './dto/verify-two-factor.dto';

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
    private twoFactor: TwoFactorService,
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

  // ---------- two-factor ----------

  @UseGuards(JwtAuthGuard)
  @Get('2fa/status')
  twoFactorStatus(@Req() req: AuthenticatedRequest) {
    return this.twoFactor.status(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/setup')
  twoFactorSetup(@Req() req: AuthenticatedRequest) {
    return this.twoFactor.setup(req.user.userId);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/enable')
  twoFactorEnable(@Req() req: AuthenticatedRequest, @Body() dto: EnableTwoFactorDto) {
    return this.twoFactor.enable(req.user.userId, req.user.sessionId, dto.code);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/disable')
  twoFactorDisable(@Req() req: AuthenticatedRequest, @Body() dto: TwoFactorConfirmDto) {
    return this.twoFactor.disable(req.user.userId, req.user.sessionId, dto);
  }

  @UseGuards(JwtAuthGuard)
  @Post('2fa/recovery-codes')
  twoFactorRecoveryCodes(@Req() req: AuthenticatedRequest, @Body() dto: TwoFactorConfirmDto) {
    return this.twoFactor.regenerateRecoveryCodes(req.user.userId, dto);
  }

  // Public: the caller has a challenge id from /auth/login, not a token yet.
  @Post('2fa/verify')
  twoFactorVerify(@Body() dto: VerifyTwoFactorDto, @Ip() ip: string) {
    return this.authService.verifyTwoFactor(dto, ip);
  }
}