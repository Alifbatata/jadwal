/**
 * Pose l'horloge de Node à un instant donné, pour un serveur de test ; elle avance ensuite au rythme
 * réel. La production ne le charge jamais : il n'entre ni dans le serveur construit, ni dans
 * l'image, et il ne fait rien tant qu'on ne le nomme pas au lancement de Node.
 *
 *     JADWAL_HORLOGE_FIGEE=2026-10-09T08:00:00Z node --import ./scripts/horloge-figee.mjs build/index.js
 *
 * ## Pourquoi
 *
 * Un test qui calcule « aujourd'hui » à son chargement, puis demande au serveur la page du jour,
 * tombe quand le passage franchit minuit : le test attend la veille, le serveur sert le lendemain.
 * `apps/web/tests/public-prieres-agenda.test.ts` y a perdu treize vérifications à l'étape 18. Poser
 * l'horloge du serveur à un instant, et faire lire au test le même instant, supprime le désaccord :
 * les deux parlent du même jour, quelle que soit l'heure du passage. Le jour ne dépend plus du
 * lancement.
 *
 * ## Ce qu'il fait, et ce qu'il ne touche pas
 *
 * Au chargement, l'horloge part de l'instant donné, puis avance au rythme réel, mesuré par
 * `performance.now()` : `Date.now()` et `new Date()` sans argument rendent l'instant donné plus le
 * temps écoulé depuis le chargement, et `Date()` appelé sans `new` rend sa forme écrite. Le jour
 * reste donc celui de l'instant donné tant qu'un passage n'atteint pas son minuit, et une durée
 * mesurée par `Date.now()` reste une vraie durée. Jusqu'à la relecture de l'étape 19, l'horloge ne
 * bougeait pas du tout : une durée valait zéro, une fenêtre de la limitation de débit
 * (`consumeDetailed`, fenêtre fixe sur `Date.now()`) ne se rouvrait jamais, et un serveur
 * n'accordait que cinq demandes de lien de connexion par adresse pour toute sa vie.
 *
 * Le reste de `Date` est celui de Node : une date construite à partir d'une valeur, `Date.UTC`,
 * `Date.parse`, les fuseaux. Les minuteries (`setTimeout`), `performance.now()` et
 * `process.hrtime()` ne sont pas touchés.
 *
 * `JADWAL_HORLOGE_FIGEE` est un instant ISO 8601 **avec son fuseau** (`Z` ou `+02:00`). Absente,
 * illisible ou impossible (un 30 février, une vingt-cinquième heure), le module refuse de charger,
 * et Node ne démarre pas : un serveur qu'on croirait posé à un jour et qui serait à un autre rendrait
 * au test les échecs de minuit qu'il devait supprimer. Au chargement, le module écrit sur la sortie
 * d'erreur d'où part l'horloge : le journal d'un serveur dit ainsi que son heure n'est pas la vraie.
 *
 * ## Ce qu'il ne pose pas : l'horloge de la base
 *
 * PostgreSQL a la sienne, `now()` et `current_date`, que ce module n'atteint pas. Un chemin qui
 * compare une date écrite par Node à `now()` voit deux horloges, et leur écart est celui de
 * l'instant posé au vrai. C'est le cas de l'âge d'une session de super-admin : `created_at`, écrit
 * par Better Auth depuis Node, contre `now()`, dans `apps/web/src/lib/server/context.ts`. Dès que
 * l'instant posé retarde de 12 heures sur le vrai (`SUPER_ADMIN_SESSION_HOURS`), la session est
 * supprimée à sa première requête. Les purges nocturnes lisent aussi `now()`. Les pages publiques,
 * elles, calculent le jour dans Node seul.
 *
 * ## Contre l'image de production : quel instant
 *
 * Le fichier ne dépend de rien : il se monte tel quel dans le conteneur, et `NODE_OPTIONS` le fait
 * charger par le serveur de l'image, sans rien changer à l'image elle-même.
 *
 *     docker run … \
 *       --volume <racine du dépôt>/scripts/horloge-figee.mjs:/opt/jadwal-horloge-figee.mjs:ro \
 *       --env NODE_OPTIONS=--import=/opt/jadwal-horloge-figee.mjs \
 *       --env JADWAL_HORLOGE_FIGEE=<instant> \
 *       <image>
 *
 * Seul le serveur de l'application doit le recevoir : le conteneur de démarrage (rôles et
 * migrations) n'en a pas besoin. Le parcours se connecte, en super-admin aussi : l'instant qu'il
 * pose doit rester près du vrai. La règle est **l'instant du lancement, ramené à 20:00, heure de
 * Zurich, s'il tombe plus tard**. L'horloge posée a alors au moins quatre heures avant son minuit,
 * et elle ne retarde jamais de plus de quatre heures sur la base. Un instant fixe, écrit une fois
 * pour toutes (« 10:00 le jour du lancement »), couperait la session du super-admin dès qu'un
 * passage part après 22:00. Le parcours calcule ce qu'il attend à partir de ce même instant, et
 * non de l'heure de son lancement.
 */
