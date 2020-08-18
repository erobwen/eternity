import { getWorld as getCausalityWorld } from  "causalityjs";
import { argumentsToArray, configSignature, mergeInto } from "./lib/utility.js";
import { objectlog } from "./lib/objectlog.js";
import { createDatabase } from "./mockMongoDB.js";

const defaultObjectlog = objectlog;

const defaultConfiguration = {
  maxNumberOfLoadedObjects : 10000,
  // twoPhaseComit : true,
  causalityConfiguration : {},
  allowPlainObjectReferences : true,
  classRegistry: {}
}
    
function createWorld(configuration) {
  const state = {
    imageEvents: [],
    peekedAtDbRecords: {},
    dbIdToDbImageMap: {},
    imageIdToImageMap: {},
    recordingImageChanges: true,
  }

  const world = {};
  const mockMongoDB = createDatabase(JSON.stringify(configuration)); 
  const objectWorld = getCausalityWorld({});
  const imageWorld = getCausalityWorld({
    onEventGlobal: event => {
      state.imageEvents.push(event);
    }
    onReadGlobal: (handler, target) => {
      // handler.meta
      // handler.target
      // handler.proxy
      
    }
  });
  
  let persistentDbId;
  let updateDbId;
  let collectionDbId;


  function flushToDatabase() {
    trace.flush && log("flushToDatabase: " + pendingObjectChanges.length);
    trace.flush && log(pendingObjectChanges, 3);
    if (pendingObjectChanges.length > 0) {
      while (pendingObjectChanges.length > 0) {
        pushToDatabase();
      }
    } else {        
      flushImageToDatabase();     
    }
    unloadAndForgetObjects();
  }
    
  // Note: causality.persistent is replace after an unload... 
  async function unloadAll() {
    flushToDatabase();
    objectWorld.state.nextObjectId = 1;
    imageWorld.state.nextObjectId = 1;
    delete world.persistent;
    state.dbIdToDbImageMap = {};
    setupDatabase();
  }
    
  async function unloadAllAndClearDatabase() {
    flushToDatabase();
    mockMongoDB.clearDatabase();
    unloadAll();
  }

  async function peekAtRecord(dbId) {
    // flushToDatabase(); TODO... really have here??
    if (typeof(state.peekedAtDbRecords[dbId]) === 'undefined') {
      state.peekedAtDbRecords[dbId] = await mockMongoDB.getRecord(dbId);
    }
    return state.peekedAtDbRecords[dbId];
  }

  async function createObjectPlaceholderFromDbId(dbId) {
    let placeholder = objectWorld.create(await peekAtRecord(dbId)._eternityObjectClass);
    placeholder.const.dbId = dbId;
    placeholder.const.name = peekAtRecord(dbId).name;
    // log("createObjectPlaceholderFromDbId: " + dbId + ", " + placeholder.const.name);
    placeholder.const.initializer = objectFromIdInitializer;
    return placeholder;
  }


  function createImage(source, buildId) {
    let createdTarget;
    if (typeof(source) === 'undefined') {
        // Create from nothing
        createdTarget = {};
    } else if (typeof(source) === 'function') {
      // Create from initializer
      initializer = source; 
      createdTarget = {};
    } else if (typeof(source) === 'string') {
      // Create from a string
      if (source === 'Array') {
        createdTarget = []; // On Node.js this is different from Object.create(eval("Array").prototype) for some reason... 
      } else if (source === 'Object') {
        createdTarget = {}; // Just in case of similar situations to above for some Javascript interpretors... 
      } else {
        let classOrPrototype = configuration.classRegistry[source];
        if (typeof(classOrPrototype) !== 'function') {
          throw new Error("No class found: " +  createdTarget);
        }
        createdTarget = new configuration.classRegistry[createdTarget]();
      }
    }
    return imageWorld.create(createdTarget, buildId);
  }

  function idExpression(dbId) {
    return "_db_id_" + dbId
  }

  async function createImagePlaceholderFromDbId(dbId) {
    let placeholder;
    state.recordingImageChanges = false; 
    let record = peekAtRecord(dbId);

    placeholder = createImage(typeof(record._eternityImageClass) !== 'undefined' ? record._eternityImageClass : 'Object'); // Note: generates an event

    placeholder.causality.isObjectImage = typeof(record._eternityIsObjectImage) !== 'undefined' ? record._eternityIsObjectImage : false;
    placeholder.causality.loadedIncomingReferenceCount = 0;
    placeholder.causality.dbId = dbId;
    placeholder.causality.serializedMongoDbId = idExpression(dbId);
    state.imageIdToImageMap[placeholder.causality.id] = placeholder;
    // placeholder.causality.initializer = imageFromDbIdInitializer; onReadGlobal

    state.recordingImageChanges = false; 
    return placeholder;
  }

  async function setupDatabase() {
    // // log("setupDatabase");
    // imageWorld.pulse(function() {         

    // Clear peek at cache
    state.peekedAtDbRecords = {};
    
    // if (typeof(world.persistent) === 'undefined') {
    if (mockMongoDB.getRecordsCount() === 0) {
      // Initialize empty database
      [persistentDbId, updateDbId, collectionDbId] = 
        await Promise.all([
          mockMongoDB.saveNewRecord({ name : "Persistent", _eternityIncomingCount : 42}),
          mockMongoDB.saveNewRecord({ name: "updatePlaceholder", _eternityIncomingCount : 42}),
          mockMongoDB.saveNewRecord({ name : "garbageCollection", _eternityIncomingCount : 42})]);

      gcState = createImagePlaceholderFromDbId(collectionDbId);
      initializeGcState(gcState);
    } else {
      // Reconnect existing database
      persistentDbId = 0;
      updateDbId = 1;
      collectionDbId = 2;
      
      gcState = createImagePlaceholderFromDbId(collectionDbId);
    }
    world.persistent = await createObjectPlaceholderFromDbId(persistentDbId);
  }

  Object.assign(world, {
    setupDatabase,
    unloadAll, 
    unloadAllAndClearDatabase, 
    ...objectWorld
  });
  return world;
}

const worlds = {};

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