const gremlin = require('gremlin');
const __ = gremlin.process.statics;
const traversal = gremlin.process.AnonymousTraversalSource.traversal;
const DriverRemoteConnection = gremlin.driver.DriverRemoteConnection;

require('dotenv').config();
const dbURL = `wss://${process.env.PRIVATE_NEPTUNE_DNS}:${process.env.PRIVATE_NEPTUNE_PORT}/gremlin`;
const g = traversal().withRemote(new DriverRemoteConnection(dbURL));

async function listAll(limit = 20) {
    return await g.V().limit(limit).elementMap().toList();
};

module.exports = { listAll }