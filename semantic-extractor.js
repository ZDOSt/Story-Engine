import { ENGINE_PROMPT_TEXT, normalizeBoundCompanionDelta, normalizeBoundCompanionState, normalizeNpcCapabilityField, normalizePendingBoundaryDelta, normalizePendingBoundaryState, normalizeSocialResolutionMemory, sanitizeTrackerUserStateForModel } from './engines.js';
import { PERSONALITY_ARCHETYPE_GLOSSARY, stripPersonalityMannerismFields, TRACKER_DELTA_CONTRACT, TRACKER_DELTA_END, TRACKER_DELTA_START, TRACKER_DELTA_TEMPLATE, TRACKER_DELTA_WRAPPER_END, TRACKER_DELTA_WRAPPER_START, USER_KNOWLEDGE_CONFIDENCE, USER_KNOWLEDGE_SCOPES, USER_KNOWLEDGE_TRUTH, USER_REPUTATION_VALENCES } from './tracker-delta-contract.js';
import { getChatCompletionProfileRoute, sendConnectionManagerProfileRequest, sendDefaultChatCompletionTextRequest, sendDefaultChatCompletionToolRequest } from './st-adapter.js';
import { normalizeWorldState, normalizeWorldStateDelta, normalizeWorldTransition, projectWorldStateTransition } from './world-state.js';
import { buildWorldProgressionSemanticContext, normalizeWorldProgression, normalizeWorldProgressionAdvancements, validateWorldProgressionAdvancementCoverage } from './world-memory.js';
import { normalizeCurrencyList, normalizeEconomyDelta } from './economy.js';
import { normalizeSceneItemState, sceneItemStateForModel } from './scene-item-state.js';
import {
    AGGRESSION_METHODS,
    BOUNDARY_BREAK_RESPONSES,
    BOUNDARY_BREAK_TYPES,
    BOUNDARY_PRESSURE_TYPES,
    CHALLENGE_TYPES,
    EXCEPTIONAL_BENEFIT_SCALES,
    HARM_MODES,
    RELATIONSHIP_FIELD_DESCRIPTIONS,
    ROMANCE_STYLES,
    SLOW_BOND_BLOCKERS_DESCRIPTION,
    SLOW_BOND_CATEGORY_DESCRIPTIONS,
    SLOW_BOND_KEYS,
    SOCIAL_TACTICS,
    STANDING_INFLUENCES,
} from './semantic-contract.js';

const yaml = typeof window === 'undefined'
    ? (await import('yaml')).default
    : (await import('../../../../lib.js')).yaml;

export { TRACKER_DELTA_CONTRACT, TRACKER_DELTA_END, TRACKER_DELTA_START, TRACKER_DELTA_TEMPLATE, TRACKER_DELTA_WRAPPER_END, TRACKER_DELTA_WRAPPER_START, USER_KNOWLEDGE_CONFIDENCE, USER_KNOWLEDGE_SCOPES, USER_KNOWLEDGE_TRUTH, USER_REPUTATION_VALENCES };

const SEMANTIC_RESPONSE_LENGTH_MIN = 4096;
const SEMANTIC_RESPONSE_LENGTH_MAX = 8192;
const SEMANTIC_RESPONSE_LENGTH_PER_TRACKED_NPC = 768;
const SEMANTIC_TOOL_NAME = 'submit_semantic_preflight';
const SEMANTIC_TEXT_LEDGER_START = 'BEGIN_SEMANTIC_PREFLIGHT';
const SEMANTIC_TEXT_LEDGER_END = 'END_SEMANTIC_PREFLIGHT';
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
export const SEMANTIC_OUTPUT_MODES = Object.freeze({
    TOOL_CALL: 'tool_call',
    TEXT_LEDGER: 'text_ledger',
});
const SEMANTIC_STRUCTURED_OUTPUT_FIELDS = Object.freeze([
    'tools',
    'tool_choice',
    'parallel_tool_calls',
    'functions',
    'function_call',
    'response_format',
    'json_schema',
    'responseMimeType',
    'responseSchema',
]);
const SEMANTIC_TOOL_CONFLICT_FIELDS = Object.freeze([
    'response_format',
    'json_schema',
    'functions',
    'function_call',
    'responseMimeType',
    'responseSchema',
]);
const SEMANTIC_TURN_BINDING_BLOCK_HEADER = 'STORY ENGINE CURRENT TURN BINDING';
const SEMANTIC_DIAGNOSTIC_DETAILS = Symbol('storyEngineSemanticDiagnosticDetails');
const SEMANTIC_DIAGNOSTIC_REPORTED = Symbol('storyEngineSemanticDiagnosticReported');
const SEMANTIC_DIAGNOSTIC_EXCERPT_RADIUS = 160;
const CUSTOM_CHAT_COMPLETION_SOURCE = 'custom';
const UNKNOWN_CHAT_COMPLETION_SOURCE = 'unknown';
const TROLL_LLM_PROVIDER = 'trollllm';
const TROLL_LLM_USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
const SEMANTIC_PROVIDER_BY_API_HOST = Object.freeze(new Map([
    ['api.deepseek.com', 'deepseek'],
    ['api.openai.com', 'openai'],
    ['api.x.ai', 'xai'],
    ['api.z.ai', 'zai'],
    ['chat.trollllm.xyz', TROLL_LLM_PROVIDER],
    ['nano-gpt.com', 'nanogpt'],
    ['openrouter.ai', 'openrouter'],
]));
const STRICT_SEMANTIC_TOOL_SCHEMA_SOURCES = Object.freeze(new Set(['deepseek', 'openai', 'azure_openai']));
const NAMED_SEMANTIC_TOOL_CHOICE_SOURCES = Object.freeze(new Set(['deepseek', 'openai', 'nanogpt', 'openrouter', 'xai']));
const SERIAL_SEMANTIC_TOOL_CALL_SOURCES = Object.freeze(new Set(['nanogpt', 'openrouter', 'xai']));
const OFFICIAL_OPENAI_SOURCES = Object.freeze(new Set(['openai', 'azure_openai']));
const OPENAI_NONE_FORWARDABLE_MODELS = Object.freeze(new Set([
    'gpt-5.4',
    'gpt-5.4-2026-03-05',
    'gpt-5.4-mini',
    'gpt-5.4-mini-2026-03-17',
    'gpt-5.4-nano',
    'gpt-5.4-nano-2026-03-17',
    'gpt-5.5',
    'gpt-5.5-2026-04-23',
]));
const OPENAI_KNOWN_NON_REASONING_MODEL_PATTERN = /^(?:chatgpt-4o(?:-|$)|gpt-(?:3(?:\.5)?|4)(?:[.\-]|$))/i;
const INJURY_EFFECT_TYPES = Object.freeze([
    'none',
    'physical_injury',
    'burn',
    'poison',
    'paralysis',
    'disease',
    'blindness',
    'stun',
    'fear',
    'restraint',
    'curse',
    'electrical',
    'exhaustion',
    'mental_status',
    'other_status',
]);
const INJURY_EFFECT_TYPE_ALIASES = Object.freeze({
    abrasion: 'physical_injury',
    abrasions: 'physical_injury',
    bruise: 'physical_injury',
    bruised: 'physical_injury',
    bruises: 'physical_injury',
    bruising: 'physical_injury',
    blunt: 'physical_injury',
    bluntforce: 'physical_injury',
    bluntforceinjury: 'physical_injury',
    bluntforcetrauma: 'physical_injury',
    blunttrauma: 'physical_injury',
    contusion: 'physical_injury',
    contusions: 'physical_injury',
    cut: 'physical_injury',
    cuts: 'physical_injury',
    fracture: 'physical_injury',
    fractures: 'physical_injury',
    injury: 'physical_injury',
    injuries: 'physical_injury',
    laceration: 'physical_injury',
    lacerations: 'physical_injury',
    puncture: 'physical_injury',
    punctures: 'physical_injury',
    slash: 'physical_injury',
    slashes: 'physical_injury',
    stab: 'physical_injury',
    stabs: 'physical_injury',
    sprain: 'physical_injury',
    sprains: 'physical_injury',
    wound: 'physical_injury',
    wounds: 'physical_injury',
});
const TRACKER_CONDITIONS = Object.freeze(['unchanged', 'healthy', 'bruised', 'wounded', 'badly_wounded', 'critical', 'incapacitated', 'dead']);
const TRACKER_NPC_DELTA_FIELDS = Object.freeze(['woundsAdd', 'woundsRemove', 'statusAdd', 'statusRemove', 'gearAdd', 'gearRemove']);
const TRACKER_NPC_PROFILE_FIELDS = Object.freeze(['background', 'knowledge', 'practicedSkills']);
const TRACKER_NARRATOR_NPC_DELTA_FIELDS = Object.freeze([...TRACKER_NPC_DELTA_FIELDS, ...TRACKER_NPC_PROFILE_FIELDS, 'inventoryAdd', 'inventoryRemove', 'currencyAdd', 'currencyRemove']);
const TRACKER_USER_DELTA_FIELDS = Object.freeze([...TRACKER_NPC_DELTA_FIELDS, 'inventoryAdd', 'inventoryRemove', 'currencyAdd', 'currencyRemove', 'tasksAdd', 'tasksRemove', 'commitmentsAdd', 'commitmentsRemove']);
const POWER_ACTOR_EFFECT_TYPES = Object.freeze(['none', 'thwart', 'expose', 'harm_assets', 'steal', 'humiliate', 'help_enemy', 'disrupt_operation', 'kill_or_capture_people', 'damage_reputation_or_income']);
const POWER_ACTOR_FAVOR_TYPES = Object.freeze(['none', 'rescue_or_protect', 'valuable_information', 'recover_property', 'prevent_major_loss', 'exceptional_aid']);
const POWER_ACTOR_SEVERITIES = Object.freeze(['none', 'minor', 'meaningful', 'major']);
const POWER_ACTOR_ASSESSMENT_SCOPES = Object.freeze(['individual', 'organization', 'institution', 'group', 'unknown']);
const POWER_ACTOR_FAVOR_FITS = Object.freeze(['use_now', 'defer']);
const POWER_EVENT_TYPES = Object.freeze(['none', 'minor_obstruction', 'warning', 'ambush', 'frame_user', 'plant_contact', 'agent_mislead', 'agent_report', 'agent_sabotage']);
const POWER_EVENT_FITS = Object.freeze(['none', 'use_now', 'defer', 'drop']);
const POWER_EVENT_CONTACT_GENDERS = Object.freeze(['none', 'male', 'female', 'unknown']);
const CLAIM_TRUTH_STATUSES = Object.freeze(['none', 'known_true', 'known_false', 'unsupported', 'unknown']);
const CLAIM_NPC_ACCESS_LEVELS = Object.freeze(['none', 'direct', 'partial', 'unknown']);
const ITEM_USE_SOURCES = Object.freeze(['none', 'gear', 'inventory', 'scene', 'ambient', 'unavailable']);
const ITEM_USE_REFERENT_RULE = [
    'ITEM_USE REFERENT RULE:',
    'itemUse is only for a direct user interaction with one specifically identified concrete inanimate object or material.',
    'Attempted=Y only when the latest user input directly handles, uses, accesses, possesses, transfers, or otherwise acts on that specific object.',
    'Searching, scanning, looking around, inspecting, examining, rummaging, foraging, or seeking something/anything useful is not itemUse by itself and must not enter the availability gate.',
    'Generic categories such as weapon, tool, object, item, something, or anything are not concrete Item values. Keep open-ended discovery and environmental narration outside itemUse; if the input later directly handles a specific object, evaluate only that object.',
    'Living entities and creatures, anatomy and body parts, natural weapons, bodily contact or poses, movements, locations, surfaces, sensations, thoughts, dialogue, events, relationships, and abstract concepts are not items; classify them through the appropriate action, target, relationship, or other field.',
    'An unusual, intimate, indirect, possessive, or unconventional interaction does not change this referent boundary.',
    'Item must be a short noun phrase naming only the object or material, never an action, clause, sentence, person, body reference, or living entity.',
    'Return only the semantic referent decision: Attempted and Item. The extension deterministically resolves availability, source, evidence, and any unavailable-item consequence from authoritative saved state and current-scene facts after this pass.',
].join(' ');
const LOOT_TARGET_KINDS = Object.freeze(['humanoid', 'monster', 'other']);
const USER_KNOWLEDGE_TYPES = Object.freeze(['personalKnowledge', 'reputationKnowledge']);
const USER_KNOWLEDGE_APPLICATION_EFFECTS = Object.freeze(['none', 'priorUserGoodRep', 'userBadRep', 'userNonHuman', 'contextOnly']);
const ENVIRONMENT_DIFFICULTY_TIERS = Object.freeze(['none', 'easy', 'average', 'hard', 'extreme']);
const SEMANTIC_NARRATOR_ONLY_FUNCTION_BLOCKS = Object.freeze([
    'RenderControlEngine',
    'sceneStyleProfile',
    'finalResponseElements',
    'fanService',
    'adultContent',
]);

export async function extractSemanticLedger(context, promptContext, type, trackerSnapshot, options = {}) {
    try {
        return await extractSemanticLedgerInternal(context, promptContext, type, trackerSnapshot, options);
    } catch (error) {
        if (!isSemanticCancellation(error, options?.signal)) {
            reportSemanticDiagnostic(error, {
                profile: options?.semanticProfileName || options?.semanticProfileId || 'active SillyTavern connection',
            });
        }
        throw error;
    }
}

async function extractSemanticLedgerInternal(context, promptContext, type, trackerSnapshot, options = {}) {
    const turnBinding = createSemanticTurnBinding(options, type);
    const semanticOptions = { ...options, semanticTurnBinding: turnBinding };
    const semanticOutputMode = normalizeSemanticOutputMode(semanticOptions.semanticOutputMode);
    const textLedger = semanticOutputMode === SEMANTIC_OUTPUT_MODES.TEXT_LEDGER;
    const transportLabel = textLedger ? 'validated text ledger' : 'tool-call';
    const playerTrackerSnapshot = semanticOptions?.playerTrackerSnapshot || {};
    const prompt = semanticOptions?.assembledPrompt
        ? buildSemanticPromptFromAssembledChat(context, promptContext, type, trackerSnapshot, playerTrackerSnapshot, semanticOptions)
        : buildSemanticPrompt(context, promptContext, type, trackerSnapshot, playerTrackerSnapshot, semanticOptions);
    validateSemanticPromptTurnBinding(prompt, turnBinding);
    const responseLength = Number.isFinite(semanticOptions?.responseLength) && semanticOptions.responseLength > 0
        ? semanticOptions.responseLength
        : estimateSemanticResponseLength(trackerSnapshot, promptContext, semanticOptions);

    let semanticResult;
    let normalized;
    if (textLedger) {
        try {
            semanticResult = semanticOptions?.semanticProfileId
                ? await generateSemanticTextLedgerWithProfile(prompt, responseLength, semanticOptions)
                : await generateSemanticTextLedger(prompt, responseLength, semanticOptions);
            normalized = validateSemanticTransportResult(semanticResult, trackerSnapshot, semanticOptions, context, turnBinding, transportLabel);
        } catch (error) {
            options?.signal?.throwIfAborted?.();
            const message = error instanceof Error ? error.message : String(error);
            throw wrapSemanticDiagnosticError(
                error,
                `Semantic validated text-ledger pass returned no valid complete ledger. Generation aborted before narration. ${message}`,
                { code: 'SE-TEXT-LEDGER', stage: 'Validated text-ledger request' },
            );
        }
    } else {
        try {
            semanticResult = semanticOptions?.semanticProfileId
                ? await generateSemanticToolCallWithProfile(prompt, responseLength, semanticOptions)
                : await generateSemanticToolCall(prompt, responseLength, semanticOptions);
        } catch (error) {
            options?.signal?.throwIfAborted?.();
            const message = error instanceof Error ? error.message : String(error);
            throw wrapSemanticDiagnosticError(
                error,
                `Semantic ${transportLabel} pass returned no valid complete ledger. Generation aborted before narration. ${message}`,
                { code: 'SE-TOOL-CALL', stage: 'Tool-call request' },
            );
        }
        normalized = validateSemanticTransportResult(semanticResult, trackerSnapshot, semanticOptions, context, turnBinding, transportLabel);
    }

    normalized.deterministicOverrides = {
        ...(normalized.deterministicOverrides || {}),
        semanticLedgerExtraction: {
            source: semanticOptions?.semanticProfileId
                ? `SillyTavern Connection Manager profile ${transportLabel} + complete local validation (${semanticOptions.semanticProfileName || semanticOptions.semanticProfileId})`
                : `SillyTavern backend ${transportLabel} + complete local validation`,
            schema: 'submit_semantic_preflight_structured_v4',
            strict: true,
            transport: semanticOutputMode,
            textLedgerAttempted: textLedger,
            responseLength,
            ...(textLedger ? {} : { toolName: SEMANTIC_TOOL_NAME }),
            semanticProfile: semanticOptions?.semanticProfileName || undefined,
        },
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

function validateSemanticTransportResult(semanticResult, trackerSnapshot, semanticOptions, context, turnBinding, transportLabel) {
    let ledger;
    try {
        ledger = parseSemanticLedger(semanticResult.ledger, trackerSnapshot);
        validateRawLedgerContract(ledger, semanticResult.ledger);
    } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        throw wrapSemanticDiagnosticError(
            error,
            `Semantic ${transportLabel} pass returned no valid complete ledger. Generation aborted before narration. ${message}`,
            { code: 'SE-CONTRACT-VALIDATION', stage: 'Ledger contract validation' },
        );
    }

    if (!ledger || typeof ledger !== 'object') {
        throw annotateSemanticDiagnosticError(
            new Error(`Semantic ${transportLabel} pass returned an invalid ledger object: ${previewRaw(semanticResult.ledger)}`),
            { code: 'SE-CONTRACT-VALIDATION', stage: 'Ledger contract validation' },
        );
    }

    try {
        validateSemanticTurnGrounding(ledger, turnBinding);
        delete ledger.turnBinding;
    } catch (error) {
        throw annotateSemanticDiagnosticError(error, {
            code: 'SE-TURN-GROUNDING',
            stage: 'Current-turn grounding',
        });
    }

    let normalized;
    try {
        normalized = normalizeLedger(ledger, { ...semanticOptions, trackerSnapshot });
        validateNormalizedLedger(normalized, semanticResult.ledger);
    } catch (error) {
        throw annotateSemanticDiagnosticError(error, {
            code: 'SE-CONTRACT-VALIDATION',
            stage: 'Normalized ledger validation',
        });
    }
    try {
        validateSemanticWorldProgression(normalized, semanticOptions, context);
        validateRelationshipCoverage(normalized.resolutionEngine, normalized.relationshipEngine);
    } catch (error) {
        throw annotateSemanticDiagnosticError(error, {
            code: 'SE-SEMANTIC-VALIDATION',
            stage: 'Semantic consistency validation',
        });
    }
    return normalized;
}

export function normalizeSemanticOutputMode(value) {
    const normalized = String(value || '').trim().toLowerCase();
    if (normalized === SEMANTIC_OUTPUT_MODES.TEXT_LEDGER || normalized === 'text_only') return SEMANTIC_OUTPUT_MODES.TEXT_LEDGER;
    return SEMANTIC_OUTPUT_MODES.TOOL_CALL;
}

export function annotateSemanticDiagnosticError(error, details = {}) {
    const target = error instanceof Error ? error : new Error(String(error));
    const inherited = findSemanticDiagnosticDetails(target.cause);
    const current = target[SEMANTIC_DIAGNOSTIC_DETAILS];
    const merged = compactDiagnosticDetails({
        ...details,
        ...(inherited || {}),
        ...(current || {}),
    });
    try {
        Object.defineProperty(target, SEMANTIC_DIAGNOSTIC_DETAILS, {
            configurable: true,
            value: merged,
            writable: true,
        });
    } catch {
        try {
            target[SEMANTIC_DIAGNOSTIC_DETAILS] = merged;
        } catch {
            // Diagnostics must never replace the original pipeline failure.
        }
    }
    return target;
}

export function formatSemanticDiagnostic(error, context = {}) {
    const target = error instanceof Error ? error : new Error(String(error));
    const details = compactDiagnosticDetails({
        ...inferSemanticDiagnosticDetails(target),
        ...(findSemanticDiagnosticDetails(target) || {}),
        ...context,
    });
    const lines = ['[Story Engine Semantic Diagnostic]'];
    appendDiagnosticLine(lines, 'Code', details.code || 'SE-UNKNOWN');
    appendDiagnosticLine(lines, 'Stage', details.stage || 'Semantic pipeline');
    appendDiagnosticLine(lines, 'Profile', details.profile);
    appendDiagnosticLine(lines, 'Provider', details.provider);
    appendDiagnosticLine(lines, 'Model', details.model);
    appendDiagnosticLine(lines, 'HTTP status', details.status);
    appendDiagnosticLine(lines, 'Request ID', details.requestId);
    appendDiagnosticLine(lines, 'Expected tool', details.expectedTool);
    appendDiagnosticLine(lines, 'Returned tools', formatDiagnosticList(details.returnedTools));
    appendDiagnosticLine(lines, 'Response shape', details.responseShape);
    appendDiagnosticLine(lines, 'Field', details.field);
    appendDiagnosticLine(lines, 'Received', details.received);
    appendDiagnosticLine(lines, 'Allowed', formatDiagnosticList(details.allowed));
    appendDiagnosticLine(lines, 'Error', diagnosticErrorMessage(target));
    if (details.line || details.column) {
        appendDiagnosticLine(lines, 'Location', [
            details.line ? `line ${details.line}` : '',
            details.column ? `column ${details.column}` : '',
        ].filter(Boolean).join(', '));
    }
    appendDiagnosticLine(lines, 'Raw excerpt', details.excerpt);
    if (details.repairAttempted !== undefined) {
        appendDiagnosticLine(lines, 'Repair attempted', details.repairAttempted ? 'yes' : 'no');
    }
    appendDiagnosticLine(lines, 'Repair result', details.repairResult);
    appendDiagnosticLine(lines, 'Action', 'Generation aborted before narration');
    return lines.join('\n');
}

export function reportSemanticDiagnostic(error, context = {}) {
    const target = error instanceof Error ? error : new Error(String(error));
    try {
        if (semanticDiagnosticWasReported(target)) return formatSemanticDiagnostic(target, context);
        markSemanticDiagnosticReported(target);
        const diagnostic = formatSemanticDiagnostic(target, context);
        console.error(diagnostic);
        return diagnostic;
    } catch {
        return '';
    }
}

function wrapSemanticDiagnosticError(error, message, details) {
    const wrapped = new Error(message);
    wrapped.cause = error;
    return annotateSemanticDiagnosticError(wrapped, details);
}

function findSemanticDiagnosticDetails(error) {
    let current = error;
    const seen = new Set();
    while (current && typeof current === 'object' && !seen.has(current)) {
        seen.add(current);
        if (current[SEMANTIC_DIAGNOSTIC_DETAILS]) return current[SEMANTIC_DIAGNOSTIC_DETAILS];
        current = current.cause;
    }
    return null;
}

function compactDiagnosticDetails(details) {
    return Object.fromEntries(Object.entries(details || {}).filter(([_key, value]) => value !== undefined && value !== null && value !== ''));
}

function appendDiagnosticLine(lines, label, value) {
    if (value === undefined || value === null || value === '') return;
    lines.push(`${label}: ${sanitizeDiagnosticText(value)}`);
}

function formatDiagnosticList(value) {
    if (!Array.isArray(value)) return value;
    return value.length ? value.join(' | ') : '(none)';
}

function sanitizeDiagnosticText(value) {
    const text = typeof value === 'string' ? value : diagnosticValuePreview(value);
    return String(text || '')
        .replace(/([?&]key=)[^&#\s,;}]+/gi, '$1[REDACTED]')
        .replace(/\b((?:api[-_ ]?key|authorization|token|secret)\s*[:=]\s*)(?:Bearer\s+)?[^\s,;}]+/gi, '$1[REDACTED]')
        .replace(/\bBearer\s+[A-Za-z0-9._~+\/-]+/gi, 'Bearer [REDACTED]')
        .replace(/\bsk-[A-Za-z0-9_-]{8,}\b/g, '[REDACTED_KEY]')
        .slice(0, 900);
}

function diagnosticValuePreview(value) {
    if (value === undefined) return 'missing';
    try {
        return JSON.stringify(value).slice(0, 320);
    } catch {
        return String(value).slice(0, 320);
    }
}

function diagnosticErrorMessage(error) {
    return String(error?.message || error || 'Unknown semantic failure')
        .replace(/\s+RawPreview=[\s\S]*$/i, '')
        .trim()
        .slice(0, 700);
}

function inferSemanticDiagnosticDetails(error) {
    if (isSemanticTransportError(error)) {
        return {
            code: 'SE-TRANSPORT',
            stage: 'Transport',
            status: error.status,
        };
    }
    const message = String(error?.message || '');
    if (/JSON\.parse|JSON at position|after array element|unterminated JSON|Unexpected token/i.test(message)) {
        return { code: 'SE-JSON-PARSE', stage: 'JSON parsing' };
    }
    if (/must be (?:one of|an? |a boolean|a string|an integer)|is required|unknown properties/i.test(message)) {
        return { code: 'SE-SCHEMA-VALIDATION', stage: 'Schema validation' };
    }
    return { code: 'SE-UNKNOWN', stage: 'Semantic pipeline' };
}

function semanticDiagnosticWasReported(error) {
    let current = error;
    const seen = new Set();
    while (current && typeof current === 'object' && !seen.has(current)) {
        seen.add(current);
        if (current[SEMANTIC_DIAGNOSTIC_REPORTED]) return true;
        current = current.cause;
    }
    return false;
}

function markSemanticDiagnosticReported(error) {
    try {
        Object.defineProperty(error, SEMANTIC_DIAGNOSTIC_REPORTED, { configurable: true, value: true });
    } catch {
        try {
            error[SEMANTIC_DIAGNOSTIC_REPORTED] = true;
        } catch {
            // A non-extensible provider error can still propagate unchanged.
        }
    }
}

function isSemanticCancellation(error, signal) {
    return signal?.aborted === true || error?.name === 'AbortError';
}

export function parseNarratorTrackerDelta(text, narration = '') {
    return sanitizeNarratorTrackerDelta(parseNarratorTrackerDeltaText(text), narration);
}

export function estimateSemanticResponseLength(trackerSnapshot, promptContext = null, options = {}) {
    const currentExchangeText = extractLatestExchangeText(promptContext, options);
    const trackedNpcCount = countReferencedTrackedNpcs(trackerSnapshot, currentExchangeText);
    const promptComplexity = estimatePromptComplexity(promptContext, options);
    const estimated = SEMANTIC_RESPONSE_LENGTH_MIN
        + (trackedNpcCount * SEMANTIC_RESPONSE_LENGTH_PER_TRACKED_NPC)
        + promptComplexity;
    return Math.max(SEMANTIC_RESPONSE_LENGTH_MIN, Math.min(SEMANTIC_RESPONSE_LENGTH_MAX, estimated));
}

function countReferencedTrackedNpcs(trackerSnapshot, text) {
    if (!trackerSnapshot || typeof trackerSnapshot !== 'object' || !text) return 0;
    return Object.keys(trackerSnapshot)
        .filter(name => trackedNpcNameAppearsInText(name, text))
        .length;
}

function trackedNpcNameAppearsInText(name, text) {
    const cleanName = String(name || '').trim();
    if (!cleanName || !text) return false;
    const leadingBoundary = /^[\p{L}\p{N}_]/u.test(cleanName)
        ? '(?:^|[^\\p{L}\\p{N}_])'
        : '';
    const trailingBoundary = /[\p{L}\p{N}_]$/u.test(cleanName)
        ? '(?![\\p{L}\\p{N}_])'
        : '';
    return new RegExp(`${leadingBoundary}${escapeRegExp(cleanName)}${trailingBoundary}`, 'iu').test(String(text));
}

function estimatePromptComplexity(promptContext, options = {}) {
    const text = extractRecentPromptText(promptContext, options);
    const activePlanCount = normalizeWorldProgression(options?.worldProgressionSnapshot || {}).plans
        .filter(plan => plan.status === 'active').length;
    const textComplexity = text ? Math.min(2048, Math.floor(text.length / 3000) * 256) : 0;
    return textComplexity + Math.min(4608, activePlanCount * 256);
}

function extractRecentPromptText(promptContext, options = {}) {
    return extractPromptText(promptContext, options, 8);
}

function extractLatestExchangeText(promptContext, options = {}) {
    return extractPromptText(promptContext, options, 2);
}

function extractPromptText(promptContext, options = {}, messageLimit = 8) {
    const rows = Array.isArray(promptContext) ? promptContext : [];
    const texts = [];
    const limit = Math.max(1, Math.floor(Number(messageLimit) || 1));
    for (let index = rows.length - 1; index >= 0 && texts.length < limit; index -= 1) {
        const row = rows[index];
        const role = String(row?.role || '').toLowerCase();
        if (options?.assembledPrompt && role && !['user', 'assistant'].includes(role)) continue;
        const content = String(row?.mes ?? row?.message ?? row?.content ?? '').trim();
        if (!content) continue;
        texts.push(clip(stripStructuredDebug(content), 2000));
    }
    return texts.reverse().join('\n');
}

class SemanticTransportError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'SemanticTransportError';
        this.status = details.status;
        this.body = details.body;
        this.cause = details.cause;
        annotateSemanticDiagnosticError(this, {
            code: 'SE-TRANSPORT',
            stage: 'Transport',
            status: details.status,
            provider: details.provider,
            model: details.model,
            profile: details.profile,
            requestId: details.requestId,
            excerpt: details.body,
        });
    }
}

function isSemanticTransportError(error) {
    return error instanceof SemanticTransportError || error?.name === 'SemanticTransportError';
}

async function generateSemanticToolCall(prompt, responseLength, options = {}) {
    const toolPrompt = buildSemanticToolPrompt(prompt);
    validateSemanticPromptTurnBinding(toolPrompt, options.semanticTurnBinding);
    try {
        const raw = await sendDefaultChatCompletionToolRequest(toolPrompt, responseLength, {
            purpose: 'semantic preflight tool call',
            buildTool: (source, route) => buildSemanticPreflightTool(source, applySemanticToolSchemaOption(route, options), options.semanticTurnBinding),
            buildToolChoice: buildSemanticToolChoice,
            preparePayload: payload => applySemanticToolRequestPayloadPolicies(payload),
            signal: options.signal,
        });
        if (raw?.error) {
            throw new SemanticTransportError(`Provider returned an error for semantic tool-call request: ${previewRaw(raw)}`, {
                body: previewRaw(raw),
                status: semanticResponseStatus(raw),
                requestId: semanticResponseRequestId(raw),
            });
        }
        const ledger = extractSemanticToolLedger(raw, {}, options.semanticTurnBinding);
        return { raw, ledger };
    } catch (error) {
        if (isSemanticTransportError(error) || findSemanticDiagnosticDetails(error)) throw error;
        throw new SemanticTransportError(error instanceof Error ? error.message : String(error), {
            status: error?.status,
            body: error?.body,
            cause: error,
            requestId: error?.requestId || error?.request_id,
        });
    }
}

async function generateSemanticToolCallWithProfile(prompt, responseLength, options = {}) {
    const route = getChatCompletionProfileRoute(options.semanticProfileId, options.semanticProfileName);
    const chatCompletionSource = route.source;
    const toolPrompt = buildSemanticToolPrompt(prompt);
    validateSemanticPromptTurnBinding(toolPrompt, options.semanticTurnBinding);
    const semanticTool = buildSemanticPreflightTool(chatCompletionSource, applySemanticToolSchemaOption(route, options), options.semanticTurnBinding);
    const preparePayload = payload => applySemanticToolRequestPayloadPolicies(payload, route);
    const overridePayload = {
        temperature: 0,
        stream: false,
        messages: toolPrompt,
        tools: [semanticTool],
        tool_choice: buildSemanticToolChoice(chatCompletionSource, route),
        ...buildSemanticToolTransportOverrides(chatCompletionSource, route),
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
        raw = await sendConnectionManagerProfileRequest({
            profileId: options.semanticProfileId,
            profileName: options.semanticProfileName,
            prompt: toolPrompt,
            responseLength,
            overridePayload,
            extractData: false,
            preparePayload,
            signal: options.signal,
        });
    } catch (error) {
        throw new SemanticTransportError(`Connection Manager semantic profile tool-call request failed: ${error instanceof Error ? error.message : String(error)}`, {
            cause: error,
            provider: route.source,
            model: route.model,
            profile: options.semanticProfileName || options.semanticProfileId,
            status: semanticErrorDetail(error, ['status', 'statusCode']),
            body: semanticErrorDetail(error, ['body', 'responseBody']),
            requestId: semanticErrorDetail(error, ['requestId', 'request_id']),
        });
    }

    if (raw?.error) {
        throw new SemanticTransportError(`Provider returned an error for semantic profile tool-call request: ${previewRaw(raw)}`, {
            body: previewRaw(raw),
            provider: route.source,
            model: route.model,
            profile: options.semanticProfileName || options.semanticProfileId,
            status: semanticResponseStatus(raw),
            requestId: semanticResponseRequestId(raw),
        });
    }

    const ledger = extractSemanticToolLedger(raw, {
        provider: route.source,
        model: route.model,
        profile: options.semanticProfileName || options.semanticProfileId,
    }, options.semanticTurnBinding);
    return { raw, ledger };
}

async function generateSemanticTextLedger(prompt, responseLength, options = {}) {
    const textPrompt = buildSemanticTextLedgerPrompt(prompt);
    validateSemanticPromptTurnBinding(textPrompt, options.semanticTurnBinding);
    return await requestSemanticTextLedger(
        () => sendDefaultChatCompletionTextRequest(textPrompt, responseLength, {
            purpose: 'semantic validated text-ledger request',
            temperature: 0,
            preparePayload: payload => applySemanticTextRequestPayloadPolicies(payload),
            signal: options.signal,
        }),
        {},
        options,
    );
}

async function generateSemanticTextLedgerWithProfile(prompt, responseLength, options = {}) {
    const route = getChatCompletionProfileRoute(options.semanticProfileId, options.semanticProfileName);
    const textPrompt = buildSemanticTextLedgerPrompt(prompt);
    validateSemanticPromptTurnBinding(textPrompt, options.semanticTurnBinding);
    const preparePayload = payload => applySemanticTextRequestPayloadPolicies(payload, route);
    const overridePayload = {
        temperature: 0,
        stream: false,
        n: 1,
        messages: textPrompt,
        ...semanticStructuredOutputOverrides(),
        enable_web_search: false,
        request_images: undefined,
        request_image_resolution: undefined,
        request_image_aspect_ratio: undefined,
        json_schema: undefined,
        stop: undefined,
        ...(Number.isFinite(responseLength) && responseLength > 0 ? { max_tokens: responseLength } : {}),
    };
    const diagnosticContext = {
        provider: route.source,
        model: route.model,
        profile: options.semanticProfileName || options.semanticProfileId,
    };

    return await requestSemanticTextLedger(
        async () => {
            try {
                return await sendConnectionManagerProfileRequest({
                    profileId: options.semanticProfileId,
                    profileName: options.semanticProfileName,
                    prompt: textPrompt,
                    responseLength,
                    overridePayload,
                    extractData: false,
                    preparePayload,
                    signal: options.signal,
                });
            } catch (error) {
                throw new SemanticTransportError(`Connection Manager semantic profile validated text-ledger request failed: ${error instanceof Error ? error.message : String(error)}`, {
                    cause: error,
                    ...diagnosticContext,
                    status: semanticErrorDetail(error, ['status', 'statusCode']),
                    body: semanticErrorDetail(error, ['body', 'responseBody']),
                    requestId: semanticErrorDetail(error, ['requestId', 'request_id']),
                });
            }
        },
        diagnosticContext,
        options,
    );
}

async function requestSemanticTextLedger(request, diagnosticContext, options = {}) {
    let lastError;
    for (let attempt = 0; attempt < 2; attempt += 1) {
        let raw;
        try {
            raw = await request();
        } catch (error) {
            if (isSemanticTransportError(error) || findSemanticDiagnosticDetails(error)) throw error;
            throw new SemanticTransportError(error instanceof Error ? error.message : String(error), {
                cause: error,
                ...diagnosticContext,
                status: error?.status,
                body: error?.body,
                requestId: error?.requestId || error?.request_id,
            });
        }
        if (raw?.error) {
            throw new SemanticTransportError(`Provider returned an error for semantic validated text-ledger request: ${previewRaw(raw)}`, {
                body: previewRaw(raw),
                ...diagnosticContext,
                status: semanticResponseStatus(raw),
                requestId: semanticResponseRequestId(raw),
            });
        }
        try {
            return {
                raw,
                ledger: extractSemanticTextLedger(raw, diagnosticContext, options.semanticTurnBinding),
            };
        } catch (error) {
            lastError = error;
            if (attempt === 0) {
                console.warn('[Structured Preflight Engines] validated text ledger was structurally invalid; retrying once before narration.');
                continue;
            }
        }
    }
    throw lastError;
}

export async function sendStructuredToolRequest(prompt, responseLength, options = {}, toolDefinition = {}) {
    const toolName = String(toolDefinition.name || '').trim();
    if (!toolName || !toolDefinition.parameters || typeof toolDefinition.parameters !== 'object') {
        throw new Error('Structured request is missing a valid tool definition.');
    }

    const messages = Array.isArray(prompt)
        ? prompt
        : [{ role: 'user', content: String(prompt || '') }];
    const buildTool = (chatCompletionSource, route = {}) => {
        const useStrictSchema = supportsStrictSemanticToolSchema(chatCompletionSource, route);
        return {
            type: 'function',
            function: {
                name: toolName,
                description: String(toolDefinition.description || 'Submit the required structured Story Engine utility result.'),
                ...(useStrictSchema ? { strict: true } : {}),
                parameters: toolDefinition.parameters,
            },
        };
    };

    let result;
    if (options.semanticProfileId) {
        const route = getChatCompletionProfileRoute(options.semanticProfileId, options.semanticProfileName);
        const preparePayload = payload => applySemanticToolRequestPayloadPolicies(payload, route);
        result = await sendConnectionManagerProfileRequest({
            profileId: options.semanticProfileId,
            profileName: options.semanticProfileName,
            prompt: messages,
            responseLength,
            overridePayload: {
                temperature: 0,
                stream: false,
                n: 1,
                messages,
                tools: [buildTool(route.source, route)],
                tool_choice: buildStructuredToolChoice(toolName, route.source, route),
                ...buildSemanticToolTransportOverrides(route.source, route),
                enable_web_search: false,
                request_images: undefined,
                request_image_resolution: undefined,
                request_image_aspect_ratio: undefined,
                json_schema: undefined,
                stop: undefined,
                ...(Number.isFinite(responseLength) && responseLength > 0 ? { max_tokens: responseLength } : {}),
            },
            extractData: false,
            preparePayload,
            signal: options.signal,
        });
    } else {
        result = await sendDefaultChatCompletionToolRequest(messages, responseLength, {
            purpose: options.purpose || 'structured Story Engine utility call',
            temperature: 0,
            buildTool: (source, route) => buildTool(source, route),
            buildToolChoice: (source, route) => buildStructuredToolChoice(toolName, source, route),
            preparePayload: payload => applySemanticToolRequestPayloadPolicies(payload),
            signal: options.signal,
        });
    }
    if (result?.error) {
        throw new Error(`Structured request returned an error: ${previewRaw(result)}`);
    }

    const calls = collectToolCalls(result);
    const matchingCalls = calls.filter(call => getToolCallName(call) === toolName);
    if (!matchingCalls.length) {
        throw new Error(`Structured response did not call ${toolName}. RawPreview=${previewRaw(result)}`);
    }
    if (matchingCalls.length !== 1) {
        throw new Error(`Structured response returned ${matchingCalls.length} calls to ${toolName}; exactly one is required. RawPreview=${previewRaw(result)}`);
    }
    const payload = parseToolArguments(getToolCallArguments(matchingCalls[0]));
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        throw new Error(`Structured response for ${toolName} was not an object. RawPreview=${previewRaw(result)}`);
    }
    return payload;
}

