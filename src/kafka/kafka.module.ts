import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ClientsModule, Transport } from '@nestjs/microservices';
import type { KafkaConfigShape } from '@/config/configuration';
import { KAFKA_CLIENT } from '@/kafka/kafka.constants';
import { buildKafkaClientConfig } from '@/kafka/kafka.config';
import { KafkaProducerService } from '@/kafka/kafka-producer.service';

@Global()
@Module({
  imports: [
    ClientsModule.registerAsync([
      {
        name: KAFKA_CLIENT,
        inject: [ConfigService],
        useFactory: (config: ConfigService) => ({
          transport: Transport.KAFKA,
          options: {
            client: buildKafkaClientConfig(
              config.getOrThrow<KafkaConfigShape>('kafka'),
            ),
            producerOnlyMode: true,
            producer: {
              allowAutoTopicCreation: !config.get<boolean>('isProd', false),
            },
          },
        }),
      },
    ]),
  ],
  providers: [KafkaProducerService],
  exports: [KafkaProducerService],
})
export class KafkaModule {}
