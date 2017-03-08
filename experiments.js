


function isObject(something) {
	return typeof(something) === 'object' && typeof()
}



// Emulated database system
let persistentSystem = {
	nextPersistentId : 1,
	persistentobjects : {},
		
	function ensurePersistent(object, potentialParent, potentialParentProperty) {
		if (typeof(object.handler.persistentId) === 'undefined') {
			let persistentId = nextPersistentId++;
			
			object.handler.persistentId = persistentId;
			object.handler.incomingSpanningTreeProperty = potentialProperty;
			object.handler.incomingSpanningTreeReferer = potentialParent;
			// TODO: store in database also? probably

			let databaseRecord = { id : persistentId };
			
			let objectTarget = object.handler.target; 
			for (let property in objectTarget) {
				let value = objectTarget[property];
				if (isObject(value)) {
					let referedRecord = ensurePersistent(value, object, property);
					
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
					[persistentId] = true;
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

function transaction(callback) {
	inPulse++;
	callback();
	if (--inPulse === 0) postPulseCleanup();
}


let a = createobject();
let b = createobject();
let c = createobject();
let d = createobject();

transaction(function() {
	a.B = b;
	b.A = a;	
}); 
a.persist();