export function formatPreFlightPending() {
    return String.raw`<pre_flight>
[STRUCTURED_PREFLIGHT_RUNTIME v0.3 - AUDIT ONLY]
DO NOT EXECUTE THIS BLOCK.
No computed handoff is available yet. The extension will replace this with a computed audit block immediately before generation.
</pre_flight>`;
}

export function formatNarratorPromptPending() {
    return String.raw`[STRUCTURED_PREFLIGHT_NARRATOR_CONTEXT v0.4 - PENDING]
No computed handoff is available yet.
Narrate normally.`;
}

export function formatPreFlightError(error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return String.raw`<pre_flight>
[STRUCTURED_PREFLIGHT_RUNTIME v0.3 - AUDIT ONLY]
DO NOT EXECUTE THIS BLOCK.
The deterministic pre-flight runner failed before narration.
ERROR=${message}
</pre_flight>`;
}

export function formatNarratorPromptError(error) {
    const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return String.raw`[STRUCTURED_PREFLIGHT_NARRATOR_CONTEXT v0.4 - ERROR]
The deterministic pre-flight runner failed before narration.
ERROR=${message}
Narrate normally from available chat context.`;
}

export function formatPreFlightDebug(report) {
    const semanticLedger = buildReadableSemanticDebug(report?.semanticLedger ?? {});
    const deterministic = buildReadableDeterministicDebug(report?.finalNarrativeHandoff ?? {});

    const lines = [
        '<pre_flight>',
        '[STRUCTURED_PREFLIGHT_RUNTIME v0.9 - SIMPLE DEBUG]',
        'DO NOT EXECUTE THIS BLOCK.',
        'This shows model-filled semantic fields, then deterministic engine decisions.',
        'Use the narrator prompt context echo below as the final authoritative narration handoff.',
        '==MODEL_FILLED_FIELDS==',
        '',
        ...semanticLedger,
        '',
        '==DETERMINISTIC_ENGINE_OUTPUT==',
        '',
        ...deterministic,
        '</pre_flight>',
    ];

    return lines.join('\n');
}

function buildReadableSemanticDebug(ledger) {
    const resolution = ledger?.resolutionEngine ?? {};
    const targets = resolution.identifyTargets ?? {};
    const oppTargets = targets.OppTargets ?? {};
    const relationships = Array.isArray(ledger?.relationshipEngine) ? ledger.relationshipEngine : [];
    const chaos = ledger?.chaosSemantic ?? {};
    const tracker = ledger?.trackerUpdateEngine ?? {};
    const userKnowledgeApplications = Array.isArray(ledger?.userKnowledgeApplication?.applications) ? ledger.userKnowledgeApplication.applications : [];
    const powerActorAssessments = Array.isArray(ledger?.powerActorEnmity?.assessments) ? ledger.powerActorEnmity.assessments : [];
    const powerActors = Array.isArray(ledger?.powerActorEnmity?.effects) ? ledger.powerActorEnmity.effects : [];
    const powerEventShapes = Array.isArray(ledger?.powerEventShape?.events) ? ledger.powerEventShape.events : [];
    const userCore = ledger?.engineContext?.userCoreStats ?? {};
    const trackerNpcs = Array.isArray(ledger?.engineContext?.trackerRelevantNPCs)
        ? ledger.engineContext.trackerRelevantNPCs
        : [];

    const lines = [
        'engineContext.userCoreStats=' + inline({
            PHY: userCore.PHY ?? 1,
            MND: userCore.MND ?? 1,
            CHA: userCore.CHA ?? 1,
        }),
        'engineContext.trackerRelevantNPCs=' + (trackerNpcs.map(npc => [
            npc.NPC ?? '(none)',
            npc.currentDisposition ?? 'null',
            `rapport:${npc.currentRapport ?? 0}`,
            `cond:${npc.condition ?? 'healthy'}`,
        ].join('/')).join('; ') || 'none'),
        '',
        'ResolutionEngine:',
        'identifyGoal=' + valueOrNone(resolution.identifyGoal),
        'identifyChallenge=' + valueOrNone(resolution.identifyChallenge),
        'explicitMeans=' + valueOrNone(resolution.explicitMeans),
        'userAbilityUse=' + userAbilityUseSummary(resolution.userAbilityUse),
        'itemUse=' + itemUseSummary(resolution.itemUse),
        'claimCheck=' + claimCheckSummary(resolution.claimCheck),
        'userKnowledgeApplication=' + userKnowledgeApplicationSummary(userKnowledgeApplications),
        'identifyTargets:',
        'hostilesInScene.NPC=' + list(targets.hostilesInScene?.NPC),
        'ActionTargets=' + list(targets.ActionTargets),
        'OppTargets.NPC=' + list(oppTargets.NPC),
        'OppTargets.ENV=' + list(oppTargets.ENV),
        'BenefitedObservers=' + list(targets.BenefitedObservers),
        'HarmedObservers=' + list(targets.HarmedObservers),
        'PowerActors=' + list(targets.PowerActors),
        'intimacyAdvanceExplicit=' + String(Boolean(resolution.intimacyAdvanceExplicit)),
        'boundaryViolationExplicit=' + String(Boolean(resolution.boundaryViolationExplicit)),
        'rollNeeded=' + String(Boolean(resolution.rollNeeded)),
        'rollReason=' + valueOrNone(resolution.rollReason),
        'actionBucket=' + valueOrNone(resolution.actionBucket),
        'socialBucket=' + valueOrNone(resolution.socialBucket),
        'combatType=' + valueOrNone(resolution.combatType),
        'actionCount=' + list(resolution.actionCount),
        'actionUnits=' + actionUnitsSummary(resolution.actionUnits, { includeEvidence: true }),
        'environmentDifficultyTier=' + valueOrNone(resolution.environmentDifficultyTier),
        'environmentDifficultyBonus=' + valueOrNone(resolution.environmentDifficulty),
        'classifyHostilePhysicalIntent=' + String(Boolean(resolution.classifyHostilePhysicalIntent)),
        'activeHostileThreat=' + String(Boolean(resolution.activeHostileThreat)),
        'classifyPhysicalBoundaryPressure=' + String(Boolean(resolution.classifyPhysicalBoundaryPressure)),
        'genStats=' + coreLine(resolution.genStats),
        '',
        'RelationshipEngine:',
        relationships.length ? '' : 'none',
        ...relationships.flatMap((item, index) => [
            `NPC[${index}]=${valueOrNone(item.NPC)}`,
            `explicitIntimidationOrCoercion=${Boolean(item.explicitIntimidationOrCoercion)}`,
            `stakeChangeByOutcome=${inline(item.stakeChangeByOutcome ?? {})}`,
            `overrideFlags=${inline(item.overrideFlags ?? {})}`,
            `genStats=${coreLine(item.genStats)}`,
            '',
        ]),
        '',
        'chaosSemantic.sceneSummary=' + valueOrNone(chaos.sceneSummary),
        'trackerUpdateEngine=' + inline(tracker),
        'powerActorEnmity.assessments=' + (powerActorAssessments.length ? inline(powerActorAssessments) : 'none'),
        'powerActorEnmity.effects=' + (powerActors.length ? inline(powerActors) : 'none'),
        'powerEventShape.events=' + (powerEventShapes.length ? inline(powerEventShapes) : 'none'),
        'nameGeneration=deterministic style-aware pool; final approved pool shown in deterministic nameGeneration',
        'proactivitySemantic=deterministic cap 3',
    ];

    return lines;
}

function buildReadableDeterministicDebug(handoff) {
    const resolution = handoff?.resolutionPacket ?? {};
    const npcs = Array.isArray(handoff?.npcHandoffs) ? handoff.npcHandoffs : [];
    const chaos = handoff?.chaosHandoff?.CHAOS ?? {};
    const proactivity = handoff?.proactivityResults ?? {};
    const aggression = handoff?.aggressionResults ?? {};
    const name = handoff?.nameGeneration ?? {};
    const powerActorPressure = handoff?.powerActorPressure ?? {};

    return [
        'resolutionPacket.GOAL=' + valueOrNone(resolution.GOAL),
        'resolutionPacket.UserAbilityUse=' + userAbilityUseSummary(resolution.UserAbilityUse),
        'resolutionPacket.ItemUse=' + itemUseSummary(resolution.ItemUse),
        'resolutionPacket.ClaimCheck=' + claimCheckSummary(resolution.ClaimCheck),
        'resolutionPacket.intimacyAdvanceExplicit=' + valueOrNone(resolution.intimacyAdvanceExplicit),
        'resolutionPacket.boundaryViolationExplicit=' + valueOrNone(resolution.boundaryViolationExplicit),
        'resolutionPacket.nonLethal=' + valueOrNone(resolution.nonLethal),
        'resolutionPacket.RollNeeded=' + valueOrNone(resolution.RollNeeded),
        'resolutionPacket.RollReason=' + valueOrNone(resolution.RollReason),
        'resolutionPacket.ActionBucket=' + valueOrNone(resolution.ActionBucket),
        'resolutionPacket.SocialBucket=' + valueOrNone(resolution.SocialBucket),
        'resolutionPacket.CombatType=' + valueOrNone(resolution.CombatType),
        'resolutionPacket.ResolvedStats=' + inline(resolution.ResolvedStats ?? {}),
        'resolutionPacket.actions=' + list(resolution.actions),
        'resolutionPacket.actionUnits=' + actionUnitsSummary(resolution.actionUnits, { includeEvidence: true }),
        'resolutionPacket.OutcomeTier=' + valueOrNone(resolution.OutcomeTier),
        'resolutionPacket.Outcome=' + valueOrNone(resolution.Outcome),
        'resolutionPacket.LandedActions=' + valueOrNone(resolution.LandedActions),
        'resolutionPacket.CounterPotential=' + valueOrNone(resolution.CounterPotential),
        'resolutionPacket.classifyHostilePhysicalIntent=' + valueOrNone(resolution.classifyHostilePhysicalIntent),
        'resolutionPacket.activeHostileThreat=' + valueOrNone(resolution.activeHostileThreat),
        'resolutionPacket.classifyPhysicalBoundaryPressure=' + valueOrNone(resolution.classifyPhysicalBoundaryPressure),
        'resolutionPacket.UserImpairment=' + inline(resolution.UserImpairment ?? {}),
        'resolutionPacket.NPCImpairment=' + inline(resolution.NPCImpairment ?? {}),
        'resolutionPacket.hostilesInScene.NPC=' + list(resolution.hostilesInScene?.NPC),
        'resolutionPacket.ActionTargets=' + list(resolution.ActionTargets),
        'resolutionPacket.OppTargets.NPC=' + list(resolution.OppTargets?.NPC),
        'resolutionPacket.OppTargets.ENV=' + list(resolution.OppTargets?.ENV),
        'resolutionPacket.EnvironmentDifficulty=' + environmentDifficultySummary(resolution),
        'resolutionPacket.BenefitedObservers=' + list(resolution.BenefitedObservers),
        'resolutionPacket.HarmedObservers=' + list(resolution.HarmedObservers),
        'resolutionPacket.NPCInScene=' + list(resolution.NPCInScene),
        'resultLine=' + valueOrNone(handoff?.resultLine),
        '',
        'npcHandoffs=' + (npcs.length ? '' : 'none'),
        ...npcs.flatMap((npc, index) => [
            `npcHandoffs[${index}].NPC=${valueOrNone(npc.NPC)}`,
            `npcHandoffs[${index}].FinalState=${valueOrNone(npc.FinalState)}`,
            `npcHandoffs[${index}].Lock=${valueOrNone(npc.Lock)}`,
            `npcHandoffs[${index}].Behavior=${valueOrNone(npc.Behavior)}`,
            `npcHandoffs[${index}].PersonalitySummary=${valueOrNone(npc.PersonalitySummary)}`,
            `npcHandoffs[${index}].Target=${valueOrNone(npc.Target)}`,
            `npcHandoffs[${index}].NPC_STAKES=${valueOrNone(npc.NPC_STAKES)}`,
            `npcHandoffs[${index}].IntimacyBoundary=${valueOrNone(npc.IntimacyBoundary)}`,
            `npcHandoffs[${index}].IntimacyBoundarySource=${valueOrNone(npc.IntimacyBoundarySource)}`,
            `npcHandoffs[${index}].IntimacyRefusalStyle=${valueOrNone(npc.IntimacyRefusalStyle)}`,
            `npcHandoffs[${index}].RelationToUserAction=${inline(npc.RelationToUserAction ?? {})}`,
            `npcHandoffs[${index}].BoundaryPressure=${valueOrNone(npc.BoundaryPressure)}`,
            `npcHandoffs[${index}].PressureMode=${valueOrNone(npc.PressureMode)}`,
        ]),
        '',
        'chaosHandoff=' + inline({
            triggered: Boolean(chaos.triggered),
            band: chaos.band ?? 'None',
            magnitude: chaos.magnitude ?? 'None',
            anchor: chaos.anchor ?? 'None',
            vector: chaos.vector ?? 'None',
        }),
        'proactivityResults=' + inline(formatProactivityForNarration(proactivity)),
        ...formatAggressionDebugLines(aggression),
        'powerActorPressure=' + powerActorPressureSummary(powerActorPressure),
        'powerActorEvent=' + powerActorEventAuditSummary(powerActorPressure?.event),
        'nameGeneration=' + nameGenerationSummary(name),
        'trackerUpdate=' + inline(handoff?.sceneTrackerUpdate ?? {}),
    ];
}

export function formatNarratorPromptContext(report, options = {}) {
    const handoff = report?.finalNarrativeHandoff ?? {};
    const resolution = handoff.resolutionPacket ?? {};
    const ledger = report?.semanticLedger ?? {};
    const summary = buildNarratorSummary(handoff, resolution, ledger, options);
    const narratorModelHandoff = formatNarrativeContract({ summary, handoff, resolution, ledger, options });

    const lines = [
        '[STORY_ENGINE_MECHANICS_AUDIT v0.9]',
        'This displayed handoff is for audit only. The narrator model receives narrativeContract(input), not this mechanics audit.',
        '',
        '==MECHANICS_RESULTS==',
        ...formatMechanicsResultList(summary, resolution, handoff),
        '',
        '==NARRATOR_MODEL_HANDOFF==',
        'This is the exact narrator-facing handoff delivered to the narrator model as a native depth-0 prompt for this response.',
        '',
        narratorModelHandoff,
    ];

    return lines.join('\n');
}

