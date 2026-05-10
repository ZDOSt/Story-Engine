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
    const name = ledger?.nameSemantic ?? {};
    const proactivity = ledger?.proactivitySemantic ?? {};
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
            `gate:${npc.intimacyGate ?? 'SKIP'}`,
            `cond:${npc.condition ?? 'healthy'}`,
        ].join('/')).join('; ') || 'none'),
        '',
        'ResolutionEngine:',
        'identifyGoal=' + valueOrNone(resolution.identifyGoal),
        'identifyChallenge=' + valueOrNone(resolution.identifyChallenge),
        'intimacyAdvance=' + valueOrNone(resolution.intimacyAdvance),
        'explicitMeans=' + valueOrNone(resolution.explicitMeans),
        'identifyTargets:',
        'ActionTargets=' + list(targets.ActionTargets),
        'OppTargets.NPC=' + list(oppTargets.NPC),
        'OppTargets.ENV=' + list(oppTargets.ENV),
        'BenefitedObservers=' + list(targets.BenefitedObservers),
        'HarmedObservers=' + list(targets.HarmedObservers),
        'hasStakes=' + String(Boolean(resolution.hasStakes)),
        'actionCount=' + list(resolution.actionCount),
        'mapStats=' + inline(resolution.mapStats ?? {}),
        'classifyHostilePhysicalIntent=' + String(Boolean(resolution.classifyHostilePhysicalIntent)),
        'classifyPhysicalBoundaryPressure=' + String(Boolean(resolution.classifyPhysicalBoundaryPressure)),
        'genStats=' + coreLine(resolution.genStats),
        '',
        'RelationshipEngine:',
        relationships.length ? '' : 'none',
        ...relationships.flatMap((item, index) => [
            `NPC[${index}]=${valueOrNone(item.NPC)}`,
            `relevant=${Boolean(item.relevant)}`,
            `initFlags=${inline(item.initFlags ?? {})}`,
            `timeLapseExplicit=${Boolean(item.timeLapseExplicit)}`,
            `explicitIntimidationOrCoercion=${Boolean(item.explicitIntimidationOrCoercion)}`,
            `stakeChangeByOutcome=${inline(item.stakeChangeByOutcome ?? {})}`,
            `overrideFlags=${inline(item.overrideFlags ?? {})}`,
            `genStats=${coreLine(item.genStats)}`,
            '',
        ]),
        '',
        'chaosSemantic.sceneSummary=' + valueOrNone(chaos.sceneSummary),
        'trackerUpdateEngine=' + inline(tracker),
        'nameSemantic=' + inline(name),
        'proactivitySemantic=' + inline(proactivity),
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
        'resolutionPacket.IntimacyConsent=' + valueOrNone(resolution.IntimacyConsent),
        'resolutionPacket.STAKES=' + valueOrNone(resolution.STAKES),
        'resolutionPacket.actions=' + list(resolution.actions),
        'resolutionPacket.OutcomeTier=' + valueOrNone(resolution.OutcomeTier),
        'resolutionPacket.Outcome=' + valueOrNone(resolution.Outcome),
        'resolutionPacket.LandedActions=' + valueOrNone(resolution.LandedActions),
        'resolutionPacket.CounterPotential=' + valueOrNone(resolution.CounterPotential),
        'resolutionPacket.classifyHostilePhysicalIntent=' + valueOrNone(resolution.classifyHostilePhysicalIntent),
        'resolutionPacket.classifyPhysicalBoundaryPressure=' + valueOrNone(resolution.classifyPhysicalBoundaryPressure),
        'resolutionPacket.UserImpairment=' + inline(resolution.UserImpairment ?? {}),
        'resolutionPacket.NPCImpairment=' + inline(resolution.NPCImpairment ?? {}),
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
            `npcHandoffs[${index}].Target=${valueOrNone(npc.Target)}`,
            `npcHandoffs[${index}].NPC_STAKES=${valueOrNone(npc.NPC_STAKES)}`,
            `npcHandoffs[${index}].IntimacyGate=${valueOrNone(npc.IntimacyGate)}`,
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
        ['intimacy.consentGate', summary.consentGate],
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
        '[STORY_ENGINE_NARRATOR_DIRECTIVE v0.8 - PRIVATE AUTHORITATIVE]',
        '',
        narratorModelInstruction(),
        '',
        '==PROMPT==',
        summary.bindingDirective,
    ].join('\n');
}

