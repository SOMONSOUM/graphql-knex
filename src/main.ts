import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import { NestExpressApplication } from '@nestjs/platform-express';
import { MicroserviceOptions, Transport } from '@nestjs/microservices';
import compression from 'compression';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import type { KafkaConfigShape } from '@/config/configuration';
import { globalValidationPipe } from '@/common/pipes/validation.pipe';
import { buildKafkaClientConfig } from '@/kafka/kafka.config';
import { AppModule } from '@/app.module';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });
  app.useLogger(app.get(Logger));

  const config = app.get(ConfigService);
  const isProd = config.get<boolean>('isProd', false);
  const kafkaEnabled = config.get<boolean>('kafka.enabled', false);

  app.set('trust proxy', 1); // correct client IPs behind a load balancer (throttling, logs)
  app.use(helmet({ contentSecurityPolicy: isProd })); // default CSP would block the embedded Sandbox in dev
  app.use(compression());
  app.useBodyParser('json', { limit: '100kb' });

  const origins = config.get<string[]>('corsOrigins', []);
  app.enableCors({
    origin: origins.length ? origins : false, // empty list = no cross-origin access
    credentials: true,
    methods: ['GET', 'POST', 'OPTIONS'],
  });

  app.useGlobalPipes(globalValidationPipe);
  app.enableShutdownHooks(); // SIGTERM -> onModuleDestroy / onApplicationShutdown (closes DB, Redis, Kafka)

  if (kafkaEnabled) {
    const kafka = config.getOrThrow<KafkaConfigShape>('kafka');
    // Kafka consumer in the same process (hybrid app)
    app.connectMicroservice<MicroserviceOptions>({
      transport: Transport.KAFKA,
      options: {
        client: buildKafkaClientConfig(kafka),
        consumer: { groupId: kafka.groupId, allowAutoTopicCreation: !isProd },
      },
    });
    await app.startAllMicroservices();
  }

  await app.listen(config.getOrThrow<number>('port'), '0.0.0.0');
  app
    .get(Logger)
    .log(
      `API ready on http://${config.get('host')}:${config.get('port') + '/graphql'}`,
    );
}

bootstrap();
