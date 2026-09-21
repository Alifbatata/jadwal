// La lecture d'un calendrier d'heures de prière au format CSV (ADR 0004, étape 7).
//
// **Pourquoi un lecteur écrit à la main.** Le fichier fait trois cent soixante-six lignes de six
// colonnes. Les deux bibliothèques propres du domaine pèsent 270 Kio et 1,6 Mio, pour un besoin qui
// tient en une cinquantaine de lignes : « aucune dépendance sans besoin immédiat » tranche.
//
// **Pourquoi pas « le format Mawaqit ».** Il n'existe publiquement rien qui fixe les colonnes, le
// séparateur ou l'encodage de son export. Ce qui est établi : c'est du CSV, il se télécharge en
// **douze fichiers mensuels**, et il contient les cinq prières plus le lever du soleil. Le reste
// circule sans source. Nous documentons donc **notre** format, et nous rendons le lecteur tolérant
// par reconnaissance — synonymes de colonnes, séparateur deviné — plutôt que par devinette sur une
// spécification imaginaire.

import { addDays, isoDateToDays, parseIsoDate } from '../dates.js';
import type { IsoDate, LocalTime, PrayerDay } from '../types.js';

/** Les séparateurs rencontrés dans la nature. Excel en français et en suisse écrit des points-virgules. */
const SEPARATEURS = [',', ';', '\t'] as const;

/**
 * Découpe un texte CSV en lignes de champs, selon la RFC 4180 plus trois tolérances assumées :
 * la marque d'ordre des octets en tête, le point-virgule et la tabulation comme séparateurs, et le
 * rognage des espaces autour d'un champ non cité.
 *
 * Un `split(',')` serait faux même sur six colonnes : un fichier passé par Excel peut contenir un
 * champ cité, et un guillemet interne s'y double.
 */
export function lireCsv(texte: string, separateurImpose?: string): string[][] {
	// `File.text()` retire déjà la marque d'ordre des octets UTF-8 ; `readFileSync(…, 'utf8')` non.
	const source = texte.replace(/^\uFEFF/, '');
	const separateur = separateurImpose ?? devinerSeparateur(source);
	const lignes: string[][] = [];
	let champs: string[] = [];
	let champ = '';
	let cite = false;
	let index = 0;
	while (index < source.length) {
		const caractere = source[index] as string;
		if (cite) {
			if (caractere === '"') {
				if (source[index + 1] === '"') {
					champ += '"';
					index += 2;
					continue;
				}
				cite = false;
				index += 1;
				continue;
			}
			champ += caractere;
			index += 1;
			continue;
		}
		if (caractere === '"' && champ.trim() === '') {
			cite = true;
			champ = '';
			index += 1;
			continue;
		}
		if (caractere === separateur) {
			champs.push(champ.trim());
			champ = '';
			index += 1;
			continue;
		}
		if (caractere === '\r' || caractere === '\n') {
			champs.push(champ.trim());
			champ = '';
			// Une ligne entièrement vide n'est pas un enregistrement.
			if (champs.some((valeur) => valeur.length > 0)) lignes.push(champs);
			champs = [];
			index += caractere === '\r' && source[index + 1] === '\n' ? 2 : 1;
			continue;
		}
		champ += caractere;
		index += 1;
	}
	champs.push(champ.trim());
	if (champs.some((valeur) => valeur.length > 0)) lignes.push(champs);
	return lignes;
}

/** Le séparateur le plus fréquent de la première ligne, compté **hors** guillemets. */
function devinerSeparateur(source: string): string {
	const premiere = source.split(/\r?\n/, 1)[0] ?? '';
	let meilleur = ',';
	let compte = -1;
	for (const candidat of SEPARATEURS) {
		let vu = 0;
		let cite = false;
		for (const caractere of premiere) {
			if (caractere === '"') cite = !cite;
			else if (!cite && caractere === candidat) vu += 1;
		}
		if (vu > compte) {
			compte = vu;
			meilleur = candidat;
		}
	}
	return meilleur;
}

