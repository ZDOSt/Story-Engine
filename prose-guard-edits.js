export const PROSE_GUARD_EDITS_START = 'BEGIN_PROSE_GUARD_EDITS';
export const PROSE_GUARD_EDITS_END = 'END_PROSE_GUARD_EDITS';

const MAX_PROSE_GUARD_EDITS = 32;
const MAX_LONG_NARRATION_EDIT_COVERAGE = 0.75;
const LONG_NARRATION_EDIT_COVERAGE_THRESHOLD = 600;
const MIN_REPLACEMENT_WORD_RATIO = 0.5;
const STRUCTURED_ARTIFACT_PATTERN = /(?:BEGIN|END)_(?:PROSE_GUARD_EDITS|TRACKER_DELTA|CORRECTED_NARRATION)|```story_engine_tracker_delta|STORY_ENGINE_(?:TRACKER_DELTA|PROSE_GUARD)/i;
const REORDER_CONNECTOR_WORDS = new Set(['a', 'an', 'the', 'and', 'as', 'but', 'or', 'nor', 'yet', 'so', 'while', 'whereas', 'then']);

export function parseProseGuardEditPayload(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) {
        return normalizeEditPayload(raw);
    }

    const source = String(raw ?? '');
    const start = source.indexOf(PROSE_GUARD_EDITS_START);
    const end = source.indexOf(PROSE_GUARD_EDITS_END, start + PROSE_GUARD_EDITS_START.length);
    if (start < 0 || end < 0) {
        throw new Error('Prose Guard response missing its edit block.');
    }

    let jsonText = source.slice(start + PROSE_GUARD_EDITS_START.length, end).trim();
    jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    if (!jsonText) {
        throw new Error('Prose Guard edit block was empty.');
    }

    let parsed;
    try {
        parsed = JSON.parse(jsonText);
    } catch (error) {
        throw new Error(`Prose Guard edit block was not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
    return normalizeEditPayload(parsed);
}

export function applyProseGuardEdits(narrationText, rawEdits) {
    const source = String(narrationText ?? '');
    const payload = Array.isArray(rawEdits)
        ? normalizeEditPayload({ proseEdits: rawEdits })
        : normalizeEditPayload(rawEdits);
    const ranges = payload.proseEdits.map((edit, index) => {
        const start = findOccurrence(source, edit.originalText, edit.occurrence);
        if (start < 0) {
            throw new Error(`Prose Guard edit ${index + 1} did not match the requested occurrence in the original narration.`);
        }
        return {
            ...edit,
            start,
            end: start + edit.originalText.length,
        };
    }).sort((left, right) => left.start - right.start || left.end - right.end);

    for (let index = 1; index < ranges.length; index += 1) {
        if (ranges[index].start < ranges[index - 1].end) {
            throw new Error('Prose Guard returned overlapping edits.');
        }
    }

    rejectExcessiveEditCoverage(source, ranges);

    let corrected = source;
    for (const edit of [...ranges].reverse()) {
        corrected = corrected.slice(0, edit.start) + edit.replacementText + corrected.slice(edit.end);
    }

    return {
        narrationText: corrected,
        changed: corrected !== source,
        edits: ranges,
    };
}

function rejectExcessiveEditCoverage(source, ranges) {
    if (!ranges.length || !source) return;

    for (const edit of ranges) {
        if (countProseBoundaries(edit.originalText) <= 1) continue;
        if (isInformationPreservingMultiSentenceEdit(edit.originalText, edit.replacementText)) continue;

        const fullSourceReplacement = ranges.length === 1
            && edit.start === 0
            && edit.end === source.length;
        throw new Error(fullSourceReplacement
            ? 'Prose Guard attempted to rewrite the entire multi-sentence narration without preserving its content.'
            : 'Prose Guard attempted to rewrite a multi-sentence span without preserving its content.');
    }

    if (source.length < LONG_NARRATION_EDIT_COVERAGE_THRESHOLD) return;
    const coveredLength = ranges.reduce((total, edit) => total + (edit.end - edit.start), 0);
    if ((coveredLength / source.length) > MAX_LONG_NARRATION_EDIT_COVERAGE) {
        throw new Error('Prose Guard edits covered too much of the original narration.');
    }
}

