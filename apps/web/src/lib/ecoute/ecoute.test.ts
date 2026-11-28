import { describe, expect, it } from 'vitest';
import {
	ATTENTES_MS,
	AVANCE_MAXIMALE_S,
	AVANCE_S,
	decoder,
	Ecoute,
	enFlottants,
	Lecture,
	PHRASES_GARDEES,
	SousTitres
} from './ecoute.js';

/**
 * Les paquets témoins du codeur du relais, recopiés **à l'identique** de
 * `apps/live/src/adpcm.test.ts`, où ils ont été calculés à la main selon l'algorithme de l'IMA.
 * Le décodeur de la page doit en tirer exactement ces échantillons : si le codeur ou le décodeur
 * change, l'un des deux tests tombe.
 */
const WITNESS = [
	{
		samples: [0, 1000, 2000, -1000],
		packet: [0x00, 0x00, 0x00, 0x00, 0x70, 0xf7],
		decoded: [0, 11, 41, -22]
	},
	{ samples: [500, 500], packet: [0xf4, 0x01, 0x18, 0x00, 0x80], decoded: [509, 501] },
	{ samples: [100], packet: [0x64, 0x00, 0x00, 0x01, 0x00], decoded: [100] }
];

describe('le décodeur du son du direct', () => {
	it('tire des paquets témoins les échantillons du codeur du relais', () => {
		for (const { packet, decoded } of WITNESS) {
			expect([...decoder(new Uint8Array(packet).buffer)]).toEqual(decoded);
		}
	});

	it('lit un paquet au milieu d’un tampon plus grand', () => {
		const tampon = new Uint8Array([9, 9, ...WITNESS[0]!.packet, 9]);
		expect([...decoder(tampon.subarray(2, 2 + WITNESS[0]!.packet.length))]).toEqual(
			WITNESS[0]!.decoded
		);
	});

	it('rend un son vide, jamais une erreur, pour un paquet faux', () => {
		for (const faux of [[], [0, 0, 0], [0, 0, 89, 0, 0x77], [0, 0, 0, 2, 0x77]]) {
			expect(decoder(new Uint8Array(faux)).length).toBe(0);
		}
		expect([...decoder(new Uint8Array([0x10, 0x00, 0x05, 0x00]))]).toEqual([]);
	});

	it('ne déborde pas, et ramène le son entre -1 et 1', () => {
		// Le plus grand pas, et sept codes de hausse : la prédiction bute sur 32767.
		const haut = decoder(new Uint8Array([0xff, 0x7f, 88, 0, 0x77, 0x77]));
		expect([...haut]).toEqual([32767, 32767, 32767, 32767]);
		const bas = decoder(new Uint8Array([0x00, 0x80, 88, 0, 0xff]));
		expect([...bas]).toEqual([-32768, -32768]);
		expect([...enFlottants(new Int16Array([-32768, 0, 16384]))]).toEqual([-1, 0, 0.5]);
	});
});

/** Un contexte de son factice : une horloge qu'on avance, et ce qui a été placé. */
function contexteFactice() {
	const places: { quand: number; longueur: number; frequence: number }[] = [];
	const contexte = {
		currentTime: 10,
		destination: {},
		createBuffer(_canaux: number, longueur: number, frequence: number) {
			const donnees = new Float32Array(longueur);
			return { longueur, frequence, getChannelData: () => donnees };
		},
		createBufferSource() {
			const source = {
				buffer: null as null | { longueur: number; frequence: number },
				connect: () => undefined,
				start(quand: number) {
					places.push({
						quand,
						longueur: source.buffer!.longueur,
						frequence: source.buffer!.frequence
					});
				}
			};
			return source;
		}
	};
	return { contexte, places };
}

/** 200 ms de son, à 24 kHz. */
const MORCEAU = new Float32Array(4800);

