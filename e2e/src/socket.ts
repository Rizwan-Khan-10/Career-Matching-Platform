import { io, type Socket } from 'socket.io-client';
import { config } from './config';

export async function connectSocket(token: string): Promise<Socket> {
  const socket = io(config.baseUrl, { path: '/socket.io', auth: { token }, transports: ['websocket'], reconnection: false });
  await new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`socket did not connect through nginx (${config.baseUrl}/socket.io)`)), 15_000);
    socket.once('connect', () => {
      clearTimeout(timer);
      resolve();
    });
    socket.once('connect_error', (err) => {
      clearTimeout(timer);
      reject(new Error(`socket connect_error: ${err.message}`));
    });
  });
  return socket;
}

/** Start recording BEFORE the action that triggers the event, so nothing can be missed. */
export function recordEvents<T = any>(socket: Socket, event: string): T[] {
  const seen: T[] = [];
  socket.on(event, (payload: T) => seen.push(payload));
  return seen;
}