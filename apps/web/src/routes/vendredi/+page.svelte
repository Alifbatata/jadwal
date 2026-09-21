<script lang="ts">
	// Voir docs/maquettes/responsables-vendredi.md : c'est la référence, et un désaccord entre ce
	// fichier et elle est un défaut de l'un ou de l'autre.
	import { resolve } from '$app/paths';
	import { LANGUAGE_LABELS, shortDate } from '$lib/format.js';
	import type { IsoDate } from '@jadwal/core';

	let { data, form } = $props();

	const RANGS = ['Première session', 'Deuxième session', 'Troisième session'];
	const rang = (ordre: number) => RANGS[ordre - 1] ?? `Session ${ordre}`;

	/** La session dont le formulaire est ouvert : `'nouvelle'`, un identifiant, ou rien. */
	let ouvert = $state<string | null>(null);
	/** La session dont la suppression attend une confirmation. */
	let aSupprimer = $state<string | null>(null);

	/** Le prochain rang libre, proposé à l'ajout. */
	const rangPropose = $derived(Math.min(3, data.sessions.length + 1));

	function seancesDe(courseId: string) {
		return data.prochaines.filter((seance) => seance.courseId === courseId);
	}
</script>

<svelte:head><title>Prière du vendredi — {data.organisation.name}</title></svelte:head>

<h1>Prière du vendredi</h1>
<p class="aide">Ces sessions remplacent l’heure du Dhuhr du vendredi partout où elle s’affiche.</p>

