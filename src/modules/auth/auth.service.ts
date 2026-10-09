import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, JwtSignOptions } from '@nestjs/jwt';
import { randomUUID } from 'crypto';
import type { Knex } from 'knex';
import type { JwtConfigShape } from '@/config/configuration';
import { KnexService } from '@/database/knex.service';
import { KafkaProducerService } from '@/kafka/kafka-producer.service';
import { KafkaTopic } from '@/kafka/kafka-topic.enum';
import { sha256 } from '@/common/utils/hash.util';
import { PasswordUtil } from '@/common/utils/password.util';
import { RbacService } from '@/modules/rbac/rbac.service';
import { CreateUserInput } from '@/modules/users/dto/create-user.input';
import type { SafeUser, UserRow } from '@/modules/users/entities/user.entity';
import { UsersService } from '@/modules/users/users.service';
import { LoginInput } from '@/modules/auth/dto/auth.inputs';
import { InvalidCredentialsException } from '@/modules/auth/exceptions/invalid-credentials.exception';
import { InvalidRefreshTokenException } from '@/modules/auth/exceptions/invalid-refresh-token.exception';
import type { JwtPayload } from '@/modules/auth/interfaces/jwt-payload.interface';
import { RefreshTokenRepository } from '@/modules/auth/repositories/refresh-token.repository';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

export interface UserRegisteredEvent {
  eventId: string;
  occurredAt: string;
  userId: string;
  email: string;
  fullName: string | null;
}

type RefreshOutcome =
  { type: 'ok'; tokens: TokenPair } | { type: 'invalid' } | { type: 'reuse' };

@Injectable()
export class AuthService {
  private readonly jwtConfig: JwtConfigShape;
  private dummyHash?: Promise<string>;

  constructor(
    private readonly users: UsersService,
    private readonly refreshTokens: RefreshTokenRepository,
    private readonly knexService: KnexService,
    private readonly jwt: JwtService,
    private readonly producer: KafkaProducerService,
    private readonly rbac: RbacService,
    config: ConfigService,
  ) {
    this.jwtConfig = config.getOrThrow<JwtConfigShape>('jwt');
  }

  async register(input: CreateUserInput): Promise<SafeUser> {
    const user = await this.users.create(input);

    // Published after the DB commit. Fire-and-forget: a Kafka outage must not fail signup.
    // For guaranteed delivery use the transactional-outbox pattern (see §16.6).
    await this.producer.publish<UserRegisteredEvent>(
      KafkaTopic.USER_REGISTERED,
      user.id,
      {
        eventId: randomUUID(),
        occurredAt: new Date().toISOString(),
        userId: user.id,
        email: user.email,
        fullName: user.fullName,
      },
    );

    return user;
  }

  async login(input: LoginInput, userAgent?: string): Promise<TokenPair> {
    const user = await this.users.findByEmailWithPassword(input.email);

    // Always run one argon2 verification so response time does not reveal whether the email exists.
    const hash = user?.password ?? (await this.getDummyHash());
    const valid = await PasswordUtil.verify(hash, input.password);
    if (!user || !valid || !user.isActive)
      throw new InvalidCredentialsException();

    return this.issueTokens(user, userAgent);
  }

  async refresh(refreshToken: string, userAgent?: string): Promise<TokenPair> {
    await this.verifyRefreshJwt(refreshToken); // signature + expiry
    const tokenHash = sha256(refreshToken);

    const outcome = await this.knexService.transaction<RefreshOutcome>(
      async (trx) => {
        const stored = await this.refreshTokens.findByHash(tokenHash, trx);
        if (!stored) return { type: 'invalid' };

        if (stored.revoked) {
          // A rotated-out token is being replayed: assume theft and kill every session.
          await this.refreshTokens.revokeAllForUser(stored.userId, trx);
          return { type: 'reuse' };
        }
        if (stored.expiresAt <= new Date()) return { type: 'invalid' };

        const user = await this.users.findEntityById(stored.userId);
        if (!user || !user.isActive) return { type: 'invalid' };

        await this.refreshTokens.revoke(stored.id, trx);
        return {
          type: 'ok',
          tokens: await this.issueTokens(user, userAgent, trx),
        };
      },
    );

    // Throw AFTER the transaction so the revoke-all above is committed, not rolled back.
    if (outcome.type !== 'ok') throw new InvalidRefreshTokenException();
    return outcome.tokens;
  }

  async logout(userId: string, refreshToken: string): Promise<void> {
    await this.refreshTokens.revokeByHash(sha256(refreshToken), userId);
  }

  async logoutAll(userId: string): Promise<void> {
    await this.refreshTokens.revokeAllForUser(userId);
  }

  // ---- internals -------------------------------------------------------------------------

  private async issueTokens(
    user: Pick<UserRow, 'id' | 'email'>,
    userAgent?: string,
    trx?: Knex.Transaction,
  ): Promise<TokenPair> {
    const [roles, permissions] = await Promise.all([
      this.rbac.getRoleNames(user.id, trx),
      this.rbac.getPermissions(user.id, trx),
    ]);
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      roles,
      permissions,
    };

    const accessToken = await this.jwt.signAsync(payload, {
      secret: this.jwtConfig.accessSecret,
      expiresIn: this.jwtConfig.accessExpiresIn as JwtSignOptions['expiresIn'],
    });

    // `jwtid` makes every refresh token unique, even two issued within the same second.
    const refreshToken = await this.jwt.signAsync(payload, {
      secret: this.jwtConfig.refreshSecret,
      expiresIn: this.jwtConfig.refreshExpiresIn as JwtSignOptions['expiresIn'],
      jwtid: randomUUID(),
    });

    // Expiry comes from the signed token itself, so config and DB can never disagree.
    const { exp } = this.jwt.decode(refreshToken) as { exp: number };

    await this.refreshTokens.create(
      {
        userId: user.id,
        tokenHash: sha256(refreshToken),
        expiresAt: new Date(exp * 1000),
        revoked: false,
        userAgent: userAgent?.slice(0, 255) ?? null,
      },
      trx,
    );

    return { accessToken, refreshToken };
  }

  private async verifyRefreshJwt(token: string): Promise<void> {
    try {
      await this.jwt.verifyAsync(token, {
        secret: this.jwtConfig.refreshSecret,
        algorithms: ['HS256'],
      });
    } catch {
      throw new InvalidRefreshTokenException();
    }
  }

  private getDummyHash(): Promise<string> {
    return (this.dummyHash ??= PasswordUtil.hash(randomUUID()));
  }
}
