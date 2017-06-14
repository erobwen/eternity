const assert = require('assert');
let eternity = require('../eternity');
// const log = console.log.bind(console);

// Neat logging
let objectlog = require('../objectlog.js');
let log = objectlog.log;
let logGroup = objectlog.enter;
let logUngroup = objectlog.exit;

// Tests based on mobx test/array.js
describe("basics", function () {
	it('should create persistent globals', function() {
		console.log("------------------------");
		eternity.persistent.foo = 42;
		log(eternity.mockMongoDB.getAllRecordsParsed(), 3);
		console.log("------------------------");
		assert.equal(42, eternity.persistent.foo);
		log(eternity.mockMongoDB.getAllRecordsParsed(), 3);
		console.log("------------------------");
		assert.equal(1, eternity.mockMongoDB.getRecordsCount());
		console.log("------------------------");
		assert.equal(42, eternity.mockMongoDB.getRecord(0).foo);
		
		eternity.unloadAllAndClearMemory();
		log("==================== CLEAR MEMORY ==========================");
		
		assert.equal(42, eternity.persistent.foo);		
		console.log("------------------------");
		eternity.clearDatabaseAndClearMemory();
		assert.equal(true, typeof(eternity.persistent.foo) === 'undefined');
	});
	
    it('should save refered objects, at once and later added', function () {
		// let x = eternity.create({});
		// let A = eternity.create({name: "A"});
		// x.A = A;
		// console.log(x.A);
		
		let A = eternity.create({name : 'A'});
		// console.log("=======");
		eternity.persistent.A = A;
		// eternity.persistent.x = 42;
		
		
		
		// console.log("=======");
		// assert.equal("A", eternity.persistent.A.name);
		// console.log("=======");
		log(eternity.mockMongoDB.getAllRecordsParsed(), 3);
		// console.log("=======");
		eternity.unloadAllAndClearMemory();
		log("==================== CLEAR MEMORY ==========================");
		log(eternity.persistent);
		log(eternity.persistent.A);
		log(eternity.persistent.A.name);
		A = eternity.persistent.A;
		log(eternity.persistent.A.const.target);
		console.log("=========================================");
		assert.equal("A", eternity.persistent.A.name);
		// // assert.notEqual(A, eternity.persistent.A); // Should now be a different eternity object... freshly loaded.

		// eternity.clearDatabaseAndClearMemory();
	});
	
	// it('should save changes in properties', function () {
	// });

	// it('should save refered object structures', function () {
	// });
	
    // it('should unload nodes as memory reaches limit, circluar path', function () {
	// });

    // it('should unload nodes as memory reaches limit, circluar infinite path', function () {
	// });

    // it('should handle zombie objects correctly', function () {
	// });	
	
    // it('should be possible to iterate all incoming', function () {
	// });	
	
    // it('should garbage collect persistent structures no longer reachable', function () {
	// });	  
	
	// it('should be possible to have persistent repeaters', function () {
	// });	
		
	// it('should be possible to have persistent cached calls', function () {
	// });	
});


