





function setHandlerObject(target, key, newValue) {
	if (target.const.forwardTo) {
		//... 
	}
	if (!canWrite(target, user)) return;
	
	target[key] = newValue;
	
	emitSetEvent(target.const.object, key, newValue, previousValue);
	
}


function emitSetEvent(object, key, newValue, previousValue) {
	// create incoming references...
	
	// update incoming counters. 
	
	//
}