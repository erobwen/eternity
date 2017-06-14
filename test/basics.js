const assert = require('assert');
let eternity = require('../eternity');
let create = eternity.create;
let persistent = eternity.persistent;
// const log = console.log.bind(console);

// Neat logging
let objectlog = require('../objectlog.js');
let log = objectlog.log;
let logGroup = objectlog.enter;
let logUngroup = objectlog.exit;

// Tests based on mobx test/array.js
describe("basics", function () {
	// it('should create persistent globals', function() {
		// persistent.foo = 42;
		// assert.equal(42, persistent.foo);
		// assert.equal(1, eternity.mockMongoDB.getRecordsCount());
		// assert.equal(42, eternity.mockMongoDB.getRecord(0).foo);

		// eternity.unloadAllAndClearMemory();
		
		// assert.equal(42, persistent.foo);		
		// eternity.clearDatabaseAndClearMemory();
		// assert.equal(true, typeof(persistent.foo) === 'undefined');
	// });
	
    it('should save refered objects, at once and later added', function () {
		let A = create({name : 'A'});
		persistent.A = A;
		
		log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	
		eternity.unloadAllAndClearMemory();

		assert.notEqual(A, persistent.A); // Should now be a different eternity object... freshly loaded.
		A = persistent.A;
		assert.equal("A", persistent.A.name);
		eternity.clearDatabaseAndClearMemory();
	});
	
    // it('should save refered objects, at once and later added', function () {
		// let A = create({name : 'A'});
		// let B = create({name : 'B'});
		// B.bitsAndPieces = 256;
		// A.B = B;
		// persistent.A = A;
		
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	
		
		// eternity.unloadAllAndClearMemory();
		
		// // log("==================== CLEAR MEMORY ==========================");
		
		// assert.equal(256, persistent.A.B.bitsAndPieces);

		// eternity.clearDatabaseAndClearMemory();
	// });
	
	// it('should save refered objects, at once and later added', function () {
		// let A = create({name : 'A'});
		// // let B = create({name : 'B'});
		// // B.bitsAndPieces = 256;
		// persistent.A = A;
		// // A.B = B;	
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	
		
		// // eternity.unloadAllAndClearMemory();
		
		// // log("==================== CLEAR MEMORY ==========================");
		
		// // assert.equal(256, persistent.A.B.bitsAndPieces);

		// eternity.clearDatabaseAndClearMemory(); // TODO: Cannot run in sequence with unloadAllAndClearMemory
	// });
	
    // it('should save refered objects, at once and later added', function () {
		// let A = create({name : 'A'});
		// persistent.A = A;
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	
		// log("------------------------");
		// let B = create();
		// B.name = "B";
		// B.bitsAndPieces = 256;
		// A.B = B;
		// log(eternity.mockMongoDB.getAllRecordsParsed(), 3);	
		// log("------------------------");
		
		// eternity.unloadAllAndClearMemory();
		// log("==================== CLEAR MEMORY ==========================");
		
		// assert.equal(256, persistent.A.B.bitsAndPieces);

		// eternity.clearDatabaseAndClearMemory();

	// });
	
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


