/**
 * =============================================================================
 * SERVICE DES UNITÉS DE VENTE
 * =============================================================================
 * Unité dans laquelle un médicament est vendu (ex. "Boîte", "Flacon").
 * Le prix de vente du médicament s'applique à cette unité.
 * Une unité peut être SUPPRIMÉE seulement si aucun médicament ne l'utilise
 * (sinon SQL Server refuse et un message clair est renvoyé).
 * =============================================================================
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { traduireErreurPrisma } from '../../common/prisma-erreurs';
import { codeOuAutomatique } from '../../common/codes-auto';
import { CreerUniteVenteDto, ModifierUniteVenteDto } from './unites-vente.dto';

@Injectable()
export class UnitesVenteService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Liste des unités de vente, avec le nombre de médicaments de chacune. */
  lister() {
    return this.prisma.uniteVente.findMany({
      orderBy: { libelle: 'asc' },
      include: { _count: { select: { medicaments: true } } },
    });
  }

  async trouver(id: number) {
    const unite = await this.prisma.uniteVente.findUnique({ where: { id } });
    if (!unite) throw new NotFoundException('Unité de vente introuvable.');
    return unite;
  }

  async creer(dto: CreerUniteVenteDto, utilisateurId: number) {
    try {
      // Code vide -> code automatique (UNV-0001, UNV-0002...)
      const code = await codeOuAutomatique(this.prisma, dto.code, 'UNV', (c) =>
        this.prisma.uniteVente.findUnique({ where: { code: c } }),
      );
      const unite = await this.prisma.uniteVente.create({ data: { ...dto, code } });
      await this.audit.enregistrer({
        utilisateurId,
        action: 'CREATION',
        entite: 'UniteVente',
        entiteId: unite.id,
        apres: unite,
      });
      return unite;
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'unité de vente');
    }
  }

  async modifier(id: number, dto: ModifierUniteVenteDto, utilisateurId: number) {
    const avant = await this.trouver(id);
    try {
      // Code effacé dans le formulaire : on garde l'ancien code (il ne peut pas être vide)
      if (!dto.code?.trim()) delete dto.code;
      const apres = await this.prisma.uniteVente.update({ where: { id }, data: dto });
      await this.audit.enregistrer({
        utilisateurId,
        action: 'MODIFICATION',
        entite: 'UniteVente',
        entiteId: id,
        avant,
        apres,
      });
      return apres;
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'unité de vente');
    }
  }

  /** Suppression (refusée si des médicaments utilisent l'unité). */
  async supprimer(id: number, utilisateurId: number) {
    const avant = await this.trouver(id);
    try {
      await this.prisma.uniteVente.delete({ where: { id } });
      await this.audit.enregistrer({
        utilisateurId,
        action: 'SUPPRESSION',
        entite: 'UniteVente',
        entiteId: id,
        avant,
      });
      return { message: 'Unité de vente supprimée.' };
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'unité de vente');
    }
  }
}
