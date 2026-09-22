// Les conditions d'utilisation, ouvertes à tous (ADR 0044).
//
// Aucune session n'est demandée : une organisation doit pouvoir lire ce qu'elle acceptera avant
// d'avoir un compte. La page vit pourtant dans la coquille de l'espace des responsables et reste
// `noindex` : c'est le texte du service, pas une page d'organisation.

import { conditionsHtml } from '$lib/server/conditions.js';
import type { PageServerLoad } from './$types.js';

/** Aucun JavaScript : un texte à lire n'a rien à hydrater. */
export const csr = false;

export const load: PageServerLoad = () => ({ html: conditionsHtml });
