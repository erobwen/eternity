

export function setupGC(gcStateImage, configuration) {
  const meta = configuration.objectMetaProperty;
  const metaPrefix = configuration.metaPrefix;

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

    async contains(element) {
      let result;
      await loadAndPin(element);
      const elementImage = element[meta].image;
      result = typeof(element[this.names.memberTag]) !== 'undefined' && element[this.names.memberTag] === true; 
      unpin(element);
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

    async addLast(element) {
      if (await this.contains(element)) return;

      const { first, last, next, previous, memberTag, counter } = this.names;
      const head = this.head; 
      await loadAndPin(element);
      element[memberTag] = true; 
      head[counter]++;
      
      if (head[last] !== null) {
        const lastOfList = head[last];
        await loadAndPin(lastOfList); 
        lastOfList[next] = element;
        element[previous] = lastOfList;
        element[next] = null;
        head[last] = element;
        unpin(lastOfList);
      } else {
        head[first] = element;        
        head[last] = element;       
        element[previous] = null;
        element[next] = null;
      }
      unpin(element);
    }

    async addFirst(element) {
      if (await this.contains(element)) return;

      const { first, last, next, previous, memberTag, counter } = this.names;
      const head = this.head; 
      await loadAndPin(element);
      element[memberTag] = true; 
      head[counter]++;
      
      if (head[first] !== null) {
        const firstOfList = head[first];
        await loadAndPin(firstOfList); 
        firstOfList[previous] = element;
        element[next] = firstOfList;
        element[previous] = null;
        head[first] = element;
        unpin(firstOfList);
      } else {
        head[first] = element;        
        head[last] = element;       
        element[previous] = null;
        element[next] = null;
      }
      unpin(element);
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

    async removeFromList(element) {
      if (inList(element)) {
        const { first, last, next, previous, memberTag, counter } = this.names;
        
        delete element[memberTag];
        head[counter]--;
        
        if(element[next] !== null) {
          const nextElement = element[next]; 
          await loadAndPin(nextElement)
          nextElement[previous] = element[previous];
          unpin(nextElement);
        } 

        if(element[previous] !== null) {
          const previousElement = element[previous];
          await loadAndPin(previousElement)
          previousElement[next] = element[next];
          unpin(previousElement);
        }
        
        if(head[last] === element) {
          head[last] = element[previous];
        }

        if(head[first] === element) {
          head[first] = element[next];
        }
        
        delete element[next];
        delete element[previous];       
      }
    }
  }


  /*-----------------------------------------------
   *           Garbage collection [collecting]
   *-----------------------------------------------*/
  
  // Saving list
  let pendingForChildReattatchment = new PersistentList("PendingForChildReattatchment");

  // Unstable origins
  let pendingUnstableOrigins = new PersistentList("PendingUnstableOrigin");

  // Unstable zone
  let unstableZone = new PersistentList("UnstableZone");
  let unexpandedUnstableZone = new PersistentList("UnexpandedUnstableZone");

  // Destruction zone
  let destructionZone = new PersistentList("DestructionZone");
 
  function initializeGcState() {     
    // Pending unstable origins
    initializeList(gcStateImage, pendingUnstableOrigins);
    
    // Unstable zone
    initializeList(gcStateImage, unstableZone);
    initializeList(gcStateImage, unexpandedUnstableZone);
    // initializeList(gcStateImage, nextUnexpandedUnstableZone);

    // Incoming iteration
    gcStateImage.scanningIncomingFor = null;
    gcStateImage.currentIncomingStructures = null;
    gcStateImage.currentIncomingStructureRoot = null;
    gcStateImage.currentIncomingStructureChunk = null;
          
    // Reattatching
    initializeList(gcStateImage, pendingForChildReattatchment);
    
    // Destruction zone
    initializeList(gcStateImage, destructionZone); 
  }

  async function addUnstableOrigin(pendingUnstableImage) {
    await pendingUnstableImage.addFirst(pendingUnstableImage);
  }

  async function collectAll() {
    let done = false;
    while(!done) {
      done = await oneStepCollection();
      // log(done);
    }
  }
      
  function isUnstable(dbImage) {
    return typeof(dbImage._eternityParent) === 'undefined';
  }

  function unstableOrBeeingForgetedInGcProcess(dbImage) {
    let result = false;
    result = result || inList(pendingUnstableOrigins, dbImage);
    result = result || inList(unstableZone, dbImage);
    result = result || inList(destructionZone, dbImage);
    return result;
  }

  function removeFromAllGcLists(dbImage) {
    removeFromList(gcStateImage, pendingForChildReattatchment, dbImage);
    
    removeFromList(gcStateImage, pendingUnstableOrigins, dbImage);
    removeFromList(gcStateImage, unstableZone, dbImage);
    removeFromList(gcStateImage, unexpandedUnstableZone, dbImage);
    removeFromList(gcStateImage, destructionZone, dbImage);
  }


  function tryReconnectFromIncomingContents(contents) {
    trace.gc && log("tryReconnectFromIncomingContents");
    for(id in contents) {
      if (!id.startsWith("_eternity")) {
        let referer = contents[id];
        // log("Try reconnect with: " + referer.const.name);
        if ((typeof(referer._eternityParent) !== 'undefined' 
          && !inList(unstableZone, referer) // Consider: Do we need to check more zones?
          && !inList(destructionZone, referer)) 
          || referer === instance.persistent.const.dbImage) { // && !inList(destructionZone, referer) && !inList(unstableZone, referer)
          // log("Connecting!!!!");
          gcStateImage.scanningIncomingFor._eternityParent = referer; // TODO: disable incoming relations, should be fine... 
          gcStateImage.scanningIncomingFor._eternityParentProperty = gcStateImage.currentIncomingStructureRoot.property;
          addFirstToList(gcStateImage, pendingForChildReattatchment, gcStateImage.scanningIncomingFor);
          
          // End scanning incoming.
          gcStateImage.scanningIncomingFor = null;
          gcStateImage.currentIncomingStructures = null;
          gcStateImage.currentIncomingStructureRoot = null;
          gcStateImage.currentIncomingStructureChunk = null;
          return true;
        }
      }
    }
    return false; // could not reconnect
  }


  function oneStepCollection() {
    trace.gc && log("oneStepCollection:");
    trace.gc && logGroup();
    if (trace.gc) {
      log(gcStateImage, 1);
    }
    imageCausality.state.incomingStructuresDisabled--;
    let result = imageCausality.pulse(function() {
      
      // Reattatch 
      if (!isEmptyList(gcStateImage, pendingForChildReattatchment)) {
        // log("<<<<           >>>>>");
        trace.gc && log("<<<< reattatch >>>>>");
        // log("<<<<           >>>>>");
        let current = removeFirstFromList(gcStateImage, pendingForChildReattatchment);
        
        for (let property in current) {
          if (property !== 'incoming') {
                          imageCausality.state.incomingStructuresDisabled++;
                          let value = current[property];
                          imageCausality.state.incomingStructuresDisabled--;
            // TODO: fillDbImageFromCorrespondingObject here somehow?... what if we are going through destructed images? foobar
            // console.log(instance.persistent);
            // console.log(instance.persistent);
                          if (imageCausality.isObject(value) && isUnstable(value) && instance.persistent.const.dbImage !== value) { // Has to exists!
                              let referedImage = value;
                              if(trace.gc) log("reconnecting " + referedImage.const.name + "!");
                              referedImage._eternityParent = current;
                              referedImage._eternityParentProperty = property;
                              addLastToList(gcStateImage, pendingForChildReattatchment, referedImage);
                              removeFromAllGcLists(referedImage);
                          }  
          }             
        }

        return false;
      }
      
      // Expand unstable zone
      if (!isEmptyList(gcStateImage, unexpandedUnstableZone)) {
        // log("<<<<                        >>>>>");
        trace.gc && log("<<<< expand unstable zone   >>>>>");
        logGroup();
        // log("<<<<                        >>>>>");
        let dbImage = removeFirstFromList(gcStateImage, unexpandedUnstableZone);
        // log(dbImage.const.name);
        // dbImage = removeFirstFromList(gcStateImage, unexpandedUnstableZone);
        // log(dbImage.const.name);
        // log("dbImage:");
        // log(dbImage);
        // Consider: Will this cause an object pulse??? No... just reading starts no pulse...
        for (let property in dbImage) {
          logGroup();
          if (!property.startsWith(metaPrefix) && property !== 'incoming') {             
            // log("expanding property: " + property)
            imageCausality.state.incomingStructuresDisabled++; // Activate macro events.
            // log(imageCausality.state);
            let value = dbImage[property];
            imageCausality.state.incomingStructuresDisabled--; // Activate macro events.
            if (imageCausality.isObject(value)) {
              // log("value:");
              // log(value);
              if (value._eternityParent === dbImage && property === value._eternityParentProperty) {
                // log("adding a child to unstable zone");
                addLastToList(gcStateImage, unexpandedUnstableZone, value);
                addLastToList(gcStateImage, unstableZone, value);
                delete value._eternityParent; // This signifies that an image (if connected to an object), is unstable. If set to > 0, it means it is a root.
                delete value._eternityParentProperty;
                // log(value, 2);
              }
            }
          }
          logUngroup();
        }
        logUngroup();
        // gcStateImage.unstableUnexpandedZoneFirst.
        return false;
      };

      // Iterate incoming, try to stabilize...
      if(gcStateImage.scanningIncomingFor === null && !isEmptyList(gcStateImage, unstableZone)) {
        // log("<<<<                        >>>>>");
        trace.gc && log("<<<< Iterate incoming       >>>>>");
        // log("<<<<                        >>>>>");
        let currentImage = removeFirstFromList(gcStateImage, unstableZone);
        // log(currentImage.const.name);
        if (typeof(currentImage.incoming) !== 'undefined') {
          gcStateImage.scanningIncomingFor = currentImage;
          gcStateImage.currentIncomingStructures = currentImage.incoming;
          gcStateImage.currentIncomingStructureRoot = currentImage.incoming.first;
          gcStateImage.currentIncomingStructureChunk = null;
          
          if (tryReconnectFromIncomingContents(gcStateImage.currentIncomingStructureRoot.contents)) {
            // Reconnected with root
            gcStateImage.scanningIncomingFor = null;
            gcStateImage.currentIncomingStructures = null;
            gcStateImage.currentIncomingStructureRoot = null;
            gcStateImage.currentIncomingStructureChunk = null;
            // log("WTF happened!");
            // log(gcStateImage);
            return false;
          }
          
          if (gcStateImage.currentIncomingStructureRoot.first !== null) {
            gcStateImage.currentIncomingStructureChunk = gcStateImage.currentIncomingStructureRoot.first;
          } else {
            // Has no more chunks! Fail
            addLastToList(gcStateImage, destructionZone, gcStateImage.scanningIncomingFor);
            
            gcStateImage.scanningIncomingFor = null;
            gcStateImage.currentIncomingStructures = null;
            gcStateImage.currentIncomingStructureRoot = null;
            gcStateImage.currentIncomingStructureChunk = null;
          }
        } else {
          // Has no more chunks! Fail
          addLastToList(gcStateImage, destructionZone, currentImage);
        }
        return false;
      }


      // Scan incoming in progress, continue with it
      if (gcStateImage.scanningIncomingFor !== null) {
        // log("<<<<                        >>>>>");
        trace.gc && log("<<<< Scan in progress...... >>>>>");
        // log("<<<<                        >>>>>");
        // log(gcStateImage.currentIncomingStructureChunk);
        
        // Scan in chunk
        if (gcStateImage.currentIncomingStructureChunk !== null) {
          // Check in the contents directly, see if we find incoming.
          if (tryReconnectFromIncomingContents(gcStateImage.currentIncomingStructureChunk.contents)) {
            return false;
          }
          gcStateImage.currentIncomingStructureChunk = gcStateImage.currentIncomingStructureChunk.next;
          return false;
        }
        
        // Swap to a new incoming property
        if (gcStateImage.currentIncomingStructureRoot !== null) {
          gcStateImage.currentIncomingStructureRoot = gcStateImage.currentIncomingStructureRoot.next;
          if(gcStateImage.currentIncomingStructureRoot === null) {
            addLastToList(gcStateImage, destructionZone, gcStateImage.scanningIncomingFor);
          } else {
            if (tryReconnectFromIncomingContents(gcStateImage.currentIncomingStructureRoot.contents)) {
              return false;
            }           
            gcStateImage.currentIncomingStructureChunk = gcStateImage.currentIncomingStructureRoot.first;
            return false;
          }
        }
      }
      
      // Destroy those left in the destruction list. (no need to deallocate, they will deallocate naturally when they have no incoming left)
      if (!isEmptyList(gcStateImage, destructionZone)) {
        // log("<<<<                 >>>>>");
        trace.gc && log("<<<< Destroy ......  >>>>>");          
        let toDestroyImage = removeFirstFromList(gcStateImage, destructionZone);
        let object = toDestroyImage.const.correspondingObject;
                  
        for(let property in object) {
          if(property !== 'incoming' && property !== 'observers') {
            delete object[property]; 
          }
        }
        
        return false;
      }
      
            
      // Start a new zone.
      if (!isEmptyList(gcStateImage, pendingUnstableOrigins)) {
        // log("<<<<                        >>>>>");
        trace.gc && log("<<<< Start new zone ......  >>>>>");
        // log("<<<<                        >>>>>");

        // Start new unstable cycle.
        let newUnstableZone = removeFirstFromList(gcStateImage, pendingUnstableOrigins);
        
        // log(inList(pendingUnstableOrigins, newUnstableZone));
        // log(newUnstableZone);
        // delete newUnstableZone['_eternityPendingUnstableOriginPrevious'];
        // log(newUnstableZone);
        // throw new Error("fuck!");
        
        addFirstToList(gcStateImage, unstableZone, newUnstableZone);
        addFirstToList(gcStateImage, unexpandedUnstableZone, newUnstableZone);
        delete newUnstableZone._eternityParent;
        delete newUnstableZone._eternityParentProperty;
        // gcStateImage.unstableZoneDepth = 1;
        return false;
      } else {
        // Finally! everything is done
        // log("<<<<                 >>>>>");
        trace.gc && log("<<<< Finished......  >>>>>");
        // log("<<<<                 >>>>>");
        return true;
      }
    });
    logUngroup();
    imageCausality.state.incomingStructuresDisabled++;
    return result;
  }

  return {
    initializeGcState, 
    addUnstableOrigin,
    isDone: () => { return true; },
    oneStepCollection,
    collectAll
  }
}