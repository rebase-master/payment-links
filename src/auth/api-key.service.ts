import { createHmac } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../database/prisma.service';
import type { Merchant } from '../generated/prisma/client';

@Injectable()
export class ApiKeyService {
  private readonly pepper: string;

  constructor(
    private readonly prisma: PrismaService,
    config: ConfigService,
  ) {
    this.pepper = config.get<string>('API_KEY_PEPPER') ?? '';
  }

  // HMAC-SHA256 keyed by the pepper — the standard keyed-hash construction. A
  // fast hash (not bcrypt) is correct here because API keys are 256-bit random
  // tokens, not low-entropy passwords; the pepper is defence-in-depth against a
  // bare DB read.
  hash(apiKey: string): string {
    return createHmac('sha256', this.pepper).update(apiKey).digest('hex');
  }

  resolveMerchant(apiKey: string): Promise<Merchant | null> {
    return this.prisma.merchant.findUnique({
      where: { apiKeyHash: this.hash(apiKey) },
    });
  }
}
