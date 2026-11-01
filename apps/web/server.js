// Le point d'entrée du serveur de jadwal (ADR 0050).
//
// adapter-node 6 ne lit plus `ORIGIN` : l'adresse du site se fige à la construction, ou se tire de
// la requête, de `Host` et d'un protocole qui vaut `https` quand aucun en-tête ne le donne. jadwal
// ne veut ni l'un ni l'autre : une même image sert en production, dans la CI et dans le parcours,
// chacun avec son origine, et l'adresse que le service voit ne doit jamais dépendre de ce que le
// client écrit.
//
// Ce fichier rend donc à `ORIGIN` son rôle, sans rien prendre d'autre à l'adaptateur : il la lit et
// la vérifie au démarrage, désigne à adapter-node deux en-têtes internes pour le protocole et
// l'hôte, lance son serveur, puis place **avant** l'écouteur de l'adaptateur un écouteur qui écrit
// ces deux en-têtes à partir d'`ORIGIN`, en écrasant ce que la requête en portait. L'arrêt propre,
// les délais et l'adresse du visiteur (`ADDRESS_HEADER`) restent ceux d'adapter-node.

import process from 'node:process';

const PROTOCOL_HEADER = 'x-jadwal-protocol';
const HOST_HEADER = 'x-jadwal-host';

/**
 * Le protocole (sans `:`) et l'hôte (port compris) de l'origine publique, ou une erreur qui dit ce
 * qui ne va pas. Better Auth refuse déjà une origine avec un chemin (`auth.ts`), mais seulement à
 * la première requête qui le sollicite : ici, le service ne démarre pas.
 * @param {string | undefined} value
 * @returns {{ protocol: string, host: string }}
 */
function publicOrigin(value) {
	if (!value) throw new Error('ORIGIN is required, for example https://jadwal.example');
	let url;
	try {
		url = new URL(value);
	} catch {
		throw new Error(`ORIGIN is not a valid URL, got ${JSON.stringify(value)}`);
	}
	if (url.protocol !== 'http:' && url.protocol !== 'https:') {
		throw new Error(`ORIGIN must use http or https, got ${JSON.stringify(url.protocol)}`);
	}
	if (url.username || url.password) throw new Error('ORIGIN must not carry credentials');
	if (url.pathname !== '/') {
		throw new Error(`ORIGIN must not carry a path, got ${JSON.stringify(url.pathname)}`);
	}
	if (url.search) {
		throw new Error(`ORIGIN must not carry a query, got ${JSON.stringify(url.search)}`);
	}
	if (url.hash) {
		throw new Error(`ORIGIN must not carry a fragment, got ${JSON.stringify(url.hash)}`);
	}
	return { protocol: url.protocol.slice(0, -1), host: url.host };
}

const origin = publicOrigin(process.env['ORIGIN']);

// Posés par quelqu'un d'autre, ces réglages seraient écrasés sans bruit, ou, pour `PORT_HEADER`,
// ajouteraient un port à celui d'`ORIGIN` : mieux vaut ne pas démarrer et le dire.
for (const name of ['PROTOCOL_HEADER', 'HOST_HEADER', 'PORT_HEADER']) {
	if (process.env[name] !== undefined) {
		throw new Error(`${name} must not be set: jadwal derives the address of the site from ORIGIN`);
	}
}

// adapter-node lit ces deux réglages une seule fois, au chargement de son module : ils doivent être
// posés avant l'import.
process.env['PROTOCOL_HEADER'] = PROTOCOL_HEADER;
process.env['HOST_HEADER'] = HOST_HEADER;

const { server } = await import('./build/index.js');

// Le serveur écoute déjà, mais aucune requête ne peut arriver avant la fin de ce module : elles
// passent par la boucle d'événements, que l'import ne rend qu'ici.
server.prependListener('request', (request) => {
	request.headers[PROTOCOL_HEADER] = origin.protocol;
	request.headers[HOST_HEADER] = origin.host;
});
