import { describe, expect, it } from 'vitest';
import { CHUNK_SAMPLES, PcmChunker, TARGET_RATE } from './capture-worklet.js';

interface Chunk {
	pcm: Int16Array;
	peak: number;
}

/** Un son pur, tel qu'un micro le rendrait : des valeurs entre -1 et 1. */
function sine(rate: number, seconds: number, frequency: number, amplitude = 0.5): Float32Array {
	const samples = new Float32Array(Math.round(rate * seconds));
	for (let index = 0; index < samples.length; index += 1) {
		samples[index] = amplitude * Math.sin((2 * Math.PI * frequency * index) / rate);
	}
	return samples;
}

/** Passe un son au découpeur par blocs de 128, comme un navigateur le fait. */
function capture(rate: number, samples: Float32Array): Chunk[] {
	const chunks: Chunk[] = [];
	const chunker = new PcmChunker(rate, (pcm: Int16Array, peak: number) =>
		chunks.push({ pcm, peak })
	);
	for (let start = 0; start < samples.length; start += 128) {
		chunker.push(samples.subarray(start, start + 128));
	}
	return chunks;
}

function join(chunks: readonly Chunk[]): Int16Array {
	const all = new Int16Array(chunks.length * CHUNK_SAMPLES);
	chunks.forEach((chunk, index) => all.set(chunk.pcm, index * CHUNK_SAMPLES));
	return all;
}

/** La fréquence d'un son pur : ses passages par zéro en montant, par seconde. */
function frequencyOf(pcm: Int16Array, rate: number): number {
	let crossings = 0;
	for (let index = 1; index < pcm.length; index += 1) {
		if ((pcm[index - 1] as number) < 0 && (pcm[index] as number) >= 0) crossings += 1;
	}
	return (crossings * rate) / pcm.length;
}

describe('le découpage du son du micro', () => {
	it('vise 24 kHz et des morceaux de 200 ms', () => {
		expect(TARGET_RATE).toBe(24_000);
		expect(CHUNK_SAMPLES).toBe(4800);
	});

	it('à 24 kHz, rend les échantillons tels quels, en 16 bits', () => {
		const samples = new Float32Array(CHUNK_SAMPLES);
		samples.set([0, 0.5, -0.5, 1, -1, 2, -2, Number.NaN]);
		const [chunk, ...rest] = capture(24_000, samples);
		expect(rest).toEqual([]);
		expect(chunk?.pcm).toBeInstanceOf(Int16Array);
		expect(chunk?.pcm.length).toBe(CHUNK_SAMPLES);
		// Au-delà de la pleine échelle, la valeur est bornée : elle ne fait pas le tour.
		expect([...(chunk?.pcm.subarray(0, 8) ?? [])]).toEqual([
			0, 16384, -16384, 32767, -32768, 32767, -32768, 0
		]);
	});

	it('ne rend rien tant qu’un morceau n’est pas plein, et garde le reste', () => {
		const chunks: Chunk[] = [];
		const chunker = new PcmChunker(24_000, (pcm: Int16Array, peak: number) =>
			chunks.push({ pcm, peak })
		);
		chunker.push(new Float32Array(CHUNK_SAMPLES - 1));
		expect(chunks).toHaveLength(0);
		chunker.push(new Float32Array(1));
		expect(chunks).toHaveLength(1);
	});

	it('rend à chaque morceau un tampon neuf, qu’on peut céder', () => {
		const chunks = capture(24_000, new Float32Array(CHUNK_SAMPLES * 2));
		expect(chunks).toHaveLength(2);
		expect(chunks[0]?.pcm.buffer).not.toBe(chunks[1]?.pcm.buffer);
		expect(chunks[0]?.pcm.buffer.byteLength).toBe(CHUNK_SAMPLES * 2);
	});

	it.each([48_000, 44_100, 16_000, 96_000])(
		'ramène %i Hz à 24 kHz : la durée et la fréquence du son sont gardées',
		(rate) => {
			// Dix secondes et un bloc : le dernier morceau est plein quel que soit l'arrondi.
			const chunks = capture(rate, sine(rate, 10 + 128 / rate, 440));
			expect(chunks.length).toBe(50);
			expect(frequencyOf(join(chunks), TARGET_RATE)).toBeCloseTo(440, 0);
		}
	);

	it('donne la crête de chaque morceau, de 0 à 1', () => {
		const silence = capture(24_000, new Float32Array(CHUNK_SAMPLES));
		expect(silence[0]?.peak).toBe(0);
		const quiet = capture(48_000, sine(48_000, 0.4, 440, 0.25));
		expect(quiet[0]?.peak).toBeGreaterThan(0.2);
		expect(quiet[0]?.peak).toBeLessThanOrEqual(0.25);
		const loud = capture(24_000, new Float32Array(CHUNK_SAMPLES).fill(3));
		expect(loud[0]?.peak).toBe(1);
	});
});
