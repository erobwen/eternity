

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
 *       Emulated mongo-DB:ish database
 *-----------------------------------------------*/

 let database = {
	dataRecords : [];
	
	saveNewRecord : function(dataRecord) {
		this.dataRecords.push(JSON.stringify(dataRecord));
		return this.dataRecords.length - 1;
	},

	updateRecord : function(id, contents) {
		this.dataRecords[id] = JSON.stringify(contents);
		return id;
	}
	
	updateRecordPath : function(id, path, value) {
		let record = this.getRecord(id);
		let property = path[path.length - 1];
		let index = 0;
		let target = record;
		while(index < path.length - 1) {
			target = target[path[index]];
			index++;
		}
		target[property] = value;
		this.dataRecords[id] = JSON.stringify(record);
	}
	
	getRecord : function(id) {
		return JSON.parse(dataRecords[id]);
	}
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
					// return this.unserializeReferences(database.getRecord(id));
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
			let record = database.getRecord(image.__persistentId);
			for (let property in record) {
				image[property] = this.unserializeReferences(record[property]);
			}
		}
	}, 
	 
	/**
	 * Pulse management
	 */
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
-			}
			if (pendingCreation.__isFeather) {
				recordToSave.__homeImageId = pendingCreation.__homeImage.__persistentId;
			}
			pendingCreation.__persistentId = database.saveNewRecord();	
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
		database.updateRecord(pendingCreation.__persistentId, this.serializeImageReferences(image))
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

	newPersistentObjectImage : function() {
		let pendingCreation = {
			__isImage : true,
			__isFeather : false,
			__object : object,
			__incomingSpanningTreeProperty : potentialProperty,
			__incomingSpanningTreeReferer : potentialParent.handler.persistentImage
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
	storeBackReferenceInFeather : function(sourceImage, propertyName, targetImage) {
		let incomingIntegrated = this.getMap(targetImage, 'incomingIntegrated');
		if (Object.keys(incomingIntegrated).count < 100) {
			let key = sourceImage.id + ":" + propertyName;
			incomingIntegrated[key] = sourceImage;
			this.setDirty(targetImage, ['incomingIntegrated', key]);
		} else {
			let incomingFeathers = this.getMapInImage(targetImage, targetImage, 'incomingFeathers');
			let propertyFeatherRoot = this.getMapInImage(targetImage, incomingFeathers, propertyName);
			
			// Get or create last feather strand
			if (typeof(propertyFeatherRoot.first) === 'undefined') {
				this.setDirty(targetImage);
				let newFeatherStrand = this.newPersistentFeatherImage(targetImage);
				propertyFeatherRoot.first = newFeatherStrand;
				propertyFeatherRoot.last = newFeatherStrand;
			}
			let lastFeatherStrand = propertyFeatherRoot.last;
			this.ensureLoaded(lastFeatherStrand);
			if(Object.keys(lastFeatherStrand) >= 512) {
				let newFeatherStrand = this.newPersistentFeatherImage(targetImage);
				
				lastFeatherStrand.next = newFeatherStrand;
				this.setDirty(lastFeatherStrand);
				
				propertyFeatherRoot.last = newFeatherStrand;
				this.setDirty(targetImage);
				
				newFeatherStrand.previous = lastFeatherStrand;
				this.setDirty(newFeatherStrand);
				
				lastFeatherStrand = newFeatherStrand;
			}
			
			lastFeatherStrand[sourceImage.__persistentId] = sourceImage;
			this.setDirty(lastFeatherStrand);
			
			return lastFeatherStrand;
		}
	},
	
	
	/**
	 *  Persist objects
	 */	
	ensurePersistent : function(object, potentialParent, potentialParentProperty) {
		if (typeof(object.handler.persistentImage) === 'undefined') {
			// Install persistency information
			let persistentImage = this.newPersistentImage();
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
			persistentobjects[persistentId] = databaseRecord;
			
			let referToPersistent = isPersistent(value);
				if (!referToPersistent) {
					persistentSystem.addToPersistency(value);	
				}
				persistentSystem.setProperty();
			}
			return databaseRecord;
		} else {
			return persistentobjects[object.handler.persistentId];
		}
	} 

	persist : function(object) {
		console.log("persist");
		object.handler.independentlyPersistent = true;
	},

	unPersist : function(object) {
		console.log("unPersist");
		object.handler.independentlyPersistent = false;
	}
	

};


/*-----------------------------------------------
 *           Last active object chain
 *-----------------------------------------------*/

function setLastActive(objectHandler) {
	if (typeof(objectHandler.next) !== null) {
		objectHandler.next.previous = objectHandler.previous;
	}
	if (typeof(objectHandler.previous) !== null) {
		objectHandler.previous.next = objectHandler.next;
	}
	objectHandler.next = activeChainFirst;
	activeChainFirst = objectHandler;	
};

let activeChainFirst = null;
let activeChainLast = null;


/*-----------------------------------------------
 *           Object creation
 *-----------------------------------------------*/


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



/*-----------------------------------------------
 *           Transactions
 *-----------------------------------------------*/


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
	
	compressedEvents.forEach(function(event) {
		if (isPersistent(event.object)) {
			let property = event.property;
			let value = event.value;
			let oldValue = event.oldValue;
			if (value !== oldValue) {
				if (isObject(value)) {
					ensurePersistent(value);
				}
				
				if (isObject(oldValue)) {
					if (isPersistent(oldValue) 
						&& oldValue.handler.incomingSpanningTreeProperty === event.property
						&& oldValue.handler.incomingSpanningTreeReferer === event.object) {
						
						unstablePersistentObjects.push(oldValue);
					}
				} 
			}
		}
	});
				// pulseEvents.push({type : 'delete', object: this.proxy, link: oldValue}); 
			// } else {
				// pulseEvents.push({type : 'add', object: this.proxy, link: value}); 					
	
	
	 pulseEvents.length = 0;
}



function transaction(callback) {
	inPulse++;
	callback();
	if (--inPulse === 0) postPulseCleanup();
}



/*-----------------------------------------------
 *           Experiments
 *-----------------------------------------------*/

let a = createobject();
let b = createobject();
let c = createobject();
let d = createobject();

transaction(function() {
	a.B = b;
	b.A = a;	
}); 
a.persist();