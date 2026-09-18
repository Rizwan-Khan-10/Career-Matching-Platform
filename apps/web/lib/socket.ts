import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;

export function getSocket(token: string): Socket {
    if (!socket) {
        socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3007', {
            auth: { token },
        });
    }
    return socket;
}

export function disconnectSocket() {
    socket?.disconnect();
    socket = null;
}