describe('la lecture', () => {
	it('prend de l’avance au départ, puis met les morceaux bout à bout', () => {
		const { contexte, places } = contexteFactice();
		const lecture = new Lecture(contexte as unknown as BaseAudioContext);
		expect(lecture.jouer(MORCEAU, 24000)).toBe('place');
		expect(lecture.jouer(MORCEAU, 24000)).toBe('place');
		contexte.currentTime += 0.2;
		expect(lecture.jouer(MORCEAU, 24000)).toBe('place');
		const attendus = [10 + AVANCE_S, 10 + AVANCE_S + 0.2, 10 + AVANCE_S + 0.4];
		expect(places).toHaveLength(3);
		places.forEach((place, i) => expect(place.quand).toBeCloseTo(attendus[i]!, 9));
		expect(places.every((place) => place.frequence === 24000 && place.longueur === 4800)).toBe(
			true
		);
		expect(lecture.trous).toBe(0);
	});

	it('reprend avec la même avance après un trou', () => {
		const { contexte, places } = contexteFactice();
		const lecture = new Lecture(contexte as unknown as BaseAudioContext);
		lecture.jouer(MORCEAU, 24000);
		// Deux secondes sans rien : le morceau d'avant a fini depuis longtemps.
		contexte.currentTime += 2;
		lecture.jouer(MORCEAU, 24000);
		expect(places.at(-1)!.quand).toBeCloseTo(12 + AVANCE_S);
		expect(lecture.trous).toBe(1);
	});

	it('jette un morceau quand l’avance dépasse deux secondes', () => {
		const { contexte, places } = contexteFactice();
		const lecture = new Lecture(contexte as unknown as BaseAudioContext);
		// Une rafale : douze morceaux d'un coup, 2,4 s de son.
		const rendus = Array.from({ length: 12 }, () => lecture.jouer(MORCEAU, 24000));
		const places_ = rendus.filter((rendu) => rendu === 'place').length;
		expect(places_).toBe(Math.floor((AVANCE_MAXIMALE_S - AVANCE_S) / 0.2) + 1);
		expect(lecture.jetes).toBe(12 - places_);
		expect(places.at(-1)!.quand - contexte.currentTime).toBeLessThanOrEqual(AVANCE_MAXIMALE_S);
	});

	it('repart de l’avance après `reprendre`, et ne place pas un morceau vide', () => {
		const { contexte, places } = contexteFactice();
		const lecture = new Lecture(contexte as unknown as BaseAudioContext);
		lecture.jouer(MORCEAU, 24000);
		lecture.jouer(MORCEAU, 24000);
		lecture.reprendre();
		lecture.jouer(MORCEAU, 24000);
		expect(places.at(-1)!.quand).toBe(10 + AVANCE_S);
		expect(lecture.jouer(new Float32Array(0), 24000)).toBe('jete');
		expect(places).toHaveLength(3);
	});
});

describe('les sous-titres', () => {
	it('remplacent la phrase provisoire, et gardent les trois dernières définitives', () => {
		const sousTitres = new SousTitres();
		expect(sousTitres.recevoir('Au nom', false)).toBeNull();
		expect(sousTitres.recevoir('Au nom de Dieu', false)).toBeNull();
		expect(sousTitres.enCours).toBe('Au nom de Dieu');
		expect(sousTitres.recevoir('Au nom de Dieu.', true)).toBe('Au nom de Dieu.');
		expect(sousTitres.enCours).toBe('');
		for (const phrase of ['Deux.', 'Trois.', 'Quatre.']) sousTitres.recevoir(phrase, true);
		expect(sousTitres.phrases).toEqual(['Deux.', 'Trois.', 'Quatre.']);
		expect(PHRASES_GARDEES).toBe(3);
		sousTitres.vider();
		expect(sousTitres.phrases).toEqual([]);
	});
});

// ---------------------------------------------------------------------------------------------
// La liaison, avec de fausses prises et une fausse minuterie
// ---------------------------------------------------------------------------------------------

interface FaussePrise {
	adresse: string;
	binaryType: string;
	onmessage: ((evenement: { data: unknown }) => void) | null;
	onclose: (() => void) | null;
	fermee: boolean;
	close(): void;
	recevoir(message: unknown): void;
	tomber(): void;
}

const FORMAT = { encoding: 'ima_adpcm', sampleRate: 24000, channels: 1 };

