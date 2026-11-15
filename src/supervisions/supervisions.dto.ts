/**
 * =============================================================================
 * DONNÉES ATTENDUES — MODULE 08 SUPERVISIONS ET INVENTAIRES DANS LES CENTRES
 * =============================================================================
 * Quantités dans l'UNITÉ DE VENTE du médicament (comme le stock des centres).
 * =============================================================================
 */
import { PartialType } from '@nestjs/mapped-types';
import { Type } from 'class-transformer';
import {
  ArrayMinSize,
  IsArray,
  IsDateString,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';
import { DECISION_SUPERVISION } from '../common/constants';

/** Agent présent lors du contrôle (du district ou du centre). */
export class AgentSupervisionDto {
  /** Utilisateur de l'application (facultatif) */
  @IsOptional()
  @IsInt()
  utilisateurId?: number;

  @IsString({ message: "Indiquez le nom de l'agent" })
  @MaxLength(150)
  nom!: string;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  fonction?: string;
}

/** Quantité physique constatée pour un médicament (lot facultatif). */
export class LigneSupervisionDto {
  @IsInt({ message: 'Choisissez le médicament' })
  medicamentId!: number;

  @IsOptional()
  @IsInt()
  lotId?: number;

  @Type(() => Number)
  @IsInt({ message: 'La quantité constatée doit être un nombre entier' })
  @Min(0, { message: 'La quantité constatée ne peut pas être négative' })
  stockPhysique!: number;

  @IsOptional()
  @IsString()
  @MaxLength(255)
  commentaire?: string;
}

export class CreerSupervisionDto {
  @IsInt({ message: 'Choisissez le centre de santé' })
  centreId!: number;

  @IsDateString({}, { message: 'Date du contrôle invalide' })
  dateSupervision!: string;

  @IsOptional()
  @IsString()
  @MaxLength(4000)
  observations?: string;

  @IsArray()
  @ArrayMinSize(1, { message: 'Indiquez au moins un agent présent' })
  @ValidateNested({ each: true })
  @Type(() => AgentSupervisionDto)
  agents!: AgentSupervisionDto[];

  @IsArray()
  @ArrayMinSize(1, { message: 'Ajoutez au moins un médicament contrôlé' })
  @ValidateNested({ each: true })
  @Type(() => LigneSupervisionDto)
  lignes!: LigneSupervisionDto[];
}

export class ModifierSupervisionDto extends PartialType(CreerSupervisionDto) {}

export class MotifDto {
  @IsString({ message: 'Indiquez le motif' })
  @MaxLength(500)
  motif!: string;
}

/** DÉCISION sur les écarts d'une supervision validée (clôture). */
export class DeciderSupervisionDto {
  @IsIn(Object.values(DECISION_SUPERVISION), { message: 'Décision invalide' })
  decision!: string;

  @IsString({ message: 'Indiquez le motif de la décision' })
  @MaxLength(2000)
  motif!: string;

  /** Date de la facture (décision FACTURATION ; par défaut aujourd'hui) */
  @IsOptional()
  @IsDateString({}, { message: 'Date de facture invalide' })
  dateFacture?: string;
}
