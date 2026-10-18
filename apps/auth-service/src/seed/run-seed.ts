import { NestFactory } from '@nestjs/core';
import { SeedModule } from './seed.module';
import { SeedService } from './seed.service';

async function main() {
  try {
    require('dotenv/config'); // dev dependency: in Docker the variables come from the environment instead
  } catch {
    // no dotenv installed, that is fine
  }

  const app = await NestFactory.createApplicationContext(SeedModule, { logger: ['log', 'warn', 'error'] });
  try {
    await app.get(SeedService).run();
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err); // messages never contain the password
  process.exit(1);
});