export function extractGeneratedText(raw) {
    const candidates = collectGeneratedTextCandidates(raw);
    return candidates[0] || '';
}

function normalizeChatCompletionSource(value) {
    return String(value || '').trim().toLowerCase();
}

function applySemanticToolSchemaOption(route = {}, options = {}) {
    if (options?.semanticStrictToolSchema !== true) return route;
    return { ...route, strictSchemaOverride: true };
}

function hasRouteOverride(value) {
    if (typeof value === 'boolean') return value;
    const normalized = String(value || '').trim().toLowerCase();
    return Boolean(normalized && normalized !== '<none>' && normalized !== '<empty>');
}

function resolveSemanticPayloadRoute(payload, route = {}) {
    const customUrl = route.customUrl || route.custom_url || payload?.custom_url || '';
    return {
        ...route,
        source: route.source || payload?.chat_completion_source,
        model: route.model || payload?.model,
        customUrl,
        customIncludeHeaders: payload?.custom_include_headers ?? route.customIncludeHeaders,
        usesCustomUrl: hasRouteOverride(route.usesCustomUrl)
            || hasRouteOverride(customUrl),
        usesReverseProxy: hasRouteOverride(route.usesReverseProxy)
            || hasRouteOverride(route.reverseProxy)
            || hasRouteOverride(route.reverse_proxy)
            || hasRouteOverride(payload?.reverse_proxy),
    };
}

function getSemanticProviderFromApiUrl(route = {}) {
    const customUrl = String(route.customUrl || route.custom_url || '').trim();
    if (!customUrl) return '';
    try {
        return SEMANTIC_PROVIDER_BY_API_HOST.get(new URL(customUrl).hostname.toLowerCase()) || '';
    } catch {
        return '';
    }
}

function resolveSemanticProviderIdentity(chatCompletionSource, route = {}) {
    const source = normalizeChatCompletionSource(chatCompletionSource || route.source);
    // Connection profiles can report a connector-specific source label while routing to a known provider URL.
    const urlProvider = getSemanticProviderFromApiUrl(route);
    return {
        source,
        provider: urlProvider || source,
        identifiedByUrl: Boolean(urlProvider),
    };
}

export function resolveSemanticToolTransportPolicy(chatCompletionSource, route = {}) {
    const identity = resolveSemanticProviderIdentity(chatCompletionSource, route);
    const trollLlmRoute = identity.provider === TROLL_LLM_PROVIDER;
    const directProviderRoute = !hasRouteOverride(route.usesCustomUrl)
        && !hasRouteOverride(route.customUrl)
        && !hasRouteOverride(route.custom_url)
        && !hasRouteOverride(route.usesReverseProxy)
        && !hasRouteOverride(route.reverseProxy)
        && !hasRouteOverride(route.reverse_proxy);
    const providerPolicyRoute = directProviderRoute || identity.identifiedByUrl;
    return {
        source: identity.source,
        // Strict-schema capability is tied to SillyTavern's actual connector source.
        // URL inference remains available for transport quirks, but must not turn a
        // Custom profile into an unconfigurable hardcoded strict route.
        strictSchema: STRICT_SEMANTIC_TOOL_SCHEMA_SOURCES.has(identity.source),
        exactNamedToolChoice: trollLlmRoute || (providerPolicyRoute && NAMED_SEMANTIC_TOOL_CHOICE_SOURCES.has(identity.provider)),
        disableParallelToolCalls: providerPolicyRoute && SERIAL_SEMANTIC_TOOL_CALL_SOURCES.has(identity.provider),
    };
}

export function isSemanticToolSchemaOverrideAllowed(chatCompletionSource, route = {}) {
    const resolvedRoute = resolveSemanticPayloadRoute({}, {
        ...route,
        source: chatCompletionSource || route.source,
    });
    const identity = resolveSemanticProviderIdentity(resolvedRoute.source, resolvedRoute);
    if (!identity.source && !identity.provider && !String(resolvedRoute.customUrl || '').trim()) return false;
    return !resolveSemanticToolTransportPolicy(resolvedRoute.source, resolvedRoute).strictSchema;
}

