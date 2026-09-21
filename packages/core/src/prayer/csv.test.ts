// La lecture d'un calendrier CSV (ADR 0004).
//
// Ce que ces tests éprouvent, ce n'est pas le cas facile : c'est le fichier que produit vraiment
// Excel en français — point-virgule, marque d'ordre des octets, fins de ligne CRLF — et les erreurs
// qu'un responsable fait vraiment : une date inversée, une heure avec des secondes, un jour en
// double, une ligne oubliée.

import { describe, expect, it } from 'vitest';
import { analyserCalendrier, lireCsv, lireHeure } from './csv.js';

/** Un calendrier bien formé, dans notre format documenté. */
function calendrier(jours: number, premier = 21, mois = 9): string {
	const lignes = ['date,fajr,dhuhr,asr,maghrib,isha'];
	for (let index = 0; index < jours; index += 1) {
		const jour = String(premier + index).padStart(2, '0');
		// Une dérive d'une minute par jour : c'est l'ordre de grandeur réel à 47° N.
		const decalage = String(30 + index).padStart(2, '0');
		lignes.push(
			`2026-${String(mois).padStart(2, '0')}-${jour},05:${decalage},13:20,16:50,19:${decalage},21:00`
		);
	}
	return lignes.join('\n');
}

describe('le découpage du CSV', () => {
	it('reads the file Excel in French actually writes', () => {
		// Marque d'ordre des octets, point-virgule, fins de ligne CRLF : les trois à la fois.
		const texte = '\uFEFFdate;fajr;dhuhr\r\n2026-09-21;05:40;13:20\r\n';
		expect(lireCsv(texte)).toEqual([
			['date', 'fajr', 'dhuhr'],
			['2026-09-21', '05:40', '13:20']
		]);
	});

	it('keeps a separator that lives inside quotes', () => {
		expect(lireCsv('a,b\n"x,1",2')).toEqual([
			['a', 'b'],
			['x,1', '2']
		]);
	});

	it('unwraps a doubled quote', () => {
		expect(lireCsv('a\n"dit ""oui"""')).toEqual([['a'], ['dit "oui"']]);
	});

	it('does not mistake a quoted semicolon for the separator', () => {
		// La première ligne contient un point-virgule cité et deux virgules : c'est la virgule.
		expect(lireCsv('"a;b",c,d\n1,2,3')).toEqual([
			['a;b', 'c', 'd'],
			['1', '2', '3']
		]);
	});

	it('ignores a blank line and a trailing newline', () => {
		expect(lireCsv('a,b\n\n1,2\n')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
	});

	it('reads a tab-separated file too', () => {
		expect(lireCsv('a\tb\n1\t2')).toEqual([
			['a', 'b'],
			['1', '2']
		]);
	});
});

describe('la lecture d’une heure', () => {
	it.each([
		['19:23', '19:23'],
		['9:23', '09:23'],
		['09:23', '09:23'],
		['19:23:00', '19:23'],
		['19h23', '19:23'],
		['19 h 23', '19:23'],
		[' 19:23 ', '19:23'],
		['7:23 PM', '19:23'],
		['7:23 AM', '07:23'],
		['12:05 AM', '00:05'],
		['12:05 PM', '12:05']
	])('reads %s as %s', (brut, attendu) => {
		expect(lireHeure(brut)).toBe(attendu);
	});

	it.each([
		['19:23:30'],
		['25:00'],
		['19:60'],
		[''],
		['-'],
		['--'],
		['N/A'],
		['bientôt'],
		['1923']
	])('refuses %s', (brut) => {
		// `19:23:30` est refusé et non arrondi : la base n'accepte aucune seconde, et l'accepter
		// ici ferait échouer l'écriture après avoir dit au responsable que tout allait bien.
		expect(lireHeure(brut)).toBeNull();
	});
});

describe('un calendrier valide', () => {
	it('reads every day, and says what it covers', () => {
		const lu = analyserCalendrier(calendrier(10));
		expect(lu.jours).toHaveLength(10);
		expect(lu.refusees).toEqual([]);
		expect(lu.premiere).toBe('2026-09-21');
		expect(lu.derniere).toBe('2026-09-30');
		expect(lu.manquants).toEqual([]);
		expect(lu.separateur).toBe(',');
		expect(lu.jours[0]).toEqual({
			date: '2026-09-21',
			fajr: '05:30',
			dhuhr: '13:20',
			asr: '16:50',
			maghrib: '19:30',
			isha: '21:00'
		});
	});

	it('recognises the column names a mosque actually writes', () => {
		// Synonymes français et anglais, plus la colonne du lever du soleil, qu'on ignore : l'export
		// de Mawaqit la contient et notre table n'en a pas.
		const texte = [
			'Jour;Sobh;Chourouk;Dohr;Asr;Maghreb;Icha',
			'2026-09-21;05:40;07:12;13:20;16:50;19:27;21:00'
		].join('\n');
		const lu = analyserCalendrier(texte);
		expect(lu.refusees).toEqual([]);
		expect(lu.jours[0]?.fajr).toBe('05:40');
		expect(lu.jours[0]?.isha).toBe('21:00');
	});

	it('refuses a file whose first line does not name the columns', () => {
		const lu = analyserCalendrier('2026-09-21,05:40,13:20,16:50,19:27,21:00');
		expect(lu.jours).toEqual([]);
		expect(lu.refusees[0]?.raison).toContain('nommer les colonnes');
	});
});

describe('ce que le lecteur refuse, et où', () => {
	it('names the line and the reason for an unreadable hour', () => {
		const texte = [
			'date,fajr,dhuhr,asr,maghrib,isha',
			'2026-09-21,05:40,13:20,16:50,19:27,21:00',
			'2026-09-22,05:41,13:20,16:50,19:25,21h',
			'2026-09-23,05:42,13:20,16:50,19:23,20:58'
		].join('\n');
		const lu = analyserCalendrier(texte);
		expect(lu.jours).toHaveLength(2);
		expect(lu.refusees).toHaveLength(1);
		// La troisième ligne du fichier, en-tête comprise : c'est ce que le responsable voit.
		expect(lu.refusees[0]?.ligne).toBe(3);
		expect(lu.refusees[0]?.raison).toContain('isha');
	});

	it('refuses a day that appears twice', () => {
		const texte = [
			'date,fajr,dhuhr,asr,maghrib,isha',
			'2026-09-21,05:40,13:20,16:50,19:27,21:00',
			'2026-09-21,05:41,13:20,16:50,19:25,20:58'
		].join('\n');
		const lu = analyserCalendrier(texte);
		expect(lu.jours).toHaveLength(1);
		expect(lu.refusees[0]?.raison).toContain('deux fois');
	});

	it('refuses a prayer that comes before the one it follows', () => {
		const texte = [
			'date,fajr,dhuhr,asr,maghrib,isha',
			'2026-09-21,05:40,13:20,12:50,19:27,21:00'
		].join('\n');
		const lu = analyserCalendrier(texte);
		expect(lu.jours).toEqual([]);
		expect(lu.refusees[0]?.raison).toContain('asr');
	});

	it('accepts an isha that crosses midnight, because a real calendar has one', () => {
		// Vingt-huit jours par an à 47° N. Refuser ce cas rejetterait un vrai calendrier.
		const texte = [
			'date,fajr,dhuhr,asr,maghrib,isha',
			'2026-06-21,02:36,13:34,17:47,21:30,00:10'
		].join('\n');
		const lu = analyserCalendrier(texte);
		expect(lu.refusees).toEqual([]);
		expect(lu.jours[0]?.isha).toBe('00:10');
	});

	it('still refuses an isha that is simply out of order', () => {
		const texte = [
			'date,fajr,dhuhr,asr,maghrib,isha',
			'2026-09-21,05:40,13:20,16:50,19:27,18:00'
		].join('\n');
		const lu = analyserCalendrier(texte);
		expect(lu.jours).toEqual([]);
		expect(lu.refusees[0]?.raison).toContain('sans passer minuit');
	});

	it('lists the days missing between the first and the last', () => {
		const texte = [
			'date,fajr,dhuhr,asr,maghrib,isha',
			'2026-09-21,05:40,13:20,16:50,19:27,21:00',
			'2026-09-24,05:43,13:20,16:50,19:22,20:56'
		].join('\n');
		const lu = analyserCalendrier(texte);
		expect(lu.manquants).toEqual(['2026-09-22', '2026-09-23']);
	});
});

describe('les sauts suspects', () => {
	it('warns about a jump of more than six minutes, without refusing it', () => {
		const texte = [
			'date,fajr,dhuhr,asr,maghrib,isha',
			'2026-09-21,05:40,13:20,16:50,19:27,21:00',
			'2026-09-22,06:40,13:20,16:50,19:25,20:58'
		].join('\n');
		const lu = analyserCalendrier(texte);
		// Soixante minutes sur **une seule** prière : c'est une faute de frappe, pas un changement
		// d'heure, et c'est l'erreur la plus facile à commettre en recopiant un tableau à la main.
		// Tolérer soixante minutes prière par prière la laisserait passer.
		// Signalé, jamais refusé : un calendrier réel peut porter une correction volontaire.
		expect(lu.jours).toHaveLength(2);
		expect(lu.avertissements).toHaveLength(1);
		expect(lu.avertissements[0]?.message).toContain('fajr');
		expect(lu.avertissements[0]?.message).toContain('60 minutes');
	});

	it('says nothing on the two days the clock changes', () => {
		// Le 29 mars 2026, l'heure affichée saute d'une heure pleine sur toutes les prières. Sans
		// cette tolérance, le lecteur crierait deux fois par an, précisément les jours où les
		// responsables regardent leurs horaires.
		const texte = [
			'date,fajr,dhuhr,asr,maghrib,isha',
			'2026-03-28,04:33,12:37,16:07,18:55,20:32',
			'2026-03-29,05:31,13:37,17:08,19:56,21:35'
		].join('\n');
		expect(analyserCalendrier(texte).avertissements).toEqual([]);
	});

	it('says nothing about an isha that drops below midnight', () => {
		const texte = [
			'date,fajr,dhuhr,asr,maghrib,isha',
			'2026-06-09,02:45,13:32,17:45,21:22,23:58',
			'2026-06-10,02:44,13:32,17:45,21:23,00:03'
		].join('\n');
		expect(analyserCalendrier(texte).avertissements).toEqual([]);
	});
});

describe('l’ordre jour/mois, tranché sur toute la colonne', () => {
	it('reads a European date when only that reading works', () => {
		// Le 21 ne peut pas être un mois : une seule lecture tient.
		const texte = [
			'date,fajr,dhuhr,asr,maghrib,isha',
			'21/09/2026,05:40,13:20,16:50,19:27,21:00',
			'22/09/2026,05:41,13:20,16:50,19:25,20:58'
		].join('\n');
		const lu = analyserCalendrier(texte);
		expect(lu.ordreAmbigu).toBe(false);
		expect(lu.jours.map((jour) => jour.date)).toEqual(['2026-09-21', '2026-09-22']);
	});

	it('reads the German dotted form the same way', () => {
		const texte = [
			'date;fajr;dhuhr;asr;maghrib;isha',
			'21.09.2026;05:40;13:20;16:50;19:27;21:00',
			'22.09.2026;05:41;13:20;16:50;19:25;20:58'
		].join('\n');
		expect(analyserCalendrier(texte).jours.map((jour) => jour.date)).toEqual([
			'2026-09-21',
			'2026-09-22'
		]);
	});

	it('refuses to guess when both readings hold, and says so', () => {
		// 09/10 et 10/11 se lisent des deux façons, et donnent deux calendriers différents. Deviner
		// ici, c'est se tromper une fois sur deux sans que personne ne le voie.
		const texte = [
			'date,fajr,dhuhr,asr,maghrib,isha',
			'09/10/2026,05:40,13:20,16:50,19:27,21:00',
			'10/11/2026,05:41,13:20,16:50,19:25,20:58'
		].join('\n');
		const lu = analyserCalendrier(texte);
		expect(lu.ordreAmbigu).toBe(true);
		expect(lu.jours).toEqual([]);
		expect(lu.refusees.length).toBeGreaterThan(0);
	});

	it('obeys the order the person declares on the screen', () => {
		const texte = [
			'date,fajr,dhuhr,asr,maghrib,isha',
			'09/10/2026,05:40,13:20,16:50,19:27,21:00',
			'10/11/2026,05:41,13:20,16:50,19:25,20:58'
		].join('\n');
		const jourMois = analyserCalendrier(texte, { ordre: 'jour-mois' });
		expect(jourMois.jours.map((jour) => jour.date)).toEqual(['2026-10-09', '2026-11-10']);
		const moisJour = analyserCalendrier(texte, { ordre: 'mois-jour' });
		expect(moisJour.jours.map((jour) => jour.date)).toEqual(['2026-09-10', '2026-10-11']);
	});

	it('reads a monthly file whose date column is only a day number', () => {
		// C'est la forme que Mawaqit exporte : douze fichiers, un par mois. L'année et le mois ne
		// sont pas dans le fichier — ils viennent de l'écran, jamais du nom du fichier.
		const texte = [
			'date,fajr,dhuhr,asr,maghrib,isha',
			'1,05:40,13:20,16:50,19:27,21:00',
			'2,05:41,13:20,16:50,19:25,20:58'
		].join('\n');
		const sans = analyserCalendrier(texte, { annee: 2026 });
		expect(sans.ordreAmbigu).toBe(true);
		const avec = analyserCalendrier(texte, { annee: 2026, mois: 5 });
		expect(avec.jours.map((jour) => jour.date)).toEqual(['2026-05-01', '2026-05-02']);
	});

	it('refuses a date that does not exist in the calendar', () => {
		const texte = [
			'date,fajr,dhuhr,asr,maghrib,isha',
			'2026-02-30,05:40,13:20,16:50,19:27,21:00'
		].join('\n');
		const lu = analyserCalendrier(texte);
		expect(lu.jours).toEqual([]);
		expect(lu.refusees[0]?.raison).toContain('n’existe pas');
	});
});

describe('un fichier vide ou absurde', () => {
	it('says the file is empty rather than reading nothing in silence', () => {
		expect(analyserCalendrier('').refusees[0]?.raison).toContain('vide');
	});

	it('reads a full year without complaining', () => {
		const lu = analyserCalendrier(calendrier(9, 1, 9));
		expect(lu.jours).toHaveLength(9);
		expect(lu.refusees).toEqual([]);
	});
});
