export const PROSE_GUARD_EDITS_START = 'BEGIN_PROSE_GUARD_EDITS';
export const PROSE_GUARD_EDITS_END = 'END_PROSE_GUARD_EDITS';

const MAX_PROSE_GUARD_REPAIRS = 24;
const LONG_NARRATION_EDIT_COVERAGE_THRESHOLD = 600;
const MAX_LONG_NARRATION_EDIT_COVERAGE = 0.75;
const MIN_REPLACEMENT_WORD_RATIO = 0.5;
const MIN_RETAINED_TOKEN_COVERAGE = 0.5;
const MAX_TARGETED_REPLACEMENT_WORD_RATIO = 1.5;
const MAX_TARGETED_REPLACEMENT_EXTRA_WORDS = 2;
const MIN_EXACT_DUPLICATE_TOKEN_COUNT = 2;
const MIN_NEAR_DUPLICATE_TOKEN_RUN = 4;
const MIN_NEAR_DUPLICATE_COVERAGE = 0.75;
const STRUCTURED_ARTIFACT_PATTERN = /(?:BEGIN|END)_(?:FINAL_NARRATION|PROSE_GUARD_EDITS|TRACKER_DELTA|CORRECTED_NARRATION)|```(?:json|story_engine_tracker_delta)|STORY_ENGINE_(?:TARGETED_PROSE_BAN_REPAIR|POST_NARRATION_TRACKER_UPDATE|TRACKER_DELTA|PROSE_GUARD)/i;
const TARGETED_REPAIR_ACTOR_TOKENS = new Set(['i', 'me', 'my', 'mine', 'myself', 'you', 'your', 'yours', 'yourself', 'he', 'him', 'his', 'himself', 'she', 'her', 'hers', 'herself', 'they', 'them', 'their', 'theirs', 'themself', 'themselves', 'we', 'us', 'our', 'ours', 'ourselves']);
const TARGETED_REPAIR_ANCHOR_STOPWORDS = new Set(['a', 'an', 'and', 'as', 'at', 'be', 'but', 'by', 'for', 'from', 'in', 'into', 'is', 'it', 'of', 'on', 'or', 'the', 'to', 'was', 'were', 'with']);
const TARGETED_REPAIR_CLAUSE_EXPANSION_PATTERN = /[;:\u2014]|\b(?:after|before|because|then|until|when|while)\b/giu;
const SENTENCE_SEGMENTER = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'sentence' })
    : null;

export function parseProseGuardRepairPayload(raw) {
    const value = parseRepairValue(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Prose Guard repair payload must be an object.');
    }
    rejectUnknownKeys(value, ['sentenceRepairs'], 'Prose Guard repair payload');
    const rawRepairs = Array.isArray(value?.sentenceRepairs) ? value.sentenceRepairs : null;
    if (!rawRepairs) {
        throw new Error('Prose Guard repair payload must contain a sentenceRepairs array.');
    }
    if (rawRepairs.length > MAX_PROSE_GUARD_REPAIRS) {
        throw new Error(`Prose Guard returned more than ${MAX_PROSE_GUARD_REPAIRS} sentence repairs.`);
    }

    const sentenceRepairs = [];
    const seenIds = new Set();
    rawRepairs.forEach((repair, index) => {
        if (!repair || typeof repair !== 'object' || Array.isArray(repair)) {
            throw new Error(`Prose Guard repair ${index + 1} must be an object.`);
        }
        rejectUnknownKeys(repair, ['findingId', 'replacementSentence'], `Prose Guard repair ${index + 1}`);
        const findingId = String(repair.findingId ?? '').trim();
        const replacementSentence = typeof repair.replacementSentence === 'string'
            ? repair.replacementSentence
            : '';
        if (!findingId) {
            throw new Error(`Prose Guard repair ${index + 1} has no findingId.`);
        }
        if (seenIds.has(findingId)) {
            throw new Error(`Prose Guard returned duplicate findingId "${findingId}".`);
        }
        if (!replacementSentence.trim()) {
            throw new Error(`Prose Guard repair ${index + 1} attempted to delete narration.`);
        }
        if (/[\r\n\u2028\u2029]/.test(replacementSentence)) {
            throw new Error(`Prose Guard repair ${index + 1} crossed a line boundary.`);
        }
        if (STRUCTURED_ARTIFACT_PATTERN.test(replacementSentence)) {
            throw new Error(`Prose Guard repair ${index + 1} contains a structured-output artifact.`);
        }
        seenIds.add(findingId);
        sentenceRepairs.push({ findingId, replacementSentence });
    });
    return { sentenceRepairs };
}

export function collectProseGuardSentenceFindings(narrationText, rules, limit = MAX_PROSE_GUARD_REPAIRS) {
    const source = String(narrationText ?? '');
    if (!source.trim()) return [];

    const sentenceSpans = splitProseSentenceSpans(source);
    const dialogueRanges = collectDialogueQuoteRanges(source);
    const grouped = new Map();

    for (const rule of rules || []) {
        for (const phrase of rule?.phrases || []) {
            const pattern = buildTargetedPhraseRegex(phrase);
            if (!pattern) continue;

            for (const match of source.matchAll(pattern)) {
                const prefix = match[1] || '';
                const matchedPhrase = match[2] || phrase;
                const matchStart = Number(match.index || 0) + prefix.length;
                const matchEnd = matchStart + matchedPhrase.length;
                if (dialogueRanges.some(range => rangesOverlap(matchStart, matchEnd, range.start, range.end))) continue;

                const sentenceSpan = sentenceSpans.find(span => matchStart >= span.start && matchEnd <= span.end);
                if (!sentenceSpan) continue;
                const key = `${sentenceSpan.start}:${sentenceSpan.end}`;
                let finding = grouped.get(key);
                if (!finding) {
                    finding = {
                        start: sentenceSpan.start,
                        end: sentenceSpan.end,
                        sentence: sentenceSpan.text,
                        matches: [],
                        ruleNames: [],
                    };
                    grouped.set(key, finding);
                }

                const matchKey = `${rule.ruleName}\u0000${String(phrase).toLowerCase()}\u0000${matchStart}`;
                if (finding.matches.some(item => item.key === matchKey)) continue;
                finding.matches.push({
                    key: matchKey,
                    ruleName: rule.ruleName,
                    phrase: String(phrase),
                    matchedPhrase,
                    start: matchStart,
                    end: matchEnd,
                });
                if (!finding.ruleNames.includes(rule.ruleName)) finding.ruleNames.push(rule.ruleName);
            }
        }
    }

    return [...grouped.values()]
        .sort((left, right) => left.start - right.start)
        .slice(0, Math.max(0, Number(limit) || MAX_PROSE_GUARD_REPAIRS))
        .map((finding, index) => ({
            ...finding,
            id: `PG_SENTENCE_${index + 1}`,
            matches: finding.matches.map(({ key, ...match }) => match),
        }));
}

export function applyProseGuardSentenceRepairs(narrationText, findings, rawPayload, { rules = [] } = {}) {
    const source = String(narrationText ?? '');
    const payload = parseProseGuardRepairPayload(rawPayload);
    const findingById = new Map((findings || []).map(finding => [finding.id, finding]));
    const candidates = [];
    const rejectedRepairs = [];

    for (const repair of payload.sentenceRepairs) {
        const finding = findingById.get(repair.findingId);
        if (!finding) {
            rejectedRepairs.push({ findingId: repair.findingId, reason: 'unknown findingId' });
            continue;
        }
        if (source.slice(finding.start, finding.end) !== finding.sentence) {
            rejectedRepairs.push({ findingId: repair.findingId, reason: 'source sentence changed' });
            continue;
        }
        if (repair.replacementSentence === finding.sentence) continue;

        try {
            validateReplacementSentence(finding, repair.replacementSentence, rules);
            candidates.push({
                findingId: finding.id,
                start: finding.start,
                end: finding.end,
                originalText: finding.sentence,
                replacementText: repair.replacementSentence,
            });
        } catch (error) {
            rejectedRepairs.push({
                findingId: repair.findingId,
                reason: error instanceof Error ? error.message : String(error),
            });
        }
    }

    const accepted = [];
    for (const candidate of candidates.sort((left, right) => left.start - right.start)) {
        try {
            const proposed = [...accepted, candidate];
            rejectOverlappingEdits(proposed);
            rejectExcessiveEditCoverage(source, proposed);
            rejectRepeatedNarration(source, proposed);
            accepted.push(candidate);
        } catch (error) {
            rejectedRepairs.push({
                findingId: candidate.findingId,
                reason: error instanceof Error ? error.message : String(error),
            });
        }
    }

    let corrected = source;
    for (const candidate of [...accepted].sort((left, right) => right.start - left.start)) {
        corrected = corrected.slice(0, candidate.start)
            + candidate.replacementText
            + corrected.slice(candidate.end);
    }

    return {
        narrationText: corrected,
        changed: corrected !== source,
        appliedRepairs: accepted,
        rejectedRepairs,
    };
}

function parseRepairValue(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;

    const source = String(raw ?? '');
    const start = source.indexOf(PROSE_GUARD_EDITS_START);
    const end = source.indexOf(PROSE_GUARD_EDITS_END, start + PROSE_GUARD_EDITS_START.length);
    if (start < 0 || end < 0) {
        throw new Error('Prose Guard response missing its edit block.');
    }

    let jsonText = source.slice(start + PROSE_GUARD_EDITS_START.length, end).trim();
    jsonText = jsonText.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '').trim();
    if (!jsonText) throw new Error('Prose Guard edit block was empty.');
    try {
        return JSON.parse(jsonText);
    } catch (error) {
        throw new Error(`Prose Guard edit block was not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    }
}

