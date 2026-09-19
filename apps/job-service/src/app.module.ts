import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './redis/redis.module';
import { JwtStrategy } from './auth/strategies/jwt.strategy';
import { JobsModule } from './jobs/jobs.module';
import { InternalModule } from './internal/internal.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    PassportModule,
    JwtModule.register({}),
    PrismaModule,
    RedisModule,
    JobsModule,
    InternalModule,
  ],
  providers: [JwtStrategy],
})
export class AppModule { }