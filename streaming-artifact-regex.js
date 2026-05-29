export const STREAMING_ARTIFACT_REGEX_SCRIPT_NAME = 'Story Engine - Hide Narrator Artifacts (Streaming Display)';
export const STREAMING_ARTIFACT_REGEX_SCRIPT_ID = 'story-engine-hide-narrator-artifacts-v1';

export const STREAMING_ARTIFACT_REGEX_SOURCE = [
    'BEGIN_FINAL_NARRATION\\s*',
    '\\s*END_FINAL_NARRATION[\\s\\S]*$',
    '^\\s*STORY_ENGINE_NARRATOR_DIRECTIVE[\\s\\S]*?(?=BEGIN_FINAL_NARRATION|$)',
    '^\\s*PRE-FLIGHT CHECK\\s*:[\\s\\S]*?(?:Draft narration\\s*:\\s*|(?=BEGIN_FINAL_NARRATION)|$)',
    '^\\s*(?:\\d+[.)]?\\s*(?:[*_~]{1,3})?\\s*(?:olfactoryGate|abilityIntegration|epistemicRender|behavioralRender|literalStyleFilter|sceneBeatComposition|chronologyControl|userAgencyControl|turnStructureControl|responseEndpointControl|turnBoundaryControl)\\b[\\s\\S]*?)(?=\\n\\s*(?!\\d+[.)]?\\s*(?:[*_~]{1,3})?\\s*(?:olfactoryGate|abilityIntegration|epistemicRender|behavioralRender|literalStyleFilter|sceneBeatComposition|chronologyControl|userAgencyControl|turnStructureControl|responseEndpointControl|turnBoundaryControl)\\b)(?!(?:[*_~]{1,3})?\\s*(?:CONCLUSION|VALIDATION CONCLUSION|FINAL CHECK|RENDER CHECK)\\s*:)|BEGIN_FINAL_NARRATION|$)',
    '^\\s*(?:(?:[*_~]{1,3})?\\s*(?:CONCLUSION|VALIDATION CONCLUSION|FINAL CHECK|RENDER CHECK)\\s*:[\\s\\S]*?)(?=\\n\\s*(?:[\"\\x27]|[*_]*[A-Z0-9])|BEGIN_FINAL_NARRATION|$)',
    '```story_engine_tracker_delta\\s*[\\s\\S]*?(?:```\\s*|(?=BEGIN_FINAL_NARRATION)|$)',
    '\\s*(?:<!--\\s*)?STORY_ENGINE_TRACKER_DELTA[\\s\\S]*?(?:STORY_ENGINE_TRACKER_DELTA_END\\s*-->|(?=BEGIN_FINAL_NARRATION)|$)',
    '\\s*&lt;!--\\s*STORY_ENGINE_TRACKER_DELTA[\\s\\S]*?(?:STORY_ENGINE_TRACKER_DELTA_END\\s*--&gt;|(?=BEGIN_FINAL_NARRATION)|$)',
    '\\s*BEGIN_TRACKER_DELTA[\\s\\S]*?(?:END_TRACKER_DELTA|(?=BEGIN_FINAL_NARRATION)|$)',
    '\\s*<trackers>[\\s\\S]*?(?:<\\/trackers>|(?=BEGIN_FINAL_NARRATION)|$)',
    '\\s*&lt;trackers&gt;[\\s\\S]*?(?:&lt;\\/trackers&gt;|(?=BEGIN_FINAL_NARRATION)|$)',
].join('|');

export const STREAMING_ARTIFACT_REGEX_PATTERN = `/${STREAMING_ARTIFACT_REGEX_SOURCE}/gi`;

export function streamingArtifactRegex() {
    return new RegExp(STREAMING_ARTIFACT_REGEX_SOURCE, 'gi');
}

export function applyStreamingArtifactDisplayRegex(text) {
    return String(text ?? '').replace(streamingArtifactRegex(), '');
}

export function buildStreamingArtifactRegexScript() {
    return {
        id: STREAMING_ARTIFACT_REGEX_SCRIPT_ID,
        scriptName: STREAMING_ARTIFACT_REGEX_SCRIPT_NAME,
        findRegex: STREAMING_ARTIFACT_REGEX_PATTERN,
        replaceString: '',
        trimStrings: [],
        placement: [2],
        disabled: false,
        markdownOnly: true,
        promptOnly: true,
        runOnEdit: true,
        substituteRegex: 0,
        minDepth: null,
        maxDepth: null,
    };
}
