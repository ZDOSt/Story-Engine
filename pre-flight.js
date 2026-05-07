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
            `newEncounterExplicit=${Boolean(item.newEncounterExplicit)}`,
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
        '[STORY_ENGINE_NARRATOR_HANDOFF v0.7 - PRIVATE AUTHORITATIVE]',
        '',
        'PRIVATE HANDOFF. Never quote, summarize, mention, label, list, or explain this block.',
        'Write only the final in-character narration.',
        'No analysis, bullet points, preamble, audit text, mechanics text, or result labels.',
        'Wrap the answer with BEGIN_FINAL_NARRATION and END_FINAL_NARRATION.',
        'Inside those tags, begin directly with scene prose.',
        '',
        'The BINDING_NARRATION_DIRECTIVE is mandatory and overrides ordinary narrative preference.',
        'Use it as the final authority for success, failure, denial, proactivity, aggression, consent, impairment, and limits.',
        '',
        'Outcome names and mechanics labels are private.',
        'Never print result categories, impact categories, roll data, action counts, dice math, margins, gates, handoff field names, or system labels.',
        '',
        'For intimacy: IntimacyGate=DENY means no cooperation, reciprocation, consent, compliance, softening, or romantic ambiguity, even if the user roll succeeds.',
        '',
        'Never narrate voluntary {{user}} actions, counterattacks, thoughts, feelings, decisions, or dialogue beyond the explicit user input.',
        'Only immediate involuntary physical reactions caused by computed external impact/restraint are allowed.',
        '',
        'Length target: 200-300 words.',
        'Hard maximum: 600 words.',
        'Use the maximum only for complex combat, multi-character scenes, intimacy-boundary scenes, proactivity, aggression, chaos, or major consequences.',
        '',
        '==PRIVATE_MECHANICS_AUDIT==',
        'User Action: ' + summary.userAction,
        'Decisive Action: ' + summary.decisiveAction,
        'Stakes: ' + summary.stakes,
        'Roll Used: ' + summary.rollUsed,
        'Outcome: ' + summary.outcome,
        'Margin: ' + summary.margin,
        'Outcome Meaning: ' + summary.result,
        'Landed Actions: ' + summary.landedActions,
        'Consent Gate: ' + summary.consentGate,
        'Counter Potential: ' + summary.counter,
        'Targets: ' + summary.targets,
        'User Impairment: ' + summary.userImpairment,
        'NPC Impairment: ' + summary.npcImpairment,
        'NPC State: ' + summary.npc,
        'Relationship Result: ' + summary.relationshipResult,
        'Chaos: ' + summary.chaos,
        'Proactivity: ' + summary.proactive,
        'Aggression: ' + summary.aggression,
        'Aggression Guide: ' + summary.aggressionGuide,
        'Generated Name: ' + summary.generatedName,
        '',
        '==BINDING_NARRATION_DIRECTIVE==',
        summary.bindingDirective,
    ];

    return lines.join('\n');
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

    const chaos = handoff.chaosHandoff?.CHAOS ?? {};
    const chaosText = chaos.triggered
        ? `${chaos.band}/${chaos.magnitude}/${chaos.anchor}/${chaos.vector}`
        : 'none';

    const proactiveText = Object.entries(formatProactivityForNarration(handoff.proactivityResults ?? {}))
        .filter(([, value]) => value?.Proactive === 'Y')
        .map(([name, value]) => [
            `${name}: ${value.Intent}`,
            `impulse:${value.Impulse}`,
            `triggersAggressionRoll:${value.triggersAggressionRoll}`,
        ].join('/')).join(';') || 'none';

    const aggressionText = Object.entries(handoff.aggressionResults ?? {}).map(([name, value]) =>
        `${name}/${value.AttackType ?? 'Attack'}/${value.ReactionOutcome}/bonus:${value.CounterBonus ?? 0}/margin:${value.Margin}/npcImpair:${npcImpairmentSummary(value.NPCImpairment)}/userDefenseImpair:${userImpairmentSummary(value.UserImpairment)}`,
    ).join(';') || 'none';
    const aggressionGuide = aggressionText === 'none'
        ? buildNoAggressionGuide(resolution, handoff)
        : buildAggressionGuide(handoff.aggressionResults);
    const generatedName = nameGenerationSummary(handoff.nameGeneration);
    const userImpairment = userImpairmentSummary(resolution.UserImpairment);
    const npcImpairment = npcImpairmentSummary(resolution.NPCImpairment);

    const result = naturalOutcomeSummary(resolution);
    const rollAudit = rollAuditFromResultLine(handoff.resultLine, resolution);
    const bindingDirective = buildNaturalGuide({ userAction, resolution, handoff, npcText, proactiveText, chaosText, aggressionText, userImpairment, npcImpairment });

    return {
        userAction,
        decisiveAction: userAction,
        result,
        rollUsed: rollAudit.rollUsed,
        outcome: outcomeAuditLabel(resolution),
        margin: rollAudit.margin,
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
        npc: npcText,
        chaos: chaosText,
        proactive: proactiveText,
        aggression: aggressionText,
        aggressionGuide,
        generatedName,
        bindingDirective,
    };
}

