const assert = require('assert');
// const log = console.log.bind(console);

// Neat logging
let objectlog = require('../objectlog.js');
let log = objectlog.log;
let logGroup = objectlog.enter;
let logUngroup = objectlog.exit;

// Tests based on mobx test/array.js
describe("loading, unloading & unforgottenfication", function () {


    it('should unload nodes as memory reaches limit', function () {
		let eternity = require('../eternity')({
			name: "unloading.js", 
			maxNumberOfLoadedObjects : 2
		});
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
                    result = typeof(object.const.isForgotten) !== 'undefined';
                    // log(object.name + " isLoaded: " + result);
                });
            });
            return result;
        }
        
        function isUnforgotten(object) {
            let result;
            eternity.blockInitialize(function() {
                eternity.freezeActivityList(function() {
                    // log(object.const.initializer);
                    result = typeof(object.nonForwardConst.isUnforgotten) !== 'undefined';
                    // log(object.name + " isLoaded: " + result);
                });
            });
            return result;
        }
		
		function unforgottenLevel(object) {
            let result = 0;
            eternity.blockInitialize(function() {
                eternity.freezeActivityList(function() {
                    // log(object.const.initializer);
					let current = object;
					while (typeof(current.nonForwardConst.isUnforgotten) !== 'undefined') {
						result++;
						current = current.nonForwardConst.forwardsTo;
					}
                    // log(object.name + " isLoaded: " + result);
                });
            });
            return result;			
		}
		
		function logUnforgotten(object) {
			let result = "";
            eternity.blockInitialize(function() {
                eternity.freezeActivityList(function() {
					let current = object;
					while(current !== null) {
						result += (typeof(current.nonForwardConst.isUnforgotten) !== 'undefined') ? 'unforgotten,': '';
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
		// log("---------------------------- persistent.A = A; ----------------------------------");
		persistent.A = A;
		// log("---------------------------- A.persistent = persistent; ----------------------------------");		
		A.persistent = persistent;
		
		// Exceed the memory limit (3 objects loaded is too much)
		// log("---------------------------- A.B = B; ----------------------------------");
		
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	
		A.B = B;
		eternity.flushToDatabase();
		assert.equal(isLoaded(persistent), false);
        assert.equal(isDead(persistent), false);
		
		assert.equal(isLoaded(A), true);
		
		assert.equal(isLoaded(B), true);
		
		// Exceed the memory limit again, persistent and A no longer has any incoming references and will be forgeted
		// log("--------------------------- B.C = C; -----------------------------------");
		// eternity.trace.basic++;
		B.C = C;
		eternity.flushToDatabase();

		// eternity.trace.basic--;
		// log("-----");
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);
		
		assert.equal(isLoaded(persistent), false);
        assert.equal(isDead(persistent), true);
		
		assert.equal(isLoaded(A), false);
        assert.equal(isDead(A), true);
		
		assert.equal(isLoaded(B), true);
		
		assert.equal(isLoaded(C), true);
		
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);
		// log("--------------------------- Touch A -----------------------------------");
		let dummy = A.name;
		eternity.flushToDatabase();
		
		assert.equal(isLoaded(persistent), false);
        assert.equal(isDead(persistent), true);
		
		// A becomes a unforgotten
		assert.equal(isLoaded(A), true);
		assert.equal(isDead(A), false);
		assert.equal(isUnforgotten(A), true);

		assert.equal(isLoaded(B), false);
		
		assert.equal(isLoaded(C), true);
		
		
		// log("--------------------------- Touch persistent -----------------------------------");
		let persistentA = persistent.A;
		eternity.flushToDatabase();
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);
		
		// Persistent becomes a unforgotten
		assert.equal(isLoaded(persistent), true);
        assert.equal(isDead(persistent), false);
		assert.equal(isUnforgotten(persistent), true);
		
		// A is still a unforgotten
		assert.equal(isLoaded(A), true);
		assert.equal(isDead(A), false);
		assert.equal(isUnforgotten(A), true);

		assert.equal(isLoaded(B), false);
		
		assert.equal(isLoaded(C), false);
		
		// Examine unforgotten properties 
		assert.equal(A === persistent.A, false);  // Equality without const does not work anymore, becuase one of them is a unforgotten. 
		assert.equal(A.const === persistent.A.const, true);
		
		// Persistent is also a unforgotten, but A.persistent refers to its non-unforgotten version. 
		logUnforgotten(A);
		logUnforgotten(persistent);
		assert.equal(A.persistent === persistent, false);  // Equality without const does not work anymore, becuase one of them is a unforgotten. 
		// log(A.persistent);
		// log(A.persistent.const);
		// log(persistent.const);
		assert.equal(A.persistent.const === persistent.const, true);
		
		// log("--------------------------- Touch B -----------------------------------");
		dummy = B.name;
		// log("--------------------------- Touch C -----------------------------------");
		// eternity.trace.basic++;
		dummy = C.name;
		eternity.flushToDatabase();
		// eternity.trace.basic--;
		// log("----------------------------------");
		
		// Persistent becomes a unforgotten
		assert.equal(isLoaded(persistent), false);
		assert.equal(isDead(persistent), true);
		// assert.equal(isUnforgotten(persistent), true);
		// log(unforgottenLevel(persistent));
		
		// A is still a unforgotten
		assert.equal(isLoaded(A), false);
		assert.equal(isDead(A), true);
		// assert.equal(isUnforgotten(A), true);
		// log(unforgottenLevel(A));

		assert.equal(isLoaded(B), true);
		assert.equal(isDead(B), false);
		assert.equal(isUnforgotten(B), true);
		// log(unforgottenLevel(B));
		
		assert.equal(isLoaded(C), true);
		assert.equal(isDead(C), false);
		assert.equal(isUnforgotten(C), true);
		
		// log("--------------------------- Touch A -----------------------------------");
		dummy = A.name;
		eternity.flushToDatabase();
		
		// Persistent becomes a unforgotten
		assert.equal(isLoaded(persistent), false);
		assert.equal(isDead(persistent), true);
		// log(unforgottenLevel(persistent));
		
		// A is still a unforgotten
		assert.equal(isLoaded(A), true);
		assert.equal(isDead(A), false);
		assert.equal(isUnforgotten(A), true);
		assert.equal(unforgottenLevel(A), 2);

		assert.equal(isLoaded(B), false);
		
		assert.equal(isLoaded(C), true);
		assert.equal(isDead(C), false);
		assert.equal(isUnforgotten(C), true);
	});
});


