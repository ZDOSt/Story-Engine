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
    'deredere internal pattern: openly warm, affectionate, cheerful, direct with care or admiration.',
    'tsundere internal pattern: guarded or sharp outwardly, softens through action, hides concern behind criticism.',
    'yandere internal pattern: possessive, obsessive, intensely attached, affection can become controlling or dangerous.',
    'kuudere internal pattern: cool, composed, restrained, emotionally contained, shows care through calm action.',
    'dandere internal pattern: quiet, shy, withdrawn, opens slowly when trust or safety grows.',
    'himedere internal pattern: expects special treatment, proud, imperious, entitled.',
    'oujidere internal pattern: princely, commanding, polished, expects deference through confidence or rank.',
    'kamidere internal pattern: superiority complex, godlike self-regard, controlling or judgmental certainty.',
    'mayadere internal pattern: starts antagonistic or dangerous, may soften into loyalty or affection.',
    'sadodere internal pattern: teasing, cruel, dominant, enjoys provoking discomfort or submission.',
    'hiyakasudere internal pattern: flirtatious tease, playful provocation, enjoys making others react.',
    'hajidere internal pattern: easily embarrassed by affection, bashful, visibly struggles with romantic attention.',
    'bakadere internal pattern: foolish, impulsive, naive, sincere or comic lack of judgment.',
    'erodere internal pattern: openly sensual or provocative while retaining emotional selectiveness or restraint.',
    'dorodere internal pattern: sweet or harmless surface masking darker instability, bitterness, or hidden malice.',
    'shundere internal pattern: gloomy, sad, self-effacing, melancholy baseline.',
    'undere internal pattern: agreeable, eager to please, readily follows another person lead.',
    'goudere internal pattern: overzealous devotion, extreme helpfulness, acts too aggressively for someone good.',
    'kanedere internal pattern: money/status motivated, transactional, values wealth or advantage.',
    'byoukidere internal pattern: frail, sickly, vulnerable, shaped by illness or physical fragility.',
    'general/custom: no internal pattern clearly fits; use grounded stable traits instead.',
].join('\n');

export const GENERAL_PERSONALITY_PROFILES = Object.freeze([
    'temperament: guarded, suspicious, practical; speech: short direct questions with few pleasantries; interaction: tests claims and controls access before trusting; mannerism: keeps exchanges brief when uncertain; intensity:medium',
    'temperament: formal, procedural, dutiful; speech: precise rule-bound phrasing; interaction: follows rank, process, and documented authority; mannerism: asks for names or credentials when pressure rises; intensity:medium',
    'temperament: warm, direct, hospitable; speech: open invitations and plain reassurance; interaction: offers practical help while expecting honest answers; mannerism: names concrete comforts when trying to settle a scene; intensity:medium',
    'temperament: dry, observant, sardonic; speech: clipped understatement and quiet irony; interaction: watches before committing and points out practical flaws; mannerism: answers tension with edged humor; intensity:medium',
    'temperament: nervous, appeasing, conflict-avoidant; speech: cautious qualifiers and quick concessions; interaction: seeks safety, permission, and reassurance before committing; mannerism: offers alternatives when cornered; intensity:medium',
    'temperament: proud, imperious, status-conscious; speech: polished commands and cool corrections; interaction: expects deference and protects reputation; mannerism: frames favors as privilege; intensity:medium',
    'temperament: playful, teasing, socially bold; speech: light provocation and quick banter; interaction: tests reactions through humor without committing too soon; mannerism: turns tension into a game when safe; intensity:medium',
    'temperament: cold, practical, unsentimental; speech: concise assessments and hard tradeoffs; interaction: values efficiency, leverage, and results; mannerism: moves conversations toward decisions; intensity:medium',
    'temperament: patient, scholarly, analytical; speech: careful distinctions and measured explanations; interaction: asks clarifying questions before acting; mannerism: corrects imprecision gently; intensity:medium',
    'temperament: mercantile, opportunistic, personable; speech: friendly negotiation and price-aware framing; interaction: looks for advantage while preserving goodwill; mannerism: names terms before agreeing; intensity:medium',
    'temperament: devout, solemn, duty-led; speech: moral framing and restrained conviction; interaction: weighs actions against vows, signs, or obligations; mannerism: pauses before judgment; intensity:medium',
    'temperament: blunt, physical, action-first; speech: plain statements and impatient challenges; interaction: trusts visible competence over explanation; mannerism: points back to the practical task when talk drifts; intensity:medium',
    'temperament: cautious, observant, quietly protective; speech: low-risk suggestions and practical warnings; interaction: shields others without dramatics; mannerism: notices hazards before personal comfort; intensity:medium',
    'temperament: curious, bright, easily engaged; speech: quick questions and eager connections; interaction: follows novelty and shares discoveries; mannerism: points out details when interest catches; intensity:medium',
    'temperament: bitter, weary, distrustful; speech: hard-earned warnings and skeptical replies; interaction: expects disappointment but respects proof; mannerism: names past costs when trust is requested; intensity:medium',
    'temperament: gentle, reserved, considerate; speech: careful wording and indirect concern; interaction: avoids pressure and helps through small acts; mannerism: offers quiet options instead of demands; intensity:medium',
    'temperament: ambitious, polished, calculating; speech: controlled compliments and strategic questions; interaction: measures usefulness, status, and future leverage; mannerism: redirects conversations toward advantage; intensity:medium',
    'temperament: reckless, bold, thrill-seeking; speech: confident dares and fast commitments; interaction: pushes momentum and underestimates risk; mannerism: volunteers first when danger appears; intensity:medium',
    'temperament: secretive, evasive, careful; speech: partial answers and controlled omissions; interaction: protects information and redirects scrutiny; mannerism: answers sensitive questions with narrower facts; intensity:medium',
    'temperament: nurturing, practical, firm; speech: plain care mixed with boundaries; interaction: helps concretely but refuses foolishness; mannerism: checks needs before allowing risk; intensity:medium',
]);

