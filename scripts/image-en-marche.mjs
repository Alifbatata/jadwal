/**
 * L'image de production **mise en marche comme en production** : un réseau à elle, une base
 * PostgreSQL à côté, les rôles et les migrations joués par les scripts de l'image elle-même, puis
 * son serveur.
 *
 * Deux épreuves s'en servent : `eprouver-image.mjs`, qui interroge une route par famille, et
 * `eprouver-parcours.mjs`, qui fait tout le parcours d'une organisation dans un navigateur. Elles
 * doivent lever l'image de la même façon, sans quoi l'une prouverait ce que l'autre ne fait pas.
 *
 * Aucun secret n'en sort. Les mots de passe sont tirés au hasard à chaque mise en marche, passent
 * au conteneur en arguments `--env` sans jamais traverser un shell, et meurent avec lui.
 */
import { execFileSync, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** PostgreSQL, à la version et au digest de `docker-compose.dev.yml` : une seule vérité. */
export function imagePostgres() {
	const compose = readFileSync(join(racine, 'docker-compose.dev.yml'), 'utf8');
	const trouve = /image:\s*(postgres:[^\s@]+@sha256:[0-9a-f]{64})/.exec(compose);
	if (!trouve) throw new Error('digest de PostgreSQL introuvable dans docker-compose.dev.yml');
	return trouve[1];
}

export function docker(args, options = {}) {
	return execFileSync('docker', args, { encoding: 'utf8', ...options });
}

/** Un mot de passe tiré au hasard. Il ne sort jamais d'ici, et il meurt avec le conteneur. */
const motDePasse = () => randomBytes(24).toString('base64url');

/** Attendre sans tenir le processeur, là où rien d'asynchrone n'est possible. */
function patienter(millisecondes) {
	Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, millisecondes);
}

/**
 * Construit l'image depuis un dossier. Le résultat est celui de `spawnSync` : la construction dit
 * ce qu'elle a fait sur sa sortie d'erreur, et c'est à l'appelant d'en garder ce qui l'intéresse.
 */
export function construireImage(contexte, etiquette) {
	return spawnSync('docker', ['build', '--tag', etiquette, '.'], {
		cwd: contexte,
		stdio: ['ignore', 'pipe', 'pipe'],
		encoding: 'utf8',
		// Le journal d'une construction complète dépasse le mégaoctet par défaut : au-delà, Node
		// coupe la sortie et rend une erreur sans que la construction ait échoué.
		maxBuffer: 64 * 1024 * 1024
	});
}

export class MiseEnMarche {
	/**
	 * @param {string} image l'image à mettre en marche
	 * @param {string} prefixe le début du nom des conteneurs et du réseau
	 * @param {string} marque ce qui distingue cette mise en marche d'une autre qui tournerait en même temps
	 */
	constructor(image, prefixe, marque) {
		this.image = image;
		this.reseau = `${prefixe}-${marque}`;
		this.base = `${prefixe}-db-${marque}`;
		this.serveur = `${prefixe}-app-${marque}`;
		this.secrets = {
			POSTGRES_PASSWORD: motDePasse(),
			JADWAL_DB_OWNER_PASSWORD: motDePasse(),
			JADWAL_DB_APP_PASSWORD: motDePasse(),
			JADWAL_DB_SUPERADMIN_PASSWORD: motDePasse(),
			JADWAL_DB_AUTH_PASSWORD: motDePasse(),
			JADWAL_DB_PUBLIC_PASSWORD: motDePasse(),
			BETTER_AUTH_SECRET: motDePasse()
		};
	}

	/** Les variables d'environnement, en arguments `--env`. Les valeurs ne passent jamais par un shell. */
	environnement(extra = {}) {
		const toutes = {
			NODE_ENV: 'production',
			POSTGRES_HOST: this.base,
			POSTGRES_PORT: '5432',
			POSTGRES_USER: 'jadwal',
			POSTGRES_DB: 'jadwal',
			ORIGIN: 'http://127.0.0.1:3000',
			// `file` et `smtp` sont les deux seules valeurs. Une troisième fait lever l'application à
			// la première requête, et toutes les routes rendent 500 : mesuré en écrivant ce test.
			MAIL_TRANSPORT: 'file',
			MAIL_OUTBOX_DIR: '/tmp/courriels',
			MAIL_FROM: 'epreuve@example.test',
			MAIL_FROM_NAME: 'jadwal',
			...this.secrets,
			...extra
		};
		return Object.entries(toutes).flatMap(([cle, valeur]) => ['--env', `${cle}=${valeur}`]);
	}

	/** Le réseau et la base. Vrai quand la base répond, faux au bout d'une minute. */
	leverLaBase() {
		docker(['network', 'create', this.reseau], { stdio: 'ignore' });
		docker([
			'run',
			'--detach',
			'--name',
			this.base,
			'--network',
			this.reseau,
			'--env',
			'POSTGRES_USER=jadwal',
			'--env',
			`POSTGRES_PASSWORD=${this.secrets.POSTGRES_PASSWORD}`,
			'--env',
			'POSTGRES_DB=jadwal',
			imagePostgres()
		]);
		for (let essai = 0; essai < 60; essai += 1) {
			const sonde = spawnSync(
				'docker',
				['exec', this.base, 'pg_isready', '-h', '127.0.0.1', '-U', 'jadwal', '-d', 'jadwal'],
				{ stdio: 'ignore' }
			);
			if (sonde.status === 0) return true;
			patienter(1000);
		}
		return false;
	}

	/**
	 * Joue un script de `@jadwal/db` **tel que l'image le porte**, dans un conteneur jetable : c'est
	 * la commande que l'exploitant tape en production, et non celle du poste.
	 */
	jouer(script, args = []) {
		const passage = spawnSync(
			'docker',
			[
				'run',
				'--rm',
				'--network',
				this.reseau,
				...this.environnement(),
				this.image,
				'node',
				`node_modules/@jadwal/db/scripts/${script}`,
				...args
			],
			{ encoding: 'utf8' }
		);
		const derniere =
			`${passage.stdout ?? ''}${passage.stderr ?? ''}`.trim().split('\n').pop() ?? '';
		return { ok: passage.status === 0, derniere };
	}

	/** Le serveur de l'image, détaché. `publication` est la valeur de `--publish`. */
	lancerLeServeur(publication, extra = {}) {
		docker([
			'run',
			'--detach',
			'--name',
			this.serveur,
			'--network',
			this.reseau,
			'--publish',
			publication,
			...this.environnement(extra),
			this.image
		]);
	}

	/**
	 * Tout ce que le serveur a écrit. `docker logs` rend la sortie standard du conteneur sur la
	 * sienne et la sortie d'erreur sur la sienne ; les 500 d'`adapter-node` passent par la seconde.
	 * Les lire toutes les deux, ou ne rien voir d'une panne : le journal ne montrait que
	 * « Listening on » quand on ne lisait que la première.
	 */
	journal() {
		const sorties = spawnSync('docker', ['logs', this.serveur], { encoding: 'utf8' });
		return `${sorties.stdout ?? ''}${sorties.stderr ?? ''}`;
	}

	/** Les conteneurs et le réseau. L'image, elle, appartient à qui l'a construite. */
	nettoyer() {
		for (const nom of [this.serveur, this.base]) {
			spawnSync('docker', ['rm', '-f', nom], { stdio: 'ignore' });
		}
		spawnSync('docker', ['network', 'rm', this.reseau], { stdio: 'ignore' });
	}
}
