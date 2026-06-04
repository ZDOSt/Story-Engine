import assert from 'node:assert/strict';
import fs from 'node:fs';
import { runDeterministicEngines } from './deterministic-runner.js';
import { aggressionReactionOutcome, deriveDirection, normalizeDisposition, updateDisposition } from './engines.js';
import { formatNarratorModelPromptContext, formatNarratorPromptContext } from './pre-flight.js';
import { TRACKER_DELTA_TEMPLATE } from './tracker-delta-contract.js';
import { applyContextualInjuryCapsToTrackerDelta, collectContextualInjuryCaps, formatContextualInjuryCapsForPrompt } from './tracker-injury-caps.js';
import { applyStreamingArtifactDisplayRegex, buildStreamingArtifactRegexScript } from './streaming-artifact-regex.js';
import { getExplicitNamePromotions, isPromotableTrackerName } from './tracker-name-promotions.js';
import { sanitizeAssistantNarration, stripComputedDebugPrefix } from './narration-sanitizer.js';

const stakeKeys = [
  'no_roll',
  'success',
  'failure',
  'dominant_impact',
  'solid_impact',
  'light_impact',
  'struggle',
  'checked',
  'deflected',
  'avoided',
];

const emptyUserDelta = () => ({
  condition: 'unchanged',
  woundsAdd: [],
  woundsRemove: [],
  statusAdd: [],
  statusRemove: [],
  gearAdd: [],
  gearRemove: [],
  inventoryAdd: [],
  inventoryRemove: [],
  tasksAdd: [],
  tasksRemove: [],
  commitmentsAdd: [],
  commitmentsRemove: [],
});

const emptyStakeMap = value => Object.fromEntries(stakeKeys.map(key => [key, value ?? 'none']));

const emptySlowBondEvidence = () => ({
  respectfulContact: false,
  cooperation: false,
  comfortInProximity: false,
  boundaryRespect: false,
  sharedRoutine: false,
  playfulness: false,
  teamwork: false,
  personalAttention: false,
  blockers: [],
});

function relationship(NPC, extra = {}) {
  return {
    NPC,
    initPreset: {
      romanticOpen: false,
      userBadRep: false,
      priorUserGoodRep: false,
      userNonHuman: false,
      fearImmunity: false,
      ...(extra.initPreset || {}),
    },
    auditInteraction: false,
    establishedRelationship: false,
    romanceStyle: 'auto',
    slowBondEvidence: {
      ...emptySlowBondEvidence(),
      ...(extra.slowBondEvidence || {}),
    },
    explicitIntimidationOrCoercion: false,
    stakeChangeByOutcome: emptyStakeMap('none'),
    overrideFlags: {
      CurrentInvitation: false,
      Exploitation: false,
      Hedonist: false,
      Transactional: false,
      Established: false,
      ...(extra.overrideFlags || {}),
    },
    genStats: {
      Rank: 'Average',
      MainStat: 'Balanced',
      PHY: 5,
      MND: 5,
      CHA: 5,
      ...(extra.genStats || {}),
    },
    ...extra,
  };
}

function baseLedger(overrides = {}) {
  return {
    engineContext: {
      userCoreStats: { Rank: 'Average', MainStat: 'Balanced', PHY: 6, MND: 6, CHA: 6 },
      trackerRelevantNPCs: [],
      ...(overrides.engineContext || {}),
    },
    resolutionEngine: {
      identifyGoal: 'Normal_Interaction',
      identifyChallenge: 'ordinary conversation',
      explicitMeans: 'ordinary conversation',
      userAbilityUse: {
        used: false,
        attempted: false,
        available: false,
        abilityName: '(none)',
        evidence: '(none)',
        narrativeEffect: '(none)',
        noEffectReason: '(none)',
        mechanicalScope: 'flavor_only_no_bonus',
      },
      itemUse: {
        attempted: false,
        available: false,
        item: '(none)',
        source: 'none',
        evidence: '(none)',
        noEffectReason: '(none)',
      },
      claimCheck: {
        present: false,
        claim: '(none)',
        targetNPC: '(none)',
        truthStatus: 'none',
        npcAccess: 'none',
        stakesImpact: false,
        reason: '(none)',
      },
      identifyTargets: {
        hostilesInScene: { NPC: [] },
        ActionTargets: [],
        OppTargets: { NPC: [], ENV: [] },
        BenefitedObservers: [],
        HarmedObservers: [],
        PowerActors: [],
      },
      intimacyAdvanceExplicit: false,
      boundaryViolationExplicit: false,
      hasStakes: false,
      actionCount: ['a1'],
      mapStats: { USER: 'CHA', OPP: 'CHA' },
      classifyHostilePhysicalIntent: false,
      activeHostileThreat: false,
      classifyPhysicalBoundaryPressure: false,
      genStats: { Rank: 'Average', MainStat: 'Balanced', PHY: 5, MND: 5, CHA: 5 },
      ...(overrides.resolutionEngine || {}),
    },
    relationshipEngine: overrides.relationshipEngine || [],
    injuryEffectEngine: {
      effects: [],
      ...(overrides.injuryEffectEngine || {}),
    },
    powerActorEnmity: {
      assessments: [],
      effects: [],
      ...(overrides.powerActorEnmity || {}),
    },
    powerEventShape: {
      events: [],
      ...(overrides.powerEventShape || {}),
    },
    trackerUpdateEngine: {
      user: emptyUserDelta(),
      npcs: [],
      ...(overrides.trackerUpdateEngine || {}),
    },
    chaosSemantic: { sceneSummary: overrides.sceneSummary || '' },
    nameSemantic: {
      selectedStyle: 'Balanced Fantasy',
      maleCandidates: [],
      femaleCandidates: [],
      locationCandidates: [],
      ...(overrides.nameSemantic || {}),
    },
    proactivitySemantic: {},
  };
}

function trackerEntry(overrides = {}) {
  return {
    currentDisposition: { B: 2, F: 2, H: 2 },
    currentRapport: 0,
    lastRapportGainActiveMs: -1,
    establishedRelationship: 'N',
    userHistory: { knowsUser: 'N', standing: 'neutral' },
    raceProfile: { race: '', category: 'unknown', fearProfile: 'normal' },
    personalitySummary: '',
    slowBondEvidence: {
      respectfulContact: 0,
      cooperation: 0,
      comfortInProximity: 0,
      boundaryRespect: 0,
      sharedRoutine: 0,
      playfulness: 0,
      teamwork: 0,
      personalAttention: 0,
      blockers: [],
      lastUpdatedScene: '',
    },
    proactivityMemory: {
      interchangeCount: 0,
      romanceCycle: 0,
      romanceBlocked: 'N',
      pendingTag: 'NONE',
      pendingSince: 0,
      acceptedTags: [],
      refusedTags: [],
      partnerMeaningfulCooldownUntilActiveMs: 0,
      lastMeaningfulPartnerTag: 'NONE',
      cooldowns: {
        Thoughtful_Gift: 0,
        Ask_Date: 0,
        Partner_Date: 0,
        Partner_Gift: 0,
        Partner_Conflict: 0,
      },
    },
    currentCoreStats: { Rank: 'Average', MainStat: 'Balanced', PHY: 5, MND: 5, CHA: 5 },
    hostilePressure: 0,
    hostileLandedPressure: 0,
    dominantLock: 'None',
    pressureMode: 'none',
    lifecycle: 'Active',
    condition: 'healthy',
    wounds: [],
    statusEffects: [],
    gear: [],
    ...overrides,
  };
}

function context(latestUserText = '', tracker = {}, user = {}, persona = 'PHY: 6\nMND: 6\nCHA: 6', chat = null, rapportClock = {}, cardFields = {}, powerActors = {}) {
  return {
    chat: chat || (latestUserText ? [{ is_user: true, mes: latestUserText }] : []),
    name1: cardFields.name1 || 'Aelemar',
    structuredPreflightSettings: cardFields.structuredPreflightSettings || {},
    extensionSettings: cardFields.extensionSettings || {},
    chatMetadata: {
      structuredPreflightTracker: {
        npcs: tracker,
        user,
        rapportClock,
        powerActors,
        snapshots: {},
      },
    },
    getCharacterCardFields() {
      return { persona, ...cardFields };
    },
  };
}

function withDice(dice, fn) {
  const oldRandom = Math.random;
  let index = 0;
  Math.random = () => {
    const die = dice[index++] ?? 10;
    return (Math.max(1, Math.min(20, die)) - 0.5) / 20;
  };
  try {
    return fn();
  } finally {
    Math.random = oldRandom;
  }
}

function runCase(config) {
  return withDice(config.dice || [10, 10, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], () =>
    runDeterministicEngines(
      config.ledger,
      config.tracker || {},
      context(config.userText || '', config.tracker || {}, config.userState || {}, config.persona, config.chat || null, config.rapportClock || {}, config.cardFields || {}, config.powerActors || {}),
      'normal',
    ),
  );
}

function prompt(report) {
  return formatNarratorModelPromptContext(report);
}

function auditPrompt(report) {
  return formatNarratorPromptContext(report);
}

function auditIncludes(report, text) {
  return report.auditLines.some(line => line.includes(text));
}

function nthRandomForDie(die, sides) {
  return (Math.max(1, Math.min(sides, die)) - 0.5) / sides;
}

function runCaseWithRandoms(config, randoms) {
  const oldRandom = Math.random;
  let index = 0;
  Math.random = () => randoms[index++] ?? nthRandomForDie(10, 20);
  try {
    return runDeterministicEngines(
      config.ledger,
      config.tracker || {},
      context(config.userText || '', config.tracker || {}, config.userState || {}, config.persona, null, config.rapportClock || {}, config.cardFields || {}, config.powerActors || {}),
      'normal',
    );
  } finally {
    Math.random = oldRandom;
  }
}

