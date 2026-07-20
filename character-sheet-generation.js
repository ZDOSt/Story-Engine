export const CHARACTER_SHEET_TOOL_NAME = 'submit_character_sheet';

const ROOT_FIELDS = Object.freeze([
    'basicInfo',
    'appearance',
    'naturalWeapons',
    'abilities',
    'spells',
    'inventory',
    'currency',
    'gear',
    'characterAnchors',
]);

const BASIC_INFO_FIELDS = Object.freeze([
    'race',
    'userNonHuman',
    'gender',
    'age',
    'bloodline',
    'origin',
    'priorRoleOrTraining',
]);

const STRICT_TOOL_SOURCES = new Set(['openai', 'azure_openai', 'deepseek']);
const TOOL_FALLBACK_CLIENT_STATUSES = new Set([400, 404, 405, 415, 422]);
const NEVER_RETRY_TOOL_STATUSES = new Set([401, 403, 408, 409, 425, 429]);
const ISEKAI_PREMISE = 'The character died on Earth and was reincarnated in another world.';
const EXTRAORDINARY_ABILITY_CONTRACT = 'The ability must grant one qualitatively new capability that ordinary PHY/MND/CHA checks and ordinary actions cannot provide.';
const GROUNDED_ABILITY_CONTRACT = 'The ability may be a deliberately activated signature technique grounded in exceptional training, expertise, preparation, or genre-appropriate equipment. It must produce one distinctive, concrete effect in the scene; a broad skill label or numerical/stat improvement is not an ability.';
const APPEARANCE_MARK_PATTERNS = Object.freeze([
    /\bscars?\b|\bscarred\b/i,
    /\btattoos?\b|\btattooed\b/i,
    /\bbirthmarks?\b/i,
    /\b(?:burned|ritual)\s+brands?\b|\bbrand(?:ed|ing)?\s+(?:mark|scar|symbol)s?\b/i,
    /\bpermanent\s+marks?\b/i,
]);
const ANCHOR_STOP_WORDS = new Set([
    'about', 'after', 'again', 'also', 'and', 'another', 'are', 'before', 'being', 'can', 'character',
    'could', 'did', 'does', 'for', 'from', 'had', 'has', 'have', 'her', 'him', 'his', 'into', 'its',
    'just', 'more', 'not', 'other', 'our', 'she', 'that', 'the', 'their', 'them', 'there', 'these',
    'they', 'this', 'through', 'user', 'very', 'was', 'were', 'what', 'when', 'where', 'which',
    'while', 'who', 'with', 'would', 'you', 'your',
]);

function createPowerProfile(ability, spell, options = {}) {
    const grounded = options.grounded === true;
    return Object.freeze({
        ability,
        spell,
        grounded,
        abilityContract: grounded ? GROUNDED_ABILITY_CONTRACT : EXTRAORDINARY_ABILITY_CONTRACT,
    });
}

const FANTASY_ISEKAI_POWER_PROFILE = createPowerProfile(
    'Fantasy and Isekai use this same creative frame. The ability must be a simple, unmistakably supernatural fantasy power that is directly useful in play. Its name and description must use natural fantasy language, never scientific, clinical, technological, bureaucratic, pseudo-technical, or game-system framing.',
    'Fantasy and Isekai use this same creative frame. The spell must be unmistakably magical in both name and effect, directly useful in play, and described in natural fantasy language. Never use scientific, clinical, technological, bureaucratic, pseudo-technical, or game-system framing.',
);

