	// Main causality object space
	let causality = require("causalityjs_advanced");
	causality.install(global, {recordPulseEvents : true});

	// Object images object space
	const requireUncached = require('require-uncached');
	let causality2 = requireUncached("causalityjs_advanced");
	// console.log(causality === causality2); // prints false!

let mirror = require('./node_modules/causalityjs_advanced/mirror');

let mockMongoDB = require("./mockMongoDB.js");

let objectlog = require('./objectlog.js');
let log = objectlog.log;

/*-----------------------------------------------
 *           Helpers
 *-----------------------------------------------*/

function isObject(something) {
	return typeof(something) === 'object' && typeof(something.handler) !== 'undefined';
}

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
			if (serialized.startsWith("__eternity__id__")) {
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
	 
	/**
	 * Pulse management
	 */
	processPulseEvents : function() {
	 	compressedEvents.forEach(function(event) {
			if (isPersistent(event.object)) {
				let property = event.property;
				let value = event.value;
				let oldValue = event.oldValue;
				if (value !== oldValue) {
					if (isObject(value)) {
						ensurePersistent(value);
					}
					
					if (isObject(oldValue)) { // && isPersistent(oldValue)
						
						// Spanning persistent tree was broken
						if (oldValue.handler.incomingSpanningTreeProperty === event.property
							&& oldValue.handler.incomingSpanningTreeReferer === event.object) {
							
							unstablePersistentObjects.push(oldValue);
						}
						
						// Remove from feather
						this.removeBackReferenceFromFeather(event.object.handler.image, property, oldValue.handler.image);
					} 
				}
			}
		})
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
			return "__eternity__id__" + value.__persistentId;
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
		
	getMapInImage : function(targetImage, baseMap, propertyName) {
		if(typeof(baseMap[propertyName]) === 'undefined') {
			this.setDirty(targetImage, [propertyName]);
			baseMap[propertyName] = {};
		}
		return baseMap[propertyName];
	},

	// getFeatherImage : function(targetImage, targetMap, propertyName) {
		// if(typeof(targetMap[propertyName]) === 'undefined') {
			// this.setDirty(targetImage);
			// targetMap[propertyName] = this.newPersistentFeatherImage(targetImage);
		// }
		// this.ensureLoaded(targetMap[propertyName]);
		// return targetMap[propertyName];
	// },
	
	/**
	 *  Feather management
	 */	
	removeBackReferenceFromFeather : function(sourceImage, propertyName, targetImage) {
		if (sourceImage[propertyName] === targetImage) {
			// Internal back reference
			let incomingIntegrated = this.getMap(targetImage, 'incomingIntegrated');
			let key = sourceImage.id + ":" + propertyName;
			delete incomingIntegrated[key];
			this.setDirty(targetImage, ['incomingIntegrated', key]);			
		} else {
			// Feather back reference
			let featherBarb = sourceImage[propertyName];
			delete featherBarb[sourceImage.__persistentId];
			this.setDirty(featherBarb);
		}
	},
	 
	storeBackReferenceInFeather : function(sourceImage, propertyName, targetImage) {
		let incomingIntegrated = this.getMap(targetImage, 'incomingIntegrated');
		if (Object.keys(incomingIntegrated).count < 100) {
			let key = sourceImage.id + ":" + propertyName;
			incomingIntegrated[key] = sourceImage;
			this.setDirty(targetImage, ['incomingIntegrated', key]);
		} else {
			let incomingFeathers = this.getMapInImage(targetImage, targetImage, 'incomingFeathers');
			let propertyFeatherShaft = this.getMapInImage(targetImage, incomingFeathers, propertyName);
			
			// Get or create last feather strand
			if (typeof(propertyFeatherShaft.first) === 'undefined') {
				this.setDirty(targetImage);
				let newFeatherBarb = this.newPersistentFeatherImage(targetImage);
				propertyFeatherShaft.first = newFeatherBarb;
				propertyFeatherShaft.last = newFeatherBarb;
			}
			let lastFeatherBarb = propertyFeatherShaft.last;
			this.ensureLoaded(lastFeatherBarb);
			
			// If last feather strand is full, create a new one
			if(Object.keys(lastFeatherBarb) >= 512) {
				let newFeatherBarb = this.newPersistentFeatherImage(targetImage);
				
				lastFeatherBarb.next = newFeatherBarb;
				this.setDirty(lastFeatherBarb);
				
				propertyFeatherShaft.last = newFeatherBarb;
				this.setDirty(targetImage);
				
				newFeatherBarb.previous = lastFeatherBarb;
				this.setDirty(newFeatherBarb);
				
				lastFeatherBarb = newFeatherBarb;
			}
			
			// Add back reference and note strand as dirty
			lastFeatherBarb[sourceImage.__persistentId] = sourceImage;
			this.setDirty(lastFeatherBarb);
			
			return lastFeatherBarb;
		}
	},
	
	
	/**
	 *  Persist objects
	 */	
	ensurePersistent : function(object, potentialParent, potentialParentProperty) {
		if (typeof(object.handler.persistentImage) === 'undefined') {
			// Install persistency information
			let persistentImage = this.newPersistentObjectImage(potentialParent, potentialParentProperty);
			object.handler.persistentImage = persistentImage;

			let objectTarget = object.handler.target; 
			for (let property in objectTarget) {
				let value = objectTarget[property];
				if (isObject(value)) {
					let referedPersistentImage = this.ensurePersistent(value, object, property);
					
					persistentImage[property] =  this.storeBackReferenceInFeather(persistentImage, property, referedPersistentImage);
				} else {
					persistentImage[property] = value;
				}
			} 
			return persistentImage;
		} else {
			return object.handler.persistentImage;
		}
	},

	persist : function(object) {
		console.log("persist");
		object.independentlyPersistent = true;
	},

	unPersist : function(object) {
		console.log("unPersist");
		object.independentlyPersistent = false;
	}
};

let activeChainFirst = null;
let activeChainLast = null;



/*
let nextId = 1;
function createobject() {
	let handler = {
		id : nextId++,
		
		// Store incoming	
		storeIncoming : true,
		storeIncomingInTarget : true;
		
		// Persistency stuff
		independentlyPersistent : false,
		hasPersistentImage : false, 
		isUnstable : false,
		justGotUnstable : false,
		
		get : function(target, key) {
			setLastActive(this);

			key = key.toString();
			if (key === 'handler') {
				return this;
			} else if (key === 'persist') {
				return function() {
					persistentSystem.persist(this.proxy);
				}.bind(this);
			} else if (key === 'unPersist') {
				return function() {
					persistentSystem.unPersist(this.proxy);
				}.bind(this);
			}
			
			if (typeof(key) !== 'undefined') {
				return target[key];
			}
		},
		
		set : function(target, key, value) {
			inPulse++;
			key = key.toString();
			
			setLastActive(this);
			let oldValue = target[key];
			
			// Save back reference
			if(this.storeIncomingInTarget && isObject(value) && value.handler.storeIncoming) {
				let incomingSets = getMap(value.handler, "__incoming");
				let incomingSet = getMap(incomingSets, key);
				let key = value.constructor.name + ":" + value.handler.id;
				incomingSet[key] = this.proxy;
			}
			
			target[key] = value;
			pulseEvents.push({object: this.proxy, property : key, oldValue: oldValue, value: value}); 
			
			if (--inPulse === 0) postPulseCleanup();
			return true;		
		}
	}

	let proxy = new Proxy(
		{}, 
		handler
	);
	handler.proxy = proxy;
	
	return proxy;
}
*/

/*
let inPulse = 0;
let pulseEvents = [];
function postPulseCleanup() {
	console.log(pulseEvents);

	// This will not preserve order, but remove several assignments of the same object/property
	let objectPropertyEventMap = {}
	pulseEvents.forEach(function(event) {
		let objectId = event.object.handler.id;
		if (typeof(objectPropertyEventMap[objectId]) === 'undefined') {
			objectPropertyEventMap[objectId] = {};
		}
		let propertyEventMap = objectPropertyEventMap[objectId];
		if (typeof(propertyEventMap[event.property]) === 'undefined') {
			propertyEventMap[event.property] = {object: event.object, property : event.property, oldValue: event.oldValue, value: event.value};
		} else {
			propertyEventMap[event.property].value = event.value; // Keep old value from first assignment, keep last assignment value
		}
	});
	let compressedEvents = [];
	for (objectId in objectPropertyEventMap) {
		let propertyEventMap = objectPropertyEventMap[objectId];
		for (property in propertyEventMap) {
			compressedEvents.push(propertyEventMap[property]);
		}
	}
	
	let addToPersistency = [];
	
	persistentSystem.processPulseEvents(compressedEvents);

	pulseEvents.length = 0;
}
*/


/*-----------------------------------------------
 *           Experiments
 *-----------------------------------------------*/
causality.addPostPulseAction(function(events) {
	console.log(events);
})
let a = create();
let b = create();
let c = create();
let d = create();

transaction(function() {
	a.B = b;
	b.A = a;	
}); 
persistentSystem.persist(a);