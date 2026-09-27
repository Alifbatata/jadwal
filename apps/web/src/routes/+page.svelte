<script lang="ts">
	import { resolve } from '$app/paths';
	import type { IsoDate } from '@jadwal/core';
	import { audienceLabel, describeSessionTime, shortDate } from '$lib/format.js';
	import { direction, NOM_DE_LANGUE, type Langue } from '$lib/i18n.js';
	import { commonTexts } from '$lib/i18n/common.js';
	import {
		upcomingErrorParts,
		upcomingTexts,
		type UpcomingError,
		type UpcomingErrorPart
	} from '$lib/i18n/upcoming.js';
	import { languesEnClair } from '$lib/public/affichage.js';

	let { data, form } = $props();

	/** La langue de l'espace, calculée par le hook, et les textes de l'écran dans cette langue. */
	const language = $derived(data.language);
	const text = $derived(upcomingTexts[language]);
	/** Le nom de l'écran est celui de son lien dans la navigation. */
	const title = $derived(commonTexts[language].navigation.upcoming);

	/** Une date lue par une personne : le nom du jour, puis `JJ.MM.AAAA` (retour A3). */
	function date(value: string): string {
		return shortDate(value as IsoDate, language);
	}

	/** Les séances groupées par jour, dans l'ordre. Un jour sans séance n'est pas affiché. */
	const parJour = $derived.by(() => {
		// Un tableau de paires, pas une `Map` : le regroupement est recalculé à chaque changement de
		// données, il n'a aucun état à garder entre deux rendus.
		const groupes: [string, typeof data.seances][] = [];
		for (const seance of data.seances) {
			const trouve = groupes.find(([jour]) => jour === seance.date);
			if (trouve) trouve[1].push(seance);
			else groupes.push([seance.date, [seance]]);
		}
		return groupes.sort(([a], [b]) => (a < b ? -1 : 1));
	});

	const cle = (courseId: string, jour: string) => `${courseId}-${jour}`;

	/**
	 * Pour une séance déplacée le même jour à une autre heure, la séance d'origine, que l'écran montre
	 * aussi ce jour-là : seule l'heure a changé, et la carte le dit (relecture du lot 4). Rien pour
	 * une séance venue d'une autre date.
	 */
	function origineLeMemeJour(seance: (typeof data.seances)[number]) {
		if (seance.status !== 'moved_here' || seance.originalDate !== seance.date) return undefined;
		return data.seances.find(
			(autre) =>
				autre.status === 'moved_away' &&
				autre.courseId === seance.courseId &&
				autre.date === seance.date
		);
	}

	/**
	 * Ce que « Rétablir la séance » défait sur une carte, tel que la carte le montre, ou rien quand
	 * elle ne le propose pas. `date` est celle que garde le changement : celle de la séance annulée ou
	 * partie ailleurs, et, pour une séance arrivée d'une autre date, sa date prévue, qui n'est pas
	 * toujours à l'écran (étape 19, D4). Une séance qui n'a changé que d'heure se rétablit depuis la
	 * carte de son heure prévue, le même jour. Le reste part avec le formulaire : une carte restée
	 * ouverte pendant que la séance changeait ailleurs est refusée, au lieu d'effacer ce changement
	 * (étape 19, lot 2).
	 */
	function aRetablir(seance: (typeof data.seances)[number]) {
		if (seance.status === 'cancelled') {
			return { date: seance.date, kind: 'cancelled', toDate: '', toStart: '' };
		}
		if (seance.status === 'moved_away') {
			return {
				date: seance.date,
				kind: 'moved',
				toDate: seance.movedTo?.date ?? '',
				toStart: String(seance.movedTo?.start ?? '').slice(0, 5)
			};
		}
		if (
			seance.status === 'moved_here' &&
			seance.originalDate &&
			seance.originalDate !== seance.date
		) {
			return {
				date: seance.originalDate,
				kind: 'moved',
				toDate: seance.date,
				toStart: String(seance.start ?? '').slice(0, 5)
			};
		}
		return null;
	}

	/**
	 * Les refus d'un déplacement, qui se corrigent dans la carte : une nouvelle date ou une nouvelle
	 * heure à revoir. Les autres ne demandent rien à la carte, même quand elle est encore là : une
	 * séance rétablie depuis l'ouverture de la page est de nouveau prévue, et le refus d'un second
	 * « Rétablir » ne rouvre pas ses options (étape 19, relecture de D2).
	 */
	const REFUS_D_UNE_CARTE: readonly UpcomingError[] = [
		'unreadableNewDate',
		'unreadableTime',
		'pastDate',
		'unchanged',
		'timeChanged'
	];

	/**
	 * La séance qu'une action vient de refuser : ses options, et elles seules, se rouvrent sur la
	 * phrase qui dit quoi faire, avec ce qui avait été saisi (retour A1).
	 */
	const refusee = $derived(
		form?.error && REFUS_D_UNE_CARTE.includes(form.error)
			? cle(form.courseId ?? '', form.date ?? '')
			: null
	);
	/**
	 * La phrase du refus, dans la langue de l'écran, en morceaux. Le refus d'une carte périmée nomme
	 * la séance : l'action rend son titre, et la page écrit sa date (étape 19, D4). Le titre est un
	 * morceau à lui seul, que la page isole (`<bdi>`, ADR 0007).
	 */
	const erreur: readonly UpcomingErrorPart[] = $derived(
		form?.error ? upcomingErrorParts(text, form.error, form.title ?? '', date(form.date ?? '')) : []
	);
	/**
	 * Une erreur qui ne trouve pas sa carte s'affiche en haut : une séance disparue, une séance
	 * annulée ou déplacée depuis l'ouverture de la page, qui n'a plus d'options, ou un refus qui ne
	 * se corrige pas dans la carte. Une séance dont l'heure a changé depuis est encore prévue : son
	 * refus se lit dans sa carte.
	 */
	const erreurEnHaut = $derived(
		Boolean(form?.error) &&
			!data.seances.some(
				(seance) => seance.status === 'scheduled' && cle(seance.courseId, seance.date) === refusee
			)
	);
