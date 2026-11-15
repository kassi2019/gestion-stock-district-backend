/**
 * =============================================================================
 * SERVICE DES PROFILS (rôles) ET DE LEURS DROITS PAR MODULE
 * =============================================================================
 * Un profil = un code, un libellé, une description et des DROITS :
 * pour chaque module, VOIR / IMPRIMER / MODIFIER, cochés indépendamment
 * (IMPRIMER ou MODIFIER entraîne VOIR ; voir auth/droits.ts).
 *
 * Règles :
 *   - le profil ADMIN a toujours tous les droits : ses droits et son code ne
 *     sont pas modifiables, et il ne peut pas être supprimé ;
 *   - un profil ne peut être supprimé que si AUCUN compte ne l'utilise ;
 *   - les profils ne sont gérés que par un ADMINISTRATEUR (sinon un profil
 *     pourrait se donner lui-même plus de droits) : voir roles.controller.ts ;
 *   - chaque opération est inscrite dans le journal d'audit.
 * =============================================================================
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { traduireErreurPrisma } from '../common/prisma-erreurs';
import { DROITS, MODULES_APPLICATION, NIVEAU_ACCES, ROLES } from '../common/constants';
import { lirePermissions, normaliserDroits } from '../auth/droits';
import { CreerRoleDto, ModifierRoleDto } from './roles.dto';

@Injectable()
export class RolesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Liste des profils avec leurs droits (en objet) et leur nombre de comptes. */
  async lister() {
    const roles = await this.prisma.role.findMany({
      include: { _count: { select: { utilisateurs: true } } },
      orderBy: { id: 'asc' },
    });
    return roles.map((role) => ({ ...role, permissions: lirePermissions(role.code, role.permissions) }));
  }

  async trouver(id: number) {
    const role = await this.prisma.role.findUnique({ where: { id }, include: { _count: { select: { utilisateurs: true } } } });
    if (!role) throw new NotFoundException('Profil introuvable.');
    return role;
  }

  async creer(dto: CreerRoleDto, auteurId: number) {
    try {
      const role = await this.prisma.role.create({
        data: { ...dto, permissions: this.versJson(dto.permissions) },
      });
      await this.audit.enregistrer({ utilisateurId: auteurId, action: 'CREATION', entite: 'Role', entiteId: role.id, apres: role });
      return { ...role, permissions: lirePermissions(role.code, role.permissions) };
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'profil');
    }
  }

  async modifier(id: number, dto: ModifierRoleDto, auteurId: number) {
    const avant = await this.trouver(id);
    const estAdmin = avant.code === ROLES.ADMIN;

    // Profil ADMIN : seuls le libellé et la description sont modifiables
    if (estAdmin && dto.code !== undefined && dto.code !== ROLES.ADMIN) {
      throw new BadRequestException("Le code du profil Administrateur ne peut pas être changé.");
    }
    const donnees = {
      ...dto,
      permissions: estAdmin || dto.permissions === undefined ? undefined : this.versJson(dto.permissions),
    };

    try {
      const apres = await this.prisma.role.update({ where: { id }, data: donnees });
      await this.audit.enregistrer({ utilisateurId: auteurId, action: 'MODIFICATION', entite: 'Role', entiteId: id, avant, apres });
      return { ...apres, permissions: lirePermissions(apres.code, apres.permissions) };
    } catch (erreur) {
      traduireErreurPrisma(erreur, 'profil');
    }
  }

  async supprimer(id: number, auteurId: number) {
    const avant = await this.trouver(id);
    if (avant.code === ROLES.ADMIN) throw new BadRequestException('Le profil Administrateur ne peut pas être supprimé.');
    if (avant._count.utilisateurs > 0) {
      throw new BadRequestException(
        `Ce profil est utilisé par ${avant._count.utilisateurs} compte(s) : changez d'abord leur profil.`,
      );
    }
    await this.prisma.role.delete({ where: { id } });
    await this.audit.enregistrer({ utilisateurId: auteurId, action: 'SUPPRESSION', entite: 'Role', entiteId: id, avant });
    return { message: 'Profil supprimé.' };
  }

  /**
   * Vérifie les droits reçus et les transforme en texte JSON pour la base.
   *   reçu :   { parametrage: ['VOIR', 'IMPRIMER'], stock: ['MODIFIER'] }
   *   gardé :  { parametrage: ['VOIR','IMPRIMER'], stock: ['VOIR','MODIFIER'] }
   * Seuls les modules connus et les droits VOIR / IMPRIMER / MODIFIER sont
   * acceptés ; IMPRIMER ou MODIFIER ajoute VOIR ; liste vide = pas d'accès.
   */
  private versJson(permissions: Record<string, unknown> | undefined): string {
    const valides = [...Object.values(DROITS), ...Object.values(NIVEAU_ACCES)] as string[];
    const propres: Record<string, string[]> = {};
    for (const [module, droits] of Object.entries(permissions ?? {})) {
      if (!(MODULES_APPLICATION as readonly string[]).includes(module)) {
        throw new BadRequestException(`Module inconnu : « ${module} ».`);
      }
      const liste = Array.isArray(droits) ? droits : droits ? [droits] : [];
      const inconnu = liste.find((d) => !valides.includes(String(d)));
      if (inconnu !== undefined) throw new BadRequestException(`Droit inconnu : « ${inconnu} ».`);
      // (une ancienne valeur seule « LECTURE » / « MODIFICATION » est convertie)
      const normalises = normaliserDroits(liste.length === 1 && !Array.isArray(droits) ? droits : liste);
      if (normalises.length > 0) propres[module] = normalises;
    }
    return JSON.stringify(propres);
  }
}
