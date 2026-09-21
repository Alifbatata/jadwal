# ADR 0020 : Rétention du journal d'audit

## Contexte

L'ADR 0015 a fait du journal d'audit une table en insertion seule : le rôle applicatif y écrit et y
lit, mais ne peut ni modifier ni supprimer une ligne, et le rôle super-admin pas davantage. C'est ce
qui lui donne sa valeur de preuve. La même décision laissait un point ouvert : « La table grossit
sans limite tant qu'aucune purge n'est décidée. Une purge éventuelle relèvera d'une tâche d'entretien
jouée par le propriétaire, hors du chemin applicatif, et sera décidée par un ADR à ce moment-là. »

Deux exigences se contredisent en apparence. Le journal doit être intouchable par ceux qui
l'écrivent, sinon il ne prouve rien. Et il doit pouvoir être purgé, sinon il grossit sans fin et
garde des données personnelles — l'identifiant d'un responsable, et par ricochet son adresse — bien
au-delà de ce qui est utile.

## Décision

- **La durée de conservation est de vingt-quatre mois.** Deux ans couvrent un cycle annuel complet
  de programme, et laissent le temps d'instruire un incident signalé tardivement.
- **La fenêtre est portée par une politique de sécurité, pas par le code de la procédure.** Une
  politique de suppression, réservée au rôle propriétaire, n'autorise l'effacement que des lignes
  antérieures à vingt-quatre mois :

  ```sql
  create policy audit_log_owner_purge on "audit_log"
    for delete to jadwal_owner
    using (created_at < now() - interval '24 months');
  ```

  Un `delete` sans clause de restriction ne supprime donc que ce que la fenêtre autorise. Une erreur
  dans la procédure, ou un appel malveillant, ne peut pas emporter les entrées récentes.

- **La procédure appartient au propriétaire et n'est accordée à personne d'autre.** Ni le rôle
  applicatif ni le rôle super-admin ne reçoivent le droit de l'exécuter : la tentative échoue sur un
  refus de droit, avant toute lecture.
- **Le propriétaire n'a aucune politique de lecture sur le journal.** Il supprime sans lire. La
  purge n'est donc pas un chemin détourné vers le contenu des autres organisations.
- **L'horodatage n'est pas écrivable par l'application.** Le droit d'insertion est accordé colonne
  par colonne, sans `created_at`, qui garde sa valeur par défaut posée par le serveur. Une entrée ne
  peut être ni antidatée pour tomber dans la fenêtre de purge, ni postdatée pour y échapper.
- **La programmation périodique n'est pas dans le code applicatif.** Elle viendra à l'étape 8, avec
  le déploiement, sous la forme d'une tâche d'entretien lancée avec les identifiants du
  propriétaire.

## Conséquences

- Le journal reste en insertion seule pour tout le monde sauf pour une suppression bornée, dont la
  borne est vérifiée par la base à chaque ligne.
- La purge est testable sans mise en scène : un test pose des entrées de trente, vingt-cinq,
  vingt-trois et trois mois, joue la purge, et vérifie qu'il reste exactement les deux plus jeunes.
  Un autre vérifie que les rôles applicatifs se voient refuser la procédure.
- Les fixtures d'un tel test ne peuvent pas être écrites par le rôle applicatif, puisqu'il ne peut
  pas choisir l'horodatage : elles passent par le rôle du serveur, hors du chemin applicatif. C'est
  cohérent, puisque le test porte sur une tâche d'entretien et non sur un usage de l'application.
- Passé vingt-quatre mois, un retour arrière sur une modification ancienne n'est plus possible. Le
  cadrage demande un retour arrière sur les modifications récentes, ce qui reste tenu.
- Si la durée devait changer, il faudrait une migration : la valeur est dans une politique, pas dans
  un fichier de configuration. C'est voulu — une durée de conservation est une décision, pas un
  réglage.

## Statut

Accepté, 2026-09-20. Étape 3 de la feuille de route (connexion, organisations, rôles, invitations,
super-admin, journal).
