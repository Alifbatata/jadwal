import { describe, expect, it } from 'vitest';
import {
	createAdpcmEncoder,
	HEADER_BYTES,
	LISTENER_BYTES_PER_SECOND,
	LISTENER_FORMAT
} from './adpcm.js';
import { BYTES_PER_SECOND } from './audio.js';

/** Du PCM 16 bits petit-boutiste, à partir d'échantillons. */
function pcm(samples: readonly number[]): Buffer {
	const buffer = Buffer.alloc(samples.length * 2);
	samples.forEach((sample, i) => buffer.writeInt16LE(sample, i * 2));
	return buffer;
}

/**
 * Les paquets témoins, calculés à la main pas à pas selon l'algorithme de l'IMA, et recopiés
 * **à l'identique** dans `apps/web/src/lib/ecoute/ecoute.test.ts`, où le décodeur de la page doit
 * en tirer les échantillons écrits ici. Si l'un des deux côtés change, l'un des deux tests tombe.
 *
 * Premier paquet : 0, 1000, 2000, -1000, d'un codeur neuf (pas d'indice 0). Le second, du même
 * codeur : 500, 500 ; il part de l'indice 24 où le premier a laissé le codeur. Le troisième, d'un
 * codeur neuf : un seul échantillon, 100, et le drapeau du nombre impair.
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

/**
 * Un décodeur de référence, pour mesurer ce que le codeur perd. Il n'est pas celui de la page :
 * c'est le paquet témoin qui garantit que les deux s'accordent.
 */
function decode(packet: Buffer): number[] {
	const STEPS = [
		7, 8, 9, 10, 11, 12, 13, 14, 16, 17, 19, 21, 23, 25, 28, 31, 34, 37, 41, 45, 50, 55, 60, 66, 73,
		80, 88, 97, 107, 118, 130, 143, 157, 173, 190, 209, 230, 253, 279, 307, 337, 371, 408, 449, 494,
		544, 598, 658, 724, 796, 876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066, 2272, 2499,
		2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358, 5894, 6484, 7132, 7845, 8630, 9493, 10442,
		11487, 12635, 13899, 15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767
	];
	const MOVES = [-1, -1, -1, -1, 2, 4, 6, 8];
	let predictor = packet.readInt16LE(0);
	let index = packet.readUInt8(2);
	const count = (packet.length - HEADER_BYTES) * 2 - packet.readUInt8(3);
	const out: number[] = [];
	for (let i = 0; i < count; i++) {
		const byte = packet[HEADER_BYTES + (i >> 1)] as number;
		const code = i % 2 === 0 ? byte & 15 : byte >> 4;
		const step = STEPS[index] as number;
		let delta = step >> 3;
		if (code & 4) delta += step;
		if (code & 2) delta += step >> 1;
		if (code & 1) delta += step >> 2;
		predictor = Math.max(-32768, Math.min(32767, code & 8 ? predictor - delta : predictor + delta));
		index = Math.max(0, Math.min(88, index + (MOVES[code & 7] as number)));
		out.push(predictor);
	}
	return out;
}

/**
 * Une voix de synthèse : une fondamentale qui glisse de 110 à 220 Hz et ses six premières
 * harmoniques, décroissantes, sous une enveloppe de syllabes (quatre par seconde). Plus dure à
 * coder qu'un son pur, et plus proche de ce que le traducteur rendra.
 */
function syntheticVoice(seconds: number): number[] {
	const rate = LISTENER_FORMAT.sampleRate;
	const out: number[] = [];
	let phase = 0;
	for (let i = 0; i < seconds * rate; i++) {
		const t = i / rate;
		phase += (2 * Math.PI * (110 + 110 * ((t / seconds) % 1))) / rate;
		let value = 0;
		for (let h = 1; h <= 6; h++) value += Math.sin(h * phase) / h;
		const syllable = Math.max(0, Math.sin(2 * Math.PI * 4 * t));
		out.push(Math.round(value * syllable * 9000));
	}
	return out;
}

/** Le rapport signal sur bruit, en décibels. */
function snr(original: readonly number[], decoded: readonly number[]): number {
	let signal = 0;
	let noise = 0;
	original.forEach((sample, i) => {
		signal += sample * sample;
		noise += (sample - (decoded[i] as number)) ** 2;
	});
	return 10 * Math.log10(signal / noise);
}

describe('le codage du son servi', () => {
	it('rend les paquets témoins, et garde le pas d’un morceau à l’autre', () => {
		const encoder = createAdpcmEncoder();
		expect([...encoder.encode(pcm(WITNESS[0]!.samples))]).toEqual(WITNESS[0]!.packet);
		expect([...encoder.encode(pcm(WITNESS[1]!.samples))]).toEqual(WITNESS[1]!.packet);
		expect([...createAdpcmEncoder().encode(pcm(WITNESS[2]!.samples))]).toEqual(WITNESS[2]!.packet);
		for (const { packet, decoded } of WITNESS) expect(decode(Buffer.from(packet))).toEqual(decoded);
	});

	it('divise le poids par quatre', () => {
		const encoder = createAdpcmEncoder();
		const morceau = pcm(syntheticVoice(0.2));
		const packet = encoder.encode(morceau);
		expect(morceau.length).toBe(9600);
		expect(packet.length).toBe(HEADER_BYTES + 2400);
		expect(LISTENER_BYTES_PER_SECOND).toBe(12_020);
		expect(BYTES_PER_SECOND / LISTENER_BYTES_PER_SECOND).toBeGreaterThan(3.99);
	});

	it('garde une voix intelligible : plus de 25 dB de signal sur bruit, par morceaux de 200 ms', () => {
		const voice = syntheticVoice(5);
		const encoder = createAdpcmEncoder();
		const decoded: number[] = [];
		for (let i = 0; i < voice.length; i += 4800) {
			decoded.push(...decode(encoder.encode(pcm(voice.slice(i, i + 4800)))));
		}
		expect(decoded.length).toBe(voice.length);
		expect(snr(voice, decoded)).toBeGreaterThan(25);
	});

	it('se décode paquet par paquet, même quand on en saute', () => {
		const voice = syntheticVoice(1);
		const encoder = createAdpcmEncoder();
		const packets = [0, 1, 2, 3, 4].map((n) =>
			encoder.encode(pcm(voice.slice(n * 4800, (n + 1) * 4800)))
		);
		// Le troisième seul, comme un téléphone qui aurait perdu les deux premiers.
		const third = decode(packets[2]!);
		expect(snr(voice.slice(9600, 14_400), third)).toBeGreaterThan(25);
	});

	it('ne déborde pas sur un son saturé, et ignore un octet de trop', () => {
		const square = Array.from({ length: 480 }, (_, i) => (i % 48 < 24 ? 32767 : -32768));
		const decoded = decode(createAdpcmEncoder().encode(pcm(square)));
		expect(decoded.every((sample) => sample >= -32768 && sample <= 32767)).toBe(true);
		expect(decoded.slice(-10).some((sample) => sample < -30_000)).toBe(true);
		const odd = Buffer.concat([pcm([100]), Buffer.from([7])]);
		expect([...createAdpcmEncoder().encode(odd)]).toEqual(WITNESS[2]!.packet);
		expect([...createAdpcmEncoder().encode(Buffer.alloc(0))]).toEqual([0, 0, 0, 0]);
	});
});
