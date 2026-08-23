import type { ConfigService } from '@nestjs/config';
import { PrismaService } from './prisma.service';

function newService(): PrismaService {
  const config = {
    getOrThrow: jest
      .fn()
      .mockReturnValue('postgresql://u:p@localhost:5442/payment_links'),
  } as unknown as ConfigService;
  return new PrismaService(config);
}

describe('PrismaService', () => {
  it('connects on module init', async () => {
    const service = newService();
    const connect = jest
      .spyOn(service, '$connect')
      .mockResolvedValue(undefined);

    await service.onModuleInit();

    expect(connect).toHaveBeenCalledTimes(1);
  });

  it('disconnects on module destroy', async () => {
    const service = newService();
    const disconnect = jest
      .spyOn(service, '$disconnect')
      .mockResolvedValue(undefined);

    await service.onModuleDestroy();

    expect(disconnect).toHaveBeenCalledTimes(1);
  });
});
