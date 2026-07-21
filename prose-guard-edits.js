export const PROSE_GUARD_EDITS_START = 'BEGIN_PROSE_GUARD_EDITS';
export const PROSE_GUARD_EDITS_END = 'END_PROSE_GUARD_EDITS';
export const PROSE_GUARD_REPAIR_BATCH_SIZE = 24;

const MAX_PROSE_GUARD_REPAIRS = PROSE_GUARD_REPAIR_BATCH_SIZE;
const STRUCTURED_ARTIFACT_PATTERN = /(?:BEGIN|END)_(?:FINAL_NARRATION|PROSE_GUARD_EDITS|TRACKER_DELTA|CORRECTED_NARRATION)|```(?:json|story_engine_tracker_delta)|STORY_ENGINE_(?:TARGETED_PROSE_BAN_REPAIR|POST_NARRATION_TRACKER_UPDATE|TRACKER_DELTA|PROSE_GUARD)/i;
const PHRASE_MARKUP = String.raw`(?:<[^>\r\n]*>|&[^;\r\n]+;|[*_~])`;
const PHRASE_SEPARATOR = String.raw`(?:${PHRASE_MARKUP}|[\s,;:\u2013\u2014"'\u2018\u2019\u201c\u201d()\[\]{}-])+`;
const WORD_SOURCE = String.raw`[\p{L}\p{N}]+(?:[-'\u2019][\p{L}\p{N}]+)*`;
const ELSE_COMPLEMENT_SOURCE = String.raw`(?:something|anything|nothing|someone|anyone|everyone|somebody|anybody|everybody|nobody|somewhere|anywhere|everywhere|nowhere)\s+else`;
const ARTICLE_COMPLEMENT_SOURCE = String.raw`(?:a|an|the)\s+${WORD_SOURCE}`;
const MODIFIED_COMPLEMENT_SOURCE = String.raw`(?:[\p{L}]+ly|very|quite|too|so|more|less|most|least)\s+${WORD_SOURCE}`;
const SHORT_COMPLEMENT_SOURCE = String.raw`(?:${ELSE_COMPLEMENT_SOURCE}|${ARTICLE_COMPLEMENT_SOURCE}|${MODIFIED_COMPLEMENT_SOURCE}|${WORD_SOURCE})`;
const NO_COMPLEMENT_SOURCE = String.raw`(?:${MODIFIED_COMPLEMENT_SOURCE}|${WORD_SOURCE})`;
const NEGATED_COPULA_SOURCE = String.raw`(?:(?:am|is|are|was|were)\s+not|(?:ain['\u2019]t|isn['\u2019]t|aren['\u2019]t|wasn['\u2019]t|weren['\u2019]t)|(?:i['\u2019]m|you['\u2019]re|he['\u2019]s|she['\u2019]s|it['\u2019]s|we['\u2019]re|they['\u2019]re)\s+not)`;
const SHORT_CONTRAST_END_SOURCE = String.raw`(?=\s*(?:[.!?](?:["'\u2019\u201d)\]]*)?\s*|$))`;
const COPULAR_NOT_X_BUT_Y_PATTERN = new RegExp(
    String.raw`\b${NEGATED_COPULA_SOURCE}\s+(?!(?:only|just|because|whether)\b)${SHORT_COMPLEMENT_SOURCE}\s*,?\s+but\s+${SHORT_COMPLEMENT_SOURCE}${SHORT_CONTRAST_END_SOURCE}`,
    'giu',
);
const ELLIPTICAL_NOT_X_BUT_Y_PATTERN = new RegExp(
    String.raw`^not\s+(?!(?:only|just|because|whether)\b)${SHORT_COMPLEMENT_SOURCE}\s*,?\s+but\s+${SHORT_COMPLEMENT_SOURCE}${SHORT_CONTRAST_END_SOURCE}`,
    'iu',
);
const NOMINAL_NO_X_BUT_Y_PATTERN = new RegExp(
    String.raw`^no\s+(?!(?:only|just|because|whether)\b)${NO_COMPLEMENT_SOURCE}\s*,?\s+but\s+${SHORT_COMPLEMENT_SOURCE}${SHORT_CONTRAST_END_SOURCE}`,
    'iu',
);
const SENTENCE_SEGMENTER = typeof Intl !== 'undefined' && typeof Intl.Segmenter === 'function'
    ? new Intl.Segmenter(undefined, { granularity: 'sentence' })
    : null;

export function removeProseGuardPhraseLines(value, phrases) {
    const source = String(value ?? '');
    const removals = new Set((phrases || [])
        .map(phrase => String(phrase ?? '').trim().toLocaleLowerCase())
        .filter(Boolean));
    if (!source || !removals.size) return source;

    const newline = source.includes('\r\n') ? '\r\n' : '\n';
    const lines = source.split(/\r?\n/);
    const filtered = lines.filter(line => !removals.has(line.trim().toLocaleLowerCase()));
    return filtered.length === lines.length ? source : filtered.join(newline);
}

export function parseProseGuardRepairPayload(raw) {
    const value = parseRepairValue(raw);
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
        throw new Error('Prose Guard repair payload must be an object.');
    }
    rejectUnknownKeys(value, ['sentenceRepairs'], 'Prose Guard repair payload');
    if (!Array.isArray(value.sentenceRepairs)) {
        throw new Error('Prose Guard repair payload must contain a sentenceRepairs array.');
    }
    if (value.sentenceRepairs.length > MAX_PROSE_GUARD_REPAIRS) {
        throw new Error(`Prose Guard returned more than ${MAX_PROSE_GUARD_REPAIRS} sentence repairs.`);
    }

    const sentenceRepairs = [];
    const seenIds = new Set();
    value.sentenceRepairs.forEach((repair, index) => {
        if (!repair || typeof repair !== 'object' || Array.isArray(repair)) {
            throw new Error(`Prose Guard repair ${index + 1} must be an object.`);
        }
        rejectUnknownKeys(repair, ['findingId', 'replacementSentence'], `Prose Guard repair ${index + 1}`);
        const findingId = String(repair.findingId ?? '').trim();
        const replacementSentence = typeof repair.replacementSentence === 'string'
            ? repair.replacementSentence.trim()
            : '';
        if (!findingId) throw new Error(`Prose Guard repair ${index + 1} has no findingId.`);
        if (seenIds.has(findingId)) throw new Error(`Prose Guard returned duplicate findingId "${findingId}".`);
        if (!replacementSentence) throw new Error(`Prose Guard repair ${index + 1} attempted to delete narration.`);
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

export function collectProseGuardSentenceFindings(narrationText, rules, limit = Number.POSITIVE_INFINITY) {
    const source = String(narrationText ?? '');
    if (!source.trim()) return [];

    const sentenceSpans = splitProseSentenceSpans(source);
    const dialogueRanges = collectDialogueQuoteRanges(source);
    const grouped = new Map();
    const recordMatch = (rule, phrase, matchedPhrase, start, end, { excludeDialogue = false } = {}) => {
        if (excludeDialogue && dialogueRanges.some(range => rangesOverlap(start, end, range.start, range.end))) return;
        const sentenceSpan = sentenceSpans.find(span => start >= span.start && end <= span.end);
        if (!sentenceSpan) return;

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

        const matchKey = `${rule.ruleName}\u0000${String(phrase).toLocaleLowerCase()}\u0000${start}`;
        if (finding.matches.some(match => match.key === matchKey)) return;
        finding.matches.push({
            key: matchKey,
            ruleName: rule.ruleName,
            phrase: String(phrase),
            matchedPhrase,
            start,
            end,
        });
        if (!finding.ruleNames.includes(rule.ruleName)) finding.ruleNames.push(rule.ruleName);
    };

    for (const rule of rules || []) {
        for (const phrase of rule?.phrases || []) {
            const pattern = buildTargetedPhraseRegex(phrase);
            if (!pattern) continue;
            for (const match of source.matchAll(pattern)) {
                const prefix = match[1] || '';
                const matchedPhrase = match[2] || '';
                const start = Number(match.index || 0) + prefix.length;
                recordMatch(rule, phrase, matchedPhrase, start, start + matchedPhrase.length);
            }
        }

        if ((rule?.patternNames || []).includes('notXButY')) {
            for (const match of collectNotXButYMatches(source)) {
                recordMatch(
                    rule,
                    'short not/no X, but Y contrast',
                    match.matchedPhrase,
                    match.start,
                    match.end,
                    { excludeDialogue: true },
                );
            }
        }
    }

    const normalizedLimit = Number.isFinite(Number(limit))
        ? Math.max(0, Math.floor(Number(limit)))
        : Number.POSITIVE_INFINITY;
    return [...grouped.values()]
        .sort((left, right) => left.start - right.start)
        .slice(0, normalizedLimit)
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
    const appliedRepairs = [];
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
        try {
            validateReplacementSentence(repair.replacementSentence, rules);
            if (repair.replacementSentence === finding.sentence) {
                throw new Error('replacement did not change the offending sentence');
            }
            appliedRepairs.push({
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

    let corrected = source;
    for (const repair of [...appliedRepairs].sort((left, right) => right.start - left.start)) {
        corrected = corrected.slice(0, repair.start) + repair.replacementText + corrected.slice(repair.end);
    }

    return {
        narrationText: corrected,
        changed: corrected !== source,
        appliedRepairs,
        rejectedRepairs,
    };
}

function collectNotXButYMatches(source) {
    const value = String(source);
    const matches = [];
    const recordMatch = (match, offset = 0) => {
        const matchedPhrase = String(match?.[0] || '');
        if (!matchedPhrase) return;
        const start = offset + Number(match.index || 0);
        matches.push({ matchedPhrase, start, end: start + matchedPhrase.length });
    };

    const copularPattern = new RegExp(COPULAR_NOT_X_BUT_Y_PATTERN.source, COPULAR_NOT_X_BUT_Y_PATTERN.flags);
    for (const match of value.matchAll(copularPattern)) recordMatch(match);

    for (const span of splitProseSentenceSpans(value)) {
        for (const sourcePattern of [ELLIPTICAL_NOT_X_BUT_Y_PATTERN, NOMINAL_NO_X_BUT_Y_PATTERN]) {
            const sentencePattern = new RegExp(sourcePattern.source, sourcePattern.flags);
            recordMatch(sentencePattern.exec(span.text), span.start);
        }
    }

    return matches.sort((left, right) => left.start - right.start);
}

function parseRepairValue(raw) {
    if (raw && typeof raw === 'object' && !Array.isArray(raw)) return raw;

    const source = String(raw ?? '');
    const start = source.indexOf(PROSE_GUARD_EDITS_START);
    const end = source.indexOf(PROSE_GUARD_EDITS_END, start + PROSE_GUARD_EDITS_START.length);
    if (start < 0 || end < 0) throw new Error('Prose Guard response missing its edit block.');

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
    const source = String(phrase ?? '').trim();
    if (!source) return null;

    const tokenPattern = new RegExp(WORD_SOURCE, 'gu');
    const tokens = [...source.matchAll(tokenPattern)];
    if (!tokens.length) return null;
    const first = tokens[0];
    const last = tokens[tokens.length - 1];
    const leading = source.slice(0, Number(first.index || 0)).trim();
    const trailing = source.slice(Number(last.index || 0) + last[0].length).trim();
    const tokenBody = tokens.map(match => buildPhraseTokenPattern(match[0])).join(PHRASE_SEPARATOR);
    const body = [
        leading ? escapeRegExp(leading) : '',
        `${PHRASE_MARKUP}*`,
        tokenBody,
        `${PHRASE_MARKUP}*`,
        trailing ? escapeRegExp(trailing) : '',
    ].join('');
    return new RegExp(`(^|[^\\p{L}\\p{N}])(${body})(?=$|[^\\p{L}\\p{N}])`, 'giu');
}

function buildPhraseTokenPattern(token) {
    return String(token ?? '')
        .split(/['\u2019]/u)
        .map(escapeRegExp)
        .join(String.raw`['\u2019]`);
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
    return firstLetter === firstLetter.toLowerCase() && firstLetter !== firstLetter.toUpperCase();
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
    return Boolean(previous && !/\s/.test(previous) && !(isWordCharacter(previous) && isWordCharacter(next)));
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

function validateReplacementSentence(replacementText, rules) {
    if (!String(replacementText || '').trim()) throw new Error('replacement was empty');
    if (/[\r\n\u2028\u2029]/.test(replacementText)) throw new Error('replacement crossed a line boundary');
    if (STRUCTURED_ARTIFACT_PATTERN.test(replacementText)) throw new Error('replacement contained a structured-output artifact');
    if (splitProseSentenceSpans(replacementText).length !== 1) throw new Error('replacement was not one sentence');
    if (collectProseGuardSentenceFindings(replacementText, rules, 1).length) {
        throw new Error('replacement still contains a targeted phrase violation');
    }
}

function rejectUnknownKeys(value, allowedKeys, label) {
    const allowed = new Set(allowedKeys);
    const unknown = Object.keys(value || {}).filter(key => !allowed.has(key));
    if (unknown.length) throw new Error(`${label} contained unauthorized field "${unknown[0]}".`);
}

function escapeRegExp(value) {
    return String(value ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
