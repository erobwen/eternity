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
	const requireUncached = require('require-uncached');
	const dbIdPrefix = "_causality_persistent_id_";
	const dbIdExpressionPrefix = "_causality_persistent_id_expression";

	// const dbIdPrefix = "¤";
	// const dbIdExpressionPrefix = "¤¤";
	
	// Primary causality object space
	let objectCausality
		
	// Image causality
	// let imageCausality = requireUncached("causalityjs_advanced");
	let imageCausality = requireUncached("./causality.js");
	imageCausality.setConfiguration({ 
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
	
	
	function createDbImageFromObject(object, potentialParentImage, potentialParentProperty) {
		// log(object, 3);
		// console.log(object);
		let imageContents = {
			_eternityParent : potentialParentImage,
			_eternityParentProperty : potentialParentProperty
		};
		for (property in object) {
			let value = object[property];
			if (!isObject(value)) {
				imageContents[property] = value;
			}
		}
		let dbImage = imageCausality.create(imageContents);
		object.const.dbImage = dbImage;
		dbImage.const.object = object;
		// console.log("dbImage.const.id: ");
		// console.log(dbImage.const.id);
		return dbImage;
	}
	
			
	function createDbImageRecursivley(entity, potentialParentImage, potentialParentProperty) {
		console.log("createDbImageRecursivley");
		console.log("createDbImageRecursivley");
		if (objectCausality.isObject(entity)) {
			let object = entity;
			console.log("foo");
			console.log(object);
			console.log(object.const);
			console.log("foo");
			
			if (typeof(object.const.dbImage) === 'undefined') {
				let dbImage = createDbImageFromObject(object, potentialParentImage, potentialParentProperty);
				for (property in object) { 
					let value = object[property];
					if (isObject(value)) {
						dbImage[property] = createDbImageRecursivley(value, dbImage, property);
					}
				}
				object.const.dbImage = dbImage;
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
			for (property in potentiallyUnstableImage) {
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
		events.forEach(function(event) {
			// if (event.mirrorStructureEvent) {}
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
		});
		
		// console.log("=== Flush to database ====");
		flushToDatabase();
			
		// log(mockMongoDB.getAllRecordsParsed(), 4);

		// console.log("=== End image pulse ===");
	}

	function hasAPlaceholder(dbImage) {
		// console.log(dbImage);
		return typeof(dbImage.const.mongoDbId) !== 'undefined';
	}

	function writePlaceholderForImageToDatabase(dbImage) {
		let mongoDbId = mockMongoDB.saveNewRecord({});
		dbImage.const.mongoDbId = mongoDbId;
		dbImage.const.serializedMongoDbId = dbIdPrefix + mongoDbId;
		return mongoDbId;
	}

	function flushToDatabase() {
		// log(pendingImageCreations, 2);
		// log(pendingImageUpdates, 2);
		// This one could do a stepwise execution to not block the server. 
		for (id in pendingImageCreations) {
			writeImageToDatabase(pendingImageCreations[id]);
		} 
	}

	function writeImageToDatabase(dbImage) {
		// log(dbImage, 2);
		// console.log(imageCausality.isObject(dbImage));
		let serialized = (dbImage instanceof Array) ? [] : {};
		for (property in dbImage) {
			if (property !== 'const')
				serialized[property] = convertReferencesToDbIds(dbImage[property]);
		}
		if (!hasAPlaceholder(dbImage)) {
			let mongoDbId = mockMongoDB.saveNewRecord(serialized);
			dbImage.const.mongoDbId = mongoDbId;
			dbImage.const.serializedMongoDbId = dbIdPrefix + mongoDbId;
		} else {
			mockMongoDB.updateRecord(dbImage.const.mongoDbId, serialized);
		}
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
			for (property in entity) {
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
	
	function loadFromDbIdToObject(dbId, object) {
		imageCausality.withoutEmittingEvents(function() {
			let dbImage = createDbImageFromObject(object, null, null);
			let dbRecord = mockMongoDB.getRecord(dbId);
			
			for (property in dbRecord) {
				if (property !== 'const') {
					let value = loadDbValue(dbRecord[property]);
					dbImage[property] = value;
					object[property] = imageToObject(value);
				}
			}
			
			if (typeof(dbRecord.const) !== 'undefined') {
				for (property in dbRecord.const) {
					if (typeof(dbImage.const[property]) === 'undefined') {
						let value = loadDbValue(dbRecord.const[property]);
						dbImage.const[property] = value;
						if (typeof(object.const[property]) === 'undefined') {
							object.const[property] = imageToObject(value);													
						}
					}
				}
			}
		});
	}
	
	function imageToObject(potentialDbImage) {
		if (imageCausality.isObject(potentialDbImage)) {
			return potentialDbImage.const.dbImage;
		} else if (typeof(potentialDbImage) === 'object'){ // TODO: handle the array case
			let javascriptObject = {};
			for (property in dbValue) {
				javascriptObject[property] = imageToObject(dbValue[property]);
			}
			return javascriptObject;
		} else {
			return potentialDbImage;
		}
	}
	
	function loadDbValue(dbValue) {
		if (typeof(dbValue) === 'string') {
			if (dbValue.startsWith(dbIdPrefix)) {
				let dbId = Integer.parse(dbValue.slice(dbIdPrefix.length));
				return createLoadingPlaceholder(dbId);
			}
		} else if (typeof(dbValue) === 'object') { // TODO: handle the array case
			let javascriptObject = {};
			for (property in dbValue) {
				javascriptObject[property] = loadDbValue(dbValue[property]);
			}
			return javascriptObject;
		} else {
			return dbValue;
		}
	}
	
	
	function createImageLoadingPlaceholder(dbId) {
		imageCausality.create(function(object) {
			loadFromDbIdToImage(0, object);
		});
	}
	
	function createObjectPlaceholderFromDbId(dbId) {
		objectCausality.create(function(object) {
			loadFromDbIdToObject(0, object);
		});
	}
	
	/*-----------------------------------------------
	 *           Setup database
	 *-----------------------------------------------*/
	
	function setupDatabase() {
		if (mockMongoDB.getRecordsCount() === 0) {
			objectCausality.pulse(function() {
				objectCausality.persistent = objectCausality.create();
				createDbImageFromObject(objectCausality.persistent);			
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
	
	objectCausality = requireUncached("./causality.js");
	
	// Additions 
	objectCausality.setConfiguration({recordPulseEvents : true});
	objectCausality.addPostPulseAction(postPulseAction);
	objectCausality.mockMongoDB = mockMongoDB;
	objectCausality.unloadAllAndClearMemory = unloadAllAndClearMemory;
	objectCausality.clearDatabaseAndClearMemory = clearDatabaseAndClearMemory;

	imageCausality.addPostPulseAction(postImagePulseAction);
	
	
	setupDatabase();
    return objectCausality;
}));
