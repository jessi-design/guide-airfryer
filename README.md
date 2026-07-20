# GuideAirfryer — blog d'affiliation automatisé

Blog Astro qui publie automatiquement, chaque jour, un article de ~2500 mots optimisé SEO
(comparatif, guide complet ou article thématique) sur le thème des friteuses sans huile
(airfryer), avec insertion automatique de liens d'affiliation Amazon.

## Comment ça marche

```
GitHub Actions (cron quotidien)
   → scripts/generate-article.mjs
       → choisit le prochain sujet dans data/topics.json
       → appelle l'API Claude pour rédiger l'article (JSON structuré)
       → insère les liens Amazon depuis data/products.json (uniquement les produits "verified": true)
       → écrit un fichier .md dans src/content/articles/
   → commit + push automatique
   → Vercel détecte le push et redéploie le site
```

Aucune intervention manuelle n'est nécessaire une fois la configuration ci-dessous effectuée.
Le système ne tombe jamais à court de sujets : une fois les ~90 sujets de `data/topics.json`
épuisés (environ 3 mois), il continue en combinant des ingrédients avec des formats d'article
(voir `fallbackIngredients` / `fallbackTemplates` dans ce fichier).

## Structure du projet

- `src/content/articles/` — les articles générés (Markdown + frontmatter), un fichier par jour.
- `src/content.config.ts` — schéma de validation des articles (titre, description, type, mots-clés, FAQ…).
- `src/layouts/`, `src/components/` — mise en page, SEO (meta, Open Graph, JSON-LD Article/FAQPage/Breadcrumb), disclosure d'affiliation.
- `src/pages/` — accueil, listes par catégorie (`/comparatifs/`, `/guides/`, `/astuces/`), page article, RSS, mentions légales.
- `data/products.json` — catalogue des produits recommandables (à compléter avec tes vrais ASIN).
- `data/topics.json` — liste des sujets à publier, dans l'ordre.
- `scripts/generate-article.mjs` — le script de génération.
- `.github/workflows/daily-article.yml` — l'automatisation quotidienne.

## Mise en place (à faire une seule fois)

### 1. Créer un dépôt GitHub

Crée un dépôt (public ou privé) sur GitHub, puis pousse ce projet :

```sh
git init
git add .
git commit -m "Initial commit: système de blog airfryer automatisé"
git branch -M main
git remote add origin https://github.com/<ton-compte>/<ton-repo>.git
git push -u origin main
```

### 2. Créer une clé API Anthropic

1. Va sur [console.anthropic.com](https://console.anthropic.com), crée un compte si besoin.
2. Ajoute un moyen de paiement et un peu de crédit (facturation à l'usage — un article de 2500
   mots coûte de l'ordre de quelques centimes avec Claude Sonnet).
3. Crée une clé API (**API Keys** → **Create Key**). Copie-la, elle ne sera plus affichée ensuite.

### 3. Configurer les secrets GitHub

Dans ton dépôt GitHub : **Settings → Secrets and variables → Actions**.

Onglet **Secrets** (valeurs sensibles) :
- `ANTHROPIC_API_KEY` — la clé créée à l'étape 2.
- `AMAZON_TAG` — ton tag d'affilié Amazon Associates (ex: `monsite-21`).

Onglet **Variables** (non sensible, optionnel) :
- `SITE_URL` — l'URL finale du site une fois déployé (ex: `https://guide-airfryer.vercel.app`).
- `ARTICLE_MODEL` — laisse vide pour utiliser le modèle par défaut (`claude-sonnet-5`).

### 4. Compléter le catalogue produits

Ouvre `data/products.json`. Pour chaque produit que tu veux pouvoir recommander :

1. Trouve le produit sur Amazon.fr et récupère son **ASIN** (visible dans l'URL du produit,
   ou via la barre d'outils **SiteStripe** d'Amazon Associates une fois connecté à ton compte
   partenaire).
2. Remplace `"asin": "REMPLACER_ASIN"` par le vrai ASIN.
3. Passe `"verified"` à `true`.

Tant qu'un produit n'a pas `verified: true` avec un ASIN valide, le script ne l'utilisera
**jamais** dans un article (pour ne jamais publier un lien cassé). Tu peux ajouter d'autres
produits en suivant le même format.

> **Important — conformité Amazon Associates** : les règles du programme interdisent d'afficher
> des prix qui ne proviennent pas en temps réel de leur API. C'est pourquoi ce site n'affiche
> jamais de prix : seulement un lien "Voir le prix sur Amazon".

### 5. Déployer sur Vercel

1. Va sur [vercel.com](https://vercel.com), crée un compte avec ton GitHub.
2. **Add New → Project**, sélectionne ton dépôt.
3. Vercel détecte Astro automatiquement (build command `astro build`, output `dist/`). Clique sur **Deploy**.
4. Une fois déployé, note l'URL (ex: `https://guide-airfryer.vercel.app`) et mets-la dans :
   - la variable GitHub `SITE_URL` (étape 3),
   - `astro.config.mjs` si tu préfères une valeur en dur plutôt que la variable d'environnement.
5. (Optionnel) Dans **Project Settings → Domains**, ajoute ton propre nom de domaine.

Chaque `git push` sur `main` (donc chaque publication automatique) redéploiera le site.

### 6. Premier test manuel

Dans GitHub : **Actions → Publication quotidienne d'un article → Run workflow**. Ça lance une
génération immédiate sans attendre le lendemain. Vérifie les logs, puis va voir le nouvel
article commité dans `src/content/articles/` et publié sur ton site Vercel.

Le cron est programmé à 6h UTC chaque jour (`.github/workflows/daily-article.yml`), modifiable
si tu préfères un autre horaire.

## Utilisation en local (optionnel)

```sh
npm install
npm run dev        # site en local sur http://localhost:4321

# pour tester la génération d'un article sans passer par GitHub Actions :
$env:ANTHROPIC_API_KEY="sk-ant-..."   # PowerShell
$env:AMAZON_TAG="tonTag-21"
npm run generate

# ou, en copiant .env.example vers .env et en le remplissant :
node --env-file=.env scripts/generate-article.mjs
```

## Avant la mise en ligne définitive

- Complète `src/pages/mentions-legales.astro` avec ta véritable identité/statut (obligatoire légalement en France).
- Vérifie que ton compte Amazon Associates est bien actif pour le marché France (amazon.fr).
- Amazon exige au moins 3 ventes qualifiées dans les 180 jours suivant l'inscription, sous peine
  de fermeture du compte partenaire — publie et fais connaître le site rapidement.
- Relis quelques articles générés avant de les partager largement : le script vérifie la
  longueur et la structure, mais une relecture humaine reste recommandée au début.