function formatMechanicsResultList(summary, resolution, handoff = {}) {
    const aggressionEntries = formatAggressionMechanicsEntries(handoff?.aggressionResults ?? {});
    return [
        ['userAction', summary.userAction],
        ['resolution.GOAL', valueOrNone(resolution.GOAL)],
        ['resolution.UserAbilityUse', userAbilityUseSummary(resolution.UserAbilityUse)],
        ['resolution.ItemUse', itemUseSummary(resolution.ItemUse)],
        ['resolution.ClaimCheck', claimCheckSummary(resolution.ClaimCheck)],
        ['userKnowledge.application', summary.userKnowledgeApplication],
        ['resolution.RollNeeded', valueOrNone(resolution.RollNeeded)],
        ['resolution.RollReason', valueOrNone(resolution.RollReason)],
        ['resolution.ActionBucket', valueOrNone(resolution.ActionBucket)],
        ['resolution.SocialBucket', valueOrNone(resolution.SocialBucket)],
        ['resolution.CombatType', valueOrNone(resolution.CombatType)],
        ['resolution.ResolvedStats', inline(resolution.ResolvedStats ?? {})],
        ['resolution.EnvironmentDifficulty', summary.environmentDifficulty],
        ['resolution.actionCount', summary.actionCount],
        ['resolution.actionUnits', actionUnitsSummary(resolution.actionUnits, { includeEvidence: true })],
        ['resolution.rollFull', summary.rollFull],
        ['resolution.nonLethal', valueOrNone(resolution.nonLethal)],
        ['resolution.outcome', summary.outcome],
        ['resolution.outcomeMeaning', summary.result],
        ['resolution.landedActions', summary.landedActions],
        ['resolution.intimacyAdvanceExplicit', valueOrNone(resolution.intimacyAdvanceExplicit)],
        ['intimacy.boundary', summary.intimacyBoundary],
        ['resolution.boundaryViolationExplicit', valueOrNone(resolution.boundaryViolationExplicit)],
        ['resolution.counterPotential', summary.counter],
        ['resolution.targets', summary.targets],
        ['impairment.user', summary.userImpairment],
        ['impairment.npc', summary.npcImpairment],
        ['injury.inflictedNpc', summary.inflictedNpcInjury],
        ['injury.inflictedUser', summary.inflictedUserInjury],
        ['npc.state', summary.npc],
        ['relationship.result', summary.relationshipResult],
        ['chaos.result', summary.chaos],
        ['proactivity.result', summary.proactive],
        ['aggression.result', summary.aggression],
        ['powerActor.assessment', summary.powerActorAssessment],
        ['powerActor.enmityEffect', summary.powerActorEnmityEffect],
        ['powerActor.pressure', summary.powerActorPressure],
        ['powerActor.event', summary.powerActorEventAudit ?? summary.powerActorEvent],
        ['nameGeneration.result', summary.generatedName],
        ...aggressionEntries,
    ].map(([key, value]) => `- ${key}: ${valueOrNone(value)}`);
}

function formatAggressionDebugLines(aggression = {}) {
    const lines = ['aggressionResults=' + inline(aggression)];
    for (const [name, value] of Object.entries(aggression || {})) {
        if (!value || typeof value !== 'object') continue;
        const attackStat = value.AttackStat ?? 'PHY';
        const defenseStat = value.DefenseStat ?? attackStat;
        const npcDie = value.NpcDie ?? value.NPCDie ?? value.AttackDie ?? value.AttackRollDie;
        const defenderDie = value.DefenderDie ?? value.DefenseDie ?? value.TargetDie ?? value.ReactionDie;
        const attackTotal = value.AttackTotal ?? value.NpcTotal ?? null;
        const defenseTotal = value.DefenseTotal ?? value.TargetTotal ?? null;
        const margin = value.Margin ?? 'unknown';
        const attackRoll = buildAggressionRollLine({
            npc: name,
            attackType: value.AttackType,
            attackStat,
            defenseStat,
            attackDie: npcDie,
            defenseDie: defenderDie,
            attackTotal,
            defenseTotal,
            margin,
            outcome: value.ReactionOutcome,
            counterBonus: value.CounterBonus ?? 0,
            npcImpairment: value.NPCImpairment,
            targetImpairment: value.TargetImpairment || value.UserImpairment,
        });
        lines.push(`aggression.roll.${name}=${attackRoll}`);
        lines.push(`aggression.result.${name}=${inline(value)}`);
    }
    return lines;
}

function formatAggressionMechanicsEntries(aggression = {}) {
    const entries = [];
    for (const [name, value] of Object.entries(aggression || {})) {
        if (!value || typeof value !== 'object') continue;
        entries.push([`aggression.roll.${name}`, buildAggressionRollLine({
            npc: name,
            attackType: value.AttackType,
            attackStat: value.AttackStat,
            defenseStat: value.DefenseStat ?? value.AttackStat,
            attackDie: value.NpcDie ?? value.NPCDie ?? value.AttackDie ?? value.AttackRollDie,
            defenseDie: value.DefenderDie ?? value.DefenseDie ?? value.TargetDie ?? value.ReactionDie,
            attackTotal: value.NpcTotal ?? value.AttackTotal,
            defenseTotal: value.DefenderTotal ?? value.DefenseTotal,
            margin: value.Margin,
            outcome: value.ReactionOutcome,
            counterBonus: value.CounterBonus ?? 0,
            npcImpairment: value.NPCImpairment,
            targetImpairment: value.TargetImpairment || value.UserImpairment,
        })]);
        entries.push([`aggression.result.${name}`, inline(value)]);
    }
    return entries;
}

function buildAggressionRollLine({ npc, attackType, attackStat, defenseStat, attackDie, defenseDie, attackTotal, defenseTotal, margin, outcome, counterBonus, npcImpairment, targetImpairment }) {
    const attackDieText = Number.isFinite(Number(attackDie)) ? Number(attackDie) : '?';
    const defenseDieText = Number.isFinite(Number(defenseDie)) ? Number(defenseDie) : '?';
    const attackTotalText = Number.isFinite(Number(attackTotal)) ? Number(attackTotal) : '?';
    const defenseTotalText = Number.isFinite(Number(defenseTotal)) ? Number(defenseTotal) : '?';
    const attackImpairText = Number(npcImpairment?.AppliedToRoll === 'Y' ? npcImpairment.RollPenalty : 0);
    const targetImpairText = Number(targetImpairment?.AppliedToRoll === 'Y' ? targetImpairment.RollPenalty : 0);
    const attackBonusText = Number(counterBonus || 0);
    const attackImpairSuffix = attackImpairText ? `+impairment(${attackImpairText})` : '';
    const defenseImpairSuffix = targetImpairText ? `+impairment(${targetImpairText})` : '';
    const attackStatValue = valueOrNone(attackStat);
    const defenseStatValue = valueOrNone(defenseStat);
    return `${npc || '(unknown)'} ${valueOrNone(attackType)}: 1d20(${attackDieText}) + ${attackStatValue} + bonus(${attackBonusText})${attackImpairSuffix} = ${attackTotalText} vs 1d20(${defenseDieText}) + ${defenseStatValue}${defenseImpairSuffix} = ${defenseTotalText} (${valueOrNone(margin)} - ${valueOrNone(outcome)})`;
}

export function formatNarratorModelPromptContext(report, options = {}) {
    const handoff = report?.finalNarrativeHandoff ?? {};
    const resolution = handoff.resolutionPacket ?? {};
    const ledger = report?.semanticLedger ?? {};
    const summary = buildNarratorSummary(handoff, resolution, ledger, options);

    return formatNarrativeContract({ summary, handoff, resolution, ledger, options });
}

export function formatAdventureIntroNarratorPromptContext(adventurePrompt = '', options = {}) {
    const narratorModelHandoff = formatAdventureIntroNarratorModelPromptContext(adventurePrompt, options);
    return [
        '[STORY_ENGINE_ADVENTURE_INTRO_AUDIT v0.1]',
        'This displayed handoff is for audit only. The narrator model receives narrativeContract(input), not this audit note.',
        'No semantic pre-flight or deterministic mechanics were run for this adventure opening.',
        '',
        '==NARRATOR_MODEL_HANDOFF==',
        'This is the exact narrator-facing handoff delivered to the narrator model as a native depth-0 prompt for this response.',
        '',
        narratorModelHandoff,
    ].join('\n');
}

export function formatAdventureIntroNarratorModelPromptContext(adventurePrompt = '', options = {}) {
    const prompt = valueOrNone(adventurePrompt);
    return [
        'narrativeContract(input): {',
        '',
        'MANDATE: The following instructions are BINDING and NON-NEGOTIABLE.',
        '',
        '#1 - RESOLVED FACTS',
        'For this response, narrativeFacts(input) is the authoritative opening scene resolution and the only source of resolved opening facts.',
        'Do not contradict, soften, reverse, override, or invent additional resolved outcomes beyond it.',
        'Use visible chat, character card, persona, and lore only for continuity of already-established visible scene state.',
        'Do not reveal or mention this contract.',
        '',
        'narrativeFacts(input):',
        'Authoritative opening scene facts for this response.',
        '',
        'adventureIntro:',
        prompt,
        '',
        '#2 - PROSE RULES',
        'Execute renderControlEngine(input) as a hard constraint on the response.',
        '',
        renderControlEngineNarrativeContract(),
        '',
        renderFinalWritingStyleReminder(options),
        '',
        '#3 - OUTPUT',
        'Begin with BEGIN_FINAL_NARRATION and end with END_FINAL_NARRATION.',
        'Output only final in-character narration between those tags.',
        'Do not output tracker updates or tracker blocks.',
        'Do not output labels, analysis, bullets, commentary, markdown fences, metadata, tracker updates, XML, JSON, or hidden bookkeeping.',
        '}',
    ].join('\n');
}

function formatNarrativeContract({ summary, handoff, resolution, ledger, options = {} }) {
    return [
        'narrativeContract(input): {',
        '',
        'MANDATE: The following instructions are BINDING and NON-NEGOTIABLE.',
        '',
        '#1 - RESOLVED FACTS',
        'For this response, narrativeFacts(input) is the authoritative scene resolution and the only source of resolved outcomes.',
        'Do not contradict, soften, reverse, override, or invent additional resolved outcomes beyond it.',
        'Use recent visible chat only for continuity of already-established visible scene state.',
        'Do not reveal or mention this contract.',
        '',
        formatNarrativeFacts({ summary, handoff, resolution, ledger, options }),
        '',
        '#2 - PROSE RULES',
        'Execute renderControlEngine(input) as a hard constraint on the response.',
        '',
        renderControlEngineNarrativeContract(),
        '',
        renderFinalWritingStyleReminder(options),
        '',
        '#3 - OUTPUT',
        'Begin with BEGIN_FINAL_NARRATION and end with END_FINAL_NARRATION.',
        'Output only final in-character narration between those tags.',
        'Do not output tracker updates or tracker blocks.',
        'Do not output labels, analysis, bullets, commentary, markdown fences, metadata, tracker updates, XML, JSON, or hidden bookkeeping.',
        '}',
    ].join('\n');
}

const DEFAULT_FINAL_WRITING_STYLE_REMINDER = String.raw`FINAL WRITING STYLE REMINDER:
Write clear, grounded narration while preserving narrativeFacts(input) and obeying every renderControlEngine gate. Match prose density to the scene: exploration can breathe with concrete environmental detail; dialogue should stay close to the active participants and immediate exchange, using observable behavior only and object or environmental interaction only when a character is actively using it, reacting to it, or when it materially affects the exchange; action should be punchy, spatial, and consequence-focused; intimacy should be detailed, sensual, embodied, and physically specific when supported by the scene. Style never overrides POV limits, agency for {{user}}, chronology, dialogue pacing, endpoint control, or resolved mechanics.`;


function renderFinalWritingStyleReminder(options = {}) {
    return String(options?.writingStyleReminderPrompt || DEFAULT_FINAL_WRITING_STYLE_REMINDER).trim();
}

function renderControlEngineNarrativeContract() {
    return String.raw`renderControlEngine(input): {

itemAvailability:
Execute itemAvailability(response, context).
mandate: Obey listed personal item availability exactly.
ABSOLUTELY-FORBIDDEN: Never do any of the following. Unavailable items must not appear possessed or usable.

diegeticPhysicality:
Execute diegeticPhysicality(response, context).
mandate: Render abilities and unusual effects through observable consequences only.
ABSOLUTELY-FORBIDDEN: Never do any of the following. Do not name or explain powers unless spoken in dialogue.

strictEpistemology:
Execute strictEpistemology(response, context).
mandate: Keep information locked until directly evidenced in-scene.
ABSOLUTELY-FORBIDDEN: Never do any of the following. Do not reveal unknown identities, motives, lore, or private thoughts.

inanimateObjectivity:
Execute inanimateObjectivity(response, context).
mandate: Give agency only to beings, forces, mechanisms, and processes capable of physical action.
ABSOLUTELY-FORBIDDEN: Never do any of the following. Do not attribute will, awareness, or emotion to objects, weather, or abstractions.

denotativePhysicality:
Execute denotativePhysicality(response, context).
mandate: Keep prose literal, physically clear, and directly perceivable.
ABSOLUTELY-FORBIDDEN: Never do any of the following. No figurative language. Rooms do not breathe. Silence does not stretch. Words do not hang, land, hit, cut, or fall flat. Rewrite any figurative line as literal physical description.

embodiedPerception:
Execute embodiedPerception(response, context).
mandate: Narrate through concrete physical evidence from {{user}}'s position.
ABSOLUTELY-FORBIDDEN: Never do any of the following. Do not use smell or taste as ambient scene dressing.

behaviorism:
Execute behaviorism(response, context).
mandate: Render character state only through directly witnessable behavior and physical displacement.
ABSOLUTELY-FORBIDDEN: Never do any of the following. No internal states, subtext labels, interpretive commentary, eye-language, micro-expressions, autonomic tells, or canned emotional shorthand.

agencySeparation:
Execute agencySeparation(response, input, context).
mandate: {{user}} controls the protagonist. The narrator controls the world and consequences.
ABSOLUTELY-FORBIDDEN: Never do any of the following. Do not write {{user}}'s speech, thoughts, feelings, choices, or voluntary movement.

linearChronology:
Execute linearChronology(response, input, context).
mandate: Narrate in strict linear order. Begin with the immediate consequence of {{user}}'s latest input.
ABSOLUTELY-FORBIDDEN: Never do any of the following. Do not echo, repeat, summarize, or recap any part of {{user}}'s latest input. Do not insert undeclared intermediate actions.

hypotacticSceneBeats:
Execute hypotacticSceneBeats(response, context).
mandate: Write cohesive scene beats.
ABSOLUTELY-FORBIDDEN: Never do any of the following. Do not break one beat into staccato action stacking or body-cue pileups.

characterTurnPacing:
Execute characterTurnPacing(response, context).
mandate: Each active NPC gets 1 paragraph-turn per {{user}} input.
ABSOLUTELY-FORBIDDEN: Never do any of the following. No second turn, repeated body language, or extra micro-actions outside the NPC A -> NPC B -> NPC A exception.

activeHandoff:
Execute activeHandoff(response, context).
mandate: End on a natural beat that {{user}} can immediately respond to. (Dialogue or action directed at {{user}}, or a visible scene change that requires a response)
NEVER:
- Continue past the handoff beat
- End on explicit waiting, staring, silence or all-eyes-on-user framing.
- Ask or prompt {{user}} to take action.

applicationContract:
Execute every function above as mandatory narration constraints before visible output.
}`;
}

