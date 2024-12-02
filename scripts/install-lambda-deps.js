const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const lambdaDir = path.join(__dirname, '..', 'lambda');

// Function to recursively find package.json files
function findPackageJsonDirs(dir) {
    const results = [];
    const items = fs.readdirSync(dir);
    
    for (const item of items) {
        const fullPath = path.join(dir, item);
        if (fs.statSync(fullPath).isDirectory()) {
            if (fs.existsSync(path.join(fullPath, 'package.json'))) {
                results.push(fullPath);
            }
        }
    }
    return results;
}

// Find all directories containing package.json
const packageDirs = findPackageJsonDirs(lambdaDir);

console.log(packageDirs);

// Install dependencies in each directory
console.log('Installing dependencies in Lambda projects...');
for (const dir of packageDirs) {
    console.log(`\nInstalling dependencies in ${path.relative(process.cwd(), dir)}`);
    try {
        execSync('npm install', { cwd: dir, stdio: 'inherit' });
    } catch (error) {
        console.error(`Error installing dependencies in ${dir}:`, error.message);
    }
}
