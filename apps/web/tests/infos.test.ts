// Ce qu'une organisation dit d'elle : de l'écran Réglages à l'onglet Infos de la page publique, à
// l'annonce de la vue « Aujourd'hui » et à l'API (étape 24, ADR 0052, docs/maquettes/public-infos.md).
//
// Le vrai chemin : connexion par lien magique, formulaire envoyé sans JavaScript, puis ce que voit un
// visiteur. Les textes attendus sont écrits ici, sans passer par le code qu'on éprouve.

import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, inject, it } from 'vitest';
import { createDatabase, newId, sql, withOrg, type DatabaseHandle } from '@jadwal/db';
import { conditionsAcceptees } from './conditions-acceptees.js';
import { attendreLeSeulScriptHorsReseau } from './scripts-de-page.js';
import { visibleText } from './textes-lus.js';

const origin = inject('origin');
const outbox = inject('outbox');
const testDatabase = inject('testDatabase');

const LANGUES = ['fr', 'de', 'it', 'en', 'ar'] as const;
type Langue = (typeof LANGUES)[number];

const SLUG = 'organisation-qui-informe';
const NOM = 'Association qui informe';
const EMAIL = 'responsable-infos@example.test';
/** Une organisation qui n'a rien dit d'elle. */
const SLUG_MUETTE = 'organisation-muette';

const INFOS = {
	address: 'Rue de l’Exemple 12\n2500 Bienne',
	contactPhone: '+41 32 000 00 00',
	contactEmail: 'contact@example.org',
	website: 'https://www.example.org/accueil',
	accessNote: 'Bus 4, arrêt Exemple.\nEntrée des femmes par la cour.',
	announcement: 'La salle du bas est <fermée> cette semaine.\nRetour lundi.'
};

const AGENTS = {
	android:
		'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
	iphone:
		'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
	windows:
		'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36 Edg/140.0.0.0'
};

// Ce que la page doit dire, écrit ici.
const ONGLET: Record<Langue, string> = {
	fr: 'Infos',
	de: 'Über uns',
	it: 'Info',
	en: 'Info',
	ar: 'معلومات'
};
const TITRES: Record<Langue, string[]> = {
	fr: ['Annonce', 'Adresse', 'Contact', 'Accès'],
	de: ['Mitteilung', 'Adresse', 'Kontakt', 'Anfahrt und Zugang'],
	it: ['Avviso', 'Indirizzo', 'Contatti', 'Come arrivare'],
	en: ['Notice', 'Address', 'Contact', 'Getting there'],
	ar: ['إعلان', 'العنوان', 'للتواصل', 'الوصول']
};
const CARTE: Record<Langue, string> = {
	fr: 'Ouvrir dans une carte',
	de: 'In einer Karte öffnen',
	it: 'Apri in una mappa',
	en: 'Open in a map',
	ar: 'فتح في خريطة'
};
const ETIQUETTES: Record<Langue, string[]> = {
	fr: ['Téléphone', 'Adresse électronique', 'Site internet'],
	de: ['Telefon', 'E-Mail', 'Website'],
	it: ['Telefono', 'E-mail', 'Sito web'],
	en: ['Phone', 'Email', 'Website'],
	ar: ['الهاتف', 'البريد الإلكتروني', 'الموقع الإلكتروني']
};

let ownerHandle: DatabaseHandle;
let organizationId: string;
let cookie: string;
/** La responsable : le journal de l'organisation se lit sous son nom, comme l'écran le fait. */
let responsable: string;
let appHandle: DatabaseHandle;

async function maintenance<T>(
	travail: (tx: Parameters<Parameters<DatabaseHandle['db']['transaction']>[0]>[0]) => Promise<T>
): Promise<T> {
	return ownerHandle.db.transaction(async (tx) => {
		await tx.execute(sql`set local jadwal.maintenance = 'on'`);
		return travail(tx);
	});
}

