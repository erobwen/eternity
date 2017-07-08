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
				eternity.freezeActivityList(function() {
					log(object);
					log(object.const.initializer);
					result = object.const.initializer === null;
					log(result);					
				});
			});
			return result;
		}

		// persistent
		log("--------------------------------------------------------------");
		let A = create({name: "A"});
		log("--------------------------------------------------------------");
		let B = create({name: "B"});
		log("--------------------------------------------------------------");
		let C = create({name: "C"});
		log("--------------------------------------------------------------");
		
		log("--------------------------------------------------------------");
		persistent.name = "persistent"
		log("--------------------------------------------------------------");
		persistent.A = A;
		log("--------------------------------------------------------------");
		A.persistent = persistent;
		log("---------------------------- A.B = B; ----------------------------------");
		A.B = B;
		log("--------------------------- B.C = C; -----------------------------------");
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	
		B.C = C;
		log("--------------------- d ---------------------------");
		// log(persistent.name);
		
		

		
		// Persistent should be unloaded
		assert.equal(isLoaded(persistent), false);
		assert.equal(isLoaded(A), false);
		assert.equal(isLoaded(B), true);
		assert.equal(isLoaded(C), true);
		
		log("==================== Touch A ==========================");
		// // Touch A
		let dummy = A.name;
		log("---------------------------------------");
		
		// Persistent should be unloaded
		assert.equal(isLoaded(persistent), false);
		assert.equal(isLoaded(A), true);
		assert.equal(isLoaded(B), true);
		assert.equal(isLoaded(C), false);
	});

    // it('should unload nodes as memory reaches limit, circluar infinite path', function () {
	// });

    // it('should handle zombie objects correctly', function () {
	// });	
	
	
});


