const assert = require('assert');
// const log = console.log.bind(console);

// Neat logging
let objectlog = require('../objectlog.js');
let log = objectlog.log;
let logGroup = objectlog.enter;
let logUngroup = objectlog.exit;

// Tests based on mobx test/array.js
describe("basics", function () {


    it('should unload nodes as memory reaches limit, circluar path', function () {
		let eternity = require('../eternity')({maxNumberOfLoadedObjects : 2});  // Includes persistent root.
		let create = eternity.create;
		let persistent = eternity.persistent;
		
		function isLoaded(object) {
			let result;
			eternity.blockInitialize(function() {
				log(object);
				log(object.const.initializer);
				result = object.const.initializer === null;
			});
			return result;
		}

		// persistent
		let A = create({name: "A"});
		let B = create({name: "B"});
		let C = create({name: "C"});
		
		persistent.A = A;
		A.B = B;
		B.C = C;
		C.A = A;
		
		log("==================== SETUP COMPLETE ==========================");
		log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	
		
		// Persistent should be unloaded
		assert.equal(isLoaded(persistent), false);
		assert.equal(isLoaded(A), false);
		assert.equal(isLoaded(B), true);
		assert.equal(isLoaded(C), true);
		
		// // Touch A
		// let dummy = A.name;
		
		// // Persistent should be unloaded
		// assert.equal(isLoaded(persistent), false);
		// assert.equal(isLoaded(A), true);
		// assert.equal(isLoaded(B), true);
		// assert.equal(isLoaded(C), false);
	});

    // it('should unload nodes as memory reaches limit, circluar infinite path', function () {
	// });

    // it('should handle zombie objects correctly', function () {
	// });	
	
	
});


