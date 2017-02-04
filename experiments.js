
let inPulse = 0;
let pulseEvents = [];
function postPulseCleanup() {
	console.log(pulseEvents);
	pulseEvents.length = 0;
}


// Database em 

persistentSystem = {
	addedOutgoingToPersistentNode : function () {
		
	},
	
	persist : function(node) {
		console.log("persist");
		node.handler.independentlyPersistent = true;
	},

	unPersist : function(node) {
		console.log("unPersist");
		node.handler.independentlyPersistent = false;
	}  
};


function createNode() {
	let handler = {
		
		// Persistency stuff
		independentlyPersistent : false,
		hasPersistentImage : false, 
		isUnstable : false,
		justGotUnstable : false,
		
		get : function(target, key) {
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
			
			let oldValue = target[key];
			target[key] = value;
			if (value === null) {
				pulseEvents.push({event : 'delete', node: this.proxy, link: oldValue}); 
			} else {
				pulseEvents.push({event : 'add', node: this.proxy, link: value}); 					
			}
			
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


let a = createNode();
let b = createNode();
let c = createNode();
let d = createNode();

transaction(function() {
	a.B = b;
	b.A = a;	
}); 
a.persist();