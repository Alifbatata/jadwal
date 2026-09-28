// Partager : le lien public, le programme de la semaine en texte, le code à coller, un QR code.
//
// Les quatre existent depuis l'étape 6. Le code à coller est donné sous trois formes, parce qu'un
// site n'accepte pas toujours la première : la plus simple, le cadre posé à la main pour ceux qui
// refusent tout script extérieur, et celle qui porte une empreinte d'intégrité pour les sites qui
// l'exigent (`docs/INTEGRATION.md`).
//
// Depuis l'étape 18 (retour D1), le message de la semaine s'écrit dans chacune des langues que
// l'organisation publie, la sienne d'abord : ce sont les langues que sa communauté lit. Un cours y
// porte son titre dans la langue du message quand il est traduit, sinon dans sa langue source,
// comme sur la page publique. Les mots écrits dans le code, eux, sont ceux de la langue de
// l'organisation : ce sont ses visiteurs qui les liront, pas la personne devant l'écran.
//
// Le QR code est produit ici, sans dépendance : il pointe vers le lien public.

import { sql } from '@jadwal/db';
import { isLangue, type Langue } from '$lib/i18n.js';
import { shareTexts } from '$lib/i18n/share.js';
import { weekMessage } from '$lib/messages.js';
import { qrSvg } from '$lib/qr.js';
import { withSessionOrg } from '$lib/server/context.js';
import { fridayTitle } from '$lib/server/friday-title.js';
import { mustBeInOrganisation } from '$lib/server/guard.js';
import { readProgramme } from '$lib/server/programme.js';
import { WIDGET_INTEGRITY, widgetPath } from '$lib/server/widget.js';
import type { PageServerLoad } from './$types.js';

const JOURS_AFFICHES = 7;
/** Hauteur du cadre posé à la main : sans script, personne ne peut l'ajuster au contenu. */
const HAUTEUR_CADRE = 900;

function lignes<T>(result: unknown): T[] {
	if (Array.isArray(result)) return result as T[];
	const rows = (result as { rows?: unknown[] }).rows;
	return Array.isArray(rows) ? (rows as T[]) : [];
}

/**
 * Les langues du message : celle de l'organisation d'abord, puis les autres qu'elle publie, dans
 * son ordre. Une langue que l'interface ne parle pas n'a pas de message.
 */
function languesDuMessage(source: Langue, publiees: readonly string[]): Langue[] {
	return [source, ...publiees.filter(isLangue).filter((langue) => langue !== source)];
}

export const load: PageServerLoad = async (event) => {
	const context = await mustBeInOrganisation(event);
	const { programme, traductions } = await withSessionOrg(context, async (tx) => ({
		programme: await readProgramme(tx, new Date(), JOURS_AFFICHES, { statuses: ['published'] }),
		// Le titre de chaque cours dans chaque langue où il existe. Un cours qui n'en a pas dans la
		// langue d'un message y garde celui du programme, dans sa langue source.
		traductions: lignes<{ course_id: string; language: string; title: string }>(
			await tx.execute(sql`
				select "course_id", "language", "title" from "course_translation"
				where "title" is not null
			`)
		)
	}));
	const settings = programme.settings;
	const source: Langue = isLangue(settings.default_language) ? settings.default_language : 'fr';
	const titres = new Map(
		traductions.map((ligne) => [`${ligne.course_id} ${ligne.language}`, ligne.title])
	);
	const sortes = new Map(programme.courses.map((cours) => [cours.id, cours.kind]));
	/**
	 * Le titre d'une séance dans la langue d'un message : sa traduction, sinon son titre source ; et
	 * pour une session du vendredi qui porte le nom proposé, le nom de la prière dans cette langue,
	 * comme sur la page publique (`friday-title.ts`).
	 */
	const titreEn = (seance: (typeof programme.seances)[number], langue: Langue) =>
		fridayTitle(
			titres.get(`${seance.courseId} ${langue}`) ?? seance.title,
			sortes.get(seance.courseId) ?? 'course',
			langue
		);
	const slug = settings.slug;
	const lienPublic = `${event.url.origin}/m/${slug}`;
	const mots = shareTexts[source].codeWords;
	const repli = `  <a href="${lienPublic}">${mots.fallbackLink}</a>`;
	const element = `<jadwal-widget org="${slug}">\n${repli}\n</jadwal-widget>`;
	return {
		organisation: { name: settings.name, slug },
		lienPublic,
		qr: qrSvg(lienPublic, { title: shareTexts[event.locals.langue ?? 'fr'].qr.label }),
		/** La langue des mots écrits dans le code, pour son attribut `lang`. */
		langueDuCode: source,
		hauteurCadre: HAUTEUR_CADRE,
		// Le code ordinaire : l'adresse mouvante, qui reçoit les corrections toute seule.
		codeEmbarque: `<script src="${event.url.origin}/widget/jadwal-widget.js"></script>\n${element}`,
		// Le code verrouillé : l'adresse versionnée et son empreinte. `crossorigin` n'est pas
		// facultatif — sans lui, l'empreinte ne dégrade pas, elle bloque le script à cent pour cent.
		codeVerrouille:
			`<script src="${event.url.origin}${widgetPath()}"\n` +
			`        integrity="${WIDGET_INTEGRITY}"\n` +
			`        crossorigin="anonymous"></script>\n${element}`,
		// Le cadre posé à la main, pour un site qui refuse tout script extérieur. Sans script,
		// personne n'ajuste la hauteur : elle est donc fixée, et le cadre défile à l'intérieur.
		// L'adresse ne porte pas `embed=1`, et c'est voulu : le mode intégré retire la barre de
		// défilement interne, dont ce cadre-là a justement besoin.
		//
		// `referrerpolicy="no-referrer"` n'est pas décoratif : sans lui, le navigateur enverrait
		// l'adresse de la page de l'organisation dans l'en-tête `Referer` à chaque affichage. Nous
		// ne l'écrivons nulle part, mais une promesse se tient mieux quand la donnée n'arrive pas
		// (ADR 0032). Le widget pose la même règle sur le cadre qu'il crée.
		codeCadre:
			`<iframe src="${lienPublic}" title="${mots.frameName} – ${settings.name}"\n` +
			`        style="width:100%;height:${HAUTEUR_CADRE}px;border:0" loading="lazy"\n` +
			`        referrerpolicy="no-referrer"></iframe>`,
		messages: languesDuMessage(source, settings.enabled_language).map((langue) => ({
			language: langue,
			text: weekMessage(
				settings.greeting,
				settings.name,
				programme.seances.map((seance) => ({
					date: seance.date,
					title: titreEn(seance, langue),
					start: seance.start,
					end: seance.end,
					room: seance.room,
					anchor: seance.anchor,
					status: seance.status,
					originalDate: seance.originalDate,
					// Annulée, la ligne dit « (SÉANCE ANNULÉE) » ou « (SESSION ANNULÉE) » (étape 20, C4).
					kind: sortes.get(seance.courseId) ?? 'course'
				})),
				langue
			)
		}))
	};
};