const CHARACTER_POWER_PROFILES = Object.freeze({
    Fantasy: FANTASY_ISEKAI_POWER_PROFILE,
    Isekai: FANTASY_ISEKAI_POWER_PROFILE,
    'Sci-fi': createPowerProfile(
        'The ability must be a clear extraordinary capability native to science fiction. Its source, name, and effect must fit speculative science rather than fantasy or contemporary reality.',
        'Treat the spell entry as a directly activated science-fiction power or technique. Its name and effect must fit speculative science and must not use fantasy spell language unless established character canon requires it.',
    ),
    Modern: createPowerProfile(
        'The ability must be a distinctive, protagonist-grade contemporary technique or resource that is practical in play. Keep it plausible and specific rather than turning it into unexplained magic, a superpower, futuristic technology, or a generic area of competence.',
        'Treat the spell entry as a directly activated, genre-native signature technique with a practical contemporary effect. Keep it plausible unless established character canon makes supernatural effects part of the setting.',
        { grounded: true },
    ),
    'Slice of Life': createPowerProfile(
        'The ability must be a distinctive, protagonist-grade everyday, personal, social, or creative technique with a concrete use in play. Keep it grounded and specific rather than turning it into combat spectacle, unexplained supernatural power, or a generic area of competence.',
        'Treat the spell entry as a directly activated, genre-native signature technique with a concrete everyday effect. Keep it grounded unless established character canon requires the supernatural.',
        { grounded: true },
    ),
    'Urban Fantasy': createPowerProfile(
        'The ability must be a direct supernatural capability that belongs in a contemporary world shaped by hidden or public magic. Its name and effect must combine modern context with occult fantasy rather than generic technology.',
        'The spell must be unmistakably magical or occult while fitting a contemporary setting. Its name and direct effect must feel native to urban fantasy rather than medieval fantasy or science fiction.',
    ),
    Cyberpunk: createPowerProfile(
        'The ability must be a direct extraordinary capability native to cyberpunk technology and social reality. Its name and effect must avoid fantasy or generic superhero framing unless established character canon requires it.',
        'Treat the spell entry as a directly activated cyberpunk power or technique. Its name and effect must be technological and setting-native rather than magical unless established character canon requires magic.',
    ),
    'Post-Apocalyptic': createPowerProfile(
        'The ability must be a direct, practical extraordinary capability suited to survival after collapse. Its name and effect must fit the setting and available world logic rather than importing unrelated fantasy or pristine future technology.',
        'Treat the spell entry as a directly activated, setting-native power or technique with a concrete survival-relevant effect. Its expression must follow established post-apocalyptic world logic.',
    ),
    Horror: createPowerProfile(
        'The ability must be a direct extraordinary capability suited to horror play while remaining useful to the protagonist. Its name and effect must preserve the setting tone rather than becoming generic heroic spectacle.',
        'Treat the spell entry as a directly activated occult, paranormal, or setting-native effect. It must remain concrete, useful, and compatible with the established source of horror.',
    ),
    Supernatural: createPowerProfile(
        'The ability must be a direct paranormal capability whose name and effect clearly belong to the established supernatural world. Do not reduce it to ordinary skill or generic technical language.',
        'The spell must be an unmistakably supernatural or occult act with a direct effect. Its name and expression must follow the setting\'s paranormal logic.',
    ),
    Superhero: createPowerProfile(
        'The ability must be a direct, distinctive protagonist superpower that is practical in play. Its name and effect must fit superhero fiction rather than ordinary expertise or game-system terminology.',
        'Treat the spell entry as a directly activated secondary superpower or power technique. Its name and effect must fit the character and superhero setting, whether or not its fictional source is literal magic.',
    ),
    Steampunk: createPowerProfile(
        'The ability must be a direct extraordinary capability native to steampunk invention and industrial fantasy. Its name and effect must fit the setting rather than modern digital technology or generic spellcraft.',
        'Treat the spell entry as a directly activated steampunk power or technique. Its name and effect must follow the setting\'s mechanical, industrial, or fantastical logic.',
    ),
    Historical: createPowerProfile(
        'The ability must be a distinctive, protagonist-grade period technique or resource with a concrete use in play. Keep it plausible and specific rather than turning it into anachronistic technology, unexplained supernatural power, or a generic area of competence.',
        'Treat the spell entry as a directly activated, genre-native signature technique with a concrete period-appropriate effect. Keep it plausible unless established character canon requires the supernatural.',
        { grounded: true },
    ),
    'Wuxia / Xianxia': createPowerProfile(
        'The ability must be a direct extraordinary capability native to martial cultivation fiction. Its name and effect must follow that tradition rather than western spellcraft, modern technology, or game-system language.',
        'The spell must be a directly activated mystical technique whose name and effect feel native to martial cultivation fiction. Keep it concrete and avoid western spell or technical framing.',
    ),
});

export function getCharacterSheetPowerProfile(genre) {
    const normalized = String(genre || '').trim();
    return CHARACTER_POWER_PROFILES[normalized] || FANTASY_ISEKAI_POWER_PROFILE;
}

export class CharacterSheetStructureError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'CharacterSheetStructureError';
        this.stage = details.stage || 'validation';
    }
}

