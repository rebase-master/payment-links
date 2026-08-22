import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Pool } from 'pg';

@Injectable()
export class HealthService implements OnModuleDestroy {
  private readonly logger = new Logger(HealthService.name);
  private readonly pool: Pool;

  constructor(config: ConfigService) {
    this.pool = new Pool({
      connectionString: config.getOrThrow<string>('DATABASE_URL'),
      max: 2,
      connectionTimeoutMillis: 2000,
      query_timeout: 2000,
    });

    this.pool.on('error', (err) => {
      this.logger.warn(`idle database client error: ${err.message}`);
    });
  }

  async pingDatabase(): Promise<boolean> {
    try {
      await this.pool.query('SELECT 1');
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.logger.warn(`readiness database ping failed: ${message}`);
      return false;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.pool.end();
  }
}