function narratorModelInstruction() {
    return [
        'Mandatory, non-negotiable: follow the prompt below exactly to narrate the scene.',
        'The prompt is the controlling instruction for outcome, consent, proactivity, aggression, injuries, impairment, limits, and stopping point.',
        'If chat history, character tone, relationship vibes, or prior narration conflict with the prompt, obey the prompt.',
        'Do not output mechanics, labels, analysis, bullets, preamble, or audit text.',
        'Do not narrate voluntary {{user}} actions, thoughts, feelings, decisions, counterattacks, or dialogue beyond the explicit user input.',
        'Return only final in-character narration, wrapped with BEGIN_FINAL_NARRATION and END_FINAL_NARRATION.',
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
        `gate:${h.IntimacyGate}`,
        `stakes:${h.NPC_STAKES}`,
        `landed:${h.Landed}`,
        `boundary:${h.BoundaryPressure ?? 'N'}`,
        `pressure:${h.HostilePressure ?? 0}/${h.HostileLandedPressure ?? 0}/${h.DominantLock ?? 'None'}/${h.PressureMode ?? 'none'}`,
    ].join('/')).join(';') || 'none';
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
        `${name}/${value.AttackType ?? 'Attack'}/${value.ReactionOutcome}/target:${value.ProactivityTarget ?? '{{user}}'}/bonus:${value.CounterBonus ?? 0}/margin:${value.Margin}/npcImpair:${npcImpairmentSummary(value.NPCImpairment)}/targetDefenseImpair:${userImpairmentSummary(value.TargetImpairment || value.UserImpairment)}`,
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
        consentGate: consentGateSummary(handoff, resolution),
        relationshipResult: relationshipResultSummary(handoff, resolution),
        actions: list(resolution.actions),
        stakes: resolution.STAKES ?? 'N',
        consent: intimacyConsentSummary(resolution),
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
    const marginMatch = text.match(/=\s*(-?\d+)\s*vs\s*1d20\(\d+\)(?:\s*\+\s*[A-Z]+\(\d+\))?(?:\s*\+\s*impairment\(-?\d+\))?\s*=\s*(-?\d+)/i);
    const statMatch = text.match(/\+\s*(PHY|MND|CHA)\(\d+\).*?vs\s*1d20\(\d+\)(?:\s*\+\s*(PHY|MND|CHA)\(\d+\))?/i);
    const left = marginMatch ? Number(marginMatch[1]) : null;
    const right = marginMatch ? Number(marginMatch[2]) : null;
    const margin = Number.isFinite(left) && Number.isFinite(right) ? String(left - right) : 'unknown';
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

function consentGateSummary(handoff, resolution) {
    if (resolution.GOAL !== 'IntimacyAdvancePhysical' && resolution.GOAL !== 'IntimacyAdvanceVerbal') return 'not applicable';
    return strongestIntimacyGate(handoff, resolution);
}

function relationshipResultSummary(handoff, resolution) {
    const npcs = Array.isArray(handoff?.npcHandoffs) ? handoff.npcHandoffs : [];
    if (!npcs.length) return 'none';
    return npcs.map(npc => [
        npc.NPC || '(unknown)',
        `target:${npc.Target ?? 'No Change'}`,
        `gate:${npc.IntimacyGate ?? 'SKIP'}`,
        `boundary:${npc.BoundaryPressure ?? 'N'}`,
        `pressure:${npc.HostilePressure ?? 0}/${npc.HostileLandedPressure ?? 0}`,
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
    const boundary = npc?.BoundaryPressure === 'Y'
        ? ' Respect active boundary pressure through space, refusal, guarded movement, or physical protection.'
        : '';
    return `${behavior} ${target}${boundary}`.trim();
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
        `rule:${valueOrNone(injury.NarrationRule)}`,
    ].join('/')).join('; ');
}

