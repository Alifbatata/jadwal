// L'origine publique, lue au démarrage (ADR 0051, qui remplace l'ADR 0050).
//
// adapter-node lit `ORIGIN` au démarrage : c'est d'elle seule que viennent le protocole et l'hôte
// d'`event.url`, quoi que le client écrive. Le crochet `init` de jadwal refuse ce que l'adaptateur
// laisserait passer : une `ORIGIN` absente (l'adresse viendrait alors de `Host`), ou qui porte un
// chemin, une requête, un fragment ou un compte (il les retirerait sans rien dire).
//
// Ce que ce fichier éprouve, sur de vrais serveurs construits :
//
//   1. un formulaire posté en HTTP local est accepté, et un formulaire venu d'un autre site refusé ;
//   2. ni `Host` ni les en-têtes `X-Forwarded-*`, écrits par le client, ne changent l'adresse que
//      le service voit ;
//   3. une origine en https se voit comme telle derrière un mandataire qui parle en clair ;
//   4. une `ORIGIN` absente, illisible, avec un chemin, ou des réglages d'adapter-node qui la
//      contrediraient, arrêtent le démarrage avec un message qui le dit.

import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { request } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { productionEnvironment } from './environnement-de-production.js';

const appDir = dirname(dirname(fileURLToPath(import.meta.url)));
const ENTREE = join(appDir, 'build', 'index.js');

const origin = inject('origin');
const proxiedOrigin = inject('proxiedOrigin');

/** Le septième port : les six qui précèdent sont pris par les autres serveurs des tests. */
const PORT_HTTPS = Number(process.env['JADWAL_TEST_PORT_BASE'] ?? 4173) + 6;
const ORIGINE_HTTPS = 'https://exemple.test';

/** Ce qu'un client hostile écrirait pour se faire passer pour un autre site. */
const EN_TETES_FALSIFIES = {
	host: 'autre.example',
	'x-forwarded-host': 'autre.example',
	'x-forwarded-proto': 'https'
};

interface Reponse {
	status: number;
	headers: Record<string, string | string[] | undefined>;
	body: string;
}

/**
 * Une requête par `node:http`, et non par `fetch` : `fetch` refuse d'écrire `Host` lui-même, et
 * c'est justement l'en-tête qu'il faut pouvoir falsifier ici.
 */
function envoyer(
	vers: string,
	chemin: string,
	options: { method?: string; headers?: Record<string, string>; body?: string } = {}
): Promise<Reponse> {
	const adresse = new URL(chemin, vers);
	return new Promise((resolve, reject) => {
		const requete = request(
			{
				host: adresse.hostname,
				port: adresse.port,
				path: adresse.pathname + adresse.search,
				method: options.method ?? 'GET',
				headers: {
					...(options.body === undefined
						? {}
						: { 'content-length': String(Buffer.byteLength(options.body)) }),
					...options.headers
				}
			},
			(reponse) => {
				const morceaux: Buffer[] = [];
				reponse.on('data', (morceau: Buffer) => morceaux.push(morceau));
				reponse.on('end', () =>
					resolve({
						status: reponse.statusCode ?? 0,
						headers: reponse.headers,
						body: Buffer.concat(morceaux).toString('utf8')
					})
				);
			}
		);
		requete.on('error', reject);
		requete.end(options.body);
	});
}

/** Le choix de la langue : un formulaire ordinaire, qui pose un cookie et renvoie sur l'écran. */
function choisirLaLangue(vers: string, headers: Record<string, string>): Promise<Reponse> {
	return envoyer(vers, '/langue', {
		method: 'POST',
		headers: { 'content-type': 'application/x-www-form-urlencoded', ...headers },
		body: 'language=de&returnTo=%2Fconnexion'
	});
}

/** La ligne `Sitemap` de `robots.txt` : l'adresse du site telle que le service la voit. */
async function planDuSite(vers: string, headers: Record<string, string> = {}): Promise<string> {
	const reponse = await envoyer(vers, '/robots.txt', { headers });
	expect(reponse.status).toBe(200);
	return reponse.body.split('\n').find((ligne) => ligne.startsWith('Sitemap: ')) ?? '';
}

