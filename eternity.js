import { getWorld as getCausalityWorld } from  "causalityjs";
import { argumentsToArray, configSignature, mergeInto } from "./lib/utility.js";
import { objectlog } from "./lib/objectlog.js";
import { createDatabase } from "./mockMongoDB.js";
import { setupActivityList } from "./lib/activityList.js";
import { setupGC } from "./lib/gc.js";


const defaultObjectlog = objectlog;

const defaultConfiguration = {
  objectMetaProperty: "eternity",
  maxNumberOfLoadedObjects : 10000,
  // twoPhaseComit : true,
  causalityConfiguration : {},
  allowPlainObjectReferences : true,
  classRegistry: {}
}
    
function createWorld(configuration) {
  const state = {
    objectEvents: [],
    imageEvents: [],
    peekedAtDbRecords: {},
    dbIdToDbImageMap: {},
    imageIdToImageMap: {}, 
    recordingImageChanges: true,

    persistentDbId: null,
    updateDbId: null,
    collectionDbId: null,
    gcStateImage: null,
    gc: null, 

    activityList: setupActivityList((object) => {
      if (typeof(object[meta].isUnforgotten) !== 'undefined') {
        return false; 
      }
      
      if (typeof(object[meta].dbImage) === 'undefined') {
        return false;       
      }
      return true;
      // Consider?: Add and remove to activity list as we persist/unpersist this object.... ??? 
    })
  }

  const meta = configuration.objectMetaProperty;

  const world = {};
  const mockMongoDB = createDatabase(JSON.stringify(configuration)); 
  const objectWorld = getCausalityWorld({
    objectMetaProperty: meta,
    onWriteGlobal: (handler, target) => {
      state.activityList.registerActivity(handler.meta)
      return true; 
    },
    onReadGlobal: (handler, target) => {
      state.activityList.registerActivity(handler.meta)
      return true;
      // handler.meta
      // handler.target
      // handler.proxy
    }, 
    onEventGlobal: event => {
      state.objectEvents.push(event);
    },
  });

  const imageWorld = getCausalityWorld({
    objectMetaProperty: meta,
    onWriteGlobal: (handler, target) => {
      return true; 
    },
    onReadGlobal: (handler, target) => {
      return true; 
    }, 
    onEventGlobal: event => {
      state.imageEvents.push(event);
    },
  });


  function loadFromDbIdToObject(object) {
    const dbId = object[meta].dbId;

    // Ensure there is an image.
    if (typeof(object[meta].dbImage) === 'undefined') {
      // log("create placeholder for image:" + dbId);
      const placeholder = getDbImage(dbId);
      connectObjectWithDbImage(object, placeholder);
    }
    loadFromDbImageToObject(object);
  }

  function getDbImage(dbId) {
    if (typeof(state.dbIdToDbImageMap[dbId]) === 'undefined') {
      state.dbIdToDbImageMap[dbId] = createImagePlaceholderFromDbId(dbId);
    }
    // log("placeholder keys:");
    // printKeys(dbIdToDbImageMap);
    return state.dbIdToDbImageMap[dbId];
  }
  
  function connectObjectWithDbImage(object, dbImage) {
    pinImage(dbImage);
    imageCausality.blockInitialize(function() {
      // log("connectObjectWithDbImage: " + dbImage[meta].dbId);
      dbImage[meta].correspondingObject = object; 
      dbImage[meta].isObjectImage = true;       
    });
    objectCausality.blockInitialize(function() {
      object[meta].dbImage = dbImage;
    });
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

  function createTarget(className) {
      // Create from a string
        if (className === 'Array') {
          createdTarget = []; // On Node.js this is different from Object.create(eval("Array").prototype) for some reason... 
        } else if (className === 'Object') {
          createdTarget = {}; // Just in case of similar situations to above for some Javascript interpretors... 
        } else {
          let classOrPrototype = classRegistry[className];
          if (typeof(classOrPrototype) !== 'function') {
            throw new Error("No class found: " +  createdTarget);
          }
          createdTarget = new classRegistry[createdTarget]();
        }
  }


  async function createObjectPlaceholderFromDbId(dbId, className) {
    let placeholder = objectWorld.create(createTarget(className));
    placeholder[meta].dbId = dbId;
    placeholder[meta].name = peekAtRecord(dbId).name;
    placeholder.loaded = false;
    return placeholder;
  }


  // function createImage(source, buildId) {
  //   let createdTarget;
  //   if (typeof(source) === 'undefined') {
  //       // Create from nothing
  //       createdTarget = {};
  //   } else if (typeof(source) === 'function') {
  //     // Create from initializer
  //     initializer = source; 
  //     createdTarget = {};
  //   } else if (typeof(source) === 'string') {
  //     // Create from a string
  //     if (source === 'Array') {
  //       createdTarget = []; // On Node.js this is different from Object.create(eval("Array").prototype) for some reason... 
  //     } else if (source === 'Object') {
  //       createdTarget = {}; // Just in case of similar situations to above for some Javascript interpretors... 
  //     } else {
  //       let classOrPrototype = configuration.classRegistry[source];
  //       if (typeof(classOrPrototype) !== 'function') {
  //         throw new Error("No class found: " +  createdTarget);
  //       }
  //       createdTarget = new configuration.classRegistry[createdTarget]();
  //     }
  //   }
  //   return imageWorld.create(createdTarget, buildId);
  // }

  function idExpression(dbId) {
    return "_db_id_" + dbId
  }

  async function createImagePlaceholderFromDbId(dbId, className) {
    let placeholder;
    state.recordingImageChanges = false; 
    let record = peekAtRecord(dbId);

    placeholder = createImage(className); // Note: generates an event

    placeholder[meta].isObjectImage = typeof(record._eternityIsObjectImage) !== 'undefined' ? record._eternityIsObjectImage : false;
    placeholder[meta].loadedIncomingReferenceCount = 0;
    placeholder[meta].dbId = dbId;
    placeholder[meta].serializedMongoDbId = idExpression(dbId);
    state.imageIdToImageMap[placeholder[meta].id] = placeholder;
    placeholder[meta].initializer = loadFromDbIdToImage;

    state.recordingImageChanges = false; 
    return placeholder;
  }

  async function loadFromDbIdToImage(dbImage) {
    const dbId = dbImage[meta].dbId;
    const dbRecord = await getDbRecord(dbId);
    for (let property in dbRecord) {
      if (property !== 'const' && property !== 'id') {// && property !== "_eternityIncoming"
        let recordValue = dbRecord[property];
        const value = loadDbValue(recordValue);
        
        dbImage[property] = value;
      }
    }
    dbImage[meta].loaded = true;

    imageCausality.state.incomingStructuresDisabled--;
    imageCausality.state.emitEventPaused--;
    imageCausality.state.inPulse--; if (imageCausality.state.inPulse === 0) imageCausality.postPulseCleanup();  
    // if (typeof(dbRecord.const) !== 'undefined') {
      // for (property in dbRecord.const) {
        // if (typeof(dbImage.const[property]) === 'undefined') {
          // let value = loadDbValue(dbRecord.const[property]);
          // dbImage.const[property] = value;
          // if (typeof(object.const[property]) === 'undefined') {
            // object.const[property] = imageToObject(value);                         
          // }
        // }
      // }
    // }    
  }

  function getDbRecord(dbId) {
    // flushToDatabase(); TODO... really have here??
    if (typeof(peekedAtDbRecords[dbId]) === 'undefined') {
      // No previous peeking, just get it
      return mockMongoDB.getRecord(dbId);
    } else {
      // Already stored for peeking, get and remove
      let record = peekedAtDbRecords[dbId];
      delete peekedAtDbRecords[dbId];
      return record;
    }
  }
    
  function loadDbValue(dbValue) {
    // trace.load && log("loadDbValue");
    if (typeof(dbValue) === 'string') {
      if (imageCausality.isIdExpression(dbValue)) {
        let dbId = imageCausality.extractIdFromExpression(dbValue);
        let dbImage = getDbImage(dbId);
        dbImage.const.loadedIncomingReferenceCount++;
        return dbImage;
      } else {
        return dbValue;
      }
    } else if (typeof(dbValue) === 'object') { // TODO: handle the array case
      if (dbValue === null) return null;
      let javascriptObject = {};
      for (let property in dbValue) {
        javascriptObject[property] = loadDbValue(dbValue[property]);
      }
      return javascriptObject;
    } 
    
    else {
      return dbValue;
    }
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
      state.gcStateImage = createImagePlaceholderFromDbId(state.collectionDbId);
      state.gc = setupGC(state.gcStateImage);
      state.gc.initializeGcState();
    } else {
      // Reconnect existing database
      state.persistentDbId = 0;
      state.updateDbId = 1;
      state.collectionDbId = 2;
      
      state.gcStateImage = createImagePlaceholderFromDbId(state.collectionDbId);
      state.gc = setupGC(state.gcStateImage);
    }
    world.persistent = await createObjectPlaceholderFromDbId(state.persistentDbId, "Object");
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