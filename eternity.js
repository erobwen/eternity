// Using UMD pattern: https://github.com/umdjs/umd
(function (root, factory) {
    if (typeof define === 'function' && define.amd) {
        define([], factory); // Support AMD
    } else if (typeof module === 'object' && module.exports) {
        module.exports = factory(); // Support NodeJS
    } else {
        root.eternity = factory(); // Support browser global
    }
}(this, function () {
	// Helper
	let argumentsToArray = function(arguments) {
		return Array.prototype.slice.call(arguments);
	};
	
	function firstKey(object) {
		let result = null;
		if (typeof(object) !== 'undefined') {
			for(let key in object) {
				result = key;
				break;
			}			
		}
		return result;
	}
	
	
	// Neat logging
	let objectlog = require('./objectlog.js');
	objectlog.setNameExtractor(function(entity) {
		let name = "";
		let id = "";
		if (typeof(entity.name) !== 'undefined') {
			name = entity.name;
		}
		if (typeof(entity.const) !== 'undefined' && typeof(entity.const.dbId) !== 'undefined') {
			id = entity.const.dbId;
			return name + "(_id_" + id + "_di_)";
		} else {
			return name;			
		}
	})
	
	const fs = require('fs');

	function createEternityInstance(configuration) {
		// objectlog.log("createEternityInstance: " + configuration.name);
		// objectlog.group();
		// objectlog.log(configuration,5);
		// objectlog.groupEnd();
		
		/*-----------------------------------------------
		 *          Debugging
		 *-----------------------------------------------*/
		 
		 // Debugging
		function log(entity, pattern) {
			objectCausality.state.recordingPaused++;	
			imageCausality.state.recordingPaused++;	
			objectCausality.state.blockingInitialize++;	
			imageCausality.state.blockingInitialize++;	
			objectCausality.state.freezeActivityList++;	
			objectCausality.updateInActiveRecording();
			imageCausality.updateInActiveRecording();

			objectlog.log(entity, pattern);

			objectCausality.state.recordingPaused--;	
			imageCausality.state.recordingPaused--;	
			objectCausality.state.blockingInitialize--;	
			imageCausality.state.blockingInitialize--;	
			objectCausality.state.freezeActivityList--;	
			objectCausality.updateInActiveRecording();
			imageCausality.updateInActiveRecording();
		}
		
		function logGroup(entity, pattern) {
			objectCausality.state.recordingPaused++;	
			imageCausality.state.recordingPaused++;	
			objectCausality.state.blockingInitialize++;	
			imageCausality.state.blockingInitialize++;	
			objectCausality.state.freezeActivityList++;	
			objectCausality.updateInActiveRecording();
			imageCausality.updateInActiveRecording();

			objectlog.group(entity, pattern);
			
			objectCausality.state.recordingPaused--;	
			imageCausality.state.recordingPaused--;	
			objectCausality.state.blockingInitialize--;	
			imageCausality.state.blockingInitialize--;	
			objectCausality.state.freezeActivityList--;	
			objectCausality.updateInActiveRecording();
			imageCausality.updateInActiveRecording();
		} 
		
		function logUngroup() {
			objectlog.groupEnd(); 
		} 
	
		function logToString(entity, pattern) {
			objectCausality.state.withoutRecording++;	
			imageCausality.state.withoutRecording++;	
			objectCausality.state.blockingInitialize++;	
			imageCausality.state.blockingInitialize++;	
			objectCausality.state.freezeActivityList++;	
			objectCausality.updateInActiveRecording();
			imageCausality.updateInActiveRecording();

			let result = objectlog.logToString(entity, pattern);

			objectCausality.state.withoutRecording--;	
			imageCausality.state.withoutRecording--;	
			objectCausality.state.blockingInitialize--;	
			imageCausality.state.blockingInitialize--;	
			objectCausality.state.freezeActivityList--;	
			objectCausality.updateInActiveRecording();
			imageCausality.updateInActiveRecording();
			return result;
		}
		
		function logToFile(entity, pattern, filename) {
			objectCausality.state.withoutRecording++;	
			imageCausality.state.withoutRecording++;	
			objectCausality.state.blockingInitialize++;	
			imageCausality.state.blockingInitialize++;	
			objectCausality.state.freezeActivityList++;	
			objectCausality.updateInActiveRecording();
			imageCausality.updateInActiveRecording();

			let result = objectlog.logToString(entity, pattern);
			fs.writeFile(filename, result, function(err) {
				if(err) {
					return console.log(err);
				}
			}); 

			objectCausality.state.withoutRecording--;	
			imageCausality.state.withoutRecording--;	
			objectCausality.state.blockingInitialize--;	
			imageCausality.state.blockingInitialize--;	
			objectCausality.state.freezeActivityList--;	
			objectCausality.updateInActiveRecording();
			imageCausality.updateInActiveRecording();
		}

		/*-----------------------------------------------
		 *          Object post pulse events
		 *-----------------------------------------------*/
		

		let pendingObjectChanges = [];
		function postObjectPulseAction(events) {
			if (events.length > 0) {
				if (postPulseCallbackBeforeStorage) postPulseCallbackBeforeStorage(events);
				pendingObjectChanges.push(events);
				events.forEach((event) => {
					if (event.type !== 'creation') {
						pin(event.object);
					}
				});
				// flushToImages();
				unloadAndKillObjects();				
			}
		}
		
		let postPulseCallbackBeforeStorage = null;
		function setPostPulseActionBeforeStorage(callback) {
			postPulseCallbackBeforeStorage = callback;
		}
		
		/**
		 * Write to database
		 */
		function startPersisterDaemon() {
			pushToDatabaseRepeatedly();
		}
		
		function pushToDatabaseRepeatedly() {
			pushToDatabase();
			setTimeout(() => {
				pushToDatabaseRepeatedly();
			}, 0); 
		}
		 
		function flushToDatabase() {
			trace.flush && log("flushToDatabase: " + pendingObjectChanges.length);
			trace.flush && log(pendingObjectChanges, 3);
			if (pendingObjectChanges.length > 0) {
				while (pendingObjectChanges.length > 0) {
					pushToDatabase();
				}
			} else {				
				flushImageToDatabase();			
			}
			unloadAndKillObjects();
		}
		
		function pushToDatabase() {
			trace.flush && log("pushToDatabase");
			pushToImages();
			flushImageToDatabase();			
		}
		
		// let unstableImages = [];


		/**
		 * Write to images
		 */
		function flushToImages() {
			trace.flush && log("flushToImages");
			// log("postObjectPulseAction: " + events.length + " events");
			// logGroup();
			// if (events.length > 0) {
			while (pendingObjectChanges.length > 0) {
				pushToImages();
			}	
			// }state	
		}
		
		function pushToImages() {
			trace.flush && log("pushToImages");
			let events = pendingObjectChanges.shift();
			objectCausality.freezeActivityList(function() {
				// log(events, 3);
				transferChangesToImage(events);
			});			
		}

		
		function transferChangesToImage(events) {
			if (trace.eternity) {
				log("transferChangesToImage");
				logGroup();
			}
			// log("objectCausalityState: ");
			// log(objectCausality.state);
			if (events.length > 0) {
				// log("... Model pulse complete, update image and flood create images & flood unstable ");
				// log("events.length = " + events.length);
				if (typeof(objectCausality.noCleanups) !== 'undefined')
					events.foo.bar;
				// log(events, 2);
				imageCausality.pulse(function() {
					
					// Mark unstable and flood create new images into existance.
					events.forEach(function(event) {
						// log("event: " + event.type + " " + event.property);
						
						// Catch togging of independently persistent
						if (typeof(event.object.const.dbImage) !== 'undefined') {
							let dbImage = event.object.const.dbImage;
							if (trace.eternity) log("has a dbImage... transfer event...");

							if (event.type === 'set') {
								if (trace.eternity) log("set event");
								markOldValueAsUnstable(dbImage, event);
									
								setPropertyOfImageAndFloodCreateNewImages(event.object, event.property, event.value);
							} else if (event.type === 'delete') {
								markOldValueAsUnstable(dbImage, event);
																
								delete dbImage[event.property]; // TODO: Do we need something special when deleting indicies?
							}
						}
						
						if (event.type !== 'creation') {							
							unpin(event.object);
						}
					});
				});
			}
		}
		
		function markOldValueAsUnstable(dbImage, event) {
			let oldValue = event.oldValue;
			if (objectCausality.isObject(oldValue)) {
				if (typeof(oldValue.const.dbImage) !== 'undefined') {
					if (trace.eternity) log("old value is object...");
					let oldValueDbImage = oldValue.const.dbImage;
					if (oldValueDbImage._eternityParent === dbImage 
						&& oldValueDbImage._eternityParentProperty === event.property) {
						
						if (trace.eternity) log("add unstabe origin...");
						addUnstableOrigin(oldValueDbImage);
					}
				}
			}
		}
		
		function setPropertyOfImageAndFloodCreateNewImages(object, property, objectValue) {
			// log("setPropertyOfImage: " + property + " = ...");
			if (trace.eternity) {
				log(objectCausality.state);
				log(imageCausality.state);
			}
			
			if (objectCausality.isObject(objectValue)) {             
				let imageValue; 
				// Get existing or create new image. 
				if (typeof(objectValue.const.dbImage) === 'object') {
					imageValue = objectValue.const.dbImage;
					if (unstableOrBeeingKilledInGcProcess(imageValue)) {
						// log("here...filling");
						imageValue._eternityParent = object.const.dbImage;
						imageValue._eternityParentProperty = property;
						if (inList(deallocationZone, imageValue)) {
							fillDbImageFromCorrespondingObject(imageValue); 							
						}
						addFirstToList(gcState, pendingForChildReattatchment, imageValue);
						
						removeFromAllGcLists(imageValue);
					}
				} else {
					createDbImageForObject(objectValue, object.const.dbImage, property);					
					imageValue = objectValue.const.dbImage;
				}
				
				// Check if this is an index assignment. 
				if (objectValue.indexParent === object && objectValue.indexParentRelation === property && typeof(object.const.dbImage[property] === 'undefined')) {
					// throw new Error("here A");
					imageCausality.setIndex(object.const.dbImage, property, imageValue);
				} else {
					// if (property === "indexParent" && typeof(imageValue[property] === 'undefined')) {
						// // throw new Error("here B");
						// imageCausality.setIndex(imageValue, property, object.const.dbImage);
					// } else {
					if (property !== 'indexParent' && property !== 'indexParentRelation') {
						object.const.dbImage[property] = imageValue; 
					}
					// }
				}
			} else {
				// log("no object value");
				// if (trace.eternity) log("wtf...");
				// log("a");
				// logGroup();
				// if (property === 'indexParentRelation') {
					// imageCausality.trace.basic++;
					// log("relationName: " + objectValue);
				// }
				// log("b");
				// log(property);
				if (property !== 'indexParent' && property !== 'indexParentRelation') {
					object.const.dbImage[property] = objectValue;
				}
				// if (property === 'indexParentRelation') imageCausality.trace.basic--;
				// log("c");
				// delete imageCausality.trace.basic;
				// logUngroup();
				// log("...");
			}
		}

		function createEmptyDbImage(object, potentialParentImage, potentialParentProperty) {
			let dbImage = createDbImageConnectedWithObject(object);
			dbImage.const.name = object.const.name + "(dbImage)";
			imageCausality.state.incomingStructuresDisabled--;
			dbImage[eternityTag + "Persistent"] = true;
			dbImage[eternityTag + "Parent"] = potentialParentImage;
			dbImage[eternityTag + "ObjectClass"] = Object.getPrototypeOf(object).constructor.name;
			dbImage[eternityTag + "ImageClass"] = (object instanceof Array) ? "Array" : "Object";
			dbImage[eternityTag + "ParentProperty"] = potentialParentProperty;
			dbImage[eternityTag + "IsObjectImage"] = true;
			imageCausality.state.incomingStructuresDisabled++;
			
			// TODO: have causality work with this... currently incoming references count is not updatec correctly
			// let imageContents = {
				// _eternityParent : potentialParentImage,
				// _eternityObjectClass : Object.getPrototypeOf(object).constructor.name,
				// _eternityImageClass : (object instanceof Array) ? "Array" : "Object", 
				// _eternityParentProperty : potentialParentProperty,
				// _eternityIsObjectImage : true
			// };

			return dbImage;
		}
		
		function createDbImageConnectedWithObject(object, contents) {
			if (typeof(contents) === 'undefined') {
				contents = {};
			}
			let dbImage = imageCausality.create(contents); // Only Object image here... 
			if (!imageCausality.isObject(dbImage)) throw new Error("WTF!");
			
			imageIdToImageMap[dbImage.const.id] = dbImage;
			connectObjectWithDbImage(object, dbImage);
			return dbImage;		
		}
		
		function connectObjectWithDbImage(object, dbImage) {
			imageCausality.blockInitialize(function() {
				// log("connectObjectWithDbImage: " + dbImage.const.dbId);
				dbImage.const.correspondingObject = object;	
				dbImage.const.isObjectImage = true;				
			});
			objectCausality.blockInitialize(function() {
				object.const.dbImage = dbImage;
			});
		}
		
		function createDbImageForObject(object, potentialParentImage, potentialParentProperty) {
			// let object = entity;
			// log("createDbImageForObject: " + object.const.name);
			// log(object);
			// log(object.const);
			// log("foo");
			if (typeof(object.const.dbImage) === 'undefined') {
				let dbImage = createEmptyDbImage(object, potentialParentImage, potentialParentProperty);
				object.const.dbImage = dbImage;
				dbImage.const.name = object.const.name + "(dbImage)";
				dbImage.const.correspondingObject = object;
				fillDbImageFromCorrespondingObject(object);
			}	
		}
		
		function fillDbImageFromCorrespondingObject(object) {
			for (let property in object) { 
				setPropertyOfImageAndFloodCreateNewImages(object, property, object[property]);
				// log("after in small loop");
			}			
			loadedObjects++;
			// log("fillDbImageFromCorrespondingObject, and poking...");
			objectCausality.pokeObject(object); // poke all newly saved?
		}
		
		// function createDbImageRecursivley(entity, potentialParentImage, potentialParentProperty) {
			// // log("createDbImageRecursivley");
			// if (objectCausality.isObject(entity)) {
				// createDbImageForObject(entity, potentialParentImage, potentialParentProperty);		
				// return entity.const.dbImage;
			// } else {
				// return entity;
			// }
		// } 
		

		/*-----------------------------------------------
		 *           DB Image counters
		 *
		 *   OBS! these functions assume incoming relations 
		 *   has been disabled!!!
		 *-----------------------------------------------*/
		 
		function increaseLoadedIncomingMacroReferenceCounters(dbImage, property) {
			let incomingRelationStructure = dbImage[property];
			if (imageCausality.isObject(incomingRelationStructure) && incomingRelationStructure.isIncomingRelationStructure) {
				// Increase counter 
				if (typeof(incomingRelationStructure.const.loadedIncomingMacroReferenceCount) === 'undefined') {
					incomingRelationStructure.const.loadedIncomingMacroReferenceCount = 0;
				}
				incomingRelationStructure.const.loadedIncomingMacroReferenceCount++;
				
				// Increase counter 
				let nextStructure = incomingRelationStructure;
				if (typeof(nextStructure.parent) !== 'undefined') {
					if (typeof(nextStructure.const.loadedIncomingMacroReferenceCount) === 'undefined') {
						nextStructure.const.loadedIncomingMacroReferenceCount = 0;
					}
					nextStructure.const.loadedIncomingMacroReferenceCount++;
					nextStructure = nextStructure.incomingStructures;
				}
				
				// Increase counter 
				if (typeof(nextStructure.const.loadedIncomingMacroReferenceCount) === 'undefined') {
					nextStructure.const.loadedIncomingMacroReferenceCount = 0;
				}
				nextStructure.const.loadedIncomingMacroReferenceCount++;
			}
		}
		
		
		function decreaseLoadedIncomingMacroReferenceCounters(dbImage, property) {
			let value = dbImage[property];
			if (imageCausality.isObject(value) && value.isIncomingRelationStructure) {
				let currentIncomingStructure = value;
				let nextIncomingStructure;
				if (typeof(value.parent) !== 'undefined') {
					nextIncomingStructure = currentIncomingStructure.parent
				} else {
					nextIncomingStructure = currentIncomingStructure.incomingStructures;
				}
	
				// Possibly unload incoming structure
				currentIncomingStructure.const.loadedIncomingMacroReferenceCount--;
				if (currentIncomingStructure.const.loadedIncomingMacroReferenceCount === 0) {
					unloadImage(currentIncomingStructure);
				}
				
				// Incoming structures or root incoming structure
				currentIncomingStructure = nextIncomingStructure;
				let referedDbImage;
				if (imageCausality.isIncomingStructure(currentIncomingStructure)) {
					// We were at the root incoming structure, proceed to the main incoming structure
					nextIncomingStructure = currentIncomingStructure.incomingStructures;
				} else {
					// Reached the object
					referedDbImage = currentIncomingStructure.referencedObject;
					nextIncomingStructure = null;
				}
				
				// Possibly unload incoming structure
				currentIncomingStructure.const.loadedIncomingMacroReferenceCount--;
				if (currentIncomingStructure.const.loadedIncomingMacroReferenceCount === 0) {
					unloadImage(currentIncomingStructure);
				}
				
				
				if (nextIncomingStructure !== null) {
					currentIncomingStructure = nextIncomingStructure;
					
					// Reached the object
					referedDbImage = currentIncomingStructure.referencedObject;
					nextIncomingStructure = null;

					// Possibly unload incoming structure
					currentIncomingStructure.const.loadedIncomingMacroReferenceCount--;
					if (currentIncomingStructure.const.loadedIncomingMacroReferenceCount === 0) {
						unloadImage(currentIncomingStructure);
					}
				}
				
				// // What to do with the object... kill if unloaded?
				// imageCausality.blockInitialize(function() {
					// referedDbImage.const.loadedIncomingMacroReferenceCount--;
					// // Idea: perhaps referedDbImage.const.incomingCount could be used.... as it is not persistent...
					// if (referedDbImage.const.loadedIncomingMacroReferenceCount === 0) {
						// // if (referedDbImage.const.correspondingObject.const.)
						// // unloadImage(referedDbImage);
						// // if there are no incoming relations on the object also, kill both... 
					// } 					
				// });
			}			
		}
		
		// function increaseImageIncomingLoadedCounter(entity) {
			// imageCausality.blockInitialize(function() {
				// if (imageCausality.isObject(entity)) {
					// if (typeof(entity.const.incomingLoadedMicroCounter) === 'undefined') {
						// entity.const.incomingLoadedMicroCounter = 0;
					// }
					// entity.const.incomingLoadedMicroCounter++;
				// }
			// });
		// }

		// function decreaseImageIncomingLoadedCounter(entity) {
			// imageCausality.blockInitialize(function() {
				// if (imageCausality.isObject(entity)) {
					// if (typeof(entity.const.incomingLoadedMicroCounter) === 'undefined') {
						// entity.const.incomingLoadedMicroCounter = 0;
					// }
					// entity.const.incomingLoadedMicroCounter--;
					// if (entity.const.incomingLoadedMicroCounter === 0 && entity.const.initializer !== null) {
						// killDbImage(entity);
					// }
				// }				
			// });
		// }


		/*-----------------------------------------------
		 *           Post DB image pulse events
		 *-----------------------------------------------*/
		 
		let imageIdToImageMap = {};
		
		let pendingUpdate = null;

		function valueToString(value) {
			if (objectCausality.isObject(value) || imageCausality.isObject(value)) {
				return "{id: " + value.const.id + " dbId: " + value.const.dbId + "}";
			} else {
				return "" + value;
			}
		}
		
		function logEvent(event) {
			objectCausality.blockInitialize(function() {
				imageCausality.blockInitialize(function() {
					// log(event, 1);
					// if (event.type === 'set') {
						// log(valueToString(event.object) + ".set " + event.property + " to " + valueToString(event.value)));
					// }
				});
			});
		}

		function postImagePulseAction(events) {
			// log("postImagePulseAction: " + events.length + " events");
			// logGroup();
			if (events.length > 0) {
				// Set the class of objects created... TODO: Do this in-pulse somehow instead?
				addImageClassNames(events);
				
				updateIncomingReferencesCounters(events);
				// pendingUpdates.push(events);
				
				// Push to pending updates
				let compiledUpdate = compileUpdate(events);
				// log("compiledUpdate");
				// log(compiledUpdate, 10);
				if (pendingUpdate === null) {
					pendingUpdate = compiledUpdate;
				} else {
					mergeUpdate(pendingUpdate, compiledUpdate);					
					// log("pendingUpdate after merge");
					// log(pendingUpdate, 10);
				}
				// flushImageToDatabase();
			} else {
				// log("no events...");
				// throw new Error("a pulse with no events?");
			}
			// logUngroup();
			unloadAndForgetImages();
		} 
		
		function unloadAndForgetImages() {
			// TODO NOW
		}
		
		function addImageClassNames(events) {
			imageCausality.assertNotRecording();
			imageCausality.disableIncomingRelations(function() {
				events.forEach(function(event) {
					if (event.type === 'creation') { // Note: this extends the pulse and adds additional events to it 
						event.object._eternityImageClass = Object.getPrototypeOf(event.object).constructor.name;
						// log("className: " + event.object._eternityImageClass);
						if (typeof(event.object._eternityImageClass) === 'unefined' || event.object._eternityImageClass === 'undefined') {
							throw new Error("Could not set _eternityImageClass");
						}
					}
				});		
			});
		}
		
		
		// NOW TODO: only increase/decrease counter when originating from another persistent....
		function updateIncomingReferencesCounters(events) {
			let counterEvents = [];
			imageCausality.pulseEvents = counterEvents;
			events.forEach(function(event) {
				if (event.type === 'set') { 
					// trace.refc && log("process event...");
					// trace.refc && log(event, 1);
				
					// Increase new value counter
					let value = event.value;
					if (imageCausality.isObject(value)) {
						trace.refc && log("value...");
						if (typeof(value._eternityIncomingCount) === 'undefined') {
							trace.refc && log("setting a value for the first time... ");
							value._eternityIncomingCount = 0;
						}
						trace.refc && log("increasing counter... ");
						value._eternityIncomingCount++;
					}
					
					// Decrease old value counter
					let oldValue = event.oldValue;
					if (imageCausality.isObject(oldValue)) {
						trace.refc && log("old value...");
						trace.refc && log(oldValue, 2);
						if (typeof(oldValue._eternityIncomingCount) === 'undefined') {
							// leave for now.. 
							// throw new Error("Counter could not be zero in this state... ");
						} else {
							trace.refc && log("decreasing counter... ");
							oldValue._eternityIncomingCount--;							
						}
					}
				}
				if (event.type === 'delete') { 
					// Decrease old value counter
					let oldValue = event.oldValue;
					if (imageCausality.isObject(oldValue)) {
						// log("old value...");
						if (typeof(oldValue._eternityIncomingCount) === 'undefined') {
							// Ok for now.. 
							// throw new Error("Counter could not be zero in this state... ");
						} else {
							// log("decreasing counter... ");
							oldValue._eternityIncomingCount--;							
						}
					}					
				}
			});
			// logToFile(events, 3, "./eventDump.json");
			// logToFile(counterEvents, 3, "./eventDump.json");
			Array.prototype.push.apply(events, counterEvents);
			// logToFile(events, 2, "./eventDump.json");
			imageCausality.pulseEvents = events; // Note: Some of the events might cancel each other out... 
		}
		
		
		/*-----------------------------------------------
		 *        First stage: Compile update 
		 *-----------------------------------------------*/
		
		let tmpDbIdPrefix = "_tmp_id_";
		
		
		let nextTmpDbId = 0;
		let tmpDbIdToDbImage = {};		
		
		function getTmpDbId(dbImage) {
			if (typeof(dbImage.const.tmpDbId) === 'undefined') {
				createTemporaryDbId(dbImage);
			}
			return dbImage.const.tmpDbId;
		}
		
		function createTemporaryDbId(dbImage) {
			let tmpDbId = tmpDbIdPrefix + nextTmpDbId++;
			dbImage.const.tmpDbId = tmpDbId;
			tmpDbIdToDbImage[tmpDbId] = dbImage;
			return tmpDbId;
		}
				
		function imageIdToDbIdOrTmpDbId(imageId) {
			if (typeof(imageIdToImageMap[imageId]) !== 'undefined') {
				let dbImage = imageIdToImageMap[imageId];
				if (typeof(dbImage.const.dbId) !== 'undefined') {
					return dbImage.const.dbId;
				} else {
					return getTmpDbId(dbImage);
				}
			}
			return "";
		}
		
		function mergeRecordUpdate(destination, source) {
			let destinationDeletedKeys = typeof(destination._eternityDeletedKeys) !== 'undefined'  ? destination._eternityDeletedKeys : null
			for (let property in source) {
				if (property === "_eternityDeletedKeys") {
					let deletedKeys = source[property];
					if (destinationDeletedKeys !== null) {
						Object.assign(destinationDeletedKeys, deletedKeys);
					} else {
						destinationDeletedKeys = deletedKeys;
						destination._eternityDeletedKeys = destinationDeletedKeys;
					}
					
					// Make sure not set something that will be deleted
					for (let property in destinationDeletedKeys) {
						delete destination[destinationDeletedKeys];
					}
				} else {
					destination[property] = source[property];
					
					// Make sure not to delete somehting that will be set
					if (destinationDeletedKeys !== null && typeof(destinationDeletedKeys[property]) !== 'undefined') {
						delete destinationDeletedKeys[property];
					}
				}
			}							
		}
				
		function mergeUpdate(destination, source) {
			// Merge creations
			Object.assign(destination.imageCreations, source.imageCreations);
			
			// Merge record updates
			for (let dbOrTmpId in source.imageUpdates) {
				let recordUpdate = source.imageUpdates[dbOrTmpId];
				if (typeof(destination.imageUpdates[dbOrTmpId]) !== 'undefined') {
					if (isTmpDbId(dbOrTmpId) && typeof(destination.imageCreations[dbOrTmpId]) !== 'undefined') {
						let pendingCreation = destination.imageCreations[dbOrTmpId];
						for (let property in recordUpdate) {
							if (property === "_eternityDeletedKeys") {
								let deletedKeys = recordUpdate[property];
								for (let property in deletedKeys) {
									delete pendingCreation[property];
								}
							} else {
								pendingCreation[property] = recordUpdate[property];
							}
						}					
					} else {
						let destinationRecordUpdate = destination.imageUpdates[dbOrTmpId];
						mergeRecordUpdate(destinationRecordUpdate, recordUpdate);							
					}
				} else {
					destination.imageUpdates[dbOrTmpId] = recordUpdate;
				}
			}

			// Merge deallocations
			for (let dbOrTmpId in source.imageDeallocations) {
				if (typeof(destination.imageCreations[dbOrTmpId]) !== 'undefined') {
					delete destination.imageCreations[dbOrTmpId];
				}
				if (typeof(destination.imageUpdates[dbOrTmpId]) !== 'undefined') {
					delete destination.imageUpdates[dbOrTmpId];
				}
				destination.imageDeallocations[dbOrTmpId] = true;
			} 
						
			// Make sure that the merge destination is up for firt phase coomit
			destination.needsSaving = true;
		}

		
		function compileUpdate(events) {
			let compiledUpdate = {
				imageCreations : {},
				pendingImageCreations : 0, 
				pendingOtherDbOperations : 0,
				imageWritings : {},
				imageDeallocations : {},
				imageUpdates : {}, // TODO: Remember initial value for each field, so that events that cancel each other out might be removed altogether.
				needsSaving : true
			}
			imageCausality.disableIncomingRelations(function () { // All incoming structures fully visible!
				
				// Extract updates and creations to be done.
				events.forEach(function(event) {
					let dbImage = event.object;
					if (typeof(dbImage[eternityTag + "_to_deallocate"]) === 'undefined') {
						let dbId = typeof(dbImage.const.dbId) !== 'undefined' ? dbImage.const.dbId : null;
						let tmpDbId = typeof(dbImage.const.tmpDbId) !== 'undefined' ? dbImage.const.tmpDbId : null;
						
						// if (dbId === null && tmpDbId === null) {
						if (event.type === 'creation') {
							// log("PINGPINGPINGPINGPINGPINGPINGPING")
							// Maintain image structure
							for (let property in dbImage) {
								increaseLoadedIncomingMacroReferenceCounters(dbImage, property);
							}
							
							// Serialized image creation, with temporary db ids. 
							let tmpDbId = getTmpDbId(dbImage);
							compiledUpdate.imageCreations[tmpDbId] = serializeDbImage(dbImage);
							
						} else if (typeof(compiledUpdate.imageCreations[tmpDbId]) === 'undefined') {
							// if (event.type === 'creation') {
								// log("Wrong turn!");
								// log(event, 2);
								// throw new Error("hmpf...");
							// }
							let key = dbId !== null ? dbId : tmpDbId;
							if (typeof(compiledUpdate.imageUpdates[key]) === 'undefined') {
								compiledUpdate.imageUpdates[key] = {};
							}
							let imageUpdates = compiledUpdate.imageUpdates[key];								
								
							if (event.type === 'set') {
								// Maintain image structure
								increaseLoadedIncomingMacroReferenceCounters(dbImage, event.property);
								// decreaseLoadedIncomingMacroReferenceCounters(dbImage, event.); // TODO: Decrease counters here? Get the previousIncomingStructure... 
								
								// Serialized value with temporary db ids. 
								let value = convertReferencesToDbIdsOrTemporaryIds(event.value);
								let property = event.property;
								property = imageCausality.transformPossibleIdExpression(property, imageIdToDbIdOrTmpDbId);
								imageUpdates[event.property] = value;
								
								// No delete if update
								if (typeof(imageUpdates["_eternityDeletedKeys"]) !== 'undefined') {
									delete imageUpdates["_eternityDeletedKeys"][event.property];
								} 
							} else if (event.type === 'delete') {
								// Maintain image structure
								// decreaseLoadedIncomingMacroReferenceCounters(dbImage, event.); // TODO: Decrease counters here?
								
								// Get deleted keys 
								if (typeof(imageUpdates["_eternityDeletedKeys"]) === 'undefined') {
									imageUpdates["_eternityDeletedKeys"] = {};
								}
								let deletedKeys = imageUpdates["_eternityDeletedKeys"];
								
								// Serialized value with temporary db ids. 
								let property = event.property;
								property = imageCausality.transformPossibleIdExpression(property, imageIdToDbIdOrTmpDbId);
								deletedKeys[property] = true;
								
								// No update if delete
								delete imageUpdates[property];
							}		
						} 
						// else {
							// if (event.property === 'B') {
								// log("reject event");
								// log(event.object.const.tmpDbId);
								// log(event.object.const.dbId);
								// log(Object.keys(compiledUpdate.imageCreations));
								// log(event, 2);
							// }
						// }
					}
				});								

				events.forEach(function(event) {
					if (event.type === 'set' || event.type === 'delete') {
						// Find image to deallocate:
						if (imageCausality.isObject(event.oldValue) && event.oldValue._eternityIncomingCount === 0) {
							if (typeof(event.oldValue.const.dbId) !== 'undefined') {
								let dbId = event.oldValue.const.dbId;

								compiledUpdate.imageDeallocations[dbId] = true;

								if (typeof(compiledUpdate.imageUpdates[dbId])) {
									delete compiledUpdate.imageUpdates[dbId];
								}					
							} else {
								throw("Could this happen!???");
							}
						}
					}
				});
			});
								
					// if (event.type === 'set' && event.property === eternityTag + "_to_deallocate") {
						// if (typeof(event.object.const.dbId) !== 'undefined') {
							// let dbId = event.object.const.dbId;
							
							// compiledUpdate.imageDeallocations[dbId] = true;

							// if (typeof(compiledUpdate.imageUpdates[dbId])) {
								// delete compiledUpdate.imageUpdates[dbId];
							// }						
						// } else if (typeof(event.object.const.tmpDbId) !== 'undefined') {
							// let tmpDbId = event.object.const.tmpDbId;
							
							// if (typeof(compiledUpdate.imageCreations[tmpDbId])) {
								// delete compiledUpdate.imageCreations[tmpDbId];
							// } else {
								// compiledUpdate.imageDeallocations[tmpDbId] = true;
							// }
							
							// if (typeof(compiledUpdate.imageUpdates[tmpDbId])) {
								// delete compiledUpdate.imageUpdates[tmpDbId];
							// }
						// }
						
					// }
				// });
				
				// // Find all deallocations. TODO remove this chunk of code!!! 
				// events.forEach(function(event) {
					// if (event.type === 'set' && event.property === eternityTag + "_to_deallocate") {
						// if (typeof(event.object.const.dbId) !== 'undefined') {
							// let dbId = event.object.const.dbId;
							
							// compiledUpdate.imageDeallocations[dbId] = true;

							// if (typeof(compiledUpdate.imageUpdates[dbId])) {
								// delete compiledUpdate.imageUpdates[dbId];
							// }						
						// } else if (typeof(event.object.const.tmpDbId) !== 'undefined') {
							// let tmpDbId = event.object.const.tmpDbId;
							
							// if (typeof(compiledUpdate.imageCreations[tmpDbId])) {
								// delete compiledUpdate.imageCreations[tmpDbId];
							// } else {
								// compiledUpdate.imageDeallocations[tmpDbId] = true;
							// }
							
							// if (typeof(compiledUpdate.imageUpdates[tmpDbId])) {
								// delete compiledUpdate.imageUpdates[tmpDbId];
							// }
						// }
						
					// }
				// });

			trace.eternity && logUngroup();
			return compiledUpdate;
		}
		
	
		// should disableIncomingRelations
		function serializeDbImage(dbImage) {
			// imageCausality.disableIncomingRelations(function() {
			// log(dbImage, 2);
			// log(imageCausality.isObject(dbImage));
			let serialized = (dbImage instanceof Array) ? [] : {};
			for (let property in dbImage) {
				if (property !== 'const') {
					// && property != 'incoming'
					// recursiveCounter = 0;
					let value = convertReferencesToDbIdsOrTemporaryIds(dbImage[property]);
					property = imageCausality.transformPossibleIdExpression(property, imageIdToDbIdOrTmpDbId);
					serialized[property] = value;
				}
			}
			
			// let value = convertReferencesToDbIdsOrTemporaryIds(dbImage.incoming);
			// serialized["_eternityIncoming"] = value;				

			return serialized;			
		}
		
		// let recursiveCounter = 0;
		
		function convertReferencesToDbIdsOrTemporaryIds(entity) {
			if (trace.eternity) {
				// if (recursiveCounter++ > 10) { 
					// log("LIMITING")
					// return "limit"; 
				// }
				// log("convertReferencesToDbIdsOrTemporaryIds");
				// log(entity);				
			}
  			
			// log("convertReferencesToDbIdsOrTemporaryIds: ");
			// log();
			if (imageCausality.isObject(entity)) {
				// log("convertReferencesToDbIdsOrTemporaryIds: " + entity.const.name);
				let dbImage = entity;
				if (hasDbId(entity)) {
					// log("has db id" + dbImage.const.serializedMongoDbId);
					return dbImage.const.serializedMongoDbId;
				} else {
					return getTmpDbId(entity);
				}
			} else if (entity !== null && typeof(entity) === 'object') {
				
				if (!configuration.allowPlainObjectReferences) { 
				
					let typeCorrect = typeof(entity) === 'object';
					let notNull = entity !== null;
					let hasConst = false;			
					let rightCausalityInstance = false;
					
					if (typeCorrect && notNull) {
						hasConst = typeof(entity.const) !== 'undefined';
						// console.log("rightafter")
						// console.log(hasConst);
					
						if (hasConst === true) {
							rightCausalityInstance = entity.const.causalityInstance === imageCausality;
						}
					}
					log("A non object encountered. Examining it! ");
					log("typeCorrect: " + typeCorrect);
					log("notNull: " + notNull);
					log("hasConst:" + hasConst);
					log("rightCausalityInstance: " + rightCausalityInstance);
					log(entity, 2);
					log(typeof(entity));
					log(typeof(entity.const));
					log(entity.const);
					log(entity.const.causalityInstance.configuration.name);
					// log("");
					// log("imageCausality.state:");
					// log(imageCausality.state);
					// log("");
					// log("imageCausality.configuration:");
					// log(imageCausality.configuration, 10);
					// log("");
					// log("objectCausality.configuration:");
					// log(objectCausality.configuration, 10);
					// log("");
					throw new Error("Plain object references not allowed!"); 
				}
				// log("===========");
				// log(entity, 3);
				// log("===========");
				
				// entity.foo.bar;
				
				let converted = (entity instanceof Array) ? [] : {};
				for (let property in entity) {
					if (property !== 'const') {
						transformedProperty = imageCausality.transformPossibleIdExpression(property, imageIdToDbIdOrTmpDbId);
						converted[transformedProperty] = convertReferencesToDbIdsOrTemporaryIds(entity[property]);
					}
				}
				return converted;
			} else {
				return entity;
			}
		}
		
		
		function hasDbId(dbImage) {
			// log(dbImage);
			return typeof(dbImage.const.dbId) !== 'undefined';
		}
		
		
		/*-----------------------------------------------
		 *        Second stage: Write in two phases
		 *-----------------------------------------------*/

		let tmpDbIdToDbId = {};

		function flushImageToDatabase() {
			trace.flush && log("flushImageToDatabase")
			while(pendingUpdate !== null) {
				twoPhaseComit();				
			}
			
			tmpDbIdToDbId = {};	
			nextTmpDbId = 0;
			tmpDbIdToDbImage = {};
		} 
		 
		
		function oneStepTwoPhaseCommit() {
			// log("oneStepTwoPhaseCommit: ");
			// log(pendingUpdate, 10);
			let stepDone = false;
			let allDone = true;
			if (configuration.twoPhaseComit && pendingUpdate.needsSaving) allDone = false;
			// log(allDone);
			if (!stepDone && configuration.twoPhaseComit && pendingUpdate.needsSaving) {
				pendingUpdate.needsSaving = false;
				mockMongoDB.updateRecord(updateDbId, pendingUpdate);
				stepDone = true;
			}
			
			let imageCreationTmpDbId = firstKey(pendingUpdate.imageCreations);
			if (imageCreationTmpDbId !== null) allDone = false;
			// log(allDone);
			if (!stepDone && imageCreationTmpDbId !== null) {
				let tmpDbId = imageCreationTmpDbId;
				let content = pendingUpdate.imageCreations[tmpDbId];
				delete pendingUpdate.imageCreations[tmpDbId];
				
				pendingUpdate.pendingImageCreations++;
				let dbId = writePlaceholderToMongoDb(tmpDbId); // sets up tmpDbIdToDbId
				pendingUpdate.pendingImageCreations--;
				
				pendingUpdate.imageWritings[tmpDbId] = content;
				
				// Clean out map
				// log(tmpDbIdToDbImage);
				// log(tmpDbId);
				let dbImage = tmpDbIdToDbImage[tmpDbId];
				delete tmpDbIdToDbImage[tmpDbId];
				
				// Update image
				delete dbImage.const.tmpDbId;
				dbImage.const.dbId = dbId;
				dbImage.const.serializedMongoDbId = imageCausality.idExpression(dbId);

				stepDone = true;
			}
			
			if (pendingUpdate.pendingImageCreations !== 0) allDone = false;
			if (pendingUpdate.pendingImageCreations === 0) {			
				let imageWritingsTmpDbId = firstKey(pendingUpdate.imageWritings);
				if (imageWritingsTmpDbId !== null) allDone = false;
				if (!stepDone && imageWritingsTmpDbId !== null) {
					let tmpDbId = imageWritingsTmpDbId;
					let contents = pendingUpdate.imageWritings[tmpDbId];
					delete pendingUpdate.imageWritings[tmpDbId];
					
					pendingUpdate.pendingOtherDbOperations++;
					mockMongoDB.updateRecord(tmpDbIdToDbId[tmpDbId], replaceTmpDbIdsWithDbIds(contents));
					pendingUpdate.pendingOtherDbOperations--;
					
					stepDone = true;
				}
				
				let imageUpdatesKey = firstKey(pendingUpdate.imageUpdates);
				if (imageUpdatesKey !== null) allDone = false;
				// log(allDone);
				if (!stepDone && imageUpdatesKey !== null) {
					let imagePropertyUpdates = pendingUpdate.imageUpdates[imageUpdatesKey];
					let savedTmpDbId = null;
					if (isTmpDbId(imageUpdatesKey))  {
						// throw new Error("Update with tmpDbId!!!: " + imageUpdatesKey);
						savedTmpDbId = imageUpdatesKey;
						imageUpdatesKey = tmpDbIdToDbId[imageUpdatesKey];
					}
					
					let property = firstKey(imagePropertyUpdates);
					if (property === null) {
						delete pendingUpdate.imageUpdates[savedTmpDbId === null ? imageUpdatesKey : savedTmpDbId];
					} else if (property === "_eternityDeletedKeys") {
						let keyToDelete = firstKey(imagePropertyUpdates._eternityDeletedKeys);
						if(keyToDelete !== null) {
							delete imagePropertyUpdates._eternityDeletedKeys[keyToDelete];
							pendingUpdate.pendingOtherDbOperations++;
							mockMongoDB.deleteRecordPath(imageUpdatesKey, [keyToDelete]);												
							pendingUpdate.pendingOtherDbOperations--;
						} else {
							delete imagePropertyUpdates._eternityDeletedKeys;
						}
					} else {
						let newValue = replaceTmpDbIdsWithDbIds(imagePropertyUpdates[property]);
						delete imagePropertyUpdates[property];
						pendingUpdate.pendingOtherDbOperations++;
						mockMongoDB.updateRecordPath(imageUpdatesKey, [property], newValue);					
						pendingUpdate.pendingOtherDbOperations--;
					}
					
					stepDone = true;
				}				
			}
			
			let imageDeallocationsKey = firstKey(pendingUpdate.imageDeallocations);
			if (imageDeallocationsKey !== null) allDone = false;
			// log(allDone);
			if (!stepDone && imageDeallocationsKey !== null) {
				delete pendingUpdate.imageDeallocations[imageDeallocationsKey];
				pendingUpdate.pendingOtherDbOperations++;
				mockMongoDB.deallocate(imageDeallocationsKey);
				pendingUpdate.pendingOtherDbOperations--;
				
				stepDone = true;
			}
			
			if (pendingUpdate.pendingOtherDbOperations > 0) {
				allDone = false;
			}
			
			// log("allDone:" + allDone);
			return allDone; 
		} 
		
		 
		function twoPhaseComit() {
			while(!oneStepTwoPhaseCommit()) {}
			pendingUpdate = null;
			if (configuration.twoPhaseComit) mockMongoDB.updateRecord(updateDbId, { name: "updatePlaceholder", _eternityIncomingCount : 1 });
			return;
			// log("twoPhaseComit:");
			// logGroup();
			// log(pendingUpdate, 10);

			// First Phase, store transaction in database for transaction completion after failure (cannot rollback since previous values are not stored, could be future feature?). This write is atomic to MongoDb.
			if (configuration.twoPhaseComit) mockMongoDB.updateRecord(updateDbId, pendingUpdate);
			
			// Create 
			let imageCreations = pendingUpdate.imageCreations;
			for (let tmpDbId in imageCreations) {
				writePlaceholderToMongoDb(tmpDbId); // sets up tmpDbIdToDbId
			}
			for (let tmpDbId in imageCreations) {
				writeSerializedImageToDatabase(tmpDbIdToDbId[tmpDbId], replaceTmpDbIdsWithDbIds(imageCreations[tmpDbId]));
			}
			for (let dbId in pendingUpdate.imageDeallocations) {
				mockMongoDB.deallocate(dbId);
			}			
			
			// log("tmpDbIdToDbId:");
			// log(tmpDbIdToDbId, 2);
			
			// TODO: Update entire record if the number of updates are more than half of fields.
			if(trace.eternity) log("pendingUpdate.imageUpdates:" + Object.keys(pendingUpdate.imageUpdates).length);
			for (let id in pendingUpdate.imageUpdates) {
				let updates = pendingUpdate.imageUpdates[id];
				if (isTmpDbId(id)) {
					// log("id: " + id);
					if (typeof(tmpDbIdToDbId[id]) === 'undefined0') throw new Error("No db id found for tmpDbId: " + id);
					id = tmpDbIdToDbId[id];
				}
				// log("update dbImage id:" + id + " keys: " + Object.keys(pendingImageUpdates[id]));
				let updatesWithoutTmpDbIds = replaceTmpDbIdsWithDbIds(updates);
				if(trace.eternity) log(updatesWithoutTmpDbIds);
				for (let property in updatesWithoutTmpDbIds) {
					if (property !== "_eternityDeletedKeys") {
						let value = updatesWithoutTmpDbIds[property];
						// value = replaceTmpDbIdsWithDbIds(value);
						// property = imageCausality.transformPossibleIdExpression(property, convertTmpDbIdToDbId);
						mockMongoDB.updateRecordPath(id, [property], value);						
					}
				}
				
				if (typeof(updatesWithoutTmpDbIds["_eternityDeletedKeys"]) !== 'undefined') {
					for (let deletedProperty in updatesWithoutTmpDbIds["_eternityDeletedKeys"]) {						
						mockMongoDB.deleteRecordPath(id, [deletedProperty]);
					}
				}
			}
			

			// Write dbIds back to the images. TODO: consider, how do they get back to the object? maybe not, so we need to move it there in the unload code. 
			// Note: this stage can be ignored in recovery mode, as then there no previously loaded objects.
			for (let tmpDbId in tmpDbIdToDbId) {
				// log("WRITING:");
				let dbId = tmpDbIdToDbId[tmpDbId];				
				let dbImage = tmpDbIdToDbImage[tmpDbId];
				delete tmpDbIdToDbImage[tmpDbId];
				delete dbImage.const.tmpDbId;
				// log(dbImage.const.name);
				dbImage.const.dbId = dbId;
				dbImage.const.serializedMongoDbId = imageCausality.idExpression(dbId);
				// log(dbImage.const);
			}
			
			// Finish, clean up transaction
			if (configuration.twoPhaseComit) mockMongoDB.updateRecord(updateDbId, { name: "updatePlaceholder", _eternityIncomingCount : 1 });
			
			// Remove pending update
			// logUngroup();
			pendingUpdate = null;
		}

		function removeTmpDbIdsFromProperty(property) {
			imageCausality.transformPossibleIdExpression(property, convertTmpDbIdToDbId);
			return property;
		}
		
		function replaceTmpDbIdsWithDbIds(entity) {
			// log("replaceTmpDbIdsWithDbIds");
			// logGroup();
			// log(entity);
			let result = replaceRecursivley(entity, isTmpDbId, convertTmpDbIdToDbIdExpression, removeTmpDbIdsFromProperty);
			// log(result);
			// logUngroup();
			return result;
		}
		
		function isTmpDbId(entity) {
			return (typeof(entity) === 'string') && entity.startsWith(tmpDbIdPrefix);
		}
		
		function convertTmpDbIdToDbId(entity) {
			if (isTmpDbId(entity)) {
				return tmpDbIdToDbId[entity];
			} else {
				return entity;
			}
		}

		function convertTmpDbIdToDbIdExpression(entity) {
			if (isTmpDbId(entity)) {
				return imageCausality.idExpression(tmpDbIdToDbId[entity]);
			} else {
				return entity;
			}
		}
		
		function replaceRecursivley(entity, pattern, replacer, propertyConverter) {
			if (pattern(entity)) {
				return replacer(entity)
			} else if (typeof(entity) === 'object') {
				if (entity === null) return null;
				let newObject = (entity instanceof Array) ? [] : {};
				for (let property in entity) {
					newObject[propertyConverter(property)] = replaceRecursivley(entity[property], pattern, replacer, propertyConverter); 						
				}
				return newObject;
			} else {
				return entity;
			}
		}
		
		function imageIdToDbId(imageId) {
			if (typeof(imageIdToImageMap[imageId]) !== 'undefined') {
				let dbImage = imageIdToImageMap[imageId];
				if (typeof(dbImage.const.dbId) !== 'undefined') {
					return dbImage.const.dbId;
				}
			}
			return "";
		}
		

		function writeSerializedImageToDatabase(dbId, serializedDbImage) {	
			mockMongoDB.updateRecord(dbId, serializedDbImage);			
		}
		
		
		function writePlaceholderToMongoDb(tmpDbId) {
			let dbId = mockMongoDB.saveNewRecord({_eternitySerializedTmpDbId : tmpDbId}); // A temporary id so we can trace it down in case of failure.
			tmpDbIdToDbId[tmpDbId] = dbId; //imageCausality.idExpression(dbId); ? 
			return dbId;
		}
		
		
		/*-----------------------------------------------
		 *           Loading
		 *-----------------------------------------------*/
		
		let dbIdToDbImageMap = {};
		
		function getDbImage(dbId) {
			// log("getDbImage: " + dbId);
			if (typeof(dbIdToDbImageMap[dbId]) === 'undefined') {
				dbIdToDbImageMap[dbId] = createImagePlaceholderFromDbId(dbId);
			}
			// log("placeholder keys:");
			// printKeys(dbIdToDbImageMap);
			return dbIdToDbImageMap[dbId];
		}
		
		function createImagePlaceholderFromDbId(dbId) {
			// log("NOT HERESSSSS!");
			// log("createImagePlaceholderFromDbId: " + dbId);
			let placeholder;
			imageCausality.state.emitEventPaused++;
			imageCausality.pulse(function() { // Pulse here to make sure that dbId is set before post image pulse comence.
				let record = peekAtRecord(dbId);
				// console.log(typeof(record._eternityImageClass) !== 'undefined' ? record._eternityImageClass : 'Object');
				placeholder = imageCausality.create(typeof(record._eternityImageClass) !== 'undefined' ? record._eternityImageClass : 'Object');
				placeholder.const.isObjectImage = typeof(record._eternityIsObjectImage) !== 'undefined' ? record._eternityIsObjectImage : false;
				placeholder.const.loadedIncomingReferenceCount = 0;
				placeholder.const.dbId = dbId;
				placeholder.const.serializedMongoDbId = imageCausality.idExpression(dbId);
				imageIdToImageMap[placeholder.const.id] = placeholder;
				placeholder.const.initializer = imageFromDbIdInitializer;
			});
			imageCausality.state.emitEventPaused--;
			return placeholder;
		}
		
		function imageFromDbIdInitializer(dbImage) {
			loadFromDbIdToImage(dbImage);
			// if (dbImage.const.dbId === 1)
				// dbImage.foo.bar;
			// log("");
			// log("initialize image " + dbImage.const.id + " from dbId: " + dbImage.const.dbId); 
			// logGroup();
			// objectCausality.withoutEmittingEvents(function() {
				// imageCausality.withoutEmittingEvents(function() {
				// });
			// });
			// log(dbImage);
			// logUngroup();
			// log(dbImage);
		}	
		
		function createObjectPlaceholderFromDbImage(dbImage) {
			// log("createObjectPlaceholderFromDbImage " + dbImage.const.id);
			let placeholder = objectCausality.create(createTarget(peekAtRecord(dbImage.const.dbId)._eternityObjectClass));
			connectObjectWithDbImage(placeholder, dbImage);
			placeholder.const.dbId = dbImage.const.dbId;
			placeholder.const.name = dbImage.const.name + "(object)"; // TODO: remove? 
			placeholder.const.initializer = objectFromImageInitializer;
			return placeholder;
		}
		
		function objectFromImageInitializer(object) {
			// log("initialize object " + object.const.id + " from dbImage " + object.const.dbImage.const.id + ", dbId:" + object.const.dbId);
			logGroup();
			objectCausality.withoutEmittingEvents(function() {
				imageCausality.withoutEmittingEvents(function() {
					loadFromDbImageToObject(object);
				});
			});
			logUngroup();
		}
		
		function createTarget(className) {
			if (typeof(className) !== 'undefined') {
				if (className === 'Array') {
					return []; // On Node.js this is different from Object.create(eval("Array").prototype) for some reason... 
				} else if (className === 'Object') {
					return {}; // Just in case of similar situations to above for some Javascript interpretors... 
				} else {
					let classRegistry = configuration.causalityConfiguration.classRegistry;
					if (typeof(classRegistry[className]) === 'function') {
						return Object.create(classRegistry[className].prototype);
					} else if (typeof(classRegistry[className]) === 'object') {
						return Object.create(classRegistry[className]);
					} else {
						throw new Error("Cannot find class named " + className + ". Make sure to enter it in the eternity classRegistry configuration." );
					}
				}
			} else {
				return {};
			}
		}
		
		function createObjectPlaceholderFromDbId(dbId) {
			let placeholder = objectCausality.create(peekAtRecord(dbId)._eternityObjectClass);
			placeholder.const.dbId = dbId;
			placeholder.const.name = peekAtRecord(dbId).name;
			// log("createObjectPlaceholderFromDbId: " + dbId + ", " + placeholder.const.name);
			placeholder.const.initializer = objectFromIdInitializer;
			return placeholder;
		}
	
		
		function objectFromIdInitializer(object) {
			// log("initialize object " + object.const.id + " from dbId: " + object.const.dbId);
			// logGroup();
			objectCausality.withoutEmittingEvents(function() {
				imageCausality.withoutEmittingEvents(function() {
					loadFromDbIdToObject(object);
					delete object.const.isUnloaded;
				});
			});
			// logUngroup();
		}
		
		function dbIdToImageId(dbId) {
			if (typeof(dbIdToDbImageMap[dbId]) !== 'undefined') {
				return dbIdToDbImageMap[dbId].const.id;
			} else {
				// TODO: create a placeholder anyways here...?
				return "";
			}
		}
		
		let peekedAtDbRecords = {};
		function peekAtRecord(dbId) {
			// flushToDatabase(); TODO... really have here??
			if (typeof(peekedAtDbRecords[dbId]) === 'undefined') {
				peekedAtDbRecords[dbId] = mockMongoDB.getRecord(dbId);
			}
			return peekedAtDbRecords[dbId];
		}
		
		function getDbRecord(dbId) {
			// flushToDatabase(); TODO... really have here??
			if (typeof(peekedAtDbRecords[dbId]) === 'undefined') {
				// No previous peeking, just get it
				return mockMongoDB.getRecord(dbId);
			} else {
				// Already stored for peeking, get and remove
				let record = peekedAtDbRecords[dbId];
				delete peekedAtDbRecords[dbId];
				return record;
			}
		}
		
		function loadFromDbIdToImage(dbImage) { //loadImage
			imageCausality.state.inPulse++;
			imageCausality.state.emitEventPaused++;
			imageCausality.state.incomingStructuresDisabled++;

			// log("loadFromDbIdToImage dbId: " + dbImage.const.dbId + " dbImage:" + dbImage.const.id)-;
			let dbId = dbImage.const.dbId;
			
			// log("loadFromDbIdToImage, dbId: " + dbId);
			let dbRecord = getDbRecord(dbId);
			// log(dbRecord);
			for (let property in dbRecord) {
				// printKeys(dbImage);
				if (property !== 'const' && property !== 'id') {// && property !== "_eternityIncoming"
					// log("loadFromDbIdToImage: " + dbId + " property: " + property);
					// log(dbRecord);
					let recordValue = dbRecord[property];
					// log(dbRecord);
					let value = loadDbValue(recordValue);
					
					// log(dbRecord);
					// log("loadFromDbIdToImage: " + dbId + " property: " + property + "...assigning");
					// if (property !== 'A') imageCausality.startTrace();
					// log("value loaded to image:");
					// log(value);
					property = imageCausality.transformPossibleIdExpression(property, dbIdToImageId);
					// increaseImageIncomingLoadedCounter(value);
					increaseLoadedIncomingMacroReferenceCounters(dbImage, property);
					dbImage[property] = value;
					// if (property !== 'A') imageCausality.endTrace();
					// log("loadFromDbIdToImage: " + dbId + " property: " + property + "...finished assigning");
					// printKeys(dbImage);
				}
				// if (property === "_eternityIncoming") {
					// let recordValue = dbRecord["_eternityIncoming"];
					// // log(dbRecord);
					// let value = loadDbValue(recordValue);
					
					// // log(dbRecord);
					// // log("loadFromDbIdToImage: " + dbId + " property: " + property + "...assigning");
					// // if (property !== 'A') imageCausality.startTrace();
					// // log("value loaded to image:");
					// // log(value);
					// // increaseImageIncomingLoadedCounter(value);
					// increaseLoadedIncomingMacroReferenceCounters(dbImage, "_eternityIncoming");
					// dbImage.incoming = value; // TODO: Consider, do we need to merge here? Is it possible another incoming is created that is not loaded?... prob. not... 
				// }
			}
			dbImage.const.name = dbRecord.name; // TODO remove debugg

			// log("finished loadFromDbIdToImage: ");
			// log(dbImage.const.dbId);
			// printKeys(dbImage);
			dbImage.const.loaded = true;
			// log("-- ");
			imageCausality.state.incomingStructuresDisabled--;
			imageCausality.state.emitEventPaused--;
			imageCausality.state.inPulse--;	if (imageCausality.state.inPulse === 0) imageCausality.postPulseCleanup();	
			// if (typeof(dbRecord.const) !== 'undefined') {
				// for (property in dbRecord.const) {
					// if (typeof(dbImage.const[property]) === 'undefined') {
						// let value = loadDbValue(dbRecord.const[property]);
						// dbImage.const[property] = value;
						// if (typeof(object.const[property]) === 'undefined') {
							// object.const[property] = imageToObject(value);													
						// }
					// }
				// }
			// }		
		}
		
		function loadFromDbIdToObject(object) {
			let dbId = object.const.dbId;
			// log("loadFromDbIdToObject: " + dbId);

			// Ensure there is an image.
			if (typeof(object.const.dbImage) === 'undefined') {
				// log("create placeholder for image:" + dbId);
				let placeholder = getDbImage(dbId);
				connectObjectWithDbImage(object, placeholder);
			}
			loadFromDbImageToObject(object);
		}
		
		function printKeys(object) {
			if (typeof(object) === 'object') log(Object.keys(object));
		}
		
		function loadFromDbImageToObject(object) {
			let dbImage = object.const.dbImage;
			// log("----------------------------------------");
			// log("loadFromDbImageToObject dbId: " + dbImage.const.dbId);
			// logGroup();
			// log(dbImage);
			// log(object);
			object.const.name = dbImage.const.name; // TODO remove debugg
			for (let property in dbImage) {
				if (property !== 'incoming' && !property.startsWith(eternityTag)) {
					// log("load property: " + property);
					// log("-------");
					let value = dbImage[property];
					// log(value);
					// log("value loaded to object:");
					// printKeys(value);
					// log(value.name)
					// log(value);
					// log("-------");
					// log(value);
					// TODO: Do recursivley if there are plain javascript objects
					if (imageCausality.isObject(value)) {
						// log("found an object");
						value = getObjectFromImage(value);
						// log(value);
						// log(value);
						// value = "424242"
						// log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
						// let x = value.name; // Must be here? otherwise not initilized correctly?   Because of pulses!!!!
						// log("<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<");
						
						// log(value.name);
					}
					// log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
					// log(value);
					object[property] = value;
					// log(object[property]);
					// log("<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<");
				}
				// log(object);
			}
			loadedObjects++;
			// log(object);
			// logUngroup();
		}
		
		function getObjectFromImage(dbImage) {
			// log("getObjectFromImage");
			if (typeof(dbImage.const.correspondingObject) === 'undefined') {
				dbImage.const.correspondingObject = createObjectPlaceholderFromDbImage(dbImage);
			}
			// log("return value:");
			// log(dbImage.const.correspondingObject); // This is needed???
			
			return dbImage.const.correspondingObject;
		}
		
		// function imageToObject(potentialDbImage) {
			// if (imageCausality.isObject(potentialDbImage)) {
				// return potentialDbImage.const.dbImage;
			// } else if (typeof(potentialDbImage) === 'object'){ // TODO: handle the array case
				// let javascriptObject = {};
				// for (let property in dbValue) {
					// javascriptObject[property] = imageToObject(dbValue[property]);
				// }
				// return javascriptObject;
			// } else {
				// return potentialDbImage;
			// }
		// }
		
		function loadDbValue(dbValue) {
			if (typeof(dbValue) === 'string') {
				if (imageCausality.isIdExpression(dbValue)) {
					let dbId = imageCausality.extractIdFromExpression(dbValue);
					let dbImage = getDbImage(dbId);
					dbImage.const.loadedIncomingReferenceCount++;
					return dbImage;
				} else {
					return dbValue;
				}
			} else if (typeof(dbValue) === 'object') { // TODO: handle the array case
				if (dbValue === null) return null;
				let javascriptObject = {};
				for (let property in dbValue) {
					javascriptObject[property] = loadDbValue(dbValue[property]);
				}
				return javascriptObject;
			} 
			
			else {
				return dbValue;
			}
		}
		
		
		/*-----------------------------------------------
		 *           Unloading and killing
		 *-----------------------------------------------*/
		
		let maxNumberOfLoadedObjects = configuration.maxNumberOfLoadedObjects; //10000;
		// let unloadedObjects = 0;
		let loadedObjects = 0;
		let pinnedObjects = 0;
		
		function isPinned(object) {
			return typeof(object.const.pinned) !== 'undefined' && object.const.pinned > 0;
		}
		
		function pin(object) {
			if (typeof(object.const.pinned) === 'undefined') {
				object.const.pinned = 1;
				pinnedObjects++;
			} else {
				object.const.pinned++;				
			}
		}
		
		function unpin(object) {
			if (typeof(object.const.pinned) === 'undefined') {
				throw new Error("Cannot unpin an object that is not pinned!");
			} else {
				object.const.pinned--;
				if (object.const.pinned === 0) {
					delete object.const.pinned;
					pinnedObjects--;
				}
			}
		}
		
		function getLeastActiveNonPinnedObject() {
			let leastActiveObject = objectCausality.getActivityListLast();
			while(leastActiveObject !== null && isPinned(leastActiveObject)) {
				leastActiveObject = objectCausality.getActivityListPrevious(leastActiveObject)
			}
			return leastActiveObject;
		}
		
		function unloadAndKillObjects() {
			// log("unloadAndKillObjects");
			if (loadedObjects > maxNumberOfLoadedObjects) {
				// log("Too many objects, unload some... ");
				trace.unload && logGroup("unloadAndKillObjects");
				objectCausality.withoutEmittingEvents(function() {
					imageCausality.withoutEmittingEvents(function() {
						let leastActiveObject = objectCausality.getActivityListLast();
						objectCausality.freezeActivityList(function() {
							while (leastActiveObject !== null && loadedObjects > maxNumberOfLoadedObjects) {
								// log("considering object for unload...");
								// while(leastActiveObject !== null && typeof(leastActiveObject.const.dbImage) === 'undefined') { // Warning! can this wake a killed object to life? ... no should not be here!
									// // log("skipping unsaved object (cannot unload something not saved)...");
									// objectCausality.removeFromActivityList(leastActiveObject); // Just remove them and make GC possible. Consider pre-filter for activity list.... 
									// leastActiveObject = objectCausality.getActivityListLast();
								// }
								// if (leastActiveObject !== null) {
									// log("remove it!!");
									objectCausality.removeFromActivityList(leastActiveObject);
									unloadObject(leastActiveObject);
								// }
							}
						});
					});
				});
				trace.unload && logUngroup();
			} else {
				// log("... still room for all loaded... ");
			}
		}
		
		function unloadObject(object) {
			objectCausality.freezeActivityList(function() {				
				trace.unload && logGroup("unloadObject " + object.const.name);
				// without emitting events.
				
				for (let property in object) {
					if (property !== "incoming") {
						delete object[property];					
					}
				}
				loadedObjects--;
				unloadImage(object.const.dbImage);

				object.const.dbId = object.const.dbImage.const.dbId;
				
				
				object.const.isUnloaded = true;
				object.const.initializer = objectFromIdInitializer;
				// log("try to kill object just unloaded...");
				tryKillObject(object);
				// objectCausality.blockInitialize(function() {
					// // log("Trying to kill object...");
					// // log(object.const.incomingReferencesCount)
					// if (object.const.incomingReferencesCount === 0) {
						// killObject(object);
					// }
				// });
				trace.unload && logUngroup();
			});
		}
		
		
		function objName(object) {
			let result = "";
			objectCausality.freezeActivityList(function() {
				objectCausality.blockInitialize(function() {
					// log("name: " + object.const.name + " (non forward: )");
					result = object.const.name;
				});
			});
			return result;
		}
		
		function logObj(object) {
			objectCausality.freezeActivityList(function() {
				objectCausality.blockInitialize(function() {
					// log("name: " + object.const.name + " (non forward: )");
					log("Object: " + object.const.name + " (non forward: " + object.nonForwardConst.name + ")");
				});
			}); 
		}
		
		function tryKillObject(object) {
            trace.killing && log("tryKillObject: " + objName(object));
			trace.killing && logGroup();
			// logObj(object);
            objectCausality.blockInitialize(function() {
                objectCausality.freezeActivityList(function() {
                    // Kill if unloaded
					let isPersistentlyStored = typeof(object.const.dbImage) !== 'undefined';
					let isUnloaded = typeof(object.const.initializer) === 'function'
					let hasNoIncoming = object.const.incomingReferencesCount === 0;
					trace.killing && log("is unloaded: " + isUnloaded);
					trace.killing && log("has no incoming: " + hasNoIncoming + " (count=" + object.const.incomingReferencesCount + ")");
					trace.killing && log("is persistently stored: " + isPersistentlyStored);
					
					if (isPersistentlyStored && isUnloaded && hasNoIncoming) {
						// log("kill it!");
                        killObject(object);
                    } else {
						// log("show mercy!");
						

						// log(object.const.ini);q
					}
                });
            });
			trace.killing && logUngroup();
        }

		
		function killObject(object) {
			// log("killObject: " + objName(object));
			let dbImage = object.const.dbImage;

			// log(object.const.target);
			object.const.isKilled = true;
			object.const.dbId = object.const.dbImage.const.dbId;
			delete object.const.dbImage.const.correspondingObject;
			delete object.const.dbImage;

			// Kill DB image if possible...
			killImageIfDissconnectedAndNonReferred(dbImage);
			
			object.const.initializer = zombieObjectInitializer;
		}
		
		function zombieObjectInitializer(object) {
			// log("zombieObjectInitializer: " + objName(object));
			logGroup();
			// log("zombieObjectInitializer");
            delete object.const.isKilled;
            object.const.isZombie = true;
			
			// log("zombieObjectInitializer");
			let dbId = object.const.dbId;
			let dbImage = getDbImage(dbId);
			// log("Set forward to..." + dbId);
			// object.const.isZombie = true; // Access this by object.nonForwardConst.isZombie
			object.const.forwardsTo = getObjectFromImage(dbImage); // note: the dbImage might become a zombie as well...
			// log("Finished setting forward too....");
			// log(object === object.nonForwardConst.forwardsTo);
			logUngroup();
		}
		
		
		
		function unloadImage(dbImage) {
			imageCausality.state.inPulse++;
			imageCausality.state.emitEventPaused++;
			imageCausality.state.incomingStructuresDisabled++;

			// log("unloadImage");
			// logGroup();
			// without emitting events.
			imageCausality.disableIncomingRelations(function() {
				for (let property in dbImage) {
					// Incoming should be unloaded here also, since it can be recovered.
					let value = dbImage[property];
					decreaseLoadedIncomingMacroReferenceCounters(dbImage, property);
					// decreaseImageIncomingLoadedCounter(value);
					delete dbImage[property]; 
				}
			});
			dbImage.const.initializer = imageFromDbIdInitializer;
			
			// log(dbImage.const.incomingReferencesCount)
			killImageIfDissconnectedAndNonReferred(dbImage);
			
			imageCausality.state.incomingStructuresDisabled--;
			imageCausality.state.emitEventPaused--;
			imageCausality.state.inPulse--;	if (imageCausality.state.inPulse === 0) imageCausality.postPulseCleanup();	
			// logUngroup();
		}
		
		function killImageIfDissconnectedAndNonReferred(dbImage) {
			// log("Trying to kill image...");
			let result = false;
			imageCausality.blockInitialize(function() {
				if (dbImage.const.incomingReferencesCount === 0 && typeof(dbImage.const.correspondingObject) === 'undefined') {
					killDbImage(dbImage);
					result = true;
				}
			});
			return result;
		}
		
		function killDbImage(dbImage) {
			// log("killDbImage");
			// if (typeof(dbImage.const.correspondingObject) !== 'undefined') {
				// let object = dbImage.const.correspondingObject;
				// delete object.const.dbImage;
				// delete dbImage.const.correspondingObject;
			// }
			delete dbIdToDbImageMap[dbImage.const.dbId];
			delete imageIdToImageMap[dbImage.const.id]; // This means all outgoing references to dbImage has to be removed first... ??? what does it mean??

			// dbImage.const.initializer = zombieImageInitializer;
		}
		
		// There should never be any zombie image... 
		// function zombieImageInitializer(dbImage) {
			// // log("zombieImageInitializer");
			// dbImage.const.forwardsTo = getDbImage(dbImage.const.dbId);
		// }
		
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
		
		function initializeGcState(gcState) {			
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
			imageCausality.disableIncomingRelations(function() {
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
		
		function unstableOrBeeingKilledInGcProcess(dbImage) {
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
						|| referer === instance.persistent.const.dbImage) { // && !inList(destructionZone, referer) && !inList(unstableZone, referer)
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
							// console.log(instance.persistent);
							// console.log(instance.persistent);
                            if (imageCausality.isObject(value) && isUnstable(value) && instance.persistent.const.dbImage !== value) { // Has to exists!
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
		
		
		/*-----------------------------------------------
		 *           Setup database
		 *-----------------------------------------------*/
		
		let persistentDbId;
		let updateDbId;
		let collectionDbId;
		
		function setupDatabase() {
			// log("setupDatabase");
			trace.eternity && logGroup();
			imageCausality.pulse(function() {					

				// Clear peek at cache
				peekedAtDbRecords = {};
				
				// if (typeof(instance.persistent) === 'undefined') {
				if (mockMongoDB.getRecordsCount() === 0) {
					// log("setup from an empty database...");
					
					// Persistent root object
					persistentDbId = mockMongoDB.saveNewRecord({ name : "Persistent", _eternityIncomingCount : 1});

					// Update placeholder
					updateDbId = mockMongoDB.saveNewRecord({ name: "updatePlaceholder", _eternityIncomingCount : 1});   //Allways have it here, even if not in use for compatiblity reasons. 
					// NOW
					// Garbage collection state.
					collectionDbId = mockMongoDB.saveNewRecord({ name : "garbageCollection", _eternityIncomingCount : 1});
					trace.eternity = true;
					gcState = createImagePlaceholderFromDbId(collectionDbId);
					trace.eternity = false;
					// throw new Error("foo");
					initializeGcState(gcState);
				} else {
					// // Setup ids for basics.
					// let counter = 0;
					// persistentDbId = counter++;
					// if (configuration.twoPhaseComit) updateDbId = counter++;
					// collectionDbId = counter++;
					
					// gcState = createImagePlaceholderFromDbId(collectionDbId);
				}
				instance.persistent = createObjectPlaceholderFromDbId(persistentDbId);
			});
			trace.eternity && logUngroup();
		}
		
		
		// Note: causality.persistent is replace after an unload... 
		function unloadAllAndClearMemory() {
			flushToDatabase();
			objectCausality.resetObjectIds();
			imageCausality.resetObjectIds();
			delete instance.persistent;
			dbIdToDbImageMap = {};
			setupDatabase();
		}
		
		function clearDatabaseAndClearMemory() {
			flushToDatabase();
			mockMongoDB.clearDatabase();
			unloadAllAndClearMemory();
		}
		
		/*-----------------------------------------------
		 *           Incoming relations
		 *-----------------------------------------------*/
		 
		// The "Now" version is mostly for debugging/development
		function forAllPersistentIncomingNow(object, property, callback) {
			forAllPersistentIncoming(object, property, callback);
			processAllVolatileIterations();
			processAllPersistentIterations();
			// Consider: What if we should add add/remove observers on the input directly? 
		}
	
		function forAllPersistentIncoming(object, property, objectAction) {
			objectCausality.assertNotRecording();
			imageCausality.assertNotRecording();
			if (isPersistable(objectAction)) {
				forAllPersistentIncomingPersistentIteration(object, property, objectAction);
			} else {
				forAllPersistentIncomingVolatileIteration(object, property, objectAction);
			}
		}
		
		function isPersistable(action) {
			return (typeof(action) !== 'function');
		}
		
		// function createObjectAction(object, functionName) {
		function createAction(object, functionName) {
			// TODO: should be objectCausality
			return objectCausality.create({
				type: "objectAction", 
				object: object,
				functionName : functionName
			});
		}
		
		function forAllPersistentIncomingPersistentIteration(object, property, objectAction) {
			imageCausality.disableIncomingRelations(function() {
				// imageCausality.state.incomingStructuresDisabled--;
				if (typeof(object.const.dbImage) !== 'undefined') {
					let dbImage = object.const.dbImage;
					if (typeof(dbImage.incoming) !== 'undefined') {
						let relations = dbImage.incoming;
						// log(relations, 3);
						// log("here");
						let propertyKey = "property:" + property;
						if (typeof(relations[propertyKey]) !== 'undefined') {
							let relation = relations[propertyKey];
							
							// Iterate root
							let contents = relation.contents;
							// log("processing root contents");
							for (let id in contents) {
								if (!id.startsWith("_eternity") && id !== 'name') {
									let referer = getObjectFromImage(contents[id]);
									// log("Iterate object in chunk...");
									objectAction.object[objectAction.functionName](referer);											
								}
							}
			
							// Ensure iteration structure in db
							let iterations;
							if (typeof(instance.persistent.iterations) === 'undefined') {
								iterations = objectCausality.create([]);
								instance.persistent.iterations = iterations;
							} else {
								iterations = instance.persistent.iterations;
							}

							// Setup the rest for iteration
							// TODO: Ensure that this iteration is not lost as incoming references are removed...
							// log("relation:");
							// log(relation, 2);
							// imageCausality.trace.get = true;
							let currentChunk = relation.first;
							// imageCausality.trace.get = false;
							// log(currentChunk);
							if (typeof(currentChunk) !== 'undefined' && currentChunk !== null) {
								// log("pushing chunk!!!");
								let contents = {
									currentChunk : currentChunk,
									objectAction : objectAction
								}
								contents[eternityTag + "Persistent"] = true;
								iterations.push(imageCausality.create(contents));
								// log(iterations,3);
							}
						}
					}
				}
				// imageCausality.state.incomingStructuresDisabled++;
			});
		}
		
		function processAllPersistentIterations() {
			while(!processPersistentOneStep()) {}
		}
		

		function incomingChunkRemovedForImage(incomingChunk) {
			// log("incomingChunkRemovedForImage");
			let newIterations = []; 
			let iterations = instance.persistent.iterations;
			iterations.forEach(function(iteration) {
				if (iteration.currentChunk === incomingChunk) {
					if (incomingChunk.next !== null) {
						iteration.currentChunk = incomingChunk.next;
						newIterations.push(iteration);
					}
				} else {
					newIterations.push(iteration);
				}				
			});
			
			iterations.length = 0; // TODO can we improve the new iterations transitions somehow.. this could cause rewrite of the entire array... 
			newIterations.forEach(function(iteration) {
				iterations.push(iteration);
			});
		}
		
		function processPersistentOneStep() {
			// log("processPersistentOneStep");
			imageCausality.disableIncomingRelations(function() {
				if (typeof(instance.persistent.iterations) !== 'undefined' && instance.persistent.iterations.length > 0) {
					let iterations = instance.persistent.iterations;
					let newIterations = [];
				
					instance.persistent.iterations.forEach(function(iteration) {
						let currentChunk = iteration.currentChunk;
						// log("Here!!!")
						// log(currentChunk);
						let contents = currentChunk.contents;
						// log("processing contents");
						for (let id in contents) {
							if (!id.startsWith("_eternity") && id !== 'name') {
								let referer = getObjectFromImage(contents[id]);
								// log(referer.name,2);
								let objectAction = iteration.objectAction;
								// log(objectAction,2);
								objectAction.object[objectAction.functionName](referer);
							}
						}
						
						if (typeof(currentChunk.next) !== 'undefined' && currentChunk.next !== null) {
							iteration.currentChunk = currentChunk.next;
							newIterations.push(iteration);
						}
					}); 
					// Reuse the old array object, as not to clutter down the database and require deletion
					// Will this work with causality? 
					// Array.prototype.splice.apply(iterations, [0, newIterations.length].concat(newIterations)); // did not work! TODO: figure out why... 
					// iterations.splice.apply(iterations, [0, newIterations.length].concat(newIterations)); // did not work!
					// log("newIterations:");
					// log(newIterations);
					iterations.length = 0;
					newIterations.forEach(function(iteration) {
						iterations.push(iteration);
					});
				}
			});
			// log(instance.persistent.iterations, 2);
			return typeof(instance.persistent.iterations) === 'undefined' || instance.persistent.iterations.length === 0;
		}		
		
		let volatileIterations = [];
		
		function forAllPersistentIncomingVolatileIteration(object, property, objectAction) {
			// log("forAllPersistentIncomingVolatileIteration");
			imageCausality.disableIncomingRelations(function() {
				if (typeof(object.const.dbImage) !== 'undefined') {
					let dbImage = object.const.dbImage;
					if (typeof(dbImage.incoming) !== 'undefined') {
						let relations = dbImage.incoming;
						// log(relations, 3);
						// log("here");
						let propertyKey = "property:" + property;
						if (typeof(relations[propertyKey]) !== 'undefined') {
							let relation = relations[propertyKey];
														
							// Iterate the root
							let contents = relation.contents;
							for (let id in contents) {
								if (!id.startsWith("_eternity") && id !== 'name') {
									let referer = getObjectFromImage(contents[id]);
									// log("Iterate object in chunk...");
									objectAction(referer);											
								}
							}

							// Setup the rest for iteration
							let currentChunk = relation.first
							if (typeof(currentChunk) !== 'undefined' && currentChunk !== null) {
								// log("push chunk!");
								volatileIterations.push({
									currentChunk : currentChunk,
									objectAction : objectAction
									// Object and property not needed here?
								});
							}
						}
					}
				}				
			});
		}

		
		function processAllVolatileIterations() {
			while(!processVolatileIterationsOneStep()) {}
		}
		
		function processVolatileIterationsOneStep() {
			// log("processVolatileIterationsOneStep");
			imageCausality.disableIncomingRelations(function() {
				let newIterations = [];
				volatileIterations.forEach(function(iteration) {
					let currentChunk = iteration.currentChunk;
					let contents = currentChunk.contents;
					// log("process chunk...");
					for (let id in contents) {
						if (!id.startsWith("_eternity") && id !== 'name') {
							let referer = getObjectFromImage(contents[id]);
							iteration.objectAction(referer);
						}
					}
					// log("Here!!!")
					// log(currentChunk);
					if (typeof(currentChunk.next) !== 'undefined' && currentChunk.next !== null) {
						iteration.currentChunk = currentChunk.next;
						newIterations.push(iteration);
					}
				});
				volatileIterations = newIterations;
			});
			return volatileIterations.length === 0;
		}		
		
		/*-----------------------------------------------
		 *           Setup image causality
		 *-----------------------------------------------*/
		 
		// MongoDB
		let mockMongoDB = require("./mockMongoDB.js")(JSON.stringify(configuration));	
			
		// Image causality
		// let imageCausality = requireUncached("causalityjs_advanced");
		let imageCausality = require("./causality.js")({ 
			name : 'imageCausality' + (typeof(configuration.name) !== 'undefined') ? configuration.name : "",
			recordPulseEvents : true, 
			objectActivityList : true,
			hideIncoming : false,
			incomingStructureChunkSize : configuration.persistentIncomingChunkSize,
			incomingChunkRemovedCallback : incomingChunkRemovedForImage,
			useIncomingStructures: true,
			incomingReferenceCounters : true, 
			incomingStructuresAsCausalityObjects : true, // Is this static or non static objects? 
			blockInitializeForIncomingReferenceCounters: true,
		});
		imageCausality.addPostPulseAction(postImagePulseAction);
		// imageCausality.addRemovedLastIncomingRelationCallback(function(dbImage) {
			// //unload image first if not previously unloaded?
			// // log(dbImage.const.isObjectImage);
			// // log(dbImage.const.dbId);
			// if (!dbImage.const.isObjectImage) {
				// if (!imageCausality.isIncomingStructure(dbImage)) {
					// // log("killing spree");
					// if (killImageIfDissconnectedAndNonReferred(dbImage)) {
						// deallocateInDatabase(dbImage);
						// // TODO: check if this part of iteration, move iteration if so... 
					// }
				// }
				// // TODO:
				// // else {
					// // if (killImageIfDissconnectedAndNonReferred(dbImage)) {
						// // deallocateInDatabase(dbImage);
						// // // TODO: check if this part of iteration, move iteration if so... 
					// // }
				// // }
			// } else {
				// if (inList(deallocationZone, dbImage)) {
					// removeFirstFromList(gcState, deallocationZone, dbImage);
					// // removeFromList(gcState, deallocationZone, dbImage);
				// // if (typeof(dbImage._eternityDismanteled) !== 'undefined' && dbImage._eternityDismanteled === true) {
					// unpersistObjectOfImage(dbImage);
				// }
			// }
		// });
		
		// function unpersistObjectOfImage(dbImage) {
			// // Dissconnect from object and deallocate.
			// delete dbImage.const.correspondingObject.const.dbImage;
			// objectCausality.removeFromActivityList(dbImage.const.correspondingObject);
			// delete dbImage.const.correspondingObject;

			// if (killImageIfDissconnectedAndNonReferred(dbImage)) {						
				// deallocateInDatabase(dbImage);
			// }			
		// }


		/*-----------------------------------------------
		 *           Setup object causality
		 *-----------------------------------------------*/
		
		// Primary causality object space
		let objectCausalityConfiguration = {};
		// log("Assigning causality");
		Object.assign(objectCausalityConfiguration, configuration.causalityConfiguration);
		Object.assign(objectCausalityConfiguration, {
			name: 'objectCausality' + (typeof(configuration.name) !== 'undefined') ? configuration.name : "",
			recordPulseEvents : true,
			objectActivityList : true,
			incomingReferenceCounters : true, 
			blockInitializeForIncomingStructures: true, 
			blockInitializeForIncomingReferenceCounters: true
			// TODO: make it possible to run these following in conjunction with eternity.... as of now it will totally confuse eternity.... 
			// incomingRelations : true, // this works only in conjunction with incomingStructuresAsCausalityObjects, otherwise isObject fails.... Note: this only seems to be a problem with eternity, and not with plain causality. 
			// incomingStructuresAsCausalityObjects : true
		});
		let objectCausality = require("./causality.js")(objectCausalityConfiguration);
		objectCausality.addPostPulseAction(postObjectPulseAction);
		objectCausality.addRemovedLastIncomingRelationCallback(function(dbImage) {
			// log("incoming relations reaced zero...");
            tryKillObject(dbImage);
        });
		
		// TODO: install this... 
		objectCausality.setActivityListFilter(function(object) {
			// throw new Error("Here!"); 
			let isZombie = false;
            // objectCausality.blockInitialize(function() {
                // objectCausality.freezeActivityList(function() {
                    isZombie = typeof(object.nonForwardConst.isZombie) !== 'undefined';
                    // log("isZombie: " + isZombie);
                // });
            // });
			if (isZombie) {
				// log("isZombie");
				return false;				
			}
			
			if (typeof(object.const.dbImage) === 'undefined') {
				// log("noDbImage: " + object.const.name);
				// log(object.const);
				return false;				
			}
			return true;
			// TODO: Add and remove to activity list as we persist/unpersist this object....
		});
		
		
		
		/*-----------------------------------------------
		 *           Setup instance
		 *-----------------------------------------------*/
		// Additions
		let instance = {};
		Object.assign(instance, objectCausality);
		Object.assign(instance, {
			objectCausality : objectCausality, 
			imageCausality : imageCausality,
			setPostPulseActionBeforeStorage : setPostPulseActionBeforeStorage,
			mockMongoDB : mockMongoDB,
			unloadAllAndClearMemory : unloadAllAndClearMemory,
			clearDatabaseAndClearMemory : clearDatabaseAndClearMemory,
			forAllPersistentIncomingNow : forAllPersistentIncomingNow,
			createAction : createAction,
			collectAll : collectAll,
			flushImageToDatabase : flushImageToDatabase,
			flushToDatabase : flushToDatabase,
			oneStepCollection : oneStepCollection,
			log : log,
			logGroup : logGroup,
			logUngroup : logUngroup,
			logToString : logToString,
			logToFile : logToFile
		});

		let trace = instance.trace;
		// trace.killing = 0;
		// trace.loading = 0;
		// trace.zombies = 0;
		// trace.eternity = false;
		
		// Setup database
		setupDatabase();
		
		return instance;
	}

	
	function sortedKeys(object) {
		let keys = Object.keys(object);
		keys.sort(function(a, b){
			if(a < b) return -1;
			if(a > b) return 1;
			return 0;
		});
		let sortedObject = {};
		keys.forEach(function(key) {
			let value = object[key];
			if (typeof(value) === 'object') value = sortedKeys(value);
			sortedObject[key] = value;
		});
		return sortedObject;
	}

	function getDefaultConfiguration() {
		return {
			maxNumberOfLoadedObjects : 10000,
			persistentIncomingChunkSize : 500,
			twoPhaseComit : true,
			causalityConfiguration : {},
			allowPlainObjectReferences : true
		}
	}
	
	let configurationToSystemMap = {};
	return function(requestedConfiguration) {
		if(typeof(requestedConfiguration) === 'undefined') {
			requestedConfiguration = {};
		}
		
		let defaultConfiguration = getDefaultConfiguration();
		Object.assign(defaultConfiguration, requestedConfiguration);
		let configuration = sortedKeys(defaultConfiguration);
		let signature = JSON.stringify(configuration);
		// log("================= REQUEST: ==========");
		// log(signature);
		
		if (typeof(configurationToSystemMap[signature]) === 'undefined') {
			configurationToSystemMap[signature] = createEternityInstance(configuration);
		}
		return configurationToSystemMap[signature];
	};	
}));
