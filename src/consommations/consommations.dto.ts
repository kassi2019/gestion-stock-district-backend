/**
 * =============================================================================
 * DONNÉES ATTENDUES — MODULE 06 RAPPORTS MENSUELS DE CONSOMMATION
 * =============================================================================
 * Quantités dans l'UNITÉ DE VENTE du médicament (boîte, flacon...), comme le
 * stock théorique des centres et les prix de vente.
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
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

// -----------------------------------------------------------------------------
// SAISIE DU RAPPORT (quantités déclarées par le centre)
// -----------------------------------------------------------------------------

export class LigneConsommationDto {
  @IsInt({ message: 'Choisissez le médicament' })
  medicamentId!: number;

  @Type(() => Number)
  @IsInt({ message: 'La quantité déclarée doit être un nombre entier' })
  @Min(0, { message: 'La quantité déclarée ne peut pas être négative' })
  quantite!: number;
}

export class CreerRapportDto {
  @IsInt({ message: 'Choisissez le centre de santé' })
  centreId!: number;

  @Type(() => Number)
  @IsInt({ message: "L'année est obligatoire" })
  @Min(2000, { message: 'Année invalide' })
  @Max(2100, { message: 'Année invalide' })
  annee!: number;

  @Type(() => Number)
  @IsInt({ message: 'Le mois est obligatoire' })
  @Min(1, { message: 'Mois invalide (1 à 12)' })
  @Max(12, { message: 'Mois invalide (1 à 12)' })
  mois!: number;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Ajoutez au moins un médicament' })
  @ValidateNested({ each: true })
  @Type(() => LigneConsommationDto)
  lignes!: LigneConsommationDto[];
}

export class ModifierRapportDto extends PartialType(CreerRapportDto) {}

/** Renvoi en brouillon d'un rapport soumis (à corriger). */
export class RenvoyerRapportDto {
  @IsString({ message: 'Indiquez le motif du renvoi' })
  @MaxLength(500)
  motif!: string;
}

// -----------------------------------------------------------------------------
// VÉRIFICATION SUR PLACE (agent du district dans le centre)
// -----------------------------------------------------------------------------

export class LigneVerificationDto {
  @IsInt()
  ligneId!: number;

  /** Quantité constatée sur place ; vide (null) = ligne non vérifiée (la déclaration est retenue). */
  @IsOptional()
  @Type(() => Number)
  @IsInt({ message: 'La quantité vérifiée doit être un nombre entier' })
  @Min(0, { message: 'La quantité vérifiée ne peut pas être négative' })
  quantiteVerifiee?: number | null;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  commentaire?: string;
}

export class VerifierRapportDto {
  @IsDateString({}, { message: 'Date de la vérification invalide' })
  dateVerification!: string;

  /** Agents présents lors de la visite (texte libre). */
  @IsOptional()
  @IsString()
  @MaxLength(500)
  agents?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  observations?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => LigneVerificationDto)
  lignes!: LigneVerificationDto[];
}
