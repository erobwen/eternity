// Main causality object space
// let causality = require("causalityjs_advanced");
let causality = require("./causality.js"); // Temoprary for faster coding
causality.install(global, {recordPulseEvents : true});

// Object images object space
const requireUncached = require('require-uncached');
// let imageCausality = requireUncached("causalityjs_advanced");
let imageCausality = requireUncached("./causality.js");
imageCausality.setConfiguration({ recordPulseEvents : true, mirrorRelations: true, exposeMirrorRelationIntermediary : true });

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
		console.log("persist");
		object._independentlyPersistent = true;
	},

	unPersist : function(object) {
		console.log("unPersist");
		object._independentlyPersistent = false;
	}
};


/*-----------------------------------------------
 *           Experiments
 *-----------------------------------------------*/
			
function createDbImageRecursivley(entity, potentialParentImage, potentialParentProperty) {
	if (isObject(entity)) {
		let object = entity;
		
		if (typeof(object.static.dbImage) === 'undefined') {
			let dbImage = imageCausality.create();
			dbImage._eternity_parent = potentialParentImage;
			dbImage._eternity_parent_property = potentialParentProperty;
			object.static.dbImage = dbImage;
			
			for (property in object) if (property !== '_independentlyPersistent') {
				dbImage[property] = createDbImageRecursivley(object[property], dbImage, property);
			}
		}
		
		return object.static.dbImage;
	} else {
		return entity;
	}
} 
 
let unstableImages = [];
 
causality.addPostPulseAction(function(events) {
	imageCausality.pulse(function() {
		
		// Mark unstable and flood create new images into existance.
		events.forEach(function(event) {
			log(event, 2);
			
			// Catch togging of independently persistent
			if (event.type === 'set') {
				log("set event");
				let object = event.object;

				if (event.property === '_independentlyPersistent') {
					
					// Setting of independently persistent
					if (event.newValue && typeof(object.static.dbImage) === 'undefined') {
						// Object had no image, flood-create new images.
						let dbImage = imageCausality.create();
						object.static.dbImage = createDbImageRecursivley(object, null, null);
					} else if (!event.newValue) {
						// Had an image that becomes unstable
						unstableImages.push(event.object.static.dbImage);
					}
					
				} else if (typeof(object.static.dbImage) !== 'undefined'){
					let objectDbImage = object.static.dbImage;
					
					// Mark old value as unstable if another object with dbImage
					let oldValue = event.oldValue;
					if (isObject(oldValue)) {
						if (typeof(oldValue.static.dbImage) !== 'undefined') {
							let oldValueDbImage = oldValue.static.dbImage;
							if (oldValueDbImage._eternity_parent === objectDbImage 
								&& oldValueDbImage._eternity_parent_property === event.property) {
								
								unstableImages.push(oldValueDbImage);
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
	// console.log(events);
});

imageCausality.addPostPulseAction(function(events) {
	log(events, 3);
});

imageCausality.pulse(function(){
	let a = create();
	let b = create();
	let c = create();
	let d = create();

	transaction(function() {
		a.B = b;
		b.A = a;
	}); 
	persistentSystem.persist(a);

	log(a.static.dbImage, 4);	
});





	// getMapInImage : function(targetImage, baseMap, propertyName) {
		// if(typeof(baseMap[propertyName]) === 'undefined') {
			// this.setDirty(targetImage, [propertyName]);
			// baseMap[propertyName] = {};
		// }
		// return baseMap[propertyName];
	// },
