const gremlin = require('gremlin');
const {
    process: {
        merge,
        direction,
        cardinality,
        t: {
            id,
            label
        }
    }
} = require('gremlin');
const {
    TYPE_PATH,
    TYPE_CLASS,
    TYPE_FUNCTION,
    EDGE_CONTAINS,
    EDGE_CALL,
    EDGE_EXTENDS
} = require('../constants')
const { findFiles } = require('../utils/utils');
const fs = require('fs');
const { upsertFunctionMetaRagFromDocument, upsertClassMetaRagFromDocument } = require('../embedding/codeMetaRag');
const __ = gremlin.process.statics;
const traversal = gremlin.process.AnonymousTraversalSource.traversal;
const DriverRemoteConnection = gremlin.driver.DriverRemoteConnection;

require('dotenv').config();
const dbURL = `wss://${process.env.PRIVATE_NEPTUNE_DNS}:${process.env.PRIVATE_NEPTUNE_PORT}/gremlin`;
const g = traversal().withRemote(new DriverRemoteConnection(dbURL));


/**
 * Store the {fullPath, pathObj} pair
 */
const mPathObjMap = new Map();

/**
 * Store the {path/class_name, classObj} pair
 */
const mClassObjMap = new Map();
/**
 * Store the {fullClassName/function_name, functionObj} pair
 */
const mFunctionObjMap = new Map();


async function processCodeMeta(pathRoot) {
    console.log(`Root path at: ${pathRoot}`);
    const files = await findFiles(pathRoot);
    for (const file of files) {
        console.log(`Loading file: ${file}`);
        const fileContent = fs.readFileSync(file, 'utf8');
        try {
            await loadFile(JSON.parse(fileContent));
        } catch (error) {
            console.error(`An error occurred during bulk upsert: ${error}`);
        }
    }
}


async function loadFile(classObjList) {
    // If type of classObjList is Array
    if (!Array.isArray(classObjList)) {
        classObjList = new Array(classObjList);
    }
    await upsertClassGraph(classObjList);

    // Save the class & function rag.
    await upsertClassMetaRagFromDocument(classObjList);
    await upsertFunctionMetaRagFromDocument(classObjList);
}

async function upsertClassGraph(classObjList) {
    for (const classObj of classObjList) {
        if (!classObj.Class || !classObj.Class.Name || !classObj.Class.Path) {
            continue;
        }
        const fullClassName = `${classObj.Class.Path}/${classObj.Class.Name}`;
        console.log(`Processing on Class: ${fullClassName}`);

        // Upsert the Path Obj.
        await upsertPath(classObj.Class.Path);

        // Upsert the class Obj.
        const classPropertyMap = classObj.Class.Properties ? new Map(classObj.Class.Properties.flatMap(obj => Object.entries(obj))) : new Map();
        await upsertClass(classObj.Class.Name, classObj.Class.Path, classPropertyMap);
        await upsertEdge(EDGE_CONTAINS, mPathObjMap.get(classObj.Class.Path), mClassObjMap.get(fullClassName));
        if (classPropertyMap.get("extends") != null) {
            const parentClass = classPropertyMap.get("extends");
            await upsertEdge(EDGE_EXTENDS, mClassObjMap.get(fullClassName), mClassObjMap.get(parentClass));
        }

        // Upsert the function Obj and upsert the edge with the class.
        for (const functionObj of classObj.Functions) {
            console.log(`Processing on functions: ${functionObj.Name}`);
            const functionPropertyMap = functionObj.Properties ? new Map(functionObj.Properties.flatMap(obj => Object.entries(obj))) : new Map();
            await upsertFunction(functionObj.Name, fullClassName, functionPropertyMap);
            await upsertEdge(EDGE_CONTAINS, mClassObjMap.get(fullClassName), mFunctionObjMap.get(`${fullClassName}/${functionObj.Name}`));
        }

        // Upsert the inner dependencies.
        for (const call of classObj.InnerDependencies) {
            console.log(`Processing on inner dependency from ${fullClassName}/${call.From} to ${fullClassName}/${call.To}`);
            await upsertEdge(EDGE_CALL, mFunctionObjMap.get(`${fullClassName}/${call.From}`), mFunctionObjMap.get(`${fullClassName}/${call.To}`));
        }

        // Upsert the outer dependencies.
        for (const call of classObj.OuterDependencies) {
            if (!fullClassName || !call || !call.From || !call.To || !call.To.Path || !call.To.ClassName || !call.To.FunctionName) {
                continue;
            }
            console.log(`Processing on outer dependency from ${fullClassName}/${call.From} to ${call.To.Path}/${call.To.ClassName}/${call.To.FunctionName}`);
            await upsertPath(call.To.Path);
            await upsertClass(call.To.ClassName, call.To.Path, new Map());
            await upsertEdge(EDGE_CONTAINS, mPathObjMap.get(call.To.Path), mClassObjMap.get(`${call.To.Path}/${call.To.ClassName}`));
            await upsertFunction(call.To.FunctionName, `${call.To.Path}/${call.To.ClassName}`, new Map());
            await upsertEdge(EDGE_CONTAINS, mClassObjMap.get(`${call.To.Path}/${call.To.ClassName}`), mFunctionObjMap.get(`${call.To.Path}/${call.To.ClassName}/${call.To.FunctionName}`));
            await upsertEdge(EDGE_CALL, mFunctionObjMap.get(`${fullClassName}/${call.From}`), mFunctionObjMap.get(`${call.To.Path}/${call.To.ClassName}/${call.To.FunctionName}`));
        }
    }
}


