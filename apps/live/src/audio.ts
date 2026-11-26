// Le seul format de son que le relais connaisse, d'un bout à l'autre : ce que le poste « Diffuser »
// envoie, ce que le traducteur reçoit et rend, ce que le relais distribue.
//
// PCM 16 bits, mono, 24 kHz, petit-boutiste. C'est le seul format que l'un des services de
// traduction candidats accepte, et les autres le prennent aussi (ADR 0055) : le relais ne
// convertit donc rien, et ne regarde pas les octets qu'il passe.

export interface AudioFormat {
	readonly encoding: 'pcm_s16le';
	readonly sampleRate: number;
	readonly channels: number;
}

export const AUDIO_FORMAT: AudioFormat = { encoding: 'pcm_s16le', sampleRate: 24_000, channels: 1 };

/** Deux octets par échantillon. */
export const BYTES_PER_SAMPLE = 2;

/** 48 000 octets : une seconde de son. */
export const BYTES_PER_SECOND = AUDIO_FORMAT.sampleRate * AUDIO_FORMAT.channels * BYTES_PER_SAMPLE;
