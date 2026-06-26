const FINAL_NARRATION_BEGIN = 'BEGIN_FINAL_NARRATION';
const FINAL_NARRATION_END = 'END_FINAL_NARRATION';
const RENDER_CONTROL_STAGE = '(?:SensoryNarrationDirective|applicationContract|smellGate|olfactoryGate|abilityAndItemRender|abilityIntegration|epistemicRender|behavioralRender|literalStyleFilter|sceneBeatComposition|chronologyControl|userAgencyControl|turnStructureControl|responseEndpointControl|turnBoundaryControl)';

export function stripComputedDebugPrefix(text) {
    return stripNarratorMetaPrefix(stripStructuredArtifacts(text)).trimStart();
}

export function sanitizeAssistantNarration(text) {
    const original = String(text ?? '').trim();
    if (!original) return original;

    const tagged = extractFinalNarrationEnvelope(original);
    const source = tagged
        ? stripNarratorMetaPrefix(tagged)
        : stripNarratorMetaPrefix(stripStructuredArtifacts(original).trim());
    const cleaned = stripVisibleMechanicsLabels(stripStructuredArtifacts(source)).trim();
    return cleaned || original;
}

function extractFinalNarrationEnvelope(text) {
    const source = String(text ?? '');
    const bothTags = source.match(new RegExp(`${FINAL_NARRATION_BEGIN}\\s*([\\s\\S]*?)\\s*${FINAL_NARRATION_END}`, 'i'));
    if (bothTags) return bothTags[1].trim();

    const beginTag = source.match(new RegExp(`${FINAL_NARRATION_BEGIN}\\s*`, 'i'));
    if (beginTag) {
        return source
            .slice(beginTag.index + beginTag[0].length)
            .replace(new RegExp(`\\s*${FINAL_NARRATION_END}[\\s\\S]*$`, 'i'), '')
            .trim();
    }

    const endTag = source.match(new RegExp(`\\s*${FINAL_NARRATION_END}`, 'i'));
    if (endTag) return source.slice(0, endTag.index).trim();

    return '';
}

