/**
 * =============================================================================
 * SERVICE DES FAMILLES DE PRODUITS
 * =============================================================================
 * Une famille regroupe des médicaments (ex. "Antipaludiques").
 * Une famille peut être SUPPRIMÉE seulement si aucun médicament ne l'utilise
 * (sinon SQL Server refuse et un message clair est renvoyé).
 * =============================================================================
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { traduireErreurPrisma } from '../../common/prisma-erreurs';
import { codeOuAutomatique } from '../../common/codes-auto';
import { CreerFamilleDto, ModifierFamilleDto } from './familles.dto';

@Injectable()
export class FamillesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Liste des familles, avec le nombre de médicaments de chacune. */
  lister() {
    return this.prisma.familleProduit.findMany({
      orderBy: { libelle: 'asc' },
      include: { _count: { select: { medicaments: true } } },
    });
  }

  async trouver(id: number) {
    const famille = await this.prisma.familleProduit.findUnique({ where: { id } });
    if (!famille) throw new NotFoundException('Famille introuvable.');
    return famille;
  }

  async creer(dto: CreerFamilleDto, utilisateurId: number) {
    try {
      // Code vide -> code automatique (FAM-0001, FAM-0002...)
      const code = await codeOuAutomatique(this.prisma, dto.code, 'FAM', (c) =>
        this.prisma.familleProduit.findUnique({ where: { code: c } }),
      );
      const famille = await this.prisma.familleProduit.create({ data: { ...dto, code } });
      await this.audit.enregistrer({
        utilisateurId,
        action: 'CREATION',
        entite: 'FamilleProduit',
        entiteId: famille.id,
        apres: famille,
      });
      return famille;
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'famille');
    }
  }

  async modifier(id: number, dto: ModifierFamilleDto, utilisateurId: number) {
    const avant = await this.trouver(id);
    try {
      // Code effacé dans le formulaire : on garde l'ancien code (il ne peut pas être vide)
      if (!dto.code?.trim()) delete dto.code;
      const apres = await this.prisma.familleProduit.update({ where: { id }, data: dto });
      await this.audit.enregistrer({
        utilisateurId,
        action: 'MODIFICATION',
        entite: 'FamilleProduit',
        entiteId: id,
        avant,
        apres,
      });
      return apres;
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'famille');
    }
  }

  /** Suppression (refusée si des médicaments utilisent la famille). */
  async supprimer(id: number, utilisateurId: number) {
    const avant = await this.trouver(id);
    try {
      await this.prisma.familleProduit.delete({ where: { id } });
      await this.audit.enregistrer({
        utilisateurId,
        action: 'SUPPRESSION',
        entite: 'FamilleProduit',
        entiteId: id,
        avant,
      });
      return { message: 'Famille supprimée.' };
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'famille');
    }
  }
}
