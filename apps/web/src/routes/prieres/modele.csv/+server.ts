// Le modèle CSV à corriger dans un tableur, puis à renvoyer (étape 8, partie A).
//
// C'est le chemin le plus court entre le panneau d'une mosquée et le service : elle télécharge un
// fichier déjà rempli des soixante prochains jours, corrige ce qui diffère de son panneau, et le
// renvoie par l'écran d'import. Rien à comprendre d'un format, rien à taper qui ne change pas.
//
// **Sans position, le modèle sort quand même** : l'en-tête et les soixante dates, les heures vides.
// Une mosquée qui n'a pas réglé son calcul est justement celle qui a le plus besoin d'un modèle.
//
// Le fichier produit est relu par notre propre lecteur dans les tests, et il doit passer sans une
// seule ligne refusée ni un seul avertissement : un modèle que notre importateur refuserait serait
// pire que pas de modèle.

import { addDays, todayInZone } from '@jadwal/core';
import { computePrayerDay } from '@jadwal/core/prayer';
import { withSessionOrg } from '$lib/server/context.js';
import { mustAdminister } from '$lib/server/guard.js';
import { readReglages, versCalcul } from '$lib/server/prieres.js';
import { readSettings } from '$lib/server/programme.js';
import type { RequestHandler } from './$types.js';

/** Soixante jours : deux mois de panneau, ce qu'une mosquée corrige d'un coup. */
const JOURS = 60;

/**
 * Le séparateur est le point-virgule, et les fins de ligne sont celles de Windows.
 *
 * Ce n'est pas une préférence : c'est ce qu'Excel attend dans une installation française ou suisse,
 * et un fichier qu'Excel ouvre de travers n'est pas un modèle, c'est un piège. Notre lecteur
 * accepte de toute façon les trois séparateurs et les deux fins de ligne.
 */
const SEPARATEUR = ';';
const FIN_DE_LIGNE = '\r\n';
const COLONNES = ['date', 'fajr', 'dhuhr', 'asr', 'maghrib', 'isha'] as const;

export const GET: RequestHandler = async (event) => {
	const context = await mustAdminister(event);
	const { texte, nom } = await withSessionOrg(context, async (tx) => {
		const settings = await readSettings(tx);
		const reglages = await readReglages(tx);
		const calcul = versCalcul(reglages, settings.time_zone);
		const today = todayInZone(settings.time_zone, new Date());

		const lignes = [COLONNES.join(SEPARATEUR)];
		for (let pas = 0; pas < JOURS; pas += 1) {
			const date = addDays(today, pas);
			const jour = calcul ? computePrayerDay(date, calcul) : undefined;
			// Un jour que le calcul ne sait pas produire sort avec ses cellules vides, comme un jour
			// sans position : c'est à la mosquée de le remplir, et notre lecteur refusera la ligne
			// tant qu'elle ne l'a pas fait — ce qui est exactement ce qu'on veut lui dire.
			lignes.push(
				[
					date,
					jour?.fajr ?? '',
					jour?.dhuhr ?? '',
					jour?.asr ?? '',
					jour?.maghrib ?? '',
					jour?.isha ?? ''
				].join(SEPARATEUR)
			);
		}
		return {
			texte: lignes.join(FIN_DE_LIGNE) + FIN_DE_LIGNE,
			nom: `horaires-${settings.slug}-${today}.csv`
		};
	});

	return new Response(texte, {
		headers: {
			'content-type': 'text/csv; charset=utf-8',
			// Le nom est proposé au navigateur ; l'identifiant d'une organisation ne contient ni
			// espace ni guillemet, la valeur n'a donc pas besoin d'être échappée.
			'content-disposition': `attachment; filename="${nom}"`,
			// Un modèle dépend des réglages du moment : il ne se met jamais en cache.
			'cache-control': 'no-store'
		}
	});
};
