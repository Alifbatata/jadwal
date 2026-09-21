// Le seul point de contact entre l'application et l'envoi de courriel.
//
// Une seule méthode, deux implémentations : un dossier de sortie en développement et pendant les
// tests, SMTP en production. L'application ne connaît ni l'une ni l'autre — c'est cette interface,
// et elle seule, qui a permis de remplacer AWS SES par SMTP sans toucher à une route (ADR 0024).

/** Un courriel prêt à partir. Texte et HTML sont tous deux obligatoires : certains clients de
 * messagerie n'affichent que l'un des deux, et un lien de connexion ne doit jamais être illisible. */
export interface OutgoingEmail {
	readonly to: string;
	readonly subject: string;
	readonly text: string;
	readonly html: string;
}

export interface Mailer {
	send(mail: OutgoingEmail): Promise<void>;
}

/** Transports connus. `file` est le défaut : oublier la configuration n'envoie jamais rien. */
export const MAIL_TRANSPORTS = ['file', 'smtp'] as const;
export type MailTransport = (typeof MAIL_TRANSPORTS)[number];
