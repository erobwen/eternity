import { getWorld as getCausalityWorld } from  "causalityjs";
import { argumentsToArray, configSignature, mergeInto } from "./lib/utility.js";
import { objectlog } from "./lib/objectlog.js";
import { createDatabase } from "./mockMongoDB.js";
import { createActivityList } from "./lib/activityList.js";

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

    persistentDbId: null,
    updateDbId: null,
    collectionDbId: null,
    gcState: null,
  }

  const world = {};
  const mockMongoDB = createDatabase(JSON.stringify(configuration)); 
  const objectWorld = getCausalityWorld({});

  state.activityList = createActivityList((object) => {
    if (typeof(object.causality.isUnforgotten) !== 'undefined') {
      return false; 
    }
    
    if (typeof(object.causality.dbImage) === 'undefined') {
      return false;       
    }
    return true;
    // Consider?: Add and remove to activity list as we persist/unpersist this object.... ??? 
  });

  const imageWorld = getCausalityWorld({

    onWriteGlobal: (handler, target) => {
      ensureInitialized(handler);
      state.activityList.registerActivity(handler.meta)
      return true; 
    },
    onReadGlobal: (handler, target) => {
      ensureInitialized(handler); 
      state.activityList.registerActivity(handler.meta)
      return true;
      // handler.meta
      // handler.target
      // handler.proxy
    }, 
    onEventGlobal: event => {
      state.imageEvents.push(event);
    },
  });
  

  function getMeta


  /************************************************************************
   *
   *   Initializer
   *
   ************************************************************************/

  function ensureInitialized(handler) {
    if (handler.meta.initializer) {
      const initializer = handler.meta.initializer;
      delete handler.meta.initializer;
      initializer(handler.proxy);
    }
  }

  /****************************************************
  *
  ***************************************************/

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
    if ((await mockMongoDB.getRecordsCount()) === 0) {
      // Initialize empty database
      [state.persistentDbId, state.updateDbId, state.collectionDbId] = 
        await Promise.all([
          mockMongoDB.saveNewRecord({ name : "Persistent", _eternityIncomingCount : 42}),
          mockMongoDB.saveNewRecord({ name: "updatePlaceholder", _eternityIncomingCount : 42}),
          mockMongoDB.saveNewRecord({ name : "garbageCollection", _eternityIncomingCount : 42})]);

      console.log(state.persistentDbId)
      console.log(state.updateDbId)
      console.log(state.collectionDbId)
      state.gcState = createImagePlaceholderFromDbId(state.collectionDbId);
      initializeGcState(gcState);
    } else {
      // Reconnect existing database
      state.persistentDbId = 0;
      state.updateDbId = 1;
      state.collectionDbId = 2;
      
      state.gcState = createImagePlaceholderFromDbId(state.collectionDbId);
    }
    world.persistent = await createObjectPlaceholderFromDbId(state.persistentDbId);
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