function cookies(reponse: Reponse): string[] {
	const valeur = reponse.headers['set-cookie'];
	return Array.isArray(valeur) ? valeur : valeur ? [valeur] : [];
}

describe('un formulaire en HTTP local', () => {
	it('est accepté quand il vient du site lui-même', async () => {
		const reponse = await choisirLaLangue(origin, { origin });
		expect(reponse.status, reponse.body).toBe(303);
		expect(reponse.headers['location']).toBe('/connexion');
		expect(cookies(reponse).some((ligne) => ligne.startsWith('jadwal_language=de'))).toBe(true);
	});

	it('est refusé quand il vient d’un autre site', async () => {
		const reponse = await choisirLaLangue(origin, { origin: 'http://autre.example' });
		expect(reponse.status).toBe(403);
	});

	it('pose un cookie sans `Secure`, comme l’origine en clair le veut', async () => {
		const reponse = await choisirLaLangue(origin, { origin, ...EN_TETES_FALSIFIES });
		expect(reponse.status, reponse.body).toBe(303);
		const langue = cookies(reponse).find((ligne) => ligne.startsWith('jadwal_language='));
		expect(langue).toBeDefined();
		expect(langue).not.toMatch(/;\s*secure/i);
	});
});

describe('les en-têtes écrits par le client', () => {
	it('ne changent pas l’adresse que le service voit', async () => {
		expect(await planDuSite(origin)).toBe(`Sitemap: ${origin}/sitemap.xml`);
		expect(await planDuSite(origin, EN_TETES_FALSIFIES)).toBe(`Sitemap: ${origin}/sitemap.xml`);
	});

	it('ne font pas passer un formulaire d’un autre site pour un formulaire du service', async () => {
		const reponse = await choisirLaLangue(origin, {
			...EN_TETES_FALSIFIES,
			origin: 'https://autre.example'
		});
		expect(reponse.status).toBe(403);
	});

	it('ne laissent pas croire à une connexion chiffrée', async () => {
		const reponse = await envoyer(origin, '/connexion', { headers: EN_TETES_FALSIFIES });
		expect(reponse.status).toBe(200);
		expect(reponse.headers['strict-transport-security']).toBeUndefined();
	});

	it('n’ont pas plus d’effet derrière le mandataire, qui lit `X-Forwarded-For`', async () => {
		const headers = { ...EN_TETES_FALSIFIES, 'x-forwarded-for': '203.0.113.7' };
		expect(await planDuSite(proxiedOrigin, headers)).toBe(`Sitemap: ${proxiedOrigin}/sitemap.xml`);
		const reponse = await choisirLaLangue(proxiedOrigin, { ...headers, origin: proxiedOrigin });
		expect(reponse.status, reponse.body).toBe(303);
	});
});

