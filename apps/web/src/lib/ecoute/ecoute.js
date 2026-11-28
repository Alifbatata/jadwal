// L'écoute du direct, dans la page publique d'une organisation (étape 25, chantier 3, ADR 0057).
//
// **Le seul script de cette vue, et un fichier servi à part** (`/m/ecoute.js`), comme celui qui
// garde la page hors réseau (`routes/m/hors-reseau.js`) : la page publique est rendue sans
// SvelteKit dans le navigateur (`csr = false`, ADR 0027), et `script-src 'self'` laisse passer un
// fichier de la même origine. C'est un module : il n'importe rien, ne porte aucun texte (la page
// les lui donne dans sa langue, par `data-textes`) et ne garde rien : ni stockage, ni mesure.
//
// Ce qu'il fait, quand on appuie sur « Écouter » : il se branche sur le relais, dans la langue
// choisie ; il attend le direct s'il n'a pas commencé ; il décode le son (IMA ADPCM, voir
// `apps/live/src/adpcm.ts`), le met bout à bout, montre les sous-titres et garde l'écran allumé.
// Sans ce fichier, la page le dit, et le reste se lit.
//
// Les tests (`ecoute.test.ts`) importent les pièces sans navigateur : le décodeur, la lecture, les
// sous-titres et la liaison. Le branchement sur la page (`demarrer`) ne s'exécute que là où il y
// a un document, et un élément `[data-jadwal-ecoute]`.

// ---------------------------------------------------------------------------------------------
// Le décodeur
// ---------------------------------------------------------------------------------------------

/** Les quatre octets d'en-tête de chaque paquet : premier échantillon, indice du pas, drapeau. */
export const OCTETS_D_EN_TETE = 4;

/** Les 89 pas de l'IMA, les mêmes que ceux du codeur du relais. */
const PAS = [
	7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73,
	80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494,
	544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499,
	2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487,
	12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767
];

/** Comment l'indice du pas bouge selon les trois bits de grandeur d'un code. */
const MOUVEMENTS = [-1, -1, -1, -1, 2, 4, 6, 8];

/**
 * Décode un paquet du relais en échantillons de 16 bits. Un paquet se décode seul : son en-tête
 * porte l'état du codeur. Un paquet trop court ou faux rend un tableau vide, jamais une erreur.
 *
 * @param {ArrayBuffer | Uint8Array} paquet
 * @returns {Int16Array}
 */
export function decoder(paquet) {
	const octets = paquet instanceof Uint8Array ? paquet : new Uint8Array(paquet);
	if (octets.length < OCTETS_D_EN_TETE) return new Int16Array(0);
	const lecteur = new DataView(octets.buffer, octets.byteOffset, octets.byteLength);
	let prediction = lecteur.getInt16(0, true);
	let indice = octets[2];
	const impair = octets[3];
	if (indice > 88 || impair > 1) return new Int16Array(0);
	const nombre = (octets.length - OCTETS_D_EN_TETE) * 2 - impair;
	const sortie = new Int16Array(Math.max(0, nombre));
	for (let i = 0; i < sortie.length; i++) {
		const octet = octets[OCTETS_D_EN_TETE + (i >> 1)];
		const code = i % 2 === 0 ? octet & 15 : octet >> 4;
		const pas = PAS[indice];
		let ecart = pas >> 3;
		if (code & 4) ecart += pas;
		if (code & 2) ecart += pas >> 1;
		if (code & 1) ecart += pas >> 2;
		prediction = code & 8 ? prediction - ecart : prediction + ecart;
		if (prediction > 32767) prediction = 32767;
		else if (prediction < -32768) prediction = -32768;
		indice += MOUVEMENTS[code & 7];
		if (indice < 0) indice = 0;
		else if (indice > 88) indice = 88;
		sortie[i] = prediction;
	}
	return sortie;
}

/**
 * Des échantillons de 16 bits ramenés entre -1 et 1, comme le son du navigateur les veut.
 *
 * @param {Int16Array} echantillons
 * @returns {Float32Array}
 */
