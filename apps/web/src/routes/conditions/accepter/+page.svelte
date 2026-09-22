<script lang="ts">
	import { resolve } from '$app/paths';
	import Texte from '$lib/conditions/Texte.svelte';

	let { data } = $props();
</script>

<svelte:head><title>Conditions d’utilisation | jadwal</title></svelte:head>

<h1>Conditions d’utilisation</h1>

<p class="raison">
	Avant d’entrer dans l’espace de <strong>{data.organisation}</strong>, lisez les conditions
	d’utilisation et acceptez-les. Elles disent ce que le service conserve, combien de temps, et ce
	que l’exploitant peut voir.
</p>
<p class="version">Version du {data.date}</p>
<!-- Avant le texte, et non sous le bouton : qui voulait entrer dans une autre organisation n'a pas à
     parcourir tout le document pour le trouver. -->
{#if data.plusieursOrganisations}
	<p><a href={resolve('/organisations')}>Choisir une autre organisation</a></p>
{/if}

<Texte html={data.html} />

<div class="accord">
	<form method="post">
		<button type="submit">J’accepte les conditions d’utilisation</button>
	</form>
	<p>Tant que vous ne les avez pas acceptées, l’espace de {data.organisation} reste fermé.</p>
</div>

<style>
	.raison {
		font-size: 1.05rem;
	}
	.version {
		color: #4a5560;
		font-size: 0.95rem;
		margin-bottom: 1.5rem;
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
