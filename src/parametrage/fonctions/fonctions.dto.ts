/** Données attendues pour créer ou modifier une FONCTION du personnel (ex. Pharmacien, Caissière). */
import { PartialType } from '@nestjs/mapped-types';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreerFonctionDto {
  /** Code FACULTATIF : s'il est vide, un code est généré (FCT-0001...) */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsString()
  @IsNotEmpty({ message: 'Le libellé est obligatoire' })
  @MaxLength(100)
  libelle!: string;
}

export class ModifierFonctionDto extends PartialType(CreerFonctionDto) {}
