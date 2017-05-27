// Main causality object space
// let causality = require("causalityjs_advanced");
let causality = require("./causality.js"); // Temoprary for faster coding
causality.install(global, {recordPulseEvents : true});

// Object images object space
const requireUncached = require('require-uncached');
// let imageCausality = requireUncached("causalityjs_advanced");
let imageCausality = requireUncached("./causality.js");
imageCausality.setConfiguration({ 
	recordPulseEvents : true, 
	
	mirrorRelations: true, 
	exposeMirrorRelationIntermediary : true,
	mirrorStructuresAsCausalityObjects : true
});

// Other used libraries
// let mirror = require('./node_modules/causalityjs_advanced/mirror.js');
let mirror = require('./mirror.js');  // Temoprary for faster coding
let mockMongoDB = require("./mockMongoDB.js");

// Neat logging
let objectlog = require('./objectlog.js');
let log = objectlog.log;
// let log = console.log;



/*-----------------------------------------------
 *           Helpers
 *-----------------------------------------------*/

// Helper to quickly get a child object
// function getMap(object, key) {
    // if (typeof(object[key]) === 'undefined') {
        // object[key] = {};
    // }
    // return object[key];
// }

// Helper to quickly get a child object
function getMap() {
	var argumentList = argumentsToArray(arguments);
	var object = argumentList.shift();
	while (argumentList.length > 0) {
		var key = argumentList.shift();
		if (typeof(object[key]) === 'undefined') {
			object[key] = {};
		}
		object = object[key];
	}
	return object;
}

/*-----------------------------------------------
 *           Persistent system
 *-----------------------------------------------*/

// Emulated database system
let persistentSystem = {
	
	// Images
	images : {},
	dirtyImages : {},
	pendingCreations : [],
	
	/**
	 * Is image
	 */
	isImage : function(something) {
		return typeof(something) === 'object' && typeof(something.__isImage) !== 'undefined' && something.__isImage;
	},
	
	/**
	 * Load image
	 */
	unserializeReferences : function(serialized) {
		if (typeof(serialized) === 'string') {
			if (serialized.startsWith("_eternity_id_")) {
				// A reference to another database record
				let id = Integer.parse(serialized.substr(16));
				if (typeof(this.images[id]) !== 'undefined') {
					return this.images[id];
				} else {
					let placeholder = { 
						__loaded : false, 
						__persistentId : id 
					};
					this.images[id] = placeholder;
					return placeholder;
					// return this.unserializeReferences(mockMongoDB.getRecord(id));
				}
			} else {
				// An ordinary string
				return serialized;
			}
		} else {
			// A javascript object
			for(let property in serialized) {
				serialized[property] = this.unserializeReferences(serialized[property]);
			}
			return serialized;
		}
	}, 
	 
	ensureLoaded : function(image) {
		if (!image.__loaded) {
			let record = mockMongoDB.getRecord(image.__persistentId);
			for (let property in record) {
				image[property] = this.unserializeReferences(record[property]);
			}
		}
	}, 
	 

	setDirty : function(image, path) {
		if (typeof(path) !== 'undefined') {
			// Make more elaborate dirty notification.
		}
		this.dirtyImages[image.__persistentId] = true; 
	},
	
	processPendingCreations : function() {
		this.pendingCreations.forEach(function(pendingCreation) {
			let recordToSave = {  // A fresh DB record
				__isFeather : pendingCreation.isFeather,
			}
			if (pendingCreation.__isFeather) {
				recordToSave.__homeImageId = pendingCreation.__homeImage.__persistentId;
			}
			pendingCreation.__persistentId = mockMongoDB.saveNewRecord();	
		});
	},		
	
	writeChangesToDatabase : function() {
		this.processPendingCreations();
		for(let id in this.dirtyImages) {
			this.writeImageToDatabase(this.dirtyImages[id])
		}
	},
	
	serializeReferences : function(value) {
		if(this.isImage(value)) {
			return "_eternity_id_" + value.__persistentId;
		} else if (typeof(value) === 'object') {
			let newValue = {};
			for(let property in value) {
				newValue[property] = this.serializeReferences(value[property]);
			}
		} else {
			return value;
		}
	},
	
	serializeImageReferences : function(image) {
		let serialized = {};
		for (let property in image) {
			serialized[property] = this.serializeImageReferences(image[property]);
		}
		return serialized;
	},
	
	writeImageToDatabase : function(image) {
		mockMongoDB.updateRecord(pendingCreation.__persistentId, this.serializeImageReferences(image))
	},
	
	/**
	 * Creation helpers
	 */	
	newPersistentFeatherImage : function(homeImage) {
		let pendingCreation = {
			__isImage : true,
			__isFeather : true,
			__homeImage : homeImage
		};
		this.pendingCreations.push(pendingCreation);
		return pendingCreation;
	},

	newPersistentObjectImage : function(parentObject, relation) {
		let pendingCreation = {
			__isImage : true,
			__isFeather : false,
			__object : object,
			__incomingSpanningTreeProperty : relation,
			__incomingSpanningTreeReferer : parentObject.handler.persistentImage
		};
		this.pendingCreations.push(pendingCreation);
		return pendingCreation;
	},
		



	persist : function(object) {
		// console.log("persist");
		object._independentlyPersistent = true;
	},

	unPersist : function(object) {
		// console.log("unPersist");
		object._independentlyPersistent = false;
	}
};


