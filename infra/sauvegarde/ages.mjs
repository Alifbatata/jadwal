/**
 * Aucune sauvegarde distante ne doit dépasser l'âge promis pour son préfixe (ADR 0037).
 *
 * Le serveur n'efface rien chez le stockage : c'est un cycle de vie, posé là-bas, qui efface ce qui
 * est échu. Le serveur ne peut donc pas tenir la promesse des conditions d'utilisation, « ce que vous
 * effacez reste au plus 182 jours dans ces sauvegardes ». Il peut **vérifier qu'elle est tenue**, et
 * c'est tout l'objet de cette règle : elle lit la liste des objets de la destination, telle que
 * `rclone lsjson --use-server-modtime --no-mimetype --recursive --files-only` la rend, et désigne
 * chaque objet plus vieux que l'âge promis pour son préfixe.
 *
 *     préfixe      cycle de vie chez le stockage     âge promis
 *     quotidien/   efface à 8 jours                  9 jours
 *     hebdo/       efface à 29 jours                 30 jours
 *     mensuel/     efface à 181 jours                182 jours
 *
 * **Le jour de plus est celui du stockage.** Son fournisseur efface un objet échu « en général dans
 * les 24 heures » : le cycle de vie reste réglé à 181 jours, et la promesse compte le jour qu'il peut
 * mettre à le faire. Si ce jour ne suffit pas, c'est cette règle qui le dit, la nuit même.
 *
 * **Les empreintes `.sha256` comptent comme les archives**, et l'objet d'essai du verrou aussi : tout
 * ce qui est sous un préfixe suit son cycle de vie. **Un objet hors des trois préfixes est signalé**,
 * même jeune : aucune promesse ne dit quand il part, ni même si un cycle de vie le couvre.
 *
 * **L'âge est compté depuis la date de dépôt que le stockage écrit dans la liste** (`Last-Modified`),
 * que `--use-server-modtime` fait rendre par rclone dans `ModTime`. C'est la date même d'où le
 * stockage compte l'échéance de son cycle de vie : la règle mesure ce que le cycle de vie mesure.
 * Sans cette option, rclone lirait dans les métadonnées de chaque objet, par une requête de plus, la
 * date du fichier envoyé. Or, quand cette requête échoue, rclone met **l'heure présente** à la place
 * et sort sans erreur, en 1.60.1 comme en 1.75.1, les deux versions que joue l'épreuve : un objet
 * trop vieux passerait pour neuf. `--no-mimetype` retire l'autre requête par objet, celle du type ;
 * il n'en reste aucune, et la date ne peut plus venir d'une lecture qui échoue sans rien dire.
 *
 * **Sauf si le dépôt a plus d'une heure de retard sur le nom.** La date de dépôt a un défaut : un
 * objet recopié (un changement de stockage, une copie entre seaux) repart de zéro, et le cycle de
 * vie du nouveau seau le garde encore un plein délai. Le nom que la nuit donne à ses objets porte
 * l'heure où elle a commencé, juste avant la vidange : `jadwal-2026-09-21T021503Z.dump.age`, son
 * `.sha256`, et `verrou-eprouve-2026-09-21T120000Z.txt` pour l'objet d'essai du playbook. Une
 * archive contient les données de ce moment-là, et c'est la mesure la plus juste de la promesse.
 * Quand un objet a été déposé plus d'une heure après l'heure de son nom, son âge est compté depuis
 * son nom. Moins d'une heure, c'est le temps qu'une nuit met à vider la base et à envoyer : compter
 * depuis le nom ferait alors tomber une nuit ordinaire où le stockage a pris tout son jour pour
 * effacer. Une date de nom dans le futur ou illisible, et un nom que la nuit n'écrit pas, laissent
 * la date de dépôt : le nom peut vieillir un objet, jamais le rajeunir.
 *
 * **Une liste qui ne permet pas de contrôler est une erreur, jamais un « rien à signaler ».** Entrée
 * vide, JSON illisible, date absente : la règle refuse, et la tâche échoue. Une liste sans aucun
 * objet est refusée aussi, parce que rclone la rend **sans erreur** pour un chemin qui n'existe pas
 * dans le seau (un seau qui n'existe pas fait échouer la liste elle-même, « directory not found »),
 * et que la destination ne peut pas être vide juste après un envoi. Et une liste qui ne montre pas
 * les objets que la nuit vient d'envoyer, l'archive et son empreinte sous chaque préfixe, est
 * refusée de même, comme une liste **incomplète** : elle a été lue, mais elle regarde ailleurs ou
 * elle est tronquée, et ne prouve rien sur les objets qu'elle ne montre pas. La veille a porté un
 * contrôle qui se taisait quand il n'avait rien pu lire (étape 12) ; celui-ci ne se tait pas.
 */

