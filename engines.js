export const ENGINE_PROMPT_TEXT = String.raw`[STRUCTURED_PREFLIGHT_ENGINE_EXTENSION v0.1 - SOURCE: EXTENSION ONLY]

function ResolutionEngine(input) {
  const DEF = Object.freeze({
    UNIVERSAL:
'EXPLICIT-ONLY. MUST be stated in Character Card / Lore / Scene text / tracker. NO invention. Uncertain = N or default. FIRST-YES-WINS = first matching explicit rule becomes final. No reconsideration. NEVER invent stats, targets, actions, obstacles, or outcomes. MAX 3 ACTIONS. TIE = STALEMATE / STRUGGLE. ROLLS = 1d20 + relevant stat vs opposing 1d20 + relevant stat, or vs Environment 1d20 + environmentDifficulty.',
    STATS:
'PHY = challenges that require physical effort, strength, agility, speed, coordination, endurance, stealth movement, combat skill, or bodily execution under risk. MND = challenges that require thought, memory, perception, focus, reasoning, knowledge, awareness, will, or deliberate mental/supernatural exertion. CHA = social challenges that require persuasion, deception, intimidation, negotiation, emotional influence, personal presence, or interpersonal skill. Map the stat from finalGoal or explicit challenge that carries stakes, not from incidental gestures, flavor, delivery method, or setup. Core stat scale is 1 to 10.',
    STAKES:
'Stakes are meaningful possible consequences tied to success or failure. Stakes include physical risk, harm, danger, detection, material gain or loss, significant social status/authority/trust shift, loss of autonomy or physical freedom, hostile restraint/immobilization/confinement, meaningful obstacle resolution or failure, or explicit finalGoal advancement or failure for {{user}} or a specific living entity. Minor mood, flavor, casual rudeness, weak preference, or trivial convenience alone is not stakes. If success or failure would not materially change the outcome, no roll is needed.'
  });

  identifyGoal(input):
    policy: LOCKED, EXPLICIT-ONLY, FIRST-YES-WINS
    finalGoal: return a short, plain description of {{user}}'s finalGoal/intent in the last input
    rule: ignore setup, movement, intermediary steps, and post-action flavor unless they are themselves separate consequential actions
    rule: romantic, flirtatious, affectionate, suggestive, sexual, or intimate talk/contact is not a special roll category by itself. Describe the finalGoal plainly without using an intimacy gate label.
    rule: asking permission, flirting, teasing, reciprocating NPC-initiated flirtation, declarations of love, kisses, embraces, or intimate proposals are ordinary social/scene actions unless the current user input also contains explicit coercion, force, threat, pressure after refusal, or boundary violation.
    rule: otherwise return finalGoal

  identifyChallenge(input, finalGoal, context):
    policy: LOCKED, EXPLICIT-ONLY, FIRST-YES-WINS
    rule: return the decisive action, challenge, or explicit attack sequence within {{user}}'s input that carries risk, uncertainty, resistance, or stakes for {{user}}'s finalGoal
    rule: this is the decisive action, challenge, or explicit attack sequence that determines whether {{user}}'s finalGoal succeeds or fails
    rule: copy the concrete action or challenge from {{user}}'s input when possible
    rule: ignore incidental gestures, flavor, delivery method, setup, movement, or positioning unless that act itself carries stakes or resistance
    rule: if no distinct stakes-bearing challenge exists, return finalGoal

  classifyHostilePhysicalIntent(input, finalGoal, targets):
    policy: LOCKED, EXPLICIT-ONLY, FIRST-YES-WINS
    rule: return true only if {{user}} explicitly uses direct physical aggression against a living entity's body: attack, assault, strike, shove, tackle, choke, cut, stab, injure, twist/hurt/crush a grabbed body part, violent restraint, pin, immobilization, dragging/forced movement, physical domination, blocking escape with bodily force, preventing casting/action with bodily force, or other harmful bodily control
    rule: a grab/catch/hold is hostilePhysicalIntent only when it explicitly includes harm, attack, violent restraint, pinning, dragging, forced movement, twisting/crushing, choking, domination, or preventing bodily action by force
    rule: return false for grabbing/catching/holding an NPC's wrist, arm, shoulder, sleeve, cloak, or clothing only to stop/delay/get attention/block departure/contest immediate movement, unless explicit harm, attack, violent restraint, pinning, dragging, forced movement, twisting/crushing, choking, domination, or bodily injury is also stated
    rule: return false for taking, grabbing, pulling, snatching, opening, moving, or contesting an object/possession/space/access point, even when an NPC opposes it, unless {{user}} also attacks, harms, violently restrains, pins, shoves, drags, or controls the NPC's body
    rule: return false for consensual/helpful touch, healing, examination, rescue, ordinary movement, environmental force, social pressure, or purely mental/social/magical actions with no explicit physical force by {{user}}'s body

  classifyPhysicalBoundaryPressure(input, finalGoal, targets):
    policy: LOCKED, EXPLICIT-ONLY, FIRST-YES-WINS
    rule: return true only if {{user}} uses forceful physical action to contest an NPC's possession, guarded object, immediate personal space, path, access, departure, or body-adjacent boundary while that living NPC has stakes and opposes/resists
    rule: examples include snatching a scroll from under an NPC's hand, taking a guarded purse, forcing past a guard through a doorway, wrenching an object away, pushing into a protected space, or catching/holding an NPC's wrist/arm/sleeve only to stop them leaving or force attention
    rule: return false if classifyHostilePhysicalIntent=true
    rule: return false for casual proximity, ordinary movement, normal item handling, conversation, non-forceful requests, pure social pressure, or any no-stakes action
    rule: this is not combat and must not produce multi-action LandedActions, CounterPotential, or H4 by itself

  activeHostileThreat(input, finalGoal, targets, context):
    policy: LOCKED, EXPLICIT-ONLY, FIRST-YES-WINS
    rule: return Y only if the current scene contains an immediate hostile danger from an NPC/entity: attacking, charging, preparing to attack, pursuing, ambushing, threatening violence, monster/hostile creature engagement, armed standoff, capture attempt, or imminent physical/supernatural harm
    rule: return N for negotiation, refusal, bargaining, argument, social resistance, authority denial, suspicion, rivalry, nonviolent obstruction, or ordinary OppTargets.NPC without immediate danger

  intimacyAdvanceExplicit(input, finalGoal, challenge, targets, context):
    policy: LOCKED, EXPLICIT-ONLY, FIRST-YES-WINS
    rule: return Y only if {{user}} explicitly attempts, requests, accepts, or reciprocates actual intimate escalation with a specific NPC: kissing, making out, sexual touch, undressing toward intimacy, asking to sleep together, asking for sex, moving to bed, or clearly initiating romantic/sexual physical closeness.
    rule: return Y for accepting or reciprocating a prior explicit NPC-initiated intimacy invitation or action.
    rule: return N for flirting, teasing, compliments, romantic banter, suggestive jokes, vague innuendo, "what did you have in mind", declarations of love, asking for a date, emotional confession, hand-holding, casual proximity, or ordinary affection that does not clearly escalate into kissing or sexual/intimate contact.
    rule: this field is only an intimacy permission/boundary signal. It does not create stakes, rolls, landed actions, Bond loss, Fear, or Hostility by itself.
    else -> N

  nonLethal(input, finalGoal, challenge, targets, context):
    policy: LOCKED, EXPLICIT-ONLY, FIRST-YES-WINS
    rule: return Y only for explicitly nonlethal violence or contests: sparring, training, practice combat, fistfights, barehanded brawls, wrestling/grappling without lethal force, restraint-only takedowns, capture-only attempts, or stated intent to avoid serious/fatal harm
    rule: return Y when the scene rules, instructor, arena, duel terms, or {{user}} explicitly frame the current physical conflict as nonlethal
    rule: return N for weapons, blades, arrows, spears, axes, clubs, improvised weapons, claws, teeth, horns, natural weapons, lethal magic, body-damaging supernatural effects, or any attack not explicitly framed as nonlethal
    rule: uncertain = N
    else -> N

  identifyTargets(input, challenge, finalGoal, context):
    policy: LOCKED, EXPLICIT-ONLY
    hostilesInScene.NPC = ALL established, present, living hostile entities in the current scene, whether or not they directly oppose {{user}}'s current action
    ActionTargets = LIVING entities {{user}} directly tries to affect as the main resolution target
    OppTargets.NPC = LIVING entities whose stakes are at risk and who actively or passively oppose, contest, or resist {{user}}'s current action
    OppTargets.ENV = NON-LIVING environmental or terrain feature, hazard, object, or other obstacle directly obstructing {{user}}'s actions
    BenefitedObservers = THIRD-PARTY LIVING entities present in scene, not ActionTargets and not OppTargets.NPC, whose stakes materially improve as a result of {{user}}'s actions, as per DEF.STAKES. Protective/rescue contact with an ally, shielding them, pulling/pushing them out of danger, or standing between them and harm makes them BenefitedObservers when {{user}} is not contesting their will, harming them, restraining them, or making them the main opposed challenge. Example: {{user}} pushes a woman out of danger and stands between her and a harasser. Harasser = ActionTargets and OppTargets.NPC; woman = BenefitedObservers.
    HarmedObservers = THIRD-PARTY LIVING entities present in scene, not ActionTargets and not OppTargets.NPC, whose stakes materially worsen as a result of {{user}}'s actions, as per DEF.STAKES. This requires an explicit material stake, relationship, duty, protection role, authority role, or similar; mere witnessing alone is not enough. Example: {{user}} hurts an NPC while that NPC's father witnesses it. Hurt NPC = ActionTargets and OppTargets.NPC; witnessing father = HarmedObservers.
    rule: identify hostilesInScene.NPC before OppTargets.NPC; then identify which of those, if any, directly oppose {{user}}'s current action
    rule: hostilesInScene.NPC is a scene-level hostile pool only; it does not create relationship changes, rolls, NPCInScene entries, or OppTargets.NPC by itself
    rule: hostilesInScene.NPC may include hostile enemies threatening {{user}}, companions, protected NPCs, bystanders, or the scene generally, as long as they are established and present
    rule: hostilesInScene.NPC must be established by assistant narration, tracker, character/scenario/lore context, or initial test setup; do not create a hostile from the latest user input alone
    rule: hostilesInScene.NPC excludes neutral/friendly NPCs, absent/offscreen entities, defeated/incapacitated entities no longer posing danger, and non-living hazards or obstacles
    rule: if hasStakes=N, OppTargets.NPC must be [(none)]
    rule: a direct ActionTarget can also be OppTargets.NPC only when that target's stakes are meaningfully contested or resisted
    rule: protective/rescue movement of an ally does not make that ally ActionTargets unless {{user}} contests their will, harms them, restrains them, or makes them the main opposed challenge
    rule: ActionTargets, OppTargets.NPC, BenefitedObservers, and HarmedObservers are mutually exclusive observer categories except that direct ActionTargets may also be OppTargets.NPC when they are the resisting/opposing party
    rule: if any target list is not present, return [(none)]
    return {hostilesInScene, ActionTargets, OppTargets, BenefitedObservers, HarmedObservers}

  boundaryViolationExplicit(input, finalGoal, challenge, targets, context):
    policy: LOCKED, EXPLICIT-ONLY, FIRST-YES-WINS
    rule: return Y only if the current user input explicitly violates, ignores, or pressures past a clear refusal, stated boundary, withdrawal, fear, incapacitation, explicitly established lack of consent, or prior denial from this specific NPC.
    rule: return Y for coercion, threats, force, unwanted restraint/contact after refusal, repeated pressure after refusal, humiliation, blackmail, or ignoring a clear stop/no.
    rule: return N for flirting, teasing, romantic talk, asking permission, accepting or reciprocating NPC-initiated flirtation/intimacy, or backing off/respecting a boundary.
    rule: return N when consent/refusal is merely uncertain, unstated, or left to ordinary scene interpretation. Do not turn ordinary flirting, teasing, kissing, embracing, or romantic/sexual proposals into mechanics without an explicit boundary violation.
    else -> N

  hasStakes(input, finalGoal, challenge, targets, boundaryViolationExplicit, context):
    policy: LOCKED, EXPLICIT-ONLY
    rule: romantic, flirtatious, affectionate, suggestive, sexual, or intimate conversation/proposals/contact are not stakes by themselves.
    rule: if boundaryViolationExplicit=Y, evaluate stakes normally under DEF.STAKES; boundary violation usually affects autonomy, trust, safety, or social standing.
    rule: return Y if success or failure of finalGoal or explicit challenge could affect {{user}} or NPC's stakes, as per DEF.STAKES
    else -> N

  actionCount(input, challenge):
    policy: LOCKED, EXPLICIT-ONLY, MAX 3 ACTIONS
    rule: every resolved action has at least one action marker
    rule: non-combat actions return exactly one action marker: [a1]
    rule: combat sequences may return up to three action markers
    rule: do not count setup, movement, repositioning, defense, recovery, or non-attack flavor as additional actions
    rule: each individual combat attack/effect within a sequence counts as one action, including physical attacks, spells, status effects, or mixed sequences
    rule: return one action marker per attack: [a1], [a1,a2], or [a1,a2,a3]

  mapStats(input, finalGoal, challenge, targets, context):
    policy: LOCKED, EXPLICIT-ONLY, FIRST-YES-WINS
    rule: determine USER stat by applying DEF.STATS to identifyChallenge when identifyChallenge is distinct from finalGoal
    rule: use finalGoal only if no distinct stakes-bearing challenge exists
    rule: if finalGoal relies heavily on a specific enabling action (e.g., a physical feat to intimidate, or clearing an obstacle to dodge), determine USER stat based strictly on that enabling challenge
    rule: if {{user}} uses deliberate mental/supernatural exertion to affect a living target's bodily functions or physical state (paralysis, poison, blindness, forced sleep, pain, muscle lock, disease, transmutation, bodily binding), USER=MND and OPP=PHY
    rule: if magic or a substance creates a non-living environmental hazard/obstacle instead of directly contesting a living target, put the hazard/obstacle in OppTargets.ENV and use OPP=ENV unless a living target explicitly resists the effect
    rule: if explicit means is positive social interaction such as persuasion, negotiation, diplomacy, bargaining, reconciliation, reassurance, or good-faith appeal against a living opposing target, USER=CHA and OPP=CHA
    rule: if explicit means is negative social interaction such as bluff, deception, intimidation, coercion, threat, blackmail, manipulation, interrogation, humiliation, or forced submission against a living opposing target, USER=CHA and OPP=MND
    rule: if OppTargets.NPC contains an opposing entity, determine opposing stat by applying DEF.STATS to that first OppTargets.NPC entity's resistance to {{user}}'s explicit means or finalGoal
    rule: OPP=ENV is valid only for NON-LIVING opposition in OppTargets.ENV
    rule: if a living ActionTarget is the stakes-bearing resisting/contested target, include that target in OppTargets.NPC and use a living opposing stat, never ENV
    rule: if OppTargets.NPC=[(none)] and OppTargets.ENV contains an obstacle, OPP=ENV
    return {USER, OPP}

  environmentDifficulty(stats, targets, context):
    policy: LOCKED, EXPLICIT-ONLY
    rule: applies only when stats.OPP=ENV and OppTargets.ENV contains a real non-living obstacle, hazard, terrain feature, object, ward, weather condition, or environmental pressure
    rule: 0 = easy/trivial/routine/weak/lightly obstructed; if no real stakes exist, use STAKES=N instead of a roll
    rule: 4 = average meaningful obstacle a capable person could plausibly fail
    rule: 8 = hard serious obstacle requiring strong capability, tools, magic, focus, favorable positioning, or risk
    rule: 12 = extreme exceptional, dangerous, fortified, overwhelming, or near-impossible environmental opposition
    rule: classify from concrete scene facts: material, scale, complexity, danger, time pressure, visibility, footing, weather, magical strength, tool access, distance, and whether the environment is worsening
    rule: do not raise difficulty because the story moment feels dramatic; do not lower difficulty because {{user}} has high stats
    if stats.OPP!=ENV -> 0
    return 0|4|8|12

  getUserCoreStats():
    policy: LOCKED, EXPLICIT-ONLY
    rule: read {{user}}'s character sheet/persona
    return {PHY, MND, CHA}

  getCurrentCoreStats(target):
    policy: LOCKED, EXPLICIT-ONLY
    rule: read most recent sceneTracker under exact target NPC entry, currentCoreStats
    if found -> return {PHY, MND, CHA}
    else -> missing

  genStats(target, context):
    policy: LOCKED, EXPLICIT-ONLY, FIRST-YES-WINS
    output: {Rank, MainStat, PHY, MND, CHA}
    rule: use only if target currentCoreStats missing
    rule: determine Rank from explicit portrayal only by comparing the target to narrative baselines
    rankGuide:
      Weak = clearly below an ordinary healthy adult; examples include a child, frail elder, badly injured person, small harmless animal, or sickly minor creature
      Average = roughly comparable to an ordinary healthy adult or ordinary capable creature; examples include a civilian adult, common laborer, goblin, or other ordinary non-elite being
      Trained = at least comparable to a trained and capable professional or dangerous lesser threat; examples include a city guard, soldier, adventurer, orc, ogre, or competent lesser monster
      Elite = clearly beyond ordinary trained professionals or lesser threats; examples include a veteran knight, master duelist, powerful mage, apex predator, elder beast, or major supernatural threat
      Boss = overwhelmingly beyond elite; examples include a legendary hero, warlord, ancient guardian, archmage, dragon, titan, ancient horror, or mythic apex entity
    mainStat:
      rule: identify the target's clearest proficiency from explicit portrayal in scene/context/backstory, referring to DEF.STATS, and assign a primary stat
      rule: MainStat must be PHY, MND, CHA, or Balanced
    assignStats:
      rule: assign stats only within the allowed range for the chosen Rank
      rule: do not assign any stat outside the allowed range for the chosen Rank
      rule: if MainStat is PHY, MND, or CHA, that stat must be highest
      rule: if MainStat=Balanced, no single stat should be clearly dominant
      ranges:
        Weak = 1
        Average = 1 to 3
        Trained = 2 to 4
        Elite = 3 to 6
        Boss = 6 to 10
    rule: save currentCoreStats to sceneTracker and never change unless explicitly altered
    return {Rank, MainStat, PHY, MND, CHA}

  resolveOutcome(input, finalGoal, actions, stats, userCore, targetCore, envDifficulty):
    policy: LOCKED
    comment: LandedActions applies to all resolved actions.
    comment: Non-combat success has LandedActions:1; stalemate/failure has LandedActions:0.
    comment: Combat sequences can have LandedActions up to 3, capped by actionCount.
    comment: CounterPotential = how open {{user}} is to a counter after failing a combat action.
    atkDie = 1d20
    atkTot = atkDie + userCore[stats.USER]
    if stats.OPP=ENV:
      defDie = 1d20
      defTot = defDie + envDifficulty
    else:
      defDie = 1d20
      defTot = defDie + targetCore[stats.OPP]
    margin = atkTot - defTot
    if classifyCombatActionSequence=true:
      tierTable:
        margin >= 8 -> OutcomeTier:Critical_Success LandedActions:3 Outcome:dominant_impact CounterPotential:none
        margin >= 5 -> OutcomeTier:Moderate_Success LandedActions:2 Outcome:solid_impact CounterPotential:none
        margin >= 1 -> OutcomeTier:Minor_Success LandedActions:1 Outcome:light_impact CounterPotential:none
        margin = 0 -> OutcomeTier:Stalemate LandedActions:0 Outcome:struggle CounterPotential:none
        margin >= -3 -> OutcomeTier:Minor_Failure LandedActions:0 Outcome:checked CounterPotential:light
        margin >= -7 -> OutcomeTier:Moderate_Failure LandedActions:0 Outcome:deflected CounterPotential:medium
        else -> OutcomeTier:Critical_Failure LandedActions:0 Outcome:avoided CounterPotential:severe
      LandedActions = min(LandedActions, actions.length)
      return {OutcomeTier, LandedActions, Outcome, CounterPotential}
    else:
      if margin >= 1 -> OutcomeTier:Success LandedActions:1 Outcome:success CounterPotential:none
      if margin = 0 -> OutcomeTier:Stalemate LandedActions:0 Outcome:struggle CounterPotential:none
      else -> OutcomeTier:Failure LandedActions:0 Outcome:failure CounterPotential:none
      return {OutcomeTier, LandedActions, Outcome, CounterPotential}

  execution:
    finalGoal = identifyGoal(input)
    challenge = identifyChallenge(input, finalGoal, context)
    targets = identifyTargets(input, challenge, finalGoal, context)
    activeHostileThreat = activeHostileThreat(input, finalGoal, targets, context)
    intimacyAdvanceExplicit = intimacyAdvanceExplicit(input, finalGoal, challenge, targets, context)
    boundaryViolationExplicit = boundaryViolationExplicit(input, finalGoal, challenge, targets, context)
    nonLethal = nonLethal(input, finalGoal, challenge, targets, context)
    STAKES = hasStakes(input, finalGoal, challenge, targets, boundaryViolationExplicit, context)
    actions = actionCount(input, challenge)
    envDifficulty = 0
    if STAKES=N:
      outcome = {OutcomeTier:NONE, LandedActions:(none), Outcome:no_roll, CounterPotential:none}
    else:
      stats = mapStats(input, finalGoal, challenge, targets, context)
      envDifficulty = environmentDifficulty(stats, targets, context)
      userCore = getUserCoreStats()
      if stats.OPP!=ENV:
        targetCore = getCurrentCoreStats(first OppTargets.NPC)
        if missing -> targetCore = genStats(first OppTargets.NPC, context)
      outcome = resolveOutcome(input, finalGoal, actions, stats, userCore, targetCore, envDifficulty)
    NPCInScene = unique living NPCs from ActionTargets, OppTargets.NPC, BenefitedObservers, HarmedObservers, plus a single pending-offer NPC only when the user gives a clear generic accept/refuse response to that pending offer
    return {GOAL:finalGoal, actions:actions, intimacyAdvanceExplicit:intimacyAdvanceExplicit, boundaryViolationExplicit:boundaryViolationExplicit, nonLethal:nonLethal, STAKES:STAKES, EnvironmentDifficulty:envDifficulty, LandedActions:outcome.LandedActions, OutcomeTier:outcome.OutcomeTier, Outcome:outcome.Outcome, CounterPotential:outcome.CounterPotential, classifyHostilePhysicalIntent:classifyHostilePhysicalIntent, activeHostileThreat:activeHostileThreat, classifyPhysicalBoundaryPressure:classifyPhysicalBoundaryPressure, hostilesInScene:targets.hostilesInScene, ActionTargets:targets.ActionTargets, OppTargets:targets.OppTargets, BenefitedObservers:targets.BenefitedObservers, HarmedObservers:targets.HarmedObservers, NPCInScene:NPCInScene}
}
---------------------------
function RelationshipEngine(npc, resolutionPacket) {
  const DEF = Object.freeze({
    EO:
'EXPLICIT-ONLY. MUST be stated in Card / Lore / Scene text / tracker. NO inference. Uncertain=N.',
    FYW:
'FIRST-YES-WINS. In ordered rule ladders, the first matching explicit rule becomes final.',
    UNIVERSAL:
'Use resolutionPacket as final for GOAL, intimacyAdvanceExplicit, boundaryViolationExplicit, LandedActions, OutcomeTier, Outcome, ActionTargets, OppTargets, BenefitedObservers, and HarmedObservers.',
    BANDS:
'BOND(B): 1 Low trust/Avoidant (keeps distance, avoids vulnerability and private closeness, cautious or transactional if engagement is necessary). 2 Neutral/Transactional (polite, practical, reserved, curious, formal, situationally cooperative, no default vulnerability or personal closeness). 3 Friendly/Comfortable (cooperative, relaxed, warm, ordinary closeness acceptable when context supports it; not automatic romance or intimacy). 4 Close/Trusting (confides, seeks closeness, shows loyalty, support, vulnerability, and deep personal investment; still not automatic romance or intimacy). FEAR(F): 1 Unshaken (steady, not intimidated). 2 Alert/Wary (cautious, watchful). 3 Afraid/Self-protective (wants distance, safety, witnesses, or an exit; staying, answering, or complying is defensive appeasement/caution, not comfort, attraction, trust, or willingness). 4 Terrified/Panic (escape, surrender, help-seeking, freezing, pleading, or desperate self-protection; compliance is fear management, not consent, comfort, or trust). HOSTILITY(H): 1 Warm/Loyal (supportive, protective). 2 Neutral (no active ill will). 3 Hostile/Obstructive (argues, refuses, obstructs, challenges, mocks, threatens, or interferes). 4 Hatred/Violent (wants harm, removal, exposure, humiliation, sabotage, defeat, or driving away).',
    LOCK:
'If F=4 -> TERROR. Else if H=4 -> HATRED. Else if F=3 or H=3 -> FREEZE. If lock is active, behavior must equal lock. Invariant: F>=3 or H>=3 forces B=1.'
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
    if NPC is already romantically/intimately involved with {{user}}, willing toward {{user}}, or in love -> {Label:romanticOpen,B:4,F:1,H:1}
    if {{user}} is hated, distrusted, wanted, enemy-coded, or bad-reputation with this NPC before the current first interaction -> {Label:userBadRep,B:1,F:2,H:3}
    rule: first encounter kindness, opening-scene rescue, courtesy, friendliness, praise, or a warm first impression do NOT count as prior favorable reputation
    if {{user}} is explicitly shown by prior lore, card, scenario, tracker, or chat history to have an established favorable reputation with this NPC that predates the current scene -> {Label:priorUserGoodRep,B:3,F:1,H:1}
    if {{user}} is explicitly visibly inhuman, demonic, monstrous, undead, bestial, eldritch, or construct-like AND NPC lacks explicit fear immunity -> {Label:userNonHuman,B:1,F:3,H:2}
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
    rule: for each possible resolution outcome, return benefit only if that outcome significantly and concretely improves this NPC's stakes as per DEF.STAKES
    rule: return harm if that outcome materially worsens this NPC's stakes as per DEF.STAKES
    rule: return none if that outcome does not materially change this NPC's stakes
    rule: do NOT return benefit merely because {{user}} succeeds at {{user}}'s own goal, negotiates successfully for {{user}}, chooses not to harm the NPC, fails to harm the NPC, de-escalates without giving the NPC a concrete gain, or because the NPC remains unharmed/safe
    rule: if resolutionPacket.boundaryViolationExplicit=Y and this NPC is the direct/opposing boundary target, successful or landed outcomes [success, dominant_impact, solid_impact, light_impact] worsen this NPC's boundary/autonomy/trust stakes; return harm, not none
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
    if resolutionPacket.boundaryViolationExplicit=Y and (isDirect or isOpp):
      if explicit goal/challenge is coercion, threat, force, or fear pressure -> FearHostility
      else -> Hostility
    if explicit goal/challenge is intimidation, coercion, menacing threat, forced submission, or terrorizing display -> Fear
    if landed && (isDirect || isOpp || isHarmed) and actual outcome materially harms this NPC:
      if out in [dominant_impact, solid_impact] -> FearHostility
      else -> Hostility
    if landed && (isDirect || isOpp) but action is non-coercive social opposition with stakeChangeByOutcome=none -> No Change
    if benefit -> Bond
    else -> No Change

  applyPhysicalBoundaryPressure(npc, resolutionPacket, state):
    policy: LOCKED, FYW
    rule: use only when resolutionPacket.classifyPhysicalBoundaryPressure=Y, resolutionPacket.classifyHostilePhysicalIntent!=Y, and resolutionPacket.STAKES=Y
    isDirect = resolutionPacket.ActionTargets.includes(npc.name)
    isOpp = resolutionPacket.OppTargets.NPC.includes(npc.name)
    isHarmed = resolutionPacket.HarmedObservers.includes(npc.name)
    if !isDirect && !isOpp && !isHarmed -> none
    rule: boundary pressure is a lower-severity negative social/physical boundary response, not combat
    rule: apply Hostility pressure by at most +1 H and never raise H above 3 unless H was already 4 from a prior hostilePhysicalIntent state
    if state.currentDisposition.H>=3 -> deltas={b:0,f:0,h:0}
    else -> deltas={b:-1,f:0,h:1}
    target = Hostility
    return {target, deltas}

  applyHostilePhysicalPressure(npc, resolutionPacket, state):
    policy: LOCKED, FYW
    rule: use only when resolutionPacket.classifyHostilePhysicalIntent=Y and resolutionPacket.STAKES=Y
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
    OverrideActive = Override!=NONE ? Y : N
    return {LockActive, OverrideActive, Override}

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
    else if O <= 14 -> COMPLICATION
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

    if A < 17 ->
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
----------------
function NameGenerationEngine(context) {
  const DEF = Object.freeze({
    EO:
'HYBRID. The semantic pass proposes names by selected style; deterministic validation uses context and the current chat name registry as truth.',
    FYW:
'FIRST-YES-WINS. In ordered rule ladders, the first matching rule becomes final.',
    UNIVERSAL:
'SINGLE-PASS. Produce a hidden approved pool of proper names: 3 male person/entity names, 3 female person/entity names, and 3 location names. The narrator may use them only after fogOfWar already permits a specific name reveal for that person, entity, or place.',
    PURPOSE:
'Prevent improvised model names from drifting by supplying a style-aware approved name pool. Use the pool only after fogOfWar already permits a specific name reveal. Do not force a new person or location into the scene.',
    SEED:
'Seed is hidden deterministic fallback entropy derived from fixed pool slots and context. It does NOT have to appear at the start of a fallback name.',
    STYLE:
'Invent creative, pronounceable, real-but-unplaceable names matching the selected style. Avoid pure Western-European stock fantasy drift, Tolkien-esque elvish unless that style is selected, JRPG-generic naming, famous names, joke names, and overly ordinary modern-Western names.',
    SHAPE:
'Append only pronounceable syllables. NO 3+ consecutive vowels. NO 3+ consecutive consonants. PERSON total length 5-10. LOCATION total length 7-14. LOCATION must feel geographic / compound / place-like and must not read like a person name.'
  });

  profileFromContext(context):
    policy: FYW
    if context contains any [harsh,hard,stone,iron,ash,cold,desert,steppe,war,border,fortress,raid,scar,volcanic] -> HARD
    if context contains any [soft,coast,island,harbor,reef,jungle,garden,ritual,temple,court,silk,trade,festival,rain] -> SOFT
    else -> BALANCED

  generateSemanticCandidates(selectedStyle):
    produce exactly 3 male person/entity names, 3 female person/entity names, and 3 location names
    use selectedStyle as taste/style guidance
    do not output fixed stock examples or famous names

  buildFallbackName(mode, profile, gender, context, slotSeed):
    if mode=PERSON:
      generate one fallback person/entity name from deterministic syllable pools using slotSeed as hidden entropy
      use compact call-name shape; gender affects weighting only, never hard stereotype
    else:
      generate one fallback location name from deterministic syllable pools using slotSeed as hidden entropy
      use geographic / compound / place-like syllable shape

  reject(name, mode):
    policy: FYW
    if mode=PERSON and (length(name)<5 || length(name)>10) -> Y
    if mode=LOCATION and (length(name)<7 || length(name)>14) -> Y
    if name has 3+ consecutive vowels -> Y
    if name has 3+ consecutive consonants -> Y
    if name reads as stock fantasy / elvish / Tolkien-like / JRPG-generic -> Y
    if name reads as too ordinary / modern-Western / overly familiar -> Y
    if name strongly resembles a famous fictional or real-world place/person name -> Y
    if mode=LOCATION and name reads more like a person name than a place -> Y
    if name already exists in current chat name registry or tracker -> Y
    else -> N

  execution:
    P = profileFromContext(context)
    semanticCandidates = generateSemanticCandidates(selectedStyle)
    accept semanticCandidates that pass reject(name, mode)
    replace rejected/missing candidates with buildFallbackName(...)
    reject/regenerate each final candidate until valid and unused within the current chat registry, tracker names, and this pool
    return {male, female, location}
}
----------------
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
    if resolutionPacket.STAKES=N -> Normal_Interaction
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
    if handoff.Target=Bond && handoff.PressureMode=none && handoff.Lock not in [FREEZE,TERROR,HATRED] && resolutionPacket.classifyHostilePhysicalIntent!=Y -> DORMANT
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
    if resolutionPacket.classifyHostilePhysicalIntent=Y -> Retaliation
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
      npcCore = getCurrentCoreStats(NPC) from trackerUpdate or trackerSnapshot
      targetCore = getUserCoreStats() if target={{user}} else target NPC currentCoreStats
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

export function routeDispositionTarget(npc, packet, auditInteraction, sem) {
    const isDirect = includesName(packet.ActionTargets, npc);
    const isOpp = includesName(packet.OppTargets?.NPC, npc);
    const isBenefited = includesName(packet.BenefitedObservers, npc);
    const isHarmed = includesName(packet.HarmedObservers, npc);
    const landed = landedBool(packet.LandedActions);
    const out = packet.Outcome;
    const hasStakes = packet.STAKES === 'Y';
    const benefitAllowedForDirect = auditInteraction === 'Y'
        && (isDirect || isOpp)
        && !isHarmed
        && directOrOpposedBenefitAllowed(npc, packet, sem);

    if (!isDirect && !isOpp && !isBenefited && !isHarmed) return 'No Change';
    if (!hasStakes) return softBondAllowedForNoStakes(npc, packet, sem) ? 'Bond' : 'No Change';
    if (packet.boundaryViolationExplicit === 'Y' && (isDirect || isOpp)) {
        return bool(sem.explicitIntimidationOrCoercion) || packet.classifyHostilePhysicalIntent === 'Y'
            ? 'FearHostility'
            : 'Hostility';
    }
    if (!isDirect && !isOpp && isBenefited) return auditInteraction === 'Y' ? 'Bond' : 'No Change';
    if (!isDirect && !isOpp && isHarmed) return ['dominant_impact', 'solid_impact'].includes(out) ? 'FearHostility' : 'Hostility';
    if (bool(sem.explicitIntimidationOrCoercion)) return 'Fear';
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
    if (packet.classifyHostilePhysicalIntent === 'Y') return false;
    if (packet.classifyPhysicalBoundaryPressure === 'Y') return false;
    if (packet.boundaryViolationExplicit === 'Y') return false;
    if (packet.intimacyAdvanceExplicit === 'Y') return false;
    if (packet.activeHostileThreat === 'Y') return false;
    if (bool(sem.explicitIntimidationOrCoercion)) return false;

    const evidence = normalizeSlowBondEvidence(sem.slowBondEvidence || {});
    if (evidence.blockers.length) return false;
    return slowBondEvidenceCount(evidence) > 0;
}

function landedActionHarmsRelationship(packet, sem, outcome, isHarmed) {
    if (isHarmed) return true;
    if (packet.classifyHostilePhysicalIntent === 'Y') return true;
    if (packet.classifyPhysicalBoundaryPressure === 'Y') return true;
    if (packet.boundaryViolationExplicit === 'Y') return true;
    if (bool(sem.explicitIntimidationOrCoercion)) return true;
    return normalizeStakeChange(sem.stakeChangeByOutcome?.[String(outcome || 'no_roll')]) === 'harm';
}

function directOrOpposedBenefitAllowed(npc, packet, sem) {
    if (packet.classifyHostilePhysicalIntent === 'Y') return false;
    if (packet.classifyPhysicalBoundaryPressure === 'Y') return false;
    if (packet.boundaryViolationExplicit === 'Y') return false;
    if (bool(sem.explicitIntimidationOrCoercion)) return false;
    const source = relationshipBenefitSourceText(packet, sem);
    return isConcreteAidBenefitForNpc(source, npc);
}

export function resolveStakeChangeByOutcome(npc, sem, packet) {
    const outcomeKey = String(packet.Outcome || 'no_roll');
    const semanticValue = normalizeStakeChange(sem.stakeChangeByOutcome?.[outcomeKey]);
    if (packet.STAKES !== 'Y') return { value: semanticValue };

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
    if ((relation.isDirect || relation.isOpp) && packet.classifyHostilePhysicalIntent === 'Y' && landed) return 'harm';
    if ((relation.isDirect || relation.isOpp) && packet.classifyPhysicalBoundaryPressure === 'Y' && positiveOutcome) return 'harm';
    if ((relation.isDirect || relation.isOpp)
        && packet.boundaryViolationExplicit === 'Y'
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
        && packet.classifyHostilePhysicalIntent !== 'Y') {
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
    if (packet.classifyPhysicalBoundaryPressure !== 'Y') return null;
    if (packet.classifyHostilePhysicalIntent === 'Y') return null;
    if (packet.STAKES !== 'Y') return null;

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
    if (packet.classifyHostilePhysicalIntent !== 'Y') return null;
    if (packet.STAKES !== 'Y') return null;

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
        && packet.classifyHostilePhysicalIntent !== 'Y'
        && packet.classifyPhysicalBoundaryPressure !== 'Y'
        && packet.boundaryViolationExplicit !== 'Y'
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
    return { LockActive, OverrideActive: Override !== 'NONE' ? 'Y' : 'N', Override };
}

export function getChaosContext(handoffs, sceneSummary) {
    if (handoffs.length >= 2) return 'PUBLIC';
    if (/\b(public|crowd|open|market|tavern|street|square)\b/i.test(sceneSummary)) return 'PUBLIC';
    return 'ISOLATED';
}

export function classifyBand(o) {
    if (o <= 5) return 'HOSTILE';
    if (o <= 14) return 'COMPLICATION';
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
    if (packet.STAKES === 'N') return 'Normal_Interaction';
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
        npcPersistentRuleMutated: ['currentDisposition', 'currentRapport', 'lastRapportGainActiveMs', 'userHistory', 'raceProfile', 'personalitySummary', 'hostilePressure', 'hostileLandedPressure', 'dominantLock', 'pressureMode', 'lifecycle', 'condition', 'wounds', 'statusEffects', 'gear'],
        playerPersistentRuleMutated: ['condition', 'wounds', 'statusEffects', 'gear', 'inventory', 'tasks', 'commitments'],
        hiddenPowerActorPersistentRuleMutated: ['powerActors.name', 'powerActors.type', 'powerActors.enmity', 'powerActors.tier', 'powerActors.reasons', 'powerActors.responseHistory', 'powerActors.lastEffect'],
        perTurn: ['GOAL', 'hostilesInScene', 'ActionTargets', 'OppTargets', 'STAKES', 'nonLethal', 'OutcomeTier', 'Outcome', 'LandedActions', 'CounterPotential', 'classifyHostilePhysicalIntent', 'activeHostileThreat', 'classifyPhysicalBoundaryPressure', 'CHAOS', 'proactivityResults', 'aggressionResults'],
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
            `history:${value?.userHistory?.knowsUser ?? 'N'}/${value?.userHistory?.standing ?? 'neutral'}`,
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

const TRACKER_CONDITIONS = Object.freeze(['healthy', 'bruised', 'wounded', 'badly_wounded', 'critical', 'dead']);
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
        userHistory: normalizeUserHistory(value?.userHistory),
        raceProfile: normalizeNpcRaceProfile(value?.raceProfile),
        personalitySummary: normalizePersonalitySummary(value?.personalitySummary),
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
        tasks: normalizeTrackerStringList(value?.tasks),
        commitments: normalizeTrackerStringList(value?.commitments),
    };
}

export function normalizeTrackerCondition(value) {
    const text = String(value ?? 'healthy').trim().toLowerCase().replace(/[\s-]+/g, '_');
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
        if (result.length >= 40) break;
    }
    return result;
}

export function normalizePersonalitySummary(value) {
    const text = String(value ?? '')
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/^["']|["']$/g, '')
        .trim();
    if (!text || ['(none)', 'none', 'null', 'n/a', 'unknown', 'unchanged'].includes(text.toLowerCase())) return '';
    return text.slice(0, 160);
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

    for (const name of targets.hostilesInScene?.NPC || []) {
        if (classifier.isLiving(name)) hostilesNpc.push(name);
    }
    for (const name of targets.ActionTargets) {
        if (classifier.isLiving(name)) actionTargets.push(name);
        else oppEnv.push(name);
    }
    for (const name of targets.OppTargets.NPC) {
        if (classifier.isLiving(name)) {
            if (options.hasStakes === 'N') actionTargets.push(name);
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

    const directOrOpposed = new Set([...actionTargets, ...oppNpc].map(normalizeNameKey));
    const benefited = benefitedCandidates.filter(name => !directOrOpposed.has(normalizeNameKey(name)));
    const harmed = harmedCandidates.filter(name => !directOrOpposed.has(normalizeNameKey(name)));

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
        PHY: clamp(Number(value?.PHY ?? fallback.PHY), 1, 10),
        MND: clamp(Number(value?.MND ?? fallback.MND), 1, 10),
        CHA: clamp(Number(value?.CHA ?? fallback.CHA), 1, 10),
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

export function normalizeStat(value, fallback) {
    return ['PHY', 'MND', 'CHA'].includes(value) ? value : fallback;
}

export function normalizeOppStat(value) {
    return ['PHY', 'MND', 'CHA', 'ENV'].includes(value) ? value : 'ENV';
}

export function normalizeMapStats(value) {
    return {
        userStat: normalizeStat(value?.USER, 'PHY'),
        oppStat: normalizeOppStat(value?.OPP),
    };
}

export function applyMapStatsHardRules(semantic, goal, targets, mapStats, audit, options = {}) {
    let { userStat, oppStat } = mapStats;
    const evidence = [];

    if (isBodyAffectingMagic(semantic, goal, targets)) {
        if (userStat !== 'MND' || oppStat !== 'PHY') {
            evidence.push({
                hardRule: 'ResolutionEngine.mapStats: body-affecting magic against a living target is USER=MND and OPP=PHY',
                from: { USER: userStat, OPP: oppStat },
                to: { USER: 'MND', OPP: 'PHY' },
            });
        }
        userStat = 'MND';
        oppStat = 'PHY';
    }

    const socialRule = classifySocialMapStatsRule(semantic, targets);
    if (socialRule) {
        if (userStat !== 'CHA' || oppStat !== socialRule.oppStat) {
            evidence.push({
                hardRule: socialRule.hardRule,
                from: { USER: userStat, OPP: oppStat },
                to: { USER: 'CHA', OPP: socialRule.oppStat },
            });
        }
        userStat = 'CHA';
        oppStat = socialRule.oppStat;
    }

    const hasLivingOpposition = toRealArray(targets.OppTargets?.NPC).length > 0;
    const hasEnvironmentalOpposition = toRealArray(targets.OppTargets?.ENV).length > 0;
    if (!hasLivingOpposition && hasEnvironmentalOpposition && oppStat !== 'ENV') {
        evidence.push({
            hardRule: 'ResolutionEngine.mapStats: non-living environmental opposition means OPP=ENV only when no living opposing target exists',
            from: { USER: userStat, OPP: oppStat },
            to: { USER: userStat, OPP: 'ENV' },
        });
        oppStat = 'ENV';
    }

    if (evidence.length) {
        audit.push(`2.7c.1 deterministicMapStatsReferee=${compact(evidence)}`);
    }

    return { userStat, oppStat };
}

export function classifySocialMapStatsRule(semantic, targets) {
    if (!firstReal(targets.OppTargets?.NPC)) return null;
    if (bool(semantic.classifyHostilePhysicalIntent)) return null;
    if (isBodyAffectingMagic(semantic, semantic.identifyGoal, targets)) return null;
    if (isStakeBearingUntrustedClaimForMapStats(semantic?.claimCheck)) {
        return {
            oppStat: 'MND',
            hardRule: 'ResolutionEngine.mapStats: stakes-bearing known-false or unsupported factual claim is USER=CHA and OPP=MND',
        };
    }
    const source = [
        semantic.identifyGoal,
        semantic.identifyChallenge,
        semantic.explicitMeans,
    ].filter(Boolean).join(' ').toLowerCase();

    const negative = /\b(bluff(?:s|ed|ing)?|lie|lying|lied|deceiv\w*|deception|trick(?:s|ed|ing)?|mislead\w*|intimidat\w*|coerc\w*|threat\w*|blackmail\w*|manipulat\w*|interrogat\w*|humiliat\w*|terroriz\w*|menac\w*|force(?:d)? submission|forced submission)\b/.test(source);
    if (negative) {
        return {
            oppStat: 'MND',
            hardRule: 'ResolutionEngine.mapStats: negative social opposition is USER=CHA and OPP=MND',
        };
    }

    const positive = /\b(persuad\w*|persuasion|negotiat\w*|negotiation|diplomac\w*|diplomacy|bargain\w*|reassur\w*|reconciliation|reconcile\w*|good-faith|appeal\w*|convinc\w*|reason with|mediat\w*)\b/.test(source);
    if (positive) {
        return {
            oppStat: 'CHA',
            hardRule: 'ResolutionEngine.mapStats: positive social opposition is USER=CHA and OPP=CHA',
        };
    }

    return null;
}

function isStakeBearingUntrustedClaimForMapStats(claimCheck) {
    const source = claimCheck && typeof claimCheck === 'object' ? claimCheck : {};
    const present = bool(source.present ?? source.Present);
    const stakesImpact = bool(source.stakesImpact ?? source.StakesImpact);
    const truthStatus = String(source.truthStatus ?? source.TruthStatus ?? '')
        .trim()
        .toLowerCase()
        .replace(/[\s-]+/g, '_');
    return present && stakesImpact && ['known_false', 'unsupported'].includes(truthStatus);
}

export function isBodyAffectingMagic(semantic, goal, targets) {
    if (!firstReal(targets.OppTargets?.NPC) && !firstReal(targets.ActionTargets)) return false;
    if (bool(semantic.classifyHostilePhysicalIntent)) return false;

    const source = [
        semantic.identifyGoal,
        goal,
        semantic.identifyChallenge,
        semantic.explicitMeans,
    ].filter(Boolean).join(' ').toLowerCase();

    const hasMagic = /\b(magic|magical|spell|arcane|hex|curse|supernatural|enchant|enchantment|sorcery|power)\b/.test(source);
    const affectsBody = /\b(paraly[sz]e|paralysis|poison|venom|blind|blindness|deafen|numb|sleep|pain|muscle|blood|breath|choke|disease|sicken|transmut|petrif|bind|bodily|body|immobiliz|lock|freeze|stun)\b/.test(source);
    return hasMagic && affectsBody;
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
