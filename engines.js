import { normalizeCurrencyList } from './economy.js';

export const ENGINE_PROMPT_TEXT = String.raw`[STRUCTURED_PREFLIGHT_ENGINE_EXTENSION v0.1 - SOURCE: EXTENSION ONLY]

function ResolutionEngine(input) {
  const DEF = Object.freeze({
    UNIVERSAL:
'EXPLICIT-ONLY. Use only Character Card, Lore, Scene text, tracker, and latest {{user}} input. NO invention. Uncertain = N/default. The semantic pass classifies only; deterministic code rolls dice, assigns stats, calculates margins, landed actions, damage, relationship changes, and outcomes. Never invent targets, actions, obstacles, stakes, or outcomes. MAX 3 ACTIONS.',
    PLAYER_TEXT:
'First-person introspection, internal monologue, memories, metaphors, self-questions, subjective sensations, emotional narration, and thought-only prose are context only. They do not create actions, targets, rolls, wounds/status/condition, inventory/gear changes, location changes, or scene facts unless the same input also declares a concrete present external action, spoken dialogue, object/ability use, movement, attack, or interaction.',
    STAKES:
'A roll exists only when the latest explicit external action creates fresh unresolved success/failure stakes: physical risk, harm, danger, material gain/loss outside ordinary boundaryPressure handling, meaningful access outside ordinary boundaryPressure handling, secrets, pursuit/escape, significant trust/status/authority shift, meaningful obstacle resolution/failure, stealth against a specific established living detector, or explicit goal advancement/failure for {{user}} or a specific living entity. Do NOT force rollNeeded=Y solely because {{user}} restrains, grabs, pins, blocks, snatches, takes, holds, or pressures an NPC boundary. Classify those through restraintControl, boundaryPressure, and boundaryBreak; deterministic code decides whether they roll.',
    NO_STAKES:
'No roll for ordinary continuity, flavor, harmless conversation, minor mood, casual rudeness, weak preference, trivial convenience, introspection-only text, already-decided saved disposition/intimacy reactions, safe-scene aid/treatment, unavailable item attempts, or repeated failed/resolved negative social pressure using the same socialTactic against the same target/goal under unchanged disposition. If fresh unresolved STAKES and NO_STAKES both appear to apply, STAKES wins unless that exact stake is already resolved/suppressed. Bluff and Intimidate are remembered separately.',
    CHALLENGE_TYPES:
'none = no roll. social = fresh unresolved living NPC-facing persuasion, bargaining, deception, intimidation, coercion, negotiation, request, command, seduction, reassurance, or social pressure. mundane_combat = direct bodily, weapon, natural-weapon, tool, projectile, thrown object, or ordinary physical attack that can injure a living target; restraint/control alone is not combat. supernatural_combat = spell, curse, psychic, elemental, magical, divine, demonic, or supernatural harmful effect against a living target; magical restraint/control alone is handled by restraintControl unless it also harms. restraint = deterministic non-hostile physical restraint contest against a living target. stealth = avoiding detection/perception by a specific established living detector. environment = physical/environmental obstacle, escape, chase, lock, trap, terrain, weather, barrier, hazard, non-living opposition, or object/access/boundary contest not handled by boundaryPressure.',
    TARGETS:
'ActionTargets are living entities directly involved in the latest user action or dialogue. OppTargets.NPC are living entities directly opposing, resisting, defending against, detecting, or being attacked/challenged by the current action. OppTargets.ENV is only non-living opposition. hostilesInScene is a broad scene pool and does not create rolls, relationships, or OppTargets by itself.'
  });

  identifyGoal(input):
    policy: LOCKED, EXPLICIT-ONLY
    rule: return a short plain description of what {{user}} is trying to accomplish in the latest input
    rule: apply DEF.PLAYER_TEXT first; extract only concrete present external action/dialogue/object use/ability use/movement/attack/interaction
    rule: ignore setup, intermediary steps, and flavor unless they are themselves consequential
    return finalGoal

  identifyChallenge(input, finalGoal, context):
    policy: LOCKED, EXPLICIT-ONLY
    rule: return the specific action, method, contest, obstacle, or attack sequence that decides whether finalGoal succeeds or fails
    rule: this may be social, physical, stealth, environmental, access-based, or combat
    rule: apply DEF.PLAYER_TEXT first; internal prose is never the challenge unless the same input declares a present external action/objective
    rule: if no distinct stakes-bearing challenge exists, return finalGoal
    return challenge

  userAbilityUse(input, challenge, context):
    policy: SEMANTIC-ONLY, NO-MECHANICAL-BONUS
    rule: Attempted=Y when input explicitly names or clearly describes attempting an active {{user}} ability/spell/supernatural effect
    rule: Available=Y only if that ability/spell exists in active character/persona/lore/context
    rule: Used=Y only when Attempted=Y and Available=Y
    rule: abilities can make fictional methods possible, but never change rollNeeded, challengeType, dice, stats, margins, actionUnits, damage, or outcome
    return {Attempted, Available, Used, AbilityName, Evidence, NarrativeEffect, NoEffectReason, MechanicalScope:flavor_only_no_bonus}

  itemUse(input, challenge, context):
    policy: SEMANTIC-ONLY, INVENTORY-LOCKED
    rule: Attempted=Y when input uses, consumes, equips, spends, gives, throws, activates, or relies on a personal gear/inventory/currency item
    rule: Available=Y only if the item exists in saved user gear/inventory/currency or is explicitly present in-scene
    rule: body parts and natural weapons are not itemUse
    rule: unavailable item attempts cannot produce the item-dependent effect
    return {Attempted, Available, Item, Source, Evidence, NoEffectReason}

  claimCheck(input, challenge, context):
    policy: SEMANTIC-ONLY
    rule: Present=Y when {{user}} makes a stakes-relevant factual claim that an NPC may believe, doubt, verify, or disbelieve
    rule: no-stakes factual chatter does not create a roll by itself
    return {Present, Claim, TruthStatus, NPCAccess, TargetNPC, StakesImpact, Reason}

  intimacyAdvanceExplicit(input, finalGoal, challenge, context):
    policy: LOCKED, EXPLICIT-ONLY
    rule: return Y only for explicit intimate escalation with a specific NPC: kissing, making out, sexual touch, undressing toward intimacy, asking for sex, moving to bed, or accepting/reciprocating a prior explicit NPC intimacy invitation
    rule: return N for flirting, teasing, compliments, dates, love declarations, vague innuendo, hand-holding, casual affection, or asking permission without clear intimate escalation
    rule: this is only an intimacy permission/boundary signal; it does not create rolls, landed actions, Bond loss, Fear, or Hostility by itself
    return Y|N

  restraintControl(input, finalGoal, challenge, context):
    policy: LOCKED, EXPLICIT-ONLY
    rule: return Present=Y only when {{user}} explicitly holds, pins, grabs, drags, blocks, binds, immobilizes, carries, forces position, or prevents movement of a specific living NPC
    rule: return N for mere proximity, hand on wall, leaning close, ordinary touch, flirtation, hand-holding, or movement that does not restrict the NPC's body or movement
    rule: TargetNPC must be the living NPC whose body/movement is controlled, or (none)
    return {Present, TargetNPC, Evidence}

  boundaryPressure(input, finalGoal, challenge, context):
    policy: LOCKED, EXPLICIT-ONLY
    rule: return Present=Y for non-restraint pressure on an NPC-controlled possession, object, space, route, doorway, access point, or departure
    rule: examples include snatching, taking, grabbing, keeping, or refusing to return an NPC-associated item; pushing through guarded access; blocking an exit; or stopping departure without directly controlling the NPC's body
    rule: return N for direct bodily restraint/control, combat attacks, pure social pressure, ordinary conversation, or harmless scene handling with no NPC boundary/possession/access pressure
    rule: Type must be object_access, space_access, departure, or none
    return {Present, Type, TargetNPC, ObjectOrAccess, Evidence}

  boundaryBreak(input, finalGoal, challenge, context):
    policy: LOCKED, EXPLICIT-ONLY
    rule: check hidden tracker pendingBoundary only; if no pendingBoundary is active, return Present=N
    rule: return Present=Y when latest input continues, escalates, ignores, or refuses to release/return/stop the same boundary behavior after that NPC set a boundary
    rule: Present=Y requires the exact pendingBoundary BoundaryId, TargetNPC, and Type; copy them from hidden state and never invent or alter the ID
    rule: return Present=N when {{user}} releases, returns, backs off, apologizes without continuing, or does something unrelated
    rule: Response must be released, continued, escalated, unrelated, unclear, or none
    return {Present, BoundaryId, TargetNPC, Type, Response, Evidence}

  rollNeeded(input, finalGoal, challenge, restraintControl, boundaryPressure, boundaryBreak, context):
    policy: ROLL-GATE
    rule: apply DEF.STAKES and DEF.NO_STAKES
    rule: return Y only when success/failure of the latest explicit external action creates fresh unresolved stakes
    rule: return N when no fresh unresolved stake exists or when that exact stake is already resolved/suppressed
    rule: do not force Y solely from restraintControl or boundaryPressure; deterministic relationship/boundary code decides whether those roll
    rule: boundaryBreak=Y is a fresh unresolved stake unless deterministic code suppresses it for B4 warning grace
    rule: stealth-style action requires a specific established living detector; without one, return N unless a separate non-stealth obstacle creates stakes
    rule: saved disposition never suppresses separate combat, pursuit, bargaining, materially new deception, resources, secrets, stealth against a detector, or environmental obstacles
    return Y|N

  challengeType(input, finalGoal, challenge, rollNeeded, context):
    policy: ROLL-ROUTE, EXPLICIT-ONLY
    output: {type, evidence}
    rule: if rollNeeded=N, return {type:none, evidence:(none)}
    rule: return social for fresh unresolved NPC-facing persuasion, bargaining, deception, lying, intimidation, coercion, negotiation, request, command, seduction, reassurance, or social pressure
    rule: return supernatural_combat for a spell, curse, psychic attack, elemental blast, divine/demonic power, or supernatural harmful effect used as the contested attack against a living target
    rule: return mundane_combat for direct bodily, weapon, natural-weapon, tool, projectile, thrown object, or ordinary physical attack that can injure a living target
    rule: return restraint only when deterministic boundary/restraint policy requires an actual physical restraint contest; do not use combat for restraint/control alone
    rule: return stealth only when {{user}} tries to avoid detection/perception by a specific established living detector/opponent
    rule: return environment for physical/environmental obstacles, escape, chase, locks, traps, terrain, weather, barriers, hazards, non-living opposition, or object/access/boundary contests that are not social, combat, or stealth
    rule: threats of future violence are social; immediate attack/control is combat
    rule: magic used only to communicate, persuade, deceive, or carry speech remains social unless the magic itself directly harms the target
    rule: magic used on non-living obstacles is environment unless it directly attacks a living target
    return {none|social|mundane_combat|supernatural_combat|restraint|stealth|environment, evidence}

  socialTactic(input, challenge, challengeType, context):
    policy: SOCIAL-SUBTYPE, EXPLICIT-ONLY
    rule: if challengeType!=social, return none
    rule: diplomacy = good-faith persuasion, negotiation, bargaining, reassurance, appeal, reconciliation, cooperation, or sincere request
    rule: bluff = deception, lying, false claims, misleading, tricking, disguise claims, forged authority, or concealed truth
    rule: intimidate = threats, coercion, blackmail, forced submission, interrogation pressure, menacing, or fear-based demands
    return none|diplomacy|bluff|intimidate

  identifyTargets(input, challenge, finalGoal, rollNeeded, challengeType, context):
    policy: LOCKED, EXPLICIT-ONLY
    hostilesInScene.NPC = all established present living hostile entities in scene
    ActionTargets = living entities {{user}} directly tries to affect, address, follow, help, harm, restrain, deceive, negotiate with, or otherwise directly interact with
    OppTargets.NPC = living entities directly opposing, resisting, defending against, detecting, or being attacked/challenged by {{user}}'s current action
    OppTargets.ENV = non-living obstacle/condition that makes the current goal fail-able
    BenefitedObservers = third-party living entities whose stakes materially improve from {{user}}'s action
    HarmedObservers = third-party living entities whose stakes materially worsen from {{user}}'s action
    NPCAwareOfUser = individual living NPCs who directly notice, address, react to, gesture to, or otherwise individually interact with {{user}} this turn
    PowerActors = strategic-only organizations, groups, institutions, or potential power figures with credible reach beyond acting alone in the moment
    rule: apply DEF.TARGETS
    rule: hostilesInScene must be established by narration, tracker, character/scenario/lore context, or initial test setup; do not create hostile entities from the latest input alone
    rule: if rollNeeded=N, OppTargets.NPC=(none) and OppTargets.ENV=(none), but ActionTargets and NPCAwareOfUser may still list direct living interaction/awareness
    rule: if challengeType=stealth, the specific living detector must be in ActionTargets and OppTargets.NPC; OppTargets.ENV=(none)
    rule: if challengeType=social, the social target/opponent must be in ActionTargets and usually OppTargets.NPC
    rule: if challengeType=mundane_combat or supernatural_combat, attacked/challenged living targets must be in ActionTargets and OppTargets.NPC
    rule: if challengeType=restraint or restraintControl.Present=Y, the restrained living NPC must be in ActionTargets and may be in OppTargets.NPC only when deterministic code requires a roll
    rule: if challengeType=environment, put non-living opposition in OppTargets.ENV when present; include living opposition in OppTargets.NPC only when a specific living NPC directly resists, guards, blocks, controls access, or is the boundary-pressure target
    rule: target/observer categories are mutually exclusive except a direct ActionTarget may also be OppTargets.NPC when they are the resisting party
    return {hostilesInScene, ActionTargets, OppTargets, BenefitedObservers, HarmedObservers, NPCAwareOfUser, PowerActors}

  activeHostileThreat(input, finalGoal, targets, context):
    policy: LOCKED, EXPLICIT-ONLY
    rule: return Y only if the current scene contains immediate hostile danger: attacking, charging, preparing to attack, pursuing, ambushing, threatening violence, monster engagement, armed standoff, capture attempt, or imminent physical/supernatural harm
    rule: return N for negotiation, refusal, suspicion, rivalry, nonviolent obstruction, or ordinary opposition without immediate danger
    return Y|N

  harmMode(input, finalGoal, challenge, challengeType, targets, context):
    policy: DOWNSTREAM DAMAGE/DEATH GATE ONLY
    rule: this field never creates rollNeeded=Y, never changes challengeType, and never creates relationship harm by itself
    rule: lethal = attack a living body with weapon, improvised weapon, natural weapon, dangerous tool, projectile, firearm, blade, fang, claw, horn, crushing object, destructive magic, poison, fire, electricity, or any method that could reasonably kill/maim if decisive
    rule: nonlethal = attack a living body with ordinary unarmed force or explicitly controlled force: punches, kicks, elbows, knees, brawling, tackle-as-attack, training, sparring, pulled blows, pommel strikes, flat-of-blade, practice weapons, or clear intent to avoid fatal harm
    rule: restraint_control = hold, pin, grab, drag, block, bind, immobilize, carry, force position, or prevent movement without a separate injuring attack
    rule: restraint_control causes no HP damage and at most minor bruising plus control/status when scene-valid
    rule: none = no bodily attack, harmful effect, or restraint/control
    rule: if mixed, choose most dangerous active mode: lethal > nonlethal > restraint_control > none
    return lethal|nonlethal|restraint_control|none

  actionUnits(input, challenge, challengeType):
    policy: LOCKED, EXPLICIT-ONLY, SEMANTIC-ONLY, MAX 3 ACTIONS
    output: [{id:A1, action, evidence}, ...]
    rule: actionUnits is the ONLY semantic source for mechanically counted actions
    rule: if challengeType is not mundane_combat or supernatural_combat, return exactly one unit: A1
    rule: if challengeType is mundane_combat or supernatural_combat, return one unit per explicit discrete attack/effect, capped at three
    rule: each unit is one mechanically resolved action that could separately land, miss, be blocked, dodged, deflected, or apply an effect
    rule: count separate attacks/effects even when they share target, goal, sentence, ability name, or combo
    rule: count repeated uses of the same attack, spell, projectile, strike, shot, bite, claw swipe, or harmful effect when the wording clearly presents them as separate attempts
    rule: do not count setup, aiming, drawing, focusing, chanting, movement, pivoting, repositioning, defense, recovery, or flavor unless that act itself is a separate attack/effect
    rule: each unit must include a short clean action description and brief evidence phrase from the latest user input
    rule: actionUnits do not decide success, failure, outcome, injury, counterattack, or narration
    return [{id:A1,...}] | [{id:A1,...},{id:A2,...}] | [{id:A1,...},{id:A2,...},{id:A3,...}]

  environmentDifficultyTier(challengeType, targets, context):
    policy: LOCKED, EXPLICIT-ONLY
    rule: applies only when challengeType=environment and OppTargets.ENV contains real non-living opposition
    rule: do not apply to stealth; stealth resolves against a living detector
    rule: easy = trivial/routine/lightly obstructed
    rule: average = meaningful obstacle a capable person could plausibly fail
    rule: hard = serious obstacle requiring strong capability, tools, magic, focus, favorable positioning, or risk
    rule: extreme = exceptional, dangerous, fortified, overwhelming, or near-impossible
    rule: classify from concrete scene facts only; do not adjust for drama or {{user}} stats
    return none|easy|average|hard|extreme

  genStats(target, context):
    policy: LOCKED, EXPLICIT-ONLY
    rule: use only if target currentCoreStats missing
    rule: classify the population/role context that best fits this specific NPC; consider occupation, location, species, established actions, card/lore facts, and reputation together
    rule: common = ordinary civilian, laborer, resident, incidental person, unknown capability, or no explicit evidence of practiced exceptional capability
    rule: trained = role or portrayal clearly implies practiced professional, martial, magical, intellectual, investigative, or social capability
    rule: elite = explicitly exceptional champion, master, veteran, rare predator, renowned expert, or similarly uncommon individual
    rule: boss = explicitly singular major threat, legendary being, supreme master, or central overwhelming antagonist; never use boss from title, location, hostility, or dramatic importance alone
    rule: if target currentCoreStats are missing and capability is uncertain, return CapabilityPool=common; return none only when no target needs stats
    rule: determine MainStat from explicit specialization: PHY, MND, CHA, or Balanced; unclear or broadly capable = Balanced
    rule: deterministic code rolls final Rank from CapabilityPool percentiles, assigns numeric stats, and saves them
    return {CapabilityPool, MainStat}

  execution:
    finalGoal = identifyGoal(input)
    challenge = identifyChallenge(input, finalGoal, context)
    userAbilityUse = userAbilityUse(input, challenge, context)
    itemUse = itemUse(input, challenge, context)
    claimCheck = claimCheck(input, challenge, context)
    intimacyAdvanceExplicit = intimacyAdvanceExplicit(input, finalGoal, challenge, context)
    restraintControl = restraintControl(input, finalGoal, challenge, context)
    boundaryPressure = boundaryPressure(input, finalGoal, challenge, context)
    boundaryBreak = boundaryBreak(input, finalGoal, challenge, context)
    rollNeeded = rollNeeded(input, finalGoal, challenge, restraintControl, boundaryPressure, boundaryBreak, context)
    rollReason = short explanation for rollNeeded
    challengeType = challengeType(input, finalGoal, challenge, rollNeeded, context)
    socialTactic = socialTactic(input, challenge, challengeType, context)
    targets = identifyTargets(input, challenge, finalGoal, rollNeeded, challengeType, context)
    activeHostileThreat = activeHostileThreat(input, finalGoal, targets, context)
    harmMode = harmMode(input, finalGoal, challenge, challengeType, targets, context)
    actionUnits = actionUnits(input, challenge, challengeType)
    actions = actionUnits ids
    envDifficultyTier = rollNeeded=Y ? environmentDifficultyTier(challengeType, targets, context) : none
    if first OppTargets.NPC currentCoreStats missing:
      generatedStatsSeed = genStats(first OppTargets.NPC, context)
    deterministic code may override restraintControl/boundaryPressure/boundaryBreak roll policy from B/F/H, pending boundaries, and active-opposed/crisis context; then resolves stats, dice, margins, landed actions, counter potential, injuries, relationships, and outcome from challengeType/socialTactic
    NPCInScene = unique living NPCs from ActionTargets, OppTargets.NPC, BenefitedObservers, HarmedObservers, NPCAwareOfUser, plus a single pending-offer NPC only when the user gives a clear generic accept/refuse response to that pending offer
    return {GOAL:finalGoal, challenge:challenge, rollNeeded:rollNeeded, rollReason:rollReason, challengeType:challengeType.type, challengeTypeEvidence:challengeType.evidence, socialTactic:socialTactic, userAbilityUse:userAbilityUse, itemUse:itemUse, claimCheck:claimCheck, intimacyAdvanceExplicit:intimacyAdvanceExplicit, restraintControl:restraintControl, boundaryPressure:boundaryPressure, boundaryBreak:boundaryBreak, harmMode:harmMode, actions:actions, actionUnits:actionUnits, EnvironmentDifficultyTier:envDifficultyTier, activeHostileThreat:activeHostileThreat, hostilesInScene:targets.hostilesInScene, ActionTargets:targets.ActionTargets, OppTargets:targets.OppTargets, BenefitedObservers:targets.BenefitedObservers, HarmedObservers:targets.HarmedObservers, NPCAwareOfUser:targets.NPCAwareOfUser, PowerActors:targets.PowerActors, NPCInScene:NPCInScene}
}
---------------------------
function RelationshipEngine(npc, resolutionPacket) {
  const DEF = Object.freeze({
    EO:
'EXPLICIT-ONLY. MUST be stated in Card / Lore / Scene text / tracker. NO inference. Uncertain=N.',
    FYW:
'FIRST-YES-WINS. In ordered rule ladders, the first matching explicit rule becomes final.',
    UNIVERSAL:
'Use resolutionPacket as final for GOAL, intimacyAdvanceExplicit, restraintControl, boundaryPressure, boundaryBreak, LandedActions, OutcomeTier, Outcome, ActionTargets, OppTargets, BenefitedObservers, and HarmedObservers.',
    BANDS:
'BOND(B): 1 Low trust/Avoidant (keeps distance, avoids vulnerability and private closeness, cautious or transactional if engagement is necessary). 2 Neutral/Transactional (polite, practical, reserved, curious, formal, situationally cooperative, no default vulnerability or personal closeness). 3 Friendly/Comfortable (cooperative, relaxed, warm, ordinary closeness acceptable when context supports it; not automatic romance or intimacy). 4 Close/Trusting (confides, seeks closeness, shows loyalty, support, vulnerability, and deep personal investment; still not automatic romance or intimacy). FEAR(F): 1 Unshaken (steady, not intimidated). 2 Alert/Wary (cautious, watchful). 3 Afraid/Self-protective (wants distance, safety, witnesses, or an exit; staying, answering, or complying is defensive appeasement/caution, not comfort, attraction, trust, or willingness). 4 Terrified/Panic (escape, surrender, help-seeking, freezing, pleading, or desperate self-protection; compliance is fear management, not consent, comfort, or trust). HOSTILITY(H): 1 Warm/Loyal (supportive, protective). 2 Neutral (no active ill will). 3 Hostile/Obstructive (argues, refuses, obstructs, challenges, mocks, threatens, or interferes). 4 Hatred/Violent (wants harm, removal, exposure, humiliation, sabotage, defeat, or driving away).',
    LOCK:
'If F=4 -> TERROR. Else if H=4 -> HATRED. Else if F=3 or H=3 -> FREEZE. If lock is active, behavior must equal lock. Invariant: F>=3 or H>=3 forces B=1.',
    STAKE_CHANGE:
'Benefit means an outcome significantly and concretely improves this NPC stakes through rescue from independent danger, protection from an independent threat, meaningful resources, restored autonomy, significant status/standing improvement, prevention of real harm/loss, or explicit goal advancement. Harm means an outcome materially worsens this NPC safety, autonomy, possessions/access, standing, goals, or trust/boundaries. Trivial help, minor convenience, mood improvement, politeness, approval, ordinary cooperation, flirting, compliments, enjoyable conversation, user self-advancement, a negotiation win for the user, choosing or failing to harm the NPC, de-escalation without a concrete NPC gain, or merely remaining safe/unharmed are neither benefit nor harm.'
  });

  getCurrentRelationalState(npc):
    policy: EO
    rule: read exact latest sceneTracker NPC entry for this NPC
    rule: currentDisposition = valid B[x]/F[y]/H[z] 1-4 ? exact values : null
    rule: currentRapport = valid 0-5 ? exact value : 0
    rule: establishedRelationship = valid Y/N ? exact value : N
    rule: slowBondEvidence = latest tracker slowBondEvidence object, default all counters 0, blockers empty
    rule: hostilePressure = valid number ? exact value : 0
    rule: hostileLandedPressure = valid number ? exact value : 0
    rule: dominantLock = valid FEAR/HOSTILITY/None ? exact value : None
    rule: pressureMode = valid none/cornered/dominated ? exact value : none
    return {currentDisposition, currentRapport, establishedRelationship, slowBondEvidence, hostilePressure, hostileLandedPressure, dominantLock, pressureMode}

  initPreset():
    policy: EO, FYW
    rule: use only if currentDisposition is missing
    rule: means only how this NPC initially feels toward {{user}} / active persona
    rule: semantic pass chooses only the initPreset tags; deterministic runner assigns B/F/H exactly
    rule: check all available context: assembled ST prompt stack, character card, persona text/name, scenario, lore/world info, tracker snapshot, and chat history
    rule: activeHostileThreat is a crisis/combat signal, not an initPreset label
    rule: establishedRelationship is a separate relationship-state mechanic, not an initPreset label
    rule: NPC has explicit fear immunity only if same or superior kind/nature, peer/superior supernatural or monstrous being, explicit natural fear/mental immunity, or the card/lore/scenario explicitly shows the NPC is an ancient, powerful, non-ordinary being who has faced horrors, monsters, curses, eldritch forces, or other supernatural threats and is portrayed as not meaningfully fearing them
    rule: title, rank, bravado, posturing, composure, courage, or pretending to be fearless do NOT count as fear immunity
    if prior card/lore/scenario/chat establishes clear user-directed romantic interest, romantic willingness, love, crush, courting desire, romantic preoccupation, or deliberate romantic pursuit toward {{user}} -> {Label:romanticOpen,B:4,F:1,H:1}
    rule: romanticOpen can be stated directly or shown through clearly romantic behavior, gestures, plans, keepsakes, letters, gifts, jealousy, longing, attempts to be noticed, attempts to spend time alone, or other evidence that the NPC interest in {{user}} is romantic rather than merely friendly
    rule: generic friendliness, politeness, casual flirting, shallow physical attraction, ordinary embarrassment, first impressions, vague chemistry, gratitude, or non-romantic loyalty do NOT count as romanticOpen
    rule: if romanticOpen and userNonHuman are both explicit, set both semantic flags; deterministic precedence keeps romanticOpen as the initial disposition
    if {{user}} is hated, distrusted, wanted, enemy-coded, or bad-reputation with this NPC before the current first interaction -> {Label:userBadRep,B:1,F:2,H:3}
    rule: first encounter kindness, opening-scene rescue, courtesy, friendliness, praise, or a warm first impression do NOT count as prior favorable reputation
    if {{user}} is explicitly shown by prior lore, card, scenario, tracker, chat history, or user knowledge to have an established favorable or trust-normalizing reputation with this NPC that predates the current scene -> {Label:priorUserGoodRep,B:3,F:1,H:1}
    rule: trust-normalizing prior context means the NPC has credible prior reason to treat {{user}} as safe, cooperative, vouched-for, familiar, cleared, helpful, or ordinary despite unusual nature; mere name recognition, gossip, or current-scene politeness is not enough
    if {{user}} has an established fearsome/dangerous reputation known to this NPC OR is explicitly visibly inhuman, demonic, monstrous, undead, bestial, eldritch, or construct-like in a fresh/unnormalized first exposure AND NPC lacks explicit fear immunity -> {Label:userNonHuman,B:1,F:2,H:2}
    rule: userNonHuman is the single fear-init bucket for fear-coded prior reputation/history/rumor OR fresh visible monstrous/inhuman nature
    rule: do NOT use userNonHuman merely because the NPC knows {{user}} is nonhuman; if the NPC has prior familiarity, ordinary neighbor/customer/guild contact, a trusted introduction, or other neutral/normalizing context that makes {{user}} known rather than shocking, use priorUserGoodRep only if that context is actually favorable/trust-normalizing, otherwise fall through to neutralDefault unless bad/fear reputation applies
    else -> {Label:neutralDefault,B:2,F:2,H:2}

  auditInteraction(npc, resolutionPacket):
    policy: EO, FYW
    rule: return Y only if {{user}}'s act clearly, substantially, and concretely improves this NPC's stakes: rescue from independent danger, protection from an independent threat, meaningful resources, restored autonomy, significant status/standing improvement, prevention of real harm/loss, or explicit goal advancement for that NPC
    rule: the benefit must be significant. Trivial help, minor convenience, mood improvement, making the NPC smile, politeness, approval, ordinary cooperation, or weak preference shifts do NOT count
    rule: flirting, compliments, tone, shallow approval, enjoyable conversation, successful self-advancement by {{user}}, successful negotiation for {{user}}'s own goal, choosing not to harm them, failing to harm them, or the NPC merely surviving/remaining safe do NOT count as meaningful benefit
    if scene facts show significant concrete benefit to this NPC -> Y
    else -> N

  stakeChangeByOutcome(npc, resolutionPacket):
    policy: EO, FYW
    rule: for each possible resolution outcome, return benefit only if that outcome significantly and concretely improves this NPC's stakes as per DEF.STAKE_CHANGE
    rule: return harm only if that outcome materially worsens this NPC's stakes as per DEF.STAKE_CHANGE
    rule: return none if that outcome does not materially change this NPC's stakes
    rule: do NOT return benefit merely because {{user}} succeeds at {{user}}'s own goal, negotiates successfully for {{user}}, chooses not to harm the NPC, fails to harm the NPC, de-escalates without giving the NPC a concrete gain, or because the NPC remains unharmed/safe
    rule: if resolutionPacket.boundaryBreak.Present=Y and this NPC is the direct/opposing boundary target, successful or landed outcomes [success, dominant_impact, solid_impact, light_impact] worsen this NPC's boundary/autonomy/trust stakes; return harm, not none
    rule: NPC_STAKES=Y when the actual outcome's stakeChangeByOutcome is benefit or harm
    rule: NPC_STAKES=N when the actual outcome's stakeChangeByOutcome is none

  routeDispositionTarget(npc, resolutionPacket, audit):
    policy: EO, FYW
    isDirect = resolutionPacket.ActionTargets.includes(npc.name)
    isOpp = resolutionPacket.OppTargets.NPC.includes(npc.name)
    isBenefited = resolutionPacket.BenefitedObservers.includes(npc.name)
    isHarmed = resolutionPacket.HarmedObservers.includes(npc.name)
    benefit = audit=Y
    landed = resolutionPacket.LandedActions > 0
    g = resolutionPacket.GOAL
    out = resolutionPacket.Outcome
    if !isDirect && !isOpp && !isBenefited && !isHarmed -> No Change
    if !isDirect && !isOpp && isBenefited -> benefit ? Bond : No Change
    if !isDirect && !isOpp && isHarmed:
      if out in [dominant_impact, solid_impact] -> FearHostility
      else -> Hostility
    if resolutionPacket.boundaryBreak.Present=Y and (isDirect or isOpp):
      if explicit goal/challenge is coercion, threat, force, or fear pressure -> FearHostility
      else -> Hostility
    if explicit goal/challenge is intimidation, coercion, menacing threat, forced submission, or terrorizing display:
      if landed -> Fear
      else -> No Change
    if landed && (isDirect || isOpp || isHarmed) and actual outcome materially harms this NPC:
      if out in [dominant_impact, solid_impact] -> FearHostility
      else -> Hostility
    if landed && (isDirect || isOpp) but action is non-coercive social opposition with stakeChangeByOutcome=none -> No Change
    if benefit -> Bond
    else -> No Change

  applyPhysicalBoundaryPressure(npc, resolutionPacket, state):
    policy: LOCKED, FYW
    rule: use only when resolutionPacket.boundaryPressure.Present=Y OR resolutionPacket.boundaryBreak.Present=Y OR challengeType=restraint, and resolutionPacket.RollNeeded=Y, without lethal/nonlethal harmMode
    isDirect = resolutionPacket.ActionTargets.includes(npc.name)
    isOpp = resolutionPacket.OppTargets.NPC.includes(npc.name)
    isHarmed = resolutionPacket.HarmedObservers.includes(npc.name)
    if !isDirect && !isOpp && !isHarmed -> none
    rule: boundary pressure is a lower-severity negative social/physical boundary response, not combat
    rule: apply Hostility pressure by at most +1 H and never raise H above 3 from boundary/restraint pressure alone
    if state.currentDisposition.H>=3 -> deltas={b:0,f:0,h:0}
    else -> deltas={b:-1,f:0,h:1}
    target = Hostility
    return {target, deltas}

  applyHostilePhysicalPressure(npc, resolutionPacket, state):
    policy: LOCKED, FYW
    rule: use only when resolutionPacket.harmMode is lethal or nonlethal, challengeType is mundane_combat or supernatural_combat, and resolutionPacket.RollNeeded=Y
    isDirect = resolutionPacket.ActionTargets.includes(npc.name)
    isOpp = resolutionPacket.OppTargets.NPC.includes(npc.name)
    isHarmed = resolutionPacket.HarmedObservers.includes(npc.name)
    if !isDirect && !isOpp && !isHarmed -> none
    landed = resolutionPacket.LandedActions > 0
    severity = hostilePressureSeverity(resolutionPacket.Outcome)
    hostilePressure = clamp(state.hostilePressure + max(1,severity), 0, 20)
    hostileLandedPressure = landed ? clamp(state.hostileLandedPressure + max(1,severity), 0, 20) : state.hostileLandedPressure
    pressureState = {disposition:state.currentDisposition, dominantLock:state.dominantLock, pressureMode:state.pressureMode}
    if !landed:
      if hostilePressure>=1 -> deltas = addDispositionPressure(pressureState, 1, failed)
    else if resolutionPacket.Outcome=light_impact -> deltas = addDispositionPressure(pressureState, 1, landed)
    else if resolutionPacket.Outcome in [solid_impact, dominant_impact] -> deltas = addDispositionPressure(pressureState, severity, dominance)
    target = targetFromDeltas(deltas)
    dominatedFearBreak = pressureState.pressureMode=dominated ? Y : N
    return {target, deltas, hostilePressure, hostileLandedPressure, dominantLock:pressureState.dominantLock, pressureMode:pressureState.pressureMode, dominatedFearBreak}

  hostilePressureSeverity(outcome):
    if outcome in [dominant_impact, solid_impact] -> 2
    else -> 1

  addDispositionPressure(state, amount, mode):
    disposition = state.disposition
    if mode=failed:
      if disposition.H > disposition.F -> deltas = addHostilityPressure(state, amount)
      else -> deltas = addFearPressure(state, amount)
    else if mode=landed:
      if disposition.F > disposition.H -> deltas = addFearPressure(state, amount)
      else -> deltas = addHostilityPressure(state, amount)
    else if state.dominantLock=HOSTILITY || disposition.H>=4:
      state.pressureMode = dominated
      deltas = addFearPressure(state, amount, noCorneredOverflow=Y)
    else if disposition.F > disposition.H -> deltas = addFearPressure(state, amount)
    else if disposition.H > disposition.F -> deltas = addHostilityPressure(state, amount)
    else -> deltas = {b:-1,f:1,h:1}
    projected = updateDisposition(disposition, deltas)
    updatePressureLockState(state, disposition, projected)
    return deltas

  addFearPressure(state, amount, noCorneredOverflow=N):
    room = max(0, 4 - state.disposition.F)
    f = min(amount, room)
    overflow = max(0, amount - f)
    h = noCorneredOverflow=Y ? 0 : overflow
    if overflow > 0 && noCorneredOverflow=N:
      state.pressureMode = cornered
      if state.dominantLock=None -> state.dominantLock = FEAR
    return {b:(f>0 || h>0 ? -1 : 0), f:f, h:h}

  addHostilityPressure(state, amount):
    return {b:-1, f:0, h:amount}

  updatePressureLockState(state, before, after):
    if state.dominantLock!=None -> return
    fearHit = before.F<4 && after.F>=4
    hostilityHit = before.H<4 && after.H>=4
    if fearHit && !hostilityHit -> state.dominantLock = FEAR
    else if hostilityHit && !fearHit -> state.dominantLock = HOSTILITY
    else if fearHit && hostilityHit -> state.dominantLock = state.pressureMode=cornered ? FEAR : HOSTILITY

  targetFromDeltas(deltas):
    if deltas.f>0 && deltas.h>0 -> FearHostility
    if deltas.f>0 -> Fear
    if deltas.h>0 -> Hostility
    else -> No Change

  updateRapport(currentRapport, target, rapportEligible):
    rule: positive encounter = target in [Bond,No Change]
    rule: negative encounter = target in [Hostility,Fear,FearHostility]
    rule: rapportEligible = Y only if this NPC has no prior rapport gain or 30 minutes of global active play passed since this NPC's last rapport gain
    rule: cooldown expiry does not change rapport by itself; rapport changes only on the next qualifying interaction with this NPC
    rule: when rapport is consumed by Bond or No Change, set this NPC's last rapport gain active time to the current global active play time
    if target in [Bond,No Change] and rapportEligible!=Y -> return {currentRapport:currentRapport}
    if target in [Bond,No Change] -> return {currentRapport:min(5,currentRapport+1)}
    if target in [Hostility,Fear,FearHostility] -> return {currentRapport:max(0,currentRapport-1)}
    return {currentRapport:currentRapport}

  deriveDirection(target, audit, currentDisposition, currentRapport, resolutionPacket):
    if target=No Change and currentDisposition.B<3 and non-negative involved interaction -> may promote early Bond by rapport threshold
    if target=No Change otherwise -> {b:0,f:0,h:0}
    if target=Hostility -> {b:-1,f:0,h:1}
    if target=Fear -> {b:-1,f:1,h:0}
    if target=FearHostility -> {b:-1,f:1,h:1}
    if currentDisposition.F=4 || currentDisposition.H=4:
      if currentRapport>=5 && target in [Bond,No Change] && audit=Y && !(landed>0):
        return {b:0,f:(currentDisposition.F=4?-1:0),h:(currentDisposition.H=4?-1:0),rapportReset:Y}
      else:
        return {b:0,f:0,h:0}

    if currentDisposition.F=3 || currentDisposition.H=3:
      if currentRapport>=5 && target in [Bond,No Change]:
        return {b:0,f:(currentDisposition.F=3?-1:0),h:(currentDisposition.H=3?-1:0)}
      else:
        return {b:0,f:0,h:0}

    if target=Bond or allowed early No Change:
      if currentDisposition.B=1:
        if currentRapport>=1 -> {b:1,f:0,h:0}
        else -> {b:0,f:0,h:0}
      if currentDisposition.B=2:
        if currentRapport>=3 -> {b:1,f:0,h:0}
        else -> {b:0,f:0,h:0}
    if target=Bond:
      if currentDisposition.B=3:
        if currentRapport>=5 && audit=Y -> {b:1,f:0,h:0}
        else -> {b:0,f:0,h:0}
      if currentDisposition.B>=4 -> {b:0,f:0,h:0}

    return {b:0,f:0,h:0}

  updateDisposition(currentDisposition, deltas):
    clamp = (v) => Math.max(1, Math.min(4, v))
    currentDisposition.B = clamp(currentDisposition.B + (deltas.b||0))
    currentDisposition.F = clamp(currentDisposition.F + (deltas.f||0))
    currentDisposition.H = clamp(currentDisposition.H + (deltas.h||0))
    if currentDisposition.F>=3 || currentDisposition.H>=3 -> currentDisposition.B = 1
    return currentDisposition

  classifyDisposition(currentDisposition):
    lock = currentDisposition.F=4 ? TERROR : currentDisposition.H=4 ? HATRED : (currentDisposition.F=3 || currentDisposition.H=3) ? FREEZE : None
    behavior = lock!=None ? lock : currentDisposition.B=4 ? CLOSE : currentDisposition.B=3 ? FRIENDLY : currentDisposition.B=2 ? NEUTRAL : BROKEN
    return {lock, behavior}

  checkThreshold(currentDisposition):
    LockActive = (currentDisposition.F>=3 || currentDisposition.H>=3) ? Y : N
    Override = NONE
    if NPC has clearly and directly offered, requested, invited, strongly implied, or physically initiated sexual/intimate escalation with {{user}} in the current or immediately recent scene, and has not withdrawn, refused, panicked, or been interrupted by danger -> Override = CurrentInvitation
    else if NPC explicitly naive, easily led/persuaded, follows {{user}}'s lead without question, sheltered to an unsafe degree, trapped, dependent, coerced, powerless, or otherwise exploitable by {{user}} or the current situation -> Override = Exploitation
    else if NPC explicitly sexually open, pleasure-seeking, casual, or promiscuous -> Override = Hedonist
    else if NPC explicitly willing to exchange intimacy for money, goods, favors, protection, status, or services -> Override = Transactional
    else if NPC explicitly has prior/current intimate access with current or recent receptivity toward {{user}} -> Override = Established
    RomanticBuildup = Y only when a B4 scene has consistently and mutually built toward romantic/intimate escalation with receptive NPC behavior and no refusal, withdrawal, fear, hostility, danger, public interruption, or boundary limit
    OverrideActive = Override!=NONE ? Y : N
    return {LockActive, OverrideActive, Override, RomanticBuildup}

  checkEstablishedRelationship(currentDisposition, context):
    policy: LOCKED, EXPLICIT-ONLY
    rule: return Y only if currentDisposition.B=4 AND the latest sceneTracker already has establishedRelationship=Y, or the current explicit scene shows a direct romantic/love/relationship declaration or request from {{user}} to this NPC accepted by the NPC, or from this NPC to {{user}} accepted by {{user}}
    rule: declaration/request must establish an actual romantic relationship, partnership, lovers status, dating/courting bond, or equivalent committed romantic connection
    rule: flirting, attraction, arousal, sex, prior intimacy, affection, kindness, trust, loyalty, closeness, friendship, gratitude, protectiveness, or B4 alone does NOT count
    else -> N

  checkSlowBondEvidence(npc, resolutionPacket, context):
    policy: LOCKED, EXPLICIT-ONLY
    rule: identify only positive relationship evidence shown by the latest scene or explicit ongoing scene context. Do not infer from silence, friendliness, attractiveness, intimacy, or B score.
    rule: respectfulContact = consensual or clearly welcome physical contact, careful non-invasive touch, or physical help performed with respect for the NPC's comfort and agency
    rule: cooperation = ordinary constructive cooperation toward a shared immediate purpose
    rule: comfortInProximity = NPC remains/settles close to {{user}} without tension, avoidance, coercion, duty pressure, or forced circumstance
    rule: boundaryRespect = {{user}} explicitly respects refusal, hesitation, privacy, space, limits, consent, or a stated boundary
    rule: sharedRoutine = repeated or mundane togetherness such as eating, traveling, working, resting, training, tending camp, or recurring rituals
    rule: playfulness = mutual light teasing, joking, banter, gamefulness, or relaxed warmth without cruelty or pressure
    rule: teamwork = coordinated effort under pressure, danger, conflict, crisis, or meaningful difficulty
    rule: personalAttention = specific attention to the NPC's needs, preferences, wellbeing, vulnerability, history, comfort, or expressed concerns
    rule: blockers include recent coercion, intimidation, betrayal, humiliation, unwanted intimacy pressure, boundary violation, unresolved harm, exploitation, active fear, active hostility, or NPC being trapped/dependent/powerless in a way that makes closeness unsafe to count
    rule: return only categories with explicit evidence in this scene; leave all others 0. Return blocker labels only when explicitly present.

  slowBondEligible(currentDisposition, currentRapport, slowBondEvidence):
    policy: LOCKED, DETERMINISTIC
    rule: return Y only if currentDisposition.B=3, currentDisposition.F<3, currentDisposition.H<3, currentRapport>=5, blockers empty, and at least 3 distinct positive evidence categories have count > 0
    else -> N

  execution:
    if npc not in resolutionPacket.NPCInScene -> return uninitialized handoff
    read state, initialize disposition if missing, and check hidden rapport cooldown against global active play time
    read stakeChangeByOutcome for actual resolution outcome, set NPC_STAKES from benefit/harm vs none, audit benefit interaction, route disposition target
    hostilePressureResult = applyHostilePhysicalPressure(npc, resolutionPacket, state)
    if hostilePressureResult exists -> target = hostilePressureResult.target else target = routeDispositionTarget
    update rapport from final target; if a positive/neutral eligible interaction consumed rapport, stamp this NPC's last rapport gain active time
    if hostilePressureResult exists -> deltas = hostilePressureResult.deltas else deltas = deriveDirection(target, audit, currentDisposition, rapport.currentRapport, resolutionPacket)
    update disposition and apply rapport reset if present
    if hostilePressureResult.dominatedFearBreak=Y and currentDisposition.F>=4 and currentDisposition.H>=3 -> lower currentDisposition.H by 1
    save currentRapport, lastRapportGainActiveMs, hostilePressure, hostileLandedPressure, dominantLock, and pressureMode to sceneTracker
    classify disposition, update slowBondEvidence, check slowBondEligible, resolve threshold/override, and check establishedRelationship
    RelationToUserAction = {isDirect, isOpp, isBenefited, isHarmed}
    return NPC handoff including HostilePressure, HostileLandedPressure, DominantLock, PressureMode, and RelationToUserAction
}
-----------------
function CHAOS_INTERRUPT(resolutionPacket, npcHandoffList, sceneSummary, diceList) {
  const DEF = Object.freeze({
    EO:
'EXPLICIT-ONLY. Use resolutionPacket, npcHandoffList, and sceneSummary as truth. Uncertain=N.',
    FYW:
'FIRST-YES-WINS. STOP-ON-RETURN.',
    UNIVERSAL:
'Single-pass. Consume the next 5 dice only; reset per {{user}} message. Output labeled fields only. No prose, no dice history, and no self-correction.'
  });

  getCtx(npcHandoffList, sceneSummary):
    policy: EO, FYW
    npcCount = npcHandoffList ? npcHandoffList.length : 0
    if npcCount >= 2 -> PUBLIC
    if sceneSummary matches [public|crowd|open|market|tavern|street|square] -> PUBLIC
    else -> ISOLATED

  classifyBand(O):
    if O <= 5 -> HOSTILE
    else if O <= 15 -> COMPLICATION
    else -> BENEFICIAL

  classifyMagnitude(O):
    if O = 1 || O = 20 -> EXTREME
    else if O <= 2 || O >= 19 -> MAJOR
    else if O <= 4 || O >= 17 -> MODERATE
    else -> MINOR

  pickAnchor(idx):
    A = [GOAL, ENVIRONMENT, KNOWN_NPC, RESOURCE, CLUE]
    return A[idx % 5]

  pickVector(ctx, I, idx):
    if ctx = PUBLIC -> V = [NPC, CROWD, AUTHORITY, ENVIRONMENT, SYSTEM]
    else if I >= 17 -> V = [ENVIRONMENT, SYSTEM, ENTITY]
    else -> V = [ENVIRONMENT, SYSTEM]
    return V[idx % V.length]

  execution:
    A = NEXT(diceList)
    O = NEXT(diceList)
    I = NEXT(diceList)
    ctx = getCtx(npcHandoffList, sceneSummary)

    if A < 19 ->
      return {CHAOS:{triggered:false, band:None, magnitude:None, anchor:None, vector:None, personVector:false, fullText:null}}

    band = classifyBand(O)
    magnitude = classifyMagnitude(O)
    anchorIdx = NEXT(diceList)
    anchor = pickAnchor(anchorIdx)
    vectorIdx = NEXT(diceList)
    vector = pickVector(ctx, I, vectorIdx)
    personVector = (vector = NPC || vector = AUTHORITY) ? true : false

    return {CHAOS:{triggered:true, band:band, magnitude:magnitude, anchor:anchor, vector:vector, personVector:personVector, fullText:null}}
}
function NPCProactivityEngine(npcHandoffList, resolutionPacket, chaosHandoff, diceBudget) {
  const DEF = Object.freeze({
    EO:
'EXPLICIT-ONLY. Use only resolutionPacket, npcHandoffList, chaosHandoff, and diceBudget. Uncertain=N.',
    FYW:
'FIRST-YES-WINS. Single-pass.',
    UNIVERSAL:
'Determine NPC initiative only: whether they act, what intent they take, who their immediate target is, and the proactivity roll result. Do not resolve physical attack/counter outcomes here.'
  });

  parseFinalState(finalState):
    policy: EO
    if exact B[x]/F[y]/H[z] valid -> {B:x,F:y,H:z}
    else -> {B:2,F:2,H:2}

  deriveLock(fin):
    if fin.F=4 -> TERROR
    else if fin.H=4 -> HATRED
    else if fin.F=3 || fin.H=3 -> FREEZE
    else -> None

  classifyAction(resolutionPacket):
    policy: EO, FYW
    g = resolutionPacket.GOAL
    if resolutionPacket.RollNeeded=N -> Normal_Interaction
    if resolutionPacket.classifyCombatActionSequence=Y -> Combat
    if resolutionPacket.ActionTargets contains >=1 living entity -> Social
    if resolutionPacket.OppTargets.ENV != [(none)] -> Skill
    else -> Normal_Interaction

  deriveImpulse(kind, lock, fin, pressureMode, target):
    policy: FYW
    if pressureMode=cornered -> ANGER
    if pressureMode=dominated -> FEAR
    if lock=HATRED -> ANGER
    if lock=TERROR -> FEAR
    if target=Bond -> BOND
    if target=Hostility -> ANGER
    if target=Fear -> FEAR
    if target=FearHostility:
      if fin.F > fin.H -> FEAR
      else -> ANGER
    if kind in [Combat, Social] && fin.H>=fin.F && fin.H>=fin.B -> ANGER
    if kind=Social && fin.F>=fin.H && fin.F>=fin.B -> FEAR
    if kind in [Normal_Interaction, Skill] && fin.B>=fin.H && fin.B>=fin.F -> BOND
    if fin.H>=fin.F && fin.H>=fin.B -> ANGER
    if fin.F>=fin.H && fin.F>=fin.B -> FEAR
    else -> BOND

  classifyProactivityTier(handoff, chaosBand, counterPotential):
    policy: FYW
    fin = parseFinalState(handoff.FinalState)
    lock = handoff.Lock if present else deriveLock(fin)
    NPC_STAKES = handoff.NPC_STAKES if present else N
    Target = handoff.Target if present else No Change
    Landed = handoff.Landed if present else N
    if counterPotential in [light,medium,severe] && lock in [HATRED,FREEZE] -> FORCED
    if lock=HATRED && (Target!=No Change || NPC_STAKES=Y || Landed=Y || handoff.PressureMode!=none || relation.isDirect || relation.isOpp || relation.isHarmed) -> FORCED
    if companion crisis eligible and context is active combat, immediate hostile danger, hostile physical action, counterattack opening, urgent environmental threat, or crisis -> LOW
    if NPC_STAKES=N && Target=No Change && chaosBand=None:
      if fin.B>=4 && fin.F<3 && fin.H<3 && handoff.EstablishedRelationship=Y -> HIGH in calm/no-stakes scenes; MEDIUM in active scenes
      if fin.B>=4 && fin.F<3 && fin.H<3 && handoff.EstablishedRelationship!=Y -> HIGH
      if fin.B>=3 || fin.H>=3 -> MEDIUM
      else -> DORMANT
    if lock!=None && (Target!=No Change || Landed=Y) -> HIGH
    if NPC_STAKES=Y && (Target!=No Change || Landed=Y) -> HIGH
    if lock!=None && chaosBand!=None -> HIGH
    if lock!=None -> MEDIUM
    if NPC_STAKES=Y -> MEDIUM
    if Target!=No Change || Landed=Y -> MEDIUM
    if chaosBand!=None -> LOW
    else -> DORMANT

  proactivityRefereeGuard(handoff, resolutionPacket):
    policy: LOCKED, FYW
    relation = handoff.RelationToUserAction
    if relation.isDirect || relation.isOpp || relation.isHarmed -> none
    if relation.isBenefited && handoff.Target=Bond -> DORMANT
    if handoff.NPC_STAKES=Y && handoff.Target=Bond && handoff.Landed=Y -> DORMANT
    if handoff.Target=Bond && handoff.PressureMode=none && handoff.Lock not in [FREEZE,TERROR,HATRED] && no harmful attack/boundary break/boundary pressure/restraint contest is present -> DORMANT
    else -> none

  thresholdFromTier(tier):
    if tier=FORCED -> AUTO
    if tier=HIGH -> 8
    if tier=MEDIUM -> 10
    if tier=LOW -> 13
    else -> 16

  selectIntent(impulse, kind, fin, override, pressureMode):
    policy: FYW
    if pressureMode=cornered:
      if fin.H>=4 -> ESCALATE_VIOLENCE
      else -> BOUNDARY_PHYSICAL
    if pressureMode=dominated:
      if fin.F>=4 -> CALL_HELP_OR_AUTHORITY
      else -> WITHDRAW_OR_BOUNDARY
    if impulse=ANGER:
      if kind=Combat || fin.H>=4 -> ESCALATE_VIOLENCE
      else -> THREAT_OR_POSTURE
    if impulse=FEAR:
      if fin.F>=4 -> CALL_HELP_OR_AUTHORITY
      else -> WITHDRAW_OR_BOUNDARY
    if impulse=BOND:
      if override!=NONE && fin.B>=3 -> INTIMACY_OR_FLIRT
      if kind in [Skill, Social] -> SUPPORT_ACT
      else -> PLAN_OR_BANTER

  romanceInitiative(candidate, handoff, fin, diceBudget):
    policy: LOCKED, DETERMINISTIC, CONTEXT-AWARE
    rule: apply only after an NPC passes proactivity or is FORCED
    rule: in calm context, B4 romance/partner-eligible NPCs use threshold 12 instead of the base HIGH threshold 8
    rule: do not apply to ESCALATE_VIOLENCE, BOUNDARY_PHYSICAL, or THREAT_OR_POSTURE
    rule: apply only if fin.B>=4, fin.F<3, fin.H<3, handoff.Lock=None, and handoff.EstablishedRelationship!=Y
    rule: romanceStyle comes from RelationshipEngine[npc].romanceStyle: shy/reserved/guarded -> nervous; bold/outgoing/playful/direct -> flirt; unclear -> auto
    rule: Thoughtful_Gift and Ask_Date each set a 1d20 NPC-interchange cooldown after they happen
    rule: Thoughtful_Gift, Ask_Date, and Date_And_Confess do not repeat in the current B4 cycle if refused; Date_And_Confess refusal lowers Bond to B3 and stops this branch until Bond is rebuilt to B4
    rule: Date_And_Confess can happen only after Thoughtful_Gift and Ask_Date have both happened and been accepted in this B4 cycle
    rule: blocked major romance tags remap to Romantic_Attention, Romantic_Flirt, or Romantic_Nervous rather than producing no proactive beat
    romanceDie = 1d100
    if romanceDie>=96 -> Date_And_Confess
    if romanceDie>=86 -> Ask_Date
    if romanceDie>=71 -> Thoughtful_Gift
    if romanceDie>=51 -> Romantic_Attention
    else -> Romantic_Nervous or Romantic_Flirt from romanceStyle
    if current context is active -> remap Ask_Date or Date_And_Confess to Romantic_Attention
    if current context is active combat, immediate hostile danger, hostile physical action, counterattack opening, urgent environmental threat, or crisis -> handled by companionCrisisInitiative instead
    set Intent to selected romance tag, Impulse=BOND, ProactivityTarget={{user}}, TargetsUser=Y

  partnerInitiative(candidate, handoff, fin, diceBudget):
    policy: LOCKED, DETERMINISTIC, CONTEXT-AWARE
    rule: apply only after an NPC passes proactivity or is FORCED
    rule: in calm context, B4 romance/partner-eligible NPCs use threshold 12 instead of the base HIGH threshold 8
    rule: do not apply to ESCALATE_VIOLENCE, BOUNDARY_PHYSICAL, THREAT_OR_POSTURE, CALL_HELP_OR_AUTHORITY, or WITHDRAW_OR_BOUNDARY
    rule: apply only if fin.B>=4, fin.F<3, fin.H<3, handoff.Lock=None, and handoff.EstablishedRelationship=Y
    rule: Partner_Date, Partner_Gift, Partner_Intimacy, and Partner_Conflict are meaningful partner events
    rule: meaningful partner events share one per-NPC active-time cooldown of 1d4 hours after any one fires
    rule: while the shared meaningful cooldown is active, meaningful partner events remap to Partner_Flirt or Partner_Tease
    rule: after cooldown expires, the same meaningful event cannot repeat back-to-back; remap to the next meaningful event in order
    rule: Partner_Intimacy requires privacy or clear contextual suitability; otherwise remap to the next meaningful event
    partnerDie = 1d100
    if partnerDie>=96 -> Partner_Conflict
    if partnerDie>=81 -> Partner_Intimacy
    if partnerDie>=71 -> Partner_Gift
    if partnerDie>=61 -> Partner_Date
    if partnerDie>=31 -> Partner_Tease
    else -> Partner_Flirt
    if current context is active -> remap Partner_Intimacy or Partner_Conflict to Partner_Flirt/Partner_Tease
    if current context is active combat, immediate hostile danger, hostile physical action, counterattack opening, urgent environmental threat, or crisis -> handled by companionCrisisInitiative instead
    set Intent to selected/remapped partner tag, Impulse=BOND, ProactivityTarget={{user}}, TargetsUser=Y

  companionCrisisInitiative(candidate, handoff, fin, diceBudget):
    policy: LOCKED, DETERMINISTIC, CONTEXT-AWARE
    rule: apply only after an NPC passes proactivity or is FORCED
    rule: apply only in crisis context: active combat, immediate hostile danger, hostile physical action, counterattack opening, urgent environmental threat, or other direct danger/threat. Do not apply to ordinary social opposition, negotiation, bargaining, refusal, suspicion, or nonviolent OppTargets.NPC.
    rule: apply only if fin.B>=2, fin.F<=2, fin.H<=2, handoff.Lock=None, and the NPC is not the direct/opposing/harmed target
    rule: B1 is excluded
    companionDie = 1d100
    if B2 and not dire: 1-35 Companion_Warn, 36-70 Companion_Assist, 71-85 Companion_Cover, 86-100 Companion_Attack if valid hostile target exists else support/cover/warn
    if B2 and dire: 1-25 Companion_Warn, 26-50 Companion_Assist, 51-65 Companion_Cover, 66-80 Companion_Attack if valid hostile target exists else support/cover/warn, 81-100 Companion_Retreat
    if B3 and not dire: 1-20 Companion_Warn, 21-55 Companion_Assist, 56-80 Companion_Cover, 81-100 Companion_Attack if valid hostile target exists else support/cover/warn
    if B3 and dire: 1-15 Companion_Warn, 16-45 Companion_Assist, 46-75 Companion_Cover, 76-95 Companion_Attack if valid hostile target exists else support/cover/warn, 96-100 Companion_Retreat
    if B4 or established relationship and not dire: 1-5 Companion_Warn, 6-35 Companion_Assist, 36-75 Companion_Cover, 76-100 Companion_Attack if valid hostile target exists else support/cover
    if B4 or established relationship and dire: 1-5 Companion_Warn, 6-35 Companion_Assist, 36-75 Companion_Cover, 76-99 Companion_Attack if valid hostile target exists else support/cover, 100 Companion_Retreat only if the NPC is badly wounded, critical, or incapacitated; otherwise support/cover/attack
    set Intent=ESCALATE_VIOLENCE only for Companion_Attack; otherwise Intent=SUPPORT_ACT

  companionCrisisTarget(handoff, resolutionPacket):
    policy: LOCKED, DETERMINISTIC
    rule: applies only to companion crisis initiative during crisis remaps
    rule: never target {{user}}
    rule: do not use friendly/neutral ActionTargets, BenefitedObservers, or HarmedObservers as friendly attack targets
    rule: hostilesInScene.NPC is the established hostile pool; use it only for hostile target selection, not relationship routing
    rule: direct companion commands are tactical requests only; they never force proactivity, never create a user-resolved roll to make the companion act, and never guarantee obedience
    rule: if companion crisis initiative independently produces Companion_Attack, a direct companion command may choose a hostile by name only from established hostiles in hostilesInScene.NPC, hostile handoffs, or hostile tracker entries; never create a new hostile from user wording alone
    rule: if multiple established hostiles exist and the command/narration does not name one, do not guess
    if OppTargets.NPC has a valid hostile target not equal to acting NPC -> that NPC
    else if ActionTargets has a valid hostile target not equal to acting NPC and that target's tracker/handoff state is hostile (H>=3, HATRED, or HOSTILITY lock) -> that NPC
    else if hostilesInScene.NPC has exactly one valid hostile target not equal to acting NPC -> that NPC
    else -> (none), downgrade to support/protect/teamwork without attack roll

  proactivityTarget(handoff, resolutionPacket, intent):
    policy: FYW
    if intent not in [ESCALATE_VIOLENCE, BOUNDARY_PHYSICAL, THREAT_OR_POSTURE] -> (none)
    if handoff.RelationToUserAction.isOpp || handoff.RelationToUserAction.isDirect || handoff.RelationToUserAction.isHarmed -> {{user}}
    if resolutionPacket.HarmedObservers has a named NPC not equal to acting NPC -> that NPC
    else -> {{user}}

  targetsUserFromProactivityTarget(ProactivityTarget):
    if ProactivityTarget={{user}} -> Y
    else -> N

  execution:
    kind = classifyAction(resolutionPacket)
    chaosBand = chaosHandoff.CHAOS.band
    counterPotential = resolutionPacket.CounterPotential
    cap = 3
    FOR EACH NPC handoff:
      fin = parseFinalState(handoff.FinalState)
      lock = derive or load lock
      impulse = deriveImpulse(kind, lock, fin, handoff.PressureMode, handoff.Target)
      guard = proactivityRefereeGuard(handoff, resolutionPacket)
      if guard exists -> tier = DORMANT else tier = classifyProactivityTier(handoff, chaosBand, counterPotential)
      provisionalResult = {NPC, Proactive:N, Intent:NONE, Impulse:NONE, ProactivityTarget:(none), TargetsUser:N, ProactivityTier:tier}
      if tier=FORCED:
        intent = selectIntent(impulse, kind, fin, handoff.Override, handoff.PressureMode)
        target = proactivityTarget(handoff, resolutionPacket, intent)
        candidate = {NPC,die:20,tier:FORCED,intent:intent,impulse:impulse,ProactivityTarget:target,TargetsUser:targetsUserFromProactivityTarget(target),Threshold:AUTO,passes:Y}
      else:
        roll proactivityDie, thresholdFromTier, passes
      if passes=Y:
        intent = selectIntent(impulse, kind, fin, handoff.Override, handoff.PressureMode)
        target = proactivityTarget(handoff, resolutionPacket, intent)
        store candidate
      if passes=N -> keep Proactive:N, Intent:NONE, Impulse:NONE, ProactivityTarget:(none), TargetsUser:N
    sort candidates by die descending
    promote up to 3 candidates to proactive results
    return {NPC:{Proactive:[Y/N],Intent:[ESCALATE_VIOLENCE|BOUNDARY_PHYSICAL|THREAT_OR_POSTURE|CALL_HELP_OR_AUTHORITY|WITHDRAW_OR_BOUNDARY|INTIMACY_OR_FLIRT|SUPPORT_ACT|PLAN_OR_BANTER|Romantic_Nervous|Romantic_Flirt|Romantic_Attention|Thoughtful_Gift|Ask_Date|Date_And_Confess|Partner_Flirt|Partner_Tease|Partner_Date|Partner_Gift|Partner_Intimacy|Partner_Conflict|Companion_Warn|Companion_Assist|Companion_Cover|Companion_Attack|Companion_Retreat|NONE],Impulse:[ANGER|FEAR|BOND],ProactivityTarget:[{{user}}|NPC name|(none)],TargetsUser:[Y/N],ProactivityTier:[DORMANT|LOW|MEDIUM|HIGH|FORCED]?,ProactivityDie:[1-20]?,Threshold:[AUTO|8|10|12|13|16]?,RomanceInitiative:[Y/N]?,RomanceInitiativeTag:[tag|(none)]?,RomanceInitiativeDie:[1-100]?,RomanceInitiativeContext:[calm|active|crisis]?,PartnerInitiative:[Y/N]?,PartnerInitiativeTag:[tag|(none)]?,PartnerInitiativeDie:[1-100]?,PartnerInitiativeContext:[calm|active|crisis]?,CompanionInitiative:[Y/N]?,CompanionInitiativeTag:[tag|(none)]?,CompanionInitiativeDie:[1-100]?,CompanionInitiativeContext:[crisis]?,CompanionCrisisDire:[Y/N]?}...}
}
----------------
function NPCAggressionResolution(proactivityResults, resolutionPacket, trackerSnapshot, trackerUpdate, diceBudget) {
  const DEF = Object.freeze({
    EO:
'EXPLICIT-ONLY. Use proactivityResults, resolutionPacket, trackerSnapshot, trackerUpdate, and diceBudget. Uncertain=N.',
    UNIVERSAL:
'Resolve immediate NPC attack/counter outcomes only after NPCProactivityEngine. Never narrate {{user}} voluntary follow-up actions here.'
  });

  counterBonusFromPotential(counterPotential):
    if counterPotential=light -> 2
    if counterPotential=medium -> 4
    if counterPotential=severe -> 6
    else -> 0

  determineAttackType(resolutionPacket):
    if resolutionPacket.OutcomeTier=Critical_Success -> None
    if resolutionPacket.CounterPotential in [light,medium,severe] -> CounterAttack
    if resolutionPacket.harmMode in [lethal, nonlethal] and challengeType in [mundane_combat, supernatural_combat] -> Retaliation
    if any proactivityResult has Proactive=Y, ProactivityTarget not (none), and Intent=ESCALATE_VIOLENCE -> ProactiveAttack
    rule: ProactiveAttack is only created by ESCALATE_VIOLENCE. BOUNDARY_PHYSICAL and THREAT_OR_POSTURE may be narrated as proactivity, but they do not create an NPC attack roll unless CounterAttack or Retaliation already applies.
    else -> None

  immediateCounterTarget(resolutionPacket):
    if resolutionPacket.CounterPotential not in [light,medium,severe] -> none
    if first resolutionPacket.OppTargets.NPC exists -> first resolutionPacket.OppTargets.NPC
    else -> first resolutionPacket.ActionTargets

  reactiveCounterRecipient(counterTarget, proactivityResults):
    if a companion/proactive NPC attacked counterTarget this turn -> target that attacking NPC
    else -> {{user}}

  companionCounterLimit:
    if Companion_Attack targets an NPC and fails badly enough -> that target may make one immediate counterattack against the companion
    do not create further chained counters from that counterattack

  isImmediateAttackIntent(intent):
    if current AttackType=ProactiveAttack -> Y only when intent=ESCALATE_VIOLENCE
    if current AttackType=CompanionAttack -> Y only when intent=ESCALATE_VIOLENCE
    if current AttackType in [CounterAttack, Retaliation] -> Y when intent in [ESCALATE_VIOLENCE, BOUNDARY_PHYSICAL, THREAT_OR_POSTURE]
    else -> N

  aggressionReactionOutcome(margin):
    if margin >= 5 -> npc_overpowers
    if margin >= 1 -> npc_succeeds
    if margin = 0 -> stalemate
    else -> npc_fails

  execution:
    counterPotential = resolutionPacket.CounterPotential
    counterBonus = counterBonusFromPotential(counterPotential)
    attackType = determineAttackType(resolutionPacket)
    if attackType=None -> return {}
    aggressive = NPCs with Proactive=Y, ProactivityTarget not (none), and isImmediateAttackIntent(Intent)=Y
    if attackType=CounterAttack and resolutionPacket.OutcomeTier!=Critical_Success:
      counterTarget = immediateCounterTarget(resolutionPacket)
      counterRecipient = reactiveCounterRecipient(counterTarget, proactivityResults)
      if counterTarget exists and not already aggressive -> force counterTarget as {Proactive:Y,Intent:BOUNDARY_PHYSICAL,Impulse:ANGER,ProactivityTarget:counterRecipient,TargetsUser:Y only if counterRecipient={{user}},ProactivityTier:FORCED,ProactivityDie:20,Threshold:AUTO}
    FOR EACH aggressive NPC:
      npcCore = deterministic runtime currentCoreStats for NPC from trackerUpdate or trackerSnapshot
      targetCore = deterministic runtime user core stats if target={{user}} else target NPC currentCoreStats
      npcDie = 1d20
      targetDie = 1d20
      attackStat = highest of npcCore.PHY/MND only; ignore CHA for aggression
      defenseStat = attackStat
      npcTotal = npcDie + npcCore[attackStat] + counterBonus
      targetTotal = targetDie + targetCore[defenseStat]
      margin = npcTotal - targetTotal
      ReactionOutcome = aggressionReactionOutcome(margin)
      return AGGRESSION_RESULT {AttackType, AttackIntent, ProactivityTarget, CounterPotential, CounterBonus, ReactionOutcome, Margin}
}`;

