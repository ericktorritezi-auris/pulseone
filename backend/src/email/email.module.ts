import { Module } from '@nestjs/common';
import { ResendService } from '../auth/resend.service';

// Módulo dedicado só pra centralizar o ResendService — assim qualquer
// módulo que precise mandar e-mail (auth, pulse-cycles, etc.) importa
// isso, em vez de depender do AuthModule inteiro (que também traz
// JwtModule, PassportModule, AuthController...).
@Module({
  providers: [ResendService],
  exports: [ResendService],
})
export class EmailModule {}
