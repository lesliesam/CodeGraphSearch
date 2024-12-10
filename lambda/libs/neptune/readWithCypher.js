const axios = require('axios');
const {
    TYPE_PATH,
    TYPE_CLASS,
    TYPE_FUNCTION,
    EDGE_CONTAINS,
    EDGE_CALL,
    EDGE_EXTENDS
} = require('../constants')

require('dotenv').config();
const NEPTUNE_ENDPOINT = `https://${process.env.PRIVATE_NEPTUNE_DNS}:${process.env.PRIVATE_NEPTUNE_PORT}`

const neptuneClient = axios.create({
    baseURL: NEPTUNE_ENDPOINT,
    headers: {
        'Content-Type': 'application/x-www-form-urlencoded'
    }
});

async function executeOpenCypherQuery(query) {
    try {
        const response = await neptuneClient.post('/openCypher', `query=${encodeURIComponent(query)}`);
        return response.data;
    } catch (error) {
        console.error('Error executing query:', error.response ? error.response.data : error.message);
        throw error;
    }
}

async function getFunctionCaller(className, funcName) {
    console.log(`className: ${className}, funcName: ${funcName}`);
    const query = `
        MATCH (f:${TYPE_FUNCTION} {name: '${funcName}', full_classname: '${className}'})<-[:${EDGE_CALL}]-(callee:${TYPE_FUNCTION})
        RETURN DISTINCT callee.name, callee.full_classname
        LIMIT 20
    `;

    try {
        const response = await executeOpenCypherQuery(query);
        return response.results;
    } catch (error) {
        console.error('Error executing query:', error);
        throw error;
    }
}

async function getFunctionCallee(className, funcName) {
    const query = `
        MATCH (f:${TYPE_FUNCTION} {name: '${funcName}', full_classname: '${className}'})-[:${EDGE_CALL}]->(callee:${TYPE_FUNCTION})
        RETURN DISTINCT callee.name, callee.full_classname
        LIMIT 20
    `;

    try {
        const response = await executeOpenCypherQuery(query);
        return response.results;
    } catch (error) {
        console.error('Error executing query:', error);
        throw error;
    }
}

async function getRelatedClasses(path, className) {
    const query = `
        MATCH (c:${TYPE_CLASS} {path: '${path}', name: '${className}'})
        RETURN  c.name AS name, c.path AS path, c.file_extension as file_extension

        UNION

        MATCH (c:${TYPE_CLASS} {path: '${path}', name: '${className}'})
        MATCH (c)-[:${EDGE_EXTENDS}]->(pc:${TYPE_CLASS})
        RETURN DISTINCT pc.name AS name, pc.path AS path, pc.file_extension as file_extension

        UNION

        MATCH (c:${TYPE_CLASS} {path: '${path}', name: '${className}'})
        MATCH (c)<-[:${EDGE_EXTENDS}]-(sc:${TYPE_CLASS})
        RETURN DISTINCT sc.name AS name, sc.path AS path, sc.file_extension as file_extension

        UNION

        MATCH (c:${TYPE_CLASS} {path: '${path}', name: '${className}'})
        MATCH (c)-[:${EDGE_CONTAINS}]->(f:${TYPE_FUNCTION})
        MATCH (f)-[:${EDGE_CALL}*1..2]->(callee:${TYPE_FUNCTION})
        MATCH (callee) <-[:${EDGE_CONTAINS}]-(rc:${TYPE_CLASS})
        RETURN DISTINCT rc.name AS name, rc.path AS path, rc.file_extension as file_extension
        LIMIT 20

        UNION

        MATCH (c:${TYPE_CLASS} {path: '${path}', name: '${className}'})
        MATCH (c)-[:${EDGE_CONTAINS}]->(f:${TYPE_FUNCTION})
        MATCH (f)<-[:${EDGE_CALL}*1..2]-(caller:${TYPE_FUNCTION})
        MATCH (caller) <-[:${EDGE_CONTAINS}]-(rc:${TYPE_CLASS})
        RETURN DISTINCT rc.name AS name, rc.path AS path, rc.file_extension as file_extension
        LIMIT 20
    `;

    try {
        const response = await executeOpenCypherQuery(query);
        console.log(response.results);
        return response.results;
    } catch (error) {
        console.error('Error executing query:', error);
        throw error;
    }
}


module.exports = { executeOpenCypherQuery, getFunctionCaller, getFunctionCallee, getRelatedClasses }

// // Test
// const query = `
//   MATCH (:${TYPE_FUNCTION} {name: 'ok', full_classname: 'src/controller/AbstractController'})<-[:${EDGE_CALL}]-(f:${TYPE_FUNCTION})
//   MATCH (f)<-[:${EDGE_CONTAINS}]-(c:${TYPE_CLASS})
//   RETURN DISTINCT c.name, c.path
//   LIMIT 10
// `;

// executeOpenCypherQuery(query)
//     .then(result => {
//         console.log('Query result:', JSON.stringify(result));
//         // 处理结果
//     })
//     .catch(error => {
//         console.error('Error:', error);
//     });