describe('une origine en https, derrière un mandataire en clair', () => {
	let serveur: ChildProcess | undefined;
	const journal: string[] = [];
	const local = `http://127.0.0.1:${PORT_HTTPS}`;

	beforeAll(async () => {
		serveur = spawn(process.execPath, [ENTREE], {
			cwd: appDir,
			stdio: ['ignore', 'pipe', 'pipe'],
			env: {
				...productionEnvironment(),
				NODE_ENV: 'production',
				PORT: String(PORT_HTTPS),
				HOST: '127.0.0.1',
				ORIGIN: ORIGINE_HTTPS,
				POSTGRES_DB: inject('testDatabase'),
				MAIL_TRANSPORT: 'file',
				MAIL_OUTBOX_DIR: inject('outbox'),
				MAIL_FROM: 'jadwal@example.test',
				BETTER_AUTH_SECRET: inject('authSecret')
			}
		});
		serveur.stdout?.on('data', (morceau: Buffer) => journal.push(morceau.toString()));
		serveur.stderr?.on('data', (morceau: Buffer) => journal.push(morceau.toString()));
		for (let essai = 1; essai <= 60; essai += 1) {
			try {
				if ((await envoyer(local, '/healthz')).status === 200) return;
			} catch {
				// Le serveur n'écoute pas encore.
			}
			await new Promise((resolve) => setTimeout(resolve, 500));
		}
		throw new Error(`Le serveur en https n'a pas démarré.\n${journal.join('')}`);
	}, 60_000);

	afterAll(() => {
		serveur?.kill();
	});

	it('donne l’adresse publique, et non celle de la boucle locale', async () => {
		expect(await planDuSite(local)).toBe(`Sitemap: ${ORIGINE_HTTPS}/sitemap.xml`);
		expect(await planDuSite(local, { ...EN_TETES_FALSIFIES, 'x-forwarded-proto': 'http' })).toBe(
			`Sitemap: ${ORIGINE_HTTPS}/sitemap.xml`
		);
	});

	it('envoie l’en-tête de transport strict et des cookies `Secure`', async () => {
		const page = await envoyer(local, '/connexion');
		expect(page.status).toBe(200);
		expect(page.headers['strict-transport-security']).toBe('max-age=63072000; includeSubDomains');

		const reponse = await choisirLaLangue(local, { origin: ORIGINE_HTTPS });
		expect(reponse.status, reponse.body).toBe(303);
		const langue = cookies(reponse).find((ligne) => ligne.startsWith('jadwal_language='));
		expect(langue).toMatch(/;\s*secure/i);
	});

	it('refuse un formulaire qui se dit venir de la boucle locale', async () => {
		const reponse = await choisirLaLangue(local, { origin: local });
		expect(reponse.status).toBe(403);
	});
});

describe('le démarrage', () => {
	/** Lance le point d'entrée et rend ce qu'il a dit en s'arrêtant ; il ne doit pas écouter. */
	function demarrer(env: Record<string, string | undefined>): {
		code: number | null;
		sortie: string;
	} {
		const base = productionEnvironment();
		for (const nom of ['ORIGIN', 'PROTOCOL_HEADER', 'HOST_HEADER', 'PORT_HEADER']) delete base[nom];
		const resultat = spawnSync(process.execPath, [ENTREE], {
			cwd: appDir,
			encoding: 'utf8',
			timeout: 30_000,
			env: { ...base, NODE_ENV: 'production', HOST: '127.0.0.1', PORT: '1', ...env }
		});
		return { code: resultat.status, sortie: `${resultat.stdout}${resultat.stderr}` };
	}

	it.each([
		['absente', undefined, /ORIGIN is required/],
		// Ces trois-là, adapter-node les refuse lui-même, avant le crochet `init`.
		['vide', '', /Invalid ORIGIN: ''/],
		['illisible', 'jadwal.example', /Invalid ORIGIN: 'jadwal\.example'/],
		['avec un chemin', 'https://jadwal.example/agenda', /ORIGIN must not carry a path/],
		['avec une requête', 'https://jadwal.example/?a=1', /ORIGIN must not carry a query/],
		['avec un fragment', 'https://jadwal.example/#a', /ORIGIN must not carry a fragment/],
		['avec un compte', 'https://moi:secret@jadwal.example', /ORIGIN must not carry credentials/],
		['ni http ni https', 'ftp://jadwal.example', /Only http:\/\/ and https:\/\/ protocols/]
	])('refuse une ORIGIN %s', (_cas, valeur, attendu) => {
		const { code, sortie } = demarrer({ ORIGIN: valeur });
		expect(code, sortie).not.toBe(0);
		expect(sortie).toMatch(attendu);
		expect(sortie).not.toMatch(/Listening on/);
	});

	it.each(['PROTOCOL_HEADER', 'HOST_HEADER', 'PORT_HEADER'])(
		'refuse %s, que jadwal tire lui-même d’ORIGIN',
		(nom) => {
			const { code, sortie } = demarrer({
				ORIGIN: 'https://jadwal.example',
				[nom]: 'x-forwarded-host'
			});
			expect(code, sortie).not.toBe(0);
			expect(sortie).toMatch(new RegExp(`${nom} must not be set`));
			expect(sortie).not.toMatch(/Listening on/);
		}
	);
});
