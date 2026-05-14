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
import {
    STREAMING_ARTIFACT_REGEX_SCRIPT_ID,
    STREAMING_ARTIFACT_REGEX_SCRIPT_NAME,
    STREAMING_ARTIFACT_REGEX_PATTERN,
    buildStreamingArtifactRegexScript,
} from './streaming-artifact-regex.js';
import { getExplicitNamePromotions, isPromotableTrackerName } from './tracker-name-promotions.js';

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
const TRACKER_DISPLAY_EXTRA_KEY = 'structured_preflight_tracker_display';
const TRACKER_DISPLAY_BLOCK_CLASS = 'structured-preflight-tracker-block';
const TRACKER_DISPLAY_VERSION = 1;
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
Serious, grounded, body-focused narration for fantasy roleplay with clear action, physical tension, intimacy, erotic charge, and ecchi framing when the scene supports it.

**BASE TEXTURE:**
- Keep prose lean, direct, and tactile.
- Prioritize bodies, objects, distance, pressure, weight, fabric, skin, steel, blood, heat, injury, grip, footing, and consequence.
- Make space and motion easy to follow.
- Let scenes feel heavy through contact, restraint, timing, stillness, interruption, and consequence.

**ACTION MODE:**
Use for combat, struggle, chase, restraint, spell impact, or physical contest.
- Track footwork, leverage, spacing, timing, balance, momentum, impact, recovery, and changed position.
- Make attacks, defenses, dodges, grabs, falls, reversals, and spell effects spatially legible.
- Show consequences through injury, displacement, broken rhythm, lost footing, blocked access, or damaged surroundings.

**TENSION MODE:**
Use for aftermath, standoffs, refusals, confessions, threats, recovery, or quiet pressure.
- Focus on distance, hand placement, posture, clothing, wounds, blocked exits, unfinished speech, object handling, and who moves first.
- Keep the pressure in what characters do, withhold, touch, refuse, or leave unsaid.

**EROTIC MODE:**
Use only when intimacy, arousal, exposure, sexual contact, or explicit sex is actually present.
- Be direct, anatomical, physical, and unembarrassed.
- Track grip, angle, pressure, rhythm, thrust, spread, drag, recoil, weight, resistance, exposure, fluids, sound, climax, and aftermath.
- Treat clothing and exposure as material action: fabric sticks, peels, drags, bunches, slips, tears, or falls away.
- Crude anatomical terms are allowed in explicit scenes when they fit the intensity: pussy, cunt, cock, shaft.

**ECCHI OVERLAY:**
Use only when physically justified by exposure, combat damage, clothing strain, charged proximity, intimacy, embarrassment, or bodily vulnerability.
- Frame thighs, hips, chest, mouth, hands, abdomen, damp fabric, exposed skin, pressure, imbalance, and contact.
- Clothing strain, slippage, transparency, damage, bounce, and wardrobe failure are physical consequences.
- Keep ecchi serious and integrated into the scene.

**MODE PRIORITY:**
- Base Texture always applies.
- Action Mode applies to physical conflict or movement.
- Tension Mode applies to quiet pressure and aftermath.
- Erotic Mode applies only when sexual or intimate content is present.
- Ecchi Overlay can layer onto any mode only when the scene physically supports it.
- Spatial clarity overrides intensity.`;
const DEFAULT_PROSE_RULES_PROMPT = String.raw`function simulationGuidelines() {
  domain: world simulation, NPC autonomy, social texture

  mandate:
    - Treat the world as active. NPCs pursue needs, fears, habits, loyalties, duties, grudges, and self-interest.
    - Let trust build through repeated behavior, shared danger, useful help, restraint, conflict, apology, and repair.
    - Let relationships change through pressure: argument, risk, protection, betrayal, sacrifice, attraction, refusal, and consequence.
    - Let history surface through behavior, objects, avoidance, practiced routines, and stress responses.
    - Use small recurring objects when they matter: a key, ring, knife, torn sleeve, cup, charm, letter, tool, or piece of clothing.
    - Seed future tension through concrete details that can matter later.

  examples:
    - "He checked the door twice before sitting."
    - "She touched the cracked ring on her thumb, then put her hand behind her back."
    - "'That is not what I asked.' He kept his voice low."
    - "The guard looked at the sealed letter, then folded it into his coat instead of handing it over."

  prohibition:
    - Never explain motives, trauma, lore, relationship meaning, or hidden history through exposition when behavior can carry it.
}

function abilityIntegration() {
  domain: ability and magic rendering

  mandate:
    - Narrate abilities and magic as natural extensions of body, perception, instinct, training, or presence.
    - Describe supernatural effects through immediate physical reality: movement, heat, pressure, distortion, sound, weight, damage, resistance, and environmental reaction.
    - Treat experienced magic as fluid and habitual.
    - Integrate magical effects directly into the action instead of isolating them as announcements.
    - Let NPCs perceive only the visible or sensory result unless they have a reason to understand the source.

  examples:
    - "The hilt settled into his palm, cold and heavy."
    - "Heat rolled across the stone floor. Candle wax softened along the shelf."
    - "Beyond the wall, a heartbeat kept steady rhythm."
    - "Torchlight bent across the warped air above her hand."

  prohibition:
    - Never narrate activation, focusing, charging, spell invocation, ability names, system-style announcements, or explanatory power labels.
}