export function enFlottants(echantillons) {
	const sortie = new Float32Array(echantillons.length);
	for (let i = 0; i < echantillons.length; i++) sortie[i] = echantillons[i] / 32768;
	return sortie;
}

// ---------------------------------------------------------------------------------------------
// La lecture
// ---------------------------------------------------------------------------------------------

/** L'avance prise au départ, et après un trou : de quoi absorber l'irrégularité du réseau. */
export const AVANCE_S = 0.3;

/** Au-delà de cette avance, un morceau est jeté : le direct ne prend pas de retard. */
export const AVANCE_MAXIMALE_S = 2;

/** En deçà de cette marge, un morceau arriverait trop tard pour sa place : on reprend l'avance. */
const MARGE_S = 0.02;

/**
 * Met les morceaux bout à bout sur l'horloge du contexte de son.
 *
 * Le contexte est celui du navigateur, ou un faux dans les tests : il suffit qu'il ait
 * `currentTime`, `destination`, `createBuffer` et `createBufferSource`. Un tampon à 24 kHz est
 * rééchantillonné par le navigateur à la fréquence du contexte.
 */
export class Lecture {
	/** @param {BaseAudioContext} contexte */
	constructor(contexte) {
		this.contexte = contexte;
		/** L'instant, sur l'horloge du contexte, où le prochain morceau commencera. */
		this.suivant = 0;
		/** Combien de fois le son a manqué, et combien de morceaux ont été jetés : pour l'épreuve. */
		this.trous = 0;
		this.jetes = 0;
	}

	/**
	 * Place un morceau. Rend ce qui en a été fait.
	 *
	 * @param {Float32Array} echantillons
	 * @param {number} frequence
	 * @returns {'place' | 'jete'}
	 */
	jouer(echantillons, frequence) {
		if (echantillons.length === 0) return 'jete';
		const maintenant = this.contexte.currentTime;
		if (this.suivant < maintenant + MARGE_S) {
			if (this.suivant > 0) this.trous++;
			this.suivant = maintenant + AVANCE_S;
		} else if (this.suivant - maintenant > AVANCE_MAXIMALE_S) {
			this.jetes++;
			return 'jete';
		}
		const tampon = this.contexte.createBuffer(1, echantillons.length, frequence);
		tampon.getChannelData(0).set(echantillons);
		const source = this.contexte.createBufferSource();
		source.buffer = tampon;
		source.connect(this.contexte.destination);
		source.start(this.suivant);
		this.suivant += echantillons.length / frequence;
		return 'place';
	}

	/** Oublie la place du prochain morceau : une autre langue, ou une reprise, repart de l'avance. */
	reprendre() {
		this.suivant = 0;
	}
}

// ---------------------------------------------------------------------------------------------
// Les sous-titres
// ---------------------------------------------------------------------------------------------

/** Les phrases définitives gardées à l'écran. */
export const PHRASES_GARDEES = 3;

/**
 * Le texte du relais : une phrase provisoire, que la suivante remplace, puis sa forme définitive.
 * Les trois dernières définitives restent, et la phrase en cours.
 */
export class SousTitres {
	constructor() {
		/** @type {string[]} */
		this.phrases = [];
		this.enCours = '';
	}

	/**
	 * @param {string} texte
	 * @param {boolean} definitif
	 * @returns {string | null} la phrase devenue définitive, s'il y en a une
	 */
	recevoir(texte, definitif) {
		if (!definitif) {
			this.enCours = texte;
			return null;
		}
		this.enCours = '';
		this.phrases.push(texte);
		if (this.phrases.length > PHRASES_GARDEES) this.phrases.shift();
		return texte;
	}

	vider() {
		this.phrases = [];
		this.enCours = '';
	}
}

// ---------------------------------------------------------------------------------------------
// La liaison
// ---------------------------------------------------------------------------------------------

/** Les écarts entre deux essais de reprise, comme le poste « Diffuser » : cinq essais. */
export const ATTENTES_MS = [1000, 2000, 4000, 8000, 8000];

