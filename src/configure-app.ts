import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DomainExceptionFilter } from './common/filters/domain-exception.filter';

// The global pipes and filters shared by the bootstrap (main.ts) and the e2e
// specs, so tests exercise the same request pipeline as production rather than
// silently diverging from it.
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
  app.useGlobalFilters(new DomainExceptionFilter());
}
