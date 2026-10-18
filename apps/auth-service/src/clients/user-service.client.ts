import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

export interface ProfilePayload {
  userId: string;
  role: string;
  email: string;
  name?: string;
  companyStatus: 'pending' | 'approved';
  academic?: { cgpa?: number; branch?: string; passingYear?: number; backlogs?: number };
  academicVerified?: boolean;
}

export interface AuditEntry {
  actorId: string;
  action: string;
  target: string;
  meta?: Record<string, unknown>;
}

const internalHeaders = () => ({ 'x-internal-key': process.env.INTERNAL_API_KEY });

@Injectable()
export class UserServiceClient {
  private readonly logger = new Logger(UserServiceClient.name);

  /** Throws when user-service is unreachable or refuses; the caller decides what to do. */
  async createProfile(body: ProfilePayload): Promise<void> {
    await axios.post(`${process.env.USER_SERVICE_URL}/internal/profiles`, body, {
      headers: internalHeaders(),
      timeout: 5000,
    });
  }

  /** Best effort: an audit failure must never fail the admin action. */
  async audit(entry: AuditEntry): Promise<void> {
    try {
      await axios.post(`${process.env.USER_SERVICE_URL}/internal/audit`, entry, {
        headers: internalHeaders(),
        timeout: 5000,
      });
    } catch (err) {
      this.logger.warn(`audit entry "${entry.action}" was not saved: ${(err as Error).message}`);
    }
  }
}