function nameGenerationSummary(nameGeneration) {
    if (!nameGeneration || nameGeneration.nameRequired !== 'Y' || isNoneText(nameGeneration.generatedName)) {
        return 'none';
    }
    const mode = nameGeneration.detectMode || 'PERSON';
    return `${nameGeneration.generatedName} (${mode}; exact required name if introducing the unnamed ${mode === 'LOCATION' ? 'location' : 'person/entity'})`;
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
    const actionTargets = list(resolution.ActionTargets);
    const oppNpc = list(resolution.OppTargets?.NPC);
    const oppEnv = list(resolution.OppTargets?.ENV);
    const benefited = list(resolution.BenefitedObservers);
    const harmed = list(resolution.HarmedObservers);
    if (!isNoneText(actionTargets)) parts.push(`action:${actionTargets}`);
    if (!isNoneText(oppNpc)) parts.push(`opposes:${oppNpc}`);
    if (!isNoneText(oppEnv)) parts.push(`env:${oppEnv}`);
    if (!isNoneText(benefited)) parts.push(`benefits:${benefited}`);
    if (!isNoneText(harmed)) parts.push(`harms:${harmed}`);
    return parts.join('; ') || 'none';
}

function buildNaturalGuide({ userAction, resolution, handoff, npcText, proactiveText, proactivityGuide, chaosText, chaosGuide, aggressionText, aggressionGuide, userImpairment, npcImpairment }) {
    const goal = resolution.GOAL ?? 'normal';
    const outcome = naturalOutcomeSummary(resolution);
    const primaryNpc = handoff.npcHandoffs?.[0];
    const npcName = primaryNpc?.NPC || list(resolution.ActionTargets) || 'the NPC';
    const npcGuide = primaryNpc ? relationshipNarrationGuide(primaryNpc) : `Use the listed NPC state naturally: ${npcText}.`;
    const gate = strongestIntimacyGate(handoff, resolution);
    const isIntimacyAdvance = goal === 'IntimacyAdvancePhysical' || goal === 'IntimacyAdvanceVerbal';
    const intimacyDenied = isIntimacyAdvance
        && (resolution.IntimacyConsent !== 'Y' || gate === 'DENY');
    const intimacyAllowed = isIntimacyAdvance
        && !intimacyDenied
        && (resolution.IntimacyConsent === 'Y' || resolution.STAKES === 'N' || gate === 'ALLOW');
    const chaosNote = chaosText !== 'none' ? ` ${chaosGuide}` : '';
    const aggressionNote = aggressionText !== 'none'
        ? ` ${aggressionGuide}`
        : '';
    const proactiveNote = aggressionText === 'none' && proactiveText !== 'none'
        ? ' Let the NPC initiative appear only as denial, boundary, refusal, retreat, resistance, or escalation consistent with the consent limit.'
        : '';
    const naturalProactiveNote = proactiveText !== 'none'
        ? ` In the same beat, include this NPC initiative: ${proactivityGuide} Render it naturally through personality, body language, speech, and setting. If no attack result is listed, do not invent a resolved NPC hit.`
        : '';
    const boundaryNote = resolution.classifyPhysicalBoundaryPressure === 'Y'
        ? ' Treat this as physical boundary pressure, not combat: narrate contested possession, space, access, refusal, anger, or resistance without inventing a landed attack.'
        : '';
    const nameInstruction = nameGenerationGuide(handoff.nameGeneration);
    const impairmentInstruction = userImpairmentGuide(resolution.UserImpairment, userImpairment);
    const npcImpairmentInstruction = npcImpairmentGuide(resolution.NPCImpairment, npcImpairment);
    const inflictedNpcInstruction = inflictedNpcInjuryGuide(resolution.InflictedInjuries);
    const inflictedUserInstruction = inflictedUserInjuryGuide(handoff.aggressionResults);
    const inflictedAggressionNpcInstruction = inflictedAggressionNpcInjuryGuide(handoff.aggressionResults);
    const injuryInstruction = `${inflictedNpcInstruction}${inflictedUserInstruction}${inflictedAggressionNpcInstruction}`;

    if (intimacyDenied) {
        if (goal === 'IntimacyAdvancePhysical') {
            return `The user action is ${userAction}; resolve it as ${outcome}.${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction} Consent is denied: any successful physical attempt may land or create contact or positioning, but ${npcName} does not cooperate, reciprocate, or become willing. Narrate rejection, recoil, pushing away, rebuke, resistance, flight, or escalation with this behavior: ${npcGuide}${aggressionNote}${proactiveNote}${chaosNote}${nameInstruction}`;
        }
        return `The user action is ${userAction}; resolve it as ${outcome}.${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction} Consent is denied: any successful verbal attempt may affect ${npcName}, but the request is refused. Narrate a boundary, rebuke, annoyance, anger, fear, or refusal with this behavior: ${npcGuide} Never narrate compliance with the intimacy request.${aggressionNote}${proactiveNote}${chaosNote}${nameInstruction}`;
    }

    if (aggressionText !== 'none') {
        return `The user action is ${userAction}; resolve it as ${outcome}.${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction} ${aggressionGuide} Do not invent any user follow-up.${nameInstruction}`;
    }

    if (proactiveText !== 'none') {
        return `The user action is ${userAction}; resolve it as ${outcome}.${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction}${boundaryNote}${naturalProactiveNote}${nameInstruction}`;
    }

    if (isIntimacyAdvance) {
        const gateText = intimacyAllowed
            ? `${npcName} may receive it according to the current consent state and this behavior: ${npcGuide}`
            : `${npcName} refuses or sets a boundary because consent is not allowing it`;
        return `The user action is ${userAction}; resolve it as ${outcome}.${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction} ${gateText}.${chaosNote}${nameInstruction}`;
    }

    if (resolution.STAKES === 'N') {
        const chaosNote = chaosText !== 'none' ? ` ${chaosGuide}` : '';
        return `The user action is ${userAction}; no roll is needed.${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction} Keep ${npcName}'s response aligned with this behavior: ${npcGuide} Do not invent hostility or extra mechanics${chaosNote}.${nameInstruction}`;
    }

    if (resolution.classifyPhysicalBoundaryPressure === 'Y') {
        return `The user action is ${userAction}; resolve it as ${outcome}.${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction} Treat this as physical boundary pressure, not combat: narrate contested possession, space, access, refusal, anger, or resistance with this behavior: ${npcGuide} Do not invent a landed attack.${chaosNote}${nameInstruction}`;
    }

    if (chaosText !== 'none') {
        return `The user action is ${userAction}; resolve it as ${outcome}.${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction}${boundaryNote} Keep NPC behavior anchored to this guidance: ${npcGuide}. ${chaosGuide}${nameInstruction}`;
    }

    return `The user action is ${userAction}; resolve it as ${outcome}.${impairmentInstruction}${npcImpairmentInstruction}${injuryInstruction}${boundaryNote} Narrate the NPC response with this behavior: ${npcGuide} Keep targets limited to the named scene targets.${nameInstruction}`;
}

