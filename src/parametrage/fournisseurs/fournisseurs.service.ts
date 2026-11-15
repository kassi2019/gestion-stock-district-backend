/**
 * =============================================================================
 * SERVICE DES FOURNISSEURS
 * =============================================================================
 * Même fonctionnement que les centres de santé (voir centres.service.ts) :
 * pas de suppression, on désactive (actif = false).
 * =============================================================================
 */
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../../audit/audit.service';
import { traduireErreurPrisma } from '../../common/prisma-erreurs';
import { codeOuAutomatique } from '../../common/codes-auto';
import { CreerFournisseurDto, ModifierFournisseurDto } from './fournisseurs.dto';

@Injectable()
export class FournisseursService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Liste des fournisseurs triés par raison sociale (recherche facultative). */
  lister(recherche?: string, actifsSeulement = false) {
    return this.prisma.fournisseur.findMany({
      where: {
        ...(actifsSeulement ? { actif: true } : {}),
        ...(recherche
          ? { OR: [{ code: { contains: recherche } }, { raisonSociale: { contains: recherche } }] }
          : {}),
      },
      orderBy: { raisonSociale: 'asc' },
    });
  }

  async trouver(id: number) {
    const fournisseur = await this.prisma.fournisseur.findUnique({ where: { id } });
    if (!fournisseur) throw new NotFoundException('Fournisseur introuvable.');
    return fournisseur;
  }

  async creer(dto: CreerFournisseurDto, utilisateurId: number) {
    try {
      // Code vide -> code automatique (FOU-0001, FOU-0002...)
      const code = await codeOuAutomatique(this.prisma, dto.code, 'FOU', (c) =>
        this.prisma.fournisseur.findUnique({ where: { code: c } }),
      );
      const fournisseur = await this.prisma.fournisseur.create({ data: { ...dto, code } });
      await this.audit.enregistrer({
        utilisateurId,
        action: 'CREATION',
        entite: 'Fournisseur',
        entiteId: fournisseur.id,
        apres: fournisseur,
      });
      return fournisseur;
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'fournisseur');
    }
  }

  async modifier(id: number, dto: ModifierFournisseurDto, utilisateurId: number) {
    const avant = await this.trouver(id);
    try {
      // Code effacé dans le formulaire : on garde l'ancien code (il ne peut pas être vide)
      if (!dto.code?.trim()) delete dto.code;
      const apres = await this.prisma.fournisseur.update({ where: { id }, data: dto });
      await this.audit.enregistrer({
        utilisateurId,
        action: dto.actif === false ? 'DESACTIVATION' : 'MODIFICATION',
        entite: 'Fournisseur',
        entiteId: id,
        avant,
        apres,
      });
      return apres;
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'fournisseur');
    }
  }
}
