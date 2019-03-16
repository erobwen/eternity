// Using UMD pattern: https://github.com/umdjs/umd
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory); // Support AMD
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(); // Support NodeJS
    } else {
        root.eternityGC = factory(); // Support browser global
    }
}(this, function () {
  
  let eternity;
  let eternityTag = "_eternity";
  
  /*-----------------------------------------------
   *          Double Linked list helper
   *-----------------------------------------------*/
  
  function createListType(name) {
    return {
      first : eternityTag + name + "First", 
      last : eternityTag + name + "Last",
      counter : eternityTag + name + "Counter", 
      
      memberTag : eternityTag + name + "Member",
      next : eternityTag + name + "Next", 
      previous : eternityTag + name + "Previous"	
    };
  }
  
  function inList(listType, listElement) {
    // log("inList");
    // log(listType.memberTag);
    return typeof(listElement[listType.memberTag]) !== 'undefined' && listElement[listType.memberTag] === true;
  }
  
  function isEmptyList(head, listType) {
    // log()
    return head[listType.first] === null;
  }
  
  // function detatchAllListElements(head, listType) {
    // head[listType.first] = null;
    // head[listType.last] = null;			
  // }
  
  // function replaceEntireList(head, listType, firstElement, lastElement) {
    // head[listType.first] === firstElement;
    // head[listType.last] === lastElement;
  // }
  
  function initializeList(head, listType) {
    head[listType.first] = null;
    head[listType.last] = null;
    head[listType.counter] = 0;
  }
  
  function addLastToList(head, listType, listElement) {
    let first = listType.first;
    let last = listType.last;
    let next = listType.next;
    let previous = listType.previous;

    listElement[listType.memberTag] = true; 
    head[listType.counter]++;
    
    if (head[last] !== null) {
      head[last][next] = listElement;
      listElement[previous] = head[last];
      listElement[next] = null;
      head[last] = listElement;
    } else {
      head[first] = listElement;				
      head[last] = listElement;				
      listElement[previous] = null;
      listElement[next] = null;
    }
  }
  
  function addFirstToList(head, listType, listElement) {
    // if (trace.eternity) log("addFirstToList:");
    // logGroup();
    let first = listType.first;
    let last = listType.last;
    let next = listType.next;
    let previous = listType.previous;
    
    listElement[listType.memberTag] = true; 
    head[listType.counter]++;
    
    if (head[first] !== null) {
      head[first][previous] = listElement;
      listElement[next] = head[first];
      listElement[previous] = null;
      head[first] = listElement;
    } else {
      head[first] = listElement;				
      head[last] = listElement;				
      // imageCausality.trace.basic = true;
      listElement[previous] = null;
      listElement[next] = null;
      // imageCausality.trace.basic = false;
    }
    // logUngroup();
  }
  
  function getLastOfList(head, listType) {
    return head[listType.last];
  }

  function getFirstOfList(head, listType) {
    return head[listType.first];
  }
  
  function removeLastFromList(head, listType) {
    let lastElement = head[listType.last];
    removeFromList(head, listType, lastElement);
    return lastElement;
  }

  function removeFirstFromList(head, listType) {
    let firstElement = head[listType.first];
    removeFromList(head, listType, firstElement);
    return firstElement;
  }
  
  function removeFromList(head, listType, listElement) {
    // log("removeFromList");
    // log(listType);
    if (inList(listType, listElement)) {
      // log("removeFromList");
      // log(listType);
      // log(listElement);
      let first = listType.first;
      let last = listType.last;
      let next = listType.next;
      let previous = listType.previous;
      
      delete listElement[listType.memberTag];
      head[listType.counter]--;
      
      if(listElement[next] !== null) {
        // log(listElement);
        listElement[next][previous] = listElement[previous];
      } 

      if(listElement[previous] !== null) {
        listElement[previous][next] = listElement[next];
      }
      
      if(head[last] === listElement) {
        head[last] = listElement[previous];
      }
      if(head[first] === listElement) {
        head[first] = listElement[next];
      }
      
      delete listElement[listType.memberTag];
      delete listElement[next];
      delete listElement[previous];				
    } else {
      // throw new Error("WTF");
      // log("not in list!");
    }
  }
  
  
    /*-----------------------------------------------
   *           Garbage collection [collecting]
   *-----------------------------------------------*/
  
  // TODO: Remove this... 
  function deallocateInDatabase(dbImage) {
    // trace.deallocate && 
    trace.gc && log("deallocateInDatabase: " + dbImage.const.id + ", " + dbImage.const.dbId);
    // log(dbImage, 2);
    if (typeof(dbImage[eternityTag + "_to_deallocate"]) === 'undefined') {			
      // if (typeof(dbImage.const.dbId) === 'undefined') {
        // log("Beeep!");
        // throw new Error("Deallocating an image that has no dbId");				
      // }
      // dbImage.const.dbIdToDeallocate = dbImage.const.dbId;
      // dbImage[eternityTag + "_to_deallocate"] = "true";
      // dbImage[eternityTag + "dbIdTodeallocate"] = dbImage.const.dbId;
      dbImage[eternityTag + "_to_deallocate"] = true;
      dbImage[eternityTag + "Persistent"] = false;
      // dbImage[eternityTag + "_to_deallocate"] = dbImage.const.dbId;
      // dbImage._eternityDeallocate = true;
      // mockMongoDB.deallocate(dbImage.const.dbId);
      delete dbImage.const.correspondingObject.const.dbImage;
      delete dbImage.const.correspondingObject.const.dbId;
      delete dbImage.const.correspondingObject;
      // delete dbImage.const.dbId;
      // delete dbImage.const.tmpDbId;
    }
  }
  
  // Main state-holder image
  let gcState; 
    
  // Saving list
  let pendingForChildReattatchment = createListType("PendingForChildReattatchment");
  
  // Unstable origins
  let pendingUnstableOrigins = createListType("PendingUnstableOrigin");
  
  // Unstable zone
  let unstableZone = createListType("UnstableZone");
  let unexpandedUnstableZone = createListType("UnexpandedUnstableZone");
  // let unexpandedUnstableZone = createListType("UnexpandedUnstableZone", "UnstableUnexpandedZone");
  // let nextUnexpandedUnstableZone = createListType("NextUnexpandedUnstableZone", "UnstableUnexpandedZone");

  // Destruction zone
  let destructionZone = createListType("DestructionZone");
  let deallocationZone = createListType("DeallocationZone");
  
  function initializeGcState(givenGcState) {			
  	gcState = givenGcState;

    // Pending unstable origins
    initializeList(gcState, pendingUnstableOrigins);
    
    // Unstable zone
    initializeList(gcState, unstableZone);
    initializeList(gcState, unexpandedUnstableZone);
    // initializeList(gcState, nextUnexpandedUnstableZone);

    // Incoming iteration
    gcState.scanningIncomingFor = null;
    gcState.currentIncomingStructures = null;
    gcState.currentIncomingStructureRoot = null;
    gcState.currentIncomingStructureChunk = null;
          
    // Reattatching
    initializeList(gcState, pendingForChildReattatchment);
    
    // Destruction zone
    initializeList(gcState, destructionZone);	
    initializeList(gcState, deallocationZone);	
  }
  
  function addUnstableOrigin(pendingUnstableImage) {
    // log("addUnstableOrigin");
    // log(pendingUnstableImage);
    eternity.imageCausality.disableIncomingRelations(function() {
      if (!inList(pendingUnstableOrigins, pendingUnstableImage)) {
        addFirstToList(gcState, pendingUnstableOrigins, pendingUnstableImage);					
      }
    });
  }
  
  
  // function getFirstPendingUnstableObject() {
    // let firstImage = removeFirstFromList(gcState, pendingUnstableOrigins);	
    // // if (inList(gcState, pendingUnstableOrigins, firstImage)) {
    // // }
    // log("Here");
    // log(inList(gcState, pendingUnstableOrigins, firstImage));
    // log(firstImage);
    // throw new Error("fuck!");
    // return getObjectFromImage(firstImage);
  // }
  
  function collectAll() {
    let done = false;
    while(!done) {
      done = oneStepCollection();
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
    result = result || inList(deallocationZone, dbImage);
    return result;
  }
  
  function removeFromAllGcLists(dbImage) {
    removeFromList(gcState, pendingForChildReattatchment, dbImage);
    
    removeFromList(gcState, pendingUnstableOrigins, dbImage);
    removeFromList(gcState, unstableZone, dbImage);
    removeFromList(gcState, unexpandedUnstableZone, dbImage);
    // removeFromList(gcState, nextUnexpandedUnstableZone, dbImage);
    removeFromList(gcState, destructionZone, dbImage);
    removeFromList(gcState, deallocationZone, dbImage);
  }
  
  
  function tryReconnectFromIncomingContents(contents) {
    trace.gc && log("tryReconnectFromIncomingContents");
    for(id in contents) {
      if (!id.startsWith("_eternity")) {
        let referer = contents[id];
        // log("Try reconnect with: " + referer.const.name);
        if ((typeof(referer._eternityParent) !== 'undefined' 
          && !inList(unstableZone, referer) 
          && !inList(destructionZone, referer)) 
          || referer === eternity.persistent.const.dbImage) { // && !inList(destructionZone, referer) && !inList(unstableZone, referer)
          // log("Connecting!!!!");
          gcState.scanningIncomingFor._eternityParent = referer; // TODO: disable incoming relations, should be fine... 
          gcState.scanningIncomingFor._eternityParentProperty = gcState.currentIncomingStructureRoot.property;
          addFirstToList(gcState, pendingForChildReattatchment, gcState.scanningIncomingFor);
          
          // End scanning incoming.
          gcState.scanningIncomingFor = null;
          gcState.currentIncomingStructures = null;
          gcState.currentIncomingStructureRoot = null;
          gcState.currentIncomingStructureChunk = null;
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
      log(gcState, 1);
    }
    imageCausality.state.incomingStructuresDisabled--;
    let result = imageCausality.pulse(function() {
      
      // Reattatch 
      if (!isEmptyList(gcState, pendingForChildReattatchment)) {
        // log("<<<<           >>>>>");
        trace.gc && log("<<<< reattatch >>>>>");
        // log("<<<<           >>>>>");
        let current = removeFirstFromList(gcState, pendingForChildReattatchment);
        
        for (let property in current) {
          if (property !== 'incoming') {
                          imageCausality.state.incomingStructuresDisabled++;
                          let value = current[property];
                          imageCausality.state.incomingStructuresDisabled--;
            // TODO: fillDbImageFromCorrespondingObject here somehow?... what if we are going through destructed images? foobar
            // console.log(eternity.persistent);
            // console.log(eternity.persistent);
                          if (imageCausality.isObject(value) && isUnstable(value) && eternity.persistent.const.dbImage !== value) { // Has to exists!
                              let referedImage = value;
                              if(trace.gc) log("reconnecting " + referedImage.const.name + "!");
                              referedImage._eternityParent = current;
                              referedImage._eternityParentProperty = property;
                              addLastToList(gcState, pendingForChildReattatchment, referedImage);
                              removeFromAllGcLists(referedImage);
                          }  
          }							
        }

        return false;
      }
      
      // // Move to next zone expansion TODO: what is this???? ... forgotten comment out?
      // if (isEmptyList(gcState, unexpandedUnstableZone) && !isEmptyList(gcState, nextUnexpandedUnstableZone)) {
        // log("<<<<                                    >>>>>");
        // log("<<<< Move to nextUnexpandedUnstableZone >>>>>");
        // log("<<<<                                    >>>>>");
        // let first = getFirstOfList(gcState, nextUnexpandedUnstableZone);
        // let last = getLastOfList(gcState, nextUnexpandedUnstableZone);
        // detatchAllListElements(gcState, nextUnexpandedUnstableZone);
        // replaceEntireList(gcState, unexpandedUnstableZone, first, last);
        // return false;
      // }
      
      // Expand unstable zone
      if (!isEmptyList(gcState, unexpandedUnstableZone)) {
        // log("<<<<                        >>>>>");
        trace.gc && log("<<<< expand unstable zone   >>>>>");
        logGroup();
        // log("<<<<                        >>>>>");
        let dbImage = removeFirstFromList(gcState, unexpandedUnstableZone);
        // log(dbImage.const.name);
        // dbImage = removeFirstFromList(gcState, unexpandedUnstableZone);
        // log(dbImage.const.name);
        // log("dbImage:");
        // log(dbImage);
        // Consider: Will this cause an object pulse??? No... just reading starts no pulse...
        for (let property in dbImage) {
          logGroup();
          if (!property.startsWith(eternityTag) && property !== 'incoming') {							
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
                addLastToList(gcState, unexpandedUnstableZone, value);
                addLastToList(gcState, unstableZone, value);
                delete value._eternityParent; // This signifies that an image (if connected to an object), is unstable. If set to > 0, it means it is a root.
                delete value._eternityParentProperty;
                // log(value, 2);
              }
            }
          }
          logUngroup();
        }
        logUngroup();
        // gcState.unstableUnexpandedZoneFirst.
        return false;
      };

      // Iterate incoming, try to stabilize...
      if(gcState.scanningIncomingFor === null && !isEmptyList(gcState, unstableZone)) {
        // log("<<<<                        >>>>>");
        trace.gc && log("<<<< Iterate incoming       >>>>>");
        // log("<<<<                        >>>>>");
        let currentImage = removeFirstFromList(gcState, unstableZone);
        // log(currentImage.const.name);
        if (typeof(currentImage.incoming) !== 'undefined') {
          gcState.scanningIncomingFor = currentImage;
          gcState.currentIncomingStructures = currentImage.incoming;
          gcState.currentIncomingStructureRoot = currentImage.incoming.first;
          gcState.currentIncomingStructureChunk = null;
          
          if (tryReconnectFromIncomingContents(gcState.currentIncomingStructureRoot.contents)) {
            // Reconnected with root
            gcState.scanningIncomingFor = null;
            gcState.currentIncomingStructures = null;
            gcState.currentIncomingStructureRoot = null;
            gcState.currentIncomingStructureChunk = null;
            // log("WTF happened!");
            // log(gcState);
            return false;
          }
          
          if (gcState.currentIncomingStructureRoot.first !== null) {
            gcState.currentIncomingStructureChunk = gcState.currentIncomingStructureRoot.first;
          } else {
            // Has no more chunks! Fail
            addLastToList(gcState, destructionZone, gcState.scanningIncomingFor);
            
            gcState.scanningIncomingFor = null;
            gcState.currentIncomingStructures = null;
            gcState.currentIncomingStructureRoot = null;
            gcState.currentIncomingStructureChunk = null;
          }
        } else {
          // Has no more chunks! Fail
          addLastToList(gcState, destructionZone, currentImage);
        }
        return false;
      }


      // Scan incoming in progress, continue with it
      if (gcState.scanningIncomingFor !== null) {
        // log("<<<<                        >>>>>");
        trace.gc && log("<<<< Scan in progress...... >>>>>");
        // log("<<<<                        >>>>>");
        // log(gcState.currentIncomingStructureChunk);
        
        // Scan in chunk
        if (gcState.currentIncomingStructureChunk !== null) {
          // Check in the contents directly, see if we find incoming.
          if (tryReconnectFromIncomingContents(gcState.currentIncomingStructureChunk.contents)) {
            return false;
          }
          gcState.currentIncomingStructureChunk = gcState.currentIncomingStructureChunk.next;
          return false;
        }
        
        // Swap to a new incoming property
        if (gcState.currentIncomingStructureRoot !== null) {
          gcState.currentIncomingStructureRoot = gcState.currentIncomingStructureRoot.next;
          if(gcState.currentIncomingStructureRoot === null) {
            addLastToList(gcState, destructionZone, gcState.scanningIncomingFor);
          } else {
            if (tryReconnectFromIncomingContents(gcState.currentIncomingStructureRoot.contents)) {
              return false;
            }						
            gcState.currentIncomingStructureChunk = gcState.currentIncomingStructureRoot.first;
            return false;
          }
        }
      }
      
      // Destroy those left in the destruction list. 
      if (!isEmptyList(gcState, destructionZone)) {
        // log("<<<<                 >>>>>");
        trace.gc && log("<<<< Destroy ......  >>>>>");
        // log("<<<<                 >>>>>");
        
        // When i2 is unpersited:
        // first load from i2 to o2 to make sure no info is lost.
        // o1 ->  o2  ->  o3
        //  |      x      |
        // i1 ->  i2 -x-> i3
        
        let toDestroy = removeFirstFromList(gcState, destructionZone);
        
        // Make sure that object beeing destroyed is loaded, so that no data is lost. Dissconnect from image, decrease loaded objects count.
        objectCausality.pokeObject(toDestroy.const.correspondingObject);
        delete toDestroy.const.correspondingObject.const.dbImage;
        delete toDestroy.const.correspondingObject.const.dbId;
        delete toDestroy.const.correspondingObject;
        loadedObjects--;
      
        for(let property in toDestroy) {
          if(property !== 'incoming' && property !== '_eternityIncomingCount' && property !== 'id') {
            // log(property);
            imageCausality.state.incomingStructuresDisabled++; // Activate macro events.
            delete toDestroy[property]; 
            imageCausality.state.incomingStructuresDisabled--;
          }
        }
        
        // The destroyed image should be cleaned up automatically as incoming references to it should be going down to 0 eventually (there is no spanning tree and all siblings are getting destroyed)

        return false;
      }
      
      // // Destroy those left in the destruction list. 
      // if (!isEmptyList(gcState, deallocationZone)) {
        // // log("<<<<                    >>>>>");
        // // log("<<<< Deallocate ......  >>>>>");
        // // log("<<<<                    >>>>>");
        
        // let toDeallocate = removeFirstFromList(gcState, deallocationZone);
        // // Make sure that object beeing destroyed is loaded.
        // deallocateInDatabase(toDeallocate);
        
        // loadedObjects--;
        // return false;
      // }
      
      
            
      // Start a new zone.
      if (!isEmptyList(gcState, pendingUnstableOrigins)) {
        // log("<<<<                        >>>>>");
        trace.gc && log("<<<< Start new zone ......  >>>>>");
        // log("<<<<                        >>>>>");

        // Start new unstable cycle.
        let newUnstableZone = removeFirstFromList(gcState, pendingUnstableOrigins);
        
        // log(inList(pendingUnstableOrigins, newUnstableZone));
        // log(newUnstableZone);
        // delete newUnstableZone['_eternityPendingUnstableOriginPrevious'];
        // log(newUnstableZone);
        // throw new Error("fuck!");
        
        addFirstToList(gcState, unstableZone, newUnstableZone);
        addFirstToList(gcState, unexpandedUnstableZone, newUnstableZone);
        delete newUnstableZone._eternityParent;
        delete newUnstableZone._eternityParentProperty;
        // gcState.unstableZoneDepth = 1;
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
  
  function reattatchIfInGCProcess(imageValue) {
    if (unstableOrBeeingForgetedInGcProcess(imageValue)) {
      // log("here...filling");
      imageValue._eternityParent = object.const.dbImage;
      imageValue._eternityParentProperty = property;
      if (inList(deallocationZone, imageValue)) {
        fillDbImageFromCorrespondingObject(imageValue); 							
      }
      addFirstToList(gcState, pendingForChildReattatchment, imageValue);
      
      removeFromAllGcLists(imageValue);
    }
  }
  
  return {
    setEternity: function(givenEternity) {
      eternity = givenEternity;
      return this;
    },
    oneStepCollection : oneStepCollection, 
    collectAll : collectAll,
    initializeGcState : initializeGcState,
    unstableOrBeeingForgetedInGcProcess : unstableOrBeeingForgetedInGcProcess,
    addUnstableOrigin : addUnstableOrigin,
    reattatchIfInGCProcess: reattatchIfInGCProcess
  };
}));
