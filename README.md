# Calendrier Asso

Plateforme privée des associations de **Lannion** : chaque association a son compte, partage son agenda (synchronisé avec Google Agenda), présente ses activités et ce qu'elle peut proposer aux autres.

---

## 🎯 Objectif

- Montrer ce que fait chaque association.
- Centraliser les activités dans un calendrier commun.
- Faciliter l'entraide : activités communes, ressources et services proposés entre associations.

## 👥 Groupes et comptes

- Le site est organisé en **groupes** (ex. groupe « Lannion »). Le modèle permet d'ajouter d'autres groupes plus tard.
- Une association s'inscrit dans un groupe : son compte est **en attente jusqu'à validation par un admin** du groupe.
- Rôles :
  - **Admin de groupe** : valide ou refuse les inscriptions, gère les associations, peut tout exporter.
  - **Membre d'association** : gère le profil et les activités de sa propre association.

## 📅 Calendrier et couleurs

Les associations d'un groupe **voient toutes les activités du groupe**. Chaque activité a un **type** (sport, jeux, soirée...) et un **accès** qui indique qui peut y participer :

| Accès | Qui peut participer | Qui la voit |
|---|---|---|
| **Réservée** | Uniquement l'association organisatrice |
| **Commune** | Toutes les associations du groupe | 

**Code couleur (du point de vue de la personne connectée)** :

- Les activités auxquelles mon association **peut participer** (les siennes + les communes) ont leurs couleurs par Accès.
- Les activités **réservées à une autre association** (je ne peux pas y participer) s'affichent en gris.

Les couleurs sont stockées dans la base du site.

## 🔐 Intégration Google Agenda (accès sécurisé)

Aucune association n'a d'agenda Google : le site en crée et en gère pour elles.

- Un **compte de service Google** (service account) crée et synchronise les événements via la Google Calendar API.
- Les agendas Google restent **privés** : seul le site y accède, après connexion de l'utilisateur.
- Un utilisateur ne voit que les activités de son propre groupe.

## 📊 Export CSV des activités

| Colonne | Description |
|---|---|
| `id` | Identifiant de l'activité |
| `association` | Association organisatrice |
| `titre` | Titre |
| `type` | Sport, jeux, soirée... |
| `acces` | reservee / commune |
| `debut` | Date et heure de début |
| `fin` | Date et heure de fin |
| `lieu` | Lieu |
| `description` | Détails |

```csv
id,association,titre,type,acces,debut,fin,lieu,description
1,Asso 1,Tournoi de foot,sport,reservee,2026-11-05 18:00,2026-11-05 20:00,Stade,Entraînement
2,Asso 2,Soirée de fin d'année,soiree,commune,2026-12-18 19:00,2026-12-18 23:00,Salle des fêtes,Ouvert à toutes les assos
```

Droits d'export : admin = tout ; association = ses propres activités.

## 🧱 Stack technique

Choisie pour être simple, légère et facile à tester en local :

- **Backend** : Node.js + Express
- **Base de données** : PostgreSQL
- **Front** : HTML/CSS/JS + [FullCalendar](https://fullcalendar.io/) pour l'affichage du calendrier
- **Authentification** : e-mail + mot de passe (hash `bcrypt`), sessions sécurisées
- **Google** : Google Calendar API (compte de service)

## 🗃️ Modèle de données (aperçu)

```
groups(id, name)
associations(id, group_id, name, description, logo, contact, status)
users(id, association_id, email, password_hash, role, status)   -- status: pending | approved
activity_types(id, association_id NULL, name, color)            -- association_id NULL = type commun
activities(id, association_id, type_id, title, description,
           start, end, location, access, google_event_id)       -- access: reservee | commune
offers(id, association_id, kind, title, description)            -- kind: offre | besoin
```

## 🚀 Installation (test local)

```bash
git clone <url-du-repo>
cd calendrier-asso
npm install
cp .env.example .env     # puis remplir les variables
npm run dev
```

Variables d'environnement :

```
PORT=3000
SESSION_SECRET=
DATABASE_URL=postgresql://user:password@localhost:5432/calendrier_asso
GOOGLE_SERVICE_ACCOUNT_KEY=./secrets/google-service-account.json
GOOGLE_CALENDAR_ID=
```

## 🔒 Sécurité et données

- Accès uniquement après connexion et validation par un admin.
- Agendas Google jamais publics ; chaque utilisateur est limité aux données de son groupe.
- Mots de passe hashés, secrets hors du dépôt (`.env` et clé Google dans `.gitignore`).
- Données limitées au nécessaire (RGPD) ; possibilité de supprimer un compte.

## 🛣️ Feuille de route

- [ ] Base de données + groupes + rôles
- [ ] Inscription avec validation admin
- [ ] Profils d'associations et annuaire
- [ ] Activités (réservées / communes) + couleurs
- [ ] Calendrier FullCalendar avec filtres
- [ ] Synchronisation Google Agenda (compte de service)
- [ ] Offres et besoins
- [ ] Export CSV des activités
- [ ] Test avec les 7 associations