import { Body, Controller, Post, Param, UseGuards, Req } from '@nestjs/common';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { Audit } from '../common/decorators/audit.decorator';
import { AuditAction } from '@prisma/client';
import {
  LoginDto,
  ChangePasswordDto,
  ForgotPasswordDto,
  ResetPasswordDto,
  RegisterDto,
} from './dto/auth.dto';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('register')
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('login')
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto.email, dto.password);
  }

  // JWT é stateless (não existe sessão pra invalidar no servidor) — essa
  // rota existe só pra registrar o LOGOUT em AuditLog (PRD seção 25). O
  // frontend chama antes de limpar o token localmente.
  @UseGuards(JwtAuthGuard)
  @Audit(AuditAction.LOGOUT)
  @Post('logout')
  logout() {
    return { loggedOut: true };
  }

  @UseGuards(JwtAuthGuard)
  @Post('send-email-verification')
  sendEmailVerification(@Req() req: any) {
    return this.authService.sendEmailVerification(req.user.id);
  }

  @Post('verify-email/:token')
  verifyEmail(@Param('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Post('forgot-password')
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto.email);
  }

  @Post('reset-password/:token')
  resetPassword(@Param('token') token: string, @Body() dto: ResetPasswordDto) {
    return this.authService.resetPassword(token, dto.newPassword);
  }

  @UseGuards(JwtAuthGuard)
  @Post('change-password')
  changePassword(@Req() req: any, @Body() dto: ChangePasswordDto) {
    return this.authService.changePassword(req.user.id, dto.currentPassword, dto.newPassword);
  }
}
