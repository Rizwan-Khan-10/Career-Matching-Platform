import { Injectable } from '@nestjs/common';

@Injectable()
export class ConnectionRegistryService {
    private map = new Map<string, string>(); // userId -> socketId

    register(userId: string, socketId: string) {
        this.map.set(userId, socketId);
    }

    unregister(userId: string) {
        this.map.delete(userId);
    }

    getSocketId(userId: string): string | undefined {
        return this.map.get(userId);
    }
}