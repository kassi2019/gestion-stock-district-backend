/**
 * =============================================================================
 * ROUTES DE L'INVENTAIRE INITIAL (spec nov. 2026, §2) — ADMINISTRATEUR SEULEMENT
 * =============================================================================
 *   GET  /api/inventaire-initial                 vue d'ensemble (district + centres, verrouillé ?)
 *   GET  /api/inventaire-initial/:entite         lignes d'une entité
 *   PUT  /api/inventaire-initial/:entite         enregistre l'inventaire de l'entité
 *                                                (il devient son stock : voir le service)
 *   :entite = « district » ou l'identifiant du centre de santé
 * =============================================================================
 */
import { BadRequestException, Body, Controller, Get, Param, Put } from '@nestjs/common';
import { Roles } from '../auth/roles.decorator';
import { UtilisateurCourant } from '../auth/current-user.decorator';
import { UtilisateurConnecte } from '../auth/jwt.strategy';
import { ROLES } from '../common/constants';
import { InventaireInitialService } from './inventaire-initial.service';
import { EnregistrerInventaireInitialDto } from './inventaire-initial.dto';

/** « district » -> null (stock du district) ; sinon identifiant du centre. */
function lireEntite(entite: string): number | null {
  if (entite === 'district') return null;
  const id = Number(entite);
  if (!Number.isInteger(id) || id <= 0) throw new BadRequestException('Entité inconnue : « district » ou identifiant du centre attendu.');
  return id;
}

@Roles(ROLES.ADMIN)
@Controller('inventaire-initial')
export class InventaireInitialController {
  constructor(private service: InventaireInitialService) {}

  @Get()
  etat() {
    return this.service.etat();
  }

  @Get(':entite')
  lire(@Param('entite') entite: string) {
    return this.service.lire(lireEntite(entite));
  }

  @Put(':entite')
  enregistrer(@Param('entite') entite: string, @Body() dto: EnregistrerInventaireInitialDto, @UtilisateurCourant() moi: UtilisateurConnecte) {
    return this.service.enregistrer(lireEntite(entite), dto, moi.id);
  }
}
