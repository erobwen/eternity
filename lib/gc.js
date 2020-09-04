
/*-----------------------------------------------
 *          Double Linked list helper
 *-----------------------------------------------*/


let eternityTag = "_eternity";

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

export function setupGC(gcStateImage) {

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
    // log("addUnstableOrigin");
    // log(pendingUnstableImage);
    imageCausality.disableIncomingRelations(function() {
      if (!inList(pendingUnstableOrigins, pendingUnstableImage)) {
        // TODO: Go through loadings here, make sure they work... 
        addFirstToList(gcStateImage, pendingUnstableOrigins, pendingUnstableImage);          
      }
    });
  }


  // function getFirstPendingUnstableObject() {
    // let firstImage = removeFirstFromList(gcStateImage, pendingUnstableOrigins); 
    // // if (inList(gcStateImage, pendingUnstableOrigins, firstImage)) {
    // // }
    // log("Here");
    // log(inList(gcStateImage, pendingUnstableOrigins, firstImage));
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
    removeFromList(gcStateImage, pendingForChildReattatchment, dbImage);
    
    removeFromList(gcStateImage, pendingUnstableOrigins, dbImage);
    removeFromList(gcStateImage, unstableZone, dbImage);
    removeFromList(gcStateImage, unexpandedUnstableZone, dbImage);
    // removeFromList(gcStateImage, nextUnexpandedUnstableZone, dbImage);
    removeFromList(gcStateImage, destructionZone, dbImage);
    removeFromList(gcStateImage, deallocationZone, dbImage);
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
    addUnstableOrigin
  }
}