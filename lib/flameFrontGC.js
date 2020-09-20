

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
            object[meta].immutable = true; // lock object so user code cannot mess up the garbage collection. 
            image[meta].immutable = true; // In case there are already transactions modifying this inbound.
          }
        }
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
    unableToReattachList
  }
}