export function normalizeSemanticToolSchemaRouteKey(chatCompletionSource, route = {}) {
    const resolvedRoute = resolveSemanticPayloadRoute({}, {
        ...route,
        source: chatCompletionSource || route.source,
    });
    const identity = resolveSemanticProviderIdentity(resolvedRoute.source, resolvedRoute);
    const source = identity.source || UNKNOWN_CHAT_COMPLETION_SOURCE;
    if (source === CUSTOM_CHAT_COMPLETION_SOURCE) return `${source}|<custom>`;
    const provider = identity.provider || source;
    const customUrl = String(resolvedRoute.customUrl || '').trim();
    let endpoint = '<direct>';
    if (customUrl) {
        try {
            const url = new URL(customUrl);
            const defaultPort = (url.protocol === 'https:' && url.port === '443')
                || (url.protocol === 'http:' && url.port === '80');
            const port = url.port && !defaultPort ? `:${url.port}` : '';
            const pathname = url.pathname.replace(/\/+$/, '') || '/';
            endpoint = `${url.protocol.toLowerCase()}//${url.hostname.toLowerCase()}${port}${pathname}`;
        } catch {
            endpoint = customUrl.toLowerCase().replace(/[?#].*$/, '').replace(/\/+$/, '') || '<invalid>';
        }
    } else if (hasRouteOverride(resolvedRoute.usesReverseProxy)
        || hasRouteOverride(resolvedRoute.reverseProxy)
        || hasRouteOverride(resolvedRoute.reverse_proxy)) {
        endpoint = '<reverse-proxy>';
    }
    return `${provider}|${endpoint}`;
}

function supportsStrictSemanticToolSchema(chatCompletionSource, route = {}) {
    const policy = resolveSemanticToolTransportPolicy(chatCompletionSource, route);
    return policy.strictSchema
        || (route?.strictSchemaOverride === true && isSemanticToolSchemaOverrideAllowed(chatCompletionSource, route));
}

export function applyStoryEngineSemanticToolTransportPayload(payload, route = {}) {
    if (!payload || typeof payload !== 'object') {
        return payload;
    }

    const resolvedRoute = resolveSemanticPayloadRoute(payload, route);
    const policy = resolveSemanticToolTransportPolicy(resolvedRoute.source, resolvedRoute);
    const identity = resolveSemanticProviderIdentity(resolvedRoute.source, resolvedRoute);
    // An explicit undefined clears any preset-level transport hint without serializing a fallback-only field.
    payload.parallel_tool_calls = policy.disableParallelToolCalls ? false : undefined;
    if (identity.identifiedByUrl && policy.disableParallelToolCalls) {
        updateCustomIncludeBody(payload, resolvedRoute, body => {
            body.parallel_tool_calls = false;
        });
    }
    if (identity.provider === TROLL_LLM_PROVIDER) applyTrollLlmRequiredHeaders(payload, resolvedRoute);
    return payload;
}

function buildSemanticToolTransportOverrides(chatCompletionSource, route = {}) {
    const policy = resolveSemanticToolTransportPolicy(chatCompletionSource, route);
    return { parallel_tool_calls: policy.disableParallelToolCalls ? false : undefined };
}

function semanticStructuredOutputOverrides() {
    return Object.fromEntries(SEMANTIC_STRUCTURED_OUTPUT_FIELDS.map(field => [field, undefined]));
}

export function applySemanticToolRequestPayloadPolicies(payload, route = {}) {
    const resolvedRoute = resolveSemanticPayloadRoute(payload, route);
    clearSemanticToolConflictFields(payload, resolvedRoute);
    applyStoryEngineSemanticToolTransportPayload(payload, resolvedRoute);
    return applyStoryEngineThinkingDisabledPayload(payload, resolvedRoute);
}

function clearSemanticToolConflictFields(payload, route = {}) {
    if (!payload || typeof payload !== 'object') return payload;
    for (const field of SEMANTIC_TOOL_CONFLICT_FIELDS) delete payload[field];

    const customIncludeBody = payload.custom_include_body ?? route.customIncludeBody;
    if (customIncludeBody == null || !String(customIncludeBody).trim()) return payload;
    const body = parseCustomIncludeBody(customIncludeBody);
    let changed = false;
    for (const field of SEMANTIC_TOOL_CONFLICT_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
        delete body[field];
        changed = true;
    }
    if (changed) payload.custom_include_body = yaml.stringify(body).trim();
    return payload;
}

export function applySemanticTextRequestPayloadPolicies(payload, route = {}) {
    if (!payload || typeof payload !== 'object') return payload;
    const resolvedRoute = resolveSemanticPayloadRoute(payload, route);
    const identity = resolveSemanticProviderIdentity(resolvedRoute.source, resolvedRoute);
    if (identity.provider === TROLL_LLM_PROVIDER) applyTrollLlmRequiredHeaders(payload, resolvedRoute);
    applyStoryEngineThinkingDisabledPayload(payload, resolvedRoute);
    clearSemanticStructuredOutputFields(payload, resolvedRoute);
    return payload;
}

function clearSemanticStructuredOutputFields(payload, route = {}) {
    for (const field of SEMANTIC_STRUCTURED_OUTPUT_FIELDS) delete payload[field];

    const customIncludeBody = payload.custom_include_body ?? route.customIncludeBody;
    if (customIncludeBody == null || !String(customIncludeBody).trim()) return payload;
    const body = parseCustomIncludeBody(customIncludeBody);
    let changed = false;
    for (const field of SEMANTIC_STRUCTURED_OUTPUT_FIELDS) {
        if (!Object.prototype.hasOwnProperty.call(body, field)) continue;
        delete body[field];
        changed = true;
    }
    if (changed) payload.custom_include_body = yaml.stringify(body).trim();
    return payload;
}

export function applyStoryEngineThinkingDisabledPayload(payload, route = {}) {
    if (!payload || typeof payload !== 'object') {
        return payload;
    }

    payload.include_reasoning = false;
    const resolvedRoute = resolveSemanticPayloadRoute(payload, route);
    const identity = resolveSemanticProviderIdentity(resolvedRoute.source, resolvedRoute);
    const source = identity.provider;
    delete payload.reasoning_effort;

    if (applyUrlProviderThinkingDisabledPayload(payload, resolvedRoute, identity)) {
        return payload;
    }
    if (OFFICIAL_OPENAI_SOURCES.has(source)) {
        applyOfficialOpenAiThinkingDisabledPayload(payload, resolvedRoute);
    } else if (source === 'nanogpt') {
        // SillyTavern maps NanoGPT's "min" setting to its native "none" effort.
        payload.reasoning_effort = 'min';
    } else if (source === 'openrouter') {
        payload.reasoning_effort = 'none';
    }

    return payload;
}

export function applyStoryEngineBaselineThinkingDisabledPayload(payload, route = {}) {
    if (!payload || typeof payload !== 'object') {
        return payload;
    }

    payload.include_reasoning = false;
    const source = String(route.source || payload.chat_completion_source || '').trim().toLowerCase();
    if (source === 'nanogpt') {
        payload.reasoning_effort = 'min';
    } else {
        delete payload.reasoning_effort;
    }

    return payload;
}

function applyOfficialOpenAiThinkingDisabledPayload(payload, route = {}) {
    const model = String(route.model || payload.model || '').trim().toLowerCase();
    if (OPENAI_NONE_FORWARDABLE_MODELS.has(model)) {
        payload.reasoning_effort = 'none';
        return;
    }
    if (OPENAI_KNOWN_NON_REASONING_MODEL_PATTERN.test(model)) {
        return;
    }

    // Unknown official model aliases must remain usable. SillyTavern/provider defaults
    // are safer than forwarding an unverified reasoning_effort value.
}

function parseCustomIncludeBody(value) {
    const source = String(value ?? '');
    if (!source.trim()) return {};

    let parsed;
    try {
        parsed = yaml.parse(source);
    } catch (error) {
        const detail = String(error?.message || error || 'Unknown YAML parse error').split(/\r?\n/, 1)[0];
        throw new Error(`Story Engine could not prepare the custom provider request because custom_include_body is invalid YAML: ${detail}`, { cause: error });
    }

    const merged = {};
    if (Array.isArray(parsed)) {
        for (const item of parsed) {
            if (isRecord(item)) Object.assign(merged, item);
        }
    } else if (isRecord(parsed)) {
        Object.assign(merged, parsed);
    }
    return merged;
}

function updateCustomIncludeBody(payload, route, update) {
    const customIncludeBody = payload.custom_include_body ?? route.customIncludeBody;
    const body = parseCustomIncludeBody(customIncludeBody);
    update(body);
    payload.custom_include_body = yaml.stringify(body).trim();
}

function applyUrlProviderThinkingDisabledPayload(payload, route, identity) {
    if (!identity.identifiedByUrl) return false;

    if (identity.provider === TROLL_LLM_PROVIDER) {
        updateCustomIncludeBody(payload, route, body => {
            body.reasoning_effort = 'low';
        });
        return true;
    }
    if (identity.provider === 'nanogpt') {
        updateCustomIncludeBody(payload, route, body => {
            const reasoning = isRecord(body.reasoning) ? body.reasoning : {};
            body.reasoning = { ...reasoning, effort: 'none' };
        });
        return true;
    }
    if (identity.provider === 'openrouter') {
        updateCustomIncludeBody(payload, route, body => {
            const reasoning = isRecord(body.reasoning) ? body.reasoning : {};
            body.reasoning = { ...reasoning, effort: 'none', exclude: true };
        });
        return true;
    }
    return false;
}

function parseCustomIncludeHeaders(value) {
    if (isRecord(value)) return { ...value };
    const source = String(value ?? '');
    if (!source.trim()) return {};

    let parsed;
    try {
        parsed = yaml.parse(source);
    } catch (error) {
        const detail = String(error?.message || error || 'Unknown YAML parse error').split(/\r?\n/, 1)[0];
        throw new Error(`Story Engine could not prepare the TrollLLM request because custom_include_headers is invalid YAML: ${detail}`, { cause: error });
    }

    const merged = {};
    if (Array.isArray(parsed)) {
        for (const item of parsed) {
            if (isRecord(item)) Object.assign(merged, item);
        }
    } else if (isRecord(parsed)) {
        Object.assign(merged, parsed);
    }
    return merged;
}

function applyTrollLlmRequiredHeaders(payload, route = {}) {
    const configuredHeaders = payload.custom_include_headers ?? route.customIncludeHeaders;
    const headers = parseCustomIncludeHeaders(configuredHeaders);
    const existingUserAgentKey = Object.keys(headers)
        .find(key => String(key).trim().toLowerCase() === 'user-agent');
    headers[existingUserAgentKey || 'User-Agent'] = TROLL_LLM_USER_AGENT;
    payload.custom_include_headers = yaml.stringify(headers).trim();
}

function isRecord(value) {
    return Boolean(value && typeof value === 'object' && !Array.isArray(value));
}

function opaqueSemanticTurnHash(value, seed) {
    let hash = seed >>> 0;
    for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash.toString(16).padStart(8, '0');
}

export function createSemanticTurnBinding(options = {}, type = 'normal') {
    const effectiveUserInput = String(options?.latestUserText || '').trim();
    if (!effectiveUserInput) {
        throw annotateSemanticDiagnosticError(
            new Error('Semantic preflight has no effective current user input to bind.'),
            { code: 'SE-TURN-GROUNDING', stage: 'Current-turn grounding' },
        );
    }
    const seed = JSON.stringify({
        run: String(options?.semanticTurnKey || ''),
        type: String(type || 'normal'),
        mode: String(options?.userInputMode || 'normal'),
        input: effectiveUserInput,
    });
    return {
        turnId: `se-turn-${opaqueSemanticTurnHash(seed, 0x811c9dc5)}${opaqueSemanticTurnHash(seed, 0x9e3779b9)}`,
        effectiveUserInput,
    };
}

export function buildSemanticTurnBindingBlock(turnBinding) {
    const effectiveUserInput = String(turnBinding?.effectiveUserInput || '');
    if (!effectiveUserInput) {
        throw annotateSemanticDiagnosticError(
            new Error('Semantic current-turn binding is incomplete.'),
            { code: 'SE-TURN-GROUNDING', stage: 'Current-turn grounding' },
        );
    }
    const payload = JSON.stringify({ effectiveUserInput });
    return [
        SEMANTIC_TURN_BINDING_BLOCK_HEADER,
        'The JSON object below is authoritative data for this semantic pass. Analyze effectiveUserInput as the current user turn; use all earlier messages only as context.',
        payload,
        'For every resolutionEngine.actionUnits entry, copy evidence exactly from one contiguous span of effectiveUserInput. Preserve every source word, first-person/third-person pronoun, possessive, quantity, negation, target, and action term in the same order. Do not summarize, paraphrase, translate, normalize, reframe from the character\'s perspective, or copy from assistant narration or an earlier user turn. Punctuation, whitespace, letter case, apostrophe style, and JSON escaping may differ only because of formatting; the extension will restore the exact source span.',
    ].join('\n');
}

function validateSemanticPromptTurnBinding(prompt, turnBinding) {
    const messages = Array.isArray(prompt) ? prompt : [];
    const finalMessage = messages.at(-1);
    const expectedBlock = buildSemanticTurnBindingBlock(turnBinding);
    if (finalMessage?.role !== 'user' || finalMessage?.content !== expectedBlock) {
        throw annotateSemanticDiagnosticError(
            new Error('Semantic request did not preserve the authoritative current-turn block as its final message.'),
            { code: 'SE-TURN-GROUNDING', stage: 'Current-turn grounding' },
        );
    }
    return true;
}

function normalizeTurnGroundingQuote(value) {
    return String(value ?? '')
        .normalize('NFC')
        .trim()
        .replace(/\s+/gu, ' ');
}

function tokenizeTurnGroundingText(value) {
    const text = String(value ?? '');
    const tokens = [];
    const pattern = /[\p{L}\p{M}\p{N}]+(?:['’\-][\p{L}\p{M}\p{N}]+)*/gu;
    for (const match of text.matchAll(pattern)) {
        const raw = match[0];
        const value = raw
            .replace(/['’\-]/gu, '')
            .normalize('NFC')
            .toLowerCase();
        if (!value) continue;
        tokens.push({
            value,
            start: match.index,
            end: match.index + raw.length,
        });
    }
    return tokens;
}

function findTurnGroundingSpan(source, evidence) {
    const sourceTokens = tokenizeTurnGroundingText(source);
    const evidenceTokens = tokenizeTurnGroundingText(evidence);
    if (!sourceTokens.length || !evidenceTokens.length || evidenceTokens.length > sourceTokens.length) return '';

    return findExactTurnGroundingTokenSpan(source, sourceTokens, evidenceTokens);
}

function findExactTurnGroundingTokenSpan(source, sourceTokens, expectedTokens) {
    if (!sourceTokens.length || !expectedTokens.length || expectedTokens.length > sourceTokens.length) return '';

    for (let start = 0; start <= sourceTokens.length - expectedTokens.length; start += 1) {
        const matches = expectedTokens.every((token, offset) => token.value === sourceTokens[start + offset].value);
        if (matches) {
            const first = sourceTokens[start];
            const last = sourceTokens[start + expectedTokens.length - 1];
            return source.slice(first.start, last.end);
        }
    }
    return '';
}

const TURN_GROUNDING_PRONOUNS = Object.freeze(new Set([
    'i', 'me', 'my', 'mine', 'myself',
    'we', 'us', 'our', 'ours', 'ourselves',
    'you', 'your', 'yours', 'yourself', 'yourselves',
    'he', 'him', 'his', 'himself',
    'she', 'her', 'hers', 'herself',
    'they', 'them', 'their', 'theirs', 'themselves',
    'it', 'its', 'itself',
]));

function isTurnGroundingPronoun(value) {
    return TURN_GROUNDING_PRONOUNS.has(String(value || '').toLowerCase());
}

function findPerspectiveAdjustedTurnGroundingSpan(source, evidence) {
    const sourceTokens = tokenizeTurnGroundingText(source);
    const evidenceTokens = tokenizeTurnGroundingText(evidence);
    if (!sourceTokens.length || !evidenceTokens.length || evidenceTokens.length > sourceTokens.length) return '';

    for (let start = 0; start <= sourceTokens.length - evidenceTokens.length; start += 1) {
        let substantiveMatches = 0;
        let pronounSubstitutions = 0;
        let matches = true;
        for (let offset = 0; offset < evidenceTokens.length; offset += 1) {
            const sourceToken = sourceTokens[start + offset].value;
            const evidenceToken = evidenceTokens[offset].value;
            if (sourceToken === evidenceToken) {
                if (!isTurnGroundingPronoun(sourceToken)) substantiveMatches += 1;
                continue;
            }
            if (isTurnGroundingPronoun(sourceToken) && isTurnGroundingPronoun(evidenceToken)) {
                pronounSubstitutions += 1;
                continue;
            }
            matches = false;
            break;
        }
        if (!matches || substantiveMatches === 0 || pronounSubstitutions === 0) continue;
        const first = sourceTokens[start];
        const last = sourceTokens[start + evidenceTokens.length - 1];
        return source.slice(first.start, last.end);
    }
    return '';
}

function validateSemanticTurnIdentity(ledger, turnBinding) {
    if (!Object.prototype.hasOwnProperty.call(ledger || {}, 'turnBinding')) return true;
    const expectedTurnId = String(turnBinding?.turnId || '').trim();
    const returnedTurnId = String(ledger?.turnBinding?.turnId || '').trim();
    if (!expectedTurnId || returnedTurnId !== expectedTurnId) {
        throw annotateSemanticDiagnosticError(
            new Error('Semantic result did not echo the current turn ID exactly.'),
            { code: 'SE-TURN-GROUNDING', stage: 'Current-turn grounding', field: '$.turnBinding.turnId' },
        );
    }
    return true;
}

export function validateSemanticTurnGrounding(ledger, turnBinding) {
    const effectiveUserInput = String(turnBinding?.effectiveUserInput ?? '').trim();
    if (!normalizeTurnGroundingQuote(effectiveUserInput)) {
        throw annotateSemanticDiagnosticError(
            new Error('Semantic current-turn input is empty after normalization.'),
            { code: 'SE-TURN-GROUNDING', stage: 'Current-turn grounding' },
        );
    }
    const actionUnits = ledger?.resolutionEngine?.actionUnits;
    if (!Array.isArray(actionUnits) || actionUnits.length === 0) {
        throw annotateSemanticDiagnosticError(
            new Error('Semantic result has no action-unit evidence bound to the current turn.'),
            { code: 'SE-TURN-GROUNDING', stage: 'Current-turn grounding', field: '$.resolutionEngine.actionUnits' },
        );
    }
    for (const [index, unit] of actionUnits.entries()) {
        const evidence = normalizeTurnGroundingQuote(unit?.evidence);
        let groundedEvidence = !evidence || isNoneValue(evidence)
            ? ''
            : findTurnGroundingSpan(effectiveUserInput, evidence);
        let groundingRecovery = '';
        if (!groundedEvidence && evidence && !isNoneValue(evidence)) {
            groundedEvidence = findPerspectiveAdjustedTurnGroundingSpan(effectiveUserInput, evidence);
            if (groundedEvidence) groundingRecovery = 'pronoun-perspective substitution';
        }
        if (!groundedEvidence) {
            const action = normalizeTurnGroundingQuote(unit?.action);
            throw annotateSemanticDiagnosticError(
                new Error(`Semantic action unit A${index + 1} evidence is not grounded by the same contiguous word sequence from the current user input or an allowed pronoun-perspective equivalent.`),
                {
                    code: 'SE-TURN-GROUNDING',
                    stage: 'Current-turn grounding',
                    field: `$.resolutionEngine.actionUnits[${index}].evidence`,
                    received: { evidence: evidence || '(none)', action: action || '(none)' },
                    excerpt: `Current user input: ${effectiveUserInput.slice(0, 320)}`,
                },
            );
        }
        if (groundingRecovery) {
            try {
                console.warn(`[Structured Preflight Engines] repaired action-unit A${index + 1} evidence from a ${groundingRecovery}; the exact current-turn source span was restored.`);
            } catch {
                // Diagnostics must never affect semantic validation.
            }
        }
        unit.evidence = groundedEvidence;
    }
    return ledger;
}

export function buildSemanticToolPrompt(prompt) {
    const toolContract = [
        `MANDATORY OUTPUT CONTRACT: Call the function tool ${SEMANTIC_TOOL_NAME} exactly once.`,
        'Do not output narration, prose, markdown, visible JSON, or ordinary assistant text.',
        ...buildSharedSemanticOutputRules(),
        SEMANTIC_ACTION_UNIT_ACCURACY_AUDIT,
    ].join('\n');

    return replaceSemanticOutputContract(prompt, toolContract);
}

export function buildSemanticTextLedgerPrompt(prompt) {
    const textContract = [
        'MANDATORY OUTPUT CONTRACT: Return exactly one complete semantic preflight JSON object framed by the two exact lines below.',
        SEMANTIC_TEXT_LEDGER_START,
        '{ complete JSON ledger }',
        SEMANTIC_TEXT_LEDGER_END,
        'Output no prose, explanation, reasoning, markdown, code fence, tool call, or other text. Apart from optional surrounding whitespace, nothing may appear before the start marker or after the end marker. The marker lines must appear exactly once each.',
        'The JSON object must be complete and valid. Duplicate keys are forbidden. Do not omit, rename, or add any property. Do not use comments, trailing commas, ellipses, placeholders, or template rows.',
        ...buildSharedSemanticOutputRules(),
        SEMANTIC_ACTION_UNIT_ACCURACY_AUDIT,
        'JSON OUTPUT SHAPE: This is the current complete key and nesting guide. Replace its sample values with decisions from the authoritative context. Every array is [] when no real entry applies; otherwise every real entry must retain the complete item shape shown here. Never emit the displayed sample array entries unless they are real and fully supported.',
        buildSemanticTextLedgerShapeGuide(),
        'FINAL TEXT-LEDGER FORMAT REQUIREMENT: The response is invalid unless every enum property contains exactly one token from the CLOSED ENUM CONTRACT above, with no sentence, explanation, mechanism, symptom, label, synonym, or extra words. Put prose only in non-enum fields such as reason, evidence, description, or bodyPart. When no qualifying entry exists, use the field\'s exact neutral token or the schema-required empty array. These are generation constraints, not suggestions.',
        buildSemanticEnumContract(),
        SEMANTIC_TEXT_LEDGER_TARGET_DISAMBIGUATION,
    ].join('\n');

    return replaceSemanticOutputContract(prompt, textContract);
}

const SEMANTIC_TEXT_LEDGER_TARGET_DISAMBIGUATION = 'TEXT-LEDGER FIRST-TURN TARGET RULE: In a new chat with no prior assistant scene description, the active SillyTavern character named in Active names and character context is still the conversation\'s present character. When the latest user input directly attacks or otherwise directly affects that character and uses an unambiguous singular living-person reference such as him or her, treat that active character as the target by identity even if the card provides only a name and no description. For a direct attack, place that character in ActionTargets and, when the action creates fresh stakes, OppTargets.NPC; classify the route from the explicit action and count each explicit discrete attack/effect in actionUnits, capped at three. The active character name identifies only the referent: do not invent personality, abilities, hostility, stats, location, prior actions, or other unstated facts. Do not apply this rule when the active character is the user, is not a plausible living person, or when multiple plausible living targets make the reference ambiguous; in those cases do not guess.';

function buildSharedSemanticOutputRules() {
    return [
        'Fill the complete nested semantic object defined by the authoritative submit_semantic_preflight schema. Retain every required object property and nesting; each real array entry retains its complete property set. No unknown property is allowed.',
        'The schema field names, nesting, types, enums, and field guidance are authoritative in every semantic output mode. Treat every field description as a mandatory semantic decision rule, not as an example, and evaluate every field independently against the supplied authoritative context.',
        'Complete every required object and array even when the scene does not activate that engine. Use only the schema-defined neutral, false, none, unchanged, or empty value appropriate to the field when its evidence is absent.',
        'Accuracy has priority over choosing an active value. Every non-neutral classification must be supported by the supplied context; never invent evidence, infer an unsupported fact, or select a value merely to fill the ledger.',
        'Use the exact JSON type for every value: booleans as booleans, integers as integers, arrays as arrays, and objects as objects.',
        'For enum fields, use exactly one value listed by the schema. Choose it only when its field guidance and the supplied context support it; never choose randomly, invent a synonym, or use an alternate label.',
        'InjuryEffectEngine.effectType is a closed canonical enum, not a free-text label: use exactly the listed values, map direct bodily-damage terms such as blunt force, bruising, wounds, cuts, lacerations, fractures, and sprains to physical_injury, and keep mechanism/body detail in description/bodyPart. Do not use pain, impact, trauma, or another ambiguous symptom as the category.',
        'PowerActorEnmity.effects[].effect is a closed strategic-consequence enum, not a narrative description. Use reason for the explanatory sentence and return an empty effects array when no qualifying strategic consequence exists. An ordinary personal assault is not automatically power-actor enmity.',
        'Each schema array defines one entry shape. Return an empty array when no real entries apply, keep only real entries, and repeat the entry shape only as needed. Do not emit placeholders, template rows, count fields, sentinel values, comments, trailing commas, or ellipses.',
        'Ground every resolutionEngine.actionUnits evidence value with an exact contiguous span of the supplied effectiveUserInput. Preserve every source word, first-person/third-person pronoun, possessive, quantity, negation, target, and action term in the same order. Do not summarize, paraphrase, translate, normalize, reframe from the character\'s perspective, or copy from assistant narration or an earlier user turn. Punctuation, whitespace, letter case, apostrophe style, and JSON escaping may differ only as formatting; the extension restores the exact source span. If the evidence is absent or contains substantive words not present in the current input, do not fabricate a replacement: the semantic pass must fail validation.',
        'Interpret any legacy semantic guidance by its equivalent canonical JSON meaning: Y/N maps to true/false, and absent applicable entries map to an empty array. Apply field guidance only through the canonical schema properties.',
        'worldProgression.advancements must cover every active plan due now or due after the supplied WorldTransition succeeds, with exactly one entry per due plan.',
        'The complete Engine reference, semantic contract, snapshots, and semantic field guidance remain authoritative. Transport changes only how the same ledger is returned; do not reduce, reinterpret, invent, or silently omit ledger content.',
    ];
}

let semanticEnumContractCache = '';

function buildSemanticEnumContract() {
    if (semanticEnumContractCache) return semanticEnumContractCache;
    const lines = [
        'CLOSED ENUM CONTRACT: Every path below is a constrained JSON string. Output exactly one token from its listed values, with exact spelling and capitalization. Never output a sentence, explanation, mechanism, symptom, label, or synonym in place of a listed token. Use the field guidance to choose the meaning; use this contract to choose the representation.',
    ];
    const visit = (schema, path) => {
        if (!schema || typeof schema !== 'object') return;
        if (Array.isArray(schema.enum)) {
            lines.push(`${path} MUST be exactly one of: ${schema.enum.join(', ')}.`);
            return;
        }
        if (schema.type === 'object') {
            for (const [name, childSchema] of Object.entries(schema.properties || {})) {
                visit(childSchema, `${path}.${name}`);
            }
            return;
        }
        if (schema.type === 'array') visit(schema.items, `${path}[]`);
    };
    visit(buildSemanticPreflightSchema(), '$');
    semanticEnumContractCache = lines.join('\n');
    return semanticEnumContractCache;
}

let semanticTextLedgerShapeGuideCache = '';

function buildSemanticTextLedgerShapeGuide() {
    if (semanticTextLedgerShapeGuideCache) return semanticTextLedgerShapeGuideCache;
    semanticTextLedgerShapeGuideCache = JSON.stringify(buildSemanticTextLedgerShapeValue(buildSemanticPreflightSchema()), null, 2);
    return semanticTextLedgerShapeGuideCache;
}

function buildSemanticTextLedgerShapeValue(schema) {
    if (!schema || typeof schema !== 'object') return null;
    if (schema.type === 'object') {
        return Object.fromEntries(
            Object.entries(schema.properties || {}).map(([name, value]) => [name, buildSemanticTextLedgerShapeValue(value)]),
        );
    }
    if (schema.type === 'array') return [buildSemanticTextLedgerShapeValue(schema.items)];
    if (schema.type === 'boolean') return false;
    if (schema.type === 'integer') return Number.isInteger(schema.minimum) ? schema.minimum : 0;
    if (Array.isArray(schema.enum)) {
        if (schema.enum.includes('none')) return 'none';
        if (schema.enum.includes('unchanged')) return 'unchanged';
        return schema.enum[0] ?? '';
    }
    return '(none)';
}

const SEMANTIC_ACTION_UNIT_ACCURACY_AUDIT = 'FINAL SEMANTIC ACCURACY AUDIT: Perform this silently before submitting the semantic object. Preserve every explicit quantity, negation, target, and stated method from effectiveUserInput. Treat resolutionEngine.actionUnits as an accounting of individually resolvable actions, never a summary of the overall intent. When the current user input explicitly repeats a direct combat action N times, emit N separate actionUnits, capped at three. Each actionUnit describes one occurrence; multiple units may cite the same exact evidence phrase when that phrase establishes the repeated actions. Evidence is an audit citation, not a paraphrase: copy one contiguous source span word for word, preserving pronouns and possessives; do not reframe it from another character\'s perspective. If no source span supports the evidence, do not invent one. Pattern: "I strike the guard twice" requires A1 and A2, each describing one strike and citing that same phrase. Do not output this audit or any placeholder text.';

function replaceSemanticOutputContract(prompt, contract) {
    const messages = Array.isArray(prompt)
        ? prompt.map(message => ({ ...message }))
        : [];
    let contractIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (typeof messages[index]?.content === 'string'
            && /MANDATORY OUTPUT CONTRACT/i.test(messages[index].content)) {
            contractIndex = index;
            break;
        }
    }

    if (contractIndex >= 0) {
        messages[contractIndex] = {
            ...messages[contractIndex],
            role: 'user',
            content: contract,
        };
    } else {
        const finalMessage = messages.at(-1);
        const hasFinalTurnBinding = finalMessage?.role === 'user'
            && typeof finalMessage.content === 'string'
            && finalMessage.content.startsWith(`${SEMANTIC_TURN_BINDING_BLOCK_HEADER}\n`);
        const insertAt = hasFinalTurnBinding ? messages.length - 1 : messages.length;
        messages.splice(insertAt, 0, { role: 'user', content: contract });
    }

    return messages;
}

export function buildStructuredToolChoice(toolName, chatCompletionSource, route = {}) {
    const policy = resolveSemanticToolTransportPolicy(chatCompletionSource, route);
    if (!policy.exactNamedToolChoice) return 'auto';
    return {
        type: 'function',
        function: { name: String(toolName || '').trim() },
    };
}

export function buildSemanticToolChoice(chatCompletionSource, route = {}) {
    return buildStructuredToolChoice(SEMANTIC_TOOL_NAME, chatCompletionSource, route);
}

export function buildSemanticPreflightTool(chatCompletionSource, route = {}, turnBinding = null) {
    const strictSchema = supportsStrictSemanticToolSchema(chatCompletionSource, route);
    const parameters = buildSemanticPreflightSchema();
    if (!strictSchema) removeStrictOnlySchemaKeywords(parameters);

    const tool = {
        type: 'function',
        function: {
            name: SEMANTIC_TOOL_NAME,
            description: 'Submit the complete structured semantic preflight ledger. This is data extraction only; do not narrate or roll dice.',
            parameters,
        },
    };

    if (strictSchema) tool.function.strict = true;
    return tool;
}

function removeStrictOnlySchemaKeywords(schema) {
    if (!schema || typeof schema !== 'object') return;
    delete schema.additionalProperties;
    if (schema.properties && typeof schema.properties === 'object') {
        Object.values(schema.properties).forEach(removeStrictOnlySchemaKeywords);
    }
    if (schema.items) removeStrictOnlySchemaKeywords(schema.items);
}

function buildSemanticPreflightSchema() {
    const describe = (schema, description) => description ? { ...schema, description } : schema;
    const string = description => describe({ type: 'string' }, description);
    const boolean = description => describe({ type: 'boolean' }, description);
    const integer = (minimum, maximum, description) => describe({ type: 'integer', minimum, maximum }, description);
    const enumString = (values, description) => describe({ type: 'string', enum: [...values] }, description);
    const object = properties => ({
        type: 'object',
        additionalProperties: false,
        required: Object.keys(properties),
        properties,
    });
    const array = (items, maxItems, minItems, description) => describe({
        type: 'array',
        ...(Number.isInteger(minItems) ? { minItems } : {}),
        ...(Number.isInteger(maxItems) ? { maxItems } : {}),
        items,
    }, description);
    const stringList = (maxItems, description) => array(string(), maxItems, undefined, description);
    const generatedStatsSeed = object({
        CapabilityPool: enumString(['none', 'common', 'trained', 'elite', 'boss']),
        MainStat: enumString(['none', 'PHY', 'MND', 'CHA', 'Balanced']),
    });
    const trackerNpcDelta = object({
        NPC: string(),
        revealedName: string(),
        personalitySummary: string(),
        background: string('Stable NPC background, role, or life experience. Use only explicit or durable established evidence; use unchanged when none is newly established.'),
        knowledge: string('Stable domains or facts this NPC plausibly knows from established context. Do not infer expertise from intelligence, role title, or one successful observation.'),
        practicedSkills: string('Concrete learned or practiced skills supported by established background or durable evidence. Do not invent techniques from a single current action.'),
        condition: enumString(TRACKER_CONDITIONS),
        woundsAdd: stringList(),
        woundsRemove: stringList(),
        statusAdd: stringList(),
        statusRemove: stringList(),
        gearAdd: stringList(),
        gearRemove: stringList(),
    });
    const trackerUserDelta = object({
        condition: enumString(TRACKER_CONDITIONS),
        woundsAdd: stringList(),
        woundsRemove: stringList(),
        statusAdd: stringList(),
        statusRemove: stringList(),
        gearAdd: stringList(),
        gearRemove: stringList(),
        inventoryAdd: stringList(),
        inventoryRemove: stringList(),
        tasksAdd: stringList(),
        tasksRemove: stringList(),
        commitmentsAdd: stringList(),
        commitmentsRemove: stringList(),
    });
    const boundCompanionDelta = object({
        status: enumString(
            ['unchanged', 'active', 'inactive'],
            'active only when the assembled context explicitly establishes an inner companion, possession, shared vessel, intelligent item/weapon, bound spirit/artifact, or implant as already active/completed/accepted. inactive only when an established companion is explicitly severed, dismissed, removed, silenced permanently, or destroyed. unchanged for offers, pending pacts, invitations, unclear voices, metaphors, rumors, or no change.',
        ),
        name: string(),
        type: enumString(['none', 'possession', 'shared_vessel', 'intelligent_item', 'bound_spirit', 'artifact', 'implant', 'other']),
        vessel: string(),
        voice: string(),
        evidence: string(),
    });
    const injuryEffect = object({
        target: string('Exact current tracker key for the entity actually receiving the impairing effect when one exists. Do not add articles, death descriptors, possessives, body, corpse, or remains. HarmedObservers qualify only when directly affected by the injury or status effect.'),
        targetRole: enumString(['OppTarget', 'HarmedObserver', 'ActionTarget', 'User', 'Other']),
        effectType: enumString(
            INJURY_EFFECT_TYPES,
            'Closed canonical vocabulary. Return exactly one listed value. Use physical_injury for direct bodily damage such as blunt force, bruising, wounds, cuts, lacerations, fractures, or sprains; keep the descriptive mechanism or body detail in description/bodyPart. Never return a mechanism, symptom, or free-text synonym as the enum value.',
        ),
        bodyPart: string(),
        description: string(),
        severityFloor: enumString(['minor', 'moderate', 'severe', 'critical']),
        persistence: enumString(['none', 'lasting']),
        affectsAction: boolean(),
    });
    const powerActorAssessment = object({
        actor: string(),
        scope: enumString(POWER_ACTOR_ASSESSMENT_SCOPES),
        isPowerActor: boolean('Y when context gives any credible means to affect the user beyond the entity acting alone in the moment: money, influence, authority, status, agents, staff, hired help, resources, institutional/faction access, reputation, information, territory, magic, command, leverage, social reach, ownership, public prominence, or recurring access. Assess semantically, not by title keyword.'),
        actorType: string(),
        reach: stringList(),
        evidence: string(),
        assessmentReason: string(),
    });
    const powerActorEffect = object({
        actor: string(),
        actorType: string(),
        sourceTarget: string('Exact person, organization, or other current target whose setback creates this effect. Use the Power Actor itself when directly affected.'),
        actionUnitId: enumString(['A1', 'A2', 'A3'], 'Positional ID of the actionUnits entry that causes this effect: first entry=A1, second=A2, third=A3. The extension assigns these IDs.'),
        explicitlyCompleted: boolean('For no-roll turns only: Y only when current input/context explicitly establishes the effect as already completed. Use N for attempts and all rolled actions.'),
        hasReach: boolean('Y only for organizations or unusually influential individuals with resources, agents, authority, territory, money, magic, reputation, or information access.'),
        effect: enumString(POWER_ACTOR_EFFECT_TYPES),
        severity: enumString(POWER_ACTOR_SEVERITIES),
        reason: string(),
        knownToActor: boolean('Y only if the actor plausibly knows, observes, is informed of, or can discover the user action through ordinary reach.'),
    });
    const latentGrievance = object({
        target: string('Exact current living target label. This target is presently assessed as ordinary and has no established Power Actor affiliation.'),
        actionUnitId: enumString(['A1', 'A2', 'A3'], 'Positional ID of the actionUnits entry that causes this grievance: first entry=A1, second=A2, third=A3. The extension assigns these IDs.'),
        explicitlyCompleted: boolean('For no-roll turns only: Y only when current input/context explicitly establishes the setback as already completed. Use N for attempts and all rolled actions.'),
        effect: enumString(POWER_ACTOR_EFFECT_TYPES),
        severity: enumString(['meaningful', 'major'], 'Only substantial durable setbacks qualify. Ordinary friction and minor insults do not.'),
        reason: string(),
        evidence: string(),
        attributionPath: string(),
    });
    const powerActorAffiliationLink = object({
        grievanceId: string('Exact id copied from the hidden latent grievance snapshot.'),
        powerActor: string(),
        affiliationEvidence: string('Explicit established context linking the grievance target to this Power Actor. Never infer or invent an affiliation.'),
        knownToActor: boolean('Y only when the Power Actor knows or has a concrete ordinary discovery/reporting path for the stored grievance.'),
        knowledgeEvidence: string(),
    });
    const latentFavor = object({
        target: string('Exact current living beneficiary label. This target is presently assessed as ordinary and has no established Power Actor affiliation.'),
        actionUnitId: enumString(['A1', 'A2', 'A3'], 'Positional ID of the actionUnits entry that causes this favor: first entry=A1, second=A2, third=A3. The extension assigns these IDs.'),
        explicitlyCompleted: boolean('For no-roll turns only: Y only when current input/context explicitly establishes the aid as already completed. Use N for attempts and all rolled actions.'),
        benefit: enumString(POWER_ACTOR_FAVOR_TYPES),
        severity: enumString(['meaningful', 'major'], 'Only substantial help qualifies. Courtesy, small gifts, and ordinary assistance do not.'),
        reason: string(),
        evidence: string(),
        uncompensated: boolean('Y only when no payment, contracted reward, exchange, or promised compensation already covers the help. N when unclear.'),
        beyondExpectedDuty: boolean('Y only when the help exceeds the user normal job, contract, role, obligation, or routine professional conduct. N when unclear.'),
        attributionPath: string(),
    });
    const powerActorFavorAffiliationLink = object({
        favorId: string('Exact id copied from the hidden latent favor snapshot.'),
        powerActor: string(),
        affiliationEvidence: string('Explicit established context linking the favor target to this Power Actor. Never infer or invent an affiliation.'),
        knownToActor: boolean('Y only when the Power Actor knows or has a concrete ordinary discovery/reporting path for the stored favor.'),
        knowledgeEvidence: string(),
        knownToUser: boolean('Y only when visible or previously established user-facing context already reveals this beneficiary affiliation and Power Actor identity. Hidden semantic knowledge is insufficient.'),
        userKnowledgeEvidence: string('Direct user-facing dialogue, readable text, recognition, or established scene fact proving knownToUser=Y; otherwise (none).'),
        fit: enumString(POWER_ACTOR_FAVOR_FITS, 'use_now only when one favorable approach can naturally enter the current scene without interrupting combat, crisis, active intimacy, urgent action, or the current dramatic beat; otherwise defer.'),
        fitEvidence: string('Concise current-scene reason for use_now or defer.'),
    });
    const powerEvent = object({
        eventId: string(),
        actor: string(),
        fit: enumString(POWER_EVENT_FITS),
        visibleInstruction: string('Narrator-safe surface scene instruction only. No hidden motive, allegiance, sponsor, spy, agent, infiltration, betrayal, or metadata language.'),
        contactName: string(),
        contactGender: enumString(POWER_EVENT_CONTACT_GENDERS),
        surfaceRole: string(),
        deferReason: string(),
    });
    const stakeChange = object(Object.fromEntries(
        STAKE_OUTCOME_KEYS.map(key => [key, enumString(['benefit', 'harm', 'none'])]),
    ));
    const itemUse = object({
        attempted: boolean('Y only when the latest user input directly handles, uses, accesses, possesses, transfers, or otherwise acts on one specifically identified concrete inanimate object or material. Searching, scanning, looking around, inspecting, examining, rummaging, foraging, or seeking something/anything useful is not itemUse by itself. Generic categories such as weapon, tool, object, item, something, or anything are not concrete Item values. Living beings, creatures, anatomy/body parts, natural weapons, bodily contact or poses, movements, locations, surfaces, sensations, thoughts, dialogue, events, relationships, and abstract concepts are not itemUse.'),
        item: string('A short noun phrase naming only the concrete inanimate object or material being treated as present/usable. Never copy an action, interaction, body reference, living entity, or sentence into Item. Use (none) only when Attempted=N.'),
    });
    const lootSearch = object({
        attempted: boolean('Y only when the latest user input explicitly searches, loots, rummages through, checks, or examines a specific body, corpse, remains, or defeated target for carried or recoverable possessions. Do not decide death, loot contents, value, or prior-search state.'),
        target: string(),
        targetKind: enumString(LOOT_TARGET_KINDS, 'humanoid for personlike/civilized equipment-bearing remains, monster for creature/monster remains expected to yield a magic stone, otherwise other.'),
        evidence: string(),
    });
    const claimCheck = object({
        present: boolean('Y only when the latest user input makes a factual claim that could affect a specific NPC choice or stakes.'),
        claim: string(),
        targetNPC: string(),
        truthStatus: enumString(CLAIM_TRUTH_STATUSES, 'known_true=explicitly supported; known_false=explicitly contradicted; unsupported=material claim not established; unknown=insufficient context; none=no relevant claim.'),
        npcAccess: enumString(CLAIM_NPC_ACCESS_LEVELS, 'How much the target NPC can naturally verify or know the claim: direct, partial, none, or unknown.'),
        stakesImpact: boolean('Y only if belief/disbelief could materially affect the NPC choice, trust, access, resources, authority, safety, emotional vulnerability, or immediate stakes.'),
        reason: string(),
    });
    const restraintControl = object({
        present: boolean('Y only when the latest user input explicitly holds, pins, grabs, drags, blocks, binds, immobilizes, carries, forces position, or prevents movement of a specific living NPC.'),
        targetNPC: string(),
        evidence: string(),
    });
    const boundaryPressure = object({
        present: boolean('Y for non-restraint pressure on an NPC-controlled possession, object, space, route, doorway, access point, or departure.'),
        type: enumString(BOUNDARY_PRESSURE_TYPES),
        targetNPC: string(),
        objectOrAccess: string(),
        evidence: string(),
    });
    const boundaryBreak = object({
        present: boolean('Y only when hidden tracker pendingBoundary exists and the latest user input continues, escalates, ignores, or refuses to release/return/stop that same boundary behavior.'),
        response: enumString(BOUNDARY_BREAK_RESPONSES),
        evidence: string(),
    });
    const userKnowledgeApplication = object({
        target: string('The present NPC/group this knowledge plausibly applies to, or (none).'),
        entryIds: stringList(),
        type: enumString(USER_KNOWLEDGE_TYPES),
        knownBy: string(),
        scope: enumString(USER_KNOWLEDGE_SCOPES),
        valence: enumString(['none', ...USER_REPUTATION_VALENCES]),
        effect: enumString(USER_KNOWLEDGE_APPLICATION_EFFECTS, 'How this knowledge should affect init/context: priorUserGoodRep, userBadRep, userNonHuman, contextOnly, or none.'),
        line: string(),
        reason: string(),
    });
    const actionUnit = object({
        action: string('Short clean description of this mechanically counted user action.'),
        evidence: string('Exact words copied from one contiguous span of the authoritative effective current user input for this action unit. Preserve every source word, pronoun, possessive, quantity, negation, target, and action term in the same order. Do not summarize, paraphrase, translate, normalize, or reframe perspective. Punctuation, whitespace, letter case, apostrophe style, and JSON escaping may differ only as formatting; audit only, not narration.'),
    });
    const worldTransition = object({
        reputationLocation: string('Use unchanged unless the latest user input explicitly changes the current settlement, route, region, or reputation jurisdiction. Never copy or infer the existing scene state.'),
        place: string('Use unchanged unless the latest user input explicitly enters, leaves, or moves to a different place. Never copy or infer the existing place from context.'),
        area: string('Use unchanged unless the latest user input explicitly enters, leaves, or moves to a different sub-area. Never copy or infer the existing area from context.'),
        indoors: enumString(['unchanged', 'indoors', 'outdoors'], 'Use unchanged unless the latest user input explicitly crosses between indoors and outdoors.'),
        timeAdvance: enumString(['none', 'slot', 'overnight', 'day', 'explicit'], 'Use none unless the latest user input explicitly waits, sleeps, travels through, or skips time.'),
        timeAdvanceCount: integer(1, 3650, 'Number of timeAdvance units explicitly established by the latest user input; use 1 when timeAdvance is none.'),
        timeOfDay: enumString(['unchanged', 'morning', 'afternoon', 'evening', 'night'], 'Use unchanged unless the latest user input explicitly establishes a new time of day.'),
        requiresSuccess: boolean('True only when this explicit transition depends on the current stakes-bearing action succeeding.'),
        evidence: string('Exact contiguous quote from the latest user input that establishes this transition, or (none) when every transition field is unchanged/none.'),
    });
    const worldEvidence = object({
        topic: string(),
        text: string(),
        route: enumString(['location', 'actor', 'news', 'investigation']),
        location: string(),
        actor: string(),
    });
    const worldAdvancement = object({
        planId: string(),
        stageLabel: string(),
        consequence: string(),
        status: enumString(['active', 'completed']),
        nextDelayDays: integer(0, 120),
        nextDelaySlots: integer(0, 480),
        evidence: array(worldEvidence, 4, 1),
    });
    const relationship = object({
        NPC: string(),
        aggressionMethod: enumString(AGGRESSION_METHODS, RELATIONSHIP_FIELD_DESCRIPTIONS.aggressionMethod),
        aggressionMethodEvidence: string(RELATIONSHIP_FIELD_DESCRIPTIONS.aggressionMethodEvidence),
        initPreset: object({
            romanticOpen: boolean('Y when prior card/lore/scenario/chat establishes clear user-directed romantic interest, romantic willingness, love, crush, courting desire, romantic preoccupation, or deliberate romantic pursuit toward user; not generic friendliness, politeness, casual flirting, shallow physical attraction, vague chemistry, ordinary embarrassment, or first impressions.'),
            userBadRep: boolean('Y only for explicit authored prior hate, distrust, enemy status, pursuit, betrayal, harm, or negative relationship with this NPC from character card, lore, scenario, or pre-existing relationship context; not current-scene conflict or broad public infamy.'),
            priorUserGoodRep: boolean('Y only for explicit authored established favorable or trust-normalizing prior history, trust, gratitude, safe familiarity, vouching, friendship, or relationship with this NPC from character card, lore, scenario, or pre-existing relationship context; not kindness, good impressions, or broad public fame.'),
            userNonHuman: boolean('Y for visibly demonic, monstrous, undead, bestial, eldritch, construct-like, or obviously supernatural user form when this is a fresh or unnormalized exposure, or explicit authored fear-coded relationship context with this NPC. Do not use broad public infamy here; deterministic fame/infamy handles that.'),
            fearImmunity: boolean('Y only for the same kind/race category as the user form, a superior or peer supernatural/monstrous being, explicit immunity or natural resistance to fear, or an explicitly nonordinary ancient/powerful being established as experienced with such horrors and not meaningfully afraid. Title, rank, bravado, posturing, composure, courage, ordinary guards/soldiers, or normal combat experience do not qualify.'),
        }),
        auditInteraction: boolean(RELATIONSHIP_FIELD_DESCRIPTIONS.auditInteraction),
        exceptionalBenefit: boolean(RELATIONSHIP_FIELD_DESCRIPTIONS.exceptionalBenefit),
        exceptionalBenefitScale: enumString(EXCEPTIONAL_BENEFIT_SCALES, RELATIONSHIP_FIELD_DESCRIPTIONS.exceptionalBenefitScale),
        exceptionalBenefitEvidence: string(RELATIONSHIP_FIELD_DESCRIPTIONS.exceptionalBenefitEvidence),
        establishedRelationship: boolean(RELATIONSHIP_FIELD_DESCRIPTIONS.establishedRelationship),
        romanceStyle: enumString(ROMANCE_STYLES, RELATIONSHIP_FIELD_DESCRIPTIONS.romanceStyle),
        slowBondEvidence: object({
            respectfulContact: boolean(SLOW_BOND_CATEGORY_DESCRIPTIONS.respectfulContact),
            cooperation: boolean(SLOW_BOND_CATEGORY_DESCRIPTIONS.cooperation),
            comfortInProximity: boolean(SLOW_BOND_CATEGORY_DESCRIPTIONS.comfortInProximity),
            boundaryRespect: boolean(SLOW_BOND_CATEGORY_DESCRIPTIONS.boundaryRespect),
            sharedRoutine: boolean(SLOW_BOND_CATEGORY_DESCRIPTIONS.sharedRoutine),
            playfulness: boolean(SLOW_BOND_CATEGORY_DESCRIPTIONS.playfulness),
            teamwork: boolean(SLOW_BOND_CATEGORY_DESCRIPTIONS.teamwork),
            personalAttention: boolean(SLOW_BOND_CATEGORY_DESCRIPTIONS.personalAttention),
            blockers: stringList(12, SLOW_BOND_BLOCKERS_DESCRIPTION),
        }),
        explicitIntimidationOrCoercion: boolean(RELATIONSHIP_FIELD_DESCRIPTIONS.explicitIntimidationOrCoercion),
        standingInfluence: enumString(STANDING_INFLUENCES, 'How this specific NPC\'s knowledge of user standing relative to themselves affects their outward conduct. none=no recognized meaningful user-standing difference; aware=user standing changes etiquette, caution, risk, or openness without constraining the NPC; constrained=user\'s recognized higher authority, status, power, backing, lineage, or affiliation limits what the NPC openly expresses or dares to do. This changes expression only and never changes B/F/H.'),
        standingBasis: string('Concise evidence for the assessment from user standing this NPC actually knows and recognizes relative to themselves: title, authority, reputation, demonstrated power, backing, lineage, or affiliation. Use (none) when standingInfluence=none. Unknown, concealed, or unsupported status must remain none/(none).'),
        stakeChangeByOutcome: stakeChange,
        overrideFlags: object({
            CurrentInvitation: boolean('Y only when this NPC has clearly offered, requested, invited, strongly implied, accepted, agreed to, arranged, or physically initiated sexual/intimate escalation with the user in the current or immediately recent scene, and has not withdrawn, refused, panicked, or been interrupted by danger. This includes accepting the user\'s explicit proposal, agreeing to join, inviting or calling another willing participant, saying yes to coming over for intimacy, and irrefutable sexual invitation hints framed as questions. Ordinary flirting, suggestive banter, compliments, attraction, embarrassment, vague innuendo without an invitation, or an unaccepted user proposal do not qualify.'),
            Exploitation: boolean('Y only when card/lore/context explicitly makes this NPC exploitable by user or situation: naive, easily led/persuaded, follows user lead without question, dependent, trapped, coerced, powerless, or unsafely sheltered. Not mere innocence, shyness, kindness, flirting, or low confidence.'),
            Hedonist: boolean('Y only for explicitly sexually open, pleasure-seeking, casual, promiscuous, or eager intimacy context.'),
            Transactional: boolean('Y only for explicit willingness to exchange intimacy for money, goods, favors, protection, status, or services.'),
            Established: boolean('Y only for explicit prior/current intimate access with current or recent receptivity toward user, separate from establishedRelationship. Prior intimacy alone is not enough if current receptivity is absent, stale, unclear, refused, fearful, hostile, coerced, or boundary-limited.'),
            RomanticBuildup: boolean('Y only for a B4 close-bond scene where the current and recent interaction has consistently and mutually built toward romantic/intimate escalation with receptive NPC behavior, making the user latest intimate advance a natural continuation. N for ordinary friendliness, tenderness, gratitude, warmth, single smiles, casual flirting, vague chemistry, or user-only escalation. N if refusal, withdrawal, fear, hostility, coercion, danger, public/social interruption, or a boundary limit is active.'),
        }),
        genStats: generatedStatsSeed,
    });

    return object({
        engineContext: object({
            userReputationContext: object({
                location: string('Current settlement/community/route/region for deterministic fame/infamy lookup, or (none). Do not decide reputation effects here.'),
            }),
        }),
        worldTransition,
        worldProgression: object({ advancements: array(worldAdvancement, 18) }),
        resolutionEngine: object({
            identifyGoal: string(),
            identifyChallenge: string(),
            explicitMeans: string(),
            userAbilityUse: object({
                attempted: boolean('Y when the latest user input explicitly names or implicitly describes an attempted ability/spell/supernatural effect through trigger, delivery method, or desired effect.'),
                available: boolean('Y only when the attempted ability/spell exists in active user/persona abilities or spells from context.'),
                abilityName: string(),
                evidence: string(),
                narrativeEffect: string(),
                noEffectReason: string(),
            }),
            itemUse,
            lootSearch,
            claimCheck,
            identifyTargets: object({
                hostilesInScene: object({ NPC: stringList() }),
                ActionTargets: stringList(undefined, 'Living entities {{user}} directly addresses, affects, helps, harms, restrains, deceives, negotiates with, or otherwise directly interacts with in the latest input. Do not include an NPC solely because {{user}} follows, trails, observes, moves near, or tries to avoid detecting them; those covert detectors belong only in StealthTargets.'),
                StealthTargets: stringList(undefined, 'Exact established living entities whose detection {{user}} is explicitly trying to avoid. Use only for an explicit covert attempt such as moving past, following, trailing, tailing, shadowing, hiding from, sneaking around, infiltrating, or observing without detection. Include the exact entity name; use an empty list when avoiding detection is not explicit.'),
                OppTargets: object({ NPC: stringList(), ENV: stringList() }),
                BenefitedObservers: stringList(),
                HarmedObservers: stringList(),
                NPCAwareOfUser: stringList(),
                PowerActors: stringList(),
            }),
            intimacyAdvanceExplicit: boolean(),
            restraintControl,
            boundaryPressure,
        boundaryBreak,
            harmMode: enumString(HARM_MODES, 'Downstream damage/death gate only. lethal for weapon/improvised/natural weapon, dangerous tool, projectile, destructive magic, poison, fire/electricity, or any method that could reasonably kill/maim if it lands decisively. nonlethal for ordinary unarmed attacks, brawling, sparring/training, pulled blows, pommel/flat strikes, practice weapons, or clearly controlled force; it can deal HP damage but HP 0 means incapacitated, not dead. restraint_control for holding, pinning, grabbing, dragging, blocking, binding, immobilizing, carrying, forced positioning, or preventing movement without a separate injuring attack; no HP damage and bruised at most. none for no bodily attack/harm/control. If mixed, choose lethal > nonlethal > restraint_control > none. This must not decide rollNeeded, challengeType, boundary pressure, hostility, or relationship harm.'),
            rollNeeded: boolean('The sole semantic roll gate. Y for fresh unresolved DEF.STAKES items. N only for DEF.NO_STAKES exclusions when no positive stake is present or when that exact positive stake is already resolved/suppressed. Positive stakes win over ordinary continuity.'),
            rollReason: string('Concise explanation that agrees with rollNeeded. If rollNeeded=true, describe the fresh unresolved stakes. If rollNeeded=false, describe why no fresh unresolved stakes exist.'),
            challengeType: enumString(CHALLENGE_TYPES, 'none, social, mundane_combat, supernatural_combat, restraint, stealth, or environment. Use none when rollNeeded=false unless deterministic restraint policy overrides later.'),
            challengeTypeEvidence: string('Brief evidence phrase for the selected challengeType, or (none).'),
            socialTactic: enumString(SOCIAL_TACTICS, 'diplomacy, bluff, or intimidate only when challengeType=social; otherwise none.'),
            actionUnits: array(actionUnit, 3, undefined, 'Only semantic source for mechanically counted actions. Non-combat returns exactly one A1 unit. Combat returns one unit per explicit discrete attack/effect, capped at three.'),
            environmentDifficultyTier: enumString(ENVIRONMENT_DIFFICULTY_TIERS, 'Semantic environmental opposition tier only when challengeType=environment and OppTargets.ENV has a non-living obstacle or condition that makes the goal fail-able. Use easy/trivial, average, hard, or extreme; set none otherwise.'),
            activeHostileThreat: boolean(),
            genStats: generatedStatsSeed,
        }),
        relationshipEngine: array(relationship, 20),
        injuryEffectEngine: object({ effects: array(injuryEffect, 20) }),
        userKnowledgeApplication: object({ applications: array(userKnowledgeApplication, 20) }),
        powerActorEnmity: object({
            assessments: array(powerActorAssessment, 20),
            effects: array(powerActorEffect, 12),
            latentGrievances: array(latentGrievance, 12),
            affiliationLinks: array(powerActorAffiliationLink, 12),
            latentFavors: array(latentFavor, 12),
            favorAffiliationLinks: array(powerActorFavorAffiliationLink, 12),
        }),
        powerEventShape: object({ events: array(powerEvent, 4) }),
        trackerUpdateEngine: object({
            user: trackerUserDelta,
            npcs: array(trackerNpcDelta, 20),
            boundCompanion: boundCompanionDelta,
        }),
        chaosSemantic: object({ sceneSummary: string() }),
    });
}

export function extractSemanticToolLedger(raw, diagnosticContext = {}, turnBinding = null) {
    const calls = collectToolCalls(raw);
    const responseDiagnosticContext = {
        requestId: semanticResponseRequestId(raw),
        ...diagnosticContext,
    };
    const matchingCalls = calls.filter(call => getToolCallName(call) === SEMANTIC_TOOL_NAME);
    if (!matchingCalls.length) {
        throw annotateSemanticDiagnosticError(
            new Error(`semantic tool-call response did not contain ${SEMANTIC_TOOL_NAME}. RawPreview=${previewRaw(raw)}`),
            {
                code: 'SE-TOOL-MISSING',
                stage: 'Tool-call extraction',
                expectedTool: SEMANTIC_TOOL_NAME,
                returnedTools: calls.map(getToolCallName).filter(Boolean),
                responseShape: describeSemanticResponseShape(raw),
                ...responseDiagnosticContext,
            },
        );
    }
    if (matchingCalls.length !== 1) {
        throw annotateSemanticDiagnosticError(
            new Error(`semantic tool-call response contained ${matchingCalls.length} calls to ${SEMANTIC_TOOL_NAME}; exactly one is required. RawPreview=${previewRaw(raw)}`),
            {
                code: 'SE-TOOL-DUPLICATE',
                stage: 'Tool-call extraction',
                expectedTool: SEMANTIC_TOOL_NAME,
                returnedTools: calls.map(getToolCallName).filter(Boolean),
                matchingToolCallCount: matchingCalls.length,
                responseShape: describeSemanticResponseShape(raw),
                ...responseDiagnosticContext,
            },
        );
    }

    const args = getToolCallArguments(matchingCalls[0]);
    let ledger;
    try {
        ledger = parseToolArguments(args);
    } catch (error) {
        throw annotateSemanticDiagnosticError(error, responseDiagnosticContext);
    }
    if (!ledger || typeof ledger !== 'object' || Array.isArray(ledger)) {
        throw annotateSemanticDiagnosticError(
            new Error(`semantic tool-call arguments were not an object. RawPreview=${previewRaw(raw)}`),
            {
                code: 'SE-TOOL-ARGUMENTS',
                stage: 'Tool-call argument extraction',
                expectedTool: SEMANTIC_TOOL_NAME,
                responseShape: describeSemanticResponseShape(raw),
                ...responseDiagnosticContext,
            },
        );
    }
    const normalizedLedger = normalizeSemanticToolArgumentTypes(ledger);
    try {
        validateSemanticToolArguments(normalizedLedger);
    } catch (error) {
        throw annotateSemanticDiagnosticError(error, responseDiagnosticContext);
    }
    return normalizedLedger;
}

export function extractSemanticTextLedger(raw, diagnosticContext = {}, turnBinding = null) {
    const responseDiagnosticContext = {
        requestId: semanticResponseRequestId(raw),
        ...diagnosticContext,
    };
    const candidates = collectSemanticTextLedgerCandidates(raw);
    if (candidates.length !== 1) {
        throw annotateSemanticDiagnosticError(
            new Error(`Semantic validated text-ledger response must contain exactly one non-reasoning text candidate; received ${candidates.length}. RawPreview=${previewRaw(raw)}`),
            {
                code: 'SE-TEXT-EXTRACTION',
                stage: 'Validated text-ledger extraction',
                responseShape: describeSemanticResponseShape(raw),
                excerpt: previewRaw(raw),
                ...responseDiagnosticContext,
            },
        );
    }

    let ledger;
    try {
        ledger = parseSemanticTextLedgerFrame(candidates[0]);
        if (!isRecord(ledger)) throw new Error('framed semantic JSON must be one object');
        const normalizedLedger = normalizeSemanticToolArgumentTypes(ledger);
        validateSemanticToolArguments(normalizedLedger);
        return normalizedLedger;
    } catch (error) {
        throw annotateSemanticDiagnosticError(error, {
            code: 'SE-TEXT-EXTRACTION',
            stage: 'Validated text-ledger extraction',
            responseShape: describeSemanticResponseShape(raw),
            excerpt: previewRaw(raw),
            ...responseDiagnosticContext,
        });
    }
}

function collectSemanticTextLedgerCandidates(raw) {
    const candidates = [];
    const seenObjects = new Set();
    const seenStrings = new Set();
    const addString = value => {
        const text = String(value || '').trim();
        if (text && !seenStrings.has(text)) {
            seenStrings.add(text);
            candidates.push(text);
        }
    };
    const addContentCandidate = value => {
        if (Array.isArray(value)) {
            // Content arrays are one provider response split into visible parts.
            addString(semanticResponsePartsText(value));
            return;
        }
        visit(value);
    };
    const visit = value => {
        if (value == null) return;
        if (typeof value === 'string') {
            addString(value);
            return;
        }
        if (Array.isArray(value)) {
            value.forEach(visit);
            return;
        }
        if (typeof value !== 'object' || seenObjects.has(value) || isSemanticThoughtPart(value)) return;
        seenObjects.add(value);

        if (typeof value.text === 'string') addString(value.text);
        if (typeof value.output_text === 'string') addString(value.output_text);
        if (value.message && typeof value.message === 'object') {
            addContentCandidate(value.message.content);
        }
        if (Array.isArray(value.content)) {
            addContentCandidate(value.content);
        } else if (value.content !== undefined) {
            addContentCandidate(value.content);
        }
        if (Array.isArray(value.parts)) {
            addContentCandidate(value.parts);
        } else if (value.parts !== undefined) {
            addContentCandidate(value.parts);
        }
        if (value.choices !== undefined) visit(value.choices);
        if (value.candidates !== undefined) visit(value.candidates);
        if (value.responseContent !== undefined) visit(value.responseContent);
        if (value.output !== undefined) visit(value.output);
        if (value.response !== undefined && value.response !== raw) visit(value.response);
        if (value.data !== undefined && value.data !== raw) visit(value.data);
    };

    visit(raw);
    return candidates;
}

function parseSemanticTextLedgerFrame(value) {
    const source = String(value || '').replace(/^\uFEFF/, '').trim().replace(/\r\n?/g, '\n');
    const startMarkers = source.match(new RegExp(`^${SEMANTIC_TEXT_LEDGER_START}$`, 'gm')) || [];
    const endMarkers = source.match(new RegExp(`^${SEMANTIC_TEXT_LEDGER_END}$`, 'gm')) || [];
    if (startMarkers.length !== 1 || endMarkers.length !== 1) {
        throw new Error('semantic text ledger must contain exactly one BEGIN_SEMANTIC_PREFLIGHT line and one END_SEMANTIC_PREFLIGHT line');
    }
    if (!source.startsWith(`${SEMANTIC_TEXT_LEDGER_START}\n`) || !source.endsWith(`\n${SEMANTIC_TEXT_LEDGER_END}`)) {
        throw new Error('semantic text ledger must not contain text outside the mandatory marker frame');
    }
    if (/```/.test(source)) throw new Error('markdown fences are not allowed in a semantic text ledger');

    const jsonText = source.slice(SEMANTIC_TEXT_LEDGER_START.length, -SEMANTIC_TEXT_LEDGER_END.length).trim();
    if (!jsonText.startsWith('{') || !jsonText.endsWith('}')) {
        throw new Error('semantic text ledger frame must contain one complete JSON object');
    }
    assertNoDuplicateJsonObjectKeys(jsonText);
    return JSON.parse(jsonText);
}

function assertNoDuplicateJsonObjectKeys(text) {
    const source = String(text || '');
    let cursor = 0;
    const whitespace = () => {
        while (/\s/.test(source[cursor] || '')) cursor += 1;
    };
    const expect = token => {
        whitespace();
        if (source[cursor] !== token) throw new Error(`invalid JSON near character ${cursor}: expected ${token}`);
        cursor += 1;
    };
    const parseString = () => {
        whitespace();
        if (source[cursor] !== '"') throw new Error(`invalid JSON string near character ${cursor}`);
        const start = cursor;
        cursor += 1;
        while (cursor < source.length) {
            if (source[cursor] === '\\') {
                cursor += 2;
                continue;
            }
            if (source[cursor] === '"') {
                cursor += 1;
                return JSON.parse(source.slice(start, cursor));
            }
            cursor += 1;
        }
        throw new Error('unterminated JSON string');
    };
    const parsePrimitive = () => {
        whitespace();
        if (source.startsWith('true', cursor)) {
            cursor += 4;
            return;
        }
        if (source.startsWith('false', cursor)) {
            cursor += 5;
            return;
        }
        if (source.startsWith('null', cursor)) {
            cursor += 4;
            return;
        }
        const match = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;
        match.lastIndex = cursor;
        const number = match.exec(source);
        if (!number) throw new Error(`invalid JSON value near character ${cursor}`);
        cursor += number[0].length;
    };
    const parseArray = () => {
        expect('[');
        whitespace();
        if (source[cursor] === ']') {
            cursor += 1;
            return;
        }
        while (cursor < source.length) {
            parseValue();
            whitespace();
            if (source[cursor] === ']') {
                cursor += 1;
                return;
            }
            expect(',');
        }
        throw new Error('unterminated JSON array');
    };
    const parseObject = () => {
        expect('{');
        const keys = new Set();
        whitespace();
        if (source[cursor] === '}') {
            cursor += 1;
            return;
        }
        while (cursor < source.length) {
            const key = parseString();
            if (keys.has(key)) throw new Error(`semantic text ledger contains a duplicate JSON key: ${JSON.stringify(key)}`);
            keys.add(key);
            expect(':');
            parseValue();
            whitespace();
            if (source[cursor] === '}') {
                cursor += 1;
                return;
            }
            expect(',');
        }
        throw new Error('unterminated JSON object');
    };
    const parseValue = () => {
        whitespace();
        if (source[cursor] === '{') return parseObject();
        if (source[cursor] === '[') return parseArray();
        if (source[cursor] === '"') {
            parseString();
            return;
        }
        parsePrimitive();
    };

    parseValue();
    whitespace();
    if (cursor !== source.length) throw new Error(`unexpected JSON content near character ${cursor}`);
}

function semanticResponsePartsText(value) {
    if (!Array.isArray(value)) return '';
    return value
        .map(part => {
            if (typeof part === 'string') return part;
            if (!part || typeof part !== 'object' || isSemanticThoughtPart(part)) return '';
            if (typeof part.text === 'string') return part.text;
            if (typeof part.output_text === 'string') return part.output_text;
            return '';
        })
        .filter(Boolean)
        .join('');
}

function isSemanticThoughtPart(part) {
    return Boolean(part?.thought === true || /(?:reasoning|thinking|thought)/i.test(String(part?.type || '')));
}

export function validateSemanticToolArguments(ledger) {
    try {
        validateSchemaValue(ledger, buildSemanticPreflightSchema(), '$');
        return ledger;
    } catch (error) {
        throw annotateSemanticDiagnosticError(error, schemaDiagnosticDetails(error, ledger));
    }
}

export function normalizeSemanticToolArgumentTypes(ledger, schema = buildSemanticPreflightSchema(), path = '$') {
    if (!schema || typeof schema !== 'object') return ledger;

    if (schema.type === 'object') {
        if (!isRecord(ledger)) return ledger;
        const normalized = { ...ledger };
        for (const [name, childSchema] of Object.entries(schema.properties || {})) {
            if (Object.prototype.hasOwnProperty.call(normalized, name)) {
                normalized[name] = normalizeSemanticToolArgumentTypes(normalized[name], childSchema, `${path}.${name}`);
            }
        }
        if (path !== '$') return normalized;
        const repairedTargets = repairUnambiguousIdentifyTargets(normalized, schema);
        return repairUnambiguousRelationshipNPC(stripDeterministicSemanticTransportFields(repairedTargets), schema);
    }

    if (schema.type === 'array') {
        const arrayValue = normalizeSemanticArrayContainer(ledger, schema, path);
        if (!Array.isArray(arrayValue)) return arrayValue;
        return arrayValue.map((item, index) => normalizeSemanticToolArgumentTypes(
            normalizeSemanticArrayItem(item, schema, path),
            schema.items,
            `${path}[${index}]`,
        ));
    }

    if (schema.type === 'boolean') return normalizeSemanticBooleanToken(ledger);
    if (schema.type === 'integer') return normalizeSemanticIntegerToken(ledger);
    if (path === '$.worldTransition.indoors') ledger = normalizeSemanticIndoorsValue(ledger);
    if (schema.type === 'string' && Array.isArray(schema.enum)) {
        if (/^\$\.injuryEffectEngine\.effects\[\d+\]\.effectType$/u.test(path)) {
            ledger = normalizeSemanticInjuryEffectType(ledger);
        }
        return normalizeSemanticEnumValue(ledger, schema.enum);
    }
    return ledger;
}

function stripDeterministicSemanticTransportFields(ledger) {
    if (!isRecord(ledger)) return ledger;

    // These values are transport metadata, fixed engine policy, or authoritative
    // snapshots. Accept them from legacy responses, but never require the model
    // to produce them in the active semantic contract.
    delete ledger.turnBinding;
    if (isRecord(ledger.engineContext)) {
        delete ledger.engineContext.trackerRelevantNPCs;
    }
    if (isRecord(ledger.resolutionEngine)) {
        if (Array.isArray(ledger.resolutionEngine.actionUnits)) {
            ledger.resolutionEngine.actionUnits.forEach(unit => {
                if (isRecord(unit)) delete unit.id;
            });
        }
        const ability = ledger.resolutionEngine.userAbilityUse;
        if (isRecord(ability)) {
            delete ability.used;
            delete ability.mechanicalScope;
        }
        const boundaryBreak = ledger.resolutionEngine.boundaryBreak;
        if (isRecord(boundaryBreak)) {
            delete boundaryBreak.boundaryId;
            delete boundaryBreak.targetNPC;
            delete boundaryBreak.type;
        }
    }
    if (isRecord(ledger.trackerUpdateEngine?.user)) {
        delete ledger.trackerUpdateEngine.user.currencyAdd;
        delete ledger.trackerUpdateEngine.user.currencyRemove;
    }
    if (isRecord(ledger.trackerUpdateEngine)) {
        delete ledger.trackerUpdateEngine.pendingBoundary;
    }
    return ledger;
}

function repairUnambiguousRelationshipNPC(ledger, schema) {
    const relationshipEngine = ledger?.relationshipEngine;
    const resolutionEngine = ledger?.resolutionEngine;
    const relationshipSchema = schema?.properties?.relationshipEngine?.items;
    if (!Array.isArray(relationshipEngine)
        || !relationshipEngine.length
        || !relationshipSchema
        || !resolutionEngine) return ledger;

    const missingRows = relationshipEngine
        .map((item, index) => ({ item, index }))
        .filter(({ item }) => isRecord(item)
            && (!Object.prototype.hasOwnProperty.call(item, 'NPC')
                || (typeof item.NPC === 'string' && !item.NPC.trim())));
    if (missingRows.length !== 1) return ledger;

    const requiredNames = requiredRelationshipCoverageNames(resolutionEngine);
    const assignedKeys = new Set(
        relationshipEngine
            .map(item => (typeof item?.NPC === 'string' ? item.NPC.trim() : ''))
            .filter(Boolean)
            .map(normalizeNameKey),
    );
    const candidates = requiredNames.filter(name => !assignedKeys.has(normalizeNameKey(name)));
    if (candidates.length !== 1) return ledger;

    const rowSchema = {
        ...relationshipSchema,
        required: (relationshipSchema.required || []).filter(name => name !== 'NPC'),
    };
    try {
        validateSchemaValue(missingRows[0].item, rowSchema, `$.relationshipEngine[${missingRows[0].index}]`);
    } catch {
        return ledger;
    }

    const repairedRows = relationshipEngine.map((item, index) => index === missingRows[0].index
        ? { ...item, NPC: candidates[0] }
        : item);
    return { ...ledger, relationshipEngine: repairedRows };
}

function repairUnambiguousIdentifyTargets(ledger, schema) {
    const resolutionEngine = ledger?.resolutionEngine;
    if (!isRecord(resolutionEngine)) return ledger;
    if (isRecord(resolutionEngine.identifyTargets)) return ledger;
    if (resolutionEngine.identifyTargets !== undefined && resolutionEngine.identifyTargets !== null) return ledger;

    const resolutionSchema = schema?.properties?.resolutionEngine;
    const sourceSchemas = {
        restraintControl: resolutionSchema?.properties?.restraintControl,
        boundaryPressure: resolutionSchema?.properties?.boundaryPressure,
        boundaryBreak: resolutionSchema?.properties?.boundaryBreak,
        claimCheck: resolutionSchema?.properties?.claimCheck,
        injuryEffect: schema?.properties?.injuryEffectEngine?.properties?.effects?.items,
    };
    const validSource = (value, sourceSchema, path) => {
        if (!sourceSchema) return false;
        try {
            validateSchemaValue(value, sourceSchema, path);
            return true;
        } catch {
            return false;
        }
    };

    const candidates = new Map();
    const addCandidate = (value, role) => {
        const name = cleanScalar(value).replace(/\s+/g, ' ').trim();
        if (!name || isNoneValue(name)) return;
        const key = normalizeNameKey(name);
        if (!key) return;
        const candidate = candidates.get(key) || { name, roles: new Set() };
        candidate.roles.add(role);
        candidates.set(key, candidate);
    };

    if (resolutionEngine.restraintControl?.present === true
        && validSource(resolutionEngine.restraintControl, sourceSchemas.restraintControl, '$.resolutionEngine.restraintControl')) {
        addCandidate(resolutionEngine.restraintControl.targetNPC, 'ActionTargets');
    }
    if (resolutionEngine.boundaryPressure?.present === true
        && validSource(resolutionEngine.boundaryPressure, sourceSchemas.boundaryPressure, '$.resolutionEngine.boundaryPressure')) {
        addCandidate(resolutionEngine.boundaryPressure.targetNPC, 'ActionTargets');
    }
    if (resolutionEngine.boundaryBreak?.present === true
        && validSource(resolutionEngine.boundaryBreak, sourceSchemas.boundaryBreak, '$.resolutionEngine.boundaryBreak')) {
        addCandidate(resolutionEngine.boundaryBreak.targetNPC, 'ActionTargets');
    }
    if (resolutionEngine.claimCheck?.present === true
        && validSource(resolutionEngine.claimCheck, sourceSchemas.claimCheck, '$.resolutionEngine.claimCheck')) {
        addCandidate(resolutionEngine.claimCheck.targetNPC, 'ActionTargets');
    }

    for (const effect of (Array.isArray(ledger?.injuryEffectEngine?.effects) ? ledger.injuryEffectEngine.effects : [])) {
        if (!validSource(effect, sourceSchemas.injuryEffect, '$.injuryEffectEngine.effects[]')
            || cleanScalar(effect.effectType).toLowerCase() === 'none') continue;
        const role = cleanScalar(effect.targetRole).toLowerCase().replace(/[\s-]+/g, '');
        if (role === 'opptarget') {
            addCandidate(effect.target, 'ActionTargets');
            addCandidate(effect.target, 'OppTargets.NPC');
        } else if (role === 'actiontarget') {
            addCandidate(effect.target, 'ActionTargets');
        } else if (role === 'harmedobserver') {
            addCandidate(effect.target, 'HarmedObservers');
        }
    }

    if (candidates.size !== 1) return ledger;
    const [, candidate] = candidates.entries().next().value;
    if (candidate.roles.has('HarmedObservers')
        && (candidate.roles.has('ActionTargets') || candidate.roles.has('OppTargets.NPC'))) return ledger;

    const identifyTargets = {
        hostilesInScene: { NPC: [] },
        ActionTargets: [],
        StealthTargets: [],
        OppTargets: { NPC: [], ENV: [] },
        BenefitedObservers: [],
        HarmedObservers: [],
        NPCAwareOfUser: [],
        PowerActors: [],
    };
    for (const role of candidate.roles) {
        if (role === 'ActionTargets') identifyTargets.ActionTargets.push(candidate.name);
        if (role === 'OppTargets.NPC') identifyTargets.OppTargets.NPC.push(candidate.name);
        if (role === 'HarmedObservers') identifyTargets.HarmedObservers.push(candidate.name);
    }
    return {
        ...ledger,
        resolutionEngine: {
            ...resolutionEngine,
            identifyTargets,
        },
    };
}

function normalizeSemanticArrayContainer(value, schema, path) {
    if (Array.isArray(value)) return value;

    // These repairs preserve one represented item; they never invent additional entries.
    if (path === '$.engineContext.trackerRelevantNPCs' && typeof value === 'string' && value.trim()) {
        return [{ NPC: value }];
    }
    if (schema.items?.type === 'object' && isRecord(value)) return [value];
    if (schema.items?.type === 'string' && typeof value === 'string' && value.trim()) return [value];
    return value;
}

function normalizeSemanticArrayItem(value, schema, path) {
    if (path === '$.engineContext.trackerRelevantNPCs'
        && schema.items?.type === 'object'
        && typeof value === 'string'
        && value.trim()) {
        return { NPC: value };
    }
    return value;
}

function normalizeSemanticBooleanToken(value) {
    if (typeof value !== 'string') return value;
    const token = value.trim().toLowerCase();
    if (['true', 'yes', 'y'].includes(token)) return true;
    if (['false', 'no', 'n'].includes(token)) return false;
    return value;
}

function normalizeSemanticIntegerToken(value) {
    if (typeof value !== 'string') return value;
    const token = value.trim();
    if (!/^-?(?:0|[1-9]\d*)$/u.test(token)) return value;
    const integer = Number(token);
    return Number.isSafeInteger(integer) ? integer : value;
}

function normalizeSemanticIndoorsValue(value) {
    if (value === true) return 'indoors';
    if (value === false) return 'outdoors';
    if (typeof value !== 'string') return value;

    const token = value.trim().toLowerCase();
    if (['true', 'yes', 'y', 'indoors'].includes(token)) return 'indoors';
    if (['false', 'no', 'n', 'outdoors'].includes(token)) return 'outdoors';
    return value;
}

function normalizeSemanticEnumValue(value, allowedValues) {
    if (typeof value !== 'string' || !Array.isArray(allowedValues)) return value;
    if (allowedValues.includes(value)) return value;

    const token = semanticEnumShapeToken(value);
    if (!token) return value;
    const structuralMatches = allowedValues.filter(candidate => semanticEnumShapeToken(candidate) === token);
    if (structuralMatches.length === 1) return structuralMatches[0];
    if (structuralMatches.length > 1) return value;

    const tokenForms = semanticEnumInflectionForms(token);
    const inflectionMatches = allowedValues.filter(candidate => {
        const candidateForms = semanticEnumInflectionForms(semanticEnumShapeToken(candidate));
        return [...tokenForms].some(form => candidateForms.has(form));
    });
    return inflectionMatches.length === 1 ? inflectionMatches[0] : value;
}

function normalizeSemanticInjuryEffectType(value) {
    if (typeof value !== 'string') return value;
    return INJURY_EFFECT_TYPE_ALIASES[semanticEnumShapeToken(value)] || value;
}

function semanticEnumShapeToken(value) {
    return String(value || '').trim().toLowerCase().replace(/[\s_-]+/g, '');
}

function semanticEnumInflectionForms(token) {
    const forms = new Set([token]);
    if (/ies$/.test(token) && token.length > 3) {
        forms.add(`${token.slice(0, -3)}y`);
    } else if (/(?:ches|shes|xes|zes)$/.test(token) && token.length > 4) {
        forms.add(token.slice(0, -2));
    } else if (/s$/.test(token) && !/(?:ss|us|is|ws)$/.test(token) && token.length > 2) {
        forms.add(token.slice(0, -1));
    }
    return forms;
}

function validateSchemaValue(value, schema, path) {
    if (!schema || typeof schema !== 'object') return;

    if (schema.type === 'object') {
        if (!isRecord(value)) throw new Error(`${path} must be an object`);
        const properties = schema.properties || {};
        for (const name of schema.required || []) {
            if (!Object.prototype.hasOwnProperty.call(value, name)) {
                throw new Error(`${path}.${name} is required`);
            }
        }
        if (schema.additionalProperties === false) {
            const unknown = Object.keys(value).filter(name => !Object.prototype.hasOwnProperty.call(properties, name));
            if (unknown.length) throw new Error(`${path} contains unknown properties: ${unknown.join(', ')}`);
        }
        for (const [name, childSchema] of Object.entries(properties)) {
            if (Object.prototype.hasOwnProperty.call(value, name)) {
                validateSchemaValue(value[name], childSchema, `${path}.${name}`);
            }
        }
        return;
    }

    if (schema.type === 'array') {
        if (!Array.isArray(value)) throw new Error(`${path} must be an array`);
        if (Number.isInteger(schema.minItems) && value.length < schema.minItems) {
            throw new Error(`${path} must contain at least ${schema.minItems} item(s)`);
        }
        if (Number.isInteger(schema.maxItems) && value.length > schema.maxItems) {
            throw new Error(`${path} must contain at most ${schema.maxItems} item(s)`);
        }
        value.forEach((item, index) => validateSchemaValue(item, schema.items, `${path}[${index}]`));
        return;
    }

    if (schema.type === 'string' && typeof value !== 'string') {
        throw new Error(`${path} must be a string`);
    }
    if (schema.type === 'boolean' && typeof value !== 'boolean') {
        throw new Error(`${path} must be a boolean`);
    }
    if (schema.type === 'integer' && !Number.isInteger(value)) {
        throw new Error(`${path} must be an integer`);
    }
    if (Array.isArray(schema.enum) && !schema.enum.includes(value)) {
        throw new Error(`${path} must be one of: ${schema.enum.join(', ')}; received ${JSON.stringify(value)}`);
    }
    if (typeof value === 'number' && Number.isFinite(schema.minimum) && value < schema.minimum) {
        throw new Error(`${path} must be at least ${schema.minimum}`);
    }
    if (typeof value === 'number' && Number.isFinite(schema.maximum) && value > schema.maximum) {
        throw new Error(`${path} must be at most ${schema.maximum}`);
    }
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
        throw annotateSemanticDiagnosticError(
            new Error('semantic tool-call arguments were missing'),
            { code: 'SE-TOOL-ARGUMENTS', stage: 'Tool-call argument extraction', expectedTool: SEMANTIC_TOOL_NAME },
        );
    }
    const text = args.trim();
    if (!text) {
        throw annotateSemanticDiagnosticError(
            new Error('semantic tool-call arguments were empty'),
            { code: 'SE-TOOL-ARGUMENTS', stage: 'Tool-call argument extraction', expectedTool: SEMANTIC_TOOL_NAME },
        );
    }
    return parseSemanticToolArgumentJson(text);
}

function extractJsonObject(text) {
    const source = String(text ?? '');
    const start = source.indexOf('{');
    const end = source.lastIndexOf('}');
    if (start < 0 || end < start) {
        throw new Error(`Semantic pass did not return JSON: ${source.slice(0, 200)}`);
    }
    return source.slice(start, end + 1);
}

export function parseSemanticToolArgumentJson(text) {
    const sourceText = String(text || '');
    let jsonText;
    try {
        jsonText = extractJsonObject(sourceText);
    } catch (error) {
        throw annotateSemanticDiagnosticError(error, {
            code: 'SE-JSON-PARSE',
            stage: 'JSON extraction',
            excerpt: buildSemanticJsonDiagnosticExcerpt(sourceText, 0),
            repairAttempted: false,
            repairResult: 'No complete JSON object was available to repair',
        });
    }
    try {
        return JSON.parse(jsonText);
    } catch (error) {
        const location = locateJsonParseFailure(error, jsonText);
        const repaired = repairToolArgumentJson(jsonText);
        let repairError = null;
        if (repaired && repaired !== jsonText) {
            try {
                const parsed = JSON.parse(repaired);
                if (looksLikeSemanticToolArgumentPayload(parsed)) {
                    const schema = buildSemanticPreflightSchema();
                    validateSchemaValue(normalizeSemanticToolArgumentTypes(parsed, schema), schema, '$');
                }
                console.warn('[Structured Preflight Engines] repaired malformed semantic JSON locally before validation.');
                return parsed;
            } catch (candidateError) {
                repairError = candidateError;
                // Throw the original parse error below; it points to the provider payload.
            }
        }
        const schemaRepair = repairSemanticToolArgumentStructure(jsonText);
        if (schemaRepair.value) {
            console.warn(`[Structured Preflight Engines] repaired malformed semantic JSON with schema-aware structural recovery: ${schemaRepair.repairs.join('; ')}`);
            return schemaRepair.value;
        }
        throw annotateSemanticDiagnosticError(error, {
            code: 'SE-JSON-PARSE',
            stage: 'JSON parsing',
            line: location.line,
            column: location.column,
            excerpt: buildSemanticJsonDiagnosticExcerpt(jsonText, location.index),
            repairAttempted: repaired !== jsonText || schemaRepair.attempted,
            repairResult: schemaRepair.attempted
                ? `Schema-aware repair rejected${schemaRepair.reason ? ` (${schemaRepair.reason})` : ''}${repairError?.message ? `; syntax repair remained invalid (${String(repairError.message).slice(0, 180)})` : ''}`
                : repaired !== jsonText
                    ? `Still invalid${repairError?.message ? ` (${String(repairError.message).slice(0, 180)})` : ''}`
                    : 'No unambiguous local repair matched',
        });
    }
}

function looksLikeSemanticToolArgumentPayload(value) {
    return isRecord(value)
        && (Object.prototype.hasOwnProperty.call(value, 'engineContext')
            || Object.prototype.hasOwnProperty.call(value, 'resolutionEngine')
            || Object.prototype.hasOwnProperty.call(value, 'worldTransition'));
}

function locateJsonParseFailure(error, text) {
    const message = String(error?.message || '');
    const lineColumn = message.match(/line\s+(\d+)\s+column\s+(\d+)/i);
    if (lineColumn) {
        const line = Math.max(1, Number(lineColumn[1]) || 1);
        const column = Math.max(1, Number(lineColumn[2]) || 1);
        return {
            line,
            column,
            index: jsonLineColumnToIndex(text, line, column),
        };
    }
    const position = message.match(/position\s+(\d+)/i);
    if (position) {
        const index = Math.max(0, Number(position[1]) || 0);
        const prefix = String(text || '').slice(0, index);
        const rows = prefix.split('\n');
        return {
            line: rows.length,
            column: (rows[rows.length - 1]?.length || 0) + 1,
            index,
        };
    }
    return { line: undefined, column: undefined, index: 0 };
}

function jsonLineColumnToIndex(text, line, column) {
    const rows = String(text || '').split('\n');
    let index = 0;
    for (let row = 1; row < line && row <= rows.length; row += 1) {
        index += rows[row - 1].length + 1;
    }
    return Math.max(0, Math.min(String(text || '').length, index + column - 1));
}

function buildSemanticJsonDiagnosticExcerpt(text, errorIndex) {
    const source = String(text || '');
    if (!source) return '(empty)';
    const index = Math.max(0, Math.min(source.length, Number(errorIndex) || 0));
    const start = Math.max(0, index - SEMANTIC_DIAGNOSTIC_EXCERPT_RADIUS);
    const end = Math.min(source.length, index + SEMANTIC_DIAGNOSTIC_EXCERPT_RADIUS);
    const before = escapeDiagnosticExcerpt(source.slice(start, index));
    const after = escapeDiagnosticExcerpt(source.slice(index, end));
    return `${start > 0 ? '...' : ''}${before}<<<ERROR>>>${after}${end < source.length ? '...' : ''}`;
}

function escapeDiagnosticExcerpt(value) {
    return String(value || '')
        .replace(/\r/g, '\\r')
        .replace(/\n/g, '\\n')
        .replace(/\t/g, '\\t');
}

function schemaDiagnosticDetails(error, ledger) {
    const message = String(error?.message || '');
    const pathMatch = message.match(/^(\$(?:\.[^\s.\[\]]+|\[\d+\])*)/);
    const field = pathMatch?.[1];
    const enumMatch = message.match(/must be one of:\s*([^;]+)(?:;\s*received|$)/i);
    const typeMatch = message.match(/must be (?:an? |a )?(boolean|string|integer|array|object)/i);
    const unknownMatch = message.match(/contains unknown properties:\s*(.+)$/i);
    let received;
    if (/\bis required\b/i.test(message)) {
        received = 'missing';
    } else if (unknownMatch) {
        received = unknownMatch[1].trim();
    } else if (field) {
        received = diagnosticValuePreview(readSemanticDiagnosticPath(ledger, field));
    }
    return {
        code: 'SE-SCHEMA-VALIDATION',
        stage: 'Schema validation',
        field,
        received,
        allowed: enumMatch
            ? enumMatch[1].split(',').map(value => value.trim()).filter(Boolean)
            : (typeMatch ? [typeMatch[1].toLowerCase()] : undefined),
    };
}

function readSemanticDiagnosticPath(root, path) {
    if (!path || path === '$') return root;
    let value = root;
    const pattern = /\.([^.[\]]+)|\[(\d+)\]/g;
    let match;
    while ((match = pattern.exec(path))) {
        const key = match[1] ?? Number(match[2]);
        if (value == null || !Object.prototype.hasOwnProperty.call(Object(value), key)) return undefined;
        value = value[key];
    }
    return value;
}

function describeSemanticResponseShape(raw) {
    if (raw == null) return String(raw);
    if (Array.isArray(raw)) return `array(length=${raw.length})`;
    if (typeof raw !== 'object') return typeof raw;
    const topLevelKeys = Object.keys(raw).slice(0, 12);
    const choice = Array.isArray(raw.choices) ? raw.choices[0] : undefined;
    const messageKeys = choice?.message && typeof choice.message === 'object'
        ? Object.keys(choice.message).slice(0, 12)
        : [];
    const parts = [`object(keys=${topLevelKeys.join(',') || '(none)'})`];
    if (Array.isArray(raw.choices)) parts.push(`choices=${raw.choices.length}`);
    if (messageKeys.length) parts.push(`choice[0].message keys=${messageKeys.join(',')}`);
    return parts.join('; ');
}

function semanticResponseRequestId(raw) {
    const value = raw?.request_id
        ?? raw?.requestId
        ?? raw?.id
        ?? raw?.error?.request_id
        ?? raw?.error?.requestId;
    return value == null ? undefined : String(value).slice(0, 180);
}

function semanticResponseStatus(raw) {
    const value = raw?.status ?? raw?.statusCode ?? raw?.error?.status ?? raw?.error?.statusCode;
    if (Number.isInteger(Number(value)) && Number(value) >= 100 && Number(value) <= 599) return Number(value);
    return undefined;
}

function semanticErrorDetail(error, keys) {
    let current = error;
    const seen = new Set();
    while (current && typeof current === 'object' && !seen.has(current)) {
        seen.add(current);
        for (const key of keys) {
            if (current[key] !== undefined && current[key] !== null && current[key] !== '') return current[key];
        }
        current = current.cause;
    }
    return undefined;
}

function repairToolArgumentJson(text) {
    let repaired = normalizeRepairableToolArgumentJsonSyntax(text);
    repaired = balanceJsonDelimiters(repaired);
    repaired = repairPrematureSemanticRootClosure(repaired);
    return repaired;
}

function normalizeRepairableToolArgumentJsonSyntax(text) {
    let repaired = String(text || '');
    repaired = repaired
        .replace(/,\s*([}\]])/g, '$1')
        .replace(/\bNaN\b/g, 'null')
        .replace(/\bInfinity\b/g, 'null')
        .replace(/\b-Infinity\b/g, 'null')
        .replace(/([{,]\s*)([A-Za-z_$][\w$-]*)(\s*:)/g, '$1"$2"$3')
        .replace(/:\s*'([^'\\]*(?:\\.[^'\\]*)*)'/g, (_match, value) => `: "${value.replace(/"/g, '\\"')}"`);
    repaired = insertMissingCommasBetweenProperties(repaired);
    repaired = insertMissingCommasBetweenArrayElements(repaired);
    return repaired;
}

function repairSemanticToolArgumentStructure(text) {
    const attempted = true;
    try {
        const source = normalizeRepairableToolArgumentJsonSyntax(text);
        const tokens = tokenizeRepairableJson(source);
        const state = { tokens, index: 0, repairs: [] };
        const schema = buildSemanticPreflightSchema();
        const value = parseSchemaGuidedJsonValue(state, schema, '$', []);
        if (state.index !== tokens.length) {
            throw new Error(`unconsumed token at ${tokens[state.index]?.start ?? source.length}`);
        }
        if (!state.repairs.length) throw new Error('no unique schema boundary was recoverable');
        const normalized = normalizeSemanticToolArgumentTypes(value, schema);
        validateSchemaValue(normalized, schema, '$');
        return { attempted, value, repairs: state.repairs };
    } catch (error) {
        return {
            attempted,
            value: null,
            repairs: [],
            reason: String(error?.message || error).replace(/\s+/g, ' ').slice(0, 220),
        };
    }
}

function tokenizeRepairableJson(text) {
    const source = String(text || '');
    const tokens = [];
    let index = 0;
    while (index < source.length) {
        if (/\s/.test(source[index])) {
            index += 1;
            continue;
        }
        const start = index;
        const char = source[index];
        if ('{}[]:,'.includes(char)) {
            tokens.push({ type: char, value: char, start, end: ++index });
            continue;
        }
        if (char === '"') {
            index += 1;
            let escaped = false;
            while (index < source.length) {
                const current = source[index];
                if (escaped) {
                    escaped = false;
                } else if (current === '\\') {
                    escaped = true;
                } else if (current === '"') {
                    index += 1;
                    break;
                }
                index += 1;
            }
            if (source[index - 1] !== '"') throw new Error(`unterminated string at ${start}`);
            const raw = source.slice(start, index);
            tokens.push({ type: 'string', value: JSON.parse(raw), start, end: index });
            continue;
        }
        const remainder = source.slice(index);
        const primitive = remainder.match(/^(?:true|false|null)(?![A-Za-z0-9_$-])/);
        if (primitive) {
            const raw = primitive[0];
            tokens.push({ type: 'primitive', value: JSON.parse(raw), start, end: index + raw.length });
            index += raw.length;
            continue;
        }
        const number = remainder.match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
        if (number) {
            const raw = number[0];
            tokens.push({ type: 'primitive', value: JSON.parse(raw), start, end: index + raw.length });
            index += raw.length;
            continue;
        }
        throw new Error(`unsupported token at ${start}`);
    }
    return tokens;
}

function parseSchemaGuidedJsonValue(state, schema, path, ancestors) {
    const token = state.tokens[state.index];
    if (!token) throw new Error(`missing value at ${path}`);
    if (schema?.type === 'object') return parseSchemaGuidedJsonObject(state, schema, path, ancestors);
    if (schema?.type === 'array') return parseSchemaGuidedJsonArray(state, schema, path, ancestors);
    if (token.type !== 'string' && token.type !== 'primitive') {
        throw new Error(`invalid scalar token at ${path}`);
    }
    state.index += 1;
    return token.value;
}

function parseSchemaGuidedJsonObject(state, schema, path, ancestors) {
    if (state.tokens[state.index]?.type !== '{') throw new Error(`missing object opening at ${path}`);
    state.index += 1;
    const value = {};
    const frame = { schema, path, seen: new Set() };
    const openObjects = [...ancestors, frame];

    while (state.index < state.tokens.length) {
        const token = state.tokens[state.index];
        if (token.type === '}') {
            state.index += 1;
            return value;
        }
        if (token.type === ']') {
            closeSchemaObjectIfComplete(frame, state, 'before parent array closure');
            return value;
        }
        if (!isJsonPropertyToken(state)) throw new Error(`expected property at ${path}`);
        const name = token.value;
        const childSchema = schema.properties?.[name];
        if (!childSchema) {
            const boundary = uniqueAncestorPropertyBoundary(name, ancestors);
            if (!boundary) throw new Error(`unknown or ambiguous property ${name} at ${path}`);
            closeSchemaObjectIfComplete(frame, state, `before ${boundary.path}.${name}`);
            return value;
        }
        if (frame.seen.has(name)) throw new Error(`duplicate property ${name} at ${path}`);
        frame.seen.add(name);
        state.index += 2;
        value[name] = parseSchemaGuidedJsonValue(state, childSchema, `${path}.${name}`, openObjects);

        const separator = state.tokens[state.index];
        if (!separator) {
            closeSchemaObjectIfComplete(frame, state, 'at end of input');
            return value;
        }
        if (separator.type === ',') {
            state.index += 1;
            continue;
        }
        if (separator.type === '}') continue;
        if (separator.type === ']' || isJsonPropertyToken(state)) {
            if (isJsonPropertyToken(state) && schema.properties?.[separator.value] && !frame.seen.has(separator.value)) {
                state.repairs.push(`inserted comma before ${path}.${separator.value}`);
                continue;
            }
            closeSchemaObjectIfComplete(frame, state, 'before enclosing schema boundary');
            return value;
        }
        throw new Error(`invalid property separator at ${path}.${name}`);
    }

    closeSchemaObjectIfComplete(frame, state, 'at end of input');
    return value;
}

function parseSchemaGuidedJsonArray(state, schema, path, ancestors) {
    if (state.tokens[state.index]?.type !== '[') throw new Error(`missing array opening at ${path}`);
    state.index += 1;
    const value = [];
    const frame = { type: 'array', schema, path };
    const itemAncestors = [...ancestors, frame];

    while (state.index < state.tokens.length) {
        const token = state.tokens[state.index];
        if (token.type === ']') {
            state.index += 1;
            return value;
        }
        if (token.type === '}' || isAncestorPropertyToken(state, ancestors)) {
            closeSchemaArrayIfComplete(schema, value, state, path, token.type === '}' ? 'before parent object closure' : `before ${token.value}`);
            return value;
        }
        value.push(parseSchemaGuidedJsonValue(state, schema.items, `${path}[${value.length}]`, itemAncestors));

        const separator = state.tokens[state.index];
        if (!separator) {
            closeSchemaArrayIfComplete(schema, value, state, path, 'at end of input');
            return value;
        }
        if (separator.type === ',') {
            state.index += 1;
            continue;
        }
        if (separator.type === ']') continue;
        if (separator.type === '}' || isAncestorPropertyToken(state, ancestors)) {
            closeSchemaArrayIfComplete(schema, value, state, path, 'before enclosing schema boundary');
            return value;
        }
        if (isJsonValueStart(separator)) {
            state.repairs.push(`inserted comma before ${path}[${value.length}]`);
            continue;
        }
        throw new Error(`invalid array separator at ${path}[${value.length - 1}]`);
    }

    closeSchemaArrayIfComplete(schema, value, state, path, 'at end of input');
    return value;
}

function isJsonPropertyToken(state) {
    return state.tokens[state.index]?.type === 'string' && state.tokens[state.index + 1]?.type === ':';
}

function isAncestorPropertyToken(state, ancestors) {
    if (!isJsonPropertyToken(state)) return false;
    return Boolean(uniqueAncestorPropertyBoundary(state.tokens[state.index].value, ancestors));
}

function uniqueAncestorPropertyBoundary(name, ancestors) {
    let lastArrayIndex = -1;
    for (let index = 0; index < ancestors.length; index += 1) {
        if (ancestors[index]?.type === 'array') lastArrayIndex = index;
    }
    const objectAncestors = lastArrayIndex >= 0 ? ancestors.slice(lastArrayIndex + 1) : ancestors;
    const matches = objectAncestors.filter(frame => frame?.type !== 'array'
        && Object.prototype.hasOwnProperty.call(frame.schema?.properties || {}, name)
        && !frame.seen.has(name));
    return matches.length === 1 ? matches[0] : null;
}

function closeSchemaObjectIfComplete(frame, state, reason) {
    const missing = (frame.schema?.required || []).filter(name => !frame.seen.has(name));
    if (missing.length) throw new Error(`cannot close ${frame.path}; missing ${missing.slice(0, 4).join(', ')}`);
    state.repairs.push(`inserted } for ${frame.path} ${reason}`);
}

function closeSchemaArrayIfComplete(schema, value, state, path, reason) {
    if (Number.isInteger(schema?.minItems) && value.length < schema.minItems) {
        throw new Error(`cannot close ${path}; requires at least ${schema.minItems} item(s)`);
    }
    state.repairs.push(`inserted ] for ${path} ${reason}`);
}

function isJsonValueStart(token) {
    return ['{', '[', 'string', 'primitive'].includes(token?.type);
}

function repairPrematureSemanticRootClosure(text) {
    const source = String(text || '');
    let depth = 0;
    let inString = false;
    let escaped = false;

    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
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
        if (char === '{') {
            depth += 1;
            continue;
        }
        if (char !== '}') continue;
        depth -= 1;
        if (depth !== 0) continue;

        const continuation = source.slice(index + 1).match(/^\s*,\s*"([^"]+)"\s*:/);
        if (continuation?.[1] !== 'engineContext') return source;

        let prefix;
        try {
            prefix = JSON.parse(source.slice(0, index + 1));
        } catch {
            return source;
        }
        if (!prefix || typeof prefix !== 'object' || Array.isArray(prefix)
            || Object.keys(prefix).length !== 1 || !Object.prototype.hasOwnProperty.call(prefix, 'turnBinding')) return source;
        const turnBinding = prefix.turnBinding;
        if (!turnBinding || typeof turnBinding !== 'object' || Array.isArray(turnBinding)
            || Object.keys(turnBinding).length !== 1 || typeof turnBinding.turnId !== 'string' || !turnBinding.turnId.trim()) return source;

        const candidate = source.slice(0, index) + source.slice(index + 1);
        let parsed;
        try {
            parsed = JSON.parse(candidate);
        } catch {
            return source;
        }
        if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return source;

        const schema = buildSemanticPreflightSchema();
        const allowed = new Set(Object.keys(schema.properties || {}));
        const required = Array.isArray(schema.required) ? schema.required : [];
        const returnedKeys = Object.keys(parsed);
        if (returnedKeys.some(key => !allowed.has(key))
            || required.some(key => !Object.prototype.hasOwnProperty.call(parsed, key))) return source;
        return candidate;
    }

    return source;
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

function insertMissingCommasBetweenArrayElements(text) {
    const source = String(text || '');
    const stack = [];
    let output = '';
    let inString = false;
    let escaped = false;

    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
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
            if (!inString && stack[stack.length - 1] === '[') {
                const next = nextNonWhitespace(source, index + 1);
                if (isStructuredArrayElementStart(next)) output += ',';
            }
            continue;
        }
        if (inString) continue;

        if (char === '{' || char === '[') {
            stack.push(char);
            continue;
        }
        if (char === '}' || char === ']') {
            const expectedOpen = char === '}' ? '{' : '[';
            if (stack[stack.length - 1] === expectedOpen) stack.pop();
            if (stack[stack.length - 1] === '[') {
                const next = nextNonWhitespace(source, index + 1);
                if (isStructuredArrayElementStart(next)) output += ',';
            }
        }
    }

    return output;
}

function nextNonWhitespace(text, startIndex) {
    for (let index = startIndex; index < text.length; index += 1) {
        if (!/\s/.test(text[index])) return text[index];
    }
    return '';
}

function isStructuredArrayElementStart(char) {
    return char === '"' || char === '{' || char === '[';
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

const SEMANTIC_FIELD_GUIDANCE = [
    `- ${ITEM_USE_REFERENT_RULE}`,
    '- WorldTransition is a strict scene-state projection from the latest user input. Change only location, indoor/outdoor state, or time that the latest input explicitly moves through, enters, leaves, waits through, sleeps through, or otherwise advances. Use unchanged/none when no transition is explicit. requiresSuccess=Y only when the transition depends on the current stakes-bearing action succeeding; otherwise N. evidence must quote the latest user input that establishes the transition, or (none) when unchanged. Never choose weather here.',
    '- WorldProgressionAdvancement is private off-screen development wording for deterministic deadlines. Read PRIVATE_WORLD_PROGRESSION_ACTIVE_PLANS. Output exactly one advancement for every active plan whose nextCheckpoint is already due or would become due if WorldTransition succeeds, and no other plans. Copy the exact plan id. Advance one stage only. Consequence and evidence must remain entirely in world/NPC terms, must not mention {{user}}, second-person pronouns, or the player persona, and must never retroactively injure {{user}}, remove possessions, or force action. Each advancement requires at least one concise physically discoverable evidence item with a narrow location, actor, news, or investigation route. Do not reveal hidden causes in evidence.',
    '- ResolutionEngine user intent is explicit-only. For identifyGoal and identifyChallenge, use only the latest user-declared action, request, target, and explicit objective; do not infer an unstated goal from NPC fear, hostility, suspicion, likely reaction, context, or what an NPC might assume. For NPC-targeted stakes and OppTargets.NPC, the latest user input must directly target that NPC with a stakes-bearing action, demand, threat, attack, coercion, restraint, deception, persuasion, negotiation, boundary pressure, stealth contest against a specific established living detector/opponent, or explicit objective. Ambiguous, preparatory, self-directed, atmospheric, or scene-state actions remain exactly that. Drawing, readying, revealing, holding, sheathing, or repositioning a weapon is scene state, not intimidation or coercion by itself; classify it as stakes only when the user also declares a demand, threat, attack, aim/pointing at a target, blocking, pursuit, forced movement, aggressive advance, stealth contest against a specific established living detector/opponent, speed contest, dangerous movement, contested access, or another explicit stakes-bearing objective.',
    '- ResolutionEngine must separate user-authored internal prose from external action. First-person introspection, internal monologue, memories, metaphors, self-questions, subjective sensations, emotional narration, and thought-only text are context only. They do not create actions, targets, rolls, wounds/status/condition, inventory/gear changes, location changes, or scene facts unless the same input also declares a concrete present external action, spoken dialogue, object/ability use, movement, attack, or interaction. When mixed, extract only concrete present external actions and spoken dialogue for identifyGoal, identifyChallenge, targets, challengeType, and actionUnits.',
    '- ResolutionEngine.restraintControl is a simple fact detector. Mark Present=Y only when the latest user input explicitly holds, pins, grabs, drags, blocks, binds, immobilizes, carries, forces position, or prevents movement of a specific living NPC. Do not mark it for hand-on-wall proximity, leaning close, flirting, hand-holding, ordinary touch, or movement that does not restrict the NPC body or movement.',
    '- ResolutionEngine.boundaryPressure is a simple fact detector for non-restraint boundary pressure: NPC-associated object/item access, snatching, taking, keeping, refusing to return, guarded space/access, blocked doorway, or stopping departure without directly controlling the NPC body. It does not decide rollNeeded, hostility, damage, or relationship effects.',
    '- ResolutionEngine.boundaryBreak checks hidden tracker pendingBoundary only. If no pendingBoundary is active, Present=N. If pendingBoundary exists, mark Present=Y only when the latest user input continues, escalates, ignores, or refuses to release/return/stop that same boundary behavior. Mark Present=N when user releases, returns, backs off, apologizes without continuing, or does something unrelated. The extension supplies the stored boundary identity after this semantic Present decision; do not output identity fields.',
    `- RelationshipEngine aggression classification is method-first and applies uniformly to proactive attacks, counterattacks, retaliation, companion attacks, and companion counters. ${RELATIONSHIP_FIELD_DESCRIPTIONS.aggressionMethod} ${RELATIONSHIP_FIELD_DESCRIPTIONS.aggressionMethodEvidence} The semantic pass classifies only the method; deterministic code maps physical to PHY and supernatural to MND.`,
    '- ResolutionEngine.rollNeeded is the sole semantic roll gate for ordinary non-boundary stakes. Apply DEF.STAKES and DEF.NO_STAKES. Return Y when success/failure of the latest explicit user goal or challenge creates fresh unresolved stakes: physical risk, harm, danger, stealth against a specific established living detector/opponent, infiltration, contested material gain/loss outside ordinary boundaryPressure handling, significant trust/status/authority shift, access outside ordinary boundaryPressure handling, secrets, combat, pursuit/escape, deception, bargaining, environmental obstacle resolution, or explicit goal advancement/failure. Do NOT force rollNeeded=Y solely because {{user}} restrains, grabs, pins, blocks, snatches, takes, holds, pressures an NPC boundary, or searches established dead remains; classify those through restraintControl, boundaryPressure, boundaryBreak, or lootSearch, then deterministic code decides the result. Return N only when no stake is present, when stealth-style action lacks a specific established living detector/opponent and has no separate non-stealth obstacle, or when the exact stake is already resolved/suppressed by saved fear/terror, hostility/hatred, persisted intimacy boundary, unavailable item attempt, safe-scene aid/treatment, deterministic loot search, or repeated resolved same-tactic negative social attempt rules. If stakes and ordinary continuity/no-stakes wording both seem relevant, stakes win unless already resolved. Failed/resolved bluff blocks repeated bluff; failed/resolved intimidate blocks repeated intimidate. Bluff does not block a later intimidate, and intimidate does not block a later bluff. Repeated wording, stronger insults, renewed same-tactic threats, rephrased same-tactic bluffs, or theatrical display after refusal/failure are aftermath or escalation, not a fresh social contest. ResolutionEngine.rollReason must briefly explain why rollNeeded is Y or N and must not contradict the flag.',
    '- ResolutionEngine.challengeType is the roll route, not a stat choice. Use none when rollNeeded=N. Use social for fresh unresolved NPC-facing persuasion, bargaining, deception, intimidation, coercion, negotiation, request, command, seduction, reassurance, or social pressure. Use mundane_combat for direct bodily, weapon, natural-weapon, tool, projectile, thrown object, or ordinary physical attack that can injure a living target; restraint/control alone is not combat. Use supernatural_combat for spell, curse, psychic, elemental, magical, divine, demonic, or supernatural harmful effect against a living target; magical restraint/control alone is restraintControl unless it also harms. Use restraint only for an actual restraint contest when deterministic boundary/restraint policy requires a roll. Use stealth only for avoiding detection/perception by a specific established living detector/opponent. Use environment for physical/environmental obstacles, escape, chase, locks, traps, terrain, weather, barriers, hazards, non-living opposition, or object/access/boundary contests not covered by boundaryPressure. If challengeType=social, socialTactic must be diplomacy, bluff, or intimidate; otherwise socialTactic=none.',
    '- ResolutionEngine.actionUnits is the only semantic source for mechanically counted actions. Non-combat challenge types return exactly one A1 unit. Combat challenge types return one unit per explicit discrete attack/effect that could separately land, miss, be blocked, dodged, deflected, or apply an effect, capped at three. Count separate attacks/effects even when they share one target, one goal, one sentence, one ability name, or one combo; do not count setup, aiming, focusing, movement, pivoting, defense, or flavor unless that act itself is a separate stakes-bearing attack/effect. actionUnits does not decide success, failure, outcome, injury, counterattack, or narration.',
    '- ResolutionEngine.identifyTargets.ActionTargets is the direct interaction list. Include every living NPC the latest user input directly addresses, speaks to, answers, asks, thanks, reassures, requests, warns, commands, helps, treats, touches, accompanies, trades with, gives something to, receives something from, attacks, restrains, deceives, negotiates with, or otherwise directly interacts with this turn, whether rollNeeded is Y or N. ActionTargets are broader than OppTargets.NPC. Do not add an NPC to ActionTargets solely because they are a stealth detector; StealthTargets is a separate, mutually exclusive category for covert detection attempts. Do not include bystanders, background crowds, inferred listeners, offscreen entities, or hostilesInScene-only NPCs unless the latest user input directly involves them.',
    '- ResolutionEngine.identifyTargets.StealthTargets is the dedicated covert-detection list. Return the exact established living entity or entities whose detection {{user}} is explicitly trying to avoid. This includes semantically clear attempts to move past, follow, trail, tail, shadow, stalk, hide from, sneak around, infiltrate past, or observe a living entity without being detected; modifiers such as quietly, secretly, unseen, undetected, out of sight, without drawing attention, or equivalent wording qualify when they clearly establish that intent. Do not infer stealth from ordinary following, movement, observation, concealment, or quietness when avoiding detection is not established. If StealthTargets is non-empty, it is the authoritative detector list; deterministic code copies those exact names into OppTargets.NPC, forces rollNeeded=Y and challengeType=stealth, and clears OppTargets.ENV. StealthTargets does not imply hostility or NPCAwareOfUser; the detector belongs in NPCAwareOfUser only after the scene establishes that {{user}} was noticed.',
    '- ResolutionEngine.identifyTargets.NPCAwareOfUser is the individual-awareness list. Include only named or clearly individual living NPCs who are present and directly become aware of {{user}} by noticing, looking at, addressing, gesturing to, reacting to, or otherwise individually interacting with {{user}} in the current scene/context, even if {{user}} has not directly acted on them. Exclude groups, crowds, factions, unnamed plural background NPCs, inferred listeners, offscreen entities, and generic bystanders. Example: "the innkeeper looks at {{user}}" belongs in NPCAwareOfUser; "the patrons turn toward the newcomer" does not.',
    '- ResolutionEngine.identifyTargets.PowerActors is strategic-only: list organizations, factions, institutions, groups, and potential power figures with any credible means to affect {{user}} beyond acting alone in the moment: money, influence, authority, status, agents, staff, hired help, resources, institution/faction access, reputation, information, territory, magic, command, leverage, social reach, ownership, public prominence, or recurring access. PowerActors never create rolls, NPCInScene, RelationshipEngine, B/F/H, injuries, or visible tracker entries by themselves.',
    '- The relationshipEngine array contains one object for each living NPC in ActionTargets, StealthTargets, OppTargets.NPC, BenefitedObservers, HarmedObservers, or NPCAwareOfUser. Do not create relationshipEngine objects from hostilesInScene.NPC or PowerActors alone unless that NPC is also in one of those target/observer/awareness lists.',
    '- If no living NPC is in those target/observer/awareness lists, relationshipEngine must be [].',
    '- Every relationshipEngine object MUST include aggressionMethod, aggressionMethodEvidence, standingInfluence, and standingBasis. Assess aggression method from established context, never numeric stat order; deterministic code maps physical to PHY and supernatural to MND for every aggression type. Assess {{user}}\'s standing as this NPC knows and recognizes it relative to themselves. standingInfluence=none when this NPC does not recognize a meaningful user-standing difference. Use aware when {{user}}\'s recognized title, authority, reputation, demonstrated power, backing, lineage, or affiliation changes etiquette, caution, risk, or openness without constraining the NPC. Use constrained only when {{user}}\'s recognized higher authority, status, power, backing, lineage, or affiliation limits what this NPC openly expresses or dares to do. A hierarchy in the opposite direction does not make the NPC constrained. Standing changes outward expression, never B/F/H itself. Affection may become restrained or formal, hostility may be concealed, neutral behavior may follow protocol, and friends may still recognize public authority. Unknown, concealed, unsupported, or unrecognized standing is none with standingBasis=(none); aware/constrained requires a concise real evidence basis.',
    '- EngineContext.userReputationContext.location is only the current settlement/community/route/region identifier for deterministic fame/infamy lookup. Use the hidden world state reputationLocation/place when it clearly applies to the current scene; otherwise use a concise known place/community name from context, or (none) if no current community is knowable. Do not decide fame/infamy effects here.',
    '- Each relationshipEngine object\'s initPreset is only "how this NPC initially feels toward {{user}}" when currentDisposition is missing. The semantic pass chooses only explicit authored/personal Y/N tags; deterministic code assigns B/F/H stats and separately applies hidden fame/infamy. romanticOpen=Y when prior character card/lore/scenario/pre-existing relationship/chat establishes clear user-directed romantic interest, romantic willingness, love, crush, courting desire, romantic preoccupation, or deliberate romantic pursuit toward {{user}}. This can be stated directly or shown through clearly romantic behavior, gestures, plans, keepsakes, letters, gifts, jealousy, longing, attempts to be noticed, attempts to spend time alone, or other evidence that the NPC interest in {{user}} is romantic rather than merely friendly. Do not mark romanticOpen for generic friendliness, politeness, casual flirting, shallow physical attraction, ordinary embarrassment, first impressions, vague chemistry, gratitude, or non-romantic loyalty. Do not suppress romanticOpen solely because userNonHuman=Y; set both flags if both are explicit. userBadRep=Y only if explicit character card/lore/scenario/pre-existing relationship context says {{user}} is hated, distrusted, wanted, enemy-coded, or has a bad personal prior relationship with this NPC before the current first interaction. priorUserGoodRep=Y only if explicit character card/lore/scenario/pre-existing relationship context gives {{user}} safe familiarity, credible vouching, ordinary neighbor/customer/guild contact, cleared/cooperative status, prior help, trust, gratitude, friendship, or other authored prior context that makes {{user}} known as safe/cooperative to this NPC. Do not use broad public fame, public infamy, generic reputationKnowledge, first-encounter kindness, rescue, courtesy, friendliness, praise, or warm first impression for these flags. userNonHuman=Y only when {{user}} is explicitly visibly inhuman, demonic, monstrous, undead, bestial, eldritch, construct-like, or obviously supernatural and this NPC lacks prior familiarity, ordinary normalizing context, trusted introduction, or credible knowledge that makes {{user}} known rather than shocking; it can also be Y for explicit authored fear-coded relationship context with this NPC. Do not use broad public infamy as userNonHuman. fearImmunity=Y only if this NPC is the same kind/race category as that user form, a superior or peer supernatural/monstrous being, explicitly immune/naturally resistant to fear or mental fear, or card/lore/scenario explicitly portrays them as an ancient/powerful/non-ordinary being that has faced such horrors and is not meaningfully afraid of them. Title, rank, bravado, posturing, composure, courage, or pretending to be fearless do not count.',
    '- Each relationshipEngine object\'s establishedRelationship is true only if this NPC already has B4 relationship state and tracker establishedRelationship=Y, or the current explicit scene shows a direct romantic/love/relationship declaration or request from {{user}} accepted by that NPC, or from that NPC accepted by {{user}}. If the immediately previous NPC message contains a clear love/relationship confession or request, and the current user input accepts it verbally or through unmistakable romantic reciprocation such as kissing/embracing without refusal, return true. If the immediately previous user input contains a clear love/relationship confession or request, and the current NPC response accepted it, return true. It must establish an actual romantic relationship, partnership, lovers status, dating/courting bond, or equivalent committed romantic connection. Flirting, attraction, arousal, sex, prior intimacy, affection, kindness, trust, loyalty, closeness, friendship, gratitude, protectiveness, or B4 alone does not count.',
    '- Each relationshipEngine object\'s romanceStyle is for B4 pre-relationship initiative only. Return nervous if explicit card/lore/context portrays this NPC as shy, reserved, guarded, restrained, formal, awkward, timid, emotionally cautious, or likely to show romantic interest through hesitation. Return flirt if explicit card/lore/context portrays this NPC as bold, outgoing, playful, teasing, direct, seductive, socially confident, or likely to show romantic interest through open flirtation. Return auto if unclear or mixed.',
    '- Each relationshipEngine object\'s checkThreshold override flags must use all available context: active SillyTavern prompt stack, character card, persona name/text, scenario, lore/world info, tracker snapshot, and chat history. CurrentInvitation=Y when this NPC clearly and directly offers, requests, invites, strongly implies, accepts, agrees to, arranges, or physically initiates sexual/intimate escalation with {{user}} in the current or immediately recent scene, and has not withdrawn, refused, panicked, or been interrupted by danger. Mark CurrentInvitation=Y when the NPC accepts or agrees to {{user}}\'s explicit sexual/intimate proposal, including agreeing to join, inviting or calling another willing participant, or saying yes to coming over for sex/intimacy. Mark CurrentInvitation=Y for irrefutable sexual invitation hints even when phrased as teasing questions, such as "I wonder how tight I would be for you. Want to find out?" Do not mark CurrentInvitation for ordinary flirting, suggestive banter, compliments, attraction, embarrassment, vague innuendo without an invitation, or a user-originated proposal the NPC has not accepted. Exploitation=Y when card/lore/context explicitly makes this NPC exploitable by {{user}} or the current situation: naive, easily led or persuaded, follows {{user}}\'s lead without question, dependent, trapped, coerced, powerless, sheltered to an unsafe degree, or otherwise unable to safely judge/resist. Do not mark Exploitation for mere innocence, shyness, kindness, friendliness, attraction, low confidence, or normal inexperience without explicit vulnerability/suggestibility. Hedonist=Y only for explicitly sexually open, pleasure-seeking, casual, promiscuous, or eager intimacy context. Transactional=Y only for explicit willingness to exchange intimacy for money, goods, favors, protection, status, or services. Established=Y only for explicit prior/current intimate access with current or recent receptivity toward {{user}}, such as casual lovers, friends with benefits, an ongoing sexual arrangement, or explicit comfort/willingness with renewed intimacy. Do not mark Established for prior intimacy alone when current receptivity is absent, stale, unclear, refused, fearful, hostile, coerced, or boundary-limited. establishedRelationship remains its separate relationship-state mechanic.',
    '- Each relationshipEngine object\'s checkThreshold.RomanticBuildup=Y only when a B4 close-bond scene has consistently and mutually built toward romantic/intimate escalation with receptive NPC behavior, so {{user}}\'s latest intimate advance is a natural continuation. Do not mark RomanticBuildup for ordinary friendliness, tenderness, gratitude, warmth, one smile, casual flirting, vague chemistry, or user-only escalation. Do not mark RomanticBuildup if refusal, withdrawal, fear, hostility, coercion, danger, public/social interruption, or a boundary limit is active.',
    '- Each relationshipEngine object\'s auditInteraction is the broad meaningful-benefit gate. exceptionalBenefit is a strict subset, never a replacement: classify the benefit that the latest user action would produce if it succeeds, without predicting the roll. First classify exceptionalBenefitScale as ordinary, significant, or exceptional from the complete established situation. ordinary means routine, expected, minor, or limited help; significant means a real and meaningful improvement that is not unusually consequential or relationship-defining; exceptional means an unusually high-consequence, personally significant result likely to alter this NPC\'s lasting view of {{user}}. Set exceptionalBenefit=Y only when auditInteraction=Y, exceptionalBenefitScale=exceptional, and successful completion of the latest user action would directly cause that result. Do not use keywords, one fixed scenario, or a named example as the rule. exceptionalBenefitEvidence must name the NPC, explain the concrete stakes at issue, explain why a successful result would be exceptional in this situation, and identify the causal user action; do not claim a pending action already succeeded. Use (none) when exceptionalBenefit=N. The semantic pass proposes this classification; deterministic code verifies the exact scale, real relationship, actual resolved outcome, and evidence.',
    '- Each relationshipEngine object\'s slowBondEvidence is scene-local semantic evidence for slow B3-to-B4 trust growth. Mark only categories explicitly shown in the latest scene/current immediate context. respectfulContact=welcome/respectful physical contact or physical help; cooperation=constructive cooperation toward a shared purpose; comfortInProximity=NPC remains or settles close without fear, duty, coercion, or forced circumstance; boundaryRespect={{user}} respects refusal, hesitation, privacy, space, limits, consent, or a stated boundary; sharedRoutine=repeated or mundane togetherness such as eating/traveling/working/resting/training/tending camp; playfulness=mutual light teasing, joking, banter, or relaxed warmth; teamwork=coordinated effort under pressure/danger/conflict/crisis; personalAttention=specific attention to NPC needs, preferences, wellbeing, vulnerability, history, comfort, or concerns. blockers include coercion, intimidation, betrayal, humiliation, unwanted intimacy pressure, boundary violation, unresolved harm, exploitation, active fear, active hostility, or trapped/dependent/powerless circumstances that make closeness unsafe to count.',
    '- ResolutionEngine.userAbilityUse is semantic-only ability/spell detection. Compare the latest user input against active {{user}}/persona abilities and spells, including the # ABILITIES and # SPELLS character sheet sections, character persona, lore, or prompt stack. Mark Attempted=Y when the input explicitly names an ability/spell or implicitly describes attempting one through trigger, delivery method, or desired effect. Private delivery phrasing such as "meant only for X", "only X can hear", "whisper so only X hears", "send the words directly/private to X", or "speak into X alone" should match a persona ability/spell whose effect privately carries speech, sound, thought, or message to a target, even if the ability/spell name is not said. Mark Available=Y only if that attempted ability/spell exists in active {{user}} abilities or spells. Use the exact persona ability/spell name when available; otherwise name the attempted ability/effect concisely. Evidence is the user wording that signals the attempt. NarrativeEffect is the direct in-world effect to preserve when available, or the attempted effect that must not occur when unavailable. If Attempted=Y and Available=N, set NoEffectReason to why no ability/spell effect occurs. The extension derives Used from Attempted and Available and supplies the fixed flavor_only_no_bonus mechanical scope. If an available ability/spell delivers a threat, persuasion, attack, escape, healing, or other stakes-bearing goal, classify and roll the broader goal normally; do not roll the ability/spell separately. Noncombat utility magic succeeds if available and does not create a roll by itself. If no ability/spell attempt exists, output Attempted=N, Available=N, and (none) for name, evidence, effect, and reason.',
    '- ResolutionEngine.itemUse applies the ITEM_USE_REFERENT_RULE before any availability check. It activates only for a direct user interaction with one specifically identified concrete object/material. Searching, scanning, looking around, inspecting, examining, rummaging, foraging, or seeking something/anything useful is not itemUse and must not receive an unavailable-item branch. Generic categories such as weapon, tool, object, item, something, or anything are not Item values. Return only Attempted and Item for this semantic decision; do not output Available, Source, Evidence, or NoEffectReason because the extension resolves those mechanically from authoritative saved state and current-scene facts. Item interaction never grants ownership or updates inventory by itself.',
    '- ResolutionEngine.lootSearch is a narrow semantic fact detector. Mark Attempted=Y only when the latest input explicitly searches, loots, rummages through, checks, or examines a specific body, corpse, remains, or defeated target for carried/recoverable possessions. Identify the target and classify TargetKind as humanoid, monster, or other from established context. Do not decide whether the target is truly dead, what loot exists, its value, or whether it was searched before; deterministic code owns those decisions. Return N for area/container searches, merely looking at a target, taking an already-visible item, or searching a living NPC\'s possessions.',
    '- ResolutionEngine.claimCheck is a narrow stakes-bearing claim check, not a truth engine. Mark Present=Y only when {{user}} makes a factual claim to a specific NPC that could materially affect that NPC choice, trust, access, resources, authority, safety, emotional vulnerability, or immediate stakes. Claim examples include identity/status/authority, affiliation, ownership/access, possession/resources, orders/authorization, or claimed events/facts used as leverage. TruthStatus: known_true only if explicitly supported; known_false only if explicitly contradicted; unsupported if material but not established; unknown if context cannot judge; none when no relevant claim. NPCAccess describes how much the target NPC can naturally verify or know the claim: direct, partial, none, unknown. StakesImpact=Y only when belief/disbelief matters under DEF.STAKES and is not excluded by DEF.NO_STAKES. Do not mark Present for casual flavor, jokes, harmless small talk, opinions, compliments, vague emotional color, or claims that do not affect NPC stakes.',
    '- ResolutionEngine.environmentDifficultyTier applies only when challengeType=environment and OppTargets.ENV contains a non-living obstacle or condition that makes the current goal fail-able, such as locked doors, barriers, terrain, weather, darkness, distance, noise, wards, traps, hazards, objects, or environmental pressure. It does not apply to stealth, which resolves against OppTargets.NPC awareness instead of ENV difficulty. Allowed values: none, easy, average, hard, extreme. easy means easy/trivial/routine/weak/lightly obstructed; average means a meaningful obstacle a capable person could plausibly fail; hard means a serious obstacle requiring strong capability, tools, magic, focus, favorable positioning, or risk; extreme means exceptional, dangerous, fortified, overwhelming, or near-impossible environmental opposition. Classify from concrete scene facts: material, scale, complexity, danger, time pressure, visibility, footing, weather, magical strength, tool access, distance, and whether the environment is worsening. Do not raise difficulty because the story moment feels dramatic. Do not lower difficulty because {{user}} has high stats. If no fresh unresolved positive stake exists, set rollNeeded=N instead of using an ENV tier. If challengeType is not environment, set environmentDifficultyTier=none. Deterministic code maps this tier to the numeric ENV bonus.',
    '- ResolutionEngine.identifyTargets.hostilesInScene.NPC is scene-level: list ALL established, present, living hostile entities currently threatening {{user}}, companions, protected NPCs, bystanders, or the scene generally. Identify this broad hostile pool before choosing OppTargets.NPC. Establishment must come from assistant narration, tracker, character/scenario/lore context, or the initial test setup; do not create a hostile from the latest user input alone. Exclude friendly/neutral NPCs, absent/offscreen entities, incapacitated/dead entities no longer posing danger, and non-living hazards/obstacles.',
    '- ResolutionEngine.identifyTargets.OppTargets.NPC is narrower: list only living entities directly opposing, contesting, resisting, blocking, defending against, acting as the detector/opponent when challengeType=stealth, or being attacked/challenged by {{user}}\'s current action/challenge. Do not put every enemy in OppTargets.NPC just because they are hostile; use hostilesInScene.NPC for the broader hostile pool.',
    '- ResolutionEngine.activeHostileThreat is strict. Return Y only if the current scene contains an immediate hostile danger from an NPC/entity: attacking, charging, preparing to attack, pursuing, ambushing, threatening violence, monster/hostile creature engagement, armed standoff, capture attempt, or imminent physical/supernatural harm. Return N for negotiation, refusal, bargaining, argument, social resistance, authority denial, suspicion, rivalry, nonviolent obstruction, or ordinary OppTargets.NPC without immediate danger.',
    '- ResolutionEngine.intimacyAdvanceExplicit is strict. Return Y only if {{user}} explicitly attempts, requests, accepts, or reciprocates actual intimate escalation with a specific NPC: kissing, making out, sexual touch, undressing toward intimacy, asking to sleep together, asking for sex, moving to bed, or clearly initiating romantic/sexual physical closeness. Return Y for accepting or reciprocating a prior explicit NPC-initiated intimacy invitation or action. Return N for flirting, teasing, compliments, romantic banter, suggestive jokes, vague innuendo, "what did you have in mind", declarations of love, asking for a date, emotional confession, hand-holding, casual proximity, or ordinary affection that does not clearly escalate into kissing or sexual/intimate contact. This is only an intimacy permission/boundary signal and does not create stakes, rolls, landed actions, Bond loss, Fear, or Hostility by itself.',
    '- ResolutionEngine.harmMode is a downstream damage/death gate only. It must NOT decide rollNeeded, challengeType, boundary pressure, or relationship harm. Set lethal when the current action attacks a living body using a weapon, improvised weapon, natural weapon, dangerous tool, projectile, firearm, blade, fang, claw, horn, crushing object, lethal/destructive magic, poison, fire, electricity, or another method that could reasonably kill or maim if it lands decisively. {{user}} does not need to say "kill"; infer from the physical method and context. Set nonlethal when the current action attacks a living body with ordinary unarmed force or explicitly controlled force: punches, kicks, elbows, knees, brawling, tackles meant as attacks, training, sparring, pulled blows, pommel strikes, flat-of-blade strikes, practice weapons, or a clearly stated attempt to avoid serious/fatal harm. Nonlethal can deal HP damage, but HP 0 means unconscious/incapacitated, not dead. Set restraint_control when the current action controls, holds, pins, grabs, drags, blocks, binds, immobilizes, carries, forces position, or prevents movement of a living body without a separate attack meant to injure. Restraint/control does not deal HP damage; it can cause bruising at most and restraint/control statuses if scene-valid. Set none when there is no bodily attack, harmful effect, or restraint/control. If the turn mixes methods, choose the most dangerous active mode: lethal > nonlethal > restraint_control > none. Ambiguous ordinary bodily force without weapons or inherently dangerous methods is nonlethal by default; mere restraint/control remains restraint_control.',
    '- All genStats groups must include only CapabilityPool and MainStat. Use genStats only when the relevant NPC currentCoreStats are missing in the tracker snapshot. CapabilityPool classifies this specific NPC population/role context using occupation, location, species, established actions, card/lore facts, and reputation together: common for ordinary civilians/residents/incidental people, unknown capability, or no practiced-capability evidence; trained when role or portrayal clearly implies practiced professional, martial, magical, intellectual, investigative, or social capability; elite only for explicitly exceptional champions, masters, veterans, rare predators, renowned experts, or similarly uncommon individuals; boss only for an explicitly singular major threat, legendary being, supreme master, or central overwhelming antagonist. Title, location, hostility, or dramatic importance alone never makes boss. If stats are missing and uncertain, use common; use none only when no NPC needs stats. MainStat uses explicit specialization PHY/MND/CHA; unclear or broadly capable is Balanced. Deterministic code rolls final Rank from the pool percentiles, assigns numeric PHY/MND/CHA, and saves the result once.',
    '- InjuryEffectEngine is semantic-only candidate extraction for effects the user action would cause if deterministic mechanics say the action lands. It does not roll and does not decide success. Include physical injuries and impairing magical/status effects regardless of source: burns, poison, paralysis, sickness, blindness, fear/panic, restraint, curses, lightning/electrical effects, exhaustion, mental effects, or other ongoing impairing states. Exclude purely emotional/social harm, mere witnessing, momentary pain, intended/requested future injuries, or effects that would not persist or impair later action.',
    '- InjuryEffectEngine.effectType is a closed canonical enum, never a free-text description or attack mechanism. Return exactly one of: none, physical_injury, burn, poison, paralysis, disease, blindness, stun, fear, restraint, curse, electrical, exhaustion, mental_status, other_status. Map direct bodily-damage labels such as blunt/blunt force, bruise/bruising, wound, cut, abrasion, laceration, fracture, puncture, stab, slash, or sprain to physical_injury; put mechanism, body part, and detail in description/bodyPart. Keep none for no actual impairing effect, and do not use pain, impact, trauma, or another ambiguous symptom as an injury category.',
    '- InjuryEffectEngine target must be the entity actually receiving the impairing effect. HarmedObservers may appear only if they are directly affected by the injury/status effect, not merely emotionally harmed by seeing or caring about another target. Use persistence=lasting and affectsAction=Y only for effects that should impair later action if applied.',
    '- TrackerUpdateEngine is explicit-only visual state tracking. Output deltas only from the latest user input and immediate visible context. Use condition=unchanged, personalitySummary=unchanged, background=unchanged, knowledge=unchanged, practicedSkills=unchanged, and (none) lists unless a change is explicitly stated or durable context establishes a missing NPC foundation.',
    '- TrackerUpdateEngine must never rewrite full inventories, gear, wounds, status, tasks, or commitments from silence. Add only explicit new items/effects/tasks. Remove only explicit dropped/spent/used-up/lost/completed/canceled/failed/abandoned entries. Remove wounds/status only when the text explicitly says the injury or status is healed, cured, recovered, restored, regenerated, magically healed, knitted closed, gone, or no longer impairing.',
    '- TrackerUpdateEngine must not treat a requested, intended, commanded, allowed, promised, predicted, pending attempted action, remembered event, metaphor, internal sensation, hypothetical, uncertainty, self-question, or subjective self-description as an established wound/status/condition change. "I tell him to hit my arm hard enough to bruise it", "I stab him", "I let the blow land", "I remember being gutted", or "my brain tries to breathe" is not woundsAdd/statusAdd/condition by itself. "My arm is already bruised", "his arm is bleeding", or "I am poisoned" is.',
    '- TrackerUpdateEngine must track only current lasting injuries/status. Do not track momentary pain, impact, a hit landing, being knocked back/down, being winded, losing breath, flinching, staggering, or temporary shock unless the text explicitly establishes an ongoing bruise, cut, bleeding, sprain, break, fracture, poison, sickness, restraint, exhaustion, unconsciousness, or similar continuing state.',
    '- TrackerUpdateEngine NPC revealedName is identity tracking only. If final narration explicitly reveals that an already tracked generic NPC/person/role is actually named something, set NPC to the existing tracker label and revealedName to the revealed proper name. Example: tracked NPC "bystander" says "Torvinash." as an introduction -> NPC=bystander and revealedName=Torvinash. Use revealedName only when the narration semantically identifies which tracked generic NPC received the name; if multiple possible generic NPCs exist and identity is unclear, use (none).',
    '- TrackerUpdateEngine NPC personalitySummary is optional stable personality memory. If this is the first meaningful tracking of an NPC or the existing personalitySummary is empty, assign a compact natural-language personality seed when card/lore/scenario/context or visible behavior supports one. Use internal glossary patterns only as behavior guidance; never output raw internal labels such as deredere, tsundere, yandere, kuudere, dandere, himedere, oujidere, kamidere, mayadere, sadodere, hiyakasudere, hajidere, bakadere, erodere, dorodere, shundere, undere, goudere, kanedere, or byoukidere. Preferred format: temperament: ...; speech: ...; interaction: ...; intensity:low|medium|high. Speech and interaction should carry most uniqueness. If personalitySummary already exists, use unchanged unless durable context clearly contradicts or refines it. Do not write mood, temporary emotion, injuries, relationship state, attraction, fear/hostility level, or what happened this turn.',
    '- TrackerUpdateEngine NPC background, knowledge, and practicedSkills are hidden stable grounding memory. Background records established role, upbringing, work, training history, or life experience; knowledge records established subjects or facts the NPC plausibly knows; practicedSkills records concrete learned techniques supported by that background. Populate a field only when character card, lore, scenario, explicit setup, existing tracker state, or durable visible evidence supports it. Keep each field concise and natural-language. Do not infer survival expertise, professional technique, specialized knowledge, or unusual confidence from intelligence, rank, age, occupation title, one successful observation, or a single current action. Existing values remain unchanged unless durable evidence clearly refines them. These fields guide narration only and never alter stats, rolls, bonuses, relationships, injuries, or outcomes.',
    'PERSONALITY_ARCHETYPE_GLOSSARY:',
    PERSONALITY_ARCHETYPE_GLOSSARY,
    '- TrackerUpdateEngine.BoundCompanionState is hidden user state. It may read the entire assembled context: active SillyTavern prompt stack, character card, persona/sheet, abilities, scenario, lore/world info, tracker snapshot, bound companion snapshot, and chat history. Set status=active only when context explicitly establishes an inner companion, possession, shared vessel, intelligent item/weapon, bound spirit/artifact, or implant as already active/completed/accepted and able to communicate with {{user}} internally or through the carried item. Set status=inactive only when an established companion is explicitly severed, dismissed, removed, permanently silenced, or destroyed. Set status=unchanged when the bound companion snapshot is already active and the current context does not explicitly change it. Also set status=unchanged for pending offers, invitations, unaccepted bargains, incomplete rituals, "do you accept?" proposals, unclear voices, metaphors, rumors, dreams, hallucination ambiguity, or no change. Do not invent an inner entity. If active, fill name/type/vessel/voice/evidence from explicit context when known; otherwise use (none) for unknown optional fields. Evidence must cite the explicit context fact that makes it established, not a guess.',
    '- TrackerUpdateEngine.PendingBoundaryState is post-narration-owned and omitted from semantic preflight. The extension supplies its neutral unchanged delta; the post-narration tracker delta sets or clears pending boundaries after FINAL_NARRATION exists.',
    '- When trackerUpdateEngine.npcs is non-empty, every object must include NPC, revealedName, personalitySummary, background, knowledge, practicedSkills, condition, woundsAdd, woundsRemove, statusAdd, statusRemove, gearAdd, and gearRemove.',
    '- TrackerUpdateEngine NPC entries are only for NPCs with explicit condition, wound, status, visible gear, stable personalitySummary, or stable background/knowledge/practicedSkills changes in this turn. NPC inventory and currency are post-narration-owned and do not appear in this semantic ledger. If none apply, trackerUpdateEngine.npcs must be [].',
    '- PowerActorEnmity is hidden power-actor memory. First assess power candidates semantically, not by keyword/title. A power actor is any entity with credible means to affect {{user}} beyond acting alone in the moment: money, influence, authority, status, agents, staff, hired help, resources, institution/faction access, reputation, information, territory, magic, command, leverage, social reach, ownership, public prominence, or recurring access. Explicit prominence, wealth, rank, office, ownership, command, fame, backing, network access, unusual resources, or a role that plausibly controls access/services/people is enough for a Y assessment unless context clearly limits them to ordinary personal reaction. Ordinary people with only personal reaction are not power actors even if they have a job title.',
    '- PowerActorEnmity.assessments is audit-only diagnosis. Include one assessment for each meaningful ResolutionEngine.identifyTargets.PowerActors entry and for every current-scene or active-card candidate whose possible reach should be auditable: the active character/card actor, named scene NPCs, target/observer NPCs, and any affected organization/group when context gives credible reach beyond personal action. Do this even when PowerActorEnmity.effects count is 0. Assessment never creates enmity by itself and never replaces RelationshipEngine. If a living NPC appears in a normal target/observer list, still create the required RelationshipEngine entry even when isPowerActor=Y.',
    '- PowerActorEnmity effects are candidate strategic consequences of the latest user input and immediate visible context. Add an entry when the attempted action would, if completed, meaningfully thwart, expose, harm assets of, steal from, publicly humiliate, help an enemy of, disrupt an operation of, kill/capture people of, or damage reputation/income of a power actor AND the actor is present, witnesses it, is informed, or has a concrete ordinary discovery/attribution path to {{user}}. actionUnitId MUST use the positional ID of the exact action unit causing the effect: first actionUnits entry=A1, second=A2, third=A3; the extension assigns these IDs. sourceTarget names the directly affected current target; use actor when the Power Actor itself is directly affected. For rolled actions set explicitlyCompleted=N and do not decide success; deterministic code applies only effects whose action unit lands. For no-roll actions set explicitlyCompleted=Y only when the effect is explicitly already completed, never for an attempt. Offscreen asset harm with no witness, report, evidence, confession, attribution, or discovery path creates no enmity this turn. If the affected party lacks reach, hasReach=N and severity=none. If the actor cannot plausibly know or discover it, knownToActor=N and deterministic code will not increase enmity.',
    '- PowerActorEnmity severity: minor=small obstruction or insult; meaningful=real setback, exposure, loss, asset harm, or operation disruption; major=severe public exposure, major defeat, major theft, death/capture of members, ruined operation, or serious reputation/income damage. If no valid effect applies, powerActorEnmity.effects must be [].',
    '- PowerActorEnmity.latentGrievances records only a substantial meaningful/major setback against a specific current living target who is explicitly assessed isPowerActor=N, has no credible reach, and has no established Power Actor affiliation anywhere in active context. Use the same qualifying effect classes as PowerActorEnmity. actionUnitId MUST use the positional ID of the exact action unit causing the grievance: first actionUnits entry=A1, second=A2, third=A3; the extension assigns these IDs. For rolled actions set explicitlyCompleted=N and let deterministic resolution decide whether that unit lands. For no-roll actions set explicitlyCompleted=Y only when the setback is explicitly already completed, never for an attempt. Exclude minor insults, routine disagreement, ordinary relationship friction, consensual interaction, mere restraint, harmless embarrassment, and any target already linked to a known Power Actor. evidence must cite the latest user action; attributionPath states who directly knows, witnessed, can report, or what evidence exists, or (none).',
    '- PowerActorEnmity.affiliationLinks may reference only an exact grievanceId copied from the hidden latent grievance snapshot. Add a link only when active card/scenario/lore/chat context explicitly establishes the grievance target\'s membership, employment, allegiance, ownership, command relationship, or other concrete affiliation with the named Power Actor. Never invent or infer a future organization. The linked Power Actor must also receive an isPowerActor=Y assessment with credible reach; the extension supplies target, actor type, and reach from those authoritative references. knownToActor=Y only when explicit context or an ordinary concrete reporting/discovery path lets that Power Actor know the stored grievance; otherwise use N and the grievance remains latent. affiliationEvidence and knowledgeEvidence must cite those separate facts. Return no duplicate target or assessment metadata.',
    '- PowerActorEnmity.latentFavors records only substantial meaningful/major completed help to a specific current living target who is explicitly assessed isPowerActor=N and has no established Power Actor affiliation. uncompensated=Y and beyondExpectedDuty=Y are mandatory; when either is unclear, use N and do not record. Exclude paid or promised rewards, contracts, quests, normal jobs, role obligations, routine professional work, ordinary commerce, courtesy, small gifts, and minor assistance. actionUnitId uses the same positional mapping as actionUnits (first=A1, second=A2, third=A3), and explicitlyCompleted uses the same exact outcome gate as latentGrievances. attributionPath states who knows, witnessed, can report, or what evidence exists.',
    '- PowerActorEnmity.favorAffiliationLinks may reference only an exact favorId copied from the hidden latent favor snapshot. Require an explicit established affiliation, an independently assessed Power Actor with reach, and separate affiliation/knowledge evidence. Never invent a future organization. The extension supplies target, actor type, and reach from the exact favor and matching assessment; do not duplicate those fields. knownToActor=Y only for a concrete actor knowledge/discovery path. knownToUser=Y only when user-facing context already reveals the affiliation and Power Actor identity; hidden context is insufficient. fit=use_now only when one favorable approach naturally fits the current scene without interrupting combat, crisis, active intimacy, urgent action, or the current dramatic beat. Otherwise use fit=defer. The favor remains latent unless all gates pass and final narration visibly presents the authorized opportunity.',
    '- PowerEventShape is hidden pending pressure shaping. Use it only when the Power actor snapshot contains a pendingEvent. If no pending event exists, powerEventShape.events must be []. The pending event type is deterministic and immutable; do not choose, replace, or output an event type. For each pending event, decide if it fits the current scene now. fit=use_now only when it can enter naturally through visible scene logic without forcing {{user}} action or revealing hidden motives. fit=defer when the current scene cannot naturally support it yet. fit=drop only if it is impossible or would contradict visible facts. visibleInstruction must be narrator-safe surface instruction only: describe what visibly happens or what an ordinary NPC/contact does, not why. Never include the words spy, agent, infiltrator, sponsor, handler, hidden motive, hidden allegiance, secret orders, betrayal, plant, or covert operative in visibleInstruction. For plant_contact, use the provided contactName when available and describe only an ordinary plausible introduction, role, offer, request, trade, work, travel, help, rumor, or social contact. For agent_* events, use the activeAgent name as an ordinary established NPC and describe only the visible action/suggestion/setback.',
    '- Companion/ally commands are tactical requests only. They can address the companion as an ActionTarget and can refer to an established hostile by name for later companion crisis targeting, but they must not be treated as {{user}} making the companion act, must not force a companion attack, and must not create a user-resolved success/failure roll for companion obedience. The named hostile must still be established through assistant narration/tracker/card/scenario/lore/initial test setup and belongs in hostilesInScene.NPC unless it directly opposes {{user}}\'s current action. If several hostiles exist and no specific one is named, do not guess a target.',
    '- Do not output primaryOppTarget or primaryOpposition. The only opposing living target list is identifyTargets.OppTargets.NPC; the separate broad hostile pool is identifyTargets.hostilesInScene.NPC.',
    '- If you cannot find explicit evidence, use the engine default for that line; never invent missing facts.',
].join('\n');

export function getPersonaIdentityHints(context) {
    const fields = getCharacterCardFields(context);
    const persona = String(fields.persona ?? '').trim();
    const hints = [];
    const add = value => {
        if (typeof value !== 'string' && typeof value !== 'number') return;
        const text = cleanScalar(value);
        if (!text || isNoneValue(text)) return;
        if (text.length < 2 || text.length > 40) return;
        const key = text.normalize('NFKC').toLowerCase();
        if (hints.some(item => item.normalize('NFKC').toLowerCase() === key)) return;
        hints.push(text);
    };

    add(context?.name1);
    add(context?.user);
    add(context?.userName);
    add(context?.personaName);
    add(fields.user);
    add(fields.userName);
    add(fields.personaName);
    const patterns = [
        /(?:^|\n)\s*(?:[-*]\s*)?(?:\*\*)?Name(?:\*\*)?\s*[:=]\s*(?:\*\*)?([^\n\r|#*]+?)(?:\*\*)?\s*(?=$|\n)/iu,
        /(?:^|[.!?\n]\s*)(?:Your name is|You are called)\s+(?:\*\*)?([\p{L}\p{N}][\p{L}\p{M}\p{N}' -]{1,38})(?:\*\*)?(?=[,.!?;\n]|$)/iu,
        /(?:^|[.!?\n]\s*)You are\s+(?:\*\*)?([A-Z\p{Lu}][\p{L}\p{M}' -]{1,38})(?:\*\*)?(?=[,.!?;\n]|$)/u,
    ];
    for (const pattern of patterns) {
        const match = persona.match(pattern);
        if (match?.[1]) add(match[1].replace(/\s+[-\u2013\u2014].*$/, ''));
    }
    return hints.slice(0, 8);
}

function buildSemanticPrompt(context, coreChat, type, trackerSnapshot, playerTrackerSnapshot = {}, options = {}) {
    const chatContext = formatChatContext(coreChat);
    const userName = context.name1 || 'User';
    const charName = context.name2 || 'Assistant';
    const cardContext = formatCardContext(context);
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
            content: buildSemanticTurnBindingBlock(options.semanticTurnBinding),
        },
    ];
}

function buildSemanticPromptFromAssembledChat(context, assembledChat, type, trackerSnapshot, playerTrackerSnapshot = {}, options = {}) {
    const userName = context.name1 || 'User';
    const charName = context.name2 || 'Assistant';
    const assembledMessages = normalizeAssembledPromptMessages(assembledChat);
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
            content: buildSemanticTurnBindingBlock(options.semanticTurnBinding),
        },
    ];
}

function buildSemanticContractText(userName, charName, type, trackerSnapshot, playerTrackerSnapshot = {}, options = {}) {
    const proxyAction = options?.userInputMode === 'proxy'
        ? String(options?.proxyUserAction || '').trim()
        : '';
    const inlineProxyInstructions = options?.userInputMode === 'proxy'
        ? []
        : normalizeInlineProxyInstructions(options?.inlineProxyInstructions);
    const powerActorSnapshot = sanitizePowerActorSnapshotForSemantic(options?.powerActorSnapshot || {});
    const latentGrievanceSnapshot = sanitizeLatentGrievanceSnapshotForSemantic(options?.latentGrievanceSnapshot || []);
    const latentFavorSnapshot = sanitizeLatentFavorSnapshotForSemantic(options?.latentFavorSnapshot || []);
    const userKnowledgeSnapshot = sanitizeUserKnowledgeSnapshotForSemantic(options?.userKnowledgeSnapshot || {});
    const worldStateSnapshot = normalizeWorldState(options?.worldStateSnapshot || {});
    const sceneItemStateSnapshot = sceneItemStateForModel(
        normalizeSceneItemState(options?.sceneItemStateSnapshot || {}, worldStateSnapshot),
        worldStateSnapshot,
    );
    const worldProgressionSnapshot = normalizeWorldProgression(options?.worldProgressionSnapshot || {});
    const worldProgressionContext = buildWorldProgressionSemanticContext(worldProgressionSnapshot, worldStateSnapshot);
    const boundCompanionSnapshot = normalizeBoundCompanionState(options?.boundCompanionSnapshot || {});
    const pendingBoundarySnapshot = normalizePendingBoundaryState(options?.pendingBoundarySnapshot || {});
    const semanticPlayerTrackerSnapshot = sanitizeTrackerUserStateForModel(playerTrackerSnapshot);
    const dispositionContinuityContext = buildDispositionContinuityContext(trackerSnapshot);
    return `Active names: user=${userName}, character=${charName}\nGeneration type=${type || 'normal'}\nNPC tracker snapshot JSON:\n${JSON.stringify(trackerSnapshot, null, 2)}\nPlayer tracker snapshot JSON:\n${JSON.stringify(semanticPlayerTrackerSnapshot, null, 2)}\n\n` +
        `Disposition continuity context (plain-language tracker state for rollNeeded and social buckets; use this to decide whether a current NPC reaction or negative social contest is already settled):\n${dispositionContinuityContext}\n\n` +
        `Power actor snapshot JSON (hidden strategic memory; use only for PowerEventShape and PowerActorEnmity, never visible tracker text):\n${JSON.stringify(powerActorSnapshot, null, 2)}\n\n` +
        `Latent grievance snapshot JSON (hidden unresolved grievance memory; use only for exact PowerActorEnmity.affiliationLinks, never visible tracker text or narration):\n${JSON.stringify(latentGrievanceSnapshot)}\n\n` +
        `Latent favor snapshot JSON (hidden unresolved favor memory; use only for exact PowerActorEnmity.favorAffiliationLinks, never visible tracker text or narration):\n${JSON.stringify(latentFavorSnapshot)}\n\n` +
        `User knowledge snapshot JSON (hidden memory about authored or personal facts people may know about {{user}}; use for UserKnowledgeApplication context only, never visible tracker text):\n${JSON.stringify(userKnowledgeSnapshot, null, 2)}\n\n` +
        `World state snapshot JSON (hidden current scene continuity; use reputationLocation/place as the default current community for EngineContext.userReputationContext.location when applicable):\n${JSON.stringify(worldStateSnapshot, null, 2)}\n\n` +
         `Current SceneItemState JSON (hidden ephemeral current-scene object availability; exact entries here are preferred for itemUse Source=scene. If the initialized state omits an object that the latest factual assistant narration establishes, deterministic verification may recover that latest narration as a current-scene source. It is not inventory, gear, ownership, or permanent location memory):\n${JSON.stringify(sceneItemStateSnapshot, null, 2)}\n\n` +
        `PRIVATE_WORLD_PROGRESSION_ACTIVE_PLANS JSON (hidden deadline state; use only for WorldProgressionAdvancement and never expose hidden causes or plans):\n${JSON.stringify(worldProgressionContext, null, 2)}\n\n` +
        `Bound companion snapshot JSON (hidden user state; current established inner companion, possession/shared vessel, intelligent item/weapon, bound spirit/artifact, or implant if any):\n${JSON.stringify(boundCompanionSnapshot, null, 2)}\n\n` +
        `Pending boundary snapshot JSON (hidden next-turn boundary memory; use only for ResolutionEngine.boundaryBreak):\n${JSON.stringify(pendingBoundarySnapshot, null, 2)}\n\n` +
        `${ITEM_USE_REFERENT_RULE}\n\n` +
        'You are the semantic extraction pass for a SillyTavern roleplay rules extension. ' +
        'Do not narrate. Do not roll dice. Do not calculate outcomes. ' +
        (proxyAction ? `The latest user message used double square brackets for proxy action mode. Treat the inner instruction as {{user}}'s actual attempted action for semantic classification: "${clip(proxyAction, 800)}". Ignore the wrapper brackets themselves. ` : '') +
        (inlineProxyInstructions.length ? `The latest user message contains inline double square bracket proxy instructions in addition to ordinary user text: ${formatInlineProxyInstructionsForSemantic(inlineProxyInstructions)}. Treat each inline instruction as explicit {{user}}-declared action detail, intent, or conditional reaction for semantic classification. If an inline instruction is conditional, classify it as a prepared conditional action; do not assume the conditioned action occurs, lands, or succeeds unless the condition is satisfied by this turn's scene facts and the action is supported by resolved mechanics. Ignore the wrapper brackets themselves. ` : '') +
        'Classify only contextual/semantic predicates needed by the engines. Use EXPLICIT-ONLY and FIRST-YES-WINS from the engine reference. ' +
        'The semantic/contextual fields you return are authoritative; the deterministic runner should not reinterpret them. ' +
        'rollNeeded is the sole semantic roll gate. Apply DEF.STAKES and DEF.NO_STAKES. Return rollNeeded=true when success/failure would materially change risk, harm, danger, stealth against a specific established living detector/opponent, infiltration, contested resources, trust/status/authority, autonomy/freedom, access, secrets, combat, pursuit, restraint, deception, bargaining, environmental obstacles, or explicit goal advancement. Return rollNeeded=false only when no stake is present, when a stealth-style action lacks a specific established living detector/opponent and has no separate non-stealth obstacle, when the exact stake is already resolved/suppressed by saved fear/terror, hostility/hatred, persisted intimacy boundary, unavailable item attempt, safe-scene aid/treatment, deterministic loot search of established dead remains, or when the latest input repeats a resolved same-tactic negative social attempt against the same NPC/goal under unchanged disposition. lootSearch never creates a roll by itself; only a separate explicit hazard, contest, or living opposition can do so. If stakes and ordinary continuity/no-stakes wording both seem relevant, stakes win unless already resolved. Failed/resolved bluff blocks repeated bluff; failed/resolved intimidate blocks repeated intimidate. Bluff does not block a later intimidate, and intimidate does not block a later bluff. Do not treat repeated same-tactic threats, stronger insults, rephrased same-tactic bluffs, renewed same-tactic coercion, or dramatic display after refusal/failure as a fresh social contest. rollReason must be a concise explanation that agrees with rollNeeded. ' +
        'challengeType is the roll route. Use none when rollNeeded=false; social for living NPC-facing persuasion, bargaining, deception, intimidation, coercion, negotiation, request, command, seduction, reassurance, or social pressure; mundane_combat for direct bodily, weapon, natural-weapon, tool, projectile, or ordinary physical attack/control against a living target; supernatural_combat for spell, curse, psychic, elemental, magical, divine, demonic, or supernatural harmful effect/control against a living target; stealth only for avoiding detection/perception by a specific established living detector/opponent; environment for physical/environmental obstacles, escape, chase, locks, traps, terrain, weather, barriers, hazards, non-living opposition, or object/access/boundary contests that are not social, combat, or stealth. If challengeType=social, socialTactic must be diplomacy, bluff, or intimidate; otherwise socialTactic=none. ' +
        'Living/non-living target separation is mandatory: hostilesInScene.NPC, ActionTargets, StealthTargets, OppTargets.NPC, BenefitedObservers, HarmedObservers, NPCAwareOfUser, RelationshipEngine NPC entries, and NPCInScene candidates are living entities only. OppTargets.ENV is only for a non-living obstacle or condition that makes {{user}}\'s current stakes-bearing goal fail-able, such as locked doors, barriers, terrain, weather, darkness, distance, noise, wards, traps, hazards, objects, or environmental pressure. A non-living object merely being acted on, damaged, taken, read, or moved is not a scene target by itself. PowerActors is strategic-only and can contain organizations/groups/institutions or potential power figures with credible means to affect {{user}} beyond acting alone in the moment; it never creates immediate rolls, NPCInScene, RelationshipEngine, B/F/H, injuries, or visible tracker entries by itself. ' +
        'Execute target identification in this order: first identify hostilesInScene.NPC as ALL established, present, living hostile entities in scene; then identify ActionTargets as every living NPC the latest user input directly addresses, speaks to, answers, asks, thanks, reassures, requests, warns, commands, helps, treats, touches, accompanies, trades with, gives something to, receives something from, attacks, restrains, deceives, negotiates with, or otherwise directly interacts with this turn, whether rollNeeded is true or false; then identify StealthTargets as the exact established, present, living detector or detectors whose detection {{user}} is explicitly trying to avoid while moving past, following, trailing, tailing, shadowing, hiding from, sneaking around, infiltrating, or observing without detection. StealthTargets is mutually exclusive with ActionTargets for the same NPC: a stealth-only detector must never be placed in ActionTargets. Ordinary following, movement, observation, concealment, or quietness without explicit avoidance-of-detection intent does not populate StealthTargets. Then identify NPCAwareOfUser as each individual living NPC who is present and directly notices, looks at, addresses, gestures to, reacts to, or otherwise individually interacts with {{user}}; then identify which targets, if any, directly oppose {{user}}\'s current action as OppTargets.NPC. If StealthTargets is non-empty, it is the authoritative detector list; the deterministic runner copies those exact living names into OppTargets.NPC, clears OppTargets.ENV, forces rollNeeded=true and challengeType=stealth, and does not imply NPCAwareOfUser. Terrain/darkness/cover/distance/crowds/weather/noise must not be OppTargets.ENV for a stealth contest. ActionTargets are the direct interaction list only and exclude mere following, trailing, observing, moving near, or trying to avoid detecting an NPC. If the latest user input directly addresses or directly affects a living NPC, that NPC belongs in ActionTargets even when the scene is ordinary continuity and OppTargets.NPC is ["(none)"], except when that same NPC is the dedicated StealthTarget. NPCAwareOfUser is individual-only: include an innkeeper who looks at {{user}}, but exclude patrons/crowds/groups/factions, unnamed plural background NPCs, inferred listeners, offscreen entities, and generic bystanders. Do not include bystanders, background crowds, inferred listeners, offscreen entities, or hostilesInScene-only NPCs in ActionTargets unless the latest user input directly involves them. hostilesInScene.NPC is a broad hostile pool and does not itself create relationship changes, rolls, NPCInScene entries, or OppTargets.NPC. A hostile is established only if present in assistant narration, tracker, character/scenario/lore context, or the initial test setup; do not create hostiles from the latest user input alone. Exclude friendly/neutral NPCs, absent/offscreen entities, incapacitated/dead enemies no longer posing danger, and non-living hazards/obstacles. Companion/ally commands are tactical requests only: they may address the companion as an ActionTarget and may name an established hostile for later companion crisis targeting, but do not treat the command as {{user}} making the companion act, do not force a companion attack, and do not create a user-resolved success/failure roll for companion obedience. If several hostiles exist and no specific hostile is named, do not guess. ' +
        'OppTargets.NPC is only for rollNeeded=true living opposition/resistance/contest against {{user}}\'s current action/challenge: directly opposing, contesting, resisting, blocking, defending against, acting as the detector/opponent when challengeType=stealth, or being attacked/challenged by {{user}}. If rollNeeded=false, OppTargets.NPC must be ["(none)"]. If a living ActionTarget meaningfully resists/opposes a rollNeeded action, that same NPC may also appear in OppTargets.NPC. Do not put every enemy in OppTargets.NPC merely because they are hostile; use hostilesInScene.NPC for the broader hostile pool. ' +
        'BenefitedObservers and HarmedObservers are living entities present in scene who are NOT already in ActionTargets, StealthTargets, or OppTargets.NPC. Do not put a direct target, stealth detector, or opposing NPC in observer lists. ' +
        'Identify ResolutionEngine.identifyTargets.PowerActors during target discovery: include any organization, institution, faction, crew, noble house, office, company, gang, cult, guild, military unit, recurring party/group, or potential power figure with credible means to affect {{user}} beyond acting alone in the moment: money, influence, authority, status, agents, staff, hired help, resources, institution/faction access, reputation, information, territory, magic, command, leverage, social reach, ownership, public prominence, or recurring access. Assess semantically, not by keywords or titles. A living NPC can appear in HarmedObservers/BenefitedObservers/ActionTargets/StealthTargets/OppTargets.NPC/NPCAwareOfUser for personal B/F/H and also appear in PowerActors for hidden strategic consequences. PowerActors never replace normal target/observer/awareness placement. ' +
        'Create one relationshipEngine entry for each living NPC in ActionTargets, StealthTargets, OppTargets.NPC, BenefitedObservers, HarmedObservers, or NPCAwareOfUser. This coverage is mandatory even when that same NPC is also in PowerActors or assessed as a PowerActorEnmity power actor. PowerActors and PowerActorEnmity never replace RelationshipEngine. Do not create entries for bystanders, hostilesInScene-only NPCs, PowerActors-only entities, groups/crowds, or inferred scene participants outside those target/observer/awareness lists. ' +
        'For each relationshipEngine NPC, assess standingInfluence from {{user}}\'s standing that specific NPC actually knows and recognizes relative to themselves. Use none when there is no meaningful recognized user-standing difference; aware when {{user}}\'s recognized title, authority, reputation, demonstrated power, backing, lineage, or affiliation changes etiquette, caution, risk, or openness without constraining the NPC; constrained only when {{user}}\'s recognized higher authority, status, power, backing, lineage, or affiliation limits what the NPC openly expresses or dares to do. A hierarchy in the opposite direction does not make the NPC constrained. Unknown, concealed, unsupported, or unrecognized status remains none with standingBasis=(none). Standing changes outward expression only and never changes B/F/H. ' +
        'For each living NPC in relationshipEngine, stakeChangeByOutcome must describe that NPC stakes change for each outcome: benefit means their stakes improve, harm means their stakes worsen, none means no meaningful stake change. For explicit boundary violations toward a direct/opposing NPC target, successful or landed outcomes worsen that NPC boundary/autonomy/trust stakes, so use harm and not none. ' +
        'If a named NPC is a primary target and tracker currentCoreStats are missing, classify that NPC CapabilityPool/MainStat from the full context and copy the same seed into ResolutionEngine genStats and the matching RelationshipEngine genStats. Use common/Balanced when capability or specialization is uncertain. ' +
        'When a named NPC needs missing stats, do not leave CapabilityPool or MainStat as none; use common/Balanced when evidence is uncertain. ' +
        'Apply stored user knowledge before RelationshipEngine initPreset only when it is authored/personal context, not broad public reputation. Fill UserKnowledgeApplication from the hidden User knowledge snapshot only when a stored personal entry plausibly applies to a present NPC/group or to the current scene. Personal knowledge applies only to the named knownBy NPC/group or a direct institutional/group match. ReputationKnowledge entries are contextOnly unless they are explicit authored pre-existing relationship context for this exact NPC/group; broad public reputation does not set priorUserGoodRep, userBadRep, or userNonHuman because deterministic fame/infamy handles public standing. effect=priorUserGoodRep only for explicit personal/authored favorable relationship knowledge; userBadRep only for explicit personal/authored negative relationship knowledge; userNonHuman only for explicit personal/authored fear-coded relationship knowledge or visible unnormalized nonhuman exposure; contextOnly for knowledge that informs narration but should not initialize B/F/H; none when no current application exists. Do not invent new reputation here; creation happens only in post-narration UserKnowledgeLedger and FameInfamyLedger. ' +
        'Detect user ability/spell attempts before target/risk classification: compare the latest user input against active {{user}}/persona abilities and spells, including the # ABILITIES and # SPELLS character sheet sections, assembled SillyTavern prompt stack, character persona/sheet, scenario, lore/world info, and chat context. Mark ResolutionEngine.userAbilityUse.Attempted=Y when the input explicitly names an ability/spell or implicitly describes attempting one through trigger, delivery method, or desired effect. Private delivery phrasing such as "meant only for X", "only X can hear", "whisper so only X hears", "send the words directly/private to X", or "speak into X alone" should match a persona ability/spell whose effect privately carries speech, sound, thought, or message to a target, even if the ability/spell name is not said. Mark Available=Y only if the attempted ability/spell exists in active {{user}} abilities or spells. Use the exact persona ability/spell name when available; otherwise name the attempted ability/effect concisely. Evidence is the user wording that signals the attempt. NarrativeEffect is the direct in-world effect the narrator must preserve when available, or the attempted effect that must not occur when unavailable. If Attempted=Y and Available=N, set NoEffectReason to why no ability/spell effect occurs. The extension derives Used from Attempted and Available and supplies the fixed flavor_only_no_bonus mechanical scope. If an available ability/spell is used to deliver a threat, persuasion, attack, escape, healing, or other contested goal, classify and roll the broader goal normally while keeping the ability/spell as delivery/flavor. ' +
        `${ITEM_USE_REFERENT_RULE} Return only Attempted and Item for itemUse. Do not add Available, Source, Evidence, or NoEffectReason; the extension resolves item presence, availability, source, evidence, and any unavailable-item consequence from authoritative saved state and current-scene facts after the semantic pass. ` +
        'Detect ResolutionEngine.lootSearch separately from itemUse. Mark Attempted=Y only when the latest input explicitly searches, loots, rummages through, checks, or examines a specific body, corpse, remains, or defeated target for carried/recoverable possessions. When that target matches a tracked NPC, Target MUST copy its exact current Tracker snapshot key without articles, death descriptors, possessives, body, corpse, or remains. Classify TargetKind as humanoid, monster, or other from established context. Do not decide whether the target is truly dead, what loot exists, its value, or whether it was searched before; deterministic code owns those decisions. Mark Attempted=N for area/container searches, merely looking at a target, taking an already-visible item, or searching a living NPC\'s possessions. ' +
        'Detect stakes-bearing factual claims before target/risk classification. Fill ResolutionEngine.claimCheck when {{user}} makes a factual claim to a specific NPC that could materially affect that NPC choice, trust, access, resources, authority, safety, emotional vulnerability, or immediate stakes. Compare the claim against established persona, tracker, chat, card, lore, scenario, and prompt-stack facts. Mark known_true only when explicitly supported, known_false only when explicitly contradicted, unsupported when material but not established, unknown when context cannot judge, and none when no relevant claim exists. NPCAccess is how much the target NPC can naturally verify or know the claim; it caps certainty but does not require omniscience. If a known_false or unsupported claim has StakesImpact=Y, classify it as social claim/deception against that living target and use CHA vs MND. Keep harmless or no-stakes claims as Present=N or StakesImpact=N. ' +
        'Separate user-authored internal prose from external action before ResolutionEngine classification. First-person introspection, internal monologue, memories, metaphors, self-questions, subjective sensations, emotional narration, and thought-only text are context only. They do not create actions, targets, rolls, wounds/status/condition, inventory/gear changes, location changes, or scene facts unless the same input also declares a concrete present external action, spoken dialogue, object/ability use, movement, attack, or interaction. When mixed, extract only concrete present external actions and spoken dialogue for identifyGoal, identifyChallenge, targets, challengeType, and actionUnits. ' +
        'Mandatory engine execution order for this semantic pass: read the Engine reference above, then execute only the semantic/contextual portions of the engines. ' +
        'Execute ResolutionEngine(input) semantic functions in order: identifyGoal, identifyChallenge, userAbilityUse, itemUse, lootSearch, claimCheck, intimacyAdvanceExplicit, restraintControl, boundaryPressure, boundaryBreak, rollNeeded, rollReason, challengeType, socialTactic, identifyTargets, activeHostileThreat, harmMode, actionUnits, environmentDifficultyTier, genStats. boundaryBreak must read only the Pending boundary snapshot; if pendingBoundary.active is false, boundaryBreak.Present=N. When Present=Y, the extension supplies the exact stored boundary identity after the semantic decision. Write the remaining decisions to their canonical resolutionEngine schema properties. ' +
        'Do not roll dice, retrieve user stats, retrieve NPC stats, assign numeric NPC stats, calculate margins, landed actions, counter potential, or outcomes; deterministic code handles those after your ledger. ' +
        'Execute UserKnowledgeApplication after target discovery and before RelationshipEngine. Read only the hidden User knowledge snapshot JSON and current context. Add one object to userKnowledgeApplication.applications for each personal/authored knowledge entry that materially applies to the current scene, present NPC, or group; otherwise userKnowledgeApplication.applications must be []. This is application only: do not create, update, spread, rewrite stored knowledge, or turn broad public reputation into initPreset flags in preflight. ' +
        'Execute RelationshipEngine(npc, resolutionPacket) semantic functions in order for each target/observer/awareness living NPC: current state context, aggressionMethod/aggressionMethodEvidence, standingInfluence/standingBasis, initPreset tag selection, auditInteraction/exceptionalBenefit/exceptionalBenefitScale/exceptionalBenefitEvidence/stakeChangeByOutcome, route context flags, checkThreshold override flags, establishedRelationship, slowBondEvidence, genStats. aggressionMethod is semantic classification only: classify ongoing or immediately possible NPC aggression from established current action, equipment, natural weapons, abilities, background, knowledge, and practiced skills; use physical when aggression is possible but no supernatural method is established, and never choose from numeric stat order. Deterministic code maps physical to PHY and supernatural to MND for proactive attacks, counterattacks, retaliation, companion attacks, and companion counters. For standing, use all available context but count only {{user}}\'s status that this specific NPC knows and recognizes relative to themselves; unknown or concealed status is none/(none), and constrained applies only when {{user}}\'s standing constrains this NPC rather than the reverse. For initPreset, use all available context in the assembled SillyTavern prompt stack, character card, persona name/text, scenario, lore/world info, tracker snapshot, and chat history, but output only the semantic Y/N tags; deterministic code maps those tags to B/F/H. For checkThreshold override flags, also use all available context; mark CurrentInvitation when the NPC clearly offers, requests, invites, strongly implies, accepts, agrees to, arranges, or physically initiates sexual/intimate escalation with {{user}} in the current or immediately recent scene and has not withdrawn/refused/panicked/been interrupted. This includes the NPC accepting {{user}}\'s explicit sexual/intimate proposal, agreeing to join, inviting or calling another willing participant, or saying yes to coming over for sex/intimacy. Mark RomanticBuildup only when a B4 close-bond scene has consistently and mutually built toward romantic/intimate escalation with receptive NPC behavior, no active refusal/withdrawal/fear/hostility/coercion/danger/public interruption/boundary limit, and {{user}}\'s latest intimate advance is a natural continuation; ordinary friendliness, tenderness, warmth, one smile, casual flirting, vague chemistry, or user-only escalation is not enough. Mark Exploitation when explicit card/lore/history says the NPC is naive, easily led/persuaded, follows {{user}}\'s lead without question, dependent, trapped, coerced, powerless, unsafely sheltered, or otherwise exploitable by {{user}} or the current situation. Do not treat active combat/hostility as an initPreset by itself. Do not use establishedRelationship as an initPreset tag; establishedRelationship remains its separate relationship-state mechanic. Write those decisions to the corresponding canonical relationshipEngine object. ' +
        'Execute InjuryEffectEngine after ResolutionEngine and RelationshipEngine: identify only actual injury/status-effect candidates that the user action would cause if it lands. The semantic pass decides target, effectType, affected body/function, persistence, and whether it affects action from context; deterministic mechanics later decide whether it lands and the final impairment severity. Source does not matter: physical attacks, magic, poison, paralysis, fear/panic, restraint, disease, burns, lightning/electrical effects, curses, exhaustion, mental status, and other ongoing impairing effects all qualify when they would impair later action. Mere emotional/social harm, witnessing harm to someone else, fear as ordinary emotion without an impairing status, momentary pain, impact, knockdown, or a requested/intended future injury does not qualify. ' +
        'Then fill CHAOS_INTERRUPT.sceneSummary from its engine/contextual requirements. Name pools are deterministic runtime data and not part of this semantic pass; do not generate name candidates or output name fields. ' +
        'Execute PowerActorEnmity as hidden strategic consequence detection after RelationshipEngine. First fill PowerActorAssessment audit properties for all power candidates, whether or not an enmity effect exists: ResolutionEngine.identifyTargets.PowerActors, the active character/card actor when relevant, named scene NPCs with credible reach, target/observer NPCs with credible reach, and affected organizations/groups behind those NPCs. Assess semantically, not by keywords or titles. A power actor is any organization, institution, faction, crew, noble house, office, company, gang, cult, guild, military unit, recurring party/group, or potential power figure with credible means to affect {{user}} beyond acting alone in the moment: money, influence, authority, status, agents, staff, hired help, resources, institution/faction access, reputation, information, territory, magic, command, leverage, social reach, ownership, public prominence, or recurring access. Explicit prominence, wealth, rank, office, ownership, command, fame, backing, network access, unusual resources, or a role that plausibly controls access/services/people is enough for a Y assessment unless context clearly limits them to ordinary personal reaction. A prominent local figure should be assessed as a potential power actor because prominence implies reach, reputation, access, or influence; an ordinary person with no stated reach is not. PowerActorAssessment is audit-only and never creates enmity. Do not create power-actor enmity for ordinary individuals who can only personally react; they belong only in NPC B/F/H. Add a PowerActorEnmity candidate when the latest user input would, if completed, meaningfully thwart, expose, harm assets of, steal from, publicly humiliate, help an enemy of, disrupt an operation of, kill/capture people of, or damage reputation/income of a power actor AND the actor is present, witnesses it, is informed, or has a concrete ordinary discovery/attribution path to {{user}}. Do not decide whether a rolled action succeeds; deterministic code applies the candidate only when the resolved action succeeds or lands. No-roll entries require an explicitly completed effect. Offscreen asset harm with no witness, report, evidence, confession, attribution, or discovery path creates no enmity this turn. Mark knownToActor=Y only for that concrete knowledge path. Use severity minor/meaningful/major; if no valid power actor effect exists, powerActorEnmity.effects must be []. This semantic section is hidden memory only, not visible tracker text. ' +
        'Within PowerActorEnmity, fill latentGrievances only for substantial unresolved harm against a currently ordinary target with no established Power Actor link. Fill affiliationLinks only by copying an exact hidden latent grievance id and citing an explicit established affiliation plus a concrete Power Actor knowledge/discovery path; do not repeat the grievance target or assessment-derived actor metadata. Fill latentFavors only for substantial completed uncompensated help beyond expected duty to a currently ordinary target with no established Power Actor link; routine, paid, contracted, promised-reward, or expected work never qualifies. Fill favorAffiliationLinks only from an exact hidden favor id with explicit affiliation and actor-knowledge paths; do not repeat the favor target or assessment-derived actor metadata. Also determine whether the affiliation is already user-known and whether one favorable approach fits the present scene. Deterministic code authorizes at most one opportunity; post-narration verification alone consumes a visibly presented favor. ' +
        'Execute PowerEventShape after PowerActorEnmity. Read the Power actor snapshot JSON for hidden pendingEvent and activeAgent state. If no pendingEvent exists, powerEventShape.events must be []. The pending event type is deterministic and immutable; do not choose, replace, or output an event type. If a pendingEvent exists, shape only that pending event into a compact visible scene instruction or defer/drop it. fit=use_now only when the event can enter the current scene naturally through visible circumstances, ordinary NPC behavior, available routes, messages, trouble, obstruction, or local consequences. fit=defer when scene fit is poor. fit=drop when it contradicts established visible facts. visibleInstruction is for the final narrator but must contain only surface facts. Do not include hidden explanation, sponsor/allegiance, motive labels, secret plan labels, or the words spy, agent, infiltrator, sponsor, handler, hidden motive, hidden allegiance, secret orders, betrayal, plant, or covert operative. For plant_contact, use the provided contactName when available and make the person look like an ordinary plausible scene contact; do not say why they are there. For agent_* events, refer to activeAgent by name as an ordinary established NPC and describe only the visible suggestion, report opportunity, delay, misdirection, or practical setback. ' +
        'Execute TrackerUpdateEngine as explicit-only persistent tracker deltas after RelationshipEngine. TrackerUpdateEngine is for display/state memory only, not outcome resolution. ' +
        'TrackerUpdateEngine.User records only explicit changes to the player condition, wounds, status effects, gear, inventory, tasks, and commitments. Currency is post-narration-owned and is not part of the semantic preflight object. TrackerUpdateEngine.NPC records only explicit changes to tracked or directly affected NPC condition, wounds, status effects, visible gear, and concise stable personality summaries. NPC inventory and currency changes are finalized only by the post-narration tracker after FINAL_NARRATION establishes them. ' +
        'TrackerUpdateEngine.BoundCompanionState reads the full assembled context, not only persona: active prompt stack, character card, persona/sheet, abilities, scenario, lore/world info, tracker snapshot, bound companion snapshot, and chat history. Set status=active only when explicit established context says an inner companion, possession, shared vessel, intelligent item/weapon, bound spirit/artifact, or implant is already active/completed/accepted and can communicate with {{user}} internally or through a carried item. Set status=inactive only when an established companion is explicitly severed, dismissed, removed, permanently silenced, or destroyed. Use status=unchanged when the bound companion snapshot is already active and the current context does not explicitly change it. Also use status=unchanged for pending offers, invitations, unaccepted bargains, incomplete rituals, proposals, unclear voices, dreams, hallucination ambiguity, metaphor, rumor, or no explicit change. Do not invent a companion. TrackerUpdateEngine.PendingBoundaryState is post-narration-owned and omitted from semantic preflight; the extension supplies its neutral unchanged delta. ' +
        'Use condition=unchanged unless the latest user input or immediate visible context explicitly establishes a completed/current health state as healthy, bruised, wounded, badly_wounded, critical, incapacitated, or dead. Use incapacitated for explicit nonlethal outcomes where the character is alive but cannot meaningfully act. Do not set condition from a desired/requested future injury or from an attempted action before narration confirms the result. ' +
        'Use Add only for explicit gains/new injuries/new effects/new obligations. Use Remove only for explicit dropping, spending, losing, completing, canceling, failing, or abandoning. Remove wounds/status only when the text explicitly says the injury or status is healed, cured, recovered, restored, regenerated, magically healed, knitted closed, gone, or no longer impairing. Bandaging, splinting, dressing, cleaning, stitching, stabilizing, normal care, or starting treatment does not remove injuries unless the text also says the injury/status is gone, healed, cured, fully recovered, or no longer impairing. Never infer unchanged lists from silence and never output a full replacement list. ' +
        'Do not output user currency deltas in semantic preflight. Currency spending/gain, price quotes, and pending-price payment confirmation are handled only by the post-narration tracker pass after FINAL_NARRATION exists. ' +
        'Do not mark wounds/status/condition from requested, intended, commanded, allowed, promised, predicted, pending attempted actions, remembered events, metaphors, internal sensations, hypotheticals, uncertainty, self-questions, or subjective self-description before deterministic resolution; only track state already explicit as current/completed in context. ' +
        'Do not track momentary pain, impact, knockdown, stagger, breath loss, winded reaction, or temporary shock as wounds/status/condition unless an ongoing injury or continuing status is explicitly stated. ' +
        'For TrackerUpdateEngine NPC revealedName, use semantic identity resolution: when final narration reveals that an existing tracked generic NPC/person/role is named, keep NPC as the existing tracker label and write revealedName as the proper name. This is for renaming generic entries such as bystander, man, stranger, guard, raider, or Unknown Woman once their name is revealed. If several tracked generic NPCs could match and the narration does not clearly identify which one, use (none). For NPC personalitySummary, use stable personality memory only. If this is first meaningful tracking or the current summary is empty, write a compact natural-language seed when explicit card/context or the scene reveals enduring temperament or interaction style. Use internal glossary patterns only as behavior guidance; never output raw internal labels such as deredere, tsundere, yandere, kuudere, dandere, himedere, oujidere, kamidere, mayadere, sadodere, hiyakasudere, hajidere, bakadere, erodere, dorodere, shundere, undere, goudere, kanedere, or byoukidere. Preferred format: temperament: ...; speech: ...; interaction: ...; intensity:low|medium|high. Speech and interaction should carry most uniqueness. If an NPC already has a summary, leave unchanged unless durable evidence clearly refines it. Do not summarize mood, attraction, relationship score, fear/hostility, injuries, or temporary reactions. Personality internal pattern glossary: ' + PERSONALITY_ARCHETYPE_GLOSSARY.replace(/\n/g, ' ') + ' ' +
        'NPC proactivity cap is deterministic; do not output semantic lines for it. ' +
        'Tie rule override: exact roll ties are cinematic stalemates/struggles, not defender wins; include stakeChangeByOutcome.struggle accordingly. ' +
        'Do not use deterministic outcomes, dice, or guesses to change semantic stakes. ' +
        'The ITEM_USE_REFERENT_RULE is authoritative. The model decides only whether a direct concrete item interaction was attempted and which item it names; the extension decides source and item-dependent gating. Leave unrelated actions, dialogue, movement, targets, and relationships independent. ' +
        'Important classification reminders: Romantic, flirtatious, affectionate, suggestive, sexual, or intimate conversation/contact is not a special roll category and does not create stakes by itself. intimacyAdvanceExplicit is strict permission/boundary classification for actual intimate escalation only: mark it true for explicit kissing, sexual touch, undressing toward intimacy, asking to sleep together/have sex, or accepting a prior explicit NPC intimacy invitation; keep it false for flirting, teasing, vague innuendo, compliments, declarations of love, dates, hand-holding, ordinary affection, or "what did you have in mind" style banter. boundaryBreak is not prediction; mark it true only when hidden tracker pendingBoundary exists and the latest user input continues/escalates/ignores that boundary. User intent is explicit-only: identifyGoal and identifyChallenge must use only the latest user-declared action, request, target, and explicit objective; do not infer unstated goals from NPC fear, hostility, suspicion, likely reaction, context, or what an NPC might assume. Do not carry forward a prior social goal as the current goal after it already failed or resolved; post-failure phrases such as accepting refusal, declaring consequence, or escalating toward violence are aftermath/escalation unless the latest input explicitly creates a new non-social contest or a materially different tactic. challengeType is classification only: social/diplomacy for good-faith persuasion or negotiation, social/bluff for deception or material false claims, social/intimidate for threats/coercion/fear demands, mundane_combat or supernatural_combat for direct hostile bodily/weapon/natural-weapon/magical attacks that can injure, restraint for deterministic restraint contests, stealth for avoiding a specific established living detector, and environment for physical/environmental obstacles, escape, chase/pursuit, locks, traps, terrain, weather, barriers, hazards, or non-living opposition. restraintControl and boundaryPressure identify restraint/object/space/departure pressure; they do not decide dice or relationship effects. challengeType=stealth requires the specific detector or detectors to appear in StealthTargets and OppTargets.NPC, never in ActionTargets solely because they are being avoided; if no such detector/opponent exists, use challengeType=none unless a separate non-stealth obstacle creates stakes. Terrain, darkness, cover, distance, crowds, weather, and noise are scene conditions, not stealth opposition. Do not choose stats, dice, bonuses, margins, or outcomes. For each living NPC, mark stakeChangeByOutcome for each possible outcome strictly by RelationshipEngine DEF.STAKE_CHANGE: benefit only if that outcome significantly and concretely improves their stakes; harm if it materially worsens their stakes; otherwise none. Do not mark benefit for compliments, flirting, mood improvement, politeness, ordinary conversation, user self-advancement, successful negotiation for the user, choosing not to harm the NPC, failing to harm the NPC, de-escalation without a concrete NPC gain, or the NPC merely surviving/remaining safe.\n\n' +
        SEMANTIC_FIELD_GUIDANCE;
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
        const match = source.match(new RegExp(`\\b${stat}\\s*[:=\\-]?\\s*(1[0-5]|[1-9])\\b`, 'i'));
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

function normalizeInlineProxyInstructions(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map(item => String(item ?? '').trim())
        .filter(Boolean)
        .slice(0, 5);
}

function formatInlineProxyInstructionsForSemantic(instructions) {
    return normalizeInlineProxyInstructions(instructions)
        .map((instruction, index) => `${index + 1}. "${clip(instruction, 300)}"`)
        .join(' ');
}

function stripStructuredDebug(text) {
    return String(text ?? '')
        .replace(/````text\s*&lt;pre_flight&gt;[\s\S]*?&lt;\/pre_flight&gt;\s*````\s*/g, '')
        .replace(/````text\s*<narrator_prompt_context_echo>[\s\S]*?<\/narrator_prompt_context_echo>\s*````\s*/g, '')
        .replace(/<pre_flight>[\s\S]*?<\/pre_flight>\s*/g, '')
        .replace(/<narrator_prompt_context_echo>[\s\S]*?<\/narrator_prompt_context_echo>\s*/g, '');
}

function parseSemanticLedger(raw) {
    if (raw && typeof raw === 'object' && hasLedgerShape(raw)) return raw;
    throw new Error(`Semantic pass did not return a complete structured ledger. RawPreview=${previewRaw(raw)}`);
}

function collectGeneratedTextCandidates(raw) {
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
    if (!ledger?.worldTransition) missing.push('worldTransition');
    if (typeof ledger?.worldTransition?.requiresSuccess !== 'boolean') missing.push('worldTransition.requiresSuccess:boolean');
    if (!ledger?.worldProgression) missing.push('worldProgression');
    if (!Array.isArray(ledger?.worldProgression?.advancements)) missing.push('worldProgression.advancements');
    if (!ledger?.resolutionEngine) missing.push('resolutionEngine');
    if (!ledger?.resolutionEngine?.identifyGoal) missing.push('resolutionEngine.identifyGoal');
    if (!ledger?.resolutionEngine?.identifyChallenge) missing.push('resolutionEngine.identifyChallenge');
    if (!ledger?.resolutionEngine?.userAbilityUse) missing.push('resolutionEngine.userAbilityUse');
    if (typeof ledger?.resolutionEngine?.userAbilityUse?.attempted !== 'boolean') missing.push('resolutionEngine.userAbilityUse.attempted:boolean');
    if (typeof ledger?.resolutionEngine?.userAbilityUse?.available !== 'boolean') missing.push('resolutionEngine.userAbilityUse.available:boolean');
    if (!ledger?.resolutionEngine?.itemUse) missing.push('resolutionEngine.itemUse');
    if (typeof ledger?.resolutionEngine?.itemUse?.attempted !== 'boolean') missing.push('resolutionEngine.itemUse.attempted:boolean');
    if (!ledger?.resolutionEngine?.lootSearch) missing.push('resolutionEngine.lootSearch');
    if (typeof ledger?.resolutionEngine?.lootSearch?.attempted !== 'boolean') missing.push('resolutionEngine.lootSearch.attempted:boolean');
    if (!LOOT_TARGET_KINDS.includes(ledger?.resolutionEngine?.lootSearch?.targetKind)) missing.push('resolutionEngine.lootSearch.targetKind');
    if (!ledger?.resolutionEngine?.claimCheck) missing.push('resolutionEngine.claimCheck');
    if (typeof ledger?.resolutionEngine?.claimCheck?.present !== 'boolean') missing.push('resolutionEngine.claimCheck.present:boolean');
    if (typeof ledger?.resolutionEngine?.claimCheck?.stakesImpact !== 'boolean') missing.push('resolutionEngine.claimCheck.stakesImpact:boolean');
    if (!CLAIM_TRUTH_STATUSES.includes(ledger?.resolutionEngine?.claimCheck?.truthStatus)) missing.push('resolutionEngine.claimCheck.truthStatus');
    if (!CLAIM_NPC_ACCESS_LEVELS.includes(ledger?.resolutionEngine?.claimCheck?.npcAccess)) missing.push('resolutionEngine.claimCheck.npcAccess');
    if (!ledger?.resolutionEngine?.identifyTargets) missing.push('resolutionEngine.identifyTargets');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.hostilesInScene?.NPC)) missing.push('resolutionEngine.identifyTargets.hostilesInScene.NPC');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.ActionTargets)) missing.push('resolutionEngine.identifyTargets.ActionTargets');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.StealthTargets)) missing.push('resolutionEngine.identifyTargets.StealthTargets');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.OppTargets?.NPC)) missing.push('resolutionEngine.identifyTargets.OppTargets.NPC');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.OppTargets?.ENV)) missing.push('resolutionEngine.identifyTargets.OppTargets.ENV');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.BenefitedObservers)) missing.push('resolutionEngine.identifyTargets.BenefitedObservers');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.HarmedObservers)) missing.push('resolutionEngine.identifyTargets.HarmedObservers');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.NPCAwareOfUser)) missing.push('resolutionEngine.identifyTargets.NPCAwareOfUser');
    if (ledger?.resolutionEngine?.identifyTargets?.PowerActors != null && !Array.isArray(ledger.resolutionEngine.identifyTargets.PowerActors)) missing.push('resolutionEngine.identifyTargets.PowerActors');
    if (typeof ledger?.resolutionEngine?.rollNeeded !== 'boolean') missing.push('resolutionEngine.rollNeeded:boolean');
    if (!ledger?.resolutionEngine?.rollReason) missing.push('resolutionEngine.rollReason');
    if (!CHALLENGE_TYPES.includes(ledger?.resolutionEngine?.challengeType)) missing.push('resolutionEngine.challengeType');
    if (!ledger?.resolutionEngine?.challengeTypeEvidence) missing.push('resolutionEngine.challengeTypeEvidence');
    if (!SOCIAL_TACTICS.includes(ledger?.resolutionEngine?.socialTactic)) missing.push('resolutionEngine.socialTactic');
    if (!HARM_MODES.includes(ledger?.resolutionEngine?.harmMode)) missing.push('resolutionEngine.harmMode');
    validateBoundaryObjects(ledger?.resolutionEngine, missing);
    if (!Array.isArray(ledger?.resolutionEngine?.actionUnits)) missing.push('resolutionEngine.actionUnits');
    if (!ENVIRONMENT_DIFFICULTY_TIERS.includes(ledger?.resolutionEngine?.environmentDifficultyTier)) missing.push('resolutionEngine.environmentDifficultyTier');
    if (typeof ledger?.resolutionEngine?.activeHostileThreat !== 'boolean') missing.push('resolutionEngine.activeHostileThreat:boolean');
    if (Object.prototype.hasOwnProperty.call(ledger?.resolutionEngine || {}, 'primaryOppTarget')) missing.push('forbidden extra field resolutionEngine.primaryOppTarget');
    if (Object.prototype.hasOwnProperty.call(ledger?.resolutionEngine || {}, 'primaryOpposition')) missing.push('forbidden extra field resolutionEngine.primaryOpposition');
    if (!Array.isArray(ledger?.relationshipEngine)) missing.push('relationshipEngine');
    for (const [index, item] of (Array.isArray(ledger?.relationshipEngine) ? ledger.relationshipEngine : []).entries()) {
        const aggressionMethod = cleanScalar(item?.aggressionMethod).toLowerCase();
        const aggressionMethodEvidence = cleanScalar(item?.aggressionMethodEvidence);
        if (!AGGRESSION_METHODS.includes(aggressionMethod)) missing.push(`relationshipEngine[${index}].aggressionMethod`);
        if (!aggressionMethodEvidence) missing.push(`relationshipEngine[${index}].aggressionMethodEvidence`);
        const influence = cleanScalar(item?.standingInfluence).toLowerCase();
        const basis = cleanScalar(item?.standingBasis);
        if (!STANDING_INFLUENCES.includes(influence)) missing.push(`relationshipEngine[${index}].standingInfluence`);
        if (!basis || (influence !== 'none' && isNoneValue(basis))) missing.push(`relationshipEngine[${index}].standingBasis`);
    }
    if (!ledger?.injuryEffectEngine) missing.push('injuryEffectEngine');
    if (!Array.isArray(ledger?.injuryEffectEngine?.effects)) missing.push('injuryEffectEngine.effects');
    if (!ledger?.userKnowledgeApplication) missing.push('userKnowledgeApplication');
    if (!Array.isArray(ledger?.userKnowledgeApplication?.applications)) missing.push('userKnowledgeApplication.applications');
    if (!ledger?.powerActorEnmity) missing.push('powerActorEnmity');
    if (!Array.isArray(ledger?.powerActorEnmity?.assessments)) missing.push('powerActorEnmity.assessments');
    if (!Array.isArray(ledger?.powerActorEnmity?.effects)) missing.push('powerActorEnmity.effects');
    if (!Array.isArray(ledger?.powerActorEnmity?.latentGrievances)) missing.push('powerActorEnmity.latentGrievances');
    if (!Array.isArray(ledger?.powerActorEnmity?.affiliationLinks)) missing.push('powerActorEnmity.affiliationLinks');
    if (!Array.isArray(ledger?.powerActorEnmity?.latentFavors)) missing.push('powerActorEnmity.latentFavors');
    if (!Array.isArray(ledger?.powerActorEnmity?.favorAffiliationLinks)) missing.push('powerActorEnmity.favorAffiliationLinks');
    if (!ledger?.powerEventShape) missing.push('powerEventShape');
    if (!Array.isArray(ledger?.powerEventShape?.events)) missing.push('powerEventShape.events');
    if (!ledger?.trackerUpdateEngine) missing.push('trackerUpdateEngine');
    if (!ledger?.trackerUpdateEngine?.user) missing.push('trackerUpdateEngine.user');
    if (!Array.isArray(ledger?.trackerUpdateEngine?.npcs)) missing.push('trackerUpdateEngine.npcs');
    if (!ledger?.trackerUpdateEngine?.boundCompanion) missing.push('trackerUpdateEngine.boundCompanion');
    if (!ledger?.chaosSemantic) missing.push('chaosSemantic');
    if (missing.length) {
        throw new Error(`Mandatory semantic ledger contract failed; response invalid. Missing/invalid fields (${missing.join(', ')}): ${collectGeneratedTextCandidates(raw).join('\n').slice(0, 240)}`);
    }
}

