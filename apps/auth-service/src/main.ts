import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { SeedService } from './seed/seed.service';
import { JsonLogger } from './common/json-logger';
import { requestIdMiddleware } from './common/request-id.middleware';
import { webCorsOptions } from './common/cors';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bufferLogs: true });
  app.useLogger(new JsonLogger());
  app.use(requestIdMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors(webCorsOptions()); // WEB_URL only (any origin when unset: local dev)

  // Behind nginx set TRUST_PROXY_HOPS=1 so the login lock sees the real client IP (X-Forwarded-For).
  // Leave it unset when clients reach the service directly, otherwise the header could be spoofed.
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
  if (proxyHops > 0) app.set('trust proxy', proxyHops);

  // API docs only when explicitly switched on (never in production by default)
  if (process.env.ENABLE_DOCS === 'true') {
    const config = new DocumentBuilder()
      .setTitle('auth-service')
      .setDescription('Accounts, JWT access/refresh tokens, password reset, registration mode and admin user import.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  }

  // Docker/CI: create the first admin automatically. A bad ADMIN_* setting stops the start with a clear message.
  if (process.env.SEED_ADMIN_ON_BOOT === 'true') {
    await app.init();
    await app.get(SeedService).run();
  }

  await app.listen(process.env.PORT || 3001);
}
bootstrap();