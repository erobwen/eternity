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

        function isKilled(object) {
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
                    result = typeof(object.const.isZombie) !== 'undefined';
                    // log(object.name + " isLoaded: " + result);
                });
            });
            return result;
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
		
		// Exceed the memory limit (3 objects loaded is too much)
		log("---------------------------- A.B = B; ----------------------------------");
		A.B = B;
		assert.equal(isLoaded(persistent), false);
        assert.equal(isKilled(persistent), false);
		
		assert.equal(isLoaded(A), true);
		
		assert.equal(isLoaded(B), true);
		
		// Exceed the memory limit again, persistent and A no longer has any incoming references and will be killed
		log("--------------------------- B.C = C; -----------------------------------");
		B.C = C;
		assert.equal(isLoaded(persistent), false);
        assert.equal(isKilled(persistent), true);
		
		assert.equal(isLoaded(A), false);
        assert.equal(isKilled(A), true);
		
		assert.equal(isLoaded(B), true);
		
		assert.equal(isLoaded(C), true);
		
		// log("--------------------------- Toch A -----------------------------------");
		// // let dummy = A.name;
		// // // log(A.name);
		// // // log(A.name);
		// // // log("---------------------------------------");
		
		// // // Persistent should be unloaded
		// // assert.equal(isLoaded(persistent), false);
		// // assert.equal(isLoaded(A), true);
		// // assert.equal(isLoaded(B), false);
		// // assert.equal(isLoaded(C), true);
	});

    // it('should unload nodes as memory reaches limit, circluar infinite path', function () {
	// });

    // it('should handle zombie objects correctly', function () {
	// });	
	
	
});


