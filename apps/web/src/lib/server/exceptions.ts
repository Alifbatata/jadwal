// Ce qui est arrivé à une séance un jour donné, et le défaire : les deux écrans qui annulent,
// déplacent et rétablissent, « À venir » et « Prière du vendredi », passent par ici (étape 19,
// lot 2).
//
// La carte « Rétablir » envoie ce qu'elle montrait : l'identifiant de l'exception, et pour un
// déplacement le jour et l'heure d'arrivée. Sans cela, une page restée ouverte, après qu'une autre
// personne avait rétabli la séance puis l'avait changée de nouveau, effaçait ce nouveau changement,
// qu'elle n'avait jamais vu. C'est le défaut que l'étape 18 a corrigé pour Annuler et Déplacer.
// L'identifiant compte : une annulation refaite, ou un déplacement refait vers le même jour à la
// même heure, montre la même chose que le premier, mais c'est une autre exception, que la carte n'a
// jamais vue (reprise du lot 2). Le jour et l'heure gardent la carte d'une exception changée sur
// place, ce que seul l'entretien fait aujourd'hui. Un formulaire qui n'envoie rien de ce qu'il
// montrait, écrit à la main ou venu d'une page ouverte avant ce lot, n'est pas comparé, comme
// l'heure `plannedStart` d'un déplacement.

import { sql, type Transaction } from '@jadwal/db';

function rows<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const inner = (result as { rows?: unknown[] }).rows;
	return Array.isArray(inner) ? (inner as T[]) : [];
}

/**
 * Ce que la carte montrait : l'identifiant de l'exception, et pour un déplacement le jour et l'heure
 * d'arrivée, `AAAA-MM-JJ` et `HH:MM`, vides pour une annulation. Le type ne s'envoie pas : la forme
 * d'une exception (`session_exception_shape_ck`) le fixe, une annulation n'a ni jour ni heure
 * d'arrivée, un déplacement a les deux.
 */
export interface ShownChange {
	id: string;
	toDate: string;
	toStart: string;
}

/** Ce que la carte envoie de ce qu'elle montrait, ou `null` quand elle n'en envoie rien. */
export function shownChange(form: FormData): ShownChange | null {
	const id = form.get('shownId');
	if (id === null) return null;
	return {
		id: String(id),
		toDate: String(form.get('shownToDate') ?? ''),
		toStart: String(form.get('shownToStart') ?? '')
	};
}

/**
 * Ce qui est déjà arrivé à la séance de ce cours ce jour-là, `cancelled` ou `moved`, ou rien quand
 * elle est encore prévue telle quelle. La table des exceptions est lue directement, pour toute date,
 * et pas seulement les sept jours d'un écran.
 */
export async function currentChange(
	tx: Transaction,
	courseId: string,
	date: string
): Promise<string | null> {
	const found = rows<{ kind: string }>(
		await tx.execute(sql`
			select "kind" from "session_exception" where "course_id" = ${courseId} and "date" = ${date}
		`)
	);
	return found[0]?.kind ?? null;
}

/**
 * Rétablit la séance : retire l'exception de ce cours ce jour-là, et seulement si c'est celle que la
 * carte montrait, la même exception, au même jour et à la même heure d'arrivée. Rend `restored`, ou
 * le refus d'une carte périmée, et rien ne s'écrit alors : `changed`, la séance a changé autrement,
 * ou de nouveau, depuis ; `alreadyRestored`, il n'y a plus rien à rétablir.
 *
 * La comparaison porte sur le texte des colonnes : une valeur envoyée à la main, même illisible, ne
 * fait pas d'erreur de la base, elle ne correspond à rien. Elle se fait dans la suppression même :
 * un changement écrit entre la lecture de la page et cet envoi n'est jamais effacé.
 */
export async function restore(
	tx: Transaction,
	courseId: string,
	date: string,
	shown: ShownChange | null
): Promise<'restored' | 'changed' | 'alreadyRestored'> {
	const asShown =
		shown === null
			? sql``
			: sql`and "id"::text = ${shown.id}
				and coalesce("to_date"::text, '') = ${shown.toDate}
				and coalesce(left("to_start"::text, 5), '') = ${shown.toStart}`;
	const removed = rows<{ id: string }>(
		await tx.execute(sql`
			delete from "session_exception"
			where "course_id" = ${courseId} and "date" = ${date} ${asShown}
			returning "id"
		`)
	);
	if (removed.length > 0) return 'restored';
	return (await currentChange(tx, courseId, date)) === null ? 'alreadyRestored' : 'changed';
}