/** Les noms de colonnes reconnus, en minuscules et sans accent. La date d'abord. */
const COLONNES: Record<string, readonly string[]> = {
	date: ['date', 'jour', 'day', 'tag'],
	fajr: ['fajr', 'fadjr', 'sobh', 'subh', 'fadjer', 'imsak'],
	dhuhr: ['dhuhr', 'duhr', 'zuhr', 'dohr', 'dhohr', 'midi'],
	asr: ['asr', 'assr', 'aser'],
	maghrib: ['maghrib', 'maghreb', 'magrib', 'coucher'],
	isha: ['isha', 'icha', 'ishaa', 'ichaa', 'isya'],
	// Reconnue pour être **ignorée** : l'export de Mawaqit la contient, notre table n'en a pas.
	shuruq: ['shuruq', 'chourouk', 'sunrise', 'lever', 'shourouq']
};

function sansAccent(valeur: string): string {
	return valeur.normalize('NFD').replaceAll(/[̀-ͯ]/g, '').trim().toLowerCase();
}

/** `19:23`, `9:23`, `19:23:00`, `19h23`, `7:23 PM`. Rien d'autre. */
export function lireHeure(valeur: string): LocalTime | null {
	const propre = sansAccent(valeur).replace(/\s+/g, ' ');
	if (propre === '' || propre === '-' || propre === '--' || propre === 'n/a') return null;

	const ampm = /^(\d{1,2})[:h.](\d{2})(?::(\d{2}))?\s*(am|pm)$/.exec(propre);
	if (ampm) {
		if (ampm[3] !== undefined && ampm[3] !== '00') return null;
		const brut = Number(ampm[1]);
		if (brut < 1 || brut > 12) return null;
		const heure = ampm[4] === 'am' ? (brut === 12 ? 0 : brut) : brut === 12 ? 12 : brut + 12;
		return `${String(heure).padStart(2, '0')}:${ampm[2]}` as LocalTime;
	}
	const simple = /^(\d{1,2})\s?[:h.]\s?(\d{2})(?::(\d{2}))?$/.exec(propre);
	if (!simple) return null;
	// `19:23:30` est refusé et non arrondi : la base n'accepte pas de secondes, et accepter ici
	// ferait échouer l'écriture plus tard, en 500, après avoir dit au responsable que tout allait.
	if (simple[3] !== undefined && simple[3] !== '00') return null;
	const heure = Number(simple[1]);
	const minute = Number(simple[2]);
	if (heure > 23 || minute > 59) return null;
	return `${String(heure).padStart(2, '0')}:${String(minute).padStart(2, '0')}` as LocalTime;
}

function minutes(heure: LocalTime): number {
	const [h, m] = heure.split(':').map(Number);
	return (h as number) * 60 + (m as number);
}

/** Comment une colonne de dates doit être lue. `auto` laisse le lecteur trancher sur la colonne. */
export type OrdreDeDate = 'auto' | 'iso' | 'jour-mois' | 'mois-jour';

interface DateBrute {
	a: number;
	b: number;
	annee: number;
	iso: boolean;
}

/** Les trois écritures rencontrées : `2026-09-21`, `21/09/2026`, `21.09.2026`. */
function decomposerDate(valeur: string, anneeParDefaut: number | undefined): DateBrute | null {
	const propre = valeur.trim();
	const iso = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(propre);
	if (iso) {
		return { a: Number(iso[2]), b: Number(iso[3]), annee: Number(iso[1]), iso: true };
	}
	const avecAnnee = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})$/.exec(propre);
	if (avecAnnee) {
		const annee = Number(avecAnnee[3]);
		return {
			a: Number(avecAnnee[1]),
			b: Number(avecAnnee[2]),
			annee: annee < 100 ? 2000 + annee : annee,
			iso: false
		};
	}
	// Un fichier mensuel de Mawaqit n'a qu'un quantième : l'année et le mois viennent de l'écran.
	const seul = /^(\d{1,2})$/.exec(propre);
	if (seul && anneeParDefaut !== undefined) {
		return { a: 0, b: Number(seul[1]), annee: anneeParDefaut, iso: false };
	}
	return null;
}

function composer(annee: number, mois: number, jour: number): IsoDate | null {
	if (mois < 1 || mois > 12 || jour < 1 || jour > 31) return null;
	const candidat = `${String(annee).padStart(4, '0')}-${String(mois).padStart(2, '0')}-${String(jour).padStart(2, '0')}`;
	// `parseIsoDate` refuse le 30 février et le 31 avril : c'est le seul contrôle de calendrier dont
	// on a besoin, et il est déjà écrit.
	return parseIsoDate(candidat) ? (candidat as IsoDate) : null;
}

