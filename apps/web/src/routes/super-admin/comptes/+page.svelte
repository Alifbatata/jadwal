<script lang="ts">
	import { resolve } from '$app/paths';
	import { numericDate } from '#lib/i18n.js';
	import { superAdminAccountsTexts } from '#lib/i18n/super-admin-accounts.js';

	let { data, form } = $props();
	const text = $derived(superAdminAccountsTexts[data.language]);

	/**
	 * Le rôle dans une organisation, et l'autorisation de diffuser. Une personne responsable diffuse
	 * d'office : seule l'autorisation d'un éditeur se dit.
	 */
	function roleOf(organisation: (typeof data.accounts)[number]['organisations'][number]): string {
		const role = text.roles[organisation.role];
		return organisation.canBroadcast && organisation.role === 'editor'
			? `${role}, ${text.mayBroadcast}`
			: role;
	}
</script>

<svelte:head><title>{text.title} | jadwal</title></svelte:head>

<p><a href={resolve('super-admin')}>{text.back}</a></p>

<h1>{text.title}</h1>

{#if form?.toConfirm}
	<!-- La confirmation, sans JavaScript : un second formulaire qui porte `confirm=yes`. -->
	<div class="encadre" role="alertdialog" aria-labelledby="supprimer-titre">
		<p id="supprimer-titre">
			{text.remove.intro}
			<strong><bdi class="adresse" dir="ltr">{form.toConfirm.email}</bdi></strong>
		</p>
		{#if form.toConfirm.organisations.length > 0}
			<p>{text.remove.memberOf}</p>
			<ul>
				{#each form.toConfirm.organisations as name (name)}
					<li><bdi>{name}</bdi></li>
				{/each}
			</ul>
		{/if}
		<p>{text.remove.what}</p>
		<form method="post" action="?/supprimer">
			<input type="hidden" name="userId" value={form.toConfirm.userId} />
			<input type="hidden" name="confirm" value="yes" />
			<button type="submit">{text.remove.confirm}</button>
		</form>
		<p><a href={resolve('/super-admin/comptes')}>{text.remove.keep}</a></p>
	</div>
{:else if form?.removed}
	<p role="status">
		{text.remove.done} <strong><bdi class="adresse" dir="ltr">{form.removed}</bdi></strong>
	</p>
{:else if form?.removeError}
	<div role="alert">
		<p>{text.remove[form.removeError]}</p>
		{#if form.removeError === 'lastManager' && form.lastManagerOf}
			<ul>
				{#each form.lastManagerOf as name (name)}
					<li><bdi>{name}</bdi></li>
				{/each}
			</ul>
		{/if}
	</div>
{/if}

<p class="details">{text.intro}</p>
<p class="details">{text.purge}</p>

<dl class="compte">
	<dt>{text.total}</dt>
	<dd>{data.accounts.length}</dd>
	<dt>{text.alone}</dt>
	<dd>{data.alone}</dd>
</dl>

<div class="defilement">
	<table>
		<thead>
			<tr>
				<th scope="col">{text.email}</th>
				<th scope="col">{text.name}</th>
				<th scope="col">{text.openedOn}</th>
				<th scope="col">{text.organisations}</th>
			</tr>
		</thead>
		<tbody>
			{#each data.accounts as account (account.id)}
				<tr>
					<th scope="row">
						<!-- Une adresse électronique s'écrit de gauche à droite, même sur une page arabe. -->
						<bdi dir="ltr">{account.email}</bdi>
						{#if account.superAdmin}
							<span class="etiquette">{text.superAdmin}</span>
						{:else}
							<!-- Le premier envoi demande confirmation (ADR 0058 amendée). Un compte de
							     l'exploitant n'a pas de bouton, et le serveur le refuse quand même. -->
							<form method="post" action="?/supprimer" class="supprimer">
								<input type="hidden" name="userId" value={account.id} />
								<button type="submit">{text.remove.button}</button>
							</form>
						{/if}
					</th>
					<td><bdi>{account.name ?? ''}</bdi></td>
					<td>{numericDate(account.openedOn)}</td>
					<td>
						{#if account.organisations.length === 0}
							{text.none}
						{:else}
							<ul>
								{#each account.organisations as organisation (organisation.id)}
									<li>
										<bdi>{organisation.name}</bdi> ({roleOf(organisation)})
										<!-- Pour agir, il entre : l'action même de la console. -->
										<form method="post" action={`${resolve('super-admin')}?/entrer`}>
											<input type="hidden" name="organizationId" value={organisation.id} />
											<button type="submit">{text.enter}</button>
										</form>
									</li>
								{/each}
							</ul>
						{/if}
					</td>
				</tr>
			{/each}
		</tbody>
	</table>
</div>

<style>
	.details {
		max-width: 46rem;
	}
	.compte {
		display: grid;
		grid-template-columns: auto auto;
		justify-content: start;
		gap: 0.25rem 0.75rem;
	}
	.compte dt {
		font-weight: 600;
	}
	.compte dd {
		margin: 0;
	}
	.defilement {
		overflow-x: auto;
	}
	table {
		border-collapse: collapse;
		width: 100%;
	}
	th,
	td {
		text-align: start;
		vertical-align: top;
		padding: 0.5rem;
		border-bottom: 1px solid #d0d7de;
	}
	tbody th {
		font-weight: 400;
	}
	ul {
		margin: 0;
		padding: 0;
		list-style: none;
		display: grid;
		gap: 0.5rem;
	}
	form {
		display: inline;
		margin-inline-start: 0.5rem;
	}
	.encadre {
		max-width: 46rem;
		padding: 0.75rem 1rem;
		border: 2px solid #a3301f;
		border-radius: 0.25rem;
	}
	.supprimer {
		display: block;
		margin: 0.5rem 0 0;
	}
	.etiquette {
		display: inline-block;
		margin-inline-start: 0.5rem;
		padding: 0 0.4rem;
		border: 1px solid #4a5560;
		border-radius: 0.25rem;
		font-size: 0.85rem;
	}
</style>
