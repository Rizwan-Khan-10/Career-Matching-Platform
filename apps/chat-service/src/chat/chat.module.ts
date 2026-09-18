import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { ConversationsService } from '../conversations/conversations.service';

@Module({
    controllers: [ChatController],
    providers: [ChatService, ConversationsService],
})
export class ChatModule { }