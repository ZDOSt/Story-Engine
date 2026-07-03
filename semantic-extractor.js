import { ENGINE_PROMPT_TEXT, normalizeSocialResolutionMemory } from './engines.js';
import { PERSONALITY_ARCHETYPE_GLOSSARY, TRACKER_DELTA_CONTRACT, TRACKER_DELTA_END, TRACKER_DELTA_START, TRACKER_DELTA_TEMPLATE, TRACKER_DELTA_WRAPPER_END, TRACKER_DELTA_WRAPPER_START, USER_KNOWLEDGE_CONFIDENCE, USER_KNOWLEDGE_SCOPES, USER_KNOWLEDGE_TRUTH, USER_REPUTATION_VALENCES } from './tracker-delta-contract.js';
import { getChatCompletionSourceForProfile, sendChatCompletionProfileRequest, sendDefaultChatCompletionToolRequest } from './st-adapter.js';

export const SEMANTIC_PREFLIGHT_STOP_SENTINEL = 'SEMANTIC_PREFLIGHT_COMPLETE';
export { TRACKER_DELTA_CONTRACT, TRACKER_DELTA_END, TRACKER_DELTA_START, TRACKER_DELTA_TEMPLATE, TRACKER_DELTA_WRAPPER_END, TRACKER_DELTA_WRAPPER_START, USER_KNOWLEDGE_CONFIDENCE, USER_KNOWLEDGE_SCOPES, USER_KNOWLEDGE_TRUTH, USER_REPUTATION_VALENCES };

const SEMANTIC_RESPONSE_LENGTH_MIN = 4096;
const SEMANTIC_RESPONSE_LENGTH_MAX = 16384;
const SEMANTIC_RESPONSE_LENGTH_PER_TRACKED_NPC = 768;
const SEMANTIC_RESPONSE_LENGTH_PER_INFERRED_SCENE_NPC = 768;
const SEMANTIC_TOOL_NAME = 'submit_semantic_preflight';
const TRACKER_CONDITIONS = Object.freeze(['unchanged', 'healthy', 'bruised', 'wounded', 'badly_wounded', 'critical', 'incapacitated', 'dead']);
const TRACKER_NPC_DELTA_FIELDS = Object.freeze(['woundsAdd', 'woundsRemove', 'statusAdd', 'statusRemove', 'gearAdd', 'gearRemove']);
const TRACKER_USER_DELTA_FIELDS = Object.freeze([...TRACKER_NPC_DELTA_FIELDS, 'inventoryAdd', 'inventoryRemove', 'tasksAdd', 'tasksRemove', 'commitmentsAdd', 'commitmentsRemove']);
const POWER_ACTOR_EFFECT_TYPES = Object.freeze(['none', 'thwart', 'expose', 'harm_assets', 'steal', 'humiliate', 'help_enemy', 'disrupt_operation', 'kill_or_capture_people', 'damage_reputation_or_income']);
const POWER_ACTOR_SEVERITIES = Object.freeze(['none', 'minor', 'meaningful', 'major']);
const POWER_ACTOR_ASSESSMENT_SCOPES = Object.freeze(['individual', 'organization', 'institution', 'group', 'unknown']);
const POWER_EVENT_TYPES = Object.freeze(['none', 'minor_obstruction', 'warning', 'ambush', 'frame_user', 'plant_contact', 'agent_mislead', 'agent_report', 'agent_sabotage']);
const POWER_EVENT_FITS = Object.freeze(['none', 'use_now', 'defer', 'drop']);
const POWER_EVENT_CONTACT_GENDERS = Object.freeze(['none', 'male', 'female', 'unknown']);
const CLAIM_TRUTH_STATUSES = Object.freeze(['none', 'known_true', 'known_false', 'unsupported', 'unknown']);
const CLAIM_NPC_ACCESS_LEVELS = Object.freeze(['none', 'direct', 'partial', 'unknown']);
const ITEM_USE_SOURCES = Object.freeze(['none', 'gear', 'inventory', 'unavailable']);
const USER_KNOWLEDGE_TYPES = Object.freeze(['personalKnowledge', 'reputationKnowledge']);
const USER_KNOWLEDGE_APPLICATION_EFFECTS = Object.freeze(['none', 'priorUserGoodRep', 'userBadRep', 'userNonHuman', 'contextOnly']);
const ENVIRONMENT_DIFFICULTY_TIERS = Object.freeze(['none', 'easy', 'average', 'hard', 'extreme']);
const ACTION_BUCKETS = Object.freeze(['None', 'Social', 'Combat', 'Challenge']);
const SOCIAL_BUCKETS = Object.freeze(['None', 'Diplomacy', 'Bluff', 'Intimidate']);
const COMBAT_TYPES = Object.freeze(['None', 'Mundane', 'SpellOrSupernatural']);
const SEMANTIC_NARRATOR_ONLY_FUNCTION_BLOCKS = Object.freeze([
    'RenderControlEngine',
    'sceneStyleProfile',
    'finalResponseElements',
    'fanService',
    'adultContent',
]);

export async function extractSemanticLedger(context, promptContext, type, trackerSnapshot, options = {}) {
    if (!context?.generateRawData && !options?.semanticProfileId && options?.preferToolCall === false) {
        throw new Error('SillyTavern generateRawData API is unavailable.');
    }

    const playerTrackerSnapshot = options?.playerTrackerSnapshot || {};
    const prompt = options?.assembledPrompt
        ? buildSemanticPromptFromAssembledChat(context, promptContext, type, trackerSnapshot, playerTrackerSnapshot, options)
        : buildSemanticPrompt(context, promptContext, type, trackerSnapshot, playerTrackerSnapshot, options);
    const responseLength = Number.isFinite(options?.responseLength) && options.responseLength > 0
        ? options.responseLength
        : estimateSemanticResponseLength(trackerSnapshot, promptContext, options);

    let raw;
    let ledger;
    let extractionMeta;
    if (options?.preferToolCall !== false) {
        try {
            const toolResult = options?.semanticProfileId
                ? await generateSemanticToolCallWithProfile(context, prompt, responseLength, options)
                : await generateSemanticToolCall(context, prompt, responseLength, options);
            raw = toolResult.raw;
            ledger = parseSemanticLedger(toolResult.ledger, trackerSnapshot);
            validateRawLedgerContract(ledger, raw);
            extractionMeta = {
                source: options?.semanticProfileId
                    ? `SillyTavern direct connection profile forced function tool + local validation (${options.semanticProfileName || options.semanticProfileId})`
                    : 'SillyTavern direct backend forced function tool + local validation',
            schema: 'submit_semantic_preflight_tool_v1',
            strict: true,
            responseLength,
            toolName: SEMANTIC_TOOL_NAME,
            semanticProfile: options?.semanticProfileName || undefined,
        };
        } catch (error) {
            if (!isRecoverableSemanticToolCallError(error)) {
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(`Semantic tool-call pass returned no valid ledger. Generation aborted before narration. ${message}`);
            }

            if (!context?.generateRawData && !options?.semanticProfileId) {
                const message = error instanceof Error ? error.message : String(error);
                throw new Error(`Semantic tool-call transport failed and generateRawData fallback is unavailable. Generation aborted before narration. ${message}`);
            }

            console.warn('[Structured Preflight Engines] semantic tool-call failed; falling back to compact ledger.', error);
            raw = options?.semanticProfileId
                ? await generateSemanticRawWithProfile(prompt, responseLength, options)
                : await generateSemanticRaw(context, prompt, responseLength);
            extractionMeta = {
                source: options?.semanticProfileId
                    ? `SillyTavern direct connection profile compact preflight ledger fallback + local validation (${options.semanticProfileName || options.semanticProfileId})`
                    : 'SillyTavern generateRawData compact preflight ledger fallback + local validation',
                schema: 'compact_engine_name_anchored_preflight_ledger_v1',
                strict: true,
                responseLength,
                semanticProfile: options?.semanticProfileName || undefined,
                fallbackFrom: 'submit_semantic_preflight_tool_v1',
                fallbackReason: error instanceof Error ? error.message : String(error),
            };
        }
    } else {
        raw = options?.semanticProfileId
            ? await generateSemanticRawWithProfile(prompt, responseLength, options)
            : await generateSemanticRaw(context, prompt, responseLength);
        extractionMeta = {
            source: options?.semanticProfileId
                ? `SillyTavern direct connection profile compact preflight ledger + local validation (${options.semanticProfileName || options.semanticProfileId})`
                : 'SillyTavern generateRawData compact preflight ledger + local validation',
            schema: 'compact_engine_name_anchored_preflight_ledger_v1',
            strict: true,
            responseLength,
            semanticProfile: options?.semanticProfileName || undefined,
        };
    }

    if (!ledger) {
        try {
            ledger = parseSemanticLedger(raw, trackerSnapshot);
            validateRawLedgerContract(ledger, raw);
        } catch (error) {
            const message = error instanceof Error ? error.message : String(error);
            throw new Error(`Semantic pass returned no valid ledger. Generation aborted before narration. ${message}`);
        }
    }

    if (!ledger || typeof ledger !== 'object') {
        throw new Error(`Semantic pass returned an invalid ledger object: ${String(raw).slice(0, 200)}`);
    }

    const normalized = normalizeLedger(ledger);
    validateNormalizedLedger(normalized, raw);
    validateRelationshipCoverage(normalized.resolutionEngine, normalized.relationshipEngine);
    normalized.deterministicOverrides = {
        ...(normalized.deterministicOverrides || {}),
        semanticLedgerExtraction: extractionMeta,
    };
    const personaCoreStats = extractPersonaCoreStats(context);
    if (personaCoreStats) {
        normalized.engineContext.userCoreStats = {
            ...normalized.engineContext.userCoreStats,
            ...personaCoreStats,
        };
        normalized.deterministicOverrides = {
            ...(normalized.deterministicOverrides || {}),
            userCoreStats: {
                source: 'getCharacterCardFields().persona',
                ...personaCoreStats,
            },
        };
    }

    return normalized;
}

export function parseNarratorTrackerDelta(text, narration = '') {
    return sanitizeNarratorTrackerDelta(parseNarratorTrackerDeltaText(text), narration);
}

function estimateSemanticResponseLength(trackerSnapshot, promptContext = null, options = {}) {
    const trackedNpcCount = trackerSnapshot && typeof trackerSnapshot === 'object'
        ? Object.keys(trackerSnapshot).length
        : 0;
    const inferredSceneNpcCount = estimateSceneNpcCount(promptContext, options);
    const promptComplexity = estimatePromptComplexity(promptContext, options);
    const estimated = SEMANTIC_RESPONSE_LENGTH_MIN
        + (trackedNpcCount * SEMANTIC_RESPONSE_LENGTH_PER_TRACKED_NPC)
        + (Math.max(0, inferredSceneNpcCount - trackedNpcCount) * SEMANTIC_RESPONSE_LENGTH_PER_INFERRED_SCENE_NPC)
        + promptComplexity;
    return Math.max(SEMANTIC_RESPONSE_LENGTH_MIN, Math.min(SEMANTIC_RESPONSE_LENGTH_MAX, estimated));
}

function estimateSceneNpcCount(promptContext, options = {}) {
    const text = extractRecentPromptText(promptContext, options);
    if (!text) return 0;

    const commonWords = new Set([
        'i', 'a', 'an', 'and', 'assistant', 'begin', 'but', 'end', 'engine', 'if', 'info', 'narrator',
        'or', 'sillytavern', 'story', 'system', 'that', 'the', 'then', 'this', 'user', 'world', 'you',
    ]);
    const properNames = new Set();
    for (const match of text.matchAll(/\b[A-Z][A-Za-z'_-]{1,38}\b/g)) {
        const key = match[0].trim().toLowerCase();
        if (commonWords.has(key)) continue;
        properNames.add(key);
    }

    let roleMentions = 0;
    const rolePattern = /\b(?:adventurer|ally|assassin|bandit|beast|captain|companion|cultist|demon|dragon|enemy|goblin|guard|knight|mage|merchant|monster|npc|ogre|orc|raider|soldier|skeleton|thug|undead|villager|wolf|zombie)s?\b/gi;
    for (const match of text.matchAll(rolePattern)) {
        const before = text.slice(Math.max(0, match.index - 16), match.index).toLowerCase();
        roleMentions += /\b(two|three|four|five|six|seven|eight|nine|ten|2|3|4|5|6|7|8|9|10)\s+$/.test(before) ? 2 : 1;
    }

    return Math.min(16, properNames.size + roleMentions);
}

function estimatePromptComplexity(promptContext, options = {}) {
    const text = extractRecentPromptText(promptContext, options);
    if (!text) return 0;
    return Math.min(2048, Math.floor(text.length / 3000) * 256);
}

function extractRecentPromptText(promptContext, options = {}) {
    const rows = Array.isArray(promptContext) ? promptContext : [];
    const texts = [];
    for (let index = rows.length - 1; index >= 0 && texts.length < 8; index -= 1) {
        const row = rows[index];
        const role = String(row?.role || '').toLowerCase();
        if (options?.assembledPrompt && role && !['user', 'assistant'].includes(role)) continue;
        const content = String(row?.mes ?? row?.message ?? row?.content ?? '').trim();
        if (!content) continue;
        texts.push(clip(stripStructuredDebug(content), 2000));
    }
    return texts.reverse().join('\n');
}

async function generateSemanticRaw(context, prompt, responseLength) {
    if (!context?.generateRawData) {
        throw new Error('SillyTavern generateRawData API is unavailable.');
    }
    const options = { prompt };
    if (Number.isFinite(responseLength) && responseLength > 0) {
        options.responseLength = responseLength;
    }
    return await context.generateRawData(options);
}

async function generateSemanticRawWithProfile(prompt, responseLength, options = {}) {
    const result = await sendChatCompletionProfileRequest({
        profileId: options.semanticProfileId,
        profileName: options.semanticProfileName,
        prompt,
        responseLength,
        overridePayload: {
            temperature: 0,
            stop: [SEMANTIC_PREFLIGHT_STOP_SENTINEL],
            stopping_strings: [SEMANTIC_PREFLIGHT_STOP_SENTINEL],
            stop_sequence: [SEMANTIC_PREFLIGHT_STOP_SENTINEL],
        },
        extractData: true,
        preparePayload: applySemanticThinkingPayload,
    });
    return extractGeneratedText(result);
}

class SemanticToolTransportError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'SemanticToolTransportError';
        this.status = details.status;
        this.body = details.body;
        this.cause = details.cause;
    }
}

function isSemanticToolTransportError(error) {
    return error instanceof SemanticToolTransportError || error?.name === 'SemanticToolTransportError';
}

function isRecoverableSemanticToolCallError(error) {
    if (isSemanticToolTransportError(error)) return true;
    const message = error instanceof Error ? error.message : String(error || '');
    return /\bJSON\b/i.test(message)
        || /semantic tool-call (?:arguments|response)/i.test(message)
        || /did not contain submit_semantic_preflight/i.test(message)
        || /Mandatory semantic ledger contract failed/i.test(message)
        || /Semantic pass did not return a valid mandatory compact ledger/i.test(message);
}

async function generateSemanticToolCall(context, prompt, responseLength, options = {}) {
    const toolPrompt = buildSemanticToolPrompt(prompt);
    try {
        const raw = await sendDefaultChatCompletionToolRequest(toolPrompt, responseLength, {
            buildTool: buildSemanticPreflightTool,
            buildToolChoice: buildSemanticToolChoice,
            preparePayload: applySemanticThinkingPayload,
        });
        if (raw?.error) {
            throw new SemanticToolTransportError(`Provider returned an error for semantic tool-call request: ${previewRaw(raw)}`, { body: previewRaw(raw) });
        }
        const ledger = extractSemanticToolLedger(raw);
        return { raw, ledger };
    } catch (error) {
        if (isSemanticToolTransportError(error)) throw error;
        throw new SemanticToolTransportError(error instanceof Error ? error.message : String(error), {
            status: error?.status,
            body: error?.body,
            cause: error,
        });
    }
}

async function generateSemanticToolCallWithProfile(context, prompt, responseLength, options = {}) {
    const chatCompletionSource = getChatCompletionSourceForProfile(options.semanticProfileId, options.semanticProfileName);
    if (!chatCompletionSource) {
        throw new SemanticToolTransportError(`Semantic profile "${options.semanticProfileName || options.semanticProfileId}" does not support chat-completion tool calls.`);
    }

    const toolPrompt = buildSemanticToolPrompt(prompt);
    const semanticTool = buildSemanticPreflightTool(chatCompletionSource);
    const overridePayload = {
        temperature: 0,
        stream: false,
        messages: toolPrompt,
        tools: [semanticTool],
        tool_choice: buildSemanticToolChoice(chatCompletionSource),
        enable_web_search: false,
        request_images: undefined,
        request_image_resolution: undefined,
        request_image_aspect_ratio: undefined,
        json_schema: undefined,
        stop: undefined,
        ...(Number.isFinite(responseLength) && responseLength > 0 ? { max_tokens: responseLength } : {}),
    };

    let raw;
    try {
        raw = await sendChatCompletionProfileRequest({
            profileId: options.semanticProfileId,
            profileName: options.semanticProfileName,
            prompt: toolPrompt,
            responseLength,
            overridePayload,
            extractData: false,
            preparePayload: applySemanticThinkingPayload,
        });
    } catch (error) {
        throw new SemanticToolTransportError(`Direct semantic profile tool-call request failed: ${error instanceof Error ? error.message : String(error)}`, { cause: error });
    }

    if (raw?.error) {
        throw new SemanticToolTransportError(`Provider returned an error for semantic profile tool-call request: ${previewRaw(raw)}`, { body: previewRaw(raw) });
    }

    const ledger = extractSemanticToolLedger(raw);
    return { raw, ledger };
}

export async function sendSemanticProfileTextRequest(prompt, responseLength, options = {}, overridePayload = {}) {
    const result = await sendChatCompletionProfileRequest({
        profileId: options.semanticProfileId,
        profileName: options.semanticProfileName,
        prompt,
        responseLength,
        overridePayload,
        extractData: true,
        preparePayload: applySemanticThinkingPayload,
    });
    return extractGeneratedText(result);
}

export function extractGeneratedText(raw) {
    const candidates = extractTextCandidates(raw);
    return candidates[0] || '';
}

export function applySemanticThinkingPayload(payload) {
    if (!payload || typeof payload !== 'object') {
        return payload;
    }
    payload.include_reasoning = false;
    const customIncludeBody = removeTopLevelYamlKey(payload.custom_include_body, 'thinking').trim();
    if (customIncludeBody) {
        payload.custom_include_body = customIncludeBody;
    } else {
        delete payload.custom_include_body;
    }
    delete payload.reasoning_effort;
    return payload;
}

function removeTopLevelYamlKey(value, keyName) {
    const lines = String(value || '').split(/\r?\n/);
    const target = String(keyName || '').toLowerCase();
    const kept = [];
    let skipping = false;

    for (const line of lines) {
        const topLevelKey = line.match(/^([A-Za-z0-9_-]+)\s*:/);
        if (topLevelKey) {
            skipping = topLevelKey[1].toLowerCase() === target;
        }
        if (!skipping) kept.push(line);
    }

    return kept.join('\n').trim();
}

function buildSemanticToolPrompt(prompt) {
    const messages = Array.isArray(prompt)
        ? prompt.map(message => ({ ...message }))
        : [];
    let contractIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (typeof messages[index]?.content === 'string' && /MANDATORY OUTPUT CONTRACT/i.test(messages[index].content)) {
            contractIndex = index;
            break;
        }
    }
    const toolContract = [
        `MANDATORY OUTPUT CONTRACT: Call the function tool ${SEMANTIC_TOOL_NAME} exactly once.`,
        'Do not output narration, prose, markdown, visible JSON, or a compact text ledger.',
        'Fill every required tool argument from the semantic/contextual engine outputs.',
        'The tool argument paths mirror the engine function names: resolutionEngine.identifyGoal = ResolutionEngine.identifyGoal, resolutionEngine.identifyChallenge = ResolutionEngine.identifyChallenge, resolutionEngine.identifyTargets = ResolutionEngine.identifyTargets, resolutionEngine.actionBucket = ResolutionEngine.actionBucket, relationshipEngine[index].initPreset = RelationshipEngine.initPreset semantic tags, relationshipEngine[index] = RelationshipEngine(npc), and chaosSemantic = CHAOS_INTERRUPT.',
        'Use empty arrays for no targets/obstacles/observers. Use "none" string values only for enum/string fields that require none.',
        'engineContext.trackerRelevantNPCs may be an empty array; the extension already has the canonical tracker snapshot locally.',
        'The compact ledger wording elsewhere in the prompt is the fallback representation of the same fields; for this request, the forced tool call is the only valid output.',
    ].join('\n');

    if (contractIndex >= 0) {
        messages[contractIndex] = {
            ...messages[contractIndex],
            role: 'user',
            content: toolContract,
        };
    } else {
        messages.push({ role: 'user', content: toolContract });
    }

    return messages;
}

function buildSemanticToolChoice(chatCompletionSource) {
    if (chatCompletionSource === 'claude') {
        return 'any';
    }

    return {
        type: 'function',
        function: { name: SEMANTIC_TOOL_NAME },
    };
}

function buildSemanticPreflightTool(chatCompletionSource) {
    const strictSource = ['openai', 'azure_openai'].includes(chatCompletionSource);
    const parameters = buildSemanticPreflightSchema();
    if (!strictSource) {
        removeStrictOnlySchemaKeywords(parameters);
    }

    const tool = {
        type: 'function',
        function: {
            name: SEMANTIC_TOOL_NAME,
            description: 'Submit the mandatory structured semantic preflight ledger for the current SillyTavern roleplay action. This is data extraction only; do not narrate or roll dice.',
            parameters,
        },
    };

    if (strictSource) {
        tool.function.strict = true;
    }

    return tool;
}

function removeStrictOnlySchemaKeywords(schema) {
    if (!schema || typeof schema !== 'object') return schema;
    delete schema.additionalProperties;
    if (schema.properties && typeof schema.properties === 'object') {
        Object.values(schema.properties).forEach(removeStrictOnlySchemaKeywords);
    }
    if (schema.items) {
        removeStrictOnlySchemaKeywords(schema.items);
    }
    return schema;
}

