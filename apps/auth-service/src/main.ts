import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { SeedService } from './seed/seed.service';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();

  // Behind nginx set TRUST_PROXY_HOPS=1 so the login lock sees the real client IP (X-Forwarded-For).
  // Leave it unset when clients reach the service directly, otherwise the header could be spoofed.
  const proxyHops = Number(process.env.TRUST_PROXY_HOPS || 0);
  if (proxyHops > 0) app.set('trust proxy', proxyHops);

  // Docker/CI: create the first admin automatically. A bad ADMIN_* setting stops the start with a clear message.
  if (process.env.SEED_ADMIN_ON_BOOT === 'true') {
    await app.init();
    await app.get(SeedService).run();
  }

  await app.listen(process.env.PORT || 3001);
}
bootstrap();