function nameGenerationGuide(nameGeneration) {
    if (!nameGeneration || nameGeneration.nameRequired !== 'Y' || isNoneText(nameGeneration.generatedName)) return '';
    const noun = nameGeneration.detectMode === 'LOCATION' ? 'location' : 'person/entity';
    return ` If the narration introduces the unnamed ${noun}, use exactly "${nameGeneration.generatedName}" as its proper name. Do not invent, alter, translate, or replace this name.`;
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
        `${valueOrNone(injury.NPC)} receives ${valueOrNone(injury.condition)} condition with ${list(injury.woundsAdd)}${list(injury.statusAdd) !== 'none' ? ` and ${list(injury.statusAdd)}` : ''}. This injury is mechanically persistent; narrate it as the concrete lasting result of the landed user attack, with severity limiting later offense, defense, movement, focus, or other affected actions.`,
    ).join(' ');
}

function inflictedUserInjuryGuide(aggressionResults) {
    const injuries = Object.entries(aggressionResults ?? {})
        .map(([name, value]) => ({ name, injury: value?.InflictedUserInjury || (value?.InflictedTargetInjury?.targetType === 'user' ? value.InflictedTargetInjury : null) }))
        .filter(item => item.injury);
    if (!injuries.length) return '';
    return ' ' + injuries.map(({ name, injury }) =>
        `The user receives ${valueOrNone(injury.condition)} condition from ${valueOrNone(name)} with ${list(injury.woundsAdd)}${list(injury.statusAdd) !== 'none' ? ` and ${list(injury.statusAdd)}` : ''}. This injury is mechanically persistent; narrate it as the concrete lasting result of the NPC attack, with severity limiting later offense, defense, movement, focus, or other affected actions.`,
    ).join(' ');
}

