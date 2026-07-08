import { Controller, Get, Injectable, Module, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { Roles } from '../common/decorators/roles.decorator';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';

@Injectable()
class AuditLogsService {
  constructor(private prisma: PrismaService) {}

  findAll(take: number, action?: string) {
    return this.prisma.auditLog.findMany({
      where: action ? { action: action as any } : undefined,
      include: { user: { select: { fullName: true, email: true } } },
      orderBy: { createdAt: 'desc' },
      take: Math.min(take, 200),
    });
  }
}

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN)
@Controller('audit-logs')
class AuditLogsController {
  constructor(private auditLogsService: AuditLogsService) {}

  @Get()
  findAll(@Query('take') take?: string, @Query('action') action?: string) {
    return this.auditLogsService.findAll(take ? parseInt(take, 10) : 100, action);
  }
}

@Module({
  controllers: [AuditLogsController],
  providers: [AuditLogsService],
})
export class AuditLogsModule {}