const JOUR = 86_400_000;
const HEURE = 3_600_000;
const MINUTE = 60_000;

/** Le cycle de vie posé chez le stockage, en jours après la date de l'objet. */
export const CYCLE_DE_VIE = Object.freeze({ quotidien: 8, hebdo: 29, mensuel: 181 });

/** Le jour que le stockage peut mettre à effacer un objet échu. */
const DELAI_DU_STOCKAGE = 1;

/** L'âge qu'un objet de chaque préfixe ne doit pas dépasser, en jours. */
export const AGE_PROMIS = Object.freeze(
	Object.fromEntries(
		Object.entries(CYCLE_DE_VIE).map(([prefixe, jours]) => [prefixe, jours + DELAI_DU_STOCKAGE])
	)
);

/**
 * Le temps qu'une nuit peut mettre entre l'heure écrite dans le nom, prise juste avant la vidange,
 * et le dépôt de son dernier objet. Passé ce délai, l'objet n'a pas été déposé par la nuit qui l'a
 * nommé.
 */
const DELAI_D_ENVOI = HEURE;

/** Une entrée qui ne permet pas de contrôler : le contrôle échoue au lieu de se taire. */
export class EntreeIllisible extends Error {
	constructor(message) {
		super(message);
		this.name = 'EntreeIllisible';
	}
}

/**
 * Une liste lue sans erreur, mais qui ne montre pas ce que la nuit vient d'envoyer. Elle ne permet
 * pas de contrôler non plus ; son nom dit seulement que rclone n'a rien signalé.
 */
export class ListeIncomplete extends EntreeIllisible {
	constructor(message) {
		super(message);
		this.name = 'ListeIncomplete';
	}
}

/**
 * Une date RFC 3339, comme rclone l'écrit, en millisecondes depuis l'époque ; `null` sinon.
 *
 * Plus stricte que `Date.parse`, qui accepte une date sans heure, une date à l'anglaise, et un
 * 30 février qu'il reporte au 2 mars. Une date qu'on lit de travers donne un âge faux, et un âge faux
 * trop jeune fait passer un objet qui devrait être signalé.
 */
function instant(texte) {
	const t =
		typeof texte === 'string'
			? /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.(\d{1,9}))?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(
					texte
				)
			: null;
	if (!t) return null;
	const [annee, mois, jour, heure, minute, seconde] = t.slice(1, 7).map(Number);
	const millisecondes = Number((t[7] ?? '').padEnd(3, '0').slice(0, 3));
	const local = Date.UTC(annee, mois - 1, jour, heure, minute, seconde, millisecondes);
	// L'aller-retour refuse ce que `Date.UTC` reporterait sans rien dire : un 30 février, une
	// 25e heure, une année à deux chiffres.
	const relu = new Date(local);
	const memes =
		relu.getUTCFullYear() === annee &&
		relu.getUTCMonth() === mois - 1 &&
		relu.getUTCDate() === jour &&
		relu.getUTCHours() === heure &&
		relu.getUTCMinutes() === minute &&
		relu.getUTCSeconds() === seconde;
	if (!memes) return null;
	const decalage = t[8]
		? (t[8] === '-' ? -1 : 1) * (Number(t[9]) * 60 + Number(t[10])) * MINUTE
		: 0;
	return local - decalage;
}

/** Les noms que la nuit et le playbook écrivent, avec l'heure qu'ils portent. */
const NOM_DATE =
	/^(?:jadwal|verrou-eprouve)-(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2})(\d{2})Z\.(?:dump\.age|dump\.age\.sha256|txt)$/;

/**
 * L'heure écrite dans le nom d'un objet, en millisecondes ; `null` pour un nom que la nuit n'écrit
 * pas, ou pour une date qui n'existe pas.
 */
function dateDuNom(chemin) {
	const t = NOM_DATE.exec(chemin.slice(chemin.lastIndexOf('/') + 1));
	return t ? instant(`${t[1]}T${t[2]}:${t[3]}:${t[4]}Z`) : null;
}

