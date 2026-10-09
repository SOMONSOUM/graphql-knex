import type { KafkaConfig, SASLOptions } from 'kafkajs';
import type { KafkaConfigShape } from '@/config/configuration';

export function buildKafkaClientConfig(k: KafkaConfigShape): KafkaConfig {
  return {
    clientId: k.clientId,
    brokers: k.brokers,
    ssl: k.ssl,
    ...(k.sasl
      ? {
          sasl: {
            mechanism: k.sasl.mechanism,
            username: k.sasl.username,
            password: k.sasl.password,
          } as SASLOptions,
        }
      : {}),
    retry: { retries: 8, initialRetryTime: 300 },
  };
}