export function deterministicPersonalitySummaryForName(name, salt = '') {
    const key = `${String(name || '').trim().toLowerCase()}|${String(salt || '').trim().toLowerCase()}`;
    let hash = 2166136261;
    for (let index = 0; index < key.length; index += 1) {
        hash ^= key.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    const profile = GENERAL_PERSONALITY_PROFILES[Math.abs(hash >>> 0) % GENERAL_PERSONALITY_PROFILES.length];
    return profile || GENERAL_PERSONALITY_PROFILES[0];
}

export const TRACKER_DELTA_CONTRACT = [
    'STRICT POST-NARRATION TRACKER DELTA CONTRACT:',
    '- Output one tracker delta block based only on explicit state changes in FINAL_NARRATION and authoritative MECHANICAL_TRACKER_AUTHORITY.',
    '- The tracker block is tracker-only. Do not narrate, repair prose, resolve extra mechanics, relationship, rolls, names, proactivity, or outcomes inside it.',
    '- MECHANICAL_TRACKER_AUTHORITY is binding for target, condition ceilings, fatal outcomes, and contextual injury caps. Use FINAL_NARRATION to choose concrete wording/body part/detail when authority delegates detail to narration.',
    '- Use semantic reading, not keyword matching. Identify who is affected, what changed, and whether the change persists beyond the instant of narration.',
    '- Do not infer hidden consequences. Do not add momentary pain, effort, hesitation, fear, impact, or flavor as wounds/status.',
    '- NPC personalitySummary is stable personality memory only: a concise compact seed for enduring temperament, values, speech style, interaction style, one optional flexible mannerism, or internal behavior pattern revealed by FINAL_NARRATION, SEMANTIC_PERSONALITY_EVIDENCE, or explicit first-contact personality seed.',
    '- Write personalitySummary as natural language only. Do not output raw internal labels such as deredere, tsundere, yandere, kuudere, dandere, himedere, oujidere, kamidere, mayadere, sadodere, hiyakasudere, hajidere, bakadere, erodere, dorodere, shundere, undere, goudere, kanedere, or byoukidere.',
    '- Preferred format: "temperament: ...; speech: ...; interaction: ...; mannerism: ...; intensity:low|medium|high". Speech and interaction should carry most uniqueness. Mannerism is one optional flexible, scene-valid habit, not a fixed gesture, prop, location, or mandatory repeated beat.',
    '- When an active tracked NPC has no personalitySummary and durable first-contact evidence supports one, write a compact natural-language seed using the best matching internal pattern plus concrete traits, speech style, interaction style, one flexible mannerism if useful, and intensity.',
    '- Choose an internal pattern only when evidence clearly matches the glossary. If unclear, mixed, or not a stylized pattern, use grounded general traits instead. Never guess a flashy profile from mood, attraction, relationship score, fear/hostility score, injury, gear, or a one-turn reaction.',
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
    '- USER INVENTORY/POSSESSION DELTA: update TrackerUpdateEngine.User.inventoryAdd and inventoryRemove from the semantic possession state established by FINAL_NARRATION, not from a fixed verb list.',
    '- Add inventoryAdd when FINAL_NARRATION explicitly establishes that an item has entered {{user}} possession, control, carried belongings, hands, pocket, pouch, bag, pack, belt, clothing, stowed equipment, or otherwise remains on their person. Verbs such as pick up, take, receive, pocket, tuck away, keep, accept, sling, holster, stow, equip, or carry are examples only; the real test is whether the final narration confirms {{user}} actually has the item after the narrated beat.',
    '- Remove inventoryRemove when FINAL_NARRATION explicitly establishes that an item leaves {{user}} possession/control or is no longer usable/available to them, including being dropped, left behind, handed away, given away, spent, consumed, lost, destroyed, discarded, seized, or broken beyond use.',
    '- Do not add inventory merely because an item is visible, nearby, mentioned, reachable, desired, attempted, requested, or offered. Add it only when FINAL_NARRATION confirms possession/control. Do not remove inventory merely because an item is drawn, held, inspected, used, shown, referenced, or briefly handled unless FINAL_NARRATION confirms it no longer remains with {{user}}.',
    '- Preserve the exact item phrase from FINAL_NARRATION when possible, and output only the changed item names. Do not duplicate existing inventory. Use User.gearAdd/gearRemove for visible worn/equipped gear changes when that is the more accurate tracker field.',
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
