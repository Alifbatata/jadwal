<script lang="ts">
	import { resolve } from '$app/paths';
	import { addDays, type IsoDate } from '@jadwal/core';
	import { AUDIENCE_LABELS, describeSessionTime, shortDate } from '$lib/format.js';

	let { data, form } = $props();

	/** Les séances groupées par jour, dans l'ordre. Un jour sans séance n'est pas affiché. */
	const parJour = $derived.by(() => {
		// Un tableau de paires, pas une `Map` : le regroupement est recalculé à chaque changement de
		// données, il n'a aucun état à garder entre deux rendus.
		const groupes: [string, typeof data.seances][] = [];
		for (const seance of data.seances) {
			const trouve = groupes.find(([date]) => date === seance.date);
			if (trouve) trouve[1].push(seance);
			else groupes.push([seance.date, [seance]]);
		}
		return groupes.sort(([a], [b]) => (a < b ? -1 : 1));
	});

	/** Les six jours qui suivent une séance, pour le choix de déplacement. */
	function joursSuivants(date: string): IsoDate[] {
		return Array.from({ length: 6 }, (_, index) => addDays(date as IsoDate, index + 1));
	}

	let ouvert = $state<string | null>(null);
	const cle = (courseId: string, date: string) => `${courseId}|${date}`;
</script>

<svelte:head><title>À venir | {data.organisation.name}</title></svelte:head>

<h1>À venir</h1>
<p class="periode">Du {shortDate(data.from as IsoDate)} au {shortDate(data.to as IsoDate)}</p>

