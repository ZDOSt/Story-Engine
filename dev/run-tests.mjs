import { spawn } from 'node:child_process';
import { access, cp, mkdtemp, mkdir, readdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const devDirectory = path.dirname(fileURLToPath(import.meta.url));
const sourceDirectory = path.resolve(devDirectory, '..');
const runtimeDirectory = path.join(devDirectory, '.runtime');

async function isReadable(target) {
    try {
        await access(target);
        return true;
    } catch {
        return false;
    }
}

function run(command, args, options = {}) {
    return new Promise((resolve, reject) => {
        const child = spawn(command, args, {
            stdio: 'inherit',
            ...options,
        });
        child.once('error', reject);
        child.once('exit', (code, signal) => {
            resolve(signal ? 1 : (code ?? 1));
        });
    });
}

async function copyCleanSource(destination) {
    const entries = await readdir(sourceDirectory, { withFileTypes: true });
    for (const entry of entries) {
        if (entry.name === '.git' || entry.name === 'dev') continue;
        await cp(
            path.join(sourceDirectory, entry.name),
            path.join(destination, entry.name),
            { recursive: true },
        );
    }
}

async function main() {
    if (!await isReadable(path.join(devDirectory, 'node_modules', 'yaml'))) {
        throw new Error('Development dependencies are missing. Run "npm install --prefix dev" first.');
    }

    await mkdir(runtimeDirectory, { recursive: true });
    const runtime = await mkdtemp(path.join(runtimeDirectory, 'extension-'));
    try {
        await copyCleanSource(runtime);
        const exitCode = await run(process.execPath, ['test-behavior.mjs'], { cwd: runtime });
        process.exitCode = exitCode;
    } finally {
        await rm(runtime, { recursive: true, force: true });
    }
}

try {
    await main();
} catch (error) {
    console.error(`[Story Engine] clean test harness failed: ${error.message}`);
    process.exitCode = 1;
}