function buildSemanticPreflightSchema() {
    const generatedStatsSeedSchema = {
        type: 'object',
        additionalProperties: false,
        required: ['Rank', 'MainStat'],
        properties: {
            Rank: { type: 'string', enum: ['none', 'Weak', 'Average', 'Trained', 'Elite', 'Boss'] },
            MainStat: { type: 'string', enum: ['none', 'PHY', 'MND', 'CHA', 'Balanced'] },
        },
    };
    const stringListSchema = {
        type: 'array',
        items: { type: 'string' },
    };
    const trackerNpcDeltaSchema = {
        type: 'object',
        additionalProperties: false,
        required: ['NPC', 'revealedName', 'personalitySummary', 'condition', ...TRACKER_NPC_DELTA_FIELDS],
        properties: {
            NPC: { type: 'string' },
            revealedName: { type: 'string' },
            personalitySummary: { type: 'string' },
            condition: { type: 'string', enum: TRACKER_CONDITIONS },
            woundsAdd: stringListSchema,
            woundsRemove: stringListSchema,
            statusAdd: stringListSchema,
            statusRemove: stringListSchema,
            gearAdd: stringListSchema,
            gearRemove: stringListSchema,
        },
    };
    const trackerUserDeltaSchema = {
        type: 'object',
        additionalProperties: false,
        required: ['condition', ...TRACKER_USER_DELTA_FIELDS],
        properties: {
            condition: { type: 'string', enum: TRACKER_CONDITIONS },
            woundsAdd: stringListSchema,
            woundsRemove: stringListSchema,
            statusAdd: stringListSchema,
            statusRemove: stringListSchema,
            gearAdd: stringListSchema,
            gearRemove: stringListSchema,
            inventoryAdd: stringListSchema,
            inventoryRemove: stringListSchema,
            tasksAdd: stringListSchema,
            tasksRemove: stringListSchema,
            commitmentsAdd: stringListSchema,
            commitmentsRemove: stringListSchema,
        },
    };
    const injuryEffectSchema = {
        type: 'object',
        additionalProperties: false,
        required: ['target', 'targetRole', 'effectType', 'bodyPart', 'description', 'severityFloor', 'persistence', 'affectsAction'],
        properties: {
            target: { type: 'string' },
            targetRole: { type: 'string', enum: ['OppTarget', 'HarmedObserver', 'ActionTarget', 'User', 'Other'] },
            effectType: { type: 'string', enum: ['none', 'physical_injury', 'burn', 'poison', 'paralysis', 'disease', 'blindness', 'stun', 'fear', 'restraint', 'curse', 'electrical', 'exhaustion', 'mental_status', 'other_status'] },
            bodyPart: { type: 'string' },
            description: { type: 'string' },
            severityFloor: { type: 'string', enum: ['minor', 'moderate', 'severe', 'critical'] },
            persistence: { type: 'string', enum: ['none', 'lasting'] },
            affectsAction: { type: 'boolean' },
        },
    };
    const powerActorEffectSchema = {
        type: 'object',
        additionalProperties: false,
        required: ['actor', 'actorType', 'hasReach', 'effect', 'severity', 'reason', 'knownToActor'],
        properties: {
            actor: { type: 'string' },
            actorType: { type: 'string' },
            hasReach: {
                type: 'boolean',
                description: 'Y only for organizations or unusually influential individuals with resources, agents, authority, territory, money, magic, reputation, or information access.',
            },
            effect: { type: 'string', enum: POWER_ACTOR_EFFECT_TYPES },
            severity: { type: 'string', enum: POWER_ACTOR_SEVERITIES },
            reason: { type: 'string' },
            knownToActor: {
                type: 'boolean',
                description: 'Y only if the actor plausibly knows, observes, is informed of, or can discover the user action through ordinary reach.',
            },
        },
    };
    const powerActorAssessmentSchema = {
        type: 'object',
        additionalProperties: false,
        required: ['actor', 'scope', 'isPowerActor', 'actorType', 'reach', 'evidence', 'assessmentReason'],
        properties: {
            actor: { type: 'string' },
            scope: { type: 'string', enum: POWER_ACTOR_ASSESSMENT_SCOPES },
            isPowerActor: {
                type: 'boolean',
                description: 'Y when context gives any credible means to affect the user beyond the entity acting alone in the moment: money, influence, authority, status, agents, staff, hired help, resources, institutional/faction access, reputation, information, territory, magic, command, leverage, social reach, ownership, public prominence, or recurring access. Assess semantically, not by title keyword.',
            },
            actorType: { type: 'string' },
            reach: stringListSchema,
            evidence: { type: 'string' },
            assessmentReason: { type: 'string' },
        },
    };
    const powerEventShapeSchema = {
        type: 'object',
        additionalProperties: false,
        required: ['eventId', 'actor', 'eventType', 'fit', 'visibleInstruction', 'contactName', 'contactGender', 'surfaceRole', 'deferReason'],
        properties: {
            eventId: { type: 'string' },
            actor: { type: 'string' },
            eventType: { type: 'string', enum: POWER_EVENT_TYPES },
            fit: { type: 'string', enum: POWER_EVENT_FITS },
            visibleInstruction: {
                type: 'string',
                description: 'Narrator-safe surface scene instruction only. No hidden motive, allegiance, sponsor, spy, agent, infiltration, betrayal, or metadata language.',
            },
            contactName: { type: 'string' },
            contactGender: { type: 'string', enum: POWER_EVENT_CONTACT_GENDERS },
            surfaceRole: { type: 'string' },
            deferReason: { type: 'string' },
        },
    };
    const stakeChangeSchema = {
        type: 'object',
        additionalProperties: false,
        required: STAKE_OUTCOME_KEYS,
        properties: Object.fromEntries(STAKE_OUTCOME_KEYS.map(key => [key, { type: 'string', enum: ['benefit', 'harm', 'none'] }])),
    };
    const itemUseSchema = {
        type: 'object',
        additionalProperties: false,
        required: ['attempted', 'available', 'item', 'source', 'evidence', 'noEffectReason'],
        properties: {
            attempted: {
                type: 'boolean',
                description: 'Y only when the latest user input claims use of an existing personal gear/inventory item already carried by the user, such as drawing, producing, retrieving, spending, consuming, presenting, unlocking with, attacking with, or defending with personal equipment. Grabbing, taking, picking up, receiving, or using scene/environment/NPC-offered objects is not itemUse. Natural weapons and body parts are not itemUse.',
            },
            available: {
                type: 'boolean',
                description: 'Y only when the attempted personal item is already listed in user gear or inventory before the latest user input; body facts and natural weapons do not need gear/inventory availability.',
            },
            item: { type: 'string' },
            source: {
                type: 'string',
                enum: ITEM_USE_SOURCES,
                description: 'Availability source: gear, inventory, unavailable, or none.',
            },
            evidence: { type: 'string' },
            noEffectReason: { type: 'string' },
        },
    };
    const claimCheckSchema = {
        type: 'object',
        additionalProperties: false,
        required: ['present', 'claim', 'targetNPC', 'truthStatus', 'npcAccess', 'stakesImpact', 'reason'],
        properties: {
            present: {
                type: 'boolean',
                description: 'Y only when the latest user input makes a factual claim that could affect a specific NPC choice or stakes.',
            },
            claim: { type: 'string' },
            targetNPC: { type: 'string' },
            truthStatus: {
                type: 'string',
                enum: CLAIM_TRUTH_STATUSES,
                description: 'known_true=explicitly supported; known_false=explicitly contradicted; unsupported=material claim not established; unknown=insufficient context; none=no relevant claim.',
            },
            npcAccess: {
                type: 'string',
                enum: CLAIM_NPC_ACCESS_LEVELS,
                description: 'How much the target NPC can naturally verify or know the claim: direct, partial, none, or unknown.',
            },
            stakesImpact: {
                type: 'boolean',
                description: 'Y only if belief/disbelief could materially affect the NPC choice, trust, access, resources, authority, safety, emotional vulnerability, or immediate stakes.',
            },
            reason: { type: 'string' },
        },
    };
    const userKnowledgeApplicationSchema = {
        type: 'object',
        additionalProperties: false,
        required: ['target', 'entryIds', 'type', 'knownBy', 'scope', 'valence', 'effect', 'line', 'reason'],
        properties: {
            target: {
                type: 'string',
                description: 'The present NPC/group this knowledge plausibly applies to, or (none).',
            },
            entryIds: stringListSchema,
            type: { type: 'string', enum: USER_KNOWLEDGE_TYPES },
            knownBy: { type: 'string' },
            scope: { type: 'string', enum: USER_KNOWLEDGE_SCOPES },
            valence: { type: 'string', enum: ['none', ...USER_REPUTATION_VALENCES] },
            effect: {
                type: 'string',
                enum: USER_KNOWLEDGE_APPLICATION_EFFECTS,
                description: 'How this knowledge should affect init/context: priorUserGoodRep, userBadRep, userNonHuman, contextOnly, or none.',
            },
            line: { type: 'string' },
            reason: { type: 'string' },
        },
    };
    const actionUnitSchema = {
        type: 'object',
        additionalProperties: false,
        required: ['id', 'action', 'evidence'],
        properties: {
            id: {
                type: 'string',
                description: 'A1, A2, or A3, matching the actionCount marker order.',
            },
            action: {
                type: 'string',
                description: 'Short clean description of this mechanically counted user action.',
            },
            evidence: {
                type: 'string',
                description: 'Brief latest-user-text evidence for this action unit. Audit only; not narration.',
            },
        },
    };
    return {
        type: 'object',
        additionalProperties: false,
        required: ['engineContext', 'resolutionEngine', 'relationshipEngine', 'injuryEffectEngine', 'userKnowledgeApplication', 'powerActorEnmity', 'powerEventShape', 'trackerUpdateEngine', 'chaosSemantic'],
        properties: {
            engineContext: {
                type: 'object',
                additionalProperties: false,
                required: ['trackerRelevantNPCs'],
                properties: {
                    trackerRelevantNPCs: {
                        type: 'array',
                        items: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['NPC'],
                            properties: {
                                NPC: { type: 'string' },
                            },
                        },
                    },
                },
            },
            resolutionEngine: {
                type: 'object',
                additionalProperties: false,
                required: [
                    'identifyGoal',
                    'identifyChallenge',
                    'explicitMeans',
                    'userAbilityUse',
                    'itemUse',
                    'claimCheck',
                    'identifyTargets',
                    'intimacyAdvanceExplicit',
                    'boundaryViolationExplicit',
                    'nonLethal',
                    'rollNeeded',
                    'rollReason',
                    'actionBucket',
                    'socialBucket',
                    'combatType',
                    'actionCount',
                    'actionUnits',
                    'environmentDifficultyTier',
                    'classifyHostilePhysicalIntent',
                    'activeHostileThreat',
                    'classifyPhysicalBoundaryPressure',
                    'genStats',
                ],
                properties: {
                    identifyGoal: { type: 'string' },
                    identifyChallenge: { type: 'string' },
                    explicitMeans: { type: 'string' },
                    userAbilityUse: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['used', 'attempted', 'available', 'abilityName', 'evidence', 'narrativeEffect', 'noEffectReason', 'mechanicalScope'],
                        properties: {
                            used: {
                                type: 'boolean',
                                description: 'Y only when the latest user input attempts an ability/spell and that ability/spell exists in active user/persona abilities or spells.',
                            },
                            attempted: {
                                type: 'boolean',
                                description: 'Y when the latest user input explicitly names or implicitly describes an attempted ability/spell/supernatural effect through trigger, delivery method, or desired effect.',
                            },
                            available: {
                                type: 'boolean',
                                description: 'Y only when the attempted ability/spell exists in active user/persona abilities or spells from context.',
                            },
                            abilityName: { type: 'string' },
                            evidence: { type: 'string' },
                            narrativeEffect: { type: 'string' },
                            noEffectReason: { type: 'string' },
                            mechanicalScope: {
                                type: 'string',
                                enum: ['flavor_only_no_bonus'],
                                description: 'Always flavor_only_no_bonus. Ability use is fictional permission/method only and never changes dice, stats, stakes, or outcomes.',
                            },
                        },
                    },
                    itemUse: itemUseSchema,
                    claimCheck: claimCheckSchema,
                    identifyTargets: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['hostilesInScene', 'ActionTargets', 'OppTargets', 'BenefitedObservers', 'HarmedObservers', 'NPCAwareOfUser', 'PowerActors'],
                        properties: {
                            hostilesInScene: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['NPC'],
                                properties: {
                                    NPC: stringListSchema,
                                },
                            },
                            ActionTargets: stringListSchema,
                            OppTargets: {
                                type: 'object',
                                additionalProperties: false,
                                required: ['NPC', 'ENV'],
                                properties: {
                                    NPC: stringListSchema,
                                    ENV: stringListSchema,
                                },
                            },
                            BenefitedObservers: stringListSchema,
                            HarmedObservers: stringListSchema,
                            NPCAwareOfUser: stringListSchema,
                            PowerActors: stringListSchema,
                        },
                    },
                    intimacyAdvanceExplicit: { type: 'boolean' },
                    boundaryViolationExplicit: { type: 'boolean' },
                    nonLethal: {
                        type: 'boolean',
                        description: 'Y only for explicitly nonlethal violence or contests: sparring, training, practice combat, fistfights, barehanded brawls, nonlethal grappling/restraint, capture-only attempts, or stated intent to avoid serious/fatal harm. N for weapons, improvised weapons, claws, teeth, horns, natural weapons, lethal magic, body-damaging supernatural effects, or uncertain cases.',
                    },
                    rollNeeded: {
                        type: 'boolean',
                        description: 'The sole semantic roll gate. Y only for fresh unresolved stakes under DEF.STAKES. N for ordinary continuity, already-decided disposition/intimacy reactions, or repeated resolved same-bucket negative social pressure under unchanged disposition. Bluff and Intimidate are separate.',
                    },
                    rollReason: {
                        type: 'string',
                        description: 'Concise explanation that agrees with rollNeeded. If rollNeeded=true, describe the fresh unresolved stakes. If rollNeeded=false, describe why no fresh unresolved stakes exist.',
                    },
                    actionBucket: {
                        type: 'string',
                        enum: ACTION_BUCKETS,
                        description: 'None, Social, Combat, or Challenge. Use None when rollNeeded=N.',
                    },
                    socialBucket: {
                        type: 'string',
                        enum: SOCIAL_BUCKETS,
                        description: 'Diplomacy, Bluff, or Intimidate only when actionBucket=Social; otherwise None.',
                    },
                    combatType: {
                        type: 'string',
                        enum: COMBAT_TYPES,
                        description: 'Mundane or SpellOrSupernatural only when actionBucket=Combat; otherwise None.',
                    },
                    actionCount: stringListSchema,
                    actionUnits: {
                        type: 'array',
                        items: actionUnitSchema,
                        description: 'Breakdown of the same mechanically counted actions represented by actionCount, capped at three.',
                    },
                    environmentDifficultyTier: {
                        type: 'string',
                        enum: ENVIRONMENT_DIFFICULTY_TIERS,
                        description: 'Semantic environmental opposition tier only when actionBucket=Challenge and OppTargets.ENV has a real obstacle/hazard. Use easy/trivial, average, hard, or extreme; set none for non-Challenge buckets or no ENV roll.',
                    },
                    classifyHostilePhysicalIntent: { type: 'boolean' },
                    activeHostileThreat: { type: 'boolean' },
                    classifyPhysicalBoundaryPressure: { type: 'boolean' },
                    genStats: generatedStatsSeedSchema,
                },
            },
            relationshipEngine: {
                type: 'array',
                items: {
                    type: 'object',
                    additionalProperties: false,
                    required: [
                        'NPC',
                        'initPreset',
                        'auditInteraction',
                        'establishedRelationship',
                        'romanceStyle',
                        'slowBondEvidence',
                        'explicitIntimidationOrCoercion',
                        'stakeChangeByOutcome',
                        'overrideFlags',
                        'genStats',
                    ],
                    properties: {
                        NPC: { type: 'string' },
                        initPreset: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['romanticOpen', 'userBadRep', 'priorUserGoodRep', 'userNonHuman', 'fearImmunity'],
                            properties: {
                                romanticOpen: {
                                    type: 'boolean',
                                    description: 'Y when prior card/lore/scenario/chat establishes clear user-directed romantic interest, romantic willingness, love, crush, courting desire, romantic preoccupation, or deliberate romantic pursuit toward user; not generic friendliness, politeness, casual flirting, shallow physical attraction, vague chemistry, ordinary embarrassment, or first impressions.',
                                },
                                userBadRep: {
                                    type: 'boolean',
                                    description: 'Y only for explicit prior hate, distrust, enemy status, pursuit, betrayal, harm, or bad reputation with this NPC; not current-scene conflict alone.',
                                },
                                priorUserGoodRep: {
                                    type: 'boolean',
                                    description: 'Y only for explicit established favorable or trust-normalizing prior history/reputation/trust/gratitude/safe familiarity with this NPC; not kindness or good impressions only in this interaction.',
                                },
                                userNonHuman: {
                                    type: 'boolean',
                                    description: 'Y only for a fear-coded initial context: explicit established fearsome/dangerous user reputation known to this NPC, or explicitly visible demonic, monstrous, undead, bestial, eldritch, construct-like, or obviously supernatural user form when this is a fresh or unnormalized exposure. Do not use for normal fantasy peoples, hidden ancestry, or an NPC who already has prior familiarity/ordinary context/trusted introduction that makes user known rather than shocking.',
                                },
                                fearImmunity: {
                                    type: 'boolean',
                                    description: 'Y only for same/superior supernatural kind, ancient/powerful/fear-resistant beings, or explicit constant experience with supernatural threats; not ordinary guards, soldiers, bravery, rank, or normal combat experience.',
                                },
                            },
                        },
                        auditInteraction: { type: 'boolean' },
                        establishedRelationship: { type: 'boolean' },
                        romanceStyle: { type: 'string', enum: ['auto', 'nervous', 'flirt'] },
                        slowBondEvidence: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['respectfulContact', 'cooperation', 'comfortInProximity', 'boundaryRespect', 'sharedRoutine', 'playfulness', 'teamwork', 'personalAttention', 'blockers'],
                            properties: {
                                respectfulContact: { type: 'boolean' },
                                cooperation: { type: 'boolean' },
                                comfortInProximity: { type: 'boolean' },
                                boundaryRespect: { type: 'boolean' },
                                sharedRoutine: { type: 'boolean' },
                                playfulness: { type: 'boolean' },
                                teamwork: { type: 'boolean' },
                                personalAttention: { type: 'boolean' },
                                blockers: { type: 'array', items: { type: 'string' } },
                            },
                        },
                        explicitIntimidationOrCoercion: { type: 'boolean' },
                        stakeChangeByOutcome: stakeChangeSchema,
                        overrideFlags: {
                            type: 'object',
                            additionalProperties: false,
                            required: ['CurrentInvitation', 'Exploitation', 'Hedonist', 'Transactional', 'Established', 'RomanticBuildup'],
                            properties: {
                                CurrentInvitation: {
                                    type: 'boolean',
                                    description: 'Y only when this NPC has clearly and directly offered, requested, invited, strongly implied, or physically initiated sexual/intimate escalation with user in the current or immediately recent scene, and has not withdrawn, refused, panicked, or been interrupted by danger. Includes irrefutable sexual invitation hints framed as questions, such as wanting to know how tight/full they would feel and asking whether user wants to find out.',
                                },
                                Exploitation: {
                                    type: 'boolean',
                                    description: 'Y only when card/lore/context explicitly makes this NPC exploitable by user or situation: naive, easily led/persuaded, follows user lead without question, dependent, trapped, coerced, powerless, or unsafely sheltered. Not mere innocence, shyness, kindness, flirting, or low confidence.',
                                },
                                Hedonist: {
                                    type: 'boolean',
                                    description: 'Y only for explicitly sexually open, pleasure-seeking, casual, promiscuous, or eager intimacy context.',
                                },
                                Transactional: {
                                    type: 'boolean',
                                    description: 'Y only for explicit willingness to exchange intimacy for money, goods, favors, protection, status, or services.',
                                },
                                Established: {
                                    type: 'boolean',
                                    description: 'Y only for explicit prior/current intimate access with current or recent receptivity toward user, separate from establishedRelationship. Prior intimacy alone is not enough if current receptivity is absent, stale, unclear, refused, fearful, hostile, coerced, or boundary-limited.',
                                },
                                RomanticBuildup: {
                                    type: 'boolean',
                                    description: 'Y only for a B4 close-bond scene where the current and recent interaction has consistently and mutually built toward romantic/intimate escalation with receptive NPC behavior, making the user latest intimate advance a natural continuation. N for ordinary friendliness, tenderness, gratitude, warmth, single smiles, casual flirting, vague chemistry, or user-only escalation. N if refusal, withdrawal, fear, hostility, coercion, danger, public/social interruption, or a boundary limit is active.',
                                },
                            },
                        },
                        genStats: generatedStatsSeedSchema,
                    },
                },
            },
            injuryEffectEngine: {
                type: 'object',
                additionalProperties: false,
                required: ['effects'],
                properties: {
                    effects: {
                        type: 'array',
                        items: injuryEffectSchema,
                    },
                },
            },
            userKnowledgeApplication: {
                type: 'object',
                additionalProperties: false,
                required: ['applications'],
                properties: {
                    applications: {
                        type: 'array',
                        items: userKnowledgeApplicationSchema,
                    },
                },
            },
            powerActorEnmity: {
                type: 'object',
                additionalProperties: false,
                required: ['assessments', 'effects'],
                properties: {
                    assessments: {
                        type: 'array',
                        items: powerActorAssessmentSchema,
                    },
                    effects: {
                        type: 'array',
                        items: powerActorEffectSchema,
                    },
                },
            },
            powerEventShape: {
                type: 'object',
                additionalProperties: false,
                required: ['events'],
                properties: {
                    events: {
                        type: 'array',
                        items: powerEventShapeSchema,
                    },
                },
            },
            trackerUpdateEngine: {
                type: 'object',
                additionalProperties: false,
                required: ['user', 'npcs'],
                properties: {
                    user: trackerUserDeltaSchema,
                    npcs: {
                        type: 'array',
                        items: trackerNpcDeltaSchema,
                    },
                },
            },
            chaosSemantic: {
                type: 'object',
                additionalProperties: false,
                required: ['sceneSummary'],
                properties: {
                    sceneSummary: { type: 'string' },
                },
            },
        },
    };
}

function extractSemanticToolLedger(raw) {
    const calls = collectToolCalls(raw);
    const matching = calls.find(call => getToolCallName(call) === SEMANTIC_TOOL_NAME) || calls[0];
    if (!matching) {
        throw new Error(`semantic tool-call response did not contain ${SEMANTIC_TOOL_NAME}. RawPreview=${previewRaw(raw)}`);
    }

    const args = getToolCallArguments(matching);
    const ledger = parseToolArguments(args);
    if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
        throw new Error(`semantic tool-call arguments were not an object. RawPreview=${previewRaw(raw)}`);
    }
    return ledger;
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
    if (Array.isArray(geminiParts)) {
        calls.push(...geminiParts.filter(part => part?.functionCall));
    }

    const responseParts = raw?.responseContent?.parts;
    if (Array.isArray(responseParts)) {
        calls.push(...responseParts.filter(part => part?.functionCall).map(part => part.functionCall));
    }

    if (Array.isArray(raw)) {
        for (const item of raw) {
            calls.push(...collectToolCalls(item));
        }
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

function parseToolArguments(args) {
    if (args && typeof args === 'object' && !Array.isArray(args)) {
        return args;
    }
    if (typeof args !== 'string') {
        throw new Error('semantic tool-call arguments were missing');
    }
    const text = args.trim();
    if (!text) {
        throw new Error('semantic tool-call arguments were empty');
    }
    return parseToolArgumentJson(text);
}

function parseToolArgumentJson(text) {
    const jsonText = extractJsonObject(text);
    try {
        return JSON.parse(jsonText);
    } catch (error) {
        const repaired = repairToolArgumentJson(jsonText);
        if (repaired && repaired !== jsonText) {
            try {
                const parsed = JSON.parse(repaired);
                console.warn('[Structured Preflight Engines] repaired malformed semantic tool-call JSON locally before fallback.');
                return parsed;
            } catch {
                // Throw the original parse error below; it points to the provider payload.
            }
        }
        throw error;
    }
}

function repairToolArgumentJson(text) {
    let repaired = String(text || '');
    repaired = repaired
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/\bNaN\b/g, 'null')
        .replace(/\bInfinity\b/g, 'null')
        .replace(/\b-Infinity\b/g, 'null')
        .replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, '$1"$2"$3')
        .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, value) => `: "${value.replace(/"/g, '\\"')}"`);
    repaired = insertMissingCommasBetweenProperties(repaired);
    repaired = balanceJsonDelimiters(repaired);
    return repaired;
}

function insertMissingCommasBetweenProperties(text) {
    let output = '';
    let inString = false;
    let escaped = false;
    for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        output += char;
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\' && inString) {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            if (!inString) {
                const nextSlice = text.slice(index + 1);
                const match = nextSlice.match(/^(\s*)"[^"]+"\s*:/);
                if (match) {
                    const previousNonSpace = previousNonWhitespace(output.slice(0, -1));
                    if (previousNonSpace !== '{' && previousNonSpace !== '[' && previousNonSpace !== ',' && previousNonSpace !== ':') {
                        output += ',';
                    }
                }
            }
        }
    }
    return output;
}

function previousNonWhitespace(text) {
    const match = String(text || '').match(/\S(?=\s*$)/);
    return match ? match[0] : '';
}

function balanceJsonDelimiters(text) {
    const stack = [];
    let inString = false;
    let escaped = false;
    for (const char of String(text || '')) {
        if (escaped) {
            escaped = false;
            continue;
        }
        if (char === '\\' && inString) {
            escaped = true;
            continue;
        }
        if (char === '"') {
            inString = !inString;
            continue;
        }
        if (inString) continue;
        if (char === '{' || char === '[') stack.push(char);
        if (char === '}' && stack[stack.length - 1] === '{') stack.pop();
        if (char === ']' && stack[stack.length - 1] === '[') stack.pop();
    }
    let balanced = text;
    while (stack.length) {
        const open = stack.pop();
        balanced += open === '[' ? ']' : '}';
    }
    return balanced;
}

