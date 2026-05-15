import { TRACKER_DELTA_CONTRACT, TRACKER_DELTA_TEMPLATE } from './tracker-delta-contract.js';

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
        'aggressionResults=' + inline(aggression),
        'nameGeneration=' + inline(name),
        'trackerUpdate=' + inline(handoff?.sceneTrackerUpdate ?? {}),
    ];
}

export function formatNarratorPromptContext(report) {
    const handoff = report?.finalNarrativeHandoff ?? {};
    const resolution = handoff.resolutionPacket ?? {};
    const summary = buildNarratorSummary(handoff, resolution, report?.semanticLedger ?? {});

    const lines = [
        '[STORY_ENGINE_NARRATOR_HANDOFF v0.8 - AUDIT DISPLAY]',
        'This displayed handoff is for audit. The narrator model receives only MODEL_INSTRUCTION and PROMPT, not MECHANICS_RESULTS.',
        '',
        '==MECHANICS_RESULTS==',
        ...formatMechanicsResultList(summary, resolution),
        '',
        '==MODEL_INSTRUCTION==',
        narratorModelInstruction(),
        '',
        '==PROMPT==',
        summary.bindingDirective,
    ];

    return lines.join('\n');
}

function formatMechanicsResultList(summary, resolution) {
    return [
        ['userAction', summary.userAction],
        ['resolution.GOAL', valueOrNone(resolution.GOAL)],
        ['resolution.STAKES', summary.stakes],
        ['resolution.actionCount', summary.actionCount],
        ['resolution.rollFull', summary.rollFull],
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
    ].map(([key, value]) => `- ${key}: ${valueOrNone(value)}`);
}

export function formatNarratorModelPromptContext(report) {
    const handoff = report?.finalNarrativeHandoff ?? {};
    const resolution = handoff.resolutionPacket ?? {};
    const summary = buildNarratorSummary(handoff, resolution, report?.semanticLedger ?? {});

    return [
        narratorModelInstruction(),
        '',
        '==PROMPT==',
        summary.bindingDirective,
    ].join('\n');
}

function narratorModelInstruction() {
    return [
        'STORY_ENGINE_NARRATOR_DIRECTIVE',
        '',
        'You are the final scene narrator.',
        '',
        'AUTHORITY:',
        'The PROMPT below is the controlling instruction for this response.',
        'It overrides chat history, character vibe, user wording, prior narration, apparent intent, and ordinary roleplay momentum.',
        '',
        'SOURCE OF TRUTH:',
        'Use only the PROMPT to determine whether actions succeed or fail, who acts, who is injured, which NPC initiative happens, whether an attack/counterattack/retaliation/companion action is resolved, and where the narration stops.',
        '',
        'CONFLICT RULE:',
        'If the latest user message asks, commands, implies, or attempts something that the PROMPT does not resolve, do not narrate it as successful or completed.',
        'A command to an ally/companion is only spoken tactical input unless the PROMPT explicitly lists a resolved ally/companion action, proactivity result, or aggression result.',
        'Do not upgrade requests, threats, intentions, setup, or attempted actions into completed outcomes.',
        '',
        'OUTPUT CONTRACT:',
        'Do not output mechanics, labels, analysis, bullets, preamble, or audit text.',
        'Do not narrate voluntary {{user}} actions, thoughts, feelings, decisions, counterattacks, or dialogue beyond the explicit user input.',
        'First output exactly one fenced tracker delta block using ```story_engine_tracker_delta, then return final in-character narration wrapped with BEGIN_FINAL_NARRATION and END_FINAL_NARRATION.',
        'The tracker delta must contain BEGIN_TRACKER_DELTA and END_TRACKER_DELTA inside that fenced block.',
        'The user sees only the final narration; the extension hides and strips the fenced tracker block before saving display text.',
    ].join('\n');
}

