// Les heures de prière : réglages, aperçu, import (ADR 0004).
//
// Réservé aux responsables, comme les réglages. Trois gestes, et le second ne s'écrit jamais tout
// seul : on regarde un aperçu, on décide, puis on confirme.
//
// **L'aperçu ne stocke rien côté serveur.** Le fichier repart au navigateur dans un champ caché,
// sous la forme normalisée qu'on vient d'en lire — pas le fichier d'origine. Il n'y a donc ni
// table temporaire à purger, ni état de session à faire expirer, et rien ne survit à un responsable
// qui ferme son onglet en cours de route.

import { fail } from '@sveltejs/kit';
import { addDays, todayInZone, type IsoDate, type PrayerDay } from '@jadwal/core';
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
import { withSessionOrg } from '$lib/server/context.js';
import { mustAdministerPrayerModule } from '$lib/server/guard.js';
import {
	apercu,
	effacerImport,
	dupliquerPeriode,
	enregistrerPeriode,
	enregistrerReglages,
	etatDesSources,
	importerJours,
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

export const load: PageServerLoad = async (event) => {
	const context = await mustAdministerPrayerModule(event);
	return withSessionOrg(context, async (tx) => {
		const settings = await readSettings(tx);
		const reglages = await readReglages(tx);
		const today = todayInZone(settings.time_zone, new Date());
		const calcul = versCalcul(reglages, settings.time_zone);
		return {
			organisation: { name: settings.name, timeZone: settings.time_zone },
			reglages,
			methodes: CALCULATION_METHODS,
			ecoles: MADHABS,
			regles: HIGH_LATITUDE_RULES,
			recommandee:
				reglages.latitude === null ? null : recommendedHighLatitudeRule(reglages.latitude),
			apercu: calcul ? apercu(calcul, today) : [],
			// Les périodes saisies à la main, et les sept prochains jours **tels qu'ils seront
			// servis** — les trois sources résolues, avec la provenance de chaque heure. C'est ce
			// qui permet à une organisation qui mélange les sources de voir laquelle a gagné,
			// sans avoir à le déduire (ADR 0004, étape 8).
			periodes: await readPeriodes(tx),
			// Les sessions du vendredi : ce jour-là, ce sont elles qui tiennent lieu de Dhuhr, et le
			// tableau ci-dessous doit le dire plutôt que d'afficher une heure que personne ne suit
			// (ADR 0033).
			vendredi: sessionsDuVendredi(await readCourses(tx, ['draft', 'published'], ['jumua'])).map(
				(session) => ({ jumuaOrder: session.jumuaOrder, start: session.start as string })
			),
			septJours: await readPrayerDays(tx, context.organizationId, today, addDays(today, 6)),
			prieres: PRIERES,
			etat: await etatDesSources(tx, context.organizationId, reglages, today),
			tailleMaximale: TAILLE_MAXIMALE,
			today
		};
	});
};

export const actions: Actions = {
	/** Calculer les sept prochains jours avec ce que le formulaire porte, sans rien enregistrer. */
	apercu: async (event) => {
		const context = await mustAdministerPrayerModule(event);
		const form = await event.request.formData();
		const latitude = position(form.get('latitude'));
		const longitude = position(form.get('longitude'));
		if (latitude === null || longitude === null) {
			return fail(400, { erreur: 'Donnez une latitude et une longitude pour voir un aperçu.' });
		}
		if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
			return fail(400, { erreur: 'La position s’écrit en degrés décimaux, par exemple 47.1368.' });
		}
		const methode = String(form.get('method') ?? '');
		const ecole = String(form.get('madhab') ?? '');
		const regle = String(form.get('highLatitudeRule') ?? '');
		const settings = await withSessionOrg(context, (tx) => readSettings(tx));
		const jours = apercu(
			{
				latitude,
				longitude,
				timeZone: settings.time_zone,
				method: isCalculationMethod(methode) ? methode : 'MuslimWorldLeague',
				madhab: isMadhab(ecole) ? ecole : 'shafi',
				highLatitudeRule: isHighLatitudeRule(regle) ? regle : recommendedHighLatitudeRule(latitude),
				adjustments: {
					fajr: decalage(form.get('fajrAdjustment')),
					dhuhr: decalage(form.get('dhuhrAdjustment')),
					asr: decalage(form.get('asrAdjustment')),
					maghrib: decalage(form.get('maghribAdjustment')),
					isha: decalage(form.get('ishaAdjustment'))
				}
			},
			todayInZone(settings.time_zone, new Date())
		);
		// Rien n'est écrit : c'est un aperçu, et il le reste tant que personne n'a cliqué Enregistrer.
		return { apercuCalcule: jours };
	},

	enregistrer: async (event) => {
		const context = await mustAdministerPrayerModule(event);
		const form = await event.request.formData();
		const latitude = position(form.get('latitude'));
		const longitude = position(form.get('longitude'));
		if (Number.isNaN(latitude) || Number.isNaN(longitude)) {
			return fail(400, { erreur: 'La position s’écrit en degrés décimaux, par exemple 47.1368.' });
		}
		if ((latitude === null) !== (longitude === null)) {
			return fail(400, { erreur: 'Donnez les deux valeurs, ou aucune des deux.' });
		}
		if (latitude !== null && (Math.abs(latitude) > 90 || Math.abs(longitude as number) > 180)) {
			return fail(400, { erreur: 'Cette position n’est pas sur Terre.' });
		}
		const methode = String(form.get('method') ?? '');
		const ecole = String(form.get('madhab') ?? '');
		const regle = String(form.get('highLatitudeRule') ?? '');
		const source = String(form.get('source') ?? 'import') === 'computed' ? 'computed' : 'import';

		const ecrites = await withSessionOrg(context, async (tx) => {
			const settings = await readSettings(tx);
			const avant = await readReglages(tx);
			return enregistrerReglages(
				tx,
				{ organizationId: context.organizationId, userId: context.userId },
				settings.time_zone,
				avant,
				{
					latitude,
					longitude,
					method: isCalculationMethod(methode) ? methode : 'MuslimWorldLeague',
					madhab: isMadhab(ecole) ? ecole : 'shafi',
					highLatitudeRule: isHighLatitudeRule(regle)
						? regle
						: recommendedHighLatitudeRule(latitude ?? 0),
					source,
					adjustments: {
						fajr: decalage(form.get('fajrAdjustment')),
						dhuhr: decalage(form.get('dhuhrAdjustment')),
						asr: decalage(form.get('asrAdjustment')),
						maghrib: decalage(form.get('maghribAdjustment')),
						isha: decalage(form.get('ishaAdjustment'))
					}
				},
				new Date()
			);
		});
		return { enregistre: true, ecrites };
	},

	/** Lire le fichier et montrer ce qu'on en a compris. **Rien n'est écrit.** */
	lireFichier: async (event) => {
		await mustAdministerPrayerModule(event);
		let form: FormData;
		try {
			form = await event.request.formData();
		} catch (cause) {
			// adapter-node lève ici, et non à la lecture de la requête : sans ce filet, le
			// responsable verrait la page d'erreur de SvelteKit, en anglais.
			if ((cause as { status?: number }).status === 413) {
				return fail(413, {
					erreur: `Ce fichier dépasse la taille acceptée (${TAILLE_MAXIMALE}). Un calendrier d’un an en fait environ vingt fois moins : vérifiez que c’est bien un CSV.`
				});
			}
			throw cause;
		}
		const fichier = form.get('calendrier');
		if (!(fichier instanceof File)) return fail(400, { erreur: 'Choisissez un fichier.' });
		if (fichier.name === '') return fail(400, { erreur: 'Choisissez un fichier.' });
		if (fichier.size === 0) return fail(400, { erreur: 'Ce fichier est vide.' });

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

		return {
			lecture: {
				nom: fichier.name,
				encodage,
				separateur: lu.separateur,
				jours: lu.jours.length,
				premiere: lu.premiere,
				derniere: lu.derniere,
				manquants: lu.manquants,
				refusees: lu.refusees,
				avertissements: lu.avertissements,
				ordreAmbigu: lu.ordreAmbigu,
				// Ce qui repartira à la confirmation : la forme normalisée, pas le fichier d'origine.
				aConfirmer: serialiser(lu.jours),
				extrait: lu.jours.slice(0, 5)
			}
		};
	},

	/** Écrire ce que l'aperçu a montré, et seulement cela. */
	confirmer: async (event) => {
		const context = await mustAdministerPrayerModule(event);
		const form = await event.request.formData();
		const jours = deserialiser(String(form.get('aConfirmer') ?? ''));
		if (jours.length === 0) return fail(400, { erreur: 'Il n’y a rien à enregistrer.' });
		const ecrits = await withSessionOrg(context, (tx) =>
			importerJours(tx, { organizationId: context.organizationId, userId: context.userId }, jours)
		);
		return { importe: ecrits, premiere: jours[0]?.date, derniere: jours.at(-1)?.date };
	},

	/**
	 * Enregistrer une période d'horaires : ce que l'organisation affiche sur son panneau.
	 *
	 * Le chevauchement n'est pas vérifié ici. C'est la contrainte d'exclusion de la base qui le
	 * refuse, et on attrape son code pour le dire en français : une vérification écrite en double
	 * finirait par diverger de celle qui compte.
	 */
	periode: async (event) => {
		const context = await mustAdministerPrayerModule(event);
		const form = await event.request.formData();
		const nom = String(form.get('name') ?? '').trim();
		const de = String(form.get('fromDate') ?? '');
		const a = String(form.get('toDate') ?? '');
		if (nom === '') return fail(400, { erreur: 'Donnez un nom à cette période.' });
		if (!/^\d{4}-\d{2}-\d{2}$/.test(de)) {
			return fail(400, { erreur: 'Donnez une date de début, au format AAAA-MM-JJ.' });
		}
		if (a !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(a)) {
			return fail(400, { erreur: 'La date de fin est illisible.' });
		}
		if (a !== '' && a < de) {
			return fail(400, { erreur: 'La date de fin vient avant la date de début.' });
		}

		const soleil = {} as Record<Priere, string | null>;
		const iqama = {} as Record<Priere, IqamaSaisie>;
		for (const priere of PRIERES) {
			soleil[priere] = heureOuRien(form.get(priere));
			const fixe = heureOuRien(form.get(`${priere}Iqama`));
			const decalage = decalageOuRien(form.get(`${priere}IqamaOffset`));
			if (fixe !== null && decalage !== null) {
				return fail(400, {
					erreur: `Pour ${priere}, choisissez une heure d’iqama **ou** un décalage, pas les deux.`
				});
			}
			iqama[priere] = { heure: fixe, decalage };
		}

		try {
			await withSessionOrg(context, (tx) =>
				enregistrerPeriode(
					tx,
					{ organizationId: context.organizationId, userId: context.userId },
					{
						id: String(form.get('periodeId') ?? '') || null,
						name: nom,
						fromDate: de as IsoDate,
						toDate: a === '' ? null : (a as IsoDate),
						soleil,
						iqama
					}
				)
			);
		} catch (cause) {
			if (codeSql(cause) === '23P01') {
				return fail(400, {
					erreur:
						'Cette période en chevauche une autre. Fermez d’abord celle qui la précède. Une ' +
						'période sans date de fin couvre tout ce qui vient après elle.'
				});
			}
			throw cause;
		}
		return { periodeEnregistree: true };
	},

	/**
	 * Dupliquer une période pour l'année suivante. Voir `dupliquerPeriode` : mêmes mois et mêmes
	 * jours un an plus tard, et « dates à vérifier » jusqu'à ce qu'un responsable l'enregistre.
	 */
	dupliquerPeriode: async (event) => {
		const context = await mustAdministerPrayerModule(event);
		const form = await event.request.formData();
		const id = String(form.get('periodeId') ?? '');
		try {
			const fait = await withSessionOrg(context, async (tx) => {
				const source = (await readPeriodes(tx)).find((periode) => periode.id === id);
				if (!source) return 'absente' as const;
				const copie = await dupliquerPeriode(
					tx,
					{ organizationId: context.organizationId, userId: context.userId },
					source
				);
				return copie === null ? ('sans-equivalent' as const) : ('faite' as const);
			});
			if (fait === 'absente') return fail(404, { erreur: 'Cette période n’existe plus.' });
			if (fait === 'sans-equivalent') {
				return fail(400, {
					erreur:
						'Cette période ne couvre que le 29 février, et l’année suivante n’en a pas. ' +
						'Choisissez vous-même la date qui la remplace.'
				});
			}
		} catch (cause) {
			if (codeSql(cause) === '23P01') {
				return fail(400, {
					erreur:
						'La copie chevaucherait une période existante. Une période sans date de fin couvre ' +
						'tout ce qui vient après elle : fermez-la d’abord.'
				});
			}
			throw cause;
		}
		return { periodeDupliquee: true };
	},

	supprimerPeriode: async (event) => {
		const context = await mustAdministerPrayerModule(event);
		const form = await event.request.formData();
		const id = String(form.get('periodeId') ?? '');
		const efface = await withSessionOrg(context, (tx) =>
			supprimerPeriode(tx, { organizationId: context.organizationId, userId: context.userId }, id)
		);
		if (!efface) return fail(404, { erreur: 'Cette période n’existe plus.' });
		return { periodeSupprimee: true };
	},

	/** Retirer les jours importés d'une plage : le calcul reprend aussitôt la main. */
	effacer: async (event) => {
		const context = await mustAdministerPrayerModule(event);
		const form = await event.request.formData();
		const de = String(form.get('de') ?? '');
		const a = String(form.get('a') ?? '');
		if (!/^\d{4}-\d{2}-\d{2}$/.test(de) || !/^\d{4}-\d{2}-\d{2}$/.test(a)) {
			return fail(400, { erreur: 'Donnez deux dates, au format AAAA-MM-JJ.' });
		}
		const efface = await withSessionOrg(context, (tx) =>
			effacerImport(
				tx,
				{ organizationId: context.organizationId, userId: context.userId },
				de as IsoDate,
				a as IsoDate
			)
		);
		return { efface };
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
