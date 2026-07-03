import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Same-origin: Next.js faz o proxy de /api -> localhost:INTERNAL_API_PORT
  // dentro do mesmo container, então CORS não é necessário em produção.
  app.enableCors({ origin: true, credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.setGlobalPrefix('api');

  const port = process.env.INTERNAL_API_PORT ?? 3333;
  await app.listen(port);
  console.log(`PulseOne API rodando na porta ${port}`);
}
bootstrap();
