import { Injectable } from '@nestjs/common';

@Injectable()
export class NoopKafkaProducerService {
  async publish<T extends object>(
    _topic: string,
    _key: string,
    _value: T,
  ): Promise<boolean> {
    return false;
  }
}
