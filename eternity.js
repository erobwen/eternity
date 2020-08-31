import { getWorld as getCausalityWorld } from  "causalityjs";
import { argumentsToArray, configSignature, mergeInto } from "./lib/utility.js";
import { objectlog } from "./lib/objectlog.js";
import { createDatabase } from "./mockMongoDB.js";
import { setupActivityList } from "./lib/activityList.js";
import { setupGC } from "./lib/gc.js";

const log = console.log;

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

  const world = {};

  /****************************************************
  *    State
  ***************************************************/

  const state = {
    objectEvents: [],
    imageEvents: [],

    dbIdToImageMap: {},
    
    ignoreObjectEvents: 0,
    ignoreImageEvents: 0,
    ignoreEvents: 0,

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


  /****************************************************
  *   Deploy configuration & class registry
  ***************************************************/

  const meta = configuration.objectMetaProperty;
  const { classRegistry } = configuration;

  function createTargetWithClass(className) {
    let createdTarget;

    // Create from a string
    if (className === 'Array') {
      createdTarget = []; // On Node.js this is different from Object.create(eval("Array").prototype) for some reason... 
    } else if (className === 'Object') {
      createdTarget = {}; // Just in case of similar situations to above for some Javascript interpretors... 
    } else {
      let classOrPrototype = classRegistry[className];
      if (typeof(classOrPrototype) !== 'function') {
        throw new Error("No class found in eternity class registry: " +  createdTarget);
      }
      createdTarget = new classRegistry[createdTarget]();
    }

    return createdTarget; 
  }

  function idExpression(dbId) {
    return "_db_id_" + dbId
  }

  /****************************************************
  *   2 Worlds and a database
  ***************************************************/

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
      if (state.ignoreObjectEvents === 0 && ignoreEvents === 0) {
        state.objectEvents.push(event);
      }
    },
  });

  const imageWorld = getCausalityWorld({
    objectMetaProperty: meta,
    onEventGlobal: event => {
      if (state.ignoreImageEvents === 0 && ignoreEvents === 0) {
        state.imageEvents.push(event);
      }
    },
  });

  function getObject(dbId, className, imageClassName) {
    state.ignoreEvents++;
    const image = getImage(dbId, className, imageClassName);
    if (!image[meta].object) {
      const object = objectWorld.create(createTargetWithClass(className));
      object[meta].incomingReferenceCount = null; // We only know after load
      object[meta].loadedIncomingReferenceCount = 0;

      // Connect with image
      image[meta].object = object; 
      object[meta].image = image;
    }
    image[meta].object[meta].loadedIncomingReferenceCount++;
    state.ignoreEvents--;
    log("getObject:");
    log(image[meta].object);
    return image[meta].object;
  }

  function getImage(dbId, className, imageClassName) {
    state.ignoreEvents++;
    if (typeof(state.dbIdToImageMap[dbId]) === 'undefined') {
      const image = objectWorld.create(createTargetWithClass(className));
      image[meta].dbId = dbId;
      image[meta].serializedDbId = idExpression(dbId);
      image[meta].incomingReferenceCount = null; // We only know after load
      image[meta].loadedIncomingReferenceCount = 0;
      image.loaded = false;
      state.dbIdToImageMap[dbId] = image;
    }
    const image = state.dbIdToImageMap[dbId];
    image[meta].loadedIncomingReferenceCount++;
    state.ignoreEvents--;
    return state.dbIdToImageMap[dbId];
  }
  

  /****************************************************
  *  Clearing
  ***************************************************/
  
  async function unloadAll() {
    // Flush to database?
    objectWorld.state.nextObjectId = 1;
    imageWorld.state.nextObjectId = 1;
    delete world.persistent;   // Note: causality.persistent is replace after an unload... 
    state.dbIdToImageMap = {};
    await setupDatabase();
  }
    
  async function unloadAllAndClearDatabase() {
    // Flush to database?
    mockMongoDB.clearDatabase();
    await unloadAll();
  }


  /****************************************************
  *  Setup database
  ***************************************************/

  async function setupDatabase() {
    if ((await mockMongoDB.getRecordsCount()) === 0) {
      // Initialize empty database
      [state.persistentDbId, state.updateDbId, state.collectionDbId] = 
        await Promise.all([
          mockMongoDB.saveNewRecord({ name : "Persistent", _eternityIncomingCount : 42}),
          mockMongoDB.saveNewRecord({ name: "updatePlaceholder", _eternityIncomingCount : 42}),
          mockMongoDB.saveNewRecord({ name : "garbageCollection", _eternityIncomingCount : 42})]);

      state.gcStateImage = getImage(state.collectionDbId, "Object", "Object");
      state.gc = setupGC(state.gcStateImage);
      state.gc.initializeGcState();
    } else {
      // Reconnect existing database
      state.persistentDbId = 0;
      state.updateDbId = 1;
      state.collectionDbId = 2;
      
      state.gcStateImage = getImage(state.collectionDbId, "Object", "Object");
      state.gc = setupGC(state.gcStateImage);
    }
    log("setting persistent");
    world.persistent = getObject(state.persistentDbId, "Object", "Object");
    // await loadAndPin(world.persistent); // Pin persistent! 
  }


  /****************************************************
  *  Main load interface
  ***************************************************/

  // loadAndPin(), whileLoaded(), unpin() 



  /****************************************************
  *  Return world 
  ***************************************************/

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



