const gremlin = require('gremlin');

const __ = gremlin.process.statics;
const traversal = gremlin.process.AnonymousTraversalSource.traversal;
const DriverRemoteConnection = gremlin.driver.DriverRemoteConnection;

require('dotenv').config();
const dbURL = `wss://${process.env.PRIVATE_NEPTUNE_DNS}:${process.env.PRIVATE_NEPTUNE_PORT}/gremlin`;
const g = traversal().withRemote(new DriverRemoteConnection(dbURL));

async function deleteAll() {
    await g.V().drop().iterate();
    console.log("Delete all.");
}

module.exports = { deleteAll }