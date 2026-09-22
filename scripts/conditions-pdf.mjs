#!/usr/bin/env node
/**
 * Met en page `docs/CONDITIONS.md` pour un juriste, et rend un PDF.
 *
 *     pnpm conditions:pdf
 *
 * ## Pourquoi un script plutôt qu'un fichier tenu à la main
 *
 * `docs/CONDITIONS.md` est vivant : il changera après la relecture du juriste, puis à chaque fois
 * qu'un sous-traitant ou une durée de rétention bouge. Un PDF recopié à la main serait faux la
 * première fois qu'on oublierait de le refaire, et personne ne le saurait. Ici, le PDF **est** le
 * document, mis en page : il n'y a rien à tenir à jour de séparé, sauf la première page.
 *
 * ## La première page
 *
 * Elle n'est pas dans `CONDITIONS.md`, et c'est voulu : ce sont les questions posées au juriste, pas
 * les conditions offertes aux organisations. Elle vit ci-dessous, dans `QUESTIONS`, et le contrôle de
 * style du dépôt la relit comme il relit le document lui-même.
 *
 * ## La typographie
 *
 * Le Markdown du dépôt s'écrit avec des apostrophes droites et des espaces ordinaires, parce que
 * c'est ce qu'on tape. Le rendu, lui, doit être en typographie française : apostrophe courbe, espace
 * fine insécable avant `;` `!` `?`, espace insécable avant `:` et à l'intérieur des guillemets. La
 * transformation est faite ici, au rendu, et jamais dans le fichier source : personne n'a à taper
 * des caractères invisibles pour que le document soit correct.
 *
 * ## Ce qu'il faut pour le lancer
 *
 * Chrome ou Chromium, déjà installé. Rien d'autre : aucune dépendance n'est ajoutée au dépôt.
 * `JADWAL_CHROME` pointe l'exécutable quand il n'est pas là où ce script le cherche.
 *
 * Le PDF est produit par le protocole de débogage de Chrome, et non par `--print-to-pdf`. La raison
 * tient en trois mots : « page x sur y ». Chrome ne sait pas numéroter les pages depuis une feuille
 * de style (il n'implémente pas les boîtes de marge de CSS), et l'option en ligne de commande ne
 * pose qu'un pied de page anglais qu'on ne choisit pas. Le protocole, lui, accepte un gabarit. Node
 * 22 et suivants portent un client WebSocket : il n'y a donc rien à installer pour lui parler.
 *
 * ## Ce qu'il ne fait pas
 *
 * Il ne lit **que** `docs/CONDITIONS.md`. Aucun détail de la machine qui exploite l'instance n'entre
 * ici : ce document dit l'hébergeur et le pays des données, rien de plus.
 */
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const racine = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SOURCE = join(racine, 'docs', 'CONDITIONS.md');
const SORTIE = join(racine, 'A_LIVRER', 'CONDITIONS-jadwal-juriste.pdf');

/** La date de la version, lue dans le document : une seule source, jamais deux. */
export function dateDeLaVersion(markdown) {
	const trouve = /^Derni[eè]re mise [aà] jour\s*:\s*(.+?)\.?\s*$/m.exec(markdown);
	return trouve ? trouve[1].trim() : 'sans date';
}

/**
 * Les points à valider, en français simple. Une question par point, et la raison pour laquelle elle
 * se pose : un juriste qui reçoit un texte sans savoir ce qui inquiète relit tout à poids égal.
 */
