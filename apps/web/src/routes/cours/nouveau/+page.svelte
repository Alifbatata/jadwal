<script lang="ts">
	import { untrack } from 'svelte';
	import FormulaireCours from '$lib/FormulaireCours.svelte';

	let { data, form } = $props();

	// Figées au premier rendu, comme le formulaire lui-même.
	const langues = untrack(() => data.langues);
	const langueParDefaut = untrack(() => data.langueParDefaut);
	const valeurs = {
		status: 'draft',
		audience: 'open',
		teachingLanguages: [langueParDefaut],
		sourceLanguage: langueParDefaut,
		roomId: null,
		teacher: null,
		startsOn: '',
		endsOn: null,
		recurrenceKind: 'weekly',
		weekdays: [1],
		interval: 1,
		monthlyWeekday: 1,
		monthlyOrdinal: 1,
		dates: '',
		timingKind: 'fixed',
		start: '19:00',
		end: '20:30',
		prayer: 'maghrib',
		offsetMinutes: 15,
		durationMinutes: 60,
		titles: Object.fromEntries(langues.map((langue) => [langue, ''])),
		descriptions: Object.fromEntries(langues.map((langue) => [langue, '']))
	};
</script>

<svelte:head><title>Nouveau cours | {data.organisation.name}</title></svelte:head>

<h1>Nouveau cours</h1>

{#if form?.erreurs}
	<ul class="erreurs" role="alert">
		{#each form.erreurs as erreur (erreur)}
			<li>{erreur}</li>
		{/each}
	</ul>
{/if}

<FormulaireCours
	{valeurs}
	langues={data.langues}
	salles={data.salles}
	action=""
	libelleBouton="Créer le cours"
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
