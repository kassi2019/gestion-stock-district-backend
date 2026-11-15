/**
 * =============================================================================
 * SERVICE DES CENTRES DE SANTÉ
 * =============================================================================
 * Lecture, création et modification des centres de santé clients du district.
 * Chaque centre a un TYPE (table types_centre) et peut avoir des coordonnées
 * GPS (latitude / longitude).
 *
 * Règle : un centre n'est JAMAIS supprimé (il a des livraisons, factures...).
 * On le DÉSACTIVE (actif = false) : il n'apparaît plus dans les listes de
 * saisie, mais son historique est conservé.
 * =============================================================================
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { traduireErreurPrisma } from '../../common/prisma-erreurs';
import { codeOuAutomatique } from '../../common/codes-auto';
import { CreerCentreDto, ModifierCentreDto } from './centres.dto';

@Injectable()
export class CentresService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /**
   * Liste des centres, triés par nom.
   * @param recherche texte cherché dans le code, le nom ou la localité (facultatif)
   * @param actifsSeulement true = ne renvoyer que les centres actifs
   */
  lister(recherche?: string, actifsSeulement = false) {
    return this.prisma.centreSante.findMany({
      where: {
        ...(actifsSeulement ? { actif: true } : {}),
        ...(recherche
          ? {
              OR: [
                { code: { contains: recherche } },
                { nom: { contains: recherche } },
                { localite: { contains: recherche } },
              ],
            }
          : {}),
      },
      orderBy: { nom: 'asc' },
      include: { type: true }, // libellé du type de centre
    });
  }

  /** Un centre par son identifiant (erreur 404 s'il n'existe pas). */
  async trouver(id: number) {
    const centre = await this.prisma.centreSante.findUnique({ where: { id }, include: { type: true } });
    if (!centre) throw new NotFoundException('Centre de santé introuvable.');
    return centre;
  }

  /** Création d'un centre. */
  async creer(dto: CreerCentreDto, utilisateurId: number) {
    await this.verifierType(dto.typeId);
    try {
      // Code vide -> code automatique (CEN-0001, CEN-0002...)
      const code = await codeOuAutomatique(this.prisma, dto.code, 'CEN', (c) =>
        this.prisma.centreSante.findUnique({ where: { code: c } }),
      );
      const centre = await this.prisma.centreSante.create({ data: { ...dto, code } });
      await this.audit.enregistrer({
        utilisateurId,
        action: 'CREATION',
        entite: 'CentreSante',
        entiteId: centre.id,
        apres: centre,
      });
      return centre;
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'centre de santé');
    }
  }

  /** Modification d'un centre (y compris activer / désactiver). */
  async modifier(id: number, dto: ModifierCentreDto, utilisateurId: number) {
    const avant = await this.trouver(id);
    await this.verifierType(dto.typeId);
    try {
      // Code effacé dans le formulaire : on garde l'ancien code (il ne peut pas être vide)
      if (!dto.code?.trim()) delete dto.code;
      const apres = await this.prisma.centreSante.update({ where: { id }, data: dto });
      await this.audit.enregistrer({
        utilisateurId,
        action: dto.actif === false ? 'DESACTIVATION' : 'MODIFICATION',
        entite: 'CentreSante',
        entiteId: id,
        avant,
        apres,
      });
      return apres;
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'centre de santé');
    }
  }

  /** Vérifie que le type de centre choisi existe (message clair sinon). */
  private async verifierType(typeId?: number | null) {
    if (!typeId) return;
    const existe = await this.prisma.typeCentre.findUnique({ where: { id: typeId } });
    if (!existe) throw new NotFoundException('Type de centre introuvable.');
  }
}