function formatNarrativeFacts({ summary, handoff, resolution, ledger, options = {} }) {
    const facts = [
        ['attemptedActions', narrativeAttemptedActions(resolution, summary)],
        ['attemptedActionResults', narrativeAttemptedActionResults(resolution)],
        ['sceneContinuity', 'Continue from the visible scene state. Do not replay prior NPC actions, world actions, object movement, delivered items, opened/closed access, or already-completed events.'],
        ['presentCharacters', narrativePresentCharacters(resolution, handoff)],
        ['npcResponse', narrativeNpcResponseFact(handoff)],
        ['boundaryPressure', narrativeBoundaryFact(resolution, handoff)],
        ['companionCommand', narrativeCompanionCommandFact(resolution)],
        ['npcForce', narrativeNpcForceFact(resolution, handoff)],
        ['relationshipState', narrativeRelationshipFact(handoff)],
        ['intimacyAndConsent', narrativeIntimacyFact(handoff)],
        ['abilityUse', narrativeAbilityFact(resolution.UserAbilityUse)],
        ['itemUse', narrativeItemFact(resolution.ItemUse)],
        ['claimOrDeception', narrativeClaimFact(resolution.ClaimCheck, resolution, summary)],
        ['knowledgeAboutUser', narrativeUserKnowledgeFact(ledger?.userKnowledgeApplication?.applications)],
        ['environment', narrativeEnvironmentFact(resolution)],
        ['harmLimit', narrativeHarmLimitFact(resolution)],
        ['limitations', narrativeLimitationsFact(resolution)],
        ['injuryOrDeath', narrativeInjuryFact(resolution, handoff)],
        ['npcInitiative', narrativeNpcInitiativeFact(handoff)],
        ['worldEvent', narrativeWorldEventFact(handoff)],
        ['nameReveal', narrativeNameRevealFact(handoff?.nameGeneration)],
        ['proxyUserAction', narrativeProxyUserActionFact(options)],
    ].filter(([, value]) => !isNoneText(value));

    return [
        'narrativeFacts(input):',
        'Authoritative resolved scene facts for this response.',
        '',
        ...facts.flatMap(([key, value]) => [key + ':', value, '']),
    ].join('\n').trimEnd();
}

function narrativeAttemptedActions(resolution = {}, summary = {}) {
    const units = narrativeActionUnits(resolution, summary);
    if (!units.length) return 'No resolved attempted action is listed for this beat.';
    return units.map(unit => `${unit.id}: ${narratorUserMacroText(unit.action)}.`).join('\n');
}

function narrativeAttemptedActionResults(resolution = {}) {
    const units = narrativeActionUnits(resolution);
    const tier = String(resolution?.OutcomeTier ?? 'NONE');
    const outcome = String(resolution?.Outcome ?? 'no_roll');
    if (!units.length) return 'No listed action result is active.';
    if (resolution?.RollNeeded === 'N' || tier === 'NONE' || outcome === 'no_roll') {
        const reason = valueOrNone(resolution?.RollReason);
        const reasonText = isNoneText(reason) ? '' : ` Reason: ${narratorUserMacroText(reason)}.`;
        return units.map(unit => `${unit.id}: NO ROLL - This listed action is not mechanically contested; narrate ordinary scene continuity only, without inventing success, failure, contest, reversal, or extra resolved effects.${reasonText}`).join('\n');
    }
    if (tier === 'Stalemate') {
        return units.map(unit => `${unit.id}: UNRESOLVED - This listed action remains contested or unfinished. Do not narrate it fully succeeding or fully failing unless another narrative fact explicitly says otherwise.`).join('\n');
    }
    if (tier.includes('Failure')) {
        const failureText = tier === 'Minor_Failure'
            ? 'failing narrowly'
            : tier === 'Moderate_Failure'
                ? 'failing clearly'
                : tier === 'Critical_Failure'
                    ? 'failing decisively'
                    : 'failing';
        return units.map(unit => `${unit.id}: FAILURE - Narrate this listed action ${failureText}. It does not land, does not take hold, and does not produce a completed effect unless another narrative fact explicitly says otherwise.`).join('\n');
    }
    const successCount = successfulActionUnitCount(resolution, units.length);
    return units.map((unit, index) => {
        if (index >= successCount) {
            return `${unit.id}: FAILURE - This listed action does not land or remains unfinished.`;
        }
        const successText = tier === 'Minor_Success'
            ? 'succeeding narrowly, with limited visible impact'
            : tier === 'Moderate_Success'
                ? 'succeeding clearly, with solid visible impact'
                : tier === 'Critical_Success'
                    ? 'succeeding decisively'
                    : 'succeeding clearly';
        return `${unit.id}: SUCCESS - Narrate this listed action ${successText}.`;
    }).join('\n');
}

function narrativeActionUnits(resolution = {}, summary = {}) {
    const source = Array.isArray(resolution?.actionUnits) ? resolution.actionUnits : [];
    const units = source
        .map((unit, index) => ({
            id: valueOrNone(unit?.id || `A${index + 1}`),
            action: valueOrNone(unit?.action),
        }))
        .filter(unit => !isNoneText(unit.action));
    if (units.length) return units.slice(0, 3);
    const fallback = valueOrNone(summary.userAction || resolution.GOAL);
    return isNoneText(fallback) ? [] : [{ id: 'A1', action: fallback }];
}

function successfulActionUnitCount(resolution = {}, total = 0) {
    const tier = String(resolution?.OutcomeTier ?? '');
    if (tier === 'Minor_Success') return Math.min(1, total);
    if (tier === 'Moderate_Success') return Math.min(2, total);
    if (tier === 'Critical_Success') return total;
    if (tier === 'Success') return total;
    const landed = Number(resolution?.LandedActions);
    return Number.isFinite(landed) ? Math.max(0, Math.min(total, landed)) : 0;
}

function narrativePresentCharacters(resolution = {}, handoff = {}) {
    const names = uniqueSceneCastNames([
        resolution?.NPCInScene,
        resolution?.ActionTargets,
        resolution?.OppTargets?.NPC,
        resolution?.BenefitedObservers,
        resolution?.HarmedObservers,
        resolution?.hostilesInScene?.NPC,
        (handoff?.npcHandoffs ?? []).map(npc => npc?.NPC),
        Object.entries(handoff?.proactivityResults ?? {})
            .filter(([, value]) => value?.Proactive === 'Y')
            .map(([name]) => name),
        Object.entries(handoff?.aggressionResults ?? {}).flatMap(([name, value]) => [name, value?.ProactivityTarget]),
        handoff?.powerActorPressure?.event?.ContactName ?? handoff?.powerActorPressure?.event?.contactName,
    ]);
    if (!names.length) {
        return 'No known/tracked character is required to participate this beat. Known/lore/example/tracker/card characters remain offscreen unless a narrative fact explicitly introduces them. This fact does not introduce new figures.';
    }
    return `Current scene cast: ${list(names)}. Only these listed NPCs may speak, react, gesture, move, or be treated as physically present this turn, unless narrativeFacts(input) explicitly introduces a new NPC. Known/lore/example/tracker/card characters not listed are offscreen and must not participate. This fact does not introduce additional figures.`;
}

function narrativeNpcResponseFact(handoff = {}) {
    const npcs = Array.isArray(handoff?.npcHandoffs) ? handoff.npcHandoffs : [];
    if (!npcs.length) {
        return 'No specific existing NPC response is required by this fact. This fact does not introduce an NPC response, environmental event, consequence, or new figure.';
    }
    return npcs.map(npc => `${valueOrNone(npc.NPC)}: ${relationshipNarrativeGuide(npc)}`).join(' ');
}

function relationshipNarrativeGuide(npc = {}) {
    const state = relationshipStateNarrativeGuide(npc);
    const behavior = behaviorNarrationGuide(npc?.Behavior);
    const target = relationshipTargetNarrativeGuide(npc?.Target);
    const personality = npc?.PersonalitySummary && !isNoneText(npc.PersonalitySummary)
        ? ` Use this stable personality note as expression guidance, not a hard script: ${npc.PersonalitySummary}. Let speech style and interaction style carry most personality. Any listed mannerism is optional, flexible, and scene-valid only; do not repeat it every response, force props/locations, or turn it into a required beat. It never overrides the listed facts.`
        : '';
    const boundary = npc?.BoundaryPressure === 'Y'
        ? ' Respect active boundary pressure through physical space, refusal, guarded movement, or physical protection.'
        : '';
    return `${state} ${behavior} ${target}${personality}${boundary}`.replace(/\s+/g, ' ').trim();
}

function relationshipStateNarrativeGuide(npc = {}) {
    const state = parseRelationshipState(npc?.FinalState);
    if (!state) return 'Neutral default: practical, reserved, context-led behavior; no default trust, vulnerability, hostility, fear, romance, or intimacy.';
    if (state.F >= 4) return 'Terror-led: prioritize escape, surrender, help-seeking, freezing, pleading, or desperate self-protection; compliance is fear management, not consent, comfort, or trust.';
    if (state.H >= 4) return 'Hatred-led: wants harm, removal, exposure, humiliation, sabotage, defeat, or driving away.';
    if (state.F >= 3) return 'Fear-led: wants distance, safety, witnesses, or an exit; staying, answering, or complying is defensive appeasement or caution, not comfort, attraction, trust, or willingness.';
    if (state.H >= 3) return 'Hostility-led: argues, refuses, obstructs, challenges, mocks, threatens, or interferes.';
    if (state.B >= 4) return 'Close trust: may confide, seek closeness, show loyalty, support, vulnerability, and deep personal investment; still not automatic romance or intimacy.';
    if (state.B >= 3) return 'Friendly comfort: cooperative, relaxed, warm; ordinary closeness can fit when context supports it, but not automatic romance or intimacy.';
    if (state.B <= 1) return 'Low trust: keeps distance, avoids vulnerability and private closeness, cautious or transactional if engagement is necessary.';
    return 'Neutral default: polite, practical, reserved, curious, formal, businesslike, or situationally cooperative; no default vulnerability or personal closeness.';
}

function relationshipTargetNarrativeGuide(target) {
    switch (target) {
        case 'Bond':
            return 'Show trust, warmth, cooperation, comfort, or loyalty increasing in this beat.';
        case 'Fear':
            return 'Show fear, caution, submission, appeasement, avoidance, or protective distance increasing in this beat.';
        case 'Hostility':
            return 'Show anger, resistance, distrust, resentment, refusal, or opposition increasing in this beat.';
        case 'FearHostility':
            return 'Show fear and hostility together: guarded, cornered, defensive, reactive, frightened, and angry.';
        case 'No Change':
        case undefined:
        case null:
            return 'Do not change the relationship state in this beat; keep behavior consistent with the already-established relationship.';
        default:
            return 'Apply the listed relationship shift only as natural scene behavior.';
    }
}

function narrativeNpcForceFact(resolution = {}, handoff = {}) {
    const aggressionEntries = Object.entries(handoff?.aggressionResults ?? {});
    if (aggressionEntries.length) return aggressionEntries.map(([name, value]) => narrativeAggressionEntry(name, value)).join(' ');
    const subject = uniqueSceneCastNames([
        resolution?.NPCInScene,
        resolution?.ActionTargets,
        resolution?.OppTargets?.NPC,
        resolution?.hostilesInScene?.NPC,
        (handoff?.npcHandoffs ?? []).map(npc => npc?.NPC),
        Object.entries(handoff?.proactivityResults ?? {})
            .filter(([, value]) => value?.Proactive === 'Y')
            .map(([name]) => name),
    ]);
    if (!subject.length) return 'NO NPC ATTACK: No NPC attack, counterattack, companion strike, spell effect, shove, restraint, injury, or completed forceful effect resolves in this beat.';
    const names = list(subject);
    return `NO NPC ATTACK: No NPC attack, counterattack, companion strike, spell effect, shove, restraint, injury, or completed forceful effect from ${names} resolves in this beat. Any resistance from ${names} may appear only as refusal, self-protection, withdrawal, or unresolved struggle already supported by npcResponse and boundaryPressure; it must not create a resolved effect on {{user}}.`;
}

function narrativeBoundaryFact(resolution = {}, handoff = {}) {
    const primaryNpc = primaryNarrationNpc(handoff, resolution);
    const guide = primaryNpc ? relationshipNarrativeGuide(primaryNpc) : 'Render resistance, refusal, guardedness, withdrawal, anger, fear, or a call for help as the visible situation supports.';
    const parts = [];
    if (resolution?.classifyPhysicalBoundaryPressure === 'Y') {
        parts.push('Treat this as physical boundary pressure, not combat: narrate contested possession, space, access, refusal, anger, or resistance without inventing a completed attack.');
    }
    if (resolution?.boundaryViolationExplicit === 'Y') {
        parts.push(`This is an explicit boundary violation or pressure past refusal. Narrate refusal, guardedness, resistance, withdrawal, anger, fear, calling for help, or escalation as fits the NPC and scene. ${guide}`);
    }
    return parts.join(' ') || 'No special physical boundary pressure is active beyond the other listed facts.';
}

function narrativeCompanionCommandFact(resolution = {}) {
    const command = resolution?.CompanionCommand;
    if (!command || command.Mode !== 'REQUEST_ONLY') return 'No companion command needs special handling.';
    const npcs = list(command.NPCs);
    const commands = Array.isArray(command.Commands) && command.Commands.length
        ? ` Command text: ${command.Commands.map(item => `"${item}"`).join('; ')}.`
        : '';
    return `Treat the addressed companion command to ${npcs} as spoken tactical input only, not as resolved obedience or a completed companion action.${commands} The companion may respond autonomously only if npcInitiative or npcForce says so. If no such fact lists a companion attack, do not narrate the companion striking, pinning, disabling, injuring, killing, or successfully controlling a target.`;
}

function narrativeAggressionEntry(name, value = {}) {
    const target = value?.ProactivityTarget && value.ProactivityTarget !== '(none)'
        ? value.ProactivityTarget
        : '{{user}}';
    const targetText = narratorTargetText(target);
    const source = valueOrNone(name);
    const attackType = narrativeAttackType(value);
    const style = narrativeAggressionStyle(value);
    const injuryLimit = narrativeAggressionInjuryLimit(value);
    const targetLock = isUserReferenceText(targetText)
        ? 'This force targets {{user}} only; do not redirect it to another target.'
        : `This force targets only ${targetText}; do not redirect it to another target.`;
    const targetLimit = isUserReferenceText(targetText)
        ? 'Do not narrate {{user}} counterattacking, reacting voluntarily, speaking, deciding, or following up.'
        : `Do not narrate ${targetText}'s counterattack, follow-up action, voluntary reaction, speech, decision, or choice unless another narrative fact says so.`;
    const opening = `${source}: ${attackType} against ${targetText}`;

    switch (value?.ReactionOutcome) {
        case 'npc_overpowers':
            return `RESOLVED NPC ATTACK: ${opening} succeeds strongly. Narrate only the completed effect explicitly supported by this fact, injuryOrDeath, harmLimit, and other narrative facts. Show clear NPC advantage through ${style}.${injuryLimit} ${targetLock} ${targetLimit}`;
        case 'npc_succeeds':
            return `RESOLVED NPC ATTACK: ${opening} succeeds modestly. Narrate only the completed effect explicitly supported by this fact, injuryOrDeath, harmLimit, and other narrative facts. Show one proportional effect only, not a combo chain or multiple separate hits.${injuryLimit} ${targetLock} ${targetLimit}`;
        case 'stalemate':
            return `CONTESTED NPC ATTACK: ${opening} remains unresolved. It does not produce a completed hit, injury, restraint, shove, control, spell effect, or forceful effect unless another narrative fact explicitly says otherwise. ${targetLock} ${targetLimit}`;
        case 'npc_fails':
        case 'user_resists':
        case 'user_dominates':
            return `FAILED NPC ATTACK: ${opening} fails. It does not land, connect, injure, restrain, shove, control, produce a completed spell effect, or create any completed forceful effect unless another narrative fact explicitly says otherwise. ${targetLock} ${targetLimit}`;
        default:
            return `NPC ATTACK RESULT: ${opening} may occur, but narrate only the forceful effect explicitly described by these narrative facts. ${targetLock} ${targetLimit}`;
    }
}