const valeur = process.env['JADWAL_HORLOGE_FIGEE'] ?? '';

/**
 * L'instant, s'il est écrit en entier et s'il existe : l'année, le mois, le jour, l'heure, les
 * minutes et les secondes écrits doivent être ceux de la date que le calendrier en tire. `Date.parse`
 * seul lit un 30 février comme le 2 mars. Le fuseau va de -12:00 à +14:00, comme les vrais.
 */
function instantQuiExiste(texte) {
	const forme =
		/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d{1,3})?)?(?:Z|([+-])(\d{2}):(\d{2}))$/.exec(
			texte
		);
	if (!forme) return null;
	const [annee, mois, jour, heure, minute, seconde = 0] = forme.slice(1, 7).map(Number);
	const calendrier = new Date(Date.UTC(annee, mois - 1, jour, heure, minute, seconde));
	const existe =
		calendrier.getUTCFullYear() === annee &&
		calendrier.getUTCMonth() === mois - 1 &&
		calendrier.getUTCDate() === jour &&
		calendrier.getUTCHours() === heure &&
		calendrier.getUTCMinutes() === minute &&
		calendrier.getUTCSeconds() === seconde;
	const decalage = forme[7] ? (forme[7] === '+' ? 1 : -1) * Number(forme[8]) : 0;
	const fuseau = decalage >= -12 && decalage <= 14 && Number(forme[9] ?? 0) <= 59;
	const instant = Date.parse(texte);
	return existe && fuseau && Number.isFinite(instant) ? instant : null;
}

const instant = instantQuiExiste(valeur);
if (instant === null) {
	throw new Error(
		`horloge-figee : JADWAL_HORLOGE_FIGEE doit être un instant ISO 8601 qui existe, avec son ` +
			`fuseau, par exemple 2026-10-09T08:00:00Z ; reçu « ${valeur} ».`
	);
}

const DateReelle = globalThis.Date;
const depart = performance.now();

/** L'instant posé, plus le temps écoulé depuis le chargement, en millisecondes entières. */
function maintenant() {
	return instant + Math.floor(performance.now() - depart);
}

/**
 * `Date`, à l'horloge posée. Une fonction et non une classe : `Date()` sans `new` doit rester
 * permis, et une classe le refuse. `Reflect.construct` garde la sous-classe d'une bibliothèque qui
 * étendrait `Date`.
 */
function DateFigee(...valeurs) {
	if (!new.target) return new DateReelle(maintenant()).toString();
	return Reflect.construct(DateReelle, valeurs.length === 0 ? [maintenant()] : valeurs, new.target);
}
Object.setPrototypeOf(DateFigee, DateReelle);
DateFigee.prototype = DateReelle.prototype;
DateFigee.now = maintenant;

globalThis.Date = DateFigee;

process.stderr.write(
	`horloge-figee : l’horloge de ce processus part du ${new DateReelle(instant).toISOString()}, ` +
		`et avance au rythme réel.\n`
);
