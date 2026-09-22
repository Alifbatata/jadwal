// `<jadwal-widget>` : le programme d'une organisation, posé sur son propre site (ADR 0005 révisé).
//
// Ce fichier est chargé sur le site de chaque organisation. C'est le point le plus exposé du
// système, et c'est pourquoi il ne fait qu'une chose : poser un cadre vers la page publique, et lui
// donner la hauteur de son contenu. Il ne dessine aucune vue, ne lit aucune donnée, n'écrit rien
// nulle part.
//
// Aucune bibliothèque. Le widget provisoire de l'étape 0 était un composant Svelte 5 : il pesait
// 12,48 Kio gzip pour afficher deux mots, parce qu'un moteur de rendu réactif y était embarqué.
// Ici il n'y a rien à rendre réactivement, donc il n'y a pas de moteur.

/** Le nom de la balise. Il fait partie du contrat d'intégration : il ne change pas sans `v2`. */
export const TAG_NAME = 'jadwal-widget';

/**
 * Le seul message accepté du cadre. Nommé et versionné : une page qui poste autre chose, ou une
 * version plus ancienne, est ignorée sans qu'on ait à deviner ce qu'elle voulait dire.
 */
const MESSAGE = 'jadwal:height:1';

/** Hauteur posée avant la première mesure : de quoi ne pas faire sauter la page de l'organisation. */
const HAUTEUR_MINIMALE = 320;
/**
 * Plafond de sécurité. Un cadre de plusieurs centaines de milliers de pixels rendrait la page de
 * l'organisation inutilisable, et c'est exactement ce qu'un message forgé chercherait à obtenir.
 */
const HAUTEUR_MAXIMALE = 20000;
/**
 * En deçà de deux pixels d'écart, on ne touche à rien. Sans ce seuil, une page dont une longueur
 * dépend de la hauteur de sa propre fenêtre entre en rétroaction : hauteur appliquée, nouvelle
 * mesure, nouveau message, sans fin. C'est la panne classique des redimensionneurs de cadre.
 */
const HYSTERESIS = 2;

const LANGUES = new Set(['fr', 'de', 'it', 'ar']);
const VUES = new Set(['semaine', 'cours', 'mois']);
const PUBLICS = new Set(['kids', 'youth', 'women', 'adults', 'open']);

interface Mots {
	readonly titre: string;
	readonly lien: string;
	readonly mention: string;
}

/** Quatre langues, trois phrases. Un fichier de traduction coûterait plus qu'il ne rendrait ici. */
const MOTS: Record<string, Mots> = {
	fr: {
		titre: 'Programme des cours',
		lien: 'Voir le programme complet',
		mention: 'Proposé gratuitement par jadwal, un service de Voltia'
	},
	de: {
		titre: 'Kursprogramm',
		lien: 'Das ganze Programm ansehen',
		mention: 'Kostenlos bereitgestellt von jadwal, einem Dienst von Voltia'
	},
	it: {
		titre: 'Programma dei corsi',
		lien: 'Vedi tutto il programma',
		mention: 'Offerto gratuitamente da jadwal, un servizio di Voltia'
	},
	ar: {
		titre: 'برنامج الدروس',
		lien: 'عرض البرنامج كاملاً',
		mention: 'مقدَّم مجاناً من jadwal، خدمة من Voltia'
	}
};

/**
 * L'origine du service, déduite de l'adresse du script lui-même.
 *
 * C'est la seule valeur que le widget ne peut pas demander à l'organisation : elle collerait une faute
 * de frappe une fois sur deux. Le script, lui, sait d'où il vient. Lue au chargement, parce que
 * `document.currentScript` n'a de valeur que pendant l'exécution du script.
 */
const ORIGINE_DU_SCRIPT = (() => {
	try {
		const script = document.currentScript as HTMLScriptElement | null;
		return new URL(script?.src ?? '', document.baseURI).origin;
	} catch {
		return '';
	}
})();