function narrativeAttackType(value = {}) {
    switch (value.AttackType) {
        case 'Retaliation':
            return `retaliation after {{user}}'s action`;
        case 'CounterAttack':
            return 'counterattack exploiting the opening';
        case 'ProactiveAttack':
            return 'proactive attack from current hostile state';
        case 'CompanionAttack':
            return 'companion attack';
        default:
            return 'immediate NPC attack';
    }
}

function narrativeAggressionStyle(value = {}) {
    const attackStat = value?.AttackStat === 'MND' ? 'MND' : 'PHY';
    return attackStat === 'MND'
        ? 'context-appropriate magic, mental force, supernatural pressure, will, focus, or other non-social power'
        : 'physical force, weapon use, bodily action, claws, teeth, movement, or other concrete physical pressure';
}

function narrativeAggressionInjuryLimit(value = {}) {
    const injury = value?.InflictedUserInjury || value?.InflictedTargetInjury;
    if (!injury) return '';
    const condition = String(injury.condition ?? '').toLowerCase();
    const severity = String(injury.severity ?? injury.InjurySeverityLimit ?? '').toLowerCase();
    const target = narratorTargetText(injury.target || (injury.targetType === 'npc' ? value.ProactivityTarget : '{{user}}'));
    if (condition === 'bruised' || severity === 'minor') {
        return ' Choose the concrete wound and affected body area from the attack context, but any lasting injury is capped at one minor bruise or minor impact, with no bleeding, cuts, incapacitation, restraint, or extra landed strikes.';
    }
    if (condition === 'dead') {
        return ` ${valueOrNone(target)} dies from this force; narrate death clearly and do not soften it into another nonfatal wound.`;
    }
    return ` If this force injures ${valueOrNone(target)}, choose the concrete wound and affected body area from the attack context, but do not exceed ${valueOrNone(injury.severity || injury.InjurySeverityLimit)} severity.`;
}

function narrativeRelationshipFact(handoff = {}) {
    const npcs = Array.isArray(handoff?.npcHandoffs) ? handoff.npcHandoffs : [];
    if (!npcs.length) return 'No existing named relationship changes in this beat.';
    return npcs.map(npc => `${valueOrNone(npc.NPC)}: ${relationshipTargetNarrativeGuide(npc?.Target)}`).join(' ');
}

function narrativeIntimacyFact(handoff = {}) {
    const npcs = Array.isArray(handoff?.npcHandoffs) ? handoff.npcHandoffs : [];
    const relevant = npcs.filter(npc => npc?.IntimacyBoundary && npc.IntimacyBoundary !== 'SKIP');
    if (relevant.length) return relevant.map(narrativeIntimacyEntry).join(' ');
    const names = npcs.map(npc => valueOrNone(npc.NPC)).filter(name => !isNoneText(name));
    if (!names.length) return 'No intimate or sexual escalation is being judged in this beat.';
    return `No intimacy permission is active for ${names.join(', ')} in this beat. This limits intimate escalation only; it does not change ordinary non-intimate dialogue, affection, flirtation, or relationship behavior allowed by other narrative facts. Because conversation alone is not permission for intimate escalation, do not narrate sexual contact, undressing or exposure, secluded-intimacy setup, arousal/compliance framing, consent-by-momentum, or relationship acceptance unless another narrativeFact explicitly permits it.`;
}

function narrativeIntimacyEntry(npc = {}) {
    const name = valueOrNone(npc.NPC);
    if (npc.IntimacyBoundary === 'ALLOW') {
        return `Intimacy is permitted for ${name} because ${intimacyBoundarySourceText(npc.IntimacyBoundarySource)}. Narrate the NPC response naturally according to context, privacy, safety, mood, and personality. Do not reverse, withdraw, panic, or stop at the moment of follow-through unless new danger, interruption, explicit withdrawal, or established characterization makes that reversal concrete in-scene. Do not force explicit intimacy if the scene makes it implausible.`;
    }
    if (npc.IntimacyBoundary === 'DENY') {
        const reason = npc.IntimacyBoundarySource === 'LOCKED_DISPOSITION'
            ? ' Existing relationship history does not grant intimacy while the NPC is currently fear-led or hostility-led.'
            : '';
        return `Intimacy is not permitted for ${name}.${reason} Render the denial as a real boundary, not coyness, teasing, hesitation, or a conditional delay. Include a clear refusal and an active boundary action: moving hands away, blocking contact, covering or protecting the touched area, stepping back, creating distance, or otherwise stopping the intimate advance. If the attempted intimacy is physical, the boundary must be physical. Do not imply intimacy would be accepted under different timing, privacy, location, or mood. Do not narrate reciprocation, compliance, arousal, escalating intimacy, or a successful intimate result. This denial is a boundary for later turns, not a relationship punishment by itself. Tune the refusal as ${intimacyRefusalGuide(npc)}`;
    }
    return `Intimacy is not permitted for ${name} in this beat.`;
}

function narrativeAbilityFact(value = {}) {
    const ability = normalizeAbilityUseObject(value);
    if (!ability.attempted) return 'No ability effect from {{user}} is active.';
    if (!ability.available) {
        return `{{user}} attempts an unavailable supernatural or special ability: ${ability.abilityName}. The attempted effect does not occur. Do not create the attempted effect: ${ability.narrativeEffect}. Render only the lack of effect and visible reactions. This is not backlash unless another narrative fact says so.`;
    }
    return `{{user}}'s ability can produce this direct scene effect: ${ability.narrativeEffect}. Render only the direct perceivable effect or delivery. Do not announce, label, explain, activate, focus, channel, charge, or name the ability unless its name is spoken aloud in dialogue. Do not add extra success, extra impact, or bypassed consequences beyond the listed facts.`;
}

function narrativeItemFact(value = {}) {
    const item = normalizeItemUseObject(value);
    if (!item.attempted) return 'No personal gear/inventory item branch is active; ordinary scene objects remain governed by attemptedActions, attemptedActionResults, and environment facts.';
    const attemptedItem = `{{user}} attempts to use/draw/produce/consume: ${item.item}.`;
    if (item.available) {
        const state = !isNoneText(item.savedItem) && item.savedItem !== item.item ? ` Saved item state: ${item.savedItem}. Preserve the saved item state exactly: if it limits use, the limitation must affect the scene.` : '';
        return `${attemptedItem} Availability: available from ${item.source}.${state} Narrate the attempt and its immediate result. Do not skip, gloss over, or replace the attempt. Item availability is not automatic success, extra impact, or bypassed consequence.`;
    }
    return `${attemptedItem} Availability: unavailable. No item effect occurs. Narrate the attempt and its immediate result: the item is absent, unreachable, or not in the claimed place. Do not skip, gloss over, or replace the attempt. The item must not appear, be drawn, be wielded, be consumed, unlock anything, or enter {{user}} possession. Visible reactions may follow naturally.`;
}

function narrativeClaimFact(value = {}, resolution = {}, summary = {}) {
    const claim = normalizeClaimCheckObject(value);
    if (!isStakeBearingUntrustedClaimForNarration(claim)) return 'No consequential claim or deception is being judged in this beat.';
    const target = claim.targetNPC;
    const margin = Number(summary?.margin);
    const marginKnown = Number.isFinite(margin);
    const outcome = String(resolution?.Outcome ?? '').toLowerCase();
    const success = marginKnown
        ? margin > 0
        : ['success', 'light_impact', 'solid_impact', 'dominant_impact'].includes(outcome);
    const failure = marginKnown
        ? margin < 0
        : ['failure', 'checked', 'deflected', 'avoided'].includes(outcome);

    let reaction = `${target} weighs the claim and remains uncertain; render delay, a test, a proof demand, or partial guarded acceptance without full commitment.`;
    if (success) {
        if (marginKnown && margin >= 8) {
            reaction = `${target} believes the claim strongly enough to materially act on it, open access, change trust, or commit resources as context supports.`;
        } else if (marginKnown && margin >= 4) {
            reaction = `${target} believes the claim and adjusts choices, access, trust, or resources accordingly.`;
        } else {
            reaction = `${target} accepts the claim enough for the moment; keep belief provisional if the claim is unsupported or hard to verify.`;
        }
    } else if (failure) {
        if (marginKnown && margin <= -8) {
            reaction = claim.npcAccess === 'direct'
                ? `${target} catches the contradiction and may call the claim false directly.`
                : `${target} strongly disbelieves the claim and may refuse, test it, demand proof, or challenge the inconsistency.`;
        } else if (marginKnown && margin <= -4) {
            reaction = `${target} distrusts the claim and withholds the requested trust, access, resource, safety, authority, or emotional opening.`;
        } else {
            reaction = `${target} doubts the claim; render hesitation, a proof demand, a guarded question, or a limited refusal.`;
        }
    }

    const accessCap = claim.npcAccess === 'direct'
        ? 'Direct scene evidence may support a direct call-out.'
        : 'Do not make the NPC omniscient; failed belief means doubt, distrust, inconsistency, proof demand, refusal, or testing.';
    const accessText = claim.npcAccess === 'direct'
        ? `${target} has direct evidence available.`
        : claim.npcAccess === 'partial'
            ? `${target} has partial access to judge the claim, not omniscient certainty.`
            : `${target} has no special direct access to verify the claim.`;
    return `Treat {{user}}'s claim as a belief contest for ${target}: "${claim.claim}". ${accessText} ${reaction} ${accessCap} Do not present the claim as objective truth unless it was already established as true in visible scene state.`;
}

function narrativeUserKnowledgeFact(applications = []) {
    const items = normalizeUserKnowledgeApplications(applications);
    if (!items.length) return 'No special reputation or personal knowledge about {{user}} is applied this beat.';
    return items
        .map(item => `${item.target} may know or have heard this about {{user}}: ${narratorUserMacroText(item.line)}. Use it only for recognition, demeanor, caution, trust, suspicion, fear, questions, or context when it naturally fits the visible scene.`)
        .join(' ');
}

function narrativeEnvironmentFact(resolution = {}) {
    const oppEnv = list(resolution?.OppTargets?.ENV);
    if (isNoneText(oppEnv)) return 'No special environmental opposition is required.';
    const difficulty = narrativeEnvironmentPressure(resolution);
    return `The relevant environmental obstacle is ${oppEnv}. Treat it as ${difficulty}. Render {{user}}'s attempt against it according to attemptedActionResults, without turning the obstacle into an NPC or relationship participant.`;
}

function narrativeHarmLimitFact(resolution = {}) {
    if (isNoneText(resolution?.nonLethal)) return 'No special harm limit is listed beyond injuryOrDeath and npcForce.';
    if (String(resolution.nonLethal).toUpperCase() === 'Y') {
        return `Keep {{user}}'s harmful result nonlethal unless injuryOrDeath explicitly says otherwise. Do not narrate a killing blow from {{user}} in this beat.`;
    }
    return 'No nonlethal restriction is listed; still obey injuryOrDeath exactly and do not invent extra injury or death.';
}

function narrativeEnvironmentPressure(resolution = {}) {
    const value = Number(resolution.EnvironmentDifficulty ?? resolution.environmentDifficulty ?? 0);
    if (value >= 12) return 'an extreme obstacle';
    if (value >= 8) return 'a hard obstacle';
    if (value >= 4) return 'an ordinary obstacle with real resistance';
    return 'a simple or low-resistance obstacle';
}

function narrativeLimitationsFact(resolution = {}) {
    const parts = [
        narrativeUserImpairmentFact(resolution.UserImpairment),
        narrativeNpcImpairmentFact(resolution.NPCImpairment),
    ].filter(part => part && !isNoneText(part));
    return parts.length ? parts.join(' ') : 'No special physical/mental limitation for {{user}} or an NPC is applied this beat.';
}

function narrativeUserImpairmentFact(impairment = {}) {
    if (!impairment || impairment.Relevant !== 'Y') return '';
    return `{{user}}'s ${narratorUserMacroText(impairment.Source)} affects ${humanizeImpairmentFunctions(impairment.MatchedActionFunction || impairment.AffectedFunction)} through pain, limitation, compensation, instability, reduced speed, partial execution, or cost according to attemptedActionResults. Do not forbid the attempt.`;
}

function narrativeNpcImpairmentFact(impairment = {}) {
    if (!impairment || impairment.Relevant !== 'Y') return '';
    return `${valueOrNone(impairment.NPC)}'s ${valueOrNone(impairment.Source)} affects ${humanizeImpairmentFunctions(impairment.MatchedActionFunction || impairment.AffectedFunction)} through pain, limitation, compensation, instability, reduced speed, partial execution, or cost according to the listed NPC action or response.`;
}

function narrativeInjuryFact(resolution = {}, handoff = {}) {
    const injuries = [
        ...narrativeInflictedNpcInjuries(resolution.InflictedInjuries),
        ...narrativeAggressionTargetInjuries(handoff?.aggressionResults ?? {}),
    ];
    return injuries.length ? injuries.join(' ') : 'No injury or death occurs in this beat.';
}

function narrativeInflictedNpcInjuries(injuries = []) {
    if (!Array.isArray(injuries)) return [];
    return injuries.map(injury => narrativeInjuryEntry({
        target: injury?.NPC,
        condition: injury?.condition,
        severity: injury?.severity,
        wounds: injury?.woundsAdd,
        status: injury?.statusAdd,
        effectType: injury?.effectType,
        rule: injury?.NarrationRule,
    }));
}

function narrativeAggressionTargetInjuries(aggressionResults = {}) {
    const entries = [];
    for (const [name, value] of Object.entries(aggressionResults)) {
        const userInjury = value?.InflictedUserInjury || (value?.InflictedTargetInjury?.targetType === 'user' ? value.InflictedTargetInjury : null);
        if (userInjury) {
            entries.push(narrativeInjuryEntry({
                target: '{{user}}',
                source: name,
                condition: userInjury.condition,
                severity: userInjury.severity ?? userInjury.InjurySeverityLimit,
                wounds: userInjury.woundsAdd,
                status: userInjury.statusAdd,
                effectType: userInjury.effectType,
                rule: userInjury.NarrationRule,
            }));
        }
        const npcInjury = value?.InflictedTargetInjury?.targetType === 'npc' ? value.InflictedTargetInjury : null;
        if (npcInjury) {
            entries.push(narrativeInjuryEntry({
                target: npcInjury.target,
                source: name,
                condition: npcInjury.condition,
                severity: npcInjury.severity ?? npcInjury.InjurySeverityLimit,
                wounds: npcInjury.woundsAdd,
                status: npcInjury.statusAdd,
                effectType: npcInjury.effectType,
                rule: npcInjury.NarrationRule,
            }));
        }
    }
    return entries;
}

function narrativeInjuryEntry({ target, source, condition, severity, wounds, status, effectType, rule }) {
    const targetText = narratorTargetText(target);
    const sourceText = !isNoneText(source) ? ` from ${valueOrNone(source)}` : '';
    const conditionText = valueOrNone(condition);
    const severityText = valueOrNone(severity);
    const woundText = list(wounds);
    const statusText = list(status);
    const details = [
        !isNoneText(conditionText) ? conditionText : '',
        !isNoneText(severityText) ? severityText : '',
        !isNoneText(woundText) ? `wounds: ${woundText}` : '',
        !isNoneText(statusText) ? `status: ${statusText}` : '',
    ].filter(Boolean).join(', ');
    if (String(condition ?? '').toLowerCase() === 'dead') {
        return `${targetText} dies${sourceText}. Narrate death clearly in final prose. ${!isNoneText(rule) ? valueOrNone(rule) : ''}`.trim();
    }
    const effectText = narrativeStatusEffectPlainText(effectType, targetText);
    return `${targetText} receives ${conditionText} condition${sourceText}. This is a lasting injury/status effect: ${details || 'visible harm'}.${effectText} ${!isNoneText(rule) ? valueOrNone(rule) : ''}`.trim();
}

