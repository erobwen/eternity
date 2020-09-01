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


  /****************************************************
  *    State
  ***************************************************/

  const state = {
    objectEvents: [],
    objectEventTransactions: [],

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

    activityList: setupActivityList(meta, (object) => {
      if (object[meta].isUnforgotten) {
        return false; 
      }
      
      if (!object[meta].image) {
        return false;       
      }
      return true;
      // Consider?: Add and remove to activity list as we persist/unpersist this object.... ??? 
    })
  }

  /****************************************************
  *   Database encoding/decoding
  ***************************************************/

  function encodeDbReference(dbId, className, imageClassName, incoming) {
    return "_db_id:" + dbId + ":" + className + ":" + imageClassName;
  }

  function isDbReference(string) {
    return string.startsWith("_db_id_");
  }

  function decodeDbReference(reference) {
    const fragments = reference.split(":");
    return {
      dbId: fragments[1],
      className: fragments[2],
      imageClassName: fragments[3]
    };
  }

  /****************************************************
  *   2 Worlds and a database
  ***************************************************/

  const mockMongoDB = createDatabase(JSON.stringify(configuration));

  const objectWorld = getCausalityWorld({
    objectMetaProperty: meta,
    // onWriteGlobal: (handler, target) => {
    //   return true; 
    // },
    // onReadGlobal: (handler, target) => {
    //   return true;
    //   // handler.meta
    //   // handler.target
    //   // handler.proxy
    // }, 
    onEventGlobal: event => {
      if (state.ignoreObjectEvents === 0 && ignoreEvents === 0) {
        state.objectEvents.push(event);
      }
    }
  });

  const imageWorld = getCausalityWorld({
    objectMetaProperty: meta,
    onEventGlobal: event => {
      if (state.ignoreImageEvents === 0 && ignoreEvents === 0) {
        state.imageEvents.push(event);
      }
    },
  });


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
    world.persistent = getPersistentObject(state.persistentDbId, "Object", "Object");
    await loadAndPin(world.persistent); // Pin persistent! 
  }


  /****************************************************
  *  Get persistent objects
  ***************************************************/

  function createObjectForImage(className, image) {
    const object = objectWorld.create(createTargetWithClass(className));
      object[meta].incomingPersistentReferenceCount = null; // We only know after load
      object[meta].incomingReferenceCount = 0;
      object[meta].pins = 0;
      object[meta].target.loaded = false;

      // Connect with image
      image[meta].object = object; 
      object[meta].image = image;
  }

  function getPersistentObject(dbId, className, imageClassName) {
    state.ignoreEvents++;
    const image = getImage(dbId, className, imageClassName);
    if (!image[meta].object) {
      createObjectForImage(className, image);
    }
    state.ignoreEvents--;
    log("getPersistentObject:");
    log(image[meta].object);
    return image[meta].object;
  }

  let tempDbId = 1;
  function createImage(dbId, className, imageClassName) {
    if (!dbId) dbId = "temp_" + tempDbId++; 
    const image = imageWorld.create(createTargetWithClass(className));
    image[meta].dbId = dbId;
    image[meta].serializedDbId = encodeDbReference(dbId, className, imageClassName);
    image[meta].objectClassName = className;
    return image;
  }

  function getImage(dbId, className, imageClassName) {
    state.ignoreEvents++;
    if (typeof(state.dbIdToImageMap[dbId]) === 'undefined') {
      const image = createImage(dbId, className, imageClassName);
      state.dbIdToImageMap[dbId] = image;
    }
    const image = state.dbIdToImageMap[dbId];
    image[meta].incomingReferenceCount++;
    state.ignoreEvents--;
    return state.dbIdToImageMap[dbId];
  }
  
  /****************************************************
  *  Loading objects
  ***************************************************/

  async function loadImage(image) {
    const record = await mockMongoDB.getRecord(image[meta].dbId);
    const imageTarget = image[meta].target;
    for (let property in record) {
      const value = record[property];
      if (property !== "id") {      
        if (typeof(value) === "string" && isDbReference(value)) {
          const reference = decodeDbReference(value);
          imageTarget[property] = getImage(reference.dbId, reference.className, reference.imageClassName);
        } else {
          imageTarget[property] = value;
        }      
      }
    }
  }

  async function loadObject(object) {
    function imageValueToObjectValue(imageValue) {
      if (typeof(imageValue) === "object" && imageValue[meta]) {
        if (!imageValue[meta].object) {
          createObjectForImage(imageValue[meta].objectClassName, imageValue);
        }
        return imageValue[meta].object;
      } else {
        return imageValue;
      }
    }

    const image = object[meta].image;
    if (image) {
      await loadImage(image);
      const imageTarget = image[meta].target;
      const objectTarget = object[meta].target;
      for (let property in imageTarget) {
        if (!property.startsWith("_incoming_") && property !== "loaded") {
          objectTarget[property] = imageValueToObjectValue(imageTarget[property])
        }
      }
    } else {
      throw new Error("Cannot load non-persistent object");
    }

    object.loaded = true; // Possibly Trigger reactions.
  }

  async function loadAndPin(object) {
    if (object[meta].image) {
      await loadObject(object);
      object[meta].pins++;
    }  else {
      throw new Error("Cannot load and pin non-persistent object");
    }
  }

  async function whileLoaded(object, action) {
    await loadAndPin(object);
    action()
    unpin(object);
  }

  async function unpin(object) {
    // TODO: Register activity here instead of using onReadGlobal... 
    object[meta].pins--;
    state.activityList.registerActivity(object);
  } 


  /****************************************************
  *  Clearing
  ***************************************************/
  
  async function unloadAll() {
    // Flush to database?
    await flushToDatabase();
    objectWorld.state.nextObjectId = 1;
    imageWorld.state.nextObjectId = 1;
    delete world.persistent;   // Note: causality.persistent is replace after an unload... 
    state.dbIdToImageMap = {};
    await setupDatabase();
  }
    
  async function unloadAllAndClearDatabase() {
    // Flush to database?
    await flushToDatabase();
    mockMongoDB.clearDatabase();
    await unloadAll();
  }


  /****************************************************
  *  Transactions
  ***************************************************/

  function transaction(action) {
    if (state.objectEvents.length > 0) endTransaction();
    action();
    endTransaction();
  }

  function endTransaction() {
    pinTransaction(state.objectEvents);
    for (let event of state.objectEvents) {
      if (event.type === "set") {
        if (event.newValue[meta]) event.newValue[meta].incomingReferenceCount++;
        if (event.oldValue[meta]) event.newValue[meta].incomingReferenceCount--; // Try to forgett refered object here?       
      }
    }
    state.objectEventTransactions.push(state.objectEvents);
    state.objectEvents = [];
  }

  function pinTransaction(transaction) {
    for (let event of transaction) {
      event.object[meta].pins++;
    }
  }

  /****************************************************
  *  Pushing transactions to database
  ***************************************************/

  async function flushToDatabase() {
    while (state.objectEventTransactions.length > 0) {
      await pushTransactionToDatabase();
    }
  }

  async function pushTransactionToDatabase() {
    if (state.objectEventTransactions.length > 0) {
      const transaction = state.objectEventTransactions.shift();
      pushTransactionToImages(transaction);
      await pushImageEventsToDatabase(); 
      unpinTransaction(transaction);      
    }
  }

  function unpinTransaction() {
    for (let event of transaction) {
      event.object[meta].pins--;
    }
  }

  async function pushTransactionToImages(transaction) {
    for (let event of transaction) {
      if (typeof(event.object[meta].image) !== 'undefined') {
        const image = event.object[meta].image;

        if (event.type === 'set') {
          // markOldValueAsUnstable(image, event);
            
          setPropertyOfImageAndFloodCreateNewImages(event.object, event.property, event.newValue, event.oldValue);
        } else if (event.type === 'delete') {
          //markOldValueAsUnstable(image, event);
                          
          delete image[event.property];
        }
      }      
    }
  }

  async function setPropertyOfImageAndFloodCreateNewImages(objectWithImage, property, value, oldValue) {
    const image = objectWithImage[meta].image;
    let imageValue;

    // Unset previous reference to object 
    if (oldValue[meta]) {
      if (oldValue[meta].image.gcParent === image) {
        // TODO: Mark as unstable
      }
    }

    // Set new value
    if (value[meta]) {
      const referedObject = value;           
      let  referedImage;

      if (referedObject[meta].image) {
        referedImage = referedObject[meta].image;

        // TODO: restabilize object/image if unstable
        // if (unstableOrBeeingForgetedInGcProcess(imageValue)) {
        //   imageValue._eternityParent = objectWithImage.const.dbImage;
        //   imageValue._eternityParentProperty = property;
        //   if (inList(deallocationZone, imageValue)) {
        //     fillDbImageFromCorrespondingObject(imageValue);               
        //   }
        //   addFirstToList(gcState, pendingForChildReattatchment, imageValue);  
        //   removeFromAllGcLists(imageValue);
        // }

      } else {
        createDbImageForObjectRecursive(referedObject);      
        referedImage = referedObject[meta].image;
      }

      // Set back reference
      await whileLoaded(referedObject, () => {
        referedImage["_incoming_" + property + image[meta].dbId ]
      });

      imageValue = referedImage;
    } else {
      imageValue = value;
    }
    image[property] = imageValue;
  }

  function createDbImageForObjectRecursive(object) {
    if (object[meta].image) throw new Error("Object already has an image");
    const className = object.constructor.name;
    const imageClassName = (object instanceof Array) ? "Array" : "Object"; 
    const image = createImage(null, className, imageClassName);
    object[meta].image = image;
    image[meta].object = object;

    for (let property in object) if (property !== "loaded") {
      setPropertyOfImageAndFloodCreateNewImages(object, property, object[property]);
    }
  }
    

  /****************************************************
  *  Return world 
  ***************************************************/

  Object.assign(world, {
    transaction, 
    endTransaction,
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
  //       dbImage.const.incomingReferenceCount++;
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
