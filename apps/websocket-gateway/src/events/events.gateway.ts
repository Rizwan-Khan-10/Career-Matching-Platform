import { OnGatewayConnection, WebSocketGateway, WebSocketServer } from '@nestjs/websockets';
import { JwtService } from '@nestjs/jwt';
import { Server, Socket } from 'socket.io';

@WebSocketGateway({ cors: { origin: true, credentials: true } })
export class EventsGateway implements OnGatewayConnection {
  @WebSocketServer() server!: Server;

  constructor(private jwt: JwtService) {}

  handleConnection(client: Socket) {
    try {
      const token = client.handshake.auth?.token as string | undefined;
      if (!token) throw new Error('no token');
      const payload = this.jwt.verify<{ sub: string; role: string }>(token, {
        secret: process.env.JWT_SECRET || 'dev-secret',
      });
      client.data.userId = payload.sub;
      client.join(`user:${payload.sub}`); // har user ka apna room
    } catch {
      client.disconnect(true);
    }
  }

  emitToUser(userId: string, event: string, data: unknown) {
    this.server.to(`user:${userId}`).emit(event, data);
  }
}