const COMPACT_LEDGER_CONTRACT = [
    'STRICT COMPACT PREFLIGHT LEDGER CONTRACT:',
    '- Output only the ledger block. No markdown. No prose. No JSON. No comments. No explanations.',
    '- Begin with BEGIN_SEMANTIC_PREFLIGHT and end the ledger with END_SEMANTIC_PREFLIGHT.',
    `- After END_SEMANTIC_PREFLIGHT, output ${SEMANTIC_PREFLIGHT_STOP_SENTINEL} on its own final line. Do not output anything after it.`,
    '- Fill every required line exactly once. Keep the exact function/key names shown below.',
    '- The ledger is only a form. The Engine reference is the rule source. Read and execute the semantic/contextual engine functions first, then fill the lines from those outputs.',
    '- Use comma-separated names or (none) for lists. Use Y/N for booleans. Use benefit/harm/none for stakeChangeByOutcome values.',
    '- ResolutionEngine user intent is explicit-only. For identifyGoal and identifyChallenge, use only the latest user-declared action, request, target, and explicit objective; do not infer an unstated goal from NPC fear, hostility, suspicion, likely reaction, context, or what an NPC might assume. For NPC-targeted stakes and OppTargets.NPC, the latest user input must directly target that NPC with a stakes-bearing action, demand, threat, attack, coercion, restraint, deception, persuasion, negotiation, boundary pressure, or explicit objective. Ambiguous, preparatory, self-directed, atmospheric, or scene-state actions remain exactly that. Drawing, readying, revealing, holding, sheathing, or repositioning a weapon is scene state, not intimidation or coercion by itself; classify it as stakes only when the user also declares a demand, threat, attack, aim/pointing at a target, blocking, pursuit, forced movement, aggressive advance, stealth contest, speed contest, or another explicit stakes-bearing objective.',
    '- ResolutionEngine.rollNeeded is the sole semantic roll gate and directly applies DEF.STAKES. Return Y only when success/failure of the latest explicit user goal or challenge creates fresh unresolved stakes: physical risk, harm, danger, detection, material gain/loss, significant trust/status/authority shift, autonomy/freedom, access, secrets, combat, pursuit, restraint, deception, bargaining, environmental obstacle resolution, or explicit goal advancement/failure. Return N for ordinary continuity, no material stakes, a reaction already decided by saved fear/terror, hostility/hatred, persisted intimacy boundary, or a repeated resolved same-bucket negative social attempt against the same NPC/goal under unchanged disposition. Failed/resolved Bluff blocks repeated Bluff; failed/resolved Intimidate blocks repeated Intimidate. Bluff does not block a later Intimidate, and Intimidate does not block a later Bluff. Repeated wording, stronger insults, renewed same-bucket threats, rephrased same-bucket bluffs, or theatrical display after refusal/failure are aftermath or escalation, not a fresh social contest. ResolutionEngine.rollReason must briefly explain why rollNeeded is Y or N and must not contradict the flag: rollNeeded=Y requires fresh unresolved stakes; rollNeeded=N requires no fresh unresolved stakes.',
    '- ResolutionEngine.actionBucket is the roll shape, not a stat choice. Use None when rollNeeded=N. Use Social only for fresh unresolved NPC-facing social pressure, with socialBucket=Diplomacy for good-faith persuasion/negotiation/reassurance, Bluff for deception/lying/misleading/material false claims, and Intimidate for threats/coercion/blackmail/fear-based demands. Use Combat for direct violence or harmful supernatural attacks; combatType=Mundane for bodily/weapon/natural-weapon/ordinary force, and SpellOrSupernatural for the primary attack being a spell, power, curse, elemental blast, psychic attack, or similar. Use Challenge for physical/environmental obstacles, stealth, escape, chase, locks, traps, terrain, weather, barriers, hazards, or non-living opposition. If not Social, socialBucket=None. If not Combat, combatType=None.',
    '- ResolutionEngine.actionUnits breaks the latest explicit {{user}} attempt into the same mechanically counted actions represented by actionCount. actionUnits.count must match actionCount length after the three-action cap. Each action is short clean wording of that action unit; evidence is brief latest-user-text audit evidence. actionUnits does not decide success, failure, outcome, injury, counterattack, or narration.',
    '- ResolutionEngine.identifyTargets.ActionTargets is the direct interaction list. Include every living NPC the latest user input directly addresses, speaks to, answers, asks, thanks, reassures, requests, warns, commands, helps, treats, touches, accompanies, follows, trades with, gives something to, receives something from, attacks, restrains, deceives, negotiates with, or otherwise directly interacts with this turn, whether rollNeeded is Y or N. ActionTargets are broader than OppTargets.NPC. If the latest user input directly involves a living NPC, that NPC belongs in ActionTargets even when the scene is ordinary continuity and OppTargets.NPC is (none). Do not include bystanders, background crowds, inferred listeners, offscreen entities, or hostilesInScene-only NPCs unless the latest user input directly involves them.',
    '- ResolutionEngine.identifyTargets.NPCAwareOfUser is the individual-awareness list. Include only named or clearly individual living NPCs who are present and directly become aware of {{user}} by noticing, looking at, addressing, gesturing to, reacting to, or otherwise individually interacting with {{user}} in the current scene/context, even if {{user}} has not directly acted on them. Exclude groups, crowds, factions, unnamed plural background NPCs, inferred listeners, offscreen entities, and generic bystanders. Example: "the innkeeper looks at {{user}}" belongs in NPCAwareOfUser; "the patrons turn toward the newcomer" does not.',
    '- ResolutionEngine.identifyTargets.PowerActors is strategic-only: list organizations, factions, institutions, groups, and potential power figures with any credible means to affect {{user}} beyond acting alone in the moment: money, influence, authority, status, agents, staff, hired help, resources, institution/faction access, reputation, information, territory, magic, command, leverage, social reach, ownership, public prominence, or recurring access. PowerActors never create rolls, NPCInScene, RelationshipEngine, B/F/H, injuries, or visible tracker entries by themselves.',
    '- RelationshipEngine entries must use RelationshipEngine[0], RelationshipEngine[1], etc. Include one entry for each living NPC in ActionTargets, OppTargets.NPC, BenefitedObservers, HarmedObservers, or NPCAwareOfUser. Do not create RelationshipEngine entries from hostilesInScene.NPC or PowerActors alone unless that NPC is also in one of those target/observer/awareness lists.',
    '- If no living NPC is in those target/observer/awareness lists, output RelationshipEngine.count=0 and no RelationshipEngine[index] lines.',
    '- RelationshipEngine[index].initPreset is only "how this NPC initially feels toward {{user}}" when currentDisposition is missing. Check all available context: active SillyTavern prompt stack, character card, persona name/text, scenario, lore/world info, tracker snapshot, and chat history. The semantic pass chooses only these Y/N tags; deterministic code assigns B/F/H stats. romanticOpen=Y when prior card/lore/scenario/chat establishes clear user-directed romantic interest, romantic willingness, love, crush, courting desire, romantic preoccupation, or deliberate romantic pursuit toward {{user}}. This can be stated directly or shown through clearly romantic behavior, gestures, plans, keepsakes, letters, gifts, jealousy, longing, attempts to be noticed, attempts to spend time alone, or other evidence that the NPC interest in {{user}} is romantic rather than merely friendly. Do not mark romanticOpen for generic friendliness, politeness, casual flirting, shallow physical attraction, ordinary embarrassment, first impressions, vague chemistry, gratitude, or non-romantic loyalty. Do not suppress romanticOpen solely because userNonHuman=Y; set both flags if both are explicit. userBadRep=Y only if {{user}} is hated, distrusted, wanted, enemy-coded, or has a bad prior reputation with this NPC before the current first interaction. priorUserGoodRep=Y only if prior lore/card/scenario/tracker/history or UserKnowledgeApplication explicitly gives {{user}} an established favorable or trust-normalizing reputation with this NPC before the current scene: safe familiarity, credible vouching, ordinary neighbor/customer/guild contact, cleared/cooperative status, prior help, trust, gratitude, or other prior context that makes {{user}} known as safe/cooperative despite unusual nature. First-encounter kindness, rescue, courtesy, friendliness, praise, or warm first impression do not count. userNonHuman=Y only for a fear-coded initial context: either UserKnowledgeApplication or explicit prior context gives {{user}} an established fearsome/dangerous reputation known to this NPC, OR {{user}} is explicitly visibly inhuman, demonic, monstrous, undead, bestial, eldritch, or construct-like and this NPC lacks prior familiarity, ordinary normalizing context, trusted introduction, or credible knowledge that makes {{user}} known rather than shocking. Do not use userNonHuman merely because the user is a demon/monster if the NPC already knows of them in a neutral or normalizing way; fall through to neutral unless priorUserGoodRep, userBadRep, or userNonHuman fear-coded reputation applies. fearImmunity=Y only if this NPC is the same kind/race category as that user form, a superior or peer supernatural/monstrous being, explicitly immune/naturally resistant to fear or mental fear, or card/lore/scenario explicitly portrays them as an ancient/powerful/non-ordinary being that has faced such horrors and is not meaningfully afraid of them. Title, rank, bravado, posturing, composure, courage, or pretending to be fearless do not count.',
    '- RelationshipEngine[index].establishedRelationship is true only if this NPC already has B4 relationship state and tracker establishedRelationship=Y, or the current explicit scene shows a direct romantic/love/relationship declaration or request from {{user}} accepted by that NPC, or from that NPC accepted by {{user}}. If the immediately previous NPC message contains a clear love/relationship confession or request, and the current user input accepts it verbally or through unmistakable romantic reciprocation such as kissing/embracing without refusal, return true. If the immediately previous user input contains a clear love/relationship confession or request, and the current NPC response accepted it, return true. It must establish an actual romantic relationship, partnership, lovers status, dating/courting bond, or equivalent committed romantic connection. Flirting, attraction, arousal, sex, prior intimacy, affection, kindness, trust, loyalty, closeness, friendship, gratitude, protectiveness, or B4 alone does not count.',
    '- RelationshipEngine[index].romanceStyle is for B4 pre-relationship initiative only. Return nervous if explicit card/lore/context portrays this NPC as shy, reserved, guarded, restrained, formal, awkward, timid, emotionally cautious, or likely to show romantic interest through hesitation. Return flirt if explicit card/lore/context portrays this NPC as bold, outgoing, playful, teasing, direct, seductive, socially confident, or likely to show romantic interest through open flirtation. Return auto if unclear or mixed.',
    '- RelationshipEngine[index].checkThreshold override flags must use all available context: active SillyTavern prompt stack, character card, persona name/text, scenario, lore/world info, tracker snapshot, and chat history. CurrentInvitation=Y when this NPC clearly and directly offers, requests, invites, strongly implies, accepts, agrees to, arranges, or physically initiates sexual/intimate escalation with {{user}} in the current or immediately recent scene, and has not withdrawn, refused, panicked, or been interrupted by danger. Mark CurrentInvitation=Y when the NPC accepts or agrees to {{user}}\'s explicit sexual/intimate proposal, including agreeing to join, inviting or calling another willing participant, or saying yes to coming over for sex/intimacy. Mark CurrentInvitation=Y for irrefutable sexual invitation hints even when phrased as teasing questions, such as "I wonder how tight I would be for you. Want to find out?" Do not mark CurrentInvitation for ordinary flirting, suggestive banter, compliments, attraction, embarrassment, vague innuendo without an invitation, or a user-originated proposal the NPC has not accepted. Exploitation=Y when card/lore/context explicitly makes this NPC exploitable by {{user}} or the current situation: naive, easily led or persuaded, follows {{user}}\'s lead without question, dependent, trapped, coerced, powerless, sheltered to an unsafe degree, or otherwise unable to safely judge/resist. Do not mark Exploitation for mere innocence, shyness, kindness, friendliness, attraction, low confidence, or normal inexperience without explicit vulnerability/suggestibility. Hedonist=Y only for explicitly sexually open, pleasure-seeking, casual, promiscuous, or eager intimacy context. Transactional=Y only for explicit willingness to exchange intimacy for money, goods, favors, protection, status, or services. Established=Y only for explicit prior/current intimate access with current or recent receptivity toward {{user}}, such as casual lovers, friends with benefits, an ongoing sexual arrangement, or explicit comfort/willingness with renewed intimacy. Do not mark Established for prior intimacy alone when current receptivity is absent, stale, unclear, refused, fearful, hostile, coerced, or boundary-limited. establishedRelationship remains its separate relationship-state mechanic.',
    '- RelationshipEngine[index].checkThreshold.RomanticBuildup=Y only when a B4 close-bond scene has consistently and mutually built toward romantic/intimate escalation with receptive NPC behavior, so {{user}}\'s latest intimate advance is a natural continuation. Do not mark RomanticBuildup for ordinary friendliness, tenderness, gratitude, warmth, one smile, casual flirting, vague chemistry, or user-only escalation. Do not mark RomanticBuildup if refusal, withdrawal, fear, hostility, coercion, danger, public/social interruption, or a boundary limit is active.',
    '- RelationshipEngine[index].slowBondEvidence is scene-local semantic evidence for slow B3-to-B4 trust growth. Mark only categories explicitly shown in the latest scene/current immediate context. respectfulContact=welcome/respectful physical contact or physical help; cooperation=constructive cooperation toward a shared purpose; comfortInProximity=NPC remains or settles close without fear, duty, coercion, or forced circumstance; boundaryRespect={{user}} respects refusal, hesitation, privacy, space, limits, consent, or a stated boundary; sharedRoutine=repeated or mundane togetherness such as eating/traveling/working/resting/training/tending camp; playfulness=mutual light teasing, joking, banter, or relaxed warmth; teamwork=coordinated effort under pressure/danger/conflict/crisis; personalAttention=specific attention to NPC needs, preferences, wellbeing, vulnerability, history, comfort, or concerns. blockers include coercion, intimidation, betrayal, humiliation, unwanted intimacy pressure, boundary violation, unresolved harm, exploitation, active fear, active hostility, or trapped/dependent/powerless circumstances that make closeness unsafe to count.',
    '- ResolutionEngine.userAbilityUse is semantic-only ability/spell detection. Compare the latest user input against active {{user}}/persona abilities and spells, including the # ABILITIES and # SPELLS character sheet sections, character persona, lore, or prompt stack. Mark Attempted=Y when the input explicitly names an ability/spell or implicitly describes attempting one through trigger, delivery method, or desired effect. Private delivery phrasing such as "meant only for X", "only X can hear", "whisper so only X hears", "send the words directly/private to X", or "speak into X alone" should match a persona ability/spell whose effect privately carries speech, sound, thought, or message to a target, even if the ability/spell name is not said. Mark Available=Y only if that attempted ability/spell exists in active {{user}} abilities or spells. Mark Used=Y only when Attempted=Y and Available=Y. Use the exact persona ability/spell name when available; otherwise name the attempted ability/effect concisely. Evidence is the user wording that signals the attempt. NarrativeEffect is the direct in-world effect to preserve when available, or the attempted effect that must not occur when unavailable. If Attempted=Y and Available=N, set NoEffectReason to why no ability/spell effect occurs. MechanicalScope must always be flavor_only_no_bonus: abilities and spells can make fictional methods possible, but they never change rollNeeded, actionCount, actionBucket, rolls, bonuses, margins, landed actions, relationship state, injury severity, or outcome. If an available ability/spell delivers a threat, persuasion, attack, escape, healing, or other stakes-bearing goal, classify and roll the broader goal normally; do not roll the ability/spell separately. Noncombat utility magic succeeds if available and does not create a roll by itself. If no ability/spell attempt exists, output Attempted=N, Available=N, Used=N, and (none) for name, evidence, effect, and reason.',
    '- ResolutionEngine.itemUse is strict semantic-only personal gear/inventory verification, not environmental object discovery. Mark Attempted=Y only when {{user}} attempts to use, draw, wield, consume, spend, present, unlock with, attack with, defend with, produce, retrieve, or otherwise rely on an item as {{user}}\'s own personal equipment, gear, or inventory already carried before the latest input. Personal carried-item signals include "my X", "from my belt", "from my pocket", "from my pack", "from my bag", "from my pouch", "from my sheath", "from my holster", "I draw X", "I produce X", "I retrieve X", or any equivalent claim that {{user}} already has the item on their person or in their carried inventory. Mark Available=Y only if that exact attempted personal item is already listed in {{user}} gear or inventory before the latest user input; use Source=gear or Source=inventory. The latest user input cannot create possession, carried state, equipment, inventory, or evidence of availability. Mark Available=N and Source=unavailable when the personal item is unsupported, absent, too specific for the listed inventory item, or only asserted by the latest user wording. Mark Attempted=N for ordinary interaction with environmental, scene, or NPC-offered objects, including grabbing, taking, picking up, receiving, finding, searching for, using, breaking, burning, throwing, or moving an object from a table, floor, ground, counter, shelf, corpse, display, container, NPC hand, offered transfer, or any other scene source; those actions remain normal narration/stakes/ENV context, not itemUse. Examples: "I draw my sword" -> Attempted=Y; "I pull my phone from my pocket" -> Attempted=Y; "I grab the sword from the table" -> Attempted=N; "Alice hands me a key and I take it" -> Attempted=N. Mark Attempted=N for body parts and natural weapons such as hands, fists, claws, fangs, teeth, horns, talons, tusks, tails, stingers, barbs, jaws, or similar anatomy; using them is normal bodily action/attack/stakes context, not gear or inventory verification. Do not infer personal item availability from setting likelihood. If no personal gear/inventory item attempt exists, output Attempted=N, Available=N, Source=none, and (none) for item, evidence, and reason.',
    '- ResolutionEngine.claimCheck is a narrow stakes-bearing claim check, not a truth engine. Mark Present=Y only when {{user}} makes a factual claim to a specific NPC that could materially affect that NPC choice, trust, access, resources, authority, safety, emotional vulnerability, or immediate stakes. Claim examples include identity/status/authority, affiliation, ownership/access, possession/resources, orders/authorization, or claimed events/facts used as leverage. TruthStatus: known_true only if explicitly supported; known_false only if explicitly contradicted; unsupported if material but not established; unknown if context cannot judge; none when no relevant claim. NPCAccess describes how much the target NPC can naturally verify or know the claim: direct, partial, none, unknown. StakesImpact=Y only when belief/disbelief matters under DEF.STAKES. Do not mark Present for casual flavor, jokes, harmless small talk, opinions, compliments, vague emotional color, or claims that do not affect NPC stakes.',
    '- ResolutionEngine.environmentDifficultyTier applies only when actionBucket=Challenge and OppTargets.ENV contains a real non-living obstacle, hazard, terrain feature, object, ward, weather condition, or environmental pressure. Allowed values: none, easy, average, hard, extreme. easy means easy/trivial/routine/weak/lightly obstructed; average means a meaningful obstacle a capable person could plausibly fail; hard means a serious obstacle requiring strong capability, tools, magic, focus, favorable positioning, or risk; extreme means exceptional, dangerous, fortified, overwhelming, or near-impossible environmental opposition. Classify from concrete scene facts: material, scale, complexity, danger, time pressure, visibility, footing, weather, magical strength, tool access, distance, and whether the environment is worsening. Do not raise difficulty because the story moment feels dramatic. Do not lower difficulty because {{user}} has high stats. If there are no real stakes, set rollNeeded=N instead of using an ENV tier. If actionBucket is not Challenge, set environmentDifficultyTier=none. Deterministic code maps this tier to the numeric ENV bonus.',
    '- ResolutionEngine.identifyTargets.hostilesInScene.NPC is scene-level: list ALL established, present, living hostile entities currently threatening {{user}}, companions, protected NPCs, bystanders, or the scene generally. Identify this broad hostile pool before choosing OppTargets.NPC. Establishment must come from assistant narration, tracker, character/scenario/lore context, or the initial test setup; do not create a hostile from the latest user input alone. Exclude friendly/neutral NPCs, absent/offscreen entities, incapacitated/dead entities no longer posing danger, and non-living hazards/obstacles.',
    '- ResolutionEngine.identifyTargets.OppTargets.NPC is narrower: list only living entities directly opposing, contesting, resisting, blocking, defending against, or being attacked/challenged by {{user}}\'s current action/challenge. Do not put every enemy in OppTargets.NPC just because they are hostile; use hostilesInScene.NPC for the broader hostile pool.',
    '- ResolutionEngine.activeHostileThreat is strict. Return Y only if the current scene contains an immediate hostile danger from an NPC/entity: attacking, charging, preparing to attack, pursuing, ambushing, threatening violence, monster/hostile creature engagement, armed standoff, capture attempt, or imminent physical/supernatural harm. Return N for negotiation, refusal, bargaining, argument, social resistance, authority denial, suspicion, rivalry, nonviolent obstruction, or ordinary OppTargets.NPC without immediate danger.',
    '- ResolutionEngine.intimacyAdvanceExplicit is strict. Return Y only if {{user}} explicitly attempts, requests, accepts, or reciprocates actual intimate escalation with a specific NPC: kissing, making out, sexual touch, undressing toward intimacy, asking to sleep together, asking for sex, moving to bed, or clearly initiating romantic/sexual physical closeness. Return Y for accepting or reciprocating a prior explicit NPC-initiated intimacy invitation or action. Return N for flirting, teasing, compliments, romantic banter, suggestive jokes, vague innuendo, "what did you have in mind", declarations of love, asking for a date, emotional confession, hand-holding, casual proximity, or ordinary affection that does not clearly escalate into kissing or sexual/intimate contact. This is only an intimacy permission/boundary signal and does not create stakes, rolls, landed actions, Bond loss, Fear, or Hostility by itself.',
    '- ResolutionEngine.boundaryViolationExplicit is strict. Return Y only if the current user input explicitly violates, ignores, or pressures past a clear refusal, stated boundary, withdrawal, fear, incapacitation, explicitly established lack of consent, or prior denial from this specific NPC. Return Y for coercion, threats, force, unwanted restraint/contact after refusal, repeated pressure after refusal, humiliation, blackmail, or ignoring a clear stop/no. Return N for flirting, teasing, romantic talk, asking permission, accepting or reciprocating NPC-initiated flirtation/intimacy, backing off/respecting a boundary, or ordinary romantic/sexual ambiguity where no refusal/boundary/incapacity has been explicitly established.',
    '- ResolutionEngine.nonLethal is strict. Return Y only for explicitly nonlethal violence or contests: sparring, training, practice combat, fistfights, barehanded brawls, wrestling/grappling without lethal force, restraint-only takedowns, capture-only attempts, or stated intent to avoid serious/fatal harm. Return Y when scene rules, an instructor, an arena, duel terms, or {{user}} explicitly frame the current physical conflict as nonlethal. Return N for weapons, blades, arrows, spears, axes, clubs, improvised weapons, claws, teeth, horns, natural weapons, lethal magic, body-damaging supernatural effects, or any uncertain attack.',
    '- All genStats groups must include only Rank and MainStat. Use genStats only when the relevant NPC currentCoreStats are missing in the tracker snapshot. The semantic pass identifies Rank and MainStat from explicit portrayal; deterministic code assigns numeric PHY/MND/CHA values within the Rank range and saves them once.',
    '- InjuryEffectEngine is semantic-only candidate extraction for effects the user action would cause if deterministic mechanics say the action lands. It does not roll and does not decide success. Include physical injuries and impairing magical/status effects regardless of source: burns, poison, paralysis, sickness, blindness, fear/panic, restraint, curses, lightning/electrical effects, exhaustion, mental effects, or other ongoing impairing states. Exclude purely emotional/social harm, mere witnessing, momentary pain, intended/requested future injuries, or effects that would not persist or impair later action.',
    '- InjuryEffectEngine target must be the entity actually receiving the impairing effect. HarmedObservers may appear only if they are directly affected by the injury/status effect, not merely emotionally harmed by seeing or caring about another target. Use persistence=lasting and affectsAction=Y only for effects that should impair later action if applied.',
    '- TrackerUpdateEngine is explicit-only visual state tracking. Output deltas only from the latest user input and immediate visible context. Use condition=unchanged, personalitySummary=unchanged, and (none) lists unless a change is explicitly stated.',
    '- TrackerUpdateEngine must never rewrite full inventories, gear, wounds, status, tasks, or commitments from silence. Add only explicit new items/effects/tasks. Remove only explicit dropped/spent/used-up/lost/completed/canceled/failed/abandoned entries. Remove wounds/status only when the text explicitly says the injury or status is healed, cured, recovered, restored, regenerated, magically healed, knitted closed, gone, or no longer impairing.',
    '- TrackerUpdateEngine must not treat a requested, intended, commanded, allowed, promised, predicted, or pending attempted action as an established wound/status/condition change. "I tell him to hit my arm hard enough to bruise it", "I stab him", or "I let the blow land" is not woundsAdd/statusAdd/condition by itself. "My arm is already bruised", "his arm is bleeding", or "I am poisoned" is.',
    '- TrackerUpdateEngine must track only current lasting injuries/status. Do not track momentary pain, impact, a hit landing, being knocked back/down, being winded, losing breath, flinching, staggering, or temporary shock unless the text explicitly establishes an ongoing bruise, cut, bleeding, sprain, break, fracture, poison, sickness, restraint, exhaustion, unconsciousness, or similar continuing state.',
    '- TrackerUpdateEngine NPC revealedName is identity tracking only. If final narration explicitly reveals that an already tracked generic NPC/person/role is actually named something, set NPC to the existing tracker label and revealedName to the revealed proper name. Example: tracked NPC "bystander" says "Torvinash." as an introduction -> NPC=bystander and revealedName=Torvinash. Use revealedName only when the narration semantically identifies which tracked generic NPC received the name; if multiple possible generic NPCs exist and identity is unclear, use (none).',
    '- TrackerUpdateEngine NPC personalitySummary is optional stable personality memory. If this is the first meaningful tracking of an NPC or the existing personalitySummary is empty, assign a compact natural-language personality seed when card/lore/scenario/context or visible behavior supports one. Use internal glossary patterns only as behavior guidance; never output raw internal labels such as deredere, tsundere, yandere, kuudere, dandere, himedere, oujidere, kamidere, mayadere, sadodere, hiyakasudere, hajidere, bakadere, erodere, dorodere, shundere, undere, goudere, kanedere, or byoukidere. Preferred format: temperament: ...; speech: ...; interaction: ...; mannerism: ...; intensity:low|medium|high. Speech and interaction should carry most uniqueness. Mannerism is one optional flexible, scene-valid habit, not a fixed gesture, prop, location, or mandatory repeated beat. If personalitySummary already exists, use unchanged unless durable context clearly contradicts or refines it. Do not write mood, temporary emotion, injuries, relationship state, attraction, fear/hostility level, or what happened this turn.',
    'PERSONALITY_ARCHETYPE_GLOSSARY:',
    PERSONALITY_ARCHETYPE_GLOSSARY,
    '- If TrackerUpdateEngine.NPC.count > 0, every NPC[index] entry must include NPC, revealedName, personalitySummary, condition, woundsAdd, woundsRemove, statusAdd, statusRemove, gearAdd, and gearRemove.',
    '- TrackerUpdateEngine NPC entries are only for NPCs with explicit condition, wound, status, visible gear, or stable personalitySummary changes in this turn. NPC inventory is not tracked. If none, output TrackerUpdateEngine.NPC.count=0 and no NPC[index] lines.',
    '- PowerActorEnmity is hidden power-actor memory. First assess power candidates semantically, not by keyword/title. A power actor is any entity with credible means to affect {{user}} beyond acting alone in the moment: money, influence, authority, status, agents, staff, hired help, resources, institution/faction access, reputation, information, territory, magic, command, leverage, social reach, ownership, public prominence, or recurring access. Explicit prominence, wealth, rank, office, ownership, command, fame, backing, network access, unusual resources, or a role that plausibly controls access/services/people is enough for a Y assessment unless context clearly limits them to ordinary personal reaction. Ordinary people with only personal reaction are not power actors even if they have a job title.',
    '- PowerActorEnmity.assessments is audit-only diagnosis. Include one assessment for each meaningful ResolutionEngine.identifyTargets.PowerActors entry and for every current-scene or active-card candidate whose possible reach should be auditable: the active character/card actor, named scene NPCs, target/observer NPCs, and any affected organization/group when context gives credible reach beyond personal action. Do this even when PowerActorEnmity.effects count is 0. Assessment never creates enmity by itself and never replaces RelationshipEngine. If a living NPC appears in a normal target/observer list, still create the required RelationshipEngine entry even when isPowerActor=Y.',
    '- PowerActorEnmity effects are only for the latest user input and immediate visible context. Add an entry only if the user meaningfully thwarts, exposes, harms assets of, steals from, publicly humiliates, helps an enemy of, disrupts an operation of, kills/captures people of, or damages reputation/income of a power actor AND the actor is present, witnesses it, is informed, or has a concrete ordinary discovery/attribution path to {{user}}. Offscreen asset harm with no witness, report, evidence, confession, attribution, or discovery path creates no enmity this turn. If the affected party lacks reach, hasReach=N and severity=none. If the actor cannot plausibly know or discover it, knownToActor=N and deterministic code will not increase enmity.',
    '- PowerActorEnmity severity: minor=small obstruction or insult; meaningful=real setback, exposure, loss, asset harm, or operation disruption; major=severe public exposure, major defeat, major theft, death/capture of members, ruined operation, or serious reputation/income damage. If none, output count=0.',
    '- PowerEventShape is hidden pending pressure shaping. Use it only when the Power actor snapshot contains a pendingEvent. If no pending event exists, output PowerEventShape.count=0. For each pending event, decide if it fits the current scene now. fit=use_now only when it can enter naturally through visible scene logic without forcing {{user}} action or revealing hidden motives. fit=defer when the current scene cannot naturally support it yet. fit=drop only if it is impossible or would contradict visible facts. visibleInstruction must be narrator-safe surface instruction only: describe what visibly happens or what an ordinary NPC/contact does, not why. Never include the words spy, agent, infiltrator, sponsor, handler, hidden motive, hidden allegiance, secret orders, betrayal, plant, or covert operative in visibleInstruction. For plant_contact, use the provided contactName when available and describe only an ordinary plausible introduction, role, offer, request, trade, work, travel, help, rumor, or social contact. For agent_* events, use the activeAgent name as an ordinary established NPC and describe only the visible action/suggestion/setback.',
    '- Companion/ally commands are tactical requests only. They can address the companion as an ActionTarget and can refer to an established hostile by name for later companion crisis targeting, but they must not be treated as {{user}} making the companion act, must not force a companion attack, and must not create a user-resolved success/failure roll for companion obedience. The named hostile must still be established through assistant narration/tracker/card/scenario/lore/initial test setup and belongs in hostilesInScene.NPC unless it directly opposes {{user}}\'s current action. If several hostiles exist and no specific one is named, do not guess a target.',
    '- Do not output primaryOppTarget or primaryOpposition. The only opposing living target list is identifyTargets.OppTargets.NPC; the separate broad hostile pool is identifyTargets.hostilesInScene.NPC.',
    '- If you cannot find explicit evidence, use the engine default for that line; never invent missing facts.',
].join('\n');

const COMPACT_LEDGER_TEMPLATE = `BEGIN_SEMANTIC_PREFLIGHT
ResolutionEngine.identifyGoal=Normal_Interaction
ResolutionEngine.identifyChallenge=Normal_Interaction
ResolutionEngine.explicitMeans=(none)
ResolutionEngine.userAbilityUse.Used=N
ResolutionEngine.userAbilityUse.Attempted=N
ResolutionEngine.userAbilityUse.Available=N
ResolutionEngine.userAbilityUse.AbilityName=(none)
ResolutionEngine.userAbilityUse.Evidence=(none)
ResolutionEngine.userAbilityUse.NarrativeEffect=(none)
ResolutionEngine.userAbilityUse.NoEffectReason=(none)
ResolutionEngine.userAbilityUse.MechanicalScope=flavor_only_no_bonus
ResolutionEngine.itemUse.Attempted=N
ResolutionEngine.itemUse.Available=N
ResolutionEngine.itemUse.Item=(none)
ResolutionEngine.itemUse.Source=none
ResolutionEngine.itemUse.Evidence=(none)
ResolutionEngine.itemUse.NoEffectReason=(none)
ResolutionEngine.claimCheck.Present=N
ResolutionEngine.claimCheck.Claim=(none)
ResolutionEngine.claimCheck.TargetNPC=(none)
ResolutionEngine.claimCheck.TruthStatus=none
ResolutionEngine.claimCheck.NPCAccess=none
ResolutionEngine.claimCheck.StakesImpact=N
ResolutionEngine.claimCheck.Reason=(none)
ResolutionEngine.identifyTargets.hostilesInScene.NPC=(none)
ResolutionEngine.identifyTargets.ActionTargets=(none)
ResolutionEngine.identifyTargets.OppTargets.NPC=(none)
ResolutionEngine.identifyTargets.OppTargets.ENV=(none)
ResolutionEngine.identifyTargets.BenefitedObservers=(none)
ResolutionEngine.identifyTargets.HarmedObservers=(none)
ResolutionEngine.identifyTargets.NPCAwareOfUser=(none)
ResolutionEngine.identifyTargets.PowerActors=(none)
ResolutionEngine.intimacyAdvanceExplicit=N
ResolutionEngine.boundaryViolationExplicit=N
ResolutionEngine.nonLethal=N
ResolutionEngine.rollNeeded=N
ResolutionEngine.rollReason=(none)
ResolutionEngine.actionBucket=None
ResolutionEngine.socialBucket=None
ResolutionEngine.combatType=None
ResolutionEngine.actionCount=a1
ResolutionEngine.actionUnits.count=1
ResolutionEngine.actionUnits[0].id=A1
ResolutionEngine.actionUnits[0].action={{user}} takes the latest explicit action.
ResolutionEngine.actionUnits[0].evidence=(none)
ResolutionEngine.environmentDifficultyTier=none
ResolutionEngine.classifyHostilePhysicalIntent=N
ResolutionEngine.activeHostileThreat=N
ResolutionEngine.classifyPhysicalBoundaryPressure=N
ResolutionEngine.genStats.Rank=none
ResolutionEngine.genStats.MainStat=none
RelationshipEngine.count=0
UserKnowledgeApplication.count=0
UserKnowledgeApplication[0].target=(none)
UserKnowledgeApplication[0].entryIds=(none)
UserKnowledgeApplication[0].type=personalKnowledge
UserKnowledgeApplication[0].knownBy=(none)
UserKnowledgeApplication[0].scope=private
UserKnowledgeApplication[0].valence=none
UserKnowledgeApplication[0].effect=none
UserKnowledgeApplication[0].line=(none)
UserKnowledgeApplication[0].reason=(none)
InjuryEffectEngine.count=0
TrackerUpdateEngine.User.condition=unchanged
TrackerUpdateEngine.User.woundsAdd=(none)
TrackerUpdateEngine.User.woundsRemove=(none)
TrackerUpdateEngine.User.statusAdd=(none)
TrackerUpdateEngine.User.statusRemove=(none)
TrackerUpdateEngine.User.gearAdd=(none)
TrackerUpdateEngine.User.gearRemove=(none)
TrackerUpdateEngine.User.inventoryAdd=(none)
TrackerUpdateEngine.User.inventoryRemove=(none)
TrackerUpdateEngine.User.tasksAdd=(none)
TrackerUpdateEngine.User.tasksRemove=(none)
TrackerUpdateEngine.User.commitmentsAdd=(none)
TrackerUpdateEngine.User.commitmentsRemove=(none)
TrackerUpdateEngine.NPC.count=0
TrackerUpdateEngine.NPC[0].NPC=(none)
TrackerUpdateEngine.NPC[0].revealedName=(none)
TrackerUpdateEngine.NPC[0].personalitySummary=unchanged
TrackerUpdateEngine.NPC[0].condition=unchanged
TrackerUpdateEngine.NPC[0].woundsAdd=(none)
TrackerUpdateEngine.NPC[0].woundsRemove=(none)
TrackerUpdateEngine.NPC[0].statusAdd=(none)
TrackerUpdateEngine.NPC[0].statusRemove=(none)
TrackerUpdateEngine.NPC[0].gearAdd=(none)
TrackerUpdateEngine.NPC[0].gearRemove=(none)
PowerActorAssessment.count=0
PowerActorAssessment[0].actor=(none)
PowerActorAssessment[0].scope=unknown
PowerActorAssessment[0].isPowerActor=N
PowerActorAssessment[0].actorType=(none)
PowerActorAssessment[0].reach=(none)
PowerActorAssessment[0].evidence=(none)
PowerActorAssessment[0].assessmentReason=(none)
PowerActorEnmity.count=0
PowerActorEnmity[0].actor=(none)
PowerActorEnmity[0].actorType=(none)
PowerActorEnmity[0].hasReach=N
PowerActorEnmity[0].effect=none
PowerActorEnmity[0].severity=none
PowerActorEnmity[0].reason=(none)
PowerActorEnmity[0].knownToActor=N
PowerEventShape.count=0
PowerEventShape[0].eventId=(none)
PowerEventShape[0].actor=(none)
PowerEventShape[0].eventType=none
PowerEventShape[0].fit=none
PowerEventShape[0].visibleInstruction=(none)
PowerEventShape[0].contactName=(none)
PowerEventShape[0].contactGender=none
PowerEventShape[0].surfaceRole=(none)
PowerEventShape[0].deferReason=(none)
CHAOS_INTERRUPT.sceneSummary=short scene summary
END_SEMANTIC_PREFLIGHT
${SEMANTIC_PREFLIGHT_STOP_SENTINEL}`;

