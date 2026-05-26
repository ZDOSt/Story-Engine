import { ENGINE_PROMPT_TEXT, classifyDisposition, normalizeTrackerEntry, normalizeTrackerUserState } from './engines.js';
import { name1, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../../scripts/extensions.js';
import { addEphemeralStoppingString, flushEphemeralStoppingStrings } from '../../../../scripts/power-user.js';
import { persona_description_positions, power_user } from '../../../../scripts/power-user.js';
import { setPersonaDescription, user_avatar } from '../../../../scripts/personas.js';
import { rotateSecret, SECRET_KEYS, secret_state } from '../../../../scripts/secrets.js';
import { SlashCommandParser } from '../../../../scripts/slash-commands/SlashCommandParser.js';
import { formatNarratorModelPromptContext, formatNarratorPromptContext } from './pre-flight.js';
import { extractGeneratedText, extractSemanticLedger, parseNarratorTrackerDelta, SEMANTIC_PREFLIGHT_STOP_SENTINEL, sendSemanticProfileTextRequest } from './semantic-extractor.js';
import { buildPlayerTrackerSnapshot, buildTrackerSnapshot, normalizeRapportClockState, runDeterministicEngines, saveTrackerUpdate } from './deterministic-runner.js';
import { applyContextualInjuryCapsToTrackerDelta, collectContextualInjuryCaps } from './tracker-injury-caps.js';
import { TRACKER_DELTA_CONTRACT, TRACKER_DELTA_TEMPLATE } from './tracker-delta-contract.js';
import {
    STREAMING_ARTIFACT_REGEX_SCRIPT_ID,
    STREAMING_ARTIFACT_REGEX_SCRIPT_NAME,
    STREAMING_ARTIFACT_REGEX_PATTERN,
    buildStreamingArtifactRegexScript,
} from './streaming-artifact-regex.js';
import { getExplicitNamePromotions, isPromotableTrackerName } from './tracker-name-promotions.js';
import { sanitizeAssistantNarration, stripComputedDebugPrefix, stripNarratorMetaPrefix, stripStructuredArtifacts } from './narration-sanitizer.js';

const EXTENSION_NAME = 'Story Engine';
const SETTINGS_KEY = 'structuredPreflightEngines';
const SETTINGS_CONTAINER_ID = 'structured_preflight_settings_container';
const NARRATOR_PROMPT_KEY = 'structured_preflight_narrator_context';
const WRITING_STYLE_PROMPT_KEY = 'structured_preflight_10_writing_style';
const PROSE_RULES_PROMPT_KEY = 'structured_preflight_20_prose_rules';
const FINAL_REMINDER_PROMPT_KEY = 'structured_preflight_30_final_reminder';
const LEGACY_WRITING_STYLE_PROMPT_KEY = 'structured_preflight_writing_style';
const LEGACY_PROSE_RULES_PROMPT_KEY = 'structured_preflight_prose_rules';
const PROFILE_NONE = '<None>';
const TRACKER_PROFILE_CURRENT = '<Current semantic profile>';
const PROSE_GUARD_PROFILE_CURRENT = '<Current semantic profile>';
const TRACKER_DISPLAY_EXTRA_KEY = 'structured_preflight_tracker_display';
const TRACKER_DISPLAY_BLOCK_CLASS = 'structured-preflight-tracker-block';
const TRACKER_DISPLAY_VERSION = 1;
const TRACKER_VISIBLE_INACTIVE_LIMIT = 2;
const TRACKER_WIDGET_ID = 'structured_preflight_tracker_widget';
const TRACKER_WIDGET_BUTTON_ID = 'structured_preflight_tracker_toggle';
const TRACKER_WIDGET_PANEL_ID = 'structured_preflight_tracker_panel';
const NARRATOR_HANDOFF_EXTRA_KEY = 'structured_preflight_narrator_handoff';
const NARRATOR_HANDOFF_BLOCK_CLASS = 'structured-preflight-narrator-handoff-block';
const NARRATOR_HANDOFF_VERSION = 1;
const PLAYER_SETUP_KEY = 'structuredPreflightPlayer';
const PLAYER_SETUP_VERSION = 1;
const PLAYER_SETUP_CARD_ID = 'structured_preflight_player_setup_card';
const PLAYER_SETUP_STYLE_ID = 'structured_preflight_player_setup_styles';
const PLAYER_STATS = Object.freeze(['PHY', 'MND', 'CHA']);
const PLAYER_RACE_CHOICES = Object.freeze([
    'Human',
    'Elf',
    'Half-Elf',
    'Dwarf',
    'Halfling',
    'Gnome',
    'Orc',
    'Half-Orc',
    'Oni',
    'Goblin',
    'Hobgoblin',
    'Kobold',
    'Lizardfolk',
    'Lamian',
    'Harpy',
    'Arachne',
    'Centaur',
    'Minotaur',
    'Satyr',
    'Merfolk',
    'Naga',
    'Slimekin',
    'Mushroomfolk',
    'Automaton',
    'Homunculus',
    'Vampire',
    'Dhampir',
    'Werewolf',
    'Catfolk',
    'Wolfkin',
    'Foxkin',
    'Rabbitfolk',
    'Bearkin',
    'Dragonkin',
    'Tiefling',
    'Aasimar',
    'Demon',
    'Half-Demon',
    'Angelkin',
    'Fae',
    'Fairy',
    'Dryad',
    'Spirit-Touched',
    'Undead',
    'Revenant',
    'Hybrid',
    'Random',
]);
const PLAYER_SETUP_ANALYSIS_RESPONSE_LENGTH = 900;
const PLAYER_SETUP_SHEET_RESPONSE_LENGTH = 3600;
const NAME_STYLE_OPTIONS = Object.freeze([
    'Balanced Fantasy',
    'Tolkienic / Lyrical',
    'Celtic-Inspired Fantasy',
    'Norse / Old Germanic Fantasy',
    'Persian / Byzantine Fantasy',
    'Slavic-Inspired Fantasy',
    'Classical / Romance Fantasy',
    'Dark Low Fantasy',
]);
const DEFAULT_WRITING_STYLE_PROMPT = String.raw`**WRITING STYLE**

**STYLE TARGET:**
Epic fantasy narration with rich observational detail, clear physical action, and direct physical intimacy when the scene supports it. The prose should feel natural, grounded, and scene-aware, not mechanical.

Literary detail must come from concrete scene evidence: people, clothing, tools, weapons, surfaces, weather, light, sound, spacing, rank markers, damaged objects, practical obstacles, social behavior, and immediate consequence.

**NORMAL NARRATION:**
Make places feel inhabited through useful specifics. In taverns, streets, camps, halls, markets, roads, and wilderness scenes, notice what changes the scene or reveals the world: who blocks a path, who cuts speech short, what tools are in reach, what clothing marks rank or trade, what objects are damaged, what exits are watched, what sounds interrupt speech, and how people reposition under pressure.

Do not use decorative observation for its own sake. Every detail should clarify setting, danger, social tension, character behavior, available choices, or the next action.

**TENSION:**
Show tension through scene movement and consequence: distance closing or opening, someone blocking access, a hand leaving or taking an object, a chair scraping back, a cup set down untouched, a weapon kept ready, a door left open, speech cut short, a delayed answer, a refusal, or a choice not to move.

Do not rely on isolated body-part, skin-color, grip, breath, pulse, throat, jaw, expression, or voice-delivery cues as shorthand. They may appear only when they perform a concrete function: speech, injury, illness, exertion, restraint, contact, balance, sex, recovery, object use, or direct physical consequence.

**ACTION:**
Combat, pursuit, restraint, and magical impact should be kinetic and spatially clear. Track position, angle, reach, footing, leverage, timing, momentum, impact, recovery, blocked access, injury, and changed distance.

Violence should feel physical through movement and consequence: weapons bind, footing fails, bodies hit surfaces, guards open or close, distance changes, objects break, and injury alters what can happen next.

**INTIMACY:**
When intimacy, arousal, exposure, or explicit sex is actually present, write directly and physically. Keep focus on bodies, contact, pressure, angle, rhythm, grip, weight, resistance, exposure, sound, fluids, climax, and aftermath.

Use plain anatomical language when the scene is explicit. Avoid coy euphemism, decorative sensual haze, or abstract desire-language. Erotic prose should stay grounded in action, consent, proximity, and physical consequence.

**FLOW:**
Write in cohesive scene beats. Combine related action, posture, object handling, dialogue, and consequence into natural paragraphs. Use shorter sentences for impact and longer sentences for continuous movement, observation, or pressure.

The prose should be detailed without becoming ornate, physical without becoming robotic, and intense without losing spatial clarity.`;
const DEFAULT_PROSE_RULES_PROMPT = String.raw`function RenderControlEngine(response, input, context) {
  olfactoryGate(input, context):
    policy: STRICT_LOCKED, EXPLICIT-ONLY, FIRST-YES-WINS
    mandate:
      Smell and taste are locked by default. They are low-priority channels and may not substitute for concrete scene description, physical action, spatial information, consequence, pressure, or choice.

    return Y only if:
      - {{user}} explicitly sniffs, smells, tastes, eats, or drinks
      - OR a specific visible close-range source is overpowering and physically unavoidable

    if Y:
      - allow at most 1 smell or taste mention per beat or location
      - attach it to a specific physical source
      - do not repeat it unless conditions materially change

    if N:
      - write no smell or taste narration

    source test:
      - Valid source: smoke pouring under the door, blood on a hand, rot beside the body, food or drink in the mouth, chemicals in immediate contact, or fire filling the room.
      - Invalid source: "the air", a mood, tension, attraction, weather, a tavern, a forest, a person in general, distance, memory, atmosphere, or vibe.

    ABSOLUTE BAN:
      - Ambient mood scent, smelling or tasting "the air", romanticized odor language, decorative sensory haze, floating atmosphere, sensual scent framing, and repeated smell/taste mentions without a new physical cause.

  abilityIntegration(response, context):
    policy: LOCKED, EXPLICIT-ONLY
    mandate:
      Render abilities, magic, senses, and supernatural traits as physical results already entering the scene. Show the effect, not the process. The narration begins at the perceivable consequence, not at activation, focus, intent, or explanation.

    rules:
      - Begin with the directly perceivable result: movement, pressure, heat, sound, distortion, damage, altered distance, changed light, material change, bodily change, or environmental reaction.
      - Keep the effect inside the current action beat. Do not isolate power as a special announcement or separate ceremony.
      - If the source is not directly observable from the scene, describe only the effect. The source remains unknown in narration.
      - Name an ability only if a character speaks that name aloud in dialogue.
      - Do not explain that an effect happened because of a racial trait, spell, ability, power, training, aura, instinct, or supernatural nature.

    ABSOLUTE BAN:
      - Ability announcements, spell callouts, activation language, focus rituals, charging-up prose, system labels, ability names as narration, and explanatory ability-causation framing such as "using", "activating", "channeling", "focusing", "summoning", "because of his power", "thanks to her magic", "with his darkvision", or "through her ability."

  epistemicRender(response, smellGate, context):
    policy: LOCKED, EXPLICIT-ONLY
    mandate:
      Narrate only what is available from direct in-scene evidence at {{user}}'s physical position. Knowledge, naming, sensory access, causation, and interpretation stay locked until perceived, spoken, read, or otherwise revealed in-world.

    rules:
      - Ground every claim in available sensory evidence, dialogue, readable text, or previously established in-world knowledge.
      - Sight must obey line of sight, lighting, darkness, distance, cover, concealment, closed doors, walls, bodies, smoke, fog, and occlusion.
      - Sound must obey direction, rough distance, volume, echo, barriers, walls, doors, crowds, water, wind, and obstruction.
      - Names, roles, ranks, classifications, species, origins, motives, emotions, intentions, loyalties, and hidden causes stay unknown until explicitly introduced or directly evidenced in-world.
      - Unknown people, places, creatures, objects, and effects must be described by observable traits only.
      - Allowed default channels are sight, sound, and touch. Smell and taste require smellGate=Y.
      - If something is uncertain, preserve uncertainty in the wording. Do not convert inference into fact.
      - Do not narrate what {{user}} thinks, feels, understands, notices, realizes, remembers, assumes, decides, or silently does.

    ABSOLUTE BAN:
      - God-view, mindreading, hidden names, premature labels, unexplained motive knowledge, psychic empathy, ability omniscience, detached ambience, omniscient camera movement, and narration of {{user}} cognition.

  behavioralRender(response):
    policy: LOCKED, EXPLICIT-ONLY
    mandate:
      Emotion may appear only through consequential visible behavior. A valid emotional cue must materially affect speech, posture, distance, objects, timing, movement, access, pressure, contact, possession, risk, or choice.

    rules:
      - Use behavior that changes the scene: approach, retreat, block, interrupt, hesitate before answering, mishandle an object, miss a routine, alter stance, cut speech short, change distance, withhold an item, refuse contact, protect an exit, or choose not to move.
      - Use physical action specific enough to be seen in person.
      - Make the character do something that changes access, pressure, contact, possession, timing, speech, or risk.
      - Let behavior emerge from the current situation. Do not substitute a stock emotional signal for actual scene behavior.
      - Body, face, breath, pulse, throat, jaw, hand, grip, eye, expression, and skin-color cues may appear only for concrete physical function. They may not appear as shorthand for emotion, romance, sexuality, psychology, tension, determination, fear, consent, resistance, or effort without direct consequence.
      - Skin color, facial color, and localized reddening/paling/whitening may appear only for direct tissue-color causes: injury, illness, blood loss, heat, cold, choking, poison, visible magic effect, makeup, lighting, species trait, existing complexion, bruising, or direct material pressure.
      - Equivalent phrasing is also banned. Rewording the same shortcut with substitute language is still invalid.

    ABSOLUTE BAN:
      - Internal-state labels, canned body-language shorthand, somatic emotional shorthand, autonomic tells used as emotion labels, micro-expression shorthand, body-part emotion metonymy, and empty expressive gestures that do not affect action, speech, timing, objects, or space.
      - Stock shorthand or equivalents, including blush/flush color cues, cheeks or ears reddening, face paling, knuckles whitening, grip-color language, heart/pulse/breath/stomach cues, jaw setting/tightening/clenching, throat working/bobbing, lips parting without consequence, mouth opening and closing, fingers twitching, shadows over eyes, eyes darkening/softening, expression flickering, face softening, and similar coded shortcuts.

  literalStyleFilter(response):
    policy: LOCKED, EXPLICIT-ONLY
    mandate:
      Use literal physical prose. Every sentence must mean exactly what it says. Describe bodies, objects, movement, pressure, contact, resistance, damage, and consequence as concrete scene facts.

    rules:
      - Use direct verbs and concrete nouns.
      - Use adjectives only for physical properties or materially relevant distinctions.
      - Keep description attached to current action, obstacle, consequence, threat, position, object state, dialogue, or choice.
      - Treat inanimate things as inanimate. They may move, make sound, or change only through physical force, weather, impact, heat, weight, pressure, or a visible actor.
      - Silence is absence of sound or replacement by a specific audible detail. It is not a weight, pressure, presence, object, mood, or actor.

    ABSOLUTE BAN:
      - Metaphor, simile, hyperbole, idiom, ellipsis, non-literal comparison phrasing, poetic framing, purple prose, personification, pathetic fallacy, emotional physics, vibe adjectives, decorative sensual wording, sensory analogy phrasing, atmospheric filler, and "not X, but Y" contrast constructions.

  sceneBeatComposition(response):
    policy: LOCKED
    mandate:
      Write cohesive scene beats, not motion logs. A scene beat is a connected unit of action, posture, object handling, dialogue, and consequence that changes the immediate situation.

    rules:
      - Combine related movement, posture, object handling, dialogue, and consequence into one paragraph when they belong to the same beat.
      - Use short sentences for impact or interruption. Use longer sentences for continuous movement, tactical sequence, pressure, or dialogue integrated with action.
      - Keep same-speaker action and dialogue together when they belong to one beat.
      - Prefer one strong NPC beat that creates a response point for {{user}} over several small fragments from the same speaker.
      - Keep dialogue reactive, pressured, specific, and short enough to preserve turn flow.
      - Dialogue delivery is allowed when physically grounded. Volume, pace, roughness, trembling, lowered voice, interruption, or vocal strain may be described when it changes audibility, privacy, speech control, injury, fatigue, fear, anger, restraint, intimacy, or scene pressure.
      - Each sentence must advance position, contact, force, timing, spacing, object state, visibility, sound, pressure, consequence, dialogue, or choice.

    pattern:
      - "She pushed the cup across the table and kept two fingers on the rim until he took it. \"Drink. You look like you need it. Besides, we're not leaving until morning.\""
      - "He glanced at the seal, folded the letter into his coat, and moved his shoulder between {{user}} and the stairs."
      - "The guard stepped into the doorway and hooked two fingers under his belt. \"Road's closed.\""

    ABSOLUTE BAN:
      - Robotic one-action-per-sentence cadence, repetitive subject-verb action lists, pingpong structure, isolated speech balloons, same-speaker fragmentation, narration/speech/narration/speech chains from the same NPC before {{user}} can respond, and stock quietness shorthand or equivalents such as "barely above a whisper," "just above a whisper," "almost a whisper," "low murmur," "soft murmur," or "a thread of sound" when used as tropey emotional shorthand instead of physically grounded delivery.

  turnBoundaryControl(response, context):
    policy: LOCKED, EXPLICIT-ONLY
    mandate:
      Preserve strict user agency, strict linear chronology, and a clean response handoff. The latest {{user}} input is already complete; the response begins with what happens next.

    rules:
      - Begin at T+1 after {{user}} input. Treat {{user}} input as already completed unless mechanics say it failed, stalled, or was interrupted.
      - First sentence must begin with external consequence, NPC response, environmental change, or new stimulus. It must not begin by recapping, echoing, paraphrasing, or summarizing {{user}}.
      - Never write {{user}} speech, thoughts, feelings, reactions, silence, decisions, or voluntary actions unless the narrator handoff explicitly enables PROXY USER ACTION MODE.
      - If PROXY USER ACTION MODE is active, narrate only the exact specified {{user}} action for that turn, then return immediately to normal agency separation.
      - Stop immediately when {{user}} is directly addressed, directly acted upon in a response-demanding way, presented with a choice, or reached by an unresolved attack, impact, grab, demand, refusal, obstacle, or decision frame.
      - Allow at most 1 inter-NPC exchange and at most 3 sentences per monologue.
      - End on a concrete playable beat that gives {{user}} something immediate to answer, resist, inspect, interrupt, take, refuse, choose, defend against, or act upon.

    ABSOLUTE BAN:
      - Echoing, restating, paraphrasing, or summarizing {{user}} input; "as you" phrasing; opening recap transitions; writing beyond the response point; answering questions directed at {{user}}; ambient filler endings; passive waiting endings; explicit waiting; all-eyes-on-user framing; meta-questions; and lines such as "she waits," "he waits for your answer," "awaits your response," "what do you do," or "the choice is yours."

  execution:
    This is the required render order before the first visible output token.

    smellGate = olfactoryGate(input, context)
    abilityIntegration(response, context)
    epistemicRender(response, smellGate, context)
    behavioralRender(response)
    literalStyleFilter(response)
    sceneBeatComposition(response)
    turnBoundaryControl(response, context)

    VALIDITY CONTRACT:
      - Every stage is mandatory.
      - A single violation invalidates the response.
      - Invalid responses must not be output.
      - Final narration may only be emitted after all stages pass.

    return response
}`;
const DEFAULT_SETTINGS = Object.freeze({
    useSeparateSemanticSettings: false,
    semanticConnectionProfile: '',
    disableSemanticThinking: true,
    postNarrationTrackerEnabled: true,
    trackerConnectionProfile: TRACKER_PROFILE_CURRENT,
    postNarrationProseGuardEnabled: true,
    proseGuardConnectionProfile: PROSE_GUARD_PROFILE_CURRENT,
    writingStyleEnabled: true,
    writingStylePrompt: DEFAULT_WRITING_STYLE_PROMPT,
    writingStylePlacement: 'before_prompt',
    writingStyleDepth: 0,
    writingStyleRole: 0,
    nameStyle: 'Balanced Fantasy',
    trackerWidgetCollapsed: true,
    trackerWidgetX: 24,
    trackerWidgetY: 120,
});
const CHAT_COMPLETION_SECRET_KEYS = Object.freeze({
    ai21: SECRET_KEYS.AI21,
    aimlapi: SECRET_KEYS.AIMLAPI,
    azure_openai: SECRET_KEYS.AZURE_OPENAI,
    chutes: SECRET_KEYS.CHUTES,
    claude: SECRET_KEYS.CLAUDE,
    cohere: SECRET_KEYS.COHERE,
    cometapi: SECRET_KEYS.COMETAPI,
    custom: SECRET_KEYS.CUSTOM,
    deepseek: SECRET_KEYS.DEEPSEEK,
    electronhub: SECRET_KEYS.ELECTRONHUB,
    fireworks: SECRET_KEYS.FIREWORKS,
    google: SECRET_KEYS.MAKERSUITE,
    groq: SECRET_KEYS.GROQ,
    mistralai: SECRET_KEYS.MISTRALAI,
    moonshot: SECRET_KEYS.MOONSHOT,
    nanogpt: SECRET_KEYS.NANOGPT,
    openai: SECRET_KEYS.OPENAI,
    openrouter: SECRET_KEYS.OPENROUTER,
    perplexity: SECRET_KEYS.PERPLEXITY,
    pollinations: SECRET_KEYS.POLLINATIONS,
    vertexai: SECRET_KEYS.VERTEXAI,
    xai: SECRET_KEYS.XAI,
    zai: SECRET_KEYS.ZAI,
});
const EXTENSION_PROMPT_TYPES = Object.freeze({
    NONE: -1,
    IN_PROMPT: 0,
    IN_CHAT: 1,
    BEFORE_PROMPT: 2,
});

const EXTENSION_PROMPT_ROLES = Object.freeze({
    SYSTEM: 0,
    USER: 1,
    ASSISTANT: 2,
});

console.info(`[${EXTENSION_NAME}] module import started`);

const state = {
    runningSemanticPass: false,
    bypassPromptReady: false,
    activeRunId: null,
    lastNarratorHandoff: '',
    lastNarratorHandoffKey: null,
    pendingRun: null,
    trackerUpdating: false,
    inputLockState: null,
    chatSignature: [],
    subscribed: false,
    pendingGeneration: null,
    progressToast: null,
    progressToasts: new Set(),
    pendingRunCleanupTimer: null,
    playerSetupBusy: false,
};

function getContext() {
    return globalThis.SillyTavern?.getContext?.();
}

function getSettings() {
    extension_settings[SETTINGS_KEY] = extension_settings[SETTINGS_KEY] || {};
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (extension_settings[SETTINGS_KEY][key] === undefined) {
            extension_settings[SETTINGS_KEY][key] = value;
        }
    }
    return extension_settings[SETTINGS_KEY];
}

