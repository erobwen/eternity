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
	const dbIdPrefix = "_causality_persistent_id_";
	const dbIdExpressionPrefix = "_causality_persistent_id_expression";

	// const dbIdPrefix = "¤";
	// const dbIdExpressionPrefix = "¤¤";
	
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
	// let log = console.log;


	/*-----------------------------------------------
	 *           Post pulse events
	 *-----------------------------------------------*/
	 
	let unstableImages = [];


	function postPulseAction(events) {
		// console.log("=== Model pulse complete, update image and flood create images & flood unstable === ");
	
		// log(events, 2);
		imageCausality.pulse(function() {
			
			// Mark unstable and flood create new images into existance.
			events.forEach(function(event) {
				// log(event, 2);
				
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
		connectObjectWithDbImage(object, dbImage);
		return dbImage;		
	}
	
	function connectObjectWithDbImage(object, dbImage) {
		imageCausality.blockInitialize(function() {
			console.log("connectObjectWithDbImage: " + dbImage.const.dbId);
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
	
	let pendingImageCreations = {};
	let pendingImageUpdates = {};
	
	function postImagePulseAction(events) {			
		// console.log("=== Image pulse complete, sort events according to object id and flush to database === ");
		// log(events, 3);
		// Extract updates and creations to be done.
		imageCausality.disableIncomingRelations(function () {
			events.forEach(function(event) {
				if (!isMacroEvent(event)) {
					let dbImage = event.object;
					// log("Considering " + event.type + " event with object:");
					// log(dbImage, 2);
					let imageId = dbImage.const.id;
						
					if (event.type === 'creation') {
						pendingImageCreations[imageId] = dbImage;
						if (typeof(pendingImageUpdates[imageId]) !== 'undefined') {
							// We will do a full write of this image, no need to update after.				
							delete pendingImageUpdates[imageId]; 
						}
					} else if (event.type === 'set') {
						if (typeof(pendingImageCreations[imageId]) === 'undefined') {
							// Only update if we will not do a full write on this image. 
							if (typeof(pendingImageUpdates[imageId]) === 'undefined') {
								pendingImageUpdates[imageId] = {};
							}
							let imageUpdates = pendingImageUpdates[imageId];
							imageUpdates[event.property] = event.value;				
						}
					}				
				}
			});			
		});
		
		// console.log("=== Flush to database ====");
		flushToDatabase();
			
		// log(mockMongoDB.getAllRecordsParsed(), 4);

		// console.log("=== End image pulse ===");
	}

	
	function isMacroEvent(event) {
		return imageEventHasObjectValue(event) && !event.incomingStructureEvent;
	}
	
	
	function imageEventHasObjectValue(event) {
		return imageCausality.isObject(event.value) || imageCausality.isObject(event.oldValue);
	}
	
	
	function hasAPlaceholder(dbImage) {
		// console.log(dbImage);
		return typeof(dbImage.const.dbId) !== 'undefined';
	}

	function writePlaceholderForImageToDatabase(dbImage) {
		let dbId = mockMongoDB.saveNewRecord({});
		dbImage.const.dbId = dbId;
		dbImage.const.serializedMongoDbId = dbIdPrefix + dbId;
		return dbId;
	}

	function flushToDatabase() {
		// log(pendingImageCreations, 2);
		// log(pendingImageUpdates, 2);
		// This one could do a stepwise execution to not block the server. 
		for (let id in pendingImageCreations) {
			writeImageToDatabase(pendingImageCreations[id]);
		} 
	}

	function writeImageToDatabase(dbImage) {
		imageCausality.disableIncomingRelations(function() {
			// log(dbImage, 2);
			// console.log(imageCausality.isObject(dbImage));
			let serialized = (dbImage instanceof Array) ? [] : {};
			for (let property in dbImage) {
				if (property !== 'const')
					serialized[property] = convertReferencesToDbIds(dbImage[property]);
			}
			if (!hasAPlaceholder(dbImage)) {
				let dbId = mockMongoDB.saveNewRecord(serialized);
				dbImage.const.dbId = dbId;
				dbImage.const.serializedMongoDbId = dbIdPrefix + dbId;
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
				if (property !== 'const')
					converted[property] = convertReferencesToDbIds(entity[property]);
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
		console.log("getImagePlaceholderFromDbId: " + dbId);
		if (typeof(dbIdToDbImageMap[dbId]) === 'undefined') {
			dbIdToDbImageMap[dbId] = createImagePlaceholderFromDbId(dbId);
		}
		console.log("placeholder keys:");
		printKeys(dbIdToDbImageMap);
		return dbIdToDbImageMap[dbId];
	}
	
	function createImagePlaceholderFromDbId(dbId) {
		console.log("createImagePlaceholderFromDbId: " + dbId);
		let placeholder;
		placeholder = imageCausality.create({});
		placeholder.const.dbId = dbId;
		placeholder.const.initializer = function(dbImage) {
			// if (dbImage.const.dbId === 1)
				// dbImage.foo.bar;
			console.log("");
			console.log("> initialize image < ");
			loadFromDbIdToImage(dbImage);
			console.log("> finished initialize image: < " + dbImage.const.dbId);
			// console.log(dbImage);
		}
		
		return placeholder;
	}
	
	function createObjectPlaceholderFromDbImage(dbImage) {
		console.log("createObjectPlaceholderFromDbImage");
		let placeholder = objectCausality.create();
		placeholder.const.dbId = dbImage.const.dbId;
		connectObjectWithDbImage(placeholder, dbImage);
		placeholder.const.initializer = function(object) {
			console.log("");
			console.log("> initialize object < ");
			loadFromDbImageToObject(object);
			console.log("> finished initialize object < " + object.const.dbImage.const.dbId);
		};
		return placeholder;
	}
	
	function createObjectPlaceholderFromDbId(dbId) {
		let placeholder;
		// if (dbId < 1) {
		console.log("createObjectPlaceholderFromDbId");
		placeholder = objectCausality.create();
		placeholder.const.dbId = dbId;
		placeholder.const.initializer = function(object) {
			console.log("");
			console.log("> initialize object from id < ");
			loadFromDbIdToObject(object);
			console.log("> finished initialize object from id < "  + object.const.dbImage.const.dbId);
		};
		// }
		return placeholder;
	}
	
	function loadFromDbIdToImage(dbImage) {
		imageCausality.disableIncomingRelations(function() {			
			// if (typeof(dbImage.const.loaded) !== 'undefined') {
				// console.log("dubble loading!");
				// dbImage.foo.bar.fum;
			// }
			
			let dbId = dbImage.const.dbId;
			
			console.log("loadFromDbIdToImage, dbId: " + dbId);
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
		console.log("loadFromDbIdToObject: " + dbId);
		imageCausality.pulse(function() {
			imageCausality.withoutEmittingEvents(function() {
				// Ensure there is an image.
				if (typeof(object.const.dbImage) === 'undefined') {
					// console.log("create placeholder for image:" + dbId);
					let placeholder = getImagePlaceholderFromDbId(dbId);
					connectObjectWithDbImage(object, placeholder);
				}
				loadFromDbImageToObject(object);
			});			
		});
	}
	
	function printKeys(object) {
		if (typeof(object) === 'object') console.log(Object.keys(object));
	}
	
	function loadFromDbImageToObject(object) {
		let dbImage = object.const.dbImage;
		console.log("----------------------------------------");
		console.log("loadFromDbImageToObject: " + dbImage.const.dbId + "," + object.const.dbId);
		// console.log(dbImage);
		// console.log(object);
		for (let property in dbImage) {
			console.log("loadFromDbImageToObject: " + dbImage.const.dbId + " property: " + property);
			console.log("-------");
			let value = dbImage[property];
			console.log("value loaded to object:");
			printKeys(value);
			console.log(value.name)
			// console.log(value);
			console.log("-------");
			// console.log(value);
			// TODO: Do recursivley if there are plain javascript objects
			if (imageCausality.isObject(value)) {
				console.log("found an object");
				value = getObjectFromImage(value);
				console.log(value);
				console.log(value.name);
			}
			object[property] = value;
		}
	}
	
	function getObjectFromImage(dbImage) {
		console.log("getObjectFromImage");
		if (typeof(dbImage.const.correspondingObject) === 'undefined') {
			dbImage.const.correspondingObject = createObjectPlaceholderFromDbImage(dbImage);
		}
		console.log("return value:");
		console.log(dbImage.const.correspondingObject);
		
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
			if (dbValue.startsWith(dbIdPrefix)) {
				let dbId = parseInt(dbValue.slice(dbIdPrefix.length));
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
	 *           Setup database
	 *-----------------------------------------------*/
	
	function setupDatabase() {
		if (mockMongoDB.getRecordsCount() === 0) {
			objectCausality.pulse(function() {
				objectCausality.persistent = objectCausality.create();
				createIsolatedDbImageFromLoadedObject(objectCausality.persistent);			
			});
		} else {
			objectCausality.persistent = createObjectPlaceholderFromDbId(0);
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
	 *           Setup object causality
	 *-----------------------------------------------*/
	
	objectCausality = require("./causality.js")({
		name: 'objectCausality', 
		recordPulseEvents : true
	});
	
	// Additions 
	objectCausality.addPostPulseAction(postPulseAction);
	objectCausality.mockMongoDB = mockMongoDB;
	objectCausality.unloadAllAndClearMemory = unloadAllAndClearMemory;
	objectCausality.clearDatabaseAndClearMemory = clearDatabaseAndClearMemory;

	imageCausality.addPostPulseAction(postImagePulseAction);
	
	
	setupDatabase();
    return objectCausality;
}));
