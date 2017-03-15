

/*-----------------------------------------------
 *           Helpers
 *-----------------------------------------------*/

function isObject(something) {
	return typeof(something) === 'object' && typeof()
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
	persistentobjects : {},
		
	ensurePersistent : function(object, potentialParent, potentialParentProperty) {
		if (typeof(object.handler.persistencyInformation) === 'undefined') {
			let databaseRecord = {}
			database.saveNewRecord(databaseRecord);
			
			let persistencyInformation = {
				object : object
				persistentId : persistentId;
				incomingSpanningTreeProperty : potentialProperty;
				incomingSpanningTreeReferer : potentialParent.handler.persistencyInformation;
			};

			let objectTarget = object.handler.target; 
			for (let property in objectTarget) {
				let value = objectTarget[property];
				if (isObject(value)) {
					let referedRecord = this.ensurePersistent(value, object, property);
					
					// Store incoming reference in database (not necessary in database such as Neo4J etc. 
					databaseRecord[property] = referedRecord;
					if (typeof(referedRecord.incoming) === 'undefined') {
						referedRecord.incoming = {};
					}
					let incoming = referedRecord.incoming;
					if (typeof(incoming[property]) === 'undefined') {
						incoming[property] = { count : 0 };
					}
					let incomingProperty = incoming[property];
					if (incomingProperty.count > 100) {
						
					}
					databaseRecord[persistentId] = true;
				} else {
					databaseRecord[property] = value;
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