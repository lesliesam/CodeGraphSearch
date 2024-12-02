const fs = require('fs');
const path = require('path');

async function findFiles(dirPath) {
    const files = [];

    async function traverseDirectory(dir) {
        const entries = await fs.promises.readdir(dir, { withFileTypes: true });

        for (const entry of entries) {
            const entryPath = path.join(dir, entry.name);

            if (entry.isDirectory()) {
                await traverseDirectory(entryPath);
            } else {
                files.push(entryPath);
            }
        }
    }

    await traverseDirectory(dirPath);
    return files;
}

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

module.exports = { findFiles, sleep }