export function shouldRetryCharacterSheetToolFailure(error) {
    if (error instanceof CharacterSheetStructureError || error?.name === 'CharacterSheetStructureError') return true;
    if (String(error?.stage || '').trim().toLowerCase() !== 'response') return false;

    const status = Number(error?.status);
    if (Number.isFinite(status) && NEVER_RETRY_TOOL_STATUSES.has(status)) return false;

    const detail = `${String(error?.message || '')} ${String(error?.body || '')}`.toLowerCase();
    const identifiesToolFeature = /\b(?:tools?|tool[_ -]?choice|function(?:[_ -]?call(?:ing)?)?)\b/.test(detail);
    const explicitlyUnsupported = /\b(?:unsupported|not supported|does not support|not allowed|unavailable|disabled)\b/.test(detail);
    if (identifiesToolFeature && explicitlyUnsupported) return true;
    if (Number.isFinite(status) && !TOOL_FALLBACK_CLIENT_STATUSES.has(status)) return false;

    const identifiesInvalidFeature = /\b(?:unknown|unrecognized|invalid)\b/.test(detail);
    return identifiesToolFeature && identifiesInvalidFeature;
}

export function buildCharacterSheetSchema(options = {}) {
    const mode = normalizeMode(options.mode);
    const stats = normalizeStats(options.stats);
    const fixedRace = cleanInline(options.fixedRace);
    const fixedUserNonHuman = normalizeFixedUserNonHuman(options.fixedUserNonHuman, mode);
    const needsStartingSpell = mode === 'new' && stats.MND >= 7;
    const explicitAnchorSource = cleanSourceText(options.explicitAnchorSource);
    const explicitAppearanceSource = cleanSourceText(options.explicitAppearanceSource);
    const allowNewCharacterAnchors = mode === 'new' && Boolean(explicitAnchorSource);
    const allowNewAppearanceMarks = APPEARANCE_MARK_PATTERNS.some(pattern => pattern.test(explicitAppearanceSource));
    const powerProfile = getCharacterSheetPowerProfile(options.genre);
    const stringArray = (description, maxItems = 48) => ({
        type: 'array',
        description,
        maxItems,
        items: { type: 'string' },
    });
    const namedEntry = {
        type: 'object',
        additionalProperties: false,
        required: ['name', 'description'],
        properties: {
            name: { type: 'string' },
            description: { type: 'string' },
        },
    };
    const appearanceEntry = {
        type: 'object',
        additionalProperties: false,
        required: ['label', 'detail'],
        properties: {
            label: { type: 'string' },
            detail: { type: 'string' },
        },
    };
    const raceSchema = fixedRace
        ? { type: 'string', enum: [fixedRace], description: 'The locked selected race or ancestry.' }
        : { type: 'string', description: mode === 'new' ? 'The chosen playable race or ancestry.' : 'The explicit persona race, or Not specified.' };

    return {
        type: 'object',
        additionalProperties: false,
        required: [...ROOT_FIELDS],
        properties: {
            basicInfo: {
                type: 'object',
                additionalProperties: false,
                required: [...BASIC_INFO_FIELDS],
                properties: {
                    race: raceSchema,
                    userNonHuman: {
                        type: 'string',
                        enum: fixedUserNonHuman
                            ? [fixedUserNonHuman]
                            : mode === 'new' ? ['Y', 'N'] : ['Y', 'N', 'Not specified'],
                        description: mode === 'new'
                            ? 'Y when the player character is nonhuman; otherwise N. A new character must never use Not specified.'
                            : 'The explicit persona classification, or Not specified.',
                    },
                    gender: { type: 'string' },
                    age: mode === 'new'
                        ? { type: 'integer', minimum: 1 }
                        : { type: 'string', description: 'The explicit age as written, or Not specified.' },
                    bloodline: { type: 'string', description: 'A relevant explicit bloodline, or an empty string.' },
                    origin: { type: 'string', description: 'A fixed origin fact, or an empty string.' },
                    priorRoleOrTraining: { type: 'string', description: 'A fixed prior role or training fact, or an empty string.' },
                },
            },
            appearance: {
                type: 'array',
                description: mode === 'new'
                    ? `Visible physical facts as concise label/detail entries. Do not include internal state or behavioral habits. ${allowNewAppearanceMarks ? 'Preserve only scars or other permanent marks explicitly supplied by the user.' : 'Do not include scars, tattoos, birthmarks, brands, or other permanent marks.'}`
                    : 'Explicit visible physical facts as concise label/detail entries. Do not include internal state or behavioral habits.',
                minItems: mode === 'new' ? 1 : 0,
                maxItems: 32,
                items: appearanceEntry,
            },
            naturalWeapons: stringArray('Concrete offensive body parts only. Use an empty array when none are explicit.', 8),
            abilities: {
                type: 'array',
                description: mode === 'new'
                    ? `Exactly one simple, activated protagonist ability. ${powerProfile.abilityContract} ${powerProfile.ability}`
                    : 'Explicit activated non-spell abilities preserved from the persona.',
                minItems: mode === 'new' ? 1 : 0,
                maxItems: mode === 'new' ? 1 : 24,
                items: namedEntry,
            },
            spells: {
                type: 'array',
                description: mode === 'new'
                    ? (needsStartingSpell ? `Exactly one directly activated spell entry with one concrete effect. ${powerProfile.spell}` : 'Must be empty because locked MND is below 7.')
                    : 'Explicit spells preserved from the persona, with no more than five entries.',
                minItems: needsStartingSpell ? 1 : 0,
                maxItems: mode === 'new' ? (needsStartingSpell ? 1 : 0) : 5,
                items: namedEntry,
            },
            inventory: stringArray('Carried or stowed possessions that are not worn, equipped, or currency.'),
            currency: stringArray('Money only. Use an empty array when none is explicit or appropriate.', 8),
            gear: stringArray('Worn, equipped, or immediately ready items only.'),
            characterAnchors: {
                ...stringArray(
                    mode === 'new'
                        ? (allowNewCharacterAnchors
                            ? 'Only explicit user-provided durable facts that cannot fit another character-sheet field. Do not invent anchors or repeat other sections. Use an empty array when none are required.'
                            : 'Must be empty because the user supplied no custom facts that require a character anchor.')
                        : 'Only explicit durable persona facts that cannot fit another character-sheet field. Do not repeat other sections.',
                    mode === 'new' ? (allowNewCharacterAnchors ? 3 : 0) : 48,
                ),
                minItems: 0,
            },
        },
    };
}

