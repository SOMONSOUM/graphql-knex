import { Args, Context, Mutation, Resolver } from '@nestjs/graphql';
import type { Request } from 'express';
import { Throttle } from '@nestjs/throttler';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';
import { CreateUserInput } from '@/modules/users/dto/create-user.input';
import { UserModel } from '@/modules/users/models/user.model';
import { AuthService } from '@/modules/auth/auth.service';
import { LoginInput, RefreshTokenInput } from '@/modules/auth/dto/auth.inputs';
import type { JwtPayload } from '@/modules/auth/interfaces/jwt-payload.interface';
import { AuthPayloadModel } from '@/modules/auth/models/auth-payload.model';

// Brute-force protection: 5 attempts per minute per client on the sensitive mutations (ttl in ms).
const STRICT = {
  short: { limit: 5, ttl: 60_000 },
  medium: { limit: 5, ttl: 60_000 },
  long: { limit: 5, ttl: 60_000 },
};

@Resolver()
export class AuthResolver {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle(STRICT)
  @Mutation(() => UserModel)
  register(@Args('input') input: CreateUserInput) {
    return this.authService.register(input);
  }

  @Public()
  @Throttle(STRICT)
  @Mutation(() => AuthPayloadModel)
  login(@Args('input') input: LoginInput, @Context('req') req: Request) {
    return this.authService.login(input, req.headers['user-agent']);
  }

  @Public()
  @Throttle({
    short: { limit: 10, ttl: 60_000 },
    medium: { limit: 10, ttl: 60_000 },
    long: { limit: 10, ttl: 60_000 },
  })
  @Mutation(() => AuthPayloadModel)
  refreshToken(
    @Args('input') input: RefreshTokenInput,
    @Context('req') req: Request,
  ) {
    return this.authService.refresh(
      input.refreshToken,
      req.headers['user-agent'],
    );
  }

  @Mutation(() => Boolean)
  async logout(
    @CurrentUser() user: JwtPayload,
    @Args('input') input: RefreshTokenInput,
  ) {
    await this.authService.logout(user.sub, input.refreshToken);
    return true;
  }

  @Mutation(() => Boolean)
  async logoutAll(@CurrentUser() user: JwtPayload) {
    await this.authService.logoutAll(user.sub);
    return true;
  }
}
