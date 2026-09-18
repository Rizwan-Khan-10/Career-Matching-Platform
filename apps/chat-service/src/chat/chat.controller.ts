import { Body, Controller, Get, Param, Patch, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import type { AuthenticatedRequest } from '../auth/types/authenticated-request';
import { ChatService } from './chat.service';
import { ConversationsService } from '../conversations/conversations.service';
import { SendMessageDto } from './dto/send-message.dto';
import { RenameConversationDto } from '../conversations/dto/rename-conversation.dto';

@UseGuards(JwtAuthGuard)
@Controller('chat')
export class ChatController {
    constructor(
        private chatService: ChatService,
        private conversationsService: ConversationsService,
    ) { }

    @UseGuards(RolesGuard)
    @Roles('APPLICANT')
    @Get('conversations')
    listConversations(@Req() req: AuthenticatedRequest) {
        return this.conversationsService.listForApplicant(req.user.userId, req.headers.authorization!);
    }

    @UseGuards(RolesGuard)
    @Roles('APPLICANT')
    @Patch('conversations/:id')
    rename(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: RenameConversationDto) {
        return this.conversationsService.rename(id, req.user.userId, dto.name);
    }

    @UseGuards(RolesGuard)
    @Roles('APPLICANT')
    @Get('conversations/:id/messages')
    getMessages(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
        return this.conversationsService.getMessages(id, req.user.userId);
    }

    @UseGuards(RolesGuard)
    @Roles('APPLICANT')
    @Post('conversations/:id/messages')
    sendMessage(@Req() req: AuthenticatedRequest, @Param('id') id: string, @Body() dto: SendMessageDto) {
        return this.chatService.sendMessage(id, req.user.userId, req.user.role, dto.message);
    }

    @UseGuards(RolesGuard)
    @Roles('COMPANY')
    @Post('quick')
    quickAsk(@Req() req: AuthenticatedRequest, @Body() dto: SendMessageDto) {
        return this.chatService.quickAsk(req.user.userId, dto.message);
    }
}