import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: (() => {
        const secret = process.env.JWT_SECRET;
        if (!secret) throw new Error('JWT_SECRET is not set (check this service\'s .env)');
        return secret;
      })(),
    });
  }

  // `sid` identifies the device session; tokens issued before sessions existed have none.
  async validate(payload: { sub: string; role: string; sid?: string }) {
    return { userId: payload.sub, role: payload.role, sessionId: payload.sid };
  }
}