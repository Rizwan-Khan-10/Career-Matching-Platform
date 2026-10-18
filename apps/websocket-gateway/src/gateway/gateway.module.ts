import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { EventsGateway } from './events.gateway';
import { GatewayStreamConsumerService } from './stream-consumer.service';

@Module({
    imports: [JwtModule.register({})],
    providers: [EventsGateway, GatewayStreamConsumerService],
})
export class GatewayModule { }