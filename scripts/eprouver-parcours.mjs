#!/usr/bin/env node
/**
 * Le **parcours complet** d'une organisation, dans un vrai navigateur, sur l'image de production.
 *
 *     pnpm parcours:test
 *
 * ## Pourquoi ce test existe
 *
 * Les tests de l'application éprouvent chaque route à part, sans navigateur. Aucun ne prouve que
 * les écrans s'enchaînent : que le super-admin d'une instance neuve arrive à enregistrer sa passkey
 * et à ouvrir une organisation, que la personne invitée trouve son invitation et passe par les
 * conditions d'utilisation, que le cours qu'elle saisit apparaît sur la page publique, dans le
 * widget posé sur un autre site et dans le flux agenda, avec la semaine annulée et la séance
 * déplacée. Ce script le fait, dans l'ordre où une organisation le vit, et regarde l'écran à chaque
 * pas.
 *
 * La personne invitée est invitée dans **deux** organisations. Le lien « Choisir une autre
 * organisation » de l'écran d'acceptation n'existe que pour qui en a plus d'une, « Changer
 * d’organisation » dans la navigation que pour qui en a plus d'une ou a encore une invitation qui
 * attend, et l'acceptation vaut pour une organisation, pas pour toutes : les trois ne se voient
 * qu'à cette condition.
 *
 * Il passe aussi **axe** sur chaque page traversée. Le parcours s'arrête au premier écran qui ne
 * montre pas ce qu'il doit ; axe, lui, relève tout et tranche à la fin : un défaut d'accessibilité
 * n'empêche pas la suite du parcours, et la liste entière vaut mieux qu'un défaut à la fois. Le
 * script échoue s'il reste un problème « serious » ou « critical » ; les autres sont imprimés pour
 * information.
 *
 * ## Ce qu'il lui faut
 *
 * Docker, et Chrome ou Chromium déjà installé : aucun navigateur n'est téléchargé. Aucun secret,
 * aucune base existante, aucun port fixe. Les mots de passe sont tirés au hasard et jamais affichés.
 *
 * ## Variables d'environnement
 *
 * - `JADWAL_PARCOURS_IMAGE` : une image déjà construite. Elle est reprise telle quelle, et laissée
 *   en place à la fin.
 * - `JADWAL_PARCOURS_CONTEXTE` : le dossier d'où construire l'image quand aucune n'est donnée ; par
 *   défaut, la racine du dépôt. Un instantané (`git worktree add <dossier> HEAD`) construit ce qui
 *   est commité, même si l'arbre de travail change pendant ce temps. L'image construite est retirée
 *   à la fin.
 * - `JADWAL_CHROME` : le chemin de Chrome, quand il n'est pas à un emplacement usuel.
 *
 * La date des conditions attendue à l'écran est lue dans le `docs/CONDITIONS.md` du dossier de
 * construction, par la fonction du serveur : une nouvelle version du texte n'oblige pas à retoucher
 * ce script.
 *
 * ## Deux choix qui ne se devinent pas
 *
 * `ORIGIN` vaut `http://localhost:<port>`, et non une adresse IP : WebAuthn refuse une adresse IP
 * comme identifiant de partie de confiance, et SvelteKit refuse un formulaire dont l'origine n'est
 * pas `ORIGIN`. Le port est donc choisi **avant** de lancer le conteneur, et publié à l'identique.
 *
 * axe est injecté par le protocole de débogage (`page.evaluate`), qui n'est pas soumis à la
 * politique de sécurité du contenu. Une balise `<script>` ajoutée à une page publique y serait
 * bloquée, et c'est exactement ce que la politique doit faire.
 */
import { spawnSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { createRequire } from 'node:module';
import { createServer as createNetServer } from 'node:net';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { dateDeLaVersion } from '../apps/web/src/lib/conditions/rendu.js';
import { construireImage, MiseEnMarche, racine } from './image-en-marche.mjs';

const require = createRequire(import.meta.url);
const AXE = readFileSync(require.resolve('axe-core/axe.min.js'), 'utf8');

const IMAGE_DONNEE = process.env['JADWAL_PARCOURS_IMAGE']?.trim() ?? '';
const CONTEXTE = process.env['JADWAL_PARCOURS_CONTEXTE']?.trim() || racine;

const marque = randomUUID().slice(0, 8);
const IMAGE = IMAGE_DONNEE || `jadwal-parcours:${marque}`;
const marche = new MiseEnMarche(IMAGE, 'jadwal-parcours', marque);

/**
 * « 22 septembre 2026 » : la date du texte que l'image a reçu, lue comme le serveur la lit. Celui
 * du dossier de construction, ou celui du dépôt pour une image donnée.
 */
const TEXTE_DES_CONDITIONS = [CONTEXTE, racine]
	.map((dossier) => join(dossier, 'docs', 'CONDITIONS.md'))
	.find((fichier) => existsSync(fichier));
const DATE_DES_CONDITIONS = dateDeLaVersion(readFileSync(String(TEXTE_DES_CONDITIONS), 'utf8'));
/** Le texte compte dix données personnelles, en une seule liste numérotée (`docs/CONDITIONS.md`). */
const DONNEES_PERSONNELLES = 10;

/** Ce que le parcours saisit. Des adresses en `example.test`, qui ne mènent nulle part. */
const SUPER_ADMIN = 'super-admin@example.test';
const RESPONSABLE = 'responsable@example.test';
const ORGANISATION = { nom: 'Centre du Parcours', slug: 'centre-parcours' };
/** La seconde organisation de la personne invitée, où elle est éditrice. */
const VOISINE = { nom: 'Association voisine', slug: 'association-voisine' };
const FUSEAU = 'Europe/Zurich';
const SALLE = 'Grande salle';
const COURS_1 = { fr: 'Lecture du Coran', ar: 'قراءة القرآن' };
const COURS_2 = 'Arabe pour adultes';
const COURS_ANCRE = 'Tafsir du soir';
/** Un second cours ancré, à l'heure même de la prière : le décalage nul a sa propre phrase. */
const COURS_SANS_DECALAGE = 'Cercle de lecture';
const POSITION = { lieu: 'Bienne', latitude: '47.14', longitude: '7.25' };
const JOURS = ['lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi', 'dimanche'];
const CHIFFRES_ORIENTAUX = /[\u0660-\u0669\u06F0-\u06F9]/g;
/** La boîte aux lettres du serveur, dans le conteneur : `MAIL_TRANSPORT=file`. */
const BOITE = '/tmp/courriels';
/** La hauteur que le widget pose avant la première mesure (`packages/widget/src/element.ts`). */
const HAUTEUR_INITIALE_DU_CADRE = 320;
/**
 * Ce que la page publique écrit, langue par langue (`apps/web/src/lib/i18n.ts`) : le lien du pied,
 * l'annonce du nouvel onglet que ce lien porte pour les lecteurs d'écran, et le début des deux
 * mentions d'une séance déplacée, au départ et à l'arrivée. L'arabe est celui que le chef de projet
 * a relu.
 */
const TEXTES_PUBLICS = {
	fr: {
		conditions: 'Conditions d’utilisation',
		nouvelOnglet: 's’ouvre dans un nouvel onglet',
		depart: 'Déplacé au ',
		arrivee: 'Initialement le '
	},
	de: {
		conditions: 'Nutzungsbedingungen',
		nouvelOnglet: 'öffnet sich in einem neuen Tab',
		depart: 'Verschoben auf ',
		arrivee: 'Ursprünglich am '
	},
	it: {
		conditions: 'Condizioni d’uso',
		nouvelOnglet: 'si apre in una nuova scheda',
		depart: 'Spostato al ',
		arrivee: 'Inizialmente il '
	},
	ar: {
		conditions: 'شروط الاستخدام',
		nouvelOnglet: 'يُفتح في علامة تبويب جديدة',
		depart: 'نُقل إلى ',
		arrivee: 'كان مقرّرًا في '
	}
};
/**
 * Le nom accessible d'un lien qui ouvre un nouvel onglet : son texte visible, puis l'annonce entre
 * parenthèses, que seuls les lecteurs d'écran reçoivent (technique G201 des WCAG). Le widget dit la
 * même annonce que la page (`packages/widget/src/element.ts`).
 */
const avecNouvelOnglet = (texte, langue) => `${texte} (${TEXTES_PUBLICS[langue].nouvelOnglet})`;
/** Le lien du widget vers la page publique, sous son cadre. Le code collé ne demande aucune langue. */
const LIEN_DU_WIDGET = 'Voir le programme complet';
const CHANGER = 'Changer d’organisation';
/**
 * L'heure d'un cours ancré, la phrase puis l'heure calculée ; le libellé du flux, la phrase seule.
 * 15 minutes après le maghrib, puis à l'heure même : au décalage nul, le flux dit la phrase de la
 * page, « Après Maghrib », et non « À Maghrib » comme avant l'étape 17.
 */
const ANCRAGES = [
	{
		titre: COURS_ANCRE,
		heure: {
			fr: /^15 min après Maghrib \(\d{2}:\d{2}\)$/,
			ar: /^بعد المغرب بـ15 دقيقة \(\d{2}:\d{2}\)$/
		},
		libelle: { fr: '15 min après Maghrib', ar: 'بعد المغرب بـ15 دقيقة' }
	},
	{
		titre: COURS_SANS_DECALAGE,
		heure: { fr: /^Après Maghrib \(\d{2}:\d{2}\)$/, ar: /^بعد المغرب \(\d{2}:\d{2}\)$/ },
		libelle: { fr: 'Après Maghrib', ar: 'بعد المغرب' }
	}
];
/**
 * Une organisation qui n'existe pas, et ce que la page d'erreur de `/m/` en dit
 * (`apps/web/src/lib/i18n.ts`, `notFound` et `notFoundHint`).
 */
const INCONNUE = 'organisation-inconnue';
const INTROUVABLE = {
	fr: { titre: 'Page introuvable', phrase: 'Vérifiez l’adresse.' },
	ar: { titre: 'الصفحة غير موجودة', phrase: 'تحقّق من العنوان.' }
};

// ---------------------------------------------------------------------------------------------
// Ce qui se dit, et ce qui arrête tout
// ---------------------------------------------------------------------------------------------

class Echec extends Error {}

let verifications = 0;

/** Une vérification du parcours. Au premier échec, tout s'arrête : la suite n'aurait aucun sens. */
function verifier(quoi, condition, detail = '') {
	verifications += 1;
	process.stdout.write(`  ${condition ? 'ok  ' : 'NON '} ${quoi}${detail ? ` (${detail})` : ''}\n`);
	if (!condition) throw new Echec(detail ? `${quoi} : ${detail}` : quoi);
}

function etape(titre) {
	process.stdout.write(`\n${titre}\n`);
}

const attendre = (millisecondes) => new Promise((resolue) => setTimeout(resolue, millisecondes));

// ---------------------------------------------------------------------------------------------
// axe
// ---------------------------------------------------------------------------------------------

/** Tout ce qu'axe a trouvé : `{ page, regle, impact, cible, aide }`. */
const trouvaillesAxe = [];
const pagesAuditees = [];
const GRAVES = new Set(['serious', 'critical']);

/**
 * Passe axe sur une page ou sur un cadre. `iframes: false` pour une page qui contient un cadre
 * d'une autre origine : axe attendrait une minute une réponse que le cadre, sans axe, ne donnera
 * jamais. Le cadre est audité à part.
 */
async function auditer(cible, nom, { iframes = true } = {}) {
	// Une page atteinte par un lien de SvelteKit garde le `<title>` de la précédente quand elle n'en
	// pose pas : axe n'y verrait rien. On la recharge donc d'abord, en GET, sans l'action d'un
	// formulaire qu'un rechargement renverrait. Mesuré : l'écran Membres, sans titre, portait celui
	// de l'accueil.
	if (typeof cible.mainFrame === 'function' && cible.url().startsWith(ORIGINE)) {
		const adresse = new URL(cible.url());
		await ouvrir(
			cible,
			adresse.search.startsWith('?/') ? adresse.pathname : adresse.pathname + adresse.search
		);
	}
	await cible.evaluate(AXE);
	const violations = await cible.evaluate(async (avecCadres) => {
		const resultat = await window.axe.run(document, {
			resultTypes: ['violations'],
			iframes: avecCadres
		});
		return resultat.violations.map((violation) => ({
			regle: violation.id,
			impact: violation.impact ?? 'inconnu',
			aide: violation.help,
			cibles: violation.nodes.map((noeud) =>
				noeud.target
					.map((morceau) => (Array.isArray(morceau) ? morceau.join(' >>> ') : morceau))
					.join(' ')
			)
		}));
	}, iframes);
	pagesAuditees.push(nom);
	let graves = 0;
	let autres = 0;
	const lignes = [];
	for (const violation of violations) {
		for (const cibleTrouvee of violation.cibles) {
			trouvaillesAxe.push({ page: nom, ...violation, cible: cibleTrouvee });
			if (GRAVES.has(violation.impact)) graves += 1;
			else autres += 1;
			lignes.push(`         [${violation.impact}] ${violation.regle} : ${cibleTrouvee}`);
		}
	}
	const resume =
		graves === 0 && autres === 0
			? 'rien à signaler'
			: `${graves} sérieux ou critique(s), ${autres} pour information`;
	process.stdout.write(`  ${graves === 0 ? 'ok  ' : 'NON '} axe : ${nom} (${resume})\n`);
	for (const ligne of lignes) process.stdout.write(`${ligne}\n`);
}

// ---------------------------------------------------------------------------------------------
// Le poste : Chrome, un port libre, les dates
// ---------------------------------------------------------------------------------------------

/** Chrome, là où il se trouve : la même recherche que `conditions-pdf.mjs`. */
function chrome() {
	const declare = process.env['JADWAL_CHROME'];
	if (declare) {
		if (!existsSync(declare))
			throw new Error(`JADWAL_CHROME pointe sur un fichier absent : ${declare}`);
		return declare;
	}
	const candidats = [
		'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
		'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
		'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
		'/usr/bin/google-chrome',
		'/usr/bin/chromium',
		'/usr/bin/chromium-browser'
	];
	const trouve = candidats.find((candidat) => existsSync(candidat));
	if (!trouve) {
		throw new Error(
			'Chrome ou Chromium est introuvable. Poser JADWAL_CHROME sur le chemin de l’exécutable.'
		);
	}
	return trouve;
}

/** Un port libre de la boucle locale, demandé au système puis rendu aussitôt. */
function portLibre() {
	return new Promise((resolue, rejetee) => {
		const sonde = createNetServer();
		sonde.on('error', rejetee);
		sonde.listen(0, '127.0.0.1', () => {
			const { port } = /** @type {import('node:net').AddressInfo} */ (sonde.address());
			sonde.close(() => resolue(port));
		});
	});
}

/** La date du jour dans le fuseau de l'organisation, sans dépendre de celui du poste. */
function aujourdhui() {
	return new Intl.DateTimeFormat('en-CA', {
		timeZone: FUSEAU,
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).format(new Date());
}

/** Midi UTC : aucun changement d'heure ne fait changer de jour. */
function plusJours(iso, jours) {
	const date = new Date(`${iso}T12:00:00Z`);
	date.setUTCDate(date.getUTCDate() + jours);
	return date.toISOString().slice(0, 10);
}

/** 1 pour lundi, 7 pour dimanche, comme le formulaire des cours. */
function jourDeSemaine(iso) {
	const jour = new Date(`${iso}T12:00:00Z`).getUTCDay();
	return jour === 0 ? 7 : jour;
}

const compacte = (iso) => iso.replaceAll('-', '');

// ---------------------------------------------------------------------------------------------
// Le serveur : ses courriels, son journal
// ---------------------------------------------------------------------------------------------

/** Le séparateur des courriels dans la lecture groupée : un caractère qu'aucun JSON ne contient. */
const SEPARATEUR = '\u001e';

/**
 * Les courriels écrits par le serveur, lus dans le conteneur, du plus ancien au plus récent. Une
 * seule commande pour toute la boîte : un `docker exec` par fichier coûtait une à deux secondes
 * chacun, et l'attente d'un courriel relisait toute la boîte à chaque tour.
 */
function courriels() {
	const lecture = spawnSync(
		'docker',
		[
			'exec',
			marche.serveur,
			'sh',
			'-c',
			`for f in ${BOITE}/*.json; do [ -f "$f" ] && cat "$f" && printf '${SEPARATEUR}'; done`
		],
		{ encoding: 'utf8' }
	);
	if (lecture.status !== 0) return [];
	return lecture.stdout
		.split(SEPARATEUR)
		.filter((morceau) => morceau.trim() !== '')
		.map((morceau) => JSON.parse(morceau))
		.sort((a, b) => a.sentAt.localeCompare(b.sentAt) || a.sequence - b.sequence);
}

/** Le premier courriel pour cette adresse dont le sujet correspond, attendu dix secondes au plus. */
async function attendreCourriel(pour, sujet) {
	const limite = Date.now() + 10000;
	do {
		const trouve = courriels().find(
			(courriel) => courriel.to === pour && sujet.test(courriel.subject)
		);
		if (trouve) return trouve;
		await attendre(250);
	} while (Date.now() < limite);
	return undefined;
}

/** Les sujets reçus par une adresse : ce qu'on imprime quand le courriel attendu manque. */
const sujetsRecus = (pour) =>
	courriels()
		.filter((courriel) => courriel.to === pour)
		.map((courriel) => courriel.subject)
		.join(' | ');

/** Le lien de connexion d'un courriel. Il n'est jamais affiché : c'est un jeton. */
function lienDeConnexion(courriel) {
	return (courriel?.text ?? '')
		.split(/\s+/)
		.find((mot) => mot.startsWith('http') && mot.includes('token='));
}

function dernieresLignesDuServeur(combien = 30) {
	return marche.journal().trim().split('\n').slice(-combien);
}

// ---------------------------------------------------------------------------------------------
// Le navigateur
// ---------------------------------------------------------------------------------------------

let ORIGINE = '';
let PORT = 0;
/** Vrai une fois le serveur lancé : avant, il n'a pas de journal à recopier. */
let serveurLance = false;
/** La page que le parcours regarde en ce moment : c'est elle qu'on décrit en cas d'échec. */
let pageCourante;

const chemin = (page) => new URL(page.url()).pathname;

async function ouvrir(page, adresse) {
	pageCourante = page;
	const reponse = await page.goto(adresse.startsWith('http') ? adresse : `${ORIGINE}${adresse}`);
	await page.waitForLoadState('networkidle');
	return reponse;
}

/** Un bouton qui envoie un formulaire : la page se recharge, et on attend qu'elle ait fini. */
async function envoyer(page, bouton) {
	pageCourante = page;
	await Promise.all([page.waitForEvent('load'), bouton.click()]);
	await page.waitForLoadState('networkidle');
}

/** Un lien de la navigation des responsables : SvelteKit change de page sans la recharger. */
async function naviguer(page, libelle, attendu) {
	pageCourante = page;
	await navigationDeLEspace(page).getByRole('link', { name: libelle, exact: true }).click();
	await page.waitForURL((adresse) => adresse.pathname === attendu);
	await page.waitForLoadState('networkidle');
}

/**
 * Un lien, qu'il mène à une page rendue par le client ou à une page sans JavaScript (`csr = false`,
 * comme `/conditions`), que SvelteKit charge alors en entier : on attend l'adresse, pas l'événement.
 */
async function suivre(page, lien, attendu) {
	pageCourante = page;
	await lien.click();
	await page.waitForURL((adresse) => adresse.pathname === attendu);
	await page.waitForLoadState('networkidle');
}

async function titre(page) {
	return ((await page.locator('h1').first().textContent()) ?? '').trim();
}

/** Le texte d'un élément, espaces fines et insécables comprises ramenées à une espace simple. */
async function texteDe(locator) {
	return ((await locator.first().textContent()) ?? '').replace(/\s+/g, ' ').trim();
}

/**
 * L'adresse d'un lien une fois résolue. SvelteKit écrit ses liens en relatif (`../conditions`
 * depuis `/m/<slug>/ar`) : c'est la propriété `href`, pas l'attribut, qui dit où l'on arrive.
 */
async function cheminDuLien(lien) {
	return lien.evaluate((a) => new URL(/** @type {HTMLAnchorElement} */ (a).href).pathname);
}

/** La navigation de l'espace des responsables : absente tant que les conditions attendent. */
const navigationDeLEspace = (page) =>
	page.getByRole('navigation', { name: 'Espace des responsables' });

/**
 * « Changer d’organisation » dans la navigation : pour qui est membre de plusieurs organisations,
 * ou d'une seule avec une invitation qui attend encore.
 */
const lienChanger = (page) =>
	navigationDeLEspace(page).getByRole('link', { name: CHANGER, exact: true });

/**
 * Les noms que Chrome donne lui-même aux liens du document principal, lus dans son arbre
 * d'accessibilité : c'est ce qu'un lecteur d'écran annonce. `getByRole` en fait son propre calcul ;
 * on demande les deux. Le contenu d'un cadre n'y est pas, celui d'un shadow root ouvert y est.
 */
async function nomsDesLiensSelonChrome(page) {
	const cdp = await page.context().newCDPSession(page);
	try {
		const { nodes } = await cdp.send('Accessibility.getFullAXTree');
		return nodes
			.filter((noeud) => !noeud.ignored && noeud.role?.value === 'link')
			.map((noeud) =>
				String(noeud.name?.value ?? '')
					.replace(/\s+/g, ' ')
					.trim()
			);
	} finally {
		await cdp.detach();
	}
}

/**
 * La boîte de l'annonce du nouvel onglet dans un lien, en pixels : `1×1` quand elle est cachée aux
 * yeux et laissée aux lecteurs d'écran, `absente` quand le lien ne la porte pas.
 */
async function boiteDeLAnnonce(lien, langue) {
	const annonce = lien.getByText(`(${TEXTES_PUBLICS[langue].nouvelOnglet})`, { exact: true });
	if ((await annonce.count()) !== 1) return { cachee: false, taille: 'absente' };
	const boite = await annonce.boundingBox();
	if (!boite) return { cachee: false, taille: 'non rendue' };
	return {
		cachee: boite.width <= 1 && boite.height <= 1,
		taille: `${Math.round(boite.width)}×${Math.round(boite.height)} px`
	};
}

// ---------------------------------------------------------------------------------------------
// Les étapes
// ---------------------------------------------------------------------------------------------

const T = aujourdhui();
/**
 * Le premier cours demain, le second après-demain, déplacé au jour suivant, et les deux cours ancrés
 * dans quatre et cinq jours : tout tient dans les sept jours de l'accueil et de la vue Semaine.
 */
const J1 = plusJours(T, 1);
const J2 = plusJours(T, 2);
const J3 = plusJours(T, 3);
const J4 = plusJours(T, 4);
const J5 = plusJours(T, 5);

const etat = { cours1: '', cours2: '', codeEmbarque: '', codeCadre: '' };

function preparerLImage() {
	etape(`L'image`);
	if (IMAGE_DONNEE) {
		const existe = spawnSync('docker', ['image', 'inspect', IMAGE], { stdio: 'ignore' });
		verifier('l’image donnée existe', existe.status === 0, 'JADWAL_PARCOURS_IMAGE');
		return;
	}
	const construction = construireImage(CONTEXTE, IMAGE);
	if (construction.status !== 0) process.stderr.write(construction.stderr?.slice(-4000) ?? '');
	verifier(
		'l’image se construit',
		construction.status === 0,
		CONTEXTE === racine ? 'depuis la racine du dépôt' : 'depuis JADWAL_PARCOURS_CONTEXTE'
	);
}

async function leverLeServeur() {
	etape('La base et le serveur, comme en production');
	verifier('la base répond', marche.leverLaBase());
	for (const [quoi, script] of [
		['les rôles sont créés', 'bootstrap-roles.mjs'],
		['les migrations passent', 'migrate.mjs']
	]) {
		const passage = marche.jouer(script);
		verifier(quoi, passage.ok, passage.derniere.slice(0, 120));
	}
	const superAdmin = marche.jouer('super-admin.mjs', ['--email', SUPER_ADMIN]);
	verifier(
		'la commande de l’image crée le super-admin',
		superAdmin.ok,
		superAdmin.derniere.slice(0, 120)
	);

	PORT = await portLibre();
	ORIGINE = `http://localhost:${PORT}`;
	marche.lancerLeServeur(`127.0.0.1:${PORT}:3000`, { ORIGIN: ORIGINE });
	serveurLance = true;
	let code = 0;
	for (let essai = 0; essai < 60 && code !== 200; essai += 1) {
		try {
			code = (await fetch(`http://127.0.0.1:${PORT}/healthz`)).status;
		} catch {
			await attendre(500);
		}
	}
	verifier('le serveur répond', code === 200, `ORIGIN ${ORIGINE}`);
}

/** a. Le super-admin : lien, passkey, organisation, invitation. */
async function superAdmin(navigateur) {
	etape('a. Le super-admin ouvre une organisation et invite une personne');
	const contexte = await navigateur.newContext();
	contexte.setDefaultTimeout(15000);
	const page = await contexte.newPage();
	const passages = [];
	page.on('framenavigated', (cadre) => {
		if (cadre === page.mainFrame()) passages.push(new URL(cadre.url()).pathname);
	});

	const cdp = await contexte.newCDPSession(page);
	await cdp.send('WebAuthn.enable');
	const { authenticatorId } = await cdp.send('WebAuthn.addVirtualAuthenticator', {
		options: {
			protocol: 'ctap2',
			transport: 'internal',
			hasResidentKey: true,
			hasUserVerification: true,
			isUserVerified: true,
			automaticPresenceSimulation: true
		}
	});
	verifier('l’authentificateur virtuel de Chrome est branché', Boolean(authenticatorId));

	await ouvrir(page, '/connexion');
	verifier('la page de connexion s’affiche', (await titre(page)) === 'Se connecter');
	await auditer(page, 'connexion');
	await lireLesConditions(
		page,
		page.getByRole('link', { name: 'Lire les conditions d’utilisation', exact: true }),
		'le lien sous le formulaire'
	);
	await auditer(page, 'conditions');
	await ouvrir(page, '/connexion');
	await lireLesConditions(
		page,
		page.locator('footer').getByRole('link', { name: 'Conditions d’utilisation', exact: true }),
		'le lien du pied commun'
	);

	await ouvrir(page, '/connexion');
	await page.getByLabel('Adresse électronique').fill(SUPER_ADMIN);
	await envoyer(page, page.getByRole('button', { name: 'Recevoir un lien' }));
	verifier(
		'la demande de lien est prise',
		(await texteDe(page.getByRole('status'))).startsWith('Si cette adresse')
	);

	const lien = lienDeConnexion(await attendreCourriel(SUPER_ADMIN, /lien de connexion/));
	verifier('le lien de connexion arrive par courriel', Boolean(lien));
	await ouvrir(page, /** @type {string} */ (lien));
	verifier('le lien ouvre une session', chemin(page) === '/organisations', chemin(page));

	await ouvrir(page, '/super-admin');
	verifier(
		'sans passkey, /super-admin renvoie vers l’écran de la passkey',
		chemin(page) === '/super-admin/passkey',
		chemin(page)
	);
	await auditer(page, 'passkey');
	await page.getByRole('button', { name: 'Enregistrer une passkey' }).click();
	// Le message de l'écran, ou celui de l'échec : « Aucune passkey enregistrée. », déjà là avant le
	// clic, contient les mêmes mots, d'où l'ancre en tête.
	const annonce = page
		.getByRole('status')
		.filter({ hasText: /^(Passkey enregistrée\.|(?!Aucune).+)/ });
	await annonce.first().waitFor();
	const { credentials } = await cdp.send('WebAuthn.getCredentials', { authenticatorId });
	verifier(
		'la passkey est enregistrée, et l’authentificateur la garde',
		(await texteDe(annonce)).startsWith('Passkey enregistrée.') && credentials.length === 1,
		`${await texteDe(annonce)} ; ${credentials.length} dans l’authentificateur`
	);

	await envoyer(page, page.getByRole('button', { name: 'Se connecter avec une passkey' }));
	verifier(
		'la connexion par passkey mène à l’écran du super-admin',
		chemin(page) === '/super-admin' && (await titre(page)) === 'Super-admin',
		chemin(page)
	);
	await auditer(page, 'super-admin');

	await ouvrirEtEntrer(page, ORGANISATION);
	await naviguer(page, 'Membres', '/membres');
	await auditer(page, 'membres');
	await inviter(page, ORGANISATION, 'Responsable', 'responsable');

	// La seconde organisation, où la même personne sera éditrice. La bannière ramène à l'écran du
	// super-admin. La navigation n'a pas de second « Changer d’organisation » : il mènerait au choix
	// d'une personne membre, `/organisations`, et deux liens du même nom vers deux écrans
	// tromperaient.
	const parLaBanniere = page
		.getByRole('status')
		.filter({ hasText: 'pouvoirs de super-admin' })
		.getByRole('link', { name: CHANGER, exact: true });
	verifier(
		`le super-admin garde « ${CHANGER} » dans sa bannière, vers son écran, et la navigation n’en a pas d’autre`,
		(await parLaBanniere.count()) === 1 &&
			(await cheminDuLien(parLaBanniere)) === '/super-admin' &&
			(await navigationDeLEspace(page).count()) === 1 &&
			(await lienChanger(page).count()) === 0,
		`${await parLaBanniere.count()} dans la bannière, ${await lienChanger(page).count()} dans la navigation`
	);
	await suivre(page, parLaBanniere, '/super-admin');
	await ouvrirEtEntrer(page, VOISINE);
	await naviguer(page, 'Membres', '/membres');
	await inviter(page, VOISINE, 'Éditeur', 'éditeur');

	verifier(
		'le super-admin n’est jamais renvoyé vers des conditions à accepter',
		!passages.some((passage) => passage.startsWith('/conditions/accepter')),
		`${passages.length} pages traversées`
	);
	await contexte.close();
}

/** `/conditions`, atteinte par un lien : le document entier, daté, avec sa liste complète. */
async function lireLesConditions(page, lien, quel) {
	await suivre(page, lien, '/conditions');
	const date = await texteDe(page.locator('main p').filter({ hasText: /^Dernière mise à jour/ }));
	const listes = page.locator('main ol');
	const nombreDeListes = await listes.count();
	const elements = nombreDeListes === 1 ? await listes.locator(':scope > li').count() : 0;
	verifier(
		`${quel} mène à /conditions, qui montre le document`,
		(await titre(page)) === 'Conditions d’utilisation' &&
			date === `Dernière mise à jour : ${DATE_DES_CONDITIONS}.` &&
			elements === DONNEES_PERSONNELLES,
		`« ${await titre(page)} », « ${date} », ${nombreDeListes} liste numérotée de ${elements} éléments`
	);
}

/** L'écran du super-admin : ouvrir une organisation, puis entrer dans son espace. */
async function ouvrirEtEntrer(page, organisation) {
	await page.getByLabel('Nom', { exact: true }).fill(organisation.nom);
	await page.getByLabel('Identifiant d’URL').fill(organisation.slug);
	await envoyer(page, page.getByRole('button', { name: 'Ouvrir', exact: true }));
	const carte = page.locator('li').filter({ hasText: organisation.nom });
	verifier(`« ${organisation.nom} » est ouverte`, (await carte.count()) === 1, organisation.slug);

	await envoyer(page, carte.getByRole('button', { name: 'Entrer dans son espace' }));
	const banniere = await texteDe(page.getByRole('status'));
	verifier(
		'il entre dans son espace, et la bannière le lui rappelle',
		chemin(page) === '/' && banniere.includes(organisation.nom),
		banniere
	);
}

/** L'écran Membres : inviter la personne responsable du parcours, avec un rôle. */
async function inviter(page, organisation, role, roleAffiche) {
	// Le rôle du super-admin voit toutes les organisations : l'écran doit nommer celle où il est
	// entré, et non la première venue, ce qu'il faisait dans la seconde avant l'étape 16.
	verifier(
		`l’écran Membres nomme « ${organisation.nom} »`,
		(await titre(page)) === organisation.nom,
		await titre(page)
	);
	await page.getByLabel('Adresse électronique').fill(RESPONSABLE);
	await page.getByLabel('Rôle').selectOption({ label: role });
	await envoyer(page, page.getByRole('button', { name: 'Envoyer l’invitation' }));
	verifier(
		`l’invitation dans « ${organisation.nom} » part`,
		(await texteDe(page.getByRole('status').last())) ===
			'L’invitation a été envoyée à cette adresse.'
	);
	const enAttente = page.locator('li').filter({ hasText: RESPONSABLE });
	verifier(
		`elle attend dans « Invitations en attente », en ${roleAffiche}`,
		(await enAttente.count()) === 1 && (await texteDe(enAttente)).includes(roleAffiche),
		await texteDe(enAttente)
	);
}

const AUTRE_ORGANISATION = 'Choisir une autre organisation';

/**
 * L'écran `/conditions/accepter`, où la porte de l'espace renvoie : le texte entier, sa version, le
 * bouton, et rien de l'espace. Le lien vers le choix d'organisation n'y est que pour qui en a
 * plusieurs : avec une seule, il n'y aurait rien à choisir.
 */
async function ecranDAcceptation(page, organisation, { autresOrganisations }) {
	verifier(
		`elle est renvoyée vers les conditions à accepter de « ${organisation.nom} »`,
		chemin(page) === '/conditions/accepter',
		chemin(page)
	);
	const raison = await texteDe(page.locator('main p').filter({ hasText: /^Avant d’entrer/ }));
	const version = await texteDe(page.locator('main p').filter({ hasText: /^Version du/ }));
	const date = await texteDe(page.locator('main p').filter({ hasText: /^Dernière mise à jour/ }));
	const bouton = page.getByRole('button', {
		name: 'J’accepte les conditions d’utilisation',
		exact: true
	});
	verifier(
		'elle voit le texte entier, sa version et le bouton « J’accepte les conditions d’utilisation »',
		(await titre(page)) === 'Conditions d’utilisation' &&
			raison.includes(`l’espace de ${organisation.nom},`) &&
			version === `Version du ${DATE_DES_CONDITIONS}` &&
			date === `Dernière mise à jour : ${DATE_DES_CONDITIONS}.` &&
			(await page.locator('main ol > li').count()) === DONNEES_PERSONNELLES &&
			(await bouton.count()) === 1,
		version
	);
	verifier(
		'la navigation de l’espace est absente, « Se déconnecter » reste',
		(await navigationDeLEspace(page).count()) === 0 &&
			(await page.getByRole('button', { name: 'Se déconnecter' }).count()) === 1
	);
	const lien = page.getByRole('link', { name: AUTRE_ORGANISATION, exact: true });
	verifier(
		autresOrganisations
			? `avec deux organisations, le lien « ${AUTRE_ORGANISATION} » est là`
			: `avec une seule organisation, pas de lien « ${AUTRE_ORGANISATION} »`,
		(await lien.count()) === (autresOrganisations ? 1 : 0) &&
			(!autresOrganisations || (await cheminDuLien(lien)) === '/organisations')
	);
	return { bouton, lien };
}

/** b. La personne invitée : courriels, lien, deux invitations acceptées, les conditions. */
async function personneInvitee(navigateur) {
	etape(
		'b. La personne invitée se connecte, rejoint ses deux organisations, accepte les conditions'
	);
	const contexte = await navigateur.newContext();
	contexte.setDefaultTimeout(15000);
	const page = await contexte.newPage();

	const invitations = [];
	for (const organisation of [ORGANISATION, VOISINE]) {
		invitations.push(
			await attendreCourriel(RESPONSABLE, new RegExp(`^Invitation à rejoindre ${organisation.nom}`))
		);
	}
	verifier(
		'les deux invitations arrivent par courriel, avec l’adresse de connexion',
		invitations.every((invitation) => invitation?.text.includes(`${ORIGINE}/connexion`)),
		`reçus : ${sujetsRecus(RESPONSABLE)}`
	);

	await ouvrir(page, '/connexion');
	await page.getByLabel('Adresse électronique').fill(RESPONSABLE);
	await envoyer(page, page.getByRole('button', { name: 'Recevoir un lien' }));
	const lien = lienDeConnexion(await attendreCourriel(RESPONSABLE, /lien de connexion/));
	verifier('son lien de connexion arrive par courriel', Boolean(lien));
	await ouvrir(page, /** @type {string} */ (lien));
	verifier(
		'le lien mène au choix d’organisation',
		chemin(page) === '/organisations' && (await titre(page)) === 'Vos organisations',
		chemin(page)
	);
	const recue = page.locator('li').filter({ hasText: ORGANISATION.nom });
	const recueVoisine = page.locator('li').filter({ hasText: VOISINE.nom });
	verifier(
		'les deux invitations reçues y sont, avec leur rôle',
		(await texteDe(recue)).includes(`${ORGANISATION.nom} (responsable)`) &&
			(await texteDe(recueVoisine)).includes(`${VOISINE.nom} (éditeur)`),
		`${await texteDe(recue)} | ${await texteDe(recueVoisine)}`
	);
	await auditer(page, 'choix d’organisation');

	// La première : l'invitation acceptée, la porte renvoie vers les conditions.
	await envoyer(page, recue.getByRole('button', { name: 'Accepter' }));
	const { bouton } = await ecranDAcceptation(page, ORGANISATION, { autresOrganisations: false });
	await auditer(page, 'conditions à accepter');
	await envoyer(page, bouton);
	verifier(
		'après avoir accepté, elle arrive à l’accueil de son espace, et la navigation revient',
		chemin(page) === '/' &&
			(await titre(page)) === 'À venir' &&
			(await navigationDeLEspace(page).count()) === 1,
		chemin(page)
	);
	await ouvrir(page, '/conditions/accepter');
	verifier(
		'revenue sur /conditions/accepter, elle est renvoyée à l’accueil',
		chemin(page) === '/',
		chemin(page)
	);

	// Membre d'une seule organisation, elle a encore la seconde invitation en attente : la
	// navigation la mène au choix d'organisation, où elle l'accepte. Qu'une personne d'une seule
	// organisation sans invitation n'ait pas ce lien, `apps/web/tests/acces.test.ts` le vérifie :
	// personne, dans ce parcours, n'est dans ce cas.
	verifier(
		`avec une seule organisation et une invitation qui attend, elle trouve « ${CHANGER} » dans la navigation, vers le choix`,
		(await lienChanger(page).count()) === 1 &&
			(await cheminDuLien(lienChanger(page))) === '/organisations'
	);
	await naviguer(page, CHANGER, '/organisations');
	const seconde = page.locator('li').filter({ hasText: VOISINE.nom });
	verifier(
		`par ce lien, elle retrouve l’invitation de « ${VOISINE.nom} », à accepter`,
		(await texteDe(seconde)).includes(`${VOISINE.nom} (éditeur)`) &&
			(await seconde.getByRole('button', { name: 'Accepter' }).count()) === 1,
		await texteDe(seconde)
	);

	// Ses conditions l'attendent, parce que l'acceptation vaut pour une organisation, et cette fois
	// le lien vers le choix est là.
	await envoyer(page, seconde.getByRole('button', { name: 'Accepter' }));
	const { lien: autre } = await ecranDAcceptation(page, VOISINE, { autresOrganisations: true });
	await suivre(page, autre, '/organisations');
	await envoyer(page, page.getByRole('button', { name: ORGANISATION.nom, exact: true }));
	verifier(
		`par ce lien, elle revient dans « ${ORGANISATION.nom} », qui ne redemande rien`,
		chemin(page) === '/' && (await page.title()) === `À venir | ${ORGANISATION.nom}`,
		`${chemin(page)} « ${await page.title()} »`
	);

	// Membre de deux organisations, elle trouve « Changer d’organisation » dans la navigation, en
	// responsable ici, puis en éditrice dans la voisine, où elle entre accepter les conditions.
	verifier(
		`membre de deux organisations, elle trouve « ${CHANGER} » dans la navigation, vers le choix`,
		(await lienChanger(page).count()) === 1 &&
			(await cheminDuLien(lienChanger(page))) === '/organisations'
	);
	await naviguer(page, CHANGER, '/organisations');
	await envoyer(page, page.getByRole('button', { name: VOISINE.nom, exact: true }));
	verifier(
		`dans « ${VOISINE.nom} », ses conditions l’attendent encore`,
		chemin(page) === '/conditions/accepter' && (await navigationDeLEspace(page).count()) === 0,
		chemin(page)
	);
	await envoyer(
		page,
		page.getByRole('button', { name: 'J’accepte les conditions d’utilisation', exact: true })
	);
	const liensDeLEditrice = await navigationDeLEspace(page).getByRole('link').allTextContents();
	verifier(
		`éditrice dans « ${VOISINE.nom} », elle trouve « ${CHANGER} » dans la navigation, sans « Membres »`,
		chemin(page) === '/' &&
			(await page.title()) === `À venir | ${VOISINE.nom}` &&
			(await lienChanger(page).count()) === 1 &&
			(await cheminDuLien(lienChanger(page))) === '/organisations' &&
			!liensDeLEditrice.some((texte) => texte.trim() === 'Membres'),
		`« ${await page.title()} » : ${liensDeLEditrice.map((texte) => texte.trim()).join(', ')}`
	);
	await naviguer(page, CHANGER, '/organisations');
	await envoyer(page, page.getByRole('button', { name: ORGANISATION.nom, exact: true }));
	verifier(
		`par ce lien, elle revient en responsable dans « ${ORGANISATION.nom} »`,
		chemin(page) === '/' &&
			(await page.title()) === `À venir | ${ORGANISATION.nom}` &&
			(await navigationDeLEspace(page)
				.getByRole('link', { name: 'Membres', exact: true })
				.count()) === 1,
		`${chemin(page)} « ${await page.title()} »`
	);

	// Une personne déjà connectée qui suit l'adresse de son courriel d'invitation passe par
	// `/connexion`, qui la renvoie au choix d'organisation. De là, elle rentre dans « Centre du
	// Parcours ».
	const adresseDuCourriel = (invitations[1]?.text ?? '')
		.split(/\s+/)
		.find((mot) => mot.startsWith(`${ORIGINE}/connexion`));
	await ouvrir(page, adresseDuCourriel ?? '/connexion');
	verifier(
		'une fois connectée, elle suit l’adresse de son second courriel d’invitation et arrive au choix d’organisation',
		Boolean(adresseDuCourriel) && chemin(page) === '/organisations',
		`${adresseDuCourriel ?? 'adresse absente du courriel'} : ${chemin(page)}`
	);
	await envoyer(page, page.getByRole('button', { name: ORGANISATION.nom, exact: true }));
	verifier(
		`de là, elle rentre dans « ${ORGANISATION.nom} »`,
		chemin(page) === '/' && (await page.title()) === `À venir | ${ORGANISATION.nom}`,
		`${chemin(page)} « ${await page.title()} »`
	);
	return { contexte, page };
}

/** Un cours saisi comme une personne le saisit : écran par écran, champ par champ. */
async function creerCours(page, cours) {
	await naviguer(page, 'Cours', '/cours');
	await page.getByRole('link', { name: 'Nouveau cours' }).click();
	await page.waitForURL((adresse) => adresse.pathname === '/cours/nouveau');
	await page.waitForLoadState('networkidle');
	if (cours.auditer) await auditer(page, 'nouveau cours');

	await page.getByLabel(/^Titre \(français\)/).fill(cours.titre);
	if (cours.titreArabe) {
		await page.getByRole('tab', { name: /arabe/ }).click();
		await page.getByLabel(/^Titre \(arabe\)/).fill(cours.titreArabe);
		await page.getByRole('tab', { name: /français/ }).click();
	}
	await page.getByLabel('Public', { exact: true }).selectOption({ label: cours.public });
	for (const [index, nom] of JOURS.entries()) {
		const caseDuJour = page.getByRole('checkbox', { name: nom, exact: true });
		if (index + 1 === cours.jour) await caseDuJour.check();
		else await caseDuJour.uncheck();
	}
	if (cours.ancre) {
		await page.locator('#timingKind').selectOption({ label: 'après une prière' });
		await page.getByLabel('Prière', { exact: true }).selectOption(cours.ancre.priere);
		await page.getByLabel(/^Décalage/).fill(String(cours.ancre.decalage));
		await page.getByLabel(/^Durée/).fill(String(cours.ancre.duree));
	} else {
		await page.getByLabel('Début', { exact: true }).fill(cours.debut);
		await page.getByLabel('Fin', { exact: true }).fill(cours.fin);
	}
	await page.getByLabel('Salle', { exact: true }).selectOption({ label: SALLE });
	await page.getByLabel('Premier jour', { exact: true }).fill(T);
	await page.getByLabel('État', { exact: true }).selectOption({ label: cours.etat });
	await envoyer(page, page.getByRole('button', { name: 'Créer le cours' }));

	const ligne = page.locator('li').filter({ hasText: cours.titre });
	verifier(
		`« ${cours.titre} » est créé, ${cours.etat}, le ${JOURS[cours.jour - 1]}`,
		chemin(page) === '/cours' && (await texteDe(ligne)).includes(cours.etat),
		await texteDe(ligne)
	);
	const modifier = await ligne.getByRole('link', { name: 'Modifier' }).getAttribute('href');
	return (modifier ?? '').split('/').pop() ?? '';
}

/** La séance d'un cours un jour donné, sur l'accueil de l'espace. */
function seanceDuJour(page, date, titreDuCours) {
	return page
		.locator('section', { has: page.locator(`[id="jour-${date}"]`) })
		.locator('li')
		.filter({ hasText: titreDuCours });
}

/** c. Salle, deux cours, une séance annulée, une séance déplacée, publication. */
async function programme(page) {
	etape('c. Elle crée une salle et deux cours, annule une séance, en déplace une, publie');
	await naviguer(page, 'Réglages', '/reglages');
	await auditer(page, 'réglages');
	for (const langue of ['allemand', 'italien', 'arabe']) {
		await page.getByRole('checkbox', { name: langue, exact: true }).check();
	}
	await envoyer(page, page.getByRole('button', { name: 'Enregistrer', exact: true }));
	verifier(
		'les quatre langues sont activées',
		(await texteDe(page.getByRole('status'))) === 'Réglages enregistrés.'
	);
	await page.getByLabel('Nouvelle salle').fill(SALLE);
	await envoyer(page, page.getByRole('button', { name: 'Ajouter', exact: true }));
	const salles = page.locator('section', { has: page.locator('#salles-titre') }).locator('li');
	verifier('la salle est créée', (await texteDe(salles)).startsWith(SALLE), await texteDe(salles));

	etat.cours1 = await creerCours(page, {
		titre: COURS_1.fr,
		titreArabe: COURS_1.ar,
		public: 'enfants',
		jour: jourDeSemaine(J1),
		debut: '18:00',
		fin: '19:00',
		etat: 'publié',
		auditer: true
	});
	etat.cours2 = await creerCours(page, {
		titre: COURS_2,
		public: 'adultes',
		jour: jourDeSemaine(J2),
		debut: '20:00',
		fin: '21:30',
		etat: 'brouillon'
	});
	await auditer(page, 'cours');

	await naviguer(page, 'À venir', '/');
	const premiere = seanceDuJour(page, J1, COURS_1.fr);
	verifier(`la séance du ${J1} est à l’accueil de l’espace`, (await premiere.count()) === 1);
	const deplier = premiere.getByRole('button', { name: 'Annuler ou déplacer' });
	await deplier.click();
	verifier(
		'« Annuler ou déplacer » déplie les deux choix',
		(await deplier.getAttribute('aria-expanded')) === 'true'
	);
	await envoyer(page, premiere.getByRole('button', { name: 'Annuler cette séance' }));
	verifier(
		`la séance du ${J1} est annulée, et peut être rétablie`,
		(await texteDe(premiere)).includes('annulée') &&
			(await premiere.getByRole('button', { name: 'Rétablir' }).count()) === 1,
		await texteDe(premiere.locator('.titre'))
	);

	const seconde = seanceDuJour(page, J2, COURS_2);
	verifier(`la séance du ${J2} est à l’accueil de l’espace`, (await seconde.count()) === 1);
	await seconde.getByRole('button', { name: 'Annuler ou déplacer' }).click();
	await seconde.getByLabel('Déplacer au').selectOption(J3);
	await seconde.getByLabel('à', { exact: true }).fill('20:30');
	await envoyer(page, seconde.getByRole('button', { name: 'Déplacer', exact: true }));
	verifier(
		`la séance du ${J2} est marquée déplacée`,
		(await texteDe(seconde)).includes('déplacée') &&
			(await texteDe(seconde)).includes('Déplacée au'),
		await texteDe(seconde.locator('.details').last())
	);
	const arrivee = seanceDuJour(page, J3, COURS_2);
	verifier(
		`elle apparaît le ${J3}, en date exceptionnelle`,
		(await texteDe(arrivee)).includes('date exceptionnelle'),
		await texteDe(arrivee.locator('.details').last())
	);
	await auditer(page, 'accueil de l’espace');

	// Publier le second cours : c'est le champ « État » de sa fiche.
	await naviguer(page, 'Cours', '/cours');
	await page
		.locator('li')
		.filter({ hasText: COURS_2 })
		.getByRole('link', { name: 'Modifier' })
		.click();
	await page.waitForURL((adresse) => adresse.pathname === `/cours/${etat.cours2}`);
	await page.waitForLoadState('networkidle');
	verifier(
		'sa fiche s’ouvre',
		(await titre(page)) === `Modifier « ${COURS_2} »`,
		await titre(page)
	);
	await auditer(page, 'un cours');
	await page.getByLabel('État', { exact: true }).selectOption({ label: 'publié' });
	await envoyer(page, page.getByRole('button', { name: 'Enregistrer', exact: true }));
	const ligne = page.locator('li').filter({ hasText: COURS_2 });
	verifier(
		`« ${COURS_2} » est publié`,
		(await texteDe(ligne)).includes('publié'),
		await texteDe(ligne.locator('.titre'))
	);

	await naviguer(page, 'Partager', '/partager');
	await auditer(page, 'partager');
	etat.codeEmbarque = await page.getByLabel('Code à coller', { exact: true }).inputValue();
	verifier(
		'l’écran Partager donne le code du widget',
		etat.codeEmbarque.includes(`${ORIGINE}/widget/jadwal-widget.js`) &&
			etat.codeEmbarque.includes(`<jadwal-widget org="${ORGANISATION.slug}">`)
	);
	etat.codeCadre = await page.getByLabel('Cadre à coller à la main', { exact: true }).inputValue();
	verifier(
		'l’écran Partager donne le cadre à coller à la main, sans embed=1',
		etat.codeCadre.includes(`<iframe src="${ORIGINE}/m/${ORGANISATION.slug}"`),
		etat.codeCadre.split('\n')[0]
	);
}

/** Les deux cours tels qu'une page publique les montre : ce qu'on voit, barré ou non. */
async function seancesPubliques(page, titreDuCours) {
	const lignes = page
		.locator('li')
		.filter({ has: page.getByRole('link', { name: titreDuCours, exact: true }) });
	const vues = [];
	for (let index = 0; index < (await lignes.count()); index += 1) {
		const ligne = lignes.nth(index);
		const barree = await ligne
			.getByRole('link', { name: titreDuCours, exact: true })
			.evaluate((lien) => getComputedStyle(lien).textDecorationLine.includes('line-through'));
		// Une séance ordinaire ne porte aucune mention : on ne l'attend pas.
		const mention =
			(await ligne.locator('.marque').count()) > 0 ? await texteDe(ligne.locator('.marque')) : '';
		vues.push({ barree, mention, texte: await texteDe(ligne) });
	}
	return vues;
}

function sansChiffresOrientaux(html, ou) {
	const trouves = [...new Set(html.match(CHIFFRES_ORIENTAUX) ?? [])];
	verifier(`${ou} : aucun chiffre arabe oriental`, trouves.length === 0, trouves.join(' '));
}

/** Le numéro du jour d'une date ISO, tel qu'une date longue l'écrit : `25`, en chiffres latins. */
const numeroDuJour = (iso) => new RegExp(`(^|\\D)${Number(iso.slice(8, 10))}(\\D|$)`);

/**
 * La balise `<html>` elle-même : c'est elle qui dit à un lecteur d'écran la langue du titre de
 * l'onglet et de tout ce qui n'est pas dans le bloc de la page.
 */
async function verifierLaBaliseHtml(page, adresse, langue) {
	const racineDuDocument = page.locator('html');
	const lang = await racineDuDocument.getAttribute('lang');
	const dir = await racineDuDocument.getAttribute('dir');
	const dirAttendu = langue === 'ar' ? 'rtl' : 'ltr';
	verifier(
		`${adresse} : <html lang="${langue}" dir="${dirAttendu}">`,
		lang === langue && dir === dirAttendu,
		`<html lang="${lang}" dir="${dir}">`
	);
}

/**
 * Le lien des conditions au pied d'une page publique, trouvé par son nom accessible entier, annonce
 * du nouvel onglet comprise : sa cible, sa langue, et ce que l'œil voit de l'annonce.
 */
async function lienDesConditions(cadre, langue) {
	const lien = cadre.locator('footer').getByRole('link', {
		name: avecNouvelOnglet(TEXTES_PUBLICS[langue].conditions, langue),
		exact: true
	});
	const nombre = await lien.count();
	return {
		nombre,
		chemin: nombre === 1 ? await cheminDuLien(lien) : '',
		hreflang: nombre === 1 ? await lien.getAttribute('hreflang') : null,
		target: nombre === 1 ? await lien.getAttribute('target') : null,
		rel: nombre === 1 ? await lien.getAttribute('rel') : null,
		annonce: nombre === 1 ? await boiteDeLAnnonce(lien, langue) : { cachee: false, taille: '' }
	};
}

/** d. La page publique, dans les quatre langues. */
async function pagesPubliques(page) {
	etape('d. La page publique, dans les quatre langues');
	for (const langue of ['fr', 'de', 'it', 'ar']) {
		const adresse = `/m/${ORGANISATION.slug}${langue === 'fr' ? '' : `/${langue}`}`;
		const textes = TEXTES_PUBLICS[langue];
		const reponse = await ouvrir(page, adresse);
		const racineDePage = page.locator('div[lang]').first();
		const lang = await racineDePage.getAttribute('lang');
		const dir = await racineDePage.getAttribute('dir');
		const dirAttendu = langue === 'ar' ? 'rtl' : 'ltr';
		verifier(
			`${adresse} s’affiche, lang="${langue}" dir="${dirAttendu}"`,
			reponse?.status() === 200 && lang === langue && dir === dirAttendu,
			`rendu ${reponse?.status()}, lang="${lang}" dir="${dir}"`
		);
		await verifierLaBaliseHtml(page, adresse, langue);
		const titre1 = langue === 'ar' ? COURS_1.ar : COURS_1.fr;
		const premier = await seancesPubliques(page, titre1);
		const second = await seancesPubliques(page, COURS_2);
		verifier(
			`${adresse} : les deux cours y sont`,
			premier.length > 0 && second.length > 0,
			`${titre1}, ${COURS_2}`
		);
		verifier(
			`${adresse} : la séance annulée reste visible, barrée, avec sa mention`,
			premier.length === 1 && premier[0].barree && premier[0].mention.length > 0,
			premier.map((vue) => vue.mention).join(' | ')
		);
		const depart = second.find((vue) => vue.barree);
		const arrivee = second.find((vue) => !vue.barree);
		// Au départ, la mention dit où va la séance ; à l'arrivée, la marque dit « date
		// exceptionnelle » et le détail d'où elle vient. Chacune avec le jour, en chiffres latins.
		const phraseDArrivee = arrivee?.texte.slice(arrivee.texte.indexOf(textes.arrivee)) ?? '';
		verifier(
			`${adresse} : le déplacement se voit au départ et à l’arrivée`,
			second.length === 2 &&
				Boolean(depart?.mention.startsWith(textes.depart)) &&
				numeroDuJour(J3).test(depart?.mention ?? '') &&
				Boolean(arrivee?.mention) &&
				arrivee?.texte.includes(textes.arrivee) === true &&
				numeroDuJour(J2).test(phraseDArrivee),
			`${depart?.mention ?? 'départ absent'} | ${arrivee?.mention ?? 'arrivée absente'} · ${phraseDArrivee}`
		);
		// Un nouvel onglet ici aussi : la même adresse, sans `embed=1`, est celle du cadre que
		// l'écran Partager donne à coller à la main, et `/conditions` refuse d'être encadrée. Le
		// lien le dit aux lecteurs d'écran, dans la langue de la page, et à eux seuls.
		const nomAttendu = avecNouvelOnglet(textes.conditions, langue);
		const nomsSelonChrome = await nomsDesLiensSelonChrome(page);
		const conditions = await lienDesConditions(page, langue);
		verifier(
			`${adresse} : le nom accessible du lien des conditions est « ${nomAttendu} », selon playwright et selon Chrome, et l’annonce est cachée aux yeux`,
			conditions.nombre === 1 && nomsSelonChrome.includes(nomAttendu) && conditions.annonce.cachee,
			`Chrome : ${
				nomsSelonChrome.filter((nom) => nom.startsWith(textes.conditions)).join(' | ') ||
				'aucun lien de ce nom'
			} ; playwright : ${conditions.nombre} lien ; annonce ${conditions.annonce.taille}`
		);
		verifier(
			`${adresse} : le pied porte ce lien, vers /conditions, dans un nouvel onglet`,
			conditions.nombre === 1 &&
				conditions.chemin === '/conditions' &&
				conditions.hreflang === 'fr' &&
				conditions.target === '_blank' &&
				(conditions.rel ?? '').split(' ').includes('noopener'),
			`${conditions.nombre} lien, ${conditions.chemin}, hreflang="${conditions.hreflang}", ` +
				`target="${conditions.target}" rel="${conditions.rel}"`
		);
		if (langue === 'ar') sansChiffresOrientaux(await page.content(), adresse);
	}

	for (const langue of ['fr', 'ar']) {
		const base = `/m/${ORGANISATION.slug}${langue === 'fr' ? '' : '/ar'}`;
		for (const [vue, requete] of [
			['semaine', ''],
			['cours', '?vue=cours'],
			['mois', '?vue=mois']
		]) {
			await ouvrir(page, `${base}${requete}`);
			if (langue === 'ar' && vue !== 'semaine')
				sansChiffresOrientaux(await page.content(), `${base}${requete}`);
			await auditer(page, `page publique ${langue}, vue ${vue}`);
		}
		const reponse = await ouvrir(page, `${base}/cours/${etat.cours1}`);
		verifier(`${base}/cours/<id> s’affiche`, reponse?.status() === 200, await titre(page));
		if (langue === 'ar') {
			await verifierLaBaliseHtml(page, `${base}/cours/<id>`, langue);
			sansChiffresOrientaux(await page.content(), `${base}/cours/<id>`);
		}
		await auditer(page, `page d’un cours ${langue}`);
		const abonnement = await ouvrir(page, `${base}/agenda`);
		verifier(`${base}/agenda s’affiche`, abonnement?.status() === 200, await titre(page));
		if (langue === 'ar') {
			await verifierLaBaliseHtml(page, `${base}/agenda`, langue);
			sansChiffresOrientaux(await page.content(), `${base}/agenda`);
		}
		await auditer(page, `page d’abonnement ${langue}`);
	}
}

/**
 * e. Le widget, sur une page d'une autre origine, servie par ce script. Puis le cadre posé à la
 * main, sur une seconde page du même site.
 */
async function widget(page) {
	etape('e. Le widget, posé sur le site d’une organisation');
	const html =
		'<!doctype html>\n<html lang="fr">\n<head>\n<meta charset="utf-8">\n' +
		'<meta name="viewport" content="width=device-width, initial-scale=1">\n' +
		'<title>Le site d’une organisation</title>\n</head>\n<body>\n<main>\n' +
		`<h1>Notre programme</h1>\n${etat.codeEmbarque}\n</main>\n</body>\n</html>\n`;
	// Le même site, avec le cadre posé à la main que donne aussi l'écran Partager, pour un site qui
	// refuse tout script extérieur (`docs/INTEGRATION.md`).
	// Une fonction, et non une chaîne : `replace` lirait un `$` du code collé comme un motif.
	const htmlCadre = html.replace(etat.codeEmbarque, () => etat.codeCadre);
	const hote = createServer((requete, reponse) => {
		if (requete.url === '/' || requete.url === '/cadre') {
			reponse.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
			reponse.end(requete.url === '/' ? html : htmlCadre);
		} else {
			reponse.writeHead(404);
			reponse.end();
		}
	});
	await new Promise((resolue) => hote.listen(0, '127.0.0.1', () => resolue(undefined)));
	try {
		const { port } = /** @type {import('node:net').AddressInfo} */ (hote.address());
		const origineHote = `http://127.0.0.1:${port}`;
		await ouvrir(page, `${origineHote}/`);
		verifier(
			'la page d’essai est servie sur une autre origine',
			new URL(page.url()).origin !== ORIGINE,
			origineHote
		);

		let cadre;
		for (let essai = 0; essai < 60 && !cadre; essai += 1) {
			cadre = page.frames().find((f) => f.url().startsWith(`${ORIGINE}/m/${ORGANISATION.slug}`));
			if (!cadre) await attendre(250);
		}
		verifier(
			'le widget pose son cadre',
			Boolean(cadre),
			cadre ? new URL(cadre.url()).pathname + new URL(cadre.url()).search : ''
		);
		const encadree = /** @type {import('playwright-core').Frame} */ (cadre);
		await encadree.waitForLoadState('load');
		const texte = await encadree.locator('body').innerText();
		verifier(
			'le cadre montre les deux cours',
			texte.includes(COURS_1.fr) && texte.includes(COURS_2),
			`${COURS_1.fr}, ${COURS_2}`
		);

		let mesure = { cadre: 0, contenu: 0 };
		for (let essai = 0; essai < 40; essai += 1) {
			mesure = {
				cadre: await page.evaluate(
					() =>
						document
							.querySelector('jadwal-widget')
							?.shadowRoot?.querySelector('iframe')
							?.getBoundingClientRect().height ?? 0
				),
				contenu: await encadree.evaluate(
					() => document.documentElement.getBoundingClientRect().height
				)
			};
			if (Math.abs(mesure.cadre - Math.max(mesure.contenu, HAUTEUR_INITIALE_DU_CADRE)) <= 2) break;
			await attendre(250);
		}
		verifier(
			'le cadre a pris la hauteur de son contenu',
			mesure.cadre > 0 &&
				Math.abs(mesure.cadre - Math.max(mesure.contenu, HAUTEUR_INITIALE_DU_CADRE)) <= 2,
			`cadre ${Math.round(mesure.cadre)} px, contenu ${Math.round(mesure.contenu)} px, ${HAUTEUR_INITIALE_DU_CADRE} px au départ`
		);
		// Sous le cadre, le lien vers la page publique ouvre un nouvel onglet : il le dit aux lecteurs
		// d'écran. Il vit dans le shadow root du widget, que Chrome et playwright traversent.
		const nomDuLienDuWidget = avecNouvelOnglet(LIEN_DU_WIDGET, 'fr');
		const lienDuWidget = page
			.locator('jadwal-widget')
			.getByRole('link', { name: nomDuLienDuWidget, exact: true });
		const nombreDeLiensDuWidget = await lienDuWidget.count();
		const nomsSurLHote = await nomsDesLiensSelonChrome(page);
		const annonceDuWidget =
			nombreDeLiensDuWidget === 1
				? await boiteDeLAnnonce(lienDuWidget, 'fr')
				: { cachee: false, taille: '' };
		verifier(
			`le nom accessible du lien du widget est « ${nomDuLienDuWidget} », selon playwright et selon Chrome, et l’annonce est cachée aux yeux`,
			nombreDeLiensDuWidget === 1 &&
				nomsSurLHote.includes(nomDuLienDuWidget) &&
				annonceDuWidget.cachee &&
				(await lienDuWidget.getAttribute('target')) === '_blank' &&
				(await cheminDuLien(lienDuWidget)) === `/m/${ORGANISATION.slug}`,
			`Chrome : ${nomsSurLHote.join(' | ') || 'aucun lien'} ; playwright : ${nombreDeLiensDuWidget} lien ; annonce ${annonceDuWidget.taille}`
		);

		// `/conditions` refuse d'être encadrée : dans le cadre, le lien doit ouvrir un nouvel onglet.
		const conditions = await lienDesConditions(encadree, 'fr');
		verifier(
			'dans le cadre, le lien des conditions s’ouvre dans un nouvel onglet',
			conditions.nombre === 1 &&
				conditions.chemin === '/conditions' &&
				conditions.target === '_blank' &&
				(conditions.rel ?? '').split(' ').includes('noopener'),
			`target="${conditions.target}" rel="${conditions.rel}"`
		);
		await auditer(page, 'page hôte du widget', { iframes: false });
		await auditer(encadree, `page encadrée (/m/${ORGANISATION.slug}?embed=1)`);

		// Le cadre posé à la main charge la page publique sans `embed=1`. Le lien des conditions doit
		// y ouvrir un nouvel onglet, et non charger dans le cadre une page qui refuse d'être encadrée.
		await ouvrir(page, `${origineHote}/cadre`);
		const adresseDuCadre = `${ORIGINE}/m/${ORGANISATION.slug}`;
		let manuel;
		for (let essai = 0; essai < 60 && !manuel; essai += 1) {
			manuel = page.frames().find((f) => f.url() === adresseDuCadre);
			if (!manuel) await attendre(250);
		}
		verifier('le cadre posé à la main montre la page publique', Boolean(manuel), adresseDuCadre);
		const cadreManuel = /** @type {import('playwright-core').Frame} */ (manuel);
		await cadreManuel.waitForLoadState('load');
		const lienManuel = await lienDesConditions(cadreManuel, 'fr');
		verifier(
			'dans le cadre posé à la main, le lien des conditions s’ouvre dans un nouvel onglet',
			lienManuel.nombre === 1 &&
				lienManuel.chemin === '/conditions' &&
				lienManuel.target === '_blank' &&
				(lienManuel.rel ?? '').split(' ').includes('noopener'),
			`target="${lienManuel.target}" rel="${lienManuel.rel}"`
		);
		const [onglet] = await Promise.all([
			page.context().waitForEvent('page'),
			cadreManuel
				.locator('footer')
				.getByRole('link', {
					name: avecNouvelOnglet(TEXTES_PUBLICS.fr.conditions, 'fr'),
					exact: true
				})
				.click()
		]);
		await onglet.waitForLoadState('load');
		const titreDeLOnglet = await titre(onglet);
		verifier(
			'le clic ouvre /conditions dans un onglet à part, et le cadre garde le programme',
			chemin(onglet) === '/conditions' &&
				titreDeLOnglet === 'Conditions d’utilisation' &&
				cadreManuel.url() === adresseDuCadre,
			`onglet ${chemin(onglet)} « ${titreDeLOnglet} », cadre ${new URL(cadreManuel.url()).pathname}`
		);
		await onglet.close();
	} finally {
		await new Promise((resolue) => hote.close(() => resolue(undefined)));
	}
}

/**
 * Le flux agenda, déplié, rangé en événements. Sa langue passe par `?lang=`, comme l'adresse que
 * donne la page d'abonnement (`apps/web/src/lib/public/liens.ts`).
 */
async function fluxAgenda(langue) {
	const requete = langue ? `?lang=${langue}` : '';
	const reponse = await fetch(
		`http://127.0.0.1:${PORT}/m/${ORGANISATION.slug}/agenda.ics${requete}`
	);
	const texte = (await reponse.text()).replace(/\r\n[ \t]/g, '');
	const evenements = texte
		.split('BEGIN:VEVENT')
		.slice(1)
		.map((bloc) => (bloc.split('END:VEVENT')[0] ?? '').split('\r\n').filter(Boolean));
	return { statut: reponse.status, texte, evenements };
}

const champ = (evenement, nom) =>
	evenement.filter((ligne) => ligne.startsWith(`${nom}:`) || ligne.startsWith(`${nom};`));

/** f. Le flux agenda : les deux cours, la semaine annulée, la séance déplacée. */
async function agenda() {
	etape('f. Le flux agenda');
	const { statut, evenements } = await fluxAgenda();
	verifier(
		`/m/${ORGANISATION.slug}/agenda.ics rend 200`,
		statut === 200,
		`${evenements.length} événements`
	);
	const serie1 = evenements.find(
		(evenement) =>
			evenement.includes(`SUMMARY:${COURS_1.fr}`) && champ(evenement, 'RRULE').length > 0
	);
	verifier('le premier cours y est, avec sa règle de récurrence', Boolean(serie1));
	const exdate = champ(serie1 ?? [], 'EXDATE');
	verifier(
		`son EXDATE est la semaine annulée (${J1})`,
		exdate.some((ligne) => ligne.includes(compacte(J1))),
		exdate.join(' ')
	);
	const second = evenements.filter((evenement) => evenement.includes(`SUMMARY:${COURS_2}`));
	verifier(
		'le second cours y est, avec sa règle de récurrence',
		second.some((evenement) => champ(evenement, 'RRULE').length > 0)
	);
	const deplace = second.find((evenement) =>
		champ(evenement, 'RECURRENCE-ID').some((ligne) => ligne.includes(compacte(J2)))
	);
	verifier(
		`la séance déplacée a son RECURRENCE-ID (${J2}) et sa nouvelle date (${J3})`,
		Boolean(deplace) &&
			champ(deplace ?? [], 'DTSTART').some((ligne) => ligne.includes(`${compacte(J3)}T2030`)),
		deplace
			? [...champ(deplace, 'RECURRENCE-ID'), ...champ(deplace, 'DTSTART')].join(' ')
			: 'absente'
	);
}

/** g. Le module de prière, une position, deux cours ancrés, avec et sans décalage, leur heure. */
async function prieres(page, navigateur) {
	etape('g. Le module de prière et deux cours ancrés, avec et sans décalage');
	await naviguer(page, 'Réglages', '/reglages');
	await envoyer(page, page.getByRole('button', { name: 'Allumer le module' }));
	const navigation = page.getByRole('navigation', { name: 'Espace des responsables' });
	verifier(
		'le module est allumé, et la navigation propose Prières et Vendredi',
		(await texteDe(page.getByRole('status'))) === 'Module mis à jour.' &&
			(await navigation.getByRole('link', { name: 'Prières', exact: true }).count()) === 1 &&
			(await navigation.getByRole('link', { name: 'Vendredi', exact: true }).count()) === 1
	);

	await naviguer(page, 'Prières', '/prieres');
	const calcul = page.locator('form').filter({ has: page.locator('#latitude') });
	await calcul.getByLabel('Latitude').fill(POSITION.latitude);
	await calcul.getByLabel('Longitude').fill(POSITION.longitude);
	await calcul
		.getByLabel('Source que vous déclarez')
		.selectOption({ label: 'Je m’en remets au calcul' });
	await envoyer(page, calcul.getByRole('button', { name: 'Enregistrer', exact: true }));
	const confirmation = await texteDe(page.getByRole('status'));
	verifier(
		`la position de ${POSITION.lieu} est enregistrée`,
		confirmation.startsWith('Réglages enregistrés.'),
		confirmation
	);
	const servies = page
		.locator('section', { has: page.locator('#servies-titre') })
		.locator('tbody tr');
	verifier(
		'les heures des sept prochains jours sont calculées',
		(await servies.count()) === 7,
		(await servies.first().innerText()).replace(/\s+/g, ' ')
	);
	await auditer(page, 'prières');

	await naviguer(page, 'Vendredi', '/vendredi');
	verifier('l’écran du vendredi s’ouvre', (await titre(page)) === 'Prière du vendredi');
	await auditer(page, 'vendredi');

	await creerCours(page, {
		titre: COURS_ANCRE,
		public: 'ouvert à tous',
		jour: jourDeSemaine(J4),
		ancre: { priere: 'maghrib', decalage: 15, duree: 60 },
		etat: 'publié'
	});
	await creerCours(page, {
		titre: COURS_SANS_DECALAGE,
		public: 'ouvert à tous',
		jour: jourDeSemaine(J5),
		ancre: { priere: 'maghrib', decalage: 0, duree: 45 },
		etat: 'publié'
	});

	// Un visiteur neuf : la page publique se garde deux minutes en cache (`CACHE_PROGRAMME`), et celui
	// de l'étape d relirait sa copie d'avant les cours ancrés. C'est voulu, et ce n'est pas l'objet
	// ici.
	const neuf = await navigateur.newContext();
	neuf.setDefaultTimeout(15000);
	const visiteur = await neuf.newPage();
	for (const langue of ['fr', 'ar']) {
		const adresse = `/m/${ORGANISATION.slug}${langue === 'fr' ? '' : '/ar'}`;
		await ouvrir(visiteur, adresse);
		for (const ancrage of ANCRAGES) {
			const [seance] = await seancesPubliques(visiteur, ancrage.titre);
			const heure = seance
				? await texteDe(visiteur.locator('li').filter({ hasText: ancrage.titre }).locator('.heure'))
				: '';
			verifier(
				`${adresse} : « ${ancrage.titre} » affiche son heure`,
				ancrage.heure[langue].test(heure),
				heure
			);
		}
		if (langue === 'ar') sansChiffresOrientaux(await visiteur.content(), adresse);
	}

	// Le flux dit la phrase de la page, décalage nul compris.
	for (const langue of ['fr', 'ar']) {
		const { texte, evenements } = await fluxAgenda(langue === 'fr' ? undefined : langue);
		for (const ancrage of ANCRAGES) {
			const ancres = evenements.filter((evenement) =>
				evenement.some((ligne) => ligne.startsWith('SUMMARY:') && ligne.includes(ancrage.titre))
			);
			const description = ancres.flatMap((evenement) => champ(evenement, 'DESCRIPTION'))[0] ?? '';
			verifier(
				`le flux agenda${langue === 'fr' ? '' : ` (?lang=${langue})`} dit « ${ancrage.libelle[langue]} » pour « ${ancrage.titre} », comme la page`,
				ancres.length > 0 && description === `DESCRIPTION:${ancrage.libelle[langue]}`,
				description.slice(0, 60)
			);
		}
		if (langue === 'ar') sansChiffresOrientaux(texte, `le flux agenda (?lang=${langue})`);
	}
}

/**
 * h. Une organisation qui n'existe pas. Le 404 parle la langue de l'adresse, `<html>` compris, et
 * ne porte aucun script : `/m/` n'en a jamais, erreur comprise. Le HTML est lu brut, tel que le
 * serveur l'envoie ; le texte, dans le navigateur, qui le montre aussi à axe.
 */
async function organisationInconnue(page) {
	etape('h. Une organisation inconnue : un 404 dans la langue de l’adresse, sans script');
	for (const langue of ['fr', 'ar']) {
		const adresse = `/m/${INCONNUE}${langue === 'fr' ? '' : `/${langue}`}`;
		const dirAttendu = langue === 'ar' ? 'rtl' : 'ltr';
		const brut = await fetch(`http://127.0.0.1:${PORT}${adresse}`);
		const html = await brut.text();
		const balise = /<html\b[^>]*>/i.exec(html)?.[0] ?? 'aucune balise <html>';
		const scripts = html.match(/<script\b/gi)?.length ?? 0;
		verifier(
			`${adresse} rend 404, avec <html lang="${langue}" dir="${dirAttendu}"> et aucune balise script`,
			brut.status === 404 &&
				balise === `<html lang="${langue}" dir="${dirAttendu}">` &&
				scripts === 0,
			`rendu ${brut.status}, ${balise}, ${scripts} balise(s) script`
		);

		const reponse = await ouvrir(page, adresse);
		const attendu = INTROUVABLE[langue];
		const phrase = await texteDe(page.locator('main p'));
		verifier(
			`${adresse} : la page d’erreur dit « ${attendu.titre} » et « ${attendu.phrase} »`,
			reponse?.status() === 404 &&
				(await page.title()) === attendu.titre &&
				(await titre(page)) === attendu.titre &&
				phrase === attendu.phrase,
			`« ${await page.title()} », « ${await titre(page)} », « ${phrase} »`
		);
		await auditer(page, `404 d’une organisation inconnue, ${langue}`);
	}
}

// ---------------------------------------------------------------------------------------------
// Le déroulé
// ---------------------------------------------------------------------------------------------

let navigateur;

function nettoyer() {
	marche.nettoyer();
	if (!IMAGE_DONNEE) spawnSync('docker', ['image', 'rm', '-f', IMAGE], { stdio: 'ignore' });
}

process.on('exit', nettoyer);
process.on('SIGINT', () => process.exit(130));

let echoue = false;
try {
	preparerLImage();
	await leverLeServeur();

	etape('Le navigateur');
	navigateur = await chromium.launch({ executablePath: chrome(), headless: true });
	verifier('Chrome démarre', true, navigateur.version());

	await superAdmin(navigateur);
	const { page } = await personneInvitee(navigateur);
	await programme(page);

	const visiteurs = await navigateur.newContext();
	visiteurs.setDefaultTimeout(15000);
	const visiteur = await visiteurs.newPage();
	await pagesPubliques(visiteur);
	await widget(visiteur);
	await agenda();
	await prieres(page, navigateur);
	await organisationInconnue(visiteur);
} catch (erreur) {
	echoue = true;
	if (!(erreur instanceof Echec)) {
		process.stdout.write(`\n  NON  ${erreur instanceof Error ? erreur.message : String(erreur)}\n`);
	}
	if (pageCourante) {
		process.stdout.write(`\nLa page regardée : ${pageCourante.url()}\n`);
		const visible = await pageCourante
			.locator('body')
			.innerText()
			.catch(() => '');
		for (const ligne of visible.split('\n').filter(Boolean).slice(0, 15)) {
			process.stdout.write(`      ${ligne}\n`);
		}
	}
	if (serveurLance) {
		process.stdout.write(`\nLes dernières lignes du serveur :\n`);
		for (const ligne of dernieresLignesDuServeur()) process.stdout.write(`      ${ligne}\n`);
	}
} finally {
	await navigateur?.close();
}

const graves = trouvaillesAxe.filter((trouvaille) => GRAVES.has(trouvaille.impact));
etape(`axe, sur ${pagesAuditees.length} pages`);
if (pagesAuditees.length === 0) {
	process.stdout.write('  aucune page n’a été auditée\n');
} else if (trouvaillesAxe.length === 0) {
	process.stdout.write('  rien à signaler\n');
} else {
	const parRegle = new Map();
	for (const trouvaille of trouvaillesAxe) {
		const cle = `[${trouvaille.impact}] ${trouvaille.regle} : ${trouvaille.aide}`;
		const pages = parRegle.get(cle) ?? new Set();
		pages.add(trouvaille.page);
		parRegle.set(cle, pages);
	}
	for (const [cle, pages] of [...parRegle].sort()) {
		process.stdout.write(`  ${cle}\n      ${[...pages].join(', ')}\n`);
	}
}

if (echoue) {
	process.stderr.write(`\nLe parcours s’est arrêté après ${verifications} vérifications.\n`);
	process.exit(1);
}
if (graves.length > 0) {
	process.stderr.write(
		`\nLe parcours passe (${verifications} vérifications), mais axe relève ${graves.length} ` +
			`problème(s) sérieux ou critique(s).\n`
	);
	process.exit(1);
}
process.stdout.write(
	`\nLes ${verifications} vérifications passent, et axe ne relève rien de sérieux sur ` +
		`${pagesAuditees.length} pages.\n`
);
