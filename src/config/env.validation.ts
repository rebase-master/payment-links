import { plainToInstance } from 'class-transformer';
import {
  IsEnum,
  IsInt,
  IsString,
  Matches,
  Max,
  Min,
  validateSync,
} from 'class-validator';

export enum NodeEnv {
  Development = 'development',
  Production = 'production',
  Test = 'test',
}

export class EnvironmentVariables {
  @IsEnum(NodeEnv)
  NODE_ENV: NodeEnv = NodeEnv.Development;

  @IsInt()
  @Min(1)
  @Max(65535)
  PORT: number = 3000;

  @IsString()
  @Matches(/^postgres(ql)?:\/\/.+/i, {
    message: 'DATABASE_URL must be a postgres:// connection string',
  })
  DATABASE_URL!: string;
}

export function validateEnv(
  raw: Record<string, unknown>,
): EnvironmentVariables {
  const parsed = plainToInstance(EnvironmentVariables, raw, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(parsed, { skipMissingProperties: false });
  if (errors.length > 0) {
    const details = errors
      .map(
        (e) =>
          `  ${e.property}: ${Object.values(e.constraints ?? {}).join('; ')}`,
      )
      .join('\n');
    throw new Error(`Invalid environment variables:\n${details}`);
  }

  return parsed;
}
