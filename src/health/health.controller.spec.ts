import { ServiceUnavailableException } from '@nestjs/common';
import { HealthController } from './health.controller';
import type { HealthService } from './health.service';

function controllerWith(dbUp: boolean): HealthController {
  const service = {
    pingDatabase: jest.fn().mockResolvedValue(dbUp),
  } as unknown as HealthService;
  return new HealthController(service);
}

describe('HealthController', () => {
  it('live() always returns ok', () => {
    expect(controllerWith(true).live()).toEqual({ status: 'ok' });
  });

  it('ready() returns ok when the database is up', async () => {
    await expect(controllerWith(true).ready()).resolves.toEqual({
      status: 'ok',
      database: 'up',
    });
  });

  it('ready() throws 503 when the database is down', async () => {
    await expect(controllerWith(false).ready()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });
});
