import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { corsOrigin } from './config/cors';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: corsOrigin }); // WEB_URL only (the socket.io server uses the same rule)
  app.enableShutdownHooks(); // closes the Redis connections when the container stops
  await app.listen(process.env.PORT || 3007);
}
bootstrap();