function narrativeStatusEffectPlainText(effectType, targetText) {
    switch (String(effectType ?? '').toLowerCase()) {
        case 'restraint':
            return ` ${targetText} is restrained or physically bound until the scene changes that state.`;
        case 'paralysis':
            return ` ${targetText} is physically impaired by paralysis until the scene changes that state.`;
        case 'blindness':
            return ` ${targetText}'s sight is impaired until the scene changes that state.`;
        case 'stun':
            return ` ${targetText}'s focus and action are impaired by the stun until the scene changes that state.`;
        default:
            return '';
    }
}

function narrativeNpcInitiativeFact(handoff = {}) {
    const active = Object.entries(handoff?.proactivityResults ?? {}).filter(([, value]) => value?.Proactive === 'Y');
    if (!active.length) return 'No additional existing NPC initiative is required beyond npcResponse and npcForce.';
    const denied = new Set((handoff?.npcHandoffs ?? [])
        .filter(npc => npc?.IntimacyBoundary === 'DENY')
        .map(npc => String(npc.NPC ?? '').toLowerCase()));
    return `Include this NPC initiative: ${active.map(([name, value]) => narrativeProactivityEntry(name, value, handoff?.aggressionResults ?? {}, denied)).join(' ')}`;
}

function narrativeProactivityEntry(name, value = {}, aggressionResults = {}, deniedIntimacyNames = new Set()) {
    const intent = proactivityNarrationIntent(value);
    const target = value?.ProactivityTarget && value.ProactivityTarget !== '(none)'
        ? value.ProactivityTarget
        : '{{user}}';
    const targetText = narratorTargetText(target);
    const deniedForNpc = deniedIntimacyNames.has(String(name ?? '').toLowerCase());
    const description = personalizeNpcInstruction(name, proactivityIntentDescription(intent, targetText))
        .replace(/\bAggression result\b/g, 'npcForce fact')
        .replace(/\baggression result\b/g, 'npcForce fact')
        .replace(/\bresolved attack\b/g, 'completed attack');
    const aggressive = isAggressiveProactivityIntent(intent);
    const forceLimit = aggressive
        ? (aggressionResults?.[name]
            ? ' Any completed force must match npcForce.'
            : ' This initiative does not authorize an NPC attack or completed force; obey npcForce.')
        : ' This is not a completed attack.';
    const relationshipLimit = isRomanceInitiativeIntent(intent)
        ? ' Use only if the current beat is calm and no other event is happening; never force gifts, dates, confessions, or romantic escalation into combat, crisis, mourning, active intimacy, public pressure, unresolved danger, boundary conflict, or any scene where the event would interrupt the actual moment. If context does not support it, soften it into ordinary flirtation, attention, or defer it. Do not establish a relationship unless acceptance happens in-scene; do not force intimacy.'
        : '';
    const partnerLimit = isPartnerInitiativeIntent(intent)
        ? ' Use only if the current beat is calm and no other event is happening; never force partner gifts, dates, conflict, or intimacy into combat, crisis, mourning, active intimacy, public pressure, unresolved danger, boundary conflict, or any scene where it would interrupt the actual moment. If context does not support it, soften it into ordinary partner flirtation/teasing or defer it. Keep it consistent with the established relationship, privacy, danger, urgency, and mood.'
        : '';
    const companionLimit = isCompanionInitiativeIntent(intent)
        ? ' Keep it grounded in the immediate danger, the NPC\'s bond, self-preservation, and the listed target.'
        : '';
    const companionSupportLimit = isCompanionSupportIntent(intent)
        ? ' In combat or immediate danger, this support must be tactically useful; do not use comfort-touch, leaning on {{user}}, hand-on-back reassurance, hugging, or sentimental encouragement unless it is physically necessary to drag, brace, shield, heal, or reposition {{user}}.'
        : '';
    const crisisAttackLimit = intent === 'Companion_Attack'
        ? ' This must target only the listed hostile target, never {{user}} or a bystander.'
        : '';
    const denialLimit = deniedForNpc
        ? ' Keep this fully compatible with the intimacy denial; do not turn it into consent, arousal, relationship acceptance, or intimate escalation.'
        : '';
    return `${description}${forceLimit}${relationshipLimit}${partnerLimit}${companionLimit}${companionSupportLimit}${crisisAttackLimit}${denialLimit}`;
}

function narrativeWorldEventFact(handoff = {}) {
    const parts = [];
    const chaos = handoff?.chaosHandoff?.CHAOS ?? {};
    if (chaos?.triggered) {
        parts.push(`Include a brief unexpected scene beat: ${chaosBandGuide(chaos.band)} ${chaosMagnitudeGuide(chaos.magnitude)} Anchor it to ${chaosAnchorGuide(chaos.anchor)}. Its source should be ${chaosVectorGuide(chaos.vector)}. Choose the concrete implementation freely in scene prose, but do not override the main result, consent limits, attacks, injuries, or relationship facts.`);
    }
    const event = powerActorEventNarratorSummary(handoff?.powerActorPressure?.event);
    if (!isNoneText(event)) {
        parts.push(`Include this visible surface event only: ${event}. Do not explain why it happens, who benefits, unseen causes, or hidden pressure behind it.`);
    }
    return parts.length ? parts.join(' ') : '';
}

function narrativeNameRevealFact(nameGeneration = {}) {
    const pool = nameGeneration?.namePool;
    if (!pool) return 'No generated name pool is available; do not invent new proper names unless already established by visible chat, character card, lore, or tracker.';
    const femaleNames = (pool.female || []).map(name => String(name ?? '').trim()).filter(name => name && !isNoneText(name));
    const maleNames = (pool.male || []).map(name => String(name ?? '').trim()).filter(name => name && !isNoneText(name));
    const locationNames = (pool.location || []).map(name => String(name ?? '').trim()).filter(name => name && !isNoneText(name));
    return `Name pool use is mandatory and obeys fog of war. Any newly revealed proper name in this response MUST exactly match one unused approved name from this pool: Female: ${list(femaleNames)}. Male: ${list(maleNames)}. Location: ${list(locationNames)}. If no approved listed name fits, leave the person, entity, or place unnamed. Already revealed names from chat, character card, lore, or tracker may continue unchanged. A new name may appear only after the scene reveals that specific person, entity, or place in-world through speech, readable text, self-introduction, direct reference, signage, documents, or clear recognition. Use the matching gender/presentation bucket when known. Do not invent, modify, translate, combine, suffix, add surnames to, or derive names from existing character names or {{user}}'s name. Do not name background, incidental, or unnamed figures unless the scene actually reveals the name.`;
}

function narrativeProxyUserActionFact(options = {}) {
    if (options?.mode !== 'proxy') return '';
    const action = narratorUserMacroText(options?.latestUserText || options?.proxyUserAction);
    return `Proxy action mode for {{user}} is active for this response only because the latest instruction used double square brackets. The human has asked narration to cover this exact action by {{user}}: ${action}. This is the only exception to normal agency separation. Do not add extra dialogue, thoughts, feelings, decisions, follow-up actions, reactions, silence, or choices for {{user}} beyond that instruction and the listed narrative facts.`;
}

function buildNarratorSummary(handoff, resolution, ledger = {}, options = {}) {
    const semanticResolution = ledger?.resolutionEngine ?? {};
    const userAction = readableActionDescription(semanticResolution, resolution);
    const npcText = (handoff.npcHandoffs ?? []).map(h => [
        h.NPC,
        h.FinalState,
        h.Behavior,
        h.Target,
        `stakes:${h.NPC_STAKES}`,
        `landed:${h.Landed}`,
        `intimacy:${h.IntimacyBoundary ?? 'SKIP'}/${h.IntimacyBoundarySource ?? 'NONE'}/${h.IntimacyRefusalStyle ?? 'NONE'}`,
        `boundary:${h.BoundaryPressure ?? 'N'}`,
        `pressure:${h.HostilePressure ?? 0}/${h.HostileLandedPressure ?? 0}/${h.DominantLock ?? 'None'}/${h.PressureMode ?? 'none'}`,
        h.PersonalitySummary && !isNoneText(h.PersonalitySummary) ? `personality:${h.PersonalitySummary}` : '',
    ].filter(Boolean).join('/')).join(';') || 'none';

    const chaos = handoff.chaosHandoff?.CHAOS ?? {};
    const chaosText = chaos.triggered
        ? `${chaos.band}/${chaos.magnitude}/${chaos.anchor}/${chaos.vector}`
        : 'none';

    const proactiveText = Object.entries(formatProactivityForNarration(handoff.proactivityResults ?? {}))
        .filter(([, value]) => value?.Proactive === 'Y')
        .map(([name, value]) => {
            const aggressionAudit = proactivityAggressionAudit(value, handoff.aggressionResults?.[name]);
            return [
                `${name}: ${value.Intent}`,
                `impulse:${value.Impulse}`,
                `target:${value.ProactivityTarget ?? '(none)'}`,
                value.RomanceInitiative === 'Y' ? `romanceDie:${value.RomanceInitiativeDie ?? 'unknown'}` : '',
                value.RomanceInitiative === 'Y' ? `romanceContext:${value.RomanceInitiativeContext ?? 'unknown'}` : '',
                value.PartnerInitiative === 'Y' ? `partnerDie:${value.PartnerInitiativeDie ?? 'unknown'}` : '',
                value.PartnerInitiative === 'Y' ? `partnerContext:${value.PartnerInitiativeContext ?? 'unknown'}` : '',
                aggressionAudit,
            ].filter(Boolean).join('/');
        }).join(';') || 'none';

    const aggressionText = Object.entries(handoff.aggressionResults ?? {}).map(([name, value]) =>
        `${name}/${value.AttackType ?? 'Attack'}/${value.ReactionOutcome}/target:${value.ProactivityTarget ?? '{{user}}'}/attackStat:${value.AttackStat ?? 'PHY'}/defenseStat:${value.DefenseStat ?? value.AttackStat ?? 'PHY'}/style:${value.AttackStyle ?? aggressionStyleFromStat(value.AttackStat)}/bonus:${value.CounterBonus ?? 0}/margin:${value.Margin}/npcImpair:${npcImpairmentSummary(value.NPCImpairment)}/targetDefenseImpair:${userImpairmentSummary(value.TargetImpairment || value.UserImpairment)}`,
    ).join(';') || 'none';
    const generatedName = nameGenerationSummary(handoff.nameGeneration);
    const powerActorAssessment = powerActorAssessmentSummary(ledger?.powerActorEnmity?.assessments);
    const powerActorEnmityEffect = powerActorEnmityEffectSummary(ledger?.powerActorEnmity?.effects);
    const powerActorPressure = powerActorPressureNarratorSummary(handoff.powerActorPressure);
    const powerActorEvent = powerActorEventNarratorSummary(handoff.powerActorPressure?.event);
    const powerActorEventAudit = powerActorEventAuditSummary(handoff.powerActorPressure?.event);
    const userKnowledgeApplication = userKnowledgeApplicationSummary(ledger?.userKnowledgeApplication?.applications);
    const userAbilityUse = userAbilityUseSummary(resolution.UserAbilityUse);
    const itemUse = itemUseSummary(resolution.ItemUse);
    const userImpairment = userImpairmentSummary(resolution.UserImpairment);
    const npcImpairment = npcImpairmentSummary(resolution.NPCImpairment);
    const aggressionNpcInjury = inflictedAggressionNpcInjurySummary(handoff.aggressionResults ?? {});
    const inflictedNpcInjury = [inflictedNpcInjurySummary(resolution.InflictedInjuries), aggressionNpcInjury]
        .filter(item => item && item !== 'none')
        .join('; ') || 'none';
    const inflictedUserInjury = inflictedUserInjurySummary(handoff.aggressionResults ?? {});

    const result = naturalOutcomeSummary(resolution);
    const rollAudit = rollAuditFromResultLine(handoff.resultLine, resolution);
    const environmentDifficulty = environmentDifficultySummary(resolution);
    const claimCheck = claimCheckSummary(resolution.ClaimCheck);
    const intimacyBoundary = intimacyBoundarySummary(handoff);

    return {
        userAction,
        decisiveAction: userAction,
        result,
        rollUsed: rollAudit.rollUsed,
        rollFull: rollAudit.rollFull,
        environmentDifficulty,
        outcome: outcomeAuditLabel(resolution),
        margin: rollAudit.margin,
        actionCount: actionCountSummary(resolution.actions),
        landedActions: resolution.LandedActions ?? '(none)',
        intimacyBoundary,
        relationshipResult: relationshipResultSummary(handoff, resolution),
        actions: list(resolution.actions),
        RollNeeded: resolution.RollNeeded ?? 'N',
        targets: targetSummary(resolution),
        counter: resolution.CounterPotential ?? 'none',
        userImpairment,
        npcImpairment,
        inflictedNpcInjury,
        inflictedUserInjury,
        npc: npcText,
        chaos: chaosText,
        userAbilityUse,
        itemUse,
        claimCheck,
        userKnowledgeApplication,
        proactive: proactiveText,
        aggression: aggressionText,
        generatedName,
        powerActorAssessment,
        powerActorEnmityEffect,
        powerActorPressure,
        powerActorEvent,
        powerActorEventAudit,
    };
}

function uniqueSceneCastNames(values) {
    const seen = new Set();
    const names = [];
    const stack = Array.isArray(values) ? [...values] : [values];
    while (stack.length) {
        const value = stack.shift();
        if (Array.isArray(value)) {
            stack.push(...value);
            continue;
        }
        const text = String(value ?? '').trim();
        if (!text || isNoneText(text) || !isSceneNpcName(text)) continue;
        const key = text.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        names.push(text);
    }
    return names;
}

function isSceneNpcName(value) {
    const text = String(value ?? '').trim().toLowerCase();
    return !['{{user}}', 'user', 'you', 'the user'].includes(text);
}

function rollAuditFromResultLine(resultLine, resolution) {
    if (resolution?.RollNeeded === 'N') return { rollUsed: 'none', rollFull: 'none', margin: 'none' };
    const text = String(resultLine ?? '').trim();
    const marginMatch = text.match(/\((-?\d+)\s*-\s*[^)]+\)\s*$/)
        || text.match(/=\s*(-?\d+)\s*vs\s*1d20\(\d+\)(?:\s*\+\s*(?:PHY|MND|CHA|ENV)\(\d+\))?(?:\s*\+\s*impairment\(-?\d+\))?\s*=\s*(-?\d+)/i);
    const statMatch = text.match(/\+\s*(PHY|MND|CHA)\(\d+\).*?vs\s*1d20\(\d+\)(?:\s*\+\s*(PHY|MND|CHA|ENV)\(\d+\))?/i);
    const left = marginMatch ? Number(marginMatch[1]) : null;
    const right = marginMatch?.[2] !== undefined ? Number(marginMatch[2]) : null;
    const margin = marginMatch?.[2] === undefined
        ? (Number.isFinite(left) ? String(left) : 'unknown')
        : (Number.isFinite(left) && Number.isFinite(right) ? String(left - right) : 'unknown');
    const userStat = statMatch?.[1] || 'USER';
    const oppStat = statMatch?.[2] || (text.includes('vs 1d20') ? 'ENV' : 'OPP');
    return {
        rollUsed: `${userStat} vs ${oppStat}`,
        rollFull: text || 'unknown',
        margin,
    };
}

