<script lang="ts">
	// La mention d'une page relue sans réseau (étape 24, ADR 0054) : « Pas de réseau : voici la copie
	// gardée le 26.11.2026 à 14:05. »
	//
	// La page la porte **cachée**, avec deux creux vides. Tant que le réseau répond, personne ne la
	// voit ni ne l'entend. Quand il ne répond pas, le travailleur de service rend la dernière page
	// gardée après avoir retiré `hidden` et rempli les creux (`#lib/hors-reseau/copie.ts`,
	// `marquerCopie`) : la page n'a pas de script pour le faire elle-même, et n'en a pas besoin.
	//
	// Les trois attributs `data-jadwal-copie…` sont le contrat avec le travailleur : ils sont écrits
	// ici en toutes lettres, et `tests/hors-reseau.test.ts` passe la page servie par `marquerCopie`.
	//
	// En tête du contenu principal, donc dans un repère, et jamais dans le cadre du widget : c'est
	// l'appelant qui ne rend pas ce composant en mode intégré.
	import { t, type Langue } from '#lib/i18n.js';

	let { langue }: { langue: Langue } = $props();
	const mots = $derived(t(langue).offlineCopy);
</script>

<!-- Le jour et l'heure s'écrivent de gauche à droite, en arabe aussi, comme toutes les dates. -->
<p class="copie" hidden data-jadwal-copie>
	{mots.before}<span dir="ltr" data-jadwal-copie-jour></span>{mots.between}<span
		dir="ltr"
		data-jadwal-copie-heure
	></span>{mots.after}
</p>

<style>
	/* Pas de `display` ici : il l'emporterait sur `hidden`, et la mention se verrait toujours. */
	.copie {
		margin: 0 0 1rem;
		padding: 0.5rem 0.75rem;
		border: 1px solid #b45309;
		border-radius: 0.5rem;
		background: #fef3c7;
		color: #1a1a1a;
	}
</style>