function saveExtensionSettings() {
    saveSettingsDebounced();
}

function ensureStreamingArtifactRegex() {
    if (!extension_settings || typeof extension_settings !== 'object') return false;
    if (!Array.isArray(extension_settings.regex)) {
        extension_settings.regex = [];
    }

    const existing = extension_settings.regex.find(script =>
        script?.id === STREAMING_ARTIFACT_REGEX_SCRIPT_ID
        || script?.scriptName === STREAMING_ARTIFACT_REGEX_SCRIPT_NAME
    );
    const wanted = buildStreamingArtifactRegexScript();

    if (!existing) {
        extension_settings.regex.push(wanted);
        saveExtensionSettings();
        console.info(`[${EXTENSION_NAME}] installed streaming display artifact regex.`);
        return true;
    }

    let changed = false;
    for (const [key, value] of Object.entries(wanted)) {
        const current = existing[key];
        const same = Array.isArray(value)
            ? JSON.stringify(current) === JSON.stringify(value)
            : current === value;
        if (!same) {
            existing[key] = value;
            changed = true;
        }
    }

    if (changed) {
        saveExtensionSettings();
        console.info(`[${EXTENSION_NAME}] updated streaming display artifact regex.`);
    }
    return changed;
}

function removeStreamingArtifactRegex() {
    if (!Array.isArray(extension_settings?.regex)) return false;
    const before = extension_settings.regex.length;
    extension_settings.regex = extension_settings.regex.filter(script =>
        script?.id !== STREAMING_ARTIFACT_REGEX_SCRIPT_ID
        && script?.scriptName !== STREAMING_ARTIFACT_REGEX_SCRIPT_NAME
        && script?.findRegex !== STREAMING_ARTIFACT_REGEX_PATTERN
    );
    if (extension_settings.regex.length !== before) {
        saveExtensionSettings();
        console.info(`[${EXTENSION_NAME}] removed streaming display artifact regex.`);
        return true;
    }
    return false;
}

function getConnectionProfileNames() {
    return (extension_settings.connectionManager?.profiles || [])
        .map(profile => String(profile?.name || '').trim())
        .filter(Boolean)
        .sort((a, b) => a.localeCompare(b));
}

function getConnectionProfileByName(profileName) {
    const wanted = String(profileName || '').trim();
    if (!wanted) return null;
    return (extension_settings.connectionManager?.profiles || [])
        .find(profile => String(profile?.name || '').trim().toLowerCase() === wanted.toLowerCase()) || null;
}

function getActiveConnectionProfileName() {
    const selectedProfile = extension_settings.connectionManager?.selectedProfile;
    const profile = (extension_settings.connectionManager?.profiles || []).find(item => item.id === selectedProfile);
    return profile?.name || PROFILE_NONE;
}

async function readActiveConnectionProfileName() {
    const command = SlashCommandParser.commands?.profile;
    if (command?.callback) {
        try {
            return String(await command.callback({}, '') || PROFILE_NONE);
        } catch (error) {
            console.warn(`[${EXTENSION_NAME}] could not read active connection profile through /profile; using settings fallback.`, error);
        }
    }
    return getActiveConnectionProfileName();
}

async function applyConnectionProfileName(profileName) {
    const normalized = String(profileName || PROFILE_NONE);
    const command = SlashCommandParser.commands?.profile;
    if (!command?.callback) {
        throw new Error('Connection profile switching is unavailable because SillyTavern /profile command is not registered.');
    }
    await command.callback({ 'await': 'true', timeout: '10000' }, normalized);
}

function getSecretKeyForConnectionProfile(profile) {
    const context = getContext();
    const apiMap = context?.CONNECT_API_MAP?.[profile?.api];
    return CHAT_COMPLETION_SECRET_KEYS[apiMap?.source] || null;
}

function getActiveSecretId(secretKey) {
    const secrets = secret_state?.[secretKey];
    if (!Array.isArray(secrets)) return '';
    return secrets.find(secret => secret?.active)?.id || '';
}

async function withConnectionProfileSecret(profile, callback) {
    const secretKey = getSecretKeyForConnectionProfile(profile);
    const targetSecretId = String(profile?.['secret-id'] || '').trim();
    if (!secretKey || !targetSecretId) {
        return await callback();
    }

    const originalSecretId = getActiveSecretId(secretKey);
    const shouldRotate = originalSecretId && originalSecretId !== targetSecretId;

    try {
        if (shouldRotate) {
            console.info(`[${EXTENSION_NAME}] activating semantic profile secret for ${profile.name}.`);
            await rotateSecret(secretKey, targetSecretId);
        }
        return await callback();
    } finally {
        if (shouldRotate) {
            try {
                await rotateSecret(secretKey, originalSecretId);
                console.info(`[${EXTENSION_NAME}] restored roleplay secret after semantic pass.`);
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] failed to restore roleplay secret after semantic pass.`, error);
                try {
                    globalThis.toastr?.error?.(
                        'Semantic pass finished, but restoring the original API secret failed. Check ST connection settings before continuing.',
                        EXTENSION_NAME,
                        { timeOut: 15000, extendedTimeOut: 15000 },
                    );
                } catch {
                    // Toasts are best-effort only.
                }
            }
        }
    }
}

async function withSemanticGenerationSettings(callback) {
    const settings = getSettings();
    const useSeparateSettings = Boolean(settings.useSeparateSemanticSettings);
    const semanticProfile = String(settings.semanticConnectionProfile || '').trim();
    const semanticOptions = {
        disableSemanticThinking: settings.disableSemanticThinking !== false,
    };

    if (!useSeparateSettings || !semanticProfile) {
        return await callback(semanticOptions);
    }

    const profile = getConnectionProfileByName(semanticProfile);
    if (!profile) {
        throw new Error(`Semantic connection profile "${semanticProfile}" was not found.`);
    }

    console.info(`[${EXTENSION_NAME}] using direct semantic connection profile request: ${profile.name}`);
    return await withConnectionProfileSecret(profile, () => callback({
        ...semanticOptions,
        semanticProfileId: profile.id,
        semanticProfileName: profile.name,
    }));
}

async function withTrackerGenerationSettings(callback) {
    const settings = getSettings();
    const trackerProfile = String(settings.trackerConnectionProfile || TRACKER_PROFILE_CURRENT).trim();
    if (trackerProfile && trackerProfile !== TRACKER_PROFILE_CURRENT) {
        const profile = getConnectionProfileByName(trackerProfile);
        if (!profile) {
            throw new Error(`Tracker connection profile "${trackerProfile}" was not found.`);
        }
        console.info(`[${EXTENSION_NAME}] using direct tracker connection profile request: ${profile.name}`);
        return await withConnectionProfileSecret(profile, () => callback({
            disableSemanticThinking: settings.disableSemanticThinking !== false,
            semanticProfileId: profile.id,
            semanticProfileName: profile.name,
        }));
    }
    return await withSemanticGenerationSettings(callback);
}

async function withProseGuardGenerationSettings(callback) {
    const settings = getSettings();
    const proseGuardProfile = String(settings.proseGuardConnectionProfile || PROSE_GUARD_PROFILE_CURRENT).trim();
    if (proseGuardProfile && proseGuardProfile !== PROSE_GUARD_PROFILE_CURRENT) {
        const profile = getConnectionProfileByName(proseGuardProfile);
        if (!profile) {
            throw new Error(`Prose Guard connection profile "${proseGuardProfile}" was not found.`);
        }
        console.info(`[${EXTENSION_NAME}] using direct Prose Guard connection profile request: ${profile.name}`);
        return await withConnectionProfileSecret(profile, () => callback({
            disableSemanticThinking: settings.disableSemanticThinking !== false,
            semanticProfileId: profile.id,
            semanticProfileName: profile.name,
        }));
    }
    return await withSemanticGenerationSettings(callback);
}

function setSelectOptions(select, values, placeholder, selectedValue, missingLabel = 'Missing') {
    if (!select) return;
    select.innerHTML = '';
    const includePlaceholder = !values.includes(placeholder);
    if (includePlaceholder) {
        const empty = document.createElement('option');
        empty.value = '';
        empty.textContent = placeholder;
        select.append(empty);
    }

    for (const value of values) {
        const option = document.createElement('option');
        option.value = value;
        option.textContent = value;
        select.append(option);
    }

    if (selectedValue && !values.includes(selectedValue)) {
        const missing = document.createElement('option');
        missing.value = selectedValue;
        missing.textContent = `${missingLabel}: ${selectedValue}`;
        select.append(missing);
    }

    select.value = selectedValue || (includePlaceholder ? '' : placeholder);
}

function getPromptPlacementPosition(value) {
    const placement = String(value || '').trim();
    if (placement === 'in_chat') return EXTENSION_PROMPT_TYPES.IN_CHAT;
    if (placement === 'before_prompt') return EXTENSION_PROMPT_TYPES.BEFORE_PROMPT;
    if (placement === 'none') return EXTENSION_PROMPT_TYPES.NONE;
    return EXTENSION_PROMPT_TYPES.IN_PROMPT;
}

function normalizePromptDepth(value) {
    const depth = Number(value);
    if (!Number.isFinite(depth)) return 0;
    return Math.max(0, Math.min(10000, Math.floor(depth)));
}

function normalizePromptRole(value) {
    const role = Number(value);
    if (Object.values(EXTENSION_PROMPT_ROLES).includes(role)) return role;
    return EXTENSION_PROMPT_ROLES.SYSTEM;
}

function setPromptPlacementControls(prefix, settings, enabled) {
    const placementSelect = document.getElementById(`structured_preflight_${prefix}_placement`);
    const depthInput = document.getElementById(`structured_preflight_${prefix}_depth`);
    const roleSelect = document.getElementById(`structured_preflight_${prefix}_role`);
    const depthRow = document.getElementById(`structured_preflight_${prefix}_depth_row`);
    const placementKey = `${prefix}Placement`;
    const depthKey = `${prefix}Depth`;
    const roleKey = `${prefix}Role`;
    const placement = String(settings[placementKey] || 'in_prompt');
    const showDepth = placement === 'in_chat';

    if (placementSelect) {
        placementSelect.value = ['before_prompt', 'in_prompt', 'in_chat', 'none'].includes(placement) ? placement : 'in_prompt';
        placementSelect.disabled = !enabled;
    }
    if (depthInput) {
        depthInput.value = String(normalizePromptDepth(settings[depthKey]));
        depthInput.disabled = !enabled || !showDepth;
    }
    if (roleSelect) {
        roleSelect.value = String(normalizePromptRole(settings[roleKey]));
        roleSelect.disabled = !enabled || !showDepth;
    }
    if (depthRow) depthRow.hidden = !showDepth;
}

function injectMovablePrompt(key, promptText, placement, depth, role) {
    const context = getContext();
    if (!context?.setExtensionPrompt) return;

    const position = getPromptPlacementPosition(placement);
    const text = String(promptText || '').trim();
    if (!text || position === EXTENSION_PROMPT_TYPES.NONE) {
        if (context.extensionPrompts) delete context.extensionPrompts[key];
        return;
    }

    context.setExtensionPrompt(
        key,
        text,
        position,
        normalizePromptDepth(depth),
        false,
        normalizePromptRole(role),
    );
}

function injectPromptOptionPrompts() {
    clearFinalReminderPrompt();
    injectWritingStylePrompt();
    injectProseRulesPrompt();
}

function clearFinalReminderPrompt(context = getContext()) {
    if (context?.extensionPrompts) delete context.extensionPrompts[FINAL_REMINDER_PROMPT_KEY];
}

function refreshSettingsControls() {
    const settings = getSettings();
    const enabled = Boolean(settings.useSeparateSemanticSettings);
    const profileSelect = document.getElementById('structured_preflight_semantic_profile');
    const trackerEnabledCheckbox = document.getElementById('structured_preflight_post_tracker_enabled');
    const trackerProfileSelect = document.getElementById('structured_preflight_tracker_profile');
    const proseGuardEnabledCheckbox = document.getElementById('structured_preflight_prose_guard_enabled');
    const proseGuardProfileSelect = document.getElementById('structured_preflight_prose_guard_profile');
    const enabledCheckbox = document.getElementById('structured_preflight_use_separate_semantic_settings');
    const disableThinkingCheckbox = document.getElementById('structured_preflight_disable_semantic_thinking');
    const writingStyleEnabled = document.getElementById('structured_preflight_writing_style_enabled');
    const writingStyleDrawer = document.getElementById('structured_preflight_writing_style_drawer');
    const writingStylePrompt = document.getElementById('structured_preflight_writing_style_prompt');
    const nameStyleSelect = document.getElementById('structured_preflight_name_style');

    if (enabledCheckbox) enabledCheckbox.checked = enabled;
    if (trackerEnabledCheckbox) trackerEnabledCheckbox.checked = settings.postNarrationTrackerEnabled !== false;
    if (proseGuardEnabledCheckbox) proseGuardEnabledCheckbox.checked = settings.postNarrationProseGuardEnabled !== false;
    if (disableThinkingCheckbox) disableThinkingCheckbox.checked = settings.disableSemanticThinking !== false;
    if (writingStyleEnabled) writingStyleEnabled.checked = settings.writingStyleEnabled !== false;
    if (writingStylePrompt && writingStylePrompt.value !== settings.writingStylePrompt) {
        writingStylePrompt.value = String(settings.writingStylePrompt ?? DEFAULT_WRITING_STYLE_PROMPT);
    }
    setPromptPlacementControls('writingStyle', settings, settings.writingStyleEnabled !== false);
    setSelectOptions(
        nameStyleSelect,
        NAME_STYLE_OPTIONS,
        'Balanced Fantasy',
        NAME_STYLE_OPTIONS.includes(settings.nameStyle) ? settings.nameStyle : 'Balanced Fantasy',
        'Unknown style',
    );
    setSelectOptions(
        profileSelect,
        getConnectionProfileNames(),
        'Use current connection profile',
        settings.semanticConnectionProfile,
        'Profile not found',
    );
    setSelectOptions(
        trackerProfileSelect,
        [TRACKER_PROFILE_CURRENT, ...getConnectionProfileNames()],
        TRACKER_PROFILE_CURRENT,
        settings.trackerConnectionProfile || TRACKER_PROFILE_CURRENT,
        'Profile not found',
    );
    setSelectOptions(
        proseGuardProfileSelect,
        [PROSE_GUARD_PROFILE_CURRENT, ...getConnectionProfileNames()],
        PROSE_GUARD_PROFILE_CURRENT,
        settings.proseGuardConnectionProfile || PROSE_GUARD_PROFILE_CURRENT,
        'Profile not found',
    );

    if (profileSelect) profileSelect.disabled = !enabled;
    if (trackerProfileSelect) trackerProfileSelect.disabled = settings.postNarrationTrackerEnabled === false;
    if (proseGuardProfileSelect) proseGuardProfileSelect.disabled = settings.postNarrationProseGuardEnabled === false;
    if (writingStylePrompt) writingStylePrompt.disabled = settings.writingStyleEnabled === false;
    if (writingStyleDrawer) {
        writingStyleDrawer.hidden = settings.writingStyleEnabled === false;
        if (writingStyleDrawer.hidden) writingStyleDrawer.open = false;
    }
    const playerStatus = document.getElementById('structured_preflight_player_setup_status');
    if (playerStatus) {
        const context = getContext();
        const root = getPlayerRoot(context);
        const personaStats = getPersonaCoreStats(context);
        const rootStats = root?.stats;
        const status = root?.forceCreator
            ? 'Character creator forced for this chat.'
            : root?.ready
            ? `Ready for this chat (${formatStatsTable(rootStats)}).`
            : personaStats
                ? `Active persona already has stats (${formatStatsTable(personaStats)}).`
                : root?.disabled
                    ? 'Disabled for this chat.'
                    : 'Player setup required for this chat.';
        playerStatus.textContent = status;
    }
}

function collapsePromptOptionDrawers(container = document) {
    container.querySelectorAll('[data-structured-preflight-prompt-drawer]').forEach(details => {
        details.open = false;
    });
}

function renderSettingsPanel() {
    const host = document.getElementById('extensions_settings2') || document.getElementById('extensions_settings');
    if (!host) {
        setTimeout(renderSettingsPanel, 500);
        return;
    }

    document.getElementById(SETTINGS_CONTAINER_ID)?.remove();

    const container = document.createElement('div');
    container.id = SETTINGS_CONTAINER_ID;
    container.className = 'extension_container';
    container.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <b>${EXTENSION_NAME}</b>
            </div>
            <div class="inline-drawer-content">
                <label class="checkbox_label flexNoGap">
                    <input id="structured_preflight_use_separate_semantic_settings" type="checkbox">
                    <span>Use separate semantic connection profile</span>
                </label>
                <div class="flex-container alignItemsBaseline">
                    <label for="structured_preflight_semantic_profile">Semantic connection profile</label>
                    <select id="structured_preflight_semantic_profile" class="text_pole flex1"></select>
                </div>
                <div class="flex-container alignitemscenter">
                    <small class="flex1">The semantic pass uses the fully assembled SillyTavern prompt stack and internally forces deterministic request settings.</small>
                    <button id="structured_preflight_refresh_semantic_settings" class="menu_button">Refresh</button>
                </div>
                <label class="checkbox_label flexNoGap">
                    <input id="structured_preflight_disable_semantic_thinking" type="checkbox">
                    <span>Disable thinking for semantic requests</span>
                </label>
                <small>Applies only to Story Engine semantic, tracker, and player setup calls. Main narration keeps its own profile settings.</small>
                <label class="checkbox_label flexNoGap">
                    <input id="structured_preflight_post_tracker_enabled" type="checkbox">
                    <span>Enable post-narration tracker update</span>
                </label>
                <div class="flex-container alignItemsBaseline">
                    <label for="structured_preflight_tracker_profile">Tracker connection profile</label>
                    <select id="structured_preflight_tracker_profile" class="text_pole flex1"></select>
                </div>
                <small>Runs after narration to update the visible tracker from final prose. Disable for compatibility with other tracker extensions.</small>
                <label class="checkbox_label flexNoGap">
                    <input id="structured_preflight_prose_guard_enabled" type="checkbox">
                    <span>Enable Prose Guard</span>
                </label>
                <div class="flex-container alignItemsBaseline">
                    <label for="structured_preflight_prose_guard_profile">Prose Guard connection profile</label>
                    <select id="structured_preflight_prose_guard_profile" class="text_pole flex1"></select>
                </div>
                <small>Runs after narration and before tracker update. It edits only prose-rule violations and preserves scene outcomes.</small>
                <hr>
                <div class="flex-container alignItemsBaseline">
                    <label for="structured_preflight_name_style">Name style</label>
                    <select id="structured_preflight_name_style" class="text_pole flex1"></select>
                </div>
                <small>Controls deterministic generated name pools sent to the narrator prompt.</small>
                <hr>
                <label class="checkbox_label flexNoGap">
                    <input id="structured_preflight_writing_style_enabled" type="checkbox">
                    <span>Enable Writing Style</span>
                </label>
                <details id="structured_preflight_writing_style_drawer" data-structured-preflight-prompt-drawer>
                    <summary class="flex-container alignitemscenter">
                        <button class="menu_button flex1" type="button" data-structured-preflight-edit-toggle>Edit Writing Style</button>
                        <button id="structured_preflight_reset_writing_style" class="menu_button" type="button">Reset</button>
                    </summary>
                    <div class="flex-container alignItemsBaseline">
                        <label for="structured_preflight_writingStyle_placement">Placement</label>
                        <select id="structured_preflight_writingStyle_placement" class="text_pole flex1">
                            <option value="before_prompt">↑ Char</option>
                            <option value="in_prompt">↓ Char</option>
                            <option value="in_chat">In-Chat @Depth</option>
                            <option value="none">Disabled</option>
                        </select>
                    </div>
                    <div id="structured_preflight_writingStyle_depth_row" class="flex-container alignItemsBaseline">
                        <label for="structured_preflight_writingStyle_depth">Depth</label>
                        <input id="structured_preflight_writingStyle_depth" class="text_pole widthNatural" type="number" min="0" max="10000" step="1">
                        <label for="structured_preflight_writingStyle_role">Role</label>
                        <select id="structured_preflight_writingStyle_role" class="text_pole flex1">
                            <option value="0">System</option>
                            <option value="1">User</option>
                            <option value="2">Assistant</option>
                        </select>
                    </div>
                    <small>Injected into the regular SillyTavern prompt stack. Edit freely; whatever text is here will be sent as writing style context.</small>
                    <textarea id="structured_preflight_writing_style_prompt" class="text_pole textarea_compact" rows="14" spellcheck="false"></textarea>
                </details>
                <hr>
                <div class="flex-container alignitemscenter">
                    <small id="structured_preflight_player_setup_status" class="flex1"></small>
                    <button id="structured_preflight_show_player_setup" class="menu_button">Show Player Setup</button>
                    <button id="structured_preflight_force_player_setup" class="menu_button">Run Character Creator</button>
                    <button id="structured_preflight_reset_player_setup" class="menu_button">Reset Chat Setup</button>
                </div>
            </div>
	        </div>`;
    host.prepend(container);
    collapsePromptOptionDrawers(container);
    container.querySelector('.inline-drawer-toggle')?.addEventListener('click', () => {
        setTimeout(() => collapsePromptOptionDrawers(container), 0);
    });
    container.querySelectorAll('[data-structured-preflight-edit-toggle]').forEach(button => {
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const drawer = button.closest('details');
            if (drawer) drawer.open = !drawer.open;
        });
    });

    const settings = getSettings();
    document.getElementById('structured_preflight_use_separate_semantic_settings')?.addEventListener('change', event => {
        settings.useSeparateSemanticSettings = Boolean(event.target?.checked);
        refreshSettingsControls();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_semantic_profile')?.addEventListener('change', event => {
        settings.semanticConnectionProfile = String(event.target?.value || '');
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_disable_semantic_thinking')?.addEventListener('change', event => {
        settings.disableSemanticThinking = Boolean(event.target?.checked);
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_post_tracker_enabled')?.addEventListener('change', event => {
        settings.postNarrationTrackerEnabled = Boolean(event.target?.checked);
        refreshSettingsControls();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_tracker_profile')?.addEventListener('change', event => {
        const selected = String(event.target?.value || TRACKER_PROFILE_CURRENT);
        settings.trackerConnectionProfile = selected || TRACKER_PROFILE_CURRENT;
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_prose_guard_enabled')?.addEventListener('change', event => {
        settings.postNarrationProseGuardEnabled = Boolean(event.target?.checked);
        refreshSettingsControls();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_prose_guard_profile')?.addEventListener('change', event => {
        const selected = String(event.target?.value || PROSE_GUARD_PROFILE_CURRENT);
        settings.proseGuardConnectionProfile = selected || PROSE_GUARD_PROFILE_CURRENT;
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_name_style')?.addEventListener('change', event => {
        const selected = String(event.target?.value || 'Balanced Fantasy');
        settings.nameStyle = NAME_STYLE_OPTIONS.includes(selected) ? selected : 'Balanced Fantasy';
        refreshSettingsControls();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_writing_style_enabled')?.addEventListener('change', event => {
        settings.writingStyleEnabled = Boolean(event.target?.checked);
        refreshSettingsControls();
        injectPromptOptionPrompts();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_writing_style_prompt')?.addEventListener('input', event => {
        settings.writingStylePrompt = String(event.target?.value ?? '');
        injectWritingStylePrompt();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_reset_writing_style')?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        settings.writingStylePrompt = DEFAULT_WRITING_STYLE_PROMPT;
        refreshSettingsControls();
        injectWritingStylePrompt();
        saveExtensionSettings();
    });
    for (const prefix of ['writingStyle']) {
        const inject = injectWritingStylePrompt;
        document.getElementById(`structured_preflight_${prefix}_placement`)?.addEventListener('change', event => {
            const value = String(event.target?.value || 'in_prompt');
            settings[`${prefix}Placement`] = ['before_prompt', 'in_prompt', 'in_chat', 'none'].includes(value) ? value : 'in_prompt';
            refreshSettingsControls();
            inject();
            saveExtensionSettings();
        });
        document.getElementById(`structured_preflight_${prefix}_depth`)?.addEventListener('input', event => {
            settings[`${prefix}Depth`] = normalizePromptDepth(event.target?.value);
            inject();
            saveExtensionSettings();
        });
        document.getElementById(`structured_preflight_${prefix}_role`)?.addEventListener('change', event => {
            settings[`${prefix}Role`] = normalizePromptRole(event.target?.value);
            inject();
            saveExtensionSettings();
        });
    }
    document.getElementById('structured_preflight_refresh_semantic_settings')?.addEventListener('click', refreshSettingsControls);
    document.getElementById('structured_preflight_show_player_setup')?.addEventListener('click', () => {
        const context = getContext();
        const root = getPlayerRoot(context);
        if (root && !root.ready && !getPersonaCoreStats(context)) {
            root.disabled = false;
            root.creator = root.creator || { stage: 'offer' };
            persistMetadata(context);
        }
        renderPlayerSetupCard(context);
        refreshSettingsControls();
    });
    document.getElementById('structured_preflight_force_player_setup')?.addEventListener('click', async () => {
        const context = getContext();
        const root = getPlayerRoot(context);
        if (root) {
            root.ready = false;
            root.disabled = false;
            root.forceCreator = true;
            root.sheet = null;
            root.stats = null;
            root.creator = { stage: 'offer' };
            await persistMetadata(context);
        }
        renderPlayerSetupCard(context);
        refreshSettingsControls();
        closeExtensionsDrawer();
    });
    document.getElementById('structured_preflight_reset_player_setup')?.addEventListener('click', async () => {
        const context = getContext();
        const root = getPlayerRoot(context);
        if (root) {
            root.ready = false;
            root.disabled = false;
            root.forceCreator = false;
            root.sheet = null;
            root.stats = null;
            root.creator = { stage: 'offer' };
            await persistMetadata(context);
        }
        renderPlayerSetupCard(context);
        refreshSettingsControls();
    });

    refreshSettingsControls();
    injectPromptOptionPrompts();
}

