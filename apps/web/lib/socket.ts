import { io, Socket } from 'socket.io-client';

let socket: Socket | null = null;
let latestToken = '';

export function getSocket(token: string): Socket {
    latestToken = token; // pages call getSocket(token) with the current token, so a refreshed token is picked up on reconnect
    if (!socket) {
        socket = io(process.env.NEXT_PUBLIC_WS_URL || 'http://localhost:3007', {
            auth: (cb) => cb({ token: latestToken }),
        });
    }
    return socket;
}

export function disconnectSocket() {
    socket?.disconnect();
    socket = null;
}