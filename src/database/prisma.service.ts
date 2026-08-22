import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger: Logger;

  constructor(config: ConfigService) {
    const logger = new Logger(PrismaService.name);

    super({
      adapter: new PrismaPg(
        {
          connectionString: config.getOrThrow<string>('DATABASE_URL'),
          connectionTimeoutMillis: 5000,
          query_timeout: 5000,
          statement_timeout: 5000,
          max: 10,
        },
        {
          onPoolError: (err) => {
            logger.warn(`idle database client error: ${err.message}`);
          },
        },
      ),
    });

    this.logger = logger;
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('database connection established');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
