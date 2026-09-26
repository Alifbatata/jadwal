<script lang="ts">
	// Voir docs/maquettes/responsables-vendredi.md : c'est la référence, et un désaccord entre ce
	// fichier et elle est un défaut de l'un ou de l'autre.
	//
	// Les textes sont dans `$lib/i18n/friday.ts`, dans les cinq langues de l'espace (étape 18). Tout
	// l'écran fonctionne sans script : modifier et supprimer une session s'ouvrent dans un `details`,
	// que le navigateur déplie seul, et la suppression demande sa confirmation sur place.
	import { resolve } from '$app/paths';
	import { shortDate } from '$lib/format.js';
	import { fridayTexts, type FridayDone, type FridayError } from '$lib/i18n/friday.js';
	import { languesEnClair } from '$lib/public/affichage.js';
	import type { IsoDate } from '@jadwal/core';

	let { data, form } = $props();

	const text = $derived(fridayTexts[data.language]);
	const rang = (ordre: number) => text.orders[ordre - 1] ?? String(ordre);
	/** Une date telle que l'écran l'écrit : le nom du jour, puis JJ.MM.AAAA. */
	const date = (valeur: string) => shortDate(valeur as IsoDate, data.language);
	/** Le nom d'une langue, avec une majuscule quand il commence une étiquette. */
	function nomDeLangue(code: string): string {
		const nom = languesEnClair(data.language, [code]);
		return nom.charAt(0).toLocaleUpperCase(data.language) + nom.slice(1);
	}

	/**
	 * Le formulaire d'enregistrement refusé, par la clé de sa session (`''` pour l'ajout). Ses
	 * erreurs s'écrivent dans sa carte, et sa saisie y reste : la personne n'a rien à rouvrir ni à
	 * retaper. Les autres refus, qui ne visent pas un formulaire de session, restent en tête.
	 */
	const refuse = $derived(form?.errors && form.entry ? (form.courseId ?? '') : null);
	/**
	 * Le formulaire refusé n'a plus de carte : sa session a été supprimée entre-temps, dans un autre
	 * onglet ou par une autre personne responsable. Ses erreurs s'écrivent alors en tête, après la
	 * phrase qui dit que la session n'existe plus ; sans cela, la page reviendrait sans rien dire.
	 */
	const sansCarte = $derived(
		refuse !== null && refuse !== '' && !data.sessions.some((session) => session.id === refuse)
	);
	/** Les erreurs qui s'écrivent en tête : celles des autres gestes, ou d'un formulaire sans carte. */
	const erreursEnTete = $derived.by((): readonly FridayError[] => {
		if (!form?.errors) return [];
		if (refuse === null) return form.errors;
		// La vérification du formulaire ne rend jamais « sessionGone » : la phrase ne s'écrit qu'une fois.
		return sansCarte ? ['sessionGone', ...form.errors] : [];
	});
	/** La confirmation d'un enregistrement, par la clé de sa session, ou `null` pour les autres gestes. */
	const enregistre = $derived(
		form?.done === 'updated' ? (form.courseId ?? null) : form?.done === 'added' ? '' : null
	);

	function seancesDe(courseId: string) {
		return data.prochaines.filter((seance) => seance.courseId === courseId);
	}
</script>

<svelte:head><title>{text.title} | {data.organisation.name}</title></svelte:head>

<h1>{text.title}</h1>
<p class="aide">{text.intro}</p>
<p class="aide">{text.severalSessions}</p>