/** Les objets de la liste de rclone, dossiers retirés : `{ chemin, date }`, la date en millisecondes. */
function lireListe(texte) {
	if (typeof texte !== 'string' || texte.trim() === '') {
		throw new EntreeIllisible(
			"l'entrée est vide : rclone n'a rien écrit, la liste n'a pas été faite"
		);
	}
	let liste;
	try {
		liste = JSON.parse(texte);
	} catch (erreur) {
		throw new EntreeIllisible(`ce n'est pas du JSON (${erreur.message})`);
	}
	if (!Array.isArray(liste)) {
		throw new EntreeIllisible("rclone lsjson rend un tableau, et l'entrée n'en est pas un");
	}
	const objets = [];
	for (const [index, element] of liste.entries()) {
		const rang = `l'élément n° ${index + 1}`;
		if (element === null || typeof element !== 'object') {
			throw new EntreeIllisible(`${rang} n'est pas un objet`);
		}
		if (element.IsDir === true) continue;
		if (typeof element.Path !== 'string' || element.Path === '') {
			throw new EntreeIllisible(`${rang} n'a pas de chemin (Path)`);
		}
		const date = instant(element.ModTime);
		if (date === null) {
			throw new EntreeIllisible(
				`${element.Path} a une date illisible (ModTime : ${JSON.stringify(element.ModTime ?? null)}) ;` +
					` rclone l'écrit en RFC 3339, et la laisse vide avec --no-modtime`
			);
		}
		objets.push({ chemin: element.Path, date });
	}
	if (objets.length === 0) {
		throw new EntreeIllisible(
			"la liste ne contient aucun objet. rclone la rend vide, sans erreur, pour un chemin qui n'existe pas dans le seau ;" +
				' juste après un envoi, la destination ne peut pas être vide'
		);
	}
	return objets;
}

/**
 * La vérification : la liste de `rclone lsjson`, l'instant présent en ISO 8601, et les chemins des
 * objets que la nuit vient d'envoyer, que la liste doit montrer.
 *
 * Rend le nombre d'objets vérifiés, ceux qui sont plus vieux que l'âge promis pour leur préfixe
 * (`tropVieux`, avec leur âge en jours), et ceux qui ne sont sous aucun des trois préfixes
 * (`horsPrefixes`). Quand l'âge est compté depuis le nom, l'objet porte aussi `depot`, l'âge que
 * dit le stockage. Lève `EntreeIllisible` quand la liste ne permet pas de contrôler, et
 * `ListeIncomplete` quand il lui manque un des objets envoyés.
 *
 * La limite est comprise : un objet de 182 jours tout juste est dans la promesse, un objet de
 * 182 jours et une minute ne l'est plus.
 */
export function verifier(texte, maintenant, envoyes = []) {
	const present = instant(maintenant);
	if (present === null) {
		throw new EntreeIllisible(
			`l'instant présent est illisible : ${JSON.stringify(maintenant ?? null)}`
		);
	}
	const objets = lireListe(texte);
	const montres = new Set(objets.map(({ chemin }) => chemin));
	const manquants = envoyes.filter((chemin) => !montres.has(chemin));
	if (manquants.length > 0) {
		throw new ListeIncomplete(
			`la liste ne montre pas ce que cette nuit vient d'envoyer (${manquants.join(', ')}) :` +
				' lue sans erreur, elle regarde ailleurs, ou elle est tronquée, et ne prouve rien sur le reste'
		);
	}
	const tropVieux = [];
	const horsPrefixes = [];
	for (const { chemin, date } of objets) {
		// Le nom ne compte que s'il est plus vieux que le dépôt de plus d'une heure : il peut
		// vieillir l'objet, jamais le rajeunir, ni faire tomber une nuit ordinaire.
		const nom = dateDuNom(chemin);
		const depuisLeNom = nom !== null && nom < date - DELAI_D_ENVOI;
		const age = (present - (depuisLeNom ? nom : date)) / JOUR;
		const depot = depuisLeNom ? { depot: (present - date) / JOUR } : {};
		const coupure = chemin.indexOf('/');
		const prefixe = coupure === -1 ? '' : chemin.slice(0, coupure);
		if (!Object.hasOwn(AGE_PROMIS, prefixe)) {
			horsPrefixes.push({ chemin, age, ...depot });
		} else if (age > AGE_PROMIS[prefixe]) {
			tropVieux.push({ chemin, prefixe, age, promis: AGE_PROMIS[prefixe], ...depot });
		}
	}
	return { verifies: objets.length, tropVieux, horsPrefixes };
}

