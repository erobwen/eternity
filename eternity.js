import { getWorld as getCausalityWorld } from  "causalityjs";
import { argumentsToArray, configSignature, mergeInto } from "./lib/utility.js";
import { objectlog } from "./lib/objectlog.js";
import { createDatabase } from "./mockMongoDB.js";
import { setupActivityList } from "./lib/activityList.js";
import { setupGC } from "./lib/flameFrontGC.js";

const log = objectlog.log;
// const log = console.log;

const defaultObjectlog = objectlog;

const defaultConfiguration = {
  objectMetaProperty: "eternity",
  maxNumberOfLoadedObjects : 10000,
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
    imageCreationEvents: [],

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

  function encodeDbReference(dbId, objectClassName, imageClassName) {
    return "_db_id:" + dbId + ":" + objectClassName + ":" + imageClassName;
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
    emitEvents: true, 
    onEventGlobal: event => {
      log("onEventGlobal");
      log(state.ignoreEvents);
      if (state.ignoreObjectEvents === 0 && state.ignoreEvents === 0) {
        log(event);
        state.objectEvents.push(event);
      }
    }
  });

  const imageWorld = getCausalityWorld({
    objectMetaProperty: meta,
    onEventGlobal: event => {
      if (state.ignoreImageEvents === 0 && state.ignoreEvents === 0) {
        if (event.type === "creation") {
          state.imageCreationEvents.push(event);
        } else {
          state.imageEvents.push(event);
        }
      }
    },
  });


  /****************************************************
  *  Setup database
  ***************************************************/

  async function setupDatabase() {
    log("setupDatabase:");
    if ((await mockMongoDB.getRecordsCount()) === 0) {
      // Initialize empty database
      log("initialize empty database...");
      [state.persistentDbId, state.updateDbId, state.collectionDbId] = 
        await Promise.all([
          mockMongoDB.saveNewRecord({ name : "persistent", _eternityIncomingCount : 0}),
          mockMongoDB.saveNewRecord({ name: "updatePlaceholder" }),
          mockMongoDB.saveNewRecord({ name : "garbageCollection" })]);

      state.gcStateImage = getImage(state.collectionDbId, "Object", "Object");
      state.gc = setupGC(state.gcStateImage);
      state.gc.initializeGcState();
    } else {
      // Reconnect existing database
      log("reconnect database...");
      state.persistentDbId = 0;
      state.updateDbId = 1;
      state.collectionDbId = 2;
      
      state.gcStateImage = getImage(state.collectionDbId, "Object", "Object");
      state.gc = setupGC(state.gcStateImage);
    }

    // Protect images from accidental deallocation
    state.protectedImages = {};
    state.protectedImages[state.persistentDbId] = true; 
    state.protectedImages[state.updateDbId] = true; 
    state.protectedImages[state.collectionDbId] = true; 

    world.persistent = getPersistentObject(state.persistentDbId, "Object", "Object");
    // log(world.persistent[meta]);
    // log(world.persistent[meta].image);
    // log(world.persistent[meta].image[meta]);
    // log(world.persistent[meta].image[meta].dbId);
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

  function createImage(dbId, objectClassName, imageClassName) {
    const image = imageWorld.create(createTargetWithClass(objectClassName));
    image._eternityIncomingCount = 0;
    image[meta].objectClassName = objectClassName;
    image[meta].imageClassName = imageClassName;

    if (typeof(dbId) === "number") {
      setImageDbId(image, dbId);
    } 

    return image;
  }

  function setImageDbId(image, dbId) {
    const metaObject = image[meta];
    metaObject.dbId = dbId;
    metaObject.serializedDbId = encodeDbReference(dbId, metaObject.objectClassName, metaObject.imageClassName);
  }

  function getImage(dbId, className, imageClassName) {
    state.ignoreEvents++;
    if (typeof(state.dbIdToImageMap[dbId]) === 'undefined') {
      const image = createImage(dbId, className, imageClassName);
      state.dbIdToImageMap[dbId] = image;
      state.rememberedImages++;
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

    state.ignoreEvents++; // No events to push
    object.loaded = true; // Possibly Trigger reactions.
    state.ignoreEvents--;
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

  function pin(object) {
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
    state.rememberedImages = 0;
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

  // Note: You typically do not need to wait for the promise returned, unless you want to be sure that the data has been stored persistently. 
  // If not, the changes will be queued upp and persisted gradually, which is fine in most cases.
  async function transaction(action) { // action can not be async. 
    if (state.objectEvents.length > 0) endTransaction();
    action();
    return endTransaction();
  }

  // Note: You typically do not need to wait for the promise returned, unless you want to be sure that the data has been stored persistently. 
  // If not, the changes will be queued upp and persisted gradually, which is fine in most cases.
  async function endTransaction() {
    log("endTransaction:");
    const objectEvents = state.objectEvents; 
    state.objectEvents = null; // Force fail if event!

    let resolvePromise; 
    const onPersistPromise = new Promise((resolve, reject) => { 
      resolvePromise = resolve;
    });
    log("...")

    // Keep track of incoming references for all objects. 
    // for (let event of objectEvents) {
    //   if (event.type === "set") {
    //     if (event.newValue[meta]) event.newValue[meta].incomingReferenceCount++;
    //     if (event.oldValue[meta]) event.newValue[meta].incomingReferenceCount--; // Try to forgett refered object here?       
    //   }
    // }
    log("...")

    const transaction = preCreateImagesWithSnapshot(objectEvents);
    transaction.resolvePromise = resolvePromise;
    state.objectEventTransactions.push(transaction);
    log(state.objectEventTransactions, 4)
    
    pinTransaction(transaction);
    state.objectEvents = [];
    return onPersistPromise; 
  }

  function preCreateImagesWithSnapshot(objectEvents) {
    // The purpose of this is to 
    // 1. Filter out non persistent events
    // 2. Save image snapshots of newly persisted objects. It has to be done right away, since their state might change later.

    const newTransaction = {
      objectEvents: [],
      imageCreationEvents: null,
      imageEvents: null
    } 

    if (state.imageEvents.length > 0) throw new Error("Internal Error: Image event buffer should be empty at this stage!");
    for (let event of objectEvents) {
      const image = event.object[meta].image; 
      if (image) {
        newTransaction.objectEvents.push(event);

        if (event.type === "set") {
          const referedObject = event.newValue[meta];
          if (referedObject) {
            const referedImage = event.newValue[meta].image;
            if (referedObject && !event.newValue[meta].image) {
              createImageForObjectRecursive(event.newValue);         
              const referedImage = event.newValue[meta].image; 
              referedImage._eternityPersistentParent = image;
              referedImage._eternityPersistentParentProperty = event.property; 
              // Note: Wait with setting the property until later. Now we only prepare the images of the refered data structure.
            }
          }          
        }
      }
    }

    // Collect all the image creation events, to be used for later. note: mixed with settings of _eternityPersistentParent/_eternityPersistentParentProperty
    newTransaction.imageCreationEvents = state.imageCreationEvents; state.imageCerationEvents = [];
    newTransaction.imageEvents = state.imageEvents; state.imageEvents = [];
    return newTransaction;
  }


  function createImageForObjectRecursive(object) {
    if (object[meta].image) throw new Error("Object already has an image");
    const className = object.constructor.name;
    const imageClassName = (object instanceof Array) ? "Array" : "Object"; 
    const image = createImage(null, className, imageClassName);
    object[meta].image = image;
    image[meta].object = object;

    // Save snapshot for later. We will create these references later when we have finished the transaction. 
    image[meta].objectSnapshot = {...object};

    for (let property in object) if (property !== "loaded") {
      const value = object[property]; 
      if (value[meta] && !value[meta].image) {
        const referedObject = value;
        const referedImage = referedObject[meta].image;
        createImageForObjectRecursive(referedObject);

        // Only create gc parent properties for now   
        referedImage._eternityPersistentParent = image;
        referedImage._eternityPersistentParentProperty = property;    
      }
    }
  }

  function pinTransaction(transaction) {
    for (let event of transaction.objectEvents) {
      pin(event.object);
    } 
    for (let event of transaction.imageCreationEvents) {
      pin(event.object[meta].object);
    }
  }

  function unpinTransaction(transaction) {
    for (let event of transaction.objectEvents) {
      unpin(event.object);
    }
    for (let event of transaction.imageCreationEvents) {
      unpin(event.object[meta].object);
    }
  }

  /****************************************************
  *  Pushing transactions to images
  ***************************************************/

  async function flushToDatabase() {
    log("flushToDatabase:");
    while (state.objectEventTransactions.length > 0) {
      await pushTransactionToDatabase();
    }
  }

  async function pushTransactionToDatabase() {
    log("pushTransactionToDatabase")
    if (state.objectEventTransactions.length > 0) {
      const transaction = state.objectEventTransactions.shift();
      log(transaction);

      pushTransactionToImages(transaction);
      const imageEvents = state.imageEvents;
      transaction.imageEvents.forEach(event => imageEvents.push(event)); // Not needed really...
      state.imageEvents = [];
      
      twoPhaseComit(transaction.imageCreationEvents, imageEvents);
      unpinTransaction(transaction);
      transaction.resolvePromise();
    }
  }

  async function pushTransactionToImages(transaction) {
    // Do the settings and deletes
    for (let event of transaction.objectEvents) {
      if (typeof(event.object[meta].image) !== 'undefined') {

        if (event.type === 'set') {
          setPropertyOfImage(event.object, event.property, event.newValue, event.oldValue);
        } else if (event.type === 'delete') {
          await unsettingPropertyOfImage(event.object, event.property, event.oldValue);
          const image = event.object[meta].image;
          delete image[event.property];
        }
      }      
    }

    // Fill the newly created images with object snapshots. 
    for (let imageCreation in transaction.imageCreationEvents) {
      const snapshot = imageCreation.object[meta].objectSnapshot;
      delete imageCreation.object[meta].objectSnapshot;
      for (let property in snapshot) {
        await setPropertyOfImage(object, property, snapshot[property], null);        
      }
    }
  }

  // Unsetting property, used both for delete and for previous value in a normal set. 
  async function unsettingPropertyOfImage(objectWithImage, property, oldValue) {
    if (oldValue[meta]) {
      const referedObject = oldValue;
      const referedImage = oldValue[meta].image;

      // Mark as unstable
      if (referedImage._eternityPersistentParent === image && referedImage._eternityPersistentParentProperty === property) {
        delete referedImage._eternityPersistentParent;
        delete referedImage._eternityPersistentParentProperty;

        await state.gc.addUnstableOrigin(referedImage); // TODO: Make sure gc internal loadings works..
      }

      // Remove incoming references
      await whileLoaded(referedObject, () => {
        let distinguisher = ""; 
        while (referedImage["incoming:" + property + distinguisher] && referedImage["incoming:" + property + distinguisher] !== image) {
          if (distinguisher === "") {
            distinguisher = 1;
          } else {
            distinguisher++;
          }
        }
        if (referedImage["incoming:" + property + distinguisher] !== image) throw new Error("Could not find incoming reference.");

        delete referedImage["incoming:" + property + distinguisher];

        referedImage._eternityIncomingCount--;
      });
    }
  }

  async function setPropertyOfImage(objectWithImage, property, value, oldValue) {
    const image = objectWithImage[meta].image;

    // Unset previous value
    await unsettingPropertyOfImage(objectWithImage, property, oldValue);

    // Set new value
    let imageValue;
    if (value[meta]) {
      const referedObject = value;           
      const referedImage = referedObject[meta].image;
      if (!referedImage) throw new Error("Internal Error: Expected an image for the object");

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
        referedImage._eternityIncomingCount++;
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

  async function twoPhaseComit(imageCreationEvents, imageEvents) {
    log("twoPhaseComit");
    /**
     * First phase, write placeholders for all objects that we need to create, get their real ids, and create and save a compiled update with real dbids
     */ 
    // Leave a note at what stage the algorithm is, in case of failure. 
    await mockMongoDB.updateRecord(state.updateDbId, { name: "updatePlaceholder", status: "writing image placeholders"}); 

    // Create all new objects we need. Mark them with "_eternityJustCreated: true" for easy cleanup in case of failure.
    for (let event of imageCreationEvents) {
      const image = event.object;
      let dbId = await mockMongoDB.saveNewRecord({_eternityJustCreated : true});  
      setImageDbId(image, dbId);
      
      state.dbIdToImageMap[dbId] = image;
      state.rememberedImages++;
    }

    // Augment the update itself with the new ids. 
    const update = compileUpdate(imageCreationEvents, imageEvents);
    log(update);

    // Store the update itself so we can continue this update if any crash or power-out occurs while performing it.
    // After the update has been stored, no rollback is possible, only roll-forward and complete the whole update. 
    await mockMongoDB.updateRecord(state.updateDbId, update);


    /**
     * Second phase, performing all the updates & remove the update.
     */
     // Perform all updates
    await performAllUpdates(update);
    
    // Finish, clean up transaction
    await mockMongoDB.updateRecord(state.updateDbId, { name: "updatePlaceholder" });
  }
  

  function compileUpdate(imageCreationEvents, imageEvents) {

    function serializeImage(image) {
      let serialized = (image instanceof Array) ? [] : {};
      for (let property in image) {
        if (property === meta) throw Error("Meta key should not be in iteration!");
        serialized[property] = serializeReferences(image[property]);
      }
      return serialized;      
    }

    function serializeReferences(entity) {
      if (entity[meta]) {
        return image[meta].serializedDbId;
      } else {
        return entity;
      }
    }

    const recordReplacements = {};
    const recordUpdates = {};
    const imageDeallocations = {};

    const allImages = {};

    // Replace all new records    
    for (let event of imageCreationEvents) {
      const image = event.object;
      const dbId = image[meta].dbId;
      allImages[dbId] = image; 
      recordReplacements[image[meta].dbId] = serializeImage(image);
    }
     
    // Serialize updates.
    for (let event of imageEvents) {
      const image = event.object;
      const dbId = image[meta].dbId;
      allImages[dbId] = image; 
      if (!recordReplacements[dbId]) { // Only on non replaced objects. 

        // Get specific record updates
        if (typeof(recordUpdates[dbId]) === 'undefined') {
          recordUpdates[dbId] = {};
        }
        const specificRecordUpdates = recordUpdates[dbId];

        // Replace entire record or make targeted property update ajustments
        if (Object.keys(specificRecordUpdates).length === 3) { // At most three property updates
          // Replace entire record
          recordReplacements[dbId] = serializeImage(image);
          delete recordUpdates[dbId];
        } else {
          // Do a targeted property update
          if (event.type === 'set') {               
            specificRecordUpdates[event.property] = serializeReferences(event.value);
          } else if (event.type === 'delete') {
            specificRecordUpdates[event.property] = "_eternity_delete_property_";          
          }   
        }        
      }
    }

    // Find image to deallocate.
    // Note, upon deallocation they need to be removed from any GC list. 
    for (dbId in allImages) {
      if (state.protectedImages[dbId]) continue;

      const image = allImages[dbId];

      if (image._eternityIncomingCount === 0) {
        
        // Decouple from object 
        let object = image[meta].object;
        delete object[meta].image;
        delete object[meta].object;

        // Forget
        delete state.dbIdToImageMap[dbId]; 
        state.rememberedImages--;

        // Setup for destruction
        imageDeallocations[dbId] = true;
        if (recordUpdates[dbId]) delete recordUpdates[dbId];
        if (recordReplacements[dbId]) delete recordReplacements[dbId];
      }
    }

    return {
      name: "update",
      recordReplacements,
      recordUpdates,
      imageDeallocations,
    }
  }


  async function performAllUpdates(update) {

    // Deallocate deleted
    for (let dbId in update.imageDeallocations) {
      await mockMongoDB.deallocate(dbId);
    }
    
    // Update records
    for (let dbId in update.recordUpdates) {
      const specificUpdates = update.recordUpdates[dbId];
      for (let property in specificUpdates) {
        const value = specificUpdates[property];
        if (value === "_eternity_delete_property_") {
          await mockMongoDB.deleteRecordPath(dbId, [property]);
        } else {
          await mockMongoDB.updateRecordPath(dbId, [property], value);
        }
      }
    }

    // Replace records
    for (let dbId in update.recordReplacements) {
      const replacement = update.recordUpdates[dbId];
      await mockMongoDB.updateRecord(dbId, replacement);
    }
   }


  /****************************************************
  *  Garbage collection 
  ***************************************************/

  /****************************************************
  *  To move later 
  ***************************************************/


  const fs = require("fs");
  function logToFile(entity, pattern, filename) {
    // log(entity);
    // log(pattern);
    let result = objectlog.logToString(entity, pattern);
    fs.writeFile(filename, result, function(err) {
      if(err) {
        return console.log(err);
      }
    }); 
  }

  /****************************************************
  *  Return world 
  ***************************************************/

  Object.assign(world, {
    ...objectWorld, 
    whileLoaded,
    state,
    mockMongoDB,
    logToFile,
    transaction, 
    endTransaction,
    setupDatabase,
    unloadAll, 
    unloadAllAndClearDatabase
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
