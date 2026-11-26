// La capture du micro du poste « Diffuser » : ce que le navigateur donne devient ce que le relais
// attend, du son PCM 16 bits, mono, à 24 kHz, par morceaux de 200 ms (ADR 0055, ADR 0056).
//
// Ce fichier est chargé tel quel par `audioWorklet.addModule` : il tourne hors de la page, dans le
// fil du son, sans `window` ni `document`. Il n'importe rien, et reste en JavaScript simple parce
// que rien ne le transforme avant le navigateur. Les tests importent `PcmChunker` directement ;
// le processeur, lui, ne s'inscrit que là où un navigateur l'attend.
//
// Rien n'est gardé : un morceau plein part vers la page, qui l'envoie au relais, et le tampon
// suivant est neuf.

/** La fréquence que le relais attend. */
export const TARGET_RATE = 24000;

/** 200 ms de son : la taille de morceau que les services de traduction demandent. */
export const CHUNK_SAMPLES = 4800;

/**
 * Ramène un flux d'échantillons à 24 kHz et le coupe en morceaux.
 *
 * La page demande au navigateur un contexte à 24 kHz, et le rapport vaut alors 1 : rien n'est
 * touché. Quand le navigateur en donne un autre, chaque échantillon rendu est la moyenne de ceux
 * reçus depuis le précédent (48 kHz : deux par deux), ou la reprise du dernier quand il en arrive
 * moins qu'il n'en faut. C'est assez pour de la voix ; ce n'est pas un filtre de studio.
 */
export class PcmChunker {
	/** Combien d'échantillons rendre par échantillon reçu. */
	#step;
	#emit;
	#chunk = new Int16Array(CHUNK_SAMPLES);
	#filled = 0;
	#peak = 0;
	/** La part d'échantillon à rendre déjà due : à 1, on en rend un. */
	#due = 0;
	#sum = 0;
	#count = 0;

	/**
	 * @param {number} inputRate la fréquence de ce qui est reçu, en hertz
	 * @param {(pcm: Int16Array, peak: number) => void} emit reçoit chaque morceau plein, et sa crête
	 *   de 0 à 1
	 */
	constructor(inputRate, emit) {
		this.#step = TARGET_RATE / inputRate;
		this.#emit = emit;
	}

	/** @param {Float32Array} samples des valeurs de -1 à 1, comme le navigateur les donne */
	push(samples) {
		for (let index = 0; index < samples.length; index += 1) {
			const sample = samples[index];
			// Une valeur qui n'est pas un nombre vaut un silence : elle ne doit pas gâter la moyenne.
			this.#sum += sample === sample ? sample : 0;
			this.#count += 1;
			this.#due += this.#step;
			if (this.#due < 1) continue;
			const value = this.#sum / this.#count;
			this.#sum = 0;
			this.#count = 0;
			while (this.#due >= 1) {
				this.#due -= 1;
				this.#write(value);
			}
		}
	}

	/** @param {number} value */
	#write(value) {
		// Bornée à la pleine échelle : une valeur trop forte sature, elle ne fait pas le tour.
		const bounded = Math.max(-1, Math.min(1, value));
		this.#chunk[this.#filled] = Math.round(bounded < 0 ? bounded * 32768 : bounded * 32767);
		this.#filled += 1;
		const level = Math.abs(bounded);
		if (level > this.#peak) this.#peak = level;
		if (this.#filled < CHUNK_SAMPLES) return;
		const full = this.#chunk;
		const peak = this.#peak;
		this.#chunk = new Int16Array(CHUNK_SAMPLES);
		this.#filled = 0;
		this.#peak = 0;
		this.#emit(full, peak);
	}
}

// Dans le fil du son d'un navigateur, et là seulement : `AudioWorkletProcessor`, `sampleRate` et
// `registerProcessor` y sont donnés par `AudioWorkletGlobalScope`.
if (typeof AudioWorkletProcessor !== 'undefined') {
	class CaptureProcessor extends AudioWorkletProcessor {
		constructor() {
			super();
			// Un `Int16Array` s'écrit dans l'ordre des octets de la machine. Tous les appareils qui
			// font tourner un navigateur aujourd'hui sont petit-boutistes, ce que le relais attend.
			this.chunker = new PcmChunker(sampleRate, (pcm, peak) => {
				// Le tampon est cédé, pas copié : le morceau suivant en a un neuf.
				this.port.postMessage({ pcm: pcm.buffer, peak }, [pcm.buffer]);
			});
		}

		/** @param {Float32Array[][]} inputs */
		process(inputs) {
			// Le premier canal de la première entrée : le micro est demandé en mono. Rien de
			// branché, ou un micro qui s'est tu : pas de canal, et rien à faire.
			const channel = inputs[0]?.[0];
			if (channel) this.chunker.push(channel);
			// Toujours `true` : le navigateur n'a pas à retirer ce nœud ; la page le débranche.
			return true;
		}
	}
	registerProcessor('jadwal-capture', CaptureProcessor);
}
