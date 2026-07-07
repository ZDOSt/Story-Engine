const PERSONA_DESCRIPTION_POSITIONS = Object.freeze({
    IN_PROMPT: 0,
    AFTER_CHAR: 1,
    TOP_AN: 2,
    BOTTOM_AN: 3,
    AT_DEPTH: 4,
    NONE: 9,
});

const warnedAdapterFailures = new Set();
const extensionSettingsFallback = {};
const powerUserFallback = {};
let openAiModulePromise = null;
let powerUserModulePromise = null;
let personasModulePromise = null;

export const extension_settings = new Proxy({}, {
    get(_target, property) {
        return getExtensionSettings()?.[property];
    },
    set(_target, property, value) {
        const settings = getExtensionSettings();
        settings[property] = value;
        return true;
    },
    has(_target, property) {
        return property in getExtensionSettings();
    },
    ownKeys() {
        return Reflect.ownKeys(getExtensionSettings());
    },
    getOwnPropertyDescriptor(_target, property) {
        const settings = getExtensionSettings();
        if (!Object.prototype.hasOwnProperty.call(settings, property)) return undefined;
        return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: settings[property],
        };
    },
});

export const power_user = new Proxy({}, {
    get(_target, property) {
        return getPowerUserSettings()?.[property];
    },
    set(_target, property, value) {
        const settings = getPowerUserSettings();
        if (!settings) return false;
        settings[property] = value;
        return true;
    },
    has(_target, property) {
        return property in (getPowerUserSettings() || {});
    },
    ownKeys() {
        return Reflect.ownKeys(getPowerUserSettings() || {});
    },
    getOwnPropertyDescriptor(_target, property) {
        const settings = getPowerUserSettings() || {};
        if (!Object.prototype.hasOwnProperty.call(settings, property)) return undefined;
        return {
            configurable: true,
            enumerable: true,
            writable: true,
            value: settings[property],
        };
    },
});

export function getContext() {
    return globalThis.SillyTavern?.getContext?.() || null;
}

export function getExtensionSettings() {
    return getContext()?.extensionSettings || extensionSettingsFallback;
}

export function getPowerUserSettings() {
    return getContext()?.powerUserSettings || powerUserFallback;
}

export function getChatCompletionSettings() {
    return getContext()?.chatCompletionSettings || {};
}

export function getUserName() {
    return getContext()?.name1 || '';
}

export function getSlashCommandParser() {
    return getContext()?.SlashCommandParser || null;
}

export function getPersonaDescriptionPositions() {
    return PERSONA_DESCRIPTION_POSITIONS;
}

