/**
 * =============================================================================
 * ROUTES DU MODULE 09 — TABLEAU DE BORD ET ÉTATS (lecture seule)
 * =============================================================================
 * Droit « Voir » sur le module « rapports » (tuile « États & rapports »).
 * Filtres communs : ?du=AAAA-MM-JJ&au=AAAA-MM-JJ&centreId=&fournisseurId=&medicamentId=
 *   GET /api/etats/tableau-de-bord
 *   GET /api/etats/stock
 *   GET /api/etats/receptions        GET /api/etats/livraisons     GET /api/etats/mouvements
 *   GET /api/etats/consommations
 *   GET /api/etats/factures          GET /api/etats/encaissements  GET /api/etats/creances
 *   GET /api/etats/produits          GET /api/etats/ecarts
 * =============================================================================
 */
import { Controller, Get, Query } from '@nestjs/common';
import { Acces } from '../auth/droits';
import { EtatsService, FiltresEtat } from './etats.service';

function filtres(q: Record<string, string | undefined>): FiltresEtat {
  const nombre = (v?: string) => (v ? Number(v) : undefined);
  return { du: q.du || undefined, au: q.au || undefined, centreId: nombre(q.centreId), fournisseurId: nombre(q.fournisseurId), medicamentId: nombre(q.medicamentId) };
}

@Controller('etats')
export class EtatsController {
  constructor(private etats: EtatsService) {}

  @Acces('rapports', 'LECTURE')
  @Get('tableau-de-bord')
  tableauDeBord(@Query() q: Record<string, string>) {
    return this.etats.tableauDeBord(filtres(q));
  }

  @Acces('rapports', 'LECTURE')
  @Get('stock')
  stock(@Query() q: Record<string, string>) {
    return this.etats.stock(filtres(q));
  }

  @Acces('rapports', 'LECTURE')
  @Get('receptions')
  receptions(@Query() q: Record<string, string>) {
    return this.etats.receptions(filtres(q));
  }

  @Acces('rapports', 'LECTURE')
  @Get('livraisons')
  livraisons(@Query() q: Record<string, string>) {
    return this.etats.livraisons(filtres(q));
  }

  @Acces('rapports', 'LECTURE')
  @Get('mouvements')
  mouvements(@Query() q: Record<string, string>) {
    return this.etats.mouvements(filtres(q));
  }

  @Acces('rapports', 'LECTURE')
  @Get('consommations')
  consommations(@Query() q: Record<string, string>) {
    return this.etats.consommations(filtres(q));
  }

  @Acces('rapports', 'LECTURE')
  @Get('factures')
  factures(@Query() q: Record<string, string>) {
    return this.etats.factures(filtres(q));
  }

  @Acces('rapports', 'LECTURE')
  @Get('encaissements')
  encaissements(@Query() q: Record<string, string>) {
    return this.etats.encaissements(filtres(q));
  }

  @Acces('rapports', 'LECTURE')
  @Get('creances')
  creances(@Query() q: Record<string, string>) {
    return this.etats.creances(filtres(q));
  }

  @Acces('rapports', 'LECTURE')
  @Get('produits')
  produits(@Query() q: Record<string, string>) {
    return this.etats.produits(filtres(q));
  }

  @Acces('rapports', 'LECTURE')
  @Get('ecarts')
  ecarts(@Query() q: Record<string, string>) {
    return this.etats.ecarts(filtres(q));
  }
}
