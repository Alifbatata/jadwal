// Les pages publiques n'embarquent **aucun** JavaScript (ADR 0027).
//
// `csr = false` ne se contente pas de ne rien hydrater : SvelteKit n'envoie alors aucun script au
// navigateur. C'est ce qui rend l'objectif de cinquante kilo-octets atteignable sans discuter, et
// c'est aussi ce qui garantit la promesse du cadrage — rien à charger, donc rien à charger d'un
// autre domaine.
//
// Ce que du JavaScript aurait amélioré ici : déplier un détail, changer de vue, filtrer. `<details>`
// et des liens font les trois. Il ne reste rien à améliorer.
export const csr = false;
