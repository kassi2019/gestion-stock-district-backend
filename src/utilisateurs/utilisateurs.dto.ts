/**
 * =============================================================================
 * DONNÉES ATTENDUES POUR LES UTILISATEURS
 * =============================================================================
 * Règle des mots de passe (cahier des charges §8, sécurité) :
 *   - au moins 8 caractères ;
 *   - au moins une lettre ET au moins un chiffre.
 * =============================================================================
 */
import { OmitType, PartialType } from '@nestjs/mapped-types';
import {
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Matches,
  MinLength,
} from 'class-validator';

/** Règle commune des mots de passe (réutilisée dans plusieurs DTO). */
const REGLE_MOT_DE_PASSE = /^(?=.*[A-Za-z])(?=.*\d).{8,}$/;
const MESSAGE_MOT_DE_PASSE =
  'Le mot de passe doit contenir au moins 8 caractères, dont au moins une lettre et un chiffre';

/**
 * Règle des matricules : ils servent d'IDENTIFIANT DE CONNEXION, donc
 * lettres, chiffres, point, tiret, souligné seulement (pas d'espace ni d'accent).
 */
export const REGLE_MATRICULE = /^[a-zA-Z0-9._-]+$/;
export const MESSAGE_MATRICULE =
  "Le matricule sert d'identifiant de connexion : seulement des lettres, chiffres, points, tirets ou soulignés (pas d'espace ni d'accent)";

/**
 * Compte utilisateur (mot de passe, profil).
 * ⚠ L'IDENTIFIANT DE CONNEXION n'est pas saisi : c'est le MATRICULE de la
 *   personne (voir utilisateurs.service.ts > creerCompte).
 * Utilisé seul (création d'un compte pour un membre du personnel) ou à
 * l'intérieur de la fiche du personnel (« créer aussi un compte »).
 */
export class CompteDto {
  @IsString()
  @Matches(REGLE_MOT_DE_PASSE, { message: MESSAGE_MOT_DE_PASSE })
  motDePasse!: string;

  /** Profil (identifiant dans la table roles) */
  @IsInt({ message: 'Le profil est obligatoire' })
  roleId!: number;
}

/**
 * Création d'un compte pour un membre du personnel qui n'en a pas encore.
 * Le nom, la fonction et les contacts sont repris de sa fiche personnel.
 */
export class CreerUtilisateurDto extends CompteDto {
  @IsInt({ message: 'Choisissez le membre du personnel' })
  personnelId!: number;
}

/**
 * Modification d'un compte : profil, activation.
 * (L'identifiant = le matricule, et l'identité — nom, fonction, contacts —
 *  se modifient sur la fiche personnel ; le mot de passe a sa propre route.)
 */
export class ModifierUtilisateurDto extends PartialType(OmitType(CompteDto, ['motDePasse'] as const)) {
  @IsOptional() @IsBoolean()
  actif?: boolean;
}

/** Réinitialisation du mot de passe d'un utilisateur par l'administrateur. */
export class ReinitialiserMotDePasseDto {
  @IsString()
  @Matches(REGLE_MOT_DE_PASSE, { message: MESSAGE_MOT_DE_PASSE })
  nouveauMotDePasse!: string;
}

/** Changement de SON PROPRE mot de passe (tout utilisateur connecté). */
export class ChangerMonMotDePasseDto {
  @IsString()
  @IsNotEmpty({ message: "L'ancien mot de passe est obligatoire" })
  ancienMotDePasse!: string;

  @IsString()
  @MinLength(8, { message: MESSAGE_MOT_DE_PASSE })
  @Matches(REGLE_MOT_DE_PASSE, { message: MESSAGE_MOT_DE_PASSE })
  nouveauMotDePasse!: string;
}