function actionCountSummary(actions) {
    if (!Array.isArray(actions) || !actions.length) return '0';
    return `${actions.length} (${list(actions)})`;
}

function outcomeAuditLabel(resolution) {
    if (resolution?.RollNeeded === 'N' || resolution?.Outcome === 'no_roll') return 'No Roll';
    const tier = String(resolution?.OutcomeTier ?? '').replace(/_/g, ' ').trim();
    const outcome = String(resolution?.Outcome ?? '').replace(/_/g, ' ').trim();
    return tier || outcome || 'Computed Outcome';
}

function relationshipResultSummary(handoff, resolution) {
    const npcs = Array.isArray(handoff?.npcHandoffs) ? handoff.npcHandoffs : [];
    if (!npcs.length) return 'none';
    return npcs.map(npc => [
        npc.NPC || '(unknown)',
        `target:${npc.Target ?? 'No Change'}`,
        `intimacy:${npc.IntimacyBoundary ?? 'SKIP'}/${npc.IntimacyBoundarySource ?? 'NONE'}`,
        `boundary:${npc.BoundaryPressure ?? 'N'}`,
        `pressure:${npc.HostilePressure ?? 0}/${npc.HostileLandedPressure ?? 0}`,
    ].join('/')).join('; ');
}

function intimacyBoundarySummary(handoff) {
    const npcs = Array.isArray(handoff?.npcHandoffs) ? handoff.npcHandoffs : [];
    const relevant = npcs.filter(npc => npc?.IntimacyBoundary && npc.IntimacyBoundary !== 'SKIP');
    if (!relevant.length) return 'none';
    return relevant.map(npc => [
        npc.NPC || '(unknown)',
        npc.IntimacyBoundary,
        `source:${npc.IntimacyBoundarySource ?? 'NONE'}`,
        `style:${npc.IntimacyRefusalStyle ?? 'NONE'}`,
    ].join('/')).join('; ');
}

function behaviorNarrationGuide(behavior) {
    switch (behavior) {
        case 'TERROR':
            return 'The NPC is terrified or panicked; prioritize flight, freezing, surrender, pleading, or desperate self-protection.';
        case 'HATRED':
            return 'The NPC is openly hostile; allow obstruction, threats, attack preparation, refusal, sabotage, or escalation when the scene supports it.';
        case 'FREEZE':
            return 'The NPC is guarded, tense, wary, hesitant, avoidant, appeasing, or frozen by fear/hostility; keep reactions restrained or protective.';
        case 'CLOSE':
            return 'The NPC is close or deeply trusting; allow warmth, loyalty, proximity, confiding, and personal investment, but not automatic romance or intimacy.';
        case 'FRIENDLY':
            return 'The NPC is friendly, cooperative, or comfortable, but not deeply bonded.';
        case 'NEUTRAL':
            return 'The NPC is neutral, practical, polite, transactional, or reserved.';
        case 'BROKEN':
            return 'The NPC has little trust and tends to avoid, disengage, comply minimally, or keep distance.';
        default:
            return 'Use the NPC current relationship state naturally.';
    }
}

function parseRelationshipState(value) {
    const match = String(value ?? '').match(/B(\d+)\/F(\d+)\/H(\d+)/i);
    if (!match) return null;
    const state = {
        B: clampRelationshipBand(Number(match[1])),
        F: clampRelationshipBand(Number(match[2])),
        H: clampRelationshipBand(Number(match[3])),
    };
    if (state.F >= 3 || state.H >= 3) {
        state.B = 1;
    }
    return state;
}

function clampRelationshipBand(value) {
    if (!Number.isFinite(value)) return 1;
    return Math.max(1, Math.min(4, value));
}

function chaosBandGuide(band) {
    switch (String(band ?? '').toUpperCase()) {
        case 'HOSTILE':
            return 'worsens danger or opposition.';
        case 'COMPLICATION':
            return 'adds friction, cost, delay, or uncertainty.';
        case 'BENEFICIAL':
            return 'creates a useful opening, information, or advantage.';
        default:
            return 'adds a small contextual disruption or opening.';
    }
}

function chaosMagnitudeGuide(magnitude) {
    switch (String(magnitude ?? '').toUpperCase()) {
        case 'MINOR':
            return 'Keep it small and quick; do not let it hijack the scene.';
        case 'MODERATE':
            return 'Make it noticeable but brief.';
        case 'MAJOR':
            return 'Make it strong scene pressure or a strong opportunity.';
        case 'EXTREME':
            return 'Make it a rare scene-changing disruption or reveal.';
        default:
            return 'Keep it proportional to the scene.';
    }
}

function chaosAnchorGuide(anchor) {
    switch (String(anchor ?? '').toUpperCase()) {
        case 'GOAL':
            return "{{user}}'s current goal or action";
        case 'ENVIRONMENT':
            return 'terrain, weather, objects, or physical surroundings';
        case 'KNOWN_NPC':
            return 'a known NPC acting or being affected';
        case 'RESOURCE':
            return 'tools, supplies, access, gear, money, or other resources';
        case 'CLUE':
            return 'information, evidence, a sign, or an overheard detail';
        default:
            return 'the immediate scene';
    }
}

function chaosVectorGuide(vector) {
    switch (String(vector ?? '').toUpperCase()) {
        case 'NPC':
            return 'an NPC';
        case 'CROWD':
            return 'crowd, bystanders, or nearby people';
        case 'AUTHORITY':
            return 'guards, officials, leaders, or authority';
        case 'ENVIRONMENT':
            return 'the physical environment';
        case 'SYSTEM':
            return 'infrastructure, rules, magic, alarms, or system pressure';
        case 'ENTITY':
            return 'an entity, force, or presence';
        default:
            return 'the most plausible scene source';
    }
}

function userImpairmentSummary(impairment) {
    if (!impairment || impairment.Relevant !== 'Y') return 'none';
    return [
        `source:${valueOrNone(impairment.Source)}`,
        `stage:${valueOrNone(impairment.Stage)}`,
        `penalty:${Number(impairment.RollPenalty ?? 0)}`,
        `applied:${valueOrNone(impairment.AppliedToRoll)}`,
        `affects:${humanizeImpairmentFunctions(impairment.MatchedActionFunction || impairment.AffectedFunction)}`,
        `rule:${valueOrNone(impairment.NarrationRule)}`,
    ].join('/');
}

function npcImpairmentSummary(impairment) {
    if (!impairment || impairment.Relevant !== 'Y') return 'none';
    return [
        `npc:${valueOrNone(impairment.NPC)}`,
        `source:${valueOrNone(impairment.Source)}`,
        `stage:${valueOrNone(impairment.Stage)}`,
        `penalty:${Number(impairment.RollPenalty ?? 0)}`,
        `applied:${valueOrNone(impairment.AppliedToRoll)}`,
        `affects:${humanizeImpairmentFunctions(impairment.MatchedActionFunction || impairment.AffectedFunction)}`,
        `rule:${valueOrNone(impairment.NarrationRule)}`,
    ].join('/');
}

function inflictedNpcInjurySummary(injuries) {
    if (!Array.isArray(injuries) || !injuries.length) return 'none';
    return injuries.map(injury => [
        `npc:${valueOrNone(injury.NPC)}`,
        `condition:${valueOrNone(injury.condition)}`,
        `severity:${valueOrNone(injury.severity)}`,
        `wounds:${list(injury.woundsAdd)}`,
        `status:${list(injury.statusAdd)}`,
        `rule:${valueOrNone(injury.NarrationRule)}`,
    ].join('/')).join('; ');
}

function inflictedUserInjurySummary(aggressionResults) {
    const injuries = Object.entries(aggressionResults ?? {})
        .map(([name, value]) => ({ name, injury: value?.InflictedUserInjury || (value?.InflictedTargetInjury?.targetType === 'user' ? value.InflictedTargetInjury : null) }))
        .filter(item => item.injury);
    if (!injuries.length) return 'none';
    return injuries.map(({ name, injury }) => [
        `source:${valueOrNone(name)}`,
        `condition:${valueOrNone(injury.condition)}`,
        `severity:${valueOrNone(injury.severity)}`,
        `wounds:${list(injury.woundsAdd)}`,
        `status:${list(injury.statusAdd)}`,
        `detailMode:${valueOrNone(injury.InjuryDetailMode)}`,
        `severityLimit:${valueOrNone(injury.InjurySeverityLimit)}`,
        `context:${valueOrNone(injury.InjuryContextHint)}`,
        `rule:${valueOrNone(injury.NarrationRule)}`,
    ].join('/')).join('; ');
}

function inflictedAggressionNpcInjurySummary(aggressionResults) {
    const injuries = Object.entries(aggressionResults ?? {})
        .map(([name, value]) => ({ name, injury: value?.InflictedTargetInjury }))
        .filter(item => item.injury?.targetType === 'npc');
    if (!injuries.length) return 'none';
    return injuries.map(({ name, injury }) => [
        `source:${valueOrNone(name)}`,
        `npc:${valueOrNone(injury.target)}`,
        `condition:${valueOrNone(injury.condition)}`,
        `severity:${valueOrNone(injury.severity)}`,
        `wounds:${list(injury.woundsAdd)}`,
        `status:${list(injury.statusAdd)}`,
        `detailMode:${valueOrNone(injury.InjuryDetailMode)}`,
        `severityLimit:${valueOrNone(injury.InjurySeverityLimit)}`,
        `context:${valueOrNone(injury.InjuryContextHint)}`,
        `rule:${valueOrNone(injury.NarrationRule)}`,
    ].join('/')).join('; ');
}

function nameGenerationSummary(nameGeneration) {
    if (!nameGeneration?.namePool) {
        return 'none';
    }
    const style = valueOrNone(nameGeneration.style);
    return style !== '(none)'
        ? `style: ${style}; final: ${namePoolText(nameGeneration.namePool)}`
        : namePoolText(nameGeneration.namePool);
}

function powerActorAssessmentSummary(assessments) {
    const entries = Array.isArray(assessments) ? assessments : [];
    if (!entries.length) return 'none';
    return entries
        .map(entry => {
            const actor = valueOrNone(entry.actor ?? entry.Actor);
            const flag = (entry.isPowerActor ?? entry.IsPowerActor) ? 'Y' : 'N';
            const scope = valueOrNone(entry.scope ?? entry.Scope);
            const type = valueOrNone(entry.actorType ?? entry.ActorType);
            const reach = list(entry.reach ?? entry.Reach);
            const evidence = valueOrNone(entry.evidence ?? entry.Evidence);
            const reason = valueOrNone(entry.assessmentReason ?? entry.AssessmentReason ?? entry.reason ?? entry.Reason);
            return `${actor}/${flag}/${scope}/${type}/reach:${reach}/evidence:${evidence}/reason:${reason}`;
        })
        .join('; ');
}

function powerActorEnmityEffectSummary(effects) {
    const entries = Array.isArray(effects) ? effects : [];
    if (!entries.length) return 'none';
    return entries
        .map(entry => {
            const actor = valueOrNone(entry.actor ?? entry.Actor);
            const type = valueOrNone(entry.actorType ?? entry.ActorType);
            const effect = valueOrNone(entry.effect ?? entry.Effect);
            const severity = valueOrNone(entry.severity ?? entry.Severity);
            const known = (entry.knownToActor ?? entry.KnownToActor) ? 'Y' : 'N';
            const reason = valueOrNone(entry.reason ?? entry.Reason);
            return `${actor}/${type}/${effect}/${severity}/known:${known}/reason:${reason}`;
        })
        .join('; ');
}

function powerActorPressureSummary(powerActorPressure) {
    const entries = Array.isArray(powerActorPressure?.entries) ? powerActorPressure.entries : [];
    if (!entries.length) return 'none';
    return entries
        .map(entry => `${valueOrNone(entry.Actor)}/${entry.Enmity ?? 0}/${valueOrNone(entry.Tier)}`)
        .join('; ');
}

function powerActorPressureNarratorSummary(powerActorPressure) {
    const entries = Array.isArray(powerActorPressure?.entries) ? powerActorPressure.entries : [];
    if (!entries.length) return 'none';
    return entries
        .map(entry => {
            const tier = valueOrNone(entry.Tier);
            const reasons = Array.isArray(entry.Reasons) && entry.Reasons.length ? `reasons:${list(entry.Reasons)}` : '';
            return `${valueOrNone(entry.Actor)} (${valueOrNone(entry.Type)}): enmity ${entry.Enmity ?? 0}, tier ${tier}${reasons ? `, ${reasons}` : ''}`;
        })
        .join('; ');
}

function powerActorEventAuditSummary(event) {
    if (!event || typeof event !== 'object') return 'none';
    const eventType = valueOrNone(event.EventType ?? event.eventType);
    const instruction = valueOrNone(event.VisibleInstruction ?? event.visibleInstruction);
    const contact = valueOrNone(event.ContactName ?? event.contactName);
    const role = valueOrNone(event.SurfaceRole ?? event.surfaceRole);
    return `${eventType}/contact:${contact}/role:${role}/visible:${instruction}`;
}

function powerActorEventNarratorSummary(event) {
    if (!event || typeof event !== 'object') return 'none';
    const instruction = narratorUserMacroText(event.VisibleInstruction ?? event.visibleInstruction);
    if (isNoneText(instruction)) return 'none';
    const contact = valueOrNone(event.ContactName ?? event.contactName);
    const role = valueOrNone(event.SurfaceRole ?? event.surfaceRole);
    const details = [
        !isNoneText(contact) ? `contact:${contact}` : '',
        !isNoneText(role) ? `role:${role}` : '',
    ].filter(Boolean).join('; ');
    return `${instruction}${details ? ` (${details})` : ''}`;
}

function readableActionDescription(semanticResolution, resolution) {
    const challenge = valueOrNone(semanticResolution.identifyChallenge);
    if (challenge !== '(none)') return challenge;
    const explicit = valueOrNone(semanticResolution.explicitMeans);
    if (explicit !== '(none)') return explicit;
    const goal = valueOrNone(resolution.GOAL);
    const targets = list(resolution.ActionTargets);
    return targets && targets !== 'none' ? `${goal} toward ${targets}` : goal;
}

function targetSummary(resolution) {
    const parts = [];
    const hostiles = list(resolution.hostilesInScene?.NPC);
    const actionTargets = list(resolution.ActionTargets);
    const oppNpc = list(resolution.OppTargets?.NPC);
    const oppEnv = list(resolution.OppTargets?.ENV);
    const benefited = list(resolution.BenefitedObservers);
    const harmed = list(resolution.HarmedObservers);
    const powerActors = list(resolution.PowerActors);
    if (!isNoneText(hostiles)) parts.push(`hostiles:${hostiles}`);
    if (!isNoneText(actionTargets)) parts.push(`action:${actionTargets}`);
    if (!isNoneText(oppNpc)) parts.push(`opposes:${oppNpc}`);
    if (!isNoneText(oppEnv)) parts.push(`env:${oppEnv}`);
    if (!isNoneText(benefited)) parts.push(`benefits:${benefited}`);
    if (!isNoneText(harmed)) parts.push(`harms:${harmed}`);
    if (!isNoneText(powerActors)) parts.push(`power:${powerActors}`);
    return parts.join('; ') || 'none';
}

