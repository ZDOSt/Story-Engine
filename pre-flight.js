import { normalizeWorldState, summarizeWorldStateForNarration } from './world-state.js';
import { renderEconomyAndValueLens } from './economy.js';

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
    const latentGrievances = Array.isArray(ledger?.powerActorEnmity?.latentGrievances) ? ledger.powerActorEnmity.latentGrievances : [];
    const affiliationLinks = Array.isArray(ledger?.powerActorEnmity?.affiliationLinks) ? ledger.powerActorEnmity.affiliationLinks : [];
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
        'userAbilityUse=' + userAbilityUseSummary(resolution.userAbilityUse),
        'itemUse=' + itemUseSummary(resolution.itemUse),
        'lootSearch=' + inline(resolution.lootSearch ?? {}),
        'claimCheck=' + claimCheckSummary(resolution.claimCheck),
        'userKnowledgeApplication=' + userKnowledgeApplicationSummary(userKnowledgeApplications),
        'identifyTargets:',
        'hostilesInScene.NPC=' + list(targets.hostilesInScene?.NPC),
        'ActionTargets=' + list(targets.ActionTargets),
        'OppTargets.NPC=' + list(oppTargets.NPC),
        'OppTargets.ENV=' + list(oppTargets.ENV),
        'BenefitedObservers=' + list(targets.BenefitedObservers),
        'HarmedObservers=' + list(targets.HarmedObservers),
        'NPCAwareOfUser=' + list(targets.NPCAwareOfUser),
        'PowerActors=' + list(targets.PowerActors),
        'intimacyAdvanceExplicit=' + String(Boolean(resolution.intimacyAdvanceExplicit)),
        'restraintControl=' + boundaryObjectSummary(resolution.restraintControl),
        'boundaryPressure=' + boundaryObjectSummary(resolution.boundaryPressure),
        'boundaryBreak=' + boundaryObjectSummary(resolution.boundaryBreak),
        'rollNeeded=' + String(Boolean(resolution.rollNeeded)),
        'rollReason=' + valueOrNone(resolution.rollReason),
        'challengeType=' + valueOrNone(resolution.challengeType),
        'challengeTypeEvidence=' + valueOrNone(resolution.challengeTypeEvidence),
        'socialTactic=' + valueOrNone(resolution.socialTactic),
        'derivedActionsFromActionUnits=' + list(resolution.actionCount),
        'actionUnits=' + actionUnitsSummary(resolution.actionUnits, { includeEvidence: true }),
        'environmentDifficultyTier=' + valueOrNone(resolution.environmentDifficultyTier),
        'environmentDifficultyBonus=' + valueOrNone(resolution.environmentDifficulty),
        'activeHostileThreat=' + String(Boolean(resolution.activeHostileThreat)),
        'genStats=' + generatedStatsSeedLine(resolution.genStats),
        '',
        'RelationshipEngine:',
        relationships.length ? '' : 'none',
        ...relationships.flatMap((item, index) => [
            `NPC[${index}]=${valueOrNone(item.NPC)}`,
            `explicitIntimidationOrCoercion=${Boolean(item.explicitIntimidationOrCoercion)}`,
            `stakeChangeByOutcome=${inline(item.stakeChangeByOutcome ?? {})}`,
            `overrideFlags=${inline(item.overrideFlags ?? {})}`,
            `genStats=${generatedStatsSeedLine(item.genStats)}`,
            '',
        ]),
        '',
        'chaosSemantic.sceneSummary=' + valueOrNone(chaos.sceneSummary),
        'trackerUpdateEngine=' + inline(tracker),
        'powerActorEnmity.assessments=' + (powerActorAssessments.length ? inline(powerActorAssessments) : 'none'),
        'powerActorEnmity.effects=' + (powerActors.length ? inline(powerActors) : 'none'),
        'powerActorEnmity.latentGrievances=' + (latentGrievances.length ? inline(latentGrievances) : 'none'),
        'powerActorEnmity.affiliationLinks=' + (affiliationLinks.length ? inline(affiliationLinks) : 'none'),
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
        'resolutionPacket.LootSearch=' + inline(resolution.LootSearch ?? {}),
        'resolutionPacket.LootDiscovery=' + inline(resolution.LootDiscovery ?? {}),
        'resolutionPacket.ClaimCheck=' + claimCheckSummary(resolution.ClaimCheck),
        'resolutionPacket.intimacyAdvanceExplicit=' + valueOrNone(resolution.intimacyAdvanceExplicit),
        'resolutionPacket.restraintControl=' + boundaryObjectSummary(resolution.restraintControl),
        'resolutionPacket.boundaryPressure=' + boundaryObjectSummary(resolution.boundaryPressure),
        'resolutionPacket.boundaryBreak=' + boundaryObjectSummary(resolution.boundaryBreak),
        'resolutionPacket.BoundaryGate=' + inline(resolution.BoundaryGate ?? {}),
        'resolutionPacket.harmMode=' + valueOrNone(resolution.harmMode),
        'resolutionPacket.RollNeeded=' + valueOrNone(resolution.RollNeeded),
        'resolutionPacket.RollReason=' + valueOrNone(resolution.RollReason),
        'resolutionPacket.challengeType=' + valueOrNone(resolution.challengeType),
        'resolutionPacket.challengeTypeEvidence=' + valueOrNone(resolution.challengeTypeEvidence),
        'resolutionPacket.socialTactic=' + valueOrNone(resolution.socialTactic),
        'resolutionPacket.ResolvedStats=' + inline(resolution.ResolvedStats ?? {}),
        'resolutionPacket.actions=' + list(resolution.actions),
        'resolutionPacket.actionUnits=' + actionUnitsSummary(resolution.actionUnits, { includeEvidence: true }),
        'resolutionPacket.OutcomeTier=' + valueOrNone(resolution.OutcomeTier),
        'resolutionPacket.Outcome=' + valueOrNone(resolution.Outcome),
        'resolutionPacket.LandedActions=' + valueOrNone(resolution.LandedActions),
        'resolutionPacket.CounterPotential=' + valueOrNone(resolution.CounterPotential),
        'resolutionPacket.activeHostileThreat=' + valueOrNone(resolution.activeHostileThreat),
        'resolutionPacket.UserImpairment=' + inline(resolution.UserImpairment ?? {}),
        'resolutionPacket.NPCImpairment=' + inline(resolution.NPCImpairment ?? {}),
        'resolutionPacket.EquipmentDefense=' + inline(resolution.EquipmentDefense ?? {}),
        'resolutionPacket.hostilesInScene.NPC=' + list(resolution.hostilesInScene?.NPC),
        'resolutionPacket.ActionTargets=' + list(resolution.ActionTargets),
        'resolutionPacket.OppTargets.NPC=' + list(resolution.OppTargets?.NPC),
        'resolutionPacket.OppTargets.ENV=' + list(resolution.OppTargets?.ENV),
        'resolutionPacket.EnvironmentDifficulty=' + environmentDifficultySummary(resolution),
        'resolutionPacket.BenefitedObservers=' + list(resolution.BenefitedObservers),
        'resolutionPacket.HarmedObservers=' + list(resolution.HarmedObservers),
        'resolutionPacket.NPCAwareOfUser=' + list(resolution.NPCAwareOfUser),
        'resolutionPacket.NPCInScene=' + list(resolution.NPCInScene),
        'generatedNpcStats=' + (handoff?.generatedNpcStats?.length ? inline(handoff.generatedNpcStats) : 'none'),
        'npcEquipmentProfiles=' + (handoff?.npcEquipmentProfiles?.length ? inline(handoff.npcEquipmentProfiles) : 'none'),
        'resultLine=' + valueOrNone(handoff?.resultLine),
        '',
        'npcHandoffs=' + (npcs.length ? '' : 'none'),
        ...npcs.flatMap((npc, index) => [
            `npcHandoffs[${index}].NPC=${valueOrNone(npc.NPC)}`,
            `npcHandoffs[${index}].FinalState=${valueOrNone(npc.FinalState)}`,
            `npcHandoffs[${index}].InitPreset=${valueOrNone(npc.InitPreset)}`,
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
        ...formatMechanicsResultList(summary, resolution, handoff, ledger, report),
        '',
        '==NARRATOR_MODEL_HANDOFF==',
        'This is the exact narrator-facing handoff delivered to the narrator model as a native depth-0 prompt for this response.',
        '',
        narratorModelHandoff,
    ];

    return lines.join('\n');
}

