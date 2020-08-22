
  /************************************************************************
   *
   *   Object activity list
   *
   ************************************************************************/
export function createActivityList(filter) {

  const activityListFilter = filter;
  let activityListFirst = null; 
  let activityListLast = null; 
  let activityListFrozen = 0;
  
  function getActivityListFirst() {
    return (activityListFirst !== null) ? activityListFirst.meta.proxy : null;
  }
  
  function getActivityListLast() {
    return (activityListLast !== null) ? activityListLast.meta.proxy : null;
  }

  function getActivityListPrevious(object) {
    return object.causality.activityListPrevious.proxy;
  }

  function getActivityListNext(object) {
    return object.causality.activityListNext.proxy;
  }
  
  function pokeObject(object) {
    let tmpFrozen = activityListFrozen;
    activityListFrozen = 0;
    registerActivity(object);
    activityListFrozen = tmpFrozen;
  }
  
  function freezeActivityList(action) {
    activityListFrozen++;
    action();
    activityListFrozen--;
  }
  
  function logActivityList() {
    activityListFrozen++;
    state.blockingInitialize++;
  
    let current = activityListFirst;
    let result = "[";
    let first = true;
    while(current !== null && typeof(current) !== 'undefined') {
      if (!first) {
        result += ", ";
      }
      result += current.causality.name;
      current = current.activityListNext;
      first = false;
    }
    
    log(result + "]");
    
    state.blockingInitialize--;
    activityListFrozen--;
  }
  
  function registerActivity(meta) {
    const object = meta.proxy;
    if (activityListFrozen === 0 && activityListFirst !== meta) {    
      if (activityListFilter === null || activityListFilter(object)) {
              
        // Init if not initialized
        if (typeof(meta.activityListNext) === 'undefined') {
          meta.activityListNext = null;
          meta.activityListPrevious = null;
        }
        
        // Remove from wherever it is in the structure
        removeFromActivityList(object, meta);

        // Add first
        meta.activityListPrevious = null;
        if (activityListFirst !== null) {
          activityListFirst.activityListPrevious = meta;
          meta.activityListNext = activityListFirst;
        } else {
          activityListLast = meta;
        }
        activityListFirst = meta;        
      }
    }
  }
  
  function removeFromActivityList(object, meta) {
    if (typeof(meta) === "undefined") meta = object.causality;

    // Remove from wherever it is in the structure
    if (meta.activityListNext !== null) {
      meta.activityListNext.activityListPrevious = meta.activityListPrevious;
    }
    if (meta.activityListPrevious !== null) {
      meta.activityListPrevious.activityListNext = meta.activityListNext;
    }
    if (activityListLast === meta) {
      activityListLast = meta.activityListPrevious;
    }
    if (activityListFirst === meta) {
      activityListFirst = meta.activityListNext;
    }
    meta.activityListNext = null;
    meta.activityListPrevious = null;
  }

  return {
    registerActivity
    getActivityListNext,
    getActivityListPrevious,
    getActivityListFirst,
    getActivityListLast, 
    freezeActivityList, 
    removeFromActivityList,
    pokeObject,
    logActivityList
  }
}