// La page d'essai charge le widget, et lui seul : aucun autre script (ADR 0005).
//
// `csr = false` la rend comparable au site d'une organisation, où SvelteKit n'existe pas. Sans
// cela, le script d'amorçage de Kit s'exécuterait à côté du widget et l'essai serait moins honnête.
export const csr = false;