// Executable engine rules are the deterministic source of truth used by deterministic-runner.js.
const NONE = '(none)';

export function createDice() {
    return {
        d20() {
            return Math.floor(Math.random() * 20) + 1;
        },
        d4() {
            return Math.floor(Math.random() * 4) + 1;
        },
        d50() {
            return Math.floor(Math.random() * 50) + 1;
        },
        d100() {
            return Math.floor(Math.random() * 100) + 1;
        },
        d150() {
            return Math.floor(Math.random() * 150) + 1;
        },
    };
}

export function combatOutcome(margin, actionLength) {
    let outcome;
    if (margin >= 8) outcome = { OutcomeTier: 'Critical_Success', LandedActions: 3, Outcome: 'dominant_impact', CounterPotential: 'none' };
    else if (margin >= 5) outcome = { OutcomeTier: 'Moderate_Success', LandedActions: 2, Outcome: 'solid_impact', CounterPotential: 'none' };
    else if (margin >= 1) outcome = { OutcomeTier: 'Minor_Success', LandedActions: 1, Outcome: 'light_impact', CounterPotential: 'none' };
    else if (margin === 0) outcome = { OutcomeTier: 'Stalemate', LandedActions: 0, Outcome: 'struggle', CounterPotential: 'none' };
    else if (margin >= -3) outcome = { OutcomeTier: 'Minor_Failure', LandedActions: 0, Outcome: 'checked', CounterPotential: 'light' };
    else if (margin >= -7) outcome = { OutcomeTier: 'Moderate_Failure', LandedActions: 0, Outcome: 'deflected', CounterPotential: 'medium' };
    else outcome = { OutcomeTier: 'Critical_Failure', LandedActions: 0, Outcome: 'avoided', CounterPotential: 'severe' };
    outcome.LandedActions = Math.min(outcome.LandedActions, actionLength);
    return outcome;
}

