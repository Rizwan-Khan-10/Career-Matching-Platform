import { Module } from '@nestjs/common';
import { AuthSettingsService } from './auth-settings.service';

@Module({ providers: [AuthSettingsService], exports: [AuthSettingsService] })
export class SettingsModule { }
