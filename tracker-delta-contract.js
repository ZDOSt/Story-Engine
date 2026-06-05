export const TRACKER_DELTA_START = 'BEGIN_TRACKER_DELTA';
export const TRACKER_DELTA_END = 'END_TRACKER_DELTA';
export const TRACKER_DELTA_WRAPPER_START = '<!-- STORY_ENGINE_TRACKER_DELTA';
export const TRACKER_DELTA_WRAPPER_END = 'STORY_ENGINE_TRACKER_DELTA_END -->';
export const TRACKER_DELTA_FENCE = '```story_engine_tracker_delta';
export const TRACKER_DELTA_FENCE_END = '```';

export const USER_KNOWLEDGE_SCOPES = Object.freeze(['private', 'local', 'route', 'faction', 'regional', 'legendary']);
export const USER_REPUTATION_VALENCES = Object.freeze(['good', 'bad', 'fear']);
export const USER_KNOWLEDGE_TRUTH = Object.freeze(['true', 'distorted', 'false', 'claimed']);
export const USER_KNOWLEDGE_CONFIDENCE = Object.freeze(['certain', 'likely', 'uncertain']);

export const PERSONALITY_ARCHETYPE_GLOSSARY = [
    'deredere: openly warm, affectionate, cheerful, direct with care or admiration.',
    'tsundere: guarded or sharp outwardly, softens through action, hides concern behind criticism.',
    'yandere: possessive, obsessive, intensely attached, affection can become controlling or dangerous.',
    'kuudere: cool, composed, restrained, emotionally contained, shows care through calm action.',
    'dandere: quiet, shy, withdrawn, opens slowly when trust or safety grows.',
    'himedere: expects special treatment, proud, imperious, princess-like entitlement.',
    'oujidere: princely, commanding, polished, expects deference through confidence or rank.',
    'kamidere: superiority complex, godlike self-regard, controlling or judgmental certainty.',
    'mayadere: starts antagonistic or dangerous, may soften into loyalty or affection.',
    'sadodere: teasing, cruel, dominant, enjoys provoking discomfort or submission.',
    'hiyakasudere: flirtatious tease, playful provocation, enjoys making others react.',
    'hajidere: easily embarrassed by affection, bashful, visibly struggles with romantic attention.',
    'bakadere: foolish, impulsive, naive, sincere or comic lack of judgment.',
    'erodere: openly sensual or provocative while retaining emotional selectiveness or restraint.',
    'dorodere: sweet or harmless surface masking darker instability, bitterness, or hidden malice.',
    'shundere: gloomy, sad, self-effacing, melancholy baseline.',
    'undere: agreeable, eager to please, readily follows another person lead.',
    'goudere: overzealous devotion, extreme helpfulness, acts too aggressively for someone good.',
    'kanedere: money/status motivated, transactional, values wealth or advantage.',
    'byoukidere: frail, sickly, vulnerable, shaped by illness or physical fragility.',
    'none/custom: no listed archetype clearly fits; use concrete stable traits instead.',
].join('\n');

