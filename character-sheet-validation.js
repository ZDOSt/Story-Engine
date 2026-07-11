export const CHARACTER_SHEET_HEADINGS = Object.freeze([
    'BASIC INFO',
    'APPEARANCE',
    'STATS',
    'NATURAL WEAPONS',
    'ABILITIES',
    'SPELLS',
    'INVENTORY',
    'CURRENCY',
    'GEAR',
    'CHARACTER ANCHORS',
]);

export function assertValidCharacterSheet(sheetText, options = {}) {
    const text = String(sheetText || '').trim();
    if (!text) throw new Error('Character sheet generation returned empty text.');

    const sections = parseRequiredSections(text);
    validateLockedStats(sections.get('STATS'), options.stats);

    const expectedRace = String(options.expectedRace || '').trim();
    if (expectedRace) validateExpectedRace(sections.get('BASIC INFO'), expectedRace);

    if (String(options.genre || '').trim().toLowerCase() === 'isekai') {
        validateIsekaiPremise(text);
    }

    return text;
}

function parseRequiredSections(text) {
    const lines = text.split(/\r?\n/);
    const headings = [];

    for (let index = 0; index < lines.length; index += 1) {
        const match = lines[index].match(/^#\s+(.+?)\s*$/);
        if (!match) continue;
        headings.push({ name: match[1].trim(), lineIndex: index });
    }

    const foundNames = headings.map(item => item.name);
    if (headings[0]?.lineIndex !== 0) {
        throw new Error('Character sheet is invalid: content appears before # BASIC INFO.');
    }

    const duplicate = CHARACTER_SHEET_HEADINGS.find(name => foundNames.filter(found => found === name).length > 1);
    if (duplicate) throw new Error(`Character sheet is invalid: # ${duplicate} appears more than once.`);

    const missing = CHARACTER_SHEET_HEADINGS.filter(name => !foundNames.includes(name));
    if (missing.length) {
        throw new Error(`Character sheet is invalid: missing required heading${missing.length === 1 ? '' : 's'} ${missing.map(name => `# ${name}`).join(', ')}.`);
    }

    if (headings.length !== CHARACTER_SHEET_HEADINGS.length) {
        const unexpected = headings.filter(item => !CHARACTER_SHEET_HEADINGS.includes(item.name)).map(item => `# ${item.name}`);
        throw new Error(`Character sheet is invalid: unexpected top-level heading${unexpected.length === 1 ? '' : 's'} ${unexpected.join(', ')}.`);
    }

    for (let index = 0; index < CHARACTER_SHEET_HEADINGS.length; index += 1) {
        if (headings[index]?.name !== CHARACTER_SHEET_HEADINGS[index]) {
            throw new Error(`Character sheet is invalid: required headings are out of order near # ${CHARACTER_SHEET_HEADINGS[index]}.`);
        }
    }

    const sections = new Map();
    for (let index = 0; index < headings.length; index += 1) {
        const start = headings[index].lineIndex + 1;
        const end = headings[index + 1]?.lineIndex ?? lines.length;
        const body = lines.slice(start, end).join('\n').trim();
        if (!body) throw new Error(`Character sheet is invalid: # ${headings[index].name} is empty.`);
        sections.set(headings[index].name, body);
    }
    return sections;
}

function validateLockedStats(statsSection, expectedStats = {}) {
    for (const stat of ['PHY', 'MND', 'CHA']) {
        const expected = Number(expectedStats?.[stat]);
        if (!Number.isFinite(expected)) {
            throw new Error(`Character sheet validation could not determine the locked ${stat} value.`);
        }
        const values = extractLabeledValues(statsSection, stat)
            .map(value => Number.parseInt(value, 10))
            .filter(Number.isFinite);
        if (values.length !== 1 || values[0] !== expected) {
            throw new Error(`Character sheet is invalid: # STATS must contain exactly one ${stat}: ${expected} entry.`);
        }
    }
}

function validateExpectedRace(basicInfoSection, expectedRace) {
    const raceValues = extractLabeledValues(basicInfoSection, 'RACE(?:\\s*\\/\\s*(?:SPECIES|ANCESTRY))?');
    if (raceValues.length !== 1 || !raceValueMatches(raceValues[0], expectedRace)) {
        throw new Error(`Character sheet is invalid: # BASIC INFO must use the selected race "${expectedRace}".`);
    }
}

function validateIsekaiPremise(text) {
    const hasEarth = /\bEarth(?:'s)?\b/i.test(text);
    const hasEndedEarthLife = /\b(?:died|death|dead|killed|slain|perished|fatal(?:ly)?|passed\s+away|lost\s+(?:(?:his|her|their|its|the)\s+)?life|final\s+moments?|last\s+moments?|life\s+(?:had\s+)?ended|life\s+was\s+ended)\b/i.test(text);
    const hasOtherWorldRebirth = /\b(?:reincarnat(?:e|ed|ion)|reborn|transmigrat(?:e|ed|ion)|another\s+world|an?\s+other\s+world|new\s+world)\b/i.test(text);
    if (!hasEarth || !hasEndedEarthLife || !hasOtherWorldRebirth) {
        throw new Error('Character sheet is invalid: an Isekai sheet must establish an ended Earth life and reincarnation or rebirth in another world.');
    }
}

function extractLabeledValues(sectionText, labelPattern) {
    const label = new RegExp(`^${labelPattern}\\s*:\\s*(.+?)\\s*$`, 'i');
    const tableLabel = new RegExp(`^\\|\\s*${labelPattern}\\s*\\|\\s*(.+?)\\s*\\|\\s*$`, 'i');
    const values = [];

    for (const rawLine of String(sectionText || '').split(/\r?\n/)) {
        const line = rawLine
            .replace(/[`*_]/g, '')
            .replace(/^\s*[-+]\s+/, '')
            .trim();
        const match = line.match(label) || line.match(tableLabel);
        if (match) values.push(match[1].replace(/\|\s*$/, '').trim());
    }
    return values;
}

function raceValueMatches(actual, expected) {
    const actualNormalized = normalizeWords(actual);
    const expectedNormalized = normalizeWords(expected);
    return Boolean(expectedNormalized)
        && (actualNormalized === expectedNormalized || actualNormalized.startsWith(`${expectedNormalized} `));
}

function normalizeWords(value) {
    return String(value || '')
        .normalize('NFKC')
        .toLocaleLowerCase()
        .replace(/[^\p{L}\p{N}]+/gu, ' ')
        .trim();
}
