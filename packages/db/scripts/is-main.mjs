// « Ce fichier est-il celui que Node a été chargé d'exécuter ? »
//
// La comparaison naïve `import.meta.filename === process.argv[1]` se trompe dès qu'un lien
// symbolique est sur le chemin : le chargeur de modules résout le lien, `process.argv[1]` non. Un
// déploiement qui lie la version courante (`/srv/app` -> `/releases/2026-09-20`) tombe exactement
// dessus, et le script se contente alors d'être importé : il ne fait rien et sort en 0, ce qui
// laisserait démarrer un service sur un schéma vide. On compare donc des chemins canoniques.

import { realpathSync } from 'node:fs';

/** @param {string} moduleFilename `import.meta.filename` du module appelant. */
export function isMainModule(moduleFilename) {
	const invoked = process.argv[1];
	if (invoked === undefined) return false;
	try {
		return realpathSync(invoked) === realpathSync(moduleFilename);
	} catch {
		// Le chemin invoqué n'existe plus : ce n'est alors sûrement pas ce module.
		return false;
	}
}