function closeExtensionsDrawer() {
    const drawer = document.getElementById('extensions-settings-button');
    if (!drawer) return;

    const content = drawer.querySelector('.drawer-content');
    const icon = drawer.querySelector('.drawer-icon');
    if (content?.classList?.contains('openDrawer')) {
        drawer.querySelector('.drawer-toggle')?.click();
    }
    content?.classList?.remove('openDrawer');
    content?.classList?.add('closedDrawer');
    icon?.classList?.remove('openIcon');
    icon?.classList?.add('closedIcon');
    setTimeout(() => document.getElementById(PLAYER_SETUP_CARD_ID)?.scrollIntoView?.({ block: 'center' }), 50);
}

function injectWritingStylePrompt() {
    const context = getContext();
    if (!context?.setExtensionPrompt) {
        return;
    }
    if (context.extensionPrompts) delete context.extensionPrompts[LEGACY_WRITING_STYLE_PROMPT_KEY];

    const settings = getSettings();
    if (settings.writingStyleEnabled === false) {
        if (context.extensionPrompts) delete context.extensionPrompts[WRITING_STYLE_PROMPT_KEY];
        return;
    }

    const promptText = String(settings.writingStylePrompt ?? DEFAULT_WRITING_STYLE_PROMPT);
    injectMovablePrompt(
        WRITING_STYLE_PROMPT_KEY,
        promptText,
        settings.writingStylePlacement,
        settings.writingStyleDepth,
        settings.writingStyleRole,
    );
}

function injectProseRulesPrompt() {
    const context = getContext();
    if (!context?.setExtensionPrompt) {
        return;
    }
    if (context.extensionPrompts) delete context.extensionPrompts[LEGACY_PROSE_RULES_PROMPT_KEY];
    clearFinalReminderPrompt(context);

    injectMovablePrompt(
        PROSE_RULES_PROMPT_KEY,
        DEFAULT_PROSE_RULES_PROMPT,
        'in_prompt',
        0,
        EXTENSION_PROMPT_ROLES.SYSTEM,
    );
}

function buildFinalNarrationPrompt(narratorContext) {
    return narratorContext;
}

function setChatInputLocked(locked, reason = '') {
    if (typeof document === 'undefined') return;
    state.trackerUpdating = Boolean(locked);
    const textarea = document.getElementById('send_textarea');
    const sendButton = document.getElementById('send_but');
    const form = document.getElementById('send_form');

    if (locked) {
        if (!state.inputLockState) {
            state.inputLockState = {
                textareaDisabled: textarea ? Boolean(textarea.disabled) : null,
                sendDisabled: sendButton ? Boolean(sendButton.disabled) : null,
                placeholder: textarea ? textarea.getAttribute('placeholder') : null,
                title: sendButton ? sendButton.getAttribute('title') : null,
            };
        }
        if (textarea) {
            textarea.disabled = true;
            textarea.setAttribute('data-spe-tracker-lock', 'true');
            textarea.setAttribute('placeholder', reason || 'Updating tracker...');
        }
        if (sendButton) {
            sendButton.disabled = true;
            sendButton.setAttribute('aria-disabled', 'true');
            sendButton.setAttribute('data-spe-tracker-lock', 'true');
            sendButton.setAttribute('title', reason || 'Updating tracker...');
        }
        form?.classList?.add?.('spe-tracker-updating');
        return;
    }

    const previous = state.inputLockState || {};
    if (textarea?.getAttribute('data-spe-tracker-lock') === 'true') {
        textarea.disabled = Boolean(previous.textareaDisabled);
        if (previous.placeholder == null) textarea.removeAttribute('placeholder');
        else textarea.setAttribute('placeholder', previous.placeholder);
        textarea.removeAttribute('data-spe-tracker-lock');
    }
    if (sendButton?.getAttribute('data-spe-tracker-lock') === 'true') {
        sendButton.disabled = Boolean(previous.sendDisabled);
        if (previous.title == null) sendButton.removeAttribute('title');
        else sendButton.setAttribute('title', previous.title);
        sendButton.removeAttribute('aria-disabled');
        sendButton.removeAttribute('data-spe-tracker-lock');
    }
    form?.classList?.remove?.('spe-tracker-updating');
    state.inputLockState = null;
}

function clearRuntimePrompts() {
    const context = getContext();
    if (!context?.extensionPrompts) return;

    delete context.extensionPrompts[NARRATOR_PROMPT_KEY];
}

function showProgress(message) {
    try {
        if (globalThis.toastr?.info) {
            clearAllProgress();
            const toast = globalThis.toastr.info(message, EXTENSION_NAME, { timeOut: 0, extendedTimeOut: 0 });
            state.progressToast = toast || null;
            if (toast) state.progressToasts.add(toast);
            return toast;
        }
    } catch {
        // Progress UI is optional; generation must not depend on it.
    }
    return null;
}

function clearProgress(toast) {
    try {
        if (toast && globalThis.toastr?.clear) {
            globalThis.toastr.clear(toast);
        }
        if (toast) {
            state.progressToasts.delete(toast);
            if (state.progressToast === toast) state.progressToast = null;
        }
    } catch {
        // Non-fatal.
    }
}

function clearAllProgress() {
    const toasts = [...(state.progressToasts || [])];
    if (state.progressToast && !toasts.includes(state.progressToast)) {
        toasts.push(state.progressToast);
    }

    for (const toast of toasts) {
        clearProgress(toast);
    }

    state.progressToast = null;
    state.progressToasts.clear();
}

function clearPendingRunCleanupTimer() {
    if (state.pendingRunCleanupTimer) {
        clearTimeout(state.pendingRunCleanupTimer);
        state.pendingRunCleanupTimer = null;
    }
}

function showBlockingError(error) {
    const message = error instanceof Error ? error.message : String(error);
    try {
        if (globalThis.toastr?.error) {
            globalThis.toastr.error(message, `${EXTENSION_NAME}: generation aborted`, { timeOut: 15000, extendedTimeOut: 15000 });
        }
    } catch {
        // Toasts are best-effort only.
    }
    console.error(`[${EXTENSION_NAME}] generation aborted`, error);
}

function getChatId(context = getContext()) {
    return typeof context?.getCurrentChatId === 'function' ? context.getCurrentChatId() : '';
}

function getMessageKey(messageId, context = getContext()) {
    return `${getChatId(context)}:${messageId}`;
}

function getTrackerRoot(context = getContext()) {
    if (!context?.chatMetadata) return null;
    context.chatMetadata.structuredPreflightTracker = context.chatMetadata.structuredPreflightTracker || { npcs: {}, user: {}, snapshots: {} };
    const root = context.chatMetadata.structuredPreflightTracker;
    root.npcs = root.npcs || {};
    root.user = normalizeTrackerUserState(root.user || {});
    const seededPlayerTracker = seedPlayerTrackerFromPersonaIfEmpty(root, context);
    if (seededPlayerTracker && typeof context.saveMetadataDebounced === 'function') {
        context.saveMetadataDebounced();
    }
    root.rapportClock = normalizeRapportClockState(root.rapportClock);
    root.snapshots = root.snapshots || {};
    return root;
}

function getPlayerRoot(context = getContext()) {
    if (!context?.chatMetadata) return null;
    context.chatMetadata[PLAYER_SETUP_KEY] = context.chatMetadata[PLAYER_SETUP_KEY] || {};
    const root = context.chatMetadata[PLAYER_SETUP_KEY];
    root.version = PLAYER_SETUP_VERSION;
    root.ready = Boolean(root.ready);
    root.disabled = Boolean(root.disabled);
    root.forceCreator = Boolean(root.forceCreator);
    root.sheet = root.sheet || null;
    root.stats = isValidCoreStats(root.stats) ? normalizeCoreStats(root.stats) : null;
    root.creator = root.creator && typeof root.creator === 'object' ? root.creator : { stage: 'offer' };
    if (!root.ready && !root.disabled && !root.creator.stage) {
        root.creator.stage = 'offer';
    }
    return root;
}

function getCharacterCardFieldsSafe(context = getContext()) {
    try {
        return typeof context?.getCharacterCardFields === 'function' ? context.getCharacterCardFields() : {};
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] could not read character/persona fields for player setup.`, error);
        return {};
    }
}

function getPersonaText(context = getContext()) {
    const fields = getCharacterCardFieldsSafe(context);
    const avatarId = String(user_avatar || '').trim();
    return [
        fields.persona,
        power_user?.persona_description,
        avatarId ? power_user?.persona_descriptions?.[avatarId]?.description : '',
    ].map(value => String(value || '').trim()).find(Boolean) || '';
}

function getPersonaCoreStats(context = getContext()) {
    return parseCoreStatsBlock(getPersonaText(context));
}

function seedPlayerTrackerFromPersonaIfEmpty(root, context = getContext()) {
    if (!root || root.personaInventorySeeded) return false;
    const user = normalizeTrackerUserState(root.user || {});
    if (user.gear.length || user.inventory.length) {
        root.user = user;
        root.personaInventorySeeded = { skipped: true, reason: 'tracker_already_has_items', at: Date.now() };
        return false;
    }

    const persona = getPersonaText(context);
    const seed = extractPersonaTrackerSeed(persona);
    if (!seed.gear.length && !seed.inventory.length) return false;

    root.user = normalizeTrackerUserState({
        ...user,
        gear: seed.gear,
        inventory: seed.inventory,
    });
    root.personaInventorySeeded = {
        at: Date.now(),
        hash: hashTextForSeed(persona),
        gearCount: seed.gear.length,
        inventoryCount: seed.inventory.length,
    };
    return true;
}

function extractPersonaTrackerSeed(personaText) {
    const gear = [];
    const inventory = [];
    const explicitGear = extractPersonaListSection(personaText, ['gear', 'equipment', 'equipped']);
    const explicitInventory = extractPersonaListSection(personaText, ['inventory', 'items', 'carried items']);

    for (const item of explicitGear) addUniqueTrackerSeedItem(gear, item);
    for (const item of explicitInventory) {
        if (!explicitGear.length && looksLikeEquippedGear(item)) {
            addUniqueTrackerSeedItem(gear, item);
        } else {
            addUniqueTrackerSeedItem(inventory, item);
        }
    }

    return { gear, inventory };
}

function extractPersonaListSection(text, headingNames) {
    const lines = String(text ?? '').split(/\r?\n/);
    const result = [];
    let active = false;
    for (const line of lines) {
        if (isPersonaSectionHeading(line)) {
            active = personaHeadingMatches(line, headingNames);
            continue;
        }
        if (!active) continue;
        const item = parsePersonaListItem(line);
        if (item) result.push(item);
    }
    return result;
}

function isPersonaSectionHeading(line) {
    const text = String(line ?? '').trim();
    if (!text) return false;
    if (/^#{1,6}\s+/.test(text)) return true;
    if (/^[A-Z][A-Z0-9 _/&()-]{2,}:?\s*$/.test(stripMarkdownFormatting(text))) return true;
    return false;
}

function personaHeadingMatches(line, headingNames) {
    const heading = stripMarkdownFormatting(line)
        .replace(/^#{1,6}\s*/, '')
        .replace(/[:=]+$/g, '')
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    return headingNames.some(name => new RegExp(`\\b${escapeRegExp(name)}\\b`, 'i').test(heading));
}

function parsePersonaListItem(line) {
    const text = stripMarkdownFormatting(line)
        .replace(/^\s*(?:[-*+]|[0-9]+[.)])\s+/, '')
        .trim();
    if (!text || text === stripMarkdownFormatting(line).trim()) return '';
    if (/^(?:none|not specified|n\/a|null|empty)$/i.test(text)) return '';
    return text;
}

function stripMarkdownFormatting(value) {
    return String(value ?? '')
        .replace(/[`*_~]/g, '')
        .trim();
}

function looksLikeEquippedGear(item) {
    if (/\b(?:knife|dagger|sword|axe|mace|bow|crossbow|staff|wand|tool|kit|waterskin|key|coin|coins|potion|scroll|book|rope|torch|flint|ration|rations)\b/i.test(String(item || ''))) return false;
    return /\b(?:shirt|tunic|robe|coat|cloak|jacket|trousers|pants|skirt|dress|boots?|shoes?|sandals?|gloves?|belt|armor|armour|helmet|hat|hood|mask|gauntlets?|bracers?|greaves?|clothes?|clothing|linen|leather)\b/i.test(String(item || ''));
}

function addUniqueTrackerSeedItem(list, item) {
    const text = String(item || '').trim();
    if (!text) return;
    if (list.some(existing => existing.toLowerCase() === text.toLowerCase())) return;
    list.push(text);
}

