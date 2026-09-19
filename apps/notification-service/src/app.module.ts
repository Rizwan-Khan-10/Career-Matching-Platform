import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EmailService } from './email/email.service';
import { EmailWorker } from './queue/email.worker';

@Module({
  imports: [ConfigModule.forRoot({ isGlobal: true })],
  providers: [EmailService, EmailWorker],
})
export class AppModule {}