import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import type { MerchantPrincipal } from './merchant-principal';
import { hashApiKey } from './hash-api-key';

@Injectable()
export class ApiKeyService {
  private readonly pepper: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.pepper = config.get<string>('API_KEY_PEPPER') ?? '';
  }

  hash(apiKey: string): string {
    return hashApiKey(apiKey, this.pepper);
  }

  resolveMerchant(apiKey: string): Promise<MerchantPrincipal | null> {
    return this.prisma.merchant.findUnique({
      where: { apiKeyHash: this.hash(apiKey) },
      select: { id: true, name: true },
    });
  }
}
