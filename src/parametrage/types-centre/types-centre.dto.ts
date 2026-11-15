/** Données attendues pour créer ou modifier un TYPE DE CENTRE (ex. CSU, Dispensaire). */
import { PartialType } from '@nestjs/mapped-types';
import { IsNotEmpty, IsOptional, IsString, MaxLength } from 'class-validator';

export class CreerTypeCentreDto {
  /** Code FACULTATIF : s'il est vide, un code est généré (voir common/codes-auto.ts) */
  @IsOptional()
  @IsString()
  @MaxLength(30)
  code?: string;

  @IsString()
  @IsNotEmpty({ message: 'Le libellé est obligatoire' })
  @MaxLength(100)
  libelle!: string;

  @IsOptional() @IsString() @MaxLength(255)
  description?: string;
}

export class ModifierTypeCentreDto extends PartialType(CreerTypeCentreDto) {}