function parseNarratorTrackerDeltaText(text) {
    const source = String(text || '');
    const match = source.match(new RegExp(`${TRACKER_DELTA_START}([\\s\\S]*?)${TRACKER_DELTA_END}`, 'i'));
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

    const trackerNpcCount = clampNumber(readNumber(fields, 'TrackerUpdateEngine.NPC.count', 0), 0, 12);
    const personalCount = clampNumber(readNumber(fields, 'UserKnowledgeLedger.personal.count', 0), 0, 20);
    const reputationCount = clampNumber(readNumber(fields, 'UserKnowledgeLedger.reputation.count', 0), 0, 20);
    const fameInfamyCount = clampNumber(readNumber(fields, 'FameInfamyLedger.count', 0), 0, 2);
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
        'TrackerUpdateEngine.User.currencyAdd',
        'TrackerUpdateEngine.User.currencyRemove',
        'EconomyState.payPendingPrice',
        'EconomyState.pendingPriceAmount',
        'EconomyState.pendingPriceItem',
        'EconomyState.pendingPricePayee',
        'EconomyState.pendingPriceEvidence',
        'EconomyState.clearPendingPrice',
        'TrackerUpdateEngine.User.tasksAdd',
        'TrackerUpdateEngine.User.tasksRemove',
        'TrackerUpdateEngine.User.commitmentsAdd',
        'TrackerUpdateEngine.User.commitmentsRemove',
        'TrackerUpdateEngine.NPC.count',
        'UserKnowledgeLedger.personal.count',
        'UserKnowledgeLedger.reputation.count',
        'FameInfamyLedger.count',
        'WorldStateDelta.reputationLocation',
        'WorldStateDelta.place',
        'WorldStateDelta.area',
        'WorldStateDelta.indoors',
        'WorldStateDelta.timeAdvance',
        'WorldStateDelta.timeOfDay',
        'WorldStateDelta.weatherCondition',
        'WorldStateDelta.weatherTick',
        'BoundCompanionState.status',
        'BoundCompanionState.name',
        'BoundCompanionState.type',
        'BoundCompanionState.vessel',
        'BoundCompanionState.voice',
        'BoundCompanionState.evidence',
        'PendingBoundaryState.status',
        'PendingBoundaryState.boundaryId',
        'PendingBoundaryState.targetNPC',
        'PendingBoundaryState.type',
        'PendingBoundaryState.objectOrAccess',
        'PendingBoundaryState.evidence',
        'LatentFavorPresentation.favorId',
        'LatentFavorPresentation.evidence',
    ];
    for (let index = 0; index < trackerNpcCount; index += 1) {
        const prefix = `TrackerUpdateEngine.NPC[${index}]`;
        required.push(...['NPC', 'revealedName', 'personalitySummary', ...TRACKER_NPC_PROFILE_FIELDS, 'condition', ...TRACKER_NARRATOR_NPC_DELTA_FIELDS]
            .map(field => `${prefix}.${field}`));
    }
    for (let index = 0; index < personalCount; index += 1) {
        const prefix = `UserKnowledgeLedger.personal[${index}]`;
        required.push(...['knownBy', 'scope', 'topic', 'truth', 'confidence', 'line', 'reason']
            .map(field => `${prefix}.${field}`));
    }
    for (let index = 0; index < reputationCount; index += 1) {
        const prefix = `UserKnowledgeLedger.reputation[${index}]`;
        required.push(...['scope', 'valence', 'topic', 'truth', 'confidence', 'line', 'origin', 'reason']
            .map(field => `${prefix}.${field}`));
    }
    for (let index = 0; index < fameInfamyCount; index += 1) {
        const prefix = `FameInfamyLedger[${index}]`;
        required.push(...['location', 'fameDelta', 'infamyDelta', 'reason', 'evidence']
            .map(field => `${prefix}.${field}`));
    }
    const missing = required.filter(key => !fields.has(key));
    if (missing.length) throw new Error(`tracker delta block missing required lines: ${missing.join(', ')}`);

    const user = {
        condition: normalizeTrackerDeltaCondition(fields.get('TrackerUpdateEngine.User.condition')),
        woundsAdd: readTrackerList(fields, 'TrackerUpdateEngine.User.woundsAdd'),
        woundsRemove: readTrackerList(fields, 'TrackerUpdateEngine.User.woundsRemove'),
        statusAdd: readTrackerList(fields, 'TrackerUpdateEngine.User.statusAdd'),
        statusRemove: readTrackerList(fields, 'TrackerUpdateEngine.User.statusRemove'),
        gearAdd: readTrackerList(fields, 'TrackerUpdateEngine.User.gearAdd'),
        gearRemove: readTrackerList(fields, 'TrackerUpdateEngine.User.gearRemove'),
        inventoryAdd: readTrackerList(fields, 'TrackerUpdateEngine.User.inventoryAdd'),
        inventoryRemove: readTrackerList(fields, 'TrackerUpdateEngine.User.inventoryRemove'),
        currencyAdd: readTrackerList(fields, 'TrackerUpdateEngine.User.currencyAdd'),
        currencyRemove: readTrackerList(fields, 'TrackerUpdateEngine.User.currencyRemove'),
        tasksAdd: readTrackerList(fields, 'TrackerUpdateEngine.User.tasksAdd'),
        tasksRemove: readTrackerList(fields, 'TrackerUpdateEngine.User.tasksRemove'),
        commitmentsAdd: readTrackerList(fields, 'TrackerUpdateEngine.User.commitmentsAdd'),
        commitmentsRemove: readTrackerList(fields, 'TrackerUpdateEngine.User.commitmentsRemove'),
    };
    const sceneItems = {
        add: readTrackerList(fields, 'SceneItemState.add'),
        remove: readTrackerList(fields, 'SceneItemState.remove'),
        provided: fields.has('SceneItemState.add') || fields.has('SceneItemState.remove'),
    };
    const economy = normalizeEconomyDelta({
        payPendingPrice: fields.get('EconomyState.payPendingPrice'),
        clearPendingPrice: fields.get('EconomyState.clearPendingPrice'),
        pendingPrice: {
            amount: normalizeCurrencyList([fields.get('EconomyState.pendingPriceAmount')])[0] || '',
            item: fields.get('EconomyState.pendingPriceItem'),
            payee: fields.get('EconomyState.pendingPricePayee'),
            evidence: fields.get('EconomyState.pendingPriceEvidence'),
        },
    });

    const npcs = [];
    for (let index = 0; index < trackerNpcCount; index += 1) {
        const prefix = `TrackerUpdateEngine.NPC[${index}]`;
        const npc = cleanScalar(fields.get(`${prefix}.NPC`));
        if (!npc || isNoneValue(npc)) continue;
        npcs.push({
            NPC: npc,
            revealedName: normalizeRevealedName(fields.get(`${prefix}.revealedName`)),
            personalitySummary: normalizePersonalitySummary(fields.get(`${prefix}.personalitySummary`)),
            background: normalizeNpcCapabilityField(fields.get(`${prefix}.background`)),
            knowledge: normalizeNpcCapabilityField(fields.get(`${prefix}.knowledge`)),
            practicedSkills: normalizeNpcCapabilityField(fields.get(`${prefix}.practicedSkills`)),
            condition: normalizeTrackerDeltaCondition(fields.get(`${prefix}.condition`)),
            woundsAdd: readTrackerList(fields, `${prefix}.woundsAdd`),
            woundsRemove: readTrackerList(fields, `${prefix}.woundsRemove`),
            statusAdd: readTrackerList(fields, `${prefix}.statusAdd`),
            statusRemove: readTrackerList(fields, `${prefix}.statusRemove`),
            gearAdd: readTrackerList(fields, `${prefix}.gearAdd`),
            gearRemove: readTrackerList(fields, `${prefix}.gearRemove`),
            inventoryAdd: readTrackerList(fields, `${prefix}.inventoryAdd`),
            inventoryRemove: readTrackerList(fields, `${prefix}.inventoryRemove`),
            currencyAdd: readTrackerList(fields, `${prefix}.currencyAdd`),
            currencyRemove: readTrackerList(fields, `${prefix}.currencyRemove`),
        });
    }

    const userKnowledge = { personal: [], reputation: [] };
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

    const userReputation = { events: [] };
    for (let index = 0; index < fameInfamyCount; index += 1) {
        const prefix = `FameInfamyLedger[${index}]`;
        const entry = normalizeFameInfamyDeltaEntry({
            location: fields.get(`${prefix}.location`),
            fameDelta: fields.get(`${prefix}.fameDelta`),
            infamyDelta: fields.get(`${prefix}.infamyDelta`),
            reason: fields.get(`${prefix}.reason`),
            evidence: fields.get(`${prefix}.evidence`),
        });
        if (entry) userReputation.events.push(entry);
    }

    const worldState = normalizeWorldStateDelta({
        reputationLocation: fields.get('WorldStateDelta.reputationLocation'),
        place: fields.get('WorldStateDelta.place'),
        area: fields.get('WorldStateDelta.area'),
        indoors: fields.get('WorldStateDelta.indoors'),
        timeAdvance: fields.get('WorldStateDelta.timeAdvance'),
        timeAdvanceCount: fields.get('WorldStateDelta.timeAdvanceCount'),
        timeOfDay: fields.get('WorldStateDelta.timeOfDay'),
        weatherCondition: fields.get('WorldStateDelta.weatherCondition'),
        weatherTick: fields.get('WorldStateDelta.weatherTick'),
    });
    const boundCompanion = normalizeBoundCompanionDelta({
        status: fields.get('BoundCompanionState.status'),
        name: fields.get('BoundCompanionState.name'),
        type: fields.get('BoundCompanionState.type'),
        vessel: fields.get('BoundCompanionState.vessel'),
        voice: fields.get('BoundCompanionState.voice'),
        evidence: fields.get('BoundCompanionState.evidence'),
    });
    const pendingBoundary = normalizePendingBoundaryDelta({
        status: fields.get('PendingBoundaryState.status'),
        boundaryId: fields.get('PendingBoundaryState.boundaryId'),
        targetNPC: fields.get('PendingBoundaryState.targetNPC'),
        type: fields.get('PendingBoundaryState.type'),
        objectOrAccess: fields.get('PendingBoundaryState.objectOrAccess'),
        evidence: fields.get('PendingBoundaryState.evidence'),
    });

    const latentFavorPresentation = normalizeLatentFavorPresentation({
        favorId: fields.get('LatentFavorPresentation.favorId'),
        evidence: fields.get('LatentFavorPresentation.evidence'),
    });

    return { user, sceneItems, npcs, userKnowledge, userReputation, worldState, economy, boundCompanion, pendingBoundary, latentFavorPresentation };
}

