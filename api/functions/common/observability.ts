import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';

export interface Observability {
  logger: Logger;
  tracer: Tracer;
  metrics: Metrics;
}

export const createObservability = (serviceName: string): Observability => {
  const logger = new Logger({ serviceName });
  const tracer = new Tracer({ serviceName });
  const metrics = new Metrics({ namespace: 'Promptatron3000', serviceName });
  return { logger, tracer, metrics };
};