const QUESTIONS = [
	{
		titre: 'Responsable du traitement, ou sous-traitant ?',
		corps: `Le texte dit que l'exploitant est <strong>responsable du traitement</strong> au sens de la
		nLPD. C'est la question la plus structurante du document : si les organisations étaient
		responsables et l'exploitant leur sous-traitant, il faudrait un contrat de sous-traitance avec
		chacune, et la nature de ce texte changerait. Est-ce le bon choix pour un service gratuit, où
		c'est l'exploitant qui décide de ce qui est conservé et combien de temps ?`
	},
	{
		titre: 'Cloudflare, Inc. et la question des transferts',
		corps: `Les sauvegardes sont confiées à <strong>Cloudflare, Inc., société américaine</strong>,
		dans sa juridiction « Union européenne », qui garde les fichiers sur des sites de l'Union et ne
		les réplique pas ailleurs. <strong>La société et le lieu de stockage ne sont donc pas dans le
		même pays.</strong> Le texte le dit sans en tirer de conclusion. Faut-il qualifier cela de
		communication à l'étranger au sens des art. 16 et 17 nLPD ? Des garanties supplémentaires,
		clauses contractuelles types ou analyse d'impact, sont-elles nécessaires ?<br><br>
		Un fait à peser dans la réponse : <strong>les sauvegardes sont chiffrées sur le serveur, avant
		de le quitter</strong>, et la clé qui permet de les lire n'est ni sur ce serveur, ni chez
		Cloudflare. Celui qui les détient ne peut pas les ouvrir.`
	},
	{
		titre: 'Une phrase a été retirée, doit-elle revenir ?',
		corps: `Une version précédente affirmait : « Aucun transfert vers un pays tiers n'est
		nécessaire, et il n'y en a aucun. » Elle a été <strong>supprimée</strong>, parce que c'est une
		qualification juridique et que le document se limite aux faits. Est-elle exacte ? Doit-elle
		revenir, et sous quelle formulation ?`
	},
	{
		titre: 'Le journal technique, et ses quatorze jours',
		corps: `Le serveur conserve quatorze jours un journal des requêtes servies. L'adresse du
		visiteur y est <strong>tronquée avant d'être écrite</strong>, au point de ne plus désigner
		personne ; la page d'où il vient n'y figure pas. Cette donnée tronquée reste-t-elle une donnée
		personnelle ? La durée de quatorze jours est-elle défendable, et faut-il la justifier dans le
		texte ?`
	},
	{
		titre: 'Ce qui est effacé reste jusqu’à 181 jours dans les sauvegardes',
		corps: `Une suppression est immédiate dans le service, mais les sauvegardes déjà parties ne se
		réécrivent pas : c'est ce qui fait leur valeur le jour d'un incident. Le texte annonce
		<strong>181 jours au plus</strong>. Est-ce compatible avec le droit à l'effacement ? La
		formulation actuelle suffit-elle, ou faut-il dire explicitement que la suppression est
		<em>différée</em> dans les sauvegardes ?`
	},
	{
		titre: 'L’exploitant lit vos données, et ses consultations ne sont pas signalées',
		corps: `L'exploitant peut lire et modifier les données de toute organisation. Ses
		<strong>modifications</strong> apparaissent dans le journal de l'organisation ; ses
		<strong>consultations</strong> n'y apparaissent pas : elles sont notées dans un registre interne
		que l'exploitant conserve 24 mois. Le texte le dit en toutes lettres. Est-ce suffisant, ou
		faut-il un consentement distinct, voire une notification ?`
	},
	{
		titre: 'La liste des données personnelles, et ce qu’elle vaut',
		corps: `Le texte énumère six catégories : l'adresse électronique et le nom d'une personne
		responsable, le lien entre elle et son organisation, l'adresse d'une personne invitée, le
		journal des modifications, les passkeys, et une empreinte de l'adresse IP. Cette liste est-elle
		complète au sens de la loi, et la forme de l'énumération convient-elle ? Le nom d'un
		intervenant, écrit par l'organisation dans un champ libre et publié, y est traité à part.`
	},
	{
		titre: 'Une empreinte calculée avec une clé secrète',
		corps: `Le compteur d'abus ne retient pas l'adresse IP mais une empreinte calculée avec une clé
		secrète. Sans la clé, l'empreinte ne rend pas l'adresse ; avec elle, et il faut un accès au
		serveur pour l'avoir, une adresse IPv4 pourrait être retrouvée en les essayant toutes. Le texte
		l'écrit et conclut : « C'est une pseudonymisation, pas un anonymat. » Est-ce la bonne
		qualification, et l'écrire noir sur blanc est-il prudent ou imprudent ?`
	},
	{
		titre: 'Sans garantie de disponibilité, et gratuit',
		corps: `Le texte demande d'accepter que le service soit fourni <strong>sans garantie de
		disponibilité</strong>. Une telle clause est-elle opposable en droit suisse pour un service
		gratuit ? Faut-il une limitation de responsabilité rédigée autrement ?`
	},
	{
		titre: 'Comment ce texte est-il accepté ?',
		corps: `Il n'existe pas de contrat séparé signé avec chaque organisation. Le texte est publié
		et l'organisation ouvre son espace. Cette acceptation est-elle suffisante ? Faut-il une case à
		cocher horodatée, et conserver la version acceptée ?`
	}
];