function sanitizeNarratorTrackerDelta(delta, narration) {
    const text = String(narration || '');
    const cleanDelta = {
        user: sanitizeNarratorTrackerActorDelta(delta?.user || {}, text, 'user'),
        sceneItems: {
            add: Array.isArray(delta?.sceneItems?.add) ? delta.sceneItems.add : [],
            remove: Array.isArray(delta?.sceneItems?.remove) ? delta.sceneItems.remove : [],
            provided: delta?.sceneItems?.provided === true,
        },
        npcs: Array.isArray(delta?.npcs)
            ? delta.npcs.map(item => ({
                ...sanitizeNarratorTrackerActorDelta(item || {}, text, item?.NPC),
                NPC: item?.NPC,
            }))
            : [],
        userKnowledge: normalizeUserKnowledgeDelta(delta?.userKnowledge),
        userReputation: normalizeFameInfamyDelta(delta?.userReputation),
        worldState: normalizeWorldStateDelta(delta?.worldState),
        economy: normalizeEconomyDelta(delta?.economy),
        boundCompanion: normalizeBoundCompanionDelta(delta?.boundCompanion),
        pendingBoundary: normalizePendingBoundaryDelta(delta?.pendingBoundary),
        latentFavorPresentation: normalizeLatentFavorPresentation(delta?.latentFavorPresentation),
    };
    cleanDelta.npcs = cleanDelta.npcs.filter(item =>
        item?.NPC
        && (
            normalizeTrackerDeltaCondition(item.condition) !== 'unchanged'
            || normalizeRevealedName(item.revealedName)
            || TRACKER_NARRATOR_NPC_DELTA_FIELDS.some(field => Array.isArray(item[field]) && item[field].length)
            || normalizePersonalitySummary(item.personalitySummary)
            || TRACKER_NPC_PROFILE_FIELDS.some(field => normalizeNpcCapabilityField(item[field]))
        ));
    return cleanDelta;
}

