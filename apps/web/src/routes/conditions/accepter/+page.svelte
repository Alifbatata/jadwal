<script lang="ts">
	import { resolve } from '$app/paths';
	import Texte from '$lib/conditions/Texte.svelte';
	import { termsTexts } from '$lib/i18n/terms.js';

	let { data } = $props();
	const text = $derived(termsTexts[data.language]);
</script>

<svelte:head><title>{text.title} | jadwal</title></svelte:head>

<h1>{text.title}</h1>

<p class="raison">
	{text.acceptIntro.before}
	<strong><bdi>{data.organisation}</bdi></strong>{text.acceptIntro.after}
</p>
<p class="version">{text.version(data.date)}</p>
<p class="version encore">{text.askedAgain}</p>
<!-- Avant le texte, et non sous le bouton : qui voulait entrer dans une autre organisation n'a pas à
     parcourir tout le document pour le trouver. -->
{#if data.autreOrganisation}
	<p><a href={resolve('/organisations')}>{text.otherOrganisation}</a></p>
{/if}

<!-- Le texte reste en français dans toutes les langues (retour D4), et le dit d'abord dans une autre. -->
{#if text.onlyInFrench}
	<p class="francais-seulement">{text.onlyInFrench}</p>
{/if}
<div lang="fr" dir="ltr">
	<Texte html={data.html} />
</div>

<div class="accord">
	<form method="post">
		<button type="submit">{text.accept}</button>
	</form>
	<p>{text.closedUntil(data.organisation)}</p>
</div>

<style>
	.raison {
		font-size: 1.05rem;
	}
	.version {
		color: #4a5560;
		font-size: 0.95rem;
	}
	.encore {
		margin-bottom: 1.5rem;
	}
	.francais-seulement {
		padding: 0.75rem 1rem;
		background: #eef6f5;
		border-block-end: 2px solid var(--accent);
		font-weight: 600;
	}
	.accord {
		margin-top: 2rem;
		padding-top: 1.25rem;
		border-top: 1px solid #c8ced4;
	}
	button {
		min-height: 44px;
		font: inherit;
		font-weight: 600;
		padding: 0.5rem 1rem;
		border-radius: 0.375rem;
		border: 1px solid var(--accent);
		background: var(--accent);
		color: var(--accent-texte);
		cursor: pointer;
	}
	.accord p {
		color: #4a5560;
		font-size: 0.95rem;
	}
</style>
