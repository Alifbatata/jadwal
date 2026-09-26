// Les heures de prière : réglages, aperçu, import (ADR 0004), derrière une seule question (étape 18,
// retour C1) : « D'où viennent vos heures de prière ? ». Trois réponses, calculées pour une
// localité, importées depuis un fichier, saisies à la main ; chacune n'affiche que ce qu'elle
// demande, puis l'aperçu des sept prochains jours, puis « Enregistrer ».
//
// La réponse montrée est dans l'adresse (`?source=computed`), et chaque formulaire la garde dans la
// sienne (`?source=computed&/apercu`) : SvelteKit lit le nom de l'action dans le paramètre qui
// commence par `/`, où qu'il soit. Sans elle, l'écran montre la réponse que les sept prochains jours
// donnent déjà, et rien pour une organisation qui n'a encore rien réglé.
//
// Réservé aux responsables, comme les réglages. Aucun geste ne s'écrit tout seul : on regarde un
// aperçu, on décide, puis on confirme.
//
// **Un aperçu ne stocke rien côté serveur.** Le fichier lu repart au navigateur dans un champ caché,
// sous la forme normalisée qu'on vient d'en lire, pas le fichier d'origine ; l'aperçu d'une période
// s'écrit dans une transaction qui est annulée aussitôt la lecture faite. Il n'y a donc ni table
// temporaire à purger, ni état de session à faire expirer.
//
// Les actions rendent le nom d'une erreur, jamais sa phrase : la page l'écrit dans la langue de
// l'écran (étape 18, retour D2).

import { fail } from '@sveltejs/kit';
import {
	addDays,
	compareIsoDates,
	isoDateToDays,
	todayInZone,
	type IsoDate,
	type PrayerDay
} from '@jadwal/core';
import {
	analyserCalendrier,
	CALCULATION_METHODS,
	HIGH_LATITUDE_RULES,
	isCalculationMethod,
	isHighLatitudeRule,
	isMadhab,
	MADHABS,
	recommendedHighLatitudeRule,
	type OrdreDeDate
} from '@jadwal/core/prayer';
import type { ResolvedPrayerRow } from '@jadwal/db';
import { prayersTexts } from '$lib/i18n/prayers.js';
import { withSessionOrg } from '$lib/server/context.js';
import { mustAdministerPrayerModule } from '$lib/server/guard.js';
import {
	DEFAULT_LIMIT,
	findLocality,
	findLocalityAt,
	LOCALITIES_SOURCE,
	searchLocalities,
	toChoice,
	type LocalityChoice
} from '$lib/server/localites/localities.js';
import {
	apercu,
	effacerImport,
	dupliquerPeriode,
	enregistrerPeriode,
	enregistrerReglages,
	etatDesSources,
	importerJours,
	lireRaison,
	PRIERES,
	readPeriodes,
	readReglages,
	supprimerPeriode,
	versCalcul,
	type IqamaSaisie,
	type Priere
} from '$lib/server/prieres.js';
import { readCourses, readPrayerDays, readSettings } from '$lib/server/programme.js';
import { sessionsDuVendredi } from '$lib/server/vendredi.js';
import type { Actions, PageServerLoad } from './$types.js';

/** La taille de corps qu'adapter-node accepte, pour le dire à l'écran plutôt que de la coder en dur. */
const TAILLE_MAXIMALE = process.env['BODY_SIZE_LIMIT'] ?? '512K';

/** Les trois réponses à la question, dans l'ordre où l'écran les propose. */
const REPONSES = ['computed', 'import', 'manual'] as const;
type Reponse = (typeof REPONSES)[number];

/** Ce que l'écran montre d'un fichier lu : les vingt premiers refus et avertissements suffisent. */
const LIGNES_MONTREES = 20;
/** Les jours manquants nommés un par un, avant « … ». */
const MANQUANTS_MONTRES = 8;

/**
 * La réponse que montre le résultat d'une action du calcul ou du fichier, quelle que soit l'adresse
 * d'où elle a été envoyée : un fichier lu dont l'écran n'afficherait pas le rapport serait perdu.
 * Une période, elle, se règle sous chacune des trois réponses.
 */
