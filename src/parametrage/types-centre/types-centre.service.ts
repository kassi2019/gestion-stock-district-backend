/**
 * =============================================================================
 * SERVICE DES TYPES DE CENTRES DE SANTÉ
 * =============================================================================
 * Liste des types possibles pour un centre (CSU, CSR, Dispensaire...).
 * Fonctionne comme les familles de produits (voir familles.service.ts) :
 * un type peut être supprimé seulement si aucun centre ne l'utilise.
 * =============================================================================
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { traduireErreurPrisma } from '../../common/prisma-erreurs';
import { codeOuAutomatique } from '../../common/codes-auto';
import { CreerTypeCentreDto, ModifierTypeCentreDto } from './types-centre.dto';

@Injectable()
export class TypesCentreService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Liste des types, avec le nombre de centres de chacun. */
  lister() {
    return this.prisma.typeCentre.findMany({
      orderBy: { libelle: 'asc' },
      include: { _count: { select: { centres: true } } },
    });
  }

  async trouver(id: number) {
    const type = await this.prisma.typeCentre.findUnique({ where: { id } });
    if (!type) throw new NotFoundException('Type de centre introuvable.');
    return type;
  }

  async creer(dto: CreerTypeCentreDto, utilisateurId: number) {
    try {
      // Code vide -> code automatique (TYP-0001, TYP-0002...)
      const code = await codeOuAutomatique(this.prisma, dto.code, 'TYP', (c) =>
        this.prisma.typeCentre.findUnique({ where: { code: c } }),
      );
      const type = await this.prisma.typeCentre.create({ data: { ...dto, code } });
      await this.audit.enregistrer({
        utilisateurId,
        action: 'CREATION',
        entite: 'TypeCentre',
        entiteId: type.id,
        apres: type,
      });
      return type;
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'type de centre');
    }
  }

  async modifier(id: number, dto: ModifierTypeCentreDto, utilisateurId: number) {
    const avant = await this.trouver(id);
    try {
      // Code effacé dans le formulaire : on garde l'ancien code (il ne peut pas être vide)
      if (!dto.code?.trim()) delete dto.code;
      const apres = await this.prisma.typeCentre.update({ where: { id }, data: dto });
      await this.audit.enregistrer({
        utilisateurId,
        action: 'MODIFICATION',
        entite: 'TypeCentre',
        entiteId: id,
        avant,
        apres,
      });
      return apres;
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'type de centre');
    }
  }

  /** Suppression (refusée si des centres utilisent ce type). */
  async supprimer(id: number, utilisateurId: number) {
    const avant = await this.trouver(id);
    try {
      await this.prisma.typeCentre.delete({ where: { id } });
      await this.audit.enregistrer({
        utilisateurId,
        action: 'SUPPRESSION',
        entite: 'TypeCentre',
        entiteId: id,
        avant,
      });
      return { message: 'Type de centre supprimé.' };
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'type de centre');
    }
  }
}
