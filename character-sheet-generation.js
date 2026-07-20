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
                description: 'Visible physical facts as concise label/detail entries. Do not include internal state or behavioral habits.',
                minItems: mode === 'new' ? 1 : 0,
                maxItems: 32,
                items: appearanceEntry,
            },
            naturalWeapons: stringArray('Concrete offensive body parts only. Use an empty array when none are explicit.', 8),
            abilities: {
                type: 'array',
                description: mode === 'new'
                    ? 'Exactly one activated, non-spell, protagonist-grade ability.'
                    : 'Explicit activated non-spell abilities preserved from the persona.',
                minItems: mode === 'new' ? 1 : 0,
                maxItems: mode === 'new' ? 1 : 24,
                items: namedEntry,
            },
            spells: {
                type: 'array',
                description: mode === 'new'
                    ? (needsStartingSpell ? 'Exactly one genre-native activated spell or equivalent.' : 'Must be empty because locked MND is below 7.')
                    : 'Explicit spells preserved from the persona, with no more than five entries.',
                minItems: needsStartingSpell ? 1 : 0,
                maxItems: mode === 'new' ? (needsStartingSpell ? 1 : 0) : 5,
                items: namedEntry,
            },
            inventory: stringArray('Carried or stowed possessions that are not worn, equipped, or currency.'),
            currency: stringArray('Money only. Use an empty array when none is explicit or appropriate.', 8),
            gear: stringArray('Worn, equipped, or immediately ready items only.'),
            characterAnchors: {
                ...stringArray('Fixed background facts, limits, hooks, body history, and secrecy facts without future decisions.'),
                minItems: mode === 'new' ? 1 : 0,
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

    const appearance = normalizeObjectArray(source.appearance, 'appearance', 32, entry => {
        assertExactKeys(entry, ['label', 'detail'], 'appearance entry');
        return {
            label: requireLabel(entry.label, 'appearance.label'),
            detail: requireText(entry.detail, 'appearance.detail'),
        };
    });
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

    const characterAnchors = normalizeStringArray(source.characterAnchors, 'characterAnchors', 48);
    if (mode === 'new' && characterAnchors.length === 0) {
        throw structureError('characterAnchors must contain at least one fixed character fact.');
    }

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
        naturalWeapons: normalizeStringArray(source.naturalWeapons, 'naturalWeapons', 8),
        abilities,
        spells,
        inventory: normalizeStringArray(source.inventory, 'inventory', 48),
        currency: normalizeStringArray(source.currency, 'currency', 8),
        gear: normalizeStringArray(source.gear, 'gear', 48),
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