const CALCUL = { answer: 'computed' } as const;
const FICHIER = { answer: 'import' } as const;

function estUneReponse(valeur: unknown): valeur is Reponse {
	return (REPONSES as readonly unknown[]).includes(valeur);
}

/**
 * La réponse que les sept prochains jours donnent déjà : la source qui fournit le plus d'heures, la
 * saisie à la main d'abord à égalité, puis le fichier, comme la priorité entre elles. Sans aucune
 * heure, le calcul si une position est enregistrée, et sinon aucune réponse : la question est alors
 * posée seule.
 */
function reponseDesJours(jours: readonly ResolvedPrayerRow[], position: boolean): Reponse | null {
	const compte: Record<Reponse, number> = { manual: 0, import: 0, computed: 0 };
	for (const jour of jours) {
		for (const priere of PRIERES) {
			const source = jour[`${priere}_source`];
			if (estUneReponse(source)) compte[source] += 1;
		}
	}
	const meilleure = (['manual', 'import', 'computed'] as const).reduce((choisie, source) =>
		compte[source] > compte[choisie] ? source : choisie
	);
	if (compte[meilleure] > 0) return meilleure;
	return position ? 'computed' : null;
}

function decalage(valeur: FormDataEntryValue | null): number {
	const nombre = Number(String(valeur ?? '0'));
	if (!Number.isFinite(nombre)) return 0;
	return Math.max(-120, Math.min(120, Math.round(nombre)));
}

function position(valeur: FormDataEntryValue | null): number | null {
	const brut = String(valeur ?? '')
		.trim()
		.replace(',', '.');
	if (brut === '') return null;
	const nombre = Number(brut);
	return Number.isFinite(nombre) ? nombre : Number.NaN;
}

/** Ce que le formulaire du calcul portait, renvoyé pour qu'il se réaffiche tel quel. */
interface CalculSaisi {
	latitude: string;
	longitude: string;
	/** La localité choisie dans la liste, s'il y en a une. */
	locality: LocalityChoice | null;
	method: string;
	madhab: string;
	highLatitudeRule: string;
	adjustments: Record<Priere, number>;
}

type ErreurDePosition =
	| 'positionUnreadable'
	| 'positionHalf'
	| 'positionOffEarth'
	| 'positionAndLocality'
	| 'localityUnknown';

/** Vrai quand les deux nombres saisis sont exactement cette position. */
function memePosition(
	latitude: number | null,
	longitude: number | null,
	position: { latitude: number | null; longitude: number | null }
): boolean {
	return latitude === position.latitude && longitude === position.longitude;
}

/**
 * Le formulaire du calcul, lu. La position vient de la localité choisie quand il y en a une : le
 * serveur la relit dans la liste, et ne croit pas celle que le navigateur envoie. Sinon, elle vient
 * des deux nombres saisis « Hors de Suisse ».
 *
 * Le navigateur envoie aussi ces deux nombres avec la localité. S'ils ne sont ni vides, ni la
 * position de cette localité, ni celle qui est `enregistree`, ils ont été tapés : sans JavaScript,
 * la case d'une localité reste cochée, puisqu'on ne la décoche pas. Ils ne sont pas ignorés sans
 * rien dire : le formulaire revient tel quel, avec l'erreur qui dit quoi choisir.
 */
