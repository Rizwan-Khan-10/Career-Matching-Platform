import {
    WebSocketGateway, WebSocketServer, OnGatewayConnection, OnGatewayDisconnect,
} from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { ConnectionRegistryService } from './connection-registry.service';

@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway implements OnGatewayConnection, OnGatewayDisconnect {
    @WebSocketServer() server: Server;

    constructor(private jwt: JwtService, private registry: ConnectionRegistryService) { }

    handleConnection(client: Socket) {
        const token = client.handshake.auth?.token || client.handshake.query?.token;
        try {
            const payload: any = this.jwt.verify(token as string, { secret: process.env.JWT_SECRET });
            this.registry.register(payload.sub, client.id);
            (client as any).userId = payload.sub;
        } catch {
            client.disconnect();
        }
    }

    handleDisconnect(client: Socket) {
        const userId = (client as any).userId;
        if (userId) this.registry.unregister(userId);
    }

    pushToUser(userId: string, event: string, data: any) {
        const socketId = this.registry.getSocketId(userId);
        if (socketId) {
            this.server.to(socketId).emit(event, data);
        }
    }
}