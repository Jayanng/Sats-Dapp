const fs = require('fs');
const path = require('path');

function walk(dir) {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
        file = path.resolve(dir, file);
        const stat = fs.statSync(file);
        if (stat && stat.isDirectory()) {
            if (!file.includes('node_modules') && !file.includes('.git')) {
                results = results.concat(walk(file));
            }
        } else {
            if (file.endsWith('.js') || file.endsWith('.jsx') || file.endsWith('.ts') || file.endsWith('.tsx')) {
                let c = fs.readFileSync(file, 'utf8');
                if (c.includes('lending-protocol-demo-v4')) {
                    fs.writeFileSync(file, c.replace(/lending-protocol-demo-v4/g, 'lending-protocol-demo-v5'), 'utf8');
                    console.log('Updated', file);
                }
            }
        }
    });
    return results;
}

console.log("Starting replacement in src...");
walk('./src');
console.log("Replacement complete.");