function getPersonaIdentityHints(context) {
    const fields = getCharacterCardFields(context);
    const persona = String(fields.persona ?? '').trim();
    const hints = [];
    const add = value => {
        const text = cleanScalar(value);
        if (!text || isNoneValue(text)) return;
        if (text.length < 2 || text.length > 40) return;
        const key = text.toLowerCase();
        if (hints.some(item => item.toLowerCase() === key)) return;
        hints.push(text);
    };

    add(context?.name1);
    const patterns = [
        /\bName\s*[:=]\s*([^\n\r|#*]+)/i,
        /\bYou\s+are\s+(?:\*\*)?([A-Z][A-Za-z' -]{1,38})(?:\*\*)?\b/,
        /\bYou\s+are\s+(?:an?|the)\s+([A-Z][A-Za-z' -]{1,38})\b/,
    ];
    for (const pattern of patterns) {
        const match = persona.match(pattern);
        if (match?.[1]) add(match[1].replace(/\s+[-–—].*$/, ''));
    }
    return hints.slice(0, 5);
}

function buildSemanticPrompt(context, coreChat, type, trackerSnapshot, playerTrackerSnapshot = {}, options = {}) {
    const chatContext = formatChatContext(coreChat);
    const userName = context.name1 || 'User';
    const charName = context.name2 || 'Assistant';
    const cardContext = formatCardContext(context);
    const compactTemplate = semanticCompactTemplateForOptions(options);

    return [
        {
            role: 'system',
            content: `Engine reference:\n${ENGINE_PROMPT_TEXT}`,
        },
        {
            role: 'system',
            content:
                'Explicit character/persona context from SillyTavern getCharacterCardFields(). ' +
                'Use it for explicit-only stats, presets, portrayal, and relationship flags. ' +
                'If a stat is not explicit here or in chat/tracker, use the engine default/fallback.\n' +
                cardContext,
        },
        {
            role: 'system',
            content:
                `Recent chat context, newest last:\n${chatContext}`,
        },
        {
            role: 'system',
            content:
                buildSemanticContractText(userName, charName, type, trackerSnapshot, playerTrackerSnapshot, options),
        },
        {
            role: 'user',
            content:
                `MANDATORY OUTPUT CONTRACT: Return one compact ledger block with these exact field names, then ${SEMANTIC_PREFLIGHT_STOP_SENTINEL} on its own final line. Do not output anything before BEGIN_SEMANTIC_PREFLIGHT or after ${SEMANTIC_PREFLIGHT_STOP_SENTINEL}. Your first visible output token must be BEGIN_SEMANTIC_PREFLIGHT.\n` +
                compactTemplate,
        },
    ];
}

function buildSemanticPromptFromAssembledChat(context, assembledChat, type, trackerSnapshot, playerTrackerSnapshot = {}, options = {}) {
    const userName = context.name1 || 'User';
    const charName = context.name2 || 'Assistant';
    const assembledMessages = normalizeAssembledPromptMessages(assembledChat);
    const compactTemplate = semanticCompactTemplateForOptions(options);

    return [
        {
            role: 'system',
            content: `Engine reference:\n${ENGINE_PROMPT_TEXT}`,
        },
        {
            role: 'system',
            content:
                'The following messages are the fully assembled SillyTavern prompt for the pending narration pass. ' +
                'They include the active preset, character card, persona, scenario, lore/world info, depth prompts, and visible chat history that fit the current ST context budget. ' +
                'Use them only as context for semantic extraction. Do not answer, continue, or narrate these messages.',
        },
        ...assembledMessages,
        {
            role: 'system',
            content: buildSemanticContractText(userName, charName, type, trackerSnapshot, playerTrackerSnapshot, options),
        },
        {
            role: 'user',
            content:
                `MANDATORY OUTPUT CONTRACT: Return one compact ledger block with these exact field names, then ${SEMANTIC_PREFLIGHT_STOP_SENTINEL} on its own final line. Do not output anything before BEGIN_SEMANTIC_PREFLIGHT or after ${SEMANTIC_PREFLIGHT_STOP_SENTINEL}. Your first visible output token must be BEGIN_SEMANTIC_PREFLIGHT.\n` +
                compactTemplate,
        },
    ];
}

function semanticCompactTemplateForOptions(options = {}) {
    return COMPACT_LEDGER_TEMPLATE;
}

function buildSemanticContractText(userName, charName, type, trackerSnapshot, playerTrackerSnapshot = {}, options = {}) {
    const proxyAction = options?.userInputMode === 'proxy'
        ? String(options?.proxyUserAction || '').trim()
        : '';
    const powerActorSnapshot = sanitizePowerActorSnapshotForSemantic(options?.powerActorSnapshot || {});
    const userKnowledgeSnapshot = sanitizeUserKnowledgeSnapshotForSemantic(options?.userKnowledgeSnapshot || {});
    const dispositionContinuityContext = buildDispositionContinuityContext(trackerSnapshot);
    return `Active names: user=${userName}, character=${charName}\nGeneration type=${type || 'normal'}\nNPC tracker snapshot JSON:\n${JSON.stringify(trackerSnapshot, null, 2)}\nPlayer tracker snapshot JSON:\n${JSON.stringify(playerTrackerSnapshot, null, 2)}\n\n` +
        `Disposition continuity context (plain-language tracker state for rollNeeded and social buckets; use this to decide whether a current NPC reaction or negative social contest is already settled):\n${dispositionContinuityContext}\n\n` +
        `Power actor snapshot JSON (hidden strategic memory; use only for PowerEventShape and PowerActorEnmity, never visible tracker text):\n${JSON.stringify(powerActorSnapshot, null, 2)}\n\n` +
        `User knowledge snapshot JSON (hidden memory about what people may know about {{user}}; use only for UserKnowledgeApplication and initPreset reputation tags, never visible tracker text):\n${JSON.stringify(userKnowledgeSnapshot, null, 2)}\n\n` +
        'You are the semantic extraction pass for a SillyTavern roleplay rules extension. ' +
        'The output contract is mandatory and non-negotiable: return exactly one compact preflight ledger block matching the supplied engine-name-anchored lines. ' +
        'Any response that renames fields, returns JSON, returns prose, returns markdown fences, returns an empty block, or leaves required lines missing is completely invalid and will be discarded. ' +
        'Do not narrate. Do not roll dice. Do not calculate outcomes. ' +
        (proxyAction ? `The latest user message used double square brackets for proxy action mode. Treat the inner instruction as {{user}}'s actual attempted action for semantic classification: "${clip(proxyAction, 800)}". Ignore the wrapper brackets themselves. ` : '') +
        'Classify only contextual/semantic predicates needed by the engines. Use EXPLICIT-ONLY and FIRST-YES-WINS from the engine reference. ' +
        'The semantic/contextual fields you return are authoritative; the deterministic runner should not reinterpret them. ' +
        'rollNeeded is the sole semantic roll gate and directly applies DEF.STAKES. Return rollNeeded=true only for fresh unresolved stakes: success/failure would materially change risk, harm, danger, detection, resources, trust/status/authority, autonomy/freedom, access, secrets, combat, pursuit, restraint, deception, bargaining, environmental obstacles, or explicit goal advancement. Return rollNeeded=false when there are no material stakes, when the only relevant NPC reaction is already settled by saved fear/terror, hostility/hatred, or persisted intimacy boundary, or when the latest input repeats a resolved same-bucket negative social attempt against the same NPC/goal under unchanged disposition. Still return true for separate combat, pursuit, restraint, theft, bargaining, new deception, access, resources, secrets, environmental obstacles, or new material pressure. Failed/resolved Bluff blocks repeated Bluff; failed/resolved Intimidate blocks repeated Intimidate. Bluff does not block a later Intimidate, and Intimidate does not block a later Bluff. Do not treat repeated same-bucket threats, stronger insults, rephrased same-bucket bluffs, renewed same-bucket coercion, or dramatic display after refusal/failure as a fresh social contest. rollReason must be a concise explanation that agrees with rollNeeded: rollNeeded=true requires fresh unresolved stakes, and rollNeeded=false requires no fresh unresolved stakes. ' +
        'Living/non-living target separation is mandatory: hostilesInScene.NPC, ActionTargets, OppTargets.NPC, BenefitedObservers, HarmedObservers, NPCAwareOfUser, RelationshipEngine NPC entries, and NPCInScene candidates are living entities only. OppTargets.ENV is only for a non-living obstacle, hazard, terrain feature, object, ward, weather condition, or environmental pressure that directly obstructs or resists {{user}}\'s current stakes-bearing action. A non-living object merely being acted on, damaged, taken, read, or moved is not a scene target by itself. PowerActors is strategic-only and can contain organizations/groups/institutions or potential power figures with credible means to affect {{user}} beyond acting alone in the moment; it never creates immediate rolls, NPCInScene, RelationshipEngine, B/F/H, injuries, or visible tracker entries by itself. ' +
        'Execute target identification in this order: first identify hostilesInScene.NPC as ALL established, present, living hostile entities in scene; then identify ActionTargets as every living NPC the latest user input directly addresses, speaks to, answers, asks, thanks, reassures, requests, warns, commands, helps, treats, touches, accompanies, follows, trades with, gives something to, receives something from, attacks, restrains, deceives, negotiates with, or otherwise directly interacts with this turn, whether rollNeeded is true or false; then identify NPCAwareOfUser as each individual living NPC who is present and directly notices, looks at, addresses, gestures to, reacts to, or otherwise individually interacts with {{user}}; then identify which targets, if any, directly oppose {{user}}\'s current action as OppTargets.NPC. ActionTargets are the broad direct interaction list and are not limited to stakes-bearing actions. If the latest user input directly involves a living NPC, that NPC belongs in ActionTargets even when the scene is ordinary continuity and OppTargets.NPC is ["(none)"]. NPCAwareOfUser is individual-only: include an innkeeper who looks at {{user}}, but exclude patrons/crowds/groups/factions, unnamed plural background NPCs, inferred listeners, offscreen entities, and generic bystanders. Do not include bystanders, background crowds, inferred listeners, offscreen entities, or hostilesInScene-only NPCs in ActionTargets unless the latest user input directly involves them. hostilesInScene.NPC is a broad hostile pool and does not itself create relationship changes, rolls, NPCInScene entries, or OppTargets.NPC. A hostile is established only if present in assistant narration, tracker, character/scenario/lore context, or the initial test setup; do not create hostiles from the latest user input alone. Exclude friendly/neutral NPCs, absent/offscreen entities, incapacitated/dead enemies no longer posing danger, and non-living hazards/obstacles. Companion/ally commands are tactical requests only: they may address the companion as an ActionTarget and may name an established hostile for later companion crisis targeting, but do not treat the command as {{user}} making the companion act, do not force a companion attack, and do not create a user-resolved success/failure roll for companion obedience. If several hostiles exist and no specific hostile is named, do not guess. ' +
        'OppTargets.NPC is only for rollNeeded=true living opposition/resistance/contest against {{user}}\'s current action/challenge: directly opposing, contesting, resisting, blocking, defending against, or being attacked/challenged by {{user}}. If rollNeeded=false, OppTargets.NPC must be ["(none)"]. If a living ActionTarget meaningfully resists/opposes a rollNeeded action, that same NPC may also appear in OppTargets.NPC. Do not put every enemy in OppTargets.NPC merely because they are hostile; use hostilesInScene.NPC for the broader hostile pool. ' +
        'BenefitedObservers and HarmedObservers are living entities present in scene who are NOT already in ActionTargets or OppTargets.NPC. Do not put a direct target or opposing NPC in observer lists. ' +
        'Identify ResolutionEngine.identifyTargets.PowerActors during target discovery: include any organization, institution, faction, crew, noble house, office, company, gang, cult, guild, military unit, recurring party/group, or potential power figure with credible means to affect {{user}} beyond acting alone in the moment: money, influence, authority, status, agents, staff, hired help, resources, institution/faction access, reputation, information, territory, magic, command, leverage, social reach, ownership, public prominence, or recurring access. Assess semantically, not by keywords or titles. A living NPC can appear in HarmedObservers/BenefitedObservers/ActionTargets/OppTargets.NPC/NPCAwareOfUser for personal B/F/H and also appear in PowerActors for hidden strategic consequences. PowerActors never replace normal target/observer/awareness placement. ' +
        'Create one relationshipEngine entry for each living NPC in ActionTargets, OppTargets.NPC, BenefitedObservers, HarmedObservers, or NPCAwareOfUser. This coverage is mandatory even when that same NPC is also in PowerActors or assessed as a PowerActorEnmity power actor. PowerActors and PowerActorEnmity never replace RelationshipEngine. Do not create entries for bystanders, hostilesInScene-only NPCs, PowerActors-only entities, groups/crowds, or inferred scene participants outside those target/observer/awareness lists. ' +
        'For each living NPC in relationshipEngine, stakeChangeByOutcome must describe that NPC stakes change for each outcome: benefit means their stakes improve, harm means their stakes worsen, none means no meaningful stake change. For explicit boundary violations toward a direct/opposing NPC target, successful or landed outcomes worsen that NPC boundary/autonomy/trust stakes, so use harm and not none. ' +
        'If a named NPC is a primary target and tracker currentCoreStats are missing, generate that NPC stat seed from explicit portrayal and copy the same Rank/MainStat seed into ResolutionEngine genStats and the matching RelationshipEngine genStats. ' +
        'Do not leave a named portrayed NPC as Rank none/MainStat none unless the card, scene, and tracker give no explicit portrayal at all. ' +
        'Apply stored user knowledge before RelationshipEngine initPreset. Fill UserKnowledgeApplication from the hidden User knowledge snapshot only when a stored personal or reputation entry plausibly applies to a present NPC/group or to the current scene. Personal knowledge applies only to the named knownBy NPC/group or a direct institutional/group match. Reputation knowledge applies only when scope and context plausibly reach the present NPC/group: private is not public; local is current settlement/scene community; route follows a road/trade/travel corridor; faction follows that group/institution; regional is broad area; legendary is widely known. effect=priorUserGoodRep for favorable or trust-normalizing reputation that should initialize trust, userBadRep for hostile/distrusting reputation, userNonHuman for fearsome/dangerous reputation that should initialize fear, contextOnly for knowledge that informs narration but should not initialize B/F/H, and none when no current application exists. Do not invent new reputation here; creation happens only in post-narration UserKnowledgeLedger. ' +
        'Detect user ability/spell attempts before target/risk classification: compare the latest user input against active {{user}}/persona abilities and spells, including the # ABILITIES and # SPELLS character sheet sections, assembled SillyTavern prompt stack, character persona/sheet, scenario, lore/world info, and chat context. Mark ResolutionEngine.userAbilityUse.Attempted=Y when the input explicitly names an ability/spell or implicitly describes attempting one through trigger, delivery method, or desired effect. Private delivery phrasing such as "meant only for X", "only X can hear", "whisper so only X hears", "send the words directly/private to X", or "speak into X alone" should match a persona ability/spell whose effect privately carries speech, sound, thought, or message to a target, even if the ability/spell name is not said. Mark Available=Y only if the attempted ability/spell exists in active {{user}} abilities or spells. Mark Used=Y only when Attempted=Y and Available=Y. Use the exact persona ability/spell name when available; otherwise name the attempted ability/effect concisely. Evidence is the user wording that signals the attempt. NarrativeEffect is the direct in-world effect the narrator must preserve when available, or the attempted effect that must not occur when unavailable. If Attempted=Y and Available=N, set NoEffectReason to why no ability/spell effect occurs. MechanicalScope must always be flavor_only_no_bonus: ability/spell use is fictional permission/method only, never a bonus, never a dice modifier, never a separate roll, and never a bypass for broader stakes or outcomes. If an available ability/spell is used to deliver a threat, persuasion, attack, escape, healing, or other contested goal, classify and roll the broader goal normally while keeping the ability/spell as delivery/flavor. ' +
        'Detect personal gear/inventory item attempts before target/risk classification. Fill ResolutionEngine.itemUse only when {{user}} attempts to use, draw, wield, consume, spend, present, unlock with, attack with, defend with, produce, retrieve, or otherwise rely on an item as {{user}}\'s own personal equipment, gear, or inventory already carried before the latest input. Personal carried-item signals include "my X", "from my belt", "from my pocket", "from my pack", "from my bag", "from my pouch", "from my sheath", "from my holster", "I draw X", "I produce X", "I retrieve X", or equivalent wording that claims {{user}} already has the item on their person or in carried inventory. Mark Available=Y only when that exact attempted personal item is already listed in {{user}} gear or inventory before the latest user input; use Source=gear or Source=inventory. The latest user input cannot create possession, carried state, equipment, inventory, or evidence of availability. Mark Available=N and Source=unavailable when the personal item is unsupported, absent, too specific for the listed inventory item, or only asserted by the latest user wording. Mark Attempted=N for ordinary interaction with environmental, scene, or NPC-offered objects, including grabbing, taking, picking up, receiving, finding, searching for, using, breaking, burning, throwing, or moving an object from a table, floor, ground, counter, shelf, corpse, display, container, NPC hand, offered transfer, or any other scene source; those actions remain normal narration/stakes/ENV context, not itemUse. Examples: "I draw my sword" -> Attempted=Y; "I pull my phone from my pocket" -> Attempted=Y; "I grab the sword from the table" -> Attempted=N; "Alice hands me a key and I take it" -> Attempted=N. Do not infer personal item availability from setting likelihood. If Available=N, the personal item effect must not be treated as completed. ' +
        'Detect stakes-bearing factual claims before target/risk classification. Fill ResolutionEngine.claimCheck when {{user}} makes a factual claim to a specific NPC that could materially affect that NPC choice, trust, access, resources, authority, safety, emotional vulnerability, or immediate stakes. Compare the claim against established persona, tracker, chat, card, lore, scenario, and prompt-stack facts. Mark known_true only when explicitly supported, known_false only when explicitly contradicted, unsupported when material but not established, unknown when context cannot judge, and none when no relevant claim exists. NPCAccess is how much the target NPC can naturally verify or know the claim; it caps certainty but does not require omniscience. If a known_false or unsupported claim has StakesImpact=Y, classify it as social claim/deception against that living target and use CHA vs MND. Keep harmless or no-stakes claims as Present=N or StakesImpact=N. ' +
        'Mandatory engine execution order for this semantic pass: read the Engine reference above, then execute only the semantic/contextual portions of the engines. ' +
        'Execute ResolutionEngine(input) semantic functions in order: identifyGoal, identifyChallenge, userAbilityUse, itemUse, claimCheck, identifyTargets, classifyHostilePhysicalIntent, activeHostileThreat, classifyPhysicalBoundaryPressure, intimacyAdvanceExplicit, boundaryViolationExplicit, nonLethal, rollNeeded, rollReason, actionBucket, socialBucket, combatType, actionCount, actionUnits, environmentDifficultyTier, genStats. Copy those outputs into the ResolutionEngine lines using the exact function/key names shown in the template. ' +
        'Do not roll dice, retrieve user stats, retrieve NPC stats, assign numeric NPC stats, calculate margins, landed actions, counter potential, or outcomes; deterministic code handles those after your ledger. ' +
        'Execute UserKnowledgeApplication after target discovery and before RelationshipEngine. Read only the hidden User knowledge snapshot JSON and current context. Output one row for each knowledge entry that materially applies to the current scene, present NPC, or group; otherwise output count=0. This is application only: do not create, update, spread, or rewrite stored knowledge in preflight. ' +
        'Execute RelationshipEngine(npc, resolutionPacket) semantic functions in order for each target/observer/awareness living NPC: current state context, initPreset tag selection, auditInteraction/stakeChangeByOutcome, route context flags, checkThreshold override flags, establishedRelationship, slowBondEvidence, genStats. For initPreset, use all available context in the assembled SillyTavern prompt stack, character card, persona name/text, scenario, lore/world info, tracker snapshot, and chat history, but output only the semantic Y/N tags; deterministic code maps those tags to B/F/H. For checkThreshold override flags, also use all available context; mark CurrentInvitation when the NPC clearly offers, requests, invites, strongly implies, accepts, agrees to, arranges, or physically initiates sexual/intimate escalation with {{user}} in the current or immediately recent scene and has not withdrawn/refused/panicked/been interrupted. This includes the NPC accepting {{user}}\'s explicit sexual/intimate proposal, agreeing to join, inviting or calling another willing participant, or saying yes to coming over for sex/intimacy. Mark RomanticBuildup only when a B4 close-bond scene has consistently and mutually built toward romantic/intimate escalation with receptive NPC behavior, no active refusal/withdrawal/fear/hostility/coercion/danger/public interruption/boundary limit, and {{user}}\'s latest intimate advance is a natural continuation; ordinary friendliness, tenderness, warmth, one smile, casual flirting, vague chemistry, or user-only escalation is not enough. Mark Exploitation when explicit card/lore/history says the NPC is naive, easily led/persuaded, follows {{user}}\'s lead without question, dependent, trapped, coerced, powerless, unsafely sheltered, or otherwise exploitable by {{user}} or the current situation. Do not treat active combat/hostility as an initPreset by itself. Do not use establishedRelationship as an initPreset tag; establishedRelationship remains its separate relationship-state mechanic. Copy those outputs into the RelationshipEngine[index] lines using the exact function/key names shown in the template. ' +
        'Execute InjuryEffectEngine after ResolutionEngine and RelationshipEngine: identify only actual injury/status-effect candidates that the user action would cause if it lands. The semantic pass decides target, effectType, affected body/function, persistence, and whether it affects action from context; deterministic mechanics later decide whether it lands and the final impairment severity. Source does not matter: physical attacks, magic, poison, paralysis, fear/panic, restraint, disease, burns, lightning/electrical effects, curses, exhaustion, mental status, and other ongoing impairing effects all qualify when they would impair later action. Mere emotional/social harm, witnessing harm to someone else, fear as ordinary emotion without an impairing status, momentary pain, impact, knockdown, or a requested/intended future injury does not qualify. ' +
        'Then fill CHAOS_INTERRUPT.sceneSummary from its engine/contextual requirements. Name pools are deterministic runtime data and not part of this semantic pass; do not generate name candidates or output name fields. ' +
        'Execute PowerActorEnmity as hidden strategic consequence detection after RelationshipEngine. First fill PowerActorAssessment audit lines for all power candidates, whether or not an enmity effect exists: ResolutionEngine.identifyTargets.PowerActors, the active character/card actor when relevant, named scene NPCs with credible reach, target/observer NPCs with credible reach, and affected organizations/groups behind those NPCs. Assess semantically, not by keywords or titles. A power actor is any organization, institution, faction, crew, noble house, office, company, gang, cult, guild, military unit, recurring party/group, or potential power figure with credible means to affect {{user}} beyond acting alone in the moment: money, influence, authority, status, agents, staff, hired help, resources, institution/faction access, reputation, information, territory, magic, command, leverage, social reach, ownership, public prominence, or recurring access. Explicit prominence, wealth, rank, office, ownership, command, fame, backing, network access, unusual resources, or a role that plausibly controls access/services/people is enough for a Y assessment unless context clearly limits them to ordinary personal reaction. A prominent local figure should be assessed as a potential power actor because prominence implies reach, reputation, access, or influence; an ordinary person with no stated reach is not. PowerActorAssessment is audit-only and never creates enmity. Do not create power-actor enmity for ordinary individuals who can only personally react; they belong only in NPC B/F/H. Add a PowerActorEnmity entry only when the latest user input meaningfully thwarts, exposes, harms assets of, steals from, publicly humiliates, helps an enemy of, disrupts an operation of, kills/captures people of, or damages reputation/income of a power actor AND the actor is present, witnesses it, is informed, or has a concrete ordinary discovery/attribution path to {{user}}. Offscreen asset harm with no witness, report, evidence, confession, attribution, or discovery path creates no enmity this turn. Mark knownToActor=Y only for that concrete knowledge path. Use severity minor/meaningful/major; if no valid power actor effect exists, use count=0. This semantic section is hidden memory only, not visible tracker text. ' +
        'Execute PowerEventShape after PowerActorEnmity. Read the Power actor snapshot JSON for hidden pendingEvent and activeAgent state. If no pendingEvent exists, output PowerEventShape.count=0. If a pendingEvent exists, shape only that pending event into a compact visible scene instruction or defer/drop it. fit=use_now only when the event can enter the current scene naturally through visible circumstances, ordinary NPC behavior, available routes, messages, trouble, obstruction, or local consequences. fit=defer when scene fit is poor. fit=drop when it contradicts established visible facts. visibleInstruction is for the final narrator but must contain only surface facts. Do not include hidden explanation, sponsor/allegiance, motive labels, secret plan labels, or the words spy, agent, infiltrator, sponsor, handler, hidden motive, hidden allegiance, secret orders, betrayal, plant, or covert operative. For plant_contact, use the provided contactName when available and make the person look like an ordinary plausible scene contact; do not say why they are there. For agent_* events, refer to activeAgent by name as an ordinary established NPC and describe only the visible suggestion, report opportunity, delay, misdirection, or practical setback. ' +
        'Execute TrackerUpdateEngine as explicit-only persistent tracker deltas after RelationshipEngine. TrackerUpdateEngine is for display/state memory only, not outcome resolution. ' +
        'TrackerUpdateEngine.User records only explicit changes to the player condition, wounds, status effects, gear, inventory, tasks, and commitments. TrackerUpdateEngine.NPC records only explicit changes to tracked or directly affected NPC condition, wounds, status effects, visible gear, and concise stable personality summaries. NPC inventory is not tracked. ' +
        'Use condition=unchanged unless the latest user input or immediate visible context explicitly establishes a completed/current health state as healthy, bruised, wounded, badly_wounded, critical, incapacitated, or dead. Use incapacitated for explicit nonlethal outcomes where the character is alive but cannot meaningfully act. Do not set condition from a desired/requested future injury or from an attempted action before narration confirms the result. ' +
        'Use Add only for explicit gains/new injuries/new effects/new obligations. Use Remove only for explicit dropping, spending, losing, completing, canceling, failing, or abandoning. Remove wounds/status only when the text explicitly says the injury or status is healed, cured, recovered, restored, regenerated, magically healed, knitted closed, gone, or no longer impairing. Bandaging, splinting, dressing, cleaning, stitching, stabilizing, normal care, or starting treatment does not remove injuries unless the text also says the injury/status is gone, healed, cured, fully recovered, or no longer impairing. Never infer unchanged lists from silence and never output a full replacement list. ' +
        'Do not mark wounds/status/condition from requested, intended, commanded, allowed, promised, predicted, or pending attempted actions before deterministic resolution; only track state already explicit as current/completed in context. ' +
        'Do not track momentary pain, impact, knockdown, stagger, breath loss, winded reaction, or temporary shock as wounds/status/condition unless an ongoing injury or continuing status is explicitly stated. ' +
        'For TrackerUpdateEngine NPC revealedName, use semantic identity resolution: when final narration reveals that an existing tracked generic NPC/person/role is named, keep NPC as the existing tracker label and write revealedName as the proper name. This is for renaming generic entries such as bystander, man, stranger, guard, raider, or Unknown Woman once their name is revealed. If several tracked generic NPCs could match and the narration does not clearly identify which one, use (none). For NPC personalitySummary, use stable personality memory only. If this is first meaningful tracking or the current summary is empty, write a compact natural-language seed when explicit card/context or the scene reveals enduring temperament or interaction style. Use internal glossary patterns only as behavior guidance; never output raw internal labels such as deredere, tsundere, yandere, kuudere, dandere, himedere, oujidere, kamidere, mayadere, sadodere, hiyakasudere, hajidere, bakadere, erodere, dorodere, shundere, undere, goudere, kanedere, or byoukidere. Preferred format: temperament: ...; speech: ...; interaction: ...; mannerism: ...; intensity:low|medium|high. Speech and interaction should carry most uniqueness. Mannerism is one optional flexible, scene-valid habit, not a fixed gesture, prop, location, or repeated required beat. If an NPC already has a summary, leave unchanged unless durable evidence clearly refines it. Do not summarize mood, attraction, relationship score, fear/hostility, injuries, or temporary reactions. Personality internal pattern glossary: ' + PERSONALITY_ARCHETYPE_GLOSSARY.replace(/\n/g, ' ') + ' ' +
        'NPC proactivity cap is deterministic; do not output semantic lines for it. ' +
        'Tie rule override: exact roll ties are cinematic stalemates/struggles, not defender wins; include stakeChangeByOutcome.struggle accordingly. ' +
        'Do not use deterministic outcomes, dice, or guesses to change semantic stakes. ' +
        'itemUse is only for personal gear/inventory objects; body parts and natural weapons such as claws, fangs, teeth, horns, talons, tusks, tails, stingers, barbs, or jaws are bodily actions/attacks, not itemUse, not inventory, and not equipment. ' +
        'Important classification reminders: Romantic, flirtatious, affectionate, suggestive, sexual, or intimate conversation/contact is not a special roll category and does not create stakes by itself. intimacyAdvanceExplicit is strict permission/boundary classification for actual intimate escalation only: mark it true for explicit kissing, sexual touch, undressing toward intimacy, asking to sleep together/have sex, or accepting a prior explicit NPC intimacy invitation; keep it false for flirting, teasing, vague innuendo, compliments, declarations of love, dates, hand-holding, ordinary affection, or "what did you have in mind" style banter. boundaryViolationExplicit is the romance/boundary trigger for mechanics: mark it true only for clear coercion, threats, force, unwanted contact/restraint after refusal, repeated pressure after refusal, humiliation, blackmail, or ignoring a clear stop/no. User intent is explicit-only: identifyGoal and identifyChallenge must use only the latest user-declared action, request, target, and explicit objective; do not infer unstated goals from NPC fear, hostility, suspicion, likely reaction, context, or what an NPC might assume. Do not carry forward a prior social goal as the current goal after it already failed or resolved; post-failure phrases such as accepting refusal, declaring consequence, or escalating toward violence are aftermath/escalation unless the latest input explicitly creates a new non-social contest or a materially different tactic. classifyHostilePhysicalIntent is true only for direct bodily aggression/control against a living entity; object/space/departure/body-adjacent contests without bodily harm are classifyPhysicalBoundaryPressure, not combat. OppTargets.NPC requires a direct rollNeeded target, demand, threat, attack, coercion, restraint, deception, persuasion, negotiation, boundary pressure, or explicit objective. rollNeeded is the roll gate: use DEF.STAKES directly, do not roll the same settled disposition reaction again, and do not immediately retry the same failed/resolved negative social bucket against the same target for the same goal, but do roll separate combat, pursuit, restraint, theft, bargaining, materially new deception, access, resources, secrets, environmental obstacles, or new leverage. actionBucket is classification only: Social/Diplomacy for good-faith persuasion or negotiation, Social/Bluff for deception or material false claims, Social/Intimidate for threats/coercion/fear demands, Combat/Mundane for bodily/weapon/natural-weapon attacks, Combat/SpellOrSupernatural for primary spell/power attacks, Challenge for physical/environmental obstacles, stealth, escape, chase, locks, traps, terrain, weather, barriers, hazards, or non-living opposition. Do not choose stats, dice, bonuses, margins, or outcomes. For each living NPC, mark stakeChangeByOutcome for each possible outcome strictly by DEF.STAKES: benefit only if that outcome significantly and concretely improves their stakes; harm if it materially worsens their stakes; otherwise none. Do not mark benefit for compliments, flirting, mood improvement, politeness, ordinary conversation, user self-advancement, successful negotiation for the user, choosing not to harm the NPC, failing to harm the NPC, de-escalation without a concrete NPC gain, or the NPC merely surviving/remaining safe.\n\n' +
        COMPACT_LEDGER_CONTRACT;
}

function normalizeAssembledPromptMessages(assembledChat) {
    const rows = Array.isArray(assembledChat) ? assembledChat : [];
    return rows
        .map(message => {
            const role = ['system', 'user', 'assistant', 'tool'].includes(message?.role) ? message.role : 'system';
            const content = sanitizeAssembledContent(message?.content);
            if (isEmptyContent(content)) return null;
            return {
                role,
                content,
                ...(message?.name ? { name: message.name } : {}),
            };
        })
        .filter(Boolean);
}

function sanitizeAssembledContent(content) {
    if (typeof content === 'string') {
        return sanitizeSemanticAssembledText(content);
    }
    if (Array.isArray(content)) {
        return content.map(part => {
            if (part && typeof part === 'object' && typeof part.text === 'string') {
                return { ...part, text: sanitizeSemanticAssembledText(part.text) };
            }
            return part;
        }).filter(part => !isEmptyContent(part?.text ?? part));
    }
    return content;
}

export function sanitizeSemanticAssembledText(content) {
    return stripSemanticNarratorOnlyFunctionBlocks(stripStructuredDebug(content)).trim();
}

function stripSemanticNarratorOnlyFunctionBlocks(text) {
    let source = String(text ?? '');
    for (const blockName of SEMANTIC_NARRATOR_ONLY_FUNCTION_BLOCKS) {
        source = stripNamedFunctionBlock(source, blockName);
    }
    return source
        .replace(/[ \t]+\n/g, '\n')
        .replace(/\n{3,}/g, '\n\n');
}

function stripNamedFunctionBlock(text, functionName) {
    const source = String(text ?? '');
    const openerPattern = new RegExp(`(^|\\n)[ \\t]*function\\s+${escapeRegExp(functionName)}\\s*\\([^)]*\\)\\s*\\{[ \\t]*(?=\\r?\\n|$)`, 'g');
    let result = '';
    let cursor = 0;
    let match;

    while ((match = openerPattern.exec(source)) !== null) {
        const blockStart = match.index + (match[1] ? match[1].length : 0);
        const blockEnd = findBalancedFunctionBlockEnd(source, blockStart);
        if (blockEnd === null) {
            openerPattern.lastIndex = blockStart + 1;
            continue;
        }

        result += source.slice(cursor, blockStart);
        cursor = blockEnd;
        openerPattern.lastIndex = blockEnd;
    }

    return result + source.slice(cursor);
}

function findBalancedFunctionBlockEnd(text, startIndex) {
    const source = String(text ?? '');
    const openingBraceIndex = source.indexOf('{', startIndex);
    if (openingBraceIndex < 0) return null;

    let depth = 0;
    for (let index = openingBraceIndex; index < source.length; index += 1) {
        const pair = source.slice(index, index + 2);
        if (pair === '{{' || pair === '}}') {
            index += 1;
            continue;
        }

        const char = source[index];
        if (char === '{') {
            depth += 1;
        } else if (char === '}') {
            depth -= 1;
            if (depth === 0) {
                let end = index + 1;
                if (source[end] === '\r' && source[end + 1] === '\n') end += 2;
                else if (source[end] === '\n') end += 1;
                return end;
            }
            if (depth < 0) return null;
        }
    }

    return null;
}

function isEmptyContent(content) {
    if (content == null) return true;
    if (typeof content === 'string') return !content.trim();
    if (Array.isArray(content)) return content.length === 0;
    return false;
}

function formatCardContext(context) {
    const fields = getCharacterCardFields(context);

    const payload = {
        persona: clip(fields.persona, 1200),
        description: clip(fields.description, 2200),
        personality: clip(fields.personality, 1400),
        scenario: clip(fields.scenario, 1200),
        firstMessage: clip(fields.firstMessage, 1200),
        creatorNotes: clip(fields.creatorNotes, 900),
        charDepthPrompt: clip(fields.charDepthPrompt, 900),
    };

    return JSON.stringify(payload, null, 2);
}

function extractPersonaCoreStats(context) {
    const fields = getCharacterCardFields(context);
    const persona = String(fields.persona ?? '').trim();
    const parsed = parseCoreStatsBlock(persona);
    return parsed
        ? { Rank: 'none', MainStat: 'none', ...parsed }
        : null;
}

function getCharacterCardFields(context) {
    try {
        return typeof context.getCharacterCardFields === 'function' ? context.getCharacterCardFields() : {};
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
}

function parseCoreStatsBlock(text) {
    const source = String(text ?? '');
    if (!source.trim()) return null;

    const stats = {};
    for (const stat of ['PHY', 'MND', 'CHA']) {
        const match = source.match(new RegExp(`\\b${stat}\\s*[:=\\-]?\\s*(10|[1-9])\\b`, 'i'));
        if (!match) return null;
        stats[stat] = Number(match[1]);
    }

    return stats;
}

function formatChatContext(coreChat) {
    const rows = Array.isArray(coreChat) ? coreChat : [];
    const formatted = rows.map((message, index) => {
        const speaker = message?.is_user ? 'USER' : (message?.name || 'NPC');
        const text = clip(stripStructuredDebug(String(message?.mes ?? message?.message ?? message?.content ?? '')).trim(), 1200);
        return `${index + 1}. ${speaker}: ${text}`;
    });
    const newestFirst = [...formatted].reverse();
    const kept = [];
    let total = 0;

    for (const line of newestFirst) {
        const nextTotal = total + line.length + 1;
        if (kept.length && nextTotal > 12000) break;
        kept.push(line);
        total = nextTotal;
    }

    return kept.reverse().join('\n');
}

function clip(value, maxLength) {
    const text = String(value ?? '').trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}\n[truncated]`;
}

function stripStructuredDebug(text) {
    return String(text ?? '')
        .replace(/````text\s*&lt;pre_flight&gt;[\s\S]*?&lt;\/pre_flight&gt;\s*````\s*/g, '')
        .replace(/````text\s*<narrator_prompt_context_echo>[\s\S]*?<\/narrator_prompt_context_echo>\s*````\s*/g, '')
        .replace(/<pre_flight>[\s\S]*?<\/pre_flight>\s*/g, '')
        .replace(/<narrator_prompt_context_echo>[\s\S]*?<\/narrator_prompt_context_echo>\s*/g, '');
}

function parseSemanticLedger(raw, trackerSnapshot) {
    if (raw && typeof raw === 'object' && hasLedgerShape(raw)) return raw;
    const candidates = extractTextCandidates(raw);
    const errors = [];

    for (const text of candidates) {
        try {
            return parseLedgerText(text, trackerSnapshot);
        } catch (error) {
            errors.push(error instanceof Error ? error.message : String(error));
        }
    }

    throw new Error(`Semantic pass did not return a valid mandatory compact ledger. Candidates=${candidates.length}. Errors=${errors.slice(0, 4).join(' | ')}. RawPreview=${previewRaw(raw)}`);
}

function parseLedgerText(text, trackerSnapshot) {
    const sourceText = String(text ?? '').trim();
    if (!sourceText) throw new Error('empty response text');
    if (/```/.test(sourceText)) {
        throw new Error('markdown fences in semantic ledger are invalid');
    }
    if (/BEGIN_SEMANTIC_PREFLIGHT/i.test(sourceText)) {
        return parseCompactLedger(sourceText, trackerSnapshot);
    }
    if (sourceText.startsWith('{')) {
        return JSON.parse(extractJsonObject(sourceText));
    }
    if (sourceText.startsWith('"engineContext"')) {
        return JSON.parse(extractJsonObject(`{${sourceText}`));
    }

    throw new Error('missing mandatory compact ledger block');
}

function extractTextCandidates(raw) {
    const values = [];
    const seen = new Set();
    const add = value => {
        if (value == null) return;
        if (typeof value === 'string') {
            const text = value.trim();
            if (text && !seen.has(text)) {
                seen.add(text);
                values.push(text);
            }
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(add);
            return;
        }
        if (typeof value === 'object') {
            if (typeof value.text === 'string') add(value.text);
            if (typeof value.content === 'string') add(value.content);
            if (typeof value.reasoning === 'string') add(value.reasoning);
            if (typeof value.reasoning_content === 'string') add(value.reasoning_content);
            if (typeof value.reasoning_details === 'string') add(value.reasoning_details);
            if (typeof value.message === 'string') add(value.message);
            if (value.message && typeof value.message === 'object') add(value.message);
            if (value.delta && typeof value.delta === 'object') add(value.delta);
            if (value.output_text) add(value.output_text);
            if (value.response) add(value.response);
            if (value.choices) add(value.choices);
            if (value.content) add(value.content);
            if (value.output) add(value.output);
            if (value.data) add(value.data);
        }
    };

    add(raw);
    return values;
}

function previewRaw(raw) {
    try {
        return JSON.stringify(raw, (_key, value) => {
            if (typeof value === 'string') return value.slice(0, 600);
            return value;
        }).slice(0, 1200);
    } catch {
        return String(raw).slice(0, 1200);
    }
}

function hasLedgerShape(value) {
    return Boolean(value?.resolutionEngine && value?.relationshipEngine && value?.trackerUpdateEngine && value?.chaosSemantic);
}

function validateRawLedgerContract(ledger, raw) {
    const missing = [];
    if (!ledger?.engineContext) missing.push('engineContext');
    if (!Array.isArray(ledger?.engineContext?.trackerRelevantNPCs)) missing.push('engineContext.trackerRelevantNPCs');
    if (!ledger?.resolutionEngine) missing.push('resolutionEngine');
    if (!ledger?.resolutionEngine?.identifyGoal) missing.push('resolutionEngine.identifyGoal');
    if (!ledger?.resolutionEngine?.identifyChallenge) missing.push('resolutionEngine.identifyChallenge');
    if (!ledger?.resolutionEngine?.userAbilityUse) missing.push('resolutionEngine.userAbilityUse');
    if (typeof ledger?.resolutionEngine?.userAbilityUse?.used !== 'boolean') missing.push('resolutionEngine.userAbilityUse.used:boolean');
    if (typeof ledger?.resolutionEngine?.userAbilityUse?.attempted !== 'boolean') missing.push('resolutionEngine.userAbilityUse.attempted:boolean');
    if (typeof ledger?.resolutionEngine?.userAbilityUse?.available !== 'boolean') missing.push('resolutionEngine.userAbilityUse.available:boolean');
    if (!ledger?.resolutionEngine?.userAbilityUse?.mechanicalScope) missing.push('resolutionEngine.userAbilityUse.mechanicalScope');
    if (!ledger?.resolutionEngine?.itemUse) missing.push('resolutionEngine.itemUse');
    if (typeof ledger?.resolutionEngine?.itemUse?.attempted !== 'boolean') missing.push('resolutionEngine.itemUse.attempted:boolean');
    if (typeof ledger?.resolutionEngine?.itemUse?.available !== 'boolean') missing.push('resolutionEngine.itemUse.available:boolean');
    if (!ITEM_USE_SOURCES.includes(ledger?.resolutionEngine?.itemUse?.source)) missing.push('resolutionEngine.itemUse.source');
    if (!ledger?.resolutionEngine?.claimCheck) missing.push('resolutionEngine.claimCheck');
    if (typeof ledger?.resolutionEngine?.claimCheck?.present !== 'boolean') missing.push('resolutionEngine.claimCheck.present:boolean');
    if (typeof ledger?.resolutionEngine?.claimCheck?.stakesImpact !== 'boolean') missing.push('resolutionEngine.claimCheck.stakesImpact:boolean');
    if (!CLAIM_TRUTH_STATUSES.includes(ledger?.resolutionEngine?.claimCheck?.truthStatus)) missing.push('resolutionEngine.claimCheck.truthStatus');
    if (!CLAIM_NPC_ACCESS_LEVELS.includes(ledger?.resolutionEngine?.claimCheck?.npcAccess)) missing.push('resolutionEngine.claimCheck.npcAccess');
    if (!ledger?.resolutionEngine?.identifyTargets) missing.push('resolutionEngine.identifyTargets');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.hostilesInScene?.NPC)) missing.push('resolutionEngine.identifyTargets.hostilesInScene.NPC');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.ActionTargets)) missing.push('resolutionEngine.identifyTargets.ActionTargets');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.OppTargets?.NPC)) missing.push('resolutionEngine.identifyTargets.OppTargets.NPC');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.OppTargets?.ENV)) missing.push('resolutionEngine.identifyTargets.OppTargets.ENV');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.BenefitedObservers)) missing.push('resolutionEngine.identifyTargets.BenefitedObservers');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.HarmedObservers)) missing.push('resolutionEngine.identifyTargets.HarmedObservers');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.NPCAwareOfUser)) missing.push('resolutionEngine.identifyTargets.NPCAwareOfUser');
    if (ledger?.resolutionEngine?.identifyTargets?.PowerActors != null && !Array.isArray(ledger.resolutionEngine.identifyTargets.PowerActors)) missing.push('resolutionEngine.identifyTargets.PowerActors');
    if (typeof ledger?.resolutionEngine?.rollNeeded !== 'boolean') missing.push('resolutionEngine.rollNeeded:boolean');
    if (!ledger?.resolutionEngine?.rollReason) missing.push('resolutionEngine.rollReason');
    if (!ACTION_BUCKETS.includes(ledger?.resolutionEngine?.actionBucket)) missing.push('resolutionEngine.actionBucket');
    if (!SOCIAL_BUCKETS.includes(ledger?.resolutionEngine?.socialBucket)) missing.push('resolutionEngine.socialBucket');
    if (!COMBAT_TYPES.includes(ledger?.resolutionEngine?.combatType)) missing.push('resolutionEngine.combatType');
    if (typeof ledger?.resolutionEngine?.nonLethal !== 'boolean') missing.push('resolutionEngine.nonLethal:boolean');
    if (!Array.isArray(ledger?.resolutionEngine?.actionCount)) missing.push('resolutionEngine.actionCount');
    if (!Array.isArray(ledger?.resolutionEngine?.actionUnits)) missing.push('resolutionEngine.actionUnits');
    if (!ENVIRONMENT_DIFFICULTY_TIERS.includes(ledger?.resolutionEngine?.environmentDifficultyTier)) missing.push('resolutionEngine.environmentDifficultyTier');
    if (typeof ledger?.resolutionEngine?.classifyHostilePhysicalIntent !== 'boolean') missing.push('resolutionEngine.classifyHostilePhysicalIntent:boolean');
    if (typeof ledger?.resolutionEngine?.activeHostileThreat !== 'boolean') missing.push('resolutionEngine.activeHostileThreat:boolean');
    if (typeof ledger?.resolutionEngine?.classifyPhysicalBoundaryPressure !== 'boolean') missing.push('resolutionEngine.classifyPhysicalBoundaryPressure:boolean');
    if (Object.prototype.hasOwnProperty.call(ledger?.resolutionEngine || {}, 'hostilePhysicalIntent')) missing.push('forbidden extra field resolutionEngine.hostilePhysicalIntent');
    if (Object.prototype.hasOwnProperty.call(ledger?.resolutionEngine || {}, 'primaryOppTarget')) missing.push('forbidden extra field resolutionEngine.primaryOppTarget');
    if (Object.prototype.hasOwnProperty.call(ledger?.resolutionEngine || {}, 'primaryOpposition')) missing.push('forbidden extra field resolutionEngine.primaryOpposition');
    if (!Array.isArray(ledger?.relationshipEngine)) missing.push('relationshipEngine');
    if (!ledger?.injuryEffectEngine) missing.push('injuryEffectEngine');
    if (!Array.isArray(ledger?.injuryEffectEngine?.effects)) missing.push('injuryEffectEngine.effects');
    if (!ledger?.userKnowledgeApplication) missing.push('userKnowledgeApplication');
    if (!Array.isArray(ledger?.userKnowledgeApplication?.applications)) missing.push('userKnowledgeApplication.applications');
    if (!ledger?.powerActorEnmity) missing.push('powerActorEnmity');
    if (!Array.isArray(ledger?.powerActorEnmity?.assessments)) missing.push('powerActorEnmity.assessments');
    if (!Array.isArray(ledger?.powerActorEnmity?.effects)) missing.push('powerActorEnmity.effects');
    if (!ledger?.powerEventShape) missing.push('powerEventShape');
    if (!Array.isArray(ledger?.powerEventShape?.events)) missing.push('powerEventShape.events');
    if (!ledger?.trackerUpdateEngine) missing.push('trackerUpdateEngine');
    if (!ledger?.trackerUpdateEngine?.user) missing.push('trackerUpdateEngine.user');
    if (!Array.isArray(ledger?.trackerUpdateEngine?.npcs)) missing.push('trackerUpdateEngine.npcs');
    if (!ledger?.chaosSemantic) missing.push('chaosSemantic');
    if (missing.length) {
        throw new Error(`Mandatory semantic ledger contract failed; response invalid. Missing/invalid fields (${missing.join(', ')}): ${extractTextCandidates(raw).join('\n').slice(0, 240)}`);
    }
}

