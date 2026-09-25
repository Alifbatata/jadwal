/**
 * Où part une archive de sauvegarde, et sous quel nom (ADR 0035, ADR 0037).
 *
 * **Le serveur n'efface plus rien sur la destination.** Qui prendrait le serveur prendrait le jeton
 * d'envoi, et un jeton qui sait effacer efface : la rétention est donc confiée au stockage, par un
 * verrou de conservation et un cycle de vie, et le serveur se contente d'écrire. Trois préfixes en
 * découlent, avec trois durées de conservation :
 *
 *     quotidien/   toutes les nuits            verrou 7 jours,   effacement à 8 jours
 *     hebdo/       le dimanche, en plus        verrou 28 jours,  effacement à 29 jours
 *     mensuel/     le 1er du mois, en plus     verrou 180 jours, effacement à 181 jours
 *
 * Ces trois durées sont le réglage du cycle de vie, pas la promesse : le stockage peut mettre un jour
 * à effacer un objet échu, et l'âge promis en tient compte, 9, 30 et 182 jours. C'est lui que la
 * tâche de nuit vérifie, avec `ages.mjs`.
 *
 * Une archive du dimanche 1er du mois part donc trois fois, sous trois préfixes : c'est trois fois
 * la place, et c'est le prix d'une rétention qu'un attaquant ne peut pas raccourcir. Les copies ne
 * sont pas des liens : un verrou porte sur un objet, pas sur un nom.
 *
 * **Le nom porte la date ET l'heure**, parce qu'un écrasement sera refusé par le verrou : deux
 * exécutions le même jour — un rattrapage après incident, un `Persistent=true` qui se déclenche au
 * démarrage — doivent produire deux objets, pas une erreur.
 *
 * **Tout est en UTC**, y compris « dimanche » et « le 1er ». C'est ce qui rend la règle vérifiable :
 * une minuterie réglée sur l'heure locale glisse de deux heures au changement d'heure, et une
 * semaine peut alors recevoir deux dimanches ou aucun. La minuterie systemd est elle aussi en UTC.
 */

/** Le nom d'objet d'une archive : `jadwal-2026-09-21T021503Z.dump.age`. */
export function nomArchive(horodatage) {
	const date = instant(horodatage);
	const p = (valeur, largeur = 2) => String(valeur).padStart(largeur, '0');
	return (
		`jadwal-${p(date.getUTCFullYear(), 4)}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}` +
		`T${p(date.getUTCHours())}${p(date.getUTCMinutes())}${p(date.getUTCSeconds())}Z.dump.age`
	);
}

/** Les préfixes sous lesquels cette archive doit partir, du plus court au plus long verrou. */
export function prefixes(horodatage) {
	const date = instant(horodatage);
	const liste = ['quotidien'];
	// getUTCDay : 0 = dimanche.
	if (date.getUTCDay() === 0) liste.push('hebdo');
	if (date.getUTCDate() === 1) liste.push('mensuel');
	return liste;
}

/** Les chemins complets, prêts à être passés à `rclone copyto`. */
export function destinations(horodatage) {
	const nom = nomArchive(horodatage);
	return prefixes(horodatage).map((prefixe) => `${prefixe}/${nom}`);
}

/** Un horodatage ISO 8601, refusé s'il est illisible : une archive sans nom sûr ne part pas. */
function instant(horodatage) {
	const date = new Date(horodatage);
	if (Number.isNaN(date.getTime())) {
		throw new TypeError(`Horodatage illisible : ${String(horodatage)}`);
	}
	return date;
}

// Appelé par `jadwal-sauvegarde.sh` : un chemin par ligne, le premier étant toujours `quotidien/`.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
	const horodatage = process.argv[2];
	if (!horodatage) {
		process.stderr.write('usage : node destinations.mjs <horodatage ISO 8601 UTC>\n');
		process.exit(2);
	}
	process.stdout.write(`${destinations(horodatage).join('\n')}\n`);
}
