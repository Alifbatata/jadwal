// Le micro du poste « Diffuser », dans le navigateur : le demander, le brancher sur le découpeur
// (`capture-worklet.js`), et rendre chaque morceau de 200 ms à la page (ADR 0056).
//
// Ce fichier ne tourne que dans un navigateur, et rien ici ne s'éprouve sans lui : la logique est
// ailleurs (`session.ts`, `capture-worklet.js`), et celui-ci se prouve dans Chrome, avec un faux
// micro. Relu dans MDN le 26 novembre 2026 : `getUserMedia`, `AudioContext`, `AudioWorkletNode`.

import captureUrl from './capture-worklet.js?url&no-inline';
import { TARGET_RATE } from './capture-worklet.js';

/** Pourquoi le micro n'a pas pu être pris, en mots que l'écran sait dire. */
export type MicrophoneError = 'denied' | 'missing' | 'busy' | 'unsupported';

export class MicrophoneFailure extends Error {
	readonly kind: MicrophoneError;
	constructor(kind: MicrophoneError) {
		super(`microphone: ${kind}`);
		this.kind = kind;
	}
}

export interface Capture {
	/** Rend le micro : plus un morceau ne part, et le voyant du navigateur s'éteint. */
	stop(): void;
}

/** Ce que `getUserMedia` refuse, ramené à ce que l'écran sait dire. */
function kindOf(error: unknown): MicrophoneError {
	const name = error instanceof DOMException ? error.name : '';
	// Refus de la personne, page non sûre, ou en-tête `Permissions-Policy` : le même nom.
	if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
	if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'missing';
	if (name === 'NotReadableError' || name === 'AbortError') return 'busy';
	return 'unsupported';
}

interface Graph {
	readonly context: AudioContext;
	readonly source: MediaStreamAudioSourceNode;
	readonly node: AudioWorkletNode;
}

/**
 * Branche le micro sur le découpeur, dans un contexte à la fréquence demandée, ou à celle du
 * navigateur quand aucune n'est demandée.
 */
async function connect(stream: MediaStream, sampleRate?: number): Promise<Graph> {
	const context = new AudioContext(sampleRate === undefined ? {} : { sampleRate });
	try {
		await context.audioWorklet.addModule(captureUrl);
		const source = context.createMediaStreamSource(stream);
		// Une entrée, ramenée à un canal, et aucune sortie : rien n'est rejoué dans les haut-parleurs.
		const node = new AudioWorkletNode(context, 'jadwal-capture', {
			numberOfInputs: 1,
			numberOfOutputs: 0,
			channelCount: 1,
			channelCountMode: 'explicit'
		});
		source.connect(node);
		// Un contexte créé hors d'un geste attend : celui-ci suit un appui, et repart tout de suite.
		await context.resume();
		return { context, source, node };
	} catch (error) {
		await context.close().catch(() => undefined);
		throw error;
	}
}

/**
 * Prend le micro et rend chaque morceau de son : PCM 16 bits, mono, 24 kHz, 200 ms, avec sa
 * crête de 0 à 1. Lève `MicrophoneFailure` quand le micro ne peut pas être pris.
 */
export async function startCapture(
	onChunk: (pcm: ArrayBuffer, peak: number) => void
): Promise<Capture> {
	if (
		typeof navigator === 'undefined' ||
		!navigator.mediaDevices?.getUserMedia ||
		typeof AudioWorkletNode === 'undefined'
	) {
		// Hors d'un contexte sûr (HTTPS), le navigateur ne donne même pas `mediaDevices`.
		throw new MicrophoneFailure('unsupported');
	}
	let stream: MediaStream;
	try {
		stream = await navigator.mediaDevices.getUserMedia({
			// Mono, sans annulation d'écho : ce poste ne rejoue rien. La réduction de bruit et le
			// gain automatique restent, pour une voix prise dans une salle ; à mesurer sur un vrai
			// prêche (étape 25, chantier 4).
			audio: {
				channelCount: 1,
				echoCancellation: false,
				noiseSuppression: true,
				autoGainControl: true
			},
			video: false
		});
	} catch (error) {
		throw new MicrophoneFailure(kindOf(error));
	}

	let graph: Graph;
	try {
		// D'abord à 24 kHz : le navigateur ramène alors lui-même le micro à la fréquence du relais,
		// mieux que le découpeur ne le ferait. S'il refuse cette fréquence, ou ce micro dans ce
		// contexte, on prend la sienne, et le découpeur fait le reste.
		graph = await connect(stream, TARGET_RATE).catch(() => connect(stream));
	} catch {
		for (const track of stream.getTracks()) track.stop();
		throw new MicrophoneFailure('unsupported');
	}

	const { context, source, node } = graph;
	node.port.onmessage = (event: MessageEvent<{ pcm: ArrayBuffer; peak: number }>) =>
		onChunk(event.data.pcm, event.data.peak);
	return {
		stop() {
			node.port.onmessage = null;
			source.disconnect();
			for (const track of stream.getTracks()) track.stop();
			void context.close().catch(() => undefined);
		}
	};
}

/**
 * Garde l'écran allumé : un téléphone qui s'endort coupe le micro. Le verrou tombe dès que la
 * page n'est plus visible ; il se redemande quand elle le redevient. Un navigateur qui ne connaît
 * pas ce verrou, ou qui le refuse (batterie faible), laisse le direct continuer sans lui.
 */
export function keepScreenOn(): { release(): void } {
	let sentinel: WakeLockSentinel | null = null;
	let released = false;
	const request = async (): Promise<void> => {
		if (released || document.visibilityState !== 'visible' || !('wakeLock' in navigator)) return;
		try {
			const acquired = await navigator.wakeLock.request('screen');
			if (released) void acquired.release().catch(() => undefined);
			else sentinel = acquired;
		} catch {
			sentinel = null;
		}
	};
	const onVisibility = (): void => void request();
	document.addEventListener('visibilitychange', onVisibility);
	void request();
	return {
		release() {
			released = true;
			document.removeEventListener('visibilitychange', onVisibility);
			void sentinel?.release().catch(() => undefined);
			sentinel = null;
		}
	};
}
