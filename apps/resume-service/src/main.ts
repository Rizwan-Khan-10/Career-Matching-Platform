import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { JsonLogger } from './common/json-logger';
import { requestIdMiddleware } from './common/request-context';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { logger: new JsonLogger() });
  app.use(requestIdMiddleware);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors();

  // Swagger only when ENABLE_DOCS=true (contract 3.8)
  if (process.env.ENABLE_DOCS === 'true') {
    try {
      const { DocumentBuilder, SwaggerModule } = require('@nestjs/swagger');
      const config = new DocumentBuilder()
        .setTitle('resume-service')
        .setDescription('Resume upload per target role, confirm / replace, delete, signed PDF link')
        .addBearerAuth()
        .build();
      SwaggerModule.setup('docs', app, SwaggerModule.createDocument(app, config));
    } catch {
      console.warn('Swagger docs are enabled but @nestjs/swagger is not installed.');
    }
  }

  await app.listen(process.env.PORT || 3003);
}
bootstrap();