import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { SeedService } from './seed/seed.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();

  // Docker/CI: create the first admin automatically. A bad ADMIN_* setting stops the start with a clear message.
  if (process.env.SEED_ADMIN_ON_BOOT === 'true') {
    await app.init();
    await app.get(SeedService).run();
  }

  await app.listen(process.env.PORT || 3001);
}
bootstrap();