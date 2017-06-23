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
	// Require uncached, to support multipple causalities. 
	// const dbIdPrefix = "_causality_persistent_id_";
	// const dbIdExpressionPrefix = "_causality_persistent_id_expression";

	
	// Primary causality object space
	let objectCausality
		
	// Image causality
	// let imageCausality = requireUncached("causalityjs_advanced");
	let imageCausality = require("./causality.js")({ 
		name : 'imageCausality',
		recordPulseEvents : true, 
		
		mirrorRelations: true, 
		exposeMirrorRelationIntermediary : true,
		mirrorStructuresAsCausalityObjects : true
	});

	// MongoDB
	let mockMongoDB = require("./mockMongoDB.js");

	// Neat logging
	let objectlog = require('./objectlog.js');
	let log = objectlog.log;
	let logGroup = objectlog.enter;
	let logUngroup = objectlog.exit;
	// let log = console.log;

	/*-----------------------------------------------
	 *     persistentObjectIdToObjectMap... Important, needs to 
	 *-----------------------------------------------*/
	
	// let persistentObjectIdToObjectMap = {}
	

	/*-----------------------------------------------
	 *          Object post pulse events
	 *-----------------------------------------------*/
	 
	let unstableImages = [];


	function postObjectPulseAction(events) {
		transferChangesToImage(events);
		// unloadAndKillObjects();
	} 
	
	
	function transferChangesToImage(events) {
		if (events.length > 0) {
			log("postObjectPulseAction: " + events.length + " events");
			logGroup();
			// log("... Model pulse complete, update image and flood create images & flood unstable ");
			log("events.length = " + events.length);
			if (typeof(objectCausality.noCleanups) !== 'undefined')
				events.foo.bar;
			// log(events, 2);
			imageCausality.pulse(function() {
				
				// Mark unstable and flood create new images into existance.
				events.forEach(function(event) {
					log("event: " + event.type + " " + event.property);
					
					// Catch togging of independently persistent
					if (event.type === 'set') {
						// log("set event");
						let object = event.object;

						if (event.property === '_independentlyPersistent') {
							
							// Setting of independently persistent
							if (event.newValue && typeof(object.const.dbImage) === 'undefined') {
								// Object had no image, flood-create new images.
								object.const.dbImage = createDbImageRecursivley(object, null, null);
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
							let newValue = event.newValue;
							if (objectCausality.isObject(newValue)) {
								newValue = createDbImageRecursivley(newValue, objectDbImage, event.property);
							}
							objectDbImage[event.property] = newValue;
						}
					}
				});

				// console.log("=== End model pulse post process === ");
				// Process unstable ones. Initiate garbage collection
			// console.log(events);
			});
			logUngroup();
		}
	}
	
	function createIsolatedDbImageFromLoadedObject(object, potentialParentImage, potentialParentProperty) {
		// log(object, 3);
		// console.log(object);
		let imageContents = {
			_eternityParent : potentialParentImage,
			_eternityParentProperty : potentialParentProperty
		};
		for (let property in object) {
			let value = object[property];
			// TODO: translate property
			if (!objectCausality.isObject(value)) {
				imageContents[property] = value;
			}
		}
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
			// console.log("connectObjectWithDbImage: " + dbImage.const.dbId);
			dbImage.const.correspondingObject = object;					
		});
		objectCausality.blockInitialize(function() {
			object.const.dbImage = dbImage;
		});
	}
	
			
	function createDbImageRecursivley(entity, potentialParentImage, potentialParentProperty) {
		// console.log("createDbImageRecursivley");
		if (objectCausality.isObject(entity)) {
			let object = entity;
			// console.log("foo");
			// console.log(object);
			// console.log(object.const);
			// console.log("foo");
			
			if (typeof(object.const.dbImage) === 'undefined') {
				let dbImage = createIsolatedDbImageFromLoadedObject(object, potentialParentImage, potentialParentProperty);
				for (let property in object) { 
					let value = object[property];
					if (objectCausality.isObject(value)) {
						// TODO: translate property idExpressions
						dbImage[property] = createDbImageRecursivley(value, dbImage, property);
					}
				}
				object.const.dbImage = dbImage;
				dbImage.const.correspondingObject = object;
			}
			
			return object.const.dbImage;
		} else {
			return entity;
		}
	} 
	
		// TODO: Do this asynchronously
	function floodUnstable(potentiallyUnstableImage, parent, parentRelation) {
		if (parent === null || (parent === unstableImage._eternityParent && parentRelation === unstableImage._eternityParentProperty)) {
			unstableImages.push(potentiallyUnstableImage);
			for (let property in potentiallyUnstableImage) {
				floodUnstable(potentiallyUnstableImage[property], potentiallyUnstableImage, property);
			}
		}
	}
	

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
				if (event.type === 'set') {
					log(valueToString(event.object) + ".set " + event.property + " to " + valueToString(event.newValue) + (event.incomingStructureEvent ? " [incoming]" : ""));
				}
			});
		});
	}				

	
	function postImagePulseAction(events) {
		if (events.length > 0) {
			log("postImagePulseAction: " + events.length + " events");
			logGroup();
			//log(" ... Image pulse complete, sort events according to object id and flush to database");
			
			// log(events, 3);
			// Extract updates and creations to be done.
			imageCausality.disableIncomingRelations(function () {
				events.forEach(function(event) {
					if (!isMacroEvent(event)) {
						logEvent(event);
					
						let dbImage = event.object;
						// log("Considering " + event.type + " event with object:");
						// log(dbImage, 2);
						let imageId = dbImage.const.id;
						let dbId = dbImage.const.dbId;
							
						if (event.type === 'creation') {
							pendingImageCreations[imageId] = dbImage;
							// if (typeof(pendingImageUpdates[imageId]) !== 'undefined') {
								// // We will do a full write of this image, no need to update after.				
								// delete pendingImageUpdates[dbId];   // will never happen anymore?
							// }
						} else if (event.type === 'set') {
							if (typeof(dbId) !== 'undefined') { // && typeof(pendingImageCreations[imageId]) === 'undefined'
								// Only update if we will not do a full write on this image. 
								if (typeof(pendingImageUpdates[dbId]) === 'undefined') {
									pendingImageUpdates[dbId] = {};
								}
								let imageUpdates = pendingImageUpdates[dbId];
								imageUpdates[event.property] = event.newValue;				
							}
						}				
					}
				});			
				
				flushToDatabase();
			});
			// log(mockMongoDB.getAllRecordsParsed(), 4);
			
			logUngroup();
		}
	} 

	
	function isMacroEvent(event) {
		return imageEventHasObjectValue(event) && !event.incomingStructureEvent;
	}
	
	
	function imageEventHasObjectValue(event) {
		return imageCausality.isObject(event.newValue) || imageCausality.isObject(event.oldValue);
	}
	
	
	function hasAPlaceholder(dbImage) {
		// console.log(dbImage);
		return typeof(dbImage.const.dbId) !== 'undefined';
	}

	function writePlaceholderForImageToDatabase(dbImage) {
		let dbId = mockMongoDB.saveNewRecord({});
		dbImage.const.dbId = dbId;
		dbImage.const.serializedMongoDbId = imageCausality.idExpression(dbId);
		return dbId;
	}

	function flushToDatabase() {
		log("flushToDatabase:");
		logGroup();
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
		logUngroup();
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
			// console.log(imageCausality.isObject(dbImage));
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
		// console.log();
		// console.log("convertReferencesToDbIds: ");
		// log(entity, 2);
		// console.log(imageCausality.isObject(entity));
		if (imageCausality.isObject(entity)) {
			let dbImage = entity;
			if (!hasAPlaceholder(entity)) {
				writePlaceholderForImageToDatabase(dbImage);
			}
			return dbImage.const.serializedMongoDbId;
		} else if (entity !== null && typeof(entity) === 'object') {
			// console.log("===========");
			// log(entity, 3);
			// console.log("===========");
			
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
	
	function getImagePlaceholderFromDbId(dbId) {
		// console.log("getImagePlaceholderFromDbId: " + dbId);
		if (typeof(dbIdToDbImageMap[dbId]) === 'undefined') {
			dbIdToDbImageMap[dbId] = createImagePlaceholderFromDbId(dbId);
		}
		// console.log("placeholder keys:");
		// printKeys(dbIdToDbImageMap);
		return dbIdToDbImageMap[dbId];
	}
	
	function createImagePlaceholderFromDbId(dbId) {
		console.log("createImagePlaceholderFromDbId: " + dbId);
		let placeholder;
		placeholder = imageCausality.create({});
		placeholder.const.dbId = dbId;
		imageIdToImageMap[placeholder.const.id] = placeholder;
		placeholder.const.initializer = imageFromDbIdInitializer;
		return placeholder;
	}
	
	function imageFromDbIdInitializer(dbImage) {
		// if (dbImage.const.dbId === 1)
			// dbImage.foo.bar;
		// console.log("");
		log("initialize image " + dbImage.const.id + " from dbId: " + dbImage.const.dbId); 
		logGroup();
		objectCausality.withoutEmittingEvents(function() {
			imageCausality.withoutEmittingEvents(function() {
				loadFromDbIdToImage(dbImage);
			});
		});
		// log(dbImage);
		logUngroup();
		// console.log(dbImage);
	}	
	
	function createObjectPlaceholderFromDbImage(dbImage) {
		console.log("createObjectPlaceholderFromDbImage " + dbImage.const.id);
		let placeholder;
		placeholder = objectCausality.create();
		placeholder.const.dbId = dbImage.const.dbId;
		connectObjectWithDbImage(placeholder, dbImage);
		placeholder.const.initializer = objectFromImageInitializer;
		return placeholder;
	}
	
	function objectFromImageInitializer(object) {
		log("initialize object " + object.const.id + " from dbImage " + object.const.dbImage.const.id + ", dbId:" + object.const.dbId);
		logGroup();
		objectCausality.withoutEmittingEvents(function() {
			imageCausality.withoutEmittingEvents(function() {
				loadFromDbImageToObject(object);
			});
		});
		logUngroup();
	}
	
	function createObjectPlaceholderFromDbId(dbId) {
		console.log("createObjectPlaceholderFromDbId: " + dbId);
		let placeholder;
		placeholder.const.dbId = dbId;
		placeholder.const.initializer = objectFromIdInitializer;
		return placeholder;
	}
	
	function objectFromIdInitializer(object) {
		log("initialize object " + object.const.id + " from dbId: " + object.const.dbId);
		logGroup();
		objectCausality.withoutEmittingEvents(function() {
			imageCausality.withoutEmittingEvents(function() {
				loadFromDbIdToObject(object);
			});
		});
		logUngroup();
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
		log("loadFromDbIdToImage dbId: " + dbImage.const.dbId + " dbImage:" + dbImage.const.id);
		imageCausality.disableIncomingRelations(function() {			
			let dbId = dbImage.const.dbId;
			
			// console.log("loadFromDbIdToImage, dbId: " + dbId);
			let dbRecord = mockMongoDB.getRecord(dbId);
			// console.log(dbRecord);
			for (let property in dbRecord) {
				// printKeys(dbImage);
				if (property !== 'const' && property !== 'id') {
					// console.log("loadFromDbIdToImage: " + dbId + " property: " + property);
					// console.log(dbRecord);
					let recordValue = dbRecord[property];
					// console.log(dbRecord);
					let value = loadDbValue(recordValue);
					
					// console.log(dbRecord);
					// console.log("loadFromDbIdToImage: " + dbId + " property: " + property + "...assigning");
					// if (property !== 'A') imageCausality.startTrace();
					// console.log("value loaded to image:");
					// console.log(value);
					property = imageCausality.transformPossibleIdExpression(property, dbIdToImageId);
					dbImage[property] = value;
					// if (property !== 'A') imageCausality.endTrace();
					// console.log("loadFromDbIdToImage: " + dbId + " property: " + property + "...finished assigning");
					// printKeys(dbImage);
				}				
			}
			// console.log("finished loadFromDbIdToImage: ");
			// console.log(dbImage.const.dbId);
			// printKeys(dbImage);
			dbImage.const.loaded = true;
			// console.log("-- ");
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
		// console.log("loadFromDbIdToObject: " + dbId);

		// Ensure there is an image.
		if (typeof(object.const.dbImage) === 'undefined') {
			// console.log("create placeholder for image:" + dbId);
			let placeholder = getImagePlaceholderFromDbId(dbId);
			connectObjectWithDbImage(object, placeholder);
		}
		loadFromDbImageToObject(object);
	}
	
	function printKeys(object) {
		if (typeof(object) === 'object') console.log(Object.keys(object));
	}
	
	function loadFromDbImageToObject(object) {
		let dbImage = object.const.dbImage;
		// console.log("----------------------------------------");
		log("loadFromDbImageToObject dbId: " + dbImage.const.dbId);
		// logGroup();
		// console.log(dbImage);
		// console.log(object);
		for (let property in dbImage) {
			if (property !== 'incoming') {
				// log("load property: " + property);
				// console.log("-------");
				let value = dbImage[property];
				// log(value);
				// console.log("value loaded to object:");
				// printKeys(value);
				// console.log(value.name)
				// console.log(value);
				// console.log("-------");
				// console.log(value);
				// TODO: Do recursivley if there are plain javascript objects
				if (imageCausality.isObject(value)) {
					// console.log("found an object");
					value = getObjectFromImage(value);
					// log(value);
					// console.log(value);
					// value = "424242"
					// log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
					// let x = value.name; // Must be here? otherwise not initilized correctly?   Because of pulses!!!!
					// log("<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<");
					
					// console.log(value.name);
				}
				// log(">>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>>");
				// log(value);
				object[property] = value;
				// log(object[property]);
				// log("<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<<");
			}
			// log(object);
		}
		// log(object);
		// logUngroup();
	}
	
	function getObjectFromImage(dbImage) {
		// console.log("getObjectFromImage");
		if (typeof(dbImage.const.correspondingObject) === 'undefined') {
			dbImage.const.correspondingObject = createObjectPlaceholderFromDbImage(dbImage);
		}
		// console.log("return value:");
		// console.log(dbImage.const.correspondingObject); // This is needed???
		
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
				return getImagePlaceholderFromDbId(dbId);
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
	
	let maxNumberOfAliveObjects = 10000;
	let unloadedObjects = 0;
	
	
	function unloadAndKillObjects() {
		let leastActiveObject = objectCausality.getActivityListLast();
		while (createdObjects - unloadedObjects > maxNumberOfAliveObjects) {
			while(typeof(leastActiveObject.const.dbId) === 'undefined') {
				objectCausality.removeFromActivityList(leastActiveObject); // Just remove them and make GC possible. Consider pre-filter for activity list.... 
				leastActiveObject = objectCausality.getActivityListLast();
			}
			objectCausality.removeFromActivityList(leastActiveObject);
			unloadObject(leastActiveObject);
		}
	}
	
	function unloadObject(object) {
		// without emitting events.
		for (property in object) {
			delete object[property];
		}
		unloadImage(object.const.dbImage);
		object.const.initializer = objectFromImageInitializer;

		if (object.const.incomingReferences === 0) {
			killObject(object);
		}
	}
	
	function killObject(object) {
		object.const.dbImage.const.correspondingObject = null;
		object.const.initializer = zombieObjectInitializer;
	}
	
	function zombieObjectInitializer(object) {
		object.const.forwardsTo = createObjectPlaceholderFromDbImage(object.const.dbImage); // note: the dbImage might become a zombie as well...
	}
	
	function unloadImage(dbImage) {
		// without emitting events.
		for (property in object) {
			delete object[property];
		}
		dbImage.const.initializer = imageFromDbIdInitializer;
		
		if (dbImage.const.incomingReferences === 0) {
			killDbImage(dbImage);
		}
	}
	
	function killDbImage(dbImage) {
		delete dbIdToDbImageMap[dbImage.const.dbId];
		dbImage.const.initializer = zombieImageInitializer;
	}
	
	function zombieImageInitializer(dbImage) {
		dbImage.const.forwardsTo = createImagePlaceholderFromDbId(dbImage.const.dbId);
	}
	
	/*-----------------------------------------------
	 *           Setup database
	 *-----------------------------------------------*/
	
	function setupDatabase() {
		if (typeof(objectCausality.persistent) === 'undefined') {
			if (mockMongoDB.getRecordsCount() === 0) {
				// objectCausality.pulse(function() {
					objectCausality.persistent = objectCausality.create();
					createIsolatedDbImageFromLoadedObject(objectCausality.persistent);			
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
				createIsolatedDbImageFromLoadedObject(objectCausality.persistent);
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
							log(relations);
							log("here");
							if (typeof(relations[property]) !== 'undefined') {
								let relation = relations[property];
								let contents = relation.contents;
								for (id in contents) {
									let referer = getObjectFromImage(contents[id]);
									callback(referer);
								}
								log(relation);
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
	
	objectCausality = require("./causality.js")({
		name: 'objectCausality', 
		recordPulseEvents : true,

		// TODO: make it possible to run these in conjunction with eternity.... as of now it will totally confuse eternity.... 
		// mirrorRelations : true, // this works only in conjunction with mirrorStructuresAsCausalityObjects, otherwise isObject fails.... 
		// mirrorStructuresAsCausalityObjects : true
	});
	
	let argumentsToArray = function(arguments) {
		return Array.prototype.slice.call(arguments);
	};

	let originalCreate = objectCausality.create;
	let createdObjects = 0;
	// objectCausality.create = function() {  
		// createdObjects++;
		// let argumentsList = argumentsToArray(arguments);
		// originalCreate.apply(null, argumentsList);
		// // Consider kill here instead of at pulse end?
	// }
	
	// Additions 
	objectCausality.addPostPulseAction(postObjectPulseAction);
	objectCausality.mockMongoDB = mockMongoDB;
	objectCausality.unloadAllAndClearMemory = unloadAllAndClearMemory;
	objectCausality.clearDatabaseAndClearMemory = clearDatabaseAndClearMemory;
	objectCausality.forAllPersistentIncomingNow = forAllPersistentIncomingNow;
	objectCausality.imageCausality = imageCausality;
	objectCausality.instance = objectCausality;
	imageCausality.addPostPulseAction(postImagePulseAction);
	
	
	setupDatabase();
    return objectCausality;
}));
