// Identifiants : UUID version 7 générés par l'application (ADR 0014). Le paquet `uuid` tient la
// monotonie à l'intérieur d'une même milliseconde ; une implémentation sans compteur la perdrait
// une fois sur deux.

import { v7 } from 'uuid';

/** Nouvel identifiant de ligne, trié dans l'ordre de création. */
export function newId(): string {
	return v7();
}
