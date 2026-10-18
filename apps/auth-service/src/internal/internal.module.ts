import { Module } from '@nestjs/common';
import { SettingsModule } from '../settings/settings.module';
import { InternalController } from './internal.controller';
import { InternalSettingsController } from './internal-settings.controller';

@Module({
  imports: [SettingsModule],
  controllers: [InternalController, InternalSettingsController],
})
export class InternalModule {}