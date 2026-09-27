<script lang="ts">
	import { resolve } from '$app/paths';
	import { LANGUES, NOM_DE_LANGUE, numericDate } from '$lib/i18n.js';
	import { commonTexts } from '$lib/i18n/common.js';
	import { EDITOR_GESTURES, MANAGER_GESTURES, membersTexts } from '$lib/i18n/members.js';

	let { data, form } = $props();
	const text = $derived(membersTexts[data.language]);
	const common = $derived(commonTexts[data.language]);
	const roleName = $derived(common.roles as Record<string, string>);
	// Le super-admin administre les membres comme un responsable : le serveur l'accepte
	// (`mustBeAdmin`, ADR 0025), et l'écran lui cachait le formulaire. Trouvé par le parcours complet.
	const estResponsable = $derived(data.role === 'org_admin' || data.role === 'superadmin');
	/** Le message d'une erreur, dans la langue de l'écran ; l'adresse mal formée est commune. */
	const erreur = $derived(
		!form || !('error' in form) || !form.error
			? null
			: form.error === 'invalidEmail'
				? common.errors.invalidEmail
				: text.errors[form.error]
	);
	/**
	 * Ce qui a été saisi, rendu au formulaire après une erreur. La langue du courriel est d'abord
	 * celle de l'écran (étape 19).
	 */
	const saisie = $derived(
		form && 'email' in form
			? { email: form.email, role: form.role, language: form.language }
			: { email: '', role: 'editor', language: data.language }
	);
	/** Le retrait ou le changement de rôle qui attend une confirmation (étape 19). */
	const aConfirmer = $derived(form && 'aConfirmer' in form ? form.aConfirmer : null);
</script>

<svelte:head><title>{text.title} | {data.organisation.nom}</title></svelte:head>

<!-- « Changer d’organisation » est dans l'en-tête de la coquille, pour qui en a plusieurs ou a une
     invitation qui attend, et « Vos organisations » pour les autres (étape 19). Il était ici
     jusqu'à l'étape 17 : les éditeurs n'ouvrent pas cet écran, et il s'y montrait aussi à qui n'a
     qu'une organisation et rien à choisir. -->
<h1>{data.organisation.nom}</h1>
<p>{text.intro}</p>

