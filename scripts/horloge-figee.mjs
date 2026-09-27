/**
 * Fige l'horloge de Node à un instant donné, pour un serveur de test. La production ne le charge
 * jamais : il n'entre ni dans le serveur construit, ni dans l'image, et il ne fait rien tant qu'on
 * ne le nomme pas au lancement de Node.
 *
 *     JADWAL_HORLOGE_FIGEE=2026-10-09T08:00:00Z node --import ./scripts/horloge-figee.mjs build/index.js
 *
 * ## Pourquoi
 *
 * Un test qui calcule « aujourd'hui » à son chargement, puis demande au serveur la page du jour,
 * tombe quand le passage franchit minuit : le test attend la veille, le serveur sert le lendemain.
 * `apps/web/tests/public-prieres-agenda.test.ts` y a perdu treize vérifications à l'étape 18. Figer
 * l'horloge du serveur, et faire lire au test le même instant, supprime le désaccord : les deux
 * parlent du même jour, quelle que soit l'heure du passage. Le jour ne dépend plus du lancement.
 *
 * ## Ce qu'il fait, et ce qu'il ne touche pas
 *
 * `Date.now()` et `new Date()` sans argument rendent l'instant donné, toujours le même ; `Date()`
 * appelé sans `new` rend sa forme écrite. Le reste de `Date` est celui de Node : une date construite
 * à partir d'une valeur, `Date.UTC`, `Date.parse`, les fuseaux. Les minuteries (`setTimeout`),
 * `performance.now()` et `process.hrtime()` ne sont pas touchés : les délais et les durées se
 * mesurent toujours, seule la date qu'on lit est figée.
 *
 * `JADWAL_HORLOGE_FIGEE` est un instant ISO 8601 **avec son fuseau** (`Z` ou `+02:00`). Absente ou
 * illisible, le module refuse de charger, et Node ne démarre pas : un serveur qu'on croirait figé et
 * qui ne le serait pas rendrait au test les échecs de minuit qu'il devait supprimer.
 *
 * ## Ce qu'il ne fige pas : l'horloge de la base
 *
 * PostgreSQL a la sienne, `now()` et `current_date`, que ce module n'atteint pas. Un chemin qui
 * compare une date écrite par Node à `now()` verrait deux horloges : c'est le cas de l'âge d'une
 * session de super-admin (`created_at`, écrit par Better Auth depuis Node, contre `now()`, dans
 * `apps/web/src/lib/server/context.ts`), et des purges nocturnes. Les pages publiques, elles,
 * calculent le jour dans Node seul. Plus l'instant figé est loin du vrai, plus un tel chemin se
 * trompe : pour un parcours qui se connecte, un instant proche du lancement vaut mieux.
 *
 * ## Contre l'image de production
 *
 * Le fichier ne dépend de rien : il se monte tel quel dans le conteneur, et `NODE_OPTIONS` le fait
 * charger par le serveur de l'image, sans rien changer à l'image elle-même.
 *
 *     docker run … \
 *       --volume <racine du dépôt>/scripts/horloge-figee.mjs:/opt/jadwal-horloge-figee.mjs:ro \
 *       --env NODE_OPTIONS=--import=/opt/jadwal-horloge-figee.mjs \
 *       --env JADWAL_HORLOGE_FIGEE=2026-10-09T08:00:00Z \
 *       <image>
 *
 * L'épreuve lit alors le même instant pour calculer ce qu'elle attend. Seul le serveur de
 * l'application doit le recevoir : le conteneur de démarrage (rôles et migrations) n'en a pas besoin.
 */
const valeur = process.env['JADWAL_HORLOGE_FIGEE'] ?? '';
const FORME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?(?:Z|[+-]\d{2}:\d{2})$/;
const instant = Date.parse(valeur);
if (!FORME.test(valeur) || !Number.isFinite(instant)) {
	throw new Error(
		`horloge-figee : JADWAL_HORLOGE_FIGEE doit être un instant ISO 8601 avec son fuseau, ` +
			`par exemple 2026-10-09T08:00:00Z ; reçu « ${valeur} ».`
	);
}

const DateReelle = globalThis.Date;

/**
 * `Date`, à l'horloge figée. Une fonction et non une classe : `Date()` sans `new` doit rester
 * permis, et une classe le refuse. `Reflect.construct` garde la sous-classe d'une bibliothèque qui
 * étendrait `Date`.
 */
function DateFigee(...valeurs) {
	if (!new.target) return new DateReelle(instant).toString();
	return Reflect.construct(DateReelle, valeurs.length === 0 ? [instant] : valeurs, new.target);
}
Object.setPrototypeOf(DateFigee, DateReelle);
DateFigee.prototype = DateReelle.prototype;
DateFigee.now = () => instant;

globalThis.Date = DateFigee;
