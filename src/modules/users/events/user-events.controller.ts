import { Controller, Logger } from '@nestjs/common';
import { EventPattern, Payload } from '@nestjs/microservices';
import { CacheService } from '@/common/cache/cache.service';
import { KafkaProducerService } from '@/kafka/kafka-producer.service';
import { KafkaTopic } from '@/kafka/kafka-topic.enum';
import type { UserRegisteredEvent } from '@/modules/auth/auth.service';

@Controller()
export class UserEventsController {
  private readonly logger = new Logger(UserEventsController.name);

  constructor(
    private readonly cache: CacheService,
    private readonly producer: KafkaProducerService,
  ) {}

  @EventPattern(KafkaTopic.USER_REGISTERED)
  async onUserRegistered(@Payload() event: UserRegisteredEvent) {
    const firstTime = await this.cache.setIfAbsent(
      `events:processed:${event.eventId}`,
      24 * 3600,
    );
    if (!firstTime) {
      this.logger.debug(`Skipping duplicate event ${event.eventId}`);
      return;
    }

    try {
      // Replace with a real MailService call (use a provider API with its own idempotency key).
      this.logger.log(
        `Sending welcome email to ${event.email} (user ${event.userId})`,
      );
    } catch (err) {
      this.logger.error(
        `Handling ${event.eventId} failed: ${(err as Error).message}`,
      );
      await this.producer.publish(
        KafkaTopic.USER_REGISTERED_DLQ,
        event.userId,
        event,
      );
    }
  }
}
