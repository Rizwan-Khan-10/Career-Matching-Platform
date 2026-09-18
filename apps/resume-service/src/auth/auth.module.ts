import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { JwtStrategy } from './strategies/jwt.strategy';

@Module({
    imports: [PassportModule, JwtModule.register({})],
    providers: [JwtStrategy],
    exports: [JwtStrategy],
})
export class AuthModule { }