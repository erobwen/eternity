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
		console.log("=== Model pulse complete, update image and flood create images & flood unstable === ");
		
		log(events, 2);
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
						if (isObject(oldValue)) {
							if (typeof(oldValue.const.dbImage) !== 'undefined') {
								let oldValueDbImage = oldValue.const.dbImage;
								if (oldValueDbImage._eternity_parent === objectDbImage 
									&& oldValueDbImage._eternity_parent_property === event.property) {
									
									floodUnstable(oldValueDbImage, null, null);
								}
							}
						}
							
						// Flood create new images
						let newValue = event.newValue;
						objectDbImage[event.property] = createDbImageRecursivley(newValue, objectDbImage, event.property);
					}
				}
			});

			console.log("=== End model pulse post process === ");
			// Process unstable ones. Initiate garbage collection
		// console.log(events);
		});
	} 
	
	
	function createObjectDbImage(object, potentialParentImage, potentialParentProperty) {
		let imageContents = {
			_mirror_is_reflected : true,
			_mirror_reflects : true,
			_eternity_parent : potentialParentImage,
			_eternity_parent_property : potentialParentProperty
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
		if (isObject(entity)) {
			let object = entity;
			
			if (typeof(object.const.dbImage) === 'undefined') {
				let dbImage = createObjectDbImage(object, potentialParentImage, potentialParentProperty);
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
		if (parent === null || (parent === unstableImage._eternity_parent && parentRelation === unstableImage._eternity_parent_property)) {
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
		console.log("=== Image pulse complete, sort events according to object id and flush to database === ");
		// log(events, 3);
		// Extract updates and creations to be done.
		events.forEach(function(event) {
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
		
		console.log("=== Flush to database ====");
		flushToDatabase();
		log(mockMongoDB.getAllRecordsParsed(), 4);

		console.log("=== End image pulse ===");
	}

	function hasAPlaceholder(dbImage) {
		// console.log(dbImage);
		return typeof(dbImage.const.mongoDbId) !== 'undefined';
	}

	function writePlaceholderForImageToDatabase(dbImage) {
		let mongoDbId = mockMongoDB.saveNewRecord({});
		dbImage.const.mongoDbId = mongoDbId;
		dbImage.const.serializedMongoDbId = "_causality_persistent_id_" + mongoDbId;
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
		log(dbImage, 2);
		console.log(imageCausality.isObject(dbImage));
		let serialized = (dbImage instanceof Array) ? [] : {};
		for (property in dbImage) {
			if (property !== 'const')
				serialized[property] = convertReferencesToDbIds(dbImage[property]);
		}
		if (!hasAPlaceholder(dbImage)) {
			let mongoDbId = mockMongoDB.saveNewRecord(serialized);
			dbImage.const.mongoDbId = mongoDbId;
			dbImage.const.serializedMongoDbId = "_causality_persistent_id_" + mongoDbId;
		} else {
			mockMongoDB.updateRecord(dbImage.const.mongoDbId, serialized);
		}
	}
	
	function convertReferencesToDbIds(entity) {
		console.log();
		console.log("convertReferencesToDbIds: ");
		log(entity, 2);
		console.log(imageCausality.isObject(entity));
		if (imageCausality.isObject(entity)) {
			let dbImage = entity;
			if (!hasAPlaceholder(entity)) {
				writePlaceholderForImageToDatabase(dbImage);
			}
			return dbImage.const.serializedMongoDbId;
		} else if (entity !== null && typeof(entity) === 'object') {
			console.log("===========");
			log(entity, 3);
			console.log("===========");
			
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
	
	// Primary causality object space
	let primaryCausality = requireUncached("./causality.js");
	primaryCausality.setConfiguration({recordPulseEvents : true});
	primaryCausality.addPostPulseAction(postPulseAction);

	imageCausality.addPostPulseAction(postImagePulseAction);
    return primaryCausality;
}));
