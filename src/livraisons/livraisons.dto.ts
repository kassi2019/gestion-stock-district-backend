/**
 * =============================================================================
 * DONNÉES ATTENDUES — MODULE 05 COMMANDES ET LIVRAISONS AUX CENTRES
 * =============================================================================
 * Quantités dans l'UNITÉ DE VENTE du médicament (boîte, flacon...), comme le
 * stock du dépôt et les prix de vente.
 * =============================================================================
 */
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// -----------------------------------------------------------------------------
// COMMANDES DES CENTRES
// -----------------------------------------------------------------------------

export class LigneCommandeCentreDto {
  @IsInt({ message: 'Choisissez le médicament' })
  medicamentId!: number;

  @Type(() => Number)
  @IsInt({ message: 'La quantité demandée doit être un nombre entier' })
  @Min(1, { message: 'La quantité demandée doit être au moins 1' })
  quantiteDemandee!: number;
}

export class CreerCommandeCentreDto {
  @IsInt({ message: 'Choisissez le centre de santé' })
  centreId!: number;

  @IsDateString({}, { message: "La date de la commande n'est pas valide" })
  dateCommande!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  observations?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Ajoutez au moins un médicament' })
  @ValidateNested({ each: true })
  @Type(() => LigneCommandeCentreDto)
  lignes!: LigneCommandeCentreDto[];
}

export class ModifierCommandeCentreDto extends PartialType(CreerCommandeCentreDto) {}

/** Quantité ACCORDÉE pour une ligne (validation de la commande). */
export class AccordLigneDto {
  @IsInt()
  ligneId!: number;

  @Type(() => Number)
  @IsInt({ message: 'La quantité accordée doit être un nombre entier' })
  @Min(0, { message: 'La quantité accordée ne peut pas être négative' })
  quantiteAccordee!: number;
}

export class ValiderCommandeCentreDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AccordLigneDto)
  lignes!: AccordLigneDto[];
}

// -----------------------------------------------------------------------------
// LIVRAISONS (bons de livraison)
// -----------------------------------------------------------------------------

/** Médicament à préparer : les LOTS sont choisis automatiquement (péremption la plus proche d'abord). */
export class LignePreparationDto {
  @IsInt({ message: 'Choisissez le médicament' })
  medicamentId!: number;

  @Type(() => Number)
  @IsInt({ message: 'La quantité préparée doit être un nombre entier' })
  @Min(1, { message: 'La quantité préparée doit être au moins 1' })
  quantite!: number;
}

export class CreerLivraisonDto {
  /** Commande du centre (facultatif : livraison directe sans commande) */
  @IsOptional() @IsInt()
  commandeId?: number;

  /** Centre (repris de la commande si une commande est indiquée) */
  @IsOptional() @IsInt()
  centreId?: number;

  @IsDateString({}, { message: "La date de livraison n'est pas valide" })
  dateLivraison!: string;

  @IsOptional() @IsString() @MaxLength(2000)
  observations?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Ajoutez au moins un médicament à livrer' })
  @ValidateNested({ each: true })
  @Type(() => LignePreparationDto)
  lignes!: LignePreparationDto[];
}

/** Modification d'une livraison EN BROUILLON (préparation refaite). */
export class ModifierLivraisonDto extends PartialType(CreerLivraisonDto) {}

/** Quantité réellement LIVRÉE pour une ligne (par lot), à la validation. */
export class LivreLigneDto {
  @IsInt()
  ligneId!: number;

  @Type(() => Number)
  @IsInt({ message: 'La quantité livrée doit être un nombre entier' })
  @Min(0, { message: 'La quantité livrée ne peut pas être négative' })
  quantiteLivree!: number;
}

export class ValiderLivraisonDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LivreLigneDto)
  lignes!: LivreLigneDto[];
}
