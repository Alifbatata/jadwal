// Une responsable qui se donne le rôle d'éditeur, alors qu'une autre responsable reste (étape 18).
//
// Après ce geste, l'écran Membres ne lui est plus ouvert : son chargement la renvoyait vers
// « À venir » (`mustAdminister`), sans un mot, et elle ne savait pas ce qui s'était passé. L'action
// l'y envoie maintenant elle-même, avec ce paramètre, et la coquille (`routes/+layout.svelte`)
// affiche la phrase qui le dit, sur l'écran où elle arrive.
//
// Un paramètre d'adresse plutôt qu'un cookie : rien à retenir, rien de personnel. La coquille ne
// l'affiche qu'à une personne qui est bien éditrice : une adresse copiée ne fait rien dire de faux.

/** Le paramètre d'adresse que la coquille lit, et sa valeur. */
export const SELF_EDITOR_PARAM = 'avis';
export const SELF_EDITOR_VALUE = 'editeur';

/** L'écran où elle arrive : « À venir », avec le paramètre. */
export const SELF_EDITOR_ARRIVAL = `/?${SELF_EDITOR_PARAM}=${SELF_EDITOR_VALUE}`;
