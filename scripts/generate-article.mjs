// Génère un article de blog (2500 mots, optimisé SEO) via l'API Claude,
// injecte les liens d'affiliation Amazon vérifiés, et écrit le fichier
// Markdown dans src/content/articles/. Conçu pour tourner chaque jour
// via GitHub Actions (voir .github/workflows/daily-article.yml).

import Anthropic from '@anthropic-ai/sdk';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { generatePinImage } from './generate-pin.mjs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ARTICLES_DIR = path.join(ROOT, 'src', 'content', 'articles');
const PINS_DIR = path.join(ROOT, 'public', 'pins');
const PRODUCTS_PATH = path.join(ROOT, 'data', 'products.json');
const TOPICS_PATH = path.join(ROOT, 'data', 'topics.json');

const MIN_WORDS = 2200;
const TARGET_WORDS = 2500;
const MODEL = process.env.ARTICLE_MODEL || 'claude-sonnet-5';
const SITE_HOST = (process.env.SITE_URL || 'https://guide-airfryer.vercel.app').replace(/^https?:\/\//, '').replace(/\/$/, '');

const TYPE_BADGES = {
  comparatif: 'Comparatif',
  complet: 'Guide complet',
  thematique: 'Astuce & idée',
};

async function main() {
  const apiKey = (process.env.ANTHROPIC_API_KEY || '').replace(/\s+/g, '');
  if (!apiKey) {
    throw new Error('ANTHROPIC_API_KEY manquant. Ajoute-le en variable d\'environnement ou en secret GitHub.');
  }
  const amazonTag = (process.env.AMAZON_TAG || '').replace(/\s+/g, '');
  if (!amazonTag) {
    throw new Error('AMAZON_TAG manquant (ton tag d\'affilié Amazon Associates, ex: monsite-21).');
  }
  const pexelsApiKey = (process.env.PEXELS_API_KEY || '').replace(/\s+/g, '');
  if (!pexelsApiKey) {
    console.warn("PEXELS_API_KEY manquant : l'article sera publié sans image d'illustration.");
  }

  await fs.mkdir(ARTICLES_DIR, { recursive: true });

  const [products, topicsData, existingTopicIds] = await Promise.all([
    loadProducts(),
    loadTopics(),
    getExistingTopicIds(),
  ]);

  const topic = pickNextTopic(topicsData, existingTopicIds);
  console.log(`Sujet retenu : [${topic.id}] (${topic.type}) ${topic.title}`);

  const verifiedProducts = products.filter(
    (p) => p.verified && p.asin && p.asin !== 'REMPLACER_ASIN'
  );
  if (verifiedProducts.length === 0) {
    console.warn(
      "Attention : aucun produit vérifié dans data/products.json (verified: true + asin renseigné). " +
        "L'article sera publié SANS lien d'affiliation produit. Complète data/products.json pour activer les liens."
    );
  }

  const client = new Anthropic({ apiKey });
  const article = await generateArticle(client, topic, verifiedProducts);

  const { body, insertedProducts, skippedMarkers } = injectAffiliateLinks(
    article.body,
    verifiedProducts,
    amazonTag
  );

  const wordCount = countWords(article.body);
  console.log(`Longueur générée : ${wordCount} mots.`);
  if (wordCount < MIN_WORDS) {
    console.warn(
      `Attention : l'article ne fait que ${wordCount} mots (objectif ${TARGET_WORDS}). Publié quand même.`
    );
  }
  if (skippedMarkers.length > 0) {
    console.warn(`Marqueurs produit ignorés (id inconnu ou non vérifié) : ${skippedMarkers.join(', ')}`);
  }
  console.log(`Liens d'affiliation insérés : ${insertedProducts.join(', ') || 'aucun'}`);

  const heroImage = pexelsApiKey ? await fetchHeroImage(article.imageQuery || topic.title, pexelsApiKey) : null;
  if (pexelsApiKey && !heroImage) {
    console.warn("Aucune image trouvée sur Pexels pour cette requête, l'article sera publié sans image.");
  } else if (heroImage) {
    console.log(`Image trouvée : ${heroImage.url} (photo par ${heroImage.credit})`);
  }

  const slug = await uniqueSlug(slugify(article.slug || article.title));
  const pubDate = new Date().toISOString().slice(0, 10);
  const filename = `${pubDate}-${slug}.md`;
  const filepath = path.join(ARTICLES_DIR, filename);

  let pinImage = null;
  if (heroImage) {
    try {
      const pinIndex = await countExistingArticles();
      const pinOutPath = path.join(PINS_DIR, `${slug}.png`);
      const { layout, colorway } = await generatePinImage({
        index: pinIndex,
        badge: TYPE_BADGES[topic.type],
        title: article.pinTitle || article.title,
        subtitle: article.description.slice(0, 60),
        siteUrl: SITE_HOST,
        photoUrl: heroImage.url,
        outPath: pinOutPath,
      });
      pinImage = `/pins/${slug}.png`;
      console.log(`Épingle Pinterest générée : ${pinImage} (mise en page ${layout}, teinte ${colorway})`);
    } catch (err) {
      console.warn(`Impossible de générer l'épingle Pinterest : ${err.message}`);
    }
  } else {
    console.warn("Pas d'image héro disponible : l'épingle Pinterest n'a pas été générée.");
  }

  const frontmatter = buildFrontmatter({
    title: article.title,
    description: article.description,
    pubDate,
    type: topic.type,
    topicId: topic.id,
    slug,
    keywords: article.keywords,
    faq: article.faq,
    heroImage,
    pinImage,
    pinTitle: article.pinTitle,
    pinDescription: article.pinDescription,
  });

  await fs.writeFile(filepath, `${frontmatter}\n${body}\n`, 'utf8');
  console.log(`Article écrit : ${path.relative(ROOT, filepath)}`);
}

async function loadProducts() {
  const raw = await fs.readFile(PRODUCTS_PATH, 'utf8');
  return JSON.parse(raw).products;
}

async function loadTopics() {
  const raw = await fs.readFile(TOPICS_PATH, 'utf8');
  return JSON.parse(raw);
}

async function getExistingTopicIds() {
  let files = [];
  try {
    files = await fs.readdir(ARTICLES_DIR);
  } catch {
    return new Set();
  }
  const ids = new Set();
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const content = await fs.readFile(path.join(ARTICLES_DIR, file), 'utf8');
    const match = content.match(/^topicId:\s*"?([^"\n]+)"?\s*$/m);
    if (match) ids.add(match[1]);
  }
  return ids;
}

