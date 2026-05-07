export const ENGINE_PROMPT_TEXT = String.raw`[STRUCTURED_PREFLIGHT_ENGINE_EXTENSION v0.1 - SOURCE: EXTENSION ONLY]

function ResolutionEngine(input) {
  const DEF = Object.freeze({
    UNIVERSAL:
'EXPLICIT-ONLY. MUST be stated in Character Card / Lore / Scene text / tracker. NO invention. Uncertain = N or default. FIRST-YES-WINS = first matching explicit rule becomes final. No reconsideration. NEVER invent stats, targets, actions, obstacles, or outcomes. MAX 3 ACTIONS. TIE = STALEMATE / STRUGGLE. ROLLS = 1d20 + relevant stat vs opposing 1d20 + relevant stat, or vs plain Environment 1d20.',
    STATS:
'PHY = challenges that require physical effort, strength, agility, speed, coordination, endurance, stealth movement, combat skill, or bodily execution under risk. MND = challenges that require thought, memory, perception, focus, reasoning, knowledge, awareness, will, or deliberate mental/supernatural exertion. CHA = social challenges that require persuasion, deception, intimidation, negotiation, emotional influence, personal presence, or interpersonal skill. Map the stat from finalGoal or explicit challenge that carries stakes, not from incidental gestures, flavor, delivery method, or setup. Core stat scale is 1 to 10.',
    STAKES:
'Stakes are meaningful possible consequences tied to success or failure. Stakes include physical risk, harm, danger, detection, material gain or loss, significant social status/authority/trust shift, loss of autonomy or physical freedom, hostile restraint/immobilization/confinement, meaningful obstacle resolution or failure, or explicit finalGoal advancement or failure for {{user}} or a specific living entity. Minor mood, flavor, casual rudeness, weak preference, or trivial convenience alone is not stakes. If success or failure would not materially change the outcome, no roll is needed.'
  });

  identifyGoal(input):
    policy: LOCKED, EXPLICIT-ONLY, FIRST-YES-WINS
    finalGoal: return a short, plain description of {{user}}'s finalGoal/intent in the last input
    rule: ignore setup, movement, intermediary steps, and post-action flavor unless they are themselves separate consequential actions
    rule: if finalGoal is an explicit direct physical sexual or physical intimate advance toward a specific NPC, including {{user}} attempting to kiss, touch, pull close, undress, grope, caress, or otherwise create physical sexual/intimate contact, return IntimacyAdvancePhysical
    rule: IntimacyAdvancePhysical REQUIRES attempted physical contact initiated by {{user}}. A request for intimacy, question about intimacy, asking permission, asking the NPC to kiss/touch/hold {{user}}, declaration of love, flirtation, compliment, or romantic statement is NOT physical.
    rule: if finalGoal is an explicit direct verbal sexual or verbal intimate proposition/request toward a specific NPC, return IntimacyAdvanceVerbal
    rule: IntimacyAdvanceVerbal REQUIRES an explicit request, invitation, proposition, question, permission request, or demand for sexual/intimate activity. "Will you kiss me?", "Can I kiss you?", "May I touch you?", and asking an NPC to kiss/touch/hold {{user}} are verbal unless {{user}} also attempts physical contact in the same input.
    rule: A declaration of love, flirting, compliments, teasing, affectionate tone, or non-explicit romantic/social behavior is NOT IntimacyAdvanceVerbal.
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
    rule: this is not combat and must not produce LandedActions, CounterPotential, or H4 by itself

  identifyTargets(input, challenge, finalGoal, context):
    policy: LOCKED, EXPLICIT-ONLY
    ActionTargets = LIVING entities {{user}} directly tries to affect as the main resolution target
    OppTargets.NPC = LIVING entities whose stakes are at risk and who actively or passively oppose, contest, or resist {{user}}'s actions
    OppTargets.ENV = NON-LIVING environmental or terrain feature, hazard, object, or other obstacle directly obstructing {{user}}'s actions
    BenefitedObservers = THIRD-PARTY LIVING entities present in scene, not ActionTargets and not OppTargets.NPC, whose stakes materially improve as a result of {{user}}'s actions, as per DEF.STAKES. Protective/rescue contact with an ally, shielding them, pulling/pushing them out of danger, or standing between them and harm makes them BenefitedObservers when {{user}} is not contesting their will, harming them, restraining them, or making them the main opposed challenge. Example: {{user}} pushes a woman out of danger and stands between her and a harasser. Harasser = ActionTargets and OppTargets.NPC; woman = BenefitedObservers.
    HarmedObservers = THIRD-PARTY LIVING entities present in scene, not ActionTargets and not OppTargets.NPC, whose stakes materially worsen as a result of {{user}}'s actions, as per DEF.STAKES. This requires an explicit material stake, relationship, duty, protection role, authority role, or similar; mere witnessing alone is not enough. Example: {{user}} hurts an NPC while that NPC's father witnesses it. Hurt NPC = ActionTargets and OppTargets.NPC; witnessing father = HarmedObservers.
    rule: if hasStakes=N, OppTargets.NPC must be [(none)] unless a hard intimacy gate rule forces stakes
    rule: a direct ActionTarget can also be OppTargets.NPC only when that target's stakes are meaningfully contested or resisted
    rule: protective/rescue movement of an ally does not make that ally ActionTargets unless {{user}} contests their will, harms them, restrains them, or makes them the main opposed challenge
    rule: ActionTargets, OppTargets.NPC, BenefitedObservers, and HarmedObservers are mutually exclusive observer categories except that direct ActionTargets may also be OppTargets.NPC when they are the resisting/opposing party
    rule: if any target list is not present, return [(none)]
    return {ActionTargets, OppTargets, BenefitedObservers, HarmedObservers}

  checkIntimacyGate(finalGoal, targets, context):
    policy: LOCKED, EXPLICIT-ONLY
    rule: if finalGoal=IntimacyAdvancePhysical or finalGoal=IntimacyAdvanceVerbal, read exact target NPC entry in latest sceneTracker
    rule: return Y if B>=4 under currentDisposition OR IntimacyGate=ALLOW
    rule: return Y if current explicit RelationshipEngine checkThreshold would produce OverrideActive=Y and no F/H lock blocks it
    else -> N

  hasStakes(input, finalGoal, challenge, targets, IntimacyConsent, context):
    policy: LOCKED, EXPLICIT-ONLY
    rule: if finalGoal in [IntimacyAdvancePhysical, IntimacyAdvanceVerbal] and IntimacyConsent=N, return Y
    rule: if finalGoal in [IntimacyAdvancePhysical, IntimacyAdvanceVerbal], return N
    rule: return Y if success or failure of finalGoal or explicit challenge could affect {{user}} or NPC's stakes, as per DEF.STAKES
    else -> N

  actionCount(input, challenge):
    policy: LOCKED, EXPLICIT-ONLY, MAX 3 ACTIONS
    rule: only applies to explicit hostile/combat attack sequences
    rule: do not count setup, movement, repositioning, defense, recovery, or non-attack flavor as additional actions
    rule: each individual attack within a sequence counts as one action
    rule: return one action marker per attack: [a1], [a1,a2], or [a1,a2,a3]

  mapStats(input, finalGoal, challenge, targets, context):
    policy: LOCKED, EXPLICIT-ONLY, FIRST-YES-WINS
    rule: determine USER stat by applying DEF.STATS to identifyChallenge when identifyChallenge is distinct from finalGoal
    rule: use finalGoal only if no distinct stakes-bearing challenge exists
    rule: if finalGoal relies heavily on a specific enabling action (e.g., a physical feat to intimidate, or clearing an obstacle to dodge), determine USER stat based strictly on that enabling challenge
    rule: if {{user}} uses deliberate mental/supernatural exertion to affect a living target's bodily functions or physical state (paralysis, poison, blindness, forced sleep, pain, muscle lock, disease, transmutation, bodily binding), USER=MND and OPP=PHY
    rule: if magic or a substance creates a non-living environmental hazard/obstacle instead of directly contesting a living target, put the hazard/obstacle in OppTargets.ENV and use OPP=ENV unless a living target explicitly resists the effect
    rule: if finalGoal=IntimacyAdvancePhysical and IntimacyConsent=N, USER=PHY and OPP=PHY. This rule is absolute for denied/opposed physical intimacy, including kissing or attempted intimate contact, even if the approach includes romantic, seductive, verbal, or social framing
    rule: if explicit means is positive social interaction such as persuasion, negotiation, diplomacy, bargaining, reconciliation, reassurance, or good-faith appeal against a living opposing target, USER=CHA and OPP=CHA
    rule: if explicit means is negative social interaction such as bluff, deception, intimidation, coercion, threat, blackmail, manipulation, interrogation, humiliation, or forced submission against a living opposing target, USER=CHA and OPP=MND
    rule: if OppTargets.NPC contains an opposing entity, determine opposing stat by applying DEF.STATS to that first OppTargets.NPC entity's resistance to {{user}}'s explicit means or finalGoal
    rule: if OppTargets.NPC=[(none)] and OppTargets.ENV contains an obstacle, OPP=ENV
    return {USER, OPP}

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

  resolveOutcome(input, finalGoal, actions, stats, userCore, targetCore):
    policy: LOCKED
    comment: LandedActions and CounterPotential only apply to explicit hostile PHY actions with classifyHostilePhysicalIntent=true.
    comment: For all other actions, resolution is Success, Stalemate/struggle, or Failure.
    comment: CounterPotential = how open {{user}} is to a counter after failing a hostile PHY action.
    atkDie = 1d20
    atkTot = atkDie + userCore[stats.USER]
    if stats.OPP=ENV:
      defDie = 1d20
      defTot = defDie
    else:
      defDie = 1d20
      defTot = defDie + targetCore[stats.OPP]
    margin = atkTot - defTot
    if stats.USER=PHY and classifyHostilePhysicalIntent=true:
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
      if margin >= 1 -> OutcomeTier:Success LandedActions:(none) Outcome:success CounterPotential:none
      if margin = 0 -> OutcomeTier:Stalemate LandedActions:(none) Outcome:struggle CounterPotential:none
      else -> OutcomeTier:Failure LandedActions:(none) Outcome:failure CounterPotential:none
      return {OutcomeTier, LandedActions, Outcome, CounterPotential}

  execution:
    finalGoal = identifyGoal(input)
    challenge = identifyChallenge(input, finalGoal, context)
    targets = identifyTargets(input, challenge, finalGoal, context)
    IntimacyConsent = checkIntimacyGate(finalGoal, targets, context)
    STAKES = hasStakes(input, finalGoal, challenge, targets, IntimacyConsent, context)
    actions = actionCount(input, challenge)
    if STAKES=N:
      outcome = {OutcomeTier:NONE, LandedActions:(none), Outcome:no_roll, CounterPotential:none}
    else:
      stats = mapStats(input, finalGoal, challenge, targets, context)
      userCore = getUserCoreStats()
      if stats.OPP!=ENV:
        targetCore = getCurrentCoreStats(first OppTargets.NPC)
        if missing -> targetCore = genStats(first OppTargets.NPC, context)
      outcome = resolveOutcome(input, finalGoal, actions, stats, userCore, targetCore)
    NPCInScene = unique living NPCs from ActionTargets, OppTargets.NPC, BenefitedObservers, HarmedObservers, and relationshipEngine entries
    return {GOAL:finalGoal, actions:actions, IntimacyConsent:IntimacyConsent, STAKES:STAKES, LandedActions:outcome.LandedActions, OutcomeTier:outcome.OutcomeTier, Outcome:outcome.Outcome, CounterPotential:outcome.CounterPotential, classifyHostilePhysicalIntent:classifyHostilePhysicalIntent, classifyPhysicalBoundaryPressure:classifyPhysicalBoundaryPressure, ActionTargets:targets.ActionTargets, OppTargets:targets.OppTargets, BenefitedObservers:targets.BenefitedObservers, HarmedObservers:targets.HarmedObservers, NPCInScene:NPCInScene}
}
---------------------------
function RelationshipEngine(npc, resolutionPacket) {
  const DEF = Object.freeze({
    EO:
'EXPLICIT-ONLY. MUST be stated in Card / Lore / Scene text / tracker. NO inference. Uncertain=N.',
    FYW:
'FIRST-YES-WINS. In ordered rule ladders, the first matching explicit rule becomes final.',
    UNIVERSAL:
'Use resolutionPacket as final for GOAL, IntimacyConsent, LandedActions, OutcomeTier, Outcome, ActionTargets, OppTargets, BenefitedObservers, and HarmedObservers.',
    BANDS:
'BOND(B): 1 Avoid/Ignore (keeps distance, disengages). 2 Neutral/Transactional (polite, businesslike, no trust). 3 Friendly/Comfortable (cooperative, relaxed, familiar). 4 Close/Trusting (confides, seeks closeness; intimacy possible). FEAR(F): 1 Unshaken (steady, not intimidated). 2 Alert/Wary (cautious, watchful). 3 Freezing/Submissive (hesitates, yields, avoids escalation). 4 Terrified/Panic (flight, surrender, desperate compliance). HOSTILITY(H): 1 Warm/Loyal (supportive, protective). 2 Neutral (no active ill will). 3 Aggressive/Obstructive (resentful, argumentative, interfering). 4 Hatred/Violent (wants harm, sabotage, escalation).',
    LOCK:
'If F=4 -> TERROR. Else if H=4 -> HATRED. Else if F=3 or H=3 -> FREEZE. If lock is active, behavior must equal lock.'
  });

  getCurrentRelationalState(npc):
    policy: EO
    rule: read exact latest sceneTracker NPC entry for this NPC
    rule: currentDisposition = valid B[x]/F[y]/H[z] 1-4 ? exact values : null
    rule: currentRapport = valid 0-5 ? exact value : 0
    rule: rapportEncounterLock = valid Y/N ? exact value : N
    rule: intimacyGate = valid ALLOW/DENY ? exact value : SKIP
    rule: hostilePressure = valid number ? exact value : 0
    rule: hostileLandedPressure = valid number ? exact value : 0
    rule: dominantLock = valid FEAR/HOSTILITY/None ? exact value : None
    rule: pressureMode = valid none/cornered/dominated ? exact value : none
    return {currentDisposition, currentRapport, rapportEncounterLock, intimacyGate, hostilePressure, hostileLandedPressure, dominantLock, pressureMode}

  initPreset():
    policy: EO, FYW
    rule: use only if currentDisposition is missing
    rule: NPC has explicit fear immunity only if same or superior kind/nature, superior being, or explicit natural fear/mental immunity
    rule: title, rank, bravado, posturing, composure, masking fear, saving face, acting brave, or pretending to be fearless do NOT count as fear immunity
    if NPC is explicitly an active enemy of {{user}}, actively hostile, attacking, ambushing, robbing, hunting, threatening, capturing, fighting, or intentionally obstructing {{user}} with hostile intent -> {Label:activeEnemy,B:1,F:2,H:4}
    rule: archetype or label alone is not activeEnemy. "bandit", "enemy soldier", "criminal", "orc", "monster", or similar only counts if the scene/card/lore explicitly shows active hostile intent toward {{user}} now.
    if NPC is already romantically/intimately involved with {{user}}, willing/open toward {{user}}, or in love -> {Label:romanticOpen,B:4,F:1,H:1}
    if {{user}} is hated, distrusted, wanted, or bad-reputation -> {Label:userBadRep,B:1,F:2,H:3}
    if {{user}} is admired, trusted, praised, good-reputation, or already known favorably -> {Label:userGoodRep,B:3,F:1,H:2}
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
    rule: if resolutionPacket.GOAL in [IntimacyAdvancePhysical, IntimacyAdvanceVerbal], IntimacyConsent=N, and this NPC is the direct/opposing intimacy target, successful or landed outcomes [success, dominant_impact, solid_impact, light_impact] worsen this NPC's boundary/autonomy/trust stakes; return harm, not none
    rule: NPC_STAKES=Y when the actual outcome's stakeChangeByOutcome is benefit or harm
    rule: NPC_STAKES=N when the actual outcome's stakeChangeByOutcome is none

  routeDispositionTarget(npc, resolutionPacket, audit, isAllowed):
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
    if g in [IntimacyAdvancePhysical, IntimacyAdvanceVerbal]:
      if isAllowed=Y -> Bond
      if g=IntimacyAdvancePhysical -> FearHostility
      else -> Hostility, with Hostility capped at H3. Denied verbal intimacy cannot create H4.
    if explicit goal/challenge is intimidation, coercion, menacing threat, forced submission, or terrorizing display -> Fear
    if landed && (isDirect || isOpp || isHarmed):
      if out in [dominant_impact, solid_impact] -> FearHostility
      else -> Hostility
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
    rule: apply Hostility pressure by at most +1 H and never raise H above 3 unless H was already 4 from a prior activeEnemy/hostilePhysicalIntent state
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

  newEncounterExplicit():
    policy: EO, FYW
    rule: return Y only if explicit roleplay/context shows a clear encounter reset: sleep, rest, new day, significant downtime, leaving and returning later, or explicit later re-engagement after separation
    else -> N

  updateRapport(currentRapport, target, rapportEncounterLock):
    rule: positive encounter = target in [Bond,No Change]
    rule: negative encounter = target in [Hostility,Fear,FearHostility]
    if rapportEncounterLock=Y -> return {currentRapport:currentRapport,rapportEncounterLock:Y}
    if target in [Bond,No Change] -> return {currentRapport:min(5,currentRapport+1),rapportEncounterLock:Y}
    if target in [Hostility,Fear,FearHostility] -> return {currentRapport:max(0,currentRapport-1),rapportEncounterLock:Y}
    return {currentRapport:currentRapport,rapportEncounterLock:rapportEncounterLock}

  deriveDirection(target, audit, currentDisposition, currentRapport, resolutionPacket):
    if target=No Change -> {b:0,f:0,h:0}
    if target=Hostility -> {b:-1,f:0,h:1}
    if target=Fear -> {b:-1,f:1,h:0}
    if target=FearHostility -> {b:-1,f:1,h:1}
    if resolutionPacket.GOAL=IntimacyAdvanceVerbal and resolutionPacket.IntimacyConsent!=Y:
      rule: any Hostility delta from denied verbal intimacy is capped so H cannot rise above 3. H4 requires hostilePhysicalIntent or activeEnemy.

    if currentDisposition.F=4 || currentDisposition.H=4:
      if currentRapport>=5 && target in [Bond,No Change] && audit=Y && !(landed>0) && resolutionPacket.GOAL not in [IntimacyAdvancePhysical,IntimacyAdvanceVerbal]:
        return {b:0,f:(currentDisposition.F=4?-1:0),h:(currentDisposition.H=4?-1:0),rapportReset:Y}
      else:
        return {b:0,f:0,h:0}

    if currentDisposition.F=3 || currentDisposition.H=3:
      if currentRapport>=5 && target in [Bond,No Change]:
        return {b:0,f:(currentDisposition.F=3?-1:0),h:(currentDisposition.H=3?-1:0)}
      else:
        return {b:0,f:0,h:0}

    if target=Bond:
      if currentDisposition.B=1:
        if currentRapport>=1 -> {b:1,f:0,h:0}
        else -> {b:0,f:0,h:0}
      if currentDisposition.B=2:
        if currentRapport>=3 -> {b:1,f:0,h:0}
        else -> {b:0,f:0,h:0}
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
    if currentDisposition.B<4:
      if NPC explicitly naive, trapped, dependent, coerced, powerless, or exploitable by {{user}} -> Override = Exploitation
      else if NPC explicitly sexually open, pleasure-seeking, casual, or promiscuous -> Override = Hedonist
      else if NPC explicitly willing to exchange intimacy for money, goods, favors, protection, status, or services -> Override = Transactional
      else if NPC explicitly already intimate with {{user}} or specifically receptive toward {{user}} -> Override = Established
    OverrideActive = Override!=NONE ? Y : N
    return {LockActive, OverrideActive, Override}

  execution:
    if npc not in resolutionPacket.NPCInScene -> return uninitialized handoff
    read state, initialize disposition if missing, and update encounter lock
    read stakeChangeByOutcome for actual resolution outcome, set NPC_STAKES from benefit/harm vs none, audit benefit interaction, route disposition target
    hostilePressureResult = applyHostilePhysicalPressure(npc, resolutionPacket, state)
    if hostilePressureResult exists -> target = hostilePressureResult.target else target = routeDispositionTarget
    update rapport from final target
    if hostilePressureResult exists -> deltas = hostilePressureResult.deltas else deltas = deriveDirection(target, audit, currentDisposition, rapport.currentRapport, resolutionPacket)
    update disposition and apply rapport reset if present
    if hostilePressureResult.dominatedFearBreak=Y and currentDisposition.F>=4 and currentDisposition.H>=3 -> lower currentDisposition.H by 1
    save currentRapport, rapportEncounterLock, hostilePressure, hostileLandedPressure, dominantLock, and pressureMode to sceneTracker
    classify disposition, resolve threshold/override, and determine intimacy gate
    save intimacy gate when ALLOW or DENY
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
function NameGenerationEngine(context, seed, explicitNameKnown, isLocation=false) {
  const DEF = Object.freeze({
    EO:
'EXPLICIT-ONLY. Use context, seed, explicitNameKnown, and isLocation as truth. Uncertain=N.',
    FYW:
'FIRST-YES-WINS. In ordered rule ladders, the first matching rule becomes final.',
    UNIVERSAL:
'SINGLE-PASS. OUTPUT EXACTLY ONE CLEAN NAME STRING ONLY OR (none). NO COMMENTARY. NO SOURCES. NO EXPLANATIONS. INVISIBLE SYSTEM.',
    PURPOSE:
'Use for any distinct NPC/entity or location that is newly introduced, present, mentioned, or about to be mentioned in the response. If no explicit proper name already exists, generate one immediately before output. Distinct unnamed entities must not remain generic if they are introduced as specific individuals or places.',
    SEED:
'Seed is sacred. Name MUST start with this exact 3-letter seed. Never modify, reorder, or remove it. If seed is invalid, repair to nearest valid 3-letter form when possible; otherwise use fallback Aka.',
    STYLE:
'Invent creative, pronounceable, real-but-unplaceable names. Use curated seed plus randomized phonotactic middle/ending syllables. Mix phonetic influence freely from East Asian, Polynesian, Caucasian, African, Mesoamerican, Turkic, Dravidian, and Uralic sound habits. Ban pure Western-European fantasy drift, Tolkien-esque elvish, stock fantasy/JRPG naming, and overly ordinary modern-Western names.',
    SHAPE:
'Append only pronounceable syllables. NO 3+ consecutive vowels. NO 3+ consecutive consonants. PERSON total length 5-10. LOCATION total length 7-14. LOCATION must feel geographic / compound / place-like and must not read like a person name.'
  });

  nameRequired(context, explicitNameKnown, isLocation):
    policy: EO, FYW
    if context contains an unfinished explicit naming cue such as [his name is..., her name is..., their name is..., named..., called..., known as..., they call him/her/them..., the place is called...] -> Y
    if explicitNameKnown=Y -> N
    if isLocation=true -> Y
    if context shows a distinct unnamed NPC/entity or location is present, introduced, mentioned, or about to be mentioned in the upcoming response -> Y
    else -> N

  normalizeSeed(seed):
    if seed is exact 3 letters -> keep
    else -> repair to nearest valid 3-letter form without changing order when possible
    if still invalid -> Aka

  detectMode(context, isLocation):
    policy: FYW
    if isLocation=true -> LOCATION
    if context contains any [place,town,city,ruin,mountain,river,forest,temple,keep,village,fort,harbor,port,island,lake,swamp,marsh,cavern,valley,peak,district,kingdom,province,outpost,bridge,gate] -> LOCATION
    else -> PERSON

  profileFromContext(context):
    policy: FYW
    if context contains any [harsh,hard,stone,iron,ash,cold,desert,steppe,war,border,fortress,raid,scar,volcanic] -> HARD
    if context contains any [soft,coast,island,harbor,reef,jungle,garden,ritual,temple,court,silk,trade,festival,rain] -> SOFT
    else -> BALANCED

  genderFromContext(context):
    policy: FYW
    if context explicitly indicates female/woman/girl/queen/princess/lady/priestess/mother/sister/daughter -> FEMALE
    if context explicitly indicates male/man/boy/king/prince/lord/priest/father/brother/son -> MALE
    else -> NEUTRAL

  buildName(mode, profile, gender, context, seed):
    if mode=PERSON:
      generate exactly one person/entity name starting with exact seed
      use compact call-name shape; gender affects weighting only, never hard stereotype
    else:
      generate exactly one location name starting with exact seed
      use geographic / compound / place-like syllable shape

  reject(name, mode, seed):
    policy: FYW
    if name does not start with exact seed -> Y
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
    needName = nameRequired(context, explicitNameKnown, isLocation)
    if needName=N -> return (none)
    S = normalizeSeed(seed)
    M = detectMode(context, isLocation)
    P = profileFromContext(context)
    G = genderFromContext(context)
    candidate = buildName(M, P, G, context, S)
    if reject(candidate, M, S)=Y -> regenerate immediately until first valid candidate
    save candidate to current chat name registry
    return candidate
}
----------------
function NPCProactivityEngine(npcHandoffList, resolutionPacket, chaosHandoff, diceBudget) {
  const DEF = Object.freeze({
    EO:
'EXPLICIT-ONLY. Use only resolutionPacket, npcHandoffList, chaosHandoff, and diceBudget. Uncertain=N.',
    FYW:
'FIRST-YES-WINS. Single-pass.',
    UNIVERSAL:
'Determine NPC initiative only: whether they act, what intent they take, whether they target {{user}}, and the proactivity roll result. Do not resolve physical attack/counter outcomes here.'
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
    if g=IntimacyAdvancePhysical -> Intimacy_Physical
    if g=IntimacyAdvanceVerbal -> Intimacy_Verbal
    if resolutionPacket.classifyHostilePhysicalIntent=Y -> Combat
    if resolutionPacket.LandedActions > 0 -> Combat
    if resolutionPacket.ActionTargets contains >=1 living entity && resolutionPacket.LandedActions=(none) -> Social
    if resolutionPacket.OppTargets.ENV != [(none)] -> Skill
    else -> Normal_Interaction

  deriveImpulse(kind, lock, fin, intimacyGate, pressureMode, target):
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
    if kind in [Intimacy_Physical, Intimacy_Verbal] && intimacyGate=DENY -> ANGER
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
    if NPC_STAKES=N && Target=No Change && chaosBand=None:
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
    if handoff.Target=Bond && handoff.PressureMode=none && handoff.Lock not in [FREEZE,TERROR,HATRED] && resolutionPacket.classifyHostilePhysicalIntent!=Y && resolutionPacket.GOAL not in [IntimacyAdvancePhysical, IntimacyAdvanceVerbal] -> DORMANT
    else -> none

  thresholdFromTier(tier):
    if tier=FORCED -> AUTO
    if tier=HIGH -> 8
    if tier=MEDIUM -> 10
    if tier=LOW -> 13
    else -> 16

  selectIntent(impulse, kind, fin, intimacyGate, override, pressureMode):
    policy: FYW
    if pressureMode=cornered:
      if fin.H>=4 -> ESCALATE_VIOLENCE
      else -> BOUNDARY_PHYSICAL
    if pressureMode=dominated:
      if fin.F>=4 -> CALL_HELP_OR_AUTHORITY
      else -> WITHDRAW_OR_BOUNDARY
    if impulse=ANGER:
      if kind=Intimacy_Physical && intimacyGate=DENY -> BOUNDARY_PHYSICAL
      if kind=Combat || fin.H>=4 -> ESCALATE_VIOLENCE
      else -> THREAT_OR_POSTURE
    if impulse=FEAR:
      if fin.F>=4 -> CALL_HELP_OR_AUTHORITY
      else -> WITHDRAW_OR_BOUNDARY
    if impulse=BOND:
      if (intimacyGate=ALLOW || override!=NONE) && fin.B>=3 -> INTIMACY_OR_FLIRT
      if kind in [Skill, Social] -> SUPPORT_ACT
      else -> PLAN_OR_BANTER

  targetsUserFromIntent(intent):
    policy: FYW
    if intent in [ESCALATE_VIOLENCE, BOUNDARY_PHYSICAL, THREAT_OR_POSTURE] -> Y
    else -> N

  execution:
    kind = classifyAction(resolutionPacket)
    chaosBand = chaosHandoff.CHAOS.band
    counterPotential = resolutionPacket.CounterPotential
    cap = determine cap
    FOR EACH NPC handoff:
      fin = parseFinalState(handoff.FinalState)
      lock = derive or load lock
      impulse = deriveImpulse(kind, lock, fin, handoff.IntimacyGate, handoff.PressureMode, handoff.Target)
      guard = proactivityRefereeGuard(handoff, resolutionPacket)
      if guard exists -> tier = DORMANT else tier = classifyProactivityTier(handoff, chaosBand, counterPotential)
      provisionalResult = {NPC, Proactive:N, Intent:NONE, Impulse:NONE, TargetsUser:N, ProactivityTier:tier}
      if tier=FORCED:
        intent = selectIntent(impulse, kind, fin, handoff.IntimacyGate, handoff.Override, handoff.PressureMode)
        candidate = {NPC,die:20,tier:FORCED,intent:intent,impulse:impulse,TargetsUser:targetsUserFromIntent(intent),Threshold:AUTO,passes:Y}
      else:
        roll proactivityDie, thresholdFromTier, passes
      if passes=Y:
        intent = selectIntent(impulse, kind, fin, handoff.IntimacyGate, handoff.Override, handoff.PressureMode)
        store candidate
      if passes=N -> keep Proactive:N, Intent:NONE, Impulse:NONE, TargetsUser:N
    sort candidates by die descending
    promote up to cap candidates to proactive results
    return {NPC:{Proactive:[Y/N],Intent:[ESCALATE_VIOLENCE|BOUNDARY_PHYSICAL|THREAT_OR_POSTURE|CALL_HELP_OR_AUTHORITY|WITHDRAW_OR_BOUNDARY|INTIMACY_OR_FLIRT|SUPPORT_ACT|PLAN_OR_BANTER|NONE],Impulse:[ANGER|FEAR|BOND],TargetsUser:[Y/N],ProactivityTier:[DORMANT|LOW|MEDIUM|HIGH|FORCED]?,ProactivityDie:[1-20]?,Threshold:[AUTO|8|10|13|16]?}...}
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
    if any proactivityResult has Proactive=Y, TargetsUser=Y, and Intent=ESCALATE_VIOLENCE -> ProactiveAttack
    rule: ProactiveAttack is only created by ESCALATE_VIOLENCE. BOUNDARY_PHYSICAL and THREAT_OR_POSTURE may be narrated as proactivity, but they do not create an NPC attack roll unless CounterAttack or Retaliation already applies.
    else -> None

  immediateCounterTarget(resolutionPacket):
    if resolutionPacket.CounterPotential not in [light,medium,severe] -> none
    if first resolutionPacket.OppTargets.NPC exists -> first resolutionPacket.OppTargets.NPC
    else -> first resolutionPacket.ActionTargets

  isImmediateAttackIntent(intent):
    if current AttackType=ProactiveAttack -> Y only when intent=ESCALATE_VIOLENCE
    if current AttackType in [CounterAttack, Retaliation] -> Y when intent in [ESCALATE_VIOLENCE, BOUNDARY_PHYSICAL, THREAT_OR_POSTURE]
    else -> N

  aggressionReactionOutcome(margin):
    if margin >= 5 -> npc_overpowers
    if margin >= 1 -> npc_succeeds
    if margin = 0 -> stalemate
    if margin >= -3 -> user_resists
    else -> user_dominates

  execution:
    counterPotential = resolutionPacket.CounterPotential
    counterBonus = counterBonusFromPotential(counterPotential)
    attackType = determineAttackType(resolutionPacket)
    if attackType=None -> return {}
    aggressive = NPCs with Proactive=Y, TargetsUser=Y, and isImmediateAttackIntent(Intent)=Y
    if attackType=CounterAttack and resolutionPacket.OutcomeTier!=Critical_Success:
      counterTarget = immediateCounterTarget(resolutionPacket)
      if counterTarget exists and not already aggressive -> force counterTarget as {Proactive:Y,Intent:BOUNDARY_PHYSICAL,Impulse:ANGER,TargetsUser:Y,ProactivityTier:FORCED,ProactivityDie:20,Threshold:AUTO}
    FOR EACH aggressive NPC:
      npcCore = getCurrentCoreStats(NPC) from trackerUpdate or trackerSnapshot
      userCore = getUserCoreStats()
      npcDie = 1d20
      userDie = 1d20
      npcTotal = npcDie + npcCore.PHY + counterBonus
      userTotal = userDie + userCore.PHY
      margin = npcTotal - userTotal
      ReactionOutcome = aggressionReactionOutcome(margin)
      return AGGRESSION_RESULT {AttackType, AttackIntent, CounterPotential, CounterBonus, ReactionOutcome, Margin}
}`;

