import { createHash } from 'node:crypto';
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

  // API keys are 256-bit random tokens, so a fast SHA-256 lookup is the right
  // tool — bcrypt/argon2 exist to slow down guessing of low-entropy passwords,
  // which does not apply here. The pepper adds defence-in-depth against a bare
  // DB read.
  hash(apiKey: string): string {
    return createHash('sha256').update(`${apiKey}${this.pepper}`).digest('hex');
  }

  resolveMerchant(apiKey: string): Promise<Merchant | null> {
    return this.prisma.merchant.findUnique({
      where: { apiKeyHash: this.hash(apiKey) },
    });
  }
}