function fogOfWar() {
  domain: scene knowledge, naming, POV limits

  mandate:
    - Keep information tied to direct sensory evidence, spoken words, readable text, or visible action.
    - Refer to unknown people and places by observable traits until named in-scene.
    - Anchor sound by direction, distance, and obstruction when relevant.
    - Let NPCs perceive only what their senses, tools, training, or established abilities can plausibly detect.
    - If an effect has no visible origin, show the effect first and leave the source uncertain.
    - Unlock names only when spoken, read, recognized, introduced, or formally revealed in-scene.

  examples:
    - "A bark cut through from behind the wall, close and sharp."
    - "The woman with the linen-wrapped jaw shifted her knife to her left hand."
    - "Bootsteps crossed the floor above them, slow and uneven."
    - "The sign over the door read: Marn's Repairs."

  prohibition:
    - Never use god-view, meta-labeling, hidden names, unexplained motive knowledge, detached ambience, psychic empathy, or narration of {{user}} cognition.
}

function sensoryDiscipline() {
  domain: sensory selection, physical detail, smell and taste

  mandate:
    - Default to sight, sound, and touch.
    - Use smell or taste only when the source is close, visible, overpowering, or directly relevant to action.
    - Make sensory detail practical: location, texture, pressure, temperature, damage, movement, sound, contact, footing, cover, visibility.
    - Use the environment when it changes choices, danger, attention, movement, concealment, or access.
    - Keep sensory description attached to the present action.

  examples:
    - "Mugs clattered. The fire popped."
    - "Mud caked his boots. Water dripped from his coat onto the floor."
    - "The floorboard bent under her heel."
    - "Smoke pressed under the door in a thin gray line."

  prohibition:
    - Never use ambient mood scent, romanticized odor, taste-the-air phrasing, decorative sensory haze, or more than one smell/taste mention per scene unless physically unavoidable.
}

function groundedPhysicalProse() {
  domain: prose style, literalism, objectivity, anti-shorthand

  mandate:
    - Use plain physical prose.
    - Let meaning come from bodies, objects, pressure, distance, timing, and consequence.
    - Choose verbs that describe real motion, contact, resistance, interruption, or change.
    - Use adjectives for measurable qualities: wet, cracked, narrow, loose, hot, dim, heavy, sharp.
    - Describe inanimate things by what they physically do.
    - Describe impact, sound, texture, light, dust, smoke, blood, and debris directly instead of comparing them to unrelated objects.
    - For inanimate matter, use literal movement verbs: rose, fell, scattered, lifted, spread, struck, scraped, cracked, dripped, pooled, slid.
    - Make descriptions specific enough to film.
    - Prefer visible choices with consequence: stepping back, blocking a doorway, dropping an object, changing grip, missing a word, turning away, sitting down, standing too fast.

  examples:
    - "She spoke quietly."
    - "No one moved."
    - "Leaves rustled against the shutters."
    - "He stared at the cup. His thumb rubbed the handle."
    - "She set the cup down without drinking."
    - "His hand moved to the knife, then stopped on the table edge."
    - "The impact landed with a flat, wet thud."
    - "Dust kicked up around her."

  prohibition:
    - Never use metaphor, simile, idiom, poetic framing, personification, emotional physics, decorative atmosphere, trope shorthand, blushing/flushing, eye-language mood shortcuts, "jaw tightened", "throat worked", "opened her mouth and closed it", "shadow fell over her eyes", "eyes darkened", "eyes softened", "expression flickered", "face softened", "heart skipped", "stomach twisted", or "not X, but Y" contrast phrasing.
    - Never use sensory analogy phrasing to create an image instead of reporting the event: "sounded like", "felt like", "looked like", "as if", or "as though".
    - Never use decorative material verbs for particles, liquids, light, shadow, silence, or air: no blooming dust, breathing rooms, falling shadows, waiting silence, or similar ornamental motion.
    - Never use breath as emotional shorthand: "breath caught", "breath catches", "breath hitched", "breath hitches", "breath stalled", "breath snagged", "forgot to breathe", or "could not breathe". Breath is allowed only as concrete exertion, injury, panic, sex, restraint, or recovery.
}

function behavioralRendering() {
  domain: emotion through observable behavior

  mandate:
    - Render emotion through chosen behavior: posture, distance, blocking, retreat, object handling, speech timing, unfinished sentences, repeated motions, grip changes, and use of space.
    - Show what a person in the room could actually see or hear.
    - Prefer actions that alter the scene over micro-expressions.
    - Let restraint, avoidance, delay, interruption, and failed routine carry meaning.
    - Use body mechanics only when they are concrete: weight transfer, foot placement, hand position, breath control, stance correction, contact with objects.

  examples:
    - "She retied her shoelaces. Twice."
    - "He fumbled with the lighter. It fell."
    - "He lowered his voice and moved the mug closer to her hand."
    - "Her hand stayed on the latch."
    - "'No.' The second word did not come."

  prohibition:
    - Never label internal states, use canned body-language shorthand, use blush/flush/heat-in-cheeks phrasing, or substitute stock gestures for specific action.
}