function hashTextForSeed(text) {
    let hash = 2166136261;
    const source = String(text || '');
    for (let index = 0; index < source.length; index += 1) {
        hash ^= source.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return (hash >>> 0).toString(16);
}

function getPlayerCoreStats(context = getContext()) {
    const root = getPlayerRoot(context);
    if (root?.ready && isValidCoreStats(root.stats)) {
        return normalizeCoreStats(root.stats);
    }
    return getPersonaCoreStats(context);
}

function playerSetupNeeded(context = getContext()) {
    const root = getPlayerRoot(context);
    if (!root || root.disabled) return false;
    if (root.forceCreator) return true;
    if (root.ready) return false;
    return !getPersonaCoreStats(context);
}

function applyPlayerCoreStatsOverride(semanticLedger, context = getContext()) {
    const stats = getPlayerCoreStats(context);
    if (!semanticLedger || !isValidCoreStats(stats)) return semanticLedger;

    semanticLedger.engineContext = semanticLedger.engineContext || {};
    semanticLedger.engineContext.userCoreStats = {
        ...(semanticLedger.engineContext.userCoreStats || {}),
        Rank: 'none',
        MainStat: 'none',
        ...normalizeCoreStats(stats),
    };
    semanticLedger.deterministicOverrides = {
        ...(semanticLedger.deterministicOverrides || {}),
        userCoreStats: {
            source: 'structuredPreflightPlayer/persona',
            ...normalizeCoreStats(stats),
        },
    };
    return semanticLedger;
}

function isValidCoreStats(stats) {
    return PLAYER_STATS.every(stat => {
        const value = Number(stats?.[stat]);
        return Number.isInteger(value) && value >= 1 && value <= 10;
    });
}

function normalizeCoreStats(stats) {
    return {
        PHY: clampNumber(stats?.PHY, 1, 10, 1),
        MND: clampNumber(stats?.MND, 1, 10, 1),
        CHA: clampNumber(stats?.CHA, 1, 10, 1),
    };
}

function parseCoreStatsBlock(text) {
    const raw = String(text ?? '');
    const source = normalizeCoreStatsParseText(raw);
    if (!source.trim()) return null;

    const stats = {};
    for (const stat of PLAYER_STATS) {
        const value = findCoreStatValue(source, stat);
        if (!value) return parseCoreStatsTable(raw);
        stats[stat] = value;
    }
    return isValidCoreStats(stats) ? normalizeCoreStats(stats) : null;
}

function normalizeCoreStatsParseText(text) {
    return String(text ?? '')
        .normalize('NFKC')
        .replace(/[ï¼šï¹•]/g, ':')
        .replace(/[ï¼]/g, '=')
        .replace(/[â€“â€”âˆ’]/g, '-')
        .replace(/[`*_~#>]/g, ' ')
        .replace(/[|/\\,;]+/g, ' ')
        .replace(/[()[\]{}]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function findCoreStatValue(source, stat) {
    const numberPattern = '(10|[1-9]|one|two|three|four|five|six|seven|eight|nine|ten)';
    const statPattern = new RegExp(
        `(?:^|[^A-Za-z0-9])${stat}\\s*(?:stat|score|rating|attribute|value)?\\s*(?:(?:is|at|as|=|:|-)\\s*)?${numberPattern}(?:\\s*(?:out\\s+of\\s+10|of\\s+10))?(?=$|[^A-Za-z0-9])`,
        'i',
    );
    const match = statPattern.exec(source);
    if (!match) return null;
    return parseCoreStatNumber(match[1]);
}

function parseCoreStatsTable(text) {
    const lines = String(text ?? '').split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
        const headerStats = extractCoreStatLabels(lines[index]);
        if (new Set(headerStats).size !== PLAYER_STATS.length) continue;

        const sameLineValues = extractCoreStatNumbers(normalizeCoreStatsParseText(lines[index]));
        const sameLineStats = buildStatsFromOrderedValues(headerStats, sameLineValues);
        if (isValidCoreStats(sameLineStats)) return normalizeCoreStats(sameLineStats);

        for (let lookahead = index + 1; lookahead < Math.min(lines.length, index + 5); lookahead += 1) {
            if (isLikelyMarkdownSeparator(lines[lookahead])) continue;
            const nextLineValues = extractCoreStatNumbers(normalizeCoreStatsParseText(lines[lookahead]));
            const nextLineStats = buildStatsFromOrderedValues(headerStats, nextLineValues);
            if (isValidCoreStats(nextLineStats)) return normalizeCoreStats(nextLineStats);
        }
    }
    return null;
}

function extractCoreStatLabels(line) {
    return [...String(line ?? '').matchAll(/\b(PHY|MND|CHA)\b/gi)].map(match => match[1].toUpperCase());
}

function extractCoreStatNumbers(line) {
    const numbers = [];
    const pattern = /\b(10|[1-9]|one|two|three|four|five|six|seven|eight|nine|ten)\b/gi;
    for (const match of String(line ?? '').matchAll(pattern)) {
        const before = String(line ?? '').slice(Math.max(0, match.index - 12), match.index).toLowerCase();
        if (/\b(?:out\s+of|of)\s*$/.test(before)) continue;
        const value = parseCoreStatNumber(match[1]);
        if (value) numbers.push(value);
    }
    return numbers;
}

function buildStatsFromOrderedValues(labels, values) {
    if (!Array.isArray(labels) || !Array.isArray(values) || labels.length < PLAYER_STATS.length || values.length < PLAYER_STATS.length) return null;
    const stats = {};
    for (let index = 0; index < PLAYER_STATS.length; index += 1) {
        stats[labels[index]] = values[index];
    }
    return stats;
}

function isLikelyMarkdownSeparator(line) {
    return /^[\s|:.-]+$/.test(String(line ?? '').trim());
}

function parseCoreStatNumber(value) {
    const text = String(value ?? '').trim().toLowerCase();
    const words = {
        one: 1,
        two: 2,
        three: 3,
        four: 4,
        five: 5,
        six: 6,
        seven: 7,
        eight: 8,
        nine: 9,
        ten: 10,
    };
    return words[text] || Number(text) || null;
}

function clampNumber(value, min, max, fallback) {
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return fallback;
    return Math.max(min, Math.min(max, Math.round(numeric)));
}

function rollD10() {
    return Math.floor(Math.random() * 10) + 1;
}

function rollStatPair() {
    const rolls = [rollD10(), rollD10()];
    return { rolls, value: Math.max(...rolls) };
}

function shuffleArray(values) {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(Math.random() * (index + 1));
        [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
}

function buildNewCharacterRollState() {
    const statPools = {};
    const stats = {};
    for (const stat of PLAYER_STATS) {
        const roll = rollStatPair();
        statPools[stat] = roll.rolls;
        stats[stat] = roll.value;
    }
    return {
        stage: 'reroll',
        flow: 'new',
        createdAt: Date.now(),
        statPools,
        stats,
        rerollValue: rollD10(),
        rerollApplied: null,
        rerollSkipped: false,
        swapApplied: null,
        identity: {
            raceMode: 'random',
            pickedRace: 'Human',
            specifiedRace: '',
            specifiedRaceDescriptionMode: 'system',
            specifiedRaceDescription: '',
            appearance: '',
        },
    };
}

function buildPersonaRollState(analysis) {
    const primary = PLAYER_STATS.includes(analysis?.PrimaryStat) ? analysis.PrimaryStat : 'PHY';
    const rolls = [rollStatPair(), rollStatPair(), rollStatPair()].sort((a, b) => b.value - a.value);
    const otherStats = shuffleArray(PLAYER_STATS.filter(stat => stat !== primary));
    const stats = {
        [primary]: rolls[0].value,
        [otherStats[0]]: rolls[1].value,
        [otherStats[1]]: rolls[2].value,
    };
    return {
        stage: 'reroll',
        flow: 'persona',
        createdAt: Date.now(),
        statPools: {
            [primary]: rolls[0].rolls,
            [otherStats[0]]: rolls[1].rolls,
            [otherStats[1]]: rolls[2].rolls,
        },
        stats,
        rerollValue: rollD10(),
        rerollApplied: null,
        rerollSkipped: false,
        swapApplied: null,
        personaAnalysis: analysis,
    };
}

function getActivePersonaDescriptor() {
    if (!power_user) return null;
    power_user.persona_descriptions = power_user.persona_descriptions || {};
    const avatarId = String(user_avatar || '').trim();
    if (!avatarId) return null;
    if (!power_user.persona_descriptions[avatarId]) {
        power_user.persona_descriptions[avatarId] = {
            description: power_user.persona_description || '',
            position: power_user.persona_description_position ?? persona_description_positions.IN_PROMPT,
            depth: power_user.persona_description_depth,
            role: power_user.persona_description_role,
            lorebook: power_user.persona_description_lorebook,
        };
    }
    return power_user.persona_descriptions[avatarId];
}

async function writePlayerSheetToPersona(sheetText, context = getContext()) {
    const descriptor = getActivePersonaDescriptor();
    if (!descriptor) {
        throw new Error('No active SillyTavern persona is selected, so the generated character sheet could not be inserted into persona.');
    }

    const current = String(power_user.persona_description || descriptor.description || '').trim();
    const cleanSheet = String(sheetText || '').trim();
    if (!cleanSheet) {
        throw new Error('Generated character sheet is empty; persona was not changed.');
    }

    const nextDescription = cleanSheet;

    power_user.persona_description = nextDescription;
    descriptor.description = nextDescription;
    descriptor.position = descriptor.position ?? power_user.persona_description_position ?? persona_description_positions.IN_PROMPT;
    if (descriptor.depth === undefined && power_user.persona_description_depth !== undefined) descriptor.depth = power_user.persona_description_depth;
    if (descriptor.role === undefined && power_user.persona_description_role !== undefined) descriptor.role = power_user.persona_description_role;
    if (descriptor.lorebook === undefined && power_user.persona_description_lorebook !== undefined) descriptor.lorebook = power_user.persona_description_lorebook;

    setPersonaDescription?.();
    saveExtensionSettings();
    if (typeof context?.saveMetadataDebounced === 'function') context.saveMetadataDebounced();
    return { previous: current, next: nextDescription };
}

function formatStatsTable(stats) {
    const normalized = normalizeCoreStats(stats || {});
    return PLAYER_STATS.map(stat => `${stat}: ${normalized[stat]}`).join(' | ');
}

function clone(value) {
    return value == null ? value : JSON.parse(JSON.stringify(value));
}

function isRealName(value) {
    const text = String(value ?? '').trim();
    return Boolean(text && text !== '(none)' && text.toLowerCase() !== 'none');
}

function toRealNameArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map(item => String(item ?? '').trim()).filter(isRealName);
}

function normalizeDisplayTrackerNpcs(npcs) {
    const normalized = {};
    for (const [name, value] of Object.entries(npcs || {})) {
        if (!isRealName(name)) continue;
        const entry = normalizeTrackerEntry(value);
        if (entry.lifecycle === 'Retired' && !isPromotableTrackerName(name)) {
            entry.lifecycle = 'Active';
        }
        normalized[name] = entry;
    }
    return normalized;
}

function normalizeVisibleNpcState(value) {
    const normalized = {};
    if (!value || typeof value !== 'object') return normalized;
    for (const [name, state] of Object.entries(value)) {
        if (!isRealName(name)) continue;
        normalized[name] = {
            inactiveReplies: Math.max(0, Math.floor(Number(state?.inactiveReplies || 0))),
        };
    }
    return normalized;
}

function mapExistingDisplayNpcName(npcs, rawName) {
    const wanted = String(rawName || '').trim().toLowerCase();
    if (!wanted) return '';
    return Object.keys(npcs || {}).find(name => name.toLowerCase() === wanted) || '';
}

function addActiveDisplayNpcName(activeNames, npcs, rawName) {
    if (!activeNames || !npcs || !isRealName(rawName)) return;
    const name = mapExistingDisplayNpcName(npcs, rawName);
    if (name) activeNames.add(name);
}

function addActiveDisplayNpcNames(activeNames, npcs, values) {
    for (const value of toRealNameArray(values)) {
        addActiveDisplayNpcName(activeNames, npcs, value);
    }
}

function getActiveDisplayNpcNamesFromReport(npcs, report) {
    const activeNames = new Set();
    const handoff = report?.finalNarrativeHandoff || {};
    const packet = handoff.resolutionPacket || {};
    addActiveDisplayNpcNames(activeNames, npcs, packet.NPCInScene);
    addActiveDisplayNpcNames(activeNames, npcs, packet.ActionTargets);
    addActiveDisplayNpcNames(activeNames, npcs, packet.OppTargets?.NPC);
    addActiveDisplayNpcNames(activeNames, npcs, packet.hostilesInScene?.NPC);
    addActiveDisplayNpcNames(activeNames, npcs, packet.BenefitedObservers);
    addActiveDisplayNpcNames(activeNames, npcs, packet.HarmedObservers);
    for (const npcHandoff of handoff.npcHandoffs || []) {
        addActiveDisplayNpcName(activeNames, npcs, npcHandoff?.NPC);
    }
    for (const [name, result] of Object.entries(handoff.proactivityResults || {})) {
        if (result?.Proactive === 'Y') addActiveDisplayNpcName(activeNames, npcs, name);
        addActiveDisplayNpcName(activeNames, npcs, result?.ProactivityTarget);
    }
    for (const [name, result] of Object.entries(handoff.aggressionResults || {})) {
        addActiveDisplayNpcName(activeNames, npcs, name);
        addActiveDisplayNpcName(activeNames, npcs, result?.Target || result?.ProactivityTarget || result?.CounterTarget);
    }
    return activeNames;
}

function npcNameAppearsInText(name, text) {
    const cleanName = String(name || '').trim();
    if (!cleanName || !text) return false;
    const leadingBoundary = /^[\p{L}\p{N}_]/u.test(cleanName)
        ? '(?:^|[^\\p{L}\\p{N}_])'
        : '';
    const trailingBoundary = /[\p{L}\p{N}_]$/u.test(cleanName) ? '(?![\\p{L}\\p{N}_])' : '';
    return new RegExp(`${leadingBoundary}${escapeRegExp(cleanName)}${trailingBoundary}`, 'iu').test(String(text));
}

function getMentionedDisplayNpcNames(npcs, assistantText) {
    const activeNames = new Set();
    for (const name of Object.keys(npcs || {})) {
        if (npcNameAppearsInText(name, assistantText)) activeNames.add(name);
    }
    return activeNames;
}

function applyVisibleTrackerState(snapshot, activeNames, previousSnapshot = null) {
    if (!snapshot?.npcs) return snapshot;
    const npcs = normalizeDisplayTrackerNpcs(snapshot.npcs);
    const previousState = normalizeVisibleNpcState(previousSnapshot?.displayNpcState);
    const nextState = {};
    const visibleNpcNames = [];

    for (const name of Object.keys(npcs)) {
        const active = activeNames?.has(name);
        const previousInactive = previousState[name]?.inactiveReplies || 0;
        const inactiveReplies = active ? 0 : previousInactive + 1;
        nextState[name] = { inactiveReplies };
        if (active || inactiveReplies < TRACKER_VISIBLE_INACTIVE_LIMIT) {
            visibleNpcNames.push(name);
        }
    }

    snapshot.npcs = npcs;
    snapshot.displayNpcState = nextState;
    snapshot.visibleNpcNames = visibleNpcNames;
    return snapshot;
}

function markVisibleTrackerActive(snapshot, activeNames) {
    if (!snapshot?.npcs || !activeNames?.size) return snapshot;
    const npcs = normalizeDisplayTrackerNpcs(snapshot.npcs);
    const state = normalizeVisibleNpcState(snapshot.displayNpcState);
    const visible = new Set(Array.isArray(snapshot.visibleNpcNames) ? snapshot.visibleNpcNames : []);
    for (const rawName of activeNames) {
        const name = mapExistingDisplayNpcName(npcs, rawName);
        if (!name) continue;
        state[name] = { inactiveReplies: 0 };
        visible.add(name);
    }
    snapshot.npcs = npcs;
    snapshot.displayNpcState = state;
    snapshot.visibleNpcNames = [...visible].filter(name => Boolean(npcs[name]));
    return snapshot;
}

function buildDisplayTrackerSnapshot({ messageKey, pendingRun, report, assistantText = '' }) {
    const trackerAfter = normalizeDisplayTrackerNpcs({
        ...(pendingRun?.trackerBefore || {}),
        ...(pendingRun?.trackerAfter || {}),
    });
    const user = normalizeTrackerUserState({
        ...(pendingRun?.userBefore || {}),
        ...(pendingRun?.userAfter || {}),
    });
    const promotionResult = applyExplicitNamePromotions(trackerAfter, {
        messageKey,
        assistantText,
    });
    const snapshot = {
        version: TRACKER_DISPLAY_VERSION,
        messageKey,
        type: pendingRun?.type || 'normal',
        savedAt: Date.now(),
        userCoreStats: pendingRun?.userCoreStats || report?.semanticLedger?.engineContext?.userCoreStats || null,
        user,
        npcs: promotionResult.npcs,
    };
    const activeNames = getActiveDisplayNpcNamesFromReport(snapshot.npcs, report);
    for (const name of getMentionedDisplayNpcNames(snapshot.npcs, assistantText)) {
        activeNames.add(name);
    }
    return applyVisibleTrackerState(snapshot, activeNames, getPreviousTrackerDisplaySnapshot(messageKey));
}

function applyExplicitNamePromotions(npcs, { assistantText } = {}) {
    const normalized = normalizeDisplayTrackerNpcs(npcs);
    const activeNames = Object.entries(normalized)
        .filter(([, entry]) => entry?.lifecycle === 'Active')
        .map(([name]) => name);
    const promotions = getExplicitNamePromotions(assistantText, activeNames);
    const promotedOldNames = new Set();

    for (const { oldName, newName } of promotions) {
        if (promotedOldNames.has(oldName)) continue;
        const oldEntry = normalized[oldName];
        const newEntry = normalized[newName];
        if (!oldEntry || oldEntry.lifecycle !== 'Active') continue;

        promoteTrackerEntry(normalized, oldName, newName);
        promotedOldNames.add(oldName);
    }

    return {
        npcs: normalized,
    };
}

function promoteTrackerEntry(npcs, oldName, newName) {
    const oldEntry = npcs?.[oldName];
    const cleanNewName = cleanRevealedTrackerName(newName);
    if (!oldEntry || !cleanNewName || cleanNewName.toLowerCase() === String(oldName || '').trim().toLowerCase()) return false;
    const newEntry = npcs[cleanNewName];
    npcs[cleanNewName] = normalizeTrackerEntry({
        ...oldEntry,
        ...(newEntry || {}),
        lifecycle: 'Active',
    });
    npcs[oldName] = normalizeTrackerEntry({
        ...oldEntry,
        lifecycle: 'Retired',
    });
    return true;
}

function buildTrackerUpdateForPersistence(displaySnapshot) {
    return {
        npcs: normalizeDisplayTrackerNpcs(displaySnapshot?.npcs || {}),
        user: normalizeTrackerUserState(displaySnapshot?.user || {}),
    };
}

function mergePostNarrationTrackerDelta(snapshot, delta, options = {}) {
    if (!snapshot || !delta) return snapshot;
    const merged = clone(snapshot);
    merged.user = applyTrackerDeltaToUserState(merged.user || {}, delta.user || {});
    const npcs = normalizeDisplayTrackerNpcs(merged.npcs || {});
    for (const npcDelta of delta.npcs || []) {
        const rawName = String(npcDelta?.NPC || '').trim();
        if (!isRealName(rawName)) continue;
        const name = findExistingTrackerName(npcs, rawName) || rawName;
        const before = npcs[name] || {};
        npcs[name] = normalizeTrackerEntry({
            ...before,
            ...applyTrackerDeltaToNpcState(before, npcDelta),
        });
        const revealedName = cleanRevealedTrackerName(npcDelta?.revealedName);
        if (revealedName && isPromotableTrackerName(name)) {
            promoteTrackerEntry(npcs, name, revealedName);
        }
    }
    merged.npcs = applyExplicitNamePromotions(npcs, options).npcs;
    const deltaActiveNames = new Set();
    for (const npcDelta of delta.npcs || []) {
        addActiveDisplayNpcName(deltaActiveNames, merged.npcs, npcDelta?.NPC);
        addActiveDisplayNpcName(deltaActiveNames, merged.npcs, npcDelta?.revealedName);
    }
    for (const name of getMentionedDisplayNpcNames(merged.npcs, options.assistantText)) {
        deltaActiveNames.add(name);
    }
    markVisibleTrackerActive(merged, deltaActiveNames);
    merged.postNarrationTrackerDelta = {
        updatedAt: Date.now(),
        userChanged: trackerDeltaHasChanges(delta.user, true),
        npcChanged: (delta.npcs || []).some(item => trackerDeltaHasChanges(item, false)),
    };
    return merged;
}

function findExistingTrackerName(npcs, wantedName) {
    const wanted = String(wantedName || '').trim().toLowerCase();
    if (!wanted) return '';
    return Object.keys(npcs || {}).find(name => name.toLowerCase() === wanted) || '';
}

function trackerDeltaHasChanges(delta, includePlayerFields) {
    if (!delta || typeof delta !== 'object') return false;
    if (normalizeTrackerDeltaCondition(delta.condition) !== 'unchanged') return true;
    if (!includePlayerFields && cleanRevealedTrackerName(delta.revealedName)) return true;
    if (!includePlayerFields && cleanPersonalitySummary(delta.personalitySummary)) return true;
    const fields = includePlayerFields
        ? ['woundsAdd', 'woundsRemove', 'statusAdd', 'statusRemove', 'gearAdd', 'gearRemove', 'inventoryAdd', 'inventoryRemove', 'tasksAdd', 'tasksRemove', 'commitmentsAdd', 'commitmentsRemove']
        : ['woundsAdd', 'woundsRemove', 'statusAdd', 'statusRemove', 'gearAdd', 'gearRemove'];
    return fields.some(field => Array.isArray(delta[field]) && delta[field].length > 0);
}

function applyTrackerDeltaToUserState(before, delta) {
    const source = normalizeTrackerUserState(before || {});
    const result = {
        condition: source.condition,
        wounds: [...source.wounds],
        statusEffects: [...source.statusEffects],
        gear: [...source.gear],
        inventory: [...source.inventory],
        tasks: [...source.tasks],
        commitments: [...source.commitments],
    };
    const condition = normalizeTrackerDeltaCondition(delta?.condition);
    if (condition !== 'unchanged') result.condition = condition;
    result.wounds = applyTrackerListDelta(result.wounds, delta?.woundsAdd, delta?.woundsRemove);
    result.statusEffects = applyTrackerListDelta(result.statusEffects, delta?.statusAdd, delta?.statusRemove);
    result.gear = applyTrackerListDelta(result.gear, delta?.gearAdd, delta?.gearRemove);
    result.inventory = applyTrackerListDelta(result.inventory, delta?.inventoryAdd, delta?.inventoryRemove);
    result.tasks = applyTrackerListDelta(result.tasks, delta?.tasksAdd, delta?.tasksRemove);
    result.commitments = applyTrackerListDelta(result.commitments, delta?.commitmentsAdd, delta?.commitmentsRemove);
    return normalizeTrackerUserState(result);
}

function applyTrackerDeltaToNpcState(before, delta) {
    const source = normalizeTrackerEntry(before || {});
    const result = {
        userHistory: source.userHistory,
        raceProfile: source.raceProfile,
        personalitySummary: source.personalitySummary || '',
        condition: source.condition,
        wounds: [...source.wounds],
        statusEffects: [...source.statusEffects],
        gear: [...source.gear],
    };
    const personalitySummary = cleanPersonalitySummary(delta?.personalitySummary);
    if (personalitySummary) result.personalitySummary = personalitySummary;
    const condition = normalizeTrackerDeltaCondition(delta?.condition);
    if (condition !== 'unchanged') result.condition = condition;
    result.wounds = applyTrackerListDelta(result.wounds, delta?.woundsAdd, delta?.woundsRemove);
    result.statusEffects = applyTrackerListDelta(result.statusEffects, delta?.statusAdd, delta?.statusRemove);
    result.gear = applyTrackerListDelta(result.gear, delta?.gearAdd, delta?.gearRemove);
    return result;
}

function normalizeTrackerDeltaCondition(value) {
    const text = String(value ?? 'unchanged').trim().toLowerCase().replace(/[\s-]+/g, '_');
    return ['unchanged', 'healthy', 'bruised', 'wounded', 'badly_wounded', 'critical', 'dead'].includes(text) ? text : 'unchanged';
}

function applyTrackerListDelta(current, add, remove) {
    const normalized = [];
    const seen = new Set();
    const push = item => {
        const text = cleanTrackerDeltaText(item);
        if (!text) return;
        const key = text.toLowerCase();
        if (seen.has(key)) return;
        seen.add(key);
        normalized.push(text);
    };
    for (const item of current || []) push(item);
    const removeKeys = new Set((Array.isArray(remove) ? remove : [])
        .map(cleanTrackerDeltaText)
        .filter(Boolean)
        .map(text => text.toLowerCase()));
    const filtered = normalized.filter(item => !removeKeys.has(item.toLowerCase()));
    const filteredSeen = new Set(filtered.map(item => item.toLowerCase()));
    for (const item of add || []) {
        const text = cleanTrackerDeltaText(item);
        if (!text) continue;
        const key = text.toLowerCase();
        if (filteredSeen.has(key)) continue;
        filteredSeen.add(key);
        filtered.push(text);
    }
    return filtered.slice(0, 40);
}

function cleanTrackerDeltaText(value) {
    const text = String(value ?? '').trim().replace(/^\[/, '').replace(/\]$/, '').replace(/^["']|["']$/g, '').trim();
    if (!text || ['(none)', 'none', 'null', 'n/a', 'unchanged'].includes(text.toLowerCase())) return '';
    return text.slice(0, 140);
}

function cleanPersonalitySummary(value) {
    const text = String(value ?? '').trim().replace(/\s+/g, ' ').replace(/^["']|["']$/g, '').trim();
    if (!text || ['(none)', 'none', 'null', 'n/a', 'unknown', 'unchanged'].includes(text.toLowerCase())) return '';
    return text.slice(0, 160);
}

function cleanRevealedTrackerName(value) {
    const text = String(value ?? '').trim().replace(/\s+/g, ' ').replace(/^["']|["']$/g, '').trim();
    if (!text || ['(none)', 'none', 'null', 'n/a', 'unknown', 'unchanged'].includes(text.toLowerCase())) return '';
    if (!/^[\p{L}][\p{L}' -]{1,40}$/u.test(text)) return '';
    return text
        .split(/[\s-]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ')
        .slice(0, 60);
}

function currentResolutionNpcNames(packet = {}) {
    return uniqueNames([
        ...toRealNameArray(packet.NPCInScene),
        ...toRealNameArray(packet.ActionTargets),
        ...toRealNameArray(packet.OppTargets?.NPC),
        ...toRealNameArray(packet.BenefitedObservers),
        ...toRealNameArray(packet.HarmedObservers),
    ]);
}

function uniqueNames(names) {
    const result = [];
    const seen = new Set();
    for (const name of toRealNameArray(names)) {
        const key = name.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(name);
    }
    return result;
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeSearchText(value) {
    return String(value ?? '')
        .toLowerCase()
        .replace(/\s+/g, ' ')
        .trim();
}

function getMessageSwipeId(message) {
    const fromMessage = Number(message?.swipe_id ?? 0);
    return Number.isFinite(fromMessage) && fromMessage >= 0 ? fromMessage : 0;
}

function ensureSwipeInfoEntry(message, swipeId) {
    if (!Array.isArray(message?.swipe_info)) return null;
    if (!message.swipe_info[swipeId] || typeof message.swipe_info[swipeId] !== 'object') {
        message.swipe_info[swipeId] = {
            send_date: message.send_date,
            gen_started: message.gen_started,
            gen_finished: message.gen_finished,
            extra: {},
        };
    }
    message.swipe_info[swipeId].extra = message.swipe_info[swipeId].extra || {};
    return message.swipe_info[swipeId];
}

function setMessageTrackerDisplaySnapshot(message, snapshot) {
    if (!message || message.is_user || !snapshot) return;
    const swipeId = getMessageSwipeId(message);
    message.extra = message.extra || {};
    message.extra[TRACKER_DISPLAY_EXTRA_KEY] = message.extra[TRACKER_DISPLAY_EXTRA_KEY] || {};
    message.extra[TRACKER_DISPLAY_EXTRA_KEY][swipeId] = clone(snapshot);

    const swipeInfo = ensureSwipeInfoEntry(message, swipeId);
    if (swipeInfo) {
        swipeInfo.extra[TRACKER_DISPLAY_EXTRA_KEY] = swipeInfo.extra[TRACKER_DISPLAY_EXTRA_KEY] || {};
        swipeInfo.extra[TRACKER_DISPLAY_EXTRA_KEY][swipeId] = clone(snapshot);
    }
}

function setMessageNarratorHandoff(message, handoffText) {
    if (!message || message.is_user || !handoffText) return;
    const swipeId = getMessageSwipeId(message);
    const payload = {
        version: NARRATOR_HANDOFF_VERSION,
        savedAt: Date.now(),
        text: String(handoffText),
    };
    message.extra = message.extra || {};
    message.extra[NARRATOR_HANDOFF_EXTRA_KEY] = message.extra[NARRATOR_HANDOFF_EXTRA_KEY] || {};
    message.extra[NARRATOR_HANDOFF_EXTRA_KEY][swipeId] = payload;

    const swipeInfo = ensureSwipeInfoEntry(message, swipeId);
    if (swipeInfo) {
        swipeInfo.extra[NARRATOR_HANDOFF_EXTRA_KEY] = swipeInfo.extra[NARRATOR_HANDOFF_EXTRA_KEY] || {};
        swipeInfo.extra[NARRATOR_HANDOFF_EXTRA_KEY][swipeId] = clone(payload);
    }
}

function getMessageNarratorHandoff(message) {
    if (!message || message.is_user) return null;
    const swipeId = getMessageSwipeId(message);
    const payload = message.extra?.[NARRATOR_HANDOFF_EXTRA_KEY]?.[swipeId]
        || message.swipe_info?.[swipeId]?.extra?.[NARRATOR_HANDOFF_EXTRA_KEY]?.[swipeId]
        || null;
    if (!payload) return null;
    if (typeof payload === 'string') return { version: 0, text: payload };
    return payload?.text ? payload : null;
}

function getMessageTrackerDisplaySnapshot(message) {
    if (!message || message.is_user) return null;
    const swipeId = getMessageSwipeId(message);
    return message.extra?.[TRACKER_DISPLAY_EXTRA_KEY]?.[swipeId]
        || message.swipe_info?.[swipeId]?.extra?.[TRACKER_DISPLAY_EXTRA_KEY]?.[swipeId]
        || null;
}

function getLatestTrackerDisplaySnapshot(context = getContext()) {
    const chat = context?.chat;
    if (!Array.isArray(chat)) return null;
    for (let index = chat.length - 1; index >= 0; index -= 1) {
        const snapshot = getMessageTrackerDisplaySnapshot(chat[index]);
        if (snapshot?.npcs) return snapshot;
    }
    return null;
}

function getPreviousTrackerDisplaySnapshot(messageKey, context = getContext()) {
    const chat = context?.chat;
    if (!Array.isArray(chat)) return null;
    for (let index = chat.length - 1; index >= 0; index -= 1) {
        if (getMessageKey(index, context) === messageKey) continue;
        const snapshot = getMessageTrackerDisplaySnapshot(chat[index]);
        if (!snapshot?.npcs) continue;
        if (snapshot.messageKey && snapshot.messageKey === messageKey) continue;
        return snapshot;
    }
    return null;
}

function restoreTrackerFromLatestDisplaySnapshot(context = getContext()) {
    const root = getTrackerRoot(context);
    const snapshot = getLatestTrackerDisplaySnapshot(context);
    if (!root || !snapshot?.npcs) return false;
    const rapportClock = normalizeRapportClockState(root.rapportClock);
    root.npcs = normalizeDisplayTrackerNpcs(snapshot.npcs);
    root.user = normalizeTrackerUserState(snapshot.user || root.user || {});
    root.rapportClock = rapportClock;
    return true;
}

function restoreTrackerFromMessageDisplaySnapshot(messageId, context = getContext()) {
    const root = getTrackerRoot(context);
    const message = context?.chat?.[messageId];
    const snapshot = getMessageTrackerDisplaySnapshot(message);
    if (!root || !snapshot?.npcs) return false;
    const rapportClock = normalizeRapportClockState(root.rapportClock);
    root.npcs = normalizeDisplayTrackerNpcs(snapshot.npcs);
    root.user = normalizeTrackerUserState(snapshot.user || root.user || {});
    root.rapportClock = rapportClock;
    return true;
}

function formatCoreStats(core) {
    if (!core) return 'PHY - / MND - / CHA -';
    return `PHY ${core.PHY ?? '-'} / MND ${core.MND ?? '-'} / CHA ${core.CHA ?? '-'}`;
}

function formatDisposition(disposition) {
    if (!disposition) return 'B-/F-/H-';
    return `B${disposition.B}/F${disposition.F}/H${disposition.H}`;
}

function formatTrackerCondition(value) {
    return String(value || 'healthy')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatTrackerList(items) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    return list.length ? list.join('; ') : 'None';
}

function trackerListLine(label, items, options = {}) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    if (!list.length) {
        return options.showEmpty
            ? `<div class="structured-preflight-tracker-list"><div class="structured-preflight-tracker-list-label">${escapeHtml(label)}</div><div class="structured-preflight-tracker-empty">None</div></div>`
            : '';
    }
    return `
        <div class="structured-preflight-tracker-list">
            <div class="structured-preflight-tracker-list-label">${escapeHtml(label)}</div>
            <ul>
                ${list.map(item => `<li>${escapeHtml(item)}</li>`).join('')}
            </ul>
        </div>`;
}

function relationshipTowardUser(disposition, classified) {
    if (!disposition) return 'Uninitialized';
    if (classified?.lock === 'TERROR') return 'Terrified of user';
    if (classified?.lock === 'HATRED') return 'Hates user';
    if (classified?.lock === 'FREEZE') {
        if (disposition.H >= 3) return 'Hostile and guarded';
        if (disposition.F >= 3) return 'Fearful and guarded';
    }
    if (disposition.B >= 4 && disposition.H <= 2 && disposition.F <= 2) return 'Close or trusting';
    if (disposition.B >= 3 && disposition.H <= 2) return 'Friendly or comfortable';
    if (disposition.H >= 3) return 'Hostile or obstructive';
    if (disposition.F >= 3) return 'Afraid or submissive';
    if (disposition.B <= 1) return 'Avoidant or distant';
    return 'Neutral or transactional';
}

function buildTrackerDisplayHtml(snapshot) {
    const npcs = normalizeDisplayTrackerNpcs(snapshot?.npcs);
    const visibleNames = Array.isArray(snapshot?.visibleNpcNames)
        ? new Set(snapshot.visibleNpcNames.map(name => String(name).toLowerCase()))
        : null;
    const names = Object.keys(npcs)
        .filter(name => !visibleNames || visibleNames.has(name.toLowerCase()))
        .sort((a, b) => a.localeCompare(b));
    const active = names.filter(name => npcs[name]?.lifecycle === 'Active');
    const inactive = names.filter(name => npcs[name]?.lifecycle !== 'Active');
    const userCore = snapshot?.userCoreStats;
    const user = normalizeTrackerUserState(snapshot?.user || {});
    const personaName = cleanTrackerDisplayName(name1) || 'User';

    const renderNpc = name => {
        const entry = npcs[name];
        const disposition = entry.currentDisposition;
        const classified = disposition ? classifyDisposition(disposition) : { lock: 'None', behavior: 'None' };
        const pressure = Number(entry.hostilePressure || 0);
        const landedPressure = Number(entry.hostileLandedPressure || 0);
        const pressureLine = pressure || landedPressure || entry.dominantLock !== 'None' || entry.pressureMode !== 'none'
            ? `<div class="structured-preflight-tracker-muted">Pressure ${pressure}/${landedPressure} | Mode ${escapeHtml(entry.pressureMode || 'none')} | Dominant ${escapeHtml(entry.dominantLock || 'None')}</div>`
            : '';
        return `
            <div class="structured-preflight-tracker-npc">
                <div class="structured-preflight-tracker-name">${escapeHtml(name)}</div>
                <div>Toward User <code>${escapeHtml(relationshipTowardUser(disposition, classified))}</code></div>
                <div>Condition <code>${escapeHtml(formatTrackerCondition(entry.condition))}</code></div>
                ${entry.personalitySummary ? `<div>Personality <code>${escapeHtml(entry.personalitySummary)}</code></div>` : ''}
                <div><code>${escapeHtml(formatDisposition(disposition))}</code> | Lock <code>${escapeHtml(classified.lock)}</code> | Behavior <code>${escapeHtml(classified.behavior)}</code></div>
                <div>Rapport <code>${escapeHtml(entry.currentRapport)}/5</code> | Relationship <code>${escapeHtml(entry.establishedRelationship || 'N')}</code></div>
                <div>Stats <code>${escapeHtml(formatCoreStats(entry.currentCoreStats))}</code></div>
                ${trackerListLine('Wounds', entry.wounds)}
                ${trackerListLine('Status Effects', entry.statusEffects)}
                ${trackerListLine('Gear', entry.gear)}
                ${pressureLine}
            </div>`;
    };

    const renderSection = (title, sectionNames) => `
        <div class="structured-preflight-tracker-section">
            <div class="structured-preflight-tracker-heading">${title}</div>
            ${sectionNames.length ? sectionNames.map(renderNpc).join('') : '<div class="structured-preflight-tracker-empty">None</div>'}
        </div>`;

    return `
        <div class="structured-preflight-tracker-body">
            <div class="structured-preflight-tracker-section structured-preflight-tracker-user">
                <div class="structured-preflight-tracker-title">${escapeHtml(personaName)}</div>
                <div class="structured-preflight-tracker-rows">
                    <div>Stats <code>${escapeHtml(formatCoreStats(userCore))}</code></div>
                    <div>Condition <code>${escapeHtml(formatTrackerCondition(user.condition))}</code></div>
                    ${trackerListLine('Wounds', user.wounds)}
                    ${trackerListLine('Status Effects', user.statusEffects)}
                    ${trackerListLine('Gear', user.gear, { showEmpty: true })}
                    ${trackerListLine('Inventory', user.inventory, { showEmpty: true })}
                    ${trackerListLine('Tasks', user.tasks, { showEmpty: true })}
                    ${trackerListLine('Commitments', user.commitments, { showEmpty: true })}
                </div>
            </div>
            <div class="structured-preflight-tracker-divider"></div>
            <div class="structured-preflight-tracker-title">NPCs</div>
            ${renderSection('Active NPCs', active)}
            ${inactive.length ? renderSection('Inactive NPCs', inactive) : ''}
        </div>`;
}

function cleanTrackerDisplayName(value) {
    const text = String(value ?? '').trim().replace(/\s+/g, ' ');
    if (!text || ['user', '{{user}}', 'you'].includes(text.toLowerCase())) return '';
    return text.slice(0, 80);
}

function buildNarratorHandoffHtml(payload) {
    const text = String(payload?.text ?? '').trim();
    if (!text) return '';
    return `
        <details class="${NARRATOR_HANDOFF_BLOCK_CLASS}">
            <summary>Narration Handoff</summary>
            <pre>${escapeHtml(text)}</pre>
        </details>`;
}

function escapeHtml(value) {
    return String(value ?? '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function ensureTrackerDisplayStyles() {
    if (document.getElementById('structured_preflight_tracker_display_styles')) return;
    const style = document.createElement('style');
    style.id = 'structured_preflight_tracker_display_styles';
    style.textContent = `
        #${TRACKER_WIDGET_ID} {
            position: fixed;
            left: 24px;
            top: 120px;
            z-index: 40000;
            color: var(--SmartThemeBodyColor, #eee);
            font-size: 0.88rem;
        }
        #${TRACKER_WIDGET_ID}.spe-tracker-dragging {
            user-select: none;
        }
        #${TRACKER_WIDGET_BUTTON_ID} {
            width: 50px;
            height: 50px;
            display: grid;
            place-items: center;
            border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.24));
            border-radius: 10px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 72%, transparent);
            color: inherit;
            box-shadow: 0 10px 26px rgba(0,0,0,0.28);
            cursor: grab;
            backdrop-filter: blur(8px);
        }
        #${TRACKER_WIDGET_BUTTON_ID}:active {
            cursor: grabbing;
        }
        #${TRACKER_WIDGET_BUTTON_ID} svg {
            width: 28px;
            height: 28px;
        }
        #${TRACKER_WIDGET_PANEL_ID} {
            position: fixed;
            width: min(420px, calc(100vw - 36px));
            max-height: min(620px, calc(100vh - 36px));
            margin: 0;
            padding: 0.7rem;
            border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.2));
            border-radius: 8px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 84%, transparent);
            box-shadow: 0 14px 36px rgba(0,0,0,0.35);
            overflow: auto;
            backdrop-filter: blur(10px);
        }
        #${TRACKER_WIDGET_PANEL_ID}[hidden] {
            display: none;
        }
        .structured-preflight-tracker-widget-title {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.75rem;
            margin-bottom: 0.55rem;
            font-weight: 700;
        }
        .structured-preflight-tracker-widget-close {
            width: 28px;
            height: 28px;
            border-radius: 6px;
            display: grid;
            place-items: center;
            border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.2));
            background: transparent;
            color: inherit;
            cursor: pointer;
        }
        .${TRACKER_DISPLAY_BLOCK_CLASS} {
            margin-top: 0.75rem;
            padding: 0.45rem 0.65rem;
            border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.18));
            border-radius: 6px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 26%, transparent);
            font-size: 0.88rem;
        }
        .${TRACKER_DISPLAY_BLOCK_CLASS} > summary {
            cursor: pointer;
            font-weight: 600;
            user-select: none;
        }
        .structured-preflight-tracker-body {
            margin-top: 0.55rem;
            display: grid;
            gap: 0.7rem;
        }
        .structured-preflight-tracker-title,
        .structured-preflight-tracker-heading,
        .structured-preflight-tracker-name {
            font-weight: 600;
        }
        .structured-preflight-tracker-title {
            padding-bottom: 0.2rem;
            border-bottom: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.18));
        }
        .structured-preflight-tracker-section {
            display: grid;
            gap: 0.45rem;
        }
        .structured-preflight-tracker-user {
            padding-bottom: 0.1rem;
        }
        .structured-preflight-tracker-rows {
            display: grid;
            gap: 0.4rem;
            line-height: 1.45;
        }
        .structured-preflight-tracker-list {
            display: grid;
            gap: 0.18rem;
        }
        .structured-preflight-tracker-list-label {
            font-weight: 600;
        }
        .structured-preflight-tracker-list ul {
            margin: 0;
            padding-left: 1.15rem;
        }
        .structured-preflight-tracker-list li {
            margin: 0.08rem 0;
        }
        .structured-preflight-tracker-divider {
            height: 1px;
            background: var(--SmartThemeBorderColor, rgba(255,255,255,0.22));
            opacity: 0.9;
        }
        .structured-preflight-tracker-npc {
            padding-left: 0.45rem;
            border-left: 2px solid var(--SmartThemeQuoteColor, rgba(255,255,255,0.28));
            line-height: 1.45;
        }
        .structured-preflight-tracker-muted,
        .structured-preflight-tracker-empty {
            opacity: 0.78;
        }
        .${NARRATOR_HANDOFF_BLOCK_CLASS} {
            margin-top: 0.75rem;
            padding: 0.45rem 0.65rem;
            border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.18));
            border-radius: 6px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 30%, transparent);
            font-size: 0.86rem;
        }
        .${NARRATOR_HANDOFF_BLOCK_CLASS} > summary {
            cursor: pointer;
            font-weight: 600;
            user-select: none;
        }
        .${NARRATOR_HANDOFF_BLOCK_CLASS} pre {
            margin: 0.55rem 0 0;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            max-height: 24rem;
            overflow: auto;
            line-height: 1.38;
        }
    `;
    document.head.append(style);
}

function renderNarratorHandoffBlockForMessage(messageId, payload = null, context = getContext()) {
    const message = context?.chat?.[messageId];
    const handoff = payload || getMessageNarratorHandoff(message);
    if (typeof document === 'undefined') return;

    const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
    if (!messageElement) return;

    messageElement.querySelector(`.${NARRATOR_HANDOFF_BLOCK_CLASS}`)?.remove();
    if (!handoff?.text) return;

    ensureTrackerDisplayStyles();
    const textElement = messageElement.querySelector('.mes_text');
    if (!textElement) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildNarratorHandoffHtml(handoff).trim();
    const block = wrapper.firstElementChild;
    if (!block) return;

    textElement.before(block);
}

function renderTrackerDisplayBlockForMessage(messageId, snapshot = null, context = getContext()) {
    if (typeof document === 'undefined') return;

    const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
    if (!messageElement) return;

    messageElement.querySelector(`.${TRACKER_DISPLAY_BLOCK_CLASS}`)?.remove();
}

function renderAllTrackerDisplayBlocks(context = getContext()) {
    if (!Array.isArray(context?.chat)) return;
    context.chat.forEach((message, index) => {
        if (!message?.is_user) {
            renderNarratorHandoffBlockForMessage(index, null, context);
            renderTrackerDisplayBlockForMessage(index, null, context);
        }
    });
    renderTrackerWidget(context);
}

function buildCurrentTrackerWidgetSnapshot(context = getContext()) {
    const latest = getLatestTrackerDisplaySnapshot(context);
    if (latest?.npcs) return latest;
    const root = getTrackerRoot(context);
    if (!root) return null;
    return {
        version: TRACKER_DISPLAY_VERSION,
        savedAt: Date.now(),
        userCoreStats: getPersonaCoreStats(context),
        user: normalizeTrackerUserState(root.user || {}),
        npcs: normalizeDisplayTrackerNpcs(root.npcs || {}),
    };
}

function renderTrackerWidget(context = getContext()) {
    if (typeof document === 'undefined') return;
    ensureTrackerDisplayStyles();

    const settings = getSettings();
    if (settings.postNarrationTrackerEnabled === false) {
        document.getElementById(TRACKER_WIDGET_ID)?.remove();
        return;
    }
    let widget = document.getElementById(TRACKER_WIDGET_ID);
    if (!widget) {
        widget = document.createElement('div');
        widget.id = TRACKER_WIDGET_ID;
        widget.innerHTML = `
            <button id="${TRACKER_WIDGET_BUTTON_ID}" type="button" title="Tracker" aria-label="Tracker">
                <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 7v14"></path>
                    <path d="M3 18a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3z"></path>
                </svg>
            </button>
            <div id="${TRACKER_WIDGET_PANEL_ID}" hidden>
                <div class="structured-preflight-tracker-widget-title">
                    <span>Tracker</span>
                    <button class="structured-preflight-tracker-widget-close" type="button" title="Collapse" aria-label="Collapse">Ã—</button>
                </div>
                <div data-structured-preflight-tracker-widget-body></div>
            </div>`;
        document.body.append(widget);
        attachTrackerWidgetHandlers(widget);
    }

    const pos = clampTrackerWidgetPosition(settings.trackerWidgetX, settings.trackerWidgetY);
    widget.style.left = `${pos.x}px`;
    widget.style.top = `${pos.y}px`;

    const panel = widget.querySelector(`#${TRACKER_WIDGET_PANEL_ID}`);
    if (panel) {
        panel.hidden = settings.trackerWidgetCollapsed !== false;
    }

    const body = widget.querySelector('[data-structured-preflight-tracker-widget-body]');
    if (!body) return;
    const snapshot = buildCurrentTrackerWidgetSnapshot(context);
    body.innerHTML = snapshot?.npcs
        ? buildTrackerDisplayHtml(snapshot)
        : '<div class="structured-preflight-tracker-empty">No tracker data yet.</div>';
    if (panel && !panel.hidden) positionTrackerWidgetPanel(widget, panel);
}