export const hostilePhysicalOutcome = combatOutcome;

export function nonHostileOutcome(margin) {
    if (margin >= 1) return { OutcomeTier: 'Success', LandedActions: 1, Outcome: 'success', CounterPotential: 'none' };
    if (margin === 0) return { OutcomeTier: 'Stalemate', LandedActions: 0, Outcome: 'struggle', CounterPotential: 'none' };
    return { OutcomeTier: 'Failure', LandedActions: 0, Outcome: 'failure', CounterPotential: 'none' };
}

export function counterBonusFromPotential(counterPotential) {
    if (counterPotential === 'light') return 2;
    if (counterPotential === 'medium') return 4;
    if (counterPotential === 'severe') return 6;
    return 0;
}

export function aggressionReactionOutcome(margin) {
    if (margin >= 5) return 'npc_overpowers';
    if (margin >= 1) return 'npc_succeeds';
    if (margin === 0) return 'stalemate';
    return 'npc_fails';
}

export function classifyRaceCategory(text) {
    const source = String(text ?? '').toLowerCase();
    if (/\b(half[-\s]?demon|demon|demonic|devil|fiend|cambion|oni)\b/.test(source)) return 'demonic';
    if (/\b(undead|vampire|dhampir|lich|wraith|ghoul|zombie|skeleton)\b/.test(source)) return 'undead';
    if (/\b(eldritch|aberration)\b/.test(source)) return 'eldritch';
    if (/\b(construct|golem)\b/.test(source)) return 'construct';
    if (/\b(orc|ogre|goblin|hobgoblin|bugbear|troll|minotaur|monster|monstrous|beastfolk|lizardfolk|kobold|werewolf|lycanthrope|bestial)\b/.test(source)) return 'monstrous';
    if (/\b(human|mortal|elf|elven|half[-\s]?elf|dwarf|dwarven|halfling|hobbit|gnome|fairy|fae|pixie|aasimar)\b/.test(source)) return 'typical';
    return 'unknown';
}