export function stripStructuredArtifacts(text) {
    return String(text ?? '')
        .replace(/````text\s*\n?&lt;pre_flight&gt;[\s\S]*?&lt;\/pre_flight&gt;\s*````\s*/gi, '')
        .replace(/````text\s*\n?<pre_flight>[\s\S]*?<\/pre_flight>\s*````\s*/gi, '')
        .replace(/````text\s*\n?<narrator_prompt_context_echo>[\s\S]*?<\/narrator_prompt_context_echo>\s*````\s*/gi, '')
        .replace(/<think>[\s\S]*?<\/think>\s*/gi, '')
        .replace(/<\/think>\s*/gi, '')
        .replace(/```story_engine_tracker_delta\s*[\s\S]*?```\s*/gi, '')
        .replace(/```story_engine_tracker_delta\s*[\s\S]*?(?=BEGIN_FINAL_NARRATION|$)/gi, '')
        .replace(/<!--\s*STORY_ENGINE_TRACKER_DELTA[\s\S]*?STORY_ENGINE_TRACKER_DELTA_END\s*-->\s*/gi, '')
        .replace(/&lt;!--\s*STORY_ENGINE_TRACKER_DELTA[\s\S]*?STORY_ENGINE_TRACKER_DELTA_END\s*--&gt;\s*/gi, '')
        .replace(/<trackers>[\s\S]*?<\/trackers>\s*/gi, '')
        .replace(/&lt;trackers&gt;[\s\S]*?&lt;\/trackers&gt;\s*/gi, '')
        .replace(/BEGIN_TRACKER_DELTA[\s\S]*?END_TRACKER_DELTA\s*/gi, '')
        .replace(/BEGIN_TRACKER_DELTA[\s\S]*?(?=BEGIN_FINAL_NARRATION|$)/gi, '')
        .replace(/^\s*narrativeContract\(input\)[\s\S]*?(?=BEGIN_FINAL_NARRATION|$)/gi, '')
        .replace(/\[STORY_ENGINE_NARRATOR_HANDOFF[\s\S]*?==BINDING_NARRATION_DIRECTIVE==[\s\S]*?(?=BEGIN_FINAL_NARRATION|$)/gi, '')
        .replace(/\[STORY_ENGINE_NARRATOR_DIRECTIVE[\s\S]*?==PROMPT==\s*/gi, '')
        .replace(/\[STORY_ENGINE_NARRATOR_DIRECTIVE[\s\S]*?==NARRATOR_HANDOFF==\s*/gi, '')
        .replace(/&lt;pre_flight&gt;[\s\S]*?&lt;\/pre_flight&gt;\s*/gi, '')
        .replace(/<pre_flight>[\s\S]*?<\/pre_flight>\s*/gi, '')
        .replace(/<narrator_prompt_context_echo>[\s\S]*?<\/narrator_prompt_context_echo>\s*/gi, '')
        .replace(/BEGIN_FINAL_NARRATION\s*/gi, '')
        .replace(/\s*END_FINAL_NARRATION/gi, '');
}

export function stripVisibleMechanicsLabels(text) {
    let cleaned = String(text ?? '').trimStart();
    const label = '(?:Critical|Moderate|Minor)\\s+(?:Success|Failure)|Success|Failure|Stalemate|No\\s+Roll|Dominant\\s+Impact|Solid\\s+Impact|Light\\s+Impact|Checked|Deflected|Avoided|Struggle';
    const patterns = [
        new RegExp(`^\\s*(?:[*_~]{1,3})?\\s*(?:[\\[(])?\\s*${label}\\s*(?:[\\])])?\\s*(?:[*_~]{1,3})?\\s*(?:[-:\\u2013\\u2014]+)\\s*`, 'i'),
        new RegExp(`^\\s*(?:Result|Outcome|OutcomeTier)\\s*[:=]\\s*(?:[*_~]{1,3})?\\s*(?:[\\[(])?\\s*${label}\\s*(?:[\\])])?\\s*(?:[*_~]{1,3})?\\s*(?:[-:\\u2013\\u2014]+)?\\s*`, 'i'),
        new RegExp(`^\\s*(?:[*_~]{1,3})\\s*${label}\\s*(?:[-:\\u2013\\u2014]+)?\\s*(?:[*_~]{1,3})\\s*`, 'i'),
    ];
    let changed = true;
    while (changed) {
        changed = false;
        for (const pattern of patterns) {
            const next = cleaned.replace(pattern, '');
            if (next !== cleaned) {
                cleaned = next.trimStart();
                changed = true;
            }
        }
    }
    return cleaned;
}

export function stripNarratorMetaPrefix(text) {
    const source = String(text ?? '').trim();
    if (!source) return source;

    const promptDirective = source.match(/(?:^|\n)\s*==PROMPT==\s*\n+/i);
    if (promptDirective && promptDirective.index < 4000) {
        return stripNarratorMetaPrefix(source.slice(promptDirective.index + promptDirective[0].length).trim());
    }

    const handoffDirective = source.match(/(?:^|\n)\s*==NARRATOR_HANDOFF==\s*\n+/i);
    if (handoffDirective && handoffDirective.index < 4000) {
        return stripNarratorMetaPrefix(source.slice(handoffDirective.index + handoffDirective[0].length).trim());
    }

    const bindingDirective = source.match(/(?:^|\n)\s*==BINDING_NARRATION_DIRECTIVE==\s*\n+/i);
    if (bindingDirective && bindingDirective.index < 4000) {
        return stripNarratorMetaPrefix(source.slice(bindingDirective.index + bindingDirective[0].length).trim());
    }

    const resolvedFactsDirective = source.match(/(?:^|\n)\s*==RESOLVED_SCENE_FACTS==\s*\n+/i);
    if (resolvedFactsDirective && resolvedFactsDirective.index < 4000) {
        const finalCue = source.slice(resolvedFactsDirective.index + resolvedFactsDirective[0].length).match(/(?:^|\n)\s*BEGIN_FINAL_NARRATION\s*/i);
        if (finalCue) {
            const offset = resolvedFactsDirective.index + resolvedFactsDirective[0].length + finalCue.index + finalCue[0].length;
            return stripNarratorMetaPrefix(source.slice(offset).trim());
        }
    }

    const lengthTarget = source.match(/(?:^|\n)\s*(?:Length target|Hard maximum):\s*[^\n]*\n+/i);
    if (lengthTarget && lengthTarget.index < 4000) {
        return source.slice(lengthTarget.index + lengthTarget[0].length).trim();
    }

    const leakedFinal = extractAfterLeakedNarratorScratchpad(source);
    if (leakedFinal && leakedFinal !== source) {
        return stripNarratorMetaPrefix(leakedFinal);
    }

    const finalWritingCue = source.match(/(?:^|\n)\s*(?:Let me write this|BEGIN_FINAL_NARRATION)[^\n]*\n*/i);
    if (finalWritingCue && finalWritingCue.index < 4000) {
        return source.slice(finalWritingCue.index + finalWritingCue[0].length).trim();
    }

    const prefix = source.slice(0, 2500);
    if (!/\b(preflight|pre-flight|mechanics|NPC State|Proactivity|Chaos|GUIDE|BINDING_NARRATION_DIRECTIVE|BINDING_NARRATOR_CONTRACT|NARRATOR_AUTHORITY|RENDER_CONTRACT|NARRATOR_HANDOFF|ACTIVE_BRANCH_FACTS|RESOLVED_SCENE_FACTS|MODEL_INSTRUCTION|PROMPT|STORY_ENGINE_NARRATOR_DIRECTIVE|narrativeContract|renderControlEngine|narrativeFacts|PRIVATE_MECHANICS_AUDIT|narrator prompt|formatting rules|The user action|draft narration|scratchpad)\b/i.test(prefix)) {
        return source;
    }

    const lines = source.split(/\r?\n/);
    let cut = 0;
    for (let index = 0; index < Math.min(lines.length, 40); index += 1) {
        const line = lines[index].trim();
        if (
            !line
            || /^[-*]\s+/.test(line)
            || new RegExp(`^\\d+[.)]?\\s*(?:[*_~]{1,3})?\\s*${RENDER_CONTROL_STAGE}\\b`, 'i').test(line)
            || /^(The user|User Action|Decisive Action|Roll Used|Outcome|Outcome Meaning|Margin|Landed Actions|Result|Action Count|Stakes|Targets|Counter Potential|NPC State|Relationship Result|Chaos|Proactivity|Aggression|Aggression Guide|GUIDE|BINDING_NARRATION_DIRECTIVE|BINDING_NARRATOR_CONTRACT|NARRATOR_AUTHORITY|RENDER_CONTRACT|NARRATOR_HANDOFF|ACTIVE_BRANCH_FACTS|RESOLVED_SCENE_FACTS|MODEL_INSTRUCTION|PROMPT|STORY_ENGINE_NARRATOR_DIRECTIVE|narrativeContract|renderControlEngine|narrativeFacts|MANDATE|STRICT RULES|PART 1|PART 2|PRIVATE_MECHANICS_AUDIT|PRE-FLIGHT CHECK|Draft narration|Tense check|Perspective check|Name|NO IntimacyBoundary|IntimacyBoundary)\b/i.test(line)
            || /\b(preflight|pre-flight|mechanics|formatting rules|Length target|Hard maximum|PRIVATE HANDOFF|should be|Let me|scratchpad|stage order|RenderControlEngine)\b/i.test(line)
        ) {
            cut = index + 1;
            continue;
        }
        break;
    }

    return cut > 0 ? lines.slice(cut).join('\n').trim() : source;
}

function extractAfterLeakedNarratorScratchpad(text) {
    const source = String(text ?? '').trim();
    if (!source) return '';

    const draftCue = source.match(/(?:^|\n)\s*(?:Draft narration|Final narration|Corrected narration)\s*:\s*/i);
    if (draftCue && draftCue.index < 5000) {
        const after = source.slice(draftCue.index + draftCue[0].length).trim();
        const thinkEnd = after.match(/<\/think>\s*/i);
        if (thinkEnd && thinkEnd.index < 2000) {
            return after.slice(thinkEnd.index + thinkEnd[0].length).trim();
        }
        const firstProse = firstNarrativeLineIndex(after);
        return firstProse > 0 ? after.split(/\r?\n/).slice(firstProse).join('\n').trim() : after;
    }

    const lines = source.split(/\r?\n/);
    const scanLimit = Math.min(lines.length, 80);
    let lastArtifact = -1;
    let sawArtifact = false;

    for (let index = 0; index < scanLimit; index += 1) {
        const line = lines[index].trim();
        if (!line) {
            if (sawArtifact) lastArtifact = index;
            continue;
        }
        if (isNarratorArtifactLine(line)) {
            sawArtifact = true;
            lastArtifact = index;
            continue;
        }
        if (sawArtifact && isNarrativeStartLine(line)) {
            return lines.slice(index).join('\n').trim();
        }
    }

    return lastArtifact >= 0 ? lines.slice(lastArtifact + 1).join('\n').trim() : source;
}

function firstNarrativeLineIndex(text) {
    const lines = String(text ?? '').split(/\r?\n/);
    for (let index = 0; index < lines.length; index += 1) {
        const line = lines[index].trim();
        if (!line || isNarratorArtifactLine(line)) continue;
        return index;
    }
    return 0;
}

function isNarratorArtifactLine(line) {
    const text = String(line ?? '').trim();
    if (!text) return true;
    if (/^<\/?think\b/i.test(text)) return true;
    if (/^[-*]\s+/.test(text)) return true;
    if (new RegExp(`^\\d+[.)]?\\s*(?:[*_~]{1,3})?\\s*${RENDER_CONTROL_STAGE}\\b`, 'i').test(text)) return true;
    if (new RegExp(`^(?:[*_~]{1,3})?\\s*${RENDER_CONTROL_STAGE}\\s*(?:[*_~]{1,3})?\\s*:`, 'i').test(text)) return true;
    if (/^(?:[*_~]{1,3})?\s*(?:CONCLUSION|VALIDATION CONCLUSION|FINAL CHECK|RENDER CHECK)\s*:/i.test(text)) return true;
    if (/^(?:Valid to proceed|All checks pass|All good|Proceed with narration)\b/i.test(text)) return true;
    if (/^(?:STORY_ENGINE_NARRATOR_DIRECTIVE|narrativeContract|renderControlEngine|narrativeFacts|MANDATE|STRICT RULES|PART 1|PART 2|PRE-FLIGHT CHECK|Draft narration|Tense check|Perspective check|Name|NO IntimacyBoundary|IntimacyBoundary|AUTHORITY|CONTROLLING AUTHORITY|CLOSED-WORLD RESOLUTION|MECHANICS LOCK|UNRESOLVED INPUT RULE|SOURCE OF TRUTH|BRANCH PRIORITY|CONFLICT RULE|OUTPUT CONTRACT|VALIDITY CONTRACT|BINDING_NARRATOR_CONTRACT|NARRATOR_AUTHORITY|RENDER_CONTRACT|ACTIVE_BRANCH_FACTS|RESOLVED_SCENE_FACTS|NARRATOR_HANDOFF|MODEL_INSTRUCTION|PROMPT)\b/i.test(text)) return true;
    if (/^(?:You are the final scene narrator|You must narrate the next scene beat|Use only the NARRATOR_HANDOFF|The NARRATOR_HANDOFF sections|Use ACTIVE_BRANCH_FACTS|If an action, hit, injury|If a completed action, hit, injury|If sections conflict|LandedActions, Outcome|A command to an ally|Do not upgrade requests|Do not output|Return only final|Final narration may only|When writing the final in-character response|EXECUTE RenderControlEngine|Execute RenderControlEngine|Required internal calls|Required internal stage order|Required stage order)\b/i.test(text)) return true;
    return false;
}

function isNarrativeStartLine(line) {
    const text = String(line ?? '').trim();
    if (!text || isNarratorArtifactLine(text)) return false;
    if (/^(?:["'“‘]|[*_]*[A-Z0-9])/u.test(text)) return true;
    return false;
}
