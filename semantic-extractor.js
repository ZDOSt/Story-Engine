import { ENGINE_PROMPT_TEXT } from './engines.js';
import { PERSONALITY_ARCHETYPE_GLOSSARY, TRACKER_DELTA_CONTRACT, TRACKER_DELTA_END, TRACKER_DELTA_START, TRACKER_DELTA_TEMPLATE, TRACKER_DELTA_WRAPPER_END, TRACKER_DELTA_WRAPPER_START } from './tracker-delta-contract.js';
import { getRequestHeaders } from '../../../../script.js';
import { createGenerationParameters, getChatCompletionModel, oai_settings, proxies } from '../../../../scripts/openai.js';

export const SEMANTIC_PREFLIGHT_STOP_SENTINEL = 'SEMANTIC_PREFLIGHT_COMPLETE';
export { TRACKER_DELTA_CONTRACT, TRACKER_DELTA_END, TRACKER_DELTA_START, TRACKER_DELTA_TEMPLATE, TRACKER_DELTA_WRAPPER_END, TRACKER_DELTA_WRAPPER_START };

const SEMANTIC_RESPONSE_LENGTH_MIN = 4096;
const SEMANTIC_RESPONSE_LENGTH_MAX = 16384;
const SEMANTIC_RESPONSE_LENGTH_PER_TRACKED_NPC = 768;
const SEMANTIC_RESPONSE_LENGTH_PER_INFERRED_SCENE_NPC = 768;
const SEMANTIC_TOOL_NAME = 'submit_semantic_preflight';
const SEMANTIC_BACKEND_ENDPOINT = '/api/backends/chat-completions/generate';
const TRACKER_CONDITIONS = Object.freeze(['unchanged', 'healthy', 'bruised', 'wounded', 'badly_wounded', 'critical', 'dead']);
const TRACKER_NPC_DELTA_FIELDS = Object.freeze(['woundsAdd', 'woundsRemove', 'statusAdd', 'statusRemove', 'gearAdd', 'gearRemove']);
const TRACKER_USER_DELTA_FIELDS = Object.freeze([...TRACKER_NPC_DELTA_FIELDS, 'inventoryAdd', 'inventoryRemove', 'tasksAdd', 'tasksRemove', 'commitmentsAdd', 'commitmentsRemove']);
const DISABLE_THINKING_INCLUDE_BODY = 'thinking:\n  type: disabled';
const DEFAULT_NAME_STYLE = 'Balanced Fantasy';

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
    const result = await sendChatCompletionProfileRequest(
        prompt,
        responseLength,
        options,
        {
            temperature: 0,
            stop: [SEMANTIC_PREFLIGHT_STOP_SENTINEL],
            stopping_strings: [SEMANTIC_PREFLIGHT_STOP_SENTINEL],
            stop_sequence: [SEMANTIC_PREFLIGHT_STOP_SENTINEL],
        },
        true,
    );
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
    let generateData;
    const toolPrompt = buildSemanticToolPrompt(prompt);
    try {
        const model = getChatCompletionModel(oai_settings);
        const params = await createGenerationParameters(oai_settings, model, 'quiet', toolPrompt);
        generateData = params.generate_data;
    } catch (error) {
        throw new SemanticToolTransportError('Could not build SillyTavern chat-completion backend request for semantic tool call.', { cause: error });
    }

    const chatCompletionSource = generateData.chat_completion_source || oai_settings?.chat_completion_source;
    const semanticTool = buildSemanticPreflightTool(chatCompletionSource);
    generateData.messages = toolPrompt;
    generateData.stream = false;
    generateData.n = undefined;
    generateData.tools = [semanticTool];
    generateData.tool_choice = buildSemanticToolChoice(chatCompletionSource);
    applySemanticThinkingPayload(generateData, options);
    generateData.enable_web_search = false;
    delete generateData.request_images;
    delete generateData.request_image_resolution;
    delete generateData.request_image_aspect_ratio;
    delete generateData.json_schema;
    delete generateData.stop;

    if (Number.isFinite(responseLength) && responseLength > 0) {
        if (Object.prototype.hasOwnProperty.call(generateData, 'max_completion_tokens') && !Object.prototype.hasOwnProperty.call(generateData, 'max_tokens')) {
            generateData.max_completion_tokens = responseLength;
        } else {
            generateData.max_tokens = responseLength;
        }
    }

    if (Object.prototype.hasOwnProperty.call(generateData, 'temperature')) {
        generateData.temperature = 0;
    }

    let response;
    try {
        response = await fetch(SEMANTIC_BACKEND_ENDPOINT, {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(generateData),
        });
    } catch (error) {
        throw new SemanticToolTransportError('SillyTavern backend semantic tool-call request failed before provider response.', { cause: error });
    }

    if (!response.ok) {
        let body = '';
        try {
            body = await response.text();
        } catch {
            body = '';
        }
        throw new SemanticToolTransportError(`SillyTavern backend rejected semantic tool-call request: ${response.status} ${response.statusText}${body ? ` ${body.slice(0, 600)}` : ''}`, {
            status: response.status,
            body,
        });
    }

    const raw = await response.json();
    if (raw?.error) {
        throw new SemanticToolTransportError(`Provider returned an error for semantic tool-call request: ${previewRaw(raw)}`, { body: previewRaw(raw) });
    }
    const ledger = extractSemanticToolLedger(raw);
    return { raw, ledger };
}

async function generateSemanticToolCallWithProfile(context, prompt, responseLength, options = {}) {
    const profile = getConnectionProfile(options.semanticProfileId);
    const apiMap = context?.CONNECT_API_MAP?.[profile?.api];
    const chatCompletionSource = apiMap?.source;
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
        raw = await sendChatCompletionProfileRequest(
            toolPrompt,
            responseLength,
            options,
            overridePayload,
            false,
        );
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
    const result = await sendChatCompletionProfileRequest(prompt, responseLength, options, overridePayload, true);
    return extractGeneratedText(result);
}

export function extractGeneratedText(raw) {
    const candidates = extractTextCandidates(raw);
    return candidates[0] || '';
}

