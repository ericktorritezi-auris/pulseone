import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AreasModule } from './areas/areas.module';
import { PositionsModule } from './positions/positions.module';
import { FeedbacksModule } from './feedbacks/feedbacks.module';
import { NotificationsModule } from './notifications/notifications.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { PulseCyclesModule } from './pulse-cycles/pulse-cycles.module';
import { PulseFeedbacksModule } from './pulse-feedbacks/pulse-feedbacks.module';

@Module({
  imports: [
    PrismaModule,
    AuthModule,
    UsersModule,
    AreasModule,
    PositionsModule,
    FeedbacksModule,
    NotificationsModule,
    DashboardModule,
    PulseCyclesModule,
    PulseFeedbacksModule,
  ],
})
export class AppModule {}