function inflictedAggressionNpcInjuryGuide(aggressionResults) {
    const injuries = Object.entries(aggressionResults ?? {})
        .map(([name, value]) => ({ name, injury: value?.InflictedTargetInjury }))
        .filter(item => item.injury?.targetType === 'npc');
    if (!injuries.length) return '';
    return ' ' + injuries.map(({ name, injury }) =>
        `${valueOrNone(injury.target)} receives ${valueOrNone(injury.condition)} condition from ${valueOrNone(name)} with ${list(injury.woundsAdd)}${list(injury.statusAdd) !== 'none' ? ` and ${list(injury.statusAdd)}` : ''}. This injury is mechanically persistent; narrate it as the concrete lasting result of the NPC attack, with severity limiting later offense, defense, movement, focus, or other affected actions.`,
    ).join(' ');
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

function strongestIntimacyGate(handoff, resolution) {
    const targets = toComparableSet(resolution?.ActionTargets);
    const targetHandoffs = (handoff?.npcHandoffs ?? []).filter(h => targets.has(String(h?.NPC ?? '').toLowerCase()));
    const relevantHandoffs = targetHandoffs.length ? targetHandoffs : (handoff?.npcHandoffs ?? []);
    const gates = relevantHandoffs.map(h => h?.IntimacyGate);
    if (gates.includes('DENY')) return 'DENY';
    if (gates.includes('ALLOW')) return 'ALLOW';
    return gates.find(Boolean) || 'SKIP';
}

function toComparableSet(value) {
    const items = Array.isArray(value) ? value : [value];
    return new Set(items
        .map(item => String(item ?? '').trim())
        .filter(item => !isNoneText(item))
        .map(item => item.toLowerCase()));
}

function intimacyConsentSummary(resolution) {
    if (resolution.GOAL !== 'IntimacyAdvancePhysical' && resolution.GOAL !== 'IntimacyAdvanceVerbal') return 'not applicable';
    return resolution.IntimacyConsent ?? 'N';
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
        };
    }
    return formatted;
}

function proactivityAggressionAudit(value, aggressionResult) {
    if (!isAggressionRollApplicableProactivity(value)) return '';
    return `triggersAggressionRoll:${aggressionResult ? 'Y' : 'N'}`;
}

function isAggressionRollApplicableProactivity(value) {
    if (!value || value.Proactive !== 'Y') return false;
    if (value.RomanceInitiativeTag === 'Companion_Attack' || value.PartnerInitiativeTag === 'Companion_Attack') return true;
    return ['ESCALATE_VIOLENCE', 'BOUNDARY_PHYSICAL', 'THREAT_OR_POSTURE'].includes(value.Intent);
}

