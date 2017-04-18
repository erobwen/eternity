

let nextId = 1;
function create() {
	let handler = {
		id : nextId++,
		
		get: function(target, key) {
			// console.log('');
			// console.log("Inside get");
			// console.log(typeof key);
			// console.log(key);
			key = key.toString();
			if (key === 'handler') {
				return this;
			} else if (key === 'toString') {
				return function() {
					return "_causality_id_" + this.id;
				}.bind(this);
			} else if (typeof(key) !== 'undefined') {
				return target[key];
			}
		},
		
		set : function(target, key, value) {
			// console.log('');
			// console.log("Inside set");
			// console.log(typeof key);
			// console.log(key);
			key = key.toString();
			target[key] = value;
		}			
	}
	
	let proxy = new Proxy({}, handler);
	handler.proxy = proxy;
	return proxy;
};


	// In a proxy
	// let x = create();
	// let y = create();
	// let z = create();
	// x[y] = 40;
	// x[z] = 2;
	// console.log(x[y]);
	// console.log(x[z]);

	
	
	// Without a proxy
	let x = {};
	let y = create();
	let z = create();
	x[y] = 40;
	x[z] = 2;
	console.log(x[y]);
	console.log(x[z]);
