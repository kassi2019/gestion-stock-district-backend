/**
 * =============================================================================
 * SERVICE DES FONCTIONS DU PERSONNEL
 * =============================================================================
 * Fonction occupée par un membre du personnel (ex. "Pharmacien").
 * Une fonction peut être SUPPRIMÉE seulement si aucune fiche du personnel ne l'utilise
 * (sinon SQL Server refuse et un message clair est renvoyé).
 * =============================================================================
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { traduireErreurPrisma } from '../../common/prisma-erreurs';
import { codeOuAutomatique } from '../../common/codes-auto';
import { CreerFonctionDto, ModifierFonctionDto } from './fonctions.dto';

@Injectable()
export class FonctionsService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Liste des fonctions, avec le nombre de personnes de chacune. */
  lister() {
    return this.prisma.fonction.findMany({
      orderBy: { libelle: 'asc' },
      include: { _count: { select: { personnel: true } } },
    });
  }

  async trouver(id: number) {
    const fonction = await this.prisma.fonction.findUnique({ where: { id } });
    if (!fonction) throw new NotFoundException('Fonction introuvable.');
    return fonction;
  }

  async creer(dto: CreerFonctionDto, utilisateurId: number) {
    try {
      // Code vide -> code automatique (FCT-0001, FCT-0002...)
      const code = await codeOuAutomatique(this.prisma, dto.code, 'FCT', (c) =>
        this.prisma.fonction.findUnique({ where: { code: c } }),
      );
      const fonction = await this.prisma.fonction.create({ data: { ...dto, code } });
      await this.audit.enregistrer({
        utilisateurId,
        action: 'CREATION',
        entite: 'Fonction',
        entiteId: fonction.id,
        apres: fonction,
      });
      return fonction;
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'fonction');
    }
  }

  async modifier(id: number, dto: ModifierFonctionDto, utilisateurId: number) {
    const avant = await this.trouver(id);
    try {
      // Code effacé dans le formulaire : on garde l'ancien code (il ne peut pas être vide)
      if (!dto.code?.trim()) delete dto.code;
      const apres = await this.prisma.fonction.update({ where: { id }, data: dto });
      await this.audit.enregistrer({
        utilisateurId,
        action: 'MODIFICATION',
        entite: 'Fonction',
        entiteId: id,
        avant,
        apres,
      });
      return apres;
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'fonction');
    }
  }

  /** Suppression (refusée si du personnel utilise la fonction). */
  async supprimer(id: number, utilisateurId: number) {
    const avant = await this.trouver(id);
    try {
      await this.prisma.fonction.delete({ where: { id } });
      await this.audit.enregistrer({
        utilisateurId,
        action: 'SUPPRESSION',
        entite: 'Fonction',
        entiteId: id,
        avant,
      });
      return { message: 'Fonction supprimée.' };
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'fonction');
    }
  }
}
