// Le script qui enregistre le travailleur de service des pages publiques (ADR 0054).
//
// Incorporé à la construction, comme le script du mode intégré (`widget.ts`) : le serveur de
// production ne contient que `apps/web/build`.

import { createHash } from 'node:crypto';
import source from '#lib/hors-reseau/enregistrer.js?raw';

/** Les octets du script, tels qu'ils partiront sur le réseau. */
export const ENREGISTREMENT = source;

export const ENREGISTREMENT_ETAG = `"${createHash('sha256').update(Buffer.from(source, 'utf8')).digest('base64url').slice(0, 12)}"`;
