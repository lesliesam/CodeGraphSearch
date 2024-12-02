const { Client } = require('@opensearch-project/opensearch');
const { AwsSigv4Signer } = require('@opensearch-project/opensearch/aws');
const { defaultProvider } = require('@aws-sdk/credential-provider-node');
const { invokeTitanEmbedding } = require('../bedrock/runtime');

const {
    PATH_META_DATA,
    CLASS_META_DATA,
    FUNC_META_DATA
} = require('../constants');

require('dotenv').config();

// AWS OpenSearch配置
const host = `https://${process.env.OPENSEARCH_DNS}`;
const region = process.env.REGION;

let client = null;

async function initClient() {
    if (!client) {
        const credentials = await defaultProvider()();

        // 创建OpenSearch客户端
        client = new Client({
            ...AwsSigv4Signer({
                region: region,
                service: 'es',
                credentials,
            }),
            node: host,
        });
    }
}


// 创建索引
async function createIndex(indexName) {
    await initClient();

    const indexBody = {
        settings: {
            index: {
                knn: true
            }
        },
        mappings: {
            properties: {
                name: { type: 'text' },
                path: { type: 'text' },
                description: { type: 'text' },
                description_vector: {
                    "type": "knn_vector",
                    "dimension": 1024,
                    "method": {
                        "name": "hnsw",
                        "engine": "nmslib",
                        "parameters": {
                            "ef_construction": 128,
                            "m": 24
                        }
                    }
                }
            }
        }
    };

    try {
        const { body: indexExists } = await client.indices.exists({ index: indexName });
        if (!indexExists) {
            await client.indices.create({
                index: indexName,
                body: indexBody
            });
            console.log(`Index ${indexName} created successfully`);
        } else {
            console.log(`Index ${indexName} already exists`);
        }
    } catch (error) {
        console.error(`An error occurred while creating/checking the index: ${error.message}`);
        throw error;
    }
}

// 使用upsert插入或更新数据
async function upsertDocuments(operations) {
    await initClient();

    try {
        const { body: bulkResponse } = await client.bulk({ refresh: true, body: operations });
        if (bulkResponse.errors) {
            console.error('Bulk upsert operation encountered errors:', JSON.stringify(bulkResponse));
            console.log(operations);
        } else {
            console.log(`Documents upserted successfully`);
        }
    } catch (error) {
        console.error(`An error occurred during bulk upsert: ${error}`);
        console.error('Stack trace:', error.stack);
    }
}

// 语意查询
// 执行语义搜索
async function semanticSearch(indexName, vector, size = 5) {
    await initClient();

    try {
        const response = await client.search({
            index: indexName,
            body: {
                query: {
                    knn: {
                        description_vector: {
                            vector,
                            k: size
                        }
                    }
                },
                _source: {
                    excludes: ['description_vector']
                },
                size
            }
        });

        return response.body.hits.hits;
    } catch (error) {
        console.error(`An error occurred during semantic search: ${error}`);
        console.error(error.stack);
    }

    return [];
}

async function deleteIndex(indexName) {
    await initClient();

    try {
        const { body: indexExists } = await client.indices.exists({ index: indexName });
        if (indexExists) {
            await client.indices.delete({ index: indexName });
            console.log(`Index ${indexName} deleted successfully`);
        } else {
            console.log(`Index ${indexName} does not exist`);
        }
    } catch (error) {
        console.error(`An error occurred while deleting the index: ${error}`);
    }
}

async function upsertPathMetaRag(name, path, description) {
    const indexName = PATH_META_DATA;
    await createIndex(indexName);
    const description_vector = await invokeTitanEmbedding(description);

    const operations = [];
    operations.push(
        { update: { _index: indexName, _id: path } },
        {
            doc:
            {
                name,
                path,
                description,
                description_vector
            },
            doc_as_upsert: true
        }
    );
    await upsertDocuments(operations);
}


