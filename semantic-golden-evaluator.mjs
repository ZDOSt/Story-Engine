import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEMANTIC_GOLDEN_FIXTURES } from './semantic-golden-fixtures.mjs';
import { SLOW_BOND_KEYS } from './semantic-contract.js';

const normalizeName = value => String(value ?? '').trim().toLowerCase();
const normalizeScalar = value => typeof value === 'string' ? value.trim().toLowerCase() : value;

function normalizedArrayContains(actual, expected) {
    if (!Array.isArray(actual)) return false;
    const values = new Set(actual.map(normalizeScalar));
    return expected.every(value => values.has(normalizeScalar(value)));
}

function compareSubset(expected, actual, prefix, observations) {
    if (Array.isArray(expected)) {
        const correct = expected.length === 0
            ? Array.isArray(actual) && actual.length === 0
            : normalizedArrayContains(actual, expected);
        observations.push({ path: prefix, expected, actual, correct, kind: 'array' });
        return;
    }
    if (expected && typeof expected === 'object') {
        for (const [key, value] of Object.entries(expected)) {
            compareSubset(value, actual?.[key], prefix ? `${prefix}.${key}` : key, observations);
        }
        return;
    }
    observations.push({
        path: prefix,
        expected,
        actual,
        correct: normalizeScalar(actual) === normalizeScalar(expected),
        kind: typeof expected,
    });
}

function relationshipByName(ledger, name) {
    return (ledger?.relationshipEngine || []).find(row => normalizeName(row?.NPC) === normalizeName(name));
}

function resolveReportPath(ledger, reportPath) {
    const relationshipMatch = String(reportPath).match(/^relationshipEngine\[([^\]]+)\](?:\.(.*))?$/);
    if (relationshipMatch) {
        let value = relationshipByName(ledger, relationshipMatch[1]);
        for (const part of (relationshipMatch[2] || '').split('.').filter(Boolean)) value = value?.[part];
        return value;
    }
    let value = ledger;
    for (const part of String(reportPath).split('.').filter(Boolean)) value = value?.[part];
    return value;
}

function expectedRelationshipCoverageNames(ledger) {
    const targets = ledger?.resolutionEngine?.identifyTargets || {};
    const values = [
        ...(targets.ActionTargets || []),
        ...(targets.OppTargets?.NPC || []),
        ...(targets.BenefitedObservers || []),
        ...(targets.HarmedObservers || []),
        ...(targets.NPCAwareOfUser || []),
    ];
    return [...new Map(values
        .map(value => [normalizeName(value), String(value ?? '').trim()])
        .filter(([key]) => key && key !== '(none)')).values()];
}

function evaluateRelationshipCoverage(ledger) {
    const required = expectedRelationshipCoverageNames(ledger);
    const rows = (ledger?.relationshipEngine || []).filter(row => normalizeName(row?.NPC));
    const counts = new Map();
    for (const row of rows) {
        const key = normalizeName(row.NPC);
        counts.set(key, (counts.get(key) || 0) + 1);
    }
    const requiredKeys = new Set(required.map(normalizeName));
    const missing = required.filter(name => !counts.has(normalizeName(name)));
    const duplicate = [...counts.entries()].filter(([, count]) => count > 1).map(([name]) => name);
    const extra = rows.map(row => row.NPC).filter(name => !requiredKeys.has(normalizeName(name)));
    return {
        required: required.length,
        matched: required.length - missing.length,
        missing,
        duplicate,
        extra,
    };
}

function detectContradictions(ledger) {
    const contradictions = [];
    const boundaryBreak = ledger?.resolutionEngine?.boundaryBreak || {};
    for (const row of ledger?.relationshipEngine || []) {
        const evidence = row?.slowBondEvidence || {};
        const positive = SLOW_BOND_KEYS.filter(key => evidence[key] === true);
        const blockers = Array.isArray(evidence.blockers) ? evidence.blockers.filter(Boolean) : [];
        if (positive.length && blockers.length) {
            contradictions.push({
                NPC: row.NPC,
                type: 'positive_slow_bond_with_blocker',
                fields: positive,
            });
        }
        if (positive.length && row?.explicitIntimidationOrCoercion === true) {
            contradictions.push({
                NPC: row.NPC,
                type: 'positive_slow_bond_under_intimidation_or_coercion',
                fields: positive,
            });
        }
        if (positive.length
            && boundaryBreak.present === true
            && normalizeName(boundaryBreak.targetNPC) === normalizeName(row?.NPC)) {
            contradictions.push({
                NPC: row.NPC,
                type: 'positive_slow_bond_during_boundary_violation',
                fields: positive,
            });
        }
    }
    const coverage = evaluateRelationshipCoverage(ledger);
    for (const name of coverage.duplicate) {
        contradictions.push({ NPC: name, type: 'duplicate_relationship_row', fields: ['NPC'] });
    }
    return contradictions;
}

function normalizeCaptures(captures) {
    if (Array.isArray(captures)) return captures;
    if (!captures || typeof captures !== 'object') return [];
    return Object.entries(captures).map(([fixtureId, value]) => ({
        fixtureId,
        ...(value && typeof value === 'object' && Object.prototype.hasOwnProperty.call(value, 'ledger')
            ? value
            : { ledger: value }),
    }));
}

