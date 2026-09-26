<script lang="ts">
	import Texte from '$lib/conditions/Texte.svelte';
	import { termsTexts } from '$lib/i18n/terms.js';

	let { data } = $props();
	const text = $derived(termsTexts[data.language]);
</script>

<svelte:head><title>{text.title} | jadwal</title></svelte:head>

<!-- Le texte reste en français dans toutes les langues : c'est celui que relit le juriste (retour
     D4). Dans une autre langue, une phrase le dit d'abord, dans cette langue. -->
{#if text.onlyInFrench}
	<p class="francais-seulement">{text.onlyInFrench}</p>
{/if}

<!-- Marqué comme français, et de gauche à droite même dans une page arabe : un lecteur d'écran le lit
     avec une voix française, et les listes et les tableaux gardent leur sens. -->
<div lang="fr" dir="ltr">
	<Texte html={data.html} />
</div>

<style>
	.francais-seulement {
		padding: 0.75rem 1rem;
		background: #eef6f5;
		border-block-end: 2px solid var(--accent);
		font-weight: 600;
	}
</style>
