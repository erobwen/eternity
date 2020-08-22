
  /************************************************************************
   *
   *   Object activity list
   *
   ************************************************************************/
export function createActivityList(filter) {

  let activityListFirst = null; 
  let activityListLast = null; 
  let activityListFilter = null;
  
  activityListFilter = filter;
  
  function getActivityListFirst() {
    return (activityListFirst !== null) ? activityListFirst.causality.object : null;
  }
  
  function getActivityListLast() {
    return (activityListLast !== null) ? activityListLast.causality.object : null;
  }

  function getActivityListPrevious(object) {
    return object.causality.handler.activityListPrevious;
  }

  function getActivityListNext(object) {
    return object.causality.handler.activityListNext;
  }
  
  function pokeObject(object) {
    let tmpFrozen = activityListFrozen;
    activityListFrozen = 0;
    registerActivity(object.causality.handler);
    activityListFrozen = tmpFrozen;
  }

  function removeFromActivityList(proxy) {
    if (trace.basic) log("<<< removeFromActivityList : "  + proxy.causality.name + " >>>");
    removeFromActivityListHandler(proxy.causality.handler);
  }
  
  let activityListFrozen = 0;
  function freezeActivityList(action) {
    activityListFrozen++;
    action();
    activityListFrozen--;
  }
  
  function stacktrace() { 
    function st2(f) {
      return !f ? [] : 
        st2(f.caller).concat([f.toString().split('(')[0].substring(9) + '(' + f.arguments.join(',') + ')']);
    }
    return st2(arguments.callee.caller);
  }
  
  function logActivityList() {
    activityListFrozen++;
    state.blockingInitialize++;
  
    let current = activityListFirst;
    let result = "[";
    let first = true;
          // log("activityList: ");
    while(current !== null && typeof(current) !== 'undefined') {
      if (!first) {
        result += ", ";
      }
      result += current.causality.name;
      // current = current.activityListPrevious;
      current = current.activityListNext;
      first = false;
    }
    
    log(result + "]");
    
    state.blockingInitialize--;
    activityListFrozen--;
  }
  
  function registerActivity(handler) {
    // log("registerActivity");
    if (activityListFrozen === 0 && activityListFirst !== handler ) {
      // log("here");
      activityListFrozen++;
      state.blockingInitialize++;
      
      if (activityListFilter === null || activityListFilter(handler.meta.proxy)) {
        // log("here2");
              
        if (trace.basic) {
          // stacktrace();
          // throw new Error("see ya");
          log("<<< registerActivity: "  + handler.causality.name + " >>>");
          // log(activityListFilter(handler.causality.object));
        }
        // logGroup();
        // log(handler.target);
        // Init if not initialized
        if (typeof(handler.activityListNext) === 'undefined') {
          handler.activityListNext = null;
          handler.activityListPrevious = null;
        }
        
        // Remove from wherever it is in the structure
        removeFromActivityListHandler(handler);

        // Add first
        handler.activityListPrevious = null;
        if (activityListFirst !== null) {
          activityListFirst.activityListPrevious = handler;
          handler.activityListNext = activityListFirst;
        } else {
          activityListLast = handler;
        }
        activityListFirst = handler;        
        
        if (trace.basic) logActivityList();
        // logUngroup();
      }
      
      state.blockingInitialize--;
      activityListFrozen--;
    }
  }
  
  function removeFromActivityListHandler(handler) {
    // Remove from wherever it is in the structure
    if (handler.activityListNext !== null) {
      handler.activityListNext.activityListPrevious = handler.activityListPrevious;
    }
    if (handler.activityListPrevious !== null) {
      handler.activityListPrevious.activityListNext = handler.activityListNext;
    }
    if (activityListLast === handler) {
      activityListLast = handler.activityListPrevious;
    }
    if (activityListFirst === handler) {
      activityListFirst = handler.activityListNext;
    }
    handler.activityListNext = null;
    handler.activityListPrevious = null;
  }
   

  return {
    registerActivity
  }
}