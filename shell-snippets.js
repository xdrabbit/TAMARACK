const fs = require('fs').promises;
const path = require('path');

const SHELL_SNIPPETS_FILE = path.join(__dirname, 'data', 'shell-snippets.json');

const DEFAULT_DATA = {
  title: 'TAMARACK Safe Shell Snippets',
  description: 'Reference-only shell helpers for local review.',
  updatedAt: null,
  categoryOrder: [],
  exportPolicy: {
    omitRiskLevels: ['dangerous'],
    header: [
      '# ---- TAMARACK managed shell helpers ----',
      '# Review before use. Generated from TAMARACK knowledge base.'
    ]
  },
  safetyRules: [],
  snippets: []
};

function normalizeSnippet(snippet) {
  return {
    id: snippet.id,
    title: snippet.title || 'Untitled snippet',
    category: snippet.category || 'uncategorized',
    description: snippet.description || '',
    code: snippet.code || '',
    riskLevel: snippet.riskLevel || 'safe',
    platform: snippet.platform || 'both',
    tags: Array.isArray(snippet.tags) ? snippet.tags : [],
    notes: snippet.notes || '',
    createdAt: snippet.createdAt || null,
    updatedAt: snippet.updatedAt || null
  };
}

async function loadShellSnippetsData() {
  const raw = await fs.readFile(SHELL_SNIPPETS_FILE, 'utf8');
  const parsed = JSON.parse(raw);

  return {
    ...DEFAULT_DATA,
    ...parsed,
    exportPolicy: {
      ...DEFAULT_DATA.exportPolicy,
      ...(parsed.exportPolicy || {})
    },
    categoryOrder: Array.isArray(parsed.categoryOrder) ? parsed.categoryOrder : [],
    safetyRules: Array.isArray(parsed.safetyRules) ? parsed.safetyRules : [],
    snippets: Array.isArray(parsed.snippets) ? parsed.snippets.map(normalizeSnippet) : []
  };
}

function orderSnippets(snippets, categoryOrder = []) {
  const categoryRanks = new Map(categoryOrder.map((category, index) => [category, index]));

  return snippets
    .map((snippet, index) => ({ snippet, index }))
    .sort((left, right) => {
      const leftRank = categoryRanks.has(left.snippet.category) ? categoryRanks.get(left.snippet.category) : Number.MAX_SAFE_INTEGER;
      const rightRank = categoryRanks.has(right.snippet.category) ? categoryRanks.get(right.snippet.category) : Number.MAX_SAFE_INTEGER;

      if (leftRank !== rightRank) {
        return leftRank - rightRank;
      }

      if (left.snippet.category !== right.snippet.category) {
        return left.snippet.category.localeCompare(right.snippet.category);
      }

      return left.index - right.index;
    })
    .map((entry) => entry.snippet);
}

function buildShellSnippetEntries(data) {
  return orderSnippets(data.snippets, data.categoryOrder).map((snippet) => ({
    id: `shell-snippet:${snippet.id}`,
    title: snippet.title,
    type: 'shell-snippet',
    content: snippet.description,
    code: snippet.code,
    tags: [snippet.category, snippet.platform, snippet.riskLevel, ...snippet.tags],
    created: snippet.updatedAt || snippet.createdAt || null,
    category: snippet.category,
    riskLevel: snippet.riskLevel,
    platform: snippet.platform,
    notes: snippet.notes
  }));
}

function buildShellSnippetExport(data) {
  const omittedRiskLevels = new Set(
    Array.isArray(data.exportPolicy?.omitRiskLevels) ? data.exportPolicy.omitRiskLevels : []
  );
  const headerLines = Array.isArray(data.exportPolicy?.header) && data.exportPolicy.header.length > 0
    ? data.exportPolicy.header
    : DEFAULT_DATA.exportPolicy.header;
  const orderedSnippets = orderSnippets(data.snippets, data.categoryOrder).filter(
    (snippet) => !omittedRiskLevels.has(snippet.riskLevel)
  );
  const grouped = new Map();

  for (const snippet of orderedSnippets) {
    if (!grouped.has(snippet.category)) {
      grouped.set(snippet.category, []);
    }
    grouped.get(snippet.category).push(snippet);
  }

  const lines = [
    ...headerLines,
    '# Copy by choice only. Nothing here installs automatically.',
    ''
  ];

  for (const [category, snippets] of grouped.entries()) {
    lines.push(`# Category: ${category}`);

    for (const snippet of snippets) {
      lines.push(`# ${snippet.title} [risk: ${snippet.riskLevel} | platform: ${snippet.platform}]`);

      if (snippet.notes) {
        lines.push(`# Note: ${snippet.notes}`);
      }

      lines.push(snippet.code, '');
    }
  }

  return lines.join('\n').trim();
}

module.exports = {
  SHELL_SNIPPETS_FILE,
  DEFAULT_DATA,
  loadShellSnippetsData,
  buildShellSnippetEntries,
  buildShellSnippetExport,
  orderSnippets
};