function environmentDifficultySummary(resolution = {}) {
    const oppEnv = list(resolution.OppTargets?.ENV);
    if (isNoneText(oppEnv) || resolution.RollNeeded === 'N' || resolution.Outcome === 'no_roll') return 'none';
    const value = Number(resolution.EnvironmentDifficulty ?? resolution.environmentDifficulty ?? 0);
    const labels = {
        0: 'Easy',
        4: 'Average',
        8: 'Hard',
        12: 'Extreme',
    };
    const normalized = Object.prototype.hasOwnProperty.call(labels, value) ? value : 0;
    return `OppTargets.ENV=${oppEnv}; difficulty=${labels[normalized]}/${normalized}`;
}

function normalizeAbilityUseObject(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const rawUsed = ['Y', 'YES', 'TRUE'].includes(String(source.Used ?? source.used ?? '').trim().toUpperCase())
        || source.Used === true
        || source.used === true;
    const attempted = rawUsed
        || ['Y', 'YES', 'TRUE'].includes(String(source.Attempted ?? source.attempted ?? '').trim().toUpperCase())
        || source.Attempted === true
        || source.attempted === true;
    const available = rawUsed
        || ['Y', 'YES', 'TRUE'].includes(String(source.Available ?? source.available ?? '').trim().toUpperCase())
        || source.Available === true
        || source.available === true;
    const used = attempted && available && rawUsed;
    const abilityName = valueOrNone(source.AbilityName ?? source.abilityName);
    const evidence = valueOrNone(source.Evidence ?? source.evidence);
    const narrativeEffect = valueOrNone(source.NarrativeEffect ?? source.narrativeEffect);
    const noEffectReason = valueOrNone(source.NoEffectReason ?? source.noEffectReason);
    return {
        used,
        attempted,
        available: attempted && available,
        abilityName: attempted && !isNoneText(abilityName) ? abilityName : '(none)',
        evidence: attempted && !isNoneText(evidence) ? evidence : '(none)',
        narrativeEffect: attempted && !isNoneText(narrativeEffect) ? narrativeEffect : '(none)',
        noEffectReason: attempted && !available && !isNoneText(noEffectReason) ? noEffectReason : '(none)',
        mechanicalScope: 'flavor_only_no_bonus',
    };
}

function userAbilityUseSummary(value = {}) {
    const ability = normalizeAbilityUseObject(value);
    if (!ability.attempted) return 'none';
    if (!ability.available) {
        return `unavailable ability/spell attempt: ${ability.abilityName}; evidence:${ability.evidence}; attemptedEffect:${ability.narrativeEffect}; noEffectReason:${ability.noEffectReason}; scope:${ability.mechanicalScope}`;
    }
    return `${ability.abilityName}; evidence:${ability.evidence}; effect:${ability.narrativeEffect}; scope:${ability.mechanicalScope}`;
}

function userAbilityUseGuide(value = {}) {
    const ability = normalizeAbilityUseObject(value);
    if (!ability.attempted) return 'none';
    if (!ability.available) {
        return `Unavailable ability/spell attempt: ${ability.abilityName}. No ability effect occurs. Do not create the attempted effect: ${ability.narrativeEffect}. Render only the lack of effect and visible reactions. This is not a roll, denial, activation, fizzle, or backlash.`;
    }
    return `Preserve user ability effect as direct scene fact: ${ability.narrativeEffect}. Ability=${ability.abilityName}; evidence=${ability.evidence}. Render only the effect/delivery; do not announce, name, activate, focus, channel, charge, or explain the ability. It is flavor_only_no_bonus: do not add bonuses, success, roll changes, extra landed actions, or bypassed stakes. If the broader goal has stakes, narrate the resolved outcome normally while preserving this ability method.`;
}

function normalizeItemUseObject(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const attempted = ynBool(source.Attempted ?? source.attempted);
    const rawAvailable = ynBool(source.Available ?? source.available);
    const item = valueOrNone(source.Item ?? source.item);
    const evidence = valueOrNone(source.Evidence ?? source.evidence);
    const noEffectReason = valueOrNone(source.NoEffectReason ?? source.noEffectReason);
    const savedItem = valueOrNone(source.SavedItem ?? source.savedItem);
    const rawSource = String(source.Source ?? source.source ?? 'none').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const allowed = ['none', 'gear', 'inventory', 'unavailable'];
    let itemSource = allowed.includes(rawSource) ? rawSource : 'unavailable';
    if (!attempted) itemSource = 'none';
    const available = attempted && rawAvailable && itemUseSourceIsAvailable(itemSource);
    if (attempted && !available) itemSource = 'unavailable';
    return {
        attempted,
        available,
        item: attempted && !isNoneText(item) ? item : '(none)',
        source: itemSource,
        evidence: attempted && !isNoneText(evidence) ? evidence : '(none)',
        noEffectReason: attempted && !available && !isNoneText(noEffectReason) ? noEffectReason : '(none)',
        savedItem: attempted && available && !isNoneText(savedItem) ? savedItem : '(none)',
    };
}