/**
 * Les états de l'écoute, tels que la page les dit :
 *
 * - `arret` : rien n'est branché ;
 * - `connexion` : la liaison s'ouvre ;
 * - `attente` : branché, pas de direct en ce moment ;
 * - `direct` : le direct passe, et le son vient ;
 * - `fini` : le direct vient de finir ; on reste branché pour le suivant ;
 * - `reprise` : la liaison est tombée, on la refait ;
 * - `perdu` : cinq essais sans réponse ;
 * - `plein` : le relais n'a plus de place ;
 * - `indisponible` : le relais ne sert pas cette langue ;
 * - `format` : le relais envoie un son que cette page ne sait pas lire (une page trop ancienne).
 *
 * @typedef {'arret' | 'connexion' | 'attente' | 'direct' | 'fini' | 'reprise' | 'perdu' | 'plein' | 'indisponible' | 'format'} Etat
 */

/**
 * Ce que la liaison a besoin du monde : de quoi ouvrir une liaison, et une minuterie. Le
 * navigateur donne `WebSocket` et `setTimeout` ; les tests, des faux.
 *
 * @typedef {object} Monde
 * @property {(adresse: string) => PriseDEcoute} ouvrir
 * @property {(rappel: () => void, ms: number) => unknown} plusTard
 * @property {(minuterie: unknown) => void} annuler
 */

/**
 * Ce qu'il faut d'une liaison WebSocket.
 *
 * @typedef {object} PriseDEcoute
 * @property {string} binaryType
 * @property {((evenement: { data: unknown }) => void) | null} onmessage
 * @property {(() => void) | null} onclose
 * @property {() => void} close
 */

/**
 * Ce que la page apprend de la liaison.
 *
 * @typedef {object} Rappels
 * @property {(etat: Etat) => void} etat
 * @property {(texte: string, definitif: boolean) => void} texte
 * @property {(paquet: ArrayBuffer, frequence: number) => void} son
 */

export class Ecoute {
	/**
	 * @param {string} base l'adresse du relais pour cette organisation, jusqu'à la langue
	 *   exclue : `wss://…/listen/<organisation>/`
	 * @param {Monde} monde
	 * @param {Rappels} rappels
	 */
	constructor(base, monde, rappels) {
		this.base = base;
		this.monde = monde;
		this.rappels = rappels;
		/** @type {Etat} */
		this.etat = 'arret';
		/** @type {string | null} */
		this.langue = null;
		/** @type {PriseDEcoute | null} */
		this.prise = null;
		this.essais = 0;
		/** @type {unknown} */
		this.minuterie = null;
		/**
		 * Un direct est-il passé depuis qu'on écoute ? Alors un état « pas de direct » dit qu'il est
		 * fini, et non qu'on l'attend, même après une reprise de la liaison.
		 */
		this.unDirectVu = false;
		/** La fréquence du son du direct en cours, que le relais annonce. */
		this.frequence = 0;
	}