function monde() {
	const prises: FaussePrise[] = [];
	const minuteries: { rappel: () => void; ms: number; annulee: boolean }[] = [];
	const etats: string[] = [];
	const textes: [string, boolean][] = [];
	const sons: [ArrayBuffer, number][] = [];
	const ecoute = new Ecoute(
		'wss://direct.example.org/listen/centre-demo/',
		{
			ouvrir(adresse) {
				const prise: FaussePrise = {
					adresse,
					binaryType: 'blob',
					onmessage: null,
					onclose: null,
					fermee: false,
					close() {
						prise.fermee = true;
					},
					recevoir(message) {
						prise.onmessage?.({
							data: message instanceof ArrayBuffer ? message : JSON.stringify(message)
						});
					},
					tomber() {
						prise.fermee = true;
						prise.onclose?.();
					}
				};
				prises.push(prise);
				return prise;
			},
			plusTard(rappel, ms) {
				const minuterie = { rappel, ms, annulee: false };
				minuteries.push(minuterie);
				return minuterie;
			},
			annuler(minuterie) {
				(minuterie as { annulee: boolean }).annulee = true;
			}
		},
		{
			etat: (etat) => void etats.push(etat),
			texte: (texte, definitif) => void textes.push([texte, definitif]),
			son: (paquet, frequence) => void sons.push([paquet, frequence])
		}
	);
	/** Fait sonner la dernière minuterie posée. */
	const sonner = () => {
		const minuterie = minuteries.at(-1)!;
		expect(minuterie.annulee).toBe(false);
		minuterie.rappel();
		return minuterie.ms;
	};
	return { ecoute, prises, minuteries, etats, textes, sons, sonner };
}

