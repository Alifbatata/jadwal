// Transport de production : SMTP, par `nodemailer` (ADR 0024).
//
// SMTP plutôt qu'une API propriétaire : c'est le seul protocole que tous les hébergeurs parlent,
// donc le seul qui laisse changer de fournisseur sans changer une ligne de code. Un compte de
// messagerie ordinaire suffit — celui d'Infomaniak pour l'instance officielle.
//
// Le client est construit une fois pour le processus, jamais par courriel : chaque construction
// rouvrirait une connexion et une poignée de main TLS.

import { createTransport, type Transporter } from 'nodemailer';
import type { Mailer, OutgoingEmail } from './types.js';

export interface SmtpMailerOptions {
	host: string;
	port: number;
	/** Vrai pour le port 465, faux pour 587 avec STARTTLS. */
	secure: boolean;
	user?: string | undefined;
	password?: string | undefined;
	from: string;
	fromName?: string | undefined;
	/**
	 * Adresse à laquelle une réponse doit aller. La boîte d'envoi n'est pas lue : sans cet en-tête,
	 * une personne qui répond à un lien de connexion écrit dans le vide (étape 9).
	 */
	replyTo?: string | undefined;
	/** Nombre total de tentatives, la première comprise. */
	attempts?: number;
	/** Attente avant la deuxième tentative, doublée à chaque fois. */
	backoffMs?: number;
	/** Injectée par les tests pour ne pas attendre pour de vrai. */
	sleep?: (ms: number) => Promise<void>;
}

/** Trois tentatives : une panne passagère dure rarement plus de quelques secondes. */
const DEFAULT_ATTEMPTS = 3;
const DEFAULT_BACKOFF_MS = 500;
/** Sans délai, une connexion qui n'aboutit pas retient la requête jusqu'à ce que l'OS abandonne. */
const CONNECTION_TIMEOUT_MS = 10_000;
const GREETING_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 20_000;

const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Faut-il réessayer ? `responseCode` porte le code SMTP : 4xx est une panne passagère, 5xx un refus
 * définitif — réessayer un 5xx ne ferait que répéter le même refus. Une erreur sans code n'a pas
 * atteint le serveur (DNS, connexion, TLS, délai dépassé) : c'est passager par nature.
 */
export function isTemporary(error: unknown): boolean {
	const failure = error as { responseCode?: unknown; code?: unknown };
	const responseCode = failure.responseCode;
	if (typeof responseCode === 'number') return responseCode >= 400 && responseCode < 500;
	return true;
}

/**
 * Ce qu'un échec veut dire, en clair, pour les traces du serveur. **Ne porte jamais le contenu du
 * message** : un lien magique dans un fichier de traces vaut un mot de passe en clair. Seuls le
 * destinataire, le code et la commande SMTP en cause y figurent.
 */
export function describeSmtpFailure(error: unknown, to: string): string {
	const failure = error as {
		code?: unknown;
		responseCode?: unknown;
		command?: unknown;
		message?: unknown;
	};
	const parts = [`envoi à ${to} refusé`];
	if (typeof failure.code === 'string') parts.push(`code ${failure.code}`);
	if (typeof failure.responseCode === 'number') parts.push(`réponse SMTP ${failure.responseCode}`);
	if (typeof failure.command === 'string') parts.push(`commande ${failure.command}`);
	parts.push(isTemporary(error) ? 'passager' : 'définitif');
	return parts.join(', ');
}

export class SmtpMailer implements Mailer {
	readonly #transporter: Transporter;
	readonly #from: string;
	readonly #replyTo: string | undefined;
	readonly #attempts: number;
	readonly #backoffMs: number;
	readonly #sleep: (ms: number) => Promise<void>;

	constructor(options: SmtpMailerOptions, transporter?: Transporter) {
		this.#transporter =
			transporter ??
			createTransport({
				host: options.host,
				port: options.port,
				secure: options.secure,
				// Sur 587, exiger STARTTLS même si le serveur ne l'annonce pas : sans cela, un
				// serveur muet ferait passer les identifiants en clair.
				requireTLS: !options.secure,
				connectionTimeout: CONNECTION_TIMEOUT_MS,
				greetingTimeout: GREETING_TIMEOUT_MS,
				socketTimeout: SOCKET_TIMEOUT_MS,
				...(options.user && options.password
					? { auth: { user: options.user, pass: options.password } }
					: {})
			});
		this.#from = options.fromName ? `${options.fromName} <${options.from}>` : options.from;
		this.#replyTo = options.replyTo;
		this.#attempts = options.attempts ?? DEFAULT_ATTEMPTS;
		this.#backoffMs = options.backoffMs ?? DEFAULT_BACKOFF_MS;
		this.#sleep = options.sleep ?? wait;
	}

	async send(mail: OutgoingEmail): Promise<void> {
		let attempt = 0;
		let pause = this.#backoffMs;
		for (;;) {
			attempt += 1;
			try {
				await this.#transporter.sendMail({
					from: this.#from,
					...(this.#replyTo ? { replyTo: this.#replyTo } : {}),
					to: mail.to,
					subject: mail.subject,
					text: mail.text,
					html: mail.html
				});
				return;
			} catch (error) {
				const retryable = isTemporary(error) && attempt < this.#attempts;
				console.error(
					`[mail] ${describeSmtpFailure(error, mail.to)}` +
						(retryable ? `, nouvelle tentative dans ${pause} ms` : ', abandon')
				);
				if (!retryable) throw error;
				await this.#sleep(pause);
				pause *= 2;
			}
		}
	}
}