	/** @param {Etat} etat */
	#devenir(etat) {
		if (this.etat === etat) return;
		this.etat = etat;
		this.rappels.etat(etat);
	}

	/**
	 * Se branche dans une langue, ou change de langue : l'ancienne liaison est fermée.
	 *
	 * @param {string} langue
	 */
	ecouter(langue) {
		this.#debrancher();
		this.langue = langue;
		this.essais = 0;
		this.unDirectVu = false;
		this.#devenir('connexion');
		this.#brancher();
	}

	/** Arrête tout : la liaison, les reprises. */
	arreter() {
		this.#debrancher();
		this.langue = null;
		this.unDirectVu = false;
		this.#devenir('arret');
	}

	#brancher() {
		if (this.langue === null) return;
		const prise = this.monde.ouvrir(`${this.base}${encodeURIComponent(this.langue)}`);
		prise.binaryType = 'arraybuffer';
		this.prise = prise;
		/** Le relais a-t-il refusé ? Alors la fermeture qui suit n'appelle pas de reprise. */
		let refusee = false;
		prise.onmessage = (evenement) => {
			if (this.prise !== prise) return;
			const donnee = evenement.data;
			if (typeof donnee !== 'string') {
				if (this.etat === 'direct' && donnee instanceof ArrayBuffer) {
					this.rappels.son(donnee, this.frequence);
				}
				return;
			}
			let message;
			try {
				message = JSON.parse(donnee);
			} catch {
				return;
			}
			if (message === null || typeof message !== 'object') return;
			if (message.type === 'state') {
				// Le relais répond : la liaison tient, les essais repartent de zéro.
				this.essais = 0;
				if (message.live === true) {
					const frequence = message.format?.sampleRate;
					if (
						message.format?.encoding !== 'ima_adpcm' ||
						message.format?.channels !== 1 ||
						typeof frequence !== 'number' ||
						!(frequence >= 8000 && frequence <= 96000)
					) {
						refusee = true;
						this.#debrancher();
						this.#devenir('format');
						return;
					}
					this.frequence = frequence;
					this.unDirectVu = true;
					this.#devenir('direct');
				} else {
					// Le direct vient de finir : la page le dit, et reste branchée pour le suivant.
					this.#devenir(this.unDirectVu ? 'fini' : 'attente');
				}
			} else if (message.type === 'text' && typeof message.text === 'string') {
				if (this.etat === 'direct') this.rappels.texte(message.text, message.final === true);
			} else if (message.type === 'refused') {
				refusee = true;
				this.#devenir(message.reason === 'full' ? 'plein' : 'indisponible');
			}
		};
		prise.onclose = () => {
			if (this.prise !== prise) return;
			this.prise = null;
			if (refusee || this.langue === null) return;
			this.#reprendre();
		};
	}

	#reprendre() {
		if (this.essais >= ATTENTES_MS.length) {
			this.langue = null;
			this.#devenir('perdu');
			return;
		}
		const attente = ATTENTES_MS[this.essais];
		this.essais++;
		this.#devenir('reprise');
		this.minuterie = this.monde.plusTard(() => {
			this.minuterie = null;
			this.#brancher();
		}, attente);
	}

	#debrancher() {
		if (this.minuterie !== null) {
			this.monde.annuler(this.minuterie);
			this.minuterie = null;
		}
		const prise = this.prise;
		this.prise = null;
		if (prise) {
			prise.onmessage = null;
			prise.onclose = null;
			prise.close();
		}
	}
}

// ---------------------------------------------------------------------------------------------
// La page
// ---------------------------------------------------------------------------------------------

/**
 * Garde l'écran allumé pendant l'écoute, et redemande le verrou quand on revient sur la page : le
 * navigateur le lâche dès qu'elle est cachée. Un refus (batterie faible, navigateur qui ne sait
 * pas) laisse l'écoute comme elle est. La même chose que `keepScreenOn` du poste « Diffuser »,
 * réécrite ici parce que ce fichier n'importe rien.
 *
 * @returns {{ lacher(): void }}
 */
