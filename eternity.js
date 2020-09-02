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

    loadedObjects: 0,
    pinnedObjects: 0,

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
      log("initialize empty database");
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
      log("reconnect database");
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
    if (dbId === null) dbId = "temp_" + tempDbId++; 
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
      pin(object);
    }  else {
      throw new Error("Cannot load and pin non-persistent object");
    }
  }

  async function whileLoaded(object, action) {
    await loadAndPin(object);
    action()
    unpin(object);
  }

  function pin() {
    object[meta].pins++;
    if (object[meta].pins === 1) state.pinnedObjects++;
  }

  function unpin(object) {
    object[meta].pins--;
    if (object[meta].pins === 0) state.pinnedObjects--;
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
    state.objectEventTransactions.push(preProcessTransaction(state.objectEvents));
    state.objectEvents = [];
  }

  function preProcessTransaction(transaction) {
    // The purpose of this is to 
    // 1. Filter out non persistent events
    // 2. Save image snapshots of newly persisted objects. It has to be done right away, since their state might change later.

    const newTransaction = {
      events: [],
      imageCreationEvents: null,
    } 

    if (state.imageEvents.length > 0) throw new Error("Internal Error: Image event buffer should be empty at this stage!");
    for (let event of transaction) {
      const image = event.object[meta].image; 
      if (image) {
        newTransaction.events.push(event);

        if (event.type === "set") {
          const referedObject = event.newValue[meta];
          if (referedObject) {
            const referedImage = event.newValue[meta].image;
            if (referedObject && !event.newValue[meta].image) {
              createDbImageForObjectRecursive(event.newValue);         
              const referedImage = event.newValue[meta].image; 
              referedImage.gcParent = image;
              referedImage.gcParentProperty = event.property; 
              // Note: Wait with setting the property until later. Now we only prepare the images of the refered data structure.
            }
          }          
        }
      }
    }

    // Collect all the image creation events, to be used for later. 
    newTransaction.imageCreationEvents = state.imageEvents;
    state.imageEvents = [];
  }


  function createDbImageForObjectRecursive(object) {

    function setPropertyOfImageAndFloodCreateNewImages(objectWithImage, property, value) {
      const image = objectWithImage[meta].image;
      let imageValue;

      // Set new value
      if (value[meta]) {
        const referedObject = value;           
        let referedImage;

        if (referedObject[meta].image) {
          referedImage = referedObject[meta].image;
          // Note: Remember to stabilize unstable data structures when the image creations are actually applied to the database.
        } else {
          createDbImageForObjectRecursive(referedObject);      
          referedImage = referedObject[meta].image;

          referedImage.gcParent = image;
          referedImage.gcParentProperty = property; 
        }

        // Set back reference
        await whileLoaded(referedObject, () => {
          referedImage["_incoming_" + property + image[meta].dbId ]
        });

        imageValue = referedImage;
      } else {
        imageValue = value;
      }
      state.ignoreEvents++; // Stealth mode. Since this will be created, we do no need the settings also. 
      image[property] = imageValue;
      state.ignoreEvents--;
    }

    if (object[meta].image) throw new Error("Object already has an image");
    const className = object[meta]ructor.name;
    const imageClassName = (object instanceof Array) ? "Array" : "Object"; 
    const image = createImage(null, className, imageClassName);
    object[meta].image = image;
    image[meta].object = object;

    for (let property in object) if (property !== "loaded") {
      setPropertyOfImageAndFloodCreateNewImages(object, property, object[property]);
    }
  }

  function pinTransaction(transaction) {
    for (let event of transaction) {
      event.object[meta].pins++;
    }
  }

  /****************************************************
  *  Pushing transactions to images
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
      await pushImageEventsToDatabase(transaction.imageCreationEvents); 
      unpinTransaction(transaction);      
    }
  }

  function unpinTransaction() {
    for (let event of transaction) {
      event.object[meta].pins--;
    }
  }

  async function pushTransactionToImages(transaction) {
    for (let event of transaction.events) {
      if (typeof(event.object[meta].image) !== 'undefined') {
        const image = event.object[meta].image;

        if (event.type === 'set') {
          // markOldValueAsUnstable(image, event);
            
          setPropertyOfImage(event.object, event.property, event.newValue, event.oldValue);
        } else if (event.type === 'delete') {
          //markOldValueAsUnstable(image, event);
                          
          delete image[event.property];
        }
      }      
    }
  }

  async function setPropertyOfImage(objectWithImage, property, value, oldValue) {
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
      const referedImage = referedObject[meta].image;

      if (!referedImage) {        
        throw new Error("Processing set in a transaction where the newValue refers to an object without an image");
      }

      // Set back reference
      await whileLoaded(referedObject, () => {
        let distinguisher = ""; 
        while (referedImage["incoming:" + property + distinguisher]) {
          if (distinguisher === "") {
            distinguisher = 1;
          } else {
            distinguisher++;
          }
        }
        referedImage["incoming:" + property + distinguisher] = image;
      });

      imageValue = referedImage;
    } else {
      imageValue = value;
    }
    image[property] = imageValue;
  }


  /****************************************************
  *  Pushing image events to database
  ***************************************************/

  async function pushImageEventsToDatabase(imageCreationEvents) {
    const events = state.imageEvents;
    state.imageEvents = [];
    twoPhaseComit(events, imageCreationEvents);
  }
  
  function compileUpdate(events, imageCreationEvents) {
    let compiledUpdate = {
      imageCreations : {},
      imageWritings : {},
      imageDeallocations : {},
      imageUpdates : {}, // TODO: Remember initial value for each field, so that events that cancel each other out might be removed altogether.
      needsSaving : true
    }
     
    // Serialize creations 
    for (let event of imageCreationEvents) {
      compiledUpdate.imageCreations[image[meta].dbId] = serializeDbImage(image);
    }

    // Serialize updates.
    for (let event of events) {
      const image = event.object;
      const dbId = image[meta].dbId;
      if (!compiledUpdate.imageCreations[dbId]) { // Only on non created objects. 
        if (typeof(compiledUpdate.imageUpdates[dbId]) === 'undefined') {
          compiledUpdate.imageUpdates[dbId] = {};
        }
        const imageUpdates = compiledUpdate.imageUpdates[dbId];                
        if (event.type === 'set') {               
          let value = serializeReferences(event.value);
          let property = event.property; 
          imageUpdates[event.property] = value;

        } else if (event.type === 'delete') {
          imageUpdates[event.property] = "_eternity_delete_property_";          
        }   
      }
    }

    // Find image to deallocate:
    for (let event of events) {
      let dereferencedObject; 
      if (event.type === 'set' && event.oldValue[meta]) {
        dereferencedObject = event.oldValue; 
      } else if (event.type === 'delete' && event.deletedValue[meta]) {
        dereferencedObject = event.deletedValue; 
      }

      if (dereferencedObject && dereferencedObject.incomingReferenceCount === 0) {
        const dbId = dereferencedObject[meta].dbId;

        // Decouple from any object 
        let correspondingObject = dereferencedObject[meta].object;
        delete correspondingObject[meta].image;
        delete correspondingObject[meta].object;
        state.loadedObjects--;

        // Target for destruction in update
        compiledUpdate.imageDeallocations[dbId] = true;
        if (compiledUpdate.imageUpdates[dbId]) {
          delete compiledUpdate.imageUpdates[dbId];
        }         
      }
    }

    return compiledUpdate;
  }

  function serializeReferences(entity) {
    if (entity[meta]) {
      return image[meta].serializedDbId;
    } else {
      return entity;
    }
  }

  async function twoPhaseComit(events, imageCreationEvents) {

    /**
     * First phase, write placeholders for all objects that we need to create, get their real ids, and create and save a compiled update with real dbids
     */ 

    // Leave a note at what stage the algorithm is, in case of failure. 
    await mockMongoDB.updateRecord(state.updateDbId, {writingPlaceholders: true}); 

    // Create all new objects we need. Give them a temporary id so we can track them down in case of failure.
    for (let event of imageCreationEvents) {
      const tempDbId = event.object[meta].dbId; 
      const image = event.object;
      let dbId = await mockMongoDB.saveNewRecord({_eternitySerializedTmpDbId : tmpDbId});  
      state.tmpDbIdToDbId[tempDbId] = dbId;
      image[meta].dbId = dbId;
      
      state.dbIdToImageMap[dbId] = image;
    }

    // Augment the update itself with the new ids.
    const update = compileUpdate(events, imageCreationEvents);

    // Store the update itself so we can continue this update if any crash or power-out occurs while performing it. 
    await mockMongoDB.updateRecord(state.updateDbId, update);


    /**
     * Second phase, performing all the updates
     */ 

    // Write newly created
    for (let tmpDbId in imageCreations) {
      await mockMongoDB.updateRecord(tmpDbIdToDbId[tmpDbId], imageCreations[tmpDbId]));
    }

    // Deallocate deleted
    for (let dbId in pendingUpdate.imageDeallocations) {
      mockMongoDB.deallocate(dbId);
    }     
    
    // TODO: Update entire record if the number of updates are more than half of fields.
    if(trace.eternity) log("pendingUpdate.imageUpdates:" + Object.keys(pendingUpdate.imageUpdates).length);
    for (let id in pendingUpdate.imageUpdates) {
      let updates = pendingUpdate.imageUpdates[id];
      if (isTmpDbId(id)) {
        // log("id: " + id);
        if (typeof(tmpDbIdToDbId[id]) === 'undefined0') throw new Error("No db id found for tmpDbId: " + id);
        id = tmpDbIdToDbId[id];
      }
      // log("update image id:" + id + " keys: " + Object.keys(pendingImageUpdates[id]));
      let updatesWithoutTmpDbIds = replaceTmpDbIdsWithDbIds(updates);
      if(trace.eternity) log(updatesWithoutTmpDbIds);
      for (let property in updatesWithoutTmpDbIds) {
        if (property !== "_eternityDeletedKeys") {
          let value = updatesWithoutTmpDbIds[property];
          // value = replaceTmpDbIdsWithDbIds(value);
          // property = imageCausality.transformPossibleIdExpression(property, convertTmpDbIdToDbId);
          mockMongoDB.updateRecordPath(id, [property], value);            
        }
      }
      
      if (typeof(updatesWithoutTmpDbIds["_eternityDeletedKeys"]) !== 'undefined') {
        for (let deletedProperty in updatesWithoutTmpDbIds["_eternityDeletedKeys"]) {           
          mockMongoDB.deleteRecordPath(id, [deletedProperty]);
        }
      }
    }
    

    
    // Finish, clean up transaction
    if (configuration.twoPhaseComit) mockMongoDB.updateRecord(updateDbId, { name: "updatePlaceholder", _eternityIncomingCount : 1 });
    
    // Remove pending update
    // logUngroup();
    pendingUpdate = null;
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

