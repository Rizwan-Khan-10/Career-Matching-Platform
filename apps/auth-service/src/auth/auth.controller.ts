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
import { GoogleLoginDto } from './dto/google-login.dto';
import { getGoogleClientId } from './google-token-verifier';
import { isGoogleSignInAllowed } from './signup-policy';
import { FinishSetupLoginDto } from './dto/finish-setup-login.dto';
import { SetupTokenDto } from './dto/setup-token.dto';
import { VerifyEmailDto } from './dto/verify-email.dto';
import { ResendVerificationDto } from './dto/resend-verification.dto';

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

  // Public: lets the login/signup pages adapt to the current mode.
  // googleEnabled is false in college mode (invite_only / domain), so the web app hides the button.
  @Get('registration-mode')
  async registrationMode() {
    const info = await this.settingsService.getRegistrationMode();
    const clientId = getGoogleClientId();
    const googleEnabled = !!clientId && isGoogleSignInAllowed({ registrationMode: info.mode });
    return { ...info, googleEnabled, googleClientId: googleEnabled ? clientId : null };
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

  // The link from the verification e-mail.
  @Post('verify-email')
  async verifyEmail(@Body() dto: VerifyEmailDto, @Ip() ip: string) {
    await this.rateLimit.assert('verify-email', ip, 30, 10 * 60, 'Too many attempts. Please try again in a few minutes.');
    return this.authService.verifyEmail(dto.token);
  }

  @Post('resend-verification')
  async resendVerification(@Body() dto: ResendVerificationDto, @Ip() ip: string) {
    const tooMany = 'Too many requests. Please try again in a few minutes.';
    await this.rateLimit.assert('resend-verification-ip', ip, 10, 60 * 60, tooMany);
    await this.rateLimit.assert('resend-verification-email', dto.email, 3, 15 * 60, tooMany); // no mail flood to one inbox
    return this.authService.resendVerification(dto.email);
  }

  @Post('google')
  async google(@Body() dto: GoogleLoginDto, @Ip() ip: string) {
    await this.rateLimit.assert('google', ip, 30, 10 * 60, 'Too many attempts. Please try again in a few minutes.');
    return this.authService.googleLogin(dto);
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

  // Public: an admin who must set up 2FA before getting tokens (setupToken comes from /auth/login).
  @Post('2fa/setup-login/start')
  twoFactorSetupLoginStart(@Body() dto: SetupTokenDto, @Ip() ip: string) {
    return this.authService.startTwoFactorSetupLogin(dto, ip);
  }

  @Post('2fa/setup-login/finish')
  twoFactorSetupLoginFinish(@Body() dto: FinishSetupLoginDto, @Ip() ip: string) {
    return this.authService.finishTwoFactorSetupLogin(dto, ip);
  }
}