function lignes<T>(resultat: unknown): T[] {
	if (Array.isArray(resultat)) return resultat as T[];
	return ((resultat as { rows?: unknown[] }).rows ?? []) as T[];
}

/** Un formulaire envoyé comme un navigateur sans JavaScript. */
async function envoyer(chemin: string, champs: Record<string, string>) {
	return fetch(`${origin}${chemin}`, {
		method: 'POST',
		redirect: 'manual',
		headers: {
			'content-type': 'application/x-www-form-urlencoded',
			accept: 'text/html',
			origin,
			cookie
		},
		body: new URLSearchParams(champs).toString()
	});
}

async function servir(
	chemin: string,
	entetes: Record<string, string> = {}
): Promise<{ statut: number; html: string; headers: Headers }> {
	const reponse = await fetch(`${origin}${chemin}`, { redirect: 'manual', headers: entetes });
	return { statut: reponse.status, html: await reponse.text(), headers: reponse.headers };
}

const base = (langue: Langue, slug = SLUG) =>
	langue === 'fr' ? `/m/${slug}` : `/m/${slug}/${langue}`;

function attributs(balise: string): Record<string, string> {
	return Object.fromEntries(
		[...balise.matchAll(/\s([a-z-]+)="([^"]*)"/g)].map((trouve) => [trouve[1], trouve[2]])
	);
}

/** Ce que l'œil lit d'un fragment, entités rendues. */
function lu(fragment: string): string {
	return fragment
		.replace(/<!--[\s\S]*?-->/g, '')
		.replace(/<span class="pour-lecteur[^"]*">[^<]*<\/span>/g, '')
		.replace(/<[^>]+>/g, ' ')
		.replaceAll('&lt;', '<')
		.replaceAll('&gt;', '>')
		.replaceAll('&amp;', '&')
		.replace(/\s+/g, ' ')
		.trim();
}

/** Les onglets de la navigation principale, dans l'ordre. */
function onglets(html: string): string[] {
	const liste = html.match(/<nav\b[^>]*\bclass="onglets\b[^"]*"[^>]*>([\s\S]*?)<\/nav>/)?.[1] ?? '';
	return [...liste.matchAll(/<a\b[^>]*>([\s\S]*?)<\/a>/g)].map((trouve) => lu(trouve[1] ?? ''));
}

function titres(html: string): string[] {
	return [...html.matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/g)].map((trouve) => lu(trouve[1] ?? ''));
}

/** Les liens du contenu principal : ce qu'ils disent, et leurs attributs. */
function liens(html: string): { texte: string; attributs: Record<string, string> }[] {
	const contenu = html.match(/<main\b[^>]*>([\s\S]*?)<\/main>/)?.[1] ?? '';
	return [...contenu.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/g)].map((trouve) => ({
		texte: lu(trouve[2] ?? ''),
		attributs: Object.fromEntries(
			Object.entries(attributs(`<a${trouve[1]}>`)).map(([cle, valeur]) => [
				cle,
				valeur.replaceAll('&amp;', '&')
			])
		)
	}));
}

async function enBase(): Promise<Record<string, string | null>> {
	const [ligne] = await maintenance(async (tx) =>
		lignes<Record<string, string | null>>(
			await tx.execute(sql`
				select "address", "contact_phone", "contact_email", "website", "access_note",
					"announcement" from "organization" where "id" = ${organizationId}
			`)
		)
	);
	return ligne as Record<string, string | null>;
}

