import { Injectable, NestInterceptor, ExecutionContext, CallHandler } from '@nestjs/common';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { PrismaService } from '../../prisma/prisma.service';

/**
 * Registra em AuditLog as ações relevantes (login, logout, cadastro, edição,
 * exclusão, feedback, fechamento, geração IA, geração PDF), conforme PRD seção 25.
 * As rotas marcam sua ação via metadata @AuditAction('CADASTRO') (a implementar
 * em cada controller na Sprint 1+); aqui fica o hook de gravação centralizado.
 */
@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(private prisma: PrismaService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const request = context.switchToHttp().getRequest();
    const action = Reflect.getMetadata('auditAction', context.getHandler());

    return next.handle().pipe(
      tap(async () => {
        if (!action) return;
        await this.prisma.auditLog.create({
          data: {
            userId: request.user?.id ?? null,
            action,
            entity: request.route?.path ?? null,
            metadata: { method: request.method, params: request.params },
          },
        });
      }),
    );
  }
}