function lireCalcul(
	form: FormData,
	enregistree: { latitude: number | null; longitude: number | null }
): {
	saisie: CalculSaisi;
	position: { latitude: number; longitude: number } | null;
	erreur: ErreurDePosition | null;
} {
	const adjustments = Object.fromEntries(
		PRIERES.map((priere) => [priere, decalage(form.get(`${priere}Adjustment`))])
	) as Record<Priere, number>;
	const saisie: CalculSaisi = {
		latitude: String(form.get('latitude') ?? '').trim(),
		longitude: String(form.get('longitude') ?? '').trim(),
		locality: null,
		method: String(form.get('method') ?? ''),
		madhab: String(form.get('madhab') ?? ''),
		highLatitudeRule: String(form.get('highLatitudeRule') ?? ''),
		adjustments
	};

	const choisie = String(form.get('localite') ?? '').trim();
	if (choisie !== '') {
		const separateur = choisie.indexOf('|');
		const localite =
			separateur > 0
				? findLocality(choisie.slice(0, separateur), choisie.slice(separateur + 1))
				: null;
		if (!localite) return { saisie, position: null, erreur: 'localityUnknown' };
		saisie.locality = toChoice(localite);
		const latitude = position(saisie.latitude);
		const longitude = position(saisie.longitude);
		const tapee =
			(latitude !== null || longitude !== null) &&
			!memePosition(latitude, longitude, localite) &&
			!memePosition(latitude, longitude, enregistree);
		if (tapee) return { saisie, position: null, erreur: 'positionAndLocality' };
		saisie.latitude = String(localite.latitude);
		saisie.longitude = String(localite.longitude);
		return {
			saisie,
			position: { latitude: localite.latitude, longitude: localite.longitude },
			erreur: null
		};
	}

	const latitude = position(saisie.latitude);
	const longitude = position(saisie.longitude);
	if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
		return { saisie, position: null, erreur: 'positionUnreadable' };
	}
	if ((latitude === null) !== (longitude === null)) {
		return { saisie, position: null, erreur: 'positionHalf' };
	}
	if (latitude === null || longitude === null) return { saisie, position: null, erreur: null };
	if (Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
		return { saisie, position: null, erreur: 'positionOffEarth' };
	}
	return { saisie, position: { latitude, longitude }, erreur: null };
}

export const load: PageServerLoad = async (event) => {
	const context = await mustAdministerPrayerModule(event);
	const demandee = event.url.searchParams.get('source');
	// La recherche d'une localité sans JavaScript : le formulaire de l'écran renvoie ce qui a été tapé.
	const lieu = (event.url.searchParams.get('lieu') ?? '').slice(0, 100);
	return withSessionOrg(context, async (tx) => {
		const settings = await readSettings(tx);
		const reglages = await readReglages(tx);
		const today = todayInZone(settings.time_zone, new Date());
		const calcul = versCalcul(reglages, settings.time_zone);
		// Les sept prochains jours **tels qu'ils seront servis** : les trois sources résolues, avec la
		// provenance de chaque heure (ADR 0004, étape 8).
		const septJours = await readPrayerDays(tx, context.organizationId, today, addDays(today, 6));
		const localite =
			reglages.latitude === null || reglages.longitude === null
				? null
				: findLocalityAt(reglages.latitude, reglages.longitude);
		return {
			organisation: { name: settings.name, timeZone: settings.time_zone },
			answer: estUneReponse(demandee)
				? demandee
				: reponseDesJours(septJours, reglages.latitude !== null),
			reglages,
			savedLocality: localite ? toChoice(localite) : null,
			search:
				lieu.trim() === '' ? null : { query: lieu, results: searchLocalities(lieu).map(toChoice) },
			// La source de la liste, à citer près du choix dans la langue de l'écran (swisstopo l'exige),
			// et le nombre de localités qu'une recherche rend au plus.
			localities: {
				credit: LOCALITIES_SOURCE.credit,
				version: LOCALITIES_SOURCE.version as IsoDate,
				limit: DEFAULT_LIMIT
			},
			methodes: CALCULATION_METHODS,
			ecoles: MADHABS,
			regles: HIGH_LATITUDE_RULES,
			recommandee:
				reglages.latitude === null ? null : recommendedHighLatitudeRule(reglages.latitude),
			apercu: calcul ? apercu(calcul, today) : [],
			periodes: await readPeriodes(tx),
			// Les sessions du vendredi : ce jour-là, ce sont elles qui tiennent lieu de Dhuhr, et les
			// tableaux le disent plutôt que d'afficher une heure que personne ne suit (ADR 0033).
			vendredi: sessionsDuVendredi(await readCourses(tx, ['draft', 'published'], ['jumua'])).map(
				(session) => ({ jumuaOrder: session.jumuaOrder, start: session.start as string })
			),
			septJours,
			prieres: PRIERES,
			etat: await etatDesSources(tx, context.organizationId, reglages, today),
			tailleMaximale: TAILLE_MAXIMALE,
			today
		};
	});
};