export function buildCharacterSheetTool(chatCompletionSource, options = {}) {
    const source = String(chatCompletionSource || '').trim().toLowerCase();
    const strict = STRICT_TOOL_SOURCES.has(source);
    const parameters = buildCharacterSheetSchema(options);
    if (source === 'deepseek') removeDeepSeekUnsupportedSchemaKeywords(parameters);
    if (!strict) removeStrictOnlySchemaKeywords(parameters);

    const tool = {
        type: 'function',
        function: {
            name: CHARACTER_SHEET_TOOL_NAME,
            description: 'Submit the complete structured character-sheet data. Do not return prose or Markdown outside this tool call.',
            parameters,
        },
    };
    if (strict) tool.function.strict = true;
    return tool;
}

export function buildCharacterSheetToolChoice(chatCompletionSource) {
    const source = String(chatCompletionSource || '').trim().toLowerCase();
    if (source === 'deepseek') return undefined;
    if (source === 'claude') return 'any';
    return {
        type: 'function',
        function: { name: CHARACTER_SHEET_TOOL_NAME },
    };
}

export function buildCharacterSheetJsonSchema(options = {}) {
    return {
        name: CHARACTER_SHEET_TOOL_NAME,
        description: 'Complete structured character-sheet data. Return one JSON object and no Markdown.',
        strict: true,
        value: buildCharacterSheetSchema(options),
    };
}

export function appendCharacterSheetOutputInstruction(prompt, outputMode = 'tool', schema = null) {
    const messages = (Array.isArray(prompt) ? prompt : [{ role: 'user', content: String(prompt || '') }])
        .map(message => ({ ...message }));
    const instruction = outputMode === 'json'
        ? [
            'Return exactly one JSON object matching the character-sheet schema below. Return no Markdown, commentary, code fence, or additional text.',
            schema ? `CHARACTER-SHEET JSON SCHEMA:\n${JSON.stringify(schema)}` : '',
        ].filter(Boolean).join('\n\n')
        : `Call ${CHARACTER_SHEET_TOOL_NAME} exactly once with the complete character-sheet data. Do not answer with Markdown, commentary, or ordinary assistant text.`;
    messages.push({ role: 'user', content: instruction });
    return messages;
}