function attachTrackerWidgetHandlers(widget) {
    const button = widget.querySelector(`#${TRACKER_WIDGET_BUTTON_ID}`);
    const close = widget.querySelector('.structured-preflight-tracker-widget-close');
    let drag = null;

    button?.addEventListener('pointerdown', event => {
        if (event.button !== 0) return;
        const rect = widget.getBoundingClientRect();
        drag = {
            startX: event.clientX,
            startY: event.clientY,
            offsetX: event.clientX - rect.left,
            offsetY: event.clientY - rect.top,
            moved: false,
        };
        widget.classList.add('spe-tracker-dragging');
        button.setPointerCapture?.(event.pointerId);
    });
    button?.addEventListener('pointermove', event => {
        if (!drag) return;
        const x = event.clientX - drag.offsetX;
        const y = event.clientY - drag.offsetY;
        if (Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3) drag.moved = true;
        const pos = clampTrackerWidgetPosition(x, y);
        widget.style.left = `${pos.x}px`;
        widget.style.top = `${pos.y}px`;
        const panel = widget.querySelector(`#${TRACKER_WIDGET_PANEL_ID}`);
        if (panel && !panel.hidden) positionTrackerWidgetPanel(widget, panel);
    });
    button?.addEventListener('pointerup', event => {
        if (!drag) return;
        button.releasePointerCapture?.(event.pointerId);
        widget.classList.remove('spe-tracker-dragging');
        const settings = getSettings();
        const rect = widget.getBoundingClientRect();
        const pos = clampTrackerWidgetPosition(rect.left, rect.top);
        settings.trackerWidgetX = pos.x;
        settings.trackerWidgetY = pos.y;
        if (!drag.moved) settings.trackerWidgetCollapsed = settings.trackerWidgetCollapsed === false;
        drag = null;
        saveExtensionSettings();
        renderTrackerWidget();
    });
    button?.addEventListener('pointercancel', () => {
        drag = null;
        widget.classList.remove('spe-tracker-dragging');
    });
    close?.addEventListener('click', event => {
        event.preventDefault();
        const settings = getSettings();
        settings.trackerWidgetCollapsed = true;
        saveExtensionSettings();
        renderTrackerWidget();
    });
}

function clampTrackerWidgetPosition(x, y) {
    const rawX = Number(x);
    const rawY = Number(y);
    const maxX = Math.max(0, (globalThis.innerWidth || 1200) - 62);
    const maxY = Math.max(0, (globalThis.innerHeight || 800) - 62);
    return {
        x: Math.max(8, Math.min(Number.isFinite(rawX) ? rawX : 24, maxX)),
        y: Math.max(8, Math.min(Number.isFinite(rawY) ? rawY : 120, maxY)),
    };
}

