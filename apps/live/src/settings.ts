// Les réglages du relais, lus une fois, au démarrage, dans l'environnement.
//
// Tout ce qui manque ou est faux **refuse le démarrage**, avec le nom de la variable : un relais
// à moitié réglé ne doit pas écouter. Et sans `JADWAL_LIVE_TRANSLATOR`, le direct est éteint :
// rien ne démarre, rien n'écoute (ADR 0055). Les variables sont décrites dans `.env.example`.

/** Les traducteurs que ce programme sait lancer. Un seul pour l'instant : le simulé. */
const TRANSLATORS = ['simulated'] as const;

/** Les sept langues du direct (ADR 0052). `JADWAL_LIVE_LANGUAGES` en choisit d'autres. */
const DEFAULT_LANGUAGES = 'fr,de,it,en,sq,bs,tr';

/** Un secret plus court se devine : c'est lui qui dit qui a le droit de diffuser. */
const MIN_SECRET_LENGTH = 32;

export interface Settings {
	readonly translator: (typeof TRANSLATORS)[number];
	readonly host: string;
	/** Zéro : le système choisit un port libre. */
	readonly port: number;
	/** Partagé avec le serveur web, qui signe les jetons du poste « Diffuser ». */
	readonly secret: string;
	/** L'origine du site : la seule d'où un navigateur a le droit d'ouvrir une liaison. */
	readonly origin: string;
	/** Les langues que ce relais accepte de servir. */
	readonly languages: readonly string[];
	/** Un direct s'arrête seul passé cette durée. */
	readonly maxBroadcastMs: number;
	/** Un direct s'arrête seul quand le poste n'envoie plus de son depuis ce temps. */
	readonly maxSilenceMs: number;
	/** Le plafond du mois, en minutes facturées : minutes de direct fois nombre de langues. */
	readonly monthlyMinutes: number;
	/** Le fichier du compteur du mois. */
	readonly counterFile: string;
	/** Combien de personnes peuvent écouter à la fois, toutes organisations confondues. */
	readonly maxListeners: number;
}

export type SettingsResult =
	| { readonly ok: true; readonly settings: Settings }
	| { readonly ok: false; readonly errors: string[] };

type Environment = Readonly<Record<string, string | undefined>>;

export function readSettings(env: Environment): SettingsResult {
	const errors: string[] = [];
	/** Une ligne vide de `.env` vaut une absence. */
	const read = (name: string): string | undefined => {
		const value = env[name]?.trim();
		return value === undefined || value === '' ? undefined : value;
	};

	const translator = read('JADWAL_LIVE_TRANSLATOR');
	if (translator === undefined) {
		errors.push(
			'JADWAL_LIVE_TRANSLATOR est absente : le direct est éteint, et le relais ne démarre pas.'
		);
	} else if (!(TRANSLATORS as readonly string[]).includes(translator)) {
		errors.push(
			`JADWAL_LIVE_TRANSLATOR : « ${translator} » n'est pas un traducteur connu (${TRANSLATORS.join(', ')}).`
		);
	}

	// Le secret n'est jamais recopié dans un message : un journal de démarrage se lit et se colle.
	const secret = read('JADWAL_LIVE_SECRET');
	if (secret === undefined) {
		errors.push(
			'JADWAL_LIVE_SECRET est absente : le relais ne saurait pas qui a le droit de diffuser.'
		);
	} else if (secret.length < MIN_SECRET_LENGTH) {
		errors.push(`JADWAL_LIVE_SECRET est trop courte : ${MIN_SECRET_LENGTH} caractères au moins.`);
	}

	const origin = read('JADWAL_LIVE_ORIGIN');
	if (origin === undefined) {
		errors.push("JADWAL_LIVE_ORIGIN est absente : c'est l'origine du site, comme ORIGIN.");
	} else if (!isOrigin(origin)) {
		errors.push(
			`JADWAL_LIVE_ORIGIN : « ${origin} » n'est pas une origine (schéma http ou https, hôte, port, sans chemin).`
		);
	}

	const counterFile = read('JADWAL_LIVE_COUNTER_FILE');
	if (counterFile === undefined) {
		errors.push(
			'JADWAL_LIVE_COUNTER_FILE est absente : sans compteur, rien ne plafonnerait la dépense du mois.'
		);
	}

	const languages = (read('JADWAL_LIVE_LANGUAGES') ?? DEFAULT_LANGUAGES)
		.split(',')
		.map((language) => language.trim());
	if (
		languages.some((language) => !/^[a-z]{2,3}$/.test(language)) ||
		new Set(languages).size !== languages.length
	) {
		errors.push(
			'JADWAL_LIVE_LANGUAGES : des codes de langue de deux ou trois lettres minuscules, séparés par des virgules, sans répétition.'
		);
	}

	const integer = (name: string, fallback: number, min: number, max: number): number => {
		const value = read(name);
		if (value === undefined) return fallback;
		const number = /^\d{1,7}$/.test(value) ? Number(value) : Number.NaN;
		if (!(number >= min && number <= max)) {
			errors.push(`${name} : un entier de ${min} à ${max}.`);
			return fallback;
		}
		return number;
	};
	const port = integer('JADWAL_LIVE_PORT', 3100, 0, 65_535);
	// Douze heures : au-delà, ce n'est plus un sermon, c'est un oubli.
	const maxMinutes = integer('JADWAL_LIVE_MAX_MINUTES', 60, 1, 720);
	const silenceSeconds = integer('JADWAL_LIVE_SILENCE_SECONDS', 30, 1, 3600);
	const monthlyMinutes = integer('JADWAL_LIVE_MONTHLY_MINUTES', 1600, 1, 1_000_000);
	const maxListeners = integer('JADWAL_LIVE_MAX_LISTENERS', 500, 1, 100_000);

	if (errors.length > 0) return { ok: false, errors };
	return {
		ok: true,
		settings: {
			translator: translator as Settings['translator'],
			host: read('JADWAL_LIVE_HOST') ?? '127.0.0.1',
			port,
			secret: secret as string,
			origin: origin as string,
			languages,
			maxBroadcastMs: maxMinutes * 60_000,
			maxSilenceMs: silenceSeconds * 1000,
			monthlyMinutes,
			counterFile: counterFile as string,
			maxListeners
		}
	};
}

/** Une origine telle qu'un navigateur l'écrit dans son en-tête `Origin` : rien après l'hôte. */
function isOrigin(value: string): boolean {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		return false;
	}
	return (url.protocol === 'http:' || url.protocol === 'https:') && url.origin === value;
}
