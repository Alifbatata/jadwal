<script lang="ts">
	import { untrack } from 'svelte';
	import FormulaireCours from '$lib/FormulaireCours.svelte';
	import type { CourseFormValues } from '$lib/course-form.js';
	import { courseFormTexts } from '$lib/i18n/course-form.js';

	let { data, form } = $props();
	const text = $derived(courseFormTexts[data.language]);

	// Figées au premier rendu, comme le formulaire lui-même. Après un envoi refusé, ce que la
	// personne vient d'envoyer : elle n'a rien à retaper, et le résumé le montre.
	const values: CourseFormValues = untrack(() => {
		const langueParDefaut = data.langueParDefaut;
		return (
			form?.values ?? {
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
				titles: Object.fromEntries(data.langues.map((langue) => [langue, ''])),
				descriptions: Object.fromEntries(data.langues.map((langue) => [langue, '']))
			}
		);
	});
</script>

<svelte:head><title>{text.newTitle} | {data.organisation.name}</title></svelte:head>

<h1>{text.newTitle}</h1>

<p class="intro">{text.intro}</p>

<FormulaireCours
	{values}
	languages={data.langues}
	rooms={data.salles}
	prayerModule={data.modulePrieres}
	language={data.language}
	submitLabel={text.submitNew}
	errors={form?.errors ?? []}
	badDates={form?.badDates ?? []}
/>

<style>
	.intro {
		color: #555;
		max-width: 32rem;
	}
</style>
