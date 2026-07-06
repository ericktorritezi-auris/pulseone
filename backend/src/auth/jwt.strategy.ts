import { Injectable, UnauthorizedException } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(private prisma: PrismaService) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env.JWT_SECRET,
    });
  }

  // Busca o usuário completo (não só o payload do token) para que toda a
  // aplicação tenha sempre areaId/role atualizados — essencial para as
  // travas de "gestor só enxerga/cadastra dentro da própria área".
  async validate(payload: { sub: string }) {
    const user = await this.prisma.user.findUnique({ where: { id: payload.sub } });

    if (!user || !user.active) {
      throw new UnauthorizedException('Usuário inválido ou inativo.');
    }

    return { id: user.id, role: user.role, areaId: user.areaId };
  }
}