async function countExistingArticles() {
  try {
    const files = await fs.readdir(ARTICLES_DIR);
    return files.filter((f) => f.endsWith('.md')).length;
  } catch {
    return 0;
  }
}

function pickNextTopic(topicsData, existingTopicIds) {
  for (const topic of topicsData.topics) {
    if (!existingTopicIds.has(topic.id)) return topic;
  }

  // Liste de base épuisée : on bascule sur la génération par combinaison
  // ingrédient x type, qui ne s'épuise jamais (ou presque).
  const types = ['comparatif', 'complet', 'thematique'];
  const ingredients = topicsData.fallbackIngredients;
  for (let round = 0; round < 20; round++) {
    for (const type of types) {
      for (const ingredient of ingredients) {
        const id = `fallback-${type}-${slugify(ingredient)}-${round}`;
        if (!existingTopicIds.has(id)) {
          const title = topicsData.fallbackTemplates[type].replace('{ingredient}', ingredient);
          return { id, type, title };
        }
      }
    }
  }
  throw new Error('Impossible de trouver un nouveau sujet (cas extrêmement improbable).');
}

async function generateArticle(client, topic, verifiedProducts) {
  const productListText =
    verifiedProducts.length > 0
      ? verifiedProducts
          .map((p) => `- id="${p.id}" : ${p.name} (${p.brand}, catégorie ${p.category}) — ${p.note}`)
          .join('\n')
      : null;

  const typeInstructions = {
    comparatif:
      "C'est un GUIDE COMPARATIF : compare au moins deux options (modèles, marques, ou catégories) selon des critères concrets (prix, capacité, praticité, entretien, sécurité). Inclue un tableau comparatif en Markdown.",
    complet:
      "C'est un GUIDE COMPLET : couvre le sujet en profondeur, étape par étape, avec des sous-parties claires (H2/H3), des exemples concrets et des conseils pratiques actionnables.",
    thematique:
      "C'est un ARTICLE THÉMATIQUE : angle plus léger et engageant (astuces, idées, liste), mais toujours utile et concret, avec des exemples précis.",
  };

  const productInstructions = productListText
    ? `Tu peux recommander, à des endroits pertinents de l'article (jamais plus de 4 fois au total), l'un des produits suivants en insérant EXACTEMENT ce marqueur (rien d'autre autour) : [[PRODUIT:id|texte du lien]] où "id" est repris tel quel dans la liste ci-dessous et "texte du lien" est un texte d'ancre naturel (ex: "le Ninja Air Fryer Max Pro"). Ne cite JAMAIS de prix (les prix Amazon changent en temps réel et ne doivent pas être affichés sur le site). N'invente aucun autre produit ni id.\n\nProduits disponibles :\n${productListText}`
    : "Ne mentionne aucun lien ou marqueur produit (aucun produit vérifié n'est disponible actuellement). Tu peux parler d'airfryers en général sans citer de modèle précis à acheter.";

  const systemPrompt = `Tu es un rédacteur web francophone spécialisé en SEO et en cuisine, expert des friteuses sans huile (airfryer). Tu écris pour le blog d'affiliation "GuideAirfryer". Ton but : produire un contenu qui se classe bien sur Google ET qui est réellement utile et agréable à lire, jamais du remplissage.`;

  const userPrompt = `Rédige un article de blog en français sur le sujet suivant : "${topic.title}".

${typeInstructions[topic.type]}

Exigences SEO et éditoriales :
- Longueur du corps de l'article : environ ${TARGET_WORDS} mots (minimum ${MIN_WORDS}), hors FAQ.
- Structure Markdown avec un seul niveau de titre implicite (ne mets PAS de "# titre" en H1 dans le corps, commence directement par une intro puis des "## " et "### ").
- Une introduction qui accroche et annonce clairement ce que le lecteur va apprendre.
- Utilise le mot-clé principal et des variantes naturelles (pas de sur-optimisation ni de répétition artificielle).
- Des listes à puces et au moins un tableau Markdown si pertinent pour le sujet.
- Une conclusion avec une recommandation claire.
- Ton naturel, concret, orienté conseils pratiques (pas de généralités creuses).

${productInstructions}

Réponds UNIQUEMENT avec un bloc de code \`\`\`json contenant un objet avec exactement ces clés :
- "title" : titre SEO accrocheur (55-65 caractères idéalement), sans guillemets superflus.
- "description" : méta-description (150-160 caractères), incitant au clic.
- "slug" : slug URL en français, minuscules, mots séparés par des tirets, sans accents, 3-6 mots.
- "keywords" : tableau de 6 à 10 mots-clés/expressions pertinents (strings).
- "faq" : tableau de 4 à 6 objets {"q": "...", "a": "..."} avec des questions que se posent vraiment les internautes sur ce sujet, réponses concises (2-4 phrases).
- "body" : le corps de l'article complet en Markdown (string), avec les marqueurs [[PRODUIT:id|texte]] si applicable.
- "imageQuery" : une requête courte EN ANGLAIS (3-5 mots) pour trouver une photo de banque d'images (Pexels) qui illustre bien le sujet, sans marque ni nom de produit (ex: "crispy chicken wings kitchen", "air fryer french fries").
- "pinTitle" : titre court et accrocheur pour une épingle Pinterest (2-4 mots maximum, ex: "6 habitudes", "Ninja vs Philips"), qui doit tenir sur une grande ligne de titre manuscrit sur une image verticale. Pas de ponctuation finale.
- "pinDescription" : description pour Pinterest (jusqu'à 500 caractères), mots-clés importants en début de phrase, ton engageant, peut inclure 2-3 hashtags pertinents à la fin.

N'ajoute aucun texte avant ou après le bloc \`\`\`json.`;

  const messages = [{ role: 'user', content: userPrompt }];
  let article = await callAndParse(client, systemPrompt, messages);

  let wordCount = countWords(article.body);
  if (wordCount < MIN_WORDS) {
    console.log(`Premier essai trop court (${wordCount} mots), nouvelle tentative avec plus de détails...`);
    messages.push({ role: 'assistant', content: JSON.stringify(article) });
    messages.push({
      role: 'user',
      content: `Ton brouillon ne fait que ${wordCount} mots, il en faut au moins ${MIN_WORDS} (idéalement ${TARGET_WORDS}). Réécris une version complète et plus développée (plus d'exemples, de sous-parties, de détails concrets), en respectant strictement le même format de réponse (un seul bloc \`\`\`json avec les mêmes clés).`,
    });
    article = await callAndParse(client, systemPrompt, messages);
  }

  return article;
}

