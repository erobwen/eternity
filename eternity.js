import getWorld from causalityjs

import { argumentsToArray, configSignature, mergeInto } from "./lib/utility.js";
import { objectlog } from "./lib/objectlog.js";
const defaultObjectlog = objectlog;
import { createCachingFunction } from "./lib/caching.js";
import { defaultDependencyInterfaceCreator } from "./lib/defaultDependencyInterface.js";

const mockMongoDB = require("./mockMongoDB.js")(JSON.stringify(configuration)); 

const defaultConfiguration = {
  maxNumberOfLoadedObjects : 10000,
  // twoPhaseComit : true,
  causalityConfiguration : {},
  allowPlainObjectReferences : true
}
    
function createWorld(configuration) {
  const world = {};
  let objectWorld = getWorld({});
  let imageWorld = getWorld({});

  let peekedAtDbRecords = {};

  async function peekAtRecord(dbId) {
    // flushToDatabase(); TODO... really have here??
    if (typeof(peekedAtDbRecords[dbId]) === 'undefined') {
      peekedAtDbRecords[dbId] = await mockMongoDB.getRecord(dbId);
    }
    return peekedAtDbRecords[dbId];
  }

  async function createObjectPlaceholderFromDbId(dbId) {
    let placeholder = objectWorld.create(await peekAtRecord(dbId)._eternityObjectClass);
    placeholder.const.dbId = dbId;
    placeholder.const.name = peekAtRecord(dbId).name;
    // log("createObjectPlaceholderFromDbId: " + dbId + ", " + placeholder.const.name);
    placeholder.const.initializer = objectFromIdInitializer;
    return placeholder;
  }

  function unloadAllAndClearMemory() {
    // flushToDatabase();
    objectWorld.state.nextObjectId = 1;
    imageWorld.state.nextObjectId = 1;
    delete world.persistent;
    dbIdToDbImageMap = {};
    setupDatabase();
  }
    

  async function setupDatabase() {
    // log("setupDatabase");
    imageWorld.pulse(function() {         

      // Clear peek at cache
      peekedAtDbRecords = {};
      
      // if (typeof(world.persistent) === 'undefined') {
      if (mockMongoDB.getRecordsCount() === 0) {
        // log("setup from an empty database...");
        
        // Persistent root object
        persistentDbId = await mockMongoDB.saveNewRecord({ name : "Persistent", _eternityIncomingCount : 1});

        // Update placeholder
        updateDbId = await mockMongoDB.saveNewRecord({ name: "updatePlaceholder", _eternityIncomingCount : 1});
        // NOW
        // Garbage collection state.
        collectionDbId = await mockMongoDB.saveNewRecord({ name : "garbageCollection", _eternityIncomingCount : 1});
        gcState = createImagePlaceholderFromDbId(collectionDbId);
        // throw new Error("foo");
        initializeGcState(gcState);
      } else {
        // // Setup ids for basics.
        // let counter = 0;
        // persistentDbId = counter++;
        // if (configuration.twoPhaseComit) updateDbId = counter++;
        // collectionDbId = counter++;
        
        // gcState = createImagePlaceholderFromDbId(collectionDbId);
      }
      world.persistent = await createObjectPlaceholderFromDbId(persistentDbId);
    });
    return world.persistent;
  }

  world.setupDatabase = setupDatabase;
  return world;
}

export function getWorld(configuration) {
  if(!configuration) configuration = {};
  configuration = {...defaultConfiguration, ...configuration};
  const signature = configSignature(configuration);
  
  if (typeof(worlds[signature]) === 'undefined') {
    worlds[signature] = createWorld(configuration);
  }
  return worlds[signature];
}                                                                   

export default getWorld;