function buildTargetedPhraseRegex(phrase) {
    const tokens = String(phrase ?? '').match(/[\p{L}\p{N}]+(?:['\u2019][\p{L}\p{N}]+)?/gu) || [];
    if (!tokens.length) return null;
    const body = tokens.map(escapeRegExp).join('[^\\p{L}\\p{N}\\r\\n.!?]+');
    return new RegExp(`(^|[^\\p{L}\\p{N}])(${body})(?=$|[^\\p{L}\\p{N}])`, 'giu');
}

function splitProseSentenceSpans(source) {
    const spans = [];
    if (SENTENCE_SEGMENTER) {
        for (const segment of SENTENCE_SEGMENTER.segment(source)) {
            appendTrimmedLineSpans(spans, source, Number(segment.index), Number(segment.index) + String(segment.segment).length);
        }
        return mergeQuotedContinuationSpans(source, spans);
    }

    const pattern = /[^.!?\r\n]+(?:[.!?]+(?=(?:["'\u2019\u201d\u00bb)\]]+)?(?:\s|$))|$)/g;
    for (const match of source.matchAll(pattern)) {
        const start = Number(match.index || 0);
        appendTrimmedSpan(spans, source, start, start + String(match[0] || '').length);
    }
    return mergeQuotedContinuationSpans(source, spans);
}

function mergeQuotedContinuationSpans(source, spans) {
    if (spans.length < 2) return spans;
    const quoteRanges = collectDialogueQuoteRanges(source);
    const merged = [];

    for (const span of spans) {
        const previous = merged[merged.length - 1];
        const gap = previous ? source.slice(previous.end, span.start) : '';
        if (previous
            && !/\r?\n\s*\r?\n/.test(gap)
            && isQuotedContinuationBoundary(source, previous.end, quoteRanges)
            && isLikelySentenceContinuation(span.text)) {
            previous.end = span.end;
            previous.text = source.slice(previous.start, previous.end).trim();
            continue;
        }
        merged.push({ ...span });
    }

    return merged;
}

function isQuotedContinuationBoundary(source, end, quoteRanges) {
    let cursor = end;
    while (cursor > 0 && /[.!?\s]/.test(source[cursor - 1])) cursor -= 1;
    return quoteRanges.some(range => range.end === cursor);
}

function isLikelySentenceContinuation(text) {
    const candidate = String(text ?? '').trimStart().replace(/^[\u2014\u2013-]+\s*/, '');
    const firstWord = candidate.match(/^\p{L}+/u)?.[0] || '';
    if (!firstWord) return false;
    const firstLetter = [...firstWord][0];
    const startsLowercase = firstLetter === firstLetter.toLowerCase() && firstLetter !== firstLetter.toUpperCase();
    return startsLowercase;
}

function appendTrimmedLineSpans(spans, source, start, end) {
    let lineStart = start;
    for (let index = start; index <= end; index += 1) {
        if (index !== end && source[index] !== '\n') continue;
        appendTrimmedSpan(spans, source, lineStart, index);
        lineStart = index + 1;
    }
}

function appendTrimmedSpan(spans, source, start, end) {
    while (start < end && /\s/.test(source[start])) start += 1;
    while (end > start && /\s/.test(source[end - 1])) end -= 1;
    if (end > start) spans.push({ start, end, text: source.slice(start, end) });
}

function collectDialogueQuoteRanges(source) {
    const ranges = [];
    let opener = null;
    let start = -1;
    for (let index = 0; index < source.length; index += 1) {
        const char = source[index];
        if (!opener) {
            if (char === '"' || char === '\u201c' || char === '\u00ab' || char === '\u2018'
                || (char === "'" && isStraightSingleQuoteOpener(source, index))) {
                opener = char;
                start = index;
            }
            continue;
        }
        const closer = opener === '\u201c'
            ? '\u201d'
            : opener === '\u00ab'
                ? '\u00bb'
                : opener === '\u2018'
                    ? '\u2019'
                    : opener;
        const escaped = (opener === '"' || opener === "'") && isEscaped(source, index);
        const validSingleCloser = (opener !== "'" && opener !== '\u2018') || isSingleQuoteCloser(source, index);
        if (char === closer && !escaped && validSingleCloser) {
            ranges.push({ start, end: index + 1 });
            opener = null;
            start = -1;
        }
    }
    if (opener && start >= 0) ranges.push({ start, end: source.length });
    return ranges;
}

function isStraightSingleQuoteOpener(source, index) {
    const previous = index > 0 ? source[index - 1] : '';
    const next = index + 1 < source.length ? source[index + 1] : '';
    return Boolean(next && !/\s/.test(next) && !isWordCharacter(previous));
}

function isSingleQuoteCloser(source, index) {
    const previous = index > 0 ? source[index - 1] : '';
    const next = index + 1 < source.length ? source[index + 1] : '';
    return Boolean(previous
        && !/\s/.test(previous)
        && !(isWordCharacter(previous) && isWordCharacter(next)));
}

function isWordCharacter(value) {
    return Boolean(value && /[\p{L}\p{N}]/u.test(value));
}

function isEscaped(source, index) {
    let backslashes = 0;
    for (let cursor = index - 1; cursor >= 0 && source[cursor] === '\\'; cursor -= 1) backslashes += 1;
    return backslashes % 2 === 1;
}

function rangesOverlap(leftStart, leftEnd, rightStart, rightEnd) {
    return leftStart < rightEnd && leftEnd > rightStart;
}

function validateReplacementSentence(finding, replacementText, rules) {
    const originalText = String(finding?.sentence || '');
    if (!String(replacementText || '').trim()) throw new Error('replacement was empty');
    if (/[\r\n\u2028\u2029]/.test(replacementText)) throw new Error('replacement crossed a line boundary');
    if (STRUCTURED_ARTIFACT_PATTERN.test(replacementText)) throw new Error('replacement contained a structured-output artifact');
    if (splitProseSentenceSpans(replacementText).length !== 1) throw new Error('replacement was not one sentence');

    const originalQuotes = collectDialogueQuoteRanges(originalText).map(range => originalText.slice(range.start, range.end));
    const replacementQuotes = collectDialogueQuoteRanges(replacementText).map(range => replacementText.slice(range.start, range.end));
    if (JSON.stringify(originalQuotes) !== JSON.stringify(replacementQuotes)) {
        throw new Error('replacement changed quoted dialogue');
    }

    assertOnlyTargetedPhraseTextChanged(finding, replacementText);
    assertNonDestructiveReplacement(originalText, replacementText);
    if (collectProseGuardSentenceFindings(replacementText, rules, 1).length) {
        throw new Error('replacement still contains a targeted phrase violation');
    }
}

function assertOnlyTargetedPhraseTextChanged(finding, replacementText) {
    const originalText = String(finding?.sentence || '');
    const sentenceStart = Number(finding?.start);
    if (!originalText || !Number.isFinite(sentenceStart)) {
        throw new Error('finding was missing its source sentence bounds');
    }

    const ranges = (finding?.matches || [])
        .map(match => ({
            start: Math.max(0, Number(match?.start) - sentenceStart),
            end: Math.min(originalText.length, Number(match?.end) - sentenceStart),
        }))
        .filter(range => Number.isFinite(range.start) && Number.isFinite(range.end) && range.end > range.start)
        .sort((left, right) => left.start - right.start || left.end - right.end)
        .reduce((merged, range) => {
            const previous = merged[merged.length - 1];
            if (previous && range.start <= previous.end) {
                previous.end = Math.max(previous.end, range.end);
            } else {
                merged.push({ ...range });
            }
            return merged;
        }, []);
    if (!ranges.length) throw new Error('finding had no authorized phrase span');

    let cursor = 0;
    let pattern = '^';
    for (const range of ranges) {
        pattern += escapeRegExp(originalText.slice(cursor, range.start));
        pattern += '([\\s\\S]+?)';
        cursor = range.end;
    }
    pattern += `${escapeRegExp(originalText.slice(cursor))}$`;

    const matched = new RegExp(pattern, 'u').exec(replacementText);
    if (!matched) {
        throw new Error('replacement changed text outside the targeted phrase span');
    }

    ranges.forEach((range, index) => {
        const originalWords = tokenizeProseWords(originalText.slice(range.start, range.end));
        const replacementWords = tokenizeProseWords(matched[index + 1]);
        if (!replacementWords.length) {
            throw new Error('replacement deleted a targeted phrase instead of rewriting it');
        }
        const maximumWords = Math.max(
            originalWords.length * MAX_TARGETED_REPLACEMENT_WORD_RATIO,
            originalWords.length + MAX_TARGETED_REPLACEMENT_EXTRA_WORDS,
        );
        if (replacementWords.length > maximumWords) {
            throw new Error('replacement added excessive content inside a targeted phrase span');
        }
        assertTargetedFragmentSafety(
            originalText.slice(range.start, range.end),
            matched[index + 1],
        );
    });
}

function assertTargetedFragmentSafety(originalFragment, replacementFragment) {
    const originalWords = tokenizeProseWords(originalFragment);
    const replacementWords = tokenizeProseWords(replacementFragment);
    const originalActorCounts = tokenCounts(originalWords.filter(token => TARGETED_REPAIR_ACTOR_TOKENS.has(token)));
    const replacementActorCounts = tokenCounts(replacementWords.filter(token => TARGETED_REPAIR_ACTOR_TOKENS.has(token)));
    for (const [token, count] of replacementActorCounts) {
        if (count > (originalActorCounts.get(token) || 0)) {
            throw new Error('replacement introduced a new actor reference inside a targeted phrase span');
        }
    }

    const originalClauseSignals = String(originalFragment || '').match(TARGETED_REPAIR_CLAUSE_EXPANSION_PATTERN) || [];
    const replacementClauseSignals = String(replacementFragment || '').match(TARGETED_REPAIR_CLAUSE_EXPANSION_PATTERN) || [];
    if (replacementClauseSignals.length > originalClauseSignals.length) {
        throw new Error('replacement expanded a targeted phrase into another action or clause');
    }

    const sourceAnchors = new Set(originalWords
        .filter(token => token.length >= 3 && !TARGETED_REPAIR_ANCHOR_STOPWORDS.has(token))
        .map(targetedRepairTokenRoot));
    if (sourceAnchors.size) {
        const retainsAnchor = replacementWords.some(token => sourceAnchors.has(targetedRepairTokenRoot(token)));
        if (!retainsAnchor) {
            throw new Error('replacement lacked a lexical anchor from the targeted phrase');
        }
    }
}

function targetedRepairTokenRoot(token) {
    let value = String(token || '').toLowerCase().replace(/['\u2019]s$/u, '');
    if (value.length > 5 && value.endsWith('ing')) value = value.slice(0, -3);
    else if (value.length > 4 && value.endsWith('ed')) value = value.slice(0, -2);
    else if (value.length > 4 && value.endsWith('es')) value = value.slice(0, -2);
    else if (value.length > 3 && value.endsWith('s')) value = value.slice(0, -1);
    return value;
}

function tokenCounts(tokens) {
    const counts = new Map();
    for (const token of tokens || []) counts.set(token, (counts.get(token) || 0) + 1);
    return counts;
}

function rejectOverlappingEdits(edits) {
    const sorted = [...edits].sort((left, right) => left.start - right.start || left.end - right.end);
    for (let index = 1; index < sorted.length; index += 1) {
        if (sorted[index].start < sorted[index - 1].end) throw new Error('Prose Guard repairs overlapped.');
    }
}

function rejectExcessiveEditCoverage(source, edits) {
    if (!source || !edits.length || source.length < LONG_NARRATION_EDIT_COVERAGE_THRESHOLD) return;
    const coveredLength = edits.reduce((total, edit) => total + (edit.end - edit.start), 0);
    if ((coveredLength / source.length) > MAX_LONG_NARRATION_EDIT_COVERAGE) {
        throw new Error('Prose Guard repairs covered too much of the narration.');
    }
}

function tokenizeProseWords(value) {
    return String(value || '').toLowerCase().match(/[\p{L}\p{N}]+(?:['\u2019][\p{L}\p{N}]+)*/gu) || [];
}

function longestCommonTokenRun(left, right) {
    let previous = new Array(right.length + 1).fill(0);
    let longest = 0;
    for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
        const current = new Array(right.length + 1).fill(0);
        for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
            if (left[leftIndex] !== right[rightIndex]) continue;
            current[rightIndex + 1] = previous[rightIndex] + 1;
            longest = Math.max(longest, current[rightIndex + 1]);
        }
        previous = current;
    }
    return longest;
}

function isNearDuplicateNarration(left, right) {
    const leftTokens = tokenizeProseWords(left);
    const rightTokens = tokenizeProseWords(right);
    if (leftTokens.length < MIN_EXACT_DUPLICATE_TOKEN_COUNT || rightTokens.length < MIN_EXACT_DUPLICATE_TOKEN_COUNT) return false;
    if (leftTokens.length === rightTokens.length && leftTokens.join(' ') === rightTokens.join(' ')) return true;
    const shorterLength = Math.min(leftTokens.length, rightTokens.length);
    const commonRun = longestCommonTokenRun(leftTokens, rightTokens);
    return commonRun >= MIN_NEAR_DUPLICATE_TOKEN_RUN && (commonRun / shorterLength) >= MIN_NEAR_DUPLICATE_COVERAGE;
}

function rejectRepeatedNarration(source, edits) {
    if (!source || !edits.length) return;
    const sourceSpans = splitProseSentenceSpans(source);
    const replacementEntries = edits.map(edit => ({ edit, text: edit.replacementText }));

    for (const edit of edits) {
        for (const sourceSpan of sourceSpans) {
            if (sourceSpan.end <= edit.start || sourceSpan.start >= edit.end) {
                if (isNearDuplicateNarration(edit.replacementText, sourceSpan.text)) {
                    throw new Error(`replacement for ${edit.findingId} repeated or closely duplicated existing narration`);
                }
            }
        }
    }

    for (let leftIndex = 0; leftIndex < replacementEntries.length; leftIndex += 1) {
        for (let rightIndex = leftIndex + 1; rightIndex < replacementEntries.length; rightIndex += 1) {
            const left = replacementEntries[leftIndex];
            const right = replacementEntries[rightIndex];
            if (isNearDuplicateNarration(left.text, right.text)) {
                throw new Error(`repairs ${left.edit.findingId} and ${right.edit.findingId} repeated the same narration`);
            }
        }
    }
}

function assertNonDestructiveReplacement(originalText, replacementText) {
    const originalWords = tokenizeProseWords(originalText);
    const replacementWords = tokenizeProseWords(replacementText);
    if (!replacementWords.length) throw new Error('replacement attempted to delete narration');
    if (originalWords.length >= 4 && replacementWords.length < Math.ceil(originalWords.length * MIN_REPLACEMENT_WORD_RATIO)) {
        throw new Error('replacement removed substantial narration');
    }
    if (originalWords.length >= 6) {
        const retainedTokens = countOrderedCommonTokens(originalWords, replacementWords);
        if ((retainedTokens / originalWords.length) < MIN_RETAINED_TOKEN_COVERAGE) {
            throw new Error('replacement removed too much source content');
        }
    }
}

function countOrderedCommonTokens(sourceTokens, replacementTokens) {
    let replacementIndex = 0;
    let retained = 0;
    for (const token of sourceTokens) {
        const foundIndex = replacementTokens.indexOf(token, replacementIndex);
        if (foundIndex < 0) continue;
        retained += 1;
        replacementIndex = foundIndex + 1;
    }
    return retained;
}

function rejectUnknownKeys(value, allowedKeys, label) {
    const allowed = new Set(allowedKeys);
    const unknown = Object.keys(value).filter(key => !allowed.has(key));
    if (unknown.length) throw new Error(`${label} contained unauthorized field(s): ${unknown.join(', ')}`);
}

function escapeRegExp(value) {
    return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
