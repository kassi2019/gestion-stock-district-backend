/**
 * ROUTES DES PARAMÈTRES GÉNÉRAUX
 *   GET   /api/parametres          liste
 *   PATCH /api/parametres/:cle     changer la valeur  (droit « Modification » sur le Paramétrage)   corps : { "valeur": "..." }
 */
import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { IsString } from 'class-validator';
import { Acces } from '../../auth/droits';
import { UtilisateurCourant } from '../../auth/current-user.decorator';
import { UtilisateurConnecte } from '../../auth/jwt.strategy';
import { ParametresService } from './parametres.service';

/** Données attendues pour modifier un paramètre. */
class ModifierParametreDto {
  @IsString()
  valeur!: string;
}

@Controller('parametres')
export class ParametresController {
  constructor(private parametresService: ParametresService) {}

  @Get()
  lister() {
    return this.parametresService.lister();
  }

  @Acces('parametrage', 'MODIFICATION')
  @Patch(':cle')
  modifier(
    @Param('cle') cle: string,
    @Body() dto: ModifierParametreDto,
    @UtilisateurCourant() utilisateur: UtilisateurConnecte,
  ) {
    return this.parametresService.modifier(cle, dto.valeur, utilisateur.id);
  }
}
