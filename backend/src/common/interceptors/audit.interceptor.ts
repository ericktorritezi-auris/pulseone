import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';
import { AUDIT_ACTION_KEY } from '../decorators/audit.decorator';

/**
 * Registra em AuditLog as ações relevantes (login, logout, cadastro, edição,
 * exclusão, feedback, fechamento, geração IA, geração PDF), conforme PRD
 * seção 25. Rotas marcam a própria ação via @Audit(AuditAction.X); esse
 * interceptor, registrado globalmente em app.module.ts, grava sozinho.
 *
 * Login/registro continuam com gravação inline nos próprios services
 * (auth.service.ts) — já existiam desde a Sprint 0 e não duplicamos aqui.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const action = Reflect.getMetadata(AUDIT_ACTION_KEY, context.getHandler());

    return next.handle().pipe(
      tap(async (response) => {
        if (!action) return;

        // entityId: tenta pegar do :id da rota, senão do id retornado na
        // resposta (útil pra criação, onde o :id ainda não existe na hora
        // da requisição).
        const entityId = request.params?.id ?? response?.id ?? null;

        await this.prisma.auditLog.create({
          data: {
            userId: request.user?.id ?? null,
            action,
            entity: request.route?.path ?? null,
            entityId,
            metadata: { method: request.method, params: request.params },
          },
        });
      }),
    );
  }
}
