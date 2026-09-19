import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventsGateway } from './events.gateway';
import { ConnectionRegistryService } from './connection-registry.service';
import { GatewayStreamConsumerService } from './stream-consumer.service';

@Module({
    imports: [JwtModule.register({})],
    providers: [EventsGateway, ConnectionRegistryService, GatewayStreamConsumerService],
})
export class GatewayModule { }