const tests = [
  {
    name: '00 relationship disposition invariants normalize trust and locks',
    run() {
      assert.deepEqual(updateDisposition({ B: 2, F: 2, H: 2 }, { b: 1, f: 0, h: 0 }), { B: 3, F: 2, H: 2 });
      assert.deepEqual(updateDisposition({ B: 3, F: 1, H: 1 }, { b: 1, f: 1, h: 1 }), { B: 4, F: 2, H: 2 });
      assert.deepEqual(normalizeDisposition({ B: 3, F: 2, H: 2 }), { B: 3, F: 2, H: 2 });
      assert.deepEqual(normalizeDisposition({ B: 4, F: 2, H: 2 }), { B: 4, F: 2, H: 2 });
      assert.deepEqual(normalizeDisposition({ B: 3, F: 3, H: 2 }), { B: 1, F: 3, H: 2 });
      assert.deepEqual(normalizeDisposition('B4/F2/H2'), { B: 4, F: 2, H: 2 });
    },
  },
  {
    name: '01 I love you stays no-stakes social',
    run() {
      const report = runCase({
        userText: 'I look at Seraphina and say, "I love you."',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'I say I love you',
            explicitMeans: 'I say I love you',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.GOAL, 'Normal_Interaction');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.STAKES, 'N');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
    },
  },
  {
    name: '01a pure love declaration is hard-forced no-roll even when semantic marks stakes',
    run() {
      const tracker = { Valerie: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        userText: '"I love you too" I say, without looking at her.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'Express love to Valerie verbally',
            explicitMeans: 'I love you too',
            identifyTargets: { ActionTargets: ['Valerie'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'CHA', OPP: 'ENV' },
          },
          relationshipEngine: [relationship('Valerie', {
            stakeChangeByOutcome: {
              ...emptyStakeMap('none'),
              success: 'harm',
              light_impact: 'harm',
            },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.STAKES, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.Outcome, 'no_roll');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.LandedActions, '(none)');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].FinalState, 'B4/F1/H1');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
      assert.equal(auditIncludes(report, 'hard_override_pure_love_declaration_no_roll'), true);
    },
  },
  {
    name: '01b asking to kiss is no-roll when no boundary was violated',
    run() {
      const tracker = { Valerie: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        userText: 'I say, "I love you. Can I kiss you?"',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Valerie for a kiss',
            identifyChallenge: 'I love you and ask if I can kiss Valerie',
            explicitMeans: 'I love you. Can I kiss you?',
            identifyTargets: { ActionTargets: ['Valerie'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: true,
            mapStats: { USER: 'CHA', OPP: 'CHA' },
          },
          relationshipEngine: [relationship('Valerie')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.STAKES, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.intimacyAdvanceExplicit, 'Y');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'DENY');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyRefusalStyle, 'SOFT');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.Outcome, 'no_roll');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
      assert.match(prompt(report), /Intimacy is not permitted for Valerie/);
      assert.match(prompt(report), /This denial alone is not a dice roll or relationship penalty/);
      assert.equal(auditIncludes(report, 'hard_override_romance_conversation_no_roll'), true);
    },
  },
  {
    name: '02 flirt response to NPC tease is ordinary scene continuity',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }) };
      const report = runCase({
        userText: '"What distractions did you have in mind?" I ask Seraphina with a teasing smile.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'tease Seraphina back',
            identifyChallenge: 'ask what distractions Seraphina had in mind',
            explicitMeans: 'teasing question',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: false,
            boundaryViolationExplicit: false,
            hasStakes: true,
            mapStats: { USER: 'CHA', OPP: 'CHA' },
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.STAKES, 'N');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'SKIP');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].FinalState, 'B3/F1/H1');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
    },
  },
  {
    name: '02b B4 suggestive banter is capped below intimacy without allow path',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCaseWithRandoms({
        userText: 'I keep my voice low and say, "I wonder how tight it is."',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'suggestive banter with Seraphina',
            explicitMeans: 'suggestive innuendo',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: false,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', { romanceStyle: 'flirt' })],
        }),
      }, [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(1, 20),
      ]);
      const handoff = report.finalNarrativeHandoff.npcHandoffs[0];
      const modelPrompt = prompt(report);
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.STAKES, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.intimacyAdvanceExplicit, 'N');
      assert.equal(handoff.EstablishedRelationship, 'N');
      assert.equal(handoff.IntimacyBoundary, 'SKIP');
      assert.equal(report.finalNarrativeHandoff.proactivityResults.Seraphina.Proactive, 'N');
      assert.match(modelPrompt, /conversation alone is not permission for intimate escalation/);
      assert.match(modelPrompt, /Unless IntimacyBoundary explicitly permits it/);
      assert.match(modelPrompt, /inn room, a private room/);
      assert.match(modelPrompt, /secluded intimacy/);
    },
  },
  {
    name: '02c proactivity cannot bypass no-permission intimacy guard',
    run() {
      const report = {
        semanticLedger: {
          resolutionEngine: {
            explicitMeans: 'ask Naomi what she wants to show',
          },
        },
        finalNarrativeHandoff: {
          resultLine: '',
          resolutionPacket: {
            GOAL: 'Normal_Interaction',
            actions: ['a1'],
            intimacyAdvanceExplicit: 'N',
            boundaryViolationExplicit: 'N',
            STAKES: 'N',
            LandedActions: '(none)',
            OutcomeTier: 'No_Roll',
            Outcome: 'no_roll',
            CounterPotential: 'none',
            classifyHostilePhysicalIntent: 'N',
            activeHostileThreat: 'N',
            classifyPhysicalBoundaryPressure: 'N',
            CompanionCommand: null,
            hostilesInScene: { NPC: [] },
            ActionTargets: ['Naomi'],
            OppTargets: { NPC: [], ENV: [] },
            BenefitedObservers: [],
            HarmedObservers: [],
            NPCInScene: ['Naomi'],
            UserImpairment: { Relevant: 'N' },
            NPCImpairment: { Relevant: 'N' },
            InflictedInjuries: [],
          },
          npcHandoffs: [{
            NPC: 'Naomi',
            FinalState: 'B3/F1/H1',
            Behavior: 'FRIENDLY',
            Target: 'No Change',
            NPC_STAKES: 'N',
            Landed: 'N',
            IntimacyBoundary: 'SKIP',
            IntimacyBoundarySource: 'NONE',
            IntimacyRefusalStyle: 'NONE',
            BoundaryPressure: 'N',
          }],
          chaosHandoff: { CHAOS: { triggered: false } },
          proactivityResults: {
            Naomi: {
              Proactive: 'Y',
              Intent: 'PLAN_OR_BANTER',
              Impulse: 'BOND',
              ProactivityTarget: '{{user}}',
              TargetsUser: 'Y',
            },
          },
          aggressionResults: {},
          nameGeneration: {},
          sceneTrackerUpdate: {},
        },
      };
      const modelPrompt = prompt(report);
      assert.match(modelPrompt, /include this NPC initiative/i);
      assert.match(modelPrompt, /Universal intimacy guard: no intimacy permission is active for Naomi/);
      assert.match(modelPrompt, /conversation alone is not permission for intimate escalation/);
      assert.match(modelPrompt, /bra or panties display/);
      assert.match(modelPrompt, /offering or showing their body/);
      assert.match(modelPrompt, /consent-by-momentum/);
      assert.match(modelPrompt, /relationship acceptance/);
    },
  },
  {
    name: '02a persona-name pure love declaration is hard-forced no-roll',
    run() {
      const tracker = { Valerie: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        userText: '"I love Aelemar too" I say, without looking at her.',
        tracker,
        cardFields: { name1: 'Aelemar' },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'Express love to Valerie verbally by saying I love Aelemar too',
            explicitMeans: 'I love Aelemar too',
            identifyTargets: { ActionTargets: ['Valerie'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'CHA', OPP: 'ENV' },
          },
          relationshipEngine: [relationship('Valerie')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.STAKES, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.Outcome, 'no_roll');
      assert.equal(auditIncludes(report, 'hard_override_pure_love_declaration_no_roll'), true);
    },
  },
  {
    name: '03 physical affection without refusal is not converted into a roll',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        userText: 'I put my arms around Seraphina and kiss her softly.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'kiss Seraphina softly',
            identifyChallenge: 'kiss Seraphina softly',
            explicitMeans: 'put arms around Seraphina and kiss her softly',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'PHY' },
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.STAKES, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.LandedActions, '(none)');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'DENY');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyRefusalStyle, 'SOFT');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].FinalState, 'B4/F1/H1');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'N');
    },
  },
  {
    name: '04 established relationship permits intimacy without a roll',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 }, establishedRelationship: 'Y' }) };
      const report = runCase({
        userText: 'I kiss Seraphina good morning and ask how she slept.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'kiss Seraphina good morning',
            identifyChallenge: 'kiss Seraphina good morning',
            explicitMeans: 'kiss Seraphina good morning',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.STAKES, 'N');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'Y');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'ALLOW');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundarySource, 'ESTABLISHED_RELATIONSHIP');
      assert.equal(report.trackerUpdate.npcs.Seraphina.establishedRelationship, 'Y');
    },
  },
  {
    name: '05 NPC confession accepted by user establishes relationship at B4',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        chat: [
          { is_user: true, mes: 'I sit beside Seraphina and wait.' },
          { is_user: false, mes: 'Seraphina takes your hand. "I love you. I want us to be together."' },
          { is_user: true, mes: 'I put my arms around her waist, pull her against me, and kiss her.' },
        ],
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'accept Seraphina confession with a kiss',
            identifyChallenge: 'accept Seraphina confession with a kiss',
            explicitMeans: 'put arms around Seraphina, pull her against me, and kiss her',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'Y');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'ALLOW');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundarySource, 'ESTABLISHED_RELATIONSHIP');
      assert.equal(report.trackerUpdate.npcs.Seraphina.establishedRelationship, 'Y');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.STAKES, 'N');
    },
  },
  {
    name: '06 user confession accepted by NPC establishes relationship at B4',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        chat: [
          { is_user: true, mes: 'I tell Seraphina, "I love you. I want us to be together."' },
          { is_user: false, mes: 'Seraphina grips your hands. "Yes. I love you too."' },
          { is_user: true, mes: 'I ask Seraphina how she wants to spend the evening.' },
        ],
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Seraphina about the evening',
            identifyChallenge: 'ask Seraphina about the evening',
            explicitMeans: 'ask Seraphina how she wants to spend the evening',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: false,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'Y');
      assert.equal(report.trackerUpdate.npcs.Seraphina.establishedRelationship, 'Y');
    },
  },
  {
    name: '06a macro-expanded persona name in NPC confession establishes relationship',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        chat: [
          { is_user: true, mes: 'I sit beside Seraphina and wait.' },
          { is_user: false, mes: 'Seraphina takes your hand. "Aelemar, I love you. Will Aelemar be mine?"' },
          { is_user: true, mes: 'I put my arms around her waist, pull her against me, and kiss her.' },
        ],
        tracker,
        cardFields: { name1: 'Aelemar' },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'accept Seraphina confession with a kiss',
            identifyChallenge: 'accept Seraphina confession with a kiss',
            explicitMeans: 'put arms around Seraphina, pull her against me, and kiss her',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'Y');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'ALLOW');
      assert.equal(report.trackerUpdate.npcs.Seraphina.establishedRelationship, 'Y');
    },
  },
  {
    name: '06b macro-expanded persona name in user confession accepted by NPC establishes relationship',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        chat: [
          { is_user: true, mes: 'I tell Seraphina, "I love Aelemar? No. I mean I love you, and I want us together."' },
          { is_user: false, mes: 'Seraphina grips your hands. "Yes. I choose Aelemar too."' },
          { is_user: true, mes: 'I ask Seraphina how she wants to spend the evening.' },
        ],
        tracker,
        cardFields: { name1: 'Aelemar' },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Seraphina about the evening',
            identifyChallenge: 'ask Seraphina about the evening',
            explicitMeans: 'ask Seraphina how she wants to spend the evening',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: false,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'Y');
      assert.equal(report.trackerUpdate.npcs.Seraphina.establishedRelationship, 'Y');
    },
  },
  {
    name: '07 B4 physical affection without declaration does not establish relationship',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        chat: [
          { is_user: true, mes: 'I sit beside Seraphina and smile.' },
          { is_user: false, mes: 'Seraphina smiles back and stays close by the fire.' },
          { is_user: true, mes: 'I put my arms around her waist, pull her against me, and kiss her.' },
        ],
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'kiss Seraphina without established relationship',
            identifyChallenge: 'kiss Seraphina without established relationship',
            explicitMeans: 'put arms around Seraphina, pull her against me, and kiss her',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'N');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'DENY');
      assert.equal(report.trackerUpdate.npcs.Seraphina.establishedRelationship, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.STAKES, 'N');
    },
  },
  {
    name: '07a pushing after refusal triggers boundary violation and hostility',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }) };
      const report = runCase({
        userText: 'After Seraphina says no and pulls away, I keep pressuring her to kiss me anyway.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'pressure Seraphina after refusal',
            identifyChallenge: 'keep pressuring Seraphina to kiss me after she said no',
            explicitMeans: 'pressure after refusal',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: ['Seraphina'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: true,
            hasStakes: true,
            mapStats: { USER: 'CHA', OPP: 'MND' },
          },
          relationshipEngine: [relationship('Seraphina', {
            stakeChangeByOutcome: {
              ...emptyStakeMap('none'),
              success: 'harm',
              light_impact: 'harm',
              solid_impact: 'harm',
              dominant_impact: 'harm',
            },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.boundaryViolationExplicit, 'Y');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.STAKES, 'Y');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'Hostility');
      assert.deepEqual(report.trackerUpdate.npcs.Seraphina.currentDisposition, { B: 3, F: 1, H: 2 });
    },
  },
  {
    name: '07a.1 B2 intimacy ask is denied clearly without relationship penalty',
    run() {
      const tracker = { Mira: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 2 } }) };
      const report = runCase({
        userText: 'I ask Mira, "Can I kiss you?"',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Mira for a kiss',
            identifyChallenge: 'ask Mira for a kiss',
            explicitMeans: 'Can I kiss you?',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: true,
            mapStats: { USER: 'CHA', OPP: 'CHA' },
          },
          relationshipEngine: [relationship('Mira')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.STAKES, 'N');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'DENY');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyRefusalStyle, 'CLEAR');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
      assert.equal(report.trackerUpdate.npcs.Mira.currentDisposition.B, 2);
      assert.match(prompt(report), /clear, direct, practical, or reserved/);
    },
  },
  {
    name: '07a.2 hostility tunes intimacy denial hostile without a roll',
    run() {
      const tracker = { Mira: trackerEntry({ currentDisposition: { B: 2, F: 1, H: 3 } }) };
      const report = runCase({
        userText: 'I ask Mira, "Can I kiss you?"',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Mira for a kiss',
            identifyChallenge: 'ask Mira for a kiss',
            explicitMeans: 'Can I kiss you?',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Mira')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'DENY');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyRefusalStyle, 'HOSTILE');
      assert.match(prompt(report), /firm, angry, suspicious, contemptuous, or openly resistant/);
    },
  },
  {
    name: '07a.3 override permits intimacy without established relationship',
    run() {
      const tracker = { Mira: trackerEntry({ currentDisposition: { B: 2, F: 1, H: 2 } }) };
      const report = runCase({
        userText: 'I ask Mira if she wants to come to bed with me.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Mira to come to bed',
            identifyChallenge: 'ask Mira to come to bed',
            explicitMeans: 'ask Mira if she wants to come to bed with me',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Mira', {
            overrideFlags: { Hedonist: true },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'ALLOW');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundarySource, 'OVERRIDE:Hedonist');
      assert.match(prompt(report), /the NPC has the Hedonist override/);
    },
  },
  {
    name: '07a.3a current invitation override permits explicit NPC offer follow-through',
    run() {
      const tracker = { Naomi: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }) };
      const report = runCase({
        userText: 'I say yes and move closer to Naomi.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'accept Naomi sexual invitation',
            identifyChallenge: 'accept Naomi sexual invitation',
            explicitMeans: 'say yes and move closer to Naomi',
            identifyTargets: { ActionTargets: ['Naomi'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Naomi', {
            overrideFlags: { CurrentInvitation: true },
          })],
        }),
      });
      const handoff = report.finalNarrativeHandoff.npcHandoffs[0];
      assert.equal(handoff.Override, 'CurrentInvitation');
      assert.equal(handoff.IntimacyBoundary, 'ALLOW');
      assert.equal(handoff.IntimacyBoundarySource, 'OVERRIDE:CurrentInvitation');
      assert.match(prompt(report), /clearly offered, requested, invited, strongly implied, or physically initiated/);
      assert.match(prompt(report), /Do not reverse, withdraw, panic, or stop at the moment of follow-through/);
      assert.doesNotMatch(prompt(report), /no intimacy permission is active for Naomi/);
    },
  },
  {
    name: '07a.3b exploitation override permits intimacy without established relationship',
    run() {
      const tracker = { Naomi: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }) };
      const report = runCase({
        userText: 'I ask Naomi if she wants to come to bed with me.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Naomi to come to bed',
            identifyChallenge: 'ask Naomi to come to bed',
            explicitMeans: 'ask Naomi if she wants to come to bed with me',
            identifyTargets: { ActionTargets: ['Naomi'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Naomi', {
            overrideFlags: { Exploitation: true },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Override, 'Exploitation');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'ALLOW');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundarySource, 'OVERRIDE:Exploitation');
      assert.match(prompt(report), /the NPC has the Exploitation override/);
      assert.doesNotMatch(prompt(report), /no intimacy permission is active for Naomi/);
    },
  },
  {
    name: '07a.3bb current invitation has priority over background override flags',
    run() {
      const tracker = { Mira: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }) };
      const report = runCase({
        userText: 'I accept Mira and pull her closer.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'accept Mira intimate invitation',
            identifyChallenge: 'accept Mira intimate invitation',
            explicitMeans: 'accept Mira and pull her closer',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Mira', {
            overrideFlags: { CurrentInvitation: true, Hedonist: true, Established: true },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Override, 'CurrentInvitation');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundarySource, 'OVERRIDE:CurrentInvitation');
    },
  },
  {
    name: '07a.3c established override permits receptive prior intimacy without relationship',
    run() {
      const tracker = { Mira: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 }, establishedRelationship: 'N' }) };
      const report = runCase({
        userText: 'I ask Mira if she wants to come to bed with me again.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Mira to come to bed again',
            identifyChallenge: 'ask Mira to come to bed again',
            explicitMeans: 'ask Mira if she wants to come to bed with me again',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Mira', {
            overrideFlags: { Established: true },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Override, 'Established');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'N');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'ALLOW');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundarySource, 'OVERRIDE:Established');
      assert.match(prompt(report), /the NPC has the Established override/);
      assert.doesNotMatch(prompt(report), /no intimacy permission is active for Mira/);
    },
  },
  {
    name: '07a.3d prior intimacy without current receptivity remains denied',
    run() {
      const tracker = { Mira: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 }, establishedRelationship: 'N' }) };
      const report = runCase({
        userText: 'I ask Mira if she wants to come to bed with me again.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Mira to come to bed again',
            identifyChallenge: 'ask Mira to come to bed again',
            explicitMeans: 'ask Mira if she wants to come to bed with me again',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Mira')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Override, 'NONE');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'N');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'DENY');
      assert.match(prompt(report), /Intimacy is not permitted for Mira/);
      assert.match(prompt(report), /no intimacy permission is active for Mira/);
    },
  },
  {
    name: '07a.3e withdrawn invitation remains denied without active override',
    run() {
      const tracker = { Naomi: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 }, establishedRelationship: 'N' }) };
      const report = runCase({
        userText: 'I move closer to Naomi anyway.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'move closer to Naomi after withdrawal',
            identifyChallenge: 'move closer to Naomi after withdrawal',
            explicitMeans: 'move closer to Naomi anyway',
            identifyTargets: { ActionTargets: ['Naomi'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Naomi')],
        }),
      });
      const handoff = report.finalNarrativeHandoff.npcHandoffs[0];
      assert.equal(handoff.Override, 'NONE');
      assert.equal(handoff.IntimacyBoundary, 'DENY');
      assert.match(prompt(report), /Intimacy is not permitted for Naomi/);
      assert.match(prompt(report), /no intimacy permission is active for Naomi/);
    },
  },
  {
    name: '07a.4 NPC-initiated intimacy permits user reciprocation',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }) };
      const report = runCase({
        chat: [
          { is_user: true, mes: 'I sit with Seraphina by the fire.' },
          { is_user: false, mes: 'Seraphina leans closer, cheeks pink. "Can I kiss you?"' },
          { is_user: true, mes: 'I nod and kiss her back softly.' },
        ],
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'accept Seraphina kiss',
            identifyChallenge: 'kiss Seraphina back softly',
            explicitMeans: 'nod and kiss her back softly',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'ALLOW');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundarySource, 'NPC_INITIATED');
    },
  },
  {
    name: '07a.4b NPC-initiated intimacy toward persona name permits user reciprocation',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }) };
      const report = runCase({
        chat: [
          { is_user: true, mes: 'I sit with Seraphina by the fire.' },
          { is_user: false, mes: 'Seraphina leans closer, cheeks pink. "Can I kiss Aelemar?"' },
          { is_user: true, mes: 'I nod and kiss her back softly.' },
        ],
        tracker,
        cardFields: { name1: 'Aelemar' },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'accept Seraphina kiss',
            identifyChallenge: 'kiss Seraphina back softly',
            explicitMeans: 'nod and kiss her back softly',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'ALLOW');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundarySource, 'NPC_INITIATED');
    },
  },
  {
    name: '07a.4c persona name in target list is removed as player not NPC',
    run() {
      const tracker = { Seraphina: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }) };
      const report = runCase({
        userText: 'I ask Seraphina to help me.',
        tracker,
        cardFields: { name1: 'Aelemar' },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Seraphina for help',
            identifyChallenge: 'ask Seraphina for help',
            explicitMeans: 'ask Seraphina for help',
            identifyTargets: {
              ActionTargets: ['Seraphina', 'Aelemar'],
              OppTargets: { NPC: ['Aelemar'], ENV: [] },
              BenefitedObservers: ['Aelemar'],
              HarmedObservers: [],
            },
            intimacyAdvanceExplicit: false,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Aelemar')],
        }),
      });
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.ActionTargets, ['Seraphina']);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['(none)']);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.BenefitedObservers, ['(none)']);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs.some(item => item.NPC === 'Aelemar'), false);
      assert.equal(auditIncludes(report, 'deterministicUserTargetNormalization'), true);
    },
  },
  {
    name: '07a.5 multi-target intimacy narrator includes every boundary',
    run() {
      const tracker = {
        Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 }, establishedRelationship: 'Y' }),
        Mira: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 2 } }),
      };
      const report = runCase({
        userText: 'I ask Seraphina and Mira, "Can I kiss both of you?"',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Seraphina and Mira for a kiss',
            identifyChallenge: 'ask Seraphina and Mira for a kiss',
            explicitMeans: 'Can I kiss both of you?',
            identifyTargets: { ActionTargets: ['Seraphina', 'Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Mira')],
        }),
      });
      const seraphina = report.finalNarrativeHandoff.npcHandoffs.find(item => item.NPC === 'Seraphina');
      const mira = report.finalNarrativeHandoff.npcHandoffs.find(item => item.NPC === 'Mira');
      const modelPrompt = prompt(report);
      assert.equal(seraphina?.IntimacyBoundary, 'ALLOW');
      assert.equal(mira?.IntimacyBoundary, 'DENY');
      assert.match(modelPrompt, /Intimacy is permitted for Seraphina/);
      assert.match(modelPrompt, /Intimacy is not permitted for Mira/);
    },
  },
  {
    name: '07a.6 denied intimacy does not force B4 flirt proactivity',
    run() {
      const tracker = {
        Mira: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(22, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I ask Mira, "Can I kiss you?"',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Mira for a kiss',
            identifyChallenge: 'ask Mira for a kiss',
            explicitMeans: 'Can I kiss you?',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: true,
            mapStats: { USER: 'CHA', OPP: 'CHA' },
          },
          relationshipEngine: [relationship('Mira', { romanceStyle: 'flirt' })],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Mira;
      const modelPrompt = prompt(report);
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.RomanceInitiative, 'N');
      assert.equal(proactive.RomanceInitiativeTag, '(none)');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'DENY');
      assert.match(modelPrompt, /Intimacy is not permitted for Mira/);
      assert.match(modelPrompt, /Keep this fully compatible with the intimacy denial/);
      assert.doesNotMatch(modelPrompt, /Mira is flirtatious toward/);
    },
  },
  {
    name: '07a.7 denied intimacy blocks date-and-confess proactivity',
    run() {
      const tracker = {
        Mira: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          proactivityMemory: {
            acceptedTags: ['Thoughtful_Gift', 'Ask_Date'],
          },
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(98, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I ask Mira, "Can I kiss you?"',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Mira for a kiss',
            identifyChallenge: 'ask Mira for a kiss',
            explicitMeans: 'Can I kiss you?',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Mira', { romanceStyle: 'flirt' })],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Mira;
      const modelPrompt = prompt(report);
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.RomanceInitiative, 'N');
      assert.equal(proactive.RomanceInitiativeTag, '(none)');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].IntimacyBoundary, 'DENY');
      assert.match(modelPrompt, /Intimacy is not permitted for Mira/);
      assert.doesNotMatch(modelPrompt, /special date|relationship-oriented confession|Date_And_Confess/);
    },
  },
  {
    name: '07a.8 denied intimacy keeps other NPC proactivity guidance',
    run() {
      const tracker = {
        Mira: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 2 } }),
        Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }),
      };
      const report = runCase({
        userText: 'I ask Mira, "Can I kiss you?" while Seraphina watches nearby.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ask Mira for a kiss',
            identifyChallenge: 'ask Mira for a kiss',
            explicitMeans: 'Can I kiss you?',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: false,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Mira'), relationship('Seraphina')],
        }),
      });
      report.finalNarrativeHandoff.proactivityResults.Seraphina = {
        Proactive: 'Y',
        Intent: 'Thoughtful_Gift',
        Impulse: 'BOND',
        ProactivityTarget: '{{user}}',
        TargetsUser: 'Y',
        RomanceInitiative: 'Y',
        RomanceInitiativeTag: 'Thoughtful_Gift',
        RomanceInitiativeDie: 72,
        RomanceInitiativeContext: 'calm',
      };
      const modelPrompt = prompt(report);
      assert.match(modelPrompt, /Intimacy is not permitted for Mira/);
      assert.match(modelPrompt, /Seraphina offers or prepares a small thoughtful gift/);
    },
  },
  {
    name: '07b bystander does not receive boundary harm from another NPC target',
    run() {
      const tracker = {
        Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }),
        Mira: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 2 } }),
      };
      const report = runCase({
        userText: 'After Seraphina says no, I keep pressuring Seraphina while Mira watches nearby.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'pressure Seraphina after refusal',
            identifyChallenge: 'keep pressuring Seraphina after she said no',
            explicitMeans: 'pressure after refusal',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: ['Seraphina'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            intimacyAdvanceExplicit: true,
            boundaryViolationExplicit: true,
            hasStakes: true,
            mapStats: { USER: 'CHA', OPP: 'MND' },
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Mira')],
        }),
      });
      const seraphina = report.finalNarrativeHandoff.npcHandoffs.find(item => item.NPC === 'Seraphina');
      const mira = report.finalNarrativeHandoff.npcHandoffs.find(item => item.NPC === 'Mira');
      assert.equal(seraphina?.Target, 'Hostility');
      assert.equal(mira, undefined);
      assert.deepEqual(report.trackerUpdate.npcs.Seraphina.currentDisposition, { B: 3, F: 1, H: 2 });
      assert.equal(report.trackerUpdate.npcs.Mira.currentDisposition.H, 2);
    },
  },
  {
    name: '08 slow bond promotes B3 to B4 with two evidence categories',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 3, F: 1, H: 1 },
          currentRapport: 5,
        }),
      };
      const report = runCase({
        userText: 'I settle beside Seraphina by the fire, help mend the strap on her bracer, and keep my hands careful when she shifts closer.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'share quiet care beside the fire',
            identifyChallenge: 'share quiet care beside the fire',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              respectfulContact: true,
              cooperation: true,
            },
          })],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 4);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].SlowBondEligible, 'Y');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].SlowBondEvidenceCount, 2);
    },
  },
  {
    name: '09 slow bond does not promote with only one evidence category',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 3, F: 1, H: 1 },
          currentRapport: 5,
        }),
      };
      const report = runCase({
        userText: 'I help Seraphina pack the camp and keep respectful distance.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'help pack camp',
            identifyChallenge: 'help pack camp',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              cooperation: true,
            },
          })],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 3);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].SlowBondEligible, 'N');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].SlowBondEvidenceCount, 1);
    },
  },
  {
    name: '09a no-stakes friendly interaction can promote B1 to B2 with rapport one',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 1, F: 1, H: 1 },
          currentRapport: 1,
        }),
      };
      const report = runCase({
        userText: 'I sit with Seraphina and help her sort the camp supplies.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'help Seraphina sort camp supplies',
            identifyChallenge: 'help Seraphina sort camp supplies',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              cooperation: true,
            },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'Bond');
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 2);
    },
  },
  {
    name: '09a.1 no-stakes friendly No Change can promote B1 to B2 with rapport one',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 1, F: 1, H: 1 },
          currentRapport: 1,
        }),
      };
      const report = runCase({
        userText: 'I spend a quiet evening talking with Seraphina about ordinary things.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'talk with Seraphina',
            identifyChallenge: 'talk with Seraphina',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              blockers: [''],
            },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 2);
    },
  },
  {
    name: '09b no-stakes friendly interaction can promote B2 to B3 with rapport three',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 2, F: 1, H: 1 },
          currentRapport: 3,
        }),
      };
      const report = runCase({
        userText: 'I walk beside Seraphina and trade easy jokes while we repair the fence.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'repair the fence with Seraphina',
            identifyChallenge: 'repair the fence with Seraphina',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              cooperation: true,
              playfulness: true,
            },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'Bond');
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 3);
    },
  },
  {
    name: '09b.1 no-stakes friendly No Change can promote B2 to B3 with rapport three',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 2, F: 1, H: 1 },
          currentRapport: 3,
        }),
      };
      const report = runCase({
        userText: 'I keep Seraphina company during the slow watch.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'keep Seraphina company',
            identifyChallenge: 'keep Seraphina company',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              blockers: [''],
            },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 3);
    },
  },
  {
    name: '09c no-stakes friendly interaction alone does not promote B3 to B4',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 3, F: 1, H: 1 },
          currentRapport: 5,
        }),
      };
      const report = runCase({
        userText: 'I share a quiet meal with Seraphina at the edge of camp.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'share a quiet meal with Seraphina',
            identifyChallenge: 'share a quiet meal with Seraphina',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              sharedRoutine: true,
            },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'Bond');
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 3);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].SlowBondEligible, 'N');
    },
  },
  {
    name: '09c.1 no-stakes friendly No Change does not promote B3 to B4',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 3, F: 1, H: 1 },
          currentRapport: 5,
        }),
      };
      const report = runCase({
        userText: 'I sit with Seraphina during a quiet stretch of travel.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'sit with Seraphina',
            identifyChallenge: 'sit with Seraphina',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              blockers: [''],
            },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 3);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].SlowBondEligible, 'N');
    },
  },
  {
    name: '09d no-stakes friendly interaction is blocked by slow-bond blockers',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 1, F: 1, H: 1 },
          currentRapport: 1,
        }),
      };
      const report = runCase({
        userText: 'I sit near Seraphina and try to chat after ignoring her boundary.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'chat with Seraphina after ignoring her boundary',
            identifyChallenge: 'chat with Seraphina after ignoring her boundary',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              personalAttention: true,
              blockers: ['boundary violation'],
            },
          })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 1);
    },
  },
  {
    name: '10 slow bond blocker prevents B4 promotion',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 3, F: 1, H: 1 },
          currentRapport: 5,
          slowBondEvidence: {
            respectfulContact: 1,
            cooperation: 1,
            comfortInProximity: 1,
            boundaryRespect: 0,
            sharedRoutine: 0,
            playfulness: 0,
            teamwork: 0,
            personalAttention: 0,
            blockers: ['unresolved harm'],
            lastUpdatedScene: 'previous',
          },
        }),
      };
      const report = runCase({
        userText: 'I sit near Seraphina and apologize, but the wound between us is not resolved.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'sit near Seraphina and apologize',
            identifyChallenge: 'sit near Seraphina and apologize',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              comfortInProximity: true,
              personalAttention: true,
            },
          })],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 3);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].SlowBondEligible, 'N');
    },
  },
  {
    name: '11 slow bond lock prevents B4 promotion',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 1, F: 3, H: 1 },
          currentRapport: 5,
        }),
      };
      const report = runCase({
        userText: 'I help Seraphina work through the ruined camp quietly.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'help Seraphina work through the ruined camp',
            identifyChallenge: 'help Seraphina work through the ruined camp',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              cooperation: true,
              teamwork: true,
              personalAttention: true,
            },
          })],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 1);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].SlowBondEligible, 'N');
    },
  },
  {
    name: '12a per-NPC rapport cooldown blocks before 30 active minutes',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 2, F: 2, H: 2 },
          currentRapport: 1,
          lastRapportGainActiveMs: 20 * 60 * 1000,
        }),
      };
      const report = runCase({
        userText: 'I stay beside Seraphina in the same room and ask what she needs help with next.',
        rapportClock: { activeMs: 40 * 60 * 1000, lastActivityAt: Date.now() },
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'ask what Seraphina needs help with first',
            explicitMeans: 'ask what Seraphina needs help with first',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              cooperation: true,
              boundaryRespect: true,
              personalAttention: true,
            },
          })],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentRapport, 1);
      assert.equal(report.trackerUpdate.npcs.Seraphina.lastRapportGainActiveMs, 20 * 60 * 1000);
      assert.equal(auditIncludes(report, 'rapportEligible=N'), true);
    },
  },
  {
    name: '12b per-NPC rapport cooldown expiry increases rapport on next qualifying interaction',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 2, F: 2, H: 2 },
          currentRapport: 1,
          lastRapportGainActiveMs: 30 * 60 * 1000,
        }),
      };
      const report = runCase({
        userText: 'I find Seraphina at the edge of camp and ask what she needs help with first.',
        rapportClock: { activeMs: 60 * 60 * 1000, lastActivityAt: Date.now() },
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'ask what Seraphina needs help with first',
            explicitMeans: 'ask what Seraphina needs help with first',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
          },
          relationshipEngine: [relationship('Seraphina', {
            slowBondEvidence: {
              cooperation: true,
              boundaryRespect: true,
              personalAttention: true,
            },
          })],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentRapport, 2);
      assert.equal(auditIncludes(report, 'rapportEligible=Y'), true);
      assert.equal(report.trackerUpdate.npcs.Seraphina.lastRapportGainActiveMs, 60 * 60 * 1000);
    },
  },
  {
    name: '12c first tracked encounter increases rapport and starts cooldown',
    run() {
      const report = runCase({
        userText: 'I step into the glade and greet Seraphina for the first time.',
        rapportClock: { activeMs: 10 * 60 * 1000, lastActivityAt: Date.now() },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'greet Seraphina for the first time',
            explicitMeans: 'greet Seraphina for the first time',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentRapport, 1);
      assert.equal(report.trackerUpdate.npcs.Seraphina.lastRapportGainActiveMs, 10 * 60 * 1000);
      assert.equal(auditIncludes(report, 'firstTrackedEncounter=Y'), true);
      assert.equal(auditIncludes(report, 'rapportEligible=Y'), true);
    },
  },
  {
    name: '12c.1 rapport gain at zero active time still starts cooldown',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 2, F: 2, H: 2 },
          currentRapport: 0,
        }),
      };
      const report = runCase({
        userText: 'I greet Seraphina warmly and ask about her morning.',
        rapportClock: { activeMs: 0, lastActivityAt: 0 },
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'greet Seraphina warmly',
            explicitMeans: 'greet Seraphina warmly',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentRapport, 1);
      assert.equal(report.trackerUpdate.npcs.Seraphina.lastRapportGainActiveMs, 0);

      const second = runCase({
        userText: 'I keep chatting with Seraphina about the road ahead.',
        rapportClock: { activeMs: 10 * 60 * 1000, lastActivityAt: Date.now() },
        tracker: report.trackerUpdate.npcs,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'chat with Seraphina',
            explicitMeans: 'chat with Seraphina',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(second.trackerUpdate.npcs.Seraphina.currentRapport, 1);
      assert.equal(auditIncludes(second, 'rapportEligible=N'), true);
    },
  },
  {
    name: '12d time-skip wording does not bypass active-play cooldown',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 2, F: 2, H: 2 },
          currentRapport: 1,
          lastRapportGainActiveMs: 20 * 60 * 1000,
        }),
      };
      const report = runCase({
        userText: 'I tell Seraphina, "I will come back tomorrow morning and help you then."',
        rapportClock: { activeMs: 40 * 60 * 1000, lastActivityAt: Date.now() },
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'promise to return tomorrow morning',
            explicitMeans: 'promise to return tomorrow morning',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentRapport, 1);
      assert.equal(report.trackerUpdate.npcs.Seraphina.lastRapportGainActiveMs, 20 * 60 * 1000);
      assert.equal(auditIncludes(report, 'rapportEligible=N'), true);
    },
  },
  {
    name: '12d.1 active play with another NPC can expire an absent NPC rapport cooldown',
    run() {
      const realDateNow = Date.now;
      const now = 1_700_000_000_000;
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 2, F: 2, H: 2 },
          currentRapport: 1,
          lastRapportGainActiveMs: 20 * 60 * 1000,
        }),
        Mara: trackerEntry({
          currentDisposition: { B: 2, F: 2, H: 2 },
          currentRapport: 0,
        }),
      };
      Date.now = () => now;
      try {
        const report = runCase({
          userText: 'I leave Seraphina at camp and help Mara sort the supply crates.',
          rapportClock: { activeMs: 50 * 60 * 1000, lastActivityAt: now },
          tracker,
          ledger: baseLedger({
            resolutionEngine: {
              identifyGoal: 'Normal_Interaction',
              identifyChallenge: 'help Mara sort supply crates',
              explicitMeans: 'help Mara sort supply crates',
              identifyTargets: {
                ActionTargets: ['Mara'],
                OppTargets: { NPC: [], ENV: [] },
                BenefitedObservers: [],
                HarmedObservers: [],
              },
            },
            relationshipEngine: [relationship('Mara')],
          }),
        });
        assert.equal(report.trackerUpdate.npcs.Seraphina.currentRapport, 1);
        assert.equal(report.trackerUpdate.npcs.Seraphina.lastRapportGainActiveMs, 20 * 60 * 1000);
        assert.equal(report.trackerUpdate.npcs.Mara.lastRapportGainActiveMs, 50 * 60 * 1000);
      } finally {
        Date.now = realDateNow;
      }
    },
  },
  {
    name: '12e F3 rapport recovery works on No Change when rapport reaches five',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 1, F: 3, H: 2 },
          currentRapport: 4,
          lastRapportGainActiveMs: 30 * 60 * 1000,
        }),
      };
      const report = runCase({
        userText: 'The next morning, I sit near Seraphina and keep quiet company without pushing her.',
        rapportClock: { activeMs: 60 * 60 * 1000, lastActivityAt: Date.now() },
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'keep quiet company with Seraphina',
            explicitMeans: 'keep quiet company with Seraphina',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentRapport, 5);
      assert.deepEqual(report.trackerUpdate.npcs.Seraphina.currentDisposition, { B: 1, F: 2, H: 2 });
      assert.equal(auditIncludes(report, '3.4c routeDispositionTarget=No Change'), true);
      assert.equal(auditIncludes(report, '3.5 deriveDirection={"b":0,"f":-1,"h":0}'), true);
    },
  },
  {
    name: '12f F4 rapport recovery helper allows No Change with meaningful benefit',
    run() {
      const deltas = deriveDirection('No Change', { B: 1, F: 4, H: 2 }, 5, 'Y', {
        GOAL: 'Normal_Interaction',
        LandedActions: 0,
      });
      assert.deepEqual(deltas, { b: 0, f: -1, h: 0, rapportReset: 'Y' });
      assert.deepEqual(updateDisposition({ B: 1, F: 4, H: 2 }, deltas), { B: 1, F: 3, H: 2 });
    },
  },
  {
    name: '12g F4 No Change does not recover without meaningful benefit',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 1, F: 4, H: 2 },
          currentRapport: 5,
          lastRapportGainActiveMs: 30 * 60 * 1000,
        }),
      };
      const report = runCase({
        userText: 'The next morning, I sit near Seraphina and say nothing for a while.',
        rapportClock: { activeMs: 60 * 60 * 1000, lastActivityAt: Date.now() },
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'sit near Seraphina quietly',
            explicitMeans: 'sit near Seraphina quietly',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentRapport, 5);
      assert.deepEqual(report.trackerUpdate.npcs.Seraphina.currentDisposition, { B: 1, F: 4, H: 2 });
      assert.equal(auditIncludes(report, '3.4c routeDispositionTarget=No Change'), true);
      assert.equal(auditIncludes(report, '3.5 deriveDirection={"b":0,"f":0,"h":0}'), true);
    },
  },
  {
    name: '12h B4 calm romance initiative uses style and new ranges',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(22, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina near the fire and talk quietly about the road ahead.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet conversation near the fire',
            explicitMeans: 'quiet conversation near the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', { romanceStyle: 'flirt' })],
        }),
      }, randoms);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['(none)']);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.RomanceInitiative, 'Y');
      assert.equal(proactive.Intent, 'Romantic_Flirt');
      assert.equal(proactive.RomanceInitiativeTag, 'Romantic_Flirt');
      assert.equal(proactive.RomanceInitiativeDie, 22);
      assert.equal(proactive.RomanceInitiativeContext, 'calm');
      assert.match(prompt(report), /flirtatious toward/);
      assert.doesNotMatch(prompt(report), /Proactivity Guide|Romantic_Flirt|Seraphina\/Romantic_Flirt/);
    },
  },
  {
    name: '12h.0 B4 calm romance initiative requires 12+ proactivity',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
        }),
      };
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina near the fire and talk quietly about the road ahead.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet conversation near the fire',
            explicitMeans: 'quiet conversation near the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', { romanceStyle: 'flirt' })],
        }),
      }, [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(11, 20),
      ]);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.ProactivityTier, 'HIGH');
      assert.equal(proactive.Threshold, 12);
      assert.equal(proactive.ProactivityDie, 11);
      assert.equal(proactive.Proactive, 'N');
    },
  },
  {
    name: '12h.1 B4 first ask date sets pending and 2h active-time cooldown',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina near the fire and talk quietly about the road ahead.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet conversation near the fire',
            explicitMeans: 'quiet conversation near the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, randoms);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['(none)']);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      const memory = report.trackerUpdate.npcs.Seraphina.proactivityMemory;
      assert.equal(proactive.RomanceInitiativeTag, 'Ask_Date');
      assert.equal(memory.interchangeCount, 1);
      assert.equal(memory.pendingTag, 'Ask_Date');
      assert.equal(memory.pendingSince, 1);
      assert.equal(memory.b4Courtship.askDateAttempts, 1);
      assert.equal(memory.b4Courtship.askDateCooldownUntilActiveMs, 2 * 60 * 60 * 1000);
      assert.equal(auditIncludes(report, 'Seraphina.Ask_Date.secondAttemptCooldown=2h->7200000'), true);
    },
  },
  {
    name: '12h.2 B4 thoughtful gift refusal after one accepted ask date drops bond to B3',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          proactivityMemory: {
            interchangeCount: 1,
            pendingTag: 'Thoughtful_Gift',
            pendingSince: 1,
            acceptedTags: ['Ask_Date'],
            b4Courtship: {
              askDateAttempts: 2,
              askDateAccepted: 1,
              askDateRefused: 1,
              thoughtfulGiftAttempts: 1,
            },
          },
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(72, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'No thank you, I cannot accept that gift.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'decline Seraphina gift',
            explicitMeans: 'decline the gift',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', { romanceStyle: 'flirt' })],
        }),
      }, randoms);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['(none)']);
      const memory = report.trackerUpdate.npcs.Seraphina.proactivityMemory;
      assert.equal(memory.pendingTag, 'NONE');
      assert.deepEqual(memory.refusedTags, ['Thoughtful_Gift']);
      assert.equal(memory.b4Courtship.blocked, 'Y');
      assert.equal(report.trackerUpdate.npcs.Seraphina.currentDisposition.B, 3);
      assert.equal(auditIncludes(report, 'B4 courtship blocked/refused -> Bond lowered to B3/F1/H1'), true);
    },
  },
  {
    name: '12h.3 B4 date and confess requires accepted gift and date first',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          proactivityMemory: {
            acceptedTags: ['Thoughtful_Gift'],
          },
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(98, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina near the fire and talk quietly about the road ahead.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet conversation near the fire',
            explicitMeans: 'quiet conversation near the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', { romanceStyle: 'flirt' })],
        }),
      }, randoms);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['(none)']);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.RomanceInitiativeRawTag, 'Date_And_Confess');
      assert.equal(proactive.RomanceInitiativeTag, 'Romantic_Flirt');
      assert.equal(proactive.RomanceInitiativeMemoryGate, 'Date_And_Confess.requiresGiftAndDateAccepted');
    },
  },
  {
    name: '12h.4 B4 date and confess can fire after one accepted ask date and accepted gift',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          proactivityMemory: {
            acceptedTags: ['Thoughtful_Gift', 'Ask_Date'],
            b4Courtship: {
              askDateAttempts: 2,
              askDateAccepted: 1,
              askDateRefused: 1,
              thoughtfulGiftAttempts: 1,
              thoughtfulGiftAccepted: 'Y',
            },
          },
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(98, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina near the fire and talk quietly about the road ahead.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet conversation near the fire',
            explicitMeans: 'quiet conversation near the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      const memory = report.trackerUpdate.npcs.Seraphina.proactivityMemory;
      assert.equal(proactive.RomanceInitiativeTag, 'Date_And_Confess');
      assert.equal(memory.pendingTag, 'Date_And_Confess');
      assert.equal(memory.pendingSince, 1);
    },
  },
  {
    name: '12h.5 refused date and confess lowers B4 to B3 and blocks branch until rebuilt',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          currentRapport: 4,
          establishedRelationship: 'N',
          proactivityMemory: {
            interchangeCount: 2,
            pendingTag: 'Date_And_Confess',
            pendingSince: 2,
            acceptedTags: ['Thoughtful_Gift', 'Ask_Date'],
            b4Courtship: {
              askDateAttempts: 2,
              askDateAccepted: 1,
              askDateRefused: 1,
              thoughtfulGiftAttempts: 1,
              thoughtfulGiftAccepted: 'Y',
            },
          },
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(72, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'No. I do not want a relationship with you like that.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'refuse Seraphina confession',
            explicitMeans: 'refuse the relationship confession',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', { romanceStyle: 'flirt' })],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      const state = report.trackerUpdate.npcs.Seraphina;
      assert.equal(state.currentDisposition.B, 3);
      assert.equal(state.currentRapport, 0);
      assert.equal(state.proactivityMemory.romanceBlocked, 'Y');
      assert.deepEqual(state.proactivityMemory.refusedTags, ['Date_And_Confess']);
      assert.equal(proactive.RomanceInitiative, 'N');
      assert.equal(auditIncludes(report, 'B4 courtship blocked/refused -> Bond lowered to B3/F1/H1'), true);
    },
  },
  {
    name: '12h.6 B4 first ask date refusal allows second ask after cooldown',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          proactivityMemory: {
            interchangeCount: 1,
            pendingTag: 'Ask_Date',
            pendingSince: 1,
            b4Courtship: {
              askDateAttempts: 1,
              askDateCooldownUntilActiveMs: 2 * 60 * 60 * 1000,
            },
          },
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'No, I do not want to go on a date with you.',
        rapportClock: { activeMs: 3 * 60 * 60 * 1000, lastActivityAt: Date.now() },
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'refuse Seraphina date invitation',
            explicitMeans: 'refuse the date',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', { romanceStyle: 'flirt' })],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      const memory = report.trackerUpdate.npcs.Seraphina.proactivityMemory;
      assert.equal(memory.pendingTag, 'Ask_Date');
      assert.deepEqual(memory.refusedTags, ['Ask_Date']);
      assert.equal(memory.b4Courtship.askDateAttempts, 2);
      assert.equal(memory.b4Courtship.askDateRefused, 1);
      assert.equal(proactive.RomanceInitiativeRawTag, 'Ask_Date');
      assert.equal(proactive.RomanceInitiativeTag, 'Ask_Date');
    },
  },
  {
    name: '12h.6a B4 thoughtful gift cannot fire before two ask dates and one acceptance',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          proactivityMemory: {
            b4Courtship: {
              askDateAttempts: 1,
              askDateAccepted: 1,
            },
          },
        }),
      };
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina near the fire and talk quietly about the road ahead.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet conversation near the fire',
            explicitMeans: 'quiet conversation near the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', { romanceStyle: 'flirt' })],
        }),
      }, [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(72, 100),
      ]);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.RomanceInitiativeRawTag, 'Thoughtful_Gift');
      assert.equal(proactive.RomanceInitiativeTag, 'Romantic_Flirt');
      assert.equal(proactive.RomanceInitiativeMemoryGate, 'Thoughtful_Gift.requiresTwoAskDatesAccepted');
    },
  },
  {
    name: '12h.6b B4 date and confess can fire after two accepted ask dates',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          proactivityMemory: {
            b4Courtship: {
              askDateAttempts: 2,
              askDateAccepted: 2,
            },
          },
        }),
      };
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina near the fire and talk quietly about the road ahead.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet conversation near the fire',
            explicitMeans: 'quiet conversation near the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(98, 100),
      ]);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.RomanceInitiativeTag, 'Date_And_Confess');
      assert.equal(report.trackerUpdate.npcs.Seraphina.proactivityMemory.pendingTag, 'Date_And_Confess');
    },
  },
  {
    name: '12h.7 generic refusal does not resolve multiple pending NPC offers',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          proactivityMemory: {
            interchangeCount: 1,
            pendingTag: 'Ask_Date',
            pendingSince: 1,
          },
        }),
        Mira: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          proactivityMemory: {
            interchangeCount: 1,
            pendingTag: 'Thoughtful_Gift',
            pendingSince: 1,
          },
        }),
      };
      const report = runCase({
        userText: 'No thank you.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'give a generic refusal',
            explicitMeans: 'No thank you.',
            identifyTargets: {
              ActionTargets: ['Seraphina', 'Mira'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Mira')],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.proactivityMemory.pendingTag, 'Ask_Date');
      assert.deepEqual(report.trackerUpdate.npcs.Seraphina.proactivityMemory.refusedTags, []);
      assert.equal(report.trackerUpdate.npcs.Mira.proactivityMemory.pendingTag, 'Thoughtful_Gift');
      assert.deepEqual(report.trackerUpdate.npcs.Mira.proactivityMemory.refusedTags, []);
    },
  },
  {
    name: '12h.7a ask date guidance stays non-intimate',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(7, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina near the fire and talk quietly about the road ahead.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet conversation near the fire',
            explicitMeans: 'quiet conversation near the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', { romanceStyle: 'flirt' })],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      const modelPrompt = prompt(report);
      assert.equal(proactive.RomanceInitiativeTag, 'Ask_Date');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].EstablishedRelationship, 'N');
      assert.match(modelPrompt, /non-intimate romantic date/);
      assert.match(modelPrompt, /public or ordinary plan/);
      assert.match(modelPrompt, /Do not frame this as secluded sexual privacy/);
    },
  },
  {
    name: '12h.8 named refusal resolves only that NPC pending offer',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          proactivityMemory: {
            interchangeCount: 1,
            pendingTag: 'Ask_Date',
            pendingSince: 1,
          },
        }),
        Mira: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          proactivityMemory: {
            interchangeCount: 1,
            pendingTag: 'Thoughtful_Gift',
            pendingSince: 1,
          },
        }),
      };
      const report = runCase({
        userText: 'No, Seraphina, I do not want to go on a date with you.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'refuse Seraphina date invitation',
            explicitMeans: 'No, Seraphina, I do not want to go on a date with you.',
            identifyTargets: {
              ActionTargets: ['Seraphina', 'Mira'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Mira')],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Seraphina.proactivityMemory.pendingTag, 'NONE');
      assert.deepEqual(report.trackerUpdate.npcs.Seraphina.proactivityMemory.refusedTags, ['Ask_Date']);
      assert.equal(report.trackerUpdate.npcs.Mira.proactivityMemory.pendingTag, 'Thoughtful_Gift');
      assert.deepEqual(report.trackerUpdate.npcs.Mira.proactivityMemory.refusedTags, []);
    },
  },
  {
    name: '12i B4 active scene blocks romance initiative',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(98, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I work with Seraphina to force open the sealed gate.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'OpenGate',
            identifyChallenge: 'force open the sealed gate',
            explicitMeans: 'force open the sealed gate',
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: ['sealed gate'] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'ENV' },
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'N');
      assert.equal(proactive.RomanceInitiative, 'N');
      assert.equal(proactive.RomanceInitiativeTag, '(none)');
      assert.doesNotMatch(prompt(report), /focused romantic attention/);
      assert.doesNotMatch(prompt(report), /Romantic_Attention|Proactivity Guide/);
    },
  },
  {
    name: '12j1 explicit ally attack command is request-only but can guide autonomous companion aggression',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 7, MND: 5, CHA: 5 },
        }),
        Ogre: trackerEntry({ currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 6, MND: 2, CHA: 1 } }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(16, 20),
        nthRandomForDie(8, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'I shout, "Seraphina, hit the ogre\'s flank and keep it off me while I hold its attention!"',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'OrderAllyAttack',
            identifyChallenge: 'tell Seraphina to hit the ogre',
            explicitMeans: 'Seraphina, hit the ogre\'s flank and keep it off me while I hold its attention!',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: ['Ogre'], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            hasStakes: true,
            actionCount: ['command'],
            mapStats: { USER: 'CHA', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
            activeHostileThreat: true,
            classifyCombatActionSequence: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Ogre')],
          proactivitySemantic: { cap: 3 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(proactive.ProactivityTarget, 'Ogre');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.STAKES, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.CompanionCommand.Mode, 'REQUEST_ONLY');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.AttackType, 'CompanionAttack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.ProactivityTarget, 'Ogre');
      const companionInjury = report.finalNarrativeHandoff.aggressionResults.Seraphina.InflictedTargetInjury;
      assert.equal(Boolean(companionInjury), true);
      assert.equal(companionInjury.InjuryDetailMode, 'narrator_contextual');
      assert.equal(companionInjury.woundsAdd.length, 0);
      assert.match(prompt(report), /choose the concrete wound and affected body area from the NPC attack context/i);
      assert.match(auditPrompt(report), /detailMode:narrator_contextual/i);
      assert.match(prompt(report), /spoken tactical input only/i);
      assert.match(prompt(report), /Seraphina/);
      assert.match(prompt(report), /companion attack against Ogre/);
      assert.equal(/companion attack against Seraphina|companion attack against Mira/i.test(prompt(report)), false);
    },
  },
  {
    name: '12j1.1 contextual companion injury caps preserve narrated wound details',
    run() {
      const report = {
        finalNarrativeHandoff: {
          aggressionResults: {
            Seraphina: {
              InflictedTargetInjury: {
                sourceNpc: 'Seraphina',
                target: 'Ogre',
                targetType: 'npc',
                severity: 'minor',
                InjuryDetailMode: 'narrator_contextual',
                InjurySeverityLimit: 'minor',
                InjuryContextHint: "Seraphina's CompanionAttack, hit the ogre's flank",
              },
            },
          },
        },
      };
      const caps = collectContextualInjuryCaps(report);
      assert.equal(caps.length, 1);
      assert.match(formatContextualInjuryCapsForPrompt(caps), /target:Ogre/);
      assert.match(formatContextualInjuryCapsForPrompt(caps), /severityLimit:minor/);
      const delta = applyContextualInjuryCapsToTrackerDelta({
        user: emptyUserDelta(),
        npcs: [{
          NPC: 'Ogre',
          personalitySummary: '',
          condition: 'bruised',
          woundsAdd: ['shallow cut across the left flank'],
          woundsRemove: [],
          statusAdd: [],
          statusRemove: [],
          gearAdd: [],
          gearRemove: [],
        }],
      }, caps);
      assert.deepEqual(delta.npcs[0].woundsAdd, ['shallow cut across the left flank']);
      assert.equal(delta.npcs[0].condition, 'bruised');
    },
  },
  {
    name: '12j1.2 contextual companion injury caps reject over-severe narrated wound details',
    run() {
      const caps = [{
        source: 'Seraphina',
        target: 'Ogre',
        targetType: 'npc',
        severityLimit: 'minor',
        condition: 'bruised',
        context: "Seraphina's CompanionAttack",
      }];
      const delta = applyContextualInjuryCapsToTrackerDelta({
        user: emptyUserDelta(),
        npcs: [{
          NPC: 'Ogre',
          personalitySummary: '',
          condition: 'badly_wounded',
          woundsAdd: ['deep broken rib wound'],
          woundsRemove: [],
          statusAdd: ['paralyzed by the blow'],
          statusRemove: [],
          gearAdd: [],
          gearRemove: [],
        }],
      }, caps);
      assert.deepEqual(delta.npcs, []);
    },
  },
  {
    name: '12j1.3 contextual companion injury cap does not create condition without narrated wound',
    run() {
      const caps = [{
        source: 'Seraphina',
        target: 'Raider1',
        targetType: 'npc',
        severityLimit: 'severe',
        condition: 'badly_wounded',
        context: "Seraphina's CompanionAttack",
      }];
      const delta = applyContextualInjuryCapsToTrackerDelta({
        user: emptyUserDelta(),
        npcs: [{
          NPC: 'Raider1',
          personalitySummary: '',
          condition: 'badly_wounded',
          woundsAdd: [],
          woundsRemove: [],
          statusAdd: [],
          statusRemove: [],
          gearAdd: [],
          gearRemove: [],
        }],
      }, caps);
      assert.deepEqual(delta.npcs, []);
    },
  },
  {
    name: '12j1a casual hit wording stays request-only and can guide autonomous companion attack',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 7, MND: 5, CHA: 5 },
        }),
        Ogre: trackerEntry({ currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 6, MND: 2, CHA: 1 } }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(16, 20),
        nthRandomForDie(8, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'Seraphina, hit the ogre in the flank and keep it off me.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'OrderAllyAttack',
            identifyChallenge: 'tell Seraphina to hit the ogre',
            explicitMeans: 'Seraphina, hit the ogre in the flank and keep it off me.',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: ['Ogre'], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            hasStakes: true,
            actionCount: ['command'],
            mapStats: { USER: 'CHA', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
            activeHostileThreat: true,
            classifyCombatActionSequence: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Ogre')],
          proactivitySemantic: { cap: 3 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(proactive.ProactivityTarget, 'Ogre');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.STAKES, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.CompanionCommand.Mode, 'REQUEST_ONLY');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.AttackType, 'CompanionAttack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.ProactivityTarget, 'Ogre');
      assert.match(prompt(report), /spoken tactical input only/i);
      assert.match(prompt(report), /Seraphina/);
      assert.match(prompt(report), /companion attack against Ogre/);
      assert.match(prompt(report), /Seraphina's only resolved attack target this beat is Ogre/i);
    },
  },
  {
    name: '12j1a.1 directed ally attack request resolves named hostile fallback only after autonomous companion attack',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 7, MND: 5, CHA: 5 },
        }),
        Raider2: trackerEntry({
          currentDisposition: { B: 1, F: 2, H: 4 },
          currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 4, MND: 2, CHA: 2 },
          personalitySummary: 'axe-man raider carrying a heavy axe',
          gear: ['heavy axe'],
        }),
        Darai: trackerEntry({ currentDisposition: { B: 2, F: 3, H: 2 } }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(16, 20),
        nthRandomForDie(8, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'I do not attack. I point at the axe-man and shout, "Seraphina, take the axe-man down now. Hit him before he can move."',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'OrderAllyAttack',
            identifyChallenge: 'command Seraphina to attack the axe-man threatening Darai',
            explicitMeans: 'Seraphina, take the axe-man down now. Hit him before he can move.',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: ['Darai'],
              HarmedObservers: [],
            },
            hasStakes: true,
            actionCount: ['command'],
            mapStats: { USER: 'CHA', OPP: 'ENV' },
            activeHostileThreat: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Raider2'), relationship('Darai')],
          proactivitySemantic: { cap: 3 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(proactive.ProactivityTarget, 'Raider2');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.STAKES, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.CompanionCommand.Mode, 'REQUEST_ONLY');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.AttackType, 'CompanionAttack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.ProactivityTarget, 'Raider2');
      assert.match(prompt(report), /Seraphina: companion attack against Raider2/);
    },
  },
  {
    name: '12j1a.2 directed ally attack command target overrides unrelated semantic OppTarget',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 7, MND: 5, CHA: 5 },
        }),
        Ogre: trackerEntry({
          currentDisposition: { B: 1, F: 3, H: 3 },
          currentCoreStats: { Rank: 'Elite', MainStat: 'PHY', PHY: 6, MND: 2, CHA: 2 },
          personalitySummary: 'scarred ogre pressing Darai against the pillar',
        }),
        Raider2: trackerEntry({
          currentDisposition: { B: 1, F: 2, H: 4 },
          currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 4, MND: 2, CHA: 2 },
          personalitySummary: 'axe raider carrying a heavy axe',
          gear: ['heavy axe'],
        }),
        Darai: trackerEntry({ currentDisposition: { B: 1, F: 3, H: 2 } }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(16, 20),
        nthRandomForDie(8, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'I do not attack. I back toward Darai and shout, "Seraphina, take the axe raider down now. Hit him before he can move."',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'OrderAllyAttack',
            identifyChallenge: 'shout a command to Seraphina to take down the axe raider',
            explicitMeans: 'Seraphina, take the axe raider down now. Hit him before he can move.',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: ['Ogre'], ENV: [] },
              BenefitedObservers: ['Darai'],
              HarmedObservers: [],
            },
            hasStakes: true,
            actionCount: ['command'],
            mapStats: { USER: 'CHA', OPP: 'CHA' },
            activeHostileThreat: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Ogre'), relationship('Raider2'), relationship('Darai')],
          proactivitySemantic: { cap: 3 },
        }),
      }, randoms);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.hostilesInScene.NPC, ['Raider2']);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['(none)']);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(proactive.ProactivityTarget, 'Raider2');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.AttackType, 'CompanionAttack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.ProactivityTarget, 'Raider2');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.STAKES, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.CompanionCommand.Mode, 'REQUEST_ONLY');
      assert.match(prompt(report), /Seraphina: companion attack against Raider2/);
      assert.match(prompt(report), /Seraphina's only resolved attack target this beat is Raider2/i);
      assert.equal(auditIncludes(report, 'directedCompanionAttackHostilePoolRepair'), true);
    },
  },
  {
    name: '12j1a.3 directed ally attack hostile fallback preserves narrow OppTargets',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 7, MND: 5, CHA: 5 },
        }),
        Raider2: trackerEntry({
          currentDisposition: { B: 1, F: 2, H: 4 },
          currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 4, MND: 2, CHA: 2 },
          personalitySummary: 'axe-man raider carrying a heavy axe',
          gear: ['heavy axe'],
        }),
        Darai: trackerEntry({ currentDisposition: { B: 2, F: 3, H: 2 } }),
      };
      const report = runCaseWithRandoms({
        userText: 'I do not attack. I point at the axe-man and shout, "Seraphina, take the axe-man down now. Hit him before he can move."',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'OrderAllyAttack',
            identifyChallenge: 'command Seraphina to attack the axe-man threatening Darai',
            explicitMeans: 'Seraphina, take the axe-man down now. Hit him before he can move.',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: ['Darai'],
              HarmedObservers: [],
            },
            hasStakes: true,
            actionCount: ['command'],
            mapStats: { USER: 'CHA', OPP: 'ENV' },
            activeHostileThreat: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Raider2'), relationship('Darai')],
        }),
      }, [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(16, 20),
        nthRandomForDie(8, 20),
      ]);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.hostilesInScene.NPC, ['Raider2']);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['(none)']);
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.STAKES, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.CompanionCommand.Mode, 'REQUEST_ONLY');
      assert.equal(report.finalNarrativeHandoff.proactivityResults.Seraphina.ProactivityTarget, 'Raider2');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.ProactivityTarget, 'Raider2');
    },
  },
  {
    name: '12j1b companion stop command does not borrow later user attack wording',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 3, F: 1, H: 1 },
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 7, MND: 5, CHA: 5 },
        }),
        Raider1: trackerEntry({
          currentDisposition: { B: 1, F: 2, H: 4 },
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 3, MND: 2, CHA: 2 },
        }),
        Darai: trackerEntry({ currentDisposition: { B: 1, F: 3, H: 2 } }),
      };
      const randoms = [
        nthRandomForDie(4, 20),
        nthRandomForDie(8, 20),
        ...Array(5).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(88, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I keep my blade low and say, "Seraphina, Darai can\'t run. If they move on him, stop them." Then I lunge toward the raider with the knife, trying to slam my shoulder into her chest and drive her back before she can flank me.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ShoulderSlamRaider',
            identifyChallenge: 'slam shoulder into the knife-wielding raider chest and drive her back',
            explicitMeans: 'slam shoulder into Raider1 and drive her back',
            identifyTargets: {
              ActionTargets: ['Raider1'],
              OppTargets: { NPC: ['Raider1'], ENV: [] },
              BenefitedObservers: ['Darai', 'Seraphina'],
              HarmedObservers: [],
            },
            hasStakes: true,
            actionCount: ['shoulder_slam'],
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
            activeHostileThreat: true,
            classifyCombatActionSequence: true,
          },
          relationshipEngine: [relationship('Raider1'), relationship('Darai'), relationship('Seraphina')],
          proactivitySemantic: { cap: 3 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.notEqual(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina, undefined);
      assert.doesNotMatch(prompt(report), /Seraphina: companion attack/i);
    },
  },
  {
    name: '12j B4 crisis companion attack targets enemy and rolls aggression',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 7, MND: 5, CHA: 5 },
        }),
        Bear: trackerEntry({ currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 6, MND: 2, CHA: 1 } }),
      };
      const randoms = [
        nthRandomForDie(20, 20),
        nthRandomForDie(10, 20),
        nthRandomForDie(10, 20),
        nthRandomForDie(10, 20),
        nthRandomForDie(10, 20),
        nthRandomForDie(10, 20),
        nthRandomForDie(15, 20),
        nthRandomForDie(10, 20),
        nthRandomForDie(10, 20),
        nthRandomForDie(10, 20),
        nthRandomForDie(10, 20),
        nthRandomForDie(4, 20),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(16, 20),
        nthRandomForDie(8, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'I swing my sword at the bear as it charges us.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'FightBear',
            identifyChallenge: 'swing my sword at the bear',
            explicitMeans: 'swing my sword at the bear',
            identifyTargets: {
              ActionTargets: ['Bear'],
              OppTargets: { NPC: ['Bear'], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            hasStakes: true,
            actionCount: ['sword swing'],
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
            activeHostileThreat: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Bear')],
          proactivitySemantic: { cap: 2 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiative, 'Y');
      assert.equal(proactive.CompanionInitiativeContext, 'crisis');
      assert.equal(proactive.Intent, 'ESCALATE_VIOLENCE');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(proactive.ProactivityTarget, 'Bear');
      assert.equal(proactive.TargetsUser, 'N');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.AttackType, 'CompanionAttack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.ProactivityTarget, 'Bear');
      assert.match(prompt(report), /companion attack against Bear/);
    },
  },
  {
    name: '12c established partner initiative can produce intimacy in calm context',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(14, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(2, 4),
      ];
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina by the fire after sunset, alone and at peace.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet private rest by the fire',
            explicitMeans: 'quiet private rest by the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.RomanceInitiative, 'N');
      assert.equal(proactive.PartnerInitiative, 'Y');
      assert.equal(proactive.Intent, 'Partner_Intimacy');
      assert.equal(proactive.PartnerInitiativeTag, 'Partner_Intimacy');
      assert.equal(proactive.PartnerInitiativeDie, 88);
      assert.equal(proactive.PartnerInitiativeContext, 'calm');
      assert.equal(report.trackerUpdate.npcs.Seraphina.proactivityMemory.lastMeaningfulPartnerTag, 'Partner_Intimacy');
      assert.match(prompt(report), /romantic or sexual closeness/);
    },
  },
  {
    name: '12c.0 established partner calm initiative requires 12+ proactivity',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
        }),
      };
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina by the fire after sunset, alone and at peace.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet private rest by the fire',
            explicitMeans: 'quiet private rest by the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(11, 20),
      ]);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.ProactivityTier, 'HIGH');
      assert.equal(proactive.Threshold, 12);
      assert.equal(proactive.ProactivityDie, 11);
      assert.equal(proactive.Proactive, 'N');
    },
  },
  {
    name: '12c.1 established partner gift sets shared 1d4h active-time cooldown',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(14, 20),
        nthRandomForDie(75, 100),
        nthRandomForDie(2, 4),
      ];
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina by the fire after sunset, alone and at peace.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet private rest by the fire',
            explicitMeans: 'quiet private rest by the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      const memory = report.trackerUpdate.npcs.Seraphina.proactivityMemory;
      assert.equal(proactive.PartnerInitiativeTag, 'Partner_Gift');
      assert.equal(memory.interchangeCount, 1);
      assert.equal(memory.lastMeaningfulPartnerTag, 'Partner_Gift');
      assert.equal(memory.partnerMeaningfulCooldownUntilActiveMs, 2 * 60 * 60 * 1000);
      assert.equal(auditIncludes(report, 'Seraphina.Partner_Gift.meaningfulCooldown=1d4h(2)->7200000'), true);
    },
  },
  {
    name: '12c.2 shared meaningful partner cooldown remaps to light partner beat',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
          proactivityMemory: {
            interchangeCount: 3,
            partnerMeaningfulCooldownUntilActiveMs: 10 * 60 * 60 * 1000,
            lastMeaningfulPartnerTag: 'Partner_Date',
          },
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(14, 20),
        nthRandomForDie(75, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina by the fire after sunset, alone and at peace.',
        rapportClock: { activeMs: 2 * 60 * 60 * 1000, lastActivityAt: Date.now() },
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet private rest by the fire',
            explicitMeans: 'quiet private rest by the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.PartnerInitiativeRawTag, 'Partner_Gift');
      assert.equal(proactive.PartnerInitiativeTag, 'Partner_Flirt');
      assert.equal(proactive.PartnerInitiativeMemoryGate, 'meaningfulPartner.cooldownUntil36000000');
    },
  },
  {
    name: '12c.3 established partner conflict sets shared 1d4h active-time cooldown',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(14, 20),
        nthRandomForDie(98, 100),
        nthRandomForDie(3, 4),
      ];
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina by the fire after sunset, alone and at peace.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet private rest by the fire',
            explicitMeans: 'quiet private rest by the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      const memory = report.trackerUpdate.npcs.Seraphina.proactivityMemory;
      assert.equal(proactive.PartnerInitiativeTag, 'Partner_Conflict');
      assert.equal(memory.lastMeaningfulPartnerTag, 'Partner_Conflict');
      assert.equal(memory.partnerMeaningfulCooldownUntilActiveMs, 3 * 60 * 60 * 1000);
      assert.equal(auditIncludes(report, 'Seraphina.Partner_Conflict.meaningfulCooldown=1d4h(3)->10800000'), true);
    },
  },
  {
    name: '12c.4 established partner date cannot repeat as next meaningful event',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
          proactivityMemory: {
            lastMeaningfulPartnerTag: 'Partner_Date',
          },
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(14, 20),
        nthRandomForDie(65, 100),
        nthRandomForDie(1, 4),
      ];
      const report = runCaseWithRandoms({
        userText: 'I sit with Seraphina by the fire after sunset, alone and at peace.',
        rapportClock: { activeMs: 6 * 60 * 60 * 1000, lastActivityAt: Date.now() },
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'quiet private rest by the fire',
            explicitMeans: 'quiet private rest by the fire',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.PartnerInitiativeRawTag, 'Partner_Date');
      assert.equal(proactive.PartnerInitiativeTag, 'Partner_Gift');
      assert.equal(proactive.PartnerInitiativeMemoryGate, 'Partner_Date.repeatBlocked');
      assert.equal(report.trackerUpdate.npcs.Seraphina.proactivityMemory.lastMeaningfulPartnerTag, 'Partner_Gift');
    },
  },
  {
    name: '12c.5 partner intimacy requires privacy or contextual suitability',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(14, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(1, 4),
      ];
      const report = runCaseWithRandoms({
        userText: 'I talk with Seraphina in the crowded market while guards stand nearby.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'crowded market conversation',
            explicitMeans: 'talk in the crowded market near guards',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.PartnerInitiativeRawTag, 'Partner_Intimacy');
      assert.equal(proactive.PartnerInitiativeTag, 'Partner_Conflict');
      assert.equal(proactive.PartnerInitiativeMemoryGate, 'Partner_Intimacy.contextBlocked');
      assert.equal(report.trackerUpdate.npcs.Seraphina.proactivityMemory.lastMeaningfulPartnerTag, 'Partner_Conflict');
    },
  },
  {
    name: '12d established partner crisis initiative becomes companion attack with enemy target',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
        }),
        Bear: trackerEntry(),
      };
      const randoms = [
        nthRandomForDie(20, 20),
        ...Array(5).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(20, 20),
        nthRandomForDie(20, 20),
        nthRandomForDie(20, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(14, 20),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(14, 20),
        nthRandomForDie(8, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'I swing my sword at the bear as it charges us.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'FightBear',
            identifyChallenge: 'swing my sword at the bear',
            explicitMeans: 'swing my sword at the bear',
            identifyTargets: {
              ActionTargets: ['Bear'],
              OppTargets: { NPC: ['Bear'], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            hasStakes: true,
            actionCount: ['sword swing'],
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
            activeHostileThreat: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Bear')],
          proactivitySemantic: { cap: 2 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiative, 'Y');
      assert.equal(proactive.CompanionInitiativeContext, 'crisis');
      assert.equal(proactive.Intent, 'ESCALATE_VIOLENCE');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(proactive.ProactivityTarget, 'Bear');
      assert.equal(proactive.TargetsUser, 'N');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.AttackType, 'CompanionAttack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.ProactivityTarget, 'Bear');
      assert.match(prompt(report), /companion attack against Bear/);
    },
  },
  {
    name: '12e narrator translates relationship tags into guidance',
    run() {
      const report = runCase({
        userText: 'I sit near Seraphina by the low fire and share comfortable quiet with her.',
        tracker: {
          Seraphina: trackerEntry({
            currentDisposition: { B: 2, F: 3, H: 2 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'sit near Seraphina by the low fire and share comfortable quiet',
            explicitMeans: 'quiet companionship',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      const text = prompt(report);
      assert.doesNotMatch(text, /consistent with FREEZE\/No Change/);
      assert.match(text, /guarded, tense, wary, hesitant/);
      assert.match(text, /Do not change the relationship state/);
    },
  },
  {
    name: '12k established partner crisis without enemy target downgrades to support',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
        }),
      };
      const randoms = [
        nthRandomForDie(20, 20),
        ...Array(5).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(136, 150),
      ];
      const report = runCaseWithRandoms({
        userText: 'A burning beam falls toward us and I try to shove through the smoke.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'EscapeFire',
            identifyChallenge: 'shove through the smoke under a falling beam',
            explicitMeans: 'shove through the smoke',
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: ['burning beam', 'smoke'] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            hasStakes: true,
            actionCount: ['escape'],
            mapStats: { USER: 'PHY', OPP: 'ENV' },
            classifyCombatActionSequence: true,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiative, 'Y');
      assert.equal(proactive.CompanionInitiativeContext, 'crisis');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Cover');
      assert.equal(proactive.Intent, 'SUPPORT_ACT');
      assert.equal(proactive.ProactivityTarget, '{{user}}');
      assert.equal(proactive.TargetsUser, 'Y');
      assert.deepEqual(report.finalNarrativeHandoff.aggressionResults, {});
      assert.match(prompt(report), /covers, shields, intercepts/);
    },
  },
  {
    name: '12l B2 crisis companion can assist without relationship',
    run() {
      const tracker = {
        Mira: trackerEntry({
          currentDisposition: { B: 2, F: 1, H: 1 },
          establishedRelationship: 'N',
        }),
        Bear: trackerEntry(),
      };
      const randoms = [
        nthRandomForDie(20, 20),
        ...Array(5).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(14, 20),
        nthRandomForDie(18, 20),
        nthRandomForDie(50, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I brace as the bear charges toward us.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'HoldGround',
            identifyChallenge: 'brace as the bear charges',
            explicitMeans: 'brace against the charge',
            identifyTargets: {
              ActionTargets: ['Bear'],
              OppTargets: { NPC: ['Bear'], ENV: [] },
              BenefitedObservers: ['Mira'],
              HarmedObservers: [],
            },
            hasStakes: true,
            actionCount: ['brace'],
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyCombatActionSequence: true,
            activeHostileThreat: true,
          },
          relationshipEngine: [relationship('Mira'), relationship('Bear')],
          proactivitySemantic: { cap: 2 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Mira;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiative, 'Y');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Assist');
      assert.equal(proactive.Intent, 'SUPPORT_ACT');
      assert.match(prompt(report), /tactical help under immediate pressure/);
      assert.match(prompt(report), /do not use comfort-touch/);
    },
  },
  {
    name: '12m B2 dire crisis can retreat',
    run() {
      const tracker = {
        Mira: trackerEntry({
          currentDisposition: { B: 2, F: 1, H: 1 },
          establishedRelationship: 'N',
        }),
        Bear: trackerEntry(),
      };
      const randoms = [
        nthRandomForDie(1, 20),
        ...Array(5).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(14, 20),
        nthRandomForDie(18, 20),
        nthRandomForDie(90, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I slash at the bear with my sword, miss badly, and stumble as it barrels through our guard.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'FightBear',
            identifyChallenge: 'sword slash misses badly against the bear',
            explicitMeans: 'slash at the bear with a sword and miss',
            identifyTargets: {
              ActionTargets: ['Bear'],
              OppTargets: { NPC: ['Bear'], ENV: [] },
              BenefitedObservers: ['Mira'],
              HarmedObservers: [],
            },
            hasStakes: true,
            actionCount: ['swing'],
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
          },
          relationshipEngine: [relationship('Mira'), relationship('Bear')],
          proactivitySemantic: { cap: 2 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Mira;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Retreat');
      assert.equal(proactive.CompanionCrisisDire, 'Y');
      assert.match(prompt(report), /tries to retreat/);
    },
  },
  {
    name: '12n B4 dire crisis does not retreat unless badly wounded',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          condition: 'healthy',
        }),
        Bear: trackerEntry(),
      };
      const randoms = [
        nthRandomForDie(1, 20),
        ...Array(5).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(14, 20),
        nthRandomForDie(18, 20),
        nthRandomForDie(100, 100),
        nthRandomForDie(12, 20),
        nthRandomForDie(8, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'I slash at the bear with my sword, miss badly, and stumble as it barrels through our guard.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'FightBear',
            identifyChallenge: 'sword slash misses badly against the bear',
            explicitMeans: 'slash at the bear with a sword and miss',
            identifyTargets: {
              ActionTargets: ['Bear'],
              OppTargets: { NPC: ['Bear'], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            hasStakes: true,
            actionCount: ['swing'],
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Bear')],
          proactivitySemantic: { cap: 2 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.notEqual(proactive.CompanionInitiativeTag, 'Companion_Retreat');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.AttackType, 'CompanionAttack');
    },
  },
  {
    name: '12o B4 badly wounded dire crisis can reluctantly retreat',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
          condition: 'badly_wounded',
          wounds: ['mangled leg'],
        }),
        Bear: trackerEntry(),
      };
      const randoms = [
        nthRandomForDie(1, 20),
        ...Array(5).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(14, 20),
        nthRandomForDie(100, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I slash at the bear with my sword, miss badly, and stumble as it barrels through our guard.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'FightBear',
            identifyChallenge: 'sword slash misses badly against the bear',
            explicitMeans: 'slash at the bear with a sword and miss',
            identifyTargets: {
              ActionTargets: ['Bear'],
              OppTargets: { NPC: ['Bear'], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            hasStakes: true,
            actionCount: ['swing'],
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Bear')],
          proactivitySemantic: { cap: 2 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Retreat');
      assert.match(prompt(report), /strong hesitation, conflict, reluctance, guilt/);
    },
  },
  {
    name: '12p companion attack never targets friendly action target',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
        }),
        Mira: trackerEntry({
          currentDisposition: { B: 2, F: 1, H: 1 },
        }),
      };
      const randoms = [
        nthRandomForDie(20, 20),
        ...Array(5).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(1, 20),
        nthRandomForDie(14, 20),
        nthRandomForDie(100, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I drag Mira out from under the collapsing beam while Seraphina watches the smoke.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'RescueMira',
            identifyChallenge: 'drag Mira away from a collapsing beam',
            explicitMeans: 'drag Mira clear',
            identifyTargets: {
              ActionTargets: ['Mira'],
              OppTargets: { NPC: [], ENV: ['collapsing beam'] },
              BenefitedObservers: ['Mira', 'Seraphina'],
              HarmedObservers: [],
            },
            hasStakes: true,
            actionCount: ['rescue'],
            mapStats: { USER: 'PHY', OPP: 'ENV' },
            classifyCombatActionSequence: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Mira')],
          proactivitySemantic: { cap: 2 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiative, 'Y');
      assert.notEqual(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.notEqual(proactive.ProactivityTarget, 'Mira');
      assert.deepEqual(report.finalNarrativeHandoff.aggressionResults, {});
    },
  },
  {
    name: '12p1 hostile counter can target attacking companion instead of user',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'Y',
          currentCoreStats: { Rank: 'Average', MainStat: 'Balanced', PHY: 1, MND: 1, CHA: 5 },
        }),
        Ogre: trackerEntry({
          currentDisposition: { B: 1, F: 4, H: 4 },
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 10, MND: 2, CHA: 1 },
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(4, 20),
        nthRandomForDie(18, 20),
        nthRandomForDie(18, 20),
        nthRandomForDie(6, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'Seraphina, hit the ogre in the flank while I distract it.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'CommandSeraphinaToAttack',
            identifyChallenge: 'tell Seraphina to hit the ogre',
            explicitMeans: 'Seraphina, hit the ogre in the flank while I distract it.',
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: ['Ogre'], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            hasStakes: true,
            actionCount: ['command'],
            mapStats: { USER: 'CHA', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
            activeHostileThreat: true,
            classifyCombatActionSequence: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Ogre')],
          proactivitySemantic: { cap: 3 },
        }),
      }, randoms);
      const seraphinaAttack = report.finalNarrativeHandoff.aggressionResults.Seraphina;
      const ogreCounter = report.finalNarrativeHandoff.aggressionResults.Ogre;
      assert.equal(seraphinaAttack.AttackType, 'CompanionAttack');
      assert.equal(seraphinaAttack.ProactivityTarget, 'Ogre');
      assert.equal(seraphinaAttack.AttackStat, 'PHY');
      assert.equal(seraphinaAttack.DefenseStat, 'PHY');
      assert.equal(ogreCounter.AttackType, 'CounterAttack');
      assert.equal(ogreCounter.ProactivityTarget, 'Seraphina');
      assert.equal(ogreCounter.AttackStat, 'PHY');
      assert.equal(ogreCounter.DefenseStat, 'PHY');
      assert.equal(Boolean(ogreCounter.InflictedTargetInjury), true);
      assert.equal(ogreCounter.InflictedTargetInjury.InjuryDetailMode, 'narrator_contextual');
      assert.equal(ogreCounter.InflictedTargetInjury.woundsAdd.length, 0);
      assert.match(prompt(report), /choose the concrete wound and affected body area from the NPC attack context/i);
      assert.match(auditPrompt(report), /detailMode:narrator_contextual/i);
      assert.equal(report.trackerUpdate.npcs.Seraphina.condition, 'healthy');
      assert.match(prompt(report), /companion attack against Ogre/i);
      assert.match(prompt(report), /Ogre: counterattack exploiting the opening/i);
      assert.match(prompt(report), /Seraphina receives .* condition from Ogre/i);
    },
  },
  {
    name: '12p2 explicit ally attack can target hostile ActionTarget when semantic omits OppTargets',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 2, F: 2, H: 2 },
          currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 7, MND: 5, CHA: 5 },
        }),
        Ogre: trackerEntry({
          currentDisposition: { B: 1, F: 2, H: 4 },
          dominantLock: 'HOSTILITY',
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 4, MND: 2, CHA: 2 },
        }),
      };
      const randoms = [
        ...Array(11).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(18, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(16, 20),
        nthRandomForDie(8, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'I shout, "Seraphina, hit the ogre\'s flank and keep it off me while I hold its attention!"',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'HoldOgreAttention',
            identifyChallenge: 'raise shield and brace against the ogre\'s club swing',
            explicitMeans: 'raise shield and brace against the ogre\'s club swing',
            identifyTargets: {
              ActionTargets: ['Ogre'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            hasStakes: false,
            actionCount: ['brace'],
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: false,
            activeHostileThreat: false,
            classifyCombatActionSequence: false,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Ogre')],
          proactivitySemantic: { cap: 3 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      const aggression = report.finalNarrativeHandoff.aggressionResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(proactive.CompanionInitiativeContext, 'crisis');
      assert.equal(proactive.ProactivityTarget, 'Ogre');
      assert.equal(aggression.AttackType, 'CompanionAttack');
      assert.equal(aggression.ProactivityTarget, 'Ogre');
      assert.match(prompt(report), /companion attack against Ogre/i);
      assert.match(prompt(report), /Seraphina/i);
    },
  },
  {
    name: '12p3 autonomous companion attack can target hostile ActionTarget when semantic omits OppTargets',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 7, MND: 5, CHA: 5 },
        }),
        Ogre: trackerEntry({
          currentDisposition: { B: 1, F: 2, H: 4 },
          dominantLock: 'HOSTILITY',
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 4, MND: 2, CHA: 2 },
        }),
      };
      const randoms = [
        nthRandomForDie(16, 20),
        ...Array(10).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(14, 20),
        nthRandomForDie(88, 100),
        nthRandomForDie(16, 20),
        nthRandomForDie(8, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'I raise my shield and brace as the ogre comes at us.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'BraceAgainstOgre',
            identifyChallenge: 'raise shield and brace against the ogre',
            explicitMeans: 'raise shield and brace',
            identifyTargets: {
              ActionTargets: ['Ogre'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            hasStakes: true,
            actionCount: ['brace'],
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
            activeHostileThreat: true,
            classifyCombatActionSequence: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Ogre')],
          proactivitySemantic: { cap: 3 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      const aggression = report.finalNarrativeHandoff.aggressionResults.Seraphina;
      assert.equal(proactive.Proactive, 'Y');
      assert.equal(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(proactive.CompanionInitiativeContext, 'crisis');
      assert.equal(proactive.ProactivityTarget, 'Ogre');
      assert.equal(aggression.AttackType, 'CompanionAttack');
      assert.equal(aggression.ProactivityTarget, 'Ogre');
      assert.match(prompt(report), /companion attack against Ogre/i);
      assert.match(prompt(report), /This must target only the listed hostile target/i);
    },
  },
  {
    name: '12q social OppTarget does not trigger companion crisis',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
        }),
        Clerk: trackerEntry(),
      };
      const randoms = [
        nthRandomForDie(16, 20),
        nthRandomForDie(16, 20),
        ...Array(5).fill(nthRandomForDie(1, 20)),
        nthRandomForDie(14, 20),
        nthRandomForDie(88, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'I bargain with the clerk for a better price while Seraphina stands beside me.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'NegotiatePrice',
            identifyChallenge: 'bargain with the clerk for a better price',
            explicitMeans: 'bargaining',
            identifyTargets: {
              ActionTargets: ['Clerk'],
              OppTargets: { NPC: ['Clerk'], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            hasStakes: true,
            actionCount: ['bargain'],
            mapStats: { USER: 'CHA', OPP: 'CHA' },
            activeHostileThreat: false,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Clerk')],
          proactivitySemantic: { cap: 2 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.activeHostileThreat, 'N');
      assert.equal(proactive.Proactive, 'N');
      assert.equal(proactive.CompanionInitiative ?? 'N', 'N');
      assert.notEqual(proactive.CompanionInitiativeContext ?? 'none', 'crisis');
      assert.notEqual(proactive.CompanionInitiativeTag ?? 'NONE', 'Companion_Attack');
      assert.deepEqual(report.finalNarrativeHandoff.aggressionResults, {});
    },
  },
  {
    name: '12r companion attack does not re-enable enemy attack on user critical success',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 4, F: 1, H: 1 },
          establishedRelationship: 'N',
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 7, MND: 5, CHA: 5 },
        }),
        Bear: trackerEntry({
          currentDisposition: { B: 1, F: 1, H: 4 },
          currentCoreStats: { Rank: 'Trained', MainStat: 'PHY', PHY: 6, MND: 2, CHA: 1 },
        }),
      };
      const randoms = [
        nthRandomForDie(20, 20),
        nthRandomForDie(1, 20),
        ...Array(4).fill(nthRandomForDie(1, 20)),
        ...Array(5).fill(nthRandomForDie(1, 20)),
        nthRandomForDie(14, 20),
        nthRandomForDie(90, 100),
        nthRandomForDie(16, 20),
        nthRandomForDie(8, 20),
      ];
      const report = runCaseWithRandoms({
        userText: 'I drive my sword into the bear as it tries to maul us.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'FightBear',
            identifyChallenge: 'drive my sword into the bear',
            explicitMeans: 'drive my sword into the bear',
            identifyTargets: {
              ActionTargets: ['Bear'],
              OppTargets: { NPC: ['Bear'], ENV: [] },
              BenefitedObservers: ['Seraphina'],
              HarmedObservers: [],
            },
            hasStakes: true,
            actionCount: ['sword thrust'],
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
            activeHostileThreat: true,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Bear')],
          proactivitySemantic: { cap: 2 },
        }),
      }, randoms);
      const proactiveSeraphina = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.OutcomeTier, 'Critical_Success');
      assert.equal(proactiveSeraphina.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.AttackType, 'CompanionAttack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.ProactivityTarget, 'Bear');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Bear, undefined);
    },
  },
  {
    name: '12q1 explicit ally attack does not target friendly ActionTarget fallback',
    run() {
      const tracker = {
        Seraphina: trackerEntry({
          currentDisposition: { B: 3, F: 1, H: 1 },
        }),
        Mira: trackerEntry({
          currentDisposition: { B: 3, F: 1, H: 1 },
        }),
      };
      const randoms = [
        ...Array(6).fill(nthRandomForDie(10, 20)),
        nthRandomForDie(88, 100),
      ];
      const report = runCaseWithRandoms({
        userText: 'Seraphina, hit whatever is threatening Mira while I drag Mira out of the beam.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'RescueMira',
            identifyChallenge: 'drag Mira away from a collapsing beam',
            explicitMeans: 'drag Mira clear',
            identifyTargets: {
              ActionTargets: ['Mira'],
              OppTargets: { NPC: [], ENV: ['collapsing beam'] },
              BenefitedObservers: ['Mira', 'Seraphina'],
              HarmedObservers: [],
            },
            hasStakes: false,
            actionCount: ['rescue'],
            mapStats: { USER: 'PHY', OPP: 'ENV' },
            classifyCombatActionSequence: false,
          },
          relationshipEngine: [relationship('Seraphina'), relationship('Mira')],
          proactivitySemantic: { cap: 3 },
        }),
      }, randoms);
      const proactive = report.finalNarrativeHandoff.proactivityResults.Seraphina;
      assert.notEqual(proactive.CompanionInitiativeTag, 'Companion_Attack');
      assert.notEqual(proactive.ProactivityTarget, 'Mira');
      assert.deepEqual(report.finalNarrativeHandoff.aggressionResults, {});
    },
  },
  {
    name: '12 wrist grab is boundary pressure, not hostile physical intent',
    run() {
      const report = runCase({
        userText: 'I catch Seraphina by the wrist to stop her leaving.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'StopDeparture',
            identifyChallenge: 'catch Seraphina by the wrist to stop her leaving',
            explicitMeans: 'catch Seraphina by the wrist to stop her leaving',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: ['Seraphina'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
            classifyPhysicalBoundaryPressure: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.classifyHostilePhysicalIntent, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.classifyPhysicalBoundaryPressure, 'Y');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].BoundaryPressure, 'Y');
    },
  },
  {
    name: '06 twisting grabbed wrist is hostile physical intent',
    run() {
      const report = runCase({
        userText: 'I grab Seraphina by the wrist and twist until it hurts.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'HurtTarget',
            identifyChallenge: 'grab wrist and twist until it hurts',
            explicitMeans: 'grab Seraphina by the wrist and twist until it hurts',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: ['Seraphina'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.classifyHostilePhysicalIntent, 'Y');
    },
  },
  {
    name: '07 snatching object is boundary pressure, not combat',
    run() {
      const report = runCase({
        userText: 'I snatch the sealed scroll from under the guard\'s hand.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'TakeScroll',
            identifyChallenge: 'snatch the sealed scroll from under the guard hand',
            explicitMeans: 'snatch the sealed scroll from under the guard hand',
            identifyTargets: { ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
            classifyPhysicalBoundaryPressure: false,
          },
          relationshipEngine: [relationship('Guard')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.classifyHostilePhysicalIntent, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.classifyPhysicalBoundaryPressure, 'Y');
    },
  },
  {
    name: '08 active hostile threat alone does not initialize relationship state as active enemy',
    run() {
      const report = runCase({
        userText: 'A bandit lunges from the hideout with a knife.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'SurviveAmbush',
            identifyChallenge: 'bandit lunges with a knife',
            explicitMeans: 'bandit lunges with a knife',
            identifyTargets: { ActionTargets: ['Bandit'], OppTargets: { NPC: ['Bandit'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            activeHostileThreat: true,
            mapStats: { USER: 'PHY', OPP: 'PHY' },
          },
          relationshipEngine: [relationship('Bandit')],
        }),
      });
      assert.deepEqual(report.trackerUpdate.npcs.Bandit.currentDisposition, { B: 2, F: 2, H: 2 });
      assert.equal(auditIncludes(report, 'initPreset=neutralDefault'), true);
    },
  },
  {
    name: '09 bandit label alone does not initialize active enemy',
    run() {
      const report = runCase({
        userText: 'I approach a bandit at the campfire and talk.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Talk',
            identifyChallenge: 'talk to bandit',
            explicitMeans: 'talk to bandit',
            identifyTargets: { ActionTargets: ['Bandit'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Bandit')],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Bandit.currentDisposition.H, 2);
    },
  },
  {
    name: '09a semantic userBadRep initializes B1/F2/H3',
    run() {
      const tracker = {
        Val: trackerEntry({ currentDisposition: null }),
      };
      const report = runCase({
        userText: 'I sit across from Val and say hello.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Talk',
            identifyChallenge: 'talk to Val',
            explicitMeans: 'say hello',
            identifyTargets: { ActionTargets: ['Val'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Val', { initPreset: { userBadRep: true } })],
        }),
      });
      assert.deepEqual(report.trackerUpdate.npcs.Val.currentDisposition, { B: 1, F: 2, H: 3 });
      assert.deepEqual(report.trackerUpdate.npcs.Val.userHistory, { knowsUser: 'Y', standing: 'negative' });
      assert.equal(auditIncludes(report, 'initPreset=userBadRep'), true);
    },
  },
  {
    name: '09b semantic priorUserGoodRep initializes B3/F1/H1',
    run() {
      const tracker = {
        Mira: trackerEntry({ currentDisposition: null }),
      };
      const report = runCase({
        userText: 'I greet Mira at the guild hall.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Talk',
            identifyChallenge: 'greet Mira',
            explicitMeans: 'greet Mira',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Mira', { initPreset: { priorUserGoodRep: true } })],
        }),
      });
      assert.deepEqual(report.trackerUpdate.npcs.Mira.currentDisposition, { B: 3, F: 1, H: 1 });
      assert.deepEqual(report.trackerUpdate.npcs.Mira.userHistory, { knowsUser: 'Y', standing: 'positive' });
      assert.equal(auditIncludes(report, 'initPreset=priorUserGoodRep'), true);
    },
  },
  {
    name: '09c semantic userNonHuman initializes fear unless fearImmune',
    run() {
      const tracker = {
        Villager: trackerEntry({ currentDisposition: null }),
        DemonPeer: trackerEntry({ currentDisposition: null }),
      };
      const report = runCase({
        userText: 'I speak to the villager and DemonPeer.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Talk',
            identifyChallenge: 'speak to the group',
            explicitMeans: 'speak to the group',
            identifyTargets: { ActionTargets: ['Villager', 'DemonPeer'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [
            relationship('Villager', { initPreset: { userNonHuman: true } }),
            relationship('DemonPeer', { initPreset: { userNonHuman: true, fearImmunity: true } }),
          ],
        }),
      });
      assert.deepEqual(report.trackerUpdate.npcs.Villager.currentDisposition, { B: 1, F: 3, H: 2 });
      assert.deepEqual(report.trackerUpdate.npcs.DemonPeer.currentDisposition, { B: 2, F: 2, H: 2 });
      assert.equal(auditIncludes(report, 'initPreset=userNonHuman'), true);
      assert.equal(auditIncludes(report, 'fearImmunity=Y'), true);
    },
  },
  {
    name: '09d semantic romanticOpen initializes B4/F1/H1 without forcing establishedRelationship',
    run() {
      const tracker = {
        Seraphina: trackerEntry({ currentDisposition: null }),
      };
      const report = runCase({
        userText: 'I approach Seraphina and say hello.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Talk',
            identifyChallenge: 'talk to Seraphina',
            explicitMeans: 'say hello',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', { initPreset: { romanticOpen: true }, establishedRelationship: false })],
        }),
      });
      assert.deepEqual(report.trackerUpdate.npcs.Seraphina.currentDisposition, { B: 4, F: 1, H: 1 });
      assert.equal(report.trackerUpdate.npcs.Seraphina.establishedRelationship, 'N');
      assert.equal(auditIncludes(report, 'initPreset=romanticOpen'), true);
    },
  },
  {
    name: '09d.1 establishedRelationship semantic flag remains separate from initPreset',
    run() {
      const tracker = {
        Seraphina: trackerEntry({ currentDisposition: null }),
      };
      const report = runCase({
        userText: 'I approach Seraphina and accept her confession.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'AcceptConfession',
            identifyChallenge: 'accept confession',
            explicitMeans: 'accept confession',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina', { initPreset: { romanticOpen: true }, establishedRelationship: true })],
        }),
      });
      assert.deepEqual(report.trackerUpdate.npcs.Seraphina.currentDisposition, { B: 4, F: 1, H: 1 });
      assert.equal(report.trackerUpdate.npcs.Seraphina.establishedRelationship, 'Y');
      assert.equal(auditIncludes(report, 'initPreset=romanticOpen'), true);
    },
  },
  {
    name: '10 failed hostile action still adds hostile pressure',
    run() {
      const report = runCase({
        userText: 'I punch the guard.',
        dice: [2, 18, 1, 1, 1, 1],
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'PunchGuard',
            identifyChallenge: 'punch the guard',
            explicitMeans: 'punch the guard',
            identifyTargets: { ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
          },
          relationshipEngine: [relationship('Guard')],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Guard.hostilePressure >= 1, true);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target !== 'No Change', true);
    },
  },
  {
    name: '11 multi-attack caps landed actions at three',
    run() {
      const report = runCase({
        userText: 'I punch twice and kick twice.',
        dice: [20, 1, 1, 1, 1, 1],
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'MultiAttack',
            identifyChallenge: 'punch twice and kick twice',
            explicitMeans: 'punch twice and kick twice',
            identifyTargets: { ActionTargets: ['Raider'], OppTargets: { NPC: ['Raider'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            actionCount: ['a1', 'a2', 'a3', 'a4'],
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
          },
          relationshipEngine: [relationship('Raider')],
        }),
      });
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.actions, ['a1', 'a2', 'a3']);
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.LandedActions, 3);
    },
  },
  {
    name: '12 nuanced three-strike sequence preserves three actions',
    run() {
      const report = runCase({
        userText: 'I slash, turn the momentum into a backhand cut, then drive an elbow into him.',
        dice: [20, 10, 1, 1, 1, 1],
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'AttackSequence',
            identifyChallenge: 'slash, backhand cut, elbow strike',
            explicitMeans: 'slash, backhand cut, elbow strike',
            identifyTargets: { ActionTargets: ['Duelist'], OppTargets: { NPC: ['Duelist'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            actionCount: ['slash', 'backhand cut', 'elbow strike'],
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
          },
          relationshipEngine: [relationship('Duelist')],
        }),
      });
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.actions, ['a1', 'a2', 'a3']);
    },
  },
  {
    name: '12a partial multi-hit injury only narrates landed action count',
    run() {
      const tracker = {
        Val: trackerEntry({ currentCoreStats: { Rank: 'Weak', MainStat: 'PHY', PHY: 1, MND: 1, CHA: 1 } }),
      };
      const report = runCase({
        userText: 'I slap her, pivot on my foot, drive my knee into her stomach, and finally headbutt her.',
        tracker,
        dice: [12, 18, 1, 1, 1, 1],
        ledger: baseLedger({
          engineContext: {
            userCoreStats: { Rank: 'Strong', MainStat: 'PHY', PHY: 10, MND: 5, CHA: 5 },
          },
          resolutionEngine: {
            identifyGoal: 'AttackVal',
            identifyChallenge: 'slap Val, knee her stomach, headbutt her',
            explicitMeans: 'slap Val, knee strike, headbutt',
            identifyTargets: { ActionTargets: ['Val'], OppTargets: { NPC: ['Val'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            actionCount: ['slap', 'knee strike', 'headbutt'],
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
          },
          relationshipEngine: [relationship('Val')],
          injuryEffectEngine: {
            effects: [
              { target: 'Val', targetRole: 'oppTarget', effectType: 'physical_injury', bodyPart: 'face', description: 'slap to the face', severity: 'minor', persistence: 'lasting', affectsAction: true },
              { target: 'Val', targetRole: 'oppTarget', effectType: 'physical_injury', bodyPart: 'stomach', description: 'knee strike to the stomach', severity: 'moderate', persistence: 'lasting', affectsAction: true },
              { target: 'Val', targetRole: 'oppTarget', effectType: 'physical_injury', bodyPart: 'head', description: 'headbutt to the head', severity: 'moderate', persistence: 'lasting', affectsAction: true },
            ],
          },
        }),
      });
      const resolution = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(resolution.LandedActions, 1);
      assert.equal(resolution.InflictedInjuries.length, 1);
      assert.equal(report.trackerUpdate.npcs.Val.wounds.length, 1);
      const text = prompt(report);
      assert.match(text, /Only 1 of 3 attempted actions lands/);
      assert.doesNotMatch(text, /knee strike to the stomach.*headbutt to the head/s);
    },
  },
  {
    name: '13 failed paralyze does not become NPC benefit',
    run() {
      const stakes = emptyStakeMap('none');
      stakes.failure = 'benefit';
      const report = runCase({
        userText: 'I try to paralyze the duelist.',
        dice: [2, 18, 1, 1, 1, 1],
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ParalyzeTarget',
            identifyChallenge: 'paralyze the duelist',
            explicitMeans: 'paralyze the duelist',
            identifyTargets: { ActionTargets: ['Duelist'], OppTargets: { NPC: ['Duelist'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'MND', OPP: 'PHY' },
          },
          relationshipEngine: [relationship('Duelist', { auditInteraction: true, stakeChangeByOutcome: stakes })],
        }),
      });
      assert.equal(auditIncludes(report, 'deterministicBenefitReferee'), true);
      assert.notEqual(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'Bond');
    },
  },
  {
    name: '14 concrete rescue can produce Bond',
    run() {
      const stakes = emptyStakeMap('none');
      stakes.success = 'benefit';
      const report = runCase({
        userText: 'I shove the falling beam away before it crushes Mara.',
        dice: [18, 5, 1, 1, 1, 1],
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'RescueMara',
            identifyChallenge: 'shove falling beam away',
            explicitMeans: 'rescue Mara from falling beam',
            identifyTargets: { ActionTargets: [], OppTargets: { NPC: [], ENV: ['falling beam'] }, BenefitedObservers: ['Mara'], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'ENV' },
          },
          relationshipEngine: [relationship('Mara', { auditInteraction: true, stakeChangeByOutcome: stakes })],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'Bond');
    },
  },
  {
    name: '14a hostile direct/opposed target cannot receive Bond from generic success benefit',
    run() {
      const stakes = emptyStakeMap('none');
      stakes.success = 'benefit';
      const report = runCase({
        userText: 'I step between Darai and the ogre, forcing the ogre back long enough for Darai to move.',
        dice: [18, 8, 1, 1, 1, 1, 1, 1],
        tracker: {
          Ogre: trackerEntry({ currentDisposition: { B: 1, F: 2, H: 4 }, dominantLock: 'HOSTILITY' }),
          Darai: trackerEntry({ currentDisposition: { B: 2, F: 3, H: 2 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ProtectDaraiFromOgre',
            identifyChallenge: 'step between Darai and the ogre and force the ogre back',
            explicitMeans: 'interpose against the ogre to protect Darai',
            identifyTargets: {
              ActionTargets: ['Ogre'],
              OppTargets: { NPC: ['Ogre'], ENV: [] },
              BenefitedObservers: ['Darai'],
              HarmedObservers: [],
            },
            hasStakes: true,
            actionCount: ['interpose'],
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: false,
            classifyPhysicalBoundaryPressure: true,
          },
          relationshipEngine: [
            relationship('Ogre', { auditInteraction: true, stakeChangeByOutcome: stakes }),
            relationship('Darai', { auditInteraction: true, stakeChangeByOutcome: stakes }),
          ],
        }),
      });
      const ogre = report.finalNarrativeHandoff.npcHandoffs.find(item => item.NPC === 'Ogre');
      const darai = report.finalNarrativeHandoff.npcHandoffs.find(item => item.NPC === 'Darai');
      assert.notEqual(ogre.Target, 'Bond');
      assert.equal(ogre.Target, 'Hostility');
      assert.equal(ogre.NPC_STAKES, 'Y');
      assert.equal(darai.Target, 'Bond');
      assert.equal(auditIncludes(report, 'deterministicStakeChangeReferee'), true);
    },
  },
  {
    name: '14b cooperative first aid remains direct aid, not living opposition',
    run() {
      const stakes = emptyStakeMap('none');
      stakes.success = 'benefit';
      const report = runCase({
        userText: 'I kneel beside Darai and bandage the cut across his thigh.',
        dice: [16, 5, 1, 1, 1, 1, 1, 1],
        tracker: {
          Darai: trackerEntry({
            currentDisposition: { B: 2, F: 2, H: 2 },
            condition: 'wounded',
            wounds: ['bleeding cut across the thigh'],
          }),
          Seraphina: trackerEntry({ currentDisposition: { B: 4, F: 1, H: 1 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'TreatDaraiWound',
            identifyChallenge: 'bandage Darai thigh wound',
            explicitMeans: 'first aid bandage for Darai',
            identifyTargets: {
              ActionTargets: ['Darai'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: true,
            actionCount: ['bandage wound'],
            mapStats: { USER: 'MND', OPP: 'ENV' },
          },
          relationshipEngine: [
            relationship('Darai', { auditInteraction: true, stakeChangeByOutcome: stakes }),
            relationship('Seraphina'),
          ],
        }),
      });
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['(none)']);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.ActionTargets, ['Darai']);
      const darai = report.finalNarrativeHandoff.npcHandoffs.find(item => item.NPC === 'Darai');
      assert.equal(darai.Target, 'Bond');
      assert.equal(darai.NPC_STAKES, 'Y');
      assert.equal(auditIncludes(report, 'cooperativeAidNoLivingOppositionRepair'), true);
    },
  },
  {
    name: '15 user broken leg impairs mobility roll',
    run() {
      const report = runCase({
        userText: 'I try to jump over the fence.',
        userState: { condition: 'badly_wounded', wounds: ['broken left leg'], statusEffects: [], gear: [], inventory: [], tasks: [], commitments: [] },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'JumpFence',
            identifyChallenge: 'jump over the fence',
            explicitMeans: 'jump over the fence',
            identifyTargets: { ActionTargets: [], OppTargets: { NPC: [], ENV: ['fence'] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'ENV' },
          },
        }),
      });
      const impairment = report.finalNarrativeHandoff.resolutionPacket.UserImpairment;
      assert.equal(impairment.Relevant, 'Y');
      assert.equal(impairment.AppliedToRoll, 'Y');
      assert.equal(impairment.Stage, 'severe');
    },
  },
  {
    name: '16 user broken leg impairs defense against counterattack',
    run() {
      const report = runCase({
        userText: 'I swing at the guard.',
        dice: [1, 20, 1, 20, 1, 1, 15, 10],
        userState: { condition: 'badly_wounded', wounds: ['broken left leg'], statusEffects: [], gear: [], inventory: [], tasks: [], commitments: [] },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'AttackGuard',
            identifyChallenge: 'swing at the guard',
            explicitMeans: 'swing at the guard',
            identifyTargets: { ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
          },
          relationshipEngine: [relationship('Guard')],
        }),
      });
      const aggro = report.finalNarrativeHandoff.aggressionResults.Guard;
      assert.equal(aggro.AttackType, 'CounterAttack');
      assert.equal(aggro.AttackStat, 'PHY');
      assert.equal(aggro.DefenseStat, 'PHY');
      assert.equal(aggro.UserImpairment.Relevant, 'Y');
      assert.equal(aggro.UserImpairment.AppliedToRoll, 'Y');
    },
  },
  {
    name: '16a MND-dominant NPC aggression uses MND against user defense',
    run() {
      const tracker = {
        Witch: trackerEntry({
          currentCoreStats: { Rank: 'Elite', MainStat: 'MND', PHY: 3, MND: 9, CHA: 4 },
        }),
      };
      const report = runCase({
        userText: 'I strike at the witch and leave myself open.',
        tracker,
        dice: [1, 20, 1, 20, 1, 1, 10, 10],
        userState: { condition: 'healthy', wounds: ['splitting headache'], statusEffects: [], gear: [], inventory: [], tasks: [], commitments: [] },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'AttackWitch',
            identifyChallenge: 'strike at the witch and leave myself open',
            explicitMeans: 'strike at the witch and leave myself open',
            identifyTargets: { ActionTargets: ['Witch'], OppTargets: { NPC: ['Witch'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
          },
          relationshipEngine: [relationship('Witch')],
        }),
      });
      const aggro = report.finalNarrativeHandoff.aggressionResults.Witch;
      assert.equal(aggro.AttackType, 'CounterAttack');
      assert.equal(aggro.AttackStat, 'MND');
      assert.equal(aggro.DefenseStat, 'MND');
      assert.equal(aggro.UserImpairment.Relevant, 'Y');
      assert.match(auditPrompt(report), /Witch\/CounterAttack\/.*attackStat:MND\/defenseStat:MND\/style:magical\/mental\/supernatural/);
      assert.match(auditPrompt(report), /- resolution\.nonLethal: N/);
      assert.match(auditPrompt(report), /- aggression\.roll\.Witch:/);
      assert.match(prompt(report), /used MND vs MND/);
      assert.match(prompt(report), /magic, mental force, supernatural pressure/);
    },
  },
  {
    name: '16b CHA-dominant NPC aggression ignores CHA and uses stronger PHY or MND',
    run() {
      const tracker = {
        Siren: trackerEntry({
          currentCoreStats: { Rank: 'Elite', MainStat: 'CHA', PHY: 4, MND: 6, CHA: 10 },
        }),
      };
      const report = runCase({
        userText: 'I attack the siren and overextend.',
        tracker,
        dice: [1, 20, 1, 20, 1, 1, 10, 10],
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'AttackSiren',
            identifyChallenge: 'attack the siren and overextend',
            explicitMeans: 'attack the siren and overextend',
            identifyTargets: { ActionTargets: ['Siren'], OppTargets: { NPC: ['Siren'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
          },
          relationshipEngine: [relationship('Siren')],
        }),
      });
      const aggro = report.finalNarrativeHandoff.aggressionResults.Siren;
      assert.equal(aggro.AttackType, 'CounterAttack');
      assert.equal(aggro.AttackStat, 'MND');
      assert.equal(aggro.DefenseStat, 'MND');
      assert.notEqual(aggro.AttackStat, 'CHA');
      assert.match(auditPrompt(report), /attackStat:MND\/defenseStat:MND/);
    },
  },
  {
    name: '17 NPC broken arm impairs NPC defense',
    run() {
      const tracker = { Guard: trackerEntry({ wounds: ['broken sword arm'] }) };
      const report = runCase({
        userText: 'I attack the guard with my blade.',
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'AttackGuard',
            identifyChallenge: 'attack the guard with my blade',
            explicitMeans: 'attack the guard with my blade',
            identifyTargets: { ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
          },
          relationshipEngine: [relationship('Guard')],
        }),
      });
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.NPCImpairment.Relevant, 'Y');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.NPCImpairment.AppliedToRoll, 'Y');
    },
  },
  {
    name: '18 NPC broken arm impairs counterattack offense',
    run() {
      const tracker = { Guard: trackerEntry({ wounds: ['broken sword arm'] }) };
      const report = runCase({
        userText: 'I slash at the guard and overextend.',
        tracker,
        dice: [1, 20, 1, 20, 1, 1, 15, 10],
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'AttackGuard',
            identifyChallenge: 'slash at the guard and overextend',
            explicitMeans: 'slash at the guard and overextend',
            identifyTargets: { ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
          },
          relationshipEngine: [relationship('Guard')],
        }),
      });
      const aggro = report.finalNarrativeHandoff.aggressionResults.Guard;
      assert.equal(aggro.AttackType, 'CounterAttack');
      assert.equal(aggro.NPCImpairment.Relevant, 'Y');
      assert.equal(aggro.NPCImpairment.AppliedToRoll, 'Y');
    },
  },
  {
    name: '19 landed knee-break creates persistent NPC injury',
    run() {
      const report = runCase({
        userText: 'I kick at Seraphina\'s knee as hard as possible, hoping to break her leg.',
        dice: [19, 10, 1, 1, 1, 1],
        tracker: {
          Seraphina: trackerEntry({
            currentDisposition: { B: 1, F: 4, H: 3 },
            currentCoreStats: { Rank: 'Average', MainStat: 'MND', PHY: 3, MND: 6, CHA: 5 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'BreakSeraphinaLeg',
            identifyChallenge: 'kick Seraphina\'s knee as hard as possible',
            explicitMeans: 'kick Seraphina\'s knee as hard as possible',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: ['Seraphina'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
            actionCount: [],
          },
          relationshipEngine: [relationship('Seraphina', {
            genStats: { Rank: 'Average', MainStat: 'MND', PHY: 3, MND: 6, CHA: 5 },
          })],
          injuryEffectEngine: {
            effects: [{
              target: 'Seraphina',
              targetRole: 'OppTarget',
              effectType: 'physical_injury',
              bodyPart: 'knee',
              description: 'knee injury',
              severityFloor: 'severe',
              persistence: 'lasting',
              affectsAction: true,
            }],
          },
        }),
      });
      const injuries = report.finalNarrativeHandoff.resolutionPacket.InflictedInjuries;
      assert.equal(injuries.length, 1);
      assert.equal(injuries[0].NPC, 'Seraphina');
      assert.equal(injuries[0].condition, 'badly_wounded');
      assert.match(injuries[0].woundsAdd[0], /knee/);
      assert.equal(report.trackerUpdate.npcs.Seraphina.condition, 'badly_wounded');
      assert.equal(report.trackerUpdate.npcs.Seraphina.statusEffects.some(item => /mobility impairment/i.test(item)), true);
      assert.match(auditPrompt(report), /- injury\.inflictedNpc: npc:Seraphina\/condition:badly_wounded/);
      assert.match(prompt(report), /Seraphina receives badly_wounded condition/);
    },
  },
  {
    name: '20 harmed observer receives user-inflicted injury without ActionTargets fallback',
    run() {
      const report = runCase({
        userText: 'I swing the crate into the guard beside him, trying to break his ribs.',
        dice: [19, 10, 1, 1, 1, 1],
        tracker: {
          Guard: trackerEntry({
            currentDisposition: { B: 1, F: 2, H: 3 },
            currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 4, MND: 4, CHA: 4 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'BreakGuardRibs',
            identifyChallenge: 'swing the crate into the guard to break his ribs',
            explicitMeans: 'swing the crate into the guard to break his ribs',
            identifyTargets: { ActionTargets: [], OppTargets: { NPC: [], ENV: ['heavy crate'] }, BenefitedObservers: [], HarmedObservers: ['Guard'] },
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'ENV' },
            classifyHostilePhysicalIntent: true,
            actionCount: ['swing crate'],
          },
          relationshipEngine: [relationship('Guard', {
            genStats: { Rank: 'Average', MainStat: 'PHY', PHY: 4, MND: 4, CHA: 4 },
          })],
          injuryEffectEngine: {
            effects: [{
              target: 'Guard',
              targetRole: 'HarmedObserver',
              effectType: 'physical_injury',
              bodyPart: 'ribs',
              description: 'rib injury',
              severityFloor: 'moderate',
              persistence: 'lasting',
              affectsAction: true,
            }],
          },
        }),
      });
      const injuries = report.finalNarrativeHandoff.resolutionPacket.InflictedInjuries;
      assert.equal(injuries.length, 1);
      assert.equal(injuries[0].NPC, 'Guard');
      assert.match(injuries[0].woundsAdd[0], /rib|body|chest/i);
      assert.equal(report.trackerUpdate.npcs.Guard.condition !== 'healthy', true);
    },
  },
  {
    name: '21 emotional harmed observer does not receive physical injury',
    run() {
      const report = runCase({
        userText: 'I slash the guard across the ribs while his father watches in horror.',
        dice: [19, 10, 1, 1, 1, 1],
        tracker: {
          Guard: trackerEntry(),
          Father: trackerEntry(),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'WoundGuard',
            identifyChallenge: 'slash the guard across the ribs',
            explicitMeans: 'slash the guard across the ribs while his father watches',
            identifyTargets: { ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: ['Father'] },
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
            actionCount: ['slash'],
          },
          relationshipEngine: [relationship('Guard'), relationship('Father')],
          injuryEffectEngine: {
            effects: [{
              target: 'Guard',
              targetRole: 'OppTarget',
              effectType: 'physical_injury',
              bodyPart: 'ribs',
              description: 'rib injury',
              severityFloor: 'moderate',
              persistence: 'lasting',
              affectsAction: true,
            }],
          },
        }),
      });
      const injuries = report.finalNarrativeHandoff.resolutionPacket.InflictedInjuries;
      assert.equal(injuries.some(injury => injury.NPC === 'Guard'), true);
      assert.equal(injuries.some(injury => injury.NPC === 'Father'), false);
      assert.equal(report.trackerUpdate.npcs.Guard.condition, 'badly_wounded');
      assert.equal(report.trackerUpdate.npcs.Father.condition, 'healthy');
    },
  },
  {
    name: '21a lethal nat20 critical user attack kills primary target',
    run() {
      const report = runCase({
        userText: 'I drive my sword through the guard.',
        dice: [20, 1, 1, 1, 1, 1],
        tracker: {
          Guard: trackerEntry({
            currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 4, CHA: 3 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'KillGuard',
            identifyChallenge: 'drive a sword through the guard',
            explicitMeans: 'drive a sword through the guard',
            identifyTargets: { hostilesInScene: { NPC: ['Guard'] }, ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            nonLethal: false,
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
            activeHostileThreat: true,
            actionCount: ['sword thrust'],
          },
          relationshipEngine: [relationship('Guard', {
            genStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 4, CHA: 3 },
          })],
        }),
      });
      const resolution = report.finalNarrativeHandoff.resolutionPacket;
      const injuries = resolution.InflictedInjuries;
      assert.equal(resolution.nonLethal, 'N');
      assert.equal(resolution.OutcomeTier, 'Critical_Success');
      assert.equal(injuries.length, 1);
      assert.equal(injuries[0].NPC, 'Guard');
      assert.equal(injuries[0].condition, 'dead');
      assert.equal(injuries[0].FatalityTrigger, 'nat20_critical_success');
      assert.equal(report.trackerUpdate.npcs.Guard.condition, 'dead');
      assert.match(auditPrompt(report), /injury\.inflictedNpc: npc:Guard\/condition:dead/);
      assert.match(prompt(report), /natural 20 plus Critical Success kills the target/);
      assert.match(prompt(report), /Guard receives dead condition/);
    },
  },
  {
    name: '21b nonlethal nat20 critical user attack does not kill target',
    run() {
      const report = runCase({
        userText: 'I land a clean training strike on the duelist during sparring.',
        dice: [20, 1, 1, 1, 1, 1],
        tracker: {
          Duelist: trackerEntry({
            currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 4, CHA: 4 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'WinSparringExchange',
            identifyChallenge: 'land a clean training strike during sparring',
            explicitMeans: 'land a clean training strike during sparring',
            identifyTargets: { hostilesInScene: { NPC: [] }, ActionTargets: ['Duelist'], OppTargets: { NPC: ['Duelist'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            nonLethal: true,
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
            actionCount: ['training strike'],
          },
          relationshipEngine: [relationship('Duelist', {
            genStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 4, CHA: 4 },
          })],
        }),
      });
      const resolution = report.finalNarrativeHandoff.resolutionPacket;
      const injuries = resolution.InflictedInjuries;
      assert.equal(resolution.nonLethal, 'Y');
      assert.equal(resolution.OutcomeTier, 'Critical_Success');
      assert.equal(injuries.some(injury => injury.condition === 'dead'), false);
      assert.notEqual(report.trackerUpdate.npcs.Duelist.condition, 'dead');
      assert.doesNotMatch(prompt(report), /receives dead condition/);
    },
  },
  {
    name: '21c landed lethal hit finishes badly wounded target',
    run() {
      const report = runCase({
        userText: 'I cut the badly wounded guard again.',
        dice: [10, 10, 1, 1, 1, 1],
        tracker: {
          Guard: trackerEntry({
            condition: 'badly_wounded',
            wounds: ['deep thigh wound'],
            currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 4, CHA: 3 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'FinishGuard',
            identifyChallenge: 'cut the badly wounded guard again',
            explicitMeans: 'cut the badly wounded guard again',
            identifyTargets: { hostilesInScene: { NPC: ['Guard'] }, ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            nonLethal: false,
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
            activeHostileThreat: true,
            actionCount: ['cut'],
          },
          relationshipEngine: [relationship('Guard', {
            genStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 4, CHA: 3 },
          })],
        }),
      });
      const resolution = report.finalNarrativeHandoff.resolutionPacket;
      const injuries = resolution.InflictedInjuries;
      assert.equal(resolution.LandedActions > 0, true);
      assert.equal(injuries.length, 1);
      assert.equal(injuries[0].NPC, 'Guard');
      assert.equal(injuries[0].condition, 'dead');
      assert.equal(injuries[0].FatalityTrigger, 'finish_off_badly_wounded');
      assert.equal(report.trackerUpdate.npcs.Guard.condition, 'dead');
      assert.match(prompt(report), /fatal finish against an already badly wounded or critical target/);
    },
  },
  {
    name: '21d landed lethal hit finishes critical target',
    run() {
      const report = runCase({
        userText: 'I stab the critical raider before he can raise the axe.',
        dice: [10, 10, 1, 1, 1, 1],
        tracker: {
          Raider: trackerEntry({
            condition: 'critical',
            wounds: ['punctured lung'],
            currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 3, CHA: 2 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'FinishRaider',
            identifyChallenge: 'stab the critical raider',
            explicitMeans: 'stab the critical raider',
            identifyTargets: { hostilesInScene: { NPC: ['Raider'] }, ActionTargets: ['Raider'], OppTargets: { NPC: ['Raider'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            nonLethal: false,
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
            activeHostileThreat: true,
            actionCount: ['stab'],
          },
          relationshipEngine: [relationship('Raider', {
            genStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 3, CHA: 2 },
          })],
        }),
      });
      const injuries = report.finalNarrativeHandoff.resolutionPacket.InflictedInjuries;
      assert.equal(injuries.length, 1);
      assert.equal(injuries[0].NPC, 'Raider');
      assert.equal(injuries[0].condition, 'dead');
      assert.equal(injuries[0].FatalityTrigger, 'finish_off_critical');
      assert.equal(report.trackerUpdate.npcs.Raider.condition, 'dead');
      assert.match(prompt(report), /Raider receives dead condition/);
    },
  },
  {
    name: '21e ordinary landed lethal hit against healthy target does not auto-kill',
    run() {
      const report = runCase({
        userText: 'I slash the guard with my sword.',
        dice: [10, 10, 1, 1, 1, 1],
        tracker: {
          Guard: trackerEntry({
            currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 4, CHA: 3 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'SlashGuard',
            identifyChallenge: 'slash the guard with a sword',
            explicitMeans: 'slash the guard with a sword',
            identifyTargets: { hostilesInScene: { NPC: ['Guard'] }, ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            nonLethal: false,
            hasStakes: true,
            mapStats: { USER: 'PHY', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
            activeHostileThreat: true,
            actionCount: ['slash'],
          },
          relationshipEngine: [relationship('Guard', {
            genStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 4, CHA: 3 },
          })],
        }),
      });
      const resolution = report.finalNarrativeHandoff.resolutionPacket;
      const injuries = resolution.InflictedInjuries;
      assert.equal(resolution.OutcomeTier, 'Minor_Success');
      assert.equal(injuries.some(injury => injury.condition === 'dead'), false);
      assert.notEqual(report.trackerUpdate.npcs.Guard.condition, 'dead');
      assert.doesNotMatch(prompt(report), /receives dead condition/);
    },
  },
  {
    name: '22 name generation validates semantic candidates and prompt offers approved pool',
    run() {
      const ctx = context('The butcher smiles and says his name is...');
      const report = withDice([10, 10, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1], () => runDeterministicEngines(
        baseLedger({
          resolutionEngine: {
            identifyGoal: 'LearnName',
            identifyChallenge: 'butcher says his name is',
            explicitMeans: 'butcher says his name is',
            identifyTargets: { ActionTargets: [], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          nameSemantic: {
            selectedStyle: 'Balanced Fantasy',
            maleCandidates: ['Ravon', 'Versobom', 'Talor'],
            femaleCandidates: ['Nulira', 'Staistu', 'Shavira'],
            locationCandidates: ['Koravalen', 'Vaisailnok', 'Navarosh'],
          },
        }),
        {},
        ctx,
        'normal',
      ));
      const pool = report.finalNarrativeHandoff.nameGeneration.namePool;
      assert.equal(report.finalNarrativeHandoff.nameGeneration.style, 'Balanced Fantasy');
      assert.equal(pool.male.length, 3);
      assert.equal(pool.female.length, 3);
      assert.equal(pool.location.length, 3);
      assert.equal(pool.male.includes('Ravon'), true);
      assert.equal(pool.female.includes('Nulira'), true);
      assert.equal(pool.location.includes('Koravalen'), true);
      assert.equal(report.finalNarrativeHandoff.nameGeneration.semanticRejected.some(item => item.name === 'Versobom'), true);
      assert.equal(report.finalNarrativeHandoff.nameGeneration.semanticRejected.some(item => item.name === 'Staistu'), true);
      assert.match(pool.male[0], /^[A-Z][a-z]{3,8}$/);
      for (const name of [...pool.male, ...pool.female, ...pool.location]) {
        assert.doesNotMatch(name, /(?:Versobom|Maibivun|Staistu|Vaisailnok|stai|biv|bom|sailn|lnok|ivun)/i);
      }
      const modelPrompt = prompt(report);
      assert.match(modelPrompt, /Name pool use is mandatory and obeys fogOfWar\(\)\./);
      assert.match(modelPrompt, /approved generated name pool is mandatory and closed-world/);
      assert.match(modelPrompt, /Do not invent, modify, translate, combine, suffix, add surnames to, or derive names/);
      for (const name of [...pool.male, ...pool.female, ...pool.location]) {
        assert.equal(modelPrompt.includes(name), true);
      }
      assert.doesNotMatch(modelPrompt, /Versobom|Staistu|Vaisailnok/);
      assert.match(auditPrompt(report), /nameGeneration\.result: style: Balanced Fantasy; final: Male:/);
      assert.doesNotMatch(auditPrompt(report), /semanticCandidates|rejected:|replacements:|Versobom|Staistu|Vaisailnok/);
      assert.match(auditPrompt(report), /final: Male:/);
      const reserved = ctx.chatMetadata.structuredPreflightNameRegistry?.used || [];
      assert.equal(pool.male.every(name => reserved.includes(name)), true);
      assert.equal(pool.female.every(name => reserved.includes(name)), true);
      assert.equal(pool.location.every(name => reserved.includes(name)), true);
    },
  },
  {
    name: '22a narrator prompt exposes person and location name pools distinctly',
    run() {
      const report = runCase({
        userText: 'Introduce two unnamed travelers and a nearby ruined shrine.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'IntroduceScene',
            identifyChallenge: 'introduce two unnamed travelers and a nearby ruined shrine',
            explicitMeans: 'introduce two unnamed travelers and a nearby ruined shrine',
            identifyTargets: { ActionTargets: [], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
        }),
      });
      const text = prompt(report);
      assert.match(text, /Name pool use is mandatory and obeys fogOfWar\(\)\./);
      assert.match(text, /Male person\/entity names allowed only for newly revealed male/);
      assert.match(text, /Female person\/entity names allowed only for newly revealed female/);
      assert.match(text, /Location\/place names allowed for newly revealed places:/);
      assert.match(text, /Any newly revealed proper name in this response must come only from the approved generated name pool in ACTIVE_BRANCH_FACTS/);
      assert.match(text, /Female\/girl\/woman\/she-her NPCs must use the female list only/);
      assert.match(text, /A girl, woman, female, or she\/her NPC must never receive a male-list name/);
      assert.match(text, /Do not assign names to background, incidental, or unnamed figures/);
      assert.doesNotMatch(text, /semanticCandidates|rejected:|replacements:/);
    },
  },
  {
    name: '22a.1 name style setting deterministically changes generated pool',
    run() {
      const base = {
        userText: 'The old map says the ruined harbor is called...',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'LearnPlaceName',
            identifyChallenge: 'ruined harbor is called',
            explicitMeans: 'ruined harbor is called',
            identifyTargets: { ActionTargets: [], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
        }),
      };
      const balanced = runCase(base);
      const norse = runCase({
        ...base,
        cardFields: {
          structuredPreflightSettings: { nameStyle: 'Norse / Old Germanic Fantasy' },
        },
      });
      assert.equal(norse.finalNarrativeHandoff.nameGeneration.style, 'Norse / Old Germanic Fantasy');
      assert.notDeepEqual(norse.finalNarrativeHandoff.nameGeneration.namePool, balanced.finalNarrativeHandoff.nameGeneration.namePool);
      assert.match(auditPrompt(norse), /nameGeneration\.result: style: Norse \/ Old Germanic Fantasy;/);
    },
  },
  {
    name: '22b non-coercive social opposition success does not damage relationship',
    run() {
      const report = runCase({
        userText: 'I haggle with Orlan over rope, keeping my tone civil.',
        dice: [19, 16, 1, 1, 1, 1],
        tracker: {
          Orlan: trackerEntry(),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Haggle',
            identifyChallenge: 'haggle civilly over rope price',
            explicitMeans: 'civil haggling',
            identifyTargets: { ActionTargets: ['Orlan'], OppTargets: { NPC: ['Orlan'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'CHA', OPP: 'CHA' },
          },
          relationshipEngine: [relationship('Orlan')],
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Orlan.currentDisposition.H, 2);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs[0].Target, 'No Change');
      assert.equal(auditIncludes(report, '3.4c routeDispositionTarget=No Change'), true);
    },
  },
  {
    name: '22b.1 living social target omitted from OppTargets is repaired away from ENV',
    run() {
      const report = runCase({
        userText: 'I ask Darai what she knows about her missing husband.',
        dice: [8, 16, 1, 1, 1, 1],
        tracker: {
          Darai: trackerEntry({
            currentCoreStats: { Rank: 'Average', MainStat: 'CHA', PHY: 1, MND: 2, CHA: 3 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'AskDarai',
            identifyChallenge: 'ask Darai for information about her missing husband to help find him',
            explicitMeans: 'ask Darai calmly',
            identifyTargets: { ActionTargets: ['Darai'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'CHA', OPP: 'ENV' },
          },
          relationshipEngine: [relationship('Darai')],
        }),
      });
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['Darai']);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.ENV, ['(none)']);
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.OutcomeTier, 'Failure');
      assert.equal(auditIncludes(report, 'deterministicLivingOppositionRepair'), true);
      assert.equal(auditIncludes(report, 'deterministicLivingOppStatRepair'), true);
      assert.match(auditPrompt(report), /resolution\.rollFull: 1d20\(8\) \+ CHA\(6\) = 14 vs 1d20\(16\) \+ CHA\(3\) = 19 \(-5 - Failure\)/);
    },
  },
  {
    name: '22c threat posture without aggression omits triggersAggressionRoll N',
    run() {
      const report = runCase({
        userText: 'I pressure Mira to guide me through the ridge immediately despite the risk.',
        dice: [10, 20, 20, 1, 20, 1, 1, 1],
        tracker: {
          Mira: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 3 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'PersuadeMira',
            identifyChallenge: 'persuade Mira to guide me through the dangerous ridge immediately',
            explicitMeans: 'pressure Mira verbally',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: ['Mira'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'CHA', OPP: 'CHA' },
          },
          relationshipEngine: [relationship('Mira')],
        }),
      });
      const auditText = auditPrompt(report);
      assert.match(auditText, /proactivity\.result: Mira: THREAT_OR_POSTURE/);
      assert.doesNotMatch(auditText, /triggersAggressionRoll:N/);
    },
  },
  {
    name: '23 semantic status effect creates impairment when landed',
    run() {
      const report = runCase({
        userText: 'I channel a binding spell at the duelist to lock his limbs in place.',
        dice: [18, 8, 1, 1, 1, 1],
        tracker: {
          Duelist: trackerEntry(),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'BindDuelist',
            identifyChallenge: 'bind the duelist with magic',
            explicitMeans: 'binding spell locks the duelist limbs',
            identifyTargets: { ActionTargets: ['Duelist'], OppTargets: { NPC: ['Duelist'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'MND', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
            actionCount: ['binding spell'],
          },
          relationshipEngine: [relationship('Duelist')],
          injuryEffectEngine: {
            effects: [{
              target: 'Duelist',
              targetRole: 'OppTarget',
              effectType: 'restraint',
              bodyPart: 'body',
              description: 'magical limb binding',
              severityFloor: 'moderate',
              persistence: 'lasting',
              affectsAction: true,
            }],
          },
        }),
      });
      const injuries = report.finalNarrativeHandoff.resolutionPacket.InflictedInjuries;
      assert.equal(injuries.length, 1);
      assert.equal(injuries[0].NPC, 'Duelist');
      assert.equal(injuries[0].woundsAdd.length, 0);
      assert.equal(injuries[0].statusAdd.some(item => /mobility impairment/i.test(item)), true);
      assert.equal(report.trackerUpdate.npcs.Duelist.statusEffects.some(item => /mobility impairment/i.test(item)), true);
    },
  },
  {
    name: '24 semantic status effect is ignored when roll fails',
    run() {
      const report = runCase({
        userText: 'I try to poison the guard with a numbing hex.',
        dice: [1, 20, 1, 1, 1, 1],
        tracker: {
          Guard: trackerEntry(),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'PoisonGuard',
            identifyChallenge: 'poison the guard with a hex',
            explicitMeans: 'numbing poison hex',
            identifyTargets: { ActionTargets: ['Guard'], OppTargets: { NPC: ['Guard'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'MND', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
            actionCount: ['poison hex'],
          },
          relationshipEngine: [relationship('Guard')],
          injuryEffectEngine: {
            effects: [{
              target: 'Guard',
              targetRole: 'OppTarget',
              effectType: 'poison',
              bodyPart: 'body',
              description: 'numbing poison',
              severityFloor: 'moderate',
              persistence: 'lasting',
              affectsAction: true,
            }],
          },
        }),
      });
      const injuries = report.finalNarrativeHandoff.resolutionPacket.InflictedInjuries;
      assert.equal(injuries.length, 0);
      assert.equal(report.trackerUpdate.npcs.Guard.statusEffects.length, 0);
    },
  },
  {
    name: '25 name generation produces location-like name pool entries',
    run() {
      const report = runCase({
        userText: 'The old map says the ruined harbor is called...',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'LearnPlaceName',
            identifyChallenge: 'ruined harbor is called',
            explicitMeans: 'ruined harbor is called',
            identifyTargets: { ActionTargets: [], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
        }),
      });
      const locations = report.finalNarrativeHandoff.nameGeneration.namePool.location;
      assert.equal(locations.length, 3);
      assert.match(locations[0], /^[A-Z][a-z]{6,13}$/);
    },
  },
  {
    name: '26 non-combat success lands one action without becoming combat',
    run() {
      const report = runCase({
        userText: 'I politely persuade the clerk to let me see the old ledger.',
        dice: [18, 8, 1, 1, 1, 1],
        tracker: {
          Clerk: trackerEntry(),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'PersuadeClerk',
            identifyChallenge: 'politely persuade the clerk',
            explicitMeans: 'polite persuasion',
            identifyTargets: { ActionTargets: ['Clerk'], OppTargets: { NPC: ['Clerk'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            actionCount: ['a1'],
            mapStats: { USER: 'CHA', OPP: 'CHA' },
            classifyHostilePhysicalIntent: false,
          },
          relationshipEngine: [relationship('Clerk')],
        }),
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.LandedActions, 1);
      assert.equal(packet.classifyCombatActionSequence, 'N');
      assert.equal(packet.CounterPotential, 'none');
    },
  },
  {
    name: '27 mixed combat sequence can land up to action count',
    run() {
      const report = runCase({
        userText: 'I cast a fireball at the raider, then rush in and swing my sword.',
        dice: [20, 1, 1, 1, 1, 1],
        tracker: {
          Raider: trackerEntry(),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'DefeatRaider',
            identifyChallenge: 'cast a fireball and swing a sword',
            explicitMeans: 'fireball then sword swing',
            identifyTargets: { ActionTargets: ['Raider'], OppTargets: { NPC: ['Raider'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            actionCount: ['fireball', 'sword swing'],
            mapStats: { USER: 'MND', OPP: 'PHY' },
            classifyHostilePhysicalIntent: false,
          },
          relationshipEngine: [relationship('Raider')],
          injuryEffectEngine: {
            effects: [{
              target: 'Raider',
              targetRole: 'OppTarget',
              effectType: 'burn',
              bodyPart: 'body',
              description: 'fire burns',
              severityFloor: 'moderate',
              persistence: 'lasting',
              affectsAction: true,
            }],
          },
        }),
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.deepEqual(packet.actions, ['a1', 'a2']);
      assert.equal(packet.classifyCombatActionSequence, 'Y');
      assert.equal(packet.LandedActions, 2);
    },
  },
  {
    name: '28 narrator translates chaos tags into concise guidance',
    run() {
      const report = {
        semanticLedger: {
          resolutionEngine: {
            identifyChallenge: 'search the ruined shrine for a hidden record',
            explicitMeans: 'careful search',
          },
        },
        finalNarrativeHandoff: {
          generationType: 'normal',
          resolutionPacket: {
            GOAL: 'SearchShrine',
            STAKES: 'Y',
            OutcomeTier: 'Success',
            Outcome: 'solid_impact',
            LandedActions: 1,
            CounterPotential: 'none',
            ActionTargets: ['Seraphina'],
            OppTargets: { NPC: [], ENV: ['ruined shrine'] },
            BenefitedObservers: [],
            HarmedObservers: [],
            classifyPhysicalBoundaryPressure: 'N',
          },
          npcHandoffs: [{
            NPC: 'Seraphina',
            FinalState: 'B3/F1/H1',
            Behavior: 'FRIENDLY',
            Target: 'No Change',
            NPC_STAKES: 'N',
            Landed: 'Y',
            BoundaryPressure: 'N',
          }],
          chaosHandoff: {
            CHAOS: {
              triggered: true,
              band: 'BENEFICIAL',
              magnitude: 'MODERATE',
              anchor: 'CLUE',
              vector: 'ENVIRONMENT',
            },
          },
          proactivityResults: {},
          aggressionResults: {},
          nameGeneration: {},
          resultLine: 'RESULT solid_impact: 18 vs 1d20(9) = 9',
        },
      };
      const text = prompt(report);
      const audit = auditPrompt(report);
      assert.match(audit, /- chaos\.result: BENEFICIAL\/MODERATE\/CLUE\/ENVIRONMENT/);
      assert.doesNotMatch(text, /MECHANICS_RESULTS/);
      assert.doesNotMatch(text, /- chaos\.result:/);
      assert.match(text, /brief unexpected scene beat/);
      assert.match(text, /creates a useful opening, information, or advantage/);
      assert.match(text, /Make it noticeable but brief/);
      assert.match(text, /information, evidence, a sign, or an overheard detail/);
      assert.match(text, /Choose the concrete implementation freely/);
      assert.match(text, /do not override the main outcome, consent limits, attacks, injuries, or relationship results/);
      assert.doesNotMatch(text, /Chaos Guide|BENEFICIAL|MODERATE|CLUE|ENVIRONMENT/);
    },
  },
  {
    name: '29 NPC personality summary persists and informs narration softly',
    run() {
      const report = runCase({
        userText: 'I greet Seraphina at the campfire.',
        tracker: {
          Seraphina: trackerEntry({
            personalitySummary: 'Gentle, observant, and cautious with new trust.',
            currentDisposition: { B: 3, F: 1, H: 1 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'greet Seraphina at the campfire',
            explicitMeans: 'greet Seraphina',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      const handoff = report.finalNarrativeHandoff.npcHandoffs[0];
      assert.equal(handoff.PersonalitySummary, 'Gentle, observant, and cautious with new trust.');
      assert.equal(report.trackerUpdate.npcs.Seraphina.personalitySummary, 'Gentle, observant, and cautious with new trust.');
      assert.match(prompt(report), /stable personality note as expression guidance/);
      assert.match(prompt(report), /Gentle, observant, and cautious with new trust/);
    },
  },
  {
    name: '29a narrator relationship guide uses refined fear and trust state wording',
    run() {
      const fearReport = runCase({
        userText: 'I speak calmly to Seraphina.',
        tracker: {
          Seraphina: trackerEntry({
            currentDisposition: { B: 1, F: 3, H: 2 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'speak calmly to Seraphina',
            explicitMeans: 'speak calmly',
            identifyTargets: { ActionTargets: ['Seraphina'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.match(prompt(fearReport), /Fear-led: wants distance, safety, witnesses, or an exit/);
      assert.match(prompt(fearReport), /not comfort, attraction, trust, or willingness/);
      assert.doesNotMatch(prompt(fearReport), /submissive/i);

      const trustReport = runCase({
        userText: 'I talk with Mira by the fire.',
        tracker: {
          Mira: trackerEntry({
            currentDisposition: { B: 3, F: 1, H: 1 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Normal_Interaction',
            identifyChallenge: 'talk with Mira',
            explicitMeans: 'talk with Mira',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Mira')],
        }),
      });
      assert.match(prompt(trustReport), /Friendly comfort: cooperative, relaxed, warm/);
      assert.match(prompt(trustReport), /not automatic romance or intimacy/);
    },
  },
  {
    name: '30 tracker delta updates NPC personality summary without touching mechanics',
    run() {
      const report = runCase({
        userText: 'I listen while Mira calmly negotiates with the innkeeper.',
        tracker: {
          Mira: trackerEntry({
            personalitySummary: 'Reserved and practical.',
          }),
        },
        ledger: baseLedger({
          trackerUpdateEngine: {
            user: emptyUserDelta(),
            npcs: [{
              NPC: 'Mira',
              personalitySummary: 'Patient, diplomatic, and quietly protective.',
              condition: 'unchanged',
              woundsAdd: [],
              woundsRemove: [],
              statusAdd: [],
              statusRemove: [],
              gearAdd: [],
              gearRemove: [],
            }],
          },
        }),
      });
      assert.equal(report.trackerUpdate.npcs.Mira.personalitySummary, 'Patient, diplomatic, and quietly protective.');
      assert.equal(report.trackerUpdate.npcs.Mira.condition, 'healthy');
      assert.deepEqual(report.trackerUpdate.npcs.Mira.wounds, []);
    },
  },
  {
    name: '31 relationship engine entry alone does not make NPC in scene',
    run() {
      const report = runCase({
        userText: 'I look around the empty road.',
        tracker: {
          Bystander: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }),
        },
        ledger: baseLedger({
          relationshipEngine: [relationship('Bystander', {
            slowBondEvidence: { cooperation: true, personalAttention: true, playfulness: true },
          })],
        }),
      });
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.NPCInScene, ['(none)']);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs.length, 0);
      assert.equal(report.trackerUpdate.npcs.Bystander.currentRapport, 0);
    },
  },
  {
    name: '32 deterministic proactivity cap allows up to three NPCs',
    run() {
      const tracker = {
        Asha: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }),
        Bira: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }),
        Cira: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }),
        Dava: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }),
      };
      const report = runCase({
        userText: 'I ask the group what they think of the route ahead.',
        dice: [
          ...Array(11).fill(10),
          20, 19, 18, 17,
        ],
        tracker,
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'GroupDiscussion',
            identifyChallenge: 'ask the group what they think',
            explicitMeans: 'ask the group what they think',
            identifyTargets: {
              ActionTargets: ['Asha', 'Bira', 'Cira', 'Dava'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [
            relationship('Asha'),
            relationship('Bira'),
            relationship('Cira'),
            relationship('Dava'),
          ],
          proactivitySemantic: { cap: 1 },
        }),
      });
      const active = Object.values(report.finalNarrativeHandoff.proactivityResults)
        .filter(value => value.Proactive === 'Y');
      assert.equal(active.length, 3);
      assert.equal(auditIncludes(report, '6.2c cap=3'), true);
    },
  },
  {
    name: '33 post-narration tracker delta uses fenced prefix block and narrator omits it',
    run() {
      assert.match(TRACKER_DELTA_TEMPLATE, /```story_engine_tracker_delta\s*BEGIN_TRACKER_DELTA/i);
      assert.match(TRACKER_DELTA_TEMPLATE, /END_TRACKER_DELTA\s*```/i);
      assert.match(TRACKER_DELTA_TEMPLATE, /TrackerUpdateEngine\.NPC\[0\]\.revealedName=\(none\)/i);
      const prompt = formatNarratorModelPromptContext(runCase({
        userText: 'I take a key.',
        ledger: baseLedger({
          trackerUpdateEngine: {
            user: {
              ...emptyUserDelta(),
              inventoryAdd: ['small iron key'],
            },
            npcs: [],
          },
        }),
      }));
      assert.doesNotMatch(prompt, /```story_engine_tracker_delta/i);
      assert.doesNotMatch(prompt, /BEGIN_TRACKER_DELTA/i);
      assert.match(prompt, /Do not output tracker updates/i);
    },
  },
  {
    name: '33a hidden power actor enmity records meaningful known setbacks',
    run() {
      const report = runCase({
        userText: 'I burn the Red Glass Syndicate ledger in front of their dock crew.',
        ledger: baseLedger({
          powerActorEnmity: {
            effects: [{
              actor: 'Red Glass Syndicate',
              actorType: 'criminal syndicate',
              hasReach: true,
              effect: 'disrupt_operation',
              severity: 'meaningful',
              reason: 'User destroyed their smuggling ledger',
              knownToActor: true,
            }],
          },
        }),
      });
      const actor = report.trackerUpdate.powerActors['Red Glass Syndicate'];
      assert.equal(actor.enmity, 2);
      assert.equal(actor.tier, 'Obstructive');
      assert.equal(actor.type, 'criminal syndicate');
      assert.deepEqual(actor.reasons, ['User destroyed their smuggling ledger']);
      assert.equal(actor.lastEffect.effect, 'disrupt_operation');
      assert.equal(actor.lastEffect.severity, 'meaningful');
      assert.equal(actor.lastEffect.delta, 2);
      assert.equal(report.finalNarrativeHandoff.powerActorPressure.entries[0].Actor, 'Red Glass Syndicate');
      assert.equal(report.finalNarrativeHandoff.powerActorPressure.entries[0].Tier, 'Obstructive');
      assert.match(auditPrompt(report), /- powerActor\.pressure: Red Glass Syndicate \(criminal syndicate\): enmity 2, tier Obstructive/);
      assert.doesNotMatch(prompt(report), /Power actor pressure:/);
      assert.doesNotMatch(prompt(report), /Red Glass Syndicate \(criminal syndicate\): enmity 2/);
      assert.doesNotMatch(prompt(report), /Red Glass Syndicate \(criminal syndicate\): enmity 2/);
      assert.equal(auditIncludes(report, 'STEP 3P: EXECUTE PowerActorEnmity USING SEMANTIC_LEDGER'), true);
      assert.equal(auditIncludes(report, 'powerActorEnmityUpdate='), true);
    },
  },
  {
    name: '33a.1 power actor assessment is audit-only without enmity pressure',
    run() {
      const report = runCase({
        userText: 'I greet the prominent merchant in the capital as I walk by.',
        tracker: {
          shopkeeper: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 2 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'greet the prominent merchant in the capital',
            identifyChallenge: 'greet the prominent merchant in the capital',
            explicitMeans: 'greet the merchant',
            identifyTargets: {
              ActionTargets: ['shopkeeper'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
              PowerActors: ['shopkeeper'],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('shopkeeper')],
          powerActorEnmity: {
            assessments: [{
              actor: 'shopkeeper',
              scope: 'individual',
              isPowerActor: true,
              actorType: 'prominent merchant',
              reach: ['capital trade network', 'money', 'reputation'],
              evidence: 'character card says prominent merchant in the capital',
              assessmentReason: 'has influence and trade reach beyond personal reaction',
            }],
            effects: [],
          },
        }),
      });
      const audit = auditPrompt(report);
      const modelPrompt = prompt(report);
      assert.match(audit, /- powerActor\.assessment: shopkeeper\/Y\/individual\/prominent merchant\/reach:capital trade network,money,reputation/);
      assert.match(audit, /- powerActor\.enmityEffect: none/);
      assert.match(audit, /- powerActor\.pressure: none/);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.PowerActors, ['shopkeeper']);
      assert.match(audit, /- resolution\.targets: action:shopkeeper; power:shopkeeper/);
      assert.match(audit, /npc\.state: shopkeeper/);
      assert.doesNotMatch(modelPrompt, /Power actor pressure:/);
      assert.doesNotMatch(modelPrompt, /powerActor\.assessment/);
      assert.doesNotMatch(modelPrompt, /prominent merchant\/reach/);
    },
  },
  {
    name: '33a.2 power actor target bucket does not create relationship by itself',
    run() {
      const report = runCase({
        userText: 'I pass under banners belonging to House Veyra without speaking to anyone.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'pass under House Veyra banners',
            identifyChallenge: 'walk through the street',
            explicitMeans: 'walking',
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
              PowerActors: ['House Veyra'],
            },
            hasStakes: false,
          },
          relationshipEngine: [],
          powerActorEnmity: {
            assessments: [{
              actor: 'House Veyra',
              scope: 'organization',
              isPowerActor: true,
              actorType: 'noble house',
              reach: ['guards', 'political leverage'],
              evidence: 'banners identify the house controlling the street',
              assessmentReason: 'noble house has resources and authority',
            }],
            effects: [],
          },
        }),
      });
      const audit = auditPrompt(report);
      assert.deepEqual(report.trackerUpdate.npcs, {});
      assert.deepEqual(report.finalNarrativeHandoff.npcHandoffs, []);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.PowerActors, ['House Veyra']);
      assert.match(audit, /- resolution\.targets: power:House Veyra/);
      assert.match(audit, /- npc\.state: none/);
      assert.match(audit, /- powerActor\.assessment: House Veyra\/Y\/organization\/noble house/);
      assert.doesNotMatch(prompt(report), /Power actor pressure:/);
    },
  },
  {
    name: '33a.3 harmed observer can also be power actor',
    run() {
      const report = runCase({
        userText: 'I publicly shame Lady Veyra by exposing her brother as a fraud.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'publicly shame Lady Veyra through her brother',
            identifyChallenge: 'expose her brother as a fraud in public',
            explicitMeans: 'public accusation',
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: ['Lady Veyra'],
              PowerActors: ['Lady Veyra', 'House Veyra'],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Lady Veyra', {
            stakeChangeByOutcome: emptyStakeMap('harm'),
          })],
          powerActorEnmity: {
            assessments: [{
              actor: 'Lady Veyra',
              scope: 'individual',
              isPowerActor: true,
              actorType: 'noblewoman',
              reach: ['family guards', 'social reputation'],
              evidence: 'publicly shamed noblewoman',
              assessmentReason: 'individual has noble-house reach beyond personal reaction',
            }, {
              actor: 'House Veyra',
              scope: 'organization',
              isPowerActor: true,
              actorType: 'noble house',
              reach: ['guards', 'political leverage'],
              evidence: 'her house reputation is implicated',
              assessmentReason: 'house has institutional reach',
            }],
            effects: [{
              actor: 'House Veyra',
              actorType: 'noble house',
              hasReach: true,
              effect: 'damage_reputation_or_income',
              severity: 'meaningful',
              reason: 'User publicly exposed a family fraud',
              knownToActor: true,
            }],
          },
        }),
      });
      const audit = auditPrompt(report);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.HarmedObservers, ['Lady Veyra']);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.PowerActors, ['Lady Veyra', 'House Veyra']);
      assert.match(audit, /- resolution\.targets: harms:Lady Veyra; power:Lady Veyra,House Veyra/);
      assert.match(audit, /- npc\.state: Lady Veyra/);
      assert.match(audit, /- powerActor\.assessment: Lady Veyra\/Y\/individual\/noblewoman/);
      assert.match(audit, /- powerActor\.enmityEffect: House Veyra\/noble house\/damage_reputation_or_income\/meaningful\/known:Y/);
      assert.match(audit, /- powerActor\.pressure: House Veyra \(noble house\): enmity 2, tier Obstructive/);
      assert.doesNotMatch(prompt(report), /Power actor pressure:/);
      assert.doesNotMatch(prompt(report), /House Veyra \(noble house\): enmity 2/);
    },
  },
  {
    name: '33b hidden power actor enmity ignores ordinary or unknown actors',
    run() {
      const report = runCase({
        userText: 'I insult a random dockhand and quietly steal from a distant baron no one can trace.',
        ledger: baseLedger({
          powerActorEnmity: {
            effects: [
              {
                actor: 'angry dockhand',
                actorType: 'ordinary individual',
                hasReach: false,
                effect: 'humiliate',
                severity: 'minor',
                reason: 'User insulted one ordinary person',
                knownToActor: true,
              },
              {
                actor: 'House Veyr',
                actorType: 'noble house',
                hasReach: true,
                effect: 'steal',
                severity: 'meaningful',
                reason: 'User stole a sealed coin purse without witnesses',
                knownToActor: false,
              },
            ],
          },
        }),
      });
      assert.deepEqual(report.trackerUpdate.powerActors, {});
      assert.deepEqual(report.finalNarrativeHandoff.powerActorPressure.entries, []);
      assert.equal(auditIncludes(report, 'ignoredPowerActorEffect'), true);
      assert.doesNotMatch(prompt(report), /Power actor pressure:/);
    },
  },
  {
    name: '33c hidden power actor enmity escalates existing state without visible NPC tracker exposure',
    run() {
      const report = runCase({
        userText: 'I publicly expose the Red Glass Syndicate captain and hand over their route maps.',
        powerActors: {
          'red glass syndicate': {
            name: 'red glass syndicate',
            type: 'criminal syndicate',
            enmity: 2,
            reasons: ['User destroyed their smuggling ledger'],
            responseHistory: ['paid street toughs to watch the docks'],
            lastEffect: {
              effect: 'disrupt_operation',
              severity: 'meaningful',
              reason: 'User destroyed their smuggling ledger',
              delta: 2,
              at: 100,
            },
          },
        },
        ledger: baseLedger({
          powerActorEnmity: {
            effects: [{
              actor: 'Red Glass Syndicate',
              actorType: 'criminal syndicate',
              hasReach: true,
              effect: 'expose',
              severity: 'major',
              reason: 'User publicly exposed their smuggling route maps',
              knownToActor: true,
            }],
          },
        }),
      });
      const actor = report.trackerUpdate.powerActors['red glass syndicate'];
      assert.equal(actor.enmity, 5);
      assert.equal(actor.tier, 'Strategic Campaign');
      assert.deepEqual(actor.reasons, [
        'User destroyed their smuggling ledger',
        'User publicly exposed their smuggling route maps',
      ]);
      assert.equal(actor.responseHistory[0], 'paid street toughs to watch the docks');
      assert.equal(report.finalNarrativeHandoff.powerActorPressure.entries[0].Actor, 'red glass syndicate');
      assert.equal(report.finalNarrativeHandoff.powerActorPressure.entries[0].Tier, 'Strategic Campaign');

      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const displaySource = source.slice(
        source.indexOf('function buildTrackerDisplayHtml'),
        source.indexOf('function cleanTrackerDisplayName'),
      );
      assert.doesNotMatch(displaySource, /powerActors/);
      assert.doesNotMatch(displaySource, /Power actor/i);
      assert.doesNotMatch(displaySource, /enmity/i);
    },
  },
  {
    name: '33c.1 visible tracker uses compact grouped display and hides inactive NPC section',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const displaySource = source.slice(
        source.indexOf('function buildTrackerDisplayHtml'),
        source.indexOf('function cleanTrackerDisplayName'),
      );
      const styleSource = source.slice(
        source.indexOf('function ensureTrackerDisplayStyles'),
        source.indexOf('function getMessageElement'),
      );

      assert.match(source, /function trackerDetailLine/);
      assert.match(source, /function trackerDetailTone/);
      assert.match(source, /function trackerChipLabelTone/);
      assert.match(source, /function trackerChip/);
      assert.match(source, /function trackerStatPills/);
      assert.match(source, /function trackerStatCluster/);
      assert.match(source, /function trackerConditionTone/);
      assert.match(source, /function trackerDispositionTone/);
      assert.match(displaySource, /structured-preflight-tracker-card/);
      assert.match(displaySource, /structured-preflight-tracker-player-card/);
      assert.match(displaySource, /structured-preflight-tracker-name-player/);
      assert.match(displaySource, /structured-preflight-tracker-name-npc/);
      assert.match(displaySource, /structured-preflight-tracker-role/);
      assert.match(displaySource, /structured-preflight-tracker-chip-row/);
      assert.match(displaySource, /structured-preflight-tracker-npc-metrics/);
      assert.match(displaySource, /structured-preflight-tracker-npc-mechanic-row/);
      assert.match(displaySource, /structured-preflight-tracker-detail-grid/);
      assert.match(displaySource, /trackerChip\('Toward User'/);
      assert.match(displaySource, /trackerChip\('Condition'/);
      assert.match(displaySource, /trackerChip\('B\/F\/H'/);
      assert.match(displaySource, /trackerChip\('Lock'/);
      assert.match(displaySource, /trackerChip\('Behavior'/);
      assert.match(displaySource, /trackerChip\('Rapport'/);
      assert.match(displaySource, /trackerChip\('Relationship'/);
      assert.match(displaySource, /trackerStatCluster\(entry\.currentCoreStats\)/);
      assert.match(displaySource, /trackerStatCluster\(userCore\)/);
      assert.match(displaySource, /trackerDetailLine\('Personality'/);
      assert.match(displaySource, /trackerDetailLine\('Wounds'/);
      assert.match(displaySource, /trackerDetailLine\('Status'/);
      assert.match(displaySource, /trackerDetailLine\('Gear'/);
      assert.match(displaySource, /trackerDetailLine\('Inventory'/);
      assert.match(displaySource, /trackerDetailLine\('Tasks'/);
      assert.match(displaySource, /trackerDetailLine\('Commitments'/);
      assert.doesNotMatch(displaySource, /Inactive NPCs/);
      assert.doesNotMatch(displaySource, /const inactive/);
      assert.match(styleSource, /structured-preflight-tracker-chip-good/);
      assert.match(styleSource, /structured-preflight-tracker-chip-warn/);
      assert.match(styleSource, /structured-preflight-tracker-chip-danger/);
      assert.match(styleSource, /structured-preflight-tracker-chip-label-toward-user/);
      assert.match(styleSource, /structured-preflight-tracker-chip-label-condition/);
      assert.match(styleSource, /structured-preflight-tracker-chip-label-b-f-h/);
      assert.match(styleSource, /structured-preflight-tracker-chip-label-lock/);
      assert.match(styleSource, /structured-preflight-tracker-chip-label-behavior/);
      assert.match(styleSource, /structured-preflight-tracker-chip-label-rapport/);
      assert.match(styleSource, /structured-preflight-tracker-chip-label-relationship/);
      assert.match(styleSource, /width: min\(540px, calc\(100vw - 36px\)\)/);
      assert.match(styleSource, /structured-preflight-tracker-npc-metrics/);
      assert.match(styleSource, /structured-preflight-tracker-npc-mechanic-row/);
      assert.match(styleSource, /structured-preflight-tracker-stat-cluster/);
      assert.match(styleSource, /structured-preflight-tracker-stat-cluster-label/);
      assert.match(styleSource, /structured-preflight-tracker-stat-pill-row/);
      assert.match(styleSource, /structured-preflight-tracker-stat-pill/);
      assert.match(styleSource, /structured-preflight-tracker-stat-label/);
      assert.match(styleSource, /structured-preflight-tracker-stat-pill code \{[\s\S]*font-weight: 900/);
      assert.match(styleSource, /structured-preflight-tracker-stat-phy/);
      assert.match(styleSource, /structured-preflight-tracker-stat-mnd/);
      assert.match(styleSource, /structured-preflight-tracker-stat-cha/);
      assert.match(styleSource, /structured-preflight-tracker-detail-label-wounds/);
      assert.match(styleSource, /structured-preflight-tracker-detail-label-status/);
      assert.match(styleSource, /structured-preflight-tracker-detail-label-gear/);
      assert.match(styleSource, /structured-preflight-tracker-detail-label-inventory/);
      assert.match(styleSource, /structured-preflight-tracker-detail-label-tasks/);
      assert.match(styleSource, /structured-preflight-tracker-detail-label-commitments/);
      assert.match(styleSource, /structured-preflight-tracker-name-player/);
      assert.match(styleSource, /structured-preflight-tracker-name-npc/);
      assert.match(styleSource, /grid-template-columns: repeat\(auto-fit/);
      assert.match(styleSource, /@media \(max-width: 520px\)/);
    },
  },
  {
    name: '33d semantic contract includes hidden power actor enmity and no spy lifecycle',
    run() {
      const semanticSource = fs.readFileSync(new URL('semantic-extractor.js', import.meta.url), 'utf8');
      const deterministicSource = fs.readFileSync(new URL('deterministic-runner.js', import.meta.url), 'utf8');
      const preflightSource = fs.readFileSync(new URL('pre-flight.js', import.meta.url), 'utf8');
      const indexSource = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');

      assert.match(semanticSource, /PowerActorEnmity\.count=0/);
      assert.match(semanticSource, /PowerActorAssessment\.count=0/);
      assert.match(semanticSource, /ResolutionEngine\.identifyTargets\.PowerActors=\(none\)/);
      assert.match(semanticSource, /ResolutionEngine\.identifyTargets\.PowerActors is strategic-only/);
      assert.match(semanticSource, /Identify ResolutionEngine\.identifyTargets\.PowerActors during target discovery/);
      assert.match(semanticSource, /PowerActorEnmity\.assessments is audit-only diagnosis/);
      assert.match(semanticSource, /Assess semantically, not by keywords or titles/);
      assert.match(semanticSource, /credible means to affect \{\{user\}\} beyond acting alone in the moment/);
      assert.match(semanticSource, /the active character\/card actor when relevant/);
      assert.match(semanticSource, /Do this even when PowerActorEnmity\.effects count is 0/);
      assert.match(semanticSource, /A prominent local figure should be assessed as a potential power actor/);
      assert.match(semanticSource, /PowerActors and PowerActorEnmity never replace RelationshipEngine/);
      assert.match(semanticSource, /PowerActors and PowerActorEnmity never replace RelationshipEngine/);
      assert.match(semanticSource, /powerActorEnmity/);
      assert.match(semanticSource, /Ordinary people with only personal reaction are not power actors/);
      assert.match(semanticSource, /Do not create power-actor enmity for ordinary individuals who can only personally react/);
      assert.match(semanticSource, /This semantic section is hidden memory only, not visible tracker text/);
      assert.match(semanticSource, /PowerEventShape\.count=0/);
      assert.match(semanticSource, /Power actor snapshot JSON/);
      assert.match(semanticSource, /visibleInstruction must be narrator-safe surface instruction only/);
      assert.match(deterministicSource, /STEP 3P: EXECUTE PowerActorEnmity USING SEMANTIC_LEDGER/);
      assert.match(deterministicSource, /powerActorTier\(enmity\)/);
      assert.match(deterministicSource, /runPowerActorProactivity/);
      assert.match(deterministicSource, /isSafePowerEventVisibleInstruction/);
      assert.match(preflightSource, /World pressure event: /);
      assert.match(preflightSource, /Render only the visible surface event/);
      assert.match(indexSource, /beforePowerActors/);
      assert.match(indexSource, /afterPowerActors/);
      assert.match(indexSource, /root\.powerActors/);

      const combined = [semanticSource, deterministicSource, preflightSource, indexSource].join('\n');
      assert.doesNotMatch(combined, /spyStatus|fakeFriend|betrayalLifecycle|suspicionScore|evidenceScore/);
    },
  },
  {
    name: '33d.1 power actor proactivity schedules hidden pending event without narrator leakage',
    run() {
      const report = runCase({
        userText: 'I keep moving through the market.',
        dice: [10, 10, 1, 1, 1, 1, 1, 1, 1, 1, 1, 20, 19],
        ledger: baseLedger(),
        powerActors: {
          'Red Glass Syndicate': {
            name: 'Red Glass Syndicate',
            type: 'criminal syndicate',
            enmity: 5,
            reasons: ['User burned their ledger'],
            responseHistory: [],
          },
        },
      });
      const actor = report.trackerUpdate.powerActors['Red Glass Syndicate'];
      assert.equal(actor.enmity, 5);
      assert.equal(actor.pendingEvent.eventType, 'plant_contact');
      assert.equal(actor.pendingEvent.status, 'pending');
      assert.equal(actor.pendingEvent.contactName, report.finalNarrativeHandoff.nameGeneration.namePool.male[0]);
      assert.equal(report.finalNarrativeHandoff.powerActorPressure.event, null);
      assert.equal(auditIncludes(report, 'powerActorPendingEventCreated='), true);
      assert.doesNotMatch(prompt(report), /World pressure event:/);
      assert.doesNotMatch(prompt(report), /spy|agent|infiltrat|hidden allegiance|sponsor|betray/i);
    },
  },
  {
    name: '33d.2 semantic-shaped power event reaches narrator as surface fact only and records hidden contact',
    run() {
      const report = runCase({
        userText: 'I ask around the market for work.',
        powerActors: {
          'Red Glass Syndicate': {
            name: 'Red Glass Syndicate',
            type: 'criminal syndicate',
            enmity: 5,
            reasons: ['User burned their ledger'],
            pendingEvent: {
              id: 'red-glass-100-plant_contact-95',
              eventType: 'plant_contact',
              severityBand: 'strategic',
              createdAtActiveMs: 100,
              actor: 'Red Glass Syndicate',
              actorType: 'criminal syndicate',
              reason: 'User burned their ledger',
              premise: 'A plausible new contact enters through ordinary market work.',
              contactName: 'Torven',
              contactGender: 'male',
              status: 'pending',
              attempts: 0,
            },
          },
        },
        ledger: baseLedger({
          powerEventShape: {
            events: [{
              eventId: 'red-glass-100-plant_contact-95',
              actor: 'Red Glass Syndicate',
              eventType: 'plant_contact',
              fit: 'use_now',
              visibleInstruction: 'Introduce Torven as a caravan clerk offering paid unloading work at the west gate.',
              contactName: 'Torven',
              contactGender: 'male',
              surfaceRole: 'caravan clerk',
              deferReason: '(none)',
            }],
          },
        }),
      });
      const actor = report.trackerUpdate.powerActors['Red Glass Syndicate'];
      assert.equal(actor.pendingEvent.id, '');
      assert.equal(actor.activeAgent.name, 'Torven');
      assert.equal(actor.activeAgent.coverRole, 'caravan clerk');
      assert.equal(report.finalNarrativeHandoff.powerActorPressure.event.VisibleInstruction, 'Introduce Torven as a caravan clerk offering paid unloading work at the west gate.');
      const modelPrompt = prompt(report);
      const eventLines = modelPrompt.split('\n').filter(line => /World pressure event|visible world-pressure event/i.test(line)).join('\n');
      assert.match(eventLines, /World pressure event: Introduce Torven as a caravan clerk offering paid unloading work at the west gate/);
      assert.doesNotMatch(eventLines, /Red Glass Syndicate|criminal syndicate|plant_contact/i);
      assert.doesNotMatch(eventLines, /(?:\bspy\b|\bagent\b|infiltrat|sponsor|betray)/i);
      assert.match(auditPrompt(report), /- powerActor\.event: plant_contact\/contact:Torven\/role:caravan clerk\/visible:Introduce Torven/);
    },
  },
  {
    name: '33d.3 unsafe covert event wording is held back from narrator',
    run() {
      const report = runCase({
        userText: 'I ask around the market for work.',
        powerActors: {
          'Red Glass Syndicate': {
            name: 'Red Glass Syndicate',
            type: 'criminal syndicate',
            enmity: 5,
            pendingEvent: {
              id: 'red-glass-100-plant_contact-95',
              eventType: 'plant_contact',
              severityBand: 'strategic',
              createdAtActiveMs: 100,
              actor: 'Red Glass Syndicate',
              actorType: 'criminal syndicate',
              premise: 'A plausible new contact enters.',
              contactName: 'Torven',
              contactGender: 'male',
              status: 'pending',
              attempts: 0,
            },
          },
        },
        ledger: baseLedger({
          powerEventShape: {
            events: [{
              eventId: 'red-glass-100-plant_contact-95',
              actor: 'Red Glass Syndicate',
              eventType: 'plant_contact',
              fit: 'use_now',
              visibleInstruction: 'Torven is a spy planted by the Red Glass Syndicate.',
              contactName: 'Torven',
              contactGender: 'male',
              surfaceRole: 'caravan clerk',
              deferReason: '(none)',
            }],
          },
        }),
      });
      const actor = report.trackerUpdate.powerActors['Red Glass Syndicate'];
      assert.equal(actor.pendingEvent.id, 'red-glass-100-plant_contact-95');
      assert.equal(actor.pendingEvent.attempts, 1);
      assert.equal(report.finalNarrativeHandoff.powerActorPressure.event, null);
      assert.doesNotMatch(prompt(report), /World pressure event:|spy|agent|Red Glass Syndicate/);
      assert.equal(auditIncludes(report, 'unsafe_instruction_deferred'), true);
    },
  },
  {
    name: '33e semantic coverage repair prevents missing relationship aborts',
    run() {
      const semanticSource = fs.readFileSync(new URL('semantic-extractor.js', import.meta.url), 'utf8');
      const deterministicSource = fs.readFileSync(new URL('deterministic-runner.js', import.meta.url), 'utf8');

      assert.match(semanticSource, /function repairRelationshipCoverage/);
      assert.match(semanticSource, /function createFallbackRelationshipEntry/);
      assert.match(semanticSource, /missing RelationshipEngine entry for target\/observer living NPC/);
      assert.match(semanticSource, /repairRelationshipCoverage\(resolutionEngine, relationshipEngine, 'compact_ledger_parse'\)/);
      assert.match(semanticSource, /repairRelationshipCoverage\(ledger\.resolutionEngine, ledger\.relationshipEngine, 'normalized_ledger'\)/);
      assert.match(semanticSource, /semanticLedgerRepair: mergeSemanticLedgerRepair/);
      assert.match(deterministicSource, /SEMANTIC_LEDGER_REPAIR/);
    },
  },
  {
    name: '34 streaming artifact display regex hides fenced tracker block only',
    run() {
      const script = buildStreamingArtifactRegexScript();
      assert.deepEqual(script.placement, [2]);
      assert.equal(script.markdownOnly, true);
      assert.equal(script.promptOnly, true);
      const streamed = [
        '```story_engine_tracker_delta',
        'BEGIN_TRACKER_DELTA',
        'TrackerUpdateEngine.user.condition=unchanged',
        'END_TRACKER_DELTA',
        '```',
        'BEGIN_FINAL_NARRATION',
        'Val steps back, hand tight on the rail.',
        'END_FINAL_NARRATION',
      ].join('\n');
      assert.equal(applyStreamingArtifactDisplayRegex(streamed).trim(), 'Val steps back, hand tight on the rail.');
      assert.equal(applyStreamingArtifactDisplayRegex('```story_engine_tracker_delta\nBEGIN_TRACKER_DELTA\nTrackerUpdateEngine.user.condition=unchanged').trim(), '');
      assert.equal(applyStreamingArtifactDisplayRegex('Val steps back.\nBEGIN_TRACKER_DELTA\nTrackerUpdateEngine.user.condition=unchanged').trim(), 'Val steps back.');
      assert.equal(applyStreamingArtifactDisplayRegex('Val says, "This is not a tracker delta."'), 'Val says, "This is not a tracker delta."');
    },
  },
  {
    name: '34a sanitizer strips narrator directive and scratchpad leakage',
    run() {
      const directiveLeak = [
        'STORY_ENGINE_NARRATOR_DIRECTIVE',
        'You are the final scene narrator.',
        'Use the NARRATOR_HANDOFF below as final authority for mechanics, outcomes, constraints, and narration instructions. Use recent visible chat only for continuity of already-established visible scene state. This handoff is mandatory, non-negotiable, and private.',
        'NARRATOR_AUTHORITY:',
        'These rules are mandatory.',
        '',
        'BEGIN_FINAL_NARRATION',
        'Naomi steps into the entryway and turns once, skirt flaring around her knees.',
        'END_FINAL_NARRATION',
      ].join('\n');
      assert.equal(
        sanitizeAssistantNarration(directiveLeak),
        'Naomi steps into the entryway and turns once, skirt flaring around her knees.',
      );

      const scratchpadLeak = [
        'PRE-FLIGHT CHECK:',
        '',
        '1. olfactoryGate: No explicit sniff/smell/taste from user. -> SMELL/TASTE BANNED.',
        '2. abilityIntegration: No abilities activated.',
        '3. epistemicRender: Direct observation available.',
        'NO IntimacyBoundary permission active - Naomi is friendly but no sexual escalation permitted.',
        'Name: Naomi already revealed through self-introduction in prior beat. Use Naomi.',
        'Tense check: STRICT PRESENT TENSE.',
        'Perspective check: STRICT SECOND PERSON for Aelemar.',
        'Draft narration:',
        '- Naomi reaction to compliment',
        '- Her response to spin request',
        '</think>Naomi looks down at her skirt, pinches the hem between thumb and forefinger, and steps back from the doorway.',
        '"A ballerina? Like this?"',
      ].join('\n');
      assert.equal(
        stripComputedDebugPrefix(scratchpadLeak),
        'Naomi looks down at her skirt, pinches the hem between thumb and forefinger, and steps back from the doorway.\n"A ballerina? Like this?"',
      );

      const renderControlLeak = [
        '1. **olfactoryGate:** No explicit sniffing/tasting. No overpowering close-range source. -> LOCKED. No smell/taste.',
        '',
        '2. **abilityIntegration:** No active abilities or supernatural traits are being used.',
        '',
        '3. **epistemicRender:** Direct visual scene only.',
        '',
        '4. **behavioralRender:** No body-tell shorthand.',
        '',
        '5. **literalStyleFilter:** Keep narration literal.',
        '',
        '6. **sceneBeatComposition:** Advance the visible scene.',
        '',
        '7. **chronologyControl:** Begin after the user input.',
        '',
        '8. **userAgencyControl:** Do not write user action.',
        '',
        '9. **turnStructureControl:** Keep the NPC beat compact.',
        '',
        '10. **responseEndpointControl:** Stop when the NPC response reaches the user.',
        '',
        'CONCLUSION: Valid to proceed with narration of Naomi entering and responding to the spin request.',
        'Naomi steps into the entryway and turns once, skirt flaring around her knees.',
      ].join('\n');
      assert.equal(
        sanitizeAssistantNarration(renderControlLeak),
        'Naomi steps into the entryway and turns once, skirt flaring around her knees.',
      );

      const taggedWithLeak = [
        '1. **olfactoryGate:** No smell/taste.',
        'CONCLUSION: Valid to proceed.',
        'BEGIN_FINAL_NARRATION',
        'Naomi steps into the entryway and turns once, skirt flaring around her knees.',
        'END_FINAL_NARRATION',
        'post-generation note',
      ].join('\n');
      assert.equal(
        sanitizeAssistantNarration(taggedWithLeak),
        'Naomi steps into the entryway and turns once, skirt flaring around her knees.',
      );

      const partialTagLeak = [
        'BEGIN_FINAL_NARRATION',
        'Naomi steps into the entryway and turns once, skirt flaring around her knees.',
      ].join('\n');
      assert.equal(
        sanitizeAssistantNarration(partialTagLeak),
        'Naomi steps into the entryway and turns once, skirt flaring around her knees.',
      );
    },
  },
  {
    name: '34b proxy mode uses square brackets and keeps normal engine handoff',
    run() {
      const indexSource = fs.readFileSync(extensionFile('index.js'), 'utf8');
      const runnerSource = fs.readFileSync(extensionFile('deterministic-runner.js'), 'utf8');
      const semanticSource = fs.readFileSync(extensionFile('semantic-extractor.js'), 'utf8');
      assert.match(indexSource, /startsWith\('\[\['\) && trimmed\.endsWith\('\]\]'\)/);
      assert.match(indexSource, /return \{ mode: 'proxy', innerText: trimmed\.slice\(2, -2\)\.trim\(\) \}/);
      assert.match(indexSource, /startsWith\('\(\('\) && trimmed\.endsWith\('\)\)'\)/);
      assert.doesNotMatch(indexSource, /mode: 'proxy'[\s\S]{0,120}startsWith\('\(\(\('\)/);
      assert.match(indexSource, /userInputMode\.mode === 'ooc'[\s\S]*runSemanticPassWithPromptReadyBypass/);
      assert.match(runnerSource, /startsWith\('\[\['\) && trimmed\.endsWith\('\]\]'\)/);
      assert.match(semanticSource, /double square brackets for proxy action mode/);

      const report = runCase({
        userText: '[[I walk to Mira and offer her the sealed letter.]]',
        tracker: {
          Mira: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 2 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Deliver_Letter',
            identifyChallenge: 'offer Mira the sealed letter',
            explicitMeans: 'walk to Mira and offer her the sealed letter',
            identifyTargets: { ActionTargets: ['Mira'], OppTargets: { NPC: [], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Mira')],
        }),
      });
      const text = formatNarratorModelPromptContext(report, {
        mode: 'proxy',
        latestUserText: 'I walk to Mira and offer her the sealed letter.',
      });
      assert.match(text, /PROXY USER ACTION MODE/);
      assert.match(text, /double square brackets/);
      assert.match(text, /NARRATOR_HANDOFF|RESOLVED_SCENE_FACTS/);
      assert.match(text, /sealed letter/);
    },
  },
  {
    name: '34c user ability use is semantic-only and carried into narrator handoff',
    run() {
      const semanticSource = fs.readFileSync(extensionFile('semantic-extractor.js'), 'utf8');
      const runnerSource = fs.readFileSync(extensionFile('deterministic-runner.js'), 'utf8');
      const preflightSource = fs.readFileSync(extensionFile('pre-flight.js'), 'utf8');

      assert.match(semanticSource, /ResolutionEngine\.userAbilityUse\.Used=N/);
      assert.match(semanticSource, /ResolutionEngine\.userAbilityUse\.Attempted=N/);
      assert.match(semanticSource, /ResolutionEngine\.userAbilityUse\.Available=N/);
      assert.match(semanticSource, /ResolutionEngine\.userAbilityUse\.NoEffectReason=\(none\)/);
      assert.match(semanticSource, /compare the latest user input against active \{\{user\}\}\/persona abilities/i);
      assert.match(semanticSource, /Mark Attempted=Y when the input explicitly names an ability\/spell or implicitly describes attempting one/i);
      assert.match(semanticSource, /Mark Available=Y only if/i);
      assert.match(semanticSource, /MechanicalScope must always be flavor_only_no_bonus/i);
      assert.match(semanticSource, /never a bonus, never a dice modifier, never a separate roll/i);
      assert.match(semanticSource, /userAbilityUse:\s*normalizeUserAbilityUse/);
      assert.match(runnerSource, /UserAbilityUse:\s*normalizeUserAbilityUseForHandoff\(semantic\.userAbilityUse\)/);
      assert.doesNotMatch(runnerSource, /UserAbilityUse[\s\S]{0,200}(?:atkTot|defTot|margin|RollPenalty|CounterBonus)\s*[+\-=]/);
      assert.match(preflightSource, /When ACTIVE_BRANCH_FACTS lists an available UserAbilityUse, preserve its NarrativeEffect/i);
      assert.match(preflightSource, /When it lists an unavailable ability\/spell attempt, no ability effect occurs/i);
      assert.match(preflightSource, /do not announce, name, activate, focus, channel, charge, or explain the ability/i);

      const report = runCase({
        userText: 'I whisper under my breath, meant only for Alice: "Leave him alone."',
        tracker: {
          Alice: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 2 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Private_Warning',
            identifyChallenge: 'privately warn Alice',
            explicitMeans: 'whisper under my breath meant only for Alice',
            userAbilityUse: {
              used: true,
              attempted: true,
              available: true,
              abilityName: 'Resonant Voice',
              evidence: 'meant only for Alice',
              narrativeEffect: 'Alice alone hears the whispered words',
              noEffectReason: '(none)',
              mechanicalScope: 'flavor_only_no_bonus',
            },
            identifyTargets: {
              ActionTargets: ['Alice'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Alice')],
        }),
      });

      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.deepEqual(packet.UserAbilityUse, {
        Used: 'Y',
        Attempted: 'Y',
        Available: 'Y',
        AbilityName: 'Resonant Voice',
        Evidence: 'meant only for Alice',
        NarrativeEffect: 'Alice alone hears the whispered words',
        NoEffectReason: '(none)',
        MechanicalScope: 'flavor_only_no_bonus',
      });
      assert.equal(packet.STAKES, 'N');

      const prompt = formatNarratorModelPromptContext(report);
      assert.match(prompt, /UserAbilityUse: Resonant Voice; evidence:meant only for Alice; effect:Alice alone hears the whispered words; scope:flavor_only_no_bonus/i);
      assert.match(prompt, /Preserve user ability effect as direct scene fact: Alice alone hears the whispered words/i);
      assert.match(prompt, /do not announce, name, activate, focus, channel, charge, or explain the ability/i);
      assert.match(prompt, /do not add bonuses, success, roll changes, extra landed actions, or bypassed stakes/i);

      const unavailableReport = runCase({
        userText: 'I extend my hand and picture a small ball of fire forming at my fingertip.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Attempt_Fire_Spell',
            identifyChallenge: 'attempt to create a small ball of fire',
            explicitMeans: 'picture a small ball of fire forming at fingertip',
            userAbilityUse: {
              used: false,
              attempted: true,
              available: false,
              abilityName: 'fire spell',
              evidence: 'small ball of fire forming at my fingertip',
              narrativeEffect: 'a small ball of fire forms at the fingertip',
              noEffectReason: 'not in known user abilities',
              mechanicalScope: 'flavor_only_no_bonus',
            },
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
        }),
      });

      const unavailablePacket = unavailableReport.finalNarrativeHandoff.resolutionPacket;
      assert.deepEqual(unavailablePacket.UserAbilityUse, {
        Used: 'N',
        Attempted: 'Y',
        Available: 'N',
        AbilityName: 'fire spell',
        Evidence: 'small ball of fire forming at my fingertip',
        NarrativeEffect: 'a small ball of fire forms at the fingertip',
        NoEffectReason: 'not in known user abilities',
        MechanicalScope: 'flavor_only_no_bonus',
      });
      const unavailablePrompt = formatNarratorModelPromptContext(unavailableReport);
      assert.match(unavailablePrompt, /unavailable ability\/spell attempt: fire spell/i);
      assert.match(unavailablePrompt, /No ability effect occurs/i);
      assert.match(unavailablePrompt, /Do not create the attempted effect: a small ball of fire forms at the fingertip/i);
      assert.match(unavailablePrompt, /Render only the lack of effect and visible reactions/i);
      assert.doesNotMatch(unavailablePrompt, /Preserve user ability effect as direct scene fact: a small ball of fire forms at the fingertip/i);
      assert.doesNotMatch(unavailablePrompt, /\(none\)'s response|Use the listed NPC state naturally: none/i);
    },
  },
  {
    name: '34c2 item use availability is semantic-only and carried into narrator handoff',
    run() {
      const semanticSource = fs.readFileSync(extensionFile('semantic-extractor.js'), 'utf8');
      const runnerSource = fs.readFileSync(extensionFile('deterministic-runner.js'), 'utf8');
      const preflightSource = fs.readFileSync(extensionFile('pre-flight.js'), 'utf8');

      assert.match(semanticSource, /ITEM_USE_SOURCES/);
      assert.match(semanticSource, /ResolutionEngine\.itemUse\.Attempted=N/);
      assert.match(semanticSource, /ResolutionEngine\.itemUse\.Available=N/);
      assert.match(semanticSource, /ResolutionEngine\.itemUse\.NoEffectReason=\(none\)/);
      assert.match(semanticSource, /setting_affordance/);
      assert.match(semanticSource, /consequence_affordance/);
      assert.match(semanticSource, /The latest user input cannot create the item as evidence of availability/i);
      assert.match(runnerSource, /ItemUse:\s*normalizeItemUseForHandoff\(semantic\.itemUse\)/);
      assert.doesNotMatch(runnerSource, /ItemUse[\s\S]{0,240}(?:atkTot|defTot|margin|RollPenalty|CounterBonus)\s*[+\-=]/);
      assert.match(preflightSource, /When ACTIVE_BRANCH_FACTS lists ItemUse, obey that availability exactly/i);
      assert.match(preflightSource, /Unavailable item branch:/);
      assert.match(preflightSource, /Contested item branch:/);

      const unavailableReport = runCase({
        userText: 'I smile at Alice, then draw my sword.',
        tracker: {
          Alice: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 2 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Draw_Weapon',
            identifyChallenge: 'draw a sword while facing Alice',
            explicitMeans: 'draw my sword',
            itemUse: {
              attempted: true,
              available: false,
              item: 'sword',
              source: 'unavailable',
              evidence: 'draw my sword',
              noEffectReason: 'not in user gear/inventory and not established in scene',
            },
            identifyTargets: {
              ActionTargets: ['Alice'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [relationship('Alice')],
        }),
      });

      const unavailablePacket = unavailableReport.finalNarrativeHandoff.resolutionPacket;
      assert.deepEqual(unavailablePacket.ItemUse, {
        Attempted: 'Y',
        Available: 'N',
        Item: 'sword',
        Source: 'unavailable',
        Evidence: 'draw my sword',
        NoEffectReason: 'not in user gear/inventory and not established in scene',
      });
      assert.equal(unavailablePacket.STAKES, 'N');
      const unavailablePrompt = prompt(unavailableReport);
      assert.match(unavailablePrompt, /ItemUse: unavailable\/contested item attempt: sword; source:unavailable; evidence:draw my sword; noEffectReason:not in user gear\/inventory and not established in scene/i);
      assert.match(unavailablePrompt, /Unavailable item branch: sword is not available/i);
      assert.match(unavailablePrompt, /Do not narrate the item appearing, being drawn, wielded, used/i);
      assert.doesNotMatch(unavailablePrompt, /Item availability branch: sword is available from gear/i);

      const gearReport = runCase({
        userText: 'I draw the sword from my belt.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Draw_Weapon',
            identifyChallenge: 'draw the sword from my belt',
            explicitMeans: 'draw the sword from my belt',
            itemUse: {
              attempted: true,
              available: true,
              item: 'sword',
              source: 'gear',
              evidence: 'sword in user gear',
              noEffectReason: '(none)',
            },
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
        }),
      });
      assert.equal(gearReport.finalNarrativeHandoff.resolutionPacket.ItemUse.Available, 'Y');
      assert.equal(gearReport.finalNarrativeHandoff.resolutionPacket.ItemUse.Source, 'gear');
      assert.match(prompt(gearReport), /ItemUse: sword; source:gear; evidence:sword in user gear/i);
      assert.match(prompt(gearReport), /Preserve access as scene fact only; do not add bonuses, automatic success, extra landed actions, or bypassed stakes/i);

      const tavernReport = runCase({
        userText: 'I grab a bottle from the tavern table.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Grab_Object',
            identifyChallenge: 'grab a bottle from the tavern table',
            explicitMeans: 'grab a bottle from the tavern table',
            itemUse: {
              attempted: true,
              available: true,
              item: 'bottle',
              source: 'setting_affordance',
              evidence: 'tavern table commonly has bottles within reach',
              noEffectReason: '(none)',
            },
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
        }),
      });
      assert.equal(tavernReport.finalNarrativeHandoff.resolutionPacket.ItemUse.Source, 'setting_affordance');
      assert.match(prompt(tavernReport), /Item availability branch: bottle is available from setting_affordance/i);

      const fallenSwordReport = runCase({
        userText: 'I grab the fallen bandit\'s sword.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Grab_Object',
            identifyChallenge: 'grab the fallen bandit\'s sword',
            explicitMeans: 'grab the fallen bandit\'s sword',
            itemUse: {
              attempted: true,
              available: true,
              item: 'fallen bandit sword',
              source: 'consequence_affordance',
              evidence: 'a fallen bandit with ordinary weapon was established by resolved scene facts',
              noEffectReason: '(none)',
            },
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
        }),
      });
      assert.equal(fallenSwordReport.finalNarrativeHandoff.resolutionPacket.ItemUse.Source, 'consequence_affordance');
      assert.match(prompt(fallenSwordReport), /Item availability branch: fallen bandit sword is available from consequence_affordance/i);

      const contestedReport = runCase({
        userText: 'I grab the bandit\'s sword from his hand.',
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Grab_Held_Object',
            identifyChallenge: 'grab the bandit\'s sword from his hand',
            explicitMeans: 'grab the bandit\'s sword from his hand',
            itemUse: {
              attempted: true,
              available: false,
              item: 'bandit sword',
              source: 'contested',
              evidence: 'the sword is held by the bandit',
              noEffectReason: 'held by another character',
            },
            identifyTargets: {
              ActionTargets: ['Bandit'],
              OppTargets: { NPC: ['Bandit'], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: true,
          },
          relationshipEngine: [relationship('Bandit')],
        }),
      });
      assert.equal(contestedReport.finalNarrativeHandoff.resolutionPacket.ItemUse.Available, 'N');
      assert.equal(contestedReport.finalNarrativeHandoff.resolutionPacket.ItemUse.Source, 'contested');
      assert.match(prompt(contestedReport), /Contested item branch: bandit sword exists but is not freely available/i);
      assert.match(prompt(contestedReport), /Do not narrate free possession, drawing, wielding, use/i);
    },
  },
  {
    name: '34d stake-bearing false or unsupported factual claim forces a belief contest',
    run() {
      const semanticSource = fs.readFileSync(extensionFile('semantic-extractor.js'), 'utf8');
      const runnerSource = fs.readFileSync(extensionFile('deterministic-runner.js'), 'utf8');
      const enginesSource = fs.readFileSync(extensionFile('engines.js'), 'utf8');
      const preflightSource = fs.readFileSync(extensionFile('pre-flight.js'), 'utf8');

      assert.match(semanticSource, /ResolutionEngine\.claimCheck\.Present=N/);
      assert.match(semanticSource, /stakes-bearing claim check, not a truth engine/i);
      assert.match(semanticSource, /known_false or unsupported claim has StakesImpact=Y/i);
      assert.match(runnerSource, /ClaimCheck:\s*normalizeClaimCheckForHandoff\(semantic\.claimCheck\)/);
      assert.match(runnerSource, /hard_override_stake_bearing_claim_roll/);
      assert.match(enginesSource, /stakes-bearing known-false or unsupported factual claim is USER=CHA and OPP=MND/);
      assert.match(preflightSource, /Claim branch:/);
      assert.match(preflightSource, /NPC access is not direct; failed claim means doubt, distrust, inconsistency, proof demand, refusal, or testing, not omniscient certainty/);

      const report = runCase({
        userText: 'I tell Seraphina, "I am the queen\'s envoy. Open the sealed gate."',
        dice: [15, 6, 10, 10, 10, 10],
        tracker: {
          Seraphina: trackerEntry({
            currentDisposition: { B: 2, F: 2, H: 2 },
            genStats: { Rank: 'Average', MainStat: 'Balanced', PHY: 5, MND: 5, CHA: 5 },
          }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Gain_Access',
            identifyChallenge: 'convince Seraphina to open the sealed gate through claimed royal authority',
            explicitMeans: 'claim to be the queen\'s envoy',
            claimCheck: {
              present: true,
              claim: 'I am the queen\'s envoy',
              targetNPC: 'Seraphina',
              truthStatus: 'unsupported',
              npcAccess: 'partial',
              stakesImpact: true,
              reason: 'Claimed royal authority would affect Seraphina opening the sealed gate',
            },
            identifyTargets: {
              ActionTargets: [],
              OppTargets: { NPC: [], ENV: ['sealed gate access'] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
            mapStats: { USER: 'CHA', OPP: 'ENV' },
          },
          relationshipEngine: [relationship('Seraphina', {
            genStats: { Rank: 'Average', MainStat: 'Balanced', PHY: 5, MND: 5, CHA: 5 },
          })],
        }),
      });

      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.STAKES, 'Y');
      assert.deepEqual(packet.ClaimCheck, {
        Present: 'Y',
        Claim: 'I am the queen\'s envoy',
        TargetNPC: 'Seraphina',
        TruthStatus: 'unsupported',
        NPCAccess: 'partial',
        StakesImpact: 'Y',
        Reason: 'Claimed royal authority would affect Seraphina opening the sealed gate',
      });
      assert.ok(packet.ActionTargets.includes('Seraphina'));
      assert.ok(packet.OppTargets.NPC.includes('Seraphina'));
      assert.match(report.finalNarrativeHandoff.resultLine, /\+\s*CHA\(/);
      assert.match(report.finalNarrativeHandoff.resultLine, /vs\s+1d20\(\d+\)\s*\+\s*MND\(/);
      assert.ok(auditIncludes(report, 'hard_override_stake_bearing_claim_roll'));
      assert.ok(auditIncludes(report, 'stakes-bearing known-false or unsupported factual claim is USER=CHA and OPP=MND'));

      const text = prompt(report);
      assert.match(text, /ClaimCheck: claim:"I am the queen's envoy"; target:Seraphina; truth:unsupported; access:partial; stakes:Y/i);
      assert.match(text, /Claim branch:/);
      assert.match(text, /belief contest/i);
      assert.match(text, /NPC access is not direct/i);
      assert.match(text, /not omniscient certainty/i);
    },
  },
  {
    name: '34e no-stakes factual claim does not force a roll or narrator claim branch',
    run() {
      const report = runCase({
        userText: 'I tell Seraphina, "The rain followed me all morning."',
        tracker: {
          Seraphina: trackerEntry({ currentDisposition: { B: 2, F: 2, H: 2 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'Small_Talk',
            identifyChallenge: 'ordinary conversation about weather',
            explicitMeans: 'mention the rain',
            claimCheck: {
              present: true,
              claim: 'The rain followed me all morning',
              targetNPC: 'Seraphina',
              truthStatus: 'unsupported',
              npcAccess: 'unknown',
              stakesImpact: false,
              reason: 'Harmless small talk with no material NPC stakes',
            },
            identifyTargets: {
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
            mapStats: { USER: 'CHA', OPP: 'CHA' },
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });

      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.equal(packet.STAKES, 'N');
      assert.equal(packet.ClaimCheck.Present, 'Y');
      assert.equal(packet.ClaimCheck.StakesImpact, 'N');
      assert.equal(packet.ClaimCheck.TruthStatus, 'unsupported');
      assert.equal(auditIncludes(report, 'hard_override_stake_bearing_claim_roll'), false);

      const text = prompt(report);
      assert.doesNotMatch(text, /Claim branch:/);
      assert.doesNotMatch(text, /belief contest/i);
    },
  },
  {
    name: '34f semantic stakes require explicit user intent and direct NPC targeting',
    run() {
      const semanticSource = fs.readFileSync(extensionFile('semantic-extractor.js'), 'utf8');
      assert.match(semanticSource, /ResolutionEngine user intent is explicit-only/);
      assert.match(semanticSource, /identifyGoal and identifyChallenge, use only the latest user-declared action, request, target, and explicit objective/);
      assert.match(semanticSource, /do not infer an unstated goal from NPC fear, hostility, suspicion, likely reaction, context, or what an NPC might assume/);
      assert.match(semanticSource, /For NPC-targeted stakes and OppTargets\.NPC, the latest user input must directly target that NPC with a stakes-bearing action/);
      assert.match(semanticSource, /Ambiguous, preparatory, self-directed, atmospheric, or scene-state actions remain exactly that/);
      assert.match(semanticSource, /Drawing, readying, revealing, holding, sheathing, or repositioning a weapon is scene state, not intimidation or coercion by itself/);
      assert.match(semanticSource, /classify it as stakes only when the user also declares a demand, threat, attack, aim\/pointing at a target/);
      assert.match(semanticSource, /NPC fear, NPC hostility, likely NPC reaction, or an NPC merely being present should keep the NPC as ActionTarget only/);
    },
  },
  {
    name: '35 name promotion does not retire established named NPCs',
    run() {
      const text = 'Seraphina and I enter a ruined roadside shrine at dusk. A wounded merchant named Darai is pinned behind a broken pillar.';
      const promotions = getExplicitNamePromotions(text, ['Seraphina', 'Ogre', 'Raider1']);
      assert.equal(isPromotableTrackerName('Seraphina'), false);
      assert.equal(promotions.some(item => item.oldName === 'Seraphina'), false);
      assert.equal(promotions.some(item => item.newName === 'Darai'), false);
    },
  },
  {
    name: '36 name promotion still supports explicit generic placeholder naming',
    run() {
      assert.equal(isPromotableTrackerName('Raider1'), true);
      assert.equal(isPromotableTrackerName('Unknown Woman'), true);
      assert.equal(isPromotableTrackerName('Lavender-haired girl'), true);
      assert.equal(isPromotableTrackerName('silver haired student'), true);
      const promotions = getExplicitNamePromotions('The Raider1 name is Mora.', ['Raider1']);
      assert.deepEqual(promotions, [{ oldName: 'Raider1', newName: 'Mora' }]);
    },
  },
  {
    name: '36a name promotion supports assistant-side terse introductions',
    run() {
      const text = 'The bystander looked at Aelemar properly for the first time. "Torvinash." He nodded once. "You traveling far?"';
      const promotions = getExplicitNamePromotions(text, ['bystander']);
      assert.deepEqual(promotions, [{ oldName: 'bystander', newName: 'Torvinash' }]);
    },
  },
  {
    name: '36b user-side name claims do not promote tracker names',
    run() {
      const userText = "The bystander's name is Torvinash.";
      const assistantText = 'The bystander watched Aelemar without offering a name.';
      const indexSource = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const promotionFunction = indexSource.match(/function applyExplicitNamePromotions[\s\S]*?\n}\n/)?.[0] || '';
      assert.deepEqual(getExplicitNamePromotions(userText, ['bystander']), [{ oldName: 'bystander', newName: 'Torvinash' }]);
      assert.deepEqual(getExplicitNamePromotions(assistantText, ['bystander']), []);
      assert.equal(/getExplicitNamePromotions\s*\(\s*latestUserText\b/.test(promotionFunction), false);
      assert.equal(/getExplicitNamePromotions\s*\(\s*assistantText\b/.test(promotionFunction), true);
    },
  },
  {
    name: '36c post-narration tracker reconciles named duplicate with single descriptive placeholder',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      assert.match(source, /function reconcileNamedNpcDuplicates/);
      assert.match(source, /previousActivePromotable\.length !== 1/);
      assert.match(source, /isPromotableTrackerName\(name\)/);
      assert.match(source, /promoteTrackerEntry\(normalized, placeholder, candidates\[0\]\)/);
      assert.match(source, /beforeNpcs: pendingRun\.trackerBefore/);
    },
  },
  {
    name: '37 hostilesInScene is carried without relationship routing',
    run() {
      const report = runCase({
        userText: 'I keep my shield raised beside Seraphina.',
        tracker: {
          Seraphina: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }),
          Ogre: trackerEntry({ currentDisposition: { B: 1, F: 2, H: 4 } }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'ProtectSeraphina',
            identifyChallenge: 'keep a shield raised beside Seraphina',
            explicitMeans: 'shield raised beside Seraphina',
            identifyTargets: {
              hostilesInScene: { NPC: ['Ogre'] },
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            activeHostileThreat: true,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.hostilesInScene.NPC, ['Ogre']);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['(none)']);
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.NPCInScene, ['Seraphina']);
      assert.equal(report.finalNarrativeHandoff.npcHandoffs.some(item => item.NPC === 'Ogre'), false);
      assert.match(auditPrompt(report), /hostiles:Ogre; action:Seraphina/);
    },
  },
  {
    name: '38 directed companion attack request uses hostilesInScene without mutating OppTargets',
    run() {
      const report = runCase({
        userText: 'Seraphina, hit the axe raider hard.',
        dice: [
          10, 10, 10, 10, 10, 10,
          10, 10, 10, 10, 10,
          18, 100,
          18, 4,
        ],
        tracker: {
          Seraphina: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 }, currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 6, MND: 4, CHA: 4 } }),
          'axe raider': trackerEntry({ currentDisposition: { B: 1, F: 2, H: 4 }, currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 5, MND: 3, CHA: 2 }, gear: ['axe'] }),
          'knife raider': trackerEntry({ currentDisposition: { B: 1, F: 2, H: 4 }, currentCoreStats: { Rank: 'Average', MainStat: 'PHY', PHY: 4, MND: 3, CHA: 2 }, gear: ['knife'] }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'CommandCompanionAttack',
            identifyChallenge: 'command Seraphina to hit the axe raider',
            explicitMeans: 'command Seraphina to hit the axe raider',
            identifyTargets: {
              hostilesInScene: { NPC: ['axe raider', 'knife raider'] },
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            activeHostileThreat: true,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      const packet = report.finalNarrativeHandoff.resolutionPacket;
      assert.deepEqual(packet.hostilesInScene.NPC, ['axe raider', 'knife raider']);
      assert.deepEqual(packet.OppTargets.NPC, ['(none)']);
      assert.equal(packet.STAKES, 'N');
      assert.equal(packet.CompanionCommand.Mode, 'REQUEST_ONLY');
      assert.equal(report.finalNarrativeHandoff.proactivityResults.Seraphina.ProactivityTarget, 'axe raider');
      assert.equal(report.finalNarrativeHandoff.proactivityResults.Seraphina.CompanionInitiativeTag, 'Companion_Attack');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina.ProactivityTarget, 'axe raider');
      assert.equal(report.finalNarrativeHandoff.npcHandoffs.some(item => item.NPC === 'axe raider'), false);
    },
  },
  {
    name: '39 ambiguous companion attack does not guess among multiple hostiles',
    run() {
      const report = runCase({
        userText: 'Seraphina, hit them hard.',
        dice: [
          10, 10, 10, 10, 10, 10,
          100,
        ],
        tracker: {
          Seraphina: trackerEntry({ currentDisposition: { B: 3, F: 1, H: 1 } }),
          'axe raider': trackerEntry({ currentDisposition: { B: 1, F: 2, H: 4 }, gear: ['axe'] }),
          'knife raider': trackerEntry({ currentDisposition: { B: 1, F: 2, H: 4 }, gear: ['knife'] }),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'CommandCompanionAttack',
            identifyChallenge: 'command Seraphina to hit the enemies',
            explicitMeans: 'command Seraphina to hit them',
            identifyTargets: {
              hostilesInScene: { NPC: ['axe raider', 'knife raider'] },
              ActionTargets: ['Seraphina'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            activeHostileThreat: true,
            hasStakes: false,
          },
          relationshipEngine: [relationship('Seraphina')],
        }),
      });
      assert.deepEqual(report.finalNarrativeHandoff.resolutionPacket.OppTargets.NPC, ['(none)']);
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.STAKES, 'N');
      assert.equal(report.finalNarrativeHandoff.resolutionPacket.CompanionCommand.Mode, 'REQUEST_ONLY');
      assert.notEqual(report.finalNarrativeHandoff.proactivityResults.Seraphina.ProactivityTarget, 'axe raider');
      assert.notEqual(report.finalNarrativeHandoff.proactivityResults.Seraphina.ProactivityTarget, 'knife raider');
      assert.equal(report.finalNarrativeHandoff.aggressionResults.Seraphina, undefined);
    },
  },
  {
    name: '40 narrator keeps chaos guidance when proactivity also fires',
    run() {
      const report = {
        semanticLedger: {
          resolutionEngine: {
            explicitMeans: 'search the ruined shrine',
          },
        },
        finalNarrativeHandoff: {
          resultLine: '1d20(14) + MND(6) = 20 vs 1d20(8) + ENV(0) = 8 (12 - Success)',
          resolutionPacket: {
            GOAL: 'SearchShrine',
            actions: ['a1'],
            intimacyAdvanceExplicit: 'N',
            boundaryViolationExplicit: 'N',
            STAKES: 'Y',
            LandedActions: 1,
            OutcomeTier: 'Success',
            Outcome: 'success',
            CounterPotential: 'none',
            classifyHostilePhysicalIntent: 'N',
            classifyCombatActionSequence: 'N',
            activeHostileThreat: 'N',
            classifyPhysicalBoundaryPressure: 'N',
            CompanionCommand: null,
            hostilesInScene: { NPC: [] },
            ActionTargets: ['Seraphina'],
            OppTargets: { NPC: [], ENV: ['ruined shrine'] },
            BenefitedObservers: [],
            HarmedObservers: [],
            NPCInScene: ['Seraphina'],
            UserImpairment: { Relevant: 'N' },
            NPCImpairment: { Relevant: 'N' },
            InflictedInjuries: [],
          },
          npcHandoffs: [{
            NPC: 'Seraphina',
            FinalState: 'B3/F1/H1',
            Behavior: 'FRIENDLY',
            Target: 'Bond',
            NPC_STAKES: 'N',
            Landed: 'Y',
            BoundaryPressure: 'N',
          }],
          chaosHandoff: {
            CHAOS: {
              triggered: true,
              band: 'BENEFICIAL',
              magnitude: 'MODERATE',
              anchor: 'CLUE',
              vector: 'ENVIRONMENT',
            },
          },
          proactivityResults: {
            Seraphina: {
              Proactive: 'Y',
              Intent: 'PLAN_OR_BANTER',
              Impulse: 'BOND',
              ProactivityTarget: '{{user}}',
              TargetsUser: 'Y',
            },
          },
          aggressionResults: {},
          nameGeneration: {},
          sceneTrackerUpdate: {},
        },
      };
      const text = prompt(report);
      assert.match(text, /include this NPC initiative/i);
      assert.match(text, /brief unexpected scene beat/i);
      assert.match(text, /creates a useful opening, information, or advantage/i);
    },
  },
  {
    name: '40a narrator default branch includes no-permission intimacy guard',
    run() {
      const report = {
        semanticLedger: {
          resolutionEngine: {
            explicitMeans: 'talk with Naomi',
          },
        },
        finalNarrativeHandoff: {
          resultLine: '',
          resolutionPacket: {
            GOAL: 'Normal_Interaction',
            actions: ['a1'],
            intimacyAdvanceExplicit: 'N',
            boundaryViolationExplicit: 'N',
            STAKES: 'N',
            LandedActions: '(none)',
            OutcomeTier: 'No_Roll',
            Outcome: 'no_roll',
            CounterPotential: 'none',
            classifyHostilePhysicalIntent: 'N',
            activeHostileThreat: 'N',
            classifyPhysicalBoundaryPressure: 'N',
            CompanionCommand: null,
            hostilesInScene: { NPC: [] },
            ActionTargets: ['Naomi'],
            OppTargets: { NPC: [], ENV: [] },
            BenefitedObservers: [],
            HarmedObservers: [],
            NPCInScene: ['Naomi'],
            UserImpairment: { Relevant: 'N' },
            NPCImpairment: { Relevant: 'N' },
            InflictedInjuries: [],
          },
          npcHandoffs: [{
            NPC: 'Naomi',
            FinalState: 'B3/F1/H1',
            Behavior: 'FRIENDLY',
            Target: 'No Change',
            NPC_STAKES: 'N',
            Landed: 'N',
            IntimacyBoundary: 'SKIP',
            IntimacyBoundarySource: 'NONE',
            IntimacyRefusalStyle: 'NONE',
            BoundaryPressure: 'N',
          }],
          chaosHandoff: { CHAOS: { triggered: false } },
          proactivityResults: {},
          aggressionResults: {},
          nameGeneration: {},
          sceneTrackerUpdate: {},
        },
      };
      assert.match(prompt(report), /Universal intimacy guard: no intimacy permission is active for Naomi/);
      assert.match(prompt(report), /Unless IntimacyBoundary explicitly permits it for that exact NPC/);
    },
  },
  {
    name: '40b narrator handoff treats current scene cast as closed-world',
    run() {
      const report = runCase({
        userText: 'I address the room and ask who wants to join me.',
        tracker: {
          Chandra: trackerEntry(),
          "T'Sha": trackerEntry(),
          Medli: trackerEntry(),
          Marianne: trackerEntry(),
          Kefka: trackerEntry(),
          Rem: trackerEntry(),
          Harmony: trackerEntry(),
          Jessie: trackerEntry(),
          'Lady Void': trackerEntry(),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'AddressRoom',
            identifyChallenge: 'address the present room',
            explicitMeans: 'ask the room who wants to join me',
            identifyTargets: {
              ActionTargets: ['Chandra', "T'Sha", 'Medli', 'Marianne', 'Kefka'],
              OppTargets: { NPC: [], ENV: [] },
              BenefitedObservers: [],
              HarmedObservers: [],
            },
            hasStakes: false,
          },
          relationshipEngine: [
            relationship('Chandra'),
            relationship("T'Sha"),
            relationship('Medli'),
            relationship('Marianne'),
            relationship('Kefka'),
          ],
        }),
      });
      const text = prompt(report);
      const castLine = text.split('\n').find(line => line.includes('Current scene cast:')) || '';
      assert.match(castLine, /Current scene cast: Chandra,T'Sha,Medli,Marianne,Kefka/);
      assert.doesNotMatch(castLine, /Rem|Harmony|Jessie|Lady Void/);
      assert.match(text, /closed-world for physical participation/);
      assert.match(text, /Only these listed NPCs may speak, react, gesture, move, or be treated as physically present this turn/);
      assert.match(text, /Known\/lore\/example\/tracker\/card characters not listed are offscreen and must not participate/);
    },
  },
  {
    name: '41 narrator keeps chaos guidance when aggression also fires',
    run() {
      const report = {
        semanticLedger: {
          resolutionEngine: {
            explicitMeans: 'duck behind the broken pillar',
          },
        },
        finalNarrativeHandoff: {
          resultLine: '1d20(4) + PHY(6) = 10 vs 1d20(16) + PHY(5) = 21 (-11 - Critical_Failure)',
          resolutionPacket: {
            GOAL: 'TakeCover',
            actions: ['a1'],
            intimacyAdvanceExplicit: 'N',
            boundaryViolationExplicit: 'N',
            STAKES: 'Y',
            LandedActions: 0,
            OutcomeTier: 'Critical_Failure',
            Outcome: 'avoided',
            CounterPotential: 'severe',
            classifyHostilePhysicalIntent: 'N',
            classifyCombatActionSequence: 'Y',
            activeHostileThreat: 'Y',
            classifyPhysicalBoundaryPressure: 'N',
            CompanionCommand: null,
            hostilesInScene: { NPC: ['Ogre'] },
            ActionTargets: [],
            OppTargets: { NPC: ['Ogre'], ENV: [] },
            BenefitedObservers: [],
            HarmedObservers: [],
            NPCInScene: ['Ogre'],
            UserImpairment: { Relevant: 'N' },
            NPCImpairment: { Relevant: 'N' },
            InflictedInjuries: [],
          },
          npcHandoffs: [{
            NPC: 'Ogre',
            FinalState: 'B1/F2/H4',
            Behavior: 'HATRED',
            Target: 'Hostility',
            NPC_STAKES: 'N',
            Landed: 'N',
            BoundaryPressure: 'N',
          }],
          chaosHandoff: {
            CHAOS: {
              triggered: true,
              band: 'HOSTILE',
              magnitude: 'MAJOR',
              anchor: 'KNOWN_NPC',
              vector: 'NPC',
            },
          },
          proactivityResults: {
            Ogre: {
              Proactive: 'Y',
              Intent: 'ESCALATE_VIOLENCE',
              Impulse: 'ANGER',
              ProactivityTarget: '{{user}}',
              TargetsUser: 'Y',
            },
          },
          aggressionResults: {
            Ogre: {
              AttackType: 'CounterAttack',
              AttackIntent: 'ESCALATE_VIOLENCE',
              ProactivityTarget: '{{user}}',
              AttackStat: 'PHY',
              DefenseStat: 'PHY',
              CounterPotential: 'severe',
              CounterBonus: 6,
              ReactionOutcome: 'npc_succeeds',
              Margin: 3,
              NPCImpairment: { Relevant: 'N' },
              UserImpairment: { Relevant: 'N' },
              TargetImpairment: { Relevant: 'N' },
              InflictedUserInjury: {
                targetType: 'user',
                condition: 'wounded',
                severity: 'moderate',
                woundsAdd: [],
                statusAdd: [],
                InjuryDetailMode: 'narrator_contextual',
                InjurySeverityLimit: 'moderate',
              },
              InflictedTargetInjury: null,
            },
          },
          nameGeneration: {},
          sceneTrackerUpdate: {},
        },
      };
      const text = prompt(report);
      assert.match(text, /Ogre: counterattack exploiting the opening/i);
      assert.match(text, /brief unexpected scene beat/i);
      assert.match(text, /worsens danger or opposition/i);
    },
  },
  {
    name: '42 narrator uses target-aware NPC-vs-NPC aggression stop rule',
    run() {
      const report = {
        semanticLedger: {
          resolutionEngine: {
            explicitMeans: 'Seraphina moves between Darai and the ogre',
          },
        },
        finalNarrativeHandoff: {
          resultLine: 'No roll',
          resolutionPacket: {
            GOAL: 'ProtectDarai',
            actions: ['a1'],
            intimacyAdvanceExplicit: 'N',
            boundaryViolationExplicit: 'N',
            STAKES: 'N',
            LandedActions: '(none)',
            OutcomeTier: 'NONE',
            Outcome: 'no_roll',
            CounterPotential: 'none',
            classifyHostilePhysicalIntent: 'N',
            classifyCombatActionSequence: 'N',
            activeHostileThreat: 'Y',
            classifyPhysicalBoundaryPressure: 'N',
            CompanionCommand: null,
            hostilesInScene: { NPC: ['Ogre'] },
            ActionTargets: ['Seraphina'],
            OppTargets: { NPC: [], ENV: [] },
            BenefitedObservers: [],
            HarmedObservers: [],
            NPCInScene: ['Ogre', 'Seraphina'],
            UserImpairment: { Relevant: 'N' },
            NPCImpairment: { Relevant: 'N' },
            InflictedInjuries: [],
          },
          npcHandoffs: [{
            NPC: 'Ogre',
            FinalState: 'B1/F2/H4',
            Behavior: 'HATRED',
            Target: 'Hostility',
            NPC_STAKES: 'N',
            Landed: 'N',
            BoundaryPressure: 'N',
          }],
          chaosHandoff: { CHAOS: { triggered: false } },
          proactivityResults: {
            Ogre: {
              Proactive: 'Y',
              Intent: 'ESCALATE_VIOLENCE',
              Impulse: 'ANGER',
              ProactivityTarget: 'Seraphina',
              TargetsUser: 'N',
            },
          },
          aggressionResults: {
            Ogre: {
              AttackType: 'ProactiveAttack',
              AttackIntent: 'ESCALATE_VIOLENCE',
              ProactivityTarget: 'Seraphina',
              AttackStat: 'PHY',
              DefenseStat: 'PHY',
              CounterPotential: 'none',
              CounterBonus: 0,
              ReactionOutcome: 'npc_fails',
              Margin: -2,
              NPCImpairment: { Relevant: 'N' },
              UserImpairment: null,
              TargetImpairment: { Relevant: 'N' },
              InflictedUserInjury: null,
              InflictedTargetInjury: null,
            },
          },
          nameGeneration: {},
          sceneTrackerUpdate: {},
        },
      };
      const text = prompt(report);
      assert.match(text, /Ogre: proactive attack from current hostile state against Seraphina fails/i);
      assert.match(text, /Do not narrate a successful NPC strike, shove, restraint, injury, or completed forceful effect/i);
      assert.match(text, /Do not narrate Seraphina's counterattack, follow-up action/i);
      assert.doesNotMatch(text, /Do not narrate \{\{user\}\}'s counterattack/i);
    },
  },
  {
    name: '43 narrator describes non-physical user effects as landed action or effect',
    run() {
      const report = runCase({
        userText: 'I channel a binding spell at the duelist to lock his limbs in place.',
        dice: [18, 8, 1, 1, 1, 1],
        tracker: {
          Duelist: trackerEntry(),
        },
        ledger: baseLedger({
          resolutionEngine: {
            identifyGoal: 'BindDuelist',
            identifyChallenge: 'bind the duelist with magic',
            explicitMeans: 'binding spell locks the duelist limbs',
            identifyTargets: { ActionTargets: ['Duelist'], OppTargets: { NPC: ['Duelist'], ENV: [] }, BenefitedObservers: [], HarmedObservers: [] },
            hasStakes: true,
            mapStats: { USER: 'MND', OPP: 'PHY' },
            classifyHostilePhysicalIntent: true,
            actionCount: ['binding spell'],
          },
          relationshipEngine: [relationship('Duelist')],
          injuryEffectEngine: {
            effects: [{
              target: 'Duelist',
              targetRole: 'OppTarget',
              effectType: 'restraint',
              bodyPart: 'body',
              description: 'magical limb binding',
              severityFloor: 'moderate',
              persistence: 'lasting',
              affectsAction: true,
            }],
          },
        }),
      });
      const text = prompt(report);
      assert.match(text, /landed user action\/effect/i);
      assert.match(text, /lasting restraint from the landed user action/i);
      assert.doesNotMatch(text, /landed user attack/i);
    },
  },
  {
    name: '43a aggression roll margin zero stalemates and negative fails for NPCs',
    run() {
      assert.equal(aggressionReactionOutcome(0), 'stalemate');
      assert.equal(aggressionReactionOutcome(-3), 'npc_fails');
      const report = {
        semanticLedger: {
          resolutionEngine: {
            explicitMeans: 'Valerie tries to headbutt and shove the user away',
          },
        },
        finalNarrativeHandoff: {
          resultLine: 'No roll',
          resolutionPacket: {
            GOAL: 'ResistValerie',
            actions: ['a1'],
            intimacyAdvanceExplicit: 'N',
            boundaryViolationExplicit: 'N',
            STAKES: 'Y',
            LandedActions: 0,
            OutcomeTier: 'Failure',
            Outcome: 'failure',
            CounterPotential: 'none',
            classifyHostilePhysicalIntent: 'N',
            classifyCombatActionSequence: 'N',
            activeHostileThreat: 'Y',
            classifyPhysicalBoundaryPressure: 'N',
            CompanionCommand: null,
            hostilesInScene: { NPC: ['Valerie'] },
            ActionTargets: [],
            OppTargets: { NPC: ['Valerie'], ENV: [] },
            BenefitedObservers: [],
            HarmedObservers: [],
            NPCInScene: ['Valerie'],
            UserImpairment: { Relevant: 'N' },
            NPCImpairment: { Relevant: 'N' },
            InflictedInjuries: [],
          },
          npcHandoffs: [{
            NPC: 'Valerie',
            FinalState: 'B1/F2/H4',
            Behavior: 'HATRED',
            Target: 'Hostility',
            NPC_STAKES: 'Y',
            Landed: 'N',
            BoundaryPressure: 'N',
          }],
          chaosHandoff: { CHAOS: { triggered: false } },
          proactivityResults: {
            Valerie: {
              Proactive: 'Y',
              Intent: 'ESCALATE_VIOLENCE',
              Impulse: 'ANGER',
              ProactivityTarget: '{{user}}',
              TargetsUser: 'Y',
            },
          },
          aggressionResults: {
            Valerie: {
              AttackType: 'ProactiveAttack',
              AttackIntent: 'ESCALATE_VIOLENCE',
              ProactivityTarget: '{{user}}',
              AttackStat: 'PHY',
              DefenseStat: 'PHY',
              CounterPotential: 'none',
              CounterBonus: 0,
              ReactionOutcome: 'npc_fails',
              Margin: -3,
              NPCImpairment: { Relevant: 'N' },
              UserImpairment: { Relevant: 'N' },
              TargetImpairment: { Relevant: 'N' },
              InflictedUserInjury: null,
              InflictedTargetInjury: null,
            },
          },
          nameGeneration: {},
          sceneTrackerUpdate: {},
        },
      };
      const text = prompt(report);
      assert.match(text, /Valerie: proactive attack from current hostile state against \{\{user\}\} fails/i);
      assert.match(text, /Do not narrate a successful NPC strike, shove, restraint, injury, or completed forceful effect/i);
    },
  },
  {
    name: '43b aggression roll margin zero gives narrator stalemate handoff',
    run() {
      const report = {
        semanticLedger: {
          resolutionEngine: {
            explicitMeans: 'Valerie tries to shove the user back',
          },
        },
        finalNarrativeHandoff: {
          resultLine: 'No roll',
          resolutionPacket: {
            GOAL: 'ResistValerie',
            actions: ['a1'],
            intimacyAdvanceExplicit: 'N',
            boundaryViolationExplicit: 'N',
            STAKES: 'Y',
            LandedActions: 0,
            OutcomeTier: 'Stalemate',
            Outcome: 'struggle',
            CounterPotential: 'none',
            classifyHostilePhysicalIntent: 'N',
            classifyCombatActionSequence: 'N',
            activeHostileThreat: 'Y',
            classifyPhysicalBoundaryPressure: 'N',
            CompanionCommand: null,
            hostilesInScene: { NPC: ['Valerie'] },
            ActionTargets: [],
            OppTargets: { NPC: ['Valerie'], ENV: [] },
            BenefitedObservers: [],
            HarmedObservers: [],
            NPCInScene: ['Valerie'],
            UserImpairment: { Relevant: 'N' },
            NPCImpairment: { Relevant: 'N' },
            InflictedInjuries: [],
          },
          npcHandoffs: [{
            NPC: 'Valerie',
            FinalState: 'B1/F2/H4',
            Behavior: 'HATRED',
            Target: 'Hostility',
            NPC_STAKES: 'Y',
            Landed: 'N',
            BoundaryPressure: 'N',
          }],
          chaosHandoff: { CHAOS: { triggered: false } },
          proactivityResults: {
            Valerie: {
              Proactive: 'Y',
              Intent: 'ESCALATE_VIOLENCE',
              Impulse: 'ANGER',
              ProactivityTarget: '{{user}}',
              TargetsUser: 'Y',
            },
          },
          aggressionResults: {
            Valerie: {
              AttackType: 'ProactiveAttack',
              AttackIntent: 'ESCALATE_VIOLENCE',
              ProactivityTarget: '{{user}}',
              AttackStat: 'PHY',
              DefenseStat: 'PHY',
              CounterPotential: 'none',
              CounterBonus: 0,
              ReactionOutcome: 'stalemate',
              Margin: 0,
              NPCImpairment: { Relevant: 'N' },
              UserImpairment: { Relevant: 'N' },
              TargetImpairment: { Relevant: 'N' },
              InflictedUserInjury: null,
              InflictedTargetInjury: null,
            },
          },
          nameGeneration: {},
          sceneTrackerUpdate: {},
        },
      };
      const text = prompt(report);
      assert.match(text, /Valerie: proactive attack from current hostile state against \{\{user\}\} meets equal resistance/i);
      assert.match(text, /Stop in the deadlock/i);
      assert.match(text, /no successful NPC strike, shove, restraint, injury, or completed forceful effect/i);
    },
  },
  {
    name: '44 narrator keeps boundary violation guidance when aggression also fires',
    run() {
      const report = {
        semanticLedger: {
          resolutionEngine: {
            explicitMeans: 'push past Mira after she refuses',
          },
        },
        finalNarrativeHandoff: {
          resultLine: '1d20(6) + PHY(6) = 12 vs 1d20(16) + PHY(5) = 21 (-9 - Critical_Failure)',
          resolutionPacket: {
            GOAL: 'ForcePastRefusal',
            actions: ['a1'],
            intimacyAdvanceExplicit: 'N',
            boundaryViolationExplicit: 'Y',
            STAKES: 'Y',
            LandedActions: 0,
            OutcomeTier: 'Critical_Failure',
            Outcome: 'avoided',
            CounterPotential: 'severe',
            classifyHostilePhysicalIntent: 'Y',
            classifyCombatActionSequence: 'Y',
            activeHostileThreat: 'N',
            classifyPhysicalBoundaryPressure: 'N',
            CompanionCommand: null,
            hostilesInScene: { NPC: [] },
            ActionTargets: ['Mira'],
            OppTargets: { NPC: ['Mira'], ENV: [] },
            BenefitedObservers: [],
            HarmedObservers: [],
            NPCInScene: ['Mira'],
            UserImpairment: { Relevant: 'N' },
            NPCImpairment: { Relevant: 'N' },
            InflictedInjuries: [],
          },
          npcHandoffs: [{
            NPC: 'Mira',
            FinalState: 'B1/F3/H4',
            Behavior: 'FEAR',
            Target: 'Fear',
            NPC_STAKES: 'Y',
            Landed: 'N',
            BoundaryPressure: 'Y',
          }],
          chaosHandoff: { CHAOS: { triggered: false } },
          proactivityResults: {
            Mira: {
              Proactive: 'Y',
              Intent: 'ESCALATE_VIOLENCE',
              Impulse: 'FEAR',
              ProactivityTarget: '{{user}}',
              TargetsUser: 'Y',
            },
          },
          aggressionResults: {
            Mira: {
              AttackType: 'CounterAttack',
              AttackIntent: 'ESCALATE_VIOLENCE',
              ProactivityTarget: '{{user}}',
              AttackStat: 'PHY',
              DefenseStat: 'PHY',
              CounterPotential: 'severe',
              CounterBonus: 6,
              ReactionOutcome: 'npc_succeeds',
              Margin: 2,
              NPCImpairment: { Relevant: 'N' },
              UserImpairment: { Relevant: 'N' },
              TargetImpairment: { Relevant: 'N' },
              InflictedUserInjury: {
                targetType: 'user',
                condition: 'wounded',
                severity: 'moderate',
                woundsAdd: [],
                statusAdd: [],
                InjuryDetailMode: 'narrator_contextual',
                InjurySeverityLimit: 'moderate',
              },
              InflictedTargetInjury: null,
            },
          },
          nameGeneration: {},
          sceneTrackerUpdate: {},
        },
      };
      const text = prompt(report);
      assert.match(text, /explicit boundary violation or pressure past refusal/i);
      assert.match(text, /Mira: counterattack exploiting the opening/i);
      assert.match(text, /Respect active boundary pressure/i);
    },
  },
  {
    name: '45 writing style placement labels and depth wiring are correct',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      assert.match(source, /<option value="before_prompt">Above Character<\/option>/);
      assert.match(source, /<option value="in_prompt">Below Character<\/option>/);
      assert.doesNotMatch(source, /â†|Ã¢/);
      assert.match(source, /writingStylePlacement:\s*'before_prompt'/);
      assert.match(source, /writingStyleDepth:\s*0/);
      assert.match(source, /const LEGACY_DEFAULT_WRITING_STYLE_PROMPT/);
      assert.match(source, /writingStylePrompt === LEGACY_DEFAULT_WRITING_STYLE_PROMPT/);
      assert.match(source, /\*\*SCENE PRESENCE\*\*/);
      assert.match(source, /Create variety through scene function/);
      assert.match(source, /Advance from established scene state/);
      assert.match(source, /Use prior actions as facts the scene now contains/);
      assert.match(source, /The prose should be detailed without becoming slow/);
      assert.match(source, /injectMovablePrompt\(\s*WRITING_STYLE_PROMPT_KEY,\s*promptText,\s*settings\.writingStylePlacement,\s*settings\.writingStyleDepth,\s*settings\.writingStyleRole,\s*\)/);
      assert.match(source, /context\.setExtensionPrompt\(\s*key,\s*text,\s*position,\s*normalizePromptDepth\(depth\),\s*false,\s*normalizePromptRole\(role\),\s*\)/);
      assert.match(source, /const showDepth = placement === 'in_chat';/);
      assert.match(source, /if \(depthRow\) depthRow\.hidden = !showDepth;/);
    },
  },
  {
    name: '46 prose rules block body and vocal shorthand equivalents',
    run() {
      const indexSource = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const handoffSource = fs.readFileSync(new URL('pre-flight.js', import.meta.url), 'utf8');
      assert.match(indexSource, /Equivalent phrasing is also banned/);
      assert.match(indexSource, /localized reddening\/paling\/whitening/);
      assert.match(indexSource, /Dialogue delivery is allowed when physically grounded/);
      assert.match(indexSource, /barely above a whisper/);
      assert.match(indexSource, /knuckles whitening/);
      assert.match(indexSource, /lowered voice/);
      assert.match(indexSource, /trembling/);
      assert.match(indexSource, /Do not chain or oscillate micro-cues/);
      assert.match(indexSource, /open-close-open mouth beats/);
      assert.match(indexSource, /tighten-loosen-tighten grip beats/);
      assert.match(indexSource, /body-cue pileups/);
      assert.match(handoffSource, /equivalent rephrasing as shorthand/);
      assert.match(handoffSource, /localized reddening\/paling\/whitening/);
      assert.match(handoffSource, /Dialogue delivery may describe lowered voice, trembling/);
      assert.match(handoffSource, /barely above a whisper/);
      assert.match(handoffSource, /Do not chain or oscillate micro-cues/);
      assert.match(handoffSource, /open-close-open mouth beats/);
      assert.match(handoffSource, /tighten-loosen-tighten grip beats/);
      assert.match(handoffSource, /twitch-cadence narration/);
      assert.doesNotMatch(handoffSource, /trembling voice, breathy line, hiss, growl/);
      assert.match(indexSource, /Ban oscillating micro-cue loops and body-language churn/);
      assert.match(indexSource, /Do not replace one invalid tell with a pileup of smaller tells/);
    },
  },
  {
    name: '46a turn boundary blocks after-beat tailing',
    run() {
      const indexSource = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const handoffSource = fs.readFileSync(new URL('pre-flight.js', import.meta.url), 'utf8');
      assert.match(indexSource, /End where the scene naturally returns control to \{\{user\}\}/);
      assert.match(indexSource, /natural user-centered response beat/);
      assert.match(indexSource, /Do not restage, re-perform, summarize, or narrate declared \{\{user\}\} actions back to \{\{user\}\}/);
      assert.match(indexSource, /Render the world, NPCs, objects, hazards, and consequences as active and independent/);
      assert.match(indexSource, /NPCs may act independently/);
      assert.match(indexSource, /Preserve visible continuity from recent chat/);
      assert.match(indexSource, /Completed NPC\/world actions, object positions, delivered items/);
      assert.match(indexSource, /Do not replay the immediately previous assistant beat/);
      assert.match(indexSource, /replaying completed NPC\/world actions from recent visible chat/);
      assert.match(indexSource, /\{\{user\}\} takes no voluntary action unless the latest user input explicitly declares that action/);
      assert.match(indexSource, /If \{\{user\}\} did not explicitly declare a voluntary action in the latest input, that action did not happen/);
      assert.match(indexSource, /Involuntary physical reactions caused by external stimulus may be narrated/);
      assert.match(indexSource, /Voluntary actions are never involuntary reactions/);
      assert.match(indexSource, /Never assume, infer, imply, bridge, complete, or narrate undeclared \{\{user\}\} actions/);
      assert.match(indexSource, /If an NPC gives, returns, drops, slides, or places an object or note for \{\{user\}\}/);
      assert.match(indexSource, /begin with what changes because of it, what becomes visible from the new position/);
      assert.match(indexSource, /If an NPC speaks or acts toward \{\{user\}\}/);
      assert.match(indexSource, /If no NPC is driving the beat/);
      assert.match(indexSource, /Do not invent a question, threat, gesture, stare, pause, silence, or waiting beat/);
      assert.match(indexSource, /Never end by prompting \{\{user\}\} to act/);
      assert.match(indexSource, /HARD STOP: after the response beat/);
      assert.match(indexSource, /separator lines used to append ambient\/actionless cleanup/);
      assert.match(indexSource, /fake response cue endings/);
      assert.match(indexSource, /mood-only silence/);
      assert.match(handoffSource, /==NARRATOR_AUTHORITY==/);
      assert.match(handoffSource, /==RENDER_CONTRACT==/);
      assert.match(handoffSource, /==NARRATION_CRAFT_DIRECTIVE==/);
      assert.match(handoffSource, /function buildNarrationCraftDirective/);
      assert.match(handoffSource, /Create variety through sentence function, sentence length, syntax, and precise physical wording/);
      assert.match(handoffSource, /Avoid repeating the same beat, verb, noun phrase, or sentence shape/);
      assert.match(handoffSource, /Advance from established scene state/);
      assert.match(handoffSource, /NARRATION_CRAFT_DIRECTIVE are all satisfied/);
      assert.match(handoffSource, /Execute these private render stages in order/);
      assert.doesNotMatch(handoffSource, /Required internal calls/);
      assert.ok(
        handoffSource.indexOf('==NARRATION_CRAFT_DIRECTIVE==') > handoffSource.indexOf('==RESOLVED_SCENE_FACTS=='),
        'NARRATION_CRAFT_DIRECTIVE should appear after RESOLVED_SCENE_FACTS.',
      );
      assert.match(handoffSource, /1\. smellGate = olfactoryGate\(input, context\)/);
      assert.match(handoffSource, /3\. epistemicRender\(response, smellGate, context\)/);
      assert.match(handoffSource, /chronologyControl\(response, input, context\)/);
      assert.match(handoffSource, /userAgencyControl\(response, input, context\)/);
      assert.match(handoffSource, /turnStructureControl\(response, context\)/);
      assert.match(handoffSource, /responseEndpointControl\(response, context\)/);
      assert.match(handoffSource, /Begin at T\+1 from \{\{user\}\} input/);
      assert.match(handoffSource, /Do not echo, restage, re-perform, summarize, paraphrase/);
      assert.match(handoffSource, /Recent visible chat remains authoritative only for already-established visible scene state/);
      assert.match(handoffSource, /Do not replay, restage, or re-complete those prior actions/);
      assert.match(handoffSource, /Continuity branch: recent visible chat remains scene state/);
      assert.match(handoffSource, /Do not repeat the immediately previous assistant beat/);
      assert.match(handoffSource, /Render NPCs and the world as active and independent/);
      assert.match(handoffSource, /NPCs may speak, move, leave, approach, block, offer, refuse, attack, retreat, reveal, hide, interrupt, or change the scene/);
      assert.match(handoffSource, /\{\{user\}\} takes no voluntary action unless the latest user input explicitly declares that action/);
      assert.match(handoffSource, /If \{\{user\}\} did not explicitly declare a voluntary action in the latest input, that action did not happen/);
      assert.match(handoffSource, /Never assume, infer, imply, bridge, complete, or narrate undeclared \{\{user\}\} actions/);
      assert.match(handoffSource, /Voluntary actions are never involuntary reactions/);
      assert.match(handoffSource, /If an NPC gives, returns, drops, slides, or places an object or note for \{\{user\}\}/);
      assert.match(handoffSource, /End where the scene naturally returns control to \{\{user\}\}/);
      assert.match(handoffSource, /natural user-centered response beat/);
      assert.match(handoffSource, /Continue NPC\/world action only while it remains independent of any new \{\{user\}\} choice or action/);
      assert.match(handoffSource, /If an NPC speaks or acts toward \{\{user\}\}/);
      assert.match(handoffSource, /If no NPC is driving the beat/);
      assert.match(handoffSource, /Do not invent a question, threat, gesture, stare, pause, silence, or waiting beat/);
      assert.match(handoffSource, /Never end by prompting \{\{user\}\} to act/);
      assert.match(handoffSource, /HARD STOP: after the response beat/);
      assert.match(handoffSource, /mood-only silence/);
    },
  },
  {
    name: '47 Prose Guard settings and prompt preserve mechanics while targeting prose violations',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const proseGuardPromptSource = source.slice(
        source.indexOf('function buildProseGuardPrompt'),
        source.indexOf('function sanitizeProseGuardResponse'),
      );
      assert.match(source, /postNarrationProseGuardEnabled:\s*true/);
      assert.match(source, /proseGuardConnectionProfile:\s*PROSE_GUARD_PROFILE_CURRENT/);
      assert.match(source, /proseGuardFormattingEnabled:\s*true/);
      assert.match(source, /proseGuardFormattingPrompt:\s*DEFAULT_PROSE_GUARD_FORMATTING_PROMPT/);
      assert.match(source, /id="structured_preflight_prose_guard_enabled"/);
      assert.match(source, /id="structured_preflight_prose_guard_profile"/);
      assert.match(source, /id="structured_preflight_prose_guard_formatting_enabled"/);
      assert.match(source, /id="structured_preflight_prose_guard_formatting_prompt"/);
      assert.match(source, /id="structured_preflight_reset_prose_guard_formatting"/);
      assert.match(source, /function buildProseGuardPrompt\(narrationText, latestUserText = ''\)/);
      assert.match(source, /ONE-CALL PRIVATE PASS PIPELINE/);
      assert.match(source, /literalStyleFilter\(response\)/);
      assert.match(source, /chronologyControl\(response, RECENT_USER_INPUT\)/);
      assert.match(source, /responseEndpointControl\(response\)/);
      assert.match(source, /formattingControl\(response\)/);
      assert.match(source, /integrityCheck\(original, corrected\)/);
      assert.match(source, /DEFAULT_PROSE_GUARD_FORMATTING_PROMPT/);
      assert.match(source, /Underline all character names, location names, unnamed scene roles, scene placeholders, and role\/pronoun references/);
      assert.match(source, /__the shopkeeper__/);
      assert.match(source, /One speaker equals one cohesive block/);
      assert.match(source, /Use \*\*\* only for environmental narration to character block/);
      assert.match(source, /PROTECTED FACTS \/ INTEGRITY LOCK/);
      assert.match(source, /Required formatting is protected unless it violates endpoint control/);
      assert.match(source, /Do not add new actions, remove valid pre-boundary actions, add reactions, add dialogue/);
      assert.match(source, /Exception: remove every sentence, paragraph, separator line, or outro/);
      assert.match(source, /success or failure, landed contact, injuries, death, condition, intimacy permission/);
      assert.match(source, /equivalent workaround phrase/);
      assert.match(source, /words cannot land, drop, hang, cut, hit, weigh, burn, freeze, crawl/);
      assert.match(source, /Smoke, rooms, silence, tension, heat, darkness, and atmosphere cannot breathe/);
      assert.match(source, /dropped like a stone/);
      assert.match(source, /the word lands flat and hard/);
      assert.match(source, /Do not replace a violation with another coded tell or workaround phrase/);
      assert.match(source, /A turn-boundary violation is a prose-rule violation/);
      assert.match(source, /A T\+1 violation is a prose-rule violation/);
      assert.match(source, /RECENT_USER_INPUT/);
      assert.match(source, /PASS 2: chronologyControl\(response, RECENT_USER_INPUT\)/);
      assert.match(source, /PASS 3: responseEndpointControl\(response\)/);
      assert.match(source, /PASS 4: integrityCheck\(original, corrected\)/);
      assert.match(source, /Do not echo, restate, paraphrase, summarize, restage, re-perform, or narrate back RECENT_USER_INPUT/);
      assert.match(source, /Invalid T\+1 restatement/);
      assert.doesNotMatch(proseGuardPromptSource, /User agency hard lock/);
      assert.doesNotMatch(proseGuardPromptSource, /takes no voluntary action/);
      assert.doesNotMatch(proseGuardPromptSource, /undeclared user actions/);
      assert.doesNotMatch(proseGuardPromptSource, /If any sentence depends on an undeclared user action/);
      assert.match(source, /End where the scene naturally returns control to the user/);
      assert.match(source, /The response beat is the point where the immediate consequence/);
      assert.match(source, /If an NPC speaks or acts toward the user/);
      assert.match(source, /If no NPC is driving the beat/);
      assert.match(source, /Do not invent a question, threat, gesture, stare, pause, silence, or waiting beat/);
      assert.match(source, /Never end by prompting the user to act/);
      assert.match(source, /HARD STOP: remove every sentence/);
      assert.match(source, /mood-only silence/);
      assert.match(source, /Do not replace after-beat tailing with different after-beat tailing\. Cut it\./);
      assert.match(source, /Invalid after-beat tail/);
      assert.match(source, /GOOD REPLACEMENT PATTERN/);
      assert.match(source, /If a proposed correction would change protected facts, keep the original valid content/);
    },
  },
  {
    name: '48 Prose Guard runs before tracker and tracker receives corrected narration',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const guardIndex = source.indexOf('const proseGuardRaw = await requestProseGuardCorrectionWithTimeout(');
      const guardCallWithUserInputIndex = source.indexOf("const proseGuardRaw = await requestProseGuardCorrectionWithTimeout(narrationText, pendingRun?.latestUserText || '')");
      const trackerIndex = source.indexOf('const trackerRaw = await requestPostNarrationTrackerDelta({');
      const displayIndex = source.indexOf('message.extra.display_text = narrationText');
      assert.ok(guardIndex > 0 || guardCallWithUserInputIndex > 0, 'Prose Guard request call missing.');
      assert.ok(guardCallWithUserInputIndex > 0, 'Prose Guard must receive latest user input for T+1 checks.');
      assert.ok(trackerIndex > guardCallWithUserInputIndex, 'Tracker update must run after Prose Guard.');
      assert.ok(displayIndex > trackerIndex, 'Final displayed narration should use the post-guard narration text.');
      assert.match(source, /setChatInputLocked\(true, 'Finalizing narration\.\.\.'\)/);
      assert.match(source, /Prose Guard failed; keeping sanitized narrator text/);
      assert.match(source, /state\.lastNarratorHandoff = narratorContext;\s*beginProseGuardDisplayIntercept\(state\.pendingGeneration\.type \|\| 'normal'\)/);
      assert.match(source, /releaseProseGuardDisplayIntercept\(\{ restore: true \}\);\s*showProgress\('Computing structured pre-flight\.\.\.'\)/);
      assert.match(source, /function canHideExpectedProseGuardMessage\(messageId\)/);
      assert.match(source, /if \(!Number\.isFinite\(normalizedId\) \|\| normalizedId <= 0\) return false;/);
      assert.match(source, /if \(!Number\.isFinite\(expectedMessageId\)\) return false;/);
      assert.match(source, /function ensureProseGuardDisplayInterceptor\(\)/);
      assert.match(source, /function beginProseGuardDisplayIntercept\(type, dryRun = false\) \{\s*ensureProseGuardDisplayInterceptor\(\);/);
      assert.match(source, /eventTypes\.GENERATION_STARTED\) context\.eventSource\.on\(context\.eventTypes\.GENERATION_STARTED, ensureProseGuardDisplayInterceptor\)/);
      assert.match(source, /eventTypes\.CHAT_COMPLETION_SETTINGS_READY\) context\.eventSource\.on\(context\.eventTypes\.CHAT_COMPLETION_SETTINGS_READY, handleChatCompletionSettingsReady\)/);
      assert.match(source, /eventTypes\.TEXT_COMPLETION_SETTINGS_READY\) context\.eventSource\.on\(context\.eventTypes\.TEXT_COMPLETION_SETTINGS_READY, handleTextCompletionSettingsReady\)/);
      assert.match(source, /applySemanticThinkingPayload\(generateData\)/);
      assert.match(source, /withStoryEngineModelRequest/);
      assert.match(source, /new MutationObserver\(mutations =>/);
      assert.match(source, /PROSE_GUARD_HIDDEN_MESSAGE_CLASS/);
      assert.match(source, /function hideProseGuardMessageElement/);
      assert.match(source, /function requestProseGuardCorrectionWithTimeout/);
      assert.match(source, /Prose Guard timed out after/);
      assert.match(source, /setTimeout\(finalize, PROSE_GUARD_DEFER_MS\)/);
      assert.match(source, /releaseProseGuardDisplayIntercept\(\{ restore: !finalNarrationRendered, messageId \}\)/);
      assert.match(source, /Story Engine is finalizing narration/);
      const interceptSource = source.slice(source.indexOf('function attachProseGuardStreamIntercept'), source.indexOf('function beginProseGuardDisplayIntercept'));
      assert.doesNotMatch(interceptSource, /\.innerHTML\s*=\s*''/);
      assert.doesNotMatch(interceptSource, /innerHTML\s*=\s*state\.proseGuardStreamOriginalHtml/);
      assert.doesNotMatch(interceptSource, /new MutationObserver/);
      assert.doesNotMatch(interceptSource, /characterData:\s*true/);
      assert.match(source, /PROSE_GUARD_HIDDEN_TEXT_CLASS/);
    },
  },
  {
    name: '48a direct semantic profile requests do not rotate active API secrets',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const semanticSource = fs.readFileSync(new URL('semantic-extractor.js', import.meta.url), 'utf8');
      assert.doesNotMatch(source, /rotateSecret/);
      assert.doesNotMatch(source, /secret_state/);
      assert.doesNotMatch(source, /withConnectionProfileSecret/);
      assert.doesNotMatch(source, /CHAT_COMPLETION_SECRET_KEYS/);
      assert.match(semanticSource, /secret_id:\s*profile\['secret-id'\]/);
      assert.match(semanticSource, /chat_completion_source:\s*chatCompletionSource/);
      assert.match(source, /using direct semantic connection profile request/);
      assert.match(source, /using direct tracker connection profile request/);
      assert.match(source, /using direct Prose Guard connection profile request/);
      assert.match(source, /using direct Progression connection profile request/);
    },
  },
  {
    name: '49 player creator supports compact identity fields, custom details, and alphabetical race choices',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const raceBlock = source.match(/const PLAYER_RACE_CHOICES = Object\.freeze\(\[\n([\s\S]*?)\n\]\);/)?.[1] || '';
      const races = [...raceBlock.matchAll(/'([^']+)'/g)].map(match => match[1]);
      assert.ok(races.length > 10, 'Race choices should be present.');
      assert.deepEqual(races, [...races].sort((a, b) => a.localeCompare(b)));
      assert.doesNotMatch(raceBlock, /'Random'/);
      assert.match(source, /const PLAYER_GENRE_CHOICES = Object\.freeze/);
      assert.match(source, /id="spe_player_character_name"/);
      assert.match(source, /<input id="spe_player_sex"/);
      assert.match(source, /id="spe_player_genre"/);
      assert.match(source, /id="spe_player_race"/);
      assert.match(source, /<option value="random"/);
      assert.match(source, /<option value="custom"/);
      assert.match(source, /data-spe-player-custom-race/);
      assert.match(source, /data-spe-player-race-description/);
      assert.match(source, /id="spe_player_additional_details_mode"/);
      assert.match(source, /id="spe_player_additional_details"/);
      assert.match(source, /Use my notes \+ fill the rest/);
      assert.match(source, /data-spe-player-additional-details/);
      assert.match(source, /function updatePlayerIdentityOptionalFields/);
      assert.match(source, /\[hidden\]\s*\{\s*display: none !important;/);
      assert.doesNotMatch(source, /id="spe_player_race_mode"/);
      assert.doesNotMatch(source, /id="spe_player_race_pick"/);
      assert.doesNotMatch(source, /id="spe_player_appearance"/);
      assert.match(source, /creator\.identity\.characterName = String\(document\.getElementById\('spe_player_character_name'\)/);
      assert.match(source, /creator\.identity\.sex = String\(document\.getElementById\('spe_player_sex'\)/);
      assert.match(source, /creator\.identity\.genre = PLAYER_GENRE_CHOICES\.includes\(genre\) \? genre : 'Fantasy'/);
      assert.match(source, /const additionalDetailsMode = document\.getElementById\('spe_player_additional_details_mode'\)/);
      assert.match(source, /creator\.identity\.additionalDetailsMode = additionalDetailsMode === 'user' \? 'user' : 'system'/);
      assert.match(source, /creator\.identity\.additionalDetails = String\(document\.getElementById\('spe_player_additional_details'\)/);
      assert.match(source, /buildNewCharacterNameInstruction\(identity\)/);
      assert.match(source, /buildNewCharacterSexInstruction\(identity\)/);
      assert.match(source, /buildNewCharacterGenreInstruction\(identity\)/);
      assert.match(source, /buildNewCharacterStatInstruction\(stats\)/);
      assert.match(source, /buildNewCharacterAdditionalDetailsInstruction\(identity\)/);
      assert.match(source, /Use this character name exactly/);
      assert.match(source, /Use this character sex exactly/);
      assert.match(source, /Generate a fitting character sex or leave it unspecified/);
      assert.match(source, /All races are valid in all genres/);
      assert.match(source, /If race is Random, choose any playable race first/);
      assert.match(source, /For Isekai, the character must originate from Earth/);
      assert.match(source, /The user-provided additional character details are locked starting facts/);
      assert.match(source, /Use them to shape background, Earth life, arrival\/origin, appearance, clothing/);
      assert.match(source, /Because the selected genre is Isekai, any Earth-life details/);
      assert.match(source, /LOCKED USER ADDITIONAL DETAILS/);
      assert.match(source, /You generate a SillyTavern user persona character sheet for roleplay/);
      assert.match(source, /This is a playable user character shell, not an authored protagonist/);
      assert.match(source, /Do not decide future choices, personality, habits, emotional reactions/);
      assert.match(source, /STAT SHAPE: strongest stats are/);
      assert.match(source, /relative weak point/);
      assert.match(source, /Do not contradict the locked stats/);
      assert.match(source, /Appearance must reflect PHY when relevant/);
      assert.match(source, /Do not soften high PHY into a default lean, wiry, fragile, noncombatant, or untrained description/);
      assert.match(source, /# TRAITS \(ALWAYS ACTIVE\): exactly one passive trait/);
      assert.match(source, /unique, impactful, permanent, and inherent to the character race/);
      assert.match(source, /It is always true and applies automatically when relevant/);
      assert.match(source, /If something is passive and always-on, it belongs here/);
      assert.match(source, /It must not be a learned skill, chosen action, trigger-based power, or disguised ability/);
      assert.match(source, /const PROGRESSION_REQUIRED_ABILITIES = 2/);
      assert.match(source, /# ABILITIES \/ SKILLS: exactly \$\{PROGRESSION_REQUIRED_ABILITIES\} usable abilities/);
      assert.match(source, /Each ability must be directly usable in narration/);
      assert.match(source, /The user does not need to name the ability/);
      assert.match(source, /fictional permission to attempt that kind of action/);
      assert.match(source, /Utility use may simply work in narration only when it is unopposed, low-stakes, outside active danger/);
      assert.match(source, /has no immediate harmful, contested, stealth, escape, security-bypass, control, ambush, trap, or unwilling-target consequence/);
      assert.match(source, /If there is combat, active danger, pursuit, stealth pressure, opposition, risk, harm/);
      assert.match(source, /normal scene resolution decides the result/);
      assert.match(source, /Limits must be fictional constraints, not numerical values, measured ranges, distances, radii, durations/);
      assert.match(source, /Do not write numerical bonuses, dice modifiers, HP rules/);
      assert.match(source, /# FLAVOR \/ FIXED FACTS:/);
      assert.match(source, /This section must add context the user can play with, not decisions made for them/);
      assert.match(source, /Do not include personality, future plans, preferred tactics, combat style/);
      assert.doesNotMatch(source, /PLAYER_SEX_CHOICES/);
    },
  },
  {
    name: '50 character progression settings, gating, and persona edits are wired',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      assert.match(source, /const PROGRESSION_REQUIRED_ACCOMPLISHMENTS = 3/);
      assert.match(source, /const PROGRESSION_MAX_STAT = 10/);
      assert.match(source, /characterProgressionEnabled: true/);
      assert.match(source, /progressionConnectionProfile: PROGRESSION_PROFILE_CURRENT/);
      assert.match(source, /id="structured_preflight_progression_enabled"/);
      assert.match(source, /id="structured_preflight_progression_profile"/);
      assert.match(source, /async function withProgressionGenerationSettings/);
      assert.match(source, /return await withSemanticGenerationSettings\(callback\)/);
      assert.match(source, /function getProgressionRoot/);
      assert.match(source, /function progressionPending/);
      assert.match(source, /renderProgressionCard\(context\)/);
      assert.match(source, /Complete Character Progression before roleplay generation can continue/);
      assert.match(source, /function maybeRecordProgressionAccomplishment/);
      assert.match(source, /packet\.STAKES === 'Y' && packet\.OutcomeTier === 'Critical_Success'/);
      assert.match(source, /root\.accomplishments\.some\(record => record\.messageKey === messageKey\)/);
      assert.match(source, /sourceRecords = unspent\.slice\(0, PROGRESSION_REQUIRED_ACCOMPLISHMENTS\)/);
      assert.match(source, /maybeRecordProgressionAccomplishment\(\{ pendingRun, messageKey, context \}\)/);
      assert.match(source, /removeProgressionRecordsForMessage\(key, context\)/);
      assert.doesNotMatch(source, /choose-gain-ability/);
      assert.doesNotMatch(source, /Gain Ability/);
      assert.doesNotMatch(source, /gainAbility/);
      assert.match(source, /Choose the existing ability to replace, then choose one generated replacement\. Ability options cannot be rerolled/);
      assert.match(source, /options\.length \? '' : '<button class="menu_button" data-spe-progression-action="generate-abilities">Generate Ability Options<\/button>'/);
      assert.match(source, /options\.length \? '' : '<button class="menu_button" data-spe-progression-action="back">Back<\/button>'/);
      assert.match(source, /Ability options are already generated\. Choose one of the presented abilities/);
      assert.match(source, /id="spe_progression_swap_ability" class="text_pole" \$\{options\.length \? 'disabled' : ''\}/);
      assert.match(source, /stats cannot go above|Stats cannot go above/);
      assert.match(source, /value >= PROGRESSION_MAX_STAT \? 'disabled'/);
      assert.match(source, /extractPersonaAbilities/);
      assert.match(source, /function isEmptyAbilityPlaceholder/);
      assert.match(source, /not specified\|no ability\|no abilities/);
      assert.match(source, /replaceAbilityInPersona/);
      assert.match(source, /updatePersonaStatText/);
      assert.match(source, /writePlayerSheetToPersona\(nextText, context\)/);
      assert.match(source, /Do not give numerical values, measured ranges, distances, radii, durations/);
      assert.match(source, /Opposed, risky, combat, stealth, coercive/);
      assert.match(source, /Return exactly three usable replacement ability options/);
      assert.match(source, /Progression ability generation did not return three valid options/);
      assert.match(source, /Generated ability ".+" included mechanical language/);
      assert.match(source, /function hasProgressionMechanicalLanguage/);
      assert.match(source, /\[-\+\]\?\\d\+\\s\*\(\?:to\|bonus\|modifier/);
      assert.match(source, /feet\|foot\|ft\|yards\?\|meters\?/);
      assert.match(source, /uses\?\\s\+per\|times\?\\s\+per\|per\\s\+\(\?:day\|scene\|turn\|round\|rest\)/);
    },
  },
  {
    name: '51 settings panel is grouped by execution order and preserves existing controls',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const renderStart = source.indexOf('function renderSettingsPanel()');
      const renderEnd = source.indexOf('const settings = getSettings();', renderStart);
      assert.ok(renderStart > 0, 'renderSettingsPanel should exist.');
      assert.ok(renderEnd > renderStart, 'renderSettingsPanel setup markup should be readable.');
      const renderSource = source.slice(renderStart, renderEnd);

      assert.match(source, /const SETTINGS_STYLE_ID = 'structured_preflight_settings_styles'/);
      assert.match(source, /function ensureSettingsPanelStyles\(\)/);
      assert.ok(renderSource.includes('ensureSettingsPanelStyles();'));
      assert.ok(renderSource.includes('spe-settings-shell'));
      assert.ok(renderSource.includes('spe-settings-section'));

      const sections = [
        ['data-spe-settings-step="master"', 'Master switch', 'Story Engine'],
        ['data-spe-settings-step="setup"', '0. Setup', 'Player Setup'],
        ['data-spe-settings-step="semantic"', '1. First model call', 'Semantic Preflight'],
        ['data-spe-settings-step="narrator-inputs"', '2. Narrator inputs', 'Narrator Context'],
        ['data-spe-settings-step="prose-guard"', '3. After narration', 'Prose Guard'],
        ['data-spe-settings-step="tracker"', '4. After final prose', 'Tracker Update'],
        ['data-spe-settings-step="progression"', '5. Advancement', 'Character Progression'],
      ];
      let previousIndex = -1;
      for (const [step, kicker, title] of sections) {
        const stepIndex = renderSource.indexOf(step);
        assert.ok(stepIndex > previousIndex, `${step} should appear in execution order.`);
        assert.ok(renderSource.indexOf(kicker, stepIndex) > stepIndex, `${kicker} label should be inside ${step}.`);
        assert.ok(renderSource.indexOf(title, stepIndex) > stepIndex, `${title} title should be inside ${step}.`);
        previousIndex = stepIndex;
      }

      const controlIds = [
        'structured_preflight_story_engine_enabled',
        'structured_preflight_use_separate_semantic_settings',
        'structured_preflight_semantic_profile',
        'structured_preflight_refresh_semantic_settings',
        'structured_preflight_post_tracker_enabled',
        'structured_preflight_tracker_profile',
        'structured_preflight_prose_guard_enabled',
        'structured_preflight_prose_guard_profile',
        'structured_preflight_prose_guard_formatting_enabled',
        'structured_preflight_prose_guard_formatting_drawer',
        'structured_preflight_reset_prose_guard_formatting',
        'structured_preflight_prose_guard_formatting_prompt',
        'structured_preflight_progression_enabled',
        'structured_preflight_progression_profile',
        'structured_preflight_name_style',
        'structured_preflight_writing_style_enabled',
        'structured_preflight_writing_style_drawer',
        'structured_preflight_reset_writing_style',
        'structured_preflight_writingStyle_placement',
        'structured_preflight_writingStyle_depth_row',
        'structured_preflight_writingStyle_depth',
        'structured_preflight_writingStyle_role',
        'structured_preflight_writing_style_prompt',
        'structured_preflight_player_setup_status',
        'structured_preflight_show_player_setup',
        'structured_preflight_force_player_setup',
        'structured_preflight_reset_player_setup',
      ];
      for (const id of controlIds) {
        const count = renderSource.split(`id="${id}"`).length - 1;
        assert.equal(count, 1, `${id} should remain present exactly once in the settings markup.`);
      }

      assert.doesNotMatch(renderSource, /id="structured_preflight_disable_semantic_thinking"/);
      assert.doesNotMatch(source, /\bdisableThinkingCheckbox\b/);
      assert.match(source, /delete extension_settings\[SETTINGS_KEY\]\.disableSemanticThinking/);
      assert.doesNotMatch(renderSource, /<hr>/);
    },
  },
  {
    name: '52 master Story Engine switch disables runtime paths without hiding settings',
    run() {
      const source = fs.readFileSync(new URL('index.js', import.meta.url), 'utf8');
      const settingsSource = source.slice(
        source.indexOf('function renderSettingsPanel()'),
        source.indexOf('function closeExtensionsDrawer()'),
      );
      const runtimeSource = source.slice(
        source.indexOf('function disableStoryEngineRuntime()'),
        source.indexOf('function showProgress'),
      );
      const generationSource = source.slice(
        source.indexOf('globalThis.StructuredPreflightEngines_generationInterceptor'),
        source.indexOf('async function handleChatCompletionPromptReady'),
      );
      const promptReadySource = source.slice(
        source.indexOf('async function handleChatCompletionPromptReady'),
        source.indexOf('async function runSemanticPassWithPromptReadyBypass'),
      );
      const startupSource = source.slice(source.indexOf('subscribeMessageHandler();'));

      assert.match(source, /storyEngineEnabled:\s*true/);
      assert.match(source, /function isStoryEngineEnabled\(\) \{\s*return getSettings\(\)\.storyEngineEnabled !== false;\s*\}/);
      assert.match(settingsSource, /data-spe-settings-step="master"/);
      assert.match(settingsSource, /id="structured_preflight_story_engine_enabled"/);
      assert.match(settingsSource, /Enable Story Engine/);
      assert.match(settingsSource, /When disabled, Story Engine skips semantic preflight, mechanics, narrator handoff, Prose Guard, tracker updates, character progression, and prompt injection/);
      assert.match(settingsSource, /settings\.storyEngineEnabled = Boolean\(event\.target\?\.checked\)/);
      assert.match(settingsSource, /if \(settings\.storyEngineEnabled === false\) \{\s*disableStoryEngineRuntime\(\);/);
      assert.match(settingsSource, /else \{\s*const context = getContext\(\);\s*ensureStreamingArtifactRegex\(\);\s*injectPromptOptionPrompts\(\);/);
      assert.match(settingsSource, /restoreTrackerFromLatestDisplaySnapshot\(context\);\s*migrateVisibleHandoffDisplays\(context\);\s*renderAllTrackerDisplayBlocks\(context\);/);
      assert.match(source, /if \(storyEngineCheckbox\) storyEngineCheckbox\.checked = engineEnabled/);
      assert.match(source, /if \(control\) control\.disabled = !engineEnabled/);
      assert.match(source, /Story Engine disabled\./);

      assert.match(runtimeSource, /clearPostNarrationFinalizerTimers\(\)/);
      assert.match(runtimeSource, /clearPendingRunCleanupTimer\(\)/);
      assert.match(runtimeSource, /clearRuntimePrompts\(\)/);
      assert.match(runtimeSource, /clearPromptOptionPrompts\(\)/);
      assert.match(runtimeSource, /setChatInputLocked\(false\)/);
      assert.match(runtimeSource, /releaseProseGuardDisplayIntercept\(\{ restore: true \}\)/);
      assert.match(runtimeSource, /removeStreamingArtifactRegex\(\)/);
      assert.match(runtimeSource, /document\.getElementById\(TRACKER_WIDGET_ID\)\?\.remove\(\)/);
      assert.match(runtimeSource, /document\.getElementById\(PLAYER_SETUP_CARD_ID\)\?\.remove\(\)/);
      assert.match(runtimeSource, /document\.getElementById\(PROGRESSION_CARD_ID\)\?\.remove\(\)/);

      assert.match(source, /function ensureStreamingArtifactRegex\(\) \{\s*if \(!isStoryEngineEnabled\(\)\) \{\s*return removeStreamingArtifactRegex\(\);/);
      assert.match(source, /function injectPromptOptionPrompts\(\) \{\s*if \(!isStoryEngineEnabled\(\)\) \{\s*clearPromptOptionPrompts\(\);/);
      assert.match(source, /function injectWritingStylePrompt\(\)[\s\S]*if \(!isStoryEngineEnabled\(\) \|\| settings\.writingStyleEnabled === false\)/);
      assert.match(source, /function injectProseRulesPrompt\(\)[\s\S]*if \(!isStoryEngineEnabled\(\)\)/);
      assert.match(source, /function getTrackerRoot\(context = getContext\(\)\) \{\s*if \(!isStoryEngineEnabled\(\)\) return null;/);
      assert.match(source, /function getPlayerRoot\(context = getContext\(\)\) \{\s*if \(!isStoryEngineEnabled\(\)\) return null;/);
      assert.match(source, /function getProgressionRoot\(context = getContext\(\)\) \{\s*if \(!isStoryEngineEnabled\(\)\) return null;/);
      assert.match(source, /function progressionPending\(context = getContext\(\)\) \{\s*if \(!isStoryEngineEnabled\(\)\) return false;/);

      assert.match(generationSource, /if \(!isStoryEngineEnabled\(\)\) \{\s*disableStoryEngineRuntime\(\);\s*return false;\s*\}/);
      assert.match(promptReadySource, /if \(!isStoryEngineEnabled\(\)\) \{\s*clearRuntimePrompts\(\);\s*clearPromptOptionPrompts\(\);\s*state\.pendingGeneration = null;\s*return;\s*\}/);
      assert.match(source, /function ensureProseGuardDisplayInterceptor\(\)[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*disableStoryEngineRuntime\(\);\s*return;\s*\}/);
      assert.match(source, /function shouldUseProseGuardDisplayIntercept\(type\)[\s\S]*return isStoryEngineEnabled\(\)/);
      assert.match(source, /function renderTrackerWidget\(context = getContext\(\)\)[\s\S]*if \(!isStoryEngineEnabled\(\) \|\| settings\.postNarrationTrackerEnabled === false\)/);
      assert.match(source, /function renderPlayerSetupCard\(context = getContext\(\)\)[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*existing\?\.remove\(\);\s*return;/);
      assert.match(source, /function renderProgressionCard\(context = getContext\(\)\)[\s\S]*if \(!isStoryEngineEnabled\(\) \|\| getSettings\(\)\.characterProgressionEnabled === false/);
      assert.match(source, /function maybeRecordProgressionAccomplishment[\s\S]*if \(!isStoryEngineEnabled\(\)\) return false;/);
      assert.match(source, /async function finalizePostNarrationMessage[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*clearRuntimePrompts\(\);\s*releaseProseGuardDisplayIntercept\(\{ restore: true, messageId \}\);\s*return;/);
      assert.match(source, /async function requestProseGuardCorrection[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*throw new Error\('Story Engine is disabled\.'\);/);
      assert.match(source, /async function requestPostNarrationTrackerDelta[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*throw new Error\('Story Engine is disabled\.'\);/);
      assert.match(source, /async function requestPlayerSetupText[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*throw new Error\('Story Engine is disabled\.'\);/);
      assert.match(source, /async function requestProgressionText[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*throw new Error\('Story Engine is disabled\.'\);/);
      assert.match(source, /async function handlePlayerSetupAction[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*disableStoryEngineRuntime\(\);\s*return;/);
      assert.match(source, /async function handleProgressionAction[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*disableStoryEngineRuntime\(\);\s*return;/);
      assert.match(source, /async function handleMessageDeleted[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*disableStoryEngineRuntime\(\);/);
      assert.match(source, /async function handleMessageSwiped[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*disableStoryEngineRuntime\(\);/);
      assert.match(source, /function handleChatChanged\(\)[\s\S]*if \(!isStoryEngineEnabled\(\)\) \{\s*disableStoryEngineRuntime\(\);/);

      assert.match(startupSource, /renderSettingsPanel\(\);\s*if \(!isStoryEngineEnabled\(\)\) \{\s*disableStoryEngineRuntime\(\);\s*return;\s*\}/);
      assert.match(startupSource, /if \(isStoryEngineEnabled\(\)\) \{\s*ensureStreamingArtifactRegex\(\);\s*ensureProseGuardDisplayInterceptor\(\);\s*injectPromptOptionPrompts\(\);/);
      assert.match(startupSource, /setTimeout\(\(\) => \{\s*if \(!isStoryEngineEnabled\(\)\) \{\s*disableStoryEngineRuntime\(\);\s*return;/);
    },
  },
];

const EXTENSION_DIR = new URL('.', import.meta.url);
const extensionFile = (name) => new URL(name, EXTENSION_DIR);

const results = [];
for (const test of tests) {
  try {
    test.run();
    results.push({ name: test.name, status: 'PASS' });
  } catch (error) {
    results.push({ name: test.name, status: 'FAIL', error: error?.stack || String(error) });
  }
}

for (const result of results) {
  console.log(`${result.status} ${result.name}`);
  if (result.error) console.log(result.error);
}

const failures = results.filter(result => result.status === 'FAIL');
console.log(`SUMMARY ${results.length - failures.length}/${results.length} passed`);
if (failures.length) process.exitCode = 1;
