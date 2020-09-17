import { getWorld as getCausalityWorld } from  "causalityjs";
import { argumentsToArray, configSignature, mergeInto } from "./lib/utility.js";
import { objectlog } from "./lib/objectlog.js";
import { createDatabase } from "./mockMongoDB.js";
import { setupActivityList } from "./lib/activityList.js";
import { setupGC } from "./lib/flameFrontGC.js";

const log = objectlog.log;
const logg = objectlog.logg.bind(objectlog);

// const log = console.log;

const defaultObjectlog = objectlog;

const defaultConfiguration = {
  objectMetaProperty: "eternity",
  metaPrefix: "_eternity",
  maxNumberOfLoadedObjects : 10000,
  causalityConfiguration : {},
  allowPlainObjectReferences : true,
  classRegistry: {},
  maxFlushToCollectRatio: 10
}
    
function createWorld(configuration) {

  const world = {
    configuration
  };

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
    transactions: [],

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

    stoppingDataBaseWorker: false,

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
  world.state = state; 

  /****************************************************
  *   Database encoding/decoding
  ***************************************************/

  function encodeDbReference(dbId, objectClassName, imageClassName) {
    return "_db_id:" + dbId + ":" + objectClassName + ":" + imageClassName;
  }

  function isDbReference(string) {
    return string.startsWith("_db_id");
  }

  function decodeDbReference(reference) {
    const fragments = reference.split(":");
    return {
      dbId: parseInt(fragments[1]),
      className: fragments[2],
      imageClassName: fragments[3]
    };
  }

  /****************************************************
  *   2 Worlds and a database
  ***************************************************/

  const mockMongoDB = createDatabase(JSON.stringify(configuration));

  const objectWorld = getCausalityWorld({
    name: "objectWorld",
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
    // emitEvents: true, 
    onEventGlobal: event => {
      // log("onEventGlobal (object)");
      // log(event, 2);
      if (event.object[meta].world !== objectWorld) throw new Error("Fatal: Wrong world!");
      // log(state.ignoreEvents);
      if (state.ignoreObjectEvents === 0 && state.ignoreEvents === 0) {
        // log(event);
        state.objectEvents.push(event);
      }
    }
  });

  const imageWorld = getCausalityWorld({
    name: "imageWorld",
    // emitEvents: true,
    objectMetaProperty: meta,
    onEventGlobal: event => {
      if (event.object[meta].world !== imageWorld) throw new Error("Fatal: Wrong world!");
      // log("onEventGlobal (image)")
      // log(event, 2);
      // console.log(event);
      // log("state.ignoreEvents: " + state.ignoreEvents);
      if (state.ignoreImageEvents === 0 && state.ignoreEvents === 0) {
        if (event.type === "create") {
          state.imageCreationEvents.push(event);
        } else {
          // log("pushing event");
          state.imageEvents.push(event);
        }
      }
    },
  });


  /****************************************************
  *  Setup database
  ***************************************************/

  async function releaseControl(time) {
    if (typeof(time) === "undefined") time = 0;
    return new Promise((resolve, reject) => {
      setTimeout(() => { resolve()} , time);
    })
  }

  function startDataBaseWorker() {
    workWithDataBase(); 
  }

  let stopDataBaseWorkerResolve;
  async function stopDataBaseWorker() {
    return new Promise((resolve, reject) => {
      stopDataBaseWorkerResolve = resolve; 
      state.stoppingDataBaseWorker = true;
    })
  }

  let flushesSinceCollect = 0;
  async function workWithDataBase() {

    while (true) {
      let tooManyFlushes = flushesSinceCollect => configuration.maxFlushToCollectRatio;
      let somethingToCollect = !state.gc.isDone(); 
      if (state.transactions.length > 0 && (!tooManyFlushes || !somethingToCollect || state.stoppingDataBaseWorker)) {
        flushesSinceCollect++;
        await pushTransactionToDatabase();
      } else if (state.stoppingDataBaseWorker) {
        // Stop doing GC if we are about to quit (no need, can be done later)
        break;
      } else if (somethingToCollect){
        flushesSinceCollect = 0;
        await releaseControl(0);
        // await state.gc.oneStepCollection();
      } else {
        await releaseControl(0);
      }
    }

    // Terminate worker
    state.stoppingDataBaseWorker = false;
    if (stopDataBaseWorkerResolve) {
      let resolve = stopDataBaseWorkerResolve;
      stopDataBaseWorkerResolve = null;
      resolve();
    }
  }

  async function startDatabase() {
    // log("startDatabase:");
    // log(state.imageEvents.length);

    function protectImages() {
      // Protect images from accidental deallocation
      state.protectedImages = {};
      state.protectedImages[state.persistentDbId] = true; 
      state.protectedImages[state.updateDbId] = true; 
      state.protectedImages[state.collectionDbId] = true; 
    }

    if ((await mockMongoDB.getRecordsCount()) === 0) {
      // Initialize empty database
      // log("initialize empty database...");
      [state.persistentDbId, state.updateDbId, state.collectionDbId] = 
        await Promise.all([
          mockMongoDB.saveNewRecord({ name: "persistent", _eternityIncomingCount : 0}),
          mockMongoDB.saveNewRecord({ name: "updatePlaceholder" }),
          mockMongoDB.saveNewRecord({ name: "garbageCollection" })]);
      protectImages();

      state.gcStateImage = getImage(state.collectionDbId, "Object", "Object");
      world.persistent = getPersistentObject(state.persistentDbId, "Object", "Object");
      state.gc = setupGC(world);
      state.gc.initializeGcState();
      startDataBaseWorker();
      await endTransaction(); 
      // await flushToDatabase(); // Just to flush the image changes done by initializeGcState();
      // log("finished initialize empty database...");
      // await logToFile(world.mockMongoDB.getAllRecordsParsed(), 10, "./databaseDumpAfterInitialize.json");
      // process.exit();
    } else {
      // Reconnect existing database
      // log("reconnect database...");
      state.persistentDbId = 0;
      state.updateDbId = 1;
      state.collectionDbId = 2;
      protectImages();
      
      state.gcStateImage = getImage(state.collectionDbId, "Object", "Object");
      state.ignoreEvents++;
      world.persistent = getPersistentObject(state.persistentDbId, "Object", "Object");
      state.gc = setupGC(world);
      state.ignoreEvents--;
      startDataBaseWorker();
      // log("finish reconnect database...");
    }
    await loadAndPin(world.persistent); // Pin persistent! 
  }

  async function stopDatabase() {
    // log("stopDatabase");
    await stopDataBaseWorker();
  }


  /****************************************************
  *  Get persistent objects
  ***************************************************/

  function createObjectForImage(className, image) {
    // log("createObjectForImage:");
    // log(image[meta].target.A);
    const object = objectWorld.create(createTargetWithClass(className));
      state.ignoreEvents++; // Just in case... 
      object[meta].createObjectForImage = true;
      object[meta].incomingPersistentReferenceCount = null; // We only know after load
      object[meta].incomingReferenceCount = 0;
      object[meta].pins = 0;
      object[meta].target.loaded = false; // Avoid event alltogether.

      // Connect with image
      image[meta].object = object; 
      object[meta].image = image;
      state.ignoreEvents--;
  }

  function getPersistentObject(dbId, className, imageClassName) {
    state.ignoreEvents++;
    const image = getImage(dbId, className, imageClassName);
    if (!image[meta].object) {
      createObjectForImage(className, image);
    }
    state.ignoreEvents--;
    // log("getPersistentObject:");
    // log(image[meta].object);
    return image[meta].object;
  }

  function createImage(dbId, objectClassName, imageClassName) {
    const image = imageWorld.create(createTargetWithClass(objectClassName));
    image._eternityIncomingCount = 0;
    image[meta].createdAsImage = true; 
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
    // log("loadImage");
    const record = await mockMongoDB.getRecord(image[meta].dbId);
    const imageTarget = image[meta].target;
    for (let property in record) {
      const value = record[property];
      // log(property + " : " + value);
      if (property !== "id") {      
        if (typeof(value) === "string" && isDbReference(value)) {
          // log("A reference!!!");
          const reference = decodeDbReference(value);
          // log(reference);
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
      // log("just loaded image");
      // log(image[meta].target.A);
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
      if (!object.loaded){
        await loadObject(object);
      } 
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
  *  System reset, mostly for testing
  ***************************************************/
  
  async function volatileReset(databaseStoppedAlready) {
    // log("volatileReset:")
    // Stop and flush all to database
    if (!databaseStoppedAlready) {
      await endTransaction();
      await stopDatabase();
    }

    // Reset all object ids
    objectWorld.state.nextObjectId = 1;
    imageWorld.state.nextObjectId = 1;

    // Forget all images including persistent object
    state.dbIdToImageMap = {};
    state.rememberedImages = 0;
    delete world.persistent;   // Note: causality.persistent is replaced after an unload... 

    // Restart database
    await startDatabase();
    // log("finish volatileReset...");
  }
    
  async function persistentReset() {
    // log("persistentReset:")
    await endTransaction();
    await stopDatabase();
    await mockMongoDB.clearDatabase();
    await volatileReset(true);
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
    if (state.stoppingDataBaseWorker) throw new Error("Cannot end transaction when database is stopped!");
    return new Promise((resolve, reject) => { 
      // logg("endTransaction:");
      const objectEvents = state.objectEvents; 
      state.objectEvents = null; // Force fail if event!

      // Keep track of incoming references for all objects. 
      // for (let event of objectEvents) {
      //   if (event.type === "set") {
      //     if (event.newValue[meta]) event.newValue[meta].incomingReferenceCount++;
      //     if (event.oldValue[meta]) event.newValue[meta].incomingReferenceCount--; // Try to forgett refered object here?       
      //   }
      // }
      // log("...")

      const transaction = preCreateImagesWithSnapshot(objectEvents);
      transaction.resolvePromise = resolve;
      transaction.rejectPromise = reject;
      state.transactions.push(transaction);
    // log("END TRANSACTION")
    // log(state.transactions, 4)
      
      pinTransaction(transaction);
      state.objectEvents = [];
    });
  }

  function preCreateImagesWithSnapshot(objectEvents) {
  // logg("preCreateImagesWithSnapshot");
    // The purpose of this is to 
    // 1. Filter out non persistent events
    // 2. Save image snapshots of newly persisted objects. It has to be done right away, since their state might change later.

    const newTransaction = {
      objectEvents: [],
      imageCreationEvents: null,
      imageEvents: null
    } 

    // if (state.imageEvents.length > 0) throw new Error("Internal Error: Image event buffer should be empty at this stage!");
    for (let event of objectEvents) {
      const image = event.object[meta].image; 
      if (image) {
        newTransaction.objectEvents.push(event);

        if (event.type === "set") {
          const referedObject = event.newValue[meta];
          if (referedObject) {
            const referedImage = event.newValue[meta].image;
            if (referedObject && !event.newValue[meta].image) {
            // log("here!")
              createImageForObjectRecursive(event.newValue);         
              const referedImage = event.newValue[meta].image; 
              referedImage._eternityNewPersistedRoot = true; 
              referedImage._eternityPersistentParent = image;
              referedImage._eternityPersistentParentProperty = event.property; 
              // Note: Wait with setting the property until later. Now we only prepare the images of the refered data structure.
            }
          }          
        }
      }
    }

    // Collect all the image creation events, to be used for later. note: mixed with settings of _eternityPersistentParent/_eternityPersistentParentProperty
    newTransaction.imageCreationEvents = state.imageCreationEvents; state.imageCreationEvents = [];
    // log(newTransaction.imageCreationEvents, 2);
    newTransaction.imageEvents = state.imageEvents; state.imageEvents = [];
    // logg();
    return newTransaction;
  }


  function createImageForObjectRecursive(object) {
    if (object[meta].image) throw new Error("Object already has an image");
    const className = object.constructor.name;
    const imageClassName = (object instanceof Array) ? "Array" : "Object"; 
    const image = createImage(null, className, imageClassName);
    object[meta].image = image;
    image[meta].object = object;
    state.ignoreEvents++;
    object.loaded = true;
    state.ignoreEvents--;

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
    while (state.transactions.length > 0) {
      // logg("flushToDatabase:");
      await pushTransactionToDatabase();
    }
    // log("flush to database done!")
  } 

  async function pushTransactionToDatabase() {
  // log("pushTransactionToDatabase")
    if (state.transactions.length > 0) {
      const transaction = state.transactions.shift();

      await pushTransactionToImages(transaction);

      // We probably should update GC state here!
      
      const imageEvents = state.imageEvents; state.imageEvents = [];
      // log("imageEvents:")
      // log(imageEvents);
      transaction.imageEvents.forEach(event => imageEvents.push(event)); // Not needed really as these objects will be created...
    // logg("push to database...")
    // log(transaction.imageCreationEvents, 3)
      await twoPhaseComit(transaction.imageCreationEvents, imageEvents);
      // log("unpin...")
      unpinTransaction(transaction);
      // log("resolve...")
      // console.log(transaction.resolvePromise);
      setTimeout(transaction.resolvePromise, 0);
    }
  }

  async function pushTransactionToImages(transaction) {
    // Do the settings and deletes
    for (let event of transaction.objectEvents) {
      if (typeof(event.object[meta].image) !== 'undefined') {

        if (event.type === 'set') {
          // log("setting property of image... ")
          setPropertyOfImage(event.object, event.property, event.newValue, event.oldValue);
        } else if (event.type === 'delete') {
          await unsettingPropertyOfImage(event.object, event.property, event.oldValue);
          const image = event.object[meta].image;
          delete image[event.property];
        }
      }      
    }

    // Fill the newly created images with object snapshots. 
    for (let imageCreation of transaction.imageCreationEvents) {
      const snapshot = imageCreation.object[meta].objectSnapshot;
      const object = imageCreation.object[meta].object;
      delete imageCreation.object[meta].objectSnapshot;
      for (let property in snapshot) {
        if (property !== "loaded") {
          await setPropertyOfImage(object, property, snapshot[property], null);        
        }
      }
    }
  }

  world.encodeIncomingReference = function(property, distinguisher) {
    return metaPrefix + "Incoming:" + property + ":" + distinguisher;
  }

  world.decodeIncomingReference = function(incomingReference) {
    const parts = incomingReference.split(":");
    return {
      property: parts[1],
      distinguisher: parseInt(parts[2])
    }
  }

  world.isIncomingReference = function(string) {
    return string.startsWith(metaPrefix + "Incoming");
  }

  // Unsetting property, used both for delete and for previous value in a normal set. 
  async function unsettingPropertyOfImage(objectWithImage, property, oldValue) {
    // log("unsettingPropertyOfImage");
    // log(objectWithImage);
    // log(property);
    // log(oldValue);
    if (oldValue && oldValue[meta]) {
      const referedObject = oldValue;
      const referedImage = oldValue[meta].image;

      // Mark as unstable
      if (referedImage._eternityPersistentParent === image && referedImage._eternityPersistentParentProperty === property) {
        delete referedImage._eternityPersistentParent;
        delete referedImage._eternityPersistentParentProperty;

        await state.gc.detatchedFromPersistentParent(referedImage); // TODO: Make sure gc internal loadings works..
      }

      // Remove incoming references
      await whileLoaded(referedObject, () => {
        let distinguisher = ""; 
        let currentEncoded = encodeIncomingReference(property, distinguisher); 
        while (referedImage[currentEncoded] && referedImage[currentEncoded] !== image) {
          if (distinguisher === "") {
            distinguisher = 1;
          } else {
            distinguisher++;
          }
          currentEncoded = encodeIncomingReference(property, distinguisher); 
        }
        if (referedImage[currentEncoded] !== image) throw new Error("Could not find incoming reference.");

        delete referedImage[currentEncoded];

        referedImage._eternityIncomingCount--;
      });
    }
  }

  async function setPropertyOfImage(objectWithImage, property, value, oldValue) {
    // log("setPropertyOfImage:");
    const image = objectWithImage[meta].image;

    // Unset previous value
    await unsettingPropertyOfImage(objectWithImage, property, oldValue);
    // log("...");
    // Set new value
    let imageValue;
    if (value[meta]) {
      // log("....");
      const referedObject = value;           
      const referedImage = referedObject[meta].image;
      // log("...");
      if (!referedImage) throw new Error("Internal Error: Expected an image for the object");

      // Set back reference
      await whileLoaded(referedObject, () => {
        let distinguisher = ""; 
        while (referedImage[encodeIncomingReference(property, distinguisher)]) {
          if (distinguisher === "") {
            distinguisher = 1;
          } else {
            distinguisher++;
          }
        }
        referedImage[encodeIncomingReference(property, distinguisher)] = image;
        referedImage._eternityIncomingCount++;
      });

      imageValue = referedImage;
    } else {
      // log("....");
      // log("here...")
      imageValue = value;
    }

    // log("world names")
    // log(objectWithImage[meta].world.name);
    // log(image[meta].world.name);
    // log("really setting property of image...");
    // log(property)
    // log(imageValue)
    // log(state.ignoreEvents);
    if (image[meta].world !== imageWorld) throw new Error("not a proper image");

    image[property] = imageValue;
  }


  /****************************************************
  *  Pushing image events to database
  ***************************************************/

  async function twoPhaseComit(imageCreationEvents, imageEvents) {
    // log("twoPhaseComit");
    /**
     * First phase, write placeholders for all objects that we need to create, get their real ids, and create and save a compiled update with real dbids
     */ 
    // Leave a note at what stage the algorithm is, in case of failure. 
    await mockMongoDB.updateRecord(state.updateDbId, { name: "updatePlaceholder", status: "writing image placeholders"}); 

    // Create all new objects we need. Mark them with "_eternityJustCreated: true" for easy cleanup in case of failure.
    for (let event of imageCreationEvents) {
    // logg("creating images!");
      const image = event.object;
      let dbId = await mockMongoDB.saveNewRecord({_eternityJustCreated : true});  
      setImageDbId(image, dbId);
      
      state.dbIdToImageMap[dbId] = image;
      state.rememberedImages++;
    }
    // await logToFile(world.mockMongoDB.getAllRecordsParsed(), 10, "./databaseDump.json");


    // Augment the update itself with the new ids. 
    const update = compileUpdate(imageCreationEvents, imageEvents);
    // log("update");
    // log(update, 3);

    // Store the update itself so we can continue this update if any crash or power-out occurs while performing it.
    // After the update has been stored, no rollback is possible, only roll-forward and complete the whole update. 
    await mockMongoDB.updateRecord(state.updateDbId, update);


    /**
     * Second phase, performing all the updates, connect to GC list if needed & remove the update.
     */
     // Perform all updates
    await performAllUpdates(update);
    
    // Add all the newly persisted roots to apropriate GC list, if needed

    // Finish, clean up transaction
    // log("cleanup...")
    await mockMongoDB.updateRecord(state.updateDbId, { name: "updatePlaceholder" });
    // log("finish cleanup...")
  }
  

  function compileUpdate(imageCreationEvents, imageEvents) {
    // log("compileUpdate");
    // log(imageCreationEvents)
    // log(imageEvents, 2)
    function serializeImage(image) {
      let serialized = (image instanceof Array) ? [] : {};
      for (let property in image) {
        if (property === meta) throw Error("Meta key should not be in iteration!");
        serialized[property] = serializeReferences(image[property]);
      }
      return serialized;      
    }

    function serializeReferences(entity) {
      if (typeof(entity) === "object" && entity !== null && entity[meta]) {
        return entity[meta].serializedDbId;
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
      // log(event);
      const image = event.object;
      const dbId = image[meta].dbId;
      allImages[dbId] = image; 
      if (!recordReplacements[dbId]) { // Only on non replaced objects. 
        // log("here...")
        // Get specific record updates
        if (typeof(recordUpdates[dbId]) === 'undefined') {
          recordUpdates[dbId] = {};
        }
        const specificRecordUpdates = recordUpdates[dbId];
        // log("and here...")

        // Replace entire record or make targeted property update ajustments
        if (Object.keys(specificRecordUpdates).length === 3) { // At most three property updates
          // Replace entire record
          // log("replace entire record...")
          recordReplacements[dbId] = serializeImage(image);
          delete recordUpdates[dbId];
        } else {
          // Do a targeted property update
          // log("do a specific...")
          if (event.type === 'set') {               
            // log("a set...")
            specificRecordUpdates[event.property] = serializeReferences(event.newValue);
          } else if (event.type === 'delete') {
            specificRecordUpdates[event.property] = "_eternity_delete_property_";          
          }   
        }        
      }
    }

    // Find image to deallocate.
    // Note, upon deallocation they need to be removed from any GC list. 
    for (let dbId in allImages) {
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
    // log("performAllUpdates:");

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
          // log("updateRecordPath:");
          // log(dbId)
          // log(property)
          // log(value)
          await mockMongoDB.updateRecordPath(dbId, [property], value);
        }
      }
    }

    // Replace records
    for (let dbId in update.recordReplacements) {
      // log("replacing...")
      const replacement = update.recordReplacements[dbId];
      await mockMongoDB.updateRecord(dbId, replacement);
      // log("done replace...")
    }
   }


  /****************************************************
  *  Garbage collection 
  ***************************************************/

  /****************************************************
  *  To move later 
  ***************************************************/


  const fs = require("fs");
  async function logToFile(entity, pattern, filename) {
    // log(entity);
    // log(pattern);

    let result = objectlog.logToString(entity, pattern);
    return new Promise((resolve, reject) => {
      fs.writeFile(filename, result, function(err) {
        if(err) {
          return console.log(err);
        }
        resolve();
      }); 
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
    startDatabase,
    stopDatabase,
    volatileReset, 
    persistentReset
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
