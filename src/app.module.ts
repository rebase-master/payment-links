import { Module } from '@nestjs/common';
import { ApolloDriver, ApolloDriverConfig } from '@nestjs/apollo';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { GraphQLModule } from '@nestjs/graphql';
import { LoggerModule } from 'nestjs-pino';
import { NodeEnv, validateEnv } from './config/env.validation';
import { loggerConfig } from './logging/logger.config';
import { DatabaseModule } from './database/database.module';
import { HealthModule } from './health/health.module';
import { MetricsModule } from './metrics/metrics.module';
import { PaymentsModule } from './payments/payments.module';
import { graphqlOptions } from './common/graphql/graphql-options';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
    }),
    LoggerModule.forRoot(loggerConfig()),
    GraphQLModule.forRootAsync<ApolloDriverConfig>({
      driver: ApolloDriver,
      inject: [ConfigService],
      useFactory: (config: ConfigService) =>
        graphqlOptions(config.getOrThrow<NodeEnv>('NODE_ENV')),
    }),
    DatabaseModule,
    HealthModule,
    MetricsModule,
    PaymentsModule,
  ],
})
export class AppModule {}