async function upsertPath(fullPath) {
    const paths = fullPath.split('/');

    let parentPath = '';
    let currentPath = '';
    for (let i = 0; i < paths.length; i++) {
        const name = paths[i];
        currentPath += `${name}`;
        if (!name || name.length == 0) {
            continue;
        }
        let result = g.V().hasLabel(TYPE_PATH).has('name', name).fold().coalesce(
            __.unfold(),
            __.addV(TYPE_PATH).
                property(cardinality.single, 'name', name).
                property(cardinality.single, 'full_path', currentPath)
        )
        result = await result.next();
        mPathObjMap.set(currentPath, result.value);

        if (parentPath.length > 0) {
            upsertEdge(EDGE_CONTAINS, mPathObjMap.get(parentPath), mPathObjMap.get(currentPath));
        }
        parentPath = currentPath;
        currentPath += '/';
    }
}

async function upsertPathDescription(name, fullPath, description) {
    console.log(`Upserting path description: ${name}, ${fullPath}`);
    await g.V().hasLabel(TYPE_PATH).has('full_path', fullPath).fold().coalesce(
        __.unfold().
            property(cardinality.single, 'description', description),
        __.addV(TYPE_PATH).
            property(cardinality.single, 'name', name).
            property(cardinality.single, 'full_path', fullPath).
            property(cardinality.single, 'description', description)
    ).next();
}

async function upsertClass(name, path, params = new Map()) {
    let result = g.V().hasLabel(TYPE_CLASS).has('name', name).has('path', path).fold().coalesce(
        __.unfold(),
        __.addV(TYPE_CLASS).
            property(cardinality.single, 'name', name).
            property(cardinality.single, 'path', path)
    )
    for (const [key, value] of params) {
        result = result.property(cardinality.single, key, value);
    }
    result = await result.next();
    mClassObjMap.set(`${path}/${name}`, result.value);
}

async function upsertFunction(name, fullClassName, params = new Map()) {
    let result = g.V().hasLabel(TYPE_FUNCTION).has('name', name).has('full_classname', fullClassName).fold().coalesce(
        __.unfold(),
        __.addV(TYPE_FUNCTION).
            property(cardinality.single, 'name', name).
            property(cardinality.single, 'full_classname', fullClassName)
    )
    for (const [key, value] of params) {
        result = result.property(cardinality.single, key, value);
    }
    result = await result.next();
    mFunctionObjMap.set(`${fullClassName}/${name}`, result.value);
}

async function upsertEdge(type, fromObj, toObj) {
    if (!fromObj || !toObj) return;
    const result = await g.V().hasId(fromObj.id).coalesce(
        __.outE(type).where(__.inV().hasId(toObj.id)),
        __.addE(type).to(__.V().hasId(toObj.id))
    ).next();
}

module.exports = { processCodeMeta, upsertPathDescription }