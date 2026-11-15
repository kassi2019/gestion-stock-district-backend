/**
 * =============================================================================
 * DONNÉES ATTENDUES — MODULE 03 APPROVISIONNEMENTS ET ACHATS
 * =============================================================================
 * Commande fournisseur : un fournisseur, une date, des lignes
 *   (médicament, quantité, prix unitaire).
 * Réception : liée ou non à une commande ; des lignes (médicament, quantité,
 *   prix unitaire, n° de lot et date de péremption si disponibles).
 * Les quantités et prix sont exprimés dans l'UNITÉ DE VENTE du médicament
 * (boîte, flacon...), comme le stock et les prix du Paramétrage.
 * =============================================================================
 */
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// -----------------------------------------------------------------------------
// COMMANDES FOURNISSEURS
// -----------------------------------------------------------------------------

export class LigneCommandeDto {
  @IsInt({ message: 'Choisissez le médicament' })
  medicamentId!: number;

  @Type(() => Number)
  @IsInt({ message: 'La quantité doit être un nombre entier' })
  @Min(1, { message: 'La quantité doit être au moins 1' })
  quantite!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Le prix unitaire doit être un nombre' })
  @Min(0, { message: 'Le prix unitaire ne peut pas être négatif' })
  prixUnitaire!: number;
}

export class CreerCommandeDto {
  @IsInt({ message: 'Choisissez le fournisseur' })
  fournisseurId!: number;

  /** Date de la commande, format AAAA-MM-JJ */
  @IsDateString({}, { message: 'La date de commande n\'est pas valide' })
  dateCommande!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  observations?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Ajoutez au moins un médicament à la commande' })
  @ValidateNested({ each: true })
  @Type(() => LigneCommandeDto)
  lignes!: LigneCommandeDto[];
}

/** Modification d'une commande EN BROUILLON (les lignes sont remplacées). */
export class ModifierCommandeDto extends PartialType(CreerCommandeDto) {}

// -----------------------------------------------------------------------------
// RÉCEPTIONS
// -----------------------------------------------------------------------------

export class LigneReceptionDto {
  @IsInt({ message: 'Choisissez le médicament' })
  medicamentId!: number;

  @Type(() => Number)
  @IsInt({ message: 'La quantité reçue doit être un nombre entier' })
  @Min(1, { message: 'La quantité reçue doit être au moins 1' })
  quantite!: number;

  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: 'Le prix unitaire doit être un nombre' })
  @Min(0, { message: 'Le prix unitaire ne peut pas être négatif' })
  prixUnitaire!: number;

  /** N° de lot (obligatoire à la validation si le médicament est suivi par lot) */
  @IsOptional() @IsString() @MaxLength(50)
  numeroLot?: string;

  /** Date de péremption, format AAAA-MM-JJ */
  @IsOptional() @IsDateString({}, { message: "La date de péremption n'est pas valide" })
  datePeremption?: string;
}

export class CreerReceptionDto {
  /** Commande d'origine (facultatif : réception directe sans commande) */
  @IsOptional() @IsInt()
  commandeId?: number;

  /** Fournisseur (repris de la commande si une commande est indiquée) */
  @IsOptional() @IsInt()
  fournisseurId?: number;

  @IsDateString({}, { message: 'La date de réception n\'est pas valide' })
  dateReception!: string;

  /** N° de la facture du fournisseur */
  @IsOptional() @IsString() @MaxLength(50)
  numFactureFourn?: string;

  /** N° du bon de livraison du fournisseur */
  @IsOptional() @IsString() @MaxLength(50)
  numBonLivraison?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  observations?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Ajoutez au moins un médicament reçu' })
  @ValidateNested({ each: true })
  @Type(() => LigneReceptionDto)
  lignes!: LigneReceptionDto[];
}

/** Modification d'une réception EN BROUILLON (les lignes sont remplacées). */
export class ModifierReceptionDto extends PartialType(CreerReceptionDto) {}