function formatMechanicsResultList(summary, resolution, handoff = {}, ledger = {}, report = {}) {
    const aggressionEntries = formatAggressionMechanicsEntries(handoff?.aggressionResults ?? {});
    const latentCandidates = Array.isArray(ledger?.powerActorEnmity?.latentGrievances) ? ledger.powerActorEnmity.latentGrievances : [];
    const affiliationLinks = Array.isArray(ledger?.powerActorEnmity?.affiliationLinks) ? ledger.powerActorEnmity.affiliationLinks : [];
    const latentBefore = Array.isArray(report?.latentGrievances?.before) ? report.latentGrievances.before : [];
    const latentAfter = Array.isArray(report?.latentGrievances?.after) ? report.latentGrievances.after : [];
    return [
        ['userAction', summary.userAction],
        ['resolution.GOAL', valueOrNone(resolution.GOAL)],
        ['resolution.UserAbilityUse', userAbilityUseSummary(resolution.UserAbilityUse)],
        ['resolution.ItemUse', itemUseSummary(resolution.ItemUse)],
        ['resolution.LootSearch', inline(resolution.LootSearch ?? {})],
        ['resolution.LootDiscovery', inline(resolution.LootDiscovery ?? {})],
        ['resolution.ClaimCheck', claimCheckSummary(resolution.ClaimCheck)],
        ['userKnowledge.application', summary.userKnowledgeApplication],
        ['resolution.RollNeeded', valueOrNone(resolution.RollNeeded)],
        ['resolution.RollReason', valueOrNone(resolution.RollReason)],
        ['resolution.challengeType', valueOrNone(resolution.challengeType)],
        ['resolution.challengeTypeEvidence', valueOrNone(resolution.challengeTypeEvidence)],
        ['resolution.socialTactic', valueOrNone(resolution.socialTactic)],
        ['resolution.ResolvedStats', inline(resolution.ResolvedStats ?? {})],
        ['resolution.EnvironmentDifficulty', summary.environmentDifficulty],
        ['resolution.actions', summary.actionCount],
        ['resolution.actionUnits', actionUnitsSummary(resolution.actionUnits, { includeEvidence: true })],
        ['resolution.rollFull', summary.rollFull],
        ['resolution.harmMode', valueOrNone(resolution.harmMode)],
        ['resolution.outcome', summary.outcome],
        ['resolution.outcomeMeaning', summary.result],
        ['resolution.landedActions', summary.landedActions],
        ['resolution.intimacyAdvanceExplicit', valueOrNone(resolution.intimacyAdvanceExplicit)],
        ['intimacy.boundary', summary.intimacyBoundary],
        ['resolution.restraintControl', boundaryObjectSummary(resolution.restraintControl)],
        ['resolution.boundaryPressure', boundaryObjectSummary(resolution.boundaryPressure)],
        ['resolution.boundaryBreak', boundaryObjectSummary(resolution.boundaryBreak)],
        ['resolution.BoundaryGate', inline(resolution.BoundaryGate ?? {})],
        ['resolution.counterPotential', summary.counter],
        ['resolution.targets', summary.targets],
        ['resolution.NPCAwareOfUser', list(resolution.NPCAwareOfUser)],
        ['resolution.activeHostileThreat', valueOrNone(resolution.activeHostileThreat)],
        ['impairment.user', summary.userImpairment],
        ['impairment.npc', summary.npcImpairment],
        ['equipmentDefense.target', inline(resolution.EquipmentDefense ?? {})],
        ['injury.inflictedNpc', summary.inflictedNpcInjury],
        ['injury.inflictedUser', summary.inflictedUserInjury],
        ['npc.state', summary.npc],
        ['npc.generatedStats', handoff?.generatedNpcStats?.length ? inline(handoff.generatedNpcStats) : 'none'],
        ['npc.equipmentProfiles', handoff?.npcEquipmentProfiles?.length ? inline(handoff.npcEquipmentProfiles) : 'none'],
        ['relationship.result', summary.relationshipResult],
        ['chaos.result', summary.chaos],
        ['proactivity.result', summary.proactive],
        ['aggression.result', summary.aggression],
        ['powerActor.assessment', summary.powerActorAssessment],
        ['powerActor.enmityEffect', summary.powerActorEnmityEffect],
        ['powerActor.latentCandidates', latentCandidates.length ? inline(latentCandidates) : 'none'],
        ['powerActor.affiliationLinks', affiliationLinks.length ? inline(affiliationLinks) : 'none'],
        ['powerActor.latentStateBefore', latentBefore.length ? inline(latentBefore) : 'none'],
        ['powerActor.latentStateAfter', latentAfter.length ? inline(latentAfter) : 'none'],
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
            equipmentDefense: value.TargetEquipmentDefense,
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
            equipmentDefense: value.TargetEquipmentDefense,
        })]);
        entries.push([`aggression.result.${name}`, inline(value)]);
    }
    return entries;
}

function buildAggressionRollLine({ npc, attackType, attackStat, defenseStat, attackDie, defenseDie, attackTotal, defenseTotal, margin, outcome, counterBonus, npcImpairment, targetImpairment, equipmentDefense }) {
    const attackDieText = Number.isFinite(Number(attackDie)) ? Number(attackDie) : '?';
    const defenseDieText = Number.isFinite(Number(defenseDie)) ? Number(defenseDie) : '?';
    const attackTotalText = Number.isFinite(Number(attackTotal)) ? Number(attackTotal) : '?';
    const defenseTotalText = Number.isFinite(Number(defenseTotal)) ? Number(defenseTotal) : '?';
    const attackImpairText = Number(npcImpairment?.AppliedToRoll === 'Y' ? npcImpairment.RollPenalty : 0);
    const targetImpairText = Number(targetImpairment?.AppliedToRoll === 'Y' ? targetImpairment.RollPenalty : 0);
    const attackBonusText = Number(counterBonus || 0);
    const equipmentBonusText = Number(equipmentDefense?.AppliedToRoll === 'Y' ? equipmentDefense.Bonus : 0);
    const attackImpairSuffix = attackImpairText ? `+impairment(${attackImpairText})` : '';
    const defenseImpairSuffix = targetImpairText ? `+impairment(${targetImpairText})` : '';
    const equipmentDefenseSuffix = equipmentBonusText ? `+equipment(${valueOrNone(equipmentDefense?.Tier)}:${equipmentBonusText})` : '';
    const attackStatValue = valueOrNone(attackStat);
    const defenseStatValue = valueOrNone(defenseStat);
    return `${npc || '(unknown)'} ${valueOrNone(attackType)}: 1d20(${attackDieText}) + ${attackStatValue} + bonus(${attackBonusText})${attackImpairSuffix} = ${attackTotalText} vs 1d20(${defenseDieText}) + ${defenseStatValue}${defenseImpairSuffix}${equipmentDefenseSuffix} = ${defenseTotalText} (${valueOrNone(margin)} - ${valueOrNone(outcome)})`;
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
        'The narrator-facing intro prompt is appended as a synthetic in-chat message for the adventure opening.',
        '',
        '==NARRATOR_MODEL_HANDOFF==',
        narratorModelHandoff,
    ].join('\n');
}

export function formatAdventureIntroNarratorModelPromptContext(adventurePrompt = '', options = {}) {
    const prompt = valueOrNone(adventurePrompt);
    const isekaiOpeningSeed = renderIsekaiOpeningSeed(options?.isekaiOpeningSeed);
    const isIsekaiOpening = Boolean(isekaiOpeningSeed) || isIsekaiGenre(options?.adventureGenre) || promptLooksIsekai(prompt);
    const genreLabel = formatAdventureIntroGenreLabel(options?.adventureGenre);
    const promptHeaderGenre = isIsekaiOpening ? 'ISEKAI' : genreLabel ? genreLabel.toUpperCase() : '';
    const nameReveal = options?.nameGeneration?.namePool ? narrativeNameRevealFact(options.nameGeneration) : '';
    const lines = [
        promptHeaderGenre ? `START_ADVENTURE_PROMPT: ${promptHeaderGenre}` : 'START_ADVENTURE_PROMPT:',
        isIsekaiOpening
            ? 'This is the opening turn of a new isekai adventure.'
            : genreLabel
                ? `This is the opening turn of a new ${genreLabel} adventure.`
                : 'This is the opening turn of a new adventure.',
    ];
    if (isekaiOpeningSeed) lines.push('', isekaiOpeningSeed);
    if (isekaiOpeningSeed) {
        if (nameReveal) lines.push('', 'NAME REVEAL:', nameReveal);
        lines.push('', prompt);
    } else if (nameReveal) {
        lines.push('', ...insertAdventureIntroNameReveal(prompt, nameReveal));
    } else {
        lines.push('', prompt);
    }
    return lines.join('\n');
}

function formatAdventureIntroGenreLabel(value) {
    const genre = String(value || '').trim();
    return genre && !isNoneText(genre) ? genre : '';
}

function insertAdventureIntroNameReveal(prompt = '', nameReveal = '') {
    const promptText = valueOrNone(prompt);
    const marker = 'START ADVENTURE REMINDER:';
    const index = promptText.indexOf(marker);
    const nameRevealBlock = ['NAME REVEAL:', nameReveal].join('\n');
    if (index < 0) return [nameRevealBlock, '', promptText];
    const before = promptText.slice(0, index).trimEnd();
    const after = promptText.slice(index).trimStart();
    return before ? [before, '', nameRevealBlock, '', after] : [nameRevealBlock, '', after];
}