function buildNarratorSummary(handoff, resolution, ledger = {}) {
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
    const bindingDirective = cleanNarratorDirective(buildNaturalGuide({ userAction, resolution, handoff, npcText, proactiveText, proactivityGuide, chaosText, chaosGuide, aggressionText, aggressionGuide, userImpairment, npcImpairment, inflictedNpcInjury, inflictedUserInjury }));

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
        bindingDirective,
    };
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
        ? ` Use this stable personality note as soft guidance, not a hard script: ${npc.PersonalitySummary}.`
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

function buildNaturalGuide({ userAction, resolution, handoff, npcText, proactiveText, proactivityGuide, chaosText, chaosGuide, aggressionText, aggressionGuide, userImpairment, npcImpairment }) {
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
    const naturalProactiveNote = compatibleProactivityGuide !== 'none'
        ? ` In the same beat, include this NPC initiative: ${compatibleProactivityGuide} Render it naturally through personality, body language, speech, and setting. If no attack result is listed, do not invent a resolved NPC hit.`
        : '';
    const boundaryNote = resolution.classifyPhysicalBoundaryPressure === 'Y'
        ? ' Treat this as physical boundary pressure, not combat: narrate contested possession, space, access, refusal, anger, or resistance without inventing a landed attack.'
        : '';
    const boundaryViolationNote = resolution.boundaryViolationExplicit === 'Y'
        ? ` This is an explicit boundary violation or pressure past refusal; narrate refusal, guardedness, resistance, withdrawal, anger, fear, call for help, or escalation as fits this behavior: ${npcGuide}`
        : '';
    const nameInstruction = nameGenerationGuide(handoff.nameGeneration);
    const impairmentInstruction = userImpairmentGuide(resolution.UserImpairment, userImpairment);
    const npcImpairmentInstruction = npcImpairmentGuide(resolution.NPCImpairment, npcImpairment);
    const inflictedNpcInstruction = inflictedNpcInjuryGuide(resolution.InflictedInjuries);
    const inflictedUserInstruction = inflictedUserInjuryGuide(handoff.aggressionResults);
    const inflictedAggressionNpcInstruction = inflictedAggressionNpcInjuryGuide(handoff.aggressionResults);
    const injuryInstruction = `${inflictedNpcInstruction}${inflictedUserInstruction}${inflictedAggressionNpcInstruction}`;
    const aggressionTargetLock = aggressionTargetLockGuide(handoff.aggressionResults);
    const companionCommandInstruction = companionCommandGuide(resolution);
    const trackerInstruction = trackerDeltaInstruction();

    const commonResultInstruction = `${companionCommandInstruction}${partialActionInstruction}${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction}`;
    const stackedPressureInstruction = [
        boundaryViolationNote,
        boundaryNote,
        intimacyBoundaryGuide.text ? ` ${intimacyBoundaryGuide.text}` : '',
        naturalProactiveNote,
        chaosNote,
    ].join('');

    if (aggressionText !== 'none') {
        return `The user action is ${userAction}; resolve it as ${outcome}.${commonResultInstruction}${aggressionTargetLock} ${aggressionGuide}${stackedPressureInstruction} Do not invent any user follow-up.${nameInstruction}${trackerInstruction}`;
    }

    if (intimacyBoundaryGuide.mode === 'DENY' && resolution.boundaryViolationExplicit !== 'Y') {
        return `The user action is ${userAction}; no roll is needed.${companionCommandInstruction} ${intimacyBoundaryGuide.text}${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction}${naturalProactiveNote}${chaosNote}${nameInstruction}${trackerInstruction}`;
    }

    if (proactiveText !== 'none') {
        return `The user action is ${userAction}; resolve it as ${outcome}.${commonResultInstruction}${stackedPressureInstruction}${nameInstruction}${trackerInstruction}`;
    }

    if (resolution.boundaryViolationExplicit === 'Y') {
        return `The user action is ${userAction}; resolve it as ${outcome}.${companionCommandInstruction}${partialActionInstruction}${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction}${boundaryViolationNote}${aggressionNote}${chaosNote}${nameInstruction}${trackerInstruction}`;
    }

    if (resolution.STAKES === 'N') {
        const chaosNote = chaosText !== 'none' ? ` ${chaosGuide}` : '';
        if (intimacyBoundaryGuide.mode === 'ALLOW') {
            return `The user action is ${userAction}; no roll is needed.${companionCommandInstruction} ${intimacyBoundaryGuide.text}${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction}${chaosNote}${nameInstruction}${trackerInstruction}`;
        }
        return `The user action is ${userAction}; no roll is needed.${companionCommandInstruction}${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction} Keep ${npcName}'s response aligned with this behavior: ${npcGuide} Romantic, flirtatious, affectionate, or suggestive conversation may continue naturally according to context and personality, but conversation alone is not permission for intimate escalation. Unless IntimacyBoundary explicitly permits it, do not have the NPC invite or maneuver toward kissing, sex, undressing, bed, an inn room, a private room, sexual touching, or secluded intimacy. Do not invent hostility, refusal, or extra mechanics unless a boundary is actually violated or the NPC state supports it${chaosNote}.${nameInstruction}${trackerInstruction}`;
    }

    if (resolution.classifyPhysicalBoundaryPressure === 'Y') {
        return `The user action is ${userAction}; resolve it as ${outcome}.${companionCommandInstruction}${partialActionInstruction}${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction} Treat this as physical boundary pressure, not combat: narrate contested possession, space, access, refusal, anger, or resistance with this behavior: ${npcGuide} Do not invent a landed attack.${chaosNote}${nameInstruction}${trackerInstruction}`;
    }

    if (chaosText !== 'none') {
        return `The user action is ${userAction}; resolve it as ${outcome}.${companionCommandInstruction}${partialActionInstruction}${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction}${boundaryNote} Keep NPC behavior anchored to this guidance: ${npcGuide}. ${chaosGuide}${nameInstruction}${trackerInstruction}`;
    }

    return `The user action is ${userAction}; resolve it as ${outcome}.${companionCommandInstruction}${partialActionInstruction}${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction}${boundaryNote} Narrate the NPC response with this behavior: ${npcGuide} Keep targets limited to the named scene targets.${nameInstruction}${trackerInstruction}`;
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

function trackerDeltaInstruction() {
    return [
        '\n\nBefore BEGIN_FINAL_NARRATION, output exactly one fenced tracker delta block using the exact fence shown below. Then output the final narration.',
        TRACKER_DELTA_CONTRACT,
        'Use this exact shape:',
        TRACKER_DELTA_TEMPLATE,
    ].join('\n');
}

function partialActionGuide(resolution) {
    const landed = Number(resolution?.LandedActions ?? 0);
    const actionCount = Array.isArray(resolution?.actions) ? resolution.actions.length : 0;
    if (!Number.isFinite(landed) || !actionCount || landed >= actionCount) return '';
    if (landed <= 0) return ` None of the attempted actions land; do not narrate any user hit, injury, or successful contact unless another mechanic explicitly says so.`;
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
        return `Intimacy is permitted for ${npcName} because ${intimacyBoundarySourceText(target.IntimacyBoundarySource)}; narrate the NPC response naturally according to context, privacy, safety, mood, and personality. Do not force explicit intimacy if the scene makes it implausible. Keep ${npcName}'s behavior aligned with: ${npcGuide}`;
    }
    if (target.IntimacyBoundary === 'DENY') {
        return `Intimacy is not permitted for ${npcName} here. Narrate a refusal, deflection, pause, boundary, non-cooperation, or backing off; do not narrate reciprocation, compliance, arousal, escalating intimacy, or a successful intimate result. This denial alone is not a dice roll or relationship penalty. Tune the refusal as ${intimacyRefusalGuide(target)} Keep ${npcName}'s behavior aligned with: ${npcGuide}`;
    }
    return '';
}

