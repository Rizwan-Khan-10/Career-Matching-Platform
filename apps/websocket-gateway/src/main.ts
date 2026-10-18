import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { corsOrigin } from './config/cors';
import { JsonLogger } from './common/json-logger';
import { requestIdMiddleware } from './common/request-id.middleware';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bufferLogs: true });
  app.useLogger(new JsonLogger());
  app.use(requestIdMiddleware);
  app.enableCors({ origin: corsOrigin }); // WEB_URL only (the socket.io server uses the same rule)
  app.enableShutdownHooks(); // closes the Redis connections when the container stops

  // API docs only when explicitly switched on (never in production by default). Only /health is documented:
  // the socket.io endpoint is described in the README.
  if (process.env.ENABLE_DOCS === 'true') {
    const config = new DocumentBuilder()
      .setTitle('websocket-gateway')
      .setDescription('socket.io server (path /socket.io/). The only HTTP route is /health.')
      .setVersion('1.0')
      .build();
    SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
  }

  await app.listen(process.env.PORT || 3007);
}
bootstrap();