{#if form?.erreurs}
	<ul class="erreur" role="alert">
		{#each form.erreurs as erreur (erreur)}<li>{erreur}</li>{/each}
	</ul>
{/if}
{#if form?.fait}<p class="succes" role="status">Enregistré.</p>{/if}

{#if data.sessions.length === 0}
	<p class="vide">
		Aucune session du vendredi n’est saisie. Tant qu’il n’y en a pas, la page publique n’affiche
		rien pour le vendredi, et les cours ancrés sur le Dhuhr gardent l’heure du Dhuhr.
	</p>
{/if}

{#each data.sessions as session (session.id)}
	<section class="session" aria-labelledby={`session-${session.id}`}>
		<h2 id={`session-${session.id}`}>{rang(session.jumuaOrder)}</h2>
		<p class="ligne">
			<strong>{session.start} – {session.end}</strong>
			{#if session.room}· {session.room}{/if}
		</p>
		<p class="details">
			Sermon en {session.sermonLanguages
				.map((langue) => LANGUAGE_LABELS[langue] ?? langue)
				.join(', ')}
		</p>
		<p class="details">
			{session.status === 'published' ? 'Publiée' : 'Brouillon'}
			{#if session.endsOn}· jusqu’au {shortDate(session.endsOn as IsoDate)}{/if}
		</p>

		<div class="actions">
			<button
				type="button"
				aria-expanded={ouvert === session.id}
				onclick={() => (ouvert = ouvert === session.id ? null : session.id)}
			>
				Modifier
			</button>
			<form method="post" action="?/basculer">
				<input type="hidden" name="courseId" value={session.id} />
				<input
					type="hidden"
					name="vers"
					value={session.status === 'published' ? 'draft' : 'published'}
				/>
				<button type="submit">
					{session.status === 'published' ? 'Dépublier' : 'Publier'}
				</button>
			</form>
			<button type="button" onclick={() => (aSupprimer = session.id)} class="danger-plat">
				Supprimer
			</button>
		</div>

		{#if aSupprimer === session.id}
			<form method="post" action="?/supprimer" class="confirmation">
				<input type="hidden" name="courseId" value={session.id} />
				<p>Supprimer cette session ?</p>
				<button type="submit" class="danger">Oui, supprimer</button>
				<button type="button" onclick={() => (aSupprimer = null)}>Annuler</button>
			</form>
		{/if}

		<!-- Sans JavaScript, le formulaire reste ouvert : le bouton ne fait que le replier. -->
		<div class="repli" class:ferme={ouvert !== null && ouvert !== session.id}>
			{@render formulaire(session)}
		</div>
	</section>
{/each}

<section class="session" aria-labelledby="ajout">
	<h2 id="ajout">Ajouter une session</h2>
	<div class="repli" class:ferme={ouvert !== null && ouvert !== 'nouvelle'}>
		{@render formulaire(null)}
	</div>
	<div class="actions">
		<button
			type="button"
			aria-expanded={ouvert === 'nouvelle'}
			onclick={() => (ouvert = ouvert === 'nouvelle' ? null : 'nouvelle')}
		>
			Ajouter une session
		</button>
	</div>
</section>

{#if data.prochaines.length > 0}
	<section aria-labelledby="ce-vendredi">
		<h2 id="ce-vendredi">Ce vendredi</h2>
		{#each data.sessions as session (session.id)}
			{#each seancesDe(session.id) as seance (seance.date + seance.status)}
				<div class="seance" class:barree={seance.status !== 'scheduled'}>
					<p class="ligne">
						<strong>{seance.start ?? '—'} – {seance.end ?? '—'}</strong>
						· {rang(session.jumuaOrder)}
						· {shortDate(seance.date as IsoDate)}
						{#if seance.status === 'cancelled'}<span class="marque">annulée</span>{/if}
						{#if seance.status === 'moved_away'}<span class="marque">déplacée</span>{/if}
						{#if seance.status === 'moved_here'}<span class="marque">date exceptionnelle</span>{/if}
					</p>
					{#if seance.status === 'scheduled'}
						<p class="avertissement">
							Cette session seulement. Les autres vendredis ne changent pas.
						</p>
						<div class="gestes">
							<form method="post" action="?/annuler">
								<input type="hidden" name="courseId" value={session.id} />
								<input type="hidden" name="date" value={seance.date} />
								<button type="submit" class="danger">Annuler cette session</button>
							</form>
							<form method="post" action="?/deplacer">
								<input type="hidden" name="courseId" value={session.id} />
								<input type="hidden" name="date" value={seance.date} />
								<label for={`vers-${session.id}-${seance.date}`}>Déplacer au</label>
								<select id={`vers-${session.id}-${seance.date}`} name="toDate">
									{#each data.joursSuivants as jour (jour)}
										<option value={jour} selected={jour === seance.date}>
											{shortDate(jour as IsoDate)}
										</option>
									{/each}
								</select>
								<label for={`heure-${session.id}-${seance.date}`}>à</label>
								<input
									id={`heure-${session.id}-${seance.date}`}
									type="time"
									name="toStart"
									value={seance.start ?? session.start}
									required
								/>
								<button type="submit">Déplacer</button>
							</form>
						</div>
					{:else if seance.status !== 'moved_here'}
						<form method="post" action="?/retablir">
							<input type="hidden" name="courseId" value={session.id} />
							<input type="hidden" name="date" value={seance.date} />
							<button type="submit">Rétablir</button>
						</form>
					{/if}
				</div>
			{/each}
		{/each}
	</section>
{/if}

<p class="aide">
	<a href={resolve('/cours')}>Les cours</a> ont leur propre écran : une session du vendredi n’y figure
	pas, et un cours ne figure pas ici.
</p>

{#snippet formulaire(session: (typeof data.sessions)[number] | null)}
	{@const cle = session?.id ?? 'nouvelle'}
	<form method="post" action="?/enregistrer" class="colonne">
		{#if session}<input type="hidden" name="courseId" value={session.id} />{/if}

		<label for={`titre-${cle}`}>Titre</label>
		<input
			id={`titre-${cle}`}
			name="title"
			type="text"
			maxlength="120"
			value={session?.title ?? 'Prière du vendredi'}
		/>

		<label for={`rang-${cle}`}>Rang</label>
		<select id={`rang-${cle}`} name="jumuaOrder">
			{#each [1, 2, 3] as ordre (ordre)}
				<option value={ordre} selected={ordre === (session?.jumuaOrder ?? rangPropose)}>
					{rang(ordre)}
				</option>
			{/each}
		</select>

		<div class="paire">
			<div>
				<label for={`debut-${cle}`}>Début</label>
				<input
					id={`debut-${cle}`}
					name="start"
					type="time"
					value={session?.start ?? '12:10'}
					required
				/>
			</div>
			<div>
				<label for={`fin-${cle}`}>Fin</label>
				<input id={`fin-${cle}`} name="end" type="time" value={session?.end ?? '12:50'} required />
			</div>
		</div>

		<label for={`salle-${cle}`}>Salle</label>
		<select id={`salle-${cle}`} name="roomId">
			<option value="">Aucune</option>
			{#each data.salles as salle (salle.id)}
				<option value={salle.id} selected={salle.id === session?.roomId}>{salle.name}</option>
			{/each}
		</select>

		<fieldset class="cases">
			<legend>Sermon en</legend>
			{#each data.langues as langue (langue)}
				<label class="case">
					<input
						type="checkbox"
						name="sermonLanguages"
						value={langue}
						checked={session ? session.sermonLanguages.includes(langue) : langue === 'ar'}
					/>
					{LANGUAGE_LABELS[langue] ?? langue}
				</label>
			{/each}
		</fieldset>

		<label for={`intervenant-${cle}`}>Intervenant</label>
		<input id={`intervenant-${cle}`} name="teacher" type="text" value={session?.teacher ?? ''} />

		<div class="paire">
			<div>
				<label for={`du-${cle}`}>À partir du</label>
				<input
					id={`du-${cle}`}
					name="startsOn"
					type="date"
					value={session?.startsOn ?? data.today}
					required
				/>
			</div>
			<div>
				<label for={`au-${cle}`}>Jusqu’au</label>
				<input id={`au-${cle}`} name="endsOn" type="date" value={session?.endsOn ?? ''} />
			</div>
		</div>
		<p class="aide">
			Pour un changement de saison, mieux vaut clore cette session et en ajouter une nouvelle : les
			vendredis passés gardent leur heure.
		</p>

		<label for={`description-${cle}`}>Description</label>
		<textarea id={`description-${cle}`} name="description" rows="2"
			>{session?.description ?? ''}</textarea
		>

		<input type="hidden" name="status" value={session?.status ?? 'published'} />
		<button type="submit" class="principal">Enregistrer</button>
	</form>
{/snippet}

<style>
	.aide,
	.details {
		color: #555;
		font-size: 0.9rem;
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
	button.danger-plat {
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
	.repli.ferme {
		display: none;
	}
	.erreur {
		background: #fee2e2;
		border-left: 4px solid #b91c1c;
		padding: 0.5rem 0.75rem;
	}
	.succes {
		background: #dcfce7;
		border-left: 4px solid #15803d;
		padding: 0.5rem 0.75rem;
	}
	.vide {
		color: #555;
	}
</style>