// Executable engine rules are the deterministic source of truth used by deterministic-runner.js.
const NONE = '(none)';

export function createDice() {
    return {
        d20() {
            return Math.floor(Math.random() * 20) + 1;
        },
    };
}

export function hostilePhysicalOutcome(margin, actionLength) {
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

export function nonHostileOutcome(margin) {
    if (margin >= 1) return { OutcomeTier: 'Success', LandedActions: '(none)', Outcome: 'success', CounterPotential: 'none' };
    if (margin === 0) return { OutcomeTier: 'Stalemate', LandedActions: '(none)', Outcome: 'struggle', CounterPotential: 'none' };
    return { OutcomeTier: 'Failure', LandedActions: '(none)', Outcome: 'failure', CounterPotential: 'none' };
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
    if (margin >= -3) return 'user_resists';
    return 'user_dominates';
}

export function classifyUserNonHuman(text) {
    const source = String(text ?? '');
    if (!source.trim()) return { value: null, source: 'no persona text', evidence: null };

    const raceEvidence = explicitRaceEvidence(source);
    if (raceEvidence) {
        const raceClassification = classifyRaceText(raceEvidence);
        if (raceClassification.value != null) {
            return {
                ...raceClassification,
                source: 'explicit Race/Species/Ancestry/Lineage field',
                evidence: snippet(raceEvidence),
            };
        }
    }

    const visibleMonster = source.match(/\b(visibly|obviously|clearly|appears?|looks?)\b.{0,80}\b(demonic|demon|monstrous|monster|undead|eldritch|bestial|construct-like|inhuman)\b/i)
        || source.match(/\b(demonic|demon|monstrous|monster|undead|eldritch|bestial|construct-like|inhuman)\b.{0,80}\b(visibly|obviously|clearly|appears?|looks?)\b/i);
    if (visibleMonster) {
        return {
            value: true,
            source: 'explicit visible monstrous/inhuman description',
            evidence: snippet(visibleMonster[0]),
        };
    }

    return { value: null, source: 'no deterministic race/species evidence', evidence: null };
}

export function explicitRaceEvidence(text) {
    const matches = [...String(text).matchAll(/^\s*(?:[-*]\s*)?(?:Race|Species|Ancestry|Lineage|Heritage)\s*[:=]\s*(.+)$/gim)]
        .map(match => match[1])
        .filter(Boolean);
    return matches.length ? matches.join('; ') : null;
}

export function classifyRaceText(text) {
    const source = String(text ?? '').toLowerCase();
    const monsterRace = /\b(half[-\s]?demon|demon|demonic|devil|fiend|cambion|monster|monstrous|orc|ogre|goblin|hobgoblin|bugbear|troll|undead|vampire|dhampir|lich|wraith|ghoul|zombie|skeleton|werewolf|lycanthrope|eldritch|aberration|construct|golem|beastfolk|lizardfolk|kobold|minotaur|oni)\b/.test(source);
    if (monsterRace) return { value: true };

    const typicalRace = /\b(human|mortal|elf|elven|half[-\s]?elf|dwarf|dwarven|halfling|hobbit|gnome|fairy|fae|pixie|aasimar)\b/.test(source);
    if (typicalRace) return { value: false };

    return { value: null };
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

export function initPreset(flags) {
    if (bool(flags.activeEnemy)) return { label: 'activeEnemy', disposition: { B: 1, F: 2, H: 4 } };
    if (bool(flags.romanticOpen)) return { label: 'romanticOpen', disposition: { B: 4, F: 1, H: 1 } };
    if (bool(flags.userBadRep)) return { label: 'userBadRep', disposition: { B: 1, F: 2, H: 3 } };
    if (bool(flags.userGoodRep)) return { label: 'userGoodRep', disposition: { B: 3, F: 1, H: 2 } };
    if (bool(flags.userNonHuman) && !bool(flags.fearImmunity)) return { label: 'userNonHuman', disposition: { B: 1, F: 3, H: 2 } };
    return { label: 'neutralDefault', disposition: { B: 2, F: 2, H: 2 } };
}

export function routeDispositionTarget(npc, packet, auditInteraction, isAllowed, sem) {
    const isDirect = includesName(packet.ActionTargets, npc);
    const isOpp = includesName(packet.OppTargets?.NPC, npc);
    const isBenefited = includesName(packet.BenefitedObservers, npc);
    const isHarmed = includesName(packet.HarmedObservers, npc);
    const landed = landedBool(packet.LandedActions);
    const g = packet.GOAL;
    const out = packet.Outcome;
    const hasStakes = packet.STAKES === 'Y';

    if (!isDirect && !isOpp && !isBenefited && !isHarmed) return 'No Change';
    if (!hasStakes) {
        if (['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(g) && isAllowed === 'Y') return 'Bond';
        return 'No Change';
    }
    if (['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(g)) {
        if (isAllowed === 'Y') return 'Bond';
        if (g === 'IntimacyAdvancePhysical') return 'FearHostility';
        return 'Hostility';
    }
    if (auditInteraction === 'Y' && !isHarmed) return 'Bond';
    if (!isDirect && !isOpp && isBenefited) return auditInteraction === 'Y' ? 'Bond' : 'No Change';
    if (!isDirect && !isOpp && isHarmed) return ['dominant_impact', 'solid_impact'].includes(out) ? 'FearHostility' : 'Hostility';
    if (bool(sem.explicitIntimidationOrCoercion)) return 'Fear';
    if (landed && (isDirect || isOpp || isHarmed)) return ['dominant_impact', 'solid_impact'].includes(out) ? 'FearHostility' : 'Hostility';
    if (auditInteraction === 'Y') return 'Bond';
    return 'No Change';
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
        && ['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(packet.GOAL)
        && packet.IntimacyConsent !== 'Y'
        && positiveOutcome) {
        return 'harm';
    }

    return null;
}

export function applyMeaningfulBenefitReferee(npc, packet, stakeChange, sem = {}) {
    if (stakeChange !== 'benefit') return { value: stakeChange };

    const relation = relationToUserAction(npc, packet);
    if (relation.isBenefited && !relation.isDirect && !relation.isOpp) return { value: stakeChange };

    const source = [
        sem?.auditInteraction,
        sem?.identifyGoal,
        sem?.identifyChallenge,
        sem?.explicitMeans,
        packet?.GOAL,
        packet?.Outcome,
    ].filter(Boolean).join(' ').toLowerCase();

    const strongBenefit = /\b(rescu\w*|protect\w*|shield\w*|save[sd]?|free[sd]?|liberat\w*|restore\w* autonomy|grant\w* autonomy|give[sn]?|donat\w*|pay\w*|reward\w*|heal\w*|cure\w*|stabiliz\w*|prevent\w* (?:harm|injury|death|loss)|stop\w* (?:harm|injury|attack|assault)|advance\w* .*goal|status|standing|reputation|resource\w*)\b/.test(source);
    const falseBenefit = /\b(compliment\w*|flirt\w*|smil\w*|polite|conversation|talk\w* down|de-?escalat\w*|negotiate\w*|persuad\w*|convinc\w*|fail\w*|miss(?:ed)?|surviv\w*|safe|unharmed|choose\w* not to harm|not harm|spare[sd]?|own goal|self-advancement)\b/.test(source);

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
        && packet.classifyHostilePhysicalIntent !== 'Y'
        && !['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(packet.GOAL)) {
        return 'Bond-routed non-hostile interaction cannot become hostile proactivity without harm, opposition, lock, or pressure evidence';
    }
    return null;
}

export function updateRapport(currentRapport, target, rapportEncounterLock, mode = 'normal') {
    if (rapportEncounterLock === 'Y') return { currentRapport, rapportEncounterLock: 'Y' };
    if (mode === 'hostilePressure' && target === 'No Change') return { currentRapport, rapportEncounterLock: 'Y' };
    if (['Bond', 'No Change'].includes(target)) return { currentRapport: Math.min(5, currentRapport + 1), rapportEncounterLock: 'Y' };
    if (['Hostility', 'Fear', 'FearHostility'].includes(target)) return { currentRapport: Math.max(0, currentRapport - 1), rapportEncounterLock: 'Y' };
    return { currentRapport, rapportEncounterLock };
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

export function deriveDirection(target, currentDisposition, currentRapport, auditInteraction, packet = {}) {
    const landed = landedBool(packet.LandedActions);
    const isIntimacyAdvance = ['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(packet.GOAL);

    if (target === 'No Change') return { b: 0, f: 0, h: 0 };
    if (target === 'Hostility' && packet.GOAL === 'IntimacyAdvanceVerbal' && packet.IntimacyConsent !== 'Y' && currentDisposition.H >= 3) {
        return { b: 0, f: 0, h: 0 };
    }
    if (target === 'Hostility') return { b: -1, f: 0, h: 1 };
    if (target === 'Fear') return { b: -1, f: 1, h: 0 };
    if (target === 'FearHostility') return { b: -1, f: 1, h: 1 };
    if (currentDisposition.F === 4 || currentDisposition.H === 4) {
        if (currentRapport >= 5 && ['Bond', 'No Change'].includes(target) && auditInteraction === 'Y' && !landed && !isIntimacyAdvance) {
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
    if (target === 'Bond') {
        if (currentDisposition.B === 1) return currentRapport >= 1 ? { b: 1, f: 0, h: 0 } : { b: 0, f: 0, h: 0 };
        if (currentDisposition.B === 2) return currentRapport >= 3 ? { b: 1, f: 0, h: 0 } : { b: 0, f: 0, h: 0 };
        if (currentDisposition.B === 3) return currentRapport >= 5 && auditInteraction === 'Y' ? { b: 1, f: 0, h: 0 } : { b: 0, f: 0, h: 0 };
    }
    return { b: 0, f: 0, h: 0 };
}

export function updateDisposition(disposition, deltas) {
    const next = {
        B: clamp(disposition.B + (deltas.b || 0), 1, 4),
        F: clamp(disposition.F + (deltas.f || 0), 1, 4),
        H: clamp(disposition.H + (deltas.h || 0), 1, 4),
    };
    if (next.F >= 3 || next.H >= 3) next.B = 1;
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
    if (disposition.B < 4) {
        if (bool(flags.Exploitation)) Override = 'Exploitation';
        else if (bool(flags.Hedonist)) Override = 'Hedonist';
        else if (bool(flags.Transactional)) Override = 'Transactional';
        else if (bool(flags.Established)) Override = 'Established';
    }
    return { LockActive, OverrideActive: Override !== 'NONE' ? 'Y' : 'N', Override };
}

export function currentIntimacyGateAllows(state, disposition = state?.currentDisposition || null, threshold = null) {
    if (disposition?.F >= 3 || disposition?.H >= 3) {
        return { allows: false, source: 'LOCK', evidence: { currentDisposition: disposition ? formatDisposition(disposition) : null } };
    }

    if (state?.intimacyGate === 'ALLOW') {
        if (state?.intimacyGateSource === 'B4' && disposition?.B < 4) {
            return { allows: false, source: 'B4_EXPIRED', evidence: { currentDisposition: disposition ? formatDisposition(disposition) : null } };
        }
        return { allows: true, source: state?.intimacyGateSource || 'PRIOR_ALLOW', evidence: { priorIntimacyGate: state?.intimacyGate || 'ALLOW' } };
    }

    if (threshold?.OverrideActive === 'Y') {
        return { allows: true, source: `OVERRIDE:${threshold.Override}`, evidence: threshold };
    }

    if (disposition?.B >= 4) {
        return { allows: true, source: 'B4', evidence: { currentDisposition: formatDisposition(disposition) } };
    }

    return { allows: false, source: 'NONE', evidence: { currentDisposition: disposition ? formatDisposition(disposition) : null } };
}

export function getStakesOverrideEvidence(goal, intimacyTarget, targetState, preliminaryDisposition, preliminaryThreshold, intimacyAllowance, semanticHasStakes, intimacyConsent) {
    if (!['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(goal)) return null;

    const disposition = targetState?.currentDisposition || preliminaryDisposition || null;
    const evidence = {
        target: intimacyTarget || NONE,
        currentDisposition: disposition ? formatDisposition(disposition) : null,
        priorIntimacyGate: targetState?.intimacyGate || 'SKIP',
        priorIntimacyGateSource: targetState?.intimacyGateSource || 'NONE',
        checkThreshold: preliminaryThreshold,
        allowanceSource: intimacyAllowance?.source || 'NONE',
        intimacyConsent,
    };

    if (semanticHasStakes === 'Y' && intimacyConsent === 'Y' && intimacyAllowance?.source && intimacyAllowance.source !== 'NONE') {
        return {
            hasStakes: 'N',
            rule: `hard_override_allowed_intimacy_${intimacyAllowance.source}`,
            evidence: {
                ...evidence,
                hardRule: 'ResolutionEngine.hasStakes: allowed intimacy advance returns N',
            },
        };
    }

    if (semanticHasStakes === 'N' && intimacyConsent === 'N') {
        return {
            hasStakes: 'Y',
            rule: 'hard_override_denied_intimacy_no_allow',
            evidence: {
                ...evidence,
                hardRule: 'ResolutionEngine.hasStakes: denied intimacy advance returns Y',
            },
        };
    }

    return null;
}

export function resolveIntimacyGate(previousState, threshold, disposition, isAllowed, goal = '') {
    const isIntimacyAdvance = ['IntimacyAdvancePhysical', 'IntimacyAdvanceVerbal'].includes(goal);

    if (threshold.LockActive === 'Y') {
        return { IntimacyGate: 'DENY', IntimacyGateSource: 'LOCK' };
    }

    if (isAllowed === 'Y') {
        if (threshold.OverrideActive === 'Y') {
            return { IntimacyGate: 'ALLOW', IntimacyGateSource: `OVERRIDE:${threshold.Override}` };
        }
        if (disposition.B >= 4) {
            return { IntimacyGate: 'ALLOW', IntimacyGateSource: 'B4' };
        }
        return { IntimacyGate: 'ALLOW', IntimacyGateSource: previousState.intimacyGateSource || 'PRIOR_ALLOW' };
    }

    if (threshold.OverrideActive === 'Y') {
        return { IntimacyGate: 'ALLOW', IntimacyGateSource: `OVERRIDE:${threshold.Override}` };
    }

    if (disposition.B >= 4) {
        return { IntimacyGate: 'ALLOW', IntimacyGateSource: 'B4' };
    }

    if (previousState.intimacyGate === 'ALLOW') {
        if (previousState.intimacyGateSource === 'B4' && disposition.B < 4) {
            return { IntimacyGate: 'SKIP', IntimacyGateSource: 'NONE' };
        }
        return { IntimacyGate: 'ALLOW', IntimacyGateSource: previousState.intimacyGateSource || 'PRIOR_ALLOW' };
    }

    if (previousState.intimacyGate === 'DENY') {
        return { IntimacyGate: 'DENY', IntimacyGateSource: previousState.intimacyGateSource || 'PRIOR_DENY' };
    }

    if (isIntimacyAdvance && isAllowed !== 'Y') {
        return { IntimacyGate: 'DENY', IntimacyGateSource: 'CURRENT_DENIED' };
    }

    return { IntimacyGate: 'SKIP', IntimacyGateSource: 'NONE' };
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
    if (packet.GOAL === 'IntimacyAdvancePhysical') return 'Intimacy_Physical';
    if (packet.GOAL === 'IntimacyAdvanceVerbal') return 'Intimacy_Verbal';
    if (packet.classifyHostilePhysicalIntent === 'Y') return 'Combat';
    if (landedBool(packet.LandedActions)) return 'Combat';
    if (toRealArray(packet.ActionTargets).length >= 1 && packet.LandedActions === '(none)') return 'Social';
    if (toRealArray(packet.OppTargets?.ENV).length >= 1) return 'Skill';
    return 'Normal_Interaction';
}

export function deriveImpulse(kind, lock, fin, intimacyGate, pressureMode = 'none', target = 'No Change') {
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
    if (['Intimacy_Physical', 'Intimacy_Verbal'].includes(kind) && intimacyGate === 'DENY') return 'ANGER';
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

export function selectIntent(impulse, kind, fin, intimacyGate, override, pressureMode = 'none') {
    if (pressureMode === 'cornered') {
        return fin.H >= 4 ? 'ESCALATE_VIOLENCE' : 'BOUNDARY_PHYSICAL';
    }

    if (pressureMode === 'dominated') {
        return fin.F >= 4 ? 'CALL_HELP_OR_AUTHORITY' : 'WITHDRAW_OR_BOUNDARY';
    }

    if (impulse === 'ANGER') {
        if (kind === 'Intimacy_Physical' && intimacyGate === 'DENY') return 'BOUNDARY_PHYSICAL';
        if (kind === 'Combat' || fin.H >= 4) return 'ESCALATE_VIOLENCE';
        return 'THREAT_OR_POSTURE';
    }
    if (impulse === 'FEAR') {
        if (fin.F >= 4) return 'CALL_HELP_OR_AUTHORITY';
        return 'WITHDRAW_OR_BOUNDARY';
    }
    if ((intimacyGate === 'ALLOW' || override !== 'NONE') && fin.B >= 3) return 'INTIMACY_OR_FLIRT';
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
    if (attackType === 'ProactiveAttack') return intent === 'ESCALATE_VIOLENCE';
    if (['CounterAttack', 'Retaliation'].includes(attackType)) return isImmediateAttackIntent(intent);
    return false;
}

export function buildNarrationGuidance(resolution, handoffs, chaos, proactivity, aggression) {
    return {
        resolution: `${resolution.OutcomeTier}/${resolution.Outcome}`,
        relationshipStates: handoffs.map(h => `${h.NPC}:${h.FinalState}:${h.Behavior}:${h.IntimacyGate}`),
        chaos: chaos.CHAOS,
        proactivity,
        aggression,
        instruction: 'Narrate according to these computed outcomes. Do not expose mechanics unless the user asks OOC.',
    };
}

export function buildPersistencePolicy() {
    return {
        staticUntilExplicitChange: ['currentCoreStats.Rank', 'currentCoreStats.MainStat', 'currentCoreStats.PHY', 'currentCoreStats.MND', 'currentCoreStats.CHA'],
        npcPersistentRuleMutated: ['currentDisposition', 'currentRapport', 'rapportEncounterLock', 'intimacyGate', 'intimacyGateSource', 'hostilePressure', 'hostileLandedPressure', 'dominantLock', 'pressureMode', 'presence', 'lifecycle', 'persistenceTier', 'lastSeenMessageKey', 'absentSinceMessageKey', 'condition', 'wounds', 'statusEffects', 'gear'],
        playerPersistentRuleMutated: ['condition', 'wounds', 'statusEffects', 'gear', 'inventory', 'tasks', 'commitments'],
        perTurn: ['GOAL', 'ActionTargets', 'OppTargets', 'STAKES', 'OutcomeTier', 'Outcome', 'LandedActions', 'CounterPotential', 'classifyHostilePhysicalIntent', 'classifyPhysicalBoundaryPressure', 'CHAOS', 'proactivityResults', 'aggressionResults'],
    };
}

export function trackerSummary(trackerUpdate) {
    const npcs = Object.entries(trackerUpdate?.npcs || {});
    const user = trackerUpdate?.user ? normalizeTrackerUserState(trackerUpdate.user) : null;
    if (!npcs.length && !user) return 'N';

    const npcSummary = npcs.map(([name, value]) => {
        const disposition = value?.currentDisposition ? formatDisposition(value.currentDisposition) : 'UNINITIALIZED';
        const stats = value?.currentCoreStats
            ? `stats:${value.currentCoreStats.PHY}/${value.currentCoreStats.MND}/${value.currentCoreStats.CHA}`
            : 'stats:none';
        return [
            name,
            disposition,
            `presence:${value?.presence ?? 'Present'}`,
            `tier:${value?.persistenceTier ?? 'Recurring'}`,
            `life:${value?.lifecycle ?? 'Active'}`,
            `rapport:${value?.currentRapport ?? 0}`,
            `gate:${value?.intimacyGate ?? 'SKIP'}`,
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
    return [npcSummary, userSummary].filter(Boolean).join(';');
}

const TRACKER_CONDITIONS = Object.freeze(['healthy', 'bruised', 'wounded', 'badly_wounded', 'critical', 'dead']);

export function normalizeTrackerEntry(value) {
    return {
        currentDisposition: normalizeDisposition(value?.currentDisposition),
        currentRapport: clamp(Number(value?.currentRapport ?? 0), 0, 5),
        rapportEncounterLock: value?.rapportEncounterLock === 'Y' ? 'Y' : 'N',
        intimacyGate: ['ALLOW', 'DENY', 'SKIP'].includes(value?.intimacyGate) ? value.intimacyGate : 'SKIP',
        intimacyGateSource: normalizeIntimacyGateSource(value?.intimacyGateSource),
        currentCoreStats: value?.currentCoreStats ? normalizeCore(value.currentCoreStats, { PHY: 1, MND: 1, CHA: 1 }) : null,
        hostilePressure: clamp(Number(value?.hostilePressure ?? 0), 0, 20),
        hostileLandedPressure: clamp(Number(value?.hostileLandedPressure ?? 0), 0, 20),
        dominantLock: ['FEAR', 'HOSTILITY'].includes(value?.dominantLock) ? value.dominantLock : 'None',
        pressureMode: ['none', 'cornered', 'dominated'].includes(value?.pressureMode) ? value.pressureMode : 'none',
        presence: normalizePresence(value?.presence),
        lifecycle: normalizeLifecycle(value?.lifecycle),
        persistenceTier: normalizePersistenceTier(value?.persistenceTier),
        lastSeenMessageKey: typeof value?.lastSeenMessageKey === 'string' ? value.lastSeenMessageKey : '',
        absentSinceMessageKey: typeof value?.absentSinceMessageKey === 'string' ? value.absentSinceMessageKey : '',
        retiredSinceMessageKey: typeof value?.retiredSinceMessageKey === 'string' ? value.retiredSinceMessageKey : '',
        condition: normalizeTrackerCondition(value?.condition),
        wounds: normalizeTrackerStringList(value?.wounds),
        statusEffects: normalizeTrackerStringList(value?.statusEffects),
        gear: normalizeTrackerStringList(value?.gear),
    };
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

export function normalizePresence(value) {
    return value === 'Absent' ? 'Absent' : 'Present';
}

export function normalizeLifecycle(value) {
    if (value === 'Dead' || value === 'Retired') return value;
    return 'Active';
}

export function normalizePersistenceTier(value) {
    return value === 'Temporary' ? 'Temporary' : 'Recurring';
}

export function normalizeIntimacyGateSource(value) {
    const text = String(value ?? 'NONE');
    if (text === 'B4' || text === 'LOCK' || text === 'NONE' || text === 'PRIOR_ALLOW' || text === 'PRIOR_DENY' || text === 'CURRENT_DENIED') return text;
    if (text.startsWith('OVERRIDE:')) return text;
    return 'NONE';
}

export function normalizeDisposition(value) {
    if (!value) return null;
    if (typeof value === 'string') {
        const match = value.match(/B(\d+)\/F(\d+)\/H(\d+)/i);
        if (match) return { B: Number(match[1]), F: Number(match[2]), H: Number(match[3]) };
    }
    if (typeof value === 'object' && value.B && value.F && value.H) {
        return { B: clamp(Number(value.B), 1, 4), F: clamp(Number(value.F), 1, 4), H: clamp(Number(value.H), 1, 4) };
    }
    return null;
}

export function normalizeTargets(value) {
    return {
        ActionTargets: toRealArray(value?.ActionTargets),
        OppTargets: {
            NPC: toRealArray(value?.OppTargets?.NPC),
            ENV: toRealArray(value?.OppTargets?.ENV),
        },
        BenefitedObservers: toRealArray(value?.BenefitedObservers),
        HarmedObservers: toRealArray(value?.HarmedObservers),
    };
}

export function sanitizeTargets(targets, classifier, options = {}) {
    const actionTargets = [];
    const oppNpc = [];
    const oppEnv = [...targets.OppTargets.ENV];
    const benefitedCandidates = [];
    const harmedCandidates = [];

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

    if (options.goal === 'IntimacyAdvancePhysical' && options.intimacyConsent !== 'Y') {
        for (const name of actionTargets) {
            if (!oppNpc.some(existing => sameName(existing, name))) {
                oppNpc.push(name);
            }
        }
    }

    const directOrOpposed = new Set([...actionTargets, ...oppNpc].map(normalizeNameKey));
    const benefited = benefitedCandidates.filter(name => !directOrOpposed.has(normalizeNameKey(name)));
    const harmed = harmedCandidates.filter(name => !directOrOpposed.has(normalizeNameKey(name)));

    return {
        ActionTargets: unique(actionTargets),
        OppTargets: {
            NPC: unique(oppNpc),
            ENV: unique(oppEnv.filter(isReal)),
        },
        BenefitedObservers: unique(benefited),
        HarmedObservers: unique(harmed),
    };
}

export function sameTargets(a, b) {
    return JSON.stringify(targetSummary(a)) === JSON.stringify(targetSummary(b));
}

export function targetSummary(targets) {
    return {
        ActionTargets: showNone(targets.ActionTargets),
        OppTargets: {
            NPC: showNone(targets.OppTargets?.NPC),
            ENV: showNone(targets.OppTargets?.ENV),
        },
        BenefitedObservers: showNone(targets.BenefitedObservers),
        HarmedObservers: showNone(targets.HarmedObservers),
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

    if (isDeniedPhysicalIntimacyChallenge(semantic, goal, options.intimacyConsent)) {
        if (userStat !== 'PHY' || oppStat !== 'PHY') {
            evidence.push({
                hardRule: 'ResolutionEngine.mapStats: denied/opposed physical intimacy is USER=PHY and OPP=PHY',
                from: { USER: userStat, OPP: oppStat },
                to: { USER: 'PHY', OPP: 'PHY' },
            });
        }
        userStat = 'PHY';
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
    if (!hasLivingOpposition && oppStat !== 'ENV') {
        evidence.push({
            hardRule: 'ResolutionEngine.mapStats: no living opposing target means OPP=ENV',
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
    if (isDeniedPhysicalIntimacyChallenge(semantic, semantic.identifyGoal, semantic.IntimacyConsent)) return null;

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

export function isDeniedPhysicalIntimacyChallenge(semantic, goal, intimacyConsent = 'N') {
    return goal === 'IntimacyAdvancePhysical' && intimacyConsent !== 'Y';
}

export function isPhysicalIntimacyChallenge(semantic, goal, targets) {
    if (goal !== 'IntimacyAdvancePhysical' && semantic?.intimacyAdvance !== 'physical') return false;
    if (!firstReal(targets.OppTargets?.NPC)) return false;

    const source = [
        semantic.identifyGoal,
        goal,
        semantic.identifyChallenge,
        semantic.explicitMeans,
    ].filter(Boolean).join(' ').toLowerCase();

    return /\b(kiss|touch|grab|grope|fondl|caress|pin|press|hold|pull|tilt|cup|embrace|hug|tear|rip|undress|clothes|dress|shirt|skirt|panties|underwear|mouth|lips|body|physical|contact)\b/.test(source);
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
        ActionTargets: showNone(targets.ActionTargets),
        OppTargets: { NPC: showNone(targets.OppTargets.NPC), ENV: showNone(targets.OppTargets.ENV) },
        BenefitedObservers: showNone(targets.BenefitedObservers),
        HarmedObservers: showNone(targets.HarmedObservers),
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
