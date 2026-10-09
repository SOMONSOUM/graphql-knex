import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { RbacModule } from '@/modules/rbac/rbac.module';
import { UsersModule } from '@/modules/users/users.module';
import { AuthResolver } from '@/modules/auth/auth.resolver';
import { AuthService } from '@/modules/auth/auth.service';
import { RefreshTokenRepository } from '@/modules/auth/repositories/refresh-token.repository';
import { JwtStrategy } from '@/modules/auth/strategies/jwt.strategy';

@Module({
  imports: [PassportModule, JwtModule.register({}), RbacModule, UsersModule], // secrets are passed per call
  providers: [AuthService, AuthResolver, JwtStrategy, RefreshTokenRepository],
  exports: [AuthService],
})
export class AuthModule {}