<!-- Chaque geste dit ce qu'il a fait : sans message, la ligne disparaissait ou changeait sans un mot,
     et la personne se demandait si son clic avait porté. -->
{#if erreur}
	<p role="alert">{erreur}</p>
{:else if form && 'invitee' in form && form.invitee}
	<p role="status">{text.sent}</p>
{:else if form && 'annulee' in form}
	<p role="status">{text.done.cancelled}</p>
{:else if form && 'retire' in form}
	<p role="status">{text.done.removed}</p>
{:else if form && 'change' in form && form.role}
	<p role="status">{text.done.roleChanged(roleName[form.role] ?? form.role)}</p>
{/if}

<!-- Retirer un membre ou changer un rôle ne se fait pas au premier envoi (étape 19) : l'écran dit ce
     que le geste fera, et demande de confirmer, comme pour une salle occupée. En haut, avec les
     messages : l'envoi recharge la page, qui s'ouvre en haut, avec ou sans JavaScript. « Ne rien
     changer » est un lien, qui ramène à l'écran sans rien envoyer. Une responsable qui se vise
     elle-même lit des phrases qui parlent d'elle. -->
{#if aConfirmer}
	<div id="confirmer-membre" class="confirmer" role="alert">
		{#if aConfirmer.geste === 'retirer' && aConfirmer.soiMeme}
			<p>{text.confirm.removeSelf}</p>
			<p>{text.confirm.removeSelfWhat}</p>
		{:else if aConfirmer.geste === 'retirer'}
			<p>{text.confirm.removeIntro} <strong><bdi>{aConfirmer.email}</bdi></strong></p>
			<p>{text.removeHelp}</p>
		{:else if aConfirmer.role === 'editor' && aConfirmer.soiMeme}
			<p>{text.confirm.selfEditor}</p>
			<p>{text.confirm.selfEditorWhat}</p>
		{:else if aConfirmer.role}
			<p>
				{text.confirm.roleIntro[aConfirmer.role]} <strong><bdi>{aConfirmer.email}</bdi></strong>
			</p>
			<p>{text.confirm.roleWhat[aConfirmer.role]}</p>
		{/if}
		<div class="gestes">
			<form method="post" action={aConfirmer.geste === 'retirer' ? '?/retirer' : '?/role'}>
				<input type="hidden" name="membershipId" value={aConfirmer.membershipId} />
				{#if aConfirmer.role}<input type="hidden" name="role" value={aConfirmer.role} />{/if}
				<input type="hidden" name="confirm" value="yes" />
				<button type="submit">
					{#if aConfirmer.geste === 'retirer'}
						{aConfirmer.soiMeme ? text.confirm.removeSelfButton : text.confirm.removeButton}
					{:else}
						{aConfirmer.soiMeme && aConfirmer.role === 'editor'
							? text.confirm.selfEditorButton
							: text.confirm.roleButton}
					{/if}
				</button>
			</form>
			<a href={resolve('/membres')}>{text.confirm.keep}</a>
		</div>
	</div>
{/if}

<h2>{text.membersTitle}</h2>
<ul class="membres">
	{#each data.membres as membre (membre.id)}
		<li>
			<span>
				<bdi>{membre.email}</bdi>
				{#if membre.user_id === data.moi}({text.you}){/if}
			</span>
			<span>{text.role(roleName[membre.role] ?? membre.role)}</span>
			{#if estResponsable}
				<span class="gestes">
					<form method="post" action="?/role">
						<input type="hidden" name="membershipId" value={membre.id} />
						<input
							type="hidden"
							name="role"
							value={membre.role === 'org_admin' ? 'editor' : 'org_admin'}
						/>
						<button type="submit">
							{membre.role === 'org_admin' ? text.giveRole.editor : text.giveRole.org_admin}
						</button>
					</form>
					<form method="post" action="?/retirer">
						<input type="hidden" name="membershipId" value={membre.id} />
						<button type="submit">{text.remove}</button>
					</form>
				</span>
			{/if}
		</li>
	{/each}
</ul>
{#if estResponsable}
	<p class="aide">{text.removeHelp}</p>
{/if}

{#if estResponsable}
	<h2>{text.pendingTitle}</h2>
	{#if data.invitations.length === 0}
		<p>{text.pendingNone}</p>
	{:else}
		<ul class="membres">
			{#each data.invitations as invitation (invitation.id)}
				<li>
					<bdi>{invitation.email}</bdi>
					<span>{text.role(roleName[invitation.role] ?? invitation.role)}</span>
					<span class="aide">
						{text.pendingDates(numericDate(invitation.sent_on), numericDate(invitation.expires_on))}
					</span>
					<form method="post" action="?/annuler">
						<input type="hidden" name="invitationId" value={invitation.id} />
						<button type="submit">{text.cancelInvitation}</button>
					</form>
				</li>
			{/each}
		</ul>
	{/if}

	<h2>{text.inviteTitle}</h2>
	<p>{text.inviteIntro(data.invitationDays)}</p>
	<form method="post" action="?/inviter" class="inviter">
		<label for="email">{text.emailLabel}</label>
		<input
			id="email"
			name="email"
			type="email"
			required
			autocomplete="off"
			dir="ltr"
			value={saisie.email}
			aria-describedby="email-aide"
		/>
		<p id="email-aide" class="aide">{text.emailHelp}</p>

		<!-- La langue du courriel (étape 19) : celle de l'écran d'abord. Chaque langue s'écrit dans sa
		     langue, comme dans le choix de la langue de l'écran. -->
		<label for="emailLanguage">{text.emailLanguageLabel}</label>
		<select id="emailLanguage" name="emailLanguage" aria-describedby="emailLanguage-aide">
			{#each LANGUES as langue (langue)}
				<option value={langue} lang={langue} selected={langue === saisie.language}>
					{NOM_DE_LANGUE[langue]}
				</option>
			{/each}
		</select>
		<p id="emailLanguage-aide" class="aide">{text.emailLanguageHelp}</p>

		<label for="role">{text.roleLabel}</label>
		<select id="role" name="role" aria-describedby="roles-aide">
			<option value="editor" selected={saisie.role === 'editor'}>{text.roleOptions.editor}</option>
			<option value="org_admin" selected={saisie.role === 'org_admin'}>
				{text.roleOptions.org_admin}
			</option>
		</select>
		<!-- Ce que chaque rôle permet, sous le choix, tel que les écrans et la base le tiennent
		     (ADR 0046, retour B3). Le choix du rôle y renvoie, pour les lecteurs d'écran. -->
		<div id="roles-aide" class="roles">
			<section id="peut-editor" aria-labelledby="peut-editor-titre">
				<h3 id="peut-editor-titre">{text.editorCan}</h3>
				<ul>
					{#each EDITOR_GESTURES as geste (geste)}
						<li>{text.gestures.editor[geste]}</li>
					{/each}
				</ul>
			</section>
			<section id="peut-org_admin" aria-labelledby="peut-org_admin-titre">
				<h3 id="peut-org_admin-titre">{text.managerOnly}</h3>
				<ul>
					{#each MANAGER_GESTURES as geste (geste)}
						<li>{text.gestures.manager[geste]}</li>
					{/each}
				</ul>
			</section>
			<p class="aide">{text.alwaysOneManager}</p>
		</div>

		<button type="submit">{text.send}</button>
	</form>
{/if}

<style>
	ul.membres {
		list-style: none;
		padding: 0;
		display: grid;
		gap: 0.5rem;
	}
	ul.membres > li {
		display: flex;
		gap: 0.75rem;
		align-items: center;
		flex-wrap: wrap;
		border-bottom: 1px solid #eee;
		padding-bottom: 0.5rem;
	}
	.gestes {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
		align-items: center;
	}
	.confirmer {
		border: 2px solid #b91c1c;
		border-radius: 0.5rem;
		padding: 0.5rem 0.75rem;
		margin-block: 0 1rem;
		max-width: 36rem;
	}
	.confirmer p {
		margin: 0.35rem 0;
	}
	.inviter {
		display: grid;
		gap: 0.5rem;
		max-width: 36rem;
	}
	.roles {
		display: grid;
		gap: 0.75rem;
		border-inline-start: 3px solid #d1d5db;
		padding-inline-start: 0.75rem;
	}
	.roles h3 {
		font-size: 1rem;
		margin: 0;
	}
	.roles ul {
		margin: 0.25rem 0 0;
		padding-inline-start: 1.25rem;
	}
	.aide {
		font-size: 0.9rem;
		color: #4b5563;
		margin: 0;
	}
	label {
		font-weight: 600;
	}
	input,
	select,
	button {
		font: inherit;
		padding: 0.4rem;
	}
	.inviter button {
		justify-self: start;
	}
</style>