/** Ce qu'un formulaire de période portait, renvoyé pour qu'il se réaffiche tel quel. */
interface PeriodeSaisie {
	id: string | null;
	name: string;
	fromDate: string;
	toDate: string;
	soleil: Record<Priere, string | null>;
	iqama: Record<Priere, IqamaSaisie>;
}

type ErreurDePeriode =
	'periodName' | 'periodStart' | 'periodEndUnreadable' | 'periodEndBeforeStart' | 'iqamaBoth';

/** Le formulaire d'une période, lu et borné, et la première erreur qu'il porte. */
function lirePeriode(form: FormData): {
	saisie: PeriodeSaisie;
	erreur: { error: ErreurDePeriode; prayer?: Priere } | null;
} {
	const soleil = {} as Record<Priere, string | null>;
	const iqama = {} as Record<Priere, IqamaSaisie>;
	let deuxFois: Priere | null = null;
	for (const priere of PRIERES) {
		soleil[priere] = heureOuRien(form.get(priere));
		const fixe = heureOuRien(form.get(`${priere}Iqama`));
		const minutes = decalageOuRien(form.get(`${priere}IqamaOffset`));
		if (fixe !== null && minutes !== null) deuxFois ??= priere;
		iqama[priere] = { heure: fixe, decalage: minutes };
	}
	const saisie: PeriodeSaisie = {
		id: String(form.get('periodeId') ?? '') || null,
		name: String(form.get('name') ?? '').trim(),
		fromDate: String(form.get('fromDate') ?? ''),
		toDate: String(form.get('toDate') ?? ''),
		soleil,
		iqama
	};
	const { name, fromDate, toDate } = saisie;
	if (name === '') return { saisie, erreur: { error: 'periodName' } };
	if (!/^\d{4}-\d{2}-\d{2}$/.test(fromDate)) return { saisie, erreur: { error: 'periodStart' } };
	if (toDate !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
		return { saisie, erreur: { error: 'periodEndUnreadable' } };
	}
	if (toDate !== '' && toDate < fromDate) {
		return { saisie, erreur: { error: 'periodEndBeforeStart' } };
	}
	if (deuxFois) return { saisie, erreur: { error: 'iqamaBoth', prayer: deuxFois } };
	return { saisie, erreur: null };
}

/** La période telle que `enregistrerPeriode` l'attend. */
function versEnregistrement(saisie: PeriodeSaisie) {
	return {
		id: saisie.id,
		name: saisie.name,
		fromDate: saisie.fromDate as IsoDate,
		toDate: saisie.toDate === '' ? null : (saisie.toDate as IsoDate),
		soleil: saisie.soleil,
		iqama: saisie.iqama
	};
}

/**
 * Levée pour annuler la transaction de l'aperçu d'une période, une fois les jours relus avec elle :
 * c'est ce qui garantit que l'aperçu n'écrit rien, audit compris. `depuis` est le premier jour de la
 * période quand l'aperçu montre ses premiers jours plutôt que les sept prochains, et `duree` le
 * nombre de jours qu'il montre alors : sept, ou moins pour une période plus courte.
 */
class ApercuSeulement extends Error {
	constructor(
		readonly jours: ResolvedPrayerRow[],
		readonly depuis: IsoDate | null,
		readonly duree: number
	) {
		super('aperçu d’une période, transaction annulée');
	}
}