async function callAndParse(client, systemPrompt, messages) {
  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 16000,
    system: systemPrompt,
    messages,
  });

  const text = response.content
    .filter((block) => block.type === 'text')
    .map((block) => block.text)
    .join('\n');

  if (response.stop_reason === 'max_tokens') {
    throw new Error(
      'La réponse du modèle a été coupée avant la fin (limite max_tokens atteinte). ' +
        'Augmente max_tokens dans scripts/generate-article.mjs.'
    );
  }

  const jsonMatch = text.match(/```json\s*([\s\S]*?)\s*```/);
  const jsonText = jsonMatch ? jsonMatch[1] : text;

  let parsed;
  try {
    parsed = JSON.parse(jsonText);
  } catch {
    // Le modèle insère parfois un vrai saut de ligne au lieu de "\n" dans une chaîne,
    // ce qui casse un JSON.parse strict. On répare en échappant les caractères de
    // contrôle bruts trouvés à l'intérieur des chaînes, puis on reparse.
    try {
      parsed = JSON.parse(escapeControlCharsInStrings(jsonText));
    } catch (err) {
      throw new Error(`Impossible de parser la réponse du modèle en JSON : ${err.message}\n--- Réponse brute ---\n${text}`);
    }
  }

  for (const key of ['title', 'description', 'slug', 'keywords', 'faq', 'body', 'imageQuery', 'pinTitle', 'pinDescription']) {
    if (!(key in parsed)) throw new Error(`Réponse du modèle incomplète, clé manquante : "${key}"`);
  }

  return parsed;
}

