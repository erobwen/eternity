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
  const { classRegistry, metaPrefix } = configuration;

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

    activityList: setupActivityList(meta)
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
    onWriteGlobal: (handler, target) => {
      if (handler.meta.immutable) return false; 
      return true; 
    },
    // onReadGlobal: (handler, target) => {
    //   return true;
    //   // handler.meta
    //   // handler.target
    //   // handler.proxy
    // }, 
    // emitEvents: true,
    onEventGlobal: event => {
      if (event.object[meta].world !== objectWorld) throw new Error("Fatal: Wrong world!");

      updateIncomingCounters(event);
      if (state.ignoreObjectEvents === 0 && state.ignoreEvents === 0) {
        state.objectEvents.push(event);
      }
    }
  });

  function isObject(entity) {
    return typeof(entity) === "object" && entity !== null && entity[meta] && entity[meta].world === objectWorld;
  }

  function decreaseIncomingCounter(object) {
    object[meta].incomingReferences--;
    if (object[meta].incomingReferences === 0 && object[meta].image && !object.loaded) {
      forgetPersistentObject(object);
    }
  }

  function increaseIncomingCounter(object) {
    object[meta].incomingReferences++;
  }

  function updateIncomingCounters(event) {
    // TODO: register incoming counts. Forget images.. 
    if (event.type === "set") {
      if (typeof(event.oldValue) === "object" && event.oldValue !== null && event.oldValue[meta]) {
        decreaseIncomingCounter(event.oldValue);
      }
      if (typeof(event.newValue) === "object" && event.newValue !== null && event.newValue[meta]) {
        increaseIncomingCounter(event.newValue);
      }
    } else if (event.type === "delete") {
      if (typeof(event.deletedValue) === "object" && event.deletedValue !== null && event.deletedValue[meta]) {
        decreaseIncomingCounter(event.deletedValue);
      }
    } else if (event.type === "create") {
      event.object[meta].incomingReferences = 0;
      for (let property in event.object) {
        const initialValue = event.object[property];
        if (typeof(initialValue) === "object" && initialValue !== null && initialValue[meta]) {
          increaseIncomingCounter(initialValue);
        }
      }
    }   
  }

  const imageWorld = getCausalityWorld({
    name: "imageWorld",
    // emitEvents: true,
    objectMetaProperty: meta,
    onWriteGlobal: (handler, target) => {
      if (handler.meta.immutable) return false; 
      return true; 
    },
    onEventGlobal: event => {
      if (event.object[meta].world !== imageWorld) throw new Error("Fatal: Wrong world!");
      // og("onEventGlobal (image)")
      // og(event, 2);
      // console.log(event);
      // og("state.ignoreEvents: " + state.ignoreEvents);
      if (state.ignoreImageEvents === 0 && state.ignoreEvents === 0) {
        if (event.type === "create") {
          state.imageCreationEvents.push(event);
        } else {
          // og("pushing event");
          state.imageEvents.push(event);
        }
      }
    },
  });

  function isImage(entity) {
    return typeof(entity) === "object" && entity !== null && entity[meta] && entity[meta].world === imageWorld;
  }


  /****************************************************
  *  System reset, mostly for testing
  ***************************************************/
  
  async function volatileReset(databaseStoppedAlready) {
    // Stop and flush all to database
    if (!databaseStoppedAlready) {
      // logg("volatileReset:")
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
    // og("finish volatileReset...");
  }
    
  async function persistentReset() {
    // logg("persistentReset:")
    await endTransaction();
    await stopDatabase();
    await mockMongoDB.clearDatabase();
    await volatileReset(true);
  }


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
        await state.gc.oneStepCollection();
        await pushImageChangesToDatabase();
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
    // logg("startDatabase:");
    // og(state.imageEvents.length);

    async function setupBaseObjects(initialize) {
      // GC state
      state.gcStateImage = getImageFromDbId(state.collectionDbId, "Object", "Object");
      state.gcStateImage[meta].protectedPersistent = true;
      state.gcStateObject = getPersistentObjectFromDbId(state.collectionDbId, "Object", "Object");
      await loadAndPin(state.gcStateObject);

      // Update object
      state.upsateImage = getImageFromDbId(state.updateDbId, "Object", "Object");
      state.upsateImage[meta].protectedPersistent = true;
      state.updateObject = getPersistentObjectFromDbId(state.updateDbId, "Object", "Object");
      await loadAndPin(state.updateObject);
      
      // Persistent
      state.persistentImage = getImageFromDbId(state.persistentDbId, "Object", "Object");
      state.persistentImage[meta].protectedPersistent = true;
      state.persistentObject = getPersistentObjectFromDbId(state.persistentDbId, "Object", "Object");
      await loadAndPin(state.persistentObject)
      world.persistent = state.persistentObject;

      // Setup / initialize garbage collector
      state.gc = setupGC(world);
      if (initialize) {
        state.gc.initializeGcState();
      } 
    } 

    if ((await mockMongoDB.getRecordsCount()) === 0) {
      // Initialize empty database
      // log("initialize empty database...");
      [state.persistentDbId, state.updateDbId, state.collectionDbId] = 
        await Promise.all([
          mockMongoDB.saveNewRecord({ name: "persistent", _eternityIncomingPersistentCount : 0, _eternityOutgoingPersistentCount : 0}),
          mockMongoDB.saveNewRecord({ name: "updatePlaceholder" }),
          mockMongoDB.saveNewRecord({ name: "garbageCollection" })]);
      await setupBaseObjects("initialize");
    } else {
      // Reconnect existing database
      // log("reconnect database...");
      state.persistentDbId = 0;
      state.updateDbId = 1;
      state.collectionDbId = 2;
      await setupBaseObjects();
    }
    startDataBaseWorker();
    await endTransaction(); 
  }

  async function stopDatabase() {
    // og("stopDatabase");
    await stopDataBaseWorker();
  }


  /****************************************************
  *  Get persistent objects
  ***************************************************/

  function createObjectForImage(className, image) {
    // og("createObjectForImage:");
    // og(image[meta].target.A);
    if (!isImage(image)) throw new Error("Needs an image!");
    const object = objectWorld.create(createTargetWithClass(className));
      object[meta].pins = 0;
      object[meta].target.loaded = false; // Avoid event alltogether.

      // Connect with image
      image[meta].object = object; 
      object[meta].image = image;
  }

  function getPersistentObjectFromDbId(dbId, className, imageClassName) {
    state.ignoreEvents++;
    const image = getImageFromDbId(dbId, className, imageClassName);
    if (!image[meta].object) {
      createObjectForImage(className, image);
    }
    const object = image[meta].object; 
    if (!object[meta].image) throw new Error("Object does not have an image");
    state.ignoreEvents--;
    // og("getPersistentObject:");
    // og(image[meta].object);
    return object;
  }

  function forgetPersistentObject(object) {
    const image = object[meta].image; 
    
    // Mark object as forgotten (so we can do something if someone tries to load it)
    object[meta].dbId = image[meta].dbId; // To create ghosts?
    object[meta].isForgotten = true; 

    delete image[meta].object;
    delete object[meta].image;
    forgetImageWithDbId(object[meta].image[meta].dbId);
  }

  function createImage(dbId, objectClassName, imageClassName) {
    const image = imageWorld.create(createTargetWithClass(objectClassName));
    image[meta].createdAsImage = true; 
    image[meta].objectClassName = objectClassName;
    image[meta].imageClassName = imageClassName;

    if (dbId === null) {
      // Creating a new image for saving
      image._eternityIncomingPersistentCount = 0;
      image._eternityOutgoingPersistentCount = 0;
    } else if (typeof(dbId) === "number") {
      // Creating a new image for loading
      setImageDbId(image, dbId);
    }

    return image;
  }

  function setImageDbId(image, dbId) {
    const metaObject = image[meta];
    metaObject.dbId = dbId;
    metaObject.serializedDbId = encodeDbReference(dbId, metaObject.objectClassName, metaObject.imageClassName);
  }

  function getImageFromDbId(dbId, className, imageClassName) {
    if (typeof(state.dbIdToImageMap[dbId]) === 'undefined') {
      state.ignoreEvents++;
      const image = createImage(dbId, className, imageClassName);
      state.ignoreEvents--;
      state.dbIdToImageMap[dbId] = image;
      state.rememberedImages++;
    }
    return state.dbIdToImageMap[dbId];
  }

  function forgetImageWithDbId(dbId) {
    delete state.dbIdToImageMap[dbId]; // This is what lets the system survive! Ignorance is bliss. 
    state.rememberedImages--;
  }
  
  /****************************************************
  *  Loading objects
  ***************************************************/

  async function loadImage(image) {
    // ogg("loadImage");
    const record = await mockMongoDB.getRecord(image[meta].dbId);
    const imageTarget = image[meta].target;
    for (let property in record) {
      const value = record[property];
      //og(property + " : " + value);
      if (property !== "id") {      
        if (typeof(value) === "string" && isDbReference(value)) {
          // og("A reference!!!");
          const reference = decodeDbReference(value);
          // og(reference);
          imageTarget[property] = getImageFromDbId(reference.dbId, reference.className, reference.imageClassName);
        } else {
          imageTarget[property] = value;
        }      
      }
    }
  }

  async function loadObject(object) {
    if (object[meta].isForgotten) throw new Error("Cannot load forgotten object, please do not hold on to unloaded object references indefinitley. Get your objects freshly loaded from the world.persistent object.");
    function imageValueToObjectValue(imageValue) {
      if (isImage(imageValue)) {
        const image = imageValue; 
        if (!image[meta].object) {
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
      // og("just loaded image");
      // og(image[meta].target.A);
      const imageTarget = image[meta].target;
      const objectTarget = object[meta].target;
      for (let property in imageTarget) {
        if (!world.isIncomingReference(property) && property !== "loaded") {
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

  function unloadObject(object) {
    const image = object[meta].image;
    state.ignoreEvents++; // No events to push   
    for (let property of object) {
      delete object[property]
    }
    for (let property of image) {
      // if (!property.startsWith(metaPrefix)) {
      delete image[property]
      // }
    }
    object.loaded = false; // Possibly Trigger reactions.
    state.ignoreEvents--;
  }


  async function loadAndPin(objectOrImage) {
    let object;
    if (isObject(objectOrImage)) {
      object = objectOrImage; 
    } else if (isImage(objectOrImage)) {
      object = objectOrImage[meta].object;
    }

    if (object[meta].image) {
      if (!object.loaded){
        await loadObject(object);
      } 
      pin(object);
    }  else {
      // og(object);
      // og(object[meta]);
      throw new Error("Cannot load and pin non-persistent object");
    }
  }

  async function whileLoaded(object, action) {
    await loadAndPin(object);
    action()
    unpin(object);
  }

  function pin(objectOrImage) {
    let object;
    if (isObject(objectOrImage)) {
      object = objectOrImage; 
    } else if (isImage(objectOrImage)) {
      object = objectOrImage[meta].object;
    }

    object[meta].pins++;
    if (object[meta].pins === 1) state.pinnedObjects++;
    const image = object[meta].image;
    if (!isImage(image)) throw new Error("Cannot pin non persisted object.");
    // state.activityList.removeFromActivityList(object);
  }

  function unpin(objectOrImage) {
    let object;
    if (isObject(objectOrImage)) {
      object = objectOrImage; 
    } else if (isImage(objectOrImage)) {
      object = objectOrImage[meta].object;
    }

    object[meta].pins--;
    if (object[meta].pins === 0) {
      state.pinnedObjects--;
    }
    const image = object[meta].image;
    // og(object);
    // og(object[meta]);
    if (!isImage(image)) throw new Error("Cannot unpin non persisted object.");
    // state.activityList.registerActivity(object);
    tryUnload();
  } 

  function tryUnload() {
    const pinned = state.pinnedObjects;
    const unpinned = state.activityList.count;
    const unpinnedLimit = 0; 
    // const totalLoaded = pinned + unpinned;
    // const memoryLimit = 10000 + pinned;
    if (state.activityList.count > unpinnedLimit) {
      const object = state.activityList.getLast();
      unloadObject(object);
      // try forgetting objects somehow
    }
  }


  /****************************************************
  *  Transactions
  ***************************************************/

  // Note: You typically do not need to wait for the promise returned, unless you want to be sure that the data has been stored persistently. 
  // If not, the changes will be queued upp and persisted gradually, which is fine in most cases.
  
  // Note II: The action argument can not be async. This means all data needed in the transaction needs to be loaded beforehand. 
  async function transaction(action) { 
    if (state.objectEvents.length > 0) endTransaction();
    action(); // We do not wait for action, as it is not allowed to be async. 
    return await endTransaction();
  }

  // Note: You typically do not need to wait for the promise returned, unless you want to be sure that the data has been stored persistently. 
  // If not, the changes will be queued upp and persisted gradually, which is fine in most cases.
  async function endTransaction(express) {
    if (state.stoppingDataBaseWorker) throw new Error("Cannot end transaction when database is stopped!");
    return new Promise((resolve, reject) => { 
      const objectEvents = state.objectEvents; 
      state.objectEvents = null; // Force fail if event!

      const transaction = preCreateImagesWithSnapshot(objectEvents);
      transaction.resolvePromise = resolve;
      transaction.rejectPromise = reject;
      if (express){
        state.transactions.unshift(transaction);
      } else {
        state.transactions.push(transaction);
      }
      
      pinTransaction(transaction);
      state.objectEvents = [];
    });
  }

  function preCreateImagesWithSnapshot(objectEvents) {
  // ogg("preCreateImagesWithSnapshot");
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
      const object = event.object; 
      const image = object[meta].image; 
      if (image) {
        newTransaction.objectEvents.push(event);

        if (event.type === "set" && event.newValue !== null && event.newValue[meta]) {
          const referedObject = event.newValue[meta];
          if (referedObject) {
            const referedImage = event.newValue[meta].image;
            if (referedObject && !event.newValue[meta].image) {
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
    // og(newTransaction.imageCreationEvents, 2);
    newTransaction.imageEvents = state.imageEvents; state.imageEvents = [];
    // ogg();
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
        createImageForObjectRecursive(referedObject);
        const referedImage = referedObject[meta].image;

        // Only create gc parent properties for now   
        referedImage._eternityPersistentParent = image;
        referedImage._eternityPersistentParentProperty = property;    
      }
    }
  }

  function pinTransaction(transaction) {
    for (let event of transaction.objectEvents) {
      const object = event.object;
      pin(event.object);
    } 
    for (let event of transaction.imageCreationEvents) {
      const createdImage = event.object;
      const createdObject = createdImage[meta].object;
      pin(createdObject);
    }
  }

  function unpinTransaction(transaction) {
    for (let event of transaction.objectEvents) {
      unpin(event.object);
    }
    for (let event of transaction.imageCreationEvents) {
      const createdImage = event.object;
      const createdObject = createdImage[meta].object;
      unpin(createdObject);
    }
  }


  /****************************************************
  *  Pushing transactions to images
  ***************************************************/

  // TODO: Take into account that images might have changed due to gc when the change is applied. 

  async function flushToDatabase() {
    while (state.transactions.length > 0) {
      await pushTransactionToDatabase();
    }
  } 

  async function pushTransactionToDatabase() {
    if (state.transactions.length > 0) {
      const transaction = state.transactions.shift();
      
      await pushTransactionToImages(transaction);
      await pushImageChangesToDatabase(transaction);  
    }
  }

  async function pushTransactionToImages(transaction) {
    // Do the settings and deletes
    for (let event of transaction.objectEvents) {
      const object = event.object;
      if (!typeof(object[meta].image)) {
        continue; // Object has been dealloated while transaction was waiting to be pushed.
      } else {
        if (event.type === 'set') {
          setPropertyOfImage(object, event.property, event.newValue, event.oldValue);
        } else if (event.type === 'delete') {
          await unsettingPropertyOfImage(object, event.property, event.oldValue);
          const image = object[meta].image;
          delete image[event.property];
        }
      }
    }

    // Fill the newly created images with object snapshots. 
    for (let imageCreation of transaction.imageCreationEvents) {
      const image = imageCreation.object;
      const snapshot = image[meta].objectSnapshot;
      const object = image[meta].object;
      delete imageCreation.object[meta].objectSnapshot;
      for (let property in snapshot) {
        if (property !== "loaded") {
          await setPropertyOfImage(object, property, snapshot[property], null);        
        }
      }

      // Setup gc state
      if (image._eternityNewPersistedRoot) {
        const persistentParentObject = image._eternityPersistentParent[meta].object;
        const persistentParentImage = persistentParentObject[meta].image;
        await loadAndPin(persistentParentObject); // Consider: can there be a situation where this is deallocated already? What happens then?
        if (!persistentParentImage._eternityPersistentParent && persistentParentImage !== world.persistent[meta].image) {
          // Parent is not attached, mark as just detatched it so we can continue propagate detatchment.
          state.gc.justDetatchedList.addLast(image);
        }
        unpin(persistentParentObject);
      }
    }
  }

  function encodeIncomingReference(property, distinguisher) {
    return metaPrefix + "Incoming:" + property + ":" + distinguisher;
  }
  world.encodeIncomingReference = encodeIncomingReference; 

  function decodeIncomingReference(incomingReference) {
    const parts = incomingReference.split(":");
    return {
      property: parts[1],
      distinguisher: parseInt(parts[2])
    }
  }
  world.decodeIncomingReference = decodeIncomingReference;

  world.isIncomingReference = function(string) {
    return string.startsWith(metaPrefix + "Incoming");
  }

  // Unsetting property, used both for delete and for previous value in a normal set. 
  async function unsettingPropertyOfImage(objectWithImage, property, oldValue) {
    const image = objectWithImage[meta].image; 
    if (oldValue && oldValue[meta]) {
      const referedObject = oldValue;
      const referedImage = oldValue[meta].image;
      await loadAndPin(referedObject);

      // Notify detatched to gc
      if (referedImage._eternityPersistentParent === image && referedImage._eternityPersistentParentProperty === property) {
        delete referedImage._eternityPersistentParent;
        delete referedImage._eternityPersistentParentProperty;

        await state.gc.detatchedFromPersistentParent(referedImage);
      }

      // Remove incoming references
      let distinguisher = ""; 
      let reverseProperty = encodeIncomingReference(property, distinguisher); 
      while (referedImage[reverseProperty] && referedImage[reverseProperty] !== image) {
        if (distinguisher === "") {
          distinguisher = 1;
        } else {
          distinguisher++;
        }
        reverseProperty = encodeIncomingReference(property, distinguisher); 
      }
      if (referedImage[reverseProperty] !== image) throw new Error("Could not find incoming reference.");

      delete referedImage[reverseProperty];
      referedImage._eternityIncomingPersistentCount--;
      image._eternityOutgoingPersistentCount--;

      unpin(referedObject);
    }
  }

  async function setPropertyOfImage(objectWithImage, property, value, oldValue) {
    const image = objectWithImage[meta].image;
    if (!isImage(image)) throw new Error("not a proper image");

    // Unset previous value
    await unsettingPropertyOfImage(objectWithImage, property, oldValue);

    // Set new value
    let imageValue;
    if (value !== null && typeof(value) === "object" && value[meta]) {
      const referedObject = value;           
      const referedImage = referedObject[meta].image;

      // Refered image has been deallocated. 
      if (!referedImage) {
        state.ignoreEvents++; // Ignore events, since we do not want this deletion to be propagated again downwards.
        setTimeout(() => {delete object[property];}, 0); // Change the object itself, since we cannot make this property setting.
        // Note: Do a proper delete for potential observers to catch this. But do it in a timeout so we dont have the data base worker go into UI or other stuff. 
        state.ignoreEvents--;
        return; // Ignore property setting since the refered image has been deallocated. 
      }

      await loadAndPin(referedObject);

      // Reattatch if unattatched
      if (!referedImage._eternityPersistentParent) {
        referedImage._eternityPersistentParent = image;
        referedImage._eternityPersistentParentProperty = property;
        await state.gc.justReattatchedList.addLast(referedImage);
      }

      // Set back reference
      let distinguisher = ""; 
      while (referedImage[encodeIncomingReference(property, distinguisher)]) {
        if (distinguisher === "") {
          distinguisher = 1;
        } else {
          distinguisher++;
        }
      }
      referedImage[encodeIncomingReference(property, distinguisher)] = image;
      referedImage._eternityIncomingPersistentCount++;
      image._eternityOutgoingPersistentCount++;

      unpin(referedObject);
      
      imageValue = referedImage;
    } else {
      imageValue = value;
    }

    image[property] = imageValue;
  }


  /****************************************************
  *  Pushing image events to database
  ***************************************************/

  async function pushImageChangesToDatabase(transaction) {
    if (!transaction) {
      transaction = {
        imageCreationEvents: [],
        imageEvents: []
      } 
    }

    const imageEvents = state.imageEvents; state.imageEvents = [];
    imageEvents.forEach(event => transaction.imageEvents.push(event));

    await twoPhaseComit(transaction.imageCreationEvents, transaction.imageEvents);
    unpinTransaction(transaction);
    setTimeout(transaction.resolvePromise, 0);
  }


  async function twoPhaseComit(imageCreationEvents, imageEvents) {
    // ogg("twoPhaseComit");

    /**
     * First phase, write placeholders for all objects that we need to create, get their real ids, and create and save a compiled update with real dbids
     */ 
    // Leave a note at what stage the algorithm is, in case of failure. 
    await mockMongoDB.updateRecord(state.updateDbId, { name: "updatePlaceholder", status: "writing image placeholders"}); 

    // Create all new objects we need. Mark them with "_eternityJustCreated: true" for easy cleanup in case of failure.
    for (let event of imageCreationEvents) {
    // ogg("creating images!");
      const image = event.object;
      let dbId = await mockMongoDB.saveNewRecord({_eternityJustCreated : true});  
      setImageDbId(image, dbId);
      
      state.dbIdToImageMap[dbId] = image;
      state.rememberedImages++;
    }

    // Augment the update itself with the new ids. 
    const update = compileUpdate(imageCreationEvents, imageEvents);

    // Store the update itself so we can continue this update if any crash or power-out occurs while performing it.
    // After the update has been stored, no rollback is possible, only roll-forward and complete the whole update. 
    await mockMongoDB.updateRecord(state.updateDbId, update);


    /**
     * Second phase, performing all the updates, connect to GC list if needed & remove the update.
     */
    // og("second phase... perform update");
    // og(update, 3);

     // Perform all updates
    await performAllUpdates(update);
    
    // Add all the newly persisted roots to apropriate GC list, if needed

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
      if (typeof(entity) === "object" && entity !== null && entity[meta]) {
        return entity[meta].serializedDbId;
      } else {
        return entity;
      }
    }

    const imageDeallocations = {};
    const recordReplacements = {};
    const recordUpdates = {};
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
      // og(event);
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
          // og("replace entire record...")
          recordReplacements[dbId] = serializeImage(image);
          delete recordUpdates[dbId];
        } else {
          // Do a targeted property update
          // og("do a specific...")
          if (event.type === 'set') {               
            // og("a set...")
            specificRecordUpdates[event.property] = serializeReferences(event.newValue);
          } else if (event.type === 'delete') {
            specificRecordUpdates[event.property] = "_eternity_delete_property_";          
          }   
        }        
      }
    }
    
    // Find images to deallocate
    // For a pinned object, it should be allowed to deallocate or purge, but not forget.
    for (let dbId in allImages) {
      const image = allImages[dbId];
      const object = image[meta].object;
      
      if (!image[meta].protectedPersistent  
        && image._eternityIncomingPersistentCount === 0
        && image._eternityOutgoingPersistentCount === 0) {
        
        // Decouple from object 
        delete object[meta].image;
        delete image[meta].object;

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
      recordUpdates
    }
  }


  async function performAllUpdates(update) {
    // og("performAllUpdates:");

    // Deallocate deleted
    if (update.imageDeallocations) {
      for (let dbId in update.imageDeallocations) {
        await mockMongoDB.deallocate(dbId);
      }
    }

    // Update records
    for (let dbId in update.recordUpdates) {
      const specificUpdates = update.recordUpdates[dbId];
      for (let property in specificUpdates) {
        const value = specificUpdates[property];
        if (value === "_eternity_delete_property_") {
          await mockMongoDB.deleteRecordPath(dbId, [property]);
        } else {
          // og("updateRecordPath:");
          // og(dbId)
          // og(property)
          // og(value)
          await mockMongoDB.updateRecordPath(dbId, [property], value);
        }
      }
    }

    // Replace records
    for (let dbId in update.recordReplacements) {
      // og("replacing...")
      const replacement = update.recordReplacements[dbId];
      await mockMongoDB.updateRecord(dbId, replacement);
      // og("done replace...")
    }
  }


  /****************************************************
  *  To move later 
  ***************************************************/


  const fs = require("fs");
  async function logToFile(entity, pattern, filename) {
    // og(entity);
    // og(pattern);

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
    loadAndPin,
    unpin,
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
