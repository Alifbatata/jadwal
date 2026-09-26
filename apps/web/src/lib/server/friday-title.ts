// Le titre d'une session du vendredi, dans la langue de celui qui le lit (étape 18, retour D1).
//
// L'écran du vendredi n'écrit qu'un titre, dans la langue de l'organisation, et n'offre aucun moyen
// de le traduire. Quand ce titre est le nom que le service propose (« Prière du vendredi »,
// « Freitagsgebet »…), l'organisation n'a rien choisi : chacun lit donc le nom de la prière dans sa
// langue. Un titre que l'organisation a écrit elle-même reste tel quel.
//
// Les cinq noms comptent, et pas seulement celui de la langue de la session : jusqu'à l'étape 18,
// le service proposait « Prière du vendredi » dans toutes les langues, et des sessions écrites en
// allemand portent encore ce nom.
//
// Un seul endroit décide : la page publique, le programme sur un site et le flux agenda passent par
// `readPublicCourses` (`public.ts`), les messages prêts à coller par l'écran Partager, et tous
// appellent cette fonction.

import { LANGUES, t, type Langue } from '$lib/i18n.js';

/** Les noms que le service propose à une session du vendredi, un par langue. */
const PROPOSED: ReadonlySet<string> = new Set(LANGUES.map((langue) => t(langue).jumua));

/**
 * Le titre d'une séance tel que `reader` le lit : le nom de la prière dans sa langue pour une
 * session du vendredi qui porte le nom proposé, le titre inchangé sinon. Un cours n'est jamais
 * renommé, même s'il s'appelle comme la prière.
 */
export function fridayTitle(title: string, kind: string, reader: Langue): string {
	if (kind !== 'jumua' || typeof title !== 'string' || !PROPOSED.has(title.trim())) return title;
	return t(reader).jumua;
}
