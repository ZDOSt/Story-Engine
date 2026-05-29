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
    const nameSemantic = ledger?.nameSemantic ?? {};
    const tracker = ledger?.trackerUpdateEngine ?? {};
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
        'identifyTargets:',
        'hostilesInScene.NPC=' + list(targets.hostilesInScene?.NPC),
        'ActionTargets=' + list(targets.ActionTargets),
        'OppTargets.NPC=' + list(oppTargets.NPC),
        'OppTargets.ENV=' + list(oppTargets.ENV),
        'BenefitedObservers=' + list(targets.BenefitedObservers),
        'HarmedObservers=' + list(targets.HarmedObservers),
        'intimacyAdvanceExplicit=' + String(Boolean(resolution.intimacyAdvanceExplicit)),
        'boundaryViolationExplicit=' + String(Boolean(resolution.boundaryViolationExplicit)),
        'hasStakes=' + String(Boolean(resolution.hasStakes)),
        'actionCount=' + list(resolution.actionCount),
        'mapStats=' + inline(resolution.mapStats ?? {}),
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
        'nameSemantic.selectedStyle=' + valueOrNone(nameSemantic.selectedStyle),
        'nameSemantic.maleCandidates=' + list(nameSemantic.maleCandidates),
        'nameSemantic.femaleCandidates=' + list(nameSemantic.femaleCandidates),
        'nameSemantic.locationCandidates=' + list(nameSemantic.locationCandidates),
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

    return [
        'resolutionPacket.GOAL=' + valueOrNone(resolution.GOAL),
        'resolutionPacket.intimacyAdvanceExplicit=' + valueOrNone(resolution.intimacyAdvanceExplicit),
        'resolutionPacket.boundaryViolationExplicit=' + valueOrNone(resolution.boundaryViolationExplicit),
        'resolutionPacket.nonLethal=' + valueOrNone(resolution.nonLethal),
        'resolutionPacket.STAKES=' + valueOrNone(resolution.STAKES),
        'resolutionPacket.actions=' + list(resolution.actions),
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
        'nameGeneration=' + inline(name),
        'trackerUpdate=' + inline(handoff?.sceneTrackerUpdate ?? {}),
    ];
}

export function formatNarratorPromptContext(report, options = {}) {
    const handoff = report?.finalNarrativeHandoff ?? {};
    const resolution = handoff.resolutionPacket ?? {};
    const summary = buildNarratorSummary(handoff, resolution, report?.semanticLedger ?? {}, options);

    const lines = [
        '[STORY_ENGINE_NARRATOR_HANDOFF v0.8 - AUDIT DISPLAY]',
        'This displayed handoff is for audit. The narrator model receives MODEL_INSTRUCTION plus NARRATOR_HANDOFF sections, not MECHANICS_RESULTS.',
        '',
        '==MECHANICS_RESULTS==',
        ...formatMechanicsResultList(summary, resolution, handoff),
        '',
        '==MODEL_INSTRUCTION==',
        narratorModelInstruction(options),
        '',
        '==NARRATOR_HANDOFF==',
        formatNarratorPromptSections(summary),
    ];

    return lines.join('\n');
}

