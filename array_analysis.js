


pop:
	if (state.incomingStructuresDisabled === 0 && !configuration.incomingStructuresAsCausalityObjects) {
		emitSpliceEvent(this, index, [removed], null);					
	} else {
		emitSpliceEvent(this, index, [removedOrIncomingStructure], null);					
	}
shift:
	if (state.incomingStructuresDisabled === 0 && !configuration.incomingStructuresAsCausalityObjects) {
		emitSpliceEvent(this, 0, removed, null);
	} else {
		emitSpliceEvent(this, 0, removedOrIncomingStructure, null);
	}

push:
	if (state.incomingStructuresDisabled === 0 && configuration.incomingStructuresAsCausalityObjects) {
		emitSpliceEvent(this, index, null, addedOrIncomingStructures);
	} else {
		emitSpliceEvent(this, index, null, added);
	}
	
unshift:
	if (state.incomingStructuresDisabled === 0 && configuration.incomingStructuresAsCausalityObjects) {
		emitSpliceEvent(this, 0, null, addedOrIncomingStructures);
	} else {
		emitSpliceEvent(this, 0, null, added);
	}
	
splice: 
	if (state.incomingStructuresDisabled === 0) {
		if (configuration.incomingStructuresAsCausalityObjects) {
			emitSpliceEvent(this, 0, removedOrIncomingStructures, addedOrIncomingStructures);
		} else {
			emitSpliceEvent(this, 0, removed, added);
		}
	} else {
		// emitSpliceEvent(this, 0, null, added);
		emitSpliceEvent(this, index, removedOrIncomingStructures, added);
	}