function applySemanticThinkingPayload(payload, options = {}) {
    if (options?.disableSemanticThinking === false) {
        return payload;
    }
    const source = String(payload.chat_completion_source || '').toLowerCase();
    payload.include_reasoning = false;
    payload.custom_include_body = mergeYamlObjectString(removeTopLevelYamlKey(payload.custom_include_body, 'thinking'), DISABLE_THINKING_INCLUDE_BODY);
    if (['openai', 'azure_openai', 'makersuite', 'vertexai', 'nanogpt'].includes(source)) {
        payload.reasoning_effort = 'min';
    } else {
        delete payload.reasoning_effort;
    }
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

function mergeYamlObjectString(...parts) {
    const merged = [];
    const seen = new Set();
    for (const part of parts) {
        const text = String(part || '').trim();
        if (!text) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        merged.push(text);
    }
    return merged.join('\n');
}

async function sendChatCompletionProfileRequest(prompt, responseLength, options = {}, overridePayload = {}, extractData = true) {
    if (!options?.semanticProfileId) {
        throw new SemanticToolTransportError('Semantic connection profile id is missing.');
    }

    const context = globalThis.SillyTavern?.getContext?.();
    const profile = getConnectionProfile(options.semanticProfileId);
    const apiMap = context?.CONNECT_API_MAP?.[profile?.api];
    const chatCompletionSource = apiMap?.source;
    if (!context?.ChatCompletionService?.processRequest || !chatCompletionSource) {
        throw new SemanticToolTransportError(`Semantic profile "${options.semanticProfileName || options.semanticProfileId}" does not support direct chat-completion requests.`);
    }

    const proxyPreset = proxies.find(proxy => proxy.name === profile.proxy);
    const messages = Array.isArray(prompt)
        ? prompt
        : [{ role: 'user', content: String(prompt || '') }];

    const requestPayload = applySemanticThinkingPayload({
            stream: false,
            messages,
            max_tokens: responseLength,
            model: profile.model,
            chat_completion_source: chatCompletionSource,
            custom_url: profile['api-url'],
            vertexai_region: profile['api-url'],
            zai_endpoint: profile['api-url'],
            siliconflow_endpoint: profile['api-url'],
            reverse_proxy: proxyPreset?.url,
            proxy_password: proxyPreset?.password,
            custom_prompt_post_processing: profile['prompt-post-processing'],
            ...overridePayload,
        },
        options,
    );

    return await context.ChatCompletionService.processRequest(
        requestPayload,
        {},
        extractData,
    );
}

function getConnectionProfile(profileId) {
    const profile = globalThis.SillyTavern?.getContext?.()?.extensionSettings?.connectionManager?.profiles
        ?.find(item => item?.id === profileId);
    if (!profile) {
        throw new SemanticToolTransportError(`Semantic connection profile not found: ${profileId}`);
    }
    return profile;
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
        'The tool argument paths mirror the engine function names: resolutionEngine.identifyGoal = ResolutionEngine.identifyGoal, resolutionEngine.identifyChallenge = ResolutionEngine.identifyChallenge, resolutionEngine.identifyTargets = ResolutionEngine.identifyTargets, resolutionEngine.mapStats = ResolutionEngine.mapStats, relationshipEngine[index].initPreset = RelationshipEngine.initPreset semantic tags, relationshipEngine[index] = RelationshipEngine(npc), chaosSemantic = CHAOS_INTERRUPT, and nameSemantic = NameGenerationEngine candidates.',
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
    const coreStatsSchema = {
        type: 'object',
        additionalProperties: false,
        required: ['Rank', 'MainStat', 'PHY', 'MND', 'CHA'],
        properties: {
            Rank: { type: 'string', enum: ['none', 'Weak', 'Average', 'Trained', 'Elite', 'Boss'] },
            MainStat: { type: 'string', enum: ['none', 'PHY', 'MND', 'CHA', 'Balanced'] },
            PHY: { type: 'integer' },
            MND: { type: 'integer' },
            CHA: { type: 'integer' },
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
    const stakeChangeSchema = {
        type: 'object',
        additionalProperties: false,
        required: STAKE_OUTCOME_KEYS,
        properties: Object.fromEntries(STAKE_OUTCOME_KEYS.map(key => [key, { type: 'string', enum: ['benefit', 'harm', 'none'] }])),
    };

    return {
        type: 'object',
        additionalProperties: false,
        required: ['engineContext', 'resolutionEngine', 'relationshipEngine', 'injuryEffectEngine', 'trackerUpdateEngine', 'chaosSemantic', 'nameSemantic'],
        properties: {
            engineContext: {
                type: 'object',
                additionalProperties: false,
                required: ['userCoreStats', 'trackerRelevantNPCs'],
                properties: {
                    userCoreStats: coreStatsSchema,
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
                    'identifyTargets',
                    'intimacyAdvanceExplicit',
                    'boundaryViolationExplicit',
                    'nonLethal',
                    'hasStakes',
                    'actionCount',
                    'mapStats',
                    'classifyHostilePhysicalIntent',
                    'activeHostileThreat',
                    'classifyPhysicalBoundaryPressure',
                    'genStats',
                ],
                properties: {
                    identifyGoal: { type: 'string' },
                    identifyChallenge: { type: 'string' },
                    explicitMeans: { type: 'string' },
                    identifyTargets: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['hostilesInScene', 'ActionTargets', 'OppTargets', 'BenefitedObservers', 'HarmedObservers'],
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
                        },
                    },
                    intimacyAdvanceExplicit: { type: 'boolean' },
                    boundaryViolationExplicit: { type: 'boolean' },
                    nonLethal: {
                        type: 'boolean',
                        description: 'Y only for explicitly nonlethal violence or contests: sparring, training, practice combat, fistfights, barehanded brawls, nonlethal grappling/restraint, capture-only attempts, or stated intent to avoid serious/fatal harm. N for weapons, improvised weapons, claws, teeth, horns, natural weapons, lethal magic, body-damaging supernatural effects, or uncertain cases.',
                    },
                    hasStakes: { type: 'boolean' },
                    actionCount: stringListSchema,
                    mapStats: {
                        type: 'object',
                        additionalProperties: false,
                        required: ['USER', 'OPP'],
                        properties: {
                            USER: { type: 'string', enum: ['PHY', 'MND', 'CHA'] },
                            OPP: { type: 'string', enum: ['PHY', 'MND', 'CHA', 'ENV'] },
                        },
                    },
                    classifyHostilePhysicalIntent: { type: 'boolean' },
                    activeHostileThreat: { type: 'boolean' },
                    classifyPhysicalBoundaryPressure: { type: 'boolean' },
                    genStats: coreStatsSchema,
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
                                    description: 'Y only for explicit prior romantic/in-love/willing context with this NPC; not friendliness, flirting, attraction, or first impressions.',
                                },
                                userBadRep: {
                                    type: 'boolean',
                                    description: 'Y only for explicit prior hate, distrust, enemy status, pursuit, betrayal, harm, or bad reputation with this NPC; not current-scene conflict alone.',
                                },
                                priorUserGoodRep: {
                                    type: 'boolean',
                                    description: 'Y only for explicit established favorable prior history/reputation/trust/gratitude with this NPC; not kindness or good impressions only in this interaction.',
                                },
                                userNonHuman: {
                                    type: 'boolean',
                                    description: 'Y only for explicitly visible demonic, monstrous, undead, bestial, eldritch, construct-like, or obviously supernatural user form; not normal fantasy peoples or hidden ancestry.',
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
                            required: ['CurrentInvitation', 'Exploitation', 'Hedonist', 'Transactional', 'Established'],
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
                            },
                        },
                        genStats: coreStatsSchema,
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
            nameSemantic: {
                type: 'object',
                additionalProperties: false,
                required: ['selectedStyle', 'maleCandidates', 'femaleCandidates', 'locationCandidates'],
                properties: {
                    selectedStyle: { type: 'string' },
                    maleCandidates: { type: 'array', items: { type: 'string' } },
                    femaleCandidates: { type: 'array', items: { type: 'string' } },
                    locationCandidates: { type: 'array', items: { type: 'string' } },
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
    '- RelationshipEngine entries must use RelationshipEngine[0], RelationshipEngine[1], etc. Include one entry for each living NPC in ActionTargets, OppTargets.NPC, BenefitedObservers, or HarmedObservers. Do not create RelationshipEngine entries from hostilesInScene.NPC alone unless that NPC is also in one of those target/observer lists.',
    '- If no living NPC is in those target/observer lists, output RelationshipEngine.count=0 and no RelationshipEngine[index] lines.',
    '- RelationshipEngine[index].initPreset is only "how this NPC initially feels toward {{user}}" when currentDisposition is missing. Check all available context: active SillyTavern prompt stack, character card, persona name/text, scenario, lore/world info, tracker snapshot, and chat history. The semantic pass chooses only these Y/N tags; deterministic code assigns B/F/H stats. romanticOpen=Y only if this NPC is already romantically/intimately involved with {{user}}, already willing toward {{user}}, or explicitly in love with {{user}} in prior context. userBadRep=Y only if {{user}} is hated, distrusted, wanted, enemy-coded, or has a bad prior reputation with this NPC before the current first interaction. priorUserGoodRep=Y only if prior lore/card/scenario/tracker/history explicitly gives {{user}} an established favorable reputation with this NPC before the current scene; first-encounter kindness, rescue, courtesy, friendliness, praise, or warm first impression do not count. userNonHuman=Y only if {{user}} is explicitly visibly inhuman, demonic, monstrous, undead, bestial, eldritch, or construct-like. Deterministic code treats this as feared/awe-struck caution, not an immediate fear lock, unless {{user}} later behaves threateningly/negatively toward that NPC before trust is earned. fearImmunity=Y only if this NPC is the same kind/race category as that user form, a superior or peer supernatural/monstrous being, explicitly immune/naturally resistant to fear or mental fear, or card/lore/scenario explicitly portrays them as an ancient/powerful/non-ordinary being that has faced such horrors and is not meaningfully afraid of them. Title, rank, bravado, posturing, composure, courage, or pretending to be fearless do not count.',
    '- RelationshipEngine[index].establishedRelationship is true only if this NPC already has B4 relationship state and tracker establishedRelationship=Y, or the current explicit scene shows a direct romantic/love/relationship declaration or request from {{user}} accepted by that NPC, or from that NPC accepted by {{user}}. If the immediately previous NPC message contains a clear love/relationship confession or request, and the current user input accepts it verbally or through unmistakable romantic reciprocation such as kissing/embracing without refusal, return true. If the immediately previous user input contains a clear love/relationship confession or request, and the current NPC response accepted it, return true. It must establish an actual romantic relationship, partnership, lovers status, dating/courting bond, or equivalent committed romantic connection. Flirting, attraction, arousal, sex, prior intimacy, affection, kindness, trust, loyalty, closeness, friendship, gratitude, protectiveness, or B4 alone does not count.',
    '- RelationshipEngine[index].romanceStyle is for B4 pre-relationship initiative only. Return nervous if explicit card/lore/context portrays this NPC as shy, reserved, guarded, restrained, formal, awkward, timid, emotionally cautious, or likely to show romantic interest through hesitation. Return flirt if explicit card/lore/context portrays this NPC as bold, outgoing, playful, teasing, direct, seductive, socially confident, or likely to show romantic interest through open flirtation. Return auto if unclear or mixed.',
    '- RelationshipEngine[index].checkThreshold override flags must use all available context: active SillyTavern prompt stack, character card, persona name/text, scenario, lore/world info, tracker snapshot, and chat history. CurrentInvitation=Y when this NPC clearly and directly offers, requests, invites, strongly implies, or physically initiates sexual/intimate escalation with {{user}} in the current or immediately recent scene, and has not withdrawn, refused, panicked, or been interrupted by danger. Mark CurrentInvitation=Y for irrefutable sexual invitation hints even when phrased as teasing questions, such as "I wonder how tight I would be for you. Want to find out?" Do not mark CurrentInvitation for ordinary flirting, suggestive banter, compliments, attraction, embarrassment, vague innuendo without an invitation, or a user-originated proposal the NPC has not accepted. Exploitation=Y when card/lore/context explicitly makes this NPC exploitable by {{user}} or the current situation: naive, easily led or persuaded, follows {{user}}\'s lead without question, dependent, trapped, coerced, powerless, sheltered to an unsafe degree, or otherwise unable to safely judge/resist. Do not mark Exploitation for mere innocence, shyness, kindness, friendliness, attraction, low confidence, or normal inexperience without explicit vulnerability/suggestibility. Hedonist=Y only for explicitly sexually open, pleasure-seeking, casual, promiscuous, or eager intimacy context. Transactional=Y only for explicit willingness to exchange intimacy for money, goods, favors, protection, status, or services. Established=Y only for explicit prior/current intimate access with current or recent receptivity toward {{user}}, such as casual lovers, friends with benefits, an ongoing sexual arrangement, or explicit comfort/willingness with renewed intimacy. Do not mark Established for prior intimacy alone when current receptivity is absent, stale, unclear, refused, fearful, hostile, coerced, or boundary-limited. establishedRelationship remains its separate relationship-state mechanic.',
    '- RelationshipEngine[index].slowBondEvidence is scene-local semantic evidence for slow B3-to-B4 trust growth. Mark only categories explicitly shown in the latest scene/current immediate context. respectfulContact=welcome/respectful physical contact or physical help; cooperation=constructive cooperation toward a shared purpose; comfortInProximity=NPC remains or settles close without fear, duty, coercion, or forced circumstance; boundaryRespect={{user}} respects refusal, hesitation, privacy, space, limits, consent, or a stated boundary; sharedRoutine=repeated or mundane togetherness such as eating/traveling/working/resting/training/tending camp; playfulness=mutual light teasing, joking, banter, or relaxed warmth; teamwork=coordinated effort under pressure/danger/conflict/crisis; personalAttention=specific attention to NPC needs, preferences, wellbeing, vulnerability, history, comfort, or concerns. blockers include coercion, intimidation, betrayal, humiliation, unwanted intimacy pressure, boundary violation, unresolved harm, exploitation, active fear, active hostility, or trapped/dependent/powerless circumstances that make closeness unsafe to count.',
    '- ResolutionEngine.identifyTargets.hostilesInScene.NPC is scene-level: list ALL established, present, living hostile entities currently threatening {{user}}, companions, protected NPCs, bystanders, or the scene generally. Identify this broad hostile pool before choosing OppTargets.NPC. Establishment must come from assistant narration, tracker, character/scenario/lore context, or the initial test setup; do not create a hostile from the latest user input alone. Exclude friendly/neutral NPCs, absent/offscreen entities, defeated/incapacitated entities no longer posing danger, and non-living hazards/obstacles.',
    '- ResolutionEngine.identifyTargets.OppTargets.NPC is narrower: list only living entities directly opposing, contesting, resisting, blocking, defending against, or being attacked/challenged by {{user}}\'s current action/challenge. Do not put every enemy in OppTargets.NPC just because they are hostile; use hostilesInScene.NPC for the broader hostile pool.',
    '- ResolutionEngine.activeHostileThreat is strict. Return Y only if the current scene contains an immediate hostile danger from an NPC/entity: attacking, charging, preparing to attack, pursuing, ambushing, threatening violence, monster/hostile creature engagement, armed standoff, capture attempt, or imminent physical/supernatural harm. Return N for negotiation, refusal, bargaining, argument, social resistance, authority denial, suspicion, rivalry, nonviolent obstruction, or ordinary OppTargets.NPC without immediate danger.',
    '- ResolutionEngine.intimacyAdvanceExplicit is strict. Return Y only if {{user}} explicitly attempts, requests, accepts, or reciprocates actual intimate escalation with a specific NPC: kissing, making out, sexual touch, undressing toward intimacy, asking to sleep together, asking for sex, moving to bed, or clearly initiating romantic/sexual physical closeness. Return Y for accepting or reciprocating a prior explicit NPC-initiated intimacy invitation or action. Return N for flirting, teasing, compliments, romantic banter, suggestive jokes, vague innuendo, "what did you have in mind", declarations of love, asking for a date, emotional confession, hand-holding, casual proximity, or ordinary affection that does not clearly escalate into kissing or sexual/intimate contact. This is only an intimacy permission/boundary signal and does not create stakes, rolls, landed actions, Bond loss, Fear, or Hostility by itself.',
    '- ResolutionEngine.boundaryViolationExplicit is strict. Return Y only if the current user input explicitly violates, ignores, or pressures past a clear refusal, stated boundary, withdrawal, fear, incapacitation, explicitly established lack of consent, or prior denial from this specific NPC. Return Y for coercion, threats, force, unwanted restraint/contact after refusal, repeated pressure after refusal, humiliation, blackmail, or ignoring a clear stop/no. Return N for flirting, teasing, romantic talk, asking permission, accepting or reciprocating NPC-initiated flirtation/intimacy, backing off/respecting a boundary, or ordinary romantic/sexual ambiguity where no refusal/boundary/incapacity has been explicitly established.',
    '- ResolutionEngine.nonLethal is strict. Return Y only for explicitly nonlethal violence or contests: sparring, training, practice combat, fistfights, barehanded brawls, wrestling/grappling without lethal force, restraint-only takedowns, capture-only attempts, or stated intent to avoid serious/fatal harm. Return Y when scene rules, an instructor, an arena, duel terms, or {{user}} explicitly frame the current physical conflict as nonlethal. Return N for weapons, blades, arrows, spears, axes, clubs, improvised weapons, claws, teeth, horns, natural weapons, lethal magic, body-damaging supernatural effects, or any uncertain attack.',
    '- All genStats groups must include Rank, MainStat, PHY, MND, CHA.',
    '- InjuryEffectEngine is semantic-only candidate extraction for effects the user action would cause if deterministic mechanics say the action lands. It does not roll and does not decide success. Include physical injuries and impairing magical/status effects regardless of source: burns, poison, paralysis, sickness, blindness, fear/panic, restraint, curses, lightning/electrical effects, exhaustion, mental effects, or other ongoing impairing states. Exclude purely emotional/social harm, mere witnessing, momentary pain, intended/requested future injuries, or effects that would not persist or impair later action.',
    '- InjuryEffectEngine target must be the entity actually receiving the impairing effect. HarmedObservers may appear only if they are directly affected by the injury/status effect, not merely emotionally harmed by seeing or caring about another target. Use persistence=lasting and affectsAction=Y only for effects that should impair later action if applied.',
    '- TrackerUpdateEngine is explicit-only visual state tracking. Output deltas only from the latest user input and immediate visible context. Use condition=unchanged, personalitySummary=unchanged, and (none) lists unless a change is explicitly stated.',
    '- TrackerUpdateEngine must never rewrite full inventories, gear, wounds, status, tasks, or commitments from silence. Add only explicit new items/effects/tasks. Remove only explicit dropped/spent/used-up/lost/completed/canceled/failed/abandoned entries. Remove wounds/status only when the text explicitly says the injury or status is healed, cured, recovered, restored, regenerated, magically healed, knitted closed, gone, or no longer impairing.',
    '- TrackerUpdateEngine must not treat a requested, intended, commanded, allowed, promised, predicted, or pending attempted action as an established wound/status/condition change. "I tell him to hit my arm hard enough to bruise it", "I stab him", or "I let the blow land" is not woundsAdd/statusAdd/condition by itself. "My arm is already bruised", "his arm is bleeding", or "I am poisoned" is.',
    '- TrackerUpdateEngine must track only current lasting injuries/status. Do not track momentary pain, impact, a hit landing, being knocked back/down, being winded, losing breath, flinching, staggering, or temporary shock unless the text explicitly establishes an ongoing bruise, cut, bleeding, sprain, break, fracture, poison, sickness, restraint, exhaustion, unconsciousness, or similar continuing state.',
    '- TrackerUpdateEngine NPC revealedName is identity tracking only. If final narration explicitly reveals that an already tracked generic NPC/person/role is actually named something, set NPC to the existing tracker label and revealedName to the revealed proper name. Example: tracked NPC "bystander" says "Torvinash." as an introduction -> NPC=bystander and revealedName=Torvinash. Use revealedName only when the narration semantically identifies which tracked generic NPC received the name; if multiple possible generic NPCs exist and identity is unclear, use (none).',
    '- TrackerUpdateEngine NPC personalitySummary is optional stable personality memory. If this is the first meaningful tracking of an NPC or the existing personalitySummary is empty, assign a compact personality seed when card/lore/scenario/context or visible behavior supports one. Use the best matching glossary archetype only when evidence clearly fits; otherwise use none/custom. Always pair the archetype with concrete traits and intensity, e.g. tsundere; proud, guarded, sharp-tongued; hides concern through criticism; intensity:medium. If personalitySummary already exists, use unchanged unless durable context clearly contradicts or refines it. Do not write mood, temporary emotion, injuries, relationship state, attraction, fear/hostility level, or what happened this turn.',
    'PERSONALITY_ARCHETYPE_GLOSSARY:',
    PERSONALITY_ARCHETYPE_GLOSSARY,
    '- If TrackerUpdateEngine.NPC.count > 0, every NPC[index] entry must include NPC, revealedName, personalitySummary, condition, woundsAdd, woundsRemove, statusAdd, statusRemove, gearAdd, and gearRemove.',
    '- TrackerUpdateEngine NPC entries are only for NPCs with explicit condition, wound, status, visible gear, or stable personalitySummary changes in this turn. NPC inventory is not tracked. If none, output TrackerUpdateEngine.NPC.count=0 and no NPC[index] lines.',
    '- NameGenerationEngine semantic lines are candidate generation only. Generate exactly 3 male person/entity names, 3 female person/entity names, and 3 location names matching the selected style line. Make them creative, readable, pronounceable, and real-but-unplaceable. Avoid Western stock fantasy, Tolkien/JRPG drift, ordinary modern names, famous names, joke names, and letter soup. These are candidates only; deterministic validation may reject, repair, or replace them before narration.',
    '- Companion/ally commands are tactical requests only. They can address the companion as an ActionTarget and can refer to an established hostile by name for later companion crisis targeting, but they must not be treated as {{user}} making the companion act, must not force a companion attack, and must not create a user-resolved success/failure roll for companion obedience. The named hostile must still be established through assistant narration/tracker/card/scenario/lore/initial test setup and belongs in hostilesInScene.NPC unless it directly opposes {{user}}\'s current action. If several hostiles exist and no specific one is named, do not guess a target.',
    '- Do not output primaryOppTarget or primaryOpposition. The only opposing living target list is identifyTargets.OppTargets.NPC; the separate broad hostile pool is identifyTargets.hostilesInScene.NPC.',
    '- If you cannot find explicit evidence, use the engine default for that line; never invent missing facts.',
].join('\n');

const COMPACT_LEDGER_TEMPLATE = `BEGIN_SEMANTIC_PREFLIGHT
engineContext.getUserCoreStats.Rank=none
engineContext.getUserCoreStats.MainStat=none
engineContext.getUserCoreStats.PHY=1
engineContext.getUserCoreStats.MND=1
engineContext.getUserCoreStats.CHA=1
ResolutionEngine.identifyGoal=Normal_Interaction
ResolutionEngine.identifyChallenge=Normal_Interaction
ResolutionEngine.explicitMeans=(none)
ResolutionEngine.identifyTargets.hostilesInScene.NPC=(none)
ResolutionEngine.identifyTargets.ActionTargets=(none)
ResolutionEngine.identifyTargets.OppTargets.NPC=(none)
ResolutionEngine.identifyTargets.OppTargets.ENV=(none)
ResolutionEngine.identifyTargets.BenefitedObservers=(none)
ResolutionEngine.identifyTargets.HarmedObservers=(none)
ResolutionEngine.intimacyAdvanceExplicit=N
ResolutionEngine.boundaryViolationExplicit=N
ResolutionEngine.nonLethal=N
ResolutionEngine.hasStakes=N
ResolutionEngine.actionCount=a1
ResolutionEngine.mapStats.USER=PHY
ResolutionEngine.mapStats.OPP=ENV
ResolutionEngine.classifyHostilePhysicalIntent=N
ResolutionEngine.activeHostileThreat=N
ResolutionEngine.classifyPhysicalBoundaryPressure=N
ResolutionEngine.genStats.Rank=none
ResolutionEngine.genStats.MainStat=none
ResolutionEngine.genStats.PHY=1
ResolutionEngine.genStats.MND=1
ResolutionEngine.genStats.CHA=1
RelationshipEngine.count=0
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
CHAOS_INTERRUPT.sceneSummary=short scene summary
NameGenerationEngine.selectedStyle=Balanced Fantasy
NameGenerationEngine.maleCandidates=(none)
NameGenerationEngine.femaleCandidates=(none)
NameGenerationEngine.locationCandidates=(none)
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
    const nameStyle = normalizeNameStyleOption(options?.nameStyle || DEFAULT_NAME_STYLE);
    return COMPACT_LEDGER_TEMPLATE.replace('NameGenerationEngine.selectedStyle=Balanced Fantasy', `NameGenerationEngine.selectedStyle=${nameStyle}`);
}

function buildSemanticContractText(userName, charName, type, trackerSnapshot, playerTrackerSnapshot = {}, options = {}) {
    const nameStyle = normalizeNameStyleOption(options?.nameStyle || DEFAULT_NAME_STYLE);
    const proxyAction = options?.userInputMode === 'proxy'
        ? String(options?.proxyUserAction || '').trim()
        : '';
    return `Active names: user=${userName}, character=${charName}\nGeneration type=${type || 'normal'}\nSelected name style=${nameStyle}\nNPC tracker snapshot JSON:\n${JSON.stringify(trackerSnapshot, null, 2)}\nPlayer tracker snapshot JSON:\n${JSON.stringify(playerTrackerSnapshot, null, 2)}\n\n` +
        'You are the semantic extraction pass for a SillyTavern roleplay rules extension. ' +
        'The output contract is mandatory and non-negotiable: return exactly one compact preflight ledger block matching the supplied engine-name-anchored lines. ' +
        'Any response that renames fields, returns JSON, returns prose, returns markdown fences, returns an empty block, or leaves required lines missing is completely invalid and will be discarded. ' +
        'Do not narrate. Do not roll dice. Do not calculate outcomes. ' +
        (proxyAction ? `The latest user message used double square brackets for proxy action mode. Treat the inner instruction as {{user}}'s actual attempted action for semantic classification: "${clip(proxyAction, 800)}". Ignore the wrapper brackets themselves. ` : '') +
        'Classify only contextual/semantic predicates needed by the engines. Use EXPLICIT-ONLY and FIRST-YES-WINS from the engine reference. ' +
        'The semantic/contextual fields you return are authoritative; the deterministic runner should not reinterpret them. ' +
        'hasStakes is contextual and FINAL: return true only when success or failure would materially change stakes under DEF.STAKES; return false for truly no-stakes acts. ' +
        'Living/non-living target separation is mandatory: hostilesInScene.NPC, ActionTargets, OppTargets.NPC, BenefitedObservers, HarmedObservers, RelationshipEngine NPC entries, and NPCInScene candidates are living entities only; objects, terrain, hazards, wards, magic effects, rooms, tools, furniture, paths, and obstacles are OppTargets.ENV only. ' +
        'Execute target identification in this order: first identify hostilesInScene.NPC as ALL established, present, living hostile entities in scene; then identify which targets, if any, directly oppose {{user}}\'s current action as OppTargets.NPC. hostilesInScene.NPC is a broad hostile pool and does not itself create relationship changes, rolls, NPCInScene entries, or OppTargets.NPC. A hostile is established only if present in assistant narration, tracker, character/scenario/lore context, or the initial test setup; do not create hostiles from the latest user input alone. Exclude friendly/neutral NPCs, absent/offscreen entities, defeated/incapacitated enemies no longer posing danger, and non-living hazards/obstacles. Companion/ally commands are tactical requests only: they may address the companion as an ActionTarget and may name an established hostile for later companion crisis targeting, but do not treat the command as {{user}} making the companion act, do not force a companion attack, and do not create a user-resolved success/failure roll for companion obedience. If several hostiles exist and no specific hostile is named, do not guess. ' +
        'OppTargets.NPC is only for stakes-bearing living opposition/resistance/contest against {{user}}\'s current action/challenge: directly opposing, contesting, resisting, blocking, defending against, or being attacked/challenged by {{user}}. If hasStakes=false, OppTargets.NPC must be ["(none)"]. If a living ActionTarget meaningfully resists/opposes a stakes-bearing action, that same NPC may also appear in OppTargets.NPC. Do not put every enemy in OppTargets.NPC merely because they are hostile; use hostilesInScene.NPC for the broader hostile pool. ' +
        'BenefitedObservers and HarmedObservers are living entities present in scene who are NOT already in ActionTargets or OppTargets.NPC. Do not put a direct target or opposing NPC in observer lists. ' +
        'Create one relationshipEngine entry for each living NPC in ActionTargets, OppTargets.NPC, BenefitedObservers, or HarmedObservers. Do not create entries for bystanders, hostilesInScene-only NPCs, or inferred scene participants outside those target/observer lists. ' +
        'For each living NPC in relationshipEngine, stakeChangeByOutcome must describe that NPC stakes change for each outcome: benefit means their stakes improve, harm means their stakes worsen, none means no meaningful stake change. For explicit boundary violations toward a direct/opposing NPC target, successful or landed outcomes worsen that NPC boundary/autonomy/trust stakes, so use harm and not none. ' +
        'If a named NPC is a primary target and tracker currentCoreStats are missing, generate that NPC core stat block from explicit portrayal and copy the same block into ResolutionEngine genStats and the matching RelationshipEngine genStats. ' +
        'Do not leave a named portrayed NPC as Rank none or 1/1/1 unless the card, scene, and tracker give no explicit portrayal at all. ' +
        'Mandatory engine execution order for this semantic pass: read the Engine reference above, then execute only the semantic/contextual portions of the engines. ' +
        'Execute ResolutionEngine(input) semantic functions in order: identifyGoal, identifyChallenge, identifyTargets, classifyHostilePhysicalIntent, activeHostileThreat, classifyPhysicalBoundaryPressure, intimacyAdvanceExplicit, boundaryViolationExplicit, nonLethal, hasStakes, actionCount, mapStats, getUserCoreStats, getCurrentCoreStats/genStats. Copy those outputs into the ResolutionEngine lines using the exact function/key names shown in the template. ' +
        'Do NOT execute ResolutionEngine.resolveOutcome, dice, margins, landed actions, or counter potential; deterministic code handles those after your ledger. ' +
        'Execute RelationshipEngine(npc, resolutionPacket) semantic functions in order for each target/observer living NPC: current state context, initPreset tag selection, auditInteraction/stakeChangeByOutcome, route context flags, checkThreshold override flags, establishedRelationship, slowBondEvidence, genStats. For initPreset, use all available context in the assembled SillyTavern prompt stack, character card, persona name/text, scenario, lore/world info, tracker snapshot, and chat history, but output only the semantic Y/N tags; deterministic code maps those tags to B/F/H. For checkThreshold override flags, also use all available context; mark CurrentInvitation when the NPC clearly offers, requests, invites, strongly implies, or physically initiates sexual/intimate escalation with {{user}} in the current or immediately recent scene and has not withdrawn/refused/panicked/been interrupted. Mark Exploitation when explicit card/lore/history says the NPC is naive, easily led/persuaded, follows {{user}}\'s lead without question, dependent, trapped, coerced, powerless, unsafely sheltered, or otherwise exploitable by {{user}} or the current situation. Do not treat active combat/hostility as an initPreset by itself. Do not use establishedRelationship as an initPreset tag; establishedRelationship remains its separate relationship-state mechanic. Copy those outputs into the RelationshipEngine[index] lines using the exact function/key names shown in the template. ' +
        'Execute InjuryEffectEngine after ResolutionEngine and RelationshipEngine: identify only actual injury/status-effect candidates that the user action would cause if it lands. The semantic pass decides target, effectType, affected body/function, persistence, and whether it affects action from context; deterministic mechanics later decide whether it lands and the final impairment severity. Source does not matter: physical attacks, magic, poison, paralysis, fear/panic, restraint, disease, burns, lightning/electrical effects, curses, exhaustion, mental status, and other ongoing impairing effects all qualify when they would impair later action. Mere emotional/social harm, witnessing harm to someone else, fear as ordinary emotion without an impairing status, momentary pain, impact, knockdown, or a requested/intended future injury does not qualify. ' +
        'Then fill CHAOS_INTERRUPT.sceneSummary from its engine/contextual requirements. ' +
        `Execute NameGenerationEngine as semantic candidate generation only: selectedStyle must be "${nameStyle}", maleCandidates must contain exactly 3 male person/entity names, femaleCandidates exactly 3 female person/entity names, and locationCandidates exactly 3 location names. Follow the selected style and naming rules in the engine reference. Do not use fixed stock names, ordinary modern-Western names, famous names, jokes, or letter soup. Deterministic code will validate and expose only the approved final pool. ` +
        'Execute TrackerUpdateEngine as explicit-only persistent tracker deltas after RelationshipEngine. TrackerUpdateEngine is for display/state memory only, not outcome resolution. ' +
        'TrackerUpdateEngine.User records only explicit changes to the player condition, wounds, status effects, gear, inventory, tasks, and commitments. TrackerUpdateEngine.NPC records only explicit changes to tracked or directly affected NPC condition, wounds, status effects, visible gear, and concise stable personality summaries. NPC inventory is not tracked. ' +
        'Use condition=unchanged unless the latest user input or immediate visible context explicitly establishes a completed/current health state as healthy, bruised, wounded, badly_wounded, critical, or dead. Do not set condition from a desired/requested future injury or from an attempted action before narration confirms the result. ' +
        'Use Add only for explicit gains/new injuries/new effects/new obligations. Use Remove only for explicit dropping, spending, losing, completing, canceling, failing, or abandoning. Remove wounds/status only when the text explicitly says the injury or status is healed, cured, recovered, restored, regenerated, magically healed, knitted closed, gone, or no longer impairing. Bandaging, splinting, dressing, cleaning, stitching, stabilizing, normal care, or starting treatment does not remove injuries unless the text also says the injury/status is gone, healed, cured, fully recovered, or no longer impairing. Never infer unchanged lists from silence and never output a full replacement list. ' +
        'Do not mark wounds/status/condition from requested, intended, commanded, allowed, promised, predicted, or pending attempted actions before deterministic resolution; only track state already explicit as current/completed in context. ' +
        'Do not track momentary pain, impact, knockdown, stagger, breath loss, winded reaction, or temporary shock as wounds/status/condition unless an ongoing injury or continuing status is explicitly stated. ' +
        'For TrackerUpdateEngine NPC revealedName, use semantic identity resolution: when final narration reveals that an existing tracked generic NPC/person/role is named, keep NPC as the existing tracker label and write revealedName as the proper name. This is for renaming generic entries such as bystander, man, stranger, guard, raider, or Unknown Woman once their name is revealed. If several tracked generic NPCs could match and the narration does not clearly identify which one, use (none). For NPC personalitySummary, use stable personality memory only. If this is first meaningful tracking or the current summary is empty, write a compact seed when explicit card/context or the scene reveals enduring temperament or interaction style. Choose an archetype only when the evidence clearly matches the glossary; otherwise use none/custom. Always pair the archetype with concrete behavior and intensity. If an NPC already has a summary, leave unchanged unless durable evidence clearly refines it. Do not summarize mood, attraction, relationship score, fear/hostility, injuries, or temporary reactions. Personality archetype glossary: ' + PERSONALITY_ARCHETYPE_GLOSSARY.replace(/\n/g, ' ') + ' ' +
        'NPC proactivity cap is deterministic; do not output semantic lines for it. ' +
        'Tie rule override: exact roll ties are cinematic stalemates/struggles, not defender wins; include stakeChangeByOutcome.struggle accordingly. ' +
        'Do not use deterministic outcomes, dice, or guesses to change semantic stakes. ' +
        'Important classification reminders: Romantic, flirtatious, affectionate, suggestive, sexual, or intimate conversation/contact is not a special roll category and does not create stakes by itself. intimacyAdvanceExplicit is strict permission/boundary classification for actual intimate escalation only: mark it true for explicit kissing, sexual touch, undressing toward intimacy, asking to sleep together/have sex, or accepting a prior explicit NPC intimacy invitation; keep it false for flirting, teasing, vague innuendo, compliments, declarations of love, dates, hand-holding, ordinary affection, or "what did you have in mind" style banter. Asking permission, teasing, flirting, declarations of love, reciprocating NPC-initiated flirtation/intimacy, kissing, embracing, or making an intimate proposal should be ordinary no-roll scene behavior unless ordinary DEF.STAKES applies for another reason. boundaryViolationExplicit is the romance/boundary trigger for mechanics: mark it true only for clear coercion, threats, force, unwanted contact/restraint after refusal, repeated pressure after refusal, humiliation, blackmail, or ignoring a clear stop/no; do not mark it true for uncertainty or ordinary romantic/sexual ambiguity. nonLethal is a strict death-gate flag: mark it true only for explicitly nonlethal sparring, training, practice, barehanded fistfights/brawls, nonlethal grappling/restraint, capture-only attempts, or stated intent/scene rules to avoid serious or fatal harm; mark it false for weapons, improvised weapons, claws, teeth, horns, natural weapons, lethal magic, body-damaging supernatural effects, or uncertainty. identifyChallenge is the explicit stakes-bearing action/challenge; ignore incidental gestures, setup, delivery method, movement, or flavor unless that act itself carries stakes. classifyHostilePhysicalIntent is true only for direct bodily aggression/control against a living entity: attack, assault, strike, shove, tackle, choke, cut, stab, injure, twist/hurt/crush a grabbed body part, violent restraint, pin, immobilization, dragging/forced movement, physical domination, blocking escape with bodily force, or preventing casting/action with bodily force. A grab/catch/hold is hostilePhysicalIntent only when it explicitly includes harm, attack, violent restraint, pinning, dragging, forced movement, twisting/crushing, choking, domination, or preventing bodily action by force. classifyHostilePhysicalIntent is false for grabbing/catching/holding an NPC wrist, arm, shoulder, sleeve, cloak, or clothing only to stop/delay/get attention/block departure/contest immediate movement unless explicit harm, attack, violent restraint, pinning, dragging, forced movement, twisting/crushing, choking, domination, or bodily injury is also stated. It is false for taking/grabbing/pulling/snatching/opening/moving/contesting an object, possession, access point, path, or space unless {{user}} also attacks, harms, violently restrains, pins, shoves, drags, or controls the NPC body. activeHostileThreat is true only for immediate hostile danger from an NPC/entity: attacking, charging, preparing to attack, pursuing, ambushing, threatening violence, monster/hostile creature engagement, armed standoff, capture attempt, or imminent physical/supernatural harm. It is false for negotiation, refusal, bargaining, argument, social resistance, authority denial, suspicion, rivalry, nonviolent obstruction, or ordinary OppTargets.NPC without immediate danger. classifyPhysicalBoundaryPressure is true for stakes-bearing forceful object/possession/space/access/departure/body-adjacent boundary contests against a resisting NPC when classifyHostilePhysicalIntent is false; catching or holding an NPC wrist/arm/sleeve only to stop them leaving or force attention is boundary pressure, not combat. Boundary pressure does not create multi-action combat impact, CounterPotential, or H4 by itself. initPreset is semantic tag selection only and means only how the NPC initially feels toward {{user}}; activeHostileThreat and establishedRelationship must not be used as initPreset labels. hostilesInScene.NPC is all established present living hostiles and is not relationship routing. ActionTargets and observers must be living entities only; non-living obstacles/objects/hazards/effects go only in OppTargets.ENV. OppTargets.NPC requires stakes-bearing living opposition to {{user}} current action; no-stakes social attention, casual banter, compliments, or flavor actions should keep the NPC as ActionTarget only. BenefitedObservers and HarmedObservers must exclude direct ActionTargets and OppTargets.NPC; a complimented NPC is an ActionTarget, not a BenefitedObserver. A protected/rescued NPC is a BenefitedObserver unless {{user}} directly acts on that NPC. For hasStakes, apply DEF.STAKES directly and contextually: if success/failure of the final goal or explicit challenge materially affects safety, harm, danger, detection, material gain/loss, significant status/authority/trust, autonomy/physical freedom, hostile restraint/immobilization/confinement, obstacle resolution, or explicit goal advancement/failure for {{user}} or a living entity, return true; if success/failure would not materially change outcome, return false. Minor mood, flavor, casual rudeness, weak preference, or trivial convenience alone is not stakes. For mapStats, map the stat from the final goal or explicit challenge that carries stakes, not incidental gestures, flavor, delivery method, or setup. Positive social opposition such as persuasion, negotiation, diplomacy, bargaining, reassurance, reconciliation, or good-faith appeal against a living opposing target is USER=CHA and OPP=CHA; negative social opposition such as bluff, deception, intimidation, coercion, threat, blackmail, manipulation, interrogation, humiliation, or forced submission against a living opposing target is USER=CHA and OPP=MND. Body-affecting magic against a living target (paralysis, poison, blindness, forced sleep, pain, muscle lock, disease, transmutation, bodily binding) is USER=MND and OPP=PHY; non-living hazards/effects remain OppTargets.ENV and OPP=ENV unless a living target explicitly resists. For each living NPC, mark stakeChangeByOutcome for each possible outcome strictly by DEF.STAKES: benefit only if that outcome significantly and concretely improves their stakes; harm if it materially worsens their stakes; otherwise none. Do not mark benefit for compliments, flirting, mood improvement, politeness, ordinary conversation, user self-advancement, successful negotiation for the user, choosing not to harm the NPC, failing to harm the NPC, de-escalation without a concrete NPC gain, or the NPC merely surviving/remaining safe.\n\n' +
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
        return stripStructuredDebug(content).trim();
    }
    if (Array.isArray(content)) {
        return content.map(part => {
            if (part && typeof part === 'object' && typeof part.text === 'string') {
                return { ...part, text: stripStructuredDebug(part.text).trim() };
            }
            return part;
        }).filter(part => !isEmptyContent(part?.text ?? part));
    }
    return content;
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
    if (!ledger?.engineContext?.userCoreStats) missing.push('engineContext.userCoreStats');
    if (!Array.isArray(ledger?.engineContext?.trackerRelevantNPCs)) missing.push('engineContext.trackerRelevantNPCs');
    if (!ledger?.resolutionEngine) missing.push('resolutionEngine');
    if (!ledger?.resolutionEngine?.identifyGoal) missing.push('resolutionEngine.identifyGoal');
    if (!ledger?.resolutionEngine?.identifyChallenge) missing.push('resolutionEngine.identifyChallenge');
    if (!ledger?.resolutionEngine?.identifyTargets) missing.push('resolutionEngine.identifyTargets');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.hostilesInScene?.NPC)) missing.push('resolutionEngine.identifyTargets.hostilesInScene.NPC');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.ActionTargets)) missing.push('resolutionEngine.identifyTargets.ActionTargets');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.OppTargets?.NPC)) missing.push('resolutionEngine.identifyTargets.OppTargets.NPC');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.OppTargets?.ENV)) missing.push('resolutionEngine.identifyTargets.OppTargets.ENV');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.BenefitedObservers)) missing.push('resolutionEngine.identifyTargets.BenefitedObservers');
    if (!Array.isArray(ledger?.resolutionEngine?.identifyTargets?.HarmedObservers)) missing.push('resolutionEngine.identifyTargets.HarmedObservers');
    if (typeof ledger?.resolutionEngine?.hasStakes !== 'boolean') missing.push('resolutionEngine.hasStakes:boolean');
    if (typeof ledger?.resolutionEngine?.nonLethal !== 'boolean') missing.push('resolutionEngine.nonLethal:boolean');
    if (!Array.isArray(ledger?.resolutionEngine?.actionCount)) missing.push('resolutionEngine.actionCount');
    if (!ledger?.resolutionEngine?.mapStats?.USER) missing.push('resolutionEngine.mapStats.USER');
    if (!ledger?.resolutionEngine?.mapStats?.OPP) missing.push('resolutionEngine.mapStats.OPP');
    if (typeof ledger?.resolutionEngine?.classifyHostilePhysicalIntent !== 'boolean') missing.push('resolutionEngine.classifyHostilePhysicalIntent:boolean');
    if (typeof ledger?.resolutionEngine?.activeHostileThreat !== 'boolean') missing.push('resolutionEngine.activeHostileThreat:boolean');
    if (typeof ledger?.resolutionEngine?.classifyPhysicalBoundaryPressure !== 'boolean') missing.push('resolutionEngine.classifyPhysicalBoundaryPressure:boolean');
    if (Object.prototype.hasOwnProperty.call(ledger?.resolutionEngine || {}, 'hostilePhysicalIntent')) missing.push('forbidden extra field resolutionEngine.hostilePhysicalIntent');
    if (Object.prototype.hasOwnProperty.call(ledger?.resolutionEngine || {}, 'primaryOppTarget')) missing.push('forbidden extra field resolutionEngine.primaryOppTarget');
    if (Object.prototype.hasOwnProperty.call(ledger?.resolutionEngine || {}, 'primaryOpposition')) missing.push('forbidden extra field resolutionEngine.primaryOpposition');
    if (!Array.isArray(ledger?.relationshipEngine)) missing.push('relationshipEngine');
    if (!ledger?.injuryEffectEngine) missing.push('injuryEffectEngine');
    if (!Array.isArray(ledger?.injuryEffectEngine?.effects)) missing.push('injuryEffectEngine.effects');
    if (!ledger?.trackerUpdateEngine) missing.push('trackerUpdateEngine');
    if (!ledger?.trackerUpdateEngine?.user) missing.push('trackerUpdateEngine.user');
    if (!Array.isArray(ledger?.trackerUpdateEngine?.npcs)) missing.push('trackerUpdateEngine.npcs');
    if (!ledger?.chaosSemantic) missing.push('chaosSemantic');
    if (!ledger?.nameSemantic) missing.push('nameSemantic');
    if (!Array.isArray(ledger?.nameSemantic?.maleCandidates)) missing.push('nameSemantic.maleCandidates');
    if (!Array.isArray(ledger?.nameSemantic?.femaleCandidates)) missing.push('nameSemantic.femaleCandidates');
    if (!Array.isArray(ledger?.nameSemantic?.locationCandidates)) missing.push('nameSemantic.locationCandidates');
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
        'engineContext.getUserCoreStats.Rank',
        'engineContext.getUserCoreStats.MainStat',
        'engineContext.getUserCoreStats.PHY',
        'engineContext.getUserCoreStats.MND',
        'engineContext.getUserCoreStats.CHA',
        'ResolutionEngine.identifyGoal',
        'ResolutionEngine.identifyChallenge',
        'ResolutionEngine.explicitMeans',
        'ResolutionEngine.identifyTargets.hostilesInScene.NPC',
        'ResolutionEngine.identifyTargets.ActionTargets',
        'ResolutionEngine.identifyTargets.OppTargets.NPC',
        'ResolutionEngine.identifyTargets.OppTargets.ENV',
        'ResolutionEngine.identifyTargets.BenefitedObservers',
        'ResolutionEngine.identifyTargets.HarmedObservers',
        'ResolutionEngine.intimacyAdvanceExplicit',
        'ResolutionEngine.boundaryViolationExplicit',
        'ResolutionEngine.nonLethal',
        'ResolutionEngine.hasStakes',
        'ResolutionEngine.actionCount',
        'ResolutionEngine.mapStats.USER',
        'ResolutionEngine.mapStats.OPP',
        'ResolutionEngine.classifyHostilePhysicalIntent',
        'ResolutionEngine.activeHostileThreat',
        'ResolutionEngine.classifyPhysicalBoundaryPressure',
        'ResolutionEngine.genStats.Rank',
        'ResolutionEngine.genStats.MainStat',
        'ResolutionEngine.genStats.PHY',
        'ResolutionEngine.genStats.MND',
        'ResolutionEngine.genStats.CHA',
        'RelationshipEngine.count',
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
        'NameGenerationEngine.selectedStyle',
        'NameGenerationEngine.maleCandidates',
        'NameGenerationEngine.femaleCandidates',
        'NameGenerationEngine.locationCandidates',
    ];
    const missing = required.filter(key => !fields.has(key));
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
            `${prefix}.genStats.Rank`,
            `${prefix}.genStats.MainStat`,
            `${prefix}.genStats.PHY`,
            `${prefix}.genStats.MND`,
            `${prefix}.genStats.CHA`,
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
            },
            genStats: readCoreGroup(fields, `${prefix}.genStats`),
        });
    }

    const resolutionEngine = {
        identifyGoal: cleanScalar(fields.get('ResolutionEngine.identifyGoal')) || 'Normal_Interaction',
        identifyChallenge: cleanScalar(fields.get('ResolutionEngine.identifyChallenge')) || cleanScalar(fields.get('ResolutionEngine.identifyGoal')) || 'Normal_Interaction',
        explicitMeans: cleanScalar(fields.get('ResolutionEngine.explicitMeans')) || '(none)',
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
        },
        intimacyAdvanceExplicit: readBoolean(fields, 'ResolutionEngine.intimacyAdvanceExplicit', false),
        boundaryViolationExplicit: readBoolean(fields, 'ResolutionEngine.boundaryViolationExplicit', false),
        nonLethal: readBoolean(fields, 'ResolutionEngine.nonLethal', false),
        hasStakes: readBoolean(fields, 'ResolutionEngine.hasStakes', false),
        actionCount: readList(fields, 'ResolutionEngine.actionCount', ['a1']),
        mapStats: {
            USER: normalizeUserStat(fields.get('ResolutionEngine.mapStats.USER')),
            OPP: normalizeOppStat(fields.get('ResolutionEngine.mapStats.OPP')),
        },
        classifyHostilePhysicalIntent: readBoolean(fields, 'ResolutionEngine.classifyHostilePhysicalIntent', false),
        activeHostileThreat: readBoolean(fields, 'ResolutionEngine.activeHostileThreat', false),
        classifyPhysicalBoundaryPressure: readBoolean(fields, 'ResolutionEngine.classifyPhysicalBoundaryPressure', false),
        genStats: readCoreGroup(fields, 'ResolutionEngine.genStats'),
    };
    validateRelationshipCoverage(resolutionEngine, relationshipEngine);

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
            userCoreStats: readCoreGroup(fields, 'engineContext.getUserCoreStats'),
            trackerRelevantNPCs: trackerSnapshotToLedgerEntries(trackerSnapshot),
        },
        resolutionEngine,
        relationshipEngine,
        injuryEffectEngine,
        chaosSemantic: {
            sceneSummary: cleanScalar(fields.get('CHAOS_INTERRUPT.sceneSummary')) || '',
        },
        trackerUpdateEngine,
        nameSemantic: {
            selectedStyle: cleanScalar(fields.get('NameGenerationEngine.selectedStyle')) || DEFAULT_NAME_STYLE,
            maleCandidates: readList(fields, 'NameGenerationEngine.maleCandidates'),
            femaleCandidates: readList(fields, 'NameGenerationEngine.femaleCandidates'),
            locationCandidates: readList(fields, 'NameGenerationEngine.locationCandidates'),
        },
        proactivitySemantic: {},
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

    return { user, npcs };
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