export function extractCharacterSheetToolPayload(raw) {
    const calls = collectToolCalls(raw);
    const matching = calls.find(call => getToolCallName(call) === CHARACTER_SHEET_TOOL_NAME);
    if (!matching) {
        throw new CharacterSheetStructureError(
            `Structured character-sheet response did not call ${CHARACTER_SHEET_TOOL_NAME}. ${describeCharacterSheetRaw(raw)}`,
            { stage: 'tool-call' },
        );
    }
    return parseCharacterSheetPayload(getToolCallArguments(matching), 'tool arguments');
}

export function parseCharacterSheetJsonPayload(raw) {
    return parseCharacterSheetPayload(raw, 'JSON-schema response');
}

export function normalizeCharacterSheetPayload(payload, options = {}) {
    const mode = normalizeMode(options.mode);
    const stats = normalizeStats(options.stats);
    const fixedRace = cleanInline(options.fixedRace);
    const fixedUserNonHuman = normalizeFixedUserNonHuman(options.fixedUserNonHuman, mode);
    const explicitAnchorSource = cleanSourceText(options.explicitAnchorSource);
    const explicitAppearanceSource = cleanSourceText(options.explicitAppearanceSource);
    const allowNewCharacterAnchors = mode === 'new' && Boolean(explicitAnchorSource);
    const source = parseCharacterSheetPayload(payload, 'character-sheet payload');
    assertExactKeys(source, ROOT_FIELDS, 'character-sheet payload');

    const basicSource = assertObject(source.basicInfo, 'basicInfo');
    assertExactKeys(basicSource, BASIC_INFO_FIELDS, 'basicInfo');
    const raceFromModel = requireText(basicSource.race, 'basicInfo.race');
    const race = fixedRace || raceFromModel;
    if (mode === 'new' && /^not specified$/i.test(race)) {
        throw structureError('basicInfo.race must contain a playable race for a new character.');
    }

    let userNonHuman = requireEnum(
        basicSource.userNonHuman,
        mode === 'new' ? ['Y', 'N'] : ['Y', 'N', 'Not specified'],
        'basicInfo.userNonHuman',
    );
    if (fixedUserNonHuman) userNonHuman = fixedUserNonHuman;

    const age = mode === 'new'
        ? requireInteger(basicSource.age, 'basicInfo.age')
        : optionalText(basicSource.age) || 'Not specified';
    if (mode === 'new' && age < 1) throw structureError('basicInfo.age must be a positive integer.');

    const submittedAppearance = normalizeObjectArray(source.appearance, 'appearance', 32, entry => {
        assertExactKeys(entry, ['label', 'detail'], 'appearance entry');
        return {
            label: requireLabel(entry.label, 'appearance.label'),
            detail: requireText(entry.detail, 'appearance.detail'),
        };
    });
    const appearance = mode === 'new'
        ? submittedAppearance.filter(entry => appearanceMarksAreExplicit(`${entry.label} ${entry.detail}`, explicitAppearanceSource))
        : submittedAppearance;
    if (mode === 'new' && appearance.length === 0) {
        throw structureError('appearance must contain at least one visible fact for a new character.');
    }

    const abilities = normalizeObjectArray(source.abilities, 'abilities', mode === 'new' ? 1 : 24, normalizeNamedEntry);
    if (mode === 'new' && abilities.length !== 1) {
        throw structureError('abilities must contain exactly one entry for a new character.');
    }

    const spells = normalizeObjectArray(source.spells, 'spells', mode === 'new' ? 1 : 5, normalizeNamedEntry);
    if (mode === 'new') {
        const requiredCount = stats.MND >= 7 ? 1 : 0;
        if (spells.length !== requiredCount) {
            throw structureError(`spells must contain exactly ${requiredCount} entries for locked MND ${stats.MND}.`);
        }
    }

    const naturalWeapons = normalizeStringArray(source.naturalWeapons, 'naturalWeapons', 8);
    const inventory = normalizeStringArray(source.inventory, 'inventory', 48);
    const currency = normalizeStringArray(source.currency, 'currency', 8);
    const gear = normalizeStringArray(source.gear, 'gear', 48);
    const submittedAnchors = normalizeStringArray(source.characterAnchors, 'characterAnchors', mode === 'new' && allowNewCharacterAnchors ? 3 : 48);
    const representedFacts = [
        race,
        userNonHuman,
        optionalText(basicSource.gender),
        String(age),
        optionalText(basicSource.bloodline),
        optionalText(basicSource.origin),
        optionalText(basicSource.priorRoleOrTraining),
        ...appearance.flatMap(entry => [entry.label, entry.detail]),
        ...naturalWeapons,
        ...abilities.flatMap(entry => [entry.name, entry.description]),
        ...spells.flatMap(entry => [entry.name, entry.description]),
        ...inventory,
        ...currency,
        ...gear,
    ].filter(Boolean);
    const characterAnchors = mode === 'new'
        ? filterNewCharacterAnchors(submittedAnchors, explicitAnchorSource, representedFacts)
        : submittedAnchors;

    return {
        basicInfo: {
            race,
            userNonHuman,
            gender: optionalText(basicSource.gender) || 'Not specified',
            age,
            bloodline: optionalText(basicSource.bloodline),
            origin: optionalText(basicSource.origin),
            priorRoleOrTraining: optionalText(basicSource.priorRoleOrTraining),
        },
        appearance,
        naturalWeapons,
        abilities,
        spells,
        inventory,
        currency,
        gear,
        characterAnchors,
    };
}

