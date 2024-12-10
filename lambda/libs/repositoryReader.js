const { invokeCommand } = require('./bedrock/runtime');
const { systemPrompt } = require('./bedrock/prompt');
const fs = require('fs');
const path = require('path');
const { findFiles } = require('./utils/utils');

const resFolder = '/tmp/res';

async function generateClassMeta(repoFileStructure, fileName, classContent) {
    const messages = [
        {
            role: "user",
            content: `Given the the file structure of the repository: \n ${repoFileStructure}.
            \nPlease analyse the file: ${fileName} and its content: 
            \n<code>\n${classContent}.\n</code>
            \nGenerate the JSON reponse according to the instructions.`
        }
    ]
    return await invokeCommand(systemPrompt, messages);
}

async function scanRepository(repositoryRoot) {
    const files = await findFiles(repositoryRoot);
    console.log(files);
    const filesWithRelativePath = files.map(file => path.relative(repositoryRoot, file));
    
    for (const file of files) {
        try {
            const fileName = path.basename(file);
            if (fileName.includes('ignore')) {
                console.log(`Skip ${file}.`);
                continue;
            }

            const fileNameToSave = path.relative(repositoryRoot, file).replace(/[/.]/g, '-') + '.json';
            console.log(`Processing ${file} and save it as ${fileNameToSave}`);
            const classContent = fs.readFileSync(file, 'utf8');
            const classMeta = await generateClassMeta(filesWithRelativePath.join('\n'), path.relative(repositoryRoot, file), classContent);
            
            const filePath = path.join(resFolder, fileNameToSave);
            fs.mkdirSync(path.dirname(filePath), { recursive: true });
            fs.writeFileSync(filePath, classMeta);
        } catch (err) {
            console.error(`Error processing file ${file}: ${err}`);
            console.error(err.stack);
        }
    }

    return resFolder;
}

module.exports = { scanRepository }