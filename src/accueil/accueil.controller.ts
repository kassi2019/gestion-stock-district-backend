/**
 * =============================================================================
 * ROUTE DE LA PAGE D'ACCUEIL
 * =============================================================================
 *   GET /api/accueil/resume   chiffres clés + badges « en attente » des tuiles
 *                             (seulement pour les modules que l'utilisateur peut voir)
 * Accessible à tout utilisateur connecté.
 * =============================================================================
 */
import { Controller, Get } from '@nestjs/common';
import { UtilisateurCourant } from '../auth/current-user.decorator';
import { UtilisateurConnecte } from '../auth/jwt.strategy';
import { AccueilService } from './accueil.service';

@Controller('accueil')
export class AccueilController {
  constructor(private accueil: AccueilService) {}

  @Get('resume')
  resume(@UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.accueil.resume(moi.permissions);
  }
}
