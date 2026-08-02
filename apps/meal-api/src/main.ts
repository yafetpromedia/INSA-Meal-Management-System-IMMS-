import { ValidationPipe, VersioningType, UnprocessableEntityException } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { json, urlencoded } from 'express';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { ResponseEnvelopeInterceptor } from './common/interceptors/response-envelope.interceptor';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const isProd = process.env.NODE_ENV === 'production';

  // Trust reverse proxy for correct client IP (throttling / audit)
  const expressApp = app.getHttpAdapter().getInstance();
  if (typeof expressApp?.set === 'function') {
    expressApp.set('trust proxy', 1);
  }

  app.use(json({ limit: '1mb' }));
  app.use(urlencoded({ extended: true, limit: '1mb' }));

  // Lightweight security headers (no extra dependency)
  app.use((_req: unknown, res: { setHeader: (k: string, v: string) => void }, next: () => void) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-XSS-Protection', '0');
    res.setHeader('Permissions-Policy', 'camera=(self), microphone=(), geolocation=()');
    if (isProd) {
      res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    }
    next();
  });

  app.setGlobalPrefix('api');
  app.enableVersioning({
    type: VersioningType.URI,
    defaultVersion: '1',
  });
  const corsFromEnv = process.env.CORS_ORIGIN?.split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const defaultOrigins = [
    'http://localhost:3000',
    'http://127.0.0.1:3000',
    'http://localhost:3001',
    'http://127.0.0.1:3001',
  ];
  app.enableCors({
    origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
      // Non-browser / same-origin requests
      if (!origin) {
        callback(null, true);
        return;
      }
      const allowed = corsFromEnv?.length ? corsFromEnv : defaultOrigins;
      if (allowed.includes('*') || allowed.includes(origin)) {
        callback(null, true);
        return;
      }
      // Local / LAN web apps in development (phone testing on Wi‑Fi)
      if (
        !isProd &&
        /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d{1,3}\.\d{1,3}|10\.\d{1,3}\.\d{1,3}\.\d{1,3})(:\d+)?$/i.test(
          origin,
        )
      ) {
        callback(null, true);
        return;
      }
      callback(new Error(`CORS blocked for origin: ${origin}`), false);
    },
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      exceptionFactory: (details) =>
        new UnprocessableEntityException({
          message: 'Validation failed',
          error: 'VALIDATION_ERROR',
          errors: details.map((d) => ({
            field: d.property,
            message: Object.values(d.constraints ?? {}).join(', ') || 'Invalid value',
          })),
        }),
    }),
  );
  app.useGlobalFilters(new AllExceptionsFilter());
  app.useGlobalInterceptors(new ResponseEnvelopeInterceptor(app.get(Reflector)));

  // Swagger only when explicitly enabled AND not production
  const swaggerEnabled = process.env.SWAGGER_ENABLED === 'true' && !isProd;
  if (swaggerEnabled) {
    const config = new DocumentBuilder()
      .setTitle('INSA Meal Management System API')
      .setDescription('IMMS REST API (SRS Part 6)')
      .setVersion('1')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, config);
    SwaggerModule.setup('api/docs', app, document);
  }

  if (isProd) {
    const secret = process.env.JWT_ACCESS_SECRET ?? '';
    if (secret.length < 32) {
      throw new Error('JWT_ACCESS_SECRET must be at least 32 characters in production');
    }
  }

  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`IMMS meal-api listening on http://localhost:${port}/api/v1`);
  if (swaggerEnabled) {
    // eslint-disable-next-line no-console
    console.log(`Swagger docs: http://localhost:${port}/api/docs`);
  }
}

bootstrap();