function buildProactivityGuide(proactivity, aggressionResults = {}) {
    const active = Object.entries(proactivity ?? {}).filter(([, value]) => value?.Proactive === 'Y');
    if (!active.length) return 'none';

    return active.map(([name, value]) => {
        const intent = value?.PartnerInitiative === 'Y'
            ? value.PartnerInitiativeTag
            : value?.RomanceInitiative === 'Y'
            ? value.RomanceInitiativeTag
            : value?.Intent;
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
        const crisisAttackLimit = intent === 'Companion_Attack'
            ? ' This must target only the listed hostile target, never {{user}} or a bystander.'
            : '';
        return `${description}${noAttack}${relationshipLimit}${partnerLimit}${crisisAttackLimit}`;
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
            return 'NPC shows permitted intimacy or flirtation consistent with the current gate or override.';
        case 'Romantic_Nervous':
            return 'NPC shows romantic nervousness around {{user}}.';
        case 'Romantic_Flirt':
            return 'NPC is flirtatious toward {{user}}.';
        case 'Romantic_Attention':
            return 'NPC gives {{user}} focused romantic attention through closeness, careful notice, lingering presence, or a personal gesture without forcing a confession, date, or intimacy.';
        case 'Thoughtful_Gift':
            return 'NPC offers or prepares a small thoughtful gift for {{user}}, chosen in a way that fits the NPC, setting, and current relationship.';
        case 'Ask_Date':
            return 'NPC asks or maneuvers toward spending romantic private time with {{user}}. If {{user}} accepts, the NPC already has a believable plan for what they will do together, as if they have been thinking about this for some time.';
        case 'Date_And_Confess':
            return 'NPC seeks to invite {{user}} to a very special date, where they may eventually be alone and the NPC can make a clear relationship-oriented confession or request.';
        case 'Partner_Check_In':
            return 'NPC checks on {{user}} with established-partner concern, noticing strain, danger, injury, mood, or unfinished personal matters as fits the scene.';
        case 'Partner_Affection':
            return 'NPC shows established-partner affection toward {{user}} through warmth, closeness, familiar touch, or private tenderness that fits the scene.';
        case 'Partner_Support':
            return 'NPC supports {{user}} as an established partner through practical help, protection, advice, care, positioning, supplies, or shared action.';
        case 'Partner_Tease':
            return 'NPC teases or flirts with {{user}} in a comfortable established-partner way without derailing urgent danger or serious stakes.';
        case 'Partner_Private_Time':
            return 'NPC seeks private time with {{user}}, suggesting or maneuvering toward being alone together when the scene is safe and plausible.';
        case 'Partner_Gift':
            return 'NPC offers, finds, prepares, or points out a small cute or thoughtful thing {{user}} might like, chosen to fit the NPC, setting, and relationship.';
        case 'Partner_Intimacy':
            return 'NPC initiates romantic or sexual closeness with {{user}} in a way that fits current privacy, safety, mood, and relationship; do not force explicit intimacy in public, danger, crisis, combat, or implausible circumstances.';
        case 'Partner_Conflict':
            return 'NPC raises an established-partner worry, concern, jealousy, disagreement, or vulnerable tension when context supports a real relationship conversation.';
        case 'Protective_Support':
            return 'NPC protects, shields, warns, steadies, heals, covers, pulls clear, guards, or otherwise helps {{user}} through immediate danger without making a resolved attack unless Aggression lists one.';
        case 'Teamwork_Under_Pressure':
            return 'NPC coordinates under pressure, covers a flank, creates an opening, follows {{user}}\'s opening, or acts in sync with {{user}} against the current danger without making a resolved attack unless Aggression lists one.';
        case 'Companion_Attack':
            return `NPC attacks or directly fights the valid hostile target ${target} while acting as {{user}}'s close companion or partner; narrate the attack only according to the listed Aggression result.`;
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
    return ['Partner_Check_In', 'Partner_Affection', 'Partner_Support', 'Partner_Tease', 'Partner_Private_Time', 'Partner_Gift', 'Partner_Intimacy', 'Partner_Conflict', 'Protective_Support', 'Teamwork_Under_Pressure', 'Companion_Attack'].includes(intent);
}

function buildAggressionGuide(aggressionResults) {
    const parts = Object.entries(aggressionResults ?? {}).map(([name, value]) => {
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
        const impairmentText = `${npcImpairment}${userImpairment}`;
        if (value.ReactionOutcome === 'npc_overpowers') {
            return `${name}: ${attackType} strongly succeeds/overpowers; narrate clear NPC advantage.${impairmentText} Do not narrate any follow-up action or dialogue by {{user}}.`;
        }
        if (value.ReactionOutcome === 'npc_succeeds') {
            return `${name}: ${attackType} succeeds modestly; narrate proportional effect.${impairmentText} Do not narrate any follow-up action or dialogue by {{user}}.`;
        }
        if (value.ReactionOutcome === 'stalemate') {
            return `${name}: ${attackType} meets equal resistance; narrate a cinematic stalemate, clash, bind, or struggle.${impairmentText} Stop in the deadlock. Do not narrate {{user}}'s counterattack, choices, thoughts, feelings, or dialogue.`;
        }
        if (value.ReactionOutcome === 'user_resists') {
            return `${name}: ${attackType} is partly resisted; stop at the moment of impact/contact/near-contact.${impairmentText} Do not narrate {{user}}'s counterattack, actions, reactions, thoughts, feelings, or dialogue.`;
        }
        if (value.ReactionOutcome === 'user_dominates') {
            return `${name}: ${attackType} fails or is controlled/evaded; stop at the moment of failed impact/contact/near-contact.${impairmentText} Do not narrate {{user}}'s counterattack, actions, reactions, thoughts, feelings, or dialogue.`;
        }
        return `${name}: use listed aggression result exactly.${impairmentText}`;
    });

    return parts.join(' ');
}

function buildNoAggressionGuide(resolution, handoff) {
    const hasAggressiveProactivity = Object.values(handoff.proactivityResults ?? {}).some(value =>
        value?.Proactive === 'Y'
        && ((value?.ProactivityTarget && value.ProactivityTarget !== '(none)') || value?.TargetsUser === 'Y')
        && ['ESCALATE_VIOLENCE', 'BOUNDARY_PHYSICAL', 'THREAT_OR_POSTURE'].includes(value?.Intent));
    const hasCompanionAttack = Object.values(handoff.proactivityResults ?? {}).some(value =>
        value?.Proactive === 'Y'
        && (value?.RomanceInitiativeTag === 'Companion_Attack' || value?.PartnerInitiativeTag === 'Companion_Attack'));

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
