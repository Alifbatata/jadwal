<script lang="ts">
	import FormulaireCours from '$lib/FormulaireCours.svelte';

	let { data, form } = $props();
</script>

<svelte:head><title>{data.titre} — {data.organisation.name}</title></svelte:head>

<h1>Modifier « {data.titre} »</h1>

{#if form?.erreurs}
	<ul class="erreurs" role="alert">
		{#each form.erreurs as erreur (erreur)}
			<li>{erreur}</li>
		{/each}
	</ul>
{/if}

<FormulaireCours
	valeurs={data.valeurs}
	langues={data.langues}
	salles={data.salles}
	action=""
	libelleBouton="Enregistrer"
/>

<style>
	.erreurs {
		color: #b91c1c;
		font-weight: 600;
		border: 1px solid #b91c1c;
		border-radius: 0.5rem;
		padding: 0.75rem 1.5rem;
	}
</style>