// ------------------------------------------------------------------------------------------------
// Un convertisseur Markdown réduit à ce que ce document emploie : titres, paragraphes, listes,
// tableaux, gras, italique, code. Pas de bibliothèque : ce fichier-là est la seule chose à relire
// pour savoir ce qui est rendu, et le document est connu.
// ------------------------------------------------------------------------------------------------

const echapper = (texte) =>
	texte.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Le gras, l'italique, le code et les liens, dans une ligne déjà échappée. */
function enligne(texte) {
	return echapper(texte)
		.replace(/`([^`]+)`/g, '<code>$1</code>')
		.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
		.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
		.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

export function versHtml(markdown) {
	const lignes = markdown.split(/\r?\n/);
	const sortie = [];
	let i = 0;
	let liste = null;

	const fermerListe = () => {
		if (liste) {
			sortie.push(`</${liste}>`);
			liste = null;
		}
	};

	while (i < lignes.length) {
		const ligne = lignes[i];

		if (ligne.trim() === '') {
			fermerListe();
			i += 1;
			continue;
		}

		const titre = /^(#{1,6})\s+(.*)$/.exec(ligne);
		if (titre) {
			fermerListe();
			const niveau = titre[1].length;
			sortie.push(`<h${niveau}>${enligne(titre[2])}</h${niveau}>`);
			i += 1;
			continue;
		}

		// Un tableau : une ligne de cellules, puis une ligne de tirets, puis le corps.
		if (ligne.trim().startsWith('|') && /^\s*\|[\s:|-]+\|\s*$/.test(lignes[i + 1] ?? '')) {
			fermerListe();
			const cellules = (l) =>
				l
					.trim()
					.replace(/^\||\|$/g, '')
					.split('|')
					.map((c) => c.trim());
			const entetes = cellules(ligne);
			i += 2;
			const corps = [];
			while (i < lignes.length && lignes[i].trim().startsWith('|')) {
				corps.push(cellules(lignes[i]));
				i += 1;
			}
			sortie.push('<table>');
			sortie.push(
				`<thead><tr>${entetes.map((c) => `<th>${enligne(c)}</th>`).join('')}</tr></thead>`
			);
			sortie.push('<tbody>');
			for (const rangee of corps) {
				sortie.push(`<tr>${rangee.map((c) => `<td>${enligne(c)}</td>`).join('')}</tr>`);
			}
			sortie.push('</tbody></table>');
			continue;
		}

		const puce = /^(\s*)([-*]|\d+\.)\s+(.*)$/.exec(ligne);
		if (puce) {
			const voulue = /^\d/.test(puce[2]) ? 'ol' : 'ul';
			if (liste !== voulue) {
				fermerListe();
				sortie.push(`<${voulue}>`);
				liste = voulue;
			}
			let contenu = puce[3];
			// Une puce peut continuer sur les lignes suivantes, indentées.
			while (i + 1 < lignes.length && /^\s{2,}\S/.test(lignes[i + 1] ?? '')) {
				i += 1;
				contenu += ' ' + lignes[i].trim();
			}
			sortie.push(`<li>${enligne(contenu)}</li>`);
			i += 1;
			continue;
		}

		// Un paragraphe : jusqu'à la prochaine ligne vide.
		fermerListe();
		const morceaux = [ligne.trim()];
		while (
			i + 1 < lignes.length &&
			lignes[i + 1].trim() !== '' &&
			!/^(#{1,6}\s|\s*[-*]\s|\s*\d+\.\s|\s*\|)/.test(lignes[i + 1])
		) {
			i += 1;
			morceaux.push(lignes[i].trim());
		}
		sortie.push(`<p>${enligne(morceaux.join(' '))}</p>`);
		i += 1;
	}
	fermerListe();
	return sortie.join('\n');
}

// ------------------------------------------------------------------------------------------------
// La typographie française, appliquée au rendu et à lui seul.
// ------------------------------------------------------------------------------------------------

/** Espace fine insécable, celle qui précède le point-virgule, l'exclamation et l'interrogation. */
const FINE = '\u202f';
/** Espace insécable, celle qui précède les deux-points et qui borde les guillemets. */
const INSECABLE = '\u00a0';

/** Applique la typographie à un morceau de texte, hors balises et hors code. */
export function typographier(texte) {
	return (
		texte
			// L'apostrophe droite devient courbe, sauf dans une entité HTML.
			.replace(/'/g, '\u2019')
			// Une espace ordinaire devant ces signes devient fine et insécable.
			.replace(/ +([;!?])/g, `${FINE}$1`)
			// Devant les deux-points, l'espace est insécable mais pleine.
			.replace(/ +:/g, `${INSECABLE}:`)
			// Les guillemets français serrent leur contenu.
			.replace(/« +/g, `«${INSECABLE}`)
			.replace(/ +»/g, `${INSECABLE}»`)
	);
}

/**
 * Parcourt le HTML et n'applique la typographie qu'au texte : ni les balises, ni leurs attributs, ni
 * le contenu des `<code>`, où une apostrophe courbe serait une faute.
 */
export function typographierHtml(html) {
	let sortie = '';
	let reste = html;
	while (reste.length > 0) {
		const balise = reste.indexOf('<');
		if (balise < 0) {
			sortie += typographier(reste);
			break;
		}
		sortie += typographier(reste.slice(0, balise));
		if (reste.startsWith('<code', balise)) {
			const fin = reste.indexOf('</code>', balise);
			const coupe = fin < 0 ? reste.length : fin + '</code>'.length;
			sortie += reste.slice(balise, coupe);
			reste = reste.slice(coupe);
			continue;
		}
		const fin = reste.indexOf('>', balise);
		const coupe = fin < 0 ? reste.length : fin + 1;
		sortie += reste.slice(balise, coupe);
		reste = reste.slice(coupe);
	}
	return sortie;
}

// ------------------------------------------------------------------------------------------------

const STYLE = `
@page { size: A4; margin: 18mm 16mm 22mm 16mm; }
* { box-sizing: border-box; }
body {
	font-family: "Source Serif 4", Georgia, "Times New Roman", serif;
	font-size: 10.5pt; line-height: 1.5; color: #14171a; margin: 0;
	-webkit-print-color-adjust: exact; print-color-adjust: exact;
}
h1, h2, h3 { font-family: "Segoe UI", system-ui, sans-serif; line-height: 1.25; color: #0f1418; }
h1 { font-size: 20pt; margin: 0 0 4mm; }
h2 { font-size: 13pt; margin: 8mm 0 2.5mm; padding-bottom: 1.5mm; border-bottom: 0.4pt solid #c8ced4; break-after: avoid; }
h3 { font-size: 11pt; margin: 5mm 0 2mm; break-after: avoid; }
/* Aligné à gauche, jamais justifié : la justification creuse des rivières dans une colonne étroite. */
p { margin: 0 0 2.5mm; text-align: left; }
ul, ol { margin: 0 0 3mm; padding-left: 6mm; }
li { margin-bottom: 1.2mm; text-align: left; }
code { font-family: "Cascadia Mono", Consolas, monospace; font-size: 9pt; background: #f2f4f6; padding: 0 0.6mm; border-radius: 1mm; }
a { color: #14171a; text-decoration: none; border-bottom: 0.3pt solid #9aa4ad; }
table { width: 100%; border-collapse: collapse; margin: 2mm 0 4mm; font-size: 9.5pt; break-inside: avoid; }
th, td { border: 0.4pt solid #c8ced4; padding: 1.6mm 2.2mm; text-align: left; vertical-align: top; }
th { background: #eef1f4; font-family: "Segoe UI", system-ui, sans-serif; font-weight: 600; }

.garde { break-after: page; }
.garde .chapeau { font-family: "Segoe UI", system-ui, sans-serif; font-size: 8.5pt; letter-spacing: 0.08em; text-transform: uppercase; color: #5a666f; margin-bottom: 3mm; }
.garde .intro { font-size: 11pt; margin-bottom: 6mm; }
.point { break-inside: avoid; margin-bottom: 4.5mm; padding-left: 9mm; position: relative; }
.point .n {
	position: absolute; left: 0; top: 0.2mm;
	font-family: "Segoe UI", system-ui, sans-serif; font-size: 9pt; font-weight: 600;
	width: 6mm; height: 6mm; line-height: 6mm; text-align: center;
	background: #14171a; color: #fff; border-radius: 3mm;
}
.point h3 { margin: 0 0 1mm; font-size: 10.5pt; }
.point p { margin: 0; font-size: 9.8pt; }
.pied { margin-top: 7mm; padding-top: 3mm; border-top: 0.4pt solid #c8ced4; font-size: 9pt; color: #5a666f; }
.document h1 { margin-bottom: 2mm; }
`;

export function page(contenuMarkdown, version) {
	const points = QUESTIONS.map(
		(q, index) => `
	<div class="point">
		<span class="n">${index + 1}</span>
		<h3>${q.titre}</h3>
		<p>${q.corps.replace(/\s+/g, ' ').trim()}</p>
	</div>`
	).join('\n');

	return `<!doctype html>
<html lang="fr">
<head>
<meta charset="utf-8">
<title>Conditions d'utilisation de jadwal, pour relecture juridique</title>
<style>${STYLE}</style>
</head>
<body>

<section class="garde">
	<div class="chapeau">jadwal, un service de Voltia. Pour relecture juridique. Version du ${version}.</div>
	<h1>Ce sur quoi votre avis est demandé</h1>
	<p class="intro">
		Les pages qui suivent sont le texte que les organisations liront, tel qu'il est publié
		aujourd'hui. Il n'a <strong>jamais été relu par un juriste</strong>.
	</p>
	<p class="intro">
		Dix points nous paraissent demander votre avis. Les autres passages sont des faits techniques
		vérifiables ; ceux-ci sont des choix, et nous ne savons pas s'ils sont les bons.
	</p>
	${points}
	<p class="pied">
		Le service est exploité par Mahmoud Ali Mohamad (Voltia), en Suisse.
		Pour toute question : <strong>contact@voltia.ch</strong>.
		Le code du service est ouvert et peut être auto-hébergé.
	</p>
</section>

<section class="document">
${contenuMarkdown}
</section>

</body>
</html>
`;
}

/** Chrome, là où il se trouve. */
function chrome() {
	const declare = process.env['JADWAL_CHROME'];
	if (declare) {
		if (!existsSync(declare)) {
			throw new Error(`JADWAL_CHROME pointe sur un fichier absent : ${declare}`);
		}
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
	const trouve = candidats.find((c) => existsSync(c));
	if (!trouve) {
		throw new Error(
			'Chrome ou Chromium est introuvable. Poser JADWAL_CHROME sur le chemin de l’exécutable.'
		);
	}
	return trouve;
}

/**
 * Imprime une page locale en PDF par le protocole de débogage de Chrome.
 *
 * `--print-to-pdf` aurait suffi s'il ne fallait pas de pied de page. Il n'accepte aucun gabarit, et
 * Chrome ne sait pas numéroter les pages depuis CSS. Le protocole, lui, prend `footerTemplate`.
 */
export async function imprimer(chemin, sortie, pied) {
	// Chrome veut un profil à lui. Il va dans le dossier temporaire du système : A_LIVRER ne
	// contient que ce qui se livre, et un profil de navigateur ne se livre pas.
	const profil = mkdtempSync(join(tmpdir(), 'jadwal-conditions-'));
	const enfant = spawn(chrome(), [
		'--headless=new',
		'--disable-gpu',
		'--no-first-run',
		'--no-default-browser-check',
		'--remote-debugging-port=0',
		`--user-data-dir=${profil}`
	]);

	/** Chrome annonce son adresse sur la sortie d'erreur, et seulement là. */
	const adresse = await new Promise((resolue, rejetee) => {
		let tampon = '';
		const minuteur = setTimeout(
			() => rejetee(new Error(`Chrome n’a pas annoncé son adresse de débogage.\n${tampon}`)),
			30_000
		);
		enfant.stderr.on('data', (morceau) => {
			tampon += morceau.toString();
			const trouve = /ws:\/\/[^\s]+/.exec(tampon);
			if (trouve) {
				clearTimeout(minuteur);
				resolue(trouve[0]);
			}
		});
		enfant.on('exit', (code) => {
			clearTimeout(minuteur);
			rejetee(new Error(`Chrome s’est arrêté (code ${code}).\n${tampon}`));
		});
	});

	const socket = new WebSocket(adresse);
	let numero = 0;
	const attentes = new Map();
	const parSession = (sessionId) => (methode, params) =>
		new Promise((resolue, rejetee) => {
			numero += 1;
			attentes.set(numero, { resolue, rejetee });
			socket.send(JSON.stringify({ id: numero, method: methode, params, sessionId }));
		});
	const evenements = new Map();

	await new Promise((resolue, rejetee) => {
		socket.addEventListener('open', resolue, { once: true });
		socket.addEventListener('error', () => rejetee(new Error('connexion refusée par Chrome')), {
			once: true
		});
	});
	socket.addEventListener('message', (message) => {
		const donnee = JSON.parse(message.data);
		if (donnee.id !== undefined) {
			const attente = attentes.get(donnee.id);
			attentes.delete(donnee.id);
			if (!attente) return;
			if (donnee.error) attente.rejetee(new Error(JSON.stringify(donnee.error)));
			else attente.resolue(donnee.result);
			return;
		}
		const rappel = evenements.get(donnee.method);
		if (rappel) rappel(donnee.params);
	});

	try {
		const navigateur = parSession(undefined);
		const cible = await navigateur('Target.createTarget', { url: 'about:blank' });
		const attache = await navigateur('Target.attachToTarget', {
			targetId: cible.targetId,
			flatten: true
		});
		const onglet = parSession(attache.sessionId);
		await onglet('Page.enable', {});
		const chargee = new Promise((resolue) => evenements.set('Page.loadEventFired', resolue));
		await onglet('Page.navigate', { url: pathToFileURL(chemin).href });
		await chargee;
		// Les polices et la mise en page ont besoin d'un tour de boucle après le chargement.
		await new Promise((resolue) => setTimeout(resolue, 500));

		const rendu = await onglet('Page.printToPDF', {
			printBackground: true,
			preferCSSPageSize: true,
			displayHeaderFooter: pied !== null,
			headerTemplate: '<div></div>',
			footerTemplate: pied ?? ''
		});
		writeFileSync(sortie, Buffer.from(rendu.data, 'base64'));
	} finally {
		socket.close();
		// `kill()` rend la main avant que Windows n'ait lâché les fichiers du profil : sans cette
		// attente, l'effacement échoue avec EPERM et fait tomber le script alors que le PDF est fait.
		const fini = new Promise((resolue) => enfant.once('exit', resolue));
		enfant.kill();
		await Promise.race([fini, new Promise((resolue) => setTimeout(resolue, 5_000))]);
		try {
			rmSync(profil, { recursive: true, force: true, maxRetries: 10, retryDelay: 200 });
		} catch {
			// Un profil temporaire laissé derrière n'est pas une raison de perdre le document.
		}
	}
}

/**
 * Le pied de page, tel que Chrome l'attend : un fragment autonome, avec sa propre feuille de style,
 * et les deux classes qu'il remplit lui-même. Sans `displayHeaderFooter`, il n'est pas dessiné ;
 * avec, et sans gabarit, Chrome pose le sien, en anglais.
 */
export function piedDePage(version) {
	return `<div style="width:100%;font-family:'Segoe UI',system-ui,sans-serif;font-size:7.5pt;
		color:#5a666f;padding:0 16mm;display:flex;justify-content:space-between;">
		<span>jadwal, conditions d’utilisation. Version du ${version}.</span>
		<span>page <span class="pageNumber"></span> sur <span class="totalPages"></span></span>
	</div>`;
}

/** Le document entier, mis en page et typographié, tel qu'il part chez Chrome. */
export function construire(markdown) {
	return typographierHtml(page(versHtml(markdown), dateDeLaVersion(markdown)));
}

/** Le nombre de pages annoncé par le PDF lui-même, sans passer par un outil extérieur. */
export function nombreDePages(octets) {
	const trouve = /\/Type\s*\/Pages[\s\S]*?\/Count\s+(\d+)/.exec(octets.toString('latin1'));
	return Number(trouve?.[1] ?? 0);
}

/** Lit `docs/CONDITIONS.md`, écrit le PDF, et rend de quoi en rendre compte. */
export async function produire({ avecPied = true } = {}) {
	const markdown = readFileSync(SOURCE, 'utf8');
	const version = dateDeLaVersion(markdown);
	const html = construire(markdown);

	mkdirSync(dirname(SORTIE), { recursive: true });
	const travail = join(racine, 'A_LIVRER', '.conditions-juriste.html');
	writeFileSync(travail, html, 'utf8');

	try {
		await imprimer(travail, SORTIE, avecPied ? piedDePage(version) : null);
	} finally {
		if (!process.env['JADWAL_GARDER_HTML']) rmSync(travail, { force: true });
	}

	if (!existsSync(SORTIE)) throw new Error(`Chrome n’a pas produit ${SORTIE}.`);
	const octets = readFileSync(SORTIE);
	return { chemin: SORTIE, version, html, octets: octets.length, pages: nombreDePages(octets) };
}

// Importé par son épreuve, ce fichier ne doit rien faire ; lancé à la main, il produit le document.
if (import.meta.main) {
	const rendu = await produire();
	process.stdout.write(
		`${rendu.chemin}\n` +
			`${QUESTIONS.length} points pour le juriste, puis docs/CONDITIONS.md en entier.\n` +
			`version du ${rendu.version}, ${rendu.pages} pages, ` +
			`${rendu.octets.toLocaleString('fr-CH')} octets.\n`
	);
}