/** « 183 jours 4 h 10 min » : la minute compte, puisque la limite se tranche à la minute. */
function duree(jours) {
	const ms = Math.max(0, Math.round(jours * JOUR));
	const j = Math.floor(ms / JOUR);
	const h = Math.floor((ms % JOUR) / HEURE);
	const min = Math.floor((ms % HEURE) / MINUTE);
	return `${j} ${j > 1 ? 'jours' : 'jour'} ${h} h ${String(min).padStart(2, '0')} min`;
}

/** Ce que la tâche écrit dans son journal, et son code de sortie : 0 si tout est dans les âges. */
export function rapport({ verifies, tropVieux, horsPrefixes }) {
	const vus = `${verifies} ${verifies > 1 ? 'objets distants vérifiés' : 'objet distant vérifié'}`;
	if (tropVieux.length === 0 && horsPrefixes.length === 0) {
		const ages = Object.entries(AGE_PROMIS)
			.map(([prefixe, jours]) => `${prefixe}/ ${jours} jours`)
			.join(', ');
		return {
			code: 0,
			texte: `${vus}, aucun plus vieux que l'âge promis pour son préfixe (${ages}).\n`
		};
	}
	const compte = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;
	// L'exploitant cherchera l'objet chez le stockage, qui ne connaît que la date de dépôt.
	const origine = (o) =>
		o.depot === undefined
			? ''
			: `, compté depuis la date de son nom (déposé chez le stockage il y a ${duree(o.depot)})`;
	const parties = [];
	if (tropVieux.length > 0) {
		parties.push(
			compte(
				tropVieux.length,
				"objet distant plus vieux que l'âge promis pour son préfixe",
				"objets distants plus vieux que l'âge promis pour leur préfixe"
			)
		);
	}
	if (horsPrefixes.length > 0) {
		parties.push(
			compte(
				horsPrefixes.length,
				'objet distant hors des trois préfixes',
				'objets distants hors des trois préfixes'
			)
		);
	}
	const lignes = [
		`${parties.join(' et ')}, sur ${verifies} ${verifies > 1 ? 'vérifiés' : 'vérifié'}`,
		...tropVieux.map(
			(o) =>
				`  ${o.chemin} : ${duree(o.age)}, pour ${o.promis} jours promis sous ${o.prefixe}/${origine(o)}`
		),
		...horsPrefixes.map((o) => `  ${o.chemin} : ${duree(o.age)}, sans âge promis${origine(o)}`),
		"Le serveur n'efface rien chez le stockage, par décision (ADR 0037). La marche à suivre est dans",
		'docs/EXPLOITATION.md, « Une sauvegarde distante est trop vieille ».'
	];
	return { code: 1, texte: `${lignes.join('\n')}\n` };
}

// Appelé par `jadwal-sauvegarde.sh`, dans un conteneur jetable : la liste arrive sur l'entrée
// standard, « maintenant » en premier argument, puis les chemins des objets que la nuit vient
// d'envoyer, au moins un. Sortie 0 si tout est dans les âges, 1 si un objet ne l'est pas, 2 si la
// liste ne permet pas de contrôler : vide ou illisible (« liste illisible »), ou sans l'un des
// objets envoyés (« liste incomplète », rclone n'ayant alors rien signalé). Sans objet envoyé à
// chercher, c'est 2 aussi : une liste incomplète passerait. Le script appelant échoue sur tout ce
// qui n'est pas 0.
if (process.argv[1] && import.meta.url.endsWith(process.argv[1].replaceAll('\\', '/'))) {
	const [maintenant, ...envoyes] = process.argv.slice(2);
	if (!maintenant || envoyes.length === 0) {
		process.stderr.write(
			'usage : rclone lsjson --use-server-modtime --no-mimetype --recursive --files-only <destination>' +
				' | node ages.mjs <maintenant, ISO 8601> <objet envoyé cette nuit>...\n'
		);
		process.exit(2);
	}
	const entree = await new Promise((resolve) => {
		let texte = '';
		process.stdin.setEncoding('utf8');
		process.stdin.on('data', (morceau) => (texte += morceau));
		process.stdin.on('end', () => resolve(texte));
	});
	try {
		const { code, texte } = rapport(verifier(entree, maintenant, envoyes));
		process.stdout.write(texte);
		process.exitCode = code;
	} catch (erreur) {
		if (!(erreur instanceof EntreeIllisible)) throw erreur;
		const quoi = erreur instanceof ListeIncomplete ? 'liste incomplète' : 'liste illisible';
		process.stderr.write(`${quoi} : ${erreur.message}\n`);
		process.exitCode = 2;
	}
}