async function upsertClassMetaRag(name, path, description) {
    const indexName = CLASS_META_DATA;
    await createIndex(indexName);
    const description_vector = await invokeTitanEmbedding(description);

    const operations = [];
    operations.push(
        { update: { _index: indexName, _id: `${path}/${name}` } },
        {
            doc:
            {
                name,
                path,
                description,
                description_vector
            },
            doc_as_upsert: true
        }
    );
    await upsertDocuments(operations);
}

/**
 * Path/ClassName is the unique id.
 */
async function upsertClassMetaRagFromDocument(documents) {
    const indexName = CLASS_META_DATA;
    await createIndex(indexName);

    const operations = [];
    for (const classObj of documents) {
        if (!classObj.Class || !classObj.Class.Properties || !classObj.Class.Path || !classObj.Class.Name) {
            continue;
        }
        const descriptionObj = classObj.Class.Properties.find(prop => 'description' in prop);
        const description = descriptionObj ? descriptionObj.description : classObj.Class.Name;
        const description_vector = await invokeTitanEmbedding(description);

        operations.push(
            { update: { _index: indexName, _id: `${classObj.Class.Path}/${classObj.Class.Name}` } },
            {
                doc:
                {
                    name: classObj.Class.Name,
                    path: classObj.Class.Path,
                    description,
                    description_vector
                },
                doc_as_upsert: true
            }
        );
    }

    if (operations.length > 0) {
        await upsertDocuments(operations);
    }
}

/**
 * 
 *  Path/ClassName/FunctionName is the unique id.
 */
async function upsertFunctionMetaRagFromDocument(documents) {
    const indexName = FUNC_META_DATA;
    await createIndex(indexName);

    for (let i = 0; i < documents.length; i++) {
        const classObj = documents[i];
        const fullClassName = `${classObj.Class.Path}/${classObj.Class.Name}`;

        if (!classObj.Class.Path || !classObj.Class.Name) {
            continue;
        }

        // Look through all the functions within the class.
        const operations = [];
        for (const functionObj of classObj.Functions) {
            if (!functionObj.Properties || !functionObj.Name) {
                continue;
            }

            const descriptionObj = functionObj.Properties.find(prop => 'description' in prop);
            const description = descriptionObj ? descriptionObj.description : functionObj.Name;
            const description_vector = await invokeTitanEmbedding(description);

            operations.push(
                { update: { _index: indexName, _id: `${fullClassName}/${functionObj.Name}` } },
                {
                    doc:
                    {
                        name: functionObj.Name,
                        path: fullClassName,
                        description,
                        description_vector
                    },
                    doc_as_upsert: true
                }
            );
        }

        if (operations.length > 0) {
            await upsertDocuments(operations);
        }
    };
}

module.exports = {
    semanticSearch,
    upsertClassMetaRagFromDocument,
    upsertFunctionMetaRagFromDocument,
    upsertPathMetaRag,
    upsertClassMetaRag,
    deleteIndex
};

// Test the semantics Search.
// async function main() {
//     const indexName = 'test_index';
//     await createIndex(indexName);

//     const part1Vector = await generateVector('I am hungry.');
//     const part2Vector = await generateVector('I want to study.');

//     const operations = [];
//     operations.push(
//         { update: { _index: indexName, _id: 'part1_id' } },
//         {
//             doc:
//             {
//                 description_vector: part1Vector,
//                 description: 'I am hungry.'
//             },
//             doc_as_upsert: true
//         }
//     );
//     operations.push(
//         { update: { _index: indexName, _id: 'part2_id' } },
//         {
//             doc:
//             {
//                 description_vector: part2Vector,
//                 description: 'I want to study.'
//             },
//             doc_as_upsert: true
//         }
//     );

//     await upsertDocuments(operations);


//     const question = await generateVector('我肚子饿了.');
//     const result = await semanticSearch(indexName, question);
//     console.log(result);

// }

// main();