function itemUseSourceIsAvailable(source) {
    return ['gear', 'inventory'].includes(String(source ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_'));
}

function itemUseSummary(value = {}) {
    const item = normalizeItemUseObject(value);
    if (!item.attempted) return 'none';
    if (!item.available) {
        return `unavailable personal item attempt: ${item.item}; source:${item.source}; evidence:${item.evidence}; noEffectReason:${item.noEffectReason}`;
    }
    const state = !isNoneText(item.savedItem) && item.savedItem !== item.item ? `; savedItem:${item.savedItem}` : '';
    return `${item.item}; source:${item.source}; evidence:${item.evidence}${state}`;
}

function itemUseGuide(value = {}) {
    const item = normalizeItemUseObject(value);
    if (!item.attempted) return 'none';
    if (item.available) {
        const state = !isNoneText(item.savedItem) && item.savedItem !== item.item ? ` Saved item state: ${item.savedItem}; preserve concrete limitations in that saved state.` : '';
        return `Personal item branch: ${item.item} is available from user ${item.source}.${state} Preserve access as scene fact only; do not add bonuses, automatic success, extra landed actions, or bypassed stakes from item use.`;
    }
    return `Unavailable personal item branch: ${item.item} is not in user gear/inventory. No item effect occurs. After the attempted access point, narrate immediate absence or failed access: empty belt/sheath/pack/pocket, no item under the hand, or no item effect. Do not narrate the item appearing, being drawn, wielded, used, consumed, spent, presented, unlocking anything, or entering {{user}} possession. Visible reactions may follow from the failed access.`;
}

function normalizeClaimCheckObject(value = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const present = ynBool(source.present ?? source.Present);
    const stakesImpact = ynBool(source.stakesImpact ?? source.StakesImpact);
    const claim = String(source.claim ?? source.Claim ?? '').trim();
    const targetNPC = String(source.targetNPC ?? source.TargetNPC ?? '').trim();
    const truthStatus = String(source.truthStatus ?? source.TruthStatus ?? 'none').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const npcAccess = String(source.npcAccess ?? source.NPCAccess ?? 'none').trim().toLowerCase().replace(/[\s-]+/g, '_');
    const reason = String(source.reason ?? source.Reason ?? '').trim();
    return {
        present,
        claim: present && !isNoneText(claim) ? claim : '(none)',
        targetNPC: present && !isNoneText(targetNPC) ? targetNPC : '(none)',
        truthStatus: present && ['known_true', 'known_false', 'unsupported', 'unknown'].includes(truthStatus) ? truthStatus : 'none',
        npcAccess: present && ['direct', 'partial', 'unknown'].includes(npcAccess) ? npcAccess : 'none',
        stakesImpact: present && stakesImpact,
        reason: present && !isNoneText(reason) ? reason : '(none)',
    };
}

function claimCheckSummary(value = {}) {
    const claim = normalizeClaimCheckObject(value);
    if (!claim.present) return 'none';
    return [
        `claim:"${quoteInline(claim.claim)}"`,
        `target:${claim.targetNPC}`,
        `truth:${claim.truthStatus}`,
        `access:${claim.npcAccess}`,
        `stakes:${claim.stakesImpact ? 'Y' : 'N'}`,
        `reason:${claim.reason}`,
    ].join('; ');
}

function claimCheckGuide(value = {}, resolution = {}, rollAudit = {}) {
    const claim = normalizeClaimCheckObject(value);
    if (!isStakeBearingUntrustedClaimForNarration(claim)) return 'none';
    const target = claim.targetNPC;
    const margin = Number(rollAudit?.margin);
    const marginKnown = Number.isFinite(margin);
    const outcome = String(resolution?.Outcome ?? '').toLowerCase();
    const success = marginKnown
        ? margin > 0
        : ['success', 'light_impact', 'solid_impact', 'dominant_impact'].includes(outcome);
    const failure = marginKnown
        ? margin < 0
        : ['failure', 'checked', 'deflected', 'avoided'].includes(outcome);
    const accessCap = claim.npcAccess === 'direct'
        ? 'NPC access is direct; a strong failed claim may be called out as false when scene evidence supports it.'
        : 'NPC access is not direct; failed claim means doubt, distrust, inconsistency, proof demand, refusal, or testing, not omniscient certainty.';

    let reaction = `${target} weighs the factual claim as a belief contest.`;
    if (success) {
        if (marginKnown && margin >= 8) {
            reaction = `${target} believes the claim strongly enough to materially act on it, open access, change trust, or commit resources as context supports.`;
        } else if (marginKnown && margin >= 4) {
            reaction = `${target} believes the claim and adjusts choices, access, trust, or resources accordingly.`;
        } else {
            reaction = `${target} accepts the claim enough for the moment; keep belief provisional if the claim is unsupported or hard to verify.`;
        }
    } else if (failure) {
        if (marginKnown && margin <= -8) {
            reaction = claim.npcAccess === 'direct'
                ? `${target} catches the contradiction and may call the claim false directly.`
                : `${target} strongly disbelieves the claim and may refuse, test it, demand proof, or challenge the inconsistency.`;
        } else if (marginKnown && margin <= -4) {
            reaction = `${target} distrusts the claim and withholds the requested trust, access, resource, safety, authority, or emotional opening.`;
        } else {
            reaction = `${target} doubts the claim; render hesitation, a proof demand, a guarded question, or a limited refusal.`;
        }
    } else {
        reaction = `${target} remains uncertain; render delay, a test, a proof demand, or partial guarded acceptance without full commitment.`;
    }

    return `Claim branch: treat this as a belief contest. ${reaction} ${accessCap} Do not narrate the claim itself as established truth unless TruthStatus=known_true; this branch is only NPC belief/disbelief guidance.`;
}

function isStakeBearingUntrustedClaimForNarration(claim) {
    return claim?.present
        && claim?.stakesImpact
        && ['known_false', 'unsupported'].includes(claim.truthStatus);
}

function userKnowledgeApplicationSummary(applications = []) {
    const items = normalizeUserKnowledgeApplications(applications);
    if (!items.length) return 'none';
    return items.map(item => [
        `target:${item.target}`,
        `effect:${item.effect}`,
        `type:${item.type}`,
        `scope:${item.scope}`,
        `valence:${item.valence}`,
        `line:${item.line}`,
    ].join('/')).join('; ');
}

function userKnowledgeApplicationGuide(applications = []) {
    const items = normalizeUserKnowledgeApplications(applications);
    if (!items.length) return 'none';
    const lines = items.map(item => `${item.target}: ${item.line} (${item.effect}/${item.scope}${item.valence !== 'none' ? `/${item.valence}` : ''})`);
    return `Apply only these current-scene user knowledge/reputation facts as what the listed target plausibly knows or has heard: ${lines.join('; ')}. Do not reveal hidden ledger mechanics, IDs, spread logic, or offscreen sources. Use this for demeanor, caution, trust, suspicion, fear, recognition, questions, or context only when it naturally fits the visible scene.`;
}

function normalizeUserKnowledgeApplications(applications = []) {
    return (Array.isArray(applications) ? applications : [])
        .map(item => {
            const source = item && typeof item === 'object' ? item : {};
            const target = valueOrNone(source.target ?? source.Target);
            const line = valueOrNone(source.line ?? source.Line);
            const effect = normalizeKnowledgeEffect(source.effect ?? source.Effect);
            if (isNoneText(target) || isNoneText(line) || effect === 'none') return null;
            return {
                target,
                line,
                effect,
                type: normalizeKnowledgeType(source.type ?? source.Type),
                scope: normalizeKnowledgeScope(source.scope ?? source.Scope),
                valence: normalizeKnowledgeValence(source.valence ?? source.Valence),
            };
        })
        .filter(Boolean)
        .slice(0, 12);
}

function normalizeKnowledgeEffect(value) {
    const text = String(value ?? '').trim().replace(/[\s-]+/g, '').toLowerCase();
    if (text === 'priorusergoodrep') return 'priorUserGoodRep';
    if (text === 'userbadrep') return 'userBadRep';
    if (text === 'userfearrep') return 'userFearRep';
    if (text === 'contextonly') return 'contextOnly';
    return 'none';
}

function normalizeKnowledgeType(value) {
    const text = String(value ?? '').trim().replace(/[\s-]+/g, '').toLowerCase();
    if (text === 'reputation' || text === 'reputationknowledge') return 'reputationKnowledge';
    return 'personalKnowledge';
}

function normalizeKnowledgeScope(value) {
    const text = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    return ['private', 'local', 'route', 'faction', 'regional', 'legendary'].includes(text) ? text : 'private';
}

function normalizeKnowledgeValence(value) {
    const text = String(value ?? '').trim().toLowerCase().replace(/[\s-]+/g, '_');
    if (['good', 'bad', 'fear'].includes(text)) return text;
    return 'none';
}

function quoteInline(value) {
    return String(value ?? '').replace(/\s+/g, ' ').trim().replace(/"/g, "'");
}

function ynBool(value) {
    if (typeof value === 'boolean') return value;
    const text = String(value ?? '').trim().toLowerCase();
    return text === 'y' || text === 'yes' || text === 'true' || text === '1';
}

function primaryNarrationNpc(handoff, resolution) {
    const npcs = Array.isArray(handoff?.npcHandoffs) ? handoff.npcHandoffs : [];
    const intimacyNpc = npcs.find(npc => npc?.IntimacyBoundary && npc.IntimacyBoundary !== 'SKIP');
    if (intimacyNpc) return intimacyNpc;
    const actionTarget = firstNamedTarget(resolution?.ActionTargets);
    if (actionTarget) {
        const match = npcs.find(npc => namesEqual(npc?.NPC, actionTarget));
        if (match) return match;
    }
    return npcs[0];
}

function firstNamedTarget(value) {
    const items = Array.isArray(value) ? value : [value];
    return items.map(item => String(item ?? '').trim()).find(item => item && !isNoneText(item)) || '';
}

function namesEqual(a, b) {
    return String(a ?? '').trim().toLowerCase() === String(b ?? '').trim().toLowerCase();
}

function intimacyBoundarySourceText(source) {
    const text = String(source ?? 'NONE');
    if (text === 'ESTABLISHED_RELATIONSHIP') return 'an established relationship exists';
    if (text === 'NPC_INITIATED') return 'the NPC initiated or invited this intimacy and {{user}} is accepting';
    if (text === 'PERSISTED' || text === 'PERSISTED_ALLOW' || text.startsWith('PERSISTED:')) return 'intimacy permission was already established and no new boundary change revoked it';
    if (text === 'PERSISTED_DENY') return 'a prior intimacy boundary remains active';
    if (text === 'OVERRIDE:CurrentInvitation') return 'the NPC clearly offered, requested, invited, strongly implied, or physically initiated this intimacy in the current or immediately recent scene';
    if (text.startsWith('OVERRIDE:')) return `the NPC has the ${text.slice('OVERRIDE:'.length)} override`;
    return 'the intimacy boundary allows it';
}

function intimacyRefusalGuide(npc) {
    switch (npc?.IntimacyRefusalStyle) {
        case 'PANIC':
            return 'panicked, urgent, self-protective, or fleeing.';
        case 'FEARFUL':
            return 'fearful, avoidant, guarded, or withdrawn.';
        case 'HOSTILE':
            return 'firm, angry, suspicious, contemptuous, or openly resistant.';
        case 'SOFT':
            return 'softly, awkwardly, playfully, gently, or affectionately without anger when possible.';
        case 'CLEAR':
            return 'clear, direct, practical, or reserved.';
        default:
            return 'appropriate to the NPC disposition.';
    }
}

function namePoolText(pool = {}) {
    return `Male: ${list(pool.male)}; Female: ${list(pool.female)}; Location: ${list(pool.location)}`;
}

function humanizeImpairmentFunctions(value) {
    const text = String(value ?? '').trim();
    if (!text || isNoneText(text)) return '(none)';
    const labels = {
        lower_body: 'lower body',
        upper_body: 'upper body',
        whole_body: 'whole body',
        physical_exertion: 'physical exertion',
        mobility: 'mobility',
        balance: 'balance',
        stamina: 'stamina',
        focus: 'focus',
        grip: 'grip',
        torso: 'torso',
        breath: 'breathing',
        head: 'head',
        vision: 'vision',
        aim: 'aim',
        combat: 'combat',
        hearing: 'hearing',
        speech: 'speech',
        systemic: 'overall body condition',
    };
    return text.split(',')
        .map(item => item.trim())
        .filter(Boolean)
        .map(item => labels[item] || item.replace(/_/g, ' '))
        .join(', ') || '(none)';
}

function naturalOutcomeSummary(resolution) {
    const tier = String(resolution?.OutcomeTier ?? 'NONE');
    const outcome = String(resolution?.Outcome ?? 'no_roll');
    const fatalInjury = Array.isArray(resolution?.InflictedInjuries)
        ? resolution.InflictedInjuries.find(injury => injury?.condition === 'dead')
        : null;
    if (fatalInjury) {
        return fatalInjury.FatalityTrigger === 'nat20_critical_success'
            ? 'an exceptional user-favoring fatal result: natural 20 plus Critical Success kills the target'
            : 'a user-favoring fatal finish against an already badly wounded or critical target';
    }
    if (resolution?.RollNeeded === 'N' || tier === 'NONE' || outcome === 'no_roll') return 'no roll; ordinary scene continuity';
    if (outcome === 'dominant_impact') return 'a decisive user-favoring result with strong visible impact';
    if (outcome === 'solid_impact') return 'a clear user-favoring result with solid visible impact';
    if (outcome === 'light_impact') return 'a narrow user-favoring result with limited visible impact';
    if (outcome === 'success') return 'a user-favoring result';
    if (outcome === 'struggle') return 'a contested struggle with no clear winner';
    if (outcome === 'checked') return 'a slight opposing check against the user action';
    if (outcome === 'deflected') return 'a clear opposing defense against the user action';
    if (outcome === 'avoided') return 'a decisive opposing avoidance or reversal against the user action';
    if (outcome === 'failure') return 'an opposing result where the user action does not succeed';
    return 'the computed outcome, expressed only as natural scene prose';
}

function toComparableSet(value) {
    const items = Array.isArray(value) ? value : [value];
    return new Set(items
        .map(item => String(item ?? '').trim())
        .filter(item => !isNoneText(item))
        .map(item => item.toLowerCase()));
}

function formatProactivityForNarration(proactivity) {
    const formatted = {};
    for (const [name, value] of Object.entries(proactivity ?? {})) {
        formatted[name] = {
            Proactive: value?.Proactive ?? 'N',
            Intent: value?.Intent ?? 'NONE',
            Impulse: value?.Impulse ?? 'NONE',
            ProactivityTarget: value?.ProactivityTarget ?? '(none)',
            ProactivityTier: value?.ProactivityTier,
            ProactivityDie: value?.ProactivityDie,
            Threshold: value?.Threshold,
            RomanceInitiative: value?.RomanceInitiative ?? 'N',
            RomanceInitiativeTag: value?.RomanceInitiativeTag ?? '(none)',
            RomanceInitiativeDie: value?.RomanceInitiativeDie,
            RomanceInitiativeContext: value?.RomanceInitiativeContext ?? '(none)',
            PartnerInitiative: value?.PartnerInitiative ?? 'N',
            PartnerInitiativeTag: value?.PartnerInitiativeTag ?? '(none)',
            PartnerInitiativeDie: value?.PartnerInitiativeDie,
            PartnerInitiativeContext: value?.PartnerInitiativeContext ?? '(none)',
            CompanionInitiative: value?.CompanionInitiative ?? 'N',
            CompanionInitiativeTag: value?.CompanionInitiativeTag ?? '(none)',
            CompanionInitiativeDie: value?.CompanionInitiativeDie,
            CompanionInitiativeContext: value?.CompanionInitiativeContext ?? '(none)',
            CompanionCrisisDire: value?.CompanionCrisisDire ?? 'N',
        };
    }
    return formatted;
}

function proactivityAggressionAudit(value, aggressionResult) {
    if (!isAggressionRollApplicableProactivity(value)) return '';
    return aggressionResult ? 'triggersAggressionRoll:Y' : '';
}

function isAggressionRollApplicableProactivity(value) {
    if (!value || value.Proactive !== 'Y') return false;
    if (value.RomanceInitiativeTag === 'Companion_Attack' || value.PartnerInitiativeTag === 'Companion_Attack' || value.CompanionInitiativeTag === 'Companion_Attack') return true;
    return ['ESCALATE_VIOLENCE', 'BOUNDARY_PHYSICAL', 'THREAT_OR_POSTURE'].includes(value.Intent);
}

function proactivityNarrationIntent(value) {
    return value?.CompanionInitiative === 'Y'
        ? value.CompanionInitiativeTag
        : value?.PartnerInitiative === 'Y'
        ? value.PartnerInitiativeTag
        : value?.RomanceInitiative === 'Y'
        ? value.RomanceInitiativeTag
        : value?.Intent;
}

function personalizeNpcInstruction(name, text) {
    const npc = valueOrNone(name);
    const prose = String(text ?? '').trim();
    if (!prose) return `${npc} takes a proactive scene beat.`;
    return prose.replace(/^NPC\b/, npc);
}

function proactivityIntentDescription(intent, target = '{{user}}') {
    switch (intent) {
        case 'ESCALATE_VIOLENCE':
            return `NPC initiates immediate violent action toward ${target}.`;
        case 'BOUNDARY_PHYSICAL':
            return 'NPC physically asserts distance, blocks further contact, protects their body or space, pushes away, raises a guard, steps out of reach, or otherwise creates a clear physical boundary.';
        case 'THREAT_OR_POSTURE':
            return 'NPC signals hostile readiness, warning, intimidation, or threat without a resolved strike.';
        case 'CALL_HELP_OR_AUTHORITY':
            return 'NPC seeks help, backup, witnesses, guards, allies, or authority.';
        case 'WITHDRAW_OR_BOUNDARY':
            return 'NPC retreats, disengages, refuses, or sets a clear verbal or physical limit.';
        case 'SUPPORT_ACT':
            return 'NPC helps or advances a shared practical aim according to the current scene through concrete action, information, positioning, resources, timing, or access.';
        case 'PLAN_OR_BANTER':
            return 'NPC responds with planning, practical talk, comment, banter, or scene-advancing dialogue.';
        case 'INTIMACY_OR_FLIRT':
            return 'NPC shows intimacy or flirtation only when it fits the current relationship, context, privacy, mood, and boundaries.';
        case 'Romantic_Nervous':
            return 'NPC shows romantic nervousness around {{user}}.';
        case 'Romantic_Flirt':
            return 'NPC is flirtatious toward {{user}}.';
        case 'Romantic_Attention':
            return 'NPC gives {{user}} focused romantic attention through closeness, careful notice, lingering presence, or a personal gesture without forcing a confession, date, or intimacy.';
        case 'Thoughtful_Gift':
            return 'NPC offers or prepares a small thoughtful gift for {{user}} only as its own calm beat, chosen in a way that fits the NPC, setting, and current relationship.';
        case 'Ask_Date':
            return 'NPC asks or maneuvers toward a non-intimate romantic date with {{user}} only as its own calm beat, using a believable public or ordinary plan. Do not frame this as secluded sexual privacy, an inn room, bed, undressing, or physical intimacy.';
        case 'Date_And_Confess':
            return 'NPC seeks to invite {{user}} to a very special date/confession only as its own calm beat, making a clear relationship-oriented confession or request without forcing intimacy.';
        case 'Partner_Flirt':
            return 'NPC flirts with {{user}} in a natural established-partner way, keeping it light, contextual, and scene-compatible.';
        case 'Partner_Tease':
            return 'NPC teases or flirts with {{user}} in a comfortable established-partner way without derailing urgent danger or serious stakes.';
        case 'Partner_Date':
            return 'NPC suggests or plans a specific partner date with {{user}} only as its own calm beat, a shared activity that fits the setting, current safety, and the relationship.';
        case 'Partner_Gift':
            return 'NPC offers, finds, prepares, or points out a small cute or thoughtful thing {{user}} might like only as its own calm beat, chosen to fit the NPC, setting, and relationship.';
        case 'Partner_Intimacy':
            return 'NPC initiates romantic or sexual closeness with {{user}} only when privacy, safety, mood, and relationship all support it; do not force explicit intimacy in public, danger, crisis, combat, or implausible circumstances.';
        case 'Partner_Conflict':
            return 'NPC raises an established-partner worry, concern, jealousy, disagreement, or vulnerable tension only as its own calm beat when context supports a real relationship conversation.';
        case 'Companion_Warn':
            return 'NPC warns {{user}} about immediate danger, calls out a threat, gives urgent tactical advice, or alerts others without directly attacking.';
        case 'Companion_Assist':
            return 'NPC gives {{user}} tactical help under immediate pressure without directly attacking: call timing or openings, pass or kick useful gear into reach, create a distraction, disrupt terrain, reinforce a ward, clear space, shift cover, expose an escape line, or otherwise improve {{user}}\'s position.';
        case 'Companion_Cover':
            return 'NPC covers, shields, intercepts, blocks, pulls clear, buys time, or otherwise protects {{user}} from immediate danger without directly attacking.';
        case 'Companion_Attack':
            return `NPC attacks or directly fights the valid hostile target ${target} while acting as {{user}}'s close companion or partner; narrate the attack only according to the listed Aggression result.`;
        case 'Companion_Retreat':
            return 'NPC tries to retreat, pull back, escape, or get out of danger because the situation is dire; if the NPC is deeply bonded or a partner, show strong hesitation, conflict, reluctance, guilt, or an attempt to stay connected while retreating.';
        default:
            return 'NPC takes a proactive scene beat consistent with the listed intent and impulse.';
    }
}

function isAggressiveProactivityIntent(intent) {
    return ['ESCALATE_VIOLENCE', 'BOUNDARY_PHYSICAL', 'THREAT_OR_POSTURE', 'Companion_Attack'].includes(intent);
}

function isRomanceInitiativeIntent(intent) {
    return ['Romantic_Nervous', 'Romantic_Flirt', 'Romantic_Attention', 'Thoughtful_Gift', 'Ask_Date', 'Date_And_Confess'].includes(intent);
}

function isPartnerInitiativeIntent(intent) {
    return ['Partner_Flirt', 'Partner_Tease', 'Partner_Date', 'Partner_Gift', 'Partner_Intimacy', 'Partner_Conflict'].includes(intent);
}

function isCompanionInitiativeIntent(intent) {
    return ['Companion_Warn', 'Companion_Assist', 'Companion_Cover', 'Companion_Attack', 'Companion_Retreat'].includes(intent);
}

function isCompanionSupportIntent(intent) {
    return ['Companion_Warn', 'Companion_Assist', 'Companion_Cover'].includes(intent);
}

function narratorTargetText(value) {
    const text = valueOrNone(value);
    return isUserReferenceText(text) ? '{{user}}' : narratorUserMacroText(text);
}

function narratorUserMacroText(value) {
    const macro = '__ST_ENGINE_USER_MACRO__';
    return valueOrNone(value)
        .replace(/\{\{user\}\}/g, macro)
        .replace(/\bthe user's\b/gi, "{{user}}'s")
        .replace(/\buser's\b/gi, "{{user}}'s")
        .replace(/\bsaved user gear\/inventory\b/gi, 'saved gear/inventory for {{user}}')
        .replace(/\buser gear\/inventory\b/gi, 'gear/inventory for {{user}}')
        .replace(/\bknown user abilities\b/gi, 'known abilities for {{user}}')
        .replace(/\buser abilities\b/gi, 'abilities for {{user}}')
        .replace(/\buser action\b/gi, "{{user}}'s action")
        .replace(/\buser input\b/gi, 'latest input')
        .replace(/\bthe user\b/gi, '{{user}}')
        .replace(/\buser\b/gi, '{{user}}')
        .replace(new RegExp(macro, 'g'), '{{user}}');
}

function isUserReferenceText(value) {
    const text = String(value ?? '').trim().toLowerCase();
    return !text
        || text === '{{user}}'
        || text === 'user'
        || text === 'the user'
        || text === 'player'
        || text === 'the player'
        || text === 'protagonist'
        || text === 'the protagonist'
        || text === 'you';
}

function aggressionStyleFromStat(stat) {
    return stat === 'MND' ? 'magical/mental/supernatural' : 'physical';
}

function inline(value) {
    return JSON.stringify(value ?? {});
}

function valueOrNone(value) {
    const text = String(value ?? '').trim();
    return text || '(none)';
}

function coreLine(core) {
    if (!core) return '{}';
    return inline({
        Rank: core.Rank ?? 'none',
        MainStat: core.MainStat ?? 'none',
        PHY: core.PHY ?? 1,
        MND: core.MND ?? 1,
        CHA: core.CHA ?? 1,
    });
}

function list(value) {
    return Array.isArray(value) ? value.join(',') : String(value ?? 'none');
}

function actionUnitsSummary(units = [], options = {}) {
    const items = Array.isArray(units) ? units : [];
    if (!items.length) return 'none';
    return items.map((unit, index) => {
        const id = valueOrNone(unit?.id || `A${index + 1}`);
        const action = valueOrNone(unit?.action);
        const evidence = valueOrNone(unit?.evidence);
        return options.includeEvidence && !isNoneText(evidence)
            ? `${id}: ${action} | evidence="${evidence}"`
            : `${id}: ${action}`;
    }).join('; ');
}

function isNoneText(value) {
    const text = String(value ?? '').trim().toLowerCase();
    return !text || text === 'none' || text === '(none)' || text === 'null';
}