function normalizeLatentFavorPresentation(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const favorId = cleanScalar(source.favorId ?? source.FavorId).replace(/\s+/g, ' ').slice(0, 100);
    const evidence = cleanScalar(source.evidence ?? source.Evidence).replace(/\s+/g, ' ').slice(0, 260);
    if (!favorId || isNoneValue(favorId) || !evidence || isNoneValue(evidence)) {
        return { favorId: '(none)', evidence: '(none)' };
    }
    return { favorId, evidence };
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
        background: normalizeNpcCapabilityField(source.background),
        knowledge: normalizeNpcCapabilityField(source.knowledge),
        practicedSkills: normalizeNpcCapabilityField(source.practicedSkills),
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
    return false;
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
    const requiredNames = requiredRelationshipCoverageNames(resolutionEngine);
    const relationshipNames = new Set(relationshipEngine.map(item => normalizeNameKey(item.NPC)));
    const missing = requiredNames.filter(name => !relationshipNames.has(normalizeNameKey(name)));
    if (missing.length) {
        throw new Error(`semantic ledger missing RelationshipEngine entry for target/observer/awareness names: ${missing.join(', ')}`);
    }
}

function requiredRelationshipCoverageNames(resolutionEngine) {
    return uniquePlainNames([
        ...(resolutionEngine?.identifyTargets?.ActionTargets || []),
        ...(resolutionEngine?.identifyTargets?.StealthTargets || []),
        ...(resolutionEngine?.identifyTargets?.OppTargets?.NPC || []),
        ...(resolutionEngine?.identifyTargets?.BenefitedObservers || []),
        ...(resolutionEngine?.identifyTargets?.HarmedObservers || []),
        ...(resolutionEngine?.identifyTargets?.NPCAwareOfUser || []),
    ]);
}