function countProseBoundaries(source) {
    return (String(source).match(/[.!?](?:["')\]]+)?(?=\s|$)|\r?\n+/g) || []).length;
}

function tokenizeProseWords(value) {
    return String(value || '').toLowerCase().match(/[\p{L}\p{N}]+(?:['\u2019][\p{L}\p{N}]+)*/gu) || [];
}

function significantReorderWords(value) {
    return tokenizeProseWords(value).filter(word => !REORDER_CONNECTOR_WORDS.has(word));
}

function splitProseSegments(value) {
    return String(value || '')
        .split(/\r?\n+/)
        .flatMap(line => line.match(/.*?[.!?](?:["')\]]+)?(?=\s|$)|.+$/g) || [])
        .map(segment => significantReorderWords(segment))
        .filter(words => words.length > 0);
}

function containsWordSequence(words, sequence) {
    if (!sequence.length || sequence.length > words.length) return false;
    outer: for (let start = 0; start <= words.length - sequence.length; start += 1) {
        for (let offset = 0; offset < sequence.length; offset += 1) {
            if (words[start + offset] !== sequence[offset]) continue outer;
        }
        return true;
    }
    return false;
}

function countWords(words) {
    const counts = new Map();
    for (const word of words) counts.set(word, (counts.get(word) || 0) + 1);
    return counts;
}

function extractQuotedSpans(value) {
    return String(value || '').match(/"[^"\r\n]*"|\u201c[^\u201d\r\n]*\u201d/g) || [];
}

function isInformationPreservingMultiSentenceEdit(originalText, replacementText) {
    const originalWords = significantReorderWords(originalText);
    const replacementWords = significantReorderWords(replacementText);
    if (!originalWords.length || !replacementWords.length) return false;

    const replacementCounts = countWords(replacementWords);
    for (const [word, required] of countWords(originalWords)) {
        if ((replacementCounts.get(word) || 0) < required) return false;
    }

    if (replacementWords.length !== originalWords.length) return false;
    if (!extractQuotedSpans(originalText).every(quote => replacementText.includes(quote))) return false;

    return splitProseSegments(originalText)
        .every(sequence => containsWordSequence(replacementWords, sequence));
}

function assertNonDestructiveReplacement(originalText, replacementText, index) {
    const originalWords = tokenizeProseWords(originalText);
    const replacementWords = tokenizeProseWords(replacementText);
    if (!replacementWords.length) {
        throw new Error(`Prose Guard edit ${index + 1} attempted to delete narration.`);
    }

    if (originalWords.length >= 4
        && replacementWords.length < Math.ceil(originalWords.length * MIN_REPLACEMENT_WORD_RATIO)) {
        throw new Error(`Prose Guard edit ${index + 1} attempted to remove substantial narration.`);
    }
}

function normalizeEditPayload(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Prose Guard edit payload must be an object.');
    }

    const rawEdits = Array.isArray(value.proseEdits) ? value.proseEdits : null;
    if (!rawEdits) {
        throw new Error('Prose Guard edit payload must contain a proseEdits array.');
    }
    if (rawEdits.length > MAX_PROSE_GUARD_EDITS) {
        throw new Error(`Prose Guard returned more than ${MAX_PROSE_GUARD_EDITS} edits.`);
    }

    return {
        proseEdits: rawEdits.map((edit, index) => normalizeEdit(edit, index)),
    };
}

function normalizeEdit(edit, index) {
    if (!edit || typeof edit !== 'object' || Array.isArray(edit)) {
        throw new Error(`Prose Guard edit ${index + 1} must be an object.`);
    }

    const originalText = typeof edit.originalText === 'string' ? edit.originalText : '';
    const replacementText = typeof edit.replacementText === 'string' ? edit.replacementText : '';
    const occurrence = Number(edit.occurrence);
    if (!originalText) {
        throw new Error(`Prose Guard edit ${index + 1} has an empty originalText.`);
    }
    if (!replacementText.trim()) {
        throw new Error(`Prose Guard edit ${index + 1} attempted to delete narration.`);
    }
    if (originalText === replacementText) {
        throw new Error(`Prose Guard edit ${index + 1} does not change its source text.`);
    }
    if (!Number.isInteger(occurrence) || occurrence < 1) {
        throw new Error(`Prose Guard edit ${index + 1} has an invalid occurrence.`);
    }
    if (STRUCTURED_ARTIFACT_PATTERN.test(replacementText)) {
        throw new Error(`Prose Guard edit ${index + 1} contains a structured-output artifact.`);
    }
    assertNonDestructiveReplacement(originalText, replacementText, index);

    return { originalText, replacementText, occurrence };
}

function findOccurrence(source, search, occurrence) {
    let fromIndex = 0;
    let found = -1;
    for (let count = 0; count < occurrence; count += 1) {
        found = source.indexOf(search, fromIndex);
        if (found < 0) return -1;
        fromIndex = found + Math.max(1, search.length);
    }
    return found;
}