function dialogueDiscipline() {
  domain: spoken interaction

  mandate:
    - Keep dialogue reactive, pressured, and specific to the moment.
    - Let NPCs dodge, interrupt, bargain, accuse, soften, stall, deflect, or stop themselves.
    - Keep monologues short.
    - Put action and dialogue from the same speaker in the same paragraph when they belong together.
    - Let speech create a clear response point for {{user}}.

  examples:
    - "'I told you not to come here.' She set the glass down. 'But you never listen.'"
    - "'The shipment is late.' He drummed his fingers on the table. 'Again.'"
    - "'No.' He pushed the ledger back."
    - "'Put it down,' she said."

  prohibition:
    - Never use exposition dumps, same-speaker fragmentation, answer questions directed at {{user}}, or continue past a direct prompt for {{user}} response.
}

function turnAndAgencyControl() {
  domain: turn structure, chronology, agency, stopping point

  mandate:
    - Begin at the immediate consequence after {{user}} input.
    - Start with the world's response, not a transition that restates the user's speech or action.
    - Treat {{user}} input as already completed unless mechanics say it failed, stalled, or was interrupted.
    - Run the world, NPCs, environment, consequences, and unresolved pressure.
    - Keep cause and effect linear.
    - Use the smallest necessary time gap unless {{user}} requests a cut.
    - Stop when {{user}} is targeted by a question, command, request, incoming attack frame, unresolved impact, or choice point.
    - End on something {{user}} can immediately respond to: NPC speech, NPC action, new stimulus, danger, obstacle, or consequence.
    - Allow involuntary physical effects on {{user}} when caused by the world or mechanics.
    - For OOC proxy instructions in double parentheses, execute the requested narration exactly, add no dialogue, and return control immediately.
    - On time skips, cut directly to the new environment and current situation.

  examples:
    - "The water settled. He watched the ripples."
    - "The blade stopped an inch from {{user}}'s throat."
    - "'Where are you going?'"
    - "The handle turned from the other side."
    - "The room was dark when the door opened again."

  prohibition:
    - Never write {{user}} speech, thoughts, intentional actions, reactions, silence, choices, follow-up, recap, travel filler after a skip, "as you" phrasing, opening recap transitions such as "the words left [name]'s mouth", ambient filler endings, explicit waiting, or meta-questions.
}`;
const DEFAULT_FINAL_REMINDER_PROMPT = String.raw`FINAL RECALL — APPLY ALL LOCKED ENFORCEMENT FUNCTIONS BEFORE OUTPUT.
REFERENCE ONLY. DO NOT OUTPUT THIS BLOCK.

call simulationGuidelines()
- Run NPCs as autonomous people with needs, habits, duties, fears, loyalties, grudges, and self-interest.
- Let trust, history, attraction, refusal, and conflict show through behavior, objects, choices, and consequence.

call abilityIntegration()
- Render abilities and magic as natural extensions of body, instinct, perception, training, or presence.
- Show effects through physical reality: motion, heat, pressure, sound, distortion, weight, damage, and environmental reaction.

call fogOfWar()
- Keep knowledge tied to direct sensory evidence, speech, readable text, visible action, or established ability.
- Use observable traits until names are spoken, read, recognized, introduced, or revealed in-scene.

call sensoryDiscipline()
- Default to sight, sound, and touch.
- Use smell/taste only when close, visible, overpowering, or action-relevant.
- Keep sensory detail practical: location, texture, pressure, temperature, contact, footing, cover, visibility.

call groundedPhysicalProse()
- Use plain physical prose.
- Make meaning come from bodies, objects, pressure, distance, timing, and consequence.
- Use specific, filmable action instead of trope shorthand.
- Describe impact, sound, dust, smoke, light, blood, and debris directly; do not use sensory analogies or decorative material motion.

call behavioralRendering()
- Show emotion through observable behavior: posture, distance, grip, object handling, speech timing, interruption, retreat, blocking, repeated motion, and use of space.
- Prefer actions that alter the scene over micro-expressions.

call dialogueDiscipline()
- Keep dialogue reactive, pressured, specific, and short.
- Keep same-speaker action and dialogue in the same paragraph when they belong together.
- Stop when speech creates a clear response point for {{user}}.

call turnAndAgencyControl()
- Begin at the immediate consequence after {{user}} input.
- Start with the world's response, not a recap transition that restates {{user}} speech or action.
- Run the world, NPCs, environment, mechanics, and unresolved pressure.
- End on something {{user}} can immediately respond to.
- Keep {{user}} agency fully separate.

FINAL HARD PROHIBITION:
- Remove before output: {{user}} speech, thoughts, intentional actions, reactions, silence, or choices; recap or "as you" phrasing; opening recap transitions such as "the words left [name]'s mouth"; omniscience; premature names; exposition dumps; metaphor; simile; sensory analogy phrasing such as sounded like, felt like, looked like, as if, or as though; idiom; poetic framing; personification; emotional physics; decorative material motion such as blooming dust, breathing rooms, falling shadows, waiting silence, or similar ornamental motion; decorative ambience; ambient mood scent; taste-the-air phrasing; blushing/flushing/heat-in-cheeks; eye-language mood shortcuts; jaw tightened; throat worked; opened mouth then closed it; shadow fell over eyes; expression flickered; face softened; breath caught; breath catches; breath hitched; breath hitches; breath stalled; breath snagged; forgot to breathe; could not breathe; heart skipped; stomach twisted; "not X, but Y" contrast phrasing; ambient filler endings; explicit waiting; meta-questions.