function canonicalizeRelationshipNPCs(resolutionEngine, relationshipEngine, source = 'semantic_ledger') {
    const canonicalNames = new Map(
        requiredRelationshipCoverageNames(resolutionEngine).map(name => [normalizeNameKey(name), name]),
    );
    const seen = new Map();
    const canonicalizedNPCs = [];

    for (const item of relationshipEngine || []) {
        const original = cleanScalar(item?.NPC);
        const normalized = normalizeNameKey(original);
        const canonical = canonicalNames.get(normalized) || original;
        if (item && canonical) {
            item.NPC = canonical;
            if (canonical !== original) canonicalizedNPCs.push({ from: original, to: canonical });
        }
        if (!normalized) continue;
        if (seen.has(normalized)) {
            throw new Error(`duplicate RelationshipEngine rows after normalized NPC matching: ${seen.get(normalized)} and ${canonical || original}`);
        }
        seen.set(normalized, canonical || original);
    }

    if (!canonicalizedNPCs.length) return null;
    return {
        source,
        reason: 'canonicalized RelationshipEngine NPC identity to the matching resolution target name',
        canonicalizedNPCs,
    };
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
    const requiredNames = requiredRelationshipCoverageNames(resolutionEngine);
    const relationshipNames = new Set((relationshipEngine || []).map(item => normalizeNameKey(item?.NPC)).filter(Boolean));
    return requiredNames.filter(name => !relationshipNames.has(normalizeNameKey(name)));
}

const INTIMIDATION_OR_COERCION_BLOCKER_KEYS = Object.freeze(new Set([
    'intimidation',
    'coercion',
    'intimidation or coercion',
]));
const BOUNDARY_VIOLATION_BLOCKER_KEYS = Object.freeze(new Set([
    'boundary violation',
]));

