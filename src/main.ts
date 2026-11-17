/**
 * =============================================================================
 * POINT D'ENTRÉE DE L'API (backend)
 * =============================================================================
 * Ce fichier est exécuté en premier quand on lance le backend
 * (commande : npm run start:dev).
 *
 * Il :
 *   1. crée l'application NestJS à partir du module principal (AppModule) ;
 *   2. ajoute le préfixe "/api" devant toutes les routes ;
 *   3. autorise le frontend à appeler l'API (CORS) ;
 *   4. active la validation automatique des données reçues ;
 *   5. sert aussi le frontend compilé (mise en ligne sur un seul serveur) ;
 *   6. démarre le serveur sur le port défini dans le fichier .env.
 * =============================================================================
 */
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';
import { join } from 'path';
import { existsSync } from 'fs';
import type { Request, Response, NextFunction } from 'express';

async function demarrer() {
  // 1. Création de l'application
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  // Taille maximale d'une requête : 1 Mo (pour les photos du personnel ;
  // par défaut 100 Ko seulement)
  app.useBodyParser('json', { limit: '1mb' });

  // 2. Toutes les routes commenceront par /api
  //    Exemple : la route "auth/login" devient "http://localhost:3000/api/auth/login"
  app.setGlobalPrefix('api');

  // 3. CORS : liste des adresses autorisées à appeler l'API (variable CORS_ORIGIN du .env).
  //    Plusieurs adresses peuvent être séparées par des virgules.
  const originesAutorisees = process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true;
  app.enableCors({ origin: originesAutorisees });

  // 4. Validation automatique des données envoyées par le frontend.
  //    - whitelist : supprime les champs qui ne sont pas déclarés dans le DTO
  //    - forbidNonWhitelisted : renvoie une erreur si un champ inconnu est envoyé
  //    - transform : convertit automatiquement les types (ex. "12" -> 12)
  app.useGlobalPipes(
    new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
  );

  // 5. Mise en ligne sur un seul serveur : l'API sert aussi le frontend compilé.
  //    Après "npm run build" dans stock-district-frontend, le dossier dist/
  //    est servi ici. Ainsi http://SERVEUR:3000 affiche l'application et
  //    http://SERVEUR:3000/api répond aux appels : un seul programme à lancer.
  //    Dossier modifiable avec la variable DOSSIER_FRONTEND du .env.
  const dossierFrontend =
    process.env.DOSSIER_FRONTEND || join(process.cwd(), '..', 'stock-district-frontend', 'dist');
  if (existsSync(join(dossierFrontend, 'index.html'))) {
    // Fichiers du frontend (JS, CSS, images...)
    app.useStaticAssets(dossierFrontend);
    // Toute adresse qui n'est ni l'API ni un fichier (ex. /stock, /achats)
    // renvoie index.html : c'est Vue Router qui affiche ensuite la bonne page.
    app.use((req: Request, res: Response, suite: NextFunction) => {
      if (req.method === 'GET' && !req.path.startsWith('/api')) {
        return res.sendFile(join(dossierFrontend, 'index.html'));
      }
      suite();
    });
    console.log(`Frontend servi depuis : ${dossierFrontend}`);
  } else {
    console.log('Frontend non compilé (dist/ absent) : seule l\'API est servie.');
  }

  // 6. Démarrage du serveur.
  //    Variable HOTE du .env :
  //    - '0.0.0.0' (par défaut) = joignable depuis les autres postes du réseau local ;
  //    - '127.0.0.1' (sur le serveur en ligne) = joignable seulement par Nginx,
  //      le port n'est pas ouvert sur Internet.
  const port = Number(process.env.PORT || 3000);
  await app.listen(port, process.env.HOTE || '0.0.0.0');
  console.log(`API démarrée sur http://localhost:${port}/api`);
}

demarrer();