export interface LigneRefusee {
	/** Le numéro de la ligne dans le fichier, en-tête comprise : c'est ce que le responsable voit. */
	ligne: number;
	raison: string;
}

export interface Avertissement {
	ligne: number;
	message: string;
}

export interface CalendrierLu {
	jours: PrayerDay[];
	refusees: LigneRefusee[];
	avertissements: Avertissement[];
	/** Les dates absentes entre la première et la dernière : un calendrier troué se voit. */
	manquants: IsoDate[];
	premiere: IsoDate | null;
	derniere: IsoDate | null;
	/** Le séparateur retenu, affiché dans l'aperçu : une détection muette est une détection fausse. */
	separateur: string;
	/** Vrai quand la colonne de dates est ambiguë et qu'il faut demander à l'écran. */
	ordreAmbigu: boolean;
}

export interface OptionsDeLecture {
	/** Pour un fichier mensuel sans année ni mois : ce que le responsable a déclaré à l'écran. */
	annee?: number;
	mois?: number;
	ordre?: OrdreDeDate;
}

/**
 * L'écart maximal admis d'un jour au suivant, par prière et en minutes.
 *
 * Mesuré à 47° N sur l'année 2026 : le maximum réel est de trois minutes (Fajr, le 22 avril), et la
 * médiane de deux. Six minutes est donc le double du pire cas observé — un seuil calculé, pas un
 * chiffre rond. Les deux jours de changement d'heure décalent l'heure **affichée** d'une heure
 * pleine : ils sont traités à part, sans quoi le lecteur crierait deux fois par an, précisément les
 * jours où les responsables regardent leurs horaires.
 */
export const DERIVE_MAXIMALE = 6;

