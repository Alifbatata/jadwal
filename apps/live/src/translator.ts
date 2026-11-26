// Ce que le relais attend d'un traducteur, quel qu'il soit (ADR 0055).
//
// Le relais donne la liste des langues, et le traducteur s'arrange : une session par langue chez
// les services qui n'en traduisent qu'une à la fois, une seule chez celui qui en traduit
// plusieurs. Le relais n'a pas à le savoir.

/** Là où le traducteur rend ce qu'il produit, langue par langue. */
export interface TranslationSink {
	/** De la voix traduite, au format de `audio.ts`. */
	audio(language: string, pcm: Buffer): void;
	/** Du texte traduit. `final` : cette phrase ne changera plus. */
	text(language: string, text: string, final: boolean): void;
	/**
	 * Le traducteur ne peut plus continuer. Le message est pour qui lit le code ou déverminera : le
	 * relais ne le recopie nulle part, parce qu'un service peut y glisser ce qu'il a entendu.
	 */
	error(message: string): void;
}

export interface TranslationSession {
	/** Le son du poste, au format de `audio.ts`, à mesure qu'il arrive. */
	send(pcm: Buffer): void;
	/** Fin : plus rien n'est rendu après cet appel. */
	close(): void;
}

export interface Translator {
	/** Le nom que le journal donne : il dit ce qui traduit, jamais avec quelle clé. */
	readonly name: string;
	/** Ouvre la traduction vers ces langues. La promesse aboutit quand le son peut être envoyé. */
	open(languages: readonly string[], sink: TranslationSink): Promise<TranslationSession>;
}