beforeAll(async () => {
	ownerHandle = createDatabase({ role: 'owner', overrides: { database: testDatabase } });
	organizationId = newId();
	const userId = newId();
	responsable = userId;
	appHandle = createDatabase({ role: 'app', overrides: { database: testDatabase } });
	await maintenance(async (tx) => {
		await tx.execute(sql`
			insert into "organization" ("id", "slug", "name", "time_zone", "default_language",
				"enabled_language")
			values
				(${organizationId}, ${SLUG}, ${NOM}, 'Europe/Zurich', 'fr', array['fr','de','it','en','ar']),
				(${newId()}, ${SLUG_MUETTE}, 'Association muette', 'Europe/Zurich', 'fr', array['fr'])
		`);
		await tx.execute(sql`
			insert into "user" ("id", "email", "name", "email_verified")
			values (${userId}, ${EMAIL}, 'Responsable (personne fictive)', true)
		`);
		await tx.execute(sql`
			insert into "membership" ("id", "organization_id", "user_id", "role")
			values (${newId()}, ${organizationId}, ${userId}, 'org_admin')
		`);
		await tx.execute(conditionsAcceptees(organizationId, userId));
		await tx.execute(sql`delete from "rate_limit"`);
	});

	// Connexion par lien magique, comme un vrai responsable.
	await fetch(`${origin}/connexion`, {
		method: 'POST',
		redirect: 'manual',
		headers: { 'content-type': 'application/x-www-form-urlencoded', accept: 'text/html', origin },
		body: new URLSearchParams({ email: EMAIL }).toString()
	});
	const noms = (await readdir(outbox)).filter((nom) => nom.endsWith('.json')).sort();
	const messages = await Promise.all(
		noms.map(
			async (nom) =>
				JSON.parse(await readFile(join(outbox, nom), 'utf8')) as { to: string; text: string }
		)
	);
	const lien = messages
		.filter((message) => message.to === EMAIL)
		.at(-1)
		?.text.match(/https?:\/\/\S+/)?.[0];
	expect(lien, 'aucun lien magique reçu').toBeTruthy();
	const suivi = await fetch(lien as string, { redirect: 'manual' });
	const pose = (suivi.headers.getSetCookie?.() ?? []).find((valeur) =>
		valeur.startsWith('better-auth.session_token=')
	);
	expect(pose, 'aucune session posée').toBeTruthy();
	cookie = (pose as string).split(';')[0] as string;
});

afterAll(async () => {
	await appHandle?.close();
	await ownerHandle?.close();
});

describe('une organisation qui n’a rien dit d’elle', () => {
	it('has no Infos tab, and shows the week view at the address of the tab', async () => {
		for (const slug of [SLUG, SLUG_MUETTE]) {
			const { html } = await servir(`/m/${slug}`);
			expect(onglets(html), slug).toEqual(['Aujourd’hui', 'Programme']);
		}
		const { statut, html } = await servir(`/m/${SLUG}?vue=infos`);
		expect(statut).toBe(200);
		expect(visibleText(html)).toContain(`${NOM} | Cours de la semaine`);
	});

	it('gives the six pieces of information as absent in the public API', async () => {
		const reponse = await fetch(`${origin}/api/v1/organisations/${SLUG}`);
		const corps = (await reponse.json()) as { organization: { info: unknown } };
		expect(corps.organization.info).toEqual({
			address: null,
			phone: null,
			email: null,
			website: null,
			access: null,
			announcement: null
		});
	});
});

