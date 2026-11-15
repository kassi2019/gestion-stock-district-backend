/**
 * Module de connexion (authentification).
 *
 * Regroupe :
 *   - AuthController : les routes /api/auth/...
 *   - AuthService    : la logique de connexion
 *   - JwtStrategy    : la vérification du jeton à chaque requête
 *
 * La configuration du jeton (clé secrète, durée de validité) est lue
 * dans le fichier .env : JWT_SECRET et JWT_EXPIRES_IN.
 */
import { Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule,
    JwtModule.registerAsync({
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        secret: config.getOrThrow<string>('JWT_SECRET'),
        signOptions: { expiresIn: config.get<string>('JWT_EXPIRES_IN', '8h') },
      }),
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
})
export class AuthModule {}
