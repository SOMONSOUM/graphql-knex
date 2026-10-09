import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { globalValidationPipe } from '@/common/pipes/validation.pipe';
import { KafkaProducerService } from '@/kafka/kafka-producer.service';
import { AppModule } from '@/app.module';

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const email = `e2e-${Date.now()}@example.com`;
  const password = 'S3cure-Passw0rd';

  const gql = (query: string, token?: string) =>
    request(app.getHttpServer())
      .post('/graphql')
      .set(token ? { Authorization: `Bearer ${token}` } : {})
      .send({ query });

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(KafkaProducerService)
      .useValue({ publish: vi.fn().mockResolvedValue(true) })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(globalValidationPipe);
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('registers, logs in, and reads /me', async () => {
    const reg = await gql(
      `mutation { register(input:{email:"${email}",password:"${password}"}) { id email } }`,
    );
    expect(reg.body.errors).toBeUndefined();

    const login = await gql(
      `mutation { login(input:{email:"${email}",password:"${password}"}) { accessToken refreshToken } }`,
    );
    const { accessToken, refreshToken } = login.body.data.login;

    const me = await gql(
      `query { me { email roles permissions { action resource } } }`,
      accessToken,
    );
    expect(me.body.data.me).toEqual({
      email,
      roles: ['user'],
      permissions: [],
    });

    // rotation: the first refresh works, replaying the old token fails and revokes the family
    const first = await gql(
      `mutation { refreshToken(input:{refreshToken:"${refreshToken}"}) { refreshToken } }`,
    );
    expect(first.body.errors).toBeUndefined();
    const replay = await gql(
      `mutation { refreshToken(input:{refreshToken:"${refreshToken}"}) { accessToken } }`,
    );
    expect(replay.body.errors[0].extensions.code).toBe(
      'ERR_INVALID_REFRESH_TOKEN',
    );
  });

  it('rejects unauthenticated access with ERR_UNAUTHORIZED', async () => {
    const res = await gql(`query { me { id } }`);
    expect(res.body.errors[0].extensions.code).toBe('ERR_UNAUTHORIZED');
  });

  it('forbids non-admins from listing users', async () => {
    const login = await gql(
      `mutation { login(input:{email:"${email}",password:"${password}"}) { accessToken } }`,
    );
    const res = await gql(
      `query { users { data { id } } }`,
      login.body.data.login.accessToken,
    );
    expect(res.body.errors[0].extensions.code).toBe('ERR_FORBIDDEN');
  });
});
