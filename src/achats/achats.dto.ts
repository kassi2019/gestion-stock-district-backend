/**
 * =============================================================================
 * DONNÉES ATTENDUES — MODULE 03 APPROVISIONNEMENTS ET ACHATS
 * =============================================================================
 * Commande fournisseur : un fournisseur, une date, des lignes
 *   (médicament, quantité, prix unitaire).
 * Réception : liée ou non à une commande ; des lignes (médicament, quantité,
 *   prix d'achat saisi, n° de lot, date de péremption, observation).
 * Les quantités et prix sont exprimés dans l'UNITÉ DE COMPTAGE du médicament
 * (boîte, plaquette, flacon...), comme le stock et les prix du Paramétrage.
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
// RÉCEPTIONS
// -----------------------------------------------------------------------------

export class LigneReceptionDto {
  @IsInt({ message: 'Choisissez le médicament' })
  medicamentId!: number;

  @Type(() => Number)
  @IsInt({ message: 'La quantité reçue doit être un nombre entier' })
  @Min(1, { message: 'La quantité reçue doit être au moins 1' })
  quantite!: number;

  /**
   * Prix d'achat SAISI pour cette réception (par unité de comptage).
   * L'écran propose le dernier prix d'achat, mais l'utilisateur peut le changer :
   * le prix varie selon le fournisseur et d'une livraison à l'autre.
   * Il est enregistré sur la ligne de réception, PAS sur la fiche du médicament.
   */
  @Type(() => Number)
  @IsNumber({ maxDecimalPlaces: 2 }, { message: "Le prix d'achat doit être un nombre" })
  @Min(0, { message: "Le prix d'achat ne peut pas être négatif" })
  prixUnitaire!: number;

  /** N° de lot (obligatoire à la validation si le médicament est suivi par lot) */
  @IsOptional() @IsString() @MaxLength(50)
  numeroLot?: string;

  /** Date de péremption, format AAAA-MM-JJ */
  @IsOptional() @IsDateString({}, { message: "La date de péremption n'est pas valide" })
  datePeremption?: string;

  /** Observation propre à cette ligne (facultative) */
  @IsOptional() @IsString() @MaxLength(500)
  observation?: string;
}

export class CreerReceptionDto {
  /** Fournisseur (liste des fournisseurs paramétrés). Plus de lien avec une commande. */
  @IsInt({ message: 'Choisissez le fournisseur' })
  fournisseurId!: number;

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