function positionTrackerWidgetPanel(widget, panel) {
    if (!widget || !panel || panel.hidden) return;
    const gap = 8;
    const viewportWidth = globalThis.innerWidth || 1200;
    const viewportHeight = globalThis.innerHeight || 800;
    const button = widget.querySelector(`#${TRACKER_WIDGET_BUTTON_ID}`) || widget;
    const buttonRect = button.getBoundingClientRect();

    panel.style.left = '0px';
    panel.style.top = '0px';
    panel.style.right = 'auto';
    panel.style.bottom = 'auto';

    const panelRect = panel.getBoundingClientRect();
    const opensLeft = buttonRect.left + buttonRect.width / 2 > viewportWidth / 2;
    const opensUp = buttonRect.top + buttonRect.height / 2 > viewportHeight / 2;
    const panelWidth = Math.min(panelRect.width || 420, Math.max(180, viewportWidth - 16));
    const panelHeight = Math.min(panelRect.height || 360, Math.max(160, viewportHeight - 16));
    const left = opensLeft
        ? buttonRect.right - panelWidth
        : buttonRect.left;
    const top = opensUp
        ? buttonRect.top - panelHeight - gap
        : buttonRect.bottom + gap;

    panel.style.left = `${Math.round(Math.max(8, Math.min(left, viewportWidth - panelWidth - 8)))}px`;
    panel.style.top = `${Math.round(Math.max(8, Math.min(top, viewportHeight - panelHeight - 8)))}px`;
}

function ensurePlayerSetupStyles() {
    if (document.getElementById(PLAYER_SETUP_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PLAYER_SETUP_STYLE_ID;
    style.textContent = `
        #${PLAYER_SETUP_CARD_ID} {
            margin: 0.75rem auto;
            padding: 0.85rem;
            width: min(760px, calc(100% - 1.2rem));
            border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.18));
            border-radius: 8px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 34%, transparent);
            box-shadow: 0 10px 26px rgba(0,0,0,0.22);
            line-height: 1.45;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-title {
            font-weight: 700;
            font-size: 1rem;
            margin-bottom: 0.35rem;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-muted {
            opacity: 0.78;
            font-size: 0.9rem;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-row,
        #${PLAYER_SETUP_CARD_ID} .spe-player-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 0.45rem;
            align-items: center;
            margin-top: 0.55rem;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0.45rem;
            margin-top: 0.6rem;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-stat {
            border-left: 2px solid var(--SmartThemeQuoteColor, rgba(255,255,255,0.28));
            padding: 0.45rem 0.55rem;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 18%, transparent);
            border-radius: 6px;
        }
        #${PLAYER_SETUP_CARD_ID} textarea,
        #${PLAYER_SETUP_CARD_ID} input,
        #${PLAYER_SETUP_CARD_ID} select {
            width: 100%;
        }
        #${PLAYER_SETUP_CARD_ID} textarea {
            min-height: 5.5rem;
            resize: vertical;
        }
        #${PLAYER_SETUP_CARD_ID} pre {
            white-space: pre-wrap;
            max-height: 26rem;
            overflow: auto;
            padding: 0.65rem;
            border-radius: 6px;
            background: rgba(0,0,0,0.24);
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-error {
            margin-top: 0.55rem;
            color: var(--SmartThemeQuoteColor, #ffb4b4);
            font-weight: 600;
        }
        @media (max-width: 520px) {
            #${PLAYER_SETUP_CARD_ID} .spe-player-grid {
                grid-template-columns: 1fr;
            }
        }
    `;
    document.head.append(style);
}

function renderPlayerSetupCard(context = getContext()) {
    if (typeof document === 'undefined') return;
    const existing = document.getElementById(PLAYER_SETUP_CARD_ID);
    if (!playerSetupNeeded(context)) {
        existing?.remove();
        return;
    }

    ensurePlayerSetupStyles();
    const chat = document.getElementById('chat') || document.querySelector('#chat_container') || document.body;
    if (!chat) return;

    const root = getPlayerRoot(context);
    const card = existing || document.createElement('div');
    card.id = PLAYER_SETUP_CARD_ID;
    card.innerHTML = buildPlayerSetupCardHtml(root);
    if (!existing) {
        chat.append(card);
    }
    bindPlayerSetupCardEvents(card, context);
}

function buildPlayerSetupCardHtml(root) {
    const creator = root?.creator || { stage: 'offer' };
    const stage = creator.stage || 'offer';
    const busy = state.playerSetupBusy;
    const error = creator.error ? `<div class="spe-player-error">${escapeHtml(creator.error)}</div>` : '';
    const busyLine = busy ? '<div class="spe-player-muted">Working...</div>' : '';
    const body = stage === 'reroll'
        ? buildPlayerRerollHtml(creator)
        : stage === 'swap'
            ? buildPlayerSwapHtml(creator)
            : stage === 'identity'
                ? buildPlayerIdentityHtml(creator)
                : stage === 'review'
                    ? buildPlayerReviewHtml(creator)
                    : stage === 'persona-sheet'
                        ? buildPlayerPersonaSheetHtml(creator)
                    : buildPlayerOfferHtml();

    return `
        <div class="spe-player-title">Player Setup</div>
        <div class="spe-player-muted">This chat has no valid PHY/MND/CHA player stats yet. Complete setup once, then the creator stays out of the way for this story.</div>
        ${busyLine}
        ${body}
        ${error}
    `;
}

function buildPlayerOfferHtml() {
    const hasPersona = Boolean(getPersonaText(getContext()));
    return `
        <div class="spe-player-actions">
            <button class="menu_button" data-spe-player-action="start-new">Create Character</button>
            <button class="menu_button" data-spe-player-action="use-persona" ${hasPersona ? '' : 'disabled'}>Use Existing Persona</button>
            <button class="menu_button" data-spe-player-action="skip-chat">Disable For This Chat</button>
        </div>
        <div class="spe-player-muted">Create rolls a new character. Use Existing Persona only asks the model which stat should be highest; the extension still rolls the actual values.</div>
    `;
}

function buildStatsGridHtml(creator) {
    const stats = normalizeCoreStats(creator.stats || {});
    const pools = creator.statPools || {};
    return `
        <div class="spe-player-grid">
            ${PLAYER_STATS.map(stat => {
                const pair = Array.isArray(pools[stat]) ? pools[stat].join(', ') : '-';
                return `<div class="spe-player-stat"><b>${stat}</b><br><code>${stats[stat]}</code><br><span class="spe-player-muted">rolls: ${escapeHtml(pair)}</span></div>`;
            }).join('')}
        </div>
    `;
}

function buildPlayerRerollHtml(creator) {
    const analysis = creator.flow === 'persona' && creator.personaAnalysis
        ? `<div class="spe-player-muted">Persona read: highest stat should be <code>${escapeHtml(creator.personaAnalysis.PrimaryStat || 'PHY')}</code>. ${escapeHtml(creator.personaAnalysis.Evidence || '')}</div>`
        : '';
    return `
        ${analysis}
        ${buildStatsGridHtml(creator)}
        <div class="spe-player-muted">Optional reroll: choose one stat. The hidden 1d10 reroll is compared against the current value and the higher value is kept.</div>
        <div class="spe-player-actions">
            ${PLAYER_STATS.map(stat => `<button class="menu_button" data-spe-player-action="reroll" data-stat="${stat}">Reroll ${stat}</button>`).join('')}
            <button class="menu_button" data-spe-player-action="skip-reroll">Keep These</button>
        </div>
    `;
}

function buildPlayerSwapHtml(creator) {
    const rerollLine = creator.rerollApplied
        ? `<div class="spe-player-muted">Reroll used on <code>${escapeHtml(creator.rerollApplied.stat)}</code>: hidden roll <code>${escapeHtml(creator.rerollApplied.roll)}</code>, kept <code>${escapeHtml(creator.rerollApplied.value)}</code>.</div>`
        : '<div class="spe-player-muted">No reroll used.</div>';
    return `
        ${buildStatsGridHtml(creator)}
        ${rerollLine}
        <div class="spe-player-row">
            <label class="flex1">First stat
                <select id="spe_player_swap_a" class="text_pole">${PLAYER_STATS.map(stat => `<option value="${stat}">${stat}</option>`).join('')}</select>
            </label>
            <label class="flex1">Second stat
                <select id="spe_player_swap_b" class="text_pole">${PLAYER_STATS.map(stat => `<option value="${stat}" ${stat === 'MND' ? 'selected' : ''}>${stat}</option>`).join('')}</select>
            </label>
        </div>
        <div class="spe-player-actions">
            <button class="menu_button" data-spe-player-action="apply-swap">Swap Selected</button>
            <button class="menu_button" data-spe-player-action="skip-swap">No Swap</button>
        </div>
    `;
}

function buildPlayerIdentityHtml(creator) {
    const identity = creator.identity || {};
    const raceMode = identity.raceMode || 'random';
    return `
        ${buildStatsGridHtml(creator)}
        <div class="spe-player-row">
            <label class="flex1">Race
                <select id="spe_player_race_mode" class="text_pole">
                    <option value="random" ${raceMode === 'random' ? 'selected' : ''}>Random</option>
                    <option value="pick" ${raceMode === 'pick' ? 'selected' : ''}>Pick From List</option>
                    <option value="specify" ${raceMode === 'specify' ? 'selected' : ''}>Specify</option>
                </select>
            </label>
            <label class="flex1">Pick
                <select id="spe_player_race_pick" class="text_pole">
                    ${PLAYER_RACE_CHOICES.filter(race => race !== 'Random').map(race => `<option value="${escapeHtml(race)}" ${identity.pickedRace === race ? 'selected' : ''}>${escapeHtml(race)}</option>`).join('')}
                </select>
            </label>
        </div>
        <div class="spe-player-row">
            <label class="flex1">Specify race or ancestry
                <input id="spe_player_race_specify" class="text_pole" value="${escapeHtml(identity.specifiedRace || '')}" placeholder="Optional">
            </label>
        </div>
        <div class="spe-player-row">
            <label class="flex1">Specified race details
                <select id="spe_player_race_description_mode" class="text_pole">
                    <option value="system" ${(identity.specifiedRaceDescriptionMode || 'system') === 'system' ? 'selected' : ''}>Let system describe it</option>
                    <option value="user" ${identity.specifiedRaceDescriptionMode === 'user' ? 'selected' : ''}>Describe it myself</option>
                </select>
            </label>
        </div>
        <div class="spe-player-row">
            <label class="flex1">Your race description
                <textarea id="spe_player_race_description" class="text_pole" placeholder="Optional unless you choose Describe it myself.">${escapeHtml(identity.specifiedRaceDescription || '')}</textarea>
            </label>
        </div>
        <div class="spe-player-row">
            <label class="flex1">Appearance notes
                <textarea id="spe_player_appearance" class="text_pole" placeholder="Optional. Leave blank for model-generated appearance.">${escapeHtml(identity.appearance || '')}</textarea>
            </label>
        </div>
        <div class="spe-player-actions">
            <button class="menu_button" data-spe-player-action="generate-sheet">Generate Character Sheet</button>
            <button class="menu_button" data-spe-player-action="back-to-swap">Back</button>
        </div>
    `;
}

function buildPlayerReviewHtml(creator) {
    const retry = '<button class="menu_button" data-spe-player-action="retry-sheet">Retry Details</button>';
    return `
        <div class="spe-player-muted">Review the sheet below. Approve inserts it into the active SillyTavern persona field and locks setup for this chat.</div>
        <pre>${escapeHtml(creator.sheetText || buildPersonaStatsSheet(creator))}</pre>
        <div class="spe-player-actions">
            <button class="menu_button" data-spe-player-action="approve-sheet">Approve And Insert Into Persona</button>
            ${retry}
            <button class="menu_button" data-spe-player-action="back-to-identity">Back</button>
        </div>
    `;
}

function buildPlayerPersonaSheetHtml(creator) {
    const analysis = creator.personaAnalysis || {};
    return `
        ${buildStatsGridHtml(creator)}
        <div class="spe-player-muted">Existing persona conversion: highest-stat reading <code>${escapeHtml(analysis.PrimaryStat || 'PHY')}</code>. The model will reformat the current persona into the character-sheet template and copy the locked stats exactly.</div>
        <div class="spe-player-actions">
            <button class="menu_button" data-spe-player-action="generate-persona-sheet">Generate Persona Sheet</button>
            <button class="menu_button" data-spe-player-action="back-to-swap">Back</button>
        </div>
    `;
}

function bindPlayerSetupCardEvents(card, context = getContext()) {
    if (!card) return;
    const runButtonAction = async button => {
        if (!button || state.playerSetupBusy) return;
        const action = button.getAttribute('data-spe-player-action');
        const stat = button.getAttribute('data-stat');
        await handlePlayerSetupAction(action, { stat, card }, getContext() || context);
    };
    card.querySelectorAll('[data-spe-player-action]').forEach(button => {
        button.onclick = async event => {
            event.preventDefault();
            event.stopPropagation();
            await runButtonAction(button);
        };
    });
    card.onclick = async event => {
        const button = event.target?.closest?.('[data-spe-player-action]');
        if (!button || !card.contains(button)) return;
        event.preventDefault();
        event.stopPropagation();
        await runButtonAction(button);
    };
}

async function handlePlayerSetupAction(action, details = {}, context = getContext()) {
    if (state.playerSetupBusy) return;
    const root = getPlayerRoot(context);
    if (!root) return;
    root.creator = root.creator || { stage: 'offer' };
    delete root.creator.error;

    try {
        if (action === 'start-new') {
            root.creator = buildNewCharacterRollState();
        } else if (action === 'use-persona') {
            state.playerSetupBusy = true;
            renderPlayerSetupCard(context);
            const analysis = await analyzePersonaForPrimaryStat(context);
            root.creator = buildPersonaRollState(analysis);
        } else if (action === 'skip-chat') {
            root.disabled = true;
            root.forceCreator = false;
        } else if (action === 'reroll') {
            applyPlayerReroll(root.creator, details.stat);
        } else if (action === 'skip-reroll') {
            root.creator.rerollSkipped = true;
            root.creator.stage = 'swap';
        } else if (action === 'apply-swap') {
            const a = document.getElementById('spe_player_swap_a')?.value;
            const b = document.getElementById('spe_player_swap_b')?.value;
            applyPlayerSwap(root.creator, a, b);
        } else if (action === 'skip-swap') {
            root.creator.swapApplied = null;
            advanceAfterSwap(root.creator);
        } else if (action === 'back-to-swap') {
            root.creator.stage = 'swap';
        } else if (action === 'generate-persona-sheet') {
            state.playerSetupBusy = true;
            renderPlayerSetupCard(context);
            root.creator.sheetText = await generateExistingPersonaCharacterSheet(root.creator, context);
            root.creator.stage = 'review';
        } else if (action === 'generate-sheet') {
            syncIdentityInputs(root.creator);
            state.playerSetupBusy = true;
            renderPlayerSetupCard(context);
            root.creator.sheetText = await generateNewPlayerCharacterSheet(root.creator, context);
            root.creator.stage = 'review';
        } else if (action === 'retry-sheet') {
            state.playerSetupBusy = true;
            renderPlayerSetupCard(context);
            root.creator.sheetText = root.creator.flow === 'persona'
                ? await generateExistingPersonaCharacterSheet(root.creator, context)
                : await generateNewPlayerCharacterSheet(root.creator, context);
            root.creator.stage = 'review';
        } else if (action === 'back-to-identity') {
            root.creator.stage = root.creator.flow === 'new' ? 'identity' : 'swap';
        } else if (action === 'approve-sheet') {
            await approvePlayerSheet(root, context);
        }
        await persistMetadata(context);
    } catch (error) {
        root.creator.error = error instanceof Error ? error.message : String(error);
        console.error(`[${EXTENSION_NAME}] player setup action failed`, error);
        await persistMetadata(context);
    } finally {
        state.playerSetupBusy = false;
        renderPlayerSetupCard(context);
        refreshSettingsControls();
    }
}

function applyPlayerReroll(creator, stat) {
    if (!PLAYER_STATS.includes(stat)) throw new Error('Choose a valid stat to reroll.');
    const current = normalizeCoreStats(creator.stats || {})[stat];
    const roll = clampNumber(creator.rerollValue, 1, 10, rollD10());
    const value = Math.max(current, roll);
    creator.stats = { ...normalizeCoreStats(creator.stats || {}), [stat]: value };
    creator.rerollApplied = { stat, roll, previous: current, value };
    creator.stage = 'swap';
}

function applyPlayerSwap(creator, statA, statB) {
    if (!PLAYER_STATS.includes(statA) || !PLAYER_STATS.includes(statB) || statA === statB) {
        throw new Error('Choose two different stats to swap.');
    }
    const stats = normalizeCoreStats(creator.stats || {});
    [stats[statA], stats[statB]] = [stats[statB], stats[statA]];
    creator.stats = stats;
    creator.swapApplied = { from: statA, to: statB };
    advanceAfterSwap(creator);
}

function advanceAfterSwap(creator) {
    if (creator.flow === 'persona') {
        creator.sheetText = '';
        creator.stage = 'persona-sheet';
    } else {
        creator.stage = 'identity';
    }
}

function syncIdentityInputs(creator) {
    creator.identity = creator.identity || {};
    creator.identity.raceMode = document.getElementById('spe_player_race_mode')?.value || creator.identity.raceMode || 'random';
    creator.identity.pickedRace = document.getElementById('spe_player_race_pick')?.value || creator.identity.pickedRace || 'Human';
    creator.identity.specifiedRace = String(document.getElementById('spe_player_race_specify')?.value || creator.identity.specifiedRace || '').trim();
    creator.identity.specifiedRaceDescriptionMode = document.getElementById('spe_player_race_description_mode')?.value || creator.identity.specifiedRaceDescriptionMode || 'system';
    creator.identity.specifiedRaceDescription = String(document.getElementById('spe_player_race_description')?.value || creator.identity.specifiedRaceDescription || '').trim();
    creator.identity.appearance = String(document.getElementById('spe_player_appearance')?.value || creator.identity.appearance || '').trim();
}

async function approvePlayerSheet(root, context = getContext()) {
    const creator = root.creator || {};
    const sheetText = String(creator.sheetText || buildPersonaStatsSheet(creator)).trim();
    if (!isValidCoreStats(creator.stats)) {
        throw new Error('Cannot approve player setup because the stat block is invalid.');
    }
    const personaWrite = await writePlayerSheetToPersona(sheetText, context);
    root.ready = true;
    root.disabled = false;
    root.forceCreator = false;
    root.stats = normalizeCoreStats(creator.stats);
    root.personaBeforeSetup = root.personaBeforeSetup || personaWrite.previous || '';
    root.sheet = {
        text: sheetText,
        source: creator.flow === 'persona' ? 'existing_persona_conversion' : 'generated_character',
        approvedAt: Date.now(),
    };
    const trackerRoot = getTrackerRoot(context);
    if (trackerRoot && !normalizeTrackerUserState(trackerRoot.user || {}).gear.length && !normalizeTrackerUserState(trackerRoot.user || {}).inventory.length) {
        trackerRoot.personaInventorySeeded = null;
        seedPlayerTrackerFromPersonaIfEmpty(trackerRoot, context);
    }
    root.creator = { stage: 'approved' };
    globalThis.toastr?.success?.('Player sheet inserted into the active persona.', EXTENSION_NAME, { timeOut: 6000 });
}

function buildPersonaStatsSheet(creator) {
    const stats = normalizeCoreStats(creator.stats || {});
    const analysis = creator.personaAnalysis || {};
    return [
        '## CHARACTER SHEET',
        '',
        '# STATS',
        `PHY: ${stats.PHY}`,
        `MND: ${stats.MND}`,
        `CHA: ${stats.CHA}`,
        '',
        '# NOTES',
        'Stats were generated by Story Engine from the existing persona.',
        `Highest-stat reading: ${analysis.PrimaryStat || 'PHY'}.`,
        analysis.Evidence ? `Evidence: ${analysis.Evidence}` : '',
    ].filter(line => line !== '').join('\n');
}

async function analyzePersonaForPrimaryStat(context = getContext()) {
    const persona = getPersonaText(context);
    if (!persona) {
        throw new Error('The active persona has no description to analyze.');
    }
    const prompt = [
        {
            role: 'system',
            content:
                'You classify a SillyTavern user persona for a deterministic RPG extension. ' +
                'Do not assign numbers. Do not roll. Choose only which stat should receive the highest rolled value. ' +
                'PHY means physical force, agility, endurance, stealth movement, combat skill, or bodily execution. ' +
                'MND means thought, knowledge, perception, focus, will, magic, or deliberate mental/supernatural exertion. ' +
                'CHA means persuasion, deception, intimidation, negotiation, emotional influence, presence, or interpersonal skill.',
        },
        {
            role: 'user',
            content:
                'Return only this compact block. No markdown, no prose before or after it.\n' +
                'BEGIN_PLAYER_PERSONA_ANALYSIS\n' +
                'PrimaryStat=PHY|MND|CHA\n' +
                'Evidence=one short sentence from explicit persona facts\n' +
                'Race=explicit race/species or unknown\n' +
                'UserNonHuman=Y|N|unknown\n' +
                'END_PLAYER_PERSONA_ANALYSIS\n\n' +
                `PERSONA:\n${clipText(persona, 6000)}`,
        },
    ];
    const raw = await requestPlayerSetupText(prompt, PLAYER_SETUP_ANALYSIS_RESPONSE_LENGTH, {
        temperature: 0.1,
        stop: ['END_PLAYER_PERSONA_ANALYSIS'],
        stopping_strings: ['END_PLAYER_PERSONA_ANALYSIS'],
        stop_sequence: ['END_PLAYER_PERSONA_ANALYSIS'],
    });
    return parsePersonaAnalysis(raw);
}

function parsePersonaAnalysis(raw) {
    const text = extractGeneratedText(raw);
    const fields = {};
    for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z]+)\s*=\s*(.*?)\s*$/);
        if (match) fields[match[1]] = match[2];
    }
    const primary = String(fields.PrimaryStat || '').trim().toUpperCase();
    if (!PLAYER_STATS.includes(primary)) {
        throw new Error(`Persona analysis did not return a valid PrimaryStat. Raw response: ${previewPlayerSetupRaw(raw, text)}`);
    }
    return {
        PrimaryStat: primary,
        Evidence: String(fields.Evidence || '').trim(),
        Race: String(fields.Race || 'unknown').trim(),
        UserNonHuman: String(fields.UserNonHuman || 'unknown').trim(),
    };
}