function garderLEcranAllume() {
	/** @type {WakeLockSentinel | null} */
	let verrou = null;
	let lache = false;
	const demander = async () => {
		if (lache || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
		try {
			const obtenu = await navigator.wakeLock.request('screen');
			if (lache) obtenu.release().catch(() => undefined);
			else verrou = obtenu;
		} catch {
			verrou = null;
		}
	};
	const auRetour = () => void demander();
	document.addEventListener('visibilitychange', auRetour);
	void demander();
	return {
		lacher() {
			lache = true;
			document.removeEventListener('visibilitychange', auRetour);
			verrou?.release().catch(() => undefined);
			verrou = null;
		}
	};
}

/** Les états après lesquels on n'écoute plus : le bouton redevient « Écouter ». */
const ETATS_D_ARRET = new Set(['arret', 'perdu', 'plein', 'indisponible', 'format']);

/**
 * Branche l'écoute sur la page : le choix de la langue, le bouton, l'état, les sous-titres.
 *
 * @param {HTMLElement} racine l'élément `[data-jadwal-ecoute]`
 */
export function demarrer(racine) {
	const base = racine.dataset.relais;
	/** @type {Record<string, string>} */
	const textes = JSON.parse(racine.dataset.textes ?? '{}');
	const bouton = racine.querySelector('[data-ecouter]');
	const statut = racine.querySelector('[data-statut]');
	const phrases = racine.querySelector('[data-phrases]');
	const enCours = racine.querySelector('[data-en-cours]');
	const cadre = racine.querySelector('[data-sous-titres]');
	if (!base || !bouton || !statut || !phrases || !enCours || !(cadre instanceof HTMLElement))
		return;

	// La page a été écrite pour un navigateur sans ce fichier : on montre ce qui en a besoin, on
	// cache ce qui disait qu'il manquait.
	for (const element of racine.querySelectorAll('[data-avec-script]')) element.hidden = false;
	for (const element of racine.querySelectorAll('[data-sans-script]')) element.hidden = true;

	/** @type {AudioContext | null} */
	let contexte = null;
	/** @type {Lecture | null} */
	let lecture = null;
	/** @type {{ lacher(): void } | null} */
	let ecran = null;
	const sousTitres = new SousTitres();

	const langueChoisie = () =>
		/** @type {HTMLInputElement | null} */ (racine.querySelector('input[name="langue"]:checked'))
			?.value ?? null;

	const montrerSousTitres = () => {
		phrases.replaceChildren(
			...sousTitres.phrases.map((phrase) => {
				const ligne = document.createElement('li');
				ligne.textContent = phrase;
				return ligne;
			})
		);
		enCours.textContent = sousTitres.enCours;
	};

	const ecoute = new Ecoute(
		base,
		{
			ouvrir: (adresse) => new WebSocket(adresse),
			plusTard: (rappel, ms) => setTimeout(rappel, ms),
			annuler: (minuterie) => clearTimeout(/** @type {number} */ (minuterie))
		},
		{
			etat(etat) {
				racine.dataset.etat = etat;
				statut.textContent = textes[etat] ?? '';
				const arrete = ETATS_D_ARRET.has(etat);
				bouton.textContent = arrete ? (textes['ecouter'] ?? '') : (textes['arreter'] ?? '');
				if (arrete) {
					ecran?.lacher();
					ecran = null;
				}
				if (etat !== 'direct') lecture?.reprendre();
			},
			texte(texte, definitif) {
				sousTitres.recevoir(texte, definitif);
				montrerSousTitres();
			},
			son(paquet, frequence) {
				if (!lecture) return;
				lecture.jouer(enFlottants(decoder(paquet)), frequence);
			}
		}
	);

	bouton.addEventListener('click', () => {
		if (!ETATS_D_ARRET.has(ecoute.etat)) {
			ecoute.arreter();
			void contexte?.suspend();
			return;
		}
		const langue = langueChoisie();
		if (langue === null) return;
		// Le son ne se lance que dans un geste : le contexte naît ici, ou y reprend.
		if (!contexte) {
			contexte = new AudioContext();
			lecture = new Lecture(contexte);
		}
		// Sur un iPhone, une page qui joue « un média » passe outre le bouton du silence.
		// Expérimental : posé là où il existe, sans s'y fier.
		if ('audioSession' in navigator) {
			try {
				/** @type {{ audioSession: { type: string } }} */ (
					/** @type {unknown} */ (navigator)
				).audioSession.type = 'playback';
			} catch {
				// Un navigateur qui ne l'accepte pas joue quand même.
			}
		}
		void contexte.resume();
		ecran ??= garderLEcranAllume();
		sousTitres.vider();
		montrerSousTitres();
		cadre.lang = langue;
		ecoute.ecouter(langue);
	});

	// Changer de langue pendant l'écoute rebranche ; à l'arrêt, le choix attend le bouton.
	racine.addEventListener('change', (evenement) => {
		const cible = /** @type {HTMLInputElement} */ (evenement.target);
		if (cible.name !== 'langue' || ETATS_D_ARRET.has(ecoute.etat)) return;
		sousTitres.vider();
		montrerSousTitres();
		cadre.lang = cible.value;
		ecoute.ecouter(cible.value);
	});
}

if (typeof document !== 'undefined') {
	const racine = document.querySelector('[data-jadwal-ecoute]');
	if (racine instanceof HTMLElement) demarrer(racine);
}
