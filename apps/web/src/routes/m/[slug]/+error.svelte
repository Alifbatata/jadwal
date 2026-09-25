<script lang="ts">
	// La page d'erreur des adresses publiques : un 404 dans la langue demandée, et aucun script.
	//
	// Pourquoi ici, à côté du layout de `/m/<identifiant>` : l'erreur est levée par la page, et
	// SvelteKit rend la page d'erreur la plus proche avec les seuls layouts qui la précèdent. Tant
	// qu'il n'y en avait pas ici, c'était celle de la racine, dont les options ne voient pas le
	// `csr = false` de `+layout.ts` : le 404 d'une organisation inconnue était la seule page de `/m/`
	// qui chargeait le JavaScript de SvelteKit, et il parlait français sous `/ar`.
	//
	// Une adresse qu'aucune route ne connaît irait encore à la racine, d'après la documentation de
	// SvelteKit : `[...reste]` les attrape toutes sous `/m/<identifiant>/` pour les amener ici.
	//
	// Le texte vient de `i18n.ts`, où le correcteur le relit dans sa langue ; la langue vient du corps
	// de l'erreur, posé par `introuvable` en même temps que celle de `<html>`.
	import { page } from '$app/state';
	import { t } from '$lib/i18n.js';

	const mots = $derived(t(page.error?.langue ?? 'fr'));
	const introuvable = $derived(page.status === 404);
	// Une autre erreur n'a pas de texte à elle : son code seul, qui ne dit rien de faux dans
	// aucune langue, plutôt qu'un « page introuvable » qui mentirait.
	const titre = $derived(introuvable ? mots.notFound : String(page.status));
</script>

<svelte:head>
	<title>{titre}</title>
</svelte:head>

<main>
	<h1>{titre}</h1>
	{#if introuvable}
		<p>{mots.notFoundHint}</p>
	{/if}
</main>

<style>
	/* La police, les couleurs et les titres viennent de la coquille racine, rendue autour. */
	main {
		max-width: 40rem;
		margin: 0 auto;
		padding: 1rem;
	}
</style>