function extractJsonObject(text) {
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end < start) {
        throw new Error(`Semantic pass did not return JSON: ${text.slice(0, 200)}`);
    }
    return text.slice(start, end + 1);
}

const STAKE_OUTCOME_KEYS = [
    'no_roll',
    'success',
    'failure',
    'dominant_impact',
    'solid_impact',
    'light_impact',
    'struggle',
    'checked',
    'deflected',
    'avoided',
];

function parseCompactLedger(text, trackerSnapshot) {
    const match = String(text).match(/BEGIN_SEMANTIC_PREFLIGHT([\s\S]*?)END_SEMANTIC_PREFLIGHT/i);
    if (!match) throw new Error('missing BEGIN_SEMANTIC_PREFLIGHT/END_SEMANTIC_PREFLIGHT block');

    const fields = new Map();
    for (const rawLine of match[1].split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || line.startsWith('//')) continue;
        const equals = line.indexOf('=');
        if (equals < 1) continue;
        const key = line.slice(0, equals).trim();
        const value = line.slice(equals + 1).trim();
        if (key) fields.set(key, value);
    }

    const required = [
        'ResolutionEngine.identifyGoal',
        'ResolutionEngine.identifyChallenge',
        'ResolutionEngine.explicitMeans',
        'ResolutionEngine.userAbilityUse.Used',
        'ResolutionEngine.userAbilityUse.Attempted',
        'ResolutionEngine.userAbilityUse.Available',
        'ResolutionEngine.userAbilityUse.AbilityName',
        'ResolutionEngine.userAbilityUse.Evidence',
        'ResolutionEngine.userAbilityUse.NarrativeEffect',
        'ResolutionEngine.userAbilityUse.NoEffectReason',
        'ResolutionEngine.userAbilityUse.MechanicalScope',
        'ResolutionEngine.itemUse.Attempted',
        'ResolutionEngine.itemUse.Available',
        'ResolutionEngine.itemUse.Item',
        'ResolutionEngine.itemUse.Source',
        'ResolutionEngine.itemUse.Evidence',
        'ResolutionEngine.itemUse.NoEffectReason',
        'ResolutionEngine.claimCheck.Present',
        'ResolutionEngine.claimCheck.Claim',
        'ResolutionEngine.claimCheck.TargetNPC',
        'ResolutionEngine.claimCheck.TruthStatus',
        'ResolutionEngine.claimCheck.NPCAccess',
        'ResolutionEngine.claimCheck.StakesImpact',
        'ResolutionEngine.claimCheck.Reason',
        'ResolutionEngine.identifyTargets.hostilesInScene.NPC',
        'ResolutionEngine.identifyTargets.ActionTargets',
        'ResolutionEngine.identifyTargets.OppTargets.NPC',
        'ResolutionEngine.identifyTargets.OppTargets.ENV',
        'ResolutionEngine.identifyTargets.BenefitedObservers',
        'ResolutionEngine.identifyTargets.HarmedObservers',
        'ResolutionEngine.identifyTargets.NPCAwareOfUser',
        'ResolutionEngine.identifyTargets.PowerActors',
        'ResolutionEngine.intimacyAdvanceExplicit',
        'ResolutionEngine.boundaryViolationExplicit',
        'ResolutionEngine.nonLethal',
        'ResolutionEngine.rollNeeded',
        'ResolutionEngine.rollReason',
        'ResolutionEngine.actionBucket',
        'ResolutionEngine.socialBucket',
        'ResolutionEngine.combatType',
        'ResolutionEngine.actionCount',
        'ResolutionEngine.actionUnits.count',
        'ResolutionEngine.environmentDifficultyTier',
        'ResolutionEngine.classifyHostilePhysicalIntent',
        'ResolutionEngine.activeHostileThreat',
        'ResolutionEngine.classifyPhysicalBoundaryPressure',
        'ResolutionEngine.genStats.Rank',
        'ResolutionEngine.genStats.MainStat',
        'RelationshipEngine.count',
        'UserKnowledgeApplication.count',
        'InjuryEffectEngine.count',
        'CHAOS_INTERRUPT.sceneSummary',
        'TrackerUpdateEngine.User.condition',
        'TrackerUpdateEngine.User.woundsAdd',
        'TrackerUpdateEngine.User.woundsRemove',
        'TrackerUpdateEngine.User.statusAdd',
        'TrackerUpdateEngine.User.statusRemove',
        'TrackerUpdateEngine.User.gearAdd',
        'TrackerUpdateEngine.User.gearRemove',
        'TrackerUpdateEngine.User.inventoryAdd',
        'TrackerUpdateEngine.User.inventoryRemove',
        'TrackerUpdateEngine.User.tasksAdd',
        'TrackerUpdateEngine.User.tasksRemove',
        'TrackerUpdateEngine.User.commitmentsAdd',
        'TrackerUpdateEngine.User.commitmentsRemove',
        'TrackerUpdateEngine.NPC.count',
        'PowerActorAssessment.count',
        'PowerActorEnmity.count',
        'PowerEventShape.count',
    ];
    const missing = required.filter(key => !fields.has(key));
    if (missing.length) {
        throw new Error(`compact ledger missing required lines: ${missing.join(', ')}`);
    }

    const actionUnitCount = clampNumber(readNumber(fields, 'ResolutionEngine.actionUnits.count', 0), 0, 3);
    for (let index = 0; index < actionUnitCount; index += 1) {
        const prefix = `ResolutionEngine.actionUnits[${index}]`;
        const unitRequired = [
            `${prefix}.id`,
            `${prefix}.action`,
            `${prefix}.evidence`,
        ];
        for (const key of unitRequired) {
            if (!fields.has(key)) missing.push(key);
        }
    }
    if (missing.length) {
        throw new Error(`compact ledger missing required lines: ${missing.join(', ')}`);
    }

    const trackerNpcCount = clampNumber(readNumber(fields, 'TrackerUpdateEngine.NPC.count', 0), 0, 20);
    for (let index = 0; index < trackerNpcCount; index += 1) {
        const prefix = `TrackerUpdateEngine.NPC[${index}]`;
        const trackerRequired = [
            `${prefix}.NPC`,
            `${prefix}.revealedName`,
            `${prefix}.personalitySummary`,
            `${prefix}.condition`,
            `${prefix}.woundsAdd`,
            `${prefix}.woundsRemove`,
            `${prefix}.statusAdd`,
            `${prefix}.statusRemove`,
            `${prefix}.gearAdd`,
            `${prefix}.gearRemove`,
        ];
        for (const key of trackerRequired) {
            if (!fields.has(key)) missing.push(key);
        }
    }
    if (missing.length) {
        throw new Error(`compact ledger missing required lines: ${missing.join(', ')}`);
    }

    const injuryEffectCount = clampNumber(readNumber(fields, 'InjuryEffectEngine.count', 0), 0, 20);
    for (let index = 0; index < injuryEffectCount; index += 1) {
        const prefix = `InjuryEffectEngine[${index}]`;
        const effectRequired = [
            `${prefix}.target`,
            `${prefix}.targetRole`,
            `${prefix}.effectType`,
            `${prefix}.bodyPart`,
            `${prefix}.description`,
            `${prefix}.severityFloor`,
            `${prefix}.persistence`,
            `${prefix}.affectsAction`,
        ];
        for (const key of effectRequired) {
            if (!fields.has(key)) missing.push(key);
        }
    }
    if (missing.length) {
        throw new Error(`compact ledger missing required lines: ${missing.join(', ')}`);
    }

    const powerActorAssessmentCount = clampNumber(readNumber(fields, 'PowerActorAssessment.count', 0), 0, 20);
    for (let index = 0; index < powerActorAssessmentCount; index += 1) {
        const prefix = `PowerActorAssessment[${index}]`;
        const powerActorAssessmentRequired = [
            `${prefix}.actor`,
            `${prefix}.scope`,
            `${prefix}.isPowerActor`,
            `${prefix}.actorType`,
            `${prefix}.reach`,
            `${prefix}.evidence`,
            `${prefix}.assessmentReason`,
        ];
        for (const key of powerActorAssessmentRequired) {
            if (!fields.has(key)) missing.push(key);
        }
    }
    if (missing.length) {
        throw new Error(`compact ledger missing required lines: ${missing.join(', ')}`);
    }

    const powerActorEffectCount = clampNumber(readNumber(fields, 'PowerActorEnmity.count', 0), 0, 12);
    for (let index = 0; index < powerActorEffectCount; index += 1) {
        const prefix = `PowerActorEnmity[${index}]`;
        const powerActorRequired = [
            `${prefix}.actor`,
            `${prefix}.actorType`,
            `${prefix}.hasReach`,
            `${prefix}.effect`,
            `${prefix}.severity`,
            `${prefix}.reason`,
            `${prefix}.knownToActor`,
        ];
        for (const key of powerActorRequired) {
            if (!fields.has(key)) missing.push(key);
        }
    }
    if (missing.length) {
        throw new Error(`compact ledger missing required lines: ${missing.join(', ')}`);
    }

    const powerEventShapeCount = clampNumber(readNumber(fields, 'PowerEventShape.count', 0), 0, 4);
    for (let index = 0; index < powerEventShapeCount; index += 1) {
        const prefix = `PowerEventShape[${index}]`;
        const powerEventRequired = [
            `${prefix}.eventId`,
            `${prefix}.actor`,
            `${prefix}.eventType`,
            `${prefix}.fit`,
            `${prefix}.visibleInstruction`,
            `${prefix}.contactName`,
            `${prefix}.contactGender`,
            `${prefix}.surfaceRole`,
            `${prefix}.deferReason`,
        ];
        for (const key of powerEventRequired) {
            if (!fields.has(key)) missing.push(key);
        }
    }
    if (missing.length) {
        throw new Error(`compact ledger missing required lines: ${missing.join(', ')}`);
    }

    const userKnowledgeApplicationCount = clampNumber(readNumber(fields, 'UserKnowledgeApplication.count', 0), 0, 20);
    for (let index = 0; index < userKnowledgeApplicationCount; index += 1) {
        const prefix = `UserKnowledgeApplication[${index}]`;
        const userKnowledgeRequired = [
            `${prefix}.target`,
            `${prefix}.entryIds`,
            `${prefix}.type`,
            `${prefix}.knownBy`,
            `${prefix}.scope`,
            `${prefix}.valence`,
            `${prefix}.effect`,
            `${prefix}.line`,
            `${prefix}.reason`,
        ];
        for (const key of userKnowledgeRequired) {
            if (!fields.has(key)) missing.push(key);
        }
    }
    if (missing.length) {
        throw new Error(`compact ledger missing required lines: ${missing.join(', ')}`);
    }

    const relCount = clampNumber(readNumber(fields, 'RelationshipEngine.count', 0), 0, 20);
    for (let index = 0; index < relCount; index += 1) {
        const prefix = `RelationshipEngine[${index}]`;
        const relRequired = [
            `${prefix}.NPC`,
            `${prefix}.initPreset.romanticOpen`,
            `${prefix}.initPreset.userBadRep`,
            `${prefix}.initPreset.priorUserGoodRep`,
            `${prefix}.initPreset.userNonHuman`,
            `${prefix}.initPreset.fearImmunity`,
            `${prefix}.establishedRelationship`,
            `${prefix}.romanceStyle`,
            `${prefix}.slowBondEvidence.respectfulContact`,
            `${prefix}.slowBondEvidence.cooperation`,
            `${prefix}.slowBondEvidence.comfortInProximity`,
            `${prefix}.slowBondEvidence.boundaryRespect`,
            `${prefix}.slowBondEvidence.sharedRoutine`,
            `${prefix}.slowBondEvidence.playfulness`,
            `${prefix}.slowBondEvidence.teamwork`,
            `${prefix}.slowBondEvidence.personalAttention`,
            `${prefix}.slowBondEvidence.blockers`,
            `${prefix}.auditInteraction`,
            `${prefix}.explicitIntimidationOrCoercion`,
            `${prefix}.checkThreshold.CurrentInvitation`,
            `${prefix}.checkThreshold.Exploitation`,
            `${prefix}.checkThreshold.Hedonist`,
            `${prefix}.checkThreshold.Transactional`,
            `${prefix}.checkThreshold.Established`,
            `${prefix}.checkThreshold.RomanticBuildup`,
            `${prefix}.genStats.Rank`,
            `${prefix}.genStats.MainStat`,
        ];
        for (const outcomeKey of STAKE_OUTCOME_KEYS) {
            relRequired.push(`${prefix}.stakeChangeByOutcome.${outcomeKey}`);
        }
        for (const key of relRequired) {
            if (!fields.has(key)) missing.push(key);
        }
    }
    if (missing.length) {
        throw new Error(`compact ledger missing required lines: ${missing.join(', ')}`);
    }

    const userKnowledgeApplication = { applications: [] };
    for (let index = 0; index < userKnowledgeApplicationCount; index += 1) {
        const prefix = `UserKnowledgeApplication[${index}]`;
        const application = normalizeUserKnowledgeApplication({
            target: fields.get(`${prefix}.target`),
            entryIds: readList(fields, `${prefix}.entryIds`),
            type: fields.get(`${prefix}.type`),
            knownBy: fields.get(`${prefix}.knownBy`),
            scope: fields.get(`${prefix}.scope`),
            valence: fields.get(`${prefix}.valence`),
            effect: fields.get(`${prefix}.effect`),
            line: fields.get(`${prefix}.line`),
            reason: fields.get(`${prefix}.reason`),
        });
        if (application) userKnowledgeApplication.applications.push(application);
    }

    const relationshipEngine = [];
    for (let index = 0; index < relCount; index += 1) {
        const prefix = `RelationshipEngine[${index}]`;
        const npc = cleanScalar(fields.get(`${prefix}.NPC`));
        if (!npc || isNoneValue(npc)) continue;
        const stakeChangeByOutcome = {};
        for (const outcomeKey of STAKE_OUTCOME_KEYS) {
            stakeChangeByOutcome[outcomeKey] = normalizeStakeChangeValue(fields.get(`${prefix}.stakeChangeByOutcome.${outcomeKey}`));
        }

        relationshipEngine.push({
            NPC: npc,
            initPreset: {
                romanticOpen: readBoolean(fields, `${prefix}.initPreset.romanticOpen`, false),
                userBadRep: readBoolean(fields, `${prefix}.initPreset.userBadRep`, false),
                priorUserGoodRep: readBoolean(fields, `${prefix}.initPreset.priorUserGoodRep`, false),
                userNonHuman: readBoolean(fields, `${prefix}.initPreset.userNonHuman`, false),
                fearImmunity: readBoolean(fields, `${prefix}.initPreset.fearImmunity`, false),
            },
            auditInteraction: readBoolean(fields, `${prefix}.auditInteraction`, false),
            establishedRelationship: readBoolean(fields, `${prefix}.establishedRelationship`, false),
            romanceStyle: normalizeRomanceStyle(fields.get(`${prefix}.romanceStyle`)),
            slowBondEvidence: {
                respectfulContact: readBoolean(fields, `${prefix}.slowBondEvidence.respectfulContact`, false),
                cooperation: readBoolean(fields, `${prefix}.slowBondEvidence.cooperation`, false),
                comfortInProximity: readBoolean(fields, `${prefix}.slowBondEvidence.comfortInProximity`, false),
                boundaryRespect: readBoolean(fields, `${prefix}.slowBondEvidence.boundaryRespect`, false),
                sharedRoutine: readBoolean(fields, `${prefix}.slowBondEvidence.sharedRoutine`, false),
                playfulness: readBoolean(fields, `${prefix}.slowBondEvidence.playfulness`, false),
                teamwork: readBoolean(fields, `${prefix}.slowBondEvidence.teamwork`, false),
                personalAttention: readBoolean(fields, `${prefix}.slowBondEvidence.personalAttention`, false),
                blockers: readList(fields, `${prefix}.slowBondEvidence.blockers`),
            },
            explicitIntimidationOrCoercion: readBoolean(fields, `${prefix}.explicitIntimidationOrCoercion`, false),
            stakeChangeByOutcome,
            overrideFlags: {
                CurrentInvitation: readBoolean(fields, `${prefix}.checkThreshold.CurrentInvitation`, false),
                Exploitation: readBoolean(fields, `${prefix}.checkThreshold.Exploitation`, false),
                Hedonist: readBoolean(fields, `${prefix}.checkThreshold.Hedonist`, false),
                Transactional: readBoolean(fields, `${prefix}.checkThreshold.Transactional`, false),
                Established: readBoolean(fields, `${prefix}.checkThreshold.Established`, false),
                RomanticBuildup: readBoolean(fields, `${prefix}.checkThreshold.RomanticBuildup`, false),
            },
            genStats: readGeneratedStatsSeed(fields, `${prefix}.genStats`),
        });
    }

    const rollNeeded = readBoolean(fields, 'ResolutionEngine.rollNeeded', false);
    const actionBucket = normalizeActionBucket(fields.get('ResolutionEngine.actionBucket'), rollNeeded);
    const socialBucket = normalizeSocialBucket(fields.get('ResolutionEngine.socialBucket'), actionBucket);
    const combatType = normalizeCombatType(fields.get('ResolutionEngine.combatType'), actionBucket);

    const resolutionEngine = {
        identifyGoal: cleanScalar(fields.get('ResolutionEngine.identifyGoal')) || 'Normal_Interaction',
        identifyChallenge: cleanScalar(fields.get('ResolutionEngine.identifyChallenge')) || cleanScalar(fields.get('ResolutionEngine.identifyGoal')) || 'Normal_Interaction',
        explicitMeans: cleanScalar(fields.get('ResolutionEngine.explicitMeans')) || '(none)',
        userAbilityUse: normalizeUserAbilityUse({
            used: readBoolean(fields, 'ResolutionEngine.userAbilityUse.Used', false),
            attempted: readBoolean(fields, 'ResolutionEngine.userAbilityUse.Attempted', false),
            available: readBoolean(fields, 'ResolutionEngine.userAbilityUse.Available', false),
            abilityName: cleanScalar(fields.get('ResolutionEngine.userAbilityUse.AbilityName')) || '(none)',
            evidence: cleanScalar(fields.get('ResolutionEngine.userAbilityUse.Evidence')) || '(none)',
            narrativeEffect: cleanScalar(fields.get('ResolutionEngine.userAbilityUse.NarrativeEffect')) || '(none)',
            noEffectReason: cleanScalar(fields.get('ResolutionEngine.userAbilityUse.NoEffectReason')) || '(none)',
            mechanicalScope: cleanScalar(fields.get('ResolutionEngine.userAbilityUse.MechanicalScope')) || 'flavor_only_no_bonus',
        }),
        itemUse: normalizeItemUse({
            attempted: readBoolean(fields, 'ResolutionEngine.itemUse.Attempted', false),
            available: readBoolean(fields, 'ResolutionEngine.itemUse.Available', false),
            item: cleanScalar(fields.get('ResolutionEngine.itemUse.Item')) || '(none)',
            source: cleanScalar(fields.get('ResolutionEngine.itemUse.Source')) || 'none',
            evidence: cleanScalar(fields.get('ResolutionEngine.itemUse.Evidence')) || '(none)',
            noEffectReason: cleanScalar(fields.get('ResolutionEngine.itemUse.NoEffectReason')) || '(none)',
        }),
        claimCheck: normalizeClaimCheck({
            present: readBoolean(fields, 'ResolutionEngine.claimCheck.Present', false),
            claim: cleanScalar(fields.get('ResolutionEngine.claimCheck.Claim')) || '(none)',
            targetNPC: cleanScalar(fields.get('ResolutionEngine.claimCheck.TargetNPC')) || '(none)',
            truthStatus: cleanScalar(fields.get('ResolutionEngine.claimCheck.TruthStatus')) || 'none',
            npcAccess: cleanScalar(fields.get('ResolutionEngine.claimCheck.NPCAccess')) || 'none',
            stakesImpact: readBoolean(fields, 'ResolutionEngine.claimCheck.StakesImpact', false),
            reason: cleanScalar(fields.get('ResolutionEngine.claimCheck.Reason')) || '(none)',
        }),
        identifyTargets: {
            hostilesInScene: {
                NPC: readList(fields, 'ResolutionEngine.identifyTargets.hostilesInScene.NPC'),
            },
            ActionTargets: readList(fields, 'ResolutionEngine.identifyTargets.ActionTargets'),
            OppTargets: {
                NPC: readList(fields, 'ResolutionEngine.identifyTargets.OppTargets.NPC'),
                ENV: readList(fields, 'ResolutionEngine.identifyTargets.OppTargets.ENV'),
            },
            BenefitedObservers: readList(fields, 'ResolutionEngine.identifyTargets.BenefitedObservers'),
            HarmedObservers: readList(fields, 'ResolutionEngine.identifyTargets.HarmedObservers'),
            NPCAwareOfUser: readList(fields, 'ResolutionEngine.identifyTargets.NPCAwareOfUser'),
            PowerActors: readList(fields, 'ResolutionEngine.identifyTargets.PowerActors'),
        },
        intimacyAdvanceExplicit: readBoolean(fields, 'ResolutionEngine.intimacyAdvanceExplicit', false),
        boundaryViolationExplicit: readBoolean(fields, 'ResolutionEngine.boundaryViolationExplicit', false),
        nonLethal: readBoolean(fields, 'ResolutionEngine.nonLethal', false),
        rollNeeded,
        rollReason: cleanScalar(fields.get('ResolutionEngine.rollReason')) || '(none)',
        actionBucket,
        socialBucket,
        combatType,
        actionCount: readList(fields, 'ResolutionEngine.actionCount', ['a1']),
        actionUnits: readActionUnits(fields, actionUnitCount),
        environmentDifficultyTier: normalizeEnvironmentDifficultyTier(
            fields.get('ResolutionEngine.environmentDifficultyTier') ?? fields.get('ResolutionEngine.environmentDifficulty'),
            fields.get('ResolutionEngine.actionBucket'),
        ),
        classifyHostilePhysicalIntent: readBoolean(fields, 'ResolutionEngine.classifyHostilePhysicalIntent', false),
        activeHostileThreat: readBoolean(fields, 'ResolutionEngine.activeHostileThreat', false),
        classifyPhysicalBoundaryPressure: readBoolean(fields, 'ResolutionEngine.classifyPhysicalBoundaryPressure', false),
        genStats: readGeneratedStatsSeed(fields, 'ResolutionEngine.genStats'),
    };
    resolutionEngine.environmentDifficulty = environmentDifficultyFromTier(
        resolutionEngine.environmentDifficultyTier,
        resolutionEngine.actionBucket,
    );
    const relationshipRepair = repairRelationshipCoverage(resolutionEngine, relationshipEngine, 'compact_ledger_parse');

    const injuryEffectEngine = { effects: [] };
    for (let index = 0; index < injuryEffectCount; index += 1) {
        const prefix = `InjuryEffectEngine[${index}]`;
        const target = cleanScalar(fields.get(`${prefix}.target`));
        if (!target || isNoneValue(target)) continue;
        injuryEffectEngine.effects.push({
            target,
            targetRole: normalizeInjuryEffectTargetRole(fields.get(`${prefix}.targetRole`)),
            effectType: normalizeInjuryEffectType(fields.get(`${prefix}.effectType`)),
            bodyPart: cleanScalar(fields.get(`${prefix}.bodyPart`)) || 'body',
            description: cleanScalar(fields.get(`${prefix}.description`)) || '(none)',
            severityFloor: normalizeInjuryEffectSeverity(fields.get(`${prefix}.severityFloor`)),
            persistence: normalizeInjuryEffectPersistence(fields.get(`${prefix}.persistence`)),
            affectsAction: readBoolean(fields, `${prefix}.affectsAction`, false),
        });
    }

    const powerActorEnmity = { assessments: [], effects: [] };
    for (let index = 0; index < powerActorAssessmentCount; index += 1) {
        const prefix = `PowerActorAssessment[${index}]`;
        const assessment = normalizePowerActorAssessment({
            actor: fields.get(`${prefix}.actor`),
            scope: fields.get(`${prefix}.scope`),
            isPowerActor: readBoolean(fields, `${prefix}.isPowerActor`, false),
            actorType: fields.get(`${prefix}.actorType`),
            reach: readList(fields, `${prefix}.reach`),
            evidence: fields.get(`${prefix}.evidence`),
            assessmentReason: fields.get(`${prefix}.assessmentReason`),
        });
        if (assessment) powerActorEnmity.assessments.push(assessment);
    }
    for (let index = 0; index < powerActorEffectCount; index += 1) {
        const prefix = `PowerActorEnmity[${index}]`;
        const effect = normalizePowerActorEffect({
            actor: fields.get(`${prefix}.actor`),
            actorType: fields.get(`${prefix}.actorType`),
            hasReach: readBoolean(fields, `${prefix}.hasReach`, false),
            effect: fields.get(`${prefix}.effect`),
            severity: fields.get(`${prefix}.severity`),
            reason: fields.get(`${prefix}.reason`),
            knownToActor: readBoolean(fields, `${prefix}.knownToActor`, false),
        });
        if (effect) powerActorEnmity.effects.push(effect);
    }

    const powerEventShape = { events: [] };
    for (let index = 0; index < powerEventShapeCount; index += 1) {
        const prefix = `PowerEventShape[${index}]`;
        const event = normalizePowerEventShape({
            eventId: fields.get(`${prefix}.eventId`),
            actor: fields.get(`${prefix}.actor`),
            eventType: fields.get(`${prefix}.eventType`),
            fit: fields.get(`${prefix}.fit`),
            visibleInstruction: fields.get(`${prefix}.visibleInstruction`),
            contactName: fields.get(`${prefix}.contactName`),
            contactGender: fields.get(`${prefix}.contactGender`),
            surfaceRole: fields.get(`${prefix}.surfaceRole`),
            deferReason: fields.get(`${prefix}.deferReason`),
        });
        if (event) powerEventShape.events.push(event);
    }

    const trackerUpdateEngine = {
        user: {
            condition: normalizeTrackerDeltaCondition(fields.get('TrackerUpdateEngine.User.condition')),
            woundsAdd: readList(fields, 'TrackerUpdateEngine.User.woundsAdd'),
            woundsRemove: readList(fields, 'TrackerUpdateEngine.User.woundsRemove'),
            statusAdd: readList(fields, 'TrackerUpdateEngine.User.statusAdd'),
            statusRemove: readList(fields, 'TrackerUpdateEngine.User.statusRemove'),
            gearAdd: readList(fields, 'TrackerUpdateEngine.User.gearAdd'),
            gearRemove: readList(fields, 'TrackerUpdateEngine.User.gearRemove'),
            inventoryAdd: readList(fields, 'TrackerUpdateEngine.User.inventoryAdd'),
            inventoryRemove: readList(fields, 'TrackerUpdateEngine.User.inventoryRemove'),
            tasksAdd: readList(fields, 'TrackerUpdateEngine.User.tasksAdd'),
            tasksRemove: readList(fields, 'TrackerUpdateEngine.User.tasksRemove'),
            commitmentsAdd: readList(fields, 'TrackerUpdateEngine.User.commitmentsAdd'),
            commitmentsRemove: readList(fields, 'TrackerUpdateEngine.User.commitmentsRemove'),
        },
        npcs: [],
    };
    for (let index = 0; index < trackerNpcCount; index += 1) {
        const prefix = `TrackerUpdateEngine.NPC[${index}]`;
        const npc = cleanScalar(fields.get(`${prefix}.NPC`));
        if (!npc || isNoneValue(npc)) continue;
        trackerUpdateEngine.npcs.push({
            NPC: npc,
            revealedName: normalizeRevealedName(fields.get(`${prefix}.revealedName`)),
            personalitySummary: normalizePersonalitySummary(fields.get(`${prefix}.personalitySummary`)),
            condition: normalizeTrackerDeltaCondition(fields.get(`${prefix}.condition`)),
            woundsAdd: readList(fields, `${prefix}.woundsAdd`),
            woundsRemove: readList(fields, `${prefix}.woundsRemove`),
            statusAdd: readList(fields, `${prefix}.statusAdd`),
            statusRemove: readList(fields, `${prefix}.statusRemove`),
            gearAdd: readList(fields, `${prefix}.gearAdd`),
            gearRemove: readList(fields, `${prefix}.gearRemove`),
        });
    }

    return {
        engineContext: {
            userCoreStats: { Rank: 'none', MainStat: 'none', PHY: 1, MND: 1, CHA: 1 },
            trackerRelevantNPCs: trackerSnapshotToLedgerEntries(trackerSnapshot),
        },
        resolutionEngine,
        relationshipEngine,
        injuryEffectEngine,
        userKnowledgeApplication,
        powerActorEnmity,
        powerEventShape,
        chaosSemantic: {
            sceneSummary: cleanScalar(fields.get('CHAOS_INTERRUPT.sceneSummary')) || '',
        },
        trackerUpdateEngine,
        proactivitySemantic: {},
        deterministicOverrides: relationshipRepair
            ? { semanticLedgerRepair: relationshipRepair }
            : {},
    };
}