async function generateNewPlayerCharacterSheet(creator, context = getContext()) {
    const stats = normalizeCoreStats(creator.stats || {});
    const identity = creator.identity || {};
    const raceInstruction = buildNewCharacterRaceInstruction(identity);
    const appearanceInstruction = identity.appearance
        ? `Use these user appearance notes as hard constraints: ${identity.appearance}.`
        : 'Generate a fitting appearance from the chosen race and concept.';
    const prompt = [
        {
            role: 'system',
            content:
                'You generate a SillyTavern user persona character sheet for a fantasy roleplay. ' +
                'The numeric stats are locked and must be copied exactly. Do not reroll, rebalance, or assign new numbers. ' +
                'Generate flavorful but grounded details. Avoid overpowered abilities. Keep inventory appropriate to the character and setting.',
        },
        {
            role: 'user',
            content:
                'Return only the finished character sheet in markdown. No preface and no questions.\n\n' +
                `LOCKED STATS:\nPHY: ${stats.PHY}\nMND: ${stats.MND}\nCHA: ${stats.CHA}\n\n` +
                `${raceInstruction}\n${appearanceInstruction}\n\n` +
                'Required sections:\n' +
                '# BASIC INFO: Name, Race, Bloodline if relevant, UserNonHuman Y/N, Gender, Age, and a brief identity note if relevant.\n' +
                '# APPEARANCE: height, build, hair, eyes, skin, distinctive traits, voice.\n' +
                '# STATS: PHY, MND, CHA copied exactly.\n' +
                '# RACIAL TRAITS (ALWAYS ACTIVE): exactly two passive traits that enhance existing human faculties; do not add impossible new senses or active powers.\n' +
                '# ABILITIES (REQUIRE ACTIVATION): exactly two activated abilities. Each ability must clearly come from the chosen race, ancestry, physiology, passive traits, or stated character concept. Do not invent unrelated powers. Keep them useful, character-defining, and not overpowered.\n' +
                '# INVENTORY: setting-appropriate gear, no currency amount unless requested, no weapon unless justified by background.\n' +
                '# NOTES: concise character notes, limits, background hooks, secrecy rules, or fighting style if relevant.',
        },
    ];
    return sanitizeGeneratedSheet(await requestPlayerSetupText(prompt, PLAYER_SETUP_SHEET_RESPONSE_LENGTH, {
        temperature: 0.7,
    }));
}

function buildNewCharacterRaceInstruction(identity = {}) {
    if (identity.raceMode === 'specify') {
        const raceName = String(identity.specifiedRace || '').trim();
        if (!raceName) {
            throw new Error('Specify mode needs a race or ancestry name.');
        }

        if (identity.specifiedRaceDescriptionMode === 'user') {
            const description = String(identity.specifiedRaceDescription || '').trim();
            if (!description) {
                throw new Error('Describe it myself needs a race description.');
            }
            return [
                `Use this race/ancestry name exactly: ${raceName}.`,
                'The user-described race details below are locked canon. Preserve their meaning exactly.',
                'Do not replace, reinterpret, soften, intensify, or invent over them. You may organize them into the character sheet and fill only truly missing minor presentation details when needed.',
                `LOCKED USER RACE DESCRIPTION:\n${description}`,
            ].join('\n');
        }

        return [
            `Use this race/ancestry name exactly: ${raceName}.`,
            'The user provided the name only. Invent a fitting, playable race description for that name, including appearance implications and passive racial flavor.',
            'Keep it useful for roleplay and avoid making the character automatically overpowered.',
        ].join('\n');
    }

    if (identity.raceMode === 'pick') {
        return `Use this race/ancestry: ${identity.pickedRace || 'Human'}.`;
    }

    return 'Randomly choose a fantasy humanoid, demi-human, monster-humanoid, undead, construct, spirit-touched, or hybrid race. Keep the result playable as {{user}} unless the chosen race explicitly demands otherwise.';
}

async function generateExistingPersonaCharacterSheet(creator, context = getContext()) {
    const stats = normalizeCoreStats(creator.stats || {});
    const persona = getPersonaText(context);
    if (!persona) {
        throw new Error('The active persona has no description to convert.');
    }
    const analysis = creator.personaAnalysis || {};
    const prompt = [
        {
            role: 'system',
            content:
                'You convert an existing SillyTavern user persona into a clean character sheet for fantasy roleplay. ' +
                'Preserve explicit persona facts exactly in meaning. Do not rewrite the character, add new biography, invent missing facts, or contradict the persona. ' +
                'You may rearrange and label information for formatting only. Copy factual wording where practical. Do not embellish, interpret, strengthen, weaken, or replace any detail. If a required field is not stated, write "Not specified". ' +
                'The only new information you may insert is the locked stat block. Do not reroll, rebalance, or assign new numbers.',
        },
        {
            role: 'user',
            content:
                'Return only the finished character sheet in markdown. No preface and no questions.\n\n' +
                `LOCKED STATS:\nPHY: ${stats.PHY}\nMND: ${stats.MND}\nCHA: ${stats.CHA}\n\n` +
                `PERSONA PRIMARY STAT READING: ${analysis.PrimaryStat || 'PHY'}\n` +
                `EVIDENCE: ${analysis.Evidence || 'none'}\n` +
                `EXPLICIT RACE/SPECIES IF KNOWN: ${analysis.Race || 'unknown'}\n` +
                `USER NON-HUMAN IF KNOWN: ${analysis.UserNonHuman || 'unknown'}\n\n` +
                'Template requirements:\n' +
                '# BASIC INFO: Name, Race, Bloodline if relevant, UserNonHuman Y/N, Gender, Age, and origin/mind notes. Use explicit persona facts only; otherwise write Not specified.\n' +
                '# APPEARANCE: preserve explicit appearance facts only; otherwise write Not specified.\n' +
                '# STATS: PHY, MND, CHA copied exactly.\n' +
                '# RACIAL TRAITS (ALWAYS ACTIVE): preserve explicit passive traits only. If none are explicit, write Not specified.\n' +
                '# ABILITIES (REQUIRE ACTIVATION): preserve explicit active abilities only. If none are explicit, write Not specified.\n' +
                '# INVENTORY: preserve explicit gear/inventory only. If none is explicit, write Not specified.\n' +
                '# NOTES: preserve all important persona notes, origin facts, limits, fighting style, and secrecy rules.\n\n' +
                `EXISTING PERSONA:\n${clipText(persona, 9000)}`,
        },
    ];
    return sanitizeGeneratedSheet(await requestPlayerSetupText(prompt, PLAYER_SETUP_SHEET_RESPONSE_LENGTH, {
        temperature: 0.1,
    }));
}

function sanitizeGeneratedSheet(raw) {
    const text = extractGeneratedText(raw)
        .replace(/^```(?:markdown|md|text)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
    if (!text) throw new Error('Character sheet generation returned empty text.');
    return text;
}

function previewPlayerSetupRaw(raw, extractedText = '') {
    const text = String(extractedText || '').trim();
    if (text) return text.slice(0, 240);
    try {
        return JSON.stringify(raw, (_key, value) => typeof value === 'string' ? value.slice(0, 600) : value).slice(0, 600);
    } catch {
        return String(raw ?? '').slice(0, 600);
    }
}

async function requestPlayerSetupText(prompt, responseLength, overridePayload = {}) {
    const context = getContext();
    state.bypassPromptReady = true;
    try {
        return await withSemanticGenerationSettings(async settings => {
            if (settings?.semanticProfileId) {
                return await sendSemanticProfileTextRequest(prompt, responseLength, settings, overridePayload);
            }
            if (!context?.generateRawData) {
                throw new Error('SillyTavern generateRawData API is unavailable for player setup.');
            }
            const textPrompt = Array.isArray(prompt)
                ? prompt.map(message => `${String(message.role || 'user').toUpperCase()}:\n${String(message.content || '')}`).join('\n\n')
                : String(prompt || '');
            return await context.generateRawData({ prompt: textPrompt, responseLength });
        });
    } finally {
        state.bypassPromptReady = false;
    }
}

function clipText(value, maxLength) {
    const text = String(value ?? '').trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, maxLength)}\n[truncated]`;
}

function captureChatSignature(context = getContext()) {
    if (!Array.isArray(context?.chat)) return [];
    return context.chat.map(message => [
        message?.is_user ? 'user' : 'assistant',
        String(message?.name ?? ''),
        String(message?.send_date ?? ''),
        String(message?.mes ?? '').slice(0, 80),
    ].join('|'));
}

function getLatestUserText(chat) {
    if (!Array.isArray(chat)) return '';
    for (let index = chat.length - 1; index >= 0; index -= 1) {
        const message = chat[index];
        if (message?.role !== 'user') continue;
        if (typeof message.content === 'string') return message.content;
        if (Array.isArray(message.content)) {
            return message.content
                .map(part => typeof part === 'string' ? part : part?.text)
                .filter(Boolean)
                .join('\n');
        }
    }
    return '';
}

function getLatestUserTextFromContext(context = getContext()) {
    if (!Array.isArray(context?.chat)) return '';
    for (let index = context.chat.length - 1; index >= 0; index -= 1) {
        const message = context.chat[index];
        if (!message?.is_user && message?.role !== 'user') continue;
        const text = String(message?.mes ?? message?.content ?? '').trim();
        if (text) return text;
    }
    return '';
}

function detectStructuredUserInputMode(text) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return { mode: 'normal', innerText: '' };

    if (trimmed.length >= 6 && trimmed.startsWith('(((') && trimmed.endsWith(')))')) {
        return { mode: 'proxy', innerText: trimmed.slice(3, -3).trim() };
    }

    if (trimmed.length >= 4 && trimmed.startsWith('((') && trimmed.endsWith('))')) {
        return { mode: 'ooc', innerText: trimmed.slice(2, -2).trim() };
    }

    return { mode: 'normal', innerText: trimmed };
}

function clearPromptOptionPrompts(context = getContext()) {
    if (!context?.extensionPrompts) return;
    delete context.extensionPrompts[WRITING_STYLE_PROMPT_KEY];
    delete context.extensionPrompts[PROSE_RULES_PROMPT_KEY];
    delete context.extensionPrompts[FINAL_REMINDER_PROMPT_KEY];
    delete context.extensionPrompts[LEGACY_WRITING_STYLE_PROMPT_KEY];
    delete context.extensionPrompts[LEGACY_PROSE_RULES_PROMPT_KEY];
}

function buildOocResponsePrompt(userText) {
    const note = clipText(String(userText ?? ''), 2000);
    return [
        '[STRUCTURED_PREFLIGHT_OOC]',
        'The latest user message is out of character.',
        'Reply directly to the user as an assistant answer.',
        'Do not narrate the story, do not use scene mechanics, and do not update tracker state.',
        note ? `User message: ${note}` : '',
    ].filter(Boolean).join('\n');
}

function firstChangedIndex(before, after) {
    const max = Math.max(before?.length || 0, after?.length || 0);
    for (let index = 0; index < max; index += 1) {
        if ((before?.[index] ?? null) !== (after?.[index] ?? null)) return index;
    }
    return max;
}

function extractLegacyNarratorHandoff(text) {
    const source = String(text ?? '');
    const match = source.match(/<narrator_prompt_context_echo>\s*([\s\S]*?)\s*<\/narrator_prompt_context_echo>/i)
        || source.match(/&lt;narrator_prompt_context_echo&gt;\s*([\s\S]*?)\s*&lt;\/narrator_prompt_context_echo&gt;/i);
    return match?.[1]?.trim() || '';
}

function migrateVisibleHandoffDisplays(context = getContext()) {
    if (!Array.isArray(context?.chat)) return false;
    let changed = false;

    context.chat.forEach(message => {
        if (!message || message.is_user) return;
        message.extra = message.extra || {};
        const displayText = typeof message.extra.display_text === 'string' ? message.extra.display_text : '';
        const visibleText = displayText || String(message.mes ?? '');
        const legacyHandoff = extractLegacyNarratorHandoff(visibleText);
        if (legacyHandoff && !getMessageNarratorHandoff(message)) {
            setMessageNarratorHandoff(message, legacyHandoff);
            changed = true;
        }
        const cleanedDisplay = stripComputedDebugPrefix(displayText);
        if (displayText && cleanedDisplay !== displayText) {
            message.extra.display_text = cleanedDisplay;
            changed = true;
        }
        const cleanedMessage = stripComputedDebugPrefix(message.mes);
        if (typeof message.mes === 'string' && cleanedMessage !== message.mes) {
            message.mes = cleanedMessage;
            changed = true;
        }
    });

    if (changed) {
        persistMetadata(context);
        if (typeof context.saveChat === 'function') context.saveChat();
    }
    return changed;
}