const STYLE = `
:host { display: block; contain: content; }
iframe { display: block; width: 100%; border: 0; color-scheme: normal; }
footer {
	font: 400 0.8rem/1.5 system-ui, -apple-system, sans-serif;
	color: #555;
	padding: 0.4rem 0 0;
	display: flex;
	flex-wrap: wrap;
	gap: 0.5rem;
}
a { color: #0f5c55; min-height: 24px; }
`;

export class JadwalWidget extends HTMLElement {
	static readonly observedAttributes = ['org', 'lang', 'view', 'audience', 'min-height', 'base'];

	#racine: ShadowRoot | undefined;
	#cadre: HTMLIFrameElement | undefined;
	#lien: HTMLAnchorElement | undefined;
	#mention: HTMLSpanElement | undefined;
	#hauteur = 0;
	readonly #ecoute = (evenement: MessageEvent): void => this.#surMessage(evenement);

	connectedCallback(): void {
		if (!this.#racine) this.#construire();
		// L'écouteur est posé avant que le cadre reçoive son adresse : un cadre servi depuis le
		// cache peut annoncer sa hauteur avant la fin de ce tour de boucle.
		window.addEventListener('message', this.#ecoute);
		this.#rendre();
	}

	disconnectedCallback(): void {
		window.removeEventListener('message', this.#ecoute);
	}

	attributeChangedCallback(): void {
		if (this.#racine) this.#rendre();
	}

	#construire(): void {
		const racine = this.attachShadow({ mode: 'open' });
		this.#racine = racine;
		const style = document.createElement('style');
		style.textContent = STYLE;
		const pied = document.createElement('footer');
		this.#lien = document.createElement('a');
		this.#lien.target = '_blank';
		this.#lien.rel = 'noopener';
		this.#mention = document.createElement('span');
		pied.append(this.#lien, this.#mention);
		racine.append(style, pied);
	}

	/** La langue demandée, ou `undefined` : le chemin sans langue rend celle de l'organisation. */
	#langue(): string | undefined {
		const demandee = this.getAttribute('lang')?.trim().toLowerCase();
		return demandee && LANGUES.has(demandee) ? demandee : undefined;
	}

	#hauteurMinimale(): number {
		const demandee = Number(this.getAttribute('min-height'));
		if (!Number.isFinite(demandee) || demandee <= 0) return HAUTEUR_MINIMALE;
		return Math.min(Math.round(demandee), HAUTEUR_MAXIMALE);
	}

	/** L'origine du service : celle du script, sauf si l'intégrateur en impose une autre. */
	#origine(): string {
		const donnee = this.getAttribute('base')?.trim();
		if (donnee) {
			try {
				return new URL(donnee, document.baseURI).origin;
			} catch {
				// Une adresse illisible est ignorée, comme tout attribut absurde.
			}
		}
		return ORIGINE_DU_SCRIPT || window.location.origin;
	}

	/**
	 * L'adresse de la page publique. `integre` ajoute le paramètre qui dit à la page qu'elle est
	 * dans un cadre : c'est lui, et lui seul, qui lui fait charger son script d'annonce de hauteur.
	 */
	#adresse(integre: boolean): string | undefined {
		const org = this.getAttribute('org')?.trim();
		if (!org) return undefined;
		const langue = this.#langue();
		let adresse: URL;
		try {
			adresse = new URL(
				`/m/${encodeURIComponent(org)}${langue ? `/${langue}` : ''}`,
				`${this.#origine()}/`
			);
		} catch {
			return undefined;
		}
		const vue = this.getAttribute('view')?.trim();
		// `semaine` est la vue par défaut de la page : l'écrire n'ajouterait qu'un paramètre.
		if (vue && VUES.has(vue) && vue !== 'semaine') adresse.searchParams.set('vue', vue);
		const audience = this.getAttribute('audience')?.trim();
		if (audience && PUBLICS.has(audience)) adresse.searchParams.set('public', audience);
		if (integre) adresse.searchParams.set('embed', '1');
		return adresse.toString();
	}

