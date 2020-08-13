import { getWorld as getCausalityWorld } from  "causalityjs";
import { argumentsToArray, configSignature, mergeInto } from "./lib/utility.js";
import { objectlog } from "./lib/objectlog.js";
import { createDatabase } from "./mockMongoDB.js";

const defaultObjectlog = objectlog;

const defaultConfiguration = {
  maxNumberOfLoadedObjects : 10000,
  // twoPhaseComit : true,
  causalityConfiguration : {},
  allowPlainObjectReferences : true
}
    
function createWorld(configuration) {
  const world = {};
  const mockMongoDB = createDatabase(JSON.stringify(configuration)); 
  const objectWorld = getCausalityWorld({});
  const imageWorld = getCausalityWorld({});
  
  let persistentDbId;
  let updateDbId;
  let collectionDbId;

  const state = {
    peekedAtDbRecords: {},
    dbIdToDbImageMap: {},
    recordingImageChanges: true,
  }

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

  async function createImagePlaceholderFromDbId(dbId) {
    // log("NOT HERESSSSS!");
    // log("createImagePlaceholderFromDbId: " + dbId);
    let placeholder;
    state.recordingImageChanges = false; 
    // imageWorld.state.emitEventPaused++;
    // imageWorld.pulse(function() { // Pulse here to make sure that dbId is set before post image pulse comence.
      let record = peekAtRecord(dbId);
      // console.log(typeof(record._eternityImageClass) !== 'undefined' ? record._eternityImageClass : 'Object');
      placeholder = imageWorld.create(typeof(record._eternityImageClass) !== 'undefined' ? record._eternityImageClass : 'Object');
      placeholder.const.isObjectImage = typeof(record._eternityIsObjectImage) !== 'undefined' ? record._eternityIsObjectImage : false;
      placeholder.const.loadedIncomingReferenceCount = 0;
      placeholder.const.dbId = dbId;
      placeholder.const.serializedMongoDbId = imageWorld.idExpression(dbId);
      imageIdToImageMap[placeholder.const.id] = placeholder;
      placeholder.const.initializer = imageFromDbIdInitializer;
    // });
    // imageWorld.state.emitEventPaused--;
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