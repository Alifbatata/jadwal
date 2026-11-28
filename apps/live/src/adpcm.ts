// Le son servi à ceux qui écoutent : IMA ADPCM, 4 bits par échantillon, 24 kHz, mono (étape 25,
// chantier 3, ADR 0057).
//
// Le traducteur rend du PCM 16 bits (`audio.ts`) : 48 000 octets par seconde et par personne qui
// écoute, environ 100 Mo pour un prêche de 35 minutes sur le forfait d'un téléphone. Ce codage le
// divise par quatre sans dépendance, de part et d'autre : le relais code ici, une fois par morceau
// et par langue, quel que soit le nombre de personnes à l'écoute ; la page décode
// (`apps/web/src/lib/ecoute/ecoute.js`). Les deux sont écrits à part, et un paquet témoin,
// identique dans les tests des deux paquets, fait tomber l'un ou l'autre s'ils divergent.
//
// **Chaque paquet se décode seul** : son en-tête porte l'état du codeur au premier échantillon. Le
// serveur peut donc sauter un morceau pour un téléphone en retard (`sendAudioIfKeepingUp`) sans
// abîmer ce qui suit.
//
//   octets 0-1   le premier échantillon, entier signé de 16 bits, petit-boutiste
//   octet  2     l'indice du pas au premier échantillon, de 0 à 88
//   octet  3     1 si le dernier demi-octet ne porte pas d'échantillon (nombre impair), sinon 0
//   octets 4-…   deux échantillons par octet, le premier dans les quatre bits de poids faible
//
// L'algorithme est celui de l'IMA (Interactive Multimedia Association, « Recommended Practices for
// Enhancing Digital Audio Compatibility in Multimedia Systems », 1992), le même que celui des
// fichiers WAV `0x0011` ; seul l'en-tête est propre à jadwal.

import { AUDIO_FORMAT } from './audio.js';

export interface ListenerFormat {
	readonly encoding: 'ima_adpcm';
	readonly sampleRate: number;
	readonly channels: number;
}

/** Ce que le relais annonce à ceux qui écoutent, dans le message `state`. */
export const LISTENER_FORMAT: ListenerFormat = {
	encoding: 'ima_adpcm',
	sampleRate: AUDIO_FORMAT.sampleRate,
	channels: AUDIO_FORMAT.channels
};

/** Les quatre octets d'en-tête de chaque paquet. */
export const HEADER_BYTES = 4;

/**
 * Une seconde de son codé : un demi-octet par échantillon, et l'en-tête des cinq morceaux de
 * 200 ms que les services rendent en une seconde. Sert au seuil de retard du serveur.
 */
export const LISTENER_BYTES_PER_SECOND = AUDIO_FORMAT.sampleRate / 2 + 5 * HEADER_BYTES;

/** Les 89 pas de l'IMA. */
const STEPS = [
	7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73,
	80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494,
	544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499,
	2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487,
	12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767
];

/** Comment l'indice du pas bouge selon les trois bits de grandeur d'un code. */
const INDEX_MOVES = [-1, -1, -1, -1, 2, 4, 6, 8];

const clamp = (value: number, low: number, high: number): number =>
	value < low ? low : value > high ? high : value;

export interface AdpcmEncoder {
	/** Code un morceau de PCM 16 bits petit-boutiste. Un octet de trop, en fin, est ignoré. */
	encode(pcm: Buffer): Buffer;
}

/**
 * Un codeur pour une langue d'un direct. Il garde l'indice du pas d'un morceau à l'autre : sans
 * lui, chaque paquet repartirait du plus petit pas, et ses premières millisecondes seraient
 * étouffées.
 */
export function createAdpcmEncoder(): AdpcmEncoder {
	let index = 0;
	return {
		encode(pcm) {
			const samples = Math.floor(pcm.length / 2);
			const packet = Buffer.alloc(HEADER_BYTES + Math.ceil(samples / 2));
			if (samples === 0) {
				packet.writeUInt8(index, 2);
				return packet;
			}
			let predictor = pcm.readInt16LE(0);
			packet.writeInt16LE(predictor, 0);
			packet.writeUInt8(index, 2);
			packet.writeUInt8(samples % 2, 3);
			for (let i = 0; i < samples; i++) {
				let difference = pcm.readInt16LE(i * 2) - predictor;
				let code = 0;
				if (difference < 0) {
					code = 8;
					difference = -difference;
				}
				let step = STEPS[index] as number;
				// La différence que le décodeur reconstruira, calculée comme lui, bit par bit : c'est
				// elle, et non la vraie, qui fait avancer la prédiction.
				let delta = step >> 3;
				if (difference >= step) {
					code |= 4;
					difference -= step;
					delta += step;
				}
				step >>= 1;
				if (difference >= step) {
					code |= 2;
					difference -= step;
					delta += step;
				}
				step >>= 1;
				if (difference >= step) {
					code |= 1;
					delta += step;
				}
				predictor = clamp(code & 8 ? predictor - delta : predictor + delta, -32768, 32767);
				index = clamp(index + (INDEX_MOVES[code & 7] as number), 0, STEPS.length - 1);
				const at = HEADER_BYTES + (i >> 1);
				packet[at] = (packet[at] as number) | (i % 2 === 0 ? code : code << 4);
			}
			return packet;
		}
	};
}