function parseNarratorTrackerDeltaText(text) {
    const source = String(text || '');
    const match = source.match(/BEGIN_TRACKER_DELTA([\s\S]*?)END_TRACKER_DELTA/i);
    const body = match ? match[1] : source;

    const fields = new Map();
    for (const rawLine of body.split(/\r?\n/)) {
        const line = rawLine.trim();
        if (!line || line.startsWith('#') || line.startsWith('//')) continue;
        const equals = line.indexOf('=');
        if (equals < 1) continue;
        const key = line.slice(0, equals).trim();
        const value = line.slice(equals + 1).trim();
        if (key) fields.set(key, value);
    }

    const required = [
        'TrackerUpdateEngine.User.condition',
        'TrackerUpdateEngine.User.woundsAdd',
        'TrackerUpdateEngine.User.woundsRemove',
        'TrackerUpdateEngine.User.statusAdd',
        'TrackerUpdateEngine.User.statusRemove',
        'TrackerUpdateEngine.User.gearAdd',
        'TrackerUpdateEngine.User.gearRemove',
        'TrackerUpdateEngine.User.inventoryAdd',
        'TrackerUpdateEngine.User.inventoryRemove',
        'TrackerUpdateEngine.User.tasksAdd',
        'TrackerUpdateEngine.User.tasksRemove',
        'TrackerUpdateEngine.User.commitmentsAdd',
        'TrackerUpdateEngine.User.commitmentsRemove',
        'TrackerUpdateEngine.NPC.count',
        'UserKnowledgeLedger.personal.count',
        'UserKnowledgeLedger.reputation.count',
    ];
    const missing = required.filter(key => !fields.has(key));
    if (missing.length) throw new Error(`tracker delta block missing required lines: ${missing.join(', ')}`);

    const user = {
        condition: normalizeTrackerDeltaCondition(fields.get('TrackerUpdateEngine.User.condition')),
        woundsAdd: readList(fields, 'TrackerUpdateEngine.User.woundsAdd'),
        woundsRemove: readList(fields, 'TrackerUpdateEngine.User.woundsRemove'),
        statusAdd: readList(fields, 'TrackerUpdateEngine.User.statusAdd'),
        statusRemove: readList(fields, 'TrackerUpdateEngine.User.statusRemove'),
        gearAdd: readList(fields, 'TrackerUpdateEngine.User.gearAdd'),
        gearRemove: readList(fields, 'TrackerUpdateEngine.User.gearRemove'),
        inventoryAdd: readList(fields, 'TrackerUpdateEngine.User.inventoryAdd'),
        inventoryRemove: readList(fields, 'TrackerUpdateEngine.User.inventoryRemove'),
        tasksAdd: readList(fields, 'TrackerUpdateEngine.User.tasksAdd'),
        tasksRemove: readList(fields, 'TrackerUpdateEngine.User.tasksRemove'),
        commitmentsAdd: readList(fields, 'TrackerUpdateEngine.User.commitmentsAdd'),
        commitmentsRemove: readList(fields, 'TrackerUpdateEngine.User.commitmentsRemove'),
    };

    const npcs = [];
    const trackerNpcCount = clampNumber(readNumber(fields, 'TrackerUpdateEngine.NPC.count', 0), 0, 12);
    for (let index = 0; index < trackerNpcCount; index += 1) {
        const prefix = `TrackerUpdateEngine.NPC[${index}]`;
        const npc = cleanScalar(fields.get(`${prefix}.NPC`));
        if (!npc || isNoneValue(npc)) continue;
        npcs.push({
            NPC: npc,
            revealedName: normalizeRevealedName(fields.get(`${prefix}.revealedName`)),
            personalitySummary: normalizePersonalitySummary(fields.get(`${prefix}.personalitySummary`)),
            condition: normalizeTrackerDeltaCondition(fields.get(`${prefix}.condition`)),
            woundsAdd: readList(fields, `${prefix}.woundsAdd`),
            woundsRemove: readList(fields, `${prefix}.woundsRemove`),
            statusAdd: readList(fields, `${prefix}.statusAdd`),
            statusRemove: readList(fields, `${prefix}.statusRemove`),
            gearAdd: readList(fields, `${prefix}.gearAdd`),
            gearRemove: readList(fields, `${prefix}.gearRemove`),
        });
    }

    const userKnowledge = { personal: [], reputation: [] };
    const personalCount = clampNumber(readNumber(fields, 'UserKnowledgeLedger.personal.count', 0), 0, 20);
    for (let index = 0; index < personalCount; index += 1) {
        const prefix = `UserKnowledgeLedger.personal[${index}]`;
        const entry = normalizePersonalKnowledgeDeltaEntry({
            knownBy: fields.get(`${prefix}.knownBy`),
            scope: fields.get(`${prefix}.scope`),
            topic: fields.get(`${prefix}.topic`),
            truth: fields.get(`${prefix}.truth`),
            confidence: fields.get(`${prefix}.confidence`),
            line: fields.get(`${prefix}.line`),
            reason: fields.get(`${prefix}.reason`),
        });
        if (entry) userKnowledge.personal.push(entry);
    }
    const reputationCount = clampNumber(readNumber(fields, 'UserKnowledgeLedger.reputation.count', 0), 0, 20);
    for (let index = 0; index < reputationCount; index += 1) {
        const prefix = `UserKnowledgeLedger.reputation[${index}]`;
        const entry = normalizeReputationKnowledgeDeltaEntry({
            scope: fields.get(`${prefix}.scope`),
            valence: fields.get(`${prefix}.valence`),
            topic: fields.get(`${prefix}.topic`),
            truth: fields.get(`${prefix}.truth`),
            confidence: fields.get(`${prefix}.confidence`),
            line: fields.get(`${prefix}.line`),
            origin: fields.get(`${prefix}.origin`),
            reason: fields.get(`${prefix}.reason`),
        });
        if (entry) userKnowledge.reputation.push(entry);
    }

    return { user, npcs, userKnowledge };
}

function sanitizeNarratorTrackerDelta(delta, narration) {
    const text = String(narration || '');
    const cleanDelta = {
        user: sanitizeNarratorTrackerActorDelta(delta?.user || {}, text, 'user'),
        npcs: Array.isArray(delta?.npcs)
            ? delta.npcs.map(item => ({
                ...sanitizeNarratorTrackerActorDelta(item || {}, text, item?.NPC),
                NPC: item?.NPC,
            }))
            : [],
        userKnowledge: normalizeUserKnowledgeDelta(delta?.userKnowledge),
    };
    cleanDelta.npcs = cleanDelta.npcs.filter(item =>
        item?.NPC
        && (
            normalizeTrackerDeltaCondition(item.condition) !== 'unchanged'
            || normalizeRevealedName(item.revealedName)
            || TRACKER_NPC_DELTA_FIELDS.some(field => Array.isArray(item[field]) && item[field].length)
            || normalizePersonalitySummary(item.personalitySummary)
        ));
    return cleanDelta;
}

function sanitizeNarratorTrackerActorDelta(delta, narration, actorName = '') {
    const source = delta && typeof delta === 'object' ? delta : {};
    const condition = normalizeTrackerDeltaCondition(source.condition);
    const sanitizedWoundsAdd = filterPersistentTrackerEffects(source.woundsAdd, narration, true);
    const sanitizedStatusAdd = filterPersistentTrackerEffects(source.statusAdd, narration, false);
    const sanitizedWoundsRemove = filterResolvedTrackerEffects(source.woundsRemove, narration, actorName);
    const sanitizedStatusRemove = filterResolvedTrackerEffects(source.statusRemove, narration, actorName);
    const actorHasPersistentDelta = sanitizedWoundsAdd.length || sanitizedStatusAdd.length;
    const actorHasConditionEvidence = hasActorScopedConditionEvidence(condition, narration, actorName);
    const sanitizedCondition = sanitizeNarratorTrackerCondition(condition, narration, actorName, actorHasPersistentDelta, actorHasConditionEvidence);
    return {
        ...source,
        revealedName: normalizeRevealedName(source.revealedName),
        personalitySummary: normalizePersonalitySummary(source.personalitySummary),
        condition: sanitizedCondition,
        woundsAdd: sanitizedWoundsAdd,
        statusAdd: sanitizedStatusAdd,
        woundsRemove: sanitizedWoundsRemove,
        statusRemove: sanitizedStatusRemove,
    };
}

function normalizeUserKnowledgeDelta(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        personal: Array.isArray(source.personal)
            ? source.personal.map(normalizePersonalKnowledgeDeltaEntry).filter(Boolean).slice(0, 20)
            : [],
        reputation: Array.isArray(source.reputation)
            ? source.reputation.map(normalizeReputationKnowledgeDeltaEntry).filter(Boolean).slice(0, 20)
            : [],
    };
}

function normalizePersonalKnowledgeDeltaEntry(value) {
    const source = value && typeof value === 'object' ? value : {};
    const knownBy = cleanScalar(source.knownBy ?? source.KnownBy).replace(/\s+/g, ' ').slice(0, 140);
    const line = cleanScalar(source.line ?? source.Line).replace(/\s+/g, ' ').slice(0, 220);
    if (!knownBy || isNoneValue(knownBy) || !line || isNoneValue(line)) return null;
    const topic = cleanScalar(source.topic ?? source.Topic).replace(/\s+/g, ' ').slice(0, 140) || '(none)';
    return {
        type: 'personalKnowledge',
        knownBy,
        scope: normalizeUserKnowledgeScope(source.scope ?? source.Scope),
        topic,
        truth: normalizeUserKnowledgeTruth(source.truth ?? source.Truth),
        confidence: normalizeUserKnowledgeConfidence(source.confidence ?? source.Confidence),
        line,
        reason: cleanScalar(source.reason ?? source.Reason).replace(/\s+/g, ' ').slice(0, 220) || '(none)',
    };
}

function normalizeReputationKnowledgeDeltaEntry(value) {
    const source = value && typeof value === 'object' ? value : {};
    const line = cleanScalar(source.line ?? source.Line).replace(/\s+/g, ' ').slice(0, 220);
    if (!line || isNoneValue(line)) return null;
    const topic = cleanScalar(source.topic ?? source.Topic).replace(/\s+/g, ' ').slice(0, 140) || '(none)';
    return {
        type: 'reputationKnowledge',
        scope: normalizeUserKnowledgeScope(source.scope ?? source.Scope),
        valence: normalizeUserKnowledgeValence(source.valence ?? source.Valence),
        topic,
        truth: normalizeUserKnowledgeTruth(source.truth ?? source.Truth),
        confidence: normalizeUserKnowledgeConfidence(source.confidence ?? source.Confidence),
        line,
        origin: cleanScalar(source.origin ?? source.Origin).replace(/\s+/g, ' ').slice(0, 160) || '(none)',
        reason: cleanScalar(source.reason ?? source.Reason).replace(/\s+/g, ' ').slice(0, 220) || '(none)',
    };
}

function isInjuryCondition(condition) {
    return ['bruised', 'wounded', 'badly_wounded', 'critical', 'incapacitated', 'dead'].includes(condition);
}

function sanitizeNarratorTrackerCondition(condition, narration, actorName, actorHasPersistentDelta, actorHasConditionEvidence) {
    if (condition === 'healthy') {
        return hasActorScopedResolvedEvidence(narration, actorName) ? 'healthy' : 'unchanged';
    }
    if (isInjuryCondition(condition)) {
        return (!actorHasPersistentDelta && !actorHasConditionEvidence) ? 'unchanged' : condition;
    }
    return condition;
}

function filterPersistentTrackerEffects(items, narration, requireLastingEvidence) {
    if (!Array.isArray(items)) return [];
    const source = String(narration || '');
    return items.filter(item => isPersistentTrackerEffect(item, source, requireLastingEvidence));
}

function filterResolvedTrackerEffects(items, narration, actorName = '') {
    if (!Array.isArray(items)) return [];
    const source = String(narration || '');
    return items.filter(item => isResolvedTrackerEffect(item, source, actorName));
}

function isResolvedTrackerEffect(item, narration, actorName = '') {
    const text = cleanScalar(item).toLowerCase();
    if (!text || isNoneValue(text)) return false;
    if (hasTreatmentOnlyLanguage(text) && !hasResolvedInjuryEvidence(text)) return false;
    const actorResolved = hasActorScopedResolvedEvidence(narration, actorName);
    if (hasResolvedInjuryEvidence(text)) return actorResolved || hasResolvedInjuryEvidence(narration);
    if (!actorResolved) return false;
    const escaped = escapeRegExp(text);
    if (!escaped) return false;
    const resolvedNearEffect = new RegExp(`\\b(?:healed|heals|cured|cures|recovered|recovers|restored|restores|regenerated|regenerates|knitted\\s+closed|sealed|mended|gone|vanished|removed|cleared|no\\s+longer\\s+impairs?|fully\\s+functional|back\\s+to\\s+normal)\\b.{0,100}\\b${escaped}\\b|\\b${escaped}\\b.{0,100}\\b(?:healed|heals|cured|cures|recovered|recovers|restored|restores|regenerated|regenerates|knitted\\s+closed|sealed|mended|gone|vanished|removed|cleared|no\\s+longer\\s+impairs?|fully\\s+functional|back\\s+to\\s+normal)\\b`, 'i');
    return resolvedNearEffect.test(narration) || hasResolvedEffectReference(text, narration);
}

function isPersistentTrackerEffect(item, narration, requireLastingEvidence) {
    const text = cleanScalar(item).toLowerCase();
    if (!text || isNoneValue(text)) return false;
    if (hasTreatmentOnlyLanguage(text) && !hasLastingInjuryEvidence(text) && !hasPersistingEffectLanguage(text)) return false;
    if (hasTransientOnlyInjuryLanguage(text) && !hasLastingInjuryEvidence(text) && !hasPersistingEffectLanguage(text)) return false;
    if (!requireLastingEvidence) return true;
    if (hasLastingInjuryEvidence(text) || hasPersistingEffectLanguage(text)) return true;
    const escaped = escapeRegExp(text);
    if (escaped && new RegExp(`\\b(?:still|remains?|ongoing|continues?|lingering|persistent)\\b.{0,80}\\b${escaped}\\b`, 'i').test(narration)) return true;
    return true;
}

function hasTransientOnlyInjuryLanguage(value) {
    return /\b(hit|blow|impact|fall|falls|fell|shove|knock(?:ed)?(?:\s+(?:back|down))?|stagger(?:ed|s|ing)?|flinch(?:ed|es|ing)?|gasp(?:ed|s|ing)?|pain|aches?|throbs?|winded|wind\s+knocked\s+out|breath\s+knocked\s+out|lost\s+(?:his|her|their|your)?\s*breath|breathless|shock(?:ed)?|jolt(?:ed)?|slam(?:med)?|thud|contact|near-contact)\b/i.test(String(value || ''));
}

function hasLastingInjuryEvidence(value) {
    return /\b(bruis(?:e|ed|ing)|welt(?:ed|s)?|cut|cuts|gashed?|gash|bleed(?:ing|s)?|blood(?:ied|y)?|sprain(?:ed)?|strain(?:ed)?|break|breaks|broken|fractur(?:e|ed)|crack(?:ed)?\s+(?:rib|bone|skull)|cracked|dislocat(?:e|ed)|poison(?:ed|ing)?|venom|sicken(?:ed|ing)?|disease|fever|restrain(?:ed|t)|bound|pinned|immobili[sz]ed|paraly[sz]ed|exhaust(?:ed|ion)|unconscious|concuss(?:ed|ion)?|dazed|stunned|blinded|burn(?:ed|s)?|scarred|severed|amputated|crushed|mangled|torn|impaled|stabbed|pierced|bandag(?:e|ed)|splint(?:ed)?|ongoing\s+breath(?:ing)?\s+trouble|trouble\s+breathing|labou?red\s+breath(?:ing)?|shortness\s+of\s+breath|continu(?:ing|es?)\s+(?:pain|bleeding|dizziness|breath))/i.test(String(value || ''));
}

