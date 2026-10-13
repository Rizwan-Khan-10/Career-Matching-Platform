import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';

function requireEnv(name: string): string {
    const v = process.env[name];
    if (!v) throw new Error(`${name} is not set (check apps/chat-service/.env)`);
    return v;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor() {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false,
            secretOrKey: requireEnv('JWT_SECRET'),
        });
    }

    async validate(payload: { sub: string; role: string }) {
        return { userId: payload.sub, role: payload.role };
    }
}