// restabilize object/image if unstable
//         // if (unstableOrBeeingForgetedInGcProcess(imageValue)) {
//         //   imageValue._eternityParent = objectWithImage[meta].image;
//         //   imageValue._eternityParentProperty = property;
//         //   if (inList(deallocationZone, imageValue)) {
//         //     fillDbImageFromCorrespondingObject(imageValue);               
//         //   }
//         //   addFirstToList(gcState, pendingForChildReattatchment, imageValue);  
//         //   removeFromAllGcLists(imageValue);
//         // }



    // function postImagePulseAction(events) {
    //   // log("postImagePulseAction: " + events.length + " events");
    //   // logGroup();
    //   if (events.length > 0) {
    //     // Set the class of objects created... TODO: Do this in-pulse somehow instead?
    //     addImageClassNames(events);
        
    //     updateIncomingReferencesCounters(events);
    //     // pendingUpdates.push(events);
        
    //     // Push to pending updates
    //     let compiledUpdate = compileUpdate(events);
    //     // log("compiledUpdate");
    //     // log(compiledUpdate, 10);
    //     if (pendingUpdate === null) {
    //       pendingUpdate = compiledUpdate;
    //     } else {
    //       mergeUpdate(pendingUpdate, compiledUpdate);         
    //       // log("pendingUpdate after merge");
    //       // log(pendingUpdate, 10);
    //     }
    //     // flushImageToDatabase();
    //   } else {
    //     // log("no events...");
    //     // throw new Error("a pulse with no events?");
    //   }
    //   // logUngroup();
    //   unloadAndForgetImages();
    // } 

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



  // async function loadFromDbIdToImage(image) {
  //   const dbId = image[meta].dbId;
  //   const dbRecord = await getDbRecord(dbId);
  //   for (let property in dbRecord) {
  //     if (property !== 'const' && property !== 'id') {// && property !== "_eternityIncoming"
  //       let recordValue = dbRecord[property];
  //       const value = loadDbValue(recordValue);
        
  //       image[property] = value;
  //     }
  //   }
  //   image[meta].loaded = true;

  //   imageCausality.state.incomingStructuresDisabled--;
  //   imageCausality.state.emitEventPaused--;
  //   imageCausality.state.inPulse--; if (imageCausality.state.inPulse === 0) imageCausality.postPulseCleanup();  
  //   // if (typeof(dbRecord[meta]) !== 'undefined') {
  //     // for (property in dbRecord[meta]) {
  //       // if (typeof(image[meta][property]) === 'undefined') {
  //         // let value = loadDbValue(dbRecord[meta][property]);
  //         // image[meta][property] = value;
  //         // if (typeof(object[meta][property]) === 'undefined') {
  //           // object[meta][property] = imageToObject(value);                         
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
  //       let image = getDbImage(dbId);
  //       image[meta].incomingReferenceCount++;
  //       return image;
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
