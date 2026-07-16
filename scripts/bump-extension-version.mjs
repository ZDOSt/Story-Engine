import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

function git(args, options = {}) {
    return execFileSync('git', args, {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
        ...options,
    }).trim();
}

function readJson(text, source) {
    try {
        return JSON.parse(text);
    } catch (error) {
        throw new Error(`Could not parse ${source}: ${error.message}`);
    }
}

function parseVersion(value, source) {
    const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(String(value || '').trim());
    if (!match) throw new Error(`${source} must use MAJOR.MINOR.PATCH format.`);
    return match.slice(1).map(Number);
}

function stagedFiles(root) {
    const output = git(['diff', '--cached', '--name-only', '--diff-filter=ACDMRTUXB'], { cwd: root });
    return output ? output.split(/\r?\n/).map(value => value.trim()).filter(Boolean) : [];
}

function main() {
    const root = git(['rev-parse', '--show-toplevel']);
    const manifestName = 'manifest.json';
    const changedFiles = stagedFiles(root);
    if (!changedFiles.some(file => file !== manifestName)) return;

    const manifestPath = path.join(root, manifestName);
    const headManifest = readJson(git(['show', `HEAD:${manifestName}`], { cwd: root }), `HEAD:${manifestName}`);
    const stagedManifest = readJson(git(['show', `:${manifestName}`], { cwd: root }), `staged ${manifestName}`);
    const workingManifest = readJson(fs.readFileSync(manifestPath, 'utf8'), manifestName);
    const headVersion = String(headManifest.version || '').trim();
    const stagedVersion = String(stagedManifest.version || '').trim();
    const workingVersion = String(workingManifest.version || '').trim();

    parseVersion(headVersion, `HEAD ${manifestName} version`);
    parseVersion(stagedVersion, `staged ${manifestName} version`);
    parseVersion(workingVersion, `${manifestName} version`);

    // Preserve deliberate release jumps and make retries idempotent.
    if (stagedVersion !== headVersion) return;
    if (workingVersion !== stagedVersion) {
        throw new Error(`Unstaged ${manifestName} changes would be overwritten. Stage or discard them before committing.`);
    }

    const [major, minor, patch] = parseVersion(headVersion, `HEAD ${manifestName} version`);
    const nextVersion = `${major}.${minor}.${patch + 1}`;
    workingManifest.version = nextVersion;
    fs.writeFileSync(manifestPath, `${JSON.stringify(workingManifest, null, 4)}\n`, 'utf8');
    git(['add', '--', manifestName], { cwd: root });
    process.stdout.write(`[Story Engine] version ${headVersion} -> ${nextVersion}\n`);
}

try {
    main();
} catch (error) {
    process.stderr.write(`[Story Engine] automatic version bump failed: ${error.message}\n`);
    process.exitCode = 1;
}