function intimacyBoundarySourceText(source) {
    const text = String(source ?? 'NONE');
    if (text === 'ESTABLISHED_RELATIONSHIP') return 'an established relationship exists';
    if (text === 'NPC_INITIATED') return 'the NPC initiated or invited this intimacy and {{user}} is accepting';
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
    return ` If the narration introduces new unnamed people, entities, travelers, guards, villagers, enemies, merchants, witnesses, or bystanders, assign unused names from this approved person name pool: male: ${list(nameGeneration.namePool.male)}; female: ${list(nameGeneration.namePool.female)}. If the narration introduces a new unnamed location, use an unused name from this approved location name pool: ${list(nameGeneration.namePool.location)}. Do not rename existing named characters or places, and do not force a new introduction.`;
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
        `${valueOrNone(injury.NPC)} receives ${valueOrNone(injury.condition)} condition${injuryDetailPhrase(injury)}. This injury or status is mechanically persistent; narrate it as the concrete lasting result of the landed user action/effect, with severity limiting later offense, defense, movement, focus, or other affected actions. ${valueOrNone(injury.NarrationRule)}`,
    ).join(' ');
}

function inflictedUserInjuryGuide(aggressionResults) {
    const injuries = Object.entries(aggressionResults ?? {})
        .map(([name, value]) => ({ name, injury: value?.InflictedUserInjury || (value?.InflictedTargetInjury?.targetType === 'user' ? value.InflictedTargetInjury : null) }))
        .filter(item => item.injury);
    if (!injuries.length) return '';
    return ' ' + injuries.map(({ name, injury }) =>
        `The user receives ${valueOrNone(injury.condition)} condition from ${valueOrNone(name)}${injuryDetailPhrase(injury)}. This injury is mechanically persistent; choose the concrete wound and affected body area from the NPC attack context, but do not exceed ${valueOrNone(injury.severity)} severity. Let that narrated injury limit later offense, defense, movement, focus, or other affected actions according to severity.`,
    ).join(' ');
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
            ? ' Do not establish a relationship unless acceptance happens in-scene; do not force intimacy.'
            : '';
        const partnerLimit = isPartnerInitiativeIntent(intent)
            ? ' Keep it consistent with the established relationship, privacy, danger, urgency, and mood.'
            : '';
        const companionLimit = isCompanionInitiativeIntent(intent)
            ? ' Keep it grounded in the immediate danger, the NPC\'s bond level, self-preservation, and the listed target.'
            : '';
        const crisisAttackLimit = intent === 'Companion_Attack'
            ? ' This must target only the listed hostile target, never {{user}} or a bystander.'
            : '';
        const denialLimit = deniedForNpc
            ? ' Keep this fully compatible with the intimacy denial; do not turn it into consent, arousal, relationship acceptance, or intimate escalation.'
            : '';
        parts.push(`${description}${noAttack}${relationshipLimit}${partnerLimit}${companionLimit}${crisisAttackLimit}${denialLimit}`);
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
            return `${npc} shows romantic nervousness as part of the refusal: hesitation, awkward warmth, flustered body language, or careful wording while keeping the boundary clear.`;
        case 'Romantic_Flirt':
            return `${npc} handles the refusal with playful or flirtatious deflection toward ${target}, keeping the tone warm if appropriate while still refusing intimacy.`;
        case 'Romantic_Attention':
            return `${npc} gives ${target} focused romantic attention without allowing intimacy: closeness, careful notice, lingering presence, or a personal gesture while keeping the boundary clear.`;
        case 'Thoughtful_Gift':
            return `${npc} may still offer or prepare a small thoughtful gift for ${target}, chosen in a way that fits the NPC, setting, and current relationship.`;
        case 'Ask_Date':
            return `${npc} may redirect toward a non-intimate romantic date later, with a believable public or ordinary plan, while making clear that intimacy is not happening now.`;
        case 'Date_And_Confess':
            return '';
        case 'Partner_Intimacy':
            return `${npc} shifts the partner intimacy impulse into affection, a check-in, or a private boundary-respecting moment without sexual or intimate escalation.`;
        case 'INTIMACY_OR_FLIRT':
            return `${npc} may show only boundary-compatible flirtation or warmth toward ${target}; do not narrate intimacy.`;
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
            ? ' Do not establish a relationship unless acceptance happens in-scene; do not force intimacy.'
            : '';
        const partnerLimit = isPartnerInitiativeIntent(intent)
            ? ' Keep it consistent with the established relationship, privacy, danger, urgency, and mood.'
            : '';
        const companionLimit = isCompanionInitiativeIntent(intent)
            ? ' Keep it grounded in the immediate danger, the NPC\'s bond level, self-preservation, and the listed target.'
            : '';
        const crisisAttackLimit = intent === 'Companion_Attack'
            ? ' This must target only the listed hostile target, never {{user}} or a bystander.'
            : '';
        return `${description}${noAttack}${relationshipLimit}${partnerLimit}${companionLimit}${crisisAttackLimit}`;
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
            return 'NPC helps, protects, steadies, advises, assists, or advances a shared practical aim according to the current scene.';
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
            return 'NPC offers or prepares a small thoughtful gift for {{user}}, chosen in a way that fits the NPC, setting, and current relationship.';
        case 'Ask_Date':
            return 'NPC asks or maneuvers toward a non-intimate romantic date with {{user}}, using a believable public or ordinary plan. Do not frame this as secluded sexual privacy, an inn room, bed, undressing, or physical intimacy.';
        case 'Date_And_Confess':
            return 'NPC seeks to invite {{user}} to a very special date, where they may eventually be alone and the NPC can make a clear relationship-oriented confession or request.';
        case 'Partner_Flirt':
            return 'NPC flirts with {{user}} in a natural established-partner way, keeping it light, contextual, and scene-compatible.';
        case 'Partner_Tease':
            return 'NPC teases or flirts with {{user}} in a comfortable established-partner way without derailing urgent danger or serious stakes.';
        case 'Partner_Date':
            return 'NPC suggests or plans a specific partner date with {{user}}, a shared activity that fits the setting, current safety, and the relationship.';
        case 'Partner_Gift':
            return 'NPC offers, finds, prepares, or points out a small cute or thoughtful thing {{user}} might like, chosen to fit the NPC, setting, and relationship.';
        case 'Partner_Intimacy':
            return 'NPC initiates romantic or sexual closeness with {{user}} in a way that fits current privacy, safety, mood, and relationship; do not force explicit intimacy in public, danger, crisis, combat, or implausible circumstances.';
        case 'Partner_Conflict':
            return 'NPC raises an established-partner worry, concern, jealousy, disagreement, or vulnerable tension when context supports a real relationship conversation.';
        case 'Companion_Warn':
            return 'NPC warns {{user}} about immediate danger, calls out a threat, gives urgent tactical advice, or alerts others without directly attacking.';
        case 'Companion_Assist':
            return 'NPC helps {{user}} under pressure through practical aid, positioning, supplies, magic, guidance, steadying, or quick intervention without directly attacking.';
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
        if (value.ReactionOutcome === 'npc_overpowers') {
            return `${name}: ${attackType} strongly succeeds/overpowers against ${valueOrNone(target)}; narrate clear NPC advantage.${impairmentText} ${targetLimit}`;
        }
        if (value.ReactionOutcome === 'npc_succeeds') {
            return `${name}: ${attackType} succeeds modestly against ${valueOrNone(target)}; narrate proportional effect.${impairmentText} ${targetLimit}`;
        }
        if (value.ReactionOutcome === 'stalemate') {
            return `${name}: ${attackType} against ${valueOrNone(target)} meets equal resistance; narrate a cinematic stalemate, clash, bind, or struggle.${impairmentText} Stop in the deadlock. ${targetLimit}`;
        }
        if (value.ReactionOutcome === 'user_resists') {
            return `${name}: ${attackType} against ${valueOrNone(target)} is partly resisted; stop at the moment of impact/contact/near-contact.${impairmentText} ${targetLimit}`;
        }
        if (value.ReactionOutcome === 'user_dominates') {
            return `${name}: ${attackType} against ${valueOrNone(target)} fails or is controlled/evaded; stop at the moment of failed impact/contact/near-contact.${impairmentText} ${targetLimit}`;
        }
        return `${name}: use listed aggression result exactly.${impairmentText}`;
    });

    return parts.join(' ');
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