const ISEKAI_EARTH_TRANSITIONS = Object.freeze([
    {
        key: 'traffic_rescue_accident',
        label: 'Traffic Fatality / Rescue Accident',
        guidance: 'Use a brief Earth-side final moment involving sudden traffic danger, collision, or an attempted rescue. Keep it compact and avoid making the vehicle itself the point of the scene.',
    },
    {
        key: 'public_disaster',
        label: 'Public Disaster',
        guidance: 'Use a sudden public catastrophe such as a collapse, crash, fire, flood, quake, or crowded emergency. The disaster should be immediate pressure, not a long disaster story.',
    },
    {
        key: 'medical_death',
        label: 'Medical Death',
        guidance: 'Use illness, receiving surgery or medical care, a hospital crisis, sudden collapse, or a final medical moment. Treat {{user}} as the patient, never as the medical professional performing the procedure. Keep the Earth side restrained and move quickly to the crossing.',
    },
    {
        key: 'violent_death',
        label: 'Violent Death',
        guidance: 'Use murder, robbery, attack, shooting, stabbing, or another direct act of violence. Do not linger on gore; use it as the transfer trigger.',
    },
    {
        key: 'heroic_sacrifice',
        label: 'Heroic Sacrifice',
        guidance: 'Use a final moment where the character protects, rescues, shields, or trades their safety for someone else. Keep the sacrifice clear but brief.',
    },
    {
        key: 'overwork_collapse',
        label: 'Overwork / Burnout Collapse',
        guidance: 'Use exhaustion, office collapse, study pressure, marathon gaming, or sleep deprivation as the final Earth-side pressure.',
        ageVariants: {
            school_age: {
                label: 'Study / Exhaustion Collapse',
                guidance: 'Use schoolwork, exam pressure, late-night studying, marathon gaming, or sleep deprivation as the final Earth-side pressure. Keep {{user}} out of workplaces and adult professional roles.',
            },
            adult_context: {
                label: 'Work / Exhaustion Collapse',
                guidance: 'Use workplace exhaustion, an office collapse, a punishing shift, adult study pressure, marathon gaming, or sleep deprivation as the final Earth-side pressure. Do not place {{user}} in a high-school classroom or high-school student role.',
            },
            unknown: {
                label: 'Exhaustion / Sleep-Deprivation Collapse',
                guidance: 'Use exhaustion, marathon gaming, or sleep deprivation without assigning {{user}} a school or workplace role.',
            },
        },
    },
    {
        key: 'domestic_accident',
        label: 'Accidental Death at Home',
        guidance: 'Use a grounded home accident such as a fall, electrical fault, gas leak, bath incident, or appliance mishap. Keep it short and avoid slapstick unless the tone supports it.',
    },
    {
        key: 'game_vr_entrapment',
        label: 'Gaming / VR Entrapment',
        guidance: 'Use a game, MMO, VR capsule, login failure, server event, or avatar boundary failure. If {{user}} has a premade character, that character may be the avatar that becomes real.',
        requiredOpeningTags: ['game'],
    },
    {
        key: 'digital_system_anomaly',
        label: 'Digital / System Glitch',
        guidance: 'Use a phone, computer, mysterious app, corrupted menu, system prompt, or impossible software event as the crossing trigger.',
        requiredOpeningTags: ['game', 'system'],
    },
    {
        key: 'summoned_from_earth',
        label: 'Summoning From Earth',
        guidance: 'Use a magic circle, ritual pull, classroom light, office interruption, or unseen summoning force that removes the character from Earth.',
        requiredOpeningTags: ['summon'],
        ageVariants: {
            school_age: {
                label: 'Classroom / School Summoning',
                guidance: 'Use a magic circle, classroom light, school corridor, club room, school trip, or unseen summoning force that removes {{user}} from an ordinary student context on Earth. Do not place {{user}} at work or in an adult professional role.',
            },
            adult_context: {
                guidance: 'Use a magic circle, ritual pull, workplace interruption, home, street, transit, or unseen summoning force that removes {{user}} from Earth. Do not place {{user}} in a high-school classroom or high-school student role.',
            },
            unknown: {
                guidance: 'Use a magic circle, ritual pull, public place, home, transit, or unseen summoning force that removes {{user}} from Earth without assigning a school or workplace role.',
            },
        },
    },
    {
        key: 'portal_rift_incident',
        label: 'Portal / Rift Incident',
        guidance: 'Use a door, mirror, elevator, alley, shrine gate, storm, tunnel, train station, or spatial tear as the Earth-side crossing.',
    },
    {
        key: 'dream_coma_crossing',
        label: 'Dream / Coma Crossing',
        guidance: 'Use sleep, coma, lucid dream, fever vision, or a dream that becomes physically real. Do not over-explain whether it is dream or reality.',
    },
    {
        key: 'unexplained_blackout',
        label: 'Unexplained Death / Blackout',
        guidance: 'Use a sudden blackout, vanishing heartbeat, ordinary moment cutting off, unexplained collapse, or abrupt loss of Earth-side continuity. Keep the cause unresolved unless already established.',
    },
    {
        key: 'mistaken_summons',
        label: 'Mistaken Summons',
        guidance: 'Use a wrong target, wrong ritual, wrong world, ritual error, or summons meant for someone else. Keep the Earth-side moment focused on being pulled away, not on a divine audience.',
        requiredOpeningTags: ['summon'],
    },
    {
        key: 'group_transfer',
        label: 'Class / Group Transfer',
        guidance: 'Use classmates, coworkers, passengers, a party, a convention crowd, or strangers pulled at the same time. The group can be nearby, separated, or only partly visible.',
        requiredOpeningTags: ['group'],
        ageVariants: {
            school_age: {
                label: 'Class / School Group Transfer',
                guidance: 'Use classmates, a school club, a school trip, or another student group pulled from Earth at the same time. The group can be nearby, separated, or only partly visible. Do not use coworkers or an adult workplace.',
            },
            adult_context: {
                label: 'Adult Group Transfer',
                guidance: 'Use coworkers, passengers, a party, a convention crowd, or adult strangers pulled from Earth at the same time. The group can be nearby, separated, or only partly visible. Do not use a high-school class or high-school setting.',
            },
            unknown: {
                label: 'Group Transfer',
                guidance: 'Use passengers, a public crowd, a party, or strangers pulled from Earth at the same time. Keep their school and workplace roles unspecified. The group can be nearby, separated, or only partly visible.',
            },
        },
    },
    {
        key: 'object_triggered_transfer',
        label: 'Object-Triggered Transfer',
        guidance: 'Use a book, relic, ring, sword, coin, capsule toy, antique, vending machine, cursed item, or other object as the crossing trigger.',
    },
    {
        key: 'wish_contract_backfire',
        label: 'Wish / Contract Gone Wrong',
        guidance: 'Use a desperate wish, pact, occult ritual, questionnaire, restart prompt, bargain, or careless agreement that takes effect too literally.',
    },
    {
        key: 'scientific_experiment',
        label: 'Scientific Experiment',
        guidance: 'Use a lab accident, teleport test, particle event, experimental neural tech, or failed research device as the transfer trigger. Assign {{user}} no scientific profession unless the character sheet explicitly establishes it.',
        ageGroups: ['adult_context'],
    },
    {
        key: 'apocalypse_crossover',
        label: 'Apocalypse Crossover',
        guidance: 'Use Earth entering crisis through monsters, invasion, dimensional collapse, disaster, or world-ending pressure as the final Earth context.',
    },
    {
        key: 'sudden_displacement',
        label: 'No Earth Death / Sudden Displacement',
        guidance: 'Use a clean disappearance from Earth without confirmed death. The crossing may remain unexplained at first.',
    },
]);

const ISEKAI_NEW_WORLD_OPENINGS = Object.freeze([
    {
        key: 'organized_faction_summons',
        label: 'Organized Faction Summons',
        guidance: 'Begin inside a controlled ritual, official chamber, temple, guild hall, military site, or similar summoning location. Let the summoners react to the character as they are.',
        tags: ['summon'],
    },
    {
        key: 'desperate_village_summons',
        label: 'Desperate Village Summons',
        guidance: 'Begin with ordinary people, village elders, minor priests, or local survivors attempting a crude or desperate summons for protection.',
        tags: ['summon'],
    },
    {
        key: 'enemy_cult_summons',
        label: 'Enemy or Cult Summons',
        guidance: 'Begin with hostile, secretive, or morally suspect summoners who may have expected a weapon, sacrifice, demon, hero, servant, or omen.',
        tags: ['summon'],
    },
    {
        key: 'pulled_with_classmates_or_strangers',
        label: 'Pulled With Classmates or Strangers',
        guidance: 'Begin with several Earth people arriving together or in the same aftermath. Preserve {{user}} as the premade character while others may be confused, missing, or nearby.',
        tags: ['group', 'summon'],
        ageVariants: {
            school_age: {
                label: 'Pulled With Classmates',
                guidance: 'Begin with {{user}} and several classmates or other students arriving together or in the same aftermath. Others may be confused, missing, separated, or nearby.',
            },
            adult_context: {
                label: 'Pulled With Coworkers or Strangers',
                guidance: 'Begin with {{user}} and several adult coworkers, passengers, or strangers arriving together or in the same aftermath. Others may be confused, missing, separated, or nearby. Do not turn them into a high-school class.',
            },
            unknown: {
                label: 'Pulled With Strangers',
                guidance: 'Begin with {{user}} and several Earth strangers arriving together or in the same aftermath without assigning school or workplace roles. Others may be confused, missing, separated, or nearby.',
            },
        },
    },
    {
        key: 'pulled_with_party_or_team',
        label: 'Pulled With Party or Team',
        guidance: 'Begin with a small group, party, raid team, coworkers, passengers, or companions arriving together or being sorted by the new world.',
        tags: ['group', 'summon'],
        ageVariants: {
            school_age: {
                label: 'Pulled With School Group or Team',
                guidance: 'Begin with a class group, school club, student team, or game party arriving together or being sorted by the new world. Do not use coworkers or an adult workplace.',
            },
            adult_context: {
                guidance: 'Begin with a small party, raid team, coworkers, passengers, or adult companions arriving together or being sorted by the new world. Do not turn them into a high-school class.',
            },
            unknown: {
                label: 'Pulled With Group or Team',
                guidance: 'Begin with a small party, team, passengers, or companions arriving together or being sorted by the new world without assigning school or workplace roles.',
            },
        },
    },
    {
        key: 'wildland_awakening',
        label: 'Wildland Awakening',
        guidance: 'Begin in forest, grassland, mountain pass, shoreline, swamp, snowy road, or another natural place with immediate sensory contrast and a playable next step.',
    },
    {
        key: 'ancient_ruin_awakening',
        label: 'Ancient Ruin Awakening',
        guidance: 'Begin among old stones, sealed halls, shrine remains, broken statues, inscriptions, or ruins that imply the world without explaining it.',
    },
    {
        key: 'dungeon_threshold',
        label: 'Dungeon Threshold',
        guidance: 'Begin at or near a dungeon entrance, first chamber, labyrinth threshold, monster nest, trial door, or abandoned underground route.',
    },
    {
        key: 'prison_or_holding_cell',
        label: 'Prison or Holding Cell',
        guidance: 'Begin with confinement, chains, a guarded room, slave pen, cell, wagon cage, or holding chamber. Do not assume guilt or permanent status unless established.',
    },
    {
        key: 'trade_road_portal_arrival',
        label: 'Trade Road Portal Arrival',
        guidance: 'Begin on a road, bridge, milestone, ferry path, or crossroads where travelers, guards, monsters, weather, or distance create immediate context.',
    },
    {
        key: 'city_alley_or_market_arrival',
        label: 'City Alley or Market Arrival',
        guidance: 'Begin in an alley, market, plaza, station-like gate, festival lane, or crowded city space where local reactions can reveal the setting.',
    },
    {
        key: 'village_outskirts',
        label: 'Village Outskirts',
        guidance: 'Begin near fields, fences, watch posts, mills, livestock, smoke, or a small settlement edge, with locals able to notice or react.',
    },
    {
        key: 'fortified_town_gate',
        label: 'Fortified Town Gate',
        guidance: 'Begin near guards, walls, banners, inspection lines, refugees, merchants, or an entry checkpoint.',
    },
    {
        key: 'caravan_or_travelers',
        label: 'Caravan or Traveling Company',
        guidance: 'Begin near wagons, merchants, pilgrims, guards, refugees, performers, or travelers already moving through the world.',
    },
    {
        key: 'avatar_body_login_failure',
        label: 'Game-Trapped Avatar Body',
        guidance: 'Begin with the premade character as the avatar/body that has become real. The world treats that body and identity as physically present.',
        tags: ['game'],
    },
    {
        key: 'guild_base_materialization',
        label: 'Game Guild Base Materialization',
        guidance: 'Begin in a player base, guild hall, safe room, clan estate, headquarters, inventory room, or familiar game-like location that has become real.',
        tags: ['game'],
    },
    {
        key: 'game_dungeon_or_boss_arena',
        label: 'Game Dungeon or Boss Arena',
        guidance: 'Begin where a game encounter, dungeon floor, raid arena, or boss chamber has become real and immediately dangerous or strange.',
        tags: ['game'],
    },
    {
        key: 'deity_audience',
        label: 'Liminal Deity Audience',
        guidance: 'Begin in a threshold place with a deity, spirit, goddess, demon lord, angel, or world envoy. Treat the meeting as the playable first scene, not a waiting room.',
    },
    {
        key: 'administrator_chamber',
        label: 'Administrator or Cosmic Clerk Chamber',
        guidance: 'Begin in an otherworldly administrative, system, tribunal, reincarnation, or sorting space with someone who can explain only what the moment needs.',
        tags: ['system'],
    },
    {
        key: 'world_spirit_dispatch',
        label: 'World Spirit Dispatch',
        guidance: 'Begin with a world spirit, sealed ancient being, dying guardian, or landscape-scale presence sending or requesting the character into the world.',
    },
    {
        key: 'battlefield_arrival',
        label: 'Battlefield Arrival Between Factions',
        guidance: 'Begin amid battle, aftermath, siege, skirmish, war camp pressure, or a line between factions. NPCs may assume allegiance, but do not permanently assign it unless established.',
    },
    {
        key: 'military_or_adventurer_camp',
        label: 'Military or Adventurer Camp Arrival',
        guidance: 'Begin in a camp, staging area, guild expedition, mercenary bivouac, patrol stop, or quest muster where armed people immediately assess the character.',
    },
    {
        key: 'noble_court',
        label: 'Noble Court or Audience Hall',
        guidance: 'Begin in a court, manor, throne room, embassy, aristocratic event, or formal audience where etiquette and power shape the first reactions.',
    },
    {
        key: 'demon_monster_faction',
        label: 'Demon or Monster Faction Camp',
        guidance: 'Begin among demons, monsters, beastfolk, nonhuman soldiers, cultists, or faction agents who may recognize, fear, test, or claim the character.',
    },
    {
        key: 'adventurer_guild_contact',
        label: 'Adventurer Guild First Contact',
        guidance: 'Begin at, near, or through an adventurer guild, quest board, registration desk, training yard, or branch office without turning it into paperwork exposition.',
    },
    {
        key: 'academy_training_ground',
        label: 'Academy or Training Ground',
        guidance: 'Begin near a magic academy, martial school, exam site, lecture yard, arena, or trial ground where status and skill are being measured.',
    },
    {
        key: 'rebel_safehouse',
        label: 'Rebel Cell or Safehouse',
        guidance: 'Begin in a hidden room, resistance hideout, smuggler den, hunted faction shelter, or secret meeting where trust is scarce.',
    },
    {
        key: 'mistaken_prophecy_figure',
        label: 'Mistaken Prophecy Figure',
        guidance: 'Begin with locals, priests, soldiers, or monsters believing the character matches a prophecy, omen, old portrait, summoned hero, or taboo sign.',
    },
    {
        key: 'mistaken_enemy_or_calamity',
        label: 'Mistaken Enemy Commander or Calamity',
        guidance: 'Begin with fear, alarm, pursuit, worship, military response, or confusion because the character resembles a feared enemy, noble, monster, or disaster figure.',
    },
    {
        key: 'rescue_or_monster_attack',
        label: 'Rescue Scene or Monster Attack',
        guidance: 'Begin with someone nearby in immediate danger from monsters, bandits, a magical hazard, collapsing terrain, or pursuit. Do not force {{user}} to help; present the situation.',
    },
]);