export function renderCharacterSheet(payload, options = {}) {
    const mode = normalizeMode(options.mode);
    const stats = normalizeStats(options.stats);
    const normalized = normalizeCharacterSheetPayload(payload, { ...options, mode, stats });
    const basic = normalized.basicInfo;
    const basicLines = [
        '**Name:** {{user}}',
        `**Race:** ${basic.race}`,
        `**UserNonHuman:** ${basic.userNonHuman}`,
        `**Gender:** ${basic.gender}`,
        `**Age:** ${basic.age}`,
    ];
    if (basic.bloodline) basicLines.push(`**Bloodline:** ${basic.bloodline}`);
    if (basic.origin) basicLines.push(`**Origin:** ${basic.origin}`);
    if (basic.priorRoleOrTraining) basicLines.push(`**Prior Role / Training:** ${basic.priorRoleOrTraining}`);

    const anchors = [...normalized.characterAnchors];
    if (mode === 'new' && String(options.genre || '').trim().toLowerCase() === 'isekai') {
        const canonicalIndex = anchors.findIndex(anchor => anchor.toLowerCase() === ISEKAI_PREMISE.toLowerCase());
        if (canonicalIndex >= 0) anchors.splice(canonicalIndex, 1);
        anchors.unshift(ISEKAI_PREMISE);
    }

    const sections = [
        ['BASIC INFO', basicLines.join('\n')],
        ['APPEARANCE', normalized.appearance.length
            ? normalized.appearance.map(entry => `**${entry.label}:** ${entry.detail}`).join('\n')
            : '**Details:** Not specified'],
        ['STATS', `**PHY:** ${stats.PHY}\n**MND:** ${stats.MND}\n**CHA:** ${stats.CHA}`],
        ['NATURAL WEAPONS', renderBulletList(normalized.naturalWeapons, 'None')],
        ['ABILITIES', renderNamedEntries(normalized.abilities, mode === 'new' ? 'None' : 'Not specified')],
        ['SPELLS', renderNamedEntries(normalized.spells, 'None')],
        ['INVENTORY', renderBulletList(normalized.inventory, mode === 'new' ? 'None' : 'Not specified')],
        ['CURRENCY', renderBulletList(normalized.currency, 'None')],
        ['GEAR', renderBulletList(normalized.gear, mode === 'new' ? 'None' : 'Not specified')],
        ['CHARACTER ANCHORS', renderBulletList(anchors, mode === 'new' ? 'None' : 'Not specified')],
    ];
    return sections.map(([heading, body]) => `# ${heading}\n${body}`).join('\n\n');
}

export function describeCharacterSheetRaw(raw) {
    if (raw == null) return 'ResponseShape=null.';
    if (typeof raw === 'string') return `ResponseShape=string(${raw.length} chars).`;
    if (Array.isArray(raw)) return `ResponseShape=array(${raw.length} items).`;
    if (typeof raw !== 'object') return `ResponseShape=${typeof raw}.`;
    const calls = collectToolCalls(raw);
    const names = calls.map(getToolCallName).filter(Boolean);
    const choices = Array.isArray(raw.choices) ? raw.choices.length : 0;
    return `ResponseShape=object; choices=${choices}; toolCalls=${calls.length}; toolNames=${names.length ? names.join(',') : 'none'}.`;
}

function normalizeMode(value) {
    return value === 'existing' ? 'existing' : 'new';
}