function formatMechanicsResultList(summary, resolution, handoff = {}) {
    const aggressionEntries = formatAggressionMechanicsEntries(handoff?.aggressionResults ?? {});
    return [
        ['userAction', summary.userAction],
        ['resolution.GOAL', valueOrNone(resolution.GOAL)],
        ['resolution.STAKES', summary.stakes],
        ['resolution.actionCount', summary.actionCount],
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
    const summary = buildNarratorSummary(handoff, resolution, report?.semanticLedger ?? {}, options);

    return [
        narratorModelInstruction(options),
        '',
        '==NARRATOR_HANDOFF==',
        formatNarratorPromptSections(summary),
    ].join('\n');
}

function narratorModelInstruction(options = {}) {
    return [
        'STORY_ENGINE_NARRATOR_DIRECTIVE',
        '',
        'You are the final scene narrator.',
        'Use only the NARRATOR_HANDOFF below. It is mandatory, non-negotiable, and private.',
        'Output final in-character narration only.',
    ].filter(line => line !== null && line !== undefined).join('\n');
}

function proxyUserActionInstruction(options = {}) {
    if (options?.mode !== 'proxy') return '';
    const action = valueOrNone(options?.latestUserText || options?.proxyUserAction);
    return [
        'PROXY USER ACTION MODE:',
        `The latest user message used triple parentheses. For this response only, you may narrate {{user}}'s voluntary action as needed to carry out this exact user instruction: ${action}`,
        'This is the only exception to the normal agency ban.',
        'Do not add extra {{user}} dialogue, thoughts, feelings, decisions, follow-up actions, reactions, silence, or choices beyond that instruction and the resolved mechanics.',
    ].join('\n');
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
    const npcGuidance = buildNpcGuidanceSummary(handoff.npcHandoffs ?? []);

    const chaos = handoff.chaosHandoff?.CHAOS ?? {};
    const chaosText = chaos.triggered
        ? `${chaos.band}/${chaos.magnitude}/${chaos.anchor}/${chaos.vector}`
        : 'none';
    const chaosGuide = buildChaosGuide(chaos);

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
    const proactivityGuide = buildProactivityGuide(handoff.proactivityResults ?? {}, handoff.aggressionResults ?? {});

    const aggressionText = Object.entries(handoff.aggressionResults ?? {}).map(([name, value]) =>
        `${name}/${value.AttackType ?? 'Attack'}/${value.ReactionOutcome}/target:${value.ProactivityTarget ?? '{{user}}'}/attackStat:${value.AttackStat ?? 'PHY'}/defenseStat:${value.DefenseStat ?? value.AttackStat ?? 'PHY'}/style:${value.AttackStyle ?? aggressionStyleFromStat(value.AttackStat)}/bonus:${value.CounterBonus ?? 0}/margin:${value.Margin}/npcImpair:${npcImpairmentSummary(value.NPCImpairment)}/targetDefenseImpair:${userImpairmentSummary(value.TargetImpairment || value.UserImpairment)}`,
    ).join(';') || 'none';
    const aggressionGuide = aggressionText === 'none'
        ? buildNoAggressionGuide(resolution, handoff)
        : buildAggressionGuide(handoff.aggressionResults);
    const generatedName = nameGenerationSummary(handoff.nameGeneration);
    const userImpairment = userImpairmentSummary(resolution.UserImpairment);
    const npcImpairment = npcImpairmentSummary(resolution.NPCImpairment);
    const aggressionNpcInjury = inflictedAggressionNpcInjurySummary(handoff.aggressionResults ?? {});
    const inflictedNpcInjury = [inflictedNpcInjurySummary(resolution.InflictedInjuries), aggressionNpcInjury]
        .filter(item => item && item !== 'none')
        .join('; ') || 'none';
    const inflictedUserInjury = inflictedUserInjurySummary(handoff.aggressionResults ?? {});

    const result = naturalOutcomeSummary(resolution);
    const rollAudit = rollAuditFromResultLine(handoff.resultLine, resolution);
    const intimacyBoundary = intimacyBoundarySummary(handoff);
    const resolvedSceneFacts = cleanNarratorDirective(buildNaturalGuide({ userAction, resolution, handoff, npcText, proactiveText, proactivityGuide, chaosText, chaosGuide, aggressionText, aggressionGuide, userImpairment, npcImpairment, inflictedNpcInjury, inflictedUserInjury, options }));
    const narratorAuthority = buildNarratorAuthority({ resolution, handoff, options });
    const renderContract = buildRenderContract();
    const activeBranchFacts = buildActiveBranchFacts({
        userAction,
        resolution,
        handoff,
        result,
        rollAudit,
        intimacyBoundary,
        proactiveText,
        proactivityGuide,
        aggressionText,
        aggressionGuide,
        chaosText,
        chaosGuide,
        userImpairment,
        npcImpairment,
        inflictedNpcInjury,
        inflictedUserInjury,
    });
    const bindingDirective = formatNarratorPromptSections({ narratorAuthority, renderContract, activeBranchFacts, resolvedSceneFacts });

    return {
        userAction,
        decisiveAction: userAction,
        result,
        rollUsed: rollAudit.rollUsed,
        rollFull: rollAudit.rollFull,
        outcome: outcomeAuditLabel(resolution),
        margin: rollAudit.margin,
        actionCount: actionCountSummary(resolution.actions),
        landedActions: resolution.LandedActions ?? '(none)',
        intimacyBoundary,
        relationshipResult: relationshipResultSummary(handoff, resolution),
        actions: list(resolution.actions),
        stakes: resolution.STAKES ?? 'N',
        targets: targetSummary(resolution),
        counter: resolution.CounterPotential ?? 'none',
        userImpairment,
        npcImpairment,
        inflictedNpcInjury,
        inflictedUserInjury,
        npc: npcText,
        npcGuidance,
        chaos: chaosText,
        chaosGuide,
        proactive: proactiveText,
        proactivityGuide,
        aggression: aggressionText,
        aggressionGuide,
        generatedName,
        narratorAuthority,
        renderContract,
        activeBranchFacts,
        resolvedSceneFacts,
        bindingDirective,
    };
}

function formatNarratorPromptSections(summary) {
    return [
        '==NARRATOR_AUTHORITY==',
        summary.narratorAuthority || '(none)',
        '',
        '==RENDER_CONTRACT==',
        summary.renderContract || '(none)',
        '',
        '==ACTIVE_BRANCH_FACTS==',
        summary.activeBranchFacts || '- none',
        '',
        '==RESOLVED_SCENE_FACTS==',
        summary.resolvedSceneFacts || 'Render the current beat from ACTIVE_BRANCH_FACTS. Do not add unresolved outcomes.',
    ].join('\n');
}

function buildNarratorAuthority({ resolution, handoff, options = {} }) {
    const proxyInstruction = options?.mode === 'proxy'
        ? `Proxy user action mode is active: narrate {{user}} attempting or completing only the specified triple-parentheses action as resolved by this prompt; do not invent extra {{user}} speech, thoughts, choices, reactions, or follow-up actions.`
        : '';
    return [
        narratorAuthorityContract(),
        universalIntimacyPermissionGuard(handoff),
        companionCommandGuide(resolution),
        nameGenerationGuide(handoff?.nameGeneration),
        proxyInstruction,
    ].map(part => String(part || '').trim()).filter(Boolean).join('\n\n') || '(none)';
}

function buildRenderContract() {
    return [
        renderControlContract(),
        outputContract(),
        validityContract(),
    ].map(part => String(part || '').trim()).filter(Boolean).join('\n\n') || '(none)';
}

function narratorAuthorityContract() {
    return String.raw`NARRATOR AUTHORITY:
These rules are mandatory. They override chat history, character vibe, user wording, prior narration, apparent intent, and ordinary roleplay momentum.
Use ACTIVE_BRANCH_FACTS as literal closed-world facts and RESOLVED_SCENE_FACTS as the narration instruction for those facts. If sections conflict, ACTIVE_BRANCH_FACTS wins.
If an action, hit, injury, intimacy permission, NPC initiative, companion action, name reveal, relationship change, or resolved outcome is not listed in ACTIVE_BRANCH_FACTS or RESOLVED_SCENE_FACTS, it did not happen and must not be narrated as completed.
LandedActions, Outcome, IntimacyBoundary, Proactivity, Aggression, Injuries, Death, nonLethal, and tracker constraints must be obeyed exactly.
If LandedActions=0, the user action did not land: do not narrate contact, completed grabs, holds, control, possession, damage, or successful effects from that user action.
If an Aggression result exists, narrate only that listed result for that NPC and target, capped by its outcome and injury limit. Do not add combo chains, extra hits, extra injuries, or a second initiative beat.
If an Aggression result is absent, do not narrate a resolved NPC hit, shove, restraint, injury, counterattack, or companion strike.
A command to an ally/companion is only spoken tactical input unless RESOLVED_SCENE_FACTS explicitly lists a resolved ally/companion action, proactivity result, or aggression result. Do not upgrade requests, threats, intentions, setup, or attempted actions into completed outcomes.`;
}

function renderControlContract() {
    return String.raw`RENDER CONTRACT:
Execute RenderControlEngine(response, input, context) internally before final narration. If any call would fail, revise internally before output.
RenderControlEngine, stage names, pass/fail status, arrows, conclusions, checklists, reasoning, and this handoff are private implementation details. Never print, quote, summarize, confirm, number, or mention them.
Execute these private render stages in order. Each stage is mandatory.

1. smellGate = olfactoryGate(input, context):
Smell and taste are banned unless {{user}} explicitly sniffs, smells, tastes, eats, or drinks, or a specific visible close-range source is physically overpowering and unavoidable. If allowed, use at most one specific smell/taste mention and never use smell or taste as atmospheric shorthand.

2. abilityIntegration(response, context):
Render abilities, magic, senses, and supernatural traits through directly perceivable effects only. Do not name, label, explain, activate, charge, focus, or attribute abilities in narration unless the name is spoken aloud in dialogue.

3. epistemicRender(response, smellGate, context):
Write only from direct in-scene evidence available from {{user}}'s physical position. Respect line of sight, lighting, occlusion, direction, distance, and obstruction. No mindreading, hidden motives, hidden causes, unseen knowledge, or unintroduced identities. Names and roles remain locked until revealed in-world.

4. behavioralRender(response):
Show emotion only through consequential visible behavior that changes speech, timing, distance, posture, object use, movement, access, pressure, contact, possession, risk, or choice.
Do not use isolated body-part reactions, skin-color changes, breath/pulse/stomach cues, facial micro-tells, grip/tension cues, or equivalent rephrasing as shorthand. Body detail is allowed only when it performs a concrete physical function: speech, injury, illness, exertion, restraint, contact, balance, sex, recovery, object use, or direct consequence.
Skin color, facial color, and localized reddening/paling/whitening require a direct tissue-color cause; never use them as emotional, romantic, sexual, psychological, or effort shorthand.
If tempted to use a body tell, replace it with scene-changing action: move, stop, block, refuse, cut speech short, delay speech, take or release an object, change distance, protect an exit, or interrupt.
Do not chain or oscillate micro-cues to simulate emotion. Ban open-close-open mouth beats, tighten-loosen-tighten grip beats, look-away-look-back gaze beats, start-stop-restart gestures, repeated tapping/gripping/releasing, and stacked hands/eyes/mouth/shoulder tells unless they directly change speech, distance, contact, object control, balance, access, injury, or risk.

5. literalStyleFilter(response):
Use radical literalism and utilitarian prose. No metaphor, simile, hyperbole, idiom, ellipsis, personification, poetic framing, decorative sensual wording, vibe adjectives, emotional physics, or non-literal comparison. Adjectives must describe physical properties or materially relevant distinctions only.

6. sceneBeatComposition(response):
Prefer concrete, grounded, materially relevant physical detail. Combine related action, posture, object handling, dialogue, and consequence into cohesive scene beats. Each sentence should advance position, contact, force, timing, spacing, object state, visibility, sound, pressure, consequence, dialogue, or choice.
Dialogue delivery may describe lowered voice, trembling, roughness, pace, interruption, or strain when physically grounded. Ban only stock quietness shorthand or equivalents such as "barely above a whisper," "just above a whisper," "almost a whisper," "low murmur," "soft murmur," or "a thread of sound" when used as tropey emotional shorthand.
Prefer one consequential physical choice plus dialogue over several isolated body cues. Ban micro-reaction loops, twitch-cadence narration, and body-cue pileups where repeated small gestures substitute for one meaningful beat.

7. chronologyControl(response, input, context):
Begin at T+1 from {{user}} input with external consequence, NPC response, environmental change, revealed information, or new stimulus. Treat declared {{user}} actions as already complete unless ACTIVE_BRANCH_FACTS says they failed, stalled, or were interrupted. Do not echo, restage, re-perform, summarize, paraphrase, narrate the declared action back to {{user}}, use opening recap transitions, or use "as you" phrasing.

8. userAgencyControl(response, input, context):
Never write {{user}} speech, thoughts, feelings, reactions, silence, decisions, choices, or voluntary actions unless PROXY USER ACTION MODE allows the exact action. Involuntary physical reactions caused by external stimulus may be narrated when concrete and proportional. Voluntary actions are never involuntary reactions. Do not make {{user}} take, open, unfold, read, inspect, answer, follow, accept, refuse, speak, nod, look, move, or otherwise act on an object, note, door, route, NPC, or stimulus. If an NPC gives, returns, drops, slides, or places an object or note for {{user}}, stop with it delivered, available, visible, or within reach.
If PROXY USER ACTION MODE is active, narrate only the exact specified {{user}} action for that turn, then return to normal agency separation.

9. turnStructureControl(response, context):
Keep NPC beats compact and cohesive. Allow at most 1 inter-NPC exchange and at most 3 sentences per monologue. Never answer a question directed at {{user}}. Keep same-speaker action and dialogue together when they belong to one beat. Ban pingpong structure, same-speaker fragmentation, isolated speech balloons, and answering for {{user}}.

10. responseEndpointControl(response, context):
End where the scene naturally returns control to {{user}}, not where narration prompts or pressures {{user}} to act. Before writing, choose the natural user-centered response beat: the point where the immediate consequence, NPC response, revealed information, available object, changed access, danger, or environmental condition is clear enough for {{user}} to choose what to do next.
If an NPC speaks or acts toward {{user}}, end on that speech or action once it creates a natural point for {{user}} to answer, refuse, inspect, interrupt, defend against, follow, ignore, or act. If no NPC is driving the beat, end on the relevant consequence of {{user}}'s action, a visible scene change, an available object or path, a new obstruction, a hazard, or a concrete environmental stimulus.
Do not invent a question, threat, gesture, stare, pause, silence, or waiting beat just to create an endpoint. Never end by prompting {{user}} to act. HARD STOP: after the response beat, output nothing else. Ban explicit waiting, "she waits," "awaits your response," "what do you do," "the choice is yours," all-eyes-on-user framing, mood-only silence, unrelated ambience, outro paragraphs, scene-break tails, and extra narration after the response beat.`;
}

function outputContract() {
    return String.raw`OUTPUT CONTRACT:
The first non-whitespace token of the response must be BEGIN_FINAL_NARRATION.
The last non-whitespace token of the response must be END_FINAL_NARRATION.
Everything outside those two tags is forbidden and will be discarded.
Inside those tags, output only final in-character narration.
Do not output mechanics, labels, analysis, bullets, preamble, audit text, or any part of the narrator handoff.
Do not output pre-flight checks, checklists, stage names, function names, RenderControlEngine, reasoning, scratchpad, draft narration, <think> tags, planning text, copied directive text, validation notes, or conclusions.
Do not narrate voluntary {{user}} actions, thoughts, feelings, decisions, counterattacks, or dialogue. In ordinary mode, the latest user input is already complete; narrate only consequences, results, interruptions, revealed information, NPC actions, environmental changes, or available response points. Only PROXY USER ACTION MODE may narrate the exact specified {{user}} action.
Do not output tracker updates, tracker blocks, XML, JSON, markdown fences, hidden metadata, or post-generation bookkeeping.`;
}

function validityContract() {
    return String.raw`VALIDITY CONTRACT:
Every authority rule, render rule, and active branch fact is mandatory.
A single violation invalidates the response.
Invalid responses must not be output.
Final narration may only be emitted after NARRATOR_AUTHORITY, RENDER_CONTRACT, ACTIVE_BRANCH_FACTS, and RESOLVED_SCENE_FACTS are all satisfied.`;
}

function buildActiveBranchFacts({ userAction, resolution, handoff, result, rollAudit, intimacyBoundary, proactiveText, proactivityGuide, aggressionText, aggressionGuide, chaosText, chaosGuide, userImpairment, npcImpairment, inflictedNpcInjury, inflictedUserInjury }) {
    const facts = [];
    facts.push(`User action: ${valueOrNone(userAction)}.`);
    if (resolution?.STAKES === 'N' || resolution?.Outcome === 'no_roll') {
        facts.push('Resolution branch: no roll; ordinary scene continuity unless another active branch constrains it.');
    } else {
        facts.push(`Resolution branch: ${valueOrNone(resolution?.OutcomeTier)} / ${valueOrNone(resolution?.Outcome)}; ${valueOrNone(result)}.`);
        if (!isNoneText(rollAudit?.rollFull)) facts.push(`Roll: ${rollAudit.rollFull}.`);
    }
    if (!isNoneText(resolution?.nonLethal)) facts.push(`Nonlethal flag: ${resolution.nonLethal}.`);
    if (!isNoneText(resolution?.LandedActions)) {
        facts.push(`Landed actions: ${resolution.LandedActions}.`);
        if (Number(resolution.LandedActions) <= 0) {
            facts.push('Zero-land branch: the user action does not complete, connect, grab, hold, control, or create successful contact/effect. Do not narrate the attempted action as already landed.');
        }
    }
    if (resolution?.classifyPhysicalBoundaryPressure === 'Y') facts.push('Boundary branch: physical boundary pressure is active; render resistance, space, access, refusal, or guarded movement, not combat unless another branch resolves combat.');
    if (resolution?.boundaryViolationExplicit === 'Y') facts.push('Boundary violation branch: explicit pressure past refusal/boundary is active.');
    if (!isNoneText(intimacyBoundary)) {
        facts.push(`Intimacy branch: ${intimacyBoundary}.`);
        if (hasLandedPhysicalResult(resolution) && /\bDENY\b/.test(String(intimacyBoundary))) {
            facts.push('Branch interaction: the physical result landed, but intimacy permission is denied; do not erase the landed physical result, and do not narrate reciprocation or further intimate escalation.');
        }
    }
    if (!isNoneText(proactiveText)) facts.push(`Proactivity branch: ${valueOrNone(proactivityGuide)}.`);
    if (!isNoneText(aggressionText)) {
        facts.push(`Aggression branch: ${aggressionText}.`);
    } else if (!isNoneText(aggressionGuide)) {
        facts.push(`Aggression absence guard: ${aggressionGuide}`);
    }
    if (!isNoneText(chaosText)) facts.push(`Chaos branch: ${valueOrNone(chaosGuide)}.`);
    if (!isNoneText(userImpairment)) facts.push(`User impairment: ${userImpairment}.`);
    if (!isNoneText(npcImpairment)) facts.push(`NPC impairment: ${npcImpairment}.`);
    if (!isNoneText(inflictedNpcInjury)) facts.push(`NPC injury/death branch: ${inflictedNpcInjury}.`);
    if (!isNoneText(inflictedUserInjury)) facts.push(`User injury branch: ${inflictedUserInjury}.`);
    if (resolution?.CompanionCommand?.Mode === 'REQUEST_ONLY') facts.push(`Companion command branch: request-only command to ${list(resolution.CompanionCommand.NPCs)}; no obedience or companion hit is resolved unless proactivity/aggression says so.`);
    const namePoolFact = closedWorldNamePoolFact(handoff?.nameGeneration);
    if (namePoolFact) facts.push(namePoolFact);
    return facts.map(fact => `- ${fact}`).join('\n') || '- none';
}

function closedWorldNamePoolFact(nameGeneration) {
    const pool = nameGeneration?.namePool;
    if (!pool) return '';
    const personNames = [...(pool.male || []), ...(pool.female || [])]
        .map(name => String(name ?? '').trim())
        .filter(name => name && !isNoneText(name));
    const locationNames = (pool.location || [])
        .map(name => String(name ?? '').trim())
        .filter(name => name && !isNoneText(name));
    return `Name branch: approved generated name pool is mandatory and closed-world. Person/entity names allowed for newly revealed people/entities: ${list(personNames)}. Location/place names allowed for newly revealed places: ${list(locationNames)}. If a new proper name is revealed this turn, it must be one unused name from the matching approved pool. Do not invent, modify, translate, combine, suffix, add surnames to, or derive names from existing character/user names. Do not use rejected semantic candidates. If no appropriate unused approved name exists, keep the person/place unnamed or use a role/description.`;
}

function hasLandedPhysicalResult(resolution) {
    const landed = Number(resolution?.LandedActions ?? 0);
    if (Number.isFinite(landed) && landed > 0) return true;
    return ['success', 'light_impact', 'solid_impact', 'dominant_impact'].includes(String(resolution?.Outcome ?? ''));
}

function rollAuditFromResultLine(resultLine, resolution) {
    if (resolution?.STAKES === 'N') return { rollUsed: 'none', rollFull: 'none', margin: 'none' };
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
    if (resolution?.STAKES === 'N' || resolution?.Outcome === 'no_roll') return 'No Roll';
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

function buildNpcGuidanceSummary(npcHandoffs) {
    const npcs = Array.isArray(npcHandoffs) ? npcHandoffs : [];
    if (!npcs.length) return 'none';
    return npcs.map(npc => `${valueOrNone(npc.NPC)}: ${relationshipNarrationGuide(npc)}`).join(' ');
}

function relationshipNarrationGuide(npc) {
    const behavior = behaviorNarrationGuide(npc?.Behavior);
    const target = relationshipTargetNarrationGuide(npc?.Target);
    const personality = npc?.PersonalitySummary && !isNoneText(npc.PersonalitySummary)
        ? ` Use this stable personality note as expression guidance, not a hard script: ${npc.PersonalitySummary}. It may shape speech style, posture, refusal style, affection style, pressure, and initiative flavor, but it never overrides mechanics, rolls, intimacy boundaries, consent, injury, proactivity, hostility, or resolved outcomes.`
        : '';
    const boundary = npc?.BoundaryPressure === 'Y'
        ? ' Respect active boundary pressure through space, refusal, guarded movement, or physical protection.'
        : '';
    return `${behavior} ${target}${personality}${boundary}`.trim();
}

function cleanNarratorDirective(text) {
    return String(text ?? '')
        .replace(/\s+/g, ' ')
        .replace(/\s+\./g, '.')
        .replace(/\.{2,}/g, '.')
        .replace(/\s+,/g, ',')
        .trim();
}

function behaviorNarrationGuide(behavior) {
    switch (behavior) {
        case 'TERROR':
            return 'The NPC is terrified or panicked; prioritize flight, freezing, surrender, pleading, or desperate self-protection.';
        case 'HATRED':
            return 'The NPC is openly hostile; allow obstruction, threats, attack preparation, refusal, sabotage, or escalation when the scene supports it.';
        case 'FREEZE':
            return 'The NPC is guarded, tense, wary, hesitant, submissive, avoidant, or frozen by fear/hostility; keep reactions restrained or protective.';
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

function relationshipTargetNarrationGuide(target) {
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
            return 'Do not change the relationship state in this beat.';
        default:
            return 'Apply the listed relationship change only as natural scene behavior.';
    }
}

function buildChaosGuide(chaos) {
    if (!chaos?.triggered) return 'none';
    const band = chaosBandGuide(chaos.band);
    const magnitude = chaosMagnitudeGuide(chaos.magnitude);
    const anchor = chaosAnchorGuide(chaos.anchor);
    const vector = chaosVectorGuide(chaos.vector);
    return `Add a brief unexpected scene beat: ${band} ${magnitude} Anchor it to ${anchor}. Its source should be ${vector}. Choose the concrete implementation freely in scene prose, but do not override the main outcome, consent limits, attacks, injuries, or relationship results, and do not invent extra mechanics.`;
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
            return "the user's current goal or action";
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
    const candidates = nameGeneration.semanticCandidates
        ? `; semanticCandidates: ${namePoolText(nameGeneration.semanticCandidates)}`
        : '';
    const replacements = Array.isArray(nameGeneration.replacements) && nameGeneration.replacements.length
        ? `; replacements: ${nameGeneration.replacements.map(item => `${valueOrNone(item.bucket)}:${valueOrNone(item.name)}`).join(',')}`
        : '; replacements: none';
    const rejected = Array.isArray(nameGeneration.semanticRejected) && nameGeneration.semanticRejected.length
        ? `; rejected: ${nameGeneration.semanticRejected.map(item => `${valueOrNone(item.bucket)}:${valueOrNone(item.name)}(${valueOrNone(item.reason)})`).join(',')}`
        : '; rejected: none';
    return style !== '(none)'
        ? `style: ${style}${candidates}${rejected}${replacements}; final: ${namePoolText(nameGeneration.namePool)}`
        : `${namePoolText(nameGeneration.namePool)}${candidates}${rejected}${replacements}`;
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
    if (!isNoneText(hostiles)) parts.push(`hostiles:${hostiles}`);
    if (!isNoneText(actionTargets)) parts.push(`action:${actionTargets}`);
    if (!isNoneText(oppNpc)) parts.push(`opposes:${oppNpc}`);
    if (!isNoneText(oppEnv)) parts.push(`env:${oppEnv}`);
    if (!isNoneText(benefited)) parts.push(`benefits:${benefited}`);
    if (!isNoneText(harmed)) parts.push(`harms:${harmed}`);
    return parts.join('; ') || 'none';
}

function buildNaturalGuide({ userAction, resolution, handoff, npcText, proactiveText, proactivityGuide, chaosText, chaosGuide, aggressionText, aggressionGuide, userImpairment, npcImpairment, options = {} }) {
    const outcome = naturalOutcomeSummary(resolution);
    const partialActionInstruction = partialActionGuide(resolution);
    const primaryNpc = primaryNarrationNpc(handoff, resolution);
    const npcName = primaryNpc?.NPC || list(resolution.ActionTargets) || 'the NPC';
    const npcGuide = primaryNpc ? relationshipNarrationGuide(primaryNpc) : `Use the listed NPC state naturally: ${npcText}.`;
    const intimacyBoundaryGuide = buildIntimacyBoundaryGuide(resolution, handoff);
    const chaosNote = chaosText !== 'none' ? ` ${chaosGuide}` : '';
    const aggressionNote = aggressionText !== 'none'
        ? ` ${aggressionGuide}`
        : '';
    const compatibleProactivityGuide = buildBoundaryCompatibleProactivityGuide(handoff.proactivityResults ?? {}, handoff.aggressionResults ?? {}, handoff);
    const naturalProactiveNote = compatibleProactivityGuide !== 'none' && aggressionText === 'none'
        ? ` In the same beat, include this NPC initiative: ${compatibleProactivityGuide} Render it naturally through personality, visible behavior, speech, and setting. If no attack result is listed, do not invent a resolved NPC hit.`
        : '';
    const boundaryNote = resolution.classifyPhysicalBoundaryPressure === 'Y'
        ? ' Treat this as physical boundary pressure, not combat: narrate contested possession, space, access, refusal, anger, or resistance without inventing a landed attack.'
        : '';
    const boundaryViolationNote = resolution.boundaryViolationExplicit === 'Y'
        ? ` This is an explicit boundary violation or pressure past refusal; narrate refusal, guardedness, resistance, withdrawal, anger, fear, call for help, or escalation as fits this behavior: ${npcGuide}`
        : '';
    const impairmentInstruction = userImpairmentGuide(resolution.UserImpairment, userImpairment);
    const npcImpairmentInstruction = npcImpairmentGuide(resolution.NPCImpairment, npcImpairment);
    const inflictedNpcInstruction = inflictedNpcInjuryGuide(resolution.InflictedInjuries);
    const inflictedUserInstruction = inflictedUserInjuryGuide(handoff.aggressionResults);
    const inflictedAggressionNpcInstruction = inflictedAggressionNpcInjuryGuide(handoff.aggressionResults);
    const injuryInstruction = `${inflictedNpcInstruction}${inflictedUserInstruction}${inflictedAggressionNpcInstruction}`;
    const aggressionTargetLock = aggressionTargetLockGuide(handoff.aggressionResults);
    const companionCommandInstruction = companionCommandGuide(resolution);

    const commonResultInstruction = `${companionCommandInstruction}${partialActionInstruction}${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction}`;
    const stackedPressureInstruction = [
        boundaryViolationNote,
        boundaryNote,
        intimacyBoundaryGuide.text ? ` ${intimacyBoundaryGuide.text}` : '',
        naturalProactiveNote,
        chaosNote,
    ].join('');

    if (aggressionText !== 'none') {
        return `The user action is ${userAction}; resolve it as ${outcome}.${commonResultInstruction}${aggressionTargetLock} ${aggressionGuide}${stackedPressureInstruction} Do not invent any user follow-up.`;
    }

    if (intimacyBoundaryGuide.mode === 'DENY' && resolution.boundaryViolationExplicit !== 'Y') {
        return `The user action is ${userAction}; ${deniedIntimacyResolutionPhrase(resolution)}.${companionCommandInstruction} ${intimacyBoundaryGuide.text}${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction}${naturalProactiveNote}${chaosNote}`;
    }

    if (proactiveText !== 'none') {
        return `The user action is ${userAction}; resolve it as ${outcome}.${commonResultInstruction}${stackedPressureInstruction}`;
    }

    if (resolution.boundaryViolationExplicit === 'Y') {
        return `The user action is ${userAction}; resolve it as ${outcome}.${companionCommandInstruction}${partialActionInstruction}${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction}${boundaryViolationNote}${aggressionNote}${chaosNote}`;
    }

    if (resolution.STAKES === 'N') {
        const chaosNote = chaosText !== 'none' ? ` ${chaosGuide}` : '';
        if (intimacyBoundaryGuide.mode === 'ALLOW') {
            return `The user action is ${userAction}; no roll is needed.${companionCommandInstruction} ${intimacyBoundaryGuide.text}${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction}${chaosNote}`;
        }
        return `The user action is ${userAction}; no roll is needed.${companionCommandInstruction}${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction} Keep ${npcName}'s response aligned with this behavior: ${npcGuide} Do not invent hostility, refusal, or extra mechanics unless a boundary is actually violated or the NPC state supports it${chaosNote}.`;
    }

    if (resolution.classifyPhysicalBoundaryPressure === 'Y') {
        return `The user action is ${userAction}; resolve it as ${outcome}.${companionCommandInstruction}${partialActionInstruction}${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction} Treat this as physical boundary pressure, not combat: narrate contested possession, space, access, refusal, anger, or resistance with this behavior: ${npcGuide} Do not invent a landed attack.${chaosNote}`;
    }

    if (chaosText !== 'none') {
        return `The user action is ${userAction}; resolve it as ${outcome}.${companionCommandInstruction}${partialActionInstruction}${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction}${boundaryNote} Keep NPC behavior anchored to this guidance: ${npcGuide}. ${chaosGuide}`;
    }

    return `The user action is ${userAction}; resolve it as ${outcome}.${companionCommandInstruction}${partialActionInstruction}${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction}${boundaryNote} Narrate the NPC response with this behavior: ${npcGuide} Keep targets limited to the named scene targets.`;
}

function deniedIntimacyResolutionPhrase(resolution) {
    if (hasLandedPhysicalResult(resolution)) {
        return `resolve the physical result as ${naturalOutcomeSummary(resolution)}, then apply the intimacy denial after the landed contact/result`;
    }
    if (resolution?.STAKES === 'N' || resolution?.Outcome === 'no_roll') return 'no roll is needed';
    return `resolve it as ${naturalOutcomeSummary(resolution)}, then apply the intimacy denial`;
}

function universalIntimacyPermissionGuard(handoff = {}) {
    const npcs = Array.isArray(handoff?.npcHandoffs) ? handoff.npcHandoffs : [];
    const guarded = npcs.filter(npc => !isIntimacyAllowedForNarration(npc));
    if (!guarded.length) return '';

    const names = guarded.map(npc => valueOrNone(npc.NPC)).filter(name => !isNoneText(name)).join(', ') || 'any NPC without active permission';
    const allowed = npcs.filter(isIntimacyAllowedForNarration)
        .map(npc => `${valueOrNone(npc.NPC)} (${intimacyBoundarySourceText(npc.IntimacyBoundarySource)})`)
        .filter(text => !isNoneText(text));
    const allowedScope = allowed.length
        ? ` Active intimacy permission applies only to ${allowed.join(', ')}; it does not transfer to ${names}.`
        : '';

    return ` Universal intimacy guard: no intimacy permission is active for ${names}.${allowedScope} Romantic, flirtatious, affectionate, or suggestive conversation may continue naturally according to context and personality, but conversation alone is not permission for intimate escalation. Unless IntimacyBoundary explicitly permits it for that exact NPC, do not have ${names} initiate, invite, imply, accept, or maneuver toward kissing, sex, undressing, bra or panties display, sexual exposure, offering or showing their body, bed, an inn room, a private room, sexual touching, secluded intimacy, arousal/compliance framing, consent-by-momentum, or relationship acceptance.`;
}

function isIntimacyAllowedForNarration(npc) {
    const source = String(npc?.IntimacyBoundarySource ?? '');
    return npc?.IntimacyBoundary === 'ALLOW'
        && (['ESTABLISHED_RELATIONSHIP', 'NPC_INITIATED'].includes(source) || source.startsWith('OVERRIDE:'));
}

function companionCommandGuide(resolution) {
    const command = resolution?.CompanionCommand;
    if (!command || command.Mode !== 'REQUEST_ONLY') return '';
    const npcs = list(command.NPCs);
    const commands = Array.isArray(command.Commands) && command.Commands.length
        ? ` Command text: ${command.Commands.map(item => `"${item}"`).join('; ')}.`
        : '';
    return ` Treat the addressed companion command as spoken tactical input only, not as a resolved companion action and not as obedience.${commands} ${npcs} may respond autonomously according to listed proactivity/aggression only. If no proactivity or aggression result lists a companion attack, do not narrate the companion striking, pinning, disabling, injuring, killing, or successfully controlling a target.`;
}

function partialActionGuide(resolution) {
    const landed = Number(resolution?.LandedActions ?? 0);
    const actionCount = Array.isArray(resolution?.actions) ? resolution.actions.length : 0;
    if (!Number.isFinite(landed) || !actionCount || landed >= actionCount) return '';
    if (landed <= 0) return ` None of the attempted actions land; do not narrate any user hit, injury, successful contact, completed grab, hold, control, possession, squeeze, intimate touch, or completed effect unless another mechanic explicitly says so. If the attempt is a grab or touch, stop it before the user achieves contact or control.`;
    return ` Only ${landed} of ${actionCount} attempted action${actionCount === 1 ? '' : 's'} lands; narrate only the listed persistent injury/result as concrete impact, and have the remaining attempted actions miss, get checked, glance off, fail to connect, or be otherwise limited by the outcome.`;
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

function buildIntimacyBoundaryGuide(resolution, handoff) {
    if (resolution?.intimacyAdvanceExplicit !== 'Y') return { mode: 'SKIP', text: '' };
    const npcs = Array.isArray(handoff?.npcHandoffs) ? handoff.npcHandoffs : [];
    const targets = npcs.filter(npc => npc?.IntimacyBoundary && npc.IntimacyBoundary !== 'SKIP');
    if (!targets.length) return { mode: 'SKIP', text: '' };
    const hasDeny = targets.some(npc => npc.IntimacyBoundary === 'DENY');
    return {
        mode: hasDeny ? 'DENY' : 'ALLOW',
        text: targets.map(intimacyBoundaryText).join(' '),
    };
}

function intimacyBoundaryText(target) {
    const npcName = valueOrNone(target.NPC);
    const npcGuide = relationshipNarrationGuide(target);
    if (target.IntimacyBoundary === 'ALLOW') {
        return `Intimacy is permitted for ${npcName} because ${intimacyBoundarySourceText(target.IntimacyBoundarySource)}; narrate the NPC response naturally according to context, privacy, safety, mood, and personality. Do not reverse, withdraw, panic, or stop at the moment of follow-through unless new danger, interruption, explicit withdrawal, or established characterization makes that reversal concrete in-scene. Do not force explicit intimacy if the scene makes it implausible. Keep ${npcName}'s behavior aligned with: ${npcGuide}`;
    }
    if (target.IntimacyBoundary === 'DENY') {
        return `Intimacy is not permitted for ${npcName}. Render the denial as a real boundary, not coyness, teasing, hesitation, or a conditional delay. Include a clear refusal and an active boundary action: moving hands away, blocking contact, covering or protecting the touched area, stepping back, creating distance, or otherwise stopping the intimate advance. If the attempted intimacy is physical, the boundary must be physical. Do not phrase the refusal as "not here", "not now", "later", "somewhere private", or any equivalent that implies intimacy would be accepted under different timing, privacy, location, or mood unless IntimacyBoundary is ALLOW. Do not narrate reciprocation, compliance, arousal, escalating intimacy, or a successful intimate result. This denial alone is not a dice roll or relationship penalty, but it is an explicit boundary for later turns. Tune the refusal as ${intimacyRefusalGuide(target)} Keep ${npcName}'s behavior aligned with: ${npcGuide}`;
    }
    return '';
}

function intimacyBoundarySourceText(source) {
    const text = String(source ?? 'NONE');
    if (text === 'ESTABLISHED_RELATIONSHIP') return 'an established relationship exists';
    if (text === 'NPC_INITIATED') return 'the NPC initiated or invited this intimacy and {{user}} is accepting';
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

function nameGenerationGuide(nameGeneration) {
    if (!nameGeneration?.namePool) return '';
    return ` Name pool use is mandatory and obeys fogOfWar(). Already revealed names from chat, character card, lore, or tracker may continue unchanged. Any newly revealed proper name in this response must come only from the approved generated name pool in ACTIVE_BRANCH_FACTS. A new name may appear only after the scene has explicitly revealed that specific person, entity, or place through speech, readable text, self-introduction, direct in-world reference, signage, documents, or clear recognition. Once revealed, use one unused approved person/entity name for that already-identified person/entity, or one unused approved location/place name for that already-identified place. Do not invent, modify, translate, combine, suffix, add surnames to, or derive names from existing character/user names. Do not use rejected semantic candidates. Do not assign names to background, incidental, or unnamed figures, and do not introduce a name as an appositive unless the scene has already revealed it first. If no such reveal occurred, or no appropriate unused approved name exists, keep the character or place unnamed or use a role/description.`;
}

function namePoolText(pool = {}) {
    return `male: ${list(pool.male)}; female: ${list(pool.female)}; location: ${list(pool.location)}`;
}

function userImpairmentGuide(impairment, summaryText) {
    if (!impairment || impairment.Relevant !== 'Y') return '';
    const applied = impairment.AppliedToRoll === 'Y'
        ? ` A ${impairment.Stage} user impairment penalty (${Number(impairment.RollPenalty ?? 0)}) has already been applied to the roll.`
        : ` A ${impairment.Stage} user impairment is relevant even though no roll penalty was applied.`;
    return `${applied} The user may still attempt the action; do not forbid the attempt. Narrate ${valueOrNone(impairment.Source)} affecting ${humanizeImpairmentFunctions(impairment.MatchedActionFunction || impairment.AffectedFunction)} through pain, limitation, compensation, instability, reduced speed, partial execution, or cost according to the computed outcome.`;
}

function npcImpairmentGuide(impairment, summaryText) {
    if (!impairment || impairment.Relevant !== 'Y') return '';
    const applied = impairment.AppliedToRoll === 'Y'
        ? ` A ${impairment.Stage} impairment penalty (${Number(impairment.RollPenalty ?? 0)}) has already been applied to ${valueOrNone(impairment.NPC)}'s roll.`
        : ` A ${impairment.Stage} impairment is relevant to ${valueOrNone(impairment.NPC)} even though no roll penalty was applied.`;
    return `${applied} ${valueOrNone(impairment.NPC)} may still act; narrate ${valueOrNone(impairment.Source)} affecting ${humanizeImpairmentFunctions(impairment.MatchedActionFunction || impairment.AffectedFunction)} through pain, limitation, compensation, instability, reduced speed, partial execution, or cost according to the computed outcome.`;
}

function inflictedNpcInjuryGuide(injuries) {
    if (!Array.isArray(injuries) || !injuries.length) return '';
    return ' ' + injuries.map(injury =>
        injury?.condition === 'dead'
            ? `${valueOrNone(injury.NPC)} receives dead condition. This is a deterministic fatal outcome from the landed user attack. The target is dead; narrate explicit death in the final prose so the post-narration tracker can record dead. ${valueOrNone(injury.NarrationRule)}`
            : `${valueOrNone(injury.NPC)} receives ${valueOrNone(injury.condition)} condition${injuryDetailPhrase(injury)}. This injury or status is mechanically persistent; narrate it as the concrete lasting result of the landed user action/effect, with severity limiting later offense, defense, movement, focus, or other affected actions. ${valueOrNone(injury.NarrationRule)}`,
    ).join(' ');
}

function inflictedUserInjuryGuide(aggressionResults) {
    const injuries = Object.entries(aggressionResults ?? {})
        .map(([name, value]) => ({ name, injury: value?.InflictedUserInjury || (value?.InflictedTargetInjury?.targetType === 'user' ? value.InflictedTargetInjury : null) }))
        .filter(item => item.injury);
    if (!injuries.length) return '';
    return ' ' + injuries.map(({ name, injury }) =>
        `The user receives ${valueOrNone(injury.condition)} condition from ${valueOrNone(name)}${injuryDetailPhrase(injury)}. This injury is mechanically persistent; choose one concrete wound and affected body area from the NPC attack context, but do not exceed ${valueOrNone(injury.severity)} severity.${minorUserInjuryLimit(injury)} Describe the injury as an external physical fact; do not narrate {{user}}'s reaction, recovery, choices, thoughts, speech, staggering, gasping, folding, or follow-up movement.`,
    ).join(' ');
}

function minorUserInjuryLimit(injury) {
    const condition = String(injury?.condition ?? '').toLowerCase();
    const severity = String(injury?.severity ?? injury?.InjurySeverityLimit ?? '').toLowerCase();
    if (condition !== 'bruised' && severity !== 'minor') return '';
    return ' Minor/bruised means one proportional minor impact or bruise only: do not add bleeding, cuts, raked skin, broken bones, breath loss, being winded, incapacitation, restraint, or multiple landed strikes.';
}

function inflictedAggressionNpcInjuryGuide(aggressionResults) {
    const injuries = Object.entries(aggressionResults ?? {})
        .map(([name, value]) => ({ name, injury: value?.InflictedTargetInjury }))
        .filter(item => item.injury?.targetType === 'npc');
    if (!injuries.length) return '';
    return ' ' + injuries.map(({ name, injury }) =>
        `${valueOrNone(injury.target)} receives ${valueOrNone(injury.condition)} condition from ${valueOrNone(name)}${injuryDetailPhrase(injury)}. This injury is mechanically persistent; choose the concrete wound and affected body area from the NPC attack context, but do not exceed ${valueOrNone(injury.severity)} severity. Let that narrated injury limit later offense, defense, movement, focus, or other affected actions according to severity.`,
    ).join(' ');
}

function aggressionTargetLockGuide(aggressionResults) {
    const entries = Object.entries(aggressionResults ?? {})
        .filter(([, value]) => value?.InflictedTargetInjury?.targetType === 'npc' || value?.AttackType === 'CompanionAttack');
    if (!entries.length) return '';
    const parts = entries.map(([name, value]) => {
        const target = valueOrNone(value?.ProactivityTarget || value?.InflictedTargetInjury?.target);
        if (isNoneText(target)) return '';
        return `${valueOrNone(name)}'s only resolved attack target this beat is ${target}; do not narrate ${valueOrNone(name)} landing a hit, injury, disable, or resolved attack against any other target unless that target has its own listed Aggression result.`;
    }).filter(Boolean);
    return parts.length ? ` ${parts.join(' ')}` : '';
}

function injuryDetailPhrase(injury) {
    const details = [list(injury?.woundsAdd), list(injury?.statusAdd)]
        .filter(item => !isNoneText(item));
    return details.length ? ` with ${details.join(' and ')}` : '';
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
    if (resolution?.STAKES === 'N' || tier === 'NONE' || outcome === 'no_roll') return 'no roll; ordinary scene continuity';
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

function buildBoundaryCompatibleProactivityGuide(proactivity, aggressionResults = {}, handoff = {}) {
    const active = Object.entries(proactivity ?? {}).filter(([, value]) => value?.Proactive === 'Y');
    if (!active.length) return 'none';
    const denied = new Set((handoff.npcHandoffs ?? [])
        .filter(npc => npc?.IntimacyBoundary === 'DENY')
        .map(npc => String(npc.NPC ?? '').toLowerCase()));
    const parts = [];
    for (const [name, value] of active) {
        const intent = proactivityNarrationIntent(value);
        const target = value?.ProactivityTarget && value.ProactivityTarget !== '(none)'
            ? value.ProactivityTarget
            : '{{user}}';
        const deniedForNpc = denied.has(String(name ?? '').toLowerCase());
        const compatibleDescription = deniedForNpc
            ? deniedIntimacyCompatibleProactivityDescription(name, intent, target)
            : null;
        if (compatibleDescription === '') continue;
        const description = compatibleDescription || personalizeNpcInstruction(name, proactivityIntentDescription(intent, target));
        const noAttack = isAggressiveProactivityIntent(intent)
            ? (aggressionResults?.[name]
                ? ' Use the listed attack result for any resolved hit.'
                : ' Show only intent, pressure, motion, preparation, or interruption; no resolved hit occurs.')
            : ' This is not a resolved attack.';
        const relationshipLimit = isRomanceInitiativeIntent(intent)
            ? ' Use only if the current beat is calm and no other event is happening; never force gifts, dates, confessions, or romantic escalation into combat, crisis, mourning, active intimacy, public pressure, unresolved danger, boundary conflict, or any scene where the event would interrupt the actual moment. If context does not support it, soften it into ordinary flirtation, attention, or defer it. Do not establish a relationship unless acceptance happens in-scene; do not force intimacy.'
            : '';
        const partnerLimit = isPartnerInitiativeIntent(intent)
            ? ' Use only if the current beat is calm and no other event is happening; never force partner gifts, dates, conflict, or intimacy into combat, crisis, mourning, active intimacy, public pressure, unresolved danger, boundary conflict, or any scene where it would interrupt the actual moment. If context does not support it, soften it into ordinary partner flirtation/teasing or defer it. Keep it consistent with the established relationship, privacy, danger, urgency, and mood.'
            : '';
        const companionLimit = isCompanionInitiativeIntent(intent)
            ? ' Keep it grounded in the immediate danger, the NPC\'s bond level, self-preservation, and the listed target.'
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
        parts.push(`${description}${noAttack}${relationshipLimit}${partnerLimit}${companionLimit}${companionSupportLimit}${crisisAttackLimit}${denialLimit}`);
    }
    return parts.join(' ') || 'none';
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

function deniedIntimacyCompatibleProactivityDescription(name, intent, target = '{{user}}') {
    const npc = valueOrNone(name);
    switch (intent) {
        case 'Romantic_Nervous':
            return `${npc} shows romantic nervousness as part of the refusal through hesitation, careful wording, changed distance, object handling, or an interrupted routine while keeping the boundary clear.`;
        case 'Romantic_Flirt':
            return `${npc} handles the refusal with playful or flirtatious deflection toward ${target}, keeping the tone warm if appropriate while still setting a firm intimacy boundary.`;
        case 'Romantic_Attention':
            return `${npc} gives ${target} focused romantic attention without allowing intimacy: careful notice, changed distance, lingering presence, or a personal gesture that does not invite contact while keeping the boundary clear.`;
        case 'Thoughtful_Gift':
            return `${npc} may still offer or prepare a small thoughtful gift for ${target}, chosen in a way that fits the NPC, setting, and current relationship.`;
        case 'Ask_Date':
            return `${npc} may redirect only toward a non-intimate romantic date, with a believable public or ordinary plan, while making clear that no intimate access is granted or implied.`;
        case 'Date_And_Confess':
            return '';
        case 'Partner_Intimacy':
            return `${npc} shifts the partner intimacy impulse into affection, a check-in, or a boundary-respecting moment without sexual or intimate escalation.`;
        case 'INTIMACY_OR_FLIRT':
            return `${npc} may show only boundary-compatible flirtation or warmth toward ${target}; keep the intimacy boundary firm and do not narrate intimacy.`;
        default:
            return null;
    }
}

function buildProactivityGuide(proactivity, aggressionResults = {}) {
    const active = Object.entries(proactivity ?? {}).filter(([, value]) => value?.Proactive === 'Y');
    if (!active.length) return 'none';

    return active.map(([name, value]) => {
        const intent = proactivityNarrationIntent(value);
        const target = value?.ProactivityTarget && value.ProactivityTarget !== '(none)'
            ? value.ProactivityTarget
            : '{{user}}';
        const description = personalizeNpcInstruction(name, proactivityIntentDescription(intent, target));
        const noAttack = isAggressiveProactivityIntent(intent)
            ? (aggressionResults?.[name]
                ? ' Use the listed attack result for any resolved hit.'
                : ' Show only intent, pressure, motion, preparation, or interruption; no resolved hit occurs.')
            : ' This is not a resolved attack.';
        const relationshipLimit = isRomanceInitiativeIntent(intent)
            ? ' Use only if the current beat is calm and no other event is happening; never force gifts, dates, confessions, or romantic escalation into combat, crisis, mourning, active intimacy, public pressure, unresolved danger, boundary conflict, or any scene where the event would interrupt the actual moment. If context does not support it, soften it into ordinary flirtation, attention, or defer it. Do not establish a relationship unless acceptance happens in-scene; do not force intimacy.'
            : '';
        const partnerLimit = isPartnerInitiativeIntent(intent)
            ? ' Use only if the current beat is calm and no other event is happening; never force partner gifts, dates, conflict, or intimacy into combat, crisis, mourning, active intimacy, public pressure, unresolved danger, boundary conflict, or any scene where it would interrupt the actual moment. If context does not support it, soften it into ordinary partner flirtation/teasing or defer it. Keep it consistent with the established relationship, privacy, danger, urgency, and mood.'
            : '';
        const companionLimit = isCompanionInitiativeIntent(intent)
            ? ' Keep it grounded in the immediate danger, the NPC\'s bond level, self-preservation, and the listed target.'
            : '';
        const companionSupportLimit = isCompanionSupportIntent(intent)
            ? ' In combat or immediate danger, this support must be tactically useful; do not use comfort-touch, leaning on {{user}}, hand-on-back reassurance, hugging, or sentimental encouragement unless it is physically necessary to drag, brace, shield, heal, or reposition {{user}}.'
            : '';
        const crisisAttackLimit = intent === 'Companion_Attack'
            ? ' This must target only the listed hostile target, never {{user}} or a bystander.'
            : '';
        return `${description}${noAttack}${relationshipLimit}${partnerLimit}${companionLimit}${companionSupportLimit}${crisisAttackLimit}`;
    }).join(' ');
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

function buildAggressionGuide(aggressionResults) {
    const parts = Object.entries(aggressionResults ?? {}).map(([name, value]) => {
        const target = value?.ProactivityTarget && value.ProactivityTarget !== '(none)'
            ? value.ProactivityTarget
            : '{{user}}';
        const targetLimit = isUserReferenceText(target)
            ? `Do not narrate {{user}}'s counterattack, actions, reactions, thoughts, feelings, or dialogue.`
            : `Do not narrate ${valueOrNone(target)}'s counterattack, follow-up action, choices, thoughts, feelings, or dialogue unless another listed result resolves it.`;
        const attackType = value.AttackType === 'Retaliation'
            ? 'retaliation after the user action'
            : value.AttackType === 'CounterAttack'
                ? `counterattack exploiting the opening (${value.CounterPotential}+${value.CounterBonus})`
            : value.AttackType === 'ProactiveAttack'
                ? 'proactive attack from current hostile state'
                : value.AttackType === 'CompanionAttack'
                    ? `companion attack against ${value.ProactivityTarget ?? 'the hostile target'}`
                    : 'immediate NPC attack';
        const userImpairment = userImpairmentGuide(value.UserImpairment, userImpairmentSummary(value.UserImpairment));
        const npcImpairment = npcImpairmentGuide(value.NPCImpairment, npcImpairmentSummary(value.NPCImpairment));
        const statText = aggressionStatNarrationGuide(value);
        const impairmentText = `${statText}${npcImpairment}${userImpairment}`;
        const injuryLimit = aggressionInjuryLimitGuide(value);
        if (value.ReactionOutcome === 'npc_overpowers') {
            return `${name}: ${attackType} strongly succeeds/overpowers against ${valueOrNone(target)}; narrate clear NPC advantage.${injuryLimit}${impairmentText} ${targetLimit}`;
        }
        if (value.ReactionOutcome === 'npc_succeeds') {
            return `${name}: ${attackType} succeeds modestly against ${valueOrNone(target)}; narrate one proportional effect only, not a combo chain or multiple separate hits.${injuryLimit}${impairmentText} ${targetLimit}`;
        }
        if (value.ReactionOutcome === 'stalemate') {
            return `${name}: ${attackType} against ${valueOrNone(target)} meets equal resistance; narrate only a deadlock, clash, bind, struggle, blocked motion, or interrupted exchange with no successful NPC strike, shove, restraint, injury, or completed forceful effect.${impairmentText} Stop in the deadlock. ${targetLimit}`;
        }
        if (['npc_fails', 'user_resists', 'user_dominates'].includes(value.ReactionOutcome)) {
            return `${name}: ${attackType} against ${valueOrNone(target)} fails; narrate only the attempted attack, pressure, or opening being stopped, overpowered, avoided, controlled, or unable to land. Do not narrate a successful NPC strike, shove, restraint, injury, or completed forceful effect.${impairmentText} ${targetLimit}`;
        }
        return `${name}: use listed aggression result exactly.${impairmentText}`;
    });

    return parts.join(' ');
}

function aggressionInjuryLimitGuide(value) {
    const injury = value?.InflictedUserInjury || value?.InflictedTargetInjury;
    if (!injury) return '';
    const condition = String(injury.condition ?? '').toLowerCase();
    const severity = String(injury.severity ?? injury.InjurySeverityLimit ?? '').toLowerCase();
    if (condition === 'bruised' || severity === 'minor') {
        return ' The listed injury cap is minor/bruised: at most one minor impact or bruise may persist, with no bleeding, cuts, breath loss, incapacitation, restraint, or extra landed strikes.';
    }
    return ` Do not exceed the listed injury cap (${valueOrNone(injury.condition)} / ${valueOrNone(injury.severity || injury.InjurySeverityLimit)}).`;
}

function aggressionStatNarrationGuide(value) {
    const attackStat = value?.AttackStat === 'MND' ? 'MND' : 'PHY';
    const defenseStat = value?.DefenseStat === 'MND' ? 'MND' : 'PHY';
    if (attackStat === 'MND') {
        return ` This aggression roll used MND vs ${defenseStat}; render ${valueOrNone(value?.AttackType)} as context-appropriate magic, mental force, supernatural pressure, will, focus, or other non-CHA power for this NPC.`;
    }
    return ` This aggression roll used PHY vs ${defenseStat}; render ${valueOrNone(value?.AttackType)} as physical force, weapon use, bodily action, claws, teeth, movement, or other concrete physical pressure.`;
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

function buildNoAggressionGuide(resolution, handoff) {
    const hasAggressiveProactivity = Object.values(handoff.proactivityResults ?? {}).some(value =>
        value?.Proactive === 'Y'
        && ((value?.ProactivityTarget && value.ProactivityTarget !== '(none)') || value?.TargetsUser === 'Y')
        && ['ESCALATE_VIOLENCE', 'BOUNDARY_PHYSICAL', 'THREAT_OR_POSTURE'].includes(value?.Intent));
    const hasCompanionAttack = Object.values(handoff.proactivityResults ?? {}).some(value =>
        value?.Proactive === 'Y'
        && (value?.RomanceInitiativeTag === 'Companion_Attack' || value?.PartnerInitiativeTag === 'Companion_Attack' || value?.CompanionInitiativeTag === 'Companion_Attack'));

    if (!hasAggressiveProactivity) return 'none';
    if (hasCompanionAttack) return 'Companion attack was selected but no Aggression result was produced; show positioning, preparation, cover, or interrupted motion only. Do not narrate a landed companion hit.';
    if (resolution.OutcomeTier === 'Critical_Success') {
        return 'The user result is strong enough that no immediate NPC attack is resolved. Show only survival, pain, guard, stagger, retreat, or failed preparation.';
    }

    return 'No aggression result was produced; do not invent a resolved NPC hit.';
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

function isNoneText(value) {
    const text = String(value ?? '').trim().toLowerCase();
    return !text || text === 'none' || text === '(none)' || text === 'null';
}