function safeRate(numerator, denominator) {
    return denominator ? numerator / denominator : 0;
}

export function evaluateSemanticGoldenOutputs(captures, fixtures = SEMANTIC_GOLDEN_FIXTURES) {
    const fixtureMap = new Map(fixtures.map(fixture => [fixture.id, fixture]));
    const results = [];
    const byField = {};
    const byBoundary = {};
    const confusion = { truePositive: 0, trueNegative: 0, falsePositive: 0, falseNegative: 0 };
    let fieldTotal = 0;
    let fieldCorrect = 0;
    let contradictionCount = 0;
    const coverageTotals = { required: 0, matched: 0, missing: 0, duplicate: 0, extra: 0 };

    for (const capture of normalizeCaptures(captures)) {
        const fixtureId = capture.fixtureId || capture.id;
        const fixture = fixtureMap.get(fixtureId);
        if (!fixture) throw new Error(`Unknown semantic golden fixture: ${fixtureId || '(missing id)'}`);
        const ledger = capture.ledger || capture.output;
        if (!ledger || typeof ledger !== 'object') throw new Error(`Capture ${fixtureId} has no ledger object`);

        const observations = [];
        compareSubset(fixture.expectedResolutionSubset || {}, ledger.resolutionEngine, 'resolutionEngine', observations);
        for (const expectedRow of fixture.expectedRelationshipSubset || []) {
            const actualRow = relationshipByName(ledger, expectedRow.NPC);
            compareSubset(expectedRow, actualRow, `relationshipEngine[${expectedRow.NPC}]`, observations);
        }

        const forbiddenViolations = (fixture.forbiddenOutputs || []).filter(rule =>
            normalizeScalar(resolveReportPath(ledger, rule.path)) === normalizeScalar(rule.value));
        for (const violation of forbiddenViolations) {
            observations.push({
                path: violation.path,
                expected: `not ${JSON.stringify(violation.value)}`,
                actual: resolveReportPath(ledger, violation.path),
                correct: false,
                kind: 'forbidden',
            });
        }

        for (const observation of observations) {
            fieldTotal += 1;
            if (observation.correct) fieldCorrect += 1;
            const field = byField[observation.path] ||= { total: 0, correct: 0 };
            field.total += 1;
            if (observation.correct) field.correct += 1;
            if (typeof observation.expected === 'boolean') {
                if (observation.expected === true && observation.actual === true) confusion.truePositive += 1;
                else if (observation.expected === false && observation.actual === false) confusion.trueNegative += 1;
                else if (observation.expected === false && observation.actual === true) confusion.falsePositive += 1;
                else if (observation.expected === true) confusion.falseNegative += 1;
            }
        }

        const contradictions = detectContradictions(ledger);
        const coverage = evaluateRelationshipCoverage(ledger);
        contradictionCount += contradictions.length;
        coverageTotals.required += coverage.required;
        coverageTotals.matched += coverage.matched;
        coverageTotals.missing += coverage.missing.length;
        coverageTotals.duplicate += coverage.duplicate.length;
        coverageTotals.extra += coverage.extra.length;

        const boundary = byBoundary[fixture.boundaryUnderTest] ||= { captures: 0, fields: 0, correct: 0, contradictions: 0 };
        boundary.captures += 1;
        boundary.fields += observations.length;
        boundary.correct += observations.filter(item => item.correct).length;
        boundary.contradictions += contradictions.length;

        results.push({
            fixtureId,
            boundaryUnderTest: fixture.boundaryUnderTest,
            provider: capture.provider,
            model: capture.model,
            promptContractVersion: capture.promptContractVersion,
            fields: observations.length,
            correct: observations.filter(item => item.correct).length,
            errors: observations.filter(item => !item.correct),
            contradictions,
            relationshipCoverage: coverage,
        });
    }

    for (const value of Object.values(byField)) value.accuracy = safeRate(value.correct, value.total);
    for (const value of Object.values(byBoundary)) value.accuracy = safeRate(value.correct, value.fields);

    return {
        summary: {
            captures: results.length,
            fields: fieldTotal,
            correct: fieldCorrect,
            accuracy: safeRate(fieldCorrect, fieldTotal),
            falsePositiveRate: safeRate(
                confusion.falsePositive,
                confusion.falsePositive + confusion.trueNegative,
            ),
            falseNegativeRate: safeRate(
                confusion.falseNegative,
                confusion.falseNegative + confusion.truePositive,
            ),
            contradictions: contradictionCount,
            relationshipCoverage: {
                ...coverageTotals,
                recall: safeRate(coverageTotals.matched, coverageTotals.required),
            },
        },
        confusionMatrix: confusion,
        byField,
        byBoundary,
        results,
    };
}

const invokedPath = process.argv[1] ? path.resolve(process.argv[1]) : '';
if (invokedPath && fileURLToPath(import.meta.url) === invokedPath) {
    const capturePath = process.argv[2];
    if (!capturePath) throw new Error('Usage: node semantic-golden-evaluator.mjs <captured-ledgers.json>');
    const captures = JSON.parse(fs.readFileSync(path.resolve(capturePath), 'utf8'));
    process.stdout.write(`${JSON.stringify(evaluateSemanticGoldenOutputs(captures), null, 2)}\n`);
}
