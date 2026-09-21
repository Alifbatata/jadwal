// Les messages prêts à coller dans WhatsApp (cadrage, section « Solution »).
//
// Du texte, rien que du texte : pas de mise en forme, pas de lien qui casse, pas d'émoji imposé.
// C'est ce que les responsables recopient déjà à la main aujourd'hui, en moins fastidieux.

import type { IsoDate } from '@jadwal/core';
import { describeSessionTime, shortDate } from './format.js';

export interface SeanceLine {
	date: IsoDate;
	title: string;
	start: string | null;
	end: string | null;
	room: string | null;
	anchor?: { prayer: string; offsetMinutes: number } | undefined;
	status: string;
}

/**
 * Le programme de la semaine, jour par jour. Les séances annulées y figurent **barrées en mots** :
 * ne pas les dire serait le meilleur moyen que quelqu'un se déplace pour rien.
 */
export function weekMessage(
	greeting: string,
	organisation: string,
	seances: readonly SeanceLine[]
): string {
	const lignes: string[] = [`${greeting},`, '', `Programme de la semaine à ${organisation} :`];
	const parJour = new Map<string, SeanceLine[]>();
	for (const seance of seances) {
		if (seance.status === 'moved_away') continue;
		const jour = parJour.get(seance.date) ?? [];
		jour.push(seance);
		parJour.set(seance.date, jour);
	}
	if (parJour.size === 0) {
		lignes.push('', 'Aucune séance cette semaine.');
		return lignes.join('\n');
	}
	for (const [date, jour] of [...parJour.entries()].sort()) {
		lignes.push('', shortDate(date as IsoDate));
		for (const seance of jour) {
			const heure = describeSessionTime(seance);
			const lieu = seance.room ? `, ${seance.room}` : '';
			const marque =
				seance.status === 'cancelled'
					? ' (ANNULÉ)'
					: seance.status === 'moved_here'
						? ' (date exceptionnelle)'
						: '';
			lignes.push(`- ${seance.title}, ${heure}${lieu}${marque}`);
		}
	}
	return lignes.join('\n');
}

/** Le message d'une annulation ponctuelle. Il dit toujours que le cours continue après. */
export function cancellationMessage(greeting: string, title: string, date: IsoDate): string {
	return [
		`${greeting},`,
		'',
		`Le cours « ${title} » du ${shortDate(date)} est annulé.`,
		'Les autres séances ont lieu normalement.'
	].join('\n');
}

/** Le message d'un déplacement. Les deux dates y sont, sans quoi personne ne s'y retrouve. */
export function moveMessage(
	greeting: string,
	title: string,
	from: IsoDate,
	to: IsoDate,
	start: string
): string {
	return [
		`${greeting},`,
		'',
		`Le cours « ${title} » du ${shortDate(from)} est déplacé au ${shortDate(to)} à ${start}.`,
		'Les autres séances ont lieu normalement.'
	].join('\n');
}

/** Le message d'un cours nouveau. */
export function newCourseMessage(
	greeting: string,
	title: string,
	rythme: string,
	horaire: string,
	room: string | null
): string {
	const lieu = room ? `, ${room}` : '';
	return [`${greeting},`, '', `Nouveau cours : « ${title} », ${rythme}, ${horaire}${lieu}.`].join(
		'\n'
	);
}
