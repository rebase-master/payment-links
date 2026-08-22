import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  ServiceUnavailableException,
} from '@nestjs/common';
import { HealthService } from './health.service';

@Controller('health')
export class HealthController {
  constructor(private readonly health: HealthService) {}

  @Get('live')
  @HttpCode(HttpStatus.OK)
  live(): { status: 'ok' } {
    return { status: 'ok' };
  }

  @Get('ready')
  async ready(): Promise<{ status: 'ok'; database: 'up' }> {
    const dbUp = await this.health.pingDatabase();
    if (!dbUp) {
      throw new ServiceUnavailableException({
        status: 'error',
        database: 'down',
      });
    }
    return { status: 'ok', database: 'up' };
  }
}
