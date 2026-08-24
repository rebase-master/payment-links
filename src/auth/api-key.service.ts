import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import type { Merchant } from '../generated/prisma/client';
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

  resolveMerchant(apiKey: string): Promise<Merchant | null> {
    return this.prisma.merchant.findUnique({
      where: { apiKeyHash: this.hash(apiKey) },
    });
  }
}
