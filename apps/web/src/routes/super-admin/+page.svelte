<script lang="ts">
	let { data, form } = $props();

	const PLANS: Record<string, string> = {
		free: 'gratuit',
		sponsored: 'offert',
		paid: 'payant'
	};
	const STATUTS: Record<string, string> = { active: 'active', suspended: 'suspendue' };
</script>

<svelte:head><title>Super-admin | jadwal</title></svelte:head>

<h1>Super-admin</h1>

{#if form?.erreur}<p class="erreur" role="alert">{form.erreur}</p>{/if}

{#if form?.lien}
	<section class="secours" aria-labelledby="secours-titre">
		<h2 id="secours-titre">Lien de connexion pour {form.pour}</h2>
		<p class="details">
			Valable quinze minutes, utilisable une fois. À transmettre par un autre canal que le courriel.
			Cette production est inscrite au registre interne.
		</p>
		<textarea readonly rows="3" aria-label="Lien de connexion de secours">{form.lien}</textarea>
	</section>
{/if}

<section aria-labelledby="liste-titre">
	<h2 id="liste-titre">Organisations</h2>
	<ul>
		{#each data.organisations as organisation (organisation.id)}
			<li>
				<p class="titre">
					{organisation.name}
					<span class="etiquette">{organisation.slug}</span>
					<span class="etiquette">{PLANS[organisation.plan] ?? organisation.plan}</span>
					<span class="etiquette">{STATUTS[organisation.status] ?? organisation.status}</span>
				</p>
				<div class="actions">
					<form method="post" action="?/entrer">
						<input type="hidden" name="organizationId" value={organisation.id} />
						<button type="submit">Entrer dans son espace</button>
					</form>

					<form method="post" action="?/plan">
						<input type="hidden" name="organizationId" value={organisation.id} />
						<label for={`plan-${organisation.id}`}>Plan</label>
						<select id={`plan-${organisation.id}`} name="plan">
							{#each data.plans as plan (plan)}
								<option value={plan} selected={plan === organisation.plan}>
									{PLANS[plan] ?? plan}
								</option>
							{/each}
						</select>
						<button type="submit">Changer</button>
					</form>

					<form method="post" action="?/statut">
						<input type="hidden" name="organizationId" value={organisation.id} />
						<label for={`statut-${organisation.id}`}>État</label>
						<select id={`statut-${organisation.id}`} name="status">
							{#each data.statuts as statut (statut)}
								<option value={statut} selected={statut === organisation.status}>
									{STATUTS[statut] ?? statut}
								</option>
							{/each}
						</select>
						<button type="submit">Changer</button>
					</form>
				</div>
			</li>
		{/each}
	</ul>
</section>

<section aria-labelledby="creer-titre">
	<h2 id="creer-titre">Ouvrir une organisation</h2>
	<form method="post" action="?/ouvrir" class="colonne">
		<label for="name">Nom</label>
		<input id="name" name="name" type="text" maxlength="120" required />
		<label for="slug">Identifiant d’URL</label>
		<input id="slug" name="slug" type="text" pattern="[a-z0-9]+(-[a-z0-9]+)*" required />
		<label for="timeZone">Fuseau horaire</label>
		<input id="timeZone" name="timeZone" type="text" value="Europe/Zurich" required />
		<button type="submit">Ouvrir</button>
	</form>
</section>

<section aria-labelledby="lien-titre">
	<h2 id="lien-titre">Lien de connexion de secours</h2>
	<p class="details">
		Quand le courriel ne part plus. Le lien s’affiche ici et se transmet autrement.
	</p>
	<form method="post" action="?/lienSecours" class="ligne">
		<label for="email">Adresse</label>
		<input id="email" name="email" type="email" required />
		<button type="submit">Produire le lien</button>
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
		margin: 0 0 0.5rem;
	}
	.etiquette {
		font-size: 0.8rem;
		font-weight: 400;
		background: #e5e7eb;
		border-radius: 0.25rem;
		padding: 0.1rem 0.4rem;
	}
	.actions {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	form.ligne,
	.actions form {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		flex-wrap: wrap;
	}
	.colonne {
		display: flex;
		flex-direction: column;
		gap: 0.35rem;
		max-width: 24rem;
	}
	label {
		font-size: 0.9rem;
		font-weight: 600;
	}
	input,
	select,
	button,
	textarea {
		min-height: 44px;
		font: inherit;
		padding: 0.25rem 0.75rem;
		border-radius: 0.375rem;
		border: 1px solid #888;
		background: #fff;
	}
	textarea {
		width: 100%;
	}
	button {
		background: var(--accent);
		color: var(--accent-texte);
		border-color: var(--accent);
		cursor: pointer;
	}
	.secours {
		background: #ecfdf5;
		border-left: 4px solid var(--accent);
		padding: 0.75rem;
	}
	.details {
		color: #555;
		font-size: 0.95rem;
	}
	.erreur {
		color: #b91c1c;
		font-weight: 600;
	}
</style>