export function getConnectionProfileNames() {
    return (getExtensionSettings().connectionManager?.profiles || [])
        .map(profile => String(profile?.name || '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
}

export function getConnectionProfileByName(profileName) {
    const wanted = String(profileName || '').trim();
    if (!wanted) return null;
    return (getExtensionSettings().connectionManager?.profiles || [])
        .find(profile => String(profile?.name || '').trim().toLowerCase() === wanted.toLowerCase()) || null;
}

export function getActiveConnectionProfileName(fallbackName = '<None>') {
    const settings = getExtensionSettings();
    const selectedProfile = settings.connectionManager?.selectedProfile;
    const profile = (settings.connectionManager?.profiles || []).find(item => item.id === selectedProfile);
    return profile?.name || fallbackName;
}

export async function readActiveConnectionProfileName(fallbackName = '<None>') {
    const command = getSlashCommandParser()?.commands?.profile;
    if (command?.callback) {
        try {
            return String(await command.callback({}, '') || fallbackName);
        } catch (error) {
            warnOnce('readActiveConnectionProfileName', 'Could not read active connection profile through /profile; using settings fallback.', error);
        }
    }
    return getActiveConnectionProfileName(fallbackName);
}

export async function applyConnectionProfileName(profileName, fallbackName = '<None>') {
    const normalized = String(profileName || fallbackName);
    const command = getSlashCommandParser()?.commands?.profile;
    if (!command?.callback) {
        throw new Error('Connection profile switching is unavailable because SillyTavern /profile command is not registered.');
    }
    await command.callback({ 'await': 'true', timeout: '10000' }, normalized);
}

export function saveSettingsDebounced() {
    const fn = getContext()?.saveSettingsDebounced;
    if (typeof fn === 'function') return fn();
    warnOnce('saveSettingsDebounced', 'SillyTavern saveSettingsDebounced is unavailable; settings were not saved.');
    return undefined;
}

export function saveMetadataDebounced(context = getContext(), options = {}) {
    const fn = context?.saveMetadataDebounced;
    if (typeof fn === 'function') {
        fn.call(context);
        return true;
    }
    if (options?.warn !== false) {
        warnOnce('saveMetadataDebounced', 'SillyTavern saveMetadataDebounced is unavailable; chat metadata was not saved.');
    }
    return false;
}

export async function saveMetadata(context = getContext()) {
    const fn = context?.saveMetadata;
    if (typeof fn === 'function') {
        await fn.call(context);
        return true;
    }
    warnOnce('saveMetadata', 'SillyTavern saveMetadata is unavailable; chat metadata was not saved.');
    return false;
}

export async function persistMetadata(context = getContext()) {
    if (typeof context?.saveMetadataDebounced === 'function') {
        return saveMetadataDebounced(context);
    }
    return await saveMetadata(context);
}

export async function saveChat(context = getContext(), options = {}) {
    const fn = context?.saveChat;
    if (typeof fn === 'function') {
        await fn.call(context);
        return true;
    }
    if (options?.fallbackToMetadata) {
        return await persistMetadata(context);
    }
    warnOnce('saveChat', 'SillyTavern saveChat is unavailable; chat was not saved.');
    return false;
}

export function getRequestHeaders() {
    const fn = getContext()?.getRequestHeaders;
    if (typeof fn === 'function') return fn();
    warnOnce('getRequestHeaders', 'SillyTavern getRequestHeaders is unavailable; using empty request headers.');
    return {};
}

export function canGenerateRawData(context = getContext()) {
    return typeof context?.generateRawData === 'function';
}

export async function generateRawData(request = {}, context = getContext(), options = {}) {
    const fn = context?.generateRawData;
    if (typeof fn === 'function') {
        return await fn.call(context, request);
    }
    const purpose = String(options?.purpose || '').trim();
    throw new Error(`SillyTavern generateRawData API is unavailable${purpose ? ` for ${purpose}` : ''}.`);
}

export function canSubscribeToEvent(eventType, context = getContext()) {
    return Boolean(resolveEventName(eventType, context) && typeof context?.eventSource?.on === 'function');
}

export function onEvent(eventType, handler, context = getContext(), options = {}) {
    const eventName = resolveEventName(eventType, context);
    if (!eventName || typeof handler !== 'function') return false;
    const source = context?.eventSource;
    if (typeof source?.on === 'function') {
        source.on(eventName, handler);
        return true;
    }
    if (options?.warn !== false) {
        warnOnce(`onEvent:${eventType}`, `SillyTavern event subscription is unavailable for ${eventType}.`);
    }
    return false;
}

export function offEvent(eventType, handler, context = getContext(), options = {}) {
    const eventName = resolveEventName(eventType, context);
    if (!eventName || typeof handler !== 'function') return false;
    const source = context?.eventSource;
    if (typeof source?.off === 'function') {
        source.off(eventName, handler);
        return true;
    }
    if (typeof source?.removeListener === 'function') {
        source.removeListener(eventName, handler);
        return true;
    }
    if (options?.warn !== false) {
        warnOnce(`offEvent:${eventType}`, `SillyTavern event unsubscription is unavailable for ${eventType}.`);
    }
    return false;
}

export function emitEvent(eventType, context = getContext(), ...args) {
    const eventName = resolveEventName(eventType, context);
    const source = context?.eventSource;
    if (!eventName || typeof source?.emit !== 'function') return false;
    source.emit(eventName, ...args);
    return true;
}

export function stopGeneration(context = getContext()) {
    const fn = context?.stopGeneration;
    if (typeof fn === 'function') {
        fn.call(context);
        return true;
    }
    return emitEvent('GENERATION_STOPPED', context);
}

export function notifyInfo(message, title = '', options = {}) {
    return notify('info', message, title, options);
}

export function notifySuccess(message, title = '', options = {}) {
    return notify('success', message, title, options);
}

export function notifyError(message, title = '', options = {}) {
    return notify('error', message, title, options);
}

export function clearNotification(notification) {
    if (!notification) return false;
    const fn = globalThis.toastr?.clear;
    if (typeof fn !== 'function') return false;
    try {
        fn.call(globalThis.toastr, notification);
        return true;
    } catch (error) {
        warnOnce('clearNotification', 'SillyTavern toast clearing failed.', error);
        return false;
    }
}

export function onDomReady(callback) {
    if (typeof callback !== 'function') return false;
    const jq = globalThis.jQuery;
    if (typeof jq === 'function') {
        jq(callback);
        return true;
    }
    callback();
    return false;
}

export async function getChatCompletionModel(settings = getChatCompletionSettings()) {
    const contextFn = getContext()?.getChatCompletionModel;
    if (typeof contextFn === 'function') return contextFn(settings);

    const module = await importOpenAiModule();
    if (typeof module?.getChatCompletionModel === 'function') return module.getChatCompletionModel(settings);

    throw new Error('SillyTavern getChatCompletionModel is unavailable.');
}

export async function createGenerationParameters(settings, model, type, prompt) {
    const module = await importOpenAiModule();
    if (typeof module?.createGenerationParameters !== 'function') {
        throw new Error('SillyTavern createGenerationParameters is unavailable.');
    }
    return await module.createGenerationParameters(settings, model, type, prompt);
}

export async function getProxyPresets() {
    try {
        const module = await importOpenAiModule();
        return Array.isArray(module?.proxies) ? module.proxies : [];
    } catch (error) {
        warnOnce('proxies', 'SillyTavern proxy presets are unavailable; semantic profile request will continue without proxy metadata.', error);
        return [];
    }
}

export async function addEphemeralStoppingString(value) {
    try {
        const module = await importPowerUserModule();
        if (typeof module?.addEphemeralStoppingString === 'function') {
            module.addEphemeralStoppingString(value);
        }
    } catch (error) {
        warnOnce('addEphemeralStoppingString', 'SillyTavern ephemeral stopping strings are unavailable; semantic stop sentinel was not registered.', error);
    }
}

export async function flushEphemeralStoppingStrings() {
    try {
        const module = await importPowerUserModule();
        if (typeof module?.flushEphemeralStoppingStrings === 'function') {
            module.flushEphemeralStoppingStrings();
        }
    } catch (error) {
        warnOnce('flushEphemeralStoppingStrings', 'SillyTavern ephemeral stopping strings are unavailable; semantic stop sentinel cleanup was skipped.', error);
    }
}

export function getActiveUserAvatar() {
    const fromDom = getActiveUserAvatarFromDom();
    if (fromDom) return fromDom;

    const context = getContext();
    const powerUser = getPowerUserSettings();
    const chatPersona = String(context?.chatMetadata?.persona || '').trim();
    if (chatPersona) return chatPersona;

    const defaultPersona = String(powerUser?.default_persona || '').trim();
    if (defaultPersona) return defaultPersona;

    const personaIds = Object.keys(powerUser?.personas || {});
    return personaIds.length === 1 ? personaIds[0] : '';
}

export function getPersonaText(context = getContext()) {
    const fields = getCharacterCardFieldsSafe(context);
    const powerUser = getPowerUserSettings();
    const avatarId = String(getActiveUserAvatar() || '').trim();
    return [
        fields.persona,
        powerUser?.persona_description,
        avatarId ? powerUser?.persona_descriptions?.[avatarId]?.description : '',
    ].map(value => String(value || '').trim()).find(Boolean) || '';
}

export async function writePersonaDescription(description, context = getContext()) {
    const descriptor = getActivePersonaDescriptor();
    if (!descriptor) {
        throw new Error('No active SillyTavern persona is selected, so the generated character sheet could not be inserted into persona.');
    }

    const powerUser = getPowerUserSettings();
    const current = String(powerUser?.persona_description || descriptor.description || '').trim();
    const nextDescription = String(description || '').trim();
    if (!nextDescription) {
        throw new Error('Generated character sheet is empty; persona was not changed.');
    }

    powerUser.persona_description = nextDescription;
    descriptor.description = nextDescription;
    descriptor.position = descriptor.position ?? powerUser.persona_description_position ?? PERSONA_DESCRIPTION_POSITIONS.IN_PROMPT;
    if (descriptor.depth === undefined && powerUser.persona_description_depth !== undefined) descriptor.depth = powerUser.persona_description_depth;
    if (descriptor.role === undefined && powerUser.persona_description_role !== undefined) descriptor.role = powerUser.persona_description_role;
    if (descriptor.lorebook === undefined && powerUser.persona_description_lorebook !== undefined) descriptor.lorebook = powerUser.persona_description_lorebook;

    await refreshPersonaDescription();
    saveSettingsDebounced();
    await persistMetadata(context);

    return { previous: current, next: nextDescription };
}

export async function refreshPersonaDescription() {
    try {
        const module = await importPersonasModule();
        if (typeof module?.setPersonaDescription === 'function') {
            module.setPersonaDescription();
        }
    } catch (error) {
        warnOnce('setPersonaDescription', 'SillyTavern setPersonaDescription is unavailable; persona text was saved but the persona UI may not refresh immediately.', error);
    }
}

function getCharacterCardFieldsSafe(context = getContext()) {
    try {
        return typeof context?.getCharacterCardFields === 'function' ? context.getCharacterCardFields() : {};
    } catch (error) {
        warnOnce('getCharacterCardFields', 'Could not read character/persona fields.', error);
        return {};
    }
}

function getActivePersonaDescriptor() {
    const powerUser = getPowerUserSettings();
    powerUser.persona_descriptions = powerUser.persona_descriptions || {};

    const avatarId = String(getActiveUserAvatar() || '').trim();
    if (!avatarId) return null;

    if (!powerUser.persona_descriptions[avatarId]) {
        powerUser.persona_descriptions[avatarId] = {
            description: powerUser.persona_description || '',
            position: powerUser.persona_description_position ?? PERSONA_DESCRIPTION_POSITIONS.IN_PROMPT,
            depth: powerUser.persona_description_depth,
            role: powerUser.persona_description_role,
            lorebook: powerUser.persona_description_lorebook,
        };
    }

    return powerUser.persona_descriptions[avatarId];
}

export async function sendDefaultChatCompletionToolRequest(messages, responseLength, options = {}) {
    let generateData;
    const chatCompletionSettings = getChatCompletionSettings();
    try {
        const model = await getChatCompletionModel(chatCompletionSettings);
        const params = await createGenerationParameters(chatCompletionSettings, model, 'quiet', messages);
        generateData = params.generate_data;
    } catch (error) {
        throw adapterTransportError('Could not build SillyTavern chat-completion backend request for semantic tool call.', { cause: error, stage: 'build' });
    }

    const chatCompletionSource = generateData.chat_completion_source || chatCompletionSettings?.chat_completion_source;
    const tool = options?.buildTool?.(chatCompletionSource);
    const toolChoice = options?.buildToolChoice?.(chatCompletionSource);
    generateData.messages = messages;
    generateData.stream = false;
    generateData.n = undefined;
    if (tool) generateData.tools = [tool];
    if (toolChoice) generateData.tool_choice = toolChoice;
    options?.preparePayload?.(generateData);
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
        response = await fetch('/api/backends/chat-completions/generate', {
            method: 'POST',
            headers: getRequestHeaders(),
            body: JSON.stringify(generateData),
        });
    } catch (error) {
        throw adapterTransportError('SillyTavern backend semantic tool-call request failed before provider response.', { cause: error, stage: 'fetch' });
    }

    if (!response.ok) {
        let body = '';
        try {
            body = await response.text();
        } catch {
            body = '';
        }
        throw adapterTransportError(`SillyTavern backend rejected semantic tool-call request: ${response.status} ${response.statusText}${body ? ` ${body.slice(0, 600)}` : ''}`, {
            status: response.status,
            body,
            stage: 'response',
        });
    }

    return await response.json();
}

export function getChatCompletionSourceForProfile(profileId, profileName = '') {
    const context = getContext();
    const profile = getConnectionProfile(profileId);
    const chatCompletionSource = context?.CONNECT_API_MAP?.[profile?.api]?.source;
    if (!chatCompletionSource) {
        throw adapterTransportError(`Semantic profile "${profileName || profileId}" does not support chat-completion requests.`, { stage: 'profile' });
    }
    return chatCompletionSource;
}

export async function sendChatCompletionProfileRequest(request = {}) {
    const {
        profileId,
        profileName = '',
        prompt,
        responseLength,
        overridePayload = {},
        extractData = true,
        preparePayload = null,
    } = request;
    if (!profileId) {
        throw adapterTransportError('Semantic connection profile id is missing.', { stage: 'profile' });
    }

    const context = getContext();
    const profile = getConnectionProfile(profileId);
    const chatCompletionSource = context?.CONNECT_API_MAP?.[profile?.api]?.source;
    if (!context?.ChatCompletionService?.processRequest || !chatCompletionSource) {
        throw adapterTransportError(`Semantic profile "${profileName || profileId}" does not support direct chat-completion requests.`, { stage: 'profile' });
    }

    const proxies = await getProxyPresets();
    const proxyPreset = proxies.find(proxy => proxy.name === profile.proxy);
    const messages = Array.isArray(prompt)
        ? prompt
        : [{ role: 'user', content: String(prompt || '') }];

    const requestPayload = {
        stream: false,
        messages,
        max_tokens: responseLength,
        model: profile.model,
        chat_completion_source: chatCompletionSource,
        secret_id: profile['secret-id'],
        custom_url: profile['api-url'],
        vertexai_region: profile['api-url'],
        zai_endpoint: profile['api-url'],
        siliconflow_endpoint: profile['api-url'],
        reverse_proxy: proxyPreset?.url,
        proxy_password: proxyPreset?.password,
        custom_prompt_post_processing: profile['prompt-post-processing'],
        ...overridePayload,
    };
    preparePayload?.(requestPayload);

    return await context.ChatCompletionService.processRequest(
        requestPayload,
        {},
        extractData,
    );
}

function getActiveUserAvatarFromDom() {
    if (typeof document === 'undefined') return '';
    const selected = document.querySelector('#user_avatar_block .avatar-container.selected[data-avatar-id]');
    return String(selected?.getAttribute('data-avatar-id') || '').trim();
}

function getConnectionProfile(profileId) {
    const profile = getExtensionSettings().connectionManager?.profiles
        ?.find(item => item?.id === profileId);
    if (!profile) {
        throw adapterTransportError(`Semantic connection profile not found: ${profileId}`, { stage: 'profile' });
    }
    return profile;
}

function resolveEventName(eventType, context = getContext()) {
    const key = String(eventType || '').trim();
    if (!key) return '';
    const eventTypes = context?.eventTypes;
    if (!eventTypes || eventTypes[key] === undefined || eventTypes[key] === null) return '';
    return eventTypes[key] || '';
}

function notify(kind, message, title = '', options = {}) {
    const fn = globalThis.toastr?.[kind];
    if (typeof fn !== 'function') return null;
    try {
        return fn.call(globalThis.toastr, message, title, options) || null;
    } catch (error) {
        warnOnce(`notify:${kind}`, `SillyTavern ${kind} toast failed.`, error);
        return null;
    }
}

function adapterTransportError(message, details = {}) {
    const error = new Error(message);
    error.name = 'StoryEngineSTAdapterTransportError';
    if (details.status !== undefined) error.status = details.status;
    if (details.body !== undefined) error.body = details.body;
    if (details.stage !== undefined) error.stage = details.stage;
    if (details.cause !== undefined) error.cause = details.cause;
    return error;
}

function importOpenAiModule() {
    openAiModulePromise ||= import('../../../../scripts/openai.js');
    return openAiModulePromise;
}

function importPowerUserModule() {
    powerUserModulePromise ||= import('../../../../scripts/power-user.js');
    return powerUserModulePromise;
}

function importPersonasModule() {
    personasModulePromise ||= import('../../../../scripts/personas.js');
    return personasModulePromise;
}

function warnOnce(key, message, error = null) {
    if (warnedAdapterFailures.has(key)) return;
    warnedAdapterFailures.add(key);
    if (error) {
        console.warn(`[Story Engine ST Adapter] ${message}`, error);
    } else {
        console.warn(`[Story Engine ST Adapter] ${message}`);
    }
}
