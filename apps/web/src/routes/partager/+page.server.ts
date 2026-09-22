// Partager : le lien public, le programme de la semaine en texte, le code à coller, un QR code.
//
// Les quatre existent depuis l'étape 6. Le code à coller est donné sous trois formes, parce qu'un
// site n'accepte pas toujours la première : la plus simple, celle qui porte une empreinte
// d'intégrité pour les sites qui l'exigent, et le cadre posé à la main pour ceux qui refusent tout
// script extérieur (`docs/INTEGRATION.md`).
//
// Le QR code est produit ici, sans dépendance : il pointe vers le lien public.

import { withSessionOrg } from '$lib/server/context.js';
import { mustBeInOrganisation } from '$lib/server/guard.js';
import { readProgramme } from '$lib/server/programme.js';
import { weekMessage } from '$lib/messages.js';
import { qrSvg } from '$lib/qr.js';
import { WIDGET_INTEGRITY, widgetPath } from '$lib/server/widget.js';
import type { PageServerLoad } from './$types.js';

const JOURS_AFFICHES = 7;
/** Hauteur du cadre posé à la main : sans script, personne ne peut l'ajuster au contenu. */
const HAUTEUR_CADRE = 900;

export const load: PageServerLoad = async (event) => {
	const context = await mustBeInOrganisation(event);
	const programme = await withSessionOrg(context, (tx) =>
		readProgramme(tx, new Date(), JOURS_AFFICHES, { statuses: ['published'] })
	);
	const slug = programme.settings.slug;
	const lienPublic = `${event.url.origin}/m/${slug}`;
	const repli = `  <a href="${lienPublic}">Voir le programme des cours</a>`;
	const element = `<jadwal-widget org="${slug}">\n${repli}\n</jadwal-widget>`;
	return {
		organisation: { name: programme.settings.name, slug },
		lienPublic,
		qr: qrSvg(lienPublic),
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
			`<iframe src="${lienPublic}" title="Programme des cours — ${programme.settings.name}"\n` +
			`        style="width:100%;height:${HAUTEUR_CADRE}px;border:0" loading="lazy"\n` +
			`        referrerpolicy="no-referrer"></iframe>`,
		messageSemaine: weekMessage(
			programme.settings.greeting,
			programme.settings.name,
			programme.seances.map((seance) => ({
				date: seance.date,
				title: seance.title,
				start: seance.start,
				end: seance.end,
				room: seance.room,
				anchor: seance.anchor,
				status: seance.status
			}))
		)
	};
};
