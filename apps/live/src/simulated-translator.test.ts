import { describe, expect, it } from 'vitest';
import { BYTES_PER_SECOND } from './audio.js';
import { simulatedTranslator } from './simulated-translator.js';
import type { TranslationSink } from './translator.js';

interface Recu {
	audio: Map<string, Buffer[]>;
	text: { language: string; text: string; final: boolean }[];
	errors: string[];
}

function sink(): { recu: Recu; sink: TranslationSink } {
	const recu: Recu = { audio: new Map(), text: [], errors: [] };
	return {
		recu,
		sink: {
			audio(language, pcm) {
				recu.audio.set(language, [...(recu.audio.get(language) ?? []), pcm]);
			},
			text(language, text, final) {
				recu.text.push({ language, text, final });
			},
			error(message) {
				recu.errors.push(message);
			}
		}
	};
}

/** Du son reconnaissable : chaque octet vaut son rang. */
function son(octets: number, depart = 0): Buffer {
	return Buffer.from(Array.from({ length: octets }, (_, i) => (depart + i) % 256));
}

describe('le traducteur simulé', () => {
	it('rend à chaque langue le son reçu, tel quel', async () => {
		const { recu, sink: sortie } = sink();
		const session = await simulatedTranslator.open(['fr', 'de'], sortie);
		const morceau = son(4800);
		session.send(morceau);
		expect([...recu.audio.keys()]).toEqual(['fr', 'de']);
		expect(Buffer.concat(recu.audio.get('fr') ?? [])).toEqual(morceau);
		expect(Buffer.concat(recu.audio.get('de') ?? [])).toEqual(morceau);
		expect(recu.errors).toEqual([]);
	});

	it('rend un texte définitif par seconde de son, marqué comme simulé, dans chaque langue', async () => {
		const { recu, sink: sortie } = sink();
		const session = await simulatedTranslator.open(['fr', 'tr'], sortie);
		// Neuf dixièmes de seconde : pas encore de texte.
		for (let i = 0; i < 9; i++) session.send(son(BYTES_PER_SECOND / 10));
		expect(recu.text).toEqual([]);
		session.send(son(BYTES_PER_SECOND / 10));
		expect(recu.text).toEqual([
			{ language: 'fr', text: 'Traduction simulée (fr), seconde 1.', final: true },
			{ language: 'tr', text: 'Traduction simulée (tr), seconde 1.', final: true }
		]);
		// Deux secondes et demie d'un coup : deux textes de plus, pas trois.
		session.send(son(BYTES_PER_SECOND * 2.5));
		expect(recu.text.filter((t) => t.language === 'fr').map((t) => t.text)).toEqual([
			'Traduction simulée (fr), seconde 1.',
			'Traduction simulée (fr), seconde 2.',
			'Traduction simulée (fr), seconde 3.'
		]);
	});

	it('se tait une fois fermé', async () => {
		const { recu, sink: sortie } = sink();
		const session = await simulatedTranslator.open(['fr'], sortie);
		session.close();
		session.send(son(BYTES_PER_SECOND));
		expect(recu.audio.size).toBe(0);
		expect(recu.text).toEqual([]);
	});

	it('se nomme, pour que le journal dise ce qui traduit', () => {
		expect(simulatedTranslator.name).toBe('simulated');
	});
});