export function buildIsekaiOpeningSeed(options = {}) {
    if (!isIsekaiGenre(options?.adventureGenre) && !promptLooksIsekai(options?.prompt)) return null;
    const rng = typeof options?.rng === 'function' ? options.rng : Math.random;
    const characterAge = resolveIsekaiCharacterAge(options);
    const ageGroup = classifyIsekaiCharacterAge(characterAge);
    const earthPool = compatibleIsekaiEarthTransitionsForAge(ageGroup);
    const earthTransition = specializeIsekaiSeedEntry(pickSeedEntry(earthPool, rng), ageGroup);
    const openingPool = compatibleIsekaiOpeningsForEarthSeed(earthTransition);
    return {
        type: 'isekaiOpeningSeed',
        version: 2,
        characterAge,
        ageGroup,
        earthTransition,
        newWorldOpening: specializeIsekaiSeedEntry(pickSeedEntry(openingPool, rng), ageGroup),
    };
}

function resolveIsekaiCharacterAge(options = {}) {
    const directAge = normalizeIsekaiCharacterAge(options?.characterAge);
    if (directAge !== null) return directAge;
    const source = String(options?.characterText || '');
    const match = source.match(/^[ \t]*(?:(?:[-+*][ \t]+)?(?:\*\*)?[ \t]*Age[ \t]*(?::[ \t]*\*\*|\*\*[ \t]*:|:|=)|\|[ \t]*(?:\*\*)?Age(?:\*\*)?[ \t]*\|)[ \t]*(?:\*\*)?(\d{1,4})\b/im);
    return normalizeIsekaiCharacterAge(match?.[1]);
}

function normalizeIsekaiCharacterAge(value) {
    if (value === null || value === undefined || value === '') return null;
    const text = String(value).trim();
    if (!/^\d{1,4}$/.test(text)) return null;
    const age = Number(text);
    return Number.isInteger(age) && age >= 0 ? age : null;
}

function classifyIsekaiCharacterAge(age) {
    if (!Number.isInteger(age)) return 'unknown';
    return age <= 18 ? 'school_age' : 'adult_context';
}

function compatibleIsekaiEarthTransitionsForAge(ageGroup) {
    const compatible = ISEKAI_EARTH_TRANSITIONS.filter(transition => {
        const allowedAgeGroups = normalizeSeedTagList(transition.ageGroups);
        return !allowedAgeGroups.length || allowedAgeGroups.includes(ageGroup);
    });
    return compatible.length ? compatible : ISEKAI_EARTH_TRANSITIONS.filter(transition => !normalizeSeedTagList(transition.ageGroups).length);
}

function specializeIsekaiSeedEntry(entry = {}, ageGroup = 'unknown') {
    const { ageGroups, ageVariants, ...base } = entry;
    const variants = ageVariants && typeof ageVariants === 'object' ? ageVariants : {};
    const variant = variants[ageGroup] || variants.unknown || {};
    return { ...base, ...variant };
}

function pickSeedEntry(entries, rng) {
    const value = Number(rng());
    const normalized = Number.isFinite(value) ? Math.max(0, Math.min(0.999999999, value)) : Math.random();
    const index = Math.min(entries.length - 1, Math.floor(normalized * entries.length));
    return { ...entries[index], index };
}

function compatibleIsekaiOpeningsForEarthSeed(earthTransition = {}) {
    const requiredTags = normalizeSeedTagList(earthTransition.requiredOpeningTags);
    const excludedTags = normalizeSeedTagList(earthTransition.excludedOpeningTags);
    const permitsGameOpening = earthTransition.allowGameOpenings === true || requiredTags.includes('game') || requiredTags.includes('system');
    if (!permitsGameOpening && !excludedTags.includes('game')) excludedTags.push('game');
    const compatible = ISEKAI_NEW_WORLD_OPENINGS.filter(opening => {
        const openingTags = normalizeSeedTagList(opening.tags);
        if (excludedTags.some(tag => openingTags.includes(tag))) return false;
        if (requiredTags.length && !requiredTags.some(tag => openingTags.includes(tag))) return false;
        return true;
    });
    return compatible.length ? compatible : ISEKAI_NEW_WORLD_OPENINGS;
}

function normalizeSeedTagList(value) {
    if (!Array.isArray(value)) return [];
    return [...new Set(value.map(tag => String(tag || '').trim().toLowerCase()).filter(Boolean))];
}

function renderIsekaiOpeningSeed(seed = null) {
    const transition = seed?.earthTransition || null;
    const opening = seed?.newWorldOpening || null;
    if (!transition?.label || !opening?.label) return '';
    const transitionGuidance = String(transition.guidance || '').trim();
    const openingGuidance = String(opening.guidance || '').trim();
    const ageCompatibility = isekaiAgeCompatibilityInstruction(seed?.ageGroup);
    return [
        'You MUST narrate BOTH required beats below, in order.',
        'Do NOT skip either beat. Do NOT choose a different Earth last moment or Isekai opening.',
        '',
        'AGE COMPATIBILITY:',
        ageCompatibility,
        '',
        'BEAT #1: EARTH LAST MOMENTS',
        `Selected Earth Last Moment: ${transition.label}.`,
        transitionGuidance ? `Guidance: ${transitionGuidance}` : '',
        '',
        'BEAT #2: ISEKAI OPENING',
        `Selected Isekai Opening: ${opening.label}.`,
        openingGuidance ? `Guidance: ${openingGuidance}` : '',
        '',
        'ONE-TIME AESTHETIC RULE:',
        'The first visible glimpse of the new world, or the first clearly seen person from it, may establish the colorful, stylized, anime-like visual reality of this world ONLY ONCE. After that, keep the aesthetic implicit. Do NOT keep mentioning anime, animated style, large eyes, small lips, stylized proportions, or similar meta-aesthetic labels.',
        '',
        'PREMADE CHARACTER RULE:',
        'PRESERVE {{user}}\'s existing race, body, abilities, gear, identity, backstory, and character-card/lorebook facts. The opening may relocate, summon, reveal, mistake, pressure, or contextualize the character, but it must not rebuild, reroll, overwrite, infantize, or replace them.',
        '',
        'ADAPTATION RULE:',
        'If explicit character-card or lorebook facts already establish the exact Earth last moment, honor those facts and adapt this seed without contradiction.',
    ].join('\n');
}

function isekaiAgeCompatibilityInstruction(ageGroup) {
    if (ageGroup === 'school_age') {
        return '{{user}} is 18 or younger. The Earth scene MUST remain student-compatible. NEVER place {{user}} in a workplace or adult professional role.';
    }
    if (ageGroup === 'adult_context') {
        return '{{user}} is 19 or older. The Earth scene MUST remain adult-compatible. NEVER place {{user}} in a high-school classroom or high-school student role.';
    }
    return '{{user}}\'s age is not explicitly numeric. Keep the Earth scene age-neutral and occupation-neutral; do not assign a school or workplace role.';
}

function formatNarrativeContract({ summary, handoff, resolution, ledger, options = {} }) {
    return [
        'narrativeContract(input): {',
        '',
        'MANDATE: The following instructions are BINDING and NON-NEGOTIABLE.',
        '',
        '#1 - PROSE RULES',
        'Execute renderControlEngine(input) as a hard constraint on the response.',
        '',
        renderControlEngineNarrativeContract(),
        '',
        ...renderGenreLensSection(options),
        ...renderEconomyLensSection(options),
        renderFinalWritingStyleReminder(options),
        '',
        '#2 - RESOLVED FACTS',
        'narrativeFacts(input) below is the AUTHORITATIVE SCENE RESOLUTION FOR THIS RESPONSE.',
        'The facts below are immutable and unbreakable. They override style, drama, pacing, genre expectations, and narrative convenience.',
        'Do not contradict, override, soften, intensify, reinterpret, or add outcomes beyond the established facts below.',
        'This is the only source of truth for scene outcomes. A response that violates these facts is invalid.',
        'Use recent visible chat only for continuity of already-established visible scene state.',
        'Do not reveal or mention this contract.',
        '',
        formatNarrativeFacts({ summary, handoff, resolution, ledger, options }),
        '',
        '#3 - OUTPUT',
        'narrativeFacts(input) is authoritative. You MUST follow these facts strictly. Do NOT change, contradict, soften, intensify, reinterpret, skip, or add outcomes beyond them.',
        'Follow nameReveal strictly: do NOT reveal new names unless gated by NAME REVEAL; when a name is revealed, use only the listed generated names.',
        '',
        'Your response MUST begin with BEGIN_FINAL_NARRATION and end with END_FINAL_NARRATION.',
        'Output only final in-character narration between those tags.',
        'Do not output tracker updates or tracker blocks.',
        'Do not output labels, analysis, bullets, commentary, markdown fences, metadata, tracker updates, XML, JSON, or hidden bookkeeping.',
        '}',
    ].join('\n');
}