describe('la liaison d’écoute', () => {
	it('attend le direct, le suit, puis dit qu’il est fini et reste branchée', () => {
		const m = monde();
		m.ecoute.ecouter('de');
		expect(m.prises.map((prise) => prise.adresse)).toEqual([
			'wss://direct.example.org/listen/centre-demo/de'
		]);
		expect(m.prises[0]!.binaryType).toBe('arraybuffer');
		const prise = m.prises[0]!;
		prise.recevoir({ type: 'state', live: false });
		// Avant le direct, rien de ce qui arriverait ne passe.
		prise.recevoir(new ArrayBuffer(8));
		prise.recevoir({ type: 'text', text: 'trop tôt', final: true });
		prise.recevoir({ type: 'state', live: true, languages: ['fr', 'de'], format: FORMAT });
		const paquet = new ArrayBuffer(2404);
		prise.recevoir(paquet);
		prise.recevoir({ type: 'text', text: 'Bonjour', final: false });
		prise.recevoir({ type: 'state', live: false });
		prise.recevoir({ type: 'state', live: true, languages: ['de'], format: FORMAT });
		expect(m.etats).toEqual(['connexion', 'attente', 'direct', 'fini', 'direct']);
		expect(m.sons).toEqual([[paquet, 24000]]);
		expect(m.textes).toEqual([['Bonjour', false]]);
		expect(prise.fermee).toBe(false);
	});

	it('dit « fini » encore après une reprise, tant qu’aucun direct ne recommence', () => {
		const m = monde();
		m.ecoute.ecouter('fr');
		m.prises[0]!.recevoir({ type: 'state', live: true, format: FORMAT });
		m.prises[0]!.recevoir({ type: 'state', live: false });
		m.prises[0]!.tomber();
		m.sonner();
		m.prises[1]!.recevoir({ type: 'state', live: false });
		expect(m.etats).toEqual(['connexion', 'direct', 'fini', 'reprise', 'fini']);
	});

	it('refusée faute de place ou de langue, ne réessaie pas', () => {
		for (const [reason, etat] of [
			['full', 'plein'],
			['language', 'indisponible']
		]) {
			const m = monde();
			m.ecoute.ecouter('fr');
			m.prises[0]!.recevoir({ type: 'refused', reason });
			m.prises[0]!.tomber();
			expect(m.etats).toEqual(['connexion', etat]);
			expect(m.minuteries).toEqual([]);
			expect(m.prises).toHaveLength(1);
		}
	});

	it('se rebranche seule après une coupure, cinq fois au plus, puis dit la liaison perdue', () => {
		const m = monde();
		m.ecoute.ecouter('fr');
		m.prises[0]!.recevoir({ type: 'state', live: true, format: FORMAT });
		const attentes: number[] = [];
		for (let essai = 0; essai < ATTENTES_MS.length; essai++) {
			m.prises.at(-1)!.tomber();
			attentes.push(m.sonner());
		}
		expect(attentes).toEqual([1000, 2000, 4000, 8000, 8000]);
		expect(m.prises).toHaveLength(6);
		expect(new Set(m.prises.map((prise) => prise.adresse)).size).toBe(1);
		m.prises.at(-1)!.tomber();
		expect(m.etats).toEqual(['connexion', 'direct', 'reprise', 'perdu']);
		expect(m.prises).toHaveLength(6);
		expect(m.ecoute.etat).toBe('perdu');
	});

	it('repart de zéro essai dès que le relais répond', () => {
		const m = monde();
		m.ecoute.ecouter('fr');
		for (let fois = 0; fois < 8; fois++) {
			m.prises.at(-1)!.tomber();
			expect(m.sonner()).toBe(1000);
			m.prises.at(-1)!.recevoir({ type: 'state', live: false });
		}
		expect(m.ecoute.etat).toBe('attente');
	});

	it('change de langue en fermant l’ancienne liaison, dont plus rien ne passe', () => {
		const m = monde();
		m.ecoute.ecouter('fr');
		const ancienne = m.prises[0]!;
		ancienne.recevoir({ type: 'state', live: true, format: FORMAT });
		const onmessage = ancienne.onmessage;
		m.ecoute.ecouter('tr');
		expect(ancienne.fermee).toBe(true);
		expect(m.prises[1]!.adresse).toBe('wss://direct.example.org/listen/centre-demo/tr');
		m.prises[1]!.recevoir({ type: 'state', live: true, format: FORMAT });
		// Un message encore en route sur l'ancienne liaison ne compte plus, même en plein direct.
		onmessage?.({ data: new ArrayBuffer(4) });
		onmessage?.({ data: JSON.stringify({ type: 'state', live: false }) });
		expect(m.sons).toEqual([]);
		expect(m.etats).toEqual(['connexion', 'direct', 'connexion', 'direct']);
	});

	it('s’arrête, reprise en attente comprise', () => {
		const m = monde();
		m.ecoute.ecouter('fr');
		m.prises[0]!.tomber();
		m.ecoute.arreter();
		expect(m.minuteries[0]!.annulee).toBe(true);
		expect(m.etats).toEqual(['connexion', 'reprise', 'arret']);
		m.ecoute.ecouter('fr');
		m.prises[1]!.recevoir({ type: 'state', live: false });
		m.ecoute.arreter();
		expect(m.prises[1]!.fermee).toBe(true);
		expect(m.etats.at(-1)).toBe('arret');
	});

	it('refuse un son qu’elle ne sait pas lire, sans réessayer', () => {
		for (const format of [
			{ encoding: 'pcm_s16le', sampleRate: 24000, channels: 1 },
			{ encoding: 'ima_adpcm', sampleRate: 4000, channels: 1 },
			{ encoding: 'ima_adpcm', sampleRate: 24000, channels: 2 },
			undefined
		]) {
			const m = monde();
			m.ecoute.ecouter('fr');
			m.prises[0]!.recevoir({ type: 'state', live: true, format });
			expect(m.etats).toEqual(['connexion', 'format']);
			expect(m.prises[0]!.fermee).toBe(true);
			expect(m.minuteries).toEqual([]);
		}
	});

	it('ignore ce qui n’est pas un message du relais', () => {
		const m = monde();
		m.ecoute.ecouter('fr');
		const prise = m.prises[0]!;
		prise.onmessage?.({ data: 'pas du JSON' });
		prise.onmessage?.({ data: 'null' });
		prise.recevoir({ type: 'inconnu' });
		expect(m.etats).toEqual(['connexion']);
	});
});