/* 
--------------------------------------------------------------------
*/


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



  // async function loadFromDbIdToImage(dbImage) {
  //   const dbId = dbImage[meta].dbId;
  //   const dbRecord = await getDbRecord(dbId);
  //   for (let property in dbRecord) {
  //     if (property !== 'const' && property !== 'id') {// && property !== "_eternityIncoming"
  //       let recordValue = dbRecord[property];
  //       const value = loadDbValue(recordValue);
        
  //       dbImage[property] = value;
  //     }
  //   }
  //   dbImage[meta].loaded = true;

  //   imageCausality.state.incomingStructuresDisabled--;
  //   imageCausality.state.emitEventPaused--;
  //   imageCausality.state.inPulse--; if (imageCausality.state.inPulse === 0) imageCausality.postPulseCleanup();  
  //   // if (typeof(dbRecord.const) !== 'undefined') {
  //     // for (property in dbRecord.const) {
  //       // if (typeof(dbImage.const[property]) === 'undefined') {
  //         // let value = loadDbValue(dbRecord.const[property]);
  //         // dbImage.const[property] = value;
  //         // if (typeof(object.const[property]) === 'undefined') {
  //           // object.const[property] = imageToObject(value);                         
  //         // }
  //       // }
  //     // }
  //   // }    
  // }

  // function getDbRecord(dbId) {
  //   // flushToDatabase(); TODO... really have here??
  //   if (typeof(peekedAtDbRecords[dbId]) === 'undefined') {
  //     // No previous peeking, just get it
  //     return mockMongoDB.getRecord(dbId);
  //   } else {
  //     // Already stored for peeking, get and remove
  //     let record = peekedAtDbRecords[dbId];
  //     delete peekedAtDbRecords[dbId];
  //     return record;
  //   }
  // }
    
  // function loadDbValue(dbValue) {
  //   // trace.load && log("loadDbValue");
  //   if (typeof(dbValue) === 'string') {
  //     if (imageCausality.isIdExpression(dbValue)) {
  //       let dbId = imageCausality.extractIdFromExpression(dbValue);
  //       let dbImage = getDbImage(dbId);
  //       dbImage.const.loadedIncomingReferenceCount++;
  //       return dbImage;
  //     } else {
  //       return dbValue;
  //     }
  //   } else if (typeof(dbValue) === 'object') { // TODO: handle the array case
  //     if (dbValue === null) return null;
  //     let javascriptObject = {};
  //     for (let property in dbValue) {
  //       javascriptObject[property] = loadDbValue(dbValue[property]);
  //     }
  //     return javascriptObject;
  //   } 
    
  //   else {
  //     return dbValue;
  //   }
  // }
