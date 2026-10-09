import { Global, Module } from '@nestjs/common';
import { KnexService } from '@/database/knex.service';

@Global()
@Module({ providers: [KnexService], exports: [KnexService] })
export class DatabaseModule {}