export const actions: Actions = {
	/** Calculer les sept prochains jours avec ce que le formulaire porte, sans rien enregistrer. */
	apercu: async (event) => {
		const context = await mustAdministerPrayerModule(event);
		const form = await event.request.formData();
		const { settings, reglages } = await withSessionOrg(context, async (tx) => ({
			settings: await readSettings(tx),
			reglages: await readReglages(tx)
		}));
		const { saisie, position: lue, erreur } = lireCalcul(form, reglages);
		if (erreur) return fail(400, { ...CALCUL, error: erreur, saisie });
		if (!lue) return fail(400, { ...CALCUL, error: 'positionMissing' as const, saisie });
		const jours = apercu(
			{
				latitude: lue.latitude,
				longitude: lue.longitude,
				timeZone: settings.time_zone,
				method: isCalculationMethod(saisie.method) ? saisie.method : 'MuslimWorldLeague',
				madhab: isMadhab(saisie.madhab) ? saisie.madhab : 'shafi',
				highLatitudeRule: isHighLatitudeRule(saisie.highLatitudeRule)
					? saisie.highLatitudeRule
					: recommendedHighLatitudeRule(lue.latitude),
				adjustments: saisie.adjustments
			},
			todayInZone(settings.time_zone, new Date())
		);
		// Rien n'est écrit : c'est un aperçu, et il le reste tant que personne n'a cliqué Enregistrer.
		return { ...CALCUL, apercuCalcule: jours, saisie };
	},

	enregistrer: async (event) => {
		const context = await mustAdministerPrayerModule(event);
		const form = await event.request.formData();
		const enregistree = await withSessionOrg(context, (tx) => readReglages(tx));
		const { saisie, position: lue, erreur } = lireCalcul(form, enregistree);
		if (erreur) return fail(400, { ...CALCUL, error: erreur, saisie });
		const declaree = String(form.get('source') ?? '');

		const ecrites = await withSessionOrg(context, async (tx) => {
			const settings = await readSettings(tx);
			const avant = await readReglages(tx);
			return enregistrerReglages(
				tx,
				{ organizationId: context.organizationId, userId: context.userId },
				settings.time_zone,
				avant,
				{
					latitude: lue?.latitude ?? null,
					longitude: lue?.longitude ?? null,
					method: isCalculationMethod(saisie.method) ? saisie.method : 'MuslimWorldLeague',
					madhab: isMadhab(saisie.madhab) ? saisie.madhab : 'shafi',
					highLatitudeRule: isHighLatitudeRule(saisie.highLatitudeRule)
						? saisie.highLatitudeRule
						: recommendedHighLatitudeRule(lue?.latitude ?? 0),
					// L'écran ne demande plus de « source déclarée » (retour C1) : la colonne garde sa
					// valeur, sauf pour qui l'envoie encore.
					source: declaree === 'import' || declaree === 'computed' ? declaree : avant.source,
					adjustments: saisie.adjustments
				},
				new Date()
			);
		});
		return { ...CALCUL, enregistre: true as const, ecrites };
	},

	/** Lire le fichier et montrer ce qu'on en a compris. **Rien n'est écrit.** */
	lireFichier: async (event) => {
		const context = await mustAdministerPrayerModule(event);
		let form: FormData;
		try {
			form = await event.request.formData();
		} catch (cause) {
			// adapter-node lève ici, et non à la lecture de la requête : sans ce filet, le
			// responsable verrait la page d'erreur de SvelteKit, en anglais.
			if ((cause as { status?: number }).status === 413) {
				return fail(413, { ...FICHIER, error: 'fileTooLarge' as const });
			}
			throw cause;
		}
		const fichier = form.get('calendrier');
		if (!(fichier instanceof File) || fichier.name === '') {
			return fail(400, { ...FICHIER, error: 'fileMissing' as const });
		}
		if (fichier.size === 0) return fail(400, { ...FICHIER, error: 'fileEmpty' as const });

		const octets = new Uint8Array(await fichier.arrayBuffer());
		const { texte, encodage } = decoder(octets);
		const ordre = String(form.get('ordre') ?? 'auto') as OrdreDeDate;
		const annee = Number(String(form.get('annee') ?? '')) || undefined;
		const mois = Number(String(form.get('mois') ?? '')) || undefined;
		const lu = analyserCalendrier(texte, {
			ordre,
			...(annee ? { annee } : {}),
			...(mois ? { mois } : {})
		});
		const settings = await withSessionOrg(context, (tx) => readSettings(tx));
		const today = todayInZone(settings.time_zone, new Date());
		// L'aperçu : les sept prochains jours du fichier s'il les couvre, sinon ses sept premiers.
		const aVenir = lu.jours.filter((jour) => jour.date >= today);

		return {
			...FICHIER,
			lecture: {
				nom: fichier.name,
				encodage,
				separateur: lu.separateur,
				jours: lu.jours.length,
				premiere: lu.premiere,
				derniere: lu.derniere,
				manquants: lu.manquants.slice(0, MANQUANTS_MONTRES),
				nombreDeManquants: lu.manquants.length,
				refusees: lu.refusees
					.slice(0, LIGNES_MONTREES)
					.map((refusee) => ({ ligne: refusee.ligne, raison: lireRaison(refusee.raison) })),
				nombreDeRefusees: lu.refusees.length,
				avertissements: lu.avertissements
					.slice(0, LIGNES_MONTREES)
					.map((avertissement) => lireRaison(avertissement.message)),
				nombreDAvertissements: lu.avertissements.length,
				ordreAmbigu: lu.ordreAmbigu,
				// Ce qui repartira à la confirmation : la forme normalisée, pas le fichier d'origine.
				aConfirmer: serialiser(lu.jours),
				extrait: (aVenir.length > 0 ? aVenir : lu.jours).slice(0, 7),
				extraitAVenir: aVenir.length > 0
			}
		};
	},

	/** Écrire ce que l'aperçu a montré, et seulement cela. */
	confirmer: async (event) => {
		const context = await mustAdministerPrayerModule(event);
		const form = await event.request.formData();
		const jours = deserialiser(String(form.get('aConfirmer') ?? ''));
		if (jours.length === 0) return fail(400, { ...FICHIER, error: 'nothingToSave' as const });
		const ecrits = await withSessionOrg(context, (tx) =>
			importerJours(tx, { organizationId: context.organizationId, userId: context.userId }, jours)
		);
		return { ...FICHIER, importe: ecrits, premiere: jours[0]?.date, derniere: jours.at(-1)?.date };
	},

	/**
	 * Enregistrer une période d'horaires : ce que l'organisation affiche sur son panneau.
	 *
	 * Le chevauchement n'est pas vérifié ici. C'est la contrainte d'exclusion de la base qui le
	 * refuse, et on attrape son code pour le dire dans la langue de l'écran : une vérification écrite
	 * en double finirait par diverger de celle qui compte.
	 */
	periode: async (event) => {
		const context = await mustAdministerPrayerModule(event);
		const { saisie, erreur } = lirePeriode(await event.request.formData());
		if (erreur) return fail(400, { ...erreur, periode: saisie });
		try {
			await withSessionOrg(context, (tx) =>
				enregistrerPeriode(
					tx,
					{ organizationId: context.organizationId, userId: context.userId },
					versEnregistrement(saisie)
				)
			);
		} catch (cause) {
			if (codeSql(cause) === '23P01') {
				return fail(400, { error: 'periodOverlap' as const, periode: saisie });
			}
			throw cause;
		}
		return { periodeEnregistree: true as const };
	},

	/**
	 * Les sept prochains jours tels qu'ils seraient servis avec cette période, sans l'enregistrer.
	 *
	 * La période est écrite, les jours sont relus par la même requête que partout ailleurs
	 * (`resolvedPrayerDaysQuery`, qui tient la priorité entre les trois sources), puis la transaction
	 * est annulée : l'aperçu montre exactement ce que l'enregistrement donnera, et un chevauchement
	 * y est refusé comme il le serait à l'enregistrement.
	 *
	 * Une période préparée à l'avance, qui commence après les sept prochains jours (un Ramadan dans
	 * trois mois), n'y apparaîtrait pas : l'aperçu montre alors ses sept premiers jours, et la page
	 * le dit (retour B1). Une telle période plus courte que sept jours (l'Aïd, un jour) est montrée
	 * en entier, et seulement elle : les jours qui la suivent ne sont pas les siens.
	 */
	apercuPeriode: async (event) => {
		const context = await mustAdministerPrayerModule(event);
		const { saisie, erreur } = lirePeriode(await event.request.formData());
		if (erreur) return fail(400, { ...erreur, periode: saisie });
		try {
			await withSessionOrg(context, async (tx) => {
				const settings = await readSettings(tx);
				await enregistrerPeriode(
					tx,
					{ organizationId: context.organizationId, userId: context.userId },
					versEnregistrement(saisie)
				);
				const today = todayInZone(settings.time_zone, new Date());
				const premier = saisie.fromDate as IsoDate;
				const plusTard = compareIsoDates(premier, addDays(today, 6)) > 0;
				const debut = plusTard ? premier : today;
				const septieme = addDays(debut, 6);
				const dernier = saisie.toDate === '' ? null : (saisie.toDate as IsoDate);
				const fin =
					plusTard && dernier !== null && compareIsoDates(dernier, septieme) < 0
						? dernier
						: septieme;
				throw new ApercuSeulement(
					await readPrayerDays(tx, context.organizationId, debut, fin),
					plusTard ? premier : null,
					isoDateToDays(fin) - isoDateToDays(debut) + 1
				);
			});
		} catch (cause) {
			if (cause instanceof ApercuSeulement) {
				return {
					apercuPeriode: cause.jours,
					apercuDepuis: cause.depuis,
					apercuDuree: cause.duree,
					periode: saisie
				};
			}
			if (codeSql(cause) === '23P01') {
				return fail(400, { error: 'periodOverlap' as const, periode: saisie });
			}
			throw cause;
		}
		// La transaction ne se termine jamais sans lever : cette ligne n'est pas atteinte.
		return fail(500, { error: 'nothingToSave' as const });
	},

	/**
	 * Dupliquer une période pour l'année suivante. Voir `dupliquerPeriode` : mêmes mois et mêmes
	 * jours un an plus tard, et « dates à vérifier » jusqu'à ce qu'un responsable l'enregistre. La
	 * copie est nommée dans la langue de l'écran d'où part le bouton.
	 */
	dupliquerPeriode: async (event) => {
		const context = await mustAdministerPrayerModule(event);
		const form = await event.request.formData();
		const id = String(form.get('periodeId') ?? '');
		const textes = prayersTexts[event.locals.langue ?? 'fr'];
		try {
			const fait = await withSessionOrg(context, async (tx) => {
				const source = (await readPeriodes(tx)).find((periode) => periode.id === id);
				if (!source) return 'absente' as const;
				const copie = await dupliquerPeriode(
					tx,
					{ organizationId: context.organizationId, userId: context.userId },
					source,
					textes.periods.copyName(source.name)
				);
				return copie === null ? ('sans-equivalent' as const) : ('faite' as const);
			});
			if (fait === 'absente') return fail(404, { error: 'periodGone' as const });
			if (fait === 'sans-equivalent') return fail(400, { error: 'leapDay' as const });
		} catch (cause) {
			if (codeSql(cause) === '23P01') return fail(400, { error: 'copyOverlap' as const });
			throw cause;
		}
		return { periodeDupliquee: true as const };
	},

	supprimerPeriode: async (event) => {
		const context = await mustAdministerPrayerModule(event);
		const form = await event.request.formData();
		const id = String(form.get('periodeId') ?? '');
		const efface = await withSessionOrg(context, (tx) =>
			supprimerPeriode(tx, { organizationId: context.organizationId, userId: context.userId }, id)
		);
		if (!efface) return fail(404, { error: 'periodGone' as const });
		return { periodeSupprimee: true as const };
	},

	/** Retirer les jours importés d'une plage : le calcul les remplit de nouveau à son passage. */
	effacer: async (event) => {
		const context = await mustAdministerPrayerModule(event);
		const form = await event.request.formData();
		const de = String(form.get('de') ?? '');
		const a = String(form.get('a') ?? '');
		if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(a)) {
			return fail(400, { ...FICHIER, error: 'removeDates' as const });
		}
		const efface = await withSessionOrg(context, (tx) =>
			effacerImport(
				tx,
				{ organizationId: context.organizationId, userId: context.userId },
				de as IsoDate,
				a as IsoDate
			)
		);
		return { ...FICHIER, efface };
	}
};

