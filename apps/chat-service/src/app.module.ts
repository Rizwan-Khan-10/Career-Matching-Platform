import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { ChatModule } from './chat/chat.module';

@Module({
  // without ConfigModule the .env file is NEVER loaded: no DATABASE_URL, no JWT_SECRET, no service URLs
  imports: [ConfigModule.forRoot({ isGlobal: true }), PrismaModule, AuthModule, ChatModule],
})
export class AppModule {}