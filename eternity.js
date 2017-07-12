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
	
	// Neat logging
	let objectlog = require('./objectlog.js');
	let log = objectlog.log;
	let logGroup = objectlog.enter;
	let logUngroup = objectlog.exit;

	function createEternityInstance(configuration) {

		/*-----------------------------------------------
		 *          Object post pulse events
		 *-----------------------------------------------*/
		 
		let unstableImages = [];

		function postObjectPulseAction(events) {
			// log("postObjectPulseAction: " + events.length + " events");
			// logGroup();
			objectCausality.freezeActivityList(function() {
				// log(events, 3);
				transferChangesToImage(events);
				unloadAndKillObjects();
			});
			
			// logUngroup();
		} 
		
		
		function transferChangesToImage(events) {
			// log("transferChangesToImage");
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
						if (event.type === 'set') {
							// log("set event");
							let object = event.object;

							if (event.property === '_independentlyPersistent') {
								
								// Setting of independently persistent
								if (event.newValue && typeof(object.const.dbImage) === 'undefined') {
									// Object had no image, flood-create new images.
									createDbImageForObject(object, null, null);
								} else if (!event.newValue) {
									// Had an image that becomes unstable
									floodUnstable(event.object.const.dbImage, null, null);
								}
								
							} else if (typeof(object.const.dbImage) !== 'undefined'){
								let objectDbImage = object.const.dbImage;
								
								// Mark old value as unstable if another object with dbImage
								let oldValue = event.oldValue;
								if (objectCausality.isObject(oldValue)) {
									if (typeof(oldValue.const.dbImage) !== 'undefined') {
										let oldValueDbImage = oldValue.const.dbImage;
										if (oldValueDbImage._eternityParent === objectDbImage 
											&& oldValueDbImage._eternityParentProperty === event.property) {
											
											floodUnstable(oldValueDbImage, null, null);
										}
									}
								}
									
								// Flood create new images
								setPropertyOfImage(objectDbImage, event.property, event.newValue);
							}
						}
					});
				});
			}
		}
		
		function setPropertyOfImage(dbImage, property, objectValue) {
			if (objectCausality.isObject(objectValue)) {
				let newValue = objectValue;
				// Get existing or create new image. 
				if (typeof(newValue.const.dbImage) === 'object') {
					newValue = newValue.const.dbImage;
				} else {
					createDbImageForObject(newValue, dbImage, property);					
					newValue = newValue.const.dbImage;
				}
				
				// Check if this is an index assignment. 
				if (newValue.indexParent === dbImage) {
					disableIncomingRelations(function() {
						dbImage[property] = newValue;
					});
				} else {
					dbImage[property] = newValue; 
				}
			} else {
				dbImage[property] = objectValue;
			}
		}

		function createEmptyDbImage(object, potentialParentImage, potentialParentProperty) {
			// log(object, 3);
			// log(object);
			let imageContents = {
				_eternityParent : potentialParentImage,
				_eternityParentProperty : potentialParentProperty
			};
			// for (let property in object) {
				// let value = object[property];
				// // TODO: translate property
				// if (!objectCausality.isObject(value)) {
					// imageContents[property] = value;
				// }
			// }
			return createDbImageConnectedWithObject(object, imageContents);
		}
		
		function createDbImageConnectedWithObject(object, contents) {
			if (typeof(contents) === 'undefined') {
				contents = {};
			}
			let dbImage = imageCausality.create(contents);
			imageIdToImageMap[dbImage.const.id] = dbImage;
			connectObjectWithDbImage(object, dbImage);
			return dbImage;		
		}
		
		function connectObjectWithDbImage(object, dbImage) {
			imageCausality.blockInitialize(function() {
				// log("connectObjectWithDbImage: " + dbImage.const.dbId);
				dbImage.const.correspondingObject = object;					
			});
			objectCausality.blockInitialize(function() {
				object.const.dbImage = dbImage;
			});
		}
		
		function createDbImageForObject(object, potentialParentImage, potentialParentProperty) {
			// let object = entity;
			// log("foo");
			// log(object);
			// log(object.const);
			// log("foo");
			
			if (typeof(object.const.dbImage) === 'undefined') {
				let dbImage = createEmptyDbImage(object, potentialParentImage, potentialParentProperty);
				for (let property in object) { 
					setPropertyOfImage(dbImage, property, object[property]);
				}
				object.const.dbImage = dbImage;
				dbImage.const.correspondingObject = object;
				loadedObjects++;
				objectCausality.pokeObject(object);
			}	
		}
		
		function createDbImageRecursivley(entity, potentialParentImage, potentialParentProperty) {
			// log("createDbImageRecursivley");
			if (objectCausality.isObject(entity)) {
				createDbImageForObject(entity, potentialParentImage, potentialParentProperty);		
				return entity.const.dbImage;
			} else {
				return entity;
			}
		} 
		
			// TODO: Do this asynchronously
		function floodUnstable(potentiallyUnstableImage, parent, parentRelation) {
			if (parent === null || (parent === potentiallyUnstableImage._eternityParent && parentRelation === potentiallyUnstableImage._eternityParentProperty)) {
				unstableImages.push(potentiallyUnstableImage);
				for (let property in potentiallyUnstableImage) {
					floodUnstable(potentiallyUnstableImage[property], potentiallyUnstableImage, property);
				}
			}
		}
		

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
				if (typeof(currentIncomingStructure.isIncomingStructure) !== 'undefined') {
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
		
		let pendingImageCreations = {};
		let pendingImageUpdates = {};

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
						// log(valueToString(event.object) + ".set " + event.property + " to " + valueToString(event.newValue) + (event.incomingStructureEvent ? " [incoming]" : ""));
					// }
				});
			});
		}				

		
		function postImagePulseAction(events) {
			if (events.length > 0) {
				// log("postImagePulseAction: " + events.length + " events");
				// logGroup();
				//log(" ... Image pulse complete, sort events according to object id and flush to database");
				
				// log(events, 3);
				// Extract updates and creations to be done.
				imageCausality.disableIncomingRelations(function () {
					events.forEach(function(event) {
						if (!isMacroEvent(event)) {
							// logEvent(event);
						
							let dbImage = event.object;
							// log("Considering " + event.type + " event with object:");
							// log(dbImage, 2);
							let imageId = dbImage.const.id;
							// TODO: Consider if we allways have a dbId here? on new creation... 
								
							if (event.type === 'creation') {
								pendingImageCreations[imageId] = dbImage;
								
								for (let property in dbImage) {
									// increaseImageIncomingLoadedCounter(dbImage[property]);
									increaseLoadedIncomingMacroReferenceCounters(dbImage, property);
								}
								// if (typeof(pendingImageUpdates[imageId]) !== 'undefined') {
									// // We will do a full write of this image, no need to update after.				
									// delete pendingImageUpdates[dbId];   // will never happen anymore?
								// }
							} else if (event.type === 'set') {
								if (typeof(dbImage.const.dbId) !== 'undefined') { // && typeof(pendingImageCreations[imageId]) === 'undefined'
									let dbId = dbImage.const.dbId;
									// Only update if we will not do a full write on this image. 
									if (typeof(pendingImageUpdates[dbId]) === 'undefined') {
										pendingImageUpdates[dbId] = {};
									}
									let imageUpdates = pendingImageUpdates[dbId];
									imageUpdates[event.property] = event.newValue;
									// increaseImageIncomingLoadedCounter(event.newValue);
									increaseLoadedIncomingMacroReferenceCounters(dbImage, property);
								}
							}				
						}
					});			
					
					flushToDatabase();
				});
				// log(mockMongoDB.getAllRecordsParsed(), 4);
				
				// logUngroup();
			}
		} 

		
		function isMacroEvent(event) {
			return imageEventHasObjectValue(event) && !event.incomingStructureEvent;
		}
		
		
		function imageEventHasObjectValue(event) {
			return imageCausality.isObject(event.newValue) || imageCausality.isObject(event.oldValue);
		}
		
		
		function hasAPlaceholder(dbImage) {
			// log(dbImage);
			return typeof(dbImage.const.dbId) !== 'undefined';
		}

		function writePlaceholderForImageToDatabase(dbImage) {
			let dbId = mockMongoDB.saveNewRecord({});
			dbImage.const.dbId = dbId;
			dbImage.const.serializedMongoDbId = imageCausality.idExpression(dbId);
			return dbId;
		}

		function flushToDatabase() {
			// log("flushToDatabase:");
			// logGroup();
			// log(pendingImageCreations, 2);
			// log(pendingImageUpdates, 2);
			// This one could do a stepwise execution to not block the server. 
			// log("pendingImageCreations:" + Object.keys(pendingImageCreations).length);
			for (let id in pendingImageCreations) {
				// log("create dbImage id:" + pendingImageCreations[id].const.id);
				writeImageToDatabase(pendingImageCreations[id]);
			}
			pendingImageCreations = {};
			
			// TODO: Update entire record if the number of updates are more than half of fields.
			// log("pendingImageUpdates:" + Object.keys(pendingImageUpdates).length);
			for (let id in pendingImageUpdates) {
				// log("update dbImage id:" + id + " keys: " + Object.keys(pendingImageUpdates[id]));
				let updates = pendingImageUpdates[id];
				for (let property in updates) {
					
					// TODO: convert idExpressions
					// log(updates[property]);
					let newValue = convertReferencesToDbIds(updates[property]);
					// log(newValue);
					property = imageCausality.transformPossibleIdExpression(property, imageIdToDbId);
					mockMongoDB.updateRecordPath(id, [property], newValue);
				}
			}
			pendingImageUpdates = {};
			// logUngroup();
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

		function writeImageToDatabase(dbImage) {
			imageCausality.disableIncomingRelations(function() {
				// log(dbImage, 2);
				// log(imageCausality.isObject(dbImage));
				let serialized = (dbImage instanceof Array) ? [] : {};
				for (let property in dbImage) {
					// TODO: convert idExpressions
					if (property !== 'const') {
						//  && property != 'incoming'
						let value = convertReferencesToDbIds(dbImage[property]);
						property = imageCausality.transformPossibleIdExpression(property, imageIdToDbId);
						serialized[property] = value;
					}
				}
				if (!hasAPlaceholder(dbImage)) {
					let dbId = mockMongoDB.saveNewRecord(serialized);
					dbImage.const.dbId = dbId;
					dbImage.const.serializedMongoDbId = imageCausality.idExpression(dbId);
				} else {
					mockMongoDB.updateRecord(dbImage.const.dbId, serialized);
				}			
			});
		}
		
		function convertReferencesToDbIds(entity) {
			// log();
			// log("convertReferencesToDbIds: ");
			// log(entity, 2);
			// log(imageCausality.isObject(entity));
			if (imageCausality.isObject(entity)) {
				let dbImage = entity;
				if (!hasAPlaceholder(entity)) {
					writePlaceholderForImageToDatabase(dbImage);
				}
				return dbImage.const.serializedMongoDbId;
			} else if (entity !== null && typeof(entity) === 'object') {
				// log("===========");
				// log(entity, 3);
				// log("===========");
				
				// entity.foo.bar;
				
				let converted = (entity instanceof Array) ? [] : {};
				for (let property in entity) {
					if (property !== 'const') {
						// TODO: convert idExpressions here? 
						converted[property] = convertReferencesToDbIds(entity[property]);
					}
				}
				return converted;
			} else {
				return entity;
			}
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
			// log("createImagePlaceholderFromDbId: " + dbId);
			let placeholder;
			placeholder = imageCausality.create({});
			placeholder.const.loadedIncomingReferenceCount = 0;
			placeholder.const.dbId = dbId;
			imageIdToImageMap[placeholder.const.id] = placeholder;
			placeholder.const.initializer = imageFromDbIdInitializer;
			return placeholder;
		}
		
		function imageFromDbIdInitializer(dbImage) {
			// if (dbImage.const.dbId === 1)
				// dbImage.foo.bar;
			// log("");
			// log("initialize image " + dbImage.const.id + " from dbId: " + dbImage.const.dbId); 
			// logGroup();
			objectCausality.withoutEmittingEvents(function() {
				imageCausality.withoutEmittingEvents(function() {
					loadFromDbIdToImage(dbImage);
				});
			});
			// log(dbImage);
			// logUngroup();
			// log(dbImage);
		}	
		
		function createObjectPlaceholderFromDbImage(dbImage) {
			// log("createObjectPlaceholderFromDbImage " + dbImage.const.id);
			// connectObjectWithDbImage(placeholder, dbImage);
			let placeholder = objectCausality.create();
			placeholder.const.dbId = dbImage.const.dbId;
			placeholder.const.initializer = objectFromIdInitializer;
			return placeholder;
		}
		
		// function objectFromImageInitializer(object) {
			// // log("initialize object " + object.const.id + " from dbImage " + object.const.dbImage.const.id + ", dbId:" + object.const.dbId);
			// // logGroup();
			// objectCausality.withoutEmittingEvents(function() {
				// imageCausality.withoutEmittingEvents(function() {
					// loadFromDbImageToObject(object);
				// });
			// });
			// // logUngroup();
		// }
		
		function createObjectPlaceholderFromDbId(dbId) {
			// log("createObjectPlaceholderFromDbId: " + dbId);
			let placeholder = objectCausality.create();
			placeholder.const.dbId = dbId;
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
		
		function loadFromDbIdToImage(dbImage) {
			// log("loadFromDbIdToImage dbId: " + dbImage.const.dbId + " dbImage:" + dbImage.const.id);
			imageCausality.disableIncomingRelations(function() {			
				let dbId = dbImage.const.dbId;
				
				// log("loadFromDbIdToImage, dbId: " + dbId);
				let dbRecord = mockMongoDB.getRecord(dbId);
				// log(dbRecord);
				for (let property in dbRecord) {
					// printKeys(dbImage);
					if (property !== 'const' && property !== 'id') {
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
				}
				// log("finished loadFromDbIdToImage: ");
				// log(dbImage.const.dbId);
				// printKeys(dbImage);
				dbImage.const.loaded = true;
				// log("-- ");
			});
					
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
			for (let property in dbImage) {
				if (property !== 'incoming') {
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
		
		
		function unloadAndKillObjects() {
			log("unloadAndKillObjects");
			if (loadedObjects > maxNumberOfLoadedObjects) {
				log("... needs cleanup.... ");
				logGroup();
				objectCausality.withoutEmittingEvents(function() {
					imageCausality.withoutEmittingEvents(function() {
						let leastActiveObject = objectCausality.getActivityListLast();
						while (leastActiveObject !== null && loadedObjects > maxNumberOfLoadedObjects) {
							// log("considering object for unload...");
							while(leastActiveObject !== null && typeof(leastActiveObject.const.dbImage) === 'undefined') { // Warning! can this wake a killed object to life? ... no should not be here!
								// log("skipping unsaved object (cannot unload something not saved)...");
								objectCausality.removeFromActivityList(leastActiveObject); // Just remove them and make GC possible. Consider pre-filter for activity list.... 
								leastActiveObject = objectCausality.getActivityListLast();
							}
							if (leastActiveObject !== null) {
								// log("remove it!!");
								objectCausality.removeFromActivityList(leastActiveObject);
								unloadObject(leastActiveObject);
							}
						}
					});
				});				
				logUngroup();
			} else {
				// log("... still room for all loaded... ");
			}
		}
		
		function unloadObject(object) {
			objectCausality.freezeActivityList(function() {				
				log("unloadObject");
				log(object);
				logGroup();
				// without emitting events.
				
				for (property in object) {
					if (property !== "incoming") {
						delete object[property];					
					}
				}
				loadedObjects--;
				unloadImage(object.const.dbImage);

				object.const.dbId = object.const.dbImage.const.dbId;
				
				
				object.const.isUnloaded = true;
				object.const.initializer = objectFromIdInitializer;
				log("try to kill object just unloaded...");
				tryKillObject(object);
				// objectCausality.blockInitialize(function() {
					// // log("Trying to kill object...");
					// // log(object.const.incomingReferencesCount)
					// if (object.const.incomingReferencesCount === 0) {
						// killObject(object);
					// }
				// });
				logUngroup();
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
            log("tryKillObject: " + objName(object));
			logGroup();
			// logObj(object);
            objectCausality.blockInitialize(function() {
                objectCausality.freezeActivityList(function() {
                    // Kill if unloaded
					let isPersistentlyStored = typeof(object.const.dbImage) !== 'undefined';
					let isUnloaded = typeof(object.const.initializer) === 'function'
					let hasNoIncoming = object.const.incomingReferencesCount  === 0;
                    if (isPersistentlyStored && isUnloaded && hasNoIncoming) {
						log("kill it!");
                        killObject(object);
                    } else {
						log("show mercy!");
						
						log("has incoming: " + !hasNoIncoming);
						log("is persistently stored: " + isPersistentlyStored);
						log("is unloaded: " + isUnloaded);
						// log(object.const.ini);q
					}
                });
            });
			logUngroup();
        }

		
		function killObject(object) {
			log("killObject: " + objName(object));
			let dbImage = object.const.dbImage;

			// log(object.const.target);
			object.const.isKilled = true;
			object.const.dbId = object.const.dbImage.const.dbId;
			delete object.const.dbImage.const.correspondingObject;
			delete object.const.dbImage;

			// Kill DB image if possible...
			tryKillImage(dbImage);
			
			object.const.initializer = zombieObjectInitializer;
		}
		
		function zombieObjectInitializer(object) {
            delete object.const.isKilled;
            object.const.isZombie = true;
			
			// log("zombieObjectInitializer");
			let dbId = object.const.dbId;
			let dbImage = getDbImage(dbId);
			// object.const.isZombie = true; // Access this by object.nonForwardConst.isZombie
			object.const.forwardsTo = getObjectFromImage(dbImage); // note: the dbImage might become a zombie as well...
		}
		
		
		
		function unloadImage(dbImage) {
			// log("unloadImage");
			// logGroup();
			// without emitting events.
			for (property in dbImage) {
				imageCausality.disableIncomingRelations(function() {
					// Incoming should be unloaded here also, since it can be recovered.
					let value = dbImage[property];
					decreaseLoadedIncomingMacroReferenceCounters(dbImage, property);
					// decreaseImageIncomingLoadedCounter(value);
					delete dbImage[property]; 
				});
			}
			dbImage.const.initializer = imageFromDbIdInitializer;
			
			// log(dbImage.const.incomingReferencesCount)
			tryKillImage(dbImage);
			
			// logUngroup();
		}
		
		function tryKillImage(dbImage) {
			// log("Trying to kill image...");
			imageCausality.blockInitialize(function() {
				if (dbImage.const.incomingReferencesCount === 0 && typeof(dbImage.const.correspondingObject) === 'undefined') {
					killDbImage(dbImage)
				}
			});
		}
		
		function killDbImage(dbImage) {
			// log("killDbImage");
			// if (typeof(dbImage.const.correspondingObject) !== 'undefined') {
				// let object = dbImage.const.correspondingObject;
				// delete object.const.dbImage;
				// delete dbImage.const.correspondingObject;
			// }
			delete dbIdToDbImageMap[dbImage.const.dbId];

			// dbImage.const.initializer = zombieImageInitializer;
		}
		
		// There should never be any zombie image... 
		// function zombieImageInitializer(dbImage) {
			// // log("zombieImageInitializer");
			// dbImage.const.forwardsTo = getDbImage(dbImage.const.dbId);
		// }
		
		/*-----------------------------------------------
		 *           Setup database
		 *-----------------------------------------------*/
		
		function setupDatabase() {
			if (typeof(objectCausality.persistent) === 'undefined') {
				if (mockMongoDB.getRecordsCount() === 0) {
					// objectCausality.pulse(function() {
						objectCausality.persistent = objectCausality.create();
						loadedObjects++;
						createEmptyDbImage(objectCausality.persistent);			
					// });
				} else {
					objectCausality.persistent = createObjectPlaceholderFromDbId(0);
				}
			} else {
				let target = objectCausality.persistent.const.target
				for (let property in target) {
					delete target[property];
				}
				if (mockMongoDB.getRecordsCount() === 0) {
					createEmptyDbImage(objectCausality.persistent);
				} else {
					objectCausality.persistent.const.dbId = 0;
					delete objectCausality.persistent.const.dbImage;
					
					objectCausality.persistent.const.initializer = objectFromIdInitializer;
				} 
				dbIdToDbImageMap = {};
			}	
		}
		
		function unloadAllAndClearMemory() {
			objectCausality.resetObjectIds();
			imageCausality.resetObjectIds();
			dbIdToDbImageMap = {};
			setupDatabase();
		}
		
		function clearDatabaseAndClearMemory() {
			mockMongoDB.clearDatabase();
			unloadAllAndClearMemory();
		}
		
		/*-----------------------------------------------
		 *           Incoming relations
		 *-----------------------------------------------*/
		 
		function forAllPersistentIncomingNow(object, property, callback) {
			// No observation, cannot observe on asynchronous functions. The "Now" version is mostly for debugging/development
			// registerAnyChangeObserver(getSpecifier(getSpecifier(object.const, "incomingObservers"), property));

			objectCausality.withoutRecording(function() { // This is needed for setups where incoming structures are made out of causality objects. 
				imageCausality.withoutRecording(function() { // This is needed for setups where incoming structures are made out of causality objects. 
					imageCausality.disableIncomingRelations(function() {						
						if (typeof(object.const.dbImage) !== 'undefined') {
							let dbImage = object.const.dbImage;
							if (typeof(dbImage.incoming) !== 'undefined') {
								let relations = dbImage.incoming;
								// log(relations);
								// log("here");
								if (typeof(relations[property]) !== 'undefined') {
									let relation = relations[property];
									let contents = relation.contents;
									for (id in contents) {
										let referer = getObjectFromImage(contents[id]);
										callback(referer);
									}
									// log(relation);
									let currentChunk = relation.first
									while (currentChunk !== null) {
										let contents = currentChunk.contents;
										for (id in contents) {
											let referer = getObjectFromImage(contents[id]);
											callback(referer);
										}
										currentChunk = currentChunk.next;
									}
								}
							}
						}
					});
				});
			});
		}
		 
		/*-----------------------------------------------
		 *           Setup object causality
		 *-----------------------------------------------*/
		 
		// MongoDB
		let mockMongoDB = require("./mockMongoDB.js")(JSON.stringify(configuration));	
		
			
		// Image causality
		// let imageCausality = requireUncached("causalityjs_advanced");
		let imageCausality = require("./causality.js")({ 
			name : 'imageCausality:' + JSON.stringify(configuration),
			recordPulseEvents : true, 
			
			useIncomingStructures: true,
			incomingReferenceCounters : true, 
			incomingStructuresAsCausalityObjects : true,
			blockInitializeForIncomingReferenceCounters: true,
		});
		imageCausality.addPostPulseAction(postImagePulseAction);
		imageCausality.addRemovedLastIncomingRelationCallback(function(dbImage) {
			tryKillImage(dbImage);
		});



		
		// Primary causality object space
		let objectCausalityConfiguration = {};
		Object.assign(objectCausalityConfiguration, configuration.causalityConfiguration);
		Object.assign(objectCausalityConfiguration, {
			name: 'objectCausality:' + JSON.stringify(configuration), 
			recordPulseEvents : true,
			objectActivityList : true,
			incomingReferenceCounters : true, 
			blockInitializeForIncomingStructures: true, 
			blockInitializeForIncomingReferenceCounters: true
			// TODO: make it possible to run these following in conjunction with eternity.... as of now it will totally confuse eternity.... 
			// incomingRelations : true, // this works only in conjunction with incomingStructuresAsCausalityObjects, otherwise isObject fails.... 
			// incomingStructuresAsCausalityObjects : true
		});
		let objectCausality = require("./causality.js")(objectCausalityConfiguration);
		
		// Additions 
		objectCausality.addPostPulseAction(postObjectPulseAction);
		objectCausality.mockMongoDB = mockMongoDB;
		objectCausality.unloadAllAndClearMemory = unloadAllAndClearMemory;
		objectCausality.clearDatabaseAndClearMemory = clearDatabaseAndClearMemory;
		objectCausality.forAllPersistentIncomingNow = forAllPersistentIncomingNow;
		objectCausality.imageCausality = imageCausality;
		objectCausality.instance = objectCausality;
		// TODO: install this... 
		objectCausality.addRemovedLastIncomingRelationCallback(function(dbImage) {
			log("incoming relations reaced zero...")
            tryKillObject(dbImage);
        });

		
		// Setup database
		setupDatabase();
		
		
		return objectCausality;
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
			causalityConfiguration : {}
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