const PRIERES = ['fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

/**
 * Lit un calendrier complet. **Rien n'est écrit ici** : la fonction rend ce qu'elle a compris, et
 * c'est l'écran qui décide de confirmer.
 */
export function analyserCalendrier(texte: string, options: OptionsDeLecture = {}): CalendrierLu {
	const separateur = devinerSeparateur(texte.replace(/^\uFEFF/, ''));
	const lignes = lireCsv(texte, separateur);
	const vide: CalendrierLu = {
		jours: [],
		refusees: [],
		avertissements: [],
		manquants: [],
		premiere: null,
		derniere: null,
		separateur,
		ordreAmbigu: false
	};
	if (lignes.length === 0) {
		return { ...vide, refusees: [{ ligne: 1, raison: 'Le fichier est vide.' }] };
	}

	// La ligne `sep=;` d'Excel n'est pas du CSV : c'est une convention de Microsoft, on la saute.
	let depart = 0;
	if ((lignes[0]?.[0] ?? '').toLowerCase().startsWith('sep=')) depart = 1;

	const entete = lignes[depart] ?? [];
	const colonnes = reconnaitreEntete(entete);
	if (!colonnes) {
		return {
			...vide,
			refusees: [
				{
					ligne: depart + 1,
					raison:
						'La première ligne doit nommer les colonnes : date, fajr, dhuhr, asr, maghrib, isha.'
				}
			]
		};
	}

	const corps = lignes.slice(depart + 1);
	const refusees: LigneRefusee[] = [];
	const avertissements: Avertissement[] = [];
	const brutes: { ligne: number; date: DateBrute; heures: Record<string, LocalTime> }[] = [];

	for (const [position, champs] of corps.entries()) {
		const numero = depart + 2 + position;
		const brutDate = champs[colonnes['date'] as number] ?? '';
		const brute = decomposerDate(brutDate, options.annee);
		if (!brute) {
			refusees.push({ ligne: numero, raison: `Date illisible : « ${brutDate} ».` });
			continue;
		}
		const heures: Record<string, LocalTime> = {};
		let refusee = false;
		for (const priere of PRIERES) {
			const brutHeure = champs[colonnes[priere] as number] ?? '';
			const heure = lireHeure(brutHeure);
			if (!heure) {
				refusees.push({
					ligne: numero,
					raison: `Heure illisible pour ${priere} : « ${brutHeure} ».`
				});
				refusee = true;
				break;
			}
			heures[priere] = heure;
		}
		if (!refusee) brutes.push({ ligne: numero, date: brute, heures });
	}

	const { dates, ambigu } = resoudreDates(brutes, options);
	const jours: PrayerDay[] = [];
	for (const [position, brute] of brutes.entries()) {
		const date = dates[position];
		if (!date) {
			refusees.push({ ligne: brute.ligne, raison: 'Cette date n’existe pas dans le calendrier.' });
			continue;
		}
		const ordre = verifierOrdre(brute.heures as Record<(typeof PRIERES)[number], LocalTime>);
		if (ordre) {
			refusees.push({ ligne: brute.ligne, raison: ordre });
			continue;
		}
		jours.push({
			date,
			fajr: brute.heures['fajr'] as LocalTime,
			dhuhr: brute.heures['dhuhr'] as LocalTime,
			asr: brute.heures['asr'] as LocalTime,
			maghrib: brute.heures['maghrib'] as LocalTime,
			isha: brute.heures['isha'] as LocalTime
		});
	}

	const parDate = new Map<string, PrayerDay>();
	for (const [position, jour] of jours.entries()) {
		if (parDate.has(jour.date)) {
			refusees.push({
				ligne: brutes[position]?.ligne ?? 0,
				raison: `La date ${jour.date} apparaît deux fois.`
			});
			continue;
		}
		parDate.set(jour.date, jour);
	}
	const retenus = [...parDate.values()].sort((a, b) => (a.date < b.date ? -1 : 1));

	avertissements.push(...verifierDerive(retenus));

	const premiere = retenus[0]?.date ?? null;
	const derniere = retenus.at(-1)?.date ?? null;
	const manquants: IsoDate[] = [];
	if (premiere && derniere) {
		for (let jour = isoDateToDays(premiere); jour <= isoDateToDays(derniere); jour += 1) {
			const date = addDays(premiere, jour - isoDateToDays(premiere));
			if (!parDate.has(date)) manquants.push(date);
		}
	}

	return {
		jours: retenus,
		refusees: refusees.sort((a, b) => a.ligne - b.ligne),
		avertissements,
		manquants,
		premiere,
		derniere,
		separateur,
		ordreAmbigu: ambigu
	};
}

function reconnaitreEntete(entete: readonly string[]): Record<string, number> | null {
	const trouve: Record<string, number> = {};
	for (const [index, brut] of entete.entries()) {
		const nom = sansAccent(brut);
		for (const [cle, synonymes] of Object.entries(COLONNES)) {
			if (synonymes.includes(nom) && trouve[cle] === undefined) trouve[cle] = index;
		}
	}
	for (const attendue of ['date', ...PRIERES]) {
		if (trouve[attendue] === undefined) return null;
	}
	return trouve;
}

/**
 * Tranche l'ordre jour/mois **pour toute la colonne**, jamais ligne par ligne.
 *
 * Sur une année, cent quarante-quatre dates se lisent des deux façons et cent trente-deux désignent
 * alors un autre jour : une décision prise date par date serait indéfendable. On essaie donc les
 * deux lectures sur la colonne entière et l'on n'en retient une que si elle seule donne des dates
 * valides, distinctes et croissantes. Si les deux tiennent — un fichier mensuel de douze lignes —
 * on ne devine pas : `ordreAmbigu` le dit, et l'écran demande.
 */
function resoudreDates(
	brutes: readonly { date: DateBrute }[],
	options: OptionsDeLecture
): { dates: (IsoDate | null)[]; ambigu: boolean } {
	if (brutes.length === 0) return { dates: [], ambigu: false };
	if (brutes[0]?.date.iso) {
		return { dates: brutes.map(({ date }) => composer(date.annee, date.a, date.b)), ambigu: false };
	}
	// Un fichier mensuel : le quantième seul, le mois vient de l'écran.
	if (brutes[0]?.date.a === 0) {
		const mois = options.mois;
		if (!mois) return { dates: brutes.map(() => null), ambigu: true };
		return { dates: brutes.map(({ date }) => composer(date.annee, mois, date.b)), ambigu: false };
	}

	const jourMois = brutes.map(({ date }) => composer(date.annee, date.b, date.a));
	const moisJour = brutes.map(({ date }) => composer(date.annee, date.a, date.b));
	const bonJourMois = estUneSuite(jourMois);
	const bonMoisJour = estUneSuite(moisJour);
	if (options.ordre === 'jour-mois') return { dates: jourMois, ambigu: false };
	if (options.ordre === 'mois-jour') return { dates: moisJour, ambigu: false };
	if (bonJourMois && !bonMoisJour) return { dates: jourMois, ambigu: false };
	if (bonMoisJour && !bonJourMois) return { dates: moisJour, ambigu: false };
	// Les deux tiennent, ou aucune : on ne devine pas.
	return { dates: brutes.map(() => null), ambigu: true };
}

/** Des dates toutes valides, distinctes et strictement croissantes. */
function estUneSuite(dates: readonly (IsoDate | null)[]): boolean {
	if (dates.some((date) => date === null)) return false;
	for (let index = 1; index < dates.length; index += 1) {
		if ((dates[index] as IsoDate) <= (dates[index - 1] as IsoDate)) return false;
	}
	return true;
}

/**
 * L'ordre des cinq prières, **modulo vingt-quatre heures**.
 *
 * Fajr, Dhuhr, Asr et Maghrib se suivent toujours. L'Isha, elle, passe minuit vingt-huit jours par
 * an à 47° N : refuser ce cas rejetterait un vrai calendrier. On autorise donc le franchissement,
 * et on le borne à deux heures du matin — assez pour laisser passer l'été, assez pour attraper une
 * faute de frappe.
 */
function verifierOrdre(heures: Record<(typeof PRIERES)[number], LocalTime>): string | null {
	const suite = ['fajr', 'dhuhr', 'asr', 'maghrib'] as const;
	for (let index = 1; index < suite.length; index += 1) {
		const avant = suite[index - 1] as (typeof suite)[number];
		const apres = suite[index] as (typeof suite)[number];
		if (minutes(heures[apres]) <= minutes(heures[avant])) {
			return `${apres} (${heures[apres]}) ne peut pas précéder ${avant} (${heures[avant]}).`;
		}
	}
	const isha = minutes(heures.isha);
	const maghrib = minutes(heures.maghrib);
	if (isha > maghrib) return null;
	// Après minuit : légitime en été, mais pas à n'importe quelle heure.
	if (isha < 120) return null;
	return `isha (${heures.isha}) tombe avant maghrib (${heures.maghrib}) sans passer minuit.`;
}

/**
 * Les sauts suspects d'un jour au suivant. Signalés, jamais refusés : un calendrier réel peut
 * porter une correction volontaire, et un lecteur qui refuse ce qu'il ne comprend pas est un
 * lecteur qu'on contourne.
 *
 * Le changement d'heure est traité **pour la journée entière, pas prière par prière**. Un 29 mars
 * décale les cinq heures affichées d'une heure pleine, dans le même sens ; une seule prière qui
 * saute de soixante minutes est une faute de frappe, et doit être signalée. Tolérer les soixante
 * minutes par prière laisserait passer exactement l'erreur la plus facile à commettre.
 */
function verifierDerive(jours: readonly PrayerDay[]): Avertissement[] {
	const avertissements: Avertissement[] = [];
	for (let index = 1; index < jours.length; index += 1) {
		const veille = jours[index - 1] as PrayerDay;
		const jour = jours[index] as PrayerDay;
		// Deux jours qui ne se suivent pas ne se comparent pas.
		if (isoDateToDays(jour.date) - isoDateToDays(veille.date) !== 1) continue;

		const ecarts = PRIERES.map((priere) => minutes(jour[priere]) - minutes(veille[priere]));
		// L'Isha qui bascule sous minuit fait un écart apparent de presque vingt-quatre heures : il
		// ne dit rien de la dérive, et il ne doit pas non plus masquer un changement d'heure.
		const sansBascule = ecarts.filter((ecart) => Math.abs(ecart) < 1200);
		const changementDHeure =
			sansBascule.length >= 4 &&
			(sansBascule.every((ecart) => Math.abs(ecart - 60) <= DERIVE_MAXIMALE) ||
				sansBascule.every((ecart) => Math.abs(ecart + 60) <= DERIVE_MAXIMALE));
		if (changementDHeure) continue;

		for (const [rang, priere] of PRIERES.entries()) {
			const ecart = Math.abs(ecarts[rang] as number);
			if (ecart > 1200) continue;
			if (ecart <= DERIVE_MAXIMALE) continue;
			avertissements.push({
				ligne: 0,
				message: `${jour.date} : ${priere} saute de ${ecart} minutes par rapport à la veille (${veille[priere]} puis ${jour[priere]}).`
			});
		}
	}
	return avertissements;
}
