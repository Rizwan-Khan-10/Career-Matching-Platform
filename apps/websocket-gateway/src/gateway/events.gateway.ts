import { WebSocketGateway, WebSocketServer, OnGatewayConnection } from '@nestjs/websockets';
import { Server, Socket } from 'socket.io';
import { JwtService } from '@nestjs/jwt';
import { corsOrigin } from '../config/cors';

export const roomOf = (userId: string) => `user:${userId}`;

@WebSocketGateway({ cors: { origin: corsOrigin } }) // only WEB_URL may connect from a browser
export class EventsGateway implements OnGatewayConnection {
    @WebSocketServer() server: Server;

    constructor(private jwt: JwtService) { }

    handleConnection(client: Socket) {
        const token = client.handshake.auth?.token || client.handshake.query?.token;
        try {
            const payload: any = this.jwt.verify(token as string, { secret: process.env.JWT_SECRET });
            if (typeof payload?.sub !== 'string' || payload.sub.length === 0) throw new Error('token has no subject');
            // One ROOM per user instead of a userId -> socketId map: several tabs all receive events, and a page reload
            // (new socket connects BEFORE the old one's disconnect arrives) can no longer unregister the live socket.
            void client.join(roomOf(payload.sub));
        } catch {
            client.disconnect();
        }
    }

    /** Throws while the socket server is not ready yet, so the stream consumer retries instead of losing the event. */
    pushToUser(userId: string, event: string, data: unknown) {
        if (!this.server) throw new Error('socket server is not ready');
        this.server.to(roomOf(userId)).emit(event, data);
    }
}