// Le module d'écoute du direct (ADR 0057), servi à part comme le script hors réseau.
//
// Incorporé à la construction, comme `hors-reseau.ts` : le serveur de production ne contient que
// `apps/web/build`.

import { createHash } from 'node:crypto';
import source from '#lib/ecoute/ecoute.js?raw';

/** Les octets du module, tels qu'ils partiront sur le réseau. */
export const ECOUTE = source;

export const ECOUTE_ETAG = `"${createHash('sha256').update(Buffer.from(source, 'utf8')).digest('base64url').slice(0, 12)}"`;