<!-- Ce qui demande une décision, avant le programme lui-même. Chaque mention porte le lien qui la
     résout : un avertissement qui ne dit pas quoi faire ne sert à rien. -->
{#if data.prieres.seancesSansHeure > 0}
	<p class="mention" role="status">
		{data.prieres.seancesSansHeure === 1
			? 'Une séance de la semaine s’annonce'
			: `${data.prieres.seancesSansHeure} séances de la semaine s’annoncent`}
		sans heure : elles suivent une prière, et les heures de prière
		{#if data.prieres.finDeLImport || data.prieres.calculPossible}
			ne couvrent pas encore toute la semaine.
		{:else}
			ne sont pas encore réglées.
		{/if}
		<a href={resolve('/prieres')}>Régler les heures de prière</a>
	</p>
{/if}

{#if data.prieres.alerte && data.prieres.finDeLImport}
	<p class="mention" role="status">
		Votre calendrier importé s’arrête le {shortDate(data.prieres.finDeLImport as IsoDate)}, dans {data
			.prieres.joursRestants} jours.
		{#if data.prieres.calculPossible}
			Le calcul prendra ensuite le relais, avec les réglages de votre mosquée.
		{:else}
			Après cette date, les séances qui suivent une prière s’afficheront sans heure.
		{/if}
		<a href={resolve('/prieres')}>Importer la suite</a>
	</p>
{/if}

{#if data.audience.widgetMuet}
	<p class="mention" role="status">
		Votre widget ne semble plus s’afficher : personne n’a vu votre programme en mode intégré depuis
		sept jours, alors que c’était le cas avant. Vérifiez la page de votre site où vous l’avez collé.
		Si vous l’avez retiré volontairement, il n’y a rien à faire.
		<a href={resolve('/partager')}>Revoir le code à coller</a>
	</p>
{/if}

{#if form?.erreur}
	<p class="erreur" role="alert">{form.erreur}</p>
{/if}

{#if form?.message}
	<section class="message" aria-labelledby="message-titre">
		<h2 id="message-titre">Message prêt à coller</h2>
		<textarea readonly rows="5" aria-label="Message à copier">{form.message}</textarea>
	</section>
{/if}

{#if parJour.length === 0}
	<p class="vide">
		Aucune séance dans les sept prochains jours.
		<a href={resolve('/cours/nouveau')}>Créer un cours</a>.
	</p>
{/if}

{#each parJour as [date, seances] (date)}
	<section aria-labelledby={`jour-${date}`}>
		<h2 id={`jour-${date}`}>{shortDate(date as IsoDate)}</h2>
		<ul>
			{#each seances as seance (cle(seance.courseId, seance.date) + seance.status)}
				<li class={seance.status}>
					<p class="titre">
						{seance.title}
						{#if seance.status === 'cancelled'}<span class="marque">annulée</span>{/if}
						{#if seance.status === 'moved_here'}<span class="marque">date exceptionnelle</span>{/if}
						{#if seance.status === 'moved_away'}<span class="marque">déplacée</span>{/if}
					</p>
					<p class="details">
						{describeSessionTime(seance)}
						{#if seance.room}· {seance.room}{/if}
						{#if seance.teacher}· {seance.teacher}{/if}
						· {AUDIENCE_LABELS[seance.audience] ?? seance.audience}
					</p>
					{#if seance.status === 'moved_away' && seance.movedTo}
						<p class="details">
							Déplacée au {shortDate(seance.movedTo.date as IsoDate)} à {seance.movedTo.start}
						</p>
					{/if}
					{#if seance.status === 'moved_here' && seance.originalDate}
						<p class="details">
							Initialement le {shortDate(seance.originalDate as IsoDate)}
						</p>
					{/if}

					{#if seance.status === 'scheduled'}
						<div class="actions">
							<button
								type="button"
								aria-expanded={ouvert === cle(seance.courseId, seance.date)}
								onclick={() =>
									(ouvert =
										ouvert === cle(seance.courseId, seance.date)
											? null
											: cle(seance.courseId, seance.date))}
							>
								Annuler ou déplacer
							</button>
						</div>
						<!-- Sans JavaScript, le bloc reste ouvert : les deux formulaires sont toujours
						     dans la page, et le bouton ne fait que les replier. -->
						<div
							class="repli"
							class:ferme={ouvert !== null && ouvert !== cle(seance.courseId, seance.date)}
						>
							<form method="post" action="?/annuler">
								<input type="hidden" name="courseId" value={seance.courseId} />
								<input type="hidden" name="date" value={seance.date} />
								<input type="hidden" name="title" value={seance.title} />
								<p class="avertissement">
									Cette séance seulement. Le cours continue les autres semaines.
								</p>
								<button type="submit" class="danger">Annuler cette séance</button>
							</form>

							<form method="post" action="?/deplacer">
								<input type="hidden" name="courseId" value={seance.courseId} />
								<input type="hidden" name="date" value={seance.date} />
								<input type="hidden" name="title" value={seance.title} />
								<label for={`vers-${cle(seance.courseId, seance.date)}`}>Déplacer au</label>
								<select id={`vers-${cle(seance.courseId, seance.date)}`} name="toDate">
									{#each joursSuivants(seance.date) as jour (jour)}
										<option value={jour}>{shortDate(jour)}</option>
									{/each}
								</select>
								<label for={`heure-${cle(seance.courseId, seance.date)}`}>à</label>
								<input
									id={`heure-${cle(seance.courseId, seance.date)}`}
									type="time"
									name="toStart"
									value={seance.start ?? '19:00'}
									required
								/>
								<button type="submit">Déplacer</button>
							</form>
						</div>
					{:else if seance.status !== 'moved_here'}
						<form method="post" action="?/retablir">
							<input type="hidden" name="courseId" value={seance.courseId} />
							<input type="hidden" name="date" value={seance.date} />
							<button type="submit">Rétablir</button>
						</form>
					{/if}
				</li>
			{/each}
		</ul>
	</section>
{/each}

<section class="audience" aria-labelledby="audience-titre">
	<h2 id="audience-titre">Combien votre programme a été vu</h2>
	<table>
		<thead>
			<tr>
				<th scope="col">Consultations</th>
				<th scope="col">7 jours</th>
				<th scope="col">30 jours</th>
			</tr>
		</thead>
		<tbody>
			<tr>
				<th scope="row">Page publique</th>
				<td>{data.audience.sept.page}</td>
				<td>{data.audience.trente.page}</td>
			</tr>
			<tr>
				<th scope="row">Widget sur votre site</th>
				<td>{data.audience.sept.embed}</td>
				<td>{data.audience.trente.embed}</td>
			</tr>
			<tr>
				<th scope="row">Abonnements agenda</th>
				<td>{data.audience.sept.feed}</td>
				<td>{data.audience.trente.feed}</td>
			</tr>
		</tbody>
	</table>
	<p class="details">
		Un jour, un type, un nombre : rien d’autre n’est conservé : ni adresse, ni provenance, ni
		visiteur. Les robots connus ne sont pas comptés. Ces nombres sont un minimum : une page servie
		par le cache d’un navigateur ou d’un opérateur ne nous parvient pas. Les abonnements agenda
		comptent les relevés du calendrier, pas les personnes : un agenda relève tout seul, plusieurs
		fois par jour.
	</p>
</section>

<section class="message" aria-labelledby="semaine-titre">
	<h2 id="semaine-titre">Le programme de la semaine</h2>
	<p class="details">À copier dans WhatsApp.</p>
	<textarea readonly rows="8" aria-label="Programme de la semaine">{data.messageSemaine}</textarea>
</section>

<style>
	.periode {
		color: #555;
		margin-top: -0.5rem;
	}
	.mention {
		background: #fef3c7;
		border-left: 4px solid #d97706;
		border-radius: 0.25rem;
		padding: 0.75rem;
	}
	.audience table {
		border-collapse: collapse;
		width: 100%;
		max-width: 28rem;
	}
	.audience th,
	.audience td {
		border-bottom: 1px solid #ddd;
		padding: 0.4rem 0.5rem;
		text-align: right;
	}
	.audience thead th:first-child,
	.audience tbody th {
		text-align: left;
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
	li.cancelled .titre,
	li.moved_away .titre {
		text-decoration: line-through;
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
	.marque {
		background: #fde68a;
		border-radius: 0.25rem;
		padding: 0.1rem 0.4rem;
		font-size: 0.8rem;
		font-weight: 600;
		text-decoration: none;
		display: inline-block;
	}
	.avertissement {
		font-size: 0.9rem;
		color: #92400e;
		margin: 0.5rem 0;
	}
	.repli.ferme {
		display: none;
	}
	form {
		display: flex;
		flex-wrap: wrap;
		gap: 0.5rem;
		align-items: center;
		margin-top: 0.5rem;
	}
	button,
	select,
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
	}
	textarea {
		width: 100%;
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