export function isDefaultGeneratedCore(core) {
    if (!core) return true;
    const rank = String(core.Rank || 'none');
    const mainStat = String(core.MainStat || 'none');
    return rank === 'none'
        && mainStat === 'none'
        && Number(core.PHY ?? 1) === 1
        && Number(core.MND ?? 1) === 1
        && Number(core.CHA ?? 1) === 1;
}

function packetNestedPresent(packet, key) {
    const value = packet?.[key];
    return value?.Present === 'Y' || value?.present === true;
}

function packetHarmfulAttackActive(packet) {
    return packet?.RollNeeded === 'Y'
        && ['lethal', 'nonlethal'].includes(String(packet?.harmMode || '').toLowerCase())
        && ['mundane_combat', 'supernatural_combat'].includes(packet?.challengeType);
}

function packetRestraintActive(packet) {
    return packetNestedPresent(packet, 'restraintControl') || packet?.challengeType === 'restraint';
}

function packetRestraintContestActive(packet) {
    return packet?.RollNeeded === 'Y' && packet?.challengeType === 'restraint';
}

function packetBoundaryPressureActive(packet) {
    return packetNestedPresent(packet, 'boundaryPressure');
}

function packetBoundaryBreakActive(packet) {
    return packetNestedPresent(packet, 'boundaryBreak');
}