describe('l’écran Réglages, pour les informations', () => {
	it('offers the six fields, each with its limit, and says that they are public', async () => {
		const reponse = await fetch(`${origin}/reglages`, { headers: { cookie } });
		expect(reponse.status).toBe(200);
		const html = await reponse.text();
		const formulaire =
			html.match(/<form\b[^>]*\baction="\?\/infos"[^>]*>([\s\S]*?)<\/form>/)?.[1] ?? '';
		const champs = [...formulaire.matchAll(/<(input|textarea)\b([^>]*)>/g)].map((trouve) => {
			const lus = attributs(`<x${trouve[2]}>`);
			return `${trouve[1]} ${lus['name']} ${lus['maxlength']}`;
		});
		expect(champs).toEqual([
			'textarea address 300',
			'input contactPhone 40',
			'input contactEmail 254',
			'input website 300',
			'textarea accessNote 1000',
			'textarea announcement 500'
		]);
		expect(visibleText(html)).toContain('Informations pour le public');
		expect(visibleText(html)).toContain(
			'Ce que vous écrivez ici s’affiche sur l’onglet Infos de votre page publique.'
		);
	});

	it('refuses a website that is not a web address, says why, and keeps what was typed', async () => {
		const reponse = await envoyer('/reglages?/infos', { ...INFOS, website: 'www.example.org' });
		expect(reponse.status).toBe(400);
		const html = await reponse.text();
		expect(visibleText(html)).toContain('Le site internet doit commencer par https:// ou http://.');
		expect(html).toMatch(/<input\b[^>]*\bname="website"[^>]*\bvalue="www\.example\.org"/);
		expect(html).toMatch(/<input\b[^>]*\bname="contactPhone"[^>]*\bvalue="\+41 32 000 00 00"/);
		expect(Object.values(await enBase()).every((valeur) => valeur === null)).toBe(true);
	});

	it('refuses an e-mail address that has not the form of one', async () => {
		const reponse = await envoyer('/reglages?/infos', { ...INFOS, contactEmail: 'contact' });
		expect(reponse.status).toBe(400);
		expect(visibleText(await reponse.text())).toContain(
			'L’adresse électronique n’a pas la forme d’une adresse.'
		);
	});

	it('refuses a text that is too long', async () => {
		const reponse = await envoyer('/reglages?/infos', {
			...INFOS,
			announcement: 'x'.repeat(501)
		});
		expect(reponse.status).toBe(400);
		expect(visibleText(await reponse.text())).toContain('Un des textes est trop long.');
	});

	it('saves the six pieces of information, and writes the change to the journal', async () => {
		const reponse = await envoyer('/reglages?/infos', INFOS);
		expect(reponse.status).toBe(200);
		expect(visibleText(await reponse.text())).toContain('Informations enregistrées.');
		expect(await enBase()).toEqual({
			address: INFOS.address,
			contact_phone: INFOS.contactPhone,
			contact_email: INFOS.contactEmail,
			website: INFOS.website,
			access_note: INFOS.accessNote,
			announcement: INFOS.announcement
		});
		// Le journal se lit comme l'écran le lit : par le rôle applicatif, sous une personne
		// responsable de l'organisation. Le propriétaire, lui, ne le lit pas.
		const [entree] = await withOrg(
			appHandle.db,
			{ organizationId, userId: responsable },
			async (tx) =>
				lignes<{ action: string; before: Record<string, unknown>; after: Record<string, unknown> }>(
					await tx.execute(sql`
						select "action", "before", "after" from "audit_log"
						where "target_id" = ${organizationId} order by "created_at" desc, "id" desc limit 1
					`)
				)
		);
		expect(entree?.action).toBe('organization.settings');
		expect(entree?.before).toMatchObject({ address: null, announcement: null });
		expect(entree?.after).toMatchObject({
			address: INFOS.address,
			website: INFOS.website,
			announcement: INFOS.announcement
		});
	});

	it('shows what is saved in the form, the next time', async () => {
		const reponse = await fetch(`${origin}/reglages`, { headers: { cookie } });
		const html = await reponse.text();
		expect(html).toMatch(
			/<input\b[^>]*\bname="website"[^>]*\bvalue="https:\/\/www\.example\.org\/accueil"/
		);
		expect(
			lu(html.match(/<textarea\b[^>]*\bname="address"[^>]*>([\s\S]*?)<\/textarea>/)?.[1] ?? '')
		).toBe('Rue de l’Exemple 12 2500 Bienne');
	});
});

