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
	// function log() {
		// throw new Error("quit talking");
	// }
	let logGroup = objectlog.enter;
	let logUngroup = objectlog.exit;

	function createEternityInstance(configuration) {
		// log("createEternityInstance: " + configuration.name);
		// logGroup();
		// log(configuration,5);
		// logUngroup();

		/*-----------------------------------------------
		 *          Object post pulse events
		 *-----------------------------------------------*/
		 
		let unstableImages = [];

		function postObjectPulseAction(events) {
			// log("postObjectPulseAction: " + events.length + " events");
			// logGroup();
			// if (events.length > 0) {
			objectCausality.freezeActivityList(function() {
				// log(events, 3);
				transferChangesToImage(events);
			});	
			// }
			unloadAndKillObjects();
			
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
									addUnstableOrigin(event.object.const.dbImage);
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
											
											addUnstableOrigin(oldValueDbImage);
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
				_eternityObjectClass : Object.getPrototypeOf(object).constructor.name,
				_eternityImageClass : (object instanceof Array) ? "Array" : "Object", 
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
			let dbImage = imageCausality.create(contents); // Only Object image here... 
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
				objectCausality.pokeObject(object); // poke all newly saved?
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
		
		let pendingUpdate;

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



		let nextTmpDbId;
		let tmpDbIdToDbImage;
		let tmpDbIdToDbId;
		let tmpDbIdPrefix = "_tmp_id_";
		

		function postImagePulseAction(events) {
			// log("postImagePulseAction: " + events.length + " events");
			// logGroup();
			if (events.length > 0) {
				// Set the class of objects created... TODO: Do this in-pulse somehow instead?
				addImageClassNames(events);
				
				// Serialize changes in memory
				compileUpdate(events);
				
				// Push changes to database
				twoPhaseComit();
				
				// Cleanup
				tmpDbId = 0;
				tmpDbIdToDbImage = null;
				tmpDbIdToDbId = null;
				pendingUpdate = null;
			
			} else {
				// log("no events...");
				// throw new Error("a pulse with no events?");
			}
			// logUngroup();
		} 

		function addImageClassNames(events) {
			imageCausality.assertNotRecording();
			imageCausality.disableIncomingRelations(function() {
				events.forEach(function(event) {
					if (event.type === 'creation') { // Note: it only works 
						event.object._eternityImageClass = Object.getPrototypeOf(event.object).constructor.name;
						// log("className: " + event.object._eternityImageClass);
						if (typeof(event.object._eternityImageClass) === 'unefined' || event.object._eternityImageClass === 'undefined') {
							throw new Error("Could not set _eternityImageClass");
						}
					}
				});				
			});
		}
		
		
		/*-----------------------------------------------
		 *        First stage: Compile update 
		 *-----------------------------------------------*/
		
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
		
		function compileUpdate(events) {
			// log("compileUpdate:");
			logGroup();
			imageCausality.disableIncomingRelations(function () { // All incoming structures fully visible!
				
				// Temporary ids for two phase comit to database.
				nextTmpDbId = 0;
				tmpDbIdToDbImage = {};
				tmpDbIdToDbId = {};
				pendingUpdate = {
					imageCreations : {},
					imageUpdates : {}
				}

				// Extract updates and creations to be done.
				events.forEach(function(event) {
					if (!isMacroEvent(event)) {
						let dbImage = event.object;
						let imageId = dbImage.const.id;
							
						if (event.type === 'creation') {
							// Maintain image structure
							for (let property in dbImage) {
								increaseLoadedIncomingMacroReferenceCounters(dbImage, property);
							}
							
							// Serialized image creation, with temporary db ids. 
							let tmpDbId = getTmpDbId(dbImage);
							pendingUpdate.imageCreations[tmpDbId] = serializeDbImage(dbImage);
							
							// if (typeof(pendingUpdate.imageUpdates[imageId]) !== 'undefined') {
								// // We will do a full write of this image, no need to update after.				
								// delete pendingUpdate.imageUpdates[dbId];   // will never happen anymore?
							// }
						} else if (event.type === 'set') {
							if (typeof(dbImage.const.dbId) !== 'undefined') { // && typeof(pendingUpdate.imageCreations[imageId]) === 'undefined'
								// Maintain image structure
								increaseLoadedIncomingMacroReferenceCounters(dbImage, event.property);
								// decreaseLoadedIncomingMacroReferenceCounters(dbImage, event.); // TODO: Decrease counters here?
								
								// Only update if we will not do a full write on this image. 
								let dbId = dbImage.const.dbId;
								if (typeof(pendingUpdate.imageUpdates[dbId]) === 'undefined') {
									pendingUpdate.imageUpdates[dbId] = {};
								}
								let imageUpdates = pendingUpdate.imageUpdates[dbId];
								
								// Serialized value with temporary db ids. 
								let newValue = convertReferencesToDbIdsOrTemporaryIds(event.newValue);
								let property = event.property;
								property = imageCausality.transformPossibleIdExpression(property, imageIdToDbIdOrTmpDbId);
								imageUpdates[event.property] = newValue;
							}
						}				
					}
				});								
			});
			// log(pendingUpdate, 3);
			logUngroup();
		}
		
		
		function isMacroEvent(event) {
			return imageEventHasObjectValue(event) && !event.incomingStructureEvent;
		}
		
		
		function imageEventHasObjectValue(event) {
			return imageCausality.isObject(event.newValue) || imageCausality.isObject(event.oldValue);
		}
		
	
		// should disableIncomingRelations
		function serializeDbImage(dbImage) {
			// imageCausality.disableIncomingRelations(function() {
			// log(dbImage, 2);
			// log(imageCausality.isObject(dbImage));
			let serialized = (dbImage instanceof Array) ? [] : {};
			for (let property in dbImage) {
				// TODO: convert idExpressions
				if (property !== 'const') {
					// && property != 'incoming'
					let value = convertReferencesToDbIdsOrTemporaryIds(dbImage[property]);
					property = imageCausality.transformPossibleIdExpression(property, imageIdToDbIdOrTmpDbId);
					serialized[property] = value;
				}
			}
			return serialized;			
		}
		
		
		function convertReferencesToDbIdsOrTemporaryIds(entity) {
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
				// log("===========");
				// log(entity, 3);
				// log("===========");
				
				// entity.foo.bar;
				
				let converted = (entity instanceof Array) ? [] : {};
				for (let property in entity) {
					if (property !== 'const') {
						property = imageCausality.transformPossibleIdExpression(property, imageIdToDbIdOrTmpDbId);
						converted[property] = convertReferencesToDbIdsOrTemporaryIds(entity[property]);
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

		function twoPhaseComit() {
			// log("twoPhaseComit:");
			// logGroup();

			// First Phase, store transaction in database for transaction completion after failure (cannot rollback since previous values are not stored, could be future feature?). This write is atomic to MongoDb.
			if (configuration.twoPhaseComit) mockMongoDB.updateRecord(updateDbId, pendingUpdate);
			
			// Create 
			let imageCreations = pendingUpdate.imageCreations;
			for (let tmpDbId in imageCreations) {
				writePlaceholderToDatabase(tmpDbId); // sets up tmpDbIdToDbId
			}
			for (let tmpDbId in imageCreations) {
				writeSerializedImageToDatabase(tmpDbIdToDbId[tmpDbId], replaceTmpDbIdsWithDbIds(imageCreations[tmpDbId]));
			}
			
			// TODO: Update entire record if the number of updates are more than half of fields.
			// log("pendingImageUpdates:" + Object.keys(pendingImageUpdates).length);
			for (let id in pendingUpdate.imageUpdates) {
				// log("update dbImage id:" + id + " keys: " + Object.keys(pendingImageUpdates[id]));
				let updates = pendingUpdate.imageUpdates[id];
				let updatesWithoutDbIds = replaceTmpDbIdsWithDbIds(updates);
				for (let property in updatesWithoutDbIds) {
					let value = updatesWithoutDbIds[property];
					// value = replaceTmpDbIdsWithDbIds(value);
					// property = imageCausality.transformPossibleIdExpression(property, convertTmpDbIdToDbId);
					mockMongoDB.updateRecordPath(id, [property], value);
				}
			}

			// Write dbIds back to the images. TODO: consider, how do they get back to the object? maybe not, so we need to move it there in the unload code. 
			// Note: this stage can be ignored in recovery mode, as then there no previously loaded objects.
			for (let tmpDbId in tmpDbIdToDbImage) {
				// log("WRITING:");
				let dbImage = tmpDbIdToDbImage[tmpDbId];
				// log(dbImage.const.name);
				let dbId = tmpDbIdToDbId[tmpDbId];				
				dbImage.const.dbId = dbId;
				dbImage.const.serializedMongoDbId = imageCausality.idExpression(dbId);
				// log(dbImage.const);
			}
			
			// Finish, clean up transaction
			if (configuration.twoPhaseComit) mockMongoDB.updateRecord(updateDbId, {});
			
			// logUngroup();
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
				// TODO: what about the property? 
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
		
		
		function writePlaceholderToDatabase(tmpDbId) {
			let dbId = mockMongoDB.saveNewRecord({_eternitySerializedTmpDbId : tmpDbId}); // A temporary id so we can trace it down in case of failure.
			tmpDbIdToDbId[tmpDbId] = dbId; //imageCausality.idExpression(dbId); ? 
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
			placeholder = imageCausality.create(createTarget(peekAtRecord(dbId)._eternityImageClass));
			placeholder.const.loadedIncomingReferenceCount = 0;
			placeholder.const.dbId = dbId;
			placeholder.const.serializedMongoDbId = imageCausality.idExpression(dbId);
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
			let placeholder = objectCausality.create(createTarget(peekAtRecord(dbImage.const.dbId)._eternityObjectClass));
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
		
		function createTarget(className) {
			if (typeof(className) !== 'undefined') {
				if (className === 'Array') {
					return []; // On Node.js this is different from Object.create(eval("Array").prototype) for some reason... 
				} else if (className === 'Object') {
					return {}; // Just in case of similar situations to above for some Javascript interpretors... 
				} else {
					if (typeof(configuration.classRegistry[className]) === 'function') {
						return Object.create(configuration.classRegistry[className].prototype);
					} else if (typeof(configuration.classRegistry[className]) === 'object') {
						return Object.create(configuration.classRegistry[className]);
					} else {
						throw new Error("Cannot find class named " + className + ". Make sure to enter it in the eternity classRegistry configuration." );
					}
				}
			} else {
				return {};
			}
		}
		
		function createObjectPlaceholderFromDbId(dbId) {
			// log("createObjectPlaceholderFromDbId: " + dbId);
			let placeholder = objectCausality.create(createTarget(peekAtRecord(dbId)._eternityObjectClass));
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
		
		let peekedAtDbRecords = {};
		function peekAtRecord(dbId) {
			if (typeof(peekedAtDbRecords[dbId]) === 'undefined') {
				peekedAtDbRecords[dbId] = mockMongoDB.getRecord(dbId);
			}
			return peekedAtDbRecords[dbId];
		}
		
		function getDbRecord(dbId) {
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
		
		function loadFromDbIdToImage(dbImage) {
			// log("loadFromDbIdToImage dbId: " + dbImage.const.dbId + " dbImage:" + dbImage.const.id);
			imageCausality.disableIncomingRelations(function() {			
				let dbId = dbImage.const.dbId;
				
				// log("loadFromDbIdToImage, dbId: " + dbId);
				let dbRecord = getDbRecord(dbId);
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
				dbImage.const.name = dbRecord.name; // TODO remove debugg

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
			object.const.name = dbImage.const.name; // TODO remove debugg
			for (let property in dbImage) {
				if (property !== 'incoming' && !property.startsWith("_eternity")) {
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
			// log("unloadAndKillObjects");
			if (loadedObjects > maxNumberOfLoadedObjects) {
				// log("Too many objects, unload some... ");
				logGroup();
				objectCausality.withoutEmittingEvents(function() {
					imageCausality.withoutEmittingEvents(function() {
						let leastActiveObject = objectCausality.getActivityListLast();
						objectCausality.freezeActivityList(function() {
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
				});
				logUngroup();
			} else {
				// log("... still room for all loaded... ");
			}
		}
		
		function unloadObject(object) {
			objectCausality.freezeActivityList(function() {				
				// log("unloadObject " + object.const.name);
				logGroup();
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
            // log("tryKillObject: " + objName(object));
			logGroup();
			// logObj(object);
            objectCausality.blockInitialize(function() {
                objectCausality.freezeActivityList(function() {
                    // Kill if unloaded
					let isPersistentlyStored = typeof(object.const.dbImage) !== 'undefined';
					let isUnloaded = typeof(object.const.initializer) === 'function'
					let hasNoIncoming = object.const.incomingReferencesCount  === 0;
                    
					// log("is unloaded: " + isUnloaded);
					// log("has incoming: " + !hasNoIncoming);
					// log("is persistently stored: " + isPersistentlyStored);
					
					if (isPersistentlyStored && isUnloaded && hasNoIncoming) {
						// log("kill it!");
                        killObject(object);
                    } else {
						// log("show mercy!");
						

						// log(object.const.ini);q
					}
                });
            });
			logUngroup();
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
			tryKillImage(dbImage);
			
			object.const.initializer = zombieObjectInitializer;
		}
		
		function zombieObjectInitializer(object) {
			// log("zombieObjectInitializer");
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
			for (let property in dbImage) {
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
		
		function createListType(name, linkName) {
			if (typeof(linkName) === 'undefined') linkName = name;
			
			let eternityTag = "_eternity";
			return {
				first : eternityTag + "FirstOf" + name, 
				last : eternityTag + "LastOf" + name, 
				next : eternityTag + linkName + "Next", 
				previous : eternityTag + linkName + "Previous"	
			};
		}
		
		function isEmptyList(head, listType) {
			return head[listType.first] === null;
		}
		
		function detatchAllListElements(head, listType) {
			head[listType.first] = null;
			head[listType.last] = null;			
		}
		
		function replaceEntireList(head, listType, firstElement, lastElement) {
			head[listType.first] === firstElement;
			head[listType.last] === lastElement;
		}
		
		function initializeList(head, listType) {
			head[listType.first] = null;
			head[listType.last] = null;
		}
		
		function addLastToList(head, listType, listElement) {
			let first = listType.first;
			let last = listType.last;
			let next = listType.next;
			let previous = listType.next;
			
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
			let first = listType.first;
			let last = listType.last;
			let next = listType.next;
			let previous = listType.next;
			
			if (head[first] !== null) {
				head[first][previous] = listElement;
				listElement[next] = head[first];
				listElement[previous] = null;
				head[first] = listElement;
			} else {
				head[first] = listElement;				
				head[last] = listElement;				
				listElement[previous] = null;
				listElement[next] = null;
			}
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
			let first = listType.first;
			let last = listType.last;
			let next = listType.next;
			let previous = listType.next;
			
			if(listElement[next] !== null) {
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
			
			delete listElement[next];
			delete listElement[previous];
		}
		
		
		
		/*-----------------------------------------------
		 *           Garbage collection
		 *-----------------------------------------------*/
		
		// Main state-holder image
		let gcState; 
			
		// List types
		let pendingForChildReattatchment = createListType("PendingForChildReattatchment");
		
		let pendingUnstableOrigins = createListType("PendingUnstableOrigin");
		
		let unstableZone = createListType("UnstableZone");
		let unexpandedUnstableZone = createListType("UnexpandedUnstableZone", "UnstableUnexpandedZone");
		let nextUnexpandedUnstableZone = createListType("NextUnexpandedUnstableZone", "UnstableUnexpandedZone");
	
		let destructionZone = createListType("DestructionZone");
		
		function initializeGcState() {
			initializeList(gcState, pendingForChildReattatchment);
			
			initializeList(gcState, pendingUnstableOrigins);
			
			initializeList(gcState, unstableZone);
			initializeList(gcState, unexpandedUnstableZone);
			initializeList(gcState, nextUnexpandedUnstableZone);
		}
		
		function addUnstableOrigin(pendingUnstableOrigin) {
			let pendingUnstableImage = pendingUnstableOrigin.const.dbImage;
			imageCausality.disableIncomingRelations(function() {
				if (typeof(pendingUnstableImage._entityDoNotAddToPendingUnstableOriginList) === 'undefined') {
					pendingUnstableImage._entityDoNotAddToPendingUnstableOriginList = true;

					addFirstToList(gcState, pendingUnstableImage, pendingUnstableOrigins);
				}
			});
		}
		
		
		function getFirstPendingUnstableObject() {
			let firstImage = removeFirstFromList(gcState, pendingUnstableOrigins);			
			return getObjectFromImage(firstImage);
		}
		
		function collectAll() {
			while(!oneStepCollection()) {}
		}
				
		function isUnstable(dbImage) {
			return typeof(dbImage._eternityParent) === 'undefined';
		}
		
		function removeFromAllGcLists(dbImage) {
			removeFromList(gcState, pendingUnstableOrigins, dbImage);
			removeFromList(gcState, pendingForChildReattatchment, dbImage);
			removeFromList(gcState, unstableZone, dbImage);
			removeFromList(gcState, unexpandedUnstableZone, dbImage);
			removeFromList(gcState, nextUnexpandedUnstableZone, dbImage);
		}
		
		function oneStepCollection() {
			// Save 
			if (!isEmptyList(gcState, pendingForChildReattatchment)) {
				let current = removeFirstFromList(gcState, pendingForChildReattatchment);
				let object = getObjectFromImage(current.dbImage);
				
				for (let property in current) {
					let value = expadable[property];
					if (objectCausality.isObject(value) && isUnstable(object)) {
						let referedImage = value.const.dbImage;
						referedImage._eternityParent = current.parent;
						referedImage._eternityParentProperty = current.parentProperty;
						addLastToList(gcState, pendingForChildReattatchment, referedImage);
						removeFromAllGcLists(object);
					}
				}

				return false;
			}

			// Move to next zone expansion
			if (isEmptyList(gcState, unexpandedUnstableZone) && !isEmptyList(gcState, nextUnexpandedUnstableZone)) {
				let first = getFirstOfList(gcState, nextUnexpandedUnstableZone);
				let last = getLastOfList(gcState, nextUnexpandedUnstableZone);
				detatchAllListElements(gcState, nextUnexpandedUnstableZone);
				replaceEntireList(gcState, unexpandedUnstableZone, first, last);
				return false;
			}
			
			// Expand unstable zone
			if (!isEmptyList(gcState, unexpandedUnstableZone)) {
				let dbImage = removeFirstFromList(gcState, unexpandedUnstableZone);
				let object = getObjectFromImage(dbImage);
				// Consider: Will this cause an object pulse???
				for (let property in object) {
					let value = object[property];
					if (objectCausality.isObject(value)) {
						let referedImage = value.const.dbImage;
						if (referedImage._eternityParent === dbImage && property === referedImage._eternityParentProperty) {
							addLastToList(gcState, nextUnexpandedUnstableZone, referedImage);
							addLastToList(gcState, unstableZone, referedImage);
							delete dbImage._eternityParent; // This signifies that an image (if connected to an object), is unstable. If set to null, it means it is a root.
							delete dbImage._eternityParentProperty;
						}
					}
				}
				
				// gcState.unstableUnexpandedZoneFirst.
				return false;
			};

			
			// Try to save unstable zone.
			while(!isEmptyList(gcState, unstableZone)) {
				let dbImage = removeFirstFromList(gcState, unstableZone);
				let object = getObjectFromImage();
				
				if (typeof(object.incoming) !== 'undefined') {
					for (let incomingProperty in object.incoming) {
						let root = object.incoming[incomingProperty];
						
						gcState.currentIncoming = root;
						
						let value = object[property];
						if (objectCausality.isObject(value)) {
							let referedImage = value.const.dbImage;
							if (referedImage._eternityParent === dbImage && property === referedImage._eternityParentProperty) {
								addLastToList(gcState, nextUnexpandedUnstableZone, referedImage);
								addLastToList(gcState, unstableZone, referedImage);
								delete dbImage._eternityParent; // This signifies that an image (if connected to an object), is unstable. If set to null, it means it is a root.
								delete dbImage._eternityParentProperty;
							}
						}
					}					
				}

				destructionZone()
				
			}
			
			// Delete rest of unstable zone.
			
			// Start a new zone.
			if (gcState.pendingUnstableOriginFirst !== null) {
				// Start new unstable cycle.
				let newUnstableZone = getFirstPendingUnstableObject();
				addFirstToList(gcState, unstableZone, newUnstableZone.const.dbImage);
				addFirstToList(gcState, unstable);
				return false;
			} else {
				// Finally! everything is done
				return true;
			}
		}
		
		
		/*-----------------------------------------------
		 *           Setup database
		 *-----------------------------------------------*/
		
		let persistentDbId;
		let updateDbId;
		let collectionDbId;
		
		function setupDatabase() {
			// log("setupDatabase");
			logGroup();

			// Clear peek at cache
			peekedAtDbRecords = {};
			
			// if (typeof(objectCausality.persistent) === 'undefined') {
			if (mockMongoDB.getRecordsCount() === 0) {
				// log("setup from an empty database...");
				
				// Persistent root object
				persistentDbId = mockMongoDB.saveNewRecord({ name : "persistent" });

				// Update placeholder
				if (configuration.twoPhaseComit) updateDbId = mockMongoDB.saveNewRecord({ name: "updatePlaceholder" });
				
				// Garbage collection state.
				collectionDbId = mockMongoDB.saveNewRecord({ name : "garbageCollection" });
			} else {
				// Setup ids for basics.
				// TODO
			}
			objectCausality.persistent = createObjectPlaceholderFromDbId(persistentDbId);
			gcState = createImagePlaceholderFromDbId(collectionDbId);
			
			logUngroup();
		}
		
		
		// Note: causality.persistent is replace after an unload... 
		function unloadAllAndClearMemory() {
			objectCausality.resetObjectIds();
			imageCausality.resetObjectIds();
			delete objectCausality.persistent;
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
		 
		// The "Now" version is mostly for debugging/development
		function forAllPersistentIncomingNow(object, property, callback) {
			forAllPersistentIncoming(object, property, callback);
			processAllVolatileIterations();
			// processAllPersistentIterations();
			
			// registerAnyChangeObserver(getSpecifier(getSpecifier(object.const, "incomingObservers"), property)); // Consider: could this be a ligit way to setup observing.... 
		}
	
	
		function isPersistable(action) {
			return (typeof(action) !== 'function');
		}
		
		function createObjectAction(object, functionName) {
			return imageCausality.create({
				type: "objectAction", 
				object: object, 
				functionName : functionName
			});
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
		
		
		function forAllPersistentIncomingPersistentIteration(object, property, objectAction) {
			imageCausality.disableIncomingRelations(function() {	
				if (typeof(objectCausality.persistent.iterations) === 'undefined') {
					let iterations = imageCausality.create([]);
					// iterations._eternityImageClass = "Array"; // TODO: fix this automatic somehow... 
					objectCausality.persistent.iterations = iterations;
				}
			
				objectCausality.persistent.iterations.push(imageCausality.create({
					target : object.const.dbImage, 
					property : property,
					action : objectAction,
					state : null
				}));
			});
		}
		
		
		let volatileIterations = [];
		
		function forAllPersistentIncomingVolatileIteration(object, property, objectAction) {
			log("forAllPersistentIncomingVolatileIteration");
			imageCausality.disableIncomingRelations(function() {
				if (typeof(object.const.dbImage) !== 'undefined') {
					let dbImage = object.const.dbImage;
					if (typeof(dbImage.incoming) !== 'undefined') {
						let relations = dbImage.incoming;
						// log(relations, 3);
						// log("here");
						if (typeof(relations[property]) !== 'undefined') {
							// Start of with all in current chunk... 
							let relation = relations[property];
							// log(relation);
							let contents = relation.contents;
							// log(contents);
							for (let id in contents) {
								if (!id.startsWith("_eternity")) {
									let referer = getObjectFromImage(contents[id]);
									log("Iterate object in chunk...");
									objectAction(referer);											
								}
							}
							// log(relation);
							let currentChunk = relation.first
							if (typeof(currentChunk) !== 'undefined' && currentChunk !== null) {
								log("push chunk!");
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
			log("processVolatileIterationsOneStep");
			imageCausality.disableIncomingRelations(function() {
				let newIterations = [];
				volatileIterations.forEach(function(iteration) {
					let currentChunk = iteration.currentChunk;
					let contents = currentChunk.contents;
					log("process chunk...");
					for (let id in contents) {
						if (!id.startsWith("_eternity")) {
							let referer = getObjectFromImage(contents[id]);
							iteration.objectAction(referer);
						}
					}
					log("Here!!!")
					log(currentChunk);
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
		 *           Setup object causality
		 *-----------------------------------------------*/
		 
		// MongoDB
		let mockMongoDB = require("./mockMongoDB.js")(JSON.stringify(configuration));	
			
		// Image causality
		// let imageCausality = requireUncached("causalityjs_advanced");
		let imageCausality = require("./causality.js")({ 
			name : 'imageCausality:' + JSON.stringify(configuration),
			recordPulseEvents : true, 
			incomingStructureChunkSize : configuration.persistentIncomingChunkSize,
			useIncomingStructures: true,
			incomingReferenceCounters : true, 
			incomingStructuresAsCausalityObjects : true,
			blockInitializeForIncomingReferenceCounters: true,
		});
		imageCausality.addPostPulseAction(postImagePulseAction);
		imageCausality.addRemovedLastIncomingRelationCallback(function(dbImage) {
			//unload image first if not previously unloaded?
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
			// log("incoming relations reaced zero...");
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
			persistentIncomingChunkSize : 500,
			classRegistry : {},
			twoPhaseComit : true,
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
