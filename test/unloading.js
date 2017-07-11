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
		let eternity = require('../eternity')({name: "unloading", causalityConfiguration: {name: "unloading"}, maxNumberOfLoadedObjects : 2});  // Includes persistent root.
		let create = eternity.create;
		let persistent = eternity.persistent;
		
		function isLoaded(object) {
			let result;
			eternity.blockInitialize(function() {
				eternity.freezeActivityList(function() {
					// log(object.const.initializer);
					result = object.const.initializer === null;
					// log(object.name + " isLoaded: " + result);
				});
			});
			return result;
		}

		// persistent
		// log("--------------------------------------------------------------");
		let A = create({name: "A"});
		// log("--------------------------------------------------------------");
		let B = create({name: "B"});
		// log("--------------------------------------------------------------");
		let C = create({name: "C"});
		// log("--------------------------------------------------------------");
		persistent.name = "persistent"
		// log("--------------------------------------------------------------");
		persistent.A = A;
		// log("--------------------------------------------------------------");
		// eternity.logActivityList();
		A.persistent = persistent;
		// eternity.logActivityList();
		// log("---------------------------- A.B = B; ----------------------------------");
		// eternity.logActivityList();
		A.B = B;
		// eternity.logActivityList();
		log("--------------------------- B.C = C; -----------------------------------");
		// eternity.logActivityList();
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	
		B.C = C;
		// eternity.logActivityList();
		log("--------------------------------------------------");
		// log(persistent.name);
		
		

		
		// Persistent should be unloaded
		assert.equal(isLoaded(persistent), false);
		assert.equal(isLoaded(A), false);
		assert.equal(isLoaded(B), true);
		assert.equal(isLoaded(C), true);
		
		log("==================== Touch A ==========================");
		// // Touch A
		// let dummy = A.name;
		log(A.name);
		log(A.name);
		log("---------------------------------------");
		
		// Persistent should be unloaded
		assert.equal(isLoaded(persistent), false);
		assert.equal(isLoaded(A), true);
		assert.equal(isLoaded(B), false);
		assert.equal(isLoaded(C), true);
	});

    // it('should unload nodes as memory reaches limit, circluar infinite path', function () {
	// });

    // it('should handle zombie objects correctly', function () {
	// });	
	
	
});