describe('l’onglet Infos de la page publique', () => {
	it.each(LANGUES)(
		'appears in the main navigation, in %s, and leads to the tab',
		async (langue) => {
			const { html } = await servir(base(langue));
			expect(onglets(html).at(-1)).toBe(ONGLET[langue]);
			const lien = html.match(/<nav\b[^>]*\bclass="onglets\b[\s\S]*?<\/nav>/)?.[0] ?? '';
			const dernier = [...lien.matchAll(/<a\b([^>]*)>/g)].at(-1);
			const cible = new URL(
				(attributs(`<a${dernier?.[1] ?? ''}>`)['href'] ?? '').replaceAll('&amp;', '&'),
				`${origin}${base(langue)}`
			);
			expect([cible.pathname, cible.searchParams.get('vue')]).toEqual([base(langue), 'infos']);
		}
	);

	it.each(LANGUES)(
		'gives the notice, the address, the contact and the access, in %s',
		async (langue) => {
			const { statut, html } = await servir(`${base(langue)}?vue=infos`, {
				'user-agent': AGENTS.windows
			});
			expect(statut).toBe(200);
			expect(lu(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? '')).toBe(
				`${NOM} | ${ONGLET[langue]}`
			);
			expect(titres(html)).toEqual(TITRES[langue]);
			const etiquettes = [...html.matchAll(/<dt\b[^>]*>([\s\S]*?)<\/dt>/g)].map((trouve) =>
				lu(trouve[1] ?? '')
			);
			expect(etiquettes).toEqual(ETIQUETTES[langue]);
			// Ce que l'œil lit de chaque lien : l'annonce « s'ouvre dans un nouvel onglet » est réservée
			// aux lecteurs d'écran.
			expect(liens(html).map((lien) => lien.texte)).toEqual([
				CARTE[langue],
				INFOS.contactPhone,
				INFOS.contactEmail,
				INFOS.website
			]);
			// L'onglet est marqué, et la page n'a ni liste des vues, ni filtres, ni bloc du vendredi.
			expect(html).toMatch(
				new RegExp(`<a\\b[^>]*aria-current="page"[^>]*>\\s*${ONGLET[langue]}\\s*</a>`)
			);
			expect(html).not.toMatch(/<nav\b[^>]*\bclass="(vues|filtres)\b/);
			attendreLeSeulScriptHorsReseau(html, `${base(langue)}?vue=infos`);
		}
	);

	it('writes what the organisation typed as plain text, line breaks kept, in its own language', async () => {
		const { html } = await servir(`${base('ar')}?vue=infos`);
		// Le texte saisi n'est jamais du HTML : « <fermée> » se lit tel quel.
		expect(html).toContain('La salle du bas est &lt;fermée');
		expect(html).not.toContain('<fermée');
		// Les retours à la ligne de la saisie sont dans le texte, et la mise en page les garde.
		expect(html).toMatch(/Rue de l’Exemple 12\n2500 Bienne/);
		// Sur une page en arabe, ces textes sont marqués dans la langue par défaut de l'organisation.
		const blocs = [...html.matchAll(/<p\b([^>]*\bclass="saisi\b[^>]*)>/g)].map(
			(trouve) => attributs(`<p${trouve[1]}>`)['lang']
		);
		expect(blocs).toEqual(['fr', 'fr', 'fr']);
	});

	it('opens the address in the maps of the device, and the three contacts by their own links', async () => {
		const requete = encodeURIComponent('Rue de l’Exemple 12, 2500 Bienne');
		const carteSur = async (agent: string, plateforme?: string) => {
			const { html, headers } = await servir(`${base('fr')}?vue=infos`, {
				'user-agent': agent,
				...(plateforme ? { 'sec-ch-ua-platform': plateforme } : {})
			});
			expect(headers.get('vary') ?? '').toMatch(/user-agent/i);
			return liens(html)[0]?.attributs;
		};
		expect(await carteSur(AGENTS.android, '"Android"')).toMatchObject({
			href: `geo:0,0?q=${requete}`
		});
		expect((await carteSur(AGENTS.android, '"Android"'))?.['target']).toBeUndefined();
		expect(await carteSur(AGENTS.iphone)).toMatchObject({
			href: `https://maps.apple.com/?q=${requete}`,
			target: '_blank',
			rel: 'noopener noreferrer'
		});
		expect(await carteSur(AGENTS.windows, '"Windows"')).toMatchObject({
			href: `https://www.openstreetmap.org/search?query=${requete}`,
			target: '_blank',
			rel: 'noopener noreferrer'
		});

		const { html } = await servir(`${base('fr')}?vue=infos`, { 'user-agent': AGENTS.windows });
		const [, telephone, courriel, site] = liens(html);
		expect(telephone?.attributs['href']).toBe('tel:+41320000000');
		expect(courriel?.attributs['href']).toBe('mailto:contact@example.org');
		expect(site?.attributs).toMatchObject({
			href: INFOS.website,
			target: '_blank',
			rel: 'noopener noreferrer'
		});
	});

	it('follows on the page of the subscription, where the tab is offered too', async () => {
		const { html } = await servir(`${base('fr')}/agenda`);
		expect(onglets(html)).toEqual(['Aujourd’hui', 'Programme', 'Infos']);
	});
});

describe('l’annonce', () => {
	it('heads the Today view, and only that view and the Infos tab', async () => {
		const aujourdhui = await servir(`${base('fr')}?vue=aujourdhui`);
		expect(titres(aujourdhui.html)[0]).toBe('Annonce');
		expect(lu(aujourdhui.html)).toContain(
			'La salle du bas est <fermée> cette semaine. Retour lundi.'
		);
		for (const requete of ['', '?vue=cours', '?vue=mois']) {
			const { html } = await servir(`${base('fr')}${requete}`);
			expect(lu(html), requete).not.toContain('La salle du bas');
		}
	});

	it('stays out of the frame of the widget', async () => {
		const { statut, html } = await servir(`${base('fr')}?vue=aujourdhui&embed=1`);
		expect(statut).toBe(200);
		expect(lu(html)).not.toContain('La salle du bas');
	});
});

describe('les informations dans l’API publique', () => {
	it('gives them under info, with the settings of the organisation', async () => {
		const reponse = await fetch(`${origin}/api/v1/organisations/${SLUG}`);
		expect(reponse.status).toBe(200);
		const corps = (await reponse.json()) as { organization: { info: unknown } };
		expect(corps.organization.info).toEqual({
			address: INFOS.address,
			phone: INFOS.contactPhone,
			email: INFOS.contactEmail,
			website: INFOS.website,
			access: INFOS.accessNote,
			announcement: INFOS.announcement
		});
	});
});

describe('retirer les informations', () => {
	it('shows only the blocks that are left, and Contact as soon as one of its lines is there', async () => {
		const reponse = await envoyer('/reglages?/infos', {
			address: '',
			contactPhone: '',
			contactEmail: INFOS.contactEmail,
			website: '',
			accessNote: '',
			announcement: ''
		});
		expect(reponse.status).toBe(200);
		const { html } = await servir(`${base('fr')}?vue=infos`);
		expect(titres(html)).toEqual(['Contact']);
		expect(liens(html).map((lien) => lien.texte)).toEqual([INFOS.contactEmail]);
		const aujourdhui = await servir(`${base('fr')}?vue=aujourdhui`);
		expect(titres(aujourdhui.html)).not.toContain('Annonce');
	});

	it('takes the tab away when nothing is left', async () => {
		const reponse = await envoyer('/reglages?/infos', {
			address: ' ',
			contactPhone: '',
			contactEmail: '',
			website: '',
			accessNote: '\n',
			announcement: ''
		});
		expect(reponse.status).toBe(200);
		expect(Object.values(await enBase()).every((valeur) => valeur === null)).toBe(true);
		const { html } = await servir(`/m/${SLUG}`);
		expect(onglets(html)).toEqual(['Aujourd’hui', 'Programme']);
	});
});
