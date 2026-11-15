/**
 * =============================================================================
 * ROUTES DE CONNEXION
 * =============================================================================
 * Un "controller" reçoit les requêtes HTTP du frontend et appelle le service.
 * Il ne contient pas de logique métier : il fait seulement le lien.
 *
 * Routes disponibles :
 *   POST /api/auth/login  -> connexion (accessible sans être connecté)
 *   GET  /api/auth/moi    -> informations de l'utilisateur connecté (+ délai d'inactivité)
 * =============================================================================
 */
import { Body, Controller, Get, Ip, Post } from '@nestjs/common';
import { AuthService } from './auth.service';
import { ConnexionDto } from './auth.dto';
import { Public } from './roles.decorator';
import { UtilisateurCourant } from './current-user.decorator';
import { UtilisateurConnecte } from './jwt.strategy';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  /** Connexion : reçoit { login, motDePasse } et renvoie un jeton. */
  @Public()
  @Post('login')
  connexion(@Body() dto: ConnexionDto, @Ip() adresseIp: string) {
    return this.authService.connecter(dto.login, dto.motDePasse, adresseIp);
  }

  /**
   * Renvoie l'utilisateur connecté (permet au frontend de vérifier la session),
   * avec ses droits, sa photo (fiche personnel) et le délai d'inactivité avant
   * déconnexion automatique (minutes, paramètre général).
   */
  @Get('moi')
  async moi(@UtilisateurCourant() utilisateur: UtilisateurConnecte) {
    const [photo, delaiInactivite] = await Promise.all([this.authService.photo(utilisateur.id), this.authService.delaiInactivite()]);
    return { ...utilisateur, photo, delaiInactivite };
  }
}
