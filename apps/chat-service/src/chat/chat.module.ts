import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ChatRateLimiter } from './chat-rate-limiter.service';
import { ConversationsService } from '../conversations/conversations.service';

@Module({
    controllers: [ChatController],
    providers: [ChatService, ConversationsService, ChatRateLimiter],
})
export class ChatModule { }