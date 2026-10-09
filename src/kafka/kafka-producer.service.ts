import {
  Inject,
  Injectable,
  Logger,
  OnApplicationShutdown,
  OnModuleInit,
} from '@nestjs/common';
import { ClientKafka } from '@nestjs/microservices';
import { lastValueFrom, timeout } from 'rxjs';
import { KAFKA_CLIENT } from '@/kafka/kafka.constants';

@Injectable()
export class KafkaProducerService
  implements OnModuleInit, OnApplicationShutdown
{
  private readonly logger = new Logger(KafkaProducerService.name);

  constructor(@Inject(KAFKA_CLIENT) private readonly client: ClientKafka) {}

  async onModuleInit() {
    // Note: no subscribeToResponseOf(): that is only for request/response (send), not emit.
    try {
      await this.client.connect();
      this.logger.log('Kafka producer connected');
    } catch (err) {
      // Do not crash the API if Kafka is briefly down; publish() will retry connection lazily.
      this.logger.error(
        `Kafka producer failed to connect: ${(err as Error).message}`,
      );
    }
  }

  async onApplicationShutdown() {
    await this.client.close();
  }

  /** Fire-and-forget safe: logs failures instead of throwing, so callers are never broken by Kafka. */
  async publish<T extends object>(
    topic: string,
    key: string,
    value: T,
  ): Promise<boolean> {
    try {
      await lastValueFrom(
        this.client.emit(topic, { key, value }).pipe(timeout(5_000)),
      );
      return true;
    } catch (err) {
      this.logger.error(
        `Failed to publish to ${topic}: ${(err as Error).message}`,
      );
      return false;
    }
  }
}
