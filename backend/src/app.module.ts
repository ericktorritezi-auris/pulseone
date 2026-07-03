import { Module } from '@nestjs/common';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { AreasModule } from './areas/areas.module';
import { PositionsModule } from './positions/positions.module';

@Module({
  imports: [PrismaModule, AuthModule, UsersModule, AreasModule, PositionsModule],
})
export class AppModule {}
