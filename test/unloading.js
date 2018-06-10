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
					result = typeof(object.const.isUnloaded) === 'undefined'; // log(object.const.initializer);
					// result = object.const.initializer === null;
					// log(object.name + " isLoaded: " + result);
				});
			});
			return result;
		}

        function isForgotten(object) {
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
						if (current.nonForwardConst.isUnforgotten) {
							result += 'unforgotten(id=' + current.nonForwardConst.id + ", name=" + current.nonForwardConst.target.name + "), ";
							current = current.nonForwardConst.forwardsTo;		
						} else {
							result += 'object(id=' + current.const.id + ", name= " + current.name + ")";
							current = null;
						}
					}
                });
            });
			log(result);
            // return result;
		}
		
		function logState()  {
			// eternity.logActivityList();
			log("isLoaded(persistent): " + isLoaded(persistent));
			log("isForgotten(persistent): " + isForgotten(persistent));
			log("isLoaded(A): " + isLoaded(A));
			log("isForgotten(A): " + isForgotten(A));
			log("isLoaded(B): " + isLoaded(B));
			log("isForgotten(B): " + isForgotten(B));
			log("isLoaded(C): " + isLoaded(C));
			log("isForgotten(C): " + isForgotten(C));
		}
		
		log("---------------------------------------------------------------------------------");
		// Start building a structure

		// Setup a starting point (name in const for easy debugging)
		let A = create({name: "A"});
		// log("-------------");
		// console.log(A.const.name);
		// A.const.name = "A";
		// log("-------------");

		let B = create({name: "B"});
		// log("-------------");
		// B.const.name = "B";
		// log("-------------");

		let C = create({name: "C"});
		// log("-------------");
		// C.const.name = "C";
		// log("-------------");

		// persistent.name = "persistent";
		// persistent.const.name = "Persistent"
		log("-------------");
		eternity.flushToDatabase();
		eternity.logActivityList();
		// return;
		log("---------------------------- persistent.A = A; ----------------------------------");
		persistent.A = A;
		eternity.flushToDatabase();
		eternity.logActivityList();
		// log(A.const);
		log("---------------------------- A.persistent = persistent; ----------------------------------");		
		A.persistent = persistent;
		eternity.flushToDatabase();
		eternity.logActivityList();
		
		// Exceed the memory limit (3 objects loaded is too much)
		log("---------------------------- A.B = B; ----------------------------------");
		A.B = B;
		eternity.flushToDatabase();
		eternity.logActivityList();
		// eternity.trace.activity = 0;
		// eternity.trace.basic = 0;
		// eternity.trace.unforget = 0;
		// eternity.trace.load = 0;
		// log()
		assert.equal(isLoaded(persistent), true);
		
		assert.equal(isLoaded(A), true);
		
		assert.equal(isLoaded(B), false);
        assert.equal(isForgotten(B), false);
		
		// Exceed the memory limit again, persistent and A no longer has any incoming references and will be forgeted
		log("--------------------------- B.C = C; -----------------------------------");
		eternity.trace.activity = 1;
		eternity.trace.basic = 1;
		eternity.trace.unforget = 1;
		eternity.trace.load = 1;
		B.C = C;
		eternity.flushToDatabase();
		eternity.logActivityList();
		log("done...");
		logState();
		return;

		// eternity.trace.basic++;
		// eternity.trace.basic--;
		// log("-----");
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);
		
		assert.equal(isLoaded(persistent), false);
        assert.equal(isForgotten(persistent), true);
		
		assert.equal(isLoaded(A), false);
        assert.equal(isForgotten(A), true);
		
		assert.equal(isLoaded(B), true);
		
		assert.equal(isLoaded(C), true);
		
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);
		log("--------------------------- Touch A.. -----------------------------------");
		let dummy = A.name;
		eternity.logActivityList();
		eternity.flushToDatabase();
		eternity.logActivityList();
		
		assert.equal(isLoaded(persistent), false);
        assert.equal(isForgotten(persistent), true);
		
		// A becomes a unforgotten
		assert.equal(isLoaded(A), true);
		assert.equal(isForgotten(A), false);
		assert.equal(isUnforgotten(A), true);

		assert.equal(isLoaded(B), false);
		
		assert.equal(isLoaded(C), true);
		
		
		log("--------------------------- Touch persistent -----------------------------------");
		let persistentA = persistent.A;
		eternity.logActivityList();
		eternity.flushToDatabase();
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);
		
		// Persistent becomes a unforgotten
		assert.equal(isLoaded(persistent), true);
        assert.equal(isForgotten(persistent), false);
		assert.equal(isUnforgotten(persistent), true);
		
		// A is still a unforgotten
		assert.equal(isLoaded(A), true);
		assert.equal(isForgotten(A), false);
		assert.equal(isUnforgotten(A), true);

		assert.equal(isLoaded(B), false);
		
		assert.equal(isLoaded(C), false);
		
		// Examine unforgotten properties 
		assert.equal(A === persistent.A, false);  // Equality without const does not work anymore, becuase one of them is a unforgotten. 
		// log(A.name);
		// log(persistent.A.name);
		logUnforgotten(A);
		logUnforgotten(persistent);
		logUnforgotten(persistent.A);
		// log("-----------------------------------------")
		assert.equal(A.name === persistent.A.name, true);
		assert.equal(A.const === persistent.A.const, true);
		
		// Persistent is also a unforgotten, but A.persistent refers to its non-unforgotten version. 
		assert.equal(A.persistent === persistent, false);  // Equality without const does not work anymore, becuase one of them is a unforgotten. 
		// log(A.persistent);
		// log(A.persistent.const);
		// log(persistent.const);
		
		assert.equal(A.persistent.const === persistent.const, true);
		log("--------------------------- Touch B -----------------------------------");
		dummy = B.name;
		eternity.logActivityList();
		log("--------------------------- Touch C -----------------------------------");
		// eternity.trace.basic++;
		dummy = C.name;
		return;
		eternity.logActivityList();
		log("----------------");
		eternity.flushToDatabase();
		// eternity.trace.basic--;
		log("----------------------------------");
		
		// Persistent becomes a unforgotten
		assert.equal(isLoaded(persistent), false);
		assert.equal(isForgotten(persistent), true);
		// assert.equal(isUnforgotten(persistent), true);
		// log(unforgottenLevel(persistent));
		
		// A is still a unforgotten
		assert.equal(isLoaded(A), false);
		assert.equal(isForgotten(A), true);
		// assert.equal(isUnforgotten(A), true);
		// log(unforgottenLevel(A));
		eternity.logActivityList();

		assert.equal(isLoaded(B), true);
		assert.equal(isForgotten(B), false);
		assert.equal(isUnforgotten(B), true);
		// log(unforgottenLevel(B));
		
		assert.equal(isLoaded(C), true);
		assert.equal(isForgotten(C), false);
		assert.equal(isUnforgotten(C), true);
		
		// log("--------------------------- Touch A -----------------------------------");
		eternity.logActivityList();
		dummy = A.name;
		eternity.logActivityList();
		eternity.flushToDatabase();
		
		// Persistent becomes a unforgotten
		assert.equal(isLoaded(persistent), false);
		assert.equal(isForgotten(persistent), true);
		// log(unforgottenLevel(persistent));
		
		// A is still a unforgotten
		assert.equal(isLoaded(A), true);
		assert.equal(isForgotten(A), false);
		assert.equal(isUnforgotten(A), true);
		assert.equal(unforgottenLevel(A), 2);

		assert.equal(isLoaded(B), false);
		
		assert.equal(isLoaded(C), true);
		assert.equal(isForgotten(C), false);
		assert.equal(isUnforgotten(C), true);
	});
});


