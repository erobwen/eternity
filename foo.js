


		function repeatForUniqueArgumentLists(functionCache, argumentsList, repeatedFunction) {
			functionCache.setArglist(argumentList); 
			if (!functionCache.cacheRecordExists(argumentsList)) {
				// Never encountered these arguments before, make a new cache
				let cacheRecord = functionCache.createNewRecord(argumentsList);
				cacheRecord.independent = true; // Do not delete together with parent
				cacheRecord.remove = function() {
					functionCache.deleteExistingRecord();
					cacheRecord.micro.remove();
				};
				getSpecifier(cacheRecord, "contextObservers").noMoreObserversCallback = function() {
					contextsScheduledForPossibleDestruction.push(cacheRecord);
				};
				enterContext('cached_repeater', cacheRecord);
				nextIsMicroContext = true;

				// cacheRecord.remove = function() {}; // Never removed directly, only when no observers & no direct application call
				cacheRecord.repeaterHandle = repeatOnChange(repeatedFunction);
				leaveContext();

				registerAnyChangeObserver(cacheRecord.contextObservers);
				return cacheRecord.repeaterHandle; // return something else...
			} else {
				let cacheRecord = functionCacher.getExistingRecord();
				registerAnyChangeObserver(cacheRecord.contextObservers);
				return functionCacher.getExistingRecord().repeaterHandle;
			}
		}