/*-----------------------------------------------
 *           Experiments
 *-----------------------------------------------*/
			
			
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
 
let unstableImages = [];


 
causality.addPostPulseAction(function(events) {
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
						let dbImage = imageCausality.create();
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

		// Process unstable ones. Initiate garbage collection
	});
	console.log("=== End model pulse === ");
		
	// console.log(events);
});

let pendingImageCreations = {};
let pendingImageUpdates = {}

function hasBeenWrittenToDB(dbImage) {
	// console.log(dbImage);
	return typeof(dbImage.const.mongoDbId) !== 'undefined';
}

function writePlaceholderForImageToDatabase(dbImage) {
	let mongoDbId = mockMongoDB.saveNewRecord({});
	dbImage.const.mongoDbId = mongoDbId;
	dbImage.const.serializedMongoDbId = "_causality_persistent_id_" + mongoDbId;
	return mongoDbId;
}

function convertReferencesToDbIds(entity) {
	if (imageCausality.isObject(entity)) {
		let dbImage = entity;
		if (!hasBeenWrittenToDB(entity)) {
			writePlaceholderForImageToDatabase(dbImage);
		}
		return dbImage.const.serializedMongoDbId;
	} else if (typeof(entity) === 'object') {
		let converted = (entity instanceof Array) ? [] : {};
		for (property in entity) {
			converted[property] = convertReferencesToDbIds(entity[property]);
		}
		return converted;
	} else {
		return entity;
	}
}

function writeImageToDatabase(dbImage) {
	let serialized = (dbImage instanceof Array) ? [] : {};
	for (property in dbImage) {
		serialized[property] = convertReferencesToDbIds(dbImage[property]);
	}
	if (!hasBeenWrittenToDB(dbImage)) {
		mockMongoDB.saveNewRecord(serialized);
	} else {
		mockMongoDB.updateRecord(serialized);
	}
}

function flushToDatabase() {
	// This one could do a stepwise execution to not block the server. 
	for (id in pendingImageCreations) {
		writeImageToDatabase(pendingImageCreations[id]);
	} 
}

imageCausality.addPostPulseAction(function(events) {
	console.log("=== Image pulse complete, sort events according to object id and flush to database === ");
	log(events, 2);
	// Extract updates and creations to be done.
	events.forEach(function(event) {
		let dbImage = event.object;
		log("Considering " + event.type + " event with object:");
		log(dbImage, 2);
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
});

// imageCausality.pulse(function(){
	causality.pulse(function() {
		let a = create({name : "a"});
		let b = create({name : "b"});
		let c = create({name : "c"});
		let d = create({name : "d"});

		transaction(function() {
			a.B = b;
			b.A = a;
		}); 
		
		persistentSystem.persist(a);

		// log(a.const.dbImage, 2);	
	});
// });








	// getMapInImage : function(targetImage, baseMap, propertyName) {
		// if(typeof(baseMap[propertyName]) === 'undefined') {
			// this.setDirty(targetImage, [propertyName]);
			// baseMap[propertyName] = {};
		// }
		// return baseMap[propertyName];
	// },
