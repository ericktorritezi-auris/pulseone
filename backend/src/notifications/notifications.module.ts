import { Controller, Get, Injectable, Module, Param, Patch, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../common/guards/jwt-auth.guard';
import { PrismaService } from '../prisma/prisma.service';
import { UserRole } from '@prisma/client';

type AuthUser = { id: string; role: UserRole; areaId: string };

@Injectable()
class NotificationsService {
  constructor(private prisma: PrismaService) {}

  findAll(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: 30,
    });
  }

  async markAsRead(id: string, userId: string) {
    // findFirst (não findUnique) para garantir, na mesma query, que a
    // notificação pertence a quem está pedindo — ninguém marca notificação
    // de outra pessoa como lida.
    const notification = await this.prisma.notification.findFirst({ where: { id, userId } });
    if (!notification) return null;

    return this.prisma.notification.update({ where: { id }, data: { read: true } });
  }
}

@UseGuards(JwtAuthGuard)
@Controller('notifications')
class NotificationsController {
  constructor(private notificationsService: NotificationsService) {}

  @Get()
  findAll(@Req() req: { user: AuthUser }) {
    return this.notificationsService.findAll(req.user.id);
  }

  @Patch(':id/read')
  markAsRead(@Param('id') id: string, @Req() req: { user: AuthUser }) {
    return this.notificationsService.markAsRead(id, req.user.id);
  }
}

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService],
  exports: [NotificationsService],
})
export class NotificationsModule {}