function normalizeBlockerKey(value) {
    return cleanScalar(value)
        .toLowerCase()
        .replace(/[_/]+/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function ensureCanonicalBlocker(blockers, acceptedKeys, canonicalLabel) {
    if (blockers.some(blocker => acceptedKeys.has(normalizeBlockerKey(blocker)))) return false;
    blockers.push(canonicalLabel);
    return true;
}

function boundaryBreakMatchesPendingBoundary(boundaryBreak, pendingBoundarySnapshot) {
    if (boundaryBreak?.present !== true) return false;
    const pending = normalizePendingBoundaryState(pendingBoundarySnapshot || {});
    return pending.active
        && boundaryBreak.boundaryId === pending.boundaryId
        && normalizeNameKey(boundaryBreak.targetNPC) === normalizeNameKey(pending.targetNPC)
        && normalizeBoundaryBreakType(boundaryBreak.type) === normalizeBoundaryBreakType(pending.type);
}

function repairContradictorySlowBondEvidence(
    resolutionEngine,
    relationshipEngine,
    pendingBoundarySnapshot = {},
    source = 'semantic_ledger',
) {
    const repairs = [];
    const boundaryBreak = resolutionEngine?.boundaryBreak || {};
    const validBoundaryBreak = boundaryBreakMatchesPendingBoundary(boundaryBreak, pendingBoundarySnapshot);

    for (const item of relationshipEngine || []) {
        const evidence = item?.slowBondEvidence;
        if (!item || !evidence) continue;

        const blockers = readPlainArray(evidence.blockers);
        const blockersAdded = [];
        const reasons = [];
        if (item.explicitIntimidationOrCoercion === true) {
            if (ensureCanonicalBlocker(blockers, INTIMIDATION_OR_COERCION_BLOCKER_KEYS, 'intimidation or coercion')) {
                blockersAdded.push('intimidation or coercion');
            }
            reasons.push('explicit_intimidation_or_coercion');
        }
        if (validBoundaryBreak
            && normalizeNameKey(boundaryBreak.targetNPC) === normalizeNameKey(item.NPC)) {
            if (ensureCanonicalBlocker(blockers, BOUNDARY_VIOLATION_BLOCKER_KEYS, 'boundary violation')) {
                blockersAdded.push('boundary violation');
            }
            reasons.push('boundary_violation');
        }

        const clearedPositiveCategories = [];
        if (blockers.length) {
            for (const key of SLOW_BOND_KEYS) {
                if (evidence[key] === true) {
                    evidence[key] = false;
                    clearedPositiveCategories.push(key);
                }
            }
            if (clearedPositiveCategories.length && !reasons.length) reasons.push('explicit_blocker_conflict');
        }
        evidence.blockers = blockers;

        if (blockersAdded.length || clearedPositiveCategories.length) {
            repairs.push({
                NPC: item.NPC,
                reasons,
                blockersAdded,
                clearedPositiveCategories,
            });
        }
    }

    if (!repairs.length) return null;
    return {
        source,
        reason: 'repaired objectively contradictory slow-bond evidence',
        slowBondEvidenceRepairs: repairs,
    };
}

function createFallbackRelationshipEntry(NPC, genStats) {
    const stakeChangeByOutcome = {};
    for (const outcomeKey of STAKE_OUTCOME_KEYS) {
        stakeChangeByOutcome[outcomeKey] = 'none';
    }
    return {
        NPC,
        aggressionMethod: 'none',
        aggressionMethodEvidence: '(none)',
        initPreset: {
            romanticOpen: false,
            userBadRep: false,
            priorUserGoodRep: false,
            userNonHuman: false,
            fearImmunity: false,
        },
        auditInteraction: false,
        exceptionalBenefit: false,
        exceptionalBenefitScale: 'ordinary',
        exceptionalBenefitEvidence: '(none)',
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
        standingInfluence: 'none',
        standingBasis: '(none)',
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
    const hasUsableStats = stats.CapabilityPool !== 'none';
    return hasUsableStats
        ? stats
        : { CapabilityPool: 'common', MainStat: stats.MainStat !== 'none' ? stats.MainStat : 'Balanced' };
}

function mergeSemanticLedgerRepair(previous, next) {
    if (!previous) return next;
    if (!next) return previous;
    const mergeRecords = (left, right) => {
        const records = [...(left || []), ...(right || [])];
        const seen = new Set();
        return records.filter(record => {
            const key = JSON.stringify(record);
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });
    };
    return {
        ...previous,
        ...next,
        reason: [...new Set([previous.reason, next.reason].filter(Boolean))].join('; '),
        repairedNPCs: uniquePlainNames([
            ...(previous.repairedNPCs || []),
            ...(next.repairedNPCs || []),
        ]),
        canonicalizedNPCs: mergeRecords(previous.canonicalizedNPCs, next.canonicalizedNPCs),
        slowBondEvidenceRepairs: mergeRecords(previous.slowBondEvidenceRepairs, next.slowBondEvidenceRepairs),
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

function readCoreObject(value) {
    return {
        Rank: normalizeRank(value?.Rank),
        MainStat: normalizeMainStat(value?.MainStat),
        PHY: clampNumber(Number(value?.PHY ?? 1), 1, 14),
        MND: clampNumber(Number(value?.MND ?? 1), 1, 14),
        CHA: clampNumber(Number(value?.CHA ?? 1), 1, 14),
    };
}

function readBoolean(fields, key, fallback) {
    return toBoolean(fields.get(key), fallback);
}

function readNumber(fields, key, fallback) {
    const number = Number(String(fields.get(key) ?? '').trim());
    return Number.isFinite(number) ? number : fallback;
}


function readTrackerList(fields, key, fallback = []) {
    const raw = String(fields.get(key) ?? '').trim();
    if (!raw || isNoneValue(raw)) return fallback;
    if (raw.startsWith('[') && raw.endsWith(']')) {
        try {
            const parsed = JSON.parse(raw);
            if (Array.isArray(parsed)) {
                return parsed.map(cleanScalar).filter(item => item && !isNoneValue(item));
            }
        } catch {
            // Fall through to the pipe-delimited format.
        }
    }
    return raw
        .replace(/^\[/, '')
        .replace(/\]$/, '')
        .split(/\s*\|\s*|;/)
        .map(cleanScalar)
        .filter(item => item && !isNoneValue(item));
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

function normalizeCapabilityPool(value) {
    const text = cleanScalar(value).toLowerCase();
    return ['common', 'trained', 'elite', 'boss', 'none'].includes(text) ? text : 'none';
}

function normalizeMainStat(value) {
    const text = cleanScalar(value).toLowerCase();
    const map = { phy: 'PHY', mnd: 'MND', cha: 'CHA', balanced: 'Balanced', none: 'none' };
    return map[text] || 'none';
}

function normalizeChallengeType(value, rollNeeded = true) {
    if (!toBoolean(rollNeeded, false)) return 'none';
    const text = cleanScalar(value).toLowerCase().replace(/[\s_-]+/g, '');
    const map = {
        none: 'none',
        noroll: 'none',
        social: 'social',
        diplomacy: 'social',
        bluff: 'social',
        intimidate: 'social',
        mundanecombat: 'mundane_combat',
        mundane: 'mundane_combat',
        combat: 'mundane_combat',
        physicalcombat: 'mundane_combat',
        weapon: 'mundane_combat',
        supernaturalcombat: 'supernatural_combat',
        spellorsupernatural: 'supernatural_combat',
        spell: 'supernatural_combat',
        supernatural: 'supernatural_combat',
        magic: 'supernatural_combat',
        magical: 'supernatural_combat',
        restraint: 'restraint',
        restrain: 'restraint',
        restraintcontrol: 'restraint',
        grapple: 'restraint',
        grappling: 'restraint',
        pin: 'restraint',
        pinned: 'restraint',
        stealth: 'stealth',
        sneak: 'stealth',
        sneaking: 'stealth',
        environment: 'environment',
        environmental: 'environment',
        env: 'environment',
        challenge: 'environment',
    };
    return map[text] || 'none';
}

function normalizeSocialTactic(value, challengeType = 'none') {
    if (challengeType !== 'social') return 'none';
    const text = cleanScalar(value).toLowerCase().replace(/[\s_-]+/g, '');
    if (['diplomacy', 'persuasion', 'persuade', 'negotiate', 'negotiation', 'bargain', 'request', 'reassure', 'reassurance'].includes(text)) return 'diplomacy';
    if (['bluff', 'deception', 'deceive', 'lie', 'lying', 'mislead', 'misleading', 'trick'].includes(text)) return 'bluff';
    if (['intimidate', 'intimidation', 'threat', 'threaten', 'coerce', 'coercion', 'blackmail'].includes(text)) return 'intimidate';
    return 'diplomacy';
}

function isCombatChallengeType(value) {
    return ['mundane_combat', 'supernatural_combat'].includes(normalizeChallengeType(value, true));
}

function normalizeHarmMode(value, semantic = {}) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    const aliases = {
        lethal: 'lethal',
        deadly: 'lethal',
        fatal: 'lethal',
        lethal_attack: 'lethal',
        nonlethal: 'nonlethal',
        non_lethal: 'nonlethal',
        nonfatal: 'nonlethal',
        non_fatal: 'nonlethal',
        unarmed: 'nonlethal',
        brawl: 'nonlethal',
        restraint: 'restraint_control',
        control: 'restraint_control',
        restraint_control: 'restraint_control',
        control_restraint: 'restraint_control',
        grapple: 'restraint_control',
        grappling: 'restraint_control',
        pin: 'restraint_control',
        pinned: 'restraint_control',
        none: 'none',
        no_harm: 'none',
        noharm: 'none',
    };
    if (aliases[text] && aliases[text] !== 'none') return aliases[text];
    if (toBoolean(semantic?.restraintControl?.present ?? semantic?.restraintControl?.Present, false)) return 'restraint_control';
    if (isCombatChallengeType(semantic?.challengeType)) return 'nonlethal';
    return 'none';
}

function normalizeEnvironmentDifficulty(value, challengeType = 'environment') {
    if (challengeType !== 'environment') return 0;
    const number = Number(cleanScalar(value));
    return [0, 4, 8, 12].includes(number) ? number : 0;
}

function normalizeEnvironmentDifficultyTier(value, challengeType = 'environment') {
    if (challengeType !== 'environment') return 'none';
    const text = cleanScalar(value).toLowerCase();
    if (ENVIRONMENT_DIFFICULTY_TIERS.includes(text)) return text;
    const numericFallback = normalizeEnvironmentDifficulty(value, 'environment');
    if (numericFallback >= 12) return 'extreme';
    if (numericFallback >= 8) return 'hard';
    if (numericFallback >= 4) return 'average';
    return 'none';
}

function environmentDifficultyFromTier(value, challengeType = 'environment') {
    if (challengeType !== 'environment') return 0;
    switch (normalizeEnvironmentDifficultyTier(value, 'environment')) {
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
        CapabilityPool: normalizeCapabilityPool(value?.CapabilityPool),
        MainStat: normalizeMainStat(value?.MainStat),
    };
}

function normalizeStakeChangeValue(value) {
    const text = cleanScalar(value).toLowerCase();
    return ['benefit', 'harm', 'none'].includes(text) ? text : 'none';
}

function normalizeRomanceStyle(value) {
    const text = cleanScalar(value).toLowerCase();
    return ROMANCE_STYLES.includes(text) ? text : 'auto';
}

function normalizeAggressionMethod(value) {
    const normalized = cleanScalar(value).toLowerCase();
    return AGGRESSION_METHODS.includes(normalized) ? normalized : 'none';
}

function normalizeExceptionalBenefitScale(value) {
    const text = cleanScalar(value).toLowerCase();
    return EXCEPTIONAL_BENEFIT_SCALES.includes(text) ? text : 'ordinary';
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
    const text = cleanScalar(normalizeSemanticInjuryEffectType(value)).toLowerCase().replace(/[\s-]+/g, '_');
    return INJURY_EFFECT_TYPES.includes(text)
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
    const text = stripPersonalityMannerismFields(cleanScalar(value).replace(/\s+/g, ' ').trim());
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
    const normalized = {
        condition: normalizeTrackerDeltaCondition(source.condition),
        revealedName: normalizeRevealedName(source.revealedName),
        personalitySummary: normalizePersonalitySummary(source.personalitySummary),
    };
    for (const field of fields) {
        normalized[field] = TRACKER_NPC_PROFILE_FIELDS.includes(field)
            ? normalizeNpcCapabilityField(source[field])
            : normalizeTrackerDeltaList(source[field]);
    }
    return normalized;
}

function normalizeFameInfamyDelta(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const events = Array.isArray(source.events)
        ? source.events.map(normalizeFameInfamyDeltaEntry).filter(Boolean).slice(0, 2)
        : [];
    return { events };
}

function normalizeFameInfamyDeltaEntry(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const location = cleanScalar(source.location).replace(/\s+/g, ' ').slice(0, 120);
    if (!location || isNoneValue(location)) return null;
    const fameDelta = clampNumber(Math.floor(Number(source.fameDelta || 0)), 0, 1);
    const infamyDelta = clampNumber(Math.floor(Number(source.infamyDelta || 0)), 0, 1);
    if (!fameDelta && !infamyDelta) return null;
    return {
        location,
        fameDelta,
        infamyDelta,
        reason: cleanScalar(source.reason).replace(/\s+/g, ' ').slice(0, 220) || '(none)',
        evidence: cleanScalar(source.evidence).replace(/\s+/g, ' ').slice(0, 220) || '(none)',
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

function normalizeReputationLocationText(value) {
    const text = cleanScalar(value).replace(/\s+/g, ' ').trim().slice(0, 120);
    if (!text || isNoneValue(text)) return '';
    return text;
}

function clampNumber(value, min, max) {
    const number = Number(value);
    if (!Number.isFinite(number)) return min;
    return Math.max(min, Math.min(max, number));
}

function normalizeLedger(ledger, options = {}) {
    ledger.engineContext = ledger.engineContext || {};
    ledger.engineContext.userCoreStats = normalizeCore(ledger.engineContext.userCoreStats);
    const hasTrackerSnapshot = Object.prototype.hasOwnProperty.call(options, 'trackerSnapshot');
    ledger.engineContext.trackerRelevantNPCs = hasTrackerSnapshot
        ? trackerSnapshotToLedgerEntries(options.trackerSnapshot || {})
        : normalizeTrackerRelevantNPCs(ledger.engineContext.trackerRelevantNPCs);
    ledger.engineContext.userReputationContext = {
        location: normalizeReputationLocationText(ledger.engineContext.userReputationContext?.location) || '(none)',
    };
    ledger.worldTransition = normalizeWorldTransition(ledger.worldTransition || {});
    ledger.worldProgression = ledger.worldProgression && typeof ledger.worldProgression === 'object'
        ? ledger.worldProgression
        : {};
    ledger.worldProgression.advancements = normalizeWorldProgressionAdvancements(ledger.worldProgression.advancements);
    ledger.resolutionEngine = ledger.resolutionEngine || {};
    ledger.resolutionEngine.identifyGoal = ledger.resolutionEngine.identifyGoal || 'Normal_Interaction';
    ledger.resolutionEngine.identifyChallenge = ledger.resolutionEngine.identifyChallenge || ledger.resolutionEngine.explicitMeans || ledger.resolutionEngine.identifyGoal;
    ledger.resolutionEngine.identifyTargets = ledger.resolutionEngine.identifyTargets || {};
    ledger.resolutionEngine.identifyTargets.hostilesInScene = ledger.resolutionEngine.identifyTargets.hostilesInScene || {};
    ledger.resolutionEngine.identifyTargets.hostilesInScene.NPC = readPlainArray(ledger.resolutionEngine.identifyTargets.hostilesInScene.NPC);
    ledger.resolutionEngine.identifyTargets.OppTargets = ledger.resolutionEngine.identifyTargets.OppTargets || {};
    ledger.resolutionEngine.identifyTargets.ActionTargets = readPlainArray(ledger.resolutionEngine.identifyTargets.ActionTargets);
    ledger.resolutionEngine.identifyTargets.StealthTargets = readPlainArray(ledger.resolutionEngine.identifyTargets.StealthTargets);
    ledger.resolutionEngine.identifyTargets.OppTargets.NPC = readPlainArray(ledger.resolutionEngine.identifyTargets.OppTargets.NPC);
    ledger.resolutionEngine.identifyTargets.OppTargets.ENV = readPlainArray(ledger.resolutionEngine.identifyTargets.OppTargets.ENV);
    ledger.resolutionEngine.identifyTargets.BenefitedObservers = readPlainArray(ledger.resolutionEngine.identifyTargets.BenefitedObservers);
    ledger.resolutionEngine.identifyTargets.HarmedObservers = readPlainArray(ledger.resolutionEngine.identifyTargets.HarmedObservers);
    ledger.resolutionEngine.identifyTargets.NPCAwareOfUser = readPlainArray(ledger.resolutionEngine.identifyTargets.NPCAwareOfUser);
    ledger.resolutionEngine.identifyTargets.PowerActors = readPlainArray(ledger.resolutionEngine.identifyTargets.PowerActors);
    ledger.resolutionEngine.userAbilityUse = normalizeUserAbilityUse(ledger.resolutionEngine.userAbilityUse);
    ledger.resolutionEngine.itemUse = normalizeItemUse(ledger.resolutionEngine.itemUse);
    ledger.resolutionEngine.lootSearch = normalizeLootSearch(ledger.resolutionEngine.lootSearch);
    ledger.resolutionEngine.claimCheck = normalizeClaimCheck(ledger.resolutionEngine.claimCheck);
    ledger.resolutionEngine.rollNeeded = toBoolean(ledger.resolutionEngine.rollNeeded, false);
    ledger.resolutionEngine.rollReason = cleanScalar(ledger.resolutionEngine.rollReason) || '(none)';
    ledger.resolutionEngine.challengeType = normalizeChallengeType(ledger.resolutionEngine.challengeType, ledger.resolutionEngine.rollNeeded);
    ledger.resolutionEngine.challengeTypeEvidence = cleanScalar(ledger.resolutionEngine.challengeTypeEvidence) || '(none)';
    ledger.resolutionEngine.socialTactic = normalizeSocialTactic(ledger.resolutionEngine.socialTactic, ledger.resolutionEngine.challengeType);
    ledger.resolutionEngine.environmentDifficultyTier = normalizeEnvironmentDifficultyTier(
        ledger.resolutionEngine.environmentDifficultyTier ?? ledger.resolutionEngine.environmentDifficulty,
        ledger.resolutionEngine.challengeType,
    );
    ledger.resolutionEngine.environmentDifficulty = environmentDifficultyFromTier(
        ledger.resolutionEngine.environmentDifficultyTier,
        ledger.resolutionEngine.challengeType,
    );
    ledger.resolutionEngine.intimacyAdvanceExplicit = toBoolean(ledger.resolutionEngine.intimacyAdvanceExplicit, false);
    ledger.resolutionEngine.restraintControl = normalizeRestraintControl(ledger.resolutionEngine.restraintControl);
    ledger.resolutionEngine.boundaryPressure = normalizeBoundaryPressure(ledger.resolutionEngine.boundaryPressure);
    ledger.resolutionEngine.boundaryBreak = normalizeBoundaryBreak(
        ledger.resolutionEngine.boundaryBreak,
        options.pendingBoundarySnapshot,
    );
    ledger.resolutionEngine.activeHostileThreat = toBoolean(ledger.resolutionEngine.activeHostileThreat, false);
    ledger.resolutionEngine.harmMode = normalizeHarmMode(ledger.resolutionEngine.harmMode, ledger.resolutionEngine);
    ledger.resolutionEngine.actionCount = deriveActionMarkersFromUnits(
        ledger.resolutionEngine.actionUnits,
        ledger.resolutionEngine.challengeType,
    );
    ledger.resolutionEngine.actionUnits = normalizeActionUnits(
        ledger.resolutionEngine.actionUnits,
        ledger.resolutionEngine.actionCount,
        ledger.resolutionEngine,
        [],
    );
    delete ledger.resolutionEngine.primaryOppTarget;
    delete ledger.resolutionEngine.primaryOpposition;
    ledger.resolutionEngine.genStats = normalizeGeneratedStatsSeed(ledger.resolutionEngine.genStats);
    ledger.relationshipEngine = Array.isArray(ledger.relationshipEngine) ? ledger.relationshipEngine : [];
    let relationshipRepair = canonicalizeRelationshipNPCs(
        ledger.resolutionEngine,
        ledger.relationshipEngine,
        'normalized_ledger',
    );
    ledger.relationshipEngine.forEach(item => {
        const standing = normalizeStandingAssessment(item.standingInfluence, item.standingBasis);
        item.standingInfluence = standing.standingInfluence;
        item.standingBasis = standing.standingBasis;
        item.aggressionMethod = normalizeAggressionMethod(item.aggressionMethod);
        item.aggressionMethodEvidence = cleanScalar(item.aggressionMethodEvidence) || '(none)';
        if (item.aggressionMethod === 'none') item.aggressionMethodEvidence = '(none)';
        item.initPreset = normalizeInitPresetFlags(item.initPreset);
        item.exceptionalBenefit = toBoolean(item.exceptionalBenefit, false);
        item.exceptionalBenefitScale = normalizeExceptionalBenefitScale(item.exceptionalBenefitScale);
        item.exceptionalBenefitEvidence = cleanScalar(item.exceptionalBenefitEvidence) || '(none)';
        if (!item.exceptionalBenefit) item.exceptionalBenefitEvidence = '(none)';
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
    relationshipRepair = mergeSemanticLedgerRepair(
        relationshipRepair,
        repairRelationshipCoverage(ledger.resolutionEngine, ledger.relationshipEngine, 'normalized_ledger'),
    );
    relationshipRepair = mergeSemanticLedgerRepair(
        relationshipRepair,
        repairContradictorySlowBondEvidence(
            ledger.resolutionEngine,
            ledger.relationshipEngine,
            options.pendingBoundarySnapshot,
            'normalized_ledger',
        ),
    );
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
    ledger.powerActorEnmity.latentGrievances = Array.isArray(ledger.powerActorEnmity.latentGrievances)
        ? ledger.powerActorEnmity.latentGrievances.map(normalizeLatentGrievanceCandidate).filter(Boolean)
        : [];
    ledger.powerActorEnmity.affiliationLinks = Array.isArray(ledger.powerActorEnmity.affiliationLinks)
        ? ledger.powerActorEnmity.affiliationLinks.map(normalizePowerActorAffiliationLink).filter(Boolean)
        : [];
    ledger.powerActorEnmity.latentFavors = Array.isArray(ledger.powerActorEnmity.latentFavors)
        ? ledger.powerActorEnmity.latentFavors.map(normalizeLatentFavorCandidate).filter(Boolean)
        : [];
    ledger.powerActorEnmity.favorAffiliationLinks = Array.isArray(ledger.powerActorEnmity.favorAffiliationLinks)
        ? ledger.powerActorEnmity.favorAffiliationLinks.map(normalizePowerActorFavorAffiliationLink).filter(Boolean)
        : [];
    ledger.powerEventShape = ledger.powerEventShape || {};
    ledger.powerEventShape.events = Array.isArray(ledger.powerEventShape.events)
        ? ledger.powerEventShape.events.map(normalizePowerEventShape).filter(Boolean)
        : [];
    ledger.trackerUpdateEngine = ledger.trackerUpdateEngine || {};
    ledger.trackerUpdateEngine.user = normalizeTrackerDelta(ledger.trackerUpdateEngine.user, TRACKER_USER_DELTA_FIELDS);
    ledger.trackerUpdateEngine.user.currencyAdd = [];
    ledger.trackerUpdateEngine.user.currencyRemove = [];
    ledger.trackerUpdateEngine.npcs = Array.isArray(ledger.trackerUpdateEngine.npcs)
        ? ledger.trackerUpdateEngine.npcs.map(item => {
            const npc = cleanScalar(item?.NPC);
            if (!npc || isNoneValue(npc)) return null;
        return {
            NPC: npc,
            ...normalizeTrackerDelta(item, [...TRACKER_NPC_DELTA_FIELDS, ...TRACKER_NPC_PROFILE_FIELDS]),
        };
        }).filter(Boolean)
        : [];
    ledger.trackerUpdateEngine.boundCompanion = normalizeBoundCompanionDelta(ledger.trackerUpdateEngine.boundCompanion);
    ledger.trackerUpdateEngine.pendingBoundary = normalizePendingBoundaryDelta({ status: 'unchanged' });
    ledger.chaosSemantic = ledger.chaosSemantic || { sceneSummary: '' };
    ledger.proactivitySemantic = {};
    return ledger;
}

function normalizeUserAbilityUse(value) {
    const source = value && typeof value === 'object' ? value : {};
    const attempted = toBoolean(source.attempted ?? source.Attempted, false);
    const available = toBoolean(source.available ?? source.Available, false);
    const used = attempted && available;
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
    const availableSources = ['gear', 'inventory', 'scene', 'ambient'];
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

function normalizeLootSearch(value) {
    const source = value && typeof value === 'object' ? value : {};
    const attempted = toBoolean(source.attempted ?? source.Attempted, false);
    const target = cleanScalar(source.target ?? source.Target) || '(none)';
    const rawTargetKind = cleanScalar(source.targetKind ?? source.TargetKind).toLowerCase().replace(/[\s-]+/g, '_');
    const targetKind = LOOT_TARGET_KINDS.includes(rawTargetKind) ? rawTargetKind : 'other';
    const evidence = cleanScalar(source.evidence ?? source.Evidence) || '(none)';
    const keepDetails = attempted && !isNoneValue(target);
    return {
        attempted: keepDetails,
        target: keepDetails ? target : '(none)',
        targetKind: keepDetails ? targetKind : 'other',
        evidence: keepDetails && !isNoneValue(evidence) ? evidence : '(none)',
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

function normalizeBoundaryPressureType(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    return BOUNDARY_PRESSURE_TYPES.includes(text) ? text : 'none';
}

function normalizeBoundaryBreakType(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    return BOUNDARY_BREAK_TYPES.includes(text) ? text : 'none';
}

function normalizeBoundaryBreakResponse(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    return BOUNDARY_BREAK_RESPONSES.includes(text) ? text : 'none';
}

function normalizeStandingAssessment(influenceValue, basisValue) {
    const rawInfluence = cleanScalar(influenceValue).toLowerCase().replace(/[\s-]+/g, '_');
    const influence = STANDING_INFLUENCES.includes(rawInfluence) ? rawInfluence : 'none';
    const basis = cleanScalar(basisValue).replace(/\s+/g, ' ').slice(0, 220);
    if (influence === 'none' || !basis || isNoneValue(basis)) {
        return {
            standingInfluence: 'none',
            standingBasis: '(none)',
        };
    }
    return {
        standingInfluence: influence,
        standingBasis: basis,
    };
}

function normalizeRestraintControl(value) {
    const source = value && typeof value === 'object' ? value : {};
    const present = toBoolean(source.present ?? source.Present, false);
    const targetNPC = cleanScalar(source.targetNPC ?? source.TargetNPC) || '(none)';
    const evidence = cleanScalar(source.evidence ?? source.Evidence) || '(none)';
    return {
        present,
        targetNPC: present && !isNoneValue(targetNPC) ? targetNPC : '(none)',
        evidence: present && !isNoneValue(evidence) ? evidence : '(none)',
    };
}

function normalizeBoundaryPressure(value) {
    const source = value && typeof value === 'object' ? value : {};
    const present = toBoolean(source.present ?? source.Present, false);
    const type = normalizeBoundaryPressureType(source.type ?? source.Type);
    const targetNPC = cleanScalar(source.targetNPC ?? source.TargetNPC) || '(none)';
    const objectOrAccess = cleanScalar(source.objectOrAccess ?? source.ObjectOrAccess) || '(none)';
    const evidence = cleanScalar(source.evidence ?? source.Evidence) || '(none)';
    return {
        present,
        type: present ? type : 'none',
        targetNPC: present && !isNoneValue(targetNPC) ? targetNPC : '(none)',
        objectOrAccess: present && !isNoneValue(objectOrAccess) ? objectOrAccess : '(none)',
        evidence: present && !isNoneValue(evidence) ? evidence : '(none)',
    };
}

function normalizeBoundaryBreak(value, pendingBoundarySnapshot = undefined) {
    const source = value && typeof value === 'object' ? value : {};
    const present = toBoolean(source.present ?? source.Present, false);
    const response = normalizeBoundaryBreakResponse(source.response ?? source.Response);
    const evidence = cleanScalar(source.evidence ?? source.Evidence) || '(none)';
    const hasAuthoritativeSnapshot = pendingBoundarySnapshot !== undefined;
    const pending = hasAuthoritativeSnapshot
        ? normalizePendingBoundaryState(pendingBoundarySnapshot || {})
        : null;
    const identity = hasAuthoritativeSnapshot
        ? pending?.active && present
            ? {
                boundaryId: pending.boundaryId || '(none)',
                targetNPC: pending.targetNPC || '(none)',
                type: normalizeBoundaryBreakType(pending.type),
            }
            : { boundaryId: '(none)', targetNPC: '(none)', type: 'none' }
        : {
            boundaryId: cleanScalar(source.boundaryId ?? source.BoundaryId) || '(none)',
            targetNPC: cleanScalar(source.targetNPC ?? source.TargetNPC) || '(none)',
            type: normalizeBoundaryBreakType(source.type ?? source.Type),
        };
    return {
        present,
        boundaryId: present && !isNoneValue(identity.boundaryId) ? identity.boundaryId : '(none)',
        targetNPC: present && !isNoneValue(identity.targetNPC) ? identity.targetNPC : '(none)',
        type: present ? identity.type : 'none',
        response: present ? response : 'none',
        evidence: present && !isNoneValue(evidence) ? evidence : '(none)',
    };
}

function validateBoundaryObjects(resolutionEngine, missing) {
    if (!resolutionEngine?.restraintControl || typeof resolutionEngine.restraintControl.present !== 'boolean') missing.push('resolutionEngine.restraintControl');
    if (!resolutionEngine?.boundaryPressure || typeof resolutionEngine.boundaryPressure.present !== 'boolean') missing.push('resolutionEngine.boundaryPressure');
    if (!BOUNDARY_PRESSURE_TYPES.includes(resolutionEngine?.boundaryPressure?.type)) missing.push('resolutionEngine.boundaryPressure.type');
    if (!resolutionEngine?.boundaryBreak || typeof resolutionEngine.boundaryBreak.present !== 'boolean') missing.push('resolutionEngine.boundaryBreak');
    if (!BOUNDARY_BREAK_RESPONSES.includes(resolutionEngine?.boundaryBreak?.response)) missing.push('resolutionEngine.boundaryBreak.response');
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
            if (application.type !== 'personalKnowledge') continue;
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

function normalizePowerActorActionUnitId(value) {
    const match = cleanScalar(value).trim().toUpperCase().match(/^A([1-3])$/);
    return match ? `A${match[1]}` : '';
}

function normalizePowerActorEffect(value) {
    const source = value && typeof value === 'object' ? value : {};
    const actor = cleanScalar(source.actor ?? source.Actor).replace(/\s+/g, ' ').slice(0, 100);
    if (!actor || isNoneValue(actor)) return null;
    const sourceTarget = cleanScalar(source.sourceTarget ?? source.SourceTarget).replace(/\s+/g, ' ').slice(0, 100);
    const actionUnitId = normalizePowerActorActionUnitId(source.actionUnitId ?? source.ActionUnitId);
    if (!sourceTarget || isNoneValue(sourceTarget) || !actionUnitId) return null;
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
        sourceTarget,
        actionUnitId,
        explicitlyCompleted: toBoolean(source.explicitlyCompleted ?? source.ExplicitlyCompleted, false),
        hasReach,
        effect,
        severity,
        reason,
        knownToActor,
    };
}

function normalizeLatentGrievanceCandidate(value) {
    const source = value && typeof value === 'object' ? value : {};
    const target = cleanScalar(source.target ?? source.Target).replace(/\s+/g, ' ').slice(0, 100);
    const actionUnitId = normalizePowerActorActionUnitId(source.actionUnitId ?? source.ActionUnitId);
    const effect = normalizePowerActorEffectType(source.effect ?? source.Effect);
    const severity = normalizePowerActorSeverity(source.severity ?? source.Severity);
    const reason = cleanScalar(source.reason ?? source.Reason).replace(/\s+/g, ' ').slice(0, 180);
    const evidence = cleanScalar(source.evidence ?? source.Evidence).replace(/\s+/g, ' ').slice(0, 220);
    if (!target || isNoneValue(target) || !actionUnitId || effect === 'none' || !['meaningful', 'major'].includes(severity) || !reason || isNoneValue(reason) || !evidence || isNoneValue(evidence)) return null;
    const attributionPath = cleanScalar(source.attributionPath ?? source.AttributionPath).replace(/\s+/g, ' ').slice(0, 180);
    return {
        target,
        actionUnitId,
        explicitlyCompleted: toBoolean(source.explicitlyCompleted ?? source.ExplicitlyCompleted, false),
        effect,
        severity,
        reason,
        evidence,
        attributionPath: attributionPath && !isNoneValue(attributionPath) ? attributionPath : '(none)',
    };
}

function normalizeLatentFavorCandidate(value) {
    const source = value && typeof value === 'object' ? value : {};
    const target = cleanScalar(source.target ?? source.Target).replace(/\s+/g, ' ').slice(0, 100);
    const actionUnitId = normalizePowerActorActionUnitId(source.actionUnitId ?? source.ActionUnitId);
    const benefit = normalizePowerActorFavorType(source.benefit ?? source.Benefit);
    const severity = normalizePowerActorSeverity(source.severity ?? source.Severity);
    const reason = cleanScalar(source.reason ?? source.Reason).replace(/\s+/g, ' ').slice(0, 180);
    const evidence = cleanScalar(source.evidence ?? source.Evidence).replace(/\s+/g, ' ').slice(0, 220);
    const uncompensated = toBoolean(source.uncompensated ?? source.Uncompensated, false);
    const beyondExpectedDuty = toBoolean(source.beyondExpectedDuty ?? source.BeyondExpectedDuty, false);
    if (!target || isNoneValue(target) || !actionUnitId || benefit === 'none' || !['meaningful', 'major'].includes(severity) || !reason || isNoneValue(reason) || !evidence || isNoneValue(evidence) || !uncompensated || !beyondExpectedDuty) return null;
    const attributionPath = cleanScalar(source.attributionPath ?? source.AttributionPath).replace(/\s+/g, ' ').slice(0, 180);
    return {
        target,
        actionUnitId,
        explicitlyCompleted: toBoolean(source.explicitlyCompleted ?? source.ExplicitlyCompleted, false),
        benefit,
        severity,
        reason,
        evidence,
        uncompensated: true,
        beyondExpectedDuty: true,
        attributionPath: attributionPath && !isNoneValue(attributionPath) ? attributionPath : '(none)',
    };
}

function normalizePowerActorAffiliationLink(value) {
    const source = value && typeof value === 'object' ? value : {};
    const grievanceId = cleanScalar(source.grievanceId ?? source.GrievanceId).replace(/\s+/g, ' ').slice(0, 100);
    const target = cleanScalar(source.target ?? source.Target).replace(/\s+/g, ' ').slice(0, 100);
    const powerActor = cleanScalar(source.powerActor ?? source.PowerActor).replace(/\s+/g, ' ').slice(0, 100);
    const actorType = cleanScalar(source.actorType ?? source.ActorType).replace(/\s+/g, ' ').slice(0, 80);
    const affiliationEvidence = cleanScalar(source.affiliationEvidence ?? source.AffiliationEvidence).replace(/\s+/g, ' ').slice(0, 220);
    if (!grievanceId || isNoneValue(grievanceId) || !powerActor || isNoneValue(powerActor) || !affiliationEvidence || isNoneValue(affiliationEvidence)) return null;
    const knowledgeEvidence = cleanScalar(source.knowledgeEvidence ?? source.KnowledgeEvidence).replace(/\s+/g, ' ').slice(0, 220);
    const link = {
        grievanceId,
        powerActor,
        affiliationEvidence,
        knownToActor: toBoolean(source.knownToActor ?? source.KnownToActor, false),
        knowledgeEvidence: knowledgeEvidence && !isNoneValue(knowledgeEvidence) ? knowledgeEvidence : '(none)',
    };
    // Keep legacy fixture metadata available for compatibility checks, but do
    // not require or trust it over the exact grievance and actor assessment.
    if (target && !isNoneValue(target)) link.target = target;
    if (actorType && !isNoneValue(actorType)) link.actorType = actorType;
    if (Object.prototype.hasOwnProperty.call(source, 'hasReach') || Object.prototype.hasOwnProperty.call(source, 'HasReach')) {
        link.hasReach = toBoolean(source.hasReach ?? source.HasReach, false);
    }
    return link;
}

function normalizePowerActorFavorAffiliationLink(value) {
    const source = value && typeof value === 'object' ? value : {};
    const favorId = cleanScalar(source.favorId ?? source.FavorId).replace(/\s+/g, ' ').slice(0, 100);
    const target = cleanScalar(source.target ?? source.Target).replace(/\s+/g, ' ').slice(0, 100);
    const powerActor = cleanScalar(source.powerActor ?? source.PowerActor).replace(/\s+/g, ' ').slice(0, 100);
    const actorType = cleanScalar(source.actorType ?? source.ActorType).replace(/\s+/g, ' ').slice(0, 80);
    const affiliationEvidence = cleanScalar(source.affiliationEvidence ?? source.AffiliationEvidence).replace(/\s+/g, ' ').slice(0, 220);
    if (!favorId || isNoneValue(favorId) || !powerActor || isNoneValue(powerActor) || !affiliationEvidence || isNoneValue(affiliationEvidence)) return null;
    const knowledgeEvidence = cleanScalar(source.knowledgeEvidence ?? source.KnowledgeEvidence).replace(/\s+/g, ' ').slice(0, 220);
    const userKnowledgeEvidence = cleanScalar(source.userKnowledgeEvidence ?? source.UserKnowledgeEvidence).replace(/\s+/g, ' ').slice(0, 220);
    const fitEvidence = cleanScalar(source.fitEvidence ?? source.FitEvidence).replace(/\s+/g, ' ').slice(0, 220);
    const link = {
        favorId,
        powerActor,
        affiliationEvidence,
        knownToActor: toBoolean(source.knownToActor ?? source.KnownToActor, false),
        knowledgeEvidence: knowledgeEvidence && !isNoneValue(knowledgeEvidence) ? knowledgeEvidence : '(none)',
        knownToUser: toBoolean(source.knownToUser ?? source.KnownToUser, false),
        userKnowledgeEvidence: userKnowledgeEvidence && !isNoneValue(userKnowledgeEvidence) ? userKnowledgeEvidence : '(none)',
        fit: normalizePowerActorFavorFit(source.fit ?? source.Fit),
        fitEvidence: fitEvidence && !isNoneValue(fitEvidence) ? fitEvidence : '(none)',
    };
    if (target && !isNoneValue(target)) link.target = target;
    if (actorType && !isNoneValue(actorType)) link.actorType = actorType;
    if (Object.prototype.hasOwnProperty.call(source, 'hasReach') || Object.prototype.hasOwnProperty.call(source, 'HasReach')) {
        link.hasReach = toBoolean(source.hasReach ?? source.HasReach, false);
    }
    return link;
}

function normalizePowerActorFavorFit(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    return POWER_ACTOR_FAVOR_FITS.includes(text) ? text : 'defer';
}

function normalizePowerEventShape(value) {
    const source = value && typeof value === 'object' ? value : {};
    const eventId = cleanScalar(source.eventId ?? source.EventId).replace(/\s+/g, ' ').slice(0, 80);
    const actor = cleanScalar(source.actor ?? source.Actor).replace(/\s+/g, ' ').slice(0, 100);
    if (!eventId || isNoneValue(eventId) || !actor || isNoneValue(actor)) return null;
    const fit = normalizePowerEventFit(source.fit ?? source.Fit);
    if (fit === 'none') return null;
    const visibleInstruction = sanitizePowerEventVisibleInstruction(source.visibleInstruction ?? source.VisibleInstruction);
    return {
        eventId,
        actor,
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

function normalizePowerActorFavorType(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    return POWER_ACTOR_FAVOR_TYPES.includes(text) ? text : 'none';
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

function sanitizeLatentGrievanceSnapshotForSemantic(value = []) {
    const source = Array.isArray(value)
        ? value
        : Array.isArray(value?.entries)
            ? value.entries
            : [];
    return source.map(raw => {
        const item = raw && typeof raw === 'object' ? raw : {};
        const id = cleanScalar(item.id ?? item.Id).replace(/\s+/g, ' ').slice(0, 100);
        const target = cleanScalar(item.target ?? item.Target).replace(/\s+/g, ' ').slice(0, 100);
        const effect = normalizePowerActorEffectType(item.effect ?? item.Effect);
        const severity = normalizePowerActorSeverity(item.severity ?? item.Severity);
        if (!id || !target || effect === 'none' || !['meaningful', 'major'].includes(severity)) return null;
        return {
            id,
            target,
            effect,
            severity,
            reason: cleanScalar(item.reason ?? item.Reason).replace(/\s+/g, ' ').slice(0, 180) || '(none)',
        };
    }).filter(Boolean).slice(-24);
}

function sanitizeLatentFavorSnapshotForSemantic(value = []) {
    const source = Array.isArray(value)
        ? value
        : Array.isArray(value?.entries)
            ? value.entries
            : [];
    return source.map(raw => {
        const item = raw && typeof raw === 'object' ? raw : {};
        const id = cleanScalar(item.id ?? item.Id).replace(/\s+/g, ' ').slice(0, 100);
        const target = cleanScalar(item.target ?? item.Target).replace(/\s+/g, ' ').slice(0, 100);
        const benefit = normalizePowerActorFavorType(item.benefit ?? item.Benefit);
        const severity = normalizePowerActorSeverity(item.severity ?? item.Severity);
        if (!id || !target || benefit === 'none' || !['meaningful', 'major'].includes(severity)) return null;
        return {
            id,
            target,
            benefit,
            severity,
            reason: cleanScalar(item.reason ?? item.Reason).replace(/\s+/g, ' ').slice(0, 180) || '(none)',
        };
    }).filter(Boolean).slice(-24);
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

function deriveActionMarkersFromUnits(units, challengeType = 'none') {
    const source = Array.isArray(units) ? units : [];
    const count = isCombatChallengeType(challengeType)
        ? Math.max(1, Math.min(3, source.length || 1))
        : 1;
    return Array.from({ length: count }, (_, index) => `a${index + 1}`);
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
    if (!ledger.worldTransition) missing.push('worldTransition');
    if (typeof ledger.worldTransition?.requiresSuccess !== 'boolean') missing.push('worldTransition.requiresSuccess:boolean');
    if (!ledger.worldProgression) missing.push('worldProgression');
    if (!Array.isArray(ledger.worldProgression?.advancements)) missing.push('worldProgression.advancements');
    if (!ledger.resolutionEngine) missing.push('resolutionEngine');
    if (!ledger.resolutionEngine?.identifyGoal) missing.push('resolutionEngine.identifyGoal');
    if (!ledger.resolutionEngine?.identifyChallenge) missing.push('resolutionEngine.identifyChallenge');
    if (!ledger.resolutionEngine?.userAbilityUse) missing.push('resolutionEngine.userAbilityUse');
    if (typeof ledger.resolutionEngine?.userAbilityUse?.attempted !== 'boolean') missing.push('resolutionEngine.userAbilityUse.attempted:boolean');
    if (typeof ledger.resolutionEngine?.userAbilityUse?.available !== 'boolean') missing.push('resolutionEngine.userAbilityUse.available:boolean');
    if (!ledger.resolutionEngine?.itemUse) missing.push('resolutionEngine.itemUse');
    if (typeof ledger.resolutionEngine?.itemUse?.attempted !== 'boolean') missing.push('resolutionEngine.itemUse.attempted:boolean');
    if (typeof ledger.resolutionEngine?.itemUse?.available !== 'boolean') missing.push('resolutionEngine.itemUse.available:boolean');
    if (!ITEM_USE_SOURCES.includes(ledger.resolutionEngine?.itemUse?.source)) missing.push('resolutionEngine.itemUse.source');
    if (!ledger.resolutionEngine?.lootSearch) missing.push('resolutionEngine.lootSearch');
    if (typeof ledger.resolutionEngine?.lootSearch?.attempted !== 'boolean') missing.push('resolutionEngine.lootSearch.attempted:boolean');
    if (!LOOT_TARGET_KINDS.includes(ledger.resolutionEngine?.lootSearch?.targetKind)) missing.push('resolutionEngine.lootSearch.targetKind');
    if (!ledger.resolutionEngine?.claimCheck) missing.push('resolutionEngine.claimCheck');
    if (typeof ledger.resolutionEngine?.claimCheck?.present !== 'boolean') missing.push('resolutionEngine.claimCheck.present:boolean');
    if (typeof ledger.resolutionEngine?.claimCheck?.stakesImpact !== 'boolean') missing.push('resolutionEngine.claimCheck.stakesImpact:boolean');
    if (!CLAIM_TRUTH_STATUSES.includes(ledger.resolutionEngine?.claimCheck?.truthStatus)) missing.push('resolutionEngine.claimCheck.truthStatus');
    if (!CLAIM_NPC_ACCESS_LEVELS.includes(ledger.resolutionEngine?.claimCheck?.npcAccess)) missing.push('resolutionEngine.claimCheck.npcAccess');
    if (!ledger.resolutionEngine?.identifyTargets) missing.push('resolutionEngine.identifyTargets');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.hostilesInScene?.NPC)) missing.push('resolutionEngine.identifyTargets.hostilesInScene.NPC');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.ActionTargets)) missing.push('resolutionEngine.identifyTargets.ActionTargets');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.StealthTargets)) missing.push('resolutionEngine.identifyTargets.StealthTargets');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.OppTargets?.NPC)) missing.push('resolutionEngine.identifyTargets.OppTargets.NPC');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.OppTargets?.ENV)) missing.push('resolutionEngine.identifyTargets.OppTargets.ENV');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.BenefitedObservers)) missing.push('resolutionEngine.identifyTargets.BenefitedObservers');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.HarmedObservers)) missing.push('resolutionEngine.identifyTargets.HarmedObservers');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.NPCAwareOfUser)) missing.push('resolutionEngine.identifyTargets.NPCAwareOfUser');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.PowerActors)) missing.push('resolutionEngine.identifyTargets.PowerActors');
    if (typeof ledger.resolutionEngine?.rollNeeded !== 'boolean') missing.push('resolutionEngine.rollNeeded:boolean');
    if (!ledger.resolutionEngine?.rollReason) missing.push('resolutionEngine.rollReason');
    if (!CHALLENGE_TYPES.includes(ledger.resolutionEngine?.challengeType)) missing.push('resolutionEngine.challengeType');
    if (!ledger.resolutionEngine?.challengeTypeEvidence) missing.push('resolutionEngine.challengeTypeEvidence');
    if (!SOCIAL_TACTICS.includes(ledger.resolutionEngine?.socialTactic)) missing.push('resolutionEngine.socialTactic');
    if (!HARM_MODES.includes(ledger.resolutionEngine?.harmMode)) missing.push('resolutionEngine.harmMode');
    if (typeof ledger.resolutionEngine?.intimacyAdvanceExplicit !== 'boolean') missing.push('resolutionEngine.intimacyAdvanceExplicit:boolean');
    validateBoundaryObjects(ledger.resolutionEngine, missing);
    if (!Array.isArray(ledger.resolutionEngine?.actionCount)) missing.push('resolutionEngine.actionCount');
    if (!Array.isArray(ledger.resolutionEngine?.actionUnits)) missing.push('resolutionEngine.actionUnits');
    if (Array.isArray(ledger.resolutionEngine?.actionCount) && Array.isArray(ledger.resolutionEngine?.actionUnits) && ledger.resolutionEngine.actionUnits.length !== ledger.resolutionEngine.actionCount.length) {
        missing.push('resolutionEngine.actionUnits:length');
    }
    if (!ENVIRONMENT_DIFFICULTY_TIERS.includes(ledger.resolutionEngine?.environmentDifficultyTier)) missing.push('resolutionEngine.environmentDifficultyTier');
    if (![0, 4, 8, 12].includes(ledger.resolutionEngine?.environmentDifficulty)) missing.push('resolutionEngine.environmentDifficulty');
    if (typeof ledger.resolutionEngine?.activeHostileThreat !== 'boolean') missing.push('resolutionEngine.activeHostileThreat:boolean');
    if (Object.prototype.hasOwnProperty.call(ledger.resolutionEngine || {}, 'primaryOppTarget')) missing.push('forbidden extra field resolutionEngine.primaryOppTarget');
    if (Object.prototype.hasOwnProperty.call(ledger.resolutionEngine || {}, 'primaryOpposition')) missing.push('forbidden extra field resolutionEngine.primaryOpposition');
    if (!Array.isArray(ledger.relationshipEngine)) missing.push('relationshipEngine');
    for (const [index, item] of (Array.isArray(ledger.relationshipEngine) ? ledger.relationshipEngine : []).entries()) {
        if (!AGGRESSION_METHODS.includes(item?.aggressionMethod)) missing.push(`relationshipEngine[${index}].aggressionMethod`);
        if (!item?.aggressionMethodEvidence) missing.push(`relationshipEngine[${index}].aggressionMethodEvidence`);
        if (!STANDING_INFLUENCES.includes(item?.standingInfluence)) missing.push(`relationshipEngine[${index}].standingInfluence`);
        if (!item?.standingBasis || (item.standingInfluence !== 'none' && isNoneValue(item.standingBasis))) missing.push(`relationshipEngine[${index}].standingBasis`);
    }
    if (!ledger.injuryEffectEngine) missing.push('injuryEffectEngine');
    if (!Array.isArray(ledger.injuryEffectEngine?.effects)) missing.push('injuryEffectEngine.effects');
    if (!ledger.userKnowledgeApplication) missing.push('userKnowledgeApplication');
    if (!Array.isArray(ledger.userKnowledgeApplication?.applications)) missing.push('userKnowledgeApplication.applications');
    if (!ledger.powerActorEnmity) missing.push('powerActorEnmity');
    if (!Array.isArray(ledger.powerActorEnmity?.assessments)) missing.push('powerActorEnmity.assessments');
    if (!Array.isArray(ledger.powerActorEnmity?.effects)) missing.push('powerActorEnmity.effects');
    if (!Array.isArray(ledger.powerActorEnmity?.latentGrievances)) missing.push('powerActorEnmity.latentGrievances');
    if (!Array.isArray(ledger.powerActorEnmity?.affiliationLinks)) missing.push('powerActorEnmity.affiliationLinks');
    if (!Array.isArray(ledger.powerActorEnmity?.latentFavors)) missing.push('powerActorEnmity.latentFavors');
    if (!Array.isArray(ledger.powerActorEnmity?.favorAffiliationLinks)) missing.push('powerActorEnmity.favorAffiliationLinks');
    if (!ledger.powerEventShape) missing.push('powerEventShape');
    if (!Array.isArray(ledger.powerEventShape?.events)) missing.push('powerEventShape.events');
    if (!ledger.trackerUpdateEngine) missing.push('trackerUpdateEngine');
    if (!ledger.trackerUpdateEngine?.user) missing.push('trackerUpdateEngine.user');
    if (!Array.isArray(ledger.trackerUpdateEngine?.npcs)) missing.push('trackerUpdateEngine.npcs');
    if (!ledger.trackerUpdateEngine?.boundCompanion) missing.push('trackerUpdateEngine.boundCompanion');
    if (!ledger.chaosSemantic) missing.push('chaosSemantic');
    if (missing.length) {
        throw new Error(`Mandatory semantic ledger contract failed; response invalid. Missing/invalid fields (${missing.join(', ')}): ${collectGeneratedTextCandidates(raw).join('\n').slice(0, 240)}`);
    }
}

export function validateSemanticWorldProgression(ledger, options = {}, context = {}) {
    let transition = normalizeWorldTransition(ledger?.worldTransition || {});
    const beforeWorldState = normalizeWorldState(options?.worldStateSnapshot || {});
    let assumedWorldState = projectWorldStateTransition(beforeWorldState, transition, {
        assumeSuccess: true,
        seed: 'semantic-world-transition',
    });
    const transitionChangesState = JSON.stringify(beforeWorldState) !== JSON.stringify(assumedWorldState);
    let rejectedUngroundedTransition = false;
    if (transitionChangesState && !semanticEvidenceAppearsInLatestInput(transition.evidence, options.latestUserText)) {
        console.warn('[Story Engine] Rejected ungrounded WorldTransition; continuing without changing scene state.', transition);
        transition = normalizeWorldTransition({});
        ledger.worldTransition = transition;
        assumedWorldState = projectWorldStateTransition(beforeWorldState, transition, {
            assumeSuccess: true,
            seed: 'semantic-world-transition',
        });
        rejectedUngroundedTransition = true;
    }
    const progression = normalizeWorldProgression(options?.worldProgressionSnapshot || {});
    let coverage = validateWorldProgressionAdvancementCoverage(
        progression,
        ledger?.worldProgression?.advancements || [],
        assumedWorldState,
    );
    if (rejectedUngroundedTransition && coverage.unexpected.length) {
        const duePlanIds = new Set(coverage.duePlanIds);
        ledger.worldProgression.advancements = coverage.advancements
            .filter(advancement => duePlanIds.has(advancement.planId));
        coverage = validateWorldProgressionAdvancementCoverage(
            progression,
            ledger.worldProgression.advancements,
            assumedWorldState,
        );
    }
    if (!coverage.valid) {
        const details = [
            coverage.missing.length ? `missing=${coverage.missing.join(',')}` : '',
            coverage.duplicate.length ? `duplicate=${coverage.duplicate.join(',')}` : '',
            coverage.unexpected.length ? `unexpected=${coverage.unexpected.join(',')}` : '',
            coverage.incomplete.length ? `missingEvidence=${coverage.incomplete.join(',')}` : '',
        ].filter(Boolean).join(' ');
        throw new Error(`World progression advancement coverage failed. ${details}`.trim());
    }

    const protectedNames = getPersonaIdentityHints(context);
    const unsafeText = ledger.worldProgression.advancements.flatMap(item => [
        item.consequence,
        ...item.evidence.map(evidence => evidence.text),
    ]).find(text => semanticWorldAdvancementMentionsPlayer(text, protectedNames));
    if (unsafeText) {
        throw new Error('World progression advancement described an off-screen effect on the player persona.');
    }
}

function semanticWorldAdvancementMentionsPlayer(value, protectedNames = []) {
    const text = String(value ?? '').normalize('NFKC');
    if (/\b(?:you|your|yours|yourself|yourselves|the user|the player(?: character)?|the protagonist)\b|\{\{user\}\}/i.test(text)) {
        return true;
    }
    return protectedNames.some(name => {
        if (name.length < 2) return false;
        const escaped = name.normalize('NFKC').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        return new RegExp(`(^|[^\\p{L}\\p{N}_])${escaped}(?=$|[^\\p{L}\\p{N}_])`, 'iu').test(text);
    });
}

function semanticEvidenceAppearsInLatestInput(value, latestUserText) {
    const evidence = normalizedSemanticEvidence(value);
    const input = normalizedSemanticEvidence(latestUserText);
    return evidence.length >= 3 && input.includes(evidence);
}

function normalizedSemanticEvidence(value) {
    return String(value ?? '')
        .normalize('NFKC')
        .trim()
        .replace(/\s+/g, ' ')
        .toLowerCase();
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