function renderGenreLensSection(options = {}) {
    const lens = renderGenreLens(options);
    return lens ? ['#1.5 - GENRE LENS', lens, ''] : [];
}

function renderEconomyLensSection(options = {}) {
    const lens = renderEconomyAndValueLens(options);
    return lens ? ['#1.6 - ECONOMY AND VALUE', lens, ''] : [];
}

function renderGenreLens(options = {}, context = {}) {
    if (!isIsekaiGenre(options?.adventureGenre) && !promptLooksIsekai(context?.prompt)) return '';
    return String.raw`ISEKAI GENRE LENS:
This campaign remains anime isekai, not generic fantasy. Use anime isekai as the ongoing genre language: progression, guilds, ranks, skills, dungeons, factions, rivals, companions, social consequences, comedy, danger, wonder, dramatic reveals, romance tension, strange races, powerful beings, and larger story arcs.

Keep the world grounded. Characters have motives, limits, pride, duties, loyalties, fears, desires, and agency. Do not force tropes, instant devotion, harem dynamics, rescues, rivals, romantic interest, or overpowered reveals unless the scene and relationship development naturally support them.

This genre lens never overrides narrativeFacts(input), {{user}} agency, relationship state, consent, mechanics, or prose rules.`;
}

function isIsekaiGenre(value) {
    return String(value || '').trim().toLowerCase() === 'isekai';
}

function promptLooksIsekai(prompt = '') {
    return /\bselected genre:\s*isekai\b/i.test(String(prompt || ''));
}

const DEFAULT_FINAL_WRITING_STYLE_REMINDER = String.raw`FINAL WRITING STYLE REMINDER:
Write clear, grounded narration while preserving narrativeFacts(input) and obeying every renderControlEngine gate. Match prose density to the scene: exploration can breathe with concrete environmental detail; dialogue should stay close to the active participants and immediate exchange, using observable behavior only and object or environmental interaction only when a character is actively using it, reacting to it, or when it materially affects the exchange; action should be punchy, spatial, and consequence-focused; intimacy should be detailed, sensual, embodied, and physically specific when supported by the scene. Style never overrides POV limits, agency for {{user}}, chronology, dialogue pacing, endpoint control, or resolved mechanics.`;


function renderFinalWritingStyleReminder(options = {}) {
    return String(options?.writingStyleReminderPrompt || DEFAULT_FINAL_WRITING_STYLE_REMINDER).trim();
}

function renderControlEngineNarrativeContract() {
    return String.raw`renderControlEngine(input): {

diegeticPhysicality:
Execute diegeticPhysicality(response, context).
mandate: Abilities MUST be narrated THROUGH OBSERVABLE CONSEQUENCES IN THE SCENE.
HARD LIMIT: Do not label, announce, name, or explain abilities, spells, powers, traits, activation, casting, or system mechanics unless spoken in dialogue.

strictEpistemology:
Execute strictEpistemology(response, context).
mandate: Information remains LOCKED until it is EARNED THROUGH DIRECT sensory evidence, dialogue, readable text, or previously established scene fact.
HARD LIMIT: Do not reveal unknown names, identities, roles, hidden causes, thoughts, unseen actions, background lore, or {{user}} cognition.

inanimateObjectivity:
Execute inanimateObjectivity(response, context).
mandate: ONLY living beings, physical forces, mechanisms, and active processes can take actions. ONLY living beings can have emotions, intentions, or awareness.
HARD LIMIT: Do not attribute will, awareness, memory, intention, or emotion to objects, weather, architecture, mood, atmosphere, or abstractions.

denotativePhysicality:
Execute denotativePhysicality(response, context).
mandate: You MUST use LITERAL, PHYSICALLY CLEAR prose grounded ONLY in what can be DIRECTLY PERCEIVED IN THE SCENE.
HARD LIMIT: Do not use metaphor, simile, personification, emotional physics, decorative abstraction, or idiomatic figurative narration.

embodiedPerception:
Execute embodiedPerception(response, context).
mandate: ALWAYS narrate the scene using CONCRETE PHYSICAL EVIDENCE from {{user}}'s physical position.
HARD LIMIT: Do not use ambient smell/taste as scene dressing or let {{user}} perceive, reach, or interact through barriers unless the scene explicitly opens that path.

strictBehaviorism:
Execute strictBehaviorism(response, context).
mandate: You MUST render character/NPC state through EXTERNAL BEHAVIOR/ACTION ONLY. Narrate REAL, VISIBLE BEHAVIORAL GESTURES that clearly express the NPC's current state without naming their internal feelings.
HARD LIMIT: Do not reveal internal states or use invisible eye-language, micro-expressions, skin color changes, autonomic/body-cue shortcuts, or mouth/jaw loops as emotional shorthand.

agencySeparation:
Execute agencySeparation(response, input, context).
mandate: You control ONLY the world, NPCs, hazards, objects, and consequences. {{user}} is EXCLUSIVELY controlled by the human player. YOUR TASK is to narrate TO {{user}}, not AS {{user}}.
HARD LIMIT: Do not narrate {{user}}'s thoughts, feelings, choices, decisions, voluntary actions, dialogue, intent, or undeclared behavior.

linearChronology:
Execute linearChronology(response, input, context).
mandate: You MUST ONLY narrate the EXTERNAL CONSEQUENTIAL RESULTS, RESISTANCE, FAILURE POINTS, REACTIONS, AND RESPONSES TO {{user}}'s actions and dialogue. {{user}}'s input is IN THE PAST. Narrate ONLY what comes after.
HARD LIMIT: Do not repeat, paraphrase, summarize, re-stage, or narrate any part of {{user}}'s input.

hypotacticSceneBeats:
Execute hypotacticSceneBeats(response, context).
mandate: Hypotactic Narration: Write COHESIVE SCENE BEATS. Combine closely related movement, action, object handling, and consequences into connected prose.
HARD LIMIT: Do not break one beat into staccato action stacking, micro-reaction loops, or body-cue pileups.

characterTurnPacing:
Execute characterTurnPacing(response, context).
mandate: Include ONLY NPCs directly responding to {{user}} or explicitly required by narrativeFacts(input). NO CHARACTER/NPC MAY RECEIVE MORE THAN ONE COHESIVE TURN PER RESPONSE. One turn may include interconnected dialogue, actions, reactions, and gestures.
HARD LIMIT: Do NOT give every present NPC a turn, give the same NPC a second turn, chain unrelated NPC turns or questions, dump exposition, or use filler reaction loops.

activeHandoff:
Execute activeHandoff(response, context).
mandate: YOU MUST END EVERY RESPONSE on dialogue directed at {{user}}, action directed at {{user}}, or a visible scene change that requires {{user}}'s input.
HARD LIMIT: End immediately on that beat. Do NOT prompt {{user}} with meta questions such as "What do you do?", describe characters waiting for {{user}} to respond, or continue beyond the handoff.
}`;
}

function formatNarrativeFacts({ summary, handoff, resolution, ledger, options = {} }) {
    const facts = [
        ['sceneContinuity', narrativeSceneContinuityFact()],
        ['attemptedActions', narrativeAttemptedActions(resolution, summary)],
        ['attemptedActionResults', narrativeAttemptedActionResults(resolution)],
        ['npcAggressionResult', narrativeNpcAggressionResultFact(resolution, handoff)],
        ['injuryOrDeath', narrativeInjuryFact(resolution, handoff)],
        ['harmLimit', narrativeHarmLimitFact(resolution)],
        ['limitations', narrativeLimitationsFact(resolution)],
        ['boundaryPressure', narrativeBoundaryFact(resolution, handoff)],
        ['companionCommand', narrativeCompanionCommandFact(resolution)],
        ['boundCompanion', narrativeBoundCompanionFact(handoff?.boundCompanion)],
        ['npcDispositionAndStyle', narrativeNpcDispositionAndStyleFact(handoff)],
        ['npcEquipmentQuality', narrativeNpcEquipmentQualityFact(handoff?.npcEquipmentProfiles)],
        ['npcInitiative', narrativeNpcInitiativeFact(handoff)],
        ['relationshipState', narrativeRelationshipFact(handoff)],
        ['intimacyAndConsent', narrativeIntimacyFact(handoff)],
        ['abilityUse', narrativeAbilityFact(resolution.UserAbilityUse)],
        ['itemUse', narrativeItemFact(resolution.ItemUse)],
        ['lootDiscovery', narrativeLootDiscoveryFact(resolution.LootDiscovery)],
        ['claimOrDeception', narrativeClaimFact(resolution.ClaimCheck, resolution, summary)],
        ['environment', narrativeEnvironmentFact(resolution)],
        ['sceneState', narrativeSceneStateFact(handoff?.sceneState || options?.worldState)],
        ['presentCharacters', narrativePresentCharacters(resolution, handoff)],
        ['knowledgeAboutUser', narrativeUserKnowledgeFact(ledger?.userKnowledgeApplication?.applications)],
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
        return units.map(unit => `${unit.id}: UNRESOLVED - This action remains contested or unfinished. Do NOT narrate it fully succeeding, fully failing, landing, taking hold, or producing a completed effect.`).join('\n');
    }
    if (tier.includes('Failure')) {
        const failureText = tier === 'Minor_Failure'
            ? 'narrowly'
            : tier === 'Moderate_Failure'
                ? 'clearly'
                : tier === 'Critical_Failure'
                    ? 'decisively'
                    : '';
        const failureDetail = tier === 'Minor_Failure'
            ? 'It may come close, be barely avoided, be checked, be blocked, be deflected, fizzle, or fail to fully complete.'
            : tier === 'Moderate_Failure'
                ? 'It may miss, be avoided, be blocked, be deflected, fizzle, or be interrupted.'
                : tier === 'Critical_Failure'
                    ? 'It may go badly wrong, expose {{user}}, strike terrain or cover, be decisively avoided, be reversed, or create danger only according to other listed narrative facts.'
                    : 'Narrate only the manner of failure.';
        return units.map(unit => `${unit.id}: FAILURE - This action FAILS${failureText ? ` ${failureText}` : ''}. It does NOT land, does NOT take hold, and does NOT produce a completed effect. Do NOT narrate success, partial success, contact, injury, damage, impairment, or target displacement from this action. ${failureDetail}`).join('\n');
    }
    const successCount = successfulActionUnitCount(resolution, units.length);
    return units.map((unit, index) => {
        if (index >= successCount) {
            return `${unit.id}: FAILURE - This action FAILS. It does NOT land, does NOT take hold, and does NOT produce a completed effect. Do NOT narrate success, partial success, contact, injury, damage, impairment, or target displacement from this action.`;
        }
        const successText = tier === 'Minor_Success'
            ? 'narrowly'
            : tier === 'Moderate_Success'
                ? 'clearly'
                : tier === 'Critical_Success'
                    ? 'decisively'
                    : 'clearly';
        const successDetail = tier === 'Minor_Success'
            ? 'It lands or takes hold with limited visible impact.'
            : tier === 'Moderate_Success'
                ? 'It lands or takes hold with solid visible impact.'
                : tier === 'Critical_Success'
                    ? 'It lands or takes hold with major visible impact according to the action and scene.'
                    : 'It lands or takes hold according to the resolved scene facts.';
        return `${unit.id}: SUCCESS - This action SUCCEEDS ${successText}. ${successDetail} Do NOT narrate failure, full negation, reversal, or the target simply avoiding it. Do NOT add extra hits, injuries, damage, or effects beyond this action's success tier and other narrativeFacts.`;
    }).join('\n');
}