{#if erreursEnTete.length > 0}{@render erreurs(erreursEnTete)}{/if}
{#if form?.done && enregistre === null}{@render confirmation(form.done)}{/if}

{#if data.sessions.length === 0}
	<p class="vide">{text.empty}</p>
{/if}

{#each data.sessions as session (session.id)}
	<section class="session" aria-labelledby={`session-${session.id}`}>
		<h2 id={`session-${session.id}`}>{rang(session.jumuaOrder)}</h2>
		{#if form?.done && enregistre === session.id}{@render confirmation(form.done)}{/if}
		<p class="ligne">
			<strong>{session.start} – {session.end}</strong>
			<!-- Le nom de la salle garde son sens au milieu d'une ligne arabe. -->
			{#if session.room}· <bdi>{session.room}</bdi>{/if}
		</p>
		<p class="details">{text.sermonIn(languesEnClair(data.language, session.sermonLanguages))}</p>
		<p class="details">{session.status === 'published' ? text.published : text.draft}</p>
		{#if session.endsOn}<p class="details">{text.until(date(session.endsOn))}</p>{/if}

		<form method="post" action="?/basculer" class="actions">
			<input type="hidden" name="courseId" value={session.id} />
			<input
				type="hidden"
				name="vers"
				value={session.status === 'published' ? 'draft' : 'published'}
			/>
			<button type="submit">
				{session.status === 'published' ? text.unpublish : text.publish}
			</button>
		</form>

		<!-- Fermé au chargement ; rouvert seulement quand son enregistrement vient d'être refusé. -->
		<details class="repli" open={refuse === session.id}>
			<summary>{text.edit}</summary>
			{@render formulaire(session)}
		</details>

		<details class="repli">
			<summary class="danger-plat">{text.remove}</summary>
			<form method="post" action="?/supprimer" class="confirmation">
				<input type="hidden" name="courseId" value={session.id} />
				<p>{text.removeWarning}</p>
				<button type="submit" class="danger">{text.removeConfirm}</button>
			</form>
		</details>
	</section>
{/each}

<section class="session" aria-labelledby="ajout">
	<h2 id="ajout">{text.add}</h2>
	{#if form?.done && enregistre === ''}{@render confirmation(form.done)}{/if}
	{@render formulaire(null)}
</section>

{#if data.prochaines.length > 0}
	<section aria-labelledby="ce-vendredi">
		<h2 id="ce-vendredi">{text.thisFriday.title}</h2>
		<p class="aide">{text.thisFriday.intro}</p>
		{#each data.sessions as session (session.id)}
			{#each seancesDe(session.id) as seance (seance.date + seance.status)}
				<div class="seance" class:barree={seance.status !== 'scheduled'}>
					<p class="ligne">
						<strong>{seance.start ?? '–'} – {seance.end ?? '–'}</strong>
						· {rang(session.jumuaOrder)}
						· {date(seance.date)}
						{#if seance.status === 'cancelled'}
							<span class="marque">{text.thisFriday.cancelled}</span>
						{/if}
						{#if seance.status === 'moved_away' && seance.movedTo}
							<span class="marque">
								{text.thisFriday.movedTo(
									date(seance.movedTo.date),
									String(seance.movedTo.start).slice(0, 5)
								)}
							</span>
						{/if}
						{#if seance.status === 'moved_here' && seance.originalDate}
							<span class="marque">{text.thisFriday.movedFrom(date(seance.originalDate))}</span>
						{/if}
					</p>
					{#if seance.status === 'scheduled'}
						<p class="avertissement">{text.thisFriday.onlyThis}</p>
						<div class="gestes">
							<form method="post" action="?/annuler">
								<input type="hidden" name="courseId" value={session.id} />
								<input type="hidden" name="date" value={seance.date} />
								<button type="submit" class="danger">{text.thisFriday.cancel}</button>
							</form>
							<form method="post" action="?/deplacer">
								<input type="hidden" name="courseId" value={session.id} />
								<input type="hidden" name="date" value={seance.date} />
								<label for={`vers-${session.id}-${seance.date}`}>{text.thisFriday.newDay}</label>
								<select id={`vers-${session.id}-${seance.date}`} name="toDate">
									{#each data.joursSuivants as jour (jour)}
										<option value={jour} selected={jour === seance.date}>{date(jour)}</option>
									{/each}
								</select>
								<label for={`heure-${session.id}-${seance.date}`}>
									{text.thisFriday.newTime}
								</label>
								<input
									id={`heure-${session.id}-${seance.date}`}
									type="time"
									name="toStart"
									value={seance.start ?? session.start}
									required
								/>
								<button type="submit">{text.thisFriday.move}</button>
							</form>
						</div>
					{:else if seance.status !== 'moved_here'}
						<form method="post" action="?/retablir">
							<input type="hidden" name="courseId" value={session.id} />
							<input type="hidden" name="date" value={seance.date} />
							<button type="submit">{text.thisFriday.restore}</button>
						</form>
					{/if}
				</div>
			{/each}
		{/each}
	</section>
{/if}

<p class="aide">
	{text.coursesElsewhere}
	<a href={resolve('/cours')}>{text.coursesLink}</a>
</p>

{#snippet erreurs(liste: readonly FridayError[])}
	<!-- Le rôle se pose sur un bloc autour de la liste, et non sur la liste : il effacerait son rôle
	     de liste, et un lecteur d'écran n'annoncerait plus ses points comme ceux d'une liste. -->
	<div class="erreur" role="alert">
		<ul>
			{#each liste as erreur (erreur)}<li>{text.errors[erreur]}</li>{/each}
		</ul>
	</div>
{/snippet}

{#snippet confirmation(done: FridayDone)}
	<p class="succes" role="status">{text.done[done]}</p>
{/snippet}

{#snippet formulaire(session: (typeof data.sessions)[number] | null)}
	{@const cle = session?.id ?? 'nouvelle'}
	<!-- La saisie refusée de ce formulaire, s'il vient de l'être : elle passe avant ce qui est enregistré. -->
	{@const saisie = refuse === (session?.id ?? '') ? form?.entry : undefined}
	<!-- Sans script, la page renvoyée s'ouvre sur la carte de la session, où s'écrit la réponse. -->
	<form
		method="post"
		action={`?/enregistrer#${session ? `session-${session.id}` : 'ajout'}`}
		class="colonne"
	>
		{#if session}<input type="hidden" name="courseId" value={session.id} />{/if}
		{#if saisie && form?.errors}{@render erreurs(form.errors)}{/if}

		<label for={`titre-${cle}`}>{text.form.title}</label>
		<input
			id={`titre-${cle}`}
			name="title"
			type="text"
			maxlength="120"
			value={saisie?.title ?? session?.title ?? data.titrePropose}
			aria-describedby={`aide-titre-${cle}`}
		/>
		<p class="aide" id={`aide-titre-${cle}`}>{text.form.titleHelp}</p>

		<label for={`rang-${cle}`}>{text.form.order}</label>
		<select id={`rang-${cle}`} name="jumuaOrder" aria-describedby={`aide-rang-${cle}`}>
			{#each [1, 2, 3] as ordre (ordre)}
				<option
					value={ordre}
					selected={ordre === (saisie?.jumuaOrder ?? session?.jumuaOrder ?? data.rangPropose)}
				>
					{rang(ordre)}
				</option>
			{/each}
		</select>
		<p class="aide" id={`aide-rang-${cle}`}>{text.form.orderHelp}</p>

		<div class="paire">
			<div>
				<label for={`debut-${cle}`}>{text.form.start}</label>
				<input
					id={`debut-${cle}`}
					name="start"
					type="time"
					value={saisie?.start ?? session?.start ?? '12:10'}
					required
					aria-describedby={`aide-heures-${cle}`}
				/>
			</div>
			<div>
				<label for={`fin-${cle}`}>{text.form.end}</label>
				<input
					id={`fin-${cle}`}
					name="end"
					type="time"
					value={saisie?.end ?? session?.end ?? '12:50'}
					required
					aria-describedby={`aide-heures-${cle}`}
				/>
			</div>
		</div>
		<p class="aide" id={`aide-heures-${cle}`}>{text.form.timesHelp}</p>

		<label for={`salle-${cle}`}>{text.form.room}</label>
		<select id={`salle-${cle}`} name="roomId" aria-describedby={`aide-salle-${cle}`}>
			<option value="">{text.form.noRoom}</option>
			{#each data.salles as salle (salle.id)}
				<option value={salle.id} selected={salle.id === (saisie ? saisie.roomId : session?.roomId)}>
					{salle.name}
				</option>
			{/each}
		</select>
		<p class="aide" id={`aide-salle-${cle}`}>{text.form.roomHelp}</p>

		<fieldset class="cases" aria-describedby={`aide-sermon-${cle}`}>
			<legend>{text.form.sermon}</legend>
			{#each data.langues as langue (langue)}
				<label class="case">
					<input
						type="checkbox"
						name="sermonLanguages"
						value={langue}
						checked={(saisie?.sermonLanguages ?? session?.sermonLanguages)?.includes(langue) ??
							langue === 'ar'}
					/>
					{nomDeLangue(langue)}
				</label>
			{/each}
		</fieldset>
		<p class="aide" id={`aide-sermon-${cle}`}>{text.form.sermonHelp}</p>

		<label for={`intervenant-${cle}`}>{text.form.teacher}</label>
		<input
			id={`intervenant-${cle}`}
			name="teacher"
			type="text"
			value={saisie?.teacher ?? session?.teacher ?? ''}
			aria-describedby={`aide-intervenant-${cle}`}
		/>
		<p class="aide" id={`aide-intervenant-${cle}`}>{text.form.teacherHelp}</p>

		<div class="paire">
			<div>
				<label for={`du-${cle}`}>{text.form.startsOn}</label>
				<input
					id={`du-${cle}`}
					name="startsOn"
					type="date"
					value={saisie?.startsOn ?? session?.startsOn ?? data.today}
					required
					aria-describedby={`aide-du-${cle}`}
				/>
			</div>
			<div>
				<label for={`au-${cle}`}>{text.form.endsOn}</label>
				<input
					id={`au-${cle}`}
					name="endsOn"
					type="date"
					value={saisie?.endsOn ?? session?.endsOn ?? ''}
					aria-describedby={`aide-au-${cle} aide-saison-${cle}`}
				/>
			</div>
		</div>
		<p class="aide" id={`aide-du-${cle}`}>{text.form.startsOnHelp}</p>
		<p class="aide" id={`aide-au-${cle}`}>{text.form.endsOnHelp}</p>
		<p class="aide" id={`aide-saison-${cle}`}>{text.form.season}</p>

		<label for={`description-${cle}`}>{text.form.description}</label>
		<textarea
			id={`description-${cle}`}
			name="description"
			rows="2"
			aria-describedby={`aide-description-${cle}`}
			>{saisie?.description ?? session?.description ?? ''}</textarea
		>
		<p class="aide" id={`aide-description-${cle}`}>{text.form.descriptionHelp}</p>

		<input type="hidden" name="status" value={session?.status ?? 'published'} />
		<button type="submit" class="principal">{session ? text.form.save : text.form.create}</button>
	</form>
{/snippet}

<style>
	.aide,
	.details {
		color: #555;
		font-size: 0.9rem;
	}
	.colonne .aide {
		margin: 0 0 0.5rem;
	}
	.session,
	.seance {
		border: 1px solid #ddd;
		border-radius: 0.5rem;
		padding: 0.75rem;
		margin-bottom: 1rem;
	}
	h2 {
		margin-top: 0;
	}
	.ligne {
		margin: 0.25rem 0;
	}
	.seance.barree .ligne strong {
		text-decoration: line-through;
	}
	.marque {
		background: #fde68a;
		border-radius: 0.25rem;
		padding: 0.1rem 0.4rem;
		font-size: 0.8rem;
		font-weight: 600;
	}
	.actions,
	.gestes {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
		margin-top: 0.5rem;
	}
	.gestes form {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	.repli {
		margin-top: 0.5rem;
	}
	/* Le triangle du navigateur reste : c'est lui qui dit qu'on peut ouvrir. */
	summary {
		cursor: pointer;
		font-weight: 600;
		padding: 0.65rem 0;
	}
	.colonne {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-width: 34rem;
		margin-top: 0.75rem;
	}
	.paire {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(10rem, 1fr));
		gap: 0.75rem;
	}
	.paire > div {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}
	label {
		font-weight: 600;
		font-size: 0.9rem;
	}
	input,
	select,
	textarea {
		font: inherit;
		min-height: 44px;
		padding: 0 0.5rem;
		border-radius: 0.375rem;
		border: 1px solid #888;
	}
	textarea {
		padding: 0.5rem;
	}
	fieldset {
		border: 1px solid #ddd;
		border-radius: 0.375rem;
		padding: 0.5rem 0.75rem;
	}
	.cases {
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
	}
	.case {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		font-weight: 400;
		min-height: 44px;
	}
	button {
		min-height: 44px;
		font: inherit;
		padding: 0 0.9rem;
		border-radius: 0.375rem;
		border: 1px solid #888;
		background: #fff;
		cursor: pointer;
	}
	button.principal {
		background: var(--accent);
		color: var(--accent-texte);
		border-color: var(--accent);
		font-weight: 600;
	}
	button.danger {
		background: #b91c1c;
		color: #fff;
		border-color: #b91c1c;
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
		margin-top: 0.5rem;
	}
	.confirmation p {
		margin: 0;
	}
	.avertissement {
		font-size: 0.9rem;
		color: #92400e;
		margin: 0.5rem 0 0;
	}
	.erreur {
		background: #fee2e2;
		border-inline-start: 4px solid #b91c1c;
		padding: 0.5rem 0.75rem;
		margin-block: 0.5rem;
	}
	/* Assez de place au début de la ligne pour que la puce reste dans le cadre, pas sur la bordure. */
	.erreur ul {
		margin: 0;
		padding-inline-start: 1rem;
	}
	.succes {
		background: #dcfce7;
		border-inline-start: 4px solid #15803d;
		padding: 0.5rem 0.75rem;
	}
	.vide {
		color: #555;
	}
</style>