function normalizeFixedUserNonHuman(value, mode) {
    if (mode !== 'new') return '';
    const normalized = String(value || '').trim().toUpperCase();
    return normalized === 'Y' || normalized === 'N' ? normalized : '';
}

function normalizeStats(stats = {}) {
    return {
        PHY: normalizeStat(stats.PHY),
        MND: normalizeStat(stats.MND),
        CHA: normalizeStat(stats.CHA),
    };
}

function normalizeStat(value) {
    const number = Number(value);
    return Number.isFinite(number) ? Math.max(1, Math.round(number)) : 1;
}

function parseCharacterSheetPayload(value, label) {
    if (value && typeof value === 'object' && !Array.isArray(value)) return value;
    if (typeof value !== 'string') {
        throw new CharacterSheetStructureError(`${label} was not a JSON object.`, { stage: 'parse' });
    }
    const text = value.trim();
    if (!text) throw new CharacterSheetStructureError(`${label} was empty.`, { stage: 'parse' });
    try {
        const parsed = JSON.parse(text);
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
            throw new Error('root value is not an object');
        }
        return parsed;
    } catch (error) {
        throw new CharacterSheetStructureError(`${label} was not valid object JSON (${error instanceof Error ? error.message : String(error)}).`, { stage: 'parse' });
    }
}

function normalizeNamedEntry(entry) {
    assertExactKeys(entry, ['name', 'description'], 'named entry');
    return {
        name: requireLabel(entry.name, 'entry.name'),
        description: requireText(entry.description, 'entry.description'),
    };
}

function normalizeObjectArray(value, path, maxItems, normalizer) {
    if (!Array.isArray(value)) throw structureError(`${path} must be an array.`);
    if (value.length > maxItems) throw structureError(`${path} may contain at most ${maxItems} entries.`);
    return value.map((entry, index) => normalizer(assertObject(entry, `${path}[${index}]`)));
}

function normalizeStringArray(value, path, maxItems) {
    if (!Array.isArray(value)) throw structureError(`${path} must be an array.`);
    if (value.length > maxItems) throw structureError(`${path} may contain at most ${maxItems} entries.`);
    const seen = new Set();
    const normalized = [];
    for (let index = 0; index < value.length; index += 1) {
        const item = requireText(value[index], `${path}[${index}]`);
        const key = item.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        normalized.push(item);
    }
    return normalized;
}

function assertObject(value, path) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw structureError(`${path} must be an object.`);
    }
    return value;
}

function assertExactKeys(value, expectedKeys, path) {
    const expected = new Set(expectedKeys);
    const actual = Object.keys(value);
    const missing = expectedKeys.filter(key => !Object.prototype.hasOwnProperty.call(value, key));
    const extra = actual.filter(key => !expected.has(key));
    if (missing.length || extra.length) {
        throw structureError(`${path} keys did not match the contract. Missing=${missing.join(',') || 'none'}; Extra=${extra.join(',') || 'none'}.`);
    }
}

function requireText(value, path) {
    if (typeof value !== 'string') throw structureError(`${path} must be a string.`);
    const text = cleanInline(value);
    if (!text) throw structureError(`${path} must not be empty.`);
    return text;
}

function optionalText(value) {
    if (typeof value !== 'string') throw structureError('Optional character-sheet text fields must be strings.');
    return cleanInline(value);
}

