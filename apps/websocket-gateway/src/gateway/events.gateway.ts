import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';

const roomOf = (userId: string) => `user:${userId}`;

@WebSocketGateway({ cors: { origin: '*' } })
export class EventsGateway implements OnGatewayConnection {
    @WebSocketServer() server: Server;

    constructor(private jwt: JwtService) { }

    handleConnection(client: Socket) {
        const token = client.handshake.auth?.token || client.handshake.query?.token;
        try {
            const payload: any = this.jwt.verify(token as string, { secret: process.env.JWT_SECRET });
            // One ROOM per user instead of a userId -> socketId map: several tabs all receive events, and a page reload
            // (new socket connects BEFORE the old one's disconnect arrives) can no longer unregister the live socket.
            void client.join(roomOf(payload.sub));
        } catch {
            client.disconnect();
        }
    }

    pushToUser(userId: string, event: string, data: any) {
        this.server.to(roomOf(userId)).emit(event, data);
    }
}