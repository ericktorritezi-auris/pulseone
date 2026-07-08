import { SetMetadata } from '@nestjs/common';
import { AuditAction } from '@prisma/client';

export const AUDIT_ACTION_KEY = 'auditAction';

/**
 * Marca uma rota do controller pra ser registrada em AuditLog
 * automaticamente pelo AuditInterceptor global (PRD seção 25).
 * Ex: @AuditAction(AuditAction.CADASTRO)
 */
export const Audit = (action: AuditAction) => SetMetadata(AUDIT_ACTION_KEY, action);
