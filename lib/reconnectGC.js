/**
  Reconnect Garbage Collector Algorithm

  by Robert Renbris


  Overview: 

  The working principles of the garbge collector is: Local Disconnect, Reconnect, Clear and Deallocate. It works 
  fundamentally different from traditional GC algorithms such as Mark & Sweep, and is especially designed to work
  with persistent memory, where only a small part of the data can be loaded at one given moment and where the 
  application code may change data at any time during the algorithm is running. It is also designed to work 
  incrementally in steps of constant size. The algorithm is based on the concept of inverse references, where the
  database is set up so that for every reference it stores, a specially encoded inverse reference is stored.  


  The algorithm works as follows:

  1. The object structures in the data graphs all have a common ancestor that is a specific persistent object, henceforth called THE persistent object.

  2. As data is added to the database, a spanning tree is constructed, where the persistent object is the root. The spanning 
     tree is formed out of a subset of all references in the data base. The parent of an object in this spanning tree is called
     the persistent parent. 

  3. Whenever data is disconnected from it parent in this spanning tree, the  procedure of disconnection begins. 
    All children of the detached root are iterated and disconnected, meaning its reference to its persistent parent is removed. 
    However, they are stored in a linked list for further processing (toBeReattachedList).    

  4. When there are no more objects to disconnect, all disconnected objects are iterated once more (using toBeReattachedList), but 
    this time we examine their incoming references, to see if one of them is a reference from a non disconnected node. 
    If so, then reconnection starts. This is only possible since the system stores inverse references on every object.
    Objects that have no incoming references from non disconnected objects are stored in another list (unableToReattachList)
    for further processing. 

  5. During reconnection, the spanning tree expands into the disconnected objects, that now become connected. The 
    reconnection phase has priority over disconnection, meaning we reconnect everything we can reconnect as soon as possible.
    Note that if a reconnected object is in toBeReattachedList or unableToReattachList it is then removed from that list upon 
    reconnection.

  6. If there is nothing more to reconnect, and nothing more to disconnect, the algorithm then proceeds into clearing mode. 
    All objects of unableToReattachList are iterated, and each object are cleared of any data, marked with
    clearedByGarbageCollector = true, for the application to see, and it is also write protected.

  7. When an object has been cleared, and its outgoing and incoming reference counter is 0, it is deallocated. When this happens, the application 
     object corresponding to the data base object is marked as non-persistent. Since there are no more incoming references, the data base
     ID used by the deallocated object, can instantly be reused by a new object. (note: The code for this part of the algorithm can be found in 
     eternity.js)


  Application Interaction: 

  It is assumed that during the whole process, application code might modify any object that is a part of the process:

  a) Application code might reconnect disconnected objects, this immediatley starts the process of reconnection. 

  b) Application code might connect disconnected objects with new data structures. In this situation it is important to continue
    the cascading disconnection into the new data structures.    

  c) If an object has been cleared but still not deallocated, it is write protected as long as it is not reconnected to 
    the persistent spanning tree by the application.  


  Object clearing destructive property: 

  It is important to note that the garbage collector will clear any object that the garbage collector is unable to reconnect. Therefore, 
  once data is stored persistently, there is no way to "get it back" to being just non persistent. For example: 

    let x = myDataStructure(); // The data structure x is now just in memory, not persistent.
    
    // Store x persistently. 
    persistent.x = x;

    // Remove x from persistent storage 
    delete persistent.x;

    // wait on gc to complete...

    // x (the variable) is now an empty object. the original data structure no longer exists, not even in memory.

  So, if you have a persistent data structure that you wish to retreive back into memory and then remove from persistent 
  storage, the only way you can safely do it is through explicit data structure copying BEFORE you disconnect it. 


  Dividing the work into parts:
  
  The algorithm can be modified using a list (justDetatchedByApplicationList) to keep track of nodes that just got detatched 
  by application. This way we can run steps 1-7 for an object detatched by the application, before we do the same for the next
  object detatched by the application. This way we can complete the collection process in one area of the data base, 
  while there are still detatchments waiting for processessing in an other area of the database. This makes it possible to reuse
  deallocated object space earlier, meaning decreased time to delivery. However, in the case where consequtive disconnects are in fact
  adjacent to each other, and influence each other, the over all efficiency of the algorithm will go down as individual objects 
  might go through several phases of disconnect/reconnect before the algorithm terminates. 


  About this algorithm: 

  This algorithm was invented by the author of this package, to my knowledge I dont know if this approach has been 
  attempted by any one else. 

  There are other, quite different, attemts to construct a garbage collector for object data bases, such as: 

    https://www.researchgate.net/publication/220473696_Garbage_Collection_in_Object-Oriented_Databases_Using_Transactional_Cyclic_Reference_Counting. 
*/