</script>

<!-- La phrase d'un refus. Le titre d'une séance, saisi par une personne, y est isolé (ADR 0007) :
     sur un écran arabe, un titre latin qui finit par une ponctuation se retournait. Aucun blanc
     entre deux morceaux : il s'écrirait dans la phrase. -->
{#snippet phraseDuRefus(morceaux: readonly UpcomingErrorPart[])}
	<p class="erreur" role="alert">
		{#each morceaux as morceau, index (index)}{#if morceau.title}<bdi>{morceau.text}</bdi
				>{:else}{morceau.text}{/if}{/each}
	</p>
{/snippet}

<!-- Les messages prêts à coller, une langue par bloc, la première ouverte (retour D1). Chaque bloc
     porte la langue et le sens de son texte : un message arabe se lit de droite à gauche dans un écran
     français, et un message français de gauche à droite dans un écran arabe.
     Le nom de chaque zone dit sa langue, dans celle de l'écran : « Message à copier en allemand ».
     La zone se désigne d'abord elle-même, ce qui lit son `aria-label` à cette place, puis l'élément
     caché qui dit la langue. Cet élément ne porte pas de `lang` : il parle la langue de l'écran, et
     le message garde la sienne. -->
{#snippet messagesInLanguages(
	messages: readonly { language: Langue; text: string }[],
	label: string,
	idPrefix: string,
	rows: number
)}
	{#each messages as message, index (message.language)}
		{@const id = `${idPrefix}-${message.language}`}
		<details class="langue-du-message" open={index === 0}>
			<summary lang={message.language}>{NOM_DE_LANGUE[message.language]}</summary>
			<textarea
				{id}
				readonly
				{rows}
				aria-label={label}
				aria-labelledby={`${id} ${id}-langue`}
				lang={message.language}
				dir={direction(message.language)}>{message.text}</textarea
			>
			<span id={`${id}-langue`} hidden
				>{text.inLanguage(languesEnClair(language, [message.language]))}</span
			>
		</details>
	{/each}
{/snippet}

<svelte:head><title>{title} | {data.organisation.name}</title></svelte:head>

<h1>{title}</h1>
<p class="periode">{text.period(date(data.from), date(data.to))}</p>
<p class="intro">{text.intro}</p>

{#if form?.error && erreurEnHaut}
	{@render phraseDuRefus(erreur)}
{/if}

<!-- Ce que la dernière action a fait, et le message qu'elle prépare : c'est ce que la personne
     vient de demander, avant tout le reste. Une seconde annulation de la même séance n'écrit rien,
     mais porte le message quand même : la séance est annulée, et la personne ne sait pas si la
     communauté a déjà été prévenue (étape 19, D4). -->
{#if form?.done || form?.messages}
	<section class="message" aria-labelledby="message-titre">
		<h2 id="message-titre">{text.done[form.done ?? 'cancelled']}</h2>
		{#if form.messages}
			<p class="aide">{text.messageHelp}</p>
			{@render messagesInLanguages(form.messages, text.messageLabel, 'message', 5)}
		{/if}
	</section>
{/if}

<!-- Ce qui demande une décision, avant le programme lui-même. Chaque mention porte le lien qui la
     résout, ou dit qui peut la résoudre : un avertissement qui ne dit pas quoi faire ne sert à rien.
     L'écran des prières est réservé aux responsables ; un éditeur n'y aurait trouvé qu'un renvoi. -->
{#if data.prieres.seancesSansHeure > 0}
	<p class="mention" role="status">
		{text.untimed(data.prieres.seancesSansHeure)}
		{data.prieres.finDeLImport || data.prieres.calculPossible
			? text.untimedNotCovered
			: text.untimedNotSet}
		{#if data.canSetPrayers}
			<a href={resolve('/prieres')}>{text.untimedLink}</a>
		{:else if data.role === 'editor'}
			{text.untimedAskManager}
		{/if}
	</p>
{/if}

{#if data.prieres.alerte && data.prieres.finDeLImport}
	<p class="mention" role="status">
		{text.importEnds(date(data.prieres.finDeLImport), data.prieres.joursRestants ?? 0)}
		{data.prieres.calculPossible ? text.importThenComputed : text.importThenUntimed}
		{#if data.canSetPrayers}
			<a href={resolve('/prieres')}>{text.importLink}</a>
		{:else if data.role === 'editor'}
			{text.importAskManager}
		{/if}
	</p>
{/if}

{#if data.audience.widgetMuet}
	<p class="mention" role="status">
		{text.widgetSilent}
		<a href={resolve('/partager')}>{text.widgetLink}</a>
	</p>
{/if}

{#if parJour.length === 0}
	<p class="vide">
		{text.empty}
		<a href={resolve('/cours/nouveau')}>{text.emptyLink}</a>
	</p>
{/if}

{#each parJour as [jour, seances] (jour)}
	<section aria-labelledby={`jour-${jour}`}>
		<h2 id={`jour-${jour}`}>{date(jour)}</h2>
		<ul>
			{#each seances as seance (cle(seance.courseId, seance.date) + seance.status)}
				{@const k = cle(seance.courseId, seance.date)}
				{@const origine = origineLeMemeJour(seance)}
				<li class="seance {seance.status}">
					<p class="titre">
						<bdi>{seance.title}</bdi>
						{#if seance.draft}<span class="marque">{text.marks.draft}</span>{/if}
						{#if seance.status === 'cancelled'}<span class="marque">{text.marks.cancelled}</span
							>{/if}
						{#if seance.status === 'moved_here'}<span class="marque"
								>{origine ? text.marks.newTime : text.marks.movedHere}</span
							>{/if}
						{#if seance.status === 'moved_away'}<span class="marque">{text.marks.movedAway}</span
							>{/if}
					</p>
					<p class="details">
						{describeSessionTime(seance, language)}
						{#if seance.room}· <bdi>{seance.room}</bdi>{/if}
						{#if seance.teacher}· <bdi>{seance.teacher}</bdi>{/if}
						· {audienceLabel(seance.audience, language)}
					</p>
					{#if seance.status === 'moved_away' && seance.movedTo}
						<p class="details">{text.movedTo(date(seance.movedTo.date), seance.movedTo.start)}</p>
					{/if}
					{#if origine}
						<p class="details">{text.originallyAt(describeSessionTime(origine, language))}</p>
					{:else if seance.status === 'moved_here' && seance.originalDate}
						<p class="details">{text.originallyOn(date(seance.originalDate))}</p>
					{/if}

					{#if seance.status === 'scheduled'}
						<!-- Les options d'une séance, fermées par défaut, et propres à sa carte (retour A1) :
						     un élément natif, qui s'ouvre et se ferme sans JavaScript et sans toucher aux
						     autres cartes. Le bouton qui annule n'existe que derrière lui. -->
						<details class="options" open={refusee === k}>
							<summary>{text.options}</summary>
							<form method="post" action="?/annuler">
								<input type="hidden" name="courseId" value={seance.courseId} />
								<input type="hidden" name="date" value={seance.date} />
								<p class="aide">{text.cancelHelp}</p>
								<button type="submit" class="danger">{text.cancelButton}</button>
							</form>

							<!-- L'heure que la carte montre part avec elle, vide pour une séance sans heure : si
							     l'heure du cours change dans sa fiche pendant que la page reste ouverte,
							     l'action refuse la carte, au lieu de déplacer la séance à l'ancienne heure. -->
							<form method="post" action="?/deplacer">
								<input type="hidden" name="courseId" value={seance.courseId} />
								<input type="hidden" name="date" value={seance.date} />
								<input type="hidden" name="plannedStart" value={seance.start ?? ''} />
								<fieldset>
									<legend>{text.moveLegend}</legend>
									<!-- Une erreur qui retrouve sa carte vient toujours d'un déplacement
									     (`REFUS_D_UNE_CARTE`) : les autres s'affichent en haut. Elle se lit donc
									     au-dessus des champs à corriger. -->
									{#if form?.error && refusee === k}
										{@render phraseDuRefus(erreur)}
									{/if}
									<!-- Toute date à partir d'aujourd'hui, plus tôt comme plus tard que la date
									     prévue (retour A2), jusqu'au 31.12.2100, la dernière que l'action accepte
									     (étape 19). L'action refuse elle-même une date passée. Le champ garde sa
									     valeur technique ; l'aide écrit la date. -->
									<div class="champ">
										<label for={`vers-${k}`}>{text.newDate}</label>
										<input
											id={`vers-${k}`}
											type="date"
											name="toDate"
											min={data.today}
											max={data.lastDate}
											value={refusee === k ? form?.toDate : seance.date}
											required
											aria-describedby={`vers-${k}-aide`}
										/>
										<p id={`vers-${k}-aide`} class="aide">{text.newDateHelp(date(data.today))}</p>
									</div>
									<!-- Après un refus, l'heure envoyée revient dans le champ. L'action la remplace par
									     `null` quand la personne ne l'avait pas choisie : le champ propose alors l'heure
									     de la séance. -->
									<div class="champ">
										<label for={`heure-${k}`}>{text.newTime}</label>
										<input
											id={`heure-${k}`}
											type="time"
											name="toStart"
											value={refusee === k && form?.toStart !== null
												? form?.toStart
												: (seance.start ?? '19:00')}
											required
											aria-describedby={`heure-${k}-aide`}
										/>
										<p id={`heure-${k}-aide`} class="aide">{text.newTimeHelp}</p>
									</div>
									<button type="submit">{text.moveButton}</button>
								</fieldset>
							</form>
						</details>
					{:else if aRetablir(seance)}
						{@const change = aRetablir(seance)}
						<form method="post" action="?/retablir" class="retablir">
							<input type="hidden" name="courseId" value={seance.courseId} />
							<input type="hidden" name="date" value={change?.date} />
							<input type="hidden" name="shownKind" value={change?.kind} />
							{#if change?.kind === 'moved'}
								<input type="hidden" name="shownToDate" value={change.toDate} />
								<input type="hidden" name="shownToStart" value={change.toStart} />
							{/if}
							<button type="submit">{text.restoreButton}</button>
							<span class="aide">{text.restoreHelp}</span>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/each}

<section class="audience" aria-labelledby="audience-titre">
	<h2 id="audience-titre">{text.audience.title}</h2>
	<table>
		<thead>
			<tr>
				<th scope="col">{text.audience.where}</th>
				<th scope="col">{text.audience.last7}</th>
				<th scope="col">{text.audience.last30}</th>
			</tr>
		</thead>
		<tbody>
			<tr>
				<th scope="row">{text.audience.page}</th>
				<td>{data.audience.sept.page}</td>
				<td>{data.audience.trente.page}</td>
			</tr>
			<tr>
				<th scope="row">{text.audience.embed}</th>
				<td>{data.audience.sept.embed}</td>
				<td>{data.audience.trente.embed}</td>
			</tr>
			<tr>
				<th scope="row">{text.audience.feed}</th>
				<td>{data.audience.sept.feed}</td>
				<td>{data.audience.trente.feed}</td>
			</tr>
		</tbody>
	</table>
	<p class="aide">{text.audience.note}</p>
</section>

<section class="message" aria-labelledby="semaine-titre">
	<h2 id="semaine-titre">{text.weekTitle}</h2>
	<p class="aide">{text.weekHelp}</p>
	{@render messagesInLanguages(data.weekMessages, text.weekLabel, 'semaine', 8)}
</section>

<style>
	/* Des propriétés logiques seulement : en arabe, l'écran se lit de droite à gauche, et la barre
	   d'une mention, l'alignement du tableau et le retrait des options suivent. */
	.periode {
		color: #555;
		margin-top: -0.5rem;
	}
	.intro {
		max-width: 40rem;
	}
	.mention {
		background: #fef3c7;
		border-inline-start: 4px solid #d97706;
		border-radius: 0.25rem;
		padding: 0.75rem;
	}
	.audience table {
		border-collapse: collapse;
		width: 100%;
		max-width: 32rem;
	}
	.audience th,
	.audience td {
		border-bottom: 1px solid #ddd;
		padding: 0.4rem 0.5rem;
		text-align: end;
	}
	.audience thead th:first-child,
	.audience tbody th {
		text-align: start;
		font-weight: 500;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
	}
	li {
		border: 1px solid #ddd;
		border-radius: 0.5rem;
		padding: 0.75rem;
		margin-bottom: 0.75rem;
	}
	li.cancelled .titre bdi,
	li.moved_away .titre bdi {
		text-decoration: line-through;
	}
	.titre {
		font-weight: 600;
		margin: 0;
	}
	.details,
	.aide {
		color: #555;
		font-size: 0.95rem;
		margin: 0.25rem 0 0;
	}
	.marque {
		background: #fde68a;
		border-radius: 0.25rem;
		padding: 0.1rem 0.4rem;
		font-size: 0.8rem;
		font-weight: 600;
		display: inline-block;
	}
	/* Le résumé des options a l'air de ce qu'il est : un bouton, qu'on touche pour ouvrir. Il garde
	   le triangle du navigateur, qui pointe du bon côté en arabe et tourne à l'ouverture. */
	.options {
		margin-top: 0.5rem;
	}
	.options > summary,
	.langue-du-message > summary {
		cursor: pointer;
		box-sizing: border-box;
		min-height: 44px;
		padding: 0.6rem 0.75rem;
		border: 1px solid var(--accent);
		border-radius: 0.375rem;
		width: fit-content;
		font-weight: 500;
	}
	.options[open] {
		border-inline-start: 3px solid var(--accent);
		padding-inline-start: 0.75rem;
	}
	.langue-du-message {
		margin-top: 0.5rem;
	}
	form {
		margin-top: 0.75rem;
	}
	fieldset {
		border: 1px solid #ddd;
		border-radius: 0.375rem;
		padding: 0.5rem 0.75rem 0.75rem;
		margin: 0;
		display: flex;
		flex-wrap: wrap;
		gap: 0.75rem;
		align-items: flex-end;
	}
	legend {
		font-weight: 600;
		padding: 0 0.25rem;
	}
	fieldset .erreur {
		flex-basis: 100%;
		margin: 0;
	}
	.champ {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		max-width: 20rem;
	}
	.champ .aide {
		margin: 0;
		font-size: 0.85rem;
	}
	.retablir {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.5rem;
	}
	button,
	input[type='date'],
	input[type='time'] {
		min-height: 44px;
		font: inherit;
		padding: 0 0.75rem;
		border-radius: 0.375rem;
		border: 1px solid #888;
		background: #fff;
	}
	button {
		background: var(--accent);
		color: var(--accent-texte);
		border-color: var(--accent);
		cursor: pointer;
	}
	button.danger {
		background: #b91c1c;
		border-color: #b91c1c;
		color: #fff;
	}
	textarea {
		width: 100%;
		box-sizing: border-box;
		margin-top: 0.5rem;
		font: inherit;
		padding: 0.5rem;
		border-radius: 0.375rem;
		border: 1px solid #888;
	}
	.erreur {
		color: #b91c1c;
		font-weight: 600;
	}
	.vide {
		color: #555;
	}
</style>