function extractTrackerDeltaText(text) {
    const source = String(text ?? '');
    const fencedMatch = source.match(/```story_engine_tracker_delta\s*([\s\S]*?)```/i)
        || source.match(/```story_engine_tracker_delta\s*([\s\S]*?)(?=BEGIN_FINAL_NARRATION|$)/i);
    const wrapperMatch = fencedMatch
        || source.match(/<!--\s*STORY_ENGINE_TRACKER_DELTA([\s\S]*?)STORY_ENGINE_TRACKER_DELTA_END\s*-->/i)
        || source.match(/&lt;!--\s*STORY_ENGINE_TRACKER_DELTA([\s\S]*?)STORY_ENGINE_TRACKER_DELTA_END\s*--&gt;/i)
        || source.match(/<trackers>([\s\S]*?)<\/trackers>/i)
        || source.match(/&lt;trackers&gt;([\s\S]*?)&lt;\/trackers&gt;/i);
    const match = (wrapperMatch?.[1] || source).match(/BEGIN_TRACKER_DELTA[\s\S]*?END_TRACKER_DELTA/i);
    return match?.[0] || '';
}

function sanitizeFinalPromptHistory(chat) {
    if (!Array.isArray(chat)) return;

    for (let index = chat.length - 1; index >= 0; index -= 1) {
        const message = chat[index];
        if (!message) continue;

        if (typeof message.content === 'string') {
            message.content = stripStructuredArtifacts(message.content).trim();
            if (message.role === 'assistant') {
                message.content = stripNarratorMetaPrefix(message.content).trim();
            }
        } else if (Array.isArray(message.content)) {
            message.content = message.content
                .map(part => {
                    if (part && typeof part === 'object' && typeof part.text === 'string') {
                        const text = stripStructuredArtifacts(part.text).trim();
                        return {
                            ...part,
                            text: message.role === 'assistant' ? stripNarratorMetaPrefix(text).trim() : text,
                        };
                    }
                    return part;
                })
                .filter(part => {
                    if (part && typeof part === 'object' && 'text' in part) return Boolean(String(part.text ?? '').trim());
                    return part != null;
                });
        }

        if (isPromptContentEmpty(message.content)) {
            chat.splice(index, 1);
        }
    }
}

function isPromptContentEmpty(content) {
    if (content == null) return true;
    if (typeof content === 'string') return !content.trim();
    if (Array.isArray(content)) return content.length === 0;
    return false;
}

function restoreTrackerForRegeneration(type) {
    if (!['regenerate', 'swipe', 'continue'].includes(String(type))) return;

    const context = getContext();
    const root = getTrackerRoot(context);
    if (!root) return;

    const targetMessageId = Array.isArray(context?.chat) ? context.chat.length - 1 : null;
    const snapshot = targetMessageId == null ? null : root.snapshots?.[getMessageKey(targetMessageId, context)]?.before;
    if (snapshot) {
        const rapportClock = normalizeRapportClockState(root.rapportClock);
        root.npcs = normalizeDisplayTrackerNpcs(snapshot);
        root.user = normalizeTrackerUserState(root.snapshots?.[getMessageKey(targetMessageId, context)]?.beforeUser || root.user || {});
        root.rapportClock = rapportClock;
        root.snapshots[getMessageKey(targetMessageId, context)].restoredForRegeneration = Date.now();
        console.info(`[${EXTENSION_NAME}] restored tracker snapshot before ${type} of message ${targetMessageId}`);
    }

    state.lastNarratorHandoffKey = null;
    state.lastNarratorHandoff = '';
}

async function persistMetadata(context = getContext()) {
    if (typeof context?.saveMetadataDebounced === 'function') {
        context.saveMetadataDebounced();
    } else if (typeof context?.saveMetadata === 'function') {
        await context.saveMetadata();
    }
}

function buildProseGuardPrompt(narrationText) {
    return [
        'STORY_ENGINE_PROSE_GUARD',
        '',
        'You are PROSE_GUARD, a strict prose compliance editor.',
        '',
        'TASK:',
        'Edit TEXT_TO_CHECK only to remove prose-rule violations. Preserve the scene exactly.',
        'If no violations exist, return TEXT_TO_CHECK unchanged.',
        '',
        'DO NOT CHANGE:',
        '- Events, action order, success or failure, landed contact, injuries, death, condition, intimacy permission, refusal, consent boundary, names, dialogue meaning, user agency, NPC agency, tracked state, or mechanics.',
        '- Do not add new actions, remove valid actions, add reactions, add dialogue, reveal information, soften refusals, intensify intimacy, or reinterpret what happened.',
        '- Do not delete body detail. Replace invalid shorthand with valid concrete prose when needed.',
        '',
        'VIOLATION FAMILIES:',
        '1. Stock body-emotion shorthand:',
        'Ban blush, flush, cheeks heating, ears reddening, jaw tightening, jaw setting, jaw working, mouth firming, lips parting without consequence, throat bobbing, fingers twitching, knuckles whitening, breath hitching, breath catching, heart pounding, pulse jumping, stomach dropping, heat pooling, and equivalent workaround phrases.',
        '',
        '2. Skin-color shorthand:',
        'Do not use reddening, paling, whitening, darkening, flushing, or color changes as emotional, romantic, sexual, psychological, or physical-effort shorthand.',
        '',
        '3. Lazy voice shorthand:',
        'Ban trope phrases such as "barely above a whisper," "just above a whisper," "almost a whisper," "voice barely audible," "low murmur," "soft murmur," "a thread of sound," or equivalent canned quiet-voice phrasing. Low, quiet, shaking, hoarse, or trembling speech is allowed only when physically specific and not trope shorthand.',
        '',
        '4. Nonliteral prose:',
        'Ban metaphor, simile, idiom, hyperbole, ellipsis, poetic framing, personification, emotional physics, vibe adjectives, decorative sensual haze, sensory analogy phrasing, atmospheric filler, and "not X, but Y" contrast constructions.',
        '',
        '5. Unsupported emotion labels:',
        'Do not state feelings directly unless the text also shows consequential visible behavior.',
        '',
        'VALID REPLACEMENTS:',
        'Replace violations with concrete, consequential physical behavior: movement, spacing, contact, pressure, object handling, blocked access, retreat, approach, timing, speech choices, visible damage, posture that changes action, or environmental interaction.',
        'Do not replace a violation with another coded tell or workaround phrase.',
        '',
        'GOOD REPLACEMENT PATTERN:',
        'Invalid: "Her jaw tightened. She spoke barely above a whisper."',
        'Valid: "She set her hand against his wrist and pushed it away. Her voice dropped low enough that the words stayed between them."',
        '',
        'OUTPUT CONTRACT:',
        'Return only the corrected narration text. No labels, bullets, commentary, markdown fences, XML, JSON, analysis, or preamble.',
        '',
        '==TEXT_TO_CHECK==',
        narrationText || '(empty)',
        '',
        '==CORRECTED_TEXT==',
    ].join('\n');
}

function sanitizeProseGuardResponse(raw, fallbackText) {
    const extracted = extractGeneratedText(raw);
    const cleaned = sanitizeAssistantNarration(stripStructuredArtifacts(stripNarratorMetaPrefix(extracted))).trim();
    return cleaned || fallbackText;
}

async function requestProseGuardCorrection(narrationText) {
    const prompt = buildProseGuardPrompt(narrationText);
    const responseLength = Math.max(800, Math.min(3000, Math.ceil(String(narrationText || '').length / 3) + 500));
    state.bypassPromptReady = true;
    try {
        return await withProseGuardGenerationSettings(async settings => {
            if (settings?.semanticProfileId) {
                return await sendSemanticProfileTextRequest(prompt, responseLength, settings, {
                    temperature: 0,
                });
            }
            const context = getContext();
            if (!context?.generateRawData) {
                throw new Error('SillyTavern generateRawData API is unavailable for Prose Guard.');
            }
            return await context.generateRawData({ prompt, responseLength });
        });
    } finally {
        state.bypassPromptReady = false;
    }
}

function buildPostNarrationTrackerPrompt({ pendingRun, messageKey, narrationText, trackerDisplaySnapshot }) {
    const report = pendingRun?.report || {};
    const handoff = report?.finalNarrativeHandoff || {};
    const resolution = handoff.resolutionPacket || {};
    const previous = {
        user: pendingRun?.userBefore || {},
        npcs: pendingRun?.trackerBefore || {},
    };
    const mechanicalAfter = {
        user: pendingRun?.userAfter || {},
        npcs: pendingRun?.trackerAfter || {},
    };
    const activeNpcNames = [...getActiveDisplayNpcNamesFromReport(trackerDisplaySnapshot?.npcs || {}, report)];
    const authority = {
        messageKey,
        latestUserText: pendingRun?.latestUserText || '',
        resolution: {
            goal: resolution.GOAL,
            outcome: resolution.Outcome,
            outcomeTier: resolution.OutcomeTier,
            landedActions: resolution.LandedActions,
            nonLethal: resolution.nonLethal,
            actionTargets: resolution.ActionTargets,
            oppTargets: resolution.OppTargets,
            npcInScene: resolution.NPCInScene,
            inflictedInjuries: resolution.InflictedInjuries,
        },
        npcHandoffs: handoff.npcHandoffs || [],
        proactivityResults: handoff.proactivityResults || {},
        aggressionResults: handoff.aggressionResults || {},
        contextualInjuryCaps: pendingRun?.contextualInjuryCaps || [],
        nameGeneration: handoff.nameGeneration || {},
        activeNpcNames,
    };
    const firstContactPersonalitySeeds = (handoff.npcHandoffs || [])
        .filter(npc => {
            const name = String(npc?.NPC || '').trim();
            if (!name || !trackerDisplaySnapshot?.npcs?.[name]) return false;
            return !cleanPersonalitySummary(previous.npcs?.[name]?.personalitySummary)
                && cleanPersonalitySummary(trackerDisplaySnapshot.npcs[name]?.personalitySummary);
        })
        .map(npc => ({
            NPC: npc.NPC,
            currentPersonalitySummary: trackerDisplaySnapshot.npcs[npc.NPC]?.personalitySummary || '',
            behavior: npc.Behavior || '',
            relationState: npc.FinalState || '',
        }));

    return [
        'STORY_ENGINE_POST_NARRATION_TRACKER_UPDATE',
        '',
        'You update tracker state only. Do not narrate, roleplay, explain, or add prose.',
        'Return exactly one story_engine_tracker_delta fenced block and nothing else.',
        '',
        '==TRACKER_CONTRACT==',
        TRACKER_DELTA_CONTRACT,
        'Use this exact shape:',
        TRACKER_DELTA_TEMPLATE,
        '',
        '==PREVIOUS_TRACKER_SNAPSHOT==',
        JSON.stringify(previous),
        '',
        '==MECHANICAL_TRACKER_AFTER==',
        JSON.stringify(mechanicalAfter),
        '',
        '==MECHANICAL_TRACKER_AUTHORITY==',
        JSON.stringify(authority),
        '',
        '==FIRST_CONTACT_PERSONALITY_SEEDS==',
        JSON.stringify(firstContactPersonalitySeeds),
        '',
        '==FINAL_NARRATION==',
        narrationText || '(empty)',
        '',
        '==OUTPUT==',
    ].join('\n');
}

async function requestPostNarrationTrackerDelta({ pendingRun, messageKey, narrationText, trackerDisplaySnapshot }) {
    const prompt = buildPostNarrationTrackerPrompt({ pendingRun, messageKey, narrationText, trackerDisplaySnapshot });
    const responseLength = 2400 + Math.min(4000, Object.keys(trackerDisplaySnapshot?.npcs || {}).length * 320);
    state.bypassPromptReady = true;
    try {
        return await withTrackerGenerationSettings(async settings => {
            if (settings?.semanticProfileId) {
                return await sendSemanticProfileTextRequest(prompt, responseLength, settings, {
                    temperature: 0,
                });
            }
            const context = getContext();
            if (!context?.generateRawData) {
                throw new Error('SillyTavern generateRawData API is unavailable for post-narration tracker update.');
            }
            return await context.generateRawData({ prompt, responseLength });
        });
    } finally {
        state.bypassPromptReady = false;
    }
}

async function prependComputedDebug(messageId, type) {
    const context = getContext();
    const messageKey = getMessageKey(messageId, context);

    if (!state.lastNarratorHandoff || state.lastNarratorHandoffKey === messageKey || type === 'impersonate') {
        clearRuntimePrompts();
        return;
    }

    const message = context?.chat?.[messageId];
    if (!message || message.is_user) {
        clearRuntimePrompts();
        return;
    }

    clearPendingRunCleanupTimer();
    setChatInputLocked(true, 'Finalizing narration...');
    const finalizingToast = showProgress('Finalizing narration...');

    try {
        message.extra = message.extra || {};

        const currentText = String(message.mes ?? '');
        const displayText = message.extra.display_text == null ? null : String(message.extra.display_text);
        const rawAssistantText = displayText ?? currentText;
        const visibleText = stripComputedDebugPrefix(rawAssistantText);
        let narrationText = sanitizeAssistantNarration(visibleText);
        const narratorHandoff = state.lastNarratorHandoff;
        const pendingRun = state.pendingRun;
        let trackerDeltaWarning = null;

        if (getSettings().postNarrationProseGuardEnabled !== false && narrationText) {
            try {
                const proseGuardRaw = await requestProseGuardCorrection(narrationText);
                narrationText = sanitizeProseGuardResponse(proseGuardRaw, narrationText);
            } catch (error) {
                console.warn(`[${EXTENSION_NAME}] Prose Guard failed; keeping sanitized narrator text.`, error);
            }
        }

        const root = getTrackerRoot(context);
        if (root && pendingRun) {
            let trackerDisplaySnapshot = buildDisplayTrackerSnapshot({
                messageKey,
                pendingRun,
                report: pendingRun.report,
                assistantText: narrationText,
            });

            if (getSettings().postNarrationTrackerEnabled !== false) {
                try {
                    const trackerRaw = await requestPostNarrationTrackerDelta({
                        pendingRun,
                        messageKey,
                        narrationText,
                        trackerDisplaySnapshot,
                    });
                    const trackerDeltaText = extractTrackerDeltaText(trackerRaw) || String(trackerRaw || '');
                    const postNarrationDelta = parseNarratorTrackerDelta(trackerDeltaText, narrationText);
                    const clampedTrackerDelta = applyContextualInjuryCapsToTrackerDelta(postNarrationDelta, pendingRun.contextualInjuryCaps);
                    trackerDisplaySnapshot = mergePostNarrationTrackerDelta(trackerDisplaySnapshot, clampedTrackerDelta, {
                        messageKey,
                        latestUserText: pendingRun.latestUserText,
                        assistantText: narrationText,
                    });
                } catch (error) {
                    trackerDeltaWarning = error instanceof Error ? error.message : String(error);
                    console.warn(`[${EXTENSION_NAME}] post-narration tracker update failed; keeping mechanical tracker snapshot.`, error);
                }
            } else {
                trackerDeltaWarning = 'Post-narration tracker update disabled by settings.';
            }

            await saveTrackerUpdate(context, buildTrackerUpdateForPersistence(trackerDisplaySnapshot), { save: false });
            root.snapshots[messageKey] = {
                before: clone(pendingRun.trackerBefore),
                beforeUser: clone(pendingRun.userBefore),
                after: clone(trackerDisplaySnapshot.npcs),
                afterUser: clone(trackerDisplaySnapshot.user),
                display: clone(trackerDisplaySnapshot),
                type: pendingRun.type,
                trackerDeltaWarning,
                savedAt: Date.now(),
            };
            setMessageTrackerDisplaySnapshot(message, trackerDisplaySnapshot);
            if (state.pendingRun === pendingRun) state.pendingRun = null;
        }

        message.mes = narrationText;
        message.extra.display_text = narrationText;
        setMessageNarratorHandoff(message, narratorHandoff);
        state.lastNarratorHandoffKey = messageKey;
        state.lastNarratorHandoff = '';

        if (typeof context.updateMessageBlock === 'function') {
            context.updateMessageBlock(messageId, message);
        }
        renderNarratorHandoffBlockForMessage(messageId, null, context);
        renderTrackerDisplayBlockForMessage(messageId, null, context);
        renderTrackerWidget(context);

        if (typeof context.saveChat === 'function') {
            await context.saveChat();
        } else {
            await persistMetadata(context);
        }

        clearRuntimePrompts();
        state.chatSignature = captureChatSignature(context);
    } finally {
        clearProgress(finalizingToast);
        setChatInputLocked(false);
    }
}

async function handleMessageDeleted(newLength) {
    const context = getContext();
    const root = getTrackerRoot(context);
    if (!root) return;

    const currentSignature = captureChatSignature(context);
    const firstAffectedIndex = firstChangedIndex(state.chatSignature, currentSignature);
    const chatLength = Number.isFinite(Number(newLength))
        ? Number(newLength)
        : Array.isArray(context?.chat) ? context.chat.length : 0;
    const chatId = getChatId(context);
    let restoreCandidate = null;

    for (const [key, snapshot] of Object.entries(root.snapshots || {})) {
        const [snapshotChatId, rawMessageId] = key.split(':');
        const messageId = Number(rawMessageId);
        if (snapshotChatId !== chatId) continue;
        if (Number.isFinite(messageId) && messageId >= Math.min(chatLength, firstAffectedIndex)) {
            if (snapshot?.before && (!restoreCandidate || messageId < restoreCandidate.messageId)) {
                restoreCandidate = { messageId, before: snapshot.before, beforeUser: snapshot.beforeUser };
            }
            delete root.snapshots[key];
        }
    }

    state.lastNarratorHandoff = '';
    state.lastNarratorHandoffKey = null;
    state.chatSignature = currentSignature;
    clearRuntimePrompts();

    if (restoreCandidate) {
        root.npcs = normalizeDisplayTrackerNpcs(restoreCandidate.before);
        root.user = normalizeTrackerUserState(restoreCandidate.beforeUser || root.user || {});
        await persistMetadata(context);
        console.info(`[${EXTENSION_NAME}] restored tracker snapshot after message deletion from index ${Math.min(chatLength, firstAffectedIndex)}`);
    } else if (restoreTrackerFromLatestDisplaySnapshot(context)) {
        await persistMetadata(context);
        console.info(`[${EXTENSION_NAME}] restored tracker display snapshot after message deletion.`);
    }
    setTimeout(() => renderAllTrackerDisplayBlocks(context), 0);
}

async function handleMessageSwiped(messageId) {
    const context = getContext();
    const resolvedMessageId = Number.isFinite(Number(messageId)) ? Number(messageId) : null;
    if (resolvedMessageId != null && restoreTrackerFromMessageDisplaySnapshot(resolvedMessageId, context)) {
        await persistMetadata(context);
    } else if (restoreTrackerFromLatestDisplaySnapshot(context)) {
        await persistMetadata(context);
    }
    state.lastNarratorHandoffKey = null;
    state.chatSignature = captureChatSignature();
    clearRuntimePrompts();
    setTimeout(() => renderAllTrackerDisplayBlocks(context), 0);
}

function handleChatChanged() {
    clearPendingRunCleanupTimer();
    clearAllProgress();
    setChatInputLocked(false);
    const context = getContext();
    injectPromptOptionPrompts();
    getPlayerRoot(context);
    restoreTrackerFromLatestDisplaySnapshot(context);
    migrateVisibleHandoffDisplays(context);
    state.lastNarratorHandoffKey = null;
    state.lastNarratorHandoff = '';
    state.pendingRun = null;
    state.chatSignature = captureChatSignature();
    clearRuntimePrompts();
    setTimeout(() => {
        renderAllTrackerDisplayBlocks(context);
        renderPlayerSetupCard(context);
    }, 0);
}

function handleGenerationLifecycleEnd() {
    if (state.trackerUpdating) return;
    clearAllProgress();
    state.pendingGeneration = null;
    clearRuntimePrompts();

    if (state.pendingRun && !state.pendingRunCleanupTimer) {
        const settings = getSettings();
        if (settings.postNarrationTrackerEnabled !== false || settings.postNarrationProseGuardEnabled !== false) {
            setChatInputLocked(true, 'Finalizing narration...');
        }
        state.pendingRunCleanupTimer = setTimeout(() => {
            state.pendingRunCleanupTimer = null;
            if (!state.pendingRun) return;
            state.pendingRun = null;
            state.lastNarratorHandoff = '';
            state.lastNarratorHandoffKey = null;
            setChatInputLocked(false);
            console.warn(`[${EXTENSION_NAME}] cleared pending pre-flight handoff because no assistant message was received after generation ended.`);
        }, 5000);
    }
    setTimeout(() => renderAllTrackerDisplayBlocks(), 0);
}

function subscribeMessageHandler() {
    if (state.subscribed) return;

    const context = getContext();
    if (!context?.eventSource?.on || !context?.eventTypes?.MESSAGE_RECEIVED) return;

    context.eventSource.on(context.eventTypes.MESSAGE_RECEIVED, prependComputedDebug);
    if (context.eventTypes.MESSAGE_DELETED) context.eventSource.on(context.eventTypes.MESSAGE_DELETED, handleMessageDeleted);
    if (context.eventTypes.MESSAGE_SWIPED) context.eventSource.on(context.eventTypes.MESSAGE_SWIPED, handleMessageSwiped);
    if (context.eventTypes.CHAT_CHANGED) context.eventSource.on(context.eventTypes.CHAT_CHANGED, handleChatChanged);
    if (context.eventTypes.CHAT_CREATED) context.eventSource.on(context.eventTypes.CHAT_CREATED, handleChatChanged);
    if (context.eventTypes.GENERATION_ENDED) context.eventSource.on(context.eventTypes.GENERATION_ENDED, handleGenerationLifecycleEnd);
    if (context.eventTypes.GENERATION_STOPPED) context.eventSource.on(context.eventTypes.GENERATION_STOPPED, handleGenerationLifecycleEnd);
    if (context.eventTypes.CHAT_COMPLETION_PROMPT_READY) context.eventSource.on(context.eventTypes.CHAT_COMPLETION_PROMPT_READY, handleChatCompletionPromptReady);
    state.subscribed = true;
}

globalThis.StructuredPreflightEngines_generationInterceptor = async function (coreChat, contextSize, abort, type) {
    subscribeMessageHandler();

    if (state.trackerUpdating) {
        try {
            globalThis.toastr?.info?.('Story Engine is updating the tracker. Please wait a moment before sending another message.', EXTENSION_NAME, { timeOut: 4000 });
        } catch {
            // Toasts are optional.
        }
        if (typeof abort === 'function') abort(true);
        return true;
    }

    if (state.runningSemanticPass) {
        const error = new Error('Structured preflight is already running. Generation aborted to avoid sending a narration without a valid audit.');
        showBlockingError(error);
        if (typeof abort === 'function') abort(true);
        return true;
    }

    const context = getContext();
    if (!context) {
        const error = new Error('SillyTavern context unavailable. Generation aborted before narration.');
        showBlockingError(error);
        if (typeof abort === 'function') abort(true);
        return true;
    }
    const latestUserText = getLatestUserTextFromContext(context);
    const userInputMode = detectStructuredUserInputMode(latestUserText);
    if (userInputMode.mode === 'ooc') {
        clearPromptOptionPrompts(context);
        clearRuntimePrompts();
        state.pendingGeneration = {
            type: type || 'normal',
            mode: 'ooc',
            rawUserText: latestUserText,
            latestUserText: userInputMode.innerText || latestUserText,
            createdAt: Date.now(),
        };
        state.activeRunId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
        showProgress('Handling out-of-character reply...');
        return false;
    }

    injectPromptOptionPrompts();

    if (playerSetupNeeded(context)) {
        const root = getPlayerRoot(context);
        root.creator = root.creator || { stage: 'offer' };
        await persistMetadata(context);
        renderPlayerSetupCard(context);
        clearRuntimePrompts();
        clearAllProgress();
        try {
            globalThis.toastr?.info?.('Complete Player Setup before roleplay generation can continue.', EXTENSION_NAME, { timeOut: 7000 });
        } catch {
            // Toasts are optional.
        }
        if (typeof abort === 'function') abort(true);
        return true;
    }

    state.chatSignature = captureChatSignature(context);
    restoreTrackerForRegeneration(type);
    getTrackerRoot(context);
    state.pendingGeneration = {
        type: type || 'normal',
        mode: userInputMode.mode === 'proxy' ? 'proxy' : 'normal',
        rawUserText: latestUserText,
        latestUserText: userInputMode.innerText || latestUserText,
        trackerSnapshot: buildTrackerSnapshot(context),
        playerTrackerSnapshot: buildPlayerTrackerSnapshot(context),
        contextSize,
        createdAt: Date.now(),
    };
    state.activeRunId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    showProgress('Computing structured pre-flight...');

    return false;
};

async function handleChatCompletionPromptReady(eventData) {
    if (state.bypassPromptReady || state.runningSemanticPass) return;
    if (!eventData || eventData.dryRun || !Array.isArray(eventData.chat)) return;
    if (!state.pendingGeneration) return;

    const context = getContext();
    if (!context) return;

    try {
        const generationMode = state.pendingGeneration.mode || 'normal';
        if (generationMode === 'ooc') {
            clearPromptOptionPrompts(context);
            clearRuntimePrompts();
            eventData.chat.push({
                role: 'system',
                content: buildOocResponsePrompt(state.pendingGeneration.latestUserText || getLatestUserText(eventData.chat)),
            });
            state.lastNarratorHandoff = '';
            state.pendingRun = null;
            clearAllProgress();
            return;
        }

        state.runningSemanticPass = true;
        const trackerSnapshot = state.pendingGeneration.trackerSnapshot || buildTrackerSnapshot(context);
        const semanticLedger = await runSemanticPassWithPromptReadyBypass(
            context,
            eventData.chat,
            state.pendingGeneration.type,
            trackerSnapshot,
        );
        applyPlayerCoreStatsOverride(semanticLedger, context);
        context.structuredPreflightSettings = getSettings();
        const report = runDeterministicEngines(semanticLedger, trackerSnapshot, context, state.pendingGeneration.type);

        const narratorContext = formatNarratorPromptContext(report, state.pendingGeneration);
        const narratorModelContext = formatNarratorModelPromptContext(report, state.pendingGeneration);
        state.pendingRun = {
            type: state.pendingGeneration.type || 'normal',
            mode: generationMode,
            trackerBefore: trackerSnapshot,
            trackerAfter: report.trackerUpdate?.npcs || {},
            userBefore: state.pendingGeneration.playerTrackerSnapshot || buildPlayerTrackerSnapshot(context),
            userAfter: report.trackerUpdate?.user || {},
            resolutionPacket: report.finalNarrativeHandoff?.resolutionPacket || {},
            userCoreStats: report.semanticLedger?.engineContext?.userCoreStats || null,
            contextualInjuryCaps: collectContextualInjuryCaps(report),
            latestUserText: state.pendingGeneration.latestUserText || getLatestUserText(eventData.chat),
            report,
        };
        state.lastNarratorHandoff = narratorContext;

        sanitizeFinalPromptHistory(eventData.chat);
        appendNarratorContextToPrompt(eventData.chat, narratorModelContext);
        clearAllProgress();
    } catch (error) {
        state.lastNarratorHandoff = '';
        state.pendingRun = null;
        clearAllProgress();
        clearRuntimePrompts();
        showBlockingError(error);
        abortGenerationAfterPromptReady(context);
        replacePromptWithAbortNotice(eventData.chat, error);
    } finally {
        state.runningSemanticPass = false;
        state.activeRunId = null;
        state.pendingGeneration = null;
    }
}

async function runSemanticPassWithPromptReadyBypass(context, assembledChat, type, trackerSnapshot) {
    state.bypassPromptReady = true;
    try {
        addEphemeralStoppingString(SEMANTIC_PREFLIGHT_STOP_SENTINEL);
        return await withSemanticGenerationSettings(settings => extractSemanticLedger(context, assembledChat, type, trackerSnapshot, {
            assembledPrompt: true,
            playerTrackerSnapshot: state.pendingGeneration?.playerTrackerSnapshot || buildPlayerTrackerSnapshot(context),
            disableSemanticThinking: settings?.disableSemanticThinking !== false,
            semanticProfileId: settings?.semanticProfileId,
            semanticProfileName: settings?.semanticProfileName,
            nameStyle: getSettings().nameStyle,
            userInputMode: state.pendingGeneration?.mode || 'normal',
            proxyUserAction: state.pendingGeneration?.mode === 'proxy' ? state.pendingGeneration?.latestUserText : '',
        }));
    } finally {
        flushEphemeralStoppingStrings();
        state.bypassPromptReady = false;
    }
}

function appendNarratorContextToPrompt(chat, narratorContext) {
    chat.push({
        role: 'system',
        content: buildFinalNarrationPrompt(narratorContext),
    });
}

function replacePromptWithAbortNotice(chat, error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    chat.splice(0, chat.length, {
        role: 'system',
        content:
            '[STRUCTURED_PREFLIGHT_ABORT]\n' +
            'The structured semantic preflight failed. Do not narrate. Return exactly: Structured preflight failed; generation aborted.\n' +
            `ERROR=${message}`,
    });
}

function abortGenerationAfterPromptReady(context) {
    try {
        if (typeof context?.stopGeneration === 'function') {
            context.stopGeneration();
        } else if (context?.eventSource?.emit && context?.eventTypes?.GENERATION_STOPPED) {
            context.eventSource.emit(context.eventTypes.GENERATION_STOPPED);
        }
    } catch {
        // The prompt is also replaced with an abort notice as a fallback.
    }
}

export function onDisable() {
    const context = getContext();
    clearAllProgress();
    setChatInputLocked(false);
    removeStreamingArtifactRegex();
    if (context?.extensionPrompts) {
        delete context.extensionPrompts[NARRATOR_PROMPT_KEY];
        delete context.extensionPrompts[WRITING_STYLE_PROMPT_KEY];
        delete context.extensionPrompts[PROSE_RULES_PROMPT_KEY];
        delete context.extensionPrompts[FINAL_REMINDER_PROMPT_KEY];
        delete context.extensionPrompts[LEGACY_WRITING_STYLE_PROMPT_KEY];
        delete context.extensionPrompts[LEGACY_PROSE_RULES_PROMPT_KEY];
    }
    if (state.subscribed && context?.eventSource && context?.eventTypes?.MESSAGE_RECEIVED) {
        removeEventHandler(context, context.eventTypes.MESSAGE_RECEIVED, prependComputedDebug);
        if (context.eventTypes.MESSAGE_DELETED) removeEventHandler(context, context.eventTypes.MESSAGE_DELETED, handleMessageDeleted);
        if (context.eventTypes.MESSAGE_SWIPED) removeEventHandler(context, context.eventTypes.MESSAGE_SWIPED, handleMessageSwiped);
        if (context.eventTypes.CHAT_CHANGED) removeEventHandler(context, context.eventTypes.CHAT_CHANGED, handleChatChanged);
        if (context.eventTypes.CHAT_CREATED) removeEventHandler(context, context.eventTypes.CHAT_CREATED, handleChatChanged);
        if (context.eventTypes.GENERATION_ENDED) removeEventHandler(context, context.eventTypes.GENERATION_ENDED, handleGenerationLifecycleEnd);
        if (context.eventTypes.GENERATION_STOPPED) removeEventHandler(context, context.eventTypes.GENERATION_STOPPED, handleGenerationLifecycleEnd);
        if (context.eventTypes.CHAT_COMPLETION_PROMPT_READY) removeEventHandler(context, context.eventTypes.CHAT_COMPLETION_PROMPT_READY, handleChatCompletionPromptReady);
        state.subscribed = false;
    }
}

function removeEventHandler(context, eventName, handler) {
    if (typeof context?.eventSource?.off === 'function') {
        context.eventSource.off(eventName, handler);
    } else if (typeof context?.eventSource?.removeListener === 'function') {
        context.eventSource.removeListener(eventName, handler);
    }
}

subscribeMessageHandler();
getSettings();
ensureStreamingArtifactRegex();
if (typeof jQuery === 'function') {
    jQuery(() => {
        ensureStreamingArtifactRegex();
        renderSettingsPanel();
        injectPromptOptionPrompts();
        setTimeout(() => {
            getPlayerRoot();
            restoreTrackerFromLatestDisplaySnapshot();
            migrateVisibleHandoffDisplays();
            renderAllTrackerDisplayBlocks();
            renderPlayerSetupCard();
        }, 0);
    });
} else {
    ensureStreamingArtifactRegex();
    renderSettingsPanel();
    injectPromptOptionPrompts();
    setTimeout(() => {
        getPlayerRoot();
        restoreTrackerFromLatestDisplaySnapshot();
        migrateVisibleHandoffDisplays();
        renderAllTrackerDisplayBlocks();
        renderPlayerSetupCard();
    }, 0);
}
clearRuntimePrompts();
console.info(`[${EXTENSION_NAME}] loaded`);

