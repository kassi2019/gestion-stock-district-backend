/**
 * =============================================================================
 * MODULE PRINCIPAL DE L'APPLICATION
 * =============================================================================
 * NestJS organise le code en "modules". Un module regroupe tout ce qui concerne
 * une fonctionnalité (ex. AuthModule = connexion des utilisateurs).
 *
 * Ce module principal :
 *   - charge tous les autres modules (liste "imports") ;
 *   - active deux protections sur TOUTES les routes de l'API :
 *       a) JwtAuthGuard : l'utilisateur doit être connecté ;
 *       b) RolesGuard   : l'utilisateur doit avoir le bon profil (si demandé).
 *
 * ➜ Quand vous créez un nouveau module (ex. CentresModule), ajoutez-le
 *   dans la liste "imports" ci-dessous.
 * =============================================================================
 */
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { PrismaModule } from './prisma/prisma.module';
import { AuditModule } from './audit/audit.module';
import { AuthModule } from './auth/auth.module';
import { ParametrageModule } from './parametrage/parametrage.module';
import { UtilisateursModule } from './utilisateurs/utilisateurs.module';
import { AchatsModule } from './achats/achats.module';
import { StockModule } from './stock/stock.module';
import { ScheduleModule } from '@nestjs/schedule';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { RolesGuard } from './auth/roles.guard';
import { AccesGuard } from './auth/acces.guard';

@Module({
  imports: [
    // Lit le fichier .env et rend ses variables disponibles partout
    ConfigModule.forRoot({ isGlobal: true }),

    // Accès à la base de données SQL Server
    PrismaModule,

    // Journal d'audit (traçabilité des opérations)
    AuditModule,

    // Connexion des utilisateurs
    AuthModule,

    // 01 — Paramétrage : centres, fournisseurs, familles, médicaments, prix, paramètres
    ParametrageModule,

    // 02 — Utilisateurs : comptes, profils, mots de passe
    UtilisateursModule,

    // 03 — Approvisionnements et achats : commandes fournisseurs, réceptions, entrée en stock
    AchatsModule,

    // 04 — Gestion du dépôt et des stocks : état, mouvements, ajustements, inventaires
    StockModule,

    // Tâches planifiées (ex. sortie automatique des lots périmés chaque nuit)
    ScheduleModule.forRoot(),

    // ➜ Ajouter ici les prochains modules (livraisons, ...)
  ],
  providers: [
    // Protection n°1 : connexion obligatoire (sauf routes marquées @Public())
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    // Protection n°2 : vérification du profil (si la route a @Roles(...))
    { provide: APP_GUARD, useClass: RolesGuard },
    // Protection n°3 : droits du profil sur le module (si la route a @Acces(...))
    { provide: APP_GUARD, useClass: AccesGuard },
  ],
})
export class AppModule {}