export function routeDispositionTarget(npc, packet, auditInteraction, sem) {
    const isDirect = includesName(packet.ActionTargets, npc);
    const isOpp = includesName(packet.OppTargets?.NPC, npc);
    const isBenefited = includesName(packet.BenefitedObservers, npc);
    const isHarmed = includesName(packet.HarmedObservers, npc);
    const landed = landedBool(packet.LandedActions);
    const out = packet.Outcome;
    const rollNeeded = packet.RollNeeded === 'Y';
    const benefitAllowedForDirect = auditInteraction === 'Y'
        && (isDirect || isOpp)
        && !isHarmed
        && directOrOpposedBenefitAllowed(npc, packet, sem);

    if (!isDirect && !isOpp && !isBenefited && !isHarmed) return 'No Change';
    if (!rollNeeded && packet.SafeAutomaticHealing === 'Y') {
        if (benefitAllowedForDirect) return 'Bond';
        if (!isDirect && !isOpp && isBenefited && auditInteraction === 'Y') return 'Bond';
        return 'No Change';
    }
    if (!rollNeeded) return softBondAllowedForNoStakes(npc, packet, sem) ? 'Bond' : 'No Change';
    if (packetBoundaryBreakActive(packet) && (isDirect || isOpp)) {
        return bool(sem.explicitIntimidationOrCoercion) || packetHarmfulAttackActive(packet)
            ? 'FearHostility'
            : 'Hostility';
    }
    if (!isDirect && !isOpp && isBenefited) return auditInteraction === 'Y' ? 'Bond' : 'No Change';
    if (!isDirect && !isOpp && isHarmed) return ['dominant_impact', 'solid_impact'].includes(out) ? 'FearHostility' : 'Hostility';
    if (bool(sem.explicitIntimidationOrCoercion)) return landed ? 'Fear' : 'No Change';
    if (landed && (isDirect || isOpp || isHarmed) && landedActionHarmsRelationship(packet, sem, out, isHarmed)) {
        return ['dominant_impact', 'solid_impact'].includes(out) ? 'FearHostility' : 'Hostility';
    }
    if (benefitAllowedForDirect) return 'Bond';
    if (auditInteraction === 'Y' && !isDirect && !isOpp && !isHarmed) return 'Bond';
    return 'No Change';
}

function softBondAllowedForNoStakes(npc, packet, sem = {}) {
    const relation = relationToUserAction(npc, packet);
    if ((!relation.isDirect && !relation.isBenefited) || relation.isOpp || relation.isHarmed) return false;
    if (packetHarmfulAttackActive(packet)) return false;
    if (packetBoundaryPressureActive(packet)) return false;
    if (packetBoundaryBreakActive(packet)) return false;
    if (packetRestraintActive(packet)) return false;
    if (packet.intimacyAdvanceExplicit === 'Y') return false;
    if (packet.activeHostileThreat === 'Y') return false;
    if (bool(sem.explicitIntimidationOrCoercion)) return false;

    const evidence = normalizeSlowBondEvidence(sem.slowBondEvidence || {});
    if (evidence.blockers.length) return false;
    return slowBondEvidenceCount(evidence) > 0;
}

function landedActionHarmsRelationship(packet, sem, outcome, isHarmed) {
    if (isHarmed) return true;
    if (packetHarmfulAttackActive(packet)) return true;
    if (packetBoundaryPressureActive(packet)) return true;
    if (packetBoundaryBreakActive(packet)) return true;
    if (packetRestraintContestActive(packet)) return true;
    if (bool(sem.explicitIntimidationOrCoercion)) return true;
    return normalizeStakeChange(sem.stakeChangeByOutcome?.[String(outcome || 'no_roll')]) === 'harm';
}

function directOrOpposedBenefitAllowed(npc, packet, sem) {
    if (packetHarmfulAttackActive(packet)) return false;
    if (packetBoundaryPressureActive(packet)) return false;
    if (packetBoundaryBreakActive(packet)) return false;
    if (packetRestraintActive(packet)) return false;
    if (bool(sem.explicitIntimidationOrCoercion)) return false;
    const source = relationshipBenefitSourceText(packet, sem);
    return isConcreteAidBenefitForNpc(source, npc);
}

export function resolveStakeChangeByOutcome(npc, sem, packet) {
    const outcomeKey = String(packet.Outcome || 'no_roll');
    const semanticValue = normalizeStakeChange(sem.stakeChangeByOutcome?.[outcomeKey]);
    if (packet.RollNeeded !== 'Y') return { value: semanticValue };

    const hardValue = hardStakeChangeFromTargetRole(npc, packet);
    if (!hardValue || semanticValue === hardValue) return { value: semanticValue };

    return {
        value: hardValue,
        referee: {
            hardRule: 'RelationshipEngine.stakeChangeByOutcome: target category plus actual successful outcome determines impossible benefit/harm contradiction',
            outcome: outcomeKey,
            from: semanticValue,
            to: hardValue,
            relation: relationToUserAction(npc, packet),
        },
    };
}

export function normalizeStakeChange(value) {
    return ['benefit', 'harm', 'none'].includes(value) ? value : 'none';
}

export function hardStakeChangeFromTargetRole(npc, packet) {
    const relation = relationToUserAction(npc, packet);
    const positiveOutcome = ['success', 'dominant_impact', 'solid_impact', 'light_impact'].includes(packet.Outcome);
    const landed = landedBool(packet.LandedActions);
    if (!positiveOutcome && !landed) return null;

    if (relation.isBenefited && !relation.isDirect && !relation.isOpp) return 'benefit';
    if (relation.isHarmed && !relation.isDirect && !relation.isOpp) return 'harm';
    if ((relation.isDirect || relation.isOpp) && packetHarmfulAttackActive(packet) && landed) return 'harm';
    if ((relation.isDirect || relation.isOpp) && packetBoundaryPressureActive(packet) && positiveOutcome) return 'harm';
    if ((relation.isDirect || relation.isOpp) && packetRestraintContestActive(packet) && positiveOutcome) return 'harm';
    if ((relation.isDirect || relation.isOpp)
        && packetBoundaryBreakActive(packet)
        && positiveOutcome) {
        return 'harm';
    }

    return null;
}

export function applyMeaningfulBenefitReferee(npc, packet, stakeChange, sem = {}) {
    if (stakeChange !== 'benefit') return { value: stakeChange };

    const relation = relationToUserAction(npc, packet);
    if (relation.isBenefited && !relation.isDirect && !relation.isOpp) return { value: stakeChange };

    const source = relationshipBenefitSourceText(packet, sem);
    const strongBenefit = isConcreteAidBenefit(source);
    const falseBenefit = /\b(compliment\w*|flirt\w*|smil\w*|polite|conversation|talk\w* down|de-?escalat\w*|negotiate\w*|persuad\w*|convinc\w*|fail\w*|miss(?:ed)?|surviv\w*|safe|unharmed|choose\w* not to harm|not harm|spare[sd]?|own goal|self-advancement)\b/.test(source);

    if ((relation.isDirect || relation.isOpp) && !directOrOpposedBenefitAllowed(npc, packet, sem)) {
        return {
            value: 'none',
            referee: {
                hardRule: 'RelationshipEngine.auditInteraction: direct/opposed targets cannot receive Bond from generic success, pressure, de-escalation, or opposition; direct Bond requires concrete aid/treatment/rescue to that NPC',
                from: stakeChange,
                to: 'none',
                relation,
                directOrOpposedBenefitVeto: true,
            },
        };
    }

    if (strongBenefit && !falseBenefit) return { value: stakeChange };

    return {
        value: 'none',
        referee: {
            hardRule: 'RelationshipEngine.auditInteraction: benefit requires significant concrete stakes improvement; survival, compliments, no-harm, failed harm, de-escalation, or user self-advancement are not benefit',
            from: stakeChange,
            to: 'none',
            relation,
        },
    };
}

function relationshipBenefitSourceText(packet, sem = {}) {
    return [
        sem?.auditInteraction,
        sem?.identifyGoal,
        sem?.identifyChallenge,
        sem?.explicitMeans,
        packet?.GOAL,
        ...(Array.isArray(packet?.actions) ? packet.actions : []),
        packet?.Outcome,
    ].filter(Boolean).join(' ').toLowerCase();
}

function isConcreteAidBenefit(source) {
    const text = String(source || '').toLowerCase();
    return /\b(rescu\w*|protect\w*|shield\w*|save[sd]?|free[sd]?|liberat\w*|restore\w* autonomy|grant\w* autonomy|give[sn]?|donat\w*|pay\w*|reward\w*|heal\w*|cure\w*|stabiliz\w*|treat\w*|bandag\w*|first[-\s]?aid|splint\w*|medicine|medic\w*|prevent\w* (?:harm|injury|death|loss)|stop\w* (?:harm|injury|attack|assault)|advance\w* .*goal|status|standing|reputation|resource\w*)\b/.test(text);
}

function isConcreteAidBenefitForNpc(source, npc) {
    const text = String(source || '').toLowerCase();
    const name = String(npc || '').trim().toLowerCase();
    if (!text || !name) return false;
    const npcPattern = escapeNameForLocalRegExp(name);
    const threatPattern = new RegExp(`\\b(?:against|versus|vs|from|away\\s+from)\\s+(?:the\\s+)?${npcPattern}\\b|\\b${npcPattern}\\b.{0,50}\\b(?:back|away|off|down|aside|retreat|withdraw|stop|halt|block|bar|interpose|oppose|threat|attack)\\b`, 'i');
    if (threatPattern.test(text)) return false;

    const medicalVerb = '\\b(?:heal\\w*|cure\\w*|stabiliz\\w*|treat\\w*|bandag\\w*|first[-\\s]?aid|splint\\w*|medic\\w*|dress(?:es|ed|ing)?\\s+(?:the\\s+)?wound)\\b';
    const rescueVerb = '\\b(?:rescu\\w*|save[sd]?|free[sd]?|liberat\\w*|pull\\w*|drag\\w*|carry\\w*|shield\\w*|protect\\w*)\\b';
    const targetAfterVerb = new RegExp(`(?:${medicalVerb}|${rescueVerb}).{0,70}\\b(?:${npcPattern}|him|her|them)\\b`, 'i');
    const targetBeforeNeed = new RegExp(`\\b${npcPattern}\\b.{0,70}\\b(?:wound\\w*|injur\\w*|hurt\\w*|bleed\\w*|poison\\w*|sick\\w*|unconscious|dying|critical|trapped|pinned|bound|restrained|falling|danger|clear|free|safe|heal\\w*|cure\\w*|stabiliz\\w*|treat\\w*|bandag\\w*|first[-\\s]?aid|splint\\w*)\\b`, 'i');
    return targetAfterVerb.test(text) || targetBeforeNeed.test(text);
}

function escapeNameForLocalRegExp(value) {
    return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
}

export function relationToUserAction(npc, packet) {
    return {
        isDirect: includesName(packet.ActionTargets, npc),
        isOpp: includesName(packet.OppTargets?.NPC, npc),
        isBenefited: includesName(packet.BenefitedObservers, npc),
        isHarmed: includesName(packet.HarmedObservers, npc),
    };
}

export function proactivityRefereeGuard(handoff, packet) {
    const relation = handoff.RelationToUserAction || relationToUserAction(handoff.NPC, packet);
    if (relation.isDirect || relation.isOpp || relation.isHarmed) return null;
    if (relation.isBenefited && handoff.Target === 'Bond') {
        return 'benefited observer cannot target user with aggression unless also direct/opposing/harmed';
    }
    if (handoff.NPC_STAKES === 'Y' && handoff.Target === 'Bond' && handoff.Landed === 'Y') {
        return 'positive-stakes observer cannot convert benefit into user-targeting aggression';
    }
    if (handoff.Target === 'Bond'
        && handoff.PressureMode === 'none'
        && !['FREEZE', 'TERROR', 'HATRED'].includes(handoff.Lock)
        && !packetHarmfulAttackActive(packet)
        && !packetBoundaryPressureActive(packet)
        && !packetBoundaryBreakActive(packet)
        && !packetRestraintContestActive(packet)) {
        return 'Bond-routed non-hostile interaction cannot become hostile proactivity without harm, opposition, lock, or pressure evidence';
    }
    return null;
}

export function updateRapport(currentRapport, target, rapportEligible = false, mode = 'normal') {
    if (mode === 'hostilePressure' && target === 'No Change') return { currentRapport };
    if (['Bond', 'No Change'].includes(target)) {
        return {
            currentRapport: rapportEligible ? Math.min(5, currentRapport + 1) : currentRapport,
        };
    }
    if (['Hostility', 'Fear', 'FearHostility'].includes(target)) return { currentRapport: Math.max(0, currentRapport - 1) };
    return { currentRapport };
}

export function applyPhysicalBoundaryPressure(npc, packet, state) {
    if (!packetBoundaryPressureActive(packet) && !packetBoundaryBreakActive(packet) && !packetRestraintContestActive(packet)) return null;
    if (packetHarmfulAttackActive(packet)) return null;
    if (packet.RollNeeded !== 'Y') return null;

    const isDirect = includesName(packet.ActionTargets, npc);
    const isOpp = includesName(packet.OppTargets?.NPC, npc);
    const isHarmed = includesName(packet.HarmedObservers, npc);
    if (!isDirect && !isOpp && !isHarmed) return null;

    const currentH = Number(state.currentDisposition?.H || 2);
    const deltas = currentH >= 3
        ? { b: 0, f: 0, h: 0 }
        : { b: -1, f: 0, h: 1 };

    return {
        target: 'Hostility',
        deltas,
        boundaryPressure: 'Y',
    };
}

export function applyHostilePhysicalPressure(npc, packet, state) {
    if (!packetHarmfulAttackActive(packet)) return null;
    if (packet.RollNeeded !== 'Y') return null;

    const isDirect = includesName(packet.ActionTargets, npc);
    const isOpp = includesName(packet.OppTargets?.NPC, npc);
    const isHarmed = includesName(packet.HarmedObservers, npc);
    if (!isDirect && !isOpp && !isHarmed) return null;

    const landed = landedBool(packet.LandedActions);
    const severity = hostilePressureSeverity(packet.Outcome);
    const hostilePressure = clamp(state.hostilePressure + Math.max(1, severity), 0, 20);
    const hostileLandedPressure = landed
        ? clamp(state.hostileLandedPressure + Math.max(1, severity), 0, 20)
        : state.hostileLandedPressure;

    const pressureState = {
        disposition: state.currentDisposition,
        dominantLock: state.dominantLock,
        pressureMode: state.pressureMode,
    };

    let deltas = { b: 0, f: 0, h: 0 };
    let dominatedFearBreak = false;

    if (!landed) {
        deltas = addDispositionPressure(pressureState, 1, 'failed');
    } else if (packet.Outcome === 'light_impact') {
        deltas = addDispositionPressure(pressureState, 1, 'landed');
    } else if (['solid_impact', 'dominant_impact'].includes(packet.Outcome)) {
        deltas = addDispositionPressure(pressureState, severity, 'dominance');
        dominatedFearBreak = pressureState.pressureMode === 'dominated';
    }

    const target = targetFromDeltas(deltas);

    return {
        target,
        deltas,
        hostilePressure,
        hostileLandedPressure,
        dominantLock: pressureState.dominantLock,
        pressureMode: pressureState.pressureMode,
        dominatedFearBreak,
    };
}

export function hostilePressureSeverity(outcome) {
    if (outcome === 'dominant_impact') return 2;
    if (outcome === 'solid_impact') return 2;
    return 1;
}

