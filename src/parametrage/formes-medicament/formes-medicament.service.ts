/**
 * =============================================================================
 * SERVICE DES FORMES DE MÉDICAMENTS
 * =============================================================================
 * Forme galénique d'un médicament (ex. "Comprimé", "Sirop").
 * Une forme peut être SUPPRIMÉE seulement si aucun médicament ne l'utilise
 * (sinon SQL Server refuse et un message clair est renvoyé).
 * =============================================================================
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { traduireErreurPrisma } from '../../common/prisma-erreurs';
import { codeOuAutomatique } from '../../common/codes-auto';
import { CreerFormeDto, ModifierFormeDto } from './formes-medicament.dto';

@Injectable()
export class FormesMedicamentService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Liste des formes, avec le nombre de médicaments de chacune. */
  lister() {
    return this.prisma.formeMedicament.findMany({
      orderBy: { libelle: 'asc' },
      include: { _count: { select: { medicaments: true } } },
    });
  }

  async trouver(id: number) {
    const forme = await this.prisma.formeMedicament.findUnique({ where: { id } });
    if (!forme) throw new NotFoundException('Forme introuvable.');
    return forme;
  }

  async creer(dto: CreerFormeDto, utilisateurId: number) {
    try {
      // Code vide -> code automatique (FRM-0001, FRM-0002...)
      const code = await codeOuAutomatique(this.prisma, dto.code, 'FRM', (c) =>
        this.prisma.formeMedicament.findUnique({ where: { code: c } }),
      );
      const forme = await this.prisma.formeMedicament.create({ data: { ...dto, code } });
      await this.audit.enregistrer({
        utilisateurId,
        action: 'CREATION',
        entite: 'FormeMedicament',
        entiteId: forme.id,
        apres: forme,
      });
      return forme;
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'forme');
    }
  }

  async modifier(id: number, dto: ModifierFormeDto, utilisateurId: number) {
    const avant = await this.trouver(id);
    try {
      // Code effacé dans le formulaire : on garde l'ancien code (il ne peut pas être vide)
      if (!dto.code?.trim()) delete dto.code;
      const apres = await this.prisma.formeMedicament.update({ where: { id }, data: dto });
      await this.audit.enregistrer({
        utilisateurId,
        action: 'MODIFICATION',
        entite: 'FormeMedicament',
        entiteId: id,
        avant,
        apres,
      });
      return apres;
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'forme');
    }
  }

  /** Suppression (refusée si des médicaments utilisent la forme). */
  async supprimer(id: number, utilisateurId: number) {
    const avant = await this.trouver(id);
    try {
      await this.prisma.formeMedicament.delete({ where: { id } });
      await this.audit.enregistrer({
        utilisateurId,
        action: 'SUPPRESSION',
        entite: 'FormeMedicament',
        entiteId: id,
        avant,
      });
      return { message: 'Forme supprimée.' };
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'forme');
    }
  }
}