/** Une heure `HH:MM` saisie, ou `null` quand le champ est vide. */
function heureOuRien(valeur: FormDataEntryValue | null): string | null {
	const brut = String(valeur ?? '').trim();
	if (brut === '') return null;
	const court = brut.slice(0, 5);
	return /^\d{2}:\d{2}$/.test(court) ? court : null;
}

/** Un décalage d'iqama en minutes, borné comme la base le borne. */
function decalageOuRien(valeur: FormDataEntryValue | null): number | null {
	const brut = String(valeur ?? '').trim();
	if (brut === '') return null;
	const nombre = Number(brut);
	if (!Number.isFinite(nombre)) return null;
	return Math.max(0, Math.min(120, Math.round(nombre)));
}

/** Le code SQLSTATE d'une erreur du pilote, lu dans la cause comme ailleurs dans le dépôt. */
function codeSql(error: unknown): string | undefined {
	let current: unknown = error;
	for (let depth = 0; depth < 5 && current instanceof Error; depth += 1) {
		const code = (current as { code?: unknown }).code;
		if (typeof code === 'string') return code;
		current = (current as { cause?: unknown }).cause;
	}
	return undefined;
}

/**
 * Le texte d'un fichier, et l'encodage retenu.
 *
 * `File.text()` suppose toujours UTF-8 et remplace en silence chaque octet invalide : un fichier en
 * Windows-1252 y devient « Prière » sans qu'aucune erreur ne le dise. On décode donc en trois temps,
 * sans dépendance, et l'encodage retenu est affiché — un repli muet est un repli qu'on découvre trop
 * tard.
 */