export function addDispositionPressure(state, amount, mode) {
    const disposition = state.disposition;
    let deltas;

    if (mode === 'failed') {
        deltas = disposition.H > disposition.F
            ? addHostilityPressure(state, amount)
            : addFearPressure(state, amount);
    } else if (mode === 'landed') {
        deltas = disposition.F > disposition.H
            ? addFearPressure(state, amount)
            : addHostilityPressure(state, amount);
    } else if (state.dominantLock === 'HOSTILITY' || disposition.H >= 4) {
        state.pressureMode = 'dominated';
        deltas = addFearPressure(state, amount, { noCorneredOverflow: true });
    } else if (disposition.F > disposition.H) {
        deltas = addFearPressure(state, amount);
    } else if (disposition.H > disposition.F) {
        deltas = addHostilityPressure(state, amount);
    } else {
        deltas = { b: -1, f: 1, h: 1 };
    }

    const projected = updateDisposition(disposition, deltas);
    updatePressureLockState(state, disposition, projected);
    return deltas;
}

export function addFearPressure(state, amount, options = {}) {
    const room = Math.max(0, 4 - state.disposition.F);
    const f = Math.min(amount, room);
    const overflow = Math.max(0, amount - f);
    const h = options.noCorneredOverflow ? 0 : overflow;

    if (overflow > 0 && !options.noCorneredOverflow) {
        state.pressureMode = 'cornered';
        if (state.dominantLock === 'None') state.dominantLock = 'FEAR';
    }

    return { b: f || h ? -1 : 0, f, h };
}

export function addHostilityPressure(state, amount) {
    return { b: -1, f: 0, h: amount };
}

export function updatePressureLockState(state, before, after) {
    if (state.dominantLock !== 'None') return;

    const fearHit = before.F < 4 && after.F >= 4;
    const hostilityHit = before.H < 4 && after.H >= 4;

    if (fearHit && !hostilityHit) state.dominantLock = 'FEAR';
    else if (hostilityHit && !fearHit) state.dominantLock = 'HOSTILITY';
    else if (fearHit && hostilityHit) state.dominantLock = state.pressureMode === 'cornered' ? 'FEAR' : 'HOSTILITY';
}

export function targetFromDeltas(deltas) {
    if ((deltas.f || 0) > 0 && (deltas.h || 0) > 0) return 'FearHostility';
    if ((deltas.f || 0) > 0) return 'Fear';
    if ((deltas.h || 0) > 0) return 'Hostility';
    return 'No Change';
}

export function deriveDirection(target, currentDisposition, currentRapport, auditInteraction, packet = {}, options = {}) {
    const landed = landedBool(packet.LandedActions);
    const noChangeCanPromoteEarlyBond = target === 'No Change'
        && currentDisposition.B < 3
        && options.allowNoChangeEarlyBond === true
        && !packetHarmfulAttackActive(packet)
        && !packetBoundaryPressureActive(packet)
        && !packetBoundaryBreakActive(packet)
        && !packetRestraintContestActive(packet)
        && packet.intimacyAdvanceExplicit !== 'Y'
        && packet.activeHostileThreat !== 'Y';

    if (target === 'Hostility') return { b: -1, f: 0, h: 1 };
    if (target === 'Fear') return { b: -1, f: 1, h: 0 };
    if (target === 'FearHostility') return { b: -1, f: 1, h: 1 };
    if (currentDisposition.F === 4 || currentDisposition.H === 4) {
        if (currentRapport >= 5 && ['Bond', 'No Change'].includes(target) && auditInteraction === 'Y' && !landed) {
            return { b: 0, f: currentDisposition.F === 4 ? -1 : 0, h: currentDisposition.H === 4 ? -1 : 0, rapportReset: 'Y' };
        }
        return { b: 0, f: 0, h: 0 };
    }
    if (currentDisposition.F === 3 || currentDisposition.H === 3) {
        if (currentRapport >= 5 && ['Bond', 'No Change'].includes(target)) {
            return { b: 0, f: currentDisposition.F === 3 ? -1 : 0, h: currentDisposition.H === 3 ? -1 : 0 };
        }
        return { b: 0, f: 0, h: 0 };
    }
    if (target === 'No Change' && !noChangeCanPromoteEarlyBond) return { b: 0, f: 0, h: 0 };
    if (target === 'Bond') {
        if (currentDisposition.B === 1) return currentRapport >= 1 ? { b: 1, f: 0, h: 0 } : { b: 0, f: 0, h: 0 };
        if (currentDisposition.B === 2) return currentRapport >= 3 ? { b: 1, f: 0, h: 0 } : { b: 0, f: 0, h: 0 };
        if (currentDisposition.B === 3) return currentRapport >= 5 && auditInteraction === 'Y' ? { b: 1, f: 0, h: 0 } : { b: 0, f: 0, h: 0 };
    }
    if (noChangeCanPromoteEarlyBond) {
        if (currentDisposition.B === 1) return currentRapport >= 1 ? { b: 1, f: 0, h: 0 } : { b: 0, f: 0, h: 0 };
        if (currentDisposition.B === 2) return currentRapport >= 3 ? { b: 1, f: 0, h: 0 } : { b: 0, f: 0, h: 0 };
    }
    return { b: 0, f: 0, h: 0 };
}

export function updateDisposition(disposition, deltas) {
    return enforceDispositionInvariants({
        B: clamp(disposition.B + (deltas.b || 0), 1, 4),
        F: clamp(disposition.F + (deltas.f || 0), 1, 4),
        H: clamp(disposition.H + (deltas.h || 0), 1, 4),
    });
}

export function enforceDispositionInvariants(disposition) {
    const next = {
        B: clamp(Number(disposition?.B), 1, 4),
        F: clamp(Number(disposition?.F), 1, 4),
        H: clamp(Number(disposition?.H), 1, 4),
    };
    if (next.F >= 3 || next.H >= 3) {
        next.B = 1;
    }
    return next;
}

export function classifyDisposition(disposition) {
    const lock = disposition.F === 4 ? 'TERROR' : disposition.H === 4 ? 'HATRED' : (disposition.F === 3 || disposition.H === 3) ? 'FREEZE' : 'None';
    const behavior = lock !== 'None' ? lock : disposition.B === 4 ? 'CLOSE' : disposition.B === 3 ? 'FRIENDLY' : disposition.B === 2 ? 'NEUTRAL' : 'BROKEN';
    return { lock, behavior };
}

export function checkThreshold(disposition, flags) {
    const LockActive = disposition.F >= 3 || disposition.H >= 3 ? 'Y' : 'N';
    let Override = 'NONE';
    if (bool(flags.CurrentInvitation)) Override = 'CurrentInvitation';
    else if (bool(flags.Exploitation)) Override = 'Exploitation';
    else if (bool(flags.Hedonist)) Override = 'Hedonist';
    else if (bool(flags.Transactional)) Override = 'Transactional';
    else if (bool(flags.Established)) Override = 'Established';
    return { LockActive, OverrideActive: Override !== 'NONE' ? 'Y' : 'N', Override, RomanticBuildup: bool(flags.RomanticBuildup) ? 'Y' : 'N' };
}

export function getChaosContext(handoffs, sceneSummary) {
    if (handoffs.length >= 2) return 'PUBLIC';
    if (/\b(public|crowd|open|market|tavern|street|square)\b/i.test(sceneSummary)) return 'PUBLIC';
    return 'ISOLATED';
}

export function classifyBand(o) {
    if (o <= 5) return 'HOSTILE';
    if (o <= 15) return 'COMPLICATION';
    return 'BENEFICIAL';
}

export function classifyMagnitude(o) {
    if (o === 1 || o === 20) return 'EXTREME';
    if (o <= 2 || o >= 19) return 'MAJOR';
    if (o <= 4 || o >= 17) return 'MODERATE';
    return 'MINOR';
}

export function pickAnchor(index) {
    return ['GOAL', 'ENVIRONMENT', 'KNOWN_NPC', 'RESOURCE', 'CLUE'][index % 5];
}

export function pickVector(ctx, i, index) {
    const values = ctx === 'PUBLIC'
        ? ['NPC', 'CROWD', 'AUTHORITY', 'ENVIRONMENT', 'SYSTEM']
        : i >= 17
            ? ['ENVIRONMENT', 'SYSTEM', 'ENTITY']
            : ['ENVIRONMENT', 'SYSTEM'];
    return values[index % values.length];
}

export function classifyAction(packet) {
    if (packet.RollNeeded === 'N') return 'Normal_Interaction';
    if (packet.classifyCombatActionSequence === 'Y') return 'Combat';
    if (toRealArray(packet.ActionTargets).length >= 1) return 'Social';
    if (toRealArray(packet.OppTargets?.ENV).length >= 1) return 'Skill';
    return 'Normal_Interaction';
}

export function deriveImpulse(kind, lock, fin, pressureMode = 'none', target = 'No Change') {
    if (pressureMode === 'cornered') return 'ANGER';
    if (pressureMode === 'dominated') return 'FEAR';
    if (lock === 'HATRED') return 'ANGER';
    if (lock === 'TERROR') return 'FEAR';
    if (target === 'Bond') return 'BOND';
    if (target === 'Hostility') return 'ANGER';
    if (target === 'Fear') return 'FEAR';
    if (target === 'FearHostility') return fin.F > fin.H ? 'FEAR' : 'ANGER';
    if (['Combat', 'Social'].includes(kind) && fin.H >= fin.F && fin.H >= fin.B) return 'ANGER';
    if (kind === 'Social' && fin.F >= fin.H && fin.F >= fin.B) return 'FEAR';
    if (['Normal_Interaction', 'Skill'].includes(kind) && fin.B >= fin.H && fin.B >= fin.F) return 'BOND';
    if (fin.H >= fin.F && fin.H >= fin.B) return 'ANGER';
    if (fin.F >= fin.H && fin.F >= fin.B) return 'FEAR';
    return 'BOND';
}

export function classifyProactivityTier(handoff, chaosBand, counterPotential, lock, fin) {
    const NPC_STAKES = handoff.NPC_STAKES || 'N';
    const Target = handoff.Target || 'No Change';
    const Landed = handoff.Landed || 'N';
    const relation = handoff.RelationToUserAction || {};
    const pressureMode = handoff.PressureMode || 'none';
    if (['light', 'medium', 'severe'].includes(counterPotential) && ['HATRED', 'FREEZE'].includes(lock)) return 'FORCED';
    if (lock === 'HATRED'
        && (Target !== 'No Change'
            || NPC_STAKES === 'Y'
            || Landed === 'Y'
            || pressureMode !== 'none'
            || relation.isDirect
            || relation.isOpp
            || relation.isHarmed)) {
        return 'FORCED';
    }
    if (NPC_STAKES === 'N' && Target === 'No Change' && chaosBand === 'None') {
        if (fin.B >= 4 && fin.F < 3 && fin.H < 3 && handoff.EstablishedRelationship === 'Y') return 'HIGH';
        if (fin.B >= 4 && fin.F < 3 && fin.H < 3 && handoff.EstablishedRelationship !== 'Y') return 'HIGH';
        if (fin.B >= 3 || fin.H >= 3) return 'MEDIUM';
        return 'DORMANT';
    }
    if (lock !== 'None' && (Target !== 'No Change' || Landed === 'Y')) return 'HIGH';
    if (NPC_STAKES === 'Y' && (Target !== 'No Change' || Landed === 'Y')) return 'HIGH';
    if (lock !== 'None' && chaosBand !== 'None') return 'HIGH';
    if (lock !== 'None') return 'MEDIUM';
    if (NPC_STAKES === 'Y') return 'MEDIUM';
    if (Target !== 'No Change' || Landed === 'Y') return 'MEDIUM';
    if (chaosBand !== 'None') return 'LOW';
    return 'DORMANT';
}

export function thresholdFromTier(tier) {
    if (tier === 'FORCED') return 'AUTO';
    if (tier === 'HIGH') return 8;
    if (tier === 'MEDIUM') return 10;
    if (tier === 'LOW') return 13;
    return 16;
}

export function selectIntent(impulse, kind, fin, override, pressureMode = 'none') {
    if (pressureMode === 'cornered') {
        return fin.H >= 4 ? 'ESCALATE_VIOLENCE' : 'BOUNDARY_PHYSICAL';
    }

    if (pressureMode === 'dominated') {
        return fin.F >= 4 ? 'CALL_HELP_OR_AUTHORITY' : 'WITHDRAW_OR_BOUNDARY';
    }

    if (impulse === 'ANGER') {
        if (kind === 'Combat' || fin.H >= 4) return 'ESCALATE_VIOLENCE';
        return 'THREAT_OR_POSTURE';
    }
    if (impulse === 'FEAR') {
        if (fin.F >= 4) return 'CALL_HELP_OR_AUTHORITY';
        return 'WITHDRAW_OR_BOUNDARY';
    }
    if (override !== 'NONE' && fin.B >= 3) return 'INTIMACY_OR_FLIRT';
    if (['Skill', 'Social'].includes(kind)) return 'SUPPORT_ACT';
    return 'PLAN_OR_BANTER';
}

export function targetsUserFromIntent(intent) {
    return ['ESCALATE_VIOLENCE', 'BOUNDARY_PHYSICAL', 'THREAT_OR_POSTURE'].includes(intent) ? 'Y' : 'N';
}

export function isImmediateAttackIntent(intent) {
    return ['ESCALATE_VIOLENCE', 'BOUNDARY_PHYSICAL', 'THREAT_OR_POSTURE'].includes(intent);
}

export function isImmediateAttackIntentForType(intent, attackType) {
    if (attackType === 'CompanionAttack') return intent === 'ESCALATE_VIOLENCE';
    if (attackType === 'ProactiveAttack') return intent === 'ESCALATE_VIOLENCE';
    if (['CounterAttack', 'Retaliation'].includes(attackType)) return isImmediateAttackIntent(intent);
    return false;
}

export function buildNarrationGuidance(resolution, handoffs, chaos, proactivity, aggression) {
    return {
        resolution: `${resolution.OutcomeTier}/${resolution.Outcome}`,
        relationshipStates: handoffs.map(h => `${h.NPC}:${h.FinalState}:${h.Behavior}`),
        chaos: chaos.CHAOS,
        proactivity,
        aggression,
        instruction: 'Narrate according to these computed outcomes. Do not expose mechanics unless the user asks OOC.',
    };
}

export function buildPersistencePolicy() {
    return {
        staticUntilExplicitChange: ['currentCoreStats.Rank', 'currentCoreStats.MainStat', 'currentCoreStats.PHY', 'currentCoreStats.MND', 'currentCoreStats.CHA'],
        npcPersistentRuleMutated: ['currentDisposition', 'currentRapport', 'lastRapportGainActiveMs', 'establishedRelationship', 'intimacyState', 'userHistory', 'raceProfile', 'personalitySummary', 'socialResolutionMemory', 'slowBondEvidence', 'proactivityMemory', 'currentCoreStats', 'hostilePressure', 'hostileLandedPressure', 'dominantLock', 'pressureMode', 'lifecycle', 'condition', 'wounds', 'statusEffects', 'gear'],
        playerPersistentRuleMutated: ['condition', 'wounds', 'statusEffects', 'gear', 'inventory', 'currency', 'tasks', 'commitments'],
        hiddenPowerActorPersistentRuleMutated: ['powerActors.name', 'powerActors.type', 'powerActors.enmity', 'powerActors.tier', 'powerActors.reasons', 'powerActors.responseHistory', 'powerActors.lastEffect'],
        perTurn: ['GOAL', 'hostilesInScene', 'ActionTargets', 'OppTargets', 'RollNeeded', 'harmMode', 'OutcomeTier', 'Outcome', 'LandedActions', 'CounterPotential', 'restraintControl', 'boundaryPressure', 'boundaryBreak', 'activeHostileThreat', 'CHAOS', 'proactivityResults', 'aggressionResults'],
    };
}

export function trackerSummary(trackerUpdate) {
    const npcs = Object.entries(trackerUpdate?.npcs || {});
    const user = trackerUpdate?.user ? normalizeTrackerUserState(trackerUpdate.user) : null;
    const powerActors = Object.entries(trackerUpdate?.powerActors || {});
    if (!npcs.length && !user && !powerActors.length) return 'N';

    const npcSummary = npcs.map(([name, value]) => {
        const disposition = value?.currentDisposition ? formatDisposition(value.currentDisposition) : 'UNINITIALIZED';
        const stats = value?.currentCoreStats
            ? `stats:${value.currentCoreStats.PHY}/${value.currentCoreStats.MND}/${value.currentCoreStats.CHA}`
            : 'stats:none';
        return [
            name,
            disposition,
            `life:${value?.lifecycle ?? 'Active'}`,
            `rapport:${value?.currentRapport ?? 0}`,
            `lastRapportGainActive:${value?.lastRapportGainActiveMs ?? -1}`,
            `intimacy:${value?.intimacyState?.boundary ?? 'NONE'}/${value?.intimacyState?.source ?? 'NONE'}`,
            `history:${value?.userHistory?.knowsUser ?? 'N'}/${value?.userHistory?.standing ?? 'neutral'}`,
            `social:${socialResolutionMemorySummary(value?.socialResolutionMemory)}`,
            `race:${value?.raceProfile?.category ?? 'unknown'}/${value?.raceProfile?.fearProfile ?? 'normal'}`,
            `personality:${value?.personalitySummary ? 'Y' : 'N'}`,
            stats,
            `cond:${value?.condition ?? 'healthy'}`,
            `wounds:${(value?.wounds || []).length}`,
            `status:${(value?.statusEffects || []).length}`,
            `gear:${(value?.gear || []).length}`,
            `pressure:${value?.hostilePressure ?? 0}/${value?.hostileLandedPressure ?? 0}/${value?.dominantLock ?? 'None'}/${value?.pressureMode ?? 'none'}`,
        ].join('/');
    }).join(';');
    const userSummary = user
        ? `USER/cond:${user.condition}/wounds:${user.wounds.length}/status:${user.statusEffects.length}/gear:${user.gear.length}/inv:${user.inventory.length}/tasks:${user.tasks.length}/commitments:${user.commitments.length}`
        : '';
    const powerActorSummary = powerActors
        .map(([name, value]) => `${name}/enmity:${value?.enmity ?? 0}/tier:${value?.tier ?? 'Unaware'}`)
        .join(';');
    return [npcSummary, userSummary, powerActorSummary].filter(Boolean).join(';');
}

