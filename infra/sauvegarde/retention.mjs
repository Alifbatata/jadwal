/**
 * Quelles archives garde-t-on **sur le disque du serveur** ? (ADR 0035, ADR 0037)
 *
 * Sept quotidiennes, quatre hebdomadaires, cinq mensuelles. La règle est ici, en Node, et non plus
 * dans le script qui efface : elle décide, il exécute. Elle a passé une nuit en bash, et ce bash
 * imprimait chaque date sans fin de ligne — quatorze dates collées en une seule chaîne, `date` qui
 * répondait « invalid date », et une règle qui ne gardait plus **rien**. Le script appelant aurait
 * effacé toutes les archives locales dès la première nuit. Un défaut de ce genre ne se voit pas à la
 * relecture ; il se voit quand on peut le faire tomber dans un test.
 *
 * **Elle ne vaut que pour le disque local.** Depuis l'ADR 0037, le serveur n'efface plus rien à
 * distance : la rétention des archives envoyées est tenue par le stockage, verrou de conservation et
 * cycle de vie, hors d'atteinte de qui aurait pris ce serveur.
 *
 * Le classement se fait sur la **date du nom**, jamais sur la date du fichier : une archive
 * rapatriée depuis le stockage garde son rang. Les noms portent une heure depuis l'ADR 0037
 * (`jadwal-2026-09-21T021503Z.dump.age`) ; les anciens, sans heure, restent lisibles, et deux
 * archives d'un même jour se gardent ou se jettent ensemble.
 */

/**
 * Ce qu'on garde, par défaut. Chaque nombre compte des **jours**, pas des fichiers.
 *
 * Cinq mensuelles et non six : les conditions d'utilisation promettent qu'une donnée effacée ne
 * reste pas plus de 182 jours dans une sauvegarde. Deux premiers du mois éloignés de six mois
 * peuvent être séparés de 184 jours (du 1er mars au 1er septembre) ; avec cinq, une archive reste au
 * plus 153 jours sur ce disque. Un test le rejoue sur huit ans de vraies nuits, contre une borne de
 * 181 : ce disque n'a pas le jour de retard du stockage distant.
 */
export const RETENTION = { quotidiennes: 7, hebdomadaires: 4, mensuelles: 5 };

/** Le jour d'une archive, d'après son seul nom. `jadwal-2026-09-21T021503Z.dump.age` → 2026-09-21. */
export function jourDe(nom) {
	const reste = nom.replace(/^jadwal-/, '').split('.')[0] ?? '';
	const jour = reste.split('T')[0] ?? '';
	return /^\d{4}-\d{2}-\d{2}$/.test(jour) ? jour : null;
}

/**
 * Le jour de la semaine, en ISO : 1 = lundi … 7 = dimanche. Calculé sans `Date`, pour que la règle
 * ne dépende ni du fuseau de la machine ni de son horloge — deux choses qu'un serveur change sans
 * prévenir.
 */
function jourDeSemaine(jour) {
	const [annee, mois, date] = jour.split('-').map(Number);
	// Sakamoto : compact, exact depuis 1753, et vérifiable à la main sur une date connue.
	const decalages = [0, 3, 2, 5, 0, 3, 5, 1, 4, 6, 2, 4];
	const a = mois < 3 ? annee - 1 : annee;
	const dimancheZero =
		(a +
			Math.floor(a / 4) -
			Math.floor(a / 100) +
			Math.floor(a / 400) +
			decalages[mois - 1] +
			date) %
		7;
	return dimancheZero === 0 ? 7 : dimancheZero;
}

/**
 * Les noms à garder, dans l'ordre où ils ont été donnés.
 *
 * Rend **toujours** un sous-ensemble de ce qu'on lui passe : un nom qu'elle ne sait pas dater est
 * gardé, pas jeté. Une règle de rétention qui se trompe doit se tromper du côté qui ne perd rien.
 */
export function aGarder(noms, retention = RETENTION) {
	const inconnus = noms.filter((nom) => jourDe(nom) === null);
	const dates = noms.map(jourDe).filter((jour) => jour !== null);
	if (dates.length === 0) return inconnus;

	// Les jours représentés, du plus récent au plus ancien. Une date ISO se trie comme une chaîne.
	const jours = [...new Set(dates)].sort().reverse();

	// Trois comptes séparés, et c'est voulu : un dimanche déjà retenu comme quotidienne consomme
	// quand même une hebdomadaire. Autrement, une semaine où l'on sauvegarde tous les jours ferait
	// remonter la rétention hebdomadaire bien plus loin dans le passé que les quatre annoncées.
	const gardes = new Set(jours.slice(0, retention.quotidiennes));
	let hebdomadaires = 0;
	for (const jour of jours) {
		if (hebdomadaires >= retention.hebdomadaires) break;
		if (jourDeSemaine(jour) !== 7) continue;
		gardes.add(jour);
		hebdomadaires += 1;
	}
	let mensuelles = 0;
	for (const jour of jours) {
		if (mensuelles >= retention.mensuelles) break;
		if (!jour.endsWith('-01')) continue;
		gardes.add(jour);
		mensuelles += 1;
	}

	return noms.filter((nom) => {
		const jour = jourDe(nom);
		return jour === null || gardes.has(jour);
	});
}

// Appelé par `jadwal-retention.sh` : les noms arrivent sur l'entrée standard, un par ligne, et
// ressortent filtrés sur la sortie standard. Rien n'est effacé ici — c'est le script qui efface.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
	const entree = await new Promise((resolve) => {
		let texte = '';
		process.stdin.setEncoding('utf8');
		process.stdin.on('data', (morceau) => (texte += morceau));
		process.stdin.on('end', () => resolve(texte));
	});
	const noms = entree.split('\n').filter(Boolean);
	const sortie = aGarder(noms);
	process.stdout.write(sortie.length === 0 ? '' : `${sortie.join('\n')}\n`);
}
