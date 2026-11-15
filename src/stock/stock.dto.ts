/**
 * =============================================================================
 * DONNÉES ATTENDUES — MODULE 04 GESTION DU DÉPÔT ET DES STOCKS
 * =============================================================================
 * - Mouvement manuel : ajustement, sortie de périmés, transfert (avec motif) ;
 * - Inventaire par lot : comptage (stock réel + corrections du lot),
 *   rattachement du stock « sans lot » à un lot.
 * Les quantités sont dans l'UNITÉ DE VENTE du médicament (boîte, flacon...).
 * =============================================================================
 */
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { TYPE_MOUVEMENT_DEPOT } from '../common/constants';

/** Types de mouvements qu'on peut saisir à la main (les autres viennent des réceptions, livraisons, inventaires). */
export const TYPES_MOUVEMENT_MANUEL = [
  TYPE_MOUVEMENT_DEPOT.AJUSTEMENT_POSITIF,
  TYPE_MOUVEMENT_DEPOT.AJUSTEMENT_NEGATIF,
  TYPE_MOUVEMENT_DEPOT.PERIME,
  TYPE_MOUVEMENT_DEPOT.TRANSFERT_ENTREE,
  TYPE_MOUVEMENT_DEPOT.TRANSFERT_SORTIE,
] as const;

/** Mouvement manuel (appliqué immédiatement au stock). */
export class CreerMouvementDto {
  @IsIn(TYPES_MOUVEMENT_MANUEL as unknown as string[], { message: 'Type de mouvement non autorisé' })
  type!: string;

  @IsInt({ message: 'Choisissez le médicament' })
  medicamentId!: number;

  /** SORTIE : lot existant à diminuer (vide = stock sans lot) */
  @IsOptional() @IsInt()
  lotId?: number;

  /** ENTRÉE : n° de lot (créé s'il n'existe pas) */
  @IsOptional() @IsString() @MaxLength(50)
  numeroLot?: string;

  /** ENTRÉE : date de péremption du lot (AAAA-MM-JJ) */
  @IsOptional() @IsDateString({}, { message: "La date de péremption n'est pas valide" })
  datePeremption?: string;

  @Type(() => Number)
  @IsInt({ message: 'La quantité doit être un nombre entier' })
  @Min(1, { message: 'La quantité doit être au moins 1' })
  quantite!: number;

  /** Motif OBLIGATOIRE (cahier des charges §3.3) */
  @IsString()
  @IsNotEmpty({ message: 'Le motif est obligatoire' })
  @MaxLength(255)
  motif!: string;

  /** Référence de la pièce justificative (n° de PV, de bordereau...) */
  @IsOptional() @IsString() @MaxLength(50)
  pieceRef?: string;
}

// -----------------------------------------------------------------------------
// INVENTAIRE PAR LOT (comptage au fil de l'eau, comme la pharmacie Clinique)
// -----------------------------------------------------------------------------

/** Une ligne de stock comptée (stock réel + corrections éventuelles du lot). */
export class LigneComptageDto {
  /** Ligne de stock du dépôt (médicament + lot) */
  @IsInt()
  stockId!: number;

  /** Stock réel compté : devient le stock du lot */
  @Type(() => Number)
  @IsInt({ message: 'Le stock réel doit être un nombre entier' })
  @Min(0, { message: 'Le stock réel ne peut pas être négatif' })
  quantiteReelle!: number;

  /** N° de lot corrigé (lu sur la boîte) */
  @IsOptional() @IsString() @MaxLength(50)
  numeroLot?: string;

  /** Péremption corrigée (AAAA-MM-JJ) */
  @IsOptional() @IsDateString({}, { message: "La date de péremption n'est pas valide" })
  datePeremption?: string;

  @IsOptional() @IsString() @MaxLength(200)
  commentaire?: string;
}

/** Validation d'un ou plusieurs lots comptés. */
export class ComptageDto {
  @IsArray()
  @ArrayMinSize(1, { message: 'Aucun lot à valider' })
  @ValidateNested({ each: true })
  @Type(() => LigneComptageDto)
  lignes!: LigneComptageDto[];
}

/** Rattachement de stock « sans lot » à un lot (le stock total ne change pas). */
export class RattacherDto {
  @IsInt()
  medicamentId!: number;

  @IsString()
  @IsNotEmpty({ message: 'Le numéro de lot est obligatoire' })
  @MaxLength(50)
  numeroLot!: string;

  @IsDateString({}, { message: "La date de péremption n'est pas valide" })
  datePeremption!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1, { message: 'La quantité doit être au moins 1' })
  quantite!: number;
}

/** Sortie groupée des lots périmés (bouton des Alertes). */
export class SortiePerimesDto {
  @IsOptional() @IsString() @MaxLength(150)
  motif?: string;

  /** N° du procès-verbal de destruction / bordereau de retour */
  @IsOptional() @IsString() @MaxLength(50)
  pieceRef?: string;
}
