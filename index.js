import { ENGINE_PROMPT_TEXT, classifyDisposition, normalizeTrackerEntry, normalizeTrackerUserState } from './engines.js';
import { saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../../scripts/extensions.js';
import { addEphemeralStoppingString, flushEphemeralStoppingStrings } from '../../../../scripts/power-user.js';
import { persona_description_positions, power_user } from '../../../../scripts/power-user.js';
import { setPersonaDescription, user_avatar } from '../../../../scripts/personas.js';
import { getPresetManager } from '../../../../scripts/preset-manager.js';
import { rotateSecret, SECRET_KEYS, secret_state } from '../../../../scripts/secrets.js';
import { SlashCommandParser } from '../../../../scripts/slash-commands/SlashCommandParser.js';
import { formatNarratorModelPromptContext, formatNarratorPromptContext } from './pre-flight.js';
import { extractPostReplyTrackerDelta, extractSemanticLedger, POST_REPLY_TRACKER_STOP_SENTINEL, SEMANTIC_PREFLIGHT_STOP_SENTINEL, sendSemanticProfileTextRequest } from './semantic-extractor.js';
import { buildPlayerTrackerSnapshot, buildTrackerSnapshot, runDeterministicEngines, saveTrackerUpdate } from './deterministic-runner.js';

const EXTENSION_NAME = 'Story Engine';
const SETTINGS_KEY = 'structuredPreflightEngines';
const SETTINGS_CONTAINER_ID = 'structured_preflight_settings_container';
const ENGINE_PROMPT_KEY = 'structured_preflight_engines';
const NARRATOR_PROMPT_KEY = 'structured_preflight_narrator_context';
const WRITING_STYLE_PROMPT_KEY = 'structured_preflight_10_writing_style';
const PROSE_RULES_PROMPT_KEY = 'structured_preflight_20_prose_rules';
const LEGACY_WRITING_STYLE_PROMPT_KEY = 'structured_preflight_writing_style';
const LEGACY_PROSE_RULES_PROMPT_KEY = 'structured_preflight_prose_rules';
const PROFILE_NONE = '<None>';
const TRACKER_DISPLAY_EXTRA_KEY = 'structured_preflight_tracker_display';
const TRACKER_DISPLAY_BLOCK_CLASS = 'structured-preflight-tracker-block';
const TRACKER_DISPLAY_VERSION = 1;
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
const DEFAULT_WRITING_STYLE_PROMPT = String.raw`**WRITING STYLE** 

**ARCHETYPE:** Cormac McCarthy physical prose x R.A. Salvatore action x Tessa Bailey explicit erotica x serious ecchi framing.

**CORE LAW:**
- Physical reality first. No metaphors. No internal monologue.
- Emotion through breath, posture, distance, gaze, contact, hesitation, pressure, recoil, and bodily response.
- Sweat, skin, blood, steel, fabric, breath, heat, friction, and impact all matter equally.
- Tone is serious, grounded, heavy, and physically charged.

**ACTION MODE:**
- Use clear technical choreography: footwork, leverage, spacing, timing, momentum, impact.
- Every strike, dodge, grab, fall, and reversal must be spatially legible.
- If erotic tension is present, weave it through contact, imbalance, exposure, and breath without losing clarity.

**TENSION MODE:**
- In quiet or aftermath scenes, keep prose lean and heavy.
- Focus on stillness, breathing, wounds, sweat, stance, silence, clothing, exposed skin, and proximity.

**EROTIC MODE:**
- When the scene is sexually charged or explicit, be direct, anatomical, and physical.
- Choreograph grip, angle, pressure, rhythm, thrust, spread, drag, recoil, and weight clearly.
- Treat exposure as a material event: fabric sticks, peels, drags, bunches, slips, tears, or falls away.
- If exposure is explicit and unobstructed, describe anatomy directly.
- Use crude terms in explicit scenes: pussy, cunt, cock, shaft.
- Arousal, fluids, sound, climax, and aftermath must stay bodily, messy, and concrete.

**ECCHI OVERLAY:**
- Use close physical framing: thighs, hips, chest, mouth, hands, abdomen, damp fabric, exposed skin.
- Clothing strain, slippage, transparency, damage, bounce, and wardrobe failure are physical consequences, not jokes.
- Keep ecchi serious, not comedic.

**MODE PRIORITY:**
- Core Law always applies.
- Action Mode for combat/struggle/pursuit.
- Tension Mode for stillness/aftermath/restraint.
- Erotic Mode only when intimacy, arousal, exposure, or sex is actually present.
- Ecchi Overlay can layer onto any mode without reducing physical clarity.

**MODEL EXAMPLES:**
- ❌ "Her heart fluttered with desire." → ✓ "Her weight shifted forward. Sweat traced her collarbone."
- ❌ "He attacked viciously." → ✓ "His lead foot snapped forward, blade arcing toward her throat."
- ❌ "The moment was electric." → ✓ "Three inches between their mouths. She could smell the wine on him."`;
const DEFAULT_PROSE_RULES_PROMPT = String.raw`function simulationGuidelines() {
**CORE DIRECTIVE:** The world and its inhabitants are autonomous, reactive, and textured.
**BEHAVIOR & SOCIALS:**
- **Autonomy:** Characters prioritize self-interest. Trust is currency, earned slowly.
- **Dialogue:** Human Imperfection. Use interruptions, evasion, and subtext. Ban exposition.
- **Dynamics:** Relationships mutate via _friction_ (arguments, shared danger), not just time.
**SUBTEXT & HISTORY:**
- **Trauma:** Show, Don't Explain. A flinch at a raised hand; a freeze at a specific smell.
- **Totems:** Assign physical objects (worn key, hoodie) that recur in high-stress moments.
- **Mirror Moments:** Occasional focus on physical degradation/change in reflections.
**ENVIRONMENTAL TEXTURE:**
- **Diegesis:** Enrich the present. Linger on background motion, light, and posture.
- **Physics/Magic:** Describe as lived phenomena (weight, resonance, heat).
- **Seeds:** Plant small, unanswered questions (rumors, odd details) for future payoff.
}
function abilityIntegration() {
  domain: ability and magic rendering
  policy: LOCKED
  mandate: Biological Integration. Treat abilities and magic as innate physiology. Never announce activation.
  ban:
    - "Using [Ability]"
    - "Focusing"
    - "Activating"
    - "Summoning"
  protocol:
    - Skip the cause.
    - Narrate only the effect as direct sensory fact.
  pattern:
    - Darkvision -> "He scanned the unlit room. A figure crouched behind the crate, clear as day."
    - Dimensional Storage -> "He closed his fingers. The hilt materialized against his palm, cold and heavy."
    - Super Hearing -> "Through the stone wall, the rhythm of a heartbeat thudded against his ear."
}
function fogOfWar() {
  domain: scene knowledge, naming, POV limits
  policy: LOCKED
  mandate: Strict Epistemology. Information stays locked until earned by direct sensory evidence, dialogue, or readable text.
  ban:
    - Hive Mind
    - Psychic Empathy
    - Meta-Labeling
    - God-View
    - Detached Ambience
    - Ability Omniscience
  protocol:
    - Unknown entities/places: refer only by observable traits.
    - Names unlock only after spoken, read, or formally revealed in-scene.
    - Anchor all sound to position: direction + rough distance + occlusion when relevant.
    - Do not narrate {{user}} cognition.
    - If an ability has no visible origin, NPCs perceive effect only; source remains unknown.
  pattern:
    - "Somewhere beyond the glade's edge, a cricket chirps." -> "A cricket chirped to the left, past the treeline."
    - "Somewhere, a dog barks." -> "A bark cut through — sharp, close, behind the wall."
}
function olfactoryGate() {
  domain: smell and taste gating
  policy: LOCKED
  mandate: Default to sight, sound, touch. Scent and taste are locked by default.
  ban:
    - ambient mood scents
    - "tasting the air"
    - romanticized odor language
  unlock:
    - stimulus is overpowering
    - source is visible
    - {{user}} is in immediate proximity
  limit:
    - max 1 smell/taste mention per scene
    - no repetition
  pattern:
    - "The tavern smelled of ale and woodsmoke." -> "Mugs clattered. The fire popped."
    - "His musk and wet earth filled her senses." -> "Mud caked his boots. His coat dripped onto the floor."
}
function sensoryEnforcement() {
  domain: allowed sensory channels
  policy: LOCKED
  mandate: Narrate only through raw physical data.
  default:
    - sight
    - sound
    - touch
  gate:
    - smell and taste allowed only if olfactoryGate() unlocks
  ban:
    - abstract emotive labels
    - mood-label sensory claims
    - "the air felt"
  pattern:
    - "He was nervous." -> "He wiped his palms on his jeans. The fabric darkened."
    - "Awkward silence." -> "The refrigerator hummed. A floorboard settled."
    - "Angry voice." -> "He slammed the mug down. 'No.'"
}
function styleEnforcement() {
  domain: prose ornament and wording style
  policy: LOCKED
  mandate: Utilitarian prose. Zero ornament. Adjectives must describe physics, not vibes.
  ban:
    - textural glamour words
    - emotional physics
    - poetic framing
  note:
    - If describing silence, render observable absence plus substitute sound, not mood-object silence.
  pattern:
    - "Her voice was molten silk." -> "She spoke quietly."
    - "The silence was heavy." -> "No one moved."
    - "His eyes burned." -> "He stared."
}
function literalismEnforcement() {
  domain: figurative language control
  policy: LOCKED
  mandate: Radical Literalism. Describe objects and actions only by physical properties.
  ban:
    - metaphor
    - simile
    - hyperbole
    - elliptical construction
    - ellipsis
    - comparative phrasing
    - idiom
  pattern:
    - "Cold as ice." -> "She didn't blink."
    - "Drowning in guilt." -> "He put his head in his hands."
    - "Words were daggers." -> "He flinched."
}
function behavioralEnforcement() {
  domain: human behavior and emotional rendering
  policy: LOCKED
  mandate: Strict Behaviorism. Narrate only observable physical displacement: behavior + body mechanics.
  ban:
    - internal state labels
    - eye-language mood words
    - autonomic trope shortcuts
    - escalation loops
  use_instead:
    - fidgeting
    - posture shifts
    - weight transfer
    - footwork
    - stance over-corrections
    - gaze control
    - speech timing
  pattern:
    - "She was embarrassed." -> "She retied her shoelaces. Twice."
    - "He was afraid." -> "He fumbled with the lighter. It fell."
    - "He felt tender." -> "He lowered his voice. Moved the mug closer to her hand."
}
function materialEnforcement() {
  domain: objectivity of inanimate things
  policy: LOCKED
  mandate: Inanimate Objectivity. Only biological entities possess agency or intent.
  ban:
    - Pathetic Fallacy
    - Active verbs for abstract concepts
    - Anthropomorphism
  pattern:
    - "The wind whispered." -> "Leaves rustled."
    - "The room waited." -> "Dust motes drifted."
    - "The storm raged." -> "Rain lashed the glass."
}
function turnEnforcement() {
  domain: turn structure and stop conditions
  policy: LOCKED
  mandate: Stop generation immediately when {{user}} is targeted by question, command, request, or action. No filler. No forced resolution.
  npc_limits:
    - max 1 inter-NPC exchange
    - max 3 sentences per monologue
    - never answer a question directed at {{user}}
  agency:
    - absolute ban on describing {{user}} reaction, thought, or silence
  format:
    - Merge action and dialogue from the same speaker into the same block.
    - Paragraph breaks allowed for pacing.
  ban:
    - same-speaker fragmentation across line breaks
  pattern:
    - "I told you not to come here." She set the glass down. "But you never listen."
    - "The shipment's late." He drummed his fingers on the table. "Again."
}
function agencyEnforcement() {
  domain: user/world control separation
  policy: LOCKED
  mandate: Absolute Separation of Control. You run the world. {{user}} runs the protagonist.
  boundary:
    - Active: never write {{user}} speech, thoughts, or intentional actions.
    - Passive: may write {{user}} involuntary physics.
  ooc_override:
    - If {{user}} inputs ((Instruction)): act as Proxy Narrator.
    - Execute action exactly as described.
    - No dialogue.
    - Return control immediately after.
  interrupt_protocols:
    - Combat: if attack fails against {{user}}, halt at frame of impact.
    - Dialogue: speech ≠ movement.
    - Time Jump: on ((Skip to X)), hard cut. New environment only. No travel narration.
  pattern:
    - "The fist flew toward {{user}}'s jaw."
    - "Where are you going?"
    - "The tavern was half-empty. A fire crackled."
}
function chronologyEnforcement() {
  domain: temporal sequencing
  policy: LOCKED
  mandate: Strict Linear Progression. Narration begins at T+1 after {{user}} action/dialogue.
  ban:
    - echoing {{user}} action
    - summary restatement
    - "As you..." phrasing
  sequence:
    - {{user}} input = past tense fact
    - AI output = immediate consequence
    - gap = 0 seconds
  pattern:
    - User: "I fill the trough."
    - Bad: "You fill the trough..."
    - Good: "The water settled. He watched the ripples."
}
function handoffEnforcement() {
  domain: final beat and response hook
  policy: LOCKED
  mandate: Final beat must give {{user}} something immediate to react to. Never end on ambient filler.
  priority:
    - NPC dialogue or action directed at {{user}}
    - new stimulus entering scene
    - unresolved tension from handoff fields
  ban:
    - meta-questions
    - explicit waiting
    - ambient filler ending
    - personification
  test:
    - If {{user}} cannot reasonably respond to the final beat right now, regenerate using next-highest priority.
}`;
const DEFAULT_FINAL_REMINDER_PROMPT = String.raw`FINAL RECALL — APPLY ALL LOCKED ENFORCEMENT FUNCTIONS BEFORE OUTPUT.
REFERENCE ONLY. DO NOT OUTPUT THIS BLOCK.

call olfactoryGate()
- Smell/Taste locked unless overpowering + visible source + immediate proximity.
- Max 1 mention per scene.

call sensoryEnforcement()
- Narrate raw physical data only.
- Default channels: sight, sound, touch.

call styleEnforcement()
- Utilitarian prose only.
- No ornament, emotional physics, or poetic framing.

call literalismEnforcement()
- No metaphor, simile, hyperbole, idiom, or comparison phrasing.

call behavioralEnforcement()
- Show only observable behavior and body mechanics.
- No internal states or autonomic trope shortcuts. Absolutely no BLUSHING or FLUSHING. OBSERVABLE BEHAVIOR ONLY.

call materialEnforcement()
- No anthropomorphism or pathetic fallacy.

call fogOfWar()
- No omniscience, no god-view, no premature names/titles.

call chronologyEnforcement()
- Start at T+1 from {{user}}'s input.
- Do not echo or summarize {{user}} dialogue or actions.

call agencyEnforcement()
- Never write {{user}}'s speech, thoughts, or intentional actions.
- Failed attacks against {{user}} halt at frame of impact.

call turnEnforcement()
- Halt when {{user}} is targeted.
- Keep NPC speech blocks cohesive.

call handoffEnforcement()
- Final beat must give {{user}} something immediate to react to.
- No meta-questions, waiting, filler ambience, or personification.

FINAL CHECK:
- Remove any banned element before output.
DO NOT output any of this text in your final response.
- VIOLATION = FAILURE + DELETE ALL TEXT + REGENERATE.`;
const DEFAULT_SETTINGS = Object.freeze({
    useSeparateSemanticSettings: false,
    semanticConnectionProfile: '',
    semanticPreset: '',
    disableSemanticThinking: true,
    writingStyleEnabled: true,
    writingStylePrompt: DEFAULT_WRITING_STYLE_PROMPT,
    proseRulesEnabled: true,
    proseRulesPrompt: DEFAULT_PROSE_RULES_PROMPT,
    finalReminderPrompt: DEFAULT_FINAL_REMINDER_PROMPT,
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
const ENGINE_RUNTIME_SENTINEL = [
    '[STRUCTURED_PREFLIGHT_ENGINE_EXTENSION v0.5 - SEMANTIC PASS ACTIVE]',
    'The full engine source is used by the extension during the silent semantic/deterministic pass.',
    'For this narration pass, use the structured narrator handoff as authoritative mechanics context.',
].join('\n');

const EXTENSION_PROMPT_TYPES = Object.freeze({
    IN_PROMPT: 0,
    IN_CHAT: 1,
});

const EXTENSION_PROMPT_ROLES = Object.freeze({
    SYSTEM: 0,
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
    processingPostReplyTracker: false,
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

function getPresetNames() {
    const manager = getPresetManager();
    if (!manager?.getAllPresets) return [];
    try {
        return manager.getAllPresets()
            .map(name => String(name || '').trim())
            .filter(Boolean);
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] could not list presets for current API.`, error);
        return [];
    }
}

function getActivePresetName() {
    const manager = getPresetManager();
    if (!manager?.getSelectedPresetName) return '';
    try {
        return String(manager.getSelectedPresetName() || '');
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] could not read active preset.`, error);
        return '';
    }
}

function applyPresetName(presetName) {
    const wanted = String(presetName || '').trim();
    if (!wanted) return;

    const manager = getPresetManager();
    if (!manager?.getAllPresets || !manager?.findPreset || !manager?.selectPreset) {
        throw new Error(`Preset switching is unavailable for the current API; could not apply "${wanted}".`);
    }

    const exact = manager.getAllPresets()
        .map(name => String(name || ''))
        .find(name => name.toLowerCase().trim() === wanted.toLowerCase());
    if (!exact) {
        throw new Error(`Preset "${wanted}" was not found for the active API after applying the semantic connection profile.`);
    }

    const value = manager.findPreset(exact);
    if (value === undefined || value === null) {
        throw new Error(`Preset "${exact}" exists but could not be selected.`);
    }

    if (manager.getSelectedPresetName?.() !== exact) {
        manager.selectPreset(value);
    }
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
    const semanticPreset = String(settings.semanticPreset || '').trim();
    const semanticOptions = {
        disableSemanticThinking: settings.disableSemanticThinking !== false,
    };

    if (!useSeparateSettings || (!semanticProfile && !semanticPreset)) {
        return await callback(semanticOptions);
    }

    if (semanticProfile) {
        const profile = getConnectionProfileByName(semanticProfile);
        if (!profile) {
            throw new Error(`Semantic connection profile "${semanticProfile}" was not found.`);
        }

        console.info(`[${EXTENSION_NAME}] using direct semantic connection profile request: ${profile.name}`);
        if (semanticPreset) {
            console.info(`[${EXTENSION_NAME}] using semantic preset override for direct request: ${semanticPreset}`);
        }

        return await withConnectionProfileSecret(profile, () => callback({
            ...semanticOptions,
            semanticProfileId: profile.id,
            semanticProfileName: profile.name,
            semanticPreset,
        }));
    }

    const originalPreset = getActivePresetName();
    let switched = false;

    try {
        if (semanticPreset) {
            console.info(`[${EXTENSION_NAME}] applying semantic preset: ${semanticPreset}`);
            applyPresetName(semanticPreset);
            switched = true;
        }
        return await callback(semanticOptions);
    } finally {
        if (switched) {
            try {
                if (originalPreset) {
                    applyPresetName(originalPreset);
                }
                console.info(`[${EXTENSION_NAME}] restored roleplay preset after semantic pass.`);
            } catch (error) {
                console.error(`[${EXTENSION_NAME}] failed to restore roleplay preset after semantic pass.`, error);
                try {
                    globalThis.toastr?.error?.(
                        'Semantic pass finished, but restoring the original preset failed. Check ST connection settings before continuing.',
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

function setSelectOptions(select, values, placeholder, selectedValue, missingLabel = 'Missing') {
    if (!select) return;
    select.innerHTML = '';
    const empty = document.createElement('option');
    empty.value = '';
    empty.textContent = placeholder;
    select.append(empty);

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

    select.value = selectedValue || '';
}

function refreshSettingsControls() {
    const settings = getSettings();
    const enabled = Boolean(settings.useSeparateSemanticSettings);
    const profileSelect = document.getElementById('structured_preflight_semantic_profile');
    const presetSelect = document.getElementById('structured_preflight_semantic_preset');
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
    setSelectOptions(
        profileSelect,
        getConnectionProfileNames(),
        'Use current connection profile',
        settings.semanticConnectionProfile,
        'Profile not found',
    );
    setSelectOptions(
        presetSelect,
        getPresetNames(),
        'Use profile/current preset',
        settings.semanticPreset,
        'Preset not found for current API',
    );

    if (profileSelect) profileSelect.disabled = !enabled;
    if (presetSelect) presetSelect.disabled = !enabled;
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
                    <span>Use separate semantic connection profile / preset</span>
                </label>
                <div class="flex-container alignItemsBaseline">
                    <label for="structured_preflight_semantic_profile">Semantic connection profile</label>
                    <select id="structured_preflight_semantic_profile" class="text_pole flex1"></select>
                </div>
                <div class="flex-container alignItemsBaseline">
                    <label for="structured_preflight_semantic_preset">Semantic preset override</label>
                    <select id="structured_preflight_semantic_preset" class="text_pole flex1"></select>
                </div>
                <div class="flex-container alignitemscenter">
                    <small class="flex1">Leave preset blank to use the selected profile's preset. Settings are restored after the semantic pass.</small>
                    <button id="structured_preflight_refresh_semantic_settings" class="menu_button">Refresh</button>
                </div>
                <label class="checkbox_label flexNoGap">
                    <input id="structured_preflight_disable_semantic_thinking" type="checkbox">
                    <span>Disable thinking for semantic requests</span>
                </label>
                <small>Applies only to Story Engine semantic, tracker, and player setup calls. Main narration keeps its own profile settings.</small>
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
                    <small>Injected into the regular SillyTavern prompt stack after Main Prompt. Edit freely; whatever text is here will be sent as writing style context.</small>
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
                    <small>Injected as SYSTEM context immediately after Writing Style in the regular SillyTavern prompt stack.</small>
                    <textarea id="structured_preflight_prose_rules_prompt" class="text_pole textarea_compact" rows="14" spellcheck="false"></textarea>
                </details>
                <details id="structured_preflight_final_reminder_drawer" data-structured-preflight-prompt-drawer>
                    <summary class="flex-container alignitemscenter">
                        <button class="menu_button flex1" type="button" data-structured-preflight-edit-toggle>Edit Final Reminder</button>
                        <button id="structured_preflight_reset_final_reminder" class="menu_button" type="button">Reset</button>
                    </summary>
                    <small>Inserted immediately before the Story Engine narrator prompt for the final narration pass only.</small>
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
    document.getElementById('structured_preflight_semantic_preset')?.addEventListener('change', event => {
        settings.semanticPreset = String(event.target?.value || '');
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_disable_semantic_thinking')?.addEventListener('change', event => {
        settings.disableSemanticThinking = Boolean(event.target?.checked);
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_writing_style_enabled')?.addEventListener('change', event => {
        settings.writingStyleEnabled = Boolean(event.target?.checked);
        refreshSettingsControls();
        injectWritingStylePrompt();
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
        injectProseRulesPrompt();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_prose_rules_prompt')?.addEventListener('input', event => {
        settings.proseRulesPrompt = String(event.target?.value ?? '');
        injectProseRulesPrompt();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_final_reminder_prompt')?.addEventListener('input', event => {
        settings.finalReminderPrompt = String(event.target?.value ?? '');
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
        saveExtensionSettings();
    });
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
    injectWritingStylePrompt();
    injectProseRulesPrompt();
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

function injectRuntimeSentinel() {
    const context = getContext();
    if (!context?.setExtensionPrompt) {
        console.warn(`[${EXTENSION_NAME}] SillyTavern context is not ready; engine prompt was not injected.`);
        return;
    }

    context.setExtensionPrompt(
        ENGINE_PROMPT_KEY,
        ENGINE_RUNTIME_SENTINEL,
        EXTENSION_PROMPT_TYPES.IN_PROMPT,
        0,
        false,
        EXTENSION_PROMPT_ROLES.SYSTEM,
    );
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
    context.setExtensionPrompt(
        WRITING_STYLE_PROMPT_KEY,
        promptText,
        EXTENSION_PROMPT_TYPES.IN_PROMPT,
        0,
        false,
        EXTENSION_PROMPT_ROLES.SYSTEM,
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
        return;
    }

    const promptText = String(settings.proseRulesPrompt ?? DEFAULT_PROSE_RULES_PROMPT);
    context.setExtensionPrompt(
        PROSE_RULES_PROMPT_KEY,
        promptText,
        EXTENSION_PROMPT_TYPES.IN_PROMPT,
        0,
        false,
        EXTENSION_PROMPT_ROLES.SYSTEM,
    );
}

function buildFinalNarrationPrompt(narratorContext) {
    const settings = getSettings();
    if (settings.proseRulesEnabled === false) return narratorContext;

    const reminder = String(settings.finalReminderPrompt ?? DEFAULT_FINAL_REMINDER_PROMPT).trim();
    if (!reminder) return narratorContext;

    return `${reminder}\n\n${narratorContext}`;
}

function clearRuntimePrompts() {
    const context = getContext();
    if (!context?.extensionPrompts) return;

    delete context.extensionPrompts[ENGINE_PROMPT_KEY];
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
        normalized[name] = normalizeTrackerEntry({
            ...value,
            persistenceTier: value?.persistenceTier || inferPersistenceTier(name),
        });
    }
    return normalized;
}

function buildDisplayTrackerSnapshot({ messageKey, pendingRun, report }) {
    const resolutionPacket = report?.finalNarrativeHandoff?.resolutionPacket || {};
    const trackerAfter = normalizeDisplayTrackerNpcs({
        ...(pendingRun?.trackerBefore || {}),
        ...(pendingRun?.trackerAfter || {}),
    });
    const runtimeUser = report?.trackerUpdate?.user || {};
    const user = normalizeTrackerUserState({
        ...(pendingRun?.userBefore || {}),
        ...(pendingRun?.userAfter || {}),
        ...runtimeUser,
    });
    const rawPresentNpcNames = uniqueNames([
        ...(pendingRun?.presentNpcNames || []),
        ...currentResolutionNpcNames(pendingRun?.resolutionPacket || resolutionPacket),
    ]);
    const promotionResult = applyExplicitNamePromotions(trackerAfter, rawPresentNpcNames, {
        messageKey,
        latestUserText: pendingRun?.latestUserText,
    });
    const presentNpcNames = applyDisplayPresenceCorrections(promotionResult.presentNames, Object.keys(promotionResult.npcs), pendingRun?.latestUserText);
    const displayNpcs = applyTrackerPresenceMetadata(promotionResult.npcs, presentNpcNames, {
        messageKey,
        latestUserText: pendingRun?.latestUserText,
    });
    return {
        version: TRACKER_DISPLAY_VERSION,
        messageKey,
        type: pendingRun?.type || 'normal',
        savedAt: Date.now(),
        presentNpcNames,
        userCoreStats: pendingRun?.userCoreStats || report?.semanticLedger?.engineContext?.userCoreStats || null,
        user,
        npcs: displayNpcs,
    };
}

function applyTrackerPresenceMetadata(npcs, presentNames, { messageKey, latestUserText } = {}) {
    const normalized = normalizeDisplayTrackerNpcs(npcs);
    const presentSet = new Set(toRealNameArray(presentNames).map(name => name.toLowerCase()));
    const explicitAbsentSet = getExplicitlyAbsentTrackerNames(latestUserText, Object.keys(normalized));
    const stamped = {};

    for (const [name, entry] of Object.entries(normalized)) {
        const key = name.toLowerCase();
        const previousPresence = entry.presence || 'Present';
        const isPresent = presentSet.has(key) && !explicitAbsentSet.has(key);
        const isExplicitlyAbsent = explicitAbsentSet.has(key);
        const presence = isPresent && !isExplicitlyAbsent ? 'Present' : 'Absent';

        stamped[name] = {
            ...entry,
            persistenceTier: entry.persistenceTier || inferPersistenceTier(name),
            lifecycle: entry.lifecycle || 'Active',
            presence,
            lastSeenMessageKey: presence === 'Present' ? messageKey || entry.lastSeenMessageKey || '' : entry.lastSeenMessageKey || '',
            absentSinceMessageKey: presence === 'Absent' && previousPresence !== 'Absent'
                ? messageKey || entry.absentSinceMessageKey || ''
                : entry.absentSinceMessageKey || '',
        };
    }

    return stamped;
}

function applyExplicitNamePromotions(npcs, presentNames, { messageKey, latestUserText } = {}) {
    const normalized = normalizeDisplayTrackerNpcs(npcs);
    let updatedPresentNames = toRealNameArray(presentNames);
    const promotions = getExplicitNamePromotions(latestUserText, Object.keys(normalized));

    for (const { oldName, newName } of promotions) {
        const oldEntry = normalized[oldName];
        const newEntry = normalized[newName];
        if (!oldEntry) continue;

        normalized[newName] = normalizeTrackerEntry({
            ...oldEntry,
            ...(newEntry || {}),
            persistenceTier: 'Recurring',
            presence: 'Present',
            lifecycle: 'Active',
            lastSeenMessageKey: messageKey || newEntry?.lastSeenMessageKey || oldEntry.lastSeenMessageKey || '',
            absentSinceMessageKey: '',
            retiredSinceMessageKey: '',
        });
        normalized[oldName] = normalizeTrackerEntry({
            ...oldEntry,
            presence: 'Absent',
            lifecycle: 'Retired',
            absentSinceMessageKey: oldEntry.absentSinceMessageKey || messageKey || '',
            retiredSinceMessageKey: messageKey || oldEntry.retiredSinceMessageKey || '',
        });
        updatedPresentNames = updatedPresentNames
            .filter(name => normalizeSearchText(name) !== normalizeSearchText(oldName))
            .concat(newName);
    }

    return {
        npcs: normalized,
        presentNames: [...new Set(updatedPresentNames)],
    };
}

function getExplicitNamePromotions(text, trackedNames) {
    const source = normalizeSearchText(text);
    const promotions = [];
    if (!source || !Array.isArray(trackedNames)) return promotions;

    for (const oldName of trackedNames) {
        if (inferPersistenceTier(oldName) !== 'Temporary') continue;
        const normalizedOldName = normalizeSearchText(oldName);
        if (!normalizedOldName || !source.includes(normalizedOldName)) continue;
        const escapedOldName = escapeRegExp(normalizedOldName);
        const patterns = [
            new RegExp(`\\b(?:same|that|the)\\s+${escapedOldName}\\b.{0,80}\\b(?:name is|named|called)\\s+([a-z][a-z'-]{1,30})\\b`, 'i'),
            new RegExp(`\\b${escapedOldName}\\b.{0,80}\\b(?:name is|named|called)\\s+([a-z][a-z'-]{1,30})\\b`, 'i'),
        ];
        for (const pattern of patterns) {
            const match = pattern.exec(source);
            if (!match?.[1]) continue;
            const newName = titleCaseName(match[1]);
            if (!newName || normalizeSearchText(newName) === normalizedOldName) continue;
            promotions.push({ oldName, newName });
            break;
        }
    }

    return promotions;
}

function titleCaseName(value) {
    return String(value ?? '')
        .trim()
        .split(/[\s-]+/)
        .filter(Boolean)
        .map(part => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
        .join(' ');
}

function buildTrackerUpdateForPersistence(displaySnapshot) {
    return {
        npcs: normalizeDisplayTrackerNpcs(displaySnapshot?.npcs || {}),
        user: normalizeTrackerUserState(displaySnapshot?.user || {}),
    };
}

function mergePostReplyTrackerDelta(snapshot, delta) {
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
    merged.npcs = npcs;
    merged.postReplyTracker = {
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
        condition: source.condition,
        wounds: [...source.wounds],
        statusEffects: [...source.statusEffects],
        gear: [...source.gear],
    };
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

function applyDisplayPresenceCorrections(presentNames, trackedNames, latestUserText) {
    const explicitlyAbsent = getExplicitlyAbsentTrackerNames(latestUserText, trackedNames);
    if (!explicitlyAbsent.size) return presentNames;
    return presentNames.filter(name => !explicitlyAbsent.has(name.toLowerCase()));
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

function inferPersistenceTier(name) {
    const text = String(name ?? '').trim();
    if (!text) return 'Temporary';
    if (/[#\d]/.test(text)) return 'Temporary';
    if (/\b(?:guard|soldier|bandit|raider|archer|thug|goblin|orc|ogre|cultist|mercenary|villager|patron|civilian|beast|wolf|zombie|skeleton|enemy|attacker|ambusher|scout|sentry|hunter|monster|creature|minion|mob)\b/i.test(text)) {
        return 'Temporary';
    }
    const words = text.split(/\s+/).filter(Boolean);
    if (words.length >= 2 && words.some(word => /^[A-Z][a-z]+/.test(word))) return 'Recurring';
    if (/^[A-Z][a-z]+$/.test(text)) return 'Recurring';
    return 'Temporary';
}

function getExplicitlyAbsentTrackerNames(text, trackedNames) {
    const source = normalizeSearchText(text);
    const absent = new Set();
    if (!source || !Array.isArray(trackedNames)) return absent;

    for (const name of trackedNames) {
        const normalizedName = normalizeSearchText(name);
        if (!normalizedName || !source.includes(normalizedName)) continue;
        if (hasExplicitAbsenceForName(source, normalizedName)) {
            absent.add(String(name).toLowerCase());
        }
    }

    return absent;
}

function hasExplicitAbsenceForName(text, name) {
    const index = text.indexOf(name);
    if (index < 0) return false;

    const window = text.slice(Math.max(0, index - 180), Math.min(text.length, index + name.length + 240));
    if (hasPreventedDepartureForName(window, name)) return false;
    const departureIndex = getExplicitDepartureIndex(window);
    if (departureIndex < 0) return false;
    const presenceIndex = getExplicitPresenceIndex(window, name);
    return presenceIndex < 0 || presenceIndex < departureIndex;
}

function hasPreventedDepartureForName(window, name) {
    const escapedName = escapeRegExp(name);
    const patterns = [
        new RegExp(`\\b(?:catch|catches|caught|grab|grabs|grabbed|hold|holds|held|stop|stops|stopped|block|blocks|blocked|prevent|prevents|prevented)\\b.{0,100}\\b${escapedName}\\b.{0,140}\\b(?:before|from)\\b.{0,80}\\b(?:walk|leave|go|run|depart|exit|move)\\b.{0,30}\\b(?:away|out|off|leaving)?\\b`),
        new RegExp(`\\b${escapedName}\\b.{0,140}\\b(?:catch|catches|caught|grab|grabs|grabbed|hold|holds|held|stop|stops|stopped|block|blocks|blocked|prevent|prevents|prevented)\\b.{0,140}\\b(?:before|from)\\b.{0,80}\\b(?:walk|leave|go|run|depart|exit|move)\\b.{0,30}\\b(?:away|out|off|leaving)?\\b`),
        new RegExp(`\\b(?:before|from)\\b.{0,80}\\b${escapedName}\\b.{0,120}\\b(?:walk|leave|go|run|depart|exit|move)\\b.{0,30}\\b(?:away|out|off|leaving)?\\b`),
    ];
    return patterns.some(pattern => pattern.test(window));
}

function hasExplicitPresenceForName(window, name) {
    return getExplicitPresenceIndex(window, name) >= 0;
}

function getExplicitPresenceIndex(window, name) {
    const escapedName = escapeRegExp(name);
    const patterns = [
        new RegExp(`\\b${escapedName}\\b.{0,80}\\b(?:remain|remains|stays|stay|stayed|standing|stands|waits|beside|with me|near me|still here|still present)\\b`),
        new RegExp(`\\b(?:remain|remains|stays|stay|stayed|standing|stands|waits|beside|with me|near me|still here|still present)\\b.{0,80}\\b${escapedName}\\b`),
    ];
    return firstPatternIndex(window, patterns);
}

function getExplicitDepartureIndex(window) {
    return firstPatternIndex(window, [
        /\b(?:no longer|not|not anymore)\s+(?:in\s+)?sight\b/,
        /\bout of sight\b/,
        /\bno longer visible\b/,
        /\b(?:leave|leaves|left|leaving|depart|departs|departed|departing|exit|exits|exited|exiting)\b.{0,120}\b(?:room|office|hall|alley|street|scene|area|place|building|shop|tavern|camp|hideout|chamber|archive|gate|courtyard|square|market|road|clearing|woods|forest|cave|tunnel|vault)\b/,
        /\b(?:leave|leaves|left|leaving|depart|departs|departed|departing|exit|exits|exited|exiting)\b.{0,160}\b(?:i|we|me)\s+(?:am|are|remain|remains|remained|stay|stays|stayed)\s+alone\b/,
        /\b(?:leave|left|leaving|walk|walking|walked|go|going|went|move|moving|moved|head|heading|headed|depart|departing|departed|exit|exiting|exited|turn|turning|turned)\b.{0,160}\b(?:behind|away)\b/,
        /\b(?:behind|away)\b.{0,160}\b(?:leave|left|leaving|walk|walking|walked|go|going|went|move|moving|moved|head|heading|headed|depart|departing|departed|exit|exiting|exited|turn|turning|turned)\b/,
    ]);
}

function firstPatternIndex(text, patterns) {
    let first = -1;
    for (const pattern of patterns) {
        const match = pattern.exec(text);
        if (!match) continue;
        if (first < 0 || match.index < first) first = match.index;
    }
    return first;
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
    root.npcs = normalizeDisplayTrackerNpcs(snapshot.npcs);
    root.user = normalizeTrackerUserState(snapshot.user || root.user || {});
    return true;
}

function restoreTrackerFromMessageDisplaySnapshot(messageId, context = getContext()) {
    const root = getTrackerRoot(context);
    const message = context?.chat?.[messageId];
    const snapshot = getMessageTrackerDisplaySnapshot(message);
    if (!root || !snapshot?.npcs) return false;
    root.npcs = normalizeDisplayTrackerNpcs(snapshot.npcs);
    root.user = normalizeTrackerUserState(snapshot.user || root.user || {});
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

function trackerListLine(label, items) {
    const list = Array.isArray(items) ? items.filter(Boolean) : [];
    return list.length ? `<div>${escapeHtml(label)} <code>${escapeHtml(formatTrackerList(list))}</code></div>` : '';
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
    const present = names.filter(name => npcs[name]?.presence !== 'Absent' && npcs[name]?.lifecycle === 'Active');
    const userCore = snapshot?.userCoreStats;
    const user = normalizeTrackerUserState(snapshot?.user || {});

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
                <div><code>${escapeHtml(formatDisposition(disposition))}</code> | Lock <code>${escapeHtml(classified.lock)}</code> | Behavior <code>${escapeHtml(classified.behavior)}</code></div>
                <div>Rapport <code>${escapeHtml(entry.currentRapport)}/5</code> | Gate <code>${escapeHtml(entry.intimacyGate)}</code></div>
                <div>Stats <code>${escapeHtml(formatCoreStats(entry.currentCoreStats))}</code></div>
                ${trackerListLine('Wounds', entry.wounds)}
                ${trackerListLine('Status', entry.statusEffects)}
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
        <details class="${TRACKER_DISPLAY_BLOCK_CLASS}">
            <summary>Tracker</summary>
            <div class="structured-preflight-tracker-body">
                <div class="structured-preflight-tracker-title">NPCs</div>
                ${renderSection('Present', present)}
                <div class="structured-preflight-tracker-title">Player</div>
                <div>Stats <code>${escapeHtml(formatCoreStats(userCore))}</code></div>
                <div>Condition <code>${escapeHtml(formatTrackerCondition(user.condition))}</code></div>
                ${trackerListLine('Wounds', user.wounds)}
                ${trackerListLine('Status', user.statusEffects)}
                ${trackerListLine('Gear', user.gear)}
                ${trackerListLine('Inventory', user.inventory)}
                ${trackerListLine('Tasks', user.tasks)}
                ${trackerListLine('Commitments', user.commitments)}
            </div>
        </details>`;
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
            gap: 0.55rem;
        }
        .structured-preflight-tracker-title,
        .structured-preflight-tracker-heading,
        .structured-preflight-tracker-name {
            font-weight: 600;
        }
        .structured-preflight-tracker-section {
            display: grid;
            gap: 0.35rem;
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
    const message = context?.chat?.[messageId];
    const trackerSnapshot = snapshot || getMessageTrackerDisplaySnapshot(message);
    if (typeof document === 'undefined') return;

    const messageElement = document.querySelector(`#chat .mes[mesid="${messageId}"]`);
    if (!messageElement) return;

    messageElement.querySelector(`.${TRACKER_DISPLAY_BLOCK_CLASS}`)?.remove();
    if (!trackerSnapshot?.npcs) return;

    ensureTrackerDisplayStyles();
    const textElement = messageElement.querySelector('.mes_text');
    if (!textElement) return;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = buildTrackerDisplayHtml(trackerSnapshot).trim();
    const block = wrapper.firstElementChild;
    if (!block) return;

    const mediaWrapper = messageElement.querySelector('.mes_media_wrapper');
    if (mediaWrapper) {
        mediaWrapper.before(block);
    } else {
        textElement.after(block);
    }
}

function renderAllTrackerDisplayBlocks(context = getContext()) {
    if (!Array.isArray(context?.chat)) return;
    context.chat.forEach((message, index) => {
        if (!message?.is_user) {
            renderNarratorHandoffBlockForMessage(index, null, context);
            renderTrackerDisplayBlockForMessage(index, null, context);
        }
    });
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
    const text = String(raw || '');
    const fields = {};
    for (const line of text.split(/\r?\n/)) {
        const match = line.match(/^\s*([A-Za-z]+)\s*=\s*(.*?)\s*$/);
        if (match) fields[match[1]] = match[2];
    }
    const primary = String(fields.PrimaryStat || '').trim().toUpperCase();
    if (!PLAYER_STATS.includes(primary)) {
        throw new Error(`Persona analysis did not return a valid PrimaryStat. Raw response: ${text.slice(0, 240)}`);
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
    const text = String(raw || '')
        .replace(/^```(?:markdown|md|text)?\s*/i, '')
        .replace(/```\s*$/i, '')
        .trim();
    if (!text) throw new Error('Character sheet generation returned empty text.');
    return text;
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

function getLatestReportPresentNpcNames(report) {
    return currentResolutionNpcNames(report?.finalNarrativeHandoff?.resolutionPacket || {});
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

    const tagged = original.match(/BEGIN_FINAL_NARRATION\s*([\s\S]*?)\s*END_FINAL_NARRATION/i);
    const source = tagged ? tagged[1].trim() : stripNarratorMetaPrefix(original);
    const cleaned = stripVisibleMechanicsLabels(stripStructuredArtifacts(source)).trim();
    return cleaned || original;
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
            || /^(The user|User Action|Decisive Action|Roll Used|Outcome|Outcome Meaning|Margin|Landed Actions|Result|Action Count|Stakes|Intimacy Consent|Consent Gate|Targets|Counter Potential|NPC State|Relationship Result|Chaos|Proactivity|Aggression|Aggression Guide|GUIDE|BINDING_NARRATION_DIRECTIVE|MODEL_INSTRUCTION|PROMPT|STORY_ENGINE_NARRATOR_DIRECTIVE|PRIVATE_MECHANICS_AUDIT)\b/i.test(line)
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
        root.npcs = normalizeDisplayTrackerNpcs(snapshot);
        root.user = normalizeTrackerUserState(root.snapshots?.[getMessageKey(targetMessageId, context)]?.beforeUser || root.user || {});
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
    state.processingPostReplyTracker = true;

    try {
        message.extra = message.extra || {};

        const currentText = String(message.mes ?? '');
        const displayText = message.extra.display_text == null ? null : String(message.extra.display_text);
        const visibleText = stripComputedDebugPrefix(displayText ?? currentText);
        const narrationText = sanitizeAssistantNarration(visibleText);
        const narratorHandoff = state.lastNarratorHandoff;
        const pendingRun = state.pendingRun;
        let postReplyTrackerWarning = null;

        const root = getTrackerRoot(context);
        if (root && pendingRun) {
            let trackerDisplaySnapshot = buildDisplayTrackerSnapshot({
                messageKey,
                pendingRun,
                report: pendingRun.report,
            });
            try {
                const postReplyDelta = await withSemanticGenerationSettings(async settings => {
                    const previousBypassPromptReady = state.bypassPromptReady;
                    state.bypassPromptReady = true;
                    if (!settings?.semanticProfileId) {
                        addEphemeralStoppingString(POST_REPLY_TRACKER_STOP_SENTINEL);
                    }
                    try {
                        return await extractPostReplyTrackerDelta(
                            context,
                            narrationText,
                            trackerDisplaySnapshot,
                            {
                                disableSemanticThinking: settings?.disableSemanticThinking !== false,
                                semanticProfileId: settings?.semanticProfileId,
                                semanticProfileName: settings?.semanticProfileName,
                                semanticPreset: settings?.semanticPreset,
                                latestUserText: pendingRun.latestUserText,
                            },
                        );
                    } finally {
                        if (!settings?.semanticProfileId) {
                            flushEphemeralStoppingStrings();
                        }
                        state.bypassPromptReady = previousBypassPromptReady;
                    }
                });
                trackerDisplaySnapshot = mergePostReplyTrackerDelta(trackerDisplaySnapshot, postReplyDelta);
            } catch (error) {
                postReplyTrackerWarning = error instanceof Error ? error.message : String(error);
                console.warn(`[${EXTENSION_NAME}] post-reply tracker pass failed; keeping pre-reply tracker snapshot.`, error);
            }
            await saveTrackerUpdate(context, buildTrackerUpdateForPersistence(trackerDisplaySnapshot), { save: false });
            root.snapshots[messageKey] = {
                before: clone(pendingRun.trackerBefore),
                beforeUser: clone(pendingRun.userBefore),
                after: clone(trackerDisplaySnapshot.npcs),
                afterUser: clone(trackerDisplaySnapshot.user),
                display: clone(trackerDisplaySnapshot),
                type: pendingRun.type,
                postReplyTrackerWarning,
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

        if (typeof context.saveChat === 'function') {
            await context.saveChat();
        } else {
            await persistMetadata(context);
        }

        clearRuntimePrompts();
        state.chatSignature = captureChatSignature(context);
    } finally {
        state.processingPostReplyTracker = false;
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
    const context = getContext();
    injectWritingStylePrompt();
    injectProseRulesPrompt();
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

    if (state.pendingRun && !state.processingPostReplyTracker && !state.pendingRunCleanupTimer) {
        state.pendingRunCleanupTimer = setTimeout(() => {
            state.pendingRunCleanupTimer = null;
            if (state.processingPostReplyTracker) return;
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
    injectWritingStylePrompt();
    injectProseRulesPrompt();

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
            presentNpcNames: getLatestReportPresentNpcNames(report),
            userCoreStats: report.semanticLedger?.engineContext?.userCoreStats || null,
            latestUserText: getLatestUserText(eventData.chat),
            report,
        };
        state.lastNarratorHandoff = narratorContext;

        sanitizeFinalPromptHistory(eventData.chat);
        appendEngineSentinelToPrompt(eventData.chat);
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
            semanticPreset: settings?.semanticPreset,
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

function appendEngineSentinelToPrompt(chat) {
    chat.push({
        role: 'system',
        content: ENGINE_RUNTIME_SENTINEL,
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
    if (context?.extensionPrompts) {
        delete context.extensionPrompts[ENGINE_PROMPT_KEY];
        delete context.extensionPrompts[NARRATOR_PROMPT_KEY];
        delete context.extensionPrompts[WRITING_STYLE_PROMPT_KEY];
        delete context.extensionPrompts[PROSE_RULES_PROMPT_KEY];
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
if (typeof jQuery === 'function') {
    jQuery(() => {
        renderSettingsPanel();
        injectWritingStylePrompt();
        injectProseRulesPrompt();
        setTimeout(() => {
            getPlayerRoot();
            restoreTrackerFromLatestDisplaySnapshot();
            migrateVisibleHandoffDisplays();
            renderAllTrackerDisplayBlocks();
            renderPlayerSetupCard();
        }, 0);
    });
} else {
    renderSettingsPanel();
    injectWritingStylePrompt();
    injectProseRulesPrompt();
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