function hasPersistingEffectLanguage(value) {
    return /\b(ongoing|lasting|persistent|persists?|remains?|continues?|lingering|cannot|can't|unable|limited|impaired|weakened|numb|useless|unstable|reduced|hampered|hindered|slowed|disabled|incapacitated|no\s+longer\s+able|struggles?\s+to)\b/i.test(String(value || ''));
}

function hasTreatmentOnlyLanguage(value) {
    return /\b(bandag(?:e|ed|ing)|splint(?:ed|ing)?|dress(?:ed|ing)?|clean(?:ed|ing)?|stitch(?:ed|ing)?|sutured?|wrapped|braced|salve|ointment|poultice|compress|stabili[sz](?:e|ed|ing)|treated|treatment|care|tended|first\s+aid|set\s+(?:the\s+)?(?:bone|fracture|limb))\b/i.test(String(value || ''));
}

function hasResolvedInjuryEvidence(value) {
    return /\b(healed|heals|healing\s+finishes|fully\s+healed|cured|cures|fully\s+recovered|recovered|recovers|restored|restores|regenerated|regenerates|knitted\s+closed|sealed\s+shut|mended|gone|vanished|removed|cleared|no\s+longer\s+impairs?|no\s+longer\s+(?:hurts|bleeds|aches|limits|hinders)|fully\s+functional|back\s+to\s+normal|works?\s+normally\s+again)\b/i.test(String(value || ''));
}

function hasResolvedEffectReference(effectText, narration) {
    const tokens = trackerEffectReferenceTokens(effectText);
    if (!tokens.length) return false;
    const source = String(narration || '');
    const resolved = /\b(healed|heals|healing\s+finishes|fully\s+healed|cured|cures|fully\s+recovered|recovered|recovers|restored|restores|regenerated|regenerates|knitted\s+closed|sealed\s+shut|mended|gone|vanished|removed|cleared|no\s+longer\s+impairs?|no\s+longer\s+(?:hurts|bleeds|aches|limits|hinders)|fully\s+functional|back\s+to\s+normal|works?\s+normally\s+again)\b/i;
    let matched = 0;
    for (const token of tokens) {
        if (nearPattern(source, resolved, new RegExp(`\\b${escapeRegExp(token)}\\b`, 'i'), 160)) matched += 1;
    }
    const required = tokens.length <= 2 ? 1 : 2;
    return matched >= required;
}

function trackerEffectReferenceTokens(effectText) {
    const stopWords = new Set([
        'minor', 'moderate', 'severe', 'critical', 'badly', 'serious', 'seriously', 'gravely',
        'light', 'heavy', 'deep', 'lasting', 'persistent', 'ongoing', 'temporary', 'current',
        'left', 'right', 'upper', 'lower', 'body', 'overall', 'general', 'wound', 'wounds',
        'injury', 'injuries', 'status', 'effect', 'effects', 'condition', 'conditions',
        'impairment', 'impaired', 'impairs', 'limitation', 'limited', 'limiting', 'painful',
    ]);
    const tokens = String(effectText || '').toLowerCase().match(/[a-z]{3,}/g) || [];
    return Array.from(new Set(tokens.filter(token => !stopWords.has(token)))).slice(0, 6);
}

function hasActorScopedResolvedEvidence(narration, actorName = '') {
    const text = String(narration || '');
    const resolved = resolvedInjuryPattern();
    const actor = cleanScalar(actorName);
    if (!actor || isNoneValue(actor)) return resolved.test(text);
    if (actor.toLowerCase() === 'user') {
        return hasActorClauseResolvedEvidence(text, /\b(?:you|your|yours|yourself|user|player|protagonist)\b/i, resolved);
    }
    return hasActorClauseResolvedEvidence(text, new RegExp(`\\b${escapeRegExp(actor)}\\b`, 'i'), resolved);
}

function resolvedInjuryPattern() {
    return /\b(healed|heals|healing\s+finishes|fully\s+healed|cured|cures|fully\s+recovered|recovered|recovers|restored|restores|regenerated|regenerates|knitted\s+closed|sealed\s+shut|mended|gone|vanished|removed|cleared|whole\s+again|sound\s+again|as\s+good\s+as\s+new|no\s+trace\s+remains?|closes?\s+completely|pain\s+fades?\s+completely|full\s+use\s+returns?|restored\s+to\s+full\s+use|moves?\s+normally\s+again|can\s+(?:move|stand|walk|grip|breathe|see|focus)\s+normally\s+again|no\s+longer\s+impairs?|no\s+longer\s+(?:hurts|bleeds|aches|limits|hinders)|fully\s+functional|back\s+to\s+normal|works?\s+normally\s+again)\b/i;
}

function hasActorClauseResolvedEvidence(text, actorPattern, resolvedPattern) {
    const source = String(text || '');
    const clauses = source.split(/(?<=[.!?;])\s+|\s+(?:but|while|though|although|however)\s+/i);
    for (const clause of clauses) {
        if (actorPattern.test(clause) && resolvedPattern.test(clause)) return true;
        actorPattern.lastIndex = 0;
        resolvedPattern.lastIndex = 0;
    }
    return false;
}

function hasActorScopedConditionEvidence(condition, narration, actorName = '') {
    if (!isInjuryCondition(condition)) return true;
    const evidence = conditionEvidencePattern(condition);
    if (!evidence) return false;
    const text = String(narration || '');
    const actor = cleanScalar(actorName);
    if (!actor || isNoneValue(actor)) return evidence.test(text);
    if (actor.toLowerCase() === 'user') {
        const userAnchor = /\b(?:you|your|yours|yourself|user|player|protagonist)\b/i;
        return nearPattern(text, userAnchor, evidence, 120);
    }
    return nearPattern(text, new RegExp(`\\b${escapeRegExp(actor)}\\b`, 'i'), evidence, 160);
}

function conditionEvidencePattern(condition) {
    if (condition === 'bruised') return /\b(bruis(?:e|ed|ing)|welt(?:ed|s)?|sore|aching)\b/i;
    if (condition === 'wounded') return /\b(wounded|injured|bleed(?:ing|s)?|blood(?:ied|y)?|cut|cuts|gashed?|gash|stabbed|pierced|burn(?:ed|s)?)\b/i;
    if (condition === 'badly_wounded') return /\b(badly wounded|seriously wounded|gravely wounded|deep wound|heavy bleeding|bleeding heavily|broken|fractur(?:e|ed)|dislocat(?:e|ed)|mangled|torn|impaled)\b/i;
    if (condition === 'critical') return /\b(critical|dying|near death|fatal|unconscious|paraly[sz]ed|shattered|crushed|ruptured)\b/i;
    if (condition === 'incapacitated') return /\b(incapacitated|unconscious|knocked out|unable to continue|disabled|helpless|immobilized|immobilised)\b/i;
    if (condition === 'dead') return /\b(dead|dies|died|killed|lifeless|corpse|not breathing|no pulse)\b/i;
    return null;
}

function nearPattern(text, actorPattern, evidencePattern, distance) {
    const source = String(text || '');
    const actorMatches = Array.from(source.matchAll(new RegExp(actorPattern.source, actorPattern.flags.includes('g') ? actorPattern.flags : `${actorPattern.flags}g`)));
    const evidenceMatches = Array.from(source.matchAll(new RegExp(evidencePattern.source, evidencePattern.flags.includes('g') ? evidencePattern.flags : `${evidencePattern.flags}g`)));
    for (const actor of actorMatches) {
        for (const evidence of evidenceMatches) {
            if (Math.abs((actor.index || 0) - (evidence.index || 0)) <= distance) return true;
        }
    }
    return false;
}

function escapeRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function trackerSnapshotToLedgerEntries(trackerSnapshot) {
    return Object.entries(trackerSnapshot || {}).map(([NPC, entry]) => ({
        NPC,
        currentDisposition: entry?.currentDisposition
            ? `B${entry.currentDisposition.B}/F${entry.currentDisposition.F}/H${entry.currentDisposition.H}`
            : null,
        dispositionContinuity: dispositionContinuityLine(NPC, entry),
        intimacyState: entry?.intimacyState
            ? `${entry.intimacyState.boundary || 'NONE'}/${entry.intimacyState.source || 'NONE'}/${entry.intimacyState.refusalStyle || 'NONE'}`
            : 'NONE/NONE/NONE',
        dominantLock: entry?.dominantLock || 'None',
        pressureMode: entry?.pressureMode || 'none',
        currentRapport: Number(entry?.currentRapport ?? 0),
        establishedRelationship: entry?.establishedRelationship === 'Y' ? 'Y' : 'N',
        slowBondEvidence: entry?.slowBondEvidence || {},
        currentCoreStats: entry?.currentCoreStats
            ? readCoreObject(entry.currentCoreStats)
            : { Rank: 'none', MainStat: 'none', PHY: 1, MND: 1, CHA: 1 },
        condition: normalizeTrackerStateCondition(entry?.condition),
        wounds: readPlainArray(entry?.wounds),
        statusEffects: readPlainArray(entry?.statusEffects),
        gear: readPlainArray(entry?.gear),
    }));
}

function buildDispositionContinuityContext(trackerSnapshot) {
    const lines = Object.entries(trackerSnapshot || {})
        .map(([NPC, entry]) => dispositionContinuityLine(NPC, entry))
        .filter(line => line && !isNoneValue(line));
    return lines.length
        ? lines.join('\n')
        : '(none)';
}

function dispositionContinuityLine(NPC, entry = {}) {
    const fin = entry?.currentDisposition;
    const parts = [];
    if (!fin) return `${NPC}: no saved disposition; do not assume continuity.`;
    const currentDisposition = `B${fin.B}/F${fin.F}/H${fin.H}`;
    parts.push(`${NPC}: saved disposition ${currentDisposition}.`);
    if (Number(fin.F || 0) >= 4) {
        parts.push('Terror is already established toward {{user}}; withdrawal, surrender, distance, escape, standing down, or allowing passage may be pre-decided by disposition instead of a new roll.');
    } else if (Number(fin.F || 0) >= 3) {
        parts.push('Fear is already established toward {{user}}; cautious compliance, distance, appeasement, or de-escalation may be pre-decided by disposition instead of a new roll.');
    }
    if (Number(fin.H || 0) >= 4) {
        parts.push('Hatred is already established; do not reroll whether this NPC is hostile, but new fights, pursuit, restraint, bargaining, secrets, resources, deception, or access still create new unresolved stakes.');
    } else if (Number(fin.H || 0) >= 3) {
        parts.push('Hostility is already established; do not reroll whether this NPC is hostile, but new contests still roll.');
    }
    const intimacy = entry?.intimacyState || {};
    if (['ALLOW', 'DENY'].includes(String(intimacy.boundary || '').toUpperCase())) {
        parts.push(`Persisted intimacy boundary is ${String(intimacy.boundary).toUpperCase()}; do not re-check that boundary unless the latest input creates a material boundary change, violation, or new escalation.`);
    }
    const socialMemory = normalizeSocialResolutionMemory(entry?.socialResolutionMemory);
    for (const bucket of ['Bluff', 'Intimidate']) {
        const memory = socialMemory[bucket];
        if (memory?.resolved === 'Y' && memory.disposition === currentDisposition) {
            const label = bucket === 'Bluff' ? 'Bluff/deception' : 'Intimidate/coercion';
            const goalText = memory.goal ? ` for goal "${memory.goal}"` : '';
            parts.push(`${label} already resolved as ${memory.outcome}${goalText} under this current disposition; repeated wording, stronger pressure, insults, theatrical display, or renewed demands against this same NPC/goal are not a fresh Social/${bucket} contest.`);
        }
    }
    if (entry?.pressureMode === 'cornered') {
        parts.push('Pressure mode is cornered; pursuit, restraint, blocking escape, or forced compliance remains new pressure and may roll.');
    }
    parts.push('This continuity applies only to the already-settled reaction. Combat, pursuit, restraint, theft, bargaining, deception, secrets, access, resources, or environmental obstacles remain new unresolved stakes when present.');
    return parts.join(' ');
}

function validateRelationshipCoverage(resolutionEngine, relationshipEngine) {
    const requiredNames = [
        ...resolutionEngine.identifyTargets.ActionTargets,
        ...resolutionEngine.identifyTargets.OppTargets.NPC,
        ...resolutionEngine.identifyTargets.BenefitedObservers,
        ...resolutionEngine.identifyTargets.HarmedObservers,
        ...resolutionEngine.identifyTargets.NPCAwareOfUser,
    ].filter(name => name && !isNoneValue(name));
    const relationshipNames = new Set(relationshipEngine.map(item => normalizeNameKey(item.NPC)));
    const missing = requiredNames.filter(name => !relationshipNames.has(normalizeNameKey(name)));
    if (missing.length) {
        throw new Error(`compact ledger missing RelationshipEngine entry for target/observer/awareness names: ${missing.join(', ')}`);
    }
}

function repairRelationshipCoverage(resolutionEngine, relationshipEngine, source = 'semantic_ledger') {
    const missing = missingRelationshipCoverageNames(resolutionEngine, relationshipEngine);
    if (!missing.length) return null;

    const fallbackStats = fallbackRelationshipCoreStats(resolutionEngine?.genStats);
    for (const npc of missing) {
        relationshipEngine.push(createFallbackRelationshipEntry(npc, fallbackStats));
    }

    return {
        source,
        reason: 'missing RelationshipEngine entry for target/observer/awareness living NPC',
        repairedNPCs: missing,
        fallback: 'neutral semantic relationship entry; deterministic B/F/H still applies',
    };
}

function missingRelationshipCoverageNames(resolutionEngine, relationshipEngine) {
    const requiredNames = uniquePlainNames([
        ...(resolutionEngine?.identifyTargets?.ActionTargets || []),
        ...(resolutionEngine?.identifyTargets?.OppTargets?.NPC || []),
        ...(resolutionEngine?.identifyTargets?.BenefitedObservers || []),
        ...(resolutionEngine?.identifyTargets?.HarmedObservers || []),
        ...(resolutionEngine?.identifyTargets?.NPCAwareOfUser || []),
    ]);
    const relationshipNames = new Set((relationshipEngine || []).map(item => normalizeNameKey(item?.NPC)).filter(Boolean));
    return requiredNames.filter(name => !relationshipNames.has(normalizeNameKey(name)));
}

function createFallbackRelationshipEntry(NPC, genStats) {
    const stakeChangeByOutcome = {};
    for (const outcomeKey of STAKE_OUTCOME_KEYS) {
        stakeChangeByOutcome[outcomeKey] = 'none';
    }
    return {
        NPC,
        initPreset: {
            romanticOpen: false,
            userBadRep: false,
            priorUserGoodRep: false,
            userNonHuman: false,
            fearImmunity: false,
        },
        auditInteraction: false,
        establishedRelationship: false,
        romanceStyle: 'auto',
        slowBondEvidence: {
            respectfulContact: false,
            cooperation: false,
            comfortInProximity: false,
            boundaryRespect: false,
            sharedRoutine: false,
            playfulness: false,
            teamwork: false,
            personalAttention: false,
            blockers: [],
        },
        explicitIntimidationOrCoercion: false,
        stakeChangeByOutcome,
        overrideFlags: {
            CurrentInvitation: false,
            Exploitation: false,
            Hedonist: false,
            Transactional: false,
            Established: false,
            RomanticBuildup: false,
        },
        genStats,
    };
}

function fallbackRelationshipCoreStats(genStats) {
    const stats = normalizeGeneratedStatsSeed(genStats);
    const hasUsableStats = stats.Rank !== 'none'
        || stats.MainStat !== 'none';
    return hasUsableStats
        ? stats
        : { Rank: 'Average', MainStat: 'Balanced' };
}

function mergeSemanticLedgerRepair(previous, next) {
    if (!previous) return next;
    return {
        ...previous,
        ...next,
        repairedNPCs: uniquePlainNames([
            ...(previous.repairedNPCs || []),
            ...(next.repairedNPCs || []),
        ]),
    };
}

function uniquePlainNames(values) {
    const seen = new Set();
    const result = [];
    for (const value of values || []) {
        const name = cleanScalar(value);
        if (!name || isNoneValue(name)) continue;
        const key = normalizeNameKey(name);
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(name);
    }
    return result;
}

function readCoreGroup(fields, prefix) {
    return {
        Rank: normalizeRank(fields.get(`${prefix}.Rank`)),
        MainStat: normalizeMainStat(fields.get(`${prefix}.MainStat`)),
        PHY: clampNumber(readNumber(fields, `${prefix}.PHY`, 1), 1, 10),
        MND: clampNumber(readNumber(fields, `${prefix}.MND`, 1), 1, 10),
        CHA: clampNumber(readNumber(fields, `${prefix}.CHA`, 1), 1, 10),
    };
}

function readGeneratedStatsSeed(fields, prefix) {
    return {
        Rank: normalizeRank(fields.get(`${prefix}.Rank`)),
        MainStat: normalizeMainStat(fields.get(`${prefix}.MainStat`)),
    };
}

function readCoreObject(value) {
    return {
        Rank: normalizeRank(value?.Rank),
        MainStat: normalizeMainStat(value?.MainStat),
        PHY: clampNumber(Number(value?.PHY ?? 1), 1, 10),
        MND: clampNumber(Number(value?.MND ?? 1), 1, 10),
        CHA: clampNumber(Number(value?.CHA ?? 1), 1, 10),
    };
}

function readBoolean(fields, key, fallback) {
    return toBoolean(fields.get(key), fallback);
}

function readNumber(fields, key, fallback) {
    const number = Number(String(fields.get(key) ?? '').trim());
    return Number.isFinite(number) ? number : fallback;
}

function readList(fields, key, fallback = []) {
    const value = cleanScalar(fields.get(key));
    if (!value || isNoneValue(value)) return fallback;
    return value
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .split(/[;,]/)
        .map(cleanScalar)
        .filter(item => item && !isNoneValue(item));
}

function readActionUnits(fields, count = 0) {
    const units = [];
    for (let index = 0; index < count; index += 1) {
        const prefix = `ResolutionEngine.actionUnits[${index}]`;
        units.push({
            id: cleanScalar(fields.get(`${prefix}.id`)) || `A${index + 1}`,
            action: cleanScalar(fields.get(`${prefix}.action`)) || '(none)',
            evidence: cleanScalar(fields.get(`${prefix}.evidence`)) || '(none)',
        });
    }
    return units;
}

function cleanScalar(value) {
    return String(value ?? '')
        .trim()
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .replace(/^["']|["']$/g, '')
        .trim();
}

function isNoneValue(value) {
    const text = String(value ?? '').trim().toLowerCase();
    return !text || text === '(none)' || text === 'none' || text === 'null' || text === 'n/a';
}

function normalizeRank(value) {
    const text = cleanScalar(value).toLowerCase();
    const map = { weak: 'Weak', average: 'Average', trained: 'Trained', elite: 'Elite', boss: 'Boss', none: 'none' };
    return map[text] || 'none';
}

function normalizeMainStat(value) {
    const text = cleanScalar(value).toLowerCase();
    const map = { phy: 'PHY', mnd: 'MND', cha: 'CHA', balanced: 'Balanced', none: 'none' };
    return map[text] || 'none';
}

function normalizeActionBucket(value, rollNeeded = true) {
    if (!toBoolean(rollNeeded, false)) return 'None';
    const text = cleanScalar(value).toLowerCase().replace(/[\s_-]+/g, '');
    if (text === 'social') return 'Social';
    if (text === 'combat') return 'Combat';
    if (['challenge', 'physical', 'environment', 'environmental', 'env'].includes(text)) return 'Challenge';
    return 'None';
}

function normalizeSocialBucket(value, actionBucket = 'None') {
    if (actionBucket !== 'Social') return 'None';
    const text = cleanScalar(value).toLowerCase().replace(/[\s_-]+/g, '');
    if (['diplomacy', 'persuasion', 'persuade', 'negotiate', 'negotiation', 'reassure', 'reassurance'].includes(text)) return 'Diplomacy';
    if (['bluff', 'deception', 'deceive', 'lie', 'lying', 'mislead', 'trick'].includes(text)) return 'Bluff';
    if (['intimidate', 'intimidation', 'threat', 'threaten', 'coerce', 'coercion', 'blackmail'].includes(text)) return 'Intimidate';
    return 'None';
}

function normalizeCombatType(value, actionBucket = 'None') {
    if (actionBucket !== 'Combat') return 'None';
    const text = cleanScalar(value).toLowerCase().replace(/[\s_-]+/g, '');
    if (['spellorsupernatural', 'spell', 'supernatural', 'magic', 'magical', 'power', 'ability'].includes(text)) return 'SpellOrSupernatural';
    if (['mundane', 'physical', 'weapon', 'bodily', 'naturalweapon', 'naturalweapons'].includes(text)) return 'Mundane';
    return 'Mundane';
}

function normalizeEnvironmentDifficulty(value, actionBucket = 'Challenge') {
    if (actionBucket !== 'Challenge') return 0;
    const number = Number(cleanScalar(value));
    return [0, 4, 8, 12].includes(number) ? number : 0;
}

function normalizeEnvironmentDifficultyTier(value, actionBucket = 'Challenge') {
    if (actionBucket !== 'Challenge') return 'none';
    const text = cleanScalar(value).toLowerCase();
    if (ENVIRONMENT_DIFFICULTY_TIERS.includes(text)) return text;
    const numericFallback = normalizeEnvironmentDifficulty(value, 'Challenge');
    if (numericFallback >= 12) return 'extreme';
    if (numericFallback >= 8) return 'hard';
    if (numericFallback >= 4) return 'average';
    return 'none';
}

function environmentDifficultyFromTier(value, actionBucket = 'Challenge') {
    if (actionBucket !== 'Challenge') return 0;
    switch (normalizeEnvironmentDifficultyTier(value, 'Challenge')) {
        case 'average': return 4;
        case 'hard': return 8;
        case 'extreme': return 12;
        case 'easy':
        case 'none':
        default:
            return 0;
    }
}

function normalizeGeneratedStatsSeed(value) {
    return {
        Rank: normalizeRank(value?.Rank),
        MainStat: normalizeMainStat(value?.MainStat),
    };
}

function normalizeStakeChangeValue(value) {
    const text = cleanScalar(value).toLowerCase();
    return ['benefit', 'harm', 'none'].includes(text) ? text : 'none';
}

function normalizeRomanceStyle(value) {
    const text = cleanScalar(value).toLowerCase();
    return ['auto', 'nervous', 'flirt'].includes(text) ? text : 'auto';
}

function normalizeDetectMode(value) {
    const text = cleanScalar(value).toLowerCase();
    if (text === 'person') return 'PERSON';
    if (text === 'location') return 'LOCATION';
    return 'none';
}

function normalizeInjuryEffectTargetRole(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    const map = {
        opptarget: 'OppTarget',
        opp_target: 'OppTarget',
        harmedobserver: 'HarmedObserver',
        harmed_observer: 'HarmedObserver',
        actiontarget: 'ActionTarget',
        action_target: 'ActionTarget',
        user: 'User',
        other: 'Other',
    };
    return map[text] || 'Other';
}

function normalizeInjuryEffectType(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    return ['none', 'physical_injury', 'burn', 'poison', 'paralysis', 'disease', 'blindness', 'stun', 'fear', 'restraint', 'curse', 'electrical', 'exhaustion', 'mental_status', 'other_status'].includes(text)
        ? text
        : 'none';
}

function normalizeInjuryEffectSeverity(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    return ['minor', 'moderate', 'severe', 'critical'].includes(text) ? text : 'minor';
}

function normalizeInjuryEffectPersistence(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    return ['lasting', 'persistent', 'ongoing', 'continuing', 'y', 'yes', 'true'].includes(text) ? 'lasting' : 'none';
}

function normalizeTrackerDeltaCondition(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    if (text === 'defeated') return 'incapacitated';
    return TRACKER_CONDITIONS.includes(text) ? text : 'unchanged';
}

function normalizeTrackerStateCondition(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    if (text === 'defeated') return 'incapacitated';
    return TRACKER_CONDITIONS.includes(text) && text !== 'unchanged' ? text : 'healthy';
}

function normalizeTrackerDeltaList(value) {
    if (!Array.isArray(value)) return [];
    return value.map(cleanScalar).filter(item => item && !isNoneValue(item) && item.toLowerCase() !== 'unchanged').slice(0, 20);
}

function normalizePersonalitySummary(value) {
    const text = cleanScalar(value).replace(/\s+/g, ' ').trim();
    if (!text || isNoneValue(text) || ['unknown', 'unchanged'].includes(text.toLowerCase())) return '';
    return text.slice(0, 320);
}

function normalizeRevealedName(value) {
    const text = cleanScalar(value).replace(/\s+/g, ' ').trim();
    if (!text || isNoneValue(text) || ['unknown', 'unchanged'].includes(text.toLowerCase())) return '';
    if (!/^[\p{L}][\p{L}' -]{1,40}$/u.test(text)) return '';
    return text
        .split(/[\s-]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
        .slice(0, 60);
}

function normalizeTrackerDelta(value, fields) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        condition: normalizeTrackerDeltaCondition(source.condition),
        revealedName: normalizeRevealedName(source.revealedName),
        personalitySummary: normalizePersonalitySummary(source.personalitySummary),
        ...Object.fromEntries(fields.map(field => [field, normalizeTrackerDeltaList(source[field])])),
    };
}

function readPlainArray(value) {
    return Array.isArray(value)
        ? value.map(cleanScalar).filter(item => item && !isNoneValue(item)).slice(0, 40)
        : [];
}

function normalizeNameKey(name) {
    return cleanScalar(name).toLowerCase();
}

function clampNumber(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
}

function normalizeLedger(ledger) {
    ledger.engineContext = ledger.engineContext || {};
    ledger.engineContext.userCoreStats = normalizeCore(ledger.engineContext.userCoreStats);
    ledger.engineContext.trackerRelevantNPCs = normalizeTrackerRelevantNPCs(ledger.engineContext.trackerRelevantNPCs);
    ledger.resolutionEngine = ledger.resolutionEngine || {};
    ledger.resolutionEngine.identifyGoal = ledger.resolutionEngine.identifyGoal || 'Normal_Interaction';
    ledger.resolutionEngine.identifyChallenge = ledger.resolutionEngine.identifyChallenge || ledger.resolutionEngine.explicitMeans || ledger.resolutionEngine.identifyGoal;
    ledger.resolutionEngine.identifyTargets = ledger.resolutionEngine.identifyTargets || {};
    ledger.resolutionEngine.identifyTargets.hostilesInScene = ledger.resolutionEngine.identifyTargets.hostilesInScene || {};
    ledger.resolutionEngine.identifyTargets.hostilesInScene.NPC = readPlainArray(ledger.resolutionEngine.identifyTargets.hostilesInScene.NPC);
    ledger.resolutionEngine.identifyTargets.OppTargets = ledger.resolutionEngine.identifyTargets.OppTargets || {};
    ledger.resolutionEngine.identifyTargets.ActionTargets = readPlainArray(ledger.resolutionEngine.identifyTargets.ActionTargets);
    ledger.resolutionEngine.identifyTargets.OppTargets.NPC = readPlainArray(ledger.resolutionEngine.identifyTargets.OppTargets.NPC);
    ledger.resolutionEngine.identifyTargets.OppTargets.ENV = readPlainArray(ledger.resolutionEngine.identifyTargets.OppTargets.ENV);
    ledger.resolutionEngine.identifyTargets.BenefitedObservers = readPlainArray(ledger.resolutionEngine.identifyTargets.BenefitedObservers);
    ledger.resolutionEngine.identifyTargets.HarmedObservers = readPlainArray(ledger.resolutionEngine.identifyTargets.HarmedObservers);
    ledger.resolutionEngine.identifyTargets.NPCAwareOfUser = readPlainArray(ledger.resolutionEngine.identifyTargets.NPCAwareOfUser);
    ledger.resolutionEngine.identifyTargets.PowerActors = readPlainArray(ledger.resolutionEngine.identifyTargets.PowerActors);
    const rawActionMarkers = readPlainArray(ledger.resolutionEngine.actionCount);
    ledger.resolutionEngine.actionCount = normalizeActionMarkers(rawActionMarkers);
    ledger.resolutionEngine.actionUnits = normalizeActionUnits(
        ledger.resolutionEngine.actionUnits,
        ledger.resolutionEngine.actionCount,
        ledger.resolutionEngine,
        rawActionMarkers,
    );
    ledger.resolutionEngine.userAbilityUse = normalizeUserAbilityUse(ledger.resolutionEngine.userAbilityUse);
    ledger.resolutionEngine.itemUse = normalizeItemUse(ledger.resolutionEngine.itemUse);
    ledger.resolutionEngine.claimCheck = normalizeClaimCheck(ledger.resolutionEngine.claimCheck);
    ledger.resolutionEngine.rollNeeded = toBoolean(ledger.resolutionEngine.rollNeeded, false);
    ledger.resolutionEngine.rollReason = cleanScalar(ledger.resolutionEngine.rollReason) || '(none)';
    ledger.resolutionEngine.actionBucket = normalizeActionBucket(ledger.resolutionEngine.actionBucket, ledger.resolutionEngine.rollNeeded);
    ledger.resolutionEngine.socialBucket = normalizeSocialBucket(ledger.resolutionEngine.socialBucket, ledger.resolutionEngine.actionBucket);
    ledger.resolutionEngine.combatType = normalizeCombatType(ledger.resolutionEngine.combatType, ledger.resolutionEngine.actionBucket);
    ledger.resolutionEngine.environmentDifficultyTier = normalizeEnvironmentDifficultyTier(
        ledger.resolutionEngine.environmentDifficultyTier ?? ledger.resolutionEngine.environmentDifficulty,
        ledger.resolutionEngine.actionBucket,
    );
    ledger.resolutionEngine.environmentDifficulty = environmentDifficultyFromTier(
        ledger.resolutionEngine.environmentDifficultyTier,
        ledger.resolutionEngine.actionBucket,
    );
    ledger.resolutionEngine.intimacyAdvanceExplicit = toBoolean(ledger.resolutionEngine.intimacyAdvanceExplicit, false);
    ledger.resolutionEngine.boundaryViolationExplicit = toBoolean(ledger.resolutionEngine.boundaryViolationExplicit, false);
    ledger.resolutionEngine.nonLethal = toBoolean(ledger.resolutionEngine.nonLethal, false);
    ledger.resolutionEngine.classifyHostilePhysicalIntent = toBoolean(ledger.resolutionEngine.classifyHostilePhysicalIntent, false);
    ledger.resolutionEngine.activeHostileThreat = toBoolean(ledger.resolutionEngine.activeHostileThreat, false);
    ledger.resolutionEngine.classifyPhysicalBoundaryPressure = toBoolean(ledger.resolutionEngine.classifyPhysicalBoundaryPressure, false);
    delete ledger.resolutionEngine.hostilePhysicalIntent;
    delete ledger.resolutionEngine.primaryOppTarget;
    delete ledger.resolutionEngine.primaryOpposition;
    ledger.resolutionEngine.genStats = normalizeGeneratedStatsSeed(ledger.resolutionEngine.genStats);
    ledger.relationshipEngine = Array.isArray(ledger.relationshipEngine) ? ledger.relationshipEngine : [];
    ledger.relationshipEngine.forEach(item => {
        item.initPreset = normalizeInitPresetFlags(item.initPreset);
        item.stakeChangeByOutcome = item.stakeChangeByOutcome || {};
        item.overrideFlags = item.overrideFlags || {};
        item.overrideFlags.CurrentInvitation = toBoolean(item.overrideFlags.CurrentInvitation, false);
        item.overrideFlags.Exploitation = toBoolean(item.overrideFlags.Exploitation, false);
        item.overrideFlags.Hedonist = toBoolean(item.overrideFlags.Hedonist, false);
        item.overrideFlags.Transactional = toBoolean(item.overrideFlags.Transactional, false);
        item.overrideFlags.Established = toBoolean(item.overrideFlags.Established, false);
        item.overrideFlags.RomanticBuildup = toBoolean(item.overrideFlags.RomanticBuildup, false);
        item.romanceStyle = normalizeRomanceStyle(item.romanceStyle);
        item.slowBondEvidence = item.slowBondEvidence || {};
        item.slowBondEvidence.respectfulContact = toBoolean(item.slowBondEvidence.respectfulContact, false);
        item.slowBondEvidence.cooperation = toBoolean(item.slowBondEvidence.cooperation, false);
        item.slowBondEvidence.comfortInProximity = toBoolean(item.slowBondEvidence.comfortInProximity, false);
        item.slowBondEvidence.boundaryRespect = toBoolean(item.slowBondEvidence.boundaryRespect, false);
        item.slowBondEvidence.sharedRoutine = toBoolean(item.slowBondEvidence.sharedRoutine, false);
        item.slowBondEvidence.playfulness = toBoolean(item.slowBondEvidence.playfulness, false);
        item.slowBondEvidence.teamwork = toBoolean(item.slowBondEvidence.teamwork, false);
        item.slowBondEvidence.personalAttention = toBoolean(item.slowBondEvidence.personalAttention, false);
        item.slowBondEvidence.blockers = readPlainArray(item.slowBondEvidence.blockers);
        item.genStats = normalizeGeneratedStatsSeed(item.genStats);
    });
    const relationshipRepair = repairRelationshipCoverage(ledger.resolutionEngine, ledger.relationshipEngine, 'normalized_ledger');
    if (relationshipRepair) {
        ledger.deterministicOverrides = {
            ...(ledger.deterministicOverrides || {}),
            semanticLedgerRepair: mergeSemanticLedgerRepair(
                ledger.deterministicOverrides?.semanticLedgerRepair,
                relationshipRepair,
            ),
        };
    }
    ledger.injuryEffectEngine = ledger.injuryEffectEngine || {};
    ledger.injuryEffectEngine.effects = Array.isArray(ledger.injuryEffectEngine.effects)
        ? ledger.injuryEffectEngine.effects.map(item => {
            const target = cleanScalar(item?.target);
            if (!target || isNoneValue(target)) return null;
            return {
                target,
                targetRole: normalizeInjuryEffectTargetRole(item?.targetRole),
                effectType: normalizeInjuryEffectType(item?.effectType),
                bodyPart: cleanScalar(item?.bodyPart) || 'body',
                description: cleanScalar(item?.description) || '(none)',
                severityFloor: normalizeInjuryEffectSeverity(item?.severityFloor),
                persistence: normalizeInjuryEffectPersistence(item?.persistence),
                affectsAction: toBoolean(item?.affectsAction, false),
            };
        }).filter(Boolean)
        : [];
    ledger.userKnowledgeApplication = ledger.userKnowledgeApplication || {};
    ledger.userKnowledgeApplication.applications = Array.isArray(ledger.userKnowledgeApplication.applications)
        ? ledger.userKnowledgeApplication.applications.map(normalizeUserKnowledgeApplication).filter(Boolean)
        : [];
    applyUserKnowledgeApplicationsToInitPresets(ledger.relationshipEngine, ledger.userKnowledgeApplication.applications);
    ledger.powerActorEnmity = ledger.powerActorEnmity || {};
    ledger.powerActorEnmity.assessments = Array.isArray(ledger.powerActorEnmity.assessments)
        ? ledger.powerActorEnmity.assessments.map(normalizePowerActorAssessment).filter(Boolean)
        : [];
    ledger.powerActorEnmity.effects = Array.isArray(ledger.powerActorEnmity.effects)
        ? ledger.powerActorEnmity.effects.map(normalizePowerActorEffect).filter(Boolean)
        : [];
    ledger.powerEventShape = ledger.powerEventShape || {};
    ledger.powerEventShape.events = Array.isArray(ledger.powerEventShape.events)
        ? ledger.powerEventShape.events.map(normalizePowerEventShape).filter(Boolean)
        : [];
    ledger.trackerUpdateEngine = ledger.trackerUpdateEngine || {};
    ledger.trackerUpdateEngine.user = normalizeTrackerDelta(ledger.trackerUpdateEngine.user, TRACKER_USER_DELTA_FIELDS);
    ledger.trackerUpdateEngine.npcs = Array.isArray(ledger.trackerUpdateEngine.npcs)
        ? ledger.trackerUpdateEngine.npcs.map(item => {
            const npc = cleanScalar(item?.NPC);
            if (!npc || isNoneValue(npc)) return null;
        return {
            NPC: npc,
            ...normalizeTrackerDelta(item, TRACKER_NPC_DELTA_FIELDS),
        };
        }).filter(Boolean)
        : [];
    ledger.chaosSemantic = ledger.chaosSemantic || { sceneSummary: '' };
    ledger.proactivitySemantic = {};
    return ledger;
}

function normalizeUserAbilityUse(value) {
    const source = value && typeof value === 'object' ? value : {};
    const rawUsed = toBoolean(source.used ?? source.Used, false);
    const attempted = toBoolean(source.attempted ?? source.Attempted, rawUsed);
    const available = toBoolean(source.available ?? source.Available, rawUsed);
    const used = attempted && available && rawUsed;
    const abilityName = cleanScalar(source.abilityName ?? source.AbilityName) || '(none)';
    const evidence = cleanScalar(source.evidence ?? source.Evidence) || '(none)';
    const narrativeEffect = cleanScalar(source.narrativeEffect ?? source.NarrativeEffect) || '(none)';
    const noEffectReason = cleanScalar(source.noEffectReason ?? source.NoEffectReason) || '(none)';
    const keepAttemptDetails = attempted && !isNoneValue(abilityName);
    return {
        used,
        attempted,
        available: attempted && available,
        abilityName: keepAttemptDetails ? abilityName : '(none)',
        evidence: attempted && !isNoneValue(evidence) ? evidence : '(none)',
        narrativeEffect: attempted && !isNoneValue(narrativeEffect) ? narrativeEffect : '(none)',
        noEffectReason: attempted && !available && !isNoneValue(noEffectReason) ? noEffectReason : '(none)',
        mechanicalScope: 'flavor_only_no_bonus',
    };
}

function normalizeItemUse(value) {
    const source = value && typeof value === 'object' ? value : {};
    const attempted = toBoolean(source.attempted ?? source.Attempted, false);
    const rawAvailable = toBoolean(source.available ?? source.Available, false);
    const item = cleanScalar(source.item ?? source.Item) || '(none)';
    const rawSource = cleanScalar(source.source ?? source.Source).toLowerCase().replace(/[\s-]+/g, '_');
    let itemSource = ITEM_USE_SOURCES.includes(rawSource) ? rawSource : 'unavailable';
    const evidence = cleanScalar(source.evidence ?? source.Evidence) || '(none)';
    const noEffectReason = cleanScalar(source.noEffectReason ?? source.NoEffectReason) || '(none)';
    if (!attempted) itemSource = 'none';
    const availableSources = ['gear', 'inventory'];
    const available = attempted && rawAvailable && availableSources.includes(itemSource);
    if (attempted && !available) itemSource = 'unavailable';
    return {
        attempted,
        available,
        item: attempted && !isNoneValue(item) ? item : '(none)',
        source: itemSource,
        evidence: attempted && !isNoneValue(evidence) ? evidence : '(none)',
        noEffectReason: attempted && !available && !isNoneValue(noEffectReason) ? noEffectReason : '(none)',
    };
}

function normalizeClaimCheck(value) {
    const source = value && typeof value === 'object' ? value : {};
    const present = toBoolean(source.present ?? source.Present, false);
    const stakesImpact = toBoolean(source.stakesImpact ?? source.StakesImpact, false);
    const claim = cleanScalar(source.claim ?? source.Claim) || '(none)';
    const targetNPC = cleanScalar(source.targetNPC ?? source.TargetNPC) || '(none)';
    const rawTruthStatus = cleanScalar(source.truthStatus ?? source.TruthStatus).toLowerCase().replace(/[\s-]+/g, '_');
    const rawNpcAccess = cleanScalar(source.npcAccess ?? source.NPCAccess).toLowerCase().replace(/[\s-]+/g, '_');
    const truthStatus = CLAIM_TRUTH_STATUSES.includes(rawTruthStatus) ? rawTruthStatus : 'unknown';
    const npcAccess = CLAIM_NPC_ACCESS_LEVELS.includes(rawNpcAccess) ? rawNpcAccess : 'unknown';
    const reason = cleanScalar(source.reason ?? source.Reason) || '(none)';
    const keepDetails = present && !isNoneValue(claim);
    return {
        present,
        claim: keepDetails ? claim : '(none)',
        targetNPC: present && !isNoneValue(targetNPC) ? targetNPC : '(none)',
        truthStatus: present ? truthStatus : 'none',
        npcAccess: present ? npcAccess : 'none',
        stakesImpact: present && stakesImpact,
        reason: present && !isNoneValue(reason) ? reason : '(none)',
    };
}

function normalizeUserKnowledgeApplication(value) {
    const source = value && typeof value === 'object' ? value : {};
    const target = cleanScalar(source.target ?? source.Target).replace(/\s+/g, ' ').slice(0, 100) || '(none)';
    const entryIds = readPlainArray(source.entryIds ?? source.EntryIds ?? source.entryId ?? source.EntryId).slice(0, 12);
    const type = normalizeUserKnowledgeType(source.type ?? source.Type);
    const knownBy = cleanScalar(source.knownBy ?? source.KnownBy).replace(/\s+/g, ' ').slice(0, 140) || '(none)';
    const scope = normalizeUserKnowledgeScope(source.scope ?? source.Scope);
    const valence = normalizeUserKnowledgeValence(source.valence ?? source.Valence, true);
    const effect = normalizeUserKnowledgeApplicationEffect(source.effect ?? source.Effect);
    const line = cleanScalar(source.line ?? source.Line).replace(/\s+/g, ' ').slice(0, 220) || '(none)';
    const reason = cleanScalar(source.reason ?? source.Reason).replace(/\s+/g, ' ').slice(0, 220) || '(none)';
    if (isNoneValue(target) || isNoneValue(line) || effect === 'none') return null;
    return {
        target,
        entryIds,
        type,
        knownBy,
        scope,
        valence,
        effect,
        line,
        reason,
    };
}

function normalizeUserKnowledgeType(value) {
    const text = cleanScalar(value).replace(/[\s-]+/g, '');
    if (/^personal(?:knowledge)?$/i.test(text)) return 'personalKnowledge';
    if (/^reputation(?:knowledge)?$/i.test(text)) return 'reputationKnowledge';
    return 'personalKnowledge';
}

function normalizeUserKnowledgeScope(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    return USER_KNOWLEDGE_SCOPES.includes(text) ? text : 'private';
}

function normalizeUserKnowledgeValence(value, allowNone = false) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    if (allowNone && (text === 'none' || isNoneValue(text))) return 'none';
    return USER_REPUTATION_VALENCES.includes(text) ? text : (allowNone ? 'none' : 'good');
}

function normalizeUserKnowledgeTruth(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    return USER_KNOWLEDGE_TRUTH.includes(text) ? text : 'true';
}

function normalizeUserKnowledgeConfidence(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    return USER_KNOWLEDGE_CONFIDENCE.includes(text) ? text : 'certain';
}

function normalizeUserKnowledgeApplicationEffect(value) {
    const text = cleanScalar(value).replace(/[\s-]+/g, '');
    const match = USER_KNOWLEDGE_APPLICATION_EFFECTS.find(effect => effect.toLowerCase() === text.toLowerCase());
    return match || 'none';
}

function applyUserKnowledgeApplicationsToInitPresets(relationshipEngine = [], applications = []) {
    if (!Array.isArray(relationshipEngine) || !Array.isArray(applications) || !applications.length) return;
    const byTarget = new Map();
    for (const application of applications) {
        const target = normalizeNameKey(application?.target);
        if (!target || isNoneValue(target)) continue;
        const list = byTarget.get(target) || [];
        list.push(application);
        byTarget.set(target, list);
    }
    for (const relationship of relationshipEngine) {
        const targetApplications = byTarget.get(normalizeNameKey(relationship?.NPC)) || [];
        if (!targetApplications.length) continue;
        relationship.initPreset = normalizeInitPresetFlags(relationship.initPreset);
        for (const application of targetApplications) {
            if (application.effect === 'priorUserGoodRep') relationship.initPreset.priorUserGoodRep = true;
            if (application.effect === 'userBadRep') relationship.initPreset.userBadRep = true;
            if (application.effect === 'userNonHuman') relationship.initPreset.userNonHuman = true;
        }
    }
}

function normalizePowerActorAssessment(value) {
    const source = value && typeof value === 'object' ? value : {};
    const actor = cleanScalar(source.actor ?? source.Actor).replace(/\s+/g, ' ').slice(0, 100);
    if (!actor || isNoneValue(actor)) return null;
    const scope = normalizePowerActorAssessmentScope(source.scope ?? source.Scope);
    const isPowerActor = toBoolean(source.isPowerActor ?? source.IsPowerActor, false);
    const actorType = cleanScalar(source.actorType ?? source.ActorType).replace(/\s+/g, ' ').slice(0, 80) || (isPowerActor ? 'power actor' : 'ordinary actor');
    const reachSource = Array.isArray(source.reach ?? source.Reach)
        ? (source.reach ?? source.Reach)
        : String(source.reach ?? source.Reach ?? '')
            .split(',')
            .map(item => item.trim())
            .filter(Boolean);
    const reach = reachSource
        .map(item => cleanScalar(item).replace(/\s+/g, ' ').slice(0, 80))
        .filter(item => item && !isNoneValue(item))
        .slice(0, 8);
    const evidence = cleanScalar(source.evidence ?? source.Evidence).replace(/\s+/g, ' ').slice(0, 180) || '(none)';
    const assessmentReason = cleanScalar(source.assessmentReason ?? source.AssessmentReason ?? source.reason ?? source.Reason).replace(/\s+/g, ' ').slice(0, 180) || (isPowerActor ? 'has meaningful reach' : 'no meaningful reach beyond personal reaction');
    return {
        actor,
        scope,
        isPowerActor,
        actorType,
        reach,
        evidence,
        assessmentReason,
    };
}

function normalizePowerActorAssessmentScope(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    return POWER_ACTOR_ASSESSMENT_SCOPES.includes(text) ? text : 'unknown';
}

function normalizePowerActorEffect(value) {
    const source = value && typeof value === 'object' ? value : {};
    const actor = cleanScalar(source.actor ?? source.Actor).replace(/\s+/g, ' ').slice(0, 100);
    if (!actor || isNoneValue(actor)) return null;
    const effect = normalizePowerActorEffectType(source.effect ?? source.Effect);
    const severity = normalizePowerActorSeverity(source.severity ?? source.Severity);
    const hasReach = toBoolean(source.hasReach ?? source.HasReach, false);
    const knownToActor = toBoolean(source.knownToActor ?? source.KnownToActor, false);
    if (!hasReach || !knownToActor || effect === 'none' || severity === 'none') return null;
    const actorType = cleanScalar(source.actorType ?? source.ActorType).replace(/\s+/g, ' ').slice(0, 80) || 'power actor';
    const reason = cleanScalar(source.reason ?? source.Reason).replace(/\s+/g, ' ').slice(0, 180) || effect.replace(/_/g, ' ');
    return {
        actor,
        actorType,
        hasReach,
        effect,
        severity,
        reason,
        knownToActor,
    };
}

function normalizePowerEventShape(value) {
    const source = value && typeof value === 'object' ? value : {};
    const eventId = cleanScalar(source.eventId ?? source.EventId).replace(/\s+/g, ' ').slice(0, 80);
    const actor = cleanScalar(source.actor ?? source.Actor).replace(/\s+/g, ' ').slice(0, 100);
    if (!eventId || isNoneValue(eventId) || !actor || isNoneValue(actor)) return null;
    const fit = normalizePowerEventFit(source.fit ?? source.Fit);
    const eventType = normalizePowerEventType(source.eventType ?? source.EventType);
    if (fit === 'none') return null;
    const visibleInstruction = sanitizePowerEventVisibleInstruction(source.visibleInstruction ?? source.VisibleInstruction);
    return {
        eventId,
        actor,
        eventType,
        fit,
        visibleInstruction: fit === 'use_now' ? visibleInstruction : '(none)',
        contactName: cleanScalar(source.contactName ?? source.ContactName).replace(/\s+/g, ' ').slice(0, 80) || '(none)',
        contactGender: normalizePowerEventContactGender(source.contactGender ?? source.ContactGender),
        surfaceRole: cleanScalar(source.surfaceRole ?? source.SurfaceRole).replace(/\s+/g, ' ').slice(0, 120) || '(none)',
        deferReason: cleanScalar(source.deferReason ?? source.DeferReason).replace(/\s+/g, ' ').slice(0, 160) || '(none)',
    };
}

function normalizePowerEventType(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    return POWER_EVENT_TYPES.includes(text) ? text : 'none';
}

function normalizePowerEventFit(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    return POWER_EVENT_FITS.includes(text) ? text : 'none';
}

function normalizePowerEventContactGender(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    return POWER_EVENT_CONTACT_GENDERS.includes(text) ? text : 'unknown';
}

function sanitizePowerEventVisibleInstruction(value) {
    const text = cleanScalar(value).replace(/\s+/g, ' ').slice(0, 360);
    if (!text || isNoneValue(text)) return '(none)';
    if (/\b(?:spy|spies|agent|infiltrat(?:e|es|ed|ing|or|ors|ion)|sponsor|handler|hidden\s+(?:motive|allegiance|alignment|orders?)|secret\s+(?:motive|allegiance|alignment|orders?)|betray(?:al|s|ed|ing)?|double\s+agent|plant(?:ed)?\s+(?:contact|operative)|covert\s+operative)\b/i.test(text)) {
        return '(none)';
    }
    return text;
}

function normalizePowerActorEffectType(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    return POWER_ACTOR_EFFECT_TYPES.includes(text) ? text : 'none';
}

function normalizePowerActorSeverity(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    return POWER_ACTOR_SEVERITIES.includes(text) ? text : 'none';
}

function sanitizePowerActorSnapshotForSemantic(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const result = {};
    for (const [name, rawState] of Object.entries(source)) {
        const state = rawState && typeof rawState === 'object' ? rawState : {};
        const actor = cleanScalar(state.name ?? name).replace(/\s+/g, ' ').slice(0, 100);
        if (!actor || isNoneValue(actor)) continue;
        const pending = state.pendingEvent && typeof state.pendingEvent === 'object' ? state.pendingEvent : {};
        const agent = state.activeAgent && typeof state.activeAgent === 'object' ? state.activeAgent : {};
        result[actor] = {
            name: actor,
            type: cleanScalar(state.type ?? state.actorType).replace(/\s+/g, ' ').slice(0, 80) || 'power actor',
            enmity: toNumber(state.enmity, 0),
            tier: cleanScalar(state.tier).replace(/\s+/g, ' ').slice(0, 80) || 'Unaware',
            reasons: readPlainArray(state.reasons).slice(-4),
            pendingEvent: pending?.id ? {
                id: cleanScalar(pending.id).replace(/\s+/g, ' ').slice(0, 80),
                eventType: normalizePowerEventType(pending.eventType),
                severityBand: cleanScalar(pending.severityBand).replace(/\s+/g, ' ').slice(0, 40) || 'none',
                premise: cleanScalar(pending.premise).replace(/\s+/g, ' ').slice(0, 220) || '(none)',
                contactName: cleanScalar(pending.contactName).replace(/\s+/g, ' ').slice(0, 80) || '(none)',
                contactGender: normalizePowerEventContactGender(pending.contactGender),
                attempts: toNumber(pending.attempts, 0),
            } : null,
            activeAgent: agent?.name ? {
                name: cleanScalar(agent.name).replace(/\s+/g, ' ').slice(0, 80),
                gender: normalizePowerEventContactGender(agent.gender),
                coverRole: cleanScalar(agent.coverRole).replace(/\s+/g, ' ').slice(0, 120) || 'scene contact',
                actionCount: toNumber(agent.actionCount, 0),
            } : null,
        };
    }
    return result;
}

function sanitizeUserKnowledgeSnapshotForSemantic(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const personal = Array.isArray(source.personal) ? source.personal : [];
    const reputation = Array.isArray(source.reputation) ? source.reputation : [];
    return {
        personal: personal.map(entry => sanitizePersonalKnowledgeEntry(entry)).filter(Boolean).slice(-60),
        reputation: reputation.map(entry => sanitizeReputationKnowledgeEntry(entry)).filter(Boolean).slice(-60),
    };
}

function sanitizePersonalKnowledgeEntry(entry) {
    const source = entry && typeof entry === 'object' ? entry : {};
    const id = cleanScalar(source.id ?? source.entryId).replace(/\s+/g, ' ').slice(0, 80);
    const knownBy = cleanScalar(source.knownBy).replace(/\s+/g, ' ').slice(0, 140);
    const topic = cleanScalar(source.topic).replace(/\s+/g, ' ').slice(0, 140);
    const line = cleanScalar(source.line).replace(/\s+/g, ' ').slice(0, 220);
    if (!id || !knownBy || isNoneValue(knownBy) || !line || isNoneValue(line)) return null;
    return {
        id,
        type: 'personalKnowledge',
        knownBy,
        scope: normalizeUserKnowledgeScope(source.scope),
        topic: topic && !isNoneValue(topic) ? topic : '(none)',
        truth: normalizeUserKnowledgeTruth(source.truth),
        confidence: normalizeUserKnowledgeConfidence(source.confidence),
        line,
    };
}

function sanitizeReputationKnowledgeEntry(entry) {
    const source = entry && typeof entry === 'object' ? entry : {};
    const id = cleanScalar(source.id ?? source.entryId).replace(/\s+/g, ' ').slice(0, 80);
    const topic = cleanScalar(source.topic).replace(/\s+/g, ' ').slice(0, 140);
    const line = cleanScalar(source.line).replace(/\s+/g, ' ').slice(0, 220);
    if (!id || !line || isNoneValue(line)) return null;
    return {
        id,
        type: 'reputationKnowledge',
        scope: normalizeUserKnowledgeScope(source.scope),
        valence: normalizeUserKnowledgeValence(source.valence),
        topic: topic && !isNoneValue(topic) ? topic : '(none)',
        truth: normalizeUserKnowledgeTruth(source.truth),
        confidence: normalizeUserKnowledgeConfidence(source.confidence),
        line,
        origin: cleanScalar(source.origin).replace(/\s+/g, ' ').slice(0, 160) || '(none)',
    };
}

function normalizeCore(core) {
    return {
        Rank: core?.Rank ?? 'none',
        MainStat: core?.MainStat ?? 'none',
        PHY: toNumber(core?.PHY, 1),
        MND: toNumber(core?.MND, 1),
        CHA: toNumber(core?.CHA, 1),
    };
}

function normalizeTrackerRelevantNPCs(entries) {
    if (!Array.isArray(entries)) return [];
    return entries
        .map(entry => {
            const npc = cleanScalar(entry?.NPC);
            if (!npc || isNoneValue(npc)) return null;
            return {
                NPC: npc,
                currentDisposition: entry?.currentDisposition ?? null,
                dispositionContinuity: cleanScalar(entry?.dispositionContinuity).slice(0, 360) || '(none)',
                intimacyState: cleanScalar(entry?.intimacyState).slice(0, 80) || 'NONE/NONE/NONE',
                dominantLock: cleanScalar(entry?.dominantLock) || 'None',
                pressureMode: cleanScalar(entry?.pressureMode) || 'none',
                currentRapport: toNumber(entry?.currentRapport, 0),
                currentCoreStats: normalizeCore(entry?.currentCoreStats),
            };
        })
        .filter(Boolean);
}

function normalizeInitPresetFlags(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        romanticOpen: toBoolean(source.romanticOpen, false),
        userBadRep: toBoolean(source.userBadRep, false),
        priorUserGoodRep: toBoolean(source.priorUserGoodRep ?? source.userGoodRep, false),
        userNonHuman: toBoolean(source.userNonHuman, false),
        fearImmunity: toBoolean(source.fearImmunity ?? source.fearImmune, false),
    };
}

function normalizeActionMarkers(markers) {
    if (!Array.isArray(markers) || markers.length === 0) return ['a1'];
    return markers.slice(0, 3).map((_, index) => `a${index + 1}`);
}

function normalizeActionUnits(units, actionMarkers, resolutionEngine = {}, rawMarkers = []) {
    const markers = Array.isArray(actionMarkers) && actionMarkers.length ? actionMarkers : ['a1'];
    const source = Array.isArray(units) ? units : [];
    const fallbackBase = cleanScalar(
        resolutionEngine.identifyChallenge
        || resolutionEngine.explicitMeans
        || resolutionEngine.identifyGoal
        || '{{user}} takes the latest explicit action',
    ) || '{{user}} takes the latest explicit action';
    return markers.slice(0, 3).map((marker, index) => {
        const rawUnit = source[index] && typeof source[index] === 'object' ? source[index] : {};
        const rawMarker = cleanScalar(rawMarkers[index] ?? marker);
        const markerIsGeneric = /^a\d+$/i.test(rawMarker);
        let action = cleanScalar(rawUnit.action ?? rawUnit.Action ?? rawUnit.description ?? rawUnit.Description);
        if (!action || isNoneValue(action) || /^a\d+$/i.test(action)) {
            action = rawMarker && !markerIsGeneric ? rawMarker : fallbackBase;
        }
        let evidence = cleanScalar(rawUnit.evidence ?? rawUnit.Evidence);
        if (!evidence || isNoneValue(evidence)) {
            evidence = rawMarker && !markerIsGeneric ? rawMarker : '(none)';
        }
        return {
            id: `A${index + 1}`,
            action: action.slice(0, 220),
            evidence: evidence.slice(0, 220),
        };
    });
}

function validateNormalizedLedger(ledger, raw) {
    const missing = [];
    if (!ledger.engineContext) missing.push('engineContext');
    if (!ledger.engineContext?.userCoreStats) missing.push('engineContext.userCoreStats');
    if (!Array.isArray(ledger.engineContext?.trackerRelevantNPCs)) missing.push('engineContext.trackerRelevantNPCs');
    if (!ledger.resolutionEngine) missing.push('resolutionEngine');
    if (!ledger.resolutionEngine?.identifyGoal) missing.push('resolutionEngine.identifyGoal');
    if (!ledger.resolutionEngine?.identifyChallenge) missing.push('resolutionEngine.identifyChallenge');
    if (!ledger.resolutionEngine?.userAbilityUse) missing.push('resolutionEngine.userAbilityUse');
    if (typeof ledger.resolutionEngine?.userAbilityUse?.used !== 'boolean') missing.push('resolutionEngine.userAbilityUse.used:boolean');
    if (typeof ledger.resolutionEngine?.userAbilityUse?.attempted !== 'boolean') missing.push('resolutionEngine.userAbilityUse.attempted:boolean');
    if (typeof ledger.resolutionEngine?.userAbilityUse?.available !== 'boolean') missing.push('resolutionEngine.userAbilityUse.available:boolean');
    if (ledger.resolutionEngine?.userAbilityUse?.mechanicalScope !== 'flavor_only_no_bonus') missing.push('resolutionEngine.userAbilityUse.mechanicalScope:flavor_only_no_bonus');
    if (!ledger.resolutionEngine?.itemUse) missing.push('resolutionEngine.itemUse');
    if (typeof ledger.resolutionEngine?.itemUse?.attempted !== 'boolean') missing.push('resolutionEngine.itemUse.attempted:boolean');
    if (typeof ledger.resolutionEngine?.itemUse?.available !== 'boolean') missing.push('resolutionEngine.itemUse.available:boolean');
    if (!ITEM_USE_SOURCES.includes(ledger.resolutionEngine?.itemUse?.source)) missing.push('resolutionEngine.itemUse.source');
    if (!ledger.resolutionEngine?.claimCheck) missing.push('resolutionEngine.claimCheck');
    if (typeof ledger.resolutionEngine?.claimCheck?.present !== 'boolean') missing.push('resolutionEngine.claimCheck.present:boolean');
    if (typeof ledger.resolutionEngine?.claimCheck?.stakesImpact !== 'boolean') missing.push('resolutionEngine.claimCheck.stakesImpact:boolean');
    if (!CLAIM_TRUTH_STATUSES.includes(ledger.resolutionEngine?.claimCheck?.truthStatus)) missing.push('resolutionEngine.claimCheck.truthStatus');
    if (!CLAIM_NPC_ACCESS_LEVELS.includes(ledger.resolutionEngine?.claimCheck?.npcAccess)) missing.push('resolutionEngine.claimCheck.npcAccess');
    if (!ledger.resolutionEngine?.identifyTargets) missing.push('resolutionEngine.identifyTargets');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.hostilesInScene?.NPC)) missing.push('resolutionEngine.identifyTargets.hostilesInScene.NPC');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.ActionTargets)) missing.push('resolutionEngine.identifyTargets.ActionTargets');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.OppTargets?.NPC)) missing.push('resolutionEngine.identifyTargets.OppTargets.NPC');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.OppTargets?.ENV)) missing.push('resolutionEngine.identifyTargets.OppTargets.ENV');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.BenefitedObservers)) missing.push('resolutionEngine.identifyTargets.BenefitedObservers');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.HarmedObservers)) missing.push('resolutionEngine.identifyTargets.HarmedObservers');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.NPCAwareOfUser)) missing.push('resolutionEngine.identifyTargets.NPCAwareOfUser');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.PowerActors)) missing.push('resolutionEngine.identifyTargets.PowerActors');
    if (typeof ledger.resolutionEngine?.rollNeeded !== 'boolean') missing.push('resolutionEngine.rollNeeded:boolean');
    if (!ledger.resolutionEngine?.rollReason) missing.push('resolutionEngine.rollReason');
    if (!ACTION_BUCKETS.includes(ledger.resolutionEngine?.actionBucket)) missing.push('resolutionEngine.actionBucket');
    if (!SOCIAL_BUCKETS.includes(ledger.resolutionEngine?.socialBucket)) missing.push('resolutionEngine.socialBucket');
    if (!COMBAT_TYPES.includes(ledger.resolutionEngine?.combatType)) missing.push('resolutionEngine.combatType');
    if (typeof ledger.resolutionEngine?.intimacyAdvanceExplicit !== 'boolean') missing.push('resolutionEngine.intimacyAdvanceExplicit:boolean');
    if (typeof ledger.resolutionEngine?.boundaryViolationExplicit !== 'boolean') missing.push('resolutionEngine.boundaryViolationExplicit:boolean');
    if (!Array.isArray(ledger.resolutionEngine?.actionCount)) missing.push('resolutionEngine.actionCount');
    if (!Array.isArray(ledger.resolutionEngine?.actionUnits)) missing.push('resolutionEngine.actionUnits');
    if (Array.isArray(ledger.resolutionEngine?.actionCount) && Array.isArray(ledger.resolutionEngine?.actionUnits) && ledger.resolutionEngine.actionUnits.length !== ledger.resolutionEngine.actionCount.length) {
        missing.push('resolutionEngine.actionUnits:length');
    }
    if (!ENVIRONMENT_DIFFICULTY_TIERS.includes(ledger.resolutionEngine?.environmentDifficultyTier)) missing.push('resolutionEngine.environmentDifficultyTier');
    if (![0, 4, 8, 12].includes(ledger.resolutionEngine?.environmentDifficulty)) missing.push('resolutionEngine.environmentDifficulty');
    if (typeof ledger.resolutionEngine?.classifyHostilePhysicalIntent !== 'boolean') missing.push('resolutionEngine.classifyHostilePhysicalIntent:boolean');
    if (typeof ledger.resolutionEngine?.activeHostileThreat !== 'boolean') missing.push('resolutionEngine.activeHostileThreat:boolean');
    if (typeof ledger.resolutionEngine?.classifyPhysicalBoundaryPressure !== 'boolean') missing.push('resolutionEngine.classifyPhysicalBoundaryPressure:boolean');
    if (Object.prototype.hasOwnProperty.call(ledger.resolutionEngine || {}, 'hostilePhysicalIntent')) missing.push('forbidden extra field resolutionEngine.hostilePhysicalIntent');
    if (Object.prototype.hasOwnProperty.call(ledger.resolutionEngine || {}, 'primaryOppTarget')) missing.push('forbidden extra field resolutionEngine.primaryOppTarget');
    if (Object.prototype.hasOwnProperty.call(ledger.resolutionEngine || {}, 'primaryOpposition')) missing.push('forbidden extra field resolutionEngine.primaryOpposition');
    if (!Array.isArray(ledger.relationshipEngine)) missing.push('relationshipEngine');
    if (!ledger.injuryEffectEngine) missing.push('injuryEffectEngine');
    if (!Array.isArray(ledger.injuryEffectEngine?.effects)) missing.push('injuryEffectEngine.effects');
    if (!ledger.userKnowledgeApplication) missing.push('userKnowledgeApplication');
    if (!Array.isArray(ledger.userKnowledgeApplication?.applications)) missing.push('userKnowledgeApplication.applications');
    if (!ledger.powerActorEnmity) missing.push('powerActorEnmity');
    if (!Array.isArray(ledger.powerActorEnmity?.assessments)) missing.push('powerActorEnmity.assessments');
    if (!Array.isArray(ledger.powerActorEnmity?.effects)) missing.push('powerActorEnmity.effects');
    if (!ledger.powerEventShape) missing.push('powerEventShape');
    if (!Array.isArray(ledger.powerEventShape?.events)) missing.push('powerEventShape.events');
    if (!ledger.trackerUpdateEngine) missing.push('trackerUpdateEngine');
    if (!ledger.trackerUpdateEngine?.user) missing.push('trackerUpdateEngine.user');
    if (!Array.isArray(ledger.trackerUpdateEngine?.npcs)) missing.push('trackerUpdateEngine.npcs');
    if (!ledger.chaosSemantic) missing.push('chaosSemantic');
    if (missing.length) {
        throw new Error(`Mandatory semantic ledger contract failed; response invalid. Missing/invalid fields (${missing.join(', ')}): ${extractTextCandidates(raw).join('\n').slice(0, 240)}`);
    }
}

function toBoolean(value, fallback) {
    const text = String(value ?? '').trim().toLowerCase();
    if (value === true || text === 'y' || text === 'yes' || text === 'true') return true;
    if (value === false || text === 'n' || text === 'no' || text === 'false') return false;
    return fallback;
}

function toNumber(value, fallback) {
    const number = Number(value);
    return Number.isFinite(number) ? number : fallback;
}