const TRACKER_CONDITIONS = Object.freeze(['healthy', 'bruised', 'wounded', 'badly_wounded', 'critical', 'incapacitated', 'dead']);
export const SLOW_BOND_KEYS = Object.freeze([
    'respectfulContact',
    'cooperation',
    'comfortInProximity',
    'boundaryRespect',
    'sharedRoutine',
    'playfulness',
    'teamwork',
    'personalAttention',
]);

export function normalizeSlowBondEvidence(value) {
    const result = {};
    for (const key of SLOW_BOND_KEYS) {
        result[key] = clamp(Number(value?.[key] ?? 0), 0, 2);
    }
    result.blockers = normalizeTrackerStringList(value?.blockers).slice(0, 12);
    result.lastUpdatedScene = typeof value?.lastUpdatedScene === 'string' ? value.lastUpdatedScene.slice(0, 120) : '';
    return result;
}

export function mergeSlowBondEvidence(previous, semanticEvidence = {}, sceneKey = '') {
    const before = normalizeSlowBondEvidence(previous);
    const after = normalizeSlowBondEvidence(before);
    const changed = [];
    const sameScene = Boolean(sceneKey && before.lastUpdatedScene === sceneKey);
    if (!sameScene) {
        for (const key of SLOW_BOND_KEYS) {
            if (bool(semanticEvidence?.[key])) {
                const next = clamp((after[key] || 0) + 1, 0, 2);
                if (next !== after[key]) changed.push(key);
                after[key] = next;
            }
        }
        const blockerAdds = normalizeTrackerStringList(semanticEvidence?.blockers);
        if (blockerAdds.length) {
            const blockerSet = new Set(after.blockers.map(item => item.toLowerCase()));
            for (const blocker of blockerAdds) {
                const key = blocker.toLowerCase();
                if (!blockerSet.has(key)) {
                    after.blockers.push(blocker);
                    blockerSet.add(key);
                    changed.push(`blocker:${blocker}`);
                    if (after.blockers.length >= 12) break;
                }
            }
        }
        if (changed.length) after.lastUpdatedScene = sceneKey || after.lastUpdatedScene;
    }
    return { evidence: after, changed, sameScene };
}

export function slowBondEvidenceCount(evidence) {
    const normalized = normalizeSlowBondEvidence(evidence);
    return SLOW_BOND_KEYS.filter(key => normalized[key] > 0).length;
}

export function isSlowBondEligible(disposition, rapport, evidence) {
    const normalized = normalizeSlowBondEvidence(evidence);
    return disposition?.B === 3
        && disposition.F < 3
        && disposition.H < 3
        && Number(rapport || 0) >= 5
        && normalized.blockers.length === 0
        && slowBondEvidenceCount(normalized) >= 2;
}

export function normalizeTrackerEntry(value) {
    return {
        currentDisposition: normalizeDisposition(value?.currentDisposition),
        currentRapport: clamp(Number(value?.currentRapport ?? 0), 0, 5),
        lastRapportGainActiveMs: Number.isFinite(Number(value?.lastRapportGainActiveMs))
            ? Math.max(-1, Math.floor(Number(value.lastRapportGainActiveMs)))
            : -1,
        establishedRelationship: value?.establishedRelationship === 'Y' ? 'Y' : 'N',
        intimacyState: normalizeIntimacyState(value?.intimacyState),
        userHistory: normalizeUserHistory(value?.userHistory),
        raceProfile: normalizeNpcRaceProfile(value?.raceProfile),
        personalitySummary: normalizePersonalitySummary(value?.personalitySummary),
        socialResolutionMemory: normalizeSocialResolutionMemory(value?.socialResolutionMemory),
        slowBondEvidence: normalizeSlowBondEvidence(value?.slowBondEvidence),
        proactivityMemory: normalizeProactivityMemory(value?.proactivityMemory),
        currentCoreStats: value?.currentCoreStats ? normalizeCore(value.currentCoreStats, { PHY: 1, MND: 1, CHA: 1 }) : null,
        hostilePressure: clamp(Number(value?.hostilePressure ?? 0), 0, 20),
        hostileLandedPressure: clamp(Number(value?.hostileLandedPressure ?? 0), 0, 20),
        dominantLock: ['FEAR', 'HOSTILITY'].includes(value?.dominantLock) ? value.dominantLock : 'None',
        pressureMode: ['none', 'cornered', 'dominated'].includes(value?.pressureMode) ? value.pressureMode : 'none',
        lifecycle: normalizeLifecycle(value?.lifecycle),
        condition: normalizeTrackerCondition(value?.condition),
        wounds: normalizeTrackerStringList(value?.wounds),
        statusEffects: normalizeTrackerStringList(value?.statusEffects),
        gear: normalizeTrackerStringList(value?.gear),
    };
}

export function normalizeIntimacyState(value) {
    const source = value && typeof value === 'object' ? value : {};
    const boundary = ['ALLOW', 'DENY'].includes(source.boundary) ? source.boundary : 'NONE';
    const rawSource = cleanTrackerScalar(source.source);
    const refusalStyle = ['NONE', 'PANIC', 'HOSTILE', 'FEARFUL', 'SOFT', 'CLEAR'].includes(source.refusalStyle)
        ? source.refusalStyle
        : 'NONE';
    return {
        boundary,
        source: boundary === 'NONE' ? 'NONE' : (rawSource || 'PERSISTED'),
        refusalStyle: boundary === 'DENY' ? refusalStyle : 'NONE',
    };
}

export function normalizeUserHistory(value) {
    const source = value && typeof value === 'object' ? value : {};
    const knowsUser = source.knowsUser === 'Y' ? 'Y' : 'N';
    const standing = ['positive', 'neutral', 'negative', 'fear'].includes(source.standing) ? source.standing : 'neutral';
    return { knowsUser, standing };
}

export function normalizeNpcRaceProfile(value) {
    const source = value && typeof value === 'object' ? value : {};
    const race = cleanTrackerScalar(source.race || source.species || source.ancestry);
    const category = ['typical', 'monstrous', 'demonic', 'undead', 'eldritch', 'construct', 'unknown'].includes(source.category)
        ? source.category
        : classifyRaceCategory(race);
    const fearProfile = ['normal', 'immune', 'peer', 'superior'].includes(source.fearProfile) ? source.fearProfile : 'normal';
    return { race, category, fearProfile };
}

function cleanTrackerScalar(value) {
    const text = String(value ?? '').trim().replace(/\s+/g, ' ').replace(/^["']|["']$/g, '').trim();
    if (!text || ['(none)', 'none', 'null', 'n/a', 'unknown', 'unchanged'].includes(text.toLowerCase())) return '';
    return text.slice(0, 80);
}

const ROMANCE_MEMORY_TAGS = Object.freeze(['Thoughtful_Gift', 'Ask_Date', 'Date_And_Confess']);
const PARTNER_MEANINGFUL_TAGS = Object.freeze(['Partner_Date', 'Partner_Gift', 'Partner_Intimacy', 'Partner_Conflict']);
const PROACTIVITY_COOLDOWN_TAGS = Object.freeze(['Thoughtful_Gift', 'Ask_Date', 'Partner_Date', 'Partner_Gift', 'Partner_Private_Time', 'Partner_Conflict']);

export function normalizeProactivityMemory(value) {
    const source = value && typeof value === 'object' ? value : {};
    const cooldowns = source.cooldowns && typeof source.cooldowns === 'object' ? source.cooldowns : {};
    return {
        interchangeCount: normalizeMemoryCount(source.interchangeCount),
        romanceCycle: normalizeMemoryCount(source.romanceCycle),
        romanceBlocked: source.romanceBlocked === 'Y' ? 'Y' : 'N',
        pendingTag: normalizeMemoryTag(source.pendingTag),
        pendingSince: normalizeMemoryCount(source.pendingSince),
        acceptedTags: normalizeMemoryTagList(source.acceptedTags, ROMANCE_MEMORY_TAGS),
        refusedTags: normalizeMemoryTagList(source.refusedTags, ROMANCE_MEMORY_TAGS),
        b4Courtship: normalizeB4Courtship(source.b4Courtship),
        partnerMeaningfulCooldownUntilActiveMs: normalizeActiveMsCount(source.partnerMeaningfulCooldownUntilActiveMs),
        lastMeaningfulPartnerTag: normalizePartnerMeaningfulTag(source.lastMeaningfulPartnerTag),
        cooldowns: Object.fromEntries(PROACTIVITY_COOLDOWN_TAGS.map(tag => [
            tag,
            normalizeMemoryCount(cooldowns[tag] ?? source[tag]),
        ])),
    };
}

function normalizeMemoryCount(value) {
    return clamp(Math.floor(Number(value ?? 0) || 0), 0, 1000000);
}

function normalizeActiveMsCount(value) {
    return clamp(Math.floor(Number(value ?? 0) || 0), 0, 1000000000000);
}

function normalizeB4Courtship(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        askDateAttempts: clamp(Math.floor(Number(source.askDateAttempts ?? 0) || 0), 0, 2),
        askDateAccepted: clamp(Math.floor(Number(source.askDateAccepted ?? 0) || 0), 0, 2),
        askDateRefused: clamp(Math.floor(Number(source.askDateRefused ?? 0) || 0), 0, 2),
        askDateCooldownUntilActiveMs: normalizeActiveMsCount(source.askDateCooldownUntilActiveMs),
        thoughtfulGiftAttempts: clamp(Math.floor(Number(source.thoughtfulGiftAttempts ?? 0) || 0), 0, 1),
        thoughtfulGiftAccepted: source.thoughtfulGiftAccepted === 'Y' ? 'Y' : 'N',
        thoughtfulGiftRefused: source.thoughtfulGiftRefused === 'Y' ? 'Y' : 'N',
        dateAndConfessRefused: source.dateAndConfessRefused === 'Y' ? 'Y' : 'N',
        blocked: source.blocked === 'Y' ? 'Y' : 'N',
    };
}

function normalizeMemoryTag(value) {
    const text = String(value ?? '').trim();
    return ROMANCE_MEMORY_TAGS.includes(text) ? text : 'NONE';
}

function normalizePartnerMeaningfulTag(value) {
    const text = String(value ?? '').trim();
    if (text === 'Partner_Private_Time') return 'Partner_Date';
    return PARTNER_MEANINGFUL_TAGS.includes(text) ? text : 'NONE';
}

function normalizeMemoryTagList(value, allowed) {
    const canonical = new Map(allowed.map(item => [item.toLowerCase(), item]));
    const result = [];
    for (const item of normalizeTrackerStringList(value)) {
        const tag = canonical.get(String(item).toLowerCase());
        if (!tag || result.includes(tag)) continue;
        result.push(tag);
        if (result.length >= allowed.length) break;
    }
    return result;
}

export function normalizeTrackerUserState(value) {
    return {
        condition: normalizeTrackerCondition(value?.condition),
        wounds: normalizeTrackerStringList(value?.wounds),
        statusEffects: normalizeTrackerStringList(value?.statusEffects),
        gear: normalizeTrackerStringList(value?.gear),
        inventory: normalizeTrackerStringList(value?.inventory),
        currency: normalizeCurrencyList(value?.currency),
        tasks: normalizeTrackerStringList(value?.tasks),
        commitments: normalizeTrackerStringList(value?.commitments),
    };
}

const BOUND_COMPANION_TYPES = Object.freeze(['none', 'possession', 'shared_vessel', 'intelligent_item', 'bound_spirit', 'artifact', 'implant', 'other']);
const BOUND_COMPANION_STATUSES = Object.freeze(['unchanged', 'active', 'inactive']);
const PENDING_BOUNDARY_TYPES = Object.freeze(['none', 'restraint', 'object_access', 'space_access', 'departure', 'intimacy']);
const PENDING_BOUNDARY_STATUSES = Object.freeze(['unchanged', 'set', 'clear']);
let pendingBoundaryIdSequence = 0;

export function normalizeBoundCompanionState(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const active = bool(source.active) || normalizeBoundCompanionStatus(source.status) === 'active';
    const lastInterjectionAtActiveMs = Math.max(0, Math.floor(Number(source.lastInterjectionAtActiveMs || 0)));
    const lastInterjectionKey = cleanBoundCompanionText(source.lastInterjectionKey, 120);
    return {
        active,
        name: active ? cleanBoundCompanionText(source.name, 80) : '',
        type: active ? normalizeBoundCompanionType(source.type) : 'none',
        vessel: active ? cleanBoundCompanionText(source.vessel, 120) : '',
        voice: active ? cleanBoundCompanionText(source.voice, 220) : '',
        evidence: active ? cleanBoundCompanionText(source.evidence, 260) : '',
        hasInterjected: source.hasInterjected === true || lastInterjectionAtActiveMs > 0 || Boolean(lastInterjectionKey),
        lastInterjectionAtActiveMs,
        lastInterjectionKey,
    };
}

export function normalizeBoundCompanionDelta(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const status = normalizeBoundCompanionStatus(source.status ?? source.Status ?? (source.active === true ? 'active' : source.active === false ? 'inactive' : 'unchanged'));
    return {
        status,
        name: cleanBoundCompanionDeltaText(source.name ?? source.Name, 80),
        type: normalizeBoundCompanionDeltaType(source.type ?? source.Type),
        vessel: cleanBoundCompanionDeltaText(source.vessel ?? source.Vessel, 120),
        voice: cleanBoundCompanionDeltaText(source.voice ?? source.Voice, 220),
        evidence: cleanBoundCompanionDeltaText(source.evidence ?? source.Evidence, 260),
    };
}

export function applyBoundCompanionDelta(before = {}, delta = {}) {
    const current = normalizeBoundCompanionState(before);
    const patch = normalizeBoundCompanionDelta(delta);
    if (patch.status === 'inactive') {
        return normalizeBoundCompanionState({
            active: false,
            hasInterjected: current.hasInterjected,
            lastInterjectionAtActiveMs: current.lastInterjectionAtActiveMs,
            lastInterjectionKey: current.lastInterjectionKey,
        });
    }
    if (patch.status === 'unchanged' && !current.active) return current;
    const active = patch.status === 'active' || current.active;
    const next = {
        ...current,
        active,
        name: patch.name !== null ? patch.name : current.name,
        type: patch.type !== null ? patch.type : current.type,
        vessel: patch.vessel !== null ? patch.vessel : current.vessel,
        voice: patch.voice !== null ? patch.voice : current.voice,
        evidence: patch.evidence !== null ? patch.evidence : current.evidence,
    };
    if (!next.active) return normalizeBoundCompanionState(next);
    if (!next.type || next.type === 'none') next.type = 'other';
    return normalizeBoundCompanionState(next);
}

export function boundCompanionDeltaHasChanges(value = {}) {
    const delta = normalizeBoundCompanionDelta(value);
    return delta.status !== 'unchanged'
        || delta.name !== null
        || delta.type !== null
        || delta.vessel !== null
        || delta.voice !== null
        || delta.evidence !== null;
}

export function normalizePendingBoundaryState(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const active = bool(source.active) || normalizePendingBoundaryStatus(source.status) === 'set';
    const targetNPC = active ? cleanPendingBoundaryText(source.targetNPC ?? source.TargetNPC, 100) : '';
    const type = active ? normalizePendingBoundaryType(source.type ?? source.Type) : 'none';
    const objectOrAccess = active ? cleanPendingBoundaryText(source.objectOrAccess ?? source.ObjectOrAccess, 140) : '';
    const evidence = active ? cleanPendingBoundaryText(source.evidence ?? source.Evidence, 260) : '';
    const boundaryId = active ? cleanPendingBoundaryText(source.boundaryId ?? source.BoundaryId, 100) : '';
    return {
        active,
        boundaryId: active
            ? boundaryId || createLegacyPendingBoundaryId({ targetNPC, type, objectOrAccess, evidence })
            : '',
        targetNPC,
        type,
        objectOrAccess,
        evidence,
        warnings: active ? clamp(Math.floor(Number(source.warnings ?? source.Warnings ?? 1)), 1, 5) : 0,
    };
}

export function normalizePendingBoundaryDelta(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        status: normalizePendingBoundaryStatus(source.status ?? source.Status),
        boundaryId: cleanPendingBoundaryDeltaText(source.boundaryId ?? source.BoundaryId, 100),
        targetNPC: cleanPendingBoundaryDeltaText(source.targetNPC ?? source.TargetNPC, 100),
        type: normalizePendingBoundaryDeltaType(source.type ?? source.Type),
        objectOrAccess: cleanPendingBoundaryDeltaText(source.objectOrAccess ?? source.ObjectOrAccess, 140),
        evidence: cleanPendingBoundaryDeltaText(source.evidence ?? source.Evidence, 260),
    };
}

export function applyPendingBoundaryDelta(before = {}, delta = {}) {
    const current = normalizePendingBoundaryState(before);
    const patch = normalizePendingBoundaryDelta(delta);
    if (patch.status === 'clear') {
        if (!current.active) return current;
        if (!patch.boundaryId || patch.boundaryId !== current.boundaryId) {
            warnRejectedPendingBoundaryDelta('clear did not copy the active boundaryId', current, patch);
            return current;
        }
        return normalizePendingBoundaryState({ active: false });
    }
    if (patch.status !== 'set') return current;

    const targetNPC = patch.targetNPC || '';
    const type = patch.type || 'none';
    const objectOrAccess = patch.objectOrAccess || current.objectOrAccess;
    if (!targetNPC || type === 'none' || !patch.evidence) {
        warnRejectedPendingBoundaryDelta('set requires targetNPC, a non-none type, and evidence', current, patch);
        return current;
    }
    const sameBoundary = current.active
        && sameName(current.targetNPC, targetNPC)
        && normalizePendingBoundaryType(current.type) === normalizePendingBoundaryType(type)
        && samePendingBoundaryObject(current.objectOrAccess, objectOrAccess);
    if (sameBoundary) {
        if (!patch.boundaryId || patch.boundaryId !== current.boundaryId) {
            warnRejectedPendingBoundaryDelta('renewal did not copy the active boundaryId', current, patch);
            return current;
        }
        return normalizePendingBoundaryState({
            ...current,
            objectOrAccess,
            evidence: patch.evidence,
            warnings: current.warnings + 1,
        });
    }
    return normalizePendingBoundaryState({
        active: true,
        boundaryId: createPendingBoundaryId(),
        targetNPC,
        type,
        objectOrAccess: patch.objectOrAccess || '',
        evidence: patch.evidence,
        warnings: 1,
    });
}

