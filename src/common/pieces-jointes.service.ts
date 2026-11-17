/**
 * =============================================================================
 * PIÈCES JOINTES (pièces justificatives)
 * =============================================================================
 * Fichiers attachés à un document : facture fournisseur, bon de livraison,
 * bon de réception signé (§3.2), justificatif d'un mouvement de stock ou
 * procès-verbal d'inventaire (§3.3).
 *
 * - Le FICHIER est enregistré sur le disque du serveur, dans le dossier
 *   DOSSIER_FICHIERS du .env (par défaut : « fichiers » dans le dossier du
 *   backend), sous-dossier = type du document :
 *       fichiers/Reception/1731668400000-3f9a.pdf
 * - Les INFORMATIONS (nom d'origine, type, taille, auteur, date) sont dans la
 *   table pieces_jointes, avec le document lié (entiteType + entiteId).
 *
 * ⚠ Sauvegarde : penser à sauvegarder ce dossier en même temps que la base.
 *
 * Fichiers acceptés : PDF, JPEG, PNG (10 Mo maximum).
 * =============================================================================
 */
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { existsSync, mkdirSync, unlinkSync, writeFileSync } from 'fs';
import { join } from 'path';
import { PrismaService } from '../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';

/** Types de fichiers acceptés (type MIME -> extension). */
const TYPES_ACCEPTES: Record<string, string> = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png',
};
export const TAILLE_MAX_PIECE = 10 * 1024 * 1024; // 10 Mo

/**
 * Documents auxquels on peut joindre des pièces, PAR MODULE : chaque module
 * n'accède qu'aux pièces de SES documents (selon les droits de ce module).
 */
export const PIECES_ACHATS = ['Reception'] as const;
export const PIECES_STOCK = ['MouvementStock'] as const;
export const PIECES_LIVRAISONS = ['Livraison'] as const;
export const PIECES_CONSOMMATIONS = ['RapportConsommation'] as const;
export const PIECES_SUPERVISIONS = ['Supervision'] as const;
export const ENTITES_AVEC_PIECES = [...PIECES_ACHATS, ...PIECES_STOCK, ...PIECES_LIVRAISONS, ...PIECES_CONSOMMATIONS, ...PIECES_SUPERVISIONS] as const;

/** Fichier reçu (forme simplifiée de ce que fournit multer). */
export interface FichierRecu {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

@Injectable()
export class PiecesJointesService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  /** Dossier racine des fichiers (créé s'il n'existe pas). */
  private dossier(sousDossier: string) {
    const racine = process.env.DOSSIER_FICHIERS || join(process.cwd(), 'fichiers');
    const dossier = join(racine, sousDossier);
    if (!existsSync(dossier)) mkdirSync(dossier, { recursive: true });
    return dossier;
  }

  /**
   * Pièces jointes d'un document.
   * @param typesAutorises types de documents du module appelant (ex. PIECES_ACHATS)
   */
  lister(entiteType: string, entiteId: number, typesAutorises: readonly string[]) {
    this.verifierEntite(entiteType, typesAutorises);
    return this.prisma.pieceJointe.findMany({
      where: { entiteType, entiteId },
      include: { utilisateur: { select: { nom: true, prenoms: true } } },
      orderBy: { createdAt: 'desc' },
    });
  }

  /** Ajoute une pièce jointe à un document. */
  async ajouter(
    entiteType: string,
    entiteId: number,
    fichier: FichierRecu | undefined,
    libelle: string | undefined,
    utilisateurId: number,
    typesAutorises: readonly string[],
  ) {
    this.verifierEntite(entiteType, typesAutorises);
    if (!fichier) throw new BadRequestException('Aucun fichier reçu.');
    const extension = TYPES_ACCEPTES[fichier.mimetype];
    if (!extension) throw new BadRequestException('Type de fichier non accepté : PDF, JPEG ou PNG seulement.');
    if (fichier.size > TAILLE_MAX_PIECE) throw new BadRequestException('Fichier trop lourd (10 Mo maximum).');
    await this.verifierDocument(entiteType, entiteId);

    // Nom unique sur le disque (le nom d'origine est gardé en base)
    const nomDisque = `${Date.now()}-${randomBytes(4).toString('hex')}${extension}`;
    const chemin = join(entiteType, nomDisque);
    writeFileSync(join(this.dossier(entiteType), nomDisque), fichier.buffer);

    const piece = await this.prisma.pieceJointe.create({
      data: {
        entiteType,
        entiteId,
        libelle: libelle?.trim() || null,
        nomFichier: fichier.originalname.substring(0, 255),
        chemin,
        mimeType: fichier.mimetype,
        taille: fichier.size,
        utilisateurId,
      },
    });
    await this.audit.enregistrer({ utilisateurId, action: 'AJOUT_PIECE_JOINTE', entite: entiteType, entiteId, apres: piece });
    return piece;
  }

  /** Renvoie la pièce et le chemin complet du fichier (pour le téléchargement). */
  async fichier(id: number, typesAutorises: readonly string[]) {
    const piece = await this.prisma.pieceJointe.findUnique({ where: { id } });
    if (!piece || !typesAutorises.includes(piece.entiteType)) throw new NotFoundException('Pièce jointe introuvable.');
    const racine = process.env.DOSSIER_FICHIERS || join(process.cwd(), 'fichiers');
    const chemin = join(racine, piece.chemin);
    if (!existsSync(chemin)) throw new NotFoundException('Le fichier n\'existe plus sur le serveur.');
    return { piece, chemin };
  }

  /** Supprime une pièce jointe (fichier + ligne en base). */
  async supprimer(id: number, utilisateurId: number, typesAutorises: readonly string[]) {
    const { piece, chemin } = await this.fichier(id, typesAutorises).catch(async () => {
      const p = await this.prisma.pieceJointe.findUnique({ where: { id } });
      if (!p || !typesAutorises.includes(p.entiteType)) throw new NotFoundException('Pièce jointe introuvable.');
      return { piece: p, chemin: null as string | null };
    });
    await this.prisma.pieceJointe.delete({ where: { id } });
    if (chemin) unlinkSync(chemin);
    await this.audit.enregistrer({
      utilisateurId,
      action: 'SUPPRESSION_PIECE_JOINTE',
      entite: piece.entiteType,
      entiteId: piece.entiteId,
      avant: piece,
    });
    return { message: 'Pièce jointe supprimée.' };
  }

  private verifierEntite(entiteType: string, typesAutorises: readonly string[]) {
    if (!typesAutorises.includes(entiteType)) {
      throw new BadRequestException(`Type de document inconnu : « ${entiteType} ».`);
    }
  }

  /** Vérifie que le document existe. */
  private async verifierDocument(entiteType: string, entiteId: number) {
    const recherches: Record<string, () => Promise<unknown>> = {
      Reception: () => this.prisma.reception.findUnique({ where: { id: entiteId } }),
      MouvementStock: () => this.prisma.mouvementStock.findUnique({ where: { id: entiteId } }),
      Livraison: () => this.prisma.livraison.findUnique({ where: { id: entiteId } }),
      RapportConsommation: () => this.prisma.rapportConsommation.findUnique({ where: { id: entiteId } }),
      Supervision: () => this.prisma.supervision.findUnique({ where: { id: entiteId } }),
    };
    const existe = await recherches[entiteType]();
    if (!existe) throw new NotFoundException('Document introuvable.');
  }
}