function requireLabel(value, path) {
    const text = requireText(value, path)
        .replace(/[\r\n*_`#:[\]]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text) throw structureError(`${path} must contain a usable label.`);
    return text;
}

function requireEnum(value, choices, path) {
    const text = requireText(value, path);
    if (!choices.includes(text)) throw structureError(`${path} must be one of: ${choices.join(', ')}.`);
    return text;
}

function requireInteger(value, path) {
    if (!Number.isInteger(value)) throw structureError(`${path} must be an integer.`);
    return value;
}

function cleanInline(value) {
    return String(value ?? '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/\r?\n+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function cleanSourceText(value) {
    return String(value ?? '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

function appearanceMarksAreExplicit(appearanceText, explicitSource) {
    for (const pattern of APPEARANCE_MARK_PATTERNS) {
        if (pattern.test(appearanceText) && !pattern.test(explicitSource)) return false;
    }
    return true;
}

function filterNewCharacterAnchors(anchors, explicitSource, representedFacts) {
    if (!explicitSource) return [];
    return anchors.filter(anchor => {
        if (!anchorIsGroundedInSource(anchor, explicitSource)) return false;
        return !representedFacts.some(fact => factsMateriallyOverlap(anchor, fact));
    });
}

function anchorIsGroundedInSource(anchor, source) {
    const anchorTokens = factTokens(anchor);
    if (!anchorTokens.length) return false;
    const sourceTokens = new Set(factTokens(source));
    const overlap = anchorTokens.filter(token => sourceTokens.has(token)).length;
    const required = anchorTokens.length <= 2 ? anchorTokens.length : anchorTokens.length <= 6 ? 2 : 3;
    return overlap >= required;
}

function factsMateriallyOverlap(left, right) {
    const leftTokens = factTokens(left);
    const rightTokens = factTokens(right);
    if (!leftTokens.length || !rightTokens.length) return false;
    const rightSet = new Set(rightTokens);
    const overlap = leftTokens.filter(token => rightSet.has(token)).length;
    const shorterLength = Math.min(leftTokens.length, rightTokens.length);
    const required = shorterLength === 1 ? 1 : Math.ceil(shorterLength * 0.6);
    return overlap >= required;
}

function factTokens(value) {
    const tokens = String(value || '').toLowerCase().match(/[a-z0-9]+/g) || [];
    return [...new Set(tokens.filter(token => token.length >= 3 && !ANCHOR_STOP_WORDS.has(token)))];
}

function renderBulletList(items, fallback) {
    const values = items.length ? items : [fallback];
    return values.map(item => `- ${item}`).join('\n');
}

function renderNamedEntries(items, fallback) {
    if (!items.length) return `- ${fallback}`;
    return items.map(item => `- **${item.name}:** ${item.description}`).join('\n');
}

function removeStrictOnlySchemaKeywords(schema) {
    if (!schema || typeof schema !== 'object') return;
    delete schema.additionalProperties;
    if (schema.properties && typeof schema.properties === 'object') {
        Object.values(schema.properties).forEach(removeStrictOnlySchemaKeywords);
    }
    if (schema.items) removeStrictOnlySchemaKeywords(schema.items);
}

function removeDeepSeekUnsupportedSchemaKeywords(schema) {
    if (!schema || typeof schema !== 'object') return;
    delete schema.minItems;
    delete schema.maxItems;
    if (schema.properties && typeof schema.properties === 'object') {
        Object.values(schema.properties).forEach(removeDeepSeekUnsupportedSchemaKeywords);
    }
    if (schema.items) removeDeepSeekUnsupportedSchemaKeywords(schema.items);
}

function collectToolCalls(raw) {
    const calls = [];
    for (const choice of raw?.choices || []) {
        if (Array.isArray(choice?.message?.tool_calls)) calls.push(...choice.message.tool_calls);
        if (choice?.message?.function_call) calls.push(choice.message.function_call);
        if (Array.isArray(choice?.delta?.tool_calls)) calls.push(...choice.delta.tool_calls);
    }
    if (Array.isArray(raw?.content)) {
        calls.push(...raw.content.filter(item => item?.type === 'tool_use' || item?.type === 'function_call'));
    }
    if (Array.isArray(raw?.message?.tool_calls)) {
        calls.push(...raw.message.tool_calls);
    } else if (raw?.message?.tool_calls && typeof raw.message.tool_calls === 'object') {
        calls.push(raw.message.tool_calls);
    }
    const geminiParts = raw?.candidates?.[0]?.content?.parts;
    if (Array.isArray(geminiParts)) calls.push(...geminiParts.filter(part => part?.functionCall));
    const responseParts = raw?.responseContent?.parts;
    if (Array.isArray(responseParts)) {
        calls.push(...responseParts.filter(part => part?.functionCall).map(part => part.functionCall));
    }
    if (Array.isArray(raw)) {
        for (const item of raw) calls.push(...collectToolCalls(item));
    }
    return calls;
}

function getToolCallName(call) {
    return call?.function?.name
        || call?.name
        || call?.functionCall?.name
        || call?.tool_name
        || '';
}

function getToolCallArguments(call) {
    return call?.function?.arguments
        ?? call?.arguments
        ?? call?.input
        ?? call?.functionCall?.args
        ?? call?.parameters
        ?? call?.args;
}

function structureError(message) {
    return new CharacterSheetStructureError(message, { stage: 'validation' });
}