export const TRACKER_DELTA_CONTRACT = [
    'STRICT POST-NARRATION TRACKER DELTA CONTRACT:',
    '- Output one tracker delta block based only on explicit state changes in FINAL_NARRATION and authoritative MECHANICAL_TRACKER_AUTHORITY.',
    '- The tracker block is tracker-only. Do not narrate, repair prose, resolve extra mechanics, relationship, rolls, names, proactivity, or outcomes inside it.',
    '- MECHANICAL_TRACKER_AUTHORITY is binding for target, condition ceilings, fatal outcomes, and contextual injury caps. Use FINAL_NARRATION to choose concrete wording/body part/detail when authority delegates detail to narration.',
    '- Use semantic reading, not keyword matching. Identify who is affected, what changed, and whether the change persists beyond the instant of narration.',
    '- Do not infer hidden consequences. Do not add momentary pain, effort, hesitation, fear, impact, or flavor as wounds/status.',
    '- NPC personalitySummary is stable personality memory only: a concise compact seed for enduring temperament, values, manner, archetype, or interaction style revealed by FINAL_NARRATION, SEMANTIC_PERSONALITY_EVIDENCE, or explicit first-contact personality seed.',
    '- When an active tracked NPC has no personalitySummary and durable first-contact evidence supports one, write a compact seed using the best matching glossary archetype plus concrete traits and intensity, e.g. "tsundere; proud, guarded, sharp-tongued; hides concern through criticism; intensity:medium".',
    '- Choose an archetype only when evidence clearly matches the glossary. If unclear, mixed, or not a dere-style pattern, use none/custom plus concrete stable traits. Never guess a flashy archetype from mood, attraction, relationship score, fear/hostility score, injury, gear, or a one-turn reaction.',
    '- Personality evidence may come from FINAL_NARRATION, SEMANTIC_PERSONALITY_EVIDENCE, previous tracker history, or explicit card/lore/scenario/context evidence summarized in the prompt. If those sources give no durable temperament, output unchanged.',
    'PERSONALITY_ARCHETYPE_GLOSSARY:',
    PERSONALITY_ARCHETYPE_GLOSSARY,
    '- If personalitySummary already exists, use unchanged unless FINAL_NARRATION or explicit first-contact seed gives durable, non-temporary refinement. Do not rewrite it from current mood, attraction, relationship state, fear/hostility level, wounds, status, gear, temporary reactions, or this-turn events.',
    '- NPC revealedName is identity tracking only. If the final narration explicitly reveals that an already tracked generic NPC/person/role is actually named something, set NPC to the existing tracker label and revealedName to the revealed proper name. Example: tracked NPC "bystander" says "Torvinash." as an introduction -> NPC=bystander and revealedName=Torvinash.',
    '- Use revealedName only when the narration semantically identifies which tracked generic NPC received the name. If there are multiple possible generic NPCs and identity is unclear, use (none).',
    '- Add wounds/status only when the prose establishes an actual ongoing injury, ailment, restraint, impairment, or continuing condition. This includes any body part, organ, sense, mental function, magic/poison/disease effect, or status that would continue to affect later action.',
    '- A hit, blow, impact, fall, shove, knockdown, stagger, flinch, gasp, pain spike, breath loss, being winded, or "the wind is knocked out" is not a tracked wound/status by itself.',
    '- Track rib/chest/torso effects only if the narration explicitly establishes a lasting injury or continuing status such as bruised ribs, cracked rib, broken rib, bleeding, ongoing breathing trouble, or unconsciousness.',
    '- Impact/result strength is a severity ceiling, not tracker evidence. A strong hit may allow a worse injury only if the final prose actually states that continuing injury.',
    '- If deterministic contextual injury caps are provided below, they mark mechanically resolved persistent injuries from NPC/companion attacks. Use FINAL_NARRATION to extract the concrete wound/status that was actually described for that capped target, but never exceed the listed severity/condition limit.',
    '- If a deterministic fatal outcome is provided below, the listed target is dead. The tracker delta must set that NPC condition to dead when the final narration renders the death.',
    '- For severity, map the prose semantically: minor surface harm/status -> bruised; clear injury, bleeding, poisoning, sickness, sprain, concussion, exhaustion, or moderate status -> wounded; fracture, broken/dislocated limb, deep wound, heavy bleeding, severe impairment, paralysis, unconsciousness, or life-threatening status -> badly_wounded or critical as appropriate; death only when explicit.',
    '- For NPCs, anchor injury/recovery to the named or tracked NPC the narration says was affected. If the resolved user action visibly injured its target, track that target. If an NPC action visibly injured another NPC, track that named/tracked NPC. Do not move an injury to the user unless the narration says the user/persona was affected.',
    '- Treat injuries/status/gear/inventory/tasks affecting the user/player/persona/active protagonist as TrackerUpdateEngine.User, even when the narration uses the persona name, "they", or body-part possessives instead of the literal word user.',
    '- Use the latest user input only to identify who the acting user/player/persona is and which described body/item/task belongs to them. Do not extract changes from the latest user input unless the same change also appears in the final assistant narration.',
    '- Remove wounds/status only when the prose explicitly says the injury/status is healed, cured, recovered, restored, regenerated, magically healed, knitted closed, gone, or no longer impairing. Bandaging, splinting, dressing, cleaning, stitching, stabilizing, normal care, or starting treatment does NOT remove injuries unless the prose also says the injury/status is gone, healed, cured, fully recovered, or no longer impairing.',
    '- Never rewrite full tracker lists. Return deltas only.',
    '- Use condition=unchanged unless the narration explicitly changes overall condition.',
    '- NPC entries are only for named or currently tracked NPCs with explicit condition, wound, status, visible gear, or stable personalitySummary changes. NPC inventory is not tracked.',
    '- If TrackerUpdateEngine.NPC.count > 0, every NPC[index] entry must include NPC, revealedName, personalitySummary, condition, woundsAdd, woundsRemove, statusAdd, statusRemove, gearAdd, and gearRemove.',
    '- If uncertain, output (none).',
    '- Inside the fenced tracker block, output exactly the compact tracker lines. No prose. No JSON. No extra labels.',
    '',
    'USER_KNOWLEDGE_LEDGER:',
    '- Also output UserKnowledgeLedger lines. This hidden ledger tracks only persistent facts about {{user}}.',
    '- Use personalKnowledge for a specific NPC/group that directly saw, heard, experienced, was told, or can personally remember a concrete fact about {{user}}.',
    '- Use reputationKnowledge for spreadable reputation or achievement facts about {{user}}. Reputation may start private when the achievement happened but is not yet known; it becomes public only when witnessed, reported, proven, discovered, or visibly consequential.',
    '- Reputation valence is only good, bad, or fear. Do not create ridicule or mixed reputation. If different audiences would react differently, create separate scoped entries.',
    '- Create entries only for resolved, persistent, socially meaningful facts. Do not store ordinary conversation, temporary mood, trivial actions, private facts with no future relevance, or comedy/flavor unless it materially affects future NPC behavior.',
    '- Knowledge must be access-limited. NPCs/groups know only what they plausibly had access to; public reputation spreads only through scope, witnesses, institutions, reports, proof, visible aftermath, or ordinary rumor channels.',
    '- Good reputation: rescue, mercy, honored promises, respected achievements, protecting people, defeating public threats, or helping a respected group.',
    '- Bad reputation: crimes, betrayal, exposed lies, coercion, harm to innocents, theft, cruelty, dishonor, or helping an audience enemy.',
    '- Fear reputation: dangerous power, killing feared threats, brutal public dominance, surviving impossible danger, or deeds that make strangers cautious rather than admiring.',
    '- If no relevant knowledge or reputation is created, output both counts as 0.',
].join('\n');

export const TRACKER_DELTA_TEMPLATE = `${TRACKER_DELTA_FENCE}
${TRACKER_DELTA_START}
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
UserKnowledgeLedger.personal.count=0
UserKnowledgeLedger.personal[0].knownBy=(none)
UserKnowledgeLedger.personal[0].scope=private
UserKnowledgeLedger.personal[0].topic=(none)
UserKnowledgeLedger.personal[0].truth=true
UserKnowledgeLedger.personal[0].confidence=certain
UserKnowledgeLedger.personal[0].line=(none)
UserKnowledgeLedger.personal[0].reason=(none)
UserKnowledgeLedger.reputation.count=0
UserKnowledgeLedger.reputation[0].scope=private
UserKnowledgeLedger.reputation[0].valence=good
UserKnowledgeLedger.reputation[0].topic=(none)
UserKnowledgeLedger.reputation[0].truth=true
UserKnowledgeLedger.reputation[0].confidence=certain
UserKnowledgeLedger.reputation[0].line=(none)
UserKnowledgeLedger.reputation[0].origin=(none)
UserKnowledgeLedger.reputation[0].reason=(none)
${TRACKER_DELTA_END}
${TRACKER_DELTA_FENCE_END}`;