function rollAuditFromResultLine(resultLine, resolution) {
    if (resolution?.STAKES === 'N') return { rollUsed: 'none', margin: 'none' };
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
        margin,
    };
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

function buildNaturalGuide({ userAction, resolution, handoff, npcText, proactiveText, chaosText, aggressionText, userImpairment, npcImpairment }) {
    const goal = resolution.GOAL ?? 'normal';
    const outcome = naturalOutcomeSummary(resolution);
    const primaryNpc = handoff.npcHandoffs?.[0];
    const npcName = primaryNpc?.NPC || list(resolution.ActionTargets) || 'the NPC';
    const state = primaryNpc ? `${primaryNpc.Behavior}/${primaryNpc.Target}` : npcText;
    const gate = strongestIntimacyGate(handoff, resolution);
    const isIntimacyAdvance = goal === 'IntimacyAdvancePhysical' || goal === 'IntimacyAdvanceVerbal';
    const intimacyDenied = isIntimacyAdvance
        && (resolution.IntimacyConsent !== 'Y' || gate === 'DENY');
    const intimacyAllowed = isIntimacyAdvance
        && !intimacyDenied
        && (resolution.IntimacyConsent === 'Y' || resolution.STAKES === 'N' || gate === 'ALLOW');
    const chaosNote = chaosText !== 'none' ? ' Include the listed chaos beat without changing that gate result.' : '';
    const aggressionNote = aggressionText !== 'none'
        ? ' Then narrate the listed NPC attack result exactly and stop at the aggression guide boundary.'
        : '';
    const proactiveNote = aggressionText === 'none' && proactiveText !== 'none'
        ? ' Then let the listed proactive NPC action happen only as denial, boundary, refusal, retreat, resistance, or escalation consistent with the gate.'
        : '';
    const naturalProactiveNote = proactiveText !== 'none'
        ? ' Then narrate the listed proactive NPC action as a present scene beat, following its intent and impulse. If no Aggression result is listed, do not invent a resolved NPC hit.'
        : '';
    const boundaryNote = resolution.classifyPhysicalBoundaryPressure === 'Y'
        ? ' Treat this as physical boundary pressure, not combat: narrate contested possession, space, access, refusal, anger, or resistance without inventing a landed attack.'
        : '';
    const nameInstruction = nameGenerationGuide(handoff.nameGeneration);
    const impairmentInstruction = userImpairmentGuide(resolution.UserImpairment, userImpairment);
    const npcImpairmentInstruction = npcImpairmentGuide(resolution.NPCImpairment, npcImpairment);

    if (intimacyDenied) {
        if (goal === 'IntimacyAdvancePhysical') {
            return `The user action is ${userAction}; resolve it as ${outcome}.${impairmentInstruction}${npcImpairmentInstruction} IntimacyGate=DENY: any successful physical attempt may land or create contact/positioning, but ${npcName} does not cooperate, reciprocate, or become willing; narrate rejection, recoil, pushing away, rebuke, resistance, flight, or escalation according to ${state}.${aggressionNote}${proactiveNote}${chaosNote}${nameInstruction}`;
        }
        return `The user action is ${userAction}; resolve it as ${outcome}.${impairmentInstruction}${npcImpairmentInstruction} IntimacyGate=DENY: any successful verbal attempt may affect ${npcName}, but the request is refused; narrate a boundary, rebuke, annoyance, anger, fear, or refusal according to ${state}, never compliance with the intimacy request.${aggressionNote}${proactiveNote}${chaosNote}${nameInstruction}`;
    }

    if (aggressionText !== 'none') {
        return `The user action is ${userAction}; resolve it as ${outcome}.${impairmentInstruction}${npcImpairmentInstruction} Then narrate the listed NPC attack result. Stop at the aggression guide boundary and do not invent any user follow-up.${nameInstruction}`;
    }

    if (proactiveText !== 'none') {
        return `The user action is ${userAction}; resolve it as ${outcome}.${impairmentInstruction}${npcImpairmentInstruction}${boundaryNote}${naturalProactiveNote}${nameInstruction}`;
    }

    if (isIntimacyAdvance) {
        const gateText = intimacyAllowed
            ? `${npcName} may receive it according to the current gate and relationship state`
            : `${npcName} refuses or sets a boundary because the intimacy gate is not allowing it`;
        return `The user action is ${userAction}; resolve it as ${outcome}.${impairmentInstruction}${npcImpairmentInstruction} ${gateText}.${chaosNote}${nameInstruction}`;
    }

    if (resolution.STAKES === 'N') {
        const chaosNote = chaosText !== 'none' ? ' and include the listed chaos beat as a brief scene event' : '';
        return `The user action is ${userAction}; no roll is needed.${impairmentInstruction}${npcImpairmentInstruction} Keep ${npcName}'s response consistent with ${state}, with no invented hostility or extra mechanics${chaosNote}.${nameInstruction}`;
    }

    if (resolution.classifyPhysicalBoundaryPressure === 'Y') {
        return `The user action is ${userAction}; resolve it as ${outcome}.${impairmentInstruction}${npcImpairmentInstruction} Treat this as physical boundary pressure, not combat: narrate contested possession, space, access, refusal, anger, or resistance according to ${state}, without inventing a landed attack.${chaosNote}${nameInstruction}`;
    }

    if (chaosText !== 'none') {
        return `The user action is ${userAction}; resolve it as ${outcome}.${impairmentInstruction}${npcImpairmentInstruction}${boundaryNote} Include the listed chaos beat while keeping NPC state anchored to ${state}.${nameInstruction}`;
    }

    return `The user action is ${userAction}; resolve it as ${outcome}.${impairmentInstruction}${npcImpairmentInstruction}${boundaryNote} Narrate the NPC response according to ${state} and the listed targets.${nameInstruction}`;
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
            triggersAggressionRoll: value?.TargetsUser === 'Y' ? 'Y' : 'N',
            ProactivityTier: value?.ProactivityTier,
            ProactivityDie: value?.ProactivityDie,
            Threshold: value?.Threshold,
        };
    }
    return formatted;
}

function buildAggressionGuide(aggressionResults) {
    const parts = Object.entries(aggressionResults ?? {}).map(([name, value]) => {
        const attackType = value.AttackType === 'Retaliation'
            ? 'retaliation after the user action'
            : value.AttackType === 'CounterAttack'
                ? `counterattack exploiting the opening (${value.CounterPotential}+${value.CounterBonus})`
                : value.AttackType === 'ProactiveAttack'
                    ? 'proactive attack from current hostile state'
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
        && value?.TargetsUser === 'Y'
        && ['ESCALATE_VIOLENCE', 'BOUNDARY_PHYSICAL', 'THREAT_OR_POSTURE'].includes(value?.Intent));

    if (!hasAggressiveProactivity) return 'none';
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
