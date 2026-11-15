/**
 * =============================================================================
 * SERVICE DES PARAMÈTRES GÉNÉRAUX
 * =============================================================================
 * Réglages de l'application stockés en base (table "parametres") :
 *   SESSION_EXPIRATION_MINUTES, ALERTE_PEREMPTION_JOURS,
 *   PRIX_VENTE_PAR_CENTRE, DEVISE, NOM_DISTRICT...
 *   + informations du district : DISTRICT_CODE, DISTRICT_REGION, DISTRICT_LOCALITE,
 *     DISTRICT_ADRESSE, DISTRICT_LATITUDE, DISTRICT_LONGITUDE, DISTRICT_RESPONSABLE,
 *     DISTRICT_TELEPHONE, DISTRICT_EMAIL (valeur vide = non renseigné).
 *
 * Les paramètres sont créés par le script de départ (prisma/seed.ts).
 * Ici on peut seulement les LIRE et changer leur VALEUR.
 * =============================================================================
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';

@Injectable()
export class ParametresService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Tous les paramètres, triés par clé. */
  lister() {
    return this.prisma.parametre.findMany({ orderBy: { cle: 'asc' } });
  }

  /** Lit la valeur d'un paramètre (utile pour les autres services). */
  async valeur(cle: string): Promise<string | null> {
    const parametre = await this.prisma.parametre.findUnique({ where: { cle } });
    return parametre ? parametre.valeur : null;
  }

  /** Change la valeur d'un paramètre. */
  async modifier(cle: string, valeur: string, utilisateurId: number) {
    const avant = await this.prisma.parametre.findUnique({ where: { cle } });
    if (!avant) throw new NotFoundException(`Paramètre « ${cle} » introuvable.`);

    const apres = await this.prisma.parametre.update({ where: { cle }, data: { valeur } });
    await this.audit.enregistrer({
      utilisateurId,
      action: 'MODIFICATION',
      entite: 'Parametre',
      entiteId: cle,
      avant: { valeur: avant.valeur },
      apres: { valeur: apres.valeur },
    });
    return apres;
  }
}