	#rendre(): void {
		const racine = this.#racine;
		const lien = this.#lien;
		const mention = this.#mention;
		if (!racine || !lien || !mention) return;

		const mots = MOTS[this.#langue() ?? 'fr'] ?? (MOTS['fr'] as Mots);
		lien.textContent = mots.lien;
		mention.textContent = mots.mention;

		const publique = this.#adresse(false);
		const integree = this.#adresse(true);
		// Sans `org`, il n'y a rien à afficher et rien à lier : le contenu de repli de la balise
		// reste alors le seul contenu visible, ce qui est la bonne réponse.
		if (!publique || !integree) {
			this.#cadre?.remove();
			this.#cadre = undefined;
			lien.removeAttribute('href');
			return;
		}
		lien.href = publique;

		// Réécrire `src` d'un cadre existant ajoute une entrée à l'historique du site de l'organisation
		// (mesuré sur Chrome 153). On remplace donc le cadre au lieu de le renavigier.
		this.#cadre?.remove();
		const cadre = document.createElement('iframe');
		cadre.title = mots.titre;
		cadre.referrerPolicy = 'no-referrer';
		// Pas de `loading="lazy"` : le report n'a lieu que si le visiteur a JavaScript, et un cadre
		// jamais entré à l'écran s'imprime à sa hauteur par défaut, soit 150 pixels de programme.
		this.#hauteur = this.#hauteurMinimale();
		cadre.style.height = `${this.#hauteur}px`;
		cadre.src = integree;
		this.#cadre = cadre;
		racine.insertBefore(cadre, racine.querySelector('footer'));
	}

	/**
	 * La hauteur annoncée par le cadre. Trois vérifications, dans cet ordre, et rien d'autre n'est
	 * traité :
	 *
	 * 1. **la fenêtre émettrice** est celle de notre cadre. C'est la vérification qui fait tout le
	 *    travail : n'importe quel cadre de la page hôte — une régie publicitaire, un chat, un autre
	 *    widget — peut poster un message, et c'est aussi elle qui empêche deux `<jadwal-widget>` de
	 *    se marcher dessus ;
	 * 2. **l'origine** est exactement celle du cadre. Comparaison stricte : `startsWith` accepterait
	 *    `https://jadwal.example.evil.tld`, `endsWith` accepterait `https://evil-jadwal.example` ;
	 * 3. **la forme** du message : le nom exact, et un nombre fini.
	 */
	#surMessage(evenement: MessageEvent): void {
		const cadre = this.#cadre;
		// `contentWindow` absent : le cadre n'a pas de fenêtre à qui faire confiance, donc personne
		// n'est reconnu. Sans ce garde, un message sans émetteur — un travailleur, un canal —
		// passerait la comparaison, deux absences étant égales.
		if (!cadre?.contentWindow || evenement.source !== cadre.contentWindow) return;
		let attendue: string;
		try {
			attendue = new URL(cadre.src).origin;
		} catch {
			return;
		}
		if (evenement.origin !== attendue) return;
		const donnee = evenement.data as { type?: unknown; height?: unknown } | null;
		if (!donnee || typeof donnee !== 'object') return;
		if (donnee.type !== MESSAGE) return;
		const annoncee = donnee.height;
		if (typeof annoncee !== 'number' || !Number.isFinite(annoncee)) return;

		const hauteur = Math.min(
			Math.max(Math.round(annoncee), this.#hauteurMinimale()),
			HAUTEUR_MAXIMALE
		);
		if (Math.abs(hauteur - this.#hauteur) <= HYSTERESIS) return;
		this.#hauteur = hauteur;
		cadre.style.height = `${hauteur}px`;
	}
}

/** Enregistré une seule fois : deux balises de script sur la même page ne doivent pas lever. */
export function register(): void {
	if (typeof customElements === 'undefined') return;
	if (!customElements.get(TAG_NAME)) customElements.define(TAG_NAME, JadwalWidget);
}
