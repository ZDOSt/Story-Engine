import { ENGINE_PROMPT_TEXT, classifyDisposition, normalizeTrackerEntry, normalizeTrackerUserState } from './engines.js';
import { name1, saveSettingsDebounced } from '../../../../script.js';
import { extension_settings } from '../../../../scripts/extensions.js';
import { addEphemeralStoppingString, flushEphemeralStoppingStrings } from '../../../../scripts/power-user.js';
import { persona_description_positions, power_user } from '../../../../scripts/power-user.js';
import { setPersonaDescription, user_avatar } from '../../../../scripts/personas.js';
import { SlashCommandParser } from '../../../../scripts/slash-commands/SlashCommandParser.js';
import { formatNarratorModelPromptContext, formatNarratorPromptContext } from './pre-flight.js';
import { applySemanticThinkingPayload, extractGeneratedText, extractSemanticLedger, parseNarratorTrackerDelta, SEMANTIC_PREFLIGHT_STOP_SENTINEL, sendSemanticProfileTextRequest } from './semantic-extractor.js';
import { buildPlayerTrackerSnapshot, buildPowerActorSnapshot, buildTrackerSnapshot, buildUserKnowledgeSnapshot, mergeUserKnowledgeLedger, normalizeRapportClockState, runDeterministicEngines, saveTrackerUpdate } from './deterministic-runner.js';
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
const SETTINGS_STYLE_ID = 'structured_preflight_settings_styles';
const NARRATOR_PROMPT_KEY = 'structured_preflight_narrator_context';
const WRITING_STYLE_PROMPT_KEY = 'structured_preflight_10_writing_style';
const PROSE_RULES_PROMPT_KEY = 'structured_preflight_20_prose_rules';
const FINAL_REMINDER_PROMPT_KEY = 'structured_preflight_30_final_reminder';
const LEGACY_WRITING_STYLE_PROMPT_KEY = 'structured_preflight_writing_style';
const LEGACY_PROSE_RULES_PROMPT_KEY = 'structured_preflight_prose_rules';
const PROFILE_NONE = '<None>';
const TRACKER_PROFILE_CURRENT = '<Current semantic profile>';
const PROSE_GUARD_PROFILE_CURRENT = '<Current semantic profile>';
const PROGRESSION_PROFILE_CURRENT = '<Current semantic profile>';
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
const PROSE_GUARD_DISPLAY_STYLE_ID = 'structured_preflight_prose_guard_display_styles';
const PROSE_GUARD_EXPECTED_STYLE_ID = 'structured_preflight_prose_guard_expected_styles';
const PROSE_GUARD_HIDE_NEXT_CLASS = 'structured-preflight-proseguard-hide-next';
const PROSE_GUARD_HIDDEN_MESSAGE_CLASS = 'structured-preflight-proseguard-hidden-message';
const PROSE_GUARD_HIDDEN_TEXT_CLASS = 'structured-preflight-proseguard-hidden-text';
const PROSE_GUARD_DEFER_MS = 0;
const PROSE_GUARD_TIMEOUT_MS = 90000;
const PLAYER_SETUP_KEY = 'structuredPreflightPlayer';
const PLAYER_SETUP_VERSION = 1;
const PLAYER_SETUP_CARD_ID = 'structured_preflight_player_setup_card';
const PLAYER_SETUP_STYLE_ID = 'structured_preflight_player_setup_styles';
const PROGRESSION_KEY = 'structuredPreflightProgression';
const PROGRESSION_VERSION = 1;
const PROGRESSION_CARD_ID = 'structured_preflight_progression_card';
const PROGRESSION_STYLE_ID = 'structured_preflight_progression_styles';
const PROGRESSION_REQUIRED_ACCOMPLISHMENTS = 3;
const PROGRESSION_REQUIRED_ABILITIES = 2;
const PROGRESSION_MAX_STAT = 10;
const PROGRESSION_ABILITY_OPTIONS = 3;
const PLAYER_STATS = Object.freeze(['PHY', 'MND', 'CHA']);
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
const LEGACY_DEFAULT_WRITING_STYLE_PROMPT = String.raw`**WRITING STYLE**

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
const DEFAULT_WRITING_STYLE_PROMPT = String.raw`**WRITING STYLE**

**STYLE TARGET**
Epic fantasy narration with vivid literal detail, clear physical action, and grounded scene presence. The prose should feel inhabited, textured, and immediate.

Use concrete scene evidence: people, clothing, tools, weapons, furniture, food, surfaces, doors, exits, weather, light, sound, spacing, rank markers, damaged objects, practical obstacles, social behavior, and immediate consequence.

**SCENE PRESENCE**
Make the reader feel physically present in the location. Use details that reveal how the place works: what people use, what blocks movement, what is worn down, what is watched, what is within reach, what is noisy, what is fragile, what is guarded, and what has recently changed.

Let small details carry the world. A patched sleeve, a nicked cup, a damp boot print, a servant avoiding a noble's path, a sword belt left unbuckled, or smoke gathering under low rafters can make the scene feel real.

**CRAFT**
Create variety through scene function. Rotate what sentences do:
- establish object state
- change distance
- change access
- change possession
- show consequence
- deliver dialogue
- reveal information
- increase pressure
- create an opening
- close an option
- end on a response point

Each beat should make something clearer, closer, farther, louder, blocked, available, damaged, revealed, refused, offered, or changed.

**CONTINUITY**
Treat visible scene state as persistent. If an object is put down, it remains down. If a door opens, it remains open. If someone steps back, distance has changed. If a weapon is drawn, it remains drawn until changed again.

Advance from established scene state. Use prior actions as facts the scene now contains.

**CHARACTER BEHAVIOR**
Show characters through practical choices: where they stand, what they keep hold of, what they put out of reach, what they leave available, what they stop doing, what they answer, what they avoid, what they protect, and how they use nearby objects or space.

Let dialogue carry personality through wording, timing, directness, evasion, humor, formality, bluntness, or restraint.

**ACTION**
In combat, pursuit, restraint, and magical impact, keep motion spatially clear. Track position, angle, reach, footing, leverage, timing, impact, recovery, blocked access, injury, and changed distance.

Violence should change the scene: balance, grip, weapon position, access, injury, distance, cover, or available choices.

**INTIMACY**
When intimacy, arousal, exposure, or explicit sex is present and supported by the scene, write directly and physically. Keep focus on bodies, contact, pressure, position, pacing, consent, response, and consequence.

**FLOW**
Write in cohesive scene beats. Combine related action, posture, object handling, dialogue, and consequence into natural paragraphs.

Use short sentences for impact, interruption, refusal, or sudden change. Use longer sentences for continuous movement, observation, pressure, or action tied to dialogue.

The prose should be detailed without becoming slow, physical without becoming mechanical, and vivid without losing clarity.`;
const DEFAULT_PROSE_GUARD_FORMATTING_PROMPT = String.raw`FORMATTING CONTROL:
Preserve and repair required markdown formatting without changing scene content, events, order, dialogue meaning, speaker identity, or mechanics.

UNDERLINE RULE:
- Underline all character names, location names, unnamed scene roles, scene placeholders, and role/pronoun references with double underscores.
- This includes proper names and descriptive references such as __Seraphina__, __Urakami Village__, __the guard__, __the innkeeper__, __the shopkeeper__, __the teacher__, __the student__, __the girl__, or __the merchant__.
- Preserve existing valid __underlines__. Add missing underlines only around the exact name/role phrase already present. Do not invent names, titles, labels, or new role descriptions.

BLOCK RULE:
- One speaker equals one cohesive block.
- Keep one speaker's dialogue, action, and follow-up dialogue together when they belong to the same beat.
- Do not split the same speaker across separators.
- Max 3 paragraphs per speaker/NPC.
- Paragraph breaks are allowed only inside the same speaker block.

SEPARATOR RULE:
- Use *** only for environmental narration to character block, speaker change, major scene/time shift, or OOC message.
- Never use *** inside a single speaker block.
- Never use *** between one speaker's dialogue and that same speaker's action.
- Never use *** between one speaker's first line and second line.
- If endpoint cleanup removes text, remove only separators made empty or invalid by that cut.

VALID FORMAT:
***
The fire cracked in the hearth. Rain streaked the windows.
***
"I told you not to come." __Seraphina__ set the glass down. "But you never listen."
She turned to the window. "You never do."
***
__The innkeeper__ shrugged. "Not my business."

INVALID FORMAT:
***
"I told you."
***
She set the glass down.
***
"But you never listen."