function decoder(octets: Uint8Array): { texte: string; encodage: string } {
	if (octets[0] === 0xff && octets[1] === 0xfe) {
		return { texte: new TextDecoder('utf-16le').decode(octets), encodage: 'UTF-16' };
	}
	if (octets[0] === 0xfe && octets[1] === 0xff) {
		return { texte: new TextDecoder('utf-16be').decode(octets), encodage: 'UTF-16' };
	}
	try {
		return { texte: new TextDecoder('utf-8', { fatal: true }).decode(octets), encodage: 'UTF-8' };
	} catch {
		return {
			texte: new TextDecoder('windows-1252').decode(octets),
			encodage: 'Windows-1252'
		};
	}
}

/**
 * Un enregistrement par jour, six champs, séparés par des points-virgules : compact, lisible,
 * et sans surprise à la relecture.
 *
 * Le point-virgule plutôt que le passage à la ligne : cette chaîne voyage dans l'attribut
 * `value` d'un champ caché, et un attribut n'est pas l'endroit où l'on met des retours à la
 * ligne. La relecture accepte les deux, pour qu'un formulaire recopié à la main passe quand
 * même.
 */
function serialiser(jours: readonly PrayerDay[]): string {
	return jours
		.map(
			(jour) => `${jour.date} ${jour.fajr} ${jour.dhuhr} ${jour.asr} ${jour.maghrib} ${jour.isha}`
		)
		.join(';');
}

/**
 * Relit ce que l'aperçu a renvoyé. Tout est revérifié : ce texte a fait un aller-retour par le
 * navigateur, donc il n'est pas plus digne de confiance qu'un fichier.
 */
function deserialiser(texte: string): PrayerDay[] {
	const jours: PrayerDay[] = [];
	for (const ligne of texte.split(/[;\n]/)) {
		const champs = ligne.trim().split(/\s+/);
		if (champs.length !== 6) continue;
		const [date, fajr, dhuhr, asr, maghrib, isha] = champs as [
			string,
			string,
			string,
			string,
			string,
			string
		];
		if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) continue;
		if (![fajr, dhuhr, asr, maghrib, isha].every((heure) => /^\d{2}:\d{2}$/.test(heure))) continue;
		jours.push({
			date: date as IsoDate,
			fajr: fajr as PrayerDay['fajr'],
			dhuhr: dhuhr as PrayerDay['dhuhr'],
			asr: asr as PrayerDay['asr'],
			maghrib: maghrib as PrayerDay['maghrib'],
			isha: isha as PrayerDay['isha']
		});
	}
	return jours;
}
