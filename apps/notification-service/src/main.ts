import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { JsonLogger } from './common/json-logger';
import { requestIdMiddleware } from './common/request-id.middleware';
import { webCorsOptions } from './common/cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(new JsonLogger());
  app.use(requestIdMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors(webCorsOptions()); // WEB_URL only (any origin when unset: local dev)

  // API docs only when explicitly switched on (never in production by default)
  if (process.env.ENABLE_DOCS === 'true') {
    const config = new DocumentBuilder()
      .setTitle('notification-service')
      .setDescription('In-app notifications (list, unread count, mark read). E-mails are sent from the email-queue worker.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  }

  await app.listen(process.env.PORT || 3006);
}
bootstrap();