function escapeControlCharsInStrings(text) {
  let result = '';
  let inString = false;
  let escaped = false;
  for (const ch of text) {
    if (!inString) {
      result += ch;
      if (ch === '"') inString = true;
      continue;
    }
    if (escaped) {
      result += ch;
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      result += ch;
      escaped = true;
      continue;
    }
    if (ch === '"') {
      result += ch;
      inString = false;
      continue;
    }
    if (ch === '\n') result += '\\n';
    else if (ch === '\r') result += '\\r';
    else if (ch === '\t') result += '\\t';
    else result += ch;
  }
  return result;
}

async function fetchHeroImage(query, pexelsApiKey) {
  try {
    const url = `https://api.pexels.com/v1/search?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape`;
    const res = await fetch(url, { headers: { Authorization: pexelsApiKey } });
    if (!res.ok) {
      console.warn(`Pexels a répondu avec le statut ${res.status}, image ignorée.`);
      return null;
    }
    const data = await res.json();
    const photo = data.photos && data.photos[0];
    if (!photo) return null;
    return {
      url: photo.src.large2x,
      alt: photo.alt || query,
      credit: photo.photographer,
      creditUrl: photo.photographer_url,
    };
  } catch (err) {
    console.warn(`Erreur lors de la récupération de l'image Pexels : ${err.message}`);
    return null;
  }
}

function injectAffiliateLinks(body, verifiedProducts, amazonTag) {
  const byId = new Map(verifiedProducts.map((p) => [p.id, p]));
  const insertedProducts = [];
  const skippedMarkers = [];

  const result = body.replace(/\[\[PRODUIT:([a-z0-9-]+)\|([^\]]+)\]\]/gi, (_match, id, anchorText) => {
    const product = byId.get(id);
    if (!product) {
      skippedMarkers.push(id);
      return anchorText;
    }
    insertedProducts.push(product.id);
    const url = `https://www.amazon.fr/dp/${product.asin}?tag=${encodeURIComponent(amazonTag)}`;
    return [
      '<div class="product-box">',
      '<div>',
      `<span class="product-name">${escapeHtml(anchorText)}</span>`,
      `<span class="product-note">${escapeHtml(product.note)}</span>`,
      '</div>',
      `<a class="btn-amazon" href="${url}" rel="nofollow sponsored noopener" target="_blank">Voir le prix sur Amazon</a>`,
      '</div>',
    ].join('\n');
  });

  return { body: result, insertedProducts, skippedMarkers };
}

function escapeHtml(str) {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function countWords(text) {
  return text
    .replace(/<[^>]+>/g, ' ')
    .split(/\s+/)
    .filter(Boolean).length;
}

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 80);
}

async function uniqueSlug(baseSlug) {
  let files = [];
  try {
    files = await fs.readdir(ARTICLES_DIR);
  } catch {
    return baseSlug;
  }
  const existingSlugs = new Set();
  for (const file of files) {
    if (!file.endsWith('.md')) continue;
    const content = await fs.readFile(path.join(ARTICLES_DIR, file), 'utf8');
    const match = content.match(/^slug:\s*"?([^"\n]+)"?\s*$/m);
    if (match) existingSlugs.add(match[1]);
  }
  if (!existingSlugs.has(baseSlug)) return baseSlug;
  let i = 2;
  while (existingSlugs.has(`${baseSlug}-${i}`)) i++;
  return `${baseSlug}-${i}`;
}

function buildFrontmatter({
  title,
  description,
  pubDate,
  type,
  topicId,
  slug,
  keywords,
  faq,
  heroImage,
  pinImage,
  pinTitle,
  pinDescription,
}) {
  const lines = [
    '---',
    `title: ${JSON.stringify(title)}`,
    `description: ${JSON.stringify(description)}`,
    `pubDate: ${JSON.stringify(pubDate)}`,
    `type: ${JSON.stringify(type)}`,
    `topicId: ${JSON.stringify(topicId)}`,
    `slug: ${JSON.stringify(slug)}`,
    `keywords: ${JSON.stringify(keywords)}`,
  ];
  if (Array.isArray(faq) && faq.length > 0) {
    lines.push(`faq: ${JSON.stringify(faq)}`);
  }
  if (heroImage) {
    lines.push(`heroImage: ${JSON.stringify(heroImage.url)}`);
    lines.push(`heroImageAlt: ${JSON.stringify(heroImage.alt)}`);
    lines.push(`heroImageCredit: ${JSON.stringify(heroImage.credit)}`);
    lines.push(`heroImageCreditUrl: ${JSON.stringify(heroImage.creditUrl)}`);
  }
  if (pinImage) {
    lines.push(`pinImage: ${JSON.stringify(pinImage)}`);
    lines.push(`pinTitle: ${JSON.stringify(pinTitle)}`);
    lines.push(`pinDescription: ${JSON.stringify(pinDescription)}`);
  }
  lines.push('---');
  return lines.join('\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