FINAL CHECK:
- Output only final narration.
- If a banned element appears, delete it and regenerate before responding.
DO NOT output any of this text in the final response.`;
const DEFAULT_SETTINGS = Object.freeze({
    useSeparateSemanticSettings: false,
    semanticConnectionProfile: '',
    disableSemanticThinking: true,
    writingStyleEnabled: true,
    writingStylePrompt: DEFAULT_WRITING_STYLE_PROMPT,
    writingStylePlacement: 'before_prompt',
    writingStyleDepth: 0,
    writingStyleRole: 0,
    proseRulesEnabled: true,
    proseRulesPrompt: DEFAULT_PROSE_RULES_PROMPT,
    proseRulesPlacement: 'in_prompt',
    proseRulesDepth: 0,
    proseRulesRole: 0,
    finalReminderPrompt: DEFAULT_FINAL_REMINDER_PROMPT,
    finalReminderPlacement: 'in_chat',
    finalReminderDepth: 0,
    finalReminderRole: 0,
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
    injectWritingStylePrompt();
    injectProseRulesPrompt();
    injectFinalReminderPrompt();
}

function refreshSettingsControls() {
    const settings = getSettings();
    const enabled = Boolean(settings.useSeparateSemanticSettings);
    const profileSelect = document.getElementById('structured_preflight_semantic_profile');
    const enabledCheckbox = document.getElementById('structured_preflight_use_separate_semantic_settings');
    const disableThinkingCheckbox = document.getElementById('structured_preflight_disable_semantic_thinking');
    const writingStyleEnabled = document.getElementById('structured_preflight_writing_style_enabled');
    const writingStyleDrawer = document.getElementById('structured_preflight_writing_style_drawer');
    const writingStylePrompt = document.getElementById('structured_preflight_writing_style_prompt');
    const proseRulesEnabled = document.getElementById('structured_preflight_prose_rules_enabled');
    const proseRulesDrawer = document.getElementById('structured_preflight_prose_rules_drawer');
    const finalReminderDrawer = document.getElementById('structured_preflight_final_reminder_drawer');
    const proseRulesPrompt = document.getElementById('structured_preflight_prose_rules_prompt');
    const finalReminderPrompt = document.getElementById('structured_preflight_final_reminder_prompt');
    const nameStyleSelect = document.getElementById('structured_preflight_name_style');

    if (enabledCheckbox) enabledCheckbox.checked = enabled;
    if (disableThinkingCheckbox) disableThinkingCheckbox.checked = settings.disableSemanticThinking !== false;
    if (writingStyleEnabled) writingStyleEnabled.checked = settings.writingStyleEnabled !== false;
    if (writingStylePrompt && writingStylePrompt.value !== settings.writingStylePrompt) {
        writingStylePrompt.value = String(settings.writingStylePrompt ?? DEFAULT_WRITING_STYLE_PROMPT);
    }
    if (proseRulesEnabled) proseRulesEnabled.checked = settings.proseRulesEnabled !== false;
    if (proseRulesPrompt && proseRulesPrompt.value !== settings.proseRulesPrompt) {
        proseRulesPrompt.value = String(settings.proseRulesPrompt ?? DEFAULT_PROSE_RULES_PROMPT);
    }
    if (finalReminderPrompt && finalReminderPrompt.value !== settings.finalReminderPrompt) {
        finalReminderPrompt.value = String(settings.finalReminderPrompt ?? DEFAULT_FINAL_REMINDER_PROMPT);
    }
    setPromptPlacementControls('writingStyle', settings, settings.writingStyleEnabled !== false);
    setPromptPlacementControls('proseRules', settings, settings.proseRulesEnabled !== false);
    setPromptPlacementControls('finalReminder', settings, settings.proseRulesEnabled !== false);
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

    if (profileSelect) profileSelect.disabled = !enabled;
    if (writingStylePrompt) writingStylePrompt.disabled = settings.writingStyleEnabled === false;
    if (writingStyleDrawer) {
        writingStyleDrawer.hidden = settings.writingStyleEnabled === false;
        if (writingStyleDrawer.hidden) writingStyleDrawer.open = false;
    }
    const proseRulesHidden = settings.proseRulesEnabled === false;
    if (proseRulesDrawer) {
        proseRulesDrawer.hidden = proseRulesHidden;
        if (proseRulesHidden) proseRulesDrawer.open = false;
    }
    if (finalReminderDrawer) {
        finalReminderDrawer.hidden = proseRulesHidden;
        if (proseRulesHidden) finalReminderDrawer.open = false;
    }
    if (proseRulesPrompt) proseRulesPrompt.disabled = settings.proseRulesEnabled === false;
    if (finalReminderPrompt) finalReminderPrompt.disabled = settings.proseRulesEnabled === false;

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
                            <option value="before_prompt">↑Char</option>
                            <option value="in_prompt">↓Char</option>
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
                <label class="checkbox_label flexNoGap">
                    <input id="structured_preflight_prose_rules_enabled" type="checkbox">
                    <span>Enable Prose Rules</span>
                </label>
                <small>When disabled, both the persistent prose rules and final reminder are skipped.</small>
                <details id="structured_preflight_prose_rules_drawer" data-structured-preflight-prompt-drawer>
                    <summary class="flex-container alignitemscenter">
                        <button class="menu_button flex1" type="button" data-structured-preflight-edit-toggle>Edit Prose Rules</button>
                        <button id="structured_preflight_reset_prose_rules" class="menu_button" type="button">Reset</button>
                    </summary>
                    <div class="flex-container alignItemsBaseline">
                        <label for="structured_preflight_proseRules_placement">Placement</label>
                        <select id="structured_preflight_proseRules_placement" class="text_pole flex1">
                            <option value="before_prompt">↑Char</option>
                            <option value="in_prompt">↓Char</option>
                            <option value="in_chat">In-Chat @Depth</option>
                            <option value="none">Disabled</option>
                        </select>
                    </div>
                    <div id="structured_preflight_proseRules_depth_row" class="flex-container alignItemsBaseline">
                        <label for="structured_preflight_proseRules_depth">Depth</label>
                        <input id="structured_preflight_proseRules_depth" class="text_pole widthNatural" type="number" min="0" max="10000" step="1">
                        <label for="structured_preflight_proseRules_role">Role</label>
                        <select id="structured_preflight_proseRules_role" class="text_pole flex1">
                            <option value="0">System</option>
                            <option value="1">User</option>
                            <option value="2">Assistant</option>
                        </select>
                    </div>
                    <small>Injected into the regular SillyTavern prompt stack.</small>
                    <textarea id="structured_preflight_prose_rules_prompt" class="text_pole textarea_compact" rows="14" spellcheck="false"></textarea>
                </details>
                <details id="structured_preflight_final_reminder_drawer" data-structured-preflight-prompt-drawer>
                    <summary class="flex-container alignitemscenter">
                        <button class="menu_button flex1" type="button" data-structured-preflight-edit-toggle>Edit Final Reminder</button>
                        <button id="structured_preflight_reset_final_reminder" class="menu_button" type="button">Reset</button>
                    </summary>
                    <div class="flex-container alignItemsBaseline">
                        <label for="structured_preflight_finalReminder_placement">Placement</label>
                        <select id="structured_preflight_finalReminder_placement" class="text_pole flex1">
                            <option value="before_prompt">↑Char</option>
                            <option value="in_prompt">↓Char</option>
                            <option value="in_chat">In-Chat @Depth</option>
                            <option value="none">Disabled</option>
                        </select>
                    </div>
                    <div id="structured_preflight_finalReminder_depth_row" class="flex-container alignItemsBaseline">
                        <label for="structured_preflight_finalReminder_depth">Depth</label>
                        <input id="structured_preflight_finalReminder_depth" class="text_pole widthNatural" type="number" min="0" max="10000" step="1">
                        <label for="structured_preflight_finalReminder_role">Role</label>
                        <select id="structured_preflight_finalReminder_role" class="text_pole flex1">
                            <option value="0">System</option>
                            <option value="1">User</option>
                            <option value="2">Assistant</option>
                        </select>
                    </div>
                    <small>Default is In-Chat @Depth 0, which still lands before the Story Engine narrator prompt.</small>
                    <textarea id="structured_preflight_final_reminder_prompt" class="text_pole textarea_compact" rows="12" spellcheck="false"></textarea>
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
    document.getElementById('structured_preflight_prose_rules_enabled')?.addEventListener('change', event => {
        settings.proseRulesEnabled = Boolean(event.target?.checked);
        refreshSettingsControls();
        injectPromptOptionPrompts();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_prose_rules_prompt')?.addEventListener('input', event => {
        settings.proseRulesPrompt = String(event.target?.value ?? '');
        injectProseRulesPrompt();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_final_reminder_prompt')?.addEventListener('input', event => {
        settings.finalReminderPrompt = String(event.target?.value ?? '');
        injectFinalReminderPrompt();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_reset_prose_rules')?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        settings.proseRulesPrompt = DEFAULT_PROSE_RULES_PROMPT;
        refreshSettingsControls();
        injectProseRulesPrompt();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_reset_final_reminder')?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        settings.finalReminderPrompt = DEFAULT_FINAL_REMINDER_PROMPT;
        refreshSettingsControls();
        injectFinalReminderPrompt();
        saveExtensionSettings();
    });
    for (const prefix of ['writingStyle', 'proseRules', 'finalReminder']) {
        const inject = prefix === 'writingStyle'
            ? injectWritingStylePrompt
            : prefix === 'proseRules'
                ? injectProseRulesPrompt
                : injectFinalReminderPrompt;
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

    const settings = getSettings();
    if (settings.proseRulesEnabled === false) {
        if (context.extensionPrompts) delete context.extensionPrompts[PROSE_RULES_PROMPT_KEY];
        if (context.extensionPrompts) delete context.extensionPrompts[FINAL_REMINDER_PROMPT_KEY];
        return;
    }

    const promptText = String(settings.proseRulesPrompt ?? DEFAULT_PROSE_RULES_PROMPT);
    injectMovablePrompt(
        PROSE_RULES_PROMPT_KEY,
        promptText,
        settings.proseRulesPlacement,
        settings.proseRulesDepth,
        settings.proseRulesRole,
    );
}

function injectFinalReminderPrompt() {
    const context = getContext();
    if (!context?.setExtensionPrompt) {
        return;
    }

    const settings = getSettings();
    if (settings.proseRulesEnabled === false) {
        if (context.extensionPrompts) delete context.extensionPrompts[FINAL_REMINDER_PROMPT_KEY];
        return;
    }

    const reminder = String(settings.finalReminderPrompt ?? DEFAULT_FINAL_REMINDER_PROMPT).trim();
    injectMovablePrompt(
        FINAL_REMINDER_PROMPT_KEY,
        reminder,
        settings.finalReminderPlacement,
        settings.finalReminderDepth,
        settings.finalReminderRole,
    );
}

function buildFinalNarrationPrompt(narratorContext) {
    return narratorContext;
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
        .replace(/[：﹕]/g, ':')
        .replace(/[＝]/g, '=')
        .replace(/[–—−]/g, '-')
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

function buildDisplayTrackerSnapshot({ messageKey, pendingRun, report }) {
    const resolutionPacket = report?.finalNarrativeHandoff?.resolutionPacket || {};
    const trackerAfter = normalizeDisplayTrackerNpcs({
        ...(pendingRun?.trackerBefore || {}),
        ...(pendingRun?.trackerAfter || {}),
    });
    const user = normalizeTrackerUserState(pendingRun?.userBefore || {});
    const promotionResult = applyExplicitNamePromotions(trackerAfter, {
        messageKey,
        latestUserText: pendingRun?.latestUserText,
    });
    return {
        version: TRACKER_DISPLAY_VERSION,
        messageKey,
        type: pendingRun?.type || 'normal',
        savedAt: Date.now(),
        userCoreStats: pendingRun?.userCoreStats || report?.semanticLedger?.engineContext?.userCoreStats || null,
        user,
        npcs: promotionResult.npcs,
    };
}

function applyExplicitNamePromotions(npcs, { latestUserText } = {}) {
    const normalized = normalizeDisplayTrackerNpcs(npcs);
    const promotions = getExplicitNamePromotions(latestUserText, Object.keys(normalized));

    for (const { oldName, newName } of promotions) {
        const oldEntry = normalized[oldName];
        const newEntry = normalized[newName];
        if (!oldEntry) continue;

        normalized[newName] = normalizeTrackerEntry({
            ...oldEntry,
            ...(newEntry || {}),
            lifecycle: 'Active',
        });
        normalized[oldName] = normalizeTrackerEntry({
            ...oldEntry,
            lifecycle: 'Retired',
        });
    }

    return {
        npcs: normalized,
    };
}

function buildTrackerUpdateForPersistence(displaySnapshot) {
    return {
        npcs: normalizeDisplayTrackerNpcs(displaySnapshot?.npcs || {}),
        user: normalizeTrackerUserState(displaySnapshot?.user || {}),
    };
}

function mergeNarratorTrackerDelta(snapshot, delta, options = {}) {
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
    }
    merged.npcs = normalizeDisplayTrackerNpcs(npcs);
    merged.narratorTrackerDelta = {
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
    const names = Object.keys(npcs).sort((a, b) => a.localeCompare(b));
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
            width: min(420px, calc(100vw - 36px));
            max-height: min(620px, calc(100vh - 36px));
            margin-top: 0.45rem;
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
                    <button class="structured-preflight-tracker-widget-close" type="button" title="Collapse" aria-label="Collapse">×</button>
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
    if (panel) panel.hidden = settings.trackerWidgetCollapsed !== false;

    const body = widget.querySelector('[data-structured-preflight-tracker-widget-body]');
    if (!body) return;
    const snapshot = buildCurrentTrackerWidgetSnapshot(context);
    body.innerHTML = snapshot?.npcs
        ? buildTrackerDisplayHtml(snapshot)
        : '<div class="structured-preflight-tracker-empty">No tracker data yet.</div>';
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

function firstChangedIndex(before, after) {
    const max = Math.max(before?.length || 0, after?.length || 0);
    for (let index = 0; index < max; index += 1) {
        if ((before?.[index] ?? null) !== (after?.[index] ?? null)) return index;
    }
    return max;
}

function stripComputedDebugPrefix(text) {
    return stripNarratorMetaPrefix(stripStructuredArtifacts(text)).trimStart();
}

function extractLegacyNarratorHandoff(text) {
    const source = String(text ?? '');
    const match = source.match(/<narrator_prompt_context_echo>\s*([\s\S]*?)\s*<\/narrator_prompt_context_echo>/i)
        || source.match(/&lt;narrator_prompt_context_echo&gt;\s*([\s\S]*?)\s*&lt;\/narrator_prompt_context_echo&gt;/i);
    return match?.[1]?.trim() || '';
}

function stripStructuredArtifacts(text) {
    return String(text ?? '')
        .replace(/````text\s*\n?&lt;pre_flight&gt;[\s\S]*?&lt;\/pre_flight&gt;\s*````\s*/gi, '')
        .replace(/````text\s*\n?<pre_flight>[\s\S]*?<\/pre_flight>\s*````\s*/gi, '')
        .replace(/````text\s*\n?<narrator_prompt_context_echo>[\s\S]*?<\/narrator_prompt_context_echo>\s*````\s*/gi, '')
        .replace(/```story_engine_tracker_delta\s*[\s\S]*?```\s*/gi, '')
        .replace(/```story_engine_tracker_delta\s*[\s\S]*?(?=BEGIN_FINAL_NARRATION|$)/gi, '')
        .replace(/<!--\s*STORY_ENGINE_TRACKER_DELTA[\s\S]*?STORY_ENGINE_TRACKER_DELTA_END\s*-->\s*/gi, '')
        .replace(/&lt;!--\s*STORY_ENGINE_TRACKER_DELTA[\s\S]*?STORY_ENGINE_TRACKER_DELTA_END\s*--&gt;\s*/gi, '')
        .replace(/<trackers>[\s\S]*?<\/trackers>\s*/gi, '')
        .replace(/&lt;trackers&gt;[\s\S]*?&lt;\/trackers&gt;\s*/gi, '')
        .replace(/BEGIN_TRACKER_DELTA[\s\S]*?END_TRACKER_DELTA\s*/gi, '')
        .replace(/BEGIN_TRACKER_DELTA[\s\S]*?(?=BEGIN_FINAL_NARRATION|$)/gi, '')
        .replace(/\[STORY_ENGINE_NARRATOR_HANDOFF[\s\S]*?==BINDING_NARRATION_DIRECTIVE==[\s\S]*?(?=BEGIN_FINAL_NARRATION|$)/gi, '')
        .replace(/\[STORY_ENGINE_NARRATOR_DIRECTIVE[\s\S]*?==PROMPT==\s*/gi, '')
        .replace(/&lt;pre_flight&gt;[\s\S]*?&lt;\/pre_flight&gt;\s*/gi, '')
        .replace(/<pre_flight>[\s\S]*?<\/pre_flight>\s*/gi, '')
        .replace(/<narrator_prompt_context_echo>[\s\S]*?<\/narrator_prompt_context_echo>\s*/gi, '')
        .replace(/BEGIN_FINAL_NARRATION\s*/gi, '')
        .replace(/\s*END_FINAL_NARRATION/gi, '');
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

function sanitizeAssistantNarration(text) {
    const original = String(text ?? '').trim();
    if (!original) return original;

    const withoutTracker = stripStructuredArtifacts(original).trim();
    const tagged = withoutTracker.match(/BEGIN_FINAL_NARRATION\s*([\s\S]*?)\s*END_FINAL_NARRATION/i);
    const source = tagged ? tagged[1].trim() : stripNarratorMetaPrefix(withoutTracker);
    const cleaned = stripVisibleMechanicsLabels(stripStructuredArtifacts(source)).trim();
    return cleaned || original;
}

function extractNarratorTrackerDeltaText(text) {
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

function stripVisibleMechanicsLabels(text) {
    let cleaned = String(text ?? '').trimStart();
    const label = '(?:Critical|Moderate|Minor)\\s+(?:Success|Failure)|Success|Failure|Stalemate|No\\s+Roll|Dominant\\s+Impact|Solid\\s+Impact|Light\\s+Impact|Checked|Deflected|Avoided|Struggle';
    const patterns = [
        new RegExp(`^\\s*(?:[*_~]{1,3})?\\s*(?:[\\[(])?\\s*${label}\\s*(?:[\\])])?\\s*(?:[*_~]{1,3})?\\s*(?:[-:\\u2013\\u2014]+)\\s*`, 'i'),
        new RegExp(`^\\s*(?:Result|Outcome|OutcomeTier)\\s*[:=]\\s*(?:[*_~]{1,3})?\\s*(?:[\\[(])?\\s*${label}\\s*(?:[\\])])?\\s*(?:[*_~]{1,3})?\\s*(?:[-:\\u2013\\u2014]+)?\\s*`, 'i'),
        new RegExp(`^\\s*(?:[*_~]{1,3})\\s*${label}\\s*(?:[-:\\u2013\\u2014]+)?\\s*(?:[*_~]{1,3})\\s*`, 'i'),
    ];
    let changed = true;
    while (changed) {
        changed = false;
        for (const pattern of patterns) {
            const next = cleaned.replace(pattern, '');
            if (next !== cleaned) {
                cleaned = next.trimStart();
                changed = true;
            }
        }
    }
    return cleaned;
}

function stripNarratorMetaPrefix(text) {
    const source = String(text ?? '').trim();
    if (!source) return source;

    const promptDirective = source.match(/(?:^|\n)\s*==PROMPT==\s*\n+/i);
    if (promptDirective && promptDirective.index < 4000) {
        return stripNarratorMetaPrefix(source.slice(promptDirective.index + promptDirective[0].length).trim());
    }

    const bindingDirective = source.match(/(?:^|\n)\s*==BINDING_NARRATION_DIRECTIVE==\s*\n+/i);
    if (bindingDirective && bindingDirective.index < 4000) {
        return stripNarratorMetaPrefix(source.slice(bindingDirective.index + bindingDirective[0].length).trim());
    }

    const lengthTarget = source.match(/(?:^|\n)\s*(?:Length target|Hard maximum):\s*[^\n]*\n+/i);
    if (lengthTarget && lengthTarget.index < 4000) {
        return source.slice(lengthTarget.index + lengthTarget[0].length).trim();
    }

    const finalWritingCue = source.match(/(?:^|\n)\s*(?:Let me write this|BEGIN_FINAL_NARRATION)[^\n]*\n*/i);
    if (finalWritingCue && finalWritingCue.index < 4000) {
        return source.slice(finalWritingCue.index + finalWritingCue[0].length).trim();
    }

    const prefix = source.slice(0, 2500);
    if (!/\b(preflight|mechanics|NPC State|Proactivity|Chaos|GUIDE|BINDING_NARRATION_DIRECTIVE|MODEL_INSTRUCTION|PROMPT|STORY_ENGINE_NARRATOR_DIRECTIVE|PRIVATE_MECHANICS_AUDIT|narrator prompt|formatting rules|The user action)\b/i.test(prefix)) {
        return source;
    }

    const lines = source.split(/\r?\n/);
    let cut = 0;
    for (let index = 0; index < Math.min(lines.length, 40); index += 1) {
        const line = lines[index].trim();
        if (
            !line
            || /^[-*]\s+/.test(line)
            || /^(The user|User Action|Decisive Action|Roll Used|Outcome|Outcome Meaning|Margin|Landed Actions|Result|Action Count|Stakes|Targets|Counter Potential|NPC State|Relationship Result|Chaos|Proactivity|Aggression|Aggression Guide|GUIDE|BINDING_NARRATION_DIRECTIVE|MODEL_INSTRUCTION|PROMPT|STORY_ENGINE_NARRATOR_DIRECTIVE|PRIVATE_MECHANICS_AUDIT)\b/i.test(line)
            || /\b(preflight|mechanics|formatting rules|Length target|Hard maximum|PRIVATE HANDOFF|should be|Let me)\b/i.test(line)
        ) {
            cut = index + 1;
            continue;
        }
        break;
    }

    return cut > 0 ? lines.slice(cut).join('\n').trim() : source;
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

    try {
        message.extra = message.extra || {};

        const currentText = String(message.mes ?? '');
        const displayText = message.extra.display_text == null ? null : String(message.extra.display_text);
        const rawAssistantText = displayText ?? currentText;
        const trackerDeltaText = extractNarratorTrackerDeltaText(currentText) || extractNarratorTrackerDeltaText(displayText);
        const visibleText = stripComputedDebugPrefix(rawAssistantText);
        const narrationText = sanitizeAssistantNarration(visibleText);
        const narratorHandoff = state.lastNarratorHandoff;
        const pendingRun = state.pendingRun;
        let trackerDeltaWarning = null;

        const root = getTrackerRoot(context);
        if (root && pendingRun) {
            let trackerDisplaySnapshot = buildDisplayTrackerSnapshot({
                messageKey,
                pendingRun,
                report: pendingRun.report,
            });
            if (trackerDeltaText) {
                try {
                    const sameRunDelta = parseNarratorTrackerDelta(trackerDeltaText, narrationText);
                    const clampedTrackerDelta = applyContextualInjuryCapsToTrackerDelta(sameRunDelta, pendingRun.contextualInjuryCaps);
                    trackerDisplaySnapshot = mergeNarratorTrackerDelta(trackerDisplaySnapshot, clampedTrackerDelta, {
                        messageKey,
                        latestUserText: pendingRun.latestUserText,
                        assistantText: narrationText,
                    });
                } catch (error) {
                    trackerDeltaWarning = error instanceof Error ? error.message : String(error);
                    console.warn(`[${EXTENSION_NAME}] same-run tracker delta parse failed; keeping pre-reply tracker snapshot.`, error);
                }
            } else {
                trackerDeltaWarning = 'Narrator response did not include BEGIN_TRACKER_DELTA block.';
                console.warn(`[${EXTENSION_NAME}] ${trackerDeltaWarning}`);
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
    } finally {}
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
    clearAllProgress();
    state.pendingGeneration = null;
    clearRuntimePrompts();

    if (state.pendingRun && !state.pendingRunCleanupTimer) {
        state.pendingRunCleanupTimer = setTimeout(() => {
            state.pendingRunCleanupTimer = null;
            if (!state.pendingRun) return;
            state.pendingRun = null;
            state.lastNarratorHandoff = '';
            state.lastNarratorHandoffKey = null;
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
    state.pendingGeneration = {
        type: type || 'normal',
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

        const narratorContext = formatNarratorPromptContext(report);
        const narratorModelContext = formatNarratorModelPromptContext(report);
        state.pendingRun = {
            type: state.pendingGeneration.type || 'normal',
            trackerBefore: trackerSnapshot,
            trackerAfter: report.trackerUpdate?.npcs || {},
            userBefore: state.pendingGeneration.playerTrackerSnapshot || buildPlayerTrackerSnapshot(context),
            userAfter: report.trackerUpdate?.user || {},
            resolutionPacket: report.finalNarrativeHandoff?.resolutionPacket || {},
            userCoreStats: report.semanticLedger?.engineContext?.userCoreStats || null,
            contextualInjuryCaps: collectContextualInjuryCaps(report),
            latestUserText: getLatestUserText(eventData.chat),
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
