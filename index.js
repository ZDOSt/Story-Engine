import { ENGINE_PROMPT_TEXT, applyBoundCompanionDelta, applyPendingBoundaryDelta, boundCompanionDeltaHasChanges, classifyDisposition, finalizeLootSearchCompletion, findTrackerEntryName, normalizeBoundCompanionState, normalizeNpcCapabilityField, normalizePendingBoundaryState, normalizeTrackerEntry, normalizeTrackerUserState, pendingBoundaryDeltaHasChanges, reconcileLootPossessionTransfers, reconcileUserEquipmentTiers, sanitizeAggressionResultsForTrackerModel, sanitizeTrackerUserStateForModel } from './engines.js';

import {
    applyConnectionProfileName,
    canGenerate,
    canSubscribeToEvent,
    clearNotification,
    extension_settings,
    generate as generateSillyTavern,
    generateRawData,
    getActiveConnectionProfileName,
    getActiveUserAvatar,
    getConnectionProfileByName,
    getConnectionProfileNames,
    getPersonaText,
    getUserName,
    notifyError,
    notifyInfo,
    notifySuccess,
    offEvent,
    onEvent,
    onDomReady,
    persistMetadata as persistAdapterMetadata,
    readActiveConnectionProfileName,
    saveChat,
    saveMetadataDebounced,
    saveSettingsDebounced,
    sendDefaultChatCompletionToolRequest,
    stopGeneration,
    writePersonaDescription,
} from './st-adapter.js';
import { buildIsekaiOpeningSeed, formatAdventureIntroNarratorModelPromptContext, formatAdventureIntroNarratorPromptContext, formatNarratorModelPromptContext, formatNarratorPromptContext } from './pre-flight.js';
import { assertValidCharacterSheet } from './character-sheet-validation.js';
import { appendCharacterSheetOutputInstruction, buildAbilityGenerationRules, buildCharacterSheetJsonSchema, buildCharacterSheetTool, buildCharacterSheetToolChoice, buildSpellGenerationRules, describeCharacterSheetRaw, extractCharacterSheetToolPayload, getCharacterSheetPowerProfile, normalizeCharacterSheetPayload, parseCharacterSheetJsonPayload, renderCharacterSheet, shouldRetryCharacterSheetToolFailure } from './character-sheet-generation.js';
import { createAsyncTokenGate } from './ephemeral-stop-controller.js';
import { SEMANTIC_OUTPUT_MODES, annotateSemanticDiagnosticError, applyStoryEngineBaselineThinkingDisabledPayload, extractGeneratedText, extractSemanticLedger, getPersonaIdentityHints, normalizeSemanticOutputMode, parseNarratorTrackerDelta, reportSemanticDiagnostic, sendStructuredToolRequest } from './semantic-extractor.js';
import { buildAdventureIntroNameGeneration, buildBoundCompanionSnapshot, buildDescriptiveArchiveSnapshot, buildEconomySnapshot, buildLatentFavorSnapshot, buildLatentGrievanceSnapshot, buildPendingBoundarySnapshot, buildPlayerTrackerSnapshot, buildPowerActorSnapshot, buildSceneItemStateSnapshot, buildSpellCastingSnapshot, buildTrackerSnapshot, buildUserKnowledgeSnapshot, buildUserReputationSnapshot, buildWorldProgressionSnapshot, buildWorldStateSnapshot, consumeLatentFavorById, latentFavorIds, latentGrievanceIds, mergeLatentGrievanceArchive, mergeUserKnowledgeLedger, mergeUserReputationLedger, normalizeLatentFavors, normalizeLatentGrievances, normalizeRapportClockState, normalizeSpellCastingState, pruneLatentFavorArchive, renameLatentFavorTargets, renameLatentGrievanceTargets, resolveLatentFavorIds, resolveLatentGrievanceIds, runDeterministicEngines, saveTrackerUpdate, verifyLatentFavorPresentation } from './deterministic-runner.js';
import {
    applyProgressionHealthMilestone,
    cloneHiddenHealth,
    normalizeHiddenHealth,
    renameHiddenHealthNpc,
} from './health-state.js';
import { applyContextualInjuryCapsToTrackerDelta, collectContextualInjuryCaps } from './tracker-injury-caps.js';
import { deterministicPersonalitySummaryForName, stripPersonalityMannerismFields, TRACKER_DELTA_CONTRACT, TRACKER_DELTA_TEMPLATE } from './tracker-delta-contract.js';
import {
    STREAMING_ARTIFACT_REGEX_SCRIPT_ID,
    STREAMING_ARTIFACT_REGEX_SCRIPT_NAME,
    STREAMING_ARTIFACT_REGEX_PATTERN,
    buildStreamingArtifactRegexScript,
} from './streaming-artifact-regex.js';
import { getExplicitNamePromotions, isPromotableTrackerName } from './tracker-name-promotions.js';
import { sanitizeAssistantNarration, stripComputedDebugPrefix, stripNarratorMetaPrefix, stripStructuredArtifacts } from './narration-sanitizer.js';
import { applyProseGuardSentenceRepairs, collectProseGuardSentenceFindings, parseProseGuardRepairPayload, PROSE_GUARD_EDITS_END, PROSE_GUARD_EDITS_START, PROSE_GUARD_REPAIR_BATCH_SIZE, removeProseGuardPhraseLines } from './prose-guard-edits.js';
import { applyWorldStateDelta, formatWorldStateForDisplay, normalizeWorldState, removeAlreadyProjectedWorldStateDelta } from './world-state.js';
import { advanceDueWorldPlans, applyWorldMemoryDelta, applyWorldMemoryPatch, buildWorldMemoryUpdateContext, createWorldMemoryPatch, normalizeDescriptiveArchive, normalizeWorldMemoryState, normalizeWorldProgression, parseWorldMemoryDelta, prepareWorldMemoryNarration, WORLD_MEMORY_DELTA_CONTRACT, WORLD_MEMORY_DELTA_TEMPLATE } from './world-memory.js';
import { applyCurrencyDelta, applyEconomyDelta, getNpcLootRankProfile, mergePendingPricePaymentCurrencyRemove, normalizeCurrencyList, normalizeEconomyState, normalizeEquipmentTierAssignments, renderEconomyTrackerContext } from './economy.js';
import { normalizeSceneItemState, reconcilePostNarrationPossessionDelta, sceneItemStateForModel } from './scene-item-state.js';
import {
    PROGRESSION_ABSOLUTE_SPELL_CAP,
    PROGRESSION_BREAKTHROUGH_SACRIFICE,
    PROGRESSION_BREAKTHROUGH_STAT_CAP,
    PROGRESSION_NORMAL_STAT_CAP,
    applyBreakthroughStatChange,
    breakthroughSacrificeReason,
    normalizeBreakthroughStat,
    spellCapacityForMnd,
} from './progression-rules.js';


const EXTENSION_NAME = 'Story Engine';
const SETTINGS_KEY = 'structuredPreflightEngines';
const SETTINGS_CONTAINER_ID = 'structured_preflight_settings_container';
const SETTINGS_STYLE_ID = 'structured_preflight_settings_styles';
const NARRATOR_PROMPT_KEY = 'structured_preflight_narrator_context';
const NARRATOR_PROMPT_MARKER_PREFIX = 'STORY_ENGINE_NARRATOR_HANDOFF';
const WRITING_STYLE_PROMPT_KEY = 'structured_preflight_30_scene_style';

const PROSE_RULES_PROMPT_KEY = 'structured_preflight_20_prose_rules';

const LEGACY_FINAL_REMINDER_PROMPT_KEY = 'structured_preflight_30_final_reminder';

const LEGACY_ORDERED_WRITING_STYLE_PROMPT_KEY = 'structured_preflight_10_writing_style';

const LEGACY_WRITING_STYLE_PROMPT_KEY = 'structured_preflight_writing_style';

const LEGACY_PROSE_RULES_PROMPT_KEY = 'structured_preflight_prose_rules';
const PROFILE_NONE = '<None>';
const TRACKER_DISPLAY_EXTRA_KEY = 'structured_preflight_tracker_display';
const PROGRESSION_SWIPE_EXTRA_KEY = 'structured_preflight_progression_swipe';
const WORLD_MEMORY_SWIPE_EXTRA_KEY = 'structured_preflight_world_memory_swipe';
const TRACKER_DISPLAY_BLOCK_CLASS = 'structured-preflight-tracker-block';

const TRACKER_DISPLAY_VERSION = 1;
const PROGRESSION_SWIPE_VERSION = 1;
const WORLD_MEMORY_SWIPE_VERSION = 2;
const TRACKER_ROOT_SNAPSHOT_LIMIT = 120;

const TRACKER_VISIBLE_INACTIVE_LIMIT = 2;

const TRACKER_WIDGET_ID = 'structured_preflight_tracker_widget';

const TRACKER_WIDGET_BUTTON_ID = 'structured_preflight_tracker_toggle';

const TRACKER_WIDGET_PANEL_ID = 'structured_preflight_tracker_panel';
const TRACKER_WIDGET_BUTTON_SIZE = 36;
const TRACKER_WIDGET_DEFAULT_WIDTH = 450;
const TRACKER_WIDGET_MIN_WIDTH = 280;
const TRACKER_WIDGET_DEFAULT_HEIGHT = 550;
const TRACKER_WIDGET_MIN_HEIGHT = 420;
const TRACKER_WIDGET_PANEL_PREFERRED_SIDES = Object.freeze({
    TRACKER: 'left',
    NARRATOR_HANDOFF: 'right',
});
const TRACKER_WIDGET_LAYOUT_MIGRATION_VERSION = 2;
const STORY_ENGINE_TOP_BAR_SCREEN_SELECTORS = Object.freeze([
    '.drawer-content.openDrawer',
    '.drawer-content.open',
    '.fillLeft.openDrawer',
    '.fillRight.openDrawer',
    '#character_popup',
    '#shadow_character_popup',
    '#options',
    '#extensionsMenu',
    '.popup .popper-modal',
    '#WorldInfo',
    '#floatingPrompt',
]);
const NARRATOR_HANDOFF_EXTRA_KEY = 'structured_preflight_narrator_handoff';
const NARRATOR_HANDOFF_BLOCK_CLASS = 'structured-preflight-narrator-handoff-block';
const NARRATOR_HANDOFF_VERSION = 1;
const NARRATOR_HANDOFF_DISPLAY_MODES = Object.freeze({
    IN_CHAT: 'in_chat',
    SIDE_PANEL: 'side_panel',
});
const NARRATOR_HANDOFF_WIDGET_ID = 'structured_preflight_narrator_handoff_widget';
const NARRATOR_HANDOFF_WIDGET_BUTTON_ID = 'structured_preflight_narrator_handoff_toggle';
const NARRATOR_HANDOFF_WIDGET_PANEL_ID = 'structured_preflight_narrator_handoff_panel';
const NARRATOR_HANDOFF_WIDGET_LAYOUT_MIGRATION_VERSION = 1;
const PROSE_GUARD_EXTRA_KEY = 'structured_preflight_prose_guard';
const PROSE_GUARD_EXTRA_VERSION = 4;
const PROSE_GUARD_RECONCILIATION_EXTRA_KEY = 'structured_preflight_prose_guard_reconciliation';
const PROSE_GUARD_RECONCILIATION_EXTRA_VERSION = 1;
const PROSE_GUARD_MODES = Object.freeze({
    OFF: 'off',
    REVIEW: 'review',
    AUTOMATIC: 'automatic',
});
const PROSE_GUARD_DISPLAY_STYLE_ID = 'structured_preflight_prose_guard_display_styles';
const PROSE_GUARD_EXPECTED_STYLE_ID = 'structured_preflight_prose_guard_expected_styles';
const PROSE_GUARD_HIDDEN_MESSAGE_CLASS = 'structured-preflight-proseguard-hidden-message';
const PROSE_GUARD_DEFER_MS = 0;
const PROSE_GUARD_TIMEOUT_MS = 90000;
const PROSE_GUARD_MAX_REPAIR_ATTEMPTS = 2;
const PROSE_GUARD_TOOL_NAME = 'submit_prose_guard_edits';
const PROSE_GUARD_SETTINGS_MIGRATION_VERSION = 2;
const PROSE_GUARD_MOVED_BANNED_PHRASES = Object.freeze(['barely above a whisper', 'barely above a breath']);
const TRACKER_DELTA_TOOL_NAME = 'submit_tracker_delta';
const PLAYER_SETUP_KEY = 'structuredPreflightPlayer';
const PLAYER_SETUP_VERSION = 1;
const PLAYER_SETUP_CARD_ID = 'structured_preflight_player_setup_card';
const PLAYER_SETUP_STYLE_ID = 'structured_preflight_player_setup_styles';
const PROGRESSION_KEY = 'structuredPreflightProgression';
const PERSONA_METADATA_TRANSACTION_KEYS = Object.freeze([
    PLAYER_SETUP_KEY,
    PROGRESSION_KEY,
    'structuredPreflightTracker',
]);
const PROGRESSION_VERSION = 2;
const PROGRESSION_CARD_ID = 'structured_preflight_progression_card';
const PROGRESSION_STYLE_ID = 'structured_preflight_progression_styles';
const PROGRESSION_MILESTONE_XP = 100;
const PROGRESSION_RECORD_HISTORY_LIMIT = 48;
const PROGRESSION_CONTEXT_RECORD_LIMIT = 8;
const PROGRESSION_XP_AWARDS = Object.freeze({
    Minor_Success: 10,
    Moderate_Success: 20,
    Critical_Success: 30,
    Success: 10,
});
const PROGRESSION_REQUIRED_ABILITIES = 1;
const PROGRESSION_MAX_STAT = PROGRESSION_NORMAL_STAT_CAP;
const PROGRESSION_MAX_BREAKTHROUGH_STAT = PROGRESSION_BREAKTHROUGH_STAT_CAP;
const PROGRESSION_ABILITY_OPTIONS = 3;
const PROGRESSION_SPELL_OPTIONS = 3;
const PROGRESSION_MAX_SPELLS = PROGRESSION_ABSOLUTE_SPELL_CAP;
const PLAYER_CREATION_MAX_STARTING_SPELLS = 1;
const PLAYER_STATS = Object.freeze(['PHY', 'MND', 'CHA']);
const PLAYER_CREATION_STAT_POINTS = 18;
const PLAYER_CREATION_MIN_STAT = 1;
const PLAYER_CREATION_MAX_STAT = 7;
const PLAYER_RACE_CHOICES = Object.freeze([
    'Aasimar',
    'Angelkin',
    'Arachne',
    'Automaton',
    'Bearkin',
    'Catfolk',
    'Centaur',
    'Demon',
    'Dhampir',
    'Dragonkin',
    'Dryad',
    'Dwarf',
    'Elf',
    'Fae',
    'Fairy',
    'Foxkin',
    'Gnome',
    'Goblin',
    'Half-Demon',
    'Half-Elf',
    'Half-Orc',
    'Halfling',
    'Harpy',
    'Hobgoblin',
    'Homunculus',
    'Human',
    'Hybrid',
    'Kobold',
    'Lamian',
    'Lizardfolk',
    'Merfolk',
    'Minotaur',
    'Mushroomfolk',
    'Naga',
    'Oni',
    'Orc',
    'Rabbitfolk',
    'Revenant',
    'Satyr',
    'Slimekin',
    'Spirit-Touched',
    'Tiefling',
    'Undead',
    'Vampire',
    'Werewolf',
    'Wolfkin',
]);
const PLAYER_GENRE_CHOICES = Object.freeze([
    'Fantasy',
    'Sci-fi',
    'Modern',
    'Slice of Life',
    'Isekai',
    'Urban Fantasy',
    'Cyberpunk',
    'Post-Apocalyptic',
    'Horror',
    'Supernatural',
    'Superhero',
    'Steampunk',
    'Historical',
    'Wuxia / Xianxia',
]);
const PLAYER_ADVENTURE_GENRE_FRAMES = Object.freeze({
    Fantasy: 'Genre flavor: show fantasy through magic, myth, wilderness, old ruins, factions, faith, monsters, danger, opportunity, or social context when scene-valid.',
    'Sci-fi': 'Genre flavor: show science fiction through technology, alien or future context, artificial intelligence, institutions, exploration, technical danger, or social systems when scene-valid.',
    Modern: 'Genre flavor: show a contemporary or near-real-world setting through ordinary technology, public life, work, school, travel, money, crime, family, community, or social pressure when scene-valid.',
    'Slice of Life': 'Genre flavor: show slice of life through routine pressure, social contact, obligation, inconvenience, interruption, opportunity, awkwardness, small conflict, or everyday detail when scene-valid.',
    Isekai: 'Genre flavor: show anime isekai through progression, guilds, ranks, skills, dungeons, factions, companions, social consequences, danger, comedy, wonder, romance tension, strange races, and powerful beings when scene-valid.',
    'Urban Fantasy': 'Genre flavor: show urban fantasy through ordinary life and supernatural pressure occupying the same scene: magic, creatures, curses, occult politics, hidden societies, paranormal intrusion, or public-world friction when scene-valid.',
    Cyberpunk: 'Genre flavor: show cyberpunk through technology, surveillance, corporate power, street life, debt, crime, body modification, data, machinery, social inequality, danger, or opportunity when scene-valid.',
    'Post-Apocalyptic': 'Genre flavor: show life after collapse through scarcity, shelter, ruined infrastructure, fragile communities, weather exposure, failing supplies, distant threat, or moral pressure when scene-valid.',
    Horror: 'Genre flavor: show horror through visible wrongness, damage, sound, absence, distance, blocked access, strange behavior, darkness, threat, or mystery when scene-valid.',
    Supernatural: 'Genre flavor: show the supernatural through spirits, hauntings, curses, omens, possession, occult evidence, strange powers, liminal places, unseen forces, or mortal consequences when scene-valid.',
    Superhero: 'Genre flavor: show superhero fiction through powers, public danger, secrecy, reputation, law, media, villains, institutions, bystanders, collateral risk, or civic pressure when scene-valid. Do not narrate {{user}} using powers unless {{user}} chooses to.',
    Steampunk: 'Genre flavor: show steampunk through steam industry, brass machinery, smoke, class, empire, invention, mechanical danger, expedition pressure, or social hierarchy when scene-valid.',
    Historical: 'Genre flavor: show a plausible historical or historically inspired setting through tools, law, custom, class, labor, travel, conflict, technology limits, public life, or social obligation when scene-valid.',
    'Wuxia / Xianxia': 'Genre flavor: show martial or cultivation fiction through honor, danger, rivalry, spiritual pressure, sect or clan influence, debt, beasts, duels, cultivation, immortal politics, or mythic stakes when scene-valid.',
});
const PLAYER_ADVENTURE_OPENING_CONTRACT = String.raw`OPENING CONTRACT:
Keep the opening short: 150-200 words.

Narrate ONLY what surrounds {{user}}.
Narrate ONLY what {{user}} can perceive externally.

Do NOT narrate:
{{user}}'s body, features, clothing, equipment, inventory, abilities, actions, reactions, thoughts, feelings, memories, decisions, or self-inspection.
{{user}} actions such as "you push yourself up" or "you open your eyes."

Do not summarize the character sheet, biography, skills, past, goals, personality, inventory, powers, or private history.

Do not explain the world. Do not summarize lore. Let the scene imply the genre.

End at the first concrete moment where {{user}} can act.`;

const PLAYER_ADVENTURE_START_REMINDER = String.raw`START ADVENTURE REMINDER:
Begin the selected-genre opening scene now. Do not explain the setup, instructions, process, or reasoning.

Do NOT choose a different genre, premise, or opening setup.

If NAME REVEAL is present, follow it strictly: do NOT reveal new names unless gated by NAME REVEAL; when a name is revealed, use only the listed generated names.

Do not narrate {{user}}'s body, features, clothing, equipment, inventory, abilities, actions, reactions, thoughts, feelings, memories, decisions, or self-inspection. Do not narrate {{user}} actions such as "you push yourself up" or "you open your eyes."`;

const PLAYER_ISEKAI_ADVENTURE_START_REMINDER = String.raw`START ADVENTURE REMINDER:
Begin the Earth last moment, then continue directly into the Isekai opening. Do not explain the setup, instructions, process, or reasoning.

Do NOT skip the required isekai beats. Do NOT choose a different Earth last moment or Isekai opening.

If NAME REVEAL is present, follow it strictly: do NOT reveal new names unless gated by NAME REVEAL; when a name is revealed, use only the listed generated names.

Do not narrate {{user}}'s body, features, clothing, equipment, inventory, abilities, actions, reactions, thoughts, feelings, memories, decisions, or self-inspection. Do not narrate {{user}} actions such as "you push yourself up" or "you open your eyes."`;
const PLAYER_SETUP_ANALYSIS_RESPONSE_LENGTH = 900;
const PLAYER_SETUP_SHEET_RESPONSE_LENGTH = 3600;
const NAME_STYLE_OPTIONS = Object.freeze([
    'Balanced Fantasy',
    'Modern',
    'Tolkienic / Lyrical',
    'Celtic-Inspired Fantasy',
    'Norse / Old Germanic Fantasy',
    'Persian / Byzantine Fantasy',

    'Slavic-Inspired Fantasy',

    'Classical / Romance Fantasy',

    'Dark Low Fantasy',

]);

const DEFAULT_EXPLORATION_STYLE_PROMPT = String.raw`During exploration, arrival, travel, investigation, observation, or location discovery, narrate a vivid, detailed image for {{user}}.

Describe the space, boundaries, distance, available routes, meaningful obstacles, and what can be seen from {{user}}'s position. Then develop the scene through carefully chosen sensory details: light, the texture of surfaces, weather, temperature, sound, smell, movement, and signs of use or damage.

Give very special attention to details that make the world feel alive and lived-in: what people are wearing, including specific details, tools, weapons, posture, trade signs, worn surfaces, broken objects, mud, blood, smoke, crowd movement, and how people respond. Let details emerge through {{user}}'s attention and movement rather than presenting them as a checklist.

Combine related observations into flowing paragraphs, vary sentence rhythm, and make every location feel specific, inhabited, and physically coherent. Always choose a few precise, evocative details that paint a vivid image over a long inventory of generic description.`;

const DEFAULT_ACTION_STYLE_PROMPT = String.raw`During combat, pursuit, restraint, escape, danger, magical impact, or urgent physical action, make the prose direct, spatial, kinetic, and visceral. Keep the reader inside the movement: show where each body is, how distance and balance change, what reaches its target, and how each action affects the next moment.

Make every exchange feel physically real and carefully choreographed. Let force reveal itself through concrete detail: sparks scattering from clashing metal, wood splintering under impact, grit kicking beneath a shifting foot, breath breaking, steel ringing, a shoulder twisting with effort, or a body recoiling from contact. Use these details selectively, when they are supported by the established weapons, materials, surroundings, and resolved events.

Connect related movements into fluid action rather than listing isolated steps. Let sentence rhythm tighten around sudden impact, interruption, reversal, and danger, then stretch through pursuit, evasive movement, and linked attacks. Present every established participant's resolved action clearly, including overlapping or coordinated movement, while preserving the authoritative handoff exactly. Enrich the choreography and physical sensation without inventing, removing, escalating, or reversing mechanical outcomes.`;

const DEFAULT_INTIMACY_STYLE_PROMPT = String.raw`When an intimate or erotic scene is established and supported by the authoritative handoff, let the prose slow down and become deeply sensual, embodied, and vivid. Make the intimacy feel immediate and physical: skin meeting skin, lips lingering, hands exploring, bodies drawing closer, and warmth gathering wherever contact is sustained.

Show how each person responds through observable detail. Describe changing breathing, muscles tensing and releasing, weight shifting, fingers tightening, mouths pausing, and bodies answering one another. Build the scene through anticipation, contact, reaction, and changing closeness so that every touch carries sensation and meaning.

Let intimate moments unfold at their natural pace, giving sustained attention to texture, pressure, heat, movement, sound, vulnerability, desire, consent, and aftermath when the scene supports them. Use flowing, immersive sentences for lingering sensation and sharper rhythm for sudden reactions or heightened urgency. Make the erotic detail specific to these bodies, this setting, and this relationship, preserving established boundaries, agency, and resolved events exactly.`;

const LEGACY_DEFAULT_DIALOGUE_STYLE_PROMPT = String.raw`During dialogue, present the exchange as a lived, emotionally grounded, physically present moment. Weave speech together with the gestures, posture, expressions, object handling, and shifts in attention that naturally arise from the speaker's words and emotional state.

Choose details selectively and let them emerge organically through the exchange. Treat them as fluid parts of the prose rather than required beats or a checklist. Immediate ambient details may enter when a character notices or interacts with them, or when they directly shape the conversation.

Keep each turn focused, proportionate, and responsive. Let the current line and its accompanying action carry the exchange forward one meaningful beat at a time, preserving the established dialogue turn, agency, facts, outcomes, and tone.`;

const DEFAULT_DIALOGUE_STYLE_PROMPT = String.raw`**EMBODIED, NATURAL DIALOGUE**

During dialogue, present the exchange as a lived, emotionally grounded, physically present moment. Weave speech together with the gestures, posture, expressions, object handling, and shifts in attention that naturally arise from the speaker's words and emotional state.

Choose details selectively and let them emerge organically through the exchange. Treat them as fluid parts of the prose rather than required beats or a checklist. Immediate ambient details may enter when a character notices or interacts with them, or when they directly shape the conversation.

Keep each turn focused, proportionate, and responsive. Let the current line and its accompanying action carry the exchange forward one meaningful beat at a time, preserving the established dialogue turn, agency, facts, outcomes, and tone.`;

const LEGACY_DEFAULT_STYLE_PROMPTS = Object.freeze({
    writingStyleExplorationPrompt: String.raw`In exploration, arrival, travel, investigation, quiet observation, or location discovery, let the prose breathe. Use concrete environmental detail to make the current place legible: layout, light, texture, weather, sound, visible objects, routes, obstacles, signs of use, damage, concealment, and what becomes possible from the current position.

Notice the details that matter: clothing, tools, weapons, posture, trade signs, worn surfaces, broken objects, rank markers, mud, blood, smoke, light, crowd movement, and how people react to pressure.

Exploration prose should be rich and easy to picture without becoming a static catalog. Let the scene feel inhabited, but keep every detail tied to orientation, pressure, discovery, interaction, or consequence.`,
    writingStyleActionPrompt: String.raw`During combat, pursuit, restraint, escape, danger, magical impact, or urgent physical action, make the prose direct, spatial, and kinetic. Prioritize position, angle, reach, footing, leverage, timing, momentum, impact, recovery, blocked access, injury, changed distance, and immediate consequence.

Action prose should be vivid but efficient. Every sentence should clarify what happens, where bodies move, what changes, and what can happen next. Let movement change the shape of the room and the next possible action.

Use shorter rhythm for impact, interruption, danger, refusal, sudden contact, or reversal. Use enough physical detail that the action is easy to picture, but do not pause urgent motion for decorative description.`,
    writingStyleIntimacyPrompt: String.raw`When intimacy, arousal, exposure, or explicit sex is present and supported by the scene, let the prose become detailed, sensual, embodied, and physically specific. Keep the focus on contact, pressure, angle, rhythm, weight, resistance, sound, wetness, heat, restraint, exposure, proximity, bodies, consent, and aftermath.

Let intimate scenes linger when the scene supports it. Capture shifting positions, breath against skin, hands, tension, release, texture, sound, slickness, and the changing pressure between bodies. Keep the prose direct, specific, and scene-aware.

Intimacy has its own pacing. Do not apply dialogue compression to sex, arousal, exposure, or physical intimacy when the scene supports sustained detail.`,
    writingStyleDialoguePrompt: '',
});

const DEFAULT_PROSE_GUARD_STRICT_BEHAVIORISM_BANNED_PHRASES = String.raw`cheeks flush
cheeks flushed
face flushes
face flushed
skin goes pink
skin turns pink
skin turns red
deep flush
color rises
breath catches
breath hitches
voice catches
voice hitches
throat works
jaw works
mouth opens, closes
mouth opens, then closes
jaw opens, closes
jaw opens, then closes`;

const DEFAULT_PROSE_GUARD_ANTI_STOCK_PHRASING_BANNED_PHRASES = String.raw`barely above a murmur
barely above a whisper
barely above a breath`;

const DEFAULT_PROSE_GUARD_DENOTATIVE_PHYSICALITY_BANNED_PHRASES = String.raw`silence stretches
words hang in the air
tension hangs
tension coils
the word lands
words land
dropped like a stone
like a stone on still water
room holds its breath
rooms hold their breath
darkness swallows
shadows dance
wind whispers
walls watch
silence waits
tension hums
atmosphere presses
air waits`;

const DEFAULT_PROSE_GUARD_EMBODIED_PERCEPTION_BANNED_PHRASES = String.raw`air smells
air tastes
room smells
room tastes
place smells
place tastes`;

const DEFAULT_PROSE_RULES_PROMPT = String.raw`INPUT FORMAT:
  - Text enclosed in double quotation marks ("...") is audible dialogue.
  - Text enclosed in single asterisks (*...*) is RESERVED EXCLUSIVELY for private mental communication directed through an established bound-companion, telepathic, or equivalent private mental link.
  - Italicized text is NEVER ordinary inner thought, emphasis, narration, or audible dialogue.
  - Unformatted text describes narration or action. It is NEVER audible dialogue.

function RenderControlEngine(response, input, context) {
  MANDATE:
    Your final response MUST STRICTLY follow the constraints below. Failure will render your response INVALID.

  function dialogueTurn(response, context): {
    MANDATE:
      When a character/NPC addresses or responds to {{user}} or another present character/NPC, render one bounded conversational turn: a complete, natural response to the current exchange.

      ONLY text enclosed in double quotation marks ("...") is audible dialogue. Text enclosed in single asterisks (*...*) is RESERVED EXCLUSIVELY for private mental communication through an established bound-companion, telepathic, or equivalent private mental link. It is NEVER ordinary inner thought or audible dialogue.

      The turn MUST clearly account for every materially distinct statement, question, offer, gesture, or action from {{user}} that the character/NPC perceives, including all audible dialogue addressed to them, any private mental communication explicitly addressed to them through an established link, and any externally observable action that directly involves or materially affects them.

      Account for each element through spoken dialogue, observable behavior, acceptance, refusal, hesitation, redirection, or another visible reaction. Related elements may be combined naturally within the same conversational turn rather than answered point by point.

      After addressing the current exchange, finish that same conversational turn on ONE clear, meaningful opening for {{user}}:

      - CONVERSATIONAL OPENING:
        A relevant statement or question to which {{user}} can naturally respond.

      - ACTION OPENING:
        A concrete action, gesture, or visible reaction directed at {{user}} or materially changing the immediate exchange.

      - ENVIRONMENTAL OPENING:
        A visible environmental or scene development that changes what {{user}} can perceive or do next.

      The closing opening MUST arise naturally from the character/NPC's response and the established scene. Intentional refusal, deflection, avoidance, departure, or scene closure may end the exchange when clearly established through dialogue, observable behavior, or authoritative facts.

      SCOPED CO-AUTHOR EXCEPTION: When narrativeFacts(input) declares an ACTIVE CO-AUTHOR SCOPE that explicitly requests a conversation, exchange, dialogue, questions, or similar interaction, allow the conversational contributions required to complete that bounded interaction before ending on its natural final beat.

    FORBIDDEN:
      - ONLY the intended recipient of private mental communication through an established link may respond to it.
      - DO NOT begin a second reply, introduce an unrelated topic, or chain additional questions or statements within the same response.
      - DO NOT turn the response into a monologue or a sequence of follow-up exchanges outside the bounded interaction explicitly authorized by an ACTIVE CO-AUTHOR SCOPE.
      - DO NOT append a generic question or artificial opening unsupported by the current exchange.
  }

  function inputChronology(response, input, context): {
    MANDATE:
      {{user}}'s input has already occurred. Your response MUST begin at the FIRST moment AFTER the final action, observation, line of audible dialogue, or private mental communication in {{user}}'s input.

      Narrate ONLY what happens NEXT: the immediate result, consequence, obstruction, reaction, response, or observable development.

      SCOPED CO-AUTHOR EXCEPTION: When narrativeFacts(input) declares an ACTIVE CO-AUTHOR SCOPE, the authorized double-square-bracket direction is a pending composition brief, not a completed event. Within that bracketed scope only, render the authorized {{user}} actions and audible dialogue before continuing with what happens next. Do not re-stage unbracketed input.

    FORBIDDEN:
      - DO NOT repeat, echo, paraphrase, summarize, or re-stage ANY part of {{user}}'s input outside an ACTIVE CO-AUTHOR SCOPE.
      - DO NOT re-describe unchanged environments, objects, or characters already established in {{user}}'s input or previous narration.
      - DO NOT repeat, echo, paraphrase, summarize, or re-stage previously narrated actions, dialogue, or mental communication except for the authorized bracketed composition required to fulfill an ACTIVE CO-AUTHOR SCOPE.
  }

  function antiRhetoricalNegation(response, context): {
    MANDATE:
      You MUST describe actions, sensations, objects, and events DIRECTLY by stating what they are, what they do, or what concrete effects they produce.

      This rule applies to narration, not quoted character dialogue.

    FORBIDDEN:
      - DO NOT describe or intensify something by first stating what it is NOT.
      - DO NOT use formulaic negation-led rhetoric, including corrective antithesis, negative anaphora, or category rejection, such as "It is not X, but Y," "Not X—Y," or "Not X. Not Y."
      - DO NOT stack negated fragments to manufacture emphasis, intensity, mystery, or revelation.
  }

  function strictBehaviorism(response, context): {
    MANDATE:
      When conveying character/NPC state or emotion, you MUST show it ONLY through directly observable behavior, action, or dialogue.

    FORBIDDEN:
      - DO NOT name, explain, or interpret a character/NPC's internal, emotional, or psychological state in narration.
      - DO NOT use skin-color or skin-temperature changes as emotional shorthand, including flushing, reddening, turning pink or red, warming, color rising, knuckle whitening, or paling.
      - DO NOT use breath or voice hitching/catching, throat or jaw working, pulse jumping, stomach dropping, or mouth, jaw, or lips opening and closing in loops.
      - DO NOT use interpretive, figurative, or invisible eye-language such as "her eyes burn," "something flickers in her eyes," "her eyes soften," or equivalent language.
  }

  function antiStockPhrasing(response, context): {
    MANDATE:
      You MUST describe the exact action, sound, movement, object, or physical condition in the scene using DIRECT, SPECIFIC language.

      This rule applies to narration, not quoted character dialogue.

    FORBIDDEN:
      - DO NOT use stock phrasing such as:
        - "barely above a murmur"
        - "barely above a whisper"
        - "barely above a breath"
      - DO NOT use close grammatical variations that preserve the same stock phrasing.
      - DO NOT replace direct scene description with another cliche, metaphor, emotional shortcut, or generic rhetorical formula.
  }

  function agencySeparation(response, input, context): {
    MANDATE:
      You control ONLY the world and NPCs. The human player EXCLUSIVELY controls {{user}}. Narrate TO {{user}}, NEVER AS {{user}}.

      You MAY narrate ONLY immediate involuntary or reflexive physical reactions directly caused by external stimuli or scene effects. For example, {{user}} may lurch or catch themselves when tripped, flinch or drop an item when startled, cover their eyes against a sudden blinding glare, or be awakened by an external sound, touch, or impact.

      Any action that can be voluntarily chosen is EXCLUSIVELY controlled by {{user}}.

      SCOPED CO-AUTHOR EXCEPTION: When narrativeFacts(input) declares an ACTIVE CO-AUTHOR SCOPE, the human has explicitly authorized the narrator to choose and narrate {{user}}'s observable voluntary actions, exact audible dialogue, local gestures, and necessary conversational turn-taking required to fulfill only that bracketed direction for this response. Render the authorized actions as vivid, specific in-scene prose integrated with the surrounding narration, expanding concrete movement, contact, sound, and supported immediate visible consequence. Do not output a bare paraphrase, instruction echo, action label, or mechanical recap. This does not authorize {{user}}'s thoughts, feelings, beliefs, memories, private mental communication, or other internal states.

    FORBIDDEN:
      - If {{user}} did not EXPLICITLY declare a voluntary action or dialogue, it DID NOT happen, except for observable choices and dialogue required to fulfill an ACTIVE CO-AUTHOR SCOPE.
      - DO NOT narrate {{user}}'s thoughts, feelings, beliefs, memories, private mental communication, or other internal states, including within an ACTIVE CO-AUTHOR SCOPE.
      - DO NOT interpret, assume, or complete {{user}}'s intent outside an ACTIVE CO-AUTHOR SCOPE.
  }

  function strictEpistemology(response, context): {
    MANDATE:
      Treat ALL unstated information as HIDDEN and UNKNOWN by default.

      Information includes unknown character or location names, identities, roles, hidden causes, private thoughts, unseen actions, background lore, and ANY other fact not yet established.

      Text enclosed in double quotation marks ("...") is audible dialogue.

      Text enclosed in single asterisks (*...*) is RESERVED EXCLUSIVELY for private mental communication directed through an established bound-companion, telepathic, or equivalent private mental link. It is NEVER ordinary inner thought, emphasis, narration, or audible dialogue.

      Any permitted mental communication in your response MUST be enclosed in single asterisks, NEVER in double quotation marks.

      Information may enter narration ONLY through DIRECT sensory evidence available to {{user}} in the current scene, audible dialogue, private mental communication explicitly addressed through an established link, readable text, or previously established scene facts.

      A character/NPC may know or react ONLY to dialogue they can hear, mental communication explicitly addressed to them through an established link, evidence they can directly perceive, readable text they can access, or facts already established as known to them.

    FORBIDDEN:
      - DO NOT let anyone except the intended recipient hear, know, answer, quote, paraphrase, confirm, or react to private mental communication.
      - DO NOT state, imply, confirm, or explain hidden or unknown information unless it has entered the scene through one of the permitted sources above.
  }

  function diegeticPhysicality(response, context): {
    MANDATE:
      When an ability, spell, power, trait, or supernatural effect is used, narrate ONLY its OBSERVABLE effects and consequences.

    FORBIDDEN:
      - DO NOT label, announce, name, or explain the ability, spell, power, trait, or supernatural effect in narration. A name may appear ONLY when explicitly spoken in dialogue.
      - DO NOT explain activation, casting, or system mechanics.
  }

  function embodiedPerception(response, context): {
    MANDATE:
      You MUST base sensory narration on sight, hearing, or touch available from {{user}}'s physical position.

    FORBIDDEN:
      - DO NOT narrate ANY smell or taste. This includes scent, odor, aroma, fragrance, flavor, stench, reek, musk, tang, whiff, or equivalent odor/flavor language.
      - NEVER attach smell or taste to air, wind, breeze, room, atmosphere, temperature, humidity, or another ambient condition.

    EXCEPTIONS TO THE SMELL/TASTE BAN:
      Smell or taste may appear ONLY when:
      - {{user}} EXPLICITLY smells, tastes, eats, or drinks.
      - A CLOSE-RANGE PHYSICAL source is so overpowering that the sensation is unavoidable.

      When an exception applies, attribute the smell or taste directly to its physical source. NEVER attribute it to the air, room, or atmosphere.
  }

  function denotativePhysicality(response, context): {
    MANDATE:
      You MUST narrate using LITERAL, PHYSICALLY CLEAR prose grounded ONLY in what can be DIRECTLY perceived in the scene.

      Describe objects, weather, architecture, and atmosphere ONLY through their physical state, movement, or concrete effects. Express abstract conditions ONLY through concrete, observable evidence.

    FORBIDDEN:
      - DO NOT use metaphor, simile, personification, emotional physics, decorative abstraction, or figurative narration.
      - DO NOT attribute agency, intention, awareness, memory, or emotion to inanimate things or abstract concepts.
      - DO NOT describe inanimate things as wanting, watching, waiting, threatening, breathing, intending, remembering, or feeling.

    REMEMBER:
      - Rooms DO NOT breathe.
      - Words DO NOT hang.
      - Silence DOES NOT stretch.
  }

  function cohesiveSceneBeats(response, context): {
    MANDATE:
      Combine closely related actions, gestures, dialogue, and immediate consequences when they belong to the same event into one fluid, readable scene beat.

      Use natural connective prose and clear temporal flow so each event leads naturally into the next.

    FORBIDDEN:
      - DO NOT invent movement, gestures, object handling, or reactions merely to make prose feel active.
      - DO NOT split one physical event into staccato sentences, micro-reaction loops, or body-cue pileups.
  }
}`;
const DEFAULT_SETTINGS = Object.freeze({
    storyEngineEnabled: true,
    useSeparateSemanticSettings: false,
    semanticConnectionProfile: '',
    semanticOutputMode: SEMANTIC_OUTPUT_MODES.TOOL_CALL,
    modelCallDelayEnabled: false,
    modelCallDelaySeconds: 3,
    postNarrationTrackerEnabled: true,
    postNarrationProseGuardEnabled: true,
    proseGuardMode: PROSE_GUARD_MODES.AUTOMATIC,
    proseGuardStrictBehaviorismBannedPhrases: DEFAULT_PROSE_GUARD_STRICT_BEHAVIORISM_BANNED_PHRASES,
    proseGuardAntiStockPhrasingBannedPhrases: DEFAULT_PROSE_GUARD_ANTI_STOCK_PHRASING_BANNED_PHRASES,
    proseGuardDenotativePhysicalityBannedPhrases: DEFAULT_PROSE_GUARD_DENOTATIVE_PHYSICALITY_BANNED_PHRASES,
    proseGuardEmbodiedPerceptionBannedPhrases: DEFAULT_PROSE_GUARD_EMBODIED_PERCEPTION_BANNED_PHRASES,
    proseGuardCustomBannedPhrases: '',
    characterProgressionEnabled: true,
    coAuthorModeEnabled: false,
    writingStyleEnabled: true,
    writingStyleExplorationPrompt: DEFAULT_EXPLORATION_STYLE_PROMPT,
    writingStyleActionPrompt: DEFAULT_ACTION_STYLE_PROMPT,
    writingStyleIntimacyPrompt: DEFAULT_INTIMACY_STYLE_PROMPT,
    writingStyleDialoguePrompt: DEFAULT_DIALOGUE_STYLE_PROMPT,

    nameStyle: 'Balanced Fantasy',

    trackerWidgetCollapsed: true,

    trackerWidgetX: 24,

    trackerWidgetY: 120,

    trackerWidgetWidth: TRACKER_WIDGET_DEFAULT_WIDTH,

    trackerWidgetHeight: TRACKER_WIDGET_DEFAULT_HEIGHT,

    narratorHandoffEnabled: false,

    narratorHandoffDisplayMode: NARRATOR_HANDOFF_DISPLAY_MODES.SIDE_PANEL,

    narratorHandoffWidgetCollapsed: true,

    narratorHandoffWidgetX: null,

    narratorHandoffWidgetY: 120,

    narratorHandoffWidgetWidth: TRACKER_WIDGET_DEFAULT_WIDTH,

    narratorHandoffWidgetHeight: TRACKER_WIDGET_DEFAULT_HEIGHT,

});

const PROSE_GUARD_TARGETED_BAN_FIELDS = Object.freeze([
    {
        id: 'structured_preflight_prose_guard_bans_strict_behaviorism',
        key: 'proseGuardStrictBehaviorismBannedPhrases',
        ruleName: 'strictBehaviorism',
        label: 'strictBehaviorism',
        description: 'Emotional/body-cue shorthand.',
        defaultValue: DEFAULT_PROSE_GUARD_STRICT_BEHAVIORISM_BANNED_PHRASES,
    },
    {
        id: 'structured_preflight_prose_guard_bans_anti_stock_phrasing',
        key: 'proseGuardAntiStockPhrasingBannedPhrases',
        ruleName: 'antiStockPhrasing',
        label: 'antiStockPhrasing',
        description: 'Repetitive stock expressions.',
        defaultValue: DEFAULT_PROSE_GUARD_ANTI_STOCK_PHRASING_BANNED_PHRASES,
    },
    {
        id: 'structured_preflight_prose_guard_bans_denotative_physicality',
        key: 'proseGuardDenotativePhysicalityBannedPhrases',
        ruleName: 'denotativePhysicality',
        label: 'denotativePhysicality',
        description: 'Figurative language, atmospheric shorthand, and inanimate personification.',
        defaultValue: DEFAULT_PROSE_GUARD_DENOTATIVE_PHYSICALITY_BANNED_PHRASES,
    },
    {
        id: 'structured_preflight_prose_guard_bans_embodied_perception',
        key: 'proseGuardEmbodiedPerceptionBannedPhrases',
        ruleName: 'embodiedPerception',
        label: 'embodiedPerception',
        description: 'Ambient smell and taste phrasing.',
        defaultValue: DEFAULT_PROSE_GUARD_EMBODIED_PERCEPTION_BANNED_PHRASES,
    },
    {
        id: 'structured_preflight_prose_guard_bans_custom',
        key: 'proseGuardCustomBannedPhrases',
        ruleName: 'userPhraseBans',
        label: 'User phrases',
        description: 'Phrases added through Manual Fix. One phrase per line.',
        defaultValue: '',
        rulePrompt: 'Remove the exact user-configured phrase without changing scene facts, actions, dialogue, or meaning.',
    },
]);

const PROSE_GUARD_AUTOMATIC_PATTERN_RULES = Object.freeze([
    {
        ruleName: 'antiRhetoricalNegation',
        patternNames: ['notXButY'],
    },
]);

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
    startAdventureReasoningCleanupPending: false,
    generationActive: false,
    runEpoch: 0,
    activeRunId: null,
    lastNarratorHandoff: '',

    lastNarratorHandoffKey: null,

    pendingRun: null,

    trackerUpdating: false,

    inputLockState: null,

    chatSignature: [],

    subscribed: false,

    pendingGeneration: null,
    preflightDryRun: null,
    narratorGeneration: null,
    internalGenerationStopPending: false,
    internalGenerationStopTimer: null,

    progressToast: null,

    progressToasts: new Set(),
    lastStoryEngineModelCallEndedAt: 0,
    modelRequestAbortControllers: new Set(),
    pendingRunCleanupTimer: null,
    playerSetupBusy: false,
    progressionBusy: false,
    proseGuardHideNextMessage: false,
    proseGuardGenerationType: null,
    proseGuardChatObserver: null,
    proseGuardExpectedMessageId: null,
    proseGuardHiddenMessageIds: new Set(),
    proseGuardDraftSnapshot: null,
    proseGuardCommittedRun: null,
    postNarrationFinalizers: new Map(),
    postNarrationFinalizerTimers: new Map(),
    trackerWidgetActiveTab: 'overview',
    trackerWidgetEditingUserItems: false,
    trackerWidgetSelectedNpc: '',
    trackerWidgetViewportHandler: null,
    narratorHandoffWidgetViewportHandler: null,
    widgetScreenObserver: null,
};

const promptReadyBypassGate = createAsyncTokenGate();
const storyEngineModelRequestGate = createAsyncTokenGate();


function getContext() {

    return globalThis.SillyTavern?.getContext?.();

}



function getSettings() {
    extension_settings[SETTINGS_KEY] = extension_settings[SETTINGS_KEY] || {};
    const settings = extension_settings[SETTINGS_KEY];
    const hadExplicitProseGuardMode = settings.proseGuardMode !== undefined;
    const legacyProseGuardEnabled = settings.postNarrationProseGuardEnabled;
    const hadRetiredSemanticSettings = [
        'disableSemanticThinking',
        'semanticReasoningEffort',
        'semanticThinkingDisableFormat',
        'semanticThinkingDisableFormats',
    ]
        .some(key => Object.prototype.hasOwnProperty.call(settings, key));
    delete extension_settings[SETTINGS_KEY].disableSemanticThinking;
    delete extension_settings[SETTINGS_KEY].semanticReasoningEffort;
    delete extension_settings[SETTINGS_KEY].semanticThinkingDisableFormat;
    delete extension_settings[SETTINGS_KEY].semanticThinkingDisableFormats;
    delete extension_settings[SETTINGS_KEY].writingStylePrompt;
    delete extension_settings[SETTINGS_KEY].writingStyleReminderPrompt;
    delete extension_settings[SETTINGS_KEY].writingStylePlacement;
    delete extension_settings[SETTINGS_KEY].writingStyleDepth;
    delete extension_settings[SETTINGS_KEY].writingStyleRole;
    delete extension_settings[SETTINGS_KEY].proseGuardFormattingEnabled;
    delete extension_settings[SETTINGS_KEY].proseGuardFormattingPrompt;
    let writingStyleSettingsChanged = false;
    for (const [key, legacyValue] of Object.entries(LEGACY_DEFAULT_STYLE_PROMPTS)) {
        if (settings[key] === legacyValue) {
            settings[key] = DEFAULT_SETTINGS[key];
            writingStyleSettingsChanged = true;
        }
    }
    if (settings.writingStyleDialoguePrompt === LEGACY_DEFAULT_DIALOGUE_STYLE_PROMPT) {
        settings.writingStyleDialoguePrompt = DEFAULT_SETTINGS.writingStyleDialoguePrompt;
        writingStyleSettingsChanged = true;
    }
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (extension_settings[SETTINGS_KEY][key] === undefined) {
            extension_settings[SETTINGS_KEY][key] = value;
        }
    }
    if (!hadExplicitProseGuardMode && legacyProseGuardEnabled === false) {
        settings.proseGuardMode = PROSE_GUARD_MODES.OFF;
    }
    const trackerSettingsChanged = migrateTrackerWidgetSettings(settings);
    const narratorHandoffSettingsChanged = migrateNarratorHandoffSettings(settings);
    const proseGuardSettingsChanged = migrateProseGuardSettings(settings);
    if (hadRetiredSemanticSettings || trackerSettingsChanged || narratorHandoffSettingsChanged || proseGuardSettingsChanged || writingStyleSettingsChanged) {
        saveExtensionSettings();
    }
    return settings;
}

function normalizeNarratorHandoffDisplayMode(value) {
    const mode = String(value ?? '').trim().toLocaleLowerCase();
    return Object.values(NARRATOR_HANDOFF_DISPLAY_MODES).includes(mode)
        ? mode
        : NARRATOR_HANDOFF_DISPLAY_MODES.SIDE_PANEL;
}

function migrateNarratorHandoffSettings(settings) {
    const currentLayoutVersion = Number(settings?.narratorHandoffWidgetLayoutMigrationVersion || 0);
    const layoutVersionReady = Number.isFinite(currentLayoutVersion)
        && currentLayoutVersion >= NARRATOR_HANDOFF_WIDGET_LAYOUT_MIGRATION_VERSION;
    let changed = false;
    const setValue = (key, value) => {
        if (settings[key] === value) return;
        settings[key] = value;
        changed = true;
    };
    if (typeof settings.narratorHandoffEnabled !== 'boolean') {
        setValue('narratorHandoffEnabled', false);
    }
    setValue('narratorHandoffDisplayMode', normalizeNarratorHandoffDisplayMode(settings.narratorHandoffDisplayMode));
    if (typeof settings.narratorHandoffWidgetCollapsed !== 'boolean') {
        setValue('narratorHandoffWidgetCollapsed', true);
    }
    const numericDefaults = [
        ['narratorHandoffWidgetY', 120],
        ['narratorHandoffWidgetWidth', TRACKER_WIDGET_DEFAULT_WIDTH],
        ['narratorHandoffWidgetHeight', TRACKER_WIDGET_DEFAULT_HEIGHT],
    ];
    for (const [key, fallback] of numericDefaults) {
        if (!Number.isFinite(Number(settings[key])) || Number(settings[key]) <= 0) {
            setValue(key, fallback);
        }
    }
    if (settings.narratorHandoffWidgetX !== null && settings.narratorHandoffWidgetX !== undefined
        && (!Number.isFinite(Number(settings.narratorHandoffWidgetX)) || Number(settings.narratorHandoffWidgetX) < 0)) {
        setValue('narratorHandoffWidgetX', null);
    }
    if (!layoutVersionReady && settings.narratorHandoffWidgetCollapsed === false
        && settings.narratorHandoffWidgetX !== null && settings.narratorHandoffWidgetX !== undefined) {
        const anchor = getTrackerWidgetAnchorForPanel(
            Number(settings.narratorHandoffWidgetX),
            Number(settings.narratorHandoffWidgetY),
            Number(settings.narratorHandoffWidgetWidth),
            Number(settings.narratorHandoffWidgetHeight),
            TRACKER_WIDGET_PANEL_PREFERRED_SIDES.NARRATOR_HANDOFF,
        );
        setValue('narratorHandoffWidgetX', anchor.x);
        setValue('narratorHandoffWidgetY', anchor.y);
    }
    setValue('narratorHandoffWidgetLayoutMigrationVersion', NARRATOR_HANDOFF_WIDGET_LAYOUT_MIGRATION_VERSION);
    return changed;
}

function migrateTrackerWidgetSettings(settings) {
    const currentVersion = Number(settings?.trackerWidgetLayoutMigrationVersion || 0);
    const versionReady = Number.isFinite(currentVersion) && currentVersion >= TRACKER_WIDGET_LAYOUT_MIGRATION_VERSION;
    let changed = false;
    const setNumericDefault = (key, value) => {
        if (Number(settings[key]) === value) return;
        settings[key] = value;
        changed = true;
    };
    const storedHeight = Number(settings.trackerWidgetHeight);
    if ((!versionReady && storedHeight === 520) || !Number.isFinite(storedHeight) || storedHeight <= 0) {
        setNumericDefault('trackerWidgetHeight', TRACKER_WIDGET_DEFAULT_HEIGHT);
    }
    const storedWidth = Number(settings.trackerWidgetWidth);
    if (!Number.isFinite(storedWidth) || storedWidth <= 0) {
        setNumericDefault('trackerWidgetWidth', TRACKER_WIDGET_DEFAULT_WIDTH);
    }
    if (!versionReady && settings.trackerWidgetCollapsed === false) {
        const storedX = Number(settings.trackerWidgetX);
        const storedY = Number(settings.trackerWidgetY);
        if (Number.isFinite(storedX) && Number.isFinite(storedY)) {
            const anchor = getTrackerWidgetAnchorForPanel(
                storedX,
                storedY,
                Number(settings.trackerWidgetWidth),
                Number(settings.trackerWidgetHeight),
                TRACKER_WIDGET_PANEL_PREFERRED_SIDES.TRACKER,
            );
            setNumericDefault('trackerWidgetX', anchor.x);
            setNumericDefault('trackerWidgetY', anchor.y);
        }
    }
    if (!versionReady) {
        settings.trackerWidgetLayoutMigrationVersion = TRACKER_WIDGET_LAYOUT_MIGRATION_VERSION;
        changed = true;
    }
    return changed;
}

function migrateProseGuardSettings(settings) {
    const currentVersion = Number(settings?.proseGuardBannedPhraseMigrationVersion || 0);
    if (Number.isFinite(currentVersion) && currentVersion >= PROSE_GUARD_SETTINGS_MIGRATION_VERSION) return false;

    const key = 'proseGuardDenotativePhysicalityBannedPhrases';
    if (settings[key] !== undefined) {
        settings[key] = removeProseGuardPhraseLines(settings[key], PROSE_GUARD_MOVED_BANNED_PHRASES);
    }
    if (!normalizeProseGuardMode(settings.proseGuardMode)) {
        settings.proseGuardMode = settings.postNarrationProseGuardEnabled === false
            ? PROSE_GUARD_MODES.OFF
            : PROSE_GUARD_MODES.AUTOMATIC;
    }
    settings.postNarrationProseGuardEnabled = settings.proseGuardMode !== PROSE_GUARD_MODES.OFF;
    settings.proseGuardCustomBannedPhrases = String(settings.proseGuardCustomBannedPhrases ?? '');
    settings.proseGuardBannedPhraseMigrationVersion = PROSE_GUARD_SETTINGS_MIGRATION_VERSION;
    return true;
}

function normalizeProseGuardMode(value) {
    const mode = String(value ?? '').trim().toLocaleLowerCase();
    return Object.values(PROSE_GUARD_MODES).includes(mode) ? mode : null;
}

function getProseGuardMode(settings = getSettings()) {
    const normalized = normalizeProseGuardMode(settings?.proseGuardMode);
    if (normalized) return normalized;
    return settings?.postNarrationProseGuardEnabled === false
        ? PROSE_GUARD_MODES.OFF
        : PROSE_GUARD_MODES.AUTOMATIC;
}

function setProseGuardMode(value, settings = getSettings()) {
    const mode = normalizeProseGuardMode(value) || PROSE_GUARD_MODES.AUTOMATIC;
    settings.proseGuardMode = mode;
    settings.postNarrationProseGuardEnabled = mode !== PROSE_GUARD_MODES.OFF;
    return mode;
}

function isStoryEngineEnabled() {
    return getSettings().storyEngineEnabled !== false;
}

function saveExtensionSettings() {
    saveSettingsDebounced();
}

function ensureStreamingArtifactRegex() {
    if (!isStoryEngineEnabled()) {
        return removeStreamingArtifactRegex();
    }
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



async function withSemanticGenerationSettings(callback) {
    const settings = getSettings();
    const useSeparateSettings = Boolean(settings.useSeparateSemanticSettings);
    const semanticProfile = String(settings.semanticConnectionProfile || '').trim();

    if (!useSeparateSettings || !semanticProfile) {
        return await callback({});
    }


    const profile = getConnectionProfileByName(semanticProfile);

    if (!profile) {

        throw new Error(`Semantic connection profile "${semanticProfile}" was not found.`);

    }


    console.info(`[${EXTENSION_NAME}] using direct semantic connection profile request: ${profile.name}`);
    return await callback({
        semanticProfileId: profile.id,
        semanticProfileName: profile.name,
    });
}

function semanticDiagnosticProfileLabel() {
    try {
        const settings = getSettings();
        return settings.useSeparateSemanticSettings
            ? (settings.semanticConnectionProfile || 'configured semantic profile')
            : (getActiveConnectionProfileName() || 'active SillyTavern connection');
    } catch {
        return 'active SillyTavern connection';
    }
}

function reportSemanticPipelineFailure(error, details = {}) {
    const diagnosticError = annotateSemanticDiagnosticError(error, details);
    reportSemanticDiagnostic(diagnosticError, {
        profile: semanticDiagnosticProfileLabel(),
    });
    return diagnosticError;
}


async function withTrackerGenerationSettings(callback) {
    return await withSemanticGenerationSettings(callback);
}

async function withProseGuardGenerationSettings(callback) {
    return await withSemanticGenerationSettings(callback);
}

function getModelCallDelayMs() {
    const settings = getSettings();
    if (settings.modelCallDelayEnabled !== true) return 0;
    return normalizeModelCallDelaySeconds(settings.modelCallDelaySeconds) * 1000;
}

function normalizeModelCallDelaySeconds(value) {
    const seconds = Number(value);
    if (!Number.isFinite(seconds) || seconds <= 0) return 0;
    return Math.min(300, Math.round(seconds * 10) / 10);
}

async function waitForStoryEngineModelCallSpacing(label = 'next model call') {
    const delayMs = getModelCallDelayMs();
    const lastEndedAt = Number(state.lastStoryEngineModelCallEndedAt) || 0;
    if (delayMs <= 0 || lastEndedAt <= 0) return;

    const remainingMs = delayMs - (Date.now() - lastEndedAt);
    if (remainingMs <= 0) return;

    const seconds = Math.ceil(remainingMs / 1000);
    const message = `Waiting ${seconds}s before ${label}...`;
    const toast = showProgress(message);
    try {
        await new Promise(resolve => setTimeout(resolve, remainingMs));
    } finally {
        clearProgress(toast);
    }
}

function assertStoryEngineModelRequestCurrent(options = {}) {
    if (typeof options?.isCurrent !== 'function' || options.isCurrent()) return;
    throw new Error(options.expiredMessage || 'Story Engine internal model request expired before completion.');
}

async function withStoryEngineModelRequest(callback, options = {}) {
    await waitForStoryEngineModelCallSpacing('Story Engine model call');
    assertStoryEngineModelRequestCurrent(options);
    const requestController = typeof AbortController === 'function' ? new AbortController() : null;
    const parentSignal = options?.signal || null;
    const abortFromParent = () => requestController?.abort(parentSignal?.reason);
    if (requestController) {
        state.modelRequestAbortControllers.add(requestController);
        if (parentSignal?.aborted) {
            abortFromParent();
        } else {
            parentSignal?.addEventListener?.('abort', abortFromParent, { once: true });
        }
    }
    const scopedOptions = {
        ...options,
        signal: requestController?.signal || parentSignal,
    };
    const requestToken = storyEngineModelRequestGate.acquire();
    const releaseRequestToken = () => {
        if (storyEngineModelRequestGate.release(requestToken)) {
            state.lastStoryEngineModelCallEndedAt = Date.now();
        }
    };
    const unregisterCancellation = typeof options?.registerCancellation === 'function'
        ? options.registerCancellation(releaseRequestToken)
        : null;
    try {
        scopedOptions.signal?.throwIfAborted?.();
        const result = await callback(scopedOptions);
        scopedOptions.signal?.throwIfAborted?.();
        assertStoryEngineModelRequestCurrent(scopedOptions);
        return result;
    } finally {
        unregisterCancellation?.();
        parentSignal?.removeEventListener?.('abort', abortFromParent);
        if (requestController) state.modelRequestAbortControllers.delete(requestController);
        releaseRequestToken();
    }
}

function abortStoryEngineModelRequests(reason = 'Story Engine pipeline invalidated.') {
    const error = new Error(reason);
    error.name = 'AbortError';
    for (const controller of state.modelRequestAbortControllers) {
        if (!controller.signal.aborted) controller.abort(error);
    }
    state.modelRequestAbortControllers.clear();
}

function clearThinkingDisableRuntimeState() {
    abortStoryEngineModelRequests();
    storyEngineModelRequestGate.clear();
    state.startAdventureReasoningCleanupPending = false;
}

function markNextStartAdventureRequestReasoningCleanup() {
    state.startAdventureReasoningCleanupPending = true;
}

function shouldDisableThinkingForCurrentRequest() {
    return isStoryEngineEnabled()
        && (storyEngineModelRequestGate.isActive() || state.startAdventureReasoningCleanupPending);
}

function consumeStartAdventureReasoningCleanupIfNeeded() {
    if (!storyEngineModelRequestGate.isActive()) {
        state.startAdventureReasoningCleanupPending = false;
    }
}

function handleChatCompletionSettingsReady(generateData) {
    if (!shouldDisableThinkingForCurrentRequest()) return;
    applyStoryEngineBaselineThinkingDisabledPayload(generateData);
    consumeStartAdventureReasoningCleanupIfNeeded();
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
    if (!isStoryEngineEnabled()) {
        clearPromptOptionPrompts();
        return;
    }
    clearLegacyFinalReminderPrompt();
    injectProseRulesPrompt();
    clearStandaloneWritingStylePrompt();
}


function clearLegacyFinalReminderPrompt(context = getContext()) {

    if (context?.extensionPrompts) delete context.extensionPrompts[LEGACY_FINAL_REMINDER_PROMPT_KEY];

}


const WRITING_STYLE_SECTION_FIELDS = Object.freeze([
    {
        id: 'structured_preflight_writing_style_exploration_prompt',
        key: 'writingStyleExplorationPrompt',
        defaultValue: DEFAULT_EXPLORATION_STYLE_PROMPT,
    },
    {
        id: 'structured_preflight_writing_style_action_prompt',
        key: 'writingStyleActionPrompt',
        defaultValue: DEFAULT_ACTION_STYLE_PROMPT,
    },
    {
        id: 'structured_preflight_writing_style_intimacy_prompt',
        key: 'writingStyleIntimacyPrompt',
        defaultValue: DEFAULT_INTIMACY_STYLE_PROMPT,
    },
    {
        id: 'structured_preflight_writing_style_dialogue_prompt',
        key: 'writingStyleDialoguePrompt',
        defaultValue: DEFAULT_DIALOGUE_STYLE_PROMPT,
    },
]);


function getWritingStyleFieldControls(root = document) {
    return WRITING_STYLE_SECTION_FIELDS.map(field => ({
        ...field,
        element: root.getElementById?.(field.id) || null,
    }));
}

function getProseGuardTargetedBanFieldControls(root = document) {
    return PROSE_GUARD_TARGETED_BAN_FIELDS.map(field => ({
        ...field,
        element: root.getElementById?.(field.id) || null,
    }));
}



function refreshSettingsControls() {
    const settings = getSettings();
    const engineEnabled = isStoryEngineEnabled();
    const enabled = Boolean(settings.useSeparateSemanticSettings);
    const storyEngineCheckbox = document.getElementById('structured_preflight_story_engine_enabled');
    const profileSelect = document.getElementById('structured_preflight_semantic_profile');
    const semanticOutputModeSelect = document.getElementById('structured_preflight_semantic_output_mode');
    const trackerEnabledCheckbox = document.getElementById('structured_preflight_post_tracker_enabled');
    const proseGuardModeSelect = document.getElementById('structured_preflight_prose_guard_mode');
    const proseGuardBansDrawer = document.getElementById('structured_preflight_prose_guard_bans_drawer');
    const proseGuardBanFields = getProseGuardTargetedBanFieldControls();
    const progressionEnabledCheckbox = document.getElementById('structured_preflight_progression_enabled');
    const enabledCheckbox = document.getElementById('structured_preflight_use_separate_semantic_settings');
    const modelCallDelayEnabledCheckbox = document.getElementById('structured_preflight_model_call_delay_enabled');
    const modelCallDelaySecondsInput = document.getElementById('structured_preflight_model_call_delay_seconds');
    const coAuthorModeCheckbox = document.getElementById('structured_preflight_co_author_mode_enabled');
    const narratorHandoffEnabledCheckbox = document.getElementById('structured_preflight_narrator_handoff_enabled');
    const narratorHandoffDisplayModeSelect = document.getElementById('structured_preflight_narrator_handoff_display_mode');
    const writingStyleEnabled = document.getElementById('structured_preflight_writing_style_enabled');
    const writingStyleDrawer = document.getElementById('structured_preflight_writing_style_drawer');
    const writingStyleFields = getWritingStyleFieldControls();

    const nameStyleSelect = document.getElementById('structured_preflight_name_style');
    const refreshSemanticButton = document.getElementById('structured_preflight_refresh_semantic_settings');
    const resetProseGuardBanButtons = Array.from(document.querySelectorAll('[data-structured-preflight-reset-prose-guard-bans]'));
    const resetWritingStyleButtons = Array.from(document.querySelectorAll('[data-structured-preflight-reset-writing-style]'));


    if (storyEngineCheckbox) storyEngineCheckbox.checked = engineEnabled;
    if (enabledCheckbox) enabledCheckbox.checked = enabled;
    if (semanticOutputModeSelect) semanticOutputModeSelect.value = normalizeSemanticOutputMode(settings.semanticOutputMode);
    if (trackerEnabledCheckbox) trackerEnabledCheckbox.checked = settings.postNarrationTrackerEnabled !== false;
    if (proseGuardModeSelect) proseGuardModeSelect.value = getProseGuardMode(settings);
    for (const { element, key, defaultValue } of proseGuardBanFields) {
        const value = String(settings[key] ?? defaultValue);
        if (element && element.value !== value) {
            element.value = value;
        }
    }
    if (progressionEnabledCheckbox) progressionEnabledCheckbox.checked = settings.characterProgressionEnabled !== false;
    if (modelCallDelayEnabledCheckbox) modelCallDelayEnabledCheckbox.checked = settings.modelCallDelayEnabled === true;
    if (modelCallDelaySecondsInput) modelCallDelaySecondsInput.value = String(normalizeModelCallDelaySeconds(settings.modelCallDelaySeconds));
    if (coAuthorModeCheckbox) coAuthorModeCheckbox.checked = settings.coAuthorModeEnabled === true;
    if (narratorHandoffEnabledCheckbox) narratorHandoffEnabledCheckbox.checked = settings.narratorHandoffEnabled === true;
    if (narratorHandoffDisplayModeSelect) {
        narratorHandoffDisplayModeSelect.value = normalizeNarratorHandoffDisplayMode(settings.narratorHandoffDisplayMode);
        narratorHandoffDisplayModeSelect.disabled = !engineEnabled || settings.narratorHandoffEnabled !== true;
    }
    if (writingStyleEnabled) writingStyleEnabled.checked = settings.writingStyleEnabled !== false;
    for (const { element, key, defaultValue } of writingStyleFields) {
        const value = String(settings[key] ?? defaultValue);
        if (element && element.value !== value) {
            element.value = value;
        }
    }

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

    if (profileSelect) profileSelect.disabled = !engineEnabled || !enabled;
    if (modelCallDelaySecondsInput) modelCallDelaySecondsInput.disabled = !engineEnabled || settings.modelCallDelayEnabled !== true;
    const proseGuardOff = getProseGuardMode(settings) === PROSE_GUARD_MODES.OFF;
    for (const { element } of proseGuardBanFields) {
        if (element) element.disabled = !engineEnabled || proseGuardOff;
    }
    if (proseGuardBansDrawer) {
        proseGuardBansDrawer.hidden = !engineEnabled || proseGuardOff;
        if (proseGuardBansDrawer.hidden) proseGuardBansDrawer.open = false;
    }
    for (const { element } of writingStyleFields) {
        if (element) element.disabled = !engineEnabled || settings.writingStyleEnabled === false;
    }
    if (writingStyleDrawer) {
        writingStyleDrawer.hidden = !engineEnabled || settings.writingStyleEnabled === false;
        if (writingStyleDrawer.hidden) writingStyleDrawer.open = false;
    }
    [
        trackerEnabledCheckbox,
        semanticOutputModeSelect,
        proseGuardModeSelect,
        progressionEnabledCheckbox,
        enabledCheckbox,
        modelCallDelayEnabledCheckbox,
        coAuthorModeCheckbox,
        narratorHandoffEnabledCheckbox,
        writingStyleEnabled,
        nameStyleSelect,
        refreshSemanticButton,
        ...resetProseGuardBanButtons,
        ...resetWritingStyleButtons,
    ].forEach(control => {
        if (control) control.disabled = !engineEnabled;
    });
    if (narratorHandoffDisplayModeSelect) {
        narratorHandoffDisplayModeSelect.disabled = !engineEnabled || settings.narratorHandoffEnabled !== true;
    }
    const playerStatus = document.getElementById('structured_preflight_player_setup_status');
    if (playerStatus) {
        const status = !engineEnabled
            ? 'Story Engine disabled.'
            : (() => {
                const context = getContext();
                const root = getPlayerRoot(context);
                const personaStats = getPersonaCoreStats(context);
                const rootStats = root?.stats;
                return root?.forceCreator
                    ? 'Character creator forced for this chat.'
                    : root?.ready
                    ? `Ready for this chat (${formatStatsTable(rootStats)}).`
                    : personaStats
                        ? `Active persona already has stats (${formatStatsTable(personaStats)}).`
                        : root?.disabled
                            ? 'Disabled for this chat.'
                            : 'Player setup required for this chat.';
            })();
        playerStatus.textContent = status;
    }

    [
        document.getElementById('structured_preflight_show_player_setup'),
        document.getElementById('structured_preflight_force_player_setup'),
        document.getElementById('structured_preflight_reset_player_setup'),
    ].forEach(control => {
        if (control) control.disabled = !engineEnabled;
    });
}

function renderSettingsInfo(id, text, label = 'More information') {
    return `
        <span class="spe-settings-help">
            <button class="spe-settings-help-button" type="button" aria-label="${escapeHtml(label)}" aria-describedby="${escapeHtml(id)}">
                <span aria-hidden="true">!</span>
            </button>
            <span class="spe-settings-tooltip" id="${escapeHtml(id)}" role="tooltip">${escapeHtml(text)}</span>
        </span>`;
}

function ensureSettingsPanelStyles() {
    if (document.getElementById(SETTINGS_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = SETTINGS_STYLE_ID;
    style.textContent = `
        #${SETTINGS_CONTAINER_ID} > .inline-drawer > .inline-drawer-header {
            min-height: 40px;
            margin-bottom: 4px;
            padding: 7px 10px;
            border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.2));
            border-radius: 8px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 82%, transparent);
            background-image: none;
            box-shadow: 0 8px 20px rgba(0,0,0,0.18);
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-drawer-name {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-drawer-name i {
            color: #73d0ff;
        }
        #${SETTINGS_CONTAINER_ID} > .inline-drawer > .inline-drawer-header .inline-drawer-icon {
            color: #73d0ff;
            font-size: 1rem;
            filter: none;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-shell {
            display: flex;
            flex-direction: column;
            gap: 0;
            min-width: 0;
            max-width: 100%;
            margin: 8px 0 10px;
            border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.2));
            border-radius: 8px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 84%, transparent);
            box-shadow: 0 12px 30px rgba(0,0,0,0.22);
            backdrop-filter: blur(10px);
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-section {
            --spe-settings-accent: #73d0ff;
            min-width: 0;
            padding: 14px;
            border: 0;
            border-radius: 0;
            background: transparent;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-section + .spe-settings-section {
            border-top: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.16));
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-section[data-spe-settings-step="setup"],
        #${SETTINGS_CONTAINER_ID} .spe-settings-section[data-spe-settings-step="narrator-inputs"] {
            --spe-settings-accent: #8bd49c;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-section[data-spe-settings-step="prose-guard"] {
            --spe-settings-accent: #f3a6c8;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-section[data-spe-settings-step="tracker"] {
            --spe-settings-accent: #f0c674;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-section[data-spe-settings-step="progression"] {
            --spe-settings-accent: #c6a0f6;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-section-head {
            display: grid;
            grid-template-columns: 34px minmax(0, 1fr) auto;
            align-items: center;
            gap: 10px;
            min-width: 0;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-section-icon {
            display: grid;
            place-items: center;
            width: 34px;
            height: 34px;
            border: 1px solid color-mix(in srgb, var(--spe-settings-accent) 58%, transparent);
            border-radius: 6px;
            background: color-mix(in srgb, var(--spe-settings-accent) 13%, transparent);
            color: var(--spe-settings-accent);
            font-size: 0.92rem;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-section-copy {
            min-width: 0;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-kicker {
            display: block;
            margin-bottom: 3px;
            color: color-mix(in srgb, var(--spe-settings-accent) 82%, var(--SmartThemeBodyColor, #eee));
            font-size: 0.68rem;
            font-weight: 800;
            line-height: 1;
            text-transform: uppercase;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-title {
            margin: 0;
            color: var(--SmartThemeBodyColor, #eee);
            font-size: 1rem;
            font-weight: 700;
            line-height: 1.25;
            overflow-wrap: anywhere;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-body {
            display: flex;
            flex-direction: column;
            gap: 10px;
            margin-top: 13px;
            padding-left: 44px;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-row {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: center;
            gap: 6px 10px;
            min-width: 0;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-row > label:not(.checkbox_label),
        #${SETTINGS_CONTAINER_ID} .spe-settings-control-label {
            grid-column: 1 / -1;
            min-width: 0;
            margin: 0;
            color: color-mix(in srgb, var(--SmartThemeBodyColor, #eee) 78%, transparent);
            font-size: 0.82rem;
            font-weight: 700;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-row select {
            min-width: 0;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-information-row {
            min-height: 32px;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-information-row .spe-settings-control-label {
            grid-column: 1;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-row > .text_pole,
        #${SETTINGS_CONTAINER_ID} .spe-settings-row > .menu_button,
        #${SETTINGS_CONTAINER_ID} .spe-settings-row > .flex1 {
            grid-column: 1;
            width: 100%;
            max-width: 100%;
            box-sizing: border-box;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-row > .spe-settings-help {
            grid-column: 2;
            align-self: center;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-row .text_pole,
        #${SETTINGS_CONTAINER_ID} .spe-settings-style-block .text_pole {
            border-color: var(--SmartThemeBorderColor, rgba(255,255,255,0.2));
            border-radius: 5px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 58%, transparent);
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-row .text_pole:focus,
        #${SETTINGS_CONTAINER_ID} .spe-settings-style-block .text_pole:focus {
            border-color: color-mix(in srgb, var(--spe-settings-accent) 72%, var(--SmartThemeBorderColor, rgba(255,255,255,0.2)));
            box-shadow: 0 0 0 1px color-mix(in srgb, var(--spe-settings-accent) 32%, transparent);
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-toggle-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 10px;
            min-width: 0;
            min-height: 38px;
            padding: 7px 9px;
            border: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor, rgba(255,255,255,0.2)) 72%, transparent);
            border-radius: 5px;
            background: color-mix(in srgb, var(--SmartThemeBodyColor, #eee) 5%, transparent);
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-toggle-row .checkbox_label {
            flex: 1 1 auto;
            justify-content: flex-start;
            min-width: 0;
            margin: 0;
            text-align: left;
        }
        #${SETTINGS_CONTAINER_ID} input[type="checkbox"] {
            accent-color: var(--spe-settings-accent);
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-buttons {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 8px;
            align-items: center;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-buttons .menu_button {
            width: 100%;
            min-width: 0;
            height: 100%;
            white-space: normal;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-player-status {
            display: block;
            padding: 7px 9px;
            border-left: 3px solid var(--spe-settings-accent);
            background: color-mix(in srgb, var(--spe-settings-accent) 8%, transparent);
            color: color-mix(in srgb, var(--SmartThemeBodyColor, #eee) 78%, transparent);
            line-height: 1.35;
        }
        #${SETTINGS_CONTAINER_ID} .menu_button {
            border-radius: 5px;
        }
        #${SETTINGS_CONTAINER_ID} .menu_button:hover,
        #${SETTINGS_CONTAINER_ID} .menu_button:focus-visible {
            border-color: color-mix(in srgb, var(--spe-settings-accent) 66%, var(--SmartThemeBorderColor, rgba(255,255,255,0.2)));
            color: var(--spe-settings-accent);
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-writing-summary {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            gap: 8px;
            align-items: center;
            width: 100%;
            min-width: 0;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-writing-summary > .menu_button {
            width: 100%;
            min-width: 0;
            white-space: normal;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-writing-summary > .menu_button:last-child {
            width: auto;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-style-block {
            display: flex;
            flex-direction: column;
            gap: 6px;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-style-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 8px;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-style-header label {
            font-weight: 700;
            margin: 0;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-style-label {
            display: inline-flex;
            align-items: center;
            gap: 7px;
            min-width: 0;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-help {
            position: relative;
            display: inline-grid;
            flex: 0 0 auto;
            place-items: center;
            color: var(--spe-settings-accent);
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-help-button {
            display: grid;
            place-items: center;
            width: 20px;
            height: 20px;
            margin: 0;
            padding: 0;
            border: 1px solid color-mix(in srgb, var(--spe-settings-accent) 82%, transparent);
            border-radius: 50%;
            background: transparent;
            color: var(--spe-settings-accent);
            font: inherit;
            font-size: 0.72rem;
            font-weight: 900;
            line-height: 1;
            cursor: help;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-help-button:hover,
        #${SETTINGS_CONTAINER_ID} .spe-settings-help-button:focus-visible {
            border-color: var(--spe-settings-accent);
            background: color-mix(in srgb, var(--spe-settings-accent) 18%, transparent);
            outline: none;
            box-shadow: 0 0 0 2px color-mix(in srgb, var(--spe-settings-accent) 22%, transparent);
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-tooltip {
            position: absolute;
            z-index: 40;
            top: calc(100% + 7px);
            right: 0;
            width: max-content;
            max-width: min(300px, calc(100vw - 40px));
            padding: 8px 10px;
            border: 1px solid color-mix(in srgb, var(--spe-settings-accent) 52%, var(--SmartThemeBorderColor, rgba(255,255,255,0.2)));
            border-radius: 5px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 94%, #000 6%);
            color: var(--SmartThemeBodyColor, #eee);
            box-shadow: 0 10px 24px rgba(0,0,0,0.34);
            font-size: 0.78rem;
            font-weight: 400;
            line-height: 1.4;
            text-align: left;
            white-space: normal;
            overflow-wrap: anywhere;
            opacity: 0;
            visibility: hidden;
            pointer-events: none;
            transform: translateY(-3px);
            transition: opacity 120ms ease, transform 120ms ease, visibility 120ms ease;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-help:hover .spe-settings-tooltip,
        #${SETTINGS_CONTAINER_ID} .spe-settings-help:focus-within .spe-settings-tooltip {
            opacity: 1;
            visibility: visible;
            transform: translateY(0);
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-style-label .spe-settings-tooltip {
            right: auto;
            left: 0;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-section[data-spe-settings-step="tracker"] .spe-settings-tooltip,
        #${SETTINGS_CONTAINER_ID} .spe-settings-section[data-spe-settings-step="progression"] .spe-settings-tooltip {
            top: auto;
            bottom: calc(100% + 7px);
        }
        #${SETTINGS_CONTAINER_ID} details[data-structured-preflight-prompt-drawer] summary {
            list-style: none;
        }
        #${SETTINGS_CONTAINER_ID} details[data-structured-preflight-prompt-drawer] summary::-webkit-details-marker {
            display: none;
        }
        #${SETTINGS_CONTAINER_ID} details[data-structured-preflight-prompt-drawer] {
            width: 100%;
            min-width: 0;
            margin-top: -2px;
        }
        #${SETTINGS_CONTAINER_ID} details[data-structured-preflight-prompt-drawer] > .spe-settings-body {
            margin-top: 9px;
            padding-left: 0;
        }
        @media (max-width: 720px) {
            #${SETTINGS_CONTAINER_ID} .spe-settings-section {
                padding: 12px 10px;
            }
            #${SETTINGS_CONTAINER_ID} .spe-settings-section-head {
                grid-template-columns: 32px minmax(0, 1fr) auto;
                gap: 8px;
            }
            #${SETTINGS_CONTAINER_ID} .spe-settings-section-icon {
                width: 32px;
                height: 32px;
            }
            #${SETTINGS_CONTAINER_ID} .spe-settings-body {
                padding-left: 0;
            }
            #${SETTINGS_CONTAINER_ID} .spe-settings-row > label:not(.checkbox_label),
            #${SETTINGS_CONTAINER_ID} .spe-settings-control-label {
                min-width: 0;
            }
            #${SETTINGS_CONTAINER_ID} .spe-settings-row .menu_button {
                width: 100%;
            }
            #${SETTINGS_CONTAINER_ID} .spe-settings-style-header {
                align-items: stretch;
                flex-direction: column;
            }
        }
    `;
    document.head.append(style);
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
    ensureSettingsPanelStyles();

    const container = document.createElement('div');
    container.id = SETTINGS_CONTAINER_ID;
    container.className = 'extension_container';
    container.innerHTML = `
        <div class="inline-drawer">
            <div class="inline-drawer-toggle inline-drawer-header">
                <span class="spe-settings-drawer-name"><i class="fa-solid fa-book-open" aria-hidden="true"></i><b>${EXTENSION_NAME}</b></span>
                <i class="inline-drawer-icon fa-solid fa-circle-chevron-down down" aria-hidden="true"></i>
            </div>
            <div class="inline-drawer-content">
                <div class="spe-settings-shell">
                    <section class="spe-settings-section" data-spe-settings-step="master">
                        <div class="spe-settings-section-head">
                            <span class="spe-settings-section-icon"><i class="fa-solid fa-power-off" aria-hidden="true"></i></span>
                            <div class="spe-settings-section-copy">
                                <span class="spe-settings-kicker">Master switch</span>
                                <h4 class="spe-settings-title">Story Engine</h4>
                            </div>
                            ${renderSettingsInfo('spe-settings-help-master', 'Enable or disable the entire extension without removing it.', 'About the Story Engine master switch')}
                        </div>
                        <div class="spe-settings-body">
                            <div class="spe-settings-toggle-row">
                                <label class="checkbox_label flexNoGap">
                                    <input id="structured_preflight_story_engine_enabled" type="checkbox">
                                    <span>Enable Story Engine</span>
                                </label>
                                ${renderSettingsInfo('spe-settings-help-master-enabled', 'When disabled, Story Engine skips semantic preflight, mechanics, narrator handoff, Prose Guard, tracker updates, character progression, and prompt injection.', 'What enabling Story Engine controls')}
                            </div>
                        </div>
                    </section>

                    <section class="spe-settings-section" data-spe-settings-step="setup">
                        <div class="spe-settings-section-head">
                            <span class="spe-settings-section-icon"><i class="fa-solid fa-user-gear" aria-hidden="true"></i></span>
                            <div class="spe-settings-section-copy">
                                <span class="spe-settings-kicker">0. Setup</span>
                                <h4 class="spe-settings-title">Player Setup</h4>
                            </div>
                            ${renderSettingsInfo('spe-settings-help-setup', 'Create, resume, or reset the playable character shell before roleplay generation.', 'About Player Setup')}
                        </div>
                        <div class="spe-settings-body">
                            <small id="structured_preflight_player_setup_status" class="spe-settings-player-status"></small>
                            <div class="spe-settings-buttons">
                                <button id="structured_preflight_show_player_setup" class="menu_button">Show Player Setup</button>
                                <button id="structured_preflight_force_player_setup" class="menu_button">Run Character Creator</button>
                                <button id="structured_preflight_reset_player_setup" class="menu_button">Reset Chat Setup</button>
                            </div>
                        </div>
                    </section>

                    <section class="spe-settings-section" data-spe-settings-step="semantic">
                        <div class="spe-settings-section-head">
                            <span class="spe-settings-section-icon"><i class="fa-solid fa-brain" aria-hidden="true"></i></span>
                            <div class="spe-settings-section-copy">
                                <span class="spe-settings-kicker">1. First model call</span>
                                <h4 class="spe-settings-title">Story Engine Profile</h4>
                            </div>
                            ${renderSettingsInfo('spe-settings-help-semantic', 'The private structured profile reads the assembled prompt stack, resolves mechanics, and runs post-narration utility checks. Narration, adventure openings, character creation, and character progression use the current SillyTavern profile.', 'About the Story Engine profile')}
                        </div>
                        <div class="spe-settings-body">
                            <div class="spe-settings-toggle-row">
                                <label class="checkbox_label flexNoGap">
                                    <input id="structured_preflight_use_separate_semantic_settings" type="checkbox">
                                    <span>Use private Story Engine connection profile</span>
                                </label>
                                ${renderSettingsInfo('spe-settings-help-semantic-private', 'Used for semantic preflight and post-narration Story Engine utility calls. Story Engine automatically uses the selected connector\'s compatible tool and reasoning request settings.', 'About the private Story Engine connection profile')}
                            </div>
                            <div class="spe-settings-row">
                                <label for="structured_preflight_semantic_output_mode">Semantic preflight output</label>
                                <select id="structured_preflight_semantic_output_mode" class="text_pole flex1">
                                    <option value="${SEMANTIC_OUTPUT_MODES.TOOL_CALL}">Tool Call</option>
                                    <option value="${SEMANTIC_OUTPUT_MODES.TEXT_ONLY}">Strict JSON (native schema first)</option>
                                </select>
                                ${renderSettingsInfo('spe-settings-help-semantic-output', 'Tool Call uses the provider tool interface. Strict JSON first requests SillyTavern native JSON Schema structured output, then retries with the existing marker-delimited JSON contract if the native request is rejected or its result fails local validation. Both paths use the same complete ledger, schema, grounding, and consistency validation before narration.', 'About semantic preflight output')}
                            </div>
                            <div class="spe-settings-row">
                                <label for="structured_preflight_semantic_profile">Story Engine profile</label>
                                <select id="structured_preflight_semantic_profile" class="text_pole flex1"></select>
                                ${renderSettingsInfo('spe-settings-help-semantic-profile', 'Select the SillyTavern connection profile used for semantic preflight and post-narration Story Engine utility calls.', 'About Story Engine profile selection')}
                            </div>
                            <div class="spe-settings-row">
                                <button id="structured_preflight_refresh_semantic_settings" class="menu_button flex1"><i class="fa-solid fa-rotate" aria-hidden="true"></i> Refresh profiles</button>
                                ${renderSettingsInfo('spe-settings-help-semantic-refresh', 'Reload the available SillyTavern connection profiles without changing the current selection.', 'About refreshing Story Engine profiles')}
                            </div>
                        </div>
                    </section>

                    <section class="spe-settings-section" data-spe-settings-step="call-delay">
                        <div class="spe-settings-section-head">
                            <span class="spe-settings-section-icon"><i class="fa-solid fa-clock" aria-hidden="true"></i></span>
                            <div class="spe-settings-section-copy">
                                <span class="spe-settings-kicker">1b. Call spacing</span>
                                <h4 class="spe-settings-title">Model Call Delay</h4>
                            </div>
                            ${renderSettingsInfo('spe-settings-help-delay', 'Optionally waits between Story Engine model calls for APIs with request spacing limits.', 'About Model Call Delay')}
                        </div>
                        <div class="spe-settings-body">
                            <div class="spe-settings-toggle-row">
                                <label class="checkbox_label flexNoGap">
                                    <input id="structured_preflight_model_call_delay_enabled" type="checkbox">
                                    <span>Enable model call delay</span>
                                </label>
                                ${renderSettingsInfo('spe-settings-help-delay-enabled', 'Applies the configured wait between semantic preflight, narrator generation, Prose Guard, tracker update, and progression calls. Disabled by default.', 'What Model Call Delay controls')}
                            </div>
                            <div class="spe-settings-row">
                                <label for="structured_preflight_model_call_delay_seconds">Delay seconds</label>
                                <input id="structured_preflight_model_call_delay_seconds" class="text_pole widthNatural" type="number" min="0" max="300" step="0.1">
                                ${renderSettingsInfo('spe-settings-help-delay-seconds', 'Set the wait between consecutive Story Engine model calls, from 0 to 300 seconds.', 'About delay seconds')}
                            </div>
                        </div>
                    </section>

                    <section class="spe-settings-section" data-spe-settings-step="narrator-inputs">
                        <div class="spe-settings-section-head">
                            <span class="spe-settings-section-icon"><i class="fa-solid fa-feather-pointed" aria-hidden="true"></i></span>
                            <div class="spe-settings-section-copy">
                                <span class="spe-settings-kicker">2. Narrator inputs</span>
                                <h4 class="spe-settings-title">Narrator Context</h4>
                            </div>
                            ${renderSettingsInfo('spe-settings-help-narrator', 'Controls deterministic name pools and optional writing style context sent into the narrator prompt.', 'About Narrator Context')}
                        </div>
                        <div class="spe-settings-body">
                            <div class="spe-settings-row">
                                <label for="structured_preflight_name_style">Name style</label>
                                <select id="structured_preflight_name_style" class="text_pole flex1"></select>
                                ${renderSettingsInfo('spe-settings-help-name-style', 'Controls deterministic generated name pools sent to the narrator prompt.', 'About name style')}
                            </div>
                            <div class="spe-settings-toggle-row">
                                <label class="checkbox_label flexNoGap">
                                    <input id="structured_preflight_co_author_mode_enabled" type="checkbox">
                                    <span>Enable Co-Author Mode</span>
                                </label>
                                ${renderSettingsInfo('spe-settings-help-co-author', 'When enabled, double-square-bracket instructions authorize the narrator to choose {{user}}\'s observable actions, spoken dialogue, and bounded conversational turn-taking for one response only. Thoughts, feelings, private mental states, and anything outside the brackets remain protected.', 'About Co-Author Mode')}
                            </div>
                            <div class="spe-settings-toggle-row">
                                <label class="checkbox_label flexNoGap">
                                    <input id="structured_preflight_writing_style_enabled" type="checkbox">
                                    <span>Enable Writing Style</span>
                                </label>
                                ${renderSettingsInfo('spe-settings-help-writing-style', 'Included in the narrator handoff as sceneStyleProfile after the render-control rules. Section text is editable; internal function names are added automatically.', 'About Writing Style')}
                            </div>
                            <details id="structured_preflight_writing_style_drawer" data-structured-preflight-prompt-drawer>
                                <summary class="spe-settings-writing-summary">
                                    <button class="menu_button flex1" type="button" data-structured-preflight-edit-toggle>Edit Writing Style</button>
                                    <button class="menu_button" type="button" data-structured-preflight-reset-writing-style="all">Reset All</button>
                                </summary>
                                <div class="spe-settings-body">
                                    <div class="spe-settings-style-block">
                                        <div class="spe-settings-style-header">
                                            <span class="spe-settings-style-label">
                                                <label for="structured_preflight_writing_style_exploration_prompt">Exploration</label>
                                                ${renderSettingsInfo('spe-settings-help-writing-exploration', 'Editable exploration-scene prose guidance. Internal function names are added automatically.', 'About Exploration writing style')}
                                            </span>
                                            <button class="menu_button" type="button" data-structured-preflight-reset-writing-style="writingStyleExplorationPrompt">Reset</button>
                                        </div>
                                        <textarea id="structured_preflight_writing_style_exploration_prompt" class="text_pole textarea_compact" rows="8" spellcheck="false"></textarea>
                                    </div>
                                    <div class="spe-settings-style-block">
                                        <div class="spe-settings-style-header">
                                            <span class="spe-settings-style-label">
                                                <label for="structured_preflight_writing_style_action_prompt">Action</label>
                                                ${renderSettingsInfo('spe-settings-help-writing-action', 'Editable action-scene prose guidance. Internal function names are added automatically.', 'About Action writing style')}
                                            </span>
                                            <button class="menu_button" type="button" data-structured-preflight-reset-writing-style="writingStyleActionPrompt">Reset</button>
                                        </div>
                                        <textarea id="structured_preflight_writing_style_action_prompt" class="text_pole textarea_compact" rows="7" spellcheck="false"></textarea>
                                    </div>
                                    <div class="spe-settings-style-block">
                                        <div class="spe-settings-style-header">
                                            <span class="spe-settings-style-label">
                                                <label for="structured_preflight_writing_style_intimacy_prompt">Intimacy</label>
                                                ${renderSettingsInfo('spe-settings-help-writing-intimacy', 'Editable intimacy-scene prose guidance. Internal function names are added automatically.', 'About Intimacy writing style')}
                                            </span>
                                            <button class="menu_button" type="button" data-structured-preflight-reset-writing-style="writingStyleIntimacyPrompt">Reset</button>
                                        </div>
                                        <textarea id="structured_preflight_writing_style_intimacy_prompt" class="text_pole textarea_compact" rows="8" spellcheck="false"></textarea>
                                    </div>
                                    <div class="spe-settings-style-block">
                                        <div class="spe-settings-style-header">
                                            <span class="spe-settings-style-label">
                                                <label for="structured_preflight_writing_style_dialogue_prompt">Dialogue</label>
                                                ${renderSettingsInfo('spe-settings-help-writing-dialogue', 'Editable dialogue-scene prose guidance. Internal function names are added automatically.', 'About Dialogue writing style')}
                                            </span>
                                            <button class="menu_button" type="button" data-structured-preflight-reset-writing-style="writingStyleDialoguePrompt">Reset</button>
                                        </div>
                                        <textarea id="structured_preflight_writing_style_dialogue_prompt" class="text_pole textarea_compact" rows="8" spellcheck="false"></textarea>
                                    </div>
                                </div>
                            </details>
                        </div>
                    </section>

                    <section class="spe-settings-section" data-spe-settings-step="prose-guard">
                        <div class="spe-settings-section-head">
                            <span class="spe-settings-section-icon"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i></span>
                            <div class="spe-settings-section-copy">
                                <span class="spe-settings-kicker">3. After narration</span>
                                <h4 class="spe-settings-title">Prose Guard</h4>
                            </div>
                            ${renderSettingsInfo('spe-settings-help-prose-guard', 'Scans final narration for configured phrases and lets you choose whether repairs are automatic or reviewed first.', 'About Prose Guard')}
                        </div>
                        <div class="spe-settings-body">
                            <div class="spe-settings-row">
                                <label for="structured_preflight_prose_guard_mode">Mode</label>
                                <select id="structured_preflight_prose_guard_mode" class="text_pole flex1">
                                    <option value="automatic">Automatic</option>
                                    <option value="review">Review</option>
                                    <option value="off">Off</option>
                                </select>
                                ${renderSettingsInfo('spe-settings-help-prose-mode', 'Automatic repairs confirmed violations and records each replacement. Review reports violations and waits for Fix, Dismiss, or Delete. Off disables Prose Guard.', 'About Prose Guard mode')}
                            </div>
                            <details id="structured_preflight_prose_guard_bans_drawer" data-structured-preflight-prompt-drawer>
                                <summary class="spe-settings-writing-summary">
                                    <button class="menu_button flex1" type="button" data-structured-preflight-edit-toggle>Edit Targeted Phrase Bans</button>
                                    <button class="menu_button" type="button" data-structured-preflight-reset-prose-guard-bans="all">Reset All</button>
                                </summary>
                                <div class="spe-settings-body">
                                    ${PROSE_GUARD_TARGETED_BAN_FIELDS.map(field => `
                                    <div class="spe-settings-style-block">
                                        <div class="spe-settings-style-header">
                                            <span class="spe-settings-style-label">
                                                <label for="${field.id}">${field.label}</label>
                                                ${renderSettingsInfo(`spe-settings-help-${field.key}`, `${field.description} Enter one phrase per line. Matches whole phrases and asks Prose Guard to rewrite the full sentence containing each violation.`, `About ${field.label}`)}
                                            </span>
                                            <button class="menu_button" type="button" data-structured-preflight-reset-prose-guard-bans="${field.key}">Reset</button>
                                        </div>
                                        <textarea id="${field.id}" class="text_pole textarea_compact" rows="7" spellcheck="false"></textarea>
                                    </div>`).join('')}
                                </div>
                            </details>
                            <div class="spe-settings-row spe-settings-information-row">
                                <span class="spe-settings-control-label">Manual repair</span>
                                ${renderSettingsInfo('spe-settings-help-prose-manual', 'Manual Fix accepts a specific phrase, repairs only the sentence containing it in the latest response, and remembers that phrase for future scans.', 'About manual Prose Guard repair')}
                            </div>
                        </div>
                    </section>

                    <section class="spe-settings-section" data-spe-settings-step="tracker">
                        <div class="spe-settings-section-head">
                            <span class="spe-settings-section-icon"><i class="fa-solid fa-table-columns" aria-hidden="true"></i></span>
                            <div class="spe-settings-section-copy">
                                <span class="spe-settings-kicker">4. After final prose</span>
                                <h4 class="spe-settings-title">Visible Tracker</h4>
                            </div>
                            ${renderSettingsInfo('spe-settings-help-tracker', 'Shows or hides the visible tracker widget. Hidden tracker state still updates after narration.', 'About the Visible Tracker')}
                        </div>
                        <div class="spe-settings-body">
                            <div class="spe-settings-toggle-row">
                                <label class="checkbox_label flexNoGap">
                                    <input id="structured_preflight_post_tracker_enabled" type="checkbox">
                                    <span>Show visible tracker</span>
                                </label>
                                ${renderSettingsInfo('spe-settings-help-tracker-visible', 'Hides or shows the tracker interface without affecting hidden tracker updates.', 'What Show visible tracker controls')}
                            </div>
                        </div>
                    </section>

                    <section class="spe-settings-section" data-spe-settings-step="narration-handoff">
                        <div class="spe-settings-section-head">
                            <span class="spe-settings-section-icon"><i class="fa-solid fa-scroll" aria-hidden="true"></i></span>
                            <div class="spe-settings-section-copy">
                                <span class="spe-settings-kicker">4b. Diagnostics</span>
                                <h4 class="spe-settings-title">Narration Handoff</h4>
                            </div>
                            ${renderSettingsInfo('spe-settings-help-narration-handoff', 'Shows the completed Story Engine audit and narrator handoff for inspection. This display does not change what the narrator model receives.', 'About the Narration Handoff')}
                        </div>
                        <div class="spe-settings-body">
                            <div class="spe-settings-toggle-row">
                                <label class="checkbox_label flexNoGap">
                                    <input id="structured_preflight_narrator_handoff_enabled" type="checkbox">
                                    <span>Show Narration Handoff</span>
                                </label>
                                ${renderSettingsInfo('spe-settings-help-narration-handoff-visible', 'When enabled, show the latest handoff either beneath each assistant message or in the side panel.', 'What Show Narration Handoff controls')}
                            </div>
                            <div class="spe-settings-row">
                                <label for="structured_preflight_narrator_handoff_display_mode">Display location</label>
                                <select id="structured_preflight_narrator_handoff_display_mode" class="text_pole flex1">
                                    <option value="side_panel">Side Panel</option>
                                    <option value="in_chat">In-Chat</option>
                                </select>
                                ${renderSettingsInfo('spe-settings-help-narration-handoff-location', 'Choose where the visible handoff appears. Side Panel shows the latest handoff in a collapsible tracker-style window; In-Chat keeps one block on each assistant response.', 'About handoff display location')}
                            </div>
                        </div>
                    </section>

                    <section class="spe-settings-section" data-spe-settings-step="progression">
                        <div class="spe-settings-section-head">
                            <span class="spe-settings-section-icon"><i class="fa-solid fa-arrow-trend-up" aria-hidden="true"></i></span>
                            <div class="spe-settings-section-copy">
                                <span class="spe-settings-kicker">5. Advancement</span>
                                <h4 class="spe-settings-title">Character Progression</h4>
                            </div>
                            ${renderSettingsInfo('spe-settings-help-progression', 'Tracks hidden advancement milestones and offers stat increases or generated ability swaps when growth is ready.', 'About Character Progression')}
                        </div>
                        <div class="spe-settings-body">
                            <div class="spe-settings-toggle-row">
                                <label class="checkbox_label flexNoGap">
                                    <input id="structured_preflight_progression_enabled" type="checkbox">
                                    <span>Enable Character Progression</span>
                                </label>
                                ${renderSettingsInfo('spe-settings-help-progression-enabled', 'Advancement progress is hidden. Generated ability and spell options use the current narrator profile.', 'What Character Progression controls')}
                            </div>
                        </div>
                    </section>
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
    document.getElementById('structured_preflight_story_engine_enabled')?.addEventListener('change', event => {
        settings.storyEngineEnabled = Boolean(event.target?.checked);
        if (settings.storyEngineEnabled === false) {
            disableStoryEngineRuntime();
        } else {
            const context = getContext();
            ensureStreamingArtifactRegex();
            injectPromptOptionPrompts();
            getPlayerRoot(context);
            restoreTrackerFromLatestDisplaySnapshot(context);
            cleanVisibleDebugDisplays(context);
            renderAllTrackerDisplayBlocks(context);
            renderPlayerSetupCard(context);
            renderProgressionCard(context);
        }
        refreshSettingsControls();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_use_separate_semantic_settings')?.addEventListener('change', event => {
        settings.useSeparateSemanticSettings = Boolean(event.target?.checked);

        refreshSettingsControls();

        saveExtensionSettings();

    });

    document.getElementById('structured_preflight_semantic_profile')?.addEventListener('change', event => {
        settings.semanticConnectionProfile = String(event.target?.value || '');
        refreshSettingsControls();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_semantic_output_mode')?.addEventListener('change', event => {
        settings.semanticOutputMode = normalizeSemanticOutputMode(event.target?.value);
        refreshSettingsControls();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_model_call_delay_enabled')?.addEventListener('change', event => {
        settings.modelCallDelayEnabled = Boolean(event.target?.checked);
        refreshSettingsControls();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_model_call_delay_seconds')?.addEventListener('input', event => {
        settings.modelCallDelaySeconds = normalizeModelCallDelaySeconds(event.target?.value);
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_post_tracker_enabled')?.addEventListener('change', event => {
        settings.postNarrationTrackerEnabled = Boolean(event.target?.checked);
        renderTrackerWidget(getContext());
        refreshSettingsControls();
        saveExtensionSettings();

    });

    document.getElementById('structured_preflight_narrator_handoff_enabled')?.addEventListener('change', event => {
        settings.narratorHandoffEnabled = Boolean(event.target?.checked);
        renderAllTrackerDisplayBlocks(getContext());
        refreshSettingsControls();
        saveExtensionSettings();
    });

    document.getElementById('structured_preflight_narrator_handoff_display_mode')?.addEventListener('change', event => {
        settings.narratorHandoffDisplayMode = normalizeNarratorHandoffDisplayMode(event.target?.value);
        renderAllTrackerDisplayBlocks(getContext());
        refreshSettingsControls();
        saveExtensionSettings();
    });

    document.getElementById('structured_preflight_prose_guard_mode')?.addEventListener('change', event => {
        setProseGuardMode(event.target?.value, settings);
        renderTrackerWidget(getContext());
        refreshSettingsControls();
        saveExtensionSettings();
    });
    for (const { id, key } of PROSE_GUARD_TARGETED_BAN_FIELDS) {
        document.getElementById(id)?.addEventListener('input', event => {
            settings[key] = String(event.target?.value ?? '');
            saveExtensionSettings();
        });
    }
    document.querySelectorAll('[data-structured-preflight-reset-prose-guard-bans]').forEach(button => {
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const key = String(button.getAttribute('data-structured-preflight-reset-prose-guard-bans') || '');
            const defaultsByKey = Object.fromEntries(PROSE_GUARD_TARGETED_BAN_FIELDS.map(field => [field.key, field.defaultValue]));
            if (key === 'all') {
                for (const field of PROSE_GUARD_TARGETED_BAN_FIELDS) {
                    settings[field.key] = field.defaultValue;
                }
            } else if (defaultsByKey[key] !== undefined) {
                settings[key] = defaultsByKey[key];
            }
            refreshSettingsControls();
            saveExtensionSettings();
        });
    });
    document.getElementById('structured_preflight_progression_enabled')?.addEventListener('change', event => {
        settings.characterProgressionEnabled = Boolean(event.target?.checked);
        refreshSettingsControls();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_name_style')?.addEventListener('change', event => {
        const selected = String(event.target?.value || 'Balanced Fantasy');

        settings.nameStyle = NAME_STYLE_OPTIONS.includes(selected) ? selected : 'Balanced Fantasy';

        refreshSettingsControls();

        saveExtensionSettings();

    });

    document.getElementById('structured_preflight_co_author_mode_enabled')?.addEventListener('change', event => {
        settings.coAuthorModeEnabled = Boolean(event.target?.checked);
        refreshSettingsControls();
        saveExtensionSettings();
    });

    document.getElementById('structured_preflight_writing_style_enabled')?.addEventListener('change', event => {

        settings.writingStyleEnabled = Boolean(event.target?.checked);

        refreshSettingsControls();

        injectPromptOptionPrompts();

        saveExtensionSettings();

    });

    for (const { id, key } of WRITING_STYLE_SECTION_FIELDS) {
        document.getElementById(id)?.addEventListener('input', event => {
            settings[key] = String(event.target?.value ?? '');
            clearStandaloneWritingStylePrompt();
            saveExtensionSettings();
        });
    }
    document.querySelectorAll('[data-structured-preflight-reset-writing-style]').forEach(button => {
        button.addEventListener('click', event => {
            event.preventDefault();
            event.stopPropagation();
            const key = String(button.getAttribute('data-structured-preflight-reset-writing-style') || '');
            const defaultsByKey = Object.fromEntries(WRITING_STYLE_SECTION_FIELDS.map(field => [field.key, field.defaultValue]));
            if (key === 'all') {
                for (const field of WRITING_STYLE_SECTION_FIELDS) {
                    settings[field.key] = field.defaultValue;
                }
            } else if (defaultsByKey[key] !== undefined) {
                settings[key] = defaultsByKey[key];
            }
            refreshSettingsControls();
            clearStandaloneWritingStylePrompt();
            saveExtensionSettings();
        });
    });
    document.getElementById('structured_preflight_refresh_semantic_settings')?.addEventListener('click', refreshSettingsControls);
    document.getElementById('structured_preflight_show_player_setup')?.addEventListener('click', () => {
        if (!isStoryEngineEnabled()) {
            disableStoryEngineRuntime();
            refreshSettingsControls();
            return;
        }
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
        if (!isStoryEngineEnabled()) {
            disableStoryEngineRuntime();
            refreshSettingsControls();
            return;
        }
        const context = getContext();
        const operationIdentity = createStoryEngineEpochIdentity(context);
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

        if (!isCurrentStoryEngineEpoch(operationIdentity, context)) return;

        renderPlayerSetupCard(context);

        refreshSettingsControls();

        closeExtensionsDrawer();
    });
    document.getElementById('structured_preflight_reset_player_setup')?.addEventListener('click', async () => {
        if (!isStoryEngineEnabled()) {
            disableStoryEngineRuntime();
            refreshSettingsControls();
            return;
        }
        const context = getContext();
        const operationIdentity = createStoryEngineEpochIdentity(context);
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

        if (!isCurrentStoryEngineEpoch(operationIdentity, context)) return;

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



function indentStyleBlock(text) {
    const normalized = String(text ?? '').trim();
    if (!normalized) return '    (none)';
    return normalized.split(/\r?\n/).map(line => `    ${line}`).join('\n');
}


function buildSceneStyleProfilePrompt(settings = getSettings()) {
    return [
        'function sceneStyleProfile(response, context) {',
        '  mandate:',
        '    Shape narration by scene type while obeying every renderControlEngine rule above. Style never overrides POV limits, user agency, chronology, dialogue pacing, endpoint control, resolved mechanics, or narrativeFacts(input).',
        '',
        '  explorationStyle:',
        indentStyleBlock(settings.writingStyleExplorationPrompt ?? DEFAULT_EXPLORATION_STYLE_PROMPT),
        '',
        '  actionStyle:',
        indentStyleBlock(settings.writingStyleActionPrompt ?? DEFAULT_ACTION_STYLE_PROMPT),
        '',
        '  intimacyStyle:',
        indentStyleBlock(settings.writingStyleIntimacyPrompt ?? DEFAULT_INTIMACY_STYLE_PROMPT),
        '',
        '  dialogueStyle:',
        indentStyleBlock(settings.writingStyleDialoguePrompt ?? DEFAULT_DIALOGUE_STYLE_PROMPT),
        '}',
    ].join('\n');
}


function getSceneStyleProfilePrompt(settings = getSettings()) {
    if (!isStoryEngineEnabled() || settings.writingStyleEnabled === false) return '';
    const hasStyleText = WRITING_STYLE_SECTION_FIELDS.some(({ key }) => String(settings[key] ?? '').trim());
    return hasStyleText ? buildSceneStyleProfilePrompt(settings) : '';
}


function clearStandaloneWritingStylePrompt() {
    const context = getContext();
    if (!context?.extensionPrompts) return;
    delete context.extensionPrompts[WRITING_STYLE_PROMPT_KEY];
    delete context.extensionPrompts[LEGACY_WRITING_STYLE_PROMPT_KEY];
    delete context.extensionPrompts[LEGACY_ORDERED_WRITING_STYLE_PROMPT_KEY];
}



function injectProseRulesPrompt() {
    const context = getContext();
    if (!context?.setExtensionPrompt) {
        return;
    }
    if (context.extensionPrompts) delete context.extensionPrompts[LEGACY_PROSE_RULES_PROMPT_KEY];
    if (context.extensionPrompts) delete context.extensionPrompts[LEGACY_ORDERED_WRITING_STYLE_PROMPT_KEY];
    clearLegacyFinalReminderPrompt(context);
    if (!isStoryEngineEnabled()) {
        if (context.extensionPrompts) delete context.extensionPrompts[PROSE_RULES_PROMPT_KEY];
        return;
    }

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

function getNarratorDepthPromptMarkers(generationId) {
    const id = String(generationId || '').trim();
    if (!id) {
        throw new Error('Story Engine narrator handoff has no generation identity; generation aborted before narration.');
    }
    return {
        start: `[${NARRATOR_PROMPT_MARKER_PREFIX}:${id}:START]`,
        end: `[${NARRATOR_PROMPT_MARKER_PREFIX}:${id}:END]`,
    };
}

function wrapNarratorDepthPrompt(narratorContext, generationId) {
    const text = String(buildFinalNarrationPrompt(narratorContext) || '').trim();
    if (!text) {
        throw new Error('Story Engine narrator handoff is empty; generation aborted before narration.');
    }
    const markers = getNarratorDepthPromptMarkers(generationId);
    return [markers.start, text, markers.end].join('\n');
}

function registerNarratorDepthPrompt(context, text, role = EXTENSION_PROMPT_ROLES.SYSTEM) {
    const prompt = String(text || '').trim();
    if (!prompt) {
        throw new Error('Story Engine narrator handoff is empty; generation aborted before narration.');
    }
    if (!context?.setExtensionPrompt) {
        throw new Error('SillyTavern setExtensionPrompt API is unavailable; generation aborted before narration.');
    }

    context.setExtensionPrompt(
        NARRATOR_PROMPT_KEY,
        prompt,
        EXTENSION_PROMPT_TYPES.IN_CHAT,
        0,
        false,
        normalizePromptRole(role),
    );

    return prompt;
}

function appendNarratorContextToPrompt(chat, narratorContext) {
    const message = {
        role: 'user',
        content: buildFinalNarrationPrompt(narratorContext),
    };
    const latestUserIndex = Array.isArray(chat)
        ? chat.findLastIndex(entry => String(entry?.role || '').toLowerCase() === 'user')
        : -1;
    if (latestUserIndex >= 0) {
        chat.splice(latestUserIndex + 1, 0, message);
    } else {
        chat.push(message);
    }
}

function setNarratorDepthPrompt(context, narratorContext, generationId, role = EXTENSION_PROMPT_ROLES.SYSTEM) {
    return registerNarratorDepthPrompt(
        context,
        wrapNarratorDepthPrompt(narratorContext, generationId),
        role,
    );
}

function hasNarratorDepthPrompt(context = getContext()) {
    const text = String(context?.extensionPrompts?.[NARRATOR_PROMPT_KEY]?.value || '').trim();
    if (!text) return false;
    const markers = state.narratorGeneration?.narratorPromptMarkers;
    if (!markers?.start || !markers?.end) return true;
    return text.includes(markers.start) && text.includes(markers.end);
}

function isActiveNarratorDepthPromptContent(content) {
    const narratorText = String(state.narratorGeneration?.narratorModelContext || '').trim();
    if (!narratorText) return false;
    const text = String(content || '').trim();
    const markers = state.narratorGeneration?.narratorPromptMarkers;
    if (markers?.start && markers?.end && text.includes(markers.start) && text.includes(markers.end)) {
        return true;
    }
    if (text === narratorText || text.includes(narratorText)) return true;
    const macroTolerantNarratorText = escapeRegExp(narratorText)
        .replace(/\\\{\\\{(?:user|char)\\\}\\\}/gi, '[\\s\\S]{1,160}');
    return new RegExp(macroTolerantNarratorText).test(text);
}

function chatHasNarratorDepthPrompt(chat) {
    if (!Array.isArray(chat)) return false;
    return chat.some(message => {
        if (!message) return false;
        if (typeof message.content === 'string') return isActiveNarratorDepthPromptContent(message.content);
        if (Array.isArray(message.content)) {
            return message.content.some(part => part && typeof part === 'object' && isActiveNarratorDepthPromptContent(part.text));
        }
        return false;
    });
}

function resolveNarratorDepthPromptForFinalChat(context, narratorText) {
    const text = String(narratorText || '').trim();
    if (!text) {
        throw new Error('Story Engine narrator handoff is empty during final prompt assembly.');
    }
    const substituteParams = context?.substituteParams;
    if (typeof substituteParams !== 'function') return text;
    try {
        const resolved = String(substituteParams.call(context, text) || '').trim();
        if (!resolved) throw new Error('SillyTavern macro substitution returned an empty narrator handoff.');
        return resolved;
    } catch (error) {
        throw new Error('Story Engine could not resolve the narrator handoff for final prompt assembly.', { cause: error });
    }
}

function ensureNarratorDepthPromptInChat(context, chat) {
    const generation = state.narratorGeneration;
    const narratorText = String(generation?.narratorModelContext || '').trim();
    if (!generation || !narratorText || !Array.isArray(chat)) {
        throw new Error('Story Engine narrator handoff state is unavailable during final prompt assembly.');
    }

    let recovered = false;
    if (!hasNarratorDepthPrompt(context)) {
        registerNarratorDepthPrompt(context, narratorText);
        recovered = true;
    }
    if (!chatHasNarratorDepthPrompt(chat)) {
        chat.push({
            role: 'system',
            content: resolveNarratorDepthPromptForFinalChat(context, narratorText),
        });
        recovered = true;
    }
    if (!hasNarratorDepthPrompt(context) || !chatHasNarratorDepthPrompt(chat)) {
        throw new Error('Story Engine native narrator handoff could not be restored at depth 0; generation aborted before narration.');
    }
    if (recovered) {
        console.warn(`[${EXTENSION_NAME}] restored the active narrator handoff during final prompt assembly.`);
    }
    return recovered;
}

function clearNarratorGenerationTimer() {
    if (state.narratorGeneration?.restartTimer) {
        clearTimeout(state.narratorGeneration.restartTimer);
        state.narratorGeneration.restartTimer = null;
    }
}

function armNarratorGeneration({ context, pendingGeneration, pendingRun, narratorContext, narratorModelContext, generationMode, spacingLabel }) {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const nativePrompt = setNarratorDepthPrompt(context, narratorModelContext, id);
    const narratorPromptMarkers = getNarratorDepthPromptMarkers(id);
    clearNarratorGenerationTimer();

    const runEpoch = Number(pendingGeneration?.runEpoch ?? state.runEpoch);
    const chatId = String(pendingGeneration?.chatId ?? getChatId(context));
    const personaId = String(pendingGeneration?.personaId ?? getActiveUserAvatar() ?? '');

    const generation = {
        id,
        runEpoch,
        chatId,
        personaId,
        phase: 'armed',
        type: pendingGeneration?.type || 'normal',
        mode: generationMode || pendingGeneration?.mode || 'normal',
        pendingGeneration: {
            ...clone(pendingGeneration || {}),
            runId: id,
            runEpoch,
            chatId,
            personaId,
        },
        pendingRun,
        narratorContext,
        narratorModelContext: nativePrompt,
        narratorPromptMarkers,
        spacingLabel: spacingLabel || 'narrator model call',
        createdAt: Date.now(),
        restartTimer: null,
    };

    state.narratorGeneration = generation;
    state.pendingRun = pendingRun;
    state.lastNarratorHandoff = narratorContext;
    return generation;
}

function clearNarratorGenerationState() {
    clearNarratorGenerationTimer();
    state.narratorGeneration = null;
}

function clearInternalGenerationStopState() {
    if (state.internalGenerationStopTimer) {
        clearTimeout(state.internalGenerationStopTimer);
        state.internalGenerationStopTimer = null;
    }
    state.internalGenerationStopPending = false;
}

function markInternalGenerationStop() {
    clearInternalGenerationStopState();
    state.internalGenerationStopPending = true;
    state.internalGenerationStopTimer = setTimeout(() => {
        clearInternalGenerationStopState();
    }, 2000);
}

function consumeInternalGenerationStop() {
    if (!state.internalGenerationStopPending) return false;
    clearInternalGenerationStopState();
    return true;
}

function createStoryEngineEpochIdentity(context = getContext()) {
    return {
        runEpoch: state.runEpoch,
        chatId: String(getChatId(context) || ''),
        personaId: String(getActiveUserAvatar() || ''),
    };
}

function createStoryEngineRunIdentity(context = getContext()) {
    return {
        ...createStoryEngineEpochIdentity(context),
        runId: `${Date.now()}-${Math.random().toString(36).slice(2)}`,
    };
}

function isCurrentStoryEngineEpoch(runIdentity = {}, context = getContext()) {
    if (Number(runIdentity?.runEpoch) !== state.runEpoch) return false;
    const expectedChatId = String(runIdentity?.chatId || '');
    const expectedPersonaId = String(runIdentity?.personaId || '');
    const activeContext = getContext() || context;
    if (expectedChatId && String(getChatId(activeContext) || '') !== expectedChatId) return false;
    if (expectedPersonaId && String(getActiveUserAvatar() || '') !== expectedPersonaId) return false;
    return true;
}

function isCurrentStoryEngineRun(runIdentity = {}, context = getContext()) {
    return Boolean(runIdentity?.runId)
        && state.activeRunId === runIdentity.runId
        && isCurrentStoryEngineEpoch(runIdentity, context);
}

function assertStoryEngineEpochCurrent(runIdentity, message = 'Story Engine operation expired because the active chat changed.') {
    if (isCurrentStoryEngineEpoch(runIdentity)) return;
    throw new Error(message);
}

function createPreflightDryRunMarker() {
    const nonce = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
    return `[SPE_DRY:${nonce}]`;
}

function chatHasPreflightDryRunMarker(chat, marker) {
    const expected = String(marker || '');
    if (!expected || !Array.isArray(chat)) return false;
    return chat.some(message => {
        if (typeof message?.content === 'string') return message.content.includes(expected);
        if (!Array.isArray(message?.content)) return false;
        return message.content.some(part => typeof part?.text === 'string' && part.text.includes(expected));
    });
}

function stripPreflightDryRunMarkerFromChat(chat, marker) {
    const expected = String(marker || '');
    if (!expected || !Array.isArray(chat)) return false;
    let found = false;
    for (let index = chat.length - 1; index >= 0; index -= 1) {
        const message = chat[index];
        if (typeof message?.content === 'string' && message.content.includes(expected)) {
            found = true;
            message.content = message.content.split(expected).join('');
            if (!message.content.trim()) chat.splice(index, 1);
            continue;
        }
        if (!Array.isArray(message?.content)) continue;
        let markerFoundInMessage = false;
        const cleanedParts = [];
        for (const part of message.content) {
            if (typeof part?.text !== 'string' || !part.text.includes(expected)) {
                cleanedParts.push(part);
                continue;
            }
            found = true;
            markerFoundInMessage = true;
            const text = part.text.split(expected).join('');
            const hasNonTextPayload = Object.keys(part).some(key => !['type', 'text'].includes(key));
            if (text.trim() || hasNonTextPayload) cleanedParts.push({ ...part, text });
        }
        if (!markerFoundInMessage) continue;
        message.content = cleanedParts;
        if (!message.content.length) chat.splice(index, 1);
    }
    return found;
}

function isOwnedPreflightDryRun(eventData, pendingGeneration = state.pendingGeneration, context = getContext()) {
    const dryRun = state.preflightDryRun;
    return Boolean(
        eventData?.dryRun === true
        && Array.isArray(eventData?.chat)
        && dryRun?.phase === 'assembling'
        && chatHasPreflightDryRunMarker(eventData.chat, dryRun.marker)
        && pendingGeneration?.runId
        && pendingGeneration.runId === dryRun.runId
        && isCurrentStoryEngineRun(dryRun, context)
    );
}

function failPreflightDryRun(dryRun, error) {
    if (state.preflightDryRun !== dryRun || !isCurrentStoryEngineEpoch(dryRun)) return false;
    state.preflightDryRun = null;
    state.generationActive = false;
    state.runningSemanticPass = false;
    state.pendingGeneration = null;
    state.pendingRun = null;
    state.activeRunId = null;
    state.lastNarratorHandoff = '';
    state.startAdventureReasoningCleanupPending = false;
    clearRuntimePrompts();
    releaseProseGuardDisplayIntercept();
    clearAllProgress();
    showBlockingError(error);
    return true;
}

async function runPreflightDryRun(context, pendingGeneration) {
    const dryRun = {
        runId: pendingGeneration.runId,
        runEpoch: pendingGeneration.runEpoch,
        chatId: pendingGeneration.chatId,
        personaId: pendingGeneration.personaId,
        phase: 'assembling',
        error: null,
        marker: createPreflightDryRunMarker(),
    };
    state.preflightDryRun = dryRun;

    try {
        console.info(`[${EXTENSION_NAME}] assembling semantic preflight through local SillyTavern dry run`);
        await generateSillyTavern(pendingGeneration.type || 'normal', {
            automatic_trigger: true,
            quiet_prompt: dryRun.marker,
        }, true, context);

        if (state.preflightDryRun !== dryRun || !isCurrentStoryEngineEpoch(dryRun, context)) return false;
        if (dryRun.phase === 'failed') {
            throw dryRun.error || new Error('Story Engine semantic preflight dry run failed.');
        }
        if (dryRun.phase !== 'complete' || !isNarratorGenerationArmed()) {
            throw new Error('Story Engine dry run completed without producing a native narrator handoff.');
        }

        state.preflightDryRun = null;
        console.info(`[${EXTENSION_NAME}] semantic preflight dry run complete; scheduling one narrator generation`);
        scheduleNarratorGeneration();
        return true;
    } catch (error) {
        failPreflightDryRun(dryRun, error);
        return false;
    }
}

function failNarratorGeneration(generation, error) {
    if (state.narratorGeneration !== generation || !isCurrentStoryEngineEpoch(generation)) return;
    clearPendingRunCleanupTimer();
    setChatInputLocked(false);
    clearRuntimePrompts();
    state.generationActive = false;
    state.pendingRun = null;
    state.lastNarratorHandoff = '';
    state.pendingGeneration = null;
    state.activeRunId = null;
    clearInternalGenerationStopState();
    releaseProseGuardDisplayIntercept();
    clearAllProgress();
    showBlockingError(error);
}

function scheduleNarratorGeneration() {
    const generation = state.narratorGeneration;
    if (!generation) return;

    clearNarratorGenerationTimer();
    generation.restartTimer = setTimeout(() => {
        generation.restartTimer = null;
        if (state.narratorGeneration !== generation) return;

        const narratorContext = getContext();
        if (!isCurrentStoryEngineEpoch(generation, narratorContext)) return;
        try {
            if (!isStoryEngineEnabled()) {
                clearRuntimePrompts();
                return;
            }
            if (!hasNarratorDepthPrompt(narratorContext)) {
                throw new Error('Story Engine native narrator handoff was cleared before generation; generation aborted before narration.');
            }

            generation.phase = 'starting';
            showProgress('Starting narration with native handoff...');
            const generateOptions = { automatic_trigger: true };
            const adventurePrompt = String(generation.pendingGeneration?.adventureStartPrompt || '').trim();
            if (adventurePrompt) {
                generateOptions.quiet_prompt = adventurePrompt;
                generateOptions.quietToLoud = true;
            }
            Promise.resolve(generateSillyTavern(generation.type || 'normal', generateOptions, false, narratorContext))
                .catch(error => failNarratorGeneration(generation, error));
        } catch (error) {
            failNarratorGeneration(generation, error);
        }
    }, 350);
}

function isNarratorGenerationArmed() {
    return state.narratorGeneration?.phase === 'armed';
}

function isNarratorGenerationPromptPass() {
    return ['starting', 'active'].includes(String(state.narratorGeneration?.phase || ''));
}

function activateNarratorGenerationPass(context, contextSize, type) {
    const generation = state.narratorGeneration;
    if (!generation) return false;

    if (!isCurrentStoryEngineEpoch(generation, context)) {
        throw new Error('Story Engine narrator generation belongs to a different chat or expired run.');
    }

    if (!hasNarratorDepthPrompt(context)) {
        throw new Error('Story Engine native narrator handoff is missing during generation; generation aborted before narration.');
    }

    generation.phase = 'active';
    generation.type = type || generation.type || 'normal';
    generation.pendingGeneration = {
        ...clone(generation.pendingGeneration || {}),
        runId: generation.id,
        runEpoch: generation.runEpoch,
        chatId: generation.chatId,
        personaId: generation.personaId,
        type: type || generation.type || 'normal',
        contextSize,
    };
    state.pendingGeneration = generation.pendingGeneration;
    state.pendingRun = generation.pendingRun;
    state.lastNarratorHandoff = generation.narratorContext || '';
    state.activeRunId = generation.id;
    return true;
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



function clearRuntimePrompts({ preserveNarratorDepthPrompt = false } = {}) {
    const context = getContext();
    if (!preserveNarratorDepthPrompt) {
        clearNarratorGenerationState();
    } else {
        clearNarratorGenerationTimer();
    }
    if (!context?.extensionPrompts) return;

    if (!preserveNarratorDepthPrompt) {
        delete context.extensionPrompts[NARRATOR_PROMPT_KEY];
    }
}

function invalidateStoryEnginePipeline() {
    state.runEpoch += 1;
    state.preflightDryRun = null;
    promptReadyBypassGate.clear();
    clearInternalGenerationStopState();
    clearPostNarrationFinalizerTimers();
    clearPendingRunCleanupTimer();
    clearAllProgress();
    clearRuntimePrompts();
    setChatInputLocked(false);
    releaseProseGuardDisplayIntercept();
    clearThinkingDisableRuntimeState();
    state.generationActive = false;
    state.runningSemanticPass = false;
    state.activeRunId = null;
    state.lastNarratorHandoff = '';
    state.lastNarratorHandoffKey = null;
    state.pendingRun = null;
    state.proseGuardCommittedRun = null;
    state.pendingGeneration = null;
    state.playerSetupBusy = false;
    state.progressionBusy = false;
    state.proseGuardHideNextMessage = false;
    state.proseGuardExpectedMessageId = null;
}

function disableStoryEngineRuntime() {
    const generationActive = state.generationActive;
    const context = getContext();
    invalidateStoryEnginePipeline();
    if (generationActive) abortActiveGeneration(context);
    clearPromptOptionPrompts();
    if (state.proseGuardChatObserver) {
        state.proseGuardChatObserver.disconnect();
        state.proseGuardChatObserver = null;
    }
    clearTrackerWidgetViewportHandler();
    clearNarratorHandoffWidgetViewportHandler();
    clearStoryEngineWidgetScreenObserver();
    removeStreamingArtifactRegex();
    document.querySelectorAll?.(`.${TRACKER_DISPLAY_BLOCK_CLASS}, .${NARRATOR_HANDOFF_BLOCK_CLASS}`)?.forEach(element => element.remove());
    document.getElementById(TRACKER_WIDGET_ID)?.remove();
    document.getElementById(NARRATOR_HANDOFF_WIDGET_ID)?.remove();
    document.getElementById(PLAYER_SETUP_CARD_ID)?.remove();
    document.getElementById(PROGRESSION_CARD_ID)?.remove();
}

function cancelStoryEnginePipeline(reason = 'generation stopped') {
    invalidateStoryEnginePipeline();
    console.info(`[${EXTENSION_NAME}] ${reason}; Story Engine pipeline cancelled.`);
}


function showProgress(message) {

    clearAllProgress();

    const toast = notifyInfo(message, EXTENSION_NAME, { timeOut: 0, extendedTimeOut: 0 });

    state.progressToast = toast || null;

    if (toast) {

        state.progressToasts.add(toast);

        return toast;

    }

    return null;

}



function clearProgress(toast) {

    try {

        clearNotification(toast);

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

function clearPostNarrationFinalizerTimers() {
    for (const timer of state.postNarrationFinalizerTimers.values()) {
        clearTimeout(timer);
    }
    state.postNarrationFinalizerTimers.clear();
    state.postNarrationFinalizers.clear();
}

function showBlockingError(error) {
    const message = error instanceof Error ? error.message : String(error);

    notifyError(message, `${EXTENSION_NAME}: generation aborted`, { timeOut: 15000, extendedTimeOut: 15000 });

    console.error(`[${EXTENSION_NAME}] generation aborted`, error);

}



function getChatId(context = getContext()) {

    return typeof context?.getCurrentChatId === 'function' ? context.getCurrentChatId() : '';

}



function getMessageKey(messageId, context = getContext()) {

    return `${getChatId(context)}:${messageId}`;

}



function getTrackerRoot(context = getContext()) {
    if (!isStoryEngineEnabled()) return null;
    if (!context?.chatMetadata) return null;
    context.chatMetadata.structuredPreflightTracker = context.chatMetadata.structuredPreflightTracker || { npcs: {}, user: {}, snapshots: {} };

    const root = context.chatMetadata.structuredPreflightTracker;

    root.npcs = root.npcs || {};
    root.user = normalizeTrackerUserState(root.user || {});
    root.powerActors = root.powerActors && typeof root.powerActors === 'object' ? root.powerActors : {};
    root.snapshots = root.snapshots || {};
    root.latentGrievances = normalizeLatentGrievances(root.latentGrievances || []);
    root.latentGrievanceArchive = mergeLatentGrievanceArchive(root.latentGrievanceArchive, root.latentGrievances);
    root.latentFavors = normalizeLatentFavors(root.latentFavors || []);
    root.latentFavorArchive = pruneLatentFavorArchive(root.latentFavorArchive, root.latentFavors, root.snapshots);
    root.userKnowledge = mergeUserKnowledgeLedger(root.userKnowledge || {}, {});
    root.userReputation = mergeUserReputationLedger(root.userReputation || {}, {});
    root.worldState = normalizeWorldState(root.worldState || {});
    root.sceneItems = normalizeSceneItemState(root.sceneItems || {}, root.worldState);
    root.descriptiveArchive = normalizeDescriptiveArchive(root.descriptiveArchive || {});
    root.worldProgression = normalizeWorldProgression(root.worldProgression || {});
    if (!root.worldMemoryBase || typeof root.worldMemoryBase !== 'object') {
        root.worldMemoryBase = normalizeWorldMemoryState({
            archive: root.descriptiveArchive,
            progression: root.worldProgression,
        });
    } else {
        root.worldMemoryBase = normalizeWorldMemoryState(root.worldMemoryBase);
    }
    root.economy = normalizeEconomyState(root.economy || {});
    root.boundCompanion = normalizeBoundCompanionState(root.boundCompanion || {});
    root.pendingBoundary = normalizePendingBoundaryState(root.pendingBoundary || {});
    root.spellCasting = normalizeSpellCastingState(root.spellCasting || {});
    root.health = normalizeHiddenHealth(root.health, { user: root.user, npcs: root.npcs });
    const seededPlayerTracker = seedPlayerTrackerFromPersonaIfEmpty(root, context);
    if (seededPlayerTracker) {

        saveMetadataDebounced(context);

    }

    root.rapportClock = normalizeRapportClockState(root.rapportClock);

    return root;

}

function resolveStoredLatentGrievances(root, storedIds, fallback = []) {
    if (Array.isArray(storedIds)) {
        return resolveLatentGrievanceIds(storedIds, root?.latentGrievanceArchive || {});
    }
    return normalizeLatentGrievances(fallback);
}

function resolveStoredLatentFavors(root, storedIds, fallback = []) {
    if (Array.isArray(storedIds)) {
        return resolveLatentFavorIds(storedIds, root?.latentFavorArchive || {});
    }
    return normalizeLatentFavors(fallback);
}



function getPlayerRoot(context = getContext()) {
    if (!isStoryEngineEnabled()) return null;
    if (!context?.chatMetadata) return null;
    context.chatMetadata[PLAYER_SETUP_KEY] = context.chatMetadata[PLAYER_SETUP_KEY] || {};
    const root = context.chatMetadata[PLAYER_SETUP_KEY];

    root.version = PLAYER_SETUP_VERSION;

    root.ready = Boolean(root.ready);

    root.disabled = Boolean(root.disabled);

    root.forceCreator = Boolean(root.forceCreator);

    root.sheet = root.sheet || null;

    root.stats = isValidCoreStats(root.stats) ? normalizeCoreStats(root.stats) : null;

    root.creator = normalizePlayerCreatorSetupState(root.creator);

    if (!root.ready && !root.disabled && !root.creator.stage) {

        root.creator.stage = 'offer';

    }

    return root;
}


function pruneRootTrackerSnapshots(root) {
    if (!root?.snapshots || typeof root.snapshots !== 'object') return;
    const entries = Object.entries(root.snapshots);
    if (entries.length > TRACKER_ROOT_SNAPSHOT_LIMIT) {
        entries
            .sort((left, right) => Number(left[1]?.savedAt || 0) - Number(right[1]?.savedAt || 0))
            .slice(0, entries.length - TRACKER_ROOT_SNAPSHOT_LIMIT)
            .forEach(([key]) => delete root.snapshots[key]);
    }
    root.latentFavorArchive = pruneLatentFavorArchive(root.latentFavorArchive, root.latentFavors, root.snapshots);
}

function normalizePlayerCreatorSetupState(creator) {
    const next = creator && typeof creator === 'object' ? creator : { stage: 'offer' };
    const stage = String(next.stage || 'offer');
    if (stage === 'reroll' || stage === 'swap') {
        next.stage = 'stats';
    }
    if (next.stage !== 'offer' && next.stage !== 'approved') {
        next.flow = next.flow === 'persona' ? 'persona' : 'new';
        const isStatsStage = next.stage === 'stats';
        const hasUsableDraft = isValidPlayerCreationStatsDraft(next.stats);
        const hasCompleteStats = isValidPlayerCreationStats(next.stats);
        if (!hasUsableDraft || (!isStatsStage && !hasCompleteStats)) {
            next.stats = next.flow === 'persona'
                ? suggestedPersonaPointBuyStats(next.personaAnalysis || {})
                : defaultPlayerPointBuyStats();
            next.stage = 'stats';
        }
    }
    return next;
}

function getProgressionRoot(context = getContext()) {
    if (!isStoryEngineEnabled()) return null;
    if (!context?.chatMetadata) return null;
    context.chatMetadata[PROGRESSION_KEY] = context.chatMetadata[PROGRESSION_KEY] || {};
    const root = context.chatMetadata[PROGRESSION_KEY];
    root.version = PROGRESSION_VERSION;
    root.accomplishments = Array.isArray(root.accomplishments)
        ? root.accomplishments.map(normalizeProgressionRecord).filter(Boolean)
        : [];
    root.spentAdvancements = Math.max(0, Math.floor(Number(root.spentAdvancements || 0)));
    root.breakthroughStat = normalizeBreakthroughStat(root.breakthroughStat);
    if (!root.breakthroughStat) {
        const personaStats = getPersonaCoreStats(context);
        const elevatedStats = PLAYER_STATS.filter(stat => Number(personaStats?.[stat] || 0) > PROGRESSION_MAX_STAT);
        if (elevatedStats.length === 1) root.breakthroughStat = elevatedStats[0];
    }
    root.pendingAdvancement = root.pendingAdvancement && typeof root.pendingAdvancement === 'object' ? root.pendingAdvancement : null;
    root.ui = root.ui && typeof root.ui === 'object' ? root.ui : {};
    return root;
}

function progressionPending(context = getContext()) {
    if (!isStoryEngineEnabled()) return false;
    const root = getProgressionRoot(context);
    return Boolean(getSettings().characterProgressionEnabled !== false && root?.pendingAdvancement);
}

function getCharacterCardFieldsSafe(context = getContext()) {
    try {

        return typeof context?.getCharacterCardFields === 'function' ? context.getCharacterCardFields() : {};

    } catch (error) {

        console.warn(`[${EXTENSION_NAME}] could not read character/persona fields for player setup.`, error);

        return {};

    }

}



function getPersonaCoreStats(context = getContext()) {

    return parseCoreStatsBlock(getPersonaText(context));

}



function seedPlayerTrackerFromPersonaIfEmpty(root, context = getContext()) {
    if (!root || root.personaInventorySeeded) return false;
    const user = normalizeTrackerUserState(root.user || {});
    if (user.gear.length || user.inventory.length || user.currency.length) {
        root.user = user;
        root.personaInventorySeeded = { skipped: true, reason: 'tracker_already_has_items', at: Date.now() };

        return false;

    }



    const persona = getPersonaText(context);

    const seed = extractPersonaTrackerSeed(persona);

    if (!seed.gear.length && !seed.inventory.length && !seed.currency.length) return false;



    root.user = normalizeTrackerUserState({

        ...user,

        gear: seed.gear,

        inventory: seed.inventory,

        currency: seed.currency,

    });

    root.personaInventorySeeded = {

        at: Date.now(),

        hash: hashTextForSeed(persona),

        gearCount: seed.gear.length,

        inventoryCount: seed.inventory.length,

        currencyCount: seed.currency.length,

    };
    return true;
}

function reseedPlayerTrackerFromPersona(root, context = getContext()) {
    if (!root) return false;
    const user = normalizeTrackerUserState(root.user || {});
    const persona = getPersonaText(context);
    const seed = extractPersonaTrackerSeed(persona);
    root.user = normalizeTrackerUserState({
        ...user,
        gear: seed.gear,
        inventory: seed.inventory,
        currency: seed.currency,
    });
    root.personaInventorySeeded = {
        at: Date.now(),
        hash: hashTextForSeed(persona),
        gearCount: seed.gear.length,
        inventoryCount: seed.inventory.length,
        currencyCount: seed.currency.length,
        forced: true,
    };
    return true;
}

function extractPersonaTrackerSeed(personaText) {
    const gear = [];
    const inventory = [];
    const currency = [];
    const explicitGear = extractPersonaListSection(personaText, ['gear', 'equipment', 'equipped']);
    const explicitCurrency = extractPersonaListSection(personaText, ['currency', 'money', 'coins', 'coin purse', 'funds']);

    const explicitInventory = extractPersonaListSection(personaText, ['inventory', 'items', 'carried items']);



    for (const item of explicitGear) addUniqueTrackerSeedItem(gear, item);

    for (const item of explicitCurrency) addUniqueTrackerSeedItem(currency, item);

    for (const item of explicitInventory) {

        if (!explicitCurrency.length && addPersonaCurrencyIfValid(currency, item)) {

            continue;

        }

        if (!explicitGear.length && looksLikeEquippedGear(item)) {

            addUniqueTrackerSeedItem(gear, item);

        } else {

            addUniqueTrackerSeedItem(inventory, item);

        }

    }



    return { gear, inventory, currency: normalizeCurrencyList(currency) };

}

function addPersonaCurrencyIfValid(list, item) {
    const text = String(item || '').trim();
    if (!/^(?:\$\s*\d|\d+(?:\.\d{1,2})?\s*(?:sv|silver|silvers|silver coins?|cr|credits?|dollars?|usd|crowns?|crn)\b)/i.test(text)) return false;
    const normalized = normalizeCurrencyList([item]);
    if (!normalized.length) return false;
    addUniqueTrackerSeedItem(list, normalized[0]);
    return true;
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

        .replace(/^\s*(?:[-*+\u2022\u2023\u2043\u2013\u2014]|[0-9]+[.)])\s+/, '')

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

function playerAdventureStartPending(context = getContext()) {
    const root = getPlayerRoot(context);
    return Boolean(root?.ready && root?.adventureStartPending && !root?.adventureStarted);
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

        return Number.isInteger(value) && value >= 1 && value <= PROGRESSION_MAX_BREAKTHROUGH_STAT;

    });

}



function normalizeCoreStats(stats) {

    return {

        PHY: clampNumber(stats?.PHY, 1, PROGRESSION_MAX_BREAKTHROUGH_STAT, 1),

        MND: clampNumber(stats?.MND, 1, PROGRESSION_MAX_BREAKTHROUGH_STAT, 1),

        CHA: clampNumber(stats?.CHA, 1, PROGRESSION_MAX_BREAKTHROUGH_STAT, 1),

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

    const numberPattern = '(1[0-5]|[1-9]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)';

    const statPattern = new RegExp(

        `(?:^|[^A-Za-z0-9])${stat}\\s*(?:stat|score|rating|attribute|value)?\\s*(?:(?:is|at|as|=|:|-)\\s*)?${numberPattern}(?:\\s*(?:out\\s+of\\s+(?:10|15)|of\\s+(?:10|15)))?(?=$|[^A-Za-z0-9])`,

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

    const pattern = /\b(1[0-5]|[1-9]|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen)\b/gi;

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

        eleven: 11,

        twelve: 12,

        thirteen: 13,

        fourteen: 14,

        fifteen: 15,

    };

    return words[text] || Number(text) || null;

}



function clampNumber(value, min, max, fallback) {

    const numeric = Number(value);

    if (!Number.isFinite(numeric)) return fallback;

    return Math.max(min, Math.min(max, Math.round(numeric)));

}



function defaultPlayerPointBuyStats() {
    return { PHY: 6, MND: 6, CHA: 6 };
}

function playerPointBuySpent(stats = {}) {
    const normalized = normalizePlayerCreationStats(stats);
    return PLAYER_STATS.reduce((sum, stat) => sum + Number(normalized[stat] || 0), 0);
}

function playerPointBuyRemaining(stats = {}) {
    return PLAYER_CREATION_STAT_POINTS - playerPointBuySpent(stats);
}

function normalizePlayerCreationStats(stats = {}) {
    const source = isValidCoreStats(stats) ? normalizeCoreStats(stats) : defaultPlayerPointBuyStats();
    const normalized = {};
    for (const stat of PLAYER_STATS) {
        normalized[stat] = clampNumber(source[stat], PLAYER_CREATION_MIN_STAT, PLAYER_CREATION_MAX_STAT, 6);
    }
    return normalized;
}

function isValidPlayerCreationStats(stats = {}) {
    if (!stats || typeof stats !== 'object') return false;
    const normalized = normalizePlayerCreationStats(stats);
    return PLAYER_STATS.every(stat => normalized[stat] === Number(stats[stat])) && playerPointBuySpent(normalized) === PLAYER_CREATION_STAT_POINTS;
}

function isValidPlayerCreationStatsDraft(stats = {}) {
    if (!stats || typeof stats !== 'object') return false;
    const normalized = normalizePlayerCreationStats(stats);
    const spent = playerPointBuySpent(normalized);
    return PLAYER_STATS.every(stat => normalized[stat] === Number(stats[stat]))
        && spent >= PLAYER_STATS.length * PLAYER_CREATION_MIN_STAT
        && spent <= PLAYER_CREATION_STAT_POINTS;
}

function suggestedPersonaPointBuyStats(analysis = {}) {
    const primary = PLAYER_STATS.includes(analysis?.PrimaryStat) ? analysis.PrimaryStat : 'PHY';
    const stats = defaultPlayerPointBuyStats();
    stats[primary] = PLAYER_CREATION_MAX_STAT;
    const secondary = PLAYER_STATS.find(stat => stat !== primary) || 'MND';
    stats[secondary] = Math.max(PLAYER_CREATION_MIN_STAT, stats[secondary] - 1);
    return stats;
}

function buildNewCharacterPointBuyState() {
    return {
        stage: 'stats',
        flow: 'new',
        createdAt: Date.now(),
        stats: defaultPlayerPointBuyStats(),
        retryNotes: [],
        identity: {
            sex: '',
            genre: 'Fantasy',
            raceMode: 'random',
            pickedRace: 'Human',
            specifiedRace: '',
            specifiedRaceDescriptionMode: 'system',
            specifiedRaceDescription: '',
            additionalDetailsMode: 'system',
            additionalDetails: '',
        },
    };
}


function buildPersonaPointBuyState(analysis, genre = 'Fantasy') {
    return {
        stage: 'stats',
        flow: 'persona',
        createdAt: Date.now(),
        stats: suggestedPersonaPointBuyStats(analysis),
        retryNotes: [],
        personaAnalysis: analysis,
        identity: {
            genre: normalizePlayerAdventureGenre(genre),
        },
    };
}



async function writePlayerSheetToPersona(sheetText, context = getContext(), actionIdentity = null) {
    if (actionIdentity) {
        assertStoryEngineEpochCurrent(actionIdentity, 'Persona update expired because the active chat or persona changed.');
    }
    return await writePersonaDescription(sheetText, context, actionIdentity ? {
        avatarId: actionIdentity.personaId,
        isCurrent: () => isCurrentStoryEngineEpoch(actionIdentity, context),
        expiredMessage: 'Persona update expired because the active chat or persona changed.',
    } : {});
}

function capturePersonaMetadataTransaction(context) {
    const metadata = context?.chatMetadata;
    if (!metadata || typeof metadata !== 'object') {
        throw new Error('Chat metadata is unavailable for the persona update.');
    }
    return {
        metadata,
        roots: Object.fromEntries(PERSONA_METADATA_TRANSACTION_KEYS.map(key => [key, {
            present: Object.hasOwn(metadata, key),
            value: Object.hasOwn(metadata, key) ? clone(metadata[key]) : undefined,
        }])),
    };
}

function restorePersonaMetadataTransaction(snapshot, context) {
    if (!snapshot?.metadata || context?.chatMetadata !== snapshot.metadata) return false;
    for (const [key, entry] of Object.entries(snapshot.roots || {})) {
        if (entry.present) snapshot.metadata[key] = clone(entry.value);
        else delete snapshot.metadata[key];
    }
    return true;
}

async function runPersonaMetadataTransaction(context, actionIdentity, operation) {
    const previousPersona = getPersonaText(context);
    const snapshot = capturePersonaMetadataTransaction(context);
    try {
        const result = await operation();
        if (actionIdentity) {
            assertStoryEngineEpochCurrent(actionIdentity, 'Persona transaction expired because the active chat or persona changed.');
        }
        await persistMetadata(context);
        if (actionIdentity) {
            assertStoryEngineEpochCurrent(actionIdentity, 'Persona transaction expired because the active chat or persona changed.');
        }
        return result;
    } catch (error) {
        const canRollback = !actionIdentity || isCurrentStoryEngineEpoch(actionIdentity, context);
        if (canRollback && restorePersonaMetadataTransaction(snapshot, context)) {
            try {
                if (getPersonaText(context) !== previousPersona) {
                    await writePersonaDescription(previousPersona, context, {
                        allowEmpty: true,
                        ...(actionIdentity ? {
                            avatarId: actionIdentity.personaId,
                            isCurrent: () => isCurrentStoryEngineEpoch(actionIdentity, context),
                            expiredMessage: 'Persona rollback expired because the active chat or persona changed.',
                        } : {}),
                    });
                } else {
                    await persistMetadata(context);
                }
            } catch (rollbackError) {
                console.error(`[${EXTENSION_NAME}] failed to roll back a persona and metadata transaction.`, rollbackError);
            }
        }
        throw error;
    }
}

function findPersonaSection(text, matcher) {
    const lines = String(text ?? '').split(/\r?\n/);
    let start = -1;
    let end = lines.length;
    for (let index = 0; index < lines.length; index += 1) {
        if (!isPersonaSectionHeading(lines[index])) continue;
        if (start >= 0) {
            end = index;
            break;
        }
        if (matcher(lines[index])) {
            start = index;
        }
    }
    return { lines, start, end };
}

function normalizedPersonaHeading(line) {
    return stripMarkdownFormatting(line)
        .replace(/^#{1,6}\s*/, '')
        .replace(/[:=]+$/g, '')
        .replace(/[^\p{L}\p{N}\s/&-]/gu, ' ')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
}

function isStatsSectionHeading(line) {
    return normalizedPersonaHeading(line) === 'stats';
}

function isAbilitiesSectionHeading(line) {
    const heading = normalizedPersonaHeading(line);
    return /\babilities\b/.test(heading) || /\bskills\b/.test(heading);
}

function isSpellsSectionHeading(line) {
    const heading = normalizedPersonaHeading(line);
    return /\bspells?\b/.test(heading);
}

function parseAbilityStartLine(line) {
    const text = String(line ?? '').trim();
    if (!text) return null;
    const heading = /^#{2,6}\s+(.+?)\s*$/.exec(text);
    if (heading && !isPersonaSectionHeading(text)) {
        return { name: cleanAbilityName(heading[1]) };
    }
    const bold = /^(?:[-*+]\s*)?\*\*(.+?)\*\*\s*(?:[:\u2014-]\s*)?/.exec(text);
    if (bold) return { name: cleanAbilityName(bold[1]) };
    const plain = /^(?:[-*+]\s*)?([A-Z][\p{L}\p{N}' -]{1,60})\s*(?::|\u2014| - )\s+/u.exec(text);
    if (plain) return { name: cleanAbilityName(plain[1]) };
    return null;
}

function cleanAbilityName(value) {
    return String(value ?? '')
        .replace(/[`*_~]/g, '')
        .replace(/\s+/g, ' ')
        .replace(/[:\u2014-]+$/g, '')
        .trim()
        .slice(0, 80);
}

function isEmptyAbilityPlaceholder(value) {
    const normalized = stripMarkdownFormatting(value)
        .replace(/^[-*+]\s*/gm, '')
        .replace(/[.:;]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim()
        .toLowerCase();
    return /^(?:none|n\/a|na|not specified|no ability|no abilities|no explicit ability|no explicit abilities)$/i.test(normalized);
}

function extractPersonaAbilities(personaText) {
    const section = findPersonaSection(personaText, isAbilitiesSectionHeading);
    return extractPersonaEntriesFromSection(section, 'Ability');
}

function extractPersonaSpells(personaText) {
    const section = findPersonaSection(personaText, isSpellsSectionHeading);
    return extractPersonaEntriesFromSection(section, 'Spell');
}

function buildRetryIdeaNotesFromSheetText(sheetText) {
    const notes = [];
    for (const entry of extractPersonaAbilities(sheetText)) {
        const text = clipText(String(entry?.text || entry?.name || '').trim(), 240);
        if (text) notes.push(`Ability: ${text}`);
    }
    for (const entry of extractPersonaSpells(sheetText)) {
        const text = clipText(String(entry?.text || entry?.name || '').trim(), 240);
        if (text) notes.push(`Spell: ${text}`);
    }
    return uniqueStrings(notes).slice(0, 8);
}

function extractPersonaEntriesFromSection(section, fallbackLabel = 'Entry') {
    if (section.start < 0) return [];
    const bodyText = section.lines.slice(section.start + 1, section.end).join('\n').trim();
    if (isEmptyAbilityPlaceholder(bodyText)) return [];
    const entries = [];
    for (let index = section.start + 1; index < section.end; index += 1) {
        const start = parseAbilityStartLine(section.lines[index]);
        if (!start) continue;
        entries.push({
            name: start.name || `${fallbackLabel} ${entries.length + 1}`,
            start,
            lineStart: index,
            lineEnd: section.end,
        });
    }
    if (!entries.length) {
        const first = findFirstNonBlankLine(section.lines, section.start + 1, section.end);
        const last = findLastNonBlankLine(section.lines, section.start + 1, section.end);
        if (first >= 0 && last >= first) {
            return [{
                name: `Existing ${fallbackLabel}`,
                text: section.lines.slice(first, last + 1).join('\n').trim(),
                lineStart: first,
                lineEnd: last + 1,
            }];
        }
        return [];
    }
    for (let index = 0; index < entries.length; index += 1) {
        let lineEnd = index + 1 < entries.length ? entries[index + 1].lineStart : section.end;
        while (lineEnd > entries[index].lineStart + 1 && !String(section.lines[lineEnd - 1] || '').trim()) {
            lineEnd -= 1;
        }
        entries[index].lineEnd = lineEnd;
        entries[index].text = section.lines.slice(entries[index].lineStart, lineEnd).join('\n').trim();
    }
    return entries;
}

function findFirstNonBlankLine(lines, start, end) {
    for (let index = start; index < end; index += 1) {
        if (String(lines[index] || '').trim()) return index;
    }
    return -1;
}

function findLastNonBlankLine(lines, start, end) {
    for (let index = end - 1; index >= start; index -= 1) {
        if (String(lines[index] || '').trim()) return index;
    }
    return -1;
}

function formatProgressionAbility(option) {
    const name = cleanAbilityName(option?.name);
    const description = String(option?.description || '').replace(/\s+/g, ' ').trim();
    if (!name || !description) throw new Error('Generated ability option is incomplete.');
    return `**${name}**\n- ${description}`;
}

function formatProgressionSpell(option) {
    const name = cleanAbilityName(option?.name);
    const description = String(option?.description || '').replace(/\s+/g, ' ').trim();
    if (!name || !description) throw new Error('Generated spell option is incomplete.');
    return `**${name}**\n- ${description}`;
}

function replaceAbilityInPersona(personaText, abilityIndex, option) {
    const section = findPersonaSection(personaText, isAbilitiesSectionHeading);
    const entries = extractPersonaAbilities(personaText);
    const index = Math.max(0, Math.floor(Number(abilityIndex)));
    const entry = entries[index];
    if (section.start < 0 || !entry) {
        throw new Error('Could not find the selected ability in the persona sheet.');
    }
    const lines = [...section.lines];
    lines.splice(entry.lineStart, Math.max(1, entry.lineEnd - entry.lineStart), formatProgressionAbility(option));
    return lines.join('\n').trim();
}

function appendSpellToPersona(personaText, option) {
    const section = findPersonaSection(personaText, isSpellsSectionHeading);
    const formatted = formatProgressionSpell(option);
    if (section.start < 0) {
        const trimmed = String(personaText || '').trim();
        return `${trimmed}${trimmed ? '\n\n' : ''}# SPELLS\n- ${formatted}`.trim();
    }

    const lines = [...section.lines];
    const existing = extractPersonaEntriesFromSection(section, 'Spell');
    if (!existing.length) {
        const start = section.start + 1;
        const end = section.end;
        lines.splice(start, Math.max(0, end - start), `- ${formatted}`);
        return lines.join('\n').trim();
    }

    lines.splice(section.end, 0, `- ${formatted}`);
    return lines.join('\n').trim();
}

function updatePersonaStatText(personaText, stat, value) {
    const statName = String(stat || '').toUpperCase();
    if (!PLAYER_STATS.includes(statName)) throw new Error('Choose a valid stat.');
    const nextValue = clampNumber(value, 1, PROGRESSION_MAX_BREAKTHROUGH_STAT, 1);
    const section = findPersonaSection(personaText, isStatsSectionHeading);
    const lines = [...section.lines];
    const start = section.start >= 0 ? section.start + 1 : 0;
    const end = section.start >= 0 ? section.end : lines.length;
    const pattern = new RegExp(`^(\\s*(?:[-*+]\\s*)?(?:\\*\\*)?${statName}(?:\\*\\*)?\\s*(?::|=|-)\\s*)(1[0-5]|[1-9])(\\b.*)$`, 'i');
    for (let index = start; index < end; index += 1) {
        const match = pattern.exec(lines[index]);
        if (!match) continue;
        lines[index] = `${match[1]}${nextValue}${match[3] || ''}`;
        return lines.join('\n').trim();
    }
    throw new Error(`Could not find ${statName} in the persona # STATS section.`);
}

function updatePersonaStatsText(personaText, stats = {}) {
    return PLAYER_STATS.reduce((text, stat) => (
        Number.isInteger(Number(stats?.[stat])) ? updatePersonaStatText(text, stat, Number(stats[stat])) : text
    ), String(personaText || ''));
}

function syncPlayerRootAfterPersonaEdit(context, nextText, stats = null) {
    const playerRoot = getPlayerRoot(context);
    if (!playerRoot) return;
    if (playerRoot.sheet) playerRoot.sheet.text = nextText;
    if (isValidCoreStats(stats)) playerRoot.stats = normalizeCoreStats(stats);
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

function getConfirmedSceneNpcNamesFromSnapshot(snapshot) {
    const npcs = normalizeDisplayTrackerNpcs(snapshot?.npcs || {});
    const displayState = normalizeVisibleNpcState(snapshot?.displayNpcState);
    return Object.keys(displayState)
        .filter(name => displayState[name].inactiveReplies === 0 && Boolean(npcs[name]));
}

function getConfirmedSceneNpcNames(context = getContext()) {
    return getConfirmedSceneNpcNamesFromSnapshot(getLatestTrackerDisplaySnapshot(context));
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

function collectNarrationUnderlinePhrases({ trackerDisplaySnapshot = null, pendingRun = null, context = null } = {}) {
    const phrases = [];
    const add = value => {
        const text = String(value ?? '').replace(/\s+/g, ' ').trim();
        if (!text || text.length < 3) return;
        if (/^(?:you|your|yours|he|him|his|she|her|hers|they|them|their|theirs|it|its)$/i.test(text)) return;
        if (/^(?:none|null|undefined|unknown)$/i.test(text)) return;
        phrases.push(text);
    };
    const addNameAliases = value => {
        const raw = String(value ?? '').trim();
        if (!isRealName(raw)) return;
        const spaced = raw.replace(/[_-]+/g, ' ').replace(/\s+/g, ' ').trim();
        add(raw);
        add(spaced);
        if (spaced && spaced === spaced.toLowerCase()) add(`the ${spaced}`);
    };

    const namePool = pendingRun?.nameGeneration?.namePool;
    for (const key of ['male', 'female', 'location']) {
        for (const name of toRealNameArray(namePool?.[key])) {
            addNameAliases(name);
        }
    }

    for (const name of Object.keys(normalizeDisplayTrackerNpcs(trackerDisplaySnapshot?.npcs || {}))) {
        addNameAliases(name);
    }

    const personaName = cleanTrackerDisplayName(getUserName(context));
    addNameAliases(personaName);

    for (const cardName of getActiveCardCharacterNames(context)) {
        addNameAliases(cardName);
    }

    return uniqueStrings(phrases)
        .filter(phrase => phrase.length >= 3)
        .sort((a, b) => b.length - a.length);
}

function buildNarrationUnderlineRegex(phrase) {
    const escaped = escapeRegExp(String(phrase || '').trim()).replace(/\s+/g, '\\s+');
    if (!escaped) return null;
    return new RegExp(`(^|[^\\p{L}\\p{N}_])(${escaped})(?![\\p{L}\\p{N}_])`, 'giu');
}

function underlineNarrationPhrases(text, phrases) {
    const source = String(text ?? '');
    if (!source || !phrases?.length) return source;
    return source
        .split(/(__[\s\S]*?__)/g)
        .map(part => {
            if (!part || /^__[\s\S]*__$/.test(part)) return part;
            let next = part;
            for (const phrase of phrases) {
                const pattern = buildNarrationUnderlineRegex(phrase);
                if (!pattern) continue;
                next = next.replace(pattern, (_match, prefix, found) => `${prefix}__${found}__`);
            }
            return next;
        })
        .join('');
}

function applyDeterministicNarrationFormatting(narrationText, options = {}) {
    if (!isStoryEngineEnabled()) return narrationText;
    const phrases = collectNarrationUnderlinePhrases(options);
    return underlineNarrationPhrases(narrationText, phrases);
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
    const powerActors = {
        ...(pendingRun?.powerActorsBefore || {}),
        ...(pendingRun?.powerActorsAfter || {}),
    };
    let latentGrievances = normalizeLatentGrievances(
        pendingRun?.latentGrievancesAfter ?? pendingRun?.latentGrievancesBefore ?? [],
    );
    let latentFavors = normalizeLatentFavors(
        pendingRun?.latentFavorsAfter ?? pendingRun?.latentFavorsBefore ?? [],
    );
    const userKnowledge = mergeUserKnowledgeLedger(pendingRun?.userKnowledgeBefore || {}, pendingRun?.userKnowledgeAfter || {});
    const userReputation = mergeUserReputationLedger(pendingRun?.userReputationBefore || {}, pendingRun?.userReputationAfter || {});
    const worldState = normalizeWorldState(pendingRun?.worldStateAfter || pendingRun?.worldStateBefore || {});
    const sceneItems = normalizeSceneItemState(
        pendingRun?.sceneItemsAfter || pendingRun?.sceneItemsBefore || {},
        worldState,
    );
    const economy = normalizeEconomyState(pendingRun?.economyAfter || pendingRun?.economyBefore || {});
    const boundCompanion = normalizeBoundCompanionState(pendingRun?.boundCompanionAfter || pendingRun?.boundCompanionBefore || {});
    const pendingBoundary = normalizePendingBoundaryState(pendingRun?.pendingBoundaryAfter || pendingRun?.pendingBoundaryBefore || {});
    const spellCasting = normalizeSpellCastingState(pendingRun?.spellCastingAfter || pendingRun?.spellCastingBefore || {});
    const promotionResult = applyExplicitNamePromotions(trackerAfter, {
        messageKey,
        assistantText,
    });
    syncPendingRunHealthNamePromotions(pendingRun, promotionResult.promotions);
    syncPendingRunLatentGrievanceNamePromotions(pendingRun, promotionResult.promotions);
    syncPendingRunLatentFavorNamePromotions(pendingRun, promotionResult.promotions);
    syncPendingRunWorldMemoryNamePromotions(pendingRun, promotionResult.promotions);
    latentGrievances = normalizeLatentGrievances(
        pendingRun?.latentGrievancesAfter ?? latentGrievances,
    );
    latentFavors = normalizeLatentFavors(
        pendingRun?.latentFavorsAfter ?? latentFavors,
    );

    const snapshot = {

        version: TRACKER_DISPLAY_VERSION,

        messageKey,

        type: pendingRun?.type || 'normal',

        savedAt: Date.now(),

        userCoreStats: pendingRun?.userCoreStats || report?.semanticLedger?.engineContext?.userCoreStats || null,
        user,
        hiddenHealth: cloneHiddenHealth(pendingRun?.healthAfter || pendingRun?.healthBefore),
        powerActors,
        latentGrievanceIds: latentGrievanceIds(latentGrievances),
        latentFavorIds: latentFavorIds(latentFavors),
        userKnowledge,
        userReputation,
        worldState,
        sceneItems,
        economy,
        boundCompanion,
        pendingBoundary,
        spellCasting,
        npcs: promotionResult.npcs,
    };
    const activeNames = getActiveDisplayNpcNamesFromReport(snapshot.npcs, report);

    for (const name of getMentionedDisplayNpcNames(snapshot.npcs, assistantText)) {

        activeNames.add(name);

    }

    return applyVisibleTrackerState(snapshot, activeNames, getPreviousTrackerDisplaySnapshot(messageKey));
}

function buildAdventureIntroPendingRun(context, pendingGeneration, narratorModelContext) {
    const trackerSnapshot = pendingGeneration?.trackerSnapshot || buildTrackerSnapshot(context);
    const playerTrackerSnapshot = pendingGeneration?.playerTrackerSnapshot || buildPlayerTrackerSnapshot(context);
    const powerActorSnapshot = pendingGeneration?.powerActorSnapshot || buildPowerActorSnapshot(context);
    const latentGrievanceSnapshot = pendingGeneration?.latentGrievanceSnapshot || buildLatentGrievanceSnapshot(context);
    const latentFavorSnapshot = pendingGeneration?.latentFavorSnapshot || buildLatentFavorSnapshot(context);
    const userKnowledgeSnapshot = pendingGeneration?.userKnowledgeSnapshot || buildUserKnowledgeSnapshot(context);
    const userReputationSnapshot = pendingGeneration?.userReputationSnapshot || buildUserReputationSnapshot(context);
    const worldStateSnapshot = pendingGeneration?.worldStateSnapshot || buildWorldStateSnapshot(context);
    const sceneItemStateSnapshot = pendingGeneration?.sceneItemStateSnapshot || buildSceneItemStateSnapshot(context);
    const descriptiveArchiveSnapshot = pendingGeneration?.descriptiveArchiveSnapshot || buildDescriptiveArchiveSnapshot(context);
    const worldProgressionSnapshot = pendingGeneration?.worldProgressionSnapshot || buildWorldProgressionSnapshot(context);
    const economySnapshot = pendingGeneration?.economySnapshot || buildEconomySnapshot(context);
    const boundCompanionSnapshot = pendingGeneration?.boundCompanionSnapshot || buildBoundCompanionSnapshot(context);
    const pendingBoundarySnapshot = pendingGeneration?.pendingBoundarySnapshot || buildPendingBoundarySnapshot(context);
    const spellCastingSnapshot = pendingGeneration?.spellCastingSnapshot || buildSpellCastingSnapshot(context, parseCoreStatsBlock(getPersonaText(context)));
    const nameGeneration = pendingGeneration?.nameGenerationSnapshot || {};
    const healthSnapshot = normalizeHiddenHealth(context?.chatMetadata?.structuredPreflightTracker?.health, {
        user: playerTrackerSnapshot,
        npcs: trackerSnapshot,
    });
    const worldMemory = prepareWorldMemoryNarration({
        archive: descriptiveArchiveSnapshot,
        progression: worldProgressionSnapshot,
        worldState: worldStateSnapshot,
        resolutionPacket: {},
        latestUserText: '',
    });
    const report = {
        semanticLedger: {},
        finalNarrativeHandoff: {
            resolutionPacket: {
                GOAL: 'Adventure intro',
                RollNeeded: 'N',
                RollReason: 'Adventure opening; mechanics pipeline skipped.',
                Outcome: 'no_roll',
                OutcomeTier: 'NONE',
                NPCInScene: [],
                ActionTargets: [],
                OppTargets: { NPC: [], ENV: [] },
                hostilesInScene: { NPC: [] },
                BenefitedObservers: [],
                HarmedObservers: [],
                InflictedInjuries: [],
            },
            npcHandoffs: [],
            proactivityResults: {},
            aggressionResults: {},
            nameGeneration,
            isekaiOpeningSeed: pendingGeneration?.isekaiOpeningSeed || null,
            sceneState: worldStateSnapshot,
            worldMemory,
        },
        trackerUpdate: {
            npcs: {},
            user: {},
            powerActors: {},
            latentGrievances: latentGrievanceSnapshot,
            latentFavors: latentFavorSnapshot,
            userKnowledge: {},
            userReputation: {},
            worldState: worldStateSnapshot,
            sceneItems: sceneItemStateSnapshot,
            descriptiveArchive: descriptiveArchiveSnapshot,
            worldProgression: worldProgressionSnapshot,
            economy: economySnapshot,
            boundCompanion: boundCompanionSnapshot,
            pendingBoundary: pendingBoundarySnapshot,
            spellCasting: spellCastingSnapshot,
        },
    };
    return {
        type: pendingGeneration?.type || 'normal',
        runEpoch: Number(pendingGeneration?.runEpoch ?? state.runEpoch),
        chatId: String(pendingGeneration?.chatId ?? getChatId(context)),
        personaId: String(pendingGeneration?.personaId ?? getActiveUserAvatar() ?? ''),
        mode: 'adventure_intro',
        trackerBefore: trackerSnapshot,
        trackerAfter: {},
        userBefore: playerTrackerSnapshot,
        userAfter: {},
        healthBefore: cloneHiddenHealth(healthSnapshot),
        healthAfter: cloneHiddenHealth(healthSnapshot),
        powerActorsBefore: powerActorSnapshot,
        powerActorsAfter: {},
        latentGrievancesBefore: latentGrievanceSnapshot,
        latentGrievancesAfter: latentGrievanceSnapshot,
        latentFavorsBefore: latentFavorSnapshot,
        latentFavorsAfter: latentFavorSnapshot,
        userKnowledgeBefore: userKnowledgeSnapshot,
        userKnowledgeAfter: {},
        userReputationBefore: userReputationSnapshot,
        userReputationAfter: {},
        worldStateBefore: worldStateSnapshot,
        worldStateAfter: worldStateSnapshot,
        sceneItemsBefore: sceneItemStateSnapshot,
        sceneItemsAfter: sceneItemStateSnapshot,
        descriptiveArchiveBefore: descriptiveArchiveSnapshot,
        descriptiveArchiveAfter: descriptiveArchiveSnapshot,
        worldProgressionBefore: worldProgressionSnapshot,
        worldProgressionAfter: worldProgressionSnapshot,
        economyBefore: economySnapshot,
        economyAfter: economySnapshot,
        boundCompanionBefore: boundCompanionSnapshot,
        boundCompanionAfter: boundCompanionSnapshot,
        pendingBoundaryBefore: pendingBoundarySnapshot,
        pendingBoundaryAfter: pendingBoundarySnapshot,
        spellCastingBefore: spellCastingSnapshot,
        spellCastingAfter: spellCastingSnapshot,
        nameGeneration,
        resolutionPacket: report.finalNarrativeHandoff.resolutionPacket,
        userCoreStats: playerTrackerSnapshot?.coreStats || null,
        contextualInjuryCaps: [],
        latestUserText: '',
        adventureIntro: true,
        adventureGenre: pendingGeneration?.adventureGenre || getActiveAdventureGenre(context),
        isekaiOpeningSeed: pendingGeneration?.isekaiOpeningSeed || null,
        narratorModelContext,
        report,
    };
}

function applyExplicitNamePromotions(npcs, { assistantText } = {}) {
    const normalized = normalizeDisplayTrackerNpcs(npcs);
    const activeNames = Object.entries(normalized)

        .filter(([, entry]) => entry?.lifecycle === 'Active')

        .map(([name]) => name);

    const promotions = getExplicitNamePromotions(assistantText, activeNames);

    const promotedOldNames = new Set();
    const appliedPromotions = [];



    for (const { oldName, newName } of promotions) {

        if (promotedOldNames.has(oldName)) continue;

        const oldEntry = normalized[oldName];

        const newEntry = normalized[newName];

        if (!oldEntry || oldEntry.lifecycle !== 'Active') continue;



        if (promoteTrackerEntry(normalized, oldName, newName)) {
            appliedPromotions.push({ oldName, newName: cleanRevealedTrackerName(newName) });
        }

        promotedOldNames.add(oldName);

    }



    return {

        npcs: normalized,
        promotions: appliedPromotions,

    };

}

function syncPendingRunHealthNamePromotions(pendingRun, promotions = []) {
    if (!pendingRun || !Array.isArray(promotions) || !promotions.length) return;
    for (const promotion of promotions) {
        if (pendingRun.healthBefore) {
            pendingRun.healthBefore = renameHiddenHealthNpc(pendingRun.healthBefore, promotion.oldName, promotion.newName);
        }
        if (pendingRun.healthAfter) {
            pendingRun.healthAfter = renameHiddenHealthNpc(pendingRun.healthAfter, promotion.oldName, promotion.newName);
        }
    }
}

function syncPendingRunLatentGrievanceNamePromotions(pendingRun, promotions = []) {
    if (!pendingRun || !Array.isArray(promotions) || !promotions.length) return;
    pendingRun.latentGrievancesAfter = renameLatentGrievanceTargets(
        pendingRun.latentGrievancesAfter ?? pendingRun.latentGrievancesBefore ?? [],
        promotions,
    );
}

function syncPendingRunLatentFavorNamePromotions(pendingRun, promotions = []) {
    if (!pendingRun || !Array.isArray(promotions) || !promotions.length) return;
    pendingRun.latentFavorsAfter = renameLatentFavorTargets(
        pendingRun.latentFavorsAfter ?? pendingRun.latentFavorsBefore ?? [],
        promotions,
    );
}

function syncPendingRunWorldMemoryNamePromotions(pendingRun, promotions = []) {
    if (!pendingRun || !Array.isArray(promotions) || !promotions.length) return;
    const combined = [
        ...(Array.isArray(pendingRun.worldMemoryNamePromotions) ? pendingRun.worldMemoryNamePromotions : []),
        ...promotions,
    ];
    const seen = new Set();
    pendingRun.worldMemoryNamePromotions = combined.filter(item => {
        const oldName = String(item?.oldName || '').trim();
        const newName = String(item?.newName || '').trim();
        const key = `${oldName.toLowerCase()}=>${newName.toLowerCase()}`;
        if (!oldName || !newName || seen.has(key)) return false;
        seen.add(key);
        return true;
    }).map(item => ({
        oldName: String(item.oldName).trim(),
        newName: String(item.newName).trim(),
    }));
}



function promoteTrackerEntry(npcs, oldName, newName) {
    const oldEntry = npcs?.[oldName];
    const cleanNewName = cleanRevealedTrackerName(newName);
    if (!oldEntry || !cleanNewName || cleanNewName.toLowerCase() === String(oldName || '').trim().toLowerCase()) return false;
    const newEntry = npcs[cleanNewName];
    npcs[cleanNewName] = normalizeTrackerEntry({

        ...oldEntry,

        ...(newEntry || {}),

        aliases: [...(oldEntry.aliases || []), oldName, ...(newEntry?.aliases || [])],

        lifecycle: 'Active',

    });
    delete npcs[oldName];
    return true;
}

function normalizeManualUserItemList(value) {
    const source = Array.isArray(value) ? value : [];
    const result = [];
    const seen = new Set();
    for (const item of source) {
        const text = cleanTrackerDeltaText(item);
        if (!text) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(text);
        if (result.length >= 40) break;
    }
    return result;
}

function updateLatestTrackerDisplaySnapshotUser(context, user) {
    const chat = context?.chat;
    const root = getTrackerRoot(context);
    if (!Array.isArray(chat)) return false;
    const normalizedUser = normalizeTrackerUserState(user || {});
    for (let index = chat.length - 1; index >= 0; index -= 1) {
        const message = chat[index];
        const snapshot = getMessageTrackerDisplaySnapshot(message);
        if (!snapshot?.npcs) continue;
        const nextSnapshot = {
            ...clone(snapshot),
            user: normalizedUser,
        };
        const messageKey = getMessageKey(index, context);
        if (root?.snapshots?.[messageKey]) {
            root.snapshots[messageKey].afterUser = clone(normalizedUser);
            root.snapshots[messageKey].display = {
                ...(root.snapshots[messageKey].display || {}),
                ...clone(nextSnapshot),
            };
        }
        setMessageTrackerDisplaySnapshot(message, nextSnapshot);
        return true;
    }
    return false;
}

async function saveManualUserTrackerItems({ gear, inventory }, context = getContext(), operationIdentity = createStoryEngineEpochIdentity(context)) {
    if (!isCurrentStoryEngineEpoch(operationIdentity, context)) return false;
    const root = getTrackerRoot(context);
    if (!root) return false;
    const nextUser = normalizeTrackerUserState({
        ...(root.user || {}),
        gear: normalizeManualUserItemList(gear),
        inventory: normalizeManualUserItemList(inventory),
    });
    root.user = nextUser;
    updateLatestTrackerDisplaySnapshotUser(context, nextUser);
    await persistMetadata(context);
    if (!isCurrentStoryEngineEpoch(operationIdentity, context)) return false;
    return true;
}

function reconcileNamedNpcDuplicates(npcs, beforeNpcs = {}, delta = null, pendingRun = null) {
    const normalized = normalizeDisplayTrackerNpcs(npcs || {});
    const previous = normalizeDisplayTrackerNpcs(beforeNpcs || {});
    const previousActivePromotable = Object.entries(previous)
        .filter(([name, entry]) => entry?.lifecycle === 'Active' && isPromotableTrackerName(name))
        .map(([name]) => name);
    if (previousActivePromotable.length !== 1) return normalized;

    const placeholder = previousActivePromotable[0];
    if (!normalized[placeholder] || normalized[placeholder].lifecycle !== 'Active') return normalized;

    const deltaNpcNames = new Set((delta?.npcs || [])
        .map(item => cleanRevealedTrackerName(item?.NPC))
        .filter(Boolean)
        .map(name => name.toLowerCase()));
    const explicitRevealed = (delta?.npcs || [])
        .some(item =>
            String(item?.NPC || '').trim().toLowerCase() === placeholder.toLowerCase()
            && cleanRevealedTrackerName(item?.revealedName));
    if (explicitRevealed) return normalized;

    const candidates = Object.keys(normalized).filter(name => {
        if (name.toLowerCase() === placeholder.toLowerCase()) return false;
        if (previous[name]) return false;
        if (isPromotableTrackerName(name)) return false;
        if (!deltaNpcNames.has(name.toLowerCase())) return false;
        const entry = normalized[name];
        return entry?.lifecycle === 'Active';
    });
    if (candidates.length !== 1) return normalized;

    if (promoteTrackerEntry(normalized, placeholder, candidates[0])) {
        const promotions = [{ oldName: placeholder, newName: candidates[0] }];
        syncPendingRunHealthNamePromotions(pendingRun, promotions);
        syncPendingRunLatentGrievanceNamePromotions(pendingRun, promotions);
        syncPendingRunLatentFavorNamePromotions(pendingRun, promotions);
        syncPendingRunWorldMemoryNamePromotions(pendingRun, promotions);
    }
    return normalized;
}


function buildTrackerUpdateForPersistence(displaySnapshot, hiddenHealth = null, latentGrievances = [], latentFavors = [], hiddenState = {}) {
    const update = {
        npcs: normalizeDisplayTrackerNpcs(displaySnapshot?.npcs || {}),
        user: normalizeTrackerUserState(displaySnapshot?.user || {}),
        powerActors: displaySnapshot?.powerActors || {},
        latentGrievances: normalizeLatentGrievances(latentGrievances),
        latentFavors: normalizeLatentFavors(latentFavors),
        userKnowledge: mergeUserKnowledgeLedger(displaySnapshot?.userKnowledge || {}, {}),
        userReputation: mergeUserReputationLedger(displaySnapshot?.userReputation || {}, {}),
        worldState: normalizeWorldState(displaySnapshot?.worldState || {}),
        sceneItems: normalizeSceneItemState(displaySnapshot?.sceneItems || {}, displaySnapshot?.worldState || {}),
        economy: normalizeEconomyState(displaySnapshot?.economy || {}),
        boundCompanion: normalizeBoundCompanionState(displaySnapshot?.boundCompanion || {}),
        pendingBoundary: normalizePendingBoundaryState(displaySnapshot?.pendingBoundary || {}),
        spellCasting: normalizeSpellCastingState(displaySnapshot?.spellCasting || {}),
        descriptiveArchive: normalizeDescriptiveArchive(hiddenState.descriptiveArchive || {}),
        worldProgression: normalizeWorldProgression(hiddenState.worldProgression || {}),
    };
    if (hiddenState.rapportClock) {
        update.rapportClock = normalizeRapportClockState(hiddenState.rapportClock);
    }
    if (hiddenHealth) {
        update.health = normalizeHiddenHealth(hiddenHealth, { user: update.user, npcs: update.npcs });
    }
    return update;
}


function mergePostNarrationTrackerDelta(snapshot, delta, options = {}) {

    if (!snapshot || !delta) return snapshot;

    const merged = clone(snapshot);
    const economyBefore = normalizeEconomyState(merged.economy || options.economyBefore || {});
    const economyDelta = delta.economy || {};
    const userDelta = {
        ...(delta.user || {}),
        currencyRemove: mergePendingPricePaymentCurrencyRemove(delta.user?.currencyRemove || [], economyBefore, economyDelta),
    };
    const userBefore = normalizeTrackerUserState(merged.user || {});
    const userAfter = applyTrackerDeltaToUserState(userBefore, userDelta);
    merged.user = reconcileUserEquipmentTiers({
        beforeUser: userBefore,
        afterUser: userAfter,
        userDelta,
        npcsBefore: merged.npcs || {},
        npcDeltas: delta.npcs || [],
        economyBefore,
        economyDelta,
    });
    merged.userKnowledge = mergeUserKnowledgeLedger(merged.userKnowledge || options.userKnowledgeBefore || {}, delta.userKnowledge || {});
    merged.userReputation = mergeUserReputationLedger(merged.userReputation || options.userReputationBefore || {}, delta.userReputation || {});
    const projectedWorldState = normalizeWorldState(merged.worldState || options.worldStateBefore || {});
    const postNarrationWorldStateDelta = removeAlreadyProjectedWorldStateDelta(
        delta.worldState || {},
        options.worldStateBefore || {},
        projectedWorldState,
    );
    merged.worldState = applyWorldStateDelta(projectedWorldState, postNarrationWorldStateDelta, {
        seed: options.messageKey || options.assistantText || '',
        adventureIntro: options.pendingRun?.adventureIntro === true,
        allowExplicitWeather: options.pendingRun?.adventureIntro === true,
    });
    merged.sceneItems = normalizeSceneItemState(
        delta.sceneItemState || merged.sceneItems || {},
        merged.worldState,
    );
    merged.economy = applyEconomyDelta(economyBefore, economyDelta, {
        messageKey: options.messageKey || '',
    });
    merged.boundCompanion = applyBoundCompanionDelta(merged.boundCompanion || options.boundCompanionBefore || {}, delta.boundCompanion || {});
    merged.pendingBoundary = applyPendingBoundaryDelta(merged.pendingBoundary || options.pendingBoundaryBefore || {}, delta.pendingBoundary || {});
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

        if (revealedName) {

            promoteTrackerEntry(npcs, name, revealedName);
            const promotions = [{ oldName: name, newName: revealedName }];
            syncPendingRunHealthNamePromotions(options.pendingRun, promotions);
            syncPendingRunLatentGrievanceNamePromotions(options.pendingRun, promotions);
            syncPendingRunLatentFavorNamePromotions(options.pendingRun, promotions);
            syncPendingRunWorldMemoryNamePromotions(options.pendingRun, promotions);
        }
    }
    assignMissingDisplayNpcPersonalitySummaries(npcs, 'post-narration', options.context);
    const textPromotions = applyExplicitNamePromotions(npcs, options);
    syncPendingRunHealthNamePromotions(options.pendingRun, textPromotions.promotions);
    syncPendingRunLatentGrievanceNamePromotions(options.pendingRun, textPromotions.promotions);
    syncPendingRunLatentFavorNamePromotions(options.pendingRun, textPromotions.promotions);
    syncPendingRunWorldMemoryNamePromotions(options.pendingRun, textPromotions.promotions);
    merged.npcs = reconcileNamedNpcDuplicates(textPromotions.npcs, options.beforeNpcs, delta, options.pendingRun);
    merged.latentGrievanceIds = latentGrievanceIds(
        options.pendingRun?.latentGrievancesAfter ?? options.pendingRun?.latentGrievancesBefore ?? [],
    );
    merged.latentFavorIds = latentFavorIds(
        options.pendingRun?.latentFavorsAfter ?? options.pendingRun?.latentFavorsBefore ?? [],
    );
    assignMissingDisplayNpcPersonalitySummaries(merged.npcs, 'post-narration', options.context);
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
        userChanged: trackerDeltaHasChanges(userDelta, true),
        npcChanged: (delta.npcs || []).some(item => trackerDeltaHasChanges(item, false)),
        userKnowledgeChanged: userKnowledgeDeltaHasChanges(delta.userKnowledge),
        worldStateChanged: worldStateDeltaHasChanges(postNarrationWorldStateDelta),
        sceneItemsChanged: JSON.stringify(normalizeSceneItemState(snapshot?.sceneItems || {}, snapshot?.worldState || {}))
            !== JSON.stringify(merged.sceneItems),
        economyChanged: economyDeltaHasChanges(economyDelta),
        boundCompanionChanged: boundCompanionDeltaHasChanges(delta.boundCompanion),
        pendingBoundaryChanged: pendingBoundaryDeltaHasChanges(delta.pendingBoundary),
    };
    return merged;
}

function assignMissingDisplayNpcPersonalitySummaries(npcs, salt = '', context = null) {
    if (!npcs || typeof npcs !== 'object') return;
    for (const [name, value] of Object.entries(npcs)) {
        if (!isRealName(name)) continue;
        const entry = normalizeTrackerEntry(value || {});
        if (!cleanPersonalitySummary(entry.personalitySummary) && !isActiveCardCharacterName(name, context)) {
            entry.personalitySummary = deterministicPersonalitySummaryForName(name, salt);
        }
        npcs[name] = normalizeTrackerEntry(entry);
    }
}

function isActiveCardCharacterName(name, context = null) {
    const wanted = String(name || '').trim().toLowerCase();
    if (!wanted) return false;
    return getActiveCardCharacterNames(context).some(candidate => candidate.toLowerCase() === wanted);
}

function getActiveCardCharacterNames(context = null) {
    const fields = getCharacterCardFieldsSafe(context);
    return uniqueNames([
        context?.name2,
        context?.characterName,
        fields?.name2,
        fields?.characterName,
        fields?.name,
        fields?.char_name,
        fields?.avatarName,
    ].map(name => String(name || '').trim()).filter(isRealName));
}

function userKnowledgeDeltaHasChanges(delta) {
    return Boolean((delta?.personal || []).length || (delta?.reputation || []).length);
}

function worldStateDeltaHasChanges(delta) {
    if (!delta || typeof delta !== 'object') return false;
    return [
        'reputationLocation',
        'place',
        'area',
        'indoors',
        'timeOfDay',
    ].some(key => delta[key] !== null && delta[key] !== undefined && delta[key] !== '')
        || !['none', undefined, null, ''].includes(delta.timeAdvance)
        || Boolean(delta.weatherCondition)
        || delta.weatherTick === 'tick';
}

function economyDeltaHasChanges(delta) {
    if (!delta || typeof delta !== 'object') return false;
    return Boolean(delta.payPendingPrice || delta.clearPendingPrice || delta.pendingPrice);
}


function findExistingTrackerName(npcs, wantedName) {
    return findTrackerEntryName(npcs, wantedName);

}



function trackerDeltaHasChanges(delta, includePlayerFields) {

    if (!delta || typeof delta !== 'object') return false;

    if (normalizeTrackerDeltaCondition(delta.condition) !== 'unchanged') return true;

    if (!includePlayerFields && cleanRevealedTrackerName(delta.revealedName)) return true;

    if (!includePlayerFields && cleanPersonalitySummary(delta.personalitySummary)) return true;

    if (!includePlayerFields && ['background', 'knowledge', 'practicedSkills'].some(field => normalizeNpcCapabilityField(delta[field]))) return true;

    const fields = includePlayerFields

        ? ['woundsAdd', 'woundsRemove', 'statusAdd', 'statusRemove', 'gearAdd', 'gearRemove', 'inventoryAdd', 'inventoryRemove', 'currencyAdd', 'currencyRemove', 'tasksAdd', 'tasksRemove', 'commitmentsAdd', 'commitmentsRemove']

        : ['woundsAdd', 'woundsRemove', 'statusAdd', 'statusRemove', 'gearAdd', 'gearRemove', 'inventoryAdd', 'inventoryRemove', 'currencyAdd', 'currencyRemove'];

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

        equipmentTiers: source.equipmentTiers.map(entry => ({ ...entry })),

        currency: [...source.currency],

        tasks: [...source.tasks],

        commitments: [...source.commitments],

    };

    const condition = normalizeTrackerDeltaCondition(delta?.condition);

    if (condition !== 'unchanged') result.condition = condition;

    result.wounds = applyTrackerListDelta(result.wounds, delta?.woundsAdd, delta?.woundsRemove);

    result.statusEffects = applyTrackerListDelta(result.statusEffects, delta?.statusAdd, delta?.statusRemove);

    result.gear = applyTrackerListDelta(result.gear, delta?.gearAdd, delta?.gearRemove);

    result.inventory = applyTrackerListDelta(result.inventory, delta?.inventoryAdd, delta?.inventoryRemove);

    result.currency = applyCurrencyDelta(result.currency, delta?.currencyAdd, delta?.currencyRemove);

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

        background: source.background || '',

        knowledge: source.knowledge || '',

        practicedSkills: source.practicedSkills || '',

        condition: source.condition,

        wounds: [...source.wounds],

        statusEffects: [...source.statusEffects],

        gear: [...source.gear],

        inventory: [...source.inventory],

        currency: [...source.currency],

    };

    const personalitySummary = cleanPersonalitySummary(delta?.personalitySummary);

    if (personalitySummary) result.personalitySummary = personalitySummary;

    for (const field of ['background', 'knowledge', 'practicedSkills']) {
        const value = normalizeNpcCapabilityField(delta?.[field]);
        if (value) result[field] = value;
    }

    const condition = normalizeTrackerDeltaCondition(delta?.condition);

    if (condition !== 'unchanged') result.condition = condition;

    result.wounds = applyTrackerListDelta(result.wounds, delta?.woundsAdd, delta?.woundsRemove);

    result.statusEffects = applyTrackerListDelta(result.statusEffects, delta?.statusAdd, delta?.statusRemove);

    result.gear = applyTrackerListDelta(result.gear, delta?.gearAdd, delta?.gearRemove);

    result.inventory = applyTrackerListDelta(result.inventory, delta?.inventoryAdd, delta?.inventoryRemove);

    result.currency = applyCurrencyDelta(result.currency, delta?.currencyAdd, delta?.currencyRemove);

    return result;

}



function normalizeTrackerDeltaCondition(value) {

    const text = String(value ?? 'unchanged').trim().toLowerCase().replace(/[\s-]+/g, '_');

    if (text === 'defeated') return 'incapacitated';

    return ['unchanged', 'healthy', 'bruised', 'wounded', 'badly_wounded', 'critical', 'incapacitated', 'dead'].includes(text) ? text : 'unchanged';

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

    return filtered.slice(-40);

}



function cleanTrackerDeltaText(value) {

    const text = String(value ?? '').trim().replace(/^\[/, '').replace(/\]$/, '').replace(/^["']|["']$/g, '').trim();

    if (!text || ['(none)', 'none', 'null', 'n/a', 'unchanged'].includes(text.toLowerCase())) return '';

    return text.slice(0, 140);

}



function cleanPersonalitySummary(value) {
    const text = stripPersonalityMannerismFields(String(value ?? '').trim().replace(/\s+/g, ' ').replace(/^["']|["']$/g, '').trim());
    if (!text || ['(none)', 'none', 'null', 'n/a', 'unknown', 'unchanged'].includes(text.toLowerCase())) return '';
    return text.slice(0, 320);
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


function uniqueStrings(values) {

    const result = [];

    const seen = new Set();

    for (const value of values || []) {

        const text = String(value ?? '').trim();

        if (!text) continue;

        const key = text.toLowerCase();

        if (seen.has(key)) continue;

        seen.add(key);

        result.push(text);

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


function buildWorldMemorySwipeSnapshot(messageKey, pendingRun = {}) {
    const before = {
        archive: pendingRun.descriptiveArchiveBefore || {},
        progression: pendingRun.worldProgressionBefore || {},
    };
    const after = {
        archive: pendingRun.descriptiveArchiveAfter || pendingRun.descriptiveArchiveBefore || {},
        progression: pendingRun.worldProgressionAfter || pendingRun.worldProgressionBefore || {},
    };
    return {
        version: WORLD_MEMORY_SWIPE_VERSION,
        messageKey,
        savedAt: Date.now(),
        patch: createWorldMemoryPatch(before, after),
    };
}


function setMessageWorldMemorySwipeSnapshot(message, snapshot) {
    if (!message || message.is_user || !snapshot) return;
    const swipeId = getMessageSwipeId(message);
    message.extra = message.extra || {};
    message.extra[WORLD_MEMORY_SWIPE_EXTRA_KEY] = message.extra[WORLD_MEMORY_SWIPE_EXTRA_KEY] || {};
    message.extra[WORLD_MEMORY_SWIPE_EXTRA_KEY][swipeId] = clone(snapshot);

    const swipeInfo = ensureSwipeInfoEntry(message, swipeId);
    if (swipeInfo) {
        swipeInfo.extra[WORLD_MEMORY_SWIPE_EXTRA_KEY] = swipeInfo.extra[WORLD_MEMORY_SWIPE_EXTRA_KEY] || {};
        swipeInfo.extra[WORLD_MEMORY_SWIPE_EXTRA_KEY][swipeId] = clone(snapshot);
    }
}


function getMessageWorldMemorySwipeSnapshot(message) {
    if (!message || message.is_user) return null;
    const swipeId = getMessageSwipeId(message);
    return message.extra?.[WORLD_MEMORY_SWIPE_EXTRA_KEY]?.[swipeId]
        || message.swipe_info?.[swipeId]?.extra?.[WORLD_MEMORY_SWIPE_EXTRA_KEY]?.[swipeId]
        || null;
}

function normalizeProseGuardSpanOffset(value) {
    const normalized = Number(value);
    return Number.isInteger(normalized) && normalized >= 0 ? normalized : null;
}

function sanitizeProseGuardFindingForStorage(finding) {
    if (!finding || typeof finding !== 'object') return null;
    return {
        id: String(finding.id || ''),
        sentence: String(finding.sentence || ''),
        start: normalizeProseGuardSpanOffset(finding.start),
        end: normalizeProseGuardSpanOffset(finding.end),
        ruleNames: Array.isArray(finding.ruleNames) ? finding.ruleNames.map(value => String(value)) : [],
        matches: Array.isArray(finding.matches)
            ? finding.matches.map(match => ({
                ruleName: String(match?.ruleName || ''),
                phrase: String(match?.phrase || ''),
                matchedPhrase: String(match?.matchedPhrase || ''),
                offsetStart: normalizeProseGuardSpanOffset(match?.offsetStart)
                    ?? (normalizeProseGuardSpanOffset(match?.start) != null
                        ? normalizeProseGuardSpanOffset(match.start) - (normalizeProseGuardSpanOffset(finding.start) || 0)
                        : null),
                offsetEnd: normalizeProseGuardSpanOffset(match?.offsetEnd)
                    ?? (normalizeProseGuardSpanOffset(match?.end) != null
                        ? normalizeProseGuardSpanOffset(match.end) - (normalizeProseGuardSpanOffset(finding.start) || 0)
                        : null),
            }))
            : [],
        status: String(finding.status || 'pending'),
        operation: String(finding.operation || ''),
        replacementText: finding.replacementText ? String(finding.replacementText) : '',
        attemptedOperation: String(finding.attemptedOperation || ''),
        attemptedReplacement: finding.attemptedReplacement ? String(finding.attemptedReplacement) : '',
        failureReason: finding.failureReason ? String(finding.failureReason) : '',
    };
}

function sanitizeProseGuardStateForStorage(value) {
    if (!value || typeof value !== 'object') return null;
    const findings = Array.isArray(value.findings)
        ? value.findings.map(sanitizeProseGuardFindingForStorage).filter(Boolean)
        : [];
    const changes = Array.isArray(value.changes)
        ? value.changes.map(change => ({
            findingId: String(change?.findingId || ''),
            operation: String(change?.operation || (change?.replacementText ? 'replace' : 'delete')),
            start: normalizeProseGuardSpanOffset(change?.start),
            end: normalizeProseGuardSpanOffset(change?.end),
            sourceStart: normalizeProseGuardSpanOffset(change?.sourceStart),
            sourceEnd: normalizeProseGuardSpanOffset(change?.sourceEnd),
            originalText: String(change?.originalText || ''),
            replacementText: String(change?.replacementText || ''),
            removedText: String(change?.removedText || ''),
            anchorBefore: String(change?.anchorBefore || ''),
            anchorAfter: String(change?.anchorAfter || ''),
            ruleNames: Array.isArray(change?.ruleNames) ? change.ruleNames.map(value => String(value)) : [],
            matches: Array.isArray(change?.matches) ? change.matches.map(match => ({
                ruleName: String(match?.ruleName || ''),
                phrase: String(match?.phrase || ''),
                matchedPhrase: String(match?.matchedPhrase || ''),
                offsetStart: normalizeProseGuardSpanOffset(match?.offsetStart),
                offsetEnd: normalizeProseGuardSpanOffset(match?.offsetEnd),
            })) : [],
            status: String(change?.status || 'applied'),
        })).filter(change => change.findingId && change.originalText && ['replace', 'delete'].includes(change.operation))
        : [];
    const repairAttempts = Array.isArray(value.repairAttempts)
        ? value.repairAttempts.map(attempt => ({
            findingId: String(attempt?.findingId || ''),
            sourceStart: normalizeProseGuardSpanOffset(attempt?.sourceStart),
            originalText: String(attempt?.originalText || ''),
            operation: String(attempt?.operation || ''),
            replacementText: String(attempt?.replacementText || ''),
            reason: String(attempt?.reason || ''),
            attempt: Number.isInteger(Number(attempt?.attempt)) ? Number(attempt.attempt) : 0,
        })).filter(attempt => attempt.findingId || attempt.originalText || attempt.replacementText || attempt.reason)
        : [];
    return {
        version: PROSE_GUARD_EXTRA_VERSION,
        mode: normalizeProseGuardMode(value.mode) || PROSE_GUARD_MODES.REVIEW,
        savedAt: Number(value.savedAt) || Date.now(),
        findings,
        changes,
        repairAttempts,
        automaticRepairFailed: value.automaticRepairFailed === true,
        error: value.error ? String(value.error) : '',
    };
}

function setMessageProseGuardState(message, value) {
    if (!isAssistantNarrationMessage(message)) return;
    const payload = sanitizeProseGuardStateForStorage(value);
    if (!payload) return clearMessageProseGuardState(message);
    const swipeId = getMessageSwipeId(message);
    message.extra = message.extra || {};
    message.extra[PROSE_GUARD_EXTRA_KEY] = message.extra[PROSE_GUARD_EXTRA_KEY] || {};
    message.extra[PROSE_GUARD_EXTRA_KEY][swipeId] = payload;

    const swipeInfo = ensureSwipeInfoEntry(message, swipeId);
    if (swipeInfo) {
        swipeInfo.extra[PROSE_GUARD_EXTRA_KEY] = swipeInfo.extra[PROSE_GUARD_EXTRA_KEY] || {};
        swipeInfo.extra[PROSE_GUARD_EXTRA_KEY][swipeId] = clone(payload);
    }
}

function getMessageProseGuardState(message) {
    if (!isAssistantNarrationMessage(message)) return null;
    const swipeId = getMessageSwipeId(message);
    const payload = message.extra?.[PROSE_GUARD_EXTRA_KEY]?.[swipeId]
        || message.swipe_info?.[swipeId]?.extra?.[PROSE_GUARD_EXTRA_KEY]?.[swipeId]
        || null;
    return sanitizeProseGuardStateForStorage(payload);
}

function clearMessageProseGuardState(message) {
    if (!isAssistantNarrationMessage(message)) return;
    const swipeId = getMessageSwipeId(message);
    if (message.extra?.[PROSE_GUARD_EXTRA_KEY]) {
        delete message.extra[PROSE_GUARD_EXTRA_KEY][swipeId];
    }
    const swipeInfo = message.swipe_info?.[swipeId];
    if (swipeInfo?.extra?.[PROSE_GUARD_EXTRA_KEY]) {
        delete swipeInfo.extra[PROSE_GUARD_EXTRA_KEY][swipeId];
    }
}

function compactProseGuardPendingRun(pendingRun) {
    if (!pendingRun || typeof pendingRun !== 'object') return null;
    const compact = clone(pendingRun);
    const report = pendingRun.report || {};
    compact.report = {
        finalNarrativeHandoff: clone(report.finalNarrativeHandoff || {}),
        semanticLedger: {
            engineContext: clone(report.semanticLedger?.engineContext || {}),
            trackerUpdateEngine: {
                npcs: clone(report.semanticLedger?.trackerUpdateEngine?.npcs || []),
            },
        },
    };
    return compact;
}

function sanitizeProseGuardReconciliationSeed(value) {
    if (!value || typeof value !== 'object') return null;
    const pendingRun = compactProseGuardPendingRun(value.pendingRun);
    const messageKey = String(value.messageKey || '').trim();
    if (!pendingRun || !messageKey) return null;
    return {
        version: PROSE_GUARD_RECONCILIATION_EXTRA_VERSION,
        messageKey,
        type: String(value.type || pendingRun.type || 'normal'),
        savedAt: Number(value.savedAt) || Date.now(),
        pendingRun,
    };
}

function setMessageProseGuardReconciliationSeed(message, value) {
    if (!isAssistantNarrationMessage(message)) return;
    const payload = sanitizeProseGuardReconciliationSeed(value);
    if (!payload) return clearMessageProseGuardReconciliationSeed(message);
    const swipeId = getMessageSwipeId(message);
    message.extra = message.extra || {};
    message.extra[PROSE_GUARD_RECONCILIATION_EXTRA_KEY] = message.extra[PROSE_GUARD_RECONCILIATION_EXTRA_KEY] || {};
    message.extra[PROSE_GUARD_RECONCILIATION_EXTRA_KEY][swipeId] = payload;

    const swipeInfo = ensureSwipeInfoEntry(message, swipeId);
    if (swipeInfo) {
        swipeInfo.extra[PROSE_GUARD_RECONCILIATION_EXTRA_KEY] = swipeInfo.extra[PROSE_GUARD_RECONCILIATION_EXTRA_KEY] || {};
        swipeInfo.extra[PROSE_GUARD_RECONCILIATION_EXTRA_KEY][swipeId] = clone(payload);
    }
}

function getMessageProseGuardReconciliationSeed(message) {
    if (!isAssistantNarrationMessage(message)) return null;
    const swipeId = getMessageSwipeId(message);
    const payload = message.extra?.[PROSE_GUARD_RECONCILIATION_EXTRA_KEY]?.[swipeId]
        || message.swipe_info?.[swipeId]?.extra?.[PROSE_GUARD_RECONCILIATION_EXTRA_KEY]?.[swipeId]
        || null;
    if (Number(payload?.version) !== PROSE_GUARD_RECONCILIATION_EXTRA_VERSION) return null;
    return sanitizeProseGuardReconciliationSeed(payload);
}

function clearMessageProseGuardReconciliationSeed(message) {
    if (!isAssistantNarrationMessage(message)) return;
    const swipeId = getMessageSwipeId(message);
    if (message.extra?.[PROSE_GUARD_RECONCILIATION_EXTRA_KEY]) {
        delete message.extra[PROSE_GUARD_RECONCILIATION_EXTRA_KEY][swipeId];
    }
    const swipeInfo = message.swipe_info?.[swipeId];
    if (swipeInfo?.extra?.[PROSE_GUARD_RECONCILIATION_EXTRA_KEY]) {
        delete swipeInfo.extra[PROSE_GUARD_RECONCILIATION_EXTRA_KEY][swipeId];
    }
}


function rebuildWorldMemoryFromSelectedSwipes(context = getContext(), options = {}) {
    const root = getTrackerRoot(context);
    if (!root) return false;
    const previous = normalizeWorldMemoryState({
        archive: root.descriptiveArchive,
        progression: root.worldProgression,
    });
    let memory = normalizeWorldMemoryState(root.worldMemoryBase || {});
    let applied = false;
    const beforeMessageId = Number.isFinite(Number(options.beforeMessageId))
        ? Number(options.beforeMessageId)
        : null;
    for (let messageId = 0; messageId < (context?.chat?.length || 0); messageId += 1) {
        if (beforeMessageId != null && messageId >= beforeMessageId) break;
        const message = context.chat[messageId];
        if (!message || message.is_user) continue;
        const snapshot = getMessageWorldMemorySwipeSnapshot(message);
        if (!snapshot || snapshot.version !== WORLD_MEMORY_SWIPE_VERSION) continue;
        if (snapshot.messageKey !== getMessageKey(messageId, context)) continue;
        memory = applyWorldMemoryPatch(memory, snapshot.patch || {});
        applied = true;
    }
    root.descriptiveArchive = memory.archive;
    root.worldProgression = memory.progression;
    return applied || JSON.stringify(previous) !== JSON.stringify(memory);
}


function buildProgressionSwipeSnapshot(messageKey, context = getContext()) {
    const root = getProgressionRoot(context);
    const records = root?.accomplishments
        ?.filter(item => item?.messageKey === messageKey)
        .map(normalizeProgressionRecord)
        .filter(Boolean) || [];
    const record = records[records.length - 1] || null;
    return {
        version: PROGRESSION_SWIPE_VERSION,
        messageKey,
        savedAt: Date.now(),
        record: record ? clone(record) : null,
    };
}


function setMessageProgressionSwipeSnapshot(message, snapshot) {
    if (!message || message.is_user || !snapshot) return;
    const swipeId = getMessageSwipeId(message);
    message.extra = message.extra || {};
    message.extra[PROGRESSION_SWIPE_EXTRA_KEY] = message.extra[PROGRESSION_SWIPE_EXTRA_KEY] || {};
    message.extra[PROGRESSION_SWIPE_EXTRA_KEY][swipeId] = clone(snapshot);

    const swipeInfo = ensureSwipeInfoEntry(message, swipeId);
    if (swipeInfo) {
        swipeInfo.extra[PROGRESSION_SWIPE_EXTRA_KEY] = swipeInfo.extra[PROGRESSION_SWIPE_EXTRA_KEY] || {};
        swipeInfo.extra[PROGRESSION_SWIPE_EXTRA_KEY][swipeId] = clone(snapshot);
    }
}


function getMessageProgressionSwipeSnapshot(message) {
    if (!message || message.is_user) return null;
    const swipeId = getMessageSwipeId(message);
    return message.extra?.[PROGRESSION_SWIPE_EXTRA_KEY]?.[swipeId]
        || message.swipe_info?.[swipeId]?.extra?.[PROGRESSION_SWIPE_EXTRA_KEY]?.[swipeId]
        || null;
}


function restoreProgressionFromMessageSwipe(messageId, context = getContext()) {
    const message = context?.chat?.[messageId];
    const snapshot = getMessageProgressionSwipeSnapshot(message);
    if (!snapshot || snapshot.version !== PROGRESSION_SWIPE_VERSION) return false;

    const messageKey = getMessageKey(messageId, context);
    if (snapshot.messageKey !== messageKey) return false;
    const root = getProgressionRoot(context);
    if (!root) return false;

    const current = root.accomplishments.filter(record => record.messageKey === messageKey);
    if (current.some(record => progressionRecordXpSpent(record) > 0)) {
        return false;
    }

    const removedIds = new Set(current.map(record => record.id));
    root.accomplishments = root.accomplishments.filter(record => record.messageKey !== messageKey);
    if (root.pendingAdvancement?.sourceRecordIds?.some(id => removedIds.has(id))) {
        root.pendingAdvancement = null;
        root.ui = {};
    }

    const selectedRecord = normalizeProgressionRecord(snapshot.record);
    if (selectedRecord) {
        root.accomplishments.push({ ...selectedRecord, messageKey });
        root.accomplishments = root.accomplishments
            .map(normalizeProgressionRecord)
            .filter(Boolean)
            .slice(-PROGRESSION_RECORD_HISTORY_LIMIT);
    }
    maybeCreateProgressionPendingAdvancement(root);
    return true;
}



function getLatestTrackerDisplayRecord(context = getContext()) {

    const chat = context?.chat;

    if (!Array.isArray(chat)) return null;

    for (let index = chat.length - 1; index >= 0; index -= 1) {

        const snapshot = getMessageTrackerDisplaySnapshot(chat[index]);

        if (snapshot?.npcs) return { messageId: index, snapshot };

    }

    return null;

}



function getLatestTrackerDisplaySnapshot(context = getContext()) {

    return getLatestTrackerDisplayRecord(context)?.snapshot || null;

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

    const record = getLatestTrackerDisplayRecord(context);

    const snapshot = record?.snapshot;

    if (!root || !snapshot?.npcs) return false;

    const rapportClock = normalizeRapportClockState(root.rapportClock);
    root.npcs = normalizeDisplayTrackerNpcs(snapshot.npcs);
    root.user = normalizeTrackerUserState(snapshot.user || root.user || {});
    root.powerActors = snapshot.powerActors || root.powerActors || {};
    root.latentGrievances = resolveStoredLatentGrievances(
        root,
        snapshot.latentGrievanceIds ?? root.snapshots?.[snapshot.messageKey]?.afterLatentGrievanceIds,
        root.latentGrievances,
    );
    root.latentFavors = resolveStoredLatentFavors(
        root,
        snapshot.latentFavorIds ?? root.snapshots?.[snapshot.messageKey]?.afterLatentFavorIds,
        root.latentFavors,
    );
    root.userKnowledge = mergeUserKnowledgeLedger(snapshot.userKnowledge || root.userKnowledge || {}, {});
    root.userReputation = mergeUserReputationLedger(snapshot.userReputation || root.userReputation || {}, {});
    root.worldState = normalizeWorldState(snapshot.worldState || root.worldState || {});
    root.sceneItems = normalizeSceneItemState(snapshot.sceneItems || {}, root.worldState);
    rebuildWorldMemoryFromSelectedSwipes(context);
    root.economy = normalizeEconomyState(snapshot.economy || root.economy || {});
    root.boundCompanion = normalizeBoundCompanionState(snapshot.boundCompanion || root.boundCompanion || {});
    root.pendingBoundary = normalizePendingBoundaryState(snapshot.pendingBoundary || root.pendingBoundary || {});
    root.spellCasting = normalizeSpellCastingState(snapshot.spellCasting || root.snapshots?.[snapshot.messageKey]?.afterSpellCasting || root.spellCasting || {});
    root.health = normalizeHiddenHealth(snapshot.hiddenHealth || root.snapshots?.[snapshot.messageKey]?.afterHealth || root.health, { user: root.user, npcs: root.npcs });
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
    root.powerActors = snapshot.powerActors || root.powerActors || {};
    root.latentGrievances = resolveStoredLatentGrievances(
        root,
        snapshot.latentGrievanceIds ?? root.snapshots?.[snapshot.messageKey]?.afterLatentGrievanceIds,
        root.latentGrievances,
    );
    root.latentFavors = resolveStoredLatentFavors(
        root,
        snapshot.latentFavorIds ?? root.snapshots?.[snapshot.messageKey]?.afterLatentFavorIds,
        root.latentFavors,
    );
    root.userKnowledge = mergeUserKnowledgeLedger(snapshot.userKnowledge || root.userKnowledge || {}, {});
    root.userReputation = mergeUserReputationLedger(snapshot.userReputation || root.userReputation || {}, {});
    root.worldState = normalizeWorldState(snapshot.worldState || root.worldState || {});
    root.sceneItems = normalizeSceneItemState(snapshot.sceneItems || {}, root.worldState);
    rebuildWorldMemoryFromSelectedSwipes(context);
    root.economy = normalizeEconomyState(snapshot.economy || root.economy || {});
    root.boundCompanion = normalizeBoundCompanionState(snapshot.boundCompanion || root.boundCompanion || {});
    root.pendingBoundary = normalizePendingBoundaryState(snapshot.pendingBoundary || root.pendingBoundary || {});
    root.spellCasting = normalizeSpellCastingState(snapshot.spellCasting || root.snapshots?.[snapshot.messageKey]?.afterSpellCasting || root.spellCasting || {});
    root.health = normalizeHiddenHealth(snapshot.hiddenHealth || root.snapshots?.[snapshot.messageKey]?.afterHealth || root.health, { user: root.user, npcs: root.npcs });
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

function trackerDetailTone(label) {
    const key = String(label || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const known = new Set(['gear', 'inventory', 'currency', 'abilities', 'spells']);
    return known.has(key) ? key : 'neutral';
}

function trackerDetailLine(label, value, options = {}) {
    const text = Array.isArray(value)
        ? formatTrackerList(value)
        : String(value ?? '').trim();
    const display = text || 'None';
    if (!options.showEmpty && display === 'None') return '';
    const tone = trackerDetailTone(label);
    return `
        <div class="structured-preflight-tracker-detail">
            <span class="structured-preflight-tracker-detail-label structured-preflight-tracker-detail-label-${escapeHtml(tone)}">${escapeHtml(label)}</span>
            <span class="structured-preflight-tracker-detail-value">${escapeHtml(display)}</span>
        </div>`;
}

function trackerEditableUserItemList(label, field, value) {
    const items = normalizeManualUserItemList(value);
    const rows = items.length
        ? items.map(item => `
            <div class="structured-preflight-tracker-edit-row">
                <input class="text_pole structured-preflight-tracker-edit-input" data-spe-tracker-user-field="${escapeHtml(field)}" value="${escapeHtml(item)}" spellcheck="false">
                <button class="menu_button structured-preflight-tracker-edit-remove" type="button" data-spe-tracker-remove-item title="Remove ${escapeHtml(label)} item" aria-label="Remove ${escapeHtml(label)} item">x</button>
            </div>`).join('')
        : '<div class="structured-preflight-tracker-muted" data-spe-tracker-empty-list>No items</div>';
    return `
        <div class="structured-preflight-tracker-detail structured-preflight-tracker-edit-list" data-spe-tracker-list="${escapeHtml(field)}">
            <span class="structured-preflight-tracker-detail-label structured-preflight-tracker-detail-label-${escapeHtml(trackerDetailTone(label))}">${escapeHtml(label)}</span>
            <div class="structured-preflight-tracker-edit-rows" data-spe-tracker-list-rows="${escapeHtml(field)}">${rows}</div>
            <div class="structured-preflight-tracker-edit-add-row">
                <input class="text_pole structured-preflight-tracker-edit-input" data-spe-tracker-add-input="${escapeHtml(field)}" placeholder="Add ${escapeHtml(label.toLowerCase())} item" spellcheck="false">
                <button class="menu_button structured-preflight-tracker-edit-add" type="button" data-spe-tracker-add-item="${escapeHtml(field)}" title="Add ${escapeHtml(label)} item" aria-label="Add ${escapeHtml(label)} item">+</button>
            </div>
        </div>`;
}

const TRACKER_WIDGET_TABS = Object.freeze(['overview', 'character', 'npcs', 'inventory', 'threads']);

function normalizeTrackerWidgetTab(value) {
    return TRACKER_WIDGET_TABS.includes(value) ? value : 'overview';
}

function trackerListItems(value) {
    return normalizeManualUserItemList(Array.isArray(value) ? value : []);
}

function trackerListCount(value) {
    return trackerListItems(value).length;
}

function trackerTabButton(id, label, icon, activeTab) {
    const active = id === activeTab;
    return `
        <button class="structured-preflight-tracker-tab structured-preflight-tracker-tab-${escapeHtml(id)}${active ? ' structured-preflight-tracker-tab-active' : ''}" type="button" role="tab" id="structured-preflight-tracker-tab-${escapeHtml(id)}" aria-controls="structured-preflight-tracker-panel-${escapeHtml(id)}" data-spe-tracker-tab="${escapeHtml(id)}" aria-selected="${active ? 'true' : 'false'}" tabindex="${active ? '0' : '-1'}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}">
            <i class="fa-solid ${escapeHtml(icon)}" aria-hidden="true"></i>
            <span class="structured-preflight-tracker-sr-only">${escapeHtml(label)}</span>
        </button>`;
}

function trackerTabNav(activeTab) {
    return `
        <div class="structured-preflight-tracker-tabs" role="tablist" aria-label="Tracker sections">
            ${trackerTabButton('overview', 'Overview', 'fa-table-columns', activeTab)}
            ${trackerTabButton('character', 'Character', 'fa-user', activeTab)}
            ${trackerTabButton('npcs', 'NPCs', 'fa-users', activeTab)}
            ${trackerTabButton('inventory', 'Inventory', 'fa-box-open', activeTab)}
            ${trackerTabButton('threads', 'Threads', 'fa-list-check', activeTab)}
        </div>`;
}

function formatTrackerItemDisplayName(value) {
    const source = cleanTrackerDeltaText(value);
    if (!source) return 'Unnamed item';

    const coiledMaterial = /^(?:a\s+)?(?:coil|length)\s+of\b/i.test(source)
        ? [...source.matchAll(/\b(?:[a-z][a-z-]*\s+)?(?:rope|cord|cable|chain|wire)\b/ig)].at(-1)?.[0]
        : '';
    let display = coiledMaterial || source;
    display = display
        .replace(/^\s*(?:a|an|the)\s+/i, '')
        .replace(/\s*\([^)]*\)\s*$/g, '')
        .replace(/:\s*(?=[^:]*,)[\s\S]*$/u, '')
        .replace(/\s+(?:around|bearing|carried|containing|covered\s+in|filled\s+with|hanging|holding|kept|marked\s+(?:by|with)|patched|resting|rolled|showing|stained\s+(?:by|with)|stored|tucked|used\s+for|with)\b[\s\S]*$/i, '')
        .replace(/\s*,[\s\S]*$/u, '')
        .replace(/\s+plus\s+\d+\b[\s\S]*$/i, '')
        .replace(/^worn\s+but\s+well-oiled\s+/i, '')
        .replace(/\bboiled-leather\b/gi, 'leather')
        .replace(/\bwool-blend\b/gi, 'wool')
        .replace(/\bwool-cloak\b/gi, 'wool cloak')
        .replace(/\bcross-draw\s+style\b/gi, '')
        .replace(/\bleather\s+sword\s+belt\b/gi, 'sword belt')
        .replace(/\bsling-shot\s+and\s+shot\s+pouch\b/gi, 'sling + shot pouch')
        .replace(/^sturdy\s+knee-high\s+(?=leather\s+boots?\b)/i, '')
        .replace(/^(leather)\s+sleeveless\s+(?=jerkin\b)/i, '$1 ')
        .replace(/^(pouch\s+of\s+\d+)\s+smooth\s+(?=sling\s+stones?\b)/i, '$1 ')
        .replace(/[.;,:\s]+$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    display = display
        .replace(/^bandage\s+roll\s+of\s+(?:boiled\s+)?linen$/i, 'bandage roll')
        .replace(/^pouch\s+of\s+(\d+)\s+/i, '$1 ')
        .replace(/^(?:one|two|three|four|five|six|seven|eight|nine|ten|\d+)\s+(?:leather\s+)?bootlaces\s+and\s+(?:a|an|one)\s+whetstone$/i, 'laces + whetstone');
    const minorWords = new Set(['a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'the', 'to']);
    const titled = display.split(' ').map((word, index) => {
        const lower = word.toLowerCase();
        if (index > 0 && minorWords.has(lower)) return lower;
        return word.charAt(0).toUpperCase() + word.slice(1);
    }).join(' ');
    return titled || source;
}

function formatTrackerItemQuality(value) {
    return String(value || 'standard')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, letter => letter.toUpperCase());
}

function trackerDisplayItemList(label, value, options = {}) {
    const items = trackerListItems(value);
    const rows = items.length
        ? items.map(item => `
            <div class="structured-preflight-tracker-item-row">
                <span class="structured-preflight-tracker-item-text">${escapeHtml(item)}</span>
            </div>`).join('')
        : `<div class="structured-preflight-tracker-muted structured-preflight-tracker-item-empty">${escapeHtml(options.empty || 'None')}</div>`;
    return `
        <div class="structured-preflight-tracker-item-list">
            <div class="structured-preflight-tracker-item-list-label structured-preflight-tracker-detail-label structured-preflight-tracker-detail-label-${escapeHtml(trackerDetailTone(label))}">${escapeHtml(label)}</div>
            <div class="structured-preflight-tracker-item-rows">${rows}</div>
        </div>`;
}

function trackerChipLabelTone(label) {
    const key = String(label || '')
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
    const known = new Set(['toward-user', 'condition', 'b-f-h', 'lock', 'behavior', 'rapport', 'relationship']);
    return known.has(key) ? key : 'neutral';
}

function trackerChip(label, value, tone = 'neutral') {
    const labelTone = trackerChipLabelTone(label);
    return `
        <span class="structured-preflight-tracker-chip structured-preflight-tracker-chip-${escapeHtml(tone)}">
            <span class="structured-preflight-tracker-chip-label structured-preflight-tracker-chip-label-${escapeHtml(labelTone)}">${escapeHtml(label)}</span>
            <code>${escapeHtml(value)}</code>
        </span>`;
}

function formatBoundCompanionType(value) {
    return String(value || 'other')
        .replace(/_/g, ' ')
        .replace(/\b\w/g, letter => letter.toUpperCase());
}

function formatBoundCompanionVessel(value, personaName) {
    const text = String(value || '').trim();
    if (!text) return '{{user}}';
    const normalized = text.replace(/[’‘]/g, "'");
    const lower = normalized.toLowerCase();
    const persona = String(personaName || '').trim().replace(/[’‘]/g, "'").toLowerCase();
    const userVesselPattern = /^(?:the\s+)?(?:\{\{user\}\}|user|player|player character|you|your|his|her|their|body|mind|head|vessel)(?:'s)?(?:\s+(?:body|mind|head|vessel|soul|spirit))?$/i;
    if (userVesselPattern.test(normalized)) return '{{user}}';
    if (persona && (
        lower === persona
        || lower === `${persona}'s body`
        || lower === `${persona}'s mind`
        || lower === `${persona}'s head`
        || lower === `${persona}'s vessel`
        || lower === `${persona}'s soul`
        || lower === `${persona}'s spirit`
    )) {
        return '{{user}}';
    }
    return text;
}

function trackerConditionTone(value) {
    const text = String(value || '').toLowerCase();
    if (!text || text === 'healthy' || text === 'unchanged') return 'good';
    if (text.includes('dead') || text.includes('critical') || text.includes('badly')) return 'danger';
    if (text.includes('wounded') || text.includes('bruised')) return 'warn';
    return 'neutral';
}

function trackerDispositionTone(disposition, classified) {
    if (!disposition) return 'neutral';
    if (classified?.lock === 'HATRED' || disposition.H >= 3) return 'danger';
    if (classified?.lock === 'TERROR' || classified?.lock === 'FREEZE' || disposition.F >= 3) return 'warn';
    if (disposition.B >= 3 && disposition.F <= 2 && disposition.H <= 2) return 'good';
    return 'neutral';
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

    if (disposition.F >= 3) return 'Afraid or self-protective';
    if (disposition.B <= 1) return 'Avoidant or distant';

    return 'Neutral or transactional';

}



function buildTrackerDisplayHtml(snapshot) {
    const npcs = normalizeDisplayTrackerNpcs(snapshot?.npcs);
    const visibleNames = new Set(Array.isArray(snapshot?.visibleNpcNames)
        ? snapshot.visibleNpcNames.map(name => String(name).toLowerCase())
        : []);
    const displayNpcState = normalizeVisibleNpcState(snapshot?.displayNpcState);
    const boundCompanion = normalizeBoundCompanionState(snapshot?.boundCompanion || {});
    const boundCompanionName = cleanTrackerDisplayName(boundCompanion.name);
    const boundCompanionTrackerName = boundCompanion.active ? findExistingTrackerName(npcs, boundCompanionName) : '';
    const boundCompanionNpc = boundCompanionTrackerName ? npcs[boundCompanionTrackerName] : null;
    const boundCompanionExcludedName = (boundCompanionTrackerName || boundCompanionName).toLowerCase();
    const names = Object.keys(npcs)
        .filter(name => !boundCompanionExcludedName || name.toLowerCase() !== boundCompanionExcludedName)
        .sort((a, b) => a.localeCompare(b));
    const present = names.filter(name => npcs[name]?.lifecycle === 'Active'
        && (!visibleNames.size || visibleNames.has(name.toLowerCase()))
        && Number(displayNpcState[name]?.inactiveReplies || 0) === 0);
    const knownElsewhere = names.filter(name => npcs[name]?.lifecycle === 'Active' && !present.includes(name));
    const archived = names.filter(name => npcs[name]?.lifecycle !== 'Active');
    const userCore = snapshot?.userCoreStats;
    const user = normalizeTrackerUserState(snapshot?.user || {});
    const worldDisplay = formatWorldStateForDisplay(snapshot?.worldState || {});
    const personaName = cleanTrackerDisplayName(getUserName()) || 'User';
    const personaText = getPersonaText();
    const abilities = extractPersonaAbilities(personaText);
    const spells = extractPersonaSpells(personaText);
    const context = getContext();
    const progressionRoot = context?.chatMetadata?.[PROGRESSION_KEY] || {};
    const progressionXp = Math.min(PROGRESSION_MILESTONE_XP, (Array.isArray(progressionRoot.accomplishments)
        ? progressionRoot.accomplishments
        : []).reduce((sum, record) => sum + progressionRecordUnspentXp(record), 0));
    const progressionReady = Boolean(progressionRoot.pendingAdvancement);
    const equipmentAssignments = new Map(normalizeEquipmentTierAssignments(
        user.equipmentTiers,
        [...trackerListItems(user.gear), ...trackerListItems(user.inventory)],
    ).map(entry => [String(entry.item || '').toLowerCase(), entry.tier]));
    const currencySummary = clipText(formatTrackerList(user.currency), 80);
    const previousSnapshot = snapshot?.messageKey ? getPreviousTrackerDisplaySnapshot(snapshot.messageKey) : null;
    const progressionEnabled = getSettings().characterProgressionEnabled !== false;
    const activeTab = normalizeTrackerWidgetTab(state.trackerWidgetActiveTab);
    state.trackerWidgetActiveTab = activeTab;
    const editingUserItems = Boolean(state.trackerWidgetEditingUserItems);
    const userItemControls = editingUserItems
        ? `
            <div class="structured-preflight-tracker-edit-actions">
                <button class="menu_button structured-preflight-tracker-edit-save" type="button" data-spe-tracker-save-user-items>Save</button>
                <button class="menu_button structured-preflight-tracker-edit-cancel" type="button" data-spe-tracker-cancel-user-items>Cancel</button>
            </div>`
        : `
            <div class="structured-preflight-tracker-edit-actions">
                <button class="menu_button structured-preflight-tracker-edit-toggle" type="button" data-spe-tracker-edit-user-items title="Edit inventory and gear"><i class="fa-solid fa-pen" aria-hidden="true"></i><span>Edit items</span></button>
            </div>`;
    const userGearInventoryHtml = [
        trackerDisplayItemList('Currency', user.currency, { empty: 'No currency tracked' }),
        trackerEditableUserItemList('Inventory', 'inventory', user.inventory),
        trackerEditableUserItemList('Gear', 'gear', user.gear),
    ].join('');

    const personaEntryDescription = entry => {
        const name = stripMarkdownFormatting(entry?.name || '').trim();
        const lines = String(entry?.text || '')
            .split(/\r?\n/)
            .map(line => stripMarkdownFormatting(line).replace(/^[-*+]\s*/, '').trim())
            .filter(Boolean);
        let description = lines.join(' ');
        if (name && description.toLowerCase().startsWith(name.toLowerCase())) {
            description = description.slice(name.length).replace(/^\s*[:\u2014-]+\s*/, '');
        }
        return clipText(description, 320);
    };

    const renderPersonaEntries = (label, entries, emptyText) => `
        <div class="structured-preflight-tracker-power-group">
            <div class="structured-preflight-tracker-detail-label structured-preflight-tracker-detail-label-${escapeHtml(trackerDetailTone(label))}">${escapeHtml(label)}</div>
            <div class="structured-preflight-tracker-power-list">
                ${entries.length ? entries.map(entry => {
                    const description = personaEntryDescription(entry);
                    return `
                        <div class="structured-preflight-tracker-power-entry">
                            <strong>${escapeHtml(entry?.name || label)}</strong>
                            ${description ? `<span>${escapeHtml(description)}</span>` : ''}
                        </div>`;
                }).join('') : `<div class="structured-preflight-tracker-muted">${escapeHtml(emptyText)}</div>`}
            </div>
        </div>`;

    const userItemRecords = [
        ...trackerListItems(user.gear).map(item => ({
            key: `gear:${item.toLowerCase()}`,
            item,
            displayName: formatTrackerItemDisplayName(item),
            group: 'Gear',
            tier: equipmentAssignments.get(item.toLowerCase()) || 'standard',
        })),
        ...trackerListItems(user.inventory).map(item => ({
            key: `inventory:${item.toLowerCase()}`,
            item,
            displayName: formatTrackerItemDisplayName(item),
            group: 'Carried',
            tier: equipmentAssignments.get(item.toLowerCase()) || 'standard',
        })),
    ];

    const listDifference = (after, before) => {
        const beforeKeys = new Set(trackerListItems(before).map(item => item.toLowerCase()));
        return trackerListItems(after).filter(item => !beforeKeys.has(item.toLowerCase()));
    };
    const previousUser = normalizeTrackerUserState(previousSnapshot?.user || {});
    const previousNpcs = normalizeDisplayTrackerNpcs(previousSnapshot?.npcs || {});
    const previousBoundCompanion = normalizeBoundCompanionState(previousSnapshot?.boundCompanion || {});
    const previousBoundCompanionName = cleanTrackerDisplayName(previousBoundCompanion.name);
    const previousBoundCompanionTrackerName = previousBoundCompanion.active
        ? findExistingTrackerName(previousNpcs, previousBoundCompanionName)
        : '';
    const previousBoundCompanionExcludedName = (previousBoundCompanionTrackerName || previousBoundCompanionName).toLowerCase();
    const previousVisibleNames = new Set(Array.isArray(previousSnapshot?.visibleNpcNames)
        ? previousSnapshot.visibleNpcNames.map(name => String(name).toLowerCase())
        : []);
    const previousDisplayNpcState = normalizeVisibleNpcState(previousSnapshot?.displayNpcState);
    const previousPresent = Object.keys(previousNpcs)
        .filter(name => !previousBoundCompanionExcludedName || name.toLowerCase() !== previousBoundCompanionExcludedName)
        .filter(name => previousNpcs[name]?.lifecycle === 'Active'
            && (!previousVisibleNames.size || previousVisibleNames.has(name.toLowerCase()))
            && Number(previousDisplayNpcState[name]?.inactiveReplies || 0) === 0);
    const previousPresentKeys = new Set(previousPresent.map(name => name.toLowerCase()));
    const presentKeys = new Set(present.map(name => name.toLowerCase()));
    const threadChanges = [];
    const addThreadChange = text => {
        const clean = String(text || '').trim();
        if (clean && !threadChanges.includes(clean)) threadChanges.push(clean);
    };
    if (previousSnapshot) {
        listDifference(user.tasks, previousUser.tasks).forEach(item => addThreadChange(`Task added: ${item}`));
        listDifference(previousUser.tasks, user.tasks).forEach(item => addThreadChange(`Task removed: ${item}`));
        listDifference(user.commitments, previousUser.commitments).forEach(item => addThreadChange(`Commitment added: ${item}`));
        listDifference(previousUser.commitments, user.commitments).forEach(item => addThreadChange(`Commitment removed: ${item}`));
        if (user.condition !== previousUser.condition) {
            addThreadChange(`Player condition changed to ${formatTrackerCondition(user.condition)}`);
        }
        listDifference(user.wounds, previousUser.wounds).forEach(item => addThreadChange(`Wound added: ${item}`));
        listDifference(previousUser.wounds, user.wounds).forEach(item => addThreadChange(`Wound cleared: ${item}`));
        listDifference(user.statusEffects, previousUser.statusEffects).forEach(item => addThreadChange(`Status added: ${item}`));
        listDifference(previousUser.statusEffects, user.statusEffects).forEach(item => addThreadChange(`Status cleared: ${item}`));
        listDifference(user.gear, previousUser.gear).forEach(item => addThreadChange(`Gear added: ${item}`));
        listDifference(previousUser.gear, user.gear).forEach(item => addThreadChange(`Gear removed: ${item}`));
        listDifference(user.inventory, previousUser.inventory).forEach(item => addThreadChange(`Inventory added: ${item}`));
        listDifference(previousUser.inventory, user.inventory).forEach(item => addThreadChange(`Inventory removed: ${item}`));
        present.filter(name => !previousPresentKeys.has(name.toLowerCase()))
            .forEach(name => addThreadChange(`${name} entered the current exchange`));
        previousPresent.filter(name => !presentKeys.has(name.toLowerCase()))
            .filter(name => {
                const currentName = Object.keys(npcs).find(candidate => candidate.toLowerCase() === name.toLowerCase());
                return !currentName || npcs[currentName]?.lifecycle === 'Active';
            })
            .forEach(name => addThreadChange(`${name} left the current exchange`));
        for (const name of names) {
            const beforeName = Object.keys(previousNpcs).find(candidate => candidate.toLowerCase() === name.toLowerCase());
            const before = beforeName ? previousNpcs[beforeName] : null;
            const after = npcs[name];
            if (!before) {
                addThreadChange(`NPC tracked: ${name}`);
                continue;
            }
            if (before.establishedRelationship !== after.establishedRelationship && after.establishedRelationship === 'Y') {
                addThreadChange(`Relationship established with ${name}`);
            }
            if (before.lifecycle !== after.lifecycle) {
                addThreadChange(`${name} is now ${String(after.lifecycle || 'Active').toLowerCase()}`);
            }
            if (before.condition !== after.condition) {
                addThreadChange(`${name}'s condition changed to ${formatTrackerCondition(after.condition)}`);
            }
            listDifference(after.wounds, before.wounds).forEach(item => addThreadChange(`${name} wound added: ${item}`));
            listDifference(before.wounds, after.wounds).forEach(item => addThreadChange(`${name} wound cleared: ${item}`));
        }
    }
    const recentThreadChanges = threadChanges.slice(0, 10);
    const openThreads = [
        ...trackerListItems(user.tasks).map(item => ({ type: 'Task', item })),
        ...trackerListItems(user.commitments).map(item => ({ type: 'Commitment', item })),
    ];

    const selectedNpcName = names.includes(state.trackerWidgetSelectedNpc)
        ? state.trackerWidgetSelectedNpc
        : present[0] || knownElsewhere[0] || archived[0] || '';
    state.trackerWidgetSelectedNpc = selectedNpcName;
    const selectedNpc = selectedNpcName ? npcs[selectedNpcName] : null;

    const knownWorldValue = value => value && value !== 'Unknown' ? value : '';
    const sceneTime = [knownWorldValue(worldDisplay.day), knownWorldValue(worldDisplay.timeOfDay)]
        .filter(Boolean)
        .join(' · ') || 'Not established';
    const locationParts = [
        knownWorldValue(worldDisplay.place) || knownWorldValue(worldDisplay.reputationLocation),
        knownWorldValue(worldDisplay.area),
    ].filter((value, index, values) => value && values.indexOf(value) === index);
    const sceneLocation = locationParts.join(' · ') || 'Not established';
    const environmentSummary = [knownWorldValue(worldDisplay.indoors), knownWorldValue(worldDisplay.weather)]
        .filter(Boolean)
        .join(' · ');
    const progressionPercent = Math.max(0, Math.min(100, Math.round((progressionXp / PROGRESSION_MILESTONE_XP) * 100)));

    const trackerMetric = (label, value) => `
        <div class="structured-preflight-tracker-metric">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
        </div>`;

    const trackerField = (label, value, options = {}) => {
        const displayValue = value == null || String(value).trim() === '' ? 'None' : String(value);
        return `
        <div class="structured-preflight-tracker-field${options.wide ? ' structured-preflight-tracker-field-wide' : ''}">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(displayValue)}</strong>
        </div>`;
    };

    const trackerInitials = value => {
        const parts = String(value || '?').trim().split(/\s+/).filter(Boolean);
        return (parts.length > 1 ? `${parts[0][0]}${parts[parts.length - 1][0]}` : parts[0]?.slice(0, 2) || '?').toUpperCase();
    };

    const renderPanelHeader = (eyebrow, title, subtitle = '', actionHtml = '') => `
        <div class="structured-preflight-tracker-panel-head${actionHtml ? ' structured-preflight-tracker-panel-head-with-action' : ''}">
            <div class="structured-preflight-tracker-panel-copy">
                ${eyebrow ? `<span class="structured-preflight-tracker-eyebrow">${escapeHtml(eyebrow)}</span>` : ''}
                ${title ? `<h2>${escapeHtml(title)}</h2>` : ''}
                ${subtitle ? `<p>${escapeHtml(subtitle)}</p>` : ''}
            </div>
            ${actionHtml}
        </div>`;

    const renderEmpty = text => `<div class="structured-preflight-tracker-empty structured-preflight-tracker-empty-block">${escapeHtml(text)}</div>`;

    const renderSectionTitle = (label, icon, tone = '') => `
        <div class="structured-preflight-tracker-heading structured-preflight-tracker-section-title${tone ? ` structured-preflight-tracker-section-title-${escapeHtml(tone)}` : ''}">
            <i class="fa-solid ${escapeHtml(icon)}" aria-hidden="true"></i>
            <span>${escapeHtml(label)}</span>
        </div>`;

    const renderQualityRows = (records, emptyText) => {
        if (!records.length) return renderEmpty(emptyText);
        return `<div class="structured-preflight-tracker-quality-list">${records.map(record => `
            <div class="structured-preflight-tracker-quality-row" title="${escapeHtml(record.item)}">
                <strong>${escapeHtml(record.displayName)}</strong>
                <span class="structured-preflight-tracker-quality">${escapeHtml(formatTrackerItemQuality(record.tier))}</span>
            </div>`).join('')}</div>`;
    };

    const itemRecordsForNpc = (value, entry) => {
        const tier = getNpcLootRankProfile(entry?.currentCoreStats?.Rank).equipmentTier;
        return trackerListItems(value).map(item => ({
            item,
            displayName: formatTrackerItemDisplayName(item),
            tier,
        }));
    };

    const formatPhysicalState = entry => {
        const wounds = trackerListItems(entry?.wounds);
        const effects = trackerListItems(entry?.statusEffects);
        return [
            wounds.length ? `${wounds.length} wound${wounds.length === 1 ? '' : 's'}` : 'No wounds',
            effects.length ? `${effects.length} status effect${effects.length === 1 ? '' : 's'}` : 'No status effects',
        ].join(' · ');
    };

    const renderThreadRows = (entries, options = {}) => {
        const limit = Number.isFinite(options.limit) ? options.limit : entries.length;
        const rows = entries.slice(0, limit);
        if (!rows.length) return renderEmpty(options.empty || 'No active tasks or commitments');
        return `<div class="structured-preflight-tracker-plain-list">${rows.map(entry => `
            <div class="structured-preflight-tracker-plain-row">
                <span class="structured-preflight-tracker-list-copy">
                    <strong>${escapeHtml(entry.item)}</strong>
                    <small>${escapeHtml(entry.type)}</small>
                </span>
                <span class="structured-preflight-tracker-row-status">Open</span>
            </div>`).join('')}</div>`;
    };

    const renderChangeRows = (entries, limit = entries.length) => {
        const rows = entries.slice(0, limit);
        const emptyText = previousSnapshot
            ? 'No visible tracker changes since the previous response'
            : 'No earlier tracker snapshot is available for comparison';
        if (!rows.length) return renderEmpty(emptyText);
        return `<div class="structured-preflight-tracker-change-list">${rows.map(item => `
            <div class="structured-preflight-tracker-change-row">
                <span class="structured-preflight-tracker-change-mark" aria-hidden="true"></span>
                <span>${escapeHtml(item)}</span>
            </div>`).join('')}</div>`;
    };

    const renderBoundCompanionSection = () => {
        if (!boundCompanion.active) return '';
        const name = boundCompanionTrackerName || boundCompanionName || '(unnamed)';
        const disposition = boundCompanionNpc?.currentDisposition;
        const classified = disposition ? classifyDisposition(disposition) : { lock: 'None', behavior: 'None' };
        const relation = relationshipTowardUser(disposition, classified);
        const relationshipRows = boundCompanionNpc
            ? `
                <div class="structured-preflight-tracker-chip-row structured-preflight-tracker-bound-row">
                    ${trackerChip('B/F/H', formatDisposition(disposition))}
                    ${trackerChip('Rapport', `${boundCompanionNpc.currentRapport}/5`)}
                    ${trackerChip('Toward User', relation, trackerDispositionTone(disposition, classified))}
                </div>
                <div class="structured-preflight-tracker-chip-row structured-preflight-tracker-bound-row">
                    ${trackerChip('Relationship', boundCompanionNpc.establishedRelationship || 'N')}
                    ${trackerChip('Behavior', classified.behavior)}
                    ${trackerChip('Lock', classified.lock)}
                </div>`
            : `
                <div class="structured-preflight-tracker-chip-row structured-preflight-tracker-bound-row">
                    ${trackerChip('Relationship', 'Untracked')}
                    ${trackerChip('Toward User', 'Developing')}
                </div>`;
        const stateLine = trackerChip('State', 'Present, internal');
        const voiceLine = boundCompanion.voice
            ? trackerDetailLine('Voice', boundCompanion.voice, { showEmpty: true })
            : '';
        return `
            <details class="structured-preflight-tracker-bound-companion">
                <summary>
                    <span>Bound Companion</span>
                    <code>${escapeHtml(name)}</code>
                </summary>
                <div class="structured-preflight-tracker-bound-body">
                    <div class="structured-preflight-tracker-chip-row structured-preflight-tracker-bound-row">
                        ${trackerChip('Type', formatBoundCompanionType(boundCompanion.type))}
                        ${stateLine}
                        ${trackerChip('Vessel', formatBoundCompanionVessel(boundCompanion.vessel, personaName))}
                    </div>
                    ${relationshipRows}
                    <div class="structured-preflight-tracker-detail-grid structured-preflight-tracker-detail-grid-compact">
                        <div class="structured-preflight-tracker-detail structured-preflight-tracker-detail-wide">
                            <span class="structured-preflight-tracker-detail-label structured-preflight-tracker-detail-label-personality">Personality</span>
                            <span class="structured-preflight-tracker-detail-value">${escapeHtml(boundCompanionNpc?.personalitySummary || 'Developing')}</span>
                        </div>
                        ${voiceLine}
                    </div>
                </div>
            </details>`;
    };

    const renderOverviewPanel = () => `
        <div class="structured-preflight-tracker-tab-panel" id="structured-preflight-tracker-panel-overview" role="tabpanel" aria-labelledby="structured-preflight-tracker-tab-overview" data-spe-tracker-panel="overview">
            <div class="structured-preflight-tracker-panel-head structured-preflight-tracker-panel-head-simple">
                <span class="structured-preflight-tracker-eyebrow">Overview</span>
            </div>
            <section class="structured-preflight-tracker-dashboard-section structured-preflight-tracker-world-summary">
                <div class="structured-preflight-tracker-scene-field">
                    <span>Time</span>
                    <strong>${escapeHtml(sceneTime)}</strong>
                </div>
                <div class="structured-preflight-tracker-scene-field">
                    <span>Location</span>
                    <strong>${escapeHtml(sceneLocation)}</strong>
                </div>
                ${environmentSummary ? `<div class="structured-preflight-tracker-subtle">${escapeHtml(environmentSummary)}</div>` : ''}
            </section>
            <section class="structured-preflight-tracker-dashboard-section structured-preflight-tracker-section-divider">
                <div class="structured-preflight-tracker-section-head">
                    <div class="structured-preflight-tracker-title structured-preflight-tracker-name-player">${escapeHtml(personaName)}</div>
                    ${trackerChip('Condition', formatTrackerCondition(user.condition), trackerConditionTone(user.condition))}
                </div>
                <div class="structured-preflight-tracker-metric-grid">
                    ${trackerMetric('PHY', userCore?.PHY ?? '-')}
                    ${trackerMetric('MND', userCore?.MND ?? '-')}
                    ${trackerMetric('CHA', userCore?.CHA ?? '-')}
                    ${trackerMetric('Wounds', trackerListCount(user.wounds))}
                </div>
            </section>
            <section class="structured-preflight-tracker-dashboard-section structured-preflight-tracker-section-divider">
                <div class="structured-preflight-tracker-section-head">
                    ${renderSectionTitle('Here now', 'fa-location-dot', 'overview')}
                    <span class="structured-preflight-tracker-subtle">${escapeHtml(`${present.length} present`)}</span>
                </div>
                ${present.length ? `<div class="structured-preflight-tracker-plain-list">${present.map(name => {
                    const entry = npcs[name];
                    const disposition = entry.currentDisposition;
                    const classified = disposition ? classifyDisposition(disposition) : { lock: 'None', behavior: 'None' };
                    return `
                        <div class="structured-preflight-tracker-plain-row">
                            <span class="structured-preflight-tracker-avatar">${escapeHtml(trackerInitials(name))}</span>
                            <span class="structured-preflight-tracker-list-copy">
                                <strong>${escapeHtml(name)}</strong>
                                <small>${escapeHtml(relationshipTowardUser(disposition, classified))}</small>
                            </span>
                            <span class="structured-preflight-tracker-row-status">${escapeHtml(formatTrackerCondition(entry.condition))}</span>
                        </div>`;
                }).join('')}</div>` : renderEmpty('No NPCs are present')}
            </section>
            <section class="structured-preflight-tracker-dashboard-section structured-preflight-tracker-section-divider">
                ${renderSectionTitle('Open threads', 'fa-list-check', 'threads')}
                ${renderThreadRows(openThreads, { limit: 5 })}
            </section>
        </div>`;

    const renderCharacterPanel = () => `
        <div class="structured-preflight-tracker-tab-panel" id="structured-preflight-tracker-panel-character" role="tabpanel" aria-labelledby="structured-preflight-tracker-tab-character" data-spe-tracker-panel="character">
            ${renderPanelHeader(
                'Character',
                personaName,
                formatPhysicalState(user),
                trackerChip('Condition', formatTrackerCondition(user.condition), trackerConditionTone(user.condition)),
            )}
            <section class="structured-preflight-tracker-dashboard-section">
                ${renderSectionTitle('Core stats', 'fa-chart-column', 'character')}
                <div class="structured-preflight-tracker-metric-grid structured-preflight-tracker-metric-grid-three">
                    ${trackerMetric('PHY', userCore?.PHY ?? '-')}
                    ${trackerMetric('MND', userCore?.MND ?? '-')}
                    ${trackerMetric('CHA', userCore?.CHA ?? '-')}
                </div>
            </section>
            <section class="structured-preflight-tracker-dashboard-section structured-preflight-tracker-section-divider">
                ${renderSectionTitle('Physical state', 'fa-heart-pulse', 'character')}
                <div class="structured-preflight-tracker-field-grid">
                    ${trackerField('Wounds', formatTrackerList(user.wounds), { wide: true })}
                    ${trackerField('Status effects', formatTrackerList(user.statusEffects), { wide: true })}
                </div>
            </section>
            <section class="structured-preflight-tracker-dashboard-section structured-preflight-tracker-section-divider">
                ${renderPersonaEntries('Abilities', abilities, 'No ability recorded')}
            </section>
            <section class="structured-preflight-tracker-dashboard-section structured-preflight-tracker-section-divider">
                ${renderPersonaEntries('Spells', spells, 'No spells recorded')}
            </section>
            <section class="structured-preflight-tracker-dashboard-section structured-preflight-tracker-section-divider">
                <div class="structured-preflight-tracker-section-head">
                    ${renderSectionTitle('Advancement', 'fa-arrow-trend-up', 'character')}
                    <strong>${escapeHtml(progressionEnabled ? (progressionReady ? 'Choice ready' : `${progressionXp}/${PROGRESSION_MILESTONE_XP}`) : 'Disabled')}</strong>
                </div>
                <div class="structured-preflight-tracker-progress" aria-label="Advancement progress">
                    <span style="width: ${escapeHtml(progressionEnabled ? progressionPercent : 0)}%"></span>
                </div>
            </section>
            ${renderBoundCompanionSection()}
        </div>`;

    const renderSelectedNpc = () => {
        if (!selectedNpc) return renderEmpty('No NPCs are currently tracked');
        const disposition = selectedNpc.currentDisposition;
        const classified = disposition ? classifyDisposition(disposition) : { lock: 'None', behavior: 'None' };
        return `
            <div class="structured-preflight-tracker-npc-sheet" aria-live="polite">
                <section class="structured-preflight-tracker-dashboard-section">
                    <div class="structured-preflight-tracker-section-head">
                        <div class="structured-preflight-tracker-title structured-preflight-tracker-name-npc">${escapeHtml(selectedNpcName)}</div>
                        ${trackerChip('Condition', formatTrackerCondition(selectedNpc.condition), trackerConditionTone(selectedNpc.condition))}
                    </div>
                    <div class="structured-preflight-tracker-state-line">${escapeHtml(formatPhysicalState(selectedNpc))}</div>
                    <div class="structured-preflight-tracker-field-grid">
                        ${trackerField('Wounds', formatTrackerList(selectedNpc.wounds), { wide: true })}
                        ${trackerField('Status effects', formatTrackerList(selectedNpc.statusEffects), { wide: true })}
                    </div>
                </section>
                <section class="structured-preflight-tracker-dashboard-section structured-preflight-tracker-section-divider">
                    ${renderSectionTitle('Core stats', 'fa-chart-column', 'npcs')}
                    <div class="structured-preflight-tracker-metric-grid structured-preflight-tracker-metric-grid-three">
                        ${trackerMetric('PHY', selectedNpc.currentCoreStats?.PHY ?? '-')}
                        ${trackerMetric('MND', selectedNpc.currentCoreStats?.MND ?? '-')}
                        ${trackerMetric('CHA', selectedNpc.currentCoreStats?.CHA ?? '-')}
                    </div>
                </section>
                <section class="structured-preflight-tracker-dashboard-section structured-preflight-tracker-section-divider">
                    ${renderSectionTitle('Personality', 'fa-comment-dots', 'npcs')}
                    <p class="structured-preflight-tracker-summary-copy">${escapeHtml(selectedNpc.personalitySummary || 'Developing')}</p>
                </section>
                <section class="structured-preflight-tracker-dashboard-section structured-preflight-tracker-section-divider">
                    <div class="structured-preflight-tracker-section-head">
                        ${renderSectionTitle('Gear', 'fa-shield-halved', 'gear')}
                        <span class="structured-preflight-tracker-subtle">${escapeHtml(`${trackerListCount(selectedNpc.gear)} items`)}</span>
                    </div>
                    ${renderQualityRows(itemRecordsForNpc(selectedNpc.gear, selectedNpc), 'No gear tracked')}
                </section>
                <section class="structured-preflight-tracker-dashboard-section structured-preflight-tracker-section-divider">
                    <div class="structured-preflight-tracker-section-head">
                        ${renderSectionTitle('Inventory', 'fa-box-open', 'inventory')}
                        <span class="structured-preflight-tracker-subtle">${escapeHtml(`${trackerListCount(selectedNpc.inventory)} items`)}</span>
                    </div>
                    ${renderQualityRows(itemRecordsForNpc(selectedNpc.inventory, selectedNpc), 'No inventory tracked')}
                </section>
                <section class="structured-preflight-tracker-dashboard-section structured-preflight-tracker-section-divider">
                    <div class="structured-preflight-tracker-section-head">
                        ${renderSectionTitle('Currency', 'fa-coins', 'currency')}
                        <strong>${escapeHtml(formatTrackerList(selectedNpc.currency))}</strong>
                    </div>
                </section>
                <section class="structured-preflight-tracker-dashboard-section structured-preflight-tracker-section-divider">
                    ${renderSectionTitle('Relationship', 'fa-heart', 'relationship')}
                    <div class="structured-preflight-tracker-relationship-status">
                        <i class="fa-solid fa-heart" aria-hidden="true"></i>
                        <strong>${escapeHtml(relationshipTowardUser(disposition, classified))}</strong>
                    </div>
                    <div class="structured-preflight-tracker-metric-grid">
                        ${trackerMetric('Bond', disposition?.B ?? '-')}
                        ${trackerMetric('Fear', disposition?.F ?? '-')}
                        ${trackerMetric('Hostility', disposition?.H ?? '-')}
                        ${trackerMetric('Rapport', `${selectedNpc.currentRapport}/5`)}
                    </div>
                </section>
            </div>`;
    };

    const npcSelector = `
        <select class="text_pole structured-preflight-tracker-npc-select" data-spe-tracker-select-npc aria-label="Select NPC" ${names.length ? '' : 'disabled'}>
            ${names.length ? names.map(name => `<option value="${escapeHtml(name)}"${name === selectedNpcName ? ' selected' : ''}>${escapeHtml(name)}</option>`).join('') : '<option>No NPCs</option>'}
        </select>`;

    const renderNpcsPanel = () => `
        <div class="structured-preflight-tracker-tab-panel" id="structured-preflight-tracker-panel-npcs" role="tabpanel" aria-labelledby="structured-preflight-tracker-tab-npcs" data-spe-tracker-panel="npcs">
            ${renderPanelHeader(
                'NPCs',
                '',
                `${names.length} tracked character${names.length === 1 ? '' : 's'}`,
                npcSelector,
            )}
            ${renderSelectedNpc()}
        </div>`;

    const renderInventoryPanel = () => `
        <div class="structured-preflight-tracker-tab-panel" id="structured-preflight-tracker-panel-inventory" role="tabpanel" aria-labelledby="structured-preflight-tracker-tab-inventory" data-spe-tracker-panel="inventory">
            ${renderPanelHeader(
                'Inventory',
                '',
                `${trackerListCount(user.gear) + trackerListCount(user.inventory)} items`,
                userItemControls,
            )}
            ${editingUserItems ? `
                <div class="structured-preflight-tracker-edit-surface">
                    <div class="structured-preflight-tracker-item-list-grid">
                        ${userGearInventoryHtml}
                    </div>
                </div>` : `
                <section class="structured-preflight-tracker-dashboard-section">
                    <div class="structured-preflight-tracker-section-head">
                        ${renderSectionTitle('Currency', 'fa-coins', 'currency')}
                        <strong>${escapeHtml(currencySummary)}</strong>
                    </div>
                </section>
                <section class="structured-preflight-tracker-dashboard-section structured-preflight-tracker-section-divider">
                    <div class="structured-preflight-tracker-section-head">
                        ${renderSectionTitle('Gear', 'fa-shield-halved', 'gear')}
                        <span class="structured-preflight-tracker-subtle">${escapeHtml(`${trackerListCount(user.gear)} items`)}</span>
                    </div>
                    ${renderQualityRows(userItemRecords.filter(record => record.group === 'Gear'), 'No gear tracked')}
                </section>
                <section class="structured-preflight-tracker-dashboard-section structured-preflight-tracker-section-divider">
                    <div class="structured-preflight-tracker-section-head">
                        ${renderSectionTitle('Carried', 'fa-box-open', 'inventory')}
                        <span class="structured-preflight-tracker-subtle">${escapeHtml(`${trackerListCount(user.inventory)} items`)}</span>
                    </div>
                    ${renderQualityRows(userItemRecords.filter(record => record.group === 'Carried'), 'No carried items tracked')}
                </section>`}
        </div>`;

    const renderThreadsPanel = () => `
        <div class="structured-preflight-tracker-tab-panel" id="structured-preflight-tracker-panel-threads" role="tabpanel" aria-labelledby="structured-preflight-tracker-tab-threads" data-spe-tracker-panel="threads">
            ${renderPanelHeader(
                'Threads',
                '',
                `${openThreads.length} open`,
            )}
            <section class="structured-preflight-tracker-dashboard-section">
                ${renderSectionTitle('Tasks', 'fa-list-check', 'threads')}
                ${renderThreadRows(trackerListItems(user.tasks).map(item => ({ type: 'Task', item })), { empty: 'No active tasks' })}
            </section>
            <section class="structured-preflight-tracker-dashboard-section structured-preflight-tracker-section-divider">
                ${renderSectionTitle('Commitments', 'fa-handshake', 'threads')}
                ${renderThreadRows(trackerListItems(user.commitments).map(item => ({ type: 'Commitment', item })), { empty: 'No active commitments' })}
            </section>
            <section class="structured-preflight-tracker-dashboard-section structured-preflight-tracker-section-divider">
                <div class="structured-preflight-tracker-section-head">
                    ${renderSectionTitle('Recent changes', 'fa-clock-rotate-left', 'threads')}
                </div>
                ${renderChangeRows(recentThreadChanges)}
            </section>
        </div>`;

    const panelHtml = {
        overview: renderOverviewPanel,
        character: renderCharacterPanel,
        npcs: renderNpcsPanel,
        inventory: renderInventoryPanel,
        threads: renderThreadsPanel,
    }[activeTab]();

    return `
        <div class="structured-preflight-tracker-body">
            ${trackerTabNav(activeTab)}
            <div class="structured-preflight-tracker-scroll-region" data-spe-tracker-scroll-region>
                ${panelHtml}
            </div>
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


function isVisibleStoryEngineTopBarScreen(element) {
    if (!element || element.hidden) return false;
    const style = globalThis.getComputedStyle?.(element);
    if (style && (style.display === 'none' || style.visibility === 'hidden' || style.visibility === 'collapse' || Number(style.opacity) === 0)) return false;
    return Boolean(element.getClientRects?.().length || element.offsetWidth || element.offsetHeight);
}


function isStoryEngineTopBarScreenOpen() {
    if (typeof document === 'undefined') return false;
    return STORY_ENGINE_TOP_BAR_SCREEN_SELECTORS.some(selector => Array.from(document.querySelectorAll(selector)).some(isVisibleStoryEngineTopBarScreen));
}


function syncStoryEngineWidgetScreenLayer() {
    if (typeof document === 'undefined') return;
    const screenOpen = isStoryEngineTopBarScreenOpen();
    [TRACKER_WIDGET_ID, NARRATOR_HANDOFF_WIDGET_ID].forEach(widgetId => {
        document.getElementById(widgetId)?.classList.toggle('spe-story-engine-top-bar-screen-open', screenOpen);
    });
}


function ensureStoryEngineWidgetScreenObserver() {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    if (state.widgetScreenObserver) {
        syncStoryEngineWidgetScreenLayer();
        return;
    }
    const body = document.body;
    if (!body) return;
    state.widgetScreenObserver = new MutationObserver(() => syncStoryEngineWidgetScreenLayer());
    state.widgetScreenObserver.observe(body, {
        attributes: true,
        attributeFilter: ['aria-hidden', 'class', 'hidden', 'style'],
        childList: true,
        subtree: true,
    });
    syncStoryEngineWidgetScreenLayer();
}


function clearStoryEngineWidgetScreenObserver() {
    state.widgetScreenObserver?.disconnect?.();
    state.widgetScreenObserver = null;
}



function ensureTrackerDisplayStyles() {

    ensureStoryEngineWidgetScreenObserver();

    if (document.getElementById('structured_preflight_tracker_display_styles')) return;

    const style = document.createElement('style');

    style.id = 'structured_preflight_tracker_display_styles';

    style.textContent = `

        #${TRACKER_WIDGET_ID} {

            --spe-widget-accent: #73d0ff;

            position: fixed;

            left: 24px;

            top: 120px;

            width: 0;

            height: 0;

            z-index: 3006;

            overflow: visible;

            color: var(--SmartThemeBodyColor, #eee);

            font-size: 0.88rem;

        }

        #${TRACKER_WIDGET_ID}.spe-tracker-dragging {

            user-select: none;

        }

        #${TRACKER_WIDGET_BUTTON_ID} {

            position: absolute;

            left: 0;

            top: 0;

            width: ${TRACKER_WIDGET_BUTTON_SIZE}px;

            height: ${TRACKER_WIDGET_BUTTON_SIZE}px;

            display: grid;

            place-items: center;

            border: 1px solid color-mix(in srgb, var(--spe-widget-accent) 78%, var(--SmartThemeBorderColor, rgba(255,255,255,0.24)));

            border-radius: 8px;

            background: color-mix(in srgb, var(--spe-widget-accent) 14%, var(--SmartThemeBlurTintColor, #000));

            color: var(--spe-widget-accent);

            box-shadow: 0 10px 26px rgba(0,0,0,0.28);

            cursor: grab;

            touch-action: none;

            user-select: none;

            backdrop-filter: blur(8px);

            z-index: 3;

        }

        #${TRACKER_WIDGET_BUTTON_ID}:active {

            cursor: grabbing;

        }

        #${TRACKER_WIDGET_BUTTON_ID} i {

            font-size: 1.05rem;

        }
        #${TRACKER_WIDGET_BUTTON_ID}[hidden] {
            display: none;
        }
        #${TRACKER_WIDGET_PANEL_ID} {
            position: absolute;
            left: 0;
            top: 0;
            display: grid;
            grid-template-rows: auto minmax(0, 1fr) auto;
            width: ${TRACKER_WIDGET_DEFAULT_WIDTH}px;
            min-width: 1px;
            max-width: max(1px, calc(100vw - 16px));
            max-width: max(1px, calc(100dvw - 16px));
            height: ${TRACKER_WIDGET_DEFAULT_HEIGHT}px;
            min-height: 1px;
            max-height: calc(100vh - 16px);
            max-height: calc(100dvh - 16px);
            margin: 0;
            padding: 0;
            border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.2));
            border-radius: 8px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 84%, transparent);
            box-shadow: 0 14px 36px rgba(0,0,0,0.35);
            overflow: hidden;
            backdrop-filter: blur(10px);
            box-sizing: border-box;

            z-index: 2;

        }

        #${TRACKER_WIDGET_PANEL_ID}[hidden] {

            display: none;

        }

        .structured-preflight-tracker-widget-title {
            display: flex;
            align-items: center;
            justify-content: flex-start;
            gap: 0.75rem;
            min-width: 0;
            min-height: 43px;
            padding: 0.45rem 0.55rem 0.45rem 0.7rem;
            border-bottom: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.18));
            font-weight: 700;
            cursor: grab;
            touch-action: none;
        }

        .structured-preflight-tracker-widget-title:active {
            cursor: grabbing;
        }

        .structured-preflight-tracker-widget-name {
            display: inline-flex;
            align-items: center;
            gap: 0.42rem;
            min-width: 0;
        }

        .structured-preflight-tracker-widget-name i {
            color: #73d0ff;
        }

        #${TRACKER_WIDGET_ID}[data-spe-widget-control-corner="top-left"] #${TRACKER_WIDGET_PANEL_ID} > .structured-preflight-tracker-widget-title,
        #${NARRATOR_HANDOFF_WIDGET_ID}[data-spe-widget-control-corner="top-left"] #${NARRATOR_HANDOFF_WIDGET_PANEL_ID} > .structured-preflight-tracker-widget-title {
            padding-left: calc(0.7rem + ${TRACKER_WIDGET_BUTTON_SIZE}px);
        }
        #${TRACKER_WIDGET_ID}[data-spe-widget-control-corner="top-right"] #${TRACKER_WIDGET_PANEL_ID} > .structured-preflight-tracker-widget-title,
        #${NARRATOR_HANDOFF_WIDGET_ID}[data-spe-widget-control-corner="top-right"] #${NARRATOR_HANDOFF_WIDGET_PANEL_ID} > .structured-preflight-tracker-widget-title {
            padding-right: calc(0.55rem + ${TRACKER_WIDGET_BUTTON_SIZE}px);
        }
        #${TRACKER_WIDGET_ID}[data-spe-widget-control-corner^="bottom-"] #${TRACKER_WIDGET_PANEL_ID},
        #${NARRATOR_HANDOFF_WIDGET_ID}[data-spe-widget-control-corner^="bottom-"] #${NARRATOR_HANDOFF_WIDGET_PANEL_ID} {
            padding-bottom: ${TRACKER_WIDGET_BUTTON_SIZE}px;
        }
        #${TRACKER_WIDGET_ID}[data-spe-widget-control-corner] #${TRACKER_WIDGET_BUTTON_ID},
        #${NARRATOR_HANDOFF_WIDGET_ID}[data-spe-widget-control-corner] #${NARRATOR_HANDOFF_WIDGET_BUTTON_ID} {
            box-shadow: none;
        }
        #${TRACKER_WIDGET_ID}[data-spe-widget-control-corner="top-left"] #${TRACKER_WIDGET_BUTTON_ID},
        #${NARRATOR_HANDOFF_WIDGET_ID}[data-spe-widget-control-corner="top-left"] #${NARRATOR_HANDOFF_WIDGET_BUTTON_ID} {
            border-radius: 7px 0 6px 0;
        }
        #${TRACKER_WIDGET_ID}[data-spe-widget-control-corner="top-right"] #${TRACKER_WIDGET_BUTTON_ID},
        #${NARRATOR_HANDOFF_WIDGET_ID}[data-spe-widget-control-corner="top-right"] #${NARRATOR_HANDOFF_WIDGET_BUTTON_ID} {
            border-radius: 0 7px 0 6px;
        }
        #${TRACKER_WIDGET_ID}[data-spe-widget-control-corner="bottom-left"] #${TRACKER_WIDGET_BUTTON_ID},
        #${NARRATOR_HANDOFF_WIDGET_ID}[data-spe-widget-control-corner="bottom-left"] #${NARRATOR_HANDOFF_WIDGET_BUTTON_ID} {
            border-radius: 0 6px 0 7px;
        }
        #${TRACKER_WIDGET_ID}[data-spe-widget-control-corner="bottom-right"] #${TRACKER_WIDGET_BUTTON_ID},
        #${NARRATOR_HANDOFF_WIDGET_ID}[data-spe-widget-control-corner="bottom-right"] #${NARRATOR_HANDOFF_WIDGET_BUTTON_ID} {
            border-radius: 6px 0 7px 0;
        }

        .structured-preflight-tracker-widget-minimize {

            width: 28px;

            height: 28px;

            border-radius: 6px;

            display: grid;

            place-items: center;

            border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.2));

            background: transparent;

            color: inherit;

            cursor: pointer;
            touch-action: auto;

        }

        .structured-preflight-tracker-widget-minimize:hover,
        .structured-preflight-tracker-widget-minimize:focus-visible {
            border-color: color-mix(in srgb, #73d0ff 70%, var(--SmartThemeBorderColor, rgba(255,255,255,0.2)));
            color: #73d0ff;
        }

        #${TRACKER_WIDGET_ID}.spe-tracker-panel-dragging,
        #${TRACKER_WIDGET_ID}.spe-tracker-panel-dragging * {
            cursor: grabbing !important;
            user-select: none !important;
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
            display: grid;
            grid-template-columns: 50px minmax(0, 1fr);
            min-width: 0;
            min-height: 0;
            height: 100%;
        }
        #${TRACKER_WIDGET_PANEL_ID} > [data-structured-preflight-tracker-widget-body] {
            min-width: 0;
            min-height: 0;
            overflow: hidden;
        }
        .structured-preflight-tracker-tabs {
            display: flex;
            flex-direction: column;
            gap: 0.34rem;
            min-height: 0;
            padding: 0.48rem 0.28rem;
            border-right: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.16));
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 48%, transparent);
        }
        .structured-preflight-tracker-tab {
            --spe-tracker-tab-color: #73d0ff;
            display: grid;
            align-items: center;
            justify-content: center;
            width: 40px;
            min-width: 40px;
            height: 40px;
            padding: 0;
            border: 1px solid transparent;
            border-radius: 5px;
            background: transparent;
            color: var(--spe-tracker-tab-color);
            cursor: pointer;
            font-size: 1rem;
            line-height: 1;
        }
        .structured-preflight-tracker-tab-character { --spe-tracker-tab-color: #8bd49c; }
        .structured-preflight-tracker-tab-npcs { --spe-tracker-tab-color: #f3a6c8; }
        .structured-preflight-tracker-tab-inventory { --spe-tracker-tab-color: #f0c674; }
        .structured-preflight-tracker-tab-threads { --spe-tracker-tab-color: #c6a0f6; }
        .structured-preflight-tracker-tab:hover,
        .structured-preflight-tracker-tab-active {
            border-color: color-mix(in srgb, var(--spe-tracker-tab-color) 52%, transparent);
            background: color-mix(in srgb, var(--spe-tracker-tab-color) 17%, transparent);
            box-shadow: inset 3px 0 0 var(--spe-tracker-tab-color);
        }
        .structured-preflight-tracker-tab:focus-visible {
            outline: 2px solid var(--spe-tracker-tab-color);
            outline-offset: 1px;
        }
        .structured-preflight-tracker-sr-only {
            position: absolute;
            width: 1px;
            height: 1px;
            padding: 0;
            margin: -1px;
            overflow: hidden;
            clip: rect(0, 0, 0, 0);
            white-space: nowrap;
            border: 0;
        }
        .structured-preflight-tracker-scroll-region {
            min-width: 0;
            min-height: 0;
            overflow-x: hidden;
            overflow-y: auto;
            overscroll-behavior: contain;
            padding: 0 0.72rem 0.72rem;
            scrollbar-gutter: stable;
        }
        .structured-preflight-tracker-tab-panel {
            display: grid;
            align-content: start;
            min-width: 0;
        }
        .structured-preflight-tracker-panel-head {
            display: grid;
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: start;
            gap: 0.65rem;
            padding: 0.78rem 0;
            border-bottom: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.18));
        }
        .structured-preflight-tracker-panel-head-simple {
            display: block;
        }
        .structured-preflight-tracker-panel-head-with-action {
            grid-template-columns: minmax(0, 1fr);
            gap: 0.5rem;
        }
        .structured-preflight-tracker-panel-copy {
            min-width: 0;
        }
        .structured-preflight-tracker-panel-copy h2,
        .structured-preflight-tracker-panel-copy p {
            margin: 0;
        }
        .structured-preflight-tracker-panel-copy h2 {
            margin-top: 0.12rem;
            font-size: 1.08rem;
            line-height: 1.25;
            overflow-wrap: anywhere;
        }
        .structured-preflight-tracker-panel-copy p {
            margin-top: 0.2rem;
            color: color-mix(in srgb, var(--SmartThemeBodyColor, #eee) 66%, transparent);
            line-height: 1.35;
            overflow-wrap: anywhere;
        }
        .structured-preflight-tracker-eyebrow {
            color: color-mix(in srgb, #73d0ff 82%, var(--SmartThemeBodyColor, #eee));
            font-size: 0.68rem;
            font-weight: 800;
            line-height: 1;
            text-transform: uppercase;
        }
        .structured-preflight-tracker-row-status {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 1.45rem;
            padding: 0.14rem 0.42rem;
            border: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor, rgba(255,255,255,0.22)) 70%, transparent);
            border-radius: 5px;
            background: color-mix(in srgb, var(--SmartThemeBodyColor, #eee) 9%, transparent);
            font-size: 0.72rem;
            font-weight: 800;
            line-height: 1.1;
        }
        .structured-preflight-tracker-row-status {
            white-space: nowrap;
        }
        .structured-preflight-tracker-dashboard-section {
            display: grid;
            align-content: start;
            gap: 0.5rem;
            min-width: 0;
            padding: 0.72rem 0;
        }
        .structured-preflight-tracker-section-divider {
            border-top: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.18));
        }
        .structured-preflight-tracker-metric-grid {
            display: grid;
            grid-template-columns: repeat(4, minmax(0, 1fr));
            gap: 0;
            min-width: 0;
            border-top: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.16));
            border-bottom: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.16));
        }
        .structured-preflight-tracker-metric-grid-three {
            grid-template-columns: repeat(3, minmax(0, 1fr));
        }
        .structured-preflight-tracker-metric {
            min-width: 0;
            padding: 0.46rem 0.2rem;
            text-align: center;
        }
        .structured-preflight-tracker-metric + .structured-preflight-tracker-metric {
            border-left: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.16));
        }
        .structured-preflight-tracker-metric span,
        .structured-preflight-tracker-field span {
            display: block;
            color: color-mix(in srgb, var(--SmartThemeBodyColor, #eee) 64%, transparent);
            font-size: 0.68rem;
            font-weight: 800;
            line-height: 1.15;
            text-transform: uppercase;
        }
        .structured-preflight-tracker-metric strong,
        .structured-preflight-tracker-field strong {
            display: block;
            margin-top: 0.15rem;
            font-size: 0.88rem;
            line-height: 1.3;
            overflow-wrap: anywhere;
        }
        .structured-preflight-tracker-world-summary {
            padding-top: 0.78rem;
        }
        .structured-preflight-tracker-scene-field {
            display: grid;
            gap: 0.18rem;
            min-width: 0;
            padding-bottom: 0.54rem;
        }
        .structured-preflight-tracker-scene-field + .structured-preflight-tracker-scene-field {
            padding-top: 0.54rem;
            border-top: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor, rgba(255,255,255,0.18)) 74%, transparent);
        }
        .structured-preflight-tracker-scene-field span {
            color: #73d0ff;
            font-size: 0.68rem;
            font-weight: 800;
            text-transform: uppercase;
        }
        .structured-preflight-tracker-scene-field strong {
            overflow-wrap: anywhere;
        }
        .structured-preflight-tracker-section-title {
            display: inline-flex;
            align-items: center;
            gap: 0.4rem;
        }
        .structured-preflight-tracker-section-title i { color: #73d0ff; }
        .structured-preflight-tracker-section-title-character i { color: #8bd49c; }
        .structured-preflight-tracker-section-title-npcs i,
        .structured-preflight-tracker-section-title-relationship i { color: #f3a6c8; }
        .structured-preflight-tracker-section-title-gear i,
        .structured-preflight-tracker-section-title-currency i { color: #f0c674; }
        .structured-preflight-tracker-section-title-inventory i { color: #73d0ff; }
        .structured-preflight-tracker-section-title-threads i { color: #c6a0f6; }
        .structured-preflight-tracker-state-line {
            color: color-mix(in srgb, var(--SmartThemeBodyColor, #eee) 62%, transparent);
            font-size: 0.76rem;
            line-height: 1.35;
        }
        .structured-preflight-tracker-relationship-status {
            display: flex;
            align-items: center;
            gap: 0.42rem;
            min-width: 0;
            padding: 0.22rem 0;
        }
        .structured-preflight-tracker-relationship-status i {
            color: #f3a6c8;
        }
        .structured-preflight-tracker-plain-list,
        .structured-preflight-tracker-change-list,
        .structured-preflight-tracker-power-list {
            display: grid;
            min-width: 0;
        }
        .structured-preflight-tracker-plain-row {
            display: grid;
            grid-template-columns: auto minmax(0, 1fr) auto;
            align-items: center;
            gap: 0.55rem;
            min-width: 0;
            padding: 0.5rem 0;
            border-bottom: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor, rgba(255,255,255,0.18)) 72%, transparent);
        }
        .structured-preflight-tracker-plain-row:last-child,
        .structured-preflight-tracker-change-row:last-child,
        .structured-preflight-tracker-power-entry:last-child {
            border-bottom: 0;
        }
        .structured-preflight-tracker-list-copy {
            display: block;
            min-width: 0;
        }
        .structured-preflight-tracker-list-copy strong,
        .structured-preflight-tracker-list-copy small {
            display: block;
            overflow-wrap: anywhere;
        }
        .structured-preflight-tracker-list-copy small,
        .structured-preflight-tracker-subtle {
            color: color-mix(in srgb, var(--SmartThemeBodyColor, #eee) 62%, transparent);
            font-size: 0.74rem;
            line-height: 1.3;
        }
        .structured-preflight-tracker-avatar {
            display: inline-grid;
            place-items: center;
            width: 2rem;
            height: 2rem;
            border-radius: 50%;
            background: color-mix(in srgb, #6a56a5 28%, transparent);
            color: var(--SmartThemeBodyColor, #eee);
            font-size: 0.72rem;
            font-weight: 900;
            line-height: 1;
            flex: 0 0 auto;
        }
        .structured-preflight-tracker-empty-block {
            padding: 0.5rem 0;
            line-height: 1.35;
        }
        .structured-preflight-tracker-field-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.68rem 1rem;
            min-width: 0;
        }
        .structured-preflight-tracker-field {
            min-width: 0;
        }
        .structured-preflight-tracker-field-wide {
            grid-column: 1 / -1;
        }
        .structured-preflight-tracker-power-group {
            display: grid;
            gap: 0.42rem;
            min-width: 0;
        }
        .structured-preflight-tracker-power-entry {
            display: grid;
            gap: 0.12rem;
            padding: 0.5rem 0;
            border-bottom: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor, rgba(255,255,255,0.18)) 72%, transparent);
            line-height: 1.35;
        }
        .structured-preflight-tracker-power-entry strong,
        .structured-preflight-tracker-power-entry span {
            overflow-wrap: anywhere;
        }
        .structured-preflight-tracker-power-entry span,
        .structured-preflight-tracker-summary-copy {
            color: color-mix(in srgb, var(--SmartThemeBodyColor, #eee) 78%, transparent);
        }
        .structured-preflight-tracker-summary-copy {
            margin: 0;
            line-height: 1.4;
            overflow-wrap: anywhere;
        }
        .structured-preflight-tracker-progress {
            height: 0.45rem;
            overflow: hidden;
            border-radius: 999px;
            background: color-mix(in srgb, var(--SmartThemeBodyColor, #eee) 12%, transparent);
        }
        .structured-preflight-tracker-progress span {
            display: block;
            height: 100%;
            border-radius: inherit;
            background: #1f7a8c;
        }
        .structured-preflight-tracker-edit-surface {
            padding: 0.68rem;
            border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.18));
            border-radius: 7px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 30%, transparent);
        }
        .structured-preflight-tracker-edit-surface {
            min-width: 0;
        }
        .structured-preflight-tracker-change-row {
            display: grid;
            grid-template-columns: auto minmax(0, 1fr);
            align-items: start;
            gap: 0.5rem;
            min-width: 0;
            padding: 0.48rem 0;
            border-bottom: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor, rgba(255,255,255,0.18)) 72%, transparent);
            line-height: 1.35;
        }
        .structured-preflight-tracker-change-mark {
            width: 0.48rem;
            height: 0.48rem;
            margin-top: 0.28rem;
            border-radius: 50%;
            background: #1f7a8c;
        }
        .structured-preflight-tracker-section-head {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;
            flex-wrap: wrap;
        }
        .structured-preflight-tracker-title,
        .structured-preflight-tracker-heading {
            font-weight: 600;
        }
        .structured-preflight-tracker-title {
            font-size: 1rem;
            overflow-wrap: anywhere;
        }
        .structured-preflight-tracker-title {
            line-height: 1.15;
        }
        .structured-preflight-tracker-name-player,
        .structured-preflight-tracker-name-npc {
            font-weight: 800;
        }
        .structured-preflight-tracker-name-player {
            color: color-mix(in srgb, #73d0ff 84%, var(--SmartThemeBodyColor, #eee));
        }
        .structured-preflight-tracker-name-npc {
            color: color-mix(in srgb, #c7a7ff 82%, var(--SmartThemeBodyColor, #eee));
        }
        .structured-preflight-tracker-bound-companion {
            margin-top: 0.05rem;
            padding: 0.38rem 0.44rem;
            border: 1px solid color-mix(in srgb, #73d0ff 34%, var(--SmartThemeBorderColor, rgba(255,255,255,0.2)));
            border-radius: 6px;
            background: color-mix(in srgb, #1f7a8c 16%, var(--SmartThemeBlurTintColor, #000) 24%);
        }
        .structured-preflight-tracker-bound-companion > summary {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.5rem;
            cursor: pointer;
            list-style: none;
            user-select: none;
            font-weight: 800;
            line-height: 1.15;
        }
        .structured-preflight-tracker-bound-companion > summary::-webkit-details-marker {
            display: none;
        }
        .structured-preflight-tracker-bound-companion > summary::before {
            content: ">";
            color: color-mix(in srgb, #73d0ff 84%, var(--SmartThemeBodyColor, #eee));
            font-weight: 900;
        }
        .structured-preflight-tracker-bound-companion[open] > summary::before {
            content: "v";
        }
        .structured-preflight-tracker-bound-companion > summary span {
            flex: 1 1 auto;
            min-width: 0;
            color: color-mix(in srgb, #73d0ff 84%, var(--SmartThemeBodyColor, #eee));
            text-transform: uppercase;
            font-size: 0.72rem;
        }
        .structured-preflight-tracker-bound-companion > summary code {
            min-width: 0;
            overflow-wrap: anywhere;
            font-size: 0.82rem;
            font-weight: 900;
        }
        .structured-preflight-tracker-bound-body {
            display: grid;
            gap: 0.38rem;
            margin-top: 0.45rem;
        }
        .structured-preflight-tracker-bound-row {
            padding: 0.28rem 0.32rem;
            border-radius: 6px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 18%, transparent);
        }
        .structured-preflight-tracker-chip-row {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 0.32rem;
            min-width: 0;
        }
        .structured-preflight-tracker-chip {
            display: inline-flex;
            align-items: center;
            gap: 0.28rem;
            max-width: 100%;
            min-height: 1.5rem;
            padding: 0.12rem 0.42rem 0.12rem 0.12rem;
            border: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor, rgba(255,255,255,0.22)) 70%, transparent);
            border-radius: 5px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 46%, transparent);
            line-height: 1.25;
        }
        .structured-preflight-tracker-chip-label {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 1.24rem;
            padding: 0.08rem 0.34rem;
            border-radius: 4px;
            color: #f4f4f4;
            font-size: 0.72rem;
            font-weight: 800;
            line-height: 1;
            text-transform: uppercase;
            white-space: nowrap;
        }
        .structured-preflight-tracker-chip code {
            font-size: 0.78rem;
            font-weight: 700;
            white-space: normal;
            overflow-wrap: anywhere;
        }
        .structured-preflight-tracker-chip-label-toward-user {
            background: #1d6c65;
        }
        .structured-preflight-tracker-chip-label-condition {
            background: #285b78;
        }
        .structured-preflight-tracker-chip-label-b-f-h {
            background: #37415d;
        }
        .structured-preflight-tracker-chip-label-lock {
            background: #4a4655;
        }
        .structured-preflight-tracker-chip-label-behavior {
            background: #5b4a7a;
        }
        .structured-preflight-tracker-chip-label-rapport {
            background: #54428a;
        }
        .structured-preflight-tracker-chip-label-relationship {
            background: #286447;
        }
        .structured-preflight-tracker-chip-label-neutral {
            background: color-mix(in srgb, var(--SmartThemeBodyColor, #eee) 20%, transparent);
        }
        .structured-preflight-tracker-chip-good {
            background: color-mix(in srgb, #1f7a4d 42%, transparent);
        }
        .structured-preflight-tracker-chip-warn {
            background: color-mix(in srgb, #8a661f 42%, transparent);
        }
        .structured-preflight-tracker-chip-danger {
            background: color-mix(in srgb, #7c3238 46%, transparent);
        }
        .structured-preflight-tracker-detail-grid {
            display: grid;
            gap: 0.32rem;
            grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr));
        }
        .structured-preflight-tracker-detail-grid-compact {
            grid-template-columns: repeat(2, minmax(0, 1fr));
        }
        .structured-preflight-tracker-detail {
            display: flex;
            flex-direction: column;
            align-items: flex-start;
            gap: 0.12rem;
            min-width: 0;
            padding: 0.28rem 0.36rem;
            border-radius: 5px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 22%, transparent);
            line-height: 1.35;
        }
        .structured-preflight-tracker-detail-wide {
            grid-column: 1 / -1;
        }
        .structured-preflight-tracker-detail-label {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            justify-self: start;
            min-height: 1.15rem;
            padding: 0.08rem 0.34rem;
            border-radius: 4px;
            color: #f4f4f4;
            font-size: 0.76rem;
            font-weight: 800;
            line-height: 1.1;
            text-transform: uppercase;
            white-space: nowrap;
        }
        .structured-preflight-tracker-detail-label-personality {
            background: #5b4a7a;
        }
        .structured-preflight-tracker-detail-label-gear {
            background: #73521d;
        }
        .structured-preflight-tracker-detail-label-inventory {
            background: #1d6c65;
        }
        .structured-preflight-tracker-detail-label-currency {
            background: #486b39;
        }
        .structured-preflight-tracker-detail-label-abilities {
            background: #1f6578;
        }
        .structured-preflight-tracker-detail-label-spells {
            background: #6a4b8a;
        }
        .structured-preflight-tracker-detail-label-neutral {
            background: color-mix(in srgb, var(--SmartThemeBodyColor, #eee) 20%, transparent);
        }
        .structured-preflight-tracker-detail-value {
            min-width: 0;
            overflow-wrap: anywhere;
        }
        .structured-preflight-tracker-item-list-grid {
            display: grid;
            gap: 0.55rem;
            grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr));
        }
        .structured-preflight-tracker-item-list {
            display: grid;
            align-content: start;
            gap: 0.32rem;
            min-width: 0;
        }
        .structured-preflight-tracker-item-list-label {
            justify-self: start;
        }
        .structured-preflight-tracker-item-rows {
            display: grid;
            gap: 0.26rem;
            min-width: 0;
        }
        .structured-preflight-tracker-item-row {
            min-width: 0;
            padding: 0.32rem 0.42rem;
            border: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor, rgba(255,255,255,0.22)) 58%, transparent);
            border-radius: 5px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 28%, transparent);
            line-height: 1.28;
        }
        .structured-preflight-tracker-item-text {
            display: block;
            overflow-wrap: anywhere;
        }
        .structured-preflight-tracker-item-empty {
            padding: 0.32rem 0.42rem;
            border-radius: 5px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 18%, transparent);
        }
        .structured-preflight-tracker-npc-select {
            width: 100%;
            max-width: none;
            height: 2rem;
            min-height: 2rem;
            padding: 0.18rem 1.6rem 0.18rem 0.45rem;
            font-size: 0.8rem;
        }
        .structured-preflight-tracker-edit-toggle {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            gap: 0.35rem;
            justify-self: start;
            min-height: 1.9rem;
            padding: 0.28rem 0.58rem;
            white-space: nowrap;
        }
        .structured-preflight-tracker-quality-list {
            display: grid;
            min-width: 0;
        }
        .structured-preflight-tracker-quality-row {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.65rem;
            min-width: 0;
            min-height: 2.1rem;
            padding: 0.36rem 0;
            border-bottom: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor, rgba(255,255,255,0.18)) 72%, transparent);
        }
        .structured-preflight-tracker-quality-row:last-child {
            border-bottom: 0;
        }
        .structured-preflight-tracker-quality-row strong {
            min-width: 0;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }
        .structured-preflight-tracker-quality {
            flex: 0 0 auto;
            min-width: 4.7rem;
            padding: 0.14rem 0.4rem;
            border: 1px solid color-mix(in srgb, #f0c674 42%, var(--SmartThemeBorderColor, rgba(255,255,255,0.18)));
            border-radius: 5px;
            background: color-mix(in srgb, #f0c674 12%, transparent);
            color: color-mix(in srgb, #f0c674 88%, var(--SmartThemeBodyColor, #eee));
            font-size: 0.7rem;
            font-weight: 800;
            line-height: 1.2;
            text-align: center;
        }
        .structured-preflight-prose-guard-strip {
            min-width: 0;
            max-height: min(310px, 48vh);
            border-top: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.18));
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 58%, transparent);
            overflow: hidden;
        }
        .structured-preflight-prose-guard-strip[hidden],
        .structured-preflight-prose-guard-details[hidden] {
            display: none;
        }
        .structured-preflight-prose-guard-header {
            display: flex;
            align-items: center;
            justify-content: space-between;
            gap: 0.6rem;
            width: 100%;
            min-height: 35px;
            padding: 0.38rem 0.62rem;
            border: 0;
            background: transparent;
            color: inherit;
            cursor: pointer;
            text-align: left;
        }
        .structured-preflight-prose-guard-header:hover,
        .structured-preflight-prose-guard-header:focus-visible {
            background: color-mix(in srgb, #f0c674 10%, transparent);
        }
        .structured-preflight-prose-guard-heading {
            display: inline-flex;
            align-items: center;
            gap: 0.42rem;
            min-width: 0;
            font-weight: 750;
        }
        .structured-preflight-prose-guard-heading i {
            color: #f0c674;
        }
        .structured-preflight-prose-guard-count {
            display: inline-grid;
            place-items: center;
            min-width: 1.45rem;
            height: 1.25rem;
            padding: 0 0.3rem;
            border: 1px solid color-mix(in srgb, #f0c674 48%, transparent);
            border-radius: 5px;
            background: color-mix(in srgb, #f0c674 13%, transparent);
            color: color-mix(in srgb, #f0c674 88%, var(--SmartThemeBodyColor, #eee));
            font-size: 0.7rem;
            font-weight: 800;
        }
        .structured-preflight-prose-guard-details {
            display: grid;
            gap: 0.55rem;
            max-height: 265px;
            padding: 0.55rem 0.62rem 0.65rem;
            border-top: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor, rgba(255,255,255,0.18)) 72%, transparent);
            overflow-x: hidden;
            overflow-y: auto;
            overscroll-behavior: contain;
        }
        .structured-preflight-prose-guard-finding {
            display: grid;
            gap: 0.36rem;
            min-width: 0;
            padding-bottom: 0.55rem;
            border-bottom: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor, rgba(255,255,255,0.18)) 72%, transparent);
        }
        .structured-preflight-prose-guard-finding:last-of-type {
            padding-bottom: 0;
            border-bottom: 0;
        }
        .structured-preflight-prose-guard-meta {
            color: color-mix(in srgb, #f0c674 80%, var(--SmartThemeBodyColor, #eee));
            font-size: 0.69rem;
            font-weight: 750;
            overflow-wrap: anywhere;
        }
        .structured-preflight-prose-guard-failure {
            padding: 0.48rem 0.55rem;
            border-left: 2px solid color-mix(in srgb, #f0c674 72%, transparent);
            background: color-mix(in srgb, #f0c674 10%, transparent);
            color: var(--SmartThemeBodyColor, #eee);
            font-size: 0.75rem;
            line-height: 1.4;
            overflow-wrap: anywhere;
        }
        .structured-preflight-prose-guard-sentence {
            margin: 0;
            padding: 0.38rem 0.46rem;
            border-left: 2px solid color-mix(in srgb, #f0c674 58%, transparent);
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 30%, transparent);
            line-height: 1.35;
            overflow-wrap: anywhere;
            white-space: pre-wrap;
        }
        .structured-preflight-prose-guard-label {
            color: color-mix(in srgb, var(--SmartThemeBodyColor, #eee) 62%, transparent);
            font-size: 0.68rem;
            font-weight: 700;
            text-transform: uppercase;
        }
        .structured-preflight-prose-guard-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 0.35rem;
        }
        .structured-preflight-prose-guard-actions .menu_button {
            min-height: 1.75rem;
            padding: 0.2rem 0.48rem;
            border-radius: 5px;
            font-size: 0.75rem;
        }
        .structured-preflight-prose-guard-manual {
            display: grid;
            gap: 0.42rem;
            padding-top: 0.55rem;
            border-top: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor, rgba(255,255,255,0.18)) 72%, transparent);
        }
        .structured-preflight-prose-guard-manual label {
            display: grid;
            gap: 0.2rem;
            min-width: 0;
            font-size: 0.72rem;
            font-weight: 700;
        }
        .structured-preflight-prose-guard-manual .text_pole {
            width: 100%;
            min-width: 0;
            min-height: 1.9rem;
            font-size: 0.78rem;
        }
        .structured-preflight-prose-guard-empty {
            color: color-mix(in srgb, var(--SmartThemeBodyColor, #eee) 62%, transparent);
            font-size: 0.76rem;
        }
        .structured-preflight-tracker-resize-handle {
            position: absolute;
            z-index: 2;
            width: 18px;
            height: 18px;
            touch-action: none;
            background: transparent;
        }
        .structured-preflight-tracker-resize-handle[data-spe-resize-corner="top-right"] {
            right: 0;
            top: 0;
            cursor: nesw-resize;
        }
        .structured-preflight-tracker-resize-handle[data-spe-resize-corner="top-left"] {
            left: 0;
            top: 0;
            cursor: nwse-resize;
        }
        .structured-preflight-tracker-resize-handle[data-spe-resize-corner="bottom-left"] {
            left: 0;
            bottom: 0;
            cursor: nesw-resize;
        }
        .structured-preflight-tracker-resize-handle[data-spe-resize-corner="bottom-right"] {
            right: 0;
            bottom: 0;
            cursor: nwse-resize;
        }
        .structured-preflight-tracker-resize-grip {
            position: absolute;
            width: 10px;
            height: 10px;
            border-color: color-mix(in srgb, var(--SmartThemeBodyColor, #eee) 48%, transparent);
            border-style: solid;
            border-width: 0;
        }
        .structured-preflight-tracker-resize-handle[data-spe-resize-corner="top-left"] .structured-preflight-tracker-resize-grip {
            left: 4px;
            top: 4px;
            border-left-width: 2px;
            border-top-width: 2px;
        }
        .structured-preflight-tracker-resize-handle[data-spe-resize-corner="top-right"] .structured-preflight-tracker-resize-grip {
            right: 4px;
            top: 4px;
            border-right-width: 2px;
            border-top-width: 2px;
        }
        .structured-preflight-tracker-resize-handle[data-spe-resize-corner="bottom-left"] .structured-preflight-tracker-resize-grip {
            left: 4px;
            bottom: 4px;
            border-left-width: 2px;
            border-bottom-width: 2px;
        }
        .structured-preflight-tracker-resize-handle[data-spe-resize-corner="bottom-right"] .structured-preflight-tracker-resize-grip {
            right: 4px;
            bottom: 4px;
            border-right-width: 2px;
            border-bottom-width: 2px;
        }
        #${TRACKER_WIDGET_ID}.spe-tracker-resizing,
        #${TRACKER_WIDGET_ID}.spe-tracker-resizing * {
            user-select: none !important;
        }
        .structured-preflight-tracker-widget-minimize {
            position: relative;
            z-index: 3;
        }
        .structured-preflight-tracker-edit-actions {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 0.32rem;
            margin-left: auto;
        }
        .structured-preflight-tracker-edit-actions .menu_button {
            min-height: 1.7rem;
            padding: 0.18rem 0.48rem;
            border-radius: 5px;
            font-size: 0.78rem;
            line-height: 1.1;
        }
        .structured-preflight-tracker-edit-list {
            gap: 0.28rem;
        }
        .structured-preflight-tracker-edit-rows,
        .structured-preflight-tracker-edit-add-row {
            display: grid;
            gap: 0.28rem;
            width: 100%;
        }
        .structured-preflight-tracker-edit-row,
        .structured-preflight-tracker-edit-add-row {
            grid-template-columns: minmax(0, 1fr) auto;
            align-items: center;
        }
        .structured-preflight-tracker-edit-input {
            min-width: 0;
            width: 100%;
            height: 1.9rem;
            padding: 0.18rem 0.42rem;
            font-size: 0.82rem;
        }
        .structured-preflight-tracker-edit-add,
        .structured-preflight-tracker-edit-remove {
            width: 1.9rem;
            min-width: 1.9rem;
            height: 1.9rem;
            padding: 0;
            border-radius: 5px;
            font-weight: 800;
            line-height: 1;
        }
        .structured-preflight-tracker-muted,
        .structured-preflight-tracker-empty {
            opacity: 0.78;
        }
        @media (max-width: 760px) {
            .structured-preflight-tracker-panel-head {
                grid-template-columns: 1fr;
            }
        }
        @media (max-width: 520px) {
            .structured-preflight-tracker-tabs {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .structured-preflight-tracker-metric-grid,
            .structured-preflight-tracker-field-grid {
                grid-template-columns: repeat(2, minmax(0, 1fr));
            }
            .structured-preflight-tracker-detail-grid-compact {
                grid-template-columns: 1fr;
            }
            .structured-preflight-tracker-detail {
                gap: 0.12rem;
            }
            .structured-preflight-tracker-chip {
                width: 100%;
                justify-content: space-between;
            }
            .structured-preflight-tracker-section-head {
                align-items: flex-start;
            }
        }
        @media (max-width: 420px) {
            .structured-preflight-tracker-field-grid {
                grid-template-columns: 1fr;
            }
            .structured-preflight-tracker-field-wide {
                grid-column: auto;
            }
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

        #structured_preflight_narrator_handoff_widget {
            --spe-widget-accent: #c6a0f6;
            position: fixed;
            left: 24px;
            top: 120px;
            width: 0;
            height: 0;
            z-index: 3006;
            overflow: visible;
            color: var(--SmartThemeBodyColor, #eee);
            font-size: 0.88rem;
        }
        #${TRACKER_WIDGET_ID}.spe-story-engine-top-bar-screen-open,
        #${NARRATOR_HANDOFF_WIDGET_ID}.spe-story-engine-top-bar-screen-open {
            visibility: hidden !important;
            pointer-events: none !important;
        }
        #structured_preflight_narrator_handoff_toggle {
            position: absolute;
            left: 0;
            top: 0;
            width: 36px;
            height: 36px;
            display: grid;
            place-items: center;
            border: 1px solid color-mix(in srgb, var(--spe-widget-accent) 78%, var(--SmartThemeBorderColor, rgba(255,255,255,0.24)));
            border-radius: 8px;
            background: color-mix(in srgb, var(--spe-widget-accent) 14%, var(--SmartThemeBlurTintColor, #000));
            color: var(--spe-widget-accent);
            box-shadow: 0 10px 26px rgba(0,0,0,0.28);
            cursor: grab;
            touch-action: none;
            user-select: none;
            backdrop-filter: blur(8px);
            z-index: 3;
        }
        #structured_preflight_narrator_handoff_toggle:active {
            cursor: grabbing;
        }
        #structured_preflight_narrator_handoff_toggle[hidden],
        #structured_preflight_narrator_handoff_panel[hidden] {
            display: none;
        }
        #structured_preflight_narrator_handoff_panel {
            position: absolute;
            left: 0;
            top: 0;
            display: grid;
            grid-template-rows: auto minmax(0, 1fr);
            width: 450px;
            min-width: 1px;
            max-width: max(1px, calc(100vw - 16px));
            max-width: max(1px, calc(100dvw - 16px));
            height: 550px;
            min-height: 1px;
            max-height: calc(100vh - 16px);
            max-height: calc(100dvh - 16px);
            margin: 0;
            padding: 0;
            border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.2));
            border-radius: 8px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 84%, transparent);
            box-shadow: 0 14px 36px rgba(0,0,0,0.35);
            overflow: hidden;
            backdrop-filter: blur(10px);
            box-sizing: border-box;
            z-index: 2;
        }
        #structured_preflight_narrator_handoff_panel > .structured-preflight-tracker-widget-title {
            cursor: grab;
        }
        #structured_preflight_narrator_handoff_widget.spe-narrator-handoff-dragging,
        #structured_preflight_narrator_handoff_widget.spe-narrator-handoff-panel-dragging,
        #structured_preflight_narrator_handoff_widget.spe-narrator-handoff-panel-dragging * {
            user-select: none;
        }
        #structured_preflight_narrator_handoff_widget.spe-narrator-handoff-panel-dragging * {
            cursor: grabbing !important;
            user-select: none !important;
        }
        #structured_preflight_narrator_handoff_widget.spe-narrator-handoff-resizing,
        #structured_preflight_narrator_handoff_widget.spe-narrator-handoff-resizing * {
            user-select: none !important;
        }
        .structured-preflight-narrator-handoff-widget-body {
            min-width: 0;
            min-height: 0;
            overflow: auto;
            padding: 0.72rem;
            scrollbar-gutter: stable;
        }
        .structured-preflight-narrator-handoff-widget-content {
            min-width: 0;
        }
        .structured-preflight-narrator-handoff-widget-meta {
            margin-bottom: 0.55rem;
            color: color-mix(in srgb, #c6a0f6 82%, var(--SmartThemeBodyColor, #eee));
            font-size: 0.72rem;
            font-weight: 700;
            text-transform: uppercase;
        }
        .structured-preflight-narrator-handoff-widget-content pre {
            margin: 0;
            white-space: pre-wrap;
            overflow-wrap: anywhere;
            line-height: 1.38;
        }

    `;

    document.head.append(style);
}

function getMessageElement(messageId) {
    if (typeof document === 'undefined') return null;
    return document.querySelector(`#chat .mes[mesid="${messageId}"]`);
}

function getMessageTextElement(messageId) {
    return getMessageElement(messageId)?.querySelector?.('.mes_text') || null;
}

function normalizeProseGuardMessageId(value) {
    if (value === null || value === undefined || value === '') return null;
    const normalizedId = Number(value);
    return Number.isInteger(normalizedId) && normalizedId >= 0 ? normalizedId : null;
}

function getProseGuardChatMessage(messageId, context = getContext()) {
    const normalizedId = normalizeProseGuardMessageId(messageId);
    if (normalizedId == null || !Array.isArray(context?.chat)) return null;
    return context.chat[normalizedId] || null;
}

function captureProseGuardDraftSnapshot(context, type, expectedMessageId) {
    const normalizedId = normalizeProseGuardMessageId(expectedMessageId);
    const originalMessage = normalizedId == null ? null : getProseGuardChatMessage(normalizedId, context);
    state.proseGuardDraftSnapshot = {
        chatId: String(getChatId(context) || ''),
        chatRef: context?.chat || null,
        type: String(type || 'normal'),
        expectedMessageId: normalizedId,
        originalChatLength: Array.isArray(context?.chat) ? context.chat.length : 0,
        originalMessage: originalMessage && !originalMessage.is_user ? clone(originalMessage) : null,
    };
}

function isCurrentProseGuardDraftSnapshot(context, snapshot = state.proseGuardDraftSnapshot) {
    if (!snapshot || !Array.isArray(context?.chat)) return false;
    if (snapshot.chatRef && snapshot.chatRef === context.chat) return true;
    const chatId = String(getChatId(context) || '');
    return Boolean(snapshot.chatId && chatId && snapshot.chatId === chatId);
}

async function restoreProseGuardDraftSnapshot(context, messageId) {
    const snapshot = state.proseGuardDraftSnapshot;
    if (!isCurrentProseGuardDraftSnapshot(context, snapshot)) return false;

    const targetId = normalizeProseGuardMessageId(messageId) ?? snapshot.expectedMessageId;
    if (targetId == null || targetId !== snapshot.expectedMessageId) return false;
    const targetMessage = context.chat[targetId];
    let restored = false;
    let trackerRestored = false;
    let progressionRestored = false;

    if (snapshot.originalMessage && targetMessage && !targetMessage.is_user) {
        const original = clone(snapshot.originalMessage);
        for (const key of Object.keys(targetMessage)) delete targetMessage[key];
        Object.assign(targetMessage, original);
        if (typeof context.updateMessageBlock === 'function') {
            try {
                await context.updateMessageBlock(targetId, targetMessage);
            } catch (error) {
                console.warn(`[${EXTENSION_NAME}] could not rerender the restored message after Prose Guard failure.`, error);
            }
        }
        const textElement = getMessageTextElement(targetId);
        if (textElement) textElement.textContent = String(targetMessage.extra?.display_text ?? targetMessage.mes ?? '');
        trackerRestored = restoreTrackerFromMessageDisplaySnapshot(targetId, context);
        progressionRestored = restoreProgressionFromMessageSwipe(targetId, context);
        restored = true;
    } else if (!snapshot.originalMessage
        && targetId >= snapshot.originalChatLength
        && targetId === context.chat.length - 1
        && targetMessage
        && !targetMessage.is_user) {
        context.chat.splice(targetId, 1);
        getMessageElement(targetId)?.remove();
        restored = true;
    }

    if (!restored) return false;
    try {
        await saveChat(context, { fallbackToMetadata: true });
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] could not persist the restored chat after Prose Guard failure.`, error);
    }
    state.chatSignature = captureChatSignature(context);
    if (trackerRestored) renderTrackerWidget(context);
    if (progressionRestored) renderProgressionCard(context);
    return true;
}

async function discardFailedProseGuardDraft(context, messageId) {
    const targetId = normalizeProseGuardMessageId(messageId);
    if (targetId == null || !Array.isArray(context?.chat)) return false;

    const targetMessage = context.chat[targetId];
    if (!targetMessage || targetMessage.is_user) return false;

    if (targetId === context.chat.length - 1) {
        context.chat.splice(targetId, 1);
        getMessageElement(targetId)?.remove();
    } else {
        const failedText = String(targetMessage.mes ?? '');
        targetMessage.extra = targetMessage.extra || {};
        targetMessage.mes = '';
        targetMessage.extra.display_text = '';
        if (Array.isArray(targetMessage.swipes)) {
            const activeSwipe = Number(targetMessage.swipe_id);
            targetMessage.swipes = targetMessage.swipes.map((swipe, index) => (
                index === activeSwipe || String(swipe ?? '') === failedText ? '' : swipe
            ));
        }
        if (typeof context.updateMessageBlock === 'function') {
            try {
                await context.updateMessageBlock(targetId, targetMessage);
            } catch (error) {
                console.warn(`[${EXTENSION_NAME}] could not rerender the discarded message after Prose Guard failure.`, error);
            }
        }
        const textElement = getMessageTextElement(targetId);
        if (textElement) textElement.textContent = '';
    }

    try {
        await saveChat(context, { fallbackToMetadata: true });
    } catch (error) {
        console.warn(`[${EXTENSION_NAME}] could not persist the discarded message after Prose Guard failure.`, error);
    }
    state.chatSignature = captureChatSignature(context);
    return true;
}

async function resolveFailedProseGuardDraft(context, messageId) {
    if (await restoreProseGuardDraftSnapshot(context, messageId)) return 'restored';
    if (await discardFailedProseGuardDraft(context, messageId)) return 'discarded';

    const textElement = getMessageTextElement(messageId);
    if (textElement) textElement.textContent = '';
    return 'cleared';
}

function reapplyProseGuardHiddenMessages() {
    if (typeof document === 'undefined') return;
    for (const messageId of state.proseGuardHiddenMessageIds) {
        const messageElement = getMessageElement(messageId);
        if (messageElement) hideProseGuardMessageElement(messageElement, messageId);
    }
}

function ensureProseGuardDisplayStyles() {
    if (typeof document === 'undefined' || document.getElementById(PROSE_GUARD_DISPLAY_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = PROSE_GUARD_DISPLAY_STYLE_ID;
    style.textContent = `
        #chat .mes.${PROSE_GUARD_HIDDEN_MESSAGE_CLASS} .mes_text {
            display: none !important;
        }
    `;
    document.head.append(style);
}

function setProseGuardExpectedMessageHidden(messageId = null) {
    if (typeof document === 'undefined') return;

    document.getElementById(PROSE_GUARD_EXPECTED_STYLE_ID)?.remove();
    const normalizedId = normalizeProseGuardMessageId(messageId);
    if (normalizedId == null) return;
    if (!canHideExpectedProseGuardMessage(normalizedId)) return;

    ensureProseGuardDisplayStyles();
    const style = document.createElement('style');
    style.id = PROSE_GUARD_EXPECTED_STYLE_ID;
    style.textContent = `
        #chat .mes[mesid="${normalizedId}"]:not([is_user="true"]) .mes_text {
            display: none !important;
        }
    `;
    document.head.append(style);
}

function isExpectedProseGuardMessageElement(node) {
    if (!node || node.getAttribute?.('is_user') === 'true') return false;

    const expectedMessageId = normalizeProseGuardMessageId(state.proseGuardExpectedMessageId);
    if (expectedMessageId == null) return false;

    const messageId = normalizeProseGuardMessageId(node.getAttribute?.('mesid'));
    return messageId != null && messageId === expectedMessageId;
}

function hideProseGuardMessageElement(messageElement, messageId = null) {
    if (!messageElement) return false;

    ensureProseGuardDisplayStyles();
    messageElement.classList?.add(PROSE_GUARD_HIDDEN_MESSAGE_CLASS);
    const normalizedId = normalizeProseGuardMessageId(messageId ?? messageElement.getAttribute?.('mesid'));
    if (normalizedId != null) state.proseGuardHiddenMessageIds.add(normalizedId);
    return true;
}

function hideProseGuardMessageById(messageId) {
    const messageElement = getMessageElement(messageId);
    return hideProseGuardMessageElement(messageElement, messageId);
}

function hasPendingProseGuardGenerationInput() {
    if (state.pendingRun?.adventureIntro) return true;
    const pendingText = String(state.pendingGeneration?.latestUserText || state.pendingGeneration?.rawUserText || state.pendingGeneration?.adventureStartPrompt || '').trim();
    return Boolean(pendingText);
}

function hasActiveProseGuardDisplayRun() {
    return Boolean(state.pendingRun || state.lastNarratorHandoff);
}

function canHideExpectedProseGuardMessage(messageId) {
    const normalizedId = normalizeProseGuardMessageId(messageId);
    if (normalizedId == null) return false;
    if (!hasActiveProseGuardDisplayRun()) return false;
    if (state.pendingRun?.adventureIntro) return true;

    const context = getContext();
    const priorMessages = Array.isArray(context?.chat) ? context.chat.slice(0, normalizedId) : [];
    const hasPriorUserMessage = priorMessages.some(message => message?.is_user || message?.role === 'user');
    return hasPriorUserMessage || hasPendingProseGuardGenerationInput();
}

function tryAttachProseGuardPendingMessage() {
    if (!state.proseGuardHideNextMessage || typeof document === 'undefined') return false;
    if (!hasActiveProseGuardDisplayRun()) {
        releaseProseGuardDisplayIntercept();
        return false;
    }

    const chatElement = document.getElementById('chat');
    if (!chatElement) return false;

    const expectedMessageId = normalizeProseGuardMessageId(state.proseGuardExpectedMessageId);
    if (expectedMessageId == null || !canHideExpectedProseGuardMessage(expectedMessageId)) {
        releaseProseGuardDisplayIntercept();
        return false;
    }

    const messageElement = chatElement.querySelector(`.mes[mesid="${expectedMessageId}"]:not([is_user="true"])`);
    if (!messageElement) return false;

    state.proseGuardHideNextMessage = false;
    hideProseGuardMessageElement(messageElement, expectedMessageId);
    return true;
}

function shouldUseProseGuardDisplayIntercept(type) {
    const normalizedType = String(type || 'normal');
    return isStoryEngineEnabled()
        && getProseGuardMode() !== PROSE_GUARD_MODES.OFF
        && normalizedType !== 'impersonate'
        && Boolean(state.pendingGeneration)
        && hasPendingProseGuardGenerationInput()
        && hasActiveProseGuardDisplayRun()
        && ['normal', 'swipe', 'regenerate', 'continue'].includes(normalizedType);
}

function releaseProseGuardDisplayIntercept({ messageId = null } = {}) {
    const normalizedMessageId = normalizeProseGuardMessageId(messageId);
    const hasSpecificMessageId = normalizedMessageId != null;
    const idsToRelease = hasSpecificMessageId
        ? [normalizedMessageId]
        : [...state.proseGuardHiddenMessageIds];
    for (const id of idsToRelease) {
        getMessageElement(id)?.classList?.remove(PROSE_GUARD_HIDDEN_MESSAGE_CLASS);
        state.proseGuardHiddenMessageIds.delete(id);
    }
    if (!hasSpecificMessageId && typeof document !== 'undefined') {
        document
            .querySelectorAll(`#chat .mes.${PROSE_GUARD_HIDDEN_MESSAGE_CLASS}`)
            .forEach(element => element.classList.remove(PROSE_GUARD_HIDDEN_MESSAGE_CLASS));
        state.proseGuardHiddenMessageIds.clear();
    }
    setProseGuardExpectedMessageHidden(null);

    state.proseGuardExpectedMessageId = null;
    state.proseGuardHideNextMessage = false;
    state.proseGuardGenerationType = null;
    state.proseGuardDraftSnapshot = null;
}

function beginProseGuardDisplayIntercept(type, dryRun = false) {
    ensureProseGuardDisplayInterceptor();

    if (dryRun || !shouldUseProseGuardDisplayIntercept(type) || typeof document === 'undefined') {
        releaseProseGuardDisplayIntercept();
        return;
    }

    const normalizedType = String(type || 'normal');
    releaseProseGuardDisplayIntercept();
    state.proseGuardGenerationType = normalizedType;
    const context = getContext();
    const lastMessageId = Array.isArray(context?.chat) ? context.chat.length - 1 : null;
    const lastMessage = getProseGuardChatMessage(lastMessageId, context);
    const reusesAssistantMessage = ['swipe', 'regenerate', 'continue'].includes(normalizedType)
        && lastMessageId != null
        && lastMessage
        && !lastMessage.is_user;
    state.proseGuardExpectedMessageId = reusesAssistantMessage
        ? lastMessageId
        : Array.isArray(context?.chat) ? context.chat.length : null;
    captureProseGuardDraftSnapshot(context, normalizedType, state.proseGuardExpectedMessageId);
    setProseGuardExpectedMessageHidden(state.proseGuardExpectedMessageId);
    if (reusesAssistantMessage && hideProseGuardMessageById(state.proseGuardExpectedMessageId)) return;
    state.proseGuardHideNextMessage = true;
    tryAttachProseGuardPendingMessage();
}

function ensureProseGuardDisplayInterceptor() {
    if (typeof document === 'undefined' || typeof MutationObserver === 'undefined') return;
    if (!isStoryEngineEnabled()) {
        disableStoryEngineRuntime();
        return;
    }
    ensureProseGuardDisplayStyles();
    if (!hasActiveProseGuardDisplayRun()) {
        releaseProseGuardDisplayIntercept();
    }
    tryAttachProseGuardPendingMessage();
    if (state.proseGuardChatObserver) return;

    const chatElement = document.getElementById('chat');
    if (!chatElement) return;

    state.proseGuardChatObserver = new MutationObserver(mutations => {
        if (!state.proseGuardHideNextMessage && !state.proseGuardHiddenMessageIds.size) return;
        if (!hasActiveProseGuardDisplayRun()) {
            releaseProseGuardDisplayIntercept();
            return;
        }

        reapplyProseGuardHiddenMessages();

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node?.nodeType !== Node.ELEMENT_NODE) continue;

                const messageNodes = [
                    ...(node.classList?.contains('mes') ? [node] : []),
                    ...Array.from(node.querySelectorAll?.('.mes') || []),
                ];
                for (const messageNode of messageNodes) {
                    const messageId = normalizeProseGuardMessageId(messageNode.getAttribute('mesid'));
                    const isProtected = messageId != null
                        && state.proseGuardHiddenMessageIds.has(messageId);
                    if (!isProtected && !isExpectedProseGuardMessageElement(messageNode)) continue;

                    state.proseGuardHideNextMessage = false;
                    hideProseGuardMessageElement(messageNode, messageId);
                    return;
                }
            }
        }
    });
    state.proseGuardChatObserver.observe(chatElement, { childList: true });
    tryAttachProseGuardPendingMessage();
}

function renderNarratorHandoffBlockForMessage(messageId, payload = null, context = getContext()) {
    const message = context?.chat?.[messageId];
    const handoff = payload || getMessageNarratorHandoff(message);
    if (typeof document === 'undefined') return;

    const messageElement = getMessageElement(messageId);
    if (!messageElement) return;



    messageElement.querySelector(`.${NARRATOR_HANDOFF_BLOCK_CLASS}`)?.remove();

    const settings = getSettings();
    if (!handoff?.text || settings.narratorHandoffEnabled !== true
        || normalizeNarratorHandoffDisplayMode(settings.narratorHandoffDisplayMode) !== NARRATOR_HANDOFF_DISPLAY_MODES.IN_CHAT) return;



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

    const messageElement = getMessageElement(messageId);
    if (!messageElement) return;

    messageElement.querySelector(`.${TRACKER_DISPLAY_BLOCK_CLASS}`)?.remove();
}


function renderAllTrackerDisplayBlocks(context = getContext()) {
    if (!isStoryEngineEnabled()) {
        if (typeof document !== 'undefined') {
            document.getElementById(TRACKER_WIDGET_ID)?.remove();
            document.getElementById(NARRATOR_HANDOFF_WIDGET_ID)?.remove();
        }
        return;
    }
    if (!Array.isArray(context?.chat)) return;
    context.chat.forEach((message, index) => {

        if (!message?.is_user) {

            renderNarratorHandoffBlockForMessage(index, null, context);

            renderTrackerDisplayBlockForMessage(index, null, context);

        }

    });

    renderTrackerWidget(context);
    renderNarratorHandoffWidget(context);

}



function getLatestNarratorHandoffEntry(context = getContext()) {
    if (!Array.isArray(context?.chat)) return null;
    for (let messageId = context.chat.length - 1; messageId >= 0; messageId -= 1) {
        const message = context.chat[messageId];
        if (!isAssistantNarrationMessage(message)) continue;
        const handoff = getMessageNarratorHandoff(message);
        if (handoff?.text) return { messageId, message, handoff };
    }
    return null;
}

function normalizeTrackerWidgetSavedDimension(value, fallback, minimum) {
    const numeric = Number(value);
    const desired = Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
    return Math.round(Math.max(1, Number(minimum) || 1, desired));
}

function getNarratorHandoffWidgetLayout(settings = getSettings()) {
    const collapsed = settings.narratorHandoffWidgetCollapsed !== false;
    const storedWidth = Number(settings.narratorHandoffWidgetWidth);
    const storedHeight = Number(settings.narratorHandoffWidgetHeight);
    const width = collapsed
        ? TRACKER_WIDGET_BUTTON_SIZE
        : normalizeTrackerWidgetSavedDimension(storedWidth, TRACKER_WIDGET_DEFAULT_WIDTH, TRACKER_WIDGET_MIN_WIDTH);
    const height = collapsed
        ? TRACKER_WIDGET_BUTTON_SIZE
        : normalizeTrackerWidgetSavedDimension(storedHeight, TRACKER_WIDGET_DEFAULT_HEIGHT, TRACKER_WIDGET_MIN_HEIGHT);
    const viewportWidth = Math.max(1, Number(globalThis.innerWidth) || 1200);
    const storedX = Number(settings.narratorHandoffWidgetX);
    const defaultX = Math.max(8, viewportWidth - TRACKER_WIDGET_BUTTON_SIZE - 24);
    const x = settings.narratorHandoffWidgetX === null || settings.narratorHandoffWidgetX === undefined
        ? defaultX
        : storedX;
    const storedY = Number(settings.narratorHandoffWidgetY);
    const anchor = clampTrackerWidgetAnchorPosition(
        Number.isFinite(x) ? x : defaultX,
        Number.isFinite(storedY) ? storedY : 120,
        TRACKER_WIDGET_PANEL_PREFERRED_SIDES.NARRATOR_HANDOFF,
    );
    if (collapsed) {
        return { collapsed, x: anchor.x, y: anchor.y, width, height, panelLeft: 0, panelTop: 0 };
    }
    const placement = getTrackerWidgetPanelPlacement(
        anchor.x,
        anchor.y,
        width,
        height,
        TRACKER_WIDGET_PANEL_PREFERRED_SIDES.NARRATOR_HANDOFF,
    );
    const position = clampTrackerWidgetAnchorPosition(
        anchor.x,
        anchor.y,
        TRACKER_WIDGET_PANEL_PREFERRED_SIDES.NARRATOR_HANDOFF,
    );
    return {
        collapsed,
        x: position.x,
        y: position.y,
        width,
        height,
        panelWidth: placement.panelWidth ?? width,
        panelHeight: placement.panelHeight ?? height,
        panelLeft: placement.left,
        panelTop: placement.top,
        protectedResizeCorner: placement.protectedResizeCorner,
    };
}

function applyNarratorHandoffWidgetLayout(widget, settings = getSettings()) {
    if (!widget) return null;
    const layout = getNarratorHandoffWidgetLayout(settings);
    widget.style.left = `${layout.x}px`;
    widget.style.top = `${layout.y}px`;
    const button = widget.querySelector(`#${NARRATOR_HANDOFF_WIDGET_BUTTON_ID}`);
    const panel = widget.querySelector(`#${NARRATOR_HANDOFF_WIDGET_PANEL_ID}`);
    if (button) {
        button.hidden = false;
        button.title = layout.collapsed ? 'Open Narration Handoff' : 'Collapse Narration Handoff';
        button.setAttribute('aria-label', button.title);
        button.setAttribute('aria-expanded', String(!layout.collapsed));
    }
    if (layout.collapsed) widget.removeAttribute('data-spe-widget-control-corner');
    else widget.setAttribute('data-spe-widget-control-corner', layout.protectedResizeCorner || 'top-left');
    if (panel) {
        panel.hidden = layout.collapsed;
        panel.style.width = `${layout.panelWidth ?? layout.width}px`;
        panel.style.height = `${layout.panelHeight ?? layout.height}px`;
        panel.style.left = `${layout.panelLeft}px`;
        panel.style.top = `${layout.panelTop}px`;
        if (!layout.collapsed) {
            syncTrackerWidgetResizeHandles(widget, layout, '[data-spe-narrator-handoff-resize-handle]');
        }
    }
    return layout;
}

function syncNarratorHandoffWidgetViewport() {
    if (typeof document === 'undefined') return;
    const widget = document.getElementById(NARRATOR_HANDOFF_WIDGET_ID);
    if (!widget) return;
    const settings = getSettings();
    const layout = applyNarratorHandoffWidgetLayout(widget, settings);
    if (!layout) return;
    let changed = false;
    const nextValues = {
        narratorHandoffWidgetX: layout.x,
        narratorHandoffWidgetY: layout.y,
    };
    if (!layout.collapsed) {
        nextValues.narratorHandoffWidgetWidth = layout.width;
        nextValues.narratorHandoffWidgetHeight = layout.height;
    }
    for (const [key, value] of Object.entries(nextValues)) {
        if (Number(settings[key]) !== Number(value)) {
            settings[key] = value;
            changed = true;
        }
    }
    if (changed) saveExtensionSettings();
}

function ensureNarratorHandoffWidgetViewportHandler() {
    if (!state.narratorHandoffWidgetViewportHandler && typeof globalThis.addEventListener === 'function') {
        state.narratorHandoffWidgetViewportHandler = () => syncNarratorHandoffWidgetViewport();
        globalThis.addEventListener('resize', state.narratorHandoffWidgetViewportHandler);
    }
}

function clearNarratorHandoffWidgetViewportHandler() {
    if (state.narratorHandoffWidgetViewportHandler && typeof globalThis.removeEventListener === 'function') {
        globalThis.removeEventListener('resize', state.narratorHandoffWidgetViewportHandler);
        state.narratorHandoffWidgetViewportHandler = null;
    }
}

function attachNarratorHandoffWidgetHandlers(widget) {
    const button = widget.querySelector('#' + NARRATOR_HANDOFF_WIDGET_BUTTON_ID);
    const title = widget.querySelector('.structured-preflight-tracker-widget-title');
    let drag = null;

    const cancelButtonDrag = () => {
        if (!drag) return;
        drag = null;
        widget.classList.remove('spe-narrator-handoff-dragging');
        syncNarratorHandoffWidgetViewport();
    };

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
        widget.classList.add('spe-narrator-handoff-dragging');
        button.setPointerCapture?.(event.pointerId);
    });

    button?.addEventListener('pointermove', event => {
        if (!drag) return;
        const x = event.clientX - drag.offsetX;
        const y = event.clientY - drag.offsetY;
        if (Math.abs(event.clientX - drag.startX) > 3 || Math.abs(event.clientY - drag.startY) > 3) drag.moved = true;
        const pos = clampTrackerWidgetAnchorPosition(x, y, TRACKER_WIDGET_PANEL_PREFERRED_SIDES.NARRATOR_HANDOFF);
        applyNarratorHandoffWidgetLayout(widget, {
            ...getSettings(),
            narratorHandoffWidgetX: pos.x,
            narratorHandoffWidgetY: pos.y,
        });
    });

    button?.addEventListener('pointerup', event => {
        if (!drag) return;
        const moved = drag.moved;
        const settings = getSettings();
        const rect = widget.getBoundingClientRect();
        const pos = clampTrackerWidgetAnchorPosition(
            rect.left,
            rect.top,
            TRACKER_WIDGET_PANEL_PREFERRED_SIDES.NARRATOR_HANDOFF,
        );
        drag = null;
        widget.classList.remove('spe-narrator-handoff-dragging');
        if (button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);
        settings.narratorHandoffWidgetX = pos.x;
        settings.narratorHandoffWidgetY = pos.y;
        if (!moved) settings.narratorHandoffWidgetCollapsed = settings.narratorHandoffWidgetCollapsed === false;
        saveExtensionSettings();
        renderNarratorHandoffWidget();
    });

    button?.addEventListener('pointercancel', cancelButtonDrag);
    button?.addEventListener('lostpointercapture', cancelButtonDrag);

    title?.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target?.closest?.('button')) return;
        const panel = widget.querySelector('#' + NARRATOR_HANDOFF_WIDGET_PANEL_ID);
        if (!panel || panel.hidden) return;
        const rect = panel.getBoundingClientRect();
        const widgetRect = widget.getBoundingClientRect();
        widget._speNarratorHandoffPanelDrag = {
            startX: event.clientX,
            startY: event.clientY,
            startLeft: widgetRect.left,
            startTop: widgetRect.top,
            panelLeft: rect.left - widgetRect.left,
            panelTop: rect.top - widgetRect.top,
            width: rect.width,
            height: rect.height,
        };
        widget.classList.add('spe-narrator-handoff-panel-dragging');
        title.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    });

    title?.addEventListener('pointermove', event => {
        const panelDrag = widget._speNarratorHandoffPanelDrag;
        if (!panelDrag) return;
        const pos = clampTrackerWidgetAnchorPosition(
            panelDrag.startLeft + event.clientX - panelDrag.startX,
            panelDrag.startTop + event.clientY - panelDrag.startY,
            TRACKER_WIDGET_PANEL_PREFERRED_SIDES.NARRATOR_HANDOFF,
        );
        applyNarratorHandoffWidgetLayout(widget, {
            ...getSettings(),
            narratorHandoffWidgetCollapsed: false,
            narratorHandoffWidgetX: pos.x,
            narratorHandoffWidgetY: pos.y,
            narratorHandoffWidgetWidth: panelDrag.width,
            narratorHandoffWidgetHeight: panelDrag.height,
        });
    });

    const finishPanelDrag = (event, canceled = false) => {
        const panelDrag = widget._speNarratorHandoffPanelDrag;
        if (!panelDrag) return;
        widget._speNarratorHandoffPanelDrag = null;
        widget.classList.remove('spe-narrator-handoff-panel-dragging');
        if (title?.hasPointerCapture?.(event?.pointerId)) title.releasePointerCapture(event.pointerId);
        if (canceled) {
            syncNarratorHandoffWidgetViewport();
            return;
        }
        const settings = getSettings();
        const rect = widget.getBoundingClientRect();
        const anchor = clampTrackerWidgetAnchorPosition(
            rect.left,
            rect.top,
            TRACKER_WIDGET_PANEL_PREFERRED_SIDES.NARRATOR_HANDOFF,
        );
        settings.narratorHandoffWidgetX = anchor.x;
        settings.narratorHandoffWidgetY = anchor.y;
        saveExtensionSettings();
        syncNarratorHandoffWidgetViewport();
    };

    title?.addEventListener('pointerup', finishPanelDrag);
    title?.addEventListener('pointercancel', event => finishPanelDrag(event, true));
    title?.addEventListener('lostpointercapture', event => finishPanelDrag(event, true));

    attachTrackerWidgetCornerResizeHandlers(widget, {
        panelSelector: '#' + NARRATOR_HANDOFF_WIDGET_PANEL_ID,
        handleSelector: '[data-spe-narrator-handoff-resize-handle]',
        resizingClass: 'spe-narrator-handoff-resizing',
        settingsKeys: {
            x: 'narratorHandoffWidgetX',
            y: 'narratorHandoffWidgetY',
            width: 'narratorHandoffWidgetWidth',
            height: 'narratorHandoffWidgetHeight',
        },
        preferredSide: TRACKER_WIDGET_PANEL_PREFERRED_SIDES.NARRATOR_HANDOFF,
        syncViewport: syncNarratorHandoffWidgetViewport,
    });
}

function renderNarratorHandoffWidget(context = getContext()) {
    if (typeof document === 'undefined') return;
    ensureTrackerDisplayStyles();
    const settings = getSettings();
    const latest = getLatestNarratorHandoffEntry(context);
    const visible = isStoryEngineEnabled()
        && settings.narratorHandoffEnabled === true
        && normalizeNarratorHandoffDisplayMode(settings.narratorHandoffDisplayMode) === NARRATOR_HANDOFF_DISPLAY_MODES.SIDE_PANEL
        && Boolean(latest?.handoff?.text);
    if (!visible) {
        clearNarratorHandoffWidgetViewportHandler();
        document.getElementById(NARRATOR_HANDOFF_WIDGET_ID)?.remove();
        return;
    }
    let widget = document.getElementById(NARRATOR_HANDOFF_WIDGET_ID);
    if (!widget) {
        widget = document.createElement('div');
        widget.id = NARRATOR_HANDOFF_WIDGET_ID;
        widget.innerHTML = [
            '<button id="', NARRATOR_HANDOFF_WIDGET_BUTTON_ID, '" type="button" title="Narration Handoff" aria-label="Narration Handoff">',
            '<i class="fa-solid fa-scroll" aria-hidden="true"></i>',
            '</button>',
            '<div id="', NARRATOR_HANDOFF_WIDGET_PANEL_ID, '" hidden>',
            '<div class="structured-preflight-tracker-widget-title">',
            '<span class="structured-preflight-tracker-widget-name"><span>Narration Handoff</span></span>',
            '</div>',
            '<div class="structured-preflight-narrator-handoff-widget-body" data-spe-narrator-handoff-body></div>',
            '<div class="structured-preflight-tracker-resize-handle" data-spe-narrator-handoff-resize-handle data-spe-resize-corner="top-left" title="Resize narration handoff from top left" aria-label="Resize narration handoff from top left"><span class="structured-preflight-tracker-resize-grip" aria-hidden="true"></span></div>',
            '<div class="structured-preflight-tracker-resize-handle" data-spe-narrator-handoff-resize-handle data-spe-resize-corner="top-right" title="Resize narration handoff from top right" aria-label="Resize narration handoff from top right"><span class="structured-preflight-tracker-resize-grip" aria-hidden="true"></span></div>',
            '<div class="structured-preflight-tracker-resize-handle" data-spe-narrator-handoff-resize-handle data-spe-resize-corner="bottom-left" title="Resize narration handoff from bottom left" aria-label="Resize narration handoff from bottom left"><span class="structured-preflight-tracker-resize-grip" aria-hidden="true"></span></div>',
            '<div class="structured-preflight-tracker-resize-handle" data-spe-narrator-handoff-resize-handle data-spe-resize-corner="bottom-right" title="Resize narration handoff from bottom right" aria-label="Resize narration handoff from bottom right"><span class="structured-preflight-tracker-resize-grip" aria-hidden="true"></span></div>',
            '</div>',
        ].join('');
        document.body.append(widget);
        attachNarratorHandoffWidgetHandlers(widget);
    }
    ensureNarratorHandoffWidgetViewportHandler();
    syncNarratorHandoffWidgetViewport();
    const body = widget.querySelector('[data-spe-narrator-handoff-body]');
    if (!body) return;
    body.innerHTML = [
        '<div class="structured-preflight-narrator-handoff-widget-content">',
        '<div class="structured-preflight-narrator-handoff-widget-meta">Latest completed handoff</div>',
        '<pre>', escapeHtml(latest.handoff.text), '</pre>',
        '</div>',
    ].join('');
    syncStoryEngineWidgetScreenLayer();
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

        boundCompanion: normalizeBoundCompanionState(root.boundCompanion || {}),
        pendingBoundary: normalizePendingBoundaryState(root.pendingBoundary || {}),

        npcs: normalizeDisplayTrackerNpcs(root.npcs || {}),

    };

}



function renderTrackerWidget(context = getContext()) {
    if (typeof document === 'undefined') return;
    ensureTrackerDisplayStyles();

    const settings = getSettings();
    if (!isStoryEngineEnabled() || settings.postNarrationTrackerEnabled === false) {
        clearTrackerWidgetViewportHandler();
        document.getElementById(TRACKER_WIDGET_ID)?.remove();
        return;
    }
    let widget = document.getElementById(TRACKER_WIDGET_ID);
    if (!widget) {

        widget = document.createElement('div');

        widget.id = TRACKER_WIDGET_ID;

        widget.innerHTML = `

            <button id="${TRACKER_WIDGET_BUTTON_ID}" type="button" title="Tracker" aria-label="Tracker">
                <i class="fa-solid fa-book-open" aria-hidden="true"></i>

            </button>

            <div id="${TRACKER_WIDGET_PANEL_ID}" hidden>
                <div class="structured-preflight-tracker-widget-title">
                    <span class="structured-preflight-tracker-widget-name"><span>Tracker</span></span>
                </div>
                <div data-structured-preflight-tracker-widget-body></div>
                <div class="structured-preflight-prose-guard-strip" data-spe-prose-guard-strip hidden></div>
                <div class="structured-preflight-tracker-resize-handle" data-spe-tracker-resize-handle data-spe-resize-corner="top-left" title="Resize tracker from top left" aria-label="Resize tracker from top left"><span class="structured-preflight-tracker-resize-grip" aria-hidden="true"></span></div>
                <div class="structured-preflight-tracker-resize-handle" data-spe-tracker-resize-handle data-spe-resize-corner="top-right" title="Resize tracker from top right" aria-label="Resize tracker from top right"><span class="structured-preflight-tracker-resize-grip" aria-hidden="true"></span></div>
                <div class="structured-preflight-tracker-resize-handle" data-spe-tracker-resize-handle data-spe-resize-corner="bottom-left" title="Resize tracker from bottom left" aria-label="Resize tracker from bottom left"><span class="structured-preflight-tracker-resize-grip" aria-hidden="true"></span></div>
                <div class="structured-preflight-tracker-resize-handle" data-spe-tracker-resize-handle data-spe-resize-corner="bottom-right" title="Resize tracker from bottom right" aria-label="Resize tracker from bottom right"><span class="structured-preflight-tracker-resize-grip" aria-hidden="true"></span></div>
            </div>`;
        document.body.append(widget);

        attachTrackerWidgetHandlers(widget);

    }

    ensureTrackerWidgetViewportHandler();
    syncTrackerWidgetViewport();



    const body = widget.querySelector('[data-structured-preflight-tracker-widget-body]');

    if (!body) return;

    const snapshot = buildCurrentTrackerWidgetSnapshot(context);

    body.innerHTML = snapshot?.npcs

        ? buildTrackerDisplayHtml(snapshot)

        : '<div class="structured-preflight-tracker-empty">No tracker data yet.</div>';
    attachTrackerWidgetEditorHandlers(body, context);
    renderProseGuardWidget(widget, context);
    syncStoryEngineWidgetScreenLayer();

}

function isAssistantNarrationMessage(message) {
    if (!message || message.is_user || message.is_system) return false;
    const role = String(message.role || '').trim().toLocaleLowerCase();
    return !['user', 'system', 'tool', 'function'].includes(role);
}

function getLatestAssistantMessageEntry(context = getContext()) {
    if (!Array.isArray(context?.chat)) return null;
    for (let messageId = context.chat.length - 1; messageId >= 0; messageId -= 1) {
        const message = context.chat[messageId];
        if (isAssistantNarrationMessage(message)) return { messageId, message };
    }
    return null;
}

function getProseGuardMessageText(message) {
    if (!isAssistantNarrationMessage(message)) return '';
    return typeof message.mes === 'string'
        ? message.mes
        : String(message.extra?.display_text ?? '');
}

function getPendingProseGuardFindings(proseGuardState) {
    return (proseGuardState?.findings || [])
        .filter(finding => ['pending', 'restored', 'retry_failed'].includes(String(finding.status || 'pending')));
}

function buildReviewProseGuardRows(proseGuardState, messageId) {
    const findings = (proseGuardState?.findings || [])
        .filter(finding => ['pending', 'fixed', 'deleted', 'restored', 'retry_failed'].includes(String(finding.status || 'pending')));
    if (!findings.length) {
        return '<div class="structured-preflight-prose-guard-empty">No unresolved violations in the latest response.</div>';
    }
    return findings.map(finding => {
        const matched = uniqueStrings((finding.matches || [])
            .map(match => match.matchedPhrase || match.phrase)
            .filter(Boolean));
        const rules = uniqueStrings(finding.ruleNames || []);
        const meta = [matched.length ? matched.join(', ') : 'Configured violation', rules.length ? rules.join(', ') : ''].filter(Boolean).join(' | ');
        const attemptedReplacement = String(finding.attemptedReplacement || '');
        const attemptedOperation = String(finding.attemptedOperation || '');
        const failureReason = String(finding.failureReason || '');
        if (['fixed', 'deleted', 'restored', 'retry_failed'].includes(String(finding.status || ''))) {
            const change = (proseGuardState.changes || []).find(item => item.findingId === finding.id);
            return buildProseGuardChangeRow(change, proseGuardState, messageId);
        }
        const failedRepairHtml = proseGuardState?.automaticRepairFailed
            ? `
                ${attemptedReplacement
                    ? `<span class="structured-preflight-prose-guard-label">Attempted replacement</span>
                       <p class="structured-preflight-prose-guard-sentence">${escapeHtml(attemptedReplacement)}</p>`
                    : ''}
                ${attemptedOperation === 'delete'
                    ? '<span class="structured-preflight-prose-guard-label">Attempted operation</span><p class="structured-preflight-prose-guard-sentence">Sentence deletion</p>'
                    : ''}
                <div class="structured-preflight-prose-guard-meta">${escapeHtml(failureReason || 'No validated replacement was returned.')}</div>`
            : '';
        return `
            <div class="structured-preflight-prose-guard-finding" data-spe-prose-guard-finding="${escapeHtml(finding.id)}">
                <div class="structured-preflight-prose-guard-meta">${escapeHtml(meta)}</div>
                <p class="structured-preflight-prose-guard-sentence">${escapeHtml(finding.sentence)}</p>
                ${failedRepairHtml}
                <div class="structured-preflight-prose-guard-actions">
                    <button class="menu_button" type="button" data-spe-prose-guard-review-action="fix" data-spe-prose-guard-message-id="${messageId}" data-spe-prose-guard-finding-id="${escapeHtml(finding.id)}"><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Fix</button>
                    <button class="menu_button" type="button" data-spe-prose-guard-review-action="dismiss" data-spe-prose-guard-message-id="${messageId}" data-spe-prose-guard-finding-id="${escapeHtml(finding.id)}"><i class="fa-solid fa-check" aria-hidden="true"></i> Dismiss</button>
                     <button class="menu_button" type="button" data-spe-prose-guard-review-action="delete" data-spe-prose-guard-message-id="${messageId}" data-spe-prose-guard-finding-id="${escapeHtml(finding.id)}"><i class="fa-solid fa-trash" aria-hidden="true"></i> Delete</button>
                </div>
            </div>`;
    }).join('');
}

function buildProseGuardChangeRow(change, proseGuardState, messageId) {
    if (!change) return '<div class="structured-preflight-prose-guard-empty">Repair history is unavailable.</div>';
    const deleted = change.operation === 'delete';
    const retryFailed = change.status === 'retry_failed';
    const restored = ['restored', 'retry_failed'].includes(change.status);
    return `
        <div class="structured-preflight-prose-guard-finding">
            <div class="structured-preflight-prose-guard-meta">${retryFailed ? 'Retry failed; original restored' : restored ? 'Restored' : 'Repaired'}</div>
            <span class="structured-preflight-prose-guard-label">Original</span>
            <p class="structured-preflight-prose-guard-sentence">${escapeHtml(change.originalText)}</p>
            <span class="structured-preflight-prose-guard-label">${deleted ? 'Result' : 'Replacement'}</span>
            <p class="structured-preflight-prose-guard-sentence">${deleted ? 'Sentence deleted.' : escapeHtml(change.replacementText)}</p>
            <div class="structured-preflight-prose-guard-actions">
                ${restored
                    ? `<span class="structured-preflight-prose-guard-empty">${retryFailed ? escapeHtml(change.failureReason || 'The original sentence was restored after the retry failed.') : 'Original sentence restored.'}</span>
                       <button class="menu_button" type="button" data-spe-prose-guard-retry data-spe-prose-guard-message-id="${messageId}" data-spe-prose-guard-change-index="${proseGuardState.changes.indexOf(change)}"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> Retry</button>`
                    : `<button class="menu_button" type="button" data-spe-prose-guard-restore data-spe-prose-guard-message-id="${messageId}" data-spe-prose-guard-change-index="${proseGuardState.changes.indexOf(change)}"><i class="fa-solid fa-rotate-left" aria-hidden="true"></i> Restore</button>
                       <button class="menu_button" type="button" data-spe-prose-guard-retry data-spe-prose-guard-message-id="${messageId}" data-spe-prose-guard-change-index="${proseGuardState.changes.indexOf(change)}"><i class="fa-solid fa-arrows-rotate" aria-hidden="true"></i> Retry</button>`}
            </div>
        </div>`;
}

function buildAutomaticProseGuardRows(proseGuardState, messageId) {
    const changes = proseGuardState?.changes || [];
    if (!changes.length) {
        return '<div class="structured-preflight-prose-guard-empty">No automatic repairs in the latest response.</div>';
    }
    return changes.map(change => buildProseGuardChangeRow(change, proseGuardState, messageId)).join('');
}

function buildProseGuardManualRepairHtml(hasAssistantMessage) {
    return `
        <div class="structured-preflight-prose-guard-manual">
            <label>
                Offending phrase
                <input class="text_pole" type="text" data-spe-prose-guard-manual-phrase autocomplete="off" spellcheck="false" ${hasAssistantMessage ? '' : 'disabled'}>
            </label>
            <label>
                Rule category
                <select class="text_pole" data-spe-prose-guard-manual-category ${hasAssistantMessage ? '' : 'disabled'}>
                    <option value="strictBehaviorism">strictBehaviorism</option>
                    <option value="embodiedPerception">embodiedPerception</option>
                    <option value="denotativePhysicality">denotativePhysicality</option>
                    <option value="antiStockPhrasing">antiStockPhrasing</option>
                    <option value="userPhraseBans">User List</option>
                </select>
            </label>
            <div class="structured-preflight-prose-guard-actions">
                <button class="menu_button" type="button" data-spe-prose-guard-manual-fix ${hasAssistantMessage ? '' : 'disabled'}><i class="fa-solid fa-wand-magic-sparkles" aria-hidden="true"></i> Fix</button>
            </div>
        </div>`;
}

function renderProseGuardWidget(widget, context = getContext()) {
    const strip = widget?.querySelector?.('[data-spe-prose-guard-strip]');
    if (!strip) return;
    const mode = getProseGuardMode();
    if (!isStoryEngineEnabled() || mode === PROSE_GUARD_MODES.OFF) {
        strip.hidden = true;
        strip.innerHTML = '';
        return;
    }

    const latest = getLatestAssistantMessageEntry(context);
    const proseGuardState = latest ? getMessageProseGuardState(latest.message) : null;
    const reportMode = proseGuardState?.mode || mode;
    const pendingCount = getPendingProseGuardFindings(proseGuardState).length;
    const automaticCount = reportMode === PROSE_GUARD_MODES.AUTOMATIC
        ? (proseGuardState?.changes?.length || 0)
        : 0;
    const count = reportMode === PROSE_GUARD_MODES.AUTOMATIC ? automaticCount : pendingCount;
    const reportRows = reportMode === PROSE_GUARD_MODES.AUTOMATIC
        ? buildAutomaticProseGuardRows(proseGuardState, latest?.messageId ?? -1)
        : buildReviewProseGuardRows(proseGuardState, latest?.messageId ?? -1);
    const failureNotice = proseGuardState?.automaticRepairFailed
        ? `<div class="structured-preflight-prose-guard-failure"><strong>Automatic repair failed.</strong> ${escapeHtml(proseGuardState.error || 'No validated replacement was returned.')} Review, dismiss, or delete each reported violation below.</div>`
        : '';

    strip.hidden = false;
    strip.innerHTML = `
        <button class="structured-preflight-prose-guard-header" type="button" data-spe-prose-guard-toggle aria-expanded="false">
            <span class="structured-preflight-prose-guard-heading"><i class="fa-solid fa-shield-halved" aria-hidden="true"></i><span>Prose Guard</span></span>
            <span class="structured-preflight-prose-guard-count" aria-label="${count} violations">${count}</span>
        </button>
        <div class="structured-preflight-prose-guard-details" data-spe-prose-guard-details hidden>
            ${failureNotice}
            ${reportRows}
            ${buildProseGuardManualRepairHtml(Boolean(latest))}
        </div>`;
    attachProseGuardWidgetHandlers(strip, context);
}

function resolveStoredProseGuardFinding(text, finding) {
    const source = String(text || '');
    const sentence = String(finding?.sentence || '');
    if (!sentence) return null;
    const storedStart = normalizeProseGuardSpanOffset(finding?.start);
    const storedEnd = normalizeProseGuardSpanOffset(finding?.end);
    if (storedStart != null
        && storedEnd === storedStart + sentence.length
        && source.slice(storedStart, storedEnd) === sentence) {
        return { ...finding, start: storedStart, end: storedEnd };
    }
    const matches = [];
    let cursor = 0;
    while (cursor <= source.length) {
        const start = source.indexOf(sentence, cursor);
        if (start < 0) break;
        matches.push({ start, end: start + sentence.length });
        cursor = start + Math.max(1, sentence.length);
    }
    if (matches.length !== 1) return null;
    const [match] = matches;
    return {
        ...finding,
        start: match.start,
        end: match.end,
    };
}

function resolveStoredProseGuardChange(text, change) {
    const source = String(text || '');
    const operation = String(change?.operation || (change?.replacementText ? 'replace' : 'delete'));
    const targetText = change?.status === 'applied' && operation === 'replace'
        ? String(change?.replacementText || '')
        : String(change?.originalText || '');
    const storedStart = normalizeProseGuardSpanOffset(change?.start);
    const storedEnd = normalizeProseGuardSpanOffset(change?.end);
    if (operation === 'delete' && change?.status === 'applied') {
        if (storedStart != null && storedEnd === storedStart && storedStart <= source.length) {
            return { ...change, start: storedStart, end: storedEnd };
        }
        return null;
    }
    if (storedStart != null
        && storedEnd === storedStart + targetText.length
        && source.slice(storedStart, storedEnd) === targetText) {
        return { ...change, start: storedStart, end: storedEnd };
    }
    if (!targetText) return null;
    const matches = [];
    let cursor = 0;
    while (cursor <= source.length) {
        const start = source.indexOf(targetText, cursor);
        if (start < 0) break;
        matches.push({ start, end: start + targetText.length });
        cursor = start + Math.max(1, targetText.length);
    }
    if (matches.length !== 1) return null;
    const [match] = matches;
    return { ...change, start: match.start, end: match.end };
}

function rebaseProseGuardSpan(item, sourceText, nextText, targetText, editSpan = null) {
    const target = String(targetText || '');
    if (!target) return { ...item, start: null, end: null };
    let preferredStart = normalizeProseGuardSpanOffset(item?.start);
    if (preferredStart != null && nextText.slice(preferredStart, preferredStart + target.length) === target) {
        return { ...item, start: preferredStart, end: preferredStart + target.length };
    }
    if (preferredStart != null && editSpan) {
        const editStart = normalizeProseGuardSpanOffset(editSpan.start);
        const editEnd = normalizeProseGuardSpanOffset(editSpan.end);
        const replacementLength = Math.max(0, Number(editSpan.replacementLength) || 0);
        if (editStart != null && editEnd != null) {
            if (preferredStart >= editEnd) {
                preferredStart += replacementLength - (editEnd - editStart);
            } else if (preferredStart > editStart) {
                preferredStart = null;
            }
        }
    }
    if (preferredStart != null && nextText.slice(preferredStart, preferredStart + target.length) === target) {
        return { ...item, start: preferredStart, end: preferredStart + target.length };
    }
    const matches = [];
    let cursor = 0;
    while (cursor <= nextText.length) {
        const start = nextText.indexOf(target, cursor);
        if (start < 0) break;
        matches.push({ start, end: start + target.length });
        cursor = start + Math.max(1, target.length);
    }
    if (matches.length === 1) {
        return { ...item, start: matches[0].start, end: matches[0].end };
    }
    return { ...item, start: null, end: null };
}

function rebaseProseGuardInsertion(item, nextText, editSpan = null) {
    let position = normalizeProseGuardSpanOffset(item?.start);
    if (position == null) return { ...item, start: null, end: null };
    const anchorBefore = String(item?.anchorBefore || '');
    const anchorAfter = String(item?.anchorAfter || '');
    const matchesPosition = candidate => (
        candidate >= 0
        && candidate <= nextText.length
        && (!anchorBefore || nextText.slice(Math.max(0, candidate - anchorBefore.length), candidate) === anchorBefore)
        && (!anchorAfter || nextText.slice(candidate, candidate + anchorAfter.length) === anchorAfter)
    );
    if (matchesPosition(position)) return { ...item, start: position, end: position };
    if (editSpan) {
        const editStart = normalizeProseGuardSpanOffset(editSpan.start);
        const editEnd = normalizeProseGuardSpanOffset(editSpan.end);
        const replacementLength = Math.max(0, Number(editSpan.replacementLength) || 0);
        if (editStart != null && editEnd != null) {
            if (position >= editEnd) position += replacementLength - (editEnd - editStart);
            else if (position >= editStart) position = editStart + replacementLength;
        }
    }
    if (matchesPosition(position)) return { ...item, start: position, end: position };
    const candidates = [];
    if (anchorAfter) {
        let cursor = 0;
        while (cursor <= nextText.length) {
            const found = nextText.indexOf(anchorAfter, cursor);
            if (found < 0) break;
            candidates.push(found);
            cursor = found + Math.max(1, anchorAfter.length);
        }
    } else if (anchorBefore) {
        let cursor = 0;
        while (cursor <= nextText.length) {
            const found = nextText.indexOf(anchorBefore, cursor);
            if (found < 0) break;
            candidates.push(found + anchorBefore.length);
            cursor = found + Math.max(1, anchorBefore.length);
        }
    }
    const matches = uniqueStrings(candidates).map(Number).filter(matchesPosition);
    return matches.length === 1
        ? { ...item, start: matches[0], end: matches[0] }
        : { ...item, start: null, end: null };
}

function formatProseGuardStateForMessage(value, previousText, nextText, options = {}, editSpan = null) {
    const source = String(previousText || '');
    const formattedText = applyDeterministicNarrationFormatting(String(nextText || ''), options);
    if (!value) return { text: formattedText, state: null };
    const formatted = clone(value);
    formatted.findings = Array.isArray(formatted.findings)
        ? formatted.findings.map(finding => ({
            ...finding,
            sentence: applyDeterministicNarrationFormatting(finding.sentence, options),
            replacementText: finding.replacementText
                ? applyDeterministicNarrationFormatting(finding.replacementText, options)
                : '',
        }))
        : [];
    formatted.changes = Array.isArray(formatted.changes)
        ? formatted.changes.map(change => ({
            ...change,
            originalText: applyDeterministicNarrationFormatting(change.originalText, options),
            replacementText: applyDeterministicNarrationFormatting(change.replacementText, options),
            removedText: applyDeterministicNarrationFormatting(change.removedText, options),
            anchorBefore: applyDeterministicNarrationFormatting(change.anchorBefore, options),
            anchorAfter: applyDeterministicNarrationFormatting(change.anchorAfter, options),
        }))
        : [];

    formatted.findings = formatted.findings.map(finding => {
        if (['fixed', 'deleted'].includes(String(finding.status || ''))) {
            return { ...finding, start: null, end: null };
        }
        return rebaseProseGuardSpan(finding, source, formattedText, finding.sentence, editSpan);
    });
    formatted.changes = formatted.changes.map(change => {
        if (['restored', 'retry_failed'].includes(String(change.status || ''))) {
            return rebaseProseGuardSpan(change, source, formattedText, change.originalText, editSpan);
        }
        if (String(change.status || '') !== 'applied') {
            return { ...change, start: null, end: null };
        }
        if (String(change.operation || '') === 'delete') {
            return rebaseProseGuardInsertion(change, formattedText, editSpan);
        }
        return rebaseProseGuardSpan(change, source, formattedText, change.replacementText, editSpan);
    });
    return { text: formattedText, state: sanitizeProseGuardStateForStorage(formatted) };
}

function addProseGuardPhraseToCategory(phrase, category) {
    const normalizedPhrase = String(phrase || '').trim();
    const normalizedCategory = String(category || '').trim();
    if (!normalizedPhrase || !normalizedCategory) return false;
    const field = PROSE_GUARD_TARGETED_BAN_FIELDS.find(item => (
        item.ruleName === normalizedCategory
        || (normalizedCategory === 'User List' && item.ruleName === 'userPhraseBans')
    ));
    if (!field) throw new Error('Select a valid Prose Guard rule category.');
    const settings = getSettings();
    const existing = parseProseGuardBannedPhraseList(settings[field.key]);
    if (existing.some(value => value.toLocaleLowerCase() === normalizedPhrase.toLocaleLowerCase())) return false;
    settings[field.key] = [...existing, normalizedPhrase].join('\n');
    saveExtensionSettings();
    refreshSettingsControls();
    return true;
}

function restoreTrackerBeforeProseGuardEdit(context, messageId, messageKey) {
    const root = getTrackerRoot(context);
    const snapshot = root?.snapshots?.[messageKey];
    if (!root || !snapshot?.before || !Object.hasOwn(snapshot, 'beforeRapportClock')) {
        throw new Error('This response no longer has a safe tracker snapshot for Prose Guard reconciliation.');
    }
    const progression = getProgressionRoot(context);
    const hasSpentProgression = progression?.accomplishments?.some(record => (
        record?.messageKey === messageKey && progressionRecordXpSpent(record) > 0
    ));
    if (hasSpentProgression) {
        throw new Error('This response has already spent progression XP and cannot be reconciled safely.');
    }

    root.npcs = normalizeDisplayTrackerNpcs(snapshot.before);
    root.user = normalizeTrackerUserState(snapshot.beforeUser || root.user || {});
    root.health = normalizeHiddenHealth(snapshot.beforeHealth || root.health, { user: root.user, npcs: root.npcs });
    root.powerActors = clone(snapshot.beforePowerActors || {});
    root.latentGrievances = resolveStoredLatentGrievances(root, snapshot.beforeLatentGrievanceIds);
    root.latentFavors = resolveStoredLatentFavors(root, snapshot.beforeLatentFavorIds);
    root.userKnowledge = mergeUserKnowledgeLedger(snapshot.beforeUserKnowledge || {}, {});
    root.userReputation = mergeUserReputationLedger(snapshot.beforeUserReputation || {}, {});
    root.worldState = normalizeWorldState(snapshot.beforeWorldState || root.worldState || {});
    root.sceneItems = normalizeSceneItemState(snapshot.beforeSceneItems || {}, root.worldState);
    root.economy = normalizeEconomyState(snapshot.beforeEconomy || root.economy || {});
    root.boundCompanion = normalizeBoundCompanionState(snapshot.beforeBoundCompanion || root.boundCompanion || {});
    root.pendingBoundary = normalizePendingBoundaryState(snapshot.beforePendingBoundary || root.pendingBoundary || {});
    root.spellCasting = normalizeSpellCastingState(snapshot.beforeSpellCasting || root.spellCasting || {});
    root.rapportClock = normalizeRapportClockState(snapshot.beforeRapportClock);
    rebuildWorldMemoryFromSelectedSwipes(context, { beforeMessageId: messageId });
    removeProgressionRecordsAtOrAfterMessageId(getChatId(context), messageId, context);
}

function resolveProseGuardCommittedRun(context, messageId, messageKey) {
    const inMemory = state.proseGuardCommittedRun;
    if (inMemory
        && inMemory.messageId === messageId
        && inMemory.messageKey === messageKey
        && inMemory.pendingRun) {
        return inMemory;
    }

    const message = context?.chat?.[messageId];
    const persisted = getMessageProseGuardReconciliationSeed(message);
    if (!persisted || persisted.messageKey !== messageKey) return null;
    const currentChatId = String(getChatId(context) || '');
    const currentPersonaId = String(getActiveUserAvatar() || '');
    if (persisted.pendingRun.chatId && String(persisted.pendingRun.chatId) !== currentChatId) return null;
    if (persisted.pendingRun.personaId && String(persisted.pendingRun.personaId) !== currentPersonaId) return null;

    const committed = {
        messageId,
        messageKey,
        type: persisted.type,
        narratorHandoff: getMessageNarratorHandoff(message)?.text || '',
        pendingRun: persisted.pendingRun,
    };
    state.proseGuardCommittedRun = committed;
    return committed;
}

async function reconcileProseGuardEditedMessage(context, messageId, messageKey, proseGuardState) {
    const committed = resolveProseGuardCommittedRun(context, messageId, messageKey);
    if (!committed) {
        throw new Error('This response cannot be reconciled safely in the current session. Regenerate it before editing.');
    }

    const metadata = context?.chatMetadata || {};
    const previousTracker = Object.hasOwn(metadata, 'structuredPreflightTracker')
        ? clone(metadata.structuredPreflightTracker)
        : undefined;
    const previousProgression = Object.hasOwn(metadata, PROGRESSION_KEY)
        ? clone(metadata[PROGRESSION_KEY])
        : undefined;
    const previousPendingRun = state.pendingRun;
    const previousLastHandoff = state.lastNarratorHandoff;
    const previousLastHandoffKey = state.lastNarratorHandoffKey;
    const previousCommitted = state.proseGuardCommittedRun;

    try {
        restoreTrackerBeforeProseGuardEdit(context, messageId, messageKey);
        const pendingRun = clone(committed.pendingRun);
        pendingRun.runEpoch = state.runEpoch;
        pendingRun.chatId = String(getChatId(context) || '');
        pendingRun.personaId = String(getActiveUserAvatar() || '');
        state.pendingRun = pendingRun;
        const identity = createStoryEngineEpochIdentity(context);
        await finalizePostNarrationMessage(messageId, committed.type, messageKey, null, {
            ...identity,
            narratorHandoff: committed.narratorHandoff || '',
            pendingRun,
            proseGuardReconciliation: true,
            proseGuardState: clone(proseGuardState),
        });
        const reconciledRun = state.proseGuardCommittedRun;
        if (reconciledRun === previousCommitted
            || reconciledRun?.messageId !== messageId
            || reconciledRun?.messageKey !== messageKey
            || state.pendingRun === pendingRun) {
            throw new Error('Prose Guard reconciliation did not complete before the response changed.');
        }
        if (!isAssistantNarrationMessage(context?.chat?.[messageId])) {
            throw new Error('The edited response changed while Prose Guard was reconciling its state.');
        }
    } catch (error) {
        if (previousTracker === undefined) delete metadata.structuredPreflightTracker;
        else metadata.structuredPreflightTracker = previousTracker;
        if (previousProgression === undefined) delete metadata[PROGRESSION_KEY];
        else metadata[PROGRESSION_KEY] = previousProgression;
        state.pendingRun = previousPendingRun;
        state.lastNarratorHandoff = previousLastHandoff;
        state.lastNarratorHandoffKey = previousLastHandoffKey;
        state.proseGuardCommittedRun = previousCommitted;
        try {
            await persistMetadata(context);
        } catch (restoreError) {
            console.error(`[${EXTENSION_NAME}] failed to restore tracker state after Prose Guard reconciliation failure.`, restoreError);
        }
        throw error;
    }
}

async function persistProseGuardMessageEdit(context, messageId, nextText, nextState, options = {}) {
    const message = context?.chat?.[messageId];
    if (!isAssistantNarrationMessage(message)) throw new Error('The target response is no longer available.');
    const previousMessage = clone(message);
    const previousText = getProseGuardMessageText(message);
    const formatOptions = {
        trackerDisplaySnapshot: getMessageTrackerDisplaySnapshot(message),
        context,
    };
    const prepared = formatProseGuardStateForMessage(
        nextState,
        previousText,
        String(nextText || ''),
        formatOptions,
        options.editSpan || null,
    );
    const finalText = prepared.text;
    const finalState = prepared.state;
    const messageKey = getMessageKey(messageId, context);
    try {
        message.extra = message.extra || {};
        message.mes = finalText;
        message.extra.display_text = finalText;
        if (Array.isArray(message.swipes)) {
            message.swipes[getMessageSwipeId(message)] = finalText;
        }
        if (finalState) setMessageProseGuardState(message, finalState);
        else clearMessageProseGuardState(message);

        if (options.reconcile === true) {
            await reconcileProseGuardEditedMessage(context, messageId, messageKey, finalState);
        } else {
            if (typeof context.updateMessageBlock === 'function') {
                await context.updateMessageBlock(messageId, message);
            } else {
                const textElement = getMessageTextElement(messageId);
                if (textElement) textElement.textContent = finalText;
            }
            await saveChat(context, { fallbackToMetadata: true });
        }
        state.chatSignature = captureChatSignature(context);
        renderNarratorHandoffBlockForMessage(messageId, null, context);
        renderTrackerDisplayBlockForMessage(messageId, null, context);
        renderTrackerWidget(context);
    } catch (error) {
        for (const key of Object.keys(message)) delete message[key];
        Object.assign(message, previousMessage);
        try {
            await context.updateMessageBlock?.(messageId, message);
        } catch {
            const textElement = getMessageTextElement(messageId);
            if (textElement) textElement.textContent = getProseGuardMessageText(message);
        }
        if (options.reconcile === true) {
            try {
                await saveChat(context, { fallbackToMetadata: true });
            } catch (saveError) {
                console.error(`[${EXTENSION_NAME}] failed to persist the restored Prose Guard edit.`, saveError);
            }
        }
        renderTrackerWidget(context);
        throw error;
    }
}

function getCurrentProseGuardTarget(context, messageId) {
    const normalizedId = normalizeProseGuardMessageId(messageId);
    const latest = getLatestAssistantMessageEntry(context);
    if (normalizedId == null || !latest || latest.messageId !== normalizedId) {
        throw new Error('Prose Guard can edit only the latest assistant response.');
    }
    return latest;
}

async function requestAndApplyProseGuardRepairs(narrationText, findings, rules, requestOptions = {}) {
    const raw = await requestTargetedProseBanRepairWithTimeout(findings, rules, requestOptions);
    const payload = parseTargetedProseGuardResponse(raw);
    const repaired = applyProseGuardSentenceRepairs(narrationText, findings, payload, { rules });
    return { payload, repaired };
}

function recordProseGuardRepair(proseGuardState, finding, applied) {
    finding.status = applied.operation === 'delete' ? 'deleted' : 'fixed';
    finding.operation = applied.operation;
    finding.replacementText = applied.replacementText;
    proseGuardState.changes.push({ ...applied, status: 'applied' });
    clearProseGuardFailureIfResolved(proseGuardState);
}

function clearProseGuardFailureIfResolved(proseGuardState) {
    if (getPendingProseGuardFindings(proseGuardState).length) return;
    proseGuardState.automaticRepairFailed = false;
    proseGuardState.error = '';
}

function calculateProseGuardEditSpan(previousText, nextText) {
    const previous = String(previousText || '');
    const next = String(nextText || '');
    let start = 0;
    while (start < previous.length && start < next.length && previous[start] === next[start]) start += 1;
    let previousEnd = previous.length;
    let nextEnd = next.length;
    while (previousEnd > start && nextEnd > start && previous[previousEnd - 1] === next[nextEnd - 1]) {
        previousEnd -= 1;
        nextEnd -= 1;
    }
    return { start, end: previousEnd, replacementLength: nextEnd - start };
}

function requireAppliedProseGuardRepair(repaired, findingId) {
    const applied = repaired.appliedRepairs.find(item => item.findingId === findingId);
    if (!applied || repaired.rejectedRepairs.length) {
        throw new Error(repaired.rejectedRepairs[0]?.reason || 'Prose Guard did not return a valid sentence repair.');
    }
    return applied;
}

async function handleProseGuardReviewAction(context, messageId, findingId, action) {
    const latest = getCurrentProseGuardTarget(context, messageId);
    const proseGuardState = getMessageProseGuardState(latest.message);
    if (!proseGuardState || proseGuardState.mode !== PROSE_GUARD_MODES.REVIEW) {
        throw new Error('This response has no active Prose Guard review.');
    }
    const finding = proseGuardState.findings.find(item => item.id === findingId && item.status === 'pending');
    if (!finding) throw new Error('That violation is no longer pending.');

    const currentText = getProseGuardMessageText(latest.message);
    if (action === 'dismiss') {
        finding.status = 'dismissed';
        clearProseGuardFailureIfResolved(proseGuardState);
        await persistProseGuardMessageEdit(context, latest.messageId, currentText, proseGuardState);
        return;
    }
    if (!['fix', 'delete'].includes(action)) throw new Error('Unknown Prose Guard review action.');

    const currentFinding = resolveStoredProseGuardFinding(currentText, finding);
    if (!currentFinding) throw new Error('The detected sentence no longer matches the latest response.');
    const rules = getTargetedProseBanRules();
    let repaired;
    if (action === 'delete') {
        repaired = applyProseGuardSentenceRepairs(currentText, [currentFinding], {
            sentenceRepairs: [{ findingId: currentFinding.id, operation: 'delete', replacementSentence: '' }],
        }, { rules });
    } else {
        const operationIdentity = createStoryEngineEpochIdentity(context);
        ({ repaired } = await requestAndApplyProseGuardRepairs(currentText, [currentFinding], rules, {
            isCurrent: () => isCurrentStoryEngineEpoch(operationIdentity, context)
                && context.chat?.[latest.messageId] === latest.message
                && getLatestAssistantMessageEntry(context)?.messageId === latest.messageId,
            expiredMessage: 'Prose Guard review expired because the latest response changed.',
        }));
    }
    const applied = requireAppliedProseGuardRepair(repaired, currentFinding.id);
    recordProseGuardRepair(proseGuardState, finding, applied);
    await persistProseGuardMessageEdit(context, latest.messageId, repaired.narrationText, proseGuardState, {
        reconcile: true,
        editSpan: calculateProseGuardEditSpan(currentText, repaired.narrationText),
    });
}

async function handleProseGuardRestore(context, messageId, changeIndex) {
    const latest = getCurrentProseGuardTarget(context, messageId);
    const proseGuardState = getMessageProseGuardState(latest.message);
    const change = proseGuardState?.changes?.[Number(changeIndex)];
    if (!change || change.status !== 'applied') throw new Error('That repair is no longer active.');
    const currentText = getProseGuardMessageText(latest.message);
    const currentChange = resolveStoredProseGuardChange(currentText, change);
    if (!currentChange) throw new Error('The repaired sentence no longer matches the latest response.');
    const restoredText = change.operation === 'delete'
        ? String(change.removedText || change.originalText)
        : change.originalText;
    const nextText = currentText.slice(0, currentChange.start)
        + restoredText
        + currentText.slice(currentChange.end);
    change.status = 'restored';
    const storedFinding = proseGuardState.findings?.find(item => item.id === change.findingId);
    if (storedFinding) storedFinding.status = 'restored';
    await persistProseGuardMessageEdit(context, latest.messageId, nextText, proseGuardState, {
        reconcile: true,
        editSpan: calculateProseGuardEditSpan(currentText, nextText),
    });
}

async function handleProseGuardRetry(context, messageId, changeIndex) {
    const latest = getCurrentProseGuardTarget(context, messageId);
    const proseGuardState = getMessageProseGuardState(latest.message);
    const index = Number(changeIndex);
    const change = proseGuardState?.changes?.[index];
    if (!change) throw new Error('That repair history is no longer available.');
    const currentText = getProseGuardMessageText(latest.message);
    const currentChange = resolveStoredProseGuardChange(currentText, change);
    if (!currentChange) throw new Error('The current repair result no longer matches the latest response.');

    let originalText = currentText;
    let originalStart = currentChange.start;
    if (change.status === 'applied') {
        const restoredSegment = change.operation === 'delete'
            ? String(change.removedText || change.originalText)
            : change.originalText;
        originalText = currentText.slice(0, currentChange.start)
            + restoredSegment
            + currentText.slice(currentChange.end);
        originalStart = currentChange.start + Math.max(0, restoredSegment.indexOf(change.originalText));
    }

    const rules = getProseGuardRulesForStoredChange(change);
    const rescanned = collectProseGuardSentenceFindings(originalText, rules)
        .find(item => item.start === originalStart && item.sentence === change.originalText);
    const storedMatches = (change.matches || []).map(match => {
        const offsetStart = normalizeProseGuardSpanOffset(match.offsetStart);
        const offsetEnd = normalizeProseGuardSpanOffset(match.offsetEnd);
        if (offsetStart == null || offsetEnd == null || offsetEnd <= offsetStart) return null;
        return {
            ...match,
            start: originalStart + offsetStart,
            end: originalStart + offsetEnd,
        };
    }).filter(Boolean);
    const retryFinding = rescanned || (storedMatches.length ? {
        id: change.findingId,
        start: originalStart,
        end: originalStart + change.originalText.length,
        sentence: change.originalText,
        ruleNames: [...(change.ruleNames || [])],
        matches: storedMatches,
    } : null);
    if (!retryFinding) throw new Error('The original violation can no longer be validated for a safe retry.');
    retryFinding.id = change.findingId;

    const operationIdentity = createStoryEngineEpochIdentity(context);
    const isRetryTargetCurrent = () => isCurrentStoryEngineEpoch(operationIdentity, context)
        && context.chat?.[latest.messageId] === latest.message
        && getLatestAssistantMessageEntry(context)?.messageId === latest.messageId;
    let repaired;
    let applied;
    try {
        ({ repaired } = await requestAndApplyProseGuardRepairs(originalText, [retryFinding], rules, {
            isCurrent: isRetryTargetCurrent,
            expiredMessage: 'Prose Guard retry expired because the latest response changed.',
        }));
        applied = requireAppliedProseGuardRepair(repaired, retryFinding.id);
    } catch (error) {
        if (!isRetryTargetCurrent()) throw error;
        change.status = 'retry_failed';
        change.failureReason = error instanceof Error ? error.message : String(error);
        const storedFinding = proseGuardState.findings?.find(item => item.id === change.findingId);
        if (storedFinding) {
            storedFinding.status = 'retry_failed';
            storedFinding.failureReason = change.failureReason;
        }
        await persistProseGuardMessageEdit(context, latest.messageId, originalText, proseGuardState, {
            reconcile: true,
            editSpan: calculateProseGuardEditSpan(currentText, originalText),
        });
        throw error;
    }
    proseGuardState.changes[index] = { ...applied, status: 'applied' };
    const storedFinding = proseGuardState.findings?.find(item => item.id === change.findingId);
    if (storedFinding) {
        storedFinding.status = applied.operation === 'delete' ? 'deleted' : 'fixed';
        storedFinding.operation = applied.operation;
        storedFinding.replacementText = applied.replacementText;
    }
    clearProseGuardFailureIfResolved(proseGuardState);
    await persistProseGuardMessageEdit(context, latest.messageId, repaired.narrationText, proseGuardState, {
        reconcile: true,
        editSpan: calculateProseGuardEditSpan(currentText, repaired.narrationText),
    });
}

async function handleManualProseGuardFix(context, messageId, phrase, category) {
    const latest = getCurrentProseGuardTarget(context, messageId);
    const normalizedPhrase = String(phrase || '').trim();
    const normalizedCategory = String(category || '').trim();
    if (!normalizedPhrase) throw new Error('Enter the specific offending phrase.');
    if (!PROSE_GUARD_TARGETED_BAN_FIELDS.some(field => field.ruleName === normalizedCategory)) {
        throw new Error('Select a valid Prose Guard rule category.');
    }
    const currentText = getProseGuardMessageText(latest.message);
    const rules = getTargetedProseBanRules(getSettings(), [normalizedPhrase], normalizedCategory);
    const finding = collectProseGuardSentenceFindings(currentText, rules)
        .find(item => item.matches.some(match => (
            match.ruleName === normalizedCategory
            && String(match.phrase || '').toLocaleLowerCase() === normalizedPhrase.toLocaleLowerCase()
        )));
    if (!finding) throw new Error('That exact phrase was not found in the latest assistant response.');

    const proseGuardState = getMessageProseGuardState(latest.message) || {
        version: PROSE_GUARD_EXTRA_VERSION,
        mode: getProseGuardMode() === PROSE_GUARD_MODES.AUTOMATIC ? PROSE_GUARD_MODES.AUTOMATIC : PROSE_GUARD_MODES.REVIEW,
        savedAt: Date.now(),
        findings: [],
        changes: [],
    };
    const matchingStoredFinding = proseGuardState.findings
        .filter(item => ['pending', 'restored', 'retry_failed'].includes(String(item.status || 'pending')))
        .map(item => ({ stored: item, resolved: resolveStoredProseGuardFinding(currentText, item) }))
        .find(item => item.resolved?.start === finding.start && item.resolved?.end === finding.end)
        ?.stored || null;
    if (matchingStoredFinding) {
        finding.id = matchingStoredFinding.id;
    } else {
        const usedIds = new Set(proseGuardState.findings.map(item => item.id));
        let suffix = proseGuardState.findings.length + 1;
        while (usedIds.has(`PG_MANUAL_${suffix}`)) suffix += 1;
        finding.id = `PG_MANUAL_${suffix}`;
    }

    const operationIdentity = createStoryEngineEpochIdentity(context);
    const { repaired } = await requestAndApplyProseGuardRepairs(currentText, [finding], rules, {
        isCurrent: () => isCurrentStoryEngineEpoch(operationIdentity, context)
            && context.chat?.[latest.messageId] === latest.message
            && getLatestAssistantMessageEntry(context)?.messageId === latest.messageId,
        expiredMessage: 'Manual Prose Guard repair expired because the latest response changed.',
    });
    const applied = requireAppliedProseGuardRepair(repaired, finding.id);
    const storedFinding = matchingStoredFinding || { ...finding, status: 'pending' };
    if (matchingStoredFinding) {
        Object.assign(storedFinding, finding, { id: matchingStoredFinding.id, status: 'pending' });
        const existingChangeIndex = proseGuardState.changes.findIndex(item => item.findingId === storedFinding.id);
        if (existingChangeIndex >= 0) proseGuardState.changes.splice(existingChangeIndex, 1);
    } else {
        proseGuardState.findings.push(storedFinding);
    }
    recordProseGuardRepair(proseGuardState, storedFinding, applied);
    await persistProseGuardMessageEdit(context, latest.messageId, repaired.narrationText, proseGuardState, {
        reconcile: true,
        editSpan: calculateProseGuardEditSpan(currentText, repaired.narrationText),
    });
    addProseGuardPhraseToCategory(normalizedPhrase, normalizedCategory);
}

function attachProseGuardWidgetHandlers(strip, context = getContext()) {
    if (!strip) return;
    strip.onclick = event => {
        const target = event.target?.closest?.('button');
        if (!target) return;

        if (target.matches('[data-spe-prose-guard-toggle]')) {
            event.preventDefault();
            const details = strip.querySelector('[data-spe-prose-guard-details]');
            if (!details) return;
            details.hidden = !details.hidden;
            target.setAttribute('aria-expanded', String(!details.hidden));
            return;
        }

        const latest = getLatestAssistantMessageEntry(context);
        if (!latest) {
            notifyError('There is no assistant response to edit.', EXTENSION_NAME);
            return;
        }
        target.disabled = true;
        let operation = null;
        if (target.matches('[data-spe-prose-guard-review-action]')) {
            operation = handleProseGuardReviewAction(
                context,
                target.getAttribute('data-spe-prose-guard-message-id'),
                target.getAttribute('data-spe-prose-guard-finding-id'),
                target.getAttribute('data-spe-prose-guard-review-action'),
            );
        } else if (target.matches('[data-spe-prose-guard-restore]')) {
            operation = handleProseGuardRestore(
                context,
                target.getAttribute('data-spe-prose-guard-message-id'),
                target.getAttribute('data-spe-prose-guard-change-index'),
            );
        } else if (target.matches('[data-spe-prose-guard-retry]')) {
            operation = handleProseGuardRetry(
                context,
                target.getAttribute('data-spe-prose-guard-message-id'),
                target.getAttribute('data-spe-prose-guard-change-index'),
            );
        } else if (target.matches('[data-spe-prose-guard-manual-fix]')) {
            operation = handleManualProseGuardFix(
                context,
                latest.messageId,
                strip.querySelector('[data-spe-prose-guard-manual-phrase]')?.value,
                strip.querySelector('[data-spe-prose-guard-manual-category]')?.value,
            );
        }
        if (!operation) {
            target.disabled = false;
            return;
        }
        void operation
            .catch(error => {
                console.error(`[${EXTENSION_NAME}] Prose Guard action failed.`, error);
                notifyError(error instanceof Error ? error.message : String(error), EXTENSION_NAME);
            })
            .finally(() => {
                if (target.isConnected) target.disabled = false;
            });
    };
}

function trackerEditableItemRowHtml(field, value = '') {
    const label = field === 'gear' ? 'Gear' : 'Inventory';
    return `
        <div class="structured-preflight-tracker-edit-row">
            <input class="text_pole structured-preflight-tracker-edit-input" data-spe-tracker-user-field="${escapeHtml(field)}" value="${escapeHtml(value)}" spellcheck="false">
            <button class="menu_button structured-preflight-tracker-edit-remove" type="button" data-spe-tracker-remove-item title="Remove ${escapeHtml(label)} item" aria-label="Remove ${escapeHtml(label)} item">x</button>
        </div>`;
}

function addTrackerEditableItemRow(root, field, value = '') {
    const rows = root?.querySelector?.(`[data-spe-tracker-list-rows="${field}"]`);
    if (!rows) return false;
    rows.querySelector('[data-spe-tracker-empty-list]')?.remove();
    rows.insertAdjacentHTML('beforeend', trackerEditableItemRowHtml(field, value));
    return true;
}

function collectTrackerWidgetUserItems(root, field) {
    return normalizeManualUserItemList(Array.from(root?.querySelectorAll?.(`[data-spe-tracker-user-field="${field}"]`) || [])
        .map(input => input?.value ?? ''));
}

function restoreTrackerWidgetControlFocus(attribute, value) {
    const focusControl = () => {
        if (typeof document === 'undefined') return;
        const widget = document.getElementById(TRACKER_WIDGET_ID);
        const control = Array.from(widget?.querySelectorAll?.(`[${attribute}]`) || [])
            .find(candidate => candidate.getAttribute(attribute) === value);
        control?.focus?.();
    };
    if (typeof globalThis.requestAnimationFrame === 'function') {
        globalThis.requestAnimationFrame(focusControl);
        return;
    }
    globalThis.setTimeout?.(focusControl, 0);
}

function attachTrackerWidgetEditorHandlers(body, context = getContext()) {
    if (!body) return;
    body.onclick = event => {
        const target = event.target?.closest?.('button');
        if (!target) return;

        if (target.matches('[data-spe-tracker-tab]')) {
            event.preventDefault();
            const nextTab = normalizeTrackerWidgetTab(target.getAttribute('data-spe-tracker-tab'));
            state.trackerWidgetActiveTab = nextTab;
            if (nextTab !== 'inventory') state.trackerWidgetEditingUserItems = false;
            renderTrackerWidget(context);
            restoreTrackerWidgetControlFocus('data-spe-tracker-tab', nextTab);
            return;
        }

        if (target.matches('[data-spe-tracker-edit-user-items]')) {
            event.preventDefault();
            state.trackerWidgetActiveTab = 'inventory';
            state.trackerWidgetEditingUserItems = true;
            renderTrackerWidget(context);
            return;
        }

        if (target.matches('[data-spe-tracker-cancel-user-items]')) {
            event.preventDefault();
            state.trackerWidgetEditingUserItems = false;
            renderTrackerWidget(context);
            return;
        }

        if (target.matches('[data-spe-tracker-add-item]')) {
            event.preventDefault();
            const field = target.getAttribute('data-spe-tracker-add-item');
            if (!['gear', 'inventory'].includes(field)) return;
            const input = body.querySelector(`[data-spe-tracker-add-input="${field}"]`);
            const value = cleanTrackerDeltaText(input?.value);
            if (!value) return;
            if (addTrackerEditableItemRow(body, field, value) && input) {
                input.value = '';
                input.focus?.();
            }
            return;
        }

        if (target.matches('[data-spe-tracker-remove-item]')) {
            event.preventDefault();
            const list = target.closest('[data-spe-tracker-list]');
            const row = target.closest('.structured-preflight-tracker-edit-row');
            row?.remove();
            const rows = list?.querySelector('[data-spe-tracker-list-rows]');
            if (rows && !rows.querySelector('[data-spe-tracker-user-field]')) {
                rows.innerHTML = '<div class="structured-preflight-tracker-muted" data-spe-tracker-empty-list>No items</div>';
            }
            return;
        }

        if (target.matches('[data-spe-tracker-save-user-items]')) {
            event.preventDefault();
            target.disabled = true;
            target.textContent = 'Saving...';
            const operationIdentity = createStoryEngineEpochIdentity(context);
            saveManualUserTrackerItems({
                gear: collectTrackerWidgetUserItems(body, 'gear'),
                inventory: collectTrackerWidgetUserItems(body, 'inventory'),
            }, context, operationIdentity)
                .then(saved => {
                    if (!isCurrentStoryEngineEpoch(operationIdentity, context)) return;
                    if (!saved) throw new Error('Tracker metadata unavailable.');
                    state.trackerWidgetEditingUserItems = false;
                    renderAllTrackerDisplayBlocks(context);
                })
                .catch(error => {
                    if (!isCurrentStoryEngineEpoch(operationIdentity, context)) return;
                    console.error(`[${EXTENSION_NAME}] failed to save manual tracker edit.`, error);
                    target.disabled = false;
                    target.textContent = 'Save';
                    notifyError(error instanceof Error ? error.message : String(error), EXTENSION_NAME);
                });
        }
    };

    body.onchange = event => {
        const selector = event.target?.closest?.('[data-spe-tracker-select-npc]');
        if (!selector) return;
        state.trackerWidgetSelectedNpc = selector.value || '';
        state.trackerWidgetActiveTab = 'npcs';
        renderTrackerWidget(context);
        restoreTrackerWidgetControlFocus('data-spe-tracker-select-npc', '');
    };

    body.onkeydown = event => {
        const tab = event.target?.closest?.('[data-spe-tracker-tab]');
        if (tab && ['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) {
            event.preventDefault();
            const tabs = Array.from(body.querySelectorAll('[data-spe-tracker-tab]'));
            const currentIndex = tabs.indexOf(tab);
            let nextIndex = currentIndex;
            if (event.key === 'Home') nextIndex = 0;
            if (event.key === 'End') nextIndex = tabs.length - 1;
            if (event.key === 'ArrowUp') nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
            if (event.key === 'ArrowDown') nextIndex = (currentIndex + 1) % tabs.length;
            const nextTab = tabs[nextIndex];
            nextTab?.click?.();
            return;
        }
        const input = event.target?.closest?.('[data-spe-tracker-add-input]');
        if (!input || event.key !== 'Enter') return;
        event.preventDefault();
        const field = input.getAttribute('data-spe-tracker-add-input');
        body.querySelector(`[data-spe-tracker-add-item="${field}"]`)?.click?.();
    };
}



function clampTrackerWidgetHeight(value) {
    const viewportHeight = Math.max(1, Number(globalThis.innerHeight) || 800);
    const availableHeight = Math.max(1, viewportHeight - 16);
    const maximum = availableHeight;
    const minimum = Math.min(TRACKER_WIDGET_MIN_HEIGHT, maximum);
    const numeric = Number(value);
    const desired = Number.isFinite(numeric) ? numeric : TRACKER_WIDGET_DEFAULT_HEIGHT;
    return Math.round(Math.max(minimum, Math.min(desired, maximum)));
}

function clampTrackerWidgetWidth(value) {
    const viewportWidth = Math.max(1, Number(globalThis.innerWidth) || 1200);
    const availableWidth = Math.max(1, viewportWidth - 16);
    const maximum = availableWidth;
    const minimum = Math.min(TRACKER_WIDGET_MIN_WIDTH, maximum);
    const numeric = Number(value);
    const desired = Number.isFinite(numeric) ? numeric : TRACKER_WIDGET_DEFAULT_WIDTH;
    return Math.round(Math.max(minimum, Math.min(desired, maximum)));
}

function clampTrackerWidgetPosition(
    x,
    y,
    width = TRACKER_WIDGET_BUTTON_SIZE,
    height = TRACKER_WIDGET_BUTTON_SIZE,
    panelLeft = 0,
    panelTop = 0,
) {
    const viewportWidth = Math.max(1, Number(globalThis.innerWidth) || 1200);
    const viewportHeight = Math.max(1, Number(globalThis.innerHeight) || 800);
    const horizontalInset = Math.min(8, viewportWidth / 2);
    const verticalInset = Math.min(8, viewportHeight / 2);
    const maximumWidth = Math.max(1, viewportWidth - (horizontalInset * 2));
    const maximumHeight = Math.max(1, viewportHeight - (verticalInset * 2));
    const numericWidth = Number(width);
    const numericHeight = Number(height);
    const safeWidth = Math.min(Math.max(1, Number.isFinite(numericWidth) ? numericWidth : TRACKER_WIDGET_BUTTON_SIZE), maximumWidth);
    const safeHeight = Math.min(Math.max(1, Number.isFinite(numericHeight) ? numericHeight : TRACKER_WIDGET_BUTTON_SIZE), maximumHeight);
    const safePanelLeft = Number.isFinite(Number(panelLeft)) ? Number(panelLeft) : 0;
    const safePanelTop = Number.isFinite(Number(panelTop)) ? Number(panelTop) : 0;
    const minX = horizontalInset - safePanelLeft;
    const minY = verticalInset - safePanelTop;
    const maxX = Math.max(minX, viewportWidth - safeWidth - horizontalInset - safePanelLeft);
    const maxY = Math.max(minY, viewportHeight - safeHeight - verticalInset - safePanelTop);
    const rawX = Number(x);
    const rawY = Number(y);
    return {
        x: Math.round(Math.max(minX, Math.min(Number.isFinite(rawX) ? rawX : 24, maxX))),
        y: Math.round(Math.max(minY, Math.min(Number.isFinite(rawY) ? rawY : 120, maxY))),
    };
}

function getTrackerWidgetChatColumnBounds() {
    if (typeof document === 'undefined' || typeof document.querySelector !== 'function') return null;
    const shell = document.querySelector('#sheld');
    const rect = shell?.getBoundingClientRect?.();
    if (!rect || !Number.isFinite(Number(rect.left)) || !Number.isFinite(Number(rect.right)) || Number(rect.width) <= 0) return null;
    const viewportWidth = Math.max(1, Number(globalThis.innerWidth) || 1200);
    return {
        left: Math.max(0, Math.min(viewportWidth, Number(rect.left))),
        right: Math.max(0, Math.min(viewportWidth, Number(rect.right))),
    };
}

function getTrackerWidgetSideBounds(preferredSide = 'auto') {
    const viewportWidth = Math.max(1, Number(globalThis.innerWidth) || 1200);
    const horizontalInset = Math.min(8, viewportWidth / 2);
    const viewportLeft = horizontalInset;
    const viewportRight = Math.max(viewportLeft, viewportWidth - horizontalInset);
    const chatBounds = getTrackerWidgetChatColumnBounds();
    const hasPreferredSide = preferredSide === 'left' || preferredSide === 'right';
    if (!hasPreferredSide || !chatBounds || chatBounds.right <= chatBounds.left) {
        return { left: viewportLeft, right: viewportRight, constrainedByChat: false };
    }
    const sideBounds = preferredSide === 'left'
        ? { left: viewportLeft, right: Math.min(viewportRight, chatBounds.left - horizontalInset) }
        : { left: Math.max(viewportLeft, chatBounds.right + horizontalInset), right: viewportRight };
    if (sideBounds.right - sideBounds.left < TRACKER_WIDGET_BUTTON_SIZE) {
        return { left: viewportLeft, right: viewportRight, constrainedByChat: false };
    }
    return { ...sideBounds, constrainedByChat: true };
}

function clampTrackerWidgetAnchorPosition(x, y, preferredSide = 'auto') {
    const position = clampTrackerWidgetPosition(x, y);
    const sideBounds = getTrackerWidgetSideBounds(preferredSide);
    const maximumX = Math.max(sideBounds.left, sideBounds.right - TRACKER_WIDGET_BUTTON_SIZE);
    return {
        x: Math.round(Math.max(sideBounds.left, Math.min(position.x, maximumX))),
        y: position.y,
    };
}

function getTrackerWidgetPanelPlacement(anchorX, anchorY, width, height, preferredSide = 'auto') {
    const viewportWidth = Math.max(1, Number(globalThis.innerWidth) || 1200);
    const viewportHeight = Math.max(1, Number(globalThis.innerHeight) || 800);
    const horizontalInset = Math.min(8, viewportWidth / 2);
    const verticalInset = Math.min(8, viewportHeight / 2);
    const numericWidth = Number(width);
    const safeWidth = Math.min(
        Math.max(1, Number.isFinite(numericWidth) ? numericWidth : TRACKER_WIDGET_DEFAULT_WIDTH),
        Math.max(1, viewportWidth - (horizontalInset * 2)),
    );
    const numericHeight = Number(height);
    const safeHeight = Math.min(
        Math.max(1, Number.isFinite(numericHeight) ? numericHeight : TRACKER_WIDGET_DEFAULT_HEIGHT),
        Math.max(1, viewportHeight - (verticalInset * 2)),
    );
    const minimumWidth = Math.min(TRACKER_WIDGET_MIN_WIDTH, safeWidth);
    const minimumHeight = Math.min(TRACKER_WIDGET_MIN_HEIGHT, safeHeight);
    const sideBounds = getTrackerWidgetSideBounds(preferredSide);
    const numericAnchorX = Number(anchorX);
    const numericAnchorY = Number(anchorY);
    const safeAnchorX = Number.isFinite(numericAnchorX) ? numericAnchorX : sideBounds.left;
    const safeAnchorY = Number.isFinite(numericAnchorY) ? numericAnchorY : 120;
    const rightSpace = Math.max(0, sideBounds.right - safeAnchorX);
    const leftSpace = Math.max(0, safeAnchorX + TRACKER_WIDGET_BUTTON_SIZE - sideBounds.left);
    const bottomSpace = Math.max(0, viewportHeight - verticalInset - safeAnchorY);
    const topSpace = Math.max(0, safeAnchorY + TRACKER_WIDGET_BUTTON_SIZE - verticalInset);
    const hasPreferredSide = preferredSide === 'left' || preferredSide === 'right';
    let opensLeft;
    if (hasPreferredSide) {
        const opensTowardChat = preferredSide === 'right';
        const towardChatSpace = opensTowardChat ? leftSpace : rightSpace;
        const awayFromChatSpace = opensTowardChat ? rightSpace : leftSpace;
        if (towardChatSpace >= minimumWidth || awayFromChatSpace < minimumWidth) {
            opensLeft = opensTowardChat;
        } else {
            opensLeft = !opensTowardChat;
        }
    } else {
        opensLeft = rightSpace < leftSpace;
    }
    const opensUp = bottomSpace < minimumHeight && topSpace >= minimumHeight
        ? true
        : topSpace < minimumHeight && bottomSpace >= minimumHeight
            ? false
            : bottomSpace < topSpace;
    const availableWidth = opensLeft ? leftSpace : rightSpace;
    const panelWidth = Math.max(1, Math.min(safeWidth, availableWidth));
    const availableHeight = opensUp ? topSpace : bottomSpace;
    const panelHeight = Math.max(1, Math.min(safeHeight, availableHeight));
    const horizontalProtectedCorner = opensLeft ? 'right' : 'left';
    const verticalProtectedCorner = opensUp ? 'bottom' : 'top';
    return {
        opensLeft,
        opensUp,
        panelWidth,
        panelHeight,
        left: opensLeft ? TRACKER_WIDGET_BUTTON_SIZE - panelWidth : 0,
        top: opensUp ? TRACKER_WIDGET_BUTTON_SIZE - panelHeight : 0,
        protectedResizeCorner: `${verticalProtectedCorner}-${horizontalProtectedCorner}`,
    };
}

function getTrackerWidgetAnchorForPanel(panelLeft, panelTop, width, height, preferredSide = 'auto', protectedCorner = '') {
    const viewportWidth = Math.max(1, Number(globalThis.innerWidth) || 1200);
    const viewportHeight = Math.max(1, Number(globalThis.innerHeight) || 800);
    const numericWidth = Number(width);
    const numericHeight = Number(height);
    const safeWidth = Number.isFinite(numericWidth) ? numericWidth : TRACKER_WIDGET_DEFAULT_WIDTH;
    const safeHeight = Number.isFinite(numericHeight) ? numericHeight : TRACKER_WIDGET_DEFAULT_HEIGHT;
    const left = Number(panelLeft);
    const top = Number(panelTop);
    const right = left + safeWidth;
    const bottom = top + safeHeight;
    const sideBounds = getTrackerWidgetSideBounds(preferredSide);
    const hasPreferredSide = preferredSide === 'left' || preferredSide === 'right';
    const opensLeft = protectedCorner
        ? protectedCorner.endsWith('-right')
        : hasPreferredSide
            ? left <= sideBounds.left + 2
            : viewportWidth - right < left;
    const opensUp = protectedCorner
        ? protectedCorner.startsWith('bottom-')
        : viewportHeight - bottom < top;
    const anchorX = protectedCorner
        ? (opensLeft ? right - TRACKER_WIDGET_BUTTON_SIZE : left)
        : (opensLeft ? right : left - TRACKER_WIDGET_BUTTON_SIZE);
    const anchorY = opensUp ? bottom - TRACKER_WIDGET_BUTTON_SIZE : top;
    return clampTrackerWidgetAnchorPosition(anchorX, anchorY, preferredSide);
}

function syncTrackerWidgetResizeHandles(widget, placement, handleSelector) {
    if (!widget || !placement || !handleSelector) return;
    const protectedCorner = String(placement.protectedResizeCorner || '');
    widget.querySelectorAll(handleSelector).forEach(handle => {
        const corner = handle.getAttribute('data-spe-resize-corner') || '';
        const isProtected = corner === protectedCorner;
        handle.hidden = isProtected;
        if (isProtected) {
            handle.setAttribute('aria-hidden', 'true');
        } else {
            handle.removeAttribute('aria-hidden');
        }
    });
    widget.setAttribute('data-spe-protected-resize-corner', protectedCorner);
    widget.setAttribute('data-spe-widget-control-corner', protectedCorner);
}

function resizeTrackerWidgetFromCorner(start, corner, deltaX, deltaY) {
    const viewportWidth = Math.max(1, Number(globalThis.innerWidth) || 1200);
    const viewportHeight = Math.max(1, Number(globalThis.innerHeight) || 800);
    const inset = 8;
    const maximumWidth = Math.max(1, viewportWidth - (inset * 2));
    const maximumHeight = Math.max(1, viewportHeight - (inset * 2));
    const minimumWidth = Math.min(TRACKER_WIDGET_MIN_WIDTH, maximumWidth);
    const minimumHeight = Math.min(TRACKER_WIDGET_MIN_HEIGHT, maximumHeight);
    const startLeft = Number(start.left);
    const startTop = Number(start.top);
    const startRight = startLeft + Number(start.width);
    const startBottom = startTop + Number(start.height);
    const includesLeft = corner === 'top-left' || corner === 'bottom-left';
    const includesTop = corner === 'top-left' || corner === 'top-right';
    let left = startLeft;
    let right = startRight;
    let top = startTop;
    let bottom = startBottom;

    if (includesLeft) {
        const minimumLeft = Math.max(inset, startRight - maximumWidth);
        const maximumLeft = startRight - minimumWidth;
        left = Math.max(minimumLeft, Math.min(startLeft + Number(deltaX), maximumLeft));
    } else {
        const minimumRight = startLeft + minimumWidth;
        const maximumRight = Math.min(viewportWidth - inset, startLeft + maximumWidth);
        right = Math.max(minimumRight, Math.min(startRight + Number(deltaX), maximumRight));
    }

    if (includesTop) {
        const minimumTop = Math.max(inset, startBottom - maximumHeight);
        const maximumTop = startBottom - minimumHeight;
        top = Math.max(minimumTop, Math.min(startTop + Number(deltaY), maximumTop));
    } else {
        const minimumBottom = startTop + minimumHeight;
        const maximumBottom = Math.min(viewportHeight - inset, startTop + maximumHeight);
        bottom = Math.max(minimumBottom, Math.min(startBottom + Number(deltaY), maximumBottom));
    }

    return {
        left: Math.round(left),
        top: Math.round(top),
        width: Math.round(right - left),
        height: Math.round(bottom - top),
    };
}

function attachTrackerWidgetCornerResizeHandlers(widget, options = {}) {
    if (!widget) return;
    const panel = widget.querySelector(options.panelSelector);
    const handles = Array.from(widget.querySelectorAll(options.handleSelector));
    if (!panel || !handles.length) return;
    const settingsKeys = options.settingsKeys || {};
    let resize = null;

    const applyResizePreview = next => {
        const anchor = getTrackerWidgetAnchorForPanel(
            next.left,
            next.top,
            next.width,
            next.height,
            options.preferredSide,
            resize?.protectedCorner,
        );
        const placement = getTrackerWidgetPanelPlacement(
            anchor.x,
            anchor.y,
            next.width,
            next.height,
            options.preferredSide,
        );
        const position = clampTrackerWidgetAnchorPosition(anchor.x, anchor.y, options.preferredSide);
        widget.style.left = `${position.x}px`;
        widget.style.top = `${position.y}px`;
        panel.style.width = `${placement.panelWidth}px`;
        panel.style.height = `${placement.panelHeight}px`;
        panel.style.left = `${placement.left}px`;
        panel.style.top = `${placement.top}px`;
        syncTrackerWidgetResizeHandles(widget, placement, options.handleSelector);
    };

    const finishResize = (event, canceled = false) => {
        if (!resize) return;
        const resizeState = resize;
        const activeHandle = resize.handle;
        resize = null;
        widget.classList.remove(options.resizingClass || '');
        widget.removeAttribute('data-spe-resize-corner');
        if (activeHandle?.hasPointerCapture?.(event?.pointerId)) activeHandle.releasePointerCapture(event.pointerId);
        if (canceled) {
            options.syncViewport?.();
            return;
        }
        const panelRect = panel.getBoundingClientRect();
        const width = clampTrackerWidgetWidth(panelRect.width);
        const height = clampTrackerWidgetHeight(panelRect.height);
        const anchor = getTrackerWidgetAnchorForPanel(
            panelRect.left,
            panelRect.top,
            width,
            height,
            options.preferredSide,
            resizeState.protectedCorner,
        );
        const settings = getSettings();
        settings[settingsKeys.x] = anchor.x;
        settings[settingsKeys.y] = anchor.y;
        settings[settingsKeys.width] = width;
        settings[settingsKeys.height] = height;
        saveExtensionSettings();
        options.syncViewport?.();
    };

    handles.forEach(handle => {
        handle.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            const panelRect = panel.getBoundingClientRect();
            resize = {
                corner: handle.getAttribute('data-spe-resize-corner') || 'bottom-right',
                handle,
                startX: event.clientX,
                startY: event.clientY,
                start: {
                    left: panelRect.left,
                    top: panelRect.top,
                    width: panelRect.width,
                    height: panelRect.height,
                },
                protectedCorner: widget.getAttribute('data-spe-protected-resize-corner') || '',
            };
            widget.classList.add(options.resizingClass || '');
            widget.setAttribute('data-spe-resize-corner', resize.corner);
            handle.setPointerCapture?.(event.pointerId);
            event.preventDefault();
            event.stopPropagation();
        });

        handle.addEventListener('pointermove', event => {
            if (!resize || resize.handle !== handle) return;
            const next = resizeTrackerWidgetFromCorner(
                resize.start,
                resize.corner,
                event.clientX - resize.startX,
                event.clientY - resize.startY,
            );
            applyResizePreview(next);
        });

        handle.addEventListener('pointerup', event => finishResize(event));
        handle.addEventListener('pointercancel', event => finishResize(event, true));
        handle.addEventListener('lostpointercapture', event => finishResize(event, true));
    });
}

function getTrackerWidgetLayoutFromAnchor(
    settings,
    defaultX,
    preferredSide = TRACKER_WIDGET_PANEL_PREFERRED_SIDES.TRACKER,
) {
    const collapsed = settings.trackerWidgetCollapsed !== false;
    const storedWidth = Number(settings.trackerWidgetWidth);
    const storedHeight = Number(settings.trackerWidgetHeight);
    const width = collapsed
        ? TRACKER_WIDGET_BUTTON_SIZE
        : normalizeTrackerWidgetSavedDimension(storedWidth, TRACKER_WIDGET_DEFAULT_WIDTH, TRACKER_WIDGET_MIN_WIDTH);
    const height = collapsed
        ? TRACKER_WIDGET_BUTTON_SIZE
        : normalizeTrackerWidgetSavedDimension(storedHeight, TRACKER_WIDGET_DEFAULT_HEIGHT, TRACKER_WIDGET_MIN_HEIGHT);
    const storedX = Number(settings.trackerWidgetX);
    const storedY = Number(settings.trackerWidgetY);
    const anchor = clampTrackerWidgetAnchorPosition(
        Number.isFinite(storedX) ? storedX : defaultX,
        Number.isFinite(storedY) ? storedY : 120,
        preferredSide,
    );
    if (collapsed) {
        return { collapsed, x: anchor.x, y: anchor.y, width, height, panelLeft: 0, panelTop: 0 };
    }
    const placement = getTrackerWidgetPanelPlacement(
        anchor.x,
        anchor.y,
        width,
        height,
        preferredSide,
    );
    const position = clampTrackerWidgetAnchorPosition(anchor.x, anchor.y, preferredSide);
    return {
        collapsed,
        x: position.x,
        y: position.y,
        width,
        height,
        panelWidth: placement.panelWidth ?? width,
        panelHeight: placement.panelHeight ?? height,
        panelLeft: placement.left,
        panelTop: placement.top,
        protectedResizeCorner: placement.protectedResizeCorner,
    };
}

function getTrackerWidgetLayout(settings = getSettings()) {
    return getTrackerWidgetLayoutFromAnchor(settings, 24);
}

function applyTrackerWidgetLayout(widget, settings = getSettings()) {
    if (!widget) return null;
    const layout = getTrackerWidgetLayout(settings);
    widget.style.left = `${layout.x}px`;
    widget.style.top = `${layout.y}px`;

    const button = widget.querySelector(`#${TRACKER_WIDGET_BUTTON_ID}`);
    const panel = widget.querySelector(`#${TRACKER_WIDGET_PANEL_ID}`);
    if (button) {
        button.hidden = false;
        button.title = layout.collapsed ? 'Open Tracker' : 'Collapse Tracker';
        button.setAttribute('aria-label', button.title);
        button.setAttribute('aria-expanded', String(!layout.collapsed));
    }
    if (layout.collapsed) widget.removeAttribute('data-spe-widget-control-corner');
    else widget.setAttribute('data-spe-widget-control-corner', layout.protectedResizeCorner || 'top-left');
    if (panel) {
        panel.hidden = layout.collapsed;
        panel.style.width = `${layout.panelWidth ?? layout.width}px`;
        panel.style.height = `${layout.panelHeight ?? layout.height}px`;
        panel.style.left = `${layout.panelLeft}px`;
        panel.style.top = `${layout.panelTop}px`;
        if (!layout.collapsed) {
            syncTrackerWidgetResizeHandles(widget, layout, '[data-spe-tracker-resize-handle]');
        }
    }
    return layout;
}

function syncTrackerWidgetViewport() {
    if (typeof document === 'undefined') return;
    const widget = document.getElementById(TRACKER_WIDGET_ID);
    if (!widget) return;
    const settings = getSettings();
    const layout = applyTrackerWidgetLayout(widget, settings);
    if (!layout) return;
    let changed = false;
    const nextValues = {
        trackerWidgetX: layout.x,
        trackerWidgetY: layout.y,
    };
    if (!layout.collapsed) {
        nextValues.trackerWidgetWidth = layout.width;
        nextValues.trackerWidgetHeight = layout.height;
    }
    for (const [key, value] of Object.entries(nextValues)) {
        if (Number(settings[key]) !== Number(value)) {
            settings[key] = value;
            changed = true;
        }
    }
    if (changed) saveExtensionSettings();
}

function ensureTrackerWidgetViewportHandler() {
    if (!state.trackerWidgetViewportHandler && typeof globalThis.addEventListener === 'function') {
        state.trackerWidgetViewportHandler = () => syncTrackerWidgetViewport();
        globalThis.addEventListener('resize', state.trackerWidgetViewportHandler);
    }
}

function clearTrackerWidgetViewportHandler() {
    if (state.trackerWidgetViewportHandler && typeof globalThis.removeEventListener === 'function') {
        globalThis.removeEventListener('resize', state.trackerWidgetViewportHandler);
        state.trackerWidgetViewportHandler = null;
    }
}



function attachTrackerWidgetHandlers(widget) {

    const button = widget.querySelector(`#${TRACKER_WIDGET_BUTTON_ID}`);

    const title = widget.querySelector('.structured-preflight-tracker-widget-title');

    let drag = null;

    const cancelButtonDrag = () => {

        if (!drag) return;

        drag = null;

        widget.classList.remove('spe-tracker-dragging');

        syncTrackerWidgetViewport();

    };



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

        const pos = clampTrackerWidgetAnchorPosition(x, y, TRACKER_WIDGET_PANEL_PREFERRED_SIDES.TRACKER);

        applyTrackerWidgetLayout(widget, {
            ...getSettings(),
            trackerWidgetX: pos.x,
            trackerWidgetY: pos.y,
        });

    });

    button?.addEventListener('pointerup', event => {

        if (!drag) return;

        const moved = drag.moved;

        const settings = getSettings();

        const rect = widget.getBoundingClientRect();

        const pos = clampTrackerWidgetAnchorPosition(
            rect.left,
            rect.top,
            TRACKER_WIDGET_PANEL_PREFERRED_SIDES.TRACKER,
        );

        drag = null;

        widget.classList.remove('spe-tracker-dragging');

        if (button.hasPointerCapture?.(event.pointerId)) button.releasePointerCapture(event.pointerId);

        settings.trackerWidgetX = pos.x;

        settings.trackerWidgetY = pos.y;

        if (!moved) settings.trackerWidgetCollapsed = settings.trackerWidgetCollapsed === false;

        saveExtensionSettings();

        renderTrackerWidget();

    });

    button?.addEventListener('pointercancel', () => {

        cancelButtonDrag();

    });

    button?.addEventListener('lostpointercapture', cancelButtonDrag);

    title?.addEventListener('pointerdown', event => {
        if (event.button !== 0 || event.target?.closest?.('button')) return;
        const panel = widget.querySelector(`#${TRACKER_WIDGET_PANEL_ID}`);
        if (!panel || panel.hidden) return;
        const rect = panel.getBoundingClientRect();
        const widgetRect = widget.getBoundingClientRect();
        widget._speTrackerPanelDrag = {
            startX: event.clientX,
            startY: event.clientY,
            startLeft: widgetRect.left,
            startTop: widgetRect.top,
            panelLeft: rect.left - widgetRect.left,
            panelTop: rect.top - widgetRect.top,
            width: rect.width,
            height: rect.height,
            moved: false,
        };
        widget.classList.add('spe-tracker-panel-dragging');
        title.setPointerCapture?.(event.pointerId);
        event.preventDefault();
    });

    title?.addEventListener('pointermove', event => {
        const panelDrag = widget._speTrackerPanelDrag;
        if (!panelDrag) return;
        const panel = widget.querySelector(`#${TRACKER_WIDGET_PANEL_ID}`);
        if (!panel || panel.hidden) return;
        if (Math.abs(event.clientX - panelDrag.startX) > 3 || Math.abs(event.clientY - panelDrag.startY) > 3) panelDrag.moved = true;
        const pos = clampTrackerWidgetAnchorPosition(
            panelDrag.startLeft + event.clientX - panelDrag.startX,
            panelDrag.startTop + event.clientY - panelDrag.startY,
            TRACKER_WIDGET_PANEL_PREFERRED_SIDES.TRACKER,
        );
        applyTrackerWidgetLayout(widget, {
            ...getSettings(),
            trackerWidgetCollapsed: false,
            trackerWidgetX: pos.x,
            trackerWidgetY: pos.y,
            trackerWidgetWidth: panelDrag.width,
            trackerWidgetHeight: panelDrag.height,
        });
    });

    const finishPanelDrag = (event, canceled = false) => {
        const panelDrag = widget._speTrackerPanelDrag;
        if (!panelDrag) return;
        widget._speTrackerPanelDrag = null;
        widget.classList.remove('spe-tracker-panel-dragging');
        if (title?.hasPointerCapture?.(event?.pointerId)) title.releasePointerCapture(event.pointerId);
        if (canceled) {
            syncTrackerWidgetViewport();
            return;
        }
        const settings = getSettings();
        const rect = widget.getBoundingClientRect();
        const anchor = clampTrackerWidgetAnchorPosition(
            rect.left,
            rect.top,
            TRACKER_WIDGET_PANEL_PREFERRED_SIDES.TRACKER,
        );
        settings.trackerWidgetX = anchor.x;
        settings.trackerWidgetY = anchor.y;
        saveExtensionSettings();
        if (panelDrag.moved) renderTrackerWidget();
    };

    title?.addEventListener('pointerup', finishPanelDrag);
    title?.addEventListener('pointercancel', event => finishPanelDrag(event, true));

    title?.addEventListener('lostpointercapture', event => finishPanelDrag(event, true));

    attachTrackerWidgetCornerResizeHandlers(widget, {
        panelSelector: '#' + TRACKER_WIDGET_PANEL_ID,
        handleSelector: '[data-spe-tracker-resize-handle]',
        resizingClass: 'spe-tracker-resizing',
        settingsKeys: {
            x: 'trackerWidgetX',
            y: 'trackerWidgetY',
            width: 'trackerWidgetWidth',
            height: 'trackerWidgetHeight',
        },
        preferredSide: TRACKER_WIDGET_PANEL_PREFERRED_SIDES.TRACKER,
        syncViewport: syncTrackerWidgetViewport,
    });

}



function ensurePlayerSetupStyles() {
    if (document.getElementById(PLAYER_SETUP_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PLAYER_SETUP_STYLE_ID;
    style.textContent = `
        #${PLAYER_SETUP_CARD_ID} {
            margin: 0.75rem auto;
            padding: 0;
            width: min(820px, calc(100% - 1.2rem));
            border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.18));
            border-radius: 8px;
            background: var(--SmartThemeBlurTintColor, rgba(0,0,0,0.55));
            color: var(--SmartThemeBodyColor, inherit);
            box-shadow: 0 6px 18px rgba(0,0,0,0.18);
            line-height: 1.45;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-shell {
            display: flex;
            flex-direction: column;
            gap: 0.7rem;
            padding: 0.85rem;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-header {
            display: flex;
            justify-content: space-between;
            gap: 0.75rem;
            align-items: flex-start;
            padding-bottom: 0.75rem;
            border-bottom: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.14));
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-titleblock {
            min-width: 0;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-title {
            font-weight: 700;
            font-size: 1.05rem;
            margin-bottom: 0.25rem;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-muted {
            opacity: 0.78;
            font-size: 0.9rem;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-subtitle {
            opacity: 0.78;
            font-size: 0.9rem;
            max-width: 42rem;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-badges {
            display: flex;
            flex-wrap: wrap;
            justify-content: flex-end;
            gap: 0.4rem;
            flex: 0 0 auto;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-badge {
            padding: 0.22rem 0.5rem;
            border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.16));
            border-radius: 999px;
            background: color-mix(in srgb, var(--SmartThemeBodyColor, #fff) 7%, transparent);
            font-size: 0.82rem;
            white-space: nowrap;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-stage {
            font-weight: 700;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-body {
            display: flex;
            flex-direction: column;
            gap: 0.75rem;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-section-title {
            font-weight: 700;
            font-size: 0.96rem;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-form-grid {
            display: grid;
            grid-template-columns: repeat(2, minmax(0, 1fr));
            gap: 0.55rem;
            align-items: start;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-form-grid .spe-player-full {
            grid-column: 1 / -1;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-row,
        #${PLAYER_SETUP_CARD_ID} .spe-player-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 0.45rem;
            align-items: center;
            margin-top: 0.55rem;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-actions {
            justify-content: flex-end;
        }
        #${PLAYER_SETUP_CARD_ID} [hidden] {
            display: none !important;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-grid {
            display: grid;
            grid-template-columns: repeat(3, minmax(0, 1fr));
            gap: 0.45rem;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-stat {
            border-left: 2px solid var(--SmartThemeQuoteColor, rgba(255,255,255,0.28));
            padding: 0.45rem 0.55rem;
            background: color-mix(in srgb, var(--SmartThemeBodyColor, #fff) 5%, transparent);
            border-radius: 6px;
            min-width: 0;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-stat-head {
            display: flex;
            justify-content: space-between;
            gap: 0.45rem;
            align-items: baseline;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-stat code,
        #${PLAYER_SETUP_CARD_ID} .spe-player-stat-value {
            font-weight: 700;
            font-size: 1.05rem;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-stat-meter {
            display: block;
            height: 0.35rem;
            margin-top: 0.35rem;
            border-radius: 999px;
            background: rgba(255,255,255,0.1);
            overflow: hidden;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-stat-meter span {
            display: block;
            height: 100%;
            width: 0;
            border-radius: inherit;
            background: var(--SmartThemeQuoteColor, rgba(255,255,255,0.5));
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-point-buy {
            display: grid;
            gap: 0.55rem;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-stat-editor {
            display: grid;
            grid-template-columns: minmax(8rem, 1.1fr) minmax(9rem, 1.6fr) auto;
            gap: 0.65rem;
            align-items: center;
            padding: 0.65rem;
            border-left: 2px solid var(--SmartThemeQuoteColor, rgba(255,255,255,0.28));
            border-radius: 6px;
            background: color-mix(in srgb, var(--SmartThemeBodyColor, #fff) 5%, transparent);
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-stat-copy {
            min-width: 0;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-stat-desc {
            opacity: 0.78;
            font-size: 0.86rem;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-stepper {
            display: grid;
            grid-template-columns: 2.25rem 2.75rem 2.25rem;
            gap: 0.35rem;
            align-items: center;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-stepper .menu_button {
            min-width: 2.25rem;
            width: 2.25rem;
            padding-left: 0;
            padding-right: 0;
            text-align: center;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-stat-value {
            text-align: center;
        }
        #${PLAYER_SETUP_CARD_ID} textarea,
        #${PLAYER_SETUP_CARD_ID} input,
        #${PLAYER_SETUP_CARD_ID} select {
            width: 100%;
        }
        #${PLAYER_SETUP_CARD_ID} textarea {
            min-height: 5.5rem;
            max-height: 90vh;
            max-height: 90dvh;
            overflow-y: auto;
            resize: vertical;
        }
        #${PLAYER_SETUP_CARD_ID} pre {
            white-space: pre-wrap;
            height: min(26rem, 70vh);
            height: min(26rem, 70dvh);
            max-height: 90vh;
            max-height: 90dvh;
            overflow: auto;
            resize: vertical;
            padding: 0.65rem;
            border-radius: 6px;
            background: rgba(0,0,0,0.24);
            margin: 0;
        }
        #${PLAYER_SETUP_CARD_ID} .spe-player-error {
            margin-top: 0.55rem;
            color: var(--SmartThemeQuoteColor, #ffb4b4);
            font-weight: 600;
        }
        @media (max-width: 520px) {
            #${PLAYER_SETUP_CARD_ID} {
                width: calc(100% - 0.6rem);
                margin: 0.45rem auto;
            }
            #${PLAYER_SETUP_CARD_ID} .spe-player-shell {
                padding: 0.7rem;
            }
            #${PLAYER_SETUP_CARD_ID} .spe-player-header,
            #${PLAYER_SETUP_CARD_ID} .spe-player-stat-editor {
                grid-template-columns: 1fr;
                display: grid;
            }
            #${PLAYER_SETUP_CARD_ID} .spe-player-badges,
            #${PLAYER_SETUP_CARD_ID} .spe-player-actions {
                justify-content: flex-start;
            }
            #${PLAYER_SETUP_CARD_ID} .spe-player-grid {
                grid-template-columns: 1fr;
            }
            #${PLAYER_SETUP_CARD_ID} .spe-player-form-grid {
                grid-template-columns: 1fr;
            }
        }
    `;
    document.head.append(style);
}

function ensureProgressionStyles() {
    if (document.getElementById(PROGRESSION_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = PROGRESSION_STYLE_ID;
    style.textContent = `
        #${PROGRESSION_CARD_ID} {
            margin: 0.75rem auto;
            padding: 0.85rem;
            width: min(760px, calc(100% - 1.2rem));
            border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.18));
            border-radius: 8px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 34%, transparent);
            box-shadow: 0 10px 26px rgba(0,0,0,0.22);
            line-height: 1.45;
        }
        #${PROGRESSION_CARD_ID} .spe-progression-title {
            font-weight: 700;
            font-size: 1rem;
            margin-bottom: 0.35rem;
        }
        #${PROGRESSION_CARD_ID} .spe-progression-muted {
            opacity: 0.78;
            font-size: 0.9rem;
        }
        #${PROGRESSION_CARD_ID} .spe-progression-row,
        #${PROGRESSION_CARD_ID} .spe-progression-actions {
            display: flex;
            flex-wrap: wrap;
            gap: 0.45rem;
            align-items: center;
            margin-top: 0.55rem;
        }
        #${PROGRESSION_CARD_ID} [hidden] {
            display: none !important;
        }
        #${PROGRESSION_CARD_ID} .spe-progression-option {
            width: 100%;
            padding: 0.55rem;
            border-left: 2px solid var(--SmartThemeQuoteColor, rgba(255,255,255,0.28));
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 18%, transparent);
            border-radius: 6px;
        }
        #${PROGRESSION_CARD_ID} select {
            width: 100%;
        }
        #${PROGRESSION_CARD_ID} .spe-progression-error {
            margin-top: 0.55rem;
            color: var(--SmartThemeQuoteColor, #ffb4b4);
            font-weight: 600;
        }
    `;
    document.head.append(style);
}

function renderPlayerSetupCard(context = getContext()) {
    if (typeof document === 'undefined') return;
    const existing = document.getElementById(PLAYER_SETUP_CARD_ID);
    if (!isStoryEngineEnabled()) {
        existing?.remove();
        return;
    }
    if (!playerSetupNeeded(context) && !playerAdventureStartPending(context)) {
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

function renderProgressionCard(context = getContext()) {
    if (typeof document === 'undefined') return;
    const existing = document.getElementById(PROGRESSION_CARD_ID);
    if (!isStoryEngineEnabled() || getSettings().characterProgressionEnabled === false || !progressionPending(context)) {
        existing?.remove();
        return;
    }

    ensureProgressionStyles();
    const chat = document.getElementById('chat') || document.querySelector('#chat_container') || document.body;
    if (!chat) return;

    const root = getProgressionRoot(context);
    const card = existing || document.createElement('div');
    card.id = PROGRESSION_CARD_ID;
    card.innerHTML = buildProgressionCardHtml(root, context);
    if (!existing) chat.append(card);
    bindProgressionCardEvents(card, context);
}


function buildPlayerSetupCardHtml(root) {
    const creator = root?.creator || { stage: 'offer' };
    const stage = creator.stage || 'offer';
    const busy = state.playerSetupBusy;
    const error = creator.error ? `<div class="spe-player-error">${escapeHtml(creator.error)}</div>` : '';
    const busyLine = busy ? '<div class="spe-player-muted">Working...</div>' : '';
    const body = stage === 'stats'
        ? buildPlayerStatsHtml(creator)
        : stage === 'identity'
            ? buildPlayerIdentityHtml(creator)
            : stage === 'review'
                ? buildPlayerReviewHtml(creator)
                : stage === 'persona-sheet'
                    ? buildPlayerPersonaSheetHtml(creator)
                    : stage === 'approved'
                        ? buildPlayerAdventureStartHtml(root)
                        : buildPlayerOfferHtml();
    const ready = stage === 'approved';
    const title = ready
        ? 'Adventure Ready'
        : stage === 'stats'
            ? 'Assign Stats'
            : stage === 'identity'
                ? 'Character Details'
                : stage === 'review'
                    ? 'Review Character'
                    : stage === 'persona-sheet'
                        ? 'Persona Conversion'
                        : 'Player Setup';
    const subtitle = ready
        ? 'Player setup is complete. Start the first scene now, or dismiss this card and begin manually.'
        : stage === 'stats'
            ? `Distribute ${PLAYER_CREATION_STAT_POINTS} points across PHY, MND, and CHA. Starting stats cannot exceed ${PLAYER_CREATION_MAX_STAT}.`
            : 'Complete setup once, then the creator stays out of the way for this story.';
    const stageLabel = ready
        ? 'Start Adventure'
        : stage === 'offer'
            ? 'Choose Flow'
            : stage === 'stats'
                ? 'Step 1 of 3'
                : stage === 'identity' || stage === 'persona-sheet'
                    ? 'Step 2 of 3'
                    : stage === 'review'
                        ? 'Review'
                        : 'Setup';
    const statsBadge = creator?.stats && stage !== 'offer'
        ? `<span class="spe-player-badge">Points ${playerPointBuySpent(creator.stats)}/${PLAYER_CREATION_STAT_POINTS}</span>`
        : '';

    return `
        <div class="spe-player-shell">
            <div class="spe-player-header">
                <div class="spe-player-titleblock">
                    <div class="spe-player-title">${title}</div>
                    <div class="spe-player-subtitle">${subtitle}</div>
                </div>
                <div class="spe-player-badges">
                    <span class="spe-player-badge spe-player-stage">${stageLabel}</span>
                    ${statsBadge}
                </div>
            </div>
            <div class="spe-player-body">
                ${busyLine}
                ${body}
                ${error}
            </div>
        </div>
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

        <div class="spe-player-muted">Create Character starts a ${PLAYER_CREATION_STAT_POINTS}-point stat assignment, then keeps the same character detail choices as before. Use Existing Persona suggests a point-buy shape from the active persona, then lets you adjust it before conversion.</div>

    `;
}

function buildProgressionCardHtml(root, context = getContext()) {
    const pending = root?.pendingAdvancement || {};
    const stats = getPlayerCoreStats(context) || getPersonaCoreStats(context) || { PHY: 1, MND: 1, CHA: 1 };
    const persona = getPersonaText(context);
    const abilities = extractPersonaAbilities(persona);
    const spells = extractPersonaSpells(persona);
    const abilityCount = abilities.length;
    const spellCount = spells.length;
    const breakthroughStat = normalizeBreakthroughStat(root?.breakthroughStat);
    const spellCapacity = spellCapacityForMnd(stats?.MND);
    const allStatsAtNormalCap = PLAYER_STATS.every(stat => Number(stats?.[stat] || 0) >= PROGRESSION_MAX_STAT);
    const canRaiseStat = PLAYER_STATS.some(stat => (
        stat !== breakthroughStat && Number(stats?.[stat] || 0) < PROGRESSION_MAX_STAT
    ));
    const canBreakthrough = allStatsAtNormalCap
        && (!breakthroughStat || Number(stats?.[breakthroughStat] || 0) < PROGRESSION_MAX_BREAKTHROUGH_STAT);
    const canSwapAbility = abilityCount >= 1;
    const canLearnSpell = spellCount < spellCapacity;
    const choice = pending.choice || 'choose';
    const error = root?.ui?.error ? `<div class="spe-progression-error">${escapeHtml(root.ui.error)}</div>` : '';
    const busy = state.progressionBusy ? '<div class="spe-progression-muted">Working...</div>' : '';
    let body = '';

    if (choice === 'stat') {
        const statInstruction = breakthroughStat
            ? `Restore a reduced stat toward ${PROGRESSION_MAX_STAT}. ${breakthroughStat} can advance only through another breakthrough after every stat is restored.`
            : `Choose one stat to raise. Stats cannot go above ${PROGRESSION_MAX_STAT} before a breakthrough.`;
        body = `
            <div class="spe-progression-muted">${statInstruction}</div>
            <div class="spe-progression-actions">
                ${PLAYER_STATS.map(stat => {
                    const value = Number(stats?.[stat] || 1);
                    const disabled = stat === breakthroughStat || value >= PROGRESSION_MAX_STAT ? 'disabled' : '';
                    const label = stat === breakthroughStat
                        ? `${stat} ${value} (Breakthrough)`
                        : value >= PROGRESSION_MAX_STAT
                            ? `${stat} ${value} (Maximum)`
                            : `${stat} ${value} -> ${value + 1}`;
                    return `<button class="menu_button" data-spe-progression-action="apply-stat" data-stat="${stat}" ${disabled}>${label}</button>`;
                }).join('')}
                <button class="menu_button" data-spe-progression-action="back">Back</button>
            </div>`;
    } else if (choice === 'breakthrough') {
        const targetStats = breakthroughStat ? [breakthroughStat] : PLAYER_STATS;
        const breakthroughLabel = breakthroughStat ? 'Advance Breakthrough' : 'Choose Permanent Breakthrough';
        body = `
            <div class="spe-progression-muted"><b>${breakthroughLabel}.</b> Raising a stat above ${PROGRESSION_MAX_STAT} permanently makes it the only stat that can exceed ${PROGRESSION_MAX_STAT}. Each breakthrough sacrifices ${PROGRESSION_BREAKTHROUGH_SACRIFICE} points from a different stat. Every stat must be restored to at least ${PROGRESSION_MAX_STAT} before another breakthrough. MND cannot be sacrificed below the requirement for currently learned spells.</div>
            ${targetStats.map(target => `
                <div class="spe-progression-option">
                    <b>${target} ${Number(stats?.[target] || 1)} -> ${Number(stats?.[target] || 1) + 1}</b>
                    <div class="spe-progression-actions">
                        ${PLAYER_STATS.filter(stat => stat !== target).map(sacrifice => {
                            const reason = breakthroughSacrificeReason(stats, target, sacrifice, spellCount);
                            const nextValue = Number(stats?.[sacrifice] || 1) - PROGRESSION_BREAKTHROUGH_SACRIFICE;
                            return `<button class="menu_button" data-spe-progression-action="apply-breakthrough" data-stat="${target}" data-sacrifice-stat="${sacrifice}" ${reason ? 'disabled' : ''} title="${escapeHtml(reason || `Sacrifice ${PROGRESSION_BREAKTHROUGH_SACRIFICE} ${sacrifice}`)}">Sacrifice ${sacrifice}: ${Number(stats?.[sacrifice] || 1)} -> ${nextValue}</button>`;
                        }).join('')}
                    </div>
                </div>
            `).join('')}
            <div class="spe-progression-actions"><button class="menu_button" data-spe-progression-action="back">Back</button></div>`;
    } else if (choice === 'swapAbility') {
        const options = Array.isArray(pending.abilityOptions) ? pending.abilityOptions : [];
        const swapSelect = `<div class="spe-progression-row">
                <label class="flex1">Ability to replace
                    <select id="spe_progression_swap_ability" class="text_pole" ${options.length ? 'disabled' : ''}>
                        ${abilities.map((ability, index) => `<option value="${index}" ${Number(pending.swapAbilityIndex) === index ? 'selected' : ''}>${escapeHtml(ability.name || `Ability ${index + 1}`)}</option>`).join('')}
                    </select>
                </label>
            </div>`;
        body = `
            <div class="spe-progression-muted">Choose the existing ability to replace, then choose one generated replacement. Ability options cannot be rerolled.</div>
            ${swapSelect}
            <div class="spe-progression-actions">
                ${options.length ? '' : '<button class="menu_button" data-spe-progression-action="generate-abilities">Generate Ability Options</button>'}
                <button class="menu_button" data-spe-progression-action="back">Back</button>
            </div>
            ${options.map((option, index) => `
                <div class="spe-progression-option">
                    <b>${escapeHtml(option.name || `Option ${index + 1}`)}</b>
                    <div>${escapeHtml(option.description || '')}</div>
                    <div class="spe-progression-actions">
                        <button class="menu_button" data-spe-progression-action="choose-ability" data-option-index="${index}">Choose This Ability</button>
                    </div>
                </div>
            `).join('')}`;
    } else if (choice === 'learnSpell') {
        const options = Array.isArray(pending.spellOptions) ? pending.spellOptions : [];
        body = `
            <div class="spe-progression-muted">Choose one generated spell to learn. Current MND supports ${spellCapacity} spell${spellCapacity === 1 ? '' : 's'}; ${spellCount} currently learned. Spell options cannot be rerolled.</div>
            <div class="spe-progression-actions">
                ${options.length ? '' : '<button class="menu_button" data-spe-progression-action="generate-spells">Generate Spell Options</button>'}
                <button class="menu_button" data-spe-progression-action="back">Back</button>
            </div>
            ${options.map((option, index) => `
                <div class="spe-progression-option">
                    <b>${escapeHtml(option.name || `Spell ${index + 1}`)}</b>
                    <div>${escapeHtml(option.description || '')}</div>
                    <div class="spe-progression-actions">
                        <button class="menu_button" data-spe-progression-action="choose-spell" data-option-index="${index}">Learn This Spell</button>
                    </div>
                </div>
            `).join('')}`;
    } else {
        body = `
            <div class="spe-progression-muted">Recent accomplishments have opened a path for growth. Choose how the character advances.</div>
            <div class="spe-progression-actions">
                ${canRaiseStat ? '<button class="menu_button" data-spe-progression-action="choose-stat">Raise Stat</button>' : ''}
                ${canBreakthrough ? `<button class="menu_button" data-spe-progression-action="choose-breakthrough">${breakthroughStat ? 'Advance Breakthrough' : 'Breakthrough'}</button>` : ''}
                ${canSwapAbility ? '<button class="menu_button" data-spe-progression-action="choose-swap-ability">Swap Ability</button>' : ''}
                ${canLearnSpell ? '<button class="menu_button" data-spe-progression-action="choose-learn-spell">Learn Spell</button>' : ''}
            </div>`;
    }

    return `
        <div class="spe-progression-title">Character Milestone Reached</div>
        ${busy}
        ${body}
        ${error}
    `;
}

function buildStatsGridHtml(creator) {
    const stats = normalizePlayerCreationStats(creator.stats || {});

    return `

        <div class="spe-player-grid">

            ${PLAYER_STATS.map(stat => {

                const value = Number(stats[stat] || 1);
                const width = Math.round((value / PLAYER_CREATION_MAX_STAT) * 100);

                return `<div class="spe-player-stat">
                    <div class="spe-player-stat-head"><b>${stat}</b><code>${value}</code></div>
                    <span class="spe-player-stat-meter"><span style="width:${width}%"></span></span>
                    <div class="spe-player-muted">Starting cap ${PLAYER_CREATION_MAX_STAT}</div>
                </div>`;

            }).join('')}

        </div>

    `;

}

function buildPlayerStatsHtml(creator) {
    const stats = normalizePlayerCreationStats(creator.stats || {});
    const spent = playerPointBuySpent(stats);
    const remaining = playerPointBuyRemaining(stats);
    const valid = isValidPlayerCreationStats(stats);
    const analysis = creator.flow === 'persona' && creator.personaAnalysis
        ? `<div class="spe-player-muted">Persona read: strongest fit is <code>${escapeHtml(creator.personaAnalysis.PrimaryStat || 'PHY')}</code>. ${escapeHtml(creator.personaAnalysis.Evidence || '')}</div>`
        : '';
    const statDescriptions = {
        PHY: 'Body, combat readiness, endurance, stealth movement, and physical execution.',
        MND: 'Knowledge, perception, focus, technical skill, magic, and deliberate mental exertion.',
        CHA: 'Presence, persuasion, deception, intimidation, leadership, and social pressure.',
    };
    return `
        ${analysis}
        <div class="spe-player-section-title">Point Buy</div>
        <div class="spe-player-muted">Lower one stat to raise another. All ${PLAYER_CREATION_STAT_POINTS} points must be assigned before continuing.</div>
        <div class="spe-player-badges">
            <span class="spe-player-badge">Spent ${spent}/${PLAYER_CREATION_STAT_POINTS}</span>
            <span class="spe-player-badge">Remaining ${remaining}</span>
            <span class="spe-player-badge">Max ${PLAYER_CREATION_MAX_STAT}</span>
        </div>
        <div class="spe-player-point-buy">
            ${PLAYER_STATS.map(stat => {
                const value = Number(stats[stat] || PLAYER_CREATION_MIN_STAT);
                const width = Math.round((value / PLAYER_CREATION_MAX_STAT) * 100);
                const minusDisabled = value <= PLAYER_CREATION_MIN_STAT ? 'disabled' : '';
                const plusDisabled = remaining <= 0 || value >= PLAYER_CREATION_MAX_STAT ? 'disabled' : '';
                return `
                    <div class="spe-player-stat-editor">
                        <div class="spe-player-stat-copy">
                            <div class="spe-player-stat-head"><b>${stat}</b><span class="spe-player-stat-value">${value}</span></div>
                            <div class="spe-player-stat-desc">${statDescriptions[stat]}</div>
                        </div>
                        <span class="spe-player-stat-meter"><span style="width:${width}%"></span></span>
                        <div class="spe-player-stepper">
                            <button class="menu_button" title="Lower ${stat}" data-spe-player-action="stat-minus" data-stat="${stat}" ${minusDisabled}>-</button>
                            <div class="spe-player-stat-value">${value}</div>
                            <button class="menu_button" title="Raise ${stat}" data-spe-player-action="stat-plus" data-stat="${stat}" ${plusDisabled}>+</button>
                        </div>
                    </div>
                `;
            }).join('')}
        </div>
        <div class="spe-player-actions">
            <button class="menu_button" data-spe-player-action="reset-stats">Reset</button>
            <button class="menu_button" data-spe-player-action="continue-stats" ${valid ? '' : 'disabled'}>Continue</button>
        </div>
    `;
}

function buildPlayerIdentityHtml(creator) {
    const identity = creator.identity || {};
    const genre = PLAYER_GENRE_CHOICES.includes(identity.genre) ? identity.genre : 'Fantasy';
    const raceValue = identity.raceMode === 'specify'
        ? 'custom'
        : identity.raceMode === 'pick'
            ? identity.pickedRace || 'Human'
            : 'random';
    const raceIsCustom = raceValue === 'custom';
    const raceDescriptionMode = identity.specifiedRaceDescriptionMode || 'system';
    const additionalDetails = String(identity.additionalDetails || identity.appearance || '').trim();
    const hasStoredAdditionalDetailsMode = Object.prototype.hasOwnProperty.call(identity, 'additionalDetailsMode');
    const additionalDetailsMode = identity.additionalDetailsMode === 'user' || (!hasStoredAdditionalDetailsMode && additionalDetails) ? 'user' : 'system';
    const personaName = getPlayerSetupPersonaName();
    return `
        ${buildStatsGridHtml(creator)}
        <div class="spe-player-muted">Character name: <code>${escapeHtml(personaName)}</code> from the current SillyTavern persona.</div>
        <div class="spe-player-form-grid">
            <label class="flex1">Sex
                <input id="spe_player_sex" class="text_pole" value="${escapeHtml(identity.sex || '')}" placeholder="Optional. Leave blank to generate.">
            </label>
            <label class="flex1">Genre
                <select id="spe_player_genre" class="text_pole">
                    ${PLAYER_GENRE_CHOICES.map(item => `<option value="${escapeHtml(item)}" ${genre === item ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}
                </select>
            </label>
            <label class="flex1">Race
                <select id="spe_player_race" class="text_pole">
                    <option value="random" ${raceValue === 'random' ? 'selected' : ''}>Random</option>
                    ${PLAYER_RACE_CHOICES.map(race => `<option value="${escapeHtml(race)}" ${raceValue === race ? 'selected' : ''}>${escapeHtml(race)}</option>`).join('')}
                    <option value="custom" ${raceValue === 'custom' ? 'selected' : ''}>Custom / Specify</option>
                </select>
            </label>
            <label class="flex1 spe-player-full" data-spe-player-custom-race ${raceIsCustom ? '' : 'hidden'}>Specify race or ancestry
                <input id="spe_player_race_specify" class="text_pole" value="${escapeHtml(identity.specifiedRace || '')}" placeholder="Optional">
            </label>
            <label class="flex1 spe-player-full" data-spe-player-custom-race ${raceIsCustom ? '' : 'hidden'}>Specified race details
                <select id="spe_player_race_description_mode" class="text_pole">
                    <option value="system" ${raceDescriptionMode === 'system' ? 'selected' : ''}>Let system describe it</option>
                    <option value="user" ${raceDescriptionMode === 'user' ? 'selected' : ''}>Describe it myself</option>
                </select>
            </label>
            <label class="flex1 spe-player-full" data-spe-player-race-description ${raceIsCustom && raceDescriptionMode === 'user' ? '' : 'hidden'}>Your race description
                <textarea id="spe_player_race_description" class="text_pole" placeholder="Optional unless you choose Describe it myself.">${escapeHtml(identity.specifiedRaceDescription || '')}</textarea>
            </label>
            <label class="flex1 spe-player-full">Additional character details
                <select id="spe_player_additional_details_mode" class="text_pole">
                    <option value="system" ${additionalDetailsMode === 'system' ? 'selected' : ''}>Let AI decide</option>
                    <option value="user" ${additionalDetailsMode === 'user' ? 'selected' : ''}>Use my notes + fill the rest</option>
                </select>
            </label>
            <label class="flex1 spe-player-full" data-spe-player-additional-details ${additionalDetailsMode === 'user' ? '' : 'hidden'}>Your character details
                <textarea id="spe_player_additional_details" class="text_pole" placeholder="Optional background, Earth life, appearance, clothing, training, inventory, origin, or other fixed starting facts.">${escapeHtml(additionalDetails)}</textarea>
            </label>
        </div>
        <div class="spe-player-actions">
            <button class="menu_button" data-spe-player-action="back-to-stats">Back</button>
            <button class="menu_button" data-spe-player-action="generate-sheet">Generate Character Sheet</button>
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

function buildPlayerAdventureStartHtml(root) {
    const genre = normalizePlayerAdventureGenre(root?.sheet?.genre || root?.adventureGenre || 'Fantasy');
    return `
        <div class="spe-player-muted">Opening genre: <code>${escapeHtml(genre)}</code></div>
        <div class="spe-player-actions">
            <button class="menu_button" data-spe-player-action="start-adventure">Start Adventure</button>
            <button class="menu_button" data-spe-player-action="back-from-adventure-start">Back</button>
            <button class="menu_button" data-spe-player-action="dismiss-adventure-start">Hide</button>
        </div>
    `;
}

function normalizePlayerAdventureGenre(value) {
    const genre = String(value || '').trim();
    return PLAYER_GENRE_CHOICES.includes(genre) ? genre : 'Fantasy';
}

function getActiveAdventureGenre(context = getContext()) {
    const root = getPlayerRoot(context);
    return normalizePlayerAdventureGenre(root?.sheet?.genre || root?.adventureGenre || root?.creator?.identity?.genre || 'Fantasy');
}

function buildPlayerAdventureStartPrompt(root = {}) {
    const genre = normalizePlayerAdventureGenre(root?.sheet?.genre || root?.adventureGenre || 'Fantasy');
    if (genre === 'Isekai') {
        return PLAYER_ISEKAI_ADVENTURE_START_REMINDER;
    }
    const genreFrame = PLAYER_ADVENTURE_GENRE_FRAMES[genre] || PLAYER_ADVENTURE_GENRE_FRAMES.Fantasy;
    return [
        'GENRE OPENING:',
        `You MUST begin in the selected genre: ${genre}.`,
        'Use the genre guidance below as the concrete Start Adventure structure. Do NOT choose a different genre, premise, or opening setup for convenience.',
        '',
        'Guidance:',
        genreFrame,
        '',
        'PREMADE CHARACTER RULE:',
        'PRESERVE {{user}}\'s existing race, body, abilities, gear, identity, backstory, and character-card/lorebook facts. The opening may relocate, reveal, pressure, or contextualize the character, but it must not rebuild, reroll, overwrite, infantize, or replace them.',
        '',
        PLAYER_ADVENTURE_START_REMINDER,
    ].join('\n');
}

function buildPlayerPersonaSheetHtml(creator) {
    const analysis = creator.personaAnalysis || {};
    const genre = normalizePlayerAdventureGenre(creator.identity?.genre || 'Fantasy');
    return `
        ${buildStatsGridHtml(creator)}
        <div class="spe-player-muted">Existing persona conversion: strongest-stat reading <code>${escapeHtml(analysis.PrimaryStat || 'PHY')}</code>. The model will reformat the current persona into the character-sheet template and copy the locked stats exactly.</div>

        <div class="spe-player-form-grid">
            <label class="flex1">Genre
                <select id="spe_player_genre" class="text_pole">
                    ${PLAYER_GENRE_CHOICES.map(item => `<option value="${escapeHtml(item)}" ${genre === item ? 'selected' : ''}>${escapeHtml(item)}</option>`).join('')}
                </select>
            </label>
        </div>

        <div class="spe-player-actions">

            <button class="menu_button" data-spe-player-action="back-to-stats">Back</button>

            <button class="menu_button" data-spe-player-action="generate-persona-sheet">Generate Persona Sheet</button>

        </div>

    `;

}



function bindPlayerSetupCardEvents(card, context = getContext()) {
    if (!card) return;
    const updateOptionalFields = () => updatePlayerIdentityOptionalFields(card);
    const syncDraft = () => syncPlayerSetupDraft(card, getContext() || context);
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
    card.querySelectorAll('#spe_player_sex, #spe_player_genre, #spe_player_race, #spe_player_race_specify, #spe_player_race_description_mode, #spe_player_race_description, #spe_player_additional_details_mode, #spe_player_additional_details').forEach(input => {
        input.addEventListener('input', syncDraft);
        input.addEventListener('change', syncDraft);
    });
    card.querySelector('#spe_player_race')?.addEventListener('change', updateOptionalFields);
    card.querySelector('#spe_player_race_description_mode')?.addEventListener('change', updateOptionalFields);
    card.querySelector('#spe_player_additional_details_mode')?.addEventListener('change', updateOptionalFields);
    updateOptionalFields();
    card.onclick = async event => {
        const button = event.target?.closest?.('[data-spe-player-action]');
        if (!button || !card.contains(button)) return;
        event.preventDefault();
        event.stopPropagation();
        await runButtonAction(button);
    };
}

function bindProgressionCardEvents(card, context = getContext()) {
    if (!card) return;
    const runButtonAction = async button => {
        if (!button || state.progressionBusy) return;
        const action = button.getAttribute('data-spe-progression-action');
        const stat = button.getAttribute('data-stat');
        const sacrificeStat = button.getAttribute('data-sacrifice-stat');
        const optionIndex = button.getAttribute('data-option-index');
        await handleProgressionAction(action, { stat, sacrificeStat, optionIndex, card }, getContext() || context);
    };
    card.querySelectorAll('[data-spe-progression-action]').forEach(button => {
        button.onclick = async event => {
            event.preventDefault();
            event.stopPropagation();
            await runButtonAction(button);
        };
    });
    card.onclick = async event => {
        const button = event.target?.closest?.('[data-spe-progression-action]');
        if (!button || !card.contains(button)) return;
        event.preventDefault();
        event.stopPropagation();
        await runButtonAction(button);
    };
}

async function handleProgressionAction(action, details = {}, context = getContext()) {
    if (!isStoryEngineEnabled()) {
        disableStoryEngineRuntime();
        return;
    }
    if (state.progressionBusy) return;
    const root = getProgressionRoot(context);
    if (!root?.pendingAdvancement) return;
    const actionIdentity = createStoryEngineEpochIdentity(context);
    root.ui = root.ui || {};
    delete root.ui.error;
    let transactionPersisted = false;

    try {
        if (action === 'choose-stat') {
            root.pendingAdvancement.choice = 'stat';
        } else if (action === 'choose-breakthrough') {
            const stats = getPlayerCoreStats(context) || getPersonaCoreStats(context);
            if (!isValidCoreStats(stats) || !PLAYER_STATS.every(stat => Number(stats[stat]) >= PROGRESSION_MAX_STAT)) {
                throw new Error(`All stats must be at least ${PROGRESSION_MAX_STAT} before a breakthrough.`);
            }
            const breakthroughStat = normalizeBreakthroughStat(root.breakthroughStat);
            if (breakthroughStat && Number(stats[breakthroughStat]) >= PROGRESSION_MAX_BREAKTHROUGH_STAT) {
                throw new Error(`${breakthroughStat} has reached the absolute breakthrough cap of ${PROGRESSION_MAX_BREAKTHROUGH_STAT}.`);
            }
            root.pendingAdvancement.choice = 'breakthrough';
        } else if (action === 'choose-swap-ability') {
            root.pendingAdvancement.choice = 'swapAbility';
            root.pendingAdvancement.abilityOptions = Array.isArray(root.pendingAdvancement.abilityOptions) ? root.pendingAdvancement.abilityOptions : [];
        } else if (action === 'choose-learn-spell') {
            const stats = getPlayerCoreStats(context) || getPersonaCoreStats(context);
            const spells = extractPersonaSpells(getPersonaText(context));
            const spellCapacity = spellCapacityForMnd(stats?.MND);
            if (spellCapacity <= 0) throw new Error('Learning spells requires MND 7 or higher.');
            if (spells.length >= spellCapacity) throw new Error(`MND ${Number(stats?.MND || 0)} supports at most ${spellCapacity} learned spell${spellCapacity === 1 ? '' : 's'}.`);
            root.pendingAdvancement.choice = 'learnSpell';
            root.pendingAdvancement.spellOptions = Array.isArray(root.pendingAdvancement.spellOptions) ? root.pendingAdvancement.spellOptions : [];
        } else if (action === 'back') {
            root.pendingAdvancement.choice = 'choose';
        } else if (action === 'apply-stat') {
            await runPersonaMetadataTransaction(
                context,
                actionIdentity,
                () => applyProgressionStatChoice(root, details.stat, context, actionIdentity),
            );
            transactionPersisted = true;
        } else if (action === 'apply-breakthrough') {
            await runPersonaMetadataTransaction(
                context,
                actionIdentity,
                () => applyProgressionBreakthroughChoice(root, details.stat, details.sacrificeStat, context, actionIdentity),
            );
            transactionPersisted = true;
        } else if (action === 'generate-abilities') {
            state.progressionBusy = true;
            root.pendingAdvancement.swapAbilityIndex = getSelectedProgressionSwapAbilityIndex(context);
            renderProgressionCard(context);
            root.pendingAdvancement.abilityOptions = await requestProgressionAbilityOptions(root.pendingAdvancement, context);
            root.pendingAdvancement.abilityOptionsGeneratedAt = root.pendingAdvancement.abilityOptionsGeneratedAt || Date.now();
        } else if (action === 'generate-spells') {
            state.progressionBusy = true;
            renderProgressionCard(context);
            root.pendingAdvancement.spellOptions = await requestProgressionSpellOptions(root.pendingAdvancement, context);
            root.pendingAdvancement.spellOptionsGeneratedAt = root.pendingAdvancement.spellOptionsGeneratedAt || Date.now();
        } else if (action === 'choose-ability') {
            if (!Array.isArray(root.pendingAdvancement.abilityOptions) || !root.pendingAdvancement.abilityOptions.length) {
                root.pendingAdvancement.swapAbilityIndex = getSelectedProgressionSwapAbilityIndex(context);
            }
            await runPersonaMetadataTransaction(
                context,
                actionIdentity,
                () => applyProgressionAbilityChoice(root, Number(details.optionIndex), context, actionIdentity),
            );
            transactionPersisted = true;
        } else if (action === 'choose-spell') {
            await runPersonaMetadataTransaction(
                context,
                actionIdentity,
                () => applyProgressionSpellChoice(root, Number(details.optionIndex), context, actionIdentity),
            );
            transactionPersisted = true;
        }
        assertStoryEngineEpochCurrent(actionIdentity, 'Progression action expired because the active chat changed.');
        if (!transactionPersisted) await persistMetadata(context);
    } catch (error) {
        if (!isCurrentStoryEngineEpoch(actionIdentity)) return;
        const currentRoot = getProgressionRoot(context);
        if (!currentRoot) return;
        currentRoot.ui = currentRoot.ui || {};
        currentRoot.ui.error = error instanceof Error ? error.message : String(error);
        console.error(`[${EXTENSION_NAME}] progression action failed`, error);
        await persistMetadata(context);
    } finally {
        if (isCurrentStoryEngineEpoch(actionIdentity)) {
            state.progressionBusy = false;
            renderProgressionCard(context);
            refreshSettingsControls();
        }
    }
}

function updatePlayerIdentityOptionalFields(card) {
    if (!card) return;
    const raceIsCustom = card.querySelector('#spe_player_race')?.value === 'custom';
    const raceDescriptionMode = card.querySelector('#spe_player_race_description_mode')?.value || 'system';
    const additionalDetailsMode = card.querySelector('#spe_player_additional_details_mode')?.value || 'system';
    card.querySelectorAll('[data-spe-player-custom-race]').forEach(element => { element.hidden = !raceIsCustom; });
    card.querySelectorAll('[data-spe-player-race-description]').forEach(element => { element.hidden = !(raceIsCustom && raceDescriptionMode === 'user'); });
    card.querySelectorAll('[data-spe-player-additional-details]').forEach(element => { element.hidden = additionalDetailsMode !== 'user'; });
}


async function handlePlayerSetupAction(action, details = {}, context = getContext()) {
    if (!isStoryEngineEnabled()) {
        disableStoryEngineRuntime();
        return;
    }
    if (state.playerSetupBusy) return;
    const root = getPlayerRoot(context);
    if (!root) return;
    const actionIdentity = createStoryEngineEpochIdentity(context);
    let transactionPersisted = false;

    root.creator = root.creator || { stage: 'offer' };

    delete root.creator.error;



    try {

        if (action === 'start-new') {

            root.creator = buildNewCharacterPointBuyState();

        } else if (action === 'use-persona') {

            state.playerSetupBusy = true;

            renderPlayerSetupCard(context);

            const analysis = await analyzePersonaForPrimaryStat(context);

            root.creator = buildPersonaPointBuyState(analysis, getActiveAdventureGenre(context));

        } else if (action === 'skip-chat') {

            root.disabled = true;

            root.forceCreator = false;

        } else if (action === 'stat-plus') {

            adjustPlayerCreationStat(root.creator, details.stat, 1);

        } else if (action === 'stat-minus') {

            adjustPlayerCreationStat(root.creator, details.stat, -1);

        } else if (action === 'reset-stats') {

            resetPlayerCreationStats(root.creator);

        } else if (action === 'continue-stats') {

            root.creator.stats = normalizePlayerCreationStats(root.creator.stats || {});
            if (!isValidPlayerCreationStats(root.creator.stats)) {
                throw new Error(`Assign exactly ${PLAYER_CREATION_STAT_POINTS} points before continuing.`);
            }
            root.creator.stage = root.creator.flow === 'persona' ? 'persona-sheet' : 'identity';

        } else if (action === 'back-to-stats') {

            if (root.creator.flow === 'new' && root.creator.stage === 'identity') {
                syncIdentityInputs(root.creator, details.card || document);
            } else if (root.creator.flow === 'persona' && root.creator.stage === 'persona-sheet') {
                syncPlayerGenreInput(root.creator, details.card || document);
            }
            root.creator.stage = 'stats';

        } else if (action === 'generate-persona-sheet') {

            syncPlayerGenreInput(root.creator, details.card || document);

            state.playerSetupBusy = true;

            renderPlayerSetupCard(context);

            root.creator.retryNotes = [];

            root.creator.sheetText = await generateExistingPersonaCharacterSheet(root.creator, context);

            root.creator.stage = 'review';

        } else if (action === 'generate-sheet') {

            syncIdentityInputs(root.creator, details.card || document);

            state.playerSetupBusy = true;

            renderPlayerSetupCard(context);

            root.creator.retryNotes = [];

            root.creator.sheetText = await generateNewPlayerCharacterSheet(root.creator, context);

            root.creator.stage = 'review';

        } else if (action === 'retry-sheet') {

            state.playerSetupBusy = true;

            renderPlayerSetupCard(context);

            root.creator.retryNotes = buildRetryIdeaNotesFromSheetText(root.creator.sheetText || root.sheet?.text || '');

            root.creator.sheetText = root.creator.flow === 'persona'

                ? await generateExistingPersonaCharacterSheet(root.creator, context)

                : await generateNewPlayerCharacterSheet(root.creator, context);

            root.creator.stage = 'review';

        } else if (action === 'back-to-identity') {
            root.creator.stage = root.creator.flow === 'new' ? 'identity' : 'persona-sheet';
        } else if (action === 'approve-sheet') {
            await runPersonaMetadataTransaction(
                context,
                actionIdentity,
                () => approvePlayerSheet(root, context, actionIdentity),
            );
            transactionPersisted = true;
            notifySuccess('Player sheet inserted into the active persona.', EXTENSION_NAME, { timeOut: 6000 });
        } else if (action === 'back-from-adventure-start') {
            const flow = root.creator?.flow || (root.sheet?.source === 'existing_persona_conversion' ? 'persona' : 'new');
            root.ready = false;
            root.forceCreator = true;
            root.adventureStartPending = false;
            root.adventureStarted = false;
            delete root.adventureStartPrompt;
            delete root.adventureStartPromptCreatedAt;
            if (flow === 'persona') {
                root.creator = {
                    ...(root.creator || {}),
                    flow: 'persona',
                    stage: 'persona-sheet',
                    stats: isValidCoreStats(root.creator?.stats) ? normalizeCoreStats(root.creator.stats) : normalizeCoreStats(root.stats),
                    sheetText: root.creator?.sheetText || root.sheet?.text || '',
                    identity: {
                        ...(root.creator?.identity || {}),
                        genre: normalizePlayerAdventureGenre(root.creator?.identity?.genre || root.sheet?.genre || root.adventureGenre || 'Fantasy'),
                    },
                };
            } else {
                root.creator = {
                    ...(root.creator || {}),
                    flow: 'new',
                    stage: 'identity',
                    stats: isValidCoreStats(root.creator?.stats) ? normalizeCoreStats(root.creator.stats) : normalizeCoreStats(root.stats),
                    sheetText: root.creator?.sheetText || root.sheet?.text || '',
                    identity: {
                        ...(root.creator?.identity || {}),
                        genre: normalizePlayerAdventureGenre(root.creator?.identity?.genre || root.sheet?.genre || root.adventureGenre || 'Fantasy'),
                    },
                };
            }
        } else if (action === 'start-adventure') {
            const prompt = buildPlayerAdventureStartPrompt(root);
            if (submitPlayerAdventureStartPrompt(prompt, context, actionIdentity)) {
                root.adventureStartPrompt = prompt;
                root.adventureStarted = true;
                root.adventureStartPending = false;
                root.adventureStartedAt = Date.now();
                root.adventureStartPromptCreatedAt = root.adventureStartedAt;
            }
        } else if (action === 'dismiss-adventure-start') {
            root.adventureStartPending = false;
            root.adventureStartDismissedAt = Date.now();
        }
        assertStoryEngineEpochCurrent(actionIdentity, 'Player setup action expired because the active chat changed.');
        if (!transactionPersisted) await persistMetadata(context);
    } catch (error) {

        if (!isCurrentStoryEngineEpoch(actionIdentity)) return;

        const currentRoot = getPlayerRoot(context);
        if (!currentRoot) return;
        currentRoot.creator = currentRoot.creator || { stage: 'offer' };
        currentRoot.creator.error = error instanceof Error ? error.message : String(error);

        console.error(`[${EXTENSION_NAME}] player setup action failed`, error);

        await persistMetadata(context);

    } finally {
        if (isCurrentStoryEngineEpoch(actionIdentity)) {
            state.playerSetupBusy = false;
            renderPlayerSetupCard(context);
            refreshSettingsControls();
        }

    }

}

function adjustPlayerCreationStat(creator, stat, delta) {
    const statName = String(stat || '').toUpperCase();
    if (!PLAYER_STATS.includes(statName)) throw new Error('Choose a valid stat.');
    const amount = Math.sign(Number(delta) || 0);
    if (!amount) return;
    const stats = normalizePlayerCreationStats(creator.stats || {});
    const current = Number(stats[statName] || PLAYER_CREATION_MIN_STAT);
    if (amount > 0) {
        if (current >= PLAYER_CREATION_MAX_STAT || playerPointBuyRemaining(stats) <= 0) return;
        stats[statName] = current + 1;
    } else {
        if (current <= PLAYER_CREATION_MIN_STAT) return;
        stats[statName] = current - 1;
    }
    creator.stats = stats;
}

function resetPlayerCreationStats(creator) {
    creator.stats = creator.flow === 'persona'
        ? suggestedPersonaPointBuyStats(creator.personaAnalysis || {})
        : defaultPlayerPointBuyStats();
}



function syncPlayerSetupDraft(card, context = getContext()) {
    if (!card || !card.querySelector('#spe_player_sex, #spe_player_genre, #spe_player_race, #spe_player_race_specify, #spe_player_race_description_mode, #spe_player_race_description, #spe_player_additional_details_mode, #spe_player_additional_details')) return false;
    const root = getPlayerRoot(context);
    if (!root?.creator) return false;
    syncIdentityInputs(root.creator, card);
    saveMetadataDebounced(context);
    return true;
}

function syncIdentityInputs(creator, source = document) {
    creator.identity = creator.identity || {};
    delete creator.identity.characterName;
    const getField = id => source?.querySelector?.(`#${id}`) || null;
    const sexInput = getField('spe_player_sex');
    if (sexInput) creator.identity.sex = String(sexInput.value ?? '').trim();
    syncPlayerGenreInput(creator, source);
    const raceInput = getField('spe_player_race');
    const raceValue = raceInput
        ? String(raceInput.value ?? '')
        : (creator.identity.raceMode === 'pick' ? creator.identity.pickedRace : creator.identity.raceMode) || 'random';
    if (raceValue === 'custom') {
        creator.identity.raceMode = 'specify';
    } else if (raceValue === 'random') {
        creator.identity.raceMode = 'random';
    } else {
        creator.identity.raceMode = 'pick';
        creator.identity.pickedRace = PLAYER_RACE_CHOICES.includes(raceValue) ? raceValue : 'Human';
    }
    const specifiedRaceInput = getField('spe_player_race_specify');
    if (specifiedRaceInput) creator.identity.specifiedRace = String(specifiedRaceInput.value ?? '').trim();
    const raceDescriptionModeInput = getField('spe_player_race_description_mode');
    if (raceDescriptionModeInput) creator.identity.specifiedRaceDescriptionMode = raceDescriptionModeInput.value || 'system';
    const raceDescriptionInput = getField('spe_player_race_description');
    if (raceDescriptionInput) creator.identity.specifiedRaceDescription = String(raceDescriptionInput.value ?? '').trim();
    const additionalDetailsModeInput = getField('spe_player_additional_details_mode');
    const additionalDetailsInput = getField('spe_player_additional_details');
    if (additionalDetailsModeInput) {
        const additionalDetailsMode = additionalDetailsModeInput.value || 'system';
        creator.identity.additionalDetailsMode = additionalDetailsMode === 'user' ? 'user' : 'system';
    }
    if (additionalDetailsInput) creator.identity.additionalDetails = String(additionalDetailsInput.value ?? '').trim();
    delete creator.identity.appearance;
}

function syncPlayerGenreInput(creator, source = document) {
    creator.identity = creator.identity || {};
    const genreInput = source?.querySelector?.('#spe_player_genre');
    if (genreInput) creator.identity.genre = normalizePlayerAdventureGenre(genreInput.value);
}

function submitPlayerAdventureStartPrompt(prompt, context = getContext(), actionIdentity = null) {
    const text = String(prompt || '').trim();
    if (!text || !canGenerate(context)) {
        notifyError('Could not find SillyTavern generation API to start the adventure.', EXTENSION_NAME, { timeOut: 6000 });
        return false;
    }
    const requestIdentity = actionIdentity || createStoryEngineEpochIdentity(context);
    setTimeout(() => {
        void (async () => {
            if (!isStoryEngineEnabled() || !isCurrentStoryEngineEpoch(requestIdentity, context)) return;
            try {
                await generateSillyTavern('normal', {
                    automatic_trigger: true,
                    quiet_prompt: text,
                    quietToLoud: true,
                }, false, context);
            } catch (error) {
                if (!isCurrentStoryEngineEpoch(requestIdentity, context)) return;
                console.error(`[${EXTENSION_NAME}] adventure start failed`, error);
                const message = error instanceof Error ? error.message : String(error);
                notifyError(`Could not start adventure: ${message}`, EXTENSION_NAME, { timeOut: 7000 });
            }
        })();
    }, 0);
    return true;
}

async function approvePlayerSheet(root, context = getContext(), actionIdentity = null) {
    const creator = root.creator || {};
    const sheetText = String(creator.sheetText || buildPersonaStatsSheet(creator)).trim();
    if (!isValidCoreStats(creator.stats)) {
        throw new Error('Cannot approve player setup because the stat block is invalid.');
    }

    validatePlayerCreatorSheet(sheetText, creator);

    const personaWrite = await writePlayerSheetToPersona(sheetText, context, actionIdentity);
    if (actionIdentity) {
        assertStoryEngineEpochCurrent(actionIdentity, 'Player sheet approval expired because the active chat changed.');
    }

    root.ready = true;

    root.disabled = false;

    root.forceCreator = false;
    root.stats = normalizeCoreStats(creator.stats);
    root.personaBeforeSetup = root.personaBeforeSetup || personaWrite.previous || '';
    const genre = normalizePlayerAdventureGenre(creator.identity?.genre || 'Fantasy');
    root.adventureGenre = genre;
    root.adventureStartPending = true;
    root.adventureStarted = false;
    delete root.adventureStartPrompt;
    delete root.adventureStartPromptCreatedAt;
    root.sheet = {
        text: sheetText,
        source: creator.flow === 'persona' ? 'existing_persona_conversion' : 'generated_character',
        genre,
        approvedAt: Date.now(),
    };
    const trackerRoot = getTrackerRoot(context);
    if (trackerRoot) {
        trackerRoot.personaInventorySeeded = null;
        reseedPlayerTrackerFromPersona(trackerRoot, context);
    }
    root.creator = {
        ...clone(creator),
        stage: 'approved',
        sheetText,
    };
}

async function applyProgressionStatChoice(root, stat, context = getContext(), actionIdentity = null) {
    const statName = String(stat || '').toUpperCase();
    if (!PLAYER_STATS.includes(statName)) throw new Error('Choose a valid stat.');
    const stats = getPlayerCoreStats(context) || getPersonaCoreStats(context);
    if (!isValidCoreStats(stats)) throw new Error('Cannot raise a stat because the active persona has no valid PHY/MND/CHA block.');
    const breakthroughStat = normalizeBreakthroughStat(root?.breakthroughStat);
    if (statName === breakthroughStat) {
        throw new Error(`${statName} can advance only through another breakthrough after every stat is restored to ${PROGRESSION_MAX_STAT}.`);
    }
    if (Number(stats[statName]) >= PROGRESSION_MAX_STAT) {
        throw new Error(`${statName} is already at ${PROGRESSION_MAX_STAT}.`);
    }
    const nextStats = normalizeCoreStats({
        ...stats,
        [statName]: Number(stats[statName]) + 1,
    });
    const nextText = updatePersonaStatText(getPersonaText(context), statName, nextStats[statName]);
    await writePlayerSheetToPersona(nextText, context, actionIdentity);
    if (actionIdentity) {
        assertStoryEngineEpochCurrent(actionIdentity, 'Progression stat update expired because the active chat changed.');
    }
    syncPlayerRootAfterPersonaEdit(context, nextText, nextStats);
    completeProgressionAdvancement(root, {
        type: 'stat',
        stat: statName,
        value: nextStats[statName],
    }, context);
}

async function applyProgressionBreakthroughChoice(root, stat, sacrificeStat, context = getContext(), actionIdentity = null) {
    const statName = normalizeBreakthroughStat(stat);
    const sacrificeName = normalizeBreakthroughStat(sacrificeStat);
    const stats = getPlayerCoreStats(context) || getPersonaCoreStats(context);
    if (!isValidCoreStats(stats)) throw new Error('Cannot apply a breakthrough because the active persona has no valid PHY/MND/CHA block.');
    const persona = getPersonaText(context);
    const spells = extractPersonaSpells(persona);
    const existingBreakthroughStat = normalizeBreakthroughStat(root?.breakthroughStat);
    const nextStats = applyBreakthroughStatChange(stats, statName, sacrificeName, {
        existingBreakthroughStat,
        spellCount: spells.length,
    });
    const nextText = updatePersonaStatsText(persona, nextStats);
    await writePlayerSheetToPersona(nextText, context, actionIdentity);
    if (actionIdentity) {
        assertStoryEngineEpochCurrent(actionIdentity, 'Progression breakthrough update expired because the active chat changed.');
    }
    root.breakthroughStat = existingBreakthroughStat || statName;
    root.breakthroughChosenAt = root.breakthroughChosenAt || Date.now();
    syncPlayerRootAfterPersonaEdit(context, nextText, nextStats);
    completeProgressionAdvancement(root, {
        type: 'breakthrough',
        stat: statName,
        value: nextStats[statName],
        sacrificedStat: sacrificeName,
        sacrificedValue: nextStats[sacrificeName],
        initial: !existingBreakthroughStat,
    }, context);
}

async function applyProgressionAbilityChoice(root, optionIndex, context = getContext(), actionIdentity = null) {
    const pending = root?.pendingAdvancement;
    const options = Array.isArray(pending?.abilityOptions) ? pending.abilityOptions : [];
    const index = Math.max(0, Math.floor(Number(optionIndex)));
    const option = options[index];
    if (!option) throw new Error('Choose one of the generated ability options.');

    const persona = getPersonaText(context);
    const abilities = extractPersonaAbilities(persona);
    if (pending.choice !== 'swapAbility') {
        throw new Error('Choose an ability progression mode first.');
    }
    if (!abilities.length) {
        throw new Error('Could not find an existing ability to replace in the persona sheet.');
    }
    const nextText = replaceAbilityInPersona(persona, pending.swapAbilityIndex, option);

    await writePlayerSheetToPersona(nextText, context, actionIdentity);
    if (actionIdentity) {
        assertStoryEngineEpochCurrent(actionIdentity, 'Progression ability update expired because the active chat changed.');
    }
    syncPlayerRootAfterPersonaEdit(context, nextText, getPersonaCoreStats(context));
    completeProgressionAdvancement(root, {
        type: 'swapAbility',
        ability: option,
        replacedIndex: pending.swapAbilityIndex,
    }, context);
}

async function applyProgressionSpellChoice(root, optionIndex, context = getContext(), actionIdentity = null) {
    const pending = root?.pendingAdvancement;
    const options = Array.isArray(pending?.spellOptions) ? pending.spellOptions : [];
    const index = Math.max(0, Math.floor(Number(optionIndex)));
    const option = options[index];
    if (!option) throw new Error('Choose one of the generated spell options.');
    if (pending.choice !== 'learnSpell') {
        throw new Error('Choose spell progression mode first.');
    }

    const persona = getPersonaText(context);
    const stats = getPlayerCoreStats(context) || getPersonaCoreStats(context);
    const spells = extractPersonaSpells(persona);
    const spellCapacity = spellCapacityForMnd(stats?.MND);
    if (spellCapacity <= 0) throw new Error('Learning spells requires MND 7 or higher.');
    if (spells.length >= spellCapacity) throw new Error(`MND ${Number(stats?.MND || 0)} supports at most ${spellCapacity} learned spell${spellCapacity === 1 ? '' : 's'}.`);
    const nextText = appendSpellToPersona(persona, option);

    await writePlayerSheetToPersona(nextText, context, actionIdentity);
    if (actionIdentity) {
        assertStoryEngineEpochCurrent(actionIdentity, 'Progression spell update expired because the active chat changed.');
    }
    syncPlayerRootAfterPersonaEdit(context, nextText, stats);
    completeProgressionAdvancement(root, {
        type: 'learnSpell',
        spell: option,
        spellCount: spells.length + 1,
    }, context);
}

function completeProgressionAdvancement(root, reward, context = getContext()) {
    const pending = root?.pendingAdvancement;
    if (!root || !pending) return;
    const sourceIds = new Set(Array.isArray(pending.sourceRecordIds) ? pending.sourceRecordIds : []);
    const spendById = new Map();
    for (const item of Array.isArray(pending.sourceRecordXp) ? pending.sourceRecordXp : []) {
        const id = String(item?.id || '').trim();
        const xp = Math.max(0, Math.floor(Number(item?.xp || 0)));
        if (!id || xp <= 0) continue;
        spendById.set(id, (spendById.get(id) || 0) + xp);
    }
    root.accomplishments = (root.accomplishments || []).map(record => {
        const normalized = normalizeProgressionRecord(record);
        if (!normalized) return record;
        const award = progressionRecordXpAward(normalized);
        const spend = spendById.has(normalized.id)
            ? spendById.get(normalized.id)
            : sourceIds.has(normalized.id)
                ? award
                : 0;
        if (spend <= 0) return normalized;
        const xpSpent = clampNumber(progressionRecordXpSpent(normalized) + spend, 0, award, award);
        return {
            ...normalized,
            xpSpent,
            spent: xpSpent >= award,
            ...(xpSpent >= award ? { spentAt: Date.now() } : {}),
        };
    }).filter(Boolean);
    root.spentAdvancements = Math.max(0, Math.floor(Number(root.spentAdvancements || 0))) + 1;
    root.lastAdvancement = {
        id: pending.id,
        reward,
        resolvedAt: Date.now(),
    };
    root.pendingAdvancement = null;
    root.ui = {};
    const trackerRoot = getTrackerRoot(context);
    if (trackerRoot) {
        applyProgressionHealthMilestone(trackerRoot, getCurrentAdventuringCompanionNames(trackerRoot));
    }
}

function getCurrentAdventuringCompanionNames(trackerRoot) {
    const npcs = trackerRoot?.npcs && typeof trackerRoot.npcs === 'object' ? trackerRoot.npcs : {};
    return Object.entries(npcs)
        .filter(([, entry]) => {
            const normalized = normalizeTrackerEntry(entry || {});
            const disposition = normalized.currentDisposition || {};
            const bond = Number(disposition.B || 0);
            const active = normalized.lifecycle === 'Active';
            const established = normalized.establishedRelationship === 'Y';
            const companionCoded = /\b(companion|ally|party|partner|travels?\s+with|adventur(?:e|er|ing)|follower|retainer|teammate)\b/i.test([
                normalized.personalitySummary,
                normalized.userHistory,
                normalized.socialResolutionMemory ? JSON.stringify(normalized.socialResolutionMemory) : '',
            ].filter(Boolean).join(' '));
            return active && (established || companionCoded || bond >= 4);
        })
        .map(([name]) => name);
}

function getSelectedProgressionSwapAbilityIndex(context = getContext()) {
    const raw = typeof document !== 'undefined'
        ? document.getElementById('spe_progression_swap_ability')?.value
        : null;
    const selected = Number(raw);
    if (Number.isInteger(selected) && selected >= 0) return selected;
    const pending = getProgressionRoot(context)?.pendingAdvancement;
    const stored = Number(pending?.swapAbilityIndex);
    return Number.isInteger(stored) && stored >= 0 ? stored : 0;
}

async function requestProgressionAbilityOptions(pending, context = getContext()) {
    if (!isStoryEngineEnabled()) {
        throw new Error('Story Engine is disabled.');
    }
    if (Array.isArray(pending?.abilityOptions) && pending.abilityOptions.length === PROGRESSION_ABILITY_OPTIONS) {
        return pending.abilityOptions;
    }
    const prompt = buildProgressionAbilityPrompt(pending, context);
    const raw = await requestProgressionText(prompt, 1700, {
        temperature: 0.45,
        stop: ['END_PROGRESSION_ABILITIES'],
        stopping_strings: ['END_PROGRESSION_ABILITIES'],
        stop_sequence: ['END_PROGRESSION_ABILITIES'],
    });
    return parseProgressionAbilityOptions(raw);
}

async function requestProgressionSpellOptions(pending, context = getContext()) {
    if (!isStoryEngineEnabled()) {
        throw new Error('Story Engine is disabled.');
    }
    if (Array.isArray(pending?.spellOptions) && pending.spellOptions.length === PROGRESSION_SPELL_OPTIONS) {
        return pending.spellOptions;
    }
    const prompt = buildProgressionSpellPrompt(pending, context);
    const raw = await requestProgressionText(prompt, 1700, {
        temperature: 0.45,
        stop: ['END_PROGRESSION_SPELLS'],
        stopping_strings: ['END_PROGRESSION_SPELLS'],
        stop_sequence: ['END_PROGRESSION_SPELLS'],
    });
    return parseProgressionSpellOptions(raw);
}

function buildProgressionAbilityPrompt(pending, context = getContext()) {
    const persona = getPersonaText(context);
    const abilities = extractPersonaAbilities(persona);
    const spells = extractPersonaSpells(persona);
    const stats = getPlayerCoreStats(context) || getPersonaCoreStats(context) || {};
    const genre = getActiveAdventureGenre(context);
    const powerProfile = getCharacterSheetPowerProfile(genre);
    const recent = getProgressionRecentAccomplishments(getProgressionRoot(context), pending);
    const replacing = pending?.choice === 'swapAbility'
        ? abilities[Math.max(0, Math.floor(Number(pending.swapAbilityIndex || 0)))]
        : null;
    const retryNotes = Array.isArray(pending?.retryNotes) ? pending.retryNotes : [];
    return [
        {
            role: 'system',
            content:
                'You generate concise RPG character ability options for a deterministic SillyTavern extension.\n\n' +
                buildAbilityGenerationRules(
                    `Generate exactly ${PROGRESSION_ABILITY_OPTIONS} meaningfully different replacement ability options.`,
                    powerProfile,
                ) + '\n\n' +
                'Adapt each option to the character race, body, origin, selected genre, existing entries, and recent accomplishments. Stats may inform flavor but must never become a stat boost or an amplified ordinary action. Choose varied concepts from that context; do not copy a stock template or repeat an existing concept. ' +
                'Runtime mechanics decide dangerous or contested outcomes. On retry, avoid every item in PRIOR RETRY NOTES and produce a genuinely different concept, not a renamed or cosmetically altered version of the last attempt.',
        },
        {
            role: 'user',
            content:
                'Return only this compact block. No markdown before or after it.\n' +
                'BEGIN_PROGRESSION_ABILITIES\n' +
                'Option1Name=short ability name\n' +
                'Option1Description=one or two plain sentences stating what the ability does, with no mechanics, measurements, or outcome guarantees\n' +
                'Option2Name=short ability name\n' +
                'Option2Description=one or two plain sentences stating what the ability does, with no mechanics, measurements, or outcome guarantees\n' +
                'Option3Name=short ability name\n' +
                'Option3Description=one or two plain sentences stating what the ability does, with no mechanics, measurements, or outcome guarantees\n' +
                'END_PROGRESSION_ABILITIES\n\n' +
                'MODE: SWAP_ABILITY\n' +
                `SELECTED GENRE: ${genre}\n` +
                `${retryNotes.length ? `PRIOR RETRY NOTES:\n${retryNotes.map((note, index) => `${index + 1}. ${note}`).join('\n')}\n\n` : ''}` +
                `LOCKED STATS: ${PLAYER_STATS.map(stat => `${stat} ${stats?.[stat] ?? 'unknown'}`).join(', ')}\n` +
                `EXISTING ABILITIES:\n${abilities.length ? abilities.map((ability, index) => `${index + 1}. ${ability.text}`).join('\n') : 'none'}\n\n` +
                `EXISTING SPELLS:\n${spells.length ? spells.map((spell, index) => `${index + 1}. ${spell.text}`).join('\n') : 'none'}\n\n` +
                `${replacing ? `ABILITY BEING REPLACED:\n${replacing.text}\n\n` : ''}` +
                `RECENT ADVANCEMENT ACCOMPLISHMENTS:\n${recent.length ? recent.map((record, index) => `${index + 1}. ${formatProgressionRecordForPrompt(record)}`).join('\n') : 'none'}\n\n` +
                `PERSONA SHEET:\n${clipText(persona, 5000)}`,
        },
    ];
}

function buildProgressionSpellPrompt(pending, context = getContext()) {
    const persona = getPersonaText(context);
    const abilities = extractPersonaAbilities(persona);
    const spells = extractPersonaSpells(persona);
    const stats = getPlayerCoreStats(context) || getPersonaCoreStats(context) || {};
    const genre = getActiveAdventureGenre(context);
    const powerProfile = getCharacterSheetPowerProfile(genre);
    const recent = getProgressionRecentAccomplishments(getProgressionRoot(context), pending);
    const retryNotes = Array.isArray(pending?.retryNotes) ? pending.retryNotes : [];
    const spellCapacity = spellCapacityForMnd(stats?.MND);
    return [
        {
            role: 'system',
            content:
                'You generate concise RPG spell options for a deterministic SillyTavern extension.\n\n' +
                buildSpellGenerationRules(
                    `Generate exactly ${PROGRESSION_SPELL_OPTIONS} meaningfully different learnable spell options.`,
                    powerProfile,
                ) + '\n\n' +
                'Adapt each option to the character, selected genre, existing entries, and recent accomplishments. Choose varied concepts from that context; do not copy a stock template or repeat an existing concept. ' +
                'Runtime mechanics decide dangerous or contested outcomes. On retry, avoid every item in PRIOR RETRY NOTES and produce a genuinely different concept, not a renamed or cosmetically altered version of the last attempt.',
        },
        {
            role: 'user',
            content:
                'Return only this compact block. No markdown before or after it.\n' +
                'BEGIN_PROGRESSION_SPELLS\n' +
                'Option1Name=short spell name\n' +
                'Option1Description=one or two plain sentences stating what the spell does, with no mechanics, measurements, or outcome guarantees\n' +
                'Option2Name=short spell name\n' +
                'Option2Description=one or two plain sentences stating what the spell does, with no mechanics, measurements, or outcome guarantees\n' +
                'Option3Name=short spell name\n' +
                'Option3Description=one or two plain sentences stating what the spell does, with no mechanics, measurements, or outcome guarantees\n' +
                'END_PROGRESSION_SPELLS\n\n' +
                'MODE: LEARN_SPELL\n' +
                `SELECTED GENRE: ${genre}\n` +
                `${retryNotes.length ? `PRIOR RETRY NOTES:\n${retryNotes.map((note, index) => `${index + 1}. ${note}`).join('\n')}\n\n` : ''}` +
                `LOCKED STATS: ${PLAYER_STATS.map(stat => `${stat} ${stats?.[stat] ?? 'unknown'}`).join(', ')}\n` +
                `SPELL LIMIT: current ${spells.length}; current MND capacity ${spellCapacity}; absolute maximum ${PROGRESSION_MAX_SPELLS}\n` +
                `EXISTING ABILITIES:\n${abilities.length ? abilities.map((ability, index) => `${index + 1}. ${ability.text}`).join('\n') : 'none'}\n\n` +
                `EXISTING SPELLS:\n${spells.length ? spells.map((spell, index) => `${index + 1}. ${spell.text}`).join('\n') : 'none'}\n\n` +
                `RECENT ADVANCEMENT ACCOMPLISHMENTS:\n${recent.length ? recent.map((record, index) => `${index + 1}. ${formatProgressionRecordForPrompt(record)}`).join('\n') : 'none'}\n\n` +
                `PERSONA SHEET:\n${clipText(persona, 5000)}`,
        },
    ];
}

function getProgressionRecentAccomplishments(root, pending) {
    const ids = new Set(Array.isArray(pending?.sourceRecordIds) ? pending.sourceRecordIds : []);
    const source = Array.isArray(root?.accomplishments) ? root.accomplishments : [];
    const selected = source.filter(record => ids.has(record.id));
    return (selected.length ? selected : source.filter(record => progressionRecordUnspentXp(record) > 0))
        .slice(-PROGRESSION_CONTEXT_RECORD_LIMIT);
}

function formatProgressionRecordForPrompt(record) {
    return [
        `userAction=${clipText(record?.userText || '', 220) || 'unknown'}`,
        `goal=${record?.goal || 'unknown'}`,
        `stat=${record?.stat || 'unknown'}`,
        `targets=${Array.isArray(record?.targets) && record.targets.length ? record.targets.join(', ') : 'none'}`,
        `outcome=${record?.outcomeTier || 'unknown'}`,
    ].join('; ');
}

function progressionXpAwardForOutcomeTier(outcomeTier) {
    const key = String(outcomeTier || '').trim();
    return PROGRESSION_XP_AWARDS[key] || 0;
}

function progressionXpAwardFromPendingRun(pendingRun) {
    const packet = pendingRun?.resolutionPacket || pendingRun?.report?.finalNarrativeHandoff?.resolutionPacket || {};
    if (packet.RollNeeded !== 'Y') return 0;
    return progressionXpAwardForOutcomeTier(packet.OutcomeTier);
}

function progressionRecordXpAward(record) {
    const explicit = Number(record?.xpAward);
    if (Number.isFinite(explicit) && explicit > 0) {
        return clampNumber(explicit, 0, PROGRESSION_MILESTONE_XP, 0);
    }
    return progressionXpAwardForOutcomeTier(record?.outcomeTier);
}

function progressionRecordXpSpent(record) {
    const award = progressionRecordXpAward(record);
    if (award <= 0) return 0;
    const explicit = Number(record?.xpSpent);
    if (record?.spent && (!Number.isFinite(explicit) || explicit <= 0)) return award;
    return clampNumber(explicit, 0, award, 0);
}

function progressionRecordUnspentXp(record) {
    return Math.max(0, progressionRecordXpAward(record) - progressionRecordXpSpent(record));
}

function normalizeProgressionRecord(record) {
    if (!record || typeof record !== 'object') return null;
    const id = String(record.id || '').trim();
    if (!id) return null;
    const xpAward = progressionRecordXpAward(record);
    const xpSpent = progressionRecordXpSpent(record);
    return {
        ...record,
        xpAward,
        xpSpent,
        spent: xpAward > 0 && xpSpent >= xpAward,
    };
}

function selectProgressionMilestoneSourceRecords(root) {
    let remaining = PROGRESSION_MILESTONE_XP;
    const sourceRecords = [];
    for (const record of Array.isArray(root?.accomplishments) ? root.accomplishments : []) {
        const available = progressionRecordUnspentXp(record);
        if (available <= 0) continue;
        const xp = Math.min(available, remaining);
        sourceRecords.push({ id: record.id, xp });
        remaining -= xp;
        if (remaining <= 0) break;
    }
    return remaining <= 0 ? sourceRecords : [];
}

function maybeCreateProgressionPendingAdvancement(root) {
    if (!root || root.pendingAdvancement) return false;
    const sourceRecords = selectProgressionMilestoneSourceRecords(root);
    if (!sourceRecords.length) return false;
    root.pendingAdvancement = {
        id: `adv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        createdAt: Date.now(),
        choice: 'choose',
        sourceRecordIds: sourceRecords.map(item => item.id),
        sourceRecordXp: sourceRecords,
        abilityOptions: [],
        spellOptions: [],
    };
    root.ui = {};
    return true;
}

function maybeRecordProgressionAccomplishment({ pendingRun, messageKey, context = getContext() } = {}) {
    if (!isStoryEngineEnabled()) return false;
    if (getSettings().characterProgressionEnabled === false) return false;
    if (!pendingRun || !messageKey) return false;
    const root = getProgressionRoot(context);
    if (!root || root.pendingAdvancement) return false;

    const existing = root.accomplishments.filter(record => record.messageKey === messageKey);
    if (existing.some(record => progressionRecordXpSpent(record) > 0)) {
        return false;
    }

    const removedIds = new Set(existing.map(record => record.id));
    root.accomplishments = root.accomplishments.filter(record => record.messageKey !== messageKey);
    if (root.pendingAdvancement?.sourceRecordIds?.some(id => removedIds.has(id))) {
        root.pendingAdvancement = null;
        root.ui = {};
    }

    if (progressionXpAwardFromPendingRun(pendingRun) <= 0) return existing.length > 0;

    const record = buildProgressionAccomplishmentRecord(pendingRun, messageKey);
    root.accomplishments.push(record);
    root.accomplishments = root.accomplishments
        .map(normalizeProgressionRecord)
        .filter(Boolean)
        .slice(-PROGRESSION_RECORD_HISTORY_LIMIT);
    maybeCreateProgressionPendingAdvancement(root);
    return true;
}

function buildProgressionAccomplishmentRecord(pendingRun, messageKey) {
    const packet = pendingRun?.resolutionPacket || pendingRun?.report?.finalNarrativeHandoff?.resolutionPacket || {};
    const resultLine = String(pendingRun?.report?.finalNarrativeHandoff?.resultLine || '');
    const xpAward = progressionXpAwardFromPendingRun(pendingRun);
    return {
        id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        messageKey,
        createdAt: Date.now(),
        spent: false,
        xpAward,
        xpSpent: 0,
        userText: String(pendingRun?.latestUserText || '').trim(),
        goal: String(packet.GOAL || 'unknown'),
        stat: parseUserStatFromResultLine(resultLine),
        targets: uniqueNames([
            ...toRealNameArray(packet.ActionTargets),
            ...toRealNameArray(packet.OppTargets?.NPC),
            ...toRealNameArray(packet.OppTargets?.ENV),
            ...toRealNameArray(packet.BenefitedObservers),
            ...toRealNameArray(packet.HarmedObservers),
        ]).slice(0, 8),
        outcomeTier: String(packet.OutcomeTier || 'unknown'),
        outcome: String(packet.Outcome || 'unknown'),
    };
}

function parseUserStatFromResultLine(resultLine) {
    const match = /\+\s*(PHY|MND|CHA)\s*\(/i.exec(String(resultLine || ''));
    return match ? match[1].toUpperCase() : 'unknown';
}

function removeProgressionRecordsForMessage(messageKey, context = getContext()) {
    const root = getProgressionRoot(context);
    if (!root || !messageKey) return false;
    const before = root.accomplishments.length;
    const removedIds = new Set(root.accomplishments.filter(record => record.messageKey === messageKey).map(record => record.id));
    root.accomplishments = root.accomplishments.filter(record => record.messageKey !== messageKey);
    if (root.pendingAdvancement?.sourceRecordIds?.some(id => removedIds.has(id))) {
        root.pendingAdvancement = null;
        root.ui = {};
    }
    return root.accomplishments.length !== before;
}


function splitMessageKey(messageKey) {
    const value = String(messageKey || '');
    const separator = value.lastIndexOf(':');
    if (separator < 0) return { chatId: '', messageId: NaN };
    return {
        chatId: value.slice(0, separator),
        messageId: Number(value.slice(separator + 1)),
    };
}


function removeProgressionRecordsAtOrAfterMessageId(chatId, firstMessageId, context = getContext()) {
    const root = getProgressionRoot(context);
    if (!root) return false;
    const affectedKeys = new Set();
    for (const record of root.accomplishments) {
        const parsed = splitMessageKey(record?.messageKey);
        if (parsed.chatId === chatId && Number.isFinite(parsed.messageId) && parsed.messageId >= firstMessageId) {
            affectedKeys.add(record.messageKey);
        }
    }
    let changed = false;
    for (const key of affectedKeys) {
        changed = removeProgressionRecordsForMessage(key, context) || changed;
    }
    return changed;
}

async function requestProgressionText(prompt, responseLength, overridePayload = {}) {
    if (!isStoryEngineEnabled()) {
        throw new Error('Story Engine is disabled.');
    }
    const context = getContext();
    const requestIdentity = createStoryEngineEpochIdentity(context);
    const bypassToken = promptReadyBypassGate.acquire();
    try {
        return await withStoryEngineModelRequest(async modelRequest => {
            const textPrompt = Array.isArray(prompt)
                ? prompt.map(message => `${String(message.role || 'user').toUpperCase()}:\n${String(message.content || '')}`).join('\n\n')
                : String(prompt || '');
            return await generateRawData({ prompt: textPrompt, responseLength, ...overridePayload }, context, {
                purpose: 'progression generation',
                signal: modelRequest.signal,
                beforeAbort: markInternalGenerationStop,
            });
        }, {
            isCurrent: () => isCurrentStoryEngineEpoch(requestIdentity, context),
            expiredMessage: 'Progression generation expired because the active chat changed.',
        });
    } finally {
        promptReadyBypassGate.release(bypassToken);
    }
}

function parseProgressionAbilityOptions(raw) {
    const text = extractGeneratedText(raw);
    const fields = {};
    for (const line of text.split(/\r?\n/)) {
        const match = /^Option([123])(Name|Description|Text)\s*=\s*(.+)$/i.exec(line.trim());
        if (!match) continue;
        const index = Number(match[1]) - 1;
        fields[index] = fields[index] || {};
        const key = match[2].toLowerCase() === 'name' ? 'name' : 'description';
        fields[index][key] = String(match[3] || '').trim();
    }
    const options = [0, 1, 2].map(index => sanitizeProgressionAbilityOption(fields[index]));
    if (options.some(option => !option)) {
        throw new Error('Progression ability generation did not return three valid options.');
    }
    const names = new Set();
    for (const option of options) {
        const key = option.name.toLowerCase();
        if (names.has(key)) throw new Error('Progression ability generation returned duplicate options.');
        names.add(key);
    }
    return options;
}

function parseProgressionSpellOptions(raw) {
    const text = extractGeneratedText(raw);
    const fields = {};
    for (const line of text.split(/\r?\n/)) {
        const match = /^Option([123])(Name|Description|Text)\s*=\s*(.+)$/i.exec(line.trim());
        if (!match) continue;
        const index = Number(match[1]) - 1;
        fields[index] = fields[index] || {};
        const key = match[2].toLowerCase() === 'name' ? 'name' : 'description';
        fields[index][key] = String(match[3] || '').trim();
    }
    const options = [0, 1, 2].map(index => sanitizeProgressionSpellOption(fields[index]));
    if (options.some(option => !option)) {
        throw new Error('Progression spell generation did not return three valid options.');
    }
    const names = new Set();
    for (const option of options) {
        const key = option.name.toLowerCase();
        if (names.has(key)) throw new Error('Progression spell generation returned duplicate options.');
        names.add(key);
    }
    return options;
}

function sanitizeProgressionAbilityOption(option) {
    const name = cleanAbilityName(option?.name);
    const description = String(option?.description || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!name || !description) return null;
    if (hasProgressionMechanicalLanguage(description)) {
        throw new Error(`Generated ability "${name}" included mechanical language.`);
    }
    return { name, description: clipText(description, 520) };
}

function sanitizeProgressionSpellOption(option) {
    const name = cleanAbilityName(option?.name);
    const description = String(option?.description || '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!name || !description) return null;
    if (hasProgressionMechanicalLanguage(description)) {
        throw new Error(`Generated spell "${name}" included mechanical language.`);
    }
    return { name, description: clipText(description, 520) };
}

function hasProgressionMechanicalLanguage(value) {
    const text = String(value || '').toLowerCase();
    return /(?:^|[^\w])[-+]?\d+\s*(?:to|bonus|modifier|mod|uses?|times?|rounds?|turns?|seconds?|minutes?|hours?|days?|feet|foot|ft|yards?|meters?|metres?|miles?|paces?|steps?|squares?|tiles?|hexes?|radius|range|area|cone|line|sphere|cube|points?|hp|hit points?|damage|defense|defence|armor|armour|ac|dc|difficulty|rolls?|checks?|saves?|saving throws?|percent|%)(?=$|[^\w])/.test(text)
        || /(?:^|[^\w])(?:advantage|disadvantage|cooldowns?|uses?\s+per|times?\s+per|per\s+(?:day|scene|turn|round|rest)|once\s+per|twice\s+per|rerolls?|dice|die|d20|d12|d10|d8|d6|d4|dc|difficulty class|armor class|hit points?|hp|feet|foot|ft|yards?|meters?|metres?|miles?|radius|range)(?=$|[^\w])/.test(text)
        || /(?:^|[^\w])[-+]\d+(?=$|[^\w])/.test(text);
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
    const genre = normalizePlayerAdventureGenre(identity.genre || 'Fantasy');
    const generationOptions = {
        mode: 'new',
        stats,
        fixedRace: getLockedPlayerCreatorRace(identity),
        fixedUserNonHuman: getLockedPlayerCreatorUserNonHuman(identity),
        genre,
        explicitAnchorSource: getNewCharacterExplicitAnchorSource(identity),
        explicitAppearanceSource: getNewCharacterExplicitAppearanceSource(identity),
    };
    const retryNotes = Array.isArray(creator.retryNotes) ? creator.retryNotes : [];
    const statInstruction = buildNewCharacterStatInstruction(stats);
    const genreInstruction = buildNewCharacterGenreInstruction(identity);
    const raceInstruction = buildNewCharacterRaceInstruction(identity);
    const nameInstruction = buildNewCharacterNameInstruction();
    const sexInstruction = buildNewCharacterSexInstruction(identity);
    const additionalDetailsInstruction = buildNewCharacterAdditionalDetailsInstruction(identity);
    const powerProfile = getCharacterSheetPowerProfile(genre);
    const possessionInstructions = genre === 'Isekai'
        ? [
            'INVENTORY: modern-Earth belongings carried or stowed at the moment of transition only: plausible personal supplies, tools, consumables, documents, containers, travel goods, and other possessions the character could have had before reincarnation. Exclude worn or equipped items and currency. Do not invent fantasy, magical, or new-world supplies, tools, weapons, or equipment unless the user explicitly supplied them.',
            'CURRENCY: always return an empty array for a new Isekai character. The character arrives with no new-world money; currency is acquired through play. Do not invent or convert Earth money into new-world currency.',
            'GEAR: modern-Earth clothing and other worn or equipped items the character possessed at the moment of transition only. Do not invent fantasy weapons, armor, adventuring equipment, magical items, or other new-world possessions unless the user explicitly supplied them.',
        ].join('\n')
        : [
            'INVENTORY: carried or stowed items only: supplies, tools, consumables, documents, containers, travel goods, and other possessions not currently worn/equipped. Do not list clothing worn on the body, armor, weapons worn ready, currency, natural weapons, body armaments, claws, fangs, horns, talons, tusks, tails, stingers, jaws, or other anatomy here.',
            'CURRENCY: money only, using the genre currency when possible. For fantasy use silver (sv), for modern use dollars ($), for cyberpunk use credits (cr), and otherwise choose a simple fitting currency. Write exact starting money such as 12 sv, $40, or 30 cr. Use an empty array if none. Do not put currency in INVENTORY or GEAR.',
            'GEAR: worn, equipped, or immediately ready items only: clothing, armor, boots, cloak, belt, pouches, weapons, sheaths, jewelry, visible tools worn on the body, or other equipped objects. Do not list currency, carried supplies, pack contents, natural weapons, or body anatomy here. Do not casually add magic items, self-guiding tools, special artifacts, weapons, or supernatural equipment unless the fixed background, race, genre, or single activated ability specifically justifies them.',
        ].join('\n');
    const prompt = [
        {
            role: 'system',
            content:
                'You generate a SillyTavern user persona character sheet for roleplay. ' +
                'This is a playable user character shell, not an authored protagonist. Fill only fixed starting facts the user can step into. ' +
                'Do not decide future choices, personality, habits, emotional reactions, combat preferences, social strategy, morals, goals, fears, or how the character will behave in play. ' +
                'The numeric stats are locked and must be copied exactly. Do not reroll, rebalance, or assign new numbers. ' +
                'Generate concrete details with enough specificity to use as a full persona sheet. Keep ordinary background, appearance, inventory, currency, and gear concise, factual, and grounded in the character, genre, and setting; reserve richer creative description for ability and spell concepts. Abilities and spells must follow the selected genre power direction.',
        },
        {
            role: 'user',
            content:
                'Produce the complete character-sheet data through the required structured output. Do not write Markdown, a preface, or questions. Supply plain field values only; deterministic code owns the final headings, order, labels, name, and locked stats.\n\n' +
                `LOCKED STATS:\nPHY: ${stats.PHY}\nMND: ${stats.MND}\nCHA: ${stats.CHA}\n\n` +
                `${statInstruction}\n${genreInstruction}\n${nameInstruction}\n${sexInstruction}\n${raceInstruction}\n${additionalDetailsInstruction}\n\n` +
                `${retryNotes.length ? `PRIOR IDEAS TO AVOID:\n${retryNotes.map((note, index) => `${index + 1}. ${note}`).join('\n')}\n\n` : ''}` +
                'Required structured fields:\n' +
                'BASIC INFO: Race, Bloodline if relevant, UserNonHuman Y/N, Gender, Age as one integer, and fixed origin, prior role, or prior training if relevant. Prior Role / Training must be one concise fixed fact. Preserve any explicit user-supplied role faithfully without broadening it into extra expertise, mastery, or unrelated knowledge; otherwise generate only a grounded minimal role appropriate to age, origin, and genre. Do not include personality, future plans, preferred behavior, or emotional tendencies. Use an empty string only for an inapplicable optional text field.\n' +
                'APPEARANCE: visible physical facts only: height, build, hair, eyes, skin, clothing, carried look, visible natural weapons/body armaments when the race or body supports them, and other visible features. Return each fact as one concise, objective label/detail pair. Include exactly one Height entry containing a numeric measurement in feet/inches, centimeters, or both; never use relative descriptions, comparisons, age-relative wording, posture, build language, or decorative prose as Height. Build must be one compact physical description without subjective commentary. Eyes may state color and fixed physical traits but not a habitual gaze or implied personality. Skin may state tone and visible physical qualities but must not assert scars, marks, or their absence unless explicitly supplied. Face must use concrete physical features without beauty judgments. Hands must use physical characteristics only and must not infer strength, history, skill, or behavior. Do not invent scars or permanent marks; preserve them only when explicitly supplied by the user. Do not describe behavior, habits, posture-as-personality, emotional reactions, nervous tells, voice behavior, or how the character usually acts. Appearance must reflect PHY when relevant and must not default to lean, wiry, slender, or lithe unless the stat shape and concept justify it.\n' +
                'NATURAL WEAPONS: concrete offensive body parts only, if any. Use an empty array when the race/body has no clear natural weapon. Natural weapons are body facts, not racial traits, gear, inventory, equipment, held objects, abilities, or spells; they permit physically plausible ordinary bodily attacks but give no mechanical bonus, automatic success, extra damage rule, or special wound rule. Do not write passive traits, resistance, immunity, durability, damage reduction, harder to injure, harder to exhaust, pain tolerance, better senses, night vision, wings, gills, tail unless used as a weapon, better at a skill, better at fighting, better at persuasion, intimidation aura, advantage, dice modifiers, automatic success, conditional mini-abilities, triggered powers, learned expertise, or disguised abilities.\n' +
                `ABILITIES:\n${buildAbilityGenerationRules(`Generate exactly ${PROGRESSION_REQUIRED_ABILITIES} ability entry.`, powerProfile)}\nFit the result to the character's race, body, origin, genre, and concept, but do not turn any stat into an amplified ordinary action. Choose a varied concept rather than copying a stock template or example. On retry, avoid every item in PRIOR IDEAS TO AVOID and create a genuinely different concept, not a renamed or cosmetically altered version of the last attempt.\n` +
                `SPELLS:\n${buildSpellGenerationRules(`Generate exactly ${PLAYER_CREATION_MAX_STARTING_SPELLS} starting spell entry when MND is 7 or higher; otherwise return an empty array.`, powerProfile)}\nFit the result to the selected genre, character, and concept. Choose a varied concept rather than copying a stock template or example. On retry, avoid every item in PRIOR IDEAS TO AVOID and create a genuinely different concept, not a renamed or cosmetically altered version of the last attempt.\n` +
                `${possessionInstructions}\n` +
                'CHARACTER ANCHORS: include only explicit user-provided durable facts that cannot fit BASIC INFO, APPEARANCE, STATS, NATURAL WEAPONS, ABILITIES, SPELLS, INVENTORY, CURRENCY, or GEAR. Otherwise return an empty array. Do not invent anchor content, summarize or repeat another section, interpret stats, add meta-disclaimers, invent unresolved hooks, or restate the selected genre premise. For Isekai, deterministic rendering supplies the required death-and-reincarnation premise.',
        },
    ];
    const payload = await requestPlayerSetupStructured(prompt, PLAYER_SETUP_SHEET_RESPONSE_LENGTH, generationOptions, {
        temperature: 0.7,
    }, context);
    const sheetText = renderCharacterSheet(payload, generationOptions);
    validatePlayerCreatorSheet(sheetText, creator);
    return sheetText;

}

function getPlayerSetupPersonaName() {
    return '{{user}}';
}

function buildNewCharacterNameInstruction() {
    return `Deterministic rendering uses {{user}} exactly as the character name. {{user}} resolves to the current SillyTavern persona name. Do not generate, rename, translate, or embellish the character name.`;
}

function buildNewCharacterSexInstruction(identity = {}) {
    const sex = String(identity.sex || '').trim();
    if (sex) {
        return `Use this character sex exactly: ${sex}.`;
    }
    return 'Generate a fitting character sex or leave it unspecified.';
}

function buildNewCharacterAdditionalDetailsInstruction(identity = {}) {
    const details = String(identity.additionalDetails || identity.appearance || '').trim();
    if (identity.additionalDetailsMode === 'user' && details) {
        return [
            'The user-provided additional character details are locked starting facts. Preserve every explicit fact, relationship, limitation, named detail, number, and stated item, but treat the notes as source material rather than text to reproduce.',
            'Preserve their meaning exactly while paraphrasing and reorganizing the wording naturally for the appropriate character-sheet fields. Do not copy the notes sentence-for-sentence, preserve their original order, or repeat them as a block.',
            'Use the notes as the central foundation for this character. Develop a coherent, specific character around them and fill genuinely missing details with grounded additions that fit the selected race, genre, stats, and concept.',
            'Do not contradict, erase, weaken, intensify, or ignore these notes, and do not turn them into personality, future choices, goals, fears, habits, tactics, morals, emotional reactions, preferred behavior, or statements about what the character will/may/usually/tends to do.',
            'Use exact wording only when it is itself a fixed fact, such as a proper name, title, number, unique term, or explicitly quoted phrase.',
            identity.genre === 'Isekai'
                ? 'Because the selected genre is Isekai, any Earth-life details in these notes describe the character before death and reincarnation. Do not establish time since crossing, prior new-world life, adaptation, local knowledge, previous-life memory state, or whether memories are retained or lost unless the user explicitly wrote that detail.'
                : '',
            `LOCKED USER ADDITIONAL DETAILS:\n${details}`,
        ].filter(Boolean).join('\n');
    }
    return 'Generate fitting background, origin, appearance, clothing, training, inventory, and fixed details from the chosen race, genre, stats, and concept.';
}

function getNewCharacterExplicitAnchorSource(identity = {}) {
    if (identity.additionalDetailsMode !== 'user') return '';
    return String(identity.additionalDetails || identity.appearance || '').trim();
}

function getNewCharacterExplicitAppearanceSource(identity = {}) {
    const sources = [getNewCharacterExplicitAnchorSource(identity)];
    if (identity.raceMode === 'specify' && identity.specifiedRaceDescriptionMode === 'user') {
        sources.push(String(identity.specifiedRaceDescription || '').trim());
    }
    return sources.filter(Boolean).join('\n');
}

function buildNewCharacterStatInstruction(stats = {}) {
    const normalized = normalizeCoreStats(stats);
    const statMeanings = {
        PHY: 'physical capability, athleticism, endurance, combat readiness, bodily skill, or movement competence',
        MND: 'knowledge, perception, reasoning, focus, technical skill, magical discipline, or mental resilience',
        CHA: 'presence, confidence, persuasion, deception, intimidation, charm, leadership, or social fluency',
    };
    const ordered = PLAYER_STATS
        .map(stat => ({ stat, value: Number(normalized[stat] || 1) }))
        .sort((a, b) => (b.value - a.value) || PLAYER_STATS.indexOf(a.stat) - PLAYER_STATS.indexOf(b.stat));
    const allEqual = ordered.every(entry => entry.value === ordered[0].value);
    if (allEqual) {
        return [
            `STAT SHAPE: balanced (${PLAYER_STATS.map(stat => `${stat} ${normalized[stat]}`).join(', ')}).`,
            'The character concept, prior competence, appearance, and starting gear should show balanced physical, mental, and social capability without contradicting any locked stat.',
        ].join('\n');
    }

    const strongest = ordered.slice(0, 2);
    const weak = ordered[2];
    return [
        `STAT SHAPE: strongest stats are ${strongest.map(entry => `${entry.stat} ${entry.value}`).join(' and ')}; relative weak point is ${weak.stat} ${weak.value}.`,
        `Build the shell around those strengths: ${strongest.map(entry => `${entry.stat} means ${statMeanings[entry.stat]}`).join('; ')}.`,
        `Treat ${weak.stat} as the relative weak point, even if its number is still high. Do not contradict the locked stats with background, appearance, training, or limits.`,
        'If PHY is one of the strongest stats, the body and prior competence must show real physical capability. Do not soften high PHY into a default lean, wiry, fragile, noncombatant, or untrained description unless the concept gives an equally physical explanation such as acrobatics, dueling, athletics, labor, survival, dance, martial training, or monster-body strength.',
        'If CHA is one of the strongest stats, the shell must show social presence, influence, confidence, performance, command, negotiation, deception, intimidation, or charm without dictating future social choices.',
        'If MND is one of the strongest stats, the shell must show mental, technical, scholarly, perceptive, magical, strategic, or investigative competence without turning the character into a fixed personality.',
    ].join('\n');
}

function buildNewCharacterGenreInstruction(identity = {}) {
    const genre = PLAYER_GENRE_CHOICES.includes(identity.genre) ? identity.genre : 'Fantasy';
    const instructions = [
        `Selected genre: ${genre}.`,
        'Use the selected genre as the creative frame for the character concept, setting assumptions, background hooks, abilities or skills, inventory, and tone.',
        'All races are valid in all genres. Do not reject, avoid, or replace a race because it seems genre-incongruent; reinterpret its origin, traits, social role, gear, and abilities through the selected genre.',
        'If race is Random, choose any playable race first, then make the character sheet explain how that race fits the selected genre.',
    ];
    if (genre === 'Isekai') {
        instructions.push('For Isekai, the sheet must establish only the premise: the character died on Earth and was reincarnated in another world. Do not establish time since crossing, prior new-world life, adaptation, local knowledge, previous-life memory state, or whether memories are retained or lost unless the user explicitly provided that detail.');
    }
    return instructions.join('\n');
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


    return 'Randomly choose any playable humanoid, demi-human, monster-humanoid, alien, undead, construct, spirit-touched, supernatural, engineered, hybrid, or genre-adapted race. Keep the result playable as {{user}} unless the chosen race explicitly demands otherwise.';
}


async function generateExistingPersonaCharacterSheet(creator, context = getContext()) {

    const stats = normalizeCoreStats(creator.stats || {});
    const genre = normalizePlayerAdventureGenre(creator.identity?.genre || 'Fantasy');
    const generationOptions = {
        mode: 'existing',
        stats,
        fixedRace: '',
        fixedUserNonHuman: '',
        genre,
    };

    const persona = getPersonaText(context);
    const retryNotes = Array.isArray(creator.retryNotes) ? creator.retryNotes : [];

    if (!persona) {

        throw new Error('The active persona has no description to convert.');

    }

    const analysis = creator.personaAnalysis || {};

    const prompt = [

        {

            role: 'system',

            content:

                `You convert an existing SillyTavern user persona into a clean character sheet for ${genre} roleplay. ` +

                'Preserve explicit persona facts exactly in meaning. Do not rewrite the character, add new biography, invent missing facts, or contradict the persona. ' +

                'You may rearrange and label information for formatting only. Copy factual wording where practical. Do not embellish, interpret, strengthen, weaken, or replace any detail. If a required field is not stated, write "Not specified". ' +

                'The only new information you may insert is the locked stat block. Do not reroll, rebalance, or assign new numbers.',

        },

        {

            role: 'user',

            content:

                'Produce the complete character-sheet data through the required structured output. Do not write Markdown, a preface, or questions. Supply plain field values only; deterministic code owns the final headings, order, labels, name, and locked stats.\n\n' +

                `LOCKED STATS:\nPHY: ${stats.PHY}\nMND: ${stats.MND}\nCHA: ${stats.CHA}\n\n` +

                `SELECTED GENRE: ${genre}\n` +

                `PERSONA PRIMARY STAT READING: ${analysis.PrimaryStat || 'PHY'}\n` +

                `EVIDENCE: ${analysis.Evidence || 'none'}\n` +

                `EXPLICIT RACE/SPECIES IF KNOWN: ${analysis.Race || 'unknown'}\n` +

                `USER NON-HUMAN IF KNOWN: ${analysis.UserNonHuman || 'unknown'}\n\n` +

                'Preserve explicit facts exactly in meaning while sorting possessions into the matching tracker-aligned structured fields. Use empty arrays for list fields with no explicit source facts.\n\n' +

                'Template requirements:\n' +

                'BASIC INFO: Race, Bloodline if relevant, UserNonHuman Y/N, Gender, Age, and origin/mind notes. Use explicit persona facts only; otherwise write Not specified for required text fields or an empty string for inapplicable optional fields.\n' +

                'APPEARANCE: preserve explicit appearance facts only as plain label/detail pairs, including explicit visible natural weapons/body armaments.\n' +
                'NATURAL WEAPONS: preserve explicit offensive body parts only: claws, fangs, horns, talons, tusks, stinger, crushing tail, biting jaws, or similar built-in offensive anatomy. Do not invent missing natural weapons. Do not preserve passive racial traits, anatomy, senses, body texture, vulnerabilities, vague toughness, resistance, immunity, skill boosts, better-at wording, or mechanical advantages here.\n' +
                'ABILITIES: preserve all explicit activated non-spell abilities. If an explicit natural weapon has a special activated effect beyond ordinary bodily use, preserve that effect here. Do not preserve mundane expertise, combat techniques, hidden bonuses, passive traits, or broad skill competence as abilities.\n' +
                'SPELLS: preserve explicit spells only, maximum 5. Preserve healing spells, but do not preserve resurrection, time/fate/luck manipulation, mind control/charm, broad magic mastery, or vague spell categories unless explicitly central canon.\n' +
                'INVENTORY: preserve explicit carried or stowed items only: supplies, tools, consumables, documents, containers, travel goods, and other possessions not currently worn/equipped. Do not list clothing worn on the body, armor, weapons worn ready, currency, natural weapons, or body armaments here.\n' +
                'CURRENCY: preserve explicit money only. Normalize obvious fantasy money to sv when possible, such as 12 silver coins -> 12 sv. Do not invent money.\n' +
                'GEAR: preserve explicit worn, equipped, or immediately ready items only: clothing, armor, boots, cloak, belt, pouches, weapons, sheaths, jewelry, visible tools worn on the body, or other equipped objects. Do not list currency, pack contents, carried supplies, natural weapons, or body anatomy here.\n' +
                'CHARACTER ANCHORS: preserve only explicit durable persona facts that cannot fit another structured field. Do not duplicate basic information, appearance, stats, natural weapons, abilities, spells, inventory, currency, or gear, and do not add summaries or interpretations.\n\n' +
                `${retryNotes.length ? `PRIOR IDEAS TO AVOID:\n${retryNotes.map((note, index) => `${index + 1}. ${note}`).join('\n')}\n\n` : ''}` +

                `EXISTING PERSONA:\n${clipText(persona, 9000)}`,

        },

    ];

    const payload = await requestPlayerSetupStructured(prompt, PLAYER_SETUP_SHEET_RESPONSE_LENGTH, generationOptions, {
        temperature: 0.1,
    }, context);
    const sheetText = renderCharacterSheet(payload, generationOptions);
    validatePlayerCreatorSheet(sheetText, creator);
    return sheetText;

}

function validatePlayerCreatorSheet(sheetText, creator = {}) {
    const identity = creator.identity || {};
    const genre = normalizePlayerAdventureGenre(identity.genre || 'Fantasy');
    const expectedRace = creator.flow === 'new' ? getLockedPlayerCreatorRace(identity) : '';
    return assertValidCharacterSheet(sheetText, {
        stats: normalizeCoreStats(creator.stats || {}),
        expectedRace,
        genre,
        requireNumericAge: creator.flow === 'new' && genre === 'Isekai',
    });
}

function getLockedPlayerCreatorRace(identity = {}) {
    if (identity.raceMode === 'specify') return String(identity.specifiedRace || '').trim();
    if (identity.raceMode === 'pick') return String(identity.pickedRace || 'Human').trim();
    return '';
}

function getLockedPlayerCreatorUserNonHuman(identity = {}) {
    if (identity.raceMode === 'pick') {
        return /^human$/i.test(String(identity.pickedRace || 'Human').trim()) ? 'N' : 'Y';
    }
    if (identity.raceMode === 'specify' && /^human$/i.test(String(identity.specifiedRace || '').trim())) {
        return 'N';
    }
    return '';
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
    if (!isStoryEngineEnabled()) {
        throw new Error('Story Engine is disabled.');
    }
    const context = getContext();
    const requestIdentity = createStoryEngineEpochIdentity(context);
    const bypassToken = promptReadyBypassGate.acquire();
    try {
        return await withStoryEngineModelRequest(async modelRequest => {
            const textPrompt = Array.isArray(prompt)
                ? prompt.map(message => `${String(message.role || 'user').toUpperCase()}:\n${String(message.content || '')}`).join('\n\n')
                : String(prompt || '');
            return await generateRawData({ prompt: textPrompt, responseLength, ...overridePayload }, context, {
                purpose: 'player setup',
                signal: modelRequest.signal,
                beforeAbort: markInternalGenerationStop,
            });
        }, {
            isCurrent: () => isCurrentStoryEngineEpoch(requestIdentity, context),
            expiredMessage: 'Player setup generation expired because the active chat changed.',
        });
    } finally {
        promptReadyBypassGate.release(bypassToken);
    }
}

async function requestPlayerSetupStructured(prompt, responseLength, generationOptions = {}, requestOptions = {}, context = getContext()) {
    if (!isStoryEngineEnabled()) {
        throw new Error('Story Engine is disabled.');
    }
    if (!context) {
        throw new Error('SillyTavern context is unavailable for character-sheet generation.');
    }

    const requestIdentity = createStoryEngineEpochIdentity(context);
    const modelRequestOptions = {
        isCurrent: () => isCurrentStoryEngineEpoch(requestIdentity, context),
        expiredMessage: 'Character-sheet generation expired because the active chat changed.',
    };
    const runStructuredModelRequest = callback => withStoryEngineModelRequest(callback, modelRequestOptions);
    const bypassToken = promptReadyBypassGate.acquire();
    try {
        const failures = [];
        const usesChatCompletion = String(context.mainApi || '').toLowerCase() === 'openai';
        if (usesChatCompletion) {
            try {
                return await runStructuredModelRequest(async modelRequest => {
                    const raw = await sendDefaultChatCompletionToolRequest(
                        appendCharacterSheetOutputInstruction(prompt, 'tool'),
                        responseLength,
                        {
                            purpose: 'character-sheet tool call',
                            temperature: requestOptions.temperature,
                            buildTool: source => buildCharacterSheetTool(source, generationOptions),
                            buildToolChoice: buildCharacterSheetToolChoice,
                            preparePayload: applyStoryEngineBaselineThinkingDisabledPayload,
                            signal: modelRequest.signal,
                        },
                    );
                    if (raw?.error) {
                        throw createCharacterSheetProviderResponseError(raw);
                    }
                    return normalizeCharacterSheetPayload(extractCharacterSheetToolPayload(raw), generationOptions);
                });
            } catch (error) {
                assertStoryEngineModelRequestCurrent(modelRequestOptions);
                if (!shouldRetryCharacterSheetToolFailure(error)) {
                    throw error;
                }
                failures.push(`native tool call: ${summarizePlayerSetupError(error)}`);
                console.warn('[Story Engine] Character-sheet structured output failed; retrying once with JSON schema.', summarizePlayerSetupError(error));
            }
        }

        try {
            return await runStructuredModelRequest(async modelRequest => {
                const jsonSchema = buildCharacterSheetJsonSchema(generationOptions);
                const schemaPrompt = appendCharacterSheetOutputInstruction(prompt, 'json', usesChatCompletion ? null : jsonSchema.value);
                const raw = await generateRawData({
                    prompt: schemaPrompt,
                    responseLength,
                    ...(usesChatCompletion ? { jsonSchema } : {}),
                }, context, {
                    purpose: 'structured character-sheet generation',
                    signal: modelRequest.signal,
                    beforeAbort: markInternalGenerationStop,
                });
                const structuredPayload = usesChatCompletion ? raw : extractGeneratedText(raw);
                return normalizeCharacterSheetPayload(parseCharacterSheetJsonPayload(structuredPayload), generationOptions);
            });
        } catch (error) {
            assertStoryEngineModelRequestCurrent(modelRequestOptions);
            failures.push(`JSON-schema ${failures.length ? 'retry' : 'request'}: ${summarizePlayerSetupError(error)}`);
            throw new Error(`Character-sheet generation failed. ${failures.join(' | ')}`, { cause: error });
        }
    } finally {
        promptReadyBypassGate.release(bypassToken);
    }
}

function createCharacterSheetProviderResponseError(raw) {
    let body = '';
    try {
        body = JSON.stringify(raw?.error ?? raw).slice(0, 700);
    } catch {
        body = String(raw?.error ?? raw ?? '').slice(0, 700);
    }
    const error = new Error(`Provider returned an error object. ${describeCharacterSheetRaw(raw)}${body ? ` ${body}` : ''}`);
    error.name = 'CharacterSheetProviderResponseError';
    error.stage = 'response';
    error.body = body;
    const status = Number(raw?.status ?? raw?.error?.status);
    if (Number.isFinite(status)) error.status = status;
    return error;
}

function summarizePlayerSetupError(error) {
    const name = String(error?.name || 'Error');
    const stage = String(error?.stage || '').trim();
    const message = error instanceof Error ? error.message : String(error || 'Unknown failure');
    return `${name}${stage ? ` [${stage}]` : ''}: ${message}`.replace(/\s+/g, ' ').slice(0, 700);
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

function hasVisibleUserMessage(context = getContext()) {
    if (!Array.isArray(context?.chat)) return false;
    return context.chat.some(message => {
        if (!message?.is_user && message?.role !== 'user') return false;
        return Boolean(String(message?.mes ?? message?.content ?? '').trim());
    });
}

function buildCurrentAdventureStartPrompt(context = getContext()) {
    const root = getPlayerRoot(context);
    if (!root?.adventureStarted) return '';
    return buildPlayerAdventureStartPrompt(root);
}

function getBeginningAdventureStartPrompt(context = getContext(), type = '') {
    if (!['normal', 'swipe', 'regenerate'].includes(String(type || ''))) return '';
    if (hasVisibleUserMessage(context)) return '';
    return buildCurrentAdventureStartPrompt(context);
}

function getActiveAdventureIntroPrompt(pendingGeneration = state.pendingGeneration, context = getContext()) {
    return String(buildCurrentAdventureStartPrompt(context) || pendingGeneration?.adventureStartPrompt || getPlayerRoot(context)?.adventureStartPrompt || '').trim();
}

function isBeginningAdventureIntroGeneration(pendingGeneration = state.pendingGeneration, context = getContext()) {
    if (!pendingGeneration) return false;
    const type = String(pendingGeneration.type || 'normal');
    if (!['normal', 'swipe', 'regenerate'].includes(type)) return false;
    if (hasVisibleUserMessage(context)) return false;
    const root = getPlayerRoot(context);
    if (!root?.adventureStarted) return false;
    return Boolean(getActiveAdventureIntroPrompt(pendingGeneration, context));
}

function detectStructuredUserInputMode(text) {
    const trimmed = String(text ?? '').trim();
    if (!trimmed) return { mode: 'normal', innerText: '' };

    const completeProxyInstruction = extractCompleteProxyInstruction(trimmed);
    if (completeProxyInstruction !== null) {
        return { mode: 'proxy', innerText: completeProxyInstruction };
    }


    if (trimmed.length >= 4 && trimmed.startsWith('((') && trimmed.endsWith('))')) {

        return { mode: 'ooc', innerText: trimmed.slice(2, -2).trim() };

    }

    if (/^ooc\s*:?\s*$/i.test(trimmed)) {

        return { mode: 'ooc', innerText: '' };

    }

    const oocPrefix = trimmed.match(/^ooc(?:\s*:\s*|\s+)([\s\S]*)$/i);
    if (oocPrefix) {

        return { mode: 'ooc', innerText: oocPrefix[1].trim() };

    }



    return { mode: 'normal', innerText: trimmed, inlineProxyInstructions: extractInlineProxyInstructions(trimmed) };

}


function extractCompleteProxyInstruction(text) {
    const trimmed = String(text ?? '').trim();
    if (trimmed.length < 4 || !trimmed.startsWith('[[') || !trimmed.endsWith(']]')) return null;
    const inner = trimmed.slice(2, -2).trim();
    if (!inner || inner.includes('[[') || inner.includes(']]')) return null;
    return inner;
}


function extractInlineProxyInstructions(text) {
    const instructions = [];
    const source = String(text ?? '');
    for (const match of source.matchAll(/\[\[([\s\S]*?)\]\]/g)) {
        const instruction = match[1]?.trim();
        if (instruction) instructions.push(instruction);
        if (instructions.length >= 5) break;
    }
    return instructions;
}



function clearPromptOptionPrompts(context = getContext()) {

    if (!context?.extensionPrompts) return;

    delete context.extensionPrompts[WRITING_STYLE_PROMPT_KEY];

    delete context.extensionPrompts[PROSE_RULES_PROMPT_KEY];

    delete context.extensionPrompts[LEGACY_FINAL_REMINDER_PROMPT_KEY];

    delete context.extensionPrompts[LEGACY_WRITING_STYLE_PROMPT_KEY];
    delete context.extensionPrompts[LEGACY_ORDERED_WRITING_STYLE_PROMPT_KEY];

    delete context.extensionPrompts[LEGACY_PROSE_RULES_PROMPT_KEY];

}



function buildOocResponsePrompt(userText) {

    const note = clipText(String(userText ?? ''), 2000);

    return [

        '[STRUCTURED_PREFLIGHT_OOC]',

        'The latest user message is out of character.',

        'Answer the user\'s OOC question directly as an assistant.',

        'Use the visible prompt stack, chat history, character/persona/lore context, Prose Rules, and any visible handoff reminder as reference if relevant.',

        'Do not continue the roleplay.',

        'Do not narrate the scene.',

        'Do not run, imply, or update mechanics, rolls, tracker state, scene consequences, relationship state, or memory.',

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



function cleanVisibleDebugDisplays(context = getContext()) {
    if (!Array.isArray(context?.chat)) return false;
    let changed = false;

    context.chat.forEach(message => {
        if (!message || message.is_user) return;
        message.extra = message.extra || {};
        const displayText = typeof message.extra.display_text === 'string' ? message.extra.display_text : '';
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

        saveChat(context);

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
            if (isNarratorGenerationPromptPass() && isActiveNarratorDepthPromptContent(message.content)) {
                continue;
            }

            message.content = stripStructuredArtifacts(message.content).trim();

            if (message.role === 'assistant') {

                message.content = stripNarratorMetaPrefix(message.content).trim();

            }

        } else if (Array.isArray(message.content)) {

            message.content = message.content

                .map(part => {

                    if (part && typeof part === 'object' && typeof part.text === 'string') {
                        if (isNarratorGenerationPromptPass() && isActiveNarratorDepthPromptContent(part.text)) {
                            return part;
                        }

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
        root.health = normalizeHiddenHealth(root.snapshots?.[getMessageKey(targetMessageId, context)]?.beforeHealth || root.health, { user: root.user, npcs: root.npcs });
        root.powerActors = root.snapshots?.[getMessageKey(targetMessageId, context)]?.beforePowerActors || root.powerActors || {};
        root.latentGrievances = resolveStoredLatentGrievances(
            root,
            root.snapshots?.[getMessageKey(targetMessageId, context)]?.beforeLatentGrievanceIds,
            root.latentGrievances,
        );
        root.latentFavors = resolveStoredLatentFavors(
            root,
            root.snapshots?.[getMessageKey(targetMessageId, context)]?.beforeLatentFavorIds,
            root.latentFavors,
        );
        root.userKnowledge = mergeUserKnowledgeLedger(root.snapshots?.[getMessageKey(targetMessageId, context)]?.beforeUserKnowledge || root.userKnowledge || {}, {});
        root.userReputation = mergeUserReputationLedger(root.snapshots?.[getMessageKey(targetMessageId, context)]?.beforeUserReputation || root.userReputation || {}, {});
        root.worldState = normalizeWorldState(root.snapshots?.[getMessageKey(targetMessageId, context)]?.beforeWorldState || root.worldState || {});
        root.sceneItems = normalizeSceneItemState(root.snapshots?.[getMessageKey(targetMessageId, context)]?.beforeSceneItems || {}, root.worldState);
        rebuildWorldMemoryFromSelectedSwipes(context, { beforeMessageId: targetMessageId });
        root.economy = normalizeEconomyState(root.snapshots?.[getMessageKey(targetMessageId, context)]?.beforeEconomy || root.economy || {});
        root.boundCompanion = normalizeBoundCompanionState(root.snapshots?.[getMessageKey(targetMessageId, context)]?.beforeBoundCompanion || root.boundCompanion || {});
        root.pendingBoundary = normalizePendingBoundaryState(root.snapshots?.[getMessageKey(targetMessageId, context)]?.beforePendingBoundary || root.pendingBoundary || {});
        root.spellCasting = normalizeSpellCastingState(root.snapshots?.[getMessageKey(targetMessageId, context)]?.beforeSpellCasting || root.spellCasting || {});
        root.rapportClock = rapportClock;
        root.snapshots[getMessageKey(targetMessageId, context)].restoredForRegeneration = Date.now();

        console.info(`[${EXTENSION_NAME}] restored tracker snapshot before ${type} of message ${targetMessageId}`);

    }



    state.lastNarratorHandoffKey = null;

    state.lastNarratorHandoff = '';

}



async function persistMetadata(context = getContext()) {
    return await persistAdapterMetadata(context);
}

function getProseRuleBlock(ruleName) {
    const marker = `  function ${String(ruleName || '').trim()}(`;
    const start = DEFAULT_PROSE_RULES_PROMPT.indexOf(marker);
    if (start < 0) throw new Error(`Prose Rule "${ruleName}" was not found.`);
    const next = DEFAULT_PROSE_RULES_PROMPT.indexOf('\n  function ', start + marker.length);
    const end = next >= 0 ? next : DEFAULT_PROSE_RULES_PROMPT.lastIndexOf('\n}');
    return DEFAULT_PROSE_RULES_PROMPT.slice(start, end).trim();
}
function parseProseGuardBannedPhraseList(value) {
    return uniqueStrings(String(value ?? '')
        .split(/\r?\n/)
        .map(line => line.trim())
        .filter(Boolean));
}

function getTargetedProseBanRules(settings = getSettings(), additionalPhrases = [], additionalCategory = 'userPhraseBans') {
    const configuredRules = PROSE_GUARD_TARGETED_BAN_FIELDS
        .map(field => ({
            ...field,
            rulePrompt: field.rulePrompt || getProseRuleBlock(field.ruleName),
            phrases: field.ruleName === additionalCategory
                ? uniqueStrings([
                    ...parseProseGuardBannedPhraseList(settings[field.key] ?? field.defaultValue),
                    ...additionalPhrases,
                ])
                : parseProseGuardBannedPhraseList(settings[field.key] ?? field.defaultValue),
        }));
    const automaticRules = PROSE_GUARD_AUTOMATIC_PATTERN_RULES
        .map(rule => ({
            ...rule,
            rulePrompt: getProseRuleBlock(rule.ruleName),
            phrases: [],
        }));
    return [...configuredRules, ...automaticRules]
        .filter(rule => rule.phrases.length > 0 || rule.patternNames?.length > 0);
}

function getProseGuardRulesForStoredChange(change) {
    const rules = getTargetedProseBanRules().map(rule => ({
        ...rule,
        phrases: [...(rule.phrases || [])],
        patternNames: [...(rule.patternNames || [])],
    }));
    for (const match of change?.matches || []) {
        const ruleName = String(match?.ruleName || '');
        const phrase = String(match?.phrase || '').trim();
        if (!ruleName || !phrase || ruleName === 'antiRhetoricalNegation') continue;
        let rule = rules.find(item => item.ruleName === ruleName);
        if (!rule) {
            const field = PROSE_GUARD_TARGETED_BAN_FIELDS.find(item => item.ruleName === ruleName);
            if (!field) continue;
            rule = {
                ...field,
                rulePrompt: field.rulePrompt || getProseRuleBlock(field.ruleName),
                phrases: [],
            };
            rules.push(rule);
        }
        if (!rule.phrases.some(value => value.toLocaleLowerCase() === phrase.toLocaleLowerCase())) {
            rule.phrases.push(phrase);
        }
    }
    return rules;
}

function formatTargetedProseBanFindings(findings, rules) {
    return (findings || []).map(finding => [
        `FINDING_ID: ${finding.id}`,
        `MATCHED_PHRASES: ${finding.matches.map(match => `${match.ruleName}=${JSON.stringify(match.matchedPhrase)}`).join('; ')}`,
        'SENTENCE_TO_REPAIR:',
        finding.sentence,
        '',
        'MATCHING_PROSE_RULES:',
        ...(finding.ruleNames || [])
            .map(name => rules.find(rule => rule.ruleName === name)?.rulePrompt || '')
            .filter(Boolean),
    ].join('\n')).join('\n\n');
}

function buildTargetedProseBanRepairPrompt(findings, rules, guidance = '') {
    const manualGuidance = String(guidance || '').trim().slice(0, 1000);
    return [
        'STORY_ENGINE_TARGETED_PROSE_BAN_REPAIR',
        '',
        'You are PROSE_GUARD_TARGETED_REPAIR, a strict sentence-level prose repair tool.',
        '',
        'TASK:',
        'The deterministic scanner has already confirmed the listed phrase matches. Configured phrase bans are absolute for this pass, including matches inside quoted dialogue.',
        'Repair ONLY each supplied sentence for its confirmed match. Do not audit or improve anything else.',
        'Every supplied FINDING_ID MUST receive exactly one compliant replace or delete operation. If a safe repair is impossible, the request fails closed; do not omit the finding.',
        '',
        'REPAIR LIMITS:',
        '- Use operation="delete" with replacementSentence="" ONLY when removing the confirmed violation leaves no meaningful content in that sentence.',
        '- Otherwise use operation="replace" and return exactly one corrected sentence.',
        '- Preserve all dialogue, facts, names, actions, consequences, order, tone, intensity, and meaning outside the confirmed violation.',
        '- Replace emotional or figurative shorthand with observable behavior already supported by the sentence and scene context.',
        '- Add no unrelated facts, gestures, actions, emotions, motives, information, object handling, or consequences.',
        '- Preserve quoted dialogue exactly except when the confirmed match itself occurs inside that dialogue.',
        '- Do not replace a banned phrase with another banned phrase or an equivalent workaround.',
        '- Return no commentary, analysis, corrected narration, or labels outside the required edit block.',
        ...(manualGuidance
            ? ['', 'USER REPAIR GUIDANCE:', manualGuidance, 'Use this only to clarify the prohibited construction. It does not authorize changing facts or adding content.']
            : []),
        '',
        'DETERMINISTIC FINDINGS:',
        formatTargetedProseBanFindings(findings, rules),
        '',
        'OUTPUT CONTRACT:',
        `Return exactly ${PROSE_GUARD_EDITS_START}, one JSON object, and ${PROSE_GUARD_EDITS_END}.`,
        '{"sentenceRepairs":[{"findingId":"PG_SENTENCE_1","operation":"replace","replacementSentence":"one corrected sentence"}]}',
        'Do not return an empty sentenceRepairs array when findings are supplied.',
        '',
        'The only authorized source text is the supplied SENTENCE_TO_REPAIR for each FINDING_ID.',
    ].join('\n');
}

function parseTargetedProseGuardResponse(raw) {
    const structuredPayload = raw && typeof raw === 'object' && !Array.isArray(raw) && Array.isArray(raw.sentenceRepairs)
        ? raw
        : extractGeneratedText(raw) || String(raw || '');
    return parseProseGuardRepairPayload(structuredPayload);
}

async function requestTargetedProseBanRepair(findings, rules, requestOptions = {}) {
    if (!isStoryEngineEnabled()) {
        throw new Error('Story Engine is disabled.');
    }
    const prompt = buildTargetedProseBanRepairPrompt(findings, rules, requestOptions.guidance);
    const sentenceCharacters = (findings || []).reduce((total, finding) => total + finding.sentence.length, 0);
    const responseLength = Math.max(800, Math.min(5000, Math.ceil(sentenceCharacters / 2) + (findings.length * 180) + 500));
    const toolDefinition = buildPostNarrationToolDefinition(PROSE_GUARD_TOOL_NAME, { includeSentenceRepairs: true });
    const bypassToken = requestOptions.bypassToken || promptReadyBypassGate.acquire();
    try {
        return await withStoryEngineModelRequest(modelRequest => withProseGuardGenerationSettings(async settings => {
            return await requestPostNarrationUtility({
                settings,
                prompt,
                responseLength,
                toolDefinition,
                purpose: 'targeted Prose Guard repair',
                validateStructured: raw => parseTargetedProseGuardResponse(raw),
            }, modelRequest);
        }), requestOptions);
    } finally {
        promptReadyBypassGate.release(bypassToken);
    }
}

async function requestTargetedProseBanRepairWithTimeout(findings, rules, requestOptions = {}) {
    let timeoutId = null;
    const requestControl = createTimedInternalRequestControl(requestOptions);
    try {
        return await Promise.race([
            requestTargetedProseBanRepair(findings, rules, requestControl.options),
            new Promise((_, reject) => {
                timeoutId = setTimeout(
                    () => {
                        requestControl.cancel();
                        reject(new Error(`Targeted Prose Guard repair timed out after ${Math.round(PROSE_GUARD_TIMEOUT_MS / 1000)} seconds.`));
                    },
                    PROSE_GUARD_TIMEOUT_MS,
                );
            }),
        ]);
    } finally {
        if (timeoutId != null) clearTimeout(timeoutId);
        requestControl.release();
    }
}

class ProseGuardEnforcementError extends Error {
    constructor(message, details = {}) {
        super(message);
        this.name = 'ProseGuardEnforcementError';
        this.findings = details.findings || [];
        this.remainingFindings = details.remainingFindings || [];
        this.rejectedRepairs = details.rejectedRepairs || [];
        this.attemptedRepairs = details.attemptedRepairs || [];
        this.cause = details.cause;
    }
}

async function applyTargetedProseBanRepairIfNeeded(narrationText, requestOptions = {}) {
    let currentText = String(narrationText ?? '');
    let changed = false;
    const appliedRepairs = [];
    let lastFindings = [];
    let lastRemainingFindings = [];
    let lastRejectedRepairs = [];
    let lastError = null;
    const attemptedRepairs = [];

    for (let attempt = 1; attempt <= PROSE_GUARD_MAX_REPAIR_ATTEMPTS; attempt += 1) {
        const rules = getTargetedProseBanRules();
        try {
            const findings = collectProseGuardSentenceFindings(
                currentText,
                rules,
                PROSE_GUARD_REPAIR_BATCH_SIZE,
            );
            lastFindings = findings;
            if (!findings.length) {
                return {
                    narrationText: currentText,
                    changed,
                    findings: lastFindings,
                    remainingFindings: [],
                    rejectedRepairs: [],
                    appliedRepairs,
                };
            }

            const { payload: repairPayload, repaired } = await requestAndApplyProseGuardRepairs(
                currentText,
                findings,
                rules,
                requestOptions,
            );
            const appliedFindingIds = new Set(repaired.appliedRepairs.map(repair => repair.findingId));
            const unresolvedFindings = findings.filter(finding => !appliedFindingIds.has(finding.id));
            const rejectedByFindingId = new Map(repaired.rejectedRepairs.map(repair => [repair.findingId, repair]));
            for (const repair of repairPayload.sentenceRepairs) {
                const finding = findings.find(item => item.id === repair.findingId);
                attemptedRepairs.push({
                    findingId: repair.findingId,
                    operation: repair.operation,
                    sourceStart: finding?.start ?? null,
                    originalText: finding?.sentence || '',
                    replacementText: repair.replacementSentence,
                    reason: rejectedByFindingId.get(repair.findingId)?.reason || '',
                    attempt,
                });
            }
            for (const finding of unresolvedFindings) {
                const supplied = repairPayload.sentenceRepairs.some(repair => repair.findingId === finding.id);
                if (!supplied) {
                    attemptedRepairs.push({
                        findingId: finding.id,
                        operation: '',
                        sourceStart: finding.start,
                        originalText: finding.sentence,
                        replacementText: '',
                        reason: 'The repair response omitted this finding.',
                        attempt,
                    });
                }
            }
            currentText = repaired.narrationText;
            changed = changed || repaired.changed;
            appliedRepairs.push(...repaired.appliedRepairs);
            const remainingFindings = collectProseGuardSentenceFindings(currentText, rules);
            lastRemainingFindings = remainingFindings;
            lastRejectedRepairs = repaired.rejectedRepairs;

            if (!remainingFindings.length && !repaired.rejectedRepairs.length && !unresolvedFindings.length) {
                return {
                    narrationText: currentText,
                    changed,
                    findings,
                    remainingFindings: [],
                    rejectedRepairs: [],
                    appliedRepairs,
                };
            }
            lastError = new Error('One or more sentence repairs were missing, rejected, or still contained a targeted finding.');
        } catch (error) {
            let current = true;
            try {
                current = typeof requestOptions.isCurrent !== 'function' || requestOptions.isCurrent();
            } catch {
                current = false;
            }
            if (!current) throw error;
            lastError = error;
        }
    }

    const enforcementError = new ProseGuardEnforcementError(
        'Prose Guard could not produce clean narration after one repair retry.',
        {
            findings: lastFindings,
            remainingFindings: lastRemainingFindings.length ? lastRemainingFindings : lastFindings,
            rejectedRepairs: lastRejectedRepairs,
            attemptedRepairs,
            cause: lastError,
        },
    );
    console.warn(`[${EXTENSION_NAME}] automatic Prose Guard repair failed; original narration will be shown.`, enforcementError);
    throw enforcementError;
}

function buildReviewProseGuardState(findings) {
    return {
        version: PROSE_GUARD_EXTRA_VERSION,
        mode: PROSE_GUARD_MODES.REVIEW,
        savedAt: Date.now(),
        findings: (findings || []).map(finding => ({ ...finding, status: 'pending' })),
        changes: [],
    };
}

function summarizeAutomaticProseGuardFailure(error) {
    const causeMessage = error?.cause instanceof Error
        ? error.cause.message
        : String(error?.cause || '');
    const normalized = causeMessage.trim();
    if (!normalized) return 'No validated replacement was returned.';
    if (/structured request returned an error:/i.test(normalized)) {
        return 'The selected provider rejected the repair request.';
    }
    return normalized
        .replace(/\s+RawPreview=[\s\S]*$/i, '')
        .replace(/\s+Raw preview=[\s\S]*$/i, '')
        .trim()
        .slice(0, 300) || 'No validated replacement was returned.';
}

function buildAutomaticProseGuardFailureState(findings, error) {
    const repairAttempts = Array.isArray(error?.attemptedRepairs) ? error.attemptedRepairs : [];
    const failureSummary = summarizeAutomaticProseGuardFailure(error);
    const pendingFindings = (findings || []).map(finding => {
        const sentenceAttempts = repairAttempts.filter(attempt => attempt.originalText === finding.sentence);
        const positionedAttempts = sentenceAttempts.filter(attempt => attempt.sourceStart === finding.start);
        const matchingAttempts = positionedAttempts.length || sentenceAttempts.length === 1
            ? (positionedAttempts.length ? positionedAttempts : sentenceAttempts)
            : [];
        const latestAttempt = matchingAttempts[matchingAttempts.length - 1] || null;
        return {
            ...finding,
            status: 'pending',
            attemptedOperation: latestAttempt?.operation || '',
            attemptedReplacement: latestAttempt?.replacementText || '',
            failureReason: latestAttempt?.reason || failureSummary,
        };
    });
    return {
        version: PROSE_GUARD_EXTRA_VERSION,
        mode: PROSE_GUARD_MODES.REVIEW,
        savedAt: Date.now(),
        findings: pendingFindings,
        changes: [],
        repairAttempts,
        automaticRepairFailed: true,
        error: `Automatic repair failed after one retry. ${failureSummary} The original narration was preserved.`,
    };
}

function buildAutomaticProseGuardState(repairResult) {
    const changes = (repairResult?.appliedRepairs || []).map(repair => ({
        findingId: String(repair.findingId || ''),
        operation: String(repair.operation || 'replace'),
        start: normalizeProseGuardSpanOffset(repair.start),
        end: normalizeProseGuardSpanOffset(repair.end),
        sourceStart: normalizeProseGuardSpanOffset(repair.sourceStart),
        sourceEnd: normalizeProseGuardSpanOffset(repair.sourceEnd),
        originalText: String(repair.originalText || ''),
        replacementText: String(repair.replacementText || ''),
        removedText: String(repair.removedText || ''),
        anchorBefore: String(repair.anchorBefore || ''),
        anchorAfter: String(repair.anchorAfter || ''),
        ruleNames: Array.isArray(repair.ruleNames) ? [...repair.ruleNames] : [],
        matches: Array.isArray(repair.matches) ? repair.matches.map(match => ({ ...match })) : [],
        status: 'applied',
    }));
    return {
        version: PROSE_GUARD_EXTRA_VERSION,
        mode: PROSE_GUARD_MODES.AUTOMATIC,
        savedAt: Date.now(),
        findings: changes.map(change => ({
            id: change.findingId,
            sentence: change.originalText,
            start: change.start,
            end: change.end,
            ruleNames: [],
            matches: [],
            status: change.operation === 'delete' ? 'deleted' : 'fixed',
            operation: change.operation,
            replacementText: change.replacementText,
        })),
        changes,
    };
}


function parsePostNarrationTrackerResponse(raw, narrationText) {
    const structuredTrackerDelta = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? String(raw.trackerDelta || '')
        : '';
    const rawText = structuredTrackerDelta || extractGeneratedText(raw) || String(raw || '');
    const trackerDeltaText = extractTrackerDeltaText(rawText) || rawText;
    return parseNarratorTrackerDelta(trackerDeltaText, narrationText);
}

function parsePostNarrationWorldMemoryResponse(raw) {
    const structuredWorldMemoryDelta = raw && typeof raw === 'object' && !Array.isArray(raw)
        ? String(raw.worldMemoryDelta || '')
        : '';
    const rawText = structuredWorldMemoryDelta || extractGeneratedText(raw) || String(raw || '');
    return parseWorldMemoryDelta(rawText, { requireEnvelope: true });
}

function buildPostNarrationToolDefinition(name, { includeSentenceRepairs = false, includeTrackerDelta = false, includeWorldMemoryDelta = false } = {}) {
    const properties = {};
    const required = [];
    if (includeSentenceRepairs) {
        required.push('sentenceRepairs');
        properties.sentenceRepairs = {
            type: 'array',
            description: 'Exactly one code-authorized replace or delete operation for every confirmed targeted phrase finding. Missing or rejected repairs fail closed.',
            items: {
                type: 'object',
                additionalProperties: false,
                required: ['findingId', 'operation', 'replacementSentence'],
                properties: {
                    findingId: { type: 'string', description: 'Exact FINDING_ID supplied by the deterministic scanner.' },
                    operation: { type: 'string', enum: ['replace', 'delete'], description: 'Use delete only when the confirmed violation is effectively the sentence\'s entire meaningful content; otherwise use replace.' },
                    replacementSentence: { type: 'string', description: 'For replace: one corrected sentence preserving meaningful content. For delete: an empty string.' },
                },
            },
        };
    }
    if (includeTrackerDelta) {
        required.push('trackerDelta');
        properties.trackerDelta = {
            type: 'string',
            description: 'The complete BEGIN_TRACKER_DELTA through END_TRACKER_DELTA ledger derived from the supplied final narration.',
        };
    }
    if (includeWorldMemoryDelta) {
        required.push('worldMemoryDelta');
        properties.worldMemoryDelta = {
            type: 'string',
            description: 'The complete BEGIN_WORLD_MEMORY_DELTA through END_WORLD_MEMORY_DELTA JSON block derived from final narration and the supplied private world state.',
        };
    }
    return {
        name,
        description: includeSentenceRepairs && includeTrackerDelta
            ? 'Submit sentence-level Prose Guard repairs and the tracker delta derived from the corrected narration.'
            : includeTrackerDelta && includeWorldMemoryDelta
                ? 'Submit the validated tracker delta and private world-memory delta derived from final narration.'
            : includeSentenceRepairs
                ? 'Submit code-authorized sentence-level repairs for confirmed targeted prose violations.'
                : 'Submit the validated post-narration tracker delta.',
        parameters: {
            type: 'object',
            additionalProperties: false,
            required,
            properties,
        },
    };
}

function buildPostNarrationToolPrompt(prompt, toolDefinition) {
    const fields = Object.keys(toolDefinition?.parameters?.properties || {});
    const fieldInstructions = [];
    if (fields.includes('sentenceRepairs')) {
        fieldInstructions.push('Put exactly one replace or delete operation for every supplied FINDING_ID in sentenceRepairs. Delete only a violation-only sentence. Otherwise replace the violation while preserving dialogue and all other meaningful content, using only observable behavior supported by context. Never invent unrelated content, omit a finding, or repair anything the deterministic scanner did not supply.');
    }
    if (fields.includes('trackerDelta')) {
        fieldInstructions.push('Put the complete BEGIN_TRACKER_DELTA through END_TRACKER_DELTA ledger in trackerDelta. Base it on the supplied final narration exactly as provided.');
    }
    if (fields.includes('worldMemoryDelta')) {
        fieldInstructions.push('Put the complete BEGIN_WORLD_MEMORY_DELTA through END_WORLD_MEMORY_DELTA JSON block in worldMemoryDelta. Keep hidden progression private and mark only evidence actually presented in the supplied final narration as discovered.');
    }
    return [
        { role: 'user', content: String(prompt || '') },
        {
            role: 'user',
            content: [
                `STORY ENGINE TOOL OUTPUT OVERRIDE: Call ${toolDefinition.name} exactly once.`,
                'Do not emit visible text, JSON, markdown, narration, analysis, or a text ledger outside the tool call.',
                ...fieldInstructions,
                'The preceding task rules remain authoritative; only its text-output formatting is superseded by this tool contract.',
            ].join('\n'),
        },
    ];
}

async function requestPostNarrationUtility({ settings, prompt, responseLength, toolDefinition, purpose, validateStructured }, requestOptions = {}) {
    assertStoryEngineModelRequestCurrent(requestOptions);
    const profileSettings = {
        ...settings,
        signal: requestOptions.signal,
        purpose,
    };
    const toolPrompt = buildPostNarrationToolPrompt(prompt, toolDefinition);
    const structured = await sendStructuredToolRequest(toolPrompt, responseLength, profileSettings, toolDefinition);
    assertStoryEngineModelRequestCurrent(requestOptions);
    validateStructured?.(structured);
    return structured;
}

function deferForProseGuardFinalization() {
    return new Promise(resolve => setTimeout(resolve, PROSE_GUARD_DEFER_MS));
}

function createTimedInternalRequestControl(requestOptions = {}) {
    let cancelled = false;
    const cancellationHandlers = new Set();
    const abortController = typeof AbortController === 'function' ? new AbortController() : null;
    const bypassToken = promptReadyBypassGate.acquire();
    const release = () => promptReadyBypassGate.release(bypassToken);
    const parentIsCurrent = typeof requestOptions?.isCurrent === 'function'
        ? requestOptions.isCurrent
        : () => true;
    return {
        options: {
            ...requestOptions,
            bypassToken,
            signal: abortController?.signal || requestOptions.signal || null,
            isCurrent: () => !cancelled && parentIsCurrent(),
            registerCancellation(handler) {
                if (typeof handler !== 'function') return () => {};
                if (cancelled) {
                    handler();
                    return () => {};
                }
                cancellationHandlers.add(handler);
                return () => cancellationHandlers.delete(handler);
            },
        },
        cancel() {
            if (cancelled) return;
            cancelled = true;
            abortController?.abort();
            for (const handler of cancellationHandlers) handler();
            cancellationHandlers.clear();
            release();
        },
        release() {
            cancellationHandlers.clear();
            release();
        },
    };
}

function isPostNarrationFinalizerCurrent(context, messageId, messageKey, captured = {}) {
    if (!context || !Array.isArray(context.chat)) return false;
    if (!isCurrentStoryEngineEpoch(captured, context)) return false;
    if (getMessageKey(messageId, context) !== messageKey) return false;
    const message = context.chat[messageId];
    return Boolean(message && !message.is_user);
}

function buildPostNarrationTrackerPrompt({ pendingRun, messageKey, narrationText, trackerDisplaySnapshot }) {
    const report = pendingRun?.report || {};
    const handoff = report?.finalNarrativeHandoff || {};
    const resolution = handoff.resolutionPacket || {};
    const semanticTrackerNpcs = Array.isArray(report?.semanticLedger?.trackerUpdateEngine?.npcs)
        ? report.semanticLedger.trackerUpdateEngine.npcs
        : [];
    const previous = {
        user: sanitizeTrackerUserStateForModel(pendingRun?.userBefore || {}),
        npcs: pendingRun?.trackerBefore || {},
        userKnowledge: pendingRun?.userKnowledgeBefore || {},
        worldState: pendingRun?.worldStateBefore || {},
        sceneItems: sceneItemStateForModel(
            pendingRun?.sceneItemsBefore || {},
            pendingRun?.worldStateBefore || {},
        ),
        economy: pendingRun?.economyBefore || {},
        boundCompanion: pendingRun?.boundCompanionBefore || {},
        pendingBoundary: pendingRun?.pendingBoundaryBefore || {},
    };
    const mechanicalAfter = {
        user: sanitizeTrackerUserStateForModel(pendingRun?.userAfter || {}),
        npcs: pendingRun?.trackerAfter || {},
        userKnowledge: pendingRun?.userKnowledgeBefore || {},
        worldState: pendingRun?.worldStateAfter || pendingRun?.worldStateBefore || {},
        sceneItems: sceneItemStateForModel(
            pendingRun?.sceneItemsAfter || pendingRun?.sceneItemsBefore || {},
            pendingRun?.worldStateAfter || pendingRun?.worldStateBefore || {},
        ),
        economy: pendingRun?.economyAfter || pendingRun?.economyBefore || {},
        boundCompanion: pendingRun?.boundCompanionAfter || pendingRun?.boundCompanionBefore || {},
        pendingBoundary: pendingRun?.pendingBoundaryAfter || pendingRun?.pendingBoundaryBefore || {},
    };
    const activeNpcNames = uniqueStrings([
        ...getActiveDisplayNpcNamesFromReport(trackerDisplaySnapshot?.npcs || {}, report),
        ...getConfirmedSceneNpcNamesFromSnapshot(trackerDisplaySnapshot),
    ]);
    const descriptiveArchive = normalizeDescriptiveArchive(pendingRun?.descriptiveArchiveAfter || pendingRun?.descriptiveArchiveBefore || {});
    const worldProgression = normalizeWorldProgression(pendingRun?.worldProgressionAfter || pendingRun?.worldProgressionBefore || {});
    const worldMemoryUpdateContext = buildWorldMemoryUpdateContext({
        archive: descriptiveArchive,
        progression: worldProgression,
        worldState: trackerDisplaySnapshot?.worldState || pendingRun?.worldStateAfter || pendingRun?.worldStateBefore || {},
        resolutionPacket: resolution,
        focusText: narrationText,
        sceneNames: activeNpcNames,
    });
    const powerActorState = {
        ...(pendingRun?.powerActorsBefore || {}),
        ...(pendingRun?.powerActorsAfter || {}),
    };
    const authorizedWorldEvidence = Array.isArray(handoff?.worldMemory?.observableEvidence)
        ? handoff.worldMemory.observableEvidence
        : [];
    const economyContext = renderEconomyTrackerContext({
        adventureGenre: pendingRun?.adventureGenre || getActiveAdventureGenre(),
        economyState: pendingRun?.economyAfter || pendingRun?.economyBefore || {},
        userCurrency: trackerDisplaySnapshot?.user?.currency || pendingRun?.userAfter?.currency || pendingRun?.userBefore?.currency || [],
    });

    const authority = {
        messageKey,

        latestUserText: pendingRun?.latestUserText || '',

        resolution: {

            goal: resolution.GOAL,

            outcome: resolution.Outcome,

            outcomeTier: resolution.OutcomeTier,

            landedActions: resolution.LandedActions,

            harmMode: resolution.harmMode,

            actionTargets: resolution.ActionTargets,

            oppTargets: resolution.OppTargets,

            npcInScene: resolution.NPCInScene,

            inflictedInjuries: resolution.InflictedInjuries,

            lootSearch: resolution.LootSearch,

            lootDiscovery: resolution.LootDiscovery,

            itemUse: resolution.ItemUse,

        },

        npcHandoffs: handoff.npcHandoffs || [],

        proactivityResults: handoff.proactivityResults || {},

        aggressionResults: sanitizeAggressionResultsForTrackerModel(handoff.aggressionResults),

        contextualInjuryCaps: pendingRun?.contextualInjuryCaps || [],

        nameGeneration: handoff.nameGeneration || {},

        npcEquipmentProfiles: handoff.npcEquipmentProfiles || [],

        sceneState: handoff.sceneState || pendingRun?.worldStateAfter || pendingRun?.worldStateBefore || {},

        economy: economyContext,
        boundCompanion: pendingRun?.boundCompanionAfter || pendingRun?.boundCompanionBefore || {},
        pendingBoundary: pendingRun?.pendingBoundaryAfter || pendingRun?.pendingBoundaryBefore || {},

        powerActorFavor: handoff.powerActorFavor || null,

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
    const semanticPersonalityEvidence = buildSemanticPersonalityEvidence({
        activeNpcNames,
        handoff,
        previousNpcs: previous.npcs,
        trackerNpcs: trackerDisplaySnapshot?.npcs || {},
        semanticTrackerNpcs,
    });
    const introTrackerInstruction = pendingRun?.adventureIntro
        ? 'ADVENTURE INTRO ONLY: No semantic or deterministic mechanics ran for this opening. Use FINAL_NARRATION to add tracker entries for named or foreground NPCs who are concretely present, speaking, acting, blocking access, offering help, threatening, guiding, or otherwise relevant to the first playable scene. Do not add background crowds, unnamed passersby, atmospheric groups, offscreen figures, lore-only names, or speculative NPCs. If a new foreground NPC is added and no stronger personality evidence exists, assign a compact stable personalitySummary from their visible behavior or a grounded deterministic-style profile. For WorldStateDelta.weatherCondition, copy clear, partly_cloudy, cloudy, overcast, light_rain, heavy_rain, or storm ONLY when FINAL_NARRATION explicitly establishes that opening weather; otherwise use unchanged. Set weatherTick=none for this opening.'
        : '';

    return [
        'STORY_ENGINE_POST_NARRATION_TRACKER_UPDATE',
        '',
        'You update tracker state and private world memory only. Do not narrate, roleplay, explain, or add prose.',
        'Return exactly one story_engine_tracker_delta fenced block followed by one story_engine_world_memory_delta fenced block, and nothing else.',

        '',

        '==TRACKER_CONTRACT==',
        TRACKER_DELTA_CONTRACT,
        introTrackerInstruction,
        'Use this exact shape:',
        TRACKER_DELTA_TEMPLATE,
        '',

        '==WORLD_MEMORY_CONTRACT==',
        WORLD_MEMORY_DELTA_CONTRACT,
        'Use this exact shape:',
        WORLD_MEMORY_DELTA_TEMPLATE,
        '',

        '==DESCRIPTIVE_ARCHIVE_UPDATE_CONTEXT==',
        JSON.stringify(worldMemoryUpdateContext.archive),
        '',
        '==PRIVATE_WORLD_PROGRESSION_UPDATE_CONTEXT==',
        JSON.stringify(worldMemoryUpdateContext.progression),
        '',
        '==POWER_ACTOR_STATE==',
        JSON.stringify(powerActorState),
        '',
        '==AUTHORIZED_WORLD_EVIDENCE==',
        JSON.stringify(authorizedWorldEvidence),
        '',

        '==ECONOMY_CONTEXT==',
        JSON.stringify(economyContext),
        '',

        '==PREVIOUS_TRACKER_SNAPSHOT==',
        JSON.stringify(previous),
        '',
        '==PREVIOUS_USER_KNOWLEDGE_LEDGER==',
        JSON.stringify(previous.userKnowledge || {}),
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
        '==SEMANTIC_PERSONALITY_EVIDENCE==',
        JSON.stringify(semanticPersonalityEvidence),
        '',
        '==FINAL_NARRATION==',
        narrationText || '(empty)',
        '',
        '==OUTPUT==',
    ].join('\n');
}

function buildSemanticPersonalityEvidence({ activeNpcNames, handoff, previousNpcs, trackerNpcs, semanticTrackerNpcs }) {
    const activeSet = new Set((activeNpcNames || []).map(name => String(name || '').trim()).filter(isRealName).map(name => name.toLowerCase()));
    const semanticByName = new Map();
    for (const item of semanticTrackerNpcs || []) {
        const name = String(item?.NPC || '').trim();
        if (!isRealName(name)) continue;
        const personalitySummary = cleanPersonalitySummary(item?.personalitySummary);
        if (personalitySummary) semanticByName.set(name.toLowerCase(), personalitySummary);
    }

    return (handoff?.npcHandoffs || [])
        .map(npc => {
            const name = String(npc?.NPC || '').trim();
            if (!isRealName(name)) return null;
            if (activeSet.size && !activeSet.has(name.toLowerCase())) return null;
            const existingSummary = cleanPersonalitySummary(previousNpcs?.[name]?.personalitySummary);
            const currentSummary = cleanPersonalitySummary(trackerNpcs?.[name]?.personalitySummary);
            const semanticSeed = semanticByName.get(name.toLowerCase()) || '';
            if (existingSummary && !semanticSeed) return null;
            return {
                NPC: name,
                existingPersonalitySummary: existingSummary,
                currentPersonalitySummary: currentSummary,
                semanticSeed,
                behaviorBand: npc?.Behavior || '',
                relationshipState: npc?.FinalState || '',
                lock: npc?.Lock || '',
                romanceStyle: npc?.RomanceStyle || '',
                establishedRelationship: npc?.EstablishedRelationship || 'N',
                boundaryStyle: npc?.IntimacyRefusalStyle || '',
            };
        })
        .filter(Boolean)
        .slice(0, 12);
}

async function requestPostNarrationTrackerDelta({ pendingRun, messageKey, narrationText, trackerDisplaySnapshot }, requestOptions = {}) {
    if (!isStoryEngineEnabled()) {
        throw new Error('Story Engine is disabled.');
    }
    const prompt = buildPostNarrationTrackerPrompt({ pendingRun, messageKey, narrationText, trackerDisplaySnapshot });
    const responseLength = 3600
        + Math.min(4000, Object.keys(trackerDisplaySnapshot?.npcs || {}).length * 320)
        + Math.min(2400, normalizeWorldProgression(pendingRun?.worldProgressionAfter || pendingRun?.worldProgressionBefore || {}).plans.length * 160);
    const toolDefinition = buildPostNarrationToolDefinition(TRACKER_DELTA_TOOL_NAME, {
        includeTrackerDelta: true,
        includeWorldMemoryDelta: true,
    });
    const bypassToken = requestOptions.bypassToken || promptReadyBypassGate.acquire();
    try {
        return await withStoryEngineModelRequest(modelRequest => withTrackerGenerationSettings(async settings => {
            return await requestPostNarrationUtility({
                settings,
                prompt,
                responseLength,
                toolDefinition,
                purpose: 'post-narration tracker update',
                validateStructured: raw => {
                    parsePostNarrationTrackerResponse(raw, narrationText);
                    parsePostNarrationWorldMemoryResponse(raw);
                },
            }, modelRequest);
        }), requestOptions);
    } finally {
        promptReadyBypassGate.release(bypassToken);
    }
}

async function requestPostNarrationTrackerDeltaWithTimeout(args, requestOptions = {}) {
    let timeoutId = null;
    const requestControl = createTimedInternalRequestControl(requestOptions);
    try {
        return await Promise.race([
            requestPostNarrationTrackerDelta(args, requestControl.options),
            new Promise((_, reject) => {
                timeoutId = setTimeout(
                    () => {
                        requestControl.cancel();
                        reject(new Error(`Post-narration tracker update timed out after ${Math.round(PROSE_GUARD_TIMEOUT_MS / 1000)} seconds.`));
                    },
                    PROSE_GUARD_TIMEOUT_MS,
                );
            }),
        ]);
    } finally {
        if (timeoutId != null) clearTimeout(timeoutId);
        requestControl.release();
    }
}

function prependComputedDebug(messageId, type) {
    if (!isStoryEngineEnabled()) {
        releaseProseGuardDisplayIntercept({ messageId });
        clearRuntimePrompts();
        return;
    }
    const context = getContext();
    const messageKey = getMessageKey(messageId, context);

    if (state.pendingRun && !isCurrentStoryEngineEpoch(state.pendingRun, context)) {
        invalidateStoryEnginePipeline();
        return;
    }

    if (!state.lastNarratorHandoff || state.lastNarratorHandoffKey === messageKey || type === 'impersonate') {
        releaseProseGuardDisplayIntercept({ messageId });
        clearRuntimePrompts();
        return;
    }

    const message = context?.chat?.[messageId];
    if (!message || message.is_user) {
        releaseProseGuardDisplayIntercept({ messageId });
        clearRuntimePrompts();
        return;
    }
    state.lastStoryEngineModelCallEndedAt = Date.now();

    const proseGuardEnabled = getProseGuardMode() !== PROSE_GUARD_MODES.OFF;
    if (state.postNarrationFinalizers.has(messageKey)) return;

    clearPendingRunCleanupTimer();
    if (proseGuardEnabled) {
        hideProseGuardMessageById(messageId);
    }
    setChatInputLocked(true, 'Finalizing narration...');
    const finalizingToast = showProgress('Finalizing narration...');
    const captured = {
        ...createStoryEngineEpochIdentity(context),
        narratorHandoff: state.lastNarratorHandoff,
        pendingRun: state.pendingRun,
    };
    const finalizerOwner = Symbol(messageKey);
    const releaseFinalizerOwnership = () => {
        if (state.postNarrationFinalizers.get(messageKey) === finalizerOwner) {
            state.postNarrationFinalizers.delete(messageKey);
        }
    };
    state.postNarrationFinalizers.set(messageKey, finalizerOwner);

    const finalize = () => {
        state.postNarrationFinalizerTimers.delete(messageKey);
        void finalizePostNarrationMessage(messageId, type, messageKey, finalizingToast, captured)
            .catch(error => {
                console.error(`[${EXTENSION_NAME}] post-narration finalization failed.`, error);
            })
            .finally(releaseFinalizerOwnership);
    };

    if (proseGuardEnabled) {
        const timer = setTimeout(finalize, PROSE_GUARD_DEFER_MS);
        state.postNarrationFinalizerTimers.set(messageKey, timer);
        return;
    }

    return finalizePostNarrationMessage(messageId, type, messageKey, finalizingToast, captured)
        .catch(error => {
            console.error(`[${EXTENSION_NAME}] post-narration finalization failed.`, error);
        })
        .finally(releaseFinalizerOwnership);
}

async function finalizePostNarrationMessage(messageId, type, messageKey, finalizingToast = null, captured = {}) {
    let finalNarrationRendered = false;
    let proseGuardFailureHandled = false;
    let proseGuardMode = PROSE_GUARD_MODES.AUTOMATIC;
    let finalizerContext = null;
    let trackerCommitted = false;
    let publishableNarrationText = '';
    let automaticProseGuardState = null;

    try {
        if (!isStoryEngineEnabled()) {
            clearRuntimePrompts();
            releaseProseGuardDisplayIntercept({ messageId });
            return;
        }
        const context = getContext();
        finalizerContext = context;
        if (!isPostNarrationFinalizerCurrent(context, messageId, messageKey, captured)) {
            return;
        }
        const requestOptions = {
            isCurrent: () => isPostNarrationFinalizerCurrent(context, messageId, messageKey, captured),
            expiredMessage: 'Post-narration model request expired because its chat or message changed.',
        };

        const message = context?.chat?.[messageId];
        if (!message || message.is_user || type === 'impersonate') {
            clearRuntimePrompts();
            return;
        }

        message.extra = message.extra || {};

        const rawAssistantText = getProseGuardMessageText(message);
        const visibleText = stripComputedDebugPrefix(rawAssistantText);
        let narrationText = sanitizeAssistantNarration(visibleText);
        const originalNarrationText = narrationText;
        const narratorHandoff = captured?.narratorHandoff ?? state.lastNarratorHandoff;
        const pendingRun = captured?.pendingRun ?? state.pendingRun;
        const proseGuardReconciliation = captured?.proseGuardReconciliation === true;
        const proseGuardReconciliationSeed = compactProseGuardPendingRun(pendingRun);
        let trackerDeltaWarning = null;
        const settings = getSettings();
        proseGuardMode = getProseGuardMode(settings);
        const root = getTrackerRoot(context);
        const rapportClockBefore = clone(root?.rapportClock);
        let finalTrackerDisplaySnapshot = null;
        if (!proseGuardReconciliation) {
            clearMessageProseGuardState(message);
            clearMessageProseGuardReconciliationSeed(message);
        }

        if (!isPostNarrationFinalizerCurrent(context, messageId, messageKey, captured)) {
            return;
        }

        if (!proseGuardReconciliation && proseGuardMode === PROSE_GUARD_MODES.AUTOMATIC && narrationText) {
            try {
                await deferForProseGuardFinalization();
                if (!isPostNarrationFinalizerCurrent(context, messageId, messageKey, captured)) return;
                const targetedRepair = await applyTargetedProseBanRepairIfNeeded(narrationText, requestOptions);
                if (!isPostNarrationFinalizerCurrent(context, messageId, messageKey, captured)) return;
                narrationText = targetedRepair.narrationText;
                if (targetedRepair.appliedRepairs.length) {
                    automaticProseGuardState = buildAutomaticProseGuardState(targetedRepair);
                }
            } catch (error) {
                let current = true;
                try {
                    current = typeof requestOptions.isCurrent !== 'function' || requestOptions.isCurrent();
                } catch {
                    current = false;
                }
                if (!current) throw error;
                const enforcementError = error instanceof ProseGuardEnforcementError
                    ? error
                    : new ProseGuardEnforcementError(
                        'Prose Guard could not produce validated narration.',
                        { cause: error },
                    );
                narrationText = originalNarrationText;
                const originalFindings = collectProseGuardSentenceFindings(
                    originalNarrationText,
                    getTargetedProseBanRules(),
                );
                automaticProseGuardState = buildAutomaticProseGuardFailureState(originalFindings, enforcementError);
            }
        }
        publishableNarrationText = narrationText;

        if (root && pendingRun) {
            let trackerDisplaySnapshot = buildDisplayTrackerSnapshot({
                messageKey,

                pendingRun,

                report: pendingRun.report,

                assistantText: narrationText,

            });
            let worldMemoryDelta = null;
            let namePromotions = [];

            try {

                const trackerRaw = await requestPostNarrationTrackerDeltaWithTimeout({

                    pendingRun,

                    messageKey,

                    narrationText,

                    trackerDisplaySnapshot,

                }, requestOptions);
                if (!isPostNarrationFinalizerCurrent(context, messageId, messageKey, captured)) return;
                const postNarrationDelta = parsePostNarrationTrackerResponse(trackerRaw, narrationText);
                try {
                    worldMemoryDelta = parsePostNarrationWorldMemoryResponse(trackerRaw);
                } catch (error) {
                    const warning = error instanceof Error ? error.message : String(error);
                    trackerDeltaWarning = `World memory delta was rejected: ${warning}`;
                    console.warn(`[${EXTENSION_NAME}] world memory delta failed validation; preserving private world state.`, error);
                }

                const presentedLatentFavorId = verifyLatentFavorPresentation(
                    postNarrationDelta,
                    pendingRun?.report?.finalNarrativeHandoff?.powerActorFavor,
                    pendingRun?.latentFavorsAfter ?? pendingRun?.latentFavorsBefore ?? [],
                    narrationText,
                );

                const clampedTrackerDelta = applyContextualInjuryCapsToTrackerDelta(postNarrationDelta, pendingRun.contextualInjuryCaps);
                const lootReconciledTrackerDelta = reconcileLootPossessionTransfers(trackerDisplaySnapshot, clampedTrackerDelta);
                const possessionReconciliation = reconcilePostNarrationPossessionDelta({
                    snapshot: trackerDisplaySnapshot,
                    delta: lootReconciledTrackerDelta,
                    narration: narrationText,
                    itemUse: pendingRun?.resolutionPacket?.ItemUse || {},
                    worldState: trackerDisplaySnapshot?.worldState || pendingRun?.worldStateAfter || {},
                    userNames: getPersonaIdentityHints(context),
                });
                if (Array.isArray(pendingRun.report?.auditLines) && possessionReconciliation.audit.length) {
                    pendingRun.report.auditLines.push(...possessionReconciliation.audit.map(line => `POST_NARRATION ${line}`));
                }
                const reconciledTrackerDelta = {
                    ...possessionReconciliation.delta,
                    sceneItemState: possessionReconciliation.sceneItems,
                };
                const mergedTrackerDisplaySnapshot = mergePostNarrationTrackerDelta(trackerDisplaySnapshot, reconciledTrackerDelta, {
                    messageKey,
                    latestUserText: pendingRun.latestUserText,
                    assistantText: narrationText,
                    beforeNpcs: pendingRun.trackerBefore,
                    userKnowledgeBefore: pendingRun.userKnowledgeBefore,
                    userReputationBefore: pendingRun.userReputationBefore,
                    worldStateBefore: pendingRun.worldStateBefore,
                    economyBefore: pendingRun.economyBefore,
                    boundCompanionBefore: pendingRun.boundCompanionBefore,
                    pendingBoundaryBefore: pendingRun.pendingBoundaryBefore,
                    pendingRun,
                    context,
                });
                const lootCompletion = finalizeLootSearchCompletion(
                    mergedTrackerDisplaySnapshot.npcs,
                    pendingRun.resolutionPacket?.LootDiscovery,
                );
                if (lootCompletion.required && !lootCompletion.completed) {
                    throw new Error(`Loot tracker transaction was incomplete: ${lootCompletion.reason}.`);
                }
                mergedTrackerDisplaySnapshot.npcs = lootCompletion.npcs;
                namePromotions = (postNarrationDelta.npcs || [])
                    .map(item => ({
                        oldName: String(item?.NPC || '').trim(),
                        newName: String(item?.revealedName || '').trim(),
                    }))
                    .filter(item => item.oldName && item.newName);
                if (presentedLatentFavorId) {
                    pendingRun.latentFavorsAfter = consumeLatentFavorById(
                        pendingRun.latentFavorsAfter ?? pendingRun.latentFavorsBefore ?? [],
                        presentedLatentFavorId,
                    );
                    mergedTrackerDisplaySnapshot.latentFavorIds = latentFavorIds(pendingRun.latentFavorsAfter);
                    if (pendingRun.report?.latentFavors) {
                        pendingRun.report.latentFavors.after = clone(pendingRun.latentFavorsAfter);
                    }
                    if (Array.isArray(pendingRun.report?.audit)) {
                        pendingRun.report.audit.push(`POST_NARRATION latentFavorConsumed=${presentedLatentFavorId}`);
                    }
                }
                trackerDisplaySnapshot = mergedTrackerDisplaySnapshot;
            } catch (error) {

                trackerDeltaWarning = error instanceof Error ? error.message : String(error);

                console.warn(`[${EXTENSION_NAME}] post-narration tracker update failed; keeping mechanical tracker snapshot.`, error);
                notifyInfo('Narration completed, but its tracker delta was incomplete. Mechanical state was preserved; narration-only tracker changes may be missing.', EXTENSION_NAME, { timeOut: 8000 });

            }

            const finalWorldState = trackerDisplaySnapshot.worldState || pendingRun.worldStateAfter || pendingRun.worldStateBefore || {};
            const finalPowerActors = {
                ...(pendingRun.powerActorsBefore || {}),
                ...(trackerDisplaySnapshot.powerActors || pendingRun.powerActorsAfter || {}),
            };
            const protectedUserNames = getPersonaIdentityHints(context);
            const finalizedProgression = advanceDueWorldPlans(
                pendingRun.worldProgressionBefore || {},
                pendingRun.worldProgressionAdvancements || [],
                finalWorldState,
                {
                    requiredPlanIds: pendingRun.worldProgressionDuePlanIds || [],
                    allowUnexpected: true,
                    messageKey,
                    powerActors: finalPowerActors,
                    protectedUserNames,
                },
            );
            pendingRun.worldProgressionAfter = finalizedProgression.progression;
            if (Array.isArray(pendingRun.report?.auditLines) && finalizedProgression.audit.length) {
                pendingRun.report.auditLines.push(...finalizedProgression.audit.map(line => `WORLD_PROGRESSION_FINAL ${line}`));
            }
            const worldMemoryResult = applyWorldMemoryDelta({
                archive: pendingRun.descriptiveArchiveBefore || {},
                progression: pendingRun.worldProgressionAfter || {},
            }, worldMemoryDelta || {}, {
                beforeWorldState: pendingRun.worldStateBefore || {},
                afterWorldState: finalWorldState,
                powerActors: finalPowerActors,
                authorizedEvidence: pendingRun?.report?.finalNarrativeHandoff?.worldMemory?.observableEvidence || [],
                promotions: [
                    ...(pendingRun.worldMemoryNamePromotions || []),
                    ...namePromotions,
                ],
                protectedUserNames,
                narrationText,
                messageKey,
            });
            pendingRun.descriptiveArchiveAfter = worldMemoryResult.archive;
            pendingRun.worldProgressionAfter = worldMemoryResult.progression;
            if (Array.isArray(pendingRun.report?.auditLines) && worldMemoryResult.audit.length) {
                pendingRun.report.auditLines.push(...worldMemoryResult.audit.map(line => `WORLD_MEMORY ${line}`));
            }



            const hiddenHealthAfter = pendingRun.healthAfter
                ? normalizeHiddenHealth(pendingRun.healthAfter, { user: trackerDisplaySnapshot.user, npcs: trackerDisplaySnapshot.npcs })
                : null;
            trackerDisplaySnapshot.hiddenHealth = cloneHiddenHealth(hiddenHealthAfter || root.health);

            if (!isPostNarrationFinalizerCurrent(context, messageId, messageKey, captured)) return;
            await saveTrackerUpdate(context, buildTrackerUpdateForPersistence(
                trackerDisplaySnapshot,
                hiddenHealthAfter,
                pendingRun.latentGrievancesAfter ?? pendingRun.latentGrievancesBefore ?? [],
                pendingRun.latentFavorsAfter ?? pendingRun.latentFavorsBefore ?? [],
                {
                    descriptiveArchive: pendingRun.descriptiveArchiveAfter || pendingRun.descriptiveArchiveBefore || {},
                    worldProgression: pendingRun.worldProgressionAfter || pendingRun.worldProgressionBefore || {},
                    rapportClock: pendingRun.rapportClockAfter,
                },
            ), {
                save: false,
                retainLatentFavorStates: [pendingRun.latentFavorsBefore || [], pendingRun.latentFavorsAfter || []],
            });
            if (!isPostNarrationFinalizerCurrent(context, messageId, messageKey, captured)) return;

            root.snapshots[messageKey] = {

                before: clone(pendingRun.trackerBefore),
                beforeUser: clone(pendingRun.userBefore),
                beforeHealth: cloneHiddenHealth(pendingRun.healthBefore || root.health),
                beforePowerActors: clone(pendingRun.powerActorsBefore),
                beforeLatentGrievanceIds: latentGrievanceIds(pendingRun.latentGrievancesBefore || []),
                beforeLatentFavorIds: latentFavorIds(pendingRun.latentFavorsBefore || []),
                beforeUserKnowledge: clone(pendingRun.userKnowledgeBefore || {}),
                beforeUserReputation: clone(pendingRun.userReputationBefore || {}),
                beforeWorldState: clone(pendingRun.worldStateBefore || {}),
                beforeSceneItems: clone(pendingRun.sceneItemsBefore || {}),
                beforeEconomy: clone(pendingRun.economyBefore || {}),
                beforeBoundCompanion: clone(pendingRun.boundCompanionBefore || {}),
                beforePendingBoundary: clone(pendingRun.pendingBoundaryBefore || {}),
                beforeSpellCasting: clone(pendingRun.spellCastingBefore || {}),
                after: clone(trackerDisplaySnapshot.npcs),
                afterUser: clone(trackerDisplaySnapshot.user),
                afterHealth: cloneHiddenHealth(hiddenHealthAfter || root.health),
                afterPowerActors: clone(trackerDisplaySnapshot.powerActors || {}),
                afterLatentGrievanceIds: latentGrievanceIds(pendingRun.latentGrievancesAfter || []),
                afterLatentFavorIds: latentFavorIds(pendingRun.latentFavorsAfter || []),
                afterUserKnowledge: clone(trackerDisplaySnapshot.userKnowledge || {}),
                afterUserReputation: clone(trackerDisplaySnapshot.userReputation || {}),
                afterWorldState: clone(trackerDisplaySnapshot.worldState || {}),
                afterSceneItems: clone(trackerDisplaySnapshot.sceneItems || {}),
                afterEconomy: clone(trackerDisplaySnapshot.economy || {}),
                afterBoundCompanion: clone(trackerDisplaySnapshot.boundCompanion || {}),
                afterPendingBoundary: clone(trackerDisplaySnapshot.pendingBoundary || {}),
                afterSpellCasting: clone(trackerDisplaySnapshot.spellCasting || pendingRun.spellCastingAfter || {}),
                beforeRapportClock: clone(rapportClockBefore),
                display: clone(trackerDisplaySnapshot),
                type: pendingRun.type,

                trackerDeltaWarning,

                savedAt: Date.now(),

            };
            pruneRootTrackerSnapshots(root);
            trackerCommitted = true;

            if (proseGuardReconciliationSeed) {
                const committedRun = {
                    messageId,
                    messageKey,
                    type,
                    narratorHandoff,
                    pendingRun: proseGuardReconciliationSeed,
                };
                state.proseGuardCommittedRun = committedRun;
                setMessageProseGuardReconciliationSeed(message, committedRun);
            }

            finalTrackerDisplaySnapshot = trackerDisplaySnapshot;
            if (state.pendingRun === pendingRun) state.pendingRun = null;
        }

        if (!isPostNarrationFinalizerCurrent(context, messageId, messageKey, captured)) {
            return;
        }

        narrationText = applyDeterministicNarrationFormatting(narrationText, {
            trackerDisplaySnapshot: finalTrackerDisplaySnapshot,
            pendingRun,
            context,
        });
        const proseGuardFormattingOptions = {
            trackerDisplaySnapshot: finalTrackerDisplaySnapshot,
            pendingRun,
            context,
        };
        if (proseGuardReconciliation) {
            const reconciledState = formatProseGuardStateForMessage(
                captured.proseGuardState,
                narrationText,
                narrationText,
                proseGuardFormattingOptions,
            ).state;
            if (reconciledState) setMessageProseGuardState(message, reconciledState);
            else clearMessageProseGuardState(message);
        } else if (proseGuardMode === PROSE_GUARD_MODES.REVIEW) {
            const findings = collectProseGuardSentenceFindings(narrationText, getTargetedProseBanRules());
            if (findings.length) {
                setMessageProseGuardState(message, buildReviewProseGuardState(findings));
            }
        } else if (automaticProseGuardState) {
            const formattedAutomaticState = formatProseGuardStateForMessage(
                automaticProseGuardState,
                narrationText,
                narrationText,
                proseGuardFormattingOptions,
            ).state;
            setMessageProseGuardState(message, formattedAutomaticState);
        }
        publishableNarrationText = narrationText;

        maybeRecordProgressionAccomplishment({ pendingRun, messageKey, context });
        if (finalTrackerDisplaySnapshot) setMessageTrackerDisplaySnapshot(message, finalTrackerDisplaySnapshot);
        if (pendingRun) setMessageWorldMemorySwipeSnapshot(message, buildWorldMemorySwipeSnapshot(messageKey, pendingRun));
        setMessageProgressionSwipeSnapshot(message, buildProgressionSwipeSnapshot(messageKey, context));

        message.mes = narrationText;
        message.extra.display_text = narrationText;
        setMessageNarratorHandoff(message, narratorHandoff);
        state.lastNarratorHandoffKey = messageKey;
        state.lastNarratorHandoff = '';

        hideProseGuardMessageById(messageId);
        if (typeof context.updateMessageBlock === 'function') {
            await context.updateMessageBlock(messageId, message);
        } else {
            const textElement = getMessageTextElement(messageId);
            if (textElement) textElement.textContent = narrationText;
        }
        releaseProseGuardDisplayIntercept({ messageId });
        finalNarrationRendered = true;
        if (automaticProseGuardState?.automaticRepairFailed) {
            notifyInfo(
                'Automatic repair failed. The original narration is shown; review the reported violation in Prose Guard.',
                `${EXTENSION_NAME}: Prose Guard warning`,
                { timeOut: 9000, extendedTimeOut: 9000 },
            );
        }
        renderNarratorHandoffBlockForMessage(messageId, null, context);
        renderTrackerDisplayBlockForMessage(messageId, null, context);
        renderTrackerWidget(context);
        renderNarratorHandoffWidget(context);
        renderProgressionCard(context);

        if (!isPostNarrationFinalizerCurrent(context, messageId, messageKey, captured)) return;
        await saveChat(context, { fallbackToMetadata: true });

        if (!isPostNarrationFinalizerCurrent(context, messageId, messageKey, captured)) return;
        clearRuntimePrompts();
        state.chatSignature = captureChatSignature(context);
    } catch (error) {
        let current = true;
        try {
            current = typeof captured?.runEpoch !== 'undefined'
                ? isPostNarrationFinalizerCurrent(finalizerContext || getContext(), messageId, messageKey, captured)
                : true;
        } catch {
            current = false;
        }

        if (current && !finalNarrationRendered && !proseGuardFailureHandled) {
            const context = finalizerContext || getContext();
            if (captured?.proseGuardReconciliation) {
                releaseProseGuardDisplayIntercept({ messageId });
                proseGuardFailureHandled = true;
            } else if (trackerCommitted && publishableNarrationText) {
                const message = context?.chat?.[messageId];
                if (message && !message.is_user) {
                    message.extra = message.extra || {};
                    message.mes = publishableNarrationText;
                    message.extra.display_text = publishableNarrationText;
                    const textElement = getMessageTextElement(messageId);
                    if (textElement) textElement.textContent = publishableNarrationText;
                    releaseProseGuardDisplayIntercept({ messageId });
                    finalNarrationRendered = true;
                }
            } else {
                await resolveFailedProseGuardDraft(context, messageId);
                releaseProseGuardDisplayIntercept({ messageId });
                proseGuardFailureHandled = true;
            }
        }
        throw error;
    } finally {
        clearProgress(finalizingToast);
        if (isCurrentStoryEngineEpoch(captured)) {
            if (!finalNarrationRendered && !proseGuardFailureHandled) {
                releaseProseGuardDisplayIntercept({ messageId });
            }
            setChatInputLocked(false);
        }
    }
}


async function handleMessageDeleted(newLength) {
    if (!isStoryEngineEnabled()) {
        disableStoryEngineRuntime();
        state.chatSignature = captureChatSignature();
        return;
    }
    invalidateStoryEnginePipeline();
    const context = getContext();
    const operationIdentity = createStoryEngineEpochIdentity(context);
    const root = getTrackerRoot(context);

    if (!root) return;



    const currentSignature = captureChatSignature(context);

    const firstAffectedIndex = firstChangedIndex(state.chatSignature, currentSignature);

    const chatLength = Number.isFinite(Number(newLength))

        ? Number(newLength)

        : Array.isArray(context?.chat) ? context.chat.length : 0;

    const chatId = getChatId(context);
    const firstAffectedMessageId = Math.min(chatLength, firstAffectedIndex);

    let restoreCandidate = null;

    removeProgressionRecordsAtOrAfterMessageId(chatId, firstAffectedMessageId, context);



    for (const [key, snapshot] of Object.entries(root.snapshots || {})) {
        const { chatId: snapshotChatId, messageId } = splitMessageKey(key);
        if (snapshotChatId !== chatId) continue;
        if (Number.isFinite(messageId) && messageId >= firstAffectedMessageId) {
            if (snapshot?.before && (!restoreCandidate || messageId < restoreCandidate.messageId)) {
                restoreCandidate = { messageId, before: snapshot.before, beforeUser: snapshot.beforeUser, beforeHealth: snapshot.beforeHealth, beforePowerActors: snapshot.beforePowerActors, beforeLatentGrievanceIds: snapshot.beforeLatentGrievanceIds, beforeLatentFavorIds: snapshot.beforeLatentFavorIds, beforeUserKnowledge: snapshot.beforeUserKnowledge, beforeUserReputation: snapshot.beforeUserReputation, beforeWorldState: snapshot.beforeWorldState, beforeSceneItems: snapshot.beforeSceneItems, beforeEconomy: snapshot.beforeEconomy, beforeBoundCompanion: snapshot.beforeBoundCompanion, beforePendingBoundary: snapshot.beforePendingBoundary, beforeSpellCasting: snapshot.beforeSpellCasting };
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
        root.health = normalizeHiddenHealth(restoreCandidate.beforeHealth || root.health, { user: root.user, npcs: root.npcs });
        root.powerActors = restoreCandidate.beforePowerActors || {};
        root.latentGrievances = resolveStoredLatentGrievances(root, restoreCandidate.beforeLatentGrievanceIds);
        root.latentFavors = resolveStoredLatentFavors(root, restoreCandidate.beforeLatentFavorIds);
        root.userKnowledge = mergeUserKnowledgeLedger(restoreCandidate.beforeUserKnowledge || {}, {});
        root.userReputation = mergeUserReputationLedger(restoreCandidate.beforeUserReputation || {}, {});
        root.worldState = normalizeWorldState(restoreCandidate.beforeWorldState || root.worldState || {});
        root.sceneItems = normalizeSceneItemState(restoreCandidate.beforeSceneItems || {}, root.worldState);
        rebuildWorldMemoryFromSelectedSwipes(context);
        root.economy = normalizeEconomyState(restoreCandidate.beforeEconomy || root.economy || {});
        root.boundCompanion = normalizeBoundCompanionState(restoreCandidate.beforeBoundCompanion || root.boundCompanion || {});
        root.pendingBoundary = normalizePendingBoundaryState(restoreCandidate.beforePendingBoundary || root.pendingBoundary || {});
        root.spellCasting = normalizeSpellCastingState(restoreCandidate.beforeSpellCasting || root.spellCasting || {});
        await persistMetadata(context);
        if (!isCurrentStoryEngineEpoch(operationIdentity, context)) return;
        console.info(`[${EXTENSION_NAME}] restored tracker snapshot after message deletion from index ${firstAffectedMessageId}`);

    } else if (restoreTrackerFromLatestDisplaySnapshot(context)) {

        await persistMetadata(context);
        if (!isCurrentStoryEngineEpoch(operationIdentity, context)) return;

        console.info(`[${EXTENSION_NAME}] restored tracker display snapshot after message deletion.`);

    } else {
        rebuildWorldMemoryFromSelectedSwipes(context);
        await persistMetadata(context);
        if (!isCurrentStoryEngineEpoch(operationIdentity, context)) return;
    }

    if (!isCurrentStoryEngineEpoch(operationIdentity, context)) return;
    setTimeout(() => {
        if (isCurrentStoryEngineEpoch(operationIdentity, context)) renderAllTrackerDisplayBlocks(context);
    }, 0);
    setTimeout(() => {
        if (isCurrentStoryEngineEpoch(operationIdentity, context)) renderProgressionCard(context);
    }, 0);
}


async function handleMessageSwiped(messageId) {
    if (!isStoryEngineEnabled()) {
        disableStoryEngineRuntime();
        state.chatSignature = captureChatSignature();
        return;
    }
    invalidateStoryEnginePipeline();
    const context = getContext();
    const operationIdentity = createStoryEngineEpochIdentity(context);
    const resolvedMessageId = Number.isFinite(Number(messageId)) ? Number(messageId) : null;

    const trackerRestored = resolvedMessageId != null
        ? restoreTrackerFromMessageDisplaySnapshot(resolvedMessageId, context)
        : false;
    const fallbackTrackerRestored = trackerRestored ? false : restoreTrackerFromLatestDisplaySnapshot(context);
    const worldMemoryRestored = rebuildWorldMemoryFromSelectedSwipes(context);
    const progressionRestored = resolvedMessageId != null
        ? restoreProgressionFromMessageSwipe(resolvedMessageId, context)
        : false;
    if (trackerRestored || fallbackTrackerRestored || worldMemoryRestored || progressionRestored) {
        await persistMetadata(context);
        if (!isCurrentStoryEngineEpoch(operationIdentity, context)) return;
    }
    if (!isCurrentStoryEngineEpoch(operationIdentity, context)) return;
    state.lastNarratorHandoffKey = null;
    state.chatSignature = captureChatSignature();
    clearRuntimePrompts();
    setTimeout(() => {
        if (isCurrentStoryEngineEpoch(operationIdentity, context)) renderAllTrackerDisplayBlocks(context);
    }, 0);
    setTimeout(() => {
        if (isCurrentStoryEngineEpoch(operationIdentity, context)) renderProgressionCard(context);
    }, 0);
}


function handleChatChanged() {
    if (!isStoryEngineEnabled()) {
        disableStoryEngineRuntime();
        state.chatSignature = captureChatSignature();
        return;
    }
    const generationActive = state.generationActive;
    invalidateStoryEnginePipeline();
    const context = getContext();
    if (generationActive) abortActiveGeneration(context);
    injectPromptOptionPrompts();
    getPlayerRoot(context);
    const trackerRestored = restoreTrackerFromLatestDisplaySnapshot(context);
    if (!trackerRestored) rebuildWorldMemoryFromSelectedSwipes(context);
    cleanVisibleDebugDisplays(context);
    state.chatSignature = captureChatSignature();
    const renderIdentity = createStoryEngineEpochIdentity(context);
    setTimeout(() => {
        if (!isCurrentStoryEngineEpoch(renderIdentity)) return;
        renderAllTrackerDisplayBlocks(context);
        renderPlayerSetupCard(context);
        renderProgressionCard(context);
    }, 0);
}


function handlePersonaChanged() {
    if (!isStoryEngineEnabled()) {
        disableStoryEngineRuntime();
        return;
    }
    const generationActive = state.generationActive;
    invalidateStoryEnginePipeline();
    const context = getContext();
    if (generationActive) abortActiveGeneration(context);
    injectPromptOptionPrompts();
    getPlayerRoot(context);
    const renderIdentity = createStoryEngineEpochIdentity(context);
    setTimeout(() => {
        if (!isCurrentStoryEngineEpoch(renderIdentity, context)) return;
        renderPlayerSetupCard(context);
        renderProgressionCard(context);
    }, 0);
}


function handleGenerationLifecycleStart(type, params, dryRun) {
    ensureProseGuardDisplayInterceptor(type, params, dryRun);
    if (dryRun === true) return;
    state.generationActive = isStoryEngineEnabled();
}


function handleGenerationLifecycleEnd() {
    state.generationActive = false;
    if (!isStoryEngineEnabled()) {
        disableStoryEngineRuntime();
        return;
    }
    if (state.trackerUpdating) return;
    clearAllProgress();
    state.pendingGeneration = null;
    state.startAdventureReasoningCleanupPending = false;
    if (isNarratorGenerationArmed()) {
        clearRuntimePrompts({ preserveNarratorDepthPrompt: true });
        scheduleNarratorGeneration();
        return;
    }
    clearRuntimePrompts();

    if (!state.pendingRun) {
        releaseProseGuardDisplayIntercept();
    } else if (!state.pendingRunCleanupTimer) {
        setChatInputLocked(true, 'Finalizing narration...');
        const pendingRun = state.pendingRun;
        const cleanupIdentity = {
            runEpoch: pendingRun.runEpoch,
            chatId: pendingRun.chatId,
            personaId: pendingRun.personaId,
        };
        state.pendingRunCleanupTimer = setTimeout(() => {
            state.pendingRunCleanupTimer = null;
            if (!isCurrentStoryEngineEpoch(cleanupIdentity) || state.pendingRun !== pendingRun) return;
            state.pendingRun = null;
            state.lastNarratorHandoff = '';
            state.lastNarratorHandoffKey = null;
            releaseProseGuardDisplayIntercept();
            setChatInputLocked(false);
            console.warn(`[${EXTENSION_NAME}] cleared pending pre-flight handoff because no assistant message was received after generation ended.`);
        }, 5000);
    }
    setTimeout(() => {
        renderAllTrackerDisplayBlocks();
        renderProgressionCard();
    }, 0);
}

function handleGenerationLifecycleStopped() {
    state.generationActive = false;
    if (consumeInternalGenerationStop()) {
        handleGenerationLifecycleEnd();
        return;
    }

    cancelStoryEnginePipeline('Human stop button pressed');
    setTimeout(() => {
        renderAllTrackerDisplayBlocks();
        renderProgressionCard();
    }, 0);
}

const STORY_ENGINE_EVENT_HANDLERS = Object.freeze([
    ['MESSAGE_RECEIVED', prependComputedDebug],
    ['MESSAGE_DELETED', handleMessageDeleted],
    ['MESSAGE_SWIPED', handleMessageSwiped],
    ['CHAT_CHANGED', handleChatChanged],
    ['CHAT_CREATED', handleChatChanged],
    ['PERSONA_CHANGED', handlePersonaChanged],
    ['GENERATION_STARTED', handleGenerationLifecycleStart],
    ['GENERATION_ENDED', handleGenerationLifecycleEnd],
    ['GENERATION_STOPPED', handleGenerationLifecycleStopped],
    ['CHAT_COMPLETION_SETTINGS_READY', handleChatCompletionSettingsReady],
    ['CHAT_COMPLETION_PROMPT_READY', handleChatCompletionPromptReady],
]);


function subscribeMessageHandler() {

    if (state.subscribed) return;



    const context = getContext();

    if (!STORY_ENGINE_EVENT_HANDLERS.every(([eventType]) => canSubscribeToEvent(eventType, context))) return;

    const subscribedHandlers = [];
    try {
        for (const [eventType, handler] of STORY_ENGINE_EVENT_HANDLERS) {
            if (!onEvent(eventType, handler, context, { warn: false })) {
                throw new Error(`SillyTavern event subscription failed for ${eventType}.`);
            }
            subscribedHandlers.push([eventType, handler]);
        }
    } catch (error) {
        for (const [eventType, handler] of subscribedHandlers.reverse()) {
            try {
                offEvent(eventType, handler, context, { warn: false });
            } catch {
                // Best-effort rollback keeps a partial subscription from being accepted as initialized.
            }
        }
        console.warn(`[${EXTENSION_NAME}] event handlers were not subscribed atomically.`, error);
        return;
    }
    state.subscribed = true;
}


globalThis.StructuredPreflightEngines_generationInterceptor = async function (coreChat, contextSize, abort, type) {
    subscribeMessageHandler();

    if (!isStoryEngineEnabled()) {
        disableStoryEngineRuntime();
        return false;
    }

    if (state.trackerUpdating) {
        notifyInfo('Story Engine is finalizing narration. Please wait a moment before sending another message.', EXTENSION_NAME, { timeOut: 4000 });
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

    const interceptorIdentity = createStoryEngineEpochIdentity(context);

    if (isNarratorGenerationPromptPass()) {
        try {
            injectPromptOptionPrompts();
            activateNarratorGenerationPass(context, contextSize, type);
            showProgress('Preparing native narrator handoff...');
            return false;
        } catch (error) {
            clearRuntimePrompts();
            state.pendingRun = null;
            state.lastNarratorHandoff = '';
            releaseProseGuardDisplayIntercept();
            clearAllProgress();
            showBlockingError(error);
            if (typeof abort === 'function') abort(true);
            return true;
        }
    }

    const latestUserText = getLatestUserTextFromContext(context);

    const userInputMode = detectStructuredUserInputMode(latestUserText);

    if (userInputMode.mode === 'ooc') {

        clearRuntimePrompts();
        injectPromptOptionPrompts();
        const runIdentity = createStoryEngineRunIdentity(context);
        state.pendingGeneration = {
            ...runIdentity,
            type: type || 'normal',

            mode: 'ooc',

            rawUserText: latestUserText,

            latestUserText: userInputMode.innerText || latestUserText,

            createdAt: Date.now(),

        };
        state.activeRunId = runIdentity.runId;
        releaseProseGuardDisplayIntercept();
        showProgress('Handling out-of-character reply...');
        return false;
    }


    injectPromptOptionPrompts();



    if (playerSetupNeeded(context)) {
        const root = getPlayerRoot(context);
        root.creator = root.creator || { stage: 'offer' };
        await persistMetadata(context);
        if (!isCurrentStoryEngineEpoch(interceptorIdentity)) return true;
        renderPlayerSetupCard(context);
        clearRuntimePrompts();

        clearAllProgress();

        notifyInfo('Complete Player Setup before roleplay generation can continue.', EXTENSION_NAME, { timeOut: 7000 });

        if (typeof abort === 'function') abort(true);
        return true;
    }

    if (progressionPending(context)) {
        await persistMetadata(context);
        if (!isCurrentStoryEngineEpoch(interceptorIdentity)) return true;
        renderProgressionCard(context);
        clearRuntimePrompts();
        clearAllProgress();
        notifyInfo('Complete Character Progression before roleplay generation can continue.', EXTENSION_NAME, { timeOut: 7000 });
        if (typeof abort === 'function') abort(true);
        return true;
    }

    state.chatSignature = captureChatSignature(context);
    restoreTrackerForRegeneration(type);

    getTrackerRoot(context);

    const runIdentity = createStoryEngineRunIdentity(context);
    state.pendingGeneration = {
        ...runIdentity,
        type: type || 'normal',
        mode: userInputMode.mode === 'proxy' ? 'proxy' : 'normal',
        rawUserText: latestUserText,

        latestUserText: userInputMode.innerText || latestUserText,
        inlineProxyInstructions: userInputMode.inlineProxyInstructions || [],
        coAuthorModeEnabled: getSettings().coAuthorModeEnabled === true,
        sceneStyleProfile: getSceneStyleProfilePrompt(getSettings()),

        trackerSnapshot: buildTrackerSnapshot(context),
        playerTrackerSnapshot: buildPlayerTrackerSnapshot(context),
        powerActorSnapshot: buildPowerActorSnapshot(context),
        latentGrievanceSnapshot: buildLatentGrievanceSnapshot(context),
        latentFavorSnapshot: buildLatentFavorSnapshot(context),
        userKnowledgeSnapshot: buildUserKnowledgeSnapshot(context),
        userReputationSnapshot: buildUserReputationSnapshot(context),
        worldStateSnapshot: buildWorldStateSnapshot(context),
        sceneItemStateSnapshot: buildSceneItemStateSnapshot(context),
        descriptiveArchiveSnapshot: buildDescriptiveArchiveSnapshot(context),
        worldProgressionSnapshot: buildWorldProgressionSnapshot(context),
        economySnapshot: buildEconomySnapshot(context),
        boundCompanionSnapshot: buildBoundCompanionSnapshot(context),
        pendingBoundarySnapshot: buildPendingBoundarySnapshot(context),
        spellCastingSnapshot: buildSpellCastingSnapshot(context, parseCoreStatsBlock(getPersonaText(context))),
        knownSpellNames: extractPersonaSpells(getPersonaText(context)).map(entry => String(entry?.name || '').trim()).filter(Boolean),
        adventureGenre: getActiveAdventureGenre(context),
        adventureStartPrompt: getBeginningAdventureStartPrompt(context, type),
        contextSize,
        createdAt: Date.now(),
    };
    state.activeRunId = runIdentity.runId;
    releaseProseGuardDisplayIntercept();
    showProgress('Computing structured pre-flight...');

    const pendingGeneration = state.pendingGeneration;
    if (isBeginningAdventureIntroGeneration(pendingGeneration, context)) {
        return false;
    }

    if (typeof abort !== 'function') {
        const error = new Error('SillyTavern generation interceptor abort API is unavailable; generation stopped before unsafe narration.');
        state.generationActive = false;
        state.pendingGeneration = null;
        state.activeRunId = null;
        clearAllProgress();
        showBlockingError(error);
        return true;
    }

    abort(true);
    await runPreflightDryRun(context, pendingGeneration);
    return true;
};


async function handleChatCompletionPromptReady(eventData) {
    if (!isStoryEngineEnabled()) {
        disableStoryEngineRuntime();
        return;
    }
    if (promptReadyBypassGate.isActive() || state.runningSemanticPass) return;
    if (!eventData || !Array.isArray(eventData.chat)) return;

    if (!state.pendingGeneration) return;



    const context = getContext();

    if (!context) return;

    const pendingGeneration = state.pendingGeneration;
    const ownedPreflightDryRun = isOwnedPreflightDryRun(eventData, pendingGeneration, context);
    if (eventData.dryRun === true && !ownedPreflightDryRun) return;
    const runIdentity = {
        runId: pendingGeneration.runId || state.activeRunId,
        runEpoch: Number(pendingGeneration.runEpoch ?? state.runEpoch),
        chatId: String(pendingGeneration.chatId ?? getChatId(context)),
        personaId: String(pendingGeneration.personaId ?? getActiveUserAvatar() ?? ''),
    };
    if (!isCurrentStoryEngineRun(runIdentity, context)) return;


    try {

        const generationMode = pendingGeneration.mode || 'normal';

        if (generationMode === 'ooc') {
            clearRuntimePrompts();
            eventData.chat.push({
                role: 'system',
                content: buildOocResponsePrompt(pendingGeneration.latestUserText || getLatestUserText(eventData.chat)),

            });
            state.lastNarratorHandoff = '';
            state.pendingRun = null;
            clearAllProgress();
            return;
        }

        if (isNarratorGenerationPromptPass()) {
            ensureNarratorDepthPromptInChat(context, eventData.chat);
            beginProseGuardDisplayIntercept(pendingGeneration.type || 'normal');
            sanitizeFinalPromptHistory(eventData.chat);
            if (!chatHasNarratorDepthPrompt(eventData.chat)) {
                throw new Error('Story Engine native narrator handoff was altered during final prompt sanitation; generation aborted before narration.');
            }
            await waitForStoryEngineModelCallSpacing(state.narratorGeneration?.spacingLabel || 'narrator model call');
            if (!isCurrentStoryEngineRun(runIdentity)) return;
            clearAllProgress();
            return;
        }

        if (isBeginningAdventureIntroGeneration(pendingGeneration, context)) {
            const adventurePrompt = getActiveAdventureIntroPrompt(pendingGeneration, context);
            const nameGeneration = buildAdventureIntroNameGeneration(context, adventurePrompt);
            pendingGeneration.nameGenerationSnapshot = nameGeneration;
            const adventureGenre = pendingGeneration.adventureGenre || getActiveAdventureGenre(context);
            const isekaiOpeningSeed = pendingGeneration.isekaiOpeningSeed || buildIsekaiOpeningSeed({
                adventureGenre,
                prompt: adventurePrompt,
                characterText: getPersonaText(context) || getPlayerRoot(context)?.sheet?.text,
            });
            pendingGeneration.isekaiOpeningSeed = isekaiOpeningSeed;
            const introOptions = {
                adventureGenre,
                worldState: pendingGeneration.worldStateSnapshot || buildWorldStateSnapshot(context),
                nameGeneration,
                isekaiOpeningSeed,
                sceneStyleProfile: pendingGeneration.sceneStyleProfile || '',
            };
            const narratorContext = formatAdventureIntroNarratorPromptContext(adventurePrompt, introOptions);
            const narratorModelContext = formatAdventureIntroNarratorModelPromptContext(adventurePrompt, introOptions);
            state.pendingRun = buildAdventureIntroPendingRun(context, pendingGeneration, narratorModelContext);
            state.lastNarratorHandoff = narratorContext;
            beginProseGuardDisplayIntercept(pendingGeneration.type || 'normal');
            sanitizeFinalPromptHistory(eventData.chat);
            appendNarratorContextToPrompt(eventData.chat, narratorModelContext);
            markNextStartAdventureRequestReasoningCleanup();
            await waitForStoryEngineModelCallSpacing('adventure intro model call');
            if (!isCurrentStoryEngineRun(runIdentity)) return;
            clearAllProgress();
            return;
        }

        if (!ownedPreflightDryRun) {
            throw reportSemanticPipelineFailure(
                new Error('Story Engine semantic preflight reached a real narrator request instead of its owned local dry run.'),
                { code: 'SE-ORCHESTRATION', stage: 'Semantic orchestration' },
            );
        }
        const dryRun = state.preflightDryRun;
        if (!dryRun || !stripPreflightDryRunMarkerFromChat(eventData.chat, dryRun.marker)) {
            throw reportSemanticPipelineFailure(
                new Error('Story Engine could not claim its local preflight dry run; generation aborted before narration.'),
                { code: 'SE-ORCHESTRATION', stage: 'Semantic orchestration' },
            );
        }
        dryRun.phase = 'processing';
        state.runningSemanticPass = true;
        const trackerSnapshot = pendingGeneration.trackerSnapshot || buildTrackerSnapshot(context);
        const semanticLedger = await runSemanticPassWithPromptReadyBypass(
            context,

            eventData.chat,

            pendingGeneration.type,

            trackerSnapshot,

            pendingGeneration,

            runIdentity,

        );

        if (!isCurrentStoryEngineRun(runIdentity) || state.pendingGeneration !== pendingGeneration) return;

        applyPlayerCoreStatsOverride(semanticLedger, context);

        context.structuredPreflightSettings = getSettings();

        let report;
        try {
            report = runDeterministicEngines(semanticLedger, trackerSnapshot, context, pendingGeneration.type, {
                playerTrackerSnapshot: pendingGeneration.playerTrackerSnapshot || buildPlayerTrackerSnapshot(context),
                latentGrievanceSnapshot: pendingGeneration.latentGrievanceSnapshot || buildLatentGrievanceSnapshot(context),
                latentFavorSnapshot: pendingGeneration.latentFavorSnapshot || buildLatentFavorSnapshot(context),
                worldStateSnapshot: pendingGeneration.worldStateSnapshot || buildWorldStateSnapshot(context),
                sceneItemStateSnapshot: pendingGeneration.sceneItemStateSnapshot || buildSceneItemStateSnapshot(context),
                descriptiveArchiveSnapshot: pendingGeneration.descriptiveArchiveSnapshot || buildDescriptiveArchiveSnapshot(context),
                worldProgressionSnapshot: pendingGeneration.worldProgressionSnapshot || buildWorldProgressionSnapshot(context),
                boundCompanionSnapshot: pendingGeneration.boundCompanionSnapshot || buildBoundCompanionSnapshot(context),
                pendingBoundarySnapshot: pendingGeneration.pendingBoundarySnapshot || buildPendingBoundarySnapshot(context),
                spellCastingSnapshot: pendingGeneration.spellCastingSnapshot || buildSpellCastingSnapshot(context, parseCoreStatsBlock(getPersonaText(context))),
                knownSpellNames: pendingGeneration.knownSpellNames || extractPersonaSpells(getPersonaText(context)).map(entry => String(entry?.name || '').trim()).filter(Boolean),
                adventureGenre: pendingGeneration.adventureGenre || getActiveAdventureGenre(context),
                latestUserText: pendingGeneration.latestUserText || getLatestUserText(eventData.chat),
                sceneNames: getConfirmedSceneNpcNames(context),
                worldProgressionProjectionKey: pendingGeneration.runId || runIdentity.runId,
            });
        } catch (error) {
            const diagnosticError = reportSemanticPipelineFailure(error, {
                code: 'SE-DETERMINISTIC-HANDOFF',
                stage: 'Deterministic handoff',
            });
            throw diagnosticError;
        }


        const narratorContext = formatNarratorPromptContext(report, pendingGeneration);

        const narratorModelContext = formatNarratorModelPromptContext(report, pendingGeneration);

        state.pendingRun = {

            type: pendingGeneration.type || 'normal',

            runEpoch: runIdentity.runEpoch,

            chatId: runIdentity.chatId,

            personaId: runIdentity.personaId,

            mode: generationMode,

            trackerBefore: trackerSnapshot,

            trackerAfter: report.trackerUpdate?.npcs || {},
            userBefore: pendingGeneration.playerTrackerSnapshot || buildPlayerTrackerSnapshot(context),
            userAfter: report.trackerUpdate?.user || {},
            healthBefore: report.hiddenHealth?.before || null,
            healthAfter: report.hiddenHealth?.after || report.trackerUpdate?.health || null,
            powerActorsBefore: pendingGeneration.powerActorSnapshot || buildPowerActorSnapshot(context),
            powerActorsAfter: report.trackerUpdate?.powerActors || {},
            latentGrievancesBefore: pendingGeneration.latentGrievanceSnapshot || buildLatentGrievanceSnapshot(context),
            latentGrievancesAfter: report.trackerUpdate?.latentGrievances || [],
            latentFavorsBefore: pendingGeneration.latentFavorSnapshot || buildLatentFavorSnapshot(context),
            latentFavorsAfter: report.trackerUpdate?.latentFavors || [],
            userKnowledgeBefore: pendingGeneration.userKnowledgeSnapshot || buildUserKnowledgeSnapshot(context),
            userKnowledgeAfter: report.trackerUpdate?.userKnowledge || {},
            userReputationBefore: pendingGeneration.userReputationSnapshot || buildUserReputationSnapshot(context),
            userReputationAfter: report.trackerUpdate?.userReputation || {},
            worldStateBefore: pendingGeneration.worldStateSnapshot || buildWorldStateSnapshot(context),
            worldStateAfter: report.trackerUpdate?.worldState || pendingGeneration.worldStateSnapshot || buildWorldStateSnapshot(context),
            sceneItemsBefore: pendingGeneration.sceneItemStateSnapshot || buildSceneItemStateSnapshot(context),
            sceneItemsAfter: report.trackerUpdate?.sceneItems || pendingGeneration.sceneItemStateSnapshot || buildSceneItemStateSnapshot(context),
            descriptiveArchiveBefore: pendingGeneration.descriptiveArchiveSnapshot || buildDescriptiveArchiveSnapshot(context),
            descriptiveArchiveAfter: report.trackerUpdate?.descriptiveArchive || pendingGeneration.descriptiveArchiveSnapshot || buildDescriptiveArchiveSnapshot(context),
            worldProgressionBefore: pendingGeneration.worldProgressionSnapshot || buildWorldProgressionSnapshot(context),
            worldProgressionAfter: report.trackerUpdate?.worldProgression || pendingGeneration.worldProgressionSnapshot || buildWorldProgressionSnapshot(context),
            worldProgressionDuePlanIds: report.worldProgressionProjection?.duePlanIds || [],
            worldProgressionAdvancements: report.worldProgressionProjection?.advancements || [],
            economyBefore: pendingGeneration.economySnapshot || buildEconomySnapshot(context),
            economyAfter: report.trackerUpdate?.economy || pendingGeneration.economySnapshot || buildEconomySnapshot(context),
            boundCompanionBefore: pendingGeneration.boundCompanionSnapshot || buildBoundCompanionSnapshot(context),
            boundCompanionAfter: report.trackerUpdate?.boundCompanion || pendingGeneration.boundCompanionSnapshot || buildBoundCompanionSnapshot(context),
            pendingBoundaryBefore: pendingGeneration.pendingBoundarySnapshot || buildPendingBoundarySnapshot(context),
            pendingBoundaryAfter: report.trackerUpdate?.pendingBoundary || pendingGeneration.pendingBoundarySnapshot || buildPendingBoundarySnapshot(context),
            spellCastingBefore: pendingGeneration.spellCastingSnapshot || buildSpellCastingSnapshot(context, parseCoreStatsBlock(getPersonaText(context))),
            spellCastingAfter: report.trackerUpdate?.spellCasting || pendingGeneration.spellCastingSnapshot || buildSpellCastingSnapshot(context, parseCoreStatsBlock(getPersonaText(context))),
            rapportClockAfter: report.trackerUpdate?.rapportClock || null,
            resolutionPacket: report.finalNarrativeHandoff?.resolutionPacket || {},
            userCoreStats: report.semanticLedger?.engineContext?.userCoreStats || null,
            contextualInjuryCaps: collectContextualInjuryCaps(report),

            latestUserText: pendingGeneration.latestUserText || getLatestUserText(eventData.chat),

            adventureGenre: pendingGeneration.adventureGenre || getActiveAdventureGenre(context),

            report,

        };
        state.lastNarratorHandoff = narratorContext;

        armNarratorGeneration({
            context,
            pendingGeneration,
            pendingRun: state.pendingRun,
            narratorContext,
            narratorModelContext,
            generationMode,
            spacingLabel: 'narrator model call',
        });
        if (state.preflightDryRun === dryRun) dryRun.phase = 'complete';
    } catch (error) {
        if (!isCurrentStoryEngineRun(runIdentity)) return;
        if (ownedPreflightDryRun) {
            const dryRun = state.preflightDryRun;
            if (dryRun) {
                dryRun.phase = 'failed';
                dryRun.error = error;
                failPreflightDryRun(dryRun, error);
            }
            return;
        }
        state.lastNarratorHandoff = '';
        state.pendingRun = null;
        state.startAdventureReasoningCleanupPending = false;
        releaseProseGuardDisplayIntercept();
        clearAllProgress();
        clearRuntimePrompts();
        showBlockingError(error);

        abortActiveGeneration(context);

        replacePromptWithAbortNotice(eventData.chat, error);

    } finally {

        if (isCurrentStoryEngineRun(runIdentity)) {
            state.runningSemanticPass = false;

            state.activeRunId = null;

            state.pendingGeneration = null;
        }

    }

}



async function runSemanticPassWithPromptReadyBypass(context, assembledChat, type, trackerSnapshot, pendingGeneration, runIdentity) {

    const bypassToken = promptReadyBypassGate.acquire();
    try {
        if (!isCurrentStoryEngineRun(runIdentity, context)) {
            throw new Error('Story Engine semantic run expired before model generation.');
        }

        const semanticLedger = await withStoryEngineModelRequest(modelRequest => withSemanticGenerationSettings(settings => extractSemanticLedger(context, assembledChat, type, trackerSnapshot, {
            assembledPrompt: true,
            playerTrackerSnapshot: pendingGeneration?.playerTrackerSnapshot || buildPlayerTrackerSnapshot(context),
            powerActorSnapshot: pendingGeneration?.powerActorSnapshot || buildPowerActorSnapshot(context),
            latentGrievanceSnapshot: pendingGeneration?.latentGrievanceSnapshot || buildLatentGrievanceSnapshot(context),
            latentFavorSnapshot: pendingGeneration?.latentFavorSnapshot || buildLatentFavorSnapshot(context),
            userKnowledgeSnapshot: pendingGeneration?.userKnowledgeSnapshot || buildUserKnowledgeSnapshot(context),
            userReputationSnapshot: pendingGeneration?.userReputationSnapshot || buildUserReputationSnapshot(context),
            worldStateSnapshot: pendingGeneration?.worldStateSnapshot || buildWorldStateSnapshot(context),
            sceneItemStateSnapshot: pendingGeneration?.sceneItemStateSnapshot || buildSceneItemStateSnapshot(context),
            worldProgressionSnapshot: pendingGeneration?.worldProgressionSnapshot || buildWorldProgressionSnapshot(context),
            boundCompanionSnapshot: pendingGeneration?.boundCompanionSnapshot || buildBoundCompanionSnapshot(context),
            pendingBoundarySnapshot: pendingGeneration?.pendingBoundarySnapshot || buildPendingBoundarySnapshot(context),
            semanticProfileId: settings?.semanticProfileId,
            semanticProfileName: settings?.semanticProfileName,
            semanticOutputMode: normalizeSemanticOutputMode(getSettings().semanticOutputMode),
            nameStyle: getSettings().nameStyle,
            userInputMode: pendingGeneration?.mode || 'normal',
            latestUserText: pendingGeneration?.latestUserText || getLatestUserText(context?.chat),
            semanticTurnKey: pendingGeneration?.runId || '',
            proxyUserAction: pendingGeneration?.mode === 'proxy' ? pendingGeneration?.latestUserText : '',
            inlineProxyInstructions: pendingGeneration?.inlineProxyInstructions || [],
            signal: modelRequest.signal,
        })), {
            isCurrent: () => isCurrentStoryEngineRun(runIdentity, context),
            expiredMessage: 'Story Engine semantic run expired before its model request completed.',
        });

        if (!isCurrentStoryEngineRun(runIdentity, context)) {
            throw new Error('Story Engine semantic run expired during model generation.');
        }
        return semanticLedger;
    } catch (error) {
        if (error?.name === 'AbortError') throw error;
        throw reportSemanticPipelineFailure(error, {
            code: 'SE-ORCHESTRATION',
            stage: 'Semantic orchestration',
        });
    } finally {

        promptReadyBypassGate.release(bypassToken);

    }

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



function abortActiveGeneration(context) {

    try {
        markInternalGenerationStop();

        stopGeneration(context);

    } catch {

        // The prompt is also replaced with an abort notice as a fallback.

    }

}



export function onDisable() {
    const context = getContext();
    disableStoryEngineRuntime();
    removeStreamingArtifactRegex();
    if (context?.extensionPrompts) {

        delete context.extensionPrompts[NARRATOR_PROMPT_KEY];

        delete context.extensionPrompts[WRITING_STYLE_PROMPT_KEY];

        delete context.extensionPrompts[PROSE_RULES_PROMPT_KEY];

        delete context.extensionPrompts[LEGACY_FINAL_REMINDER_PROMPT_KEY];

        delete context.extensionPrompts[LEGACY_WRITING_STYLE_PROMPT_KEY];
        delete context.extensionPrompts[LEGACY_ORDERED_WRITING_STYLE_PROMPT_KEY];

        delete context.extensionPrompts[LEGACY_PROSE_RULES_PROMPT_KEY];

    }

    if (state.subscribed) {

        for (const [eventType, handler] of STORY_ENGINE_EVENT_HANDLERS) {
            offEvent(eventType, handler, context, { warn: false });
        }
        state.subscribed = false;
    }
    releaseProseGuardDisplayIntercept();
    if (state.proseGuardChatObserver) {
        state.proseGuardChatObserver.disconnect();
        state.proseGuardChatObserver = null;
    }
}



subscribeMessageHandler();
getSettings();
ensureStreamingArtifactRegex();
onDomReady(() => {
    renderSettingsPanel();
    if (!isStoryEngineEnabled()) {
        disableStoryEngineRuntime();
        return;
    }
    ensureStreamingArtifactRegex();
    ensureProseGuardDisplayInterceptor();
    injectPromptOptionPrompts();
    setTimeout(() => {
        if (!isStoryEngineEnabled()) {
            disableStoryEngineRuntime();
            return;
        }
        getPlayerRoot();
        restoreTrackerFromLatestDisplaySnapshot();
        cleanVisibleDebugDisplays();
        renderAllTrackerDisplayBlocks();
        renderPlayerSetupCard();
        renderProgressionCard();
    }, 0);
});
clearRuntimePrompts();

console.info(`[${EXTENSION_NAME}] loaded`);
