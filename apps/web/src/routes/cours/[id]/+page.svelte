<script lang="ts">
	import { untrack } from 'svelte';
	import FormulaireCours from '$lib/FormulaireCours.svelte';
	import { courseFormTexts } from '$lib/i18n/course-form.js';

	let { data, form } = $props();
	const text = $derived(courseFormTexts[data.language]);
	const title = $derived(data.titre ?? text.untitled);

	// Figées au premier rendu, comme le formulaire lui-même. Après un envoi refusé, ce que la
	// personne vient d'envoyer : elle n'a rien à retaper, et le résumé le montre.
	const values = untrack(() => form?.values ?? data.valeurs);
</script>

<svelte:head><title>{text.editHeading} {title} | {data.organisation.name}</title></svelte:head>

<h1>{text.editHeading} <bdi>{title}</bdi></h1>

<p class="intro">{text.intro}</p>

<FormulaireCours
	{values}
	languages={data.langues}
	rooms={data.salles}
	prayerModule={data.modulePrieres}
	language={data.language}
	submitLabel={text.submitEdit}
	errors={form?.errors ?? []}
	badDates={form?.badDates ?? []}
	datesBefore={form?.datesBefore ?? []}
	datesAfter={form?.datesAfter ?? []}
	untitledDescriptions={form?.untitledDescriptions ?? []}
/>

<style>
	.intro {
		color: #555;
		max-width: 32rem;
	}
</style>