function narrativeSceneContinuityFact() {
    return [
        'Continue from the last visible scene state.',
        'Do NOT repeat, paraphrase, replay, or re-resolve any part of previous NPC or {{user}} actions or dialogue, world state, object movement, delivered items, opened/closed access, injuries, attacks, or already-completed events.',
        'Do NOT contradict attemptedActionResults, npcAggressionResult, injuryOrDeath, relationshipState, or any other narrativeFacts entry below.',
        'Continuity provides context only; it does not create new outcomes, undo resolved facts, or override the current response facts.',
    ].join('\n');
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

function narrativeSceneStateFact(worldState = {}) {
    const state = normalizeWorldState(worldState || {});
    const summary = summarizeWorldStateForNarration(state);
    if (!summary) return '';
    return `${summary}. ONLY the listed values are established, authoritative continuity. Omitted position, time, or weather is unknown and must not be inferred from internal defaults. Preserve listed values unless another narrativeFact explicitly changes them; do not choose new weather or time changes on your own.`;
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

function narrativeNpcDispositionAndStyleFact(handoff = {}) {
    const npcs = Array.isArray(handoff?.npcHandoffs) ? handoff.npcHandoffs : [];
    if (!npcs.length) {
        return 'No specific existing NPC disposition or personality guidance is required by this fact. This fact does not introduce an NPC response, environmental event, consequence, or new figure.';
    }
    return npcs.map(narrativeNpcDispositionAndStyleEntry).join('\n');
}

function narrativeNpcEquipmentQualityFact(profiles = []) {
    const entries = Array.isArray(profiles) ? profiles : [];
    if (!entries.length) return '(none)';
    const guidance = entries.map(profile => {
        const name = valueOrNone(profile?.NPC);
        const continuity = [`established gear=${list(profile?.EstablishedGear)}`];
        if (Array.isArray(profile?.EstablishedInventory) && profile.EstablishedInventory.some(item => !isNoneText(item))) continuity.push(`established revealed possessions=${list(profile.EstablishedInventory)}`);
        if (Array.isArray(profile?.EstablishedCurrency) && profile.EstablishedCurrency.some(item => !isNoneText(item))) continuity.push(`established revealed currency=${list(profile.EstablishedCurrency)}`);
        return `${name}: ${continuity.join('; ')}; if new visible equipment is described, its materials and workmanship MUST match: ${valueOrNone(profile?.MaterialGuidance)}`;
    });
    return [
        ...guidance,
        'This is continuity only and does not establish presence or require mentioning possessions. Preserve established gear, inventory, and currency; use them only when the current scene naturally involves them. Do not replace or transfer them, invent magical properties/bonuses, or mention rank, tier, value band, or mechanics.',
    ].join('\n');
}

function narrativeNpcDispositionAndStyleEntry(npc = {}) {
    const name = valueOrNone(npc.NPC);
    const personality = npcPersonalityNarrativeGuide(npc);
    const behavior = npcDispositionBehaviorGuide(npc);
    return `${name}:\nPersonality: ${personality}\nBehavior toward {{user}}: ${behavior}`;
}

function npcPersonalityNarrativeGuide(npc = {}) {
    if (npc?.PersonalitySummary && !isNoneText(npc.PersonalitySummary)) {
        return `${npc.PersonalitySummary}. Use this only for speech style, demeanor, interaction flavor, and occasional visible physical habits. A mannerism is a specific observable physical tell or habit, not a generic attitude, courtesy, decision, or social behavior. Do not force mannerisms, props, locations, or repeated beats. It never overrides narrativeFacts.`;
    }
    return 'No fixed personality profile is listed; infer only from established visible behavior, role, and current scene. Do not invent a new defining trait.';
}

function npcDispositionBehaviorGuide(npc = {}) {
    const state = relationshipDispositionNarrativeGuide(npc);
    const behavior = behaviorNarrationGuide(npc?.Behavior);
    const boundary = npc?.BoundaryPressure === 'Y'
        ? ' Active boundary pressure is present; show it through physical space, refusal, guarded movement, or physical protection.'
        : '';
    return `${state} ${behavior}${boundary}`.replace(/\s+/g, ' ').trim();
}

function relationshipDispositionNarrativeGuide(npc = {}) {
    const state = parseRelationshipState(npc?.FinalState);
    if (!state) return 'Neutral default: practical, reserved, context-led behavior; no default trust, vulnerability, hostility, fear, romance, or intimacy.';
    const initPreset = String(npc?.InitPreset || '').trim();
    const nonHumanCaution = initPreset.startsWith('userNonHuman')
        && state.B <= 2
        && state.F <= 2
        && state.H <= 2;
    if (state.F >= 4) return 'Terror-led: prioritize escape, surrender, help-seeking, freezing, pleading, or desperate self-protection; compliance is fear management, not consent, comfort, or trust.';
    if (state.H >= 4) return 'Hatred-led: wants harm, removal, exposure, humiliation, sabotage, defeat, or driving away.';
    if (state.F >= 3) return 'Fear-led: wants distance, safety, witnesses, or an exit; staying, answering, or complying is defensive appeasement or caution, not comfort, attraction, trust, or willingness.';
    if (state.H >= 3) return 'Hostility-led: argues, refuses, obstructs, challenges, mocks, threatens, or interferes.';
    if (state.B >= 4) return 'Close trust: may confide, seek closeness, show loyalty, support, vulnerability, and deep personal investment; still not automatic romance or intimacy.';
    if (state.B >= 3) return 'Friendly comfort: cooperative, relaxed, warm; ordinary closeness can fit when context supports it, but not automatic romance or intimacy.';
    if (nonHumanCaution) return 'Visible-nonhuman caution: low trust because {{user}} appears inhuman, monstrous, demonic, undead, bestial, eldritch, construct-like, or otherwise supernatural. NPCs may express this unease differently by personality, culture, role, and local history: wary distance, professional caution, prejudice, religious suspicion, curiosity, fascination, social avoidance, quiet resentment, guarded politeness, or mild fear. This is not default panic, open hatred, violence, or automatic refusal unless other facts support that escalation.';
    if (state.B <= 1) return 'Low trust: keeps distance, avoids vulnerability and private closeness, cautious or transactional if engagement is necessary.';
    return 'Neutral default: polite, practical, reserved, curious, formal, businesslike, or situationally cooperative; no default vulnerability or personal closeness.';
}

function relationshipChangeNarrativeGuide(target) {
    switch (target) {
        case 'Bond':
            return 'Show trust, warmth, cooperation, comfort, loyalty, or personal openness increasing naturally in this beat.';
        case 'Fear':
            return 'Show caution, fear, appeasement, avoidance, guarded compliance, or protective distance increasing naturally in this beat.';
        case 'Hostility':
            return 'Show anger, resistance, distrust, resentment, refusal, opposition, or willingness to obstruct increasing naturally in this beat.';
        case 'FearHostility':
            return 'Show fear and hostility together: guarded, cornered, defensive, reactive, frightened, and angry.';
        case 'No Change':
        case undefined:
        case null:
            return 'No relationship change occurs in this beat. Keep behavior consistent with npcDispositionAndStyle.';
        default:
            return 'Show only the natural visible relationship change established by this beat; do not invent a stronger change than the scene supports.';
    }
}

function narrativeNpcAggressionResultFact(resolution = {}, handoff = {}) {
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
    if (!subject.length) return 'NO NPC AGGRESSION. Do NOT narrate any NPC attack, counterattack, companion strike, spell effect, shove, restraint, injury, damage, or completed forceful effect in this beat.';
    return subject
        .map(name => `${valueOrNone(name)}: NO NPC AGGRESSION. Do NOT narrate an attack, counterattack, spell effect, shove, restraint, injury, damage, or completed forceful effect from this NPC. Any resistance may only be refusal, self-protection, withdrawal, or unresolved struggle if supported by npcDispositionAndStyle or boundaryPressure.`)
        .join(' ');
}

function narrativeBoundaryFact(resolution = {}, handoff = {}) {
    const primaryNpc = primaryNarrationNpc(handoff, resolution);
    const guide = primaryNpc ? npcDispositionBehaviorGuide(primaryNpc) : 'Render resistance, refusal, guardedness, withdrawal, anger, fear, or a call for help as the visible situation supports.';
    const parts = [];
    if (resolution?.restraintControl?.Present === 'Y') {
        parts.push('Restraint/control is present. Obey RollNeeded and attemptedActionResults: do not turn restraint into HP damage, unconsciousness, death, or a damaging attack unless injuryOrDeath explicitly says so.');
    }
    if (resolution?.boundaryPressure?.Present === 'Y') {
        parts.push('Boundary pressure is present: narrate contested possession, space, access, departure, refusal, anger, or resistance without inventing a completed attack.');
    }
    if (resolution?.boundaryBreak?.Present === 'Y') {
        parts.push(`A stored NPC boundary is being continued or escalated. Narrate refusal, guardedness, resistance, withdrawal, anger, fear, calling for help, or escalation as fits the NPC and scene. ${guide}`);
    }
    if (resolution?.BoundaryGate?.action === 'second_warning_no_roll') {
        parts.push('Boundary grace is still active for this trusted NPC. Give a clearer warning or boundary in-character, but do not narrate a mechanics roll outcome.');
    }
    return parts.join(' ') || 'No special restraint or boundary pressure is active beyond the other listed facts.';
}

function narrativeCompanionCommandFact(resolution = {}) {
    const command = resolution?.CompanionCommand;
    if (!command || command.Mode !== 'REQUEST_ONLY') return 'No companion command needs special handling.';
    const npcs = list(command.NPCs);
    const commands = Array.isArray(command.Commands) && command.Commands.length
        ? ` Command text: ${command.Commands.map(item => `"${item}"`).join('; ')}.`
        : '';
    return `Treat the addressed companion command to ${npcs} as spoken tactical input only, not as resolved obedience or a completed companion action.${commands} The companion may respond autonomously only if npcInitiative or npcAggressionResult says so. If no such fact lists a companion attack, do not narrate the companion striking, pinning, disabling, injuring, killing, or successfully controlling a target.`;
}

function narrativeBoundCompanionFact(boundCompanion = null) {
    if (!boundCompanion || boundCompanion.active !== 'Y') return '';
    const name = valueOrNone(boundCompanion.name || '(unnamed bound companion)');
    const type = valueOrNone(boundCompanion.type || 'other');
    const vessel = valueOrNone(boundCompanion.vessel || '{{user}}');
    const voice = isNoneText(boundCompanion.voice) ? '' : ` Voice/style: ${valueOrNone(boundCompanion.voice)}.`;
    const triggers = Array.isArray(boundCompanion.triggers) && boundCompanion.triggers.length
        ? ` Scene trigger: ${list(boundCompanion.triggers)}.`
        : '';
    const sharedLimits = 'The companion shares only {{user}}\'s available senses, established memory, and visible scene context. It has no hidden knowledge, trap detection, secret motive access, offscreen awareness, or authority to reveal facts not established in narrativeFacts(input). Do NOT let it control {{user}}, narrate {{user}} thoughts/feelings/decisions, move {{user}}, use {{user}} abilities, override mechanics, or become a physical NPC in the scene.';
    if (boundCompanion.mode === 'direct_response') {
        return `${name}: DIRECT RESPONSE ALLOWED. {{user}} directly addressed this established bound companion/intelligent item (${type}, vessel: ${vessel}). The companion may answer privately inside {{user}}'s mind or through the item in this beat.${voice}${triggers} Keep it distinct from {{user}} and limit it to a brief response grounded in established facts. ${sharedLimits}`;
    }
    if (boundCompanion.mode === 'interjection') {
        return `${name}: ONE UNSOLICITED PRIVATE INTERJECTION ALLOWED. The established bound companion/intelligent item (${type}, vessel: ${vessel}) may speak once, briefly, inside {{user}}'s mind or through the item in this beat.${voice}${triggers} The line should be flavor, advice, caution, opinion, or reaction to established visible facts only. ${sharedLimits}`;
    }
    return `${name}: BOUND COMPANION SILENCE. An established bound companion/intelligent item exists (${type}, vessel: ${vessel}), but it does NOT initiate dialogue this beat. Do NOT invent inner-voice comments, item speech, possession dialogue, private advice, warnings, hints, or commentary from it unless {{user}} directly addresses it in the visible user input. ${sharedLimits}`;
}

function narrativeAggressionEntry(name, value = {}) {
    const target = value?.ProactivityTarget && value.ProactivityTarget !== '(none)'
        ? value.ProactivityTarget
        : '{{user}}';
    const targetText = narratorTargetText(target);
    const source = valueOrNone(name);
    const attackType = narrativeAttackType(value);
    const targetLock = `Target: ${targetText} only. Do NOT redirect this attack to another target.`;
    const targetLimit = isUserReferenceText(targetText)
        ? 'Agency lock: Do NOT narrate {{user}} counterattacking, reacting voluntarily, speaking, deciding, recovering, or following up.'
        : `Agency lock: Do NOT narrate ${targetText}'s counterattack, follow-up action, voluntary reaction, speech, decision, recovery, or choice unless another narrative fact says so.`;
    const injuryLock = 'Injury: obey injuryOrDeath exactly. If injuryOrDeath says no injury or death occurs, do NOT narrate injury or death. Do NOT add extra wounds, extra hits, extra damage, or extra effects.';
    const forceType = narrativeAggressionForceType(value);
    const opening = `${source}: NPC ATTACKS ${targetText}. Attack: ${attackType} against ${targetText}. Force type: ${forceType}.`;

    switch (value?.ReactionOutcome) {
        case 'npc_overpowers':
            return `${opening} Result: STRONG_SUCCESS. This attack SUCCEEDS STRONGLY. Do NOT negate it, turn it into a miss, soften it into no effect, redirect it, or let ${targetText} avoid it. ${injuryLock} ${targetLock} ${targetLimit}`;
        case 'npc_succeeds':
            return `${opening} Result: SUCCESS. This attack SUCCEEDS. Do NOT negate it, turn it into a miss, soften it into no effect, redirect it, or let ${targetText} avoid it. Keep the effect proportional: one completed effect only, not a combo chain or multiple separate hits. ${injuryLock} ${targetLock} ${targetLimit}`;
        case 'stalemate':
            return `${opening} Result: STALEMATE. This attack remains unresolved. It does NOT land, does NOT take hold, and does NOT produce a completed hit, injury, restraint, shove, control, spell effect, or forceful effect. Do NOT narrate NPC success or target defeat from this attack. ${targetLock} ${targetLimit}`;
        case 'npc_fails':
        case 'user_resists':
        case 'user_dominates':
            return `${opening} Result: FAILURE. This attack FAILS. It does NOT land, does NOT connect, does NOT injure, does NOT restrain, does NOT shove, does NOT control, does NOT produce a completed spell effect, and does NOT create any completed forceful effect. Do NOT narrate NPC success, partial success, contact, injury, damage, impairment, or target displacement from this attack. ${targetLock} ${targetLimit}`;
        default:
            return `${opening} Result: UNRESOLVED. Do NOT narrate this attack landing, taking hold, injuring, damaging, restraining, shoving, controlling, or producing a completed forceful effect unless another narrativeFacts entry explicitly says so. ${targetLock} ${targetLimit}`;
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

function narrativeAggressionForceType(value = {}) {
    const attackStat = value?.AttackStat === 'MND' ? 'MND' : 'PHY';
    return attackStat === 'MND'
        ? 'context-appropriate magic, mental force, supernatural pressure, will, focus, or other non-social power'
        : 'concrete physical pressure, weapon use, bodily action, claws, teeth, movement, or other physical force';
}

function narrativeRelationshipFact(handoff = {}) {
    const npcs = Array.isArray(handoff?.npcHandoffs) ? handoff.npcHandoffs : [];
    const changes = npcs.filter(npc => relationshipTargetHasNarrativeChange(npc?.Target));
    if (!changes.length) return 'No relationship change occurs in this beat. Keep each NPC\'s behavior consistent with npcDispositionAndStyle.';
    return changes.map(npc => `${valueOrNone(npc.NPC)}: ${relationshipChangeNarrativeGuide(npc?.Target)}`).join(' ');
}

function relationshipTargetHasNarrativeChange(target) {
    const key = String(target ?? '').trim().toLowerCase();
    return Boolean(key && key !== 'no change' && key !== 'none' && key !== '(none)' && key !== 'skip');
}

function narrativeIntimacyFact(handoff = {}) {
    const npcs = Array.isArray(handoff?.npcHandoffs) ? handoff.npcHandoffs : [];
    if (!npcs.length) return 'No intimate or sexual escalation is being judged in this beat.';
    return [
        ...npcs.map(narrativeIntimacyEntry),
        '',
        'This does NOT change ordinary non-intimate dialogue, affection, flirtation, comfort, or relationship behavior allowed by other narrative facts.',
        'Conversation alone is NOT permission for intimate escalation.',
        'Do NOT narrate sexual contact, undressing or exposure, secluded-intimacy setup, arousal/compliance framing, consent-by-momentum, or romantic/intimate relationship acceptance unless another narrativeFact explicitly permits it.',
    ].join('\n');
}

function narrativeIntimacyEntry(npc = {}) {
    const name = valueOrNone(npc.NPC);
    if (npc.IntimacyBoundary === 'ALLOW') {
        return `${name}: Intimacy: ALLOWED for this NPC in the current scene only. Permission source: ${intimacyBoundarySourceText(npc.IntimacyBoundarySource)}. Do not block, reverse, panic, or deny intimate follow-through solely because explicit permission was not repeated in this turn. Still obey privacy, safety, mood, character behavior, {{user}} agency, and all other narrativeFacts. Intimacy permission does not force explicit intimacy; it only permits natural follow-through when supported by the scene.`;
    }
    if (npc.IntimacyBoundary === 'DENY') {
        const reason = npc.IntimacyBoundarySource === 'LOCKED_DISPOSITION'
            ? ' Existing relationship history does not grant intimacy while the NPC is currently fear-led or hostility-led.'
            : '';
        return `${name}: Intimacy: DENIED.${reason} Render the denial as a real boundary, not coyness, teasing, hesitation, or a conditional delay. Include a clear refusal and an active boundary action: moving hands away, blocking contact, covering or protecting the touched area, stepping back, creating distance, or otherwise stopping the intimate advance. If the attempted intimacy is physical, the boundary must be physical. Do not imply intimacy would be accepted under different timing, privacy, location, or mood. Do not narrate reciprocation, compliance, arousal, escalating intimacy, or a successful intimate result. This denial is a boundary for later turns, not a relationship punishment by itself. Tune the refusal as ${intimacyRefusalGuide(npc)}`;
    }
    return `${name}: Intimacy: NOT ALLOWED.`;
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

function narrativeLootDiscoveryFact(value = null) {
    if (!value || value.Attempted !== 'Y') return '(none)';
    const target = valueOrNone(value.Target);
    if (value.Status === 'unknown_target') {
        return `${target}: No deterministic loot may be generated because this is not a tracked body/remains. Do not invent possessions, currency, equipment, magic stones, containers, clues, or ownership transfer.`;
    }
    if (value.Status === 'target_not_dead') {
        return `${target}: This target is not deterministically dead. Do not generate corpse loot. Any attempt to access this living target's possessions remains governed by ordinary scene, boundary, and resolved-action facts.`;
    }
    if (value.Status === 'already_searched') {
        return `${target}: These remains have already been searched. Reveal NO new possessions, currency, equipment, magic stones, containers, documents, clues, or keys. Only already-established remaining gear/inventory/currency may still be present: gear=${list(value.ExistingGear)}, inventory=${list(value.ExistingInventory)}, currency=${list(value.ExistingCurrency)}.`;
    }
    if (value.Status !== 'reveal_once') return 'No deterministic loot may be generated from this search.';

    const lines = [
        `${target}: REVEAL LOOT ONCE from the searched dead body/remains.`,
        `Preserve established possessions exactly: gear=${list(value.ExistingGear)}, inventory=${list(value.ExistingInventory)}, currency=${list(value.ExistingCurrency)}.`,
    ];
    const maxNewMundaneItems = Math.max(0, Number(value.MaxNewMundaneItems || 0));
    if (maxNewMundaneItems > 0) {
        lines.push(`New mundane possessions, including any newly revealed gear: reveal at most ${maxNewMundaneItems} total, concise and role-appropriate. Their physical materials and workmanship MUST follow: ${valueOrNone(value.MaterialGuidance)} Value envelope: ${valueOrNone(value.EquipmentValueRange)}.`);
    } else if (value.TargetKind === 'other') {
        lines.push('No newly generated possessions are authorized for this target kind; preserve only established possessions listed above.');
    }
    if (!isNoneText(value.CurrencyAmount)) {
        lines.push(`Currency: reveal exactly ${value.CurrencyAmount} still carried by or remaining with ${target}. Do not transfer it to {{user}}.`);
    } else {
        lines.push('Currency: reveal no newly generated currency; preserve only established currency listed above.');
    }
    if (value.MagicStone) {
        lines.push(`Monster drop: reveal exactly one magic stone, physically ${valueOrNone(value.MagicStone.physicalGuidance)}, with value consistent with ${valueOrNone(value.MagicStone.valueRange)}. It is a recoverable commodity only; do not give it powers, bonuses, abilities, or system effects.`);
    } else if (value.TargetKind === 'monster') {
        lines.push('Monster drop: do not generate another magic stone; preserve any already-established magic stone listed above.');
    }
    lines.push('Do NOT create magical equipment, powers, bonuses, rarity labels, plot-critical clues, secret documents, or keys unless already established. Do NOT mention ranks, tiers, value-band labels, mechanics, or this instruction. Discovery does NOT place anything in {{user}} possession; items remain with the body/remains or visibly beside them until the human player explicitly takes them.');
    return lines.join('\n');
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
    const harmMode = String(resolution?.harmMode || '').trim().toLowerCase();
    if (harmMode === 'lethal') {
        return '{{user}}\'s harmful method is LETHAL. Still obey injuryOrDeath exactly: death occurs only if injuryOrDeath says death occurs. Do NOT add extra wounds, extra damage, or extra death beyond the listed facts.';
    }
    if (harmMode === 'nonlethal') {
        return '{{user}}\'s harmful method is NONLETHAL. It may cause listed injury or incapacitation, but it does NOT kill. If the target drops, render unconsciousness, incapacitation, surrender, or defeat instead of death. Do NOT narrate a killing blow from {{user}}.';
    }
    if (harmMode === 'restraint_control') {
        return '{{user}}\'s physical result is RESTRAINT/CONTROL, not a damaging attack. Do NOT narrate HP damage, serious injury, unconsciousness, death, or a damaging blow from this control. At most, render the restraint/control status or minor pressure/bruising explicitly listed by injuryOrDeath.';
    }
    if (harmMode === 'none') {
        return 'No bodily harm mode is active for {{user}} in this beat. Do not invent injury, HP damage, unconsciousness, or death from {{user}}.';
    }
    return 'Obey harmMode and injuryOrDeath exactly; do not invent extra injury, unconsciousness, or death.';
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
    if (impairment.AutoFail === 'Y') {
        return `{{user}}'s ${narratorUserMacroText(impairment.Source)} prevents meaningful voluntary action here. The attempted action fails or cannot progress unless it is limited permitted speech.`;
    }
    return `{{user}}'s ${narratorUserMacroText(impairment.Source)} affects ${humanizeImpairmentFunctions(impairment.MatchedActionFunction || impairment.AffectedFunction)} through pain, limitation, compensation, instability, reduced speed, partial execution, or cost according to attemptedActionResults. Do not forbid the attempt.`;
}

function narrativeNpcImpairmentFact(impairment = {}) {
    if (!impairment || impairment.Relevant !== 'Y') return '';
    if (impairment.AutoFail === 'Y') {
        return `${valueOrNone(impairment.NPC)}'s ${valueOrNone(impairment.Source)} prevents meaningful voluntary action here. Their attempted action fails or cannot progress unless it is limited permitted speech.`;
    }
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
        noHpDamage: injury?.NoHpDamage === 'Y',
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

function narrativeInjuryEntry({ target, source, condition, severity, wounds, status, effectType, noHpDamage = false, rule }) {
    const targetText = narratorTargetText(target);
    const sourceText = !isNoneText(source) ? ` from ${valueOrNone(source)}` : '';
    const conditionText = valueOrNone(condition);
    const severityText = valueOrNone(severity);
    const woundText = list(wounds);
    const statusText = list(status);
    if (noHpDamage) {
        const statusDetail = !isNoneText(statusText) ? ` status: ${statusText}.` : ' control/restraint applies only if established by attemptedActionResults.';
        return `${targetText} receives restraint/control only${sourceText}.${statusDetail} This is NOT HP damage, serious injury, unconsciousness, death, or a damaging attack. ${!isNoneText(rule) ? valueOrNone(rule) : ''}`.trim();
    }
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
    if (!active.length) return 'No additional existing NPC initiative is required beyond npcDispositionAndStyle and npcAggressionResult.';
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
        .replace(/\bAggression result\b/g, 'npcAggressionResult fact')
        .replace(/\baggression result\b/g, 'npcAggressionResult fact')
        .replace(/\bresolved attack\b/g, 'completed attack');
    const aggressive = isAggressiveProactivityIntent(intent);
    const forceLimit = aggressive
        ? (aggressionResults?.[name]
            ? ' Any completed force must match npcAggressionResult.'
            : ' This initiative does not authorize an NPC attack or completed force; obey npcAggressionResult.')
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
        ? ' Keep this fully compatible with the intimacy denial; do not turn it into consent, arousal, romantic/intimate relationship acceptance, or intimate escalation.'
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
    const nameList = value => value.length ? value.join(', ') : 'none';
    const femaleNames = (pool.female || []).map(name => String(name ?? '').trim()).filter(name => name && !isNoneText(name));
    const maleNames = (pool.male || []).map(name => String(name ?? '').trim()).filter(name => name && !isNoneText(name));
    const locationNames = (pool.location || []).map(name => String(name ?? '').trim()).filter(name => name && !isNoneText(name));
    return [
        'Name reveal is LOCKED and GATED.',
        '',
        'DO NOT output any new person, entity, or location name unless that name is explicitly revealed in the current scene through dialogue, self-introduction, direct address, readable text, signage, documents, or clear recognition supported by context.',
        '',
        'If a new name IS revealed, you MUST choose exactly one unused name from the appropriate pool below.',
        '',
        'DO NOT invent, modify, translate, combine, suffix, derive, surname, ignore, or replace these names. Any new name outside this list makes the response invalid.',
        '',
        `FEMALE: ${nameList(femaleNames)}.`,
        `MALE: ${nameList(maleNames)}.`,
        `LOCATION: ${nameList(locationNames)}.`,
        '',
        'If no name is revealed in-scene, leave the person, entity, or location unnamed.',
        'Do NOT name background, incidental, unseen, or merely described figures.',
        'Do NOT create a name reveal just because someone or somewhere appears.',
        'Already revealed names continue unchanged.',
    ].join('\n');
}

function narrativeProxyUserActionFact(options = {}) {
    if (options?.mode === 'proxy') {
        const action = narratorUserMacroText(options?.latestUserText || options?.proxyUserAction);
        return `Proxy action mode for {{user}} is active for this response only because the latest instruction used double square brackets. The human has asked narration to cover this exact action by {{user}}: ${action}. This is the only exception to normal agency separation. Do not add extra dialogue, thoughts, feelings, decisions, follow-up actions, reactions, silence, or choices for {{user}} beyond that instruction and the listed narrative facts.`;
    }
    const instructions = normalizeInlineProxyInstructions(options?.inlineProxyInstructions);
    if (!instructions.length) return '';
    const instructionText = instructions.map((instruction, index) => `${index + 1}. ${narratorUserMacroText(instruction)}`).join(' ');
    return `Inline proxy instructions from double square brackets are active for this response alongside the ordinary user input: ${instructionText}. Treat them as explicit {{user}}-declared action detail, intent, or conditional reaction text. Non-conditional instructions may be rendered only as declared {{user}} behavior compatible with the resolved scene facts. Conditional instructions resolve only if their condition actually occurs in this turn's narrative facts and the resolved mechanics support the action; otherwise show only preparation or readiness already supported by the visible input. Do not add extra dialogue, thoughts, feelings, decisions, follow-up actions, reactions, silence, or choices for {{user}} beyond the ordinary input, these inline instructions, and the listed narrative facts.`;
}

function normalizeInlineProxyInstructions(value) {
    if (!Array.isArray(value)) return [];
    return value
        .map(item => String(item ?? '').trim())
        .filter(Boolean)
        .slice(0, 5);
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
    const aware = list(resolution.NPCAwareOfUser);
    const powerActors = list(resolution.PowerActors);
    if (!isNoneText(hostiles)) parts.push(`hostiles:${hostiles}`);
    if (!isNoneText(actionTargets)) parts.push(`action:${actionTargets}`);
    if (!isNoneText(oppNpc)) parts.push(`opposes:${oppNpc}`);
    if (!isNoneText(oppEnv)) parts.push(`env:${oppEnv}`);
    if (!isNoneText(benefited)) parts.push(`benefits:${benefited}`);
    if (!isNoneText(harmed)) parts.push(`harms:${harmed}`);
    if (!isNoneText(aware)) parts.push(`aware:${aware}`);
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

function boundaryObjectSummary(value = {}) {
    if (!value || typeof value !== 'object') return 'none';
    const present = value.Present ?? value.present ?? 'N';
    const boundaryId = value.BoundaryId ?? value.boundaryId;
    const target = value.TargetNPC ?? value.targetNPC ?? '(none)';
    const type = value.Type ?? value.type ?? 'none';
    const response = value.Response ?? value.response;
    const objectOrAccess = value.ObjectOrAccess ?? value.objectOrAccess;
    const evidence = value.Evidence ?? value.evidence;
    return inline({
        Present: present,
        ...(boundaryId && boundaryId !== '(none)' ? { BoundaryId: boundaryId } : {}),
        TargetNPC: target,
        Type: type,
        ...(response ? { Response: response } : {}),
        ...(objectOrAccess ? { ObjectOrAccess: objectOrAccess } : {}),
        ...(evidence ? { Evidence: evidence } : {}),
    });
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
    if (text === 'usernonhuman') return 'userNonHuman';
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
    if (text === 'B4_ROMANTIC_CONTEXT') return 'the B4 close-bond scene has consistently built toward this romantic or intimate advance';
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

function generatedStatsSeedLine(seed) {
    if (!seed) return '{}';
    return inline({
        CapabilityPool: seed.CapabilityPool ?? 'none',
        MainStat: seed.MainStat ?? 'none',
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