function isInjuryCondition(condition) {
    return ['bruised', 'wounded', 'badly_wounded', 'critical', 'dead'].includes(condition);
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

function validateRelationshipCoverage(resolutionEngine, relationshipEngine) {
    const requiredNames = [
        ...resolutionEngine.identifyTargets.ActionTargets,
        ...resolutionEngine.identifyTargets.OppTargets.NPC,
        ...resolutionEngine.identifyTargets.BenefitedObservers,
        ...resolutionEngine.identifyTargets.HarmedObservers,
    ].filter(name => name && !isNoneValue(name));
    const relationshipNames = new Set(relationshipEngine.map(item => normalizeNameKey(item.NPC)));
    const missing = requiredNames.filter(name => !relationshipNames.has(normalizeNameKey(name)));
    if (missing.length) {
        throw new Error(`compact ledger missing RelationshipEngine entry for target/observer names: ${missing.join(', ')}`);
    }
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

function normalizeUserStat(value) {
    const text = cleanScalar(value).toUpperCase();
    return ['PHY', 'MND', 'CHA'].includes(text) ? text : 'PHY';
}

function normalizeOppStat(value) {
    const text = cleanScalar(value).toUpperCase();
    return ['PHY', 'MND', 'CHA', 'ENV'].includes(text) ? text : 'ENV';
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
    return TRACKER_CONDITIONS.includes(text) ? text : 'unchanged';
}

function normalizeTrackerStateCondition(value) {
    const text = cleanScalar(value).toLowerCase().replace(/[\s-]+/g, '_');
    return TRACKER_CONDITIONS.includes(text) && text !== 'unchanged' ? text : 'healthy';
}

function normalizeTrackerDeltaList(value) {
    if (!Array.isArray(value)) return [];
    return value.map(cleanScalar).filter(item => item && !isNoneValue(item) && item.toLowerCase() !== 'unchanged').slice(0, 20);
}

function normalizePersonalitySummary(value) {
    const text = cleanScalar(value).replace(/\s+/g, ' ').trim();
    if (!text || isNoneValue(text) || ['unknown', 'unchanged'].includes(text.toLowerCase())) return '';
    return text.slice(0, 160);
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

function normalizeNameStyleOption(value) {
    const text = cleanScalar(value);
    return text || DEFAULT_NAME_STYLE;
}

function normalizeNameCandidateList(value) {
    const raw = Array.isArray(value) ? value : [];
    const result = [];
    const seen = new Set();
    for (const item of raw) {
        const text = cleanScalar(item).replace(/\s+/g, ' ');
        if (!text || isNoneValue(text)) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(text.slice(0, 40));
        if (result.length >= 3) break;
    }
    return result;
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
    ledger.resolutionEngine.actionCount = normalizeActionMarkers(ledger.resolutionEngine.actionCount);
    ledger.resolutionEngine.mapStats = ledger.resolutionEngine.mapStats || {};
    ledger.resolutionEngine.hasStakes = toBoolean(ledger.resolutionEngine.hasStakes, false);
    ledger.resolutionEngine.intimacyAdvanceExplicit = toBoolean(ledger.resolutionEngine.intimacyAdvanceExplicit, false);
    ledger.resolutionEngine.boundaryViolationExplicit = toBoolean(ledger.resolutionEngine.boundaryViolationExplicit, false);
    ledger.resolutionEngine.nonLethal = toBoolean(ledger.resolutionEngine.nonLethal, false);
    ledger.resolutionEngine.classifyHostilePhysicalIntent = toBoolean(ledger.resolutionEngine.classifyHostilePhysicalIntent, false);
    ledger.resolutionEngine.activeHostileThreat = toBoolean(ledger.resolutionEngine.activeHostileThreat, false);
    ledger.resolutionEngine.classifyPhysicalBoundaryPressure = toBoolean(ledger.resolutionEngine.classifyPhysicalBoundaryPressure, false);
    delete ledger.resolutionEngine.hostilePhysicalIntent;
    delete ledger.resolutionEngine.primaryOppTarget;
    delete ledger.resolutionEngine.primaryOpposition;
    ledger.resolutionEngine.genStats = normalizeCore(ledger.resolutionEngine.genStats);
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
        item.genStats = normalizeCore(item.genStats);
    });
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
    ledger.nameSemantic = {
        selectedStyle: normalizeNameStyleOption(ledger.nameSemantic?.selectedStyle),
        maleCandidates: normalizeNameCandidateList(ledger.nameSemantic?.maleCandidates),
        femaleCandidates: normalizeNameCandidateList(ledger.nameSemantic?.femaleCandidates),
        locationCandidates: normalizeNameCandidateList(ledger.nameSemantic?.locationCandidates),
    };
    ledger.proactivitySemantic = {};
    return ledger;
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

function validateNormalizedLedger(ledger, raw) {
    const missing = [];
    if (!ledger.engineContext) missing.push('engineContext');
    if (!ledger.engineContext?.userCoreStats) missing.push('engineContext.userCoreStats');
    if (!Array.isArray(ledger.engineContext?.trackerRelevantNPCs)) missing.push('engineContext.trackerRelevantNPCs');
    if (!ledger.resolutionEngine) missing.push('resolutionEngine');
    if (!ledger.resolutionEngine?.identifyGoal) missing.push('resolutionEngine.identifyGoal');
    if (!ledger.resolutionEngine?.identifyChallenge) missing.push('resolutionEngine.identifyChallenge');
    if (!ledger.resolutionEngine?.identifyTargets) missing.push('resolutionEngine.identifyTargets');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.hostilesInScene?.NPC)) missing.push('resolutionEngine.identifyTargets.hostilesInScene.NPC');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.ActionTargets)) missing.push('resolutionEngine.identifyTargets.ActionTargets');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.OppTargets?.NPC)) missing.push('resolutionEngine.identifyTargets.OppTargets.NPC');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.OppTargets?.ENV)) missing.push('resolutionEngine.identifyTargets.OppTargets.ENV');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.BenefitedObservers)) missing.push('resolutionEngine.identifyTargets.BenefitedObservers');
    if (!Array.isArray(ledger.resolutionEngine?.identifyTargets?.HarmedObservers)) missing.push('resolutionEngine.identifyTargets.HarmedObservers');
    if (typeof ledger.resolutionEngine?.hasStakes !== 'boolean') missing.push('resolutionEngine.hasStakes:boolean');
    if (typeof ledger.resolutionEngine?.intimacyAdvanceExplicit !== 'boolean') missing.push('resolutionEngine.intimacyAdvanceExplicit:boolean');
    if (typeof ledger.resolutionEngine?.boundaryViolationExplicit !== 'boolean') missing.push('resolutionEngine.boundaryViolationExplicit:boolean');
    if (!Array.isArray(ledger.resolutionEngine?.actionCount)) missing.push('resolutionEngine.actionCount');
    if (!ledger.resolutionEngine?.mapStats?.USER) missing.push('resolutionEngine.mapStats.USER');
    if (!ledger.resolutionEngine?.mapStats?.OPP) missing.push('resolutionEngine.mapStats.OPP');
    if (typeof ledger.resolutionEngine?.classifyHostilePhysicalIntent !== 'boolean') missing.push('resolutionEngine.classifyHostilePhysicalIntent:boolean');
    if (typeof ledger.resolutionEngine?.activeHostileThreat !== 'boolean') missing.push('resolutionEngine.activeHostileThreat:boolean');
    if (typeof ledger.resolutionEngine?.classifyPhysicalBoundaryPressure !== 'boolean') missing.push('resolutionEngine.classifyPhysicalBoundaryPressure:boolean');
    if (Object.prototype.hasOwnProperty.call(ledger.resolutionEngine || {}, 'hostilePhysicalIntent')) missing.push('forbidden extra field resolutionEngine.hostilePhysicalIntent');
    if (Object.prototype.hasOwnProperty.call(ledger.resolutionEngine || {}, 'primaryOppTarget')) missing.push('forbidden extra field resolutionEngine.primaryOppTarget');
    if (Object.prototype.hasOwnProperty.call(ledger.resolutionEngine || {}, 'primaryOpposition')) missing.push('forbidden extra field resolutionEngine.primaryOpposition');
    if (!Array.isArray(ledger.relationshipEngine)) missing.push('relationshipEngine');
    if (!ledger.injuryEffectEngine) missing.push('injuryEffectEngine');
    if (!Array.isArray(ledger.injuryEffectEngine?.effects)) missing.push('injuryEffectEngine.effects');
    if (!ledger.trackerUpdateEngine) missing.push('trackerUpdateEngine');
    if (!ledger.trackerUpdateEngine?.user) missing.push('trackerUpdateEngine.user');
    if (!Array.isArray(ledger.trackerUpdateEngine?.npcs)) missing.push('trackerUpdateEngine.npcs');
    if (!ledger.chaosSemantic) missing.push('chaosSemantic');
    if (!ledger.nameSemantic) missing.push('nameSemantic');
    if (!Array.isArray(ledger.nameSemantic?.maleCandidates)) missing.push('nameSemantic.maleCandidates');
    if (!Array.isArray(ledger.nameSemantic?.femaleCandidates)) missing.push('nameSemantic.femaleCandidates');
    if (!Array.isArray(ledger.nameSemantic?.locationCandidates)) missing.push('nameSemantic.locationCandidates');
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