export function pendingBoundaryDeltaHasChanges(value = {}) {
    const delta = normalizePendingBoundaryDelta(value);
    return delta.status !== 'unchanged'
        || delta.boundaryId !== null
        || delta.targetNPC !== null
        || delta.type !== null
        || delta.objectOrAccess !== null
        || delta.evidence !== null;
}

function normalizeBoundCompanionStatus(value) {
    const text = String(value ?? 'unchanged').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (['y', 'yes', 'true', 'active', 'activated', 'established'].includes(text)) return 'active';
    if (['n', 'no', 'false', 'inactive', 'absent', 'removed', 'dismissed', 'severed', 'none'].includes(text)) return 'inactive';
    return BOUND_COMPANION_STATUSES.includes(text) ? text : 'unchanged';
}

function normalizePendingBoundaryStatus(value) {
    const text = String(value ?? 'unchanged').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (['y', 'yes', 'true', 'active', 'set', 'open', 'pending'].includes(text)) return 'set';
    if (['n', 'no', 'false', 'inactive', 'absent', 'clear', 'cleared', 'closed', 'resolved', 'none'].includes(text)) return 'clear';
    return PENDING_BOUNDARY_STATUSES.includes(text) ? text : 'unchanged';
}

function normalizePendingBoundaryType(value) {
    const text = String(value ?? 'none').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (['object', 'item', 'item_access', 'possession', 'inventory'].includes(text)) return 'object_access';
    if (['space', 'access', 'entry', 'door', 'doorway'].includes(text)) return 'space_access';
    if (['leave', 'leaving', 'exit'].includes(text)) return 'departure';
    if (['physical_restraint', 'grapple', 'pin', 'hold'].includes(text)) return 'restraint';
    return PENDING_BOUNDARY_TYPES.includes(text) ? text : 'none';
}

function normalizePendingBoundaryDeltaType(value) {
    const text = cleanPendingBoundaryDeltaText(value, 80);
    if (text === null) return null;
    const normalized = normalizePendingBoundaryType(text);
    return normalized === 'none' ? null : normalized;
}

function normalizeBoundCompanionType(value) {
    const text = String(value ?? 'none').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (text === 'sentient_item' || text === 'sentient_weapon' || text === 'intelligent_weapon') return 'intelligent_item';
    if (text === 'spirit' || text === 'bound_entity') return 'bound_spirit';
    if (text === 'shared_body') return 'shared_vessel';
    return BOUND_COMPANION_TYPES.includes(text) ? text : 'other';
}

function normalizeBoundCompanionDeltaType(value) {
    const text = cleanBoundCompanionDeltaText(value, 80);
    if (text === null) return null;
    const normalized = normalizeBoundCompanionType(text);
    return normalized === 'none' ? null : normalized;
}

function cleanBoundCompanionText(value, maxLength) {
    const text = String(value ?? '')
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text || ['(none)', 'none', 'null', 'n/a', 'unknown', 'unchanged'].includes(text.toLowerCase())) return '';
    return text.slice(0, maxLength);
}

function cleanBoundCompanionDeltaText(value, maxLength) {
    const text = cleanBoundCompanionText(value, maxLength);
    return text || null;
}

function cleanPendingBoundaryText(value, maxLength) {
    const text = String(value ?? '')
        .trim()
        .replace(/^["']|["']$/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    if (!text || ['(none)', 'none', 'null', 'n/a', 'unknown', 'unchanged'].includes(text.toLowerCase())) return '';
    return text.slice(0, maxLength);
}

function cleanPendingBoundaryDeltaText(value, maxLength) {
    const text = cleanPendingBoundaryText(value, maxLength);
    return text || null;
}

function samePendingBoundaryObject(a, b) {
    const left = cleanPendingBoundaryText(a, 140).toLowerCase();
    const right = cleanPendingBoundaryText(b, 140).toLowerCase();
    if (!left || !right) return true;
    return left === right;
}

function createPendingBoundaryId() {
    pendingBoundaryIdSequence = (pendingBoundaryIdSequence + 1) % Number.MAX_SAFE_INTEGER;
    return `pb_${Date.now().toString(36)}_${pendingBoundaryIdSequence.toString(36)}`;
}

function createLegacyPendingBoundaryId(value = {}) {
    const seed = [value.targetNPC, value.type, value.objectOrAccess, value.evidence]
        .map(part => String(part || '').trim().toLowerCase())
        .join('|');
    let hash = 2166136261;
    for (let index = 0; index < seed.length; index += 1) {
        hash ^= seed.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return `pb_legacy_${(hash >>> 0).toString(36)}`;
}

function warnRejectedPendingBoundaryDelta(reason, current, patch) {
    console.warn('[Story Engine] rejected pending-boundary delta:', reason, {
        activeBoundaryId: current?.boundaryId || '(none)',
        suppliedBoundaryId: patch?.boundaryId || '(none)',
        targetNPC: patch?.targetNPC || '(none)',
        type: patch?.type || 'none',
    });
}

export function normalizeTrackerCondition(value) {
    const text = String(value ?? 'healthy').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (text === 'defeated') return 'incapacitated';
    return TRACKER_CONDITIONS.includes(text) ? text : 'healthy';
}

export function normalizeTrackerStringList(value) {
    const source = Array.isArray(value)
        ? value
        : String(value ?? '')
            .split(/[;\n]/)
            .flatMap(part => part.split(/,(?=\s*[^,]{1,80}$)/));
    const result = [];
    const seen = new Set();
    for (const item of source) {
        const text = String(item ?? '')
            .trim()
            .replace(/^\[/, '')
            .replace(/\]$/, '')
            .replace(/^["']|["']$/g, '')
            .trim();
        if (!text || ['(none)', 'none', 'null', 'n/a', 'unchanged'].includes(text.toLowerCase())) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        result.push(text.slice(0, 140));
    }
    return result.slice(-40);
}

export function normalizePersonalitySummary(value) {
    const text = String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^["']|["']$/g, '')
        .trim();
    if (!text || ['(none)', 'none', 'null', 'n/a', 'unknown', 'unchanged'].includes(text.toLowerCase())) return '';
    return text.slice(0, 320);
}

export function normalizeLifecycle(value) {
    if (value === 'Dead' || value === 'Retired') return value;
    return 'Active';
}

export function normalizeDisposition(value) {
    if (!value) return null;
    if (typeof value === 'string') {
        const match = value.match(/B(\d+)\/F(\d+)\/H(\d+)/i);
        if (match) return enforceDispositionInvariants({ B: Number(match[1]), F: Number(match[2]), H: Number(match[3]) });
    }
    if (typeof value === 'object' && value.B && value.F && value.H) {
        return enforceDispositionInvariants(value);
    }
    return null;
}

export function normalizeTargets(value) {
    return {
        hostilesInScene: {
            NPC: toRealArray(value?.hostilesInScene?.NPC),
        },
        ActionTargets: toRealArray(value?.ActionTargets),
        OppTargets: {
            NPC: toRealArray(value?.OppTargets?.NPC),
            ENV: toRealArray(value?.OppTargets?.ENV),
        },
        BenefitedObservers: toRealArray(value?.BenefitedObservers),
        HarmedObservers: toRealArray(value?.HarmedObservers),
        NPCAwareOfUser: toRealArray(value?.NPCAwareOfUser),
        PowerActors: toRealArray(value?.PowerActors),
    };
}

export function sanitizeTargets(targets, classifier, options = {}) {
    const hostilesNpc = [];
    const actionTargets = [];
    const oppNpc = [];
    const oppEnv = [...targets.OppTargets.ENV];
    const benefitedCandidates = [];
    const harmedCandidates = [];
    const awareCandidates = [];

    for (const name of targets.hostilesInScene?.NPC || []) {
        if (classifier.isLiving(name)) hostilesNpc.push(name);
    }
    for (const name of targets.ActionTargets) {
        if (classifier.isLiving(name)) actionTargets.push(name);
        else oppEnv.push(name);
    }
    for (const name of targets.OppTargets.NPC) {
        if (classifier.isLiving(name)) {
            if (options.rollNeeded === 'N') actionTargets.push(name);
            else oppNpc.push(name);
        }
        else oppEnv.push(name);
    }
    for (const name of targets.BenefitedObservers) {
        if (classifier.isLiving(name)) benefitedCandidates.push(name);
        else oppEnv.push(name);
    }
    for (const name of targets.HarmedObservers) {
        if (classifier.isLiving(name)) harmedCandidates.push(name);
        else oppEnv.push(name);
    }
    for (const name of targets.NPCAwareOfUser) {
        if (classifier.isLiving(name)) awareCandidates.push(name);
        else oppEnv.push(name);
    }

    const directOrOpposed = new Set([...actionTargets, ...oppNpc].map(normalizeNameKey));
    const benefited = benefitedCandidates.filter(name => !directOrOpposed.has(normalizeNameKey(name)));
    const harmed = harmedCandidates.filter(name => !directOrOpposed.has(normalizeNameKey(name)));
    const alreadyRouted = new Set([...actionTargets, ...oppNpc, ...benefited, ...harmed].map(normalizeNameKey));
    const aware = awareCandidates.filter(name => !alreadyRouted.has(normalizeNameKey(name)));

    return {
        hostilesInScene: {
            NPC: unique(hostilesNpc),
        },
        ActionTargets: unique(actionTargets),
        OppTargets: {
            NPC: unique(oppNpc),
            ENV: unique(oppEnv.filter(isReal)),
        },
        BenefitedObservers: unique(benefited),
        HarmedObservers: unique(harmed),
        NPCAwareOfUser: unique(aware),
        PowerActors: unique(targets.PowerActors),
    };
}

export function sameTargets(a, b) {
    return JSON.stringify(targetSummary(a)) === JSON.stringify(targetSummary(b));
}

export function targetSummary(targets) {
    return {
        hostilesInScene: {
            NPC: showNone(targets.hostilesInScene?.NPC),
        },
        ActionTargets: showNone(targets.ActionTargets),
        OppTargets: {
            NPC: showNone(targets.OppTargets?.NPC),
            ENV: showNone(targets.OppTargets?.ENV),
        },
        BenefitedObservers: showNone(targets.BenefitedObservers),
        HarmedObservers: showNone(targets.HarmedObservers),
        NPCAwareOfUser: showNone(targets.NPCAwareOfUser),
        PowerActors: showNone(targets.PowerActors),
    };
}

export function normalizeNameKey(name) {
    const text = String(name ?? '').trim().toLowerCase();
    return isReal(text) ? text : '';
}

export function normalizeActionMarkers(markers) {
    if (!Array.isArray(markers) || markers.length === 0) return ['a1'];
    return markers.slice(0, 3).map((_, index) => `a${index + 1}`);
}

export function normalizeCore(value, fallback) {
    return {
        Rank: normalizeRank(value?.Rank ?? fallback.Rank),
        MainStat: normalizeMainStat(value?.MainStat ?? fallback.MainStat),
        PHY: clamp(Number(value?.PHY ?? fallback.PHY), 1, 14),
        MND: clamp(Number(value?.MND ?? fallback.MND), 1, 14),
        CHA: clamp(Number(value?.CHA ?? fallback.CHA), 1, 14),
    };
}

export function getUserCoreStats(ledger) {
    return normalizeCore(ledger?.engineContext?.userCoreStats, { Rank: 'none', MainStat: 'none', PHY: 1, MND: 1, CHA: 1 });
}

export function normalizeRank(value) {
    return ['Weak', 'Average', 'Trained', 'Elite', 'Boss', 'none'].includes(value) ? value : 'none';
}

export function normalizeMainStat(value) {
    return ['PHY', 'MND', 'CHA', 'Balanced', 'none'].includes(value) ? value : 'none';
}

export function statValue(core, stat) {
    return normalizeCore(core, { PHY: 1, MND: 1, CHA: 1 })[stat] || 1;
}

export function normalizeChallengeType(value, rollNeeded = 'Y') {
    const text = String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
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
    const type = map[text] || 'none';
    return yn(rollNeeded) === 'N' ? 'none' : type;
}

export function normalizeSocialTactic(value, challengeType = 'none') {
    if (challengeType !== 'social') return 'none';
    const text = String(value ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
    const map = {
        none: 'none',
        diplomacy: 'diplomacy',
        persuade: 'diplomacy',
        persuasion: 'diplomacy',
        negotiation: 'diplomacy',
        negotiate: 'diplomacy',
        bargain: 'diplomacy',
        request: 'diplomacy',
        reassure: 'diplomacy',
        reassurance: 'diplomacy',
        bluff: 'bluff',
        deception: 'bluff',
        deceive: 'bluff',
        lie: 'bluff',
        lying: 'bluff',
        misleading: 'bluff',
        mislead: 'bluff',
        trick: 'bluff',
        intimidate: 'intimidate',
        intimidation: 'intimidate',
        threat: 'intimidate',
        threaten: 'intimidate',
        coercion: 'intimidate',
        coerce: 'intimidate',
        blackmail: 'intimidate',
    };
    return map[text] && map[text] !== 'none' ? map[text] : 'diplomacy';
}

export function deterministicStatsForChallenge(challengeType, socialTactic = 'none') {
    if (challengeType === 'social') {
        return socialTactic === 'diplomacy'
            ? { userStat: 'CHA', oppStat: 'CHA' }
            : { userStat: 'CHA', oppStat: 'MND' };
    }
    if (challengeType === 'supernatural_combat') return { userStat: 'MND', oppStat: 'PHY' };
    if (challengeType === 'mundane_combat') return { userStat: 'PHY', oppStat: 'PHY' };
    if (challengeType === 'restraint') return { userStat: 'PHY', oppStat: 'PHY' };
    if (challengeType === 'stealth') return { userStat: 'PHY', oppStat: 'MND' };
    if (challengeType === 'environment') {
        return { userStat: 'PHY', oppStat: 'ENV' };
    }
    return { userStat: null, oppStat: 'ENV' };
}

export function dispositionMemoryKey(disposition) {
    const fin = normalizeDisposition(disposition);
    return fin ? formatDisposition(fin) : 'UNINITIALIZED';
}

export function normalizeSocialResolutionMemory(value) {
    const source = value && typeof value === 'object' ? value : {};
    return {
        Bluff: normalizeSocialResolutionMemoryEntry(source.Bluff ?? source.bluff),
        Intimidate: normalizeSocialResolutionMemoryEntry(source.Intimidate ?? source.intimidate),
    };
}

function normalizeSocialResolutionMemoryEntry(value) {
    const source = value && typeof value === 'object' ? value : {};
    const rawOutcome = String(source.outcome ?? source.Outcome ?? 'none').trim().toLowerCase();
    const outcome = ['success', 'failure'].includes(rawOutcome) ? rawOutcome : 'none';
    const resolved = source.resolved === 'Y' || source.resolved === true || outcome !== 'none' ? 'Y' : 'N';
    const disposition = cleanTrackerScalar(source.disposition ?? source.Disposition ?? source.dispositionKey ?? source.DispositionKey);
    const goal = cleanTrackerScalar(source.goal ?? source.Goal);
    return {
        resolved,
        outcome: resolved === 'Y' ? outcome : 'none',
        disposition: disposition || 'UNINITIALIZED',
        goal: goal || '',
    };
}

function socialResolutionMemorySummary(value) {
    const memory = normalizeSocialResolutionMemory(value);
    return ['Bluff', 'Intimidate']
        .filter(bucket => memory[bucket].resolved === 'Y')
        .map(bucket => `${bucket}:${memory[bucket].outcome}@${memory[bucket].disposition}`)
        .join('|') || 'none';
}

export function parseFinalState(value) {
    return normalizeDisposition(value) || { B: 2, F: 2, H: 2 };
}

export function deriveLock(fin) {
    if (fin.F === 4) return 'TERROR';
    if (fin.H === 4) return 'HATRED';
    if (fin.F === 3 || fin.H === 3) return 'FREEZE';
    return 'None';
}

export function landedBool(value) {
    return Number(value) > 0;
}

export function includesName(list, name) {
    return toRealArray(list).some(x => String(x).toLowerCase() === String(name).toLowerCase());
}

export function sameName(a, b) {
    return String(a || '').trim().toLowerCase() === String(b || '').trim().toLowerCase();
}

export function toRealArray(value) {
    if (!Array.isArray(value)) return [];
    return value.map(x => String(x).trim()).filter(isReal);
}

export function showNone(value) {
    const array = Array.isArray(value) ? value.filter(isReal) : [];
    return array.length ? array : [NONE];
}

export function firstReal(value) {
    return toRealArray(value)[0] || null;
}

export function isReal(value) {
    const text = String(value ?? '').trim();
    return text && text !== NONE && text.toLowerCase() !== 'none' && text.toLowerCase() !== 'null';
}

export function bool(value) {
    return value === true || value === 'Y' || value === 'y' || value === 'true';
}

export function yn(value) {
    return bool(value) ? 'Y' : 'N';
}

export function unique(values) {
    return [...new Set(values)];
}

export function clamp(value, min, max) {
    if (!Number.isFinite(value)) return min;
    return Math.max(min, Math.min(max, value));
}

export function formatTargets(targets) {
    return compact({
        hostilesInScene: { NPC: showNone(targets.hostilesInScene?.NPC) },
        ActionTargets: showNone(targets.ActionTargets),
        OppTargets: { NPC: showNone(targets.OppTargets.NPC), ENV: showNone(targets.OppTargets.ENV) },
        BenefitedObservers: showNone(targets.BenefitedObservers),
        HarmedObservers: showNone(targets.HarmedObservers),
        NPCAwareOfUser: showNone(targets.NPCAwareOfUser),
        PowerActors: showNone(targets.PowerActors),
    });
}

export function formatDisposition(disposition) {
    return `B${disposition.B}/F${disposition.F}/H${disposition.H}`;
}

export function compact(value) {
    return JSON.stringify(value);
}

export function snippet(value, maxLength = 180) {
    const text = String(value ?? '').replace(/\s+/g, ' ').trim();
    return text.length <= maxLength ? text : `${text.slice(0, maxLength)}...`;
}

export function stableStringify(value) {
    return JSON.stringify(value, null, 2);
}
