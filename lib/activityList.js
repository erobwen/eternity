
  /************************************************************************
   *
   *   Object activity list
   *
   ************************************************************************/
export function setupActivityList(metaProperty) {

  const activityListFilter = filter;
  let activityListFirst = null; 
  let activityListLast = null;
  
  const activityList = {
    count: 0,
    registerActivity,
    // getActivityListNext,
    // getActivityListPrevious,
    getFirst,
    getLast, 
    removeFromActivityList,
    // pokeObject,
    logActivityList
  }

  function getFirst() {
    const first = (activityListFirst !== null) ? activityListFirst.proxy : null;
    removeFromActivityList(first);
    return first; 
  }
  
  function getLast() {
    const last = (activityListLast !== null) ? activityListLast.proxy : null;
    removeFromActivityList(last);
    return last; 
  }

  // function getActivityListPrevious(object) {
  //   return object.causality.activityListPrevious.proxy;
  // }

  // function getActivityListNext(object) {
  //   return object.causality.activityListNext.proxy;
  // }
  
  // function pokeObject(object) {
  //   registerActivity(object);
  // }
  
  function logActivityList() {
    let current = activityListFirst;
    let result = "[";
    let first = true;
    while(current !== null && typeof(current) !== 'undefined') {
      if (!first) {
        result += ", ";
      }
      result += current[metaProperty].name;
      current = current.activityListNext;
      first = false;
    }
    
    log(result + "]");
  }
  
  function registerActivity(object) {
    const meta = object[metaProperty];

    // Init if not initialized
    if (typeof(meta.activityListNext) === 'undefined') {
      meta.activityListNext = null;
      meta.activityListPrevious = null;
    }
        
    // Remove from wherever it is in the structure
    removeFromActivityList(object);

    // Add first
    activityList.count++;
    meta.activityListPrevious = null;
    meta.inActivityList = true; 
    if (activityListFirst !== null) {
      activityListFirst.activityListPrevious = meta;
      meta.activityListNext = activityListFirst;
    } else {
      activityListLast = meta;
    }
    activityListFirst = meta;        
  }
  
  function removeFromActivityList(object) {
    const meta = object[metaProperty];

    if (meta.inActivityList) {
      activityList.count--;
      delete meta.inActivityList; 

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
  }
  return activityList;
}