export function setupGC(world) {
  const { 
    state, 
    configuration, 
    encodeIncomingReference, 
    decodeIncomingReference, 
    isIncomingReference, 
    loadAndPin, 
    unpin } = world;
  const { gcStateImage } = state; 
  const meta = configuration.objectMetaProperty;
  const metaPrefix = configuration.metaPrefix;
  const persistentImage = world.persistent[meta].image; 
  const persistent = world.persistent;

  let allListsEmpty = true; 

  /*-----------------------------------------------
   *          Double Linked list helper
   *-----------------------------------------------*/

  class PersistentList {

    constructor(name) {
      this.head = gcStateImage; 
      this.names = {
        first : metaPrefix + name + "First", 
        last : metaPrefix + name + "Last",
        counter : metaPrefix + name + "Counter", 
        
        memberTag : metaPrefix + name + "Member",
        next : metaPrefix + name + "Next", 
        previous : metaPrefix + name + "Previous"  
      }
    }

    initialize() {
      const names = this.names; 
      this.head[names.first] = null;
      this.head[names.last] = null;
      this.head[names.counter] = 0;
    }

    async contains(object) {
      let result;
      await loadAndPin(object);
      const image = object[meta].image;
      result = typeof(image[this.names.memberTag]) !== 'undefined' && image[this.names.memberTag] === true; 
      unpin(object);
      return result; 
    }

    isEmpty() {
      return this.head[this.names.first] === null;
    }

    last() {
      return head[this.names.last];
    }

    first() {
      return head[this.names.first];
    }

    async addLast(image) {
      allListsEmpty = false;

      const object = image[meta].object;
      if (await this.contains(object)) return;

      const { first, last, next, previous, memberTag, counter } = this.names;
      const head = this.head; 
      await loadAndPin(image);
      image._eternityIncomingPersistentCount += 2;
      image[memberTag] = true; 
      head[counter]++;
      
      if (head[last] !== null) {
        const lastOfList = head[last];
        await loadAndPin(lastOfList); 
        lastOfList[next] = image;
        image[previous] = lastOfList;
        image[next] = null;
        head[last] = image;
        unpin(lastOfList);
      } else {
        head[first] = image;        
        head[last] = image;       
        image[previous] = null;
        image[next] = null;
      }
      unpin(image);
    }

    async addFirst(image) {
      allListsEmpty = false;

      const object = image[meta].object;
      if (await this.contains(object)) return;

      const { first, last, next, previous, memberTag, counter } = this.names;
      const head = this.head; 
      await loadAndPin(image);
      image._eternityIncomingPersistentCount += 2;
      image[memberTag] = true; 
      head[counter]++;
      
      if (head[first] !== null) {
        const firstOfList = head[first];
        await loadAndPin(firstOfList); 
        firstOfList[previous] = image;
        image[next] = firstOfList;
        image[previous] = null;
        head[first] = image;
        unpin(firstOfList);
      } else {
        head[first] = image;        
        head[last] = image;       
        image[previous] = null;
        image[next] = null;
      }
      unpin(image);
    }

    async removeLast() {
      let lastElement = head[this.names.last];
      await removeFromList(lastElement);
      return lastElement;
    }

    async removeFirst() {
      let firstElement = head[this.names.first];
      await removeFromList(firstElement);
      return firstElement;
    }

    async removeFromList(image) {
      const object = image[meta].object;
      loadAndPin(object)
      if (await this.contains(object)) {
        image._eternityIncomingPersistentCount -= 2;
        const { first, last, next, previous, memberTag, counter } = this.names;
        
        delete image[memberTag];
        head[counter]--;
        
        if(image[next] !== null) {
          const nextElement = image[next]; 
          await loadAndPin(nextElement)
          nextElement[previous] = image[previous];
          unpin(nextElement);
        } 

        if(image[previous] !== null) {
          const previousElement = image[previous];
          await loadAndPin(previousElement)
          previousElement[next] = image[next];
          unpin(previousElement);
        }
        
        if(head[last] === image) {
          head[last] = image[previous];
        }

        if(head[first] === image) {
          head[first] = image[next];
        }
        
        delete image[next];
        delete image[previous];       
      }
      unpin(image);
    }
  }


  /*-----------------------------------------------
   *           Garbage collection [collecting]
   *-----------------------------------------------*/
  
  // Unstable origins
  let justDetatchedByApplicationList = new PersistentList("JustDetatchedByApplicationList");

  // Saving list
  let justReattatchedList = new PersistentList("JustReattatchedList");

  // Unstable zone
  let toBeReattachedList = new PersistentList("ToBeReattachedList");
  let justDetatchedList = new PersistentList("JustDetatchedList");

  // Destruction zone
  let unableToReattachList = new PersistentList("UnableToReattachList");
 
  function initializeGcState() {
    gcStateImage.name = "garbageCollectionState";

    // Pending unstable origins
    justDetatchedByApplicationList.initialize();
    
    // Unstable zone
    toBeReattachedList.initialize();
    justDetatchedList.initialize();
         
    // Reattatching
    justReattatchedList.initialize();
    
    // Destruction zone
    unableToReattachList.initialize(); 
  }

  function inCollectionProcess(object) {
    if (!object[meta].target.loaded) {
      throw new Error("Expected a loaded object");
    }
    const image = object[meta].image;
    return justDetatchedByApplicationList.contains(image)
      || toBeReattachedList.contains(image)
      || justDetatchedList.contains(image)
      || justReattatchedList.contains(image)
      || unableToReattachList.contains(image);
  }

  async function detatchedFromPersistentParent(unstableImage) {
    await justDetatchedByApplicationList.addLast(unstableImage);
  }

  async function collectAll() {
    let done = false;
    while(!done) {
      done = await oneStepCollection();
    }
  }

  function isDetatched(image) {
    return (typeof(image._eternityPersistentParent) === "undefined") && referedImage !== persistentImage;
  }

  async function forAllIncomingLoaded(image, action) {
    for(property in image) {
      if (isIncomingReference(property)) {
        const referer = image[property];
        const decoded = decodeIncomingReference(property)
        const incomingProperty = decoded.property;

        await loadAndPin(referer[meta].object);
        await action(referer, incomingProperty);
        unpin(referer[meta].object);
      }
    }
  } 

  async function forAllReferedLoaded(image, action) {
    for (let property in image) {
      if (!property.startsWith(metaPrefix)) {
        const value = image[property];
        if (value[meta]) {
          await loadAndPin(value[meta].object);
          await action(value, property);
          unpin(value[meta].object)
        }
      }
    }
  }

  async function isUnstable(image) {
    await loadAndPin(image[meta].object);
    const result = typeof(image._eternityPersistentParent) === 'undefined';
    unpin(image[meta].object);
  }

  function removeFromAllGcLists(image) {
    justReattatchedList.remove(image);
    justDetatchedByApplicationList.remove(image);
    toBeReattachedList.remove(image);
    justDetatchedList.remove(image);
    unableToReattachList.remove(image);
  }

  async function reattatchChildren(image) {   
    await forAllReferedLoaded(image, async referedImage => {
      if (await isUnstable(referedImage) && persistentImage !== referedImage) {
        referedImage._eternityPersistentParent = image;
        referedImage._eternityPersistentParentProperty = property;
        removeFromAllGcLists(referedImage);
        await justReattatchedList.addLast(referedImage);
      }
    });
  }

  async function continueDetatch(image) {
    await forAllReferedLoaded(image, async (referedImage, property) => {
      if (referedImage._eternityPersistentParent === image && property === referedImage._eternityPersistentParentProperty) {
        await justDetatchedList.addLast(referedImage);
        delete referedImage._eternityPersistentParent;
        delete referedImage._eternityPersistentParentProperty;

        await toBeReattachedList.addLast(image);
      }
    });
  }


  async function tryReconnectFromIncoming(image) {
    forAllIncomingLoaded(image, async (referer, incomingProperty) => {
      if (!isDetatched(image)) {
        image._eternityPersistentParent = referer
        image._eternityPersistentParentProperty = referer          
        await justReattatchedList.addLast(image);
        return true;
      }
    });
    return false;
  }

  async function oneStepCollection() {
    // Reattatch 
    if (!justReattatchedList.isEmpty()) {
      const image = await justReattatchedList.removeFirst();
      reattatchChildren(image);
      return false;
    }
    
    // Expand unstable zone
    if (!justDetatchedList.isEmpty()) {
      const image = await justDetatchedList.removeFirst();
      continueDetatch(image);
      return false;
    };

    // Iterate incoming, try to stabilize...
    if (!toBeReattachedList.isEmpty()) {
      const image = await toBeReattachedList.removeFirst();
      tryReconnectFromIncoming(image)
      return false;
    }

    // Destroy those left in the destruction list. (no need to deallocate, they will deallocate naturally when they have no incoming left)
    if (!unableToReattachList.isEmpty()) {
      let image = await unableToReattachList.removeFirst();
      let object = image[meta].object;
      // startTransaction();
      setTimeout(() => {
        startTransaction();      
        loadAndPin(object);                
        for(let property in object) {
          if(!property.startsWith(metaPrefix)) {
            delete object[property];
          }
        }
        object.clearedByGarbageCollector = true; // Leave a message to the appliaction. 
        // Image and object is now write protected as they are not part of the collection
        // process, and they are not connected. 

        unpin(object);
        endTransaction("express");
      }, 0)

      // endTransaction();
      return false;
    }
    
          
    // Start a new zone.
    if (!justDetatchedByApplicationList.isEmpty()) {
      const image = await justDetatchedByApplicationList.removeFirst();
      await justDetatchedList.addLast(image);
      return false;
    }

    // Finally, nothing more to collect!!!
    return true;
    allListsEmpty = true;
  }

  return {
    initializeGcState, 
    detatchedFromPersistentParent,
    isDone: () => { return allListsEmpty; },
    oneStepCollection,
    collectAll,
    justDetatchedByApplicationList,
    justReattatchedList,
    toBeReattachedList,
    justDetatchedList,
    unableToReattachList, 
    inCollectionProcess
  }
}