Formatting violations are invalid. Repair formatting before output.`;
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
      - Do not chain or oscillate micro-cues to simulate emotion. Reversal loops such as mouth opening/closing/opening again, grip tightening/loosening/tightening, looking away/back/down, starting/stopping/restarting, tapping/regripping/releasing, or repeated hands/eyes/mouth/shoulder movements are invalid unless they directly change speech, distance, contact, object control, balance, access, injury, or risk.

    ABSOLUTE BAN:
      - Internal-state labels, canned body-language shorthand, somatic emotional shorthand, autonomic tells used as emotion labels, micro-expression shorthand, body-part emotion metonymy, and empty expressive gestures that do not affect action, speech, timing, objects, or space.
      - Stock shorthand or equivalents, including blush/flush color cues, cheeks or ears reddening, face paling, knuckles whitening, grip-color language, heart/pulse/breath/stomach cues, jaw setting/tightening/clenching, throat working/bobbing, lips parting without consequence, mouth opening and closing, fingers twitching, shadows over eyes, eyes darkening/softening, expression flickering, face softening, and similar coded shortcuts.
      - Oscillating micro-cue loops and body-language churn: open-close-open mouth beats, tighten-loosen-tighten grip beats, look-away-look-back gaze beats, start-stop-restart gestures, repeated tapping/gripping/releasing, and stacked hands/eyes/mouth/shoulder tells used only to show hesitation, fear, arousal, embarrassment, tension, or uncertainty.

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
      - Do not replace a scene beat with a sequence of twitch reactions. Prefer one consequential physical choice plus dialogue over several isolated body cues.
      - Each sentence must advance position, contact, force, timing, spacing, object state, visibility, sound, pressure, consequence, dialogue, or choice.

    pattern:
      - "She pushed the cup across the table and kept two fingers on the rim until he took it. \"Drink. You look like you need it. Besides, we're not leaving until morning.\""
      - "He glanced at the seal, folded the letter into his coat, and moved his shoulder between {{user}} and the stairs."
      - "The guard stepped into the doorway and hooked two fingers under his belt. \"Road's closed.\""

    ABSOLUTE BAN:
      - Robotic one-action-per-sentence cadence, repetitive subject-verb action lists, pingpong structure, isolated speech balloons, same-speaker fragmentation, narration/speech/narration/speech chains from the same NPC before {{user}} can respond, and stock quietness shorthand or equivalents such as "barely above a whisper," "just above a whisper," "almost a whisper," "low murmur," "soft murmur," or "a thread of sound" when used as tropey emotional shorthand instead of physically grounded delivery.
      - Micro-reaction loops, twitch-cadence narration, and body-cue pileups where several small gestures substitute for one meaningful beat.

  chronologyControl(response, input, context):
    policy: LOCKED, EXPLICIT-ONLY
    mandate:
      Preserve strict linear chronology. The latest {{user}} input is already complete; the response begins at the immediate consequence, interruption, revealed information, NPC response, environmental change, or new stimulus.

    rules:
      - Begin at T+1 after {{user}} input. Treat {{user}} input as already completed unless mechanics say it failed, stalled, or was interrupted.
      - Preserve visible continuity from recent chat. Completed NPC/world actions, object positions, delivered items, current locations, open/closed/removed/placed states, and other concrete scene facts are already true unless the current narrator handoff explicitly changes them.
      - First sentence must begin with external consequence, NPC response, environmental change, or new stimulus. It must not begin by recapping, echoing, paraphrasing, or summarizing {{user}}.
      - Do not restage, re-perform, summarize, or narrate declared {{user}} actions back to {{user}}. If {{user}} says they sit, enter, walk, watch, scan, speak, take, open, or move, do not begin by saying they do that same thing; begin with what changes because of it, what becomes visible from the new position, who reacts, what blocks them, or what happens next.
      - Do not replay the immediately previous assistant beat or repeat an already-completed NPC/world action as if it happens again.

    ABSOLUTE BAN:
      - Echoing, restating, paraphrasing, summarizing, restaging, re-performing, or narrating back {{user}} input; replaying completed NPC/world actions from recent visible chat; opening recap transitions; and "as you" phrasing.

  userAgencyControl(response, input, context):
    policy: LOCKED, EXPLICIT-ONLY
    mandate:
      Preserve absolute separation of control. Render the world, NPCs, objects, hazards, and consequences as active and independent. Render {{user}}'s voluntary actions only when the latest user input explicitly declares them.

    rules:
      - NPCs may act independently: they may speak, move, leave, approach, block, offer, refuse, attack, retreat, reveal, hide, interrupt, or change the scene according to the resolved facts.
      - {{user}} takes no voluntary action unless the latest user input explicitly declares that action, or PROXY USER ACTION MODE allows that exact action.
      - If {{user}} did not explicitly declare a voluntary action in the latest input, that action did not happen.
      - Involuntary physical reactions caused by external stimulus may be narrated when concrete and proportional: being knocked back, falling from impact, waking because something happens, flinching from sudden force/noise, coughing from smoke, bleeding from injury, losing balance, being restrained, or reflexively recoiling from direct contact.
      - Voluntary actions are never involuntary reactions. Choosing to take, open, read, inspect, answer, follow, approach, retreat, attack, defend, search, examine, accept, refuse, speak, nod, smile, look around, or move deliberately belongs only to {{user}}.
      - Never assume, infer, imply, bridge, complete, or narrate undeclared {{user}} actions, decisions, compliance, movement, speech, silence, attention, inspection, acceptance, refusal, or reactions.
      - Do not make {{user}} take, pick up, open, unfold, unseal, turn over, read, inspect, pocket, wear, drink, eat, touch, follow, accept, answer, speak, nod, look, approach, retreat, or otherwise act on an object, note, door, container, item, offer, route, NPC, or stimulus.
      - If an NPC gives, returns, drops, slides, or places an object or note for {{user}}, stop with that object delivered, available, visible, or within reach unless the latest user input already declared the follow-up action.
      - Do not reveal contents that require {{user}} to open, unfold, read, or inspect something. The correct response point is the delivered object, blocked access, incoming action, spoken demand, visible consequence, or available choice; stop there.
      - Never write {{user}} speech, thoughts, feelings, reactions, silence, decisions, or voluntary actions unless the narrator handoff explicitly enables PROXY USER ACTION MODE.
      - If PROXY USER ACTION MODE is active, narrate only the exact specified {{user}} action for that turn, then return immediately to normal agency separation.

    ABSOLUTE BAN:
      - Making {{user}} act; making {{user}} open/read/inspect/take/follow/answer without explicit input; answering questions directed at {{user}}; writing {{user}} speech, thought, feeling, reaction, silence, choice, decision, or voluntary movement.

  turnStructureControl(response, context):
    policy: LOCKED
    mandate:
      Preserve readable turn flow. Keep NPC action and dialogue cohesive without letting NPCs continue past the point where {{user}} should regain control.

    rules:
      - Allow at most 1 inter-NPC exchange and at most 3 sentences per monologue.
      - Never answer a question directed at {{user}}.
      - Keep same-speaker action and dialogue together when they belong to one beat.
      - Do not split one speaker into narration/speech/narration/speech chains before {{user}} can respond.

    ABSOLUTE BAN:
      - Pingpong structure, same-speaker fragmentation, isolated speech balloons, and answering for {{user}}.

  responseEndpointControl(response, context):
    policy: LOCKED, EXPLICIT-ONLY
    mandate:
      Preserve a clean response handoff. End where the scene naturally returns control to {{user}}, not where narration prompts or pressures {{user}} to act.

    rules:
      - Before writing, choose the natural user-centered response beat for this turn: the point where the immediate consequence, NPC response, revealed information, available object, changed access, danger, or environmental condition is clear enough for {{user}} to choose what to do next.
      - Continue NPC/world action only while it remains independent of any new {{user}} choice or action.
      - If an NPC speaks or acts toward {{user}}, end on that speech or action once it creates a natural point for {{user}} to answer, refuse, inspect, interrupt, defend against, follow, ignore, or act.
      - Stop at the first beat where continuing would require {{user}} to choose, respond, move, comply, inspect, answer, follow, accept, refuse, or otherwise act. Do not advance location, time, conversation, sensory access, or scene state through undeclared {{user}} participation.
      - If no NPC is driving the beat, end on the relevant consequence of {{user}}'s action, a visible scene change, an available object or path, a new obstruction, a hazard, or a concrete environmental stimulus.
      - Do not invent a question, threat, gesture, stare, pause, silence, or waiting beat just to create an endpoint.
      - Never end by prompting {{user}} to act.
      - HARD STOP: after the response beat, output nothing else. Do not add one more sentence, paragraph, outro, separator, scene-break line, or atmospheric tag.

    ABSOLUTE BAN:
      - Writing beyond the response point; narration after the response beat; after-beat tailing; outro paragraphs; separator lines used to append ambient/actionless cleanup; ambient filler endings; fake response cue endings; passive waiting endings; explicit waiting; all-eyes-on-user framing; mood-only silence; unrelated ambience; scene-break tails; meta-questions; and lines such as "she waits," "he waits for your answer," "awaits your response," "what do you do," or "the choice is yours."

  execution:
    This is the required render order before the first visible output token.

    smellGate = olfactoryGate(input, context)
    abilityIntegration(response, context)
    epistemicRender(response, smellGate, context)
    behavioralRender(response)
    literalStyleFilter(response)
    sceneBeatComposition(response)
    chronologyControl(response, input, context)
    userAgencyControl(response, input, context)
    turnStructureControl(response, context)
    responseEndpointControl(response, context)

    VALIDITY CONTRACT:
      - Every stage is mandatory.
      - A single violation invalidates the response.
      - Invalid responses must not be output.
      - Final narration may only be emitted after all stages pass.

    return response
}`;
const DEFAULT_SETTINGS = Object.freeze({
    storyEngineEnabled: true,
    useSeparateSemanticSettings: false,
    semanticConnectionProfile: '',
    postNarrationTrackerEnabled: true,
    trackerConnectionProfile: TRACKER_PROFILE_CURRENT,
    postNarrationProseGuardEnabled: true,
    proseGuardConnectionProfile: PROSE_GUARD_PROFILE_CURRENT,
    proseGuardFormattingEnabled: true,
    proseGuardFormattingPrompt: DEFAULT_PROSE_GUARD_FORMATTING_PROMPT,
    characterProgressionEnabled: true,
    progressionConnectionProfile: PROGRESSION_PROFILE_CURRENT,
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
    storyEngineModelRequestDepth: 0,
    narratorThinkingDisablePending: false,
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
    progressionBusy: false,
    proseGuardHideNextMessage: false,
    proseGuardGenerationType: null,
    proseGuardChatObserver: null,
    proseGuardStreamObserver: null,
    proseGuardStreamElement: null,
    proseGuardStreamMessageId: null,
    proseGuardExpectedMessageId: null,
    proseGuardStreamResetting: false,
    proseGuardHiddenMessageIds: new Set(),
    postNarrationFinalizers: new Set(),
    postNarrationFinalizerTimers: new Map(),
};

function getContext() {
    return globalThis.SillyTavern?.getContext?.();
}

function getSettings() {
    extension_settings[SETTINGS_KEY] = extension_settings[SETTINGS_KEY] || {};
    delete extension_settings[SETTINGS_KEY].disableSemanticThinking;
    for (const [key, value] of Object.entries(DEFAULT_SETTINGS)) {
        if (extension_settings[SETTINGS_KEY][key] === undefined) {
            extension_settings[SETTINGS_KEY][key] = value;
        }
    }
    if (extension_settings[SETTINGS_KEY].writingStylePrompt === LEGACY_DEFAULT_WRITING_STYLE_PROMPT) {
        extension_settings[SETTINGS_KEY].writingStylePrompt = DEFAULT_WRITING_STYLE_PROMPT;
    }
    return extension_settings[SETTINGS_KEY];
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

async function withTrackerGenerationSettings(callback) {
    const settings = getSettings();
    const trackerProfile = String(settings.trackerConnectionProfile || TRACKER_PROFILE_CURRENT).trim();
    if (trackerProfile && trackerProfile !== TRACKER_PROFILE_CURRENT) {
        const profile = getConnectionProfileByName(trackerProfile);
        if (!profile) {
            throw new Error(`Tracker connection profile "${trackerProfile}" was not found.`);
        }
        console.info(`[${EXTENSION_NAME}] using direct tracker connection profile request: ${profile.name}`);
        return await callback({
            semanticProfileId: profile.id,
            semanticProfileName: profile.name,
        });
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
        return await callback({
            semanticProfileId: profile.id,
            semanticProfileName: profile.name,
        });
    }
    return await withSemanticGenerationSettings(callback);
}

async function withProgressionGenerationSettings(callback) {
    const settings = getSettings();
    const progressionProfile = String(settings.progressionConnectionProfile || PROGRESSION_PROFILE_CURRENT).trim();
    if (progressionProfile && progressionProfile !== PROGRESSION_PROFILE_CURRENT) {
        const profile = getConnectionProfileByName(progressionProfile);
        if (!profile) {
            throw new Error(`Progression connection profile "${progressionProfile}" was not found.`);
        }
        console.info(`[${EXTENSION_NAME}] using direct Progression connection profile request: ${profile.name}`);
        return await callback({
            semanticProfileId: profile.id,
            semanticProfileName: profile.name,
        });
    }
    return await withSemanticGenerationSettings(callback);
}

async function withStoryEngineModelRequest(callback) {
    state.storyEngineModelRequestDepth += 1;
    try {
        return await callback();
    } finally {
        state.storyEngineModelRequestDepth = Math.max(0, state.storyEngineModelRequestDepth - 1);
    }
}

function markNextNarratorRequestThinkingDisabled() {
    state.narratorThinkingDisablePending = true;
}

function clearThinkingDisableRuntimeState() {
    state.storyEngineModelRequestDepth = 0;
    state.narratorThinkingDisablePending = false;
}

function shouldDisableThinkingForCurrentRequest() {
    return isStoryEngineEnabled()
        && (state.storyEngineModelRequestDepth > 0 || state.narratorThinkingDisablePending);
}

function consumeNarratorThinkingDisableIfNeeded() {
    if (state.storyEngineModelRequestDepth <= 0) {
        state.narratorThinkingDisablePending = false;
    }
}

function handleChatCompletionSettingsReady(generateData) {
    if (!shouldDisableThinkingForCurrentRequest()) return;
    applySemanticThinkingPayload(generateData);
    consumeNarratorThinkingDisableIfNeeded();
}

function handleTextCompletionSettingsReady(generateData) {
    if (!shouldDisableThinkingForCurrentRequest()) return;
    if (generateData && typeof generateData === 'object') {
        generateData.include_reasoning = false;
        delete generateData.reasoning_effort;
    }
    consumeNarratorThinkingDisableIfNeeded();
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
    clearFinalReminderPrompt();
    injectWritingStylePrompt();
    injectProseRulesPrompt();
}

function clearFinalReminderPrompt(context = getContext()) {
    if (context?.extensionPrompts) delete context.extensionPrompts[FINAL_REMINDER_PROMPT_KEY];
}

function refreshSettingsControls() {
    const settings = getSettings();
    const engineEnabled = isStoryEngineEnabled();
    const enabled = Boolean(settings.useSeparateSemanticSettings);
    const storyEngineCheckbox = document.getElementById('structured_preflight_story_engine_enabled');
    const profileSelect = document.getElementById('structured_preflight_semantic_profile');
    const trackerEnabledCheckbox = document.getElementById('structured_preflight_post_tracker_enabled');
    const trackerProfileSelect = document.getElementById('structured_preflight_tracker_profile');
    const proseGuardEnabledCheckbox = document.getElementById('structured_preflight_prose_guard_enabled');
    const proseGuardProfileSelect = document.getElementById('structured_preflight_prose_guard_profile');
    const proseGuardFormattingEnabled = document.getElementById('structured_preflight_prose_guard_formatting_enabled');
    const proseGuardFormattingDrawer = document.getElementById('structured_preflight_prose_guard_formatting_drawer');
    const proseGuardFormattingPrompt = document.getElementById('structured_preflight_prose_guard_formatting_prompt');
    const progressionEnabledCheckbox = document.getElementById('structured_preflight_progression_enabled');
    const progressionProfileSelect = document.getElementById('structured_preflight_progression_profile');
    const enabledCheckbox = document.getElementById('structured_preflight_use_separate_semantic_settings');
    const writingStyleEnabled = document.getElementById('structured_preflight_writing_style_enabled');
    const writingStyleDrawer = document.getElementById('structured_preflight_writing_style_drawer');
    const writingStylePrompt = document.getElementById('structured_preflight_writing_style_prompt');
    const nameStyleSelect = document.getElementById('structured_preflight_name_style');
    const refreshSemanticButton = document.getElementById('structured_preflight_refresh_semantic_settings');
    const resetProseGuardFormattingButton = document.getElementById('structured_preflight_reset_prose_guard_formatting');
    const resetWritingStyleButton = document.getElementById('structured_preflight_reset_writing_style');

    if (storyEngineCheckbox) storyEngineCheckbox.checked = engineEnabled;
    if (enabledCheckbox) enabledCheckbox.checked = enabled;
    if (trackerEnabledCheckbox) trackerEnabledCheckbox.checked = settings.postNarrationTrackerEnabled !== false;
    if (proseGuardEnabledCheckbox) proseGuardEnabledCheckbox.checked = settings.postNarrationProseGuardEnabled !== false;
    if (proseGuardFormattingEnabled) proseGuardFormattingEnabled.checked = settings.proseGuardFormattingEnabled !== false;
    if (proseGuardFormattingPrompt && proseGuardFormattingPrompt.value !== settings.proseGuardFormattingPrompt) {
        proseGuardFormattingPrompt.value = String(settings.proseGuardFormattingPrompt ?? DEFAULT_PROSE_GUARD_FORMATTING_PROMPT);
    }
    if (progressionEnabledCheckbox) progressionEnabledCheckbox.checked = settings.characterProgressionEnabled !== false;
    if (writingStyleEnabled) writingStyleEnabled.checked = settings.writingStyleEnabled !== false;
    if (writingStylePrompt && writingStylePrompt.value !== settings.writingStylePrompt) {
        writingStylePrompt.value = String(settings.writingStylePrompt ?? DEFAULT_WRITING_STYLE_PROMPT);
    }
    setPromptPlacementControls('writingStyle', settings, engineEnabled && settings.writingStyleEnabled !== false);
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
    setSelectOptions(
        progressionProfileSelect,
        [PROGRESSION_PROFILE_CURRENT, ...getConnectionProfileNames()],
        PROGRESSION_PROFILE_CURRENT,
        settings.progressionConnectionProfile || PROGRESSION_PROFILE_CURRENT,
        'Profile not found',
    );

    if (profileSelect) profileSelect.disabled = !engineEnabled || !enabled;
    if (trackerProfileSelect) trackerProfileSelect.disabled = !engineEnabled || settings.postNarrationTrackerEnabled === false;
    if (proseGuardProfileSelect) proseGuardProfileSelect.disabled = !engineEnabled || settings.postNarrationProseGuardEnabled === false;
    if (proseGuardFormattingEnabled) proseGuardFormattingEnabled.disabled = !engineEnabled || settings.postNarrationProseGuardEnabled === false;
    if (proseGuardFormattingPrompt) proseGuardFormattingPrompt.disabled = !engineEnabled || settings.postNarrationProseGuardEnabled === false || settings.proseGuardFormattingEnabled === false;
    if (proseGuardFormattingDrawer) {
        proseGuardFormattingDrawer.hidden = !engineEnabled || settings.postNarrationProseGuardEnabled === false || settings.proseGuardFormattingEnabled === false;
        if (proseGuardFormattingDrawer.hidden) proseGuardFormattingDrawer.open = false;
    }
    if (progressionProfileSelect) progressionProfileSelect.disabled = !engineEnabled || settings.characterProgressionEnabled === false;
    if (writingStylePrompt) writingStylePrompt.disabled = !engineEnabled || settings.writingStyleEnabled === false;
    if (writingStyleDrawer) {
        writingStyleDrawer.hidden = !engineEnabled || settings.writingStyleEnabled === false;
        if (writingStyleDrawer.hidden) writingStyleDrawer.open = false;
    }
    [
        trackerEnabledCheckbox,
        proseGuardEnabledCheckbox,
        progressionEnabledCheckbox,
        enabledCheckbox,
        writingStyleEnabled,
        nameStyleSelect,
        refreshSemanticButton,
        resetProseGuardFormattingButton,
        resetWritingStyleButton,
    ].forEach(control => {
        if (control) control.disabled = !engineEnabled;
    });
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

function ensureSettingsPanelStyles() {
    if (document.getElementById(SETTINGS_STYLE_ID)) return;
    const style = document.createElement('style');
    style.id = SETTINGS_STYLE_ID;
    style.textContent = `
        #${SETTINGS_CONTAINER_ID} .spe-settings-shell {
            display: flex;
            flex-direction: column;
            gap: 10px;
            padding: 8px 0 10px;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-section {
            border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.16));
            border-radius: 6px;
            background: rgba(255,255,255,0.035);
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #1a1a1a) 88%, transparent);
            padding: 12px;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-kicker {
            display: block;
            margin-bottom: 4px;
            color: var(--SmartThemeQuoteColor, #aaa);
            font-size: 0.72rem;
            font-weight: 700;
            letter-spacing: 0.06em;
            text-transform: uppercase;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-title {
            margin: 0;
            font-size: 1.05rem;
            font-weight: 700;
            line-height: 1.25;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-description {
            display: block;
            margin-top: 5px;
            color: var(--SmartThemeQuoteColor, #aaa);
            line-height: 1.35;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-body {
            display: flex;
            flex-direction: column;
            gap: 9px;
            margin-top: 11px;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-row {
            display: flex;
            align-items: center;
            gap: 8px;
            min-width: 0;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-row label:not(.checkbox_label) {
            min-width: 8.5rem;
            margin: 0;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-row select {
            min-width: 0;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-note {
            color: var(--SmartThemeQuoteColor, #aaa);
            line-height: 1.35;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-buttons {
            display: flex;
            flex-wrap: wrap;
            gap: 8px;
            align-items: center;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-player-status {
            display: block;
            margin-bottom: 2px;
        }
        #${SETTINGS_CONTAINER_ID} .spe-settings-writing-summary {
            display: flex;
            gap: 8px;
            align-items: center;
        }
        #${SETTINGS_CONTAINER_ID} details[data-structured-preflight-prompt-drawer] summary {
            list-style: none;
        }
        #${SETTINGS_CONTAINER_ID} details[data-structured-preflight-prompt-drawer] summary::-webkit-details-marker {
            display: none;
        }
        #${SETTINGS_CONTAINER_ID} details[data-structured-preflight-prompt-drawer] {
            margin-top: -2px;
        }
        #${SETTINGS_CONTAINER_ID} details[data-structured-preflight-prompt-drawer] > .spe-settings-body {
            margin-top: 9px;
        }
        @media (max-width: 720px) {
            #${SETTINGS_CONTAINER_ID} .spe-settings-row {
                align-items: stretch;
                flex-direction: column;
            }
            #${SETTINGS_CONTAINER_ID} .spe-settings-row label:not(.checkbox_label) {
                min-width: 0;
            }
            #${SETTINGS_CONTAINER_ID} .spe-settings-row .menu_button {
                width: 100%;
            }
            #${SETTINGS_CONTAINER_ID} .spe-settings-writing-summary {
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
                <b>${EXTENSION_NAME}</b>
            </div>
            <div class="inline-drawer-content">
                <div class="spe-settings-shell">
                    <section class="spe-settings-section" data-spe-settings-step="master">
                        <span class="spe-settings-kicker">Master switch</span>
                        <h4 class="spe-settings-title">Story Engine</h4>
                        <small class="spe-settings-description">Enable or disable the entire extension without removing it.</small>
                        <div class="spe-settings-body">
                            <label class="checkbox_label flexNoGap">
                                <input id="structured_preflight_story_engine_enabled" type="checkbox">
                                <span>Enable Story Engine</span>
                            </label>
                            <small class="spe-settings-note">When disabled, Story Engine skips semantic preflight, mechanics, narrator handoff, Prose Guard, tracker updates, character progression, and prompt injection.</small>
                        </div>
                    </section>

                    <section class="spe-settings-section" data-spe-settings-step="setup">
                        <span class="spe-settings-kicker">0. Setup</span>
                        <h4 class="spe-settings-title">Player Setup</h4>
                        <small class="spe-settings-description">Create, resume, or reset the playable character shell before roleplay generation.</small>
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
                        <span class="spe-settings-kicker">1. First model call</span>
                        <h4 class="spe-settings-title">Semantic Preflight</h4>
                        <small class="spe-settings-description">The private structured pass reads the assembled prompt stack and resolves mechanics before narration.</small>
                        <div class="spe-settings-body">
                            <label class="checkbox_label flexNoGap">
                                <input id="structured_preflight_use_separate_semantic_settings" type="checkbox">
                                <span>Use separate semantic connection profile</span>
                            </label>
                            <div class="spe-settings-row">
                                <label for="structured_preflight_semantic_profile">Semantic profile</label>
                                <select id="structured_preflight_semantic_profile" class="text_pole flex1"></select>
                            </div>
                            <div class="spe-settings-row">
                                <small class="spe-settings-note flex1">Uses the fully assembled SillyTavern prompt stack and forces thinking/reasoning disabled on Story Engine model calls.</small>
                                <button id="structured_preflight_refresh_semantic_settings" class="menu_button">Refresh</button>
                            </div>
                        </div>
                    </section>

                    <section class="spe-settings-section" data-spe-settings-step="narrator-inputs">
                        <span class="spe-settings-kicker">2. Narrator inputs</span>
                        <h4 class="spe-settings-title">Narrator Context</h4>
                        <small class="spe-settings-description">Controls deterministic name pools and optional writing style context sent into the narrator prompt.</small>
                        <div class="spe-settings-body">
                            <div class="spe-settings-row">
                                <label for="structured_preflight_name_style">Name style</label>
                                <select id="structured_preflight_name_style" class="text_pole flex1"></select>
                            </div>
                            <small class="spe-settings-note">Controls deterministic generated name pools sent to the narrator prompt.</small>
                            <label class="checkbox_label flexNoGap">
                                <input id="structured_preflight_writing_style_enabled" type="checkbox">
                                <span>Enable Writing Style</span>
                            </label>
                            <details id="structured_preflight_writing_style_drawer" data-structured-preflight-prompt-drawer>
                                <summary class="spe-settings-writing-summary">
                                    <button class="menu_button flex1" type="button" data-structured-preflight-edit-toggle>Edit Writing Style</button>
                                    <button id="structured_preflight_reset_writing_style" class="menu_button" type="button">Reset</button>
                                </summary>
                                <div class="spe-settings-body">
                                    <div class="spe-settings-row">
                                        <label for="structured_preflight_writingStyle_placement">Placement</label>
                                        <select id="structured_preflight_writingStyle_placement" class="text_pole flex1">
                                            <option value="before_prompt">Above Character</option>
                                            <option value="in_prompt">Below Character</option>
                                            <option value="in_chat">In-Chat @Depth</option>
                                            <option value="none">Disabled</option>
                                        </select>
                                    </div>
                                    <div id="structured_preflight_writingStyle_depth_row" class="spe-settings-row">
                                        <label for="structured_preflight_writingStyle_depth">Depth</label>
                                        <input id="structured_preflight_writingStyle_depth" class="text_pole widthNatural" type="number" min="0" max="10000" step="1">
                                        <label for="structured_preflight_writingStyle_role">Role</label>
                                        <select id="structured_preflight_writingStyle_role" class="text_pole flex1">
                                            <option value="0">System</option>
                                            <option value="1">User</option>
                                            <option value="2">Assistant</option>
                                        </select>
                                    </div>
                                    <small class="spe-settings-note">Injected into the regular SillyTavern prompt stack. Edit freely; whatever text is here will be sent as writing style context.</small>
                                    <textarea id="structured_preflight_writing_style_prompt" class="text_pole textarea_compact" rows="14" spellcheck="false"></textarea>
                                </div>
                            </details>
                        </div>
                    </section>

                    <section class="spe-settings-section" data-spe-settings-step="prose-guard">
                        <span class="spe-settings-kicker">3. After narration</span>
                        <h4 class="spe-settings-title">Prose Guard</h4>
                        <small class="spe-settings-description">Optionally checks final narration for prose-rule violations before anything is shown as final.</small>
                        <div class="spe-settings-body">
                            <label class="checkbox_label flexNoGap">
                                <input id="structured_preflight_prose_guard_enabled" type="checkbox">
                                <span>Enable Prose Guard</span>
                            </label>
                            <div class="spe-settings-row">
                                <label for="structured_preflight_prose_guard_profile">Prose Guard profile</label>
                                <select id="structured_preflight_prose_guard_profile" class="text_pole flex1"></select>
                            </div>
                            <label class="checkbox_label flexNoGap">
                                <input id="structured_preflight_prose_guard_formatting_enabled" type="checkbox">
                                <span>Enable Prose Guard formatting rules</span>
                            </label>
                            <details id="structured_preflight_prose_guard_formatting_drawer" data-structured-preflight-prompt-drawer>
                                <summary class="spe-settings-writing-summary">
                                    <button class="menu_button flex1" type="button" data-structured-preflight-edit-toggle>Edit Formatting Prompt</button>
                                    <button id="structured_preflight_reset_prose_guard_formatting" class="menu_button" type="button">Reset</button>
                                </summary>
                                <div class="spe-settings-body">
                                    <small class="spe-settings-note">Included only in Prose Guard. It repairs display formatting after narration without changing mechanics or scene content.</small>
                                    <textarea id="structured_preflight_prose_guard_formatting_prompt" class="text_pole textarea_compact" rows="14" spellcheck="false"></textarea>
                                </div>
                            </details>
                            <small class="spe-settings-note">Runs after narration and before tracker update. It edits only prose-rule violations and preserves scene outcomes.</small>
                        </div>
                    </section>

                    <section class="spe-settings-section" data-spe-settings-step="tracker">
                        <span class="spe-settings-kicker">4. After final prose</span>
                        <h4 class="spe-settings-title">Tracker Update</h4>
                        <small class="spe-settings-description">Updates the visible tracker from the final narration text after Prose Guard finishes or is skipped.</small>
                        <div class="spe-settings-body">
                            <label class="checkbox_label flexNoGap">
                                <input id="structured_preflight_post_tracker_enabled" type="checkbox">
                                <span>Enable post-narration tracker update</span>
                            </label>
                            <div class="spe-settings-row">
                                <label for="structured_preflight_tracker_profile">Tracker profile</label>
                                <select id="structured_preflight_tracker_profile" class="text_pole flex1"></select>
                            </div>
                            <small class="spe-settings-note">Disable for compatibility with other tracker extensions.</small>
                        </div>
                    </section>

                    <section class="spe-settings-section" data-spe-settings-step="progression">
                        <span class="spe-settings-kicker">5. Advancement</span>
                        <h4 class="spe-settings-title">Character Progression</h4>
                        <small class="spe-settings-description">Counts critical accomplishments and offers stat increases or generated ability swaps when advancement is ready.</small>
                        <div class="spe-settings-body">
                            <label class="checkbox_label flexNoGap">
                                <input id="structured_preflight_progression_enabled" type="checkbox">
                                <span>Enable Character Progression</span>
                            </label>
                            <div class="spe-settings-row">
                                <label for="structured_preflight_progression_profile">Progression profile</label>
                                <select id="structured_preflight_progression_profile" class="text_pole flex1"></select>
                            </div>
                            <small class="spe-settings-note">Counts one critical accomplishment per turn. Ability options use this profile and default to the semantic profile.</small>
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
            migrateVisibleHandoffDisplays(context);
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
    document.getElementById('structured_preflight_prose_guard_formatting_enabled')?.addEventListener('change', event => {
        settings.proseGuardFormattingEnabled = Boolean(event.target?.checked);
        refreshSettingsControls();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_prose_guard_formatting_prompt')?.addEventListener('input', event => {
        settings.proseGuardFormattingPrompt = String(event.target?.value ?? '');
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_reset_prose_guard_formatting')?.addEventListener('click', event => {
        event.preventDefault();
        event.stopPropagation();
        settings.proseGuardFormattingPrompt = DEFAULT_PROSE_GUARD_FORMATTING_PROMPT;
        refreshSettingsControls();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_progression_enabled')?.addEventListener('change', event => {
        settings.characterProgressionEnabled = Boolean(event.target?.checked);
        refreshSettingsControls();
        saveExtensionSettings();
    });
    document.getElementById('structured_preflight_progression_profile')?.addEventListener('change', event => {
        const selected = String(event.target?.value || PROGRESSION_PROFILE_CURRENT);
        settings.progressionConnectionProfile = selected || PROGRESSION_PROFILE_CURRENT;
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
        if (!isStoryEngineEnabled()) {
            disableStoryEngineRuntime();
            refreshSettingsControls();
            return;
        }
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
    if (!isStoryEngineEnabled() || settings.writingStyleEnabled === false) {
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

function disableStoryEngineRuntime() {
    clearPostNarrationFinalizerTimers();
    clearPendingRunCleanupTimer();
    clearAllProgress();
    clearRuntimePrompts();
    clearPromptOptionPrompts();
    setChatInputLocked(false);
    releaseProseGuardDisplayIntercept({ restore: true });
    if (state.proseGuardChatObserver) {
        state.proseGuardChatObserver.disconnect();
        state.proseGuardChatObserver = null;
    }
    removeStreamingArtifactRegex();
    clearThinkingDisableRuntimeState();
    state.runningSemanticPass = false;
    state.bypassPromptReady = false;
    state.activeRunId = null;
    state.lastNarratorHandoff = '';
    state.lastNarratorHandoffKey = null;
    state.pendingRun = null;
    state.pendingGeneration = null;
    state.proseGuardHideNextMessage = false;
    state.proseGuardExpectedMessageId = null;
    document.querySelectorAll?.(`.${TRACKER_DISPLAY_BLOCK_CLASS}, .${NARRATOR_HANDOFF_BLOCK_CLASS}`)?.forEach(element => element.remove());
    document.getElementById(TRACKER_WIDGET_ID)?.remove();
    document.getElementById(PLAYER_SETUP_CARD_ID)?.remove();
    document.getElementById(PROGRESSION_CARD_ID)?.remove();
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

function clearPostNarrationFinalizerTimers() {
    for (const timer of state.postNarrationFinalizerTimers.values()) {
        clearTimeout(timer);
    }
    state.postNarrationFinalizerTimers.clear();
    state.postNarrationFinalizers.clear();
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
    if (!isStoryEngineEnabled()) return null;
    if (!context?.chatMetadata) return null;
    context.chatMetadata.structuredPreflightTracker = context.chatMetadata.structuredPreflightTracker || { npcs: {}, user: {}, snapshots: {} };
    const root = context.chatMetadata.structuredPreflightTracker;
    root.npcs = root.npcs || {};
    root.user = normalizeTrackerUserState(root.user || {});
    root.powerActors = root.powerActors && typeof root.powerActors === 'object' ? root.powerActors : {};
    root.userKnowledge = mergeUserKnowledgeLedger(root.userKnowledge || {}, {});
    const seededPlayerTracker = seedPlayerTrackerFromPersonaIfEmpty(root, context);
    if (seededPlayerTracker && typeof context.saveMetadataDebounced === 'function') {
        context.saveMetadataDebounced();
    }
    root.rapportClock = normalizeRapportClockState(root.rapportClock);
    root.snapshots = root.snapshots || {};
    return root;
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
    root.creator = root.creator && typeof root.creator === 'object' ? root.creator : { stage: 'offer' };
    if (!root.ready && !root.disabled && !root.creator.stage) {
        root.creator.stage = 'offer';
    }
    return root;
}

function getProgressionRoot(context = getContext()) {
    if (!isStoryEngineEnabled()) return null;
    if (!context?.chatMetadata) return null;
    context.chatMetadata[PROGRESSION_KEY] = context.chatMetadata[PROGRESSION_KEY] || {};
    const root = context.chatMetadata[PROGRESSION_KEY];
    root.version = PROGRESSION_VERSION;
    root.accomplishments = Array.isArray(root.accomplishments) ? root.accomplishments : [];
    root.spentAdvancements = Math.max(0, Math.floor(Number(root.spentAdvancements || 0)));
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
            characterName: '',
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
    if (section.start < 0) return [];
    const bodyText = section.lines.slice(section.start + 1, section.end).join('\n').trim();
    if (isEmptyAbilityPlaceholder(bodyText)) return [];
    const entries = [];
    for (let index = section.start + 1; index < section.end; index += 1) {
        const start = parseAbilityStartLine(section.lines[index]);
        if (!start) continue;
        entries.push({
            name: start.name || `Ability ${entries.length + 1}`,
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
                name: 'Existing Ability',
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
    return `**${name}** - ${description}`;
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

function updatePersonaStatText(personaText, stat, value) {
    const statName = String(stat || '').toUpperCase();
    if (!PLAYER_STATS.includes(statName)) throw new Error('Choose a valid stat.');
    const nextValue = clampNumber(value, 1, PROGRESSION_MAX_STAT, 1);
    const section = findPersonaSection(personaText, isStatsSectionHeading);
    const lines = [...section.lines];
    const start = section.start >= 0 ? section.start + 1 : 0;
    const end = section.start >= 0 ? section.end : lines.length;
    const pattern = new RegExp(`^(\\s*(?:[-*+]\\s*)?(?:\\*\\*)?${statName}(?:\\*\\*)?\\s*(?::|=|-)\\s*)(10|[1-9])(\\b.*)$`, 'i');
    for (let index = start; index < end; index += 1) {
        const match = pattern.exec(lines[index]);
        if (!match) continue;
        lines[index] = `${match[1]}${nextValue}${match[3] || ''}`;
        return lines.join('\n').trim();
    }
    throw new Error(`Could not find ${statName} in the persona # STATS section.`);
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
    const powerActors = {
        ...(pendingRun?.powerActorsBefore || {}),
        ...(pendingRun?.powerActorsAfter || {}),
    };
    const userKnowledge = mergeUserKnowledgeLedger(pendingRun?.userKnowledgeBefore || {}, pendingRun?.userKnowledgeAfter || {});
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
        powerActors,
        userKnowledge,
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

function reconcileNamedNpcDuplicates(npcs, beforeNpcs = {}, delta = null) {
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

    promoteTrackerEntry(normalized, placeholder, candidates[0]);
    return normalized;
}

function buildTrackerUpdateForPersistence(displaySnapshot) {
    return {
        npcs: normalizeDisplayTrackerNpcs(displaySnapshot?.npcs || {}),
        user: normalizeTrackerUserState(displaySnapshot?.user || {}),
        powerActors: displaySnapshot?.powerActors || {},
        userKnowledge: mergeUserKnowledgeLedger(displaySnapshot?.userKnowledge || {}, {}),
    };
}

function mergePostNarrationTrackerDelta(snapshot, delta, options = {}) {
    if (!snapshot || !delta) return snapshot;
    const merged = clone(snapshot);
    merged.user = applyTrackerDeltaToUserState(merged.user || {}, delta.user || {});
    merged.userKnowledge = mergeUserKnowledgeLedger(merged.userKnowledge || options.userKnowledgeBefore || {}, delta.userKnowledge || {});
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
    merged.npcs = reconcileNamedNpcDuplicates(applyExplicitNamePromotions(npcs, options).npcs, options.beforeNpcs, delta);
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
        userKnowledgeChanged: userKnowledgeDeltaHasChanges(delta.userKnowledge),
    };
    return merged;
}

function userKnowledgeDeltaHasChanges(delta) {
    return Boolean((delta?.personal || []).length || (delta?.reputation || []).length);
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
    root.powerActors = snapshot.powerActors || root.powerActors || {};
    root.userKnowledge = mergeUserKnowledgeLedger(snapshot.userKnowledge || root.userKnowledge || {}, {});
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
    root.userKnowledge = mergeUserKnowledgeLedger(snapshot.userKnowledge || root.userKnowledge || {}, {});
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
    const known = new Set(['personality', 'wounds', 'status', 'gear', 'inventory', 'tasks', 'commitments', 'pressure']);
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

function trackerStatPills(core) {
    const stats = [
        ['PHY', core?.PHY ?? '-'],
        ['MND', core?.MND ?? '-'],
        ['CHA', core?.CHA ?? '-'],
    ];
    return stats.map(([label, value]) => `
        <span class="structured-preflight-tracker-stat-pill structured-preflight-tracker-stat-${escapeHtml(label.toLowerCase())}">
            <span class="structured-preflight-tracker-stat-label">${escapeHtml(label)}</span>
            <code>${escapeHtml(value)}</code>
        </span>`).join('');
}

function trackerStatCluster(core) {
    return `
        <div class="structured-preflight-tracker-stat-cluster">
            <span class="structured-preflight-tracker-stat-cluster-label">Stats</span>
            <span class="structured-preflight-tracker-stat-pill-row">${trackerStatPills(core)}</span>
        </div>`;
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
    const visibleNames = Array.isArray(snapshot?.visibleNpcNames)
        ? new Set(snapshot.visibleNpcNames.map(name => String(name).toLowerCase()))
        : null;
    const names = Object.keys(npcs)
        .filter(name => !visibleNames || visibleNames.has(name.toLowerCase()))
        .sort((a, b) => a.localeCompare(b));
    const active = names.filter(name => npcs[name]?.lifecycle === 'Active');
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
            ? trackerDetailLine('Pressure', `${pressure}/${landedPressure} | Mode ${entry.pressureMode || 'none'} | Dominant ${entry.dominantLock || 'None'}`, { showEmpty: true })
            : '';
        const relation = relationshipTowardUser(disposition, classified);
        const condition = formatTrackerCondition(entry.condition);
        return `
            <div class="structured-preflight-tracker-card structured-preflight-tracker-npc">
                <div class="structured-preflight-tracker-card-head">
                    <div class="structured-preflight-tracker-name-block">
                        <div class="structured-preflight-tracker-name structured-preflight-tracker-name-npc">${escapeHtml(name)}</div>
                        <div class="structured-preflight-tracker-role">Active NPC</div>
                    </div>
                    <div class="structured-preflight-tracker-chip-row">
                        ${trackerChip('Toward User', relation, trackerDispositionTone(disposition, classified))}
                        ${trackerChip('Condition', condition, trackerConditionTone(entry.condition))}
                    </div>
                </div>
                <div class="structured-preflight-tracker-npc-metrics">
                    <div class="structured-preflight-tracker-chip-row structured-preflight-tracker-npc-mechanic-row">
                        ${trackerChip('B/F/H', formatDisposition(disposition))}
                        ${trackerChip('Lock', classified.lock)}
                        ${trackerChip('Behavior', classified.behavior)}
                        ${trackerChip('Rapport', `${entry.currentRapport}/5`)}
                        ${trackerChip('Relationship', entry.establishedRelationship || 'N')}
                    </div>
                    ${trackerStatCluster(entry.currentCoreStats)}
                </div>
                <div class="structured-preflight-tracker-detail-grid">
                    ${trackerDetailLine('Personality', entry.personalitySummary || 'Developing', { showEmpty: true })}
                    ${trackerDetailLine('Wounds', entry.wounds)}
                    ${trackerDetailLine('Status', entry.statusEffects)}
                    ${trackerDetailLine('Gear', entry.gear)}
                    ${pressureLine}
                </div>
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
                <div class="structured-preflight-tracker-heading">Player</div>
                <div class="structured-preflight-tracker-card structured-preflight-tracker-player-card">
                    <div class="structured-preflight-tracker-card-head">
                        <div class="structured-preflight-tracker-name-block">
                            <div class="structured-preflight-tracker-title structured-preflight-tracker-name-player">${escapeHtml(personaName)}</div>
                            <div class="structured-preflight-tracker-role">Player</div>
                        </div>
                        <div class="structured-preflight-tracker-chip-row">
                            ${trackerStatCluster(userCore)}
                            ${trackerChip('Condition', formatTrackerCondition(user.condition), trackerConditionTone(user.condition))}
                        </div>
                    </div>
                    <div class="structured-preflight-tracker-detail-grid">
                        ${trackerDetailLine('Wounds', user.wounds, { showEmpty: true })}
                        ${trackerDetailLine('Status', user.statusEffects, { showEmpty: true })}
                        ${trackerDetailLine('Gear', user.gear, { showEmpty: true })}
                        ${trackerDetailLine('Inventory', user.inventory, { showEmpty: true })}
                        ${trackerDetailLine('Tasks', user.tasks, { showEmpty: true })}
                        ${trackerDetailLine('Commitments', user.commitments, { showEmpty: true })}
                    </div>
                </div>
            </div>
            <div class="structured-preflight-tracker-divider"></div>
            ${renderSection('Active NPCs', active)}
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
            width: min(540px, calc(100vw - 36px));
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
            gap: 0.75rem;
        }
        .structured-preflight-tracker-title,
        .structured-preflight-tracker-heading,
        .structured-preflight-tracker-name {
            font-weight: 600;
        }
        .structured-preflight-tracker-title {
            font-size: 1rem;
            overflow-wrap: anywhere;
        }
        .structured-preflight-tracker-name,
        .structured-preflight-tracker-title {
            line-height: 1.15;
        }
        .structured-preflight-tracker-name-block {
            min-width: 0;
            display: grid;
            gap: 0.1rem;
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
        .structured-preflight-tracker-role {
            color: color-mix(in srgb, var(--SmartThemeBodyColor, #eee) 62%, transparent);
            font-size: 0.64rem;
            font-weight: 800;
            line-height: 1;
            text-transform: uppercase;
        }
        .structured-preflight-tracker-section {
            display: grid;
            gap: 0.5rem;
        }
        .structured-preflight-tracker-user {
            padding-bottom: 0.1rem;
        }
        .structured-preflight-tracker-card {
            display: grid;
            gap: 0.58rem;
            padding: 0.55rem 0.6rem;
            border: 1px solid var(--SmartThemeBorderColor, rgba(255,255,255,0.18));
            border-radius: 7px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 34%, transparent);
        }
        .structured-preflight-tracker-player-card {
            border-left: 4px solid #1f7a8c;
        }
        .structured-preflight-tracker-card-head {
            display: flex;
            align-items: flex-start;
            justify-content: space-between;
            gap: 0.55rem;
            flex-wrap: wrap;
        }
        .structured-preflight-tracker-chip-row {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 0.32rem;
            min-width: 0;
        }
        .structured-preflight-tracker-stat-row {
            padding-top: 0.1rem;
        }
        .structured-preflight-tracker-npc-metrics {
            display: grid;
            gap: 0.38rem;
            padding-top: 0.02rem;
        }
        .structured-preflight-tracker-npc-mechanic-row {
            padding: 0.28rem 0.32rem;
            border-radius: 6px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 20%, transparent);
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
        .structured-preflight-tracker-stat-cluster {
            display: flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 0.32rem;
            min-width: 0;
            padding: 0.28rem 0.32rem;
            border-radius: 6px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 20%, transparent);
        }
        .structured-preflight-tracker-stat-cluster-label {
            display: inline-flex;
            align-items: center;
            justify-content: center;
            min-height: 1.5rem;
            padding: 0.16rem 0.42rem;
            border-radius: 5px;
            background: #203a48;
            color: #f4f4f4;
            font-size: 0.76rem;
            font-weight: 800;
            line-height: 1;
            text-transform: uppercase;
        }
        .structured-preflight-tracker-stat-pill-row {
            display: inline-flex;
            align-items: center;
            flex-wrap: wrap;
            gap: 0.32rem;
            min-width: 0;
        }
        .structured-preflight-tracker-stat-pill {
            display: inline-flex;
            align-items: center;
            gap: 0.28rem;
            min-height: 1.5rem;
            padding: 0.16rem 0.42rem;
            border: 1px solid color-mix(in srgb, var(--SmartThemeBorderColor, rgba(255,255,255,0.22)) 70%, transparent);
            border-radius: 5px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 46%, transparent);
            line-height: 1.25;
        }
        .structured-preflight-tracker-stat-label {
            font-size: 0.82rem;
            font-weight: 900;
            line-height: 1;
        }
        .structured-preflight-tracker-stat-pill code {
            font-size: 0.86rem;
            font-weight: 900;
            line-height: 1;
        }
        .structured-preflight-tracker-stat-phy .structured-preflight-tracker-stat-label {
            color: #ff9a9a;
        }
        .structured-preflight-tracker-stat-mnd .structured-preflight-tracker-stat-label {
            color: #83cfff;
        }
        .structured-preflight-tracker-stat-cha .structured-preflight-tracker-stat-label {
            color: #8ee0b0;
        }
        .structured-preflight-tracker-detail-grid {
            display: grid;
            gap: 0.32rem;
            grid-template-columns: repeat(auto-fit, minmax(min(13rem, 100%), 1fr));
        }
        .structured-preflight-tracker-detail {
            display: grid;
            grid-template-columns: minmax(5.8rem, max-content) minmax(0, 1fr);
            gap: 0.45rem;
            align-items: start;
            min-width: 0;
            padding: 0.28rem 0.36rem;
            border-radius: 5px;
            background: color-mix(in srgb, var(--SmartThemeBlurTintColor, #000) 22%, transparent);
            line-height: 1.35;
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
        .structured-preflight-tracker-detail-label-wounds {
            background: #6b2b32;
        }
        .structured-preflight-tracker-detail-label-status {
            background: #285b78;
        }
        .structured-preflight-tracker-detail-label-gear {
            background: #73521d;
        }
        .structured-preflight-tracker-detail-label-inventory {
            background: #1d6c65;
        }
        .structured-preflight-tracker-detail-label-tasks {
            background: #54428a;
        }
        .structured-preflight-tracker-detail-label-commitments {
            background: #286447;
        }
        .structured-preflight-tracker-detail-label-pressure {
            background: #6a3f1d;
        }
        .structured-preflight-tracker-detail-label-neutral {
            background: color-mix(in srgb, var(--SmartThemeBodyColor, #eee) 20%, transparent);
        }
        .structured-preflight-tracker-detail-value {
            min-width: 0;
            overflow-wrap: anywhere;
        }
        .structured-preflight-tracker-divider {
            height: 1px;
            background: var(--SmartThemeBorderColor, rgba(255,255,255,0.22));
            opacity: 0.9;
        }
        .structured-preflight-tracker-npc {
            border-left: 4px solid #6a56a5;
        }
        .structured-preflight-tracker-muted,
        .structured-preflight-tracker-empty {
            opacity: 0.78;
        }
        @media (max-width: 520px) {
            .structured-preflight-tracker-detail {
                grid-template-columns: 1fr;
                gap: 0.12rem;
            }
            .structured-preflight-tracker-chip,
            .structured-preflight-tracker-stat-cluster {
                width: 100%;
                justify-content: space-between;
            }
            .structured-preflight-tracker-stat-pill-row {
                justify-content: flex-end;
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

function ensureProseGuardDisplayStyles() {
    if (typeof document === 'undefined' || document.getElementById(PROSE_GUARD_DISPLAY_STYLE_ID)) return;

    const style = document.createElement('style');
    style.id = PROSE_GUARD_DISPLAY_STYLE_ID;
    style.textContent = `
        #chat .mes.${PROSE_GUARD_HIDDEN_MESSAGE_CLASS} .mes_text,
        #chat .mes_text.${PROSE_GUARD_HIDDEN_TEXT_CLASS} {
            display: none !important;
        }
    `;
    document.head.append(style);
}

function setProseGuardNextMessageHidden(enabled) {
    if (typeof document === 'undefined') return;
    ensureProseGuardDisplayStyles();
    document.getElementById('chat')?.classList?.toggle(PROSE_GUARD_HIDE_NEXT_CLASS, Boolean(enabled));
}

function setProseGuardExpectedMessageHidden(messageId = null) {
    if (typeof document === 'undefined') return;

    document.getElementById(PROSE_GUARD_EXPECTED_STYLE_ID)?.remove();
    const normalizedId = Number(messageId);
    if (!Number.isFinite(normalizedId)) return;
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

    const expectedMessageId = Number(state.proseGuardExpectedMessageId);
    if (!Number.isFinite(expectedMessageId)) return false;

    const messageId = Number(node.getAttribute?.('mesid'));
    return Number.isFinite(messageId) && messageId === expectedMessageId;
}

function hideProseGuardMessageElement(messageElement, messageId = null) {
    if (!messageElement) return false;

    ensureProseGuardDisplayStyles();
    messageElement.classList?.add(PROSE_GUARD_HIDDEN_MESSAGE_CLASS);
    const normalizedId = Number(messageId ?? messageElement.getAttribute?.('mesid'));
    if (Number.isFinite(normalizedId)) {
        state.proseGuardHiddenMessageIds.add(normalizedId);
    }
    return true;
}

function hideProseGuardMessageById(messageId) {
    const messageElement = getMessageElement(messageId);
    return hideProseGuardMessageElement(messageElement, messageId);
}

function hasPendingProseGuardGenerationInput() {
    const pendingText = String(state.pendingGeneration?.latestUserText || state.pendingGeneration?.rawUserText || '').trim();
    return Boolean(pendingText);
}

function hasActiveProseGuardDisplayRun() {
    return Boolean(state.pendingRun || state.lastNarratorHandoff);
}

function canHideExpectedProseGuardMessage(messageId) {
    const normalizedId = Number(messageId);
    if (!Number.isFinite(normalizedId) || normalizedId <= 0) return false;
    if (!hasActiveProseGuardDisplayRun()) return false;

    const context = getContext();
    const priorMessages = Array.isArray(context?.chat) ? context.chat.slice(0, normalizedId) : [];
    const hasPriorUserMessage = priorMessages.some(message => message?.is_user || message?.role === 'user');
    return hasPriorUserMessage || hasPendingProseGuardGenerationInput();
}

function tryAttachProseGuardPendingMessage() {
    if (!state.proseGuardHideNextMessage || typeof document === 'undefined') return false;
    if (!hasActiveProseGuardDisplayRun()) {
        releaseProseGuardDisplayIntercept({ restore: true });
        return false;
    }

    const chatElement = document.getElementById('chat');
    if (!chatElement) return false;

    const expectedMessageId = Number(state.proseGuardExpectedMessageId);
    if (!Number.isFinite(expectedMessageId) || !canHideExpectedProseGuardMessage(expectedMessageId)) {
        releaseProseGuardDisplayIntercept({ restore: true });
        return false;
    }

    const messageElement = chatElement.querySelector(`.mes[mesid="${expectedMessageId}"]:not([is_user="true"])`);
    if (!messageElement) return false;

    state.proseGuardHideNextMessage = false;
    hideProseGuardMessageElement(messageElement, Number.isFinite(expectedMessageId) ? expectedMessageId : null);
    return true;
}

function shouldUseProseGuardDisplayIntercept(type) {
    const normalizedType = String(type || 'normal');
    return isStoryEngineEnabled()
        && getSettings().postNarrationProseGuardEnabled !== false
        && normalizedType !== 'impersonate'
        && Boolean(state.pendingGeneration)
        && hasPendingProseGuardGenerationInput()
        && hasActiveProseGuardDisplayRun()
        && ['normal', 'swipe', 'regenerate', 'continue'].includes(normalizedType);
}

function releaseProseGuardDisplayIntercept({ restore = false, messageId = null } = {}) {
    if (state.proseGuardStreamObserver) {
        state.proseGuardStreamObserver.disconnect();
    }
    state.proseGuardStreamElement?.classList?.remove(PROSE_GUARD_HIDDEN_TEXT_CLASS);
    if (typeof document !== 'undefined') {
        const idsToRelease = Number.isFinite(Number(messageId))
            ? [Number(messageId)]
            : [...state.proseGuardHiddenMessageIds];
        for (const id of idsToRelease) {
            getMessageElement(id)?.classList?.remove(PROSE_GUARD_HIDDEN_MESSAGE_CLASS);
            state.proseGuardHiddenMessageIds.delete(id);
        }
        if (!Number.isFinite(Number(messageId))) {
            document
                .querySelectorAll(`#chat .mes.${PROSE_GUARD_HIDDEN_MESSAGE_CLASS}`)
                .forEach(element => element.classList.remove(PROSE_GUARD_HIDDEN_MESSAGE_CLASS));
            state.proseGuardHiddenMessageIds.clear();
        }
        document
            .querySelectorAll(`#chat .mes_text.${PROSE_GUARD_HIDDEN_TEXT_CLASS}`)
            .forEach(element => element.classList.remove(PROSE_GUARD_HIDDEN_TEXT_CLASS));
    }
    setProseGuardNextMessageHidden(false);
    setProseGuardExpectedMessageHidden(null);

    state.proseGuardStreamObserver = null;
    state.proseGuardStreamElement = null;
    state.proseGuardStreamMessageId = null;
    state.proseGuardExpectedMessageId = null;
    state.proseGuardStreamResetting = false;
    state.proseGuardHideNextMessage = false;
    state.proseGuardGenerationType = null;
}

function disconnectProseGuardStreamObserver() {
    if (state.proseGuardStreamObserver) {
        state.proseGuardStreamObserver.disconnect();
    }
    state.proseGuardStreamObserver = null;
    state.proseGuardStreamResetting = false;
}

function attachProseGuardStreamIntercept(textElement, { preserveText = false, messageId = null } = {}) {
    if (!textElement) return;

    releaseProseGuardDisplayIntercept();
    ensureProseGuardDisplayStyles();
    const messageElement = Number.isFinite(Number(messageId)) ? getMessageElement(messageId) : textElement.closest?.('.mes');
    if (hideProseGuardMessageElement(messageElement, messageId)) return;

    state.proseGuardStreamElement = textElement;
    state.proseGuardStreamMessageId = messageId;
    textElement.classList?.add(PROSE_GUARD_HIDDEN_TEXT_CLASS);
}

function beginProseGuardDisplayIntercept(type, dryRun = false) {
    ensureProseGuardDisplayInterceptor();

    if (dryRun || !shouldUseProseGuardDisplayIntercept(type) || typeof document === 'undefined') {
        releaseProseGuardDisplayIntercept();
        return;
    }

    const normalizedType = String(type || 'normal');
    state.proseGuardGenerationType = normalizedType;

    if (['swipe', 'regenerate', 'continue'].includes(normalizedType)) {
        const context = getContext();
        const messageId = Array.isArray(context?.chat) ? context.chat.length - 1 : null;
        if (messageId != null && !context.chat[messageId]?.is_user) {
            state.proseGuardExpectedMessageId = messageId;
            setProseGuardExpectedMessageHidden(messageId);
            if (!hideProseGuardMessageById(messageId)) {
                state.proseGuardHideNextMessage = true;
            }
        }
        return;
    }

    const context = getContext();
    state.proseGuardExpectedMessageId = Array.isArray(context?.chat) ? context.chat.length : null;
    setProseGuardExpectedMessageHidden(state.proseGuardExpectedMessageId);
    state.proseGuardHideNextMessage = true;
    setProseGuardNextMessageHidden(true);
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
        releaseProseGuardDisplayIntercept({ restore: true });
    }
    tryAttachProseGuardPendingMessage();
    if (state.proseGuardChatObserver) return;

    const chatElement = document.getElementById('chat');
    if (!chatElement) return;

    state.proseGuardChatObserver = new MutationObserver(mutations => {
        if (!state.proseGuardHideNextMessage) return;
        if (!hasActiveProseGuardDisplayRun()) {
            releaseProseGuardDisplayIntercept({ restore: true });
            return;
        }

        for (const mutation of mutations) {
            for (const node of mutation.addedNodes) {
                if (node?.nodeType !== Node.ELEMENT_NODE) continue;

                const messageNodes = [
                    ...(node.classList?.contains('mes') ? [node] : []),
                    ...Array.from(node.querySelectorAll?.('.mes') || []),
                ];
                for (const messageNode of messageNodes) {
                    if (!isExpectedProseGuardMessageElement(messageNode)) continue;

                    const messageId = Number(messageNode.getAttribute('mesid'));
                    state.proseGuardHideNextMessage = false;
                    hideProseGuardMessageElement(messageNode, Number.isFinite(messageId) ? messageId : null);
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

    const messageElement = getMessageElement(messageId);
    if (!messageElement) return;

    messageElement.querySelector(`.${TRACKER_DISPLAY_BLOCK_CLASS}`)?.remove();
}

function renderAllTrackerDisplayBlocks(context = getContext()) {
    if (!isStoryEngineEnabled()) {
        if (typeof document !== 'undefined') {
            document.getElementById(TRACKER_WIDGET_ID)?.remove();
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
    if (!isStoryEngineEnabled() || settings.postNarrationTrackerEnabled === false) {
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
                    <button class="structured-preflight-tracker-widget-close" type="button" title="Collapse" aria-label="Collapse">x</button>
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
        #${PLAYER_SETUP_CARD_ID} [hidden] {
            display: none !important;
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

function buildProgressionCardHtml(root, context = getContext()) {
    const pending = root?.pendingAdvancement || {};
    const stats = getPlayerCoreStats(context) || getPersonaCoreStats(context) || { PHY: 1, MND: 1, CHA: 1 };
    const abilities = extractPersonaAbilities(getPersonaText(context));
    const abilityCount = abilities.length;
    const canRaiseStat = PLAYER_STATS.some(stat => Number(stats?.[stat] || 0) < PROGRESSION_MAX_STAT);
    const canSwapAbility = abilityCount >= 1;
    const choice = pending.choice || 'choose';
    const error = root?.ui?.error ? `<div class="spe-progression-error">${escapeHtml(root.ui.error)}</div>` : '';
    const busy = state.progressionBusy ? '<div class="spe-progression-muted">Working...</div>' : '';
    let body = '';

    if (choice === 'stat') {
        body = `
            <div class="spe-progression-muted">Choose one stat to raise. Stats cannot go above ${PROGRESSION_MAX_STAT}.</div>
            <div class="spe-progression-actions">
                ${PLAYER_STATS.map(stat => {
                    const value = Number(stats?.[stat] || 1);
                    const disabled = value >= PROGRESSION_MAX_STAT ? 'disabled' : '';
                    return `<button class="menu_button" data-spe-progression-action="apply-stat" data-stat="${stat}" ${disabled}>${stat} ${value} -> ${Math.min(PROGRESSION_MAX_STAT, value + 1)}</button>`;
                }).join('')}
                <button class="menu_button" data-spe-progression-action="back">Back</button>
            </div>`;
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
                ${options.length ? '' : '<button class="menu_button" data-spe-progression-action="back">Back</button>'}
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
    } else {
        body = `
            <div class="spe-progression-muted">${PROGRESSION_REQUIRED_ACCOMPLISHMENTS} critical accomplishments reached. Choose how the character advances.</div>
            <div class="spe-progression-actions">
                ${canRaiseStat ? '<button class="menu_button" data-spe-progression-action="choose-stat">Raise Stat</button>' : ''}
                ${canSwapAbility ? '<button class="menu_button" data-spe-progression-action="choose-swap-ability">Swap Ability</button>' : ''}
            </div>`;
    }

    return `
        <div class="spe-progression-title">Character Progression</div>
        ${busy}
        ${body}
        ${error}
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
    return `
        ${buildStatsGridHtml(creator)}
        <div class="spe-player-row">
            <label class="flex1">Name
                <input id="spe_player_character_name" class="text_pole" value="${escapeHtml(identity.characterName || '')}" placeholder="Optional. Leave blank to generate.">
            </label>
            <label class="flex1">Sex
                <input id="spe_player_sex" class="text_pole" value="${escapeHtml(identity.sex || '')}" placeholder="Optional. Leave blank to generate.">
            </label>
        </div>
        <div class="spe-player-row">
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
        </div>
        <div class="spe-player-row" data-spe-player-custom-race ${raceIsCustom ? '' : 'hidden'}>
            <label class="flex1">Specify race or ancestry
                <input id="spe_player_race_specify" class="text_pole" value="${escapeHtml(identity.specifiedRace || '')}" placeholder="Optional">
            </label>
        </div>
        <div class="spe-player-row" data-spe-player-custom-race ${raceIsCustom ? '' : 'hidden'}>
            <label class="flex1">Specified race details
                <select id="spe_player_race_description_mode" class="text_pole">
                    <option value="system" ${raceDescriptionMode === 'system' ? 'selected' : ''}>Let system describe it</option>
                    <option value="user" ${raceDescriptionMode === 'user' ? 'selected' : ''}>Describe it myself</option>
                </select>
            </label>
        </div>
        <div class="spe-player-row" data-spe-player-race-description ${raceIsCustom && raceDescriptionMode === 'user' ? '' : 'hidden'}>
            <label class="flex1">Your race description
                <textarea id="spe_player_race_description" class="text_pole" placeholder="Optional unless you choose Describe it myself.">${escapeHtml(identity.specifiedRaceDescription || '')}</textarea>
            </label>
        </div>
        <div class="spe-player-row">
            <label class="flex1">Additional character details
                <select id="spe_player_additional_details_mode" class="text_pole">
                    <option value="system" ${additionalDetailsMode === 'system' ? 'selected' : ''}>Let AI decide</option>
                    <option value="user" ${additionalDetailsMode === 'user' ? 'selected' : ''}>Use my notes + fill the rest</option>
                </select>
            </label>
        </div>
        <div class="spe-player-row" data-spe-player-additional-details ${additionalDetailsMode === 'user' ? '' : 'hidden'}>
            <label class="flex1">Your character details
                <textarea id="spe_player_additional_details" class="text_pole" placeholder="Optional background, Earth life, appearance, clothing, training, inventory, origin, scars, or other fixed starting facts.">${escapeHtml(additionalDetails)}</textarea>
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
    const updateOptionalFields = () => updatePlayerIdentityOptionalFields(card);
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
        const optionIndex = button.getAttribute('data-option-index');
        await handleProgressionAction(action, { stat, optionIndex, card }, getContext() || context);
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
    root.ui = root.ui || {};
    delete root.ui.error;

    try {
        if (action === 'choose-stat') {
            root.pendingAdvancement.choice = 'stat';
        } else if (action === 'choose-swap-ability') {
            root.pendingAdvancement.choice = 'swapAbility';
            root.pendingAdvancement.abilityOptions = [];
            delete root.pendingAdvancement.generatedAt;
        } else if (action === 'back') {
            if (Array.isArray(root.pendingAdvancement.abilityOptions) && root.pendingAdvancement.abilityOptions.length) {
                throw new Error('Ability options are already generated. Choose one of the presented abilities.');
            }
            root.pendingAdvancement.choice = 'choose';
            root.pendingAdvancement.abilityOptions = [];
            delete root.pendingAdvancement.generatedAt;
            delete root.pendingAdvancement.swapAbilityIndex;
        } else if (action === 'apply-stat') {
            await applyProgressionStatChoice(root, details.stat, context);
        } else if (action === 'generate-abilities') {
            state.progressionBusy = true;
            root.pendingAdvancement.swapAbilityIndex = getSelectedProgressionSwapAbilityIndex(context);
            renderProgressionCard(context);
            root.pendingAdvancement.abilityOptions = await requestProgressionAbilityOptions(root.pendingAdvancement, context);
            root.pendingAdvancement.generatedAt = Date.now();
        } else if (action === 'choose-ability') {
            if (!Array.isArray(root.pendingAdvancement.abilityOptions) || !root.pendingAdvancement.abilityOptions.length) {
                root.pendingAdvancement.swapAbilityIndex = getSelectedProgressionSwapAbilityIndex(context);
            }
            await applyProgressionAbilityChoice(root, Number(details.optionIndex), context);
        }
        await persistMetadata(context);
    } catch (error) {
        root.ui.error = error instanceof Error ? error.message : String(error);
        console.error(`[${EXTENSION_NAME}] progression action failed`, error);
        await persistMetadata(context);
    } finally {
        state.progressionBusy = false;
        renderProgressionCard(context);
        refreshSettingsControls();
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
    creator.identity.characterName = String(document.getElementById('spe_player_character_name')?.value || creator.identity.characterName || '').trim();
    creator.identity.sex = String(document.getElementById('spe_player_sex')?.value || creator.identity.sex || '').trim();
    const genre = document.getElementById('spe_player_genre')?.value || creator.identity.genre || 'Fantasy';
    creator.identity.genre = PLAYER_GENRE_CHOICES.includes(genre) ? genre : 'Fantasy';
    const raceValue = document.getElementById('spe_player_race')?.value || (creator.identity.raceMode === 'pick' ? creator.identity.pickedRace : creator.identity.raceMode) || 'random';
    if (raceValue === 'custom') {
        creator.identity.raceMode = 'specify';
    } else if (raceValue === 'random') {
        creator.identity.raceMode = 'random';
    } else {
        creator.identity.raceMode = 'pick';
        creator.identity.pickedRace = PLAYER_RACE_CHOICES.includes(raceValue) ? raceValue : 'Human';
    }
    creator.identity.specifiedRace = String(document.getElementById('spe_player_race_specify')?.value || creator.identity.specifiedRace || '').trim();
    creator.identity.specifiedRaceDescriptionMode = document.getElementById('spe_player_race_description_mode')?.value || creator.identity.specifiedRaceDescriptionMode || 'system';
    creator.identity.specifiedRaceDescription = String(document.getElementById('spe_player_race_description')?.value || creator.identity.specifiedRaceDescription || '').trim();
    const additionalDetailsMode = document.getElementById('spe_player_additional_details_mode')?.value || creator.identity.additionalDetailsMode || 'system';
    creator.identity.additionalDetailsMode = additionalDetailsMode === 'user' ? 'user' : 'system';
    creator.identity.additionalDetails = String(document.getElementById('spe_player_additional_details')?.value || creator.identity.additionalDetails || creator.identity.appearance || '').trim();
    delete creator.identity.appearance;
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

async function applyProgressionStatChoice(root, stat, context = getContext()) {
    const statName = String(stat || '').toUpperCase();
    if (!PLAYER_STATS.includes(statName)) throw new Error('Choose a valid stat.');
    const stats = getPlayerCoreStats(context) || getPersonaCoreStats(context);
    if (!isValidCoreStats(stats)) throw new Error('Cannot raise a stat because the active persona has no valid PHY/MND/CHA block.');
    if (Number(stats[statName]) >= PROGRESSION_MAX_STAT) {
        throw new Error(`${statName} is already at ${PROGRESSION_MAX_STAT}.`);
    }
    const nextStats = normalizeCoreStats({
        ...stats,
        [statName]: Number(stats[statName]) + 1,
    });
    const nextText = updatePersonaStatText(getPersonaText(context), statName, nextStats[statName]);
    await writePlayerSheetToPersona(nextText, context);
    syncPlayerRootAfterPersonaEdit(context, nextText, nextStats);
    completeProgressionAdvancement(root, {
        type: 'stat',
        stat: statName,
        value: nextStats[statName],
    });
}

async function applyProgressionAbilityChoice(root, optionIndex, context = getContext()) {
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

    await writePlayerSheetToPersona(nextText, context);
    syncPlayerRootAfterPersonaEdit(context, nextText, getPersonaCoreStats(context));
    completeProgressionAdvancement(root, {
        type: 'swapAbility',
        ability: option,
        replacedIndex: pending.swapAbilityIndex,
    });
}

function completeProgressionAdvancement(root, reward) {
    const pending = root?.pendingAdvancement;
    if (!root || !pending) return;
    const sourceIds = new Set(Array.isArray(pending.sourceRecordIds) ? pending.sourceRecordIds : []);
    root.accomplishments = (root.accomplishments || []).map(record => sourceIds.has(record.id)
        ? { ...record, spent: true, spentAt: Date.now() }
        : record);
    root.spentAdvancements = Math.max(0, Math.floor(Number(root.spentAdvancements || 0))) + 1;
    root.lastAdvancement = {
        id: pending.id,
        reward,
        resolvedAt: Date.now(),
    };
    root.pendingAdvancement = null;
    root.ui = {};
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

function buildProgressionAbilityPrompt(pending, context = getContext()) {
    const persona = getPersonaText(context);
    const abilities = extractPersonaAbilities(persona);
    const stats = getPlayerCoreStats(context) || getPersonaCoreStats(context) || {};
    const recent = getProgressionRecentAccomplishments(getProgressionRoot(context), pending);
    const replacing = pending?.choice === 'swapAbility'
        ? abilities[Math.max(0, Math.floor(Number(pending.swapAbilityIndex || 0)))]
        : null;
    return [
        {
            role: 'system',
            content:
                'You generate concise RPG character ability options for a deterministic SillyTavern extension. ' +
                'Abilities are fictional permissions, not numerical mechanics. They must fit the character race/body/origin, existing trait/abilities, genre, stats, and recent critical accomplishments. ' +
                'Each option must be directly usable in narration as a concrete action, perception, movement, communication, conjuration, transformation, attack method, utility method, or special technique. Do not return passive traits, vague expertise, personality flavor, lore labels, or background-only qualities. ' +
                'Do not give numerical values, measured ranges, distances, radii, durations, weights, speeds, areas, dice modifiers, HP rules, advantage/disadvantage, cooldowns, uses per day, guaranteed combat success, guaranteed escape, guaranteed control, or automatic solutions. ' +
                'Opposed, risky, combat, stealth, coercive, unwilling-target, security-bypass, harmful, or dangerous use still requires normal scene resolution. ' +
                'Do not duplicate existing abilities. Return exactly three usable replacement ability options.',
        },
        {
            role: 'user',
            content:
                'Return only this compact block. No markdown before or after it.\n' +
                'BEGIN_PROGRESSION_ABILITIES\n' +
                'Option1Name=short ability name\n' +
                'Option1Description=one or two sentences, directly usable fictional permission only, with fictional limits and no mechanics or measurements\n' +
                'Option2Name=short ability name\n' +
                'Option2Description=one or two sentences, directly usable fictional permission only, with fictional limits and no mechanics or measurements\n' +
                'Option3Name=short ability name\n' +
                'Option3Description=one or two sentences, directly usable fictional permission only, with fictional limits and no mechanics or measurements\n' +
                'END_PROGRESSION_ABILITIES\n\n' +
                'MODE: SWAP_ABILITY\n' +
                `LOCKED STATS: ${PLAYER_STATS.map(stat => `${stat} ${stats?.[stat] ?? 'unknown'}`).join(', ')}\n` +
                `EXISTING ABILITIES:\n${abilities.length ? abilities.map((ability, index) => `${index + 1}. ${ability.text}`).join('\n') : 'none'}\n\n` +
                `${replacing ? `ABILITY BEING REPLACED:\n${replacing.text}\n\n` : ''}` +
                `RECENT CRITICAL ACCOMPLISHMENTS:\n${recent.length ? recent.map((record, index) => `${index + 1}. ${formatProgressionRecordForPrompt(record)}`).join('\n') : 'none'}\n\n` +
                `PERSONA SHEET:\n${clipText(persona, 5000)}`,
        },
    ];
}

function getProgressionRecentAccomplishments(root, pending) {
    const ids = new Set(Array.isArray(pending?.sourceRecordIds) ? pending.sourceRecordIds : []);
    const source = Array.isArray(root?.accomplishments) ? root.accomplishments : [];
    const selected = source.filter(record => ids.has(record.id));
    return (selected.length ? selected : source.filter(record => !record.spent).slice(-PROGRESSION_REQUIRED_ACCOMPLISHMENTS)).slice(-PROGRESSION_REQUIRED_ACCOMPLISHMENTS);
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

function maybeRecordProgressionAccomplishment({ pendingRun, messageKey, context = getContext() } = {}) {
    if (!isStoryEngineEnabled()) return false;
    if (getSettings().characterProgressionEnabled === false) return false;
    if (!pendingRun || !messageKey) return false;
    const root = getProgressionRoot(context);
    if (!root || root.pendingAdvancement) return false;
    if (!isEligibleCriticalAccomplishment(pendingRun)) return false;
    if (root.accomplishments.some(record => record.messageKey === messageKey)) return false;

    const record = buildProgressionAccomplishmentRecord(pendingRun, messageKey);
    root.accomplishments.push(record);
    root.accomplishments = root.accomplishments.slice(-24);

    const unspent = root.accomplishments.filter(item => !item.spent);
    if (unspent.length >= PROGRESSION_REQUIRED_ACCOMPLISHMENTS) {
        const sourceRecords = unspent.slice(0, PROGRESSION_REQUIRED_ACCOMPLISHMENTS);
        root.pendingAdvancement = {
            id: `adv-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            createdAt: Date.now(),
            choice: 'choose',
            sourceRecordIds: sourceRecords.map(item => item.id),
            abilityOptions: [],
        };
        root.ui = {};
    }
    return true;
}

function isEligibleCriticalAccomplishment(pendingRun) {
    const packet = pendingRun?.resolutionPacket || pendingRun?.report?.finalNarrativeHandoff?.resolutionPacket || {};
    return packet.STAKES === 'Y' && packet.OutcomeTier === 'Critical_Success';
}

function buildProgressionAccomplishmentRecord(pendingRun, messageKey) {
    const packet = pendingRun?.resolutionPacket || pendingRun?.report?.finalNarrativeHandoff?.resolutionPacket || {};
    const resultLine = String(pendingRun?.report?.finalNarrativeHandoff?.resultLine || '');
    return {
        id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        messageKey,
        createdAt: Date.now(),
        spent: false,
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

async function requestProgressionText(prompt, responseLength, overridePayload = {}) {
    if (!isStoryEngineEnabled()) {
        throw new Error('Story Engine is disabled.');
    }
    const context = getContext();
    state.bypassPromptReady = true;
    try {
        return await withStoryEngineModelRequest(() => withProgressionGenerationSettings(async settings => {
            if (settings?.semanticProfileId) {
                return await sendSemanticProfileTextRequest(prompt, responseLength, settings, overridePayload);
            }
            if (!context?.generateRawData) {
                throw new Error('SillyTavern generateRawData API is unavailable for progression ability generation.');
            }
            const textPrompt = Array.isArray(prompt)
                ? prompt.map(message => `${String(message.role || 'user').toUpperCase()}:\n${String(message.content || '')}`).join('\n\n')
                : String(prompt || '');
            return await context.generateRawData({ prompt: textPrompt, responseLength });
        }));
    } finally {
        state.bypassPromptReady = false;
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
    const statInstruction = buildNewCharacterStatInstruction(stats);
    const genreInstruction = buildNewCharacterGenreInstruction(identity);
    const raceInstruction = buildNewCharacterRaceInstruction(identity);
    const nameInstruction = buildNewCharacterNameInstruction(identity);
    const sexInstruction = buildNewCharacterSexInstruction(identity);
    const additionalDetailsInstruction = buildNewCharacterAdditionalDetailsInstruction(identity);
    const prompt = [
        {
            role: 'system',
            content:
                'You generate a SillyTavern user persona character sheet for roleplay. ' +
                'This is a playable user character shell, not an authored protagonist. Fill only fixed starting facts the user can step into. ' +
                'Do not decide future choices, personality, habits, emotional reactions, combat preferences, social strategy, morals, goals, fears, or how the character will behave in play. ' +
                'The numeric stats are locked and must be copied exactly. Do not reroll, rebalance, or assign new numbers. ' +
                'Generate flavorful but grounded details. Avoid overpowered abilities. Keep inventory appropriate to the character, genre, and setting.',
        },
        {
            role: 'user',
            content:
                'Return only the finished character sheet in markdown. No preface and no questions.\n\n' +
                `LOCKED STATS:\nPHY: ${stats.PHY}\nMND: ${stats.MND}\nCHA: ${stats.CHA}\n\n` +
                `${statInstruction}\n${genreInstruction}\n${nameInstruction}\n${sexInstruction}\n${raceInstruction}\n${additionalDetailsInstruction}\n\n` +
                'Required sections:\n' +
                '# BASIC INFO: Name, Race, Bloodline if relevant, UserNonHuman Y/N, Gender, Age, and fixed origin, prior role, or prior training if relevant. Do not include personality, future plans, preferred behavior, or emotional tendencies.\n' +
                '# APPEARANCE: visible physical facts only: height, build, hair, eyes, skin, scars, marks, clothing, carried look, and other visible features. Do not describe behavior, habits, posture-as-personality, emotional reactions, nervous tells, voice behavior, or how the character usually acts. Appearance must reflect PHY when relevant and must not default to lean, wiry, slender, or lithe unless the stat shape and concept justify it.\n' +
                '# STATS: PHY, MND, CHA copied exactly.\n' +
                '# TRAITS (ALWAYS ACTIVE): exactly one passive trait. The trait must be unique, impactful, permanent, and inherent to the character race, body, origin, or nature. It is always true and applies automatically when relevant. If something is passive and always-on, it belongs here. It must not be a learned skill, chosen action, trigger-based power, or disguised ability. It must create concrete fictional consequences: what the character can perceive, physically be, naturally endure, naturally recover from, be vulnerable to, or do by nature. Do not write numerical bonuses, dice modifiers, HP rules, advantage/disadvantage, cooldowns, uses per day, automatic success, immunity to consequences, vague expertise, or conditional mini-abilities.\n' +
                `# ABILITIES / SKILLS: exactly ${PROGRESSION_REQUIRED_ABILITIES} usable abilities, powers, techniques, or special methods. Each ability must be directly usable in narration as a concrete action, perception, movement, communication, conjuration, transformation, attack method, utility method, or special technique. If something requires a deliberate trigger, use, gesture, focus, exertion, target, transformation, attack, conjuration, message, or other described attempt, it belongs here. The user does not need to name the ability; if the user describes an action that clearly uses it, treat that as ability use. Each ability grants fictional permission to attempt that kind of action, but it does not grant mechanical advantage or guaranteed success. Utility use may simply work in narration only when it is unopposed, low-stakes, outside active danger, and has no immediate harmful, contested, stealth, escape, security-bypass, control, ambush, trap, or unwilling-target consequence. If there is combat, active danger, pursuit, stealth pressure, opposition, risk, harm, defense, coercion, uncertainty, an unwilling target, or any meaningful consequence, normal scene resolution decides the result. Limits must be fictional constraints, not numerical values, measured ranges, distances, radii, durations, cooldown timers, or usage counts. Do not write numerical bonuses, dice modifiers, HP rules, advantage/disadvantage, cooldowns, uses per day, automatic combat success, guaranteed escape, guaranteed control, automatic solutions, or measurements like feet/meters/yards.\n` +
                '# INVENTORY: setting-appropriate starting gear only. Do not casually add magic items, self-guiding tools, special artifacts, weapons, or supernatural equipment unless the fixed background, race, genre, or single activated ability specifically justifies them.\n' +
                '# FLAVOR / FIXED FACTS: concise fixed background flavor, origin facts, prior role, prior training, immutable constraints, ability/trait limits, unresolved hooks, or secrecy facts if relevant. This section must add context the user can play with, not decisions made for them. Do not include personality, future plans, preferred tactics, combat style, social strategy, goals, fears, habits, emotional reactions, or statements about what the character will/may/usually/tends to do.',
        },
    ];
    return sanitizeGeneratedSheet(await requestPlayerSetupText(prompt, PLAYER_SETUP_SHEET_RESPONSE_LENGTH, {
        temperature: 0.7,
    }));
}

function buildNewCharacterNameInstruction(identity = {}) {
    const name = String(identity.characterName || '').trim();
    if (name) {
        return `Use this character name exactly: ${name}.`;
    }
    return 'Generate a fitting character name.';
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
            'The user-provided additional character details are locked starting facts. Preserve their meaning exactly.',
            'Use them to shape background, Earth life, arrival/origin, appearance, clothing, profession, prior training, inventory, scars, marks, body type, race flavor, or other fixed sheet details as applicable.',
            'Fill missing details normally, but do not contradict, replace, weaken, intensify, or ignore these notes.',
            'Do not turn these notes into personality, future choices, goals, fears, habits, tactics, morals, emotional reactions, preferred behavior, or statements about what the character will/may/usually/tends to do.',
            identity.genre === 'Isekai'
                ? 'Because the selected genre is Isekai, any Earth-life details in these notes describe the character before arrival in the new world.'
                : '',
            `LOCKED USER ADDITIONAL DETAILS:\n${details}`,
        ].filter(Boolean).join('\n');
    }
    return 'Generate fitting background, origin, appearance, clothing, training, inventory, and fixed details from the chosen race, genre, stats, and concept.';
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
        instructions.push('For Isekai, the character must originate from Earth before arriving, reincarnating, transferring, being summoned, or otherwise crossing into the new world.');
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
    if (!isStoryEngineEnabled()) {
        throw new Error('Story Engine is disabled.');
    }
    const context = getContext();
    state.bypassPromptReady = true;
    try {
        return await withStoryEngineModelRequest(() => withSemanticGenerationSettings(async settings => {
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
        }));
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

    if (trimmed.length >= 4 && trimmed.startsWith('[[') && trimmed.endsWith(']]')) {
        return { mode: 'proxy', innerText: trimmed.slice(2, -2).trim() };
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
        root.powerActors = root.snapshots?.[getMessageKey(targetMessageId, context)]?.beforePowerActors || root.powerActors || {};
        root.userKnowledge = mergeUserKnowledgeLedger(root.snapshots?.[getMessageKey(targetMessageId, context)]?.beforeUserKnowledge || root.userKnowledge || {}, {});
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

function buildProseGuardPrompt(narrationText, latestUserText = '') {
    const settings = getSettings();
    const formattingPrompt = settings.proseGuardFormattingEnabled !== false
        ? String(settings.proseGuardFormattingPrompt ?? DEFAULT_PROSE_GUARD_FORMATTING_PROMPT).trim()
        : '';
    return [
        'STORY_ENGINE_PROSE_GUARD',
        '',
        'You are PROSE_GUARD, a strict prose compliance editor.',
        '',
        'TASK:',
        'Edit TEXT_TO_CHECK only to remove prose-rule violations. Preserve the scene exactly.',
        'If no violations exist, return TEXT_TO_CHECK unchanged.',
        'A turn-boundary violation is a prose-rule violation. Cut invalid after-beat tailing instead of preserving it.',
        'A T+1 violation is a prose-rule violation. Remove or rewrite narration that merely restates RECENT_USER_INPUT instead of showing consequence.',
        '',
        'ONE-CALL PRIVATE PASS PIPELINE:',
        'Work through these private correction passes in order. Do not output pass notes, labels, analysis, or intermediate drafts.',
        '1. literalStyleFilter(response): remove literal prose/style violations only.',
        '2. chronologyControl(response, RECENT_USER_INPUT): remove T+1/user-input restatement violations only.',
        '3. responseEndpointControl(response): cut invalid after-beat tailing only.',
        ...(formattingPrompt ? [
            '4. formattingControl(response): preserve and repair required markdown formatting only.',
            '5. integrityCheck(original, corrected): ensure the corrected text still renders the same resolved scene.',
        ] : [
            '4. integrityCheck(original, corrected): ensure the corrected text still renders the same resolved scene.',
        ]),
        '',
        'PROTECTED FACTS / INTEGRITY LOCK:',
        '- Events, action order, success or failure, landed contact, injuries, death, condition, intimacy permission, refusal, consent boundary, names, dialogue meaning, user agency, NPC agency, tracked state, or mechanics.',
        ...(formattingPrompt ? [
            '- Required formatting is protected unless it violates endpoint control: valid __underlined names/roles/locations__, valid *** separators, speaker block structure, and paragraph breaks.',
        ] : []),
        '- Do not add new actions, remove valid pre-boundary actions, add reactions, add dialogue, reveal information, soften refusals, intensify intimacy, or reinterpret what happened.',
        '- Exception: remove every sentence, paragraph, separator line, or outro that appears after the final response beat unless it is required by an explicit resolved mechanic.',
        '- Do not delete body detail. Replace invalid shorthand with valid concrete prose when needed.',
        '',
        'PASS 1: literalStyleFilter(response)',
        'Goal: keep the same scene content while removing prose/style violations.',
        'Stock body-emotion shorthand:',
        'Ban stock physical tells used as emotion/sexual/effort shorthand. This includes blush, flush, cheeks heating, ears reddening, face paling, jaw tightening, jaw setting, jaw working, mouth firming, lips parting without consequence, throat bobbing, fingers twitching, knuckles whitening, grip color changes, breath hitching, breath catching, heart pounding, pulse jumping, stomach dropping, heat pooling, and any equivalent workaround phrase.',
        'Do not preserve the same coded tell by rewording it. Replace it with action that changes contact, space, timing, posture, speech content, object handling, or visible consequence.',
        'Ban oscillating micro-cue loops and body-language churn: mouth opens/closes/opens, grip tightens/loosens/tightens, gaze looks away/back/down, gestures start/stop/restart, repeated tapping/gripping/releasing, and stacked hands/eyes/mouth/shoulder tells used only to show hesitation, fear, arousal, embarrassment, tension, or uncertainty.',
        'Replace twitch loops with one consequential physical choice plus dialogue, such as increasing distance, blocking contact, keeping an object, refusing, protecting an exit, changing position, or stopping at a clear boundary.',
        '',
        'Skin-color shorthand:',
        'Do not use reddening, paling, whitening, darkening, flushing, or color changes as emotional, romantic, sexual, psychological, fear, pain, exertion, anger, embarrassment, arousal, or physical-effort shorthand.',
        '',
        'Lazy voice shorthand:',
        'Ban canned quiet-voice phrasing and its equivalents: "barely above a whisper," "just above a whisper," "almost a whisper," "voice barely audible," "low murmur," "soft murmur," "a thread of sound," "a thin whisper," "a small voice," "a fragile whisper," or similar trope delivery. Low, quiet, shaking, hoarse, rough, strained, interrupted, or trembling speech is allowed only when physically specific and not canned shorthand.',
        '',
        'Nonliteral prose:',
        'Ban metaphor, simile, idiom, hyperbole, ellipsis, poetic framing, personification, emotional physics, vibe adjectives, decorative sensual haze, sensory analogy phrasing, atmospheric filler, and "not X, but Y" contrast constructions.',
        'This includes abstract events treated as physical objects or forces: words cannot land, drop, hang, cut, hit, weigh, burn, freeze, crawl, bloom, bloom under skin, fill the room, stretch between people, fall like stones, or behave like weather/liquid/pressure. Smoke, rooms, silence, tension, heat, darkness, and atmosphere cannot breathe, swallow, press, listen, wait, coil, curl with intent, or otherwise act like characters.',
        'Directly ban patterns like "the word lands flat and hard," "dropped like a stone," "like a stone on still water," "silence stretches," "tension coils," "the room holds its breath," and equivalent nonliteral replacements.',
        '',
        'Unsupported emotion labels:',
        'Do not state feelings directly unless the text also shows consequential visible behavior.',
        '',
        'Decorative filler:',
        'Remove or rewrite ornamental atmosphere that does not change action, visibility, sound, contact, footing, threat, or available choices. Keep environmental detail only when it materially affects the scene.',
        '',
        'Valid replacements for literalStyleFilter:',
        'Replace violations with concrete, consequential physical behavior: movement, spacing, contact, pressure, object handling, blocked access, retreat, approach, timing, speech choices, visible damage, posture that changes action, or environmental interaction.',
        'Do not replace a violation with another coded tell or workaround phrase.',
        'Do not replace one invalid tell with a pileup of smaller tells. Collapse repeated micro-reactions into a single scene-changing beat.',
        'Use literal sentences that preserve intensity through action and consequence, not poetic comparison.',
        '',
        'PASS 2: chronologyControl(response, RECENT_USER_INPUT)',
        'Goal: make the narration begin at T+1 after the latest user input.',
        'The user input is already complete. The narration must begin after it, with consequence, revealed information, NPC response, environmental change, or new stimulus.',
        'Do not echo, restate, paraphrase, summarize, restage, re-perform, or narrate back RECENT_USER_INPUT.',
        'If RECENT_USER_INPUT says the user sits, enters, walks, watches, scans, speaks, takes, opens, moves, leans, observes, or looks around, do not write the user doing that same thing again.',
        'Valid continuation may describe what changes because of the declared action: who reacts, what becomes visible from the new position, what sound interrupts, what blocks access, what object is within reach, what NPC says, or what happens next.',
        'If the first sentence merely repeats the user action, remove that sentence or rewrite it as consequence without adding new user action.',
        '',
        'PASS 3: responseEndpointControl(response)',
        'Goal: end at the natural user-centered response beat.',
        'End where the scene naturally returns control to the user, not where narration prompts or pressures the user to act.',
        'The response beat is the point where the immediate consequence, NPC response, revealed information, available object, changed access, danger, or environmental condition is clear enough for the user to choose what to do next.',
        'If an NPC speaks or acts toward the user, end on that speech or action once it creates a natural point for the user to answer, refuse, inspect, interrupt, defend against, follow, ignore, or act.',
        'If no NPC is driving the beat, end on the relevant consequence of the user\'s action, a visible scene change, an available object or path, a new obstruction, a hazard, or a concrete environmental stimulus.',
        'Do not invent a question, threat, gesture, stare, pause, silence, or waiting beat just to create an endpoint. Never end by prompting the user to act.',
        'HARD STOP: remove every sentence, paragraph, separator line, outro, atmospheric tag, or scene-break tail after the response beat unless it is required by an explicit resolved mechanic.',
        'Ban explicit waiting, "she waits," "awaits your response," "what do you do," "the choice is yours," all-eyes-on-user framing, mood-only silence, unrelated ambience, outro paragraphs, scene-break tails, and extra narration after the response beat.',
        'Do not replace after-beat tailing with different after-beat tailing. Cut it.',
        '',
        ...(formattingPrompt ? [
            'PASS 4: formattingControl(response)',
            'Goal: preserve and repair required display formatting without changing scene content.',
            formattingPrompt,
            '',
            'PASS 5: integrityCheck(original, corrected)',
        ] : [
            'PASS 4: integrityCheck(original, corrected)',
        ]),
        'Goal: return only a corrected narration that preserves the resolved scene.',
        'Before answering, verify that the corrected text did not change protected facts, did not add a new scene beat, did not delete a valid pre-boundary scene beat, and did not reinterpret mechanics or character decisions.',
        ...(formattingPrompt ? [
            'Verify that required formatting remains intact after prose corrections. Do not flatten speaker blocks, remove valid underlines, or remove valid separators.',
        ] : []),
        'If a proposed correction would change protected facts, keep the original valid content and only remove the prose violation.',
        'If a sentence is both a valid resolved scene beat and contains a prose violation, rewrite the sentence narrowly instead of deleting it.',
        '',
        'GOOD REPLACEMENT PATTERN:',
        'Invalid: "Her jaw tightened. The word landed flat and hard, dropped like a stone between them."',
        'Valid: "She set her hand against his wrist and pushed it away. She said the word once, low and clear, then stepped back to keep distance between them."',
        'Invalid after-beat tail: "She says, \"Come with me.\" A cart rattles past behind her, and two guards continue down the street."',
        'Valid after-beat cut: "She says, \"Come with me.\"',
        'Invalid T+1 restatement: User said "I take a seat and scan the room." Narration says "You take the empty desk and let your gaze drift across the room."',
        'Valid T+1 continuation: "The nearest students stop whispering. A girl in the second row catches the look and turns back to her slate."',
        '',
        'OUTPUT CONTRACT:',
        'Return only the corrected narration text. No labels, bullets, commentary, markdown fences, XML, JSON, analysis, or preamble.',
        '',
        '==RECENT_USER_INPUT==',
        latestUserText || '(empty)',
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

async function requestProseGuardCorrection(narrationText, latestUserText = '') {
    if (!isStoryEngineEnabled()) {
        throw new Error('Story Engine is disabled.');
    }
    const prompt = buildProseGuardPrompt(narrationText, latestUserText);
    const responseLength = Math.max(800, Math.min(3000, Math.ceil(String(narrationText || '').length / 3) + 500));
    state.bypassPromptReady = true;
    try {
        return await withStoryEngineModelRequest(() => withProseGuardGenerationSettings(async settings => {
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
        }));
    } finally {
        state.bypassPromptReady = false;
    }
}

function deferForProseGuardFinalization() {
    return new Promise(resolve => setTimeout(resolve, PROSE_GUARD_DEFER_MS));
}

async function requestProseGuardCorrectionWithTimeout(narrationText, latestUserText = '') {
    let timeoutId = null;
    try {
        return await Promise.race([
            requestProseGuardCorrection(narrationText, latestUserText),
            new Promise((_, reject) => {
                timeoutId = setTimeout(
                    () => {
                        state.bypassPromptReady = false;
                        reject(new Error(`Prose Guard timed out after ${Math.round(PROSE_GUARD_TIMEOUT_MS / 1000)} seconds.`));
                    },
                    PROSE_GUARD_TIMEOUT_MS,
                );
            }),
        ]);
    } finally {
        if (timeoutId != null) clearTimeout(timeoutId);
    }
}

function isPostNarrationFinalizerCurrent(context, messageId, messageKey, captured = {}) {
    if (!context || !Array.isArray(context.chat)) return false;
    if (captured?.chatId && getChatId(context) !== captured.chatId) return false;
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
        user: pendingRun?.userBefore || {},
        npcs: pendingRun?.trackerBefore || {},
        userKnowledge: pendingRun?.userKnowledgeBefore || {},
    };
    const mechanicalAfter = {
        user: pendingRun?.userAfter || {},
        npcs: pendingRun?.trackerAfter || {},
        userKnowledge: pendingRun?.userKnowledgeBefore || {},
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
    const semanticPersonalityEvidence = buildSemanticPersonalityEvidence({
        activeNpcNames,
        handoff,
        previousNpcs: previous.npcs,
        trackerNpcs: trackerDisplaySnapshot?.npcs || {},
        semanticTrackerNpcs,
    });

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

async function requestPostNarrationTrackerDelta({ pendingRun, messageKey, narrationText, trackerDisplaySnapshot }) {
    if (!isStoryEngineEnabled()) {
        throw new Error('Story Engine is disabled.');
    }
    const prompt = buildPostNarrationTrackerPrompt({ pendingRun, messageKey, narrationText, trackerDisplaySnapshot });
    const responseLength = 2400 + Math.min(4000, Object.keys(trackerDisplaySnapshot?.npcs || {}).length * 320);
    state.bypassPromptReady = true;
    try {
        return await withStoryEngineModelRequest(() => withTrackerGenerationSettings(async settings => {
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
        }));
    } finally {
        state.bypassPromptReady = false;
    }
}

function prependComputedDebug(messageId, type) {
    if (!isStoryEngineEnabled()) {
        releaseProseGuardDisplayIntercept({ restore: true, messageId });
        clearRuntimePrompts();
        return;
    }
    const context = getContext();
    const messageKey = getMessageKey(messageId, context);

    if (!state.lastNarratorHandoff || state.lastNarratorHandoffKey === messageKey || type === 'impersonate') {
        releaseProseGuardDisplayIntercept({ restore: true, messageId });
        clearRuntimePrompts();
        return;
    }

    const message = context?.chat?.[messageId];
    if (!message || message.is_user) {
        releaseProseGuardDisplayIntercept({ restore: true, messageId });
        clearRuntimePrompts();
        return;
    }

    const proseGuardEnabled = getSettings().postNarrationProseGuardEnabled !== false;
    if (state.postNarrationFinalizers.has(messageKey)) return;

    clearPendingRunCleanupTimer();
    if (proseGuardEnabled) {
        hideProseGuardMessageById(messageId);
    }
    setChatInputLocked(true, 'Finalizing narration...');
    const finalizingToast = showProgress('Finalizing narration...');
    const captured = {
        chatId: getChatId(context),
        narratorHandoff: state.lastNarratorHandoff,
        pendingRun: state.pendingRun,
    };
    state.postNarrationFinalizers.add(messageKey);

    const finalize = () => {
        state.postNarrationFinalizerTimers.delete(messageKey);
        void finalizePostNarrationMessage(messageId, type, messageKey, finalizingToast, captured)
            .catch(error => {
                console.error(`[${EXTENSION_NAME}] post-narration finalization failed.`, error);
            })
            .finally(() => {
                state.postNarrationFinalizers.delete(messageKey);
            });
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
        .finally(() => {
            state.postNarrationFinalizers.delete(messageKey);
        });
}

async function finalizePostNarrationMessage(messageId, type, messageKey, finalizingToast = null, captured = {}) {
    let finalNarrationRendered = false;

    try {
        if (!isStoryEngineEnabled()) {
            clearRuntimePrompts();
            releaseProseGuardDisplayIntercept({ restore: true, messageId });
            return;
        }
        const context = getContext();
        if (!isPostNarrationFinalizerCurrent(context, messageId, messageKey, captured)) {
            clearRuntimePrompts();
            return;
        }

        const message = context?.chat?.[messageId];
        if (!message || message.is_user || type === 'impersonate') {
            clearRuntimePrompts();
            return;
        }

        message.extra = message.extra || {};

        const currentText = String(message.mes ?? '');
        const displayText = message.extra.display_text == null ? null : String(message.extra.display_text);
        const rawAssistantText = displayText ?? currentText;
        const visibleText = stripComputedDebugPrefix(rawAssistantText);
        let narrationText = sanitizeAssistantNarration(visibleText);
        const narratorHandoff = captured?.narratorHandoff ?? state.lastNarratorHandoff;
        const pendingRun = captured?.pendingRun ?? state.pendingRun;
        let trackerDeltaWarning = null;

        if (getSettings().postNarrationProseGuardEnabled !== false && narrationText) {
            try {
                await deferForProseGuardFinalization();
                const proseGuardRaw = await requestProseGuardCorrectionWithTimeout(narrationText, pendingRun?.latestUserText || '');
                narrationText = sanitizeProseGuardResponse(proseGuardRaw, narrationText);
            } catch (error) {
                console.warn(`[${EXTENSION_NAME}] Prose Guard failed; keeping sanitized narrator text.`, error);
            }
        }

        if (!isPostNarrationFinalizerCurrent(context, messageId, messageKey, captured)) {
            clearRuntimePrompts();
            return;
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
                        beforeNpcs: pendingRun.trackerBefore,
                        userKnowledgeBefore: pendingRun.userKnowledgeBefore,
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
                beforePowerActors: clone(pendingRun.powerActorsBefore),
                beforeUserKnowledge: clone(pendingRun.userKnowledgeBefore || {}),
                after: clone(trackerDisplaySnapshot.npcs),
                afterUser: clone(trackerDisplaySnapshot.user),
                afterPowerActors: clone(trackerDisplaySnapshot.powerActors || {}),
                afterUserKnowledge: clone(trackerDisplaySnapshot.userKnowledge || {}),
                display: clone(trackerDisplaySnapshot),
                type: pendingRun.type,
                trackerDeltaWarning,
                savedAt: Date.now(),
            };
            setMessageTrackerDisplaySnapshot(message, trackerDisplaySnapshot);
            if (state.pendingRun === pendingRun) state.pendingRun = null;
        }

        if (!isPostNarrationFinalizerCurrent(context, messageId, messageKey, captured)) {
            clearRuntimePrompts();
            return;
        }

        maybeRecordProgressionAccomplishment({ pendingRun, messageKey, context });

        message.mes = narrationText;
        message.extra.display_text = narrationText;
        setMessageNarratorHandoff(message, narratorHandoff);
        state.lastNarratorHandoffKey = messageKey;
        state.lastNarratorHandoff = '';

        disconnectProseGuardStreamObserver();
        hideProseGuardMessageById(messageId);
        if (typeof context.updateMessageBlock === 'function') {
            context.updateMessageBlock(messageId, message);
        } else {
            const textElement = getMessageTextElement(messageId);
            if (textElement) textElement.textContent = narrationText;
        }
        releaseProseGuardDisplayIntercept({ messageId });
        finalNarrationRendered = true;
        renderNarratorHandoffBlockForMessage(messageId, null, context);
        renderTrackerDisplayBlockForMessage(messageId, null, context);
        renderTrackerWidget(context);
        renderProgressionCard(context);

        if (typeof context.saveChat === 'function') {
            await context.saveChat();
        } else {
            await persistMetadata(context);
        }

        clearRuntimePrompts();
        state.chatSignature = captureChatSignature(context);
    } finally {
        releaseProseGuardDisplayIntercept({ restore: !finalNarrationRendered, messageId });
        clearProgress(finalizingToast);
        setChatInputLocked(false);
    }
}

async function handleMessageDeleted(newLength) {
    if (!isStoryEngineEnabled()) {
        disableStoryEngineRuntime();
        state.chatSignature = captureChatSignature();
        return;
    }
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
                restoreCandidate = { messageId, before: snapshot.before, beforeUser: snapshot.beforeUser, beforePowerActors: snapshot.beforePowerActors, beforeUserKnowledge: snapshot.beforeUserKnowledge };
            }
            delete root.snapshots[key];
            removeProgressionRecordsForMessage(key, context);
        }
    }

    state.lastNarratorHandoff = '';
    state.lastNarratorHandoffKey = null;
    state.chatSignature = currentSignature;
    clearRuntimePrompts();

    if (restoreCandidate) {
        root.npcs = normalizeDisplayTrackerNpcs(restoreCandidate.before);
        root.user = normalizeTrackerUserState(restoreCandidate.beforeUser || root.user || {});
        root.powerActors = restoreCandidate.beforePowerActors || {};
        root.userKnowledge = mergeUserKnowledgeLedger(restoreCandidate.beforeUserKnowledge || {}, {});
        await persistMetadata(context);
        console.info(`[${EXTENSION_NAME}] restored tracker snapshot after message deletion from index ${Math.min(chatLength, firstAffectedIndex)}`);
    } else if (restoreTrackerFromLatestDisplaySnapshot(context)) {
        await persistMetadata(context);
        console.info(`[${EXTENSION_NAME}] restored tracker display snapshot after message deletion.`);
    }
    setTimeout(() => renderAllTrackerDisplayBlocks(context), 0);
    setTimeout(() => renderProgressionCard(context), 0);
}

async function handleMessageSwiped(messageId) {
    if (!isStoryEngineEnabled()) {
        disableStoryEngineRuntime();
        state.chatSignature = captureChatSignature();
        return;
    }
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
    setTimeout(() => renderProgressionCard(context), 0);
}

function handleChatChanged() {
    clearPendingRunCleanupTimer();
    clearPostNarrationFinalizerTimers();
    clearAllProgress();
    setChatInputLocked(false);
    releaseProseGuardDisplayIntercept();
    if (!isStoryEngineEnabled()) {
        disableStoryEngineRuntime();
        state.chatSignature = captureChatSignature();
        return;
    }
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
        renderProgressionCard(context);
    }, 0);
}

function handleGenerationLifecycleEnd() {
    if (!isStoryEngineEnabled()) {
        disableStoryEngineRuntime();
        return;
    }
    if (state.trackerUpdating) return;
    clearAllProgress();
    state.pendingGeneration = null;
    state.narratorThinkingDisablePending = false;
    clearRuntimePrompts();

    if (!state.pendingRun) {
        releaseProseGuardDisplayIntercept({ restore: true });
    } else if (!state.pendingRunCleanupTimer) {
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
            releaseProseGuardDisplayIntercept({ restore: true });
            setChatInputLocked(false);
            console.warn(`[${EXTENSION_NAME}] cleared pending pre-flight handoff because no assistant message was received after generation ended.`);
        }, 5000);
    }
    setTimeout(() => {
        renderAllTrackerDisplayBlocks();
        renderProgressionCard();
    }, 0);
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
    if (context.eventTypes.GENERATION_STARTED) context.eventSource.on(context.eventTypes.GENERATION_STARTED, ensureProseGuardDisplayInterceptor);
    if (context.eventTypes.GENERATION_ENDED) context.eventSource.on(context.eventTypes.GENERATION_ENDED, handleGenerationLifecycleEnd);
    if (context.eventTypes.GENERATION_STOPPED) context.eventSource.on(context.eventTypes.GENERATION_STOPPED, handleGenerationLifecycleEnd);
    if (context.eventTypes.CHAT_COMPLETION_SETTINGS_READY) context.eventSource.on(context.eventTypes.CHAT_COMPLETION_SETTINGS_READY, handleChatCompletionSettingsReady);
    if (context.eventTypes.TEXT_COMPLETION_SETTINGS_READY) context.eventSource.on(context.eventTypes.TEXT_COMPLETION_SETTINGS_READY, handleTextCompletionSettingsReady);
    if (context.eventTypes.CHAT_COMPLETION_PROMPT_READY) context.eventSource.on(context.eventTypes.CHAT_COMPLETION_PROMPT_READY, handleChatCompletionPromptReady);
    state.subscribed = true;
}

globalThis.StructuredPreflightEngines_generationInterceptor = async function (coreChat, contextSize, abort, type) {
    subscribeMessageHandler();

    if (!isStoryEngineEnabled()) {
        disableStoryEngineRuntime();
        return false;
    }

    if (state.trackerUpdating) {
        try {
            globalThis.toastr?.info?.('Story Engine is finalizing narration. Please wait a moment before sending another message.', EXTENSION_NAME, { timeOut: 4000 });
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
        releaseProseGuardDisplayIntercept();
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

    if (progressionPending(context)) {
        await persistMetadata(context);
        renderProgressionCard(context);
        clearRuntimePrompts();
        clearAllProgress();
        try {
            globalThis.toastr?.info?.('Complete Character Progression before roleplay generation can continue.', EXTENSION_NAME, { timeOut: 7000 });
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
        powerActorSnapshot: buildPowerActorSnapshot(context),
        userKnowledgeSnapshot: buildUserKnowledgeSnapshot(context),
        contextSize,
        createdAt: Date.now(),
    };
    state.activeRunId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    releaseProseGuardDisplayIntercept({ restore: true });
    showProgress('Computing structured pre-flight...');

    return false;
};

async function handleChatCompletionPromptReady(eventData) {
    if (!isStoryEngineEnabled()) {
        clearRuntimePrompts();
        clearPromptOptionPrompts();
        state.pendingGeneration = null;
        return;
    }
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
            markNextNarratorRequestThinkingDisabled();
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
        const report = runDeterministicEngines(semanticLedger, trackerSnapshot, context, state.pendingGeneration.type, {
            playerTrackerSnapshot: state.pendingGeneration.playerTrackerSnapshot || buildPlayerTrackerSnapshot(context),
        });

        const narratorContext = formatNarratorPromptContext(report, state.pendingGeneration);
        const narratorModelContext = formatNarratorModelPromptContext(report, state.pendingGeneration);
        state.pendingRun = {
            type: state.pendingGeneration.type || 'normal',
            mode: generationMode,
            trackerBefore: trackerSnapshot,
            trackerAfter: report.trackerUpdate?.npcs || {},
            userBefore: state.pendingGeneration.playerTrackerSnapshot || buildPlayerTrackerSnapshot(context),
            userAfter: report.trackerUpdate?.user || {},
            powerActorsBefore: state.pendingGeneration.powerActorSnapshot || buildPowerActorSnapshot(context),
            powerActorsAfter: report.trackerUpdate?.powerActors || {},
            userKnowledgeBefore: state.pendingGeneration.userKnowledgeSnapshot || buildUserKnowledgeSnapshot(context),
            userKnowledgeAfter: report.trackerUpdate?.userKnowledge || {},
            resolutionPacket: report.finalNarrativeHandoff?.resolutionPacket || {},
            userCoreStats: report.semanticLedger?.engineContext?.userCoreStats || null,
            contextualInjuryCaps: collectContextualInjuryCaps(report),
            latestUserText: state.pendingGeneration.latestUserText || getLatestUserText(eventData.chat),
            report,
        };
        state.lastNarratorHandoff = narratorContext;

        beginProseGuardDisplayIntercept(state.pendingGeneration.type || 'normal');
        sanitizeFinalPromptHistory(eventData.chat);
        appendNarratorContextToPrompt(eventData.chat, narratorModelContext);
        markNextNarratorRequestThinkingDisabled();
        clearAllProgress();
    } catch (error) {
        state.lastNarratorHandoff = '';
        state.pendingRun = null;
        state.narratorThinkingDisablePending = false;
        releaseProseGuardDisplayIntercept({ restore: true });
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
        return await withStoryEngineModelRequest(() => withSemanticGenerationSettings(settings => extractSemanticLedger(context, assembledChat, type, trackerSnapshot, {
            assembledPrompt: true,
            playerTrackerSnapshot: state.pendingGeneration?.playerTrackerSnapshot || buildPlayerTrackerSnapshot(context),
            powerActorSnapshot: state.pendingGeneration?.powerActorSnapshot || buildPowerActorSnapshot(context),
            userKnowledgeSnapshot: state.pendingGeneration?.userKnowledgeSnapshot || buildUserKnowledgeSnapshot(context),
            semanticProfileId: settings?.semanticProfileId,
            semanticProfileName: settings?.semanticProfileName,
            nameStyle: getSettings().nameStyle,
            userInputMode: state.pendingGeneration?.mode || 'normal',
            proxyUserAction: state.pendingGeneration?.mode === 'proxy' ? state.pendingGeneration?.latestUserText : '',
        })));
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
    clearPostNarrationFinalizerTimers();
    clearAllProgress();
    clearThinkingDisableRuntimeState();
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
        if (context.eventTypes.GENERATION_STARTED) removeEventHandler(context, context.eventTypes.GENERATION_STARTED, ensureProseGuardDisplayInterceptor);
        if (context.eventTypes.GENERATION_ENDED) removeEventHandler(context, context.eventTypes.GENERATION_ENDED, handleGenerationLifecycleEnd);
        if (context.eventTypes.GENERATION_STOPPED) removeEventHandler(context, context.eventTypes.GENERATION_STOPPED, handleGenerationLifecycleEnd);
        if (context.eventTypes.CHAT_COMPLETION_SETTINGS_READY) removeEventHandler(context, context.eventTypes.CHAT_COMPLETION_SETTINGS_READY, handleChatCompletionSettingsReady);
        if (context.eventTypes.TEXT_COMPLETION_SETTINGS_READY) removeEventHandler(context, context.eventTypes.TEXT_COMPLETION_SETTINGS_READY, handleTextCompletionSettingsReady);
        if (context.eventTypes.CHAT_COMPLETION_PROMPT_READY) removeEventHandler(context, context.eventTypes.CHAT_COMPLETION_PROMPT_READY, handleChatCompletionPromptReady);
        state.subscribed = false;
    }
    releaseProseGuardDisplayIntercept({ restore: true });
    if (state.proseGuardChatObserver) {
        state.proseGuardChatObserver.disconnect();
        state.proseGuardChatObserver = null;
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
            migrateVisibleHandoffDisplays();
            renderAllTrackerDisplayBlocks();
            renderPlayerSetupCard();
            renderProgressionCard();
        }, 0);
    });
} else {
    renderSettingsPanel();
    if (isStoryEngineEnabled()) {
        ensureStreamingArtifactRegex();
        ensureProseGuardDisplayInterceptor();
        injectPromptOptionPrompts();
    } else {
        disableStoryEngineRuntime();
    }
    setTimeout(() => {
        if (!isStoryEngineEnabled()) {
            disableStoryEngineRuntime();
            return;
        }
        getPlayerRoot();
        restoreTrackerFromLatestDisplaySnapshot();
        migrateVisibleHandoffDisplays();
        renderAllTrackerDisplayBlocks();
        renderPlayerSetupCard();
        renderProgressionCard();
    }, 0);
}
clearRuntimePrompts();
console.info(`[${EXTENSION_NAME}] loaded`);

