const assert = require('assert');
// const log = console.log.bind(console);

// Neat logging
let objectlog = require('../objectlog.js');
let log = objectlog.log;
let logGroup = objectlog.enter;
let logUngroup = objectlog.exit;

// Tests based on mobx test/array.js
describe("loading, unloading & zombiefication", function () {


    it('should unload nodes as memory reaches limit', function () {
		let eternity = require('../eternity')({name: "unloading.js", maxNumberOfLoadedObjects : 2});  // Includes persistent root.
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

        function isDead(object) {
            let result;
            eternity.blockInitialize(function() {
                eternity.freezeActivityList(function() {
                    // log(object.const);
                    result = typeof(object.const.isKilled) !== 'undefined';
                    // log(object.name + " isLoaded: " + result);
                });
            });
            return result;
        }
        
        function isZombie(object) {
            let result;
            eternity.blockInitialize(function() {
                eternity.freezeActivityList(function() {
                    // log(object.const.initializer);
                    result = typeof(object.nonForwardConst.isZombie) !== 'undefined';
                    // log(object.name + " isLoaded: " + result);
                });
            });
            return result;
        }
		
		function logZombie(object) {
			let result = "";
            eternity.blockInitialize(function() {
                eternity.freezeActivityList(function() {
					let current = object;
					while(current !== null) {
						result += (typeof(current.nonForwardConst.isZombie) !== 'undefined') ? 'zombie,': '';
						current = current.nonForwardConst.forwardsTo;
					}
                });
            });
			// log(result);
            // return result;
		}

		// Setup a starting point (name in const for easy debugging)
		let A = create({name: "A"});
		A.const.name = "A";

		let B = create({name: "B"});
		B.const.name = "B";

		let C = create({name: "C"});
		C.const.name = "C";

		// Start building a structure
		persistent.name = "persistent";
		persistent.const.name = "persistent"
		persistent.A = A;
		A.persistent = persistent;
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);
		
		// Exceed the memory limit (3 objects loaded is too much)
		// log("---------------------------- A.B = B; ----------------------------------");
		
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	
		A.B = B;
		assert.equal(isLoaded(persistent), false);
        assert.equal(isDead(persistent), false);
		
		assert.equal(isLoaded(A), true);
		
		assert.equal(isLoaded(B), true);
		
		// Exceed the memory limit again, persistent and A no longer has any incoming references and will be killed
		// log("--------------------------- B.C = C; -----------------------------------");
		// eternity.trace.basic++;
		B.C = C;
		// eternity.trace.basic--;
		// log("-----");
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);
		
		assert.equal(isLoaded(persistent), false);
        assert.equal(isDead(persistent), true);
		
		assert.equal(isLoaded(A), false);
        assert.equal(isDead(A), true);
		
		assert.equal(isLoaded(B), true);
		
		assert.equal(isLoaded(C), true);
		
		// log("--------------------------- Touch A -----------------------------------");
		let dummy = A.name;
		
		assert.equal(isLoaded(persistent), false);
        assert.equal(isDead(persistent), true);
		
		// A becomes a zombie
		assert.equal(isLoaded(A), true);
		assert.equal(isDead(A), false);
		assert.equal(isZombie(A), true);

		assert.equal(isLoaded(B), false);
		
		assert.equal(isLoaded(C), true);
		
		
		// log("--------------------------- Touch persistent -----------------------------------");
		let persistentA = persistent.A;
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);
		
		// Persistent becomes a zombie
		assert.equal(isLoaded(persistent), true);
        assert.equal(isDead(persistent), false);
		assert.equal(isZombie(persistent), true);
		
		// A is still a zombie
		assert.equal(isLoaded(A), true);
		assert.equal(isDead(A), false);
		assert.equal(isZombie(A), true);

		assert.equal(isLoaded(B), false);
		
		assert.equal(isLoaded(C), false);
		
		// Examine zombie properties 
		assert.equal(A === persistent.A, false);  // Equality without const does not work anymore, becuase one of them is a zombie. 
		assert.equal(A.const === persistent.A.const, true);
		
		// Persistent is also a zombie, but A.persistent refers to its non-zombie version. 
		logZombie(A);
		logZombie(persistent);
		assert.equal(A.persistent === persistent, false);  // Equality without const does not work anymore, becuase one of them is a zombie. 
		// log(A.persistent);
		// log(A.persistent.const);
		// log(persistent.const);
		assert.equal(A.persistent.const === persistent.const, true);
		
		// log("--------------------------- Touch B -----------------------------------");
		let bName = B.name;
		
		// Persistent becomes a zombie
		assert.equal(isLoaded(persistent), true);
		assert.equal(isDead(persistent), false);
		assert.equal(isZombie(persistent), true);
		
		// A is still a zombie
		assert.equal(isLoaded(A), false);
		assert.equal(isDead(A), false);
		assert.equal(isZombie(A), true);

		assert.equal(isLoaded(B), true);
		assert.equal(isDead(B), false);
		assert.equal(isZombie(B), true);
		
		assert.equal(isLoaded(C), false);
	});
});


