<script lang="ts">
	import { resolve } from '$app/paths';
	import type { IsoDate } from '@jadwal/core';
	import { audienceLabel, describeRecurrence, describeTiming, shortDate } from '$lib/format.js';
	import { coursesTexts } from '$lib/i18n/courses.js';

	let { data, form } = $props();
	const text = $derived(coursesTexts[data.language]);
	const statuses: Record<string, string> = $derived(text.statuses);
</script>

<svelte:head><title>{text.title} | {data.organisation.name}</title></svelte:head>

<h1>{text.title}</h1>

<p class="details">{text.intro}</p>

{#if form?.error}<p class="erreur" role="alert">{text.errors[form.error]}</p>{/if}
{#if form?.pauseAdded}<p class="fait" role="status">{text.pauseAdded}</p>{/if}
{#if form?.pauseRemoved}<p class="fait" role="status">{text.pauseRemoved}</p>{/if}
{#if form?.courseDeleted}<p class="fait" role="status">{text.courseDeleted}</p>{/if}

<p><a class="bouton" href={resolve('/cours/nouveau')}>{text.add}</a></p>

{#if data.courses.length === 0}
	<p class="vide">{text.none}</p>
{/if}

<ul>
	{#each data.courses as course (course.id)}
		<li>
			<p class="titre" id={`course-${course.id}`}>
				<bdi>{course.title ?? text.untitled}</bdi>
				<span class="statut">{statuses[course.status] ?? course.status}</span>
			</p>
			<p class="details">
				{text.schedule(
					describeRecurrence(course.recurrence, data.language),
					describeTiming(course.timing, data.language)
				)}
			</p>
			<p class="details">
				{text.audience}
				{audienceLabel(course.audience, data.language)}
				{#if course.room}· {text.room} <bdi>{course.room}</bdi>{/if}
				{#if course.teacher}· {text.teacher} <bdi>{course.teacher}</bdi>{/if}
			</p>
			<p>
				<!-- Le titre du cours complète le nom du lien pour un lecteur d'écran : dix liens
				     « Modifier ce cours » de suite ne disent pas lequel. -->
				<a href={resolve('/cours/[id]', { id: course.id })} aria-describedby={`course-${course.id}`}
					>{text.edit}</a
				>
			</p>
			<!-- La personne responsable seule (ADR 0046). Un élément `details` natif : fermé, il ne montre
			     que « Supprimer ce cours » ; le navigateur l'ouvre seul, sans script, sur ce que la
			     suppression emporte et le bouton qui la confirme, comme pour une session du vendredi. -->
			{#if data.canDelete}
				<details class="repli">
					<summary class="danger-plat" aria-describedby={`course-${course.id}`}
						>{text.deleteCourse}</summary
					>
					<form method="post" action="?/supprimer" class="confirmation">
						<input type="hidden" name="courseId" value={course.id} />
						<p>{text.deleteWarning}</p>
						<button type="submit" class="danger">{text.deleteConfirm}</button>
					</form>
				</details>
			{/if}
		</li>
	{/each}
</ul>

<section aria-labelledby="pauses-titre">
	<h2 id="pauses-titre">{text.pausesTitle}</h2>
	<p class="details">{text.pausesIntro}</p>

	{#if data.pauses.length === 0}
		<p class="vide">{text.noPauses}</p>
	{:else}
		<ul>
			{#each data.pauses as pause (pause.id)}
				<li>
					<p class="titre">
						{#if pause.courseId}
							<bdi>{pause.course ?? text.untitled}</bdi>
						{:else}
							{text.wholeOrganisation}
						{/if}
					</p>
					<p class="details">
						{text.period(
							shortDate(pause.from as IsoDate, data.language),
							shortDate(pause.to as IsoDate, data.language)
						)}
						{#if pause.reason}· <bdi>{pause.reason}</bdi>{/if}
					</p>
					<form method="post" action="?/supprimerPause">
						<input type="hidden" name="pauseId" value={pause.id} />
						<button type="submit">{text.deletePause}</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}

	<h3>{text.newPauseTitle}</h3>
	<form method="post" action="?/pause" class="colonne">
		<label for="pause-course">{text.pauseCourseLabel}</label>
		<select id="pause-course" name="courseId">
			<option value="">{text.wholeOrganisation}</option>
			{#each data.courses as course (course.id)}
				<option value={course.id}>{course.title ?? text.untitled}</option>
			{/each}
		</select>

		<!-- Les bornes de l'action : le calendrier ne propose pas une date qu'elle refuserait. -->
		<label for="pause-from">{text.pauseFromLabel}</label>
		<input
			id="pause-from"
			type="date"
			name="from"
			min={data.dates.first}
			max={data.dates.last}
			required
		/>

		<label for="pause-to">{text.pauseToLabel}</label>
		<input
			id="pause-to"
			type="date"
			name="to"
			min={data.dates.first}
			max={data.dates.last}
			required
		/>

		<label for="pause-reason">
			{text.pauseReasonLabel} <span class="marque">{text.optional}</span>
		</label>
		<input
			id="pause-reason"
			type="text"
			name="reason"
			maxlength="120"
			aria-describedby="pause-reason-hint"
		/>
		<p class="aide" id="pause-reason-hint">{text.pauseReasonHint}</p>

		<button type="submit">{text.addPause}</button>
	</form>
</section>

<style>
	ul {
		list-style: none;
		padding: 0;
	}
	li {
		border: 1px solid #ddd;
		border-radius: 0.5rem;
		padding: 0.75rem;
		margin-bottom: 0.75rem;
	}
	.titre {
		font-weight: 600;
		margin: 0;
	}
	.details {
		color: #555;
		font-size: 0.95rem;
		margin: 0.25rem 0 0;
	}
	.statut {
		font-size: 0.8rem;
		background: #e5e7eb;
		border-radius: 0.25rem;
		padding: 0.1rem 0.4rem;
	}
	/* Le triangle du navigateur reste : c'est lui qui dit qu'on peut ouvrir. La hauteur de la ligne
	   donne au résumé une cible de 44 pixels. */
	summary {
		cursor: pointer;
		font-weight: 600;
		padding: 0.65rem 0;
	}
	.danger-plat {
		color: #b91c1c;
	}
	.confirmation {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		background: #fee2e2;
		border-radius: 0.375rem;
		padding: 0.5rem 0.75rem;
	}
	.confirmation p {
		margin: 0;
	}
	button.danger {
		background: #b91c1c;
		border-color: #b91c1c;
		color: #fff;
	}
	.colonne {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-width: 24rem;
	}
	button,
	select,
	input,
	.bouton {
		min-height: 44px;
		font: inherit;
		padding: 0 0.75rem;
		border-radius: 0.375rem;
		border: 1px solid #888;
		background: #fff;
	}
	button,
	.bouton {
		background: var(--accent);
		color: var(--accent-texte);
		border-color: var(--accent);
		cursor: pointer;
		display: inline-flex;
		align-items: center;
		text-decoration: none;
	}
	label {
		font-size: 0.9rem;
		font-weight: 600;
	}
	.marque {
		font-weight: 400;
		color: #555;
	}
	.aide {
		font-size: 0.85rem;
		color: #555;
		margin: 0;
	}
	h3 {
		font-size: 1rem;
		margin: 1rem 0 0.35rem;
	}
	.erreur {
		color: #b91c1c;
		font-weight: 600;
	}
	.fait {
		color: #166534;
		font-weight: 600;
	}
	.